// The world data tools: the GeoPackage reader (header, WKB, R-tree) and the cache directory rules.
import { describe, test, expect } from '@jest/globals';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseWkb, parseGpkgGeometry, parseGpkgHeader, GeoPackage } from '../../tools/world/gpkg.mjs';
import { resolveCacheDir, listAlti3dTiles } from '../../tools/world/cache.mjs';

function wkbLine(coords, { little = true, z = false, iso = true } = {}) {
    const dim = z ? 3 : 2;
    const buf = Buffer.alloc(1 + 4 + 4 + coords.length * dim * 8);
    const w32 = (v, o) => (little ? buf.writeUInt32LE(v, o) : buf.writeUInt32BE(v, o));
    const w64 = (v, o) => (little ? buf.writeDoubleLE(v, o) : buf.writeDoubleBE(v, o));
    buf[0] = little ? 1 : 0;
    w32(z ? (iso ? 1002 : (0x80000000 | 2) >>> 0) : 2, 1);
    w32(coords.length, 5);
    coords.forEach((c, i) => c.forEach((v, k) => w64(v, 9 + (i * dim + k) * 8)));
    return buf;
}

function gpkgBlob(wkb, { envelope = null, srs = 2056, little = true } = {}) {
    const envDoubles = envelope ? 4 : 0;
    const head = Buffer.alloc(8 + envDoubles * 8);
    head[0] = 0x47; head[1] = 0x50; head[2] = 0;
    head[3] = (little ? 1 : 0) | ((envelope ? 1 : 0) << 1);
    if (little) head.writeInt32LE(srs, 4); else head.writeInt32BE(srs, 4);
    (envelope ?? []).forEach((v, i) => (little ? head.writeDoubleLE(v, 8 + i * 8) : head.writeDoubleBE(v, 8 + i * 8)));
    return Buffer.concat([head, wkb]);
}

const u8 = b => new Uint8Array(b.buffer, b.byteOffset, b.byteLength);

describe('gpkg.mjs WKB parser', () => {
    test('LineString 2D, both byte orders', () => {
        const pts = [[2686000.5, 1155000.25], [2686010, 1155020]];
        for (const little of [true, false]) {
            const g = parseWkb(u8(wkbLine(pts, { little })));
            expect(g).toEqual({ type: 'LineString', hasZ: false, hasM: false, coordinates: pts });
        }
    });

    test('LineString Z, ISO and EWKB flag forms', () => {
        const pts = [[1, 2, 3], [4, 5, 6]];
        for (const iso of [true, false]) {
            const g = parseWkb(u8(wkbLine(pts, { z: true, iso })));
            expect(g.hasZ).toBe(true);
            expect(g.coordinates).toEqual(pts);
        }
    });

    test('MultiLineString nests its parts', () => {
        const a = wkbLine([[0, 0], [1, 1]]);
        const b = wkbLine([[5, 5], [6, 6], [7, 7]]);
        const head = Buffer.alloc(9);
        head[0] = 1; head.writeUInt32LE(5, 1); head.writeUInt32LE(2, 5);
        const g = parseWkb(u8(Buffer.concat([head, a, b])));
        expect(g.type).toBe('MultiLineString');
        expect(g.coordinates.map(l => l.length)).toEqual([2, 3]);
    });

    test('Point, Polygon and MultiPolygon', () => {
        const pt = Buffer.alloc(21);
        pt[0] = 1; pt.writeUInt32LE(1, 1); pt.writeDoubleLE(7, 5); pt.writeDoubleLE(8, 13);
        expect(parseWkb(u8(pt)).coordinates).toEqual([7, 8]);

        const ring = [[0, 0], [4, 0], [4, 4], [0, 0]];
        const poly = Buffer.alloc(9 + 4 * 16);
        poly[0] = 1; poly.writeUInt32LE(3, 1); poly.writeUInt32LE(1, 5);
        poly.writeUInt32LE(4, 9);
        const body = Buffer.alloc(4 * 16);
        ring.forEach((c, i) => { body.writeDoubleLE(c[0], i * 16); body.writeDoubleLE(c[1], i * 16 + 8); });
        const polyFull = Buffer.concat([poly.subarray(0, 13), body]);
        expect(parseWkb(u8(polyFull)).coordinates).toEqual([ring]);

        const multi = Buffer.alloc(9);
        multi[0] = 1; multi.writeUInt32LE(6, 1); multi.writeUInt32LE(1, 5);
        expect(parseWkb(u8(Buffer.concat([multi, polyFull]))).coordinates).toEqual([[ring]]);
    });

    test('rejects an unknown WKB type', () => {
        const bad = Buffer.alloc(9);
        bad[0] = 1; bad.writeUInt32LE(99, 1);
        expect(() => parseWkb(u8(bad))).toThrow(/unsupported/);
    });
});

describe('gpkg.mjs header', () => {
    test('skips the envelope and reads the srs id', () => {
        const wkb = wkbLine([[1, 2], [3, 4]]);
        const blob = gpkgBlob(wkb, { envelope: [1, 3, 2, 4] });
        const h = parseGpkgHeader(u8(blob));
        expect(h.srsId).toBe(2056);
        expect(h.envelope).toEqual([1, 3, 2, 4]);
        expect(parseGpkgGeometry(u8(blob)).coordinates).toEqual([[1, 2], [3, 4]]);
    });

    test('big-endian header and no envelope', () => {
        const blob = gpkgBlob(wkbLine([[1, 2], [3, 4]], { little: false }), { little: false });
        expect(parseGpkgGeometry(u8(blob)).srsId).toBe(2056);
    });

    test('rejects a blob with the wrong magic', () => {
        expect(() => parseGpkgHeader(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]))).toThrow(/magic/);
    });
});

describe('GeoPackage R-tree query', () => {
    test('returns only the features whose bbox meets the query', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gpkg-test-'));
        const file = path.join(dir, 't.gpkg');
        const db = new DatabaseSync(file);
        db.exec(`
          CREATE TABLE gpkg_geometry_columns (table_name TEXT, column_name TEXT, geometry_type_name TEXT, srs_id INT, z INT, m INT);
          CREATE TABLE tlm_strasse (fid INTEGER PRIMARY KEY, objektart TEXT, geom BLOB);
          CREATE VIRTUAL TABLE rtree_tlm_strasse_geom USING rtree(id, minx, maxx, miny, maxy);
          INSERT INTO gpkg_geometry_columns VALUES ('tlm_strasse','geom','LINESTRING',2056,1,0);
        `);
        const rows = [
            ['near', [[100, 100, 5], [110, 100, 6]]],
            ['far', [[9000, 9000, 5], [9010, 9000, 6]]]
        ];
        rows.forEach(([name, pts], i) => {
            const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
            db.prepare('INSERT INTO tlm_strasse VALUES (?,?,?)').run(i + 1, name, gpkgBlob(wkbLine(pts, { z: true })));
            db.prepare('INSERT INTO rtree_tlm_strasse_geom VALUES (?,?,?,?,?)').run(i + 1, Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys));
        });
        db.close();

        const gpkg = new GeoPackage(file);
        expect(gpkg.tables()).toContain('tlm_strasse');
        expect(gpkg.columns('TLM_STRASSE')).toEqual(['fid', 'objektart', 'geom']);
        const hit = gpkg.query('TLM_STRASSE', [90, 90, 120, 120]);
        expect(hit.map(r => r.objektart)).toEqual(['near']);
        expect(hit[0].geom.hasZ).toBe(true);
        expect(hit[0].geom.coordinates[1]).toEqual([110, 100, 6]);
        expect(gpkg.query('TLM_STRASSE', [0, 0, 20000, 20000])).toHaveLength(2);
        gpkg.close();
        fs.rmSync(dir, { recursive: true });
    });
});

describe('cache.mjs', () => {
    test('uses TWISTY_WORLD_CACHE when set', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'world-cache-'));
        expect(resolveCacheDir({ TWISTY_WORLD_CACHE: dir })).toBe(path.resolve(dir));
        fs.rmSync(dir, { recursive: true });
    });

    test('defaults to the user cache directory', () => {
        expect(resolveCacheDir({})).toBe(path.join(os.homedir(), 'Library', 'Caches', 'twisty-world'));
    });

    test('refuses a path inside the repo, existing or not', () => {
        const repo = path.resolve('.');
        expect(() => resolveCacheDir({ TWISTY_WORLD_CACHE: path.join(repo, 'world', 'cache') })).toThrow(/inside the repo/);
        expect(() => resolveCacheDir({ TWISTY_WORLD_CACHE: repo })).toThrow(/inside the repo/);
    });

    test('refuses a symlink that leads into the repo', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'world-link-'));
        const link = path.join(dir, 'link');
        fs.symlinkSync(path.resolve('.'), link);
        expect(() => resolveCacheDir({ TWISTY_WORLD_CACHE: path.join(link, 'x') })).toThrow(/inside the repo/);
        fs.rmSync(dir, { recursive: true });
    });

    test('the STAC walk follows rel=next and keeps the newest 2 m tile', async () => {
        const feature = id => ({
            id,
            assets: { [`${id}_2_2056_5728.tif`]: { href: `https://x/${id}_2.tif` }, [`${id}_0.5_2056_5728.tif`]: { href: `https://x/${id}_05.tif` } }
        });
        const pages = {
            first: { features: [feature('swissalti3d_2019_2688-1160'), feature('swissalti3d_2019_2688-1161')], links: [{ rel: 'next', href: 'second' }] },
            second: { features: [feature('swissalti3d_2021_2688-1160')], links: [] }
        };
        const seen = [];
        const tiles = await listAlti3dTiles([8, 46, 9, 47], async u => {
            seen.push(u);
            return u.includes('bbox') ? pages.first : pages.second;
        });
        expect(seen).toHaveLength(2);
        expect(tiles.map(t => [t.key, t.year])).toEqual([['2688-1160', 2021], ['2688-1161', 2019]]);
        expect(tiles.every(t => /_2_2056_5728\.tif$/.test(t.name))).toBe(true);
    });
});

describe('inspect.mjs graph rules', () => {
    const road = (cls, extra = {}) => ({ cls, structure: 'Keine', drivable: 'Wahr', traffic: 'Durchgangsstrasse', ...extra });

    test('footpaths, tracks, stairs and undrivable edges stay out of the graph', async () => {
        const { isMotorRoad } = await import('../../tools/world/inspect.mjs');
        expect(isMotorRoad(road('4m Strasse'))).toBe(true);
        expect(isMotorRoad(road('Autobahn'))).toBe(true);
        expect(isMotorRoad(road('2m Weg'))).toBe(false);
        expect(isMotorRoad(road('1m Wegfragment'))).toBe(false);
        expect(isMotorRoad(road('Klettersteig'))).toBe(false);
        expect(isMotorRoad(road('4m Strasse', { structure: 'Treppe' }))).toBe(false);
        expect(isMotorRoad(road('4m Strasse', { drivable: 'Falsch' }))).toBe(false);
    });

    test('the motorway costs more than any pass road', async () => {
        const { roadPenalty } = await import('../../tools/world/inspect.mjs');
        expect(roadPenalty(road('Autobahn'))).toBeGreaterThan(roadPenalty(road('3m Strasse', { traffic: 'k_W' })));
        expect(roadPenalty(road('6m Strasse'))).toBeLessThan(roadPenalty(road('4m Strasse')));
    });

    test('buildGraph welds endpoints within 0.5 m and splits at cut vertices', async () => {
        const { buildGraph } = await import('../../tools/world/inspect.mjs');
        const e = (id, pts) => ({ id, cls: '4m Strasse', structure: null, name: null, traffic: 'Durchgangsstrasse', pts });
        const edges = [
            e(0, [[0, 0, 1], [50, 0, 2], [100, 0, 3]]),
            e(1, [[100.3, 0.2, 3], [100, 100, 4]])
        ];
        const g = buildGraph(edges, new Map([[0, [1]]]));
        expect(g.pieces).toHaveLength(3);
        expect(g.nodes).toHaveLength(4); // start, cut, the welded junction, far end
        const junction = g.nodeAt([100, 0]);
        expect(g.nodes[junction].adj).toHaveLength(2);
        expect(g.pieces[0].len).toBeCloseTo(50);
    });
});

describe('route.json', () => {
    const route = JSON.parse(fs.readFileSync(path.resolve('tools/world/route.json'), 'utf8'));
    const names = route.waypoints.filter(w => w.boundary).map(w => w.name);

    test('lists the D1 stage boundaries in order, ending at the Gletsch finish', () => {
        expect(names).toEqual([
            'Altdorf', 'Amsteg', 'Wassen', 'Schöllenen', 'Andermatt', 'Hospental', 'Gotthard', 'Airolo', 'Nufenen', 'Ulrichen',
            'Gletsch', 'Furka', 'Realp', 'Hospental', 'Andermatt', 'Schöllenen', 'Wassen', 'Susten', 'Innertkirchen', 'Grimsel', 'Gletsch'
        ]);
        expect(route.waypoints.filter(w => w.finish)).toHaveLength(1);
        expect(route.waypoints.at(-1).finish).toBe(true);
    });

    test('every waypoint is an LV95 coordinate inside the route area with a sequential id', () => {
        route.waypoints.forEach((w, i) => {
            expect(w.id).toBe(i);
            expect(w.e).toBeGreaterThan(2650000);
            expect(w.e).toBeLessThan(2700000);
            expect(w.n).toBeGreaterThan(1140000);
            expect(w.n).toBeLessThan(1200000);
        });
    });
});
