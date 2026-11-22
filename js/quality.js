// Quality: one ladder of graphics levels, stepped by the frame time. One table (Quality.LEVELS) holds every level as
// the whole set of settings it draws with; the game applies a level through Game.applyQuality alone, so the table is the
// whole list. No DOM and no THREE. The rules are in .agent/system/graphics.md.
//
// The ladder (QualityLadder) is an object that a caller can fix at a level or release to the frame time ("Auto"): the
// tuning panel of debug mode fixes one to test, and a graphics menu sets or releases it the same way.
//
// A level's settings, each checked by Quality.FIELDS:
//   pixelRatio   the most device pixels to a CSS pixel the frame is drawn at (never more than the screen has)
//   shadowMap    the size of the sun's shadow map in texels, 0 for no shadows
//   msaa         the samples of the HDR scene target (Graphics.sceneTarget), 0 for none
//   bloom        whether the bloom passes run (the glare round the sun and bright paint)
//   treeShare    the share of each tile's trees drawn in a world ride (the rest are not drawn; a leg has its own trees)
const Quality = {
    // Lowest first: a step down is one index lower. The top is the game as it was drawn before the ladder, to the
    // last setting. The order is by the frame time saved for the look lost, as measured on a phone-class page
    // (world-quality --measure): the pixel ratio first, then the shadows and the samples, then the trees and the bloom
    LEVELS: [
        { id: 'lowest', label: 'Lowest', pixelRatio: 0.75, shadowMap: 0, msaa: 0, bloom: false, treeShare: 0.4 },
        { id: 'low', label: 'Low', pixelRatio: 1, shadowMap: 0, msaa: 0, bloom: true, treeShare: 0.6 },
        { id: 'medium', label: 'Medium', pixelRatio: 1.25, shadowMap: 1024, msaa: 0, bloom: true, treeShare: 0.8 },
        { id: 'high', label: 'High', pixelRatio: 1.5, shadowMap: 2048, msaa: 4, bloom: true, treeShare: 1 },
        { id: 'full', label: 'Full', pixelRatio: 2, shadowMap: 2048, msaa: 4, bloom: true, treeShare: 1 }
    ],

    // What each setting may be. `values`: the only ones allowed; `min`/`max`: a number in the range; `type`: a boolean.
    // `better`: which way is more look (a lower level never has more of a setting than a higher one)
    FIELDS: {
        pixelRatio: { min: 0.5, max: 2, better: 'more' },
        shadowMap: { values: [0, 512, 1024, 2048], better: 'more' },
        msaa: { values: [0, 2, 4], better: 'more' },
        bloom: { type: 'boolean', better: 'more' },
        treeShare: { min: 0.1, max: 1, better: 'more' }
    },

    // The frame time rules, in milliseconds. A frame is the time between two animation frames (what the rider sees);
    // its work is the time from the frame's start to the end of its draw call (the CPU side, which a screen at its
    // refresh rate hides). The ladder reads a window of windowMs at a time, by its median frame:
    //   down   the median over downMs for downWindows windows running: one level down
    //   up     the median at the budget (within upSlack) with its work under upWorkShare of the budget, for upWindows
    //          windows running: one level up. Up is slow and down is quick: a dropped frame costs more than a
    //          sharper one gains
    //   grace  nothing is read for changeGraceMs after a level changes (a new level compiles and settles), nor for
    //          spikeGraceMs after a frame over spikeMs or a hold (Game.adaptResolution holds it after a tile build
    //          longer than buildMs, a pause or a ride's start), so one hitch never counts as a slow window
    //   retry  a level that fails within retryMs of a step up to it is blocked from the next step up for blockMs,
    //          twice as long at each failure up to blockMaxMs: a level that is just too slow is never tried in a loop
    RULES: {
        budgetMs: 1000 / 60,
        downMs: 1000 / 48,
        upSlack: 1.1,
        upWorkShare: 0.6,
        windowMs: 1000,
        downWindows: 2,
        upWindows: 8,
        changeGraceMs: 3000,
        spikeMs: 100,
        spikeGraceMs: 2000,
        buildMs: 6,
        retryMs: 10000,
        blockMs: 60000,
        blockMaxMs: 480000
    },

    // The level a ride starts at, by the device: the first row whose every condition holds. A phone does not start at
    // the top: it is touch with a short screen side and many device pixels, and its GPU is a share of a computer's.
    // Conditions: touch (true/false), maxShortSide (CSS px), minDpr, maxCores (logical CPUs; 0 or unknown counts as
    // few), maxMemory (GB, where the browser says). `level` is a level id
    START: [
        { touch: true, maxShortSide: 500, maxCores: 4, level: 'low' },
        { touch: true, maxShortSide: 500, level: 'medium' },
        { touch: true, level: 'high' },
        { maxCores: 2, level: 'medium' },
        { maxMemory: 2, level: 'medium' },
        { level: 'full' }
    ],

    // The device as the start rows read it, from a window (or anything with the same fields)
    device(win) {
        const nav = (win && win.navigator) || {};
        const screen = (win && win.screen) || {};
        const width = Number(screen.width || (win && win.innerWidth) || 0);
        const height = Number(screen.height || (win && win.innerHeight) || 0);
        let touch = Number(nav.maxTouchPoints || 0) > 0;
        if (!touch && win && typeof win.matchMedia === 'function') {
            try {
                touch = !!win.matchMedia('(pointer: coarse)').matches;
            } catch (error) {
                console.warn('Quality: the pointer query failed:', error);
            }
        }
        return {
            touch,
            shortSide: Math.min(width, height),
            longSide: Math.max(width, height),
            dpr: Number((win && win.devicePixelRatio) || 1),
            cores: Number(nav.hardwareConcurrency || 0),
            memory: nav.deviceMemory === undefined ? null : Number(nav.deviceMemory)
        };
    },

    // The index of the start level for a device (Quality.device)
    startLevel(device, rows = Quality.START) {
        const d = device || {};
        for (const row of rows) {
            if (row.touch !== undefined && !!d.touch !== row.touch) continue;
            if (row.maxShortSide !== undefined && !(d.shortSide > 0 && d.shortSide <= row.maxShortSide)) continue;
            if (row.minDpr !== undefined && !(d.dpr >= row.minDpr)) continue;
            if (row.maxCores !== undefined && d.cores > row.maxCores) continue;
            if (row.maxMemory !== undefined && !(d.memory !== null && d.memory !== undefined && d.memory <= row.maxMemory)) continue;
            return Quality.index(row.level);
        }
        return Quality.LEVELS.length - 1;
    },

    // The index of a level id, or of a number in range; -1 for neither
    index(level) {
        if (Number.isInteger(level)) return level >= 0 && level < Quality.LEVELS.length ? level : -1;
        return Quality.LEVELS.findIndex(l => l.id === level);
    },

    // The problems of one level as a list of text, empty for a valid set of settings
    problems(level) {
        const out = [];
        if (!level || typeof level.id !== 'string' || typeof level.label !== 'string') out.push('a level needs an id and a label');
        for (const [name, rule] of Object.entries(Quality.FIELDS)) {
            const value = level ? level[name] : undefined;
            if (rule.type === 'boolean') {
                if (typeof value !== 'boolean') out.push(`${name} is not true or false`);
            } else if (rule.values) {
                if (!rule.values.includes(value)) out.push(`${name} ${value} is not one of ${rule.values.join(', ')}`);
            } else if (!(typeof value === 'number' && value >= rule.min && value <= rule.max)) {
                out.push(`${name} ${value} is not in ${rule.min} to ${rule.max}`);
            }
        }
        for (const name of Object.keys(level || {})) {
            if (!['id', 'label'].includes(name) && !Quality.FIELDS[name]) out.push(`${name} is not a setting`);
        }
        return out;
    },

    // A short text of a level for the HUD of debug mode: its number, its label and who chose it
    describe(index, fixed) {
        const level = Quality.LEVELS[index];
        return level ? `Q${index} ${level.label}${fixed ? ' (fixed)' : ' (auto)'}` : '';
    }
};

// The ladder: the level in force, by the frame time unless a caller fixed one. `apply(level, index, reason)` is called
// at once with the start level and again at every change; it is the only effect the ladder has
class QualityLadder {
    constructor({ start = Quality.LEVELS.length - 1, apply = () => {}, levels = Quality.LEVELS, rules = Quality.RULES, now = 0 } = {}) {
        this.levels = levels;
        this.rules = rules;
        this.apply = apply;
        this.auto = Math.max(0, Math.min(levels.length - 1, start));
        this.fixed = null;
        this.graceUntil = now + rules.changeGraceMs;
        this.lastUpAt = -Infinity;
        // A level's blocks: index -> { until, strikes }
        this.blocks = new Map();
        this.changes = [];
        this.clearWindow();
        this.over = 0;
        this.good = 0;
        this.apply(levels[this.level], this.level, 'start');
    }

    get level() {
        return this.fixed === null ? this.auto : this.fixed;
    }

    get isFixed() {
        return this.fixed !== null;
    }

    clearWindow(at = null) {
        this.window = { start: at, frames: [], work: [] };
    }

    // The ladder holds still until `now + ms`: nothing read in that time counts
    hold(now, ms = this.rules.spikeGraceMs) {
        this.graceUntil = Math.max(this.graceUntil, now + ms);
        this.clearWindow();
        this.over = 0;
        this.good = 0;
    }

    // A caller fixes a level (an index or an id): the frame time no longer moves it
    fix(level, now = 0) {
        const index = typeof level === 'number' ? level : this.levels.findIndex(l => l.id === level);
        if (!(index >= 0 && index < this.levels.length)) throw new Error(`Quality: no level ${level}`);
        const before = this.level;
        this.fixed = index;
        if (index !== before) this.apply(this.levels[index], index, 'fixed');
        this.hold(now, this.rules.changeGraceMs);
        return index;
    }

    // Back to the frame time ("Auto"), from the level last fixed, so a release changes nothing at once
    release(now = 0) {
        if (this.fixed === null) return this.auto;
        this.auto = this.fixed;
        this.fixed = null;
        this.hold(now, this.rules.changeGraceMs);
        return this.auto;
    }

    // One frame: `frameMs` since the last frame, `workMs` its CPU work (null when not known), at `now`. Returns
    // 'down' or 'up' when the level changed, else null
    sample(frameMs, workMs, now) {
        const r = this.rules;
        if (!(frameMs > 0)) return null;
        if (frameMs > r.spikeMs) {
            this.hold(now, r.spikeGraceMs);
            return null;
        }
        if (this.fixed !== null || now < this.graceUntil) return null;
        const w = this.window;
        if (w.start === null) w.start = now;
        w.frames.push(frameMs);
        if (Number.isFinite(workMs)) w.work.push(workMs);
        if (now - w.start < r.windowMs) return null;
        const median = list => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)];
        const frame = median(w.frames);
        const work = w.work.length ? median(w.work) : null;
        this.clearWindow(now);
        if (frame > r.downMs) {
            this.over++;
            this.good = 0;
            if (this.over >= r.downWindows && this.auto > 0) return this.step(-1, now);
        } else if (frame <= r.budgetMs * r.upSlack && (work === null || work <= r.budgetMs * r.upWorkShare)) {
            this.good++;
            this.over = 0;
            const blocked = this.blocks.get(this.auto + 1);
            if (this.good >= r.upWindows && this.auto < this.levels.length - 1 && !(blocked && now < blocked.until)) return this.step(1, now);
        } else {
            // Between the budget and the step down: the level holds
            this.over = 0;
            this.good = 0;
        }
        return null;
    }

    step(by, now) {
        const r = this.rules;
        const from = this.auto;
        if (by < 0 && now - this.lastUpAt < r.retryMs) {
            const block = this.blocks.get(from) || { until: 0, strikes: 0 };
            block.until = now + Math.min(r.blockMaxMs, r.blockMs * 2 ** block.strikes);
            block.strikes++;
            this.blocks.set(from, block);
        }
        this.auto = from + by;
        if (by > 0) this.lastUpAt = now;
        this.over = 0;
        this.good = 0;
        this.hold(now, r.changeGraceMs);
        this.changes.push({ at: now, from, to: this.auto });
        this.apply(this.levels[this.auto], this.auto, by < 0 ? 'down' : 'up');
        return by < 0 ? 'down' : 'up';
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Quality, QualityLadder };
}
