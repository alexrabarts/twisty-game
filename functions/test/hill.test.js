// functions/hill-courses.json: the short rides of their own (the hill ride, HillBoard in js/hill/board.js). Each row
// gives every part of the course its own least and most time; tests/unit/hill-board.test.js holds the row equal to
// the game's and rides the lane through these rules.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const boards = require('../lib/boards.js');
const { createHandlers } = require('../lib/handlers.js');
const { createMemoryDb } = require('./support/memory-db.js');

const ID = 'village-hill-v1';

class HttpsError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}

test('every hill row has a floor and a ceiling for each part, and a bumped id', () => {
    for (const [id, row] of Object.entries(boards.hills)) {
        assert.match(id, /-v\d+$/);
        assert.equal(row.kind, 'hill');
        assert.ok(Number.isInteger(row.gates) && row.gates > 0, id);
        for (const list of [row.metres, row.gateFloorsMs, row.gateCeilsMs]) assert.equal(list.length, row.gates + 1, id);
        row.gateFloorsMs.forEach((floor, i) => {
            assert.ok(floor > 0 && floor < row.gateCeilsMs[i], `${id} part ${i}`);
            // No part may be ridden faster than 40 m/s or must be ridden faster than 0.2 m/s
            assert.ok(row.metres[i] / floor * 1000 <= 40 && row.metres[i] / row.gateCeilsMs[i] * 1000 >= 0.2, `${id} part ${i}`);
        });
        assert.ok(row.penaltyMs > 0 && row.restartMs >= row.penaltyMs, id);
    }
});

test('a hill row makes a protocol 2 rule with its own store, apart from the legs\' table', () => {
    const rule = boards.ruleFor(ID, {});
    const row = boards.hills[ID];
    assert.equal(rule.protocol, 2);
    assert.equal(rule.gates, row.gates);
    assert.equal(rule.minTotalMs, row.gateFloorsMs.reduce((a, b) => a + b, 0));
    assert.equal(rule.ttlMs, 30 * 60 * 1000);
    assert.ok(boards.isTable(ID, {}));
    assert.equal(boards.storePath(ID, {}), `courseBoards/${ID}`);
    assert.equal(boards.ruleFor(ID, {}, {}), boards.LEGACY);
});

const sign = (token, data) => createHmac('sha256', token).update(data).digest('hex');

async function submit(times, finishTime, restarts = 0) {
    const handlers = createHandlers({ db: createMemoryDb(), now: () => 1_700_000_000_000, HttpsError, randomBytes: n => Buffer.alloc(n, 5) });
    const reply = await handlers.startRun({ legId: ID, deviceFingerprint: 'device' });
    assert.equal(reply.protocol, 2);
    assert.equal(reply.gates, boards.hills[ID].gates);
    let previous = '';
    const proofChain = times.map((time, i) => (previous = sign(reply.sessionToken, `${ID}:${i}:${time}:${previous}`)));
    const finishProof = sign(reply.sessionToken, `${ID}:F:${finishTime}:${restarts}:${previous}`);
    return handlers.submitRun({ sessionId: reply.sessionId, playerName: 'BOY', checkpointTimes: times, proofChain, finishTime, finishProof, restarts });
}

test('an honest ride is taken; a part faster than a bicycle, or slower than a crawl, is not', async () => {
    const row = boards.hills[ID];
    assert.equal((await submit([9000, 15000, 21000], 29000)).rank, 1);
    await assert.rejects(submit([9000, 9000 + row.gateFloorsMs[1] - 1, 21000], 29000), /Checkpoint 1 too fast/);
    await assert.rejects(submit([9000, 15000, 21000], 21000 + row.gateFloorsMs[3] - 1), /Finish too fast/);
    await assert.rejects(submit([9000, 15000, 21000], 21000 + row.gateCeilsMs[3] + 1), /Finish too slow/);
    // A restart allows each part restartMs more, and its penalty raises the floor of the whole
    assert.equal((await submit([9000, 15000, 21000], 21000 + row.gateCeilsMs[3] + 1, 1)).rank, 1);
    await assert.rejects(submit([9000, 15000, 21000], 29000, 5), /Finish too fast/);
});
