/**
 * @jest-environment node
 */
// Every bike is drawn as it is ridden: its side stand folded up. A stand left down pointed at the road through every
// bend. Read from the model files themselves, so a new bike is held with no line added here: no part of a bike's body
// more than SIDE_M off its centre line comes within CLEAR_M of the ground (a stand's foot stood 2 to 5 cm over it,
// 27 cm out; the lowest thing there on a bike with its stand up is a peg, an exhaust or a pannier).
// The builders: Kit.side_stand in tools/blender/bike_kit.py.
import { describe, test, expect } from '@jest/globals';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../../assets/bikes/', import.meta.url);
const SIDE_M = 0.2, CLEAR_M = 0.12;
const READ = { 5120: ['getInt8', 1, 127], 5121: ['getUint8', 1, 255], 5122: ['getInt16', 2, 32767], 5123: ['getUint16', 2, 65535], 5126: ['getFloat32', 4, 1] };

// The lowest y of the `body` nodes' vertices more than SIDE_M off the centre line, in the bike's own metres
function lowestSide(file) {
    const bytes = readFileSync(new URL(file, root));
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const jsonLength = view.getUint32(12, true);
    const doc = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)));
    const bin = 20 + jsonLength + 8;
    let low = Infinity, bodies = 0;
    for (const node of doc.nodes) {
        if (node.name !== 'body' || node.mesh === undefined) continue;
        bodies++;
        const t = node.translation || [0, 0, 0], s = node.scale || [1, 1, 1];
        for (const primitive of doc.meshes[node.mesh].primitives) {
            const accessor = doc.accessors[primitive.attributes.POSITION], bufferView = doc.bufferViews[accessor.bufferView];
            const [get, size, most] = READ[accessor.componentType];
            const stride = bufferView.byteStride || size * 3, start = bin + (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
            const unit = accessor.normalized ? 1 / most : 1;
            for (let i = 0; i < accessor.count; i++) {
                const x = view[get](start + i * stride, true) * unit * s[0] + t[0];
                const y = view[get](start + i * stride + size, true) * unit * s[1] + t[1];
                if (Math.abs(x) > SIDE_M && y < low) low = y;
            }
        }
    }
    return { low, bodies };
}

const files = [...readdirSync(root).filter(f => f.endsWith('.glb') && f !== 'rider.glb'), ...readdirSync(new URL('detail/', root)).filter(f => f.endsWith('.glb')).map(f => `detail/${f}`)];

describe('every bike has its stand up', () => {
    test('there are bikes to read, the five kinds and the riders\' own', () => {
        expect(files.length).toBeGreaterThanOrEqual(20);
    });

    test.each(files)('%s: nothing of the body hangs near the ground beside the bike', (file) => {
        const { low, bodies } = lowestSide(file);
        expect(bodies).toBeGreaterThan(0);
        expect(low).toBeGreaterThanOrEqual(CLEAR_M);
    });

    test('a folded stand keeps its length and points back along the bike, on its own side', () => {
        // Kit.side_stand's rule (tools/blender/bike_kit.py STAND_UP), held here in its own numbers
        const source = readFileSync(new URL('../../tools/blender/bike_kit.py', import.meta.url), 'utf8');
        const way = /STAND_UP = \(([-\d.]+), ([-\d.]+), ([-\d.]+)\)/.exec(source).slice(1).map(Number);
        expect(way[2]).toBeLessThan(-0.8);
        expect(way[1]).toBeLessThan(0);
        expect(way[1]).toBeGreaterThan(-0.5);
        // No bike script lays a rod from the frame to the ground at its side any more
        const scripts = [...readdirSync(new URL('../../tools/blender/', import.meta.url)).filter(f => /^bike_.*\.py$/.test(f)).map(f => `../../tools/blender/${f}`),
            ...readdirSync(new URL('../../tools/blender/bikes/', import.meta.url)).filter(f => f.endsWith('.py')).map(f => `../../tools/blender/bikes/${f}`)];
        const down = [];
        for (const script of scripts) {
            for (const line of readFileSync(new URL(script, import.meta.url), 'utf8').split('\n')) {
                const m = /k\.rod\(\((-?[\d.]+), ([\d.]+), (-?[\d.]+)\), \((-?[\d.]+), ([\d.]+), (-?[\d.]+)\)/.exec(line);
                if (m && Math.abs(Number(m[1])) < 0.3 && Math.max(Number(m[2]), Number(m[5])) >= 0.18 && Math.min(Number(m[2]), Number(m[5])) <= 0.07) down.push(`${script}: ${line.trim()}`);
            }
        }
        expect(down).toEqual([]);
    });
});
