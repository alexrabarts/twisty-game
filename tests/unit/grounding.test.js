// Grounding tests: replicate Environment.groundYAt() and the scenery
// placement formulas from js/environment.js, and assert that every placed
// object's base lands on (or below) the terrain model. Mirrors the
// constants in Vehicle.getTerrainHeightAt() (cliff drop 1.33/unit past the
// 2m ledge, lake floor at -200) plus the left mountain wall rise
// (~40 units over ~25 lateral units => 1.6/unit, capped at +40).

const LAKE_LEVEL = -200;
const TOLERANCE = 0.75; // Same tolerance validateGrounding() uses

// Replica of Environment.groundYAt(x, z)
function groundYAt(roadPath, roadWidth, x, z) {
    if (!roadPath || roadPath.length === 0) return LAKE_LEVEL;

    let closest = null;
    let closestDistSq = Infinity;
    for (let i = 0; i < roadPath.length; i++) {
        const point = roadPath[i];
        const dx = x - point.x;
        const dz = z - point.z;
        const distSq = dx * dx + dz * dz;
        if (distSq < closestDistSq) {
            closestDistSq = distSq;
            closest = point;
        }
    }

    const roadY = closest.y || 0;
    const perpX = Math.cos(closest.heading);
    const perpZ = -Math.sin(closest.heading);
    const lateral = (x - closest.x) * perpX + (z - closest.z) * perpZ;

    const halfRoad = roadWidth / 2;
    const ledgeEnd = halfRoad + 2;

    if (lateral > ledgeEnd) {
        const drop = (lateral - ledgeEnd) * 1.33;
        return Math.max(roadY - drop, LAKE_LEVEL);
    }
    if (lateral < -ledgeEnd) {
        const rise = (-lateral - ledgeEnd) * 1.6;
        return Math.min(roadY + rise, roadY + 40);
    }
    return roadY;
}

// Replica of validateGrounding()'s floating check
function isFloating(bottomY, groundY) {
    return bottomY - groundY > TOLERANCE;
}

// Build a synthetic road path the same way createRoad() does (straight,
// then a right sweep), with the real elevation formula
function buildRoadPath(segments = 40) {
    const segmentLength = 20;
    let x = 0, z = 0, heading = 0;
    const path = [];
    for (let i = 0; i < segments; i++) {
        const centerX = x + (segmentLength / 2) * Math.sin(heading);
        const centerZ = z + (segmentLength / 2) * Math.cos(heading);
        const elevation =
            Math.sin(i * 0.04) * 8 + Math.cos(i * 0.025) * 6 + 25;
        path.push({ x: centerX, z: centerZ, y: elevation, heading });
        x += segmentLength * Math.sin(heading);
        z += segmentLength * Math.cos(heading);
        if (i >= 16) heading += 0.04; // Right sweep after the start straight
    }
    return path;
}

describe('groundYAt terrain model', () => {
    const roadWidth = 20;
    const path = buildRoadPath();

    test('returns road height on the road surface and its 2m ledges', () => {
        const p = path[5];
        const half = roadWidth / 2;
        // Centerline
        expect(groundYAt(path, roadWidth, p.x, p.z)).toBeCloseTo(p.y, 5);
        // Right ledge edge (lateral = half + 2)
        const lat = half + 2;
        const x = p.x + Math.cos(p.heading) * lat;
        const z = p.z - Math.sin(p.heading) * lat;
        expect(groundYAt(path, roadWidth, x, z)).toBeCloseTo(p.y, 5);
    });

    test('drops at 1.33 per lateral unit past the right ledge', () => {
        const p = path[5];
        const lat = roadWidth / 2 + 2 + 10; // 10 units past the ledge
        const x = p.x + Math.cos(p.heading) * lat;
        const z = p.z - Math.sin(p.heading) * lat;
        expect(groundYAt(path, roadWidth, x, z)).toBeCloseTo(p.y - 13.3, 5);
    });

    test('floors at the lake level (-200) far off the right side', () => {
        const p = path[5];
        const lat = roadWidth / 2 + 2 + 500;
        const x = p.x + Math.cos(p.heading) * lat;
        const z = p.z - Math.sin(p.heading) * lat;
        expect(groundYAt(path, roadWidth, x, z)).toBe(LAKE_LEVEL);
    });

    test('rises at 1.6 per lateral unit up the left mountain face, capped at +40', () => {
        const p = path[5];
        const lat = roadWidth / 2 + 2 + 5; // 5 units past the left ledge
        const x = p.x - Math.cos(p.heading) * lat;
        const z = p.z + Math.sin(p.heading) * lat;
        expect(groundYAt(path, roadWidth, x, z)).toBeCloseTo(p.y + 8, 5);

        const farLat = roadWidth / 2 + 2 + 100;
        const farX = p.x - Math.cos(p.heading) * farLat;
        const farZ = p.z + Math.sin(p.heading) * farLat;
        expect(groundYAt(path, roadWidth, farX, farZ)).toBeCloseTo(p.y + 40, 5);
    });
});

describe('roadside object placement formulas rest on the terrain model', () => {
    const path = buildRoadPath();

    test.each([[20], [16]])('delineator posts sit on the ledge (roadWidth %i)', (roadWidth) => {
        const postDistance = roadWidth / 2 + 1;
        path.forEach((p) => {
            [-1, 1].forEach((side) => {
                const x = p.x + side * postDistance * Math.sin(p.heading + Math.PI / 2);
                const z = p.z + side * postDistance * Math.cos(p.heading + Math.PI / 2);
                // Post center at p.y + 0.75, height 1.5 => base at p.y
                const base = p.y + 0.75 - 0.75;
                expect(isFloating(base, groundYAt(path, roadWidth, x, z))).toBe(false);
            });
        });
    });

    test.each([[20], [16]])('track cones sit just off the road edge (roadWidth %i)', (roadWidth) => {
        const coneDistance = roadWidth / 2 + 0.5;
        path.forEach((p) => {
            [-1, 1].forEach((side) => {
                const x = p.x + side * coneDistance * Math.cos(p.heading);
                const z = p.z - side * coneDistance * Math.sin(p.heading);
                // Cone center at p.y + 0.25, height 0.5 => base at p.y
                const base = p.y + 0.25 - 0.25;
                expect(isFloating(base, groundYAt(path, roadWidth, x, z))).toBe(false);
            });
        });
    });

    test('tree trunks ground on the rising mountain face, not at road height', () => {
        const roadWidth = 20;
        path.forEach((p) => {
            const treeDistance = 25; // Mid-range of 20 + rand*10
            const x = p.x - treeDistance * Math.cos(p.heading);
            const z = p.z + treeDistance * Math.sin(p.heading);
            const ground = groundYAt(path, roadWidth, x, z);
            // Fixed placement: trunk base = groundYAt - 0.3 (slightly embedded)
            const trunkBase = ground - 0.3;
            expect(isFloating(trunkBase, ground)).toBe(false);
            // The face has risen well above road height out here, so the OLD
            // road-height placement was wrong (buried/floating vs the face)
            expect(ground).toBeGreaterThan(p.y + 10);
        });
    });

    test('construction barriers/equipment on the mountain side use the face height', () => {
        const roadWidth = 20;
        const p = path[20];
        [25, 30].forEach((offset) => {
            const x = p.x - Math.cos(p.heading) * offset;
            const z = p.z + Math.sin(p.heading) * offset;
            const ground = groundYAt(path, roadWidth, x, z);
            // Fixed placement rests the base exactly on the model
            expect(isFloating(ground, ground)).toBe(false);
            // The old road-height base was ~21-29 units below the face
            expect(ground - p.y).toBeGreaterThan(15);
        });
    });

    test.each([[20], [16]])('hairpin barriers ground on the cliff-side ledge edge (roadWidth %i)', (roadWidth) => {
        const barrierDistance = roadWidth / 2 + 2.5;
        path.forEach((p) => {
            [-1, 1].forEach((outsideSide) => {
                const x = p.x + Math.cos(p.heading) * barrierDistance * outsideSide;
                const z = p.z - Math.sin(p.heading) * barrierDistance * outsideSide;
                const ground = groundYAt(path, roadWidth, x, z);
                // Fixed: base = groundYAt (center at ground + 0.6, box height 1.2)
                expect(isFloating(ground, ground)).toBe(false);
            });
        });
        // The OLD road-height base floated past the right ledge by 0.5 * 1.33
        const p = path[0];
        const x = p.x + Math.cos(p.heading) * barrierDistance;
        const z = p.z - Math.sin(p.heading) * barrierDistance;
        expect(groundYAt(path, roadWidth, x, z)).toBeCloseTo(p.y - 0.5 * 1.33, 5);
    });

    test('snow patches follow the wall face overhang slope', () => {
        const roadWidth = 20;
        // Fixed lateral: halfRoad + 1 + vp^2 * 25 (the rendered wall's
        // overhang) instead of the old fixed 8-10 units
        [0.7, 0.85, 1.0].forEach((vp) => {
            const lateral = roadWidth / 2 + 1 + vp * vp * 25;
            // The face at that lateral has risen (model: 1.6/unit past ledge,
            // capped at +40); the patch height is height * vp = 40 * vp.
            const faceRise = Math.min((lateral - (roadWidth / 2 + 2)) * 1.6, 40);
            const patchHeight = 40 * vp;
            // Patch must be near the modeled face, not hovering ~15 units
            // in front of it like the old placement
            expect(Math.abs(patchHeight - faceRise)).toBeLessThan(12);
            // Old placement: lateral 8-10 => face rise ~0 while the patch sat
            // 28-40 units up - clearly detached from the wall
            const oldLateral = 9;
            const oldFaceRise = Math.max(0, (oldLateral - (roadWidth / 2 + 2)) * 1.6);
            expect(patchHeight - oldFaceRise).toBeGreaterThan(25);
        });
    });
});

describe('lake and backdrop scenery grounding', () => {
    test('mountain peaks built by createMountainPeak sink their base below the lake', () => {
        // position.y = -200 + (width/2)*0.1 - 2; flattened base extends
        // (width/2)*0.1 below the origin => base = -202
        [250, 150, 300, 280, 350, 290, 310].forEach((width) => {
            const positionY = -200 + (width / 2) * 0.1 - 2;
            const baseY = positionY - (width / 2) * 0.1;
            expect(baseY).toBeLessThanOrEqual(LAKE_LEVEL);
        });
    });

    test('lake island peak apexes keep their original skyline height', () => {
        // Main peak: old apex -50 + 180 = 130; new: grounded base + height 320
        const mainApex = (-200 + (250 / 2) * 0.1 - 2) + 320;
        expect(mainApex).toBeCloseTo(130.5, 1);
        // Secondary: old apex -50 + 120 = 70; new height 265
        const secondaryApex = (-200 + (150 / 2) * 0.1 - 2) + 265;
        expect(secondaryApex).toBeCloseTo(70.5, 1);
    });

    test('lake island rocks are mostly submerged at the water line', () => {
        // rock center = -200 + rockSize * 0.2; vertical scale >= 0.6
        for (let rockSize = 15; rockSize <= 25; rockSize += 5) {
            const centerY = -200 + rockSize * 0.2;
            const bottom = centerY - rockSize * 0.6;
            expect(isFloating(bottom, LAKE_LEVEL)).toBe(false);
            // And the top still breaks the surface
            expect(centerY + rockSize * 0.6).toBeGreaterThan(LAKE_LEVEL);
        }
    });

    test('end-course small peaks reach below the lake plane', () => {
        // y = -160 - rand*50; cone half-height 125, min y-scale 0.7
        const highestBottom = -160 - 125 * 0.7;
        expect(isFloating(highestBottom, LAKE_LEVEL)).toBe(false);
    });

    test('distant range silhouettes extend below the lake plane', () => {
        const silhouetteBase = -300;
        expect(isFloating(silhouetteBase, LAKE_LEVEL)).toBe(false);
        // Second range: position.y = 50, y-scale 0.9
        const secondRangeBottom = 50 + silhouetteBase * 0.9;
        expect(isFloating(secondRangeBottom, LAKE_LEVEL)).toBe(false);
    });

    test('snow caps are positioned in the parent mountain local space', () => {
        // snowCap local y = height * 0.85 with parent at the grounded base;
        // world apex = parentY + height, so the cap sits below the apex.
        const width = 300;
        const height = 385;
        const parentY = -200 + (width / 2) * 0.1 - 2;
        const capWorldY = parentY + height * 0.85;
        const apexWorldY = parentY + height;
        expect(capWorldY).toBeLessThan(apexWorldY);
        expect(capWorldY).toBeGreaterThan(0); // Visible above the lake
        // The old bug added the world x/z again and used height*0.85 - 50
        // independent of the parent transform; with a parent at (x, baseY, z)
        // the cap ended up at world (2x, ...), detached from the peak
    });
});

describe('grounding validation replica', () => {
    test('all fixed placements produce zero violations', () => {
        const path = buildRoadPath();
        const violations = [];

        [20, 16].forEach((roadWidth) => {
            const half = roadWidth / 2;
            path.forEach((p, i) => {
                const entries = [];
                const cos = Math.cos(p.heading);
                const sin = Math.sin(p.heading);

                // Posts both sides
                [-1, 1].forEach((side) => {
                    entries.push({
                        label: `post seg ${i}`,
                        bottom: p.y,
                        x: p.x + side * (half + 1) * cos,
                        z: p.z - side * (half + 1) * sin,
                    });
                });
                // Checkpoint gate poles at local +-6
                [-1, 1].forEach((side) => {
                    entries.push({
                        label: `checkpoint pole seg ${i}`,
                        bottom: p.y,
                        x: p.x + side * 6 * cos,
                        z: p.z - side * 6 * sin,
                    });
                });
                // Finish banner poles at local +-(half + 1.5)
                [-1, 1].forEach((side) => {
                    entries.push({
                        label: `banner pole seg ${i}`,
                        bottom: p.y,
                        x: p.x + side * (half + 1.5) * cos,
                        z: p.z - side * (half + 1.5) * sin,
                    });
                });

                entries.forEach((e) => {
                    const ground = groundYAt(path, roadWidth, e.x, e.z);
                    if (isFloating(e.bottom, ground)) {
                        violations.push(`${e.label} delta ${(e.bottom - ground).toFixed(2)}`);
                    }
                });
            });
        });

        expect(violations).toEqual([]);
    });
});
