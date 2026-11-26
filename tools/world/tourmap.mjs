// The tour map's lines (js/world/tourmap-data.js): the road of each of the tour's twelve legs, simplified, with the
// height at each point, and the places the map names. The menu draws them over a relief of the far land
// (js/world/tourmap.js). Safe to run again: the same input gives the same bytes. Run it again when a leg is built or
// its ends move (js/world/tour.js).
//   node tools/world/tourmap.mjs --plan <tour plan json> [--cache <dir>] [--out js/world/tourmap-data.js]
//
// A built leg (a row of the tour with a folder) is its stage's own ride, as the game rides it, from its folder's data.
// A leg not built yet is its road in the plan, the tour's planning file: `legs[k].pts`, the road of leg k + 1 as LV95
// [E, N] points, and `W`, named points as LV95 [E, N]. Only coordinates are read from the plan. Its heights come from
// the 50 m pooled swissALTI3D cache (`alti3d/far50`, tools/world/cache.mjs alti3d-far), as a mean over each 50 m cell.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeWorld } from './encode.mjs';
import { rideSamples } from './stations.mjs';
import { readTour } from './tour.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

// The world's origin (every manifest's): x = E - E0, z = -(N - N0)
export const ORIGIN = { e0: 2688000, n0: 1165000 };
// How far a simplified line may stand off the road (m), and the grid the points are rounded to (m)
export const TOLERANCE_M = 12;
export const ROUND_M = 5;

// The places the map names: the passes and the towns of the loop, by their key in the plan's `W`. `kind` sets the
// mark (a pass is a peak mark), `side` where the label stands from the point (the map's own layout, chosen so no two
// labels meet at the menu's sizes)
export const PLACES = [
    { key: 'Airolo', name: 'Airolo', kind: 'town', side: 'e' },
    { key: 'Tremola upper', name: 'Tremola', kind: 'road', side: 'w' },
    { key: 'Gotthard', name: 'Gotthard', kind: 'pass', side: 'w' },
    { key: 'Hospental', name: 'Hospental', kind: 'town', side: 'w' },
    { key: 'Andermatt', name: 'Andermatt', kind: 'town', side: 'e' },
    { key: 'Schöllenen', name: 'Schöllenen', kind: 'road', side: 'e' },
    { key: 'Susten', name: 'Susten', kind: 'pass', side: 's' },
    { key: 'Gadmen', name: 'Gadmen', kind: 'town', side: 'n' },
    { key: 'Innertkirchen', name: 'Innertkirchen', kind: 'town', side: 's' },
    { key: 'Guttannen', name: 'Guttannen', kind: 'town', side: 'e' },
    { key: 'Grimsel', name: 'Grimsel', kind: 'pass', side: 'w' },
    { key: 'Gletsch', name: 'Gletsch', kind: 'town', side: 's' },
    { key: 'Furka', name: 'Furka', kind: 'pass', side: 'n' },
    { key: 'Realp', name: 'Realp', kind: 'town', side: 's' }
];

const option = (argv, name, fallback) => {
    const at = argv.indexOf(`--${name}`);
    return at >= 0 ? argv[at + 1] : fallback;
};

export const toWorld = ([e, n]) => [e - ORIGIN.e0, -(n - ORIGIN.n0)];

// Douglas-Peucker on [x, z, ...] points
export function simplify(points, tolerance) {
    if (points.length < 3) return points.slice();
    const keep = new Uint8Array(points.length);
    keep[0] = keep[points.length - 1] = 1;
    const stack = [[0, points.length - 1]];
    while (stack.length) {
        const [a, b] = stack.pop();
        const [ax, az] = points[a], [bx, bz] = points[b];
        const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || 1;
        let worst = -1, far = 0;
        for (let i = a + 1; i < b; i++) {
            const [px, pz] = points[i];
            const d = Math.abs(dz * (px - ax) - dx * (pz - az)) / len;
            if (d > far) { far = d; worst = i; }
        }
        if (far > tolerance) {
            keep[worst] = 1;
            stack.push([a, worst], [worst, b]);
        }
    }
    return points.filter((_, i) => keep[i]);
}

// The mean height of the 50 m cells round an LV95 point, bilinear between cell centres, from the far50 cache
export function heightModel(cacheDir) {
    const tiles = new Map();
    const tile = (ek, nk) => {
        const key = `${ek}-${nk}`;
        if (!tiles.has(key)) {
            const file = path.join(cacheDir, 'alti3d', 'far50', `${key}.bin`);
            if (!fs.existsSync(file)) tiles.set(key, null);
            else {
                const bytes = fs.readFileSync(file);
                tiles.set(key, new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length)));
            }
        }
        return tiles.get(key);
    };
    // The cell `col` 50 m steps east and `row` 50 m steps north of LV95 0, 0; a tile's rows run north to south
    const cell = (col, row) => {
        const ek = Math.floor(col / 20), nk = Math.floor(row / 20);
        const data = tile(ek, nk);
        if (!data) return NaN;
        return data[(19 - (row - nk * 20)) * 20 + (col - ek * 20)];
    };
    return ([e, n]) => {
        const gx = (e - 25) / 50, gy = (n - 25) / 50;
        const col = Math.floor(gx), row = Math.floor(gy), fx = gx - col, fy = gy - row;
        const h00 = cell(col, row), h10 = cell(col + 1, row), h01 = cell(col, row + 1), h11 = cell(col + 1, row + 1);
        return (h00 * (1 - fx) + h10 * fx) * (1 - fy) + (h01 * (1 - fx) + h11 * fx) * fy;
    };
}

// A built leg's ride as [x, z, y] points in the order it is ridden: its stage of its folder's ride (the forward frame's
// `from` to `to`, turned round for a stage ridden the other way)
export function rideLine(root, leg) {
    const world = decodeWorld(path.join(root, leg.folder));
    const stage = world.manifest.stages.find(st => st.id === leg.id);
    if (!stage) throw new Error(`leg ${leg.n} (${leg.id}): no stage of that id in ${leg.folder}`);
    const samples = rideSamples(world.edges, world.ride.path);
    const points = [];
    for (let i = 0; i < samples.s.length; i++) {
        if (samples.s[i] >= stage.from - 1e-6 && samples.s[i] <= stage.to + 1e-6) points.push([samples.x[i], samples.z[i], samples.y[i]]);
    }
    return stage.dir === -1 ? points.reverse() : points;
}

const round = ([x, z, y]) => [Math.round(x / ROUND_M) * ROUND_M, Math.round(z / ROUND_M) * ROUND_M, Math.round(y)];

export function build(plan, height, tour = readTour(), root = ROOT) {
    const legs = tour.LEGS.map((row) => {
        if (row.folder) return { n: row.n, line: simplify(rideLine(root, row), TOLERANCE_M).map(round) };
        const leg = plan.legs[row.n - 1];
        if (!leg) throw new Error(`leg ${row.n}: neither built nor in the plan`);
        const line = simplify(leg.pts.map(p => [...toWorld(p), p]), TOLERANCE_M).map(([x, z, p]) => {
            const y = height(p);
            if (!Number.isFinite(y)) throw new Error(`leg ${row.n}: no height at ${p.join(',')}`);
            return round([x, z, y]);
        });
        return { n: row.n, line };
    });
    const places = PLACES.map(place => {
        const at = plan.W[place.key];
        if (!at) throw new Error(`the plan names no ${place.key}`);
        const [x, z] = toWorld(at);
        return { name: place.name, kind: place.kind, side: place.side, x: Math.round(x / 10) * 10, z: Math.round(z / 10) * 10 };
    });
    return { legs, places };
}

export function render({ legs, places }) {
    const lines = legs.map(leg => `        ${leg.n}: [${leg.line.map(p => `[${p.join(',')}]`).join(',')}]`).join(',\n');
    const named = places.map(p => `        { name: '${p.name}', kind: '${p.kind}', side: '${p.side}', x: ${p.x}, z: ${p.z} }`).join(',\n');
    return `// WorldMapData: the tour map's lines and places, written by tools/world/tourmap.mjs (do not edit by hand). Each leg of the
// tour (js/world/tour.js, by its number) is its road as [x, z, y] points in metres in the world's frame (x east, z
// south, y the height): a built leg's own ride, a leg not built yet its planned road, simplified to ${TOLERANCE_M} m and
// rounded to ${ROUND_M} m. The places are the passes and the towns the
// map names, with the side their label stands on.
const WorldMapData = Object.freeze({
    legs: Object.freeze({
${lines}
    }),
    places: Object.freeze([
${named}
    ])
});

if (typeof module !== 'undefined' && module.exports) module.exports = { WorldMapData };
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const argv = process.argv.slice(2);
    const planFile = option(argv, 'plan');
    if (!planFile) {
        process.stderr.write('usage: node tools/world/tourmap.mjs --plan <tour plan json> [--cache <dir>] [--out <file>]\n');
        process.exit(2);
    }
    const cacheDir = option(argv, 'cache', path.join(os.homedir(), 'Library', 'Caches', 'twisty-world'));
    const out = option(argv, 'out', path.join(ROOT, 'js', 'world', 'tourmap-data.js'));
    const data = build(JSON.parse(fs.readFileSync(planFile, 'utf8')), heightModel(cacheDir));
    const text = render(data);
    fs.writeFileSync(out, text);
    const points = data.legs.reduce((sum, leg) => sum + leg.line.length, 0);
    process.stderr.write(`tourmap: ${data.legs.length} legs, ${points} points, ${data.places.length} places, ${text.length} B -> ${path.relative(ROOT, out)}\n`);
}
