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
     * Start a new run session
     */
    async startRun(legId) {
        try {
            const deviceFingerprint = await this.generateDeviceFingerprint();

            const result = await this.functions.httpsCallable('startRun')({
                legId,
                deviceFingerprint
            });

            this.sessionId = result.data.sessionId;
            this.sessionToken = result.data.sessionToken;
            this.currentLegId = legId;
            this.checkpointTimes = [];
            this.proofChain = [];

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
     * Generate HMAC proof for a checkpoint
     */
    async generateProof(checkpointIndex, time, previousHash) {
        // Build data string: legId:index:time:previousHash
        const data = `${this.currentLegId}:${checkpointIndex}:${time}:${previousHash}`;

        // Convert session token (hex string) to Uint8Array
        const tokenBytes = new Uint8Array(this.sessionToken.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

        // Import key for HMAC
        const key = await crypto.subtle.importKey(
            'raw',
            tokenBytes,
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );

        // Generate HMAC
        const encoder = new TextEncoder();
        const dataBytes = encoder.encode(data);
        const signature = await crypto.subtle.sign('HMAC', key, dataBytes);

        // Convert to hex string
        const hashArray = Array.from(new Uint8Array(signature));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
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
     * Submit completed run
     */
    async submitRun(playerName) {
        if (!this.sessionId || !this.sessionToken) {
            console.error('No active leaderboard session');
            return { success: false, error: 'No active session' };
        }

        if (this.checkpointTimes.length !== 10 || this.proofChain.length !== 10) {
            console.error(`Incomplete run: ${this.checkpointTimes.length} checkpoints`);
            return { success: false, error: 'Incomplete run' };
        }

        // Validate player name
        if (!playerName || playerName.length !== 4) {
            return { success: false, error: 'Player name must be exactly 4 characters' };
        }

        try {
            const result = await this.functions.httpsCallable('submitRun')({
                sessionId: this.sessionId,
                playerName: playerName.toUpperCase(),
                checkpointTimes: this.checkpointTimes,
                proofChain: this.proofChain
            });

            console.log(`Run submitted successfully! Rank: ${result.data.rank}, Flagged: ${result.data.flagged}`);

            // Clear session data
            this.sessionId = null;
            this.sessionToken = null;
            this.currentLegId = null;
            this.checkpointTimes = [];
            this.proofChain = [];

            return {
                success: true,
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
        const ms = milliseconds % 1000;
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
        this.sessionId = null;
        this.sessionToken = null;
        this.currentLegId = null;
        this.checkpointTimes = [];
        this.proofChain = [];
        console.log('Leaderboard session cancelled');
    }
}
