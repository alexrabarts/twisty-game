// Nothing is drawn before it is dressed (Graphics.watchAdds, dressAdded): every object added to any parent is noted,
// and before the next draw what now hangs in the scene has its sRGB vertex colours decoded and the game's own dressing
// (a world's shadows and tree share). A stopping place's props rebuilt as the bike comes near drew a frame or more pale
// before this rule, until the 1.5 s colour scan found them (tools/terrain-check.mjs world-flash).
import { describe, test, expect, jest } from '@jest/globals';
import { loadScript, realThree } from '../helpers/load-game.js';

const THREE = realThree();
const { Graphics } = new Function('THREE', `${loadScript('graphics.js')}\nreturn { Graphics };`)(THREE);

// A Graphics with only what dressAdded reads
function graphics() {
    return { seenTextures: new WeakSet(), seenGeometries: new WeakSet(), stats: {}, fixColorSpaces: Graphics.prototype.fixColorSpaces, onAdded: jest.fn() };
}

function coloured() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5], 3));
    return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true }));
}

describe('dressed before the first draw', () => {
    test('a mesh added to a group, the group then added to the scene, is decoded and dressed at the next draw', () => {
        Graphics.watchAdds();
        const scene = new THREE.Scene(), group = new THREE.Group(), mesh = coloured(), g = graphics();
        group.add(mesh);
        scene.add(group);
        // (the mesh and its group both now hang in the scene: both are noted, the colours decoded once)
        expect(Graphics.prototype.dressAdded.call(g, scene)).toBe(2);
        // 0.5 in sRGB is 0.214 linear
        expect(mesh.geometry.attributes.color.array[0]).toBeCloseTo(0.214, 3);
        expect(g.onAdded).toHaveBeenCalledWith(group);
        // Once only
        expect(Graphics.prototype.dressAdded.call(g, scene)).toBe(0);
        Graphics.prototype.fixColorSpaces.call(g, scene);
        expect(mesh.geometry.attributes.color.array[0]).toBeCloseTo(0.214, 3);
    });

    test('a mesh rebuilt into a group already in the scene is dressed at the next draw; one hanging elsewhere is not', () => {
        Graphics.watchAdds();
        const scene = new THREE.Scene(), places = new THREE.Group(), g = graphics();
        scene.add(places);
        Graphics.prototype.dressAdded.call(g, scene);
        g.onAdded.mockClear();
        const rebuilt = coloured(), elsewhere = coloured(), loose = new THREE.Group();
        places.add(rebuilt);
        loose.add(elsewhere);
        expect(Graphics.prototype.dressAdded.call(g, scene)).toBe(1);
        expect(rebuilt.geometry.attributes.color.array[0]).toBeCloseTo(0.214, 3);
        expect(elsewhere.geometry.attributes.color.array[0]).toBe(0.5);
        expect(g.onAdded).toHaveBeenCalledTimes(1);
        expect(g.onAdded).toHaveBeenCalledWith(rebuilt);
    });
});
