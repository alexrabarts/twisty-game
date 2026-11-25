// PlaceMesh: the few things that make a stopping place (WorldPlaces) read as a stop. The pad itself is ground: RoadMesh
// draws it in the ribbon, in its surface (RoadSurface.PAD), so nothing here lies over it but the paint of a car park's
// bays. Each kind's props are one row of PlaceMesh.KIT; nothing names a place, and nothing drawn carries text.
//
//   viewpoint  a low course of dressed stone along the pad's outer edge with a rail of round steel posts and tubes on
//              it, and a bench of timber slats on cast legs facing out over the drop
//   layby      a low kerb along the pad's outer edge, a white marker post with its band and reflector at each end of it,
//              and a waste bin
//   carpark    the lines of its bays across the pad and a waste bin
// A bin is a round drum on a post with a lid and a rim; a stone or a kerb has its top edges chamfered; a post is
// chamfered at its head. Round parts are prisms of PlaceMesh.ROUND sides with no hidden faces.
//
// One mesh for the places within KIT.reachM of the bike, in RoadMesh's vertex-coloured material (it takes the haze),
// built again when that set changes (every few hundred metres): one draw call, and only the near places' triangles.
// Everything a bike could ride into is solid: `at` answers as Scenery.houseAt does, with the thing's name.
class PlaceMesh {
    static get KIT() {
        return {
            reachM: 600,
            colors: { stone: [0.56, 0.55, 0.52], cap: [0.62, 0.61, 0.58], wood: [0.43, 0.31, 0.2], metal: [0.24, 0.26, 0.27], white: [0.9, 0.9, 0.87], band: [0.12, 0.12, 0.12], bin: [0.2, 0.31, 0.23], paint: [0.88, 0.88, 0.84], reflector: [0.95, 0.62, 0.12] },
            // The stone course: insetM in from the pad's outer edge, widthM across, heightM high, laid in pieces of
            // pieceM. The rail stands on it: posts every everyM, bars at `bars` over the stone
            viewpoint: {
                edge: { insetM: 0.1, widthM: 0.4, heightM: 0.35, pieceM: 3 },
                rail: { postM: 0.07, everyM: 2.5, barM: 0.05, bars: [0.35, 0.7], heightM: 0.75 },
                bench: { lengthM: 1.6, depthM: 0.42, seatM: 0.42, backM: 0.85, fromEdgeM: 0.95, fromStartM: 2, slats: 3, backSlats: 2, slatM: 0.035 }
            },
            layby: {
                kerb: { insetM: 0.05, widthM: 0.22, heightM: 0.14, pieceM: 4 },
                post: { sizeM: 0.12, heightM: 1, band: [0.72, 0.86], insetM: 0.35 },
                bin: { sizeM: 0.45, heightM: 0.85, fromEdgeM: 0.55, fromStartM: 1.5 }
            },
            // Bays along the pad for parallel parking: a line across it every everyM, from fromCarriagewayM past the
            // carriageway's edge to insetM short of the hard standing's outer edge
            carpark: {
                bay: { everyM: 5.5, lineM: 0.12, fromCarriagewayM: 0.35, insetM: 0.25, liftM: 0.006 },
                bin: { sizeM: 0.45, heightM: 0.85, fromEdgeM: 0.55, fromStartM: 1.5 }
            }
        };
    }

    // The sides of a round part (a post, a tube, a bin)
    static get ROUND() { return 6; }

    // `places` a WorldPlaces, `route` the ride; builds the props of every open place
    constructor(places, route) {
        this.route = route;
        this.group = new THREE.Group();
        this.group.name = 'world-places';
        this.solids = [];
        // Each place's props: {place, at {x, z}, positions, shades, triangles}; `total` their triangles, `triangles`
        // those drawn now
        this.parts = [];
        this.total = 0;
        this.triangles = 0;
        this.key = null;
        this.mesh = null;
        this.sample = {};
        for (const place of places.list) {
            const part = this.build(place);
            if (!part) continue;
            this.parts.push(part);
            this.total += part.triangles;
        }
    }

    // The ground point at ride distance s, `lateral` across: {x, y, z, heading} on the drawn pad
    frame(s, lateral) {
        const p = this.route.sample(s, this.sample);
        return { x: p.x + lateral * Math.cos(p.heading), y: p.y + RoadMesh.LIFT_M, z: p.z - lateral * Math.sin(p.heading), heading: p.heading, width: p.width };
    }

    // How far out on its side a place's pad reaches at ride distance s, from the centre line
    edgeOf(place, s) {
        return this.route.sample(s, this.sample).width / 2 + RoadSurface.VERGE_M + WorldPlaces.padOf(place, s);
    }

    // A box `across` by `up` by `along` standing `lift` over the pad at (s, lateral); `solid` names it for the bike
    box(out, s, lateral, lift, across, up, along, color, solid = null) {
        const f = this.frame(s, lateral);
        RoadMesh.box(out, f.x, f.y + lift + up / 2, f.z, across, up, along, f.heading, color);
        if (solid) this.solids.push({ x: f.x, z: f.z, heading: f.heading, along, across, label: solid });
    }

    // A box whose top edges are chamfered by `bevel` on its four sides: a stone, a kerb or a post's head. No underside
    chamfered(out, s, lateral, lift, across, up, along, bevel, color, top = color, solid = null) {
        const f = this.frame(s, lateral);
        const cos = Math.cos(f.heading), sin = Math.sin(f.heading);
        const at = (lx, ly, lz) => [f.x + lx * cos + lz * sin, f.y + lift + ly, f.z - lx * sin + lz * cos];
        const hx = across / 2, hz = along / 2, b = Math.min(bevel, hx * 0.8, hz * 0.8, up * 0.8), y1 = up - b;
        const low = [at(-hx, 0, -hz), at(hx, 0, -hz), at(hx, 0, hz), at(-hx, 0, hz)];
        const mid = [at(-hx, y1, -hz), at(hx, y1, -hz), at(hx, y1, hz), at(-hx, y1, hz)];
        const high = [at(-hx + b, up, -hz + b), at(hx - b, up, -hz + b), at(hx - b, up, hz - b), at(-hx + b, up, hz - b)];
        for (let i = 0; i < 4; i++) {
            const j = (i + 1) % 4;
            RoadMesh.quad(out, low[j], low[i], mid[i], mid[j], color);
            RoadMesh.quad(out, mid[j], mid[i], high[i], high[j], top);
        }
        RoadMesh.quad(out, high[3], high[2], high[1], high[0], top);
        if (solid) this.solids.push({ x: f.x, z: f.z, heading: f.heading, along, across, label: solid });
    }

    // A round part from a to b ([x, y, z]), `radius` round and ROUND sided, its ends closed when `caps`
    static round(out, a, b, radius, color, caps = false) {
        const n = PlaceMesh.ROUND;
        const axis = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
        const u = new THREE.Vector3(0, 1, 0).cross(axis);
        if (u.lengthSq() < 1e-6) u.set(1, 0, 0); else u.normalize();
        const v = axis.clone().cross(u).normalize();
        const ring = (p) => Array.from({ length: n }, (_, k) => {
            const t = (k / n) * Math.PI * 2, c = Math.cos(t) * radius, d = Math.sin(t) * radius;
            return [p[0] + u.x * c + v.x * d, p[1] + u.y * c + v.y * d, p[2] + u.z * c + v.z * d];
        });
        const ra = ring(a), rb = ring(b);
        for (let k = 0; k < n; k++) {
            const j = (k + 1) % n;
            RoadMesh.quad(out, ra[k], ra[j], rb[j], rb[k], color);
        }
        if (!caps) return;
        for (let k = 1; k < n - 1; k++) {
            out.positions.push(...rb[0], ...rb[k], ...rb[k + 1], ...ra[0], ...ra[k + 1], ...ra[k]);
            for (let i = 0; i < 6; i++) out.shades.push(...color);
        }
    }

    // A point standing `lift` over the pad at (s, lateral)
    point(s, lateral, lift) {
        const f = this.frame(s, lateral);
        return [f.x, f.y + lift, f.z];
    }

    // A waste bin: a round drum on a post, a lid with its rim, the drum open to nobody: no text, no mark
    bin(out, s, lateral, N, C) {
        const r = N.sizeM / 2;
        PlaceMesh.round(out, this.point(s, lateral, 0), this.point(s, lateral, N.heightM - 0.55), 0.04, C.metal);
        PlaceMesh.round(out, this.point(s, lateral, N.heightM - 0.6), this.point(s, lateral, N.heightM - 0.02), r, C.bin, true);
        PlaceMesh.round(out, this.point(s, lateral, N.heightM - 0.08), this.point(s, lateral, N.heightM + 0.03), r + 0.025, C.metal, true);
        const f = this.frame(s, lateral);
        this.solids.push({ x: f.x, z: f.z, heading: f.heading, along: N.sizeM, across: N.sizeM, label: 'waste bin' });
    }

    // A car park's bay lines: [{s, inner, outer}], inner and outer from the centre line. The paint stops on the hard
    // standing: the shader lays its asphalt from the carriageway's edge out to the pad's depth, and the verge's gravel
    // and grass lie past it
    bayLines(place) {
        const Y = PlaceMesh.KIT.carpark.bay;
        const a = place.s + (place.taper || 0), b = place.s + place.length - (place.taper || 0);
        const lines = Math.floor((b - a) / Y.everyM);
        const lead = (b - a - lines * Y.everyM) / 2;
        const list = [];
        for (let k = 0; k <= lines; k++) {
            const s = a + lead + k * Y.everyM;
            const half = this.route.sample(s, this.sample).width / 2;
            const inner = half + Y.fromCarriagewayM, outer = half + WorldPlaces.padOf(place, s) - Y.insetM;
            if (outer - inner >= 1) list.push({ s, inner, outer });
        }
        return list;
    }

    build(place) {
        const K = PlaceMesh.KIT, C = K.colors, side = place.side;
        // The full depth of the pad runs between its tapers
        const a = place.s + (place.taper || 0), b = place.s + place.length - (place.taper || 0);
        if (b - a < 2) return null;
        const out = { positions: [], shades: [] };
        if (place.kind === 'viewpoint') {
            const E = K.viewpoint.edge, R = K.viewpoint.rail, B = K.viewpoint.bench;
            const pieces = Math.max(1, Math.round((b - a) / E.pieceM)), piece = (b - a) / pieces;
            for (let k = 0; k < pieces; k++) {
                const s = a + (k + 0.5) * piece;
                const lateral = side * (this.edgeOf(place, s) - E.insetM - E.widthM / 2);
                this.chamfered(out, s, lateral, 0, E.widthM, E.heightM, piece - 0.04, 0.05, k % 2 ? C.stone : C.cap, C.cap, 'stone edge');
            }
            // Round posts on the stone, two tubes between each pair, and a cap on each post
            const posts = Math.max(1, Math.round((b - a) / R.everyM)), span = (b - a) / posts;
            const railAt = s => side * (this.edgeOf(place, s) - E.insetM - E.widthM / 2);
            const postS = k => Math.min(b - R.postM, Math.max(a + R.postM, a + k * span));
            for (let k = 0; k <= posts; k++) {
                const s = postS(k), lateral = railAt(s);
                PlaceMesh.round(out, this.point(s, lateral, E.heightM), this.point(s, lateral, E.heightM + R.heightM), R.postM / 2, C.metal, true);
                if (k === posts) continue;
                const t = postS(k + 1);
                for (const h of R.bars) PlaceMesh.round(out, this.point(s, lateral, E.heightM + h), this.point(t, railAt(t), E.heightM + h), R.barM / 2, C.metal);
            }
            // The bench on the drop side, facing out over it: its back toward the road. Slats of timber on two cast legs
            const s = a + B.fromStartM + B.lengthM / 2;
            const lateral = side * (this.edgeOf(place, s) - B.fromEdgeM);
            const gap = (B.depthM - B.slats * 0.1) / (B.slats - 1);
            for (let k = 0; k < B.slats; k++) {
                const across = -B.depthM / 2 + 0.05 + k * (0.1 + gap);
                this.box(out, s, lateral - side * across, B.seatM - B.slatM, 0.1, B.slatM, B.lengthM, C.wood);
            }
            const back = lateral - side * (B.depthM / 2 - 0.03);
            for (let k = 0; k < B.backSlats; k++) this.box(out, s, back, B.seatM + 0.12 + k * 0.2, B.slatM, 0.12, B.lengthM, C.wood);
            for (const end of [-1, 1]) {
                const at = s + end * (B.lengthM / 2 - 0.12);
                // The leg: a foot on the ground, an upright under the seat and one up the back, an arm over the seat
                this.box(out, at, lateral, 0, B.depthM, 0.05, 0.06, C.metal);
                this.box(out, at, lateral + side * 0.1, 0.05, 0.05, B.seatM - B.slatM - 0.05, 0.05, C.metal);
                this.box(out, at, back, 0.05, 0.04, B.backM - 0.05, 0.05, C.metal);
                this.box(out, at, lateral, B.seatM + 0.18, B.depthM - 0.04, 0.04, 0.05, C.metal);
            }
            // One solid for the whole bench
            const fb = this.frame(s, lateral);
            this.solids.push({ x: fb.x, z: fb.z, heading: fb.heading, along: B.lengthM, across: B.depthM, label: 'bench' });
        } else if (place.kind === 'layby' || place.kind === 'carpark') {
            if (place.kind === 'layby') {
                const E = K.layby.kerb;
                const pieces = Math.max(1, Math.round((b - a) / E.pieceM)), piece = (b - a) / pieces;
                for (let k = 0; k < pieces; k++) {
                    const s = a + (k + 0.5) * piece;
                    this.chamfered(out, s, side * (this.edgeOf(place, s) - E.insetM - E.widthM / 2), 0, E.widthM, E.heightM, piece - 0.03, 0.03, k % 2 ? C.stone : C.cap, C.cap, 'kerb');
                }
                const P = K.layby.post;
                for (const s of [a, b]) {
                    const lateral = side * (this.edgeOf(place, s) - P.insetM);
                    this.box(out, s, lateral, 0, P.sizeM, P.band[0], P.sizeM, C.white, 'marker post');
                    this.box(out, s, lateral, P.band[0], P.sizeM + 0.01, P.band[1] - P.band[0], P.sizeM + 0.01, C.band);
                    this.chamfered(out, s, lateral, P.band[1], P.sizeM, P.heightM - P.band[1], P.sizeM, 0.03, C.white);
                    // A reflector on the band, on the face toward the carriageway
                    this.box(out, s, lateral - side * (P.sizeM / 2 + 0.006), (P.band[0] + P.band[1]) / 2 - 0.04, 0.01, 0.08, 0.04, C.reflector);
                }
            } else {
                const Y = K.carpark.bay;
                for (const line of this.bayLines(place)) this.box(out, line.s, side * (line.inner + line.outer) / 2, Y.liftM, line.outer - line.inner, 0.004, Y.lineM, C.paint);
            }
            const N = K[place.kind].bin;
            const s = a + N.fromStartM;
            this.bin(out, s, side * (this.edgeOf(place, s) - N.fromEdgeM), N, C);
        } else return null;
        if (!out.positions.length) return null;
        const f = this.frame((a + b) / 2, side * this.edgeOf(place, (a + b) / 2));
        return { place: place.id, kind: place.kind, at: { x: f.x, z: f.z }, positions: out.positions, shades: out.shades, triangles: out.positions.length / 9 };
    }

    // The props of the places within KIT.reachM of the bike, as one mesh, built again when that set changes
    update(position) {
        if (!position) return;
        const reach = PlaceMesh.KIT.reachM;
        const near = this.parts.filter(part => Math.hypot(part.at.x - position.x, part.at.z - position.z) < reach);
        const key = near.map(part => part.place).join(',');
        if (key === this.key) return;
        this.key = key;
        if (this.mesh) {
            this.group.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.mesh = null;
        }
        this.triangles = 0;
        if (!near.length) return;
        const positions = [], shades = [];
        for (const part of near) {
            for (const v of part.positions) positions.push(v);
            for (const v of part.shades) shades.push(v);
            this.triangles += part.triangles;
        }
        this.mesh = RoadMesh.mesh(RoadMesh.geometry(positions, shades), 'world-places');
        this.mesh.userData.world = 'place';
        this.mesh.userData.places = near.map(part => part.place);
        this.mesh.userData.skipCulling = true;
        this.group.add(this.mesh);
    }

    // The prop whose footprint (x, z) is in or within `margin` of: {x, z, heading, along, across, label}, or null
    at(x, z, margin = 0) {
        for (const w of this.solids) {
            const dx = x - w.x, dz = z - w.z;
            if (Math.abs(dx) + Math.abs(dz) > w.along + w.across + 2 * margin) continue;
            const cos = Math.cos(w.heading), sin = Math.sin(w.heading);
            if (Math.abs(dx * cos - dz * sin) <= w.across / 2 + margin && Math.abs(dx * sin + dz * cos) <= w.along / 2 + margin) return w;
        }
        return null;
    }

    dispose() {
        if (this.mesh) this.mesh.geometry.dispose();
        this.mesh = null;
        this.parts = [];
        this.solids = [];
    }
}
