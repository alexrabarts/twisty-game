// Rock dressing reads the profile's face description, not the side sign.
import { buildEnvironment, groundedRecords, loadGame } from '../helpers/load-game.js';

describe('embedded rock spread reads side.face.rockSpread', () => {
    let game;
    beforeAll(() => {
        game = loadGame();
    });

    const cliffLake = () => game.Terrain.profiles.cliffLake;
    const withSpread = (profile, leftSpread, rightSpread) => ({
        ...profile,
        left: { ...profile.left, face: { ...profile.left.face, rockSpread: leftSpread } },
        right: { ...profile.right, face: { ...profile.right.face, rockSpread: rightSpread } }
    });

    // Distance past the road edge of each embedded rock, by side
    function spreads(profile) {
        const original = game.Terrain.LEGS[0].profile;
        game.Terrain.LEGS[0].profile = profile;
        let built;
        try {
            built = buildEnvironment(game, 0);
        } finally {
            game.Terrain.LEGS[0].profile = original;
        }
        const { env } = built;
        const bySide = { '-1': [], 1: [] };
        groundedRecords(env).forEach(({ label, position }) => {
            const match = /^embedded cliff rock \(segment (\d+), side (-?1)\)$/.exec(label);
            if (!match) return;
            const point = env.roadPath[Number(match[1])];
            const lateral = (position[0] - point.x) * Math.cos(point.heading) - (position[2] - point.z) * Math.sin(point.heading);
            bySide[match[2]].push(Math.abs(lateral) - env.roadWidth / 2);
        });
        return { env, bySide };
    }
    const range = list => ({ n: list.length, min: Math.min(...list), max: Math.max(...list) });

    test('cliffLake keeps its measured spread on both sides', () => {
        const { bySide } = spreads(cliffLake());
        const left = range(bySide['-1']);
        const right = range(bySide[1]);
        expect(left.n).toBe(59);
        expect(left.min).toBeCloseTo(1.045, 2);
        expect(left.max).toBeCloseTo(7.854, 2);
        expect(bySide['-1'].filter(s => s > 3.5)).toHaveLength(41);
        expect(right.n).toBe(52);
        expect(right.min).toBeCloseTo(1.787, 2);
        expect(right.max).toBeCloseTo(8.741, 2);
        expect(bySide[1].filter(s => s > 3.5)).toHaveLength(37);
    });

    test('a side with no spread keeps its rocks within 3.5 of the road edge; the other side still spreads', () => {
        const flatLeft = spreads(withSpread(cliffLake(), 0, 25));
        expect(Math.max(...flatLeft.bySide['-1'])).toBeLessThanOrEqual(3.5 + 1e-9);
        expect(Math.max(...flatLeft.bySide[1])).toBeGreaterThan(3.5);

        const flatRight = spreads(withSpread(cliffLake(), 20, 0));
        expect(Math.max(...flatRight.bySide[1])).toBeLessThanOrEqual(3.5 + 1e-9);
        expect(Math.max(...flatRight.bySide['-1'])).toBeGreaterThan(3.5);

        // The spread changes sizes and positions, never the number of draws
        const cliff = spreads(cliffLake());
        expect(flatLeft.env.randState).toBe(cliff.env.randState);
        expect(flatRight.env.randState).toBe(cliff.env.randState);
    });

    test('swapping the faces swaps the spread with them', () => {
        const { left, right, ...rest } = cliffLake();
        const { bySide } = spreads({ ...rest, left: right, right: left });
        expect(bySide['-1'].some(s => s > 3.5)).toBe(true);
        expect(bySide[1].some(s => s > 3.5)).toBe(true);
    });
});
