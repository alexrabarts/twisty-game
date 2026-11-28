/**
 * @jest-environment node
 */
// The end of every leg as one shot (js/world/endshot.js, StopScene): the owner, 2026-11-27, "at the end of the stage,
// i want the game to take over the riding and actually ride me in to the parking spot (hopefully with the others if
// they've kept up) and then position the camera for the great view all in one smooth, continuous camera shot".
//
// Each stage's real data is streamed round its line and its end stop, and the scene is run frame by frame at 60 Hz
// from the line, with five riders of the group kept up (15 to 75 m behind) and with the group far behind (500 m and
// more). It fails when the player's bike does not park in its bay facing its way, a rider of the group that kept up
// does not come in (or one far behind does), two bikes overlap, a bike rides through a wall, the camera moves more
// than MOVE_M or turns its look more than TURN_DEG in a frame, goes under the land or through a wall or a house, moves
// once held, or the card comes before the camera has held (tests/helpers/world-end-shot.mjs, its own node process:
// under jest's VM a streamed world takes many times as long).
import { describe, test, expect } from '@jest/globals';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { stagesFor } from '../helpers/world-stages.js';

const RUN = fileURLToPath(new URL('../helpers/world-end-shot.mjs', import.meta.url));
async function shot(id, group) {
    const { stdout } = await promisify(execFile)(process.execPath, [RUN, id, group], { maxBuffer: 1 << 26 });
    return JSON.parse(stdout);
}

describe('the end of every leg, one shot', () => {
    for (const id of stagesFor()) {
        for (const group of ['kept', 'far']) {
            test(`${id}, the group ${group === 'kept' ? 'kept up' : 'far behind'}`, async () => {
                const out = await shot(id, group);
                if (out.error) throw new Error(out.error);
                // (what the shot was, for the report: the bays, the view, its times)
                console.log(JSON.stringify({ stage: id, group, composed: out.composed, fallback: out.fallback, riders: out.riders, flyS: out.flyS, cardAt: out.cardAt, arcM: out.arcM, worst: out.worst, hold: out.hold }));
                expect(out.problems).toEqual([]);
                expect(out.composed).toBe(true);
            }, 600000);
        }
    }
});
