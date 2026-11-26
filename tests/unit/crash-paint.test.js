/**
 * A crash never repaints the bike: the rider sees their own bike fall, in its own colours.
 */
import { readFileSync } from 'node:fs';
import { Blob } from 'node:buffer';
import { TextDecoder } from 'node:util';
import { canvasStub, loadScript, realThree } from '../helpers/load-game.js';

function load() {
    const THREE = realThree();
    const source = ['vehicle.js', 'sceneassets.js', 'bikemodels.js', 'traffic.js'].map(loadScript).join('\n;\n');
    const sink = { log() {}, warn() {}, error() {} };
    const factory = new Function(
        'THREE', 'document', 'localStorage', 'console', 'fetch', 'Blob', 'TextDecoder', 'performance',
        `${source}\nreturn { Vehicle, CHARACTERS };`
    );
    const fetch = async () => ({ ok: false, status: 404 });
    return { THREE, ...factory(THREE, canvasStub(), { getItem: () => null, setItem() {} }, sink, fetch, Blob, TextDecoder, performance) };
}

describe('crash paint', () => {
    test('no game code writes anything but the bike colour to the rider bike paint', () => {
        const offenders = [];
        ['vehicle.js', 'main.js'].forEach((file) => {
            readFileSync(new URL(`../../js/${file}`, import.meta.url), 'utf8').split('\n').forEach((line, i) => {
                if (/frame\.material\.color\.setHex\(/.test(line) && !/bikeColor/.test(line)) offenders.push(`${file}:${i + 1}: ${line.trim()}`);
            });
        });
        expect(offenders).toEqual([]);
    });

    test('a world crash keeps the paint', () => {
        const game = load();
        const vehicle = new game.Vehicle(new game.THREE.Scene(), null, game.CHARACTERS[0], null, { model: false });
        const before = vehicle.frame.material.color.getHex();
        vehicle.worldCrash('Too fast on the grass');
        expect(vehicle.crashed).toBe(true);
        expect(vehicle.frame.material.color.getHex()).toBe(before);
    });
});
