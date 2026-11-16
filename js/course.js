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

  const smooth = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };

  // Leg 1, Mountain Dawn: from the plain into the mountains, dawn to golden
  // hour, the morning mist lifting as the road climbs. 700 segments (14 km),
  // six parts, a gate about every kilometre, the last 6 segments before the
  // finish line. Every bend is gentle (turn rate 0.05 or less), so each gate,
  // join and set piece stands on road the validator counts as straight; the
  // cliff and the ridge keep to 0.035 so their long rows clear half the radius.
  function mountainDawn() {
    const river = { kind: 'river', below: 3.0, side: 1, from: 35, to: 50 };
    const lake = Terrain.profiles.cliffLake.floor;
    // Broadleaf clumps on the run-off, none in the river band
    const runoff = (perSegment, coniferShare, closed) => ({
      coniferShare, snowy: false,
      layout: { perSegment, offset: 6, reach: 104, exclude: [{ sign: 1, from: 33, to: 52 }] },
      ...(closed && { closed })
    });
    return {
      id: 'mountain-dawn',
      segments: 700,
      roadWidth: 20,
      layout: [
        { segments: 30, turnRate: 0 }, { segments: 15, turnRate: 0.03 }, { segments: 15, turnRate: 0 },
        { segments: 12, turnRate: -0.035 }, { segments: 23, turnRate: 0 }, { segments: 13, turnRate: 0.03 },
        { segments: 17, turnRate: 0 },
        { segments: 15, turnRate: -0.04 }, { segments: 10, turnRate: 0 }, { segments: 12, turnRate: 0.045 },
        { segments: 33, turnRate: 0 }, { segments: 12, turnRate: -0.045 }, { segments: 13, turnRate: 0 },
        { segments: 12, turnRate: 0.04 }, { segments: 23, turnRate: 0 },
        { segments: 10, turnRate: -0.05 }, { segments: 10, turnRate: 0 }, { segments: 10, turnRate: 0.05 },
        { segments: 7, turnRate: 0 }, { segments: 10, turnRate: -0.05 }, { segments: 13, turnRate: 0 },
        { segments: 10, turnRate: 0.045 }, { segments: 10, turnRate: 0 }, { segments: 12, turnRate: -0.05 },
        { segments: 10, turnRate: 0 }, { segments: 10, turnRate: 0.05 }, { segments: 13, turnRate: 0 },
        { segments: 10, turnRate: -0.04 },
        { segments: 42, turnRate: 0 }, { segments: 10, turnRate: 0.04 }, { segments: 10, turnRate: 0 },
        { segments: 8, turnRate: -0.04 }, { segments: 15, turnRate: 0 },
        { segments: 20, turnRate: 0.025 }, { segments: 10, turnRate: 0 }, { segments: 20, turnRate: -0.03 },
        { segments: 10, turnRate: 0 }, { segments: 20, turnRate: 0.03 }, { segments: 10, turnRate: 0 },
        { segments: 20, turnRate: -0.03 }, { segments: 10, turnRate: 0 }, { segments: 15, turnRate: 0.025 },
        { segments: 15, turnRate: 0 },
        { segments: 15, turnRate: -0.03 }, { segments: 10, turnRate: 0 }, { segments: 15, turnRate: 0.035 },
        { segments: 15, turnRate: 0 }, { segments: 12, turnRate: -0.03 }
      ],
      // Road height in metres: level on the plain, a long climb as the valley
      // closes, the lake road up the cliff, a crest of 165 m on the pass
      elevation: { points: [[0, 12], [120, 14], [250, 22], [395, 75], [470, 85], [620, 150], [660, 165], [700, 150]], roll: 1 },
      gates: [50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600, 650, 698],
      roadworks: [{ at: 230, type: 'minor' }, { at: 565, type: 'major' }],
      traffic: { oncomingEvery: 100 },
      // Long straights: a slalom cone each 8 segments keeps the leg at 3 to 8 a kilometre
      cones: { straightEvery: 8 },
      // The menu shows the lake road with the twin peaks across the water
      preview: { segment: 540 },
      // The modelled bridge (tools/blender/bridge_stone.py). Night-ride's
      // modelled village is 149000 triangles and 5.9 MB, resident the whole
      // leg: over the window's 12 MB, so this village stays procedural.
      assets: { bridge: 'assets/bridge/stone.glb' },
      parts: [
        {
          id: 'meadow', from: 0, to: 120,
          profile: { id: 'meadow', floor: river, ...Terrain.valleyFloorSides(() => 0) },
          floor: river,
          look: { grassColor: 0x5b8c46, mountainColor: 0x6b5c42, fogDensity: 0.0016, heightFog: { density: 0.005, falloff: 0.09 }, shafts: 0.2, ring: 0.15 },
          render: { cullMax: 800 },
          timeOfDay: 'dawn', weather: 'clear', weatherIntensity: 0,
          dressing: { forest: runoff([1, 3], 0), rockfall: 0, backdrop: [] },
          landmark: { kind: 'farmstead', at: 64, lateral: -52 }
        },
        {
          id: 'wood', from: 120, to: 250, join: 'morph', blend: 20,
          profile: Terrain.forestProfile({ elevation: () => 0, amplitude: 3, reach: 130 }),
          look: { grassColor: 0x3e6b34, mountainColor: 0x5a4c3a, fogDensity: 0.0017, heightFog: { density: 0.003, falloff: 0.07 }, shafts: 0.55, ring: 0.3 },
          render: { cullMax: 600 },
          timeOfDay: 'dawn', weather: 'clear', weatherIntensity: 0,
          setPieces: [{ type: 'bridge', at: 60, length: 3 }],
          dressing: {
            // A wood close to the road: the trees stand from 4 m past the verge
            forest: { coniferShare: 0.3, snowy: false, layout: { perSegment: [5, 7], offset: 4, reach: 60, exclude: [] } },
            rockfall: 0, backdrop: []
          },
          landmark: { kind: 'setPiece', at: 181 },
          differs: ['T']
        },
        {
          id: 'valley', from: 250, to: 400, join: 'morph', blend: 20,
          // The valley closes in across the part: open at 270, closed by 380
          profile: { id: 'closingValley', floor: river, ...Terrain.valleyFloorSides((s) => smooth(270, 380, s)) },
          floor: river,
          look: { grassColor: 0x7a8f45, mountainColor: 0x7a6a4a, fogDensity: 0.0014, heightFog: { density: 0.003, falloff: 0.05 }, shafts: 0.35, ring: 0.6 },
          render: { cullMax: 800 },
          // Still dawn as the valley closes; golden hour from the village on
          timeOfDay: 'dawn', weather: 'clear', weatherIntensity: 0,
          dressing: { forest: runoff([1, 2], 0.1, { coniferShare: 0.85, perSegment: [3, 5] }), outcrops: { perSegment: 3 }, rockfall: 0, backdrop: [] },
          landmark: { kind: 'range', at: 385, lateral: 360, count: 4, height: 250 },
          differs: ['T', 'S']
        },
        {
          id: 'village', from: 400, to: 470, join: 'morph', blend: 20,
          profile: { id: 'closedValley', floor: river, ...Terrain.valleyFloorSides(() => 1) },
          floor: river,
          look: { grassColor: 0x6f8a48, mountainColor: 0x7a6a4a, fogDensity: 0.0011, heightFog: { density: 0.002, falloff: 0.05 }, shafts: 0.2, ring: 0.9 },
          render: { cullMax: 800 },
          timeOfDay: 'golden', weather: 'clear', weatherIntensity: 0,
          setPieces: [{ type: 'village', at: 18, length: 8 }],
          dressing: { forest: runoff([1, 2], 0.7), outcrops: { perSegment: 2, everywhere: true }, rockfall: 0, backdrop: [] },
          landmark: { kind: 'setPiece', at: 421 },
          differs: ['B']
        },
        {
          id: 'lake', from: 470, to: 620, join: 'cut',
          profile: { id: 'cliffLake', floor: lake, ...Terrain.cliffSides() },
          floor: lake,
          // No height fog: it would grow over the 300 m drop and hide the lake
          look: { grassColor: 0x4a7a44, mountainColor: 0x8b8b8b, fogDensity: 0.0008, heightFog: null, shafts: 0.6, ring: 1 },
          render: { cullMax: 800 },
          timeOfDay: 'golden', weather: 'clear', weatherIntensity: 0,
          // A thinner forest down the drop than the shared course's (5 to 8 a segment): a window's budget
          dressing: { forest: { coniferShare: 0.9, snowy: false, slope: [2, 4] }, rockfall: 0, backdrop: [] },
          landmark: { kind: 'twinPeaks', at: 545, side: 1, lateral: 470, height: 330 },
          differs: ['S', 'F']
        },
        {
          id: 'pass', from: 620, to: 700, join: 'cut',
          // Over the top on a snow ridge, the ground falling away both sides
          profile: { id: 'ridge', floor: lake, ...Terrain.ridgeSides() },
          floor: lake,
          look: { grassColor: 0xe6ebee, mountainColor: 0x9a9a9a, fogDensity: 0.0006, heightFog: null, shafts: 0.3, ring: 1 },
          render: { cullMax: 800 },
          timeOfDay: 'golden', weather: 'clear', weatherIntensity: 0,
          dressing: {
            forest: null,
            outcrops: { perSegment: 1, everywhere: true, snowy: true },
            pass: { poleLateral: 3.5, cairnEvery: 12, cairnLateral: 5, name: 'COL DE L\'AUBE' },
            rockfall: 0, backdrop: []
          },
          landmark: { kind: 'cairn', at: 662, side: -1 },
          // Snow peaks stand round the pass, either side of the ridge
          scenery: [{ kind: 'passPeaks' }],
          differs: ['T', 'G']
        }
      ]
    };
  }
  LEGS['mountain-dawn'] = mountainDawn();

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

  // Puts a converted leg back on the shared course (the rollback of a
  // conversion; the tests of the shared-course leg use it too)
  function release(id) {
    delete LEGS[id];
    return Terrain.release(id);
  }

  return { LEGS, forLeg, boardTable, release };
})();

Terrain.adopt(Course.LEGS);
