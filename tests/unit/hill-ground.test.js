/**
 * @jest-environment node
 */
// The hill ride's land (HillLand, js/hill/lane.js) and everything that stands on it (js/hill/scene.js): the land meets
// the lane, the flags and the side roads at their heights and never shows through them, the fine grid round the
// village is the one seen over the coarse one, and every piece that stands on the ground (the houses, walls, garden
// walls, fences, railings, sheds, the church and its yard, the trees) has its foot in the land, not over it.
import { describe, test, expect } from '@jest/globals';
import { loadGame, loadScript, realThree } from '../helpers/load-game.js';

const THREE = realThree();
const game = loadGame(THREE);
const { Vehicle, WorldPhysics, CHARACTERS } = game;
const { HillLane, HillLand, HillScene, HillTextures } = new Function('THREE', 'Vehicle', 'WorldPhysics', 'CHARACTERS',
    `${['lane', 'pushbike', 'bicycle', 'music', 'ride', 'props', 'textures', 'scene'].map(n => loadScript(`hill/${n}.js`)).join('\n')}\nreturn { HillLane, HillLand, HillScene, HillTextures };`
)(THREE, Vehicle, WorldPhysics, CHARACTERS);

// The village built as the page builds it, without its canvas textures
function build(lane) {
    const keep = [HillScene.cobbleTextures, HillScene.fieldTexture, HillScene.paneSky];
    HillScene.cobbleTextures = () => ({ map: null, normalMap: null, aoMap: null, roughnessMap: null });
    HillScene.fieldTexture = () => null;
    HillScene.paneSky = () => null;
    HillTextures.made = new Proxy({}, { get: () => ({ map: null, normalMap: null }) });
    try {
        return HillScene.build(lane);
    } finally {
        [HillScene.cobbleTextures, HillScene.fieldTexture, HillScene.paneSky] = keep;
        HillTextures.made = null;
    }
}

// The footprint's corners and centre, as [x, z]
const corners = f => [[0, 0], [-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [f.x + f.ux * f.hu * a + f.vx * f.hv * b, f.z + f.uz * f.hu * a + f.vz * f.hv * b]);
const inside = (f, x, z, grow = 0) => {
    const dx = x - f.x, dz = z - f.z;
    return Math.abs(dx * f.ux + dz * f.uz) <= f.hu + grow && Math.abs(dx * f.vx + dz * f.vz) <= f.hv + grow;
};

describe('the hill ride\'s land', () => {
    const lane = new HillLane();
    const { stands } = build(lane);
    const land = lane.ground();
    const r = lane.rule;

    test('every piece that stands on the ground has its foot in the land or the paving under each corner (5 cm at most over it)', () => {
        const floating = [];
        const kinds = {};
        for (const f of stands) {
            kinds[f.kind] = (kinds[f.kind] || 0) + 1;
            const worst = Math.max(...corners(f).map(([x, z]) => f.y - land.surfaceAt(x, z)));
            if (worst > 0.05) floating.push(`${f.kind} at (${f.x.toFixed(1)}, ${f.z.toFixed(1)}) ${worst.toFixed(2)} m over`);
        }
        console.log(`hill ground: ${stands.length} standing pieces (${Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(', ')}); ${floating.length} over the land${floating.length ? `:\n${floating.slice(0, 30).join('\n')}` : ''}`);
        // Each kind the owner named is among them
        for (const kind of ['terrace', 'wall', 'churchyard wall', 'gate pier', 'gravestone', 'yew', 'church', 'church tower', 'railing post', 'tree', 'house']) expect([kind, kinds[kind] > 0]).toEqual([kind, true]);
        expect(floating).toEqual([]);
    });

    test('the land never shows through the lane, its flags or a side road, and meets their edges where nothing stands', () => {
        const through = [], apart = [];
        const covered = (x, z) => stands.some(f => inside(f, x, z, 0.35));
        for (let s = 1; s < r.lengthM - 1; s += 1) {
            const y = lane.sample(s).y;
            for (const across of [0, 1.4, 2.7, 2.9, 3.6, 4.2, -1.4, -2.7, -2.9, -3.6, -4.2]) {
                const p = lane.at(s, across, 0, {}), paved = land.pavedAt(p.x, p.z);
                if (paved === null) continue;
                if (land.heightAt(p.x, p.z) > paved - 0.01) through.push(`lane s ${s} across ${across}`);
            }
            // Just past the flags: in a gap with nothing standing there the land is at the flags' height
            for (const side of [1, -1]) {
                const p = lane.at(s, side * (r.halfWidthM + r.flagsM + 0.6), 0, {});
                if (covered(p.x, p.z) || land.pavedAt(p.x, p.z) !== null) continue;
                const gap = land.heightAt(p.x, p.z) - (y + 0.1);
                if (Math.abs(gap) > 0.3) apart.push(`s ${s} side ${side} ${gap.toFixed(2)} m`);
            }
        }
        for (const road of lane.sideRoads) {
            for (let d = 0.5; d < road.length - 0.5; d += 0.5) {
                for (const k of [-0.45, 0, 0.45]) {
                    const p = lane.roadPoint(road, d), w = k * road.wide;
                    const x = p.x + p.crossX * w, z = p.z + p.crossZ * w;
                    if (land.heightAt(x, z) > lane.roadY(road, d, w) - 0.01) through.push(`road ${road.s} d ${d} w ${w.toFixed(1)}`);
                }
            }
        }
        console.log(`hill ground: the land through a paved surface at ${through.length} points, apart from the flags' edge at ${apart.length}`);
        expect(through).toEqual([]);
        expect(apart).toEqual([]);
    });

    test('the land follows the lane down: level with it beside the houses, never a flat plane far under it', () => {
        // At the back of every house's yard on both sides the land is within a metre of the house's floor
        let worst = 0;
        for (const c of lane.cottages) {
            const at = [c.x + c.outX * (c.hd + 4), c.z + c.outZ * (c.hd + 4)];
            worst = Math.max(worst, Math.abs(land.heightAt(at[0], at[1]) - c.floor));
        }
        console.log(`hill ground: the land in the yards behind the houses at most ${worst.toFixed(2)} m from their floors`);
        expect(worst).toBeLessThan(1);
        // 18 m out on both sides the land falls with the lane: from the top to the bottom it falls as the lane does
        for (const side of [1, -1]) {
            const top = lane.at(60, side * 18, 0, {}), low = lane.at(500, side * 18, 0, {});
            const fall = land.heightAt(top.x, top.z) - land.heightAt(low.x, low.z), laneFall = lane.sample(60).y - lane.sample(500).y;
            expect(Math.abs(fall - laneFall)).toBeLessThan(6);
        }
    });

    test('the fine grid round the village and the coarse grid out to the hills meet edge to edge, with no gap', () => {
        const f = land.fine, g = land.coarse;
        const drawn = (i, j) => i >= 0 && j >= 0 && i < f.nx && j < f.nz && f.drawn[i * f.nz + j] === 1;
        let edges = 0, worst = 0;
        for (let i = 0; i < f.nx; i++) {
            for (let j = 0; j < f.nz; j++) {
                if (!drawn(i, j)) continue;
                // Each open side: [its inward step, its outward step, the points along it]
                for (const [di, dj] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
                    if (drawn(i + di, j + dj)) continue;
                    edges++;
                    for (const t of [0.1, 0.5, 0.9]) {
                        const x = f.x0 + (i + (di === 0 ? t : di > 0 ? 1 : 0)) * f.c, z = f.z0 + (j + (dj === 0 ? t : dj > 0 ? 1 : 0)) * f.c;
                        const inner = HillLand.onGrid(f, x - di * 1e-4, z - dj * 1e-4), outer = HillLand.onGrid(g, x + di * 1e-4, z + dj * 1e-4);
                        worst = Math.max(worst, Math.abs(inner - outer));
                    }
                }
            }
        }
        console.log(`hill ground: ${edges} cell sides where the grids meet, at most ${(worst * 1000).toFixed(1)} mm apart`);
        expect(edges).toBeGreaterThan(50);
        expect(worst).toBeLessThan(0.01);
    });
});
