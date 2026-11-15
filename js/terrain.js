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
  // The least distance past the road edge a wall's ribbon vertex can have
  const WALL_FOOT = 1.4;
  // Rounding slack when a distance is tested against a fold of a wall's rows
  // Terrain.locate returns a lateral good to about 1e-3, so a point on a row's own distance is only known to that
  const FOLD_EPSILON = 1e-3;

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
  function cliffWallSide({ height, rockSpread, slope = 1.6, variation, snow, drawnFoot = false }) {
    const swing = variation ?? 1;
    return {
      flat: LEDGE,
      // The rock face starts 1m past the road edge, inside the 2m ledge
      bands: [{ to: 1, kind: 'shoulder' }, { kind: 'wall' }],
      // Where the drawn face really starts: row 0 of the ribbon sits 1.4 m past
      // the road edge, not at the end of the 2 m ledge. A wall that sets this
      // has its exact ground read from there, so the ground a bike is judged
      // on is the wall it sees. The mountain walls leave it off: their
      // recorded ground (and with it their baseline) must not move.
      ...(drawnFoot && { foot: WALL_FOOT }),
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
        out.d = Math.max(baseDistance + displacement * displacementScale, ctx.halfRoad + WALL_FOOT);
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
  function heightfieldSide({ stations, bands, runoff, undulation = null, shade = 1, tint, rock = false, fallDepth, lipDepth, rockSlope }) {
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
      // Drawn as bare rock (colour and texture), though it has no face to dress
      ...(rock && { rock }),
      // Ground steeper than this shows as bare rock (the drawn colour only)
      ...(rockSlope !== undefined && { rockSlope }),
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

  // Loose ground that changes shape along the road: two station lists of the
  // same length, `open` and `closed`, and a weight `closing(s)` (0 to 1, a pure
  // function of the position along the road in segments) that takes each
  // station from its open place and height to its closed ones. A band may name
  // a `closed` end too, so the run-off narrows with the ground. `roll` weights
  // each station's share of a rolling ridge line whose amplitude also closes.
  // Each row keeps its station gap whatever the weight, and the ground between
  // two stations is a straight line, so the drawn rows and `base` agree here as
  // on any heightfield.
  function closingSide({ open, closed, roll, closing, bands, runoff, wave, shade = 1, rockSlope }) {
    const last = bands[bands.length - 1];
    if (last.to !== undefined || (last.kind !== 'wall' && last.kind !== 'fall')) {
      throw new Error('A side must end in an unbounded wall or fall band so its rideable limit is finite');
    }
    if (closed.length !== open.length || roll.length !== open.length) {
      throw new Error('A closing side needs the same number of open, closed and roll stations');
    }
    const gaps = splitGaps(open.map(([d]) => d), closed.map(([d]) => d));
    const station = (n, w) => [open[n][0] + (closed[n][0] - open[n][0]) * w, open[n][1] + (closed[n][1] - open[n][1]) * w];
    // Height of the rolling ridge at a station weight of 1
    const ridge = (s, w) => {
      const amplitude = wave.amplitude[0] + (wave.amplitude[1] - wave.amplitude[0]) * w;
      const phase = (2 * Math.PI * s) / wave.wavelength + wave.phase;
      return amplitude * (0.7 * Math.sin(phase) + 0.3 * Math.sin(phase * 2.3 + 1.7));
    };
    // Height relative to the road at a distance past the road edge
    const offsetAt = (dPast, s) => {
      const w = closing(s);
      const top = ridge(s, w);
      let [d0, y0] = station(0, w);
      if (dPast <= d0) return y0 + top * roll[0];
      for (let n = 1; n < open.length; n++) {
        const [d1, y1] = station(n, w);
        if (dPast <= d1) {
          const t = (dPast - d0) / (d1 - d0);
          return y0 + (y1 - y0) * t + top * (roll[n - 1] + (roll[n] - roll[n - 1]) * t);
        }
        [d0, y0] = [d1, y1];
      }
      return y0 + top * roll[open.length - 1];
    };
    return {
      flat: 0,
      bands,
      face: null,
      runoff,
      shade,
      // Ground steeper than this is drawn as bare rock
      ...(rockSlope !== undefined && { rockSlope }),
      stations: open,
      closedStations: closed,
      roll,
      wave,
      closing,
      interpolatesRoad: true,
      base: (dPast, roadY, s) => roadY + offsetAt(dPast, s),
      row(j, ctx, out) {
        const w = closing(ctx.s);
        // Row j lies in gap g, at part k of its `parts`
        let n = 0;
        let k = j;
        while (n < gaps.length && k >= gaps[n]) k -= gaps[n++];
        let dPast;
        if (n === gaps.length) dPast = station(open.length - 1, w)[0];
        else {
          const from = station(n, w)[0];
          dPast = from + ((station(n + 1, w)[0] - from) * k) / gaps[n];
        }
        out.d = ctx.halfRoad + dPast;
        out.y = ctx.roadY + offsetAt(dPast, ctx.s);
        out.rise = out.y - ctx.roadY;
        out.displacement = 0;
        return out;
      }
    };
  }

  // How many rows each station gap gets, so the stations of both shapes fall
  // on rows: every gap gets one, and each further row goes to the gap whose
  // parts are the longest in either shape
  function splitGaps(openDistances, closedDistances) {
    const gaps = openDistances.slice(1).map(() => 1);
    const length = (n) => Math.max(openDistances[n + 1] - openDistances[n], closedDistances[n + 1] - closedDistances[n]);
    for (let n = 0; n < gaps.length; n++) {
      if (!(length(n) > 0)) throw new Error('Closing stations must run outward');
    }
    if (gaps.length > ROWS) throw new Error(`A closing side has at most ${ROWS + 1} stations`);
    while (gaps.reduce((a, b) => a + b, 0) < ROWS) {
      let widest = 0;
      gaps.forEach((parts, n) => { if (length(n) / parts > length(widest) / gaps[widest]) widest = n; });
      gaps[widest]++;
    }
    return gaps;
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
    // Exact reads walk the nearest vertex column, not the drawn triangles:
    // high-pass is bound to the frozen golden that recorded the walk
    columnWalk: true,
    // restY is where a fall ends: just above the drawn lake plane
    floor: { kind: 'lake', y: LAKE_Y, restY: LAKE_Y + 5 },
    // Road y for global segment i: gentle rolling terrain
    elevation: (i) => Math.sin(i * 0.04) * 8 + Math.cos(i * 0.025) * 6 + 25,
    left: cliffWallSide({ height: 40, rockSpread: 20 }),
    right: cliffDropSide({ floorY: LAKE_Y, faceHeight: LAKE_Y, rockSpread: 25 })
  };

  // The same cliff and lake seen the other way round: the drop to the lake on
  // the left, the wall on the right. A side does not know which way it faces,
  // so the sides are cliffLake's own; only the exact read differs (the drawn
  // triangles, as on every leg not bound to the frozen golden).
  const cliffLakeMirrored = {
    id: 'cliffLakeMirrored',
    floor: cliffLake.floor,
    elevation: cliffLake.elevation,
    left: cliffLake.right,
    right: cliffLake.left
  };

  const RUNOFF = { drag: 0.35, grip: 0.5, floorSpeed: 6 };
  const RUNOFF_BANDS = (to) => [{ to, kind: 'runoff' }, { kind: 'wall' }];

  const smoothstep = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };

  // The journey over to the mountains (leg 1, global segments 0 to 69, as in
  // js/tours.js): open country for the first third, the valley closing in
  // through the middle, foothills for the last fifth. One weight drives the
  // ground, the run-off, the dressing and the road's climb, so they change
  // together and smoothly: 0 up to 30% of the leg, 1 from 80%.
  const VALLEY_LEG = { from: 0, to: 69 };
  const valleyClosing = (s) => smoothstep(0.3, 0.8, (s - VALLEY_LEG.from) / (VALLEY_LEG.to - VALLEY_LEG.from));

  // Meadow beside the road with a low bank at the run-off's edge (left) or the
  // river (right), and low hills far off; closing, the run-off narrows to a
  // verge and the valley sides rise to steep, rocky foothills 120 m high close
  // to the road. The river keeps its bed at every weight: the water is a fixed
  // ribbon from lateral 35 to 50.
  const valleyFloor = {
    id: 'valleyFloor',
    // The river is a ribbon 3 m below the road, lateral 35 to 50 on the right
    floor: { kind: 'river', below: 3.0, side: 1, from: 35, to: 50 },
    closing: valleyClosing,
    // Low and rolling through the open country, then climbing with the valley
    // to meet the cliff road of leg 2: from 14 segments before the leg's end
    // the height eases onto cliffLake's own, and is cliffLake's from the end
    // on, so the hand-over has no step
    elevation: (i, start, end) => {
      const k = i - start;
      const t = k / (end - start);
      const own = 12 + 16 * smoothstep(0.2, 0.95, t) + Math.sin(k * 0.11) * 1.6 * (1 - smoothstep(0.25, 0.55, t));
      return own + (cliffLake.elevation(i) - own) * smoothstep(end - 14, end, i);
    },
    left: closingSide({
      // The bank's foot is half a metre past the run-off's end at every weight:
      // it moves along the road, and between two columns the drawn triangles
      // join two places of it, so it must stay clear of the run-off the bike
      // reads to 0.10
      open: [[0, 0], [14, -0.84], [35.5, -2.13], [41.5, 2.0], [70, 3.0], [100, 4.0], [140, 12], [175, 26], [190, 33]],
      closed: [[0, 0], [6, -0.3], [14.5, -0.5], [19.5, 3.5], [35, 16], [60, 40], [100, 76], [150, 108], [190, 124]],
      roll: [0, 0, 0, 0, 0.1, 0.3, 0.6, 0.85, 1],
      closing: valleyClosing,
      wave: { amplitude: [3, 16], wavelength: 9, phase: 0.4 },
      bands: [{ to: 35, closed: 14, kind: 'runoff' }, { kind: 'wall' }],
      runoff: RUNOFF,
      rockSlope: 0.6
    }),
    right: closingSide({
      // Bank into the river bed (below the water plane from 37.5 to 48), then up and away
      open: [[0, 0], [25, -1.5], [28, -3.1], [30, -4.0], [36, -4.0], [38, -3.1], [40, -2.0], [60, -1.0], [100, 0], [140, 12], [190, 34]],
      closed: [[0, 0], [25, -1.5], [28, -3.1], [30, -4.0], [36, -4.0], [38, -3.1], [40, -2.0], [52, 6], [90, 45], [135, 92], [190, 122]],
      roll: [0, 0, 0, 0, 0, 0, 0, 0.1, 0.4, 0.75, 1],
      closing: valleyClosing,
      wave: { amplitude: [3, 16], wavelength: 11, phase: 2.1 },
      bands: [{ to: 35, closed: 24, kind: 'runoff' }, { kind: 'wall' }],
      runoff: RUNOFF,
      rockSlope: 0.6
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
    amplitude: 3,
    // Half the tightest bend storm-valley draws (night-ride's first, 291 m,
    // at its segments 526 to 529) is 145 m: no row may reach past it
    reach: 130
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
      stations: [[0, 0], [1, 0], [2.5, 9], [8, 11], [40, 14], [115, 40]],
      bands: [{ to: 1, kind: 'shoulder' }, { kind: 'wall' }],
      shade: 0.5
    });

  // Pavement, level with the road and as slow to ride as the run-off beside
  // it, then the house fronts and garden walls (a wall that crashes)
  const streetSide = () =>
    heightfieldSide({
      stations: [[0, 0], [3, 0], [3.3, 7], [12, 8], [60, 12], [115, 40]],
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
    // The tightest bend of this leg is 266.7 m: no row may reach past half of it
    reach: 115,
    spans: [
      { type: 'tunnel', ...TUNNEL, left: hillSide(), right: hillSide() },
      { type: 'village', ...VILLAGE, left: streetSide(), right: streetSide() }
    ]
  });

  // A gorge: rock walls 46 to 67 m high close to the road on both sides, then
  // a tunnel through the rock, a cliff road with the wall on the left and a
  // drop to the gorge's lake on the right, a second tunnel, and the cliff
  // road again with the wall and the drop swapped. Both tunnels lie on
  // straights (260-271 and 280-293) and keep a segment clear of every
  // checkpoint (263, 295) and of the roadworks (281-283); segments are global
  // and `to` is exclusive. Each change of side blends over one segment, as every
  // span edge does.
  const GORGE_LAKE_Y = -28;
  const GORGE_TUNNELS = [{ from: 265, to: 272 }, { from: 286, to: 294 }];
  const GORGE_CLIFFS = [{ from: 272, to: 286 }, { from: 294 }];
  const gorgeWall = () => cliffWallSide({ height: 57, rockSpread: 20, variation: 0.2, snow: false, drawnFoot: true });
  const gorgeDrop = () => cliffDropSide({ floorY: GORGE_LAKE_Y, faceHeight: -55, rockSpread: 25 });
  // The rock spur each tunnel cuts through: the lining at 1 m past the edge,
  // the rock climbing to the roof's crest 2.5 m out and on up beside the walls,
  // then falling away into the gorge's lake, so seen from a cliff road it is a
  // ridge running down into the water, not a fin standing over it. It ends 66 m
  // under the road, below the lake at every road height of the leg (21.5 to
  // 32.5), and reaches no further than 110 m: the tightest bend is 266.7 m.
  const gorgeHill = () =>
    heightfieldSide({
      stations: [[0, 0], [1, 0], [2.5, 9], [8, 14], [28, 40], [45, 40], [75, -12], [110, -66]],
      bands: [{ to: 1, kind: 'shoulder' }, { kind: 'wall' }],
      rock: true
    });
  const canyon = {
    id: 'canyon',
    // The gorge's lake, far under the road; only the cliff road sees it
    floor: { kind: 'lake', y: GORGE_LAKE_Y, restY: GORGE_LAKE_Y + 0.5 },
    elevation: (i, start, end) => {
      const k = i - start;
      const t = Math.min(1, Math.max(0, k / (end - start)));
      return 30 - 6 * t + Math.sin(k * 0.07) * 2.5;
    },
    left: gorgeWall(),
    right: gorgeWall(),
    spans: [
      { type: 'tunnel', ...GORGE_TUNNELS[0], ceiling: 7.5, cap: 0x5e5850, left: gorgeHill(), right: gorgeHill() },
      { ...GORGE_CLIFFS[0], right: gorgeDrop() },
      { type: 'tunnel', ...GORGE_TUNNELS[1], ceiling: 7.5, cap: 0x5e5850, left: gorgeHill(), right: gorgeHill() },
      { ...GORGE_CLIFFS[1], left: gorgeDrop() }
    ]
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
    left: cliffWallSide({ height: 40, rockSpread: 20, drawnFoot: true }),
    right: cliffDropSide({ floorY: SEA_Y, faceHeight: -60, rockSpread: 25, lipDepth: 2 }),
    spans: [{ from: BEACH_FROM, right: beach }]
  };

  // An exposed ridge: a snowfield 6 m wide each side of the road, then a drop
  // of 40 m onto a shelf, with a frozen lake far below. The shelf, not the
  // lake, is where a bike that goes over comes to rest. The drop is too steep
  // to hold snow, so it shows as a band of bare rock under the snowfield.
  const ridgeSide = () =>
    heightfieldSide({
      stations: [[0, 0], [6, -0.4], [8, -4], [14, -22], [22, -40], [80, -40]],
      bands: [{ to: 6, kind: 'runoff' }, { kind: 'fall' }],
      runoff: RUNOFF,
      tint: 0xdfe8f0,
      fallDepth: 40,
      rockSlope: 1.0
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

  const profiles = { cliffLake, cliffLakeMirrored, valleyFloor, forest, forestNight, coast, canyon, ridge };

  // The per-leg table: the only source of per-leg world values. `profile` is
  // the shape of the ground beside the road; `floor` is defined once, on the
  // profile, and shared here; `look` keeps the key names applyLandscapeConfig
  // reads; `dressing` holds what the world build scatters. Order is leg order.
  const BACKDROP = ['distant', 'mid', 'near', 'majestic', 'endCourse'];
  const LEGS = [
    // Changed legs carry trackVersion 2: a new road height or a new ground is a
    // new course, so a new leaderboard and best-time key (TourSystem.boardId)
    { id: 'mountain-dawn', profile: valleyFloor, trackVersion: 2, roadWidth: 20,
      look: { grassColor: 0x4a7c4a, mountainColor: 0x6b5c42, fogDensity: 0.0015 },
      // Open country: sparse broadleaf clumps both sides, none in the river.
      // As the valley closes (Terrain.closingAt) the trees thicken and turn to
      // conifers (`closed` holds the values at full weight), rock outcrops
      // break through the slopes, and the range ahead (`approach`, the
      // mountains of leg 2) comes nearer; the far ring in the sky strengthens
      // with it (render.ringRise).
      dressing: {
        forest: {
          coniferShare: 0, snowy: false,
          layout: { perSegment: [1, 3], offset: 6, reach: 104, exclude: [{ sign: 1, from: 33, to: 52 }] },
          closed: { coniferShare: 0.85, perSegment: [3, 5] }
        },
        // Rocks per segment at full weight, set into the ground past the rideable limit
        outcrops: { perSegment: 3 },
        rockfall: 0, backdrop: ['approach']
      },
      // Where the menu preview camera stands: metres out from the mid-leg point, and above it
      preview: { radius: 30, height: 9 } },
    // The cliff road of the dawn leg seen the other way round: the wall on the
    // right, the lake on the left. Rocks come off the wall, trees stand on the
    // drop, and the menu camera looks back from over the lake (side -1).
    { id: 'valley-run', profile: cliffLakeMirrored, trackVersion: 2, roadWidth: 20,
      look: { grassColor: 0x5a9c5a, mountainColor: 0x7a6c52, fogDensity: 0.0008 },
      // The twin peaks stand on a wall-side shelf 120 m over the lake: here they
      // would float over the water, so this leg has the ranges that stand in it
      dressing: { forest: { coniferShare: 0.75, snowy: false }, rockfall: 0.25, backdrop: ['distant', 'mid', 'near', 'endCourse'] },
      preview: { radius: 30, height: 9, side: -1 } },
    { id: 'coastal-descent', profile: coast, trackVersion: 2, roadWidth: 20,
      look: { grassColor: 0x6aac6a, mountainColor: 0x5a4c32, fogDensity: 0.001 },
      // The default forest is kept: it only stands where the cliff face is 15 m above the sea
      dressing: { forest: { coniferShare: 0.3, snowy: false }, rockfall: 0, backdrop: [] } },
    // The gorge has no trees (rock to the road edge); rocks come off whichever
    // walls stand at a segment, never off a drop or out of a tunnel
    { id: 'foggy-gorge', profile: canyon, trackVersion: 2, roadWidth: 20,
      look: { grassColor: 0x5a9c5a, mountainColor: 0x7a6c52, fogDensity: 0.0008 },
      dressing: { forest: null, rockfall: 0.5, backdrop: [] },
      // Between the walls: a camera 30 m out on the right would be inside the rock
      preview: { radius: 3, height: 8 } },
    { id: 'high-pass', profile: cliffLake, trackVersion: 1, roadWidth: 16,
      look: { grassColor: 0x3a6c3a, mountainColor: 0x8b8b8b, fogDensity: 0.002 },
      dressing: { forest: { coniferShare: 0.9, snowy: false }, rockfall: 0.25, backdrop: BACKDROP } },
    // grip: the road's own grip under the weather's (1 when absent). It steps
    // down over the last three legs; with the rain and snow, storm-valley and
    // winter-pass have the least
    { id: 'storm-valley', profile: forest, trackVersion: 2, roadWidth: 16, grip: 0.95,
      look: { grassColor: 0x5a9c5a, mountainColor: 0x7a6c52, fogDensity: 0.0008 },
      // Dense trees both sides, none beyond 90 m; no walls, so no rockfalls
      dressing: {
        forest: { coniferShare: 0.5, snowy: false, layout: { perSegment: [4, 6], offset: 5, reach: 77, exclude: [] } },
        rockfall: 0, backdrop: []
      },
      // The trees stand 13 m out: the camera sits in the gap above the road edge
      preview: { radius: 8, height: 5 } },
    { id: 'night-ride', profile: forestNight, trackVersion: 2, roadWidth: 16, grip: 0.9,
      look: { grassColor: 0x4a8c4a, mountainColor: 0x6a5c42, fogDensity: 0.0012 },
      // As the storm leg's forest, a little thinner; no walls, so no rockfalls
      dressing: {
        forest: { coniferShare: 0.6, snowy: false, layout: { perSegment: [3, 5], offset: 5, reach: 77, exclude: [] } },
        rockfall: 0, backdrop: []
      },
      preview: { radius: 8, height: 5 } },
    { id: 'winter-pass', profile: ridge, trackVersion: 2, roadWidth: 16, grip: 0.85,
      look: { grassColor: 0x3a6c3a, mountainColor: 0x8b8b8b, fogDensity: 0.002 },
      // A high pass: snow-capped peaks all round (`peaks`), snow-laden conifers
      // on the slopes below the snowfield only (none within 12 m of the road
      // edge), boulders on the rock band and the shelf (`outcrops`, the same
      // weight the whole leg), snow poles and cairns along the snowfield and a
      // marker at the summit (`pass`). No walls, so no rockfalls.
      dressing: {
        forest: { coniferShare: 1.0, snowy: true, layout: { perSegment: [2, 4], offset: 12, reach: 60, exclude: [] } },
        outcrops: { perSegment: 3, everywhere: true, snowy: true },
        pass: { poleLateral: 3.5, cairnEvery: 12, cairnLateral: 5 },
        rockfall: 0, backdrop: ['peaks']
      },
      // The snowfield is 6 m wide: the roadworks plant stands on it, past the road edge by these amounts
      plant: { bulldozer: 4.5, barrier: 2.5, truck: 3 } }
  ];
  // Depth atmosphere and render reach, per leg (Graphics.setAtmosphere and the
  // culling and shadow set-up in main.js read these). heightFog: density per
  // metre at the leg's lowest road height, and the falloff per metre of climb.
  // shafts: light-shaft strength, 0 for off. ring: scales the far mountain
  // ring. cullMax: upper bound on the cull distance. shadowSpan: width of the
  // shadow box.
  const DEFAULT_RENDER = { ring: 1, cullMax: 600, shadowSpan: 120 };
  const ATMOSPHERE = {
    // The open valley sees far; the cliff road keeps the cliff legs' reach
    // The far ring in the sky rises from faint to full over the leg, as the mountains near
    'mountain-dawn': { atmosphere: { heightFog: { density: 0.0025, falloff: 0.05 }, shafts: 0.35 }, render: { cullMax: 800, ringRise: [0.15, 1] } },
    'valley-run': { atmosphere: { heightFog: { density: 0.004, falloff: 0.04 }, shafts: 0.35 }, render: {} },
    'coastal-descent': { atmosphere: { heightFog: { density: 0.003, falloff: 0.04 }, shafts: 0 }, render: { ring: 0.35, cullMax: 800 } },
    'foggy-gorge': { atmosphere: { heightFog: { density: 0.004, falloff: 0.06 }, shafts: 0.35 }, render: { shadowSpan: 200 } },
    'high-pass': { atmosphere: { heightFog: { density: 0.003, falloff: 0.05 }, shafts: 0.35 }, render: {} },
    'storm-valley': { atmosphere: { heightFog: { density: 0.003, falloff: 0.05 }, shafts: 0 }, render: {} },
    'night-ride': { atmosphere: { heightFog: { density: 0.002, falloff: 0.05 }, shafts: 0 }, render: {} },
    'winter-pass': { atmosphere: { heightFog: { density: 0.003, falloff: 0.04 }, shafts: 0 }, render: { cullMax: 800 } }
  };
  LEGS.forEach((leg) => {
    leg.floor = leg.profile.floor;
    leg.atmosphere = ATMOSPHERE[leg.id].atmosphere;
    leg.render = Object.assign({}, DEFAULT_RENDER, ATMOSPHERE[leg.id].render);
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
    const s = ctx.s ?? ctx.index;
    if (!profile.spans) return profile[key].row(j, ctx, out);
    // The side of segment k holds from the boundary half a segment before k;
    // between two segments the rows blend from the earlier side to the later
    const later = Math.ceil(s);
    const after = sideAt(profile, sign, later);
    if (later === s) return after.row(j, ctx, out);
    const before = sideAt(profile, sign, later - 1);
    if (before === after) return after.row(j, ctx, out);
    let from = before;
    let to = after;
    let weight = s - (later - 1);
    // Leaving a span for the profile's own side: weighed from the profile's
    // side, as the ribbon was always drawn there
    if (after === profile[key]) {
      from = after;
      to = before;
      weight = later - s;
    }
    from.row(j, ctx, blendFrom);
    to.row(j, ctx, blendTo);
    for (const field of ['d', 'y', 'rise', 'displacement']) {
      out[field] = blendFrom[field] + (blendTo[field] - blendFrom[field]) * weight;
    }
    return out;
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
    out.x = x;
    out.z = z;
    out.roadY = closest.y || 0;
    const perpX = Math.cos(closest.heading);
    const perpZ = -Math.sin(closest.heading);
    out.lateral = (x - closest.x) * perpX + (z - closest.z) * perpZ;
    out.along = (x - closest.x) * Math.sin(closest.heading) + (z - closest.z) * Math.cos(closest.heading);
    return out;
  }

  // Whether the ribbon on a side is blending between two sides at a position
  // along the road (in segments): the one segment either side of a span edge
  function blendingAt(profile, key, s) {
    if (!profile.spans || Number.isInteger(s)) return false;
    const sign = key === 'left' ? -1 : 1;
    return sideAt(profile, sign, Math.floor(s)) !== sideAt(profile, sign, Math.ceil(s));
  }

  // Height of the rendered face at distance d from the centre line, down one
  // vertex column. Walks the rows the ribbon builder generated. `blended` is a
  // span edge: the rows are those of the blend, and may be any kind of side.
  // `roadHeight` is the road's height at the point asked for, where it is not
  // the column's own.
  function walkColumn(profile, sign, side, geo, d, column, startIdx, blended, roadHeight) {
    const halfRoad = geo.roadWidth / 2;
    const segmentIndex = startIdx + Math.floor(column / COLUMNS_PER_SEGMENT);
    const point = geo.path[segmentIndex];
    const next = geo.path[Math.min(geo.path.length - 1, segmentIndex + 1)];
    const roadY = roadHeight ?? point.y + (next.y - point.y) * ((column % COLUMNS_PER_SEGMENT) / COLUMNS_PER_SEGMENT);
    const ctx = {
      halfRoad, roadY, column, index: segmentIndex, pathLength: geo.path.length,
      s: startIdx + column / COLUMNS_PER_SEGMENT
    };
    const out = {};
    let previousDistance;
    let previousY = roadY;
    if (blended) {
      rowAt(profile, sign, 0, ctx, out);
      previousDistance = out.d;
      previousY = out.y;
      if (d <= out.d) return roadY;
    } else {
      // Row 0 of the mesh sits at the end of the ledge
      previousDistance = halfRoad + (side.foot ?? side.flat);
    }
    // A wall leans out over the road as it rises, so its rows can fold back: more
    // than one row segment then spans the same distance. What a rock or a ray
    // meets from above is the highest of them.
    const folds = blended || (side.face && side.face.kind === 'rise');
    let highest = null;
    for (let j = 1; j <= ROWS; j++) {
      rowAt(profile, sign, j, ctx, out);
      if (folds) {
        const low = Math.min(previousDistance, out.d);
        // A point on a row's own distance is on it to within rounding: a ray finds that fold too
        if (d >= low - FOLD_EPSILON && d <= Math.max(previousDistance, out.d) + FOLD_EPSILON) {
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

  // Height of the rendered face at distance d from the centre line. Walks the
  // same vertex column the ribbon builder generated. Returns null outside the
  // built range (callers fall back to the plain slope model). At a span edge
  // the ribbon is a blend of two sides, drawn between two columns: the walk
  // then reads both columns and joins them the way the triangles do.
  function surfaceY(profile, sign, side, geo, loc, d, blended = false) {
    const startIdx = Math.max(0, geo.startSegment);
    const endIdx = Math.min(geo.path.length - 1, geo.endSegment + 20);
    const segmentIndex = loc.index;
    if (segmentIndex < startIdx || segmentIndex > endIdx) return null;

    const exactColumn = (segmentIndex - startIdx + loc.along / SEGMENT_LENGTH) * COLUMNS_PER_SEGMENT;
    if (blended) {
      const first = Math.floor(exactColumn);
      const last = Math.ceil(exactColumn);
      if (first < 0 || startIdx + Math.floor(last / COLUMNS_PER_SEGMENT) > endIdx) return null;
      const low = walkColumn(profile, sign, side, geo, d, first, startIdx, true);
      if (last === first) return low;
      const high = walkColumn(profile, sign, side, geo, d, last, startIdx, true);
      return low + (high - low) * (exactColumn - first);
    }

    const column = Math.round(exactColumn);
    if (column < 0) return null;
    return walkColumn(profile, sign, side, geo, d, column, startIdx, false, interpolatedRoadY(geo, loc));
  }

  // Column c of the ribbon (counted from the first built segment), laid out
  // exactly as Environment.buildTerrainRibbon lays it: its foot on the road
  // between two points, its heading interpolated, and the row context
  function columnFrame(geo, startIdx, c, out) {
    const i = startIdx + Math.floor(c / COLUMNS_PER_SEGMENT);
    const t = (c % COLUMNS_PER_SEGMENT) / COLUMNS_PER_SEGMENT;
    const point = geo.path[i];
    const next = i < geo.path.length - 1 ? geo.path[i + 1] : point;
    const roadY = point.y || 0;
    out.x = point.x + (next.x - point.x) * t;
    out.z = point.z + (next.z - point.z) * t;
    out.heading = point.heading + (next.heading - point.heading) * t;
    out.ctx = { halfRoad: geo.roadWidth / 2, roadY: roadY + ((next.y || 0) - roadY) * t, column: c, index: i, s: i + t, pathLength: geo.path.length };
    return out;
  }

  // The drawn vertices of one column, rounded to the float32 the mesh stores,
  // so a triangle here is the triangle a ray meets
  function columnVertices(profile, sign, geo, startIdx, c) {
    const frame = columnFrame(geo, startIdx, c, {});
    const cos = Math.cos(frame.heading) * sign;
    const sin = Math.sin(frame.heading) * sign;
    const out = {};
    const vertices = new Array(ROWS + 1);
    for (let j = 0; j <= ROWS; j++) {
      rowAt(profile, sign, j, frame.ctx, out);
      vertices[j] = [Math.fround(frame.x + cos * out.d), Math.fround(out.y), Math.fround(frame.z - sin * out.d)];
    }
    return { frame, vertices };
  }

  // Height of vertical line (x, z) on a triangle, or null when it misses.
  // The tolerance keeps a point on a shared edge inside both triangles.
  function triangleY(a, b, c, x, z) {
    const det = (b[0] - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (b[2] - a[2]);
    if (Math.abs(det) < 1e-12) return null;
    const u = ((x - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (z - a[2])) / det;
    const v = ((b[0] - a[0]) * (z - a[2]) - (x - a[0]) * (b[2] - a[2])) / det;
    const slack = 1e-7;
    if (u < -slack || v < -slack || u + v > 1 + slack) return null;
    return a[1] + (b[1] - a[1]) * u + (c[1] - a[1]) * v;
  }

  // The highest drawn surface over (x, z) on one side, read from the triangles
  // themselves: every vertex of a column lies on the column's line, so (x, z)
  // falls in the strip between two column lines, and one strip's triangles
  // are all that can cover it. On a bend the nearest centre-line point is not
  // the column the point lies beside, and between two columns the surface is
  // not either column's, so neither the located lateral nor a column walk is
  // exact there. Returns null where no triangle covers the point (the ledge,
  // past the top row, outside the built range).
  function meshY(profile, sign, geo, loc, x, z) {
    const startIdx = Math.max(0, geo.startSegment);
    const endIdx = Math.min(geo.path.length - 1, geo.endSegment + 20);
    const columns = (endIdx - startIdx + 1) * COLUMNS_PER_SEGMENT;
    const centre = (loc.index - startIdx) * COLUMNS_PER_SEGMENT;
    const first = Math.max(0, centre - 2 * COLUMNS_PER_SEGMENT);
    const last = Math.min(columns - 1, centre + 2 * COLUMNS_PER_SEGMENT);
    if (first >= last) return null;
    // Signed distance of (x, z) ahead of each column line
    const frame = {};
    const ahead = [];
    for (let c = first; c <= last; c++) {
      columnFrame(geo, startIdx, c, frame);
      ahead.push((x - frame.x) * Math.sin(frame.heading) + (z - frame.z) * Math.cos(frame.heading));
    }
    let highest = null;
    for (let c = first; c < last; c++) {
      // Between line c and line c + 1; a point on a line reads both strips beside it
      if (ahead[c - first] < -1e-6 || ahead[c + 1 - first] > 1e-6) continue;
      const left = columnVertices(profile, sign, geo, startIdx, c).vertices;
      const right = columnVertices(profile, sign, geo, startIdx, c + 1).vertices;
      for (let row = 0; row < ROWS; row++) {
        const bl = left[row], tl = left[row + 1], br = right[row], tr = right[row + 1];
        // The same diagonals as the ribbon's triangles
        const pair = (c + row) % 2 === 0 ? [[bl, br, tl], [br, tr, tl]] : [[bl, tr, tl], [bl, br, tr]];
        for (const [a, b, d] of pair) {
          const y = triangleY(a, b, d, x, z);
          if (y !== null && (highest === null || y > highest)) highest = y;
        }
      }
    }
    return highest;
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
    // An exact read of a wall that sets its drawn foot starts at the foot
    const faceStart = exact && side.face && side.foot !== undefined ? geo.roadWidth / 2 + side.foot : ledgeEnd;

    const blending = exact && blendingAt(profile, right ? 'right' : 'left', loc.index + loc.along / SEGMENT_LENGTH);
    // An exact read beside the road is the drawn triangles themselves, rock or
    // ground, and on the road or a ledge the road height the road mesh draws.
    // cliffLake keeps the column walk: its frozen golden recorded that.
    if (exact && !profile.columnWalk && loc.x !== undefined) {
      if (blending || d > geo.roadWidth / 2) {
        const drawn = meshY(profile, sign, geo, loc, loc.x, loc.z);
        if (drawn !== null) return profile.floor.y === undefined ? drawn : Math.max(drawn, profile.floor.y);
      }
      if (d <= faceStart) return interpolatedRoadY(geo, loc);
    }

    // A span edge is drawn as a blend of two sides, whatever either side is
    if (blending) {
      const walked = surfaceY(profile, sign, side, geo, loc, d, true);
      if (walked !== null) return profile.floor.y === undefined ? walked : Math.max(walked, profile.floor.y);
    }

    if (d > faceStart) {
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
      const to = bandEnd(side, band, segIndex);
      if (to === undefined || reach <= halfRoad + to) {
        return { kind: band.kind, side, sign, start };
      }
      start = halfRoad + to;
    }
    throw new Error(`Side of ${profile.id} has no outermost band`);
  }

  // The largest lateral, from the centre line, a bike can occupy on that side
  // without crashing or falling: the outer edge of the last shoulder or run-off
  // band. Always finite, because a side must end in a wall or a fall.
  function rideableLimit(profile, segIndex, sign, halfRoad) {
    const side = sideAt(profile, sign, segIndex);
    let edge = 0;
    for (const band of side.bands) {
      if (band.to !== undefined && (band.kind === 'shoulder' || band.kind === 'runoff')) edge = bandEnd(side, band, segIndex);
    }
    return halfRoad + edge;
  }

  // Where a band ends past the road edge at a position along the road: its
  // own `to`, or on a closing side, that much of the way to its `closed` end
  function bandEnd(side, band, s) {
    if (band.closed === undefined) return band.to;
    return band.to + (band.closed - band.to) * side.closing(s);
  }

  // How far a profile has closed in at a position along the road: 0 for a
  // profile that keeps one shape. The dressing reads it with the ground.
  function closingAt(profile, s) {
    return profile.closing ? profile.closing(s) : 0;
  }

  // How far from the centre line a gate reaches on a side. A side with
  // run-off ground is crossable out to its rideable limit plus the two metres
  // of a bike's width; a bare wall or fall side keeps the road's own two metres
  // of ledge.
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

  // The side at a segment that ends in a fall (right first), or 0 when
  // neither does: where the drop-side dressing (forest, bushes, the start
  // sign) goes. A mirrored cliff has its drop on the left.
  function fallSignAt(profile, segIndex) {
    for (const sign of [1, -1]) {
      const { bands } = sideAt(profile, sign, segIndex);
      if (bands[bands.length - 1].kind === 'fall') return sign;
    }
    return 0;
  }

  // The side the roadside rock clusters stand on: the left (the mountain side
  // of the cliff legs, the run-off of the open legs), unless the left falls
  function clutterSignAt(profile, segIndex) {
    const { bands } = sideAt(profile, -1, segIndex);
    return bands[bands.length - 1].kind === 'fall' ? 1 : -1;
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
    fallSignAt,
    clutterSignAt,
    ceilingAt,
    setPieces,
    restY,
    facePoint,
    cliffDropSide,
    cliffWallSide,
    heightfieldSide,
    closingSide,
    closingAt,
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
