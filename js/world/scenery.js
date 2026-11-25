// RoadClearance: where the roads of a world are, for whatever is placed beside them. The road bands are the ride's
// samples (from the route) and every side edge's samples (from the chunks in residence), each with its own drawn width
// plus the verge (RoadSurface.VERGE_M) and the strip of each stopping place beside the ride (WorldPlaces), in a 16 m hash. A side edge is added the first time its chunks are here and
// kept after they go: the data never changes. No THREE.
class RoadClearance {
    static get HASH_M() { return 16; }

    constructor(route, data) {
        this.route = route;
        this.data = data;
        this.segments = [];
        this.hash = new Map();
        this.indexed = new Set();
        this.chunksSeen = -1;
        const verge = RoadClearance.verge();
        const points = route.points;
        for (let i = 0; i + 1 < points.length; i++) {
            const a = points[i], b = points[i + 1];
            this.add({ edgeId: null, index: i, x0: a.x, z0: a.z, x1: b.x, z1: b.z, h0: a.width / 2 + verge, h1: b.width / 2 + verge });
            // A stopping place beside the ride (WorldPlaces: safeN, safeP on the route's points) is a band of its own,
            // along the middle of its strip, so nothing is planted where a rider pulls in
            for (const [key, sign] of [['safeN', -1], ['safeP', 1]]) {
                const pa = a[key] || 0, pb = b[key] || 0;
                if (!pa && !pb) continue;
                const oa = sign * (a.width / 2 + verge + pa / 2), ob = sign * (b.width / 2 + verge + pb / 2);
                this.add({
                    edgeId: null, index: i, place: true, h0: pa / 2, h1: pb / 2,
                    x0: a.x + oa * Math.cos(a.heading), z0: a.z - oa * Math.sin(a.heading), x1: b.x + ob * Math.cos(b.heading), z1: b.z - ob * Math.sin(b.heading)
                });
            }
        }
    }

    static verge() { return typeof RoadSurface !== 'undefined' ? RoadSurface.VERGE_M : 1.1; }

    add(segment) {
        const ref = this.segments.length;
        this.segments.push(segment);
        const cell = RoadClearance.HASH_M;
        const reach = Math.max(segment.h0, segment.h1);
        for (let cx = Math.floor((Math.min(segment.x0, segment.x1) - reach) / cell); cx <= Math.floor((Math.max(segment.x0, segment.x1) + reach) / cell); cx++) {
            for (let cz = Math.floor((Math.min(segment.z0, segment.z1) - reach) / cell); cz <= Math.floor((Math.max(segment.z0, segment.z1) + reach) / cell); cz++) {
                const key = cx * 65536 + cz;
                let list = this.hash.get(key);
                if (!list) this.hash.set(key, (list = []));
                list.push(ref);
            }
        }
    }

    // Adds the side edges whose chunks have arrived since the last call
    sync() {
        const data = this.data;
        if (!data || !data.edges || !data.chunks || data.chunks.size === this.chunksSeen) return;
        this.chunksSeen = data.chunks.size;
        const verge = RoadClearance.verge();
        for (const edge of data.edges) {
            if (edge.onRide || this.indexed.has(edge.id)) continue;
            let resident = true;
            for (let k = data.chunkOf(edge.first); k <= data.chunkOf(edge.first + edge.count - 1); k++) if (!data.chunks.has(k)) { resident = false; break; }
            if (!resident) continue;
            const e = data.edgeSamples(edge.id);
            if (!e) continue;
            this.indexed.add(edge.id);
            for (let i = 0; i + 1 < e.x.length; i++) this.add({ edgeId: edge.id, x0: e.x[i], z0: e.z[i], x1: e.x[i + 1], z1: e.z[i + 1], h0: e.width[i] / 2 + verge, h1: e.width[i + 1] / 2 + verge });
        }
    }

    // Metres from (x, z) past the edge of the nearest road band (negative inside one), looked for within `reach`
    // metres; `reach` when there is none that near. `skip(edgeId)` leaves side edges out; `sidesOnly` leaves the ride out.
    // `near.segment` is set to the band found (edgeId null and `index`, the ride's point, for the ride)
    clearance(x, z, reach = 20, skip = null, sidesOnly = false, near = null) {
        this.sync();
        const cell = RoadClearance.HASH_M;
        let best = reach;
        const seen = new Set();
        for (let cx = Math.floor((x - reach) / cell); cx <= Math.floor((x + reach) / cell); cx++) {
            for (let cz = Math.floor((z - reach) / cell); cz <= Math.floor((z + reach) / cell); cz++) {
                const list = this.hash.get(cx * 65536 + cz);
                if (!list) continue;
                for (const ref of list) {
                    if (seen.has(ref)) continue;
                    seen.add(ref);
                    const g = this.segments[ref];
                    if (g.edgeId === null ? sidesOnly : skip && skip(g.edgeId)) continue;
                    const dx = g.x1 - g.x0, dz = g.z1 - g.z0;
                    const run = dx * dx + dz * dz;
                    const t = run === 0 ? 0 : Math.max(0, Math.min(1, ((x - g.x0) * dx + (z - g.z0) * dz) / run));
                    const past = Math.hypot(g.x0 + dx * t - x, g.z0 + dz * t - z) - (g.h0 + (g.h1 - g.h0) * t);
                    if (past < best) {
                        best = past;
                        if (near) near.segment = g;
                    }
                }
            }
        }
        return best;
    }

    // clearance() of the side roads alone, the ride left out
    clearanceOfSides(x, z, reach = 20) {
        return this.clearance(x, z, reach, null, true);
    }

    // Whether a thing of plan radius `radius` at (x, z) keeps `margin` metres clear of every road band
    clearOfRoad(x, z, radius, margin = 0, skip = null) {
        return this.clearance(x, z, radius + margin + 1, skip) >= radius + margin;
    }

    // Whether a rectangle (centre x, z; `along` metres along `heading` and `across` metres across it) keeps `margin`
    // clear of every band: its outline is tested every `step` metres
    clearOfRoadBox(x, z, heading, along, across, margin = 0, skip = null, step = 1) {
        const fx = Math.sin(heading), fz = Math.cos(heading), lx = Math.cos(heading), lz = -Math.sin(heading);
        const a = along / 2, c = across / 2;
        const corners = [[-a, -c], [a, -c], [a, c], [-a, c]];
        for (let k = 0; k < 4; k++) {
            const [p0, q0] = corners[k], [p1, q1] = corners[(k + 1) % 4];
            const n = Math.max(1, Math.ceil(Math.hypot(p1 - p0, q1 - q0) / step));
            for (let i = 0; i < n; i++) {
                const p = p0 + (p1 - p0) * i / n, q = q0 + (q1 - q0) * i / n;
                if (!this.clearOfRoad(x + p * fx + q * lx, z + p * fz + q * lz, 0, margin, skip)) return false;
            }
        }
        return this.clearOfRoad(x, z, 0, margin, skip);
    }
}

// Scenery: what stands on the land of a world, all instanced, none of it random.
//   trees       from the land cover classes (forest, open forest, grass), each species at three levels of detail
//               from assets/trees/alpine.glb when it is loaded (Scenery.rankTrees)
//   buildings   from buildings.bin, in the modelled houses of assets/village/houses.glb
//   landmarks   the boxes of landmarks.json beside the road
//   stones      rows of granite marker stones on the edge of the ride where the land drops sharply from it
//   tufts       dry grass tussocks and low green clumps on the open strip beside the ride
// Every one stands on the drawn ground: its height is read from the ground at its own place (Scenery.footY), never
// from the road beside it, and where there is no ground to read it is left out.
// Placement uses a stable integer hash of the cell, so the same tile is the same
// every time. Nothing is placed in a road: every footprint keeps CLEAR_M of every road band
// (RoadClearance: the ride and every side road, each sample's own width plus the verge), and a
// tile's scenery waits for the side roads round it (WorldEnvironment.buildScenery).
// Counts are capped against the window budget of 1 400 instances,
// nearest first (tiles are built nearest first): BUILDING_CAP instances of house parts,
// TREE_CAP trees and STONE_CAP marker stones (the nearest to the bike, chosen
// again as it moves: Scenery.rankTrees, Scenery.rankStones).
class Scenery {
    // (1000 until the far trees were drawn at their far level: at about 60 triangles a tree the triangle cap no longer
    // holds the count, and the Gotthard leg stood at 1 414 instances at km 4 with 1000 trees, over the window's 1 400)
    static get TREE_CAP() { return 900; }
    // The levels a world draws its trees at (tools/blender/tree_species.py): `near` for the trees nearest the bike
    // (the trunk to the top, each branch, the foliage in clumps), `mid` past them (the shapes the legs draw) and `far`
    // for the rest (a few faces in the same outline). Scenery.rankTrees chooses again for every TREE_RANK_M the bike
    // moves: of the trees drawn, the TREE_NEAR_CAP nearest within TREE_NEAR_M are near (the quality level may take
    // fewer, Quality treeNear), the TREE_MID_CAP after them within TREE_MID_M are mid, while the triangle cap has room
    static get TREE_LEVELS() { return ['near', 'mid', 'far']; }
    static get TREE_NEAR_CAP() { return 48; }
    static get TREE_NEAR_M() { return 140; }
    static get TREE_MID_CAP() { return 200; }
    static get TREE_MID_M() { return 420; }
    static get TREE_RANK_M() { return 8; }
    // The near trees the triangle cap keeps room for when a tile is built: the houses and the far trees take the rest
    static get TREE_NEAR_KEPT() { return 16; }
    // The species of a world's trees: its kind, the node of each level in assets/trees/alpine.glb (`<node>_<level>`),
    // its palette (js/world/vegetation.js) and its share of its kind's trees. Over LARCH_FROM_M the larch's share is
    // `high`: the larch takes over the upper slopes of the Gotthard, the spruce the valley floors
    static get SPECIES() {
        return [
            { kind: 'conifer', name: 'conifer_spruce', node: 'spruce', share: 0.45, high: 0.3 },
            { kind: 'conifer', name: 'conifer_larch', node: 'larch', palette: 'larch', share: 0.2, high: 0.45 },
            { kind: 'conifer', name: 'conifer_pine', node: 'pine', share: 0.2, high: 0.15 },
            { kind: 'conifer', name: 'conifer_fir', node: 'fir', share: 0.15, high: 0.1 },
            { kind: 'broadleaf', name: 'broadleaf_beech', node: 'beech', share: 0.55, high: 0.55 },
            { kind: 'broadleaf', name: 'broadleaf_ash', node: 'ash', share: 0.45, high: 0.45 }
        ];
    }
    static get LARCH_FROM_M() { return 1650; }
    // The shrubs of a world, drawn as the trees are, at three levels from assets/trees/shrubs.glb
    // (tools/blender/tree_shrub.py, `<node>_<level>`): each a species of the Gotthard's slopes, in its own palette
    // (js/world/vegetation.js) and with its share of the bushes (`high` over LARCH_FROM_M: the alpine rose takes over
    // above the green alder). Two species, as the legs' two bushes before them: each is a forest mesh at each level
    // (Scenery.forestMesh, kept once made), and the window has about 120 meshes to spare (a dwarf juniper as a third
    // put the Tremola at km 4 under it). Without the file a world draws the legs' two bushes
    static get SHRUBS() {
        return [
            { kind: 'bush', name: 'bush_alder', node: 'alder', palette: 'alder', share: 0.6, high: 0.35 },
            { kind: 'bush', name: 'bush_rose', node: 'rose', palette: 'rose', share: 0.4, high: 0.65 }
        ];
    }
    // How light a level's colours are against its kind's palette (Vegetation.shape). The near level's branches and leaf
    // clumps look up more than the mid level's skirts and lobes, so the sky lights them more: drawn at the palette's
    // own middle they stood lighter and yellower than the same tree a step further off
    static get LEVEL_SHADE() { return { conifer: { near: 0.78 }, broadleaf: { near: 0.9 }, bush: { near: 0.9 } }; }
    static get BUILDING_CAP() { return 300; }
    // Triangles the trees and houses may add up to in a window (the window budget is 450 000 in all)
    // (200 000 until the far land took about 50 000 of the window: js/world/horizon.js FarLand)
    // (140 000 until the tufts beside the road took 2 000, TUFT_CAP, and the window stood 2 600 over its budget at
    // km 4, where this cap is what holds the trees: world-budget)
    // (134 000 until the touring crew rode their own bikes: five riders at about 3 100 triangles each, 15 500, where
    // the window had counted four procedural bikes, 10 300, and stood 1 400 over at km 4 with a fifth)
    // (128 000 until the marker stones stood along the drops: the rows of a window are 2 300 triangles at the most,
    // where the rows before the junctions were 1 440)
    // (The detail pass of the roadside models kept it: the nearest edge furniture's near shapes, up to about 1 000 more
    // triangles at a row of hairpins, are paid by fewer tufts (TUFT_CAP) and the stopping places' props drawn nearer
    // the bike (PlaceMesh reachM), so a window holds less of those than before. A cap of 122 000 drew about 100 fewer
    // far trees on the Tremola at km 4, which tests/unit/world-tree-count.test.js now holds against)
    static get TRIANGLE_CAP() { return 127000; }
    // Boulders on rock and scree, nearest first
    // (160 until a boulder was a broken block of 28 to 30 triangles, where it was 20: 110 of them cost what 160 did)
    static get BOULDER_CAP() { return 110; }
    // Of those, what the houses (4 000 triangles each, 5 parts) may take
    static get HOUSE_TRIANGLES() { return 80000; }
    // Marker stones: STONE_GAP_M apart along the road's edge, STONE_OUT_M past the verge, sunk STONE_SINK_M. Sawn
    // granite blocks stand along the edge of the pass roads in the photos, on a low kerb course of granite setts; no
    // yellow sign does. A block is STONE_WIDTH_M square and its top STONE_HEIGHT_M over its seat (in the photos
    // about 0.6 m square and 0.6 to 0.7 m high, 2 to 2.5 m apart)
    static get STONE_GAP_M() { return 2.5; }
    static get STONE_OUT_M() { return 0.25; }
    // (from its middle to a corner)
    static get STONE_RADIUS_M() { return 0.42; }
    static get STONE_WIDTH_M() { return 0.6; }
    static get STONE_HEIGHT_M() { return 0.68; }
    static get STONE_SINK_M() { return 0.15; }
    // The kerb course a row's stones stand on: this wide, this far over the row's seat, and this far on under it. The
    // seat of a stone is the verge's edge beside it where that is higher than the ground at its own middle: a fill
    // starts to fall at the verge's edge, and a row seated on the fill stood half a metre under the road it guards.
    // The kerb's sides go down into the fill, as the course of setts on the edge of a wall does in the photos (as far
    // as a stone's root, STONE_ROOT_M, and wider than the stone, so the root is inside it), and they are drawn as the
    // retaining walls are (RoadMesh.stoneMaterial): where the fill lies low the row stands on a low dry-stone wall
    static get KERB() { return { widthM: 0.66, proudM: 0.12, rootM: 2 }; }
    // Granite as the photos have it: a light speckled grey, a little cool. Measured on the photos, sRGB: a block's
    // face in the sun 165 169 176 and in its own shade 85 89 96, the setts of the kerb 150 155 165, the asphalt
    // beside them 143 143 146. The game's sky light is blue: a neutral 0.60 is drawn on an overcast ride at
    // 120 130 137 on a face and 138 146 153 on the top, beside asphalt at 88 93 95. The kerb is the dry-stone granite
    // of the walls (LandShade.STONE), which draws its tone at about 0.84 of this: 0.83 of the block, as the setts
    // are in the photos
    static get STONE_COLORS() { return { block: [0.60, 0.60, 0.60], kerb: [0.59, 0.595, 0.61] }; }
    // A stone goes on this far under its foot, as a post set in the ground does: on a bank that falls from it no corner
    // of it hangs in the air, and the drawn bank may lie under the ground the physics reads
    // (0.9 under the post of 0.3 m. A block's corners are twice as far from its middle. And round the outside of a
    // hairpin the fill is drawn flat from one row of the ride to the next, inside the cone the physics reads: 0.67 m
    // past the verge it was drawn up to 1.8 m under the road where the physics has 0.45 m)
    static get STONE_ROOT_M() { return 2; }
    // (120 at 24 triangles until the stone lost its hidden faces: the same 2 880 triangles at the most)
    // (160 at 18 until the rows went round the hairpins: a block is 10 triangles, and the cap takes the stones nearest
    // the bike: Scenery.rankStones. With 140 the rows are drawn to 190 m from the bike at the least, where the
    // hairpins stand closest; with 100 to 83 m)
    static get STONE_CAP() { return 140; }
    // Of the stones drawn, the STONE_NEAR_CAP nearest within STONE_NEAR_M are drawn in their near shapes (chamfered
    // stone, a post's band and reflector, a steel post's section, the W-beam's profile: EdgeStyles.nearPiece, nearLink),
    // at most about 1 000 triangles more than their far shapes, which TRIANGLE_CAP and the tufts pay
    static get STONE_NEAR_CAP() { return 20; }
    static get STONE_NEAR_M() { return 30; }
    // The pieces of kerb drawn, under the stones nearest the bike (6 triangles each): from further off a row is its
    // blocks. 140 blocks and 50 pieces are 1 700 triangles, where the 160 posts were 2 880 and the window of the
    // upper hairpins had 150 of them
    static get KERB_CAP() { return 50; }
    // Metres the bike moves before the nearest stones are chosen again
    static get STONE_RANK_M() { return 20; }
    // A marker stone is road furniture: it stands only where the drawn ground at its foot is within this of the road
    // beside it (not at the foot of a retaining wall, not on the land under a bridge)
    static get ROADSIDE_STEP_M() { return 0.8; }
    // Where the marker stones stand (Scenery.stonePlace, stoneStretches, hairpinRuns, wallRuns, stoneSites). On an old
    // pass road the stones are the guard of an edge: a row is seen only where the land falls away from the road's
    // edge, on the side it falls, and not at every one. A row also goes round the outside of a hairpin, over the part
    // of its arc that is a drop. And a row stands on the top of a retaining wall that holds the road up and has no
    // parapet: the wall's coping is the stones' seat (RoadMesh.COPING_W_M holds a stone and a margin either side). So
    // no stone stands on a level verge, on the uphill side, round a hairpin whose outside is level or the bank that
    // rises from it, on the inside of a hairpin, on a wall that carries a parapet (the parapet is the guard), or where
    // a bridge already guards the edge. Only a hairpin's row stands on a kerb course (KERB): at a drop
    // and on a wall the blocks stand alone, each in the ground or on the wall's top.
    //   dropM, reachM   a sharp drop: the drawn ground reachM past the verge lies more than dropM under the road. A
    //                   fill at the batter (RoadMesh.BATTER, 1:1.5) falls 6.7 m in 10, and the downhill edge of a
    //                   mountain road stands on one for kilometres: 7 m takes only the banks that fall more steeply
    //                   than a plain fill. The measure of a stretch
    //   hairpinDropM    the drop a hairpin's row needs behind it, by the same measure (reachM past the verge): less
    //                   than a stretch's, as the outside of a hairpin is where a rider runs wide. Its row still stands
    //                   only over the part of the arc that is an edge, never where the outside is level or the bank
    //   share           not every drop has them: a stretch is the whole run of stations next to each other that stand
    //                   at a drop, and a share of the stretches, drawn from the stretch's first station and its side,
    //                   have stones over all of it (a rule of the ride's own metres: the order the tiles arrive in
    //                   cannot change it). A stretch ends only where a station is no place for a stone at a drop
    //   minM            a row is at least this long: a shorter stretch gets none
    //   mouthM          metres a stone keeps from every side road's band: a junction's mouth is not an edge to guard
    //   worksM          metres a row keeps from the first and the last thing of a roadworks site
    //   footM           the most the ground may fall under a stone's own foot, from its middle to its lowest corner:
    //                   on more its root (STONE_ROOT_M) could show, so that stone of the row is left out, and with
    //                   it a stone that would then stand alone
    //   hairpinShare    the share of the hairpins (WorldRoute.hairpins) that have a row round their outside, drawn
    //                   from the metre of the hairpin's apex: most of them, not all. The row is on the arc only, its
    //                   stones STONE_GAP_M apart along the outer edge itself, over the part of the arc that is a drop
    //                   (hairpinDropM), all of it or none, and every rule above holds for it. Along a hairpin's arc the
    //                   drop rule places nothing, on either side
    //   wallMaxM        a low retaining wall: its face drops less than this from the road's edge all along it. On
    //                   such a wall a row of stones may take the parapet's place (a higher wall keeps its parapet)
    //   wallShare       the share of the low walls under the ride's edge that have a row on their top, drawn from the
    //                   metre of the wall's first row and its side: a chosen wall has stones over all of it and no
    //                   parapet, or no stone at all (WorldEnvironment.wallStoned). Only a wall that holds the road up
    //                   (its face drops wallLowM or more from the edge all along) and meets no structure
    static get STONE_RULE() { return { dropM: 7, hairpinDropM: 4, reachM: 10, share: 0.6, minM: 7.5, mouthM: 8, worksM: 5, footM: 0.6, hairpinShare: 0.75, wallMaxM: 4, wallShare: 0.6, wallLowM: 0.3 }; }
    // Tufts: the dry tussock grass and the low green clumps the photos show right beside the roads, on the strip the
    // trees and boulders leave open. TUFT_TRIES places a side for each point of the ride, a TUFT_SHARE of them taken, out to TUFT_REACH_M past the verge,
    // 4 or 6 triangles each (the window is within 1 000 triangles of its budget where the land is densest), at most TUFT_CAP in a window and TUFTS_PER_TILE in a tile, nearest the bike first
    // (500 at 3 and 4 triangles until a tuft was 4 and 6: 300 cost less, and a tuft is under a few pixels from 150 m)
    static get TUFT_CAP() { return 300; }
    static get TUFTS_PER_TILE() { return 250; }
    static get TUFT_REACH_M() { return 7; }
    static get TUFT_TRIES() { return 6; }
    static get TUFT_SHARE() { return 0.5; }
    static get TUFT_SINK_M() { return 0.05; }
    static get TREES_PER_TILE() { return 350; }
    // Metres of open ground a tree keeps from the road, the bench and any other road
    static get ROAD_CLEAR_M() { return 6; }
    // Metres past the edge of every road band (its drawn width and the verge, RoadClearance) that the plan footprint
    // of each kind keeps clear: a tree's crown or a boulder, a house, a marker stone, a tuft, a landmark
    static get CLEAR_M() { return { tree: 2, boulder: 2, house: 0, stone: 0.15, tuft: 0.2, landmark: 3 }; }
    // Metres along the ride a gate frame may be drawn from its gate, to keep its posts off a side road
    static get GATE_SHIFT_M() { return 15; }
    static get BUILDING_REACH_M() { return 450; }
    // Scale a modelled house is drawn at, at most and at least (the models are about 16 m by 11 m)
    static get HOUSE_SCALE_MAX() { return 1.2; }
    static get HOUSE_SCALE_MIN() { return 0.45; }
    // How a building meets the land (Scenery.seat): its floor (the model's y 0, its door sill) stands FLOOR_SINK_M under
    // the highest land under its walls, so no door is sunk, and a footing of stone runs from FOOTING_UNDER_M under the
    // lowest land up FOOTING_OVER_M into the walls, so no corner floats. A model's walls are its parts named `wall`, or
    // its plan box FOOTING_INSET_M in from every side (the eaves stand out past the walls)
    static get FLOOR_SINK_M() { return 0.1; }
    static get FOOTING_UNDER_M() { return 0.3; }
    static get FOOTING_OVER_M() { return 0.3; }
    static get FOOTING_INSET_M() { return 0.8; }
    // The most the land may rise under a house's walls: a storey and a plinth of footing, as an alpine house shows on its
    // downhill side. More is a plot the drawn land does not hold (a road's cut or fill: bench.mjs builds them at 1:1.5), where
    // the house would stand on a stone tower or sink to its eaves, so it is left out
    static get FOOTING_MAX_M() { return 4.5; }
    // Metres a landmark may be moved along the ride from the s it was snapped to, and out from the road, to find dry
    // land clear of every road
    static get LANDMARK_ALONG_M() { return 150; }
    static get LANDMARK_OUT_M() { return 80; }
    // The most the land may rise under a landmark's walls where a flatter place is near: its front faces the ride,
    // and on more the front would stand on a storey of footing
    static get LANDMARK_RISE_M() { return 1.5; }

    // Integer hash of a cell, 0 to 1
    static hash(ix, iz, salt) {
        let h = Math.imul(ix, 73856093) ^ Math.imul(iz, 19349663) ^ Math.imul(salt, 83492791);
        h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
        return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
    }

    // The shapes and houses of the modelled assets, or null when they cannot be had.
    // loadModel: SceneAssets.loadModel (a path to a promise of {meshes, places})
    static async loadModels(loadModel) {
        try {
            const [alpine, bush, houses, shrubs] = await Promise.all([
                loadModel('assets/trees/alpine.glb'), loadModel('assets/trees/bush.glb'), loadModel('assets/village/houses.glb'),
                loadModel('assets/trees/shrubs.glb').catch(error => { console.warn(`world scenery: shrubs unavailable (${error.message}); using the legs' bushes`); return null; })
            ]);
            // A world draws the shapes in its own palette and light (js/world/vegetation.js); the legs keep the files' colours
            // and materials: a house draws with world copies of them, which take the haze (LandShade.adopt)
            const trees = [];
            for (const species of Scenery.SPECIES) {
                const lods = {};
                for (const level of Scenery.TREE_LEVELS) {
                    const parts = alpine.meshes.get(`${species.node}_${level}`);
                    if (parts) lods[level] = Vegetation.shape(parts, species.kind, species.palette, (Scenery.LEVEL_SHADE[species.kind] || {})[level] || 1);
                }
                if (!lods.mid) continue;
                trees.push({ kind: species.kind, name: species.name, node: species.node, share: species.share, high: species.high, parts: lods.mid, lods });
            }
            const before = trees.length;
            for (const species of shrubs ? Scenery.SHRUBS : []) {
                const lods = {};
                for (const level of Scenery.TREE_LEVELS) {
                    const parts = shrubs.meshes.get(`${species.node}_${level}`);
                    if (parts) lods[level] = Vegetation.shape(parts, species.kind, species.palette, (Scenery.LEVEL_SHADE[species.kind] || {})[level] || 1);
                }
                if (!lods.mid) continue;
                trees.push({ kind: species.kind, name: species.name, node: species.node, share: species.share, high: species.high, parts: lods.mid, lods });
            }
            if (trees.length === before) for (const name of ['bush_round', 'bush_low']) if (bush.meshes.get(name)) trees.push({ kind: 'bush', name, parts: Vegetation.shape(bush.meshes.get(name), 'bush') });
            const homes = [...houses.meshes.keys()].filter(name => name.startsWith('house_') && !name.includes(':')).sort().map(name => ({ name, parts: LandShade.adopt(houses.meshes.get(name)) }));
            if (!trees.length || !homes.length) return null;
            return { trees, houses: homes };
        } catch (error) {
            console.warn(`world scenery: modelled assets unavailable (${error.message}); using plain shapes`);
            return null;
        }
    }

    constructor(ground, data, models = null) {
        this.ground = ground;
        this.data = data;
        this.models = models;
        this.perTile = new Map();
        // The trees drawn (Scenery.rankTrees) and their triangles, which `triangles` includes
        this.treeCount = 0;
        this.treeTriangles = 0;
        this.houseInstances = 0;
        this.houseTriangles = 0;
        this.triangles = 0;
        this.fallback = null;
        // The road bands everything here keeps clear of (null for a ground with no route: nothing to keep clear of)
        this.roads = ground && ground.route && ground.route.points ? new RoadClearance(ground.route, data) : null;
        // Every tree of the window, at the level Scenery.rankTrees chose: an instanced mesh for each part of each
        // shape at each level, over all the tiles (WorldEnvironment puts the group under its scenery)
        this.forest = new THREE.Group();
        this.forest.name = 'world-forest';
        this.forestMeshes = new Map();
        // The share of the window's trees drawn and the most drawn at the near level (the quality level: Game.thinTrees)
        this.treeShare = 1;
        this.treeNear = Scenery.TREE_NEAR_CAP;
        this.treesDirty = false;
        this.treeLevelCounts = { near: 0, mid: 0, far: 0 };
    }

    // Whether a thing of plan radius `radius` at (x, z) keeps `margin` clear of every road band
    clearOfRoad(x, z, radius, margin = 0) {
        return !this.roads || this.roads.clearOfRoad(x, z, radius, margin);
    }

    // The radius in plan of a set of parts about its origin, whichever way it is turned (measured once)
    static planRadius(shape) {
        if (shape.planRadius === undefined) {
            let x = 0, z = 0;
            // (every level: the near level's branches reach a little past the mid level's skirts)
            for (const part of Object.values(Scenery.levelsOf(shape)).flat()) {
                part.geometry.computeBoundingBox();
                const box = part.geometry.boundingBox;
                x = Math.max(x, Math.abs(box.min.x), Math.abs(box.max.x));
                z = Math.max(z, Math.abs(box.min.z), Math.abs(box.max.z));
            }
            shape.planRadius = Math.hypot(x, z);
        }
        return shape.planRadius;
    }

    // Plain shapes for when no model is loaded: a cone, a ball on a trunk's height, a low blob
    plain() {
        if (!this.fallback) {
            const material = (hex) => new THREE.MeshLambertMaterial({ color: hex, flatShading: true });
            const cone = new THREE.ConeGeometry(2.2, 9, 6); cone.translate(0, 4.5, 0);
            const ball = new THREE.IcosahedronGeometry(3, 0); ball.translate(0, 5.5, 0);
            const blob = new THREE.IcosahedronGeometry(1, 0); blob.translate(0, 0.6, 0);
            const wall = new THREE.BoxGeometry(1, 1, 1); wall.translate(0, 0.5, 0);
            this.fallback = {
                trees: [
                    { kind: 'conifer', name: 'plain_conifer', parts: [{ geometry: cone, material: Vegetation.plainMaterial('conifer') }] },
                    { kind: 'broadleaf', name: 'plain_broadleaf', parts: [{ geometry: ball, material: Vegetation.plainMaterial('broadleaf') }] },
                    { kind: 'bush', name: 'plain_bush', parts: [{ geometry: blob, material: Vegetation.plainMaterial('bush') }] }
                ],
                houses: [{ name: 'plain_hut', parts: Scenery.hutParts(), plain: true }],
                // A big mapped wall (buildings.mjs KIND.wall) is a block of stone, not a house
                walls: [{ name: 'plain_wall', parts: [{ geometry: wall, material: material(0x8f8a80) }], plain: true }]
            };
        }
        return this.fallback;
    }

    set() { return this.models || this.plain(); }

    shapesOf(kind) { return this.set().trees.filter(s => s.kind === kind); }

    // A shape's parts at each level (Scenery.TREE_LEVELS); a shape made at one level only (a bush, a plain shape) is
    // the same at all three
    static levelsOf(shape) {
        const lods = shape.lods || {};
        return { near: lods.near || shape.parts, mid: lods.mid || shape.parts, far: lods.far || lods.mid || shape.parts };
    }

    // One of a kind's shapes by `at` (0 to 1), each taking its share (`high` over LARCH_FROM_M), equal shares where a
    // shape has none
    static pickShape(shapes, at, y) {
        const weights = shapes.map(s => (y > Scenery.LARCH_FROM_M && s.high !== undefined ? s.high : s.share) ?? 1);
        const total = weights.reduce((a, b) => a + b, 0);
        let sum = 0;
        for (let n = 0; n < shapes.length; n++) {
            sum += weights[n] / total;
            if (at < sum) return shapes[n];
        }
        return shapes[shapes.length - 1];
    }

    // Whether the land drawn round (x, z) shows water: a node of the 8 m cell under it, or of the cells beside it, is a
    // water node or takes its colour from a water cover cell. TerrainMesh.colours colours every other node from the
    // cover and blends the nodes between, so water shows up to two nodes from where it is mapped; a point no such node
    // reaches is drawn as land. Dry where the tile is not resident (nothing is drawn there).
    wetAt(x, z) {
        const data = this.data;
        if (!data || !data.tile) return false;
        const m = WorldData.TILE_M, cell = WorldData.CELL_M, n = WorldData.TILE_N;
        const i0 = Math.floor(x / cell), j0 = Math.floor(z / cell);
        const water = WorldData.ZONE.water, terrain = WorldData.ZONE.terrain;
        for (let j = j0 - 1; j <= j0 + 2; j++) {
            for (let i = i0 - 1; i <= i0 + 2; i++) {
                const nx = i * cell, nz = j * cell;
                const tx = Math.floor(nx / m), tz = Math.floor(nz / m);
                const key = `${tx},${tz}`;
                const tile = data.tile(key);
                if (!tile) continue;
                const a = Math.round((nx - tx * m) / cell), b = Math.round((nz - tz * m) / cell);
                const zone = tile.zones[b * n + a];
                if (zone === water) return true;
                if (zone !== terrain) continue;
                const cover = data.cover ? data.cover(key) : null;
                if (!cover) continue;
                const ci = Math.min(WorldData.COVER_N - 1, Math.floor((a * cell) / (m / WorldData.COVER_N)));
                const cj = Math.min(WorldData.COVER_N - 1, Math.floor((b * cell) / (m / WorldData.COVER_N)));
                if (cover[cj * WorldData.COVER_N + ci] === Scenery.COVER_WATER) return true;
            }
        }
        return false;
    }

    // A big mapped wall (tools/world/buildings.mjs KIND.wall)
    static get KIND_WALL() { return 4; }

    // The cover class of standing water (tools/world/landcover.mjs COVER.water)
    static get COVER_WATER() { return 7; }

    // Points over a rectangle (centre x, z; `along` metres along `heading`, `across` square to it) every `step` metres
    // at most, its corners and edges included
    static rectPoints(x, z, heading, along, across, step = 2) {
        const fx = Math.sin(heading), fz = Math.cos(heading), lx = Math.cos(heading), lz = -Math.sin(heading);
        const na = Math.max(1, Math.ceil(along / step)), nc = Math.max(1, Math.ceil(across / step));
        const out = [];
        for (let a = 0; a <= na; a++) {
            for (let c = 0; c <= nc; c++) {
                const p = (a / na - 0.5) * along, q = (c / nc - 0.5) * across;
                out.push([x + p * fx + q * lx, z + p * fz + q * lz]);
            }
        }
        return out;
    }

    // Whether any of a rectangle stands on drawn water (wetAt), `margin` metres round it included
    wetUnder(x, z, heading, along, across, margin = 0) {
        for (const [px, pz] of Scenery.rectPoints(x, z, heading, along + 2 * margin, across + 2 * margin)) if (this.wetAt(px, pz)) return true;
        return false;
    }

    // The lowest and highest drawn land under a rectangle (2 m apart at most, the corners included): {low, high}, or
    // null where a tile under it is not resident
    seat(x, z, heading, along, across) {
        let low = Infinity, high = -Infinity;
        for (const [px, pz] of Scenery.rectPoints(x, z, heading, along, across)) {
            const y = this.ground.tileHeight(px, pz);
            if (y === null || !Number.isFinite(y)) return null;
            low = Math.min(low, y);
            high = Math.max(high, y);
        }
        return { low, high };
    }

    // The footings of a set of buildings as one mesh in the world's own metres, so the dry-stone courses of the
    // retaining walls (RoadMesh.stoneMaterial, drawn from the world position) lie on them at their true size.
    // `boxes`: [{rect, bottom, top}] from Scenery.footing. Each footing is kept in userData.footings for the checks.
    static footingMesh(boxes, name) {
        const out = { positions: [], shades: [] };
        const stone = [0.6, 0.58, 0.54];
        for (const f of boxes) RoadMesh.box(out, f.rect.x, (f.bottom + f.top) / 2, f.rect.z, f.rect.across, f.top - f.bottom, f.rect.along, f.rect.heading, stone);
        const mesh = new THREE.Mesh(RoadMesh.geometry(out.positions, out.shades), RoadMesh.stoneMaterial());
        mesh.name = name;
        mesh.receiveShadow = true;
        mesh.userData.world = 'scenery';
        mesh.userData.footings = boxes.map(f => ({ rect: { ...f.rect }, bottom: f.bottom, top: f.top }));
        return mesh;
    }

    // Triangles of one footing (a box: 6 faces of 2)
    static get FOOTING_TRIANGLES() { return 12; }

    // A small building with no model to fit it (a hut, a garage, a store): walls of weathered timber under a pitched
    // slate roof, in a unit cube standing on y 0 (the walls to WALL_SHARE of its height, the ridge along z), drawn at
    // the footprint's size. The roof keeps inside the footprint, as a modelled house does.
    static get HUT_WALL_SHARE() { return 0.62; }

    static hutParts() {
        if (!Scenery.hut) {
            const wall = Scenery.HUT_WALL_SHARE;
            const body = new THREE.BoxGeometry(1, wall, 1);
            body.translate(0, wall / 2, 0);
            // The gable roof: two slopes and two gable ends, from the eaves (y wall) to the ridge (y 1) along z
            const roof = new THREE.BufferGeometry();
            const e = wall, r = 1;
            const v = [
                -0.5, e, -0.5, 0, r, -0.5, 0, r, 0.5, -0.5, e, -0.5, 0, r, 0.5, -0.5, e, 0.5,
                0.5, e, -0.5, 0.5, e, 0.5, 0, r, 0.5, 0.5, e, -0.5, 0, r, 0.5, 0, r, -0.5,
                -0.5, e, -0.5, 0.5, e, -0.5, 0, r, -0.5,
                -0.5, e, 0.5, 0, r, 0.5, 0.5, e, 0.5
            ];
            roof.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
            roof.computeVertexNormals();
            const material = (hex) => new THREE.MeshLambertMaterial({ color: hex, flatShading: true, side: THREE.DoubleSide });
            Scenery.hut = [{ geometry: body, material: material(0x8a6a4a) }, { geometry: roof, material: material(0x4c4f55) }];
        }
        return Scenery.hut;
    }

    // The height a hut is drawn at: the mapped height, but no taller than a hut of its width would be
    static hutHeight(b) {
        return Math.min(b.h || 6, 2.2 + 0.6 * Math.min(b.w, b.d));
    }

    // A model's walls in its own plan: { x0, x1, z0, z1 } of its parts named `wall`, or of all its parts
    // FOOTING_INSET_M in from every side (measured once)
    static wallsOf(shape) {
        if (!shape.walls) {
            const all = new THREE.Box3(), walls = new THREE.Box3();
            for (const part of shape.parts) {
                part.geometry.computeBoundingBox();
                all.union(part.geometry.boundingBox);
                if (part.material && part.material.name === 'wall') walls.union(part.geometry.boundingBox);
            }
            const inset = Scenery.FOOTING_INSET_M;
            shape.walls = !walls.isEmpty()
                ? { x0: walls.min.x, x1: walls.max.x, z0: walls.min.z, z1: walls.max.z }
                : { x0: Math.min(all.min.x + inset, (all.min.x + all.max.x) / 2), x1: Math.max(all.max.x - inset, (all.min.x + all.max.x) / 2), z0: Math.min(all.min.z + inset, (all.min.z + all.max.z) / 2), z1: Math.max(all.max.z - inset, (all.min.z + all.max.z) / 2) };
        }
        return shape.walls;
    }

    // The walls of a model drawn at (x, z) turned `turn` and scaled `scale` about its plan point `centre` (the point
    // that stands on x, z): { x, z, heading, along, across } in the world, `along` its model z and `across` its model x
    static wallRect(shape, x, z, turn, scale, centre) {
        const w = Scenery.wallsOf(shape);
        const mx = ((w.x0 + w.x1) / 2 - centre[0]) * scale, mz = ((w.z0 + w.z1) / 2 - centre[1]) * scale;
        const cos = Math.cos(turn), sin = Math.sin(turn);
        return { x: x + mx * cos + mz * sin, z: z - mx * sin + mz * cos, heading: turn, along: (w.z1 - w.z0) * scale, across: (w.x1 - w.x0) * scale };
    }

    // How a building meets the land under its walls `rect`: { floor, rect, bottom, top, land } with `floor` the height
    // of its model's y 0 and the footing (Scenery.footingMesh) from `bottom`, under the lowest land, up to `top`, into
    // the walls. null where the land under it is not resident.
    footing(rect) {
        const land = this.seat(rect.x, rect.z, rect.heading, rect.along, rect.across);
        if (!land) return null;
        const floor = land.high - Scenery.FLOOR_SINK_M;
        return { floor, rect, bottom: land.low - Scenery.FOOTING_UNDER_M, top: floor + Scenery.FOOTING_OVER_M, land };
    }

    // Whether open ground at (x, z) is clear of road, bench and wall, and dry, and a thing of plan radius `radius`
    // there keeps `margin` clear of every road band (the zone layer is 8 m nodes and knows only the side roads drawn
    // so far; the bands are every sample's own width)
    clear(x, z, radius = 0, margin = 0) {
        const g = this.ground;
        const around = Scenery.ROAD_CLEAR_M;
        for (const [dx, dz] of [[0, 0], [around, 0], [-around, 0], [0, around], [0, -around]]) {
            if (g.kindAt(x + dx, z + dz) !== 'runoff' || g.tileZone(x + dx, z + dz) === WorldData.ZONE.water) return false;
        }
        return this.clearOfRoad(x, z, radius, margin);
    }

    // Tree sites of a tile: [{x, y, z, shape, scale, turn}] in cell order, capped
    treeSites(tile, cover) {
        return Scenery.drain(this.treeSitesSteps(tile, cover));
    }

    // A build in steps (a generator) run to its end: its result (WorldStreamer.drain)
    static drain(steps) {
        let step = steps.next();
        while (!step.done) step = steps.next();
        return step.value;
    }

    // The same in steps, a row of cells at a time (WorldStreamer: a build no frame waits on whole)
    *treeSitesSteps(tile, cover) {
        const sites = [];
        if (!cover) return sites;
        const n = WorldData.COVER_N;
        const cell = WorldData.TILE_M / n;
        for (let cj = 0; cj < n; cj++) {
            yield;
            for (let ci = 0; ci < n; ci++) {
                const cls = cover[cj * n + ci];
                const chance = cls === 1 ? 0.55 : cls === 2 ? 0.2 : cls === 5 ? 0.025 : 0;
                if (!chance) continue;
                const ix = tile.tx * n + ci, iz = tile.tz * n + cj;
                if (Scenery.hash(ix, iz, 1) >= chance) continue;
                const x = tile.tx * WorldData.TILE_M + (ci + Scenery.hash(ix, iz, 2)) * cell;
                const z = tile.tz * WorldData.TILE_M + (cj + Scenery.hash(ix, iz, 3)) * cell;
                const y = this.ground.tileHeight(x, z);
                if (y === null || y > 2300) continue;
                const roll = Scenery.hash(ix, iz, 4);
                const kind = cls === 5 ? 'bush' : y > 1750 || roll < 0.6 ? (cls === 2 && roll < 0.2 ? 'bush' : 'conifer') : 'broadleaf';
                const shapes = this.shapesOf(kind);
                if (!shapes.length) continue;
                const shape = Scenery.pickShape(shapes, Scenery.hash(ix, iz, 5), y);
                const scale = 0.8 + 0.6 * Scenery.hash(ix, iz, 6);
                // Each tree its own girth and its own green: a crown 0.88 to 1.12 as wide for its height, and a tint
                // (Scenery.treeTint) darker or lighter and toward yellow or blue
                const width = 0.88 + 0.24 * Scenery.hash(ix, iz, 8);
                // The whole crown keeps clear of every road band, not only the trunk
                if (!this.clear(x, z, Scenery.planRadius(shape) * scale * Math.max(1, width), Scenery.CLEAR_M.tree)) continue;
                sites.push({ x, y, z, shape, scale, width, turn: Scenery.hash(ix, iz, 7) * Math.PI * 2, tint: Scenery.treeTint(Scenery.hash(ix, iz, 9), Scenery.hash(ix, iz, 10)) });
                if (sites.length >= Scenery.TREES_PER_TILE) return sites;
            }
        }
        return sites;
    }

    // Boulder sites of a tile: [{x, y, z, size, turn}] on rock and scree cells clear of the roads
    boulderSites(tile, cover) {
        const sites = [];
        if (!cover) return sites;
        const n = WorldData.COVER_N;
        const cell = WorldData.TILE_M / n;
        for (let cj = 0; cj < n; cj++) {
            for (let ci = 0; ci < n; ci++) {
                const cls = cover[cj * n + ci];
                const chance = cls === 4 ? 0.14 : cls === 3 ? 0.06 : 0;
                if (!chance) continue;
                const ix = tile.tx * n + ci, iz = tile.tz * n + cj;
                if (Scenery.hash(ix, iz, 31) >= chance) continue;
                const x = tile.tx * WorldData.TILE_M + (ci + Scenery.hash(ix, iz, 32)) * cell;
                const z = tile.tz * WorldData.TILE_M + (cj + Scenery.hash(ix, iz, 33)) * cell;
                const size = 0.8 + 2.2 * Scenery.hash(ix, iz, 34) ** 2;
                // A boulder is drawn 1.3 by 1 times its size in plan (buildTile)
                if (!this.clear(x, z, size * Math.hypot(1.3, 1), Scenery.CLEAR_M.boulder)) continue;
                const y = this.ground.tileHeight(x, z);
                if (y === null) continue;
                sites.push({ x, y: y - 0.3, z, size, turn: Scenery.hash(ix, iz, 35) * Math.PI * 2 });
            }
        }
        return sites;
    }

    // A boulder: a block of granite with a break. Each of BOULDER_SHAPES shapes is a six-sided block, wider at its foot,
    // each corner at its own reach and height and the top turned on the foot, with BOULDER_PLANES fractures across a
    // shoulder (Scenery.clipSolid), then stood in the box the icosahedron it replaces had (a metre across, y -0.55 to
    // 1.45). So the stone is flat faces meeting in sharp edges, as a broken block is, not a ball. Each face is its own
    // grey: lighter where it looks up at the sky and the weather has bleached it, darker under, with spots of lichen on
    // the tops. Flat shaded, in vertex colours; 28 to 30 triangles, and BOULDER_CAP draws as many triangles of them as of
    // the icosahedra of 20, so the trees keep their share of the cap (a block cut by thirteen planes was 48 to 60
    // triangles, and with a lower cap cost the Tremola about 100 far trees at km 4)
    static get BOULDER_SHAPES() { return 3; }
    static get BOULDER_PLANES() { return 1; }
    static boulderPart(shape = 0) {
        Scenery.boulders = Scenery.boulders || [];
        if (!Scenery.boulders[shape]) {
            const h = k => Scenery.hash(shape + 1, k, 97);
            const V = (x, y, z) => new THREE.Vector3(x, y, z);
            // A six-sided block, wider at its foot, each corner at its own reach and the top turned on the foot
            const foot = [], top = [];
            const turn = 0.5 * (h(70) - 0.5);
            for (let k = 0; k < 6; k++) {
                const a = (k / 6) * Math.PI * 2 + 0.35 * (h(60 + k) - 0.5);
                const r0 = 0.85 + 0.3 * h(80 + k), r1 = r0 * (0.5 + 0.25 * h(90 + k));
                foot.push(V(Math.cos(a) * r0, -1, Math.sin(a) * r0));
                top.push(V(Math.cos(a + turn) * r1, 0.6 + 0.4 * h(100 + k), Math.sin(a + turn) * r1));
            }
            let faces = [foot.slice(), top.slice().reverse()];
            for (let k = 0; k < 6; k++) {
                const j = (k + 1) % 6;
                faces.push([foot[k], top[k], top[j], foot[j]]);
            }
            // The side faces are not flat (each top corner at its own height): each is two triangles, and one
            // fracture across a shoulder cuts the block as a break does
            faces = faces.flatMap(f => (f.length === 4 ? [[f[0], f[1], f[2]], [f[0], f[2], f[3]]] : [f]));
            const planes = [];
            for (let k = 0; k < Scenery.BOULDER_PLANES; k++) {
                const u = h(k * 3) * Math.PI * 2, v = Math.acos(1 - 2 * (0.1 + 0.4 * h(k * 3 + 1)));
                planes.push({ n: V(Math.sin(v) * Math.cos(u), Math.cos(v), Math.sin(v) * Math.sin(u)), d: 0.45 + 0.2 * h(k * 3 + 2) });
            }
            for (const plane of planes) faces = Scenery.clipSolid(faces, plane.n, plane.d);
            // Into the icosahedron's box: a metre in radius across, from y -0.55 to 1.45
            let reach = 0, lo = Infinity, hi = -Infinity;
            for (const f of faces) for (const p of f) { reach = Math.max(reach, Math.hypot(p.x, p.z)); lo = Math.min(lo, p.y); hi = Math.max(hi, p.y); }
            const positions = [], colours = [];
            const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
            const middle = new THREE.Vector3(), mid = new THREE.Vector3();
            let count = 0;
            for (const f of faces) for (const p of f) { middle.add(p); count++; }
            middle.divideScalar(count);
            faces.forEach((f, k) => {
                // Each face wound to look out of the stone (the solid is convex: away from its middle)
                mid.set(0, 0, 0);
                for (const p of f) mid.add(p);
                mid.divideScalar(f.length).sub(middle);
                const turn = f[1].clone().sub(f[0]).cross(f[2].clone().sub(f[0])).dot(mid) < 0;
                const ps = (turn ? f.slice().reverse() : f).map(p => [p.x / reach, -0.55 + (p.y - lo) / (hi - lo) * 2, p.z / reach]);
                a.fromArray(ps[0]); b.fromArray(ps[1]); c.fromArray(ps[2]);
                const up = b.clone().sub(a).cross(c.clone().sub(a)).normalize().y;
                // A grey for each face by the way it looks, as sRGB (Graphics.fixColorSpaces decodes float colours)
                const grey = 0.37 + 0.08 * Math.max(0, up) - 0.08 * Math.max(0, -up) + 0.06 * (h(100 + k) - 0.5);
                let rgb = [grey * 1.01, grey, grey * 0.97];
                // Lichen on a few faces that look up: a dull yellow green, or the rust of the high crusts
                const lichen = h(300 + k);
                if (up > 0.35 && lichen < 0.3) rgb = lichen < 0.1 ? [grey * 1.12, grey * 0.92, grey * 0.72] : [grey * 0.98, grey * 1.04, grey * 0.8];
                for (let i = 1; i + 1 < ps.length; i++) for (const p of [ps[0], ps[i], ps[i + 1]]) { positions.push(...p); colours.push(...rgb); }
            });
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
            geometry.computeVertexNormals();
            geometry.computeBoundingSphere();
            Scenery.boulders[shape] = { geometry, material: Scenery.boulderMaterial(), triangles: positions.length / 9 };
        }
        return Scenery.boulders[shape];
    }

    // A convex solid (faces: lists of points, each wound anticlockwise seen from outside) cut by the plane n . p = d,
    // keeping the side under it: each face clipped, and the cut closed by a face of its own
    static clipSolid(faces, n, d) {
        const out = [], cut = [];
        for (const f of faces) {
            const kept = [];
            for (let i = 0; i < f.length; i++) {
                const p = f[i], q = f[(i + 1) % f.length], dp = n.dot(p) - d, dq = n.dot(q) - d;
                if (dp <= 0) kept.push(p);
                if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) {
                    const x = p.clone().lerp(q, dp / (dp - dq));
                    kept.push(x);
                    cut.push(x);
                }
            }
            if (kept.length >= 3) out.push(kept);
        }
        const points = [];
        for (const p of cut) if (!points.some(q => q.distanceTo(p) < 1e-6)) points.push(p);
        if (points.length < 3) return out;
        const centre = points.reduce((sum, p) => sum.add(p), new THREE.Vector3()).divideScalar(points.length);
        const u = new THREE.Vector3(Math.abs(n.x) > 0.9 ? 0 : 1, Math.abs(n.x) > 0.9 ? 1 : 0, 0);
        u.sub(n.clone().multiplyScalar(n.dot(u))).normalize();
        const v = n.clone().cross(u);
        const angle = p => { const r = p.clone().sub(centre); return Math.atan2(r.dot(v), r.dot(u)); };
        out.push(points.sort((p, q) => angle(p) - angle(q)));
        return out;
    }

    static boulderMaterial() {
        if (!Scenery.boulderLit) Scenery.boulderLit = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
        return Scenery.boulderLit;
    }

    static trianglesOf(parts) {
        return parts.reduce((sum, part) => sum + (part.geometry.index ? part.geometry.index.count : part.geometry.attributes.position.count) / 3, 0);
    }

    // Instanced meshes for a list of placements of one set of parts; parts' geometry and material are shared, never freed here
    instanced(parts, matrices, name, group) {
        for (const part of parts) {
            const mesh = new THREE.InstancedMesh(part.geometry, part.material, matrices.length);
            matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
            mesh.instanceMatrix.needsUpdate = true;
            mesh.name = name;
            mesh.frustumCulled = false;
            mesh.userData.world = 'scenery';
            group.add(mesh);
        }
    }

    // The trees and houses of a tile as one group, or null when it has none. `bike` ranks the tile's share of the caps.
    // `markers`: whether its marker stones stand (Scenery.setStones)
    buildTile(tile, cover, buildings, bike, markers = true) {
        return Scenery.drain(this.buildTileSteps(tile, cover, buildings, bike, markers));
    }

    // The same in steps: a house, a row of tree cells, a stretch of marker stones, a tuft's row at a time
    *buildTileSteps(tile, cover, buildings, bike, markers = true) {
        this.disposeTile(tile.key);
        const group = new THREE.Group();
        group.name = `world-scenery-${tile.key}`;
        const rotation = new THREE.Quaternion();
        const up = new THREE.Vector3(0, 1, 0);
        const position = new THREE.Vector3();
        const scale = new THREE.Vector3();
        const held = { trees: 0, house: 0, houseTriangles: 0 };

        // Trees take the triangles the houses leave, nearest first; the houses are the village and come first
        const houseRoom = Math.max(0, Scenery.HOUSE_TRIANGLES - this.houseTriangles);
        const homes = this.set().houses;
        const byHome = new Map();
        const footings = [];
        // The walls of the houses drawn, which the bike cannot ride through (houseAt)
        const standing = [];
        const footingCost = Scenery.FOOTING_TRIANGLES;
        const nearest = buildings.slice().sort((p, q) => Math.hypot(p.x - bike.x, p.z - bike.z) - Math.hypot(q.x - bike.x, q.z - bike.z));
        for (const b of nearest) {
            yield;
            if (Math.hypot(b.x - bike.x, b.z - bike.z) > Scenery.BUILDING_REACH_M) continue;
            if (this.ground.kindAt(b.x, b.z) !== 'runoff') continue;
            // The mapped footprint (b.w across its heading, b.d along it) stays off every road band
            if (this.roads && !this.roads.clearOfRoadBox(b.x, b.z, b.heading, b.d, b.w, Scenery.CLEAR_M.house)) continue;
            // No house stands on drawn water (the mapped footprint, not only its middle)
            if (this.wetUnder(b.x, b.z, b.heading, b.d, b.w)) continue;
            const pose = this.housePose(b, homes[Math.floor(Scenery.hash(Math.round(b.x), Math.round(b.z), 8) * homes.length)]);
            const home = pose.home;
            const cost = Scenery.trianglesOf(home.parts) + footingCost;
            if (this.houseInstances + held.house + home.parts.length > Scenery.BUILDING_CAP || held.houseTriangles + cost > houseRoom) continue;
            // The floor on the highest land under the walls, a footing down to the lowest (Scenery.footing)
            const walls = home.plain ? { x: b.x, z: b.z, heading: b.heading, along: b.d, across: b.w } : Scenery.wallRect(home, b.x, b.z, pose.turn, pose.scale[0], pose.centre);
            const foot = this.footing(walls);
            if (!foot || foot.land.high - foot.land.low > Scenery.FOOTING_MAX_M) continue;
            rotation.setFromAxisAngle(up, pose.turn);
            scale.set(pose.scale[0], pose.scale[1], pose.scale[2]);
            // The model's own middle goes on the middle of the footprint
            position.set(-pose.centre[0] * pose.scale[0], 0, -pose.centre[1] * pose.scale[2]).applyQuaternion(rotation);
            position.x += b.x;
            position.z += b.z;
            position.y = foot.floor;
            const list = byHome.get(home) || [];
            list.push(new THREE.Matrix4().compose(position, rotation, scale));
            byHome.set(home, list);
            footings.push(foot);
            standing.push(walls);
            held.house += home.parts.length;
            held.houseTriangles += cost;
        }
        for (const [home, matrices] of byHome) this.instanced(home.parts, matrices, `houses:${home.name}`, group);
        // The footings of exactly the houses drawn, as one mesh in stone
        if (footings.length) group.add(Scenery.footingMesh(footings, 'houses:footing'));

        // Every tree site of the tile is kept; Scenery.rankTrees chooses the ones drawn, over the whole window, nearest
        // the bike first. (The caps were taken here, in the order the tiles were built: a tile built while the far
        // tiles of the last window still held the caps never had a tree)
        const taken = yield* this.treeSitesSteps(tile, cover);
        for (const site of taken) {
            rotation.setFromAxisAngle(up, site.turn);
            position.set(site.x, site.y - 0.2, site.z);
            scale.set(site.scale * site.width, site.scale, site.scale * site.width);
            site.matrix = new THREE.Matrix4().compose(position, rotation, scale);
            site.cost = Scenery.trianglesOf(Scenery.levelsOf(site.shape).far);
        }
        held.treeSites = taken;
        held.trees = taken.length;

        // Boulders on the rock and scree cells, as many as the cap leaves
        const stones = this.boulderSites(tile, cover).sort((p, q) => Math.hypot(p.x - bike.x, p.z - bike.z) - Math.hypot(q.x - bike.x, q.z - bike.z)).slice(0, Math.max(0, Scenery.BOULDER_CAP - (this.boulderCount || 0)));
        if (stones.length) {
            // The tile's boulders are one of the shapes, by a hash of the tile, each turned and sized its own way: one
            // instanced mesh for the tile, as before (a mesh for each shape put the window over its meshes' margin)
            const matrices = stones.map((b) => {
                rotation.setFromAxisAngle(up, b.turn);
                position.set(b.x, b.y, b.z);
                scale.set(b.size * 1.3, b.size * 0.8, b.size);
                return new THREE.Matrix4().compose(position, rotation, scale);
            });
            const shape = Math.floor(Scenery.hash(tile.tx, tile.tz, 36) * Scenery.BOULDER_SHAPES);
            this.instanced([Scenery.boulderPart(shape)], matrices, 'boulders', group);
        }
        held.boulders = stones.length;
        held.boulderTriangles = stones.length * (stones.length ? Scenery.boulderPart(Math.floor(Scenery.hash(tile.tx, tile.tz, 36) * Scenery.BOULDER_SHAPES)).triangles : 0);

        // The marker stones of this tile, where it is near enough to have them
        held.stoneOn = markers;
        held.stoneSites = markers ? yield* this.plantStonesSteps(tile, group) : null;
        held.stones = 0;

        // The tufts beside the ride, nearest the bike first
        const tufts = (yield* this.tuftSitesSteps(tile)).sort((p, q) => Math.hypot(p.x - bike.x, p.z - bike.z) - Math.hypot(q.x - bike.x, q.z - bike.z)).slice(0, Math.max(0, Math.min(Scenery.TUFTS_PER_TILE, Scenery.TUFT_CAP - (this.tuftCount || 0))));
        if (tufts.length) group.add(Scenery.tuftMesh(tufts));
        held.tufts = tufts.length;

        if (!group.children.length && !taken.length) return null;
        this.boulderCount = (this.boulderCount || 0) + held.boulders;
        this.tuftCount = (this.tuftCount || 0) + held.tufts;
        this.triangles += held.boulderTriangles;
        this.houseInstances += held.house;
        this.houseTriangles += held.houseTriangles;
        this.triangles += held.houseTriangles;
        this.perTile.set(tile.key, { group, walls: standing, ...held });
        // (counts every change of the houses that stand: WorldEnvironment.cameraFaces lists their walls)
        this.stamp = (this.stamp || 0) + 1;
        if (held.stoneSites && held.stoneSites.length) this.rankStones(bike, true);
        if (taken.length) this.rankTrees(bike, true);
        return group;
    }

    // The trees of a list of sites (a tile's `treeSites`) as a group of their own, each shape's at `level`, apart from
    // the forest: what a check of where trees stand reads (tests/helpers/world-clearance-run.js). The caller frees it
    static treeMeshes(sites, level = 'near') {
        const group = new THREE.Group();
        const byShape = new Map();
        for (const site of sites) byShape.set(site.shape, (byShape.get(site.shape) || []).concat(site));
        for (const [shape, list] of byShape) {
            for (const part of Scenery.levelsOf(shape)[level]) {
                const mesh = new THREE.InstancedMesh(part.geometry, part.material, list.length);
                list.forEach((site, i) => mesh.setMatrixAt(i, site.matrix));
                mesh.name = `trees:${shape.name}`;
                group.add(mesh);
            }
        }
        return group;
    }

    // Puts the marker stones of a tile and the kerb course under them into `group`: an instance for every stone of
    // the tile and for every piece of kerb, none of them drawn until Scenery.rankStones chooses. Returns the sites
    // (Scenery.stoneSites), each with its `matrix` and, where the kerb goes on from it, its `kerbMatrix`
    plantStones(tile, group) {
        return Scenery.drain(this.plantStonesSteps(tile, group));
    }

    *plantStonesSteps(tile, group) {
        const sites = yield* this.stoneSitesSteps(tile);
        if (!sites.length) return sites;
        const rotation = new THREE.Quaternion(), position = new THREE.Vector3(), scale = new THREE.Vector3();
        const lean = new THREE.Euler(0, 0, 0, 'YXZ');
        for (const q of sites) {
            rotation.setFromEuler(lean.set(q.lean, q.turn, -q.lean));
            q.matrix = new THREE.Matrix4().compose(position.set(q.x, q.y, q.z), rotation, scale.set(1, 1, 1));
            if (!q.next) continue;
            // The kerb course from the stone to the next of its row, on the ground at the two of them
            const y = q.y + Scenery.STONE_SINK_M, dx = q.next.x - q.x, dy = q.next.y - y, dz = q.next.z - q.z, flat = Math.hypot(dx, dz);
            rotation.setFromEuler(lean.set(-Math.atan2(dy, flat), Math.atan2(dx, dz), 0));
            q.kerbMatrix = new THREE.Matrix4().compose(position.set(q.x + dx / 2, y + dy / 2, q.z + dz / 2), rotation, scale.set(1, 1, Math.hypot(flat, dy)));
        }
        // One mesh for each piece and each link the tile's styles use (EdgeStyles), the stones and the kerbs as before
        for (const piece of new Set(sites.map(q => q.piece))) {
            const part = EdgeStyles.piece(piece);
            this.instanced([part], sites.filter(q => q.piece === piece).map(q => q.matrix), 'stones', group);
            const mesh = group.children[group.children.length - 1];
            Object.assign(mesh.userData, { piece, height: part.height, triangles: part.triangles });
        }
        for (const link of new Set(sites.filter(q => q.next).map(q => q.link))) {
            const part = EdgeStyles.link(link);
            this.instanced([part], sites.filter(q => q.next && q.link === link).map(q => q.kerbMatrix), 'stone-kerbs', group);
            const mesh = group.children[group.children.length - 1];
            Object.assign(mesh.userData, { link, triangles: part.geometry.attributes.position.count / 3 });
        }
        return sites;
    }

    // Chooses the marker stones that are drawn: of the stones of every tile that has them, the STONE_CAP nearest the
    // bike, so a window with more than the cap never leaves out the rows beside the rider. A piece of kerb is drawn
    // from each of the KERB_CAP nearest of them, where the stone at its other end is drawn too. Read again when the
    // tiles change (`force`) and for every STONE_RANK_M the bike moves
    rankStones(bike, force = false) {
        if (!bike) return;
        const last = this.rankBike;
        if (!force && last && Math.hypot(bike.x - last.x, bike.z - last.z) < Scenery.STONE_RANK_M) return;
        this.rankBike = { x: bike.x, z: bike.z };
        // The caps are triangles: STONE_CAP blocks of 10 and KERB_CAP pieces of kerb of 6, whatever the styles drawn
        const far = q => Math.hypot(q.x - bike.x, q.z - bike.z);
        const all = [];
        for (const held of this.perTile.values()) {
            if (!held.stoneSites || !held.stoneSites.length) continue;
            // (the far meshes: a near one is chosen below, and its triangles are not the cap's)
            const meshes = new Map(held.group.children.filter(o => o.name === 'stones' && !o.userData.near).map(o => [o.userData.piece, o]));
            const links = new Map(held.group.children.filter(o => o.name === 'stone-kerbs' && !o.userData.near).map(o => [o.userData.link, o]));
            for (const q of held.stoneSites) all.push({ q, d: far(q), mesh: meshes.get(q.piece), link: q.next ? links.get(q.link) : null, held });
        }
        all.sort((a, b) => a.d - b.d);
        let pieceRoom = Scenery.STONE_CAP * 10, linkRoom = Scenery.KERB_CAP * 6;
        const drawn = new Set();
        for (const e of all) {
            const t = e.mesh ? e.mesh.userData.triangles || 10 : 10;
            if (t > pieceRoom) break;
            pieceRoom -= t;
            drawn.add(e.q);
            e.drawn = true;
        }
        // (a link is drawn only where both its ends are)
        const at = q => `${q.x.toFixed(2)},${q.z.toFixed(2)}`;
        const ends = new Set([...drawn].map(at));
        for (const e of all) {
            if (!e.drawn || !e.link) continue;
            const t = e.link.userData.triangles || 6;
            if (t > linkRoom || !ends.has(at(e.q.next))) continue;
            linkRoom -= t;
            e.linkDrawn = true;
        }
        // The nearest drawn pieces are drawn in their near shapes (EdgeStyles.nearPiece), and a link between two near
        // pieces in its near shape where it has one: a tile's near meshes are in its group only while they draw any
        let near = 0;
        const close = new Set();
        for (const e of all) {
            if (!e.drawn || near >= Scenery.STONE_NEAR_CAP || e.d > Scenery.STONE_NEAR_M) continue;
            e.near = true;
            near++;
            close.add(at(e.q));
        }
        const counts = new Map();
        for (const held of this.perTile.values()) {
            for (const o of held.group.children) if (o.name === 'stones' || o.name === 'stone-kerbs') counts.set(o, 0);
            for (const o of (held.nearEdges || new Map()).values()) counts.set(o, 0);
        }
        this.stoneCount = 0;
        this.kerbCount = 0;
        this.nearStoneCount = 0;
        for (const held of this.perTile.values()) held.stones = 0;
        for (const e of all) {
            if (e.drawn && e.mesh) {
                const mesh = e.near ? this.nearEdge(e.held, 'stones', e.q.piece) : e.mesh;
                const n = counts.get(mesh) || 0;
                mesh.setMatrixAt(n, e.q.matrix);
                counts.set(mesh, n + 1);
                e.held.stones++;
                this.stoneCount++;
                if (e.near) this.nearStoneCount++;
            }
            if (e.linkDrawn) {
                const closeLink = e.near && close.has(at(e.q.next)) && EdgeStyles.nearLink(e.q.link);
                const mesh = closeLink ? this.nearEdge(e.held, 'stone-kerbs', e.q.link) : e.link;
                const k = counts.get(mesh) || 0;
                mesh.setMatrixAt(k, e.q.kerbMatrix);
                counts.set(mesh, k + 1);
                this.kerbCount++;
            }
        }
        for (const [mesh, n] of counts) {
            mesh.count = n;
            mesh.instanceMatrix.needsUpdate = true;
            // A near mesh with nothing to draw leaves its tile's group, so it is not a mesh of the window
            if (mesh.userData.near) {
                if (n && !mesh.parent) mesh.userData.held.group.add(mesh);
                else if (!n && mesh.parent) mesh.parent.remove(mesh);
            }
        }
    }

    // A tile's instanced mesh of the near shape of a piece (`name` 'stones') or a link ('stone-kerbs'), made the first
    // time it is asked for, with room for every site of the tile; named and marked as the far one is, and `near`
    nearEdge(held, name, id) {
        held.nearEdges = held.nearEdges || new Map();
        const key = `${name}:${id}`;
        let mesh = held.nearEdges.get(key);
        if (!mesh) {
            const part = name === 'stones' ? EdgeStyles.nearPiece(id) : EdgeStyles.nearLink(id);
            mesh = new THREE.InstancedMesh(part.geometry, part.material, Math.max(1, held.stoneSites.length));
            mesh.count = 0;
            mesh.name = name;
            mesh.frustumCulled = false;
            Object.assign(mesh.userData, { world: 'scenery', near: true, held, triangles: part.triangles }, name === 'stones' ? { piece: id, height: part.height } : { link: id });
            held.nearEdges.set(key, mesh);
        }
        return mesh;
    }

    // Puts up or takes down the marker stones of a tile whose scenery is drawn. A stone is smaller than a pixel from
    // 700 m, and a whole pass with its hairpins is in the window at once: the stones stand on the tiles nearest the
    // bike only (WorldEnvironment.buildScenery). Returns the meshes it added
    setStones(tile, on, bike) {
        return Scenery.drain(this.setStonesSteps(tile, on, bike));
    }

    *setStonesSteps(tile, on, bike) {
        const held = this.perTile.get(tile.key);
        if (!held || !!held.stoneOn === on) return [];
        held.stoneOn = on;
        const before = held.group.children.length;
        if (on) held.stoneSites = yield* this.plantStonesSteps(tile, held.group);
        else {
            for (const mesh of held.group.children.filter(o => o.name === 'stones' || o.name === 'stone-kerbs')) {
                held.group.remove(mesh);
                mesh.dispose();
            }
            for (const mesh of (held.nearEdges || new Map()).values()) {
                if (mesh.parent) mesh.parent.remove(mesh);
                mesh.dispose();
            }
            held.nearEdges = null;
            held.stoneSites = null;
            held.stones = 0;
        }
        this.rankStones(bike, true);
        return on ? held.group.children.slice(before) : [];
    }

    // The drawn house whose walls (x, z) is in or within `margin` of: its wall rect {x, z, heading, along, across}, or
    // null. Only the houses drawn now count (a house the caps left out is not there to hit). A stopping place's props
    // (PlaceMesh, `props`) are solid the same way, with their `label`
    houseAt(x, z, margin = 0) {
        const prop = this.props ? this.props.at(x, z, margin) : null;
        if (prop) return prop;
        for (const held of this.perTile.values()) {
            for (const w of held.walls || []) {
                const dx = x - w.x, dz = z - w.z;
                if (Math.abs(dx) + Math.abs(dz) > w.along + w.across + 2 * margin) continue;
                const cos = Math.cos(w.heading), sin = Math.sin(w.heading);
                if (Math.abs(dx * cos - dz * sin) <= w.across / 2 + margin && Math.abs(dx * sin + dz * cos) <= w.along / 2 + margin) return w;
            }
        }
        return null;
    }

    // A house model's extent on the ground, measured once: [width (x), depth (z)] and the middle [x, z]
    static footprintOf(home) {
        if (!home.footprint) {
            const box = new THREE.Box3();
            for (const part of home.parts) {
                part.geometry.computeBoundingBox();
                box.union(part.geometry.boundingBox);
            }
            home.footprint = { size: [Math.max(1, box.max.x - box.min.x), Math.max(1, box.max.z - box.min.z)], centre: [(box.min.x + box.max.x) / 2, (box.min.z + box.max.z) / 2] };
        }
        return home.footprint;
    }

    // How a building of the map is drawn: { home, turn, scale [x, y, z], centre [x, z] }. A modelled house stands
    // inside the mapped footprint, turned a quarter when that fills more of it, and never larger than
    // HOUSE_SCALE_MAX; the footprint clears every road band (tools/world/buildings.mjs), so the house does too.
    // A footprint too small for a house at HOUSE_SCALE_MIN (a shed, a garage) is a plain box of its own size.
    housePose(b, home) {
        const plain = this.plain().houses[0];
        if (!home.plain) {
            const { size, centre } = Scenery.footprintOf(home);
            const straight = Math.min(b.w / size[0], b.d / size[1]);
            const turned = Math.min(b.d / size[0], b.w / size[1]);
            const fit = Math.min(Scenery.HOUSE_SCALE_MAX, Math.max(straight, turned));
            if (fit >= Scenery.HOUSE_SCALE_MIN) return { home, turn: b.heading + (turned > straight ? Math.PI / 2 : 0), scale: [fit, fit, fit], centre };
        }
        if (b.kind === Scenery.KIND_WALL) return { home: this.plain().walls[0], turn: b.heading, scale: [b.w, b.h || 3, b.d], centre: [0, 0] };
        return { home: plain, turn: b.heading, scale: [b.w, Scenery.hutHeight(b), b.d], centre: [0, 0] };
    }

    // Frees the instance buffers of a tile's scenery; the shared geometry and materials stay
    disposeTile(key) {
        const held = this.perTile.get(key);
        if (!held) return;
        held.group.traverse(child => {
            if (child.isInstancedMesh) child.dispose();
            else if (child.userData.footings || child.userData.tileOwned) child.geometry.dispose();
        });
        // (the near edge meshes out of the group: theirs is a shared geometry, their instances their own)
        for (const mesh of (held.nearEdges || new Map()).values()) if (!mesh.parent) mesh.dispose();
        if (held.group.parent) held.group.parent.remove(held.group);
        this.houseInstances -= held.house;
        this.houseTriangles -= held.houseTriangles;
        this.triangles -= held.houseTriangles + (held.boulderTriangles || 0);
        this.boulderCount = (this.boulderCount || 0) - (held.boulders || 0);
        this.tuftCount = (this.tuftCount || 0) - (held.tufts || 0);
        this.perTile.delete(key);
        this.stamp = (this.stamp || 0) + 1;
        // The stones it gives up are another tile's to draw
        if (held.stones) this.rankStones(this.rankBike, true);
        if (held.trees) this.rankTrees(this.treeBike, true);
    }

    // The most triangles a tree adds at the near level over its far level, of the shapes loaded (measured once)
    nearExtra() {
        if (this.nearExtraOf === undefined) {
            this.nearExtraOf = 0;
            for (const shape of this.set().trees) {
                const levels = Scenery.levelsOf(shape);
                this.nearExtraOf = Math.max(this.nearExtraOf, Scenery.trianglesOf(levels.near) - Scenery.trianglesOf(levels.far));
            }
        }
        return this.nearExtraOf;
    }

    // A tree's tint, which the game multiplies into its colours (instanceColor): from `light` (0 to 1) darker or
    // lighter, from `cast` (0 to 1) toward blue or yellow. Never over 1 in a channel, so no tree is lifted past its
    // kind's caps (js/world/vegetation.js)
    static treeTint(light, cast) {
        const v = 0.8 + 0.2 * light;
        const shift = 0.07 * (cast - 0.5);
        return [v * (1 - Math.max(0, -shift) * 2), v * (1 - Math.abs(shift) * 0.5), v * (1 - Math.max(0, shift) * 2)];
    }

    // The quality level's trees: the share of the window's trees drawn (the far ones go first) and the most drawn at
    // the near level. Draws them again at once when either changes
    // The stop scene's held shot (Game.raiseShot): the near and mid trees reach further and the window's triangle cap
    // is larger, for a view that holds still; null for the ride's own. Draws the trees again at once
    setShot(shot) {
        this.shot = shot || null;
        this.rankTrees(this.treeBike || this.rankBike, true);
    }

    setTrees(share, near) {
        const s = share === undefined ? 1 : share, n = near === undefined ? Scenery.TREE_NEAR_CAP : Math.min(near, Scenery.TREE_NEAR_CAP);
        if (s === this.treeShare && n === this.treeNear) return;
        this.treeShare = s;
        this.treeNear = n;
        this.rankTrees(this.treeBike || this.rankBike, true);
    }

    // The forest mesh of one part of a shape at a level, made the first time it is asked for, with room for every tree
    // the level can hold
    forestMesh(shape, level, k, part) {
        const key = `${shape.name}:${level}:${k}`;
        let mesh = this.forestMeshes.get(key);
        if (!mesh) {
            const room = level === 'near' ? Scenery.TREE_NEAR_CAP : level === 'mid' ? Scenery.TREE_MID_CAP : Scenery.TREE_CAP;
            mesh = new THREE.InstancedMesh(part.geometry, part.material, room);
            mesh.setColorAt(0, new THREE.Color(1, 1, 1));
            mesh.count = 0;
            mesh.visible = false;
            mesh.name = `trees:${shape.name}:${level}`;
            mesh.frustumCulled = false;
            mesh.userData.world = 'scenery';
            mesh.userData.skipCulling = true;
            mesh.userData.treeLevel = level;
            mesh.userData.drawn = 0;
            this.forestMeshes.set(key, mesh);
            this.forest.add(mesh);
        }
        return mesh;
    }

    // Draws the window's trees, each at its level. Of the trees of every tile, nearest the bike first: the share the
    // quality level draws, at most TREE_CAP, while the triangle cap has room for each at its far level after
    // TREE_NEAR_KEPT near trees' worth of it (the houses, the boulders and the stones come first). Then, out of the
    // room left and nearest first, the trees within TREE_NEAR_M at the near level (treeNear of them at the most) and
    // the next within TREE_MID_M at the mid level (TREE_MID_CAP times the share), the rest far. So the nearest trees are
    // always drawn, and the window never holds more than the cap. Read again when the tiles change and for every
    // TREE_RANK_M the bike moves
    rankTrees(bike, force = false) {
        if (!bike) return;
        const last = this.treeBike;
        if (!force && !this.treesDirty && last && Math.hypot(bike.x - last.x, bike.z - last.z) < Scenery.TREE_RANK_M) return;
        this.treeBike = { x: bike.x, z: bike.z };
        this.treesDirty = false;
        // The tiles nearest first, and their trees until the cap is sure to be among them: a tile whose nearest point
        // is past the furthest tree taken so far, once the cap is reached, holds none of the nearest
        const half = WorldData.TILE_M / 2;
        const tiles = [];
        for (const [key, held] of this.perTile) {
            if (!held.treeSites || !held.treeSites.length) continue;
            const [tx, tz] = key.split(',').map(Number);
            const dx = Math.max(0, Math.abs(bike.x - (tx * WorldData.TILE_M + half)) - half);
            const dz = Math.max(0, Math.abs(bike.z - (tz * WorldData.TILE_M + half)) - half);
            tiles.push({ held, d: Math.hypot(dx, dz) });
        }
        tiles.sort((a, b) => a.d - b.d);
        const all = [];
        let furthest = 0;
        for (const { held, d } of tiles) {
            if (all.length >= Scenery.TREE_CAP && d > furthest) break;
            for (const site of held.treeSites) {
                site.d = Math.hypot(site.x - bike.x, site.z - bike.z);
                furthest = Math.max(furthest, site.d);
                all.push(site);
            }
        }
        all.sort((a, b) => a.d - b.d);
        const others = this.triangles - this.treeTriangles;
        const shot = this.shot || {};
        const cap = Scenery.TRIANGLE_CAP * (shot.triangleScale || 1);
        let room = Math.max(0, cap - others - Scenery.TREE_NEAR_KEPT * this.nearExtra());
        const total = this.perTile.size ? [...this.perTile.values()].reduce((n, held) => n + (held.trees || 0), 0) : 0;
        const want = Math.min(Scenery.TREE_CAP, Math.ceil(total * this.treeShare));
        let drawn = 0;
        let spent = 0;
        while (drawn < want && drawn < all.length && all[drawn].cost <= room) {
            room -= all[drawn].cost;
            spent += all[drawn].cost;
            drawn++;
        }
        room += Scenery.TREE_NEAR_KEPT * this.nearExtra();
        room = Math.min(room, cap - others - spent);
        const most = { near: this.treeNear, mid: Math.round(Scenery.TREE_MID_CAP * this.treeShare) };
        const reach = { near: shot.treeNearM || Scenery.TREE_NEAR_M, mid: shot.treeMidM || Scenery.TREE_MID_M };
        const counts = { near: 0, mid: 0, far: 0 };
        for (const mesh of this.forestMeshes.values()) mesh.userData.drawn = 0;
        const tint = new THREE.Color();
        for (let i = 0; i < drawn; i++) {
            const site = all[i];
            const levels = Scenery.levelsOf(site.shape);
            let level = 'far';
            if (site.shape.lods) {
                for (const up of ['near', 'mid']) {
                    if (counts[up] >= most[up] || site.d > reach[up]) continue;
                    const extra = Scenery.trianglesOf(levels[up]) - site.cost;
                    if (extra > room) continue;
                    room -= extra;
                    spent += extra;
                    level = up;
                    break;
                }
            }
            counts[level]++;
            tint.setRGB(site.tint[0], site.tint[1], site.tint[2]);
            levels[level].forEach((part, k) => {
                const mesh = this.forestMesh(site.shape, level, k, part);
                const n = mesh.userData.drawn++;
                mesh.setMatrixAt(n, site.matrix);
                mesh.setColorAt(n, tint);
            });
        }
        for (const mesh of this.forestMeshes.values()) {
            // (shown or hidden only as it fills or empties: what hides a drawn mesh for a while, as world-quality
            // does to measure the trees, keeps it hidden)
            if ((mesh.count > 0) !== (mesh.userData.drawn > 0)) mesh.visible = mesh.userData.drawn > 0;
            mesh.count = mesh.userData.drawn;
            mesh.instanceMatrix.needsUpdate = true;
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        }
        this.treeCount = drawn;
        this.triangles = others + spent;
        this.treeTriangles = spent;
        this.treeLevelCounts = counts;
    }

    // The chunks of the side roads round the junctions and the landmarks, which the fixtures are placed clear of:
    // WorldEnvironment.load has them before it places the landmarks
    static fixtureChunks(data) {
        const wanted = new Set();
        for (const j of data.junctions || []) for (const k of data.chunksNear(data.nodes.x[j.node], data.nodes.z[j.node], 120)) wanted.add(k);
        for (const l of (data.manifest && data.manifest.landmarks) || []) if (Number.isFinite(l.x)) for (const k of data.chunksNear(l.x, l.z, 250)) wanted.add(k);
        return [...wanted];
    }

    // The height and cover tiles round the landmarks, which a landmark is placed on (dry land, Scenery.landmarkPlace) and
    // seated on (Scenery.footing): WorldEnvironment.load has them before it builds the landmarks
    static fixtureTiles(data) {
        const wanted = new Set();
        const m = WorldData.TILE_M, reach = Scenery.LANDMARK_ALONG_M + Scenery.LANDMARK_OUT_M + 60;
        for (const l of (data.manifest && data.manifest.landmarks) || []) {
            if (!Number.isFinite(l.x) || !Number.isFinite(l.z)) continue;
            for (let tx = Math.floor((l.x - reach) / m); tx <= Math.floor((l.x + reach) / m); tx++) {
                for (let tz = Math.floor((l.z - reach) / m); tz <= Math.floor((l.z + reach) / m); tz++) wanted.add(`${tx},${tz}`);
            }
        }
        return [...wanted].sort();
    }

    // The ground a thing beside the ride stands on at (x, z): the drawn ground there (the verge, the fill beside the
    // road or the land: WorldGround.groundY), or null where there is none to stand on (the tile is not here, a tunnel
    // or a gallery, water). `index` is the ride's point it stands beside, where known. `step` (metres) also leaves out
    // a place whose ground is further than that from the road's own height. One rule for everything placed by the
    // road: a new kind of roadside thing takes its height from here
    footY(x, z, index = null, step = Infinity) {
        if (this.ground.tileHeight(x, z) === null || this.ground.tileZone(x, z) === WorldData.ZONE.water) return null;
        const loc = this.footLoc || (this.footLoc = {});
        const y = this.ground.groundY(x, z, index === null ? null : { start: index - 4, end: index + 4 }, false, loc);
        if (!Number.isFinite(y)) return null;
        if (loc.flags && (loc.flags.tunnel || loc.flags.gallery || (step < Infinity && loc.flags.bridge))) return null;
        return Math.abs(y - loc.roadY) > step ? null : y;
    }

    // Where a marker stone may stand at station k of the ride (the stations are STONE_GAP_M apart from the ride's
    // start) on `side` (the sign of the lateral): a place of Scenery.stoneSpot, or null. It may stand where the drawn
    // ground falls sharply from the edge (STONE_RULE). A station on a hairpin's arc is the hairpin's row's to guard
    stonePlace(k, side) {
        const s = k * Scenery.STONE_GAP_M;
        for (const h of this.hairpins()) if (s >= h.s0 - Scenery.STONE_GAP_M && s <= h.s1 + Scenery.STONE_GAP_M) return null;
        const place = this.stoneSpot(s, side);
        if (!place || !(place.drop > Scenery.STONE_RULE.dropM)) return null;
        place.k = place.seed = k;
        return place;
    }

    // The ride's hairpins (WorldRoute.hairpins); none on a route that cannot tell
    hairpins() {
        const route = this.ground.route;
        return typeof route.hairpins === 'function' ? route.hairpins() : [];
    }

    // Where a marker stone may stand at ride distance s on `side` (the sign of the lateral): {s, side, x, y, z, seat,
    // heading, drop, index}, or null. Nothing else guards the edge there: no bridge, tunnel or gallery, no retaining
    // wall under the edge (its parapet is the guard, or its top is its own row's) and none going on past its end, no stopping place, no roadworks site, no side road within
    // mouthM. `y` is the drawn ground under its middle, within ROADSIDE_STEP_M of the road; `seat` the height it
    // stands at (KERB); `drop` the metres the
    // ground reachM past the verge lies under the road (null where no land is there to read); `index` the ride's row
    // before it
    stoneSpot(s, side) {
        const rule = Scenery.STONE_RULE, ground = this.ground, route = ground.route, points = route.points;
        if (!this.roads || s < 0 || s > route.length || points.length < 2) return null;
        for (const span of this.stoneShut || []) if (s >= span.s0 - rule.worksM && s <= span.s1 + rule.worksM) return null;
        const i = Math.min(points.length - 2, route.indexAt(s));
        // What guards the edge at the rows either side of it, or widens it: a stone is the guard of a bare edge only
        const loc = { lateral: side, t: 0 };
        for (let j = Math.max(0, i - 1); j <= Math.min(points.length - 1, i + 2); j++) {
            const q = points[j];
            if (q.flags && (q.flags.bridge || q.flags.tunnel || q.flags.gallery)) return null;
            if (q[side > 0 ? 'safeP' : 'safeN']) return null;
            loc.index = j;
            loc.flags = q.flags;
            if (ground.bridgeOrDrop(loc, q.width / 2)) return null;
            // (nor beside a wall that goes on past its end, lower, with its coping: WorldEnvironment.taperAt)
            if (typeof ground.taperAt === 'function' && (ground.taperAt(j, side, 0) > 0 || ground.taperAt(j, side, 1) > 0)) return null;
        }
        const p = route.sample(s, this.stoneAt || (this.stoneAt = {}));
        const cos = Math.cos(p.heading), sin = Math.sin(p.heading);
        const edge = p.width / 2 + RoadClearance.verge(), radius = Scenery.STONE_RADIUS_M;
        const o = side * (edge + Scenery.STONE_OUT_M + radius);
        const x = p.x + o * cos, z = p.z - o * sin;
        // Its own strand's edge: a place nearer to another strand of the ride is that strand's to guard
        const near = this.stoneNear || (this.stoneNear = {});
        near.segment = null;
        if (this.roads.clearance(x, z, radius + Scenery.CLEAR_M.stone + 1, null, false, near) < radius + Scenery.CLEAR_M.stone) return null;
        if (!near.segment || near.segment.edgeId !== null || near.segment.place || Math.abs(near.segment.index - i) > 6) return null;
        if (this.roads.clearanceOfSides(x, z, rule.mouthM) < rule.mouthM) return null;
        const y = this.footY(x, z, i, Scenery.ROADSIDE_STEP_M);
        if (y === null) return null;
        // Its seat: the verge's edge beside it, or the ground at its own middle where that is higher
        const brink = side * (edge - 0.1);
        const seat = Math.max(y, ground.groundY(p.x + brink * cos, p.z - brink * sin, { start: i - 4, end: i + 4 }, false, this.stoneLoc || (this.stoneLoc = {})));
        const far = side * (edge + rule.reachM);
        const fx = p.x + far * cos, fz = p.z - far * sin;
        const drop = ground.tileHeight(fx, fz) === null ? null : p.y - ground.groundY(fx, fz, { start: i - 4, end: i + 4 }, false, this.stoneLoc || (this.stoneLoc = {}));
        return { s, side, x, y, z, seat: Number.isFinite(seat) ? seat : y, heading: p.heading, drop, index: i };
    }

    // The stretches of sharp drop on `side` that have a station from k0 to k1: [[place]] (Scenery.stonePlace), each the
    // whole run of stations next to each other where a stone may stand at a drop, read on past k0 and k1 to its ends,
    // at least minM long. A stretch is chosen or not as one (stoneUsed, from its first station)
    stoneStretches(k0, k1, side) {
        return Scenery.drain(this.stoneStretchesSteps(k0, k1, side));
    }

    // The same in steps, a station at a time
    *stoneStretchesSteps(k0, k1, side) {
        const rule = Scenery.STONE_RULE, least = Math.ceil(rule.minM / Scenery.STONE_GAP_M) + 1;
        const last = Math.floor(this.ground.route.length / Scenery.STONE_GAP_M);
        const memo = new Map(), at = k => (memo.has(k) ? memo.get(k) : memo.set(k, k >= 0 && k <= last ? this.stonePlace(k, side) : null).get(k));
        let a = Math.max(0, k0), b = Math.min(last, k1);
        while (a > 0 && at(a) && at(a - 1)) { a--; yield; }
        while (b < last && at(b) && at(b + 1)) { b++; yield; }
        const runs = [];
        let run = [];
        for (let k = a; k <= b + 1; k++) {
            yield;
            const place = k <= b ? at(k) : null;
            if (place) { run.push(place); continue; }
            if (run.length >= least) runs.push(run);
            run = [];
        }
        return runs;
    }

    // Whether a stretch has its stones: a share of them, from its first station and its side, the same on every load
    static stoneUsed(first, side) {
        return Scenery.hash(first, side, 80) < Scenery.STONE_RULE.share;
    }

    // The row round the outside of hairpin `h` (WorldRoute.hairpins): [[place]] (Scenery.stoneSpot, each with `n`, its
    // number in the row), the runs of places next to each other at least minM long at a drop (hairpinDropM),
    // each on a kerb course (`kerb`). The places are STONE_GAP_M apart along the outer edge itself, over the arc, the row in
    // the middle of it: on the centre line of a bend of 6 m the same stones would stand twice as far apart
    hairpinRuns(h) {
        const rule = Scenery.STONE_RULE, gap = Scenery.STONE_GAP_M, route = this.ground.route;
        const side = -h.sign, least = Math.ceil(rule.minM / gap) + 1, at = {};
        // The outer line of the arc, read every quarter metre of the ride: [s, metres along the line]
        const line = [];
        let far = 0, last = null;
        for (let s = h.s0; ; s = Math.min(h.s1, s + 0.25)) {
            const p = route.sample(s, at);
            const o = side * (p.width / 2 + RoadClearance.verge() + Scenery.STONE_OUT_M + Scenery.STONE_RADIUS_M);
            const x = p.x + o * Math.cos(p.heading), z = p.z - o * Math.sin(p.heading);
            if (last) far += Math.hypot(x - last[0], z - last[1]);
            last = [x, z];
            line.push([s, far]);
            if (s >= h.s1) break;
        }
        const count = Math.floor(far / gap) + 1, lead = (far - (count - 1) * gap) / 2;
        const runs = [];
        let run = [], j = 0;
        for (let n = 0; n <= count; n++) {
            let place = null;
            if (n < count) {
                const d = lead + n * gap;
                while (j < line.length - 2 && line[j + 1][1] < d) j++;
                const [s0, d0] = line[j], [s1, d1] = line[j + 1];
                place = this.stoneSpot(s0 + (s1 - s0) * (d1 > d0 ? Math.min(1, Math.max(0, (d - d0) / (d1 - d0))) : 0), side);
            }
            // (a drop, by a stretch's measure and hairpinDropM: a place with level land behind it, or the bank, has
            // nothing to guard)
            if (place && place.drop > rule.hairpinDropM) {
                place.n = n;
                place.seed = 100000 + Math.round(place.s * 8);
                run.push(place);
                continue;
            }
            if (run.length >= least) runs.push(Object.assign(run, { kerb: true }));
            run = [];
        }
        return runs;
    }

    // The rows on the top of the walls under the ride's edge on `side` that have a segment from row i0 to i1:
    // [[place]], each the whole wall read on past i0 and i1 to its ends (WorldGround.wallTop), with its `start` (the
    // metre of its first row) and its rows `a` to `b`. Only a low wall (its face drops less than wallMaxM all along)
    // that holds the road up (wallLowM) and meets no structure has one, and none where a stone would stand in a
    // carriageway, a stopping place, a roadworks site or a side road's mouth: a wall is stoned over all of it or not at
    // all. The stones stand STONE_GAP_M apart along the middle of its coping (RoadMesh.COPING_W_M from its face), the
    // row in the middle of the wall. Whether a wall has them is wallUsed; the parapet gives way to them (wallStoned)
    wallRuns(i0, i1, side) {
        const ground = this.ground, points = ground.route.points;
        if (typeof ground.wallTop !== 'function' || !this.roads) return [];
        const runs = [];
        for (let i = Math.max(0, i0); i <= Math.min(points.length - 2, i1); i++) {
            const span = this.wallSpan(i, side);
            if (!span) continue;
            i = span.b;
            const run = this.wallRow(span);
            if (run) runs.push(run);
        }
        return runs;
    }

    // The whole wall under the ride's edge on `side` that stands from row `index` to the next: {a, b, segs, side} (its first
    // and last rows' segments and each one's WorldGround.wallTop), or null where no wall stands
    wallSpan(index, side) {
        const ground = this.ground, points = ground.route.points;
        if (typeof ground.wallTop !== 'function') return null;
        const top = i => (i >= 0 && i + 1 < points.length ? ground.wallTop(i, side) : null);
        if (!top(index)) return null;
        let a = index, b = index;
        while (top(a - 1)) a--;
        while (top(b + 1)) b++;
        const segs = [];
        for (let j = a; j <= b; j++) segs.push(top(j));
        return { a, b, segs, side };
    }

    // The row on the top of a whole wall (wallSpan): [place] with {start, side, wall, a, b}, or null where the wall
    // cannot carry one
    wallRow(span) {
        const route = this.ground.route, points = route.points, rule = Scenery.STONE_RULE;
        const { a, b, segs, side } = span;
        if (!this.roads || segs.some(t => t.abuts || Math.max(...t.heights) >= rule.wallMaxM || Math.min(...t.heights) < rule.wallLowM)) return null;
        // The middle of the coping, along the wall: its face stands STONE_PROUD_M out from the edge
        const inward = RoadMesh.STONE_PROUD_M - RoadMesh.COPING_W_M / 2;
        const line = [];
        for (const t of segs) {
            const ca = [t.a[0] + t.oa[0] * inward, t.a[1], t.a[2] + t.oa[1] * inward], cb = [t.b[0] + t.ob[0] * inward, t.b[1], t.b[2] + t.ob[1] * inward];
            if (!line.length) line.push({ p: ca, d: 0 });
            line.push({ p: cb, d: line[line.length - 1].d + Math.hypot(cb[0] - ca[0], cb[2] - ca[2]) });
        }
        const far = line[line.length - 1].d, gap = Scenery.STONE_GAP_M;
        if (far < rule.minM) return null;
        const count = Math.floor(far / gap) + 1, lead = (far - (count - 1) * gap) / 2, start = Math.round(points[a].s);
        const run = [];
        for (let n = 0, j = 0; n < count; n++) {
            const d = lead + n * gap;
            while (j < line.length - 2 && line[j + 1].d < d) j++;
            const u = line[j + 1].d > line[j].d ? Math.min(1, Math.max(0, (d - line[j].d) / (line[j + 1].d - line[j].d))) : 0;
            const A = line[j].p, B = line[j + 1].p;
            const x = A[0] + (B[0] - A[0]) * u, y = A[1] + (B[1] - A[1]) * u, z = A[2] + (B[2] - A[2]) * u;
            const own = route.project(x, z, { start: a + j - 4, end: a + j + 5 }, this.stoneLoc || (this.stoneLoc = {}));
            const index = Math.min(points.length - 2, route.indexAt(own.s));
            // (out of the carriageway, a stopping place, a roadworks site and a side road's mouth)
            const clear = Math.abs(own.lateral) - points[index].width / 2 >= Scenery.STONE_RADIUS_M + Scenery.CLEAR_M.stone;
            const shut = (this.stoneShut || []).some(span => own.s >= span.s0 - rule.worksM && own.s <= span.s1 + rule.worksM);
            const stop = points[index][side > 0 ? 'safeP' : 'safeN'] || points[index + 1][side > 0 ? 'safeP' : 'safeN'];
            if (!clear || shut || stop || this.roads.clearanceOfSides(x, z, rule.mouthM) < rule.mouthM) return null;
            run.push({ s: own.s, side, x, y: y + RoadMesh.COPING_UP_M, z, seat: y + RoadMesh.COPING_UP_M, heading: Math.atan2(B[0] - A[0], B[2] - A[2]), index, n, wall: true, seed: 200000 + start * 4 + n, drop: null });
        }
        return run.length ? Object.assign(run, { start, side, wall: true, a, b }) : null;
    }

    // Whether a wall has its row: a share of them, from its first row's metre and its side, the same on every load
    static wallUsed(start, side) {
        return Scenery.hash(start, side, 82) < Scenery.STONE_RULE.wallShare;
    }

    // Whether a hairpin has its row: a share of them, the same on every load
    static hairpinUsed(h) {
        return Scenery.hash(Math.round(h.apex), h.sign, 81) < Scenery.STONE_RULE.hairpinShare;
    }

    // The marker stones of a tile: the stones of every stretch that has them (stoneStretches, stoneUsed), of every
    // hairpin's row that has them (hairpinRuns, hairpinUsed) and of every wall's row that has them (wallRuns,
    // wallUsed) whose place is in the tile. Each stands in the drawn ground at its own place: its foot is
    // STONE_SINK_M under its seat and its root goes on down (STONE_ROOT_M), so no corner hangs over the bank that falls
    // from it; a stone the ground falls more than footM under, from its middle to a corner, is left out, and so is a
    // stone that would then stand alone. A stone on a wall is seated on the wall's coping.
    // [{x, y, z, turn, lean, next, kind}]: `kind` is 'drop', 'hairpin' or 'wall'; `next` is the seat of the stone
    // after it in a hairpin's row, where both stand: the kerb course runs from one to the other
    stoneSites(tile) {
        return Scenery.drain(this.stoneSitesSteps(tile));
    }

    *stoneSitesSteps(tile) {
        const sites = [];
        if (!this.roads) return sites;
        const m = WorldData.TILE_M, points = this.ground.route.points, gap = Scenery.STONE_GAP_M;
        const loc = {}, half = Scenery.STONE_WIDTH_M / 2;
        // The ride's rows near the tile, in spans of rows next to each other
        const spans = [];
        for (let i = 0; i + 1 < points.length; i++) {
            const p = points[i];
            if (Math.abs(p.x - (tile.tx + 0.5) * m) > m / 2 + p.width + 8 || Math.abs(p.z - (tile.tz + 0.5) * m) > m / 2 + p.width + 8) continue;
            const span = spans[spans.length - 1];
            if (span && span[1] === i - 1) span[1] = i; else spans.push([i, i]);
        }
        const runs = [];
        for (const [i0, i1] of spans) {
            for (const side of [Route.RIGHT, Route.LEFT]) {
                for (const run of yield* this.stoneStretchesSteps(Math.floor(points[i0].s / gap), Math.ceil(points[i1 + 1].s / gap), side)) if (Scenery.stoneUsed(run[0].k, side)) runs.push(run);
                for (const run of this.wallRuns(i0, i1, side)) if (Scenery.wallUsed(run.start, side)) runs.push(run);
                yield;
            }
        }
        // A hairpin whose arc has a place in the tile: its ends and its apex are within half its arc of each one
        for (const h of this.hairpins()) {
            yield;
            if (!Scenery.hairpinUsed(h)) continue;
            const p = this.ground.route.sample(h.apex, loc), reach = m / 2 + (h.s1 - h.s0) / 2 + p.width + 8;
            if (Math.abs(p.x - (tile.tx + 0.5) * m) <= reach && Math.abs(p.z - (tile.tz + 0.5) * m) <= reach) runs.push(...this.hairpinRuns(h).map(run => Object.assign(run, { hairpin: h })));
        }
        const inTile = q => Math.floor(q.x / m) === tile.tx && Math.floor(q.z / m) === tile.tz;
        // (a run read from two spans of rows is one run)
        const taken = new Set();
        // A sawn block stands square to its kerb, a little off it
        const stand = (q) => {
            const turn = q.heading + (Scenery.hash(q.seed, q.side, 41) - 0.5) * 0.12;
            // (on a wall's coping the stone is seated on stone)
            if (q.wall) return { x: q.x, y: q.seat - Scenery.STONE_SINK_M, z: q.z, s: q.s, turn, lean: 0, next: null, kind: 'wall' };
            let low = q.y;
            for (const [a, c] of [[-half, -half], [half, -half], [half, half], [-half, half]]) {
                const x = q.x + a * Math.cos(turn) + c * Math.sin(turn), z = q.z - a * Math.sin(turn) + c * Math.cos(turn);
                if (this.ground.tileHeight(x, z) !== null) low = Math.min(low, this.ground.groundY(x, z, { start: q.index - 4, end: q.index + 4 }, false, loc));
            }
            if (q.y - low > Scenery.STONE_RULE.footM) return null;
            return { x: q.x, y: q.seat - Scenery.STONE_SINK_M, z: q.z, s: q.s, turn, lean: (Scenery.hash(q.seed, q.side, 42) - 0.5) * 0.04, next: null, kind: q.n === undefined ? 'drop' : 'hairpin' };
        };
        for (const run of runs) {
            yield;
            const id = `${run[0].side}:${run[0].x.toFixed(2)},${run[0].z.toFixed(2)}`;
            if (taken.has(id) || !run.some(inTile)) continue;
            taken.add(id);
            // The run's style (EdgeStyles.pick): one for the whole stretch, row or wall
            const S = EdgeStyles.STYLES[this.edgeStyle(run)];
            if (!S.piece) continue;
            const P = EdgeStyles.PIECES[S.piece];
            const stood = [];
            for (let i = 0; i < run.length; i++) {
                stood.push(stand(run[i], i, run));
                yield;
            }
            // No stone stands alone: one whose neighbours are both left out goes with them
            const stones = stood.map((q, i) => (q && (stood[i - 1] || stood[i + 1]) ? q : null));
            // One piece in every step stations, counted from the run's start: the first of them the ground has room for
            const kept = stones.map((q, i) => {
                if (!q) return null;
                const from = i - i % S.step;
                for (let j = from; j < i; j++) if (stones[j]) return null;
                return q;
            });
            run.forEach((q, i) => {
                if (!kept[i] || !inTile(q)) return;
                const site = kept[i];
                site.style = run.style;
                site.piece = S.piece;
                site.height = P.size[1];
                // The link from a piece to the next kept one of its run, where the style has one
                const j = kept.findIndex((x, n) => n > i && x);
                if (S.link && j > 0 && j - i <= S.step) {
                    site.next = { x: run[j].x, y: run[j].seat, z: run[j].z };
                    site.link = S.link;
                }
                sites.push(site);
            });
        }
        return sites;
    }

    // The style of a run (EdgeStyles.pick), kept on it: its edge (a hairpin's row, a wall's top, else a drop), its
    // place for the region rule (the world's LV95 origin from its manifest; a world with none has the alpine mix) and
    // its own seed: a hairpin's (so its whole row is one style), a wall's first row, a stretch's first station
    edgeStyle(run) {
        if (run.style) return run.style;
        const first = run[0];
        const edge = run.hairpin ? 'hairpin' : first.wall ? 'wall' : 'drop';
        const origin = this.data && this.data.manifest && this.data.manifest.origin;
        const at = origin ? EdgeStyles.latLon(origin, first.x, first.z) : null;
        const seed = run.hairpin ? Scenery.hash(Math.round(run.hairpin.apex), run.hairpin.sign, 92)
            : edge === 'wall' ? Scenery.hash(run.start || 0, first.side, 93) : Scenery.hash(first.k === undefined ? Math.round(first.s || 0) : first.k, first.side, 94);
        let style = EdgeStyles.pick(edge, at, seed);
        // A stoned wall has lost its parapet (WorldEnvironment.wallStoned): something of Scenery's stands on it
        if (edge === 'wall' && !EdgeStyles.STYLES[style].piece) style = EdgeStyles.pick(edge, null, seed);
        run.style = style;
        return style;
    }

    // A marker stone: a sawn granite block, STONE_HEIGHT_M over its seat and STONE_ROOT_M on under it. It has no
    // underside (in the ground): 10 triangles
    static stonePart() {
        if (!Scenery.stone) {
            const out = { positions: [], shades: [] };
            // RoadMesh.box lays the underside last: 18 numbers a face
            const root = Scenery.STONE_ROOT_M, top = Scenery.STONE_SINK_M + Scenery.STONE_HEIGHT_M;
            RoadMesh.box(out, 0, (top - root) / 2, 0, Scenery.STONE_WIDTH_M, top + root, Scenery.STONE_WIDTH_M, 0, Scenery.STONE_COLORS.block);
            out.positions.length -= 18;
            out.shades.length -= 18;
            Scenery.stone = { geometry: RoadMesh.geometry(out.positions, out.shades), material: new THREE.MeshLambertMaterial({ vertexColors: true }) };
        }
        return Scenery.stone;
    }

    // A metre of the kerb course under a row of stones, along z from one stone to the next (an instance is as long as
    // its two stones are apart): the top and the two sides, no ends (each is under a stone) and no underside, 6 triangles
    static kerbPart() {
        if (!Scenery.kerb) {
            const out = { positions: [], shades: [] };
            const K = Scenery.KERB;
            // RoadMesh.box lays the two ends first and the underside last
            RoadMesh.box(out, 0, (K.proudM - K.rootM) / 2, 0, K.widthM, K.proudM + K.rootM, 1, 0, Scenery.STONE_COLORS.kerb);
            const positions = out.positions.slice(36, -18), shades = out.shades.slice(36, -18);
            Scenery.kerb = { geometry: RoadMesh.geometry(positions, shades), material: RoadMesh.stoneMaterial() };
        }
        return Scenery.kerb;
    }

    // Tuft sites of a tile: [{x, y, z, size, turn, green}], TUFT_TRIES places for each side of each point of the ride
    // in the tile, a TUFT_SHARE of them taken, out to TUFT_REACH_M past the verge, clear of every road band, each on
    // the drawn ground at its own place (Scenery.footY)
    tuftSites(tile) {
        return Scenery.drain(this.tuftSitesSteps(tile));
    }

    // The same in steps, a point of the ride at a time
    *tuftSitesSteps(tile) {
        const sites = [];
        if (!this.roads) return sites;
        const m = WorldData.TILE_M, points = this.ground.route.points;
        const inTile = (x, z) => Math.floor(x / m) === tile.tx && Math.floor(z / m) === tile.tz;
        const reach = Scenery.TUFT_REACH_M, near = {};
        for (let i = 0; i + 1 < points.length; i++) {
            const p = points[i];
            // A tuft of this point lies within the reach and one spacing of it
            if (Math.abs(p.x - (tile.tx + 0.5) * m) > m / 2 + reach + p.width + 8 || Math.abs(p.z - (tile.tz + 0.5) * m) > m / 2 + reach + p.width + 8) continue;
            yield;
            const q = points[i + 1];
            for (const side of [-1, 1]) {
                for (let k = 0; k < Scenery.TUFT_TRIES; k++) {
                    const salt = (side + 1) * 8 + k;
                    if (Scenery.hash(i, salt, 51) >= Scenery.TUFT_SHARE) continue;
                    const along = Scenery.hash(i, salt, 52);
                    const green = Scenery.hash(i, salt, 56) < 0.3, size = 0.7 + 0.6 * Scenery.hash(i, salt, 54);
                    // The whole tuft keeps clear, to the corners of the square round its top
                    const least = Scenery.CLEAR_M.tuft + Scenery.tuftRadius(green, size) * Math.SQRT2;
                    const out = side * (p.width / 2 + RoadClearance.verge() + least + Scenery.hash(i, salt, 53) ** 1.5 * (reach - least));
                    const x = p.x + (q.x - p.x) * along + out * Math.cos(p.heading), z = p.z + (q.z - p.z) * along - out * Math.sin(p.heading);
                    if (!inTile(x, z)) continue;
                    // Another strand of the ride or a side road may lie nearer: the ground there is that road's to
                    // give (its fill may lie over this one's), so the place is left to it
                    near.segment = null;
                    const past = this.roads.clearance(x, z, reach + 1, null, false, near);
                    if (past < least || !near.segment || near.segment.edgeId !== null || Math.abs(near.segment.index - i) > 6) continue;
                    if (this.ground.kindAt(x, z) === 'road') continue;
                    const y = this.footY(x, z, near.segment.index);
                    if (y === null) continue;
                    sites.push({ x, y: y - Scenery.TUFT_SINK_M, z, size, turn: Scenery.hash(i, salt, 55) * Math.PI, green });
                }
            }
        }
        return sites;
    }

    // Half the width of a tuft's top, its widest part
    static tuftRadius(green, size) { return (green ? 0.42 : 0.3) * size; }
    static tuftHeight(green, size) { return (green ? 0.28 : 0.7) * size; }

    // The tufts of a tile as one mesh (no instances: the window's instance budget is the trees'). A tussock is a
    // spray of four pointed blades of dry grass leaning out from its foot, each its own length and lean (4 triangles);
    // a green clump is a rosette of three broad leaves, each folded on its midrib and lifted at its tip (6). Two crossed
    // cards (4) read as a green cross from the saddle. Colours from the photos: pale straw over a darker foot, and the
    // dull green of the low broad-leaved plants, dark at the heart and lighter at the tips
    static tuftMesh(sites) {
        const out = { positions: [], shades: [] };
        const foot = [0.42, 0.39, 0.25], straw = [0.68, 0.62, 0.44], pale = [0.62, 0.58, 0.4];
        const heart = [0.12, 0.16, 0.09], leaf = [0.2, 0.28, 0.15], tip = [0.24, 0.32, 0.17];
        const tri = (a, b, c, ka, kb, kc) => { out.positions.push(...a, ...b, ...c); out.shades.push(...ka, ...kb, ...kc); };
        for (const t of sites) {
            const reach = Scenery.tuftRadius(t.green, t.size), h = Scenery.tuftHeight(t.green, t.size);
            // Each tuft's own uneven leaves and blades, from its turn (no draw of its own)
            const jit = k => 0.5 + 0.5 * Math.sin(t.turn * 7.3 + k * 2.39);
            if (t.green) {
                for (let k = 0; k < 3; k++) {
                    const a = t.turn + k * Math.PI * 2 / 3 + 0.4 * (jit(k) - 0.5), cos = Math.cos(a), sin = Math.sin(a);
                    const long = reach * (0.6 + 0.3 * jit(k + 5)), w = long * 0.75, up = h * (0.7 + 0.3 * jit(k + 9));
                    const base = [t.x + cos * 0.03, t.y, t.z + sin * 0.03];
                    const end = [t.x + cos * long, t.y + up, t.z + sin * long];
                    // The midrib is the fold: the leaf's edges stand a little lower than it
                    const mx = t.x + cos * long * 0.5, mz = t.z + sin * long * 0.5, my = t.y + up * 0.55;
                    const left = [mx - sin * w / 2, my - w * 0.25, mz + cos * w / 2], right = [mx + sin * w / 2, my - w * 0.25, mz - cos * w / 2];
                    tri(base, left, end, heart, leaf, tip);
                    tri(base, end, right, heart, tip, leaf);
                }
                continue;
            }
            for (let k = 0; k < 4; k++) {
                const a = t.turn + k * Math.PI * 2 / 4 + 0.5 * (jit(k) - 0.5), cos = Math.cos(a), sin = Math.sin(a);
                // Uneven, so no two blades stand alike: the tallest nearly upright, the others lower and further out
                const lean = (k + jit(k)) / 4, out_ = reach * (0.25 + 0.75 * lean), up = h * (1 - 0.5 * lean) * (0.85 + 0.15 * jit(k + 3)), w = 0.07 * t.size;
                const bx = t.x + cos * 0.04 * t.size, bz = t.z + sin * 0.04 * t.size;
                tri([bx + sin * w, t.y, bz - cos * w], [bx - sin * w, t.y, bz + cos * w], [t.x + cos * out_, t.y + up, t.z + sin * out_], foot, foot, k % 2 ? straw : pale);
            }
        }
        if (!Scenery.tuftMaterial) Scenery.tuftMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(RoadMesh.geometry(out.positions, out.shades), Scenery.tuftMaterial);
        mesh.name = 'tufts';
        mesh.userData.world = 'scenery';
        mesh.userData.tileOwned = true;
        // Each tuft's place and size, for whatever measures the scenery thing by thing
        mesh.userData.tufts = sites.map(t => ({ x: t.x, y: t.y, z: t.z, green: t.green, radius: Scenery.tuftRadius(t.green, t.size), height: Scenery.tuftHeight(t.green, t.size) }));
        return mesh;
    }

    // Where a gate frame is drawn for a gate at ride distance s: s itself, or the nearest s within GATE_SHIFT_M (ahead
    // first) where both posts (`out(sample)` metres either side of the centre line) stand clear of every side road; the
    // ride's own band reaches them by design (they stand on its verge). The timing line stays at s; only the frame moves.
    gateS(s, out, route) {
        if (!this.roads) return s;
        const p = {};
        const clearAt = (at) => {
            route.sample(at, p);
            const o = out(p);
            for (const side of [-1, 1]) {
                const x = p.x + side * o * Math.cos(p.heading), z = p.z - side * o * Math.sin(p.heading);
                if (this.roads.clearanceOfSides(x, z, 3) < 0.3) return false;
            }
            return true;
        };
        if (clearAt(s)) return s;
        for (let d = 1; d <= Scenery.GATE_SHIFT_M; d++) {
            for (const at of [s + d, s - d]) if (at >= 0 && at <= route.length && clearAt(at)) return at;
        }
        return s;
    }

    // Where a landmark stands: { x, z, yaw, rect }, its front (the model's -z) facing the ride, its walls `rect`
    // (Scenery.wallRect). Places are tried beside the ride up to LANDMARK_ALONG_M either way of its s and out to
    // LANDMARK_OUT_M past the road; a place counts when the whole plan box, turned as it is drawn, keeps CLEAR_M.landmark
    // of every road band and no part of it stands on drawn water (Scenery.wetUnder). Of those, the one nearest the
    // landmark's mapped point (x, z; else the ride at its s) is taken. null when nowhere near is clear and dry.
    landmarkPlace(l, route, shape = null) {
        const margin = Scenery.CLEAR_M.landmark;
        // The model's own plan where it is loaded, else the size landmarks.json gives
        let plan = { width: l.size[0], depth: l.size[2], centre: [0, 0] };
        if (shape) {
            const box = new THREE.Box3();
            for (const part of shape.parts) { part.geometry.computeBoundingBox(); box.union(part.geometry.boundingBox); }
            if (!box.isEmpty()) plan = { width: Math.max(box.max.x - box.min.x, 1), depth: Math.max(box.max.z - box.min.z, 1), centre: [(box.min.x + box.max.x) / 2, (box.min.z + box.max.z) / 2] };
        }
        const road = route.sample(Math.max(0, Math.min(route.length, l.s)), {});
        const anchor = Number.isFinite(l.x) && Number.isFinite(l.z) ? { x: l.x, z: l.z } : { x: road.x, z: road.z };
        const sample = {};
        const tried = [];
        const step = 5;
        for (let along = -Scenery.LANDMARK_ALONG_M; along <= Scenery.LANDMARK_ALONG_M; along += step) {
            const s = l.s + along;
            if (s < 0 || s > route.length) continue;
            route.sample(s, sample);
            const base = sample.width / 2 + RoadClearance.verge() + margin + plan.depth / 2;
            for (let extra = 0; extra <= Scenery.LANDMARK_OUT_M; extra += 2) {
                for (const side of [-1, 1]) {
                    const out = side * (base + extra);
                    const x = sample.x + out * Math.cos(sample.heading), z = sample.z - out * Math.sin(sample.heading);
                    tried.push({ x, z, rx: sample.x, rz: sample.z, d: Math.hypot(x - anchor.x, z - anchor.z) });
                }
            }
        }
        // Nearest the mapped point first; ties in the order they were made, so the choice is the same every time
        tried.forEach((t, k) => { t.k = k; });
        tried.sort((p, q) => p.d - q.d || p.k - q.k);
        // A place whose land is not resident (no tile is drawn there) is taken only when no place on drawn land is clear;
        // of the places on drawn land, the nearest whose land rises no more than LANDMARK_RISE_M under its walls, else the
        // one that rises least
        let landless = null, steep = null;
        for (const t of tried) {
            const yaw = Math.atan2(-(t.rx - t.x), -(t.rz - t.z));
            // The plan box is centred on the place: the model's own middle is moved onto it (Scenery.landmarks)
            if (this.roads && !this.roads.clearOfRoadBox(t.x, t.z, yaw, plan.depth, plan.width, margin)) continue;
            if (this.wetUnder(t.x, t.z, yaw, plan.depth, plan.width)) continue;
            const cos = Math.cos(yaw), sin = Math.sin(yaw);
            const x = t.x - (plan.centre[0] * cos + plan.centre[1] * sin), z = t.z - (-plan.centre[0] * sin + plan.centre[1] * cos);
            const rect = shape ? Scenery.wallRect(shape, x, z, yaw, 1, [0, 0]) : { x: t.x, z: t.z, heading: yaw, along: plan.depth, across: plan.width };
            const place = { x, z, yaw, rect, y: road.y };
            const land = this.seat(rect.x, rect.z, rect.heading, rect.along, rect.across);
            if (!land) {
                if (!landless) landless = place;
                continue;
            }
            const rise = land.high - land.low;
            if (rise <= Scenery.LANDMARK_RISE_M) return place;
            if (!steep || rise < steep.rise) steep = { place, rise };
        }
        return steep ? steep.place : landless;
    }

    // The landmark models of a manifest ({name, asset} with asset a .glb in assets/), loaded once: asset -> model
    static async loadLandmarks(list, loadModel) {
        const out = new Map();
        for (const asset of [...new Set(list.map(l => l.asset))]) {
            try {
                // A world copy of its materials, which take the haze (LandShade.adopt); the legs' copy never does
                out.set(asset, LandShade.adoptModel(await loadModel(asset)));
            } catch (error) {
                console.warn(`world landmark model ${asset} unavailable (${error.message}); left out`);
            }
        }
        return out;
    }

    // The landmarks of landmarks.json, each its model (Scenery.loadLandmarks, held in `landmarkModels`) beside the ride
    // on dry land clear of every road (Scenery.landmarkPlace): [{name, asset, size, s, x, z}]. Its front (the model's -z)
    // faces the ride; it meets the land as a house does (Scenery.footing): its floor on the highest land under its
    // walls, a stone footing down to the lowest. A landmark with no model is left out: there is no placeholder
    landmarks(list, route) {
        const group = new THREE.Group();
        group.name = 'world-landmarks';
        for (const l of list) {
            const model = this.landmarkModels ? this.landmarkModels.get(l.asset) : null;
            if (!model || !l.size) {
                console.warn(`world landmark ${l.name}: no model for ${l.asset}; left out`);
                continue;
            }
            const parts = [];
            for (const [name, list] of model.meshes) if (!name.includes(':')) parts.push(...list);
            const shape = { parts };
            const place = this.landmarkPlace(l, route, shape);
            if (!place) {
                console.warn(`world landmark ${l.name}: no dry place clear of the roads near s ${l.s}; left out`);
                continue;
            }
            const foot = this.footing(place.rect);
            const node = new THREE.Group();
            node.name = `landmark:${l.name}`;
            for (const part of parts) {
                const mesh = new THREE.Mesh(part.geometry, part.material);
                mesh.name = `landmark:${l.name}`;
                mesh.receiveShadow = true;
                mesh.userData.world = 'landmark';
                node.add(mesh);
            }
            node.position.set(place.x, foot ? foot.floor : place.y, place.z);
            node.rotation.y = place.yaw;
            group.add(node);
            if (foot) {
                const mesh = Scenery.footingMesh([foot], `landmark:${l.name}:footing`);
                mesh.userData.world = 'landmark';
                group.add(mesh);
            }
        }
        return group;
    }
}
