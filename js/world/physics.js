// World riding physics: the parameters of the world-only branch of Vehicle.
// No THREE and no DOM, so the importer and the floor tool can load this file
// alone (tests/helpers/load-game.js loadWorldPhysics). The legs never read it:
// a leg environment has `physics: null`, and Vehicle stays on its legacy path.
const WorldPhysics = Object.freeze({
    // Lean controller
    leanCapDeg: 50,        // the lean at grip 1.0; grip lowers it (capEff)
    radiusFloor: 5,        // m, tightest radius the bike turns (R_MIN - width/2)
    rMin: 10,              // m, centreline fillet radius the importer builds
    // m, the radius a stacked hairpin is held to instead (tools/world/resample.mjs): where a rMin arc would push a
    // ladder's legs together, nearer than the map has them. At least radiusFloor, so the bike turns its centreline at
    // speed, and its inner edge at the narrowest ride (7 m) stays outside the full-lock circle (lockRadius)
    rHairpin: 6,
    // Steering (Vehicle.updateWorldPhysics). A held key leans the bike at leanRate; the lean rate follows the
    // steering with the lag leanRateLag, so a press leans the bike by the same amount whatever it was doing.
    leanRate: 1.15,        // rad/s at full steering, up to steerSpeed: a 0.3 s key press is about 16 degrees
    leanRateLag: 0.04,     // s, how far the lean rate lags the steering (no lean momentum to fall over with)
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

    // Slope and low speed
    slopeGravity: 1.0,     // share of the route grade that acts on the bike
    creepSpeed: 4,         // m/s, the bike creeps up to this with no throttle
    creepAccel: 6,         // m/s^2, how fast it creeps
    footDownSpeed: 1,      // m/s, under this with the brake held the bike stops

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

    // Lowside: grip demand above margin * tan(capEff) for lowsideMs, on the road and bench (not on run-off)
    lowsideMargin: 1.15,
    lowsideMs: 200,

    cobbleGrip: 0.85,      // surface grip on a route sample flagged cobbles

    // Braking (Vehicle.updateWorldSpeed). The legs keep the bike's own brake (brakeForce, 20 m/s^2 x the
    // character); the world multiplies it by brakeGain, so the rider can scrub speed to turn in or to recover.
    // The brake shares the grip with the lean, as a friction circle: the lean's share of the cap is used, and
    // the brake keeps sqrt(1 - share^2) of itself, never under trailBrakeFloor (at the cap). It never crashes
    // the bike: braking changes only the speed, and the lowside reads the lean.
    brakeGain: 1.4,
    trailBrakeFloor: 0.45,
    // Engine braking with the throttle closed: engineBrake x the speed, at most engineBrakeMax, and never
    // below creepSpeed. A long descent with the throttle closed settles near 13 m/s at 10%
    engineBrake: 0.06,     // 1/s
    engineBrakeMax: 2.5,   // m/s^2
    // Share of the brake on run-off (grass, verge). The legs' run-off grip (0.5) halves the brake there; the
    // world keeps the run-off grip for the lean and the throttle, and lets the rider brake hard to recover
    runoffBrakeGrip: 0.9,

    // Run-off and verge (Vehicle.checkWallCollision, worldZone). Leaving the road at speed slows the bike and takes
    // grip from it; it does not crash it. The legs keep the ledge rule (5% of the speed a frame on the bench, about
    // 100 m/s^2 at 35 m/s), the run-off grip 0.5 for the lean and a lowside on it, and the 6 s off-road limit.
    benchDrag: 0.1,        // 1/s on the carved bench (the gravel verge): 3.5 m/s^2 at 35 m/s. Run-off keeps its own drag
    runoffGrip: 0.7,       // the lean's grip on run-off: a cap of about 40 degrees, and lean over it bleeds off, not a lowside
    runoffBumpM: 0.03,     // m, the bike's height bobs this much on run-off at runoffBumpSpeed and over (the mesh only)
    runoffBumpSpeed: 25,   // m/s
    offRoadLimitS: 10,     // s off the road before the run-off crashes the bike
    // A wall or drop in the tile's zone layer (a face between stacked strands, on the 8 m grid) is solid only where
    // the land at the bike shows it: wallRiseM above the road, or dropDepthM below it. Elsewhere it is run-off.
    // Barriers, tunnel and gallery rock, and bridge parapets are always solid.
    wallRiseM: 1,
    dropDepthM: 2.5,

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
    // 3. Recovery: running wide toward the outside of a tight bend, the bike is pulled back to the road edge at
    //    recoveryPull, at most recoveryBudgetM per bend and only within recoveryReachM of the edge (no wall-ride)
    recoveryPull: 1.5,     // m/s at level normal
    recoveryBudgetM: 3,
    recoveryReachM: 4,
    // 4. Edge assist, anywhere on the ride: within edgeZoneM of a road edge (or past it, within recoveryReachM) and
    //    heading further off, a lean-rate nudge back toward the road's direction, full at the edge and at a heading
    //    edgeAngleDeg or more off the road. None while the rider steers back, in a tunnel or gallery, or within
    //    edgeBarrierM of a junction barrier; it fades out over edgeBudgetS of use (refilled in the middle half of
    //    the road). Past the edge away from tight bends, the recovery pull above acts too
    edgeLeanRate: 1.5,     // rad/s at level normal
    edgeZoneM: 1,
    edgeAngleDeg: 5,
    edgeBudgetS: 1.5,
    edgeBarrierM: 12,
    // The line capture and the edge assist reach the lean rate as one contribution, low-passed over this
    assistSmoothing: 0.1,  // s

    // Used by the run layer (R3) and the restart (R3), kept here with the rest
    restartSpeedMax: 15,
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
    cutFloorM: 3
});
