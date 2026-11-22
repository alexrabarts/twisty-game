// WorldGround: the Ground interface (js/world/ground.js) over the world's
// height tiles. The physics asks it where the road and the land are; it never
// returns undefined or NaN:
//   - inside the road band of the located ride station the height is the
//     route surface, and in a tunnel the route surface wins out to the wall
//   - on a side road (a stub or a side edge in residence) the edge's own
//     samples win inside that edge's band
//   - elsewhere it is the height of the 512 m / 8 m tile on its drawn triangles, then the
//     100 m far grid, then the route height under the nearest ride sample
// The zone beside the road is the tile's zone layer (road, bench, wall, drop,
// water, terrain), and any active barrier box beats it with `wall`.
//
// A "located point" (`loc`) is {index, lateral, roadY, along, x, z}: the same
// shape Terrain.locate fills for a leg. zoneAt() is given only index and
// lateral (the vehicle's `located`), so the point is rebuilt from them.
class WorldGround extends Ground {
    // What the bike's run-off physics reads (Terrain's RUNOFF for a leg)
    static get RUNOFF() { return Object.freeze({ drag: 0.35, grip: 0.5, floorSpeed: 6 }); }

    // Metres of bench beside the road band that the importer carves flat
    static get BENCH_M() { return 2; }

    // Metres a barrier box reaches along the road, and beyond the road edge across it. The box is what RoadMesh draws
    // (placeBarriers spans barrierHalf each side), so the bike stops at the barrier it sees: the drawn barrier is a
    // fence of a few centimetres, and the box reaches half a metre along the road either side of it (1.2 m stopped the
    // bike over a metre short of the fence), enough that a bike under 60 m/s cannot step through it in one frame
    static get BARRIER_DEPTH_M() { return 0.5; }
    static get BARRIER_MARGIN_M() { return 1.5; }

    // Metres from a barrier's centre to each end of it, drawn and solid: the side road's half width and the margin
    static barrierHalf(width) {
        return Math.max(3, width / 2 + WorldGround.BARRIER_MARGIN_M);
    }

    // Metres past the road edge that a bridge parapet stands (RoadMesh draws it there)
    static get PARAPET_M() { return 0.35; }

    // Metres a fall below the road ends
    static get FALL_M() { return 30; }

    static get SIDE_HASH_M() { return 16; }

    constructor(route, data) {
        super();
        this.route = route;
        this.data = data;
        this.barriers = [];
        this.sideHash = new Map();
        this.sideSegments = [];
        this.scratch = {};
        this.wallSide = Object.freeze({ flat: 0, runoff: null, lipDepth: 8 });
        this.roadSide = Object.freeze({ flat: 0, runoff: null, lipDepth: 8 });
        this.benchSide = Object.freeze({ flat: WorldGround.BENCH_M, runoff: null, lipDepth: 8 });
        this.openSide = Object.freeze({ flat: WorldGround.BENCH_M, runoff: WorldGround.RUNOFF, lipDepth: 8 });
    }

    // The barrier boxes in force: [{x, z, heading, width}]
    setBarriers(list) {
        this.barriers = list.map(b => ({ x: b.x, z: b.z, sin: Math.sin(b.heading), cos: Math.cos(b.heading), half: WorldGround.barrierHalf(b.width) }));
    }

    // Side roads in residence: [{x, z, y, width}] typed arrays per edge. They give the height and the road zone inside their band.
    setSideEdges(edges) {
        this.sideHash = new Map();
        this.sideSegments = [];
        const cell = WorldGround.SIDE_HASH_M;
        for (const e of edges) {
            for (let i = 0; i + 1 < e.x.length; i++) {
                const reach = Math.max(e.width[i], e.width[i + 1]) / 2 + 1;
                const ref = this.sideSegments.length;
                this.sideSegments.push({ x0: e.x[i], z0: e.z[i], y0: e.y[i], x1: e.x[i + 1], z1: e.z[i + 1], y1: e.y[i + 1], w0: e.width[i], w1: e.width[i + 1] });
                const x0 = Math.floor((Math.min(e.x[i], e.x[i + 1]) - reach) / cell), x1 = Math.floor((Math.max(e.x[i], e.x[i + 1]) + reach) / cell);
                const z0 = Math.floor((Math.min(e.z[i], e.z[i + 1]) - reach) / cell), z1 = Math.floor((Math.max(e.z[i], e.z[i + 1]) + reach) / cell);
                for (let cx = x0; cx <= x1; cx++) {
                    for (let cz = z0; cz <= z1; cz++) {
                        const key = cx * 65536 + cz;
                        let list = this.sideHash.get(key);
                        if (!list) this.sideHash.set(key, (list = []));
                        list.push(ref);
                    }
                }
            }
        }
    }

    // The road height of a side road whose band holds (x, z), or null
    sideRoadY(x, z) {
        if (!this.sideSegments.length) return null;
        const list = this.sideHash.get(Math.floor(x / WorldGround.SIDE_HASH_M) * 65536 + Math.floor(z / WorldGround.SIDE_HASH_M));
        if (!list) return null;
        let best = null;
        let bestD = Infinity;
        for (const ref of list) {
            const g = this.sideSegments[ref];
            const dx = g.x1 - g.x0, dz = g.z1 - g.z0;
            const run = dx * dx + dz * dz;
            const t = run === 0 ? 0 : Math.max(0, Math.min(1, ((x - g.x0) * dx + (z - g.z0) * dz) / run));
            const d = Math.hypot(g.x0 + dx * t - x, g.z0 + dz * t - z);
            if (d <= (g.w0 + (g.w1 - g.w0) * t) / 2 && d < bestD) {
                bestD = d;
                best = g.y0 + (g.y1 - g.y0) * t;
            }
        }
        return best;
    }

    // Tile height at (x, z) on the drawn triangles (cut to the retaining walls where `cutsOf(key)` gives a tile's cuts,
    // WorldEnvironment.cutsOf), or null while the tile is not resident
    // `cut: false` reads the nodes' own triangles
    tileHeight(x, z, cut = true) {
        const m = WorldData.TILE_M;
        const key = `${Math.floor(x / m)},${Math.floor(z / m)}`;
        const tile = this.data.tile(key);
        if (!tile) return null;
        return TerrainMesh.heightAt(tile, x, z, cut && this.cutsOf ? this.cutsOf(key) : null);
    }

    // Zone code at (x, z): the nearest node of the tile's zone layer; terrain where the tile is missing
    tileZone(x, z) {
        const m = WorldData.TILE_M;
        const tx = Math.floor(x / m), tz = Math.floor(z / m);
        const tile = this.data.tile(`${tx},${tz}`);
        if (!tile) return WorldData.ZONE.terrain;
        const n = WorldData.TILE_N;
        const i = Math.max(0, Math.min(n - 1, Math.round((x - tx * m) / WorldData.CELL_M)));
        const j = Math.max(0, Math.min(n - 1, Math.round((z - tz * m) / WorldData.CELL_M)));
        return tile.zones[j * n + i];
    }

    // The land cover class at (x, z) (WorldPhysics.landCover; tools/world/landcover.mjs COVER): the cell of the
    // tile's cover grid that colours the land there (TerrainMesh.colorAt), 0 where the tile or its cover is not held
    coverAt(x, z) {
        const m = WorldData.TILE_M, n = WorldData.COVER_N;
        const tx = Math.floor(x / m), tz = Math.floor(z / m);
        const cover = this.data.cover ? this.data.cover(`${tx},${tz}`) : null;
        if (!cover) return 0;
        const i = Math.max(0, Math.min(n - 1, Math.floor((x - tx * m) / (m / n))));
        const j = Math.max(0, Math.min(n - 1, Math.floor((z - tz * m) / (m / n))));
        return cover[j * n + i] || 0;
    }

    // Whether the world has (x, z) in detail: a height tile of its data covers it (held or not yet). Past them the
    // land is the far grid's
    mapped(x, z) {
        const m = WorldData.TILE_M;
        return typeof this.data.hasTile !== 'function' || this.data.hasTile(`${Math.floor(x / m)},${Math.floor(z / m)}`);
    }

    // The land's height at (x, z) away from the road band; `fallbackY` is the route height to fall back on
    landY(x, z, fallbackY) {
        const tile = this.tileHeight(x, z);
        if (tile !== null && Number.isFinite(tile)) return tile;
        const far = this.data.farHeight(x, z);
        return far !== null && Number.isFinite(far) ? far : fallbackY;
    }

    // The point beside a ride sample at a signed lateral
    static pointAt(point, lateral, out) {
        out.x = point.x + lateral * Math.cos(point.heading);
        out.z = point.z - lateral * Math.sin(point.heading);
        return out;
    }

    inBarrier(x, z) {
        return this.barrierAt(x, z) !== null;
    }

    // The barrier box (x, z) is in, or null
    barrierAt(x, z) {
        for (const b of this.barriers) {
            const dx = x - b.x, dz = z - b.z;
            const along = dx * b.sin + dz * b.cos;
            const across = dx * b.cos - dz * b.sin;
            if (Math.abs(along) <= WorldGround.BARRIER_DEPTH_M && Math.abs(across) <= b.half) return b;
        }
        return null;
    }

    locate(x, z, hint, out = {}) {
        const last = this.route.points.length - 2;
        const start = Math.max(0, Math.min(last, Math.floor(hint ? hint.start : 0)));
        const end = Math.max(start, Math.min(last, Math.ceil(hint ? hint.end : last)));
        this.route.nearestSegment(x, z, start, end, this.scratch);
        const found = this.scratch;
        out.index = found.index;
        out.x = x;
        out.z = z;
        out.roadY = found.y;
        out.lateral = found.lateral;
        out.along = (x - found.x) * Math.sin(found.heading) + (z - found.z) * Math.cos(found.heading);
        // The share of the way from row `index` to the next (the ribbon is drawn linear between its rows)
        out.t = found.along;
        out.width = found.width;
        out.flags = this.route.points[found.index].flags;
        return out;
    }

    halfRoad(loc) {
        const point = this.route.points[Math.max(0, Math.min(this.route.points.length - 1, loc.index))];
        return point.width / 2;
    }

    // The verge's width on the `sign` side of the ride between row `index` and the next, at share `t`: the drawn verge
    // (RoadSurface.VERGE_M), and a stopping place's hard standing where the ride has one (WorldPlaces: padN, padP).
    // `safe` reads every place, drawn or not (safeN, safeP): what the bike's surface rule calls the verge
    vergeAt(index, sign, t = 0, safe = false) {
        const points = this.route.points;
        const i = Math.max(0, Math.min(points.length - 1, index));
        const a = points[i], b = points[Math.min(points.length - 1, i + 1)];
        const key = safe ? (sign > 0 ? 'safeP' : 'safeN') : sign > 0 ? 'padP' : 'padN';
        const pa = a[key] || 0, pb = b[key] || 0;
        return RoadSurface.VERGE_M + (pa || pb ? pa + (pb - pa) * Math.max(0, Math.min(1, t || 0)) : 0);
    }

    groundY(x, z, hint, exact = false, loc = {}) {
        this.locate(x, z, hint, loc);
        return this.heightAt(loc, exact);
    }

    // `lift` is added where the answer is a road's ribbon or its verge (a side road's too): RoadMesh.LIFT_M gives the
    // surface as it is drawn (WorldGround.drawnY), 0 the height the physics rides
    heightAt(loc, exact = false, lift = 0) {
        const half = loc.width !== undefined ? loc.width / 2 : this.halfRoad(loc);
        const reach = Math.abs(loc.lateral);
        const roofed = loc.flags ? loc.flags.tunnel || loc.flags.gallery : false;
        if (reach <= half || (roofed && reach <= half + WorldGround.BENCH_M + 1)) return loc.roadY + lift;
        const at = this.position(loc);
        const side = this.sideRoadY(at.x, at.z);
        if (side !== null) return side + lift;
        const land = this.landY(at.x, at.z, loc.roadY);
        // On a retaining wall of the ride's plan, or the wall that goes on past its end, the verge is the ribbon's up to
        // the wall's side to the road; over the wall's thickness its coping, WALL_MIN_UP_M over the road (wallBand)
        const band = this.wallBand(loc, half);
        if (band && reach >= band.from && reach <= band.to) return loc.roadY + RoadMesh.COPING_UP_M + lift;
        if (!this.bridgeOrDrop(loc, half)) return Math.max(land, this.earthworkY(loc, half, reach, lift));
        if (band) return reach < band.from ? loc.roadY + lift : land;
        // Before a retaining wall the verge is the ribbon's, at the road's height, out to the parapet's inner face (the
        // parapet stands on the last PARAPET_W_M of the verge)
        return !(loc.flags && loc.flags.bridge) && reach < half + this.vergeAt(loc.index, loc.lateral, loc.t) - RoadMesh.PARAPET_W_M ? loc.roadY + lift : land;
    }

    // The ground at a located point as it is drawn: the ribbon and the verge RoadMesh.LIFT_M over the road's height,
    // the fill and the land on their triangles (what a wheel or a foot stands on: Vehicle.groundPose)
    drawnY(loc) {
        return this.heightAt(loc, false, RoadMesh.LIFT_M);
    }

    // Where a retaining wall of the ride's plan stands at loc's side (WorldEnvironment.walledAt), or the wall that goes
    // on past its end (taperAt): {from, to}, the reach from the centre line of its side to the road (the coping's inner
    // edge, COPING_W_M in from its face, which stands STONE_PROUD_M out from the verge's edge) and of its face. Null
    // where none stands or the plan is not known
    wallBand(loc, half) {
        if (loc.flags && loc.flags.bridge) return null;
        const sign = Math.sign(loc.lateral || 1);
        const walled = this.walledAt ? this.walledAt(loc.index, sign) : undefined;
        if (walled === undefined) return null;
        const face = half + this.vergeAt(loc.index, loc.lateral, loc.t) + RoadMesh.STONE_PROUD_M;
        if (!walled) {
            // (the wall past an end stands where it holds 0.1 m of the fill's fall or more, as it is drawn, or where
            // it goes on to the next wall)
            const share = this.taperAt ? this.taperAt(loc.index, sign, loc.t) : 0;
            if (!(this.bridgedAt && this.bridgedAt(loc.index, sign))) {
                if (!(share > 0)) return null;
                const point = this.route.points[Math.max(0, Math.min(this.route.points.length - 1, loc.index))];
                const at = WorldGround.pointAt(point, sign * (face - RoadMesh.STONE_PROUD_M), this.scratchBand || (this.scratchBand = {}));
                if ((loc.roadY - this.landY(at.x, at.z, loc.roadY)) * share < 0.1) return null;
            }
        }
        // (never on the carriageway itself: where a verge narrows by a junction the coping reaches over its edge)
        return { from: Math.max(half, face - RoadMesh.COPING_W_M), to: face };
    }

    // The fill RoadMesh draws beside the road (edgeWorks' apron): the verge at the road's height, then a slope at the
    // importer's batter down from the verge's edge. The 8 m tile triangles lie under it near the edge on a fill.
    // It runs out only as far as it takes to fall from the edge to the land at the edge (as the apron is drawn); where
    // that is further than WorldEnvironment.APRON_RUN_M, the apron's foot stands on the land there and its slope is
    // steeper than the batter (WorldEnvironment.edgeFoot)
    earthworkY(loc, half, reach, lift = 0) {
        const edge = half + this.vergeAt(loc.index, loc.lateral, loc.t);
        if (reach <= edge) return loc.roadY + lift;
        const point = this.route.points[Math.max(0, Math.min(this.route.points.length - 1, loc.index))];
        const side = Math.sign(loc.lateral || 1);
        const at = WorldGround.pointAt(point, side * edge, this.scratchEdge || (this.scratchEdge = {}));
        const most = WorldEnvironment.APRON_RUN_M;
        // Past a wall's end the wall's face goes on and holds a share of the fill's fall (RoadMesh.edgeWorks `taper`,
        // WorldEnvironment.taperAt): the slope starts that much under the edge and is that much shorter, as it is drawn
        const held = this.taperAt ? this.taperAt(loc.index, side, loc.t) : 0;
        const run = Math.max(0, loc.roadY - this.landY(at.x, at.z, loc.roadY)) / RoadMesh.BATTER;
        if (run <= most) return reach - edge <= run * (1 - held) ? loc.roadY - run * RoadMesh.BATTER * held - (reach - edge) * RoadMesh.BATTER : -Infinity;
        if (reach - edge > most * (1 - held)) return -Infinity;
        const foot = WorldGround.pointAt(point, side * (edge + most), this.scratchFoot || (this.scratchFoot = {}));
        const slope = Math.max(RoadMesh.BATTER, (loc.roadY - this.landY(foot.x, foot.z, loc.roadY)) / most);
        return loc.roadY - most * slope * held - (reach - edge) * slope;
    }

    // No fill on a bridge (its parapet), and none where the importer marks a retaining wall or a drop just past the
    // verge (where WorldEnvironment.edgeFoot reads it to draw a wall instead of the fill)
    bridgeOrDrop(loc, half) {
        if (loc.flags && loc.flags.bridge) return true;
        // Where the ride's wall plan is known (WorldEnvironment.walledAt), the drawn wall is the wall
        const planned = this.walledAt ? this.walledAt(loc.index, Math.sign(loc.lateral || 1)) : undefined;
        if (planned !== undefined) return planned;
        const point = this.route.points[Math.max(0, Math.min(this.route.points.length - 1, loc.index))];
        const out = WorldGround.pointAt(point, Math.sign(loc.lateral || 1) * (half + this.vergeAt(loc.index, loc.lateral, loc.t) + WorldEnvironment.FOOT_PROBE_M), this.scratchDrop || (this.scratchDrop = {}));
        const zone = this.tileZone(out.x, out.z);
        return zone === WorldData.ZONE.drop || zone === WorldData.ZONE.wall;
    }

    // The road's edge on loc's side stands on a retaining wall with a parapet: a drop node just past the verge (the
    // upper road's wall, WorldEnvironment.edgeFoot) where the land lies RoadMesh.PARAPET_DROP_M or more under the road
    onRetainingWall(loc, half) {
        const point = this.route.points[Math.max(0, Math.min(this.route.points.length - 1, loc.index))];
        const out = WorldGround.pointAt(point, Math.sign(loc.lateral || 1) * (half + this.vergeAt(loc.index, loc.lateral, loc.t) + WorldEnvironment.FOOT_PROBE_M), this.scratchWall || (this.scratchWall = {}));
        const planned = this.walledAt ? this.walledAt(loc.index, Math.sign(loc.lateral || 1)) : undefined;
        if (planned === false || (planned === undefined && this.tileZone(out.x, out.z) !== WorldData.ZONE.drop)) return false;
        const land = this.tileHeight(out.x, out.z);
        const roadY = Number.isFinite(loc.roadY) ? loc.roadY : point.y;
        return land !== null && roadY - land >= RoadMesh.PARAPET_DROP_M;
    }

    // (x, z) of a located point; the point itself when it carries one
    position(loc) {
        if (loc.x !== undefined && loc.z !== undefined) return loc;
        const point = this.route.points[Math.max(0, Math.min(this.route.points.length - 1, loc.index))];
        return WorldGround.pointAt(point, loc.lateral, this.scratchPoint || (this.scratchPoint = {}));
    }

    // What the ground is at loc.lateral: {kind, side, sign, start}. `start` is how far
    // from the centre line the zone begins, the face the bike is put back to on a wall. A wall that is drawn to a
    // height has it (`height`, metres over the road: a parapet, a barrier); a wall whose face is a line along the
    // road at `start` says so (`line`: a parapet, the rock beside a tunnel's road; a rock face of the land is read
    // from the 8 m zone layer and has none); a barrier has its box (`box`), whose faces are not along the road.
    // Vehicle.brushWall reads all three
    zoneAt(loc, halfRoad) {
        const sign = loc.lateral < 0 ? -1 : 1;
        const reach = Math.abs(loc.lateral);
        const at = this.position(loc);
        // A barrier is solid where it stands: the bike is stopped where it is, not moved onto the road
        const box = this.barriers.length ? this.barrierAt(at.x, at.z) : null;
        if (box) return { kind: 'wall', side: this.wallSide, sign, start: reach, box, height: RoadMesh.BARRIER_H_M };
        if (reach <= halfRoad) return { kind: 'road', side: this.roadSide, sign, start: 0 };
        const point = this.route.points[Math.max(0, Math.min(this.route.points.length - 1, loc.index))];
        if (point.bits & (WorldRoute.FLAG.tunnel | WorldRoute.FLAG.gallery)) {
            // Rock beside a tunnel or gallery: a wall just past the kerb
            return { kind: reach <= halfRoad + WorldGround.BENCH_M ? 'shoulder' : 'wall', side: this.benchSide, sign, start: reach <= halfRoad + WorldGround.BENCH_M ? halfRoad : halfRoad + WorldGround.BENCH_M, line: true };
        }
        // A bridge has its parapet at the edge of the deck: past it there is no ground to ride or fall to
        if (point.bits & WorldRoute.FLAG.bridge) return { kind: 'wall', side: this.wallSide, sign, start: halfRoad + WorldGround.PARAPET_M, line: true, height: RoadMesh.PARAPET_H_M };
        // Where the road's edge stands on a retaining wall (the importer's drop node just past the verge, where RoadMesh
        // draws the wall and its parapet instead of the fill): the verge is drawn at the road's height up to the
        // parapet, and the parapet is solid, a wall at its inner face. A drop past a bench or open ground stays a fall
        // A retaining wall of the ride's plan, and the wall past its end, stand WALL_MIN_UP_M over the road from the
        // coping's inner edge: a rider who leaves the road there meets the wall's side, that high. Its parapet, where it
        // has one (as RoadMesh.railed: a drop of PARAPET_DROP_M or more), stands on the coping's outer PARAPET_W_M,
        // half a metre further out than the side the tyres meet
        const band = this.wallBand(loc, halfRoad);
        if (band) {
            const railed = this.onRetainingWall(loc, halfRoad);
            return reach > band.from ? { kind: 'wall', side: this.wallSide, sign, start: band.from, parapet: railed, line: true, height: RoadMesh.COPING_UP_M } : { kind: 'shoulder', side: this.benchSide, sign, start: halfRoad };
        }
        if (this.onRetainingWall(loc, halfRoad)) {
            const parapet = halfRoad + this.vergeAt(loc.index, loc.lateral, loc.t) - RoadMesh.PARAPET_W_M;
            return reach > parapet ? { kind: 'wall', side: this.wallSide, sign, start: parapet, parapet: true, line: true, height: RoadMesh.PARAPET_H_M } : { kind: 'shoulder', side: this.benchSide, sign, start: halfRoad };
        }
        const kind = this.kindAt(at.x, at.z);
        // Where the zone began: step back toward the road while the kind holds
        let start = reach;
        const probe = {};
        for (let d = reach - 0.5; d > halfRoad; d -= 0.5) {
            WorldGround.pointAt(point, sign * d, probe);
            if (this.kindAt(probe.x, probe.z) !== kind) break;
            start = d;
        }
        if (start <= halfRoad + 0.5) start = halfRoad;
        return { kind, side: kind === 'runoff' ? this.openSide : kind === 'shoulder' ? this.benchSide : this.wallSide, sign, start };
    }

    // The bike's zone kind at (x, z): road, shoulder (the bench), runoff, wall or fall
    kindAt(x, z) {
        if (this.sideRoadY(x, z) !== null) return 'road';
        const zones = WorldData.ZONE;
        switch (this.tileZone(x, z)) {
            case zones.road: return 'road';
            case zones.bench: return 'shoulder';
            case zones.wall: return 'wall';
            case zones.drop: return 'fall';
            default: return 'runoff';
        }
    }

    restY(loc) {
        return loc.roadY - WorldGround.FALL_M;
    }

    // The same ground on both sides: the tile's zones carry the difference
    sideAt() {
        return this.openSide;
    }

    // The surface of a lake the bike is in, or null on dry land
    waterLevel(loc) {
        const at = this.position(loc);
        if (this.tileZone(at.x, at.z) !== WorldData.ZONE.water) return null;
        const h = this.tileHeight(at.x, at.z);
        return h === null ? null : h + 0.01;
    }
}
