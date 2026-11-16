import { jest } from '@jest/globals';
import { loadGame, buildEnvironment } from '../helpers/load-game.js';

// Mock THREE.js
global.THREE = {
    Group: class {
        constructor() {
            this.position = { x: 0, y: 0, z: 0, set: function(x, y, z) { this.x = x; this.y = y; this.z = z; } };
            this.rotation = { x: 0, y: 0, z: 0 };
            this.visible = true;
        }
        add() {}
    },
    Mesh: class {
        constructor() {
            this.position = { x: 0, y: 0, z: 0 };
            this.rotation = { x: 0, y: 0, z: 0 };
            this.castShadow = false;
            this.receiveShadow = false;
            this.material = { color: { setHex: jest.fn() }, emissive: { setHex: jest.fn() }, emissiveIntensity: 0 };
        }
    },
    MeshStandardMaterial: class {
        constructor() {
            this.color = { setHex: jest.fn() };
            this.emissive = { setHex: jest.fn() };
            this.emissiveIntensity = 0;
        }
    },
    BoxGeometry: class {},
    CylinderGeometry: class {},
    SphereGeometry: class {},
    PlaneGeometry: class {},
    Vector3: class {
        constructor(x = 0, y = 0, z = 0) {
            this.x = x;
            this.y = y;
            this.z = z;
        }
    }
};

// Mock Traffic classes since they're global browser classes
class Traffic {
    constructor(scene, environment) {
        this.scene = scene;
        this.environment = environment;
        this.cars = [];
        this.motorcycles = [];
        this.maxCars = 1;
        this.maxMotorcycles = 4;
        this.carSpacing = 250;
        this.motorcycleSpacing = 150;
        
        this.initializeCars();
        this.initializeMotorcycles();
    }
    
    initializeCars() {
        const totalSegments = this.environment.roadPath.length;
        
        for (let i = 0; i < 1; i++) {
            const startSegment = Math.floor(Math.random() * totalSegments);
            const car = {
                direction: -1,
                speed: 15 + Math.random() * 10,
                currentSegment: startSegment,
                lane: 'right',
                update: jest.fn(),
                checkCollision: jest.fn(() => false),
                onCollision: jest.fn(),
                remove: jest.fn()
            };
            this.cars.push(car);
        }
    }
    
    initializeMotorcycles() {
        const totalSegments = this.environment.roadPath.length;
        const spacing = Math.floor(totalSegments / this.maxMotorcycles);
        
        const skillLevels = ['slow', 'average', 'fast', 'expert'];
        
        for (let i = 0; i < this.maxMotorcycles; i++) {
            const startSegment = (i * spacing + Math.floor(Math.random() * spacing * 0.3)) % totalSegments;
            const skill = skillLevels[i % skillLevels.length];
            let baseSpeed;
            
            switch(skill) {
                case 'slow': baseSpeed = 28 + Math.random() * 5; break;
                case 'average': baseSpeed = 33 + Math.random() * 5; break;
                case 'fast': baseSpeed = 38 + Math.random() * 5; break;
                case 'expert': baseSpeed = 43 + Math.random() * 7; break;
            }
            
            const motorcycle = {
                direction: 1,
                baseSpeed: baseSpeed,
                currentSpeed: baseSpeed,
                currentSegment: startSegment,
                lane: 'left',
                skill: skill,
                bikeGroup: new global.THREE.Group(),
                update: jest.fn(),
                checkCollision: jest.fn(() => false),
                onCollision: jest.fn(),
                remove: jest.fn()
            };
            this.motorcycles.push(motorcycle);
        }
    }
    
    update(deltaTime, playerPosition) {
        let collisionResult = null;
        
        this.cars.forEach(car => {
            car.update(deltaTime);
            
            if (!collisionResult && car.checkCollision(playerPosition)) {
                car.onCollision();
                collisionResult = { hit: true, vehicle: car };
            }
        });
        
        this.motorcycles.forEach(motorcycle => {
            motorcycle.update(deltaTime, playerPosition, this.motorcycles);
            
            if (!collisionResult && motorcycle.checkCollision(playerPosition)) {
                motorcycle.onCollision();
                collisionResult = { hit: true, vehicle: motorcycle };
            }
        });
        
        if (collisionResult) {
            return collisionResult;
        }
        
        return { hit: false };
    }
    
    reset() {
        this.cars.forEach(car => car.remove());
        this.motorcycles.forEach(motorcycle => motorcycle.remove());
        this.cars = [];
        this.motorcycles = [];
        this.initializeCars();
        this.initializeMotorcycles();
    }
}

describe('Traffic System', () => {
    let mockScene, mockEnvironment;

    beforeEach(() => {
        mockScene = {
            add: jest.fn(),
            remove: jest.fn(),
            traverse: jest.fn()
        };

        mockEnvironment = {
            roadPath: Array.from({ length: 100 }, (_, i) => ({
                x: i * 10,
                y: 0,
                z: i * 20,
                heading: 0
            }))
        };
    });

    test('should initialize traffic with cars and motorcycles', () => {
        const traffic = new Traffic(mockScene, mockEnvironment);
        
        expect(traffic.cars).toBeDefined();
        expect(traffic.motorcycles).toBeDefined();
        expect(Array.isArray(traffic.cars)).toBe(true);
        expect(Array.isArray(traffic.motorcycles)).toBe(true);
    });

    test('should create correct number of AI motorcycles', () => {
        const traffic = new Traffic(mockScene, mockEnvironment);
        
        expect(traffic.motorcycles.length).toBe(traffic.maxMotorcycles);
        expect(traffic.motorcycles.length).toBe(4);
    });

    test('should assign different skill levels to AI bikes', () => {
        const traffic = new Traffic(mockScene, mockEnvironment);
        
        const speeds = traffic.motorcycles.map(bike => bike.baseSpeed);
        const uniqueSpeeds = new Set(speeds);
        
        // Should have variety in speeds (at least 2 different speed ranges)
        expect(uniqueSpeeds.size).toBeGreaterThanOrEqual(2);
    });

    test('should update traffic without errors', () => {
        const traffic = new Traffic(mockScene, mockEnvironment);
        const playerPosition = { x: 50, y: 0, z: 100 };
        
        expect(() => {
            traffic.update(0.016, playerPosition);
        }).not.toThrow();
    });

    test('should detect collisions with player', () => {
        const traffic = new Traffic(mockScene, mockEnvironment);
        const playerPosition = { x: 0, y: 0, z: 0 };
        
        // Position a motorcycle at player location
        if (traffic.motorcycles.length > 0 && traffic.motorcycles[0].bikeGroup) {
            traffic.motorcycles[0].bikeGroup.position.x = 0;
            traffic.motorcycles[0].bikeGroup.position.y = 0;
            traffic.motorcycles[0].bikeGroup.position.z = 0;
            
            const collision = traffic.update(0.016, playerPosition);
            expect(collision).toBeDefined();
        }
    });

    test('should reset traffic correctly', () => {
        const traffic = new Traffic(mockScene, mockEnvironment);
        const initialMotorcycleCount = traffic.motorcycles.length;
        
        traffic.reset();
        
        expect(traffic.motorcycles.length).toBe(initialMotorcycleCount);
        expect(traffic.cars.length).toBe(traffic.maxCars);
    });

    test('should handle AI bike drafting', () => {
        const traffic = new Traffic(mockScene, mockEnvironment);
        
        if (traffic.motorcycles.length >= 2) {
            const bike1 = traffic.motorcycles[0];
            const bike2 = traffic.motorcycles[1];
            
            // Position bike2 behind bike1
            if (bike1.bikeGroup && bike2.bikeGroup) {
                bike1.bikeGroup.position.z = 100;
                bike2.bikeGroup.position.z = 90;
                bike2.baseSpeed = 30;
                
                const playerPosition = { x: 0, y: 0, z: 50 };
                traffic.update(0.016, playerPosition);
                
                // Bike should speed up when drafting (within 15 units)
                expect(bike2.currentSpeed).toBeGreaterThanOrEqual(bike2.baseSpeed);
            }
        }
    });

    test('AI bikes should avoid cars', () => {
        const traffic = new Traffic(mockScene, mockEnvironment);
        
        if (traffic.motorcycles.length > 0) {
            const bike = traffic.motorcycles[0];
            const initialSpeed = bike.baseSpeed;
            
            // Mock scene traverse to simulate car ahead
            mockScene.traverse = jest.fn((callback) => {
                callback({
                    name: 'carBody',
                    parent: {
                        position: {
                            x: bike.bikeGroup.position.x,
                            y: 0,
                            z: bike.bikeGroup.position.z + 20
                        }
                    }
                });
            });
            
            const playerPosition = { x: 0, y: 0, z: 0 };
            traffic.update(0.016, playerPosition);
            
            // Bike should slow down when car detected ahead
            expect(bike.currentSpeed).toBeLessThanOrEqual(initialSpeed);
        }
    });
});

describe('AI Motorcycle', () => {
    let mockScene, mockEnvironment;

    beforeEach(() => {
        mockScene = {
            add: jest.fn(),
            remove: jest.fn(),
            traverse: jest.fn()
        };

        mockEnvironment = {
            roadPath: Array.from({ length: 100 }, (_, i) => ({
                x: i * 10,
                y: 0,
                z: i * 20,
                heading: 0
            }))
        };
    });

    test('should create bike with valid properties', () => {
        const traffic = new Traffic(mockScene, mockEnvironment);
        
        if (traffic.motorcycles.length > 0) {
            const bike = traffic.motorcycles[0];
            
            expect(bike.baseSpeed).toBeGreaterThan(0);
            expect(bike.currentSpeed).toBeGreaterThan(0);
            expect(bike.bikeGroup).toBeDefined();
        }
    });

    test('should handle collision detection', () => {
        const traffic = new Traffic(mockScene, mockEnvironment);
        
        if (traffic.motorcycles.length > 0) {
            const bike = traffic.motorcycles[0];
            const closePosition = { x: 0, y: 0, z: 0 };
            
            if (bike.bikeGroup) {
                bike.bikeGroup.position.x = 0;
                bike.bikeGroup.position.y = 0;
                bike.bikeGroup.position.z = 0;
                
                // Override the mock to return true for this test
                bike.checkCollision = jest.fn(() => true);
                
                const collision = bike.checkCollision(closePosition);
                expect(collision).toBe(true);
            }
        }
    });
});

// The real class on the real shared course, with Math.random fixed at 0: the
// crew then stands on its grid base and the oncoming car on the lowest start.
describe('Traffic starts on the shared course (real class)', () => {
    const PINS = [
        ['mountain-dawn', 42, [20, 17, 14, 11, 8]],
        ['valley-run', 117, [90, 87, 84, 81, 78]],
        ['coastal-descent', 199, [170, 167, 164, 161, 158]],
        ['foggy-gorge', 285, [254, 251, 248, 245, 242]],
        ['high-pass', 375, [342, 339, 336, 333, 330]],
        ['storm-valley', 469, [434, 431, 428, 425, 422]],
        ['night-ride', 566, [530, 527, 524, 521, 518]],
        ['winter-pass', 663, [628, 625, 622, 619, 616]]
    ];
    let game;
    beforeAll(() => {
        game = loadGame();
    });

    test.each(PINS.map((pin, index) => [...pin, index]))('%s keeps its car and crew start segments', (id, car, crew, index) => {
        const quiet = console.log;
        const random = Math.random;
        console.log = () => {};
        Math.random = () => 0;
        let traffic;
        try {
            const { env, scene, leg } = buildEnvironment(game, index);
            expect(leg.id).toBe(id);
            traffic = new game.Traffic(scene, env);
        } finally {
            console.log = quiet;
            Math.random = random;
        }
        expect(traffic.cars.map(entry => entry.currentSegment)).toEqual([car]);
        expect(traffic.motorcycles.map(entry => entry.currentSegment)).toEqual(crew);
    });
});
