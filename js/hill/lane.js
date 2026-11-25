// The hill ride's lane (js/hill/ride.js): a steep cobbled lane down through a stone village, its line, its fall, its
// cobbles and what stands beside it, all as data and all from one seed, so the lane is the same on every load. Nothing
// here draws (js/hill/scene.js does); the bicycle (js/hill/bicycle.js) reads the fall and the cobbles.
//
// The lane runs from s = 0 at the top towards +z, falling all the way: from the start (the low sun to the right) a
// gentle right-hander onto the main straight, which runs straight into the sun; a left curve; a fast steeper part where
// the bicycle picks up real pace; a sharp right that cannot be taken at full speed; and a last gentle left that the
// camera watches the bicycle roll round and out of sight. Riding down it, a terrace of cottages stands on
// each side behind a strip of flags, each side seeded on its own; where a cottage cannot stand (a gap, the inside of a
// sharp turn) a low garden wall runs across instead.
class HillLane {
    static get RULE() {
        return Object.freeze({
            seed: 1973,
            lengthM: 572,
            // Where the ride starts (the lane runs on a little above it, the top of the village)
            startM: 22,
            stepM: 1,
            topY: 100,
            // The fall, as [s, grade] knots (a grade is the rise per metre: negative falls), eased between them: a gentle
            // start at the top, the first descent, the long steep straight, the sharp right flatter so it can be braked
            // for, and the last curve easing out
            grade: [[0, -0.03], [12, -0.04], [22, -0.2], [50, -0.2], [66, -0.13], [81, -0.2], [186, -0.18], [246, -0.18], [266, -0.26], [351, -0.26],
                [371, -0.08], [406, -0.07], [446, -0.06], [521, -0.04], [572, -0.02]],
            // The line: the heading (radians, + towards +x, the left) as [s, heading] knots: the start, the gentle
            // right-hander (rightHanderRad off the start), the main straight into the sun, the left curve, the fast part,
            // the sharp right (sharpRight), the last gentle left
            heading: [[0, 0], [40, 0], [66, -0.61], [186, -0.61], [246, -0.11], [376, -0.11], [394, -1.51], [436, -1.51], [521, -0.61], [572, -0.61]],
            // The parts by name, as data the tests and the light read: the main straight (the sun lies along it) and the
            // sharp right (from, to, and the tightest radius its knots give the lane's centre)
            mainStraight: { fromS: 68, toS: 184 },
            sharpRight: { fromS: 376, toS: 394, leastRadiusM: [7, 11] },
            halfWidthM: 2.8,
            // The cottages: the strip of flags before them, their widths, depth, eaves (one and two storeys) and
            // ridge, the share of gaps (with a low garden wall across) and how wide a gap is
            flagsM: 1.2, cottageWide: [5, 8.5], cottageDeepM: 6.5, eavesUpM: [3.3, 5], ridgeUpM: [2.4, 3.4], cottagesFromM: -6,
            gapShare: 0.12, gapM: [1.5, 3], lowWallUpM: 0.9,
            // Not all terraces: the share of each kind of building after the opening, the gardens a detached or
            // semi-detached one stands between (m), the share of garden walls with a gate
            // Thatch on this share of the buildings before thatchToS
            thatchToS: 240, thatchShare: 0.75,
            kinds: { terrace: 0.52, semi: 0.16, detached: 0.14, shop: 0.12, pub: 0.02, garden: 0.04 }, gardenM: [4, 9], gateShare: 0.4,
            // The church, set back behind its churchyard wall on one side: where along the lane, its frontage, how far
            // back, and its nave and tower
            church: { side: 1, fromS: 205, frontageM: 34, backM: 9, nave: [17, 8, 6, 10.5], tower: [5, 5, 15], spire: 9 },
            // The cobbles: a sett's length along and width across the lane, how high the highest crown stands (each
            // sett its own height, settLeast of that at the least)
            settLongM: 0.17, settWideM: 0.14, settUpM: 0.014, settLeast: 0.45,
            // The opening (HillRide.SHOTS.opening is this camera): the reference frame of the descent from the top, fitted
            // to its pixels (tools/terrain-check.mjs hill-overlay). camera: [s, across, up over the lane, yaw from the
            // lane's heading, pitch, vertical field of view]. The bicycle starts at startM, startAcross. Then the
            // cottages on the left as the frame has them: each [from, to, storeys, roof, wall, eaves (m over its floor),
            // ridge, chimneys as [s, top (m over its floor)]], and the pieces near the camera
            opening: {
                camera: [16.92, 1.03, 1.34, -0.126, -0.151, 26.1], startAcross: -0.25,
                left: [
                    [-6, 16, 2, 'slate', 'rubble', 5, 7.6, [[4, 9.2]]],
                    [16, 39.95, 2, 'tile', 'rubble', 5.1, 7.6, [[30, 9.2]]],
                    [39.95, 50.4, 2, 'tile', 'rubble', 5.14, 7.52, []],
                    [50.4, 60.8, 2, 'tile', 'rubble', 5.14, 7.52, [[56.6, 9.29]]],
                    [60.8, 79.05, 2, 'thatch', 'stone', 5.08, 10.5, [[66.5, 11.75], [75.75, 12.2]]],
                    [79.05, 90, 2, 'thatch', 'lime', 5.4, 10.2, []],
                    [90, 101.5, 2, 'tile', 'lime', 6.02, 12, [[96.45, 13.05]]],
                    [101.5, 112.75, 2, 'tile', 'stone', 5.6, 10.8, [[108, 12]]]
                ],
                churn: [23.25, 1.9, 0], post: [23.64, 1.75, 1.8], stones: [16, 31, 2.55],
                // The cottage on the right, in the sun's shadow: [from, to, eaves, ridge, roof, wall, set back from the flags];
                // its near top corner is where the still's dark shape has it
                right: [29.2, 37.5, 4.3, 6.6, 'thatch', 'rubble', 0], fence: [24, 44, -2.95],
                tree: [109, 18.4, 17.2, 4.2]
            },
            // The end: past stopS the camera eases over endEaseS to a fixed point high behind the bicycle (at s, across,
            // up) looking down the lane to lookS, and stays there; once the bicycle has been out of its sight for
            // hiddenS the picture fades over fadeS and the ride ends
            // The side roads: [s of the mouth's middle, side, kind, width, length, straight for, then the bend (rad), how
            // far it can be ridden (0: steps, not at all), what closes it]. None in the sharp right or the last left; the
            // wide one just before the sharp right is the escape line that is not
            sideRoads: [
                [118, -1, 'cobbled', 3.2, 34, 14, -1.2, 14, 'gate'],
                [150, 1, 'gravel', 2.6, 30, 12, 1.0, 12, 'wall'],
                [196, -1, 'steps', 1.8, 24, 10, 0.9, 0, null],
                [300, 1, 'cobbled', 3.4, 32, 15, -1.1, 15, 'yard'],
                [361, 1, 'cobbled', 5.5, 26, 9, 0.8, 10, 'gate']
            ],
            end: { stopS: 444, s: 436, across: -1, up: 5.5, lookS: 478, lookUpM: 1, endEaseS: 1.6, hiddenS: 0.4, fadeS: 1.4 },
            // Where no cottage stands: on the inside of a turn tighter than this radius
            innerRadiusM: 40,
            // At the top, on the right, a stone wall stands instead of cottages, as in the reference frames: the low sun
            // from that side comes over it and rakes across the fronts on the left. It runs to topWallToS, topWallUpM high
            topWallToS: 90, topWallUpM: 1.5
        });
    }

    constructor(rule = HillLane.RULE) {
        this.rule = rule;
        const count = Math.round(rule.lengthM / rule.stepM) + 1;
        this.points = [];
        let x = 0, y = rule.topY, z = 0;
        for (let i = 0; i < count; i++) {
            const s = i * rule.stepM;
            const heading = HillLane.knots(rule.heading, s);
            const grade = HillLane.knots(rule.grade, s);
            this.points.push({ s, x, y, z, heading, grade });
            // The next point along the heading, falling by the grade (the step is along the ground's plan)
            x += Math.sin(heading) * rule.stepM;
            z += Math.cos(heading) * rule.stepM;
            y += grade * rule.stepM;
        }
        this.bottomY = this.points[this.points.length - 1].y;
        this.walls = [];
        this.sideRoads = (rule.sideRoads || []).map(road => this.sideRoad(road));
        this.cottages = [...this.placeCottages(1), ...this.placeCottages(-1)];
        for (const road of this.sideRoads) this.lineSideRoad(road);
        // Everything a line of sight can be stopped by: the lane's buildings and those along the side roads
        this.solids = [...this.cottages, ...this.sideRoads.flatMap(road => road.houses)];
    }

    // The land (HillLand), made once on first call, and every building's foot set into it: footM under the lowest land
    // under its footprint, the church's under its nave and its tower
    ground() {
        if (this.land) return this.land;
        const land = this.land = new HillLand(this);
        const set = (c, along, hw) => land.footOf(c.x + c.alongX * along, c.z + c.alongZ * along, c.alongX, c.alongZ, hw, c.outX, c.outZ, c.hd);
        for (const c of this.solids) c.foot = Math.min(c.foot, set(c, 0, c.hw));
        if (this.church) {
            const c = this.church, T = this.rule.church.tower;
            c.foot = Math.min(c.foot, set(c, 0, c.hw), set(c, -c.hw - T[0] / 2 + 0.5, T[0] / 2));
        }
        return land;
    }

    // A side road from its data (RULE.sideRoads): its centre line every half metre from the lane's edge, straight out
    // and then bending, its mouth's span of the lane, its height at the lane's (y0)
    sideRoad([s, side, kind, wide, length, straight, bend, ride, end]) {
        const r = this.rule, p = this.sample(s);
        let x = p.x + p.leftX * side * r.halfWidthM, z = p.z + p.leftZ * side * r.halfWidthM;
        let a = Math.atan2(p.leftX * side, p.leftZ * side);
        const points = [];
        for (let d = 0; d <= length + 1e-6; d += 0.5) {
            const dirX = Math.sin(a), dirZ = Math.cos(a);
            // (across the road, the way the lane runs at the mouth)
            points.push({ d, x, z, dirX, dirZ, crossX: -side * dirZ, crossZ: side * dirX });
            x += dirX * 0.5;
            z += dirZ * 0.5;
            if (d >= straight) a += bend * 0.5 / (length - straight);
        }
        return { s, side, kind, wide, length, straight, bend, ride, end, from: s - wide / 2, to: s + wide / 2, y0: p.y, points, houses: [], walls: [] };
    }

    // A side road's centre line at `d` m in: { x, z, dirX, dirZ, crossX, crossZ }
    roadPoint(road, d) {
        const i = Math.max(0, Math.min(road.points.length - 1, Math.round(d / 0.5)));
        const p = road.points[i], extra = d - p.d;
        return { x: p.x + p.dirX * extra, z: p.z + p.dirZ * extra, dirX: p.dirX, dirZ: p.dirZ, crossX: p.crossX, crossZ: p.crossZ };
    }

    // A side road's surface height at `d` m in and `w` m across: at the mouth the lane's own edge (the lane falls
    // across the mouth), easing over mouthM to the level of the mouth's middle, so it meets the lane with no step
    roadY(road, d, w) {
        const k = Math.max(0, Math.min(1, d / HillLane.SIDE.mouthM)), e = k * k * (3 - 2 * k);
        const edge = this.sample(road.s + w).y;
        let y = edge + (road.y0 - edge) * e;
        if (road.kind === 'steps') {
            const from = this.rule.flagsM + 0.3;
            if (d > from) y += Math.min(HillLane.SIDE.stepsM, Math.ceil((d - from) / HillLane.SIDE.treadM) * HillLane.SIDE.riseM);
        }
        return y;
    }

    // The ways into the side roads, as numbers: the mouth's easing (m), a step's tread and rise (m), the steps' whole rise
    static get SIDE() { return Object.freeze({ mouthM: 5, treadM: 0.32, riseM: 0.15, stepsM: 2.4 }); }

    // The side road at (x, z), if any: { road, d, w } (in along its centre line, across it), the nearest
    sideAt(x, z, out = {}) {
        let best = null, bestGap = Infinity;
        for (const road of this.sideRoads) {
            const m = road.points[0];
            if (Math.hypot(x - m.x, z - m.z) > road.length + road.wide + 2) continue;
            for (const p of road.points) {
                const dx = x - p.x, dz = z - p.z, gap = dx * dx + dz * dz;
                if (gap >= bestGap) continue;
                const d = p.d + dx * p.dirX + dz * p.dirZ, w = dx * p.crossX + dz * p.crossZ;
                if (d < -1 || d > road.length || Math.abs(w) > road.wide / 2 + 1) continue;
                bestGap = gap;
                best = road;
                out.d = d;
                out.w = w;
            }
        }
        if (!best) return null;
        out.road = best;
        return out;
    }

    // Houses and walls along a side road, on both sides: past the lane's own corner houses a house now and then,
    // fronting the road, and walls between; a gravel track runs between garden walls, steps between houses
    lineSideRoad(road) {
        const r = this.rule;
        const rand = HillLane.random(r.seed + Math.round(road.s));
        const start = r.flagsM + r.cottageDeepM + 0.6;
        // Its first stretch, between the lane's corner buildings: walls on both sides from the flags in
        for (const sgn of [-1, 1]) road.walls.push({ side: sgn, from: r.flagsM + 0.3, to: start, hedge: false });
        for (const sgn of [-1, 1]) {
            let d = start, houses = 0;
            while (d < road.length - 2) {
                const house = road.kind !== 'gravel' && houses < 2 && rand() < (road.kind === 'steps' ? 0.8 : 0.55);
                const wide = Math.min(house ? 5 + rand() * 2 : 3 + rand() * 4, road.length - d);
                if (house && wide >= 4.5) {
                    const m = this.roadPoint(road, d + wide / 2);
                    const outX = m.crossX * sgn, outZ = m.crossZ * sgn, hd = r.cottageDeepM / 2;
                    const off = road.wide / 2 + 0.5 + hd;
                    const y = Math.min(this.roadY(road, d, 0), this.roadY(road, d + wide, 0));
                    const storeys = rand() < 0.6 ? 2 : 1;
                    const finish = this.finishes(rand, 'terrace');
                    road.houses.push({
                        side: sgn, from: d, to: d + wide, mid: d + wide / 2, wide, x: m.x + outX * off, z: m.z + outZ * off, heading: Math.atan2(m.dirX, m.dirZ),
                        alongX: m.dirX, alongZ: m.dirZ, outX, outZ, hw: wide / 2, hd, floor: y + 0.15, foot: Math.min(y, road.y0) - 0.6, kind: 'terrace', ...finish, front: 'flags',
                        storeys, eaves: y + 0.15 + r.eavesUpM[storeys - 1], ridge: y + 0.15 + r.eavesUpM[storeys - 1] + r.ridgeUpM[0] + rand() * (r.ridgeUpM[1] - r.ridgeUpM[0])
                    });
                    houses++;
                } else road.walls.push({ side: sgn, from: d, to: d + wide, hedge: road.kind === 'gravel' && rand() < 0.4 });
                d += wide;
            }
        }
    }

    // A value eased (smoothstep) between the knots either side of `s`; held flat past the ends
    static knots(list, s) {
        if (s <= list[0][0]) return list[0][1];
        for (let i = 1; i < list.length; i++) {
            const [s1, v1] = list[i];
            if (s <= s1) {
                const [s0, v0] = list[i - 1];
                const t = (s - s0) / (s1 - s0);
                return v0 + (v1 - v0) * t * t * (3 - 2 * t);
            }
        }
        return list[list.length - 1][1];
    }

    // The lane at `s` (held to its ends): its centre, heading, grade, and the unit vectors along it and to its left
    sample(s, out = {}) {
        const step = this.rule.stepM;
        const last = this.points.length - 1;
        const at = Math.max(0, Math.min(last, s / step));
        const i = Math.min(last - 1, Math.floor(at));
        const t = at - i;
        const a = this.points[i], b = this.points[i + 1];
        out.s = Math.max(0, Math.min(this.rule.lengthM, s));
        out.x = a.x + (b.x - a.x) * t;
        out.y = a.y + (b.y - a.y) * t;
        out.z = a.z + (b.z - a.z) * t;
        out.heading = a.heading + (b.heading - a.heading) * t;
        out.grade = a.grade + (b.grade - a.grade) * t;
        out.alongX = Math.sin(out.heading);
        out.alongZ = Math.cos(out.heading);
        // Left of the direction of travel (+z ahead, y up) is +x
        out.leftX = Math.cos(out.heading);
        out.leftZ = -Math.sin(out.heading);
        return out;
    }

    // The point `across` metres left of the centre at `s`, `up` metres over the lane's crown there
    at(s, across, up = 0, out = {}) {
        const p = this.sample(s);
        out.x = p.x + p.leftX * across;
        out.y = p.y + up;
        out.z = p.z + p.leftZ * across;
        return out;
    }

    // The cobbles' height over the lane's plane at `s`, `across`: the one height field the surface is drawn from and
    // the bicycle rides over (HillLane.COBBLES). The lane is laid in tiles tileM long, each mirrored along or across
    // by its own number so no repeat shows; in a tile, rows of stones, each a rounded dome of its own size, height and
    // place in its cell, deep mortar between
    cobble(s, across) {
        const C = HillLane.COBBLES, r = this.rule;
        const k = Math.floor(s / C.tileM);
        let v = s / C.tileM - k;
        let u = (across + r.halfWidthM) / (2 * r.halfWidthM);
        if (u < 0 || u > 1) return 0;
        const flip = HillLane.tileFlip(k);
        if (flip & 1) u = 1 - u;
        if (flip & 2) v = 1 - v;
        return C.upM * HillLane.field(u, v, r.halfWidthM * 2);
    }

    static get COBBLES() {
        // tileM: a tile's length (a whole number of rows); rows of it; a stone's width across (m), least and most; the
        // highest stone's crown (m); each stone's least share of its cell and of the highest height; how far its outline
        // strays from an oval (a share of its size)
        return Object.freeze({ tileM: 2, rows: 11, wideM: [0.1, 0.27], upM: 0.016, least: 0.88, leastUp: 0.45, rough: 0.12 });
    }

    // How a tile is laid: bit 1 mirrors it across, bit 2 along
    static tileFlip(k) {
        return Math.floor(HillLane.stone(k, 0, 9) * 4);
    }

    // A stone's own numbers from its row and column in the tile, each 0 to 1, the same every time
    static stone(row, col, salt) {
        let h = Math.imul(row + 101, 73856093) ^ Math.imul(col + 37, 19349663) ^ Math.imul(salt + 11, 83492791);
        h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
        return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
    }

    // The stones of a row of the tile across a lane `width` m wide: where each one's cell starts (m), kept
    static rowCells(row, width) {
        const key = `${row}:${width}`;
        const kept = HillLane.cells || (HillLane.cells = new Map());
        if (kept.has(key)) return kept.get(key);
        const C = HillLane.COBBLES;
        const starts = [];
        let x = -HillLane.stone(row, 0, 13) * C.wideM[0];
        for (let i = 0; x < width + C.wideM[1]; i++) {
            starts.push(x);
            x += C.wideM[0] + (C.wideM[1] - C.wideM[0]) * HillLane.stone(row, i, 14);
        }
        starts.push(x);
        kept.set(key, starts);
        return starts;
    }

    // The height field in a tile, 0 to 1, at (u across, v along), each 0 to 1; `width` is the lane's width (m). Each row
    // of stones is laid of its own widths; each stone fills most of its cell, its outline a rough oval of its own, its
    // crown its own height. `out`, if given, gets the row and column of the stone there (-1 in the mortar)
    static field(u, v, width, out = null) {
        const C = HillLane.COBBLES;
        const rows = C.rows, rowM = C.tileM / rows;
        const fr = v * rows, row = Math.min(rows - 1, Math.floor(fr));
        const x = u * width, y = (fr - row) * rowM;
        const starts = HillLane.rowCells(row, width);
        // The cell x is in: a binary search of the row's starts
        let lo = 0, hi = starts.length - 2;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (starts[mid] <= x) lo = mid; else hi = mid - 1;
        }
        let best = 0, bestCol = -1;
        for (const c of [lo - 1, lo, lo + 1]) {
            if (c < 0 || c >= starts.length - 1) continue;
            const w = starts[c + 1] - starts[c];
            const sx = C.least + (1 - C.least) * HillLane.stone(row, c, 1), sy = C.least + (1 - C.least) * HillLane.stone(row, c, 2);
            const ax = w * sx / 2, ay = rowM * sy / 2;
            const cx = starts[c] + w / 2 + (HillLane.stone(row, c, 4) - 0.5) * (w - 2 * ax), cy = rowM / 2 + (HillLane.stone(row, c, 5) - 0.5) * (rowM - 2 * ay);
            const dx = (x - cx) / ax, dy = (y - cy) / ay;
            // A rough outline: the oval's radius wavers round the stone
            const a = Math.atan2(dy, dx), p1 = HillLane.stone(row, c, 6) * 6.283, p2 = HillLane.stone(row, c, 7) * 6.283;
            const reach = 1 - C.rough * (0.6 * (1 + Math.sin(3 * a + p1)) / 2 + 0.4 * (1 + Math.sin(5 * a + p2)) / 2);
            const d = (dx * dx + dy * dy) / (reach * reach);
            if (d >= 1) continue;
            const height = (C.leastUp + (1 - C.leastUp) * HillLane.stone(row, c, 3)) * Math.sqrt(1 - d);
            if (height > best) {
                best = height;
                bestCol = c;
            }
        }
        if (out) {
            out.row = bestCol < 0 ? -1 : row;
            out.col = bestCol;
        }
        return best;
    }

    // The nearest place on the lane's centre line to (x, z): its s, and how far left of the centre the point is.
    // `hint` is the s of the last call (the search looks near it); writes `out`
    project(x, z, hint = null, out = {}) {
        const pts = this.points, step = this.rule.stepM;
        let from = 0, to = pts.length - 1;
        if (hint !== null && Number.isFinite(hint)) {
            const i = Math.round(hint / step);
            from = Math.max(0, i - 8);
            to = Math.min(pts.length - 1, i + 8);
        }
        let best = Infinity, at = from;
        for (let i = from; i <= to; i++) {
            const d = (x - pts[i].x) ** 2 + (z - pts[i].z) ** 2;
            if (d < best) { best = d; at = i; }
        }
        // Onto the segment either side of the nearest point
        let s = at * step, lateral = 0, bestD = Infinity;
        for (const i of [at - 1, at]) {
            if (i < 0 || i + 1 >= pts.length) continue;
            const a = pts[i], b = pts[i + 1];
            const ex = b.x - a.x, ez = b.z - a.z, l2 = ex * ex + ez * ez;
            const t = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / l2));
            const px = a.x + ex * t, pz = a.z + ez * t;
            const d = (x - px) ** 2 + (z - pz) ** 2;
            if (d < bestD) {
                bestD = d;
                s = (i + t) * step;
                // Left of the direction of travel is +x when heading +z: (cos h, -sin h)
                const h = a.heading + (b.heading - a.heading) * t;
                lateral = (x - px) * Math.cos(h) - (z - pz) * Math.sin(h);
            }
        }
        out.s = s;
        out.across = lateral;
        return out;
    }

    // The lane's radius of curve at `s` (Infinity on a straight), signed + for a turn to the left
    radiusAt(s) {
        const d = 0.5;
        const k = (HillLane.knots(this.rule.heading, s + d) - HillLane.knots(this.rule.heading, s - d)) / (2 * d);
        return Math.abs(k) < 1e-9 ? Infinity : 1 / k;
    }

    // A seeded random sequence (mulberry32): the same on every load
    static random(seed) {
        let state = seed >>> 0;
        return () => {
            state = (state + 0x6d2b79f5) >>> 0;
            let t = state;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // A building's frame on `side` from `from` to `to`, `back` m behind the frontage (a church), `deep` m deep: its
    // centre, heading, the unit vectors along the lane and away from it, its floor and its foot
    frame(side, from, to, deep, back = 0) {
        const r = this.rule;
        const mid = (from + to) / 2, p = this.sample(mid);
        const lane = Math.min(this.sample(from).y, this.sample(to).y, p.y);
        const front = r.halfWidthM + r.flagsM + back, hd = deep / 2;
        const outX = p.leftX * side, outZ = p.leftZ * side;
        return {
            side, from, to, mid, wide: to - from, x: p.x + outX * (front + hd), z: p.z + outZ * (front + hd), heading: p.heading,
            alongX: p.alongX, alongZ: p.alongZ, outX, outZ, hw: (to - from) / 2, hd, floor: p.y + 0.15, foot: lane - 0.6
        };
    }

    // A building's finishes from the seed: walls, roof, door, front, the odd porch
    finishes(rand, kind) {
        return {
            roof: ['thatch', 'thatch', 'tile', 'slate'][Math.floor(rand() * 4)],
            dormers: rand() < 0.6,
            // Grey rubble and dressed stone and whitened render, as the stills have them; brick rare
            wall: rand() < 0.05 ? 'brick' : ['rubble', 'rubble', 'dressed', 'lime', 'cream', 'rubble', 'dressed', 'lime'][Math.floor(rand() * 8)],
            quoins: rand() < 0.5,
            gable: kind === 'terrace' ? rand() < 0.15 : rand() < 0.4,
            chimney: rand() < 0.85 ? (rand() < 0.5 ? -1 : 1) : 0,
            door: kind === 'shop' ? 0.82 : 0.2 + rand() * 0.6,
            doorColour: Math.floor(rand() * 5),
            porch: kind !== 'shop' && rand() < 0.22,
            front: ['flags', 'flags', 'railing', 'garden'][Math.floor(rand() * 4)],
            pipe: rand() < 0.5 ? -1 : 1,
            lit: rand() < 0.15,
            climber: rand() < 0.22,
            boxes: rand() < 0.3,
            bay: kind === 'shop' && rand() < 0.5,
            fascia: Math.floor(rand() * 4)
        };
    }

    // The buildings along one side of the lane (`side` 1 the left, +x; -1 the right): on the left at the top the
    // opening's cottages as the reference frame has them, then terraces, semi-detached pairs and detached cottages with
    // gardens between, shops and a pub, the church set back behind its wall; on the right at the top the stone wall.
    // Each is set out here in full (HillLane.frame, finishes). Gaps (gardens, low walls, the odd gate) go to `walls`
    placeCottages(side) {
        const r = this.rule;
        const rand = HillLane.random(r.seed + (side > 0 ? 0 : 101));
        const list = [];
        const lastM = r.lengthM - 2;
        let s = r.cottagesFromM + (side > 0 ? 0 : rand() * 3);
        if (side < 0) {
            this.walls.push({ side, from: r.cottagesFromM, to: r.topWallToS, upM: r.topWallUpM, kind: 'wall' });
            s = r.topWallToS;
            // The opening's cottage on the right, behind the top wall
            const [from, to, eaves, ridge, roof, wall, back] = r.opening.right;
            const f = this.frame(side, from, to, r.cottageDeepM, back);
            list.push({ ...f, kind: 'terrace', ...this.finishes(HillLane.random(r.seed + 211), 'terrace'), front: 'flags', climber: false, storeys: 1, roof, wall, gable: false,
                eaves: f.floor + eaves, ridge: f.floor + ridge, chimney: 1, opening: true });
        } else {
            for (const [from, to, storeys, roof, wall, eaves, ridge, chimneys] of r.opening.left) {
                const f = this.frame(side, from, to, r.cottageDeepM);
                // (flags only at their fronts: the stills have no railing there)
                const finish = this.finishes(rand, 'terrace'), prev = list[list.length - 1];
                if (prev && prev.porch === finish.porch && prev.doorColour === finish.doorColour) finish.doorColour = (finish.doorColour + 1) % 5;
                list.push({ ...f, kind: 'terrace', ...finish, front: 'flags', climber: false, storeys, roof, wall, gable: false, eaves: f.floor + eaves, ridge: f.floor + ridge,
                    chimneys: chimneys.map(([cs, top]) => ({ along: cs - f.mid, top: f.floor + top })), opening: true });
            }
            s = r.opening.left[r.opening.left.length - 1][1];
        }
        const kinds = Object.entries(r.kinds);
        const pickKind = () => { let x = rand(); for (const [k, share] of kinds) { if ((x -= share) < 0) return k; } return 'terrace'; };
        const C = r.church;
        let pair = 0;
        while (s < lastM) {
            // A side road's mouth: the frontage stops short of it, a garden wall to its edge, and goes on past it
            const mouth = this.sideRoads.find(m => m.side === side && m.to > s && m.from < s + r.cottageWide[1] + 3);
            if (mouth) {
                // (a stone wall to its corner, as high as a yard's, so the mouth reads as a way in)
                if (mouth.from - s > 0.3) this.walls.push({ side, from: s, to: mouth.from, kind: 'wall', upM: 1.6 });
                s = Math.max(s, mouth.to);
                pair = 0;
                continue;
            }
            // The church, set back behind its churchyard wall with a gate
            if (side === C.side && s >= C.fromS && !this.church) {
                const to = Math.min(lastM, s + C.frontageM);
                this.walls.push({ side, from: s, to, kind: 'churchyard', gate: true, upM: 1.2 });
                this.church = { ...this.frame(side, s + 4, s + 4 + C.nave[0], C.nave[1], C.backM), kind: 'church' };
                s = to;
                continue;
            }
            let kind = pair > 0 ? 'semi' : pickKind();
            if (kind === 'garden') {
                const gap = this.upTo(side, s, r.gardenM[0] + rand() * (r.gardenM[1] - r.gardenM[0]));
                this.walls.push({ side, from: s, to: Math.min(s + gap, lastM), kind: 'garden', gate: rand() < r.gateShare });
                s += gap;
                continue;
            }
            const wide = Math.min((kind === 'pub' ? 10 : kind === 'detached' ? 7 : r.cottageWide[0]) + rand() * (r.cottageWide[1] - r.cottageWide[0]), lastM - s);
            if (wide < 3.5) break;
            // On the inside of a turn tighter than innerRadiusM no building fits: a low wall stands there instead
            if (!this.fits(s, s + wide, side)) {
                const gap = Math.min(2, lastM - s);
                this.walls.push({ side, from: s, to: s + gap, kind: 'wall' });
                s += gap;
                continue;
            }
            const storeys = rand() < 0.75 || kind === 'pub' || kind === 'shop' ? 2 : 1;
            const eaves = r.eavesUpM[storeys - 1];
            const ridge = r.ridgeUpM[0] + rand() * (r.ridgeUpM[1] - r.ridgeUpM[0]);
            const f = this.frame(side, s, s + wide, r.cottageDeepM);
            const finish = this.finishes(rand, kind);
            // Thatch over most of what the opening and the main straight see, as in the stills; tile and slate now and then
            if (f.mid < r.thatchToS && kind !== 'shop' && rand() < r.thatchShare) finish.roof = 'thatch';
            // No two neighbours alike in every finish: a like one takes another door colour
            const prev = list[list.length - 1];
            if (prev && ['wall', 'roof', 'gable', 'front', 'porch', 'doorColour'].every(k => prev[k] === finish[k])) finish.doorColour = (finish.doorColour + 1) % 5;
            list.push({ ...f, kind, ...finish, eaves: f.floor + eaves, ridge: f.floor + eaves + ridge, storeys });
            s += wide;
            // A semi-detached pair is two; a detached cottage, or the end of a pair, stands with a garden after it
            if (kind === 'semi') pair = pair > 0 ? 0 : 1;
            if (kind === 'detached' || (kind === 'semi' && pair === 0)) {
                const gap = this.upTo(side, s, r.gardenM[0] + rand() * (r.gardenM[1] - r.gardenM[0]));
                this.walls.push({ side, from: s, to: Math.min(s + gap, lastM), kind: 'garden', gate: rand() < r.gateShare });
                s += gap;
            } else if (rand() < r.gapShare) {
                const gap = this.upTo(side, s, r.gapM[0] + rand() * (r.gapM[1] - r.gapM[0]));
                this.walls.push({ side, from: s, to: Math.min(s + gap, lastM), kind: 'wall', gate: rand() < r.gateShare });
                s += gap;
            }
        }
        return list;
    }

    // A length from `s` on `side`, cut short at the next side road's mouth
    upTo(side, s, length) {
        const next = this.sideRoads.filter(m => m.side === side && m.from >= s - 1e-6).reduce((n, m) => Math.min(n, m.from), Infinity);
        return Math.max(0.01, Math.min(length, next - s));
    }

    // Whether a cottage can stand from `from` to `to` on `side`: no tight turn on its inside along it
    fits(from, to, side) {
        for (let s = from - 4; s <= to + 4; s += 1) {
            const radius = this.radiusAt(s);
            if (Number.isFinite(radius) && Math.sign(radius) === side && Math.abs(radius) < this.rule.innerRadiusM) return false;
        }
        return true;
    }

    // The cameras the lane is seen from, as points: the chase view behind the bicycle every few metres down the whole
    // ride (back and up as HillRide's follow view stands), the opening and the path the camera cranes along from it,
    // and the end's held camera
    viewpoints(everyM = 6) {
        const r = this.rule, list = [];
        for (let s = r.startM; s <= r.end.stopS + 30; s += everyM) list.push(this.at(Math.max(0, s - 8.5), 0, 3.6, {}));
        const [os, oa, ou] = r.opening.camera;
        const open = this.at(os, oa, ou, {}), chase = this.at(r.startM - 8.5, 0, 3.6, {});
        for (let k = 0; k <= 4; k++) list.push({ x: open.x + (chase.x - open.x) * k / 4, y: open.y + (chase.y - open.y) * k / 4, z: open.z + (chase.z - open.z) * k / 4 });
        list.push(this.at(r.end.s, r.end.across, r.end.up, {}));
        return list;
    }

    // Which of each cottage's back and ends the lane's cameras see (HillLane.viewpoints): a face counts when it looks
    // towards a camera and a line from the camera to a point of it passes through no other cottage. Writes c.seen as
    // { back, start, end } on every cottage; returns how many faces were seen
    seenFaces() {
        const cams = this.viewpoints();
        let count = 0;
        for (const c of this.cottages) {
            const faces = {
                back: { n: [c.outX, c.outZ], at: (u, h) => [c.x + c.alongX * u * c.hw + c.outX * c.hd, h, c.z + c.alongZ * u * c.hw + c.outZ * c.hd] },
                start: { n: [-c.alongX, -c.alongZ], at: (u, h) => [c.x - c.alongX * c.hw + c.outX * u * c.hd, h, c.z - c.alongZ * c.hw + c.outZ * u * c.hd] },
                end: { n: [c.alongX, c.alongZ], at: (u, h) => [c.x + c.alongX * c.hw + c.outX * u * c.hd, h, c.z + c.alongZ * c.hw + c.outZ * u * c.hd] }
            };
            c.seen = { back: false, start: false, end: false };
            for (const [name, f] of Object.entries(faces)) {
                for (const cam of cams) {
                    if (c.seen[name]) break;
                    const dx = cam.x - (c.x + f.n[0] * c.hd), dz = cam.z - (c.z + f.n[1] * c.hd);
                    if (dx * f.n[0] + dz * f.n[1] <= 0.5 || dx * dx + dz * dz > 120 * 120) continue;
                    for (const [u, h] of [[-0.6, 0.35], [0, 0.6], [0.6, 0.35], [0, 0.2]]) {
                        const pt = f.at(u, c.floor + (c.eaves - c.floor) * h);
                        // A little out from the face, so the face's own cottage does not hide it
                        const p = { x: pt[0] + f.n[0] * 0.05, y: pt[1], z: pt[2] + f.n[1] * 0.05 };
                        if (!this.blocks(cam, p, c)) {
                            c.seen[name] = true;
                            count++;
                            break;
                        }
                    }
                }
            }
        }
        return count;
    }

    // Whether the straight line from `a` to `b` ({ x, y, z }) passes through a cottage (its walls up to halfway up
    // its roof), `skip` aside: what the camera at the end of the ride cannot see through
    blocks(a, b, skip = null) {
        const midX = (a.x + b.x) / 2, midZ = (a.z + b.z) / 2, reach = Math.hypot(b.x - a.x, b.z - a.z) / 2 + 12;
        for (const c of this.solids || this.cottages) {
            if (c === skip || Math.abs(c.x - midX) > reach || Math.abs(c.z - midZ) > reach) continue;
            // Into the cottage's own frame: u along the lane, v away from it, y up
            const ax = a.x - c.x, az = a.z - c.z, bx = b.x - c.x, bz = b.z - c.z;
            const au = ax * c.alongX + az * c.alongZ, av = ax * c.outX + az * c.outZ;
            const bu = bx * c.alongX + bz * c.alongZ, bv = bx * c.outX + bz * c.outZ;
            const top = (c.eaves + c.ridge) / 2;
            let t0 = 0, t1 = 1;
            for (const [p, q, lo, hi] of [[au, bu, -c.hw, c.hw], [av, bv, -c.hd, c.hd], [a.y, b.y, c.foot, top]]) {
                const d = q - p;
                if (Math.abs(d) < 1e-12) {
                    if (p < lo || p > hi) { t0 = 2; break; }
                    continue;
                }
                let e0 = (lo - p) / d, e1 = (hi - p) / d;
                if (e0 > e1) [e0, e1] = [e1, e0];
                t0 = Math.max(t0, e0);
                t1 = Math.min(t1, e1);
                if (t0 > t1) break;
            }
            if (t0 <= t1) return true;
        }
        return false;
    }
}

// The land the village stands in, as data (js/hill/scene.js draws it): level with the lane along the built band on both
// sides, so the house fronts, the gardens and the walls meet it at their heights, a levelled yard behind each house and
// round the church, just under every paved surface, then out past the band the hillside: falling towards the vale on the
// sun's side, rising on the other, to low hills far off. The land is drawn as two grids, a fine one round the lane and
// its side roads and a coarse one out to the hills, and `heightAt` is the drawn surface itself (the same triangles), so
// a foot set on it is on what the camera sees
class HillLand {
    static get RULE() {
        return Object.freeze({
            // The fine grid: its cell, and how near the lane or a side road a coarse cell must come to be drawn fine (m)
            cellM: 2, reachM: 30,
            // Level with the nearest path out to bandM, then the hillside's fall eased in over easeM; the path heights are
            // blended over blendM (so the land has no crease between two paths), and lifted liftM (just under the flags)
            bandM: 20, easeM: 14, blendM: 2.5, liftM: 0.06,
            // Under a paved surface (the lane, its flags, a side road) the land stays underM below it
            underM: 0.08,
            // A levelled yard eases back into the land over padEaseM; a house's yard runs yardM behind its back
            padEaseM: 3, yardM: 8,
            // The hillside: the fall per metre towards the vale, the rise away from it; the vale lies down the main
            // straight and a little to its right (valeCross of its right)
            fall: 0.22, rise: 0.3, valeCross: 0.7,
            // The coarse grid: its size and cells (a whole number of fine cells to each)
            valeM: 2400, valeCells: 100,
            // A foot reaches footM under the lowest land under it
            footM: 0.3
        });
    }

    constructor(lane) {
        const R = HillLand.RULE, r = lane.rule;
        this.lane = lane;
        // The paths the land follows: the lane every metre and each side road every half metre, bucketed for the search
        this.paths = [];
        for (const p of lane.points) this.paths.push({ x: p.x, z: p.z, y: p.y, s: p.s });
        for (const road of lane.sideRoads) for (const p of road.points) this.paths.push({ x: p.x, z: p.z, y: lane.roadY(road, p.d, 0) });
        this.bucketM = 8;
        this.buckets = new Map();
        for (const p of this.paths) {
            const key = this.key(Math.floor(p.x / this.bucketM), Math.floor(p.z / this.bucketM));
            if (!this.buckets.has(key)) this.buckets.set(key, []);
            this.buckets.get(key).push(p);
        }
        const m = lane.sample((r.mainStraight.fromS + r.mainStraight.toS) / 2);
        const vx = m.alongX - m.leftX * R.valeCross, vz = m.alongZ - m.leftZ * R.valeCross, vl = Math.hypot(vx, vz);
        this.vale = { x: vx / vl, z: vz / vl };
        // The levelled yards: each house of the lane and of the side roads from its front to yardM behind it, at its floor;
        // the church on its footprint and a little round it
        this.pads = [];
        const pad = (c, along0, along1, out0, out1, y) => {
            // (reach2: the square of how far from its centre the yard and its easing reach)
            const reach = Math.hypot(Math.max(-along0, along1), Math.max(-out0, out1)) + R.padEaseM;
            this.pads.push({ x: c.x, z: c.z, ax: c.alongX, az: c.alongZ, ox: c.outX, oz: c.outZ, along0, along1, out0, out1, y, reach2: reach * reach });
        };
        for (const c of lane.cottages) pad(c, -c.hw, c.hw, -c.hd, c.hd + R.yardM, c.floor);
        for (const road of lane.sideRoads) for (const c of road.houses) pad(c, -c.hw, c.hw, -c.hd, c.hd + R.yardM / 2, c.floor);
        if (lane.church) {
            const c = lane.church, T = r.church.tower;
            pad(c, -c.hw - T[0] - 1.5, c.hw + 1.5, -c.hd - 1.5, c.hd + 2, c.floor);
        }
        this.buildGrids();
    }

    key(i, j) {
        return i * 100003 + j;
    }

    // The path heights blended round (x, z): { d, y, ux, uz } (the distance to the nearest path point, the blended height,
    // the blended way out from the paths), or the nearest lane point's when no path is near
    near(x, z) {
        const R = HillLand.RULE, b = this.bucketM;
        const i0 = Math.floor(x / b), j0 = Math.floor(z / b);
        // Two passes over the buckets round the point: the nearest distance, then the blend of the points near it
        const lists = [];
        let dmin2 = Infinity;
        for (let i = i0 - 3; i <= i0 + 3; i++) {
            for (let j = j0 - 3; j <= j0 + 3; j++) {
                const list = this.buckets.get(this.key(i, j));
                if (!list) continue;
                lists.push(list);
                for (const p of list) {
                    const dx = x - p.x, dz = z - p.z, d2 = dx * dx + dz * dz;
                    if (d2 < dmin2) dmin2 = d2;
                }
            }
        }
        const dmin = Math.sqrt(dmin2);
        if (dmin > 3 * b) {
            // Far out: the nearest lane point, as a coarse search
            let best = Infinity, near = this.paths[0];
            for (let k = 0; k < this.lane.points.length; k += 2) {
                const p = this.lane.points[k], dx = x - p.x, dz = z - p.z, d2 = dx * dx + dz * dz;
                if (d2 < best) { best = d2; near = p; }
            }
            best = Math.sqrt(best);
            return { d: best, y: near.y, ux: best > 1e-6 ? (x - near.x) / best : 0, uz: best > 1e-6 ? (z - near.z) / best : 0, s: near.s };
        }
        const reach = dmin + 4 * R.blendM, reach2 = reach * reach;
        let sw = 0, sy = 0, sx = 0, sz = 0, s = null, laneD = Infinity;
        for (const list of lists) {
            for (const p of list) {
                const dx = x - p.x, dz = z - p.z, d2 = dx * dx + dz * dz;
                if (d2 > reach2) continue;
                const d = Math.sqrt(d2);
                if (p.s !== undefined && d < laneD) { laneD = d; s = p.s; }
                const w = Math.exp(-(d - dmin) / R.blendM);
                sw += w;
                sy += w * p.y;
                if (d > 1e-6) {
                    sx += w * dx / d;
                    sz += w * dz / d;
                }
            }
        }
        const ul = Math.sqrt(sx * sx + sz * sz) || 1;
        return { d: dmin, y: sy / sw, ux: sx / ul, uz: sz / ul, s };
    }

    // The land's own height at (x, z), before it is drawn on a grid
    raw(x, z) {
        const R = HillLand.RULE;
        const n = this.near(x, z);
        const out = Math.max(0, n.d - R.bandM);
        let y = n.y + R.liftM * (1 - HillLand.smooth(out / R.easeM));
        if (out > 0) {
            const towards = n.ux * this.vale.x + n.uz * this.vale.z;
            const slope = towards > 0 ? -R.fall * towards : R.rise * -towards;
            const eased = out < R.easeM ? out * out / (2 * R.easeM) : out - R.easeM / 2;
            const hills = 60 * HillLand.smooth((eased * towards - 1100) / 700);
            const ripple = 3 * Math.sin(x * 0.011) * Math.cos(z * 0.009) + 1.5 * Math.sin(x * 0.031 + z * 0.017);
            y += Math.max(-70, slope * eased) + hills + ripple * HillLand.smooth(out / 60);
        }
        if (n.d > R.bandM + R.padEaseM + 12) return y;
        // The levelled yards: inside one the land is its level; within padEaseM of one it eases back
        let wmax = 0, wsum = 0, ysum = 0, inside = null;
        for (const p of this.pads) {
            const dx = x - p.x, dz = z - p.z;
            if (dx * dx + dz * dz > p.reach2) continue;
            const a = dx * p.ax + dz * p.az, o = dx * p.ox + dz * p.oz;
            const ea = Math.max(0, p.along0 - a, a - p.along1), eo = Math.max(0, p.out0 - o, o - p.out1);
            if (ea >= R.padEaseM || eo >= R.padEaseM) continue;
            const e = Math.sqrt(ea * ea + eo * eo);
            if (e >= R.padEaseM) continue;
            if (e === 0) { inside = p; break; }
            const w = HillLand.smooth(1 - e / R.padEaseM);
            wmax = Math.max(wmax, w);
            wsum += w;
            ysum += w * p.y;
        }
        if (inside) y = inside.y;
        else if (wsum > 0) y = y * (1 - wmax) + ysum / wsum * wmax;
        // Under every paved surface (the lane and its flags, a side road) and for a cell and a half round it, so no
        // drawn triangle rises through one, at the lane's own height
        const paved = this.pavedAt(x, z, 1.5 * R.cellM, true, n.s);
        if (paved !== null) y = Math.min(y, paved - R.underM);
        return y;
    }

    static smooth(t) {
        const c = Math.max(0, Math.min(1, t));
        return c * c * (3 - 2 * c);
    }

    // The coarse grid out to the hills, and the fine grid inside the coarse cells that come within reachM of the lane or
    // a side road: the fine grid's cells are cellM, a whole number to a coarse cell, so the two meet edge to edge; where
    // they meet the fine grid's edge takes the coarse grid's heights, so no gap opens between them
    buildGrids() {
        const R = HillLand.RULE, lane = this.lane, r = lane.rule;
        const mid = lane.sample(r.lengthM / 2), m = lane.sample((r.mainStraight.fromS + r.mainStraight.toS) / 2);
        const n = R.valeCells, c = R.valeM / n, k = Math.round(c / R.cellM);
        const x0 = mid.x + m.alongX * 500 - R.valeM / 2, z0 = mid.z + m.alongZ * 500 - R.valeM / 2;
        const heights = new Float32Array((n + 1) * (n + 1));
        for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) heights[i * (n + 1) + j] = this.raw(x0 + i * c, z0 + j * c);
        // A coarse cell is fine when a path point comes within reachM of it
        const covered = new Uint8Array(n * n);
        for (const p of this.paths) {
            const i0 = Math.max(0, Math.floor((p.x - R.reachM - x0) / c)), i1 = Math.min(n - 1, Math.floor((p.x + R.reachM - x0) / c));
            const j0 = Math.max(0, Math.floor((p.z - R.reachM - z0) / c)), j1 = Math.min(n - 1, Math.floor((p.z + R.reachM - z0) / c));
            for (let i = i0; i <= i1; i++) {
                for (let j = j0; j <= j1; j++) {
                    const dx = Math.max(0, x0 + i * c - p.x, p.x - x0 - (i + 1) * c), dz = Math.max(0, z0 + j * c - p.z, p.z - z0 - (j + 1) * c);
                    if (dx * dx + dz * dz <= R.reachM * R.reachM) covered[i * n + j] = 1;
                }
            }
        }
        this.coarse = { x0, z0, c, nx: n, nz: n, heights, covered };
        let ci0 = n, ci1 = -1, cj0 = n, cj1 = -1;
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                if (!covered[i * n + j]) continue;
                ci0 = Math.min(ci0, i); ci1 = Math.max(ci1, i); cj0 = Math.min(cj0, j); cj1 = Math.max(cj1, j);
            }
        }
        const nx = (ci1 - ci0 + 1) * k, nz = (cj1 - cj0 + 1) * k, f = c / k;
        const fx0 = x0 + ci0 * c, fz0 = z0 + cj0 * c;
        const drawn = new Uint8Array(nx * nz), fine = new Float32Array((nx + 1) * (nz + 1)).fill(NaN);
        const isCovered = (i, j) => i >= 0 && j >= 0 && i < n && j < n && covered[i * n + j] === 1;
        for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) if (isCovered(ci0 + Math.floor(i / k), cj0 + Math.floor(j / k))) drawn[i * nz + j] = 1;
        this.fine = { x0: fx0, z0: fz0, c: f, nx, nz, drawn, heights: fine };
        for (let i = 0; i <= nx; i++) {
            for (let j = 0; j <= nz; j++) {
                // The coarse cells round this vertex: it is on the fine grid's edge when one of them is not fine
                const ci = ci0 + Math.floor(i / k), cj = cj0 + Math.floor(j / k), oi = i % k === 0, oj = j % k === 0;
                const round = [[ci, cj], [oi ? ci - 1 : ci, cj], [ci, oj ? cj - 1 : cj], [oi ? ci - 1 : ci, oj ? cj - 1 : cj]];
                if (!round.some(([a, b]) => isCovered(a, b))) continue;
                const x = fx0 + i * f, z = fz0 + j * f;
                fine[i * (nz + 1) + j] = round.every(([a, b]) => isCovered(a, b)) ? this.raw(x, z) : HillLand.onGrid(this.coarse, x, z);
            }
        }
    }

    // The height of a grid's drawn surface in its cell (i, j): split along the diagonal from (i, j) to (i + 1, j + 1)
    static onGrid(g, x, z) {
        const fx = (x - g.x0) / g.c, fz = (z - g.z0) / g.c;
        const i = Math.floor(fx), j = Math.floor(fz);
        if (i < 0 || j < 0 || i >= g.nx || j >= g.nz) return null;
        const u = fx - i, v = fz - j, w = g.nz + 1;
        const h00 = g.heights[i * w + j], h10 = g.heights[(i + 1) * w + j], h01 = g.heights[i * w + j + 1], h11 = g.heights[(i + 1) * w + j + 1];
        return u >= v ? h00 + u * (h10 - h00) + v * (h11 - h10) : h00 + v * (h01 - h00) + u * (h11 - h01);
    }

    // The drawn land's height at (x, z): the fine grid where it is drawn, else the coarse
    heightAt(x, z) {
        const f = this.fine, i = Math.floor((x - f.x0) / f.c), j = Math.floor((z - f.z0) / f.c);
        if (i >= 0 && j >= 0 && i < f.nx && j < f.nz && f.drawn[i * f.nz + j]) return HillLand.onGrid(f, x, z);
        const y = HillLand.onGrid(this.coarse, x, z);
        return y === null ? this.raw(x, z) : y;
    }

    // The paved surface at (x, z) if one covers it, or comes within `margin` of it (the lane, its flags, a side road's
    // surface), else null; `low` gives the lane's own height under its flags, `hint` an s near the point
    pavedAt(x, z, margin = 0, low = false, hint = null) {
        const lane = this.lane, r = lane.rule;
        const at = lane.project(x, z, hint);
        if (Math.abs(at.across) <= r.halfWidthM + r.flagsM + 0.3 + margin && at.s > 0 && at.s < r.lengthM) {
            const onMouth = lane.sideRoads.some(m => Math.sign(at.across) === m.side && m.kind !== 'steps' && at.s > m.from && at.s < m.to && Math.abs(at.across) > r.halfWidthM);
            if (!onMouth) {
                const y = lane.sample(at.s).y + (!low && Math.abs(at.across) > r.halfWidthM ? 0.1 : 0);
                const road = this.roadAt(x, z, margin, low);
                return road === null ? y : Math.min(y, road);
            }
        }
        return this.roadAt(x, z, margin, low);
    }

    // The lowest side road surface at (x, z), or within `margin` of it, else null (`low` as for pavedAt)
    roadAt(x, z, margin = 0, low = false) {
        const lane = this.lane;
        let least = null;
        for (const road of lane.sideRoads) {
            const m = road.points[0];
            if (Math.hypot(x - m.x, z - m.z) > road.length + road.wide + margin + 2) continue;
            const half = road.wide / 2;
            for (const p of road.points) {
                const dx = x - p.x, dz = z - p.z;
                const along = dx * p.dirX + dz * p.dirZ, w = dx * p.crossX + dz * p.crossZ;
                // (a point of the road's centre line beside this one, and the point within the road or `margin` of it)
                if (Math.abs(along) > 0.26 && !(p.d === 0 && along < 0 && along >= -margin) && !(p === road.points[road.points.length - 1] && along > 0 && along <= margin)) continue;
                if (Math.abs(w) > half + margin) continue;
                // Over the steps, with a margin, the lowest tread in reach
                const d = Math.max(0, Math.min(road.length, p.d + along - (low && road.kind === 'steps' ? margin : 0)));
                const y = lane.roadY(road, d, Math.max(-half, Math.min(half, w)));
                if (least === null || y < least) least = y;
            }
        }
        return least;
    }

    // What a foot stands on at (x, z): the paved surface where one is, else the drawn land
    surfaceAt(x, z) {
        const paved = this.pavedAt(x, z);
        return paved === null ? this.heightAt(x, z) : Math.max(paved, this.heightAt(x, z));
    }

    // The lowest drawn land under a rectangle: centre (x, z), a half-extent `hu` along (ux, uz) and `hv` along (vx, vz),
    // sampled every `step` m and at its corners
    lowest(x, z, ux, uz, hu, vx, vz, hv, step = 0.5) {
        let least = Infinity;
        const nu = Math.max(1, Math.ceil(2 * hu / step)), nv = Math.max(1, Math.ceil(2 * hv / step));
        for (let a = 0; a <= nu; a++) {
            const s = -hu + 2 * hu * a / nu;
            for (let b = 0; b <= nv; b++) {
                const t = -hv + 2 * hv * b / nv;
                least = Math.min(least, this.heightAt(x + ux * s + vx * t, z + uz * s + vz * t));
            }
        }
        return least;
    }

    // Where a foot of that rectangle goes: footM under the lowest land under it
    footOf(x, z, ux, uz, hu, vx, vz, hv) {
        return this.lowest(x, z, ux, uz, hu, vx, vz, hv) - HillLand.RULE.footM;
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { HillLane, HillLand };
