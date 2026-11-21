// Small worlds built in memory for the world runtime tests: a ride as typed arrays, and a stand-in for
// WorldData that holds flat tiles, so a test chooses exactly what the ground is.
export function samplesOf(points, { spacing = 4, flags = 0 } = {}) {
    const count = points.length;
    const out = {
        count, s: new Float64Array(count), x: new Float64Array(count), y: new Float64Array(count), z: new Float64Array(count),
        heading: new Float64Array(count), width: new Float32Array(count), flags: new Uint8Array(count), edgeId: new Uint32Array(count)
    };
    let s = 0;
    points.forEach((p, i) => {
        if (i) s += Math.hypot(p.x - points[i - 1].x, p.z - points[i - 1].z);
        out.s[i] = s;
        out.x[i] = p.x; out.y[i] = p.y; out.z[i] = p.z; out.heading[i] = p.heading; out.width[i] = p.width ?? 10;
        out.flags[i] = typeof flags === 'function' ? flags(i) : flags;
    });
    return out;
}

// A straight road along +z at x = 0 (heading 0), `length` metres, samples every `spacing`
export function straight(length = 400, { spacing = 4, y = 100, width = 10 } = {}) {
    const points = [];
    for (let z = 0; z <= length + 1e-9; z += spacing) points.push({ x: 0, y, z, heading: 0, width });
    return points;
}

// An eight: it crosses itself at the origin, half a ride apart in s. Heading follows the way it runs.
export function eight({ halfWidth = 2500, halfHeight = 1000, spacing = 4, y = 1000 } = {}) {
    const x = t => halfWidth * Math.sin(t);
    const z = t => halfHeight * Math.sin(2 * t);
    const dx = t => halfWidth * Math.cos(t);
    const dz = t => 2 * halfHeight * Math.cos(2 * t);
    const points = [];
    let t = 0;
    while (t < 2 * Math.PI) {
        points.push({ x: x(t), y, z: z(t), heading: Math.atan2(dx(t), dz(t)), width: 10 });
        t += spacing / Math.hypot(dx(t), dz(t));
    }
    return points;
}

// A WorldData stand-in: every tile of `tiles` ([tx, tz]) exists; one is "fetched" on request and then resident.
// `shape(x, z)` is the tile height; `zone(x, z)` the zone code. The far grid answers `far` (or null).
export function fakeData({ tiles, shape = () => 100, zone = () => 0, far = null, resident = true, chunks = [] } = {}) {
    const N = 65, CELL = 8, M = 512;
    const made = new Map();
    const make = (key) => {
        const [tx, tz] = key.split(',').map(Number);
        const heights = new Float32Array(N * N), zones = new Uint8Array(N * N);
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
            const x = tx * M + i * CELL, z = tz * M + j * CELL;
            heights[j * N + i] = shape(x, z);
            zones[j * N + i] = zone(x, z);
        }
        return { key, tx, tz, heights, zones };
    };
    const data = {
        manifest: { tiles: { height: tiles, cover: tiles }, chunks },
        chunks: new Map(),
        fetched: [],
        tile(key) { return made.get(key) || null; },
        cover() { return null; },
        farHeight: far ? far : () => null,
        async ensureTile(key) {
            if (!tiles.some(([tx, tz]) => `${tx},${tz}` === key)) return null;
            await Promise.resolve();
            if (!made.has(key)) { data.fetched.push(key); made.set(key, make(key)); }
            return made.get(key);
        },
        async ensureCover() { return null; },
        chunksNear() { return []; },
        async ensureChunks() {},
        holds: null
    };
    if (resident) for (const [tx, tz] of tiles) made.set(`${tx},${tz}`, make(`${tx},${tz}`));
    return data;
}

export const allTiles = (x0, x1, z0, z1) => {
    const out = [];
    for (let tx = x0; tx <= x1; tx++) for (let tz = z0; tz <= z1; tz++) out.push([tx, tz]);
    return out;
};
