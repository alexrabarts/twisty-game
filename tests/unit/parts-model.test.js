// The parts model of js/terrain.js: elevation from control points, joins
// between parts, the pure readers and the course validator.
import { describe, test, expect, beforeEach } from '@jest/globals';
import { loadGame, buildEnvironment } from '../helpers/load-game.js';
import { FIXTURE_LEG, fixtureCourse } from '../fixtures/course-fixture.js';

describe('the parts model', () => {
    let game;
    let Terrain;
    let course;
    beforeEach(() => {
        game = loadGame();
        ({ Terrain } = game);
        course = fixtureCourse(Terrain);
    });

    describe('elevationFrom', () => {
        test('passes through every control point and never overshoots a monotone climb', () => {
            const points = [[0, 10], [30, 12], [60, 80], [90, 82], [120, 40]];
            const height = Terrain.elevationFrom(points);
            points.forEach(([segment, y]) => expect(height(segment)).toBeCloseTo(y, 9));
            for (let i = 30; i <= 60; i += 0.5) {
                expect(height(i)).toBeGreaterThanOrEqual(12 - 1e-9);
                expect(height(i)).toBeLessThanOrEqual(80 + 1e-9);
            }
            for (let i = 60; i <= 90; i += 0.5) expect(height(i)).toBeLessThanOrEqual(82 + 1e-9);
        });

        test('reads no leg start or end: the same segment gives the same height', () => {
            const height = Terrain.elevationFrom([[0, 10], [100, 30]]);
            expect(height(40)).toBe(height(40));
            expect(height(-5)).toBe(10);
            expect(height(500)).toBe(30);
        });

        test('a roll adds at most its own amplitude and a roll over 2 m is refused', () => {
            const flat = Terrain.elevationFrom([[0, 10], [100, 10]], 0);
            const rolled = Terrain.elevationFrom([[0, 10], [100, 10]], 2);
            let largest = 0;
            for (let i = 0; i <= 100; i++) largest = Math.max(largest, Math.abs(rolled(i) - flat(i)));
            expect(largest).toBeLessThanOrEqual(2);
            expect(largest).toBeGreaterThan(1);
            expect(() => Terrain.elevationFrom([[0, 10], [100, 10]], 3)).toThrow();
        });

        test('control points must run forward', () => {
            expect(() => Terrain.elevationFrom([[10, 1], [10, 2]])).toThrow();
            expect(() => Terrain.elevationFrom([[0, 1]])).toThrow();
        });
    });

    describe('morphSide', () => {
        const ctxAt = (s) => ({ halfRoad: 8, roadY: 30, column: 0, index: s, s, pathLength: 150 });
        const sides = () => {
            const a = Terrain.valleyFloorSides(() => 0).left;
            const b = Terrain.forestProfile({ elevation: () => 0, amplitude: 3, reach: 130 }).left;
            return { a, b };
        };

        test('the drawn rows and base() agree within 0.10 at nine weights', () => {
            const { a, b } = sides();
            for (let n = 0; n <= 8; n++) {
                const w = n / 8;
                const side = Terrain.morphSide(a, b, () => w, [40, 60]);
                const ctx = ctxAt(50);
                const rows = [];
                for (let j = 0; j <= Terrain.ROWS; j++) rows.push({ ...side.row(j, ctx, {}) });
                for (let j = 0; j < Terrain.ROWS; j++) {
                    const mid = (rows[j].d + rows[j + 1].d) / 2;
                    const drawn = (rows[j].y + rows[j + 1].y) / 2;
                    const modelled = side.base(mid - ctx.halfRoad, ctx.roadY, ctx.s);
                    expect(Math.abs(drawn - modelled)).toBeLessThanOrEqual(0.1);
                }
            }
        });

        test('the ground is side one at weight 0 and side two at weight 1', () => {
            const { a, b } = sides();
            const ctx = ctxAt(50);
            const start = Terrain.morphSide(a, b, () => 0, [40, 60]);
            const end = Terrain.morphSide(a, b, () => 1, [40, 60]);
            for (let dPast = 0; dPast <= 130; dPast += 7) {
                expect(start.base(dPast, ctx.roadY, ctx.s)).toBeCloseTo(a.base(dPast, ctx.roadY, ctx.s), 9);
                expect(end.base(dPast, ctx.roadY, ctx.s)).toBeCloseTo(b.base(dPast, ctx.roadY, ctx.s), 9);
            }
            // Each row of the mix stands on the first side's ground at weight 0 and the second's at weight 1
            for (let j = 0; j <= Terrain.ROWS; j++) {
                const at = start.row(j, ctx, {});
                expect(at.y).toBeCloseTo(a.base(at.d - ctx.halfRoad, ctx.roadY, ctx.s), 9);
                const to = end.row(j, ctx, {});
                expect(to.y).toBeCloseTo(b.base(to.d - ctx.halfRoad, ctx.roadY, ctx.s), 9);
            }
        });

        test('it refuses a wall, and sides with different bands', () => {
            const { a } = sides();
            const wall = Terrain.cliffSides().left;
            expect(() => Terrain.morphSide(a, wall, () => 0.5, [0, 10])).toThrow();
        });
    });

    describe('partsProfile', () => {
        test('inside a part it gives that part\'s own sides, floor and ceiling', () => {
            const profile = Terrain.partsProfile(course);
            expect(Terrain.sideAt(profile, -1, 20)).toBe(course.parts[0].profile.left);
            expect(Terrain.sideAt(profile, 1, 20)).toBe(course.parts[0].profile.right);
            expect(Terrain.sideAt(profile, -1, 90)).toBe(course.parts[1].profile.left);
            expect(Terrain.sideAt(profile, 1, 120)).toBe(course.parts[2].profile.right);
            expect(Terrain.sideAt(profile, 1, 149 + 20)).toBe(course.parts[2].profile.right);
            expect(Terrain.floorAt(profile, 20).kind).toBe('river');
            expect(Terrain.floorAt(profile, 90).kind).toBe('none');
            expect(Terrain.floorAt(profile, 120).kind).toBe('lake');
        });

        test('the tunnel is a set piece at its part-relative place, with a roof', () => {
            const profile = Terrain.partsProfile(course);
            expect(Terrain.setPieces(profile)).toEqual([{ type: 'tunnel', from: 70, to: 75 }]);
            expect(Terrain.ceilingAt(profile, 72)).toBe(7.5);
            expect(Terrain.ceilingAt(profile, 69)).toBeUndefined();
            expect(Terrain.ceilingAt(profile, 76)).toBeUndefined();
        });

        test('the join from the valley to the forest is a morph window of 20 segments', () => {
            const profile = Terrain.partsProfile(course);
            const inside = Terrain.sideAt(profile, -1, 50);
            expect(inside).not.toBe(course.parts[0].profile.left);
            expect(inside).not.toBe(course.parts[1].profile.left);
            expect(Terrain.sideAt(profile, -1, 39)).toBe(course.parts[0].profile.left);
            expect(Terrain.sideAt(profile, -1, 60)).toBe(course.parts[1].profile.left);
        });

        test('the road height is absolute and has no start or end argument', () => {
            const profile = Terrain.partsProfile(course);
            expect(profile.elevation(0, 500, 900)).toBeCloseTo(20, 9);
            expect(profile.elevation(100, 0, 1)).toBeCloseTo(40, 9);
        });
    });

    describe('partAt, lookAt and dressingAt', () => {
        test('partAt gives the part, the place in it and the mix over a join', () => {
            const profile = Terrain.partsProfile(course);
            expect(Terrain.partAt(profile, 10)).toMatchObject({ index: 0, mix: { from: 0, to: 0, weight: 0 } });
            expect(Terrain.partAt(profile, 75).index).toBe(1);
            expect(Terrain.partAt(profile, 75).t).toBeCloseTo(0.5, 9);
            const half = Terrain.partAt(profile, 50);
            expect(half.mix.from).toBe(0);
            expect(half.mix.to).toBe(1);
            expect(half.mix.weight).toBeCloseTo(0.5, 9);
            expect(Terrain.partAt(profile, 999).index).toBe(2);
        });

        test('lookAt mixes the fog over the join and holds a part\'s own value inside it', () => {
            Terrain.adopt({ [FIXTURE_LEG]: course });
            const config = Terrain.legConfig(FIXTURE_LEG);
            expect(Terrain.lookAt(config, 20).fogDensity).toBeCloseTo(0.0015, 9);
            expect(Terrain.lookAt(config, 75).fogDensity).toBeCloseTo(0.004, 9);
            expect(Terrain.lookAt(config, 50).fogDensity).toBeCloseTo((0.0015 + 0.004) / 2, 9);
            expect(Terrain.lookAt(config, 120).render.shadowSpan).toBe(200);
            expect(Terrain.lookAt(config, 120)).toMatchObject({ timeOfDay: 'dusk', weather: 'rain', weatherIntensity: 0.5 });
            expect(Terrain.lookAt(config, 20)).toMatchObject({ timeOfDay: 'dawn', weather: 'clear', weatherIntensity: 0 });
            const grass = Terrain.lookAt(config, 50).grassColor;
            expect((grass >> 8) & 255).toBeGreaterThan(0x5a);
            expect((grass >> 8) & 255).toBeLessThan(0x7c);
        });

        test('dressingAt mixes conifers, trees, outcrops and rockfall', () => {
            Terrain.adopt({ [FIXTURE_LEG]: course });
            const config = Terrain.legConfig(FIXTURE_LEG);
            expect(Terrain.dressingAt(config, 20)).toMatchObject({ coniferShare: 0, treesPerSegment: [1, 3], rockfall: 0 });
            expect(Terrain.dressingAt(config, 75)).toMatchObject({ coniferShare: 0.8, treesPerSegment: [4, 6], outcrops: 1 });
            expect(Terrain.dressingAt(config, 50).coniferShare).toBeCloseTo(0.4, 9);
            expect(Terrain.dressingAt(config, 120)).toMatchObject({ coniferShare: 0, rockfall: 0.25, outcrops: 2 });
        });

        test('on an unconverted leg each returns the leg\'s single value', () => {
            const config = Terrain.legConfig('valley-run');
            expect(Terrain.lookAt(config, 0).fogDensity).toBe(0.0008);
            expect(Terrain.lookAt(config, 400).fogDensity).toBe(0.0008);
            expect(Terrain.lookAt(config, 0).render.cullMax).toBe(600);
            expect(Terrain.dressingAt(config, 5).rockfall).toBe(0.25);
            expect(Terrain.dressingAt(config, 400).coniferShare).toBe(0.75);
            expect(Terrain.floorAt(config.profile, 10)).toBe(config.profile.floor);
        });
    });

    describe('adopt', () => {
        test('it composes a course into its table row and bumps the board once', () => {
            const before = Terrain.legConfig(FIXTURE_LEG).trackVersion;
            Terrain.adopt({ [FIXTURE_LEG]: course });
            Terrain.adopt({ [FIXTURE_LEG]: course });
            const row = Terrain.legConfig(FIXTURE_LEG);
            expect(row.trackVersion).toBe(before + 1);
            expect(row.parts).toBe(course.parts);
            expect(Terrain.forLeg(0)).toBe(row.profile);
            expect(Terrain.LEG_PROFILES[0]).toBe(row.profile);
            expect(game.TourSystem.boardId(FIXTURE_LEG)).toBe(`mountain-dawn-v${before + 1}`);
        });

        test('it refuses a course for a leg that is not in the table', () => {
            expect(() => Terrain.adopt({ 'no-such-leg': course })).toThrow(/unknown leg/);
        });

        test('a fresh game has no converted leg, and each loadGame is its own world', () => {
            expect(Object.keys(game.Course.LEGS)).toEqual([]);
            expect(game.Course.forLeg('mountain-dawn')).toBeNull();
            Terrain.adopt({ [FIXTURE_LEG]: course });
            expect(loadGame().Terrain.legConfig(FIXTURE_LEG).parts).toBeUndefined();
        });

        test('a converted leg takes its range from its course, and the board table is lazy', () => {
            expect(game.Course.boardTable()).toEqual({});
            game.Course.LEGS[FIXTURE_LEG] = course;
            Terrain.adopt(game.Course.LEGS);
            const leg = new game.TourSystem().legs[0];
            expect([leg.startSegment, leg.endSegment]).toEqual([0, 149]);
            expect(game.Course.boardTable()).toEqual({ 'mountain-dawn-v3': { gates: 3, segments: 150 } });
            const other = new game.TourSystem().legs[1];
            expect(other.startSegment).toBe(70);
        });

        test('every shipped course has 5 or 6 parts', () => {
            Object.values(game.Course.LEGS).forEach(entry => {
                expect([5, 6]).toContain(entry.parts.length);
            });
        });
    });

    describe('forgetColumns', () => {
        test('it drops kept columns and a later read computes the same column again', () => {
            const { env } = (() => {
                const quiet = console.log;
                console.log = () => {};
                try {
                    return buildEnvironment(game, 3);
                } finally {
                    console.log = quiet;
                }
            })();
            const geo = env.terrainGeometry;
            const profile = env.terrain;
            const start = geo.startSegment;
            const read = (c) => Terrain.drawnColumn ? Terrain.drawnColumn(profile, 1, geo, start, c) : null;
            if (!read(40)) return;
            const first = JSON.stringify(read(40));
            expect(Terrain.forgetColumns(geo, profile, 38, 42)).toBeGreaterThan(0);
            expect(Terrain.forgetColumns(geo, profile, 38, 42)).toBe(0);
            expect(JSON.stringify(read(40))).toBe(first);
        });
    });
});

describe('validateCourse', () => {
    let Terrain;
    let course;
    beforeEach(() => {
        ({ Terrain } = loadGame());
        course = fixtureCourse(Terrain);
    });

    test('the clean fixture gives no violation, and its gates are [45, 95, 148]', () => {
        expect(Terrain.validateCourse(course)).toEqual([]);
        expect(course.gates).toEqual([45, 95, 148]);
        expect(course.segments + 4).toBe(154);
    });

    // One edit per rule, each of which must give exactly one violation, with that rule's code
    const BREAKS = {
        coverage: (c) => { c.parts[1].from = 52; },
        landmark: (c) => { c.parts[2].landmark.at = 160; },
        straight: (c) => { c.layout[3].turnRate = -0.06; c.roadworks = [{ at: 64, type: 'roadworks' }]; },
        reach: (c) => { c.layout[3].turnRate = -0.2; },
        step: (c) => { c.elevation.points = [[0, 20], [40, 28], [100, 112], [150, 182]]; },
        curve: (c) => { c.elevation.points = [[0, 20], [40, 28], [60, 34], [64, 37], [68, 34], [100, 40], [150, 32]]; },
        control: (c) => { c.elevation.points = [[0, 20], [40, 28], [73, 33.2], [100, 40], [150, 32]]; },
        floor: (c) => { c.parts[1].floor = { kind: 'sea', y: 0, restY: 0.5 }; },
        gap: (c) => { c.gates = [45, 106, 148]; },
        finish: (c) => { c.gates = [45, 95, 140]; },
        multiple: (c) => { c.segments = 156; c.parts[2].to = 156; c.gates = [45, 95, 152]; c.elevation.points.push([156, 31.2]); },
        blend: (c) => { c.parts[1].blend = 40; }
    };

    test.each(Object.keys(BREAKS))('rule %s fires once, and only that rule', (rule) => {
        BREAKS[rule](course);
        const found = Terrain.validateCourse(course);
        expect(found.map(entry => entry.rule)).toEqual([rule]);
    });

    test('there is one fixture per rule, and the 12 rules are the ones the plan names', () => {
        expect(Object.keys(BREAKS)).toEqual(['coverage', 'landmark', 'straight', 'reach', 'step', 'curve', 'control', 'floor', 'gap', 'finish', 'multiple', 'blend']);
    });
});
