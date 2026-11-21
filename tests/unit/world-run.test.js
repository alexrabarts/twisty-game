// The riding half of a world (R2-R5): the run state and the cut rule (WorldRun), the chase camera
// (WorldCamera), the stage look table and the atmosphere track along a ride (AtmosphereTrack.forWorld).
import { describe, test, expect, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { loadGame, loadScript } from '../helpers/load-game.js';
import { ladder } from '../fixtures/world/stacked-ladder.js';
import { samplesOf, straight } from '../helpers/world-synthetic.js';

const game = loadGame();
const { WorldRoute, WorldRun, WorldCamera, WorldLooks, WorldPhysics, AtmosphereTrack } = game;

const DT = 1 / 60;
// One frame of the projection the run reads
const frame = (s, extra = {}) => ({ s, lateral: 0, width: 10, speed: 15, dt: DT, forwardDot: 1, ...extra });

describe('WorldRun stages', () => {
    const route = new WorldRoute(samplesOf(straight(700)), {
        stages: [{ id: 'a', name: 'A', from: 0, to: 300 }, { id: 'b', name: 'B', from: 300, to: 600 }]
    });
    const stations = [
        { s: 0, stage: 'a', kind: 'start' }, { s: 100, stage: 'a', kind: 'gate' }, { s: 300, stage: 'a', kind: 'boundary' },
        { s: 400, stage: 'b', kind: 'gate' }, { s: 500, stage: 'b', kind: 'gate' }, { s: 600, stage: 'b', kind: 'end' }
    ];

    test('a boundary ends one stage and starts the next; only the last station ends the ride', () => {
        const run = new WorldRun(route, stations, WorldPhysics);
        expect([run.stageIndex, run.stageCount]).toEqual([0, 2]);
        expect(run.stageGates(0)).toEqual({ total: 1, passed: 0 });
        expect(run.stageGates(1)).toEqual({ total: 2, passed: 0 });
        for (let s = 0; s <= 300.5; s += 0.2) {
            const r = run.update(frame(s));
            if (r.station >= 0) run.onStation(r.station, Math.round(s * 100));
        }
        expect(run.stationIndex).toBe(2);
        expect(run.stageGates(0)).toEqual({ total: 1, passed: 1 });
        run.onStageFinish(0, 30000);
        expect([run.stageIndex, run.stageStartMs, run.stageTimes[0]]).toEqual([1, 30000, 30000]);
        expect(run.finished).toBe(false);
        run.noteRestart();
        expect(run.stageRestarts).toEqual([0, 1]);
        expect(run.stageGates(1)).toEqual({ total: 2, passed: 0 });
    });

    test('the finish is passed at the route end even when its stored s lies a centimetre past the last sample', () => {
        const short = new WorldRoute(samplesOf(straight(600)), { stages: [{ id: 'a', name: 'A', from: 0, to: 600 }] });
        const end = short.length + 0.01;
        const run = new WorldRun(short, [{ s: 0, stage: 'a', kind: 'start' }, { s: end, stage: 'a', kind: 'end' }], WorldPhysics);
        let passed = -1;
        for (let s = 0; s <= short.length && passed < 0; s = Math.min(short.length, s + 0.2)) {
            passed = run.update(frame(s)).station;
            if (s === short.length) break;
        }
        expect(passed).toBe(1);
        expect(run.finished).toBe(true);
    });

    test('begin puts the stage state back, and a ride that starts inside a stage starts in it', () => {
        const run = new WorldRun(route, stations, WorldPhysics);
        run.onStageFinish(0, 5000);
        run.noteRestart();
        run.begin(0);
        expect([run.stageIndex, run.stageStartMs, run.stageTimes, run.stageRestarts]).toEqual([0, 0, [], [0, 0]]);
        run.begin(350);
        expect(run.stageIndex).toBe(1);
    });
});

describe('the game over a ride of stages', () => {
    // Game's own updateWorldRun, run against a plain object with the real WorldRun
    const source = readFileSync(new URL('../../js/main.js', import.meta.url), 'utf8');
    const classSource = source.slice(0, source.indexOf('Game.RESTART_CLEAR_SEGMENTS = 6;') + 'Game.RESTART_CLEAR_SEGMENTS = 6;'.length);
    const Game = new Function('showCallout', 'HudRules', 'WorldRun', `${classSource}\nreturn Game;`)(() => {}, { stageClock: ms => String(ms) }, WorldRun);
    const route = new WorldRoute(samplesOf(straight(700)), {
        stages: [{ id: 'a', name: 'A', from: 0, to: 300 }, { id: 'b', name: 'B', from: 300, to: 600 }]
    });
    const stations = [
        { s: 0, stage: 'a', kind: 'start' }, { s: 100, stage: 'a', kind: 'gate' }, { s: 300, stage: 'a', kind: 'boundary' },
        { s: 400, stage: 'b', kind: 'gate' }, { s: 500, stage: 'b', kind: 'gate' }, { s: 600, stage: 'b', kind: 'end' }
    ];

    test('the finish ends the last stage too: one stage time per stage, and they add up to the ride', () => {
        let clock = 0;
        const game = Object.assign(Object.create(Game.prototype), {
            vehicle: { projection: { index: 0, s: 0, lateral: 0, width: 10, heading: 0 }, speed: 15, yawAngle: 0 },
            worldRun: new WorldRun(route, stations, WorldPhysics),
            environment: { stationGates: stations, checkpoints: stations.slice(1, -1).map((st, i) => ({ index: i, s: st.s })) },
            raceElapsed: () => clock,
            passCheckpoint: jest.fn(),
            restartFromCheckpoint: jest.fn(),
            finishRun: jest.fn()
        });
        for (let s = 0; s <= 601 && !game.finishRun.mock.calls.length; s += 0.2) {
            clock = Math.round(s * 100);
            game.vehicle.projection.s = s;
            game.updateWorldRun(DT);
        }
        const run = game.worldRun;
        expect(game.finishRun).toHaveBeenCalledTimes(1);
        expect(run.stageTimes.length).toBe(run.stageCount);
        run.stageTimes.forEach(ms => expect(ms).toBeGreaterThan(0));
        expect(run.stageTimes.reduce((a, b) => a + b, 0)).toBe(run.stationTimes[stations.length - 1]);
    });
});

describe('WorldRun stations', () => {
    const route = new WorldRoute(samplesOf(straight(400)), {});
    const stations = [{ s: 0 }, { s: 100 }, { s: 200 }, { s: 300 }];

    test('a station is passed in order, as progress goes past it, facing along the road and on it', () => {
        const run = new WorldRun(route, stations, WorldPhysics);
        let passed = [];
        for (let s = 0; s <= 250; s += 0.2) {
            const result = run.update(frame(s));
            if (result.station >= 0) passed.push([result.station, s]);
        }
        expect(passed.map(p => p[0])).toEqual([1, 2]);
        expect(passed[0][1]).toBeGreaterThanOrEqual(100);
        expect(run.lastStation).toBe(stations[2]);
        expect(run.finished).toBe(false);
    });

    test('a bike facing back, or off the road, credits nothing; the last station finishes', () => {
        const run = new WorldRun(route, stations, WorldPhysics);
        for (let s = 0; s < 99.9; s += 0.2) run.update(frame(s));
        expect(run.update(frame(100.1, { forwardDot: -1 })).station).toBe(-1);
        expect(run.update(frame(100.3, { lateral: 40 })).station).toBe(-1);
        expect(run.update(frame(100.5)).station).toBe(1);
        for (let s = 100.7; s <= 300.4; s += 0.2) run.update(frame(s));
        expect(run.finished).toBe(true);
        expect(run.stationIndex).toBe(3);
    });

    test('a restart starts progress again at its place, so the ride goes on from there with no station taken twice', () => {
        const run = new WorldRun(route, stations, WorldPhysics);
        for (let s = 0; s <= 150; s += 0.2) run.update(frame(s));
        run.restartAt(140);
        expect(run.lastS).toBe(140);
        expect(run.roadS).toBe(140);
        expect(run.stationIndex).toBe(1);
        const next = run.update(frame(140.2));
        expect([next.cut, next.station]).toEqual([false, -1]);
    });
});

// A checkpoint is a timing line and nothing else: after a crash the rider goes on from where the bike last was on the
// carriageway (WorldRun.roadS), a few metres back (WorldPhysics.restartBackM), on its own side
describe('where a restart puts the rider', () => {
    const { Route } = game;
    const back = WorldPhysics.restartBackM;
    const route = new WorldRoute(samplesOf(straight(400)), {});
    const stations = [{ s: 0 }, { s: 100 }, { s: 200 }, { s: 300 }];
    const ridden = (to, from = 0) => {
        const run = new WorldRun(route, stations, WorldPhysics);
        run.begin(from);
        for (let s = from; s <= to + 1e-9; s += 0.2) run.update(frame(s));
        return run;
    };

    test('the distance back is data, a few metres', () => {
        expect(back).toBeGreaterThanOrEqual(3);
        expect(back).toBeLessThanOrEqual(15);
    });

    test('a crash called on the carriageway restarts within restartBackM behind it, never at a station', () => {
        const run = ridden(157);
        const place = run.restartPlace();
        expect(place.s).toBeLessThanOrEqual(157);
        expect(place.s).toBeGreaterThanOrEqual(157 - back - 0.21);
        expect(stations.some(st => Math.abs(st.s - place.s) < 1)).toBe(false);
    });

    test('a crash off the road restarts where the bike left the carriageway, however far it went on', () => {
        const run = ridden(157);
        // Off the edge (the road is 10 m wide) and on over the land for 60 m, then the crash
        for (let s = 157.2; s <= 217; s += 0.2) run.update(frame(s, { lateral: 9 }));
        expect(run.roadS).toBeCloseTo(157, 1);
        expect(run.restartPlace().s).toBeCloseTo(157 - back, 1);
        // (the timing line at 200 was crossed beside the road: the place is still where the bike left it)
        expect(run.stationIndex).toBe(2);
    });

    test('a fall onto a lower leg of a ladder is not where the bike was on the road', () => {
        const run = ridden(257);
        // Down a drop, and the bike lies on the carriageway 120 m back along the ride
        for (let i = 0; i < 30; i++) run.update(frame(137, { speed: 0 }));
        expect(run.roadS).toBeCloseTo(257, 1);
        expect(run.restartPlace().s).toBeCloseTo(257 - back, 1);
    });

    test('a rider who turns back along the road restarts where they are, facing along the ride', () => {
        const run = ridden(157);
        for (let s = 157; s >= 110; s -= 0.2) run.update(frame(s, { forwardDot: -1 }));
        expect(run.roadS).toBeCloseTo(110, 0);
        expect(run.restartPlace().s).toBeCloseTo(110 - back, 0);
        // (the high-water mark is not lost, and no station is credited on the way back)
        expect(run.lastS).toBeCloseTo(157, 1);
        expect(run.stationIndex).toBe(1);
    });

    test('never before the start; just past a timing line it goes back over it, and the split is not taken twice', () => {
        expect(ridden(2).restartPlace().s).toBe(0);
        const run = ridden(102);
        const place = run.restartPlace();
        expect(place.s).toBeCloseTo(102 - back, 1);
        run.restartAt(place.s);
        expect(run.stationIndex).toBe(1);
        const seen = [];
        for (let s = place.s; s <= 120; s += 0.2) seen.push(run.update(frame(s)).station);
        expect(seen.every(station => station === -1)).toBe(true);
    });

    test('a restart back over a stage boundary leaves the stage that ended ended', () => {
        const staged = new WorldRoute(samplesOf(straight(700)), { stages: [{ id: 'a', name: 'A', from: 0, to: 300 }, { id: 'b', name: 'B', from: 300, to: 600 }] });
        const run = new WorldRun(staged, [{ s: 0, stage: 'a', kind: 'start' }, { s: 300, stage: 'a', kind: 'boundary' }, { s: 600, stage: 'b', kind: 'end' }], WorldPhysics);
        for (let s = 0; s <= 302; s += 0.2) if (run.update(frame(s)).station === 1) run.onStageFinish(0, 20000);
        expect(run.stageIndex).toBe(1);
        const place = run.restartPlace();
        expect(place.s).toBeLessThan(300);
        run.restartAt(place.s);
        expect(run.stageIndex).toBe(1);
    });

    test('across the road it is the rider\'s own side, inside the carriageway, and the open lane through a roadworks site', () => {
        const run = ridden(157);
        const place = run.restartPlace();
        expect(Math.sign(place.lateral)).toBe(Route.keepRight(1));
        expect(Math.abs(place.lateral)).toBeGreaterThan(1);
        expect(Math.abs(place.lateral)).toBeLessThan(10 / 2 - 1);
        const works = { pilotLane: jest.fn((s, own) => -own) };
        const inWorks = run.restartPlace(works);
        expect(works.pilotLane).toHaveBeenCalledWith(inWorks.s, place.lateral);
        expect(inWorks.lateral).toBe(-place.lateral);
    });

    test('progress goes on from the place: no cut, no station taken twice, and the next one is taken', () => {
        const run = ridden(157);
        for (let s = 157.2; s <= 180; s += 0.2) run.update(frame(s, { lateral: 9 }));
        const place = run.restartPlace();
        run.noteRestart();
        run.restartAt(place.s);
        const seen = [];
        let cut = false;
        // From a standstill up to speed
        let s = place.s;
        for (let i = 0; i < 600; i++) {
            const speed = Math.min(15, i * 0.2);
            s += speed * DT;
            const result = run.update(frame(s, { speed, lateral: place.lateral }));
            cut = cut || result.cut;
            if (result.station >= 0) seen.push(result.station);
        }
        expect(cut).toBe(false);
        expect(seen).toEqual([2]);
        expect(run.stageRestarts[0]).toBe(1);
    });
});

describe('WorldRun cut rule', () => {
    const route = new WorldRoute(samplesOf(ladder()), {});
    // The ladder's legs lie 111 m apart in s with 25 m between them
    const stations = [{ s: 0 }, { s: 300 }];

    const hold = (run, count, make) => {
        let cut = false;
        for (let i = 0; i < count; i++) if (run.update(make(i)).cut) cut = true;
        return cut;
    };

    test('honest riding is accepted frame after frame', () => {
        const run = new WorldRun(route, stations, WorldPhysics);
        expect(hold(run, 600, i => frame(i * 15 * DT))).toBe(false);
        expect(run.pendingCutMs).toBe(0);
    });

    test('a jump across the ladder that holds for cutConfirmMs restarts the rider, once it is confirmed', () => {
        const run = new WorldRun(route, stations, WorldPhysics);
        run.begin(20);
        let frames = 0;
        let cut = false;
        while (!cut && frames < 60) {
            cut = run.update(frame(131)).cut;
            frames++;
        }
        expect(cut).toBe(true);
        const ms = frames * DT * 1000;
        expect(ms).toBeGreaterThanOrEqual(WorldPhysics.cutConfirmMs - 20);
        expect(ms).toBeLessThanOrEqual(WorldPhysics.cutConfirmMs + 40);
    });

    test('a forward flicker shorter than cutConfirmMs costs nothing', () => {
        const run = new WorldRun(route, stations, WorldPhysics);
        run.begin(20);
        expect(hold(run, 8, () => frame(131))).toBe(false);
        expect(run.update(frame(20.2)).cut).toBe(false);
        expect(run.pendingCutMs).toBe(0);
        expect(hold(run, 8, () => frame(131))).toBe(false);
    });

    test('a long backward stay is ignored: progress is a high-water mark and no station is credited', () => {
        const run = new WorldRun(route, [{ s: 0 }, { s: 20 }, { s: 300 }], WorldPhysics);
        run.begin(130);
        // 30 frames of the projection on the leg below, then back
        expect(hold(run, 30, () => frame(20))).toBe(false);
        expect(run.lastS).toBe(130);
        expect(run.stationIndex).toBe(0);
        expect(run.update(frame(131)).cut).toBe(false);
        expect(run.lastS).toBe(131);
    });

    // The ladder: drop to the lower leg, ride round for ten seconds, cross to the upper leg. The banked
    // allowance must not buy the 110 m jump.
    const ladderCut = (physics) => {
        const run = new WorldRun(route, stations, physics);
        run.begin(130);
        // 399 frames: just short of the 400 at which the stay on the lower leg is accepted and the bank empties
        hold(run, 399, () => frame(20));
        return hold(run, 30, () => frame(240));
    };

    test('circling on the lower leg does not bank the jump to the upper leg (C9)', () => {
        expect(WorldPhysics.maxBankM * 2).toBeLessThan(111);
        expect(ladderCut(WorldPhysics)).toBe(true);
    });

    test('with no cap on the bank the same ladder is skipped: the cap is what stops it', () => {
        expect(ladderCut({ ...WorldPhysics, maxBankM: Infinity })).toBe(false);
    });

    test('a frame facing backward banks nothing', () => {
        const run = new WorldRun(route, stations, WorldPhysics);
        run.begin(130);
        hold(run, 600, () => frame(20, { forwardDot: -1 }));
        expect(run.allowAccum).toBe(0);
    });
});

// Road that was not ridden is not counted, on any bike: a line over the land that gains ride distance faster than the
// bike moves (the inside of a bend, where the projection sweeps round with no jump) is a cut once the bike is back on
// the carriageway. The frames are the projection's as the game hands them over (`land`: Vehicle.runoff)
describe('WorldRun: road skipped over the land', () => {
    const route = new WorldRoute(samplesOf(straight(900)), {});
    const stations = [{ s: 0 }, { s: 400 }, { s: 800 }];
    const most = WorldPhysics.cutSkipM;
    const confirm = Math.ceil(WorldPhysics.cutConfirmMs / 1000 / DT);
    const road = (s, speed = 10) => frame(s, { speed });
    const land = (s, speed = 10) => frame(s, { speed, lateral: 9, land: true });
    const verge = (s, speed = 10) => frame(s, { speed, lateral: 5.6, land: false });
    // Rides from run.prevS: `ratio` metres of ride distance for each metre ridden, for `metres` ridden. Returns whether a cut fired
    const ride = (run, make, metres, ratio = 1, speed = 10) => {
        let cut = false, s = run.prevS;
        for (let d = 0; d < metres - 1e-9; d += speed * DT) {
            s += ratio * speed * DT;
            if (run.update(make(s, speed)).cut) cut = true;
        }
        return cut;
    };
    const start = (s = 100) => {
        const run = new WorldRun(route, stations, WorldPhysics);
        run.begin(s);
        ride(run, road, 20);
        return run;
    };

    test('the allowance is a few metres: more than the projection\'s noise, less than any hairpin', () => {
        expect(most).toBeGreaterThanOrEqual(3);
        expect(most).toBeLessThanOrEqual(8);
    });

    test('riding beside the road on the land and coming back skips nothing: no cut, and the progress counts', () => {
        const run = start();
        expect(ride(run, land, 250)).toBe(false);
        expect(run.skip).toBeLessThan(1e-6);
        expect(ride(run, road, 30)).toBe(false);
        expect(run.lastS).toBeCloseTo(400, 0);
        expect(run.pendingCutMs).toBe(0);
        // The station beside the land ride was passed once the bike was back in the road's band
        expect(run.stationIndex).toBe(1);
    });

    test('a line over the land that gains the road four times as fast as the bike moves is a cut, once the bike is back on the road', () => {
        const run = start();
        const left = run.roadS;
        // 6 m ridden on the land for 24 m of road: 18 m skipped
        expect(ride(run, land, 6, 4)).toBe(false);
        expect(run.skip).toBeGreaterThan(17);
        // On the land nothing is judged, however long the bike stays there, and no station is credited
        expect(ride(run, land, 400)).toBe(false);
        expect(run.prevS).toBeGreaterThan(500);
        expect(run.stationIndex).toBe(0);
        expect(run.pendingCutMs).toBe(0);
        // Back on the carriageway: a cut, when it has held for cutConfirmMs and not before
        let frames = 0, cut = false;
        while (!cut && frames < 60) { cut = run.update(road(run.prevS + 10 * DT)).cut; frames++; }
        expect(cut).toBe(true);
        expect(frames).toBeGreaterThanOrEqual(confirm - 1);
        expect(frames).toBeLessThanOrEqual(confirm + 1);
        // The rider goes back to where the bike left the road
        expect(run.roadS).toBe(left);
        expect(run.restartPlace().s).toBeCloseTo(left - WorldPhysics.restartBackM, 6);
        run.restartAt(run.restartPlace().s);
        expect(run.skip).toBe(0);
        expect(ride(run, road, 50)).toBe(false);
    });

    test('metres ridden on the land after a skip do not pay it back: a loop or the outside of a bend, and it is still a cut', () => {
        const run = start();
        const left = run.roadS;
        ride(run, land, 6, 4);
        expect(run.skipPeak).toBeGreaterThan(17);
        // 40 m ridden on the land for 20 m of road (the outside of a long bend, a zigzag): the sum comes down, the peak stays
        expect(ride(run, land, 40, 0.5)).toBe(false);
        expect(run.skip).toBe(0);
        expect(run.skipPeak).toBeGreaterThan(17);
        // A loop on the spot: 30 m ridden for no road at all
        expect(ride(run, land, 30, 0)).toBe(false);
        expect(run.stationIndex).toBe(0);
        let frames = 0, cut = false;
        while (!cut && frames < 60) { cut = run.update(road(run.prevS + 10 * DT)).cut; frames++; }
        expect(cut).toBe(true);
        expect(frames).toBeLessThanOrEqual(confirm + 1);
        expect(run.restartPlace().s).toBeCloseTo(left - WorldPhysics.restartBackM, 6);
    });

    test('metres ridden on the land first bank nothing against a skip made after', () => {
        const run = start();
        expect(ride(run, land, 40, 0.5)).toBe(false);
        expect(run.skip).toBe(0);
        ride(run, land, 6, 4);
        expect(run.skipPeak).toBeGreaterThan(17);
        let cut = false;
        for (let i = 0; i < 30; i++) cut = run.update(road(run.prevS + 10 * DT)).cut || cut;
        expect(cut).toBe(true);
    });

    test('no station is passed with road skipped', () => {
        const run = start(350);
        ride(run, land, 6, 4);
        ride(run, land, 60);
        expect(run.prevS).toBeGreaterThan(410);
        expect(run.stationIndex).toBe(0);
    });

    test('a clip of the land under the allowance costs nothing and is forgotten on the road', () => {
        const run = start();
        // 1 m ridden for 4 m of road: 3 m skipped
        expect(ride(run, land, 1, 4)).toBe(false);
        expect(run.skip).toBeGreaterThan(2.5);
        expect(run.skip).toBeLessThan(most);
        expect(ride(run, road, 20)).toBe(false);
        expect(run.skip).toBe(0);
        // So clips do not add up: ten of them with the road between
        for (let i = 0; i < 10; i++) expect(ride(run, land, 1, 4) || ride(run, road, 5)).toBe(false);
    });

    test('the verge is free: the same sweep on the drawn verge is no cut', () => {
        const run = start();
        // (the progress rule's own floor lets the projection pass four times as fast as the bike on the inside of a bend)
        expect(ride(run, verge, 6, 3)).toBe(false);
        expect(run.skip).toBe(0);
        expect(ride(run, road, 20)).toBe(false);
    });

    test('a rider who turns back over the land gives back what was gained, and rejoins free', () => {
        const run = start();
        const left = run.roadS;
        ride(run, land, 6, 4);
        expect(run.skip).toBeGreaterThan(most);
        // Back the way it came, to where it left the road
        ride(run, land, 6, -4);
        expect(run.skip).toBe(0);
        // (the peak stays, but it counts no further than the road the bike is ahead of where it left: none)
        expect(run.skipPeak).toBeGreaterThan(most);
        let cut = false;
        for (let i = 0; i < 60; i++) cut = run.update(road(left + i * 10 * DT)).cut || cut;
        expect(cut).toBe(false);
    });

    test('the projection standing still well off the road and then stepping is held as a skip: the peak rule does not net it out', () => {
        // (10 m and more outside a bend the ribbon frame's projection can stand for 12 m of riding and then step 12 m.
        // With the sum read as it stands this was free; held to its peak it is a cut. The cost of the peak rule)
        const run = start();
        const held = run.prevS;
        let cut = false;
        for (let d = 0; d < 12; d += 10 * DT) cut = run.update(land(held)).cut || cut;
        cut = run.update(land(held + 12)).cut || cut;
        expect(run.skipPeak).toBeGreaterThan(most);
        expect(ride(run, land, 30) || cut).toBe(false);
        for (let i = 0; i < 30; i++) cut = run.update(road(run.prevS + 10 * DT)).cut || cut;
        expect(cut).toBe(true);
    });

    test('a jump across the ladder made on the land is not judged there; on the far leg\'s road it is a cut, and back on its own it is free', () => {
        const ladderRoute = new WorldRoute(samplesOf(ladder()), {});
        const make = () => {
            const run = new WorldRun(ladderRoute, [{ s: 0 }, { s: 300 }], WorldPhysics);
            run.begin(20);
            return run;
        };
        const far = make();
        let cut = false;
        for (let i = 0; i < 300; i++) cut = far.update(frame(131 + i * 0.1, { lateral: 12, land: true })).cut || cut;
        expect(cut).toBe(false);
        expect(far.lastS).toBe(20);
        expect(far.stationIndex).toBe(0);
        let frames = 0;
        while (!cut && frames < 60) { cut = far.update(frame(162 + frames * 0.2)).cut; frames++; }
        expect(cut).toBe(true);
        expect(frames).toBeLessThanOrEqual(confirm + 1);
        expect(far.restartPlace().s).toBeCloseTo(Math.max(0, 20 - WorldPhysics.restartBackM), 6);

        const home = make();
        cut = false;
        for (let i = 0; i < 300; i++) cut = home.update(frame(131, { lateral: 12, land: true })).cut || cut;
        // The projection is back on the leg the bike left, a little further on, and so is the bike
        cut = home.update(frame(22, { lateral: 8, land: true })).cut || cut;
        for (let i = 0; i < 120; i++) cut = home.update(frame(22 + i * 0.2)).cut || cut;
        expect(cut).toBe(false);
        expect(home.lastS).toBeGreaterThan(40);
    });

    test('with no cutSkipM the rule is off and the run is as it was', () => {
        const { cutSkipM, ...plain } = WorldPhysics;
        const run = new WorldRun(route, stations, plain);
        run.begin(100);
        ride(run, road, 20);
        ride(run, land, 6, 4);
        expect(run.skip).toBe(0);
        expect(ride(run, road, 20)).toBe(false);
    });
});

describe('WorldRun restart speed', () => {
    test('a put-down on a straight road rolls away at the most; before a hairpin at 0.8 of what it allows', () => {
        const flat = new WorldRun(new WorldRoute(samplesOf(straight(400)), {}), [{ s: 0 }], WorldPhysics);
        expect(flat.restartSpeed(0)).toBe(WorldPhysics.restartSpeedMax);
        const bends = new WorldRun(new WorldRoute(samplesOf(ladder()), {}), [{ s: 0 }], WorldPhysics);
        const speed = bends.restartSpeed(60);
        expect(speed).toBeLessThan(WorldPhysics.restartSpeedMax);
        const lean = Math.tan(Math.atan(Math.tan(WorldPhysics.leanCapDeg * Math.PI / 180) * WorldPhysics.cobbleGrip));
        const radius = 25 / 2;
        expect(speed).toBeLessThanOrEqual(0.8 * Math.sqrt(9.81 * lean * radius) + 1e-6);
        expect(speed).toBeGreaterThan(3);
    });
});

describe('WorldCamera', () => {
    const THREE = game.THREE;
    const T = WorldCamera.TUNING;
    const road = new WorldRoute(samplesOf(straight(400)), {});
    const flatGround = (height) => ({ groundY: () => height });

    // A half circle of `R` m radius after `lead` m of straight along +z, then a straight leg back, sampled every 4 m
    const hairpinRoute = (R = 15, lead = 200) => {
        const points = [];
        for (let z = -lead; z < 0; z += 4) points.push({ x: 0, y: 100, z, heading: 0, width: 10 });
        const steps = Math.ceil(Math.PI * R / 4);
        for (let k = 0; k <= steps; k++) {
            const a = Math.PI * k / steps;
            points.push({ x: R - R * Math.cos(a), y: 100, z: R * Math.sin(a), heading: a, width: 10 });
        }
        for (let z = -4; z >= -lead; z -= 4) points.push({ x: 2 * R, y: 100, z, heading: Math.PI, width: 10 });
        return new WorldRoute(samplesOf(points), {});
    };

    // The chase view of the Standard mode, and the bike `input` WorldCamera.update reads
    const bikeAt = (route, s, speed) => {
        const at = route.curveAt(s, {});
        return { x: at.px, y: 100, z: at.pz, s, index: Math.floor(route.toUnits(s)), speed, lift: 1, offset: { x: 0, y: 3, z: -6 }, fov: 75 };
    };
    const view = () => new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 2000);

    // One frame as Game draws it: the boom, the camera put there, then the look target from it
    const frameOf = (camera, input, eye, probe) => {
        const placed = camera.update(input, DT);
        eye.position.set(placed.x, placed.y, placed.z);
        eye.fov = camera.fov;
        eye.updateProjectionMatrix();
        const bike = new THREE.Vector3(input.x, input.y + 0.9, input.z);
        const look = camera.aim(eye, bike, probe);
        eye.lookAt(look.x, look.y, look.z);
        eye.updateMatrixWorld(true);
        return { position: { ...placed }, look: { ...look }, ndc: bike.clone().project(eye) };
    };

    test('a spring settles on its target without passing it, and tracks a steadily moving target with no lag', () => {
        const state = { x: 0, v: 0, t: 0 };
        let most = 0;
        for (let i = 0; i < 60; i++) most = Math.max(most, WorldCamera.spring(state, 1, 6, DT));
        expect(most).toBeLessThanOrEqual(1);
        expect(state.x).toBeGreaterThan(0.95);
        const moving = { x: 0, v: 2, t: 0 };
        for (let i = 1; i <= 120; i++) WorldCamera.spring(moving, 2 * i * DT, 6, DT, true);
        expect(moving.x).toBeCloseTo(4, 9);
        expect(moving.v).toBeCloseTo(2, 9);
    });

    test('the look target is on the route ahead: 8 m and 0.6 s of speed, lifted', () => {
        const camera = new WorldCamera(road, flatGround(0));
        const look = camera.lookTarget(100, 10, 2);
        expect(look.z).toBeCloseTo(114, 6);
        expect(look.y).toBeCloseTo(102, 6);
    });

    test('on a hairpin the look target moves out to the road 30 m ahead; on a straight it does not', () => {
        const bend = hairpinRoute(15, 0);
        const camera = new WorldCamera(bend, flatGround(0));
        expect(camera.bendShare(0)).toBeGreaterThan(0.9);
        expect(new WorldCamera(road, flatGround(0)).bendShare(100)).toBe(0);
        const at = bend.sample(30, {});
        const look = camera.lookTarget(0, 10, 0);
        expect(Math.hypot(look.x - at.x, look.z - at.z)).toBeLessThan(0.2);
    });

    test('in a hairpin the boom pulls back and up; on the straight after it eases back in, and the yaw follows the road', () => {
        const route = hairpinRoute();
        const camera = new WorldCamera(route, flatGround(0));
        camera.update(bikeAt(route, 60, 10), DT);
        expect(camera.pull).toBe(0);
        expect(camera.yaw).toBeCloseTo(0, 6);
        for (let i = 0; i < 180; i++) camera.update(bikeAt(route, 215, 0), DT);
        expect(camera.pull).toBeGreaterThan(0.99);
        expect(camera.springs.distance.x).toBeCloseTo(6 * (1 + T.pullBack), 1);
        expect(camera.springs.height.x).toBeCloseTo(3 + T.raiseM, 1);
        expect(WorldCamera.wrap(camera.yaw - route.curveAt(215 - T.followBehindM, {}).heading)).toBeCloseTo(0, 3);
        // On the leg back it eases out, not at once
        const back = route.length - 60;
        camera.update(bikeAt(route, back, 0), DT);
        expect(camera.pull).toBeGreaterThan(0.99);
        for (let i = 0; i < 60; i++) camera.update(bikeAt(route, back, 0), DT);
        expect(camera.pull).toBeGreaterThan(0.2);
        expect(camera.pull).toBeLessThan(0.8);
        for (let i = 0; i < 600; i++) camera.update(bikeAt(route, back, 0), DT);
        expect(camera.pull).toBeLessThan(1e-3);
    });

    test('the look target gives way to the bike until the bike is well inside the view, and never lets it past keepHard', () => {
        const camera = new WorldCamera(road, flatGround(0));
        const eye = view();
        eye.position.set(0, 3, -6);
        const bike = new THREE.Vector3(0, 0.9, 0);
        const probe = new THREE.PerspectiveCamera();
        const project = look => {
            eye.lookAt(look.x, look.y, look.z);
            eye.updateMatrixWorld(true);
            const seen = bike.clone().project(eye);
            return Math.max(Math.abs(seen.x), Math.abs(seen.y));
        };
        // A look target far to the side, as the road round a hairpin is: the bike would be off the screen
        camera.anchor = { x: 0, y: 0, z: 0 };
        Object.assign(camera.springs.lx, { x: 40, v: 0, t: 40 });
        Object.assign(camera.springs.ly, { x: 0, v: 0, t: 0 });
        Object.assign(camera.springs.lz, { x: 0, v: 0, t: 0 });
        expect(project({ x: 40, y: 0, z: 0 })).toBeGreaterThan(1);
        const first = project(camera.aim(eye, bike, probe));
        expect(first).toBeLessThanOrEqual(T.keepHard + 1e-3);
        for (let i = 0; i < 60; i++) camera.aim(eye, bike, probe);
        const settled = project(camera.look);
        expect(settled).toBeLessThanOrEqual(T.keepIn + 0.01);
        expect(settled).toBeGreaterThan(T.keepIn - 0.02);
        // A look target that already shows the bike is left alone
        expect(camera.giveWay(eye, { x: 0, y: 1, z: 20 }, bike, probe, T.keepIn)).toBe(0);
    });

    test('land in the way shortens the boom before the boom reaches it, and it grows back slowly', () => {
        // A steep bank beside the road, rising over 8 m from z 76, and a camera hung 4 m out to that side
        const wall = { groundY: (x, z) => 100 + Math.max(0, x - 2) * 8 * Math.max(0, Math.min(1, (z - 76) / 8)) };
        const camera = new WorldCamera(road, wall);
        const at = s => ({ x: 0, y: 100, z: s, s, index: Math.floor(s / 4), speed: 12, lift: 1, offset: { x: 4, y: 3, z: -6 }, fov: 75 });
        camera.update(at(40), DT);
        expect(camera.fraction).toBe(1);
        const fractions = [], places = [];
        let reached = Infinity;
        for (let s = 40; s < 120; s += 12 * DT) {
            const placed = camera.update(at(s), DT);
            fractions.push(camera.fraction);
            places.push({ ...placed });
            if (camera.fraction < 1 && reached === Infinity) reached = s;
            // Never inside the land
            expect(placed.y).toBeGreaterThan(wall.groundY(placed.x, placed.z));
        }
        expect(Math.min(...fractions)).toBeLessThan(0.7);
        // It starts to shorten before the camera's place reaches the bank (6 m behind the bike)
        expect(reached).toBeLessThan(82);
        // The camera before snapped the boom short at once, in quarters of it
        const steps = fractions.slice(1).map((f, i) => Math.abs(f - fractions[i]));
        expect(Math.max(...steps)).toBeLessThan(0.05);
        const jerks = places.slice(2).map((c, i) => Math.hypot(c.x - 2 * places[i + 1].x + places[i].x, c.y - 2 * places[i + 1].y + places[i].y, c.z - 2 * places[i + 1].z + places[i].z));
        expect(Math.max(...jerks)).toBeLessThan(0.04);
        // Out in the open it grows back over about two seconds, not at once
        const open = new WorldCamera(road, flatGround(0));
        open.update(at(200), DT);
        Object.assign(open.springs.fraction, { x: 0.3, v: 0, t: 0.3 });
        open.update(at(200), DT);
        expect(open.fraction).toBeLessThan(0.32);
        for (let i = 0; i < 120; i++) open.update(at(200), DT);
        expect(open.fraction).toBeGreaterThan(0.9);
    });

    test('the camera never sits under the land', () => {
        const camera = new WorldCamera(road, flatGround(110));
        const out = camera.update({ x: 0, y: 100, z: 100, s: 100, index: 25, speed: 0, lift: 1, offset: { x: 0, y: 3, z: -6 }, fov: 75 }, DT);
        expect(out.y).toBeGreaterThanOrEqual(110 + WorldCamera.FLOOR_M);
        expect(WorldCamera.softFloor(150, 110)).toBe(150);
        expect(WorldCamera.softFloor(100, 110)).toBeGreaterThanOrEqual(110);
    });

    // A ride through a 12 m hairpin, sampled every 4 m as a world's ride is: 15 m/s on the straights, braking to 7 m/s
    // through the bend. The camera's position and look target must move with no frame-to-frame step or second
    // difference past small bounds. The camera before these springs went over both: its boom yaw turned at a capped
    // rate, its pull rose at a capped rate and its look target re-aimed at the polyline 0.6 of the way each frame.
    test('through a sampled 12 m hairpin the camera and its look target move without steps', () => {
        const R = 12;
        const route = hairpinRoute(R);
        const bendFrom = 200, bendTo = 200 + Math.PI * R;
        const speedAt = s => {
            const away = Math.max(0, bendFrom - s, s - bendTo);
            const u = Math.min(1, away / 60);
            return 7 + 8 * u * u * (3 - 2 * u);
        };
        const camera = new WorldCamera(route, flatGround(0));
        const eye = view();
        const probe = new THREE.PerspectiveCamera();
        const frames = [];
        for (let s = 120; s < bendTo + 80; s += speedAt(s) * DT) {
            const frame = frameOf(camera, bikeAt(route, s, speedAt(s)), eye, probe);
            frames.push(frame);
            // The bike stays in view on every frame
            expect(Math.max(Math.abs(frame.ndc.x), Math.abs(frame.ndc.y))).toBeLessThanOrEqual(T.keepHard + 1e-3);
        }
        const worst = key => {
            let step = 0, jerk = 0;
            // From half a second in: the first frames are the camera arriving behind the bike
            for (let i = 32; i < frames.length; i++) {
                const [a, b, c] = [frames[i - 2][key], frames[i - 1][key], frames[i][key]];
                step = Math.max(step, Math.hypot(c.x - b.x, c.y - b.y, c.z - b.z));
                jerk = Math.max(jerk, Math.hypot(c.x - 2 * b.x + a.x, c.y - 2 * b.y + a.y, c.z - 2 * b.z + a.z));
            }
            return { step, jerk };
        };
        const position = worst('position'), look = worst('look');
        // 15 m/s is 0.25 m a frame; the camera before went to 0.021 m a frame each frame
        expect(position.step).toBeLessThan(0.3);
        expect(position.jerk).toBeLessThan(0.01);
        // The look target runs round the far side of the bend at up to 40 m/s; the camera before went to 0.25 m
        expect(look.step).toBeLessThan(0.8);
        expect(look.jerk).toBeLessThan(0.05);
    });
});

describe('the stage looks and the atmosphere along a ride', () => {
    const route = new WorldRoute(samplesOf(straight(20000, { y: 1000 }).map((p, i) => ({ ...p, y: 1000 + i }))), {});
    const stages = [{ id: 'tremola', from: 0, to: 10000 }, { id: 'unknown', from: 10000, to: 20000 }];

    test('a stage takes its own parts, or the default; the track runs in 100 m units', () => {
        const track = AtmosphereTrack.forWorld(stages, route, WorldLooks);
        const sample = track.sample(5, {});
        expect(sample.a.timeOfDay).toBe('day');
        expect(AtmosphereTrack.WORLD_UNIT_M).toBe(100);
    });

    test('the Tremola starts in clear air, rains on the climb and is clear at the top, the far land is real terrain, and other looks are asked for', () => {
        const track = AtmosphereTrack.forWorld(stages, route, WorldLooks);
        expect(track.sample(5, {}).a.weather).toBe('clear');
        expect(track.sample(5, {}).a.fogDensity).toBeLessThanOrEqual(0.0008 / 10);
        expect(track.sample(5, {}).a.ring).toBe(0);
        expect(track.sample(70, {}).a.weather).toBe('rain');
        expect(track.sample(95, {}).a.weather).toBe('clear');
        // A stage with no entry takes the default, in clear air
        expect(track.sample(150, {}).a.weather).toBe('clear');
        const cloud = AtmosphereTrack.forWorld(stages, route, WorldLooks.pick('?world=tremola&worldLook=cloud'));
        expect(cloud.sample(5, {}).a.weather).toBe('clear');
        expect(cloud.sample(90, {}).a.weather).toBe('fog');
        const dry = AtmosphereTrack.forWorld(stages, route, WorldLooks.pick('?worldLook=dry'));
        expect(dry.sample(90, {}).a.weather).toBe('clear');
        expect(WorldLooks.pick('?worldLook=nothing')).toBe(WorldLooks);
    });

    test('baseY of a part is the lowest road under it', () => {
        const track = AtmosphereTrack.forWorld(stages, route, WorldLooks);
        expect(track.sample(2, {}).a.baseY).toBeCloseTo(route.heightRange(0, 2500).min, 6);
        expect(track.sample(70, {}).a.baseY).toBeCloseTo(route.heightRange(5300, 8000).min, 6);
    });

    test('the day preset is a new key in the sky presets and the time table, so no leg look changes', () => {
        const sky = loadScript('graphics.js');
        const main = loadScript('main.js');
        expect(sky).toMatch(/SKY_PRESETS = \{[\s\S]*\n    day: \{/);
        expect(main).toMatch(/timeConfigs = \{[\s\S]*\n            day: \{/);
    });
});
