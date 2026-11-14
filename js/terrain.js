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
  function cliffDropSide({ floorY, faceHeight, rockSpread, slope = 1.33, margin = 6 }) {
    const depth = margin - floorY;
    return {
      flat: LEDGE,
      exact: true, // Physics walks the rendered column
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
  function cliffWallSide({ height, rockSpread, slope = 1.6 }) {
    return {
      flat: LEDGE,
      // Physics keeps the plain slope on this side; the drawn wall differs
      exact: false,
      face: { kind: 'rise', height, rockSpread },
      base: (dPast, roadY) => Math.min(roadY + dPast * slope, roadY + height),
      row(j, ctx, out) {
        const verticalProgress = j / ROWS;
        // Variable height along the wall: sine waves give ups and downs, with
        // no per-vertex random term (it turned the skyline into a saw blade)
        const lengthProgress = ctx.index / ctx.pathLength;
        const heightMultiplier =
          1.0 +
          Math.sin(lengthProgress * Math.PI * 8) * 0.5 + // 8 major peaks and valleys
          Math.sin(lengthProgress * Math.PI * 15) * 0.25 + // 15 medium variations
          Math.sin(lengthProgress * Math.PI * 27) * 0.15; // 27 small details
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

  const LAKE_Y = -200;

  const cliffLake = {
    id: 'cliffLake',
    floor: { kind: 'lake', y: LAKE_Y },
    // Road y for global segment i: gentle rolling terrain
    elevation: (i) => Math.sin(i * 0.04) * 8 + Math.cos(i * 0.025) * 6 + 25,
    left: cliffWallSide({ height: 40, rockSpread: 20 }),
    right: cliffDropSide({ floorY: LAKE_Y, faceHeight: LAKE_Y, rockSpread: 25 })
  };

  const profiles = { cliffLake };
  const LEG_PROFILES = [cliffLake, cliffLake, cliffLake, cliffLake, cliffLake, cliffLake, cliffLake, cliffLake];

  function forLeg(legIndex) {
    return LEG_PROFILES[legIndex] || LEG_PROFILES[0];
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
  function surfaceY(side, geo, loc, d) {
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
    const ctx = { halfRoad, roadY, column, index: segmentIndex, pathLength: geo.path.length };
    const out = {};

    // Row 0 of the mesh sits at the end of the ledge
    let previousDistance = halfRoad + side.flat;
    let previousY = roadY;
    for (let j = 1; j <= ROWS; j++) {
      side.row(j, ctx, out);
      if (d <= out.d) {
        const span = out.d - previousDistance;
        const t = span > 0.001 ? (d - previousDistance) / span : 1;
        return previousY + (out.y - previousY) * Math.max(0, Math.min(1, t));
      }
      previousDistance = out.d;
      previousY = out.y;
    }
    return previousY;
  }

  // Ground height at a located point. `exact` walks the drawn face on sides
  // that support it; otherwise the smooth `side.base` model answers.
  function heightAt(profile, geo, loc, exact) {
    const roadY = loc.roadY;
    const right = loc.lateral > 0;
    const side = right ? profile.right : profile.left;
    const d = right ? loc.lateral : -loc.lateral;
    const ledgeEnd = geo.roadWidth / 2 + side.flat;

    if (d > ledgeEnd) {
      if (exact && side.exact) {
        const walked = surfaceY(side, geo, loc, d);
        if (walked !== null) return Math.max(walked, profile.floor.y);
      }
      return side.base(d - ledgeEnd, roadY);
    }
    // On the road or its ledges
    return roadY;
  }

  function groundY(profile, geo, x, z, from, to, exact) {
    if (!geo.path || geo.path.length === 0) return profile.floor.y;
    return heightAt(profile, geo, locate(geo.path, x, z, from, to, {}), exact);
  }

  return {
    ROWS,
    COLUMNS_PER_SEGMENT,
    SEGMENT_LENGTH,
    profiles,
    LEG_PROFILES,
    cliffDropSide,
    cliffWallSide,
    forLeg,
    elevation,
    row,
    locate,
    heightAt,
    groundY
  };
})();
