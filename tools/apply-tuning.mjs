// Prints what a pasted tuning block (the text the debug panel copies, Tuning.text) does to the defaults: for each row
// of the block, every number the row scales, its default now and the default to write. It edits no file.
//   node tools/apply-tuning.mjs block.txt      or      pbpaste | node tools/apply-tuning.mjs
// .agent/system/handling.md, "The defaults", says where each kind of number lives and how to prove the change.
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const source = name => readFileSync(new URL(`js/${name}`, root), 'utf8');
const { Tuning, WorldPhysics } = new Function(`${source('tuning.js')}\n${source('world/physics.js')}\nreturn { Tuning, WorldPhysics };`)();
const vehicle = source('vehicle.js');

const text = readFileSync(process.argv[2] || 0, 'utf8');
const { values, errors } = Tuning.parse(text);
for (const error of errors) console.error(`refused: ${error}`);
if (errors.length) process.exit(1);

const at = (object, path) => path.split('.').reduce((node, key) => (node === undefined || node === null ? undefined : node[key]), object);
const show = value => Number(value.toPrecision(12));
// The base of one of the bike's own numbers: its line in the Vehicle constructor, before the rider's multiplier
const bikeBase = (field) => {
    const match = new RegExp(`^\\s*this\\.${field} = ([^;]+);`, 'm').exec(vehicle);
    if (!match) return null;
    const value = new Function(`return (${match[1]});`)();
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
};
const WHERE = {
    world: 'js/world/physics.js',
    bike: 'js/vehicle.js, the Vehicle constructor (each rider\'s and bike\'s multiplier stays on top)',
    bar: 'js/vehicle.js, Vehicle.BAR',
    body: 'js/vehicle.js, Vehicle.BODY',
    grip: 'no default of its own: the lean\'s grip is the weather\'s and the surface\'s',
    camera: 'js/main.js, the camera modes'
};

for (const row of Tuning.PARAMS) {
    const value = values[row.id];
    if (value === undefined) continue;
    console.log(`${row.id} = ${value.toFixed(2)}  (${row.label})`);
    for (const target of row.scales) {
        const now = target.on === 'world' ? at(WorldPhysics, target.field) : target.on === 'bike' ? bikeBase(target.field) : null;
        const name = `${target.on}.${target.field}`;
        if (typeof now !== 'number') {
            console.log(`  ${name}: ${target.inverse ? 'divide' : 'multiply'} by ${value}  [${WHERE[target.on]}]`);
            continue;
        }
        const next = target.inverse ? now / value : now * value;
        console.log(`  ${name}: ${show(now)} -> ${show(next)}  [${WHERE[target.on]}]`);
    }
    // The lean limit is the rider's (Vehicle.leanOf): the row moves the table's ends, not the bike's limit
    if (row.id === 'leanMax') {
        const table = /const RIDER_LEAN = Object\.freeze\(\{[^}]*least: ([0-9.]+), most: ([0-9.]+)/.exec(vehicle);
        if (table) console.log(`  or scale the rider's lean table and leave the two fields above (as the block of 2026-11-21 was written): RIDER_LEAN least ${table[1]} -> ${show(table[1] * value)}, most ${table[2]} -> ${show(table[2] * value)}  [js/vehicle.js]`);
    }
}
if (!Object.keys(values).length) console.log('The block changes nothing: every multiplier is 1.');
