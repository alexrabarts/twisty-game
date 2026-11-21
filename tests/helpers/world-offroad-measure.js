// What a bike can do on a world's land, measured on a flat plane with no road (the real Vehicle, as
// tests/unit/world-offroad-bikes.test.js rides it): the land's slope and cover are given, as Vehicle.worldLand reads
// them from the drawn ground and the tile data in a ride.
//   landBike(game, [character, bike], {speed, slope, cover}) a bike held on the land
//   landTick(v, steer, throttle, brake)                       one fixed step on it
//   paceOn(game, who, cover, slope)    the speed held at full throttle after 15 s (m/s), 0 when it crashed
//   steepest(game, who)                the steepest bank BANK_M high (rise over run, to 0.05) it rides straight up
//                                      from the pace it holds on the level, at full throttle, without a crash
//   crashSpeed(game, who)              the speed over which the land crashes it
const DT = 1 / 60;
export const BANK_M = 3;

export function landBike(game, [character, model], { speed = 4, slope = 0, cover = 0 } = {}) {
    const world = game.WorldPhysics;
    const v = new game.Vehicle(new game.THREE.Scene(), null, game.CHARACTERS.find(c => c.id === character), model, { model: false });
    v.environment = {
        physics: world,
        route: { unitCount: 0, fromUnits: u => u, project: () => ({ index: -1 }), sample: () => ({ grade: 0, flags: {} }) }
    };
    // The bike's own lean limit: how far the rider dares to lean (Vehicle.leanOf) is not what is measured here
    v.leanDare = 1;
    v.speed = speed;
    v.hold = Object.freeze({ drag: 0.35, grip: world.landGrip, floorSpeed: 6 });
    v.slope = slope;
    v.cover = cover;
    // Long on the land: a version that gives the pace late (c111f28) has given it
    v.offRoadTime = 60;
    return v;
}

export function landTick(v, steer, throttle, brake) {
    const world = v.worldPhysics;
    v.runoff = v.hold;
    v.offRoadTime += DT;
    v.landAlong = v.slope;
    v.landAcross = 0;
    v.landSteep = Math.abs(v.slope);
    v.landCover = v.cover;
    v.update(DT, steer, throttle, brake, 0);
    // The land's own crashes, as Vehicle.worldLand calls them (it reads the drawn ground, which a plane has none of)
    if (v.crashed) return;
    const land = v.landValues();
    const steepMost = land.landSteepSlope !== undefined ? land.landSteepSlope : world.landSteepSlope;
    const fastMost = land.landCrashSpeed !== undefined ? land.landCrashSpeed : world.landCrashSpeed;
    v.landSteepS = Math.abs(v.slope) > steepMost ? v.landSteepS + DT : 0;
    v.landFastS = v.speed > fastMost ? v.landFastS + DT : 0;
    if (v.landSteepS >= world.landSteepS) v.worldCrash('Rode onto a slope too steep to hold');
    else if (v.landFastS >= world.landCrashS) v.worldCrash('Too fast on the grass');
}

export function paceOn(game, who, cover = 0, slope = 0, seconds = 15) {
    const v = landBike(game, who, { speed: 4, slope, cover });
    for (let i = 0; i < seconds * 60 && !v.crashed; i++) landTick(v, 0, 1, 0);
    return v.crashed ? 0 : v.speed;
}

export function steepest(game, who, height = BANK_M) {
    let best = 0;
    const pace = paceOn(game, who);
    for (let slope = 0.05; slope <= 2.5; slope += 0.05) {
        const v = landBike(game, who, { speed: pace, slope });
        let up = 0;
        for (let i = 0; i < 60 * 60 && !v.crashed && up < height && v.speed > 0.2; i++) {
            landTick(v, 0, 1, 0);
            up += v.speed * DT * slope / Math.hypot(1, slope);
        }
        if (v.crashed || up < height) break;
        best = slope;
    }
    return Math.round(best * 100) / 100;
}

// The steepest slope it climbs for as long as the slope goes on: still at 2 m/s or more after 20 s, to 0.05. This one
// is the engine's as much as the trait's (a heavy bike with more power out-climbs a lighter one with a higher trait)
export function sustained(game, who) {
    let best = 0;
    const pace = paceOn(game, who);
    for (let slope = 0.05; slope <= 2.5; slope += 0.05) {
        const v = landBike(game, who, { speed: pace, slope });
        for (let i = 0; i < 20 * 60 && !v.crashed; i++) landTick(v, 0, 1, 0);
        if (v.crashed || v.speed < 2) break;
        best = slope;
    }
    return Math.round(best * 100) / 100;
}

export function crashSpeed(game, who) {
    const v = landBike(game, who);
    const land = v.landValues();
    return land.landCrashSpeed !== undefined ? land.landCrashSpeed : v.worldPhysics.landCrashSpeed;
}

// One row of the capability table: {grass, scree, rock, forest, snow, steep, sustained, crash}
export function capability(game, who, covers = { grass: 5, scree: 4, rock: 3, forest: 1, snow: 6 }) {
    const row = {};
    for (const [name, cls] of Object.entries(covers)) row[name] = Math.round(paceOn(game, who, cls) * 100) / 100;
    row.steep = steepest(game, who);
    row.sustained = sustained(game, who);
    row.crash = Math.round(crashSpeed(game, who) * 100) / 100;
    return row;
}

// The bikes of the catalogue with a rider who has each, by the off-road trait, the most first: [{character, bike, trait}]
export function byTrait(game) {
    const list = [];
    for (const c of game.CHARACTERS) for (const id of c.bikes || []) if (!list.some(r => r.bike === id)) list.push({ character: c.id, bike: id, trait: game.Vehicle.offroadOf(id) });
    return list.sort((a, b) => b.trait - a.trait);
}
