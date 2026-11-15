// Phase 7: per-leg atmosphere and render settings, and the code that applies them.
import { jest } from '@jest/globals';
import { buildEnvironment, canvasStub, gameMethods, loadGame, loadScript, realThree } from '../helpers/load-game.js';

const game = loadGame();
const THREE = realThree();
const config = (id) => game.Terrain.legConfig(id);

function loadGraphics() {
    const source = `${loadScript('graphics.js')}\nreturn Graphics;`;
    return new Function('THREE', 'document', 'window', source)(THREE, canvasStub(), {});
}

describe('leg atmosphere and render table', () => {
    test('far ring: coastal-descent 0.35, every other leg 1', () => {
        game.Terrain.LEGS.forEach(leg => {
            expect(leg.render.ring).toBe(leg.id === 'coastal-descent' ? 0.35 : 1);
        });
    });

    test('cull ceiling is 800 on the open legs (mountain-dawn, coastal-descent, winter-pass), else 600', () => {
        const wide = ['mountain-dawn', 'coastal-descent', 'winter-pass'];
        game.Terrain.LEGS.forEach(leg => {
            expect(leg.render.cullMax).toBe(wide.includes(leg.id) ? 800 : 600);
        });
    });

    test('shadow box is 200 wide on foggy-gorge and 120 elsewhere', () => {
        game.Terrain.LEGS.forEach(leg => {
            expect(leg.render.shadowSpan).toBe(leg.id === 'foggy-gorge' ? 200 : 120);
        });
    });

    test('light shafts are on for legs 1, 2, 4 and 5 only', () => {
        const on = game.Terrain.LEGS.filter(leg => leg.atmosphere.shafts > 0).map(leg => leg.id);
        expect(on).toEqual(['mountain-dawn', 'valley-run', 'foggy-gorge', 'high-pass']);
    });

    test('every leg has a height-fog density and falloff', () => {
        game.Terrain.LEGS.forEach(leg => {
            expect(leg.atmosphere.heightFog.density).toBeGreaterThan(0);
            expect(leg.atmosphere.heightFog.falloff).toBeGreaterThan(0);
        });
    });
});

describe('Game helpers', () => {
    test('lowestRoadHeight is the minimum road y over the leg', () => {
        const { lowestRoadHeight } = gameMethods(['lowestRoadHeight']);
        const { env, leg } = buildEnvironment(game, 1);
        const heights = env.roadPath.slice(leg.startSegment, leg.endSegment + 1).map(p => p.y || 0);
        expect(lowestRoadHeight(env, leg)).toBe(Math.min(...heights));
        expect(lowestRoadHeight({ roadPath: [] }, { startSegment: 0, endSegment: 5 })).toBe(0);
    });

    test('applyShadowBox sizes the box and the far plane from the span', () => {
        const camera = { updateProjectionMatrix: jest.fn() };
        const self = { directionalLight: { shadow: { camera } } };
        const { applyShadowBox } = gameMethods(['applyShadowBox'], self);
        applyShadowBox({ shadowSpan: 200 });
        expect([camera.left, camera.right, camera.top, camera.bottom]).toEqual([-100, 100, 100, -100]);
        expect(camera.far).toBe(400);
        applyShadowBox({ shadowSpan: 120 });
        expect(camera.right).toBe(60);
        expect(camera.far).toBe(300);
        expect(camera.updateProjectionMatrix).toHaveBeenCalledTimes(2);
    });

    test('performance culling clamps the distance to the leg ceiling', () => {
        jest.spyOn(console, 'log').mockImplementation(() => {});
        const run = (cullMax, density) => {
            const self = {
                scene: { traverse() {}, fog: { density } },
                environment: { config: { render: { cullMax } } }
            };
            gameMethods(['setupPerformanceCulling'], self, { THREE }).setupPerformanceCulling();
            return self.cullDistance;
        };
        expect(run(800, 0.0008)).toBe(800);
        expect(run(600, 0.0008)).toBe(600);
        expect(run(600, 0.012)).toBe(250);
        console.log.mockRestore();
    });
});

describe('Graphics.setAtmosphere', () => {
    const Graphics = loadGraphics();
    const fresh = (atmosphereSupported) => Object.assign(Object.create(Graphics.prototype), {
        atmosphereSupported, atmosphere: null, ringStrength: 1
    });
    const atmosphere = { heightFog: { density: 0.004, falloff: 0.04 }, shafts: 0.35 };

    test('keeps the fog settings, the ring strength and the base height', () => {
        const graphics = fresh(true);
        graphics.setAtmosphere(atmosphere, { ring: 0.35 }, 12);
        expect(graphics.atmosphere).toEqual({ heightFog: atmosphere.heightFog, shafts: 0.35, baseY: 12 });
        expect(graphics.ringStrength).toBe(0.35);
    });

    test('null resets both', () => {
        const graphics = fresh(true);
        graphics.setAtmosphere(atmosphere, { ring: 0.35 }, 12);
        graphics.setAtmosphere(null);
        expect(graphics.atmosphere).toBeNull();
        expect(graphics.ringStrength).toBe(1);
    });

    test('without a depth texture the atmosphere stays off but the ring still scales', () => {
        const graphics = fresh(false);
        graphics.setAtmosphere(atmosphere, { ring: 0.35 }, 0);
        expect(graphics.atmosphere).toBeNull();
        expect(graphics.ringStrength).toBe(0.35);
    });
});

describe('Graphics post set-up', () => {
    const Graphics = loadGraphics();
    const build = (extensions, isWebGL2 = true) => {
        const graphics = Object.create(Graphics.prototype);
        graphics.renderer = { capabilities: { isWebGL2 }, extensions: { has: name => extensions.includes(name) } };
        graphics.sunScreen = new THREE.Vector2();
        graphics.atmosphereSupported = isWebGL2 && extensions.includes('EXT_color_buffer_float') &&
            !extensions.includes('WEBGL_multisampled_render_to_texture');
        graphics.setupPost();
        return graphics;
    };

    test('scene target carries a DepthFormat texture and shafts get a target', () => {
        const graphics = build(['EXT_color_buffer_float']);
        expect(graphics.sceneTarget.depthTexture.isDepthTexture).toBe(true);
        expect(graphics.sceneTarget.depthTexture.format).toBe(THREE.DepthFormat);
        expect(graphics.sceneTarget.samples).toBe(4);
        expect(graphics.shaftTarget).toBeDefined();
    });

    test('the multisampled-render-to-texture path gets no depth texture and no shaft target', () => {
        const graphics = build(['EXT_color_buffer_float', 'WEBGL_multisampled_render_to_texture']);
        expect(graphics.sceneTarget.depthTexture).toBeNull();
        expect(graphics.shaftTarget).toBeUndefined();
    });

    test('shaft target is a quarter of the scene target', () => {
        const graphics = build(['EXT_color_buffer_float']);
        graphics.bufferSize = new THREE.Vector2();
        graphics.renderer.getDrawingBufferSize = (v) => v.set(1283, 721);
        graphics.resizeTargets();
        expect(graphics.shaftTarget.width).toBe(Math.floor(graphics.sceneTarget.width / 4));
        expect(graphics.shaftTarget.height).toBe(Math.floor(graphics.sceneTarget.height / 4));
    });
});

describe('the night sky', () => {
    const source = loadScript('graphics.js');
    const starBlock = source.slice(source.indexOf('// Stars'), source.indexOf('// Sun or moon disc'));

    test('stars twinkle slowly and faintly: 8% at 0.3 to 1.0 rad/s', () => {
        const match = starBlock.match(/float twinkle = ([\d.]+) \+ ([\d.]+) \* sin\(uTime \* \(([\d.]+) \+ r \* ([\d.]+)\)/);
        expect(match).not.toBeNull();
        const [, base, amplitude, slowest, extra] = match.map(Number);
        expect(base + amplitude).toBeCloseTo(1, 9);
        expect(amplitude).toBeLessThanOrEqual(0.1);
        expect(slowest).toBeGreaterThanOrEqual(0.3);
        expect(slowest + extra).toBeLessThanOrEqual(1.0);
    });

    test('a star is spread over at least a pixel and dimmed by the same area, so it does not shimmer', () => {
        expect(starBlock).toMatch(/fwidth\(suv\)/);
        expect(starBlock).toMatch(/float radius = max\(0\.09, 0\.75 \* max\(pixel\.x, pixel\.y\)\)/);
        expect(starBlock).toMatch(/\(0\.09 \* 0\.09\) \/ \(radius \* radius\)/);
        // Both sky materials ask for derivatives, for WebGL1
        expect((source.match(/extensions: \{ derivatives: true \}/g) || []).length).toBe(2);
    });
});
