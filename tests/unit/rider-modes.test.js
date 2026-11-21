/**
 * @jest-environment node
 */
// The rider modes (js/ridermodes.js): one table of modes over the tuning's ids and the hairpin assist's levels. Held
// here, on the real Vehicle with a real bike of the catalogue:
//   - the table names only real tuning ids, in their ranges, and real assist levels; a made-up row works unchanged
//   - the default mode is the ride with no mode and no tuning loaded, to the last bit
//   - the modes are in order by what can be measured on the bike
//   - the assist level follows the mode, and an old assist setting is moved once
//   - in a ride the mode changes only while the bike stands
//   - a ride in any mode keeps its time, and the debug panel's multipliers stay on top
// The control, the pause panel and the HUD's tag are in tests/unit/rider-modes-ui.test.js
import { describe, test, expect, afterEach } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { loadGame, loadScript } from '../helpers/load-game.js';
import { samplesOf, fakeData, allTiles, straight } from '../helpers/world-synthetic.js';

const DT = 1 / 60;
const printed = [];
const sink = { warn: (...args) => printed.push(args.join(' ')) };
const game = loadGame(undefined, printed);
const { THREE, Tuning, Vehicle, WorldPhysics, WorldAssist, WorldCamera, CHARACTERS, BIKE_MODELS } = game;
const modesOf = (tuning, assist) => new Function('Tuning', 'WorldAssist', 'console', `${loadScript('ridermodes.js')}\nreturn RiderModes;`)(tuning, assist, sink);
const RiderModes = modesOf(Tuning, WorldAssist);
const { SteerEase } = new Function(`${loadScript('input.js')}\nreturn { SteerEase };`)();
const ROWS = RiderModes.MODES.length;

// The rider and the bike of the catalogue with the most power to spare, by rule: no test names a bike
const RIDER = CHARACTERS.map(character => character.bikes.filter(id => BIKE_MODELS[id]).map(id => ({ character, id, spare: BIKE_MODELS[id].spare || 0 }))).flat()
    .reduce((best, entry) => (entry.spare > best.spare ? entry : best));

// A storage that counts its reads by key
const storageOf = (stored = {}) => {
    const kept = { ...stored }, reads = {};
    return {
        kept, reads,
        getItem(key) { reads[key] = (reads[key] || 0) + 1; return key in kept ? kept[key] : null; },
        setItem(key, value) { kept[key] = String(value); },
        removeItem(key) { delete kept[key]; }
    };
};

afterEach(() => {
    RiderModes.MODES.length = ROWS;
    RiderModes.listeners.length = 0;
    RiderModes.start({ storage: null });
    Tuning.start({ debug: false });
    printed.length = 0;
});

function bike(GameSet = game) {
    return new GameSet.Vehicle(new GameSet.THREE.Scene(), null, GameSet.CHARACTERS.find(c => c.id === RIDER.character.id), RIDER.id, { model: false });
}

// The bike on a flat plane with no road, as a world rides it
function onPlane(GameSet = game) {
    const v = bike(GameSet);
    v.environment = {
        physics: GameSet.WorldPhysics,
        route: { unitCount: 0, fromUnits: u => u, project: () => ({ index: -1 }), sample: () => ({ grade: 0, flags: {} }) }
    };
    return v;
}

// The bike on a 10 m road along +z over flat ground, at `lateral`, with the assist of the mode in force
function onRoad(GameSet = game, lateral = 0) {
    const route = new GameSet.WorldRoute(samplesOf(straight(3000)), {});
    const ground = new GameSet.WorldGround(route, fakeData({ tiles: allTiles(-1, 0, -1, 6), zone: x => (Math.abs(x) <= 5 ? 1 : 0) }));
    const v = bike(GameSet);
    v.environment = { physics: GameSet.WorldPhysics, route, ground };
    v.position.set(lateral, 100, 40);
    v.yawAngle = 0;
    v.findNearestRoadSegment();
    return v;
}

// What a rider feels of a mode, measured on the bike on the flat
const MEASURES = {
    // m/s, held after 90 s of full throttle
    topSpeed() {
        const v = onPlane();
        v.speed = 50;
        for (let i = 0; i < 60 * 90; i++) v.update(DT, 0, 1, 0);
        return v.speed;
    },
    // s, from a stop to 20 m/s with the throttle key held
    launch() {
        const v = onPlane();
        v.speed = 0;
        let t = 0;
        while (v.speed < 20 && t < 60) {
            v.update(DT, 0, 1, 0);
            t += DT;
        }
        return t;
    },
    // m, from 25 m/s to a stop with the brake key held
    stopping() {
        const v = onPlane();
        v.speed = 25;
        let distance = 0;
        for (let i = 0; i < 3000 && v.speed > 0; i++) {
            v.update(DT, 0, 0, 1);
            distance += v.speed * DT;
        }
        return distance;
    },
    // s, from upright to 30 degrees of lean at 15 m/s with a steer key held (the key's own ramp is in it)
    leanIn() {
        const v = onPlane();
        const ease = new SteerEase();
        ease.turn(1, v.worldPhysics.steerKeys);
        let t = 0;
        while (Math.abs(v.leanAngle) < 30 * Math.PI / 180 && t < 10) {
            ease.advance(DT);
            v.speed = 15;
            v.updateWorldPhysics(DT, ease.value);
            t += DT;
        }
        return t;
    }
};

const measured = (id) => {
    RiderModes.set(id);
    return Object.fromEntries(Object.entries(MEASURES).map(([name, of]) => [name, of()]));
};

describe('the table', () => {
    test('every mode has an id and a name of its own, a line for the menu, a real assist level and real tuning ids in their ranges', () => {
        const ids = RiderModes.MODES.map(mode => mode.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(new Set(RiderModes.MODES.map(mode => mode.name)).size).toBe(ids.length);
        for (const mode of RiderModes.MODES) {
            expect(mode.name.length).toBeGreaterThan(0);
            expect(mode.hint.length).toBeGreaterThan(10);
            expect(Object.keys(WorldPhysics.assistLevels)).toContain(mode.assist);
            for (const [id, value] of Object.entries(mode.tune)) {
                expect({ mode: mode.id, id, refusal: Tuning.refusal(id, value) }).toEqual({ mode: mode.id, id, refusal: null });
                // A row holds only what it changes
                expect(value).not.toBe(1);
            }
        }
    });

    test('the four modes are Rain, Road, Sport and Track, and the default is the one with every multiplier at 1', () => {
        expect(RiderModes.MODES.map(mode => mode.name)).toEqual(['Rain', 'Road', 'Sport', 'Track']);
        const plain = RiderModes.MODES.filter(mode => Object.keys(mode.tune).length === 0);
        expect(plain.map(mode => mode.id)).toEqual([RiderModes.DEFAULT]);
        // Its assist is the assist's own default: the level of a ride with no mode
        expect(RiderModes.row(RiderModes.DEFAULT).assist).toBe(WorldAssist.DEFAULT);
        expect(RiderModes.start({ storage: null }).id).toBe(RiderModes.DEFAULT);
    });

    test('no code names a mode: only the table holds their ids', () => {
        const ids = RiderModes.MODES.map(mode => mode.id).join('|');
        const names = new RegExp(`['"\`](${ids})['"\`]`);
        const source = loadScript('ridermodes.js');
        const logic = source.slice(source.indexOf('    current:'));
        expect(logic).not.toMatch(names);
        for (const file of ['main.js', 'tours.js', 'hud.js', 'world/credits.js', 'world/run.js', 'world/guide.js', 'tuning.js']) {
            const text = loadScript(file).split('\n').filter(line => /RiderModes|setMode|stepRiderMode/.test(line)).join('\n');
            expect({ file, named: names.test(text) }).toEqual({ file, named: false });
        }
    });

    test('a made-up fifth row works through the same code', () => {
        const brake = () => { const v = onPlane(); return v.worldBrakeDecel(v.worldMultipliers()); };
        const one = brake();
        RiderModes.MODES.push({ id: 'made-up', name: 'Made up', tone: '', assist: 'low', hint: 'A row no code knows', tune: { brake: 1.3 } });
        const storage = storageOf();
        RiderModes.start({ storage });
        expect(RiderModes.set('made-up').name).toBe('Made up');
        expect(storage.kept[RiderModes.KEY]).toBe('made-up');
        expect(brake()).toBeCloseTo(one * 1.3, 9);
        expect(onRoad().assistShare()).toBe(WorldPhysics.assistLevels.low);
        // It is stored and read back, and the step goes round five
        expect(RiderModes.start({ storage }).id).toBe('made-up');
        const round = [];
        for (let i = 0; i < 5; i++) round.push(RiderModes.step(0).mode.id);
        expect(round).toEqual([...RiderModes.MODES.slice(0, 4).map(mode => mode.id), 'made-up']);
    });

    test('a row with an id the tuning does not know is refused aloud', () => {
        RiderModes.MODES.push({ id: 'broken', name: 'Broken', tone: '', assist: 'low', hint: '', tune: { noSuchRow: 1.1 } });
        expect(() => RiderModes.set('broken')).toThrow(/unknown id "noSuchRow"/);
    });
});

describe('the default mode is the ride with no mode at all', () => {
    const bypassed = loadGame(undefined, [], { 'tuning.js': '' });

    // A ride with every input in it: steering both ways, the throttle, the brake while leaned, a wheelie, and a
    // stretch on the land beside the road
    const inputs = (i) => {
        const t = i * DT;
        const steer = Math.sin(t * 1.3) * (t > 14 && t < 20 ? 1 : 0.6);
        const throttle = t % 9 < 6 ? 1 : 0;
        const brake = t % 9 > 7 ? 1 : 0;
        const wheelie = Math.abs(t - 3) < 0.05 || Math.abs(t - 11) < 0.05 ? 1 : 0;
        return [steer, throttle, brake, wheelie];
    };
    const state = v => [v.position.x, v.position.y, v.position.z, v.velocity.x, v.velocity.z, ...Vehicle.PHYSICS_STATE.map(k => v[k]), v.worldThrottle, v.assistApplied || 0, v.crashed ? 1 : 0];

    function ride(GameSet, make, seconds = 30) {
        const v = make(GameSet);
        v.speed = 12;
        const rows = [];
        for (let i = 0; i < seconds * 60; i++) {
            v.update(DT, ...inputs(i));
            rows.push(state(v));
            if (v.crashed) {
                v.reset();
                v.speed = 12;
            }
        }
        return rows;
    }

    const same = (a, b) => {
        expect(a.length).toBe(b.length);
        for (let i = 0; i < a.length; i++) {
            for (let k = 0; k < a[i].length; k++) {
                if (!Object.is(a[i][k], b[i][k])) throw new Error(`step ${i}, value ${k}: ${a[i][k]} is not ${b[i][k]}`);
            }
        }
    };
    const differs = (a, b) => a.some((row, i) => row.some((value, k) => !Object.is(value, b[i][k])));

    test('the other game has no tuning, no mode, and the assist at its own default', () => {
        expect(bypassed.Tuning).toBeUndefined();
        expect(bypassed.WorldAssist.level()).toBe('normal');
    });

    for (const [name, make] of [['on a plane', onPlane], ['on a road with land beside it', G => onRoad(G, 3)], ['near the edge of the road, where the assist acts', G => onRoad(G, 4.4)]]) {
        test(`a world ride ${name}: the default mode chosen at the start, and chosen again after every other mode`, () => {
            const base = ride(bypassed, make);
            RiderModes.start({ storage: storageOf() });
            expect(Tuning.live).toBe(false);
            same(ride(game, make), base);
            for (const mode of RiderModes.MODES) {
                if (mode.id === RiderModes.DEFAULT) continue;
                RiderModes.set(mode.id);
                expect({ mode: mode.id, moved: differs(ride(game, make), base) }).toEqual({ mode: mode.id, moved: true });
                RiderModes.set(RiderModes.DEFAULT);
                same(ride(game, make), base);
            }
        });
    }

    test('at the default mode nothing is copied: the world physics is the object itself', () => {
        RiderModes.start({ storage: null });
        // The rider's own view (Vehicle.riderWorld: the lean limit by the rider's daring) is what a mode multiplies
        const plain = onPlane();
        expect(plain.worldPhysics).toBe(plain.riderWorld(WorldPhysics));
        RiderModes.set(RiderModes.MODES.find(mode => Object.keys(mode.tune).length > 0).id);
        expect(onPlane().worldPhysics).not.toBe(WorldPhysics);
        expect(Object.isFrozen(WorldPhysics)).toBe(true);
    });
});

describe('the modes in order, measured on the bike', () => {
    const by = Object.fromEntries(RiderModes.MODES.map(mode => [mode.id, null]));
    const of = (id) => by[id] || (by[id] = measured(id));

    test('top speed: Rain < Road = Sport = Track (no mode is faster than the bike: the board\'s floor is a speed)', () => {
        expect(of('rain').topSpeed).toBeLessThan(of('road').topSpeed - 2);
        expect(of('sport').topSpeed).toBe(of('road').topSpeed);
        expect(of('track').topSpeed).toBe(of('road').topSpeed);
        for (const mode of RiderModes.MODES) {
            expect(mode.tune.topSpeed === undefined || mode.tune.topSpeed < 1).toBe(true);
            expect(mode.tune.accel === undefined || mode.tune.accel < 1).toBe(true);
        }
    });

    test('0 to 20 m/s: Rain > Road > Sport > Track, in seconds', () => {
        expect(of('rain').launch).toBeGreaterThan(of('road').launch + 0.2);
        expect(of('road').launch).toBeGreaterThan(of('sport').launch);
        expect(of('sport').launch).toBeGreaterThan(of('track').launch);
    });

    test('stopping from 25 m/s: Rain > Road > Sport > Track, in metres', () => {
        expect(of('rain').stopping).toBeGreaterThan(of('road').stopping * 1.05);
        expect(of('road').stopping).toBeGreaterThan(of('sport').stopping * 1.03);
        expect(of('sport').stopping).toBeGreaterThan(of('track').stopping * 1.03);
    });

    test('time to 30 degrees of lean with a key held: Rain > Road > Sport > Track, in seconds', () => {
        expect(of('rain').leanIn).toBeGreaterThan(of('road').leanIn);
        expect(of('road').leanIn).toBeGreaterThan(of('sport').leanIn);
        expect(of('sport').leanIn).toBeGreaterThan(of('track').leanIn);
    });

    test('Rain is rideable: it climbs a 12% grade from a stop and holds more than 25 m/s on it', () => {
        RiderModes.set('rain');
        const v = onPlane();
        v.environment.route.sample = () => ({ grade: 0.12, flags: {} });
        v.speed = 0;
        for (let i = 0; i < 60 * 40; i++) v.update(DT, 0, 1, 0);
        expect(v.speed).toBeGreaterThan(25);
    });

    test('the lean a held key reaches: Track leans further than Road, and no mode lowsides at its own limit', () => {
        const held = (id) => {
            RiderModes.set(id);
            const v = onPlane();
            v.speed = 30;
            for (let i = 0; i < 60 * 4 && !v.crashed; i++) {
                v.speed = 30;
                v.updateWorldPhysics(DT, 1);
            }
            return { lean: Math.abs(v.leanAngle), crashed: v.crashed };
        };
        const all = Object.fromEntries(RiderModes.MODES.map(mode => [mode.id, held(mode.id)]));
        for (const mode of RiderModes.MODES) expect({ mode: mode.id, crashed: all[mode.id].crashed }).toEqual({ mode: mode.id, crashed: false });
        expect(all.track.lean).toBeGreaterThan(all.road.lean);
        expect(all.track.lean - all.road.lean).toBeGreaterThan(0.02);
        expect(all.sport.lean).toBeCloseTo(all.road.lean, 5);
        expect(all.rain.lean).toBeCloseTo(all.road.lean, 5);
    });
});

describe('the hairpin assist follows the mode', () => {
    test('each mode rides with its own level, on a world; a classic leg has none in any mode', () => {
        for (const mode of RiderModes.MODES) {
            RiderModes.set(mode.id);
            expect(WorldAssist.level()).toBe(mode.assist);
            expect(onRoad().assistShare()).toBe(WorldPhysics.assistLevels[mode.assist]);
            const leg = bike();
            leg.environment = { physics: null };
            expect(leg.assistShare()).toBe(0);
        }
        const shares = RiderModes.MODES.map(mode => WorldPhysics.assistLevels[mode.assist]);
        // Rain and Road the whole assist, Sport less, Track none
        expect(shares).toEqual([1, 1, 0.5, 0]);
    });

    test('an old assist setting is moved to the default mode once, and its key is not read again', () => {
        for (const old of Object.keys(WorldPhysics.assistLevels)) {
            const storage = storageOf({ [RiderModes.OLD_KEY]: old });
            expect(RiderModes.start({ storage }).id).toBe(RiderModes.DEFAULT);
            expect(storage.kept).toEqual({ [RiderModes.KEY]: RiderModes.DEFAULT });
            expect(storage.reads[RiderModes.OLD_KEY]).toBe(1);
            // The rider is told once when the assist they had chosen is not the mode's
            const changed = old !== RiderModes.row(RiderModes.DEFAULT).assist;
            expect(RiderModes.note === null).toBe(!changed);
            if (changed) expect(RiderModes.note).toMatch(/hairpin assist is now part of the rider mode/);
            expect(WorldAssist.level()).toBe(RiderModes.row(RiderModes.DEFAULT).assist);
            // The next page: the mode is read, the old key is not, and nothing is said
            expect(RiderModes.start({ storage }).id).toBe(RiderModes.DEFAULT);
            expect(storage.reads[RiderModes.OLD_KEY]).toBe(1);
            expect(RiderModes.note).toBeNull();
        }
    });

    test('a stored mode is read and the old key left alone; nothing stored, or a mode no row has, is the default', () => {
        const kept = storageOf({ [RiderModes.KEY]: 'sport', [RiderModes.OLD_KEY]: 'off' });
        expect(RiderModes.start({ storage: kept }).id).toBe('sport');
        expect(kept.reads[RiderModes.OLD_KEY]).toBeUndefined();
        expect(RiderModes.note).toBeNull();
        const empty = storageOf();
        expect(RiderModes.start({ storage: empty }).id).toBe(RiderModes.DEFAULT);
        expect(empty.kept).toEqual({});
        expect(RiderModes.start({ storage: storageOf({ [RiderModes.KEY]: 'no-such-mode' }) }).id).toBe(RiderModes.DEFAULT);
    });

    test('a choice is stored under the one key, and storage that throws costs only the memory of it', () => {
        const storage = storageOf();
        RiderModes.start({ storage });
        RiderModes.set('track');
        expect(storage.kept).toEqual({ [RiderModes.KEY]: 'track' });
        expect(RiderModes.set('no-such-mode').id).toBe('track');
        const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
        expect(RiderModes.start({ storage: broken }).id).toBe(RiderModes.DEFAULT);
        expect(RiderModes.set('rain').id).toBe('rain');
        expect(RiderModes.get().id).toBe('rain');
        expect(printed.some(line => /could not be/.test(line))).toBe(true);
    });
});

describe('in a ride the mode changes only while the bike stands', () => {
    test('the rule: under STOP_SPEED the bike stands', () => {
        expect(RiderModes.canChange(0)).toBe(true);
        expect(RiderModes.canChange(RiderModes.STOP_SPEED - 0.01)).toBe(true);
        expect(RiderModes.canChange(RiderModes.STOP_SPEED)).toBe(false);
        expect(RiderModes.canChange(30)).toBe(false);
        expect(RiderModes.canChange(-3)).toBe(false);
        // A world's bike with a foot down is at 0, and a creep is under the bound the foot goes down at
        expect(RiderModes.STOP_SPEED).toBeLessThan(WorldPhysics.footDownSpeed);
    });

    test('the step: refused while moving and nothing changes; at a stop it is the next mode, round the table', () => {
        const storage = storageOf();
        RiderModes.start({ storage });
        const told = [];
        RiderModes.watch(mode => told.push(mode.id));
        const moving = RiderModes.step(12);
        expect(moving).toEqual({ changed: false, mode: RiderModes.row(RiderModes.DEFAULT) });
        expect(storage.kept).toEqual({});
        expect(told).toEqual([]);
        expect(Tuning.live).toBe(false);
        const at = RiderModes.MODES.findIndex(mode => mode.id === RiderModes.DEFAULT);
        const stopped = RiderModes.step(0);
        expect(stopped.changed).toBe(true);
        expect(stopped.mode).toBe(RiderModes.MODES[(at + 1) % ROWS]);
        expect(told).toEqual([stopped.mode.id]);
        expect(storage.kept[RiderModes.KEY]).toBe(stopped.mode.id);
        for (let i = 1; i < ROWS; i++) RiderModes.step(0);
        expect(RiderModes.get().id).toBe(RiderModes.DEFAULT);
    });

    test('a bike that brakes to a stop in a world ride reaches the bound', () => {
        const v = onPlane();
        v.speed = 20;
        let allowed = RiderModes.canChange(v.speed);
        expect(allowed).toBe(false);
        for (let i = 0; i < 60 * 10 && !allowed; i++) {
            v.update(DT, 0, 0, 1);
            allowed = RiderModes.canChange(v.speed);
        }
        expect(allowed).toBe(true);
    });
});

describe('a ride in any mode keeps its time', () => {
    const mainSource = readFileSync(new URL('../../js/main.js', import.meta.url), 'utf8');
    const classSource = mainSource.slice(0, mainSource.indexOf('Game.RESTART_CLEAR_SEGMENTS = 6;') + 'Game.RESTART_CLEAR_SEGMENTS = 6;'.length);
    const Game = new Function('THREE', 'WorldCamera', 'showCallout', 'TourSystem', 'Course', 'Tuning', `${classSource}\nreturn Game;`)(THREE, WorldCamera, () => {}, {}, {}, Tuning);

    const rideOf = (environment, more = {}) => {
        const shown = [];
        const made = Object.create(Game.prototype);
        Object.assign(made, { hud: { setTuned: on => shown.push(on) }, environment, ...more });
        return { made, shown };
    };

    test('no mode flags the ride: a world stays trusted and a classic leg keeps its leaderboard session', () => {
        for (const debug of [false, true]) {
            Tuning.start({ debug });
            for (const mode of RiderModes.MODES) {
                RiderModes.set(mode.id);
                const world = rideOf({ isWorld: true, trusted: true, get submitAllowed() { return this.trusted; } });
                world.made.beginTunedRide();
                // A change of mode in the ride (at a stop) does not flag it either
                RiderModes.set(RiderModes.next().id);
                world.made.watchTuning();
                expect({ debug, mode: mode.id, tuned: Tuning.ride.tuned, submit: world.made.environment.submitAllowed, tag: world.shown })
                    .toEqual({ debug, mode: mode.id, tuned: false, submit: true, tag: [false] });
                const calls = [];
                const service = { isActive: () => true, cancelSession: () => calls.push('cancel') };
                const leg = rideOf({ isWorld: false }, { leaderboardService: service });
                leg.made.beginTunedRide();
                leg.made.watchTuning();
                expect(calls).toEqual([]);
            }
        }
    });

    test('the debug panel\'s multiplier multiplies on top of the mode\'s, and only the panel flags the ride', () => {
        Tuning.start({ debug: true });
        const mode = RiderModes.MODES.find(row => row.tune.brake !== undefined && row.tune.brake !== 1);
        RiderModes.set(mode.id);
        expect(Tuning.of('brake')).toBe(mode.tune.brake);
        expect(Tuning.ride.tuned).toBe(false);
        Tuning.set('brake', 1.2);
        expect(Tuning.of('brake')).toBeCloseTo(1.2 * mode.tune.brake, 12);
        expect(Tuning.ride.tuned).toBe(true);
        // The panel's Reset leaves the mode
        Tuning.reset();
        expect(Tuning.of('brake')).toBe(mode.tune.brake);
        // And the panel's text holds the panel's values only
        expect(Tuning.text()).toBe(Tuning.FORMAT);
    });

    test('the mode is not part of what a board is sent: the functions and the board contract do not know it', () => {
        expect(loadScript('leaderboard.js')).not.toMatch(/RiderModes|riderMode/);
    });
});
