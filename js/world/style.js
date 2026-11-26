// The style ride of free roam: with no clock, the wheelie and the style score are the game. Each wheelie is measured
// as it ends (the metres the bike rode on its back wheel, the seconds, the highest angle) and called out; the best
// wheelie and the best style score of this world are kept in this browser between rides (localStorage, per world),
// and the HUD shows them (`#hudStyleBest`). The style score itself is the game's (Game.addScore: wheelies, jumps).
// A wheelie under MIN_M is not called out: a pop that comes straight back down is not one.
class RoamStyle {
    static get MIN_M() { return 5; }
    static get KEY() { return 'twistyRoamStyle'; }

    constructor(worldId, store = null) {
        this.store = store;
        this.key = `${RoamStyle.KEY}:${worldId || 'world'}`;
        this.best = { wheelieM: 0, wheelieS: 0, score: 0 };
        try {
            const saved = this.store ? JSON.parse(this.store.getItem(this.key) || 'null') : null;
            if (saved && typeof saved === 'object') {
                for (const k of Object.keys(this.best)) if (Number.isFinite(saved[k])) this.best[k] = saved[k];
            }
        } catch (error) {
            console.warn('Style: the saved bests could not be read', error);
        }
        this.run = null;
        this.last = null;
    }

    // Each frame: `bike` {isWheelie, wheelieAngle, position, crashed}, `score` the style score now. Returns a finished
    // wheelie ({m, s, deg, best}) on the frame it ends, else null. A wheelie that ends in a crash is not counted
    step(bike, score, dt) {
        let done = null;
        if (bike.isWheelie && !bike.crashed) {
            if (!this.run) this.run = { m: 0, s: 0, deg: 0, x: bike.position.x, z: bike.position.z };
            const run = this.run;
            run.m += Math.hypot(bike.position.x - run.x, bike.position.z - run.z);
            run.x = bike.position.x;
            run.z = bike.position.z;
            run.s += dt;
            run.deg = Math.max(run.deg, (bike.wheelieAngle || 0) * 180 / Math.PI);
        } else if (this.run) {
            const run = this.run;
            this.run = null;
            if (!bike.crashed && run.m >= RoamStyle.MIN_M) {
                const best = run.m > this.best.wheelieM;
                if (best) {
                    this.best.wheelieM = run.m;
                    this.best.wheelieS = run.s;
                }
                done = this.last = { m: run.m, s: run.s, deg: run.deg, best };
            }
        }
        if (Number.isFinite(score) && score > this.best.score) this.best.score = score;
        if (done || this.dirty(score)) this.save();
        return done;
    }

    // (the score's best is saved when it has grown by a tenth, or more than 100, since the last save)
    dirty(score) {
        if (!Number.isFinite(score) || score <= (this.savedScore || 0)) return false;
        if (score - (this.savedScore || 0) < Math.max(100, (this.savedScore || 0) * 0.1)) return false;
        return true;
    }

    save() {
        this.savedScore = this.best.score;
        if (!this.store) return;
        try {
            this.store.setItem(this.key, JSON.stringify(this.best));
        } catch (error) {
            console.warn('Style: the bests could not be saved', error);
        }
    }

    // The call-out for a finished wheelie (British English)
    static callout(done) {
        return `${done.best ? 'Best wheelie! ' : 'Wheelie '}${Math.round(done.m)} m, ${done.s.toFixed(1)} s`;
    }

    // The HUD's line
    text() {
        const parts = [];
        if (this.best.wheelieM > 0) parts.push(`Best wheelie ${Math.round(this.best.wheelieM)} m`);
        parts.push(`Best style ${Math.round(this.best.score).toLocaleString('en-GB')}`);
        return parts.join(' · ');
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { RoamStyle };
