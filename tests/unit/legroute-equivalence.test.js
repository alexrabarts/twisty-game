// The W1 ports change nothing on the legs. tests/fixtures/world/leg-baseline.json
// was captured from the tree BEFORE the port (a9e8add) by
// tools/world/capture-baseline.mjs: for each leg, 10 000 seeded points through
// the vehicle's segment pick, lateral, surface and ground reads, traffic
// positions, cone height, tunnel roof, start position, atmosphere heights and
// the autopilot's steering, each hashed as raw float64 bytes. This test runs
// the same capture on the ported tree and requires every hash to match.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE_COMMIT, captureTree } from '../../tools/world/capture-baseline.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const baseline = JSON.parse(readFileSync(new URL('../fixtures/world/leg-baseline.json', import.meta.url), 'utf8'));

describe('the ported call sites reproduce the pre-port outputs bit for bit', () => {
    test('the fixture records its base commit and covers the eight legs', () => {
        expect(baseline.base).toBe(BASE_COMMIT);
        expect(baseline.points).toBe(10000);
        expect(baseline.legs).toHaveLength(8);
    });

    test('every hash of every leg matches the baseline', () => {
        const live = captureTree(root, { points: baseline.points });
        expect(live.map(leg => leg.id)).toEqual(baseline.legs.map(leg => leg.id));
        live.forEach((leg, n) => {
            const recorded = baseline.legs[n].hashes;
            expect(Object.keys(leg.hashes)).toEqual(Object.keys(recorded));
            Object.keys(recorded).forEach(key => {
                expect([leg.id, key, leg.hashes[key].count, leg.hashes[key].sha256])
                    .toEqual([leg.id, key, recorded[key].count, recorded[key].sha256]);
            });
        });
    });

    test('planted: one call site wired to Math.round(s) is caught', () => {
        const copy = mkdtempSync(join(tmpdir(), 'legroute-mutant-'));
        try {
            cpSync(join(root, 'js'), join(copy, 'js'), { recursive: true });
            cpSync(join(root, 'tools/autopilot.js'), join(copy, 'autopilot.js'));
            // Traffic's lerp progress is rounded to the vertex
            const file = join(copy, 'js/traffic.js');
            const source = readFileSync(file, 'utf8');
            const mutated = source.replaceAll('sampleAt(this.currentSegment, this.segmentProgress,', 'sampleAt(this.currentSegment, Math.round(this.segmentProgress),');
            expect(mutated).not.toBe(source);
            writeFileSync(file, mutated);
            // captureTree reads tools/autopilot.js beside js/
            cpSync(join(copy, 'autopilot.js'), join(copy, 'tools/autopilot.js'));
            const [mutant] = captureTree(copy, { points: 400, legIndexes: [0] });
            const [clean] = captureTree(root, { points: 400, legIndexes: [0] });
            expect(mutant.hashes.traffic.sha256).not.toBe(clean.hashes.traffic.sha256);
            expect(mutant.hashes.vehicle.sha256).toBe(clean.hashes.vehicle.sha256);
        } finally {
            rmSync(copy, { recursive: true, force: true });
        }
    });
});
