/**
 * @jest-environment node
 */
// The horse and cart (HillHorse, js/hill/horse.js; assets/hill/horse.glb from tools/blender/hill_horse.py): its walk
// is a four-beat walk, a hoof on the ground stays where it landed, the legs hold together, the wheels turn at the
// speed over their radius, and stood still the horse breathes, rests a hind leg and keeps its hooves on the ground
import { describe, test, expect, beforeAll } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canvasStub, loadScript, realThree } from '../helpers/load-game.js';

const THREE = realThree();
const root = fileURLToPath(new URL('../..', import.meta.url));
const fetch = async url => {
    const bytes = readFileSync(join(root, url));
    return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
};
const { SceneAssets, HillHorse } = new Function('THREE', 'document', 'console', 'fetch', 'Blob', 'TextDecoder',
    `${loadScript('sceneassets.js')}\n${loadScript('hill/horse.js')}\nreturn { SceneAssets, HillHorse };`)(THREE, canvasStub(), console, fetch, Blob, TextDecoder);

const DT = 1 / 60;
const G = HillHorse.GAIT;
let horse;
beforeAll(async () => {
    horse = new HillHorse(await SceneAssets.loadModel(HillHorse.FILE));
});

// A hoof's place in the world: its pivot (the fetlock) carried down the pastern to the hoof's top
const rig = () => horse.rigs[0];
const hoofAt = (leg, out = new THREE.Vector3()) => {
    const part = rig().parts[`${leg}_hoof`];
    part.updateWorldMatrix(true, false);
    const L = rig().legs[leg];
    return out.set(0, -L.pastern * Math.cos(HillHorse.PASTERN_RAD), L.pastern * Math.sin(HillHorse.PASTERN_RAD)).applyMatrix4(part.matrixWorld);
};
const walk = (seconds, speed, each) => {
    for (let t = 0; t < seconds; t += DT) {
        horse.group.position.z += speed * DT;
        horse.update(DT, speed);
        if (each) each(t);
    }
};

describe('the horse and cart', () => {
    test('walking, each hoof lands in turn, left hind, left fore, right hind, right fore, a quarter stride apart, and on the ground it does not slide', () => {
        horse.group.position.set(0, 0, 0);
        walk(3, 1.2);
        const landed = [], down = {}, held = {}, at = new THREE.Vector3();
        let worst = 0;
        walk(G.strideM / 1.2 * 2, 1.2, t => {
            for (const leg of HillHorse.LEGS) {
                const p = hoofAt(leg, at);
                const ground = p.y < HillHorse.HOOF_M + 0.004;
                if (!(leg in down)) {
                    down[leg] = ground;
                    if (ground) held[leg] = p.clone();
                    continue;
                }
                if (ground && !down[leg]) {
                    landed.push([leg, t]);
                    held[leg] = p.clone();
                } else if (ground && held[leg]) {
                    worst = Math.max(worst, Math.hypot(p.x - held[leg].x, p.z - held[leg].z));
                }
                down[leg] = ground;
            }
        });
        const order = landed.slice(0, 4).map(([leg]) => leg);
        const gaps = landed.slice(1, 5).map(([, t], i) => t - landed[i][1]);
        console.log(`hill horse: lands ${landed.slice(0, 5).map(([leg, t]) => `${leg} ${t.toFixed(2)} s`).join(', ')}; a hoof on the ground moved at most ${(worst * 1000).toFixed(1)} mm`);
        // The four in the walk's order, whichever comes first
        const cycle = ['hind_l', 'fore_l', 'hind_r', 'fore_r'];
        const first = cycle.indexOf(order[0]);
        expect(order).toEqual([0, 1, 2, 3].map(i => cycle[(first + i) % 4]));
        const quarter = G.strideM / 1.2 / 4;
        for (const gap of gaps) expect(Math.abs(gap - quarter)).toBeLessThan(0.05);
        expect(worst).toBeLessThan(0.01);
    });

    test('each leg holds together: the bones keep their lengths, the knee bends forward and the hock back, the hoof never under the ground', () => {
        horse.group.position.set(0, 0, 0);
        const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
        let lowest = Infinity;
        walk(3, 1.2, () => {
            for (const leg of HillHorse.LEGS) {
                const L = rig().legs[leg], P = rig().parts;
                P[`${leg}_upper`].getWorldPosition(a);
                P[`${leg}_lower`].getWorldPosition(b);
                P[`${leg}_hoof`].getWorldPosition(c);
                expect(a.distanceTo(b)).toBeCloseTo(L.upper, 3);
                expect(b.distanceTo(c)).toBeLessThanOrEqual(L.lower + 1e-3);
                // The middle joint ahead of the line top to fetlock on a fore leg, behind it on a hind one
                const t = (b.y - a.y) / (c.y - a.y), z = a.z + (c.z - a.z) * t;
                if (Math.abs(a.distanceTo(c) - (L.upper + L.lower)) > 0.01) expect(Math.sign(b.z - z)).toBe(L.fore ? 1 : -1);
                lowest = Math.min(lowest, hoofAt(leg, c).y);
            }
        });
        expect(lowest).toBeGreaterThan(HillHorse.HOOF_M - 0.005);
    });

    test('the cart\'s wheels turn at the speed over their radius, and the bed rocks a little', () => {
        horse.group.position.set(0, 0, 0);
        const before = horse.wheel;
        let most = 0;
        walk(1, 1.2, () => { most = Math.max(most, Math.abs(rig().parts.cart_bed.rotation.z)); });
        const turned = (horse.wheel - before + 2 * Math.PI) % (2 * Math.PI);
        expect(turned).toBeCloseTo(1.2 * 1 / HillHorse.CART.wheelM % (2 * Math.PI), 1);
        expect(rig().parts.wheel_l.rotation.x).toBeCloseTo(horse.wheel, 6);
        expect(most).toBeGreaterThan(0.002);
        expect(most).toBeLessThan(0.03);
    });

    test('stood still it breathes, rests one hind leg then the other, and keeps every other hoof on the ground', () => {
        horse.group.position.set(0, 0, 0);
        walk(2, 1.2);
        const scales = [], rested = new Set();
        walk(HillHorse.STAND.restS * 2.5, 0, t => {
            if (t < 1.5) return;
            scales.push(rig().parts.body.scale.x);
            for (const leg of HillHorse.LEGS) {
                const y = hoofAt(leg).y - HillHorse.HOOF_M;
                const busy = leg === horse.stand.rest || (horse.stand.stamp && horse.stand.stamp.leg === leg);
                if (!busy) expect(y).toBeLessThan(0.01);
                else if (y > 0.02 && leg.startsWith('hind')) rested.add(leg);
            }
        });
        console.log(`hill horse stood: the barrel from ${Math.min(...scales).toFixed(4)} to ${Math.max(...scales).toFixed(4)}; hind legs rested ${[...rested].join(', ')}`);
        expect(Math.max(...scales) - Math.min(...scales)).toBeGreaterThan(0.005);
        expect(rested.size).toBe(2);
    });
});
