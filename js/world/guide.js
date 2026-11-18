// WorldGuide: the rider's guidance in a world (D7 b and d).
//   - a minimap in a HUD corner: the ride, the side roads in residence, the bike;
//     north up, MAP_SPAN_M across
//   - a turn prompt for the next junction within PROMPT_M ("Keep left, 300 m")
//   - the hairpin advice beside the prompt: the speed for the next tight bend within ADVICE_M
//     (WorldAssist.advice), red when the rider is over it by ADVICE_FAST; hidden with the assist off.
//     The H key cycles the assist level (off, low, normal), said in a callout
//   - the off-route rule: more than Route.OFF_ROUTE_M from the ride line, or riding
//     against the route at over REVERSE_SPEED for REVERSE_WARN_S, shows "Wrong way";
//     RESTART_AFTER_S later (still wrong) it calls `onRestart`, the same path as the
//     C key, with the reason. Any restart resets both timers through reset().
// The rule is a pure state machine (`step`), so it runs in the node harness; the
// canvas and the prompt are built only when there is a document.
class WorldGuide {
    static get MAP_SPAN_M() { return 1500; }
    static get PROMPT_M() { return 500; }
    static get REVERSE_SPEED() { return 3; }
    static get REVERSE_WARN_S() { return 5; }
    static get RESTART_AFTER_S() { return 10; }
    static get MAP_SIZE() { return 150; }
    static get MAP_REFRESH_MS() { return 100; }
    static get ADVICE_M() { return 150; }
    static get ADVICE_FAST() { return 1.1; }
    // m/s to the HUD's mph
    static get MPH() { return 2.237; }

    constructor(environment) {
        this.environment = environment;
        this.route = environment.route;
        this.onRestart = null;
        this.onWarning = null;
        this.reset();
        this.promptText = '';
        this.advice = null;
        this.warning = null;
        this.mapAt = 0;
        this.build();
    }

    // Both timers back to zero: called on every restart, so one excursion never costs two penalties
    reset() {
        this.offS = 0;
        this.reverseS = 0;
        this.warnedS = null;
        this.cause = null;
        this.warning = null;
        this.warned = null;
        this.render();
    }

    // The rule for one frame. `state`: {projection, speed, yaw, dt}. Returns 'restart' on the frame it fires.
    step(state) {
        const { projection, speed, yaw, dt } = state;
        const off = this.route.offRoute(projection);
        const against = speed > WorldGuide.REVERSE_SPEED && Math.cos(yaw - projection.heading) < 0;
        this.offS = off ? this.offS + dt : 0;
        this.reverseS = against && !off ? this.reverseS + dt : 0;
        let cause = null;
        if (off && this.offS > 0) cause = 'off-route';
        else if (this.reverseS >= WorldGuide.REVERSE_WARN_S) cause = 'wrong-way';
        if (!cause) {
            this.cause = null;
            this.warnedS = null;
            return null;
        }
        if (this.cause !== cause) {
            this.cause = cause;
            this.warnedS = 0;
        } else this.warnedS += dt;
        if (this.warnedS >= WorldGuide.RESTART_AFTER_S) {
            const reason = cause;
            this.reset();
            if (this.onRestart) this.onRestart(reason);
            return 'restart';
        }
        return null;
    }

    // The prompt for the next junction within PROMPT_M of s, or '' when there is none
    promptAt(s) {
        const next = this.route.junctionsAhead(s, WorldGuide.PROMPT_M)[0];
        if (!next) return '';
        const metres = Math.max(10, Math.round(next.distance / 10) * 10);
        const verb = next.turn === 'straight' ? 'Continue straight' : next.keep ? `Keep ${next.keep}` : `Turn ${next.turn}`;
        return `${verb}, ${metres} m${next.name ? ` · ${next.name}` : ''}`;
    }

    // The hairpin advice at s for a bike at `speed` (m/s): {mph, fast, distance, left} or null (none near, or the assist off)
    adviceAt(s, speed, level = WorldAssist.level()) {
        const physics = this.environment.physics;
        if (!physics || !Number.isFinite(s) || WorldAssist.share(physics, level) <= 0) return null;
        const advice = WorldAssist.advice(this.route, physics, s, WorldGuide.ADVICE_M);
        if (!advice) return null;
        return {
            mph: Math.round(advice.speed * WorldGuide.MPH),
            fast: speed > advice.speed * WorldGuide.ADVICE_FAST,
            distance: advice.bend.distance,
            // The way the bend turns on the screen (Route.turnSide)
            left: Route.turnSide(advice.bend.sign) === 'left'
        };
    }

    // One frame: the rule, the prompt and (a few times a second) the map
    update(state) {
        const fired = this.step(state);
        this.promptText = this.promptAt(state.projection.s);
        this.advice = this.adviceAt(state.projection.s, state.speed);
        this.warning = this.cause ? 'Wrong way' : null;
        // The warning is said once when it starts, in the callout stack at the centre of the screen
        if (this.warning !== this.warned) {
            this.warned = this.warning;
            if (this.warning && this.onWarning) this.onWarning(this.warning);
        }
        this.render(state);
        return fired;
    }

    build() {
        if (typeof document === 'undefined' || !document.body) return;
        // The corner is the stylesheet's (css/ui.css .world-guide): top right, top left on a touch device
        const box = document.createElement('div');
        box.id = 'world-guide';
        box.className = 'world-guide';
        this.canvas = document.createElement('canvas');
        this.canvas.width = this.canvas.height = WorldGuide.MAP_SIZE;
        this.prompt = document.createElement('div');
        this.prompt.className = 'world-prompt';
        // The hairpin advice: a hairpin chevron and the speed for it
        this.adviceBox = document.createElement('div');
        this.adviceBox.className = 'world-advice';
        this.adviceBox.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 20V9a5 5 0 0 1 10 0v6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M13.5 12.5L17 16l3.5-3.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg><span></span>';
        this.adviceText = this.adviceBox.querySelector('span');
        this.adviceBox.hidden = true;
        box.append(this.canvas, this.prompt, this.adviceBox);
        // H cycles the hairpin assist
        this.onKey = (event) => {
            if (event.code !== 'KeyH' || event.repeat) return;
            const level = WorldAssist.cycle();
            document.querySelectorAll('[data-assist="cycle"]').forEach(button => button.refresh && button.refresh());
            if (typeof showCallout === 'function') showCallout(`Hairpin assist: ${level}`, 'info', 1500);
        };
        document.addEventListener('keydown', this.onKey);
        document.body.appendChild(box);
        document.body.classList.add('world-ride');
        this.box = box;
    }

    render(state) {
        if (!this.box) return;
        this.prompt.textContent = this.promptText;
        const advice = this.advice;
        this.adviceBox.hidden = !advice;
        if (advice) {
            const text = `${advice.mph} mph`;
            if (this.adviceText.textContent !== text) this.adviceText.textContent = text;
            this.adviceBox.classList.toggle('fast', advice.fast);
            this.adviceBox.classList.toggle('left', advice.left);
        }
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        if (state && now - this.mapAt >= WorldGuide.MAP_REFRESH_MS) {
            this.mapAt = now;
            this.drawMap(state);
        }
    }

    drawMap(state) {
        const ctx = this.canvas.getContext('2d');
        if (!ctx) return;
        const size = WorldGuide.MAP_SIZE;
        const scale = size / WorldGuide.MAP_SPAN_M;
        const at = state.position;
        const px = x => size / 2 + (x - at.x) * scale;
        // z grows southward (z = -northing), so north is up when z runs down the canvas
        const py = z => size / 2 + (z - at.z) * scale;
        ctx.clearRect(0, 0, size, size);
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(190,190,190,.55)';
        for (const edges of this.environment.sideEdges.values()) {
            for (const e of edges) {
                ctx.beginPath();
                for (let i = 0; i < e.x.length; i += 2) (i === 0 ? ctx.moveTo : ctx.lineTo).call(ctx, px(e.x[i]), py(e.z[i]));
                ctx.stroke();
            }
        }
        const points = this.route.points;
        const half = WorldGuide.MAP_SPAN_M * 0.75;
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ffd23f';
        ctx.beginPath();
        let pen = false;
        for (let i = 0; i < points.length; i += 2) {
            const p = points[i];
            if (Math.abs(p.x - at.x) > half || Math.abs(p.z - at.z) > half) { pen = false; continue; }
            if (pen) ctx.lineTo(px(p.x), py(p.z)); else ctx.moveTo(px(p.x), py(p.z));
            pen = true;
        }
        ctx.stroke();
        // The bike: an arrow along its heading
        ctx.save();
        ctx.translate(size / 2, size / 2);
        // The arrow is drawn pointing up; a heading of 0 runs along +z, which is down this map
        ctx.rotate(Math.PI - state.yaw);
        ctx.fillStyle = '#ff4a3d';
        ctx.beginPath();
        ctx.moveTo(0, -8); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    dispose() {
        if (this.onKey && typeof document !== 'undefined') document.removeEventListener('keydown', this.onKey);
        this.onKey = null;
        if (this.box && this.box.parentNode) this.box.parentNode.removeChild(this.box);
        if (typeof document !== 'undefined' && document.body) document.body.classList.remove('world-ride');
        this.box = null;
    }
}
