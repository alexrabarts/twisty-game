// World riding physics: the parameters of the world-only branch of Vehicle.
// No THREE and no DOM, so the importer and the floor tool can load this file
// alone (tests/helpers/load-game.js loadWorldPhysics). The legs never read it:
// a leg environment has `physics: null`, and Vehicle stays on its legacy path.
const WorldPhysics = Object.freeze({
    // Lean controller
    leanCapDeg: 50,        // the lean at grip 1.0; grip lowers it (capEff)
    radiusFloor: 5,        // m, tightest radius the bike turns (R_MIN - width/2)
    rMin: 10,              // m, centreline fillet radius the importer builds
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

    // Slope and low speed
    slopeGravity: 1.0,     // share of the route grade that acts on the bike
    creepSpeed: 4,         // m/s, the bike creeps up to this with no throttle
    creepAccel: 6,         // m/s^2, how fast it creeps
    footDownSpeed: 1,      // m/s, under this with the brake held the bike stops

    // Lowside: grip demand above margin * tan(capEff) for lowsideMs
    lowsideMargin: 1.15,
    lowsideMs: 200,

    cobbleGrip: 0.85,      // surface grip on a route sample flagged cobbles

    // Used by the run layer (R3) and the restart (R3), kept here with the rest
    restartSpeedMax: 15,
    progressSlack: 1.1,
    progressFloorFrac: 0.25,
    progressEpsM: 0.1,
    cutConfirmMs: 250,
    // Most progress a run of unaccepted frames may bank, so circling on the lower leg of a ladder
    // cannot buy the jump to the upper one. It stays under half the smallest gap between stacked legs
    // (an honest projection stuck backward for more than about maxBankM / (2.2 v), 1.2 s at 15 m/s, restarts)
    maxBankM: 40
});
