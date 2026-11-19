// The brake calipers of the Blender-made bikes (assets/bikes, built by
// tools/blender), read through the game's own SceneAssets.loadModel: each
// caliper grips its disc (straddles the disc's plane, on the rim, long side
// along the rim) and sits where that bike carries it round the axle. Angles
// are bike_parts.caliper's: degrees from straight ahead of the axle, up over
// the top, so 180 is straight behind and 270 straight down. The dirt bike's
// rear caliper hangs under the swingarm (a motocross carrier), not on the
// arm's end above the axle.
import { readFileSync } from 'node:fs';
import { Blob } from 'node:buffer';
import { TextDecoder } from 'node:util';
import { canvasStub, loadScript, realThree } from '../helpers/load-game.js';

const root = new URL('../../', import.meta.url);

function loadAssets() {
    const THREE = realThree();
    const fetch = async url => {
        const bytes = readFileSync(new URL(url, root));
        return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
    };
    const createImageBitmap = async blob => ({ width: 1, height: 1, bytes: blob.size });
    const sink = { log() {}, warn() {}, error() {} };
    const factory = new Function('THREE', 'document', 'console', 'fetch', 'createImageBitmap', 'Blob', 'TextDecoder', 'performance',
        `${loadScript('sceneassets.js')}\nreturn SceneAssets;`);
    return { THREE, SceneAssets: factory(THREE, canvasStub(), sink, fetch, createImageBitmap, Blob, TextDecoder, performance) };
}

// Every vertex of the named node's parts in the bike's axes, only those of
// material `material` when given
function points(model, node, material) {
    const place = model.places.get(node);
    const found = [];
    for (const { geometry, material: m } of model.meshes.get(node) || []) {
        if (material && m.name !== material) continue;
        const position = geometry.attributes.position;
        for (let i = 0; i < position.count; i++) found.push([position.getX(i) + place.x, position.getY(i) + place.y, position.getZ(i) + place.z]);
    }
    return found;
}

function bounds(list) {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const p of list) for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], p[a]); max[a] = Math.max(max[a], p[a]); }
    return { min, max, mid: min.map((v, a) => (v + max[a]) / 2) };
}

// How one caliper sits on its disc: across the disc plane, how far out on the
// disc, its angle round the axle and how far its long side is off the rim's
// tangent (0 along the rim, 90 pointing at the axle)
export function grip(caliper, disc) {
    const c = bounds(caliper), d = bounds(disc);
    const radius = (d.max[1] - d.min[1]) / 2;
    const dy = c.mid[1] - d.mid[1], dz = c.mid[2] - d.mid[2];
    // The long side: the main axis of the caliper's points across the wheel's plane
    let syy = 0, szz = 0, syz = 0;
    for (const [, y, z] of caliper) { syy += (y - c.mid[1]) ** 2; szz += (z - c.mid[2]) ** 2; syz += (y - c.mid[1]) * (z - c.mid[2]); }
    const axis = 0.5 * Math.atan2(2 * syz, szz - syy);
    const radial = Math.atan2(dy, dz);
    const off = Math.abs(((axis - radial) * 180 / Math.PI) % 180);
    return {
        straddles: c.min[0] < d.mid[0] && d.mid[0] < c.max[0],
        out: Math.hypot(dy, dz) / radius,
        angle: ((radial * 180 / Math.PI) + 360) % 360,
        offTangent: Math.abs(90 - Math.min(off, 180 - off)),
    };
}

// Where each bike carries its calipers, in degrees round the axle. The
// detailed bikes (assets/bikes/detail) are read at their near level, lod0:
// each carries them where the real bike does, from the photos.
const BIKES = {
    'bikes/dirt': { rear: [260, 305], front: [195, 215] },
    'bikes/sport': { rear: [185, 215], front: [195, 215] },
    'bikes/adventure': { rear: [185, 215], front: [195, 215] },
    'bikes/scooter': { rear: [145, 175], front: [195, 215] },
    'bikes/naked': { rear: [185, 215], front: [195, 215] },
    'bikes/detail/bike01_z650': { rear: [195, 215], front: [195, 210] },
    'bikes/detail/bike02_speed_triple': { rear: [195, 215], front: [150, 170] },
    'bikes/detail/bike03_duke390': { rear: [195, 215], front: [155, 175] },
    'bikes/detail/bike04_scrambler': { rear: [235, 245], front: [195, 210] },
    'bikes/detail/bike05_g310gs': { rear: [225, 235], front: [200, 210] },
    'bikes/detail/bike06_z750': { rear: [140, 152], front: [200, 210] },
    'bikes/detail/bike07_mt09': { rear: [190, 205], front: [195, 210] },
    'bikes/detail/bike07_mt09_black': { rear: [190, 205], front: [195, 210] },
    'bikes/detail/bike08_xsr900': { rear: [190, 205], front: [195, 210] },
    'bikes/detail/bike09_duke890': { rear: [190, 205], front: [195, 210] },
    'bikes/detail/bike10_tiger900': { rear: [200, 210], front: [200, 210] },
    'bikes/detail/bike11_duke990': { rear: [200, 210], front: [200, 210] },
    'bikes/detail/bike12_tracer9gt': { rear: [200, 210], front: [200, 210] },
    'bikes/detail/bike13_panigale': { rear: [240, 262], front: [200, 215] },
    'bikes/detail/bike13_panigale_black': { rear: [240, 262], front: [200, 215] },
    'bikes/detail/bike14_forza': { rear: [145, 170], front: [200, 210] },
    'bikes/detail/bike15_crf250': { rear: [110, 125], front: [200, 210] },
};

describe.each(Object.entries(BIKES))('assets/%s.glb brake calipers', (bike, where) => {
    let model;
    beforeAll(async () => {
        const file = await loadAssets().SceneAssets.loadModel(`assets/${bike}.glb`);
        model = file.groups.get('lod0') || file;
    });

    function expectGrips(caliper, disc, [from, to]) {
        expect(caliper.length).toBeGreaterThan(0);
        const g = grip(caliper, disc);
        expect(g.straddles).toBe(true);
        expect(g.out).toBeGreaterThan(0.6);
        expect(g.out).toBeLessThan(1.05);
        expect(g.offTangent).toBeLessThan(15);
        expect(g.angle).toBeGreaterThanOrEqual(from);
        expect(g.angle).toBeLessThanOrEqual(to);
    }

    test('the rear caliper grips the rear disc where the bike carries it', () => {
        expectGrips(points(model, 'body', 'caliper'), points(model, 'disc_rear'), where.rear);
    });

    test('each front caliper grips the front disc behind the fork leg', () => {
        const disc = points(model, 'disc_front');
        const legs = ['fork_left', 'fork_right'].map(leg => points(model, leg, 'caliper')).filter(list => list.length);
        expect(legs.length).toBeGreaterThan(0);
        // A twin-disc bike has one disc node holding both discs: each caliper grips the one on its side
        for (const caliper of legs) {
            const side = Math.sign(bounds(caliper).mid[0]);
            expectGrips(caliper, disc.filter(p => Math.sign(p[0]) === side), where.front);
        }
    });
});

describe('the check itself', () => {
    // bike_parts.caliper's box, 0.05 x 0.058 x 0.105, turned round a disc of radius 0.11
    const box = (degrees, turn = 0) => {
        const a = degrees * Math.PI / 180, r = 0.11 * 0.84, roll = Math.PI / 2 - a + turn;
        const list = [];
        for (const x of [-0.025, 0.025]) for (const y of [-0.029, 0.029]) for (const z of [-0.0525, 0.0525]) {
            list.push([0.07 + x, 0.3 + Math.sin(a) * r + y * Math.cos(roll) - z * Math.sin(roll), -0.7 + Math.cos(a) * r + y * Math.sin(roll) + z * Math.cos(roll)]);
        }
        return list;
    };
    const disc = [];
    for (let k = 0; k < 16; k++) disc.push([0.07, 0.3 + Math.sin(k * Math.PI / 8) * 0.11, -0.7 + Math.cos(k * Math.PI / 8) * 0.11]);

    test('reads the angle and a box laid along the rim', () => {
        const g = grip(box(165), disc);
        expect(g.angle).toBeCloseTo(165, 0);
        expect(g.offTangent).toBeLessThan(1);
        expect(g.straddles).toBe(true);
        expect(g.out).toBeCloseTo(0.84, 2);
    });

    test('sees a box turned across the rim and one beside the disc', () => {
        expect(grip(box(290, Math.PI / 2), disc).offTangent).toBeGreaterThan(80);
        expect(grip(box(290).map(([x, y, z]) => [x + 0.06, y, z]), disc).straddles).toBe(false);
    });
});

