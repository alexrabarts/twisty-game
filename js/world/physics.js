// World riding physics: the parameters of the world-only branch of Vehicle.
// No THREE and no DOM, so the importer and the floor tool can load this file
// alone (tests/helpers/load-game.js loadWorldPhysics). The legs never read it:
// a leg environment has `physics: null`, and Vehicle stays on its legacy path.
const WorldPhysics = Object.freeze({
    // Lean controller
    leanCapDeg: 50,        // the lean at grip 1.0; grip lowers it (capEff). The rider's daring multiplies it (Vehicle.leanOf)
    // The lean the server's time floors are worked out at (tools/world/floors.mjs reads this line): at least the most
    // any rider has in any rider mode, leanCapDeg x the most daring rider (Vehicle.RIDER_LEAN) x the sharpest mode's
    // leanMax (RiderModes), 59.3 now. tests/unit/tuning-defaults.test.js fails when a rider or a mode passes it
    floorLeanDeg: 60,
    radiusFloor: 5,        // m, tightest radius the bike turns (R_MIN - width/2)
    rMin: 10,              // m, centreline fillet radius the importer builds
    // m, the radius a stacked hairpin is held to instead (tools/world/resample.mjs): where a rMin arc would push a
    // ladder's legs together, nearer than the map has them. At least radiusFloor, so the bike turns its centreline at
    // speed, and its inner edge at the narrowest ride (7 m) stays outside the full-lock circle (lockRadius)
    rHairpin: 6,
    // Steering (Vehicle.updateWorldPhysics). A held key leans the bike at leanRate; the lean rate follows the
    // steering with the lag leanRateLag, so a press leans the bike by the same amount whatever it was doing.
    // rad/s at full steering, up to steerSpeed: 1.725, a 0.3 s key press is about 24 degrees. Written as the product
    // (1.15 x the owner's lean rate of 1.50), which is one bit under the literal: the ride is the tuned one to the last bit
    leanRate: 1.15 * 1.5,
    leanRateLag: 0.04,     // s, how far the lean rate lags the steering (no lean momentum to fall over with)
    // The steer keys (SteerEase, js/input.js): a key is on or off, and each change of it is a ramp of the steering.
    // Only the rider's keys and touch buttons: an autopilot, the crew and the tests steer the bike directly
    steerKeys: Object.freeze({
        keyS: 0.07,        // s, the ramp of a key held or let go: a lag of 35 ms, as the smoothing it replaces (33 ms)
        featherS: 0.16,    // s, the ramp while the rider taps: tapped keys give their mean, not a lean that rocks
        featherGapS: 0.3   // s, three changes of the keys each within this of the last are tapping
    }),
    steerSpeed: 20,        // m/s, above it the rate falls as (steerSpeed / speed) ^ steerFalloff, floor 0.3
    steerFalloff: 0.7,     // 1 is the legacy speedFactor; it felt sluggish at speed with no lean momentum to help it
    pickUpBoost: 1.5,      // steering against the lean picks the bike up this much quicker (as the legacy bike)
    selfRighting: 3.5,     // 1/s, with the key released the bike stands up at this rate (the exit of a hairpin)
    leanLimitGain: 8,      // 1/s, the soft limit: the lean rate is at most this times the room under the limit
    limitReturn: 3,        // 1/s, past the limit with steering held, the lean comes back at this times the excess

    // Low-speed turn: under turnBlendSpeed the yaw rate blends (a smoothstep, 1 at rest) from the lean model to the
    // handlebar's v tan(handlebar) / wheelbase, and the floor radius drops from radiusFloor to lockRadius with it.
    // The lean limit is the lean of that floor, so the bike stands up as it slows. Above turnBlendSpeed: no change
    turnBlendSpeed: 7,     // m/s
    lockRadius: 1.6,       // m, the turn at full lock (the handlebar lock is atan(wheelbase / lockRadius)); tight for walking-pace U-turns
    handlebarLag: 0.1,     // s, how far the handlebar lags the steering

    // Low-speed lean: under lowLeanSpeed the lean limit rises (a smoothstep) to lowLeanDeg by lowLeanFullSpeed, so a rider
    // can lay the bike over for a walking-pace U-turn (the rider counterbalances; the turn itself is the handlebar's)
    lowLeanSpeed: 6,       // m/s
    lowLeanFullSpeed: 4,   // m/s
    lowLeanDeg: 40,

    // Slope and low speed. Nothing holds the bike up or pushes it along: under idleSpeed with the throttle closed it
    // rolls down at rollDecel, and under fallSpeed it either tips over (leaned more than tipLeanDeg for tipS) or the
    // rider puts a foot down and it stops (footDownDecel, the lean easing out at footDownRight)
    slopeGravity: 1.0,     // share of the route grade that acts on the bike
    idleSpeed: 4,          // m/s, the engine braking ends here
    rollDecel: 0.4,        // m/s^2 under idleSpeed with the throttle closed
    fallSpeed: 1.75,       // m/s
    tipLeanDeg: 18,
    tipS: 0.15,
    footDownDecel: 2.5,    // m/s^2
    footDownRight: 6,      // 1/s
    footDownSpeed: 1,      // m/s, under this with a foot down the bike stops

    // Drive (Vehicle.worldDrive, updateWorldSpeed). The legs keep a constant pull (the bike's acceleration, 15 m/s^2
    // x the character) at once on a key press: 0-100 km/h in 1.75 s. The world opens the throttle over
    // throttleRiseS and gives the engine a curve: the traction limit (acceleration x driveShare) from launchSpeed up
    // to powerSpeed, then constant power (falling as powerSpeed / v), with the air drag covered so the top speed
    // holds. 0-100 km/h takes about 3.9 s, 100-150 km/h about 3.3 s (flat, sport bike)
    throttleRiseS: 0.5,    // s, closed to fully open
    throttleFallS: 0.15,   // s, fully open to closed
    driveShare: 0.6,       // of the bike's acceleration: the traction limit, 9 m/s^2 on the sport bike
    powerSpeed: 15,        // m/s (54 km/h), where the pull starts to fall with speed
    launchShare: 0.5,      // of the limit at a standstill
    launchSpeed: 6,        // m/s, the whole limit from here
    aeroDrag: 0.002,       // 1/m, the air drag (x v^2), as the legs

    // Lowside: grip demand above margin * tan(capEff) for lowsideMs, on every surface (the land's capEff is lower)
    lowsideMargin: 1.15,
    lowsideMs: 200,

    cobbleGrip: 0.85,      // surface grip on a route sample flagged cobbles

    // Braking (Vehicle.updateWorldSpeed). The legs keep the bike's own brake (brakeForce, 14 m/s^2 x the
    // character); the world multiplies it by brakeGain, so the rider can scrub speed to turn in or to recover.
    // The brake shares the grip with the lean, as a friction circle: the lean's share of the cap is used, and
    // the brake keeps sqrt(1 - share^2) of itself, never under trailBrakeFloor (at the cap). It never crashes
    // the bike: braking changes only the speed, and the lowside reads the lean.
    brakeGain: 1.4,
    trailBrakeFloor: 0.3375,
    // Engine braking with the throttle closed: engineBrake x the speed, at most engineBrakeMax, and never
    // below idleSpeed. A long descent with the throttle closed settles near 13 m/s at 10%
    engineBrake: 0.06,     // 1/s
    engineBrakeMax: 2.5,   // m/s^2
    // Off the road (Vehicle.worldZone, worldLand). Three surfaces, by where the bike is against the drawn road:
    //   - the carriageway (or a side road's)
    //   - the verge: the drawn verge (RoadSurface.VERGE_M past the edge), benchDrag and nothing else
    //   - the land past it: the drawn ground, whatever the tile's zone layer calls it (a carved bench or a road node of
    //     the 8 m grid included). Drag: landRoll x speed, and landDrag x the speed over landCapSpeed, at most
    //     landDecelMax. The throttle keeps landTraction of its pull and none over landCapSpeed (fading over
    //     landCapBand), so the bike settles under the cap; the brake keeps landBrakeGrip, the lean landGrip, and the
    //     lowside reads it as on the road. Gravity follows the land's own slope. Over landCrashSpeed for landCrashS, or
    //     on land steeper than landSteepSlope (measured on the drawn ground landProbeM around the bike) for
    //     landSteepS, the bike crashes.
    benchDrag: 0.1,        // 1/s on the verge: 3.5 m/s^2 at 35 m/s
    landRoll: 0.3,         // 1/s, rolling on the grass at any speed: at full throttle the bike holds about landCapSpeed
    landDrag: 1.5,         // 1/s on the speed over landCapSpeed: 12 m/s^2 (landDecelMax) at 10 m/s
    landDecelMax: 12,      // m/s^2, the most the drag takes
    // m/s. Well under hairpin speed, or a cut across the inside of a hairpin beats the road: with the cap at 9 m/s and
    // a drag of 0.45/s, 20 of 868 cuts on the Tremola did, and at 5 m/s some still gained 0.3 s
    // (tests/unit/world-offroad.test.js)
    landCapSpeed: 4,
    landCapBand: 1,        // m/s
    landTraction: 0.6,
    landBrakeGrip: 0.6,
    landGrip: 0.55,        // a lean cap of about 33 degrees
    landCrashSpeed: 12,    // m/s
    landCrashS: 1,
    landSteepSlope: 0.85,  // rise over run, about 40 degrees: steeper than the 1:1.5 batter beside every road
    landSteepS: 0.25,
    landProbeM: 1.5,
    // The land is rough: the drawn bike bobs and rocks, more with speed (the physics is untouched)
    landBumpM: 0.06,       // m at landCapSpeed and over
    landWobbleDeg: 3,

    // An off-road bike (BIKE_MODELS `offroad`, 0 to 1; Vehicle.landValues) rides the land on knobbly tyres and long
    // suspension. Two tables and one curve give every bike its degree from that one number:
    //   - the values here are the least an off-road bike has: each land value above moves from its own toward the one
    //     here by the trait (a straight line, as when the trait was first given), so a bike with no trait reads the
    //     values above unchanged
    //   - `top` is the bike that rides most of the map (trait 1): each value moves on from the least toward `top`'s by
    //     the trait to the power `rise`, so the top of the scale is far past the middle of it and no bike is ever under
    //     its least
    //   - the values named in `pace` take that second step by the ground as well: the share of the land cover under the
    //     bike (landCover) times the share of the slope there (all of it up to slopeFrom, none from slopeTo, rise over
    //     run on the drawn ground). On steep or rough ground every off-road bike is back at its least
    // The pace is the bike's at once: a cut across a hairpin is held by the cut rule (WorldRun), not by the bike
    offroad: Object.freeze({
        landCapSpeed: 6.5,
        landRoll: 0.15,
        landDrag: 1.0,
        landTraction: 0.9,
        landBrakeGrip: 0.8,
        landGrip: 0.62,    // a lean cap of about 36 degrees
        landBumpM: 0.025,
        landWobbleDeg: 1.2,
        top: Object.freeze({
            landCapSpeed: 17,      // m/s on open, level grass
            landRoll: 0.1,
            landTraction: 1.2,     // the drive it puts down on a climb: it holds a slope of about 1 in 1
            landBrakeGrip: 0.9,
            landGrip: 0.72,        // a lean cap of about 41 degrees
            landCrashSpeed: 28,
            landSteepSlope: 1.5    // rise over run, about 56 degrees
        }),
        rise: 2,
        pace: Object.freeze(['landCapSpeed', 'landRoll']),
        slopeFrom: 0.2,
        slopeTo: 1.0
    }),
    // The land cover under the bike (WorldGround.coverAt: the tile data's class, tools/world/landcover.mjs COVER, as
    // the land is coloured). `pace` is the share of an off-road bike's pace over its least that the cover leaves,
    // `rough` scales its drawn bump and rock, `on` names the ground in a crash cause. A bike with no trait reads only
    // the name. Class 0 (no cover data) is grass, as it is drawn
    landCover: Object.freeze([
        Object.freeze({ name: 'grass', pace: 1, rough: 1, on: 'on the grass' }),
        Object.freeze({ name: 'forest', pace: 0.15, rough: 1.4, on: 'in the forest' }),
        Object.freeze({ name: 'open forest', pace: 0.4, rough: 1.3, on: 'among the trees' }),
        Object.freeze({ name: 'rock', pace: 0.4, rough: 2, on: 'on the rock' }),
        Object.freeze({ name: 'scree', pace: 0.55, rough: 1.7, on: 'on the scree' }),
        Object.freeze({ name: 'grass', pace: 1, rough: 1, on: 'on the grass' }),
        Object.freeze({ name: 'snow', pace: 0.35, rough: 0.7, on: 'on the snow' }),
        Object.freeze({ name: 'water', pace: 0, rough: 1, on: 'on the wet ground' }),
        Object.freeze({ name: 'settlement', pace: 0.6, rough: 1, on: 'between the houses' })
    ]),
    // A drawn building is solid to within this of its walls (Scenery.houseAt), for every bike
    houseHitM: 0.3,
    // An off-road bike's rider stands on the pegs on the land from this speed (the drawn rider only), by the trait
    landStandSpeed: 3,
    landStand: 0.6,        // of the stand over a jump, at trait 1
    // Dust from the wheels of any bike on the land from landDustSpeed, a puff every landDustS (Game)
    landDustSpeed: 6,
    landDustS: 0.25,
    // The power slide (Vehicle.updateWorldPhysics), for an off-road bike on the land with the throttle open. `hold`
    // is the trait x the throttle opening, and 0 with the brake over slideBrake. The drive takes grip from the rear
    // tyre, so it steps out before the lean alone would lose it: from a demand of (1 - slideOnset x hold) of the grip
    // the drawn bike heads slideGain x hold x (the demand over that, in grips) further into the turn, at most
    // slideMaxDeg. The lean limit rises to slideLean x hold over the grip (under lowsideMargin, so shutting the
    // throttle in a slide does not drop the bike by itself), the path never turns tighter than the grip gives, the
    // slide scrubs slideScrub x its angle off the speed, and the lowside margin rises by slideRoom x hold, so a bike
    // that arrives on the land leaned over slides where a road bike falls. Past that margin it falls too
    slideOnset: 0.35,
    slideLean: 0.12,
    slideRoom: 0.6,
    slideGain: 1.8,        // rad of slide for each grip of demand over the onset
    slideMaxDeg: 35,
    slideRiseS: 0.15,      // s, the slide angle follows its target with this lag stepping out
    slideFallS: 0.25,      // s, and with this one coming back
    slideScrub: 3,         // m/s^2 for each rad of slide
    slideBrake: 0.5,       // brake input over this ends the hold
    slideSpin: 4,          // the drawn rear wheel turns this much faster for each rad of slide

    // A wall or drop in the tile's zone layer (a face between stacked strands, on the 8 m grid) is solid only where
    // the land at the bike shows it: wallRiseM above the road, or dropDepthM below it. Elsewhere it is run-off.
    // Barriers, tunnel and gallery rock, and bridge parapets are always solid.
    wallRiseM: 1,
    dropDepthM: 2.5,

    // A touch on a wall (Vehicle.wallTouch, brush). The bike meets a wall with its tyres (its place is the line of its
    // tyres), and what stands over them is further in or further out by the lean: a part `half` to the side and
    // `height` up on the upright bike stands half x cos(a) - height x sin(a) toward the wall and
    // height x cos(a) + half x sin(a) high, with `a` the lean away from the wall. A touch is a crash when a part
    // stands further toward the wall than tyreM and the wall is as high as the part (a wall with no height given is),
    // when the bike closes on the wall at over closeMax (the speed into the wall of every touch of one contact,
    // summed: a wall turns a bike that grazes it, it does not carry one round a bend), when its heading is over
    // glanceDeg off the wall's face, when it has been against the wall for mostS, or when it is found over deepM
    // into the wall (it did not touch the face). Else it is a brush: the bike is held skinM off the face (a wall
    // with a line of its own and a building are met a step ahead, so the bike is never in them), loses the speed it
    // had into the wall and `scrub` of its speed each second for holdS after each touch (a touch within holdS of
    // the last is the same contact), and its heading is turned kickDeg off the wall. `scrub` is no brake worth
    // riding into a wall for: at 16 m/s it is 6.4 m/s^2, under the brake a bike has at full lean (6.6 before the
    // rider's multiplier). One rule for every wall (a retaining wall's parapet, a bridge's, a rock face, a barrier,
    // a building); one set of parts for every bike (the catalogue has no widths)
    wallBrush: Object.freeze({
        tyreM: 0.09,
        parts: Object.freeze([
            Object.freeze({ name: 'bar', half: 0.38, height: 1.05 }),
            Object.freeze({ name: 'shoulder', half: 0.24, height: 1.35 })
        ]),
        closeMax: 3,       // m/s along the wall's normal
        glanceDeg: 35,
        mostS: 0.8,
        holdS: 0.2,
        scrub: 0.4,        // 1/s
        kickDeg: 2,
        skinM: 0.02,
        deepM: 0.3
    }),

    // Hairpin assist (WorldAssist in js/world/run.js). The level (off, low, normal) scales every assist by
    // assistLevels; each assist has one tuning value, and the rest only says where a bend counts as tight.
    assistLevels: Object.freeze({ off: 0, low: 0.5, normal: 1 }),
    assistTightR: 25,      // m, a bend this tight or tighter gets the whole assist
    assistGentleR: 60,     // m, a bend this open or more gets none; in between it fades
    assistSpanM: 8,        // m, the span the bend's radius is read over (a 10 m fillet reads as 10 m)
    // 1. Speed advice: the entry speed that takes the bend at this lean, well under the cap. With no throttle and
    //    well over it, the engine brakes the bike to it at up to adviceBrake (never more than the brake can)
    adviceLeanDeg: 35,
    adviceBrake: 4,        // m/s^2 at level normal
    // 2. Line capture: steering into a tight bend at a turn radius within lineCapture of the line's radius, the
    //    lean is pulled onto the line (the road's radius at the bike's offset, inside the lane) with weight
    //    lineStrength, the rest staying the rider's own torque steering. Outside the window it does nothing
    lineCapture: 0.25,
    lineStrength: 0.8,
    // No assist acts off the carriageway (past the drawn edge the rider rides the land alone, and steers back as on
    //    the road), and none acts against the rider's steering unless it turns the bike toward the road's centre line
    //    (Vehicle.worldAssistRate): an assist never pulls the bike outward against the rider and never resists a turn
    //    back toward the road, from the lean rate and the handlebar alike. (The recovery pull, which moved a bike past the
    //    edge back toward it, is gone: it acted where nothing drawn explained it.)
    // 3. Edge assist: on the carriageway within edgeZoneM of an edge and heading further off, a lean-rate nudge back
    //    toward the road's direction, full at the edge and at a heading edgeAngleDeg or more off the road. None while
    //    the rider steers back, in a tunnel or gallery, or within edgeBarrierM of a junction barrier; it fades out over
    //    edgeBudgetS of use (refilled in the middle half of the road)
    edgeLeanRate: 1.5,     // rad/s at level normal
    edgeZoneM: 1,
    edgeAngleDeg: 5,
    edgeBudgetS: 1.5,
    edgeBarrierM: 12,
    // The line capture and the edge assist reach the lean rate as one contribution, low-passed over this
    assistSmoothing: 0.1,  // s
    // 4. Edge lean (Vehicle.edgeLean): a bike that runs wide gets more lean to tighten its line with. On the carriageway
    //    within fromM of the edge on the outside of its turn (the edge it leans away from), the grip the lean reads
    //    rises by `extra` x the level's share, by a smoothstep that is whole from fullM to the edge. The lean limit,
    //    the grip cap and the lowside read that one number, so they move together, and the tightest turn (radiusFloor)
    //    is divided by the same share: in a hairpin under about 8 m/s the lean limit is the lean of that turn, and
    //    more grip alone would change nothing there. None on the inside edge (a lean
    //    toward the edge), past the edge, or at level off. It is whole for holdS of use and gone fadeS later (the time
    //    counts by the share in use, and starts again in the middle half of the road), so a rider cannot ride the
    //    outside metre of a long bend on it. `extra` is a share of the grip (the tangent of the lean), about 3
    //    degrees at the limit, for two reasons: 1 + extra is under lowsideMargin, so a bike at the raised limit that
    //    loses it is never over the lowside, and the most daring rider's lean with it (59.9 degrees) is under
    //    floorLeanDeg (tests/unit/world-edge-lean.test.js holds both)
    edgeLean: Object.freeze({ fromM: 1.5, fullM: 0.5, extra: 0.12, holdS: 1.5, fadeS: 1 }),

    // Used by the run layer (R3) and the restart (R3), kept here with the rest
    restartSpeedMax: 15,
    // A restart puts the rider this far behind where the bike last was on the carriageway: room to see what it hit
    restartBackM: 6,
    progressSlack: 1.1,
    progressFloorFrac: 0.25,
    progressEpsM: 0.1,
    cutConfirmMs: 250,
    // Most progress a run of unaccepted frames may bank, so circling on the lower leg of a ladder
    // cannot buy the jump to the upper one. It stays under half the smallest gap between stacked legs
    // (an honest projection stuck backward for more than about maxBankM / (2.2 v), 1.2 s at 15 m/s, restarts)
    maxBankM: 40,
    // A forward step of up to cutFloorM is honest progress whatever the speed. The speed-made allowance (progressSlack)
    // gains on the bike by a tenth of its speed, 0.5 m/s at 5 m/s, so at hairpin speed a step of 15 cm in the
    // projection held for cutConfirmMs restarted the rider as a cut. Stacked legs lie over 2 x maxBankM apart in s,
    // so no cut across them is anywhere near this short
    cutFloorM: 3,
    // Road skipped over the land (WorldRun.update, `skip`): while the bike is on the land, the ride distance it
    // gains over the metres it rides is road it did not ride. A stay off the carriageway is held to the most of it
    // (metres ridden on the land afterwards pay nothing back). Over cutSkipM, once the bike is back on the
    // carriageway for cutConfirmMs, is a cut. Beside a straight the two are equal and nothing is skipped. On the
    // inside of a bend the road is longer than the line over the land: inside a hairpin of 6 m radius the ride
    // distance passes four times as fast as the bike, so a wheel on the land there for 2 m is over it (the verge is
    // free), and 20 m of land 6 m inside the edge of a 50 m bend is too
    cutSkipM: 5
});
