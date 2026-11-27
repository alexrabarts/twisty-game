// Tuning: multipliers over the handling's numbers, by parameter. One table (Tuning.PARAMS) names every parameter and
// the numbers it scales; the physics reads them through this file alone, so the table is the whole list. No DOM and no
// THREE: the panel that moves the multipliers is js/tuningpanel.js, built only in debug mode.
//
// Two sources multiply into a parameter's multiplier (Tuning.of): the debug panel's (`values`, read only in debug
// mode) and a rider mode's (`mode`: js/ridermodes.js sets it with Tuning.setMode). With both at 1 nothing is
// scaled and nothing is copied: Tuning.view returns the object it was given and Tuning.field the number it was given,
// so the ride is the same to the last bit.
//
// A row: `id`, `label` (12 letters or so: the panel's column is narrow, and `hint` says the rest), `hint`, `group`,
// `min`, `max`, `step` and `scales`, the numbers it multiplies, each { on, field, inverse }:
//   on 'world'   a field of WorldPhysics, a path for a nested one ('steerKeys.keyS'). Vehicle.worldPhysics is
//                Tuning.view('world', ...), so a row over a WorldPhysics field needs no other code
//   on 'bar'     a field of Vehicle.BAR, on 'body' of Vehicle.BODY (the same way: Tuning.view)
//   on 'bike'    one of the bike's own numbers (maxSpeed, brakeForce, ...), read where it is used with
//                Vehicle.tuned(field)
//   on 'grip'    the lean's grip, 'dry' or 'wet' (Vehicle.gripTune)
//   on 'camera'  the chase camera's 'distance' or 'swing' (Game.tune)
//   inverse      the number is divided, for one where less is more (a turn radius)
const Tuning = {
    // The first line of the copied text. The format has no commit in it: ids and multipliers only
    FORMAT: 'twisty tuning v1',
    KEY: 'twistyTuning',

    PARAMS: [
        { id: 'steerRate', label: 'Lean rate', hint: 'How fast a held steer key leans the bike', group: 'Steering', min: 0.5, max: 2, step: 0.01, scales: [{ on: 'world', field: 'leanRate' }, { on: 'bike', field: 'steeringForce' }] },
        { id: 'steerFast', label: 'Steer fast', hint: 'The speed from which the lean rate falls: more keeps the steering at speed', group: 'Steering', min: 0.5, max: 2, step: 0.01, scales: [{ on: 'world', field: 'steerSpeed' }] },
        { id: 'steerSlow', label: 'Steer slow', hint: 'The turn at walking pace: more is a tighter full lock', group: 'Steering', min: 0.5, max: 1.5, step: 0.01, scales: [{ on: 'world', field: 'lockRadius', inverse: true }] },
        { id: 'pickUp', label: 'Pick-up', hint: 'How much quicker the bike is picked up than laid down', group: 'Steering', min: 0.5, max: 1.5, step: 0.01, scales: [{ on: 'world', field: 'pickUpBoost' }] },
        { id: 'selfRight', label: 'Self-righting', hint: 'How fast the bike stands up with the keys let go', group: 'Steering', min: 0, max: 2, step: 0.01, scales: [{ on: 'world', field: 'selfRighting' }] },
        { id: 'leanMax', label: 'Max lean', hint: 'The most lean the bike holds (the lowside limit moves with it)', group: 'Steering', min: 0.6, max: 1.3, step: 0.01, scales: [{ on: 'world', field: 'leanCapDeg' }, { on: 'bike', field: 'maxLeanAngle' }] },
        { id: 'steerKey', label: 'Key ease', hint: 'The ramp of a steer key, in time: more is slower', group: 'Steering', min: 0.25, max: 3, step: 0.01, scales: [{ on: 'world', field: 'steerKeys.keyS' }, { on: 'world', field: 'steerKeys.featherS' }] },

        { id: 'brake', label: 'Brake force', hint: 'The brake, front and rear as one', group: 'Brakes', min: 0.5, max: 1.5, step: 0.01, scales: [{ on: 'bike', field: 'brakeForce' }] },
        { id: 'brakeLean', label: 'Brake leaned', hint: 'The share of the brake that is left at full lean', group: 'Brakes', min: 0.5, max: 2, step: 0.01, scales: [{ on: 'world', field: 'trailBrakeFloor' }] },
        { id: 'engineBrake', label: 'Engine brake', hint: 'The engine braking with the throttle closed', group: 'Brakes', min: 0, max: 2, step: 0.01, scales: [{ on: 'world', field: 'engineBrake' }, { on: 'world', field: 'engineBrakeMax' }] },

        { id: 'accel', label: 'Acceleration', hint: 'The pull of the engine', group: 'Engine', min: 0.5, max: 1.5, step: 0.01, scales: [{ on: 'bike', field: 'acceleration' }] },
        { id: 'topSpeed', label: 'Top speed', hint: 'The top speed', group: 'Engine', min: 0.5, max: 1.5, step: 0.01, scales: [{ on: 'bike', field: 'maxSpeed' }] },
        { id: 'throttle', label: 'Throttle', hint: 'How fast the twist grip opens: more is a sharper throttle', group: 'Engine', min: 0.5, max: 2, step: 0.01, scales: [{ on: 'world', field: 'throttleRiseS', inverse: true }] },

        { id: 'gripDry', label: 'Grip dry', hint: 'The grip of the lean on a dry road', group: 'Grip', min: 0.5, max: 1.5, step: 0.01, scales: [{ on: 'grip', field: 'dry' }] },
        { id: 'gripWet', label: 'Grip wet', hint: 'The grip of the lean in rain or snow', group: 'Grip', min: 0.5, max: 1.5, step: 0.01, scales: [{ on: 'grip', field: 'wet' }] },
        { id: 'lowside', label: 'Lowside room', hint: 'How far over the grip the lean may ask before the bike lowsides', group: 'Grip', min: 0.9, max: 1.3, step: 0.01, scales: [{ on: 'world', field: 'lowsideMargin' }] },

        { id: 'assist', label: 'Assist', hint: 'The hairpin assist: the line, the edge and the advised braking', group: 'Assist', min: 0, max: 2, step: 0.01, scales: [{ on: 'world', field: 'lineStrength' }, { on: 'world', field: 'edgeLeanRate' }, { on: 'world', field: 'adviceBrake' }] },
        // Up to 1.2 only: 1 + extra must stay under lowsideMargin (WorldPhysics.edgeLean)
        { id: 'edgeLean', label: 'Edge lean', hint: 'The extra lean a bike gets when it runs wide, near the outside edge of its turn', group: 'Assist', min: 0, max: 1.2, step: 0.01, scales: [{ on: 'world', field: 'edgeLean.extra' }] },

        { id: 'wheeliePop', label: 'Wheelie pop', hint: 'How hard the wheelie key lifts the front', group: 'Wheelie', min: 0.5, max: 1.5, step: 0.01, scales: [{ on: 'bike', field: 'wheeliePopMult' }] },
        { id: 'wheelieLift', label: 'Wheelie lift', hint: 'How much the throttle holds the front up', group: 'Wheelie', min: 0.5, max: 1.5, step: 0.01, scales: [{ on: 'bike', field: 'wheelieThrottleMult' }] },

        { id: 'offroadPace', label: 'Off-road pace', hint: 'The pace on the land beside the road', group: 'Off-road', min: 0.5, max: 2, step: 0.01, scales: [{ on: 'world', field: 'landCapSpeed' }, { on: 'world', field: 'offroad.landCapSpeed' }, { on: 'world', field: 'offroad.top.landCapSpeed' }] },

        { id: 'bar', label: 'Steering bar', hint: 'The counter-steer of the drawn handlebar (drawn only)', group: 'Drawn', min: 0, max: 2, step: 0.01, scales: [{ on: 'bar', field: 'counter' }, { on: 'bar', field: 'counterMax' }, { on: 'bar', field: 'intoMax' }] },
        { id: 'body', label: 'Body lean', hint: 'How far the drawn rider leans off the bike (drawn only)', group: 'Drawn', min: 0, max: 2, step: 0.01, scales: [{ on: 'body', field: 'roll' }, { on: 'body', field: 'shift' }] },
        { id: 'camDistance', label: 'Cam distance', hint: 'The distance and height of the chase camera', group: 'Drawn', min: 0.5, max: 2, step: 0.01, scales: [{ on: 'camera', field: 'distance' }] },
        { id: 'camSwing', label: 'Cam swing', hint: 'The sideways swing of the chase camera with the lean', group: 'Drawn', min: 0, max: 2, step: 0.01, scales: [{ on: 'camera', field: 'swing' }] }
    ],

    enabled: false,     // debug mode: the only state in which `values` is read
    values: {},         // id -> multiplier, the debug panel's; an id at 1 is not in it
    mode: null,         // id -> multiplier, a rider mode's (Tuning.setMode); null is identity
    live: false,        // some multiplier is not 1: the one test on the hot paths
    version: 0,         // counts every change, so a view knows when it is stale
    views: {},
    storage: null,
    // The ride's flag: true from the first moment a debug multiplier was not 1, until the next ride begins. A ride
    // that was tuned at any moment submits no time (Game.markTuned), also after Reset
    ride: { tuned: false },

    // Debug mode turns the panel's source on and reads what it stored. Outside debug mode nothing is read: every
    // multiplier is 1 whatever the storage holds
    start({ debug = false, storage = null } = {}) {
        Tuning.enabled = !!debug;
        Tuning.storage = Tuning.enabled ? storage : null;
        Tuning.values = {};
        Tuning.ride.tuned = false;
        if (Tuning.enabled) Tuning.load();
        Tuning.changed();
    },

    row(id) {
        return Tuning.byId[id] || null;
    },

    // The effective multiplier of a parameter: the debug panel's times the rider mode's
    of(id) {
        if (!Tuning.live) return 1;
        const own = Tuning.enabled ? Tuning.values[id] : undefined;
        const mode = Tuning.mode ? Tuning.mode[id] : undefined;
        return (own === undefined ? 1 : own) * (mode === undefined ? 1 : mode);
    },

    // One number as the tuning has it: `value` itself (not value x 1) when nothing scales it
    field(on, field, value) {
        if (!Tuning.live) return value;
        const targets = Tuning.targets[on + '.' + field];
        if (!targets) return value;
        let out = value;
        for (const target of targets) {
            const m = Tuning.of(target.id);
            if (m !== 1) out = target.inverse ? out / m : out * m;
        }
        return out;
    },

    // An object of numbers as the tuning has it: `base` itself when no row over it is off 1, else a copy with the
    // scaled fields, kept until the tuning or the base changes
    view(on, base) {
        if (!Tuning.live || !base) return base;
        const kept = Tuning.views[on];
        if (kept && kept.base === base && kept.version === Tuning.version) return kept.out;
        let out = base;
        for (const row of Tuning.PARAMS) {
            const m = Tuning.of(row.id);
            if (m === 1) continue;
            for (const target of row.scales) {
                if (target.on !== on) continue;
                if (out === base) out = { ...base };
                Tuning.put(out, base, target.field.split('.'), m, target.inverse);
            }
        }
        Tuning.views[on] = { base, version: Tuning.version, out };
        return out;
    },

    // Scales the number at `path` of the copy `out`, copying each object on the way down once
    put(out, base, path, m, inverse) {
        let node = out, from = base;
        for (let i = 0; i < path.length - 1; i++) {
            const key = path[i];
            if (!from[key] || typeof from[key] !== 'object') return;
            if (node[key] === from[key]) node[key] = { ...from[key] };
            node = node[key];
            from = from[key];
        }
        const leaf = path[path.length - 1];
        if (typeof node[leaf] !== 'number') return;
        node[leaf] = inverse ? node[leaf] / m : node[leaf] * m;
    },

    // Why `value` cannot be the multiplier of `id`, or null when it can
    refusal(id, value) {
        const row = Tuning.row(id);
        if (!row) return `unknown id "${id}"`;
        if (typeof value !== 'number' || !Number.isFinite(value)) return `"${id}" is not a number`;
        if (value < row.min || value > row.max) return `"${id}" = ${value} is outside ${row.min} to ${row.max}`;
        return null;
    },

    // Sets the debug panel's multiplier of a parameter, held to the row's range and step. Throws on an unknown id
    set(id, value) {
        const row = Tuning.row(id);
        if (!row) throw new Error(`Tuning.set: unknown id "${id}"`);
        if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Tuning.set: "${id}" needs a number`);
        const stepped = Math.round(Math.max(row.min, Math.min(row.max, value)) / row.step) * row.step;
        const held = Number(stepped.toFixed(4));
        if (held === 1) delete Tuning.values[id];
        else Tuning.values[id] = held;
        Tuning.changed();
        Tuning.save();
        return held;
    },

    get(id) {
        const value = Tuning.values[id];
        return value === undefined ? 1 : value;
    },

    reset() {
        Tuning.values = {};
        Tuning.changed();
        Tuning.save();
    },

    // A rider mode's multipliers over the same ids ({ id: multiplier }), or null for none. Not a debug source: it is
    // read in every mode of the page and does not flag the ride
    setMode(multipliers) {
        if (multipliers) {
            for (const [id, value] of Object.entries(multipliers)) {
                if (!Tuning.row(id)) throw new Error(`Tuning.setMode: unknown id "${id}"`);
                if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Tuning.setMode: "${id}" needs a number`);
            }
        }
        Tuning.mode = multipliers || null;
        Tuning.changed();
    },

    changed() {
        Tuning.version++;
        Tuning.views = {};
        const own = Tuning.enabled && Object.keys(Tuning.values).length > 0;
        const mode = !!Tuning.mode && Object.values(Tuning.mode).some(value => value !== 1);
        Tuning.live = own || mode;
        if (Tuning.active()) Tuning.ride.tuned = true;
    },

    // A debug multiplier is off 1 now
    active() {
        return Tuning.enabled && Object.keys(Tuning.values).length > 0;
    },

    // A new ride: it is flagged from its start when a multiplier is off 1 already
    beginRide() {
        Tuning.ride.tuned = Tuning.active();
        return Tuning.ride.tuned;
    },

    load() {
        let stored = null;
        try {
            stored = Tuning.storage ? Tuning.storage.getItem(Tuning.KEY) : null;
        } catch (error) {
            console.warn('Tuning: the stored values could not be read:', error);
            return;
        }
        if (!stored) return;
        let parsed = null;
        try {
            parsed = JSON.parse(stored);
        } catch (error) {
            console.warn('Tuning: the stored values are not JSON and are ignored:', error);
            return;
        }
        for (const [id, value] of Object.entries(parsed || {})) {
            const refusal = Tuning.refusal(id, value);
            if (refusal) console.warn(`Tuning: stored value ignored: ${refusal}`);
            else if (value !== 1) Tuning.values[id] = value;
        }
    },

    save() {
        if (!Tuning.enabled || !Tuning.storage) return;
        try {
            Tuning.storage.setItem(Tuning.KEY, JSON.stringify(Tuning.values));
        } catch (error) {
            console.warn('Tuning: the values could not be stored:', error);
        }
    },

    // The copied text: the format's name, then a line for each multiplier that is not 1, in the table's order
    text(values = Tuning.values) {
        const lines = [Tuning.FORMAT];
        for (const row of Tuning.PARAMS) {
            if (values[row.id] !== undefined && values[row.id] !== 1) lines.push(`${row.id} = ${values[row.id].toFixed(2)}`);
        }
        return lines.join('\n');
    },

    // Reads the copied text back: { values, errors }. Every line that cannot be taken is an error with its line
    // number (a wrong first line, a line that is not `id = number`, an unknown id, a value outside the row's range,
    // an id given twice); `values` holds the lines that were good
    parse(text) {
        const values = {};
        const errors = [];
        const lines = String(text === undefined || text === null ? '' : text).split(/\r?\n/).map(line => line.trim());
        const first = lines.findIndex(line => line !== '');
        if (first < 0 || lines[first] !== Tuning.FORMAT) {
            errors.push(`line ${first < 0 ? 1 : first + 1}: the first line must be "${Tuning.FORMAT}"`);
        }
        for (let i = first < 0 ? lines.length : first + 1; i < lines.length; i++) {
            const line = lines[i];
            if (line === '') continue;
            const match = /^([A-Za-z][A-Za-z0-9]*)\s*=\s*(-?\d+(?:\.\d+)?)$/.exec(line);
            if (!match) {
                errors.push(`line ${i + 1}: "${line}" is not "id = number"`);
                continue;
            }
            const id = match[1], value = Number(match[2]);
            const refusal = Tuning.refusal(id, value);
            if (refusal) errors.push(`line ${i + 1}: ${refusal}`);
            else if (values[id] !== undefined) errors.push(`line ${i + 1}: "${id}" is given twice`);
            else values[id] = value;
        }
        return { values, errors };
    }
};

Tuning.PARAMS = Object.freeze(Tuning.PARAMS.map(row => Object.freeze({ ...row, scales: Object.freeze(row.scales.map(Object.freeze)) })));
Tuning.byId = Object.freeze(Object.fromEntries(Tuning.PARAMS.map(row => [row.id, row])));
// 'on.field' -> the rows that scale it
Tuning.targets = {};
for (const row of Tuning.PARAMS) {
    for (const target of row.scales) {
        (Tuning.targets[target.on + '.' + target.field] || (Tuning.targets[target.on + '.' + target.field] = [])).push({ id: row.id, inverse: !!target.inverse });
    }
}
