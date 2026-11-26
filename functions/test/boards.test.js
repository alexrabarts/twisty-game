// Runs with `npm test` in functions/ and needs no install: node's own test
// runner, no Firebase and no jest. The handler rules are in
// tests/unit/functions-rules.test.js.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { LEGACY, LONG, FLOOR_SPEED, ruleFor, storePath, courses } = require('../lib/boards');

const TABLE = { 'mountain-dawn-v3': { gates: 14, segments: 700 } };

test('an id that is not in the table runs under today\'s rules', () => {
    assert.equal(ruleFor('valley-run-v2', TABLE), LEGACY);
    assert.equal(LEGACY.gates, 5);
    assert.equal(LEGACY.ttlMs, 900000);
    assert.equal(LEGACY.minTimeMs, 2000);
    assert.equal(LEGACY.maxTimeMs, 300000);
});

test('a table board takes its gate count and floor from its row', () => {
    const rule = ruleFor('mountain-dawn-v3', TABLE);
    assert.equal(rule.protocol, 2);
    assert.equal(rule.gates, 14);
    assert.equal(rule.minTotalMs, 170151); // 14000 m at 82.28 m/s
    assert.equal(rule.ttlMs, 2700000);
});

test('the floor speed leaves a margin over the fastest bike', () => {
    assert.ok(FLOOR_SPEED >= 1.1 * 74.8 - 1e-9);
    assert.ok(LONG.minGateMs * FLOOR_SPEED >= 493);
});

test('table boards are stored apart from the boards of the shared course', () => {
    assert.equal(storePath('mountain-dawn-v3', TABLE), 'courseBoards/mountain-dawn-v3');
    assert.equal(storePath('mountain-dawn-v2', TABLE), 'leaderboards/mountain-dawn-v2');
});

test('the shipped table has a whole gate count and a length for every row', () => {
    for (const [id, row] of Object.entries(courses)) {
        assert.ok(Number.isInteger(row.gates) && row.gates > 0, id);
        assert.ok(Number.isInteger(row.segments) && row.segments > 0, id);
    }
});
