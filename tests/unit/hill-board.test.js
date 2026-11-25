/**
 * @jest-environment node
 */
// The hill ride's time and board (HillBoard, js/hill/board.js; HillRide's clock and end card, js/hill/ride.js): the
// clock runs from the roll-off to the finish on the last left and is never on screen; the server's row
// (functions/hill-courses.json) is the game's; real rides down the lane, signed by the game's own RunSession, pass the
// real handlers on an in-memory database, and runs too fast for a bicycle do not.
import { describe, test, expect } from '@jest/globals';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { loadGame, loadScript, realThree } from '../helpers/load-game.js';

const require = createRequire(import.meta.url);
const { createHandlers } = require('../../functions/lib/handlers.js');
const boards = require('../../functions/lib/boards.js');
const { createMemoryDb } = require('../../functions/test/support/memory-db.js');
const hillCourses = JSON.parse(readFileSync(new URL('../../functions/hill-courses.json', import.meta.url), 'utf8'));

const THREE = realThree();
const { Vehicle, WorldPhysics, CHARACTERS } = loadGame(THREE);
const load = (window, Tuning) => new Function('THREE', 'Vehicle', 'WorldPhysics', 'CHARACTERS', 'window', 'Tuning',
    `${['lane', 'pushbike', 'bicycle', 'board', 'ride'].map(n => loadScript(`hill/${n}.js`)).join('\n')}\nreturn { HillLane, HillBicycle, HillBoard, HillRide };`
)(THREE, Vehicle, WorldPhysics, CHARACTERS, window, Tuning);
const { HillLane, HillBicycle, HillBoard, HillRide } = load({ location: { search: '' } }, undefined);
const { RunSession, LeaderboardService } = new Function('crypto', 'TextEncoder', 'console',
    `${loadScript('leaderboard.js')}\nreturn { RunSession, LeaderboardService };`)(webcrypto, TextEncoder, { log() {}, warn() {}, error() {} });

class HttpsError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}

const DT = HillRide.STEP_S;
const lane = new HillLane();

// The game's functions calls, answered by the real handlers on a memory database (as firebase.functions() would)
function server() {
    const db = createMemoryDb();
    let clock = 1_700_000_000_000;
    const handlers = createHandlers({ db, now: () => clock, HttpsError, randomBytes: n => Buffer.alloc(n, 3) });
    const functions = {
        httpsCallable: name => async data => ({ data: await handlers[name](JSON.parse(JSON.stringify(data))) })
    };
    return { db, handlers, functions, tick: ms => { clock += ms; } };
}

// The autopilot of tests/unit/hill-ride.test.js: steers for a point ahead on the lane's centre and brakes to `most`, or
// to `bend` for `before` m ahead of a tight turn
function pilot(bike, { most = Infinity, bend = Infinity, before = 0 } = {}) {
    const v = bike.speed, ahead = bike.lane.sample(bike.s + 4 + v * 0.6), at = bike.vehicle.position;
    let err = Math.atan2(ahead.x - at.x, ahead.z - at.z) - bike.yaw;
    err = Math.atan2(Math.sin(err), Math.cos(err));
    const turn = 2.2 * err * Math.max(1, v);
    const lean = -Math.atan(Math.max(0, v) * Math.max(-3, Math.min(3, turn / Math.max(1, v))) / 9.81);
    const steer = Math.max(-1, Math.min(1, (bike.lean - lean) * 5));
    let limit = most;
    for (let d = 0; d <= before; d += 2) if (Math.abs(bike.lane.radiusAt(bike.s + d)) < 30) limit = Math.min(limit, bend);
    return { pedal: 0, brake: v > limit ? 1 : 0, steer };
}

// A ride from the roll-off to the finish, the clock run as the ride runs it (HillRide.timeStep); `pedal` the share of
// the time pushed, `fallAt` the s values at which the boy is knocked off
function rideDown({ pedal = 1, most = Infinity, bend = 8, fallAt = [], session = null } = {}) {
    // The push off the stand is the player's: a ride that does not pedal then rolls on the fall alone
    const bike = new HillBicycle(lane);
    bike.reset(lane.rule.startM, lane.rule.opening.startAcross);
    const ride = Object.assign(Object.create(HillRide.prototype), { lane, bike, board: new HillBoard(lane), session, forcedShot: null });
    ride.board.begin(bike.s);
    const falls = [...fallAt];
    const speeds = [], crashes = [];
    for (let t = 0; t < 400 && !ride.board.finished; t += DT) {
        const input = pilot(bike, { most, bend, before: 60 });
        // He does not pedal against the brake
        input.pedal = input.brake ? 0 : t < 1.5 ? 1 : pedal;
        const down = bike.crashed;
        // Knocked off, as by the churn (HillProps): the vehicle is down, and the bicycle stands him up in place
        if (falls.length && bike.s >= falls[0] && !down) {
            falls.shift();
            bike.vehicle.crashed = true;
        }
        bike.step(DT, input);
        ride.timeStep(DT, !down && bike.crashed);
        speeds.push(bike.speed);
        if (!down && bike.crashed) crashes.push(Math.round(bike.s));
    }
    return { ride, board: ride.board, top: Math.max(...speeds), crashes };
}

const parts = board => [board.times[0], ...board.times.slice(1).map((t, i) => t - board.times[i]), board.finishMs - board.times[board.times.length - 1]];

describe('the board and its row', () => {
    test('the id is neutral, and the server copy of the row is the game\'s', () => {
        expect(HillBoard.ID).toBe('village-hill-v1');
        expect(Object.keys(hillCourses)).toEqual([HillBoard.ID]);
        expect(hillCourses[HillBoard.ID]).toEqual(HillBoard.row(lane));
    });

    test('the gates stand down the course in order, before the finish where the ending begins', () => {
        const gates = HillBoard.GATES_S;
        expect(HillBoard.finishS(lane)).toBe(lane.rule.end.stopS);
        expect(gates[0]).toBeGreaterThan(lane.rule.startM);
        gates.forEach((s, i) => { if (i) expect(s).toBeGreaterThan(gates[i - 1] + 50); });
        expect(gates[gates.length - 1]).toBeLessThan(lane.rule.sharpRight.fromS);
        expect(HillBoard.finishS(lane)).toBeLessThan(lane.rule.lengthM - 12);
    });

    test('the server holds the board to its row: protocol 2, its gates, its own store, a floor for each part', () => {
        const rule = boards.ruleFor(HillBoard.ID);
        expect(rule).toMatchObject({ protocol: 2, gates: 3, penaltyMs: 5000 });
        expect(rule.minTotalMs).toBe(HillBoard.row(lane).gateFloorsMs.reduce((a, b) => a + b, 0));
        expect(boards.storePath(HillBoard.ID)).toBe(`courseBoards/${HillBoard.ID}`);
        expect(HillBoard.expected()).toEqual({ protocol: rule.protocol, gates: rule.gates });
    });
});

describe('the clock', () => {
    test('runs only from the roll-off, counts a gate once in order, a fall as +5 s and a restart, and stops at the finish', () => {
        const board = new HillBoard(lane);
        expect(board.step(1, 200)).toBe(null);
        board.begin(22);
        let s = 22;
        const events = [];
        for (let i = 0; i < 6000 && !board.finished; i++) {
            s += 0.1;
            const event = board.step(0.01, s, i === 1500);
            if (event) events.push(event);
        }
        expect(events.map(e => (e.gate !== undefined ? `g${e.gate}` : e.finish !== undefined ? 'f' : 'x'))).toEqual(['g0', 'x', 'g1', 'g2', 'f']);
        expect(board.restarts).toBe(1);
        // 98 m at 10 m/s, then 422 m and the fall's 5 s (to a step)
        expect(Math.abs(board.times[0] - 9800)).toBeLessThanOrEqual(10);
        expect(Math.abs(board.finishMs - (42200 + 5000))).toBeLessThanOrEqual(10);
        expect(board.trusted).toBe(true);
        expect(board.step(1, 500)).toBe(null);
    });

    test('a place set by a tool (a jump along the lane) is still timed but never trusted', () => {
        const board = new HillBoard(lane);
        board.begin(22);
        board.step(DT, 22.1);
        board.step(DT, 300);
        expect(board.trusted).toBe(false);
    });

    test('debug mode, test data and a tuned ride are never sent', () => {
        expect(HillBoard.allowed('', false)).toBe(true);
        expect(HillBoard.allowed('?emulator', false)).toBe(true);
        expect(HillBoard.allowed('?debug', false)).toBe(false);
        expect(HillBoard.allowed('?worldData=tests/fixtures/world', false)).toBe(false);
        expect(HillBoard.allowed('', true)).toBe(false);
    });

    test('nothing in the ride shows a time: the clock is only on the end card', () => {
        const source = loadScript('hill/ride.js');
        const draws = source.slice(source.indexOf('    frame(dt) {'), source.indexOf('    // The camera for the view'));
        expect(draws).not.toMatch(/format\(|finishMs|board\.ms|textContent/);
        const timed = [...source.matchAll(/HillBoard\.format\(/g)].map(m => m.index);
        const card = [source.indexOf('async showCard()'), source.indexOf('    // The game\'s own name entry')];
        timed.forEach(at => { expect(at).toBeGreaterThan(card[0]); expect(at).toBeLessThan(card[1]); });
    });
});

describe('rides down the lane', () => {
    test('the fastest ride, pushed all the way, beats no floor; each fall adds 5 s; a calm ride is under every ceiling', () => {
        const row = HillBoard.row(lane);
        const fast = rideDown({ pedal: 1, bend: 8 });
        // No brake at all: the sharp right throws him off, and the time is still over every floor
        const reckless = rideDown({ pedal: 1, bend: Infinity });
        const calm = rideDown({ pedal: 0, most: 8 });
        const fell = rideDown({ pedal: 1, bend: 8, fallAt: [150, 300] });
        expect(fast.crashes).toEqual([]);
        expect(reckless.crashes.length).toBeGreaterThan(0);
        for (const { board } of [fast, reckless, calm, fell]) {
            expect(board.finished).toBe(true);
            expect(board.trusted).toBe(true);
            parts(board).forEach((ms, i) => {
                expect(ms).toBeGreaterThan(row.gateFloorsMs[i] * 1.3);
                expect(ms).toBeLessThan(row.gateCeilsMs[i]);
            });
        }
        expect(fell.crashes.length).toBeGreaterThanOrEqual(2);
        expect(fell.board.restarts).toBe(fell.crashes.length);
        expect(fell.board.finishMs).toBeGreaterThan(fast.board.finishMs + 10000);
        console.log(`hill board: fastest ${HillBoard.format(fast.board.finishMs)} (top ${fast.top.toFixed(1)} m/s, parts ${parts(fast.board).join(', ')} ms, floors ${row.gateFloorsMs.join(', ')}), no brakes ${HillBoard.format(reckless.board.finishMs)} (${reckless.crashes.length} falls, parts ${parts(reckless.board).join(', ')} ms), calm ${HillBoard.format(calm.board.finishMs)}, two falls ${HillBoard.format(fell.board.finishMs)}`);
    });

    test('a ride signed by the game\'s RunSession goes onto the board through the real handlers, with its falls', async () => {
        const { db, functions } = server();
        const service = new LeaderboardService(functions);
        service.generateDeviceFingerprint = async () => 'device';
        const session = service.openSession(HillBoard.ID, HillBoard.expected());
        service.session = session;
        const { board } = rideDown({ pedal: 1, bend: 8, fallAt: [200], session });
        expect(await session.ready).toBe(true);
        const result = await service.submitRun('Boy');
        expect(result).toMatchObject({ success: true, rank: 1, flagged: false });
        const [entry] = Object.values(db.read(`courseBoards/${HillBoard.ID}`));
        expect(board.restarts).toBeGreaterThanOrEqual(1);
        expect(entry).toMatchObject({ playerName: 'BOY', totalTime: board.finishMs, restarts: board.restarts, checkpointTimes: board.times });
        const read = await service.fetchLeaderboard(HillBoard.ID, 10);
        expect(read.entries).toEqual([expect.objectContaining({ rank: 1, playerName: 'BOY', totalTime: board.finishMs, restarts: board.restarts })]);
    });

    test('a run faster than a bicycle, a fall left out or a part too slow is refused', async () => {
        const { handlers, functions } = server();
        const sign = async (times, finishTime, restarts) => {
            const session = new RunSession(functions, async () => 'device');
            expect(await session.start(HillBoard.ID, HillBoard.expected())).toBe(true);
            times.forEach((t, i) => session.recordCheckpoint(i, t));
            for (let i = 0; i < restarts; i++) session.recordRestart();
            await session.recordFinish(finishTime);
            await session.recordQueue;
            return { sessionId: session.sessionId, playerName: 'X', checkpointTimes: session.checkpointTimes, proofChain: session.proofChain, finishTime: session.finishTime, finishProof: session.finishProof, restarts: session.restarts };
        };
        const row = HillBoard.row(lane);
        const honest = [6000, 12000, 18000];
        await expect(handlers.submitRun(await sign(honest, 24000, 0))).resolves.toMatchObject({ rank: 1 });
        await expect(handlers.submitRun(await sign([row.gateFloorsMs[0] - 1, 12000, 18000], 24000, 0))).rejects.toMatchObject({ message: expect.stringContaining('Checkpoint 0 too fast') });
        await expect(handlers.submitRun(await sign(honest, 18000 + row.gateFloorsMs[3] - 1, 0))).rejects.toMatchObject({ message: expect.stringContaining('Finish too fast') });
        await expect(handlers.submitRun(await sign([6000, 12000 + row.gateCeilsMs[1], 18000 + row.gateCeilsMs[1]], 24000 + row.gateCeilsMs[1], 0))).rejects.toMatchObject({ message: expect.stringContaining('Checkpoint 1 too slow') });
        // A restart lets that part run longer, by restartMs
        await expect(handlers.submitRun(await sign([6000, 6000 + row.gateCeilsMs[1] + 1000, 12000 + row.gateCeilsMs[1] + 1000], 18000 + row.gateCeilsMs[1] + 1000, 1))).resolves.toMatchObject({ rank: 2 });
        // Ten falls cost 50 s: a 24 s ride that claims them is under the floor
        await expect(handlers.submitRun(await sign(honest, 24000, 10))).rejects.toMatchObject({ message: expect.stringContaining('Finish too fast') });
    });

    test('a server without the hill row opens no session, and nothing is sent', async () => {
        const { functions } = server();
        const old = { httpsCallable: name => async data => {
            const reply = await functions.httpsCallable(name)(data);
            if (name === 'startRun') return { data: { sessionId: reply.data.sessionId, sessionToken: reply.data.sessionToken } };
            return reply;
        } };
        const session = new RunSession(old, async () => 'device');
        expect(await session.start(HillBoard.ID, HillBoard.expected())).toMatchObject({ error: 'not-submitted' });
        expect(session.unsupported).toBe(true);
        expect(await session.submit('BOY')).toMatchObject({ success: false, state: 'not-submitted' });
    });
});

describe('the ride opens a session only when its time may be sent', () => {
    const service = () => {
        const opened = [];
        return { opened, leaderboardService: { openSession(id, expected) { const s = { id, expected, cancelled: false, cancel() { this.cancelled = true; } }; opened.push(s); return s; } } };
    };
    const rideOn = (search, Tuning) => {
        const { HillRide: Ride, HillBoard: Board } = load({ location: { search } }, Tuning);
        const game = service();
        const bike = new HillBicycle(lane);
        const ride = Object.assign(Object.create(Ride.prototype), { lane, bike, game, board: new Board(lane), session: null, forcedShot: null });
        return { ride, game };
    };

    test('a plain page opens one at the roll-off, and R drops it', () => {
        const { ride, game } = rideOn('', undefined);
        ride.beginTiming();
        expect(game.opened).toHaveLength(1);
        expect(game.opened[0]).toMatchObject({ id: 'village-hill-v1', expected: { protocol: 2, gates: 3 } });
        expect(game.leaderboardService.session).toBe(game.opened[0]);
        expect(ride.board.running).toBe(true);
        ride.dropSession();
        expect(game.opened[0].cancelled).toBe(true);
    });

    test('debug mode, a tuned ride and a held shot open none, and the clock still runs', () => {
        for (const [search, Tuning, shot] of [['?debug', undefined, null], ['', { beginRide: () => true, ride: { tuned: true } }, null], ['', undefined, 'opening']]) {
            const { ride, game } = rideOn(search, Tuning);
            ride.forcedShot = shot;
            ride.beginTiming();
            expect(game.opened).toHaveLength(0);
            expect(ride.board.running).toBe(true);
            expect(ride.board.trusted).toBe(false);
        }
    });

    test('tuned during the ride: the session is dropped', () => {
        const Tuning = { beginRide: () => false, ride: { tuned: false } };
        const { ride, game } = rideOn('', Tuning);
        ride.beginTiming();
        Tuning.ride.tuned = true;
        ride.watchTrust();
        expect(game.opened[0].cancelled).toBe(true);
        expect(ride.session).toBe(null);
        expect(ride.board.trusted).toBe(false);
    });
});
