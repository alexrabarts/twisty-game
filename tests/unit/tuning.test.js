/**
 * @jest-environment node
 */
// The tuning (js/tuning.js): one table of parameters, each a multiplier over numbers of the handling, moved by the
// panel of debug mode. Held here, on the real Vehicle with a real bike of the catalogue:
//   - every row of the table moves something that can be measured, the right way, at 1.2 and at 0.8
//   - with every multiplier at 1 a scripted ride is the ride with the tuning not loaded at all, to the last bit
//   - outside debug mode what is stored is not read
//   - a ride that was tuned at any moment is flagged, and stays flagged after Reset
//   - the copied text reads back, and a line that cannot be taken is refused with a message
import { describe, test, expect, afterEach } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { loadGame, loadScript } from '../helpers/load-game.js';
import { samplesOf, fakeData, allTiles, straight } from '../helpers/world-synthetic.js';
import { paceOn } from '../helpers/world-offroad-measure.js';

const DT = 1 / 60;
// What the game's scripts print (their console is this list)
const printed = [];
const game = loadGame(undefined, printed);
const { THREE, Tuning, Vehicle, WorldPhysics, WorldRoute, WorldGround, WorldCamera, CHARACTERS, BIKE_MODELS } = game;
const { SteerEase } = new Function(`${loadScript('input.js')}\nreturn { SteerEase };`)();

// The rider and the bike of the catalogue with the most power to spare (it can hold a wheelie on the throttle), by
// rule: no test names a bike
const RIDER = CHARACTERS.map(character => character.bikes.filter(id => BIKE_MODELS[id]).map(id => ({ character, id, spare: BIKE_MODELS[id].spare || 0 }))).flat()
    .reduce((best, entry) => (entry.spare > best.spare ? entry : best));

const storageOf = (stored) => {
    const kept = { ...stored };
    return { kept, getItem: key => (key in kept ? kept[key] : null), setItem(key, value) { kept[key] = String(value); } };
};

afterEach(() => {
    Tuning.setMode(null);
    Tuning.start({ debug: false });
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
    v.assistLevel = 'off';
    return v;
}

// The bike on a 10 m road along +z over flat ground, at `lateral`
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

// The lean (rad) after `seconds` of the steering held at `steer`, at a held speed, from a lean of `from`
function leanAfter(speed, steer, seconds, from = 0, weather = null) {
    const v = onPlane();
    if (weather) v.weatherSystem = weather;
    v.speed = speed;
    v.leanAngle = from;
    for (let i = 0; i < Math.round(seconds / DT) && !v.crashed; i++) {
        v.speed = speed;
        v.updateWorldPhysics(DT, steer);
    }
    return { lean: Math.abs(v.leanAngle), yaw: Math.abs(v.yawAngle), crashed: v.crashed };
}

const WET = { surfaceGrip: 1, weatherPhysics: () => ({ lateralFriction: 0.7, brakeForce: 0.8, acceleration: 0.9 }), getPhysicsMultipliers: () => ({ lateralFriction: 0.7, brakeForce: 0.8, acceleration: 0.9 }) };

// The Game class alone, with the tuning it reads, for the chase camera of a classic leg
const mainSource = readFileSync(new URL('../../js/main.js', import.meta.url), 'utf8');
const classSource = mainSource.slice(0, mainSource.indexOf('Game.RESTART_CLEAR_SEGMENTS = 6;') + 'Game.RESTART_CLEAR_SEGMENTS = 6;'.length);
const Game = new Function('THREE', 'WorldCamera', 'showCallout', 'TourSystem', 'Course', 'Tuning', `${classSource}\nreturn Game;`)(
    THREE, WorldCamera, () => {}, {}, {}, Tuning
);

// The chase camera of a leg behind a bike that stands leaned at `lean`: how far it is from the bike, and how far to
// the side
function chase(lean) {
    const offset = new THREE.Vector3(0, 3, -6);
    const mode = { name: 'Near chase', type: 'near', offset, lerpFactor: 0.10 };
    const vehicle = {
        position: new THREE.Vector3(0, 100, 40), velocity: new THREE.Vector3(), speed: 0, maxSpeed: 60, leanAngle: lean, yawAngle: 0,
        comfortShake: 0, isWheelie: false, isJumping: false, fallingOffCliff: false, crashed: false, projection: { s: 40, index: 10 }, routeS: 40
    };
    const made = Object.create(Game.prototype);
    Object.assign(made, {
        camera: new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 2000), vehicle, cameraModes: [mode], cameraMode: 0, cameraIntroActive: false,
        environment: { isWorld: false }, baseCameraOffset: offset.clone(), cameraOffset: offset.clone(),
        currentCameraPos: new THREE.Vector3(0, 103, 34), currentLookTarget: new THREE.Vector3(0, 101, 40),
        tempMatrix: new THREE.Matrix4(), tempVector: new THREE.Vector3(), tempUpVector: new THREE.Vector3(),
        cameraLerpFactor: 0.10, cameraLateralOffset: 0, previousYawAngle: 0, currentCameraBanking: 0, currentFOV: 75,
        tunnelRoofY: () => null, updateShadowCamera() {}
    });
    for (let i = 0; i < 600; i++) made.updateCamera(DT);
    const eye = made.currentCameraPos;
    return { distance: eye.distanceTo(vehicle.position), side: Math.abs(eye.x - vehicle.position.x) };
}

// What each row moves: a number measured on the bike, and the way it goes when the multiplier rises (1 up, -1 down).
// A row with no entry here fails the test below, so a new row brings its measure with it
const MEASURES = {
    steerRate: { way: 1, of: () => leanAfter(15, 1, 0.25).lean },
    steerFast: { way: 1, of: () => leanAfter(45, 1, 0.25).lean },
    steerSlow: { way: 1, of: () => leanAfter(2, 1, 1).yaw },
    pickUp: { way: -1, of: () => leanAfter(15, 1, 0.2, 0.5).lean },
    selfRight: { way: -1, of: () => leanAfter(15, 0, 0.3, 0.5).lean },
    leanMax: { way: 1, of: () => leanAfter(30, 1, 3).lean },
    steerKey: {
        way: -1,
        of: () => {
            const ease = new SteerEase();
            ease.turn(1, onPlane().worldPhysics.steerKeys);
            ease.advance(0.02);
            return ease.value;
        }
    },
    brake: {
        way: -1,
        of: () => {
            const v = onPlane();
            v.speed = 30;
            let distance = 0;
            for (let i = 0; i < 1200 && v.speed > 0; i++) {
                v.update(DT, 0, 0, 1);
                distance += v.speed * DT;
            }
            return distance;
        }
    },
    brakeLean: {
        way: 1,
        of: () => {
            const v = onPlane();
            v.leanAngle = v.worldPhysics.leanCapDeg * Math.PI / 180;
            return v.worldBrakeDecel(v.worldMultipliers());
        }
    },
    engineBrake: {
        way: -1,
        of: () => {
            const v = onPlane();
            v.speed = 30;
            for (let i = 0; i < 120; i++) v.update(DT, 0, 0, 0);
            return v.speed;
        }
    },
    accel: {
        way: -1,
        of: () => {
            const v = onPlane();
            v.speed = 0;
            let t = 0;
            while (v.speed < 20 && t < 30) {
                v.update(DT, 0, 1, 0);
                t += DT;
            }
            return t;
        }
    },
    topSpeed: {
        way: 1,
        of: () => {
            const v = onPlane();
            v.speed = 50;
            for (let i = 0; i < 60 * 90; i++) v.update(DT, 0, 1, 0);
            return v.speed;
        }
    },
    // The opening of the twist grip 0.2 s after the throttle key goes down
    throttle: {
        way: 1,
        of: () => {
            const v = onPlane();
            v.speed = 10;
            for (let i = 0; i < 12; i++) v.update(DT, 0, 1, 0);
            return v.worldThrottle;
        }
    },
    // The least lean past the grip's own, as a share of it, from which the bike lowsides with the steering held
    lowside: {
        way: 1,
        of: () => {
            const cap = Math.tan(WorldPhysics.leanCapDeg * Math.PI / 180);
            for (let k = 1; k < 3; k += 0.01) {
                if (leanAfter(30, 1, 0.5, -Math.atan(k * cap)).crashed) return k;
            }
            return 3;
        }
    },
    gripDry: { way: 1, of: () => leanAfter(30, 1, 3).lean },
    gripWet: { way: 1, of: () => leanAfter(30, 1, 3, 0, WET).lean },
    assist: {
        way: 1,
        of: () => {
            const v = onRoad(game, 4.6);
            v.assistLevel = 'normal';
            v.speed = 15;
            const rates = [0.1, -0.1].map((yaw) => {
                v.yawAngle = yaw;
                v.edgeUsedS = 0;
                return Math.abs(v.edgeAssistRate(0, DT));
            });
            return Math.max(...rates);
        }
    },
    // The grip the lean gains 10 cm from the edge of a 10 m road, leaned to turn back in
    edgeLean: {
        way: 1,
        of: () => {
            const v = onRoad(game, 4.9);
            v.assistLevel = 'normal';
            v.speed = 15;
            v.leanAngle = 0.5;
            return v.edgeLean();
        }
    },
    wheeliePop: {
        way: 1,
        of: () => {
            const v = bike();
            v.speed = 10;
            v.updateWheelie(DT, 0, 0, 1);
            return v.wheelieVelocity;
        }
    },
    wheelieLift: {
        way: 1,
        of: () => {
            const v = bike();
            v.speed = 10;
            v.updateWheelie(DT, 1, 0, 1);
            const popped = v.wheelieVelocity;
            v.updateWheelie(DT, 1, 0, 0);
            // What one step of the throttle added over gravity and the damping, which the tuning leaves alone
            return v.wheelieVelocity / (1 - v.wheelieDamping * 0.3) - popped;
        }
    },
    offroadPace: { way: 1, of: () => paceOn(game, [RIDER.character.id, RIDER.id]) },
    bar: { way: 1, of: () => Math.abs(Vehicle.barShown(0.3, 0.5, 20, 0, 1.4)) },
    body: { way: 1, of: () => Math.abs(Vehicle.riderLean(0.5, 1).roll) + Math.abs(Vehicle.riderLean(0.5, 1).shift) },
    camDistance: { way: 1, of: () => chase(0).distance },
    camSwing: { way: 1, of: () => chase(0.4).side }
};

describe('the table', () => {
    test('every row has an id of its own, a range that holds 1, and numbers it scales', () => {
        const ids = Tuning.PARAMS.map(row => row.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const row of Tuning.PARAMS) {
            expect(row.id).toMatch(/^[A-Za-z][A-Za-z0-9]*$/);
            expect(row.label.length).toBeGreaterThan(0);
            // The panel's label column is narrow
            expect(row.label.length).toBeLessThanOrEqual(13);
            expect(row.hint.length).toBeGreaterThan(row.label.length);
            expect(row.group.length).toBeGreaterThan(0);
            expect(row.min).toBeLessThan(1);
            expect(row.max).toBeGreaterThan(1);
            expect(row.step).toBeGreaterThan(0);
            expect(row.scales.length).toBeGreaterThan(0);
        }
    });

    test('every field a row names is a real number of the game', () => {
        const at = (object, path) => path.split('.').reduce((node, key) => (node === undefined || node === null ? undefined : node[key]), object);
        const v = bike();
        const known = { grip: ['dry', 'wet'], camera: ['distance', 'swing'] };
        for (const row of Tuning.PARAMS) {
            for (const target of row.scales) {
                if (target.on === 'world') expect(typeof at(WorldPhysics, target.field)).toBe('number');
                else if (target.on === 'bar') expect(typeof Vehicle.BAR[target.field]).toBe('number');
                else if (target.on === 'body') expect(typeof Vehicle.BODY[target.field]).toBe('number');
                else if (target.on === 'bike') expect(typeof v[target.field]).toBe('number');
                else expect(known[target.on]).toContain(target.field);
            }
        }
    });

    test('a row marked as a world ride only scales nothing a classic leg reads', () => {
        for (const row of Tuning.PARAMS) {
            const legs = row.scales.some(target => target.on !== 'world');
            expect(row.world).toBe(!legs);
        }
    });
});

describe('every row moves something real, the right way', () => {
    for (const row of Tuning.PARAMS) {
        test(`${row.id} (${row.label})`, () => {
            const measure = MEASURES[row.id];
            expect(measure).toBeDefined();
            const at = (m) => {
                Tuning.start({ debug: true });
                if (m !== 1) Tuning.set(row.id, m);
                const value = measure.of();
                Tuning.reset();
                return value;
            };
            const one = at(1), more = at(1.2), less = at(0.8);
            expect(Number.isFinite(one) && Number.isFinite(more) && Number.isFinite(less)).toBe(true);
            expect(measure.way * (more - one)).toBeGreaterThan(1e-6);
            expect(measure.way * (one - less)).toBeGreaterThan(1e-6);
        });
    }

    test('the dry grip leaves the wet road alone, and the wet grip the dry road', () => {
        Tuning.start({ debug: true });
        const dry = MEASURES.gripDry.of(), wet = MEASURES.gripWet.of();
        Tuning.set('gripDry', 1.2);
        expect(MEASURES.gripWet.of()).toBe(wet);
        Tuning.reset();
        Tuning.set('gripWet', 1.2);
        expect(MEASURES.gripDry.of()).toBe(dry);
    });

    test('a classic leg reads the rows that are not a world ride only', () => {
        // The legacy steering and speed, on a bike with no world under it
        const leg = (id, m, run) => {
            Tuning.start({ debug: true });
            if (m !== 1) Tuning.set(id, m);
            const v = bike();
            const out = run(v);
            Tuning.reset();
            return out;
        };
        const lean = v => { v.speed = 20; for (let i = 0; i < 10; i++) v.updatePhysics(DT, 1); return Math.abs(v.leanAngle); };
        const braked = v => { v.speed = 30; v.updateSpeed(DT, 0, 1); return 30 - v.speed; };
        const pulled = v => { v.speed = 10; v.updateSpeed(DT, 1, 0); return v.speed - 10; };
        const top = v => { v.speed = 500; v.updateSpeed(DT, 0, 0); return v.speed; };
        for (const [id, run] of [['steerRate', lean], ['brake', braked], ['accel', pulled], ['topSpeed', top]]) {
            const one = leg(id, 1, run);
            expect(leg(id, 1.2, run)).toBeGreaterThan(one);
            expect(leg(id, 0.8, run)).toBeLessThan(one);
        }
    });

    test('a rider mode multiplies over the same ids, with and without the panel', () => {
        Tuning.start({ debug: false });
        const one = MEASURES.brakeLean.of();
        Tuning.setMode({ brakeLean: 1.2 });
        expect(Tuning.of('brakeLean')).toBe(1.2);
        // A mode is not the debug source: it flags no ride
        expect(Tuning.active()).toBe(false);
        expect(Tuning.ride.tuned).toBe(false);
        const mode = MEASURES.brakeLean.of();
        expect(mode).toBeGreaterThan(one);
        Tuning.start({ debug: true });
        Tuning.set('brakeLean', 0.5);
        expect(Tuning.of('brakeLean')).toBeCloseTo(0.6, 12);
        expect(MEASURES.brakeLean.of()).toBeLessThan(one);
        expect(() => Tuning.setMode({ nothing: 1.1 })).toThrow(/unknown id/);
        Tuning.setMode(null);
        Tuning.reset();
        expect(MEASURES.brakeLean.of()).toBe(one);
    });
});

describe('every multiplier at 1 is the ride without the tuning', () => {
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
    const state = v => [v.position.x, v.position.y, v.position.z, v.velocity.x, v.velocity.z, ...Vehicle.PHYSICS_STATE.map(k => v[k]), v.worldThrottle, v.crashed ? 1 : 0];

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

    test('the tuning is not loaded in the other game', () => {
        expect(bypassed.Tuning).toBeUndefined();
        expect(Tuning).toBeDefined();
    });

    for (const [name, make] of [['on a plane', onPlane], ['on a road with land beside it', G => onRoad(G, 3)]]) {
        test(`a world ride ${name}: outside debug mode, in debug mode at 1, and after a change and Reset`, () => {
            const base = ride(bypassed, make);
            expect(base.some(row => row[row.length - 2] > 0)).toBe(true);
            Tuning.start({ debug: false });
            same(ride(game, make), base);
            Tuning.start({ debug: true });
            same(ride(game, make), base);
            for (const row of Tuning.PARAMS) Tuning.set(row.id, 1.2);
            let moved = false;
            const tuned = ride(game, make);
            for (let i = 0; i < base.length && !moved; i++) moved = tuned[i].some((value, k) => !Object.is(value, base[i][k]));
            expect(moved).toBe(true);
            Tuning.reset();
            same(ride(game, make), base);
            for (const row of Tuning.PARAMS) Tuning.set(row.id, 1);
            same(ride(game, make), base);
        });
    }

    test('a classic leg\'s steering and speed, the same way', () => {
        const leg = (GameSet) => {
            const v = bike(GameSet);
            v.speed = 20;
            const rows = [];
            for (let i = 0; i < 600; i++) {
                const [steer, throttle, brake, wheelie] = inputs(i);
                v.updateSpeed(DT, throttle, brake);
                v.updateWheelie(DT, throttle, brake, wheelie);
                v.updatePhysics(DT, steer * 0.3);
                rows.push([v.speed, v.leanAngle, v.leanVelocity, v.yawAngle, v.wheelieAngle, v.wheelieVelocity]);
            }
            return rows;
        };
        const base = leg(bypassed);
        Tuning.start({ debug: true });
        same(leg(game), base);
    });

    test('at 1 nothing is copied: the world physics, the bar and the body are the objects themselves', () => {
        Tuning.start({ debug: true });
        const v = onPlane();
        // The rider's own view of the world (the lean limit by the rider's daring, Vehicle.riderWorld) is what the
        // tuning is given: at 1 it hands that same object back
        const own = v.riderWorld(WorldPhysics);
        expect(v.worldPhysics).toBe(own);
        expect(Vehicle.barRule()).toBe(Vehicle.BAR);
        expect(Vehicle.bodyRule()).toBe(Vehicle.BODY);
        Tuning.set('bar', 1.5);
        // A row over another object leaves this one alone
        expect(v.worldPhysics).toBe(own);
        expect(Vehicle.barRule()).not.toBe(Vehicle.BAR);
        Tuning.set('steerKey', 2);
        expect(v.worldPhysics).not.toBe(own);
        expect(v.worldPhysics.steerKeys.keyS).toBe(WorldPhysics.steerKeys.keyS * 2);
        expect(v.worldPhysics.steerKeys.featherGapS).toBe(WorldPhysics.steerKeys.featherGapS);
        expect(v.worldPhysics.offroad).toBe(WorldPhysics.offroad);
        // The frozen defaults are never written
        expect(WorldPhysics.steerKeys.keyS).toBe(0.07);
        expect(Object.isFrozen(WorldPhysics)).toBe(true);
    });
});

describe('storage', () => {
    const stored = { [Tuning.KEY]: JSON.stringify({ brake: 0.8, steerRate: 1.1 }) };

    test('outside debug mode what is stored is not read: every multiplier is 1', () => {
        const storage = storageOf(stored);
        Tuning.start({ debug: false, storage });
        for (const row of Tuning.PARAMS) expect(Tuning.of(row.id)).toBe(1);
        expect(Tuning.live).toBe(false);
        expect(Tuning.active()).toBe(false);
        expect(Tuning.beginRide()).toBe(false);
        const plain = onPlane();
        expect(plain.worldPhysics).toBe(plain.riderWorld(WorldPhysics));
        const v = bike();
        expect(v.tuned('brakeForce')).toBe(v.brakeForce);
        // Nothing is written either
        Tuning.reset();
        expect(storage.kept[Tuning.KEY]).toBe(stored[Tuning.KEY]);
    });

    test('debug mode reads it, writes each change under the one key, and survives storage that throws', () => {
        const storage = storageOf(stored);
        Tuning.start({ debug: true, storage });
        expect(Tuning.of('brake')).toBe(0.8);
        expect(Tuning.of('steerRate')).toBe(1.1);
        expect(Tuning.of('accel')).toBe(1);
        Tuning.set('accel', 1.25);
        expect(JSON.parse(storage.kept[Tuning.KEY])).toEqual({ brake: 0.8, steerRate: 1.1, accel: 1.25 });
        expect(Object.keys(storage.kept)).toEqual([Tuning.KEY]);
        Tuning.reset();
        expect(JSON.parse(storage.kept[Tuning.KEY])).toEqual({});

        const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
        const from = printed.length;
        Tuning.start({ debug: true, storage: broken });
        expect(Tuning.of('brake')).toBe(1);
        expect(Tuning.set('brake', 0.9)).toBe(0.9);
        expect(Tuning.of('brake')).toBe(0.9);
        // What is stored but cannot be a multiplier is dropped with a message
        Tuning.start({ debug: true, storage: storageOf({ [Tuning.KEY]: JSON.stringify({ nothing: 1.2, brake: 9, accel: 1.1 }) }) });
        expect(Tuning.values).toEqual({ accel: 1.1 });
        const warned = printed.slice(from);
        expect(warned.some(line => /could not be read/.test(line))).toBe(true);
        expect(warned.some(line => /could not be stored/.test(line))).toBe(true);
        expect(warned.some(line => /unknown id "nothing"/.test(line))).toBe(true);
        expect(warned.some(line => /outside 0.5 to 1.5/.test(line))).toBe(true);
    });

    test('a set value is held to the row\'s range and step, and an unknown id is refused', () => {
        Tuning.start({ debug: true });
        expect(Tuning.set('brake', 0.874)).toBe(0.87);
        expect(Tuning.set('brake', 7)).toBe(1.5);
        expect(Tuning.set('brake', -1)).toBe(0.5);
        expect(Tuning.set('brake', 1)).toBe(1);
        expect(Tuning.values).toEqual({});
        expect(() => Tuning.set('nothing', 1.1)).toThrow(/unknown id "nothing"/);
        expect(() => Tuning.set('brake', NaN)).toThrow(/needs a number/);
    });
});

describe('a tuned ride keeps no time', () => {
    test('the flag rises with the first multiplier off 1 and stays after Reset, until the next ride', () => {
        Tuning.start({ debug: true });
        expect(Tuning.beginRide()).toBe(false);
        Tuning.set('brake', 0.9);
        expect(Tuning.ride.tuned).toBe(true);
        Tuning.reset();
        expect(Tuning.active()).toBe(false);
        expect(Tuning.ride.tuned).toBe(true);
        expect(Tuning.beginRide()).toBe(false);
        // A ride that begins with a stored multiplier is flagged from its start
        Tuning.set('brake', 0.9);
        expect(Tuning.beginRide()).toBe(true);
    });

    test('a world ride is no longer trusted (the debug skip\'s flag), and stays so after Reset', () => {
        Tuning.start({ debug: true });
        const shown = [];
        const made = Object.create(Game.prototype);
        Object.assign(made, { hud: { setTuned: on => shown.push(on) }, environment: { isWorld: true, trusted: true, get submitAllowed() { return this.trusted; } } });
        made.beginTunedRide();
        made.watchTuning();
        expect(made.environment.submitAllowed).toBe(true);
        expect(shown).toEqual([false]);
        Tuning.set('steerRate', 1.08);
        made.watchTuning();
        expect(made.environment.submitAllowed).toBe(false);
        expect(shown).toEqual([false, true]);
        Tuning.reset();
        // Even were the world trusted again, the ride is still a tuned one
        made.environment.trusted = true;
        made.watchTuning();
        expect(made.environment.submitAllowed).toBe(false);
        expect(made.rideTuned).toBe(true);
        expect(shown).toEqual([false, true]);
        // The next ride, with every multiplier at 1, is clean
        made.environment = { isWorld: true, trusted: true };
        made.beginTunedRide();
        made.watchTuning();
        expect(made.environment.trusted).toBe(true);
        expect(shown).toEqual([false, true, false]);
    });

    test('a classic leg loses its leaderboard session, and a restart starts none', () => {
        Tuning.start({ debug: true });
        const calls = [];
        const service = { active: true, isActive() { return this.active; }, cancelSession() { this.active = false; calls.push('cancel'); }, startRun() { calls.push('start'); return Promise.resolve(true); } };
        const made = Object.create(Game.prototype);
        Object.assign(made, {
            hud: { setTuned() {} }, environment: { isWorld: false }, leaderboardService: service,
            tourSystem: { getCurrentLeg: () => ({ id: 'leg' }) }, leaderboardExpectation: () => ({})
        });
        made.beginTunedRide();
        made.watchTuning();
        expect(calls).toEqual([]);
        Tuning.set('brake', 0.9);
        made.watchTuning();
        expect(calls).toEqual(['cancel']);
        Tuning.reset();
        // A session that a reply in flight opened after the cancel is closed as well
        service.active = true;
        made.watchTuning();
        expect(calls).toEqual(['cancel', 'cancel']);
        made.restartLeaderboardSession();
        expect(calls).toEqual(['cancel', 'cancel', 'cancel']);
    });

    test('outside debug mode nothing is flagged and nothing is cancelled', () => {
        Tuning.start({ debug: false, storage: storageOf({ [Tuning.KEY]: JSON.stringify({ brake: 0.8 }) }) });
        const made = Object.create(Game.prototype);
        Object.assign(made, { hud: { setTuned() {} }, environment: { isWorld: true, trusted: true } });
        made.beginTunedRide();
        made.watchTuning();
        expect(made.rideTuned).toBe(false);
        expect(made.environment.trusted).toBe(true);
    });
});

describe('the copied text', () => {
    test('names the format, then only the changed values, one to a line, in the table\'s order', () => {
        Tuning.start({ debug: true });
        expect(Tuning.text()).toBe('twisty tuning v1');
        Tuning.set('brake', 0.9);
        Tuning.set('steerRate', 1.08);
        expect(Tuning.text()).toBe('twisty tuning v1\nsteerRate = 1.08\nbrake = 0.90');
    });

    test('reads back to the same values, for every row at both ends of its range', () => {
        Tuning.start({ debug: true });
        for (const pick of [row => row.min, row => row.max, row => Number((row.min + (row.max - row.min) * 0.37).toFixed(2))]) {
            Tuning.reset();
            for (const row of Tuning.PARAMS) Tuning.set(row.id, pick(row));
            const { values, errors } = Tuning.parse(Tuning.text());
            expect(errors).toEqual([]);
            expect(values).toEqual(Tuning.values);
            expect(Object.keys(values).length).toBeGreaterThanOrEqual(Tuning.PARAMS.length - 1);
        }
        expect(Tuning.parse('twisty tuning v1')).toEqual({ values: {}, errors: [] });
        // Windows line ends, blank lines and loose spacing, as a pasted text has them
        expect(Tuning.parse('\r\n twisty tuning v1 \r\n\r\nbrake=0.9\r\n  steerRate   =  1.08 \r\n')).toEqual({ values: { brake: 0.9, steerRate: 1.08 }, errors: [] });
    });

    test('an unknown id, a value out of range and a line that is not one are refused with a message', () => {
        const { values, errors } = Tuning.parse('twisty tuning v1\nbrake = 0.90\nnothing = 1.10\naccel = 9\nsteerRate: 1.2\nbrake = 0.80\nleanMax = 1.10');
        expect(values).toEqual({ brake: 0.9, leanMax: 1.1 });
        expect(errors).toEqual([
            'line 3: unknown id "nothing"',
            'line 4: "accel" = 9 is outside 0.5 to 1.5',
            'line 5: "steerRate: 1.2" is not "id = number"',
            'line 6: "brake" is given twice'
        ]);
        expect(Tuning.parse('brake = 0.9').errors).toEqual(['line 1: the first line must be "twisty tuning v1"']);
        expect(Tuning.parse('twisty tuning v2\nbrake = 0.9').errors[0]).toMatch(/the first line must be/);
        expect(Tuning.parse('').errors.length).toBe(1);
        expect(Tuning.parse(undefined).errors.length).toBe(1);
    });
});
