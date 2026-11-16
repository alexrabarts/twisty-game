/**
 * Leaderboard Service
 * Handles leaderboard submissions with cryptographic anti-cheat
 */
class LeaderboardService {
    constructor(firebaseFunctions) {
        this.functions = firebaseFunctions;
        this.sessionId = null;
        this.sessionToken = null;
        this.currentLegId = null;
        this.checkpointTimes = [];
        this.proofChain = [];
        this.deviceFingerprint = null;
        // What the leg built and the server states must agree on before any
        // time is sent. protocol 1 is a board on the shared course (5 gates,
        // the last gate time ranks); protocol 2 is a converted leg (the
        // finish-line time ranks, with its restart count).
        this.protocol = 1;
        this.gates = 5;
        this.restarts = 0;
        this.finishTime = null;
        this.finishProof = null;
        // The server cannot take this leg's runs: no name form, no submit
        this.unsupported = false;
    }

    /**
     * Generate device fingerprint
     * Combines multiple browser characteristics to create a unique identifier
     */
    async generateDeviceFingerprint() {
        if (this.deviceFingerprint) {
            return this.deviceFingerprint;
        }

        const components = [];

        // Canvas fingerprinting
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            ctx.textBaseline = 'top';
            ctx.font = '14px Arial';
            ctx.fillStyle = '#f60';
            ctx.fillRect(125, 1, 62, 20);
            ctx.fillStyle = '#069';
            ctx.fillText('Twisty Game', 2, 15);
            components.push(canvas.toDataURL());
        } catch (e) {
            components.push('canvas-error');
        }

        // WebGL fingerprinting
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (gl) {
                const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                if (debugInfo) {
                    components.push(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL));
                    components.push(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL));
                }
            }
        } catch (e) {
            components.push('webgl-error');
        }

        // Browser characteristics
        components.push(navigator.userAgent);
        components.push(navigator.language);
        components.push(screen.colorDepth);
        components.push(screen.width + 'x' + screen.height);
        components.push(new Date().getTimezoneOffset());
        components.push(navigator.hardwareConcurrency || 'unknown');
        components.push(navigator.platform);

        // Hash all components together
        const fingerprintData = components.join('|');
        const encoder = new TextEncoder();
        const data = encoder.encode(fingerprintData);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        this.deviceFingerprint = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        return this.deviceFingerprint;
    }

    /**
     * Start a new run session.
     * expected is what the leg built: { protocol, gates }. The session is
     * kept only when the server states the same protocol and gate count; a
     * reply without the fields is a server that knows no long boards
     * (protocol 1, 5 gates). Otherwise the run is not submittable: nothing is
     * sent, and the time stays on the device.
     */
    async startRun(legId, expected = { protocol: 1, gates: 5 }) {
        this.unsupported = false;
        try {
            const deviceFingerprint = await this.generateDeviceFingerprint();

            const result = await this.functions.httpsCallable('startRun')({
                legId,
                deviceFingerprint
            });

            const protocol = result.data.protocol ?? 1;
            const gates = result.data.gates ?? 5;
            if (protocol !== expected.protocol || gates !== expected.gates) {
                this.cancelSession();
                this.unsupported = true;
                console.warn(`Online board for ${legId} is not open: server states protocol ${protocol} with ${gates} gates, the leg has protocol ${expected.protocol} with ${expected.gates}`);
                return { error: 'not-submitted', message: 'The online board for this leg is not open yet' };
            }

            this.sessionId = result.data.sessionId;
            this.sessionToken = result.data.sessionToken;
            this.currentLegId = legId;
            this.protocol = protocol;
            this.gates = gates;
            this.checkpointTimes = [];
            this.proofChain = [];
            this.restarts = 0;
            this.finishTime = null;
            this.finishProof = null;

            console.log(`Leaderboard session started: ${this.sessionId}`);
            return true;
        } catch (error) {
            console.error('Failed to start leaderboard run:', error);
            if (error.code === 'resource-exhausted') {
                // Rate limited
                return { error: 'rate-limited', message: error.message };
            }
            return { error: 'failed', message: error.message };
        }
    }

    /**
     * HMAC-SHA256 of data, keyed with the session token
     */
    async sign(data) {
        // Key with the token string's UTF-8 bytes - the server validates with
        // Node's createHmac('sha256', sessionToken), which uses the hex STRING
        // as the key, not its decoded bytes. (Decoding to raw bytes here made
        // every client proof invalid server-side.)
        const keyEncoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
            'raw',
            keyEncoder.encode(this.sessionToken),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );

        const encoder = new TextEncoder();
        const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));

        const hashArray = Array.from(new Uint8Array(signature));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    /**
     * Generate HMAC proof for a checkpoint
     */
    async generateProof(checkpointIndex, time, previousHash) {
        // Build data string: legId:index:time:previousHash
        return this.sign(`${this.currentLegId}:${checkpointIndex}:${time}:${previousHash}`);
    }

    /**
     * Record a checkpoint pass.
     * Recordings are serialized through a promise queue: each proof chains on
     * the previous proof's hash, so two in-flight recordings reading the same
     * previousHash would break the HMAC chain and get the run flagged.
     */
    recordCheckpoint(checkpointIndex, time) {
        this.recordQueue = (this.recordQueue || Promise.resolve()).then(async () => {
            if (!this.sessionId || !this.sessionToken) {
                console.warn('No active leaderboard session');
                return;
            }

            // Get previous hash (empty string for first checkpoint)
            const previousHash = this.proofChain.length > 0
                ? this.proofChain[this.proofChain.length - 1]
                : '';

            // Generate proof
            const proof = await this.generateProof(checkpointIndex, time, previousHash);

            // Store checkpoint time and proof
            this.checkpointTimes.push(time);
            this.proofChain.push(proof);

            console.log(`Checkpoint ${checkpointIndex} recorded: ${time}ms, proof: ${proof.substring(0, 8)}...`);
        });
        return this.recordQueue;
    }

    /**
     * A restart from a save checkpoint. The run stays valid: the 5 s penalty
     * is already in every later signed time, and the count is signed with the
     * finish. It is self-reported, which is safe because the server's floor
     * rises with it, so a lower count never helps.
     */
    recordRestart() {
        if (this.isActive()) this.restarts++;
    }

    /**
     * Record the finish line time (protocol 2). It joins the same queue as
     * the gates, so it signs after the last gate's proof whatever the timing.
     */
    recordFinish(time) {
        this.recordQueue = (this.recordQueue || Promise.resolve()).then(async () => {
            if (!this.sessionId || !this.sessionToken || this.protocol !== 2) return;
            const previousHash = this.proofChain.length > 0 ? this.proofChain[this.proofChain.length - 1] : '';
            this.finishProof = await this.sign(`${this.currentLegId}:F:${time}:${this.restarts}:${previousHash}`);
            this.finishTime = time;
            console.log(`Finish recorded: ${time}ms, ${this.restarts} restarts`);
        });
        return this.recordQueue;
    }

    /**
     * Submit completed run
     */
    async submitRun(playerName) {
        if (this.unsupported) {
            return { success: false, state: 'not-submitted' };
        }
        if (!this.sessionId || !this.sessionToken) {
            console.error('No active leaderboard session');
            return { success: false, error: 'No active session' };
        }

        // Proofs still being signed belong to this run
        await this.recordQueue;

        // The gate count is the one the server stated when the session started
        if (this.checkpointTimes.length !== this.gates || this.proofChain.length !== this.gates) {
            console.error(`Incomplete run: ${this.checkpointTimes.length} checkpoints`);
            return { success: false, error: 'Incomplete run' };
        }
        if (this.protocol === 2) {
            if (this.finishProof === null) {
                console.error('Incomplete run: no finish time');
                return { success: false, error: 'Incomplete run' };
            }
        }

        // Validate player name
        if (!playerName || playerName.length !== 4) {
            return { success: false, error: 'Player name must be exactly 4 characters' };
        }

        try {
            const payload = {
                sessionId: this.sessionId,
                playerName: playerName.toUpperCase(),
                checkpointTimes: this.checkpointTimes,
                proofChain: this.proofChain
            };
            if (this.protocol === 2) {
                payload.finishTime = this.finishTime;
                payload.finishProof = this.finishProof;
                payload.restarts = this.restarts;
            }
            const result = await this.functions.httpsCallable('submitRun')(payload);

            console.log(`Run submitted successfully! Rank: ${result.data.rank}, Flagged: ${result.data.flagged}`);

            this.clearSession();

            return {
                success: true,
                state: 'submitted',
                rank: result.data.rank,
                flagged: result.data.flagged,
                entryId: result.data.entryId
            };
        } catch (error) {
            console.error('Failed to submit run:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Fetch leaderboard for a leg
     */
    async fetchLeaderboard(legId, limit = 10) {
        try {
            const result = await this.functions.httpsCallable('getLeaderboard')({
                legId,
                limit
            });

            return {
                success: true,
                entries: result.data.entries
            };
        } catch (error) {
            console.error('Failed to fetch leaderboard:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Format time for display
     */
    static formatTime(milliseconds) {
        const totalSeconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        const ms = Math.floor(milliseconds % 1000);
        return `${minutes}:${seconds.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
    }

    /**
     * Check if leaderboard is active (session running)
     */
    isActive() {
        return this.sessionId !== null && this.sessionToken !== null;
    }

    /**
     * Cancel current session
     */
    cancelSession() {
        this.clearSession();
        console.log('Leaderboard session cancelled');
    }

    clearSession() {
        this.sessionId = null;
        this.sessionToken = null;
        this.currentLegId = null;
        this.checkpointTimes = [];
        this.proofChain = [];
        this.protocol = 1;
        this.gates = 5;
        this.restarts = 0;
        this.finishTime = null;
        this.finishProof = null;
    }
}
