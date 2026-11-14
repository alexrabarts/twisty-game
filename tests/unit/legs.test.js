// The per-leg table (Terrain.LEGS) and the world build that reads it, on the
// real modules and real three r150.
import { buildEnvironment, loadGame } from '../helpers/load-game.js';

const ROAD_WIDTHS = [20, 20, 20, 20, 16, 16, 16, 16];
// Today's rockfall rate: off on legs 1 to 4, then 0.25, 0.5, 0.75, 1
const ROCKFALL = [0, 0, 0, 0, 0.25, 0.5, 0.75, 1];
// The grass, mountain and fog values the old tours.js variations gave each leg
const LOOK = [
    [0x4a7c4a, 0x6b5c42, 0.0015],
    [0x5a9c5a, 0x7a6c52, 0.0008],
    [0x6aac6a, 0x5a4c32, 0.001],
    [0x5a9c5a, 0x7a6c52, 0.0008],
    [0x3a6c3a, 0x8b8b8b, 0.002],
    [0x5a9c5a, 0x7a6c52, 0.0008],
    [0x4a8c4a, 0x6a5c42, 0.0012],
    [0x3a6c3a, 0x8b8b8b, 0.002]
];

describe('Terrain.LEGS', () => {
    let game;
    beforeAll(() => {
        game = loadGame();
    });

    test('has one entry per tour leg, in leg order', () => {
        const ids = new game.TourSystem().legs.map(leg => leg.id);
        expect(game.Terrain.LEGS.map(leg => leg.id)).toEqual(ids);
    });

    test('keeps today\'s road width, rockfall rate, look and track version', () => {
        game.Terrain.LEGS.forEach((leg, index) => {
            expect(leg.roadWidth).toBe(ROAD_WIDTHS[index]);
            expect(leg.dressing.rockfall).toBe(ROCKFALL[index]);
            expect([leg.look.grassColor, leg.look.mountainColor, leg.look.fogDensity]).toEqual(LOOK[index]);
            expect(leg.trackVersion).toBe(1);
        });
    });

    test('only the last leg is snowed in', () => {
        expect(game.Terrain.LEGS.map(leg => leg.dressing.forest.snowy)).toEqual([false, false, false, false, false, false, false, true]);
    });

    test('the floor lives once, on the profile', () => {
        game.Terrain.LEGS.forEach(leg => expect(leg.floor).toBe(leg.profile.floor));
    });

    test('legConfig resolves an index or an id and throws on an unknown id', () => {
        expect(game.Terrain.legConfig(4)).toBe(game.Terrain.LEGS[4]);
        expect(game.Terrain.legConfig('winter-pass')).toBe(game.Terrain.LEGS[7]);
        expect(game.Terrain.legConfig(undefined)).toBe(game.Terrain.LEGS[0]);
        expect(game.Terrain.legConfig(99)).toBe(game.Terrain.LEGS[0]);
        expect(() => game.Terrain.legConfig('high-pass-v2')).toThrow('Unknown leg id');
    });

    test('LEG_PROFILES is the profile of each entry', () => {
        expect(game.Terrain.LEG_PROFILES).toEqual(game.Terrain.LEGS.map(leg => leg.profile));
    });
});

describe('the world build reads the table', () => {
    let game;
    beforeAll(() => {
        game = loadGame();
    });

    test('the retired tour-system accessors are gone', () => {
        const tours = new game.TourSystem();
        expect(tours.getLandscapeConfig).toBeUndefined();
        tours.legs.forEach(leg => expect(leg.landscapeVariation).toBeUndefined());
    });

    test.each([0, 4])('leg %i: Environment takes road width, floor and profile from its entry', (index) => {
        const { env } = buildEnvironment(game, index);
        expect(env.config).toBe(game.Terrain.LEGS[index]);
        expect(env.roadWidth).toBe(ROAD_WIDTHS[index]);
        expect(env.terrain).toBe(env.config.profile);
        expect(env.floorY).toBe(env.config.floor.y);
    });

    test('the floor plane sits at the profile floor, tagged as the floor part', () => {
        const { env, scene } = buildEnvironment(game, 0);
        const floors = [];
        scene.traverse(object => {
            if (object.userData && object.userData.part === 'floor') floors.push(object);
        });
        expect(floors).toHaveLength(1);
        expect(floors[0].position.y).toBe(env.config.floor.y);
    });

    test('a different floor height moves the plane and the waterline', () => {
        const probe = loadGame();
        const entry = probe.Terrain.LEGS[0];
        const original = entry.floor;
        entry.floor = { kind: 'lake', y: -150 };
        try {
            const { scene } = buildEnvironment(probe, 0);
            const plane = [];
            scene.traverse(object => {
                if (object.userData && object.userData.part === 'floor') plane.push(object.position.y);
            });
            expect(plane).toEqual([-150]);
        } finally {
            entry.floor = original;
        }
    });

    test('RockfallSystem reads its rate from the environment', () => {
        const dawn = buildEnvironment(game, 0);
        const winter = buildEnvironment(game, 7);
        const quiet = new game.RockfallSystem(dawn.scene, dawn.env);
        const loud = new game.RockfallSystem(winter.scene, winter.env);
        expect([quiet.enabled, quiet.intensity]).toEqual([false, 0]);
        expect([loud.enabled, loud.intensity]).toEqual([true, 1]);
    });

    test('an empty backdrop list builds no mountain layers', () => {
        const probe = loadGame();
        const entry = probe.Terrain.LEGS[0];
        const original = entry.dressing.backdrop;
        const count = () => buildEnvironment(probe, 0).scene.children.length;
        const full = count();
        entry.dressing.backdrop = [];
        try {
            expect(count()).toBeLessThan(full);
        } finally {
            entry.dressing.backdrop = original;
        }
    });
});
