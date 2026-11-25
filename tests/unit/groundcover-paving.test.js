/**
 * @jest-environment node
 */
// The ground cover grows on the land only: never on a road's ribbon, a junction's paving or a stop's hard standing
// drawn over it (WorldEnvironment.pavedAt, GroundCover.site). At two junctions of the Gotthard leg whose paving lies
// over the land in places (km 11.56 at the summit, km 14.08 above the lookout), every place the ground cover would
// stand a tuft or a stone is looked at from above: the first thing drawn there must be the land itself.
import { describe, test, expect, beforeAll } from '@jest/globals';
import { loadGame, loadScript } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';

const game = loadGame(undefined, []);
const { THREE, WorldEnvironment } = game;
const { GroundCover } = new Function('THREE', 'LandShade', 'TerrainMesh', 'WorldData', `${loadScript('world/groundcover.js')}\nreturn { GroundCover };`)(THREE, game.LandShade, game.TerrainMesh, game.WorldData);
const PLACES = [11556, 14084];

describe('ground cover off the paving (Gotthard leg)', () => {
    let env;
    const read = [];
    beforeAll(async () => {
        const { fetchFn } = diskFetch();
        env = await WorldEnvironment.load(new THREE.Scene(), { id: 'gotthard-north', fetchFn, models: null, digest: async () => '0' });
        env.scenery.buildTile = () => null;
        const ray = new THREE.Raycaster();
        const root = env.group.parent || env.group;
        for (const s of PLACES) {
            const p = env.route.sample(s, {});
            env.update(p, s, null, Infinity);
            await env.streamer.settle(p, s);
            const count = { sites: 0, onSurface: 0, paved: 0, without: 0 };
            const check = (on) => {
                const out = { colour: [0, 0, 0] };
                let n = 0, bad = 0;
                const kinds = {};
                for (let dx = -20; dx <= 20; dx += 0.5) for (let dz = -20; dz <= 20; dz += 0.5) {
                    const x = p.x + dx, z = p.z + dz;
                    if (!GroundCover.site(env, x, z, 0.25, out)) continue;
                    n++;
                    ray.set(new THREE.Vector3(x, out.y + 3, z), new THREE.Vector3(0, -1, 0));
                    const top = ray.intersectObjects(root.children, true).find(h => h.object.isMesh && h.object.visible);
                    if (top && !/world-terrain/.test(top.object.name) && top.point.y > out.y + 0.05) { bad++; kinds[`${top.object.name}:${top.face ? top.face.materialIndex : ''}`] = (kinds[`${top.object.name}:${top.face ? top.face.materialIndex : ''}`] || 0) + 1; }
                }
                return { n, bad, kinds };
            };
            const withRule = check();
            // (the same places with the rule off: the paving is there to be grown on)
            const pavedAt = env.pavedAt;
            env.pavedAt = null;
            const without = check();
            env.pavedAt = pavedAt;
            for (let dx = -20; dx <= 20; dx += 1) for (let dz = -20; dz <= 20; dz += 1) if (env.pavedAt(p.x + dx, p.z + dz, env.ground.groundY(p.x + dx, p.z + dz, null) ?? p.y)) count.paved++;
            read.push({ s, sites: withRule.n, onSurface: withRule.bad, kinds: withRule.kinds, withoutRule: without.bad, paved: count.paved });
        }
        console.log(`ground cover by the paving: ${JSON.stringify(read)}`);
    }, 3600000);

    test('no tuft or stone stands where a road, its paving or a stop is drawn over the land', () => {
        for (const r of read) {
            expect(r.paved).toBeGreaterThan(0);
            expect(r.sites).toBeGreaterThan(0);
            expect(r.onSurface).toBe(0);
        }
    });

    test('without the rule the same places do grow on the paving: the check reads what it says', () => {
        expect(read.reduce((p, r) => p + r.withoutRule, 0)).toBeGreaterThan(0);
    });
});
