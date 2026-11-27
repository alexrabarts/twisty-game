// The far land is closed and shows no line where one grid meets the next (js/world/horizon.js). Past the drawn tiles a
// world draws far.bin's 100 m grid (Horizon) and the levels round it out to 40 km (FarLand, 250 m and 800 m), each
// built here as the page builds it (FarLand.assemble over the committed data):
//   open   every open edge of a grid (an edge of one triangle only: its rim, a cell with no data) is read every 10 m,
//          and must lie under another grid drawn there (its top at least BURIED_M over the edge). An edge in the air
//          is a crack the sky shows through: the owner's white wedge on a far ridge (airolo-lookout, km 7.6) was the
//          250 m level standing through far.bin (its sink of 40 m too little on a ridge) with the open edge of its hole
//          in the air, and far.bin's rim in the air over the level round it. The outermost level's end (its rim and the
//          band past the terrain model joined to it) ends the land and is not read
//   tone   along each grid's drawn box, every 25 m, the colour (luminance, 0 to 255) and the normal (degrees) of the
//          grid inside and of the level round it at the same point: a step there is a straight line of a new tone
//          across the hillsides (the owner's teal line on the valley floor)
// The GPU probe `world-far-seams` (tools/terrain-check.mjs) reads the same from the near and far chase camera.
import { describe, test, expect, beforeAll } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';

const { WorldData, Horizon, FarLand } = loadGame();

// Metres another grid's top must stand over an open edge to close it
const BURIED_M = 0.5;
const SAMPLE_M = 10;
const TONE_M = 25;
// The most a mean step along one box may be, in luminance (0 to 255) and in degrees of the normal
const TONE_MAX = 2;
const ANGLE_MAX = 2;

// What fails, per folder: open samples, and the worst mean tone step and normal step of a box. Only shrinks
const KNOWN = {
    'world/': { open: 0, tone: 0, angle: 0 },
    'worlds/gotthard/': { open: 0, tone: 0, angle: 0 },
    'worlds/airolo/': { open: 0, tone: 0, angle: 0 },
    'worlds/susten/': { open: 0, tone: 0, angle: 0 },
    'worlds/haslital/': { open: 0, tone: 0, angle: 0 }
};

// The triangles of a grid mesh hashed by plan, for the top drawn at (x, z) with its colour and normal
function surface(mesh) {
    const g = mesh.geometry, pos = g.attributes.position.array, col = g.attributes.color.array, nor = g.attributes.normal.array, index = g.index.array;
    const cell = 200, hash = new Map();
    for (let t = 0; t < index.length; t += 3) {
        const [a, b, c] = [index[t], index[t + 1], index[t + 2]];
        const xs = [pos[a * 3], pos[b * 3], pos[c * 3]], zs = [pos[a * 3 + 2], pos[b * 3 + 2], pos[c * 3 + 2]];
        for (let i = Math.floor(Math.min(...xs) / cell); i <= Math.floor(Math.max(...xs) / cell); i++) {
            for (let j = Math.floor(Math.min(...zs) / cell); j <= Math.floor(Math.max(...zs) / cell); j++) {
                const k = `${i},${j}`;
                (hash.get(k) || hash.set(k, []).get(k)).push(t);
            }
        }
    }
    return (x, z) => {
        let best = null;
        for (const t of hash.get(`${Math.floor(x / cell)},${Math.floor(z / cell)}`) || []) {
            const [a, b, c] = [index[t], index[t + 1], index[t + 2]];
            const ax = pos[a * 3], az = pos[a * 3 + 2], bx = pos[b * 3], bz = pos[b * 3 + 2], cx = pos[c * 3], cz = pos[c * 3 + 2];
            const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
            // (an upright face, a skirt, has no top)
            if (Math.abs(det) < 1e-6) continue;
            const wa = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det, wb = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det, wc = 1 - wa - wb;
            if (wa < -1e-6 || wb < -1e-6 || wc < -1e-6) continue;
            const y = wa * pos[a * 3 + 1] + wb * pos[b * 3 + 1] + wc * pos[c * 3 + 1];
            if (best && best.y >= y) continue;
            const mix = (arr, k) => wa * arr[a * 3 + k] + wb * arr[b * 3 + k] + wc * arr[c * 3 + k];
            best = { y, colour: [0, 1, 2].map(k => mix(col, k)), normal: [0, 1, 2].map(k => mix(nor, k)) };
        }
        return best;
    };
}

// The world's end of the outermost level: off its lattice, or a vertex with no data joined to its rim through
// vertices with no data (a band the terrain model does not cover). An open edge beside it ends the land; the sky is
// past it, not through it
function worldsEnd(level) {
    const { nx, nz, heights } = level, end = new Uint8Array(nx * nz), stack = [];
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
        const v = j * nx + i;
        if ((i === 0 || j === 0 || i === nx - 1 || j === nz - 1) && heights[v] === -32768) { end[v] = 1; stack.push(v); }
    }
    while (stack.length) {
        const v = stack.pop(), i = v % nx, j = (v - i) / nx;
        for (const [a, b] of [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]]) {
            if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
            const w = b * nx + a;
            if (!end[w] && heights[w] === -32768) { end[w] = 1; stack.push(w); }
        }
    }
    return (x, z) => {
        const i = Math.round((x - level.x0) / level.cell), j = Math.round((z - level.z0) / level.cell);
        for (let b = j - 1; b <= j + 1; b++) for (let a = i - 1; a <= i + 1; a++) if (a < 0 || b < 0 || a >= nx || b >= nz || end[b * nx + a]) return true;
        return false;
    };
}

// Every edge of one triangle only, as [a, b] vertex pairs
function openEdges(mesh) {
    const index = mesh.geometry.index.array, uses = new Map();
    for (let t = 0; t < index.length; t += 3) {
        for (const [a, b] of [[index[t], index[t + 1]], [index[t + 1], index[t + 2]], [index[t + 2], index[t]]]) {
            const key = a < b ? `${a},${b}` : `${b},${a}`;
            uses.set(key, (uses.get(key) || 0) + 1);
        }
    }
    return [...uses].filter(([, n]) => n === 1).map(([key]) => key.split(',').map(Number));
}

const lum = c => 255 * (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]);
const angle = (a, b) => {
    const la = Math.hypot(...a), lb = Math.hypot(...b);
    return Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (la * lb)))) * 180 / Math.PI;
};

for (const base of Object.keys(KNOWN)) describe(`the far land of ${base}`, () => {
    let meshes = [], boxes = [], outermost = null;
    beforeAll(async () => {
        const data = await new WorldData({ base, fetchFn: diskFetch().fetchFn }).load();
        await data.ensureFar();
        const levels = await data.ensureFarLand();
        const built = FarLand.assemble(data.far, data.farCover, data.farSink, levels);
        meshes = [built.horizon, ...built.levels];
        outermost = levels[levels.length - 1];
        // The box each grid is drawn over: far.bin's at its stride, then each level's
        const stride = Horizon.strideFor(data.far);
        boxes = [[data.far.x0, data.far.z0, data.far.x0 + Math.floor((data.far.nx - 1) / stride) * stride * data.far.cell, data.far.z0 + Math.floor((data.far.nz - 1) / stride) * stride * data.far.cell], ...levels.map(l => FarLand.box(l))];
    }, 120000);

    test('every open edge of a far grid lies under another grid', () => {
        const tops = meshes.map(surface);
        const open = [];
        let samples = 0;
        meshes.forEach((mesh, k) => {
            const pos = mesh.geometry.attributes.position.array;
            const last = k === meshes.length - 1;
            const atEnd = last ? worldsEnd(outermost) : null;
            for (const [a, b] of openEdges(mesh)) {
                const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2], bx = pos[b * 3], by = pos[b * 3 + 1], bz = pos[b * 3 + 2];
                if (last && atEnd(ax, az) && atEnd(bx, bz)) continue;
                const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / SAMPLE_M));
                for (let s = 0; s <= n; s++) {
                    const x = ax + (bx - ax) * s / n, y = ay + (by - ay) * s / n, z = az + (bz - az) * s / n;
                    samples++;
                    const over = tops.some((top, j) => { if (j === k) return false; const at = top(x, z); return at && at.y >= y + BURIED_M; });
                    if (!over) open.push({ grid: k, x: Math.round(x), z: Math.round(z), y: Math.round(y) });
                }
            }
        });
        // (where the open places are, for the record: the first few)
        if (open.length) console.log(`${base} open far land: ${open.length} of ${samples} samples, e.g. ${JSON.stringify(open.slice(0, 6))}`);
        expect(samples).toBeGreaterThan(1000);
        expect(open.length).toBeLessThanOrEqual(KNOWN[base].open);
    }, 300000);

    test('no line of a new tone where one far grid meets the next', () => {
        const tops = meshes.map(surface);
        let worstTone = 0, worstAngle = 0;
        const report = [];
        for (let k = 0; k + 1 < meshes.length; k++) {
            const [x0, z0, x1, z1] = boxes[k];
            // (a hair inside the box for the inner grid, a hair outside for the level round it)
            const sides = [[x0, z0, x1, z0, 0, 1], [x0, z1, x1, z1, 0, -1], [x0, z0, x0, z1, 1, 0], [x1, z0, x1, z1, -1, 0]];
            let tone = 0, turn = 0, n = 0;
            for (const [ax, az, bx, bz, ix, iz] of sides) {
                const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / TONE_M);
                for (let s = 1; s < steps; s++) {
                    const x = ax + (bx - ax) * s / steps, z = az + (bz - az) * s / steps;
                    const inner = tops[k](x + ix * 0.5, z + iz * 0.5), outer = tops[k + 1](x - ix * 0.5, z - iz * 0.5);
                    if (!inner || !outer) continue;
                    tone += Math.abs(lum(inner.colour) - lum(outer.colour));
                    turn += angle(inner.normal, outer.normal);
                    n++;
                }
            }
            const meanTone = n ? tone / n : 0, meanAngle = n ? turn / n : 0;
            report.push({ grid: k, points: n, tone: Math.round(meanTone * 10) / 10, angle: Math.round(meanAngle * 10) / 10 });
            expect(n).toBeGreaterThan(100);
            worstTone = Math.max(worstTone, meanTone);
            worstAngle = Math.max(worstAngle, meanAngle);
        }
        console.log(`${base} far land tone at each grid's edge: ${JSON.stringify(report)}`);
        expect(worstTone).toBeLessThanOrEqual(Math.max(TONE_MAX, KNOWN[base].tone));
        expect(worstAngle).toBeLessThanOrEqual(Math.max(ANGLE_MAX, KNOWN[base].angle));
    }, 300000);
});
