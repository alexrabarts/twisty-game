// Every model file the game can load (assets/**/*.glb, found at test time, so a
// file added later is checked with no edit here) through the game's own load
// step, SceneAssets.loadModel: each mesh comes out lit and in the shader's
// colour space. A mesh with no normals shades black (the leg bridge, a9e8add,
// and the world's houses), so each needs a unit normal at every vertex that
// faces the way its triangles wind, with most of its surface facing out of
// the model. Colours must reach the shader linear: never a float colour,
// which js/graphics.js fixColorSpaces would decode a second time, and never a
// kit file's raw sRGB bytes.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Blob } from 'node:buffer';
import { TextDecoder } from 'node:util';
import { canvasStub, loadScript, realThree } from '../helpers/load-game.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function modelFiles(dir = path.join(REPO, 'assets')) {
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return modelFiles(full);
        return entry.name.toLowerCase().endsWith('.glb') ? [path.relative(REPO, full).split(path.sep).join('/')] : [];
    }).sort();
}

function loadAssets() {
    const THREE = realThree();
    const fetch = async url => {
        const bytes = readFileSync(path.join(REPO, url));
        return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
    };
    // No image decoder in node: a texture only carries its image here
    const createImageBitmap = async blob => ({ width: 1, height: 1, bytes: blob.size });
    const sink = { log() {}, warn() {}, error() {} };
    const factory = new Function('THREE', 'document', 'console', 'fetch', 'createImageBitmap', 'Blob', 'TextDecoder', 'performance',
        `${loadScript('sceneassets.js')}\nreturn SceneAssets;`);
    return { THREE, SceneAssets: factory(THREE, canvasStub(), sink, fetch, createImageBitmap, Blob, TextDecoder, performance) };
}

// What is wrong with one mesh's surface (all its parts together), or [] when nothing is
function surfaceProblems(THREE, parts) {
    const problems = [];
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const face = new THREE.Vector3(), mid = new THREE.Vector3(), n = new THREE.Vector3();
    const centre = new THREE.Vector3();
    let count = 0;
    for (const { geometry } of parts) {
        const position = geometry.attributes.position;
        for (let i = 0; i < position.count; i++) { centre.add(a.fromBufferAttribute(position, i)); count++; }
    }
    centre.divideScalar(Math.max(1, count));
    let outward = 0, inward = 0, agree = 0, disagree = 0;
    parts.forEach(({ geometry, material }, k) => {
        const { position, normal, color } = geometry.attributes;
        if (!normal) { problems.push(`part ${k} (${material.name}) has no normal attribute`); return; }
        if (normal.count !== position.count) problems.push(`part ${k} has ${normal.count} normals for ${position.count} vertices`);
        let bad = 0;
        for (let i = 0; i < normal.count; i++) {
            n.fromBufferAttribute(normal, i);
            const length = n.length();
            if (!Number.isFinite(length) || Math.abs(length - 1) > 0.02) bad++;
        }
        if (bad) problems.push(`part ${k} (${material.name}) has ${bad} normals that are NaN or not unit length`);
        if (color && color.array instanceof Float32Array) problems.push(`part ${k} has a float colour, which the renderer would decode again`);
        if (geometry.userData.srgb && geometry.userData.srgb === color) problems.push(`part ${k} still draws the file's sRGB bytes`);
        if (!(material.metalness >= 0 && material.metalness <= 1 && material.roughness >= 0 && material.roughness <= 1)) problems.push(`part ${k} has metalness ${material.metalness}, roughness ${material.roughness}`);
        const index = geometry.index ? geometry.index.array : null;
        const triangles = (index ? index.length : position.count) / 3;
        const at = t => (index ? index[t] : t);
        for (let t = 0; t < triangles; t++) {
            const i0 = at(t * 3), i1 = at(t * 3 + 1), i2 = at(t * 3 + 2);
            a.fromBufferAttribute(position, i0); b.fromBufferAttribute(position, i1); c.fromBufferAttribute(position, i2);
            face.crossVectors(b.clone().sub(a), c.clone().sub(a));
            const area = face.length() / 2;
            if (area < 1e-9) continue;
            face.normalize();
            // The vertex normals point the way the triangle winds
            n.fromBufferAttribute(normal, i0).add(b.fromBufferAttribute(normal, i1)).add(c.fromBufferAttribute(normal, i2));
            if (n.dot(face) >= 0) agree += area; else disagree += area;
            // and the triangle faces away from the middle of the model
            mid.fromBufferAttribute(position, i0).add(a.fromBufferAttribute(position, i1)).add(a.fromBufferAttribute(position, i2)).divideScalar(3).sub(centre);
            const facing = mid.dot(face);
            if (facing > 0) outward += area; else if (facing < 0) inward += area;
        }
    });
    if (disagree > agree) problems.push(`most of the surface has normals against its winding (${disagree.toFixed(2)} of ${(agree + disagree).toFixed(2)} m²)`);
    if (inward > outward) problems.push(`most of the surface faces inward (${inward.toFixed(2)} of ${(inward + outward).toFixed(2)} m²)`);
    return problems;
}

const files = modelFiles();

test('the glob finds the model files', () => {
    expect(files.length).toBeGreaterThanOrEqual(16);
    expect(files).toContain('assets/village/houses.glb');
});

describe.each(files)('%s through SceneAssets.loadModel', file => {
    test('every mesh has unit normals that follow its winding and face out, and colours the shader reads as linear', async () => {
        const { THREE, SceneAssets } = loadAssets();
        const model = await SceneAssets.loadModel(file);
        expect(model.meshes.size).toBeGreaterThan(0);
        const found = {};
        for (const [name, parts] of model.meshes) {
            const problems = surfaceProblems(THREE, parts);
            if (problems.length) found[name] = problems;
        }
        expect(found).toEqual({});
    });
});

describe('the check itself', () => {
    const { THREE } = loadAssets();
    const box = () => {
        const geometry = new THREE.BoxGeometry(2, 2, 2);
        return [{ geometry, material: new THREE.MeshStandardMaterial({ name: 'box' }) }];
    };

    test('passes a plain box', () => {
        expect(surfaceProblems(THREE, box())).toEqual([]);
    });

    test('fails a mesh with no normals', () => {
        const parts = box();
        parts[0].geometry.deleteAttribute('normal');
        expect(surfaceProblems(THREE, parts).join()).toMatch(/no normal attribute/);
    });

    test('fails NaN and non-unit normals', () => {
        const parts = box();
        parts[0].geometry.attributes.normal.setXYZ(0, NaN, 0, 0);
        parts[0].geometry.attributes.normal.setXYZ(1, 0.5, 0, 0);
        expect(surfaceProblems(THREE, parts).join()).toMatch(/2 normals that are NaN or not unit length/);
    });

    test('fails a box turned inside out', () => {
        const parts = box();
        const index = parts[0].geometry.index.array;
        for (let t = 0; t < index.length; t += 3) [index[t + 1], index[t + 2]] = [index[t + 2], index[t + 1]];
        const normal = parts[0].geometry.attributes.normal;
        for (let i = 0; i < normal.count; i++) normal.setXYZ(i, -normal.getX(i), -normal.getY(i), -normal.getZ(i));
        expect(surfaceProblems(THREE, parts).join()).toMatch(/faces inward/);
    });

    test('fails normals that point against the winding', () => {
        const parts = box();
        const normal = parts[0].geometry.attributes.normal;
        for (let i = 0; i < normal.count; i++) normal.setXYZ(i, -normal.getX(i), -normal.getY(i), -normal.getZ(i));
        expect(surfaceProblems(THREE, parts).join()).toMatch(/against its winding/);
    });
});
