// functions/courses.json is the server's table of long boards. Every row must
// give the rules a usable gate count and length, and a board id outside the
// table must keep today's behaviour.
const test = require('node:test');
const assert = require('node:assert/strict');
const boards = require('../lib/boards.js');
const courses = require('../courses.json');

test('every row of the shipped table states positive gate and segment counts', () => {
    for (const [id, row] of Object.entries(courses)) {
        assert.match(id, /-v\d+$/, `${id} is a bumped board id`);
        assert.ok(Number.isInteger(row.gates) && row.gates > 0, `${id} gates`);
        assert.ok(Number.isInteger(row.segments) && row.segments > 0, `${id} segments`);
        assert.ok((row.segments * boards.SEGMENT_M) / row.gates >= boards.LONG.minGateMs / 1000, `${id}: a gate gap a rider cannot beat`);
    }
});

test('a row makes a protocol 2 rule with its own store and a time floor from its length', () => {
    const table = { 'mountain-dawn-v3': { gates: 14, segments: 700 } };
    const rule = boards.ruleFor('mountain-dawn-v3', table);
    assert.equal(rule.protocol, 2);
    assert.equal(rule.gates, 14);
    assert.equal(rule.minTotalMs, Math.ceil(700 * boards.SEGMENT_M / boards.FLOOR_SPEED * 1000));
    assert.equal(boards.storePath('mountain-dawn-v3', table), 'courseBoards/mountain-dawn-v3');
});

test('a board id outside the table is the legacy board in the legacy store', () => {
    assert.equal(boards.ruleFor('valley-run-v2', {}), boards.LEGACY);
    assert.equal(boards.storePath('valley-run-v2', {}), 'leaderboards/valley-run-v2');
});

test('an inherited property name is not a row', () => {
    assert.equal(boards.isTable('constructor', {}), false);
    assert.equal(boards.isTable('__proto__', {}), false);
});
