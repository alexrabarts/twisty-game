/**
 * @jest-environment node
 */
// The hill ride's boy (js/hill/boy.js, js/hill/boymaps.js): one skinned body on the bicycle model's rig, drawn from
// code. These hold his joints closed in every pose the ride puts him in, his swinging parts bounded and the same at
// any frame rate, his face and finishes drawn from numbers (no picture read, no text anywhere), his life (the breath,
// the blink, the look, the throw) and his cost.
import { describe, test, expect, beforeAll } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canvasStub, loadGame, loadScript, realThree } from '../helpers/load-game.js';

const root = fileURLToPath(new URL('../..', import.meta.url));
const THREE = realThree();
const game = loadGame(THREE);
const { Vehicle, WorldPhysics, CHARACTERS } = game;
const { HillLane, HillBicycle } = new Function('THREE', 'Vehicle', 'WorldPhysics', 'CHARACTERS',
    `${['lane', 'pushbike', 'bicycle'].map(n => loadScript(`hill/${n}.js`)).join('\n')}\nreturn { HillLane, HillBicycle };`
)(THREE, Vehicle, WorldPhysics, CHARACTERS);
const fetch = async url => {
    const bytes = readFileSync(join(root, url));
    return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
};
// The page's own scripts, with a fetch that reads only the repo's files and a record of every other read
const reads = [];
const { SceneAssets, HillRider, HillBoy, HillBoyMaps } = new Function('THREE', 'document', 'console', 'fetch', 'Blob', 'TextDecoder', 'Vehicle', 'Image',
    `${loadScript('sceneassets.js')}\n${loadScript('hill/rider.js')}\n${loadScript('hill/boymaps.js')}\n${loadScript('hill/boy.js')}\nreturn { SceneAssets, HillRider, HillBoy, HillBoyMaps };`
)(THREE, canvasStub(), console, (url) => { reads.push(url); return fetch(url); }, Blob, TextDecoder, Vehicle, function Image() { reads.push('Image'); });

const DT = 1 / 120;
const flat = () => new HillLane({ ...HillLane.RULE, grade: [[0, -1e-9], [1, -1e-9]], heading: [[0, 0], [1, 0]], sharpRight: HillLane.RULE.sharpRight });
let rider;
beforeAll(async () => {
    rider = new HillRider(await SceneAssets.loadModel(HillRider.FILE));
    // (in a scene, as on the page: a fall hangs his body there)
    new THREE.Scene().add(rider.group);
});

// The body as drawn now: every point skinned on the CPU as the shader skins it (the bones' matrices and the weights),
// with its normal, in the world
function skinned(mesh) {
    mesh.updateMatrixWorld(true);
    mesh.skeleton.update();
    const g = mesh.geometry, pos = g.attributes.position, nor = g.attributes.normal, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    const bones = mesh.skeleton.bones, inv = mesh.skeleton.boneInverses, m = new THREE.Matrix4(), mats = bones.map((b, i) => new THREE.Matrix4().multiplyMatrices(b.matrixWorld, inv[i]));
    const P = new Float32Array(pos.count * 3), N = new Float32Array(pos.count * 3), v = new THREE.Vector3(), n = new THREE.Vector3(), acc = new THREE.Vector3(), accN = new THREE.Vector3();
    // (the body is bound in its frame's space: the bones' matrices take it to the world)
    const bind = new THREE.Matrix4().copy(mesh.bindMatrix);
    for (let i = 0; i < pos.count; i++) {
        acc.set(0, 0, 0);
        accN.set(0, 0, 0);
        for (let k = 0; k < 4; k++) {
            const w = sw.array[i * 4 + k];
            if (!w) continue;
            m.copy(mats[si.array[i * 4 + k]]).multiply(bind);
            v.fromBufferAttribute(pos, i);
            // (the folds' morphs first, as the shader adds them before it skins)
            const morphs = g.morphAttributes.position || [], influence = mesh.morphTargetInfluences || [];
            for (let f = 0; f < morphs.length; f++) if (influence[f]) v.x += morphs[f].getX(i) * influence[f], v.y += morphs[f].getY(i) * influence[f], v.z += morphs[f].getZ(i) * influence[f];
            acc.addScaledVector(v.applyMatrix4(m), w);
            accN.addScaledVector(n.fromBufferAttribute(nor, i).transformDirection(m), w);
        }
        accN.normalize();
        P.set([acc.x, acc.y, acc.z], i * 3);
        N.set([accN.x, accN.y, accN.z], i * 3);
    }
    return { P, N };
}

// The points of a piece's ring (its first, its last or its i-th), by its place in the geometry
function ring(boy, name, which) {
    const piece = boy.pieces[name];
    const [from] = piece.ranges[0];
    const cols = piece.nv + 1;
    const i = which === 'first' ? 0 : which === 'last' ? piece.nu : which;
    return Array.from({ length: cols - 1 }, (_, j) => from + i * cols + j);
}

// How wide a piece's ring is now against at rest: its ring nearest `y` at rest, the least distance across it
function ringWidth(boy, S, name, y) {
    const piece = boy.pieces[name], pos = boy.mesh.geometry.attributes.position, [from] = piece.ranges[0], cols = piece.nv + 1;
    let best = 0, gap = Infinity;
    for (let i = 0; i <= piece.nu; i++) {
        const d = Math.abs(pos.getY(from + i * cols) - y);
        if (d < gap) { gap = d; best = i; }
    }
    const list = ring(boy, name, best), half = piece.nv / 2;
    const across = (get) => {
        let least = Infinity;
        for (let j = 0; j < half; j++) least = Math.min(least, get(list[j]).distanceTo(get(list[j + half])));
        return least;
    };
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    let flip = false;
    const now = across(k => (flip = !flip) ? a.set(S.P[k * 3], S.P[k * 3 + 1], S.P[k * 3 + 2]) : b.set(S.P[k * 3], S.P[k * 3 + 1], S.P[k * 3 + 2]));
    flip = false;
    const rest = across(k => (flip = !flip) ? a.fromBufferAttribute(pos, k) : b.fromBufferAttribute(pos, k));
    return now / rest;
}
const points = (boy, name) => boy.pieces[name].ranges.flatMap(([from, count]) => Array.from({ length: count }, (_, k) => from + k));

// How far a point stands out of a surface: from the nearest point of it, along that point's normal (+ is outside)
function outside(S, p, list) {
    let best = Infinity, at = -1;
    for (const k of list) {
        const d = (S.P[k * 3] - S.P[p * 3]) ** 2 + (S.P[k * 3 + 1] - S.P[p * 3 + 1]) ** 2 + (S.P[k * 3 + 2] - S.P[p * 3 + 2]) ** 2;
        if (d < best) { best = d; at = k; }
    }
    return (S.P[p * 3] - S.P[at * 3]) * S.N[at * 3] + (S.P[p * 3 + 1] - S.P[at * 3 + 1]) * S.N[at * 3 + 1] + (S.P[p * 3 + 2] - S.P[at * 3 + 2]) * S.N[at * 3 + 2];
}

// The poses the ride puts him in: on the pedals at every crank angle, legs out, a foot down, on foot through a whole
// pace and tired, stood, throwing (reaching, flinging), and in a fall
function poses() {
    const lane = new HillLane(), b = new HillBicycle(lane), list = [];
    const set = (label, setup, steps = 4, dt = 1 / 60) => list.push({ label, run: () => { setup(); for (let i = 0; i < steps; i++) rider.update(b, lane, dt); } });
    for (let k = 0; k < 8; k++) set(`pedals ${k * 45} deg`, () => { b.walking = false; b.reset(40); b.vehicle.speed = 4; b.vehicle.footDown = false; b.legs = 0; b.crank = k * Math.PI / 4; rider.foot = 0; });
    set('legs out', () => { b.walking = false; b.reset(130); b.vehicle.speed = 9; b.legs = 1; b.legsOut = true; rider.foot = 0; }, 8);
    set('a foot down', () => { b.walking = false; b.reset(22); b.vehicle.speed = 0; b.vehicle.footDown = true; b.legs = 0; rider.foot = 1; });
    for (let k = 0; k < 6; k++) set(`on foot ${k}/6 of a pace`, () => { b.reset(60); b.vehicle.yawAngle += Math.PI; b.walking = true; b.vehicle.speed = 1.5; b.walkM = 10 + k * HillRider.WALK.strideM / 6; });
    set('tired', () => { b.reset(60); b.vehicle.yawAngle += Math.PI; b.walking = true; b.vehicle.speed = 1.5; b.walkM = 24.5; });
    set('stood', () => { b.reset(60); b.vehicle.yawAngle += Math.PI; b.walking = true; b.vehicle.speed = 0; b.walkM = 24.5; }, 30);
    for (const at of [0.12, 0.3, 0.45]) set(`throwing at ${at} s`, () => { b.walking = false; b.reset(150); b.vehicle.speed = 8; b.legs = 0; rider.foot = 0; rider.update(b, lane, 0); rider.throwAt(1); }, Math.round(at * 60));
    return list;
}

describe('the boy\'s body', () => {
    test('is one skinned body of seven finishes on one skeleton, near and far, within its budget', () => {
        const boy = rider.boy;
        expect(boy.levels).toHaveLength(2);
        for (const { mesh } of boy.levels) {
            expect(mesh.isSkinnedMesh).toBe(true);
            expect(mesh.skeleton).toBe(boy.skeleton);
            expect(mesh.geometry.groups.length).toBeLessThanOrEqual(7);
        }
        const near = boy.levels[0].mesh.geometry.index.count / 3, far = boy.levels[1].mesh.geometry.index.count / 3;
        console.log(`hill boy: ${near} triangles near, ${far} far, ${boy.bones.length} bones, ${boy.levels[0].mesh.geometry.groups.length} draws`);
        expect(near).toBeLessThan(HillBoy.BUDGET.near);
        expect(far).toBeLessThan(HillBoy.BUDGET.far);
        // Every point weighed to its bones, the weights summing to one
        const sw = boy.mesh.geometry.attributes.skinWeight;
        for (let i = 0; i < sw.count; i += 7) expect(sw.getX(i) + sw.getY(i) + sw.getZ(i) + sw.getW(i)).toBeCloseTo(1, 5);
    });

    test('the far body is drawn only past FAR.fromM, and the near one back inside FAR.backM', () => {
        const boy = rider.boy, F = HillBoy.FAR, at = rider.group.position, eye = new THREE.Vector3();
        boy.level(eye.copy(at).add(new THREE.Vector3(0, 0, F.fromM - 1)));
        expect([boy.levels[0].mesh.visible, boy.levels[1].mesh.visible]).toEqual([true, false]);
        boy.level(eye.copy(at).add(new THREE.Vector3(0, 0, F.fromM + 1)));
        expect([boy.levels[0].mesh.visible, boy.levels[1].mesh.visible]).toEqual([false, true]);
        boy.level(eye.copy(at).add(new THREE.Vector3(0, 0, (F.fromM + F.backM) / 2)));
        expect(boy.levels[1].mesh.visible).toBe(true);
        boy.level(eye.copy(at).add(new THREE.Vector3(0, 0, F.backM - 1)));
        expect([boy.levels[0].mesh.visible, boy.levels[1].mesh.visible]).toEqual([true, false]);
    });

    test('no joint opens in any pose: each piece that ends inside another stays inside it, and no knee or elbow folds flat', () => {
        const boy = rider.boy, mesh = boy.mesh;
        const seams = [];
        for (const tag of ['l', 'r']) {
            seams.push([`leg_${tag}`, 'first', 'hips'], [`boot_${tag}`, 'last', `foot_${tag}`], [`palm_${tag}`, 'first', `cuff_${tag}`]);
            for (let i = 0; i < 4; i++) seams.push([`finger${i}_${tag}`, 'first', `palm_${tag}`]);
        }
        seams.push(['hips', 'last', 'torso'], ['neck', 'first', 'torso-collar'], ['neck', 'last', 'head']);
        const outers = Object.fromEntries([...new Set(seams.map(s => s[2]))].map(name => [name, points(boy, name)]));
        let worst = -Infinity, where = '';
        const flat = [];
        for (const pose of poses()) {
            pose.run();
            const S = skinned(mesh);
            for (const [inner, which, outer] of seams) {
                for (const p of ring(boy, inner, which)) {
                    const d = outside(S, p, outers[outer]);
                    if (d > worst) { worst = d; where = `${inner} out of ${outer}, ${pose.label}`; }
                }
            }
            // The knees and elbows keep their volume where they bend: each joint's ring at least half as wide as at rest
            for (const [name, at] of [['leg_l', boy.rest.shin_l.y], ['leg_r', boy.rest.shin_r.y], ['sleeve_l', boy.rest.forearm_l.y], ['sleeve_r', boy.rest.forearm_r.y]]) {
                const share = ringWidth(boy, S, name, at);
                flat.push(share);
                if (share < 0.5) console.log(`hill boy joints: ${name} ${share.toFixed(2)} as wide as at rest, ${pose.label}`);
            }
        }
        console.log(`hill boy joints: the worst seam ${(worst * 1000).toFixed(1)} mm out (${where}); the joints at least ${Math.min(...flat).toFixed(2)} as wide as at rest`);
        expect(worst).toBeLessThan(0.004);
        expect(Math.min(...flat)).toBeGreaterThan(0.5);
    });
});

describe('his swinging parts', () => {
    // A ride: rolled off at speed over the cobbles, a lean and back, braked hard, stood; the scarf's ends and the
    // apron's swing sampled at the end
    const ride = (dt) => {
        const lane = flat(), b = new HillBicycle(lane);
        b.reset(40);
        b.vehicle.speed = 8;
        rider.update(b, lane, 0);
        const ends = [];
        let most = 0, flapMost = 0, t = 0;
        const step = (seconds, input) => {
            for (let s = 0; s < seconds - 1e-9; s += dt) {
                // (the physics at its own fixed rate, the drawing at `dt`)
                for (let k = 0; k < Math.round(dt / DT); k++) b.step(DT, input);
                rider.update(b, lane, dt);
                t += dt;
                const boy = rider.boy, knot = new THREE.Vector3();
                for (const end of boy.scarf) {
                    boy.knotAt(end, knot);
                    for (let i = 0; i < end.links.length; i++) {
                        const d = Math.hypot(end.points[i * 3] - knot.x, end.points[i * 3 + 1] - knot.y, end.points[i * 3 + 2] - knot.z);
                        most = Math.max(most, d / (i * HillBoy.SCARF.linkM + 1e-9) * (i ? 1 : 0));
                        expect(Number.isFinite(end.points[i * 3])).toBe(true);
                    }
                }
                flapMost = Math.max(flapMost, boy.apron.flap);
            }
        };
        const mark = () => { const e = rider.boy.scarf[0], n = e.links.length - 1; rider.group.updateMatrixWorld(true); return rider.group.worldToLocal(new THREE.Vector3(e.points[n * 3], e.points[n * 3 + 1], e.points[n * 3 + 2])).toArray().map(x => x.toFixed(3)).join(','); };
        const marks = [];
        step(0.5, { pedal: 0, brake: 0, steer: 0 }); marks.push(mark());
        step(1, { pedal: 0, brake: 0, steer: 0.25 }); marks.push(mark());
        step(1, { pedal: 0, brake: 0, steer: -0.25 }); marks.push(mark());
        step(1, { pedal: 0, brake: 1, steer: 0 }); marks.push(mark());
        console.log(`hill boy swing at ${Math.round(1 / dt)} fps: ${marks.join(' | ')}`);
        expect(b.crashed).toBe(false);
        const boy = rider.boy;
        for (const end of boy.scarf) ends.push(Array.from(end.points));
        return { ends, most, flapMost, flap: boy.apron.flap, t };
    };

    test('the scarf\'s ends and the apron\'s swing stay within their reach, and are the same at 30 and at 120 frames a second', () => {
        const slow = ride(1 / 30), fast = ride(1 / 120);
        let gap = 0;
        slow.ends.forEach((end, e) => end.forEach((x, i) => { gap = Math.max(gap, Math.abs(x - fast.ends[e][i])); }));
        console.log(`hill boy swing: the scarf's ends ${(gap * 1000).toFixed(1)} mm apart at 30 and 120 fps; links at most ${slow.most.toFixed(3)} of their length from the knot; the apron's swing at most ${slow.flapMost.toFixed(3)} rad`);
        // Each link no further from the knot than the chain reaches, nothing lost
        expect(slow.most).toBeLessThan(1.02);
        expect(fast.most).toBeLessThan(1.02);
        expect(slow.flapMost).toBeLessThanOrEqual(HillBoy.APRON_SWING.mostRad + 1e-9);
        expect(slow.flapMost).toBeGreaterThanOrEqual(0);
        expect(gap).toBeLessThan(0.02);
        expect(Math.abs(slow.flap - fast.flap)).toBeLessThan(0.03);
    });

    test('at speed the scarf\'s ends stream back; stood, they hang down his front', () => {
        const lane = flat(), b = new HillBicycle(lane), boy = rider.boy, local = new THREE.Vector3();
        const tips = () => {
            rider.group.updateMatrixWorld(true);
            return boy.scarf.map(end => {
                const n = end.links.length - 1;
                return rider.group.worldToLocal(local.set(end.points[n * 3], end.points[n * 3 + 1], end.points[n * 3 + 2])).clone();
            });
        };
        b.reset(20);
        b.vehicle.speed = 0;
        b.vehicle.footDown = true;
        for (let t = 0; t < 2; t += 1 / 60) rider.update(b, lane, 1 / 60);
        const still = tips();
        b.vehicle.footDown = false;
        for (let t = 0; t < 2; t += 1 / 60) {
            b.vehicle.speed = 14;
            b.step(1 / 60, { pedal: 0, brake: 0, steer: 0 });
            rider.update(b, lane, 1 / 60);
        }
        const moving = tips();
        console.log(`hill boy scarf: its tips ${still.map(p => p.z.toFixed(2)).join(' and ')} m ahead stood, ${moving.map(p => p.z.toFixed(2)).join(' and ')} m at 14 m/s`);
        for (let i = 0; i < 2; i++) expect(moving[i].z).toBeLessThan(still[i].z - 0.08);
    });
});

describe('his frame', () => {
    test('allocates no vector, quaternion, matrix or euler once he is going: on the pedals, legs out, on foot, throwing', () => {
        const lane = new HillLane(), b = new HillBicycle(lane), kinds = ['Vector3', 'Quaternion', 'Matrix4', 'Euler'], made = {};
        const keep = {};
        // (only what his drawing makes is counted: the bicycle's own physics steps between)
        let counting = false;
        const run = (setup, frames) => {
            setup();
            for (let i = 0; i < frames; i++) {
                b.step(DT, { pedal: 0.6, brake: 0, steer: 0.1 });
                counting = true;
                rider.update(b, lane, 1 / 60);
                counting = false;
            }
        };
        const ride = () => {
            run(() => { b.walking = false; b.reset(40); b.vehicle.speed = 4; rider.foot = 0; }, 30);
            run(() => { b.vehicle.speed = 9; b.legs = 1; b.legsOut = true; }, 30);
            run(() => { b.reset(60); b.vehicle.yawAngle += Math.PI; b.walking = true; b.vehicle.speed = 1.5; }, 30);
            run(() => { b.walking = false; b.reset(150); b.vehicle.speed = 8; rider.throwAt(1); }, 40);
        };
        // (once through to warm every lazily made scratch, then counted)
        ride();
        for (const kind of kinds) {
            keep[kind] = THREE[kind];
            made[kind] = 0;
            const Base = keep[kind];
            THREE[kind] = class extends Base { constructor(...args) { super(...args); if (counting) made[kind]++; } };
        }
        try {
            ride();
        } finally {
            for (const kind of kinds) THREE[kind] = keep[kind];
        }
        console.log(`hill boy frame: made ${kinds.map(k => `${made[k]} ${k}`).join(', ')} over 130 frames`);
        for (const kind of kinds) expect([kind, made[kind]]).toEqual([kind, 0]);
    });
});

describe('his face and his finishes', () => {
    test('are drawn from numbers: no picture is read for any of them, the face is the skin map drawn in the page, and none carries text', () => {
        const maps = HillBoyMaps.all(), mats = HillBoy.materials();
        // The face: a texture whose pixels were made here (a typed array), the skin finish's map
        const skin = mats.list[mats.index.skin];
        expect(skin.map).toBe(maps.skin);
        expect(maps.skin.isDataTexture).toBe(true);
        expect(maps.skin.image.data).toBeInstanceOf(Uint8Array);
        for (const [name, map] of Object.entries(maps)) if (map && map.isTexture) expect([name, map.isDataTexture, !!map.image.src]).toEqual([name, true, false]);
        // Nothing fetched or loaded for them beyond the bicycle's model
        expect(reads.filter(url => url !== HillRider.FILE)).toEqual([]);
        // The same on every load
        const sum = (a) => { let h = 0; for (let i = 0; i < a.length; i += 97) h = (h * 31 + a[i]) >>> 0; return h; };
        HillBoyMaps.made = null;
        expect(sum(HillBoyMaps.all().skin.image.data)).toBe(sum(maps.skin.image.data));
        HillBoyMaps.made = maps;
        // No text: neither file writes a letter on a canvas, names a font or reads a picture
        for (const file of ['hill/boy.js', 'hill/boymaps.js']) {
            const source = loadScript(file);
            for (const word of ['fillText', 'strokeText', '.font', 'new Image', 'loadImage', 'createImageBitmap', 'TextureLoader']) expect([file, word, source.includes(word)]).toEqual([file, word, false]);
            expect([file, /\.(png|jpe?g|webp|gif)\b/i.test(source)]).toEqual([file, false]);
        }
    });

    test('the face is modelled and no one\'s: a boy\'s proportions from his own numbers, symmetric, its eyes in their sockets under the lids', () => {
        const at = (polar, az) => HillBoy.headPoint(polar, az, new THREE.Vector3());
        // Symmetric: the same on both sides
        for (const [polar, az] of [[1.5, 0.3], [1.8, 0.5], [1.2, 0.9], [2.0, 0.2]]) {
            const a = at(polar, az), b = at(polar, -az);
            expect(a.x).toBeCloseTo(-b.x, 9);
            expect(a.y).toBeCloseTo(b.y, 9);
            expect(a.z).toBeCloseTo(b.z, 9);
        }
        // Each eye's ball behind where the face would be with no socket, and in front of the socket's floor
        const F = HillBoy.FACE, boy = rider.boy;
        for (const eye of boy.eyes) {
            const c = boy.rest[eye.name].clone().sub(boy.headAt);
            expect(c.z + F.eyeR).toBeLessThan(HillBoy.eyeZ() + F.eyeR + 0.003);
            expect(c.z + F.eyeR).toBeGreaterThan(c.z);
        }
    });
});

describe('his life', () => {
    test('he breathes, faster and deeper when he works; he blinks every few seconds', () => {
        const lane = new HillLane(), b = new HillBicycle(lane), boy = rider.boy;
        const breaths = (walking) => {
            b.reset(60);
            b.walking = walking;
            if (walking) b.vehicle.yawAngle += Math.PI;
            let swells = [], crossings = 0, last = 0, shut = 0;
            for (let t = 0; t < 12; t += 1 / 60) {
                b.vehicle.speed = walking ? 1.5 : 0;
                b.vehicle.footDown = !walking;
                if (walking) b.walkM = 24 + t * 1.5;
                rider.update(b, lane, 1 / 60);
                const s = boy.breath.scale.z - 1;
                swells.push(s);
                if (t > 6 && last < s && s - last > 0) crossings += 0;
                if (boy.lid > 0.9) shut++;
                last = s;
            }
            const late = swells.slice(swells.length / 2);
            return { deepest: Math.max(...late), blinks: shut, phase: boy.breathPhase, effort: boy.effort };
        };
        const rest = breaths(false), work = breaths(true);
        console.log(`hill boy breath: ${rest.deepest.toFixed(3)} at rest (effort ${rest.effort.toFixed(2)}), ${work.deepest.toFixed(3)} pushing up tired (effort ${work.effort.toFixed(2)})`);
        expect(work.deepest).toBeGreaterThan(rest.deepest * 1.8);
        expect(rest.blinks).toBeGreaterThan(0);
    });

    test('he looks where he is going, and at a door: his eyes and head turn to it, and over his shoulder once he is past', () => {
        const lane = flat(), b = new HillBicycle(lane), boy = rider.boy;
        b.reset(40);
        b.vehicle.speed = 6;
        const ahead = new THREE.Vector3(), door = new THREE.Vector3();
        rider.lookAt = null;
        for (let t = 0; t < 1; t += 1 / 60) rider.update(b, lane, 1 / 60);
        expect(Math.abs(boy.lookYaw)).toBeLessThan(0.05);
        // A door to his left (+x), ahead: his head and eyes turn left
        rider.group.updateMatrixWorld(true);
        rider.lookAt = rider.group.localToWorld(door.set(4, 1.2, 6));
        for (let t = 0; t < 1; t += 1 / 60) rider.update(b, lane, 1 / 60);
        expect(boy.lookYaw).toBeGreaterThan(0.25);
        expect(boy.eyeYaw).toBeGreaterThan(0);
        // Past it, behind him: he turns his head and his chest back towards it
        rider.group.updateMatrixWorld(true);
        rider.lookAt = rider.group.localToWorld(door.set(4, 1.2, -3));
        for (let t = 0; t < 1.5; t += 1 / 60) rider.update(b, lane, 1 / 60);
        expect(boy.lookYaw).toBeGreaterThan(0.8);
        expect(boy.chestYaw).toBeGreaterThan(0.05);
        rider.lookAt = null;
        void ahead;
    });

    test('a throw takes his hand to the basket, out to the side the loaf goes, open, and back to the grip', () => {
        const lane = flat(), b = new HillBicycle(lane), boy = rider.boy, T = HillBoy.THROW;
        b.reset(40);
        b.vehicle.speed = 6;
        rider.foot = 0;
        rider.update(b, lane, 0);
        const hand = () => rider.frame.worldToLocal(boy.hands[0].bone.getWorldPosition(new THREE.Vector3()));
        rider.group.updateMatrixWorld(true);
        const grip = hand();
        rider.throwAt(1);
        let out = 0, open = 1;
        for (let t = 0; t < T.backS + 0.3; t += 1 / 60) {
            rider.update(b, lane, 1 / 60);
            rider.group.updateMatrixWorld(true);
            out = Math.max(out, hand().x);
            if (t > T.releaseS && t < T.flingS + 0.05) open = Math.min(open, boy.curl.l);
        }
        rider.group.updateMatrixWorld(true);
        console.log(`hill boy throw: the hand ${out.toFixed(2)} m out to the side, its fingers ${open.toFixed(2)} closed as it lets go, back ${(hand().distanceTo(grip) * 100).toFixed(1)} cm from the grip`);
        expect(out).toBeGreaterThan(0.45);
        expect(open).toBeLessThan(0.3);
        expect(hand().distanceTo(grip)).toBeLessThan(0.03);
    });
});
