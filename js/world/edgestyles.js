// The edge furniture of a world (Scenery.stoneSites): what guards an edge that needs a guard, as data. Where a guard
// stands is Scenery's rule (a drop, a hairpin's outside, a wall's top); which style stands there is chosen here, one
// style for a whole stretch, row or wall, by the region rule: the nearest located reference within REGION.radiusKm
// sets the family, and with none near, a seeded mix of the alpine styles. The styles and the references come from
// the owner's photos of pass roads (their places as coordinates only; never the photos, their names or the places'
// names). Each piece and link is a box or a frustum of RoadMesh's kind with sRGB vertex colours, built once.
class EdgeStyles {
    // Each style:
    //   family     what a located reference of it brings to its region (the styles of one family stand there)
    //   piece      the piece at each kept station (null: nothing stands, the painted edge only)
    //   link       what runs from one piece to the next (null: the pieces stand alone)
    //   step       every step-th station of a row keeps its piece (stations are Scenery.STONE_GAP_M apart)
    //   guards     the edges it may guard: 'drop', 'hairpin', 'wall' (on a retaining wall's coping)
    //   weight     its share of the alpine mix, by edge
    //   drawnBy    'RoadMesh' for the walls and parapets: in the table for the region rule's families, drawn there
    static get STYLES() {
        return Object.freeze({
            granite: { family: 'stone', piece: 'granite', link: 'kerb', step: 1, guards: ['drop', 'hairpin'], weight: { drop: 3, hairpin: 4 } },
            short: { family: 'stone', piece: 'short', link: null, step: 1, guards: ['drop', 'hairpin', 'wall'], weight: { drop: 3, hairpin: 2, wall: 3 } },
            posts: { family: 'posts', piece: 'post', link: null, step: 4, guards: ['drop', 'hairpin'], weight: { drop: 1.5, hairpin: 0.5 } },
            guardrail: { family: 'steel', piece: 'railPost', link: 'wBeam', step: 1, guards: ['drop', 'hairpin'], weight: { drop: 2, hairpin: 1.5 } },
            timber: { family: 'timber', piece: 'timberPost', link: 'timberRails', step: 1, guards: ['drop'], weight: { drop: 0.6 } },
            tubes: { family: 'steel', piece: 'tubePost', link: 'tubes', step: 1, guards: ['wall'], weight: { wall: 2 } },
            parapet: { family: 'stone', drawnBy: 'RoadMesh', piece: null, link: null, step: 1, guards: ['wall'], weight: {} },
            none: { family: 'none', piece: null, link: null, step: 1, guards: ['drop', 'hairpin', 'wall'], weight: {} }
        });
    }

    // The pieces and links: their size in metres ([width across the edge, height over the seat, depth along it]; a
    // frustum's top is `top` of its foot), their colours (sRGB, `band` a second colour over the top `bandM`), and how
    // far a link stands over the seat (`up`, each bar [height, thickness, depth])
    static get PIECES() {
        return Object.freeze({
            // Sawn granite on a kerb course: shorter than the blocks were (0.68 m), narrow, tapered to a dressed top
            granite: { size: [0.42, 0.5, 0.32], top: 0.78, colour: [0.60, 0.60, 0.60] },
            // Short squat blocks standing alone
            short: { size: [0.5, 0.36, 0.44], top: 0.85, colour: [0.58, 0.57, 0.55] },
            // A white delineator post with a black band near its top
            post: { size: [0.12, 1.0, 0.12], top: 0.85, colour: [0.92, 0.92, 0.9], band: [0.08, 0.08, 0.08], bandM: 0.22 },
            // The posts of a guardrail, of a timber fence and of a tube railing on a wall
            railPost: { size: [0.1, 0.72, 0.14], top: 1, colour: [0.55, 0.56, 0.57] },
            timberPost: { size: [0.14, 1.0, 0.14], top: 0.9, colour: [0.42, 0.32, 0.22] },
            tubePost: { size: [0.06, 1.0, 0.06], top: 1, colour: [0.62, 0.63, 0.64] }
        });
    }

    static get LINKS() {
        return Object.freeze({
            // (the granite's kerb is Scenery.kerbPart: the stone of the walls)
            kerb: null,
            wBeam: { bars: [[0.6, 0.3, 0.06]], colour: [0.66, 0.67, 0.68], out: -0.08 },
            timberRails: { bars: [[0.45, 0.12, 0.07], [0.88, 0.12, 0.07]], colour: [0.45, 0.35, 0.24], out: 0 },
            tubes: { bars: [[0.5, 0.05, 0.05], [0.98, 0.05, 0.05]], colour: [0.64, 0.65, 0.66], out: 0 }
        });
    }

    // The located references: [lat, lon, style]. Six of the owner's photos have a place (two at one spot); their
    // styles read from the photos
    static get REFERENCES() {
        return Object.freeze([
            [46.58769, 8.48950, 'posts'],
            [46.73449, 8.45497, 'tubes'],
            [46.72956, 8.44382, 'none'],
            [46.74241, 8.38088, 'parapet'],
            [46.73299, 8.41305, 'granite'],
            [46.56588, 8.35771, 'guardrail']
        ]);
    }

    // The region rule: a reference sets the family within this of it
    static get REGION() { return Object.freeze({ radiusKm: 6 }); }

    // WGS84 of a world point from its LV95 origin (WorldData manifest `origin`: e = e0 + x, n = n0 - z), by swisstopo's
    // approximate formulas (about 1 m)
    static latLon(origin, x, z) {
        const y = (origin.e0 + x - 2600000) / 1e6, n = (origin.n0 - z - 1200000) / 1e6;
        const lon = (2.6779094 + 4.728982 * y + 0.791484 * y * n + 0.1306 * y * n * n - 0.0436 * y ** 3) * 100 / 36;
        const lat = (16.9023892 + 3.238272 * n - 0.270978 * y * y - 0.002528 * n * n - 0.0447 * y * y * n - 0.0140 * n ** 3) * 100 / 36;
        return { lat, lon };
    }

    static km(a, b) {
        const k = Math.PI / 180, x = (b.lon - a.lon) * k * Math.cos((a.lat + b.lat) / 2 * k), y = (b.lat - a.lat) * k;
        return Math.hypot(x, y) * 6371;
    }

    // The nearest reference's family within the radius of a place ({lat, lon}), or null
    static family(at) {
        if (!at) return null;
        let best = null, near = EdgeStyles.REGION.radiusKm;
        for (const [lat, lon, style] of EdgeStyles.REFERENCES) {
            const d = EdgeStyles.km(at, { lat, lon });
            if (d <= near) {
                near = d;
                best = EdgeStyles.STYLES[style].family;
            }
        }
        return best;
    }

    // The style of one stretch, row or wall: `edge` its kind, `at` its place ({lat, lon} or null), `seed` 0 to 1 its
    // own. In a region, a style of the region's family that may guard the edge (none of them: nothing stands, as the
    // photo has it, unless the family has no style for the edge at all, then the mix); else the alpine mix
    static pick(edge, at, seed) {
        if (EdgeStyles.forced) return EdgeStyles.forced;
        const S = EdgeStyles.STYLES;
        const family = EdgeStyles.family(at);
        let ids = Object.keys(S).filter(id => S[id].guards.includes(edge) && (S[id].weight[edge] || 0) > 0);
        if (family) {
            const own = Object.keys(S).filter(id => S[id].family === family && S[id].guards.includes(edge));
            if (own.length) {
                // (a family drawn by RoadMesh alone, or 'none': no furniture of Scenery's at that edge)
                const drawn = own.filter(id => S[id].piece);
                if (!drawn.length) return 'none';
                ids = drawn;
            }
        }
        const weights = ids.map(id => S[id].weight[edge] || 1), total = weights.reduce((a, b) => a + b, 0);
        let x = seed * total;
        for (let i = 0; i < ids.length; i++) if ((x -= weights[i]) < 0) return ids[i];
        return ids[ids.length - 1];
    }

    // A piece's geometry (cached): a frustum standing on its seat, its root going on under it (Scenery.STONE_ROOT_M)
    // and no underside; a band of a second colour over its top `bandM`. 10 triangles, 18 with a band
    static piece(id) {
        const cache = EdgeStyles.pieces || (EdgeStyles.pieces = new Map());
        if (cache.has(id)) return cache.get(id);
        const P = EdgeStyles.PIECES[id];
        const [w, h, d] = P.size, sink = Scenery.STONE_SINK_M, root = Scenery.STONE_ROOT_M;
        const positions = [], shades = [];
        const frustum = (y0, y1, s0, s1, colour) => {
            const c = (x, y, z) => [x, y, z];
            const at = (y, s) => [c(-w / 2 * s, y, -d / 2 * s), c(w / 2 * s, y, -d / 2 * s), c(w / 2 * s, y, d / 2 * s), c(-w / 2 * s, y, d / 2 * s)];
            const lo = at(y0, s0), hi = at(y1, s1);
            const tri = (a, b, e) => { positions.push(...a, ...b, ...e); shades.push(...colour, ...colour, ...colour); };
            for (let i = 0; i < 4; i++) {
                const j = (i + 1) % 4;
                // (wound to face out)
                tri(lo[i], hi[j], lo[j]);
                tri(lo[i], hi[i], hi[j]);
            }
            return hi;
        };
        const top = sink + h;
        let hi;
        if (P.band) {
            const split = top - P.bandM, share = 1 - (1 - P.top) * (split + root) / (top + root);
            frustum(-root, split, 1, share, P.colour);
            hi = frustum(split, top, share, P.top, P.band);
        } else hi = frustum(-root, top, 1, P.top, P.colour);
        const colour = P.band || P.colour;
        positions.push(...hi[0], ...hi[2], ...hi[1], ...hi[0], ...hi[3], ...hi[2]);
        for (let i = 0; i < 6; i++) shades.push(...colour);
        const part = { geometry: RoadMesh.geometry(positions, shades), material: new THREE.MeshLambertMaterial({ vertexColors: true }), height: h, triangles: positions.length / 9 };
        cache.set(id, part);
        return part;
    }

    // A piece as it is drawn near the bike (Scenery.rankStones: the STONE_NEAR_CAP nearest within STONE_NEAR_M), in
    // the far piece's size, seat, top and root, so a stone keeps its place and its outline when it changes level:
    //   granite, short  a block with its edges chamfered and its head dressed to a low dome, each face its own grey
    //   post            a white post with chamfered edges, the black band and a reflector on each face along the road
    //   railPost        a steel post of C section (two flanges and a web) and the spacer block the beam is bolted to
    //   timberPost      a round post of eight faces with a pointed head
    //   tubePost        a round steel post of six faces with a closed head
    // 40 to 60 triangles: the far pieces' 10 and 18 read as boxes from the saddle
    static nearPiece(id) {
        const cache = EdgeStyles.nearPieces || (EdgeStyles.nearPieces = new Map());
        if (cache.has(id)) return cache.get(id);
        const P = EdgeStyles.PIECES[id];
        const [w, h, d] = P.size, sink = Scenery.STONE_SINK_M, root = Scenery.STONE_ROOT_M, top = sink + h;
        const positions = [], shades = [];
        let face = 0;
        // Each face a little lighter or darker than its colour, as dressed stone and weathered paint are
        const tone = (colour, k = 0.04) => { const f = 1 + k * Math.sin(face++ * 2.39 + id.length); return colour.map(c => Math.min(1, c * f)); };
        const tri = (a, b, e, colour) => { positions.push(...a, ...b, ...e); shades.push(...colour, ...colour, ...colour); };
        // A ring of points round the post's axis at height y: a rectangle `sx` by `sz` with its corners cut by `cut`, or a
        // circle of `round` points
        const ring = (y, sx, sz, cut = 0, round = 0) => {
            if (round) return Array.from({ length: round }, (_, k) => { const t = -Math.PI * 3 / 4 + (k / round) * Math.PI * 2; return [Math.cos(t) * sx / 2, y, Math.sin(t) * sz / 2]; });
            const x = sx / 2, z = sz / 2, c = Math.min(cut, x * 0.9, z * 0.9);
            if (!c) return [[-x, y, -z], [x, y, -z], [x, y, z], [-x, y, z]];
            return [[-x + c, y, -z], [x - c, y, -z], [x, y, -z + c], [x, y, z - c], [x - c, y, z], [-x + c, y, z], [-x, y, z - c], [-x, y, -z + c]];
        };
        // The sides between two rings of as many points, wound to face out (as EdgeStyles.piece)
        const band = (lo, hi, colour, k) => {
            for (let i = 0; i < lo.length; i++) {
                const j = (i + 1) % lo.length, c = tone(colour, k);
                tri(lo[i], hi[j], lo[j], c);
                tri(lo[i], hi[i], hi[j], c);
            }
        };
        // A head over a ring: a fan to a point `rise` over the ring's middle
        const head = (hi, rise, colour, k) => {
            const y = hi[0][1] + rise, c = [0, y, 0];
            for (let i = 0; i < hi.length; i++) tri(c, hi[(i + 1) % hi.length], hi[i], tone(colour, k));
        };
        // A box from its middle (x, y, z) and its size, no underside (for the steel's flanges and the spacer)
        const box = (x, y, z, sx, sy, sz, colour) => {
            const out = { positions: [], shades: [] };
            RoadMesh.box(out, x, y, z, sx, sy, sz, 0, tone(colour, 0.06));
            positions.push(...out.positions.slice(0, -18));
            shades.push(...out.shades.slice(0, -18));
        };
        const scale = (y) => 1 - (1 - P.top) * (y + root) / (top + root);
        if (id === 'granite' || id === 'short') {
            const cut = 0.035, crown = top - 0.085;
            const foot = ring(-root, w, d, cut), shoulder = ring(crown, w * scale(crown), d * scale(crown), cut);
            const brow = ring(top - 0.025, w * scale(top) - 0.07, d * scale(top) - 0.07, cut);
            band(foot, shoulder, P.colour, 0.05);
            band(shoulder, brow, P.colour, 0.07);
            head(brow, 0.025, P.colour, 0.05);
        } else if (id === 'post') {
            const split = top - P.bandM, cut = 0.025;
            const foot = ring(-root, w, d, cut), low = ring(split, w * scale(split), d * scale(split), cut), high = ring(top - 0.02, w * scale(top), d * scale(top), cut);
            band(foot, low, P.colour, 0.02);
            band(low, high, P.band, 0.02);
            head(high, 0.02, P.colour, 0.02);
            // The reflector on the band, on each face along the road, a hand proud of it
            const y0 = split + 0.05, y1 = top - 0.06, x = w * scale(top) / 2 - cut - 0.005;
            for (const z of [-1, 1]) {
                const zz = z * (d * scale(top) / 2 + 0.004), a = [-x, y0, zz], b = [x, y0, zz], c = [x, y1, zz], e = [-x, y1, zz];
                const lamp = [0.95, 0.6, 0.12];
                if (z < 0) { tri(a, e, c, lamp); tri(a, c, b, lamp); } else { tri(a, b, c, lamp); tri(a, c, e, lamp); }
            }
        } else if (id === 'railPost') {
            // Two flanges along the road and the web on the side away from it; the spacer between the post and the beam
            const fl = 0.012, half = d / 2;
            box(0, (top - root) / 2, -half + fl / 2, w, top + root, fl, P.colour);
            box(0, (top - root) / 2, half - fl / 2, w, top + root, fl, P.colour);
            box(w / 2 - fl / 2, (top - root) / 2, 0, fl, top + root, d - fl * 2, P.colour);
            const beam = EdgeStyles.LINKS.wBeam, [up, tall] = beam.bars[0];
            box(-w / 2 - 0.04, sink + up - tall / 2, 0, 0.08, 0.22, 0.09, P.colour.map(c => c * 0.9));
        } else if (id === 'timberPost') {
            const foot = ring(-root, w, d, 0, 8), high = ring(top - 0.05, w * scale(top), d * scale(top), 0, 8);
            band(foot, high, P.colour, 0.08);
            head(high, 0.05, P.colour.map(c => c * 0.9), 0.08);
        } else {
            const foot = ring(-root, w, d, 0, 6), high = ring(top, w, d, 0, 6);
            band(foot, high, P.colour, 0.05);
            head(high, 0, P.colour, 0.05);
        }
        const part = { geometry: RoadMesh.geometry(positions, shades), material: EdgeStyles.piece(id).material, height: h, triangles: positions.length / 9 };
        cache.set(id, part);
        return part;
    }

    // A link as it is drawn near the bike, a metre along z as the far link: the W-beam in its own profile, two ridges,
    // seen from both faces; the tubes round. The timber rails and the kerb are the far ones (null)
    static nearLink(id) {
        if (id !== 'wBeam' && id !== 'tubes') return null;
        const cache = EdgeStyles.nearLinks || (EdgeStyles.nearLinks = new Map());
        if (cache.has(id)) return cache.get(id);
        const L = EdgeStyles.LINKS[id], sink = Scenery.STONE_SINK_M;
        const positions = [], shades = [];
        const tri = (a, b, e, colour) => { positions.push(...a, ...b, ...e); shades.push(...colour, ...colour, ...colour); };
        const strip = (points, colourOf, both) => {
            for (let k = 0; k + 1 < points.length; k++) {
                const [x0, y0] = points[k], [x1, y1] = points[k + 1], c = colourOf(k);
                const a = [x0, y0, -0.5], b = [x1, y1, -0.5], e = [x1, y1, 0.5], f = [x0, y0, 0.5];
                // (`both` false: the outside of a ring walked anticlockwise in x, y)
                tri(a, b, e, c); tri(a, e, f, c);
                if (both) { tri(a, e, b, c); tri(a, f, e, c); }
            }
        };
        if (id === 'wBeam') {
            const [up, tall] = L.bars[0], mid = sink + up - tall / 2, half = tall / 2;
            // Across the beam (x out from the posts, y up): a flat edge, a ridge, the valley, a ridge, a flat edge
            const profile = [[0, -half], [-0.07, -half + 0.06], [-0.07, -0.045], [-0.02, 0], [-0.07, 0.045], [-0.07, half - 0.06], [0, half]];
            const points = profile.map(([x, y]) => [L.out + 0.03 + x, mid + y]);
            strip(points, k => L.colour.map(c => c * (k % 3 === 0 ? 0.92 : k % 3 === 1 ? 1.04 : 0.98)), true);
        } else {
            for (const [up, tall] of L.bars) {
                const r = tall / 2, y = sink + up - r, n = 6;
                const points = Array.from({ length: n + 1 }, (_, k) => { const t = (k / n) * Math.PI * 2; return [L.out + Math.cos(t) * r, y + Math.sin(t) * r]; });
                strip(points, k => L.colour.map(c => c * (0.92 + 0.1 * Math.sin(k * Math.PI / 3 + 1.2))), false);
            }
        }
        const part = { geometry: RoadMesh.geometry(positions, shades), material: EdgeStyles.link(id).material, triangles: positions.length / 9 };
        cache.set(id, part);
        return part;
    }

    // A link's geometry (cached): a metre along z (an instance is as long as its two pieces are apart), each bar its
    // two sides and its top, no ends; 6 triangles a bar
    static link(id) {
        if (id === 'kerb') return Scenery.kerbPart();
        const cache = EdgeStyles.links || (EdgeStyles.links = new Map());
        if (cache.has(id)) return cache.get(id);
        const L = EdgeStyles.LINKS[id];
        const positions = [], shades = [];
        const sink = Scenery.STONE_SINK_M;
        for (const [up, tall, thick] of L.bars) {
            const out = { positions: [], shades: [] };
            RoadMesh.box(out, L.out, sink + up - tall / 2, 0, thick, tall, 1, 0, L.colour);
            // (RoadMesh.box lays the two ends first and the underside last)
            positions.push(...out.positions.slice(36, -18));
            shades.push(...out.shades.slice(36, -18));
        }
        const part = { geometry: RoadMesh.geometry(positions, shades), material: new THREE.MeshLambertMaterial({ vertexColors: true }), triangles: positions.length / 9 };
        cache.set(id, part);
        return part;
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { EdgeStyles };
