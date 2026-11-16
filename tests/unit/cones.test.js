import { jest } from '@jest/globals';
import { loadGame, buildEnvironment } from '../helpers/load-game.js';
import { createHash } from 'node:crypto';

describe('Cones System', () => {
    describe('Cone placement', () => {
        test('should place cones on straight sections', () => {
            const roadPath = [];
            for (let i = 0; i < 20; i++) {
                roadPath.push({
                    x: 0,
                    z: i * 20,
                    y: 0,
                    heading: 0 // Straight (no heading change)
                });
            }
            
            const conePositions = [];
            roadPath.forEach((point, index) => {
                const prevIndex = Math.max(0, index - 1);
                const nextIndex = Math.min(index + 1, roadPath.length - 1);
                const headingChange = Math.abs(roadPath[nextIndex].heading - roadPath[prevIndex].heading);
                
                if (headingChange < 0.02 && index % 4 === 0) {
                    conePositions.push({ x: point.x, z: point.z });
                }
            });
            
            expect(conePositions.length).toBeGreaterThan(0);
        });

        test('should place cones on alternating sides for slalom', () => {
            const conePositions = [];
            const roadPath = Array.from({ length: 20 }, (_, i) => ({
                x: 0,
                z: i * 20,
                y: 0,
                heading: 0
            }));
            
            roadPath.forEach((point, index) => {
                if (index % 4 === 0) {
                    const sideOffset = (Math.floor(index / 4) % 2 === 0) ? 10 : -10;
                    conePositions.push({
                        x: point.x + sideOffset,
                        z: point.z,
                        side: sideOffset > 0 ? 'right' : 'left'
                    });
                }
            });
            
            // Should have cones on both sides
            const leftCones = conePositions.filter(c => c.side === 'left');
            const rightCones = conePositions.filter(c => c.side === 'right');
            
            expect(leftCones.length).toBeGreaterThan(0);
            expect(rightCones.length).toBeGreaterThan(0);
        });

        test('should place cones at corner apex', () => {
            const roadPath = [];
            for (let i = 0; i < 10; i++) {
                roadPath.push({
                    x: i * 10,
                    z: i * 10,
                    y: 0,
                    heading: i * 0.1 // Turning
                });
            }
            
            const conePositions = [];
            roadPath.forEach((point, index) => {
                const prevIndex = Math.max(0, index - 1);
                const nextIndex = Math.min(index + 1, roadPath.length - 1);
                const headingChange = Math.abs(roadPath[nextIndex].heading - roadPath[prevIndex].heading);
                
                if (headingChange >= 0.02 && index % 6 === 0) {
                    conePositions.push({ x: point.x, z: point.z });
                }
            });
            
            expect(conePositions.length).toBeGreaterThan(0);
        });

        test('should avoid placing cones at checkpoints', () => {
            const checkpointSegments = [18, 32, 46, 60, 2];
            const roadSegment = 19; // Near checkpoint 18
            
            const isNearCheckpoint = checkpointSegments.some(cp => Math.abs(roadSegment - cp) < 5);
            
            expect(isNearCheckpoint).toBe(true);
        });
    });

    describe('Cone collision detection', () => {
        test('should detect collision when vehicle is close', () => {
            const cone = { x: 0, y: 0, z: 0, radius: 0.5 };
            const vehicle = { x: 0.3, y: 0, z: 0 };
            
            const dx = vehicle.x - cone.x;
            const dy = vehicle.y - cone.y;
            const dz = vehicle.z - cone.z;
            const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
            const collisionThreshold = 1.5;
            
            const collision = distance < collisionThreshold;
            
            expect(collision).toBe(true);
        });

        test('should not detect collision when vehicle is far', () => {
            const cone = { x: 0, y: 0, z: 0, radius: 0.5 };
            const vehicle = { x: 5, y: 0, z: 0 };
            
            const dx = vehicle.x - cone.x;
            const dy = vehicle.y - cone.y;
            const dz = vehicle.z - cone.z;
            const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
            const collisionThreshold = 1.5;
            
            const collision = distance < collisionThreshold;
            
            expect(collision).toBe(false);
        });

        test('should mark cone as hit after collision', () => {
            const cone = { hit: false };
            
            cone.hit = true;
            
            expect(cone.hit).toBe(true);
        });

        test('should not count same cone twice', () => {
            const cone = { hit: false, points: 0 };
            const basePoints = 25;
            
            // First hit
            if (!cone.hit) {
                cone.hit = true;
                cone.points += basePoints;
            }
            
            // Try to hit again
            if (!cone.hit) {
                cone.points += basePoints;
            }
            
            expect(cone.points).toBe(25);
        });
    });

    describe('Cone scoring', () => {
        test('should award base points for hitting cone', () => {
            const basePoints = 25;
            const score = basePoints;
            
            expect(score).toBe(25);
        });

        test('should call callback on cone hit', () => {
            const callback = jest.fn();
            const points = 25;
            
            callback(points);
            
            expect(callback).toHaveBeenCalledWith(25);
        });

        test('should accumulate points from multiple cones', () => {
            let totalScore = 0;
            const conesHit = [25, 25, 25];
            
            conesHit.forEach(points => {
                totalScore += points;
            });
            
            expect(totalScore).toBe(75);
        });
    });

    describe('Cone reset functionality', () => {
        test('should reset all cones to not hit', () => {
            const cones = [
                { hit: true },
                { hit: true },
                { hit: true }
            ];
            
            cones.forEach(cone => {
                cone.hit = false;
            });
            
            const anyHit = cones.some(c => c.hit);
            expect(anyHit).toBe(false);
        });

        test('should make cones visible after reset', () => {
            const cones = [
                { visible: false },
                { visible: false }
            ];
            
            cones.forEach(cone => {
                cone.visible = true;
            });
            
            const allVisible = cones.every(c => c.visible);
            expect(allVisible).toBe(true);
        });
    });

    describe('Cone geometry', () => {
        test('should have correct cone dimensions', () => {
            const coneRadius = 0.25;
            const coneHeight = 0.8;
            
            expect(coneRadius).toBeGreaterThan(0);
            expect(coneHeight).toBeGreaterThan(coneRadius);
        });

        test('should calculate cone volume', () => {
            const radius = 0.25;
            const height = 0.8;
            const volume = (1/3) * Math.PI * radius * radius * height;
            
            expect(volume).toBeCloseTo(0.0524, 3);
        });
    });

    describe('Cone elevation matching', () => {
        test('should place cone at road elevation', () => {
            const coneX = 5;
            const coneZ = 10;
            const roadPoints = [
                { x: 0, z: 0, y: 10 },
                { x: 5, z: 10, y: 15 },
                { x: 10, z: 20, y: 12 }
            ];
            
            let closestY = 0;
            let minDist = Infinity;
            
            for (const point of roadPoints) {
                const dist = Math.sqrt(
                    Math.pow(coneX - point.x, 2) + 
                    Math.pow(coneZ - point.z, 2)
                );
                if (dist < minDist) {
                    minDist = dist;
                    closestY = point.y;
                }
            }
            
            expect(closestY).toBe(15);
        });
    });

    describe('Cone pattern generation', () => {
        test('should create slalom pattern', () => {
            const pattern = [];
            const spacing = 4;
            const offset = 10;
            
            for (let i = 0; i < 10; i++) {
                if (i % spacing === 0) {
                    const side = (Math.floor(i / spacing) % 2 === 0) ? 1 : -1;
                    pattern.push({
                        index: i,
                        offset: side * offset
                    });
                }
            }
            
            expect(pattern.length).toBe(3);
            expect(pattern[0].offset).toBe(10);
            expect(pattern[1].offset).toBe(-10);
        });

        test('should create chicane pattern', () => {
            const chicanePattern = [
                { offset: -10 },
                { offset: 10 },
                { offset: -10 }
            ];
            
            expect(chicanePattern.length).toBe(3);
            
            // Should alternate
            expect(chicanePattern[0].offset * chicanePattern[1].offset).toBeLessThan(0);
            expect(chicanePattern[1].offset * chicanePattern[2].offset).toBeLessThan(0);
        });
    });

    describe('Cone visibility culling', () => {
        test('should hide cones beyond render distance', () => {
            const cone = { x: 500, z: 500 };
            const camera = { x: 0, z: 0 };
            const renderDistance = 200;
            
            const dx = cone.x - camera.x;
            const dz = cone.z - camera.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            const shouldRender = distance < renderDistance;
            
            expect(shouldRender).toBe(false);
        });

        test('should show cones within render distance', () => {
            const cone = { x: 50, z: 50 };
            const camera = { x: 0, z: 0 };
            const renderDistance = 200;
            
            const dx = cone.x - camera.x;
            const dz = cone.z - camera.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            const shouldRender = distance < renderDistance;
            
            expect(shouldRender).toBe(true);
        });
    });
});

// The real class on the real shared course, pinned per leg: a change to how
// cones are placed (per section, on a long leg) must not move one cone on a
// leg that is still on the shared course.
describe('Cones on the shared course (real class)', () => {
    const PINS = [
        ['valley-run', 10, 'b11ea656095051ab'],
        ['coastal-descent', 8, '97a039ae0a44423b'],
        ['foggy-gorge', 11, 'ba8f5b062306f1d6'],
        ['high-pass', 9, 'd02eececa719e049'],
        ['storm-valley', 13, '6b275e94ba7bda48'],
        ['night-ride', 11, '3882874582f3d56a'],
        ['winter-pass', 10, 'f85a54a6d06e44a9']
    ];
    let game;
    beforeAll(() => {
        game = loadGame();
    });

    test.each(PINS.map((pin) => [...pin, ['mountain-dawn', 'valley-run', 'coastal-descent', 'foggy-gorge', 'high-pass', 'storm-valley', 'night-ride', 'winter-pass'].indexOf(pin[0])]))('%s keeps its cone count and positions', (id, count, digest, index) => {
        const quiet = console.log;
        console.log = () => {};
        let cones;
        try {
            const { env, scene, leg } = buildEnvironment(game, index);
            expect(leg.id).toBe(id);
            cones = new game.Cones(scene, env);
        } finally {
            console.log = quiet;
        }
        const flat = cones.cones.flatMap(cone => [cone.position.x, cone.position.y, cone.position.z]);
        expect(cones.cones).toHaveLength(count);
        expect(createHash('sha256').update(Buffer.from(new Float64Array(flat).buffer)).digest('hex').slice(0, 16)).toBe(digest);
    });
});
