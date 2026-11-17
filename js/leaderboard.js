/**
 * One run's session with the leaderboard server: the state, the HMAC proof
 * chain and the submit. A board is the id the server knows (a leg id, or a
 * world stage or tour id), so several sessions can be open at once.
 *
 * Times are recorded at once and proofs are signed once the token is known,
 * so a startRun reply that comes late loses no gate. The proof strings are
 * the ones the leg client has always sent: `${boardId}:${index}:${time}:${prev}`
 * and `${boardId}:F:${time}:${restarts}:${last}`.
 */
class RunSession {
    constructor(functions, getFingerprint) {
        this.functions = functions;
        this.getFingerprint = getFingerprint;
        this.sessionId = null;
        this.sessionToken = null;
        this.currentLegId = null;
        this.checkpointTimes = [];
        this.checkpointIndices = [];
        this.proofChain = [];
        // What the leg built and the server states must agree on before any
        // time is sent. protocol 1 is a board on the shared course (5 gates,
        // the last gate time ranks); protocol 2 is a converted leg (the
        // finish-line time ranks, with its restart count).
        this.protocol = 1;
        this.gates = 5;
        this.restarts = 0;
        this.pendingFinish = null;
        this.finishTime = null;
        this.finishProof = null;
        // The name limit the server stated; null for a server that states none
        this.nameMax = null;
        // The server cannot take this leg's runs: no name form, no submit
        this.unsupported = false;
        // A startRun call is in flight: times are kept and signed on the reply
        this.starting = false;
        this.recordQueue = Promise.resolve();
    }

    /**
     * Start a new run session.
     * expected is what the leg built: { protocol, gates }. The session is
     * kept only when the server states the same protocol and gate count; a
     * reply without the fields is a server that knows no long boards
     * (protocol 1, 5 gates). Otherwise the run is not submittable: nothing is
     * sent, and the time stays on the device.
     */
    async start(boardId, expected = { protocol: 1, gates: 5 }) {
        this.unsupported = false;
        this.clear();
        this.currentLegId = boardId;
        this.starting = true;
        try {
            const deviceFingerprint = await this.getFingerprint();

            const result = await this.functions.httpsCallable('startRun')({
                legId: boardId,
                deviceFingerprint
            });

            const protocol = result.data.protocol ?? 1;
            const gates = result.data.gates ?? 5;
            if (protocol !== expected.protocol || gates !== expected.gates) {
                this.cancel();
                this.unsupported = true;
                console.warn(`Online board for ${boardId} is not open: server states protocol ${protocol} with ${gates} gates, the leg has protocol ${expected.protocol} with ${expected.gates}`);
                return { error: 'not-submitted', message: 'The online board for this leg is not open yet' };
            }

            this.sessionId = result.data.sessionId;
            this.sessionToken = result.data.sessionToken;
            this.protocol = protocol;
            this.gates = gates;
            const stated = result.data.nameMax;
            this.nameMax = Number.isInteger(stated) && stated >= 1 && stated <= 16 ? stated : null;
            this.starting = false;

            // Gates recorded while the reply was in flight sign now, in order
            this.recordQueue = this.recordQueue.then(() => this.signPending());
            await this.recordQueue;

            console.log(`Leaderboard session started: ${this.sessionId}`);
            return true;
        } catch (error) {
            this.clear();
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
     * Sign every recorded time that has no proof yet, then the finish. Each
     * proof chains on the previous one, so this runs only through the queue
     * (and once more at submit). Without a token nothing is signed and the
     * times wait.
     */
    async signPending() {
        if (!this.sessionToken) return;

        while (this.proofChain.length < this.checkpointTimes.length) {
            const at = this.proofChain.length;
            const previousHash = at > 0 ? this.proofChain[at - 1] : '';
            const proof = await this.generateProof(this.checkpointIndices[at], this.checkpointTimes[at], previousHash);
            this.proofChain.push(proof);
            console.log(`Checkpoint ${this.checkpointIndices[at]} recorded: ${this.checkpointTimes[at]}ms, proof: ${proof.substring(0, 8)}...`);
        }

        if (this.protocol === 2 && this.pendingFinish !== null && this.finishProof === null) {
            const time = this.pendingFinish;
            const previousHash = this.proofChain.length > 0 ? this.proofChain[this.proofChain.length - 1] : '';
            this.finishProof = await this.sign(`${this.currentLegId}:F:${time}:${this.restarts}:${previousHash}`);
            this.finishTime = time;
            console.log(`Finish recorded: ${time}ms, ${this.restarts} restarts`);
        }
    }

    /**
     * Record a checkpoint pass.
     * Recordings are serialized through a promise queue: each proof chains on
     * the previous proof's hash, so two in-flight recordings reading the same
     * previousHash would break the HMAC chain and get the run flagged.
     */
    recordCheckpoint(checkpointIndex, time) {
        this.recordQueue = this.recordQueue.then(async () => {
            if (!this.starting && !this.isActive()) {
                console.warn('No active leaderboard session');
                return;
            }

            this.checkpointTimes.push(time);
            this.checkpointIndices.push(checkpointIndex);
            await this.signPending();
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
        if (this.starting || this.isActive()) this.restarts++;
    }

    /**
     * Record the finish line time (protocol 2). It joins the same queue as
     * the gates, so it signs after the last gate's proof whatever the timing.
     * While the reply is in flight the protocol is not known yet, so the time
     * is kept and dropped on the reply if the board is not protocol 2.
     */
    recordFinish(time) {
        this.recordQueue = this.recordQueue.then(async () => {
            if (!this.starting && !(this.isActive() && this.protocol === 2)) return;
            this.pendingFinish = time;
            await this.signPending();
        });
        return this.recordQueue;
    }

    /**
     * The name length the form and submit enforce. A server that states
     * nameMax takes 1..nameMax; one that does not still demands exactly 4.
     */
    nameRule() {
        return this.nameMax === null ? { min: 4, max: 4 } : { min: 1, max: this.nameMax };
    }

    /**
     * Submit completed run
     */
    async submit(playerName) {
        if (this.unsupported) {
            return { success: false, state: 'not-submitted' };
        }
        if (!this.isActive()) {
            console.error('No active leaderboard session');
            return { success: false, error: 'No active session' };
        }

        // Proofs still being signed belong to this run
        await this.recordQueue;
        await this.signPending();

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
        const name = typeof playerName === 'string' ? playerName.trim() : '';
        const rule = this.nameRule();
        if (name.length < rule.min || name.length > rule.max) {
            const words = rule.min === rule.max ? `exactly ${rule.max}` : `${rule.min} to ${rule.max}`;
            return { success: false, error: `Player name must be ${words} characters`, code: 'invalid-name' };
        }

        try {
            const payload = {
                sessionId: this.sessionId,
                playerName: name.toUpperCase(),
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

            this.clear();

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
     * Check if the session is running
     */
    isActive() {
        return this.sessionId !== null && this.sessionToken !== null;
    }

    /**
     * Cancel current session
     */
    cancel() {
        this.clear();
        console.log('Leaderboard session cancelled');
    }

    clear() {
        this.sessionId = null;
        this.sessionToken = null;
        this.currentLegId = null;
        this.checkpointTimes = [];
        this.checkpointIndices = [];
        this.proofChain = [];
        this.protocol = 1;
        this.gates = 5;
        this.restarts = 0;
        this.pendingFinish = null;
        this.finishTime = null;
        this.finishProof = null;
        this.nameMax = null;
        this.starting = false;
    }

    /**
     * What a saved ride needs to pick the session up again. The unsupported
     * flag is kept so a board the server never opened stays not-submitted.
     */
    toJSON() {
        return {
            boardId: this.currentLegId,
            sessionId: this.sessionId,
            sessionToken: this.sessionToken,
            protocol: this.protocol,
            gates: this.gates,
            nameMax: this.nameMax,
            checkpointTimes: this.checkpointTimes,
            checkpointIndices: this.checkpointIndices,
            proofChain: this.proofChain,
            restarts: this.restarts,
            pendingFinish: this.pendingFinish,
            finishTime: this.finishTime,
            finishProof: this.finishProof,
            unsupported: this.unsupported
        };
    }

    static fromJSON(data, functions, getFingerprint) {
        const session = new RunSession(functions, getFingerprint);
        session.currentLegId = data.boardId;
        session.sessionId = data.sessionId;
        session.sessionToken = data.sessionToken;
        session.protocol = data.protocol;
        session.gates = data.gates;
        session.nameMax = data.nameMax;
        session.checkpointTimes = [...data.checkpointTimes];
        session.checkpointIndices = [...data.checkpointIndices];
        session.proofChain = [...data.proofChain];
        session.restarts = data.restarts;
        session.pendingFinish = data.pendingFinish;
        session.finishTime = data.finishTime;
        session.finishProof = data.finishProof;
        session.unsupported = data.unsupported;
        return session;
    }
}

// The session state a leg call site or a test reads and writes on the service
const SESSION_FIELDS = [
    'sessionId', 'sessionToken', 'currentLegId', 'checkpointTimes', 'proofChain',
    'protocol', 'gates', 'restarts', 'finishTime', 'finishProof', 'nameMax',
    'unsupported', 'recordQueue'
];

/**
 * Leaderboard Service
 * Handles leaderboard submissions with cryptographic anti-cheat.
 * A facade over one default RunSession, so the leg call sites stay as they
 * are; openSession gives the world its own sessions.
 */
class LeaderboardService {
    constructor(firebaseFunctions) {
        this.functions = firebaseFunctions;
        this.deviceFingerprint = null;
        this.session = this.openSession();
    }

    /**
     * A new session that shares this service's functions and fingerprint.
     * With a board it starts at once and returns before the reply: times
     * recorded in the meantime are signed when it arrives, and session.ready
     * settles with the start result.
     */
    openSession(boardId, expected) {
        const session = new RunSession(this.functions, () => this.generateDeviceFingerprint());
        if (boardId !== undefined) session.ready = session.start(boardId, expected);
        return session;
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

    startRun(legId, expected) {
        return this.session.start(legId, expected);
    }

    sign(data) {
        return this.session.sign(data);
    }

    generateProof(checkpointIndex, time, previousHash) {
        return this.session.generateProof(checkpointIndex, time, previousHash);
    }

    recordCheckpoint(checkpointIndex, time) {
        return this.session.recordCheckpoint(checkpointIndex, time);
    }

    recordRestart() {
        this.session.recordRestart();
    }

    recordFinish(time) {
        return this.session.recordFinish(time);
    }

    nameRule() {
        return this.session.nameRule();
    }

    submitRun(playerName) {
        return this.session.submit(playerName);
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
        return this.session.isActive();
    }

    /**
     * Cancel current session
     */
    cancelSession() {
        this.session.cancel();
    }

    clearSession() {
        this.session.clear();
    }
}

for (const field of SESSION_FIELDS) {
    Object.defineProperty(LeaderboardService.prototype, field, {
        get() { return this.session[field]; },
        set(value) { this.session[field] = value; }
    });
}
