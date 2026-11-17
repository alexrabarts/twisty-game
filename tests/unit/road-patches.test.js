// The patch repairs on the world road's asphalt (RoadSurface.patch, patchDistance, patchShade and the shader that
// draws the same): irregular outlines, not rectangles; a subtle change of tone, less still far off; fewer of them.
import { describe, test, expect } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';

const { THREE, RoadSurface } = loadGame();
const P = RoadSurface.PATCH;
const HALF = 5;

// Every patch of the first `n` cells: {cell, p}
const patches = (n = 4000) => Array.from({ length: n }, (_, cell) => ({ cell, p: RoadSurface.patch(cell, HALF) })).filter(e => e.p);

// Metres along the ride of `at` in cell `cell`
const sOf = (cell, at) => cell * P.cellM + at;

// The outline's lateral position on the patch's `dir` side at `at`: bisection outward from the centre line
function edgeAcross({ cell, p }, at, dir) {
    const centre = RoadSurface.patchCentre(p, sOf(cell, at));
    let lo = centre, hi = centre + dir * (p.hw + 1.5);
    const inside = lat => RoadSurface.patchDistance(p, cell, at, lat, sOf(cell, at)) < 0;
    if (!inside(lo)) return null;
    for (let k = 0; k < 40; k++) {
        const mid = (lo + hi) / 2;
        if (inside(mid)) lo = mid; else hi = mid;
    }
    return lo;
}

// The outline's position along the road at the patch's `dir` end, at `lat`
function edgeAlong({ cell, p }, lat, dir) {
    let lo = p.along, hi = p.along + dir * (p.hl + 1.5);
    const inside = at => RoadSurface.patchDistance(p, cell, at, lat, sOf(cell, at)) < 0;
    if (!inside(lo)) return null;
    for (let k = 0; k < 40; k++) {
        const mid = (lo + hi) / 2;
        if (inside(mid)) lo = mid; else hi = mid;
    }
    return lo;
}

// Largest distance of points (x, y) from their least-squares line: zero for a straight edge
function bow(points) {
    const n = points.length;
    const mx = points.reduce((a, [x]) => a + x, 0) / n, my = points.reduce((a, [, y]) => a + y, 0) / n;
    let sxy = 0, sxx = 0;
    for (const [x, y] of points) { sxy += (x - mx) * (y - my); sxx += (x - mx) * (x - mx); }
    const slope = sxx > 0 ? sxy / sxx : 0;
    const off = points.map(([x, y]) => y - (my + slope * (x - mx)));
    return Math.max(...off) - Math.min(...off);
}

describe('RoadSurface patch repairs', () => {
    test('are fewer: about the tuned share of cells, well under the old 38%', () => {
        const share = patches(5000).length / 5000;
        expect(share).toBeGreaterThan(P.density - 0.03);
        expect(share).toBeLessThan(P.density + 0.03);
        expect(share).toBeLessThan(0.3);
    });

    test('come in three kinds: strips along a wheel track, small patches and wider patches', () => {
        const all = patches();
        const kinds = new Set(all.map(e => e.p.kind));
        expect([...kinds].sort()).toEqual(['area', 'small', 'track']);
        for (const { p } of all.filter(e => e.p.kind === 'track')) {
            expect(p.hl * 2).toBeGreaterThan(4.9);
            expect(p.hw * 2).toBeLessThan(1.01);
            // On a wheel track: a quarter of the road from the centre, 0.85 m to either side
            expect(Math.abs(Math.abs(p.lat - p.side * HALF / 2) - 0.85)).toBeLessThan(1e-9);
        }
        for (const { p } of all.filter(e => e.p.kind === 'small')) expect(Math.max(p.hl, p.hw) * 2).toBeLessThan(2.3);
    });

    test('have outlines that are not straight along their length or across their ends, and rounded corners', () => {
        let corners = 0, cut = 0;
        for (const e of patches(800)) {
            const { p } = e;
            const run = 0.8 * p.hl;
            for (const dir of [-1, 1]) {
                const side = [];
                for (let k = 0; k <= 40; k++) {
                    const at = p.along - run + (2 * run * k) / 40;
                    const lat = edgeAcross(e, at, dir);
                    if (lat !== null) side.push([at, lat]);
                }
                expect(side.length).toBeGreaterThan(30);
                // A straight edge bows 0; these wander and round off by centimetres to decimetres
                expect(bow(side)).toBeGreaterThan(Math.min(0.03, 0.025 * 2 * run));
                const span = 0.8 * p.hw;
                const end = [];
                const centre = RoadSurface.patchCentre(p, sOf(e.cell, p.along));
                for (let k = 0; k <= 20; k++) {
                    const lat = centre - span + (2 * span * k) / 20;
                    const at = edgeAlong(e, lat, dir);
                    if (at !== null) end.push([lat, at]);
                }
                expect(bow(end)).toBeGreaterThan(Math.min(0.03, 0.03 * 2 * span));
                // The corners are cut round: the corner of the box the patch is laid in is outside it
                if (!p.track) {
                    const cornerAt = p.along + dir * p.hl, cornerLat = p.lat + dir * p.hw;
                    corners++;
                    if (RoadSurface.patchDistance(p, e.cell, cornerAt, cornerLat, sOf(e.cell, cornerAt)) > 0) cut++;
                }
            }
        }
        expect(cut / corners).toBeGreaterThan(0.9);
    });

    test('stay on the carriageway', () => {
        for (const e of patches()) {
            const { p } = e;
            for (const dir of [-1, 1]) {
                const lat = edgeAcross(e, p.along, dir);
                expect(Math.abs(lat)).toBeLessThan(HALF - 0.1);
            }
        }
    });

    test('change the asphalt subtly close to, less again far off, with a thin darker seam', () => {
        const near = 0.004, far = P.far[1] * 1.5;
        let insideSum = 0, insideCount = 0, darkestSeam = 1, farWorst = 0;
        for (const e of patches(500)) {
            const { cell, p } = e;
            for (let i = -12; i <= 12; i++) {
                for (let j = -12; j <= 12; j++) {
                    const at = p.along + (i / 10) * (p.hl + 0.3), lat = p.lat + (j / 10) * (p.hw + 0.3);
                    const s = sOf(cell, at);
                    const close = RoadSurface.patchShade(p, cell, at, lat, s, near);
                    if (close.cover > 0.999 && close.seam === 0) {
                        // The fill: within 14% of the asphalt (the old patch was a flat 20% darker), and never nothing
                        expect(Math.abs(close.factor - 1)).toBeLessThanOrEqual(P.tone[1] * (1 + P.mottle) + 1e-9);
                        expect(Math.abs(close.factor - 1)).toBeLessThanOrEqual(0.14);
                        insideSum += Math.abs(close.factor - 1); insideCount++;
                    }
                    if (close.seam > 0) darkestSeam = Math.min(darkestSeam, close.factor);
                    const away = RoadSurface.patchShade(p, cell, at, lat, s, far);
                    farWorst = Math.max(farWorst, Math.abs(away.factor - 1));
                }
            }
        }
        expect(insideCount).toBeGreaterThan(1000);
        expect(insideSum / insideCount).toBeGreaterThan(0.015);
        // The seam is darker, but not black (the old one was 52% darker and 5 cm wide everywhere)
        expect(darkestSeam).toBeLessThan(0.8);
        expect(darkestSeam).toBeGreaterThanOrEqual(1 - P.seamDark - P.tone[1] * (1 + P.mottle) - 1e-9);
        // Far off (a pixel some 18 cm across) the patch is a faint change of tone, its seam filtered away
        expect(farWorst).toBeLessThan(0.05);
    });

    test('fade their edge by the pixel footprint: a wide pixel sees a soft edge, not a hard step', () => {
        const e = patches().find(x => x.p.kind === 'area');
        const { cell, p } = e;
        const edge = edgeAcross(e, p.along, 1);
        const cover = (lat, fp) => RoadSurface.patchShade(p, cell, p.along, lat, sOf(cell, p.along), fp).cover;
        // 3 cm either side of the edge: crisp close to, half blended for a 20 cm pixel
        expect(cover(edge - 0.03, 0.004)).toBeGreaterThan(0.99);
        expect(cover(edge + 0.03, 0.004)).toBeLessThan(0.01);
        expect(cover(edge - 0.03, 0.2)).toBeLessThan(0.75);
        expect(cover(edge + 0.03, 0.2)).toBeGreaterThan(0.25);
    });

    test('the shader draws the same patches, after LandShade noise, faded by the road footprint', () => {
        const material = RoadSurface.nearMaterial();
        const lib = THREE.ShaderLib.physical;
        const shader = { uniforms: THREE.UniformsUtils.clone(lib.uniforms), vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader };
        material.onBeforeCompile(shader, null);
        const src = shader.fragmentShader;
        // Declared after the noise it reads, or the shader does not compile
        expect(src.indexOf('float landNoise(')).toBeGreaterThan(-1);
        expect(src.indexOf('float roadPatch(')).toBeGreaterThan(src.indexOf('float landNoise('));
        expect(src).toContain('float roadPatchFp = roadFootprint(roadDx, roadDy);');
        expect(src).toContain(`landHash(vec2(cell, 7.0)) >= ${P.density.toFixed(4)}`);
        expect(src).toContain(`* ${P.wobbleM.toFixed(4)}`);
        expect(src).toContain(`mix(1.0, ${P.farKeep.toFixed(4)}, smoothstep(${P.far[0].toFixed(4)}, ${P.far[1].toFixed(4)}, roadPatchFp))`);
        // No hard-edged box test is left
        expect(src).not.toMatch(/step\(patchFrom/);
        // `half` is reserved in GLSL ES
        expect(src).not.toMatch(/float half\b/);
    });
});
