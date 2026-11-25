// Segment span that has road geometry for the current leg (the leg plus its
// run-off past the finish line)
function legSegmentRange(environment) {
    const last = environment.route.unitCount - 1;
    const start = Math.max(0, Math.min(last, environment.startSegment || 0));
    const legEnd = environment.endSegment !== undefined ? environment.endSegment : last;
    return { start, end: Math.max(start, Math.min(last, legEnd + 16)) };
}

// How world traffic takes a bend: the most sideways acceleration it corners at, the braking it plans with, and the
// most it speeds up or brakes (m/s^2); and `turnIn`, the most yaw acceleration a bend's way in may ask of it (rad/s^2:
// v^2 times the change of curvature per metre). A car corners at 2.5 m/s^2 (4.6 m/s on the 8.5 m radius of the
// outside lane of a 6 m hairpin, 3 m/s on the 3.5 m of the inside one), a rider of the crew at 4
const LANE_DRIVE = {
    car: { lateral: 2.5, plan: 2.5, accel: 2, brake: 5, turnIn: 3 },
    bike: { lateral: 4, plan: 3, accel: 3, brake: 6, turnIn: 3 }
};

// The pace of a rider of the crew by a trait of the rider (CHARACTERS `traits`, 1 to 5): a base speed in m/s, the
// random spread on top of it, and `corner`, the most sideways acceleration the rider takes a world's bend at
// (LANE_DRIVE.bike.lateral is the most of them). `skill` names the row. 5 and 1 are the crew's old quickest and slowest
// paces and 4 and 3 its old fast and average ones; the crew cornered at 4 m/s^2 whoever they were. A trait between two
// rows takes a pace between them (Traffic.paceOf).
const CREW_PACES = [
    { trait: 1, skill: 'slow', speed: 30, spread: 5, corner: 2.4 },
    { trait: 2, skill: 'steady', speed: 33, spread: 5, corner: 2.8 },
    { trait: 3, skill: 'average', speed: 36, spread: 5, corner: 3.2 },
    { trait: 4, skill: 'fast', speed: 42, spread: 6, corner: 3.6 },
    { trait: 5, skill: 'expert', speed: 48, spread: 8, corner: 4 }
];

// Contact between the bikes and the cars of a world ride (Traffic.contact, Traffic.holdForRoadworks,
// Traffic.clearRiders; .agent/system/world.md, "Contact"). Every size and threshold is here, so a new rider, bike or
// world is held with no code.
const CONTACT = {
    // A vehicle's footprint in the ground plane: its length along its heading and its width across, in metres, about
    // the model's origin (midway between a bike's wheels, between a car's axles). A bike is its 1.4 m wheelbase and
    // two 0.3 m tyres, and its bar; the car is its body. A bike of BIKE_MODELS may carry its own `contact: {length,
    // width}`. A ball about the origin, as before, was a hit 1.25 m beside a car and no hit at a bike's wheels
    boxes: { bike: { length: 2.1, width: 0.8 }, car: { length: 4.2, width: 1.9 } },
    // Two boxes meet only within this height of each other: a bike in the air over a ramp is clear of what is under it
    heightM: 1.2,
    // The player and a rider closing faster than this along the line of the contact is a crash, slower is a bump: a
    // lean on a shoulder or a nudge of a back wheel is ridden out, and 4 m/s is a bicycle's pace into a standing thing.
    // The line of the contact is the one of the rider's two axes along which the boxes are less deep in each other:
    // across the road when they met side by side (the closing speed is then the player's speed across the rider's
    // heading), along it when they met end to end (the player's speed over the rider's)
    hardMs: 4,
    bump: {
        // The share of its speed the player keeps (a knocked cone keeps 0.9: Roadworks.KNOCK_KEEP)
        keep: 0.94,
        // The roll the bump puts on the bike (rad, away from the rider) and the seconds over which it dies away
        wobble: 0.12, wobbleFadeS: 0.25,
        // One contact is one bump: for this long after one, the boxes are still held apart but nothing more is lost
        cooldownS: 0.8,
        // The rider moves this far off its lane line, away from the player, at this speed; the boxes are set this
        // far apart
        shoveM: 0.35, shoveMs: 1.5, clearM: 0.02
    },
    nudge: {
        // The most a rider is ever off its lane line (and nothing in a roadworks single lane, whose cones are close)
        mostM: 0.5,
        // It comes back at this speed, and only once the player is this far away: never toward a bike beside it
        backMs: 0.4, holdM: 6
    },
    crash: {
        // The rider that was hit keeps this share of its pace for slowS, shaking by `wobble` rad at wobbleHz, then
        // rides on. It does not go down, so it never lies in the road
        slowTo: 0.35, slowS: 2.5, wobble: 0.2, wobbleHz: 3,
        // For this long after a crash or a restart beside it the rider cannot be hit: the player's bike slides through
        // it and is not put down in it
        ghostS: 4,
        // The player's bike slides on at the rider's speed and this share of the closing speed, off the rider
        throw: 0.3
    },
    follow: {
        // The player is ahead of a vehicle in its lane when it is within this of the vehicle's lane line across the
        // road: just over one bar width, so a player passing a metre to the side is not braked for
        bandM: 0.95,
        // The hardest the player is taken to brake (m/s^2): a vehicle behind keeps the room to stop behind a player
        // who does
        playerBrake: 9,
        // It is ahead once its origin is this far up the road from the vehicle's: nearer, the two are side by side,
        // which a vehicle does not brake for (it would drop back from a bike that leans on it)
        aheadM: 1.2,
        // Near a roadworks site a player slower than this is one of the queue at the light (Roadworks.riderEntry)
        queueMs: 2
    },
    restart: {
        // A rider from backM behind to aheadM ahead of where the player is put down moves to the first free place from
        // slotM ahead, placeM apart; one up to settleM behind takes the speed its place allows; one within ghostM
        // cannot be hit for crash.ghostS
        backM: 6, aheadM: 10, slotM: 14, placeM: 8, settleM: 80, ghostM: 25
    }
};

// The group ride of a world's crew (CrewGroup below; .agent/system/group.md). Every distance, time and chance of the
// rules is here; a rider's own numbers are its CHARACTERS `group`, and a character without them rides `rider`. A leg
// has no group: its crew ride by the legs' own rules.
const GROUP = {
    // The group's pace: every rider of a world's group rides this share of the pace its traits give it (CREW_PACES), and
    // takes its bends, gathers speed and plans its braking for them at the square of it (LANE_DRIVE.bike), so the speed
    // it rides every bend at is this share too. Its hard braking (LANE_DRIVE.bike.brake, which the following rule reads
    // for the vehicle ahead) is not raised. Its `least` and `most` are shares of this pace. The square is held at
    // gripMost, about 0.9 g in a bend (LANE_DRIVE.bike lateral 4 m/s^2 times it): a quicker pace is quicker on the
    // straights and holds its bends at that. The pace alone was spent at 1.5 (the riders' mean moving speed 17.68 m/s
    // at 1.5, 18.06 at 1.6, 17.86 at 1.7 with the bends at 0.8 g); the bends at 0.9 g with 1.6 ride quicker
    pace: 1.6,
    gripMost: 2.25,
    // The hardest a rider of the group plans its braking (m/s^2), for a bend and for the vehicle ahead: under its hard
    // braking (LANE_DRIVE.bike.brake, 6), which the following rule reads for the vehicle ahead. A plan harder than the
    // brake asks for room the rider cannot stop in: it arrives too fast at a bend and at the back of the one ahead
    planMost: 5.88,
    // The share of the crew's spread of cornering (CREW_PACES corner, from LANE_DRIVE.bike.lateral down) a rider of the
    // group keeps: at 0.3 the slowest corners at 3.52 m/s^2 before the grip, not 2.4, and the quickest at 4 as before.
    // The group waited for its slowest rider in every bend: at 1 the crew without place 1 stood 35 % of the ride. The
    // riders' own spread of pace comes more from their moods (`mood`) than from their cornering
    cornerSpan: 0.3,
    // Each rider's mood: a slow random walk in [-1, 1] (a pull back to 0 over tauS, a draw within kick each tick) from
    // its own seeded stream. It moves the rider's pace by up to pace[0] + pace[1] * daring (its daring trait, 1 to 5)
    // of it, its rank in the group (the place it wants: CHARACTERS `place` less places[0] + places[1] * daring) and its
    // time gap (gap of it): a rider in a good mood rides quicker and closer and pushes forward past riders whose place
    // is ahead of its own, one in a bad mood hangs back and lets them by. Its `least` and `most` still bound its pace
    mood: { tauS: 180, kick: 0.09, start: 0.5, pace: [0.05, 0.02], places: [1.2, 0.5], gap: 0.35 },
    // Where a rider rides across its lane: never on the lane line itself. Its drift (+ toward the centre line, metres)
    // follows a target: its own wander (within wanderM of biasM, a new one every wanderS on the mean), or, within
    // followM behind another bike on its lane, a stagger: staggerM to one side of that bike, the side swapped every
    // swapS (a range). The target is held within outM toward the edge and inM toward the centre (hairpinInM in a
    // hairpin), 0 in a single lane, 0 for one that stands behind a stopped player, and toward the edge (yieldM) for one
    // being passed. The drift moves to it as a damped spring (spring, at most rateMs across), so the heading has no step
    road: { outM: 0.3, inM: 0.9, hairpinInM: 0.4, biasM: 0.25, wanderM: 0.35, wanderS: 20, followM: 45, staggerM: 0.8, swapS: [20, 60], yieldM: -0.3, spring: 0.4, rateMs: 0.35 },
    // A rider's spot in a stopping place varies around its slot (WorldPlaces.stopAt): forward by up to alongM, across
    // within the place's ground, some side by side (abreastM apart across, at the slot of the one beside it, both nearly
    // square), half turned by up to yawMax (radians) toward the kerb or away, nose in, half within squareMax of square. Each spot is drawn up to `tries` times and kept only when
    // it is inside the place (edgeM clear of the carriageway's edge, END_CLEAR_M of its ends, its outer edge), clearM
    // clear of every other rider's spot in the place, and beside or behind each of them; else the plain slot
    spot: { alongM: 0.7, abreastM: 1.2, abreast: 0.5, yawMax: 0.5, squareMax: 0.12, edgeM: 0.3, clearM: 0.35, tries: 8 },
    // The share of its pace a rider takes its bends at: its share (`factor`) to this power. At 2 a rider at 0.85 of its
    // pace took its bends at 0.72 of their grip, and the leader waiting for the back at 0.49
    bendPower: 1,
    // The row a character without `group` rides by
    rider: { gapS: 2, gapSpread: 0.4, least: 0.85, most: 1.15, wander: 0.05, spurt: null, passPerS: 0.2, stop: null },
    // The line: a rider keeps its time gap (at its own speed, and no less than gapMinM) to whoever is next ahead of it on
    // the road, a rider or the player (the player only once it is in front: frontM past the rider's front, or ahead on
    // its lane line). Each share its gap is off moves its pace by `gain` of that share, between its least and its most,
    // eased in over easeS; one that would pass the one ahead closes up to gapMinM. With nobody ahead within lookM it
    // leads, at its own pace, and waits for the back: as the last of the line on the road (a rider or the player) drops
    // from backFromM to backToM behind it, it eases to waitShare of its pace, below its least, so the front does not ride
    // away and one that stopped catches up. One with a rider ahead further off than lookM rides at its most to close up
    line: { gapMinM: 8, gain: 0.6, easeS: 2.5, lookM: 300, frontM: 4, backFromM: 250, backToM: 600, waitShare: 0.8 },
    // Every everyS a rider draws a new pace share within its `wander`, and a new gap from its `gapSpread` below its gap
    // to twice that above it; each eases in over easeS
    noise: { everyS: 9, easeS: 6 },
    // A rider decides (a spurt, a pass, a stop at a place) once a tickS, so its chances read the same at any frame rate
    tickS: 1,
    // The player stands when it crashed or is slower than stopMs, unless it queues (a vehicle standing within queueM
    // ahead of it, or a roadworks site within worksM ahead); it has stopped once it crashed or stood for stopS; it rides
    // again once faster than goMs
    player: { stopMs: 1, stopS: 3, goMs: 3, queueM: 30, worksM: 150 },
    // Riders up to behindM behind a standing player stand behind it on their lane, gapM apart origin to origin (one
    // already nearer stands where it is). One that cannot stop behind it braking at `brake` rides on
    hold: { behindM: 400, gapM: 7, brake: 5 },
    // Riders ahead of a stopped player, or more than regroupM ahead of the last rider of the line (when the player is not
    // behind it: then `ahead` holds), wait for it (for a rider, at most backMaxS): in the next stopping place on their own side of the road (env.places) past
    // the room they need to stop and leadM, within reachM; a rider takes the place a rider ahead of it waits in when that
    // is within reach. Where there is none, on the roadside. A rider moves off its lane into the place over the last
    // pullM, and has arrived within arriveM of its slot. In the place a rider follows another with slotGapM more than
    // the two halves between them (the slots are WorldPlaces.SLOT_M apart), not a queue's gap
    wait: { regroupM: 700, reachM: 1500, leadM: 15, pullM: 25, arriveM: 0.6, backMaxS: 240, slotGapM: 0 },
    // A rider more than aheadM up the road from the player pulls in at the next stopping place on its own side within
    // reachM (past the room it needs to stop) and waits there until the player is rejoin.joinM past it, or for maxS at
    // most; then it falls in behind the player and passes back toward its place as after any wait. With no place in
    // reach it eases to the player's pace on its lane (never a wait on the carriageway), and looks again each tick
    ahead: { aheadM: 350, reachM: 600, maxS: 300 },
    // Free roam (Traffic.roam): the player leads. The crew starts behind it (Traffic.gridBehind: backM behind, gapM
    // apart, place 1 nearest), follows it by the line and never passes it. A player gone off the ride (down a side
    // road: traffic reads no lead) has stopped for the group, and every rider, behind it too, waits for it in the next
    // place on its side, then falls in behind it as it comes past. (Riders gridded ahead and held to a share of the
    // player's pace stood the player and the crew still on the road: a player that follows what is ahead of it stops
    // as it stops.) A rider alongside or ahead of a riding player (within alongM behind its origin, or further on)
    // rides no faster than holdShare of its speed, so it drops behind and the player stays in front.
    roam: { backM: 14, gapM: 12, alongM: 4, holdShare: 0.9 },
    // The roadside where no place is in reach: the first straight of straightM (bends under pass.curveMax, no hairpin,
    // no roadworks) looked for every stepM; riders slotM apart, each edgeM in from the carriageway's edge
    roadside: { straightM: 40, stepM: 10, slotM: 5, edgeM: 0.5 },
    // A waiting rider pulls out once the player is joinM past its place (a rider waited for: once it, or any rider
    // whose place is behind its own, is within backM of it, so the line keeps its order; its own wait: once that is
    // over), the riders in front of it in the place have gone, and the road behind it is clear: every vehicle behind
    // further off than clearM and clearS of its speed, nobody within aheadM ahead (another rider pulling out too). It
    // moves back onto its lane over pullM. One that waits on the roadside stands in the line, so what comes up behind it
    // stands queued behind it: a vehicle behind slower than queuedMs does not hold it (it held it, and the queue behind
    // it, for good: riders waiting for the back stood there with the back queued behind them)
    rejoin: { joinM: 12, backM: 300, clearM: 20, clearS: 4, aheadM: 12, pullM: 25, queuedMs: 0.5 },
    // A pass: a rider passes the vehicle next ahead of it (within lookM) only when its own place in the group is ahead of
    // that one's (CHARACTERS `place`; the player's is its character's), it can ride gainMinMs faster than it within its
    // most (it rides up to gainMs faster), the vehicle ahead of that is roomM or more further on, no other pass is
    // within apartM, and the road is safe for the whole pass: every bend gentler than curveMax and no hairpin (kindAt
    // under hairpinMax) every stepM, no roadworks single lane in it or sightM past it, nothing coming the other way
    // within it, the distance that covers at carMs meanwhile and sightM more. Then it passes with its `passPerS` chance
    // a second. It swings swingM toward the centre line over inM, holds there until it is clearM past the other's
    // front, and swings back over inM; the other eases to `yield` of its pace meanwhile, and for letS once it sees one
    // close behind it that would pass it at the start of a straight of letM. A pass that would ride more than byMaxM
    // alongside is not started. One that meets an unsafe road while still behind swings back in; one that runs slackM
    // past its plan drops back to backM behind the other before it swings in. The player is passed only at playerMs or
    // more and on its lane line (within bandM of it)
    pass: { lookM: 35, gainMs: 6, gainMinMs: 2, roomM: 25, slackM: 60, backM: 3, apartM: 120, curveMax: 0.012, hairpinMax: 0.02, stepM: 5, carMs: 12, sightM: 60, swingM: 2.2, inM: 16, clearM: 5, yield: 0.9, letM: 100, letS: 8, byMaxM: 220, playerMs: 4, bandM: 0.6 },
    // A rider is off the road (in no line and no queue) while it stands in a place, or while its box, as its offset
    // turns it, is clearM or more clear of a bike on its lane line. One waiting on the roadside is on the road
    aside: { clearM: 0.25 }
};

// A seeded stream of draws in [0, 1) (mulberry32): the group draws from its seed, never from Math.random
function groupStream(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// The group ride of a world's crew (GROUP). Traffic steps it each frame after the following rule has set each rider's
// stopM and planM: it orders the line (the riders on the road and the player, front first), sets each rider's share of
// its own pace (`factor`), the least speed of a pass (`floorMs`), whether it stands, its offset across the road (`off`,
// eased by distance so the heading has no step), and holds a rider for a stop (stopM, planM). Each rider has its own
// seeded stream, so the same seed rides the same ride.
class CrewGroup {
    static get RULES() { return GROUP; }

    // A character's group numbers: its own, or GROUP.rider
    static riderOf(character) {
        return (character && character.group) || GROUP.rider;
    }

    // A rider's offset across the road, moved on by the metres it rode: a smootherstep from `from` to `to` over `len`,
    // so the offset, its rate and its change of rate have no step
    static advance(ride, metres) {
        const t = ride.tr;
        if (!t.active) { ride.offRate = 0; return; }
        t.at = Math.min(t.len, t.at + Math.max(0, metres));
        const x = t.len > 0 ? t.at / t.len : 1;
        ride.off = t.from + (t.to - t.from) * x * x * x * (10 - 15 * x + 6 * x * x);
        ride.offRate = t.len > 0 && x < 1 ? (t.to - t.from) * 30 * x * x * (1 - x) * (1 - x) / t.len : 0;
        if (x >= 1) t.active = false;
    }

    constructor(traffic, seed) {
        this.traffic = traffic;
        this.env = traffic.environment;
        this.seed = seed >>> 0;
        const player = CHARACTERS.find(c => c.name === traffic.playerRiderName);
        // The player's own place in the group, or none: then nobody passes it to take a place (free roam: the player leads)
        this.playerPlace = !traffic.roam && player && Number.isFinite(player.place) ? player.place : null;
        this.boxM = Traffic.sizeOf('bike').length;
        this.riders = [];
        this.entries = [];
        this.sync();
        this.playerEntry = { s: 0, speed: 0, ride: null };
        this.line = [];
        this.byS = (a, b) => b.s - a.s;
        this.stoppedS = 0;
        this.halted = false;
        this.haltS = 0;
        this.standing = false;
        this.standS = 0;
        this.lead = null;
        this.player = null;
        this.held = 0;
        this.kindSample = {};
        this.laneSample = {};
        this.stopSample = {};
        // What the group did, by kind (for the tests and a console)
        this.events = { halts: 0, holds: 0, waits: 0, roadside: 0, ownStops: 0, rejoins: 0, passes: 0, aborts: 0, spurts: 0, aheads: 0, eases: 0 };
    }

    // The group is the crew Traffic rides: a rider taken away (or added) is out of it (or in it) from the next frame
    sync() {
        const bikes = this.traffic.motorcycles;
        let same = this.riders.length === bikes.length;
        for (let i = 0; same && i < bikes.length; i++) same = this.riders[i].bike === bikes[i];
        if (same) return;
        this.riders = bikes.map((bike, i) => bike.ride && bike.ride.group === this ? bike.ride : this.join(bike, i));
        this.entries = this.riders.map(ride => ({ s: 0, speed: 0, ride }));
    }

    join(bike, i) {
        const own = CrewGroup.riderOf(bike.character);
        const random = groupStream(this.seed + Math.imul(i + 1, 0x9e3779b1));
        const ride = {
            group: this, bike, own, random, index: -1, s: 0,
            place: bike.character && Number.isFinite(bike.character.place) ? bike.character.place : 99,
            state: 'ride', why: null, factor: 1, share: 1,
            noise: 1, noiseTo: 1, gap: own.gapS, gapTo: own.gapS, noiseT: random() * GROUP.noise.everyS, tickT: random() * GROUP.tickS,
            spurtS: 0, decided: null, waitS: 0, letS: 0, waitFor: null, waitedS: 0,
            off: 0, offRate: 0, tr: { from: 0, to: 0, len: 0, at: 0, active: false },
            pass: { target: null, phase: null, startS: 0, gain: 0, planM: 0 },
            yielding: false, floorMs: 0, capMs: Infinity, stand: false, aside: false, easing: false,
            at: { s: 0, lateral: 0, y: NaN, off: 0, place: null, slot: 0, yaw: 0 }
        };
        CrewGroup.temper(ride, bike.character, random);
        bike.ride = ride;
        return ride;
    }

    // A rider's mood and its road position, drawn from its own stream (GROUP.mood, GROUP.road)
    static temper(ride, character, random) {
        const M = GROUP.mood, R = GROUP.road;
        const daring = character ? Vehicle.traitOf(character, 'daring') : 3;
        ride.mood = (2 * random() - 1) * M.start;
        ride.moodPace = M.pace[0] + M.pace[1] * daring;
        ride.moodPlaces = M.places[0] + M.places[1] * daring;
        ride.rank = ride.place;
        ride.drift = 0;
        ride.driftRate = 0;
        ride.driftShown = 0;
        ride.bias = (2 * random() - 1) * R.biasM;
        ride.wander = ride.bias;
        ride.wanderT = random() * R.wanderS;
        ride.side = random() < 0.5 ? -1 : 1;
        ride.swapT = R.swapS[0] + (R.swapS[1] - R.swapS[0]) * random();
        ride.driftTo = 0;
    }

    static ease(ride, to, len) {
        const t = ride.tr;
        t.from = ride.off;
        t.to = to;
        t.len = Math.max(0.5, len);
        t.at = 0;
        t.active = true;
    }

    // A rider put down somewhere else (a restart beside it): it rides on its lane, in no pass and no wait
    placed(ride) {
        if (ride.pass.target && ride.pass.target !== 'player') ride.pass.target.yielding = false;
        ride.pass.target = null;
        ride.pass.phase = null;
        ride.state = 'ride';
        ride.why = null;
        ride.at.place = null;
        ride.tr.active = false;
        ride.off = 0;
        ride.offRate = 0;
        ride.drift = ride.driftRate = ride.driftShown = 0;
        ride.at.yaw = 0;
        ride.aside = false;
        ride.stand = false;
    }

    // `player` the player's bike, `lead` the player as traffic reads it (Traffic.playerLead), or null
    step(dt, player, lead) {
        const route = this.env.route;
        this.sync();
        this.player = player;
        this.lead = lead && lead.direction === 1 ? lead : null;
        this.anyLead = lead;
        for (const ride of this.riders) {
            ride.s = route.fromUnits(ride.bike.currentSegment + ride.bike.segmentProgress);
            ride.bike.takePace(route);
        }
        this.watchPlayer(dt, player);
        this.order();
        this.held = 0;
        // Front first, so riders that wait together take their slots in the order they come to the place
        for (const e of this.line) if (e.ride) this.rideOn(e.ride, dt);
        for (const ride of this.riders) if (ride.index < 0) this.rideOn(ride, dt);
    }

    // The player stands (crashed, or slower than stopMs, and not in a queue): the riders behind it stop with it at
    // once. It has stopped (crashed, or standing for stopS): the riders ahead go to wait for it. Both end once it rides
    // faster than goMs
    watchPlayer(dt, player) {
        const P = GROUP.player, lead = this.lead;
        // A player who fell off the road is still where it fell along the ride; in free roam so is one gone down a side
        // road (GROUP.roam): the group waits for it there
        const away = !lead && !!this.traffic.roam && !!player && Number.isFinite(player.routeS);
        const s = lead ? lead.s : player && (player.crashed || away) && Number.isFinite(player.routeS) ? player.routeS : null;
        if (s === null || !player) {
            this.stoppedS = 0;
            this.standing = this.halted = false;
            return;
        }
        const speed = lead ? lead.speed : 0;
        this.away = away;
        if (away && !this.halted) {
            // (gone down a side road: stopped for the group at once)
            this.standing = true;
            this.standS = s;
            this.halted = true;
            this.haltS = s;
            this.events.halts++;
            return;
        }
        if (away) return;
        if (!player.crashed && speed >= P.stopMs) {
            this.standing = false;
            if (speed > P.goMs) {
                this.stoppedS = 0;
                this.halted = false;
            }
            return;
        }
        if (!this.standing) {
            if (!player.crashed && this.queued(s)) return;
            this.standing = true;
            this.standS = s;
        }
        this.stoppedS += dt;
        if (this.halted || (!player.crashed && this.stoppedS < P.stopS)) return;
        this.halted = true;
        this.haltS = s;
        this.events.halts++;
    }

    // Whether a player standing at s is in a queue: a vehicle standing on the road just ahead of it, or roadworks ahead
    queued(s) {
        const P = GROUP.player, works = this.env.roadworks, route = this.env.route;
        if (works && works.siteAhead && works.siteAhead(s, 1, P.worksM)) return true;
        for (const ride of this.riders) {
            if (!ride.aside && ride.s > s && ride.s - s < P.queueM && ride.bike.currentSpeed < GROUP.player.goMs) return true;
        }
        for (const car of this.traffic.cars) {
            const cs = route.fromUnits(car.currentSegment + car.segmentProgress);
            if (car.direction === 1 && cs > s && cs - s < P.queueM && car.currentSpeed < GROUP.player.goMs) return true;
        }
        return false;
    }

    order() {
        const line = this.line;
        line.length = 0;
        for (let i = 0; i < this.riders.length; i++) {
            const ride = this.riders[i];
            // (one that waits on the roadside stands on the carriageway's edge: it is in the line, and what comes up
            // behind it follows it and stops)
            ride.aside = (ride.state === 'wait' && !!ride.at.place) || this.offRoad(ride);
            ride.index = -1;
            if (ride.aside || !ride.bike.bikeGroup.visible) continue;
            const e = this.entries[i];
            e.s = ride.s;
            e.speed = ride.bike.currentSpeed || 0;
            line.push(e);
        }
        if (this.lead) {
            this.playerEntry.s = this.lead.s;
            this.playerEntry.speed = this.lead.speed;
            line.push(this.playerEntry);
        }
        line.sort(this.byS);
        for (let i = 0; i < line.length; i++) if (line[i].ride) line[i].ride.index = i;
    }

    // Whether a rider's box, at its offset and turned by its offset's rate, is clear of a bike on its lane line
    offRoad(ride) {
        if (ride.off === 0) return false;
        const size = Traffic.sizeOf('bike', ride.bike.model), r = Math.abs(ride.offRate), k = 1 / Math.sqrt(1 + r * r);
        const reach = size.length / 2 * r * k + size.width / 2 * k;
        return Math.abs(ride.off) - reach >= size.width / 2 + GROUP.aside.clearM;
    }

    // The metres a rider needs to stop where it plans to (LANE_DRIVE.bike.plan), and the lead in to a place
    roomOf(ride) {
        const v = ride.bike.currentSpeed || 0;
        return v * v / (2 * LANE_DRIVE.bike.plan) + GROUP.wait.leadM;
    }

    rideOn(ride, dt) {
        const G = GROUP, own = ride.own;
        ride.floorMs = 0;
        ride.stand = false;
        ride.noiseT -= dt;
        if (ride.noiseT <= 0) {
            ride.noiseT += G.noise.everyS;
            ride.noiseTo = 1 + (2 * ride.random() - 1) * own.wander;
            ride.gapTo = own.gapS * (1 + (3 * ride.random() - 1) * own.gapSpread);
        }
        const ease = Math.min(1, dt / G.noise.easeS);
        ride.noise += (ride.noiseTo - ride.noise) * ease;
        ride.gap += (ride.gapTo - ride.gap) * ease;
        if (ride.spurtS > 0) ride.spurtS = Math.max(0, ride.spurtS - dt);
        ride.tickT -= dt;
        const tick = ride.tickT <= 0;
        if (tick) {
            ride.tickT += G.tickS;
            this.moodOf(ride);
        }

        if (ride.state === 'ride') this.riding(ride, tick);
        else if (ride.state === 'hold') { if (!this.standing) ride.state = 'ride'; }
        else if (ride.state === 'toWait') this.going(ride);
        else if (ride.state === 'wait') this.waiting(ride, dt);
        else if (ride.state === 'out' && !ride.tr.active) {
            ride.state = 'ride';
            ride.why = null;
        }
        this.paceOf(ride, dt);
        this.holdOf(ride);
        this.roadOf(ride, dt, tick);
    }

    // The rider's mood walks on (GROUP.mood), and with it the place it wants in the group
    moodOf(ride) {
        const M = GROUP.mood;
        ride.mood += -ride.mood * GROUP.tickS / M.tauS + (2 * ride.random() - 1) * M.kick;
        ride.mood = Math.max(-1, Math.min(1, ride.mood));
        ride.rank = ride.place - ride.moodPlaces * ride.mood;
    }

    // The player's drift on its lane (as a rider's: + toward the centre line), or 0 with no player
    playerDrift(direction) {
        return this.lead ? this.traffic.leadOff(this.lead, direction) * -Route.keepRight(direction) : 0;
    }

    // Where the rider rides across its lane (GROUP.road): its drift follows its wander, or staggers beside the bike
    // ahead of it, held within its lane's room, and moves there as a damped spring
    roadOf(ride, dt, tick) {
        const R = GROUP.road, bike = ride.bike, route = this.env.route, works = this.env.roadworks;
        ride.wanderT -= dt;
        if (ride.wanderT <= 0) {
            ride.wanderT += R.wanderS * (0.5 + ride.random());
            ride.wander = ride.bias + (2 * ride.random() - 1) * R.wanderM;
        }
        ride.swapT -= dt;
        if (ride.swapT <= 0) {
            ride.swapT += R.swapS[0] + (R.swapS[1] - R.swapS[0]) * ride.random();
            ride.side = -ride.side;
        }
        if (tick || ride.roomIn === undefined) {
            // (looked at ahead, so the room is narrow before the hairpin or the single lane, not in it)
            const ahead = ride.s + Math.max(20, 2 * (bike.currentSpeed || 0));
            const hairpin = route.kindAt ? Math.max(route.kindAt(ride.s, this.kindSample).hairpin, route.kindAt(ahead, this.kindSample).hairpin) : 0;
            ride.roomIn = R.inM + (R.hairpinInM - R.inM) * Math.min(1, hairpin / 0.3);
            ride.single = !!works && (!!works.siteAt(ride.s, Roadworks.BLEND_M) || !!works.siteAhead(ride.s, bike.direction, ahead - ride.s));
        }
        const inM = ride.roomIn;
        let to = ride.wander;
        const i = ride.index, line = this.line;
        if (i > 0 && line[i - 1].s - ride.s < R.followM) {
            // Staggered: to its side of the bike ahead, or the other side when its own has no room
            const ahead = line[i - 1];
            const d = ahead.ride ? ahead.ride.driftShown : this.playerDrift(bike.direction);
            to = d + ride.side * R.staggerM;
            if (to > inM || to < -R.outM) to = d - ride.side * R.staggerM;
        }
        const passing = ride.pass.phase === 'out' || ride.pass.phase === 'by' || ride.pass.phase === 'back';
        if (ride.single || bike.inSingleLane || ride.state === 'hold' || passing) to = 0;
        else if (ride.yielding) to = R.yieldM;
        to = Math.max(-R.outM, Math.min(inM, to));
        ride.driftTo = to;
        const k = R.spring;
        ride.driftRate += (k * (to - ride.drift) - 2 * Math.sqrt(k) * ride.driftRate) * dt;
        // (a bike that stands does not move across)
        const most = R.rateMs * Math.min(1, (bike.currentSpeed || 0) / 2);
        ride.driftRate = Math.max(-most, Math.min(most, ride.driftRate));
        ride.drift += ride.driftRate * dt;
        // Into a stopping place and out of it the drift fades as the rider moves across to its spot
        let fade = 1;
        if ((ride.state === 'toWait' || ride.state === 'wait' || ride.state === 'out') && ride.at.off !== 0) fade = 1 - Math.max(0, Math.min(1, ride.off / ride.at.off));
        ride.driftShown = ride.drift * fade;
    }

    riding(ride, tick) {
        const G = GROUP, own = ride.own;
        const passing = ride.pass.phase === 'out' || ride.pass.phase === 'by' || ride.pass.phase === 'back';
        if (!passing) {
            if (this.halted && (ride.s > this.haltS || this.away)) return this.toWait(ride, 'player');
            if (this.standing && !this.away && ride.s < this.standS && this.standS - ride.s < G.hold.behindM) {
                // (one already closer than its gap stands where it is: holdOf)
                const v = ride.bike.currentSpeed || 0;
                if (this.standS - ride.s - 2 * Roadworks.BIKE_HALF_M - Roadworks.QUEUE_GAP_M >= v * v / (2 * G.hold.brake)) {
                    ride.state = 'hold';
                    this.events.holds++;
                    return;
                }
            }
            // Too far ahead of the player: it waits for it in the next place, or rides at its pace (GROUP.ahead)
            if (tick && this.aheadOf(ride)) return;
            // Far ahead of the last rider of the line, with the player not behind it: it waits for that rider
            const tail = this.line.length ? this.line[this.line.length - 1] : null;
            if (!this.halted && tail && tail.ride && ride.index >= 0 && tail.ride !== ride && ride.s - tail.s > G.wait.regroupM) return this.toWait(ride, 'back', null, tail.ride);
        }
        if (tick && own.spurt && ride.spurtS === 0) {
            const kind = this.env.route.kindAt ? this.env.route.kindAt(ride.s, this.kindSample) : { country: 1, mountain: 0, hairpin: 0 };
            const weight = kind.country * own.spurt.country + kind.mountain * own.spurt.mountain + kind.hairpin * own.spurt.hairpin;
            const chance = own.spurt.perKm * weight * (ride.bike.currentSpeed || 0) * G.tickS / 1000;
            if (ride.random() < chance) {
                ride.spurtS = own.spurt.seconds;
                this.events.spurts++;
            }
        }
        if (tick && own.stop && !ride.pass.phase && !this.halted && this.env.places) {
            const room = this.roomOf(ride);
            const place = this.env.places.next(ride.s + room, Route.keepRight(ride.bike.direction));
            if (place && place !== ride.decided && place.s - ride.s < room + 40) {
                ride.decided = place;
                if (ride.random() < own.stop.chance) {
                    ride.waitS = own.stop.waitS[0] + (own.stop.waitS[1] - own.stop.waitS[0]) * ride.random();
                    this.events.ownStops++;
                    return this.toWait(ride, 'own', place);
                }
            }
        }
        if (tick && !ride.pass.phase) this.tryPass(ride);
        if (tick) this.letBy(ride);
        this.passing(ride, tick);
        // (one too far ahead with no place in reach rides no faster than the player)
        if (ride.easing && this.lead && !ride.pass.phase) ride.capMs = Math.min(ride.capMs, this.lead.speed);
        // (free roam: the player leads, and none rides alongside it or on ahead of it)
        if (this.traffic.roam && this.lead && !this.halted && ride.s > this.lead.s - GROUP.roam.alongM) ride.capMs = Math.min(ride.capMs, this.lead.speed * GROUP.roam.holdShare);
    }

    // A rider more than GROUP.ahead.aheadM ahead of a riding player: off to the next place on its side within reach
    // (true), else it eases to the player's pace (ride.easing) until it is back within aheadM or a place comes in reach
    aheadOf(ride) {
        const A = GROUP.ahead, lead = this.lead;
        if (!lead || this.halted || ride.index < 0 || ride.s - lead.s <= A.aheadM) {
            ride.easing = false;
            return false;
        }
        if (!ride.pass.phase && this.book(ride, null, A.reachM)) {
            ride.easing = false;
            this.events.aheads++;
            this.toWait(ride, 'ahead', null, null, true);
            return true;
        }
        if (!ride.easing) this.events.eases++;
        ride.easing = true;
        return false;
    }

    // Off to wait: a slot in a stopping place ahead (`place`, or the next on its side), else the roadside. `booked`: the
    // slot is already aimed at (book)
    toWait(ride, why, place = null, waitFor = null, booked = false) {
        ride.state = 'toWait';
        ride.why = why;
        ride.waitFor = waitFor;
        ride.waitedS = 0;
        ride.easing = false;
        this.events.waits++;
        if (booked) return;
        ride.at.place = null;
        if (!this.book(ride, place)) this.roadside(ride);
    }

    // Aims a rider at the next free slot of a place on its own side within `reach` (`chosen`, or the place a rider ahead
    // waits in, or the next one): true when it found one
    book(ride, chosen, reach = GROUP.wait.reachM) {
        const places = this.env.places, W = GROUP.wait;
        if (!places || !places.list) return false;
        const side = Route.keepRight(ride.bike.direction);
        const from = ride.s + this.roomOf(ride);
        let place = chosen;
        if (!place) {
            // The place a rider ahead waits in or is going to, when it is in reach
            for (const other of this.riders) {
                const p = other.at.place;
                if (other === ride || !p || (other.state !== 'toWait' && other.state !== 'wait')) continue;
                if (p.s + p.length >= from && p.s - ride.s < reach && (!place || p.s < place.s)) place = p;
            }
        }
        for (let tries = 0; tries < 4; tries++) {
            if (!place) place = places.next(from, side);
            if (!place || place.s - ride.s > reach) return false;
            let slot = 0;
            for (const other of this.riders) if (other !== ride && other.at.place === place && (other.state === 'toWait' || other.state === 'wait')) slot = Math.max(slot, other.at.slot + 1);
            if (slot < place.slots) {
                const at = places.stopAt(place, slot, this.env.ground && this.env.ground.groundY ? this.env.ground : null, this.stopSample);
                at.yaw = 0;
                if (at.s >= from - W.leadM) {
                    this.spot(ride, place, slot, at, from - W.leadM);
                    this.aim(ride, at.s, at.lateral, at.y, place, slot);
                    ride.at.yaw = at.yaw;
                    return true;
                }
            }
            place = places.next(place.s + place.length + 0.01, side);
        }
        return false;
    }

    // Whether two riders going to or waiting in one place have spots side by side across it (GROUP.spot)
    static beside(a, b) {
        if (!a || !b || !a.at.place || a.at.place !== b.at.place) return false;
        return Math.abs(a.at.lateral - b.at.lateral) >= Traffic.sizeOf('bike', a.bike.model).width + GROUP.spot.clearM;
    }

    // A rider's own spot in a place around its slot's (`at`, changed in place: s, lateral, y, yaw; GROUP.spot): moved
    // along, across, beside the rider of the slot ahead, turned; kept only inside the place and clear of the other
    // riders' spots there, else the slot's own
    spot(ride, place, slot, at, least) {
        const S = GROUP.spot, route = this.env.route, size = Traffic.sizeOf('bike', ride.bike.model), random = ride.random;
        const ground = this.env.ground && this.env.ground.groundY ? this.env.ground : null;
        const sample = this.spotSample || (this.spotSample = {});
        const verge = WorldPlaces.verge();
        let mate = null;
        for (const other of this.riders) if (other !== ride && other.at.place === place && (other.state === 'toWait' || other.state === 'wait') && other.at.slot === slot - 1) mate = other;
        for (let k = 0; k < S.tries; k++) {
            // Half stand nearly square to the road, half turned in or out
            let yaw = random() < 0.5 ? (2 * random() - 1) * S.squareMax : (random() < 0.5 ? -1 : 1) * (S.squareMax + random() * (S.yawMax - S.squareMax));
            let s, lateral;
            if (mate && Math.abs(mate.at.yaw || 0) <= S.squareMax && random() < S.abreast) {
                // Beside the rider of the slot ahead when it stands square, square too, on whichever side of it has
                // room (tried in turn)
                yaw = (2 * random() - 1) * S.squareMax;
                s = mate.at.s + (2 * random() - 1) * 0.3;
                lateral = mate.at.lateral + place.side * S.abreastM * (k % 2 ? -1 : 1);
            } else {
                s = at.s + random() * S.alongM;
                lateral = at.lateral + place.side * (2 * random() - 1) * S.abreastM / 2;
            }
            const p = route.sample(s, sample);
            const acrossHalf = size.length / 2 * Math.abs(Math.sin(yaw)) + size.width / 2 * Math.cos(yaw);
            const alongHalf = size.length / 2 * Math.cos(yaw) + size.width / 2 * Math.abs(Math.sin(yaw));
            const out = Math.abs(lateral);
            if (Math.sign(lateral) !== place.side || out - acrossHalf < p.width / 2 + S.edgeM) continue;
            if (out + acrossHalf > p.width / 2 + verge + WorldPlaces.padOf(place, s) - S.edgeM) continue;
            const ends = (place.taper || 0) + WorldPlaces.END_CLEAR_M / 2;
            if (s - alongHalf < place.s + ends || s + alongHalf > place.s + place.length - ends || s < least) continue;
            // Beside every other spot in the place (clear across) or behind it (clear along): a rider never rides
            // through another to its spot, nor queues short of it. And the same to the next slot's own, so the next
            // rider can always take its plain slot
            const apart = size.width + S.clearM, behind = size.length + S.clearM;
            let open = true;
            for (const other of this.riders) {
                if (other === ride || other.at.place !== place || (other.state !== 'toWait' && other.state !== 'wait')) continue;
                if (Math.abs(lateral - other.at.lateral) < apart && s > other.at.s - behind) open = false;
            }
            if (slot + 1 < place.slots) {
                const next = this.env.places.stopAt(place, slot + 1, null, this.spotNext || (this.spotNext = {}));
                if (Math.abs(lateral - next.lateral) < apart && s < next.s + behind) open = false;
            }
            if (!open) continue;
            const x = p.x + lateral * Math.cos(p.heading), z = p.z - lateral * Math.sin(p.heading);
            const mine = Traffic.box(x, z, p.heading + yaw, { length: size.length + S.clearM, width: size.width + S.clearM }, this.spotBox || (this.spotBox = {}));
            let clear = true;
            for (const other of this.riders) {
                if (other === ride || other.at.place !== place || (other.state !== 'toWait' && other.state !== 'wait')) continue;
                const q = route.sample(other.at.s, this.spotOther || (this.spotOther = {}));
                const ox = q.x + other.at.lateral * Math.cos(q.heading), oz = q.z - other.at.lateral * Math.sin(q.heading);
                const theirs = Traffic.box(ox, oz, q.heading + (other.at.yaw || 0), { length: size.length + S.clearM, width: size.width + S.clearM }, this.spotTheirs || (this.spotTheirs = {}));
                if (Traffic.overlap(mine, theirs) > 0) { clear = false; break; }
            }
            if (!clear) continue;
            at.s = s;
            at.lateral = lateral;
            at.yaw = yaw;
            const y = ground ? ground.groundY(x, z) : p.y;
            at.y = Number.isFinite(y) ? y : p.y;
            return true;
        }
        return false;
    }

    // The roadside: the first straight ahead, or the slot behind a rider already waiting there
    roadside(ride) {
        const R = GROUP.roadside, route = this.env.route, works = this.env.roadworks;
        const from = ride.s + this.roomOf(ride);
        this.events.roadside++;
        let s = null, slot = 0;
        for (const other of this.riders) {
            if (other === ride || other.at.place || (other.state !== 'toWait' && other.state !== 'wait')) continue;
            if (other.at.s >= from && other.at.s - ride.s < GROUP.wait.reachM) { s = other.at.s; slot = Math.max(slot, other.at.slot + 1); }
        }
        if (s === null) {
            for (let d = from + R.straightM; d < from + GROUP.wait.reachM && d < route.length - 20; d += R.stepM) {
                if (works && (works.siteAt(d, Roadworks.BLEND_M) || works.siteAhead(d, 1, 30))) continue;
                if (this.straight(d - R.straightM, R.straightM + 5)) { s = d; break; }
            }
        }
        if (s === null) s = Math.min(route.length - 1, from);
        const at = s - slot * R.slotM;
        const width = route.sample(at, this.stopSample).width;
        const side = Route.keepRight(ride.bike.direction);
        this.aim(ride, at, side * (width / 2 - R.edgeM - Traffic.sizeOf('bike').width / 2), NaN, null, slot);
    }

    aim(ride, s, lateral, y, place, slot) {
        const at = ride.at, route = this.env.route;
        at.s = s;
        at.lateral = lateral;
        at.y = y;
        at.place = place;
        at.slot = slot;
        at.off = lateral - route.laneCurve(route.toUnits(s), ride.bike.direction, 0, 0, this.laneSample).lateral;
    }

    // Whether the road from s over `length` is straight: every bend gentler than GROUP.pass.curveMax, no hairpin
    straight(s, length) {
        const P = GROUP.pass, route = this.env.route;
        for (let d = 0; d <= length; d += P.stepM) {
            const at = Math.max(0, Math.min(route.length, s + d));
            if (Math.abs(route.laneCurve(route.toUnits(at), 1, 0, 0, this.laneSample).curvature) > P.curveMax) return false;
            if (route.kindAt && route.kindAt(at, this.kindSample).hairpin > P.hairpinMax) return false;
        }
        return true;
    }

    going(ride) {
        const W = GROUP.wait, d = ride.at.s - ride.s;
        if (!ride.tr.active && ride.off !== ride.at.off && d <= W.pullM) CrewGroup.ease(ride, ride.at.off, d - 0.3);
        if (d <= W.arriveM && (ride.bike.currentSpeed || 0) < 0.3) {
            ride.state = 'wait';
            ride.tr.active = false;
            ride.off = ride.at.off;
            ride.offRate = 0;
        }
    }

    waiting(ride, dt) {
        const J = GROUP.rejoin;
        ride.stand = true;
        if (ride.why === 'own') {
            ride.waitS -= dt;
            if (this.halted) ride.why = 'player';
        }
        ride.waitedS += dt;
        if ((ride.why === 'back' || ride.why === 'ahead') && this.halted) ride.why = 'player';
        let ready;
        if (ride.why === 'own') ready = ride.waitS <= 0;
        // (a rider waiting for the back pulls out ahead of the first rider whose place is behind its own once that is
        // near, so the line keeps its order)
        else if (ride.why === 'back') ready = !ride.waitFor || ride.waitFor.s > ride.at.s - J.backM || ride.waitedS > GROUP.wait.backMaxS || this.nearBehind(ride);
        // (one that waited for a player who was too far behind it waits maxS at the most: the player may ride away)
        else ready = (!this.halted && !!this.lead && this.lead.s > ride.at.s + J.joinM) || (ride.why === 'ahead' && ride.waitedS > GROUP.ahead.maxS);
        if (!ready || !this.clearToGo(ride)) return;
        ride.state = 'out';
        ride.stand = false;
        ride.at.place = null;
        this.events.rejoins++;
        CrewGroup.ease(ride, 0, J.pullM);
    }

    // Whether a rider whose place is behind this one's comes within GROUP.rejoin.backM of where it waits
    nearBehind(ride) {
        for (const e of this.line) if (e.ride && e.ride.place > ride.place && e.s < ride.at.s && e.s > ride.at.s - GROUP.rejoin.backM) return true;
        return false;
    }

    clearToGo(ride) {
        const J = GROUP.rejoin;
        for (const other of this.riders) {
            if (other !== ride && other.state === 'wait' && other.at.place === ride.at.place && Math.abs(other.at.s - ride.at.s) < GROUP.wait.reachM && other.at.slot < ride.at.slot) return false;
        }
        for (const e of this.line) {
            if (e.ride === ride) continue;
            const back = ride.s - e.s;
            if (back < 0 && -back < J.aheadM) return false;
            if (back >= 0 && back < J.clearM + e.speed * J.clearS && (ride.at.place || e.speed >= J.queuedMs)) return false;
        }
        // Nor while another rider off the road moves near it
        for (const other of this.riders) {
            if (other === ride || other.state === 'wait' || other.index >= 0) continue;
            const back = ride.s - other.s;
            if (back < J.aheadM && back > -J.aheadM - J.clearM) return false;
        }
        return true;
    }

    // Whether the player may be passed: moving, upright and on its lane line
    playerPassable() {
        const P = GROUP.pass, lead = this.lead;
        if (!lead || !this.player || this.player.crashed || lead.speed < P.playerMs) return false;
        return Math.abs(this.traffic.leadOff(lead, 1)) < P.bandM;
    }

    // Whether the player (a line entry ahead of the rider) is in front of it: clearly ahead (frontM past its front), or
    // ahead on its lane line (as the following rule reads it, CONTACT.follow)
    inFront(ride, entry) {
        const ahead = entry.s - ride.s;
        if (ahead > this.boxM + GROUP.line.frontM) return true;
        // (free roam: the player leads, so a player ahead anywhere across the road is followed)
        if (this.traffic.roam && ahead > 0) return true;
        return ahead > CONTACT.follow.aheadM && !!this.lead && Math.abs(this.traffic.leadOff(this.lead, ride.bike.direction) - AIMotorcycle.sideOf(ride.bike)) < CONTACT.follow.bandM;
    }

    // Whether a rider's place in the group is ahead of the place of `ahead` (a line entry: a rider or the player)
    wants(ride, ahead) {
        if (ahead.ride) return ride.rank < ahead.ride.rank;
        // (the player is passed by place only: the player keeps its place in the group whatever the riders' moods)
        return this.playerPlace !== null && ride.place < this.playerPlace;
    }

    // A rider with one close behind it that would pass it, on a straight, eases for a while to let it by
    letBy(ride) {
        const P = GROUP.pass, line = this.line, i = ride.index;
        if (ride.letS > 0) ride.letS = Math.max(0, ride.letS - GROUP.tickS);
        const behind = i >= 0 ? line[i + 1] : null;
        if (!behind || !behind.ride || ride.s - behind.s > P.lookM || ride.pass.phase || !this.wants(behind.ride, line[i])) return;
        if (this.straight(ride.s, P.letM)) ride.letS = P.letS;
    }

    tryPass(ride) {
        const P = GROUP.pass, line = this.line, i = ride.index, bike = ride.bike;
        // (one held to the player's pace, too far ahead of it, passes nobody: GROUP.ahead)
        if (i <= 0 || bike.inSingleLane || ride.yielding || ride.easing || bike.shakenS > 0) return;
        const ahead = line[i - 1], gap = ahead.s - ride.s;
        if (gap > P.lookM) return;
        if (!this.wants(ride, ahead)) return;
        if (ahead.ride ? ahead.ride.pass.phase || ahead.ride.state !== 'ride' : !this.playerPassable()) return;
        // It passes up to gainMs faster than the other, within its most, and not at all under gainMinMs
        const gain = Math.min(P.gainMs, bike.baseSpeed * ride.own.most - ahead.speed);
        if (gain < P.gainMinMs) return;
        if (i > 1 && line[i - 2].s - ahead.s < P.roomM) return;
        for (const other of this.riders) if (other !== ride && other.pass.phase && Math.abs(other.s - ride.s) < P.apartM) return;
        // The metres it rides alongside: the gap and both bikes and clearM, and what it loses while it gathers speed
        const by = (gap + this.boxM + P.clearM + gain * gain / (2 * LANE_DRIVE.bike.accel)) * (ahead.speed + gain) / gain;
        if (by > P.byMaxM) return;
        if (!this.clearRoad(ride.s, 2 * P.inM + by, Math.max(bike.currentSpeed || 0, ahead.speed, 1))) return;
        // The rider's keenness: its chance a second of safe road behind one it would pass
        if (ride.random() >= ride.own.passPerS * GROUP.tickS) return;
        ride.pass.target = ahead.ride || 'player';
        ride.pass.phase = 'out';
        ride.pass.startS = ride.s;
        ride.pass.gain = gain;
        ride.pass.planM = 2 * P.inM + by;
        if (ahead.ride) ahead.ride.yielding = true;
        CrewGroup.ease(ride, -Route.keepRight(bike.direction) * P.swingM, P.inM);
        this.events.passes++;
    }

    // Whether a pass from s over `length` at `speed` is safe (GROUP.pass)
    clearRoad(s, length, speed) {
        const P = GROUP.pass, route = this.env.route, works = this.env.roadworks;
        if (works && (works.siteAt(s, Roadworks.BLEND_M) || works.siteAhead(s, 1, length + P.sightM))) return false;
        if (!this.straight(s, length)) return false;
        const reach = length + P.carMs * length / Math.max(speed, 1) + P.sightM;
        for (const car of this.traffic.cars) {
            const cs = route.fromUnits(car.currentSegment + car.segmentProgress);
            if (car.direction < 0 ? cs > s - 10 && cs < s + reach : cs > s - 10 && cs < s + length + 10) return false;
        }
        const lead = this.anyLead;
        if (lead && lead.direction < 0 && lead.s > s - 10 && lead.s < s + reach) return false;
        return true;
    }

    passing(ride, tick) {
        const P = GROUP.pass, pass = ride.pass;
        ride.capMs = Infinity;
        if (!pass.phase) return;
        if (pass.phase === 'in') {
            if (!ride.tr.active) { pass.phase = null; pass.target = null; }
            return;
        }
        const target = pass.target, lead = this.lead;
        if (target === 'player' && !lead) return this.endPass(ride, false);
        const ts = target === 'player' ? lead.s : target.s;
        const tv = target === 'player' ? lead.speed : target.bike.currentSpeed || 0;
        // Far enough behind the other to swing in and follow it
        const behind = ride.s < ts - (2 * Roadworks.BIKE_HALF_M + Roadworks.QUEUE_GAP_M + P.backM);
        if (pass.phase === 'back') {
            ride.capMs = Math.max(0, tv - P.gainMinMs);
            if (behind) this.endPass(ride, false);
            return;
        }
        ride.floorMs = Math.min(ride.bike.baseSpeed * ride.own.most, tv + pass.gain);
        if (pass.phase === 'out' && !ride.tr.active) pass.phase = 'by';
        if (ride.s - ts >= this.boxM + P.clearM) return this.endPass(ride, false);
        if (!tick) return;
        // A pass that runs long (the other did not yield, or something ahead holds the rider) drops back behind; one that
        // meets an unsafe road drops back in while it is still behind, and goes on by once alongside
        const long = ride.s - pass.startS > pass.planM + P.slackM;
        if (!long && this.clearRoad(ride.s, 2 * P.inM + this.boxM + P.clearM, ride.bike.currentSpeed || 1)) return;
        this.events.aborts++;
        if (behind) return this.endPass(ride, false);
        if (!long) return;
        pass.phase = 'back';
        ride.floorMs = 0;
        if (target !== 'player') target.yielding = false;
    }

    endPass(ride, abort) {
        const pass = ride.pass;
        if (pass.target && pass.target !== 'player') pass.target.yielding = false;
        pass.phase = 'in';
        ride.floorMs = 0;
        ride.capMs = Infinity;
        if (abort) this.events.aborts++;
        CrewGroup.ease(ride, 0, GROUP.pass.inM);
    }

    // The rider's share of its own pace: its gap to the one ahead, the one behind, its noise and a spurt, between its
    // least and its most
    paceOf(ride, dt) {
        const L = GROUP.line, own = ride.own, bike = ride.bike, line = this.line, i = ride.index;
        let share = 1;
        if (i >= 0) {
            let ahead = i > 0 ? line[i - 1] : null;
            // A player beside the rider or coming past is not one it follows: it holds its pace (it neither races nor
            // brakes for a player alongside)
            if (ahead && !ahead.ride && !this.inFront(ride, ahead)) ahead = i > 1 ? line[i - 2] : null;
            if (ahead && ahead.s - ride.s < L.lookM && !(ride.pass.phase === 'out' || ride.pass.phase === 'by' || ride.pass.phase === 'back')) {
                // A rider that would pass the one ahead closes up to it first
                const keen = ride.state === 'ride' && this.wants(ride, ahead);
                const gap = ride.gap * (1 - GROUP.mood.gap * ride.mood);
                const want = keen ? L.gapMinM : Math.max(L.gapMinM, gap * Math.max(bike.currentSpeed || 0, 0.5 * bike.baseSpeed));
                share = 1 + L.gain * (ahead.s - ride.s - want) / want;
            } else if (ahead && ride.state === 'ride' && !ride.pass.phase) share = own.most;
            // (one further than lookM behind the next rider ahead presses on at its most to close up, as the gap rule
            // does at lookM; at its own pace it fell further behind, and the riders ahead stood to wait for it)
        }
        share *= ride.noise * (1 + ride.moodPace * ride.mood);
        if (ride.spurtS > 0 && own.spurt) share *= own.spurt.gain;
        if (ride.yielding || ride.letS > 0) share = Math.min(share, GROUP.pass.yield);
        share = Math.max(own.least, Math.min(own.most, share));
        // A rider that leads waits for the back of the line: the last on the road behind it, the player too
        let least = own.least;
        if (i >= 0 && i < line.length - 1 && (i === 0 || line[i - 1].s - ride.s >= L.lookM)) {
            const back = ride.s - line[line.length - 1].s;
            if (back > L.backFromM) {
                const wait = 1 - (1 - L.waitShare) * Math.min(1, (back - L.backFromM) / (L.backToM - L.backFromM));
                least = Math.min(least, wait);
                share = Math.min(share, wait);
            }
        }
        ride.share = share;
        ride.factor += (share - ride.factor) * Math.min(1, dt / L.easeS);
        ride.factor = Math.max(least, Math.min(own.most, ride.factor));
    }

    // A stop: behind a stopped player, at a place's slot, or standing in it
    holdOf(ride) {
        const bike = ride.bike;
        let d = null;
        if (ride.state === 'hold') d = this.standS - GROUP.hold.gapM * (++this.held) - ride.s;
        else if (ride.state === 'toWait') d = ride.at.s - ride.s;
        else if (ride.state === 'wait') d = 0;
        if (d === null) return;
        bike.planM = Math.min(bike.planM === undefined ? Infinity : bike.planM, d);
        bike.stopM = Math.min(bike.stopM === undefined ? Infinity : bike.stopM, Math.max(0, d));
    }
}

// Metres between the lane line's samples when traffic looks ahead for a bend
const LANE_LOOK_STEP_M = 1;

// The units of u a world vehicle moves for `metres` along its lane line (WorldRoute.laneCurve): the line's own
// length, so a car keeps its speed where the samples are unevenly spaced and on the outside of a bend
function laneStep(route, vehicle, metres) {
    const lane = route.laneCurve(vehicle.currentSegment + vehicle.segmentProgress, vehicle.direction, 0, 0, vehicle.stepSample || (vehicle.stepSample = {}));
    return metres / Math.max(lane.metres, 0.05);
}

// A world vehicle's speed this frame: from `speed` toward `want`, but never over the speed from which it can still
// brake at `drive.plan` to sqrt(drive.lateral / curvature), and to sqrt(drive.turnIn / curvature change per metre), at
// every point of its lane line within its braking distance, and changed by at most drive.accel or drive.brake a second, so the speed (and with it the yaw rate a
// bend asks for) has no step
function laneSpeed(route, vehicle, speed, want, drive, dt) {
    const look = vehicle.lookSample || (vehicle.lookSample = {});
    const horizon = speed * speed / (2 * drive.plan) + 10;
    const last = route.points.length - 1;
    let u = vehicle.currentSegment + vehicle.segmentProgress;
    let cap = Infinity, before = null;
    for (let d = 0; d <= horizon && u >= 0 && u <= last; d += LANE_LOOK_STEP_M) {
        route.laneCurve(u, vehicle.direction, 0, 0, look);
        const k = Math.abs(look.curvature);
        if (k > 1e-6) cap = Math.min(cap, Math.sqrt(drive.lateral / k + 2 * drive.plan * d));
        const change = before === null ? 0 : Math.abs(look.curvature - before) / LANE_LOOK_STEP_M;
        if (change > 1e-6) cap = Math.min(cap, Math.sqrt(drive.turnIn / change + 2 * drive.plan * d));
        before = look.curvature;
        u += vehicle.direction * LANE_LOOK_STEP_M / Math.max(look.metres, 0.05);
    }
    // A roadworks light or what is ahead in the lane (Traffic.holdForRoadworks): stop within the metres left. planM
    // has the room the vehicle ahead still needs to stop itself, so a vehicle follows one that moves at a gap that
    // grows with its speed; stopM alone is the room to a thing that stands
    const hold = vehicle.planM !== undefined ? vehicle.planM : vehicle.stopM;
    if (hold !== undefined && hold < Infinity) cap = Math.min(cap, Math.sqrt(2 * drive.plan * Math.max(0, hold - 0.3)));
    const target = Math.min(want, cap);
    // A vehicle just placed (spawned, or moved by a restart) starts at a speed its place allows
    if (!vehicle.laneMoving) {
        vehicle.laneMoving = true;
        return Math.min(speed, target);
    }
    return Math.max(speed - drive.brake * dt, Math.min(speed + drive.accel * dt, target));
}

// The metres of its lane line a world vehicle moves this frame: its speed's, but never past the place it must stand
// (stopM, in metres of ride), where it stops. A lane is longer or shorter than the ride beside it (a bend, the blend
// into the open lane), so the hold is turned into the lane's own metres first
function laneMetres(route, vehicle, dt) {
    const want = vehicle.currentSpeed * dt;
    const hold = vehicle.stopM;
    if (hold === undefined || hold === Infinity) return want;
    const u = vehicle.currentSegment + vehicle.segmentProgress;
    const i = Math.max(0, Math.min(route.points.length - 2, Math.floor(u)));
    const span = route.points[i + 1].s - route.points[i].s;
    const lane = route.laneCurve(u, vehicle.direction, 0, 0, vehicle.holdSample || (vehicle.holdSample = {}));
    const most = Math.max(0, hold) * (span > 0 ? Math.min(1, lane.metres / span) : 1);
    if (!(want > most)) return want;
    vehicle.currentSpeed = dt > 0 ? most / dt : 0;
    return most;
}

class Traffic {
    // The crew's paces by trait, slowest first (CREW_PACES above)
    static get PACES() { return CREW_PACES; }

    // The pace of a trait value: {speed, spread, corner}, between two rows for a value between them
    static paceOf(trait, out = {}) {
        const last = CREW_PACES.length - 1;
        const at = Math.max(0, Math.min(last, (Number.isFinite(trait) ? trait : CREW_PACES[0].trait) - CREW_PACES[0].trait));
        const low = CREW_PACES[Math.min(last - 1, Math.floor(at))], high = CREW_PACES[Math.min(last - 1, Math.floor(at)) + 1];
        const t = at - (low.trait - CREW_PACES[0].trait);
        out.speed = low.speed + (high.speed - low.speed) * t;
        out.spread = low.spread + (high.spread - low.spread) * t;
        out.corner = low.corner + (high.corner - low.corner) * t;
        return out;
    }

    // The name of the row nearest a trait value
    static skillOf(trait) {
        return CREW_PACES.reduce((best, row) => (Math.abs(row.trait - trait) < Math.abs(best.trait - trait) ? row : best)).skill;
    }

    // The trait a rider's pace is read at. On a leg, which has no kinds of road, the mean of its country and mountain
    // traits; in a world, its trait for each kind of road by that kind's share of the road it is on
    // (WorldRoute.kindAt: {hairpin, mountain, country}), so the pace changes over the same distance as the shares do
    static roadTrait(character, kind = null) {
        const country = Vehicle.traitOf(character, 'country'), mountain = Vehicle.traitOf(character, 'mountain');
        if (!kind) return (country + mountain) / 2;
        return kind.hairpin * Vehicle.traitOf(character, 'hairpins') + kind.mountain * mountain + kind.country * country;
    }

    // The sizes and thresholds of contact (CONTACT above)
    static get CONTACT() { return CONTACT; }

    // The rules of a world's group ride (GROUP above, CrewGroup)
    static get GROUP() { return GROUP; }

    // The footprint of a kind of vehicle ('bike', 'car'), or of a bike model that carries its own
    static sizeOf(kind, model = null) {
        const own = model && typeof BIKE_MODELS !== 'undefined' && BIKE_MODELS[model] ? BIKE_MODELS[model].contact : null;
        return own || CONTACT.boxes[kind];
    }

    // A box in the ground plane: {x, z, yaw, halfLength, halfWidth}, its length along (sin yaw, cos yaw)
    static box(x, z, yaw, size, out = {}) {
        out.x = x;
        out.z = z;
        out.yaw = yaw;
        out.halfLength = size.length / 2;
        out.halfWidth = size.width / 2;
        return out;
    }

    // The box of a car or a rider of the crew, where its model stands
    static boxOf(vehicle, out = {}) {
        const group = vehicle.carGroup || vehicle.bikeGroup;
        return Traffic.box(group.position.x, group.position.z, group.rotation.y, Traffic.sizeOf(vehicle.carGroup ? 'car' : 'bike', vehicle.model), out);
    }

    // The box of the player's bike ({position, yawAngle, model})
    static playerBox(player, out = {}) {
        return Traffic.box(player.position.x, player.position.z, player.yawAngle, Traffic.sizeOf('bike', player.model), out);
    }

    // How far two boxes reach into each other along the unit axis (ax, az): negative when they are apart along it
    static reachAlong(a, b, ax, az) {
        const reach = o => o.halfLength * Math.abs(Math.sin(o.yaw) * ax + Math.cos(o.yaw) * az) + o.halfWidth * Math.abs(Math.cos(o.yaw) * ax - Math.sin(o.yaw) * az);
        return reach(a) + reach(b) - Math.abs((b.x - a.x) * ax + (b.z - a.z) * az);
    }

    // How deep two boxes are in each other: the least of their reach along the four box axes, and 0 when a line passes
    // between them (two boxes that only touch are 0 deep). The one test for the player against a rider or a car and
    // for the crew and the cars against each other
    static overlap(a, b) {
        let least = Infinity;
        for (const box of [a, b]) {
            const sin = Math.sin(box.yaw), cos = Math.cos(box.yaw);
            least = Math.min(least, Traffic.reachAlong(a, b, sin, cos));
            if (least <= 0) return 0;
            least = Math.min(least, Traffic.reachAlong(a, b, cos, -sin));
            if (least <= 0) return 0;
        }
        return least;
    }

    // The touring crew: every character but the one the player rides as (by name), in the order of CHARACTERS
    static crewOf(playerRiderName) {
        return CHARACTERS.filter(character => character.name !== playerRiderName);
    }

    constructor(scene, environment, playerRiderName = null) {
        this.scene = scene;
        this.environment = environment;
        this.playerRiderName = playerRiderName; // Excluded from the AI crew
        this.cars = [];
        this.motorcycles = [];
        this.maxCars = 1;
        this.maxMotorcycles = 5;  // The Touring Crew: Steve, Alex, Shane, Tim, Guy
        // A world's hairpins hold the crew to what a bend allows; a leg leaves them at full speed
        this.speedScale = environment.trafficSpeedScale || 1;
        this.carSpacing = 250;
        this.motorcycleSpacing = 150;

        this.initializeCars();
        this.initializeMotorcycles();
        this.clearOfRoadworks();
    }

    // The world vehicles as the roadworks read them: {vehicle, s, direction, half}
    worldVehicles() {
        const route = this.environment.route;
        const list = [];
        for (const car of this.cars) list.push({ vehicle: car, s: route.fromUnits(car.currentSegment + car.segmentProgress), direction: car.direction, half: Roadworks.CAR_HALF_M, brake: LANE_DRIVE.car.brake, speed: car.currentSpeed || 0 });
        // (a rider that finished the ride is parked out of sight at its end: nothing queues behind it)
        for (const bike of this.motorcycles) list.push({ vehicle: bike, s: route.fromUnits(bike.currentSegment + bike.segmentProgress), direction: bike.direction, half: Roadworks.BIKE_HALF_M, brake: LANE_DRIVE.bike.brake, speed: bike.currentSpeed || 0, parked: !bike.bikeGroup.visible, aside: !!(bike.ride && bike.ride.aside), verge: !!(bike.ride && bike.ride.aside && (bike.ride.state === 'toWait' || bike.ride.state === 'wait')) });
        return list;
    }

    // The player as the traffic behind it reads it: {s, direction, speed, x, z, crashed}, or null off the route. The
    // direction is the way its bike points along the ride, and the speed its speed that way
    playerLead(player) {
        const route = this.environment.route;
        if (!player || !player.position || !Number.isFinite(player.yawAngle)) return null;
        const p = player.projection && player.projection.index >= 0 ? player.projection : route.project(player.position.x, player.position.z, this.leadHint || null, this.leadSample || (this.leadSample = {}));
        if (!(p.index >= 0) || !Number.isFinite(p.s) || Math.abs(p.lateral) > p.width / 2 + 2) return null;
        this.leadHint = this.leadHint || {};
        this.leadHint.index = p.index;
        const along = Math.cos(player.yawAngle - p.heading);
        const direction = along < 0 ? -1 : 1;
        return { s: p.s, direction, speed: player.crashed ? 0 : Math.max(0, (player.speed || 0) * along * direction), x: player.position.x, z: player.position.z, off: {} };
    }

    // How far the player is off the lane line of traffic going in `direction`, across the road (+ is Route.LEFT)
    leadOff(lead, direction) {
        if (lead.off[direction] !== undefined) return lead.off[direction];
        const route = this.environment.route;
        const lane = route.laneCurve(route.toUnits(lead.s), direction, 0, 0, this.leadLane || (this.leadLane = {}));
        return (lead.off[direction] = (lead.x - lane.x) * Math.cos(lane.heading) - (lead.z - lane.z) * Math.sin(lane.heading));
    }

    // A world's roadworks lights hold traffic at their stop lines, and a vehicle keeps QUEUE_GAP_M behind the one ahead
    // going its way: each vehicle's stopM is the metres it may still move this frame (Infinity when free). The lights
    // learn what is in each single lane. A leg has no roadworks lights and nothing changes.
    // Following: planM is the room a vehicle plans its speed by (laneSpeed). It is stopM and the room the vehicle
    // ahead needs to stop at its own hardest braking, so a vehicle closes up on one that moves and its gap grows with
    // its speed, and it still stops behind one that stops. `player` (the player's bike) is ahead of every vehicle going
    // its way whose lane line it is on (CONTACT.follow): the crew brake for it and do not ride into its back. It
    // holds no vehicle's stopM: a player who cuts in is braked for as hard as the vehicle can, never by a dead stop
    holdForRoadworks(player = null) {
        if (!this.environment.route.laneCurve) return;
        const works = this.environment.roadworks || null;
        const list = this.worldVehicles();
        // The rider near a site is one of the queue and one of the lane's vehicles (Roadworks.riderEntry)
        const rider = works && works.riderEntry ? works.riderEntry() : null;
        const queue = rider ? list.concat(rider) : list;
        if (works) works.occupy(queue);
        const lead = this.playerLead(player);
        this.lastLead = lead;
        // A player who is moving is followed as a player ahead is, below. As one of the queue it held every vehicle
        // behind it along the ride wherever it was across the road, so a rider the player passed on the way into a
        // site stood still at once. A player who stands or crawls there is still one of the queue
        const moving = !!lead && lead.speed > CONTACT.follow.queueMs;
        for (const v of list) {
            let hold = works ? works.stopDistance(v.vehicle, v.s, v.direction, v.half, v.vehicle.currentSpeed || 0, v.brake * 0.9) : Infinity;
            let plan = hold;
            // A rider of the group passing (CrewGroup) is not held by the one it passes, which is beside it
            const ride = v.vehicle.ride;
            const passing = ride && (ride.pass.phase === 'out' || ride.pass.phase === 'by' || ride.pass.phase === 'back') ? ride.pass.target : null;
            for (const o of queue) {
                if (o === v || o.direction !== v.direction || o.parked || (o.rider && moving)) continue;
                if (passing && o.vehicle && o.vehicle.ride === passing) continue;
                // A rider of the group going into a stopping place, or in it, follows only those beside the road with it;
                // nothing on the road follows a rider off it (CrewGroup.offRoad)
                if (v.verge ? !o.verge : o.aside) continue;
                // (in a place, one whose spot is beside its own across the place is not in its way: CrewGroup.spot)
                if (v.verge && CrewGroup.beside(v.vehicle.ride, o.vehicle && o.vehicle.ride)) continue;
                const ahead = (o.s - v.s) * v.direction;
                if (ahead <= 0) continue;
                // (in a stopping place the riders stand in its slots, nearer than a queue)
                const room = ahead - v.half - o.half - (v.verge ? GROUP.wait.slotGapM : Roadworks.QUEUE_GAP_M);
                hold = Math.min(hold, room);
                plan = Math.min(plan, room + (o.speed > 0 ? o.speed * o.speed / (2 * o.brake) : 0));
            }
            if (lead && lead.direction === v.direction && passing !== 'player' && !v.verge) {
                const ahead = (lead.s - v.s) * v.direction;
                if (ahead > CONTACT.follow.aheadM && Math.abs(this.leadOff(lead, v.direction) - AIMotorcycle.sideOf(v.vehicle)) < CONTACT.follow.bandM) {
                    plan = Math.min(plan, ahead - v.half - Roadworks.BIKE_HALF_M - Roadworks.QUEUE_GAP_M + lead.speed * lead.speed / (2 * CONTACT.follow.playerBrake));
                }
            }
            v.vehicle.stopM = hold;
            v.vehicle.planM = plan;
            // In a single lane the queue's own gap keeps the vehicles apart: the spacing rule's half speed
            // (temporarySlowdown) made a queue clear a long lane at walking pace, and the far light stayed red for it
            v.vehicle.inSingleLane = !!works && works.closed.some(site => v.s + v.half > site.stopIn && v.s - v.half < site.stopOut);
        }
    }

    // No world vehicle starts inside a single lane: one there moves back before its entry, where its light holds it
    clearOfRoadworks(player = null) {
        const works = this.environment.roadworks;
        if (!works || !this.environment.route.laneCurve) return;
        const route = this.environment.route;
        const list = this.worldVehicles();
        for (const v of list) {
            let s = works.clearOf(v.s, v.direction, v.half);
            if (s === v.s) continue;
            // Several moved out of one lane stand behind each other before its entry, not in each other
            // (nor in the player, put down at `player` and facing along the ride: they queue behind it)
            const onPlayer = at => player !== null && v.direction === 1 && Math.abs(player - at) < Math.max(CONTACT.restart.backM + 0.01, v.half + Roadworks.BIKE_HALF_M + Roadworks.QUEUE_GAP_M);
            const taken = at => onPlayer(at) || list.some(o => o !== v && o.direction === v.direction && !o.parked && Math.abs(o.s - at) < v.half + o.half + Roadworks.QUEUE_GAP_M);
            while (taken(s) && s > 0 && s < route.length) s -= v.direction * (2 * v.half + Roadworks.QUEUE_GAP_M);
            v.s = s;
            const u = route.toUnits(Math.max(0, Math.min(route.length, s)));
            v.vehicle.currentSegment = Math.floor(u);
            v.vehicle.segmentProgress = u - Math.floor(u);
            v.vehicle.laneMoving = false;
            v.vehicle.updatePosition();
        }
    }
    
    initializeCars() {
        // A converted leg sends its oncoming cars into the drawn window as the
        // rider goes (followWindow): one each `oncomingEvery` segments
        if (this.environment.sections) {
            const course = this.environment.course();
            this.oncomingEvery = (course.traffic && course.traffic.oncomingEvery) || 100;
            this.nextOncoming = this.oncomingEvery;
            this.oncomingEncounters = 0;
            return;
        }
        // Oncoming traffic lives on the active leg: only that part of the
        // course has geometry
        const range = legSegmentRange(this.environment);

        for (let i = 0; i < 1; i++) {
            const startSegment = range.start + Math.floor((0.5 + Math.random() * 0.5) * (range.end - range.start));
            const car = new Car(this.scene, this.environment, {
                direction: -1,
                speed: (15 + Math.random() * 10) * this.speedScale,
                startSegment: startSegment,
                lane: 'right',
                color: this.getRandomCarColor()
            });
            this.cars.push(car);
        }
    }
    
    // Free roam: the crew behind the player at s (GROUP.roam), place 1 nearest, each riding again
    gridBehind(s) {
        const route = this.environment.route, R = GROUP.roam;
        if (!route.laneCurve) return;
        const range = legSegmentRange(this.environment);
        const riders = this.motorcycles.filter(bike => bike.direction === 1).sort((a, b) => (a.character.place || 99) - (b.character.place || 99));
        riders.forEach((bike, k) => {
            if (bike.ride && this.group) {
                this.group.placed(bike.ride);
                bike.ride.state = 'ride';
                bike.ride.why = null;
                bike.ride.aside = false;
                bike.ride.off = 0;
            }
            bike.nudge = bike.nudgeWant = 0;
            bike.laneMoving = false;
            bike.bikeGroup.visible = true;
            const u = Math.max(range.start, route.toUnits(Math.max(0, s - R.backM - k * R.gapM)));
            bike.currentSegment = Math.floor(u);
            bike.segmentProgress = u - Math.floor(u);
            bike.currentSpeed = 0;
            bike.updatePosition();
        });
        if (this.group) {
            this.group.halted = this.group.standing = this.group.away = false;
            this.group.stoppedS = 0;
        }
    }

    // Free roam ridden alone (GameModes.group 'alone'): the crew goes, and stays gone after a restart
    dropCrew() {
        this.noCrew = true;
        this.motorcycles.forEach(motorcycle => motorcycle.remove());
        this.motorcycles = [];
        this.group = null;
    }

    initializeMotorcycles() {
        if (this.noCrew) {
            this.group = null;
            return;
        }
        const range = legSegmentRange(this.environment);

        // The touring crew are the characters the player did not pick, each on its own bike (BikeModels.crewBike:
        // its first) in its own first outfit, at its own pace: the pace of its traits (Traffic.PACES). A rider starts
        // at its leg pace; in a world it then takes the pace of the road it is on (AIMotorcycle.takePace). `luck` is
        // the rider's one draw for its pace, its share of the spread for the whole ride.
        const others = Traffic.crewOf(this.playerRiderName);
        const paces = others.map((character) => {
            const trait = Traffic.roadTrait(character);
            const pace = Traffic.paceOf(trait);
            const luck = Math.random();
            return { skill: Traffic.skillOf(trait), baseSpeed: pace.speed + luck * pace.spread, luck };
        });

        // A world grids its group in the order of their places, place 1 the furthest up the road
        const world = !!this.environment.route.laneCurve;
        const rank = others.map((character, i) => i).sort((a, b) => (others[a].place || 99) - (others[b].place || 99) || a - b);
        for (let i = 0; i < others.length; i++) {
            // Grid the crew on the leg, just ahead of the start line. Spacing
            // them over the whole 700-segment course left most legs empty.
            // (slowest rider nearest the start line, so there is someone to
            // catch; the quick ones begin further up the road)
            const slot = world ? others.length - 1 - rank.indexOf(i) : others.length - 1 - i;
            const startSegment = Math.min(range.end, range.start + 8 + slot * 3 + Math.floor(Math.random() * 2));
            const character = others[i];
            const bike = typeof BikeModels !== 'undefined' ? BikeModels.crewBike(character) : Vehicle.bikeOf(character);
            const outfit = Vehicle.outfitOf(character);
            const kit = (outfit ? outfit.kit : character.kit) || {};

            const motorcycle = new AIMotorcycle(this.scene, this.environment, {
                direction: 1,
                speed: paces[i].baseSpeed * this.speedScale,
                startSegment: startSegment,
                lane: 'left',
                // The procedural bike that stands until the files are in takes the bike's paint and the kit's colours
                color: BIKE_MODELS[bike] ? BIKE_MODELS[bike].paint : parseInt(character.bikeColor),
                style: 'sport',
                skill: paces[i].skill,
                pace: { luck: paces[i].luck, scale: this.speedScale },
                character,
                model: bike,
                riderName: character.name,
                helmetColor: kit.helmetColor,
                suitColor: kit.suitColor
            });
            this.motorcycles.push(motorcycle);
        }
        // The group ride of a world (CrewGroup). Its seed is the world's `groupSeed`, else one made of the riders' own
        // pace draws: the group adds no draw of its own
        this.group = null;
        if (world && this.motorcycles.length) {
            const seed = Number.isFinite(this.environment.groupSeed) ? this.environment.groupSeed : paces.reduce((sum, pace, i) => (Math.imul(sum, 31) + Math.floor(pace.luck * 4294967296) + i) >>> 0, 17);
            this.group = new CrewGroup(this, seed);
        }
    }

    getRandomBikeColor() {
        const colors = [
            0xff0000,
            0x00ff00,
            0x0000ff,
            0xffff00,
            0xff00ff,
            0x00ffff,
            0xff8800,
            0x8800ff
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    getRandomBikeStyle() {
        const styles = ['sport', 'cruiser', 'naked'];
        return styles[Math.floor(Math.random() * styles.length)];
    }

    getRandomCarColor() {
        const colors = [
            0xf5f5f5, // White
            0xc0c0c0, // Silver
            0x1a1a1a, // Black
            0x404040, // Dark gray
            0x606060, // Medium gray
            0x8b0000, // Dark red
            0x1a3a6b, // Navy blue
            0x1b4d1b, // Forest green
            0x2a2a2a, // Charcoal
            0x8b4513, // Saddle brown
            0xd4af6a, // Champagne gold
            0x4a4a4a  // Slate gray
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }
    
    // A converted leg: a car spawns at the far end of the drawn window each
    // `oncomingEvery` segments the rider covers (at most 2 alive; never in a
    // set piece), and goes when it leaves the window; a rider of the crew
    // outside the drawn sections is hidden (it still rides along the path)
    followWindow(segment) {
        const env = this.environment;
        const k = env.sectionAt(segment);
        const from = Math.max(0, (k - 1) * 25);
        const to = Math.min((k + 3) * 25, env.endSegment + 16);
        if (segment >= this.nextOncoming) {
            this.nextOncoming += this.oncomingEvery;
            let at = to - 1;
            while (at > segment + 10 && env.inSetPiece(at, 2)) at--;
            if (this.cars.length < 2 && at > segment + 10) {
                this.cars.push(new Car(this.scene, env, {
                    direction: -1,
                    speed: 15 + Math.random() * 10,
                    startSegment: at,
                    lane: 'right',
                    color: this.getRandomCarColor()
                }));
                this.oncomingEncounters++;
            }
        }
        this.cars = this.cars.filter(car => {
            if (car.currentSegment >= from && car.currentSegment < to) return true;
            car.remove();
            return false;
        });
        this.motorcycles.forEach(bike => {
            if (bike.currentSegment < from || bike.currentSegment >= to) bike.bikeGroup.visible = false;
        });
    }

    // `player` is the player's bike (Vehicle: position, yawAngle, speed, crashed, worldCrash). With it a world's
    // traffic keeps off the player's back and the crew can be touched (contact); without it, and on a leg, nothing of
    // either
    update(deltaTime, playerPosition, playerSegment = null, player = null) {
        let collisionResult = null;
        const world = !!this.environment.route.laneCurve;
        const mine = world && player ? Traffic.playerBox(player, this.playerSample || (this.playerSample = {})) : null;
        
        // Cars light their lamps when the rider does: the game sets lightLevel to its headlight strength (on in the dark,
        // and in a world's rain or snow by day)
        const lamps = Traffic.headlightsOn(this.lightLevel);
        this.holdForRoadworks(player);
        // A world's group: each rider's share of its pace, its passes and its stops (CrewGroup), on top of the following rule
        if (this.group) this.group.step(deltaTime, player, this.lastLead || null);

        // Update all cars
        this.cars.forEach(car => {
            car.setHeadlights(lamps);
            car.update(deltaTime);
            
            if (!collisionResult && car.checkCollision(playerPosition, mine)) {
                car.onCollision();
                collisionResult = { hit: true, car: car };
            }
        });
        
        // Update all motorcycles with pack dynamics
        this.motorcycles.forEach(motorcycle => {
            motorcycle.update(deltaTime, playerPosition, this.motorcycles, this.cars);
            
        });

        // After the riders moved: their visibility is the window's
        if (this.environment.sections && playerSegment !== null) this.followWindow(playerSegment);
        
        if (collisionResult) {
            return collisionResult;
        }

        // The player against the crew of a world: a bump or a crash (a leg's riders are not solid: they chase and pass
        // the player by the legs' own rules, which would run them into its back)
        const touched = mine ? this.contact(player, mine, deltaTime) : null;
        
        // Check spacing between cars going same direction
        for (let i = 0; i < this.cars.length; i++) {
            for (let j = i + 1; j < this.cars.length; j++) {
                const car1 = this.cars[i];
                const car2 = this.cars[j];
                
                // Only check cars going same direction
                if (car1.direction === car2.direction) {
                    const distance = car1.getDistanceToOtherCar(car2);
                    if (distance < this.carSpacing && distance > 0) {
                        // Slow down the car behind
                        const car1Progress = car1.currentSegment + car1.segmentProgress;
                        const car2Progress = car2.currentSegment + car2.segmentProgress;
                        
                        if (car1.direction === 1) {
                            // Forward direction
                            if (car1Progress < car2Progress) {
                                car1.temporarySlowdown();
                            } else {
                                car2.temporarySlowdown();
                            }
                        } else {
                            // Reverse direction
                            if (car1Progress > car2Progress) {
                                car1.temporarySlowdown();
                            } else {
                                car2.temporarySlowdown();
                            }
                        }
                    }
                }
            }
        }
        
        return touched ? { hit: false, rider: touched } : { hit: false };
    }

    // The player's bike against each rider of the crew, after both have moved (CONTACT). Where the two boxes are in
    // each other:
    // - the rider ran into the player's back (the following rule failed it): the rider takes the player's speed and
    //   drops back clear. Nothing is lost by the player, and it is never a crash: the player could not see it coming;
    // - closing faster than CONTACT.hardMs along the line of the contact (across the road when side by side, along it
    //   end to end): the player crashes, with the rider's name as the cause. The rider slows hard, shakes and rides on;
    // - slower: a bump. The player is set clear of the rider and loses a little speed, the bike wobbles, and the rider
    //   moves off its line away from the player. One contact is one bump (cooldownS): until then the boxes are only
    //   held apart.
    // Returns {kind: 'crash' | 'bump' | 'rear', bike, name} for the frame's contact, or null.
    contact(player, mine, deltaTime) {
        this.bumpS = Math.max(0, (this.bumpS || 0) - deltaTime);
        if (player.contactWobble) {
            player.contactWobble *= Math.exp(-deltaTime / CONTACT.bump.wobbleFadeS);
            if (Math.abs(player.contactWobble) < 1e-3) player.contactWobble = 0;
        }
        const theirs = this.riderSample || (this.riderSample = {});
        let event = null;
        for (const bike of this.motorcycles) {
            const at = bike.bikeGroup.position;
            const near = Math.hypot(player.position.x - at.x, player.position.z - at.z) < CONTACT.nudge.holdM;
            // A rider off its line comes back only when the player is not there to be turned into
            bike.nudgeFree = !near || !!player.crashed;
            if (!near || player.crashed || !bike.bikeGroup.visible || bike.ghostS > 0) continue;
            if (Math.abs(player.position.y - at.y) > CONTACT.heightM) continue;
            Traffic.boxOf(bike, theirs);
            if (!(Traffic.overlap(mine, theirs) > 0)) continue;
            event = this.touch(player, bike, mine, theirs) || event;
            if (player.crashed) break;
            Traffic.playerBox(player, mine);
        }
        return event;
    }

    touch(player, bike, mine, theirs) {
        const fx = Math.sin(theirs.yaw), fz = Math.cos(theirs.yaw), lx = fz, lz = -fx;
        const dx = mine.x - theirs.x, dz = mine.z - theirs.z;
        const along = dx * fx + dz * fz, side = dx * lx + dz * lz;
        const speed = player.speed || 0;
        const pvx = speed * Math.sin(player.yawAngle), pvz = speed * Math.cos(player.yawAngle);
        const playerAlong = pvx * fx + pvz * fz;
        // The line of the contact (CONTACT.hardMs), from the rider toward the player, and how fast the two close along it
        const deepSide = Traffic.reachAlong(mine, theirs, lx, lz), deepAlong = Traffic.reachAlong(mine, theirs, fx, fz);
        const beside = deepSide <= deepAlong;
        const sign = (beside ? side : along) >= 0 ? 1 : -1;
        const nx = (beside ? lx : fx) * sign, nz = (beside ? lz : fz) * sign;
        const closing = beside ? -(pvx * lx + pvz * lz) * sign : -(playerAlong - bike.currentSpeed) * sign;
        const deep = Math.min(deepSide, deepAlong) + CONTACT.bump.clearM;
        const result = { kind: 'bump', bike, name: bike.riderName, closing };

        if (!beside && along > 0 && playerAlong > 0) {
            bike.currentSpeed = Math.min(bike.currentSpeed, playerAlong);
            bike.dropBack(deep);
            result.kind = 'rear';
            return result;
        }
        // The rider gives way across the road, away from the player (AIMotorcycle.update moves it there)
        bike.nudgeWant = bike.nudgeRoom((bike.nudge || 0) - (side >= 0 ? 1 : -1) * CONTACT.bump.shoveM);
        bike.nudgeFree = false;
        if (closing > CONTACT.hardMs) {
            const kick = closing * CONTACT.crash.throw;
            if (player.velocity && player.velocity.set) player.velocity.set(fx * bike.currentSpeed + nx * kick, 0, fz * bike.currentSpeed + nz * kick);
            player.isJumping = false;
            player.worldCrash(`Rode into ${bike.riderName}`, 'lowside', 'rider');
            // The line of the contact and the other rider's way, for how the player's rider meets it (Vehicle.riderCrash)
            if (player.hitFrom) player.hitFrom(nx, nz, fx * bike.currentSpeed, fz * bike.currentSpeed);
            bike.shakenS = CONTACT.crash.slowS;
            bike.shakeT = 0;
            bike.ghostS = CONTACT.crash.ghostS;
            this.bumpS = CONTACT.bump.cooldownS;
            result.kind = 'crash';
            return result;
        }
        player.position.x += nx * deep;
        player.position.z += nz * deep;
        if (this.bumpS > 0) return null;
        this.bumpS = CONTACT.bump.cooldownS;
        // (end to end the player was the faster: it comes down to the rider's speed as well)
        player.speed = Math.max(0, Math.min(speed * CONTACT.bump.keep, beside ? Infinity : speed - Math.max(0, closing)));
        // The bike rolls away from the rider (a lean to the bike's own right is positive)
        const left = Math.cos(player.yawAngle) * nx - Math.sin(player.yawAngle) * nz;
        player.contactWobble = (player.contactWobble || 0) + (left <= 0 ? 1 : -1) * CONTACT.bump.wobble;
        return result;
    }

    // Every pair of boxes that are in each other among the crew in sight, the cars and (when given) the player:
    // [{a, b, deep}]. The following rule keeps this empty; the tests and a console read it
    overlaps(player = null) {
        const all = [...this.motorcycles.filter(bike => bike.bikeGroup.visible), ...this.cars.filter(car => car.carGroup.visible)];
        const boxes = all.map(vehicle => Traffic.boxOf(vehicle));
        if (player) { all.push(player); boxes.push(Traffic.playerBox(player)); }
        const found = [];
        for (let i = 0; i < all.length; i++) {
            for (let j = i + 1; j < all.length; j++) {
                const deep = Traffic.overlap(boxes[i], boxes[j]);
                if (deep > 0) found.push({ a: all[i], b: all[j], deep });
            }
        }
        return found;
    }

    // Where the player is put down (a restart, a debug skip) no rider of a world's crew is in it or about to be
    // (CONTACT.restart): one beside the place moves to the first free place ahead, by a fixed rule with no random
    // draw; one close behind takes the speed its place allows; one near cannot be hit for a moment
    clearRiders(s) {
        const route = this.environment.route;
        if (!route.laneCurve) return;
        const rule = CONTACT.restart;
        const range = legSegmentRange(this.environment);
        const sOf = bike => route.fromUnits(bike.currentSegment + bike.segmentProgress);
        // (a rider of the group waiting off the road stays where it waits)
        const riders = this.motorcycles.filter(bike => bike.direction === 1 && bike.bikeGroup.visible && !(bike.ride && bike.ride.aside));
        for (const bike of riders) {
            const ahead = sOf(bike) - s;
            if (ahead < -rule.settleM || ahead > Math.max(rule.aheadM, rule.ghostM)) continue;
            if (Math.abs(ahead) <= rule.ghostM) bike.ghostS = CONTACT.crash.ghostS;
            bike.nudge = 0;
            bike.nudgeWant = 0;
            bike.laneMoving = false;
            if (ahead < -rule.backM || ahead > rule.aheadM) continue;
            if (bike.ride && this.group) this.group.placed(bike.ride);
            let slot = s + rule.slotM;
            while (riders.some(other => other !== bike && Math.abs(sOf(other) - slot) < rule.placeM)) slot += rule.placeM;
            const u = Math.min(range.end, route.toUnits(Math.min(route.length, slot)));
            bike.currentSegment = Math.floor(u);
            bike.segmentProgress = u - Math.floor(u);
            bike.updatePosition();
        }
    }
    

    // A restart (a leg's checkpoint, a world's restart in place): a car within `radius` segments of the rider moves
    // to the first free slot ahead, by a fixed rule with no random draw, so a
    // restart never puts a car on the rider and never skips traffic further on
    clearAround(segment, radius) {
        if (this.environment.sections) this.nextOncoming = Math.max(this.oncomingEvery, Math.ceil((segment + 1) / this.oncomingEvery) * this.oncomingEvery);
        const range = legSegmentRange(this.environment);
        const taken = (slot, except) => this.cars.some(other => other !== except && Math.abs(other.currentSegment - slot) <= 2);
        this.cars.forEach(car => {
            if (Math.abs(car.currentSegment - segment) > radius) return;
            let slot = segment + radius + 1;
            while (taken(slot, car) && slot < range.end) slot++;
            car.currentSegment = Math.min(slot, range.end);
            car.segmentProgress = 0;
            car.laneMoving = false;
            car.updatePosition();
        });
        this.clearRiders(this.environment.route.fromUnits(segment));
        this.clearOfRoadworks(this.environment.route.fromUnits(segment));
    }

    // The rider's headlight threshold (Game.writeTime switches it on above 0)
    static headlightsOn(level) {
        return (level || 0) > 0;
    }

    // The rider's beam (Traffic.BEAM): whether a car or a rider is in front of a bike at (x, z) heading `yaw`, going
    // either way: within `rangeM` ahead, not nearer than `nearM`, and no further to the side than `sideM` plus `spread`
    // of its distance ahead (the beam's own cone). One behind, or off to the side of the beam, does not count
    inBeam(x, z, yaw) {
        const beam = Traffic.BEAM, sin = Math.sin(yaw), cos = Math.cos(yaw);
        for (const list of [this.cars, this.motorcycles]) {
            for (const other of list) {
                const at = (other.carGroup || other.bikeGroup).position;
                const dx = at.x - x, dz = at.z - z;
                const ahead = dx * sin + dz * cos;
                if (ahead < beam.nearM || ahead > beam.rangeM) continue;
                if (Math.abs(dx * cos - dz * sin) <= beam.sideM + beam.spread * ahead) return true;
            }
        }
        return false;
    }

    // The dip of the rider's beam, 0 (main beam) to 1 (dipped), moved on by `deltaTime`: it dips over dipS while a
    // vehicle is in the beam, holds for holdS after the last one left (a car behind a bend comes back), then rises
    // over riseS. `state` is {dip, clearS}; returns the dip, eased so the beam has no step in its rate
    static stepDip(state, inBeam, deltaTime) {
        const beam = Traffic.BEAM;
        // A new state has had a clear road for as long as it likes
        state.clearS = inBeam ? 0 : (state.clearS === undefined ? Infinity : state.clearS + deltaTime);
        const want = inBeam || state.clearS < beam.holdS ? 1 : 0;
        const rate = deltaTime / (want ? beam.dipS : beam.riseS);
        state.dip = Math.max(0, Math.min(1, (state.dip || 0) + (want ? rate : -rate)));
        return state.dip * state.dip * (3 - 2 * state.dip);
    }

    reset() {
        this.cars.forEach(car => car.remove());
        this.motorcycles.forEach(motorcycle => motorcycle.remove());
        this.cars = [];
        this.motorcycles = [];
        this.initializeCars();
        this.initializeMotorcycles();
        this.clearOfRoadworks();
    }
}

class Car {
    // The glow of a car's headlamps (emissiveIntensity): as built by day, and switched on, over the bloom threshold
    static get LAMP_DAY() { return 0.8; }
    static get LAMP_ON() { return 2.4; }

    constructor(scene, environment, options) {
        this.scene = scene;
        this.environment = environment;
        this.direction = options.direction || 1;
        this.baseSpeed = options.speed || 20;
        this.currentSpeed = this.baseSpeed;
        this.currentSegment = options.startSegment || 0;
        // A leg's lane, named by the legs' code sides (+lateral is 'right': .agent/system/world.md); a world car keeps
        // to the side its direction gives (Route.keepRight) and never reads it
        this.lane = options.lane || 'right';
        this.originalLane = this.lane;
        this.color = options.color || 0xff0000;
        this.segmentProgress = 0;
        this.inDetour = false;
        this.detourSide = null;
        
        this.createCarModel();
        
        // Ensure initial position is on the road
        if (this.environment && this.environment.route && this.environment.route.unitCount > 0) {
            this.updatePosition();
        }
    }
    
    createCarModel() {
        this.carGroup = new THREE.Group();

        // --- One-piece body: 2D side profile swept across the car width ---
        // Shape space: x = car length (+x is the front), y = height.
        // Wheel arches are cut into the bottom edge with arcs.
        // Wheels are centered at y=0 (as before), so the rocker line sits low
        // and the body hugs the road like the previous model.
        const archZ = 1.35;       // wheel arch centers (matches wheel positions)
        const archR = 0.46;       // arch radius (wheel tire radius is 0.32)
        const archCY = 0.0;       // arch center height (wheel axle height)
        const sillY = 0.06;       // bottom of the rocker panel
        const archDX = Math.sqrt(archR * archR - (sillY - archCY) * (sillY - archCY));
        const archAng = Math.asin((sillY - archCY) / archR);

        const bodyShape = new THREE.Shape();
        bodyShape.moveTo(2.0, sillY);                                   // front bottom
        bodyShape.quadraticCurveTo(2.13, 0.08, 2.12, 0.32);             // bumper curve
        bodyShape.lineTo(2.09, 0.48);                                   // front face
        bodyShape.quadraticCurveTo(2.06, 0.58, 1.8, 0.61);              // nose rounds into hood
        bodyShape.lineTo(0.75, 0.72);                                   // hood rises to cowl
        bodyShape.lineTo(-1.2, 0.74);                                   // belt line under cabin
        bodyShape.quadraticCurveTo(-1.85, 0.74, -2.04, 0.6);            // trunk lip
        bodyShape.lineTo(-2.1, 0.4);                                    // rear face
        bodyShape.quadraticCurveTo(-2.13, 0.08, -2.0, sillY);           // rear bumper curve
        bodyShape.lineTo(-archZ - archDX, sillY);                       // bottom to rear arch
        bodyShape.absarc(-archZ, archCY, archR, Math.PI - archAng, archAng, true); // rear arch
        bodyShape.lineTo(archZ - archDX, sillY);                        // rocker between arches
        bodyShape.absarc(archZ, archCY, archR, Math.PI - archAng, archAng, true);  // front arch
        bodyShape.lineTo(2.0, sillY);

        const bodyExtrude = {
            depth: Route.CAR_HALF_WIDTH * 2, // the width the world's lanes keep inside the road (WorldRoute.laneOffset)
            bevelEnabled: true,
            bevelThickness: 0.09,
            bevelSize: 0.05,
            bevelSegments: 2,
            steps: 1,
            curveSegments: 6
        };
        const bodyGeometry = new THREE.ExtrudeGeometry(bodyShape, bodyExtrude);
        bodyGeometry.translate(0, 0, -bodyExtrude.depth / 2); // center across width
        bodyGeometry.rotateY(-Math.PI / 2);                   // profile x -> world z

        // Decide if this car should be two-tone
        const isTwoTone = Math.random() < 0.25;
        let roofColor = this.color;

        if (isTwoTone) {
            const twoToneOptions = [0x1a1a1a, 0xf5f5f5, 0xc0c0c0];
            roofColor = twoToneOptions[Math.floor(Math.random() * twoToneOptions.length)];
        }
        this.roofColor = roofColor;

        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: this.color,
            roughness: 0.2,
            metalness: 0.7
        });
        this.body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        this.body.name = 'carBody';
        this.body.castShadow = true;
        this.body.receiveShadow = true;
        this.carGroup.add(this.body);

        // --- Cabin: dark glass greenhouse with slanted windshield/rear ---
        const glassMaterial = new THREE.MeshStandardMaterial({
            color: 0x0a141e,
            roughness: 0.08,
            metalness: 0.6
        });

        const cabinShape = new THREE.Shape();
        cabinShape.moveTo(0.84, 0.7);                          // base of windshield
        cabinShape.quadraticCurveTo(0.5, 1.05, 0.12, 1.22);    // raked windshield
        cabinShape.lineTo(-0.72, 1.24);                        // roof line
        cabinShape.quadraticCurveTo(-1.1, 1.1, -1.4, 0.72);    // fastback rear window
        cabinShape.lineTo(0.84, 0.7);

        const cabinExtrude = {
            depth: 1.42,
            bevelEnabled: true,
            bevelThickness: 0.05,
            bevelSize: 0.03,
            bevelSegments: 2,
            steps: 1,
            curveSegments: 6
        };
        const cabinGeometry = new THREE.ExtrudeGeometry(cabinShape, cabinExtrude);
        cabinGeometry.translate(0, 0, -cabinExtrude.depth / 2);
        cabinGeometry.rotateY(-Math.PI / 2);

        this.cabin = new THREE.Mesh(cabinGeometry, glassMaterial);
        this.cabin.castShadow = true;
        this.cabin.receiveShadow = true;
        this.carGroup.add(this.cabin);

        // Painted roof cap over the glass canopy (carries the two-tone color)
        const roofMaterial = new THREE.MeshStandardMaterial({
            color: roofColor,
            roughness: 0.25,
            metalness: 0.7
        });
        const roofGeometry = new THREE.BoxGeometry(1.36, 0.05, 0.95);
        const roof = new THREE.Mesh(roofGeometry, roofMaterial);
        roof.position.set(0, 1.27, -0.3);
        roof.castShadow = true;
        roof.receiveShadow = true;
        this.carGroup.add(roof);

        // Chrome belt-line trim where glass meets the body
        const chromeMaterial = new THREE.MeshStandardMaterial({
            color: 0xc0c0c0,
            roughness: 0.15,
            metalness: 0.95
        });
        const trimGeometry = new THREE.BoxGeometry(0.02, 0.02, 2.2);

        const leftTrim = new THREE.Mesh(trimGeometry, chromeMaterial);
        leftTrim.position.set(0.74, 0.73, -0.28);
        this.carGroup.add(leftTrim);

        const rightTrim = new THREE.Mesh(trimGeometry, chromeMaterial);
        rightTrim.position.set(-0.74, 0.73, -0.28);
        this.carGroup.add(rightTrim);

        // Wheels - slightly inset so they tuck into the body arches
        const wheelGeometry = new THREE.CylinderGeometry(0.32, 0.32, 0.26, 16);
        const wheelMaterial = new THREE.MeshStandardMaterial({
            color: 0x0d0d0d,
            roughness: 0.98,
            metalness: 0.0
        });

        // Rim with spokes pattern
        const rimOuterGeometry = new THREE.CylinderGeometry(0.22, 0.22, 0.27, 14);
        const rimInnerGeometry = new THREE.CylinderGeometry(0.08, 0.08, 0.28, 10);
        const rimMaterial = new THREE.MeshStandardMaterial({
            color: 0xb0b0b0,
            roughness: 0.25,
            metalness: 0.85
        });

        // Spoke geometry (simple box for performance)
        const spokeGeometry = new THREE.BoxGeometry(0.03, 0.28, 0.16);

        const wheelPositions = [
            { x: 0.76, z: 1.35 },
            { x: -0.76, z: 1.35 },
            { x: 0.76, z: -1.35 },
            { x: -0.76, z: -1.35 }
        ];
        
        this.wheels = [];
        wheelPositions.forEach(pos => {
            const wheelGroup = new THREE.Group();
            
            // Tire
            const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
            wheel.rotation.z = Math.PI / 2;
            wheelGroup.add(wheel);
            
            // Outer rim
            const rimOuter = new THREE.Mesh(rimOuterGeometry, rimMaterial);
            rimOuter.rotation.z = Math.PI / 2;
            wheelGroup.add(rimOuter);
            
            // Inner hub
            const rimInner = new THREE.Mesh(rimInnerGeometry, rimMaterial);
            rimInner.rotation.z = Math.PI / 2;
            wheelGroup.add(rimInner);
            
            // Add 5 spokes
            for (let i = 0; i < 5; i++) {
                const spoke = new THREE.Mesh(spokeGeometry, rimMaterial);
                spoke.rotation.z = Math.PI / 2;
                spoke.rotation.y = (i * Math.PI * 2) / 5;
                wheelGroup.add(spoke);
            }
            
            wheelGroup.position.set(pos.x, 0, pos.z);
            wheelGroup.castShadow = true;
            wheelGroup.receiveShadow = true;
            this.carGroup.add(wheelGroup);
            this.wheels.push(wheelGroup);
        });
        
        // Headlights - swept-back flattened lamp clusters
        const headlightGeometry = new THREE.SphereGeometry(0.11, 10, 6);
        const headlightMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: 0xffffee,
            emissiveIntensity: 0.8,
            roughness: 0.05,
            metalness: 0.5
        });

        const leftHeadlight = new THREE.Mesh(headlightGeometry, headlightMaterial);
        leftHeadlight.name = 'headlights';
        leftHeadlight.position.set(0.58, 0.5, 2.08);
        leftHeadlight.scale.set(1.5, 0.55, 0.7);
        leftHeadlight.castShadow = true;
        this.carGroup.add(leftHeadlight);

        const rightHeadlight = new THREE.Mesh(headlightGeometry, headlightMaterial);
        rightHeadlight.name = 'headlights';
        rightHeadlight.position.set(-0.58, 0.5, 2.08);
        rightHeadlight.scale.set(1.5, 0.55, 0.7);
        rightHeadlight.castShadow = true;
        this.carGroup.add(rightHeadlight);

        // Tail lights - thin wide light bars
        const taillightGeometry = new THREE.BoxGeometry(0.42, 0.12, 0.06);
        const taillightMaterial = new THREE.MeshStandardMaterial({
            color: 0xcc0000,
            emissive: 0xff0000,
            emissiveIntensity: 0.3,
            roughness: 0.1,
            metalness: 0.2
        });

        const leftTaillight = new THREE.Mesh(taillightGeometry, taillightMaterial);
        leftTaillight.position.set(0.45, 0.6, -2.12);
        leftTaillight.castShadow = true;
        this.carGroup.add(leftTaillight);

        const rightTaillight = new THREE.Mesh(taillightGeometry, taillightMaterial);
        rightTaillight.position.set(-0.45, 0.6, -2.12);
        rightTaillight.castShadow = true;
        this.carGroup.add(rightTaillight);

        // Grille - dark intake set into the nose
        const grilleGeometry = new THREE.BoxGeometry(1.05, 0.24, 0.05);
        const grilleMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a,
            roughness: 0.8,
            metalness: 0.3
        });
        const grille = new THREE.Mesh(grilleGeometry, grilleMaterial);
        grille.position.set(0, 0.36, 2.15);
        grille.castShadow = true;
        this.carGroup.add(grille);

        // Bumpers - dark plastic wrapping the nose and tail
        const bumperGeometry = new THREE.BoxGeometry(1.88, 0.16, 0.22);
        const bumperMaterial = new THREE.MeshStandardMaterial({
            color: 0x2a2a2a,
            roughness: 0.7,
            metalness: 0.3
        });

        const frontBumper = new THREE.Mesh(bumperGeometry, bumperMaterial);
        frontBumper.position.set(0, 0.18, 2.08);
        frontBumper.castShadow = true;
        this.carGroup.add(frontBumper);

        const rearBumper = new THREE.Mesh(bumperGeometry, bumperMaterial);
        rearBumper.position.set(0, 0.18, -2.08);
        rearBumper.castShadow = true;
        this.carGroup.add(rearBumper);

        // Side mirrors - body-color housing on a short stalk
        const mirrorMaterial = new THREE.MeshStandardMaterial({
            color: this.color,
            roughness: 0.3,
            metalness: 0.7
        });
        const mirrorStalkGeometry = new THREE.BoxGeometry(0.12, 0.025, 0.03);
        const mirrorHousingGeometry = new THREE.BoxGeometry(0.13, 0.08, 0.1);

        const leftMirrorStalk = new THREE.Mesh(mirrorStalkGeometry, mirrorMaterial);
        leftMirrorStalk.position.set(0.84, 0.84, 0.68);
        this.carGroup.add(leftMirrorStalk);

        const leftMirror = new THREE.Mesh(mirrorHousingGeometry, mirrorMaterial);
        leftMirror.position.set(0.94, 0.86, 0.66);
        leftMirror.castShadow = true;
        this.carGroup.add(leftMirror);

        const rightMirrorStalk = new THREE.Mesh(mirrorStalkGeometry, mirrorMaterial);
        rightMirrorStalk.position.set(-0.84, 0.84, 0.68);
        this.carGroup.add(rightMirrorStalk);

        const rightMirror = new THREE.Mesh(mirrorHousingGeometry, mirrorMaterial);
        rightMirror.position.set(-0.94, 0.86, 0.66);
        rightMirror.castShadow = true;
        this.carGroup.add(rightMirror);

        // License plates
        const plateMaterial = new THREE.MeshStandardMaterial({
            color: 0xf5f5f5,
            roughness: 0.6,
            metalness: 0.1
        });

        const plateGeometry = new THREE.BoxGeometry(0.4, 0.12, 0.02);
        const frontPlate = new THREE.Mesh(plateGeometry, plateMaterial);
        frontPlate.position.set(0, 0.2, 2.2);
        this.carGroup.add(frontPlate);

        const rearPlate = new THREE.Mesh(plateGeometry, plateMaterial);
        rearPlate.position.set(0, 0.42, -2.16);
        this.carGroup.add(rearPlate);

        // Exhaust tips under the rear bumper
        const exhaustTipGeometry = new THREE.CylinderGeometry(0.045, 0.045, 0.12, 10);
        const leftExhaustTip = new THREE.Mesh(exhaustTipGeometry, chromeMaterial);
        leftExhaustTip.rotation.x = Math.PI / 2;
        leftExhaustTip.position.set(0.5, 0.12, -2.16);
        this.carGroup.add(leftExhaustTip);

        const rightExhaustTip = new THREE.Mesh(exhaustTipGeometry, chromeMaterial);
        rightExhaustTip.rotation.x = Math.PI / 2;
        rightExhaustTip.position.set(-0.5, 0.12, -2.16);
        this.carGroup.add(rightExhaustTip);

        // Shark-fin antenna on the roof
        const finMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a,
            roughness: 0.5,
            metalness: 0.3
        });
        const finGeometry = new THREE.ConeGeometry(0.05, 0.13, 6);
        const sharkFin = new THREE.Mesh(finGeometry, finMaterial);
        sharkFin.position.set(0, 1.33, -0.62);
        sharkFin.scale.set(0.5, 1, 1.7);
        sharkFin.rotation.x = -0.2;
        sharkFin.castShadow = true;
        this.carGroup.add(sharkFin);

        // Indicator lights (turn signals)
        const indicatorGeometry = new THREE.BoxGeometry(0.14, 0.07, 0.06);
        const indicatorMaterial = new THREE.MeshStandardMaterial({
            color: 0xff8800,
            emissive: 0x000000,
            emissiveIntensity: 0,
            roughness: 0.3,
            metalness: 0.2
        });

        this.leftFrontIndicator = new THREE.Mesh(indicatorGeometry, indicatorMaterial.clone());
        this.leftFrontIndicator.position.set(0.78, 0.41, 2.15);
        this.carGroup.add(this.leftFrontIndicator);

        this.rightFrontIndicator = new THREE.Mesh(indicatorGeometry, indicatorMaterial.clone());
        this.rightFrontIndicator.position.set(-0.78, 0.41, 2.15);
        this.carGroup.add(this.rightFrontIndicator);

        this.leftRearIndicator = new THREE.Mesh(indicatorGeometry, indicatorMaterial.clone());
        this.leftRearIndicator.position.set(0.8, 0.6, -2.11);
        this.carGroup.add(this.leftRearIndicator);

        this.rightRearIndicator = new THREE.Mesh(indicatorGeometry, indicatorMaterial.clone());
        this.rightRearIndicator.position.set(-0.8, 0.6, -2.11);
        this.carGroup.add(this.rightRearIndicator);
        
        this.indicatorState = 'off';
        this.indicatorTimer = 0;

        // Every mesh casts a shadow (covers wheel internals, trim, lights)
        this.carGroup.traverse(obj => {
            if (obj.isMesh) obj.castShadow = true;
        });

        this.scene.add(this.carGroup);

        // The modelled car takes over once its file is in (js/carmodels.js);
        // the parts built above stand until then
        if (typeof CarModels !== 'undefined') CarModels.dress(this);
    }
    
    updatePosition() {
        const route = this.environment.route;
        // A world car is its lane line: a roadworks detour is a leg system, and a world builds no roadworks
        if (route.laneCurve) {
            const lane = route.laneCurve(this.currentSegment + this.segmentProgress, this.direction, 0, 0, this.laneSample || (this.laneSample = {}));
            this.carGroup.position.set(lane.x, lane.y + 0.32, lane.z);
            this.carGroup.rotation.y = this.direction === 1 ? lane.heading : lane.heading + Math.PI;
            return;
        }
        const road = route.sampleAt(this.currentSegment, this.segmentProgress, this.roadSample || (this.roadSample = {}));
        const { x, y, z } = road;
        const interpolatedHeading = road.heading;
        
        // Calculate lane offset based on interpolated heading
        const s = route.fromUnits(this.currentSegment + this.segmentProgress);
        let laneOffset;
        if (this.inDetour) {
            // Use detour lane with wider offset to avoid construction
            const detour = route.detourOffsets(s);
            if (this.detourSide === 'far-left' || this.detourSide === 'left') {
                // Between the containers (inner edge at -4) and the centre
                // cones (-0.5); -5 and -6 drove through the containers
                laneOffset = detour.left;
            } else {
                laneOffset = detour.right; // Right detour
            }
        } else {
            // Normal lane position
            laneOffset = this.lane === 'left' ? -route.laneOffset(s) : route.laneOffset(s);
        }
        const perpX = Math.cos(interpolatedHeading) * laneOffset;
        const perpZ = -Math.sin(interpolatedHeading) * laneOffset;
        
        // Ensure car is placed at correct road elevation
        const roadElevation = y || 0;
        // The wheel hubs are at the model origin: lift the car by the wheel
        // radius, or the tyres run half sunk into the road
        this.carGroup.position.set(x + perpX, roadElevation + 0.32, z + perpZ);
        
        // Calculate the car's facing direction based on movement
        // The car should look where it's going
        let facingAngle;
        
        if (this.direction === 1) {
            // Forward - calculate angle from current to next position
            facingAngle = Math.atan2(road.dx, road.dz);
        } else {
            // Backward - opposite direction
            // 0 - d, not -d: a straight road keeps +0, so atan2 stays +π rather than -π
            facingAngle = Math.atan2(0 - road.dx, 0 - road.dz);
        }
        
        this.carGroup.rotation.y = facingAngle;
    }
    
    update(deltaTime) {
        // Check for roadworks and adjust lane if needed
        this.checkForRoadworks();
        
        // Update indicator lights
        this.indicatorTimer += deltaTime;
        const blinkRate = 0.5;
        const isBlinkOn = Math.floor(this.indicatorTimer / blinkRate) % 2 === 0;
        
        if (this.inDetour && this.detourSide) {
            this.indicatorState = this.detourSide.includes('left') ? 'left' : 'right';
        } else {
            this.indicatorState = 'off';
        }
        
        const emissiveIntensity = isBlinkOn ? 0.6 : 0;
        if (this.indicatorState === 'left') {
            this.leftFrontIndicator.material.emissive.setHex(0xff8800);
            this.leftFrontIndicator.material.emissiveIntensity = emissiveIntensity;
            this.leftRearIndicator.material.emissive.setHex(0xff8800);
            this.leftRearIndicator.material.emissiveIntensity = emissiveIntensity;
            this.rightFrontIndicator.material.emissiveIntensity = 0;
            this.rightRearIndicator.material.emissiveIntensity = 0;
        } else if (this.indicatorState === 'right') {
            this.rightFrontIndicator.material.emissive.setHex(0xff8800);
            this.rightFrontIndicator.material.emissiveIntensity = emissiveIntensity;
            this.rightRearIndicator.material.emissive.setHex(0xff8800);
            this.rightRearIndicator.material.emissiveIntensity = emissiveIntensity;
            this.leftFrontIndicator.material.emissiveIntensity = 0;
            this.leftRearIndicator.material.emissiveIntensity = 0;
        } else {
            this.leftFrontIndicator.material.emissiveIntensity = 0;
            this.leftRearIndicator.material.emissiveIntensity = 0;
            this.rightFrontIndicator.material.emissiveIntensity = 0;
            this.rightRearIndicator.material.emissiveIntensity = 0;
        }
        
        // Move along the road
        const segmentLength = this.environment.route.unitM;
        
        // Store previous speed for brake light logic
        if (!this.previousSpeed) this.previousSpeed = this.currentSpeed;
        const speedChange = this.currentSpeed - this.previousSpeed;
        
        // Brake lights when decelerating
        if (speedChange < -0.5) {
            this.leftRearIndicator.material.emissive.setHex(0xff0000);
            this.leftRearIndicator.material.emissiveIntensity = 1.0;
            this.rightRearIndicator.material.emissive.setHex(0xff0000);
            this.rightRearIndicator.material.emissiveIntensity = 1.0;
        } else if (this.indicatorState === 'off') {
            this.leftRearIndicator.material.emissiveIntensity = 0;
            this.rightRearIndicator.material.emissiveIntensity = 0;
        }
        
        this.previousSpeed = this.currentSpeed;
        
        // A world car slows for the bends ahead and moves along its lane line; a leg's moves a share of its segment
        const route = this.environment.route;
        let segmentsToMove;
        if (route.laneCurve) {
            this.currentSpeed = laneSpeed(route, this, this.currentSpeed, this.baseSpeed, LANE_DRIVE.car, deltaTime);
            segmentsToMove = laneStep(route, this, laneMetres(route, this, deltaTime));
        } else {
            segmentsToMove = this.currentSpeed * deltaTime / segmentLength;
        }
        
        // Rotate wheels based on speed
        if (!this.wheelRotation) this.wheelRotation = 0;
        const rotationSpeed = this.currentSpeed / 0.32; // rad/s = v / r
        this.wheelRotation += rotationSpeed * deltaTime * this.direction;
        
        if (this.wheels) {
            this.wheels.forEach(wheel => {
                wheel.rotation.x = this.wheelRotation;
            });
        }
        
        this.segmentProgress += segmentsToMove * this.direction;
        
        // Handle segment transitions
        while (this.segmentProgress >= 1) {
            this.segmentProgress -= 1;
            this.currentSegment += 1;
        }
        
        while (this.segmentProgress < 0) {
            this.segmentProgress += 1;
            this.currentSegment -= 1;
        }
        
        // Loop within the active leg (the only part with road geometry)
        const range = legSegmentRange(this.environment);

        // Hide car during wrap-around transition
        if (this.currentSegment > range.end || this.currentSegment < range.start) {
            this.carGroup.visible = false;

            this.currentSegment = this.direction < 0 ? range.end : range.start;
            this.laneMoving = false;

            // A model that arrived while the car was on the road goes on
            // here, where the car is out of sight
            if (this.modelWaiting) {
                const swap = this.modelWaiting;
                this.modelWaiting = null;
                swap();
            }
            
            // Make visible again after a brief delay to ensure smooth transition
            setTimeout(() => {
                this.carGroup.visible = true;
            }, 100);
        } else {
            // Ensure car is visible during normal driving
            if (!this.carGroup.visible) {
                this.carGroup.visible = true;
            }
        }
        
        // Restore speed if slowed down (a world car's speed is laneSpeed's)
        if (!route.laneCurve && this.currentSpeed < this.baseSpeed) {
            this.currentSpeed += 10 * deltaTime;
            if (this.currentSpeed > this.baseSpeed) {
                this.currentSpeed = this.baseSpeed;
            }
        }
        
        this.updatePosition();
    }
    
    // Headlamps on or off. Only the lamps' emissive strength changes, a uniform: no light is added and no program is
    // compiled, so rain arriving costs no frame. The modelled car's lamps are new materials, so its swap is followed.
    setHeadlights(on) {
        if (this.lampsOn === on && this.lampsModelled === !!this.modelled) return;
        this.lampsOn = on;
        this.lampsModelled = !!this.modelled;
        this.carGroup.traverse(object => {
            if (object.name !== 'headlights') return;
            object.traverse(mesh => { if (mesh.material) mesh.material.emissiveIntensity = on ? Car.LAMP_ON : Car.LAMP_DAY; });
        });
    }

    temporarySlowdown() {
        if (this.inSingleLane) return;
        // Never a speed-up: a car that brakes for a light or a queue is already slower than this, and a car put back to
        // half its speed each frame drove on to the stop line and stood with its nose on it
        this.currentSpeed = Math.min(this.currentSpeed, this.baseSpeed * 0.5);
    }
    
    // `box` is the player's bike in a world (Traffic.playerBox): the car is hit where its body is, box against box. A
    // leg has the ball about the car's origin, as before
    checkCollision(playerPosition, box = null) {
        const dx = this.carGroup.position.x - playerPosition.x;
        const dy = this.carGroup.position.y - playerPosition.y;
        const dz = this.carGroup.position.z - playerPosition.z;
        if (box) return Math.abs(dy - 0.32) <= CONTACT.heightM && Traffic.overlap(box, Traffic.boxOf(this, this.boxSample || (this.boxSample = {}))) > 0;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        
        // More accurate collision detection considering actual vehicle sizes
        // Car is about 1.9 units wide, 4.2 units long
        // Motorcycle is much smaller, so reduce threshold
        const collisionThreshold = 2.2; // Reduced from 3.0 for more accurate collision
        return distance < collisionThreshold;
    }
    
    onCollision() {
        // Flash the car body red briefly on collision. This runs every tick
        // while the bike overlaps the car: a second call must not capture the
        // red as the colour to restore.
        if (this.flashTimeout) return;
        const originalColor = this.body.material.color.getHex();
        this.body.material.color.setHex(0xff0000);
        this.body.material.emissive = new THREE.Color(0xff0000);
        this.body.material.emissiveIntensity = 0.3;
        
        // Reset after a short delay
        this.flashTimeout = setTimeout(() => {
            this.body.material.color.setHex(originalColor);
            this.body.material.emissive = new THREE.Color(0x000000);
            this.body.material.emissiveIntensity = 0;
            this.flashTimeout = null;
        }, 200);
    }
    
    getDistanceToOtherCar(otherCar) {
        const dx = this.carGroup.position.x - otherCar.carGroup.position.x;
        const dz = this.carGroup.position.z - otherCar.carGroup.position.z;
        return Math.sqrt(dx * dx + dz * dz);
    }
    
    remove() {
        this.scene.remove(this.carGroup);
        disposeGroupResources(this.carGroup);
    }

    checkForRoadworks() {
        if (!this.environment.roadworksZones) return;
        
        const currentSegmentIndex = Math.floor(this.currentSegment);
        let inConstructionZone = false;
        
        // Check if we're approaching or in a construction zone
        for (const zone of this.environment.roadworksZones) {
            // Check much earlier - 10 segments before to properly merge
            const approachDistance = 10;
            const exitDistance = 3;
            
            if (this.direction === 1) {
                // Moving forward
                if (currentSegmentIndex >= zone.startSegment - approachDistance && 
                    currentSegmentIndex <= zone.endSegment + exitDistance) {
                    inConstructionZone = true;
                    
                    // All traffic should move to left lane for right lane closure
                    // Force both lanes to merge left to avoid construction
                    if (zone.blockedLane === 'right') {
                        this.enterDetour('left');
                    }
                }
            } else {
                // Moving backward (opposite direction)
                if (currentSegmentIndex <= zone.endSegment + approachDistance && 
                    currentSegmentIndex >= zone.startSegment - exitDistance) {
                    inConstructionZone = true;
                    
                    // For opposite direction, also avoid construction
                    // Since we're going backward, merge appropriately
                    if (zone.blockedLane === 'right') {
                        // Opposite traffic also needs to avoid the construction area
                        this.enterDetour('far-left');
                    }
                }
            }
        }
        
        // Exit detour if we're past the construction zone
        if (!inConstructionZone && this.inDetour) {
            this.exitDetour();
        }
    }
    
    enterDetour(newLane) {
        if (!this.inDetour) {
            this.inDetour = true;
            this.detourSide = newLane;
            console.log(`Car entering detour, moving from ${this.lane} to ${newLane} lane`);
            this.currentSpeed = Math.min(this.currentSpeed, this.baseSpeed * 0.4);
        } else if (this.detourSide !== newLane) {
            this.detourSide = newLane;
            this.currentSpeed = Math.min(this.currentSpeed, this.baseSpeed * 0.4);
        }
    }
    
    exitDetour() {
        if (this.inDetour) {
            console.log(`Car exiting detour, returning to normal lane`);
            this.inDetour = false;
            this.detourSide = null;
        }
    }
}

class AIMotorcycle {
    // A world rider's pass: metres of road it takes, and how far it swings toward the centre line
    static get PASS_M() { return 40; }
    static get PASS_SWING_M() { return 2; }
    // A world rider closes up on a player who is this far ahead of it (metres along its heading), and not nearer:
    // alongside or just past, it holds its own pace
    static get CHASE_FROM_M() { return 12; }
    static get CHASE_TO_M() { return 35; }
    // Beyond this many metres from the player a rider is out of sight enough to change its model unseen
    static get UNSEEN_M() { return 120; }
    // A rider in sight waits at most this many frames for such a moment, then changes anyway: on the first ride of a
    // page the riders nearest the player start code-drawn, and a change seen once at the start is better than the
    // wrong bike beside the player for the next minutes
    static get SEEN_WAIT_FRAMES() { return 45; }

    constructor(scene, environment, options) {
        this.scene = scene;
        this.environment = environment;
        this.direction = options.direction || 1;
        this.baseSpeed = options.speed || 35;
        this.currentSpeed = this.baseSpeed;
        this.currentSegment = options.startSegment || 0;
        // A leg's lane (Car's note); a world rider's side is its direction's
        this.lane = options.lane || 'left';
        this.color = options.color || 0xff0000;
        this.style = options.style || 'sport';
        this.segmentProgress = 0;
        this.leanAngle = 0;
        this.overtaking = false;
        this.overtakeProgress = 0;

        // Who rides it: one of CHARACTERS on one of its bikes (BIKE_MODELS), for a rider of the touring crew
        this.character = options.character || null;
        this.model = options.model || null;
        this.riderName = options.riderName || (this.character ? this.character.name : 'Unknown Rider');
        this.helmetColor = options.helmetColor || 0x000000;
        this.suitColor = options.suitColor || 0x2a2a2a;
        this.skill = options.skill || 'average';
        // A rider of the crew: {luck, scale}, its share of the pace's spread and the speed scale of the place (takePace)
        this.pace = options.pace || null;

        this.createBikeModel();

        if (this.environment && this.environment.route && this.environment.route.unitCount > 0) {
            this.updatePosition();
        }

        // Log rider identity for debugging
        console.log(`AI Rider spawned: ${this.riderName} (${this.skill}) on ${this.style} bike`);
    }
    
    createBikeModel() {
        this.bikeGroup = new THREE.Group();
        
        // Tire material
        const tireMaterial = new THREE.MeshStandardMaterial({
            color: 0x0d0d0d,
            roughness: 0.98,
            metalness: 0.0
        });

        // Rim material - colored for variety
        const rimMaterial = new THREE.MeshStandardMaterial({
            color: 0xb0b0b0,  // Silver/chrome
            roughness: 0.2,
            metalness: 0.9
        });

        // Rear wheel with spokes
        const rearWheelGroup = new THREE.Group();

        const rearTireGeometry = new THREE.CylinderGeometry(0.3, 0.3, 0.12, 16);
        const rearTire = new THREE.Mesh(rearTireGeometry, tireMaterial);
        rearTire.rotation.z = Math.PI / 2;
        rearWheelGroup.add(rearTire);

        const rearRimGeometry = new THREE.CylinderGeometry(0.18, 0.18, 0.13, 14);
        const rearRim = new THREE.Mesh(rearRimGeometry, rimMaterial);
        rearRim.rotation.z = Math.PI / 2;
        rearWheelGroup.add(rearRim);

        const rearHubGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.14, 10);
        const rearHub = new THREE.Mesh(rearHubGeometry, rimMaterial);
        rearHub.rotation.z = Math.PI / 2;
        rearWheelGroup.add(rearHub);

        // 5 spokes for AI bikes (simpler than player)
        const rearSpokeGeometry = new THREE.BoxGeometry(0.02, 0.14, 0.1);
        for (let i = 0; i < 5; i++) {
            const spoke = new THREE.Mesh(rearSpokeGeometry, rimMaterial);
            spoke.rotation.z = Math.PI / 2;
            spoke.rotation.y = (i * Math.PI * 2) / 5;
            rearWheelGroup.add(spoke);
        }

        rearWheelGroup.position.set(0, 0.3, -0.6);
        rearWheelGroup.castShadow = true;
        this.rearWheel = rearWheelGroup;
        this.bikeGroup.add(rearWheelGroup);

        // Front wheel with spokes
        const frontWheelGroup = new THREE.Group();

        const frontTireGeometry = new THREE.CylinderGeometry(0.28, 0.28, 0.11, 16);
        const frontTire = new THREE.Mesh(frontTireGeometry, tireMaterial);
        frontTire.rotation.z = Math.PI / 2;
        frontWheelGroup.add(frontTire);

        const frontRimGeometry = new THREE.CylinderGeometry(0.17, 0.17, 0.12, 14);
        const frontRim = new THREE.Mesh(frontRimGeometry, rimMaterial);
        frontRim.rotation.z = Math.PI / 2;
        frontWheelGroup.add(frontRim);

        const frontHubGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.13, 10);
        const frontHub = new THREE.Mesh(frontHubGeometry, rimMaterial);
        frontHub.rotation.z = Math.PI / 2;
        frontWheelGroup.add(frontHub);

        // 5 spokes
        const frontSpokeGeometry = new THREE.BoxGeometry(0.02, 0.13, 0.1);
        for (let i = 0; i < 5; i++) {
            const spoke = new THREE.Mesh(frontSpokeGeometry, rimMaterial);
            spoke.rotation.z = Math.PI / 2;
            spoke.rotation.y = (i * Math.PI * 2) / 5;
            frontWheelGroup.add(spoke);
        }

        frontWheelGroup.position.set(0, 0.3, 0.6);
        frontWheelGroup.castShadow = true;
        this.frontWheel = frontWheelGroup;
        this.bikeGroup.add(frontWheelGroup);
        
        const isSport = this.style === 'sport';
        const isCruiser = this.style === 'cruiser';

        // Shared materials
        const frameMaterial = new THREE.MeshStandardMaterial({
            color: this.color,
            roughness: 0.18,
            metalness: 0.85
        });
        const darkMetalMaterial = new THREE.MeshStandardMaterial({
            color: 0x2a2a2a,
            roughness: 0.5,
            metalness: 0.7
        });
        const chromeMaterial = new THREE.MeshStandardMaterial({
            color: 0xc0c0c0,
            roughness: 0.1,
            metalness: 1.0
        });
        const glassMaterial = new THREE.MeshStandardMaterial({
            color: 0x0a141e,
            roughness: 0.08,
            metalness: 0.6
        });

        // Frame spine (mostly hidden behind tank/fairings)
        const frameGeometry = isCruiser
            ? new THREE.BoxGeometry(0.1, 0.4, 1.1)
            : new THREE.BoxGeometry(0.08, 0.45, 0.95);
        this.frame = new THREE.Mesh(frameGeometry, frameMaterial);
        this.frame.position.set(0, 0.5, 0);
        this.frame.castShadow = true;
        this.bikeGroup.add(this.frame);

        // Front forks - paired tubes from the headstock down to the front axle
        const forkGeometry = new THREE.CylinderGeometry(0.022, 0.022, 0.52, 6);
        const forkTilt = -Math.atan2(0.18, 0.46); // top of the forks rakes rearward
        [-0.07, 0.07].forEach(x => {
            const fork = new THREE.Mesh(forkGeometry, chromeMaterial);
            fork.position.set(x, 0.53, 0.51);
            fork.rotation.x = forkTilt;
            fork.castShadow = true;
            this.bikeGroup.add(fork);
        });

        // Handlebar across the headstock
        const handlebarGeometry = new THREE.CylinderGeometry(0.018, 0.018, 0.36, 6);
        const handlebar = new THREE.Mesh(handlebarGeometry, darkMetalMaterial);
        handlebar.rotation.z = Math.PI / 2;
        handlebar.position.set(0, 0.8, 0.42);
        handlebar.castShadow = true;
        this.bikeGroup.add(handlebar);

        // Swingarm to the rear axle
        const swingarmGeometry = new THREE.BoxGeometry(0.03, 0.06, 0.55);
        [-0.08, 0.08].forEach(x => {
            const swingarm = new THREE.Mesh(swingarmGeometry, darkMetalMaterial);
            swingarm.position.set(x, 0.33, -0.34);
            swingarm.rotation.x = 0.12;
            swingarm.castShadow = true;
            this.bikeGroup.add(swingarm);
        });

        // Sculpted fuel tank - a squashed sphere reads as a teardrop tank
        const tankGeometry = new THREE.SphereGeometry(0.16, 10, 8);
        this.tank = new THREE.Mesh(tankGeometry, frameMaterial);
        this.tank.position.set(0, 0.74, 0.12);
        if (isSport) {
            this.tank.scale.set(1.05, 0.85, 1.9);
        } else if (isCruiser) {
            this.tank.scale.set(1.2, 0.75, 1.7);
        } else {
            this.tank.scale.set(0.9, 0.7, 1.5);
        }
        this.tank.castShadow = true;
        this.bikeGroup.add(this.tank);

        // Fairings for sport bikes only
        if (isSport) {
            // Nose fairing - smooth rounded cowl around the headlight
            const noseGeometry = new THREE.SphereGeometry(0.18, 10, 8);
            this.frontFairing = new THREE.Mesh(noseGeometry, frameMaterial);
            this.frontFairing.position.set(0, 0.64, 0.55);
            this.frontFairing.scale.set(1.0, 1.25, 1.55);
            this.frontFairing.castShadow = true;
            this.bikeGroup.add(this.frontFairing);

            // Windscreen - raked dark glass above the nose
            const windscreenGeometry = new THREE.BoxGeometry(0.24, 0.2, 0.02);
            this.windscreen = new THREE.Mesh(windscreenGeometry, glassMaterial);
            this.windscreen.position.set(0, 0.9, 0.46);
            this.windscreen.rotation.x = -0.65;
            this.windscreen.castShadow = true;
            this.bikeGroup.add(this.windscreen);

            // Side fairings - smooth bulges along the flanks
            const sideFairingGeometry = new THREE.SphereGeometry(0.14, 8, 6);
            this.leftSideFairing = new THREE.Mesh(sideFairingGeometry, frameMaterial);
            this.leftSideFairing.position.set(-0.13, 0.52, 0.1);
            this.leftSideFairing.scale.set(0.5, 1.3, 2.6);
            this.leftSideFairing.castShadow = true;
            this.bikeGroup.add(this.leftSideFairing);

            this.rightSideFairing = new THREE.Mesh(sideFairingGeometry, frameMaterial);
            this.rightSideFairing.position.set(0.13, 0.52, 0.1);
            this.rightSideFairing.scale.set(0.5, 1.3, 2.6);
            this.rightSideFairing.castShadow = true;
            this.bikeGroup.add(this.rightSideFairing);

            // Tail section - pointed cone kicked up behind the seat
            const tailGeometry = new THREE.ConeGeometry(0.13, 0.5, 8);
            this.tailSection = new THREE.Mesh(tailGeometry, frameMaterial);
            this.tailSection.rotation.x = -Math.PI / 2 - 0.15; // apex rearward, kicked up
            this.tailSection.position.set(0, 0.68, -0.42);
            this.tailSection.scale.set(1.2, 1, 0.7);
            this.tailSection.castShadow = true;
            this.bikeGroup.add(this.tailSection);
        }

        const seatGeometry = new THREE.BoxGeometry(0.26, 0.08, 0.38);
        const seatMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a,
            roughness: 0.8,
            metalness: 0.0
        });
        this.seat = new THREE.Mesh(seatGeometry, seatMaterial);
        this.seat.position.set(0, 0.62, -0.2);
        this.seat.castShadow = true;
        this.bikeGroup.add(this.seat);

        // Rider - capsule torso in a tuck, arms reaching to the bars
        const riderMaterial = new THREE.MeshStandardMaterial({
            color: this.suitColor,  // Use rider's custom suit color
            roughness: 0.65,
            metalness: 0.15
        });
        const crouch = isSport ? 0.7 : (isCruiser ? 0.2 : 0.4);

        const torsoGeometry = new THREE.CapsuleGeometry(0.11, 0.28, 4, 8);
        this.rider = new THREE.Mesh(torsoGeometry, riderMaterial);
        this.rider.position.set(0, 1.0 - crouch * 0.12, -0.08);
        this.rider.rotation.x = crouch;
        this.rider.castShadow = true;
        this.bikeGroup.add(this.rider);

        // Arms to the handlebar
        const armGeometry = new THREE.CapsuleGeometry(0.035, 0.26, 4, 6);
        [-0.13, 0.13].forEach(x => {
            const arm = new THREE.Mesh(armGeometry, riderMaterial);
            arm.position.set(x, 0.93 - crouch * 0.1, 0.16);
            arm.rotation.x = 0.9 + crouch * 0.3;
            arm.castShadow = true;
            this.bikeGroup.add(arm);
        });

        // Thighs gripping the tank
        const legGeometry = new THREE.CapsuleGeometry(0.05, 0.2, 4, 6);
        [-0.14, 0.14].forEach(x => {
            const leg = new THREE.Mesh(legGeometry, riderMaterial);
            leg.position.set(x, 0.68, -0.12);
            leg.rotation.x = 1.2;
            leg.castShadow = true;
            this.bikeGroup.add(leg);
        });

        // Rounded helmet with dark visor, tipped forward with the tuck
        const helmetGeometry = new THREE.SphereGeometry(0.13, 12, 8);
        const helmetMaterial = new THREE.MeshStandardMaterial({
            color: this.helmetColor,  // Use rider's custom helmet color
            roughness: 0.15,
            metalness: 0.6
        });
        this.helmet = new THREE.Mesh(helmetGeometry, helmetMaterial);
        this.helmet.position.set(0, 1.3 - crouch * 0.18, -0.08 + crouch * 0.18);
        this.helmet.scale.set(0.95, 1, 1.1);
        this.helmet.castShadow = true;
        this.bikeGroup.add(this.helmet);

        const visorGeometry = new THREE.SphereGeometry(0.115, 8, 6);
        this.visor = new THREE.Mesh(visorGeometry, glassMaterial);
        this.visor.position.set(
            0,
            this.helmet.position.y - 0.01,
            this.helmet.position.z + 0.05
        );
        this.visor.scale.set(0.8, 0.55, 0.95);
        this.bikeGroup.add(this.visor);

        // Exhaust - upswept can on sport bikes, low pipe otherwise
        const exhaustGeometry = new THREE.CylinderGeometry(0.045, 0.03, 0.5, 10);
        const exhaustMaterial = new THREE.MeshStandardMaterial({
            color: 0xc0c0c0,
            roughness: 0.1,
            metalness: 1.0
        });
        this.exhaust = new THREE.Mesh(exhaustGeometry, exhaustMaterial);
        if (isSport) {
            this.exhaust.rotation.x = Math.PI / 2 + 0.3;
            this.exhaust.position.set(0.14, 0.45, -0.42);
        } else {
            this.exhaust.rotation.x = Math.PI / 2;
            this.exhaust.position.set(0.14, 0.32, -0.35);
        }
        this.exhaust.castShadow = true;
        this.bikeGroup.add(this.exhaust);

        // Dark exhaust tip
        const exhaustTipGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.06, 10);
        const exhaustTip = new THREE.Mesh(exhaustTipGeometry, darkMetalMaterial);
        exhaustTip.rotation.copy(this.exhaust.rotation);
        if (isSport) {
            exhaustTip.position.set(0.14, 0.37, -0.65);
        } else {
            exhaustTip.position.set(0.14, 0.32, -0.61);
        }
        exhaustTip.castShadow = true;
        this.bikeGroup.add(exhaustTip);

        const brakeLightGeometry = new THREE.BoxGeometry(0.08, 0.04, 0.03);
        const brakeLightMaterial = new THREE.MeshStandardMaterial({
            color: 0xff0000,
            emissive: 0x000000,
            emissiveIntensity: 0,
            roughness: 0.3,
            metalness: 0.2
        });
        this.brakeLight = new THREE.Mesh(brakeLightGeometry, brakeLightMaterial);
        this.brakeLight.position.set(0, 0.74, -0.66);
        this.brakeLight.castShadow = true;
        this.bikeGroup.add(this.brakeLight);

        // Headlight - flattened lens set into the nose
        const headlightGeometry = new THREE.SphereGeometry(0.07, 10, 6);
        const headlightMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: 0xffffee,
            emissiveIntensity: 0.6,
            roughness: 0.1,
            metalness: 0.4
        });
        this.headlight = new THREE.Mesh(headlightGeometry, headlightMaterial);
        this.headlight.position.set(0, 0.64, isSport ? 0.72 : 0.6);
        this.headlight.scale.set(1.1, 0.7, 0.6);
        this.headlight.castShadow = true;
        this.bikeGroup.add(this.headlight);

        const numberPlateGeometry = new THREE.BoxGeometry(0.12, 0.06, 0.01);
        const numberPlateMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.7,
            metalness: 0.1
        });
        this.numberPlate = new THREE.Mesh(numberPlateGeometry, numberPlateMaterial);
        this.numberPlate.position.set(0, 0.6, -0.68);
        this.numberPlate.castShadow = true;
        this.bikeGroup.add(this.numberPlate);
        
        this.isBraking = false;

        // Every mesh casts a shadow (covers wheel internals, visor, forks)
        this.bikeGroup.traverse(obj => {
            if (obj.isMesh) obj.castShadow = true;
        });

        this.scene.add(this.bikeGroup);

        // A rider of the touring crew rides its character's own bike once its files are in
        // (js/bikemodels.js); the parts built above stand until then
        // (dressedAtStart: dressed as it was made, its files already in; else it showed the procedural bike first)
        if (this.character && typeof BikeModels !== 'undefined') this.dressedAtStart = BikeModels.crew(this) === true;
    }

    // The modelled rider's body goes into the turn as its character does (CHARACTERS bodyLean, Vehicle.riderLean),
    // and its hands and feet stay on the grips and the pegs (Vehicle.holdRider). Drawn only: the line, the speed
    // and the bike's own lean are as they were
    leanRider() {
        if (!this.arms || !this.riderBasePos || typeof Vehicle === 'undefined') return;
        const lean = Vehicle.riderLean(this.leanAngle, this.character.bodyLean);
        this.rider.rotation.z = lean.roll;
        this.rider.position.x = this.riderBasePos.x + lean.shift;
        Vehicle.prototype.holdRider.call(this);
    }
    
    updatePosition() {
        const route = this.environment.route;
        if (route.laneCurve) {
            this.updateLanePosition(route);
            return;
        }
        const road = route.sampleAt(this.currentSegment, this.segmentProgress, this.roadSample || (this.roadSample = {}));
        const { x, y, z } = road;
        const interpolatedHeading = road.heading;
        
        const lane = route.laneOffset(route.fromUnits(this.currentSegment + this.segmentProgress));
        let laneOffset = this.lane === 'left' ? -lane : lane;
        
        // Add pack lateral offset for natural spread
        if (this.packLateralOffset) {
            laneOffset += this.packLateralOffset;
        }
        
        if (this.overtaking) {
            const overtakeLaneOffset = Math.sin(this.overtakeProgress * Math.PI) * 2;
            laneOffset += overtakeLaneOffset;
        }
        
        const perpX = Math.cos(interpolatedHeading) * laneOffset;
        const perpZ = -Math.sin(interpolatedHeading) * laneOffset;
        
        const roadElevation = y || 0;
        this.bikeGroup.position.set(x + perpX, roadElevation, z + perpZ);
        
        const facingAngle = Math.atan2(road.dx, road.dz);
        
        // Calculate turn rate based on heading change
        const headingChange = road.turn;
        
        // Calculate lean angle based on turn rate and speed (motorcycle physics)
        // Lean = arctan(v² * turnRate / g)
        const turnRate = Math.abs(headingChange) * 0.5;
        const speedSquared = this.currentSpeed * this.currentSpeed;
        const targetLean = -Math.atan((speedSquared * turnRate) / (9.81 * 8)) * Math.sign(headingChange);
        
        // Smoothly interpolate to target lean angle
        const leanSpeed = 3.0;
        this.leanAngle += (targetLean - this.leanAngle) * leanSpeed * (this.currentDeltaTime || 0.016);
        
        // Clamp lean angle to realistic limits
        const maxLean = Math.PI / 3; // 60 degrees max
        this.leanAngle = Math.max(-maxLean, Math.min(maxLean, this.leanAngle));
        
        this.bikeGroup.rotation.y = facingAngle;
        this.bikeGroup.rotation.z = this.leanAngle;
        this.leanRider();
    }

    // Where a bike rides across the road off its lane line (+ is Route.LEFT): a bump's nudge, and a rider of the group's
    // own line (CrewGroup.roadOf)
    static sideOf(bike) {
        return (bike.nudge || 0) + (bike.ride ? -Route.keepRight(bike.direction) * (bike.ride.driftShown || 0) : 0);
    }

    // A world rider on its lane line (WorldRoute.laneCurve). A pass swings it out toward the centre line and back over
    // PASS_M of road by sin^4, so its heading and yaw rate have no step at either end; the pack's random spread is
    // left out, as it moved the rider across the road at up to 4 m/s from frame to frame. It leans for the line's own
    // curvature at its speed.
    updateLanePosition(route) {
        const u = this.currentSegment + this.segmentProgress;
        const lane = this.laneSample || (this.laneSample = {});
        route.laneCurve(u, this.direction, 0, 0, lane);
        // (a rider bumped by the player is `nudge` off its line for a while: Traffic.touch, stepNudge)
        let extra = this.nudge || 0, extraRate = 0;
        // A rider of the group passing, or moving into a stopping place or out of it (CrewGroup)
        const ride = this.ride;
        if (ride && (ride.off !== 0 || ride.offRate !== 0)) {
            extra += ride.off;
            extraRate += ride.offRate * lane.metres * this.direction;
        }
        // Its own line across its lane (CrewGroup.roadOf: + toward the centre line)
        if (ride && ride.driftShown) {
            const toCentre = -Route.keepRight(this.direction);
            extra += toCentre * ride.driftShown;
            extraRate += toCentre * ride.driftRate / Math.max(2, this.currentSpeed || 0) * lane.metres * this.direction;
        }
        if (this.overtaking) {
            const p = Math.PI * this.overtakeProgress, sin = Math.sin(p);
            const toCentre = -Route.keepRight(this.direction) * AIMotorcycle.PASS_SWING_M;
            extra += toCentre * sin ** 4;
            extraRate = toCentre * 4 * sin ** 3 * Math.cos(p) * Math.PI / AIMotorcycle.PASS_M * lane.metres * this.direction;
        }
        if (extra !== 0 || extraRate !== 0) route.laneCurve(u, this.direction, extra, extraRate, lane);
        this.laneExtra = extra;
        this.bikeGroup.position.set(lane.x, lane.y, lane.z);
        // In a stopping place it stands on the place's ground, eased over as it moves across
        if (ride && Number.isFinite(ride.at.y) && ride.at.off !== 0 && (ride.state === 'toWait' || ride.state === 'wait' || ride.state === 'out')) {
            this.bikeGroup.position.y += (ride.at.y - lane.y) * Math.max(0, Math.min(1, ride.off / ride.at.off));
        }
        this.bikeGroup.rotation.y = this.direction === 1 ? lane.heading : lane.heading + Math.PI;
        // In a stopping place it stands turned on its spot (CrewGroup.spot), turned in as it moves across
        if (ride && ride.at.yaw && ride.at.off !== 0 && (ride.state === 'toWait' || ride.state === 'wait' || ride.state === 'out')) {
            this.bikeGroup.rotation.y += ride.at.yaw * Math.max(0, Math.min(1, ride.off / ride.at.off)) ** 2;
        }
        const curvature = lane.curvature * this.direction;
        const targetLean = -Math.atan(this.currentSpeed * this.currentSpeed * curvature / 9.81);
        this.leanAngle += (targetLean - this.leanAngle) * Math.min(1, 3.0 * (this.currentDeltaTime || 0.016));
        const maxLean = Math.PI / 3;
        this.leanAngle = Math.max(-maxLean, Math.min(maxLean, this.leanAngle));
        this.bikeGroup.rotation.z = this.leanAngle;
        // A rider the player rode into shakes while it slows (CONTACT.crash), less as it gathers itself
        if (this.shakenS > 0) this.bikeGroup.rotation.z += CONTACT.crash.wobble * Math.sin(2 * Math.PI * CONTACT.crash.wobbleHz * (this.shakeT || 0)) * this.shakenS / CONTACT.crash.slowS;
        this.leanRider();
    }

    // Where a rider may be off its lane line, for a `want` of metres (+ is Route.LEFT): at most CONTACT.nudge.mostM,
    // its box on its own half of the road and on the carriageway, and on its line in a roadworks single lane
    nudgeRoom(want) {
        const route = this.environment.route;
        if (this.inSingleLane || !this.laneSample || !route.laneCurve) return 0;
        const most = CONTACT.nudge.mostM, half = Traffic.sizeOf('bike', this.model).width / 2 + 0.1;
        const base = this.laneSample.lateral - (this.laneExtra || 0);
        const own = Math.sign(base) || Route.keepRight(this.direction);
        const width = route.sample(route.fromUnits(this.currentSegment + this.segmentProgress), this.widthSample || (this.widthSample = {})).width;
        if (width / 2 - half < half) return 0;
        const at = Math.max(half, Math.min(width / 2 - half, (base + Math.max(-most, Math.min(most, want))) * own));
        return at * own - base;
    }

    // The rider moves toward where a bump sent it while the player is beside it, and back to its line once the player
    // has gone (Traffic.contact sets nudgeFree): never across the road toward a bike that is there
    stepNudge(deltaTime) {
        const held = this.nudgeFree === false;
        const want = held ? this.nudgeWant || 0 : 0, now = this.nudge || 0;
        if (now === want) return;
        const most = (held ? CONTACT.bump.shoveMs : CONTACT.nudge.backMs) * deltaTime;
        this.nudge = now + Math.max(-most, Math.min(most, want - now));
        if (!held && this.nudge === 0) this.nudgeWant = 0;
    }

    // Back along its lane line by `metres`: a rider that came into the player's back stands clear of it again
    dropBack(metres) {
        const route = this.environment.route;
        const lane = route.laneCurve(this.currentSegment + this.segmentProgress, this.direction, 0, 0, this.stepSample || (this.stepSample = {}));
        const u = Math.max(0, this.currentSegment + this.segmentProgress - this.direction * metres / Math.max(lane.metres, 0.05));
        this.currentSegment = Math.floor(u);
        this.segmentProgress = u - Math.floor(u);
        this.updatePosition();
    }
    
    // A rider of the crew in a world rides the road it is on at its own pace for that kind of road: its base speed, and
    // the sideways acceleration it takes a bend at. The kinds blend along the road, so neither has a step; the speed
    // itself is eased by laneSpeed. A leg rider keeps the pace it started with.
    takePace(route) {
        if (!this.pace || !this.character || typeof route.kindAt !== 'function') return;
        const kind = route.kindAt(route.fromUnits(this.currentSegment + this.segmentProgress), this.kindSample || (this.kindSample = {}));
        const pace = Traffic.paceOf(Traffic.roadTrait(this.character, kind), this.paceSample || (this.paceSample = {}));
        // (a rider of a world's group rides at the group's pace, GROUP.pace)
        const group = this.ride ? GROUP.pace : 1, grip = Math.min(group * group, this.ride ? GROUP.gripMost : 1);
        this.baseSpeed = (pace.speed + this.pace.luck * pace.spread) * this.pace.scale * group;
        if (!this.drive) this.drive = { ...LANE_DRIVE.bike };
        this.drive.plan = Math.min(LANE_DRIVE.bike.plan * grip, this.ride ? GROUP.planMost : Infinity);
        this.drive.accel = LANE_DRIVE.bike.accel * grip;
        this.drive.turnIn = LANE_DRIVE.bike.turnIn * grip;
        // (a rider of the group at a share of its pace takes its bends at that share of their speed)
        const share = this.ride ? this.ride.factor : 1;
        // (the group narrows the crew's spread of cornering to GROUP.cornerSpan of it, up from the slowest)
        const corner = this.ride ? LANE_DRIVE.bike.lateral - (LANE_DRIVE.bike.lateral - pace.corner) * GROUP.cornerSpan : pace.corner;
        this.drive.lateral = Math.min(LANE_DRIVE.bike.lateral * grip, corner * grip * (this.ride ? share ** GROUP.bendPower : share * share));
    }

    update(deltaTime, playerPosition, allBikes, allCars) {
        this.currentDeltaTime = deltaTime;
        const route = this.environment.route;
        const world = !!route.laneCurve;
        if (world) this.takePace(route);
        const segmentLength = route.unitM;
        const distanceToMove = world ? laneMetres(route, this, deltaTime) : this.currentSpeed * deltaTime;
        const segmentsToMove = world ? laneStep(route, this, distanceToMove) : distanceToMove / segmentLength;
        
        if (!this.wheelRotation) this.wheelRotation = 0;
        const rotationSpeed = this.currentSpeed / 0.3; // rad/s = v / r
        this.wheelRotation += rotationSpeed * deltaTime;
        this.rearWheel.rotation.x = this.wheelRotation;
        this.frontWheel.rotation.x = this.wheelRotation;
        
        const previousSpeed = this.currentSpeed;
        
        // "Ahead" is measured as progress along the road path, not world +Z -
        // on a winding course the road frequently heads in -Z, where raw z
        // comparisons invert (drafting off bikes behind, braking for cars behind)
        const myProgress = this.currentSegment + this.segmentProgress;

        // Check for nearby bikes (pack dynamics)
        let nearestBikeAhead = null;
        let minDistanceAhead = Infinity;

        if (allBikes) {
            allBikes.forEach(otherBike => {
                if (otherBike !== this && otherBike.bikeGroup) {
                    const otherProgress = otherBike.currentSegment + otherBike.segmentProgress;
                    const aheadMeters = (otherProgress - myProgress) * segmentLength;

                    if (aheadMeters > 0 && aheadMeters < minDistanceAhead) {
                        minDistanceAhead = aheadMeters;
                        nearestBikeAhead = otherBike;
                    }
                }
            });
        }

        // Check for cars ahead and avoid (the Traffic owner passes its car
        // list - traversing the whole scene graph per bike per tick is O(scene))
        let carAhead = false;
        if (allCars) {
            for (const car of allCars) {
                if (!car.carGroup) continue;
                const carProgress = car.currentSegment + car.segmentProgress;
                const aheadMeters = (carProgress - myProgress) * segmentLength;

                if (aheadMeters > 0 && aheadMeters < 25) {
                    carAhead = true;
                    break;
                }
            }
        }
        
        if (world && this.ride) {
            // A rider of a world's group rides its share of its own pace, or a pass's least speed, or stands
            // (CrewGroup); the following rule keeps it off the back of what is ahead
            this.currentSpeed = this.ride.stand ? 0 : Math.min(this.ride.capMs, Math.max(this.baseSpeed * this.ride.factor, this.ride.floorMs));
        } else if (carAhead) {
            this.currentSpeed = Math.min(this.currentSpeed, this.baseSpeed * 0.7);
        } else if (nearestBikeAhead && minDistanceAhead < 15) {
            // Pack riding - match speed with slight increase for drafting effect
            const draftBoost = minDistanceAhead < 10 ? 1.4 : 1.35;
            this.currentSpeed = Math.min(this.baseSpeed * draftBoost, 58);
            // Close enough to touch: hold the leader's pace instead of
            // riding through its back wheel
            if (minDistanceAhead < 6) {
                this.currentSpeed = Math.min(this.currentSpeed, nearestBikeAhead.currentSpeed);
            }
            
            // Small lateral variation for pack dynamics. A leg's: a world rider keeps its lane line and never read it,
            // so a world draws nothing here (it drew from Math.random each frame a rider was in a pack)
            if (!world) {
                if (!this.packLateralOffset) this.packLateralOffset = 0;
                const targetOffset = (Math.random() - 0.5) * 1.5;
                this.packLateralOffset += (targetOffset - this.packLateralOffset) * 0.05;
            }
        } else if (playerPosition && world) {
            // A world rider never races the player: it starts no pass because the player is near, and it does not
            // speed up while the player is alongside or coming past (the leg rule below did both, and the pass swings
            // toward the centre line: into a player who overtakes there). It closes up only on a player who is ahead
            // of it and clear, by CHASE_FROM_M to CHASE_TO_M along its own heading
            const heading = this.bikeGroup.rotation.y;
            const ahead = (playerPosition.x - this.bikeGroup.position.x) * Math.sin(heading) + (playerPosition.z - this.bikeGroup.position.z) * Math.cos(heading);
            const chase = ahead > AIMotorcycle.CHASE_FROM_M && ahead < AIMotorcycle.CHASE_TO_M;
            this.currentSpeed = chase ? Math.min(this.baseSpeed * 1.28, 54) : this.baseSpeed;
            this.packLateralOffset = 0;
        } else if (playerPosition) {
            const dx = this.bikeGroup.position.x - playerPosition.x;
            const dz = this.bikeGroup.position.z - playerPosition.z;
            const distanceToPlayer = Math.sqrt(dx * dx + dz * dz);
            
            // More aggressive pursuit when close to player
            if (distanceToPlayer < 30 && distanceToPlayer > 10) {
                this.currentSpeed = Math.min(this.baseSpeed * 1.28, 54);
            } else if (distanceToPlayer < 10) {
                this.currentSpeed = Math.min(this.baseSpeed * 1.35, 56);
                // Never a pass that would swing across a roadworks single lane
                const works = world && this.environment.roadworks;
                if (!works || !works.siteAhead(route.fromUnits(myProgress), this.direction, AIMotorcycle.PASS_M + 20)) this.overtaking = true;
            } else {
                this.currentSpeed = this.baseSpeed;
                this.packLateralOffset = 0;
            }
        } else {
            this.currentSpeed = this.baseSpeed;
            this.packLateralOffset = 0;
        }
        
        if (world) {
            // A rider the player rode into slows hard for a moment and cannot be hit again until it has ridden clear
            if (this.ghostS > 0) this.ghostS = Math.max(0, this.ghostS - deltaTime);
            if (this.shakenS > 0) {
                this.shakenS = Math.max(0, this.shakenS - deltaTime);
                this.shakeT = (this.shakeT || 0) + deltaTime;
                this.currentSpeed = Math.min(this.currentSpeed, this.baseSpeed * CONTACT.crash.slowTo);
            }
            this.stepNudge(deltaTime);
        }

        // A world rider eases toward what the pack asks, no faster than it can brake for the bends ahead
        if (world) this.currentSpeed = laneSpeed(route, this, previousSpeed, this.currentSpeed, this.drive || LANE_DRIVE.bike, deltaTime);

        this.isBraking = this.currentSpeed < previousSpeed;
        if (this.isBraking) {
            this.brakeLight.material.emissive.setHex(0xff0000);
            this.brakeLight.material.emissiveIntensity = 1.0;
        } else {
            this.brakeLight.material.emissive.setHex(0x000000);
            this.brakeLight.material.emissiveIntensity = 0;
        }
        
        if (this.overtaking && world) {
            // A world pass runs over PASS_M of road, not a fixed time: at hairpin speed a timed swing crossed 2 m in a few metres
            this.overtakeProgress = Math.min(1, this.overtakeProgress + distanceToMove / AIMotorcycle.PASS_M);
            if (this.overtakeProgress >= 1) {
                this.overtaking = false;
                this.overtakeProgress = 0;
            }
        } else if (this.overtaking) {
            this.overtakeProgress = Math.min(1, this.overtakeProgress + deltaTime * 0.8);
            this.leanAngle = Math.sin(this.overtakeProgress * Math.PI) * 0.2;
            
            // Move to side during overtake
            const overtakeLaneOffset = Math.sin(this.overtakeProgress * Math.PI) * 2;
            
            if (this.overtakeProgress >= 1) {
                this.overtaking = false;
                this.overtakeProgress = 0;
                this.leanAngle = 0;
            }
        }
        
        this.segmentProgress += segmentsToMove * this.direction;
        // A rider of the group moves across the road by the metres it rode (CrewGroup.advance)
        if (this.ride) CrewGroup.advance(this.ride, distanceToMove);
        
        while (this.segmentProgress >= 1) {
            this.segmentProgress -= 1;
            this.currentSegment += 1;
        }
        
        while (this.segmentProgress < 0) {
            this.segmentProgress += 1;
            this.currentSegment -= 1;
        }
        
        // A rider that runs out of rendered road has finished the leg: park
        // it out of sight at the end (it still counts as ahead of the player)
        const range = legSegmentRange(this.environment);
        if (this.currentSegment >= range.end) {
            this.currentSegment = range.end;
            this.segmentProgress = 0;
            this.bikeGroup.visible = false;
        } else if (!this.bikeGroup.visible) {
            this.bikeGroup.visible = true;
        }
        
        this.updatePosition();
        this.takeModel(playerPosition);
    }

    // A model whose files came after the bike set off (BikeModels.crew) is put on when the player cannot see the
    // change: the bike is hidden, or further off than UNSEEN_M. A bike that stays in sight takes it after
    // SEEN_WAIT_FRAMES
    takeModel(playerPosition) {
        if (!this.modelWaiting) return;
        const at = this.bikeGroup.position;
        const far = playerPosition && Math.hypot(at.x - playerPosition.x, at.z - playerPosition.z) > AIMotorcycle.UNSEEN_M;
        this.modelWaitFrames = (this.modelWaitFrames || 0) + 1;
        if (this.bikeGroup.visible && !far && this.modelWaitFrames <= AIMotorcycle.SEEN_WAIT_FRAMES) return;
        this.modelWaitFrames = 0;
        const swap = this.modelWaiting;
        this.modelWaiting = null;
        swap();
    }
    
    checkCollision(playerPosition) {
        const dx = this.bikeGroup.position.x - playerPosition.x;
        const dy = this.bikeGroup.position.y - playerPosition.y;
        const dz = this.bikeGroup.position.z - playerPosition.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        return distance < 0.8;
    }
    
    onCollision() {
        const originalColor = this.frame.material.color.getHex();
        this.frame.material.color.setHex(0xff0000);
        setTimeout(() => {
            this.frame.material.color.setHex(originalColor);
        }, 200);
    }
    
    remove() {
        this.scene.remove(this.bikeGroup);
        disposeGroupResources(this.bikeGroup);
    }
}

// Free GPU resources for a removed vehicle - every Car/AIMotorcycle builds
// dozens of unique geometries and materials, and Traffic.reset() rebuilds the
// whole fleet, so removal without disposal leaks WebGL buffers
function disposeGroupResources(group) {
    if (!group) return;
    group.traverse(obj => {
        if (obj.geometry) {
            obj.geometry.dispose();
        }
        const materials = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);
        materials.forEach(material => {
            Object.values(material).forEach(value => {
                if (value && value.isTexture) {
                    value.dispose();
                }
            });
            material.dispose();
        });
    });
}

// The rider's headlight beam (Traffic.inBeam, Traffic.stepDip, Game): `main` with a clear road and `dipped` with a
// vehicle in front, each the metres ahead the light is aimed at the road, its reach in metres and its share of the
// headlight's strength
Traffic.BEAM = Object.freeze({
    rangeM: 110, nearM: 3, sideM: 3.5, spread: 0.18, dipS: 0.3, holdS: 1, riseS: 0.7,
    main: Object.freeze({ aimM: 48, reachM: 150, gain: 1.15 }),
    dipped: Object.freeze({ aimM: 20, reachM: 70, gain: 0.75 })
});
