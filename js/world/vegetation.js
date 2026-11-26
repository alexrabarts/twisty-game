// Vegetation: the colours of a world's trees and bushes, in one place, and the material they are lit with.
//
// The palette and its caps come from the photo match (.agent/sop/photo-match.md, round 5): conifer and larch stands,
// alpine shrubs and grass sampled in the owner's photos of the Tremola and the Leventina. In the photos a conifer
// stand reads dark and grey-blue-green, darker than the grass beside it (HSV saturation 0.17 to 0.43, value 0.24 to
// 0.37 at 300 m to 3 km, the grass 0.36 to 0.57); a shrub slope near the camera is darker still (value 0.10 to 0.33).
// The modelled shapes of assets/trees carry their own vertex colours, made for the legs: a bright yellow-green and
// a teal (saturation 0.55 to 0.76), which drew as lit confetti on the world's slopes, brighter than the land round
// them.
//
// So a world does not draw a shape's colours as they are. Vegetation.shape() keeps each vertex's shading (its
// luminance against the shape's middle, held to SHADE) and takes the hue and the depth from PALETTE, then holds every
// colour inside its class's CAPS. The legs keep the files' own colours: a world shape is its own copy.
//
// Vegetation.material() is the land's lighting (LandShade.patch): a Lambert material, so no sky reflection lights it
// where it does not light the land (the glTF standard material took the whole baked sky as fill and lit trees over
// the land, most of all under the rain's bright cloud), with the land's held-back fill, its floor and its aerial
// perspective, so a distant tree fades as the hillside behind it does.
//
// Colours are sRGB, 0 to 1, as everywhere in the game; the caps are HSV of those.
class Vegetation {
    // Each kind's foliage and wood, and a species' own where it differs from its kind (Scenery.SPECIES `palette`): the
    // larch's soft needles are a lighter, yellower green than the spruce's in the photos of the upper Leventina
    static get PALETTE() {
        return {
            conifer: { foliage: [0.22, 0.29, 0.26], wood: [0.26, 0.22, 0.18] },
            larch: { foliage: [0.27, 0.33, 0.24], wood: [0.28, 0.22, 0.17] },
            broadleaf: { foliage: [0.28, 0.34, 0.25], wood: [0.29, 0.24, 0.19] },
            bush: { foliage: [0.26, 0.31, 0.23], wood: [0.27, 0.23, 0.18] },
            // The shrub (Scenery.SHRUBS), its own green about the bush's: the alpine rose a deep dark green
            rose: { foliage: [0.21, 0.27, 0.2], wood: [0.26, 0.2, 0.16] }
        };
    }

    // The most saturation and value (and the least value) a colour of each kind may have, after its shading
    static get CAPS() {
        return {
            conifer: { s: 0.32, vMin: 0.06, vMax: 0.4 },
            broadleaf: { s: 0.36, vMin: 0.06, vMax: 0.46 },
            bush: { s: 0.36, vMin: 0.06, vMax: 0.44 },
            // The forest of the land and its crown clumps (LandShade.PALETTE forest and openForest, TerrainMesh.clumps)
            forest: { s: 0.45, vMin: 0.06, vMax: 0.32 }
        };
    }

    // How far a vertex's own shading may take it from the palette: its luminance over the shape's middle foliage
    static get SHADE() { return [0.6, 1.35]; }

    static hsv([r, g, b]) {
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        return { s: max > 0 ? (max - min) / max : 0, v: max };
    }

    // Whether an sRGB colour is inside a kind's caps (a little slack for rounding)
    static inCaps(kind, rgb) {
        const cap = Vegetation.CAPS[kind];
        const { s, v } = Vegetation.hsv(rgb);
        return s <= cap.s + 1e-3 && v <= cap.vMax + 1e-3 && v >= cap.vMin - 1e-3;
    }

    // An sRGB colour held inside a kind's caps: the saturation lowered toward its own grey, the value scaled
    static capped(kind, rgb) {
        const cap = Vegetation.CAPS[kind];
        const out = rgb.slice();
        let { s, v } = Vegetation.hsv(out);
        if (s > cap.s) {
            // Each channel toward the brightest by the share over the cap keeps the hue and the value
            const k = cap.s / s;
            for (let c = 0; c < 3; c++) out[c] = v - (v - out[c]) * k;
        }
        ({ v } = Vegetation.hsv(out));
        const want = Math.min(cap.vMax, Math.max(cap.vMin, v));
        if (v > 0 && want !== v) for (let c = 0; c < 3; c++) out[c] *= want / v;
        else if (v === 0) out.fill(cap.vMin);
        return out;
    }

    static toLinear(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
    static toSrgb(c) { return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; }

    // The colour of a part of a kind (foliage or wood) at a shading (1 the palette's own), sRGB, inside the kind's caps.
    // `palette` names a species' own palette (Vegetation.PALETTE), the kind's when it is not given
    static colour(kind, part, shade = 1, palette = kind) {
        const [lo, hi] = Vegetation.SHADE;
        const k = Math.min(hi, Math.max(lo, shade));
        // The shading scales light, so it works in linear
        const rgb = Vegetation.PALETTE[palette || kind][part].map(c => Vegetation.toSrgb(Vegetation.toLinear(c) * k));
        return Vegetation.capped(kind, rgb);
    }

    // A shape's vertex colours (linear, as glTF stores them) in the world's palette: a new colour attribute, linear
    // 16-bit shares, so Graphics.fixColorSpaces leaves it as it is. Wood is a vertex whose green does not lead.
    static recolour(geometry, kind, palette = kind, shade = 1) {
        const stored = geometry.attributes.color;
        const n = geometry.attributes.position.count;
        const out = new Uint16Array(n * 3);
        const read = (i) => {
            if (!stored) return [0.05, 0.1, 0.05];
            const scale = stored.array instanceof Uint16Array ? 65535 : stored.array instanceof Uint8Array ? 255 : 1;
            return [0, 1, 2].map(c => stored.array[i * stored.itemSize + c] / scale);
        };
        const wood = ([r, g]) => g <= r * 1.15;
        const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
        // The middle (median) luminance of the foliage, and of the wood, is the palette's own colour
        const middle = (part) => {
            const list = [];
            for (let i = 0; i < n; i++) { const c = read(i); if (wood(c) === part) list.push(lum(c)); }
            list.sort((a, b) => a - b);
            return list.length ? list[Math.floor(list.length / 2)] || 1e-4 : 1;
        };
        const mid = { foliage: middle(false), wood: middle(true) };
        for (let i = 0; i < n; i++) {
            const c = read(i);
            const part = wood(c) ? 'wood' : 'foliage';
            const rgb = Vegetation.colour(kind, part, lum(c) / mid[part] * shade, palette);
            for (let k = 0; k < 3; k++) out[i * 3 + k] = Math.round(Math.min(1, Vegetation.toLinear(rgb[k])) * 65535);
        }
        const copy = geometry.clone();
        copy.setAttribute('color', new THREE.BufferAttribute(out, 3, true));
        copy.userData.linearColors = true;
        copy.userData.vegetation = kind;
        return copy;
    }

    // The one material of a kind: Lambert, lit as the land (LandShade.patch), double sided (a conifer's boughs are open
    // skirts, seen from under as well), flat shaded as the legs' modelled trees
    static material(kind) {
        Vegetation.materials = Vegetation.materials || {};
        if (!Vegetation.materials[kind]) {
            const material = new THREE.MeshLambertMaterial({ name: `world-${kind}`, vertexColors: true, flatShading: true, side: THREE.DoubleSide });
            material.userData.vegetation = kind;
            Vegetation.materials[kind] = LandShade.patch(material);
        }
        return Vegetation.materials[kind];
    }

    // A plain shape's material (Scenery.plain: no file), the palette's foliage in one colour
    static plainMaterial(kind) {
        Vegetation.plains = Vegetation.plains || {};
        if (!Vegetation.plains[kind]) {
            const [r, g, b] = Vegetation.colour(kind, 'foliage');
            // Authored in sRGB; a material colour is linear in the shader
            const material = new THREE.MeshLambertMaterial({ name: `world-plain-${kind}`, color: new THREE.Color(r, g, b).convertSRGBToLinear(), flatShading: true });
            material.userData.vegetation = kind;
            Vegetation.plains[kind] = LandShade.patch(material);
        }
        return Vegetation.plains[kind];
    }

    // A modelled shape's parts as a world draws them: each part's geometry recoloured (in a species' own palette where
    // it has one, at `shade` of its middle: Scenery.LEVEL_SHADE), each drawn with its kind's material
    static shape(parts, kind, palette = kind, shade = 1) {
        return parts.map(part => ({ geometry: Vegetation.recolour(part.geometry, kind, palette, shade), material: Vegetation.material(kind) }));
    }
}
