/**
 * @jest-environment node
 */
// The rider comes off in a crash, by the kind of the crash (Vehicle.CRASH_CAUSES, RIDER_FALLS, beginRiderFall,
// stepRiderFall, drawRiderFall). Before, the rider stayed on the bike in the riding pose through every crash but a
// lowside. Here: every crash the code can raise has a kind, the tables are well formed, and on a flat plane the fall
// stays on the ground, slides further the faster the crash, is the same every time, makes nothing while it plays, and
// leaves the rider exactly as he rode once the bike is put back. The real stage is tests/unit/world-rider-fall.test.js.
import { describe, test, expect } from '@jest/globals';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGame } from '../helpers/load-game.js';
import { DT, bikeAt, poseOf, crashAndWatch } from '../helpers/rider-fall.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const game = loadGame();
const { Vehicle, THREE } = game;
const RULE = Vehicle.RIDER_FALL, FALLS = Vehicle.RIDER_FALLS, CAUSES = Vehicle.CRASH_CAUSES;
// A cause class for each kind, as the game raises it
const CLASS = { lowside: 'grip', highside: 'rear', front: 'wall', drop: 'drop', tip: 'stall' };

// Every game script, as text
function sources() {
    const out = [];
    const walk = (dir) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const file = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(file);
            else if (entry.name.endsWith('.js')) out.push({ file: path.relative(REPO, file), text: readFileSync(file, 'utf8') });
        }
    };
    walk(path.join(REPO, 'js'));
    return out;
}
// The arguments of the call that opens at text[open] (a `(`), split at its own commas
function argsAt(text, open) {
    const args = [];
    let depth = 0, quote = null, from = open + 1;
    for (let i = open; i < text.length; i++) {
        const c = text[i];
        if (quote) {
            if (c === '\\') i++;
            else if (c === quote) quote = null;
            continue;
        }
        if (c === '\'' || c === '"' || c === '`') quote = c;
        else if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') {
            depth--;
            if (depth === 0) { args.push(text.slice(from, i).trim()); return args; }
        } else if (c === ',' && depth === 1) { args.push(text.slice(from, i).trim()); from = i + 1; }
    }
    throw new Error('unclosed call');
}
const literals = (code) => [...code.matchAll(/'([^']*)'/g)].map(m => m[1]);
const lineOf = (text, at) => text.slice(0, at).split('\n').length;

describe('every crash has a kind of fall', () => {
    test('every place that crashes the bike names a cause class beside it, and the table has that class', () => {
        const bad = [];
        let raised = 0;
        for (const { file, text } of sources()) {
            // A crash set by hand: the class is set within the next three lines
            for (const m of text.matchAll(/\.crashed = true;/g)) {
                raised++;
                const next = text.slice(m.index, m.index + 400).split('\n').slice(0, 4).join('\n');
                const why = next.match(/crashWhy = ([^;]+);/);
                const where = `${file}:${lineOf(text, m.index)}`;
                if (!why) { bad.push(`${where} sets crashed with no crashWhy`); continue; }
                // worldCrash itself passes on the class it was given
                if (why[1].trim() === 'why') continue;
                const named = literals(why[1]);
                if (!named.length) bad.push(`${where} crashWhy is not a class named there`);
                for (const name of named) if (!CAUSES[name]) bad.push(`${where} class '${name}' is not in Vehicle.CRASH_CAUSES`);
            }
            // A world crash: the class is the third argument
            for (const m of text.matchAll(/\.worldCrash\(/g)) {
                raised++;
                const args = argsAt(text, m.index + m[0].length - 1);
                const where = `${file}:${lineOf(text, m.index)}`;
                const named = args[2] ? literals(args[2]) : [];
                if (!named.length) bad.push(`${where} worldCrash names no cause class`);
                for (const name of named) if (!CAUSES[name]) bad.push(`${where} class '${name}' is not in Vehicle.CRASH_CAUSES`);
            }
        }
        if (bad.length) throw new Error(bad.join('\n'));
        // The walk found the crashes: the bike's own, the game's (a car, a rock), a rider's, the roadworks'
        expect(raised).toBeGreaterThanOrEqual(20);
    });

    test('every class gives a kind the table of falls has, and the fallback is one too', () => {
        for (const [name, kind] of Object.entries(CAUSES)) expect([name, kind, !!FALLS[kind]]).toEqual([name, kind, true]);
        expect(FALLS[RULE.fallback]).toBeTruthy();
        // The five kinds are all reached (a kind's own row has no `of`; its variants are tests/unit/rider-fall-scale.test.js)
        expect([...new Set(Object.values(CAUSES))].sort()).toEqual(Object.keys(FALLS).filter(name => !FALLS[name].of).sort());
    });

    test('no code reads the words of a cause', () => {
        for (const { file, text } of sources()) {
            const reads = [...text.matchAll(/crashCause\s*(===|!==|\.includes|\.match|\.startsWith|\.indexOf|\.test)/g)];
            expect([file, reads.length]).toEqual([file, 0]);
        }
    });

    test('each kind is rows of data: times that rise to 1, and four angles and four limbs for every key', () => {
        const triple = (t) => Array.isArray(t) && t.length === 3 && t.every(Number.isFinite);
        const pose = (key) => key.body.length === 4 && key.body.every(Number.isFinite) && [key.arms, key.legs].every(pair => pair.length === 2 && pair.every(triple));
        for (const [kind, k] of Object.entries(FALLS)) {
            for (const field of ['slowS', 'fastS', 'fullSpeed', 'keep', 'most', 'out', 'lift', 'liftPerSpeed', 'stop', 'away', 'topple', 'drag', 'scrub', 'bounce']) expect([kind, field, Number.isFinite(k[field])]).toEqual([kind, field, true]);
            expect(k.keys.length).toBeGreaterThanOrEqual(3);
            expect(k.keys.length).toBeLessThanOrEqual(5);
            let last = 0;
            for (const key of k.keys) {
                expect(key.at).toBeGreaterThan(last);
                last = key.at;
                expect([kind, pose(key)]).toEqual([kind, true]);
                // A bend is a share, and a limb is never folded past its own length
                for (const limb of [...key.arms, ...key.legs]) expect(limb[2] >= 0 && limb[2] <= 1).toBe(true);
            }
            expect(last).toBe(1);
            if (k.sit) expect([kind, pose(k.sit)]).toEqual([kind, true]);
            if (k.withBike) expect(k.off.length).toBe(3);
            // The whole of it plays inside the shortest time a world ride shows a fall
            expect(Math.max(k.slowS, k.fastS)).toBeLessThanOrEqual(1.5);
        }
    });

    test('the cause decides the kind at every speed; a slow crash is mostly its calm row (the tip-over), with no step', () => {
        for (const name of [...Object.keys(CAUSES), 'no such class', null]) expect(Vehicle.riderFallKind(name)).toBe(CAUSES[name] || RULE.fallback);
        for (const [kind, name] of Object.entries(CLASS)) {
            for (const speed of [2, 3.9, 4.1, 15]) {
                const frames = crashAndWatch(game, bikeAt(game, { speed }), { why: name, seconds: 0.2 });
                expect([name, speed, frames[0].kind]).toEqual([name, speed, kind]);
            }
            const calm = (speed) => {
                const v = bikeAt(game, { speed });
                crashAndWatch(game, v, { why: name, seconds: 0.05 });
                return v.riderFall.fall.calm;
            };
            // All tip-over at walking pace (but a fall with the bike, which has no calm row), none of it from calmTo
            expect([kind, calm(RULE.calmFrom)]).toEqual([kind, FALLS[kind].calm === false ? 0 : 1]);
            expect([kind, calm(RULE.calmTo)]).toEqual([kind, 0]);
        }
    });
});

describe('the fall on a flat plane', () => {
    test('the rider leaves the bike with no step, and no point of him is under the ground', () => {
        for (const [kind, name] of Object.entries(CLASS)) {
            for (const side of [-1, 1]) {
                const v = bikeAt(game, { speed: 20 });
                v.update(DT, 0, 0, 0, 0);
                const seat = v.rider.getWorldPosition(new THREE.Vector3());
                const frames = crashAndWatch(game, v, { why: name, side });
                expect(frames[0].kind).toBe(kind);
                // The first frame is where he sat a step before (one step of travel, and a little of the fall)
                expect(Math.hypot(frames[0].x - seat.x, frames[0].z - seat.z)).toBeLessThan(20 * DT * 2 + 0.3);
                for (let i = 1; i < frames.length; i++) {
                    const a = frames[i - 1], b = frames[i];
                    expect(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)).toBeLessThan(20 * DT * 1.5 + 0.25);
                    expect(b.under).toBeLessThan(0.02);
                }
                // He comes to the ground and lies on it
                expect(frames[frames.length - 1].low - v.position.y).toBeLessThan(kind === 'drop' ? 0.6 : 0.02);
            }
        }
    });

    test('he falls to the side the bike went down to, and over the high side in a highside', () => {
        // Metres to the bike's right of the line it rode (heading 0 is +z, and +x is the bike's left)
        const right = (frames) => -frames[frames.length - 1].x;
        for (const side of [-1, 1]) {
            expect(right(crashAndWatch(game, bikeAt(game, { speed: 15 }), { why: 'grip', side })) * side).toBeGreaterThan(0.3);
            expect(right(crashAndWatch(game, bikeAt(game, { speed: 2 }), { why: 'stall', side })) * side).toBeGreaterThan(1);
            expect(right(crashAndWatch(game, bikeAt(game, { speed: 15 }), { why: 'rear', side })) * side).toBeLessThan(-0.5);
        }
    });

    test('the slide is longer the faster the crash', () => {
        const slid = (name, speed) => {
            const frames = crashAndWatch(game, bikeAt(game, { speed }), { why: name, seconds: 6 });
            const last = frames[frames.length - 1];
            return Math.hypot(last.x, last.z);
        };
        for (const name of ['grip', 'rear']) {
            const d = [6, 12, 20, 30, 40].map(speed => slid(name, speed));
            for (let i = 1; i < d.length; i++) expect(d[i]).toBeGreaterThan(d[i - 1] + 2);
        }
        // Over the bars he lands near what the bike hit, however fast it was: further with the speed up to `most`
        const front = [6, 10, 14, 30, 40].map(speed => slid('wall', speed));
        expect(front[1]).toBeGreaterThan(front[0] + 1);
        expect(front[2]).toBeGreaterThan(front[1] + 1);
        for (let i = 3; i < front.length; i++) expect(front[i]).toBeGreaterThanOrEqual(front[i - 1] - 1e-9);
        expect(front[4]).toBeLessThan(25);
    });

    test('he ends near the bike: within 3 m and 0.5 m for each m/s of the crash', () => {
        for (const name of Object.values(CLASS)) {
            for (const speed of [2, 8, 16, 28, 40]) {
                const frames = crashAndWatch(game, bikeAt(game, { speed }), { why: name });
                expect(frames[frames.length - 1].gap).toBeLessThan(3 + 0.5 * speed);
            }
        }
    });

    test('the same crash twice is the same fall, frame for frame', () => {
        for (const name of Object.values(CLASS)) {
            const watch = () => {
                const poses = [];
                const frames = crashAndWatch(game, bikeAt(game, { speed: 18 }), { why: name, each: (frame, v) => poses.push(poseOf(v)) });
                return { frames, poses };
            };
            const a = watch(), b = watch();
            expect(a.poses).toEqual(b.poses);
            expect(a.frames.map(f => [f.x, f.y, f.z])).toEqual(b.frames.map(f => [f.x, f.y, f.z]));
        }
    });

    test('nothing in the game draws a number by chance while he falls', () => {
        const bikes = Object.values(CLASS).map(name => [name, bikeAt(game, { speed: 18 })]);
        const random = Math.random;
        let calls = 0;
        Math.random = () => { calls++; return 0.5; };
        try {
            for (const [name, v] of bikes) crashAndWatch(game, v, { why: name });
        } finally {
            Math.random = random;
        }
        expect(calls).toBe(0);
    });

    test('nothing is made while he falls: no vector, quaternion, matrix or euler, by `new` or by clone', () => {
        const kinds = ['Vector3', 'Quaternion', 'Matrix4', 'Euler'];
        for (const name of Object.values(CLASS)) {
            const v = bikeAt(game, { speed: 18 });
            crashAndWatch(game, v, { why: name, seconds: 0.1 });
            // The fall's own steps, counted: every `new` and every clone of the kinds it works in
            let made = 0;
            const real = {}, clones = {};
            for (const kind of kinds) {
                real[kind] = THREE[kind];
                clones[kind] = THREE[kind].prototype.clone;
                THREE[kind] = class extends real[kind] { constructor(...args) { super(...args); made++; } };
                real[kind].prototype.clone = function () { made++; return clones[kind].call(this); };
            }
            const state = v.riderFall, kept = [state.p, state.v, state.q, state.q0, ...state.probe, ...state.end, ...state.from];
            let steps = 0;
            const step = v.stepRiderFall.bind(v), draw = v.drawRiderFall.bind(v);
            let inside = 0, counted = 0;
            v.stepRiderFall = (dt) => { const before = made; inside++; step(dt); inside--; counted += made - before; steps++; };
            v.drawRiderFall = () => { const before = made; draw(); counted += made - before; steps++; };
            try {
                // The spy sees a `new` (a vector made here is counted)
                new THREE.Vector3();
                expect(made).toBe(1);
                for (let i = 0; i < 120; i++) v.update(DT, 0, 0, 0, 0);
            } finally {
                for (const kind of kinds) { THREE[kind] = real[kind]; real[kind].prototype.clone = clones[kind]; }
            }
            expect(steps).toBe(240);
            expect([name, counted]).toEqual([name, 0]);
            // And the state is the same objects throughout
            const after = [state.p, state.v, state.q, state.q0, ...state.probe, ...state.end, ...state.from];
            expect(v.riderFall).toBe(state);
            after.forEach((object, i) => expect(object).toBe(kept[i]));
        }
    });
});

describe('the restart puts the rider back as he rode', () => {
    test('after a crash and a reset every part of the rider is where it was before, to the last bit', () => {
        for (const name of Object.values(CLASS)) {
            for (const speed of [2, 18]) {
                const v = bikeAt(game, { speed });
                v.reset();
                v.updateMesh();
                const before = poseOf(v);
                v.speed = speed;
                crashAndWatch(game, v, { why: name });
                expect(poseOf(v)).not.toEqual(before);
                // As Game.restartInPlace and the legs' restarts do
                v.reset();
                v.updateMesh();
                expect(v.riderFall.on).toBe(false);
                expect(v.crashWhy).toBeNull();
                expect(poseOf(v)).toEqual(before);
                // And he rides on from there: the hands and feet are held as on a bike that never fell
                const fresh = bikeAt(game, { speed });
                fresh.reset();
                for (const bike of [v, fresh]) for (let i = 0; i < 30; i++) { bike.speed = 12; bike.update(DT, 0.6, 0.4, 0, 0); }
                expect(poseOf(v)).toEqual(poseOf(fresh));
            }
        }
    });

    test('a bike that rides again without a reset has its rider back too', () => {
        const v = bikeAt(game, { speed: 18 });
        v.reset();
        v.updateMesh();
        const before = poseOf(v);
        v.speed = 18;
        crashAndWatch(game, v, { why: 'rear' });
        v.crashed = false;
        v.leanAngle = 0;
        v.speed = 10;
        v.updateMesh();
        expect(v.riderFall.on).toBe(false);
        expect(v.rider.position.toArray()).toEqual(v.riderBasePos.toArray());
        expect(poseOf(v).slice(1)).toEqual(before.slice(1));
    });

    test('a second crash straight after a restart plays from the start, the same as the first', () => {
        for (const name of Object.values(CLASS)) {
            const v = bikeAt(game, { speed: 18 });
            const ride = () => {
                v.reset();
                v.position.set(0, 0, 0);
                v.yawAngle = 0;
                v.speed = 18;
                const poses = [];
                crashAndWatch(game, v, { why: name, seconds: 1, each: (frame, bike) => poses.push([bike.riderFall.t, poseOf(bike)]) });
                return poses;
            };
            const first = ride(), second = ride();
            // The first frame is the moment he leaves the seat, and the time runs on from there
            expect(second[0][0]).toBe(0);
            expect(second[1][0]).toBeCloseTo(DT, 9);
            expect(second).toEqual(first);
        }
    });

    test('another rider and bike fall by the same tables', () => {
        // The rig is shared: a taller, wider rider on another bike is posed by the same keys
        for (const character of [1, 3, 5]) {
            const v = bikeAt(game, { speed: 18, character });
            v.reset();
            v.updateMesh();
            const before = poseOf(v);
            v.speed = 18;
            const frames = crashAndWatch(game, v, { why: 'rear' });
            for (const f of frames) expect(f.under).toBeLessThan(0.02);
            v.reset();
            v.updateMesh();
            expect(poseOf(v)).toEqual(before);
        }
    });
});
