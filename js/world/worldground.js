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

    // Tile height at (x, z) on the drawn triangles, or null while the tile is not resident
    tileHeight(x, z) {
        const m = WorldData.TILE_M;
        const tx = Math.floor(x / m), tz = Math.floor(z / m);
        const tile = this.data.tile(`${tx},${tz}`);
        if (!tile) return null;
        const n = WorldData.TILE_N;
        const fx = (x - tx * m) / WorldData.CELL_M, fz = (z - tz * m) / WorldData.CELL_M;
        const i = Math.max(0, Math.min(n - 2, Math.floor(fx))), j = Math.max(0, Math.min(n - 2, Math.floor(fz)));
        const u = Math.max(0, Math.min(1, fx - i)), v = Math.max(0, Math.min(1, fz - j));
        const h = tile.heights;
        const h00 = h[j * n + i], h10 = h[j * n + i + 1], h01 = h[(j + 1) * n + i], h11 = h[(j + 1) * n + i + 1];
        // The same two triangles TerrainMesh draws (split along the 01-10 diagonal), so the ground is the drawn ground
        return u + v <= 1 ? h00 + u * (h10 - h00) + v * (h01 - h00) : h11 + (1 - u) * (h01 - h11) + (1 - v) * (h10 - h11);
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
        for (const b of this.barriers) {
            const dx = x - b.x, dz = z - b.z;
            const along = dx * b.sin + dz * b.cos;
            const across = dx * b.cos - dz * b.sin;
            if (Math.abs(along) <= WorldGround.BARRIER_DEPTH_M && Math.abs(across) <= b.half) return true;
        }
        return false;
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
        out.width = found.width;
        out.flags = this.route.points[found.index].flags;
        return out;
    }

    halfRoad(loc) {
        const point = this.route.points[Math.max(0, Math.min(this.route.points.length - 1, loc.index))];
        return point.width / 2;
    }

    groundY(x, z, hint, exact = false, loc = {}) {
        this.locate(x, z, hint, loc);
        return this.heightAt(loc, exact);
    }

    heightAt(loc, exact = false) {
        const half = loc.width !== undefined ? loc.width / 2 : this.halfRoad(loc);
        const reach = Math.abs(loc.lateral);
        const roofed = loc.flags ? loc.flags.tunnel || loc.flags.gallery : false;
        if (reach <= half || (roofed && reach <= half + WorldGround.BENCH_M + 1)) return loc.roadY;
        const at = this.position(loc);
        const side = this.sideRoadY(at.x, at.z);
        if (side !== null) return side;
        const land = this.landY(at.x, at.z, loc.roadY);
        if (!this.bridgeOrDrop(loc, half)) return Math.max(land, this.earthworkY(loc, half, reach));
        // Before a retaining wall the verge is the ribbon's, at the road's height, out to the parapet's inner face (the
        // parapet stands on the last PARAPET_W_M of the verge)
        return !(loc.flags && loc.flags.bridge) && reach < half + RoadSurface.VERGE_M - RoadMesh.PARAPET_W_M ? loc.roadY : land;
    }

    // The fill RoadMesh draws beside the road (edgeWorks' apron): the verge at the road's height, then a slope at the
    // importer's batter down from the verge's edge. The 8 m tile triangles lie under it near the edge on a fill.
    // It runs out only as far as it takes to fall from the edge to the land at the edge (as the apron is drawn).
    earthworkY(loc, half, reach) {
        const edge = half + RoadSurface.VERGE_M;
        if (reach <= edge) return loc.roadY;
        const point = this.route.points[Math.max(0, Math.min(this.route.points.length - 1, loc.index))];
        const at = WorldGround.pointAt(point, Math.sign(loc.lateral || 1) * edge, this.scratchEdge || (this.scratchEdge = {}));
        const run = Math.min(WorldEnvironment.APRON_RUN_M, Math.max(0, loc.roadY - this.landY(at.x, at.z, loc.roadY)) / RoadMesh.BATTER);
        return reach - edge <= run ? loc.roadY - (reach - edge) * RoadMesh.BATTER : -Infinity;
    }

    // No fill on a bridge (its parapet), and none where the importer marks a retaining wall or a drop just past the
    // verge (where WorldEnvironment.edgeFoot reads it to draw a wall instead of the fill)
    bridgeOrDrop(loc, half) {
        if (loc.flags && loc.flags.bridge) return true;
        const point = this.route.points[Math.max(0, Math.min(this.route.points.length - 1, loc.index))];
        const out = WorldGround.pointAt(point, Math.sign(loc.lateral || 1) * (half + RoadSurface.VERGE_M + WorldEnvironment.FOOT_PROBE_M), this.scratchDrop || (this.scratchDrop = {}));
        const zone = this.tileZone(out.x, out.z);
        return zone === WorldData.ZONE.drop || zone === WorldData.ZONE.wall;
    }

    // The road's edge on loc's side stands on a retaining wall with a parapet: a drop node just past the verge (the
    // upper road's wall, WorldEnvironment.edgeFoot) where the land lies RoadMesh.PARAPET_DROP_M or more under the road
    onRetainingWall(loc, half) {
        const point = this.route.points[Math.max(0, Math.min(this.route.points.length - 1, loc.index))];
        const out = WorldGround.pointAt(point, Math.sign(loc.lateral || 1) * (half + RoadSurface.VERGE_M + WorldEnvironment.FOOT_PROBE_M), this.scratchWall || (this.scratchWall = {}));
        if (this.tileZone(out.x, out.z) !== WorldData.ZONE.drop) return false;
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
    // from the centre line the zone begins, the face the bike is put back to on a wall.
    zoneAt(loc, halfRoad) {
        const sign = loc.lateral < 0 ? -1 : 1;
        const reach = Math.abs(loc.lateral);
        const at = this.position(loc);
        // A barrier is solid where it stands: the bike is stopped where it is, not moved onto the road
        if (this.barriers.length && this.inBarrier(at.x, at.z)) return { kind: 'wall', side: this.wallSide, sign, start: reach };
        if (reach <= halfRoad) return { kind: 'road', side: this.roadSide, sign, start: 0 };
        const point = this.route.points[Math.max(0, Math.min(this.route.points.length - 1, loc.index))];
        if (point.bits & (WorldRoute.FLAG.tunnel | WorldRoute.FLAG.gallery)) {
            // Rock beside a tunnel or gallery: a wall just past the kerb
            return { kind: reach <= halfRoad + WorldGround.BENCH_M ? 'shoulder' : 'wall', side: this.benchSide, sign, start: reach <= halfRoad + WorldGround.BENCH_M ? halfRoad : halfRoad + WorldGround.BENCH_M };
        }
        // A bridge has its parapet at the edge of the deck: past it there is no ground to ride or fall to
        if (point.bits & WorldRoute.FLAG.bridge) return { kind: 'wall', side: this.wallSide, sign, start: halfRoad + WorldGround.PARAPET_M };
        // Where the road's edge stands on a retaining wall (the importer's drop node just past the verge, where RoadMesh
        // draws the wall and its parapet instead of the fill): the verge is drawn at the road's height up to the
        // parapet, and the parapet is solid, a wall at its inner face. A drop past a bench or open ground stays a fall
        if (this.onRetainingWall(loc, halfRoad)) {
            const parapet = halfRoad + RoadSurface.VERGE_M - RoadMesh.PARAPET_W_M;
            return reach > parapet ? { kind: 'wall', side: this.wallSide, sign, start: parapet, parapet: true } : { kind: 'shoulder', side: this.benchSide, sign, start: halfRoad };
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
