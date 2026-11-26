/**
 * @jest-environment node
 */
// The photo-match tools (tools/world/photos, tools/world/photomatch.mjs), on synthetic data only: no photo,
// no photo position and no pose of the owner's ever enters the repo.
import { describe, test, expect } from '@jest/globals';
import { parseGeoCsv, wgs84ToLv95, toLocal, fromLocal, bearingOf, projectOnPolyline, distanceToSquares, clusterPositions, coverageBoxes } from '../../tools/world/photos/geo.mjs';
import { readExif, fieldOfView } from '../../tools/world/photos/exif.mjs';
import { makeImage, decodeBmp, encodeBmp, regionStats, statGaps, skylineFromMask, sideBySide, resize } from '../../tools/world/photos/image.mjs';
import { HeightField, horizonProfile, profileAt, pixelRay, horizonPoint, horizonRows, fitPose, guidedSkyline, depthGrid, skynessMap } from '../../tools/world/photos/horizon.mjs';
import { regionOf, skylineGap, confidenceOf, RoadIndex } from '../../tools/world/photos/compare.mjs';
import { hsvOf, hazeStats, HAZE_BANDS } from '../../tools/world/photomatch.mjs';

const RAD = Math.PI / 180;

describe('positions', () => {
    test('a geo CSV gives one row per good line', () => {
        const rows = parseGeoCsv('file;lat;lng\na.jpg;46.5;8.6\nbad;x;y\n\nb.HEIC;46.6;8.7\n', 'one.csv');
        expect(rows).toEqual([{ file: 'a.jpg', lat: 46.5, lng: 8.6, csv: 'one.csv' }, { file: 'b.HEIC', lat: 46.6, lng: 8.7, csv: 'one.csv' }]);
    });

    test('WGS84 to LV95 lands on the Bern origin within a metre, and local metres turn back', () => {
        const { e, n } = wgs84ToLv95(7.43863264, 46.95108288);
        expect(Math.abs(e - 2600000)).toBeLessThan(1.5);
        expect(Math.abs(n - 1200000)).toBeLessThan(1.5);
        const origin = { e0: 2688000, n0: 1165000 };
        const local = toLocal(2688100, 1164900, origin);
        expect(local).toEqual({ x: 100, z: 100 });
        expect(fromLocal(local.x, local.z, origin)).toEqual({ e: 2688100, n: 1164900 });
    });

    test('bearings: north is -z, east is +x', () => {
        expect(bearingOf(0, -1)).toBeCloseTo(0);
        expect(bearingOf(1, 0)).toBeCloseTo(90);
        expect(bearingOf(0, 1)).toBeCloseTo(180);
        expect(bearingOf(-1, 0)).toBeCloseTo(270);
    });

    test('projection onto a polyline gives s, and a point east of a road heading north is on its right', () => {
        const line = [{ x: 0, z: 0 }, { x: 0, z: -100 }, { x: 100, z: -100 }];
        const p = projectOnPolyline(line, 5, -40);
        expect(p.s).toBeCloseTo(40);
        expect(p.lateral).toBeCloseTo(5);
        expect(p.heading).toBeCloseTo(0);
        const q = projectOnPolyline(line, 150, -100);
        expect(q.s).toBeCloseTo(200);
        expect(q.distance).toBeCloseTo(50);
    });

    test('distance to the drawn squares is 0 inside and the gap outside', () => {
        const squares = [{ x0: 0, z0: 0, size: 512 }];
        expect(distanceToSquares(squares, 10, 10)).toBe(0);
        expect(distanceToSquares(squares, 612, 256)).toBeCloseTo(100);
    });

    test('clusters join photos within the link and keep far ones apart', () => {
        const items = [{ x: 0, z: 0 }, { x: 50, z: 0 }, { x: 140, z: 0 }, { x: 5000, z: 0 }];
        const c = clusterPositions(items, 100);
        expect(c.map(k => k.count)).toEqual([3, 1]);
        expect(c[0].x).toBeCloseTo(190 / 3);
    });

    test('coverage boxes hold the stops near the planned route, with a margin', () => {
        const coverage = { clusters: [
            { lv95: { e: 2688000, n: 1165000 }, stop: true, plannedRoute: { distanceM: 300 } },
            { lv95: { e: 2700000, n: 1170000 }, stop: true, plannedRoute: { distanceM: 9000 } },
            { lv95: { e: 2689000, n: 1166000 }, stop: false, plannedRoute: { distanceM: 10 } }
        ] };
        expect(coverageBoxes(coverage, { reachM: 2000, marginM: 1000 })).toEqual([[2687000, 1164000, 2689000, 1166000]]);
        expect(coverageBoxes(coverage, { stopsOnly: false }).length).toBe(2);
        expect(coverageBoxes(null)).toEqual([]);
    });
});

// A JPEG holding only an Exif APP1 block: IFD0 (make, model, orientation, Exif pointer) and the Exif IFD
function syntheticJpeg({ little = true, focal35 = 28, focal = [399, 100] } = {}) {
    const entries0 = [], entriesE = [];
    const strings = [];
    const tiff = [];
    const u16 = v => (little ? [v & 255, v >> 8] : [v >> 8, v & 255]);
    const u32 = v => (little ? [v & 255, (v >> 8) & 255, (v >> 16) & 255, v >>> 24] : [v >>> 24, (v >> 16) & 255, (v >> 8) & 255, v & 255]);
    const make = 'Maker\0', model = 'Camera X\0';
    // layout: header 8, IFD0 (4 entries) at 8, Exif IFD (3 entries) after, then data
    const ifd0At = 8, ifd0Size = 2 + 4 * 12 + 4, exifAt = ifd0At + ifd0Size, exifSize = 2 + 3 * 12 + 4;
    let dataAt = exifAt + exifSize;
    const makeAt = dataAt; dataAt += make.length;
    const modelAt = dataAt; dataAt += model.length;
    const focalAt = dataAt; dataAt += 8;
    entries0.push([0x010f, 2, make.length, makeAt], [0x0110, 2, model.length, modelAt], [0x0112, 3, 1, 6], [0x8769, 4, 1, exifAt]);
    entriesE.push([0x920a, 5, 1, focalAt], [0xa002, 4, 1, 4000], [0xa405, 3, 1, focal35]);
    const entry = ([tag, type, n, value]) => [...u16(tag), ...u16(type), ...u32(n), ...(type === 3 ? [...u16(value), 0, 0] : u32(value))];
    tiff.push(...(little ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(ifd0At));
    tiff.push(...u16(entries0.length), ...entries0.flatMap(entry), ...u32(0));
    tiff.push(...u16(entriesE.length), ...entriesE.flatMap(entry), ...u32(0));
    strings.push(...Buffer.from(make, 'latin1'), ...Buffer.from(model, 'latin1'), ...u32(focal[0]), ...u32(focal[1]));
    const body = Buffer.from([...Buffer.from('Exif\0\0', 'latin1'), ...tiff, ...strings]);
    const app1 = Buffer.concat([Buffer.from([0xff, 0xe1]), Buffer.from([(body.length + 2) >> 8, (body.length + 2) & 255]), body]);
    return Buffer.concat([Buffer.from([0xff, 0xd8]), app1, Buffer.from([0xff, 0xda, 0, 2, 0xff, 0xd9])]);
}

describe('EXIF and field of view', () => {
    test.each([true, false])('reads make, model, orientation and focal lengths (little endian %s)', little => {
        const e = readExif(syntheticJpeg({ little }));
        expect(e).toMatchObject({ make: 'Maker', model: 'Camera X', orientation: 6, focal35: 28, width: 4000 });
        expect(e.focalMm).toBeCloseTo(3.99);
    });

    test('no EXIF gives empty fields', () => {
        expect(readExif(Buffer.from([0xff, 0xd8, 0xff, 0xda]))).toMatchObject({ make: null, focal35: null, orientation: 1 });
    });

    test('the 35 mm equivalent sets the diagonal: 28 mm on 4:3 is about 63 by 50 degrees', () => {
        const f = fieldOfView({ focal35: 28 }, 4000, 3000);
        expect(f.source).toBe('exif-35mm');
        expect(f.hfov).toBeCloseTo(63.4, 0);
        expect(f.vfov).toBeCloseTo(49.7, 0);
        expect(2 * Math.atan(Math.hypot(4000, 3000) / 2 / f.focalPx) / RAD).toBeCloseTo(2 * Math.atan(43.27 / 56) / RAD, 3);
    });

    test('an implausible 35 mm value falls back to the focal length times the camera crop, then the table', () => {
        expect(fieldOfView({ focal35: 5, focalMm: 3.4, model: 'Swift 2 X' }, 1600, 900).source).toBe('exif-mm-x-crop');
        expect(fieldOfView({ model: 'iPhone 7' }, 4032, 3024)).toMatchObject({ source: 'camera-table', focal35: 28 });
        expect(fieldOfView({}, 4, 3).source).toBe('default-26mm');
    });
});

describe('images', () => {
    test('BMP round trip, and a resize keeps a flat colour', () => {
        const img = makeImage(5, 3);
        for (let k = 0; k < 15; k++) img.data.set([k * 10, 255 - k, 7, 255], k * 4);
        const back = decodeBmp(encodeBmp(img));
        expect(back.width).toBe(5);
        expect(Array.from(back.data)).toEqual(Array.from(img.data));
        const flat = makeImage(8, 8);
        for (let k = 0; k < 64; k++) flat.data.set([30, 60, 90, 255], k * 4);
        expect(Array.from(resize(flat, 3, 5).data.slice(0, 4))).toEqual([30, 60, 90, 255]);
    });

    test('region statistics: shares of green, snow and grey, and the gap between two images', () => {
        const a = makeImage(10, 10), b = makeImage(10, 10);
        for (let k = 0; k < 100; k++) {
            a.data.set(k < 50 ? [60, 140, 50, 255] : [240, 240, 245, 255], k * 4);
            b.data.set([128, 128, 128, 255], k * 4);
        }
        const sa = regionStats(a, () => true), sb = regionStats(b, () => true);
        expect(sa.greenShare).toBeCloseTo(0.5);
        expect(sa.snowShare).toBeCloseTo(0.5);
        expect(sb.rockShare).toBeCloseTo(1);
        const gap = statGaps(sa, sb);
        expect(gap.greenShare).toBeCloseTo(-0.5);
        expect(gap.rockShare).toBeCloseTo(1);
        expect(regionStats(a, () => false)).toEqual({ pixels: 0 });
    });

    test('a mask gives the first ground row per column, and side by side puts both images in one', () => {
        const mask = [1, 1, 1, 0, 1, 0, 0, 0, 0].map(Boolean); // 3 x 3, true = sky
        expect(Array.from(skylineFromMask(mask, 3, 3))).toEqual([1, 2, 1]);
        const s = sideBySide(makeImage(4, 2), makeImage(4, 2), 2);
        expect([s.width, s.height]).toEqual([10, 2]);
    });
});

// A cone of height 1000 m and radius 2000 m, 5 km north of the camera, on a flat plain at 0 m
const coneAt = { x: 0, z: -5000 };
const cone = (x, z) => Math.max(0, 1000 * (1 - Math.hypot(x - coneAt.x, z - coneAt.z) / 2000));

// Draws an image as a camera at (0, eye, 0) sees the cone: blue sky above the horizon, green below
function drawScene(profile, cam) {
    const img = makeImage(cam.width, cam.height);
    const rows = horizonRows(profile, cam, cam.width, cam.height);
    for (let v = 0; v < cam.height; v++) {
        for (let u = 0; u < cam.width; u++) {
            const skyHere = !Number.isFinite(rows[u]) ? v < 0 : v < rows[u];
            img.data.set(skyHere ? [120, 170, 235, 255] : [50, 90, 40, 255], (v * cam.width + u) * 4);
        }
    }
    return img;
}

describe('skyline and pose', () => {
    const eye = 2;
    const profile = horizonProfile(cone, 0, 0, eye, { binDeg: 0.25, maxDist: 12000 });

    test('the horizon peaks toward the cone at its height angle', () => {
        expect(profileAt(profile, 0)).toBeCloseTo(Math.atan2(998 - (5000 ** 2 * 0.87) / (2 * 6371000), 5000) / RAD, 1);
        expect(profileAt(profile, 180)).toBeLessThan(0.1);
    });

    test('pixelRay follows the three.js YXZ camera: centre ray points along the bearing, up by the pitch', () => {
        const cam = { bearing: 90, pitch: 10, roll: 0, focalPx: 500, cx: 200, cy: 150 };
        const r = pixelRay(200, 150, cam);
        expect(r.x).toBeCloseTo(Math.cos(10 * RAD));
        expect(r.y).toBeCloseTo(Math.sin(10 * RAD));
        expect(r.z).toBeCloseTo(0);
        // a pixel right of the centre looks further clockwise
        const right = pixelRay(300, 150, { ...cam, pitch: 0 });
        expect(right.z).toBeGreaterThan(0);
    });

    test('horizonPoint puts a pixel on the horizon in closed form, with pitch and roll', () => {
        const cam = { bearing: 10, pitch: -4, roll: 3, focalPx: 600, cx: 320, cy: 240 };
        const pt = horizonPoint(profile, cam, 120);
        const r = pixelRay(pt.u, pt.v, cam);
        const bearing = (Math.atan2(r.x, -r.z) / RAD + 360) % 360;
        const elev = Math.atan2(r.y, Math.hypot(r.x, r.z)) / RAD;
        expect(elev).toBeCloseTo(profileAt(profile, bearing), 3);
    });

    test('fitPose finds the bearing, pitch and roll of a picture of the cone, and the guided skyline sits on it', () => {
        const truth = { bearing: 8, pitch: 3, roll: 1.5, focalPx: 400, cx: 240, cy: 180, width: 480, height: 360 };
        const img = drawScene(profile, truth);
        const fit = fitPose(img, profile, { focalPx: 400 });
        expect(Math.abs(fit.bearing - truth.bearing)).toBeLessThan(0.6);
        expect(Math.abs(fit.pitch - truth.pitch)).toBeLessThan(0.3);
        expect(Math.abs(fit.roll - truth.roll)).toBeLessThan(1);
        expect(fit.score).toBeGreaterThan(fit.apartScore);
        const cam = { ...truth, ...fit, cx: 240, cy: 180 };
        const demRows = horizonRows(profile, cam, 480, 360);
        const guided = guidedSkyline(skynessMap(img), 480, 360, demRows);
        const gap = skylineGap(demRows, guided.rows, 1);
        expect(gap.meanAbsDeg).toBeLessThan(3);
    });

    test('depth along a ray over flat ground at 2 m: 45 degrees down meets it at about 2.8 m, the horizon is beyond reach', () => {
        const cam = { bearing: 0, pitch: -45, roll: 0, focalPx: 10, cx: 5, cy: 5, width: 10, height: 10 };
        const d = depthGrid(() => 0, { x: 0, y: 2, z: 0 }, cam, 1, 1, { maxDist: 500 });
        // the march steps 1 m near the camera, so the hit is within a metre of 2 sqrt 2
        expect(Math.abs(d.dist[0] - 2 * Math.SQRT2)).toBeLessThan(1);
        const level = depthGrid(() => 0, { x: 0, y: 2, z: 0 }, { ...cam, pitch: 10 }, 1, 1, { maxDist: 500 });
        expect(level.dist[0]).toBe(Infinity);
    });

    test('the height field reads a 2 m tile and falls back to a WGS84 grid', () => {
        const f = new HeightField({ e0: 2688000, n0: 1165000 });
        f.addAltiTile(2688, 1164, { minE: 2688000, maxN: 1165000, res: 2, w: 500, h: 500, data: new Float32Array(250000).fill(1500) });
        expect(f.heightAt(100, 100)).toBeCloseTo(1500);
        expect(f.sourceAt(100, 100)).toBe('alti3d');
        f.addCopernicus({ west: 8, east: 9, south: 46, north: 47, w: 10, h: 10, data: new Float32Array(100).fill(900) });
        expect(f.heightAt(5000, 5000)).toBeCloseTo(900);
        expect(f.sourceAt(5000, 5000)).toBe('copernicus');
        expect(f.sourceAt(5e6, 0)).toBe(null);
    });
});

describe('comparison', () => {
    test('regions: sky above the skyline, road on the ride, then by distance', () => {
        const depth = { w: 2, h: 2, dist: new Float32Array([Infinity, 5000, 100, 1000]), hitX: new Float32Array([NaN, 0, 0, 0]), hitZ: new Float32Array([NaN, 0, 0, 500]) };
        const road = new RoadIndex([{ x: -10, z: 0, width: 10 }, { x: 10, z: 0, width: 10 }]);
        const sky = new Float32Array([1, 1, 1, 1]);
        expect(regionOf(depth, road, 0, 0, 4, 4, sky)).toBe('sky');
        expect(regionOf(depth, road, 0, 1, 4, 4, sky)).toBe('other');
        expect(regionOf(depth, road, 3, 1, 4, 4, sky)).toBe('far');
        expect(regionOf(depth, road, 0, 3, 4, 4, sky)).toBe('road');
        expect(regionOf(depth, road, 3, 3, 4, 4, sky)).toBe('mid');
    });

    test('skyline gap in degrees, signed so a game skyline above the photo is positive', () => {
        const g = skylineGap(new Float32Array([10, 10, NaN]), new Float32Array([8, 12, 5]), 0.5);
        expect(g).toMatchObject({ columns: 2, meanAbsDeg: 1, meanDeg: 0, gameHigherShare: 0.5, gameLowerShare: 0.5 });
    });

    test('confidence is high only for a clear, unambiguous fit on a skyline with relief', () => {
        const demRows = Float32Array.from({ length: 100 }, (_, u) => 50 + 20 * Math.sin(u / 10));
        const good = confidenceOf({ fit: { score: 0.3, apartScore: 0.1 }, validShare: 0.9, demRows, photoRows: demRows, height: 200, vfov: 40 });
        expect(good.level).toBe('high');
        const flat = confidenceOf({ fit: { score: 0.3, apartScore: 0.28 }, validShare: 0.2, demRows: new Float32Array(100).fill(50), photoRows: new Float32Array(100).fill(NaN), height: 200, vfov: 40 });
        expect(flat.level).toBe('low');
        expect(flat.reasons.length).toBeGreaterThanOrEqual(3);
    });
});

describe('the haze measurement', () => {
    test('a colour reads as hue in degrees, saturation and value', () => {
        expect(hsvOf(255, 0, 0)).toEqual({ h: 0, s: 1, v: 1 });
        expect(hsvOf(0, 0, 255).h).toBe(240);
        expect(hsvOf(92, 125, 170).h).toBeCloseTo(214.6, 0);
        expect(hsvOf(92, 125, 170).s).toBeCloseTo(0.46, 2);
        expect(hsvOf(40, 40, 40)).toEqual({ h: 0, s: 0, v: 40 / 255 });
    });

    test('a band reads as its mean colour and how green it is against blue', () => {
        const blue = hazeStats([[70, 100, 130], [80, 110, 150], [90, 120, 170]]);
        expect(blue.pixels).toBe(3);
        expect(blue.mean).toEqual([80, 110, 150]);
        expect(blue.greenOverBlue).toBeLessThan(0);
        expect(blue.greenShare).toBe(0);
        const green = hazeStats([[60, 100, 50], [70, 110, 60]]);
        expect(green.greenOverBlue).toBeGreaterThan(0);
        expect(green.greenShare).toBe(1);
        expect(hazeStats([])).toEqual({ pixels: 0 });
        expect(HAZE_BANDS.map(b => [b.from, b.to])).toEqual([[1000, 3000], [3000, 8000], [8000, Infinity]]);
    });
});
