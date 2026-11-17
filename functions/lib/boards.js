// Which board is which, and the rules each one runs under. No dependencies,
// so the rules run without Firebase.
//
// functions/courses.json is the server's copy of Course.boardTable()
// (js/course.js): one row per converted board id, { gates, segments }.
// tests/unit/board-contract.test.js fails when the copy and the game differ.
// A board id that is not in the table is a board on the shared course: five
// gates, today's limits, stored at leaderboards/<id>.
const courses = require('../courses.json');

const LEGACY = Object.freeze({
    protocol: 1,
    gates: 5,
    ttlMs: 15 * 60 * 1000,
    minTimeMs: 2000,
    maxTimeMs: 5 * 60 * 1000
});

// Metres of road in one segment of a converted leg
const SEGMENT_M = 20;

// The fastest bike tops out at 74.8 m/s (js/vehicle.js); 82.28 is 10% above
// that. Used only as a floor: no honest run can beat it.
const FLOOR_SPEED = 82.28;

const LONG = Object.freeze({
    protocol: 2,
    ttlMs: 45 * 60 * 1000,
    minGateMs: 6000,
    maxGateMs: 8 * 60 * 1000,
    maxTotalMs: 40 * 60 * 1000,
    penaltyMs: 5000,
    maxRestarts: 99
});

function isTable(boardId, table = courses) {
    return Object.prototype.hasOwnProperty.call(table, boardId);
}

// The rules of one board. An unknown id gets today's behaviour.
function ruleFor(boardId, table = courses) {
    if (!isTable(boardId, table)) return LEGACY;
    const row = table[boardId];
    return {
        ...LONG,
        gates: row.gates,
        segments: row.segments,
        minTotalMs: Math.ceil(row.segments * SEGMENT_M / FLOOR_SPEED * 1000)
    };
}

// Table boards have their own store, chosen here from the server table and
// never from a client field. An entry written under leaderboards/<id> by a
// server that did not know the row can thus never become part of the board.
function storePath(boardId, table = courses) {
    return `${isTable(boardId, table) ? 'courseBoards' : 'leaderboards'}/${boardId}`;
}

module.exports = { LEGACY, LONG, SEGMENT_M, FLOOR_SPEED, courses, isTable, ruleFor, storePath };
