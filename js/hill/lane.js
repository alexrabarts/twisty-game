// The hill ride's lane (js/hill/ride.js): a steep cobbled lane down through a stone village, its line, its fall, its
// cobbles and what stands beside it, all as data and all from one seed, so the lane is the same on every load. Nothing
// here draws (js/hill/scene.js does); the bicycle (js/hill/bicycle.js) reads the fall and the cobbles.
//
// The lane runs from s = 0 at the top towards +z, falling all the way, and bends left (+x) near the bottom. Riding down
// it, the cottages stand on the left (+x) and the buttressed wall on the right (-x), behind a raised path with a rail.
class HillLane {
    static get RULE() {
        return Object.freeze({
            seed: 1973,
            lengthM: 210,
            // Where the ride starts (the lane runs on a little above it, the top of the village) and where it ends:
            // past endM the bicycle is braked to a stop
            startM: 22, endM: 185,
            stepM: 1,
            topY: 40,
            // The fall, as [s, grade] knots (a grade is the rise per metre: negative falls), eased between them: a gentle
            // start at the top, then steep, easing out to the flat at the bottom
            grade: [[0, -0.03], [20, -0.06], [30, -0.08], [45, -0.22], [110, -0.2], [160, -0.08], [195, -0.02], [210, 0]],
            // The bend: the heading (radians, + towards +x, the cottages' side) as [s, heading] knots
            heading: [[0, 0], [90, 0], [160, 0.5], [210, 0.5]],
            halfWidthM: 2.8,
            // The raised path on the wall's side: its width, its height over the lane, the rail's posts
            pathM: 1.8, pathUpM: 0.2, postEveryM: 2.2, railUpM: 0.9,
            // The wall: its height over the path, its buttresses (every, how far they stand out, how high they reach)
            wallUpM: 6, buttressEveryM: 10, buttressOutM: 0.9, buttressUpM: 4.6, buttressWideM: 1.1,
            // The cottages: the strip of flags before them, their widths, depth, eaves and ridge
            flagsM: 0.7, cottageWide: [5, 8], cottageDeepM: 6.5, eavesUpM: 4.6, ridgeUpM: 2.8, cottagesFromM: -4, cottagesToM: 230,
            // The cobbles: a sett's length along and width across the lane, how high its crown stands
            settLongM: 0.17, settWideM: 0.14, settUpM: 0.012
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
        this.cottages = this.placeCottages();
        this.buttresses = this.placeButtresses();
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

    // The cobbles' height over the lane's plane at `s`, `across`: each sett a low dome, the rows staggered, the joints
    // at zero. The bicycle rides over these; the surface draws the same pattern
    cobble(s, across) {
        const r = this.rule;
        const a = s / r.settLongM;
        const row = Math.floor(a);
        const b = across / r.settWideM + (row % 2 === 0 ? 0 : 0.5);
        const fa = a - row, fb = b - Math.floor(b);
        return r.settUpM * Math.sqrt(Math.max(0, Math.sin(Math.PI * fa) * Math.sin(Math.PI * fb)));
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

    // The cottages along the left of the lane, end to end: each one's span along the lane, its floor, its walls and
    // roof, and whether its gable faces the lane
    placeCottages() {
        const r = this.rule;
        const rand = HillLane.random(r.seed);
        const list = [];
        let s = r.cottagesFromM;
        while (s < r.cottagesToM) {
            const wide = r.cottageWide[0] + rand() * (r.cottageWide[1] - r.cottageWide[0]);
            const mid = s + wide / 2;
            const p = this.sample(mid);
            // A cottage stands on the lane's level at its middle; its walls go down to the lane's lowest point along it
            const low = Math.min(this.sample(s).y, this.sample(s + wide).y, p.y);
            list.push({
                from: s, to: s + wide, mid, wide,
                floor: p.y + 0.15,
                foot: low - 0.6,
                storeys: rand() < 0.75 ? 2 : 1,
                roof: rand() < 0.45 ? 'thatch' : 'tile',
                wall: ['stone', 'stone', 'lime', 'dark'][Math.floor(rand() * 4)],
                gable: rand() < 0.25,
                chimney: rand() < 0.8 ? (rand() < 0.5 ? -1 : 1) : 0,
                door: 0.2 + rand() * 0.6,
                lit: rand() < 0.2
            });
            s += wide + (rand() < 0.15 ? 1.2 + rand() * 1.5 : 0);
        }
        return list;
    }

    // The buttresses along the wall, every buttressEveryM from the top, each a little off the beat
    placeButtresses() {
        const r = this.rule;
        const rand = HillLane.random(r.seed + 7);
        const list = [];
        for (let s = 6; s < r.lengthM - 4; s += r.buttressEveryM) list.push(s + (rand() - 0.5) * 2);
        return list;
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { HillLane };
