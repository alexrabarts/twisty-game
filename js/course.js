// Per-leg courses for the long legs. A leg with an entry in Course.LEGS is a
// converted leg: it has its own road, parts and gates, local segments 0 to
// segments - 1 (plus a 30-segment straight tail the builder adds). Every other
// leg is unconverted and cuts its range from the shared course in
// js/environment.js, byte for byte as before.
//
// A course entry: { id, segments, roadWidth, layout: [{ segments, turnRate }],
// elevation: { points: [[segment, y], ...], roll }, parts: [{ id, from, to,
// profile, floor, dressing, look, render, weather, timeOfDay, landmark: { at },
// setPieces: [{ type, at, length }], join: 'cut' | 'morph', blend }], gates,
// roadworks: [{ at, type }], traffic: { oncomingEvery }, preview, assets }.
// No THREE, no DOM, no Math.random.
const Course = (() => {
  const LEGS = {};

  // The course of a leg id, or null for a leg on the shared course
  function forLeg(id) {
    return Object.prototype.hasOwnProperty.call(LEGS, id) ? LEGS[id] : null;
  }

  // The server's view of each converted board: its id, gate count and length.
  // Computed on the call, never at load: TourSystem (js/tours.js) loads after
  // this file.
  function boardTable() {
    const table = {};
    for (const id of Object.keys(LEGS)) {
      table[TourSystem.boardId(id)] = { gates: LEGS[id].gates.length, segments: LEGS[id].segments };
    }
    return table;
  }

  return { LEGS, forLeg, boardTable };
})();

Terrain.adopt(Course.LEGS);
