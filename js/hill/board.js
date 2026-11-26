// HillBoard: the hill ride's time and its online board. No THREE and no DOM, so the node harness runs it.
//
// The clock starts when the bicycle rolls off the opening hold (the player pedals; the bicycle never starts by itself)
// and stops at the finish line, the point on the last left where the camera stops and the ending begins
// (HillLane.RULE.end.stopS). It counts physics time, one step at a time, so a slow frame or a hidden tab changes
// nothing. Nothing shows it during the ride: the time appears only on the end card.
//
// A fall (the in-place restart) adds PENALTY_MS to the clock and counts as a restart, as a restart does on a world
// ride. R starts the ride and the clock again from the top. The gates are timing lines down the course; the server
// holds each part between them to the limits of row(), which functions/hill-courses.json copies
// (tests/unit/hill-board.test.js holds the two equal).
class HillBoard {
    // The board's id on the server: a neutral name, never the ride's address key
    static get ID() { return 'village-hill-v1'; }

    // The gates down the course, as s on the lane (m): on the main straight, past the left curve before the steep part,
    // and before the sharp right
    static get GATES_S() { return Object.freeze([120, 230, 340]); }

    // The limits of a part of the course. fastMs: no honest bicycle averages more over a part (the fastest test ride
    // tops out near 22.5 m/s); slowMs: a part ridden slower than this is not a ride. restartMs is what each restart
    // adds to every part's ceiling (the penalty and the stand-up). penaltyMs is the clock's cost of a fall. jumpM is the
    // most the bicycle can move along the lane in one step: more is a place set by a tool, and the ride is not timed
    static get LIMITS() { return Object.freeze({ fastMs: 30, slowMs: 0.5, restartMs: 15000, penaltyMs: 5000, jumpM: 2 }); }

    // The finish line: where the ending begins
    static finishS(lane) {
        return lane.rule.end.stopS;
    }

    // What the session must agree on with the server before any time is sent (RunSession.start)
    static expected() {
        return { protocol: 2, gates: HillBoard.GATES_S.length };
    }

    // The server's row for this board: the length of each part (the start to the first gate, gate to gate, the last
    // gate to the finish) and its least and most time
    static row(lane) {
        const L = HillBoard.LIMITS;
        const lines = [lane.rule.startM, ...HillBoard.GATES_S, HillBoard.finishS(lane)];
        const metres = lines.slice(1).map((s, i) => Math.round(s - lines[i]));
        return {
            kind: 'hill',
            gates: HillBoard.GATES_S.length,
            metres,
            gateFloorsMs: metres.map(m => Math.floor(m / L.fastMs * 1000)),
            gateCeilsMs: metres.map(m => Math.ceil(m / L.slowMs * 1000)),
            restartMs: L.restartMs,
            penaltyMs: L.penaltyMs
        };
    }

    // A time as the end card shows it: m:ss.mmm
    static format(ms) {
        const total = Math.max(0, Math.round(ms));
        const minutes = Math.floor(total / 60000), seconds = Math.floor(total / 1000) % 60, rest = total % 1000;
        return `${minutes}:${String(seconds).padStart(2, '0')}.${String(rest).padStart(3, '0')}`;
    }

    // Whether a time from this page may go to the board: never in debug mode, from a tuned ride or from test data
    // (`?worldData`), as on a world ride
    static allowed(search, tuned) {
        const params = new URLSearchParams(search || '');
        return !params.has('debug') && !params.has('worldData') && !tuned;
    }

    constructor(lane) {
        this.lane = lane;
        this.reset();
    }

    // Back to the top: no clock running
    reset() {
        this.state = 'waiting';
        this.ms = 0;
        this.next = 0;
        this.times = [];
        this.restarts = 0;
        this.finishMs = null;
        this.lastS = null;
        // A ride a tool moved, or one that became untrusted, is still shown but is never sent
        this.trusted = true;
    }

    // The bicycle rolls off at s: the clock starts
    begin(s) {
        this.reset();
        this.state = 'running';
        this.lastS = s;
    }

    get running() { return this.state === 'running'; }
    get finished() { return this.state === 'finished'; }

    // A cost on the clock while it runs (a missed door, HillDay.MISS_MS): it is in every later gate time and the finish,
    // so the proof chain signs it
    penalise(ms) {
        if (this.running) this.ms += ms;
    }

    // One physics step of dt seconds, the bicycle now at s; fell is true on the step a fall begins. Returns what
    // happened: { gate: index, ms } for a gate, { finish: ms } at the finish, { fell: true } for a fall, or null
    step(dt, s, fell = false) {
        if (!this.running) return null;
        const L = HillBoard.LIMITS;
        this.ms += dt * 1000;
        let event = null;
        if (fell) {
            this.restarts++;
            this.ms += L.penaltyMs;
            event = { fell: true };
        }
        if (Math.abs(s - this.lastS) > L.jumpM) this.trusted = false;
        this.lastS = s;
        const gates = HillBoard.GATES_S;
        if (this.next < gates.length && s >= gates[this.next]) {
            const ms = Math.round(this.ms);
            this.times.push(ms);
            event = { gate: this.next, ms, fell: !!fell };
            this.next++;
        } else if (this.next === gates.length && s >= HillBoard.finishS(this.lane)) {
            this.finishMs = Math.round(this.ms);
            this.state = 'finished';
            event = { finish: this.finishMs, fell: !!fell };
        }
        return event;
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { HillBoard };
