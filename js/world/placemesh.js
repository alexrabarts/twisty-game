// PlaceMesh: the few things that make a stopping place (WorldPlaces) read as a stop. The pad itself is ground: RoadMesh
// draws it in the ribbon, in its surface (RoadSurface.PAD), so nothing here lies over it but the paint of a car park's
// bays. Each kind's props are one row of PlaceMesh.KIT; nothing names a place, and nothing drawn carries text.
//
//   viewpoint  a low course of stone along the pad's outer edge with a rail on it, and a bench facing out over the drop
//   layby      a low kerb along the pad's outer edge, a white marker post at each end of it and a waste bin
//   carpark    the lines of its bays across the pad and a waste bin
//
// One mesh for the places within KIT.reachM of the bike, in RoadMesh's vertex-coloured material (it takes the haze),
// built again when that set changes (every few hundred metres): one draw call, and only the near places' triangles.
// Everything a bike could ride into is solid: `at` answers as Scenery.houseAt does, with the thing's name.
class PlaceMesh {
    static get KIT() {
        return {
            reachM: 600,
            colors: { stone: [0.56, 0.55, 0.52], cap: [0.62, 0.61, 0.58], wood: [0.43, 0.31, 0.2], metal: [0.24, 0.26, 0.27], white: [0.9, 0.9, 0.87], band: [0.12, 0.12, 0.12], bin: [0.2, 0.31, 0.23], paint: [0.88, 0.88, 0.84] },
            // The stone course: insetM in from the pad's outer edge, widthM across, heightM high, laid in pieces of
            // pieceM. The rail stands on it: posts every everyM, bars at `bars` over the stone
            viewpoint: {
                edge: { insetM: 0.1, widthM: 0.4, heightM: 0.35, pieceM: 3 },
                rail: { postM: 0.07, everyM: 2.5, barM: 0.05, bars: [0.35, 0.7], heightM: 0.75 },
                bench: { lengthM: 1.6, depthM: 0.42, seatM: 0.42, backM: 0.85, fromEdgeM: 0.95, fromStartM: 2 }
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
                this.box(out, s, lateral, 0, E.widthM, E.heightM, piece - 0.04, k % 2 ? C.stone : C.cap, 'stone edge');
            }
            const posts = Math.max(1, Math.round((b - a) / R.everyM)), span = (b - a) / posts;
            for (let k = 0; k <= posts; k++) {
                const s = Math.min(b - R.postM, Math.max(a + R.postM, a + k * span));
                const lateral = side * (this.edgeOf(place, s) - E.insetM - E.widthM / 2);
                this.box(out, s, lateral, E.heightM, R.postM, R.heightM, R.postM, C.metal);
                if (k === posts) continue;
                for (const h of R.bars) this.box(out, s + span / 2, lateral, E.heightM + h, R.barM, R.barM, span, C.metal);
            }
            // The bench on the drop side, facing out over it: its back toward the road
            const s = a + B.fromStartM + B.lengthM / 2;
            const lateral = side * (this.edgeOf(place, s) - B.fromEdgeM);
            this.box(out, s, lateral, B.seatM - 0.05, B.depthM, 0.05, B.lengthM, C.wood, 'bench');
            this.box(out, s, lateral - side * (B.depthM / 2 - 0.03), B.seatM + 0.1, 0.05, B.backM - B.seatM - 0.1, B.lengthM, C.wood);
            for (const end of [-1, 1]) this.box(out, s + end * (B.lengthM / 2 - 0.12), lateral, 0, B.depthM - 0.04, B.seatM - 0.05, 0.08, C.metal);
        } else if (place.kind === 'layby' || place.kind === 'carpark') {
            if (place.kind === 'layby') {
                const E = K.layby.kerb;
                const pieces = Math.max(1, Math.round((b - a) / E.pieceM)), piece = (b - a) / pieces;
                for (let k = 0; k < pieces; k++) {
                    const s = a + (k + 0.5) * piece;
                    this.box(out, s, side * (this.edgeOf(place, s) - E.insetM - E.widthM / 2), 0, E.widthM, E.heightM, piece - 0.03, k % 2 ? C.stone : C.cap, 'kerb');
                }
                const P = K.layby.post;
                for (const s of [a, b]) {
                    const lateral = side * (this.edgeOf(place, s) - P.insetM);
                    this.box(out, s, lateral, 0, P.sizeM, P.band[0], P.sizeM, C.white, 'marker post');
                    this.box(out, s, lateral, P.band[0], P.sizeM + 0.01, P.band[1] - P.band[0], P.sizeM + 0.01, C.band);
                    this.box(out, s, lateral, P.band[1], P.sizeM, P.heightM - P.band[1], P.sizeM, C.white);
                }
            } else {
                const Y = K.carpark.bay;
                for (const line of this.bayLines(place)) this.box(out, line.s, side * (line.inner + line.outer) / 2, Y.liftM, line.outer - line.inner, 0.004, Y.lineM, C.paint);
            }
            const N = K[place.kind].bin;
            const s = a + N.fromStartM;
            const lateral = side * (this.edgeOf(place, s) - N.fromEdgeM);
            this.box(out, s, lateral, 0, N.sizeM, N.heightM, N.sizeM, C.bin, 'waste bin');
            this.box(out, s, lateral, N.heightM, N.sizeM + 0.04, 0.05, N.sizeM + 0.04, C.metal);
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
