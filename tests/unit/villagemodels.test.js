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

function load({ failing = [], assets = true } = {}) {
    const THREE = realThree();
    const files = ['terrain.js', 'vehicle.js', 'environment.js', 'tours.js', ...(assets ? ['sceneassets.js'] : [])];
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

function build(game) {
    const leg = legs(game)[NIGHT];
    const scene = new game.THREE.Scene();
    const env = new game.Environment(scene, leg.startSegment, leg.endSegment, NIGHT);
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
