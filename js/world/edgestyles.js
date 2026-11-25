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
