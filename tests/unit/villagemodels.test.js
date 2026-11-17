// The Blender-made village of night-ride (js/sceneassets.js, assets/village,
// built by tools/blender/village_*.py): the committed files fit their
// budgets and hold what the game reads, and swapping the procedural village
// for the modelled one keeps its plots, the line the house fronts stand on,
// the scene's lights and the build's random sequence. A file that fails
// leaves the procedural village.
// Real modules on real three r150; fetch reads the files from disk.
import { readFileSync, statSync } from 'node:fs';
import { Blob } from 'node:buffer';
import { TextDecoder } from 'node:util';
import { canvasStub, legs, loadScript, realThree } from '../helpers/load-game.js';

const root = new URL('../../', import.meta.url);
const NIGHT = 6;
const BUDGET = { house: 9000, prop: 1200, bytes: 800 * 1024, meshes: 3, triangles: 120000 };
// The night's bloom threshold (js/graphics.js, SKY_PRESETS.night)
const BLOOM = 1.8;
const TAGS = ['body', 'wall', 'shutter', 'glass', 'lamp'];

function load({ failing = [], assets = true, course = false } = {}) {
    const THREE = realThree();
    const files = ['terrain.js', ...(course ? ['course.js'] : []), 'world/route.js', 'world/legroute.js', 'world/ground.js', 'vehicle.js', 'environment.js', 'tours.js', ...(assets ? ['sceneassets.js'] : [])];
    const source = files.map(loadScript).join('\n;\n');
    const log = [];
    const sink = { log() {}, warn: (...a) => log.push(a.join(' ')), error: (...a) => log.push(a.join(' ')) };
    const fetch = async url => {
        if (failing.some(part => url.includes(part))) return { ok: false, status: 404 };
        const bytes = readFileSync(new URL(url, root));
        return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
    };
    const factory = new Function(
        'THREE', 'document', 'localStorage', 'console', 'fetch', 'Blob', 'TextDecoder', 'performance',
        `${source}\nreturn { Environment, TourSystem, Terrain, SceneAssets: typeof SceneAssets === 'undefined' ? null : SceneAssets };`
    );
    const game = factory(THREE, canvasStub(), { getItem: () => null, setItem() {} }, sink, fetch, Blob, TextDecoder, performance);
    return { THREE, log, ...game };
}

function build(game, index = NIGHT) {
    const leg = legs(game)[index];
    const scene = new game.THREE.Scene();
    const env = new game.Environment(scene, leg.startSegment, leg.endSegment, index);
    scene.updateMatrixWorld(true);
    return env;
}

const village = env => env.scene.children.find(child => child.userData.setPiece === 'village');
const tagged = env => village(env).children.filter(mesh => mesh.userData.dressing && mesh.userData.dressing.kind === 'village');
const triangles = geometry => (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
const lights = env => {
    let count = 0;
    env.scene.traverse(o => { if (o.isLight) count++; });
    return count;
};
// Where a vertex of a village mesh is from the road: metres past the road's
// edge (negative over the road) and above the road, at the nearest road point
function offsets(env, mesh) {
    const { position } = mesh.geometry.attributes;
    const [piece] = env.setPieces.filter(p => p.type === 'village');
    const points = env.roadPath.slice(piece.from - 1, piece.to + 2);
    const out = [];
    for (let i = 0; i < position.count; i++) {
        const x = position.getX(i) + mesh.position.x;
        const y = position.getY(i) + mesh.position.y;
        const z = position.getZ(i) + mesh.position.z;
        let best = null;
        for (const p of points) {
            const along = (x - p.x) * Math.sin(p.heading) + (z - p.z) * Math.cos(p.heading);
            if (!best || Math.abs(along) < Math.abs(best.along)) best = { along, p };
        }
        const { p } = best;
        const lateral = (x - p.x) * Math.cos(p.heading) - (z - p.z) * Math.sin(p.heading);
        out.push({ past: Math.abs(lateral) - env.roadWidth / 2, up: y - p.y });
    }
    return out;
}

const least = list => list.reduce((min, { past }) => Math.min(min, past), Infinity);

describe('the village files', () => {
    const game = load();
    const { village: spec } = game.SceneAssets.LEGS[NIGHT];
    let houses;
    let props;

    beforeAll(async () => {
        houses = await game.SceneAssets.loadModel(spec.houses);
        props = await game.SceneAssets.loadModel(spec.props);
    });

    test('the leg asks for its two files, and they fit the download budget', () => {
        const files = game.SceneAssets.files(NIGHT);
        expect(files).toEqual([spec.houses, spec.props]);
        expect(files.reduce((sum, file) => sum + statSync(new URL(file, root)).size, 0)).toBeLessThanOrEqual(BUDGET.bytes);
    });

    test('there are at least four houses, each within its triangle budget, with the ends of its front marked', () => {
        const names = [...houses.meshes.keys()].filter(name => name.startsWith('house_'));
        expect(names.length).toBeGreaterThanOrEqual(4);
        names.forEach(name => {
            const parts = houses.meshes.get(name);
            expect(parts.reduce((sum, part) => sum + triangles(part.geometry), 0)).toBeLessThanOrEqual(BUDGET.house);
            const left = houses.places.get(`${name}:left`);
            const right = houses.places.get(`${name}:right`);
            // A house is centred on its plot, and narrower than the 20 m from one plot to the next
            expect(left.x).toBeCloseTo(-right.x, 3);
            expect(right.x * 2).toBeGreaterThan(8);
            expect(right.x * 2).toBeLessThan(18);
            expect([left.y, left.z, right.y, right.z]).toEqual([0, 0, 0, 0]);
        });
    });

    test('a house is walls to tint, shutters to tint, numbered window glass and a lit lantern, in colours and no texture', () => {
        [...houses.meshes.entries()].forEach(([name, parts]) => {
            const kinds = parts.map(part => part.material.name);
            kinds.forEach(kind => expect(TAGS).toContain(kind));
            ['body', 'wall', 'shutter', 'glass'].forEach(kind => expect(kinds).toContain(kind));
            parts.forEach(({ geometry, material }) => {
                expect(material.map).toBeNull();
                expect(geometry.attributes.color.count).toBe(geometry.attributes.position.count);
                expect(geometry.attributes.uv).toBeUndefined();
            });
            // Windows are numbered from 0 with no gap, so each can be lit or dark on its own
            const glass = parts.find(part => part.material.name === 'glass').geometry.attributes.color;
            const numbers = new Set();
            for (let i = 0; i < glass.count; i++) numbers.add(glass.array[i * glass.itemSize]);
            expect(numbers.size).toBeGreaterThanOrEqual(8);
            expect(Math.max(...numbers)).toBe(numbers.size - 1);
            // The front is the plane z = 0: nothing at walking height stands more than a step in front of it
            parts.forEach(({ geometry }) => {
                const { position } = geometry.attributes;
                let low = Infinity;
                let any = Infinity;
                for (let i = 0; i < position.count; i++) {
                    if (position.getY(i) < 2.2) low = Math.min(low, position.getZ(i));
                    any = Math.min(any, position.getZ(i));
                }
                expect(low).toBeGreaterThan(-0.9);
                expect(any).toBeGreaterThan(-1.6);
            });
            expect(name).toMatch(/^house_[a-z]+$/);
        });
    });

    test('the props are the wall sections the game lays and a lamp post with its light marked', () => {
        const length = props.places.get('wall_plain:end').x;
        expect(length).toBe(game.SceneAssets.VILLAGE.section);
        new Set(game.SceneAssets.VILLAGE.walls).forEach(name => {
            const parts = props.meshes.get(name);
            expect(parts.reduce((sum, part) => sum + triangles(part.geometry), 0)).toBeLessThanOrEqual(BUDGET.prop);
            expect(props.places.get(`${name}:end`).x).toBe(length);
            const box = new game.THREE.Box3();
            parts.forEach(({ geometry }) => box.union(geometry.boundingBox));
            expect(box.min.x).toBeGreaterThanOrEqual(-1e-3);
            expect(box.max.x).toBeLessThanOrEqual(length + 1e-3);
            // As high as the ground behind it climbs (js/terrain.js, streetSide: 7 m)
            expect(box.max.y).toBeGreaterThan(7);
        });
        const post = props.meshes.get('lamp_post');
        expect(post.map(part => part.material.name).sort()).toEqual(['body', 'lamp']);
        const light = props.places.get('lamp_post:light');
        expect(light.y).toBeGreaterThan(3.5);
        // The lantern hangs toward the road, short of the kerb 1.2 m away
        expect(light.z).toBeLessThan(0);
        expect(light.z).toBeGreaterThan(-1.2);
    });
});

describe('night-ride with its modelled village', () => {
    const plain = build(load({ assets: false }));
    const game = load();
    const env = build(game);
    const before = {
        meshes: village(env).children.length,
        tagged: tagged(env).length,
        origin: village(env).children[0].position.clone(),
        plots: JSON.stringify(village(env).userData.village),
        lights: lights(env),
        randState: env.randState,
        boulders: JSON.stringify(env.boulders),
        pools: village(env).children.find(mesh => !mesh.userData.dressing)
    };
    const sample = e => e.roadPath.slice(580, 594).flatMap(p => [-14, -11.2, -9, 0, 9, 11.2, 14].map(l => e.groundYAt(p.x + Math.cos(p.heading) * l, p.z - Math.sin(p.heading) * l)));
    const ground = sample(env);
    let result;

    beforeAll(async () => {
        result = await env.dressing;
    });

    test('the procedural village is built first, as a build without the assets builds it', () => {
        expect(before.meshes).toBe(5);
        expect(before.tagged).toBe(4);
        expect(before.plots).toBe(JSON.stringify(village(plain).userData.village));
        expect(before.randState).toBe(plain.randState);
        village(plain).children.forEach(mesh => expect(mesh.position.toArray()).toEqual(before.origin.toArray()));
    });

    test('every plot gets a house and a lamp post, and every gap between two houses a garden wall', () => {
        const plots = JSON.parse(before.plots).plots;
        expect(plots).toHaveLength(16);
        expect(result.village.error).toBeUndefined();
        expect(result.village.houses).toBe(plots.length);
        expect(result.village.lamps).toBe(plots.length);
        // Seven gaps a side, each of one section or more
        expect(result.village.walls).toBeGreaterThanOrEqual(14);
        expect(tagged(env)).toHaveLength(0);
        expect(result.bytes).toBe(game.SceneAssets.files(NIGHT).reduce((sum, file) => sum + statSync(new URL(file, root)).size, 0));
    });

    test('the village is three meshes at the set piece\'s centre, within its triangle budget', () => {
        const meshes = village(env).children;
        expect(meshes.length).toBeLessThanOrEqual(BUDGET.meshes);
        expect(result.village.meshes).toBe(2);
        meshes.forEach(mesh => expect(mesh.position.toArray()).toEqual(before.origin.toArray()));
        expect(meshes).toContain(before.pools);
        const total = meshes.reduce((sum, mesh) => sum + triangles(mesh.geometry) * (mesh.isInstancedMesh ? mesh.count : 1), 0);
        expect(total).toBeLessThanOrEqual(BUDGET.triangles);
        expect(result.village.triangles).toBeGreaterThan(40000);
    });

    test('it adds no light, and its lit glass and lamps are over the night\'s bloom threshold', () => {
        expect(lights(env)).toBe(before.lights);
        const glass = village(env).children.find(mesh => mesh.userData.modelled === 'village' && mesh.material.isMeshBasicMaterial);
        const { color } = glass.geometry.attributes;
        // A vertex holds a share of the material's colour, which is over 1
        const gain = glass.material.color.r;
        expect(gain).toBe(game.SceneAssets.VILLAGE.shine);
        let bright = 0;
        for (let i = 0; i < color.count; i++) if (Math.max(color.getX(i), color.getY(i), color.getZ(i)) * gain > BLOOM) bright++;
        expect(result.village.lit).toBeGreaterThan(60);
        // The four corners at the middle of a lit window, and a lamp's glass
        expect(bright).toBeGreaterThanOrEqual(result.village.lit * 4 + result.village.lamps * 4);
        expect(glass.castShadow).toBe(false);
    });

    test('some windows are dark, and the lamplight on the walls is baked, strongest near a lamp', () => {
        const walls = village(env).children.find(mesh => mesh.material.isMeshStandardMaterial && mesh.userData.modelled === 'village');
        const { color } = walls.geometry.attributes;
        expect(color.itemSize).toBe(4);
        // The game decodes every float colour it finds as sRGB (js/graphics.js,
        // fixColorSpaces): these are decoded already, and must not be floats
        [walls, village(env).children.find(mesh => mesh.material.isMeshBasicMaterial && mesh.userData.modelled === 'village')].forEach(mesh => {
            expect(mesh.geometry.attributes.color.array).not.toBeInstanceOf(Float32Array);
            expect(mesh.geometry.attributes.color.normalized).toBe(true);
        });
        let lit = 0;
        let most = 0;
        let least = Infinity;
        for (let i = 0; i < color.count; i++) {
            const glow = color.getW(i);
            if (glow > 0.05) lit++;
            most = Math.max(most, glow);
            least = Math.min(least, glow);
        }
        expect(least).toBeGreaterThanOrEqual(0);
        expect(most).toBeLessThanOrEqual(1);
        expect(most).toBeGreaterThan(0.5);
        expect(lit / color.count).toBeGreaterThan(0.1);
        expect(lit / color.count).toBeLessThan(0.9);
        // The glow is three's own emissive term, scaled by the vertex: a three whose shader lacks the chunk must fail here
        const lib = game.THREE.ShaderLib.standard;
        const shader = { uniforms: {}, vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader };
        walls.material.onBeforeCompile(shader);
        expect(shader.fragmentShader).toContain('totalEmissiveRadiance *= vColor.rgb * vColor.a;');
    });

    test('nothing stands over the road, and nothing but a lamp post stands on the pavement', () => {
        const front = JSON.parse(before.plots).front - env.roadWidth / 2;
        expect(front).toBe(3);
        village(env).children.filter(mesh => mesh.userData.modelled === 'village').forEach(mesh => {
            const all = offsets(env, mesh);
            // A lantern's arm reaches to the kerb, 4 m up
            expect(least(all)).toBeGreaterThan(0);
            expect(least(all.filter(({ up }) => up <= 3.5))).toBeGreaterThan(0.9);
        });
        // The house fronts, garden walls and the ground behind them are on the wall line or past it
        const walls = village(env).children.find(mesh => mesh.material.isMeshStandardMaterial && mesh.userData.modelled === 'village');
        const high = offsets(env, walls).filter(({ up }) => up > 6);
        expect(least(high)).toBeGreaterThan(front - 1.7);
    });

    test('the ground, the solid obstacles and the build\'s random sequence are as they were', () => {
        expect(sample(env)).toEqual(ground);
        expect(ground).toEqual(sample(plain));
        expect(JSON.stringify(env.boulders)).toBe(before.boulders);
        expect(env.randState).toBe(before.randState);
        [-1, 1].forEach(sign => {
            expect(game.Terrain.zoneAt(env.terrain, 586, sign * (env.roadWidth / 2 + 2.9), env.roadWidth / 2).kind).toBe('runoff');
            expect(game.Terrain.zoneAt(env.terrain, 586, sign * (env.roadWidth / 2 + 3.1), env.roadWidth / 2).kind).toBe('wall');
        });
    });

    test('a second build of the leg is the same village, vertex for vertex', async () => {
        const again = build(game);
        await again.dressing;
        const arrays = e => village(e).children.filter(mesh => mesh.userData.modelled === 'village').map(mesh => [mesh.geometry.attributes.position.array, mesh.geometry.attributes.color.array]);
        expect(arrays(again)).toEqual(arrays(env));
    });
});

describe('a village file that fails', () => {
    test.each(['houses.glb', 'props.glb'])('without %s the procedural village stays, and the error is logged', async file => {
        const game = load({ failing: [file] });
        const env = build(game);
        const result = await env.dressing;
        expect(result.village.error).toMatch(/HTTP 404/);
        expect(village(env).children).toHaveLength(5);
        expect(tagged(env)).toHaveLength(4);
        expect(game.log.some(line => line.includes('village') && line.includes('kept its procedural meshes'))).toBe(true);
    });

    test('a leg torn down before its files arrive gets nothing added', async () => {
        const game = load();
        const env = build(game);
        const group = village(env);
        env.scene.remove(group);
        const result = await env.dressing;
        expect(result.village.houses).toBe(0);
        expect(group.children).toHaveLength(5);
    });
});

// Mountain Dawn (a converted leg, js/course.js) rides its 22-segment village
// at golden hour. Merged, those houses would be about 18 MB of vertices: the
// models are held once and drawn as instances, and the meadow's farmstead
// takes the farm house and the barn.
describe('mountain-dawn with the modelled houses, as instances', () => {
    const DAWN = 0;
    const game = load({ course: true });
    const env = build(game, DAWN);
    const piece = env => { let found = null; env.fixed.traverse(o => { if (o.userData.setPiece === 'village') found = o; }); return found; };
    const farm = env => env.fixed.getObjectByName('landmark-meadow');
    const plots = JSON.parse(JSON.stringify(piece(env).userData.village)).plots;
    let result;

    beforeAll(async () => {
        result = await env.dressing;
    });

    test('every plot gets its house and lamp post, every gap its garden wall, and no procedural house is left', () => {
        expect(plots).toHaveLength(44);
        expect(result.village.error).toBeUndefined();
        expect(result.village.houses).toBe(plots.length);
        expect(result.village.lamps).toBe(plots.length);
        expect(result.village.walls).toBeGreaterThanOrEqual(42);
        expect(piece(env).children.filter(mesh => mesh.userData.dressing)).toHaveLength(0);
        expect(result.files).toEqual(expect.arrayContaining(['assets/village/houses.glb', 'assets/village/props.glb']));
    });

    test('the houses are instanced: few meshes, each model held once, inside the window\'s budgets', () => {
        const modelled = piece(env).children.filter(mesh => mesh.userData.modelled === 'village');
        expect(modelled.length).toBe(result.village.meshes);
        expect(modelled.length).toBeLessThanOrEqual(40);
        modelled.forEach(mesh => expect(mesh.isInstancedMesh).toBe(true));
        const drawn = modelled.reduce((sum, mesh) => sum + triangles(mesh.geometry) * mesh.count, 0);
        expect(drawn).toBe(result.village.triangles);
        expect(drawn).toBeLessThanOrEqual(260000);
        const seen = new Set();
        let bytes = 0;
        modelled.forEach(mesh => {
            if (seen.has(mesh.geometry)) return;
            seen.add(mesh.geometry);
            Object.values(mesh.geometry.attributes).forEach(a => { bytes += a.array.byteLength; });
            bytes += mesh.geometry.index.array.byteLength;
            bytes += mesh.instanceMatrix.array.byteLength + mesh.instanceColor.array.byteLength;
        });
        expect(bytes / 1048576).toBeLessThan(3);
        // Decoded already: a float colour would be decoded again (js/graphics.js, fixColorSpaces)
        modelled.forEach(mesh => {
            expect(mesh.geometry.attributes.color.array).not.toBeInstanceOf(Float32Array);
            expect(mesh.geometry.attributes.color.normalized).toBe(true);
        });
        // A mirrored house draws its back faces, an unmirrored one its front
        modelled.forEach(mesh => {
            const matrix = new game.THREE.Matrix4();
            mesh.getMatrixAt(0, matrix);
            expect(mesh.material.side).toBe(matrix.determinant() < 0 ? game.THREE.BackSide : game.THREE.FrontSide);
        });
    });

    test('nothing stands over the road, and nothing but a lamp post stands on the pavement', () => {
        const [span] = env.setPieces.filter(p => p.type === 'village');
        const points = env.roadPath.slice(span.from - 1, span.to + 2);
        const matrix = new game.THREE.Matrix4();
        const point = new game.THREE.Vector3();
        let least = Infinity;
        let leastLow = Infinity;
        piece(env).children.filter(mesh => mesh.userData.modelled === 'village').forEach(mesh => {
            const { position } = mesh.geometry.attributes;
            for (let n = 0; n < mesh.count; n++) {
                mesh.getMatrixAt(n, matrix);
                for (let i = 0; i < position.count; i += 3) {
                    point.fromBufferAttribute(position, i).applyMatrix4(matrix).add(mesh.position);
                    let best = null;
                    for (const p of points) {
                        const along = (point.x - p.x) * Math.sin(p.heading) + (point.z - p.z) * Math.cos(p.heading);
                        if (!best || Math.abs(along) < Math.abs(best.along)) best = { along, p };
                    }
                    const lateral = (point.x - best.p.x) * Math.cos(best.p.heading) - (point.z - best.p.z) * Math.sin(best.p.heading);
                    const past = Math.abs(lateral) - env.roadWidth / 2;
                    least = Math.min(least, past);
                    if (point.y - best.p.y <= 3.5) leastLow = Math.min(leastLow, past);
                }
            }
        });
        expect(least).toBeGreaterThan(0);
        expect(leastLow).toBeGreaterThan(0.9);
    });

    test('the farmstead\'s house and barn are the farm and barn models; the shed stays a box', () => {
        expect(result.farmstead).toEqual({ buildings: 2 });
        const children = farm(env).children;
        expect(children.filter(mesh => mesh.userData.dressing)).toHaveLength(0);
        expect(children.filter(mesh => mesh.userData.modelled === 'farmstead').map(mesh => mesh.name).sort())
            .toEqual(expect.arrayContaining(['modelled-house_barn', 'modelled-house_farm']));
        expect(children.filter(mesh => mesh.userData.building && !mesh.userData.modelled)).toHaveLength(1);
        children.filter(mesh => mesh.userData.modelled === 'farmstead').forEach(mesh => {
            expect(Math.abs(mesh.position.y - env.groundYAt(mesh.position.x, mesh.position.z))).toBeLessThan(0.01);
        });
    });

    test('the village is drawn only with the sections it stands in', () => {
        expect(piece(env).visible).toBe(false);
        env.ensureWindow(420, { sync: true });
        expect(piece(env).visible).toBe(true);
        env.ensureWindow(560, { sync: true });
        expect(piece(env).visible).toBe(false);
    });

    // The bridge file carries no normals (the village kit's way): drawn as
    // loaded, every face is lit black. Its outer faces must face away from
    // the road, the parapets' inner faces toward it and the coping up, and
    // its colours be decoded as the houses' are.
    test('the modelled bridge\'s stone faces out, so the sun and the sky light it', async () => {
        expect(result.bridge.error).toBeUndefined();
        expect(result.bridge.bridges).toBe(1);
        const bridge = env.fixed.getObjectByName('modelled-bridge');
        const meshes = bridge.children.filter(o => o.isMesh);
        expect(meshes.length).toBeGreaterThan(0);
        const model = await game.SceneAssets.loadModel('assets/bridge/stone.glb');
        const raw = model.meshes.get('bridge_span')[0].geometry.attributes.color;
        const decode = v => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
        const counts = { outer: 0, inner: 0, top: 0 };
        for (const mesh of meshes) {
            const { position, normal, color } = mesh.geometry.attributes;
            expect(normal).toBeDefined();
            expect(normal.count).toBe(position.count);
            expect(mesh.material.metalness).toBe(0);
            expect(mesh.material.side).toBe(game.THREE.FrontSide);
            for (let i = 0; i < position.count; i++) {
                const x = position.getX(i), y = position.getY(i);
                const nx = normal.getX(i), ny = normal.getY(i), nz = normal.getZ(i);
                expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 3);
                // Model frame (tools/blender/bridge_stone.py): outer face 11.6, inner 10.9, coping over 1.17
                if (Math.abs(x) > 11.65 && Math.abs(nx) > 0.9) { expect(Math.sign(nx)).toBe(Math.sign(x)); counts.outer++; }
                if (Math.abs(x) < 10.95 && Math.abs(x) > 10.7 && y > 0.1 && y < 0.95 && Math.abs(nx) > 0.9) { expect(Math.sign(nx)).toBe(-Math.sign(x)); counts.inner++; }
                if (y > 1.17 && Math.abs(ny) > 0.9) { expect(ny).toBeGreaterThan(0); counts.top++; }
            }
            // The first vertex's colour, decoded from the file's sRGB byte
            expect(color.getX(0)).toBeCloseTo(decode(raw.array[0] / 255), 3);
        }
        expect(counts.outer).toBeGreaterThan(100);
        expect(counts.inner).toBeGreaterThan(100);
        expect(counts.top).toBeGreaterThan(100);
    });

    test('without the houses file the procedural village and farmstead stay', async () => {
        const failing = load({ course: true, failing: ['houses.glb'] });
        const plain = build(failing, DAWN);
        const report = await plain.dressing;
        expect(report.village.error).toMatch(/HTTP 404/);
        expect(report.farmstead.error).toMatch(/HTTP 404/);
        expect(piece(plain).children.filter(mesh => mesh.userData.dressing)).toHaveLength(4);
        expect(farm(plain).children.filter(mesh => mesh.userData.dressing)).toHaveLength(2);
    });
});
