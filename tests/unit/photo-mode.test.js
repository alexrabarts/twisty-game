// Photo mode in free roam (js/world/photo.js; .agent/system/world.md, "Free roam"): a camera that goes round the bike,
// up and down and in and out within its limits, never into the ground, looking at the rider; its bar's keys; a file
// name with no place in it
import { describe, test, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const { PhotoMode } = new Function(`${readFileSync(`${root}js/world/photo.js`, 'utf8')}\nreturn { PhotoMode };`)();
const bike = { position: { x: 10, y: 100, z: 20 }, yawAngle: 0 };

describe('photo mode', () => {
    test('it starts behind the bike, looking at the rider, and goes round it', () => {
        const photo = new PhotoMode(bike, () => NaN);
        const pose = photo.pose();
        // (the bike faces +z: behind it is -z)
        expect(pose.z).toBeLessThan(bike.position.z);
        expect(pose.x).toBeCloseTo(bike.position.x, 6);
        expect(pose.look).toEqual({ x: 10, y: 100 + PhotoMode.LOOK_UP_M, z: 20 });
        for (let k = 0; k < 12; k++) photo.orbit(1);
        expect(photo.pose().z).toBeGreaterThan(bike.position.z);
        const far = Math.hypot(pose.x - 10, pose.y - pose.look.y, pose.z - 20);
        expect(far).toBeCloseTo(photo.distance, 6);
    });

    test('up and down and in and out stop at their limits', () => {
        const photo = new PhotoMode(bike, () => NaN), L = PhotoMode.LIMITS;
        for (let k = 0; k < 100; k++) { photo.tilt(1); photo.zoom(1); }
        expect([photo.pitch, photo.distance]).toEqual([L.pitchMax, L.distanceMax]);
        for (let k = 0; k < 100; k++) { photo.tilt(-1); photo.zoom(-1); }
        expect([photo.pitch, photo.distance]).toEqual([L.pitchMin, L.distanceMin]);
    });

    test('the camera never goes into the ground', () => {
        const photo = new PhotoMode(bike, () => 105);
        for (let k = 0; k < 100; k++) photo.tilt(-1);
        expect(photo.pose().y).toBeGreaterThanOrEqual(105 + PhotoMode.CLEAR_M);
    });

    test('the bar: a button for each act, each with its keys; Escape and V go back', () => {
        const acts = [];
        const bar = PhotoMode.bar(document, name => acts.push(name));
        const keys = Object.fromEntries([...bar.querySelectorAll('[data-photo]')].map(b => [b.dataset.photo, b.dataset.key]));
        expect(Object.keys(keys)).toEqual(['left', 'right', 'up', 'down', 'closer', 'further', 'save', 'done']);
        expect(keys.done.split(',')).toEqual(['Escape', PhotoMode.KEY]);
        bar.querySelector('[data-photo="save"]').click();
        expect(acts).toEqual(['save']);
    });

    test('a saved picture is named by the time alone', () => {
        expect(PhotoMode.fileName(new Date(2026, 10, 25, 9, 5, 7))).toBe('twisty-20261125-090507.png');
    });
});
