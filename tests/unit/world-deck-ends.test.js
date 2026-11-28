/**
 * @jest-environment node
 */
// Every deck ends on land or on a road (.agent/system/world.md, "Structure surfaces and styles"): no side road of a
// stage is a bridge at a dead end, a node no other edge meets that is not on the ride (the importer drops them,
// tools/world/graph.mjs looseKept). Counted from each stage's data, both ways of a leg read alike. KNOWN holds the
// counts of folders imported before that rule and may only shrink; each reaches 0 at its next import.
// And no deck of the ride hangs over the land as a slab over a slot: where the land comes within RoadMesh.LOW_DECK_M of
// its underside (and more than LOW_DECK_MIN_M under it), a wall stands under its edge (RoadMesh.lowDeck). Read as
// drawn: a ray across under each row's edge, from 2 m outside it, meets the road works before the deck's middle.
import { describe, test, expect } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';
import { ALL_STAGES, stagesFor } from '../helpers/world-stages.js';

const game = loadGame(undefined, []);
const { THREE, WorldEnvironment } = game;

// Rows of a low ride deck with no wall under their edge, as measured when the check came (2026-11-28): may only shrink.
// Most are rows where the land under the deck's edge is low but the land under the girder's web is 5 m or more down, or
// where only one of a segment's rows is low (RoadMesh.lowDeck walls a segment low at both its rows)
const OPEN_KNOWN = {
    'gotthard-north': 37, 'lookout-andermatt': 35, tremola: 16, 'airolo-lookout': 53,
    'andermatt-goeschenen': 50, 'goeschenen-susten': 50, 'susten-gadmen': 50,
    'gadmen-innertkirchen': 59, 'innertkirchen-guttannen': 59, 'guttannen-grimsel': 59
};

const KNOWN = {
    'gotthard-north': 1, 'lookout-andermatt': 1, tremola: 2, 'airolo-lookout': 1,
    'andermatt-goeschenen': 3, 'goeschenen-susten': 3, 'susten-gadmen': 3,
    'gadmen-innertkirchen': 3, 'innertkirchen-guttannen': 3, 'guttannen-grimsel': 3
};

describe('no deck of the ride is a slab over a slot', () => {
    for (const id of stagesFor(ALL_STAGES)) {
        test(`${id}: a wall under every low deck's edge`, async () => {
            const { fetchFn } = diskFetch();
            const env = await WorldEnvironment.load(new THREE.Scene(), { id, fetchFn, models: null, digest: async () => '0' });
            env.scenery.buildTile = () => null;
            const { RoadMesh, StructureBuild } = game, route = env.route, pts = route.points;
            const rows = [];
            for (let i = 0; i < pts.length; i++) if ((pts[i].bits & 2) && !pts[i].viaduct && (pts[i - 1] && pts[i - 1].bits & 2)) rows.push(i);
            const open = [], ray = new THREE.Raycaster();
            let at = -Infinity;
            for (const i of rows) {
                const s = route.sArray[i];
                if (s - at > 300) { const p = route.sample(s, {}); env.update(p, s, null, Infinity); await env.streamer.settle(p, s); at = s; }
                const p = pts[i], c = Math.cos(p.heading), sn = Math.sin(p.heading);
                const works = [];
                for (const g of env.roadMeshes.values()) g.traverse(o => { if (o.isMesh && o.name === 'road-works') works.push(o); });
                for (const sign of [-1, 1]) {
                    const o = sign * (p.width / 2 + RoadMesh.BRIDGE_DECK_M - StructureBuild.BEAM_IN_M);
                    const x = p.x + o * c, z = p.z - o * sn, under = p.y - RoadMesh.DECK_M;
                    const land = env.ground.tileHeight(x, z, false);
                    if (!Number.isFinite(land) || under - land >= RoadMesh.LOW_DECK_M || under - land <= RoadMesh.LOW_DECK_MIN_M + 0.2) continue;
                    const y = (under + Math.max(land, under - 2)) / 2;
                    ray.set(new THREE.Vector3(x + sign * 2 * c, y, z - sign * 2 * sn), new THREE.Vector3(-sign * c, 0, sign * sn));
                    // (to the deck's middle: a girder's walls stand under its webs, well in from its edge)
                    ray.far = 2 + p.width / 2 + RoadMesh.BRIDGE_DECK_M;
                    if (!ray.intersectObjects(works, false).length) open.push({ s: Math.round(s), sign, gapM: Math.round((under - land) * 10) / 10 });
                }
            }
            if (open.length) console.log(id, open.length, JSON.stringify(open.slice(0, 12)));
            expect(open.length).toBeLessThanOrEqual(OPEN_KNOWN[id] || 0);
        }, 1800000);
    }
});

describe('no side road is a bridge that ends in the air', () => {
    for (const id of stagesFor(ALL_STAGES)) {
        test(`${id}: no bridge edge at a dead end`, async () => {
            const { fetchFn } = diskFetch();
            const env = await WorldEnvironment.load(new THREE.Scene(), { id, fetchFn, models: null, digest: async () => '0' });
            const data = env.data, deg = data.nodes.degree, loose = [];
            for (const e of data.edges) {
                if (e.onRide) continue;
                const s = env.graph.samples(e.id);
                if (!s || !(deg[e.a] === 1 || deg[e.b] === 1)) continue;
                // (a dead end on a decked sample: the end row of the edge there is a bridge's)
                const end = [deg[e.a] === 1 ? 0 : -1, deg[e.b] === 1 ? s.flags.length - 1 : -1].filter(i => i >= 0);
                if (end.some(i => s.flags[i] & 2)) loose.push({ edge: e.id, x: Math.round(s.x[0]), z: Math.round(s.z[0]), s: Math.round(env.route.project(s.x[0], s.z[0], null, {}).s) });
            }
            if (loose.length) console.log(id, loose.length, JSON.stringify(loose));
            expect(loose.length).toBeLessThanOrEqual(KNOWN[id] || 0);
        }, 600000);
    }
});
