// WorldGuide: the rider's guidance in a world (D7 b and d).
//   - a minimap in a HUD corner: the ride, the side roads in residence, the bike;
//     north up, MAP_SPAN_M across
//   - a turn prompt for the next junction within PROMPT_M ("Keep left, 300 m")
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

    constructor(environment) {
        this.environment = environment;
        this.route = environment.route;
        this.onRestart = null;
        this.reset();
        this.promptText = '';
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

    // One frame: the rule, the prompt and (a few times a second) the map
    update(state) {
        const fired = this.step(state);
        this.promptText = this.promptAt(state.projection.s);
        this.warning = this.cause ? 'Wrong way' : null;
        this.render(state);
        return fired;
    }

    build() {
        if (typeof document === 'undefined' || !document.body) return;
        const box = document.createElement('div');
        box.id = 'world-guide';
        box.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:20;pointer-events:none;font:600 14px system-ui,sans-serif;color:#fff;text-shadow:0 1px 3px #000';
        this.prompt = document.createElement('div');
        this.prompt.style.cssText = 'margin-bottom:6px;min-height:18px';
        this.alert = document.createElement('div');
        this.alert.style.cssText = 'margin-bottom:6px;color:#ff6b4a;font-size:18px;min-height:22px';
        this.canvas = document.createElement('canvas');
        this.canvas.width = this.canvas.height = WorldGuide.MAP_SIZE;
        this.canvas.style.cssText = 'display:block;border-radius:8px;background:rgba(10,14,18,.55);border:1px solid rgba(255,255,255,.25)';
        box.append(this.alert, this.prompt, this.canvas);
        document.body.appendChild(box);
        this.box = box;
        // The licence credit shows while a world rides (index.html holds the element)
        this.credit = document.getElementById('world-credit');
        if (this.credit) {
            this.credit.textContent = this.environment.credit;
            this.credit.style.display = 'block';
        }
    }

    render(state) {
        if (!this.box) return;
        this.prompt.textContent = this.promptText;
        this.alert.textContent = this.warning || '';
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
        if (this.box && this.box.parentNode) this.box.parentNode.removeChild(this.box);
        if (this.credit) this.credit.style.display = 'none';
        this.box = null;
    }
}
