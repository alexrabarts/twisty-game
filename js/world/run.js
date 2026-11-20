// WorldRun: the run state of a ride in a world (R3). No THREE and no DOM, so
// the node harness runs it.
//
// It does two jobs the leg engine does with positions and gate circles:
//   - station order. A station is passed when the accepted progress goes past
//     its s, the bike faces along the route and sits within the road band.
//     Only the next station is looked at, so a stacked hairpin can never
//     credit a gate that belongs to another leg of the ladder.
//   - stage state. A ride holds one or more stages; a 'boundary' station ends one stage and starts the next
//     (onStageFinish). The ride itself ends only at the last station. The tour and stage leaderboard
//     sessions are R6 and are not here.
//   - the cut rule (Decision 16): road that was not ridden is not counted, on any bike. `lastS` is a high-water
//     mark of accepted progress, and two things are road not ridden:
//       - a forward jump of the projection that the bike's speed does not explain (across stacked legs)
//       - road skipped over the land (`skip`): while the bike is on the land (past the drawn verge), the ride
//         distance it gains over the metres it rides. It catches a line across the inside of a bend, where the
//         projection sweeps round with no jump. A stay off the road is held to the most that sum reached: over
//         cutSkipM is a cut, and metres ridden on the land afterwards do not pay it back. Riding beside the road
//         and coming back to it gains nothing and is free, and so is the verge
//     Neither is judged on the land: a rider with road skipped is credited no station there, and may turn back
//     to where the road was left. Once the bike is back on the carriageway with road skipped, and
//     that holds for cutConfirmMs, it is a
//     cut: the game restarts the rider where the bike left the road. A backward jump is ignored and costs
//     nothing. The rule is the ride's (a timed ride), not the bike's: the bike's physics knows nothing of it.
//     It protects the client's own integrity; the server's floors are the only check against a modified client.
//   - where a restart puts the rider (restartPlace). A station is a timing
//     line and nothing else: after a crash the rider goes on from `roadS`,
//     the last ride distance at which the bike was on the carriageway, so a
//     crash on the road is where it happened and a crash off it, in water or
//     down a drop is where the bike left the road.
class WorldRun {
    // Metres past the road edge that still count as on the road for a station
    static get STATION_REACH_M() { return 8; }

    // Metres the cut rule and the restart speed measure the road's curvature over
    static get CURVATURE_SPAN_M() { return 4; }

    // Metres of road ahead the restart speed is chosen for
    static get RESTART_LOOK_M() { return 100; }

    // Share of the safe speed a restart starts at
    static get RESTART_SAFE_SHARE() { return 0.8; }

    // `stations`: the stage's stations in order, first = the start line, last = the finish; {s, ...}
    constructor(route, stations, physics) {
        this.route = route;
        this.stations = stations;
        this.physics = physics;
        this.stages = route.stages || [];
        this.begin(stations.length ? stations[0].s : 0);
    }

    // Spawn, restart and resume: progress starts again from s
    reset(s) {
        // A restart or a put-down lands in the stage that holds s
        this.stageIndex = this.stageOf(s);
        this.lastS = s;
        this.roadS = s;
        this.allowAccum = 0;
        this.pendingCutMs = 0;
        this.prevS = s;
        this.skip = 0;
        this.skipPeak = 0;
        this.landFromS = null;
    }

    // A ride starts: no station passed, progress starts at s
    begin(s) {
        this.stationIndex = 0;
        this.stageIndex = this.stageOf(s);
        this.stageStartMs = 0;
        this.stageTimes = [];
        this.stationTimes = [];
        this.stageRestarts = this.stages.map(() => 0);
        this.reset(s);
    }

    // The index of the stage that holds s; 0 when the route lists none
    stageOf(s) {
        let index = 0;
        for (let i = 0; i < this.stages.length; i++) if (s >= this.stages[i].from - 0.01) index = i;
        return index;
    }

    get stageCount() { return Math.max(1, this.stages.length); }

    // Stage k is finished at `ms` on the ride clock: its time is kept, the next stage starts
    onStageFinish(k, ms) {
        this.stageTimes[k] = ms - this.stageStartMs;
        this.stageStartMs = ms;
        this.stageIndex = Math.min(k + 1, this.stageCount - 1);
    }

    // The station at index i was passed at `ms` on the ride clock
    onStation(i, ms) {
        this.stationTimes[i] = ms;
    }

    // A restart in the stage being ridden
    noteRestart() {
        this.stageRestarts[this.stageIndex] = (this.stageRestarts[this.stageIndex] || 0) + 1;
    }

    // The gates of stage k as station indexes, and how many of them the ride has passed
    stageGates(k) {
        const name = this.stages[k] ? this.stages[k].id : null;
        const gates = [];
        this.stations.forEach((station, i) => {
            if (station.kind === 'gate' && (!name || station.stage === name)) gates.push(i);
        });
        return { total: gates.length, passed: gates.filter(i => i <= this.stationIndex).length };
    }

    get finished() { return this.stationIndex >= this.stations.length - 1; }

    get lastStation() { return this.stations[this.stationIndex]; }

    get nextStation() { return this.stations[this.stationIndex + 1] || null; }

    // The signed heading change per metre at s (positive toward +lateral)
    curvatureAt(s) { return this.route.curvatureAt(s, WorldRun.CURVATURE_SPAN_M); }

    // One frame. `frame`: {s, lateral, width, speed, dt, forwardDot, land} from the one projection of the frame;
    // `land` is whether the bike is on the land (past the drawn verge: Vehicle.runoff), and past the carriageway
    // counts as that where it is not given.
    // Returns {cut, station}: `cut` when the bike has been back on the carriageway with road skipped for
    // cutConfirmMs, `station` the index of the station this frame passed (or -1).
    update(frame) {
        const physics = this.physics;
        const result = { cut: false, station: -1 };
        const kappa = this.curvatureAt(frame.s);
        // On the inner edge of a bend the road is shorter, so honest progress per metre ridden is faster
        const inner = frame.lateral * Math.sign(kappa);
        const shorter = Math.max(physics.progressFloorFrac, 1 - Math.abs(kappa) * inner);
        const growth = physics.progressSlack * frame.speed * frame.dt / shorter;
        const allowance = Math.max(physics.cutFloorM || 0, Math.min(physics.maxBankM, this.allowAccum + growth) + physics.progressEpsM);
        const gap = frame.s - this.lastS;
        const carriageway = Math.abs(frame.lateral) <= frame.width / 2;

        // Road skipped over the land: what the projection gained this frame over the metres the bike rode, added up
        // and never under nothing (metres ridden first buy nothing). One stay off the carriageway is held to the most
        // that sum reached (`skipPeak`): metres ridden on the land afterwards, a loop or a zigzag, do not pay road
        // back. Only the road itself does: the peak counts no further than the ride distance the bike is now ahead of
        // where it went onto the land, so a rider who turns back is level again. The stay ends, and is forgotten,
        // on the carriageway with cutSkipM or less
        const step = frame.s - this.prevS;
        const from = this.prevS;
        this.prevS = frame.s;
        const most = physics.cutSkipM;
        const land = most !== undefined && (frame.land !== undefined ? frame.land : !carriageway);
        let skipped = false;
        if (most !== undefined) {
            if (land) {
                if (this.landFromS === null) this.landFromS = from;
                this.skip = Math.max(0, this.skip + step - frame.speed * frame.dt);
                this.skipPeak = Math.max(this.skipPeak, this.skip);
            }
            skipped = this.landFromS !== null && Math.min(this.skipPeak, frame.s - this.landFromS) > most;
            if (carriageway && !skipped) {
                this.skip = 0;
                this.skipPeak = 0;
                this.landFromS = null;
            }
        }

        // Where the bike last was on the carriageway: every accepted frame there, and a frame that follows on from it
        // (a rider who turns back along the road). A fall onto a lower leg of a ladder is a step no riding makes
        if (carriageway && !skipped && gap <= allowance && (gap >= -allowance || Math.abs(frame.s - this.roadS) <= allowance)) this.roadS = frame.s;

        // On the land the road skipped is the whole measure of a forward step: the projection there may stand still
        // and then step (the outside of a bend, well off the road), which the skip adds up to nothing
        if (!skipped && gap >= -allowance && (gap <= allowance || land)) {
            this.lastS = Math.max(this.lastS, frame.s);
            this.allowAccum = 0;
            this.pendingCutMs = 0;
            result.station = this.passStation(frame);
            return result;
        }

        // A frame that is not accepted banks its allowance, but only while it looks like honest riding:
        // facing along the road and inside its band. Circling on one leg of a ladder banks nothing past the cap.
        const onRoad = frame.forwardDot > 0 && Math.abs(frame.lateral) <= frame.width / 2 + WorldRun.STATION_REACH_M;
        if (onRoad) this.allowAccum = Math.min(physics.maxBankM, this.allowAccum + growth);
        // The verdict waits for the road: on the land nothing is a cut yet
        if ((skipped || gap > allowance) && carriageway) {
            this.pendingCutMs += frame.dt * 1000;
            if (this.pendingCutMs >= physics.cutConfirmMs) result.cut = true;
        } else this.pendingCutMs = 0;
        return result;
    }

    // The next station is passed once accepted progress is beyond it, the bike faces along the road and is on it.
    // The finish sits at the route's end: its stored s (rounded to 0.1 m) can lie a centimetre past the last sample,
    // where no projection reaches, so a station is never further than the route's own length
    passStation(frame) {
        const next = this.nextStation;
        if (!next || this.lastS < Math.min(next.s, this.route.length) || frame.forwardDot <= 0) return -1;
        if (Math.abs(frame.lateral) > frame.width / 2 + WorldRun.STATION_REACH_M) return -1;
        this.stationIndex++;
        return this.stationIndex;
    }

    // A restart, a resume or a put-down: progress starts again at s. A restart just past a timing line puts the
    // rider back over it: the station stays passed (stationIndex), and a stage that ended stays ended
    restartAt(s) {
        const stage = this.stageIndex;
        this.reset(s);
        this.stageIndex = Math.max(stage, this.stageIndex);
    }

    // Where a restart puts the rider: {s, lateral}. restartBackM behind the last place the bike was on the
    // carriageway, never before the ride's start, and never at a station for its own sake.
    // Across the road it is the middle of the rider's own half (traffic's lane where that is nearer the centre line),
    // and through a roadworks site the open lane (`works`: Roadworks.pilotLane), so never the closed lane or the works.
    // It only ever moves the rider back (`further` metres more where the place itself is not safe: Game.beginWorldCrash),
    // so it is never past a stop line the rider had not passed
    restartPlace(works = null, further = 0) {
        const route = this.route;
        const floor = this.stations.length ? this.stations[0].s : 0;
        const s = Math.min(route.length, Math.max(floor, Math.min(this.roadS, this.lastS) - (this.physics.restartBackM || 0) - Math.max(0, further)));
        const width = route.sample(s, {}).width;
        const lane = typeof route.laneOffset === 'function' ? route.laneOffset(s) : width / 4;
        const own = Route.keepRight(1) * Math.min(lane, width / 4);
        return { s, lateral: works && typeof works.pilotLane === 'function' ? works.pilotLane(s, own) : own };
    }

    // The speed a put-down rolls away at (the debug skip; a restart starts at a standstill): 0.8 of what the tightest bend in the next 100 m allows, at most restartSpeedMax
    restartSpeed(s) {
        const physics = this.physics;
        let tightest = 0;
        for (let d = 0; d <= WorldRun.RESTART_LOOK_M; d += 4) tightest = Math.max(tightest, Math.abs(this.curvatureAt(s + d)));
        const curvature = Math.min(1 / physics.radiusFloor, tightest);
        if (curvature < 1e-4) return physics.restartSpeedMax;
        // Grip on cobbles is the worst the road offers
        const lean = Math.tan(physics.leanCapDeg * Math.PI / 180) * physics.cobbleGrip;
        const safe = Math.sqrt(9.81 * lean / curvature);
        return Math.min(physics.restartSpeedMax, WorldRun.RESTART_SAFE_SHARE * safe);
    }
}

// WorldAssist: the hairpin assist of a world ride (the tuning is in js/world/physics.js). No THREE and no DOM
// (the level is read from the page's URL and storage only when there is one), so the node harness runs it.
//   1. speed advice: the entry speed of the next tight bend, for the HUD and for the engine braking
//   2. line capture: Vehicle.updateWorldPhysics pulls a lean that is near the bend's line onto it
//   3. edge assist: Vehicle.updateWorldPhysics nudges a bike heading off the carriageway back along it
// None acts off the carriageway, and none against the rider's steering (Vehicle.worldAssistRate)
// The level is off, low or normal (default normal): the URL's ?assist= sets it and it is stored under
// STORAGE_KEY; the pause panel's button (pauseButton) and the H key (WorldGuide) cycle it in a ride.
class WorldAssist {
    static get STORAGE_KEY() { return 'twistyHairpinAssist'; }
    static get ORDER() { return ['off', 'low', 'normal']; }

    // 1/s, how fast a captured lean is pulled onto the line (the weight is lineStrength)
    static get LINE_GAIN() { return 8; }

    // Metres off the centre line the captured line may keep: traffic keeps its lanes clear of a rider within about
    // 2 m of the centre (WorldRoute.laneOffset), so a line further out is brought back in
    static get LINE_BAND_M() { return 1.5; }

    // Metres between the points the bend scan reads
    static get SCAN_STEP_M() { return 2; }

    // The level in force: chosen this session, else the URL's ?assist=, else storage, else normal
    static level() {
        if (WorldAssist.chosen) return WorldAssist.chosen;
        let level = null;
        try {
            const param = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('assist') : null;
            if (WorldAssist.ORDER.includes(param)) {
                level = param;
                WorldAssist.store(level);
            }
        } catch (error) { /* no URL to read */ }
        if (!level) {
            try {
                const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(WorldAssist.STORAGE_KEY) : null;
                if (WorldAssist.ORDER.includes(stored)) level = stored;
            } catch (error) { /* storage blocked */ }
        }
        WorldAssist.chosen = level || 'normal';
        return WorldAssist.chosen;
    }

    static setLevel(level) {
        if (!WorldAssist.ORDER.includes(level)) return WorldAssist.level();
        WorldAssist.chosen = level;
        WorldAssist.store(level);
        return level;
    }

    // off -> low -> normal -> off
    static cycle() {
        const order = WorldAssist.ORDER;
        return WorldAssist.setLevel(order[(order.indexOf(WorldAssist.level()) + 1) % order.length]);
    }

    // A button for the pause panel of a world ride (WorldCredits.showPause): it shows the level and cycles it
    static pauseButton() {
        const button = document.createElement('button');
        button.className = 'btn';
        button.dataset.assist = 'cycle';
        const show = () => {
            const level = WorldAssist.level();
            button.textContent = `Hairpin assist: ${level[0].toUpperCase()}${level.slice(1)} (H)`;
        };
        show();
        button.refresh = show;
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            WorldAssist.cycle();
            show();
        });
        return button;
    }

    static store(level) {
        try {
            if (typeof localStorage !== 'undefined') localStorage.setItem(WorldAssist.STORAGE_KEY, level);
        } catch (error) { /* storage blocked: the level holds for this page only */ }
    }

    // The share of each assist a level gives (0 off, 1 normal)
    static share(physics, level) {
        const levels = physics.assistLevels || {};
        return Object.prototype.hasOwnProperty.call(levels, level) ? levels[level] : 0;
    }

    // How much of the assist a bend of this radius gets: 1 at assistTightR or tighter, 0 at assistGentleR or more
    static fade(physics, radius) {
        if (!(radius > 0) || !Number.isFinite(radius)) return 0;
        const k = 1 / radius, tight = 1 / physics.assistTightR, gentle = 1 / physics.assistGentleR;
        return Math.max(0, Math.min(1, (k - gentle) / (tight - gentle)));
    }

    // The comfortable speed for a bend of this radius: the lean adviceLeanDeg (scaled by grip), well under the cap
    static advisedSpeed(physics, radius, grip = 1) {
        const r = Math.max(physics.radiusFloor, radius);
        return Math.sqrt(9.81 * r * Math.tan(physics.adviceLeanDeg * Math.PI / 180) * grip);
    }

    // The road's signed curvature over assistSpanM from s (positive toward +lateral). On a route with the smooth
    // profile (WorldRoute.smoothCurvatureAt) it is that profile centred on the same span, so it has no steps
    static curvature(route, physics, s) {
        const span = physics.assistSpanM;
        return typeof route.smoothCurvatureAt === 'function' ? route.smoothCurvatureAt(s + span / 2, span) : route.curvatureAt(s, span);
    }

    // The next tight bend (radius assistTightR or less) that starts within `look` metres of s:
    // {distance, radius, sign}; distance 0 inside it. The radius is the least through the bend.
    static bendAhead(route, physics, s, look) {
        const step = WorldAssist.SCAN_STEP_M;
        const tight = 1 / physics.assistTightR;
        let bend = null;
        for (let d = 0; d <= look + 60; d += step) {
            const k = WorldAssist.curvature(route, physics, s + d);
            if (Math.abs(k) >= tight && (!bend || Math.sign(k) === bend.sign)) {
                if (!bend) {
                    if (d > look) return null;
                    bend = { distance: d, radius: 1 / Math.abs(k), sign: Math.sign(k) };
                } else bend.radius = Math.min(bend.radius, 1 / Math.abs(k));
            } else if (bend) return bend;
        }
        return bend;
    }

    // The advice at s: {bend, speed} or null when no tight bend is within `look`
    static advice(route, physics, s, look, grip = 1) {
        if (!route || typeof route.curvatureAt !== 'function') return null;
        const bend = WorldAssist.bendAhead(route, physics, s, look);
        return bend ? { bend, speed: WorldAssist.advisedSpeed(physics, bend.radius, grip) } : null;
    }
}
