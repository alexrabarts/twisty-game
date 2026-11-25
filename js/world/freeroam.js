// FreeRoam: the rules of a world ridden in free roam (GameModes 'roam'), with no THREE and no DOM so the node
// harness runs them.
//   - The edge of the map. The detailed land is the data's height tiles (manifest `tiles.height`); past them the far
//     land has no physics. Inside the land's outline by SOFT_M the bike is slowed as on deep grass and told it is at
//     the edge; by HARD_M (or outside it) it is put back where it last was on a road, turned round.
//   - Where a restart puts the bike: the last place it was on a road (the ride or a side road: the physics' own
//     `runoff`, null on a road), at least BACK_S before the crash, facing the way it was going.
// A free-roam world reads its graph and its tiles, never one stage: every importer world has it.
class FreeRoam {
    // Metres off the ride's carriageway past which the bike's place on the ride is found again over the whole ride
    static get FAR_M() { return 20; }

    static get RULE() { return Object.freeze({ softM: 150, hardM: 40, drag: 0.8, sampleS: 0.25, backS: 1, keep: 40 }); }

    // `tiles`: the detailed land's tiles, [[tx, tz]] (WorldData.TILE_M square)
    constructor(tiles, tileM) {
        this.tileM = tileM;
        this.tiles = new Set((tiles || []).map(([tx, tz]) => `${tx},${tz}`));
        this.poses = [];
        this.clockS = 0;
        this.lastSample = -Infinity;
        this.zone = 'in';
    }

    // Metres from (x, z) to the nearest ground with no detailed land (0 on such ground): the 5 by 5 tiles round it
    edgeDistance(x, z) {
        const m = this.tileM, tx = Math.floor(x / m), tz = Math.floor(z / m);
        if (!this.tiles.has(`${tx},${tz}`)) return 0;
        let least = Infinity;
        for (let i = -2; i <= 2; i++) {
            for (let k = -2; k <= 2; k++) {
                if (this.tiles.has(`${tx + i},${tz + k}`)) continue;
                const x0 = (tx + i) * m, z0 = (tz + k) * m;
                const dx = Math.max(x0 - x, 0, x - (x0 + m)), dz = Math.max(z0 - z, 0, z - (z0 + m));
                least = Math.min(least, Math.hypot(dx, dz));
            }
        }
        return least;
    }

    // One frame: `state` {x, y, z, heading, speed, onRoad, crashed, dt}. Returns the zone ('in', 'soft' or 'hard') and
    // the drag (1/s) the soft zone puts on the bike's speed
    step(state) {
        const R = FreeRoam.RULE;
        this.clockS += state.dt;
        if (state.onRoad && !state.crashed && state.speed > 0.5 && this.clockS - this.lastSample >= R.sampleS) {
            this.lastSample = this.clockS;
            this.poses.push({ t: this.clockS, x: state.x, y: state.y, z: state.z, heading: state.heading });
            if (this.poses.length > R.keep) this.poses.shift();
        }
        const d = this.edgeDistance(state.x, state.z);
        this.zone = d <= R.hardM ? 'hard' : d <= R.softM ? 'soft' : 'in';
        // (more drag the nearer the hard line)
        const drag = this.zone === 'soft' ? R.drag * (1 - (d - R.hardM) / (R.softM - R.hardM)) : 0;
        return { zone: this.zone, drag, distance: d };
    }

    // The places a free-roam ride can start at or travel to, in ride order: the start, every open stopping place
    // (WorldPlaces: where a rider stands in it, facing along the ride) and the summit (the stage's end). Each
    // {id, name, kind, s, x, y, z, heading}
    static destinations(environment) {
        const route = environment.route, list = [];
        const on = (id, name, kind, s) => {
            const p = route.sample(Math.max(0, Math.min(route.length, s)), {});
            list.push({ id, name, kind, s, x: p.x, y: p.y, z: p.z, heading: p.heading });
        };
        on('start', 'The start', 'start', environment.startS);
        const words = { layby: 'Lay-by', viewpoint: 'Viewpoint', carpark: 'Car park' };
        for (const place of (environment.places && environment.places.list) || []) {
            if (place.s <= environment.startS || place.s >= environment.endS) continue;
            const at = environment.places.stopAt(place, 0, environment.ground, {});
            list.push({ id: place.id, name: `${words[place.kind] || 'Stopping place'}, km ${(at.s / 1000).toFixed(1)}`, kind: place.kind, s: at.s, x: at.x, y: at.y, z: at.z, heading: at.heading });
        }
        // (the summit: a little short of the stage's end, on the road)
        on('summit', 'The summit', 'summit', environment.endS - 30);
        return list;
    }

    // The destination for a start chosen on the menu (GameModes.startAt): 'start', 'summit', or 'place', the stopping
    // place nearest the middle of the stage
    static startFor(environment, startAt) {
        const list = FreeRoam.destinations(environment);
        if (startAt === 'summit') return list[list.length - 1];
        if (startAt === 'place') {
            const middle = (environment.startS + environment.endS) / 2;
            const places = list.filter(d => d.kind !== 'start' && d.kind !== 'summit');
            if (places.length) return places.reduce((a, b) => (Math.abs(b.s - middle) < Math.abs(a.s - middle) ? b : a));
        }
        return list[0];
    }

    // Where a restart puts the bike: the last pose on a road taken BACK_S or more before now, else the oldest kept;
    // null before any. A restart at the edge turns the bike round as well (it rode out that way)
    restartPose(turn = false) {
        const R = FreeRoam.RULE;
        if (!this.poses.length) return null;
        let pose = this.poses[0];
        for (const p of this.poses) if (this.clockS - p.t >= R.backS) pose = p;
        // (the poses after it are of the ride that ended here: the next restart goes back from this one)
        this.poses = this.poses.filter(p => p.t <= pose.t);
        return { ...pose, heading: turn ? pose.heading + Math.PI : pose.heading };
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { FreeRoam };
