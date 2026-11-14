// Rockfalls read the same terrain profile as the world: they come off whichever
// side is a wall, and rest on the shared ground model. Real Environment and
// RockfallSystem on real three r150.
import { jest } from '@jest/globals';
import { buildEnvironment, loadGame } from '../helpers/load-game.js';

const SEGMENT = 332; // on the hairpin leg, which has rockfalls

// Park-Miller, so a fall is repeatable
function seeded(seed = 1) {
    let state = seed;
    return () => {
        state = (state * 16807) % 2147483647;
        return state / 2147483647;
    };
}

describe('rockfalls on the shared terrain model', () => {
    let game;
    let env;
    let profile;

    beforeAll(() => {
        game = loadGame();
        ({ env } = buildEnvironment(game, 4));
        profile = env.terrain;
    });

    afterEach(() => {
        env.terrain = profile;
        jest.restoreAllMocks();
    });

    const mirrored = () => {
        const { left, right, ...rest } = profile;
        return { ...rest, left: right, right: left };
    };
    const bothFall = () => ({ ...profile, left: profile.right });

    function system(terrain) {
        env.terrain = terrain;
        return new game.RockfallSystem(new game.THREE.Scene(), env);
    }

    // Where the fall's rocks start: lateral of each, and their velocity along the right-hand normal
    function fall(rocks) {
        jest.spyOn(Math, 'random').mockImplementation(seeded());
        const index = rocks.triggerFall({ currentRoadSegment: SEGMENT - 4 });
        const found = {};
        return rocks.rocks.map(({ mesh, velocity }) => {
            // Lateral to the nearest point of the road, as the bike measures it
            game.Terrain.locate(env.roadPath, mesh.position.x, mesh.position.z, index - 12, index + 12, found);
            const point = env.roadPath[found.index];
            return {
                lateral: found.lateral,
                along: velocity.x * Math.cos(point.heading) - velocity.z * Math.sin(point.heading)
            };
        });
    }

    test('are off where the leg says so, and on from the wall side', () => {
        const rocks = system(profile);
        expect(rocks.enabled).toBe(true);
        expect(rocks.wallSign).toBe(-1);
        const calm = new game.RockfallSystem(new game.THREE.Scene(), { ...env, config: { dressing: { rockfall: 0 } } });
        expect(calm.enabled).toBe(false);
    });

    test('spawn on the left wall and fall toward the road, drawing the same random numbers as before', () => {
        const rocks = fall(system(profile));
        expect(rocks.length).toBeGreaterThan(1);
        // Values from the old hand-written spawn, same seeded Math.random
        expect(rocks[0].lateral).toBeCloseTo(-17.608, 2);
        rocks.forEach(({ lateral, along }) => {
            expect(lateral).toBeLessThan(-(env.roadWidth / 2 + 3.5));
            expect(lateral).toBeGreaterThan(-(env.roadWidth / 2 + 10.5));
            expect(along).toBeGreaterThan(0);
        });
    });

    test('swap the faces and the rocks spawn on the right and fall the other way', () => {
        const left = fall(system(profile));
        const rocks = system(mirrored());
        expect(rocks.wallSign).toBe(1);
        const right = fall(rocks);
        expect(right).toHaveLength(left.length);
        right.forEach((rock, n) => {
            expect(rock.lateral).toBeCloseTo(-left[n].lateral, 1);
            expect(rock.along).toBeLessThan(0);
        });
    });

    test('a profile with no wall has no rockfalls', () => {
        const rocks = system(bothFall());
        expect(rocks.wallSign).toBe(0);
        expect(rocks.enabled).toBe(false);
        expect(rocks.update(1 / 60, { crashed: false, position: { x: 0, y: 0, z: 0 } })).toBeNull();
    });

    test('rest on the shared ground: the wall slope and the drawn cliff face', () => {
        const rocks = system(profile);
        rocks.lastFallSegment = SEGMENT;
        const point = env.roadPath[SEGMENT];
        const at = lateral => rocks.groundY(
            point.x + Math.cos(point.heading) * lateral, point.z - Math.sin(point.heading) * lateral
        );
        expect(typeof rocks.groundYAt).toBe('undefined');
        const spy = jest.spyOn(game.Terrain, 'groundY');
        expect(at(-13)).toBeCloseTo(32.4484, 4);
        expect(at(20)).toBeCloseTo(13.7306, 4);
        expect(spy).toHaveBeenCalled();
    });

    test('rocks that overshoot the road land on the cliff face, not on a plateau at ledge height', () => {
        const rocks = system(profile);
        rocks.lastFallSegment = SEGMENT;
        const point = env.roadPath[SEGMENT];
        const lateral = 40;
        const ground = rocks.groundY(point.x + Math.cos(point.heading) * lateral, point.z - Math.sin(point.heading) * lateral);
        expect(ground).toBeLessThan(point.y - 20);
    });

    test('a rock never spawns inside a wall that rises faster than the spawn height', () => {
        const steep = {
            ...profile,
            left: { ...profile.left, base: (dPast, roadY) => roadY + dPast * 20, exact: false }
        };
        const rocks = system(steep);
        fall(rocks);
        expect(rocks.rocks.length).toBeGreaterThan(0);
        rocks.rocks.forEach(({ mesh }) => {
            expect(mesh.position.y).toBeGreaterThanOrEqual(rocks.groundY(mesh.position.x, mesh.position.z) + 5 - 1e-9);
        });
    });
});
