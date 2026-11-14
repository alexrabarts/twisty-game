// The terrain model: one pure description of the ground beside the road,
// read by the mesh builder (Environment.buildTerrainRibbon), by scenery
// placement (Environment.groundYAt) and by tests. No THREE, no DOM, no
// Math.random: every value is a function of its arguments.
//
// A profile has a left and a right Side. `d` is always the distance outward
// from the centre line on that side, so a side does not know which way it
// faces; the caller applies the sign.
const Terrain = (() => {
  // Grid of the rendered ribbon: ROWS vertical rows per column, COLUMNS_PER_SEGMENT
  // columns between two road points, SEGMENT_LENGTH metres between road points
  const ROWS = 35;
  const COLUMNS_PER_SEGMENT = 4;
  const SEGMENT_LENGTH = 20;
  // Road surface plus a 2m ledge on each side before the face starts
  const LEDGE = 2;

  // Layered, quantised sine displacement of a ribbon vertex. A pure function
  // of the grid position so the physics walk can reproduce the mesh.
  function cliffDisplacement(idx, j, verticalProgress) {
    // Reduce displacement at base to prevent gaps
    const heightFactor = Math.min(verticalProgress * 2, 1);

    // Large rock formations
    const primary =
      (Math.sin(idx * 0.12 + j * 0.18) * Math.cos(j * 0.08) +
        Math.sin(idx * 0.08 - j * 0.15) * 0.7) *
      8.0 *
      heightFactor;
    // Medium rock faces
    const secondary =
      (Math.sin(idx * 0.35 + j * 0.45) * Math.cos(idx * 0.25) +
        Math.cos(idx * 0.5 - j * 0.3) * 0.8) *
      4.0 *
      heightFactor;
    // Small surface details
    const tertiary =
      (Math.sin(idx * 1.2 + j * 1.5) * 0.6 +
        Math.cos(idx * 1.8 - j * 2.0) * 0.4) *
      1.5 *
      heightFactor;
    const micro = Math.sin(idx * 3.5 + j * 4.0) * 0.5 * heightFactor;

    // Quantise into facets for an angular, chiselled look
    const facetSize = 0.7 + Math.sin(idx * 0.3) * 0.3;
    return Math.floor((primary + secondary + tertiary + micro) / facetSize) * facetSize;
  }

  function cliffDisplacementScale(verticalProgress, isDropOff) {
    if (verticalProgress === 0) return 0.15;
    return isDropOff ? 0.45 : 0.7;
  }

  // Valley side: a flat ledge, then a face dropping at a constant slope to a
  // floor, with the displacement above pushed around the slope. The ribbon
  // runs `margin` below the floor so it ends under the water.
  function cliffDropSide({ floorY, faceHeight, rockSpread, slope = 1.33, margin = 6, lipDepth }) {
    const depth = margin - floorY;
    return {
      flat: LEDGE,
      // How far a bike must drop to count as over the lip: a low cliff has a short lip
      ...(lipDepth !== undefined && { lipDepth }),
      // Distance past the road edge where each band ends; the last band runs
      // outward without limit. A fall starts where the ledge ends.
      bands: [{ to: LEDGE, kind: 'shoulder' }, { kind: 'fall' }],
      face: { kind: 'drop', height: faceHeight, rockSpread },
      // Vertical units lost per lateral unit past the ledge, floored at the lake
      base: (dPast, roadY) => Math.max(roadY - dPast * slope, floorY),
      row(j, ctx, out) {
        const verticalProgress = j / ROWS;
        const drop = ctx.roadY + depth;
        const currentHeight = -drop * verticalProgress;
        const baseDistance = ctx.halfRoad + LEDGE + (drop * verticalProgress) / slope;
        const displacement = cliffDisplacement(ctx.column, j, verticalProgress);
        const displacementScale = cliffDisplacementScale(verticalProgress, true);
        // Minimum distance prevents gaps at the road edge
        out.d = Math.max(baseDistance + displacement * displacementScale, ctx.halfRoad + 1.4);
        out.y = ctx.roadY + currentHeight;
        out.rise = currentHeight;
        out.displacement = displacement;
        return out;
      }
    };
  }

  // Mountain side: a wall rising `height` times a slowly varying multiplier,
  // with a lip at its foot and a quadratic overhang above.
  // `variation` scales how far the wall's height swings along the road (1 is
  // today's cliff; a canyon keeps its walls close to one height); `snow: false`
  // keeps the patches of snow off a wet wall.
  function cliffWallSide({ height, rockSpread, slope = 1.6, variation, snow }) {
    const swing = variation ?? 1;
    return {
      flat: LEDGE,
      // The rock face starts 1m past the road edge, inside the 2m ledge
      bands: [{ to: 1, kind: 'shoulder' }, { kind: 'wall' }],
      face: {
        kind: 'rise', height, rockSpread,
        ...(variation !== undefined && { variation }),
        ...(snow === false && { snow })
      },
      base: (dPast, roadY) => Math.min(roadY + dPast * slope, roadY + height),
      row(j, ctx, out) {
        const verticalProgress = j / ROWS;
        // Variable height along the wall: sine waves give ups and downs, with
        // no per-vertex random term (it turned the skyline into a saw blade)
        const lengthProgress = ctx.index / ctx.pathLength;
        const heightMultiplier =
          1.0 +
          Math.sin(lengthProgress * Math.PI * 8) * 0.5 * swing + // 8 major peaks and valleys
          Math.sin(lengthProgress * Math.PI * 15) * 0.25 * swing + // 15 medium variations
          Math.sin(lengthProgress * Math.PI * 27) * 0.15 * swing; // 27 small details
        const currentHeight = height * heightMultiplier * verticalProgress;

        // Start just outside the road edge
        let baseDistance = ctx.halfRoad + 1;
        if (verticalProgress < 0.1) {
          // Lip extends outward at the base
          const lipExtension = (0.1 - verticalProgress) * 20;
          baseDistance = ctx.halfRoad + 1 - lipExtension;
        }
        // Then dramatic overhang as it goes up
        baseDistance += verticalProgress * verticalProgress * 25;

        const displacement = cliffDisplacement(ctx.column, j, verticalProgress);
        const displacementScale = cliffDisplacementScale(verticalProgress, false);
        out.d = Math.max(baseDistance + displacement * displacementScale, ctx.halfRoad + 1.4);
        out.y = ctx.roadY + currentHeight;
        out.rise = currentHeight;
        out.displacement = displacement;
        return out;
      }
    };
  }

  // Loose ground beside the road: a height profile (`stations`, pairs of
  // [distance past the road edge, height relative to the road]) joined
  // linearly, plus an optional rolling undulation along the road that fades
  // in over `ramp` metres. The ribbon rows sit on the stations, so the drawn
  // ground and the `base` model the physics reads agree to rounding.
  function heightfieldSide({ stations, bands, runoff, undulation = null, shade = 1, tint, fallDepth, lipDepth }) {
    const last = bands[bands.length - 1];
    if (last.to !== undefined || (last.kind !== 'wall' && last.kind !== 'fall')) {
      throw new Error('A side must end in an unbounded wall or fall band so its rideable limit is finite');
    }
    const rowDistances = spreadRows(stations.map(([d]) => d));
    const offsetAt = (dPast) => {
      if (dPast <= stations[0][0]) return stations[0][1];
      for (let n = 1; n < stations.length; n++) {
        const [d1, y1] = stations[n];
        if (dPast <= d1) {
          const [d0, y0] = stations[n - 1];
          return y0 + ((y1 - y0) * (dPast - d0)) / (d1 - d0);
        }
      }
      return stations[stations.length - 1][1];
    };
    // `s` is the position along the road in segments, continuous
    const rolling = (dPast, s) =>
      undulation
        ? undulation.amplitude *
          Math.sin((2 * Math.PI * s) / undulation.wavelength + undulation.phase) *
          Math.min(1, dPast / undulation.ramp)
        : 0;
    return {
      flat: 0,
      bands,
      face: null,
      runoff,
      shade,
      // Ground colour where it is not the leg's grass (sand, snow)
      ...(tint !== undefined && { tint }),
      // Where a fall off this side ends when the floor is no water: this far below the road
      ...(fallDepth !== undefined && { fallDepth }),
      ...(lipDepth !== undefined && { lipDepth }),
      stations,
      undulation,
      // The nearest road point's height is a step function of position;
      // this side asks for the height interpolated along the segment
      interpolatesRoad: true,
      base: (dPast, roadY, s) => roadY + offsetAt(dPast) + rolling(dPast, s),
      row(j, ctx, out) {
        const dPast = rowDistances[j];
        out.d = ctx.halfRoad + dPast;
        out.y = ctx.roadY + offsetAt(dPast) + rolling(dPast, ctx.s);
        out.rise = out.y - ctx.roadY;
        out.displacement = 0;
        return out;
      }
    };
  }

  // ROWS + 1 distances that include every given one, by splitting the widest
  // gap until there are enough
  function spreadRows(given) {
    const distances = [...new Set(given)].sort((a, b) => a - b);
    if (distances.length > ROWS + 1) throw new Error(`A heightfield side has at most ${ROWS + 1} stations`);
    while (distances.length < ROWS + 1) {
      let widest = 1;
      for (let n = 2; n < distances.length; n++) {
        if (distances[n] - distances[n - 1] > distances[widest] - distances[widest - 1]) widest = n;
      }
      distances.splice(widest, 0, (distances[widest - 1] + distances[widest]) / 2);
    }
    return distances;
  }

  const LAKE_Y = -200;

  const cliffLake = {
    id: 'cliffLake',
    // restY is where a fall ends: just above the drawn lake plane
    floor: { kind: 'lake', y: LAKE_Y, restY: LAKE_Y + 5 },
    // Road y for global segment i: gentle rolling terrain
    elevation: (i) => Math.sin(i * 0.04) * 8 + Math.cos(i * 0.025) * 6 + 25,
    left: cliffWallSide({ height: 40, rockSpread: 20 }),
    right: cliffDropSide({ floorY: LAKE_Y, faceHeight: LAKE_Y, rockSpread: 25 })
  };

  const RUNOFF = { drag: 0.35, grip: 0.5, floorSpeed: 6 };
  const RUNOFF_BANDS = (to) => [{ to, kind: 'runoff' }, { kind: 'wall' }];

  // Open meadow: gentle slope away from the road for 35 m, then a low bank on
  // the left and a river on the right, then the valley sides rising out of
  // sight. Road height is rolling and descends over the leg.
  const valleyFloor = {
    id: 'valleyFloor',
    // The river is a ribbon 3 m below the road, lateral 35 to 50 on the right
    floor: { kind: 'river', below: 3.0, side: 1, from: 35, to: 50 },
    elevation: (i, start, end) => {
      const k = i - start;
      const t = Math.min(1, Math.max(0, k / (end - start)));
      return 30 - 12 * t + Math.sin(k * 0.11) * 2.2;
    },
    left: heightfieldSide({
      stations: [[0, 0], [35, -2.1], [41, 2.0], [100, 4.0], [180, 38]],
      bands: RUNOFF_BANDS(35),
      runoff: RUNOFF
    }),
    right: heightfieldSide({
      // Bank into the river bed (below the water plane from 37.5 to 48), then up and away
      stations: [[0, 0], [25, -1.5], [28, -3.1], [30, -4.0], [36, -4.0], [38, -3.1], [40, -2.0], [60, -1.0], [100, 0], [180, 36]],
      bands: RUNOFF_BANDS(35),
      runoff: RUNOFF
    })
  };

  // Rolling forest floor, dark, undulating a few metres either side of the road.
  // `reach` is how far out the ground climbs to its last station: a leg with
  // tighter bends needs a narrower ribbon (see the radius rule in outermost).
  function forestProfile({ elevation, amplitude, reach = 165, spans }) {
    const side = () =>
      heightfieldSide({
        stations: [[0, 0], [15, -0.6], [25, -1.0], [31, 3.0], [reach - 75, 5.0], [reach, 40]],
        bands: RUNOFF_BANDS(25),
        runoff: RUNOFF,
        undulation: { amplitude, wavelength: 14, phase: 0.8, ramp: 15 },
        shade: 0.5
      });
    return { id: 'forest', floor: { kind: 'none' }, elevation, left: side(), right: side(), ...(spans && { spans }) };
  }
  const forest = forestProfile({
    elevation: (i, start, end) => {
      const k = i - start;
      const t = Math.min(1, Math.max(0, k / (end - start)));
      return 34 - 14 * t + Math.sin(k * 0.09) * 3;
    },
    amplitude: 3
  });

  // The night leg's forest: a climb with less roll, and two set pieces cut into
  // it. Segments are global, and `to` is exclusive, so the tunnel is segments
  // 514 to 521 and the village 583 to 590 (both on straights, clear of every
  // checkpoint and every roadworks zone).
  const TUNNEL = { from: 514, to: 522, ceiling: 7.5 };
  const VILLAGE = { from: 583, to: 591 };

  // Hill over the road: wall at the lining (1 m past the edge), the ground
  // climbing to the roof's crest 2.5 m out, then on up as a hill
  const hillSide = () =>
    heightfieldSide({
      stations: [[0, 0], [1, 0], [2.5, 9], [8, 11], [40, 14], [135, 40]],
      bands: [{ to: 1, kind: 'shoulder' }, { kind: 'wall' }],
      shade: 0.5
    });

  // Pavement, level with the road and as slow to ride as the run-off beside
  // it, then the house fronts and garden walls (a wall that crashes)
  const streetSide = () =>
    heightfieldSide({
      stations: [[0, 0], [3, 0], [3.3, 7], [12, 8], [60, 12], [135, 40]],
      bands: [{ to: 3, kind: 'runoff' }, { kind: 'wall' }],
      runoff: RUNOFF,
      tint: 0x5c5851
    });

  const forestNight = forestProfile({
    elevation: (i, start, end) => {
      const k = i - start;
      const t = Math.min(1, Math.max(0, k / (end - start)));
      return 26 + 12 * t + Math.sin(k * 0.07) * 2;
    },
    amplitude: 2,
    // The tightest bend of this leg is 307.7 m: no row may reach past half of it
    reach: 135,
    spans: [
      { type: 'tunnel', ...TUNNEL, left: hillSide(), right: hillSide() },
      { type: 'village', ...VILLAGE, left: streetSide(), right: streetSide() }
    ]
  });

  // A gorge: rock walls 45 to 70 m high close to the road on both sides, with
  // a river far below that only the bridge shows. The walls are the cliff
  // face of the mountain legs; the bridge replaces them with a parapet and a
  // sheer drop to the river bed for its length.
  const BRIDGE = { from: 285, to: 293 };
  const gorgeWall = () => cliffWallSide({ height: 57, rockSpread: 20, variation: 0.2, snow: false });
  const gorgeSide = () =>
    heightfieldSide({
      // Parapet at 0.8 m, then down past the river (60 m below the road) to its bed and back up the far wall
      stations: [[0, 0], [0.8, 0], [1.6, -10], [3, -26], [5, -44], [10, -62], [40, -64], [80, -40], [115, 32]],
      bands: [{ to: 0.8, kind: 'shoulder' }, { kind: 'wall' }],
      tint: 0x6e6860
    });
  const canyon = {
    id: 'canyon',
    // The river runs under the road, 60 m down
    floor: { kind: 'river', below: 60, side: 1, from: -25, to: 25 },
    elevation: (i, start, end) => {
      const k = i - start;
      const t = Math.min(1, Math.max(0, k / (end - start)));
      return 30 - 6 * t + Math.sin(k * 0.07) * 2.5;
    },
    left: gorgeWall(),
    right: gorgeWall(),
    spans: [{ type: 'bridge', ...BRIDGE, left: gorgeSide(), right: gorgeSide() }]
  };

  // The sea road: a hill on the land side (left) and a drop to the sea on the
  // right that ends in a beach. The road descends from high above the water to
  // a few metres over it, so the right side changes along the leg: a sea cliff
  // while the drop is tall, then (from BEACH_FROM) loose sand a bike can ride on.
  const SEA_Y = 0;
  const BEACH_FROM = 216;
  const beach = heightfieldSide({
    // Sand sloping gently away from the road, then the shore falling into the sea
    stations: [[0, 0], [8, -0.8], [16, -2.0], [20, -2.8], [24, -4.5], [34, -10], [60, -26], [100, -46], [150, -70]],
    bands: [{ to: 20, kind: 'runoff' }, { kind: 'fall' }],
    runoff: RUNOFF,
    tint: 0xd2bf8a,
    lipDepth: 2
  });
  const coast = {
    id: 'coast',
    // Absolute sea level; a fall ends just above it
    floor: { kind: 'sea', y: SEA_Y, restY: SEA_Y + 0.5 },
    // 58 at the start, easing down to 6 at the end of the leg (global segment i)
    elevation: (i, start, end) => {
      const t = Math.min(1, Math.max(0, (i - start) / (end - start)));
      return 6 + 52 * Math.pow(1 - t, 1.7);
    },
    left: cliffWallSide({ height: 40, rockSpread: 20 }),
    right: cliffDropSide({ floorY: SEA_Y, faceHeight: -60, rockSpread: 25, lipDepth: 2 }),
    spans: [{ from: BEACH_FROM, right: beach }]
  };

  // An exposed ridge: a snowfield 6 m wide each side of the road, then a drop
  // of 40 m onto a shelf, with a frozen lake far below. The shelf, not the
  // lake, is where a bike that goes over comes to rest.
  const ridgeSide = () =>
    heightfieldSide({
      stations: [[0, 0], [6, -0.4], [8, -4], [14, -22], [22, -40], [80, -40]],
      bands: [{ to: 6, kind: 'runoff' }, { kind: 'fall' }],
      runoff: RUNOFF,
      tint: 0xdfe8f0,
      fallDepth: 40
    });
  const ridge = {
    id: 'ridge',
    floor: { kind: 'ice', y: LAKE_Y },
    // Climbs gently from 14 to 28 with a slow roll
    elevation: (i, start, end) => {
      const k = i - start;
      const t = Math.min(1, Math.max(0, k / (end - start)));
      return 14 + 14 * t + Math.sin(k * 0.07) * 2.5;
    },
    left: ridgeSide(),
    right: ridgeSide()
  };

  const profiles = { cliffLake, valleyFloor, forest, forestNight, coast, canyon, ridge };

  // The per-leg table: the only source of per-leg world values. `profile` is
  // the shape of the ground beside the road; `floor` is defined once, on the
  // profile, and shared here; `look` keeps the key names applyLandscapeConfig
  // reads; `dressing` holds what the world build scatters. Order is leg order.
  const BACKDROP = ['distant', 'mid', 'near', 'majestic', 'endCourse'];
  const LEGS = [
    { id: 'mountain-dawn', profile: cliffLake, trackVersion: 1, roadWidth: 20,
      look: { grassColor: 0x4a7c4a, mountainColor: 0x6b5c42, fogDensity: 0.0015 },
      dressing: { forest: { coniferShare: 0.75, snowy: false }, rockfall: 0, backdrop: BACKDROP } },
    // Changed legs carry trackVersion 2: a new road height is a new course, so a
    // new leaderboard and best-time key (TourSystem.boardId)
    { id: 'valley-run', profile: valleyFloor, trackVersion: 2, roadWidth: 20,
      look: { grassColor: 0x5a9c5a, mountainColor: 0x7a6c52, fogDensity: 0.0008 },
      // Sparse broadleaf clumps both sides, none in the river; no fixed peaks
      dressing: {
        forest: {
          coniferShare: 0, snowy: false,
          layout: { perSegment: [1, 3], offset: 6, reach: 104, exclude: [{ sign: 1, from: 33, to: 52 }] }
        },
        rockfall: 0, backdrop: []
      },
      // Where the menu preview camera stands: metres out from the mid-leg point, and above it
      preview: { radius: 30, height: 9 } },
    { id: 'coastal-descent', profile: coast, trackVersion: 2, roadWidth: 20,
      look: { grassColor: 0x6aac6a, mountainColor: 0x5a4c32, fogDensity: 0.001 },
      // The default forest is kept: it only stands where the cliff face is 15 m above the sea
      dressing: { forest: { coniferShare: 0.3, snowy: false }, rockfall: 0, backdrop: [] } },
    // The gorge has no trees (rock to the road edge), and its two walls shed rocks
    { id: 'foggy-gorge', profile: canyon, trackVersion: 2, roadWidth: 20,
      look: { grassColor: 0x5a9c5a, mountainColor: 0x7a6c52, fogDensity: 0.0008 },
      dressing: { forest: null, rockfall: 0.5, backdrop: [] },
      // Between the walls: a camera 30 m out on the right would be inside the rock
      preview: { radius: 3, height: 8 } },
    { id: 'high-pass', profile: cliffLake, trackVersion: 1, roadWidth: 16,
      look: { grassColor: 0x3a6c3a, mountainColor: 0x8b8b8b, fogDensity: 0.002 },
      dressing: { forest: { coniferShare: 0.9, snowy: false }, rockfall: 0.25, backdrop: BACKDROP } },
    { id: 'storm-valley', profile: forest, trackVersion: 2, roadWidth: 16,
      look: { grassColor: 0x5a9c5a, mountainColor: 0x7a6c52, fogDensity: 0.0008 },
      // Dense trees both sides, none beyond 90 m; no walls, so no rockfalls
      dressing: {
        forest: { coniferShare: 0.5, snowy: false, layout: { perSegment: [4, 6], offset: 5, reach: 77, exclude: [] } },
        rockfall: 0, backdrop: []
      },
      // The trees stand 13 m out: the camera sits in the gap above the road edge
      preview: { radius: 8, height: 5 } },
    { id: 'night-ride', profile: forestNight, trackVersion: 2, roadWidth: 16,
      look: { grassColor: 0x4a8c4a, mountainColor: 0x6a5c42, fogDensity: 0.0012 },
      // As the storm leg's forest, a little thinner; no walls, so no rockfalls
      dressing: {
        forest: { coniferShare: 0.6, snowy: false, layout: { perSegment: [3, 5], offset: 5, reach: 77, exclude: [] } },
        rockfall: 0, backdrop: []
      },
      preview: { radius: 8, height: 5 } },
    { id: 'winter-pass', profile: ridge, trackVersion: 2, roadWidth: 16,
      look: { grassColor: 0x3a6c3a, mountainColor: 0x8b8b8b, fogDensity: 0.002 },
      // Snowy conifers on the slopes below the snowfield only (none within 12 m of the road edge); no walls, so no rockfalls
      dressing: {
        forest: { coniferShare: 1.0, snowy: true, layout: { perSegment: [1, 2], offset: 12, reach: 60, exclude: [] } },
        rockfall: 0, backdrop: []
      },
      // The snowfield is 6 m wide: the roadworks plant stands on it, past the road edge by these amounts
      plant: { bulldozer: 4.5, barrier: 2.5, truck: 3 } }
  ];
  LEGS.forEach((leg) => {
    leg.floor = leg.profile.floor;
  });
  const LEG_PROFILES = LEGS.map((leg) => leg.profile);

  // The table entry for a leg index or a leg id. A missing or out-of-range
  // index falls back to the first leg; an unknown string id throws, so a
  // mistyped id can never resolve to another leg's settings.
  function legConfig(key) {
    if (typeof key === 'string') {
      const found = LEGS.find((leg) => leg.id === key);
      if (!found) throw new Error(`Unknown leg id: ${key}`);
      return found;
    }
    return LEGS[key] || LEGS[0];
  }

  function forLeg(legIndex) {
    return legConfig(legIndex).profile;
  }

  // Road y for global segment `i`; the active leg's function applies to the whole path
  function elevation(profile, i, startSegment, endSegment) {
    return profile.elevation(i, startSegment, endSegment);
  }

  // One cross-section vertex (d, y) of a side at row j. ctx: halfRoad, roadY,
  // column (grid column index), index (global segment), pathLength.
  function row(side, j, ctx, out) {
    return side.row(j, ctx, out);
  }

  // Every side a profile has on one side of the road: the plain side first,
  // then each span's replacement. Callers that ask "does any of it ...".
  function sidesOf(profile, sign) {
    const key = sign < 0 ? 'left' : 'right';
    return [profile[key], ...(profile.spans || []).map((span) => span[key]).filter(Boolean)];
  }

  // The side in force at a segment: a span replaces the profile's own side
  // from `from` (inclusive) to `to` (exclusive, open when absent). Segment
  // indices are global, the same as ctx.index and loc.index.
  function sideAt(profile, sign, segIndex) {
    const key = sign < 0 ? 'left' : 'right';
    for (const span of profile.spans || []) {
      if (span[key] && segIndex >= span.from && (span.to === undefined || segIndex < span.to)) return span[key];
    }
    return profile[key];
  }

  // The roof of the span in force at a segment (a tunnel), as metres above
  // the road, or undefined in the open. Segment indices are global.
  function ceilingAt(profile, segIndex) {
    for (const span of profile.spans || []) {
      if (span.ceiling !== undefined && segIndex >= span.from && segIndex < span.to) return span.ceiling;
    }
    return undefined;
  }

  // The set pieces a profile builds: its typed spans, as inclusive segment
  // ranges. Forest, rockfalls and debris keep out of them.
  function setPieces(profile) {
    return (profile.spans || []).filter((span) => span.type).map(({ type, from, to }) => ({ type, from, to: to - 1 }));
  }

  // The same vertex as row(), for the side of a profile as it is DRAWN: the
  // side in force changes at a span edge, and the rows blend over one segment
  // (four columns) at each edge, so the ribbon has no step there. ctx.s is the position along the road in segments.
  const blendFrom = {};
  const blendTo = {};
  function rowAt(profile, sign, j, ctx, out) {
    const key = sign < 0 ? 'left' : 'right';
    const base = profile[key];
    const s = ctx.s ?? ctx.index;
    for (const span of profile.spans || []) {
      const inner = span[key];
      if (!inner) continue;
      // The edges are centred on the physics' boundary between two segments
      // (half a segment before `from`, half a segment before `to`)
      let weight;
      if (s < span.from) weight = s - (span.from - 1);
      else if (span.to === undefined || s <= span.to - 1) weight = 1;
      else weight = span.to - s;
      if (weight <= 0) continue;
      if (weight >= 1) return inner.row(j, ctx, out);
      base.row(j, ctx, blendFrom);
      inner.row(j, ctx, blendTo);
      for (const field of ['d', 'y', 'rise', 'displacement']) {
        out[field] = blendFrom[field] + (blendTo[field] - blendFrom[field]) * weight;
      }
      return out;
    }
    return base.row(j, ctx, out);
  }

  // The first and last segment in [from, to] whose side on `sign` carries a
  // rock face to dress, or null when none does
  function faceRange(profile, sign, from, to) {
    let first = -1;
    let last = -1;
    for (let i = from; i <= to; i++) {
      if (!sideAt(profile, sign, i).face) continue;
      if (first < 0) first = i;
      last = i;
    }
    return first < 0 ? null : { from: first, to: last };
  }

  // Nearest centre-line point in [from, to] to (x, z). Fills out with
  // index, roadY, lateral (positive right) and along (positive forward).
  function locate(path, x, z, from, to, out) {
    let closest = null;
    let closestIndex = 0;
    let closestDistSq = Infinity;
    for (let i = from; i <= to; i++) {
      const point = path[i];
      const dx = x - point.x;
      const dz = z - point.z;
      const distSq = dx * dx + dz * dz;
      if (distSq < closestDistSq) {
        closestDistSq = distSq;
        closest = point;
        closestIndex = i;
      }
    }

    out.index = closestIndex;
    out.roadY = closest.y || 0;
    const perpX = Math.cos(closest.heading);
    const perpZ = -Math.sin(closest.heading);
    out.lateral = (x - closest.x) * perpX + (z - closest.z) * perpZ;
    out.along = (x - closest.x) * Math.sin(closest.heading) + (z - closest.z) * Math.cos(closest.heading);
    return out;
  }

  // Height of the rendered face at distance d from the centre line. Walks the
  // same vertex column the ribbon builder generated. Returns null outside the
  // built range (callers fall back to the plain slope model).
  function surfaceY(profile, sign, side, geo, loc, d) {
    const startIdx = Math.max(0, geo.startSegment);
    const endIdx = Math.min(geo.path.length - 1, geo.endSegment + 20);
    const segmentIndex = loc.index;
    if (segmentIndex < startIdx || segmentIndex > endIdx) return null;

    const column = Math.round((segmentIndex - startIdx + loc.along / SEGMENT_LENGTH) * COLUMNS_PER_SEGMENT);
    if (column < 0) return null;

    const halfRoad = geo.roadWidth / 2;
    const point = geo.path[segmentIndex];
    const neighbour = geo.path[Math.min(geo.path.length - 1, Math.max(0, segmentIndex + (loc.along >= 0 ? 1 : -1)))];
    const roadY = point.y + (neighbour.y - point.y) * Math.min(1, Math.abs(loc.along) / SEGMENT_LENGTH);
    const ctx = {
      halfRoad, roadY, column, index: segmentIndex, pathLength: geo.path.length,
      s: startIdx + column / COLUMNS_PER_SEGMENT
    };
    const out = {};

    // Row 0 of the mesh sits at the end of the ledge
    let previousDistance = halfRoad + side.flat;
    let previousY = roadY;
    // A wall leans out over the road as it rises, so its rows can fold back: more
    // than one row segment then spans the same distance. What a rock or a ray
    // meets from above is the highest of them.
    const folds = side.face && side.face.kind === 'rise';
    let highest = null;
    for (let j = 1; j <= ROWS; j++) {
      rowAt(profile, sign, j, ctx, out);
      if (folds) {
        const low = Math.min(previousDistance, out.d);
        if (d >= low && d <= Math.max(previousDistance, out.d)) {
          const span = out.d - previousDistance;
          const y = Math.abs(span) > 0.001 ? previousY + ((out.y - previousY) * (d - previousDistance)) / span : out.y;
          if (highest === null || y > highest) highest = y;
        }
      } else if (d <= out.d) {
        const span = out.d - previousDistance;
        const t = span > 0.001 ? (d - previousDistance) / span : 1;
        return previousY + (out.y - previousY) * Math.max(0, Math.min(1, t));
      }
      previousDistance = out.d;
      previousY = out.y;
    }
    return highest ?? previousY;
  }

  // The road height at the located point, interpolated along its segment the
  // way the ribbon rows are, instead of the nearest centre-line point's own
  function interpolatedRoadY(geo, loc) {
    const point = geo.path[loc.index];
    const neighbour = geo.path[Math.min(geo.path.length - 1, Math.max(0, loc.index + (loc.along >= 0 ? 1 : -1)))];
    return point.y + (neighbour.y - point.y) * Math.min(1, Math.abs(loc.along) / SEGMENT_LENGTH);
  }

  // Height of the water at a road height, or null where the profile has none.
  // A river keeps to a fixed depth below the road; a lake or sea is absolute.
  function waterLevel(profile, roadY) {
    const { floor } = profile;
    if (floor.y !== undefined) return floor.y;
    if (floor.below !== undefined) return roadY - floor.below;
    return null;
  }

  // Ground height at a located point. `exact` walks the drawn face on a side
  // that has one (a rock face); ground with no face, and a caller that does not
  // ask, get the smooth `side.base` model.
  function heightAt(profile, geo, loc, exact) {
    const roadY = loc.roadY;
    const right = loc.lateral > 0;
    const sign = right ? 1 : -1;
    const side = sideAt(profile, sign, loc.index);
    const d = right ? loc.lateral : -loc.lateral;
    const ledgeEnd = geo.roadWidth / 2 + side.flat;

    if (d > ledgeEnd) {
      if (exact && side.face) {
        const walked = surfaceY(profile, sign, side, geo, loc, d);
        // A floor with no fixed height (a river under the road) is not a limit
        if (walked !== null) return profile.floor.y === undefined ? walked : Math.max(walked, profile.floor.y);
      }
      if (side.interpolatesRoad) {
        return side.base(d - ledgeEnd, interpolatedRoadY(geo, loc), loc.index + loc.along / SEGMENT_LENGTH);
      }
      return side.base(d - ledgeEnd, roadY);
    }
    // On the road or its ledges
    return roadY;
  }

  // `loc` receives the located point (index, roadY, lateral, along) so a
  // caller that also needs the side or road height does not search twice
  function groundY(profile, geo, x, z, from, to, exact, loc = {}) {
    if (!geo.path || geo.path.length === 0) return waterLevel(profile, 0) ?? 0;
    return heightAt(profile, geo, locate(geo.path, x, z, from, to, loc), exact);
  }

  // What the ground is at a signed lateral (positive right): the road, or the
  // band of the side that lateral falls in. `start` is where that zone begins,
  // as a distance from the centre line.
  function zoneAt(profile, segIndex, lateral, halfRoad) {
    const sign = lateral < 0 ? -1 : 1;
    const side = sideAt(profile, sign, segIndex);
    const reach = Math.abs(lateral);
    if (reach <= halfRoad) return { kind: 'road', side, sign, start: 0 };

    let start = halfRoad;
    for (const band of side.bands) {
      if (band.to === undefined || reach <= halfRoad + band.to) {
        return { kind: band.kind, side, sign, start };
      }
      start = halfRoad + band.to;
    }
    throw new Error(`Side of ${profile.id} has no outermost band`);
  }

  // The largest lateral, from the centre line, a bike can occupy on that side
  // without crashing or falling: the outer edge of the last shoulder or run-off
  // band. Always finite, because a side must end in a wall or a fall.
  function rideableLimit(profile, segIndex, sign, halfRoad) {
    let edge = 0;
    for (const band of sideAt(profile, sign, segIndex).bands) {
      if (band.to !== undefined && (band.kind === 'shoulder' || band.kind === 'runoff')) edge = band.to;
    }
    return halfRoad + edge;
  }

  // How far from the centre line a gate reaches on a side. A side with
  // run-off ground is crossable out to its rideable limit; a bare wall or
  // fall side keeps the road's own two metres of ledge.
  function gateReach(profile, segIndex, sign, halfRoad) {
    const side = sideAt(profile, sign, segIndex);
    const open = side.bands.some((band) => band.kind === 'runoff');
    return open ? rideableLimit(profile, segIndex, sign, halfRoad) + 2 : halfRoad + 2;
  }

  // The largest distance from the centre line any row of a side reaches. Rows
  // wider than half the tightest bend's radius would fold over on its inside.
  function outermost(side, ctx) {
    const out = {};
    let widest = 0;
    for (let j = 0; j <= ROWS; j++) widest = Math.max(widest, side.row(j, ctx, out).d);
    return widest;
  }

  // The sign of the first side that ends in a wall (left first), or 0 when
  // neither does. Rocks come off a wall.
  function wallSign(profile) {
    for (const sign of [-1, 1]) {
      const { bands } = sideAt(profile, sign, 0);
      if (bands[bands.length - 1].kind === 'wall') return sign;
    }
    return 0;
  }

  // The signs of the sides that end in a wall at a segment (left first):
  // where a rock can come off
  function wallSignsAt(profile, segIndex) {
    return [-1, 1].filter((sign) => {
      const { bands } = sideAt(profile, sign, segIndex);
      return bands[bands.length - 1].kind === 'wall';
    });
  }

  // Finite height where a fall ends: the reachable water's rest height, else
  // a fixed depth below the road. Nothing may fall without end.
  function restY(profile, side, roadY) {
    if (profile.floor.restY !== undefined) return profile.floor.restY;
    if (side.fallDepth !== undefined) return roadY - side.fallDepth;
    throw new Error(`Profile ${profile.id} has no rest height for a fall`);
  }

  // Point (d, y) on the drawn column at vertical fraction v of the face, by
  // linear interpolation between two rows. Decals find the face only here.
  // ctx is the same as for row(); out receives d and y.
  const lower = {};
  const upper = {};
  function facePoint(side, v, ctx, out) {
    const scaled = Math.max(0, Math.min(1, v)) * ROWS;
    const j = Math.min(Math.floor(scaled), ROWS - 1);
    const t = scaled - j;
    side.row(j, ctx, lower);
    side.row(j + 1, ctx, upper);
    out.d = lower.d + (upper.d - lower.d) * t;
    out.y = lower.y + (upper.y - lower.y) * t;
    return out;
  }

  return {
    ROWS,
    COLUMNS_PER_SEGMENT,
    SEGMENT_LENGTH,
    profiles,
    LEGS,
    LEG_PROFILES,
    legConfig,
    sideAt,
    sidesOf,
    rowAt,
    faceRange,
    zoneAt,
    wallSign,
    wallSignsAt,
    ceilingAt,
    setPieces,
    restY,
    facePoint,
    cliffDropSide,
    cliffWallSide,
    heightfieldSide,
    rideableLimit,
    gateReach,
    waterLevel,
    outermost,
    forLeg,
    elevation,
    row,
    locate,
    heightAt,
    groundY
  };
})();
