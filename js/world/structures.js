// StructureStyles and StructureShade: how the concrete and stone of a world's structures look, and which style each
// structure takes.
//
// StructureStyles is the one table of styles. An overpass (a deck: a side road's over the ride or the land, or a ride
// bridge) takes one of OVERPASS, a tube one of TUBE, by StructureStyles.overpass / tube: a hash of the structure's own
// place and its size, so a structure looks the same every time it is built, at every level of detail and from every
// chunk that draws it. Each style names a LOOK: the surface the shader draws (board-marked, smooth or stone-faced
// concrete, its tone and its age).
//
// StructureShade is the material of every structure (RoadMesh.material): the land's light (LandShade.patch, the sky's
// floor three times the land's under a soffit, the haze) with the surface drawn in the shader, in world space, at no
// cost in triangles. A structure's vertices may carry a mark (`wallFace`: x the part's kind plus 16 times its look, y
// metres of the part's own, StructureShade.KIND); a vertex with none is read by its normal alone (an upright face, a
// soffit, a top). The marks travel with a part's positions as `mark` (StructureShade.begin / end / quad), and
// RoadMesh.addEdgeWorks and RoadMesh.structureMesh lay them into the mesh.
class StructureStyles {
    // The surfaces. `face` 0 board-marked (boards boardM high, butt joints staggered), 1 smooth (formed in panels),
    // 2 stone-faced (granite courses); `tone` multiplies the vertex colour; `age` scales the stains, streaks and lichen;
    // `beamM` the depth of a deck's edge beam (its drip line under it)
    static get LOOKS() {
        return {
            board: { face: 0, tone: [1.0, 0.985, 0.95], age: 0.8, beamM: 0.55 },
            smooth: { face: 1, tone: [1.05, 1.05, 1.03], age: 0.45, beamM: 0.35 },
            stone: { face: 2, tone: [1.0, 0.98, 0.95], age: 0.65, beamM: 0.55 },
            cast: { face: 1, tone: [0.97, 0.97, 0.96], age: 0.7, beamM: 0.45 }
        };
    }

    // The overpass styles. `deck` the section: 'beam' (a slab with an edge beam beamM deep and the slab set in under
    // it), 'girder' (a thin cantilever, the underside sloping in to a box); `pier` 'square' (a shaft under a wider cap,
    // two bearings on it), 'round' (a ten-sided column under a cap), 'tapered' (a shaft narrowing to its foot);
    // `parapet` 'concrete', 'stone' or 'railing' (a low upstand and a steel rail on posts). Every part keeps inside
    // the envelope the plain deck had (DECK_M deep, the pier's box), so no clearance changes
    static get OVERPASS() {
        return {
            slab: { look: 'board', deck: 'beam', pier: 'square', parapet: 'concrete' },
            girder: { look: 'smooth', deck: 'girder', pier: 'round', parapet: 'concrete' },
            stone: { look: 'stone', deck: 'beam', pier: 'square', parapet: 'stone' },
            steel: { look: 'cast', deck: 'beam', pier: 'tapered', parapet: 'railing' }
        };
    }

    // The tube styles: `profile` 'box' (upright walls, a flat roof) or 'round' (the walls curve in to the roof over
    // the walkways, StructureStyles.profile); `portal` the look of the frame, headwall and wings
    static get TUBE() {
        return {
            box: { profile: 'box', portal: 'board' },
            round: { profile: 'round', portal: 'stone' },
            gallery: { profile: 'box', portal: 'cast' }
        };
    }

    // The retaining wall styles: what a wall's face shows under its top `masonryM` of dressed courses (`base`: none,
    // 'rubble' large rough blocks, 'gabion' wire baskets of stone in courses of a metre, 'faced' concrete with a stone
    // facing and weep holes), and how many of the walls that may take it do (`weight`). A wall lower than `tallM` keeps
    // the masonry alone. The stone's blocks grow down the face (`grow`: their size at 6 m down over their size at the
    // top). The shader's table is WALL_GLSL; the order is the code each face carries (StructureStyles.wallCode)
    static get WALLS() {
        return {
            masonry: { base: null, weight: 0.25, grow: 1.6 },
            rubble: { base: 'rubble', weight: 0.3, grow: 1.4 },
            gabion: { base: 'gabion', weight: 0.25, grow: 1.4 },
            faced: { base: 'faced', weight: 0.2, grow: 1.3 }
        };
    }
    static get WALL_RULE() { return { tallM: 3.6, masonryM: 2.2, variants: 4 }; }

    // The style of a retaining wall: `seed` a number that is the same for the whole wall wherever it is drawn (the
    // ride's row its run starts at, or its first point's place), `height` the most its face drops. A mix along a ride,
    // one style for one wall. Returns {name, code}: code = style index times variants plus a variant (stone tone and
    // block size), 0 to 15
    static wall(seed, height) {
        const R = StructureStyles.WALL_RULE, names = Object.keys(StructureStyles.WALLS);
        const h = LandShade.hash(Math.round(seed), 17, 211), v = Math.floor(LandShade.hash(Math.round(seed), 29, 223) * R.variants) % R.variants;
        let name = 'masonry';
        if (height >= R.tallM) {
            let sum = 0;
            for (const [key, style] of Object.entries(StructureStyles.WALLS)) { sum += style.weight; if (h < sum) { name = key; break; } }
        }
        return { name, code: names.indexOf(name) * R.variants + v };
    }

    // A wall's face's second wallFace value: 1 (a wall's face) plus its style's code and its metres down from the top
    static wallFace(code, down) {
        return 1 + 0.025 * code + Math.min(60, Math.max(0, down)) / 5000;
    }

    // The index of a look in LOOKS (the shader's table)
    static lookIndex(name) {
        return Math.max(0, Object.keys(StructureStyles.LOOKS).indexOf(name));
    }

    // A number 0 to 1 from a place (metres), the same wherever it is asked
    static hash(x, z, salt = 0) {
        return LandShade.hash(Math.round(x / 4), Math.round(z / 4), 97 + salt);
    }

    // The style of an overpass whose deck starts at (x, z): `length` its run's metres, `height` the most its deck
    // stands over the land, `ride` whether it is the ride's own bridge. Long high decks are girders on round columns;
    // short low ones slabs or stone-faced; a side road may have a steel rail. The ride's own bridge keeps a solid
    // parapet (its physics wall stands there)
    static overpass({ x = 0, z = 0, length = 0, height = 0, ride = false } = {}) {
        const h = StructureStyles.hash(x, z, ride ? 1 : 0);
        let name;
        if (length > 60 || height > 14) name = h < 0.75 ? 'girder' : 'slab';
        else if (height < 6 && length < 40) name = h < 0.4 ? 'stone' : h < 0.7 ? 'slab' : 'steel';
        else name = h < 0.45 ? 'slab' : h < 0.7 ? 'girder' : h < 0.85 ? 'stone' : 'steel';
        if (ride && name === 'steel') name = 'slab';
        return { name, ...StructureStyles.OVERPASS[name] };
    }

    // The style of a tube run that starts at (x, z): a gallery keeps the box (its valley side opens between pillars);
    // a tunnel is rounded or a box by its place
    static tube({ x = 0, z = 0, gallery = false } = {}) {
        const name = gallery ? 'gallery' : StructureStyles.hash(x, z, 5) < 0.5 ? 'round' : 'box';
        return { name, ...StructureStyles.TUBE[name] };
    }

    // The rounded profile: how far in from each wall the curve reaches (`inM`, never past TUBE_FLOOR_M from the
    // carriageway's edge, so the full roof stands over the whole carriageway) and from how far under the roof it rises
    // (`riseM`). Over the walkway the roof is lower than the box's: the camera reads it (StructureStyles.roofAt)
    static get ROUND() { return { inM: RoadMesh.TUBE_WALL_M - RoadMesh.TUBE_FLOOR_M, riseM: 3.0, pieces: 4, farPieces: 4, minRoofM: 5.5 }; }

    // The roof's height over the floor `d` metres in from the nearer wall of a tube `roof` high, by its profile
    static roofAt(profile, d, roof) {
        if (profile !== 'round' || roof < StructureStyles.ROUND.minRoofM) return roof;
        const R = StructureStyles.ROUND;
        if (d >= R.inM) return roof;
        const t = Math.max(0, d) / R.inM;
        // (a quarter ellipse from the wall at roof - riseM to the roof at inM in)
        return roof - R.riseM + R.riseM * Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t)));
    }

    // The room a point has in a tube: `d` metres in from the nearer wall, `h` over the floor; the least of its room to
    // the wall, under the roof and, in a rounded tube, to the curve (below 0 through it)
    static roomAt(profile, d, h, roof) {
        let room = Math.min(d, roof - h);
        if (profile !== 'round' || roof < StructureStyles.ROUND.minRoofM) return room;
        const R = StructureStyles.ROUND;
        if (h > StructureStyles.roofAt(profile, d, roof)) return Math.min(room, StructureStyles.roofAt(profile, d, roof) - h);
        for (let i = 0; i <= 32; i++) {
            const th = (i / 32) * Math.PI / 2;
            const cd = R.inM - R.inM * Math.cos(th), ch = roof - R.riseM + R.riseM * Math.sin(th);
            room = Math.min(room, Math.hypot(d - cd, h - ch));
        }
        return room;
    }

    // The highest a sphere of radius `r` may stand centred `d` in from the nearer wall and stay clear of the profile
    // (its roof eroded by r): the chase camera's ceiling there
    static ceilingAt(profile, d, roof, r) {
        if (profile !== 'round') return roof - r;
        let low = Infinity;
        for (let k = -8; k <= 8; k++) {
            const dd = d + (r * k) / 8;
            const up = Math.sqrt(Math.max(0, r * r - (dd - d) * (dd - d)));
            // (past the wall is the wall's rule, WorldCamera's faces: only the roof over the tube is read)
            if (dd < 0) continue;
            low = Math.min(low, StructureStyles.roofAt(profile, dd, roof) - up);
        }
        return Math.min(low, roof - r);
    }
}

class StructureShade {
    // The kind of a marked part (wallFace.x less 16 times its look). Its own metres (wallFace.y): a fascia's and a
    // pier's down from their top, a soffit's in from the deck's edge, a parapet's down from its top, a portal's, a
    // headwall's and a wing's up from the road, an arch ring's round it
    static get KIND() {
        return { plain: 0, fascia: 1, soffit: 2, pier: 3, cap: 4, bearing: 5, parapet: 6, rail: 7, portal: 8, headwall: 9, wing: 10, ring: 11, coping: 12 };
    }

    // A railing's steel on its panel (StructureBuild.parapet), in metres up from the upstand: the top rail's and the
    // mid rail's middles, and a post every postM
    static get RAIL() { return { top: 0.46, mid: 0.24, postM: 2 }; }

    // The mark of a part: its kind and its look
    static code(kind, look) {
        return StructureShade.KIND[kind] + 16 * StructureStyles.lookIndex(look);
    }

    // The vertices a part has now; pads its marks to them (parts drawn with no mark read by their normal)
    static begin(out) {
        const n = out.positions.length / 3;
        if (!out.mark) out.mark = [];
        while (out.mark.length < n * 2) out.mark.push(0, 0);
        return n;
    }

    // Marks the vertices from `start` on: `kind`, `look`, and each vertex's own metres `local(x, y, z)`
    static end(out, start, kind, look, local = () => 0) {
        StructureShade.begin(out);
        const code = StructureShade.code(kind, look), p = out.positions;
        for (let v = start; v < p.length / 3; v++) {
            out.mark[v * 2] = code;
            out.mark[v * 2 + 1] = local(p[v * 3], p[v * 3 + 1], p[v * 3 + 2]);
        }
    }

    // A quad (RoadMesh.quad) marked: `locals` each corner's own metres
    static quad(out, a, b, c, d, color, kind, look, locals = [0, 0, 0, 0]) {
        StructureShade.begin(out);
        RoadMesh.quad(out, a, b, c, d, color);
        const code = StructureShade.code(kind, look);
        for (const j of [0, 1, 2, 0, 2, 3]) out.mark.push(code, locals[j]);
    }

    // The marks of a part at its vertex count (zeros for the vertices drawn with none), or null with none at all
    static marks(part) {
        if (!part.mark) return null;
        StructureShade.begin(part);
        return part.mark;
    }

    // The looks as GLSL constants: vec4(face, age, beamM, 0) and the tone
    static looksGLSL() {
        const looks = Object.values(StructureStyles.LOOKS);
        const f = v => (Number.isInteger(v) ? `${v}.0` : `${v}`);
        const n = looks.length;
        return `
const int STRUCT_LOOKS = ${n};
const vec4 STRUCT_LOOK[${n}] = vec4[${n}](${looks.map(l => `vec4(${f(l.face)}, ${f(l.age)}, ${f(l.beamM)}, 0.0)`).join(', ')});
const vec3 STRUCT_TONE[${n}] = vec3[${n}](${looks.map(l => `vec3(${l.tone.map(f).join(', ')})`).join(', ')});`;
    }

    static get GLSL() {
        const K = StructureShade.KIND, f = v => (Number.isInteger(v) ? `${v}.0` : `${v}`);
        return `${StructureShade.looksGLSL()}
float structFbm(vec2 p) { return landNoise(p) * 0.5 + landNoise(p * 2.03 + 7.1) * 0.27 + landNoise(p * 4.1 + 3.7) * 0.15 + landNoise(p * 8.3 + 1.3) * 0.08; }
// Board-marked concrete at (u along, y up): each board 0.15 m high its own tone and grain, its butt joints 2.4 to
// 3.6 m apart and staggered; returns (tone, grain, metres to the nearest joint, board offset)
vec4 structBoard(vec2 p) {
    float b = floor(p.y / 0.15);
    float fy = fract(p.y / 0.15);
    float len = 2.4 + 1.2 * landHash(vec2(b, 4.0));
    float w = p.x / len + landHash(vec2(b, 2.0));
    float col = floor(w), fx = fract(w);
    float joint = min(min(fy, 1.0 - fy) * 0.15, min(fx, 1.0 - fx) * len * 0.6);
    float grain = landNoise(vec2(p.x * 1.7 + col * 13.0, p.y * 38.0));
    return vec4(landHash(vec2(b, col)), grain, joint, landHash(vec2(col, b + 7.0)) - 0.5);
}
// Panel-formed concrete: panels 2.4 by 1.2 m, a faint joint, a tie hole near each corner, bug holes
vec4 structPanel(vec2 p) {
    vec2 q = p / vec2(2.4, 1.2);
    vec2 cell = floor(q), fq = fract(q);
    float joint = min(min(fq.x, 1.0 - fq.x) * 2.4, min(fq.y, 1.0 - fq.y) * 1.2);
    vec2 tie = abs(fract(p / vec2(0.6, 0.6)) - 0.5) * 0.6;
    float hole = length(tie);
    return vec4(landHash(cell), joint, hole, landHash(cell + 3.0) - 0.5);
}
// Granite courses whose height grows with the face (a course 0.3 to 0.45 m), blocks of mixed length, mortar joints
vec4 structStone(vec2 p) {
    // Courses in bands of 1.1 m, each split in two at a height of its own (courses 0.35 to 0.75 m), wandering a little
    float y = p.y + 0.18 * (landNoise(vec2(p.x * 0.35, p.y * 0.25)) - 0.5);
    float band = floor(y / 1.1), inBand = fract(y / 1.1);
    float split = 0.32 + 0.36 * landHash(vec2(band, 5.0));
    float upper = step(split, inBand);
    float row = band * 2.0 + upper;
    float courseH = 1.1 * mix(split, 1.0 - split, upper);
    float vIn = (inBand - upper * split) / mix(split, 1.0 - split, upper);
    // Blocks of their own length (0.5 to 1.4 m): a joint near every 0.95 m, each moved by up to 0.45 m
    float L = 0.95;
    float i = floor(p.x / L + landHash(vec2(row, 3.0)));
    float x = p.x / L + landHash(vec2(row, 3.0));
    float b0 = i + (landHash(vec2(i, row + 1.0)) - 0.5) * 0.45, b1 = i + 1.0 + (landHash(vec2(i + 1.0, row + 1.0)) - 0.5) * 0.45;
    float col = x < b0 ? i - 1.0 : (x > b1 ? i + 1.0 : i);
    float dx = min(abs(x - b0), abs(x - b1)) * L;
    vIn = clamp(vIn + 0.1 * (landHash(vec2(col, row + 5.0)) - 0.5), 0.0, 1.0);
    float joint = min(dx, min(vIn, 1.0 - vIn) * courseH);
    return vec4(landHash(vec2(col, row)), landHash(vec2(row, col + 11.0)) - 0.5, joint, landNoise(vec2(p.x, p.y) * 3.0));
}
// The relief of a face at p (its metres along and up, or across a level face): the height its normal is bent by
float structRelief(float face, float kind, bool level, vec2 p) {
    if (kind == ${f(K.bearing)} || kind == ${f(K.rail)}) return 0.0;
    if (level) {
        vec4 pn = structPanel(p * vec2(1.0, 2.0));
        return -0.004 * (1.0 - smoothstep(0.004, 0.012, pn.y)) + 0.002 * landNoise(p * 6.0);
    }
    if (face > 1.5 || kind == ${f(K.ring)}) {
        vec4 st = structStone(p);
        return 0.02 * smoothstep(0.0, 0.05, st.z) + 0.012 * st.w;
    }
    if (face > 0.5) {
        vec4 pn = structPanel(p);
        return -0.004 * (1.0 - smoothstep(0.004, 0.01, pn.y)) - 0.012 * (1.0 - smoothstep(0.012, 0.022, pn.z)) + 0.0015 * landNoise(p * 9.0);
    }
    vec4 bd = structBoard(p);
    return 0.003 * bd.w - 0.004 * (1.0 - smoothstep(0.003, 0.01, bd.z)) + 0.0015 * bd.y;
}`;
    }

    static get COLOR_GLSL() {
        const K = StructureShade.KIND, f = v => (Number.isInteger(v) ? `${v}.0` : `${v}`);
        return `
{
    float sMark = floor(vStructMark.x + 0.5);
    float sKind = mod(sMark, 16.0);
    int sLook = int(clamp(floor(sMark / 16.0), 0.0, float(STRUCT_LOOKS - 1)));
    float sLocal = vStructMark.y;
    vec4 look = STRUCT_LOOK[sLook];
    float face = sKind == ${f(K.plain)} ? 0.0 : look.x, age = sKind == ${f(K.plain)} ? 0.6 : look.y;
    vec3 sN = normalize(vStructN);
    vec3 P = vLandPos;
    float dist = length(vViewPosition);
    float fine = 1.0 - smoothstep(20.0, 110.0, dist);
    float mid = 1.0 - smoothstep(60.0, 420.0, dist);
    bool down = sN.y < -0.55, up = sN.y > 0.55;
    vec2 tw = normalize(vec2(-sN.z, sN.x) + vec2(1e-4, 0.0));
    float u = dot(P.xz, tw);
    vec2 p = (down || up) ? P.xz : vec2(u, P.y);
    vec3 c = STRUCT_TONE[sLook];
    if (sKind == ${f(K.bearing)}) {
        // A bearing: a steel plate over a laminated pad, dark
        c *= mix(vec3(0.42), vec3(0.62, 0.6, 0.58), step(0.5, fract(sLocal / 0.05))) * (0.9 + 0.2 * landNoise(p * 5.0));
    } else if (sKind == ${f(K.rail)}) {
        // A railing on its panel: a top rail and a mid rail, a post every POST_M; the rest cut away
        float railTop = 1.0 - smoothstep(0.0, 0.01, abs(sLocal - ${f(StructureShade.RAIL.top)}) - 0.035);
        float railMid = 1.0 - smoothstep(0.0, 0.01, abs(sLocal - ${f(StructureShade.RAIL.mid)}) - 0.03);
        float post = 1.0 - smoothstep(0.0, 0.01, abs(fract(u / ${f(StructureShade.RAIL.postM)} + 0.5) - 0.5) * ${f(StructureShade.RAIL.postM)} - 0.035);
        if (max(max(railTop, railMid), post) < 0.5) discard;
        // Galvanised steel: dull, spotted, darker where water runs off the rail
        c *= vec3(0.98, 1.0, 1.04) * (0.85 + 0.25 * landNoise(p * vec2(2.0, 9.0))) * (1.0 - 0.15 * smoothstep(0.6, 0.9, landNoise(vec2(u * 4.0, P.y * 0.5))));
    } else {
        // The surface by its look: stone courses, panels or boards (an arch ring is always stone, in voussoirs)
        if (sKind == ${f(K.ring)}) {
            float block = fract(sLocal / 0.42);
            float joint = min(block, 1.0 - block) * 0.42;
            c *= (0.82 + 0.3 * landHash(vec2(floor(sLocal / 0.42), 31.0))) * mix(0.62, 1.0, smoothstep(0.006, 0.03, joint) * fine + 1.0 - fine);
        } else if (face > 1.5 && !down && !up && sKind != ${f(K.soffit)}) {
            vec4 st = structStone(p);
            float tone = (0.66 + 0.5 * st.x + 0.3 * (st.w - 0.5)) * (0.85 + 0.3 * structFbm(p * 0.4));
            vec3 block = vec3(tone * (1.0 + 0.1 * st.y), tone, tone * (1.0 - 0.1 * st.y));
            c *= mix(block * mix(0.7, 1.0, smoothstep(0.004, 0.025, st.z)), vec3(0.86), 1.0 - mid);
        } else if (face > 0.5 || down || up) {
            vec4 pn = structPanel(down || up ? p : p);
            c *= 1.0 + 0.07 * pn.w * mid;
            c *= mix(1.0, mix(0.8, 1.0, smoothstep(0.003, 0.012, pn.y)), fine);
            if (!down && !up) c *= mix(1.0, mix(0.45, 1.0, smoothstep(0.012, 0.022, pn.z)), fine);
            // bug holes
            c *= 1.0 - 0.25 * fine * step(0.93, landNoise(p * 31.0));
        } else {
            vec4 bd = structBoard(p);
            c *= (0.93 + 0.12 * bd.x * mid) * (0.95 + 0.1 * bd.y * fine);
            c *= mix(1.0, mix(0.76, 1.0, smoothstep(0.003, 0.012, bd.z)), fine);
            // tie holes in rows, plugged a shade darker
            vec2 tie = (fract(vec2(u / 0.9, P.y / 0.6) + 0.5) - 0.5) * vec2(0.9, 0.6);
            c *= mix(1.0, mix(0.6, 1.0, smoothstep(0.014, 0.024, length(tie))), fine);
        }
        // Pour lifts: a tone of its own each 2.4 m up, and the cold joint between them
        if (!down && !up) {
            float lift = floor(P.y / 2.4);
            c *= 1.0 + 0.06 * (landHash(vec2(lift, 17.0)) - 0.5) * mid;
            c *= mix(1.0, 0.82, (1.0 - smoothstep(0.006, 0.02, abs(fract(P.y / 2.4) - 0.5) * 2.4 - 1.18)) * fine * step(face, 1.5));
        }
        // Broad weathering over metres, and the stains of water: streaks down an upright face, darkest under its top
        float broad = structFbm((down || up ? P.xz : vec2(u, P.y)) * 0.22 + 3.0);
        c *= 0.84 + 0.3 * broad;
        if (!down && !up) {
            float streak = smoothstep(0.55, 0.85, landNoise(vec2(u * 2.6, P.y * 0.1 + landNoise(vec2(u * 0.4, 1.0)) * 2.0)));
            float fromTop = 1.0;
            if (sKind == ${f(K.fascia)} || sKind == ${f(K.pier)} || sKind == ${f(K.parapet)} || sKind == ${f(K.cap)}) fromTop = 1.0 - 0.6 * smoothstep(0.5, 4.0, sLocal);
            c *= 1.0 - 0.3 * age * streak * fromTop;
            // lichen and soot: yellow-grey and green-black blotches, more on an old face
            float lichen = smoothstep(0.62, 0.82, structFbm(vec2(u, P.y) * 0.9 + 11.0)) * age;
            c = mix(c, c * vec3(1.08, 1.06, 0.82), lichen * 0.6);
            float soot = smoothstep(0.66, 0.86, structFbm(vec2(u, P.y) * 0.5 + 23.0)) * age;
            c = mix(c, c * vec3(0.72, 0.75, 0.68), soot * 0.5);
        }
        // A deck's fascia: the edge beam (its own pour, a shade lighter), the dark drip under it, rust from the drains
        if (sKind == ${f(K.fascia)}) {
            float beam = look.z;
            c *= sLocal < beam ? 1.04 : 0.9;
            c *= 1.0 - 0.35 * (1.0 - smoothstep(0.02, 0.1, abs(sLocal - beam + 0.04))) * step(sLocal, beam);
            float drain = floor(u / 9.0);
            float at = abs(fract(u / 9.0) - 0.5) * 9.0;
            float rust = step(0.55, landHash(vec2(drain, 41.0))) * (1.0 - smoothstep(0.05, 0.35 + 0.2 * landNoise(vec2(P.y * 2.0, drain)), at)) * smoothstep(0.1, 0.4, sLocal);
            c = mix(c, c * vec3(1.05, 0.72, 0.5), rust * 0.7 * age);
        }
        // A soffit: damp and dark, efflorescence along some panel joints, the drip line under the edge beam, the
        // wettest strip along the edges
        if (sKind == ${f(K.soffit)} || down) {
            float damp = smoothstep(0.45, 0.8, structFbm(P.xz * 0.35 + 5.0));
            c *= 1.0 - 0.3 * damp * age;
            vec4 pn = structPanel(P.xz);
            float lime = step(0.6, landHash(floor(P.xz / vec2(2.4, 1.2)) + 9.0)) * (1.0 - smoothstep(0.01, 0.12 + 0.1 * landNoise(P.xz * 3.0), pn.y));
            c = mix(c, vec3(0.78, 0.77, 0.73), lime * 0.5 * age * mid);
            if (sKind == ${f(K.soffit)}) {
                c *= 1.0 - 0.45 * (1.0 - smoothstep(0.015, 0.04, abs(sLocal - 0.12))) * fine;
                c *= 1.0 - 0.18 * (1.0 - smoothstep(0.2, 1.2, sLocal)) * age;
            }
        }
        // A top: grit and lichen where water stands
        if (up) c *= 0.9 + 0.15 * landNoise(P.xz * 3.0) - 0.12 * smoothstep(0.55, 0.8, structFbm(P.xz * 0.6)) * age;
        // A portal's, headwall's or wing's foot: the road's spray, dark a metre up
        if (sKind == ${f(K.portal)} || sKind == ${f(K.headwall)} || sKind == ${f(K.wing)}) c = mix(c, c * 0.55, (1.0 - smoothstep(0.2, 1.4 + 0.4 * landNoise(vec2(u, 2.0)), sLocal)) * 0.7);
        // A pier's top under its bearings: the water off the deck
        if (sKind == ${f(K.cap)}) c *= 0.9;
    }
    diffuseColor.rgb *= c;
}`;
    }

    static get NORMAL_GLSL() {
        return `
{
    float near = 1.0 - smoothstep(15.0, 70.0, length(vViewPosition));
    if (near > 0.0) {
        float sMark = floor(vStructMark.x + 0.5);
        float sKind = mod(sMark, 16.0);
        int sLook = int(clamp(floor(sMark / 16.0), 0.0, float(STRUCT_LOOKS - 1)));
        float face = sKind == 0.0 ? 0.0 : STRUCT_LOOK[sLook].x;
        vec3 nW = normalize(vStructN);
        bool level = abs(nW.y) > 0.55;
        vec3 along = level ? vec3(1.0, 0.0, 0.0) : normalize(vec3(-nW.z, 0.0, nW.x) + vec3(1e-4, 0.0, 0.0));
        vec3 other = level ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
        vec2 p = level ? vLandPos.xz : vec2(dot(vLandPos.xz, along.xz), vLandPos.y);
        float e = 0.01;
        float h0 = structRelief(face, sKind, level, p);
        float gu = (structRelief(face, sKind, level, p + vec2(e, 0.0)) - h0) / e;
        float gv = (structRelief(face, sKind, level, p + vec2(0.0, e)) - h0) / e;
        vec3 tu = normalize((viewMatrix * vec4(along, 0.0)).xyz), tv = normalize((viewMatrix * vec4(other, 0.0)).xyz);
        normal = normalize(normal - near * (gu * tu + gv * tv));
    }
}`;
    }

    // The material of every structure: the land's light with the sky's floor three times the land's (a soffit and a
    // tube's roof are seen from under, away from the sun), the surface drawn as above
    static material() {
        if (StructureShade.shared) return StructureShade.shared;
        const material = LandShade.patch(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), { floor: 3 });
        material.name = 'world-structure';
        const land = material.onBeforeCompile;
        material.onBeforeCompile = (shader, renderer) => {
            land(shader, renderer);
            shader.vertexShader = shader.vertexShader
                .replace('#include <common>', '#include <common>\nattribute vec2 wallFace;\nvarying vec2 vStructMark;\nvarying vec3 vStructN;')
                .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvStructMark = wallFace;\nvStructN = mat3(modelMatrix) * objectNormal;');
            shader.fragmentShader = shader.fragmentShader
                .replace('#include <common>', '#include <common>\nvarying vec2 vStructMark;\nvarying vec3 vStructN;')
                .replace('#include <color_fragment>', `#include <color_fragment>${StructureShade.COLOR_GLSL}`)
                .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>${StructureShade.NORMAL_GLSL}`);
            // (the helpers after LandShade's noise, which they use)
            shader.fragmentShader = shader.fragmentShader.replace('void main() {', `${StructureShade.GLSL}\nvoid main() {`);
        };
        const key = material.customProgramCacheKey;
        material.customProgramCacheKey = () => `${key()}-structure-1`;
        StructureShade.shared = material;
        return material;
    }
}

// The parts of a styled structure, into a part's {positions, shades, mark} (StructureShade's marks). Each keeps inside
// the envelope the plain part had: a deck within DECK_M under its road between its edges, a pier within its box
class StructureBuild {
    // One segment of a deck between rows a and b: `la`, `lb`, `ra`, `rb` the top corners at its edges (the road's
    // height), `style` an OVERPASS style. 'beam': each fascia down beamM (the edge beam), the beam's underside in
    // BEAM_IN_M, the slab's face down to D and the soffit between; 'girder': a thin cantilever, its underside sloping
    // in to the box's webs, the box's bottom at D
    static get BEAM_IN_M() { return 0.3; }
    static deck(out, la, lb, ra, rb, style, D, color) {
        const look = style.look, beam = StructureStyles.LOOKS[look].beamM, top = 0.02;
        const at = (p, q, m, depth) => {
            const dx = q[0] - p[0], dz = q[2] - p[2], len = Math.hypot(dx, dz) || 1;
            return [p[0] + (dx / len) * m, p[1] - depth, p[2] + (dz / len) * m];
        };
        const span = Math.min(Math.hypot(ra[0] - la[0], ra[2] - la[2]), Math.hypot(rb[0] - lb[0], rb[2] - lb[2]));
        // The section's steps from the edge in: [metres in, depth] down the outside and across the underside
        const girder = style.deck === 'girder' && span > 4;
        const steps = girder ? [[0, top], [0, beam], [span * 0.26, 0.5], [span * 0.26 + 0.6, D]] : [[0, top], [0, beam], [StructureBuild.BEAM_IN_M, beam], [StructureBuild.BEAM_IN_M, D]];
        const Q = StructureShade.quad;
        for (const [pa, pb, qa, qb, left] of [[la, lb, ra, rb, true], [ra, rb, la, lb, false]]) {
            for (let k = 0; k + 1 < steps.length; k++) {
                const [m0, d0] = steps[k], [m1, d1] = steps[k + 1];
                const a0 = at(pa, qa, m0, d0), b0 = at(pb, qb, m0, d0), a1 = at(pa, qa, m1, d1), b1 = at(pb, qb, m1, d1);
                // (an upright face is a fascia, its metres down from the top; one turned down a soffit, its metres in)
                const upright = Math.abs(m1 - m0) < Math.abs(d1 - d0) * 0.5;
                const kind = upright ? 'fascia' : 'soffit';
                const locals = upright ? [d0, d0, d1, d1] : [m0, m0, m1, m1];
                // (wound as the plain deck's: the left side's from a to b, the right side's from b to a, so a face
                // turned down has its normal down)
                if (upright) {
                    if (left) Q(out, a0, b0, b1, a1, color, kind, look, locals);
                    else Q(out, b0, a0, a1, b1, color, kind, look, [locals[1], locals[0], locals[3], locals[2]]);
                } else if (left) Q(out, a0, b0, b1, a1, color, kind, look, locals);
                else Q(out, a1, b1, b0, a0, color, kind, look, [locals[3], locals[2], locals[1], locals[0]]);
            }
        }
        // The soffit between the two sides' last steps
        const [m, d] = steps[steps.length - 1];
        Q(out, at(la, ra, m, d), at(lb, rb, m, d), at(rb, lb, m, d), at(ra, la, m, d), color, 'soffit', look, [m, m, m, m]);
    }

    // A pier in its box ({x, z, top, foot, width, depth, heading}, RoadMesh.pierAt) by `style`: two bearings under the
    // deck, a cap the box's full plan, the shaft under it (square, round or tapered) to the foot
    static get BEARING_M() { return 0.3; }
    static get CAP_M() { return 0.7; }
    static pier(out, pier, style, color) {
        const look = style.look, { x, z, top, foot, width: w, depth: d, heading } = pier;
        const B = StructureBuild.BEARING_M, capTop = top - B, capFoot = Math.max(foot + 0.5, capTop - StructureBuild.CAP_M);
        const fs = Math.sin(heading), fc = Math.cos(heading);
        const P = (u, y, v) => [x + u * fc + v * fs, y, z - u * fs + v * fc];
        let start = StructureShade.begin(out);
        // (each bearing its four sides only: its top is the soffit's plane and its foot the cap's)
        for (const side of [-1, 1]) {
            const bw = Math.max(0.3, Math.min(0.5, w * 0.3)) / 2, bd = Math.max(0.3, Math.min(0.5, d * 0.45)) / 2, u0 = side * w * 0.26;
            const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
            for (let k = 0; k < 4; k++) {
                const [a0, b0] = c[k], [a1, b1] = c[(k + 1) % 4];
                RoadMesh.quad(out, P(u0 + a0 * bw, capTop, b0 * bd), P(u0 + a1 * bw, capTop, b1 * bd), P(u0 + a1 * bw, top, b1 * bd), P(u0 + a0 * bw, top, b0 * bd), color);
            }
        }
        StructureShade.end(out, start, 'bearing', look, (px, py) => top - py);
        start = StructureShade.begin(out);
        RoadMesh.box(out, x, (capTop + capFoot) / 2, z, w, capTop - capFoot, d, heading, color);
        StructureShade.end(out, start, 'cap', look, (px, py) => capTop - py);
        start = StructureShade.begin(out);
        const kind = style.pier;
        if (kind === 'round') {
            const r = Math.min(w * 0.72, d * 0.9) / 2, n = 10;
            for (let k = 0; k < n; k++) {
                const t0 = (k / n) * Math.PI * 2, t1 = ((k + 1) / n) * Math.PI * 2;
                const a = [Math.cos(t0) * r, Math.sin(t0) * r], b = [Math.cos(t1) * r, Math.sin(t1) * r];
                RoadMesh.quad(out, P(a[0], foot, a[1]), P(b[0], foot, b[1]), P(b[0], capFoot, b[1]), P(a[0], capFoot, a[1]), color);
            }
        } else {
            // (square: a shaft set in under the cap; tapered: wide under the cap, narrowing to its foot)
            const tw = w * 0.6, td = d * 0.6, fw = kind === 'tapered' ? tw * 0.62 : tw, fd = kind === 'tapered' ? td * 0.75 : td;
            const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
            for (let k = 0; k < 4; k++) {
                const [u0, v0] = c[k], [u1, v1] = c[(k + 1) % 4];
                RoadMesh.quad(out, P(u0 * fw / 2, foot, v0 * fd / 2), P(u1 * fw / 2, foot, v1 * fd / 2), P(u1 * tw / 2, capFoot, v1 * td / 2), P(u0 * tw / 2, capFoot, v0 * td / 2), color);
            }
        }
        StructureShade.end(out, start, 'pier', look, (px, py) => capFoot - py);
    }

    // A parapet's run (RoadMesh.rails' segments) by `style`: concrete or stone as RoadMesh.rails lays it, or a railing:
    // a low upstand and two steel rails on posts (StructureShade.RAIL), to the same height
    static get UPSTAND_M() { return 0.3; }
    static parapet(out, segments, w, h, style, color) {
        let start = StructureShade.begin(out);
        if (style.parapet !== 'railing') {
            RoadMesh.rails(out, segments, w, h, color);
            StructureShade.end(out, start, 'parapet', style.parapet === 'stone' ? 'stone' : style.look, (px, py, pz) => {
                let best = Infinity, y = py;
                for (const s of segments) for (const p of [s.pa, s.pb]) { const dd = Math.hypot(p[0] - px, p[2] - pz); if (dd < best) { best = dd; y = p[1]; } }
                return Math.max(0, y + h - py);
            });
            return;
        }
        // (the steel is one upright panel on the upstand's outer face, from its top to the parapet's height, its foot
        // on the upstand's own corners (a foot set in from them left corners a hand apart, world-structures): the
        // shader draws the rails and the posts on it and cuts the rest away, RAIL_GLSL; its metres up from the
        // upstand in wallFace y)
        const up = StructureBuild.UPSTAND_M;
        RoadMesh.rails(out, segments, w, up, color);
        StructureShade.end(out, start, 'parapet', style.look, () => 0);
        const steel = [0.62, 0.63, 0.64];
        const lift = (p, o, dy) => [p[0], p[1] + dy, p[2]];
        for (const s of segments) {
            if (s.drawn === false) continue;
            StructureShade.quad(out, lift(s.pa, s.o, up), lift(s.pb, s.o, up), lift(s.pb, s.o, h), lift(s.pa, s.o, h), steel, 'rail', style.look, [0, 0, h - up, h - up]);
        }
    }
}

// The face that closes a rounded tube's portal (StructureStyles.ROUND): in the portal's plane at the walls' feet
// `l`, `r`, from each top corner of the box the frame stands round down to the curve, so the hollow behind the curve
// is not seen. Marked as the portal's face, `look` its style's
StructureBuild.portalFill = (out, l, r, roof, look, color) => {
    const R = StructureStyles.ROUND, n = R.pieces;
    if (roof < R.minRoofM) return;
    const span = Math.hypot(r[0] - l[0], r[2] - l[2]) || 1, half = span / 2;
    const at = (lat, h) => {
        const t = (lat + half) / span;
        return [l[0] + (r[0] - l[0]) * t, l[1] + (r[1] - l[1]) * t + h, l[2] + (r[2] - l[2]) * t];
    };
    const start = StructureShade.begin(out);
    for (const sign of [-1, 1]) {
        const corner = at(sign * half, roof);
        for (let i = 0; i < n; i++) {
            const curve = j => { const th = (j / n) * Math.PI / 2; return at(sign * (half - R.inM + R.inM * Math.cos(th)), roof - R.riseM + R.riseM * Math.sin(th)); };
            const a = curve(i), b = curve(i + 1);
            RoadMesh.quad(out, corner, a, b, corner, color);
        }
    }
    StructureShade.end(out, start, 'portal', look, (x, y) => y - (l[1] + r[1]) / 2);
};
