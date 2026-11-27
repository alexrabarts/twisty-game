/**
 * @jest-environment node
 */
// The Blender kits' surface layers (tools/blender/surface.py): each step switches on and off alone, the maths stay in
// their bands, and a step a vertex colour cannot carry is refused. The checks are Python, as the helper is
// (tools/blender/test_surface.py), and need no Blender; this runs them with the suite.
import { describe, test, expect } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

describe('surface layers', () => {
    test('the Python checks pass', () => {
        const run = spawnSync('python3', ['-m', 'unittest', 'tools/blender/test_surface.py'], { cwd: root, encoding: 'utf8' });
        if (run.error) throw new Error(`python3 did not run: ${run.error.message}`);
        expect(`${run.stderr}`).toMatch(/\nOK\s*$/);
        expect(run.status).toBe(0);
    });
});
