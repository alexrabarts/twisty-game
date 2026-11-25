// Which board is which, and the rules each one runs under. No dependencies,
// so the rules run without Firebase.
//
// functions/courses.json is the server's copy of Course.boardTable()
// (js/course.js): one row per converted board id, { gates, segments }.
// tests/unit/board-contract.test.js fails when the copy and the game differ.
// A board id that is not in the table is a board on the shared course: five
// gates, today's limits, stored at leaderboards/<id>.
//
// functions/hill-courses.json is the server's copy of HillBoard.row() (js/hill/board.js):
// the short rides of their own, each { kind: 'hill', gates, metres, gateFloorsMs,
// gateCeilsMs, restartMs, penaltyMs }. tests/unit/hill-board.test.js fails when the copy
// and the game differ. Each part of the course (the start to the first gate, gate to
// gate, the last gate to the finish) has its own least and most time.
const courses = require('../courses.json');
const hills = require('../hill-courses.json');

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

// A hill ride's session: the rider can sit on the end card a while before the name
const HILL = Object.freeze({
    protocol: 2,
    ttlMs: 30 * 60 * 1000,
    maxTotalMs: 15 * 60 * 1000,
    maxRestarts: 99
});

const has = (table, boardId) => Object.prototype.hasOwnProperty.call(table, boardId);

function isTable(boardId, table = courses, hillTable = hills) {
    return has(table, boardId) || has(hillTable, boardId);
}

// The rules of a hill ride's row: a floor and a ceiling for each part, and for the whole
function hillRule(row) {
    return {
        ...HILL,
        gates: row.gates,
        gateFloorsMs: row.gateFloorsMs,
        gateCeilsMs: row.gateCeilsMs,
        restartMs: row.restartMs,
        penaltyMs: row.penaltyMs,
        minTotalMs: row.gateFloorsMs.reduce((a, b) => a + b, 0)
    };
}

// The rules of one board. An unknown id gets today's behaviour.
function ruleFor(boardId, table = courses, hillTable = hills) {
    if (has(hillTable, boardId)) return hillRule(hillTable[boardId]);
    if (!has(table, boardId)) return LEGACY;
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
function storePath(boardId, table = courses, hillTable = hills) {
    return `${isTable(boardId, table, hillTable) ? 'courseBoards' : 'leaderboards'}/${boardId}`;
}

module.exports = { LEGACY, LONG, HILL, SEGMENT_M, FLOOR_SPEED, courses, hills, isTable, ruleFor, storePath };
