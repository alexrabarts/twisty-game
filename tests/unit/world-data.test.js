// WorldData (js/world/data.js): where a world may be read from, the decode of every layer, and the
// trust that decides whether a time set in it may be submitted.
import { describe, test, expect } from '@jest/globals';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { loadGame } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';
import { decodeWorld } from '../../tools/world/encode.mjs';

const { WorldData } = loadGame();
const root = new URL('../../', import.meta.url);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = async buffer => sha(Buffer.from(buffer));
const exact = text => {
    const bytes = Buffer.from(text);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
};

describe('?worldData= is confined to two same-origin folders', () => {
    test('no value means the shipped world', () => {
        expect(WorldData.resolveBase(null)).toEqual({ base: 'world/', overridden: false });
        expect(WorldData.resolveBase('')).toEqual({ base: 'world/', overridden: false });
        expect(WorldData.resolveBase('world')).toMatchObject({ error: expect.any(String) });
        expect(WorldData.resolveBase('world/')).toEqual({ base: 'world/', overridden: false });
    });

    test('the fixture folder is allowed and counts as an override', () => {
        expect(WorldData.resolveBase('tests/fixtures/world/mini')).toEqual({ base: 'tests/fixtures/world/mini/', overridden: true });
    });

    test.each([
        'https://example.com/', '//example.com/world/', '../../', 'world/../secrets', '/world/', 'world\\x', 'javascript:alert(1)',
        'tests/fixtures/world/../../..', 'other/', 'world/./x', 'world/%2e%2e/x', 'world/x?y=1', 'world/x#y', 'data:text/plain,hi'
    ])('%s is refused', value => {
        const resolved = WorldData.resolveBase(value);
        expect(resolved.base).toBeNull();
        expect(resolved.error).toMatch(/relative path/);
    });
});

describe('the decode matches the importer', () => {
    test('every layer of the shipped slice equals tools/world/encode.mjs decodeWorld', async () => {
        const { fetchFn } = diskFetch();
        const data = await new WorldData({ fetchFn, digest }).load();
        const truth = decodeWorld(new URL('world/', root).pathname);
        expect(data.manifest.counts).toEqual(truth.manifest.counts);
        expect(data.edges.length).toBe(truth.edges.length);
        expect(data.nodes.count).toBe(truth.nodes.length);
        truth.edges.forEach((edge, i) => {
            expect(data.edges[i]).toMatchObject({ id: edge.id, a: edge.a, b: edge.b, onRide: edge.onRide, cls: edge.cls });
            expect(data.edges[i].length).toBeCloseTo(edge.length, 6);
        });
        // The ride's edges are resident after load(); a side edge is not
        const ride = data.ride.path[0].edgeId;
        const samples = data.edgeSamples(ride);
        expect(samples).not.toBeNull();
        expect(Array.from(samples.x)).toEqual(Array.from(truth.edges[ride].x));
        expect(Array.from(samples.heading)).toEqual(Array.from(truth.edges[ride].heading));
        const side = data.edges.find(e => !e.onRide && data.manifest.chunks.findIndex((c, k) => k === data.chunkOf(e.first) && !data.chunks.has(k)) >= 0);
        if (side) expect(data.edgeSamples(side.id)).toBeNull();

        const [tx, tz] = data.manifest.tiles.height[3];
        const key = `${tx},${tz}`;
        expect(data.tile(key)).toBeNull();
        const tile = await data.ensureTile(key);
        const real = truth.tiles.get(key);
        expect(Array.from(tile.zones)).toEqual(Array.from(real.zones));
        // Every height is the importer's, or the importer's held down beside the carved road (never raised)
        let held = 0;
        for (let i = 0; i < real.heights.length; i++) {
            if (tile.heights[i] === real.heights[i]) continue;
            held++;
            expect(tile.heights[i]).toBeLessThan(real.heights[i]);
        }
        expect(Array.from(tile.heights).filter((h, i) => h !== real.heights[i]).length).toBe(held);
        expect(Array.from(await data.ensureCover(key))).toEqual(Array.from(truth.cover.get(key)));
        expect(data.tile(key)).toBe(tile);
        expect(await data.ensureTile('999,999')).toBeNull();

        const far = await data.ensureFar();
        expect(far.nx).toBe(truth.far.nx);
        expect(data.farHeight(far.x0 + far.cell * 2.5, far.z0 + far.cell * 2.5)).toBeGreaterThan(-1000);
        expect(data.farHeight(far.x0 - 1000, far.z0)).toBeNull();
        expect((await data.ensureBuildings()).length).toBe(truth.buildings.length);
    });

    test('a failed fetch names the file', async () => {
        const { fetchFn } = diskFetch();
        const data = new WorldData({ base: 'tests/fixtures/world/none/', overridden: true, fetchFn });
        await expect(data.load()).rejects.toThrow('tests/fixtures/world/none/manifest.json: HTTP 404');
    });

    test('a format it does not know is refused', async () => {
        const manifest = JSON.parse(readFileSync(new URL('world/manifest.json', root)));
        manifest.format = 99;
        const fetchFn = async () => ({ ok: true, status: 200, arrayBuffer: async () => exact(JSON.stringify(manifest)) });
        await expect(new WorldData({ fetchFn }).load()).rejects.toThrow('world format 99');
    });
});


describe('trust: only the shipped, unmodified world submits', () => {
    test('the shipped folder with the manifest its SHA256SUMS lists is trusted', async () => {
        const { fetchFn } = diskFetch();
        expect((await new WorldData({ fetchFn, digest }).load()).trusted).toBe(true);
    });

    test('an override folder is never trusted, even with a valid manifest', async () => {
        const { fetchFn, calls } = diskFetch();
        const resolved = WorldData.resolveBase('tests/fixtures/world/mini');
        const data = await new WorldData({ base: resolved.base, overridden: resolved.overridden, fetchFn, digest }).load();
        expect(data.trusted).toBe(false);
        // It read only the fixture folder: no request to the shipped one
        expect(calls.every(url => url.startsWith('tests/fixtures/world/mini/'))).toBe(true);
    });

    test('a manifest that SHA256SUMS does not list is not trusted', async () => {
        const { fetchFn } = diskFetch();
        const edited = async (url) => {
            const response = await fetchFn(url);
            if (url !== 'world/manifest.json') return response;
            const text = Buffer.from(await response.arrayBuffer()).toString().replace('"credit":"© swisstopo', '"credit":"© someone');
            return { ok: true, status: 200, arrayBuffer: async () => exact(text) };
        };
        expect((await new WorldData({ fetchFn: edited, digest }).load()).trusted).toBe(false);
    });

    test('a digest that disagrees with SHA256SUMS is not trusted', async () => {
        const { fetchFn } = diskFetch();
        const wrong = async () => '0'.repeat(64);
        expect((await new WorldData({ fetchFn, digest: wrong }).load()).trusted).toBe(false);
    });
});

describe('residency', () => {
    test('tiles beyond the cap are evicted oldest first, but never one in use', async () => {
        const { fetchFn } = diskFetch();
        const data = await new WorldData({ fetchFn }).load();
        const keys = data.manifest.tiles.height.map(([tx, tz]) => `${tx},${tz}`);
        const held = keys[0];
        data.holds = key => key === held;
        for (const key of keys.slice(0, 20)) await data.ensureTile(key);
        const before = data.tiles.size;
        expect(before).toBeLessThanOrEqual(WorldData.MAX_TILES);
        data.trim(data.tiles, 5, key => data.holds(key));
        expect(data.tiles.size).toBe(5);
        expect(data.tiles.has(held)).toBe(true);
    });
});
