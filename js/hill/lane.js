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
            lengthM: 600,
            // Where the ride starts (the lane runs on a little above it, the top of the village)
            startM: 22,
            stepM: 1,
            topY: 100,
            // The fall, as [s, grade] knots (a grade is the rise per metre: negative falls), eased between them: a gentle
            // start at the top, the first descent, the long steep straight, the sharp right flatter so it can be braked
            // for, and the last curve easing out
            grade: [[0, -0.03], [20, -0.05], [34, -0.15], [110, -0.14], [125, -0.2], [230, -0.18], [290, -0.16], [310, -0.23], [395, -0.23],
                [415, -0.08], [450, -0.07], [490, -0.06], [565, -0.04], [600, -0.02]],
            // The line: the heading (radians, + towards +x, the left) as [s, heading] knots: the start, the gentle
            // right-hander (rightHanderRad off the start), the main straight into the sun, the left curve, the fast part,
            // the sharp right (sharpRight), the last gentle left
            heading: [[0, 0], [30, 0], [110, -0.61], [230, -0.61], [290, -0.11], [420, -0.11], [438, -1.51], [480, -1.51], [565, -0.61], [600, -0.61]],
            // The parts by name, as data the tests and the light read: the main straight (the sun lies along it) and the
            // sharp right (from, to, and the tightest radius its knots give the lane's centre)
            mainStraight: { fromS: 112, toS: 228 },
            sharpRight: { fromS: 420, toS: 438, leastRadiusM: [7, 11] },
            halfWidthM: 2.8,
            // The cottages: the strip of flags before them, their widths, depth, eaves (one and two storeys) and
            // ridge, the share of gaps (with a low garden wall across) and how wide a gap is
            flagsM: 1.2, cottageWide: [5, 8.5], cottageDeepM: 6.5, eavesUpM: [3.3, 5], ridgeUpM: [2.4, 3.4], cottagesFromM: -6,
            gapShare: 0.12, gapM: [1.5, 3], lowWallUpM: 0.9,
            // The cobbles: a sett's length along and width across the lane, how high the highest crown stands (each
            // sett its own height, settLeast of that at the least)
            settLongM: 0.17, settWideM: 0.14, settUpM: 0.014, settLeast: 0.45,
            // The end: past stopS the camera eases over endEaseS to a fixed point high behind the bicycle (at s, across,
            // up) looking down the lane to lookS, and stays there; once the bicycle has been out of its sight for
            // hiddenS the picture fades over fadeS and the ride ends
            end: { stopS: 488, s: 480, across: -1, up: 5.5, lookS: 522, lookUpM: 1, endEaseS: 1.6, hiddenS: 0.4, fadeS: 1.4 },
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
        this.cottages = [...this.placeCottages(1), ...this.placeCottages(-1)];
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
        // tileM: a tile's length (a whole number of rows); rows of it; stone width across (m); the highest stone's
        // crown (m); each stone's least share of its cell, of the highest height, and the room it moves in its cell
        return Object.freeze({ tileM: 2, rows: 10, wideM: 0.17, upM: 0.016, least: 0.72, leastUp: 0.45, jitter: 0.5 });
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

    // The height field in a tile, 0 to 1, at (u across, v along), each 0 to 1; `width` is the lane's width (m). `out`,
    // if given, gets the row and column of the stone there (-1 in the mortar)
    static field(u, v, width, out = null) {
        const C = HillLane.COBBLES;
        const rows = C.rows, cols = Math.round(width / C.wideM);
        const fr = v * rows, row = Math.min(rows - 1, Math.floor(fr));
        const shift = row % 2 === 0 ? 0 : 0.5;
        const fc = u * cols - shift;
        const col = Math.floor(fc);
        let best = 0, bestCol = -1;
        // The stone of this cell and the ones beside it in the row (a stone stays inside its own cell)
        for (const c of [col - 1, col, col + 1]) {
            if (c < -1 || c > cols) continue;
            const a = HillLane.stone(row, c, 1), b = HillLane.stone(row, c, 2), h = HillLane.stone(row, c, 3), j1 = HillLane.stone(row, c, 4), j2 = HillLane.stone(row, c, 5);
            const sx = C.least + (1 - C.least) * a, sy = C.least + (1 - C.least) * b;
            // Its centre, moved within the room its size leaves in the cell
            const cx = c + 0.5 + (j1 - 0.5) * (1 - sx) * C.jitter * 2, cy = row + 0.5 + (j2 - 0.5) * (1 - sy) * C.jitter * 2;
            const dx = (fc - cx) / (sx / 2), dy = (fr - cy) / (sy / 2);
            const d = dx * dx + dy * dy;
            if (d >= 1) continue;
            const height = (C.leastUp + (1 - C.leastUp) * h) * Math.sqrt(1 - d);
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

    // The cottages along one side of the lane (`side` 1 the left, +x; -1 the right), end to end with now and then a
    // gap with a low wall across it. Each cottage is set out here in full: its span along the lane, its frame (centre,
    // heading, the unit vectors along it and away from the lane), its floor, foot, eaves and ridge, and its finishes
    placeCottages(side) {
        const r = this.rule;
        const rand = HillLane.random(r.seed + (side > 0 ? 0 : 101));
        const list = [];
        const lastM = r.lengthM - 2;
        let s = r.cottagesFromM + (side > 0 ? 0 : rand() * 3);
        if (side < 0) {
            this.walls.push({ side, from: r.cottagesFromM, to: r.topWallToS, upM: r.topWallUpM });
            s = r.topWallToS;
        }
        while (s < lastM) {
            const wide = Math.min(r.cottageWide[0] + rand() * (r.cottageWide[1] - r.cottageWide[0]), lastM - s);
            if (wide < 3.5) break;
            const mid = s + wide / 2;
            const p = this.sample(mid);
            // On the inside of a turn tighter than innerRadiusM no cottage fits: a low wall stands there instead
            if (!this.fits(s, s + wide, side)) {
                const gap = Math.min(2, lastM - s);
                this.walls.push({ side, from: s, to: s + gap });
                s += gap;
                continue;
            }
            const lane = Math.min(this.sample(s).y, this.sample(s + wide).y, p.y);
            const storeys = rand() < 0.75 ? 2 : 1;
            const eaves = r.eavesUpM[storeys - 1];
            const ridge = r.ridgeUpM[0] + rand() * (r.ridgeUpM[1] - r.ridgeUpM[0]);
            const front = r.halfWidthM + r.flagsM;
            const hd = r.cottageDeepM / 2;
            // Away from the lane: +left on the left side, -left on the right
            const outX = p.leftX * side, outZ = p.leftZ * side;
            const floor = p.y + 0.15;
            list.push({
                side, from: s, to: s + wide, mid, wide,
                x: p.x + outX * (front + hd), z: p.z + outZ * (front + hd), heading: p.heading,
                alongX: p.alongX, alongZ: p.alongZ, outX, outZ, hw: wide / 2, hd,
                floor, foot: lane - 0.6, eaves: floor + eaves, ridge: floor + eaves + ridge, storeys,
                roof: ['thatch', 'thatch', 'tile', 'slate'][Math.floor(rand() * 4)],
                wall: ['stone', 'honey', 'cream', 'blush', 'lime', 'stone'][Math.floor(rand() * 6)],
                quoins: rand() < 0.5,
                gable: rand() < 0.2,
                chimney: rand() < 0.85 ? (rand() < 0.5 ? -1 : 1) : 0,
                door: 0.2 + rand() * 0.6,
                doorColour: Math.floor(rand() * 5),
                porch: rand() < 0.22,
                front: ['flags', 'flags', 'railing', 'garden'][Math.floor(rand() * 4)],
                pipe: rand() < 0.5 ? -1 : 1,
                lit: rand() < 0.15
            });
            s += wide;
            if (rand() < r.gapShare) {
                const gap = r.gapM[0] + rand() * (r.gapM[1] - r.gapM[0]);
                this.walls.push({ side, from: s, to: Math.min(s + gap, lastM) });
                s += gap;
            }
        }
        return list;
    }

    // Whether a cottage can stand from `from` to `to` on `side`: no tight turn on its inside along it
    fits(from, to, side) {
        for (let s = from - 4; s <= to + 4; s += 1) {
            const radius = this.radiusAt(s);
            if (Number.isFinite(radius) && Math.sign(radius) === side && Math.abs(radius) < this.rule.innerRadiusM) return false;
        }
        return true;
    }

    // Whether the straight line from `a` to `b` ({ x, y, z }) passes through a cottage (its walls up to halfway up
    // its roof): what the camera at the end of the ride cannot see through
    blocks(a, b) {
        for (const c of this.cottages) {
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

if (typeof module !== 'undefined' && module.exports) module.exports = { HillLane };
