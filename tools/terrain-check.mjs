#!/usr/bin/env node
// Browser proof harness for the streamed world and the hill ride. Serves the repo on an ephemeral port, drives the
// real page in Chrome and prints one JSON document.
//
//   node tools/terrain-check.mjs <probe>[,<probe>] [--world <id>] [--chrome <path>] [--gpu]
//
// World probes (the streamed world, `?world=<id>`; --world <id> picks it, default tremola; --worldData <path> picks the data folder):
//   world-near-ground world-cover-off world-toggle-ride world-ground-flip world-ground-scan world-ground-off world-window world-haze world-budget world-ground world-junction world-wrongway world-credit world-net world-finish world-restart world-cut world-camera world-frustum world-camera-smooth world-camera-chicane world-camera-frames world-camera-walls world-hud world-shots world-hairpin-shots world-buildings world-frametime world-ride-shots world-hairpin-assist world-floating world-watertight world-trees world-stones world-quality world-fall-shots world-group-shots world-place-shots
//   node tools/terrain-check.mjs world-camera-chicane --world gotthard-north [--modes near,far] [--speed 20] [--from s --to s] [--dump <file>]   (the chase camera's yaw rate, yaw acceleration and sway over the whole stage, its worst places and every chicane; ridden alone, the crew dropped)
//   node tools/terrain-check.mjs world-camera-walls --world tremola --gpu [--modes near,far] [--lane M] [--swing K] [--far K] [--apex s,s] [--off] [--shots s,s,s --out <dir>]   (nothing drawn between the chase camera and the bike in any hairpin)
//   node tools/terrain-check.mjs world-fall-shots --world tremola --gpu --out <dir> [--at s] [--speeds 6,14,28] [--moments 0.15,0.5,1.2]   (the rider's fall of each kind, beside him)
//   node tools/terrain-check.mjs world-trees --world tremola --gpu [--views 300,1800] [--out <dir> --tag T]   (tree colour against the photos and the land round it)
//   node tools/terrain-check.mjs world-floating --world tremola --gpu [--every 500] [--views 3600,7990] [--out <dir> --tag T]   (floating roads and land over the road, drawn)
//   node tools/terrain-check.mjs world-tunnels --world gotthard-north --gpu [--every 200] [--out <dir> --tag T]   (no land in a tunnel's or gallery's box or across its portals; pictures of every portal)
//   node tools/terrain-check.mjs world-watertight --world tremola --gpu [--every 50] [--from S --to S] [--modes near,far] [--at s,s]   (no gap in the drawn land, no edge works foot over it)
//   node tools/terrain-check.mjs world-seams --world gotthard-north --gpu [--every 250] [--modes near] [--turns 0,-60,60] [--at s,s] [--out <dir> --tag T]   (no tile edge drawn as a dark line, no line of a new tone where the tiles meet the far land, out to the horizon)
//   node tools/terrain-check.mjs world-far-seams --world airolo-lookout --gpu [--every 100] [--modes near,far] [--turns 0,-60,60] [--at s,s [--at-only]] [--out <dir> --tag T]   (no sky seen through the land out to 40 km, no line of a new tone at a far grid's edge)
//   node tools/terrain-check.mjs world-look --world gotthard-north --gpu --script <file> [--out <dir>]   (a script of the caller's in a world page; its pictures saved)
//   node tools/terrain-check.mjs world-fairness --world tremola --gpu [--every 100]   (physics solid only where something is drawn, the band the drawn ribbon, every hairpin ridden at 5 and 7 m/s)
//   node tools/terrain-check.mjs world-frametime --world tremola --gpu [--frames N]   (chase-view frame time at five points: median and worst)
//   node tools/terrain-check.mjs world-ride-shots --world tremola --gpu --out <dir> [--tag T]   (the chase view at five points of the ride)
//   node tools/terrain-check.mjs world-quality --world tremola --gpu [--phone] [--measure [--rounds N]] [--out <dir>]   (each part of a world frame, or each graphics level: frame time and picture)
//   node tools/terrain-check.mjs world-near-ground --world tremola --gpu --desk [--at s,s] [--camera N] [--specs "a;b"] [--ride-cost] [--out <dir>]   (the near land by distance: luma, fine contrast, change against the first spec)
//   node tools/terrain-check.mjs world-cover-off --world tremola --gpu [--at s,s]   (the ground cover off draws the land as without it, to the bit)
//   node tools/terrain-check.mjs world-toggle-ride --world tremola --gpu [--to s] [--camera N] [--toggle id] [--every N] [--levels] [--skip N] [--drop-after s [--restore-ms N]] [--out <dir>]   (a ride switching an effect, or losing its tile data: the near land drawn, or the land's rule kept)
//   node tools/terrain-check.mjs world-ground-scan --world tremola --gpu --desk [--at s,s] [--camera N] [--specs "a;b"] [--straight] [--bins] [--out <dir>]   (the near land by distance: luma, fine contrast, change against the first spec and its steps)
//   node tools/terrain-check.mjs world-ground-off --world tremola --gpu [--at s,s]   (the ground texture off draws the land as without it, to the bit)
//   node tools/terrain-check.mjs world-ground-flip --world tremola --gpu [--from s] [--metres m] [--camera N] [--every frames] [--reach m]   (the land stays whole while the ground texture and the ladder level flip mid-ride)
// Every world probe takes --effects off|default|high|id=level,... (the effects of js/effects.js in force, the ladder held
//   at its top so Auto caps none; `off` and a list start from every effect off), --desk (a 1440 x 900 view at a device
//   pixel ratio of 2, as the owner's screen) and --night (the light and sky of night, Game.setTimeOfDay)
//   node tools/terrain-check.mjs world-ground-shots --world tremola --gpu --out <dir> [--tag T] [--at s,...]   (the bike stopped on the steepest grade, up, down and across, chase and side views)
//   node tools/terrain-check.mjs world-budget --world tremola --every 1000 --gpu
//   world-hud rides the fixture of three stages tests/fixtures/world/mini (--world all) unless --worldData is given
//   node tools/terrain-check.mjs world-finish --world tremola --gpu [--seed S] [--seeds N]   (N rides from seed S; default 5 rides from 1, all must finish)
//   node tools/terrain-check.mjs world-shots --world tremola --gpu --out <dir>   (hairpins, a junction and the minimap, as PNG files in <dir>)
// Chrome: --chrome <path>, else TWISTY_CHROME, else PUPPETEER_EXECUTABLE_PATH, else puppeteer's own.
// Exit: 0 ok, 1 failures, 2 no Chrome or no window.game, 3 --gpu without a hardware renderer.
//
// Never let a page reach production: cloudfunctions.net, firebasedatabase.app and firebaseio.com are aborted.
import { spawnSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, relative, resolve, sep } from 'node:path';
import { cpus, loadavg } from 'node:os';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { fairnessWindow, roadworksWindow } from '../tests/helpers/world-fairness.js';
import { wallWindow, wallRuns, WALL_LIMITS } from '../tests/helpers/world-walls.js';
import { junctionWindow, junctionReport, junctionLimits } from '../tests/helpers/world-junctions.js';
import { tunnelWindow, tunnelReport, TUNNEL_LIMITS } from '../tests/helpers/world-tunnels.js';
import { CHICANE, chicanesOf, peaksOf, shapeAt, swingOf, tubeRoom, worstPlaces } from '../tests/helpers/world-chase-ride.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const BLOCKED_HOSTS = ['cloudfunctions.net', 'firebasedatabase.app', 'firebaseio.com'];
// What a world's window may draw at one place, counted as countScene counts it
const LEG_BUDGET = { meshes: 800, triangles: 450000, instances: 1400 };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary' };

// ---------------------------------------------------------------- CLI
const argv = process.argv.slice(2);
const flag = name => argv.includes(`--${name}`);
const option = name => {
    const at = argv.indexOf(`--${name}`);
    return at >= 0 ? argv[at + 1] : undefined;
};
const command = argv[0] && !argv[0].startsWith('--') ? argv[0] : undefined;
// The chase views a probe rides (the types of Game.cameraModes): --modes, --mode and --camera name them
const VIEWS = ['near', 'far'];
const viewsOption = (name, fallback) => {
    const list = option(name) ? option(name).split(',') : fallback;
    for (const view of list) if (!VIEWS.includes(view)) throw new Error(`--${name}: no chase view ${view} (${VIEWS.join(', ')})`);
    return list;
};
const probes = command ? command.split(',') : [];
const fail = (code, message) => {
    process.stderr.write(`${message}\n`);
    process.exit(code);
};
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 1)}\n`);

// ---------------------------------------------------------------- Chrome and server
function chromePath() {
    const candidate = option('chrome') || process.env.TWISTY_CHROME || process.env.PUPPETEER_EXECUTABLE_PATH;
    if (candidate) return candidate;
    try {
        const own = puppeteer.executablePath();
        if (own && spawnSync(own, ['--version']).status === 0) return own;
    } catch { /* fall through to the message */ }
    return fail(2, 'Set TWISTY_CHROME or run: npx puppeteer browsers install chrome');
}

function startServer() {
    const server = createServer((req, res) => {
        const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
        const file = join(root, path === '/' ? 'index.html' : path);
        if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
            res.writeHead(404).end();
            return;
        }
        res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
        createReadStream(file).pipe(res);
    });
    // (--port <n> serves on that port; an ephemeral one without it)
    return new Promise(done => server.listen(Number(option('port') || 0), '127.0.0.1', () => done(server)));
}

const state = { blocked: [], notFound: [], pageErrors: [], lastError: '' };

// `prepare(page)`, when given, runs before the page loads (a probe's evaluateOnNewDocument)
async function openPage(browser, port, url = '/', seed = 1, prepare = null) {
    const page = await browser.newPage();
    await page.setViewport({ width: 960, height: 540, deviceScaleFactor: 1 });
    await page.setRequestInterception(true);
    page.on('request', request => {
        const target = new URL(request.url());
        if (state.requests) state.requests.push(request.url());
        if (BLOCKED_HOSTS.some(host => target.hostname.endsWith(host))) {
            state.blocked.push(request.url());
            request.abort();
        } else if (/jsdelivr\.net\/npm\/three@0\.150\.0\/build\/three\.min\.js/.test(request.url())) {
            // The pinned devDependency is the same file the page asks the CDN for
            request.respond({ status: 200, contentType: 'text/javascript', body: readFileSync(join(root, 'node_modules/three/build/three.min.js')) });
        } else {
            request.continue();
        }
    });
    page.on('response', response => {
        if (response.status() === 404 && response.url().startsWith(`http://127.0.0.1:${port}`)) state.notFound.push(response.url());
    });
    page.on('console', message => {
        if (message.type() !== 'error') return;
        state.lastError = message.text().slice(0, 200);
        // A shader that does not compile is a console error, not a page error: the report keeps the first few
        (state.consoleErrors ||= []).length < 12 && state.consoleErrors.push(message.text().slice(0, 600));
    });
    page.on('pageerror', error => state.pageErrors.push(`${url}: ${error.message}`));
    // One seeded generator; `seed` is where a page starts it
    await page.evaluateOnNewDocument((first) => {
        let seed = first;
        window.__reseed = value => { seed = value; };
        Math.random = () => {
            seed = (seed + 0x6d2b79f5) | 0;
            let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }, seed);
    if (prepare) await prepare(page);
    await page.goto(`http://127.0.0.1:${port}${url}`, { waitUntil: 'load', timeout: 120000 });
    return page;
}

// ---------------------------------------------------------------- main
// Every probe is a world probe (WORLD_PROBES, filled as the file loads): worldMain runs them
async function main() {
    if (!probes.length) fail(2, `Name a probe: ${WORLD_PROBES.join(' ')}`);
    const unknown = probes.filter(name => !WORLD_PROBES.includes(name));
    if (unknown.length) fail(2, `Unknown probe ${unknown.join(', ')}. The probes: ${WORLD_PROBES.join(' ')}`);
    return worldMain();
}

// ---------------------------------------------------------------- world probes
// The streamed world (`?world=<id>`), one page for each probe. Every page blocks cloudfunctions.net,
// and nothing here answers a callable: a world submits nothing yet.
const WORLD_PROBES = ['world-effect-shots', 'world-window', 'world-budget', 'world-ground', 'world-junction', 'world-wrongway', 'world-credit', 'world-net', 'world-finish', 'world-restart', 'world-cut', 'world-camera', 'world-frustum', 'world-camera-smooth', 'world-camera-chicane', 'world-camera-frames', 'world-hud', 'world-shots', 'world-hairpin-shots', 'world-buildings', 'world-models', 'world-frametime', 'world-ride-shots', 'world-hairpin-assist', 'world-floating', 'world-watertight', 'world-trees', 'world-haze'];
// Hosts the page may reach besides itself: the script CDNs and the font host of index.html
const ALLOWED_HOSTS = ['cdn.jsdelivr.net', 'www.gstatic.com', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const ALLOWED_PATHS = /^\/(world\/|tests\/fixtures\/world\/|assets\/|js\/|css\/|tools\/autopilot\.js|favicon|$|index\.html)/;
const WORLD_RESIDENT_TILES = 60;
// The share of the mesh cap the window keeps free (world-budget reports each place's margin)
const WORLD_MESH_MARGIN = 0.15;
const WORLD_BIKE_TILE_M = 900;

// In a world the pilot rides alone: it holds its cruise and its bend speeds and never brakes for a vehicle ahead, so it
// rode into the crew where the crew took a hairpin slower than it (leg 6, s 6 224), and a probe of the camera or the
// road failed on a crash of the group's. Installed after tools/autopilot.js, which a page that loads it again replaces.
// A probe about the group (CREW_PROBES) keeps its crew
async function rideAlone(page) {
    await page.evaluate(() => {
        const autopilot = twistyDev.autopilot.bind(twistyDev);
        twistyDev.autopilot = (options = {}) => {
            const g = window.game, traffic = g && g.traffic;
            if (!window.probeCrew && (options.speed || 0) > 0 && g.environment && g.environment.isWorld && traffic && traffic.dropCrew && !traffic.noCrew) traffic.dropCrew();
            return autopilot(options);
        };
    });
}

async function openWorld(browser, port, id, seed = 1, data = option('worldData')) {
    for (let attempt = 0; attempt < 3; attempt++) {
        // (--query adds to the address: free roam is `--query 'mode=roam&debug'`)
        const page = await openPage(browser, port, `/?world=${encodeURIComponent(id)}${data ? `&worldData=${encodeURIComponent(data)}` : ''}${option('query') ? `&${option('query')}` : ''}`, seed);
        try {
            // The vehicle is made before the first window settles; the ride state comes after it, so wait for that
            await page.waitForFunction('window.game && window.game.environment && window.game.environment.isWorld && window.game.vehicle && window.game.worldRun', { timeout: 120000 });
        } catch {
            await page.close();
            continue;
        }
        await page.evaluate(() => { window.game.adaptResolution = () => {}; });
        await page.addScriptTag({ path: join(root, 'tools/autopilot.js') });
        await rideAlone(page);
        await pageLook(page);
        return page;
    }
    return fail(2, `the world page did not start: ${state.pageErrors.join(' | ')} ${state.lastError}`);
}

// The view, the time of day and the effects a probe runs with (--desk, --night, --effects)
async function pageLook(page) {
    if (flag('desk')) {
        await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
        await page.evaluate(() => {
            game.renderer.setPixelRatio(Math.min(devicePixelRatio, Quality.LEVELS[game.quality.level].pixelRatio));
            game.onWindowResize();
        });
    }
    if (flag('night')) await page.evaluate(() => game.setTimeOfDay('night'));
    const spec = option('effects');
    if (spec) {
        const set = await page.evaluate(effectsSpec, spec);
        if (set.error) fail(2, `--effects ${spec}: ${set.error}`);
        state.effects = set;
    }
}

// In the page: puts --effects in force. The ladder is held at its top, whose share caps no effect
function effectsSpec(spec) {
    if (typeof Effects === 'undefined' || !game.effects) return { error: 'this page has no effects (js/effects.js)' };
    const settings = game.effects;
    // preset:<id>[,id=level...]: a preset as the dialog sets it (a fixed one holds its ladder level), then those effects
    if (spec.startsWith('preset:')) {
        const [head, ...pairs] = spec.split(',');
        try {
            settings.setPreset(head.slice(7));
            pairs.forEach(pair => { const [id, level] = pair.split('='); settings.set(id, level || 'on'); });
        } catch (error) {
            return { error: error.message };
        }
        game.applyGraphicsSettings();
        Effects.frame(game);
        game.graphics.easeEffects(10);
        return { preset: settings.preset, level: Quality.LEVELS[game.quality.level].id, inForce: { ...game.effectLevels } };
    }
    try {
        if (spec === 'high') settings.setPreset('high');
        else {
            settings.setPreset('auto');
            if (spec !== 'default') {
                Effects.LIST.forEach(effect => settings.set(effect.id, 'off'));
                if (spec !== 'off') spec.split(',').forEach(pair => { const [id, level] = pair.split('='); settings.set(id, level || 'on'); });
            }
        }
    } catch (error) {
        return { error: error.message };
    }
    game.applyGraphicsSettings();
    game.quality.fix(Quality.LEVELS.length - 1);
    Effects.frame(game);
    game.graphics.easeEffects(10);
    return { preset: settings.preset, inForce: { ...game.effectLevels } };
}

// What the budget probe counts: every mesh drawn in the scene, and the instances in them
// The ground cover (js/world/groundcover.js) is counted apart: it is an effect with fixed caps of its own
// (GroundCover.MAX_TUFTS, MAX_STONES) and a measured cost (Effects.LIST), not a load of the world's data
function countScene() {
    let meshes = 0, triangles = 0, instances = 0, coverTriangles = 0;
    const kinds = {};
    game.scene.traverse(o => {
        if (!o.isMesh) return;
        let cover = false;
        for (let n = o.parent; n; n = n.parent) {
            if (!n.visible) return;
            if (n.name === 'ground-cover') cover = true;
        }
        const pos = o.geometry.attributes.position;
        const index = o.geometry.index;
        const count = (index ? index.count : pos.count) / 3 * (o.isInstancedMesh ? o.count : 1);
        if (cover) { coverTriangles += count; return; }
        meshes++;
        triangles += count;
        if (o.isInstancedMesh) instances += o.count;
        // (by kind: the mesh's name to its first ':' or digit, under the nearest named group of the world)
        let group = '';
        for (let n = o.parent; n && n !== game.scene; n = n.parent) if (n.name && /^world-/.test(n.name)) group = n.name.replace(/[-\d,m]+$/, '');
        const kind = `${group}/${String(o.name || o.type).split(':')[0].replace(/[-_]?\d.*$/, '')}`;
        kinds[kind] = (kinds[kind] || 0) + count;
    });
    const byKind = Object.fromEntries(Object.entries(kinds).sort((a, b) => b[1] - a[1]).slice(0, 24).map(([k, v]) => [k, Math.round(v)]));
    return { meshes, triangles: Math.round(triangles), instances, coverTriangles: Math.round(coverTriangles), trianglesByKind: byKind };
}

// In the page: the frame as it stands drawn again and again, whole and with each part of the scene left out (each
// child of the scene and of the world's group, the houses, trees and boulders, the shadows), each timed to the GPU's
// finish (a pixel read back) as the median of five draws. Returns [{part, ms, saved}] dearest first
function profileFrame() {
    const renderer = game.graphics.renderer, gl = renderer.getContext(), px = new Uint8Array(4);
    const draw = () => {
        const times = [];
        for (let k = 0; k < 5; k++) {
            const a = performance.now();
            game.graphics.render(game.scene, game.camera);
            gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
            times.push(performance.now() - a);
        }
        return times.sort((p, q) => p - q)[2];
    };
    draw();
    const whole = draw();
    const env = game.environment, sc = env.scenery;
    const parts = [];
    const named = (o, prefix) => `${prefix}${o.name || o.type}`;
    for (const o of game.scene.children) if (o !== env.group && o.visible) parts.push([named(o, 'scene/'), [o]]);
    for (const o of env.group.children) if (o.visible) parts.push([named(o, 'world/'), [o]]);
    for (const o of env.sceneryGroup.children) if (o.visible) parts.push([named(o, 'scenery/'), [o]]);
    if (sc.houseGroup) for (const o of sc.houseGroup.children) parts.push([named(o, 'house/'), [o]]);
    const out = [];
    for (const [part, list] of parts) {
        list.forEach(o => { o.visible = false; });
        const ms = draw();
        list.forEach(o => { o.visible = true; });
        out.push({ part, ms: Math.round(ms * 10) / 10, saved: Math.round((whole - ms) * 10) / 10 });
    }
    const sm = renderer.shadowMap.enabled;
    renderer.shadowMap.enabled = false;
    const noShadow = draw();
    renderer.shadowMap.enabled = sm;
    renderer.shadowMap.needsUpdate = true;
    out.push({ part: 'shadows', ms: Math.round(noShadow * 10) / 10, saved: Math.round((whole - noShadow) * 10) / 10 });
    const info = renderer.info.render;
    return { whole: Math.round(whole * 10) / 10, calls: info.calls, triangles: info.triangles, camera: { x: game.camera.position.x, y: game.camera.position.y, z: game.camera.position.z }, parts: out.sort((p, q) => q.saved - p.saved).slice(0, 20) };
}

// Put the bike on the ride at s, build the ground round it and wait for the queue to drain
async function placeAt(s) {
    const env = game.environment;
    const route = env.route;
    const p = route.sample(s, {});
    const v = game.vehicle;
    v.position.set(p.x, p.y, p.z);
    v.yawAngle = p.heading;
    v.leanAngle = 0;
    v.leanVelocity = 0;
    v.speed = 0;
    v.findNearestRoadSegment();
    // A put-down is a resume, not a cut: progress starts again at s
    game.worldRun.reset(s);
    env.update(p, s, null, Infinity);
    await env.streamer.settle(p, s);
    // What the new place no longer holds goes after the streamer's 3 s of grace
    if (game.worldLinger !== false) await new Promise(resolve => setTimeout(resolve, 3200));
    await env.streamer.settle(p, s);
    // (and the room the window leaves its houses and trees, measured now as the ride measures it each second, the
    // houses chosen again for it: Game.budgetWindow)
    // (until the room holds: what the settle built is counted next time)
    for (let k = 0; k < 4 && game.budgetWindow && env.scenery && env.scenery.setWindowRoom; k++) {
        const room = env.scenery.windowRoom;
        game.budgetWindow(true);
        if (k > 0 && env.scenery.windowRoom === room) break;
        env.update(p, s, null, Infinity);
        await env.streamer.settle(p, s);
    }
    return p;
}

// The world pilot of tools/autopilot.js: pure pursuit, and a speed that takes each bend inside the lean cap. Installed in the page.
function pilotWorld(game, cruise) {
    twistyDev.autopilot({ speed: cruise });
}

// The model files the game can load, found on disk so a file added later is checked too
function modelFiles(dir = join(root, 'assets')) {
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) return modelFiles(full);
        return entry.name.toLowerCase().endsWith('.glb') ? [relative(root, full).split(sep).join('/')] : [];
    }).sort();
}

// world-wrongway rides into the side road of the ride junction nearest this ride distance (one that leaves on the left
// by the lake at km 12.5)
const WRONGWAY_SIDE_S = 12529;

// world-camera-chicane, both views: the most yaw acceleration (rad/s^2, over 0.1 s) anywhere on the ride and over a
// chicane, the most yaw rate (rad/s) over a chicane, the least room the bike keeps in the view, and in a tunnel or
// gallery the least room the eye and the near plane keep under the roof and to the walls (m) and the most the camera's
// height may move by a second difference a frame (m)
const CHASE_LIMITS = { accel: 5.5, chicaneAccel: 4, chicaneRate: 1.6, room: 0.3, tubeRoomM: 1.0, tubeBounceM: 0.01 };

// Least share of the half screen the bike keeps from each edge on every frame of world-frustum
const FRUSTUM_MARGIN = 0.1;

// The ride's hairpins: s at the middle of each turn of 150 degrees or more inside 80 m, summed in 4 m steps
function worldHairpins(route) {
    const turnAt = s => {
        let total = 0;
        for (let d = -40; d < 40; d += 4) total += route.headingChange(s + d, s + d + 4);
        return Math.abs(total);
    };
    const out = [];
    let run = null;
    for (let s = 40; s < route.length - 40; s += 4) {
        const turn = turnAt(s);
        if (turn >= 150 * Math.PI / 180) {
            if (!run || s - run.last > 8) { run = { from: s, last: s, best: s, turn }; out.push(run); }
            run.last = s;
            if (turn > run.turn) { run.turn = turn; run.best = s; }
        }
    }
    return out.map(r => r.best);
}

// Named views of the floating-road work: the chase camera behind the bike stopped at each s (uphill, the way the
// slice is played).
// 100 the straight at the start (a dark seam ran along both verges), 1300 a hairpin under the next leg (two seams, a
// bare grey face, a dark band under the upper edge), 3600 the Autostrasse on its wall above the ride, 7800 and 7900 the sett hairpins whose legs overlapped and whose land
// stood over the road, 7990 the underside of the next switchback seen from below, 9500 and 10900 two more stacked
// switchbacks. --views s,s,... picks others.
// 3257 and 4657: a pair of thin dark lines ran down the middle of the road (the longitudinal joint drawn on both sides).
// 258, 1081, 6756 and 6930: land turned from the sun drew near black (LAND_BLACK_SHARE).
// 1731, 5133, 6458, 6505 and 6533: the Gotthard road's bridges over the ride drew as black slabs (the structures'
// near-black share, the same limit as the land's).
const FLOATING_VIEW_STEP_M = 1500;
const FLOATING_VIEW_CLEAR_M = 150;
const FLOATING_VIEWS = [100, 258, 1081, 1300, 1731, 3257, 3600, 4657, 5133, 6458, 6505, 6533, 6756, 6930, 7800, 7900, 7990, 9500, 10900];
// The share of a view's land pixels that may be near black (luminance under 10 of 255), and of its structures' (under
// 32: floatingCount's STRUCTURE_DARK)
const LAND_BLACK_SHARE = 0.005;
// Tolerances of world-floating: the drawn land may lie this far under a drawn road edge, and no land stands over the
// road surface within UP_M over it
const FLOAT_TOL_M = 0.3;
const FLOAT_UP_M = 4;
// The share of luminance profiles across the road edges of a view that may show a thin dark stripe (a stone, a shadow
// edge or a tree crossing a profile reads as one now and then; a seam along the road reads on most of them)
const FLOAT_SEAM_SHARE = 0.1;

// world-floating, in the page: walks the slice every `every` metres and checks the drawn world round each place
// (the LOD each tile and each road section is drawn at from there). Returns per-LOD counts and the worst cases.
async function floatingWalk(placeSource, every, tol, upM, sideFloatM = 3) {
    const SIDE_FLOAT_M = sideFloatM;
    // The edges' rays (as tests/unit/world-far-edges.test.js reads them): how far along the edge from the row, and the
    // highest under the edge (in the page: the function is passed as source)
    const FLOAT_AT_M = 0.5, FLOAT_PIXEL_M = 0.3;
    const placeAt = new Function('game', `return (${placeSource})`)(game);
    const env = game.environment;
    const route = env.route;
    const points = route.points;
    const LIFT = RoadMesh.LIFT_M;
    const VERGE = RoadSurface.VERGE_M;
    const raycaster = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0), up = new THREE.Vector3(0, 1, 0);
    // The drawn land at (x, z): the vertices of the tile mesh actually drawn there, on its own triangles
    const drawnLand = (x, z) => {
        const m = WorldData.TILE_M;
        const tx = Math.floor(x / m), tz = Math.floor(z / m);
        const held = env.tileMeshes.get(`${tx},${tz}`);
        if (!held) return null;
        const lod = Number(/lod(\d)/.exec(held.mesh.name)[1]);
        // On the mesh's own triangles, the ones cut to the retaining walls included (TerrainMesh.drawnAt)
        if (TerrainMesh.drawnAt && held.mesh.userData.lod !== undefined) return { y: TerrainMesh.drawnAt(held.mesh, x, z), lod };
        const stride = 1 << lod, cell = WorldData.CELL_M * stride, side = (WorldData.TILE_N - 1) / stride + 1;
        const pos = held.mesh.geometry.attributes.position.array;
        const fx = (x - tx * m) / cell, fz = (z - tz * m) / cell;
        const i = Math.max(0, Math.min(side - 2, Math.floor(fx))), j = Math.max(0, Math.min(side - 2, Math.floor(fz)));
        const u = fx - i, v = fz - j;
        const Y = (a, b) => pos[((j + b) * side + i + a) * 3 + 1];
        const y = u + v <= 1 ? Y(0, 0) + u * (Y(1, 0) - Y(0, 0)) + v * (Y(0, 1) - Y(0, 0)) : Y(1, 1) + (1 - u) * (Y(0, 1) - Y(1, 1)) + (1 - v) * (Y(1, 0) - Y(1, 1));
        return { y, lod };
    };
    const meshes = (group, test) => { const out = []; group.traverse(o => { if (o.isMesh && test(o)) out.push(o); }); return out; };
    const sectionOf = k => env.streamer.sections.find(sec => k >= sec.from && k <= sec.to);
    const place = (p, o) => ({ x: p.x + o * Math.cos(p.heading), z: p.z - o * Math.sin(p.heading) });
    const structureNear = (k, mask) => { for (let d = -2; d <= 2; d++) { const q = points[k + d]; if (q && (q.bits & mask)) return true; } return false; };
    const edges = new Map(), ups = new Map(), physics = [];
    const sideSeen = new Map(), horizonSeen = new Map();
    let checked = 0, missing = 0, upChecked = 0;
    const r2 = v => Math.round(v * 100) / 100;
    // (the stage's own road and its stop: a folder of several stages holds the others too)
    const span = env.stage ? [env.stage.from, Math.min(route.length, env.stage.to + 200)] : [0, route.length];
    for (let s0 = span[0] + every / 2; s0 < span[1]; s0 += every) {
        const bike = await placeAt(s0);
        const works = o => o.name === 'road-works';
        const skirts = [...meshes(env.roadGroup, works), ...meshes(env.sideGroup, works)];
        const roads = [...meshes(env.roadGroup, o => o.name === 'road-ribbon' || o.name === 'road-side'), ...meshes(env.sideGroup, o => o.name === 'road-ribbon' || o.name === 'road-side')];
        const far = [env.horizon, ...(env.farLand || [])].filter(Boolean);
        const bikeK = route.toUnits(s0);
        // Side roads: every edge and centre point of a resident side ribbon more than SIDE_FLOAT_M over the drawn land
        // must stand on a structure: a deck or another road within 1.5 m under it, or a wall across its edge
        const structures = skirts.concat(roads);
        for (const group of env.sideGroup.children) {
            for (const road of group.children) {
                for (const side of road.userData.sides || []) {
                    const centre = [(side.l[0] + side.r[0]) / 2, (side.l[1] + side.r[1]) / 2, (side.l[2] + side.r[2]) / 2];
                    for (const [what, pt] of [['l', side.l], ['c', centre], ['r', side.r]]) {
                        const key = `${Math.round(pt[0] * 2)},${Math.round(pt[2] * 2)},${Math.round(pt[1])}`;
                        if (sideSeen.has(key)) continue;
                        const land = drawnLand(pt[0], pt[2]);
                        if (!land) continue;
                        const gap = pt[1] - land.y;
                        let held = gap <= sideFloatM;
                        const inward = what === 'l' ? [side.r[0] - side.l[0], side.r[2] - side.l[2]] : what === 'r' ? [side.l[0] - side.r[0], side.l[2] - side.r[2]] : [0, 0];
                        const len = Math.hypot(inward[0], inward[1]) || 1;
                        if (!held) {
                            // An edge point is read 0.3 m inside the edge: a ray down the deck's side face grazes it
                            raycaster.set(new THREE.Vector3(pt[0] + inward[0] / len * 0.3, pt[1] - 0.03, pt[2] + inward[1] / len * 0.3), down);
                            raycaster.far = 1.5;
                            held = raycaster.intersectObjects(structures, false).length > 0;
                        }
                        if (!held && what !== 'c') {
                            const dir = new THREE.Vector3(-inward[0] / len, 0, -inward[1] / len);
                            raycaster.set(new THREE.Vector3(pt[0] + inward[0] / len * 0.5, pt[1] - Math.min(gap, 3) * 0.5, pt[2] + inward[1] / len * 0.5), dir);
                            raycaster.far = 1.2;
                            held = raycaster.intersectObjects(skirts, false).length > 0;
                        }
                        sideSeen.set(key, { s: Math.round(s0), x: Math.round(pt[0]), z: Math.round(pt[2]), at: what, gapM: r2(gap), landLod: land.lod, held });
                    }
                }
            }
        }
        // The far land: on a 16 m grid within 400 m of the bike, the horizon mesh drawn over the resident land
        if (env.horizon) {
            for (let dx = -400; dx <= 400; dx += 16) {
                for (let dz = -400; dz <= 400; dz += 16) {
                    if (dx * dx + dz * dz > 160000) continue;
                    const x = Math.round((bike.x + dx) / 16) * 16, z = Math.round((bike.z + dz) / 16) * 16;
                    const key = `${x},${z}`;
                    if (horizonSeen.has(key)) continue;
                    const land = drawnLand(x, z);
                    if (!land) continue;
                    raycaster.set(new THREE.Vector3(x, land.y + 400, z), down);
                    raycaster.far = 800;
                    const hit = raycaster.intersectObject(env.horizon, false)[0];
                    const visible = !!hit;
                    horizonSeen.set(key, { s: Math.round(s0), x, z, overM: visible ? r2(hit.point.y - land.y) : -1 });
                }
            }
        }
        for (const [index, held] of env.streamer.roads) {
            const sec = env.streamer.sections[index];
            // Beyond LOD0 the ribbon keeps only some rows (RoadMesh.decimate): its edge runs straight between them
            const kept = held.lod === 0 ? null : new Set(RoadMesh.decimate(env.rowsOf(sec.from, Math.min(points.length - 1, sec.to + 1))).map(r => r.s));
            for (let k = sec.from; k <= Math.min(points.length - 1, sec.to); k++) {
                const p = points[k];
                if (kept && !kept.has(p.s)) continue;
                const a = points[Math.max(0, k - 1)], b = points[Math.min(points.length - 1, k + 1)];
                let turn = b.heading - a.heading;
                turn -= Math.round(turn / (2 * Math.PI)) * 2 * Math.PI;
                const curve = turn / Math.max(1e-6, Math.hypot(b.x - a.x, b.z - a.z));
                const h = p.width / 2;
                const roadY = p.y + LIFT;
                // Up: no land over the road surface across its width, unless roofed
                if (!(p.bits & 5)) {
                    for (const f of [-1, -0.5, 0, 0.5, 1]) {
                        const at = place(p, f * h);
                        const land = drawnLand(at.x, at.z);
                        if (!land) continue;
                        upChecked++;
                        const over = land.y - roadY;
                        if (over > 0 && over < upM) {
                            const key = `${k}:${f}:${land.lod}`;
                            if (!ups.has(key) || ups.get(key).overM < over) ups.set(key, { s: Math.round(p.s), lateral: r2(f * h), lod: land.lod, overM: r2(over), what: 'land' });
                        }
                    }
                    if (k % 2 === 0 && far.length) {
                        raycaster.set(new THREE.Vector3(p.x, roadY + 0.1, p.z), up);
                        raycaster.far = upM;
                        const hit = raycaster.intersectObjects(far, false)[0];
                        if (hit) ups.set(`${k}:far`, { s: Math.round(p.s), lateral: 0, lod: 'far', overM: r2(hit.point.y - roadY), what: hit.object.name || 'far' });
                    }
                }
                if (structureNear(k, 7)) continue;
                // (the physics beside the road is read at the ride's own rows; the edges are read below, at the rows each
                // section draws)
                const offsets = RoadMesh.hold(held.lod === 0 ? [-h - VERGE, h + VERGE] : [-h, h], curve).offsets;
                for (const [side, edge] of [[-1, offsets[0]], [1, offsets[1]]]) {
                    const out = place(p, edge + side * 0.05);
                    const land = drawnLand(out.x, out.z);
                    if (!land) continue;
                    // Physics: the ground the bike reads beside the road against the drawn land, where the land is drawn at LOD0
                    if (land.lod === 0 && Math.abs(k - bikeK) < 120) {
                        for (const o of [h + 0.3, h + VERGE]) {
                            const q = place(p, side * o);
                            const near = drawnLand(q.x, q.z);
                            if (!near || near.lod !== 0) continue;
                            const loc = {};
                            const ground = env.ground.groundY(q.x, q.z, { start: k - 8, end: k + 8 }, true, loc);
                            // (from over a wall's coping, RoadMesh.COPING_UP_M over the road, so the ray meets the wall)
                            raycaster.set(new THREE.Vector3(q.x, roadY + RoadMesh.COPING_UP_M + 0.3, q.z), down);
                            raycaster.far = 2 + RoadMesh.COPING_UP_M;
                            const road = raycaster.intersectObjects([...roads, ...skirts], false)[0];
                            // A retaining wall or its parapet (works group 1 or 2), a viaduct's stone (4), is not ground: the physics there is the wall
                            if (road && road.object.name === 'road-works' && (road.face.materialIndex === 1 || road.face.materialIndex === 2 || road.face.materialIndex >= 4)) continue;
                            const drawn = road ? Math.max(near.y, road.point.y) : near.y;
                            physics.push({ s: Math.round(p.s), side: side > 0 ? 'right' : 'left', offset: r2(o), deltaM: r2(ground - drawn) });
                        }
                    }
                }
            }
        }
        // Down: the drawn land meets each drawn edge, or the edge works close the gap. Read at the rows and edges each
        // section draws (its ribbon's sides, RoadMesh.sectionSteps `userData.sides`: a far ribbon keeps more rows than
        // RoadMesh.decimate of all the rows, round a wall's end, a mouth and a structure), as tests/unit/world-far-edges
        // reads them: rays from under the road out across the edge, FLOAT_AT_M along toward each row beside it (on the
        // row's own line a ray ran along the edge two slopes share, or into the sliver of a few centimetres left between
        // two feet at a bend), no higher than FLOAT_PIXEL_M under the edge (a 6 cm lip under the ribbon's edge is no gap
        // anyone sees), and not toward a row past the section's drawn rows where no section is held beside it (the
        // window's end, where the road ends)
        for (const [index, held] of env.streamer.roads) {
            const group = env.roadMeshes.get(index), sides = group && group.userData.sides;
            if (!sides) continue;
            const [from, to] = sides.draw || [0, sides.length - 1];
            for (let k = from; k <= to; k++) {
                const row = sides[k];
                if (!Number.isFinite(row.s) || row.s < span[0] || row.s > span[1]) continue;
                // (a structure's row and the rows beside it: a deck has no works under its edge)
                if ([k - 1, k, k + 1].some(j => sides[j] && (sides[j].bits & 7))) continue;
                const outs = RoadMesh.outward(row);
                for (const key of ['l', 'r']) {
                    const e = row[key], o = outs[key], side = key === 'l' ? -1 : 1;
                    const roadY = e[1];
                    const out = { x: e[0] + o[0] * 0.05, z: e[2] + o[1] * 0.05 };
                    const land = drawnLand(out.x, out.z);
                    if (!land) { missing++; continue; }
                    checked++;
                    const gap = roadY - land.y;
                    let open = false;
                    if (gap > tol) {
                        // Another road drawn under the edge (a junction, a road below) is ground too
                        raycaster.set(new THREE.Vector3(out.x, roadY + 0.3, out.z), down);
                        raycaster.far = gap + 0.3;
                        const under = raycaster.intersectObjects(roads, false).find(hit => hit.point.y < roadY - 0.01);
                        const top = under ? Math.max(land.y, under.point.y) : land.y;
                        if (roadY - top > tol) {
                            const ways = [];
                            for (const [j, nb] of [[k - 1, index - 1], [k + 1, index + 1]]) {
                                if ((j < from || j > to) && !env.streamer.roads.has(nb)) continue;
                                const q = sides[j] && sides[j][key];
                                if (!q) continue;
                                const len = Math.hypot(q[0] - e[0], q[2] - e[2]);
                                if (len > 1e-6) ways.push([(q[0] - e[0]) / len * Math.min(FLOAT_AT_M, len / 2), (q[2] - e[2]) / len * Math.min(FLOAT_AT_M, len / 2)]);
                            }
                            const dir = new THREE.Vector3(o[0], 0, o[1]);
                            raycaster.far = 0.6 + 1.6 * (roadY - top);
                            open = [0.2, 0.5, 0.8].some(f => ways.some(w => {
                                const depth = Math.min(roadY - top, Math.max(FLOAT_PIXEL_M, (roadY - top) * f));
                                raycaster.set(new THREE.Vector3(e[0] - o[0] * 0.5 + w[0], roadY - depth, e[2] - o[1] * 0.5 + w[1]), dir);
                                return !raycaster.intersectObjects(skirts, false).length;
                            }));
                        }
                    }
                    const id = `${Math.round(row.s * 10)}:${side}:${held.lod}:${land.lod}`;
                    const was = edges.get(id);
                    // What the edge works were built on there (WorldEnvironment.edgeFoot), for an open edge
                    let foot;
                    if (open && env.edgeFoot) {
                        const f = env.edgeFoot(null, { far: held.lod > 0 })(e[0], roadY, e[2], o[0], o[1]);
                        foot = f ? { kind: f.kind, y: f.y !== undefined ? r2(f.y - roadY) : null } : null;
                    }
                    if (!was || was.gapM < gap) edges.set(id, { s: Math.round(row.s), side: side > 0 ? 'right' : 'left', roadLod: held.lod, landLod: land.lod, gapM: r2(gap), open, foot });
                }
            }
        }
    }
    const list = [...edges.values()];
    const byLod = {};
    // Against the land drawn at LOD0 (a coarser tile lies lower than the land under the road: counted apart, as coarse)
    const sideFloat = { vertices: 0, over: 0, open: 0, coarseOpen: 0, worstM: 0, worst: [] };
    const horizonOver = { nodes: 0, over: 0, worstM: 0, worst: [] };
    for (const v of sideSeen.values()) {
        sideFloat.vertices++;
        if (v.gapM <= SIDE_FLOAT_M) continue;
        sideFloat.over++;
        if (v.held) continue;
        if (v.landLod !== 0) { sideFloat.coarseOpen++; continue; }
        sideFloat.open++;
        sideFloat.worstM = Math.max(sideFloat.worstM, v.gapM);
        sideFloat.worst.push(v);
    }
    sideFloat.worst.sort((p, q) => q.gapM - p.gapM);
    sideFloat.worst = sideFloat.worst.slice(0, 8);
    for (const v of horizonSeen.values()) {
        horizonOver.nodes++;
        if (v.overM <= 0) continue;
        horizonOver.over++;
        horizonOver.worstM = Math.max(horizonOver.worstM, v.overM);
        horizonOver.worst.push(v);
    }
    horizonOver.worst.sort((p, q) => q.overM - p.overM);
    horizonOver.worst = horizonOver.worst.slice(0, 8);
    for (const e of list) {
        const key = `road${e.roadLod}-land${e.landLod}`;
        const row = byLod[key] || (byLod[key] = { checked: 0, overTol: 0, open: 0, worstGapM: 0 });
        row.checked++;
        if (e.gapM > tol) row.overTol++;
        if (e.open) row.open++;
        row.worstGapM = Math.max(row.worstGapM, e.gapM);
    }
    const open = list.filter(e => e.open).sort((p, q) => q.gapM - p.gapM);
    const raw = list.filter(e => e.gapM > tol).sort((p, q) => q.gapM - p.gapM);
    const upList = [...ups.values()].sort((p, q) => q.overM - p.overM);
    const badPhysics = physics.filter(p => Math.abs(p.deltaM) > tol).sort((p, q) => Math.abs(q.deltaM) - Math.abs(p.deltaM));
    return {
        every, tolM: tol, probes: checked, missing, edges: list.length, byLod,
        overTol: raw.length, worstGapM: raw.length ? raw[0].gapM : 0, open: open.length, worstOpen: open.slice(0, 12), worstRaw: raw.slice(0, 6),
        up: { checked: upChecked, hits: upList.length, worst: upList.slice(0, 12) },
        physics: { checked: physics.length, over: badPhysics.length, worstM: badPhysics.length ? badPhysics[0].deltaM : 0, worst: badPhysics.slice(0, 8) },
        sideFloat, horizonOver
    };
}

// A view of the floating-road work, in the page: the chase camera behind the bike stopped at s, then the frame drawn again with every
// road ribbon coloured by the side the camera sees (red: its underside) and everything else flat, and the pixels
// counted. Returns {s, crashed, underside, top, pixels}.
async function floatingView(placeSource, pilotSource, s) {
    const placeAt = new Function('game', `return (${placeSource})`)(game);
    const v = game.vehicle;
    game.setCameraView('near');
    // Put down at s, and the chase camera eased in behind the stopped bike (as world-hairpin-shots' start view)
    await placeAt(s);
    // The walk may have ridden past the finish: its banner is not part of the view
    document.querySelectorAll('#finishBanner').forEach(el => el.remove());
    game.worldCamera.reset(v.yawAngle);
    v.speed = 0;
    twistyDev.autopilot({ speed: 0 });
    for (let i = 0; i < 240; i++) twistyDev.step(1);
    game.environment.streamer.pump(Infinity);
    twistyDev.step(1, { render: true });
    // A dark seam along the road: the frame drawn again and read at once, the land's luminance across each edge from
    // the verge out to 8 m, on the rows 8 to 60 m ahead. A profile has a seam where one sample is under 0.6 of the
    // profile's median while the samples either side of it are over 0.8 of it (a thin dark line, not a shadow)
    const env = game.environment, route = env.route, renderer = game.graphics.renderer;
    game.graphics.render(game.scene, game.camera);
    const canvas = renderer.domElement;
    const copy = document.createElement('canvas');
    copy.width = canvas.width; copy.height = canvas.height;
    const ctx = copy.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(canvas, 0, 0);
    const image = ctx.getImageData(0, 0, copy.width, copy.height).data;
    // The frame as drawn, for floatingCount's share of near-black land
    window.floatFrame = { image, w: copy.width, h: copy.height };
    const lum = (x, y, z) => {
        const q = new THREE.Vector3(x, y, z).project(game.camera);
        if (q.z > 1 || Math.abs(q.x) > 0.98 || Math.abs(q.y) > 0.98) return null;
        const px = Math.round((q.x + 1) / 2 * (copy.width - 1)), py = Math.round((1 - q.y) / 2 * (copy.height - 1));
        const at = (py * copy.width + px) * 4;
        return 0.2126 * image[at] + 0.7152 * image[at + 1] + 0.0722 * image[at + 2];
    };
    const landY = (x, z, fallback) => { const g = env.ground.tileHeight(x, z); return g === null ? fallback : g - TerrainMesh.SINK_M; };
    const offsets = [-0.5, 0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8];
    let profiles = 0;
    const seams = [];
    for (let d = 8; d <= 60; d += 2) {
        const p = route.sample(v.routeS + d, {});
        if (p.flags.bridge || p.flags.tunnel || p.flags.gallery) continue;
        const edge = p.width / 2 + RoadSurface.VERGE_M;
        for (const side of [-1, 1]) {
            const row = offsets.map(o => {
                const lateral = side * (edge + o);
                const x = p.x + lateral * Math.cos(p.heading), z = p.z - lateral * Math.sin(p.heading);
                return lum(x, o <= 0 ? p.y + RoadMesh.LIFT_M : Math.max(landY(x, z, p.y), p.y - 30) + 0.02, z);
            });
            if (row.some(l => l === null)) continue;
            profiles++;
            const median = [...row].sort((a, b) => a - b)[Math.floor(row.length / 2)];
            for (let k = 1; k + 1 < row.length; k++) {
                if (row[k] < 0.6 * median && row[k - 1] > 0.8 * median && row[k + 1] > 0.8 * median) { seams.push({ ahead: d, side: side > 0 ? 'right' : 'left', offset: offsets[k], lum: Math.round(row[k]), median: Math.round(median) }); break; }
            }
        }
    }
    const lane = window.laneLines(game, s);
    return { s: Math.round(v.routeS), crashed: v.crashed, seam: { profiles, seams: seams.length, worst: seams.slice(0, 6) }, lane };
}

// A thin dark line along the carriageway (a seam, a joint or a patch outline that reads as a tyre mark), in the page:
// the roads alone in their own materials (the bike hidden) drawn by a camera where the chase camera rides, 6 m behind
// s and 2.8 m up, looking 12 m ahead, at 1280 x 720 (seen from straight above the same lines did not show: they read
// at a rider's grazing angle). Then the road from 3 m behind s to 20 m ahead is read across every 10 cm of road every
// centimetre between the verges. A dip is a run at most 3 px wide more than 25% darker than the median of the 0.6 m
// round it. A line is a chain of dips, each within 3 cm across of one on the row before (a gap of two rows allowed),
// 3 m long or more. Returns {rows, dips, lines}.
function laneLines(game, s0) {
    const env = game.environment, route = env.route, renderer = game.graphics.renderer;
    const at0 = route.sample(s0, {});
    const fx = Math.sin(at0.heading), fz = Math.cos(at0.heading);
    const W = 1280, H = 720;
    const cam = new THREE.PerspectiveCamera(game.camera.fov, W / H, 0.1, 2000);
    cam.position.set(at0.x - fx * 6, at0.y + 2.8, at0.z - fz * 6);
    cam.lookAt(at0.x + fx * 12, at0.y, at0.z + fz * 12);
    cam.updateMatrixWorld(true);
    const target = new THREE.WebGLRenderTarget(W, H);
    const hidden = [];
    const hide = o => { if (o.visible) { hidden.push(o); o.visible = false; } };
    game.scene.children.forEach(c => { if (c !== env.group && !c.isLight) hide(c); });
    env.group.children.forEach(c => { if (c !== env.roadGroup && c !== env.sideGroup) hide(c); });
    const fog = game.scene.fog;
    game.scene.fog = null;
    renderer.setRenderTarget(target);
    renderer.render(game.scene, cam);
    const pixels = new Uint8Array(W * H * 4);
    renderer.readRenderTargetPixels(target, 0, 0, W, H, pixels);
    renderer.setRenderTarget(null);
    hidden.forEach(o => { o.visible = true; });
    game.scene.fog = fog;
    target.dispose();
    const size = W;
    const q = new THREE.Vector3();
    const lum = (x, y, z) => {
        q.set(x, y, z).project(cam);
        if (q.z > 1 || q.z < -1) return null;
        const px = Math.round((q.x + 1) / 2 * (W - 1)), py = Math.round((q.y + 1) / 2 * (H - 1));
        if (px < 0 || py < 0 || px >= W || py >= H) return null;
        const i = (py * W + px) * 4;
        return pixels[i + 3] ? { l: 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2], px, py } : null;
    };
    const rows = [];
    for (let d = -3; d <= 20; d += 0.1) {
        const p = route.sample(s0 + d, {});
        if (p.flags.bridge || p.flags.tunnel || p.flags.gallery || p.flags.cobbles) { rows.push([]); continue; }
        const h = p.width / 2 - 0.3, at = [];
        let last = -1;
        for (let o = -h; o <= h; o += 0.01) {
            const hit = lum(p.x + o * Math.cos(p.heading), p.y + RoadMesh.LIFT_M, p.z - o * Math.sin(p.heading));
            if (!hit || hit.py * W + hit.px === last) continue;
            last = hit.py * W + hit.px;
            at.push({ o, l: hit.l, px: hit.px });
        }
        const found = [];
        for (let k = 0; k < at.length; k++) {
            const round = [];
            for (let j = 0; j < at.length; j++) if (Math.abs(at[j].o - at[k].o) <= 0.3) round.push(at[j].l);
            round.sort((a, b) => a - b);
            const median = round[Math.floor(round.length / 2)];
            if (!(at[k].l < 0.75 * median)) continue;
            let j = k;
            while (j + 1 < at.length && at[j + 1].l < 0.75 * median) j++;
            if (Math.abs(at[j].px - at[k].px) + 1 <= 3) found.push((at[k].o + at[j].o) / 2);
            k = j;
        }
        rows.push(found);
    }
    const chains = [];
    rows.forEach((found, r) => {
        for (const o of found) {
            const chain = chains.find(c => r - c.last <= 3 && r > c.last && Math.abs(c.o - o) <= 0.03);
            if (chain) { chain.last = r; chain.o = o; chain.n++; } else chains.push({ first: r, last: r, o, n: 1 });
        }
    });
    const lines = chains.filter(c => (c.last - c.first) * 0.1 >= 3).map(c => ({ at: Math.round(c.o * 100) / 100, fromM: Math.round(c.first) / 10 - 3, toM: Math.round(c.last) / 10 - 3 }));
    return { rows: rows.filter(r => r).length, dips: rows.reduce((n, r) => n + r.length, 0), lines };
}

function floatingCount(STRUCTURE_DARK = 32) {
    const env = game.environment;
    const renderer = game.graphics.renderer;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y);
    const flat = c => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide, fog: false });
    const land = flat(0x0000ff), other = flat(0x000000), structure = flat(0xffff00);
    const ribbon = new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        vertexShader: 'varying vec3 vWorld; varying vec3 vN; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }',
        fragmentShader: 'varying vec3 vWorld; varying vec3 vN; void main() { vec3 n = vN.y < 0.0 ? -vN : vN; gl_FragColor = dot(cameraPosition - vWorld, n) < 0.0 ? vec4(1.0, 0.0, 0.0, 1.0) : vec4(0.0, 1.0, 0.0, 1.0); }'
    });
    const saved = new Map();
    const hidden = [];
    // The bike stays, drawn as `other`: it hides the land behind it in the frame as drawn too
    const bike = game.vehicle && game.vehicle.group;
    game.scene.children.forEach(c => { if (c !== env.group && c !== bike && c.visible && !c.isLight) { hidden.push(c); c.visible = false; } });
    if (bike) bike.traverse(o => { if (o.isMesh) { saved.set(o, o.material); o.material = other; } });
    const inside = (o, group) => { for (let n = o; n; n = n.parent) if (n === group) return true; return false; };
    env.group.traverse(o => {
        if (!o.isMesh) return;
        saved.set(o, o.material);
        if (inside(o, env.tileGroup) || o === env.horizon || (env.farLand || []).includes(o)) o.material = land;
        else if (o.name === 'road-ribbon' || o.name === 'road-side') o.material = ribbon;
        else if (inside(o, env.roadGroup) || inside(o, env.sideGroup)) o.material = structure;
        else o.material = other;
    });
    const background = game.scene.background, fog = game.scene.fog;
    game.scene.background = new THREE.Color(0x000000);
    game.scene.fog = null;
    renderer.setRenderTarget(target);
    renderer.render(game.scene, game.camera);
    const pixels = new Uint8Array(size.x * size.y * 4);
    renderer.readRenderTargetPixels(target, 0, 0, size.x, size.y, pixels);
    renderer.setRenderTarget(null);
    for (const [o, m] of saved) o.material = m;
    hidden.forEach(c => { c.visible = true; });
    game.scene.background = background;
    game.scene.fog = fog;
    target.dispose();
    let underside = 0, top = 0, landPx = 0, black = 0, structurePx = 0, structureBlack = 0;
    const frame = window.floatFrame && window.floatFrame.w === size.x && window.floatFrame.h === size.y ? window.floatFrame : null;
    for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] > 200 && pixels[i + 1] < 50) underside++;
        else if (pixels[i + 1] > 200 && pixels[i] < 50) top++;
        else if (frame && pixels[i] > 200 && pixels[i + 1] > 200 && pixels[i + 2] < 50) {
            // A structure (a deck, its soffit, a pier, a wall, a tube) near black in the frame as drawn: concrete and
            // stone in shade stay over STRUCTURE_DARK (a soffit at 23 read as a black slab across the sky)
            const p = i / 4, x = p % size.x, y = size.y - 1 - Math.floor(p / size.x), at = (y * size.x + x) * 4;
            structurePx++;
            if (0.2126 * frame.image[at] + 0.7152 * frame.image[at + 1] + 0.0722 * frame.image[at + 2] < STRUCTURE_DARK) structureBlack++;
        } else if (frame && pixels[i + 2] > 200 && pixels[i] < 50 && pixels[i + 1] < 50) {
            // Land (a tile or the far land): near black in the frame as drawn (the target's rows run bottom up)
            const p = i / 4, x = p % size.x, y = size.y - 1 - Math.floor(p / size.x), at = (y * size.x + x) * 4;
            landPx++;
            if (0.2126 * frame.image[at] + 0.7152 * frame.image[at + 1] + 0.0722 * frame.image[at + 2] < 10) black++;
        }
    }
    return { underside, top, pixels: size.x * size.y, land: landPx, blackLand: landPx ? Math.round((black / landPx) * 10000) / 10000 : 0, structure: structurePx, blackStructure: structurePx ? Math.round((structureBlack / structurePx) * 10000) / 10000 : 0 };
}

// world-haze's verdict (HAZE_BANDS, HAZE_SKY): each band of each view that holds enough of it, and every band somewhere
function hazeChecks(haze, failures) {
    const within = (v, range) => v >= range[0] && v <= range[1];
    const judged = HAZE_BANDS.map(() => 0);
    for (const view of haze.views) {
        const where = `s ${view.s} turned ${view.turnDeg}`;
        const sky = view.sky.px >= HAZE_MIN_PX ? view.sky : null;
        if (view.bare.length) failures.push(`world-haze: at ${where} these are drawn without the haze: ${view.bare.join(', ')}`);
        if (sky) {
            for (const key of ['h', 's', 'v']) if (!within(sky[key], HAZE_SKY[key])) failures.push(`world-haze: at ${where} the sky near the horizon has ${key} ${sky[key]} (${sky.rgb}), outside the photos' ${HAZE_SKY[key].join(' to ')}`);
        }
        view.bands.forEach((band, i) => {
            const want = HAZE_BANDS[i];
            if (!(band.px >= HAZE_MIN_PX)) return;
            judged[i]++;
            for (const key of ['h', 's', 'v']) if (want[key] && !within(band[key], want[key])) failures.push(`world-haze: at ${where} the land at ${want.name} has ${key} ${band[key]} (${band.rgb}), outside the photos' ${want[key].join(' to ')}`);
            if (want.blue && sky && band.greenOverBlue > sky.greenOverBlue + HAZE_GREEN_TOL + 1e-9) failures.push(`world-haze: at ${where} the land at ${want.name} is greener than the sky near the horizon (green less blue ${band.greenOverBlue} against ${sky.greenOverBlue})`);
        });
    }
    HAZE_BANDS.forEach((want, i) => { if (!judged[i]) failures.push(`world-haze: no view holds ${HAZE_MIN_PX} px of land at ${want.name}`); });
}

// world-trees: the colour of the drawn trees against the photos (.agent/sop/photo-match.md) and against the land round
// them. At each station the chase view, and the same place looking 70 degrees to either side over the slopes, are drawn
// as the rider sees them; then drawn again with each tree kind and the land in an id colour and the view distance in
// green, and each tree pixel read in the frame as drawn. TREE_BANDS are the photos' ranges by distance (HSV of the
// display colour, 0 to 1); TREE_OVER_LAND is the most a band's trees may outshine the land round them (in 24 px cells
// holding both, tree-weighted).
// Stations: 0 and 400 the forest round Airolo, 1600 and 2000 the lower valley, 2800 the slopes at km 2 to 3; the rain
// views (TREE_RAIN_VIEWS) take the climb's rain look at two of them. The rain's own stretch of road (s 7 km on) holds
// few trees, and how many are resident there depends on the places visited before.
const TREE_VIEWS = [0, 400, 1600, 2000, 2800];
const TREE_RAIN_VIEWS = [0, 2800];
const TREE_BANDS = [
    { name: 'near', fromM: 0, toM: 60, s: [0.12, 0.58], v: [0.06, 0.4] },
    { name: 'mid', fromM: 60, toM: 250, s: [0.12, 0.48], v: [0.1, 0.38] },
    { name: 'far', fromM: 250, toM: 2040, s: [0.08, 0.48], v: [0.1, 0.38] }
];
const TREE_OVER_LAND = 0.03;
// Metres over the road the turned views look from: over the verge's bank, so the slope and its trees show
const TREE_EYE_M = 14;
const TREE_MIN_PX = 400;

// world-haze: the colour of distant land against the photos, by its distance. `node tools/world/photomatch.mjs haze`
// measured the owner's photos (19 with a camera that can be trusted; only these numbers leave them): the mean display
// colour of the land at 1 to 3 km (90, 95, 88: its own colour still), 3 to 8 km (76, 98, 121: hue 211, saturation
// 0.37, value 0.47), from 8 km (92, 125, 170: hue 214, saturation 0.46, value 0.67), and of the sky 1 to 8% of the
// picture's height over the skyline (188, 203, 224: hue 215, saturation 0.16, value 0.88). So distant land takes the
// sky's hue, deeper and darker, and it is never greener than the sky: green less blue (0 to 1) is -0.09 and -0.17
// for the land against -0.08 for the sky. HAZE_BANDS holds each band's mean colour to the spread of the photos' own
// means (`h` degrees, `s`, `v`), and `blue` holds it no greener than the sky near the horizon in the same view.
// Each view is drawn in clear air (the `dry` look) from HAZE_EYE_M over the road, then again with the view distance
// in place of the colour; the sky is read over the drawn skyline. Every material the world draws must carry the haze. HAZE_VIEWS are `s:turn` (degrees from the road's
// heading); a band a view holds less than HAZE_MIN_PX of is not judged there, and every band must be judged somewhere.
const HAZE_BANDS = [
    { name: '1 to 3 km', fromM: 1000, toM: 3000, s: [0, 0.6], v: [0.25, 0.65] },
    { name: '3 to 8 km', fromM: 3000, toM: 8000, h: [195, 225], s: [0.12, 0.6], v: [0.3, 0.68], blue: true },
    { name: '8 km on', fromM: 8000, toM: Infinity, h: [195, 225], s: [0.28, 0.6], v: [0.5, 0.83], blue: true }
];
// (`over`: the share of the frame's height over the skyline, and the most degrees over the level it is read at)
const HAZE_SKY = { name: 'sky near the horizon', over: [0.01, 0.08, 16], h: [195, 225], s: [0, 0.33], v: [0.75, 1] };
// The most a band may be greener than the sky near the horizon (green less blue of the mean colour, 0 to 1)
const HAZE_GREEN_TOL = 0.02;
const HAZE_VIEWS = ['400:180', '2800:180', '6600:180', '9500:180', '12800:0', '12800:180'];
const HAZE_EYE_M = 14;
const HAZE_MIN_PX = 1500;

async function hazeView(placeSource, s, turnDeg, eyeM, bands, skyOver) {
    const placeAt = new Function('game', `return (${placeSource})`)(game);
    const v = game.vehicle;
    const env = game.environment;
    // Clear air from end to end: the stage's own look puts mist and rain on the upper road
    if (!window.hazeTrack) window.hazeTrack = game.atmosphereTrack;
    const dry = WorldLooks.variants.dry.tremola[0].look;
    game.atmosphereTrack = AtmosphereTrack.forWorld(env.route.stages, env.route, Object.fromEntries(env.route.stages.map(stage => [stage.id, [{ from: 0, to: 1, look: dry }]])));
    game.setCameraView('near');
    await placeAt(s);
    game.atmosphereWritten = null;
    game.snapAtmosphere(game.atmosphereTrack, game.atmosphereUnit(s), { environment: env, weatherSystem: game.weatherSystem });
    document.querySelectorAll('#finishBanner').forEach(el => el.remove());
    game.worldCamera.reset(v.yawAngle);
    v.speed = 0;
    twistyDev.autopilot({ speed: 0 });
    for (let i = 0; i < 240; i++) twistyDev.step(1);
    env.streamer.pump(Infinity);
    twistyDev.step(1, { render: true });
    const cam = game.camera;
    cam.rotation.order = 'YXZ';
    cam.rotation.y += turnDeg * Math.PI / 180;
    cam.rotation.x = 0;
    cam.rotation.z = 0;
    cam.position.set(v.position.x, v.position.y + eyeM, v.position.z);
    cam.updateMatrixWorld(true);
    // (the eye stands eyeM over the road, in the open air, even where the bike stands in a gallery: it has the open
    // air's exposure, not the tube's, Game.updateTubeAdaptation)
    if (game.graphics) game.graphics.adaptation = 1;
    const renderer = game.graphics.renderer;
    const bike = v.group, bikeShown = bike.visible;
    bike.visible = false;
    game.graphics.render(game.scene, cam);
    const canvas = renderer.domElement;
    const copy = document.createElement('canvas');
    copy.width = canvas.width; copy.height = canvas.height;
    const ctx = copy.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(canvas, 0, 0);
    const frame = ctx.getImageData(0, 0, copy.width, copy.height).data;
    const W = copy.width, H = copy.height;
    // The distance frame: everything the world draws, its distance from the eye in 16 bits (to 65 km)
    const material = new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        vertexShader: 'varying float vD; void main() { vec4 p = vec4(position, 1.0);\n#ifdef USE_INSTANCING\np = instanceMatrix * p;\n#endif\nvec4 mv = modelViewMatrix * p; vD = length(mv.xyz); gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'varying float vD; void main() { float d = min(vD, 65535.0); float hi = floor(d / 256.0); gl_FragColor = vec4(1.0, hi / 255.0, (d - hi * 256.0) / 255.0, 1.0); }'
    });
    const saved = new Map(), hidden = [];
    game.scene.children.forEach(c => { if (c !== env.group && c.visible && !c.isLight) { hidden.push(c); c.visible = false; } });
    // One haze for everything a world draws: a drawn mesh whose material could take it and has not is named
    const bare = new Set();
    env.group.traverse(o => {
        if (!o.isMesh) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (LandShade.hazeable(m) && !m.userData.haze) bare.add(o.name || m.name || m.type);
        saved.set(o, o.material);
        o.material = material;
    });
    const background = game.scene.background, fog = game.scene.fog;
    game.scene.background = new THREE.Color(0x000000);
    game.scene.fog = null;
    const target = new THREE.WebGLRenderTarget(W, H);
    renderer.setRenderTarget(target);
    renderer.render(game.scene, cam);
    const ids = new Uint8Array(W * H * 4);
    renderer.readRenderTargetPixels(target, 0, 0, W, H, ids);
    renderer.setRenderTarget(null);
    for (const [o, m] of saved) o.material = m;
    hidden.forEach(c => { c.visible = true; });
    bike.visible = bikeShown;
    game.scene.background = background;
    game.scene.fog = fog;
    target.dispose();
    material.dispose();
    const empty = () => ({ n: 0, r: 0, g: 0, b: 0 });
    const land = bands.map(empty), sky = empty();
    const focal = H / 2 / Math.tan(cam.fov * Math.PI / 360), skyUp = skyOver[2] * Math.PI / 180;
    for (let x = 0; x < W; x++) {
        let top = -1;
        for (let y = 0; y < H; y++) {
            const k = ((H - 1 - y) * W + x) * 4;
            if (!ids[k]) continue;
            if (top < 0) top = y;
            const d = ids[k + 1] * 256 + ids[k + 2];
            const band = bands.findIndex(b => d >= b.fromM && d < (b.toM === null ? Infinity : b.toM));
            if (band < 0) continue;
            const f = (y * W + x) * 4, acc = land[band];
            acc.n++; acc.r += frame[f]; acc.g += frame[f + 1]; acc.b += frame[f + 2];
        }
        // The sky over this column's skyline (a column with no skyline in the frame has none)
        if (top <= 0) continue;
        for (let y = Math.max(0, Math.round(top - skyOver[1] * H)); y <= top - skyOver[0] * H; y++) {
            // (only the sky near the horizon: over a slope that fills the view it is the mid sky, far up)
            if (Math.atan((H / 2 - y) / focal) > skyUp) continue;
            const f = (y * W + x) * 4;
            sky.n++; sky.r += frame[f]; sky.g += frame[f + 1]; sky.b += frame[f + 2];
        }
    }
    const round = n => Math.round(n * 100) / 100;
    const read = a => {
        if (!a.n) return { px: 0 };
        const r = a.r / a.n, g = a.g / a.n, b = a.b / a.n, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
        const h = d > 0 ? (mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60 : 0;
        return { px: a.n, rgb: [r, g, b].map(Math.round), h: Math.round(h), s: round(mx ? d / mx : 0), v: round(mx / 255), greenOverBlue: round((g - b) / 255) };
    };
    return { s, turnDeg, size: [W, H], bare: [...bare], bands: land.map(read), sky: read(sky) };
}

async function treeColourView(placeSource, s, turnDeg, eyeM, rain) {
    const placeAt = new Function('game', `return (${placeSource})`)(game);
    const v = game.vehicle;
    // A rain view: every stage takes the Tremola's rain look from end to end (the trees stand low, the rain falls high)
    const env0 = game.environment;
    if (!window.treeTrack) window.treeTrack = game.atmosphereTrack;
    const rainPart = WorldLooks.tremola.find(part => part.look.weather === 'rain');
    game.atmosphereTrack = rain ? AtmosphereTrack.forWorld(env0.route.stages, env0.route, Object.fromEntries(env0.route.stages.map(stage => [stage.id, [{ from: 0, to: 1, look: rainPart.look }]]))) : window.treeTrack;
    game.setCameraView('near');
    await placeAt(s);
    game.atmosphereWritten = null;
    game.snapAtmosphere(game.atmosphereTrack, game.atmosphereUnit(s), { environment: env0, weatherSystem: game.weatherSystem });
    document.querySelectorAll('#finishBanner').forEach(el => el.remove());
    game.worldCamera.reset(v.yawAngle);
    v.speed = 0;
    twistyDev.autopilot({ speed: 0 });
    for (let i = 0; i < 240; i++) twistyDev.step(1);
    game.environment.streamer.pump(Infinity);
    twistyDev.step(1, { render: true });
    const cam = game.camera;
    if (turnDeg) {
        // Over the slopes beside the road: turned about the vertical, from TREE_EYE_M over the road, looking down
        cam.rotation.order = 'YXZ';
        cam.rotation.y += turnDeg * Math.PI / 180;
        cam.rotation.x = -0.2;
        cam.rotation.z = 0;
        cam.position.y = v.position.y + eyeM;
        cam.updateMatrixWorld(true);
    }
    const env = game.environment, renderer = game.graphics.renderer;
    game.graphics.render(game.scene, cam);
    const canvas = renderer.domElement;
    const copy = document.createElement('canvas');
    copy.width = canvas.width; copy.height = canvas.height;
    const ctx = copy.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(canvas, 0, 0);
    const frame = ctx.getImageData(0, 0, copy.width, copy.height).data;
    const W = copy.width, H = copy.height;
    // The id frame: tree kinds and land, the view distance in green (8 m steps to 2040 m)
    const KINDS = ['conifer', 'broadleaf', 'bush'];
    const idMaterial = id => new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        uniforms: { uId: { value: id } },
        vertexShader: 'varying float vD; void main() { vec4 p = vec4(position, 1.0);\n#ifdef USE_INSTANCING\np = instanceMatrix * p;\n#endif\nvec4 mv = modelViewMatrix * p; vD = -mv.z; gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'uniform float uId; varying float vD; void main() { gl_FragColor = vec4(uId, min(vD / 2040.0, 1.0), 0.0, 1.0); }'
    });
    const mats = { land: idMaterial(200 / 255), other: idMaterial(0), conifer: idMaterial(40 / 255), broadleaf: idMaterial(80 / 255), bush: idMaterial(120 / 255) };
    const saved = new Map(), hidden = [];
    const bike = v.group;
    game.scene.children.forEach(c => { if (c !== env.group && c !== bike && c.visible && !c.isLight) { hidden.push(c); c.visible = false; } });
    const inside = (o, group) => { for (let n = o; n; n = n.parent) if (n === group) return true; return false; };
    game.scene.traverse(o => {
        if (!o.isMesh || !(inside(o, env.group) || inside(o, bike))) return;
        saved.set(o, o.material);
        const kind = /^trees:(conifer|broadleaf|bush|plain_conifer|plain_broadleaf|plain_bush)/.exec(o.name);
        if (kind) o.material = mats[kind[1].replace('plain_', '')];
        else if (inside(o, env.tileGroup) || o === env.horizon || (env.farLand || []).includes(o)) o.material = mats.land;
        else o.material = mats.other;
    });
    const background = game.scene.background, fog = game.scene.fog;
    game.scene.background = new THREE.Color(0x000000);
    game.scene.fog = null;
    const target = new THREE.WebGLRenderTarget(W, H);
    renderer.setRenderTarget(target);
    renderer.render(game.scene, cam);
    const ids = new Uint8Array(W * H * 4);
    renderer.readRenderTargetPixels(target, 0, 0, W, H, ids);
    renderer.setRenderTarget(null);
    for (const [o, m] of saved) o.material = m;
    hidden.forEach(c => { c.visible = true; });
    game.scene.background = background;
    game.scene.fog = fog;
    target.dispose();
    Object.values(mats).forEach(m => m.dispose());
    const bands = [{ to: 60 }, { to: 250 }, { to: 2041 }];
    const empty = () => ({ n: 0, s: 0, v: 0, r: 0, g: 0, b: 0 });
    const trees = bands.map(() => ({ all: empty(), conifer: empty(), broadleaf: empty(), bush: empty() }));
    const land = bands.map(empty);
    const CELL = 24, cw = Math.ceil(W / CELL), ch = Math.ceil(H / CELL);
    const cells = Array.from({ length: cw * ch }, () => bands.map(() => ({ tn: 0, tv: 0, ln: 0, lv: 0 })));
    const add = (acc, r, g, b, sat, val) => { acc.n++; acc.s += sat; acc.v += val; acc.r += r; acc.g += g; acc.b += b; };
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const k = ((H - 1 - y) * W + x) * 4, id = ids[k];
            if (!id) continue;
            const d = ids[k + 1] / 255 * 2040;
            const band = d < 60 ? 0 : d < 250 ? 1 : 2;
            const f = (y * W + x) * 4, r = frame[f], g = frame[f + 1], b = frame[f + 2];
            const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
            const sat = mx ? (mx - mn) / mx : 0, val = mx / 255;
            const cell = cells[Math.floor(y / CELL) * cw + Math.floor(x / CELL)][band];
            if (id > 180) { add(land[band], r, g, b, sat, val); cell.ln++; cell.lv += val; }
            else {
                const kind = KINDS[Math.round(id / 40) - 1];
                if (!kind) continue;
                add(trees[band].all, r, g, b, sat, val);
                add(trees[band][kind], r, g, b, sat, val);
                cell.tn++; cell.tv += val;
            }
        }
    }
    const round = n => Math.round(n * 1000) / 1000;
    const mean = a => a.n ? { px: a.n, s: round(a.s / a.n), v: round(a.v / a.n), rgb: [a.r, a.g, a.b].map(c => Math.round(c / a.n)) } : { px: 0 };
    // Trees against the land round them: the cells of a band holding 8 px or more of each, weighted by tree pixels
    const over = bands.map((_, band) => {
        let w = 0, sum = 0, cellsUsed = 0;
        for (const c of cells) {
            const q = c[band];
            if (q.tn < 8 || q.ln < 8) continue;
            sum += (q.tv / q.tn - q.lv / q.ln) * q.tn; w += q.tn; cellsUsed++;
        }
        return w ? { px: w, cells: cellsUsed, vOverLand: round(sum / w) } : { px: 0 };
    });
    const look = game.graphics.grade ? { saturation: game.graphics.grade.saturation, contrast: game.graphics.grade.contrast } : null;
    return {
        s, turnDeg, rain: !!rain, size: [W, H], trees: env.scenery.treeCount, look, weather: game.weatherSystem ? game.weatherSystem.currentWeather : null,
        bands: bands.map((_, band) => ({ trees: mean(trees[band].all), conifer: mean(trees[band].conifer), broadleaf: mean(trees[band].broadleaf), bush: mean(trees[band].bush), land: mean(land[band]), ...over[band] }))
    };
}

// world-watertight: the drawn land is closed. From the near and the far chase camera at stations along the
// slice, the land, the road and its edge works are drawn alone (each kind in its own colour, back faces marked) and
// each pixel is read:
//   holes      a pixel that shows nothing (the horizon and the far land are not drawn) although its ray passes under
//              the drawn land before it leaves the drawn tiles (marched against each tile's own triangles at the LOD it
//              is drawn at): the ray went through a gap in the land (a crack between tiles, an edge no skirt closes)
//   backOpen   the underside of a land triangle seen through the land (its ray passed under the land before it)
//   skirtOpen  a tile's skirt seen the same way (a skirt in plain view closes a step between two LODs and is counted
//              as `skirt`, with the undersides as `backLand`, for information)
// Then the edge works: the top edge of every retaining wall has its road's ribbon within 0.15 m beside it
// (`jointOpen`), the feet of the aprons and retaining walls (the lowest outline edge of each triangle) must lie
// on the land drawn at LOD0 under them or in it (`footOpen`; over coarser land `footCoarse`, for information), and no
// corner or centre of one may stand over the ride's carriageway (`footOverRoad`: fill off an upper hairpin leg
// reaching out over the lower one).
const WATERTIGHT_EVERY_M = 50;
const WATERTIGHT_MODES = ['near', 'far'];
// Places the play-test found open: 400 to 500 the cut bank on the right (a crack along a tile edge), 2100 and 8700 a
// fill slope off an upper hairpin leg ending in the air, 4600 a slab of land over a hollow, 6900 a folded cut face
const WATERTIGHT_VIEWS = [400, 450, 500, 2100, 4600, 6900, 8700];
// Metres a ray must pass under the drawn land, and a foot may stand over it, before it counts
const WATERTIGHT_TOL_M = 0.3;
async function watertightWalk(placeSource, every, from, to, modes, tol, shotsAt) {
    const placeAt = new Function('game', `return (${placeSource})`)(game);
    game.worldLinger = false;
    const env = game.environment, route = env.route;
    const renderer = game.graphics.renderer;
    const W = 480, H = 270;
    const target = new THREE.WebGLRenderTarget(W, H, { depthBuffer: true });
    const pixels = new Uint8Array(W * H * 4);
    // The kinds: land top 1, skirt 2, road 3, works 4, other drawn 5; the far kinds (horizon, far land) 6, nothing 0
    const code = { land: 1, skirt: 2, road: 3, works: 4, other: 5, far: 6 };
    const make = id => new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        uniforms: { id: { value: id } },
        vertexShader: 'attribute float skirt; varying float vSkirt; void main(){ vSkirt = skirt; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform float id; varying float vSkirt; void main(){ float k = vSkirt > 1.5 ? 5.0 : vSkirt > 0.5 ? 2.0 : id; gl_FragColor = vec4(k / 255.0, gl_FrontFacing ? 0.0 : 1.0, 0.0, 1.0); }'
    });
    const mats = {};
    const mat = id => mats[id] || (mats[id] = make(id));
    const marked = new WeakSet();
    // Every vertex of a tile mesh: 0 on the land, 1 on a skirt, 2 on a forest clump
    // A tile cut to the retaining walls has more land past its grid's and its skirts' vertices (the cut triangles'
    // parts), and the faces and skirts that close a cut (mesh.userData.closing), which are skirts here
    const markSkirt = (mesh) => {
        const geometry = mesh.geometry;
        if (marked.has(geometry)) return;
        marked.add(geometry);
        const count = geometry.attributes.position.count;
        const flags = new Float32Array(count);
        const lod = /^world-terrain-.*-lod(\d)$/.exec(mesh.name);
        if (lod) {
            const side = (WorldData.TILE_N - 1) / (1 << Number(lod[1])) + 1, ground = side * side + side * 4;
            const cut = !!mesh.userData.cuts;
            for (let v = side * side; v < count; v++) flags[v] = v < ground ? 1 : cut ? 0 : 2;
            if (cut) for (const v of mesh.userData.closing || []) flags[v] = 1;
        }
        geometry.setAttribute('skirt', new THREE.BufferAttribute(flags, 1));
    };
    const kindOf = o => {
        const w = o.userData.world;
        if (w === 'terrain') return code.land;
        if (w === 'road') return code.road;
        if (w === 'works') return code.works;
        // The horizon and the far land are left out: one standing over the land is world-floating's horizonOver
        return null;
    };
    // The drawn land at (x, z): the tile mesh drawn there, on its own triangles at its LOD
    const drawnLand = (x, z) => {
        const m = WorldData.TILE_M;
        const tx = Math.floor(x / m), tz = Math.floor(z / m);
        const held = env.tileMeshes.get(`${tx},${tz}`);
        if (!held) return null;
        if (TerrainMesh.drawnAt && held.mesh.userData.lod !== undefined) return TerrainMesh.drawnAt(held.mesh, x, z);
        const side = (WorldData.TILE_N - 1) / (1 << Number(/lod(\d)/.exec(held.mesh.name)[1])) + 1;
        const cell = WorldData.TILE_M / (side - 1);
        const pos = held.mesh.geometry.attributes.position.array;
        const fx = (x - tx * m) / cell, fz = (z - tz * m) / cell;
        const i = Math.max(0, Math.min(side - 2, Math.floor(fx))), j = Math.max(0, Math.min(side - 2, Math.floor(fz)));
        const u = fx - i, v = fz - j;
        const Y = (a, b) => pos[((j + b) * side + i + a) * 3 + 1];
        return u + v <= 1 ? Y(0, 0) + u * (Y(1, 0) - Y(0, 0)) + v * (Y(0, 1) - Y(0, 0)) : Y(1, 1) + (1 - u) * (Y(0, 1) - Y(1, 1)) + (1 - v) * (Y(1, 0) - Y(1, 1));
    };
    // Whether a ray from `o` along unit `d` passes more than tol under the drawn land before it leaves the drawn tiles
    const under = (o, d, limit = 2500) => {
        for (let t = 1; t < limit; t += t < 200 ? 1 : 2) {
            const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
            const land = drawnLand(x, z);
            if (land === null) return false;
            const key = `${Math.floor(x / WorldData.TILE_M)},${Math.floor(z / WorldData.TILE_M)}`;
            // (inside a tunnel's or a gallery's box the land over the roof is not a gap: a ray in through a portal and
            // out through a gallery's opening passed under it there, TerrainMesh.tubeClip)
            if (y < land - tol && !(env.tubesNear && TerrainMesh.inTube(env.tubesNear(key), x, y, z))) return { t: Math.round(t), x: Math.round(x), z: Math.round(z), key, underM: Math.round((land - y) * 10) / 10 };
        }
        return null;
    };
    // The ride's carriageway under (x, z) and its height, or null
    const near = {};
    const carriageway = (x, z, inset = 0) => {
        let best = null;
        for (const i of route.cellSegments(x, z) || []) {
            route.nearestSegment(x, z, i, i, near);
            if (near.distance <= near.width / 2 - inset) best = best === null ? near.y : Math.max(best, near.y);
        }
        return best;
    };
    // Whether (x, z) lies in a road's band (the ride's carriageway and verge, a side road's) at about height y
    const inBand = (x, z, y) => {
        for (const i of route.cellSegments(x, z) || []) {
            route.nearestSegment(x, z, i, i, near);
            if (near.distance <= near.width / 2 + RoadSurface.VERGE_M + 0.05 && Math.abs(near.y - y) < 1.5) return true;
        }
        const side = env.ground.sideRoadY(x, z);
        return side !== null && Math.abs(side - y) < 1.5;
    };
    const r2 = v => Math.round(v * 100) / 100;
    const views = [], feetSeen = new Set();
    const footOpen = [], footOverRoad = [];
    let feet = 0, footCoarse = 0, overCoarse = 0, joints = 0;
    const jointOpen = [];
    const lodAt = (x, z) => { const held = env.tileMeshes.get(`${Math.floor(x / WorldData.TILE_M)},${Math.floor(z / WorldData.TILE_M)}`); return held ? Number(/lod(\d)/.exec(held.mesh.name)[1]) : 0; };
    const stations = [];
    // (by default the stage's own road and its stop: a folder of several stages holds the others too)
    if (from === 0 && to === Infinity && env.stage) { from = env.stage.from; to = env.stage.to + 200; }
    for (let s = from; s <= Math.min(to, route.length - 1); s += every) stations.push(Math.round(s));
    for (const s of shotsAt) if (!stations.includes(s)) stations.push(s);
    stations.sort((a, b) => a - b);
    for (const s of stations) {
        const p = route.sample(s, {});
        if (p.flags.tunnel || p.flags.gallery) continue;
        await placeAt(s);
        const v = game.vehicle;
        // The open edges of every edge works mesh drawn now: an edge of an apron or retaining wall triangle that no
        // other triangle of the same part shares is the part's outline. Off a road's band (where the ribbon covers it)
        // an outline edge must lie on the land or under it: over it, the apron's or wall's foot is open
        env.group.traverse(o => {
            if (!o.isMesh || o.userData.world !== 'works') return;
            for (let q = o.parent; q; q = q.parent) if (!q.visible) return;
            const g = o.geometry, pos = g.attributes.position.array;
            // The top of every retaining wall hangs from a drawn road: the ribbon beside it (the meshes of its own
            // group) lies within 0.15 m of each top edge on one side, at its height or under the parapet. A gap
            // there (a wall at the verge's edge beside a ribbon drawn without a verge) shows the drop through it
            const ribbons = [];
            if (o.parent) o.parent.traverse(r => { if (r.isMesh && r.userData.world === 'road') ribbons.push(r); });
            const down = new THREE.Raycaster();
            const ribbonAt = (x, y, z) => {
                down.set(new THREE.Vector3(x, y + 1, z), new THREE.Vector3(0, -1, 0));
                down.far = 2.6;
                if (down.intersectObjects(ribbons, false).length > 0) return true;
                // (or the ground the road lays under its verge, at the top's own height: a wall's face that tapers
                // out past its end stands with its top where that ground ends, RoadMesh.edgeWorks `taper`)
                return down.intersectObject(o, false).some(h => (h.face.materialIndex === 0 || h.face.materialIndex === 3) && Math.abs(h.point.y - y) < 0.045);
            };
            const vkey = v => `${Math.round(pos[v * 3] * 50)},${Math.round(pos[v * 3 + 1] * 50)},${Math.round(pos[v * 3 + 2] * 50)}`;
            const ekey = (a, b) => { const ka = vkey(a), kb = vkey(b); return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`; };
            for (const group of g.groups) {
                if (group.materialIndex !== 2 || !ribbons.length) continue;
                const uses = new Map();
                for (let t = group.start; t < group.start + group.count; t += 3) for (const [a, b] of [[t, t + 1], [t + 1, t + 2], [t + 2, t]]) { const e = ekey(a, b); uses.set(e, (uses.get(e) || 0) + 1); }
                for (let t = group.start; t < group.start + group.count; t += 3) {
                    for (const [a, b, c] of [[t, t + 1, t + 2], [t + 1, t + 2, t], [t + 2, t, t + 1]]) {
                        if (uses.get(ekey(a, b)) !== 1) continue;
                        const third = pos[c * 3 + 1];
                        if (!(third < pos[a * 3 + 1] - 0.05 && third < pos[b * 3 + 1] - 0.05)) continue;
                        // (a top is an upright face's: the edge across a coping that falls along its wall, a parapet's
                        // ramp to its kerb or a taper's sinking into the ground, is no top of a wall)
                        const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2];
                        const wx = pos[c * 3] - pos[a * 3], wy = third - pos[a * 3 + 1], wz = pos[c * 3 + 2] - pos[a * 3 + 2];
                        if (Math.abs(uz * wx - ux * wz) > 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx)) continue;
                        const ax = pos[a * 3], az = pos[a * 3 + 2], bx = pos[b * 3], bz = pos[b * 3 + 2];
                        const len = Math.hypot(bx - ax, bz - az);
                        if (len < 0.05) continue;
                        // (a face whose top falls faster than a road does is no wall's top)
                        if (Math.abs(pos[a * 3 + 1] - pos[b * 3 + 1]) > 0.4 * len) continue;
                        const mx = (ax + bx) / 2, my = (pos[a * 3 + 1] + pos[b * 3 + 1]) / 2, mz = (az + bz) / 2;
                        const seen = `top:${Math.round(mx * 4)},${Math.round(mz * 4)}`;
                        if (feetSeen.has(seen)) continue;
                        feetSeen.add(seen);
                        joints++;
                        const nx = -(bz - az) / len * 0.15, nz = (bx - ax) / len * 0.15;
                        if (!ribbonAt(mx + nx, my, mz + nz) && !ribbonAt(mx - nx, my, mz - nz)) jointOpen.push({ s, x: r2(mx), z: r2(mz), y: r2(my), road: o.parent.name });
                    }
                }
            }
            for (const group of g.groups) {
                // (decks and a viaduct's stone are structures, read as such elsewhere)
                if (group.materialIndex === 1 || group.materialIndex >= 4) continue;
                const kind = group.materialIndex === 0 || group.materialIndex === 3 ? 'apron' : 'wall';
                // No piece of an apron or a wall stands over another road's carriageway (a tongue of fill off an
                // upper hairpin leg reaching out over the lower one): its corners and its centre are read
                for (let t = group.start; t < group.start + group.count; t += 3) {
                    const pts = [0, 1, 2].map(k => [pos[(t + k) * 3], pos[(t + k) * 3 + 1], pos[(t + k) * 3 + 2]]);
                    pts.push(pts[0].map((c, i) => (c + pts[1][i] + pts[2][i]) / 3));
                    for (const [px, py, pz] of pts) {
                        const road = carriageway(px, pz, 0.1);
                        if (road === null || py < road + 0.3) continue;
                        const seen = `over:${Math.round(px * 2)},${Math.round(pz * 2)}`;
                        if (feetSeen.has(seen)) continue;
                        feetSeen.add(seen);
                        // (a far section's rows lie 16 m apart and its wall's top cuts across the bend's inside, where
                        // the carriageway is read as it is: counted apart, as a foot over coarse land is)
                        if (lodAt(px, pz) > 0) { overCoarse++; continue; }
                        footOverRoad.push({ s, x: r2(px), z: r2(pz), y: r2(py), road: r2(road), kind });
                    }
                }
                const count = new Map();
                const key = v => `${Math.round(pos[v * 3] * 50)},${Math.round(pos[v * 3 + 1] * 50)},${Math.round(pos[v * 3 + 2] * 50)}`;
                const edge = (a, b) => { const ka = key(a), kb = key(b); return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`; };
                for (let t = group.start; t < group.start + group.count; t += 3) for (const [a, b] of [[t, t + 1], [t + 1, t + 2], [t + 2, t]]) { const e = edge(a, b); count.set(e, (count.get(e) || 0) + 1); }
                for (let t = group.start; t < group.start + group.count; t += 3) {
                    for (const [a, b, c] of [[t, t + 1, t + 2], [t + 1, t + 2, t], [t + 2, t, t + 1]]) {
                        const e = edge(a, b);
                        if (count.get(e) !== 1) continue;
                        // A foot is the lowest edge of its triangle (its top edge hangs from the road, its sides end a run)
                        const third = pos[c * 3 + 1];
                        if (!(third > pos[a * 3 + 1] + 0.05 && third > pos[b * 3 + 1] + 0.05)) continue;
                        // (of a face or a slope: a wall's coping, a top that rises along its wall, has none)
                        if (kind === 'wall') {
                            const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2];
                            const wx = pos[c * 3] - pos[a * 3], wy = third - pos[a * 3 + 1], wz = pos[c * 3 + 2] - pos[a * 3 + 2];
                            if (Math.abs(uz * wx - ux * wz) > 0.95 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx)) continue;
                        }
                        if (Math.hypot(pos[a * 3] - pos[b * 3], pos[a * 3 + 2] - pos[b * 3 + 2]) < 0.05) continue;
                        const seen = `${kind}:${e}`;
                        if (feetSeen.has(seen)) continue;
                        feetSeen.add(seen);
                        feet++;
                        const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2], bx = pos[b * 3], by = pos[b * 3 + 1], bz = pos[b * 3 + 2];
                        const mx = (ax + bx) / 2, my = (ay + by) / 2, mz = (az + bz) / 2;
                        if (inBand(mx, mz, my)) continue;
                        if (carriageway(mx, mz) !== null) continue;
                        // (a wall's side to the road stands on the ground the road lays under its verge)
                        if (kind === 'wall' && ribbonAt(mx, my, mz)) continue;
                        // (a parapet stands on its wall's coping: a foot on stone is no foot over the land)
                        if (kind === 'wall') {
                            down.set(new THREE.Vector3(mx, my + 0.05, mz), new THREE.Vector3(0, -1, 0));
                            down.far = 0.12;
                            if (down.intersectObject(o, false).some(h => h.face.materialIndex === 2 && h.face.normal.y > 0.9)) continue;
                        }
                        const la = drawnLand(ax, az), lb = drawnLand(bx, bz);
                        if (la === null || lb === null) continue;
                        const over = Math.min(ay - la, by - lb);
                        if (!(over > tol)) continue;
                        // Over a tile drawn at LOD1 or 2 (700 m off or more), whose coarse vertices are held under
                        // the carved nodes within a stride, the works reach the land drawn near and are counted apart
                        if (lodAt(mx, mz) > 0) footCoarse++;
                        else footOpen.push({ s, x: r2(mx), z: r2(mz), overM: r2(over), kind });
                    }
                }
            }
        });
        for (const mode of modes) {
            game.setCameraView(mode);
            game.worldCamera.reset(v.yawAngle);
            v.speed = 0;
            twistyDev.autopilot({ speed: 0 });
            for (let i = 0; i < 120; i++) twistyDev.step(1);
            env.streamer.pump(Infinity);
            twistyDev.step(1);
            const cam = game.camera;
            cam.updateMatrixWorld();
            if (drawnLand(cam.position.x, cam.position.z) > cam.position.y) { views.push({ s, mode, skipped: 'camera under the land' }); continue; }
            const saved = [];
            game.scene.traverse(o => {
                // Rain, snow and other points, lines and sprites are not the land: they would paint over a pixel
                if (o.isPoints || o.isLine || o.isSprite) { saved.push([o, o.material, o.visible]); o.visible = false; return; }
                if (!o.isMesh) return;
                const kind = kindOf(o);
                saved.push([o, o.material, o.visible]);
                if (kind === null || o.isInstancedMesh) { o.visible = false; return; }
                markSkirt(o);
                if (!o.geometry.attributes.skirt) o.geometry.setAttribute('skirt', new THREE.BufferAttribute(new Float32Array(o.geometry.attributes.position.count), 1));
                o.material = mat(kind);
            });
            const bg = game.scene.background, fog = game.scene.fog;
            game.scene.background = new THREE.Color(0, 0, 0);
            game.scene.fog = null;
            const aspect = cam.aspect;
            renderer.setRenderTarget(target);
            renderer.setClearColor(0x000000, 1);
            renderer.clear();
            renderer.render(game.scene, cam);
            renderer.readRenderTargetPixels(target, 0, 0, W, H, pixels);
            renderer.setRenderTarget(null);
            saved.forEach(([o, m, vis]) => { o.material = m; o.visible = vis; });
            game.scene.background = bg;
            game.scene.fog = fog;
            cam.aspect = aspect;
            let holes = 0, backLand = 0, skirt = 0, land = 0;
            const backAt = [], skirtAt = [];
            const worst = [];
            const ray = new THREE.Raycaster();
            const ndc = new THREE.Vector2();
            for (let y = 0; y < H; y += 2) {
                for (let x = 0; x < W; x += 2) {
                    const at = (y * W + x) * 4;
                    const kind = pixels[at], back = pixels[at + 1] > 127;
                    if (kind === code.land) { land++; if (back) { backLand++; if (backAt.length < 400) backAt.push([x, y]); } continue; }
                    if (kind === code.skirt) { skirt++; if (skirtAt.length < 400) skirtAt.push([x, y]); continue; }
                    if (kind !== 0 && kind !== code.far) continue;
                    // Read back from the bottom row up
                    ndc.set((x + 0.5) / W * 2 - 1, (y + 0.5) / H * 2 - 1);
                    ray.setFromCamera(ndc, cam);
                    if (ray.ray.direction.y > 0.2) continue;
                    const gone = under(ray.ray.origin, ray.ray.direction);
                    if (gone) { holes++; if (worst.length < 4 || (gone.t < worst[0].t && worst.length < 12)) worst.push({ px: [x, H - 1 - y], ...gone }); }
                }
            }
            // An underside or a skirt in view is a gap only where its ray passed under the drawn land before it met
            // it: at a ridge seen edge-on or a tile edge seen from afar the rasteriser gives a back face or a skirt a
            // pixel now and then, with nothing open
            const terrain = [];
            env.tileGroup.traverse(o => { if (o.isMesh) terrain.push(o); });
            const through = list => {
                const out = [];
                for (const [x, y] of list) {
                    ndc.set((x + 0.5) / W * 2 - 1, (y + 0.5) / H * 2 - 1);
                    ray.setFromCamera(ndc, cam);
                    const hit = ray.intersectObjects(terrain, false)[0];
                    if (!hit) continue;
                    const gone = under(ray.ray.origin, ray.ray.direction, hit.distance - 0.5);
                    if (gone) out.push({ px: [x, H - 1 - y], t: Math.round(hit.distance), tile: hit.object.name.slice(14), ...gone });
                }
                return out;
            };
            const backOpen = through(backAt), skirtOpen = through(skirtAt);
            views.push({ s, mode, holes, backLand, skirt, land, worst, backOpen: backOpen.length, skirtOpen: skirtOpen.length, backAt: backOpen.slice(0, 4), skirtAt: skirtOpen.slice(0, 4) });
        }
    }
    target.dispose();
    const sum = key => views.reduce((n, w) => n + (w[key] || 0), 0);
    const top = key => views.filter(w => w[key]).sort((a, b) => b[key] - a[key]).slice(0, 8).map(w => ({ s: w.s, mode: w.mode, [key]: w[key], at: w.worst }));
    return {
        stations: stations.length, views: views.length, skipped: views.filter(w => w.skipped).length,
        holes: sum('holes'), holeViews: views.filter(w => w.holes).length, worstHoles: top('holes'),
        backLand: sum('backLand'), skirt: sum('skirt'),
        backOpen: sum('backOpen'), backViews: views.filter(w => w.backOpen).length, worstBack: views.filter(w => w.backOpen).sort((a, b) => b.backOpen - a.backOpen).slice(0, 8).map(w => ({ s: w.s, mode: w.mode, backOpen: w.backOpen, at: w.backAt })),
        skirtOpen: sum('skirtOpen'), skirtViews: views.filter(w => w.skirtOpen).length, worstSkirt: views.filter(w => w.skirtOpen).sort((a, b) => b.skirtOpen - a.skirtOpen).slice(0, 8).map(w => ({ s: w.s, mode: w.mode, skirtOpen: w.skirtOpen, at: w.skirtAt })),
        joints, jointOpen: jointOpen.length, worstJointOpen: jointOpen.slice(0, 8),
        worksEdges: feet, footCoarse, overCoarse, footOpen: footOpen.length, worstFootOpen: footOpen.sort((a, b) => b.overM - a.overM).slice(0, 8),
        footOverRoad: footOverRoad.length, footOverRoadByKind: { apron: footOverRoad.filter(f => f.kind === 'apron').length, wall: footOverRoad.filter(f => f.kind === 'wall').length },
        worstFootOverRoad: footOverRoad.sort((a, b) => (b.y - b.road) - (a.y - a.road)).slice(0, 8),
        perView: views
    };
}

const WORLD = {
    // The drawn land is closed: holes, land undersides and skirts in view, and edge works whose outline stands over
    // the land, from the near and the far chase every --every metres (50) between --from and --to
    // The drawn trees' colour against the photos' ranges and the land round them (treeColourView), at TREE_VIEWS
    // (--views s,s,...); --out <dir> saves each view as drawn
    'world-trees': async (page) => {
        const out = option('out');
        if (out) mkdirSync(out, { recursive: true });
        // The saved views show the frame alone, without the HUD
        if (out) await page.addStyleTag({ content: 'body * { visibility: hidden !important; } canvas { visibility: visible !important; }' });
        const tag = option('tag') || 'trees';
        const views = [];
        const rain = option('rain') ? option('rain').split(',').map(Number) : TREE_RAIN_VIEWS;
        const list = (option('views') ? option('views').split(',').map(Number) : TREE_VIEWS).map(s => ({ s, rain: false })).concat(rain.map(s => ({ s, rain: true })));
        for (const { s, rain: wet } of list) {
            for (const turn of [0, -70, 70]) {
                const at = await page.evaluate(treeColourView, placeAt.toString(), s, turn, TREE_EYE_M, wet);
                if (out) await page.screenshot({ path: join(out, `${tag}-s${s}${wet ? '-rain' : ''}${turn ? `-turn${turn}` : ''}.png`) });
                views.push(at);
            }
        }
        return { bands: TREE_BANDS, overLand: TREE_OVER_LAND, minPx: TREE_MIN_PX, views };
    },
    // The colour of distant land by its distance, and of the sky near the horizon, against the photos (hazeView), at
    // HAZE_VIEWS (--views s:turn,...); --out <dir> saves each view as drawn
    'world-haze': async (page) => {
        const out = option('out');
        if (out) mkdirSync(out, { recursive: true });
        if (out) await page.addStyleTag({ content: 'body * { visibility: hidden !important; } canvas { visibility: visible !important; }' });
        const tag = option('tag') || 'haze';
        const views = [];
        for (const view of (option('views') ? option('views').split(',') : HAZE_VIEWS)) {
            const [s, turn] = view.split(':').map(Number);
            // (JSON has no Infinity: the last band's end goes over as null)
            const at = await page.evaluate(hazeView, placeAt.toString(), s, turn || 0, HAZE_EYE_M, HAZE_BANDS.map(b => ({ fromM: b.fromM, toM: Number.isFinite(b.toM) ? b.toM : null })), HAZE_SKY.over);
            if (out) await page.screenshot({ path: join(out, `${tag}-s${s}-turn${turn || 0}.png`) });
            views.push(at);
        }
        return { views };
    },
    'world-watertight': async (page) => page.evaluate(watertightWalk, placeAt.toString(), Number(option('every') || WATERTIGHT_EVERY_M), Number(option('from') || 0), Number(option('to') || Infinity), viewsOption('modes', WATERTIGHT_MODES), WATERTIGHT_TOL_M, option('at') ? option('at').split(',').map(Number) : WATERTIGHT_VIEWS),
    // Floating roads and land over the road, as drawn: floatingWalk over the whole slice (every --every metres, 500 by
    // default), then the named views (FLOATING_VIEWS, or --views), each saved to --out when given
    'world-floating': async (page) => {
        const walk = await page.evaluate(floatingWalk, placeAt.toString(), Number(option('every') || 500), FLOAT_TOL_M, FLOAT_UP_M);
        const out = option('out');
        if (out) mkdirSync(out, { recursive: true });
        const tag = option('tag') || 'floating';
        const views = [];
        // (the Tremola's named views; another stage is seen every FLOATING_VIEW_STEP_M of its own road)
        // (not within FLOATING_VIEW_CLEAR_M of a tunnel or a gallery: a view into one is dark for its own reason)
        const span = await page.evaluate(() => (game.environment.stage ? [game.environment.stage.from, game.environment.stage.to, (game.environment.data.manifest.structures || []).filter(st => st.kind !== 'bridge').map(st => [st.s0, st.s1])] : null));
        const clear = v => !span[2].some(([a, b]) => v > a - FLOATING_VIEW_CLEAR_M && v < b + FLOATING_VIEW_CLEAR_M);
        const own = !span || (option('world') || 'tremola') === 'tremola' ? FLOATING_VIEWS : Array.from({ length: Math.max(1, Math.floor((span[1] - span[0]) / FLOATING_VIEW_STEP_M)) }, (_, k) => {
            const v = span[0] + 250 + k * FLOATING_VIEW_STEP_M;
            for (let d = 0; d < FLOATING_VIEW_STEP_M / 2; d += 50) {
                if (clear(v + d) && v + d < span[1]) return Math.round(v + d);
                if (clear(v - d) && v - d > span[0]) return Math.round(v - d);
            }
            return Math.round(v);
        }).filter(clear);
        for (const s of (option('views') ? option('views').split(',').map(Number) : own)) {
            await page.evaluate(`window.laneLines = ${laneLines.toString()}`);
            const at = await page.evaluate(floatingView, placeAt.toString(), pilotWorld.toString(), s);
            let file = null;
            if (out) {
                file = join(out, `${tag}-s${s}.png`);
                await page.screenshot({ path: file });
            }
            const count = await page.evaluate(floatingCount);
            views.push({ want: s, ...at, ...count, file });
        }
        return { ...walk, views };
    },
    // The drawn window against the budgets, every `--every` metres of ride; the resident ride and tile counts too
    'world-window': async page => {
        const every = Number(option('every') || 1000);
        const rows = await page.evaluate(async (step, bikeTileM, countSource, placeSource, meshCap) => {
            const countScene = new Function(`return (${countSource})`)();
            const placeAt = new Function('game', `return (${placeSource})`)(game);
            const route = game.environment.route, stage = game.environment.stage;
            const out = [];
            // (the stage's own road and its stop past the finish line: a folder of several stages holds the others too)
            const from = stage ? stage.from : 0, to = stage ? Math.min(route.length, stage.to + 200) : route.length;
            for (let s = from; s <= to; s += step) {
                const p = await placeAt(s);
                const env = game.environment;
                const near = [...env.streamer.refs.keys()].length;
                const m = env.tileMeshes;
                const bike = [...env.streamer.tilesNear(p.x, p.z, bikeTileM)];
                const counted = countScene();
                out.push({ s: Math.round(s), ...counted, meshMargin: meshCap - counted.meshes, tiles: m.size, refTiles: near, bikeTilesMissing: bike.filter(key => !env.streamer.refs.has(key) || !m.has(key)).length, sections: env.roadMeshes.size, sides: env.sideMeshes.size, trees: env.scenery.treeCount, windowRoom: env.scenery.windowRoom, houseCap: env.scenery.houseCap ? env.scenery.houseCap() : null, loopAt: game.windowBudgetAt ? Math.round(performance.now() - game.windowBudgetAt) : null, byKind: { ...env.streamer.stats.maxStepByKind }, maxStepMs: Math.round(env.streamer.stats.maxStepMs * 100) / 100 });
            }
            return out;
        }, every, WORLD_BIKE_TILE_M, countScene.toString(), placeAt.toString(), LEG_BUDGET.meshes);
        return { every, rows, leastMeshMargin: Math.min(...rows.map(r => r.meshMargin)) };
    },
    'world-budget': page => WORLD['world-window'](page),
    // Milliseconds to render one frame of the world (scene, post and a 1-pixel read-back that waits for the GPU) from the
    // chase view at five points of the ride, after the window round each has settled. The median of `count` frames per
    // point, the median of all of them and the worst frame. Read with --gpu: a software renderer measures nothing useful.
    'world-frametime': async page => page.evaluate(async (placeSource, count) => {
        const placeAt = new Function('game', `return (${placeSource})`)(game);
        const route = game.environment.route;
        const gl = game.graphics.renderer.getContext();
        const pixel = new Uint8Array(4);
        const frame = () => {
            const t0 = performance.now();
            game.graphics.render(game.scene, game.camera);
            gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
            return performance.now() - t0;
        };
        const median = list => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)];
        const round = n => Math.round(n * 100) / 100;
        const all = [];
        const points = [];
        for (const f of [0.1, 0.3, 0.5, 0.7, 0.9]) {
            const s = Math.round(f * route.length);
            await placeAt(s);
            game.setCameraView('near');
            game.worldCamera.reset(game.vehicle.yawAngle);
            twistyDev.autopilot({ speed: 0 });
            for (let i = 0; i < 240; i++) twistyDev.step(1);
            game.environment.streamer.pump(Infinity);
            for (let i = 0; i < 5; i++) frame();
            const times = Array.from({ length: count }, frame);
            all.push(...times);
            points.push({ s, ms: round(median(times)), worst: round(Math.max(...times)) });
        }
        return { points, medianMs: round(median(all)), worstMs: round(Math.max(...all)), worstPointMs: Math.max(...points.map(p => p.ms)), renderer: gl.getParameter(gl.RENDERER) };
    }, placeAt.toString(), Number(option('frames') || 30)),
    // GPU pictures of the riding view: the chase camera at five points of the ride, ridden into for 140 m so the
    // camera has its riding place. `--out <dir>` names the folder, `--tag` the file prefix.
    'world-ride-shots': async (page) => {
        const out = option('out');
        if (!out) return { error: 'name a folder with --out <dir>' };
        mkdirSync(out, { recursive: true });
        const tag = option('tag') || 'ride';
        const length = await page.evaluate(() => game.environment.route.length);
        const files = [];
        // --at names the stations to shoot; --luma 1 hides the HUD and gives each frame's mean luminance (0 to 1)
        const stations = option('at') ? option('at').split(',').map(Number) : [0.05, 0.25, 0.45, 0.65, 0.85].map(f => Math.round(f * length));
        if (option('luma')) await page.addStyleTag({ content: 'body * { visibility: hidden !important; } canvas { visibility: visible !important; }' });
        for (const s of stations) {
            const at = await page.evaluate(async (placeSource, pilotSource, s) => {
                const placeAt = new Function('game', `return (${placeSource})`)(game);
                const v = game.vehicle;
                game.setCameraView('near');
                await placeAt(Math.max(10, s - 140));
                game.worldCamera.reset(v.yawAngle);
                new Function('game', 'cruise', `return (${pilotSource})(game, cruise)`)(game, 18);
                let ticks = 0;
                while (v.routeS < s && !v.crashed && ticks < 3600) { twistyDev.step(1); ticks++; }
                game.environment.streamer.pump(Infinity);
                // The effects' glare, wet road and grade are eased in Graphics.update, which a step without its draw
                // skips: they take their values for this place at once
                if (typeof Effects !== 'undefined' && game.effectLevels) { Effects.frame(game); game.graphics.easeEffects(10); }
                twistyDev.step(1, { render: true });
                return { s: Math.round(v.routeS), crashed: v.crashed };
            }, placeAt.toString(), pilotWorld.toString(), s);
            const file = join(out, `${tag}-s${s}.png`);
            const png = await page.screenshot({ encoding: 'base64' });
            writeFileSync(file, Buffer.from(png, 'base64'));
            const luma = option('luma') ? await page.evaluate(async data => {
                const image = new Image();
                image.src = `data:image/png;base64,${data}`;
                await image.decode();
                const canvas = document.createElement('canvas');
                canvas.width = image.width; canvas.height = image.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(image, 0, 0);
                const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
                let sum = 0;
                for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
                return Math.round(sum / (d.length / 4) / 255 * 1000) / 1000;
            }, png) : undefined;
            files.push({ file, ...at, luma });
        }
        return { files };
    },
    // Before and after pictures of the effects (js/effects.js): at each station of --at the chase view as world-ride-shots
    // rides to it, then one picture for each spec of --specs (';' between specs, each as --effects takes it), the
    // frame drawn again under it. --night shoots at night. The files are <tag>-s<s>-<spec>.png in --out
    'world-effect-shots': async (page) => {
        const out = option('out');
        if (!out) return { error: 'name a folder with --out <dir>' };
        mkdirSync(out, { recursive: true });
        const tag = option('tag') || 'fx';
        const specs = (option('specs') || 'off;high').split(';');
        const stations = option('at') ? option('at').split(',').map(Number) : [150];
        // --camera near|far: the chase view (Game.cameraModes by type; near, the default)
        const camera = viewsOption('camera', ['near'])[0];
        await page.addStyleTag({ content: 'body * { visibility: hidden !important; } body > canvas { visibility: visible !important; }' });
        const files = [];
        for (const s of stations) {
            const at = await page.evaluate(async (placeSource, pilotSource, s, camera) => {
                const placeAt = new Function('game', `return (${placeSource})`)(game);
                const v = game.vehicle;
                game.setCameraView(camera);
                await placeAt(Math.max(10, s - 140));
                game.worldCamera.reset(v.yawAngle);
                new Function('game', 'cruise', `return (${pilotSource})(game, cruise)`)(game, 18);
                let ticks = 0;
                while (v.routeS < s && !v.crashed && ticks < 3600) { twistyDev.step(1); ticks++; }
                game.environment.streamer.pump(Infinity);
                return { s: Math.round(v.routeS), crashed: v.crashed };
            }, placeAt.toString(), pilotWorld.toString(), s, camera);
            // --car: a car with its lamps on stands --car m ahead in the other lane, facing the bike (the glare's subject)
            if (option('car')) await page.evaluate((ahead) => {
                const car = game.traffic && game.traffic.cars && game.traffic.cars.find(c => c.carGroup && c.carGroup.parent);
                if (!car) return;
                const v = game.vehicle;
                const p = game.environment.route.sample(v.routeS + ahead, {});
                car.carGroup.position.set(p.x - 2.2 * Math.cos(p.heading), p.y + 0.32, p.z + 2.2 * Math.sin(p.heading));
                car.carGroup.rotation.set(0, p.heading + Math.PI, 0);
                car.carGroup.visible = true;
                car.setHeadlights(true);
                // The car's own update would put it back on its lane: it stands where it is put for the pictures
                car.update = () => {};
                car.carGroup.updateMatrixWorld(true);
            }, Number(option('car')));
            for (const spec of specs) {
                const set = await page.evaluate(effectsSpec, spec);
                if (set.error) return { error: `${spec}: ${set.error}` };
                // Two draws: the first compiles what the spec changed and draws the far shadow map
                await page.evaluate(() => { game.graphics.render(game.scene, game.camera); game.graphics.render(game.scene, game.camera); });
                const name = spec.replace(/[^a-z0-9=,]+/gi, '').replace(/[=,]/g, '-');
                const file = join(out, `${tag}-s${s}${camera === 2 ? '' : `-c${camera}`}-${name}.png`);
                await page.screenshot({ path: file });
                files.push({ file, spec, ...at, inForce: set.inForce });
                // --ao-buffer: the occlusion itself (white open, black closed), from the blurred half-resolution target
                if (flag('ao-buffer') && set.inForce.ao !== 'off') {
                    const png = await page.evaluate(() => {
                        const g = game.graphics, t = g.aoTargets && g.aoTargets[1];
                        if (!t) return null;
                        const data = new Uint8Array(t.width * t.height * 4);
                        g.renderer.readRenderTargetPixels(t, 0, 0, t.width, t.height, data);
                        const canvas = document.createElement('canvas');
                        canvas.width = t.width; canvas.height = t.height;
                        const ctx = canvas.getContext('2d'), image = ctx.createImageData(t.width, t.height);
                        for (let y = 0; y < t.height; y++) for (let x = 0; x < t.width; x++) {
                            const from = ((t.height - 1 - y) * t.width + x) * 4, to = (y * t.width + x) * 4;
                            image.data[to] = image.data[to + 1] = image.data[to + 2] = data[from];
                            image.data[to + 3] = 255;
                        }
                        ctx.putImageData(image, 0, 0);
                        return canvas.toDataURL('image/png').split(',')[1];
                    });
                    if (png) writeFileSync(file.replace(/\.png$/, '-ao.png'), Buffer.from(png, 'base64'));
                }
            }
        }
        return { files };
    },
    // The physics ground against the drawn ground: a ray down onto the drawn world meshes
    'world-ground': async page => page.evaluate(async (placeSource, want) => {
        const placeAt = new Function('game', `return (${placeSource})`)(game);
        const env = game.environment;
        const route = env.route;
        // road: |drawn - physics| in the road band; land: the same within 300 m off the road;
        // above: how far the drawn land stands over the road surface at each road point (P8: never)
        const road = [], land = [], above = [];
        const raycaster = new THREE.Raycaster();
        const down = new THREE.Vector3(0, -1, 0);
        // `from`: the height the ray starts at. A road point casts from 3 m over the physics ground, the ground under the
        // rider, so a road that passes over the ride (a side road on its own bridge) is not read as the ride's surface
        // A retaining wall, deck or parapet of the edge works is a structure, not ground (the physics treats it so)
        const hitY = (x, z, groups, from = 4000) => {
            raycaster.set(new THREE.Vector3(x, from, z), down);
            const hit = raycaster.intersectObjects(groups, true).find(h => !(h.object.name === 'road-works' && (h.face.materialIndex === 1 || h.face.materialIndex === 2 || h.face.materialIndex >= 4)));
            return hit ? hit.point.y : null;
        };
        const drawn = [env.tileGroup, env.roadGroup, env.sideGroup];
        // The road's own surface, not the edge works of a leg overhanging it (a deck's soffit can lie within 3 m over it)
        const surfacesNow = () => { const out = []; drawn.forEach(g => g.traverse(o => { if (o.isMesh && o.name !== 'road-works') out.push(o); })); return out; };
        const stations = 12;
        // Each station takes its share of what is still wanted, so the totals reach `want` unless candidates run out
        const quota = (list, k) => Math.ceil((want - list.length) / (stations - k));
        for (let k = 0; k < stations; k++) {
            const s = (route.length * (k + 0.5)) / stations;
            const p = await placeAt(s);
            const w = p.width;
            const surfaces = surfacesNow();
            const roadWanted = road.length + quota(road, k);
            for (let i = 0; i < 400 && road.length < roadWanted; i++) {
                const a = ((i * 0.618) % 1) * 2 - 1;
                const lateral = Math.sign(a || 1) * (0.4 + Math.abs(a) * (w / 2 - 1.4));
                const along = ((i * 0.381966) % 1) * 160 - 80;
                const q = route.sample(s + along, {});
                const x = q.x + lateral * Math.cos(q.heading), z = q.z - lateral * Math.sin(q.heading);
                const loc = {};
                const ground = env.ground.groundY(x, z, { start: route.toUnits(s + along) - 12, end: route.toUnits(s + along) + 12 }, true, loc);
                // A structure's deck or roof is not the carved road: the DEM may stand level with a short bridge (tunnels and bridges are P15's)
                if (!(Math.abs(loc.lateral) < w / 2) || q.flags.bridge || q.flags.tunnel || q.flags.gallery) continue;
                const hit = hitY(x, z, surfaces, ground + 3);
                if (hit === null) continue;
                road.push(Math.abs(hit - ground));
                const tile = hitY(x, z, [env.tileGroup], ground + 3);
                above.push(tile === null ? -Infinity : tile - ground);
            }
            const landWanted = land.length + quota(land, k);
            for (let i = 0; i < 400 && land.length < landWanted; i++) {
                const d = 20 + ((i * 0.377) % 1) * 280;
                const a = (i * 2.399) + k;
                const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
                const loc = {};
                const q = route.project(x, z, null, {});
                const ground = env.ground.groundY(x, z, { start: q.index - 12, end: q.index + 12 }, true, loc);
                if (!(Math.abs(loc.lateral) > w / 2 + 6)) continue;
                const hit = hitY(x, z, drawn);
                if (hit !== null) land.push(Math.abs(hit - ground));
            }
        }
        const sorted = list => list.slice().sort((a, b) => a - b);
        const q = (list, f) => (list.length ? sorted(list)[Math.min(list.length - 1, Math.floor(list.length * f))] : null);
        const r3 = v => Math.round(v * 1000) / 1000;
        return {
            want,
            road: { n: road.length, max: r3(Math.max(...road)), p99: r3(q(road, 0.99)) },
            land: { n: land.length, max: r3(Math.max(...land)), p99: r3(q(land, 0.99)) },
            // The highest the drawn land stands over the road surface at a road point (negative: below it)
            aboveRoad: { n: above.length, over: above.filter(d => d > 0).length, max: r3(Math.max(...above)) }
        };
    }, placeAt.toString(), Number(option('points') || 500)),
    // Every pass of every ride junction: no barrier is drawn, every side road that leaves it is drawn as its stub, and
    // the physics makes no wall and no fall across a stub's carriageway, read where the bike reads it (the point itself)
    'world-junction': async page => page.evaluate(async (placeSource) => {
        const placeAt = new Function('game', `return (${placeSource})`)(game);
        const env = game.environment;
        const out = [];
        for (const junction of env.graph.junctions) {
            const passes = [];
            for (const pass of junction.passes) {
                await placeAt(pass.sIn);
                env.streamer.pump(Infinity);
                const barriers = [];
                env.group.traverse(o => { if (/barrier/i.test(o.name || '') || /barrier/i.test(String(o.userData.world || ''))) barriers.push(o.name); });
                const drawn = new Set();
                for (const group of env.sideMeshes.values()) for (const road of group.userData.roads || []) if (road.userData.stub) drawn.add(road.userData.edge);
                const stubs = [], missing = [], solid = [];
                for (const { edgeId } of junction.incident) {
                    if (env.graph.rideEdgeIds.has(edgeId)) continue;
                    stubs.push(edgeId);
                    if (!drawn.has(edgeId)) missing.push(edgeId);
                    for (const r of env.graph.stub(edgeId, junction.node) || []) {
                        for (let c = -r.width / 2 + 0.05; c <= r.width / 2 - 0.05 + 1e-9; c += 0.25) {
                            const x = r.x + c * Math.cos(r.heading), z = r.z - c * Math.sin(r.heading);
                            const q = env.route.project(x, z, null, {});
                            if (q.distance <= q.width / 2) continue;
                            const zone = env.ground.zoneAt({ index: q.index, t: q.along, lateral: q.lateral, x, z, roadY: q.y }, q.width / 2);
                            if ((zone.kind === 'wall' || zone.kind === 'fall') && solid.length < 10) solid.push({ edge: edgeId, kind: zone.kind, s: Math.round(q.s), lateral: Math.round(q.lateral * 100) / 100 });
                        }
                    }
                }
                passes.push({ sIn: pass.sIn, stubs, missing, solid, barriers });
            }
            if (passes.length) out.push({ id: junction.id, name: junction.name, passes });
        }
        return out;
    }, placeAt.toString()),
    // Off the ride line, backwards, and the ordinary ride between (the control)
    'world-wrongway': async page => page.evaluate(async (placeSource, pilotSource, sideS) => {
        const placeAt = new Function('game', `return (${placeSource})`)(game);
        const env = game.environment;
        const guide = env.guide;
        const v = game.vehicle;
        twistyDev.freeze();
        let clock = 0;
        const step = guide.step.bind(guide);
        guide.step = state => { clock += state.dt; return step(state); };
        const seen = () => ({ warnedAt: null, restartAt: null });
        const run = async (name, s, hold, seconds) => {
            const t = seen();
            await placeAt(s);
            const restarts = game.restarts;
            clock = 0;
            const base = v.update.bind(v);
            const pin = { x: v.position.x, y: v.position.y, z: v.position.z };
            v.update = (...args) => {
                base(...args);
                if (game.restarts === restarts) hold(pin);
            };
            for (let tick = 0; tick < seconds * 60; tick++) {
                twistyDev.step(1);
                if (t.warnedAt === null && guide.warning) t.warnedAt = clock;
                if (t.restartAt === null && game.restarts > restarts) { t.restartAt = clock; break; }
            }
            v.update = base;
            return { name, warnedAt: t.warnedAt, restartAt: t.restartAt, restarts: game.restarts - restarts };
        };
        const route = env.route;
        const results = [];
        // A place 50 m beside the ride with no other road within 45 m: the nearest ride point is then 50 m away
        let site = null;
        for (let s = 800; s < route.length && !site; s += 100) {
            const p = route.sample(s, {});
            for (const side of [1, -1]) {
                const x = p.x + side * 50 * Math.cos(p.heading), z = p.z - side * 50 * Math.sin(p.heading);
                if (route.project(x, z, null, {}).distance >= 49) { site = { s, side }; break; }
            }
        }
        if (!site) return [{ name: 'off-route-50m', error: 'no place on the ride has 45 m of clear ground beside it' }];
        results.push(await run('off-route-50m', site.s, pin => {
            const p = route.sample(site.s, {});
            v.position.set(p.x + site.side * 50 * Math.cos(p.heading), pin.y, p.z - site.side * 50 * Math.sin(p.heading));
            v.speed = 0; v.crashed = false; v.offRoadTime = 0;
        }, 14));
        results[0].site = site.s;
        guide.reset();
        results.push(await run('backwards-10ms', 3000, () => {
            const p = route.sample(3000, {});
            v.position.set(p.x, p.y, p.z);
            v.yawAngle = p.heading + Math.PI; v.speed = 10; v.crashed = false;
        }, 20));
        guide.reset();
        game.restartLeg();
        const pilot = new Function('game', 'cruise', `return (${pilotSource})(game, cruise)`);
        pilot(game, 20);
        const crashes = [];
        const log = console.log;
        console.log = (...args) => { if (/CRASHED/.test(String(args[0]))) crashes.push(String(args[0]) + ' ' + args.slice(1).join(' ')); log(...args); };
        const restarts = game.restarts;
        let warned = false;
        for (let tick = 0; tick < 60 * 400 && v.routeS < env.startS + 2000; tick++) {
            twistyDev.step(1);
            if (guide.warning) warned = true;
            if (v.crashed) break;
        }
        console.log = log;
        results.push({ name: 'ride-2km', metres: Math.round(v.routeS - env.startS), crashed: v.crashed, crash: crashes[0] || null, speed: Math.round(v.speed * 10) / 10, lateral: Math.round(v.projection.lateral * 10) / 10, warned, restarts: game.restarts - restarts });
        // Into the side road of the junction nearest WRONGWAY_SIDE_S at 10 m/s, as a rider steers (nothing closes it):
        // the warning, then the restart 10 s later and what the call-outs said
        const pick = env.graph.junctions.flatMap(j => j.passes.map(pass => ({ j, pass }))).filter(({ j }) => j.incident.some(i => !env.graph.rideEdgeIds.has(i.edgeId)))
            .sort((a, b) => Math.abs(a.pass.sIn - sideS) - Math.abs(b.pass.sIn - sideS))[0];
        const sideEdge = pick.j.incident.find(i => !env.graph.rideEdgeIds.has(i.edgeId)).edgeId;
        guide.reset();
        await placeAt(pick.pass.sIn - 40);
        env.streamer.pump(Infinity);
        const way = [];
        for (let s = pick.pass.sIn - 40; s < pick.pass.sIn; s += 2) { const p = route.sample(s, {}); way.push({ x: p.x, z: p.z, m: s - pick.pass.sIn }); }
        for (const r of env.graph.chainFrom(sideEdge, pick.j.node, 600).rows) way.push({ x: r.x, z: r.z, m: r.run });
        const last = way[way.length - 1], prior = way[way.length - 2], ahead = Math.atan2(last.x - prior.x, last.z - prior.z);
        for (let d = 4; d <= 400; d += 4) way.push({ x: last.x + d * Math.sin(ahead), z: last.z + d * Math.cos(ahead), m: last.m + d });
        let k = 0;
        const nearest = () => { for (let j = k; j < Math.min(way.length, k + 60); j++) if (Math.hypot(way[j].x - v.position.x, way[j].z - v.position.z) < Math.hypot(way[k].x - v.position.x, way[k].z - v.position.z)) k = j; return way[k].m; };
        const input = game.input;
        const wrapped = a => Math.atan2(Math.sin(a), Math.cos(a));
        input.getSteeringInput = () => {
            const m = nearest(), reach = Math.max(5, Math.min(30, 3 + 0.7 * v.speed));
            let t = k;
            while (t < way.length - 1 && way[t].m - m < reach) t++;
            const err = wrapped(Math.atan2(way[t].x - v.position.x, way[t].z - v.position.z) - v.yawAngle);
            const most = Math.min(1 / env.physics.radiusFloor, 9.81 * Math.tan(v.worldPhysics.leanCapDeg * Math.PI / 180) / Math.max(1, v.speed * v.speed));
            const wanted = Math.max(-most, Math.min(most, 2 * Math.sin(err) / reach));
            const lean = -Math.sign(wanted) * Math.atan(v.speed * v.speed * Math.abs(wanted) / 9.81);
            return Math.max(-1, Math.min(1, (v.leanAngle - lean) * 8));
        };
        input.getThrottleInput = () => (v.speed < 10 ? 1 : 0);
        input.getBrakeInput = () => (v.speed > 11 ? 1 : 0);
        v.speed = 10;
        const said = [];
        const callout = window.showCallout;
        window.showCallout = (text, ...rest) => { said.push(text); return callout(text, ...rest); };
        const before = game.restarts;
        const side = { name: 'side-road-10ms', s: Math.round(pick.pass.sIn), warnedAt: null, warnedM: null, restartAt: null, restartM: null, crashed: false, said };
        clock = 0;
        for (let tick = 0; tick < 60 * 40; tick++) {
            const m = nearest();
            twistyDev.step(1);
            if (side.warnedAt === null && guide.warning) Object.assign(side, { warnedAt: clock, warnedM: Math.round(m) });
            if (game.restarts > before) { Object.assign(side, { restartAt: clock, restartM: Math.round(m) }); break; }
            if (v.crashed) { side.crashed = true; break; }
        }
        window.showCallout = callout;
        results.push(side);
        return results;
    }, placeAt.toString(), pilotWorld.toString(), WRONGWAY_SIDE_S),
    // The data credit is in Credits, not on screen: reachable from the pause panel of a ride, on the loading screen
    // and from the main menu, with the manifest's credit and notice; nothing on screen names it during the ride
    'world-credit': async (page, port) => {
        const onScreen = () => {
            const shown = [...document.body.querySelectorAll('*')].filter((el) => {
                if (el.closest('#world-credits')) return false;
                const text = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('');
                if (!/swisstopo|Copernicus/.test(text)) return false;
                const box = el.getBoundingClientRect();
                return box.width > 0 && box.height > 0 && getComputedStyle(el).visibility !== 'hidden' && Number(getComputedStyle(el).opacity) > 0;
            });
            return shown.map(el => el.id || el.className || el.tagName);
        };
        const readPanel = async (target) => {
            await target.waitForFunction(() => { const p = document.querySelector('#world-credits .world-credits-credit'); return p && p.textContent.length > 0; }, { timeout: 20000 });
            return target.evaluate(() => ({ credit: document.querySelector('#world-credits .world-credits-credit').textContent, notice: document.querySelector('#world-credits .world-credits-notice').textContent }));
        };
        const manifest = await page.evaluate(() => ({ credit: game.environment.data.manifest.credit, notice: game.environment.data.manifest.notice || '' }));
        const riding = await page.evaluate(onScreen);
        await page.evaluate(() => game.pauseRace());
        const pause = await page.evaluate(() => { const p = document.getElementById('world-pause'); const b = p && p.querySelector('[data-credits]'); if (b) b.click(); return { panel: !!p, button: !!b }; });
        const fromPause = pause.button ? await readPanel(page) : null;
        await page.evaluate(() => { WorldCredits.close(); game.resumeRace(); });
        const afterResume = await page.evaluate(() => !!document.getElementById('world-pause'));
        // The loading screen: watch #world-loading from the first moment of a fresh world page
        const loadingPage = await openPage(page.browser(), port, '/?world=tremola', 1, p => p.evaluateOnNewDocument(() => {
            window.__loadingCredit = '';
            new MutationObserver(() => {
                const c = document.querySelector('#world-loading .world-loading-credit');
                if (c && c.textContent) window.__loadingCredit = c.textContent;
            }).observe(document, { childList: true, subtree: true, characterData: true });
        }));
        await loadingPage.waitForFunction('window.game && window.game.environment && window.game.environment.isWorld && window.game.worldRun', { timeout: 120000 });
        const loading = await loadingPage.evaluate(() => window.__loadingCredit);
        await loadingPage.close();
        // The main menu
        const leg = await openPage(page.browser(), port, '/');
        await leg.waitForFunction(() => document.querySelector('.tour-selector-overlay [data-credits]'), { timeout: 60000 });
        const legScreen = await leg.evaluate(onScreen);
        await leg.evaluate(() => document.querySelector('.tour-selector-overlay [data-credits]').click());
        const fromMenu = await readPanel(leg);
        await leg.close();
        return { manifest, riding, pause, fromPause, afterResume, loading, legScreen, fromMenu };
    },
    // Every request the world page made, from load to a few seconds of riding
    'world-net': async page => {
        await page.evaluate(async () => { twistyDev.autopilot({ speed: 20 }); twistyDev.step(180); });
        return { requests: [...new Set(state.requests)].length, list: [...new Set(state.requests)] };
    },
    // The autopilot rides the stage to the finish station, and the window is counted every `--every` metres on the way
    'world-finish': async page => page.evaluate(async (pilotSource, cruise, countSource, every) => {
        const countScene = new Function(`return (${countSource})`)();
        const env = game.environment;
        const v = game.vehicle;
        twistyDev.freeze();
        new Function('game', 'cruise', `return (${pilotSource})(game, cruise)`)(game, cruise);
        const crashes = [];
        const log = console.log;
        console.log = (...args) => { if (/CRASHED/.test(String(args[0]))) crashes.push(String(args[0]) + ' ' + args.slice(1).join(' ')); log(...args); };
        let ticks = 0;
        const rows = [];
        let nextRow = 0;
        let maxLateral = 0;
        const limit = 60 * 60 * 40;
        // The HUD's text, read every second of the ride: no number in it may be "Infinity", "NaN" or "∞"
        const badHud = [];
        const hudText = () => (document.getElementById('hud') || document.body).innerText;
        while (!game.finished && !v.crashed && ticks < limit) {
            twistyDev.step(1);
            ticks++;
            maxLateral = Math.max(maxLateral, Math.abs(v.projection.lateral));
            if (ticks % 60 === 0 && badHud.length < 5) { const t = hudText(); if (/Infinity|NaN|\u221e/.test(t)) badHud.push({ s: Math.round(v.routeS), text: t.replace(/\s+/g, ' ').slice(0, 160) }); }
            // Tile and cover fetches are asynchronous: a ride stepped with no pause would outrun them
            if (ticks % 120 === 0) await new Promise(resolve => setTimeout(resolve, 0));
            if (v.routeS >= nextRow) {
                nextRow += every;
                env.streamer.pump(Infinity);
                rows.push({ s: Math.round(v.routeS), ...countScene(), tiles: env.tileMeshes.size, sections: env.roadMeshes.size, sides: env.sideMeshes.size, trees: env.scenery.treeCount, byKind: { ...env.streamer.stats.maxStepByKind }, maxStepMs: Math.round(env.streamer.stats.maxStepMs * 100) / 100 });
            }
        }
        console.log = log;
        const traffic = game.traffic ? { cars: game.traffic.cars.length, bikes: game.traffic.motorcycles.length } : null;
        // The finish box's distance against the stage's length
        const meta = document.querySelector('#finishBanner .finish-meta');
        const shownM = meta ? Number(meta.textContent.replace(/[^0-9.]/g, '')) : null;
        const stageM = env.stage ? env.stage.length || env.stage.to - env.stage.from : env.route.length;
        return { badHud, shownM, stageM: Math.round(stageM), finished: game.finished, crashed: v.crashed, crash: crashes[0] || null, lowside: v.lowsideTimerMs, speed: Math.round(v.speed * 10) / 10, lateral: Math.round(v.projection.lateral * 10) / 10, maxLateral: Math.round(maxLateral * 10) / 10, ticks, seconds: Math.round(ticks / 60), gates: game.checkpointsPassed, gateTotal: env.checkpoints.length, at: Math.round(v.routeS), length: Math.round(env.route.length), restarts: game.restarts, penaltyMs: game.penaltyMs, traffic, cones: !!game.cones, rockfalls: !!game.rockfalls, rows };
    }, pilotWorld.toString(), Number(option('speed') || 20), countScene.toString(), Number(option('every') || 1000)),
    // A restart is in place: from a key press the bike is put a few metres behind where it was (not on a station),
    // at a standstill, +5 s, and the ride goes on to the next station. A crash opens no dialog: the fall plays, the
    // call-out says the cause and the cost, and the game restarts the rider by itself within Game.WORLD_CRASH.mostS.
    // An excursion that the guide ends costs one penalty, not two.
    'world-restart': async page => page.evaluate(async (pilotSource) => {
        const env = game.environment;
        const v = game.vehicle;
        const route = env.route;
        twistyDev.freeze();
        new Function('game', 'cruise', `return (${pilotSource})(game, cruise)`)(game, 20);
        // (yielding now and then, so the streamer's reads come in: a ride that never yields holds the bike where the
        // land has no data yet, Game.landHeld, for good; on leg 6 it stood in the lane past station 2)
        const yieldEvery = async tick => { if (tick % 120 === 119) await new Promise(resolve => setTimeout(resolve, 0)); };
        const ride = async (until, limit = 60 * 600) => {
            for (let tick = 0; tick < limit && !until() && !v.crashed; tick++) { twistyDev.step(1); await yieldEvery(tick); }
        };
        // (station 2, or the last before one more that is not the finish: leg 3 has one station between its start and
        // its finish, and station 2 there was the finish)
        const k = Math.max(0, Math.min(2, env.stationGates.length - 3));
        await ride(() => game.checkpointsPassed >= k);
        const station = env.stationGates[k];
        await ride(() => v.routeS >= station.s + 300);
        const before = { passed: game.checkpointsPassed, elapsed: game.raceElapsed(), s: v.routeS, penaltyMs: game.penaltyMs, crashed: v.crashed, cause: v.crashed ? v.crashCause || v.crashWhy || null : null, lateral: Math.round(v.projection.lateral * 100) / 100, speed: Math.round(v.speed * 10) / 10 };
        game.restartFromCheckpoint('key');
        const after = { s: v.projection.s, speed: v.speed, restarts: game.restarts, penaltyMs: game.penaltyMs, elapsedJump: game.raceElapsed() - before.elapsed, passed: game.checkpointsPassed, lastS: game.worldRun.lastS };
        // A crash 150 m on: no dialog, the cause in a call-out, and the game puts the bike back by itself
        await ride(() => v.routeS >= before.s + 150);
        const crashAt = { s: v.projection.s, elapsed: game.raceElapsed(), restarts: game.restarts, ticks: twistyDev.ticks };
        v.crashed = true;
        v.crashCause = 'Hit the probe';
        twistyDev.step(1);
        const callout = [...document.querySelectorAll('.hud-top *')].map(el => el.textContent).find(text => /Hit the probe/.test(text)) || null;
        const dialogs = () => ['crashNotification', 'worldConfirm', 'world-pause'].filter(id => document.getElementById(id));
        const during = { dialogs: dialogs(), restarts: game.restarts - crashAt.restarts, crashed: v.crashed };
        for (let tick = 0; tick < 60 * 5 && game.restarts === crashAt.restarts; tick++) { twistyDev.step(1); await yieldEvery(tick); }
        const crash = { callout, during, dialogs: dialogs(), seconds: (twistyDev.ticks - crashAt.ticks) / 60, mostS: Game.WORLD_CRASH.mostS, backM: crashAt.s - v.projection.s, speed: v.speed, crashed: v.crashed,
            restarts: game.restarts - crashAt.restarts, penaltyMs: game.penaltyMs - after.penaltyMs, lateral: v.projection.lateral, half: v.projection.width / 2 };
        await ride(() => game.checkpointsPassed >= k + 1);
        const next = { passed: game.checkpointsPassed, restarts: game.restarts, crashed: v.crashed };
        // The restart-the-ride box holds the race: real animate() frames run no physics and stop the clock, Escape
        // answers CANCEL and the ride goes on, Enter answers YES. twistyDev.step unpauses each frame, so call animate itself.
        const frames = n => {
            const render = game.graphics.render;
            game.graphics.render = () => {};
            try { for (let i = 0; i < n; i++) { game.accumulatedTime = 0; game.animate(); } } finally { game.graphics.render = render; }
        };
        const key = code => document.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
        let proceeded = 0;
        game.confirmWorldLeave(game.worldRestartAsk(), () => { proceeded++; });
        const held0 = { ticks: twistyDev.ticks, s: v.routeS, elapsed: game.raceElapsed() };
        frames(60);
        const confirm = { held: { ticks: twistyDev.ticks - held0.ticks, moved: v.routeS - held0.s, clock: game.raceElapsed() - held0.elapsed, open: !!document.getElementById('worldConfirm') } };
        key('Escape');
        confirm.cancelled = { open: !!document.getElementById('worldConfirm'), paused: game.paused, proceeded };
        const after0 = twistyDev.ticks;
        frames(30);
        confirm.cancelled.ticks = twistyDev.ticks - after0;
        game.confirmWorldLeave(game.worldRestartAsk(), () => { proceeded++; });
        key('Enter');
        confirm.entered = { open: !!document.getElementById('worldConfirm'), paused: game.paused, proceeded };
        // One excursion: 60 m off the road for longer than the guide waits
        // (off every road: 60 m to the side lay on another road in the Schoellenen on leg 3, where the bike is not off
        // the ride's way, so no guide restarted it; the nearest of 60, 90 and 120 m to either side clear of every road)
        const p = route.sample(v.routeS + 40, {});
        const offRoads = q => Math.abs(route.project(q.x, q.z, null, {}).lateral) > 40 && !(env.ground.sideRoadY && env.ground.sideRoadY(q.x, q.z) !== null);
        const at = [60, -60, 90, -90, 120, -120].map(d => ({ x: p.x + d * Math.cos(p.heading), z: p.z - d * Math.sin(p.heading) })).find(offRoads) || { x: p.x + 60 * Math.cos(p.heading), z: p.z - 60 * Math.sin(p.heading) };
        const restarts = game.restarts;
        const base = v.update.bind(v);
        v.update = (...args) => {
            base(...args);
            if (game.restarts === restarts) { v.position.x = at.x; v.position.z = at.z; v.speed = 0; v.crashed = false; v.offRoadTime = 0; }
        };
        for (let tick = 0; tick < 60 * 16 && game.restarts === restarts; tick++) { twistyDev.step(1); await yieldEvery(tick); }
        v.update = base;
        for (let tick = 0; tick < 60 * 12; tick++) { twistyDev.step(1); await yieldEvery(tick); }
        return { station: k, stationS: station.s, backM: env.physics.restartBackM, before, after, crash, next, confirm, excursion: { restarts: game.restarts - restarts, penaltyMs: game.penaltyMs, guideCause: env.guide.cause, pendingCutMs: game.worldRun.pendingCutMs } };
    }, pilotWorld.toString()),
    // The HUD of a world ride (.agent/system/ui.md), in stage 2 of the mini world (--worldData tests/fixtures/world/mini,
    // --world all), at 1024x640, 1440x900 and 390x844 as a touch device. The checkpoints are shown once: a tick on the
    // progress bar for each checkpoint of the stage and the count, and no pips. The stage text shows (the ride has more
    // than one stage). With everything the HUD can show at once on the screen (a split, the wheelie meter, three
    // call-outs, the turn prompt, the advised speed, the key hints, the FPS counter and the empty slots beside the
    // gauge), no two boxes intersect and none leaves the screen.
    'world-hud': async page => {
        // With --out <dir>, a picture of each view as the boxes were read: the page waits on a binding the probe
        // answers with the screenshot
        const out = option('out');
        let view = '';
        if (out) {
            mkdirSync(out, { recursive: true });
            await page.exposeFunction('twistyHudShot', () => page.screenshot({ path: join(out, `world-hud-${view}.png`) }).then(() => true));
        }
        const read = () => page.evaluate(async (placeSource) => {
            const shoot = typeof window.twistyHudShot === 'function' ? window.twistyHudShot : null;
            const placeAt = new Function('game', `return (${placeSource})`)(game);
            const env = game.environment;
            const stage = env.route.stages[1];
            if (!stage) return { error: 'the world has no second stage' };
            await placeAt(stage.from + 300);
            // Put down mid-ride, the stations behind the bike count as passed
            const run = game.worldRun;
            run.stationIndex = env.stationGates.filter(st => st.s <= stage.from + 300).length - 1;
            run.stageIndex = run.stageOf(stage.from + 300);
            const guide = env.guide;
            guide.promptAt = () => 'Continue straight, 150 m · A road with a long name';
            guide.adviceAt = () => ({ mph: 25, fast: true, distance: 60, left: true });
            twistyDev.freeze();
            for (let i = 0; i < 20; i++) twistyDev.step(1);
            const hud = game.hud;
            const gates = run.stageGates(1);
            game.showSplit(0, 61234, 137);
            const wheelie = document.getElementById('wheelieIndicator');
            wheelie.classList.add('active');
            for (const text of ['Jumped a red light +400 style', 'Speed streak +250', 'Rider mode: Sport']) hud.callout(text, 'info', 60000);
            document.getElementById('hudHint').classList.remove('hidden');
            const fpsWas = hud.fpsVisible;
            hud.fpsVisible = true;
            hud.applyFps();
            // The gear and its rev bar at the shift light (js/sound.js Gearbox), and debug mode's tags and button, which
            // stand in the same corners: each must keep clear of the others
            // (a stepped bike: its number is wider than a scooter's D)
            const box = new Gearbox('bike07_mt09');
            box.gear = 4;
            box.revs = 0.9;
            hud.setGear(box);
            hud.setTuned(true);
            hud.setQuality('Graphics: high · auto');
            const tuningWas = !!document.getElementById('tuningOpen');
            if (!tuningWas && typeof TuningPanel !== 'undefined') game.tuningPanel = new TuningPanel(document, Tuning, { world: () => true });
            // The cards fade in and a frozen game has no animation frames: read them as they end up
            await new Promise(r => setTimeout(r, 80));
            document.body.getBoundingClientRect();
            document.getAnimations().forEach(animation => {
                try {
                    if (animation.effect && animation.effect.getTiming().iterations !== Infinity) animation.finish();
                } catch { /* an animation that cannot end stays as it is */ }
            });
            const shown = el => {
                if (!el || !el.isConnected) return false;
                const r = el.getBoundingClientRect();
                if (r.width < 1 || r.height < 1) return false;
                for (let at = el; at && at.nodeType === 1; at = at.parentElement) {
                    const style = getComputedStyle(at);
                    if (style.display === 'none' || style.visibility !== 'visible' || parseFloat(style.opacity) < 0.05) return false;
                }
                return true;
            };
            const parts = { timer: '.hud-timer', split: '#splitPopup', wheelie: '#wheelieIndicator', prompt: '#hudPrompt', advice: '#hudAdvice', map: '#world-guide canvas', speed: '#hudSpeed', gear: '#hudGear', revs: '#hudRevs', mode: '#hudMode', hint: '#hudHint', fps: '#fps', tuned: '#hudTuned', quality: '#hudQuality', tune: '#tuningOpen' };
            const boxes = {};
            const put = (name, el) => { if (shown(el)) { const r = el.getBoundingClientRect(); boxes[name] = { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; } };
            Object.entries(parts).forEach(([name, selector]) => put(name, document.querySelector(selector)));
            document.querySelectorAll('.callout').forEach((el, i) => put(`callout${i + 1}`, el));
            const names = Object.keys(boxes);
            const overlaps = [];
            for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
                const a = boxes[names[i]], b = boxes[names[j]];
                if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) overlaps.push([names[i], names[j]]);
            }
            const off = names.filter(n => boxes[n].left < -0.5 || boxes[n].top < -0.5 || boxes[n].right > innerWidth + 0.5 || boxes[n].bottom > innerHeight + 0.5);
            const out = {
                viewport: [innerWidth, innerHeight], boxes: names, missing: Object.keys(parts).filter(n => !boxes[n]), overlaps, off,
                ticks: document.querySelectorAll('#hudProgressMarks i').length, gateTotal: gates.total, count: document.getElementById('hudProgressCount').textContent,
                pipsShown: shown(document.getElementById('hudGates')), bars: document.querySelectorAll('.hud-progress-bar').length,
                stageText: document.getElementById('hudStageText').textContent, stages: env.route.stages.length, stageIndex: run.stageIndex,
                gear: document.getElementById('hudGear').textContent, revLight: document.getElementById('hudRevs').dataset.light || ''
            };
            if (shoot) await shoot();
            hud.clearTransient();
            hud.setGear(null);
            hud.setTuned(false);
            hud.setQuality('');
            if (!tuningWas && game.tuningPanel) {
                game.tuningPanel.button.remove();
                game.tuningPanel.el.remove();
                game.tuningPanel = null;
            }
            wheelie.classList.remove('active');
            hud.fpsVisible = fpsWas;
            hud.applyFps();
            return out;
        }, placeAt.toString());
        const views = {};
        await page.setViewport({ width: 1024, height: 640 });
        view = 'small';
        views.small = await read();
        await page.setViewport({ width: 1440, height: 900 });
        view = 'large';
        views.large = await read();
        await page.setViewport({ width: 390, height: 844 });
        await page.evaluate(() => document.body.classList.add('touch'));
        view = 'touch';
        views.touch = await read();
        return views;
    },
    // The chase camera on hairpins (P38): the autopilot rides 12 m/s from several starts. Each frame, 4 points of the
    // boom from the head to the camera are tested against the ground, and the road 30 m ahead is projected to the
    // screen. A hairpin frame is a heading change of more than 115 degrees across +-40 m of road.
    'world-camera': async (page) => page.evaluate(async (placeSource, pilotSource) => {
        const placeAt = new Function('game', `return (${placeSource})`)(game);
        const env = game.environment;
        const v = game.vehicle;
        const route = env.route;
        const cam = game.camera;
        twistyDev.freeze();
        new Function('game', 'cruise', `return (${pilotSource})(game, cruise)`)(game, 12);
        const turnAround = s => {
            let total = 0;
            for (let d = -36; d <= 40; d += 4) total += route.headingChange(s + d - 4, s + d);
            return Math.abs(total) * 180 / Math.PI;
        };
        // (60 m before each of the stage's first six hairpin frames' bends, as the frames read them: the starts were the
        // Tremola's, and on another leg none came to a hairpin)
        const starts = [];
        for (let s = (env.startS ?? 0) + 100; s < (env.endS ?? route.length) - 200 && starts.length < 6; s += 4) {
            if (turnAround(s) > 115 && (!starts.length || s - 60 - starts[starts.length - 1] > 200)) starts.push(Math.round(s - 60));
        }
        if (!starts.length) return { none: 'no hairpin on the stage' };
        const runs = [];
        const aim = new THREE.Vector3();
        for (const start of starts) {
            await placeAt(start);
            v.speed = 12;
            let frames = 0, under = 0, hairpin = 0, inView = 0, worst = Infinity, crashed = false;
            for (let tick = 0; tick < 120 + 1380; tick++) {
                twistyDev.step(1);
                if (v.crashed) { crashed = true; break; }
                if (tick < 120) continue;
                frames++;
                const index = Math.floor(route.toUnits(v.routeS));
                const head = { x: v.position.x, y: v.position.y + 1.2, z: v.position.z };
                for (let k = 1; k <= 4; k++) {
                    const x = head.x + (cam.position.x - head.x) * k / 4, y = head.y + (cam.position.y - head.y) * k / 4, z = head.z + (cam.position.z - head.z) * k / 4;
                    const clear = y - game.worldCamera.landY(x, z, index);
                    worst = Math.min(worst, clear);
                    if (clear < 0) { under++; break; }
                }
                if (turnAround(v.projection.s) > 115) {
                    hairpin++;
                    cam.updateMatrixWorld(true);
                    const p = route.sample(v.projection.s + 30, {});
                    aim.set(p.x, p.y, p.z).project(cam);
                    if (Math.abs(aim.x) <= 1 && Math.abs(aim.y) <= 1 && aim.z < 1) inView++;
                }
            }
            runs.push({ start, frames, boomUnderGround: under, worstClearance: Math.round(worst * 100) / 100, hairpinFrames: hairpin, inFrustum: inView, crashed });
        }
        const sum = key => runs.reduce((p, r) => p + r[key], 0);
        return { runs, frames: sum('frames'), boomUnderGround: sum('boomUnderGround'), hairpinFrames: sum('hairpinFrames'), inFrustum: sum('inFrustum'), share: sum('hairpinFrames') ? Math.round(sum('inFrustum') / sum('hairpinFrames') * 1000) / 1000 : null };
    }, placeAt.toString(), pilotWorld.toString()),
    // The bike in view through every hairpin: the chase camera rides the whole ride behind the world pilot, and on
    // every frame the bike (0.9 m over its origin) must project inside the screen with FRUSTUM_MARGIN of it left on
    // each side, in front of the camera. Reports each hairpin's least margin; a hairpin is a turn of 150 degrees or
    // more inside 80 m (tools/world/verify.mjs findHairpins).
    'world-frustum': async (page) => page.evaluate(async (placeSource, pilotSource, hairpinSource, cruise, margin) => {
        const placeAt = new Function('game', `return (${placeSource})`)(game);
        const hairpins = new Function(`return (${hairpinSource})`)()(game.environment.route).filter(s => !game.environment.stage || (s >= game.environment.startS && s <= game.environment.endS));
        const env = game.environment;
        const v = game.vehicle;
        const route = env.route;
        const cam = game.camera;
        twistyDev.freeze();
        game.setCameraView('near');
        const start = Math.max(20, hairpins[0] - 400);
        await placeAt(start);
        game.worldCamera.reset(v.yawAngle);
        new Function('game', 'cruise', `return (${pilotSource})(game, cruise)`)(game, cruise);
        const point = new THREE.Vector3();
        const per = hairpins.map(s => ({ s: Math.round(s), frames: 0, out: 0, least: Infinity }));
        let frames = 0, out = 0, least = Infinity, ticks = 0, worstAt = null;
        // (to the stage's last hairpin and 200 m on, within the stage: a folder of several stages holds the others)
        const end = Math.min(game.environment.stage ? game.environment.endS : route.length - 30, (hairpins.length ? hairpins[hairpins.length - 1] : game.environment.startS) + 200);
        while (v.routeS < end && !v.crashed && !game.finished && ticks < 60 * 60 * 30) {
            twistyDev.step(1);
            ticks++;
            if (ticks % 120 === 0) await new Promise(resolve => setTimeout(resolve, 0));
            if (ticks < 30) continue;
            cam.updateProjectionMatrix();
            cam.updateMatrixWorld(true);
            point.set(v.position.x, v.position.y + 0.9, v.position.z).project(cam);
            const inFront = point.z > -1 && point.z < 1;
            const room = inFront ? 1 - Math.max(Math.abs(point.x), Math.abs(point.y)) : -1;
            frames++;
            if (room < least) { least = room; worstAt = Math.round(v.routeS); }
            if (room < margin) out++;
            const s = v.projection.s ?? v.routeS;
            for (const h of per) {
                if (Math.abs(s - h.s) > 60) continue;
                h.frames++;
                h.least = Math.min(h.least, room);
                if (room < margin) h.out++;
            }
        }
        per.forEach(h => { h.least = Math.round(h.least * 1000) / 1000; });
        return { margin, cruise, start: Math.round(start), end: Math.round(end), reached: Math.round(v.routeS), crashed: v.crashed, frames, out, least: Math.round(least * 1000) / 1000, worstAt, hairpins: per };
    }, placeAt.toString(), pilotWorld.toString(), worldHairpins.toString(), Number(option('speed') || 20), FRUSTUM_MARGIN),
    // The chase camera's smoothness through every hairpin: the world-frustum ride, with the camera's shake held at
    // zero (it is meant to be rough), recording each frame's camera position, look target, boom length over the
    // ground, height over the bike, FOV and view yaw. Reports, over the frames within 60 m of a hairpin, the largest
    // frame-to-frame step and second difference of each. --dump <file> writes every frame. --apex <s> rides only
    // the hairpin nearest s.
    'world-camera-smooth': async (page) => {
        const result = await page.evaluate(async (placeSource, pilotSource, hairpinSource, cruise, onlyApex) => {
            const placeAt = new Function('game', `return (${placeSource})`)(game);
            let hairpins = new Function(`return (${hairpinSource})`)()(game.environment.route).filter(s => !game.environment.stage || (s >= game.environment.startS && s <= game.environment.endS));
            if (onlyApex) hairpins = [hairpins.reduce((a, b) => (Math.abs(b - onlyApex) < Math.abs(a - onlyApex) ? b : a))];
            const v = game.vehicle;
            const route = game.environment.route;
            const cam = game.camera;
            twistyDev.freeze();
            game.setCameraView('near');
            const start = Math.max(20, hairpins[0] - (onlyApex ? 160 : 400));
            await placeAt(start);
            game.worldCamera.reset(v.yawAngle);
            new Function('game', 'cruise', `return (${pilotSource})(game, cruise)`)(game, cruise);
            // The shake is random on purpose: hold it at zero so what is measured is the camera's own motion
            const update = game.updateCamera.bind(game);
            game.updateCamera = (...args) => {
                const random = Math.random;
                Math.random = () => 0.5;
                try { return update(...args); } finally { Math.random = random; }
            };
            const dir = new THREE.Vector3();
            const rows = [];
            let ticks = 0;
            const end = Math.min(route.length - 30, hairpins[hairpins.length - 1] + (onlyApex ? 100 : 200));
            try {
                while (v.routeS < end && !v.crashed && !game.finished && ticks < 60 * 60 * 30) {
                    twistyDev.step(1);
                    ticks++;
                    if (ticks % 120 === 0) await new Promise(resolve => setTimeout(resolve, 0));
                    if (ticks < 30) continue;
                    cam.getWorldDirection(dir);
                    const c = cam.position, l = game.currentLookTarget, b = v.position;
                    const wc = game.worldCamera;
                    rows.push([v.projection.s ?? v.routeS, c.x, c.y, c.z, l.x, l.y, l.z, cam.fov, Math.hypot(c.x - b.x, c.z - b.z), c.y - b.y, Math.atan2(dir.x, dir.z), b.x, b.y, b.z, wc.pull ?? 0, wc.fraction ?? 1, v.speed, Math.asin(Math.max(-1, Math.min(1, dir.y))), wc.keep ?? 0]);
                }
            } finally {
                game.updateCamera = update;
            }
            return { hairpins: hairpins.map(Math.round), crashed: v.crashed, reached: Math.round(v.routeS), end: Math.round(end), rows };
        }, placeAt.toString(), pilotWorld.toString(), worldHairpins.toString(), Number(option('speed') || 20), Number(option('apex') || 0));
        const dump = option('dump');
        if (dump) writeJson(dump, result);
        const { rows, hairpins } = result;
        const near = rows.map(r => hairpins.some(h => Math.abs(r[0] - h) <= 60));
        const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
        // Each signal as [frame -> number[]]; the step and second difference are vector norms (angles wrapped)
        const signals = {
            position: r => [r[1], r[2], r[3]],
            look: r => [r[4], r[5], r[6]],
            distance: r => [r[8]],
            height: r => [r[9]],
            fov: r => [r[7]],
            yaw: r => [r[10]],
            pitch: r => [r[17]]
        };
        const stats = {};
        for (const [name, get] of Object.entries(signals)) {
            let step = 0, jerk = 0, stepAt = null, jerkAt = null;
            for (let i = 2; i < rows.length; i++) {
                if (!near[i] || !near[i - 1] || !near[i - 2]) continue;
                const a = get(rows[i - 2]), b = get(rows[i - 1]), c = get(rows[i]);
                const d1 = b.map((x, k) => (name === 'yaw' ? wrap(c[k] - x) : c[k] - x));
                const d0 = a.map((x, k) => (name === 'yaw' ? wrap(b[k] - x) : b[k] - x));
                const s = Math.hypot(...d1);
                const j = Math.hypot(...d1.map((x, k) => x - d0[k]));
                if (s > step) { step = s; stepAt = Math.round(rows[i][0]); }
                if (j > jerk) { jerk = j; jerkAt = Math.round(rows[i][0]); }
            }
            const round = n => Math.round(n * 10000) / 10000;
            stats[name] = { step: round(step), stepAt, jerk: round(jerk), jerkAt };
        }
        return { hairpins: hairpins.length, frames: rows.length, hairpinFrames: near.filter(Boolean).length, crashed: result.crashed, reached: result.reached, end: result.end, stats };
    },
    // The chase camera's swing over the whole stage: the world pilot rides from the start to the end (--speed, default
    // 20; --from and --to narrow it) in the near and the far chase (--modes), the shake held at zero. Per view: the
    // peaks of the view's yaw rate (rad/s), its yaw acceleration (rad/s^2, over 0.1 s) and the bike's sideways rate
    // across the view (half views a second), the bike's least room in the view, the ten worst places by yaw acceleration
    // with the road's shape there, the same peaks over every chicane (tests/helpers/world-chase-ride.js chicanesOf,
    // from the route alone), and in the tunnels and galleries the least room the eye and the near plane's corners keep
    // under the roof and to the walls (tubeRoom) and the camera's largest second difference of height a frame within
    // 100 m of one. --dump <file> writes every frame.
    'world-camera-chicane': async (page) => {
        const modes = viewsOption('modes', VIEWS);
        const out = { modes: {} };
        const dumps = {};
        for (const mode of modes) {
            const ride = await page.evaluate(async (placeSource, pilotSource, roomSource, mode, cruise, from, to) => {
                const placeAt = new Function('game', `return (${placeSource})`)(game);
                const room = new Function(`return (${roomSource})`)();
                const parts = { RoadMesh, WorldRoute }, near = {}, corner = new THREE.Vector3();
                const env = game.environment;
                const v = game.vehicle;
                const route = env.route;
                const cam = game.camera;
                twistyDev.freeze();
                // (ridden alone, as every world probe's pilot not about the group: openPage. A crash it left stood
                // into the next view's ride)
                game.setCameraView(mode);
                const start = from || Math.max(20, (env.startS ?? 0) + 20);
                const end = to || Math.min(route.length - 30, (env.endS ?? route.length) - 30);
                await placeAt(start);
                game.worldCamera.reset(v.yawAngle);
                new Function('game', 'cruise', `return (${pilotSource})(game, cruise)`)(game, cruise);
                const update = game.updateCamera.bind(game);
                game.updateCamera = (...args) => {
                    const random = Math.random;
                    Math.random = () => 0.5;
                    try { return update(...args); } finally { Math.random = random; }
                };
                const dir = new THREE.Vector3(), bike = new THREE.Vector3();
                const rows = [];
                let ticks = 0;
                try {
                    while (v.routeS < end && !v.crashed && !game.finished && ticks < 60 * 60 * 40) {
                        twistyDev.step(1);
                        ticks++;
                        if (ticks % 120 === 0) await new Promise(resolve => setTimeout(resolve, 0));
                        if (ticks < 30) continue;
                        cam.getWorldDirection(dir);
                        cam.updateMatrixWorld(true);
                        bike.set(v.position.x, v.position.y + 0.9, v.position.z).project(cam);
                        const inView = bike.z > -1 && bike.z < 1 ? 1 - Math.max(Math.abs(bike.x), Math.abs(bike.y)) : -1;
                        // (the least room in a tunnel or gallery of the eye and the near plane's corners)
                        const index = v.projection.index >= 0 ? v.projection.index : Math.floor(route.toUnits(v.routeS));
                        let under = room(parts, route, cam.position.x, cam.position.y, cam.position.z, index, 12, near);
                        for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
                            corner.set(cx, cy, -1).unproject(cam);
                            under = Math.min(under, room(parts, route, corner.x, corner.y, corner.z, index, 12, near));
                        }
                        rows.push([v.projection.s ?? v.routeS, Math.atan2(dir.x, dir.z), bike.x, inView, v.speed, under === Infinity ? null : under, cam.position.y, cam.position.y - v.position.y, Math.hypot(cam.position.x - v.position.x, cam.position.z - v.position.z)]);
                    }
                } finally {
                    game.updateCamera = update;
                }
                return { start: Math.round(start), end: Math.round(end), reached: Math.round(v.routeS), crashed: v.crashed, cause: v.crashed ? v.crashCause || v.crashWhy || null : null, crew: game.traffic ? game.traffic.motorcycles.length : null,
                    // (what stood near the bike as it crashed: a car's or a rock's place along the ride and across it)
                    near: v.crashed ? [...(game.traffic ? game.traffic.cars : []).map(c => ({ kind: 'car', g: c.carGroup })), ...(game.rockfalls && game.rockfalls.rocks ? game.rockfalls.rocks.map(r => ({ kind: 'rock', g: r.mesh })) : [])].filter(o => o.g && Math.hypot(o.g.position.x - v.position.x, o.g.position.z - v.position.z) < 25).map(o => { const p = route.project(o.g.position.x, o.g.position.z, null, {}); return { kind: o.kind, s: Math.round(p.s), lateral: Math.round(p.lateral * 10) / 10 }; }) : null,
                    lateral: Math.round(route.project(v.position.x, v.position.z, null, {}).lateral * 100) / 100, rows };
            }, placeAt.toString(), pilotWorld.toString(), tubeRoom.toString(), mode, Number(option('speed') || 20), Number(option('from') || 0), Number(option('to') || 0));
            // (from 60 m in: the pilot sets off from a stand at the start and the camera settles)
            const rows = swingOf(ride.rows.map(r => ({ s: r[0], yaw: r[1], screen: r[2], room: r[3], speed: r[4], under: r[5] ?? Infinity, ey: r[6], up: r[7], back: r[8] }))).filter(r => r.s >= ride.start + 60);
            // The camera's height over the bike and its distance behind it in plan: the median and the 90th centile
            const centile = (key, q) => { const list = rows.map(r => r[key]).sort((a, b) => a - b); return list.length ? Math.round(list[Math.floor(q * (list.length - 1))] * 100) / 100 : null; };
            // In the tunnels and galleries: the least room of the eye and the near plane, and the camera's largest
            // second difference of height a frame within 100 m of one
            let under = Infinity, underAt = null, bounce = 0, bounceAt = null;
            const tubed = rows.map(r => r.under < Infinity);
            for (let k = 0; k < rows.length; k++) {
                if (rows[k].under < under) { under = rows[k].under; underAt = Math.round(rows[k].s); }
                if (k < 2 || !rows.slice(Math.max(0, k - 400), k + 400).some((r, j) => tubed[Math.max(0, k - 400) + j] && Math.abs(r.s - rows[k].s) < 100)) continue;
                const jump = Math.abs(rows[k].ey - 2 * rows[k - 1].ey + rows[k - 2].ey);
                if (jump > bounce) { bounce = jump; bounceAt = Math.round(rows[k].s); }
            }
            dumps[mode] = ride.rows;
            const worst = worstPlaces(rows, 10);
            // The road's shape at each place, and the chicanes, read off the page's route
            const roads = await page.evaluate((shapeSource, chicaneSource, limits, at, from, to) => {
                const shape = new Function(`return (${shapeSource})`)();
                const chicanes = new Function('CHICANE', 'shapeAt', `return (${chicaneSource})`)(limits, shape);
                const route = game.environment.route;
                return { shapes: at.map(s => shape(route, s)), chicanes: chicanes(route, from, to) };
            }, shapeAt.toString(), chicanesOf.toString(), CHICANE, worst.map(p => p.accelAt), ride.start + 60, ride.end - 40);
            const round = n => Math.round(n * 100) / 100;
            const peaks = peaksOf(rows);
            out.modes[mode] = {
                start: ride.start, end: ride.end, reached: ride.reached, crashed: ride.crashed, cause: ride.cause, crew: ride.crew, near: ride.near, lateral: ride.lateral, frames: rows.length,
                rate: round(peaks.rate), accel: round(peaks.accel), sway: round(peaks.sway), room: round(peaks.room),
                tube: { under: under === Infinity ? null : round(under), underAt, bounce: Math.round(bounce * 10000) / 10000, bounceAt },
                boom: { up: centile('up', 0.5), up90: centile('up', 0.9), back: centile('back', 0.5), back90: centile('back', 0.9) },
                places: worst.map((p, k) => ({ s: Math.round(p.accelAt), rate: round(p.rate), accel: round(p.accel), sway: round(p.sway), ...roads.shapes[k] })),
                chicanes: roads.chicanes.map(c => {
                    const at = peaksOf(rows, [c.s], 40);
                    return { s: c.s, left: c.left, right: c.right, radius: c.radius, rate: round(at.rate), accel: round(at.accel), sway: round(at.sway), room: round(at.room) };
                })
            };
        }
        const dump = option('dump');
        if (dump) writeJson(dump, dumps);
        return out;
    },
    // A GPU frame sequence through one hairpin: the world pilot rides in from 140 m before the apex nearest --apex
    // (default the first; --at <s> rides to that place of the ride instead), then `--count` pictures (default 8), one
    // every `--every` frames (default 4), from --from metres before the apex (default 20), in the chase view --mode
    // (near, the default, or far). The shake is held at zero. Needs --out <dir>; --tag names the files.
    'world-camera-frames': async (page) => {
        const out = option('out');
        if (!out) return { error: 'name a folder with --out <dir>' };
        mkdirSync(out, { recursive: true });
        const tag = option('tag') || 'frame';
        const count = Number(option('count') || 8), every = Number(option('every') || 4), from = Number(option('from') || 20);
        const apex = await page.evaluate(async (placeSource, pilotSource, hairpinSource, onlyApex, from, at, mode) => {
            const placeAt = new Function('game', `return (${placeSource})`)(game);
            const hairpins = new Function(`return (${hairpinSource})`)()(game.environment.route).filter(s => !game.environment.stage || (s >= game.environment.startS && s <= game.environment.endS));
            const apex = at || (onlyApex ? hairpins.reduce((a, b) => (Math.abs(b - onlyApex) < Math.abs(a - onlyApex) ? b : a)) : hairpins[0]);
            const v = game.vehicle;
            game.setCameraView(mode);
            await placeAt(apex - 140);
            game.worldCamera.reset(v.yawAngle);
            new Function('game', 'cruise', `return (${pilotSource})(game, cruise)`)(game, 20);
            const update = game.updateCamera.bind(game);
            game.updateCamera = (...args) => {
                const random = Math.random;
                Math.random = () => 0.5;
                try { return update(...args); } finally { Math.random = random; }
            };
            let ticks = 0;
            while (v.routeS < apex - from && !v.crashed && ticks < 3600) { twistyDev.step(1); ticks++; }
            game.environment.streamer.pump(Infinity);
            return Math.round(apex);
        }, placeAt.toString(), pilotWorld.toString(), worldHairpins.toString(), Number(option('apex') || 0), from, Number(option('at') || 0), viewsOption('mode', ['near'])[0]);
        const files = [];
        for (let k = 0; k < count; k++) {
            const at = await page.evaluate((every) => {
                if (every > 1) twistyDev.step(every - 1);
                twistyDev.step(1, { render: true });
                const c = game.camera.position, l = game.currentLookTarget;
                return { s: Math.round(game.vehicle.routeS * 10) / 10, camera: [c.x, c.y, c.z].map(n => Math.round(n * 100) / 100), look: [l.x, l.y, l.z].map(n => Math.round(n * 100) / 100) };
            }, every);
            const file = join(out, `${tag}-${String(k + 1).padStart(2, '0')}.png`);
            await page.screenshot({ path: file });
            files.push({ file, ...at });
        }
        return { apex, files };
    },
    // The hairpin assist (WorldAssist) on every hairpin of the ride, at each level, with a simple scripted rider
    // (not the pilot): the pilot rides the 40 m up to the bend at the bend's advised speed; from max(3, 0.4 v) m
    // before the bend to 10 m after it the rider steers full into the bend while the curvature that far ahead is
    // over 1/30 m and lets go once it is not, and throttles to the advised speed (braking only when 15% over it).
    // Per level: crashes, run-wides (past the outside edge by 0.5 m) and cuts (past the inside edge by 0.5 m)
    // from the hand-over to 20 m past the bend.
    // --apex <s> rides only the hairpin nearest s and returns a trace of every 6th tick of each level.
    'world-hairpin-assist': async (page) => page.evaluate(async (placeSource, hairpinSource, traceApex) => {
        const placeAt = new Function('game', `return (${placeSource})`)(game);
        const hairpins = new Function(`return (${hairpinSource})`)()(game.environment.route).filter(s => !game.environment.stage || (s >= game.environment.startS && s <= game.environment.endS));
        const env = game.environment;
        const route = env.route;
        const physics = env.physics;
        const v = game.vehicle;
        const input = game.input;
        const tight = 1 / 30;
        // The widest hairpin (its tightest radius, m) the riders on full lock ride
        const lockRadius = 20;
        const k = s => route.curvatureAt(s, 4);
        twistyDev.freeze();
        game.worldLinger = false;
        const bends = hairpins.map(apex => {
            let from = apex, to = apex;
            while (from > apex - 120 && Math.abs(k(from - 2)) > tight) from -= 2;
            while (to < apex + 120 && Math.abs(k(to + 2)) > tight) to += 2;
            const advice = WorldAssist.advice(route, physics, from, 4);
            let radius = Infinity;
            for (let s = from; s <= to; s += 2) radius = Math.min(radius, 1 / Math.max(1e-6, Math.abs(k(s))));
            return { apex: Math.round(apex), from, to, advised: advice ? advice.speed : 8, radius };
        }).filter((bend, i, all) => !traceApex || Math.abs(bend.apex - traceApex) === Math.min(...all.map(b => Math.abs(b.apex - traceApex))));
        let rider = { target: 8, from: 0, to: 0 };
        // The approach and the road after the hairpin are the pilot's, so a bend before it cannot spoil the test
        twistyDev.autopilot({ speed: 15 });
        const pilot = { steer: input.getSteeringInput, throttle: input.getThrottleInput, brake: input.getBrakeInput };
        const lead = () => Math.max(3, 0.4 * v.speed);
        const riding = () => {
            const s = v.projection.s ?? v.routeS;
            return s >= rider.from - lead() && s <= rider.to + 10;
        };
        input.getSteeringInput = () => {
            if (!riding()) return pilot.steer();
            if (rider.aim) {
                // The aiming rider: full lock toward a point on the centreline 5 m on, straight once it lines up
                const at = route.sample((v.projection.s ?? v.routeS) + 5, {});
                const off = Math.atan2(at.x - v.position.x, at.z - v.position.z) - v.yawAngle;
                const bearing = Math.atan2(Math.sin(off), Math.cos(off));
                return Math.abs(bearing) > 0.05 ? Math.sign(bearing) : 0;
            }
            const ahead = k((v.projection.s ?? v.routeS) + lead());
            return Math.abs(ahead) > tight ? Math.sign(ahead) : 0;
        };
        // The pilot slows for whatever the approach holds; the rider takes the bend at its advised speed
        input.getThrottleInput = () => (riding() ? (v.speed < rider.target ? 1 : 0) : Math.min(pilot.throttle(), v.speed < rider.target ? 1 : 0));
        input.getBrakeInput = () => (riding() ? (v.speed > rider.target * 1.15 ? 1 : 0) : pilot.brake());
        input.getWheelieInput = () => 0;
        const levels = {};
        // The three levels at the advised speed, then the slow riders at about 4 m/s: one holds full lock while the
        // bend is under the bike, the other aims full lock at the road 5 m on and straightens once lined up
        const runs = [['off', 'off', 0], ['low', 'low', 0], ['normal', 'normal', 0], ['slow-off', 'off', 4], ['slow-normal', 'normal', 4],
            ['aim-off', 'off', 4, true], ['aim-normal', 'normal', 4, true]];
        for (const [name, level, slow, aim] of runs) {
            const rows = [];
            for (const bend of bends) {
                // (the riders on full lock only on a hairpin as tight as full lock: through a wider one, 21 m round at
                // leg 6's s 3 648, full lock turns the bike on an 8 m circle onto the grass inside, as no rider rides it;
                // the aiming riders ride every hairpin)
                if (!aim && bend.radius > lockRadius) continue;
                v.reset();
                v.assistLevel = level;
                await placeAt(bend.from - 40);
                v.resetHairpinAssist();
                rider = { target: slow || bend.advised, from: bend.from, to: bend.to, aim: !!aim };
                v.speed = rider.target;
                const sign = Math.sign(k(bend.apex));
                const row = { apex: bend.apex, crashed: false, wide: 0, cut: 0, step: 0, trace: traceApex ? [] : undefined };
                let lastAssist = null;
                for (let tick = 0; tick < 60 * 40 && !v.crashed; tick++) {
                    twistyDev.step(1);
                    const p = v.projection;
                    if (p.s > bend.to + 20) break;
                    if (p.s < bend.from - lead()) continue;
                    // The assist's share of the lean rate this frame (rad/s), and its largest frame-to-frame step
                    const assistRate = Number.isFinite(v.assistLeanRate) ? v.assistLeanRate : 0;
                    if (lastAssist !== null) row.step = Math.max(row.step, Math.abs(assistRate - lastAssist));
                    lastAssist = assistRate;
                    const outside = -p.lateral * sign - p.width / 2;
                    const inside = p.lateral * sign - p.width / 2;
                    row.wide = Math.max(row.wide, outside);
                    row.cut = Math.max(row.cut, inside);
                    if (row.trace && tick % 6 === 0) row.trace.push([Math.round(p.s - bend.from), input.getSteeringInput(), Math.round(-p.lateral * sign * 100) / 100, Math.round(-v.leanAngle * sign * 573) / 10, Math.round(v.speed * 10) / 10, v.lineCaptured ? 1 : 0, Math.round(1 / Math.abs(WorldAssist.curvature(route, physics, p.s)))].join(' '));
                    if (tick % 240 === 0) await new Promise(resolve => setTimeout(resolve, 0));
                }
                row.crashed = v.crashed;
                // Where and how it went down: metres from the bend's start, the lean, the speed, the crash's cause
                if (v.crashed) row.at = { ds: Math.round((v.projection.s - bend.from) * 10) / 10, lean: Math.round(v.leanAngle * 573) / 10, speed: Math.round(v.speed * 10) / 10, lateral: Math.round(v.projection.lateral * 100) / 100, cause: v.crashCause || v.crashWhy || null, radius: Math.round((bend.to - bend.from)), advised: Math.round(bend.advised * 10) / 10 };
                row.wide = Math.round(row.wide * 100) / 100;
                row.cut = Math.round(row.cut * 100) / 100;
                row.step = Math.round(row.step * 1000) / 1000;
                rows.push(row);
            }
            levels[name] = {
                hairpins: rows.length,
                crashes: rows.filter(r => r.crashed).length,
                runWide: rows.filter(r => r.wide > 0.5).length,
                cut: rows.filter(r => r.cut > 0.5).length,
                maxAssistStep: rows.reduce((m, r) => Math.max(m, r.step), 0),
                bad: rows.filter(r => r.crashed || r.wide > 0.5 || r.cut > 0.5 || r.trace)
            };
        }
        return { bends: bends.length, levels };
    }, placeAt.toString(), worldHairpins.toString(), Number(option('apex') || 0)),
    // Every model file (assets/**/*.glb, globbed here) through the page's own SceneAssets.loadModel: each mesh part
    // must carry a unit normal at every vertex, colours the shader reads as linear, and sane material values
    'world-models': async page => page.evaluate(async files => {
        const rows = [];
        for (const file of files) {
            const row = { file, meshes: 0, parts: 0, noNormals: 0, badNormals: 0, colour: new Set(), srgbConverted: 0, metalness: [Infinity, -Infinity], roughness: [Infinity, -Infinity], error: null };
            try {
                const model = await SceneAssets.loadModel(file);
                for (const parts of model.meshes.values()) {
                    row.meshes++;
                    for (const { geometry, material } of parts) {
                        row.parts++;
                        const normal = geometry.attributes.normal;
                        if (!normal) { row.noNormals++; continue; }
                        for (let i = 0; i < normal.count; i++) {
                            const length = Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i));
                            if (!(Math.abs(length - 1) <= 0.02)) row.badNormals++;
                        }
                        const color = geometry.attributes.color;
                        row.colour.add(color ? `${color.array.constructor.name}x${color.itemSize}` : 'none');
                        if (geometry.userData.srgb) row.srgbConverted++;
                        row.metalness = [Math.min(row.metalness[0], material.metalness), Math.max(row.metalness[1], material.metalness)];
                        row.roughness = [Math.min(row.roughness[0], material.roughness), Math.max(row.roughness[1], material.roughness)];
                    }
                }
            } catch (error) {
                row.error = String(error.message || error);
            }
            row.colour = [...row.colour].join(',');
            rows.push(row);
        }
        return { rows };
    }, modelFiles()),
    // GPU pictures of the first three hairpins as the rider sees them: ridden into from 80 m before the apex behind
    // the world pilot, one picture as the bike turns in and one at the apex. Needs --out <dir>.
    'world-hairpin-shots': async (page) => {
        const out = option('out');
        if (!out) return { error: 'name a folder with --out <dir>' };
        mkdirSync(out, { recursive: true });
        const tag = option('tag') || 'shot';
        const apexes = await page.evaluate(hairpinSource => new Function(`return (${hairpinSource})`)()(game.environment.route).filter(s => !game.environment.stage || (s >= game.environment.startS && s <= game.environment.endS)).slice(0, 3).map(Math.round), worldHairpins.toString());
        const files = [];
        for (let k = 0; k < apexes.length; k++) {
            const rooms = await page.evaluate(async (placeSource, pilotSource, apex) => {
                const placeAt = new Function('game', `return (${placeSource})`)(game);
                const v = game.vehicle;
                game.setCameraView('near');
                await placeAt(apex - 140);
                game.worldCamera.reset(v.yawAngle);
                new Function('game', 'cruise', `return (${pilotSource})(game, cruise)`)(game, 20);
                let ticks = 0;
                while (v.routeS < apex - 25 && !v.crashed && ticks < 3600) { twistyDev.step(1); ticks++; }
                game.environment.streamer.pump(Infinity);
                twistyDev.step(1, { render: true });
                return { s: Math.round(v.routeS), crashed: v.crashed };
            }, placeAt.toString(), pilotWorld.toString(), apexes[k]);
            const turnIn = join(out, `${tag}-hairpin-${k + 1}-turn-in.png`);
            await page.screenshot({ path: turnIn });
            const apexRoom = await page.evaluate(async (apex) => {
                const v = game.vehicle;
                let ticks = 0;
                while (v.routeS < apex && !v.crashed && ticks < 3600) { twistyDev.step(1); ticks++; }
                game.environment.streamer.pump(Infinity);
                twistyDev.step(1, { render: true });
                return { s: Math.round(v.routeS), crashed: v.crashed };
            }, apexes[k]);
            const atApex = join(out, `${tag}-hairpin-${k + 1}-apex.png`);
            await page.screenshot({ path: atApex });
            files.push({ apex: apexes[k], turnIn: { file: turnIn, ...rooms }, atApex: { file: atApex, ...apexRoom } });
        }
        // The start, with the village round it
        const startView = await page.evaluate(async (placeSource) => {
            const placeAt = new Function('game', `return (${placeSource})`)(game);
            game.setCameraView('near');
            await placeAt(10);
            game.worldCamera.reset(game.vehicle.yawAngle);
            game.vehicle.speed = 0;
            twistyDev.autopilot({ speed: 0 });
            // The chase camera eases in from wherever the last picture left it, a kilometre back: long enough to arrive
            for (let i = 0; i < 300; i++) twistyDev.step(1);
            game.environment.streamer.pump(Infinity);
            twistyDev.step(1, { render: true });
            const v = game.vehicle.position, c = game.camera.position, l = game.currentLookTarget;
            return { camera: [c.x - v.x, c.y - v.y, c.z - v.z].map(n => Math.round(n * 10) / 10), look: [l.x - v.x, l.y - v.y, l.z - v.z].map(n => Math.round(n * 10) / 10), pull: game.worldCamera.pull, fraction: game.worldCamera.fraction, speed: game.vehicle.speed, s: game.vehicle.routeS };
        }, placeAt.toString());
        files.push({ startView });
        const startFile = join(out, `${tag}-start.png`);
        await page.screenshot({ path: startFile });
        files.push({ start: startFile });
        return { files };
    },
    // Every drawn building against the road bands: each instance's model box, by its matrix, as an oriented
    // rectangle on the ground, against the ride's band (route.project) and every side edge in residence (the
    // ground's side segments). Rides the window along the ride every --every metres. None may stand on a band.
    'world-buildings': async (page) => page.evaluate(async (placeSource, every) => {
        const placeAt = new Function('game', `return (${placeSource})`)(game);
        const env = game.environment;
        const route = env.route;
        const ground = env.ground;
        const matrix = new THREE.Matrix4();
        const corner = new THREE.Vector3();
        const sample = {};
        const seen = new Set();
        const hits = [];
        let checked = 0, least = Infinity;
        // Distance from (x, z) past the edge of the nearest road band: negative over a band
        const pastBand = (x, z) => {
            let best = Infinity;
            for (let s = 0; s < route.length; s += 2) {
                route.sample(s, sample);
                const d = Math.hypot(sample.x - x, sample.z - z);
                if (d < 60) best = Math.min(best, d - sample.width / 2);
                else s += Math.max(0, d - 62);
            }
            for (const g of ground.sideSegments) {
                const dx = g.x1 - g.x0, dz = g.z1 - g.z0, run = dx * dx + dz * dz;
                const t = run === 0 ? 0 : Math.max(0, Math.min(1, ((x - g.x0) * dx + (z - g.z0) * dz) / run));
                best = Math.min(best, Math.hypot(g.x0 + dx * t - x, g.z0 + dz * t - z) - (g.w0 + (g.w1 - g.w0) * t) / 2);
            }
            return best;
        };
        for (let s = 20; s < route.length; s += every) {
            await placeAt(s);
            env.streamer.pump(Infinity);
            game.scene.traverse(o => {
                if (!o.isInstancedMesh || !o.name.startsWith('houses:')) return;
                o.geometry.computeBoundingBox();
                const box = o.geometry.boundingBox;
                for (let i = 0; i < o.count; i++) {
                    o.getMatrixAt(i, matrix);
                    const key = matrix.elements.map(e => e.toFixed(2)).join(',');
                    if (seen.has(key)) continue;
                    seen.add(key);
                    checked++;
                    // The footprint's edges, every metre
                    let worst = Infinity;
                    const c = [[box.min.x, box.min.z], [box.max.x, box.min.z], [box.max.x, box.max.z], [box.min.x, box.max.z]].map(([x, z]) => corner.set(x, 0, z).applyMatrix4(matrix).clone());
                    for (let e = 0; e < 4; e++) {
                        const a = c[e], b = c[(e + 1) % 4];
                        const n = Math.max(1, Math.ceil(a.distanceTo(b)));
                        for (let k = 0; k <= n; k++) worst = Math.min(worst, pastBand(a.x + (b.x - a.x) * k / n, a.z + (b.z - a.z) * k / n));
                    }
                    least = Math.min(least, worst);
                    if (worst < 0) hits.push({ name: o.name, x: Math.round(c[0].x), z: Math.round(c[0].z), pastBandM: Math.round(worst * 100) / 100 });
                }
            });
        }
        return { checked, least: Math.round(least * 100) / 100, hits: hits.slice(0, 20), onBand: hits.length };
    }, placeAt.toString(), Number(option('every') || 600)),
    // A cut across stacked road: the bike is put on a leg of the ladder far ahead in s but close in space. It restarts
    // after cutConfirmMs, once. A flicker of a few frames and back restarts nothing.
    'world-cut': async page => page.evaluate(async (placeSource, pilotSource) => {
        const placeAt = new Function('game', `return (${placeSource})`)(game);
        const env = game.environment;
        const v = game.vehicle;
        const route = env.route;
        const physics = env.physics;
        const pts = route.points;
        let pair = null;
        // (within the stage: a world folder holds several legs, and past the stage's end the ride is not this leg's)
        const first = Math.max(100, route.indexAt((env.startS ?? 0) + 100)), last = Math.min(pts.length - 200, route.indexAt((env.endS ?? route.length) - 200));
        for (let i = first; i < last && !pair; i++) {
            for (let j = i + 36; j < Math.min(last + 150, pts.length - 1, i + 80); j++) {
                const gap = Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z);
                if (gap >= 14 && gap <= 28) { pair = { i, j, gap, ds: route.sArray[j] - route.sArray[i] }; break; }
            }
        }
        // (a leg with no stacked legs has no cut to make: nothing to check there)
        if (!pair) return { none: 'no stacked pair of legs on the stage' };
        twistyDev.freeze();
        new Function('game', 'cruise', `return (${pilotSource})(game, cruise)`)(game, 12);
        const lower = route.sArray[pair.i];
        await placeAt(lower - 60);
        v.speed = 12;
        for (let tick = 0; tick < 300 && v.projection.s < lower; tick++) twistyDev.step(1);
        const control = { restarts: game.restarts, crashed: v.crashed };
        const jumpTo = (k) => {
            const p = pts[k];
            v.position.set(p.x, p.y, p.z);
            v.yawAngle = p.heading;
        };
        const frames = (n, until) => {
            let tick = 0;
            for (; tick < n && !until(); tick++) twistyDev.step(1);
            return tick;
        };
        // A flicker: 5 frames on the upper leg, then back where the bike was
        const back = { x: v.position.x, y: v.position.y, z: v.position.z, yaw: v.yawAngle };
        const restartsBeforeFlicker = game.restarts;
        jumpTo(pair.j);
        frames(5, () => false);
        v.position.set(back.x, back.y, back.z);
        v.yawAngle = back.yaw;
        frames(60, () => false);
        const flicker = { restarts: game.restarts - restartsBeforeFlicker, pendingCutMs: game.worldRun.pendingCutMs };
        // The cut: it stays there
        const restartsBeforeCut = game.restarts;
        const penaltyBefore = game.penaltyMs;
        jumpTo(pair.j);
        const frame = frames(120, () => game.restarts > restartsBeforeCut);
        const cut = { frames: frame, ms: Math.round(frame * 1000 / 60), restarts: game.restarts - restartsBeforeCut, penaltyMs: game.penaltyMs - penaltyBefore, backAtS: Math.round(v.projection.s), lowerS: Math.round(lower) };
        return { pair, cutConfirmMs: physics.cutConfirmMs, maxBankM: physics.maxBankM, control, flicker, cut };
    }, placeAt.toString(), pilotWorld.toString()),
    // GPU screenshots to --out: two hairpins, a junction, and the minimap and HUD in each
    'world-shots': async (page) => {
        const out = option('out');
        if (!out) return { error: 'name a folder with --out <dir>' };
        mkdirSync(out, { recursive: true });
        const sites = await page.evaluate(async () => {
            const env = game.environment;
            const route = env.route;
            // The tightest bends, one per 1.5 km at most
            const bends = [];
            const a = {}, b = {};
            for (let s = 100; s < route.length - 100; s += 4) {
                route.sample(s, a); route.sample(s + 12, b);
                let turn = b.heading - a.heading;
                turn = Math.atan2(Math.sin(turn), Math.cos(turn));
                bends.push({ s, turn: Math.abs(turn) });
            }
            bends.sort((p, q) => q.turn - p.turn);
            const picked = [];
            for (const bend of bends) if (picked.every(other => Math.abs(other.s - bend.s) > 1500) && picked.length < 2) picked.push(bend);
            const junction = env.graph.junctions.find(j => j.passes.some(p => p.inEdge !== null));
            const pass = junction ? junction.passes.find(p => p.inEdge !== null) : null;
            return { hairpins: picked.map(p => Math.round(p.s - 30)), junction: pass ? { s: Math.round(pass.sIn - 25), name: junction.name || String(junction.id) } : null };
        });
        const files = [];
        const shoot = async (name, s, mode) => {
            await page.evaluate(async (placeSource, at, cameraMode) => {
                const placeAt = new Function('game', `return (${placeSource})`)(game);
                game.setCameraView(cameraMode);
                await placeAt(at);
                game.worldCamera.reset(game.vehicle.yawAngle);
                game.vehicle.speed = 9;
                game.currentCameraPos.copy(game.camera.position);
                twistyDev.autopilot({ speed: 9 });
                for (let i = 0; i < 40; i++) twistyDev.step(1, { render: i > 36 });
                game.environment.streamer.pump(Infinity);
                twistyDev.step(2, { render: true });
            }, placeAt.toString(), s, mode);
            const file = join(out, `${name}.png`);
            await page.screenshot({ path: file });
            files.push(file);
        };
        for (let k = 0; k < sites.hairpins.length; k++) await shoot(`hairpin-${k + 1}`, sites.hairpins[k], 'near');
        await shoot('hairpin-far-chase', sites.hairpins[0], 'far');
        if (sites.junction) await shoot('junction', sites.junction.s, 'near');
        const hud = await page.evaluate(() => ({
            guide: !!document.getElementById('world-guide'),
            guideBox: (() => { const b = document.getElementById('world-guide').getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; })(),
            progress: document.getElementById('hudProgress') ? document.getElementById('hudProgress').textContent.trim() : null,
            renderer: game.graphics.renderer.getContext().getParameter(game.graphics.renderer.getContext().getExtension('WEBGL_debug_renderer_info') ? game.graphics.renderer.getContext().getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL : 0x1F01)
        }));
        return { sites, files, hud };
    }
};

// world-clearance: nothing drawn stands in a road. The slice is walked every --every metres (default 300); at each
// place the drawn road bands round the bike (the ride within half a step either side, and every side road drawn) are
// cast down on across their full drawn width, every CLEAR_STEP_M along and across, from HEADROOM_M over the surface to
// just under it, against every scenery mesh: trees, boulders, houses, landmarks, marker stones and the gate
// frames, instanced or not. Where a mesh's box reaches into a cell, the cell is cast on again every CLEAR_FINE_M, so a
// pole or a board a few centimetres thick is not missed between rays. A ray is cast only inside the drawn width: the
// cells at a road's edge reach half a step past it, and what stands on the verge there (a checkpoint's boards, 0.16 m
// off the carriageway) is not over the road. A hit is a failure, except a roadworks site's works in its own closed lane
// (js/world/roadworks.js: the open lane beside it must stay clear); a station banner spans the ride above HEADROOM_M,
// so no ray reaches it. --out <dir> saves a view of the worst offenders.
//   node tools/terrain-check.mjs world-clearance --world tremola --gpu [--every 300] [--out <dir> --tag T --shots N]
const CLEAR_HEADROOM_M = 4.5;
const CLEAR_STEP_M = 0.5;
const CLEAR_FINE_M = 0.04;
WORLD_PROBES.push('world-clearance');

async function clearanceWalk(placeSource, every, headroom, step, fine) {
    const placeAt = new Function('game', `return (${placeSource})`)(game);
    const env = game.environment;
    const route = env.route;
    const raycaster = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);
    const origin = new THREE.Vector3();
    const probe = new THREE.Mesh();
    const matrix = new THREE.Matrix4();
    const box = new THREE.Box3();
    const typeOf = (o) => {
        const n = o.name || '';
        if (n.startsWith('trees:')) return 'tree';
        if (n === 'boulders') return 'boulder';
        if (n.startsWith('houses:')) return 'house';
        if (n.startsWith('landmark:')) return 'landmark';
        // The tufts are one mesh for a whole tile, too slow to cast on from every cell: tests/unit/world-clearance.test.js
        // measures each tuft's own footprint
        if (n === 'stones') return 'stone';
        if (n === 'world-gates') return 'gate';
        // The roadworks at the checkpoints: their works stand in the closed lane, and nowhere else on a road
        if (n.startsWith('roadworks:')) return 'roadworks';
        return null;
    };
    // Whether a ride cell at (s, lat) lies in a roadworks site's closed half, between its first and last beacon
    const closedLane = (s, lat) => {
        for (const site of (env.roadworks && env.roadworks.closed) || []) if (s >= site.sa - 1 && s <= site.sd + 1 && lat * site.side >= 0) return true;
        return false;
    };
    const hits = new Map();
    const seenSide = new Set();
    let rays = 0, instancesSeen = 0, places = 0;
    for (let s0 = Math.min(every / 2, route.length / 2); s0 < route.length; s0 += every) {
        await placeAt(s0);
        env.streamer.pump(Infinity);
        places++;
        env.group.updateMatrixWorld(true);
        // Every drawn instance as a bounding sphere in a 16 m plan hash, so a ray tests only what is over it
        const things = [];
        const hash = new Map();
        env.group.traverse((o) => {
            if (!o.isMesh) return;
            for (let n = o; n; n = n.parent) if (!n.visible) return;
            const type = typeOf(o);
            if (!type) return;
            if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
            // The gate frames and the checkpoint boards are each one mesh over the whole stage: a box round each gate instead of the mesh's own
            if (type === 'gate') {
                for (const st of env.stationGates || []) {
                    const p = route.sample(st.s, {});
                    const r = p.width / 2 + 3;
                    const thing = { mesh: o, type, index: 0, world: o.matrixWorld.clone(), x: p.x, z: p.z, x0: p.x - r, x1: p.x + r, z0: p.z - r, z1: p.z + r, y0: p.y - 1, y1: p.y + 7 };
                    const ref = things.length;
                    things.push(thing);
                    for (let cx = Math.floor(thing.x0 / 16); cx <= Math.floor(thing.x1 / 16); cx++) {
                        for (let cz = Math.floor(thing.z0 / 16); cz <= Math.floor(thing.z1 / 16); cz++) {
                            const key = cx * 65536 + cz;
                            if (!hash.has(key)) hash.set(key, []);
                            hash.get(key).push(ref);
                        }
                    }
                }
                return;
            }
            const count = o.isInstancedMesh ? o.count : 1;
            for (let i = 0; i < count; i++) {
                const world = new THREE.Matrix4();
                if (o.isInstancedMesh) { o.getMatrixAt(i, matrix); world.multiplyMatrices(o.matrixWorld, matrix); } else world.copy(o.matrixWorld);
                box.copy(o.geometry.boundingBox).applyMatrix4(world);
                const thing = { mesh: o, type, index: i, world, x: (box.min.x + box.max.x) / 2, z: (box.min.z + box.max.z) / 2, x0: box.min.x, x1: box.max.x, z0: box.min.z, z1: box.max.z, y0: box.min.y, y1: box.max.y };
                const ref = things.length;
                things.push(thing);
                for (let cx = Math.floor(thing.x0 / 16); cx <= Math.floor(thing.x1 / 16); cx++) {
                    for (let cz = Math.floor(thing.z0 / 16); cz <= Math.floor(thing.z1 / 16); cz++) {
                        const key = cx * 65536 + cz;
                        if (!hash.has(key)) hash.set(key, []);
                        hash.get(key).push(ref);
                    }
                }
            }
        });
        instancesSeen += things.length;
        // The road cell `step` square round (x, z), at road surface y: every thing whose box reaches into the cell and
        // into the headroom over it is cast on, downward from `headroom` over the surface to just under it, every `fine`
        const cast = (x, z, y, road) => {
            rays++;
            const list = hash.get(Math.floor(x / 16) * 65536 + Math.floor(z / 16));
            if (!list) return;
            const h = step / 2;
            for (const ref of list) {
                const t = things[ref];
                if (t.x1 < x - h || t.x0 > x + h || t.z1 < z - h || t.z0 > z + h || t.y0 > y + headroom || t.y1 < y - 0.3) continue;
                if (t.type === 'roadworks' && road.edgeId === null && closedLane(road.s, road.lat)) continue;
                probe.geometry = t.mesh.geometry;
                probe.material = t.mesh.material;
                probe.matrixWorld.copy(t.world);
                const found = [];
                for (let fx = Math.max(x - h, t.x0); fx <= Math.min(x + h, t.x1) && !found.length; fx += fine) {
                    for (let fz = Math.max(z - h, t.z0); fz <= Math.min(z + h, t.z1) && !found.length; fz += fine) {
                        if (Math.abs(road.lat + (fx - x) * road.ax + (fz - z) * road.az) > road.half) continue;
                        origin.set(fx, y + headroom, fz);
                        raycaster.set(origin, down);
                        raycaster.far = headroom + 0.3;
                        probe.raycast(raycaster, found);
                        rays++;
                    }
                }
                if (!found.length) continue;
                const over = headroom - found[0].distance;
                const key = `${t.type}:${t.mesh.name}:${t.index}:${Math.round(t.x)},${Math.round(t.z)}`;
                const held = hits.get(key);
                const row = { type: t.type, name: t.mesh.name, x: Math.round(t.x * 10) / 10, z: Math.round(t.z * 10) / 10, road: road.edgeId === null ? 'ride' : 'side', edgeId: road.edgeId, s: road.s === null ? null : Math.round(road.s), overRoadM: Math.round(over * 100) / 100, hits: 1 };
                if (held) held.hits++;
                else hits.set(key, row);
            }
        };
        // The ride: half a step either side of the place, every `step` along and across its drawn width
        const sample = {};
        for (let s = Math.max(0, s0 - every / 2); s < Math.min(route.length, s0 + every / 2); s += step) {
            route.sample(s, sample);
            const half = sample.width / 2;
            for (let o = -half; o <= half + 1e-9; o += step) cast(sample.x + o * Math.cos(sample.heading), sample.z - o * Math.sin(sample.heading), sample.y, { edgeId: null, s, lat: o, half, ax: Math.cos(sample.heading), az: -Math.sin(sample.heading) });
        }
        // The side roads drawn from here (their chunk's ribbons are built), each once
        for (const edge of env.data.edges) {
            if (edge.onRide || seenSide.has(edge.id) || !env.sideMeshes.has(env.data.chunkOf(edge.first))) continue;
            const e = env.graph.samples(edge.id);
            if (!e) continue;
            seenSide.add(edge.id);
            for (let i = 0; i + 1 < e.x.length; i++) {
                const len = Math.hypot(e.x[i + 1] - e.x[i], e.z[i + 1] - e.z[i]) || 1;
                const fx = (e.x[i + 1] - e.x[i]) / len, fz = (e.z[i + 1] - e.z[i]) / len;
                for (let a = 0; a < len; a += step) {
                    const t = a / len;
                    const x = e.x[i] + (e.x[i + 1] - e.x[i]) * t, z = e.z[i] + (e.z[i + 1] - e.z[i]) * t, y = e.y[i] + (e.y[i + 1] - e.y[i]) * t;
                    const half = (e.width[i] + (e.width[i + 1] - e.width[i]) * t) / 2;
                    for (let o = -half; o <= half + 1e-9; o += step) cast(x + o * fz, z - o * fx, y, { edgeId: edge.id, s: null, lat: o, half, ax: fz, az: -fx });
                }
            }
        }
    }
    const rows = [...hits.values()].sort((p, q) => q.hits - p.hits);
    const byType = {};
    for (const r of rows) byType[r.type] = (byType[r.type] || 0) + 1;
    return { places, rays, instancesSeen, headroomM: headroom, stepM: step, offenders: rows.length, byType, hits: rows.slice(0, 60) };
}

// world-near-ground: how much the near land changes between effect specs, by distance from the camera. At each station
// of --at the view rides there as world-effect-shots does (--camera N, default 2 the chase view), then for each spec of
// --specs the frame is drawn and read, and one more pass draws the camera's distance to the land (and nothing for
// anything else in front of it). For each band of distance (2-5, 5-15, 15-30, 30-60 m) it gives the land's share of the
// frame, its mean luma, its fine contrast (the mean absolute difference of a pixel from the mean of its 3 x 3, at full
// resolution: a smear scores near 0) and, against the first spec, the mean absolute change of luma (0 to 255)
WORLD_PROBES.push('world-near-ground');
WORLD['world-near-ground'] = async (page) => {
    const specs = (option('specs') || 'default;off').split(';');
    const stations = option('at') ? option('at').split(',').map(Number) : [1600];
    const camera = viewsOption('camera', ['near'])[0];
    await page.addStyleTag({ content: 'body * { visibility: hidden !important; } body > canvas { visibility: visible !important; }' });
    const rows = [];
    for (const s of stations) {
        const at = await page.evaluate(async (placeSource, pilotSource, s, camera) => {
            const placeAt = new Function('game', `return (${placeSource})`)(game);
            const v = game.vehicle;
            game.setCameraView(camera);
            await placeAt(Math.max(10, s - 140));
            game.worldCamera.reset(v.yawAngle);
            new Function('game', 'cruise', `return (${pilotSource})(game, cruise)`)(game, 18);
            let ticks = 0;
            while (v.routeS < s && !v.crashed && ticks < 3600) { twistyDev.step(1); ticks++; }
            game.environment.streamer.pump(Infinity);
            return { s: Math.round(v.routeS), crashed: v.crashed, speed: v.speed, speedRatio: game.graphics.speedRatio };
        }, placeAt.toString(), pilotWorld.toString(), s, camera);
        // The land's distance under each pixel: land tiles draw their view distance, all else draws -1
        const mask = await page.evaluate(() => {
            const g = game.graphics, r = g.renderer;
            const size = r.getDrawingBufferSize(new THREE.Vector2());
            const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.FloatType });
            const vertex = '#include <common>\nvarying vec3 vView;\nvoid main() {\n#include <begin_vertex>\n#include <project_vertex>\nvView = mvPosition.xyz;\n}';
            const make = land => new THREE.ShaderMaterial({ side: THREE.DoubleSide, vertexShader: vertex, fragmentShader: `varying vec3 vView;\nvoid main() { gl_FragColor = vec4(${land ? 'length(vView)' : '-1.0'}, 0.0, 0.0, 1.0); }` });
            const landMat = make(true), other = make(false);
            const swapped = [], hidden = [];
            game.scene.traverse(o => {
                if ((o.isPoints || o.isLine || o.isSprite) && o.visible) { hidden.push(o); o.visible = false; return; }
                if (!o.isMesh) return;
                if (o.isSkinnedMesh) return;
                swapped.push([o, o.material]);
                o.material = o.material === TerrainMesh.sharedMaterial ? landMat : other;
            });
            const background = game.scene.background, fog = game.scene.fog;
            game.scene.background = null; game.scene.fog = null;
            r.setRenderTarget(target);
            r.setClearColor(0x000000, 1);
            r.clear();
            r.render(game.scene, game.camera);
            r.setRenderTarget(null);
            game.scene.background = background; game.scene.fog = fog;
            swapped.forEach(([o, m]) => { o.material = m; });
            hidden.forEach(o => { o.visible = true; });
            const data = new Float32Array(size.x * size.y * 4);
            r.readRenderTargetPixels(target, 0, 0, size.x, size.y, data);
            target.dispose();
            const out = new Array(size.x * size.y);
            // Flip to the screen's rows
            for (let y = 0; y < size.y; y++) for (let x = 0; x < size.x; x++) out[(size.y - 1 - y) * size.x + x] = Math.round(data[(y * size.x + x) * 4] * 100) / 100;
            window.__ngMask = { w: size.x, h: size.y, d: out };
            return { w: size.x, h: size.y };
        });
        let first = null;
        for (const spec of specs) {
            const set = await page.evaluate(effectsSpec, spec);
            if (set.error) return { error: `${spec}: ${set.error}` };
            await page.evaluate(() => { game.graphics.render(game.scene, game.camera); game.graphics.render(game.scene, game.camera); });
            const png = await page.screenshot({ encoding: 'base64' });
            const result = await page.evaluate(async (data, keep) => {
                const image = new Image();
                image.src = `data:image/png;base64,${data}`;
                await image.decode();
                const { w, h, d: dist } = window.__ngMask;
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(image, 0, 0, w, h);
                const px = ctx.getImageData(0, 0, w, h).data;
                const luma = new Float32Array(w * h);
                for (let i = 0; i < w * h; i++) luma[i] = 0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2];
                const bands = [[2, 5], [5, 15], [15, 30], [30, 60]];
                const stats = bands.map(([a, b]) => ({ band: `${a}-${b}`, n: 0, luma: 0, fine: 0, change: 0 }));
                const before = window.__ngFirst;
                for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
                    const i = y * w + x, m = dist[i];
                    if (!(m >= 2 && m < 60)) continue;
                    const k = m < 5 ? 0 : m < 15 ? 1 : m < 30 ? 2 : 3;
                    let sum = 0;
                    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sum += luma[i + dy * w + dx];
                    const st = stats[k];
                    st.n++; st.luma += luma[i]; st.fine += Math.abs(luma[i] - sum / 9);
                    if (before) st.change += Math.abs(luma[i] - before[i]);
                }
                if (keep) window.__ngFirst = luma;
                return stats.map(st => ({ band: st.band, share: Math.round(st.n / (w * h) * 1000) / 1000, luma: st.n ? Math.round(st.luma / st.n * 10) / 10 : null, fine: st.n ? Math.round(st.fine / st.n * 100) / 100 : null, change: st.n && before ? Math.round(st.change / st.n * 100) / 100 : null }));
            }, png, first === null);
            if (first === null) first = spec;
            const out = option('out');
            if (out) { mkdirSync(out, { recursive: true }); writeFileSync(join(out, `ng-s${s}-c${camera}-${spec.replace(/[^a-z0-9=,]+/gi, '').replace(/[=,]/g, '-')}.png`), Buffer.from(png, 'base64')); }
            // With the ground cover on: its instances, and the time to make every chunk round the camera again from nothing
            const cover = await page.evaluate(() => {
                if (typeof GroundCover === 'undefined' || !GroundCover.scatter) return null;
                GroundCover.scatter.chunks.clear();
                const t0 = performance.now();
                GroundCover.frame(game);
                const ms = performance.now() - t0, s = GroundCover.scatter;
                return { tufts: s.tufts.count, stones: s.stones.count, chunks: s.chunks.size, buildMs: Math.round(ms), perChunkMs: Math.round(ms / s.chunks.size * 10) / 10 };
            });
            // --ride-cost: the ground cover's share of each frame over 10 s ridden at 30 m/s from here (then put back)
            if (cover && flag('ride-cost')) cover.ride = await page.evaluate(() => {
                const v = game.vehicle, from = v.routeS, frame = GroundCover.frame, times = [];
                GroundCover.frame = g => { const t = performance.now(); frame.call(GroundCover, g); times.push(performance.now() - t); };
                twistyDev.autopilot({ speed: 30 });
                for (let i = 0; i < 600 && !v.crashed; i++) twistyDev.step(1);
                GroundCover.frame = frame;
                times.sort((a, b) => a - b);
                const at = q => Math.round(times[Math.floor(q * (times.length - 1))] * 100) / 100;
                return { metres: Math.round(v.routeS - from), frames: times.length, medianMs: at(0.5), p95Ms: at(0.95), worstMs: at(1) };
            });
            rows.push({ s, camera, spec, ...at, cover, stats: result });
        }
        await page.evaluate(() => { delete window.__ngFirst; delete window.__ngMask; });
    }
    return { rows };
};

// world-cover-off: the ground cover effect off draws the frame the game drew before it, to the bit. At each station
// of --at (default 1600) the view rides there; the default effects are put in force with groundCover turned on and off
// again (so its textures and scatter were made and dropped), the frame is read, then the land's program is compiled
// again without the ground cover's code at all (GroundCover.bare) and the frame read again: the two must be the same
WORLD_PROBES.push('world-cover-off');
WORLD['world-cover-off'] = async (page) => {
    const stations = option('at') ? option('at').split(',').map(Number) : [1600];
    await page.addStyleTag({ content: 'body * { visibility: hidden !important; } body > canvas { visibility: visible !important; }' });
    const failures = [], rows = [];
    for (const s of stations) {
        await page.evaluate(async (placeSource, pilotSource, s) => {
            const placeAt = new Function('game', `return (${placeSource})`)(game);
            const v = game.vehicle;
            game.setCameraView('near');
            await placeAt(Math.max(10, s - 140));
            game.worldCamera.reset(v.yawAngle);
            new Function('game', 'cruise', `return (${pilotSource})(game, cruise)`)(game, 18);
            let ticks = 0;
            while (v.routeS < s && !v.crashed && ticks < 3600) { twistyDev.step(1); ticks++; }
            game.environment.streamer.pump(Infinity);
        }, placeAt.toString(), pilotWorld.toString(), s);
        const shot = async (bare) => {
            const inScene = await page.evaluate((bare) => {
                GroundCover.bare = bare;
                TerrainMesh.sharedMaterial.needsUpdate = true;
                game.graphics.render(game.scene, game.camera);
                game.graphics.render(game.scene, game.camera);
                let found = false;
                game.scene.traverse(o => { if (o.name === 'ground-cover') found = true; });
                return found;
            }, bare);
            return { png: await page.screenshot({ encoding: 'base64' }), inScene };
        };
        let set = await page.evaluate(effectsSpec, 'ao=low,landDetail,shadows,reflections,grade,streaks,edgeBlur,groundCover');
        if (set.error) return { error: set.error };
        await page.evaluate(() => { game.graphics.render(game.scene, game.camera); });
        set = await page.evaluate(effectsSpec, 'default');
        const off = await shot(false);
        const bare = await shot(true);
        await page.evaluate(() => { GroundCover.bare = false; TerrainMesh.sharedMaterial.needsUpdate = true; });
        const diff = await page.evaluate(async (a, b) => {
            const read = async data => {
                const image = new Image();
                image.src = `data:image/png;base64,${data}`;
                await image.decode();
                const canvas = document.createElement('canvas');
                canvas.width = image.width; canvas.height = image.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(image, 0, 0);
                return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            };
            const p = await read(a), q = await read(b);
            let differ = 0, most = 0;
            for (let i = 0; i < p.length; i++) if (p[i] !== q[i]) { differ++; most = Math.max(most, Math.abs(p[i] - q[i])); }
            return { bytes: p.length, differ, most };
        }, off.png, bare.png);
        rows.push({ s, inForce: set.inForce.groundCover, scatterInScene: off.inScene, ...diff });
        if (diff.differ) failures.push(`s ${s}: ${diff.differ} bytes differ (most ${diff.most}) between the ground cover off and the land without it`);
        if (off.inScene) failures.push(`s ${s}: the ground cover's scatter is in the scene with the effect off`);
    }
    return { rows, failures };
};

// world-toggle-ride: rides from the start to --to (default 7600) in the chase view --camera (default far), and
// every --every frames (default 240; 0 never) switches --toggle (default landDetail) on or off the way the settings
// dialog does (EffectSettings.set, then Game.applyGraphicsSettings), the ladder held at its top so Auto caps nothing.
// Every --check frames (default 20) it draws the frame and checks that every land tile within 300 m of the bike is in
// the scene, visible, drawn with the land's material and a compiled program, and that the bike's own tile is resident.
// --levels steps the graphics level at each switch too. Every fifth check the bike's tile is built again and compared
// with what is drawn. Fails on the first frames that break it (up to 20 are kept), on a program that did not compile,
// and on any error the game throws.
// --drop-after S: from ride distance S on, the server answers no request for a tile's heights or cover, as a page whose
// server has stopped; the tile checks are then off, and the land's own rule is checked instead (Game.watchLand,
// WorldStreamer.landState). With --restore-ms N the server answers again N ms of ride time after the land near the bike
// is first missing: the land must come back, the bike ride on to --to, and no note be left up. Without it the data
// never comes back: the ride must end with the error card up and RideMode.LAND_LOST_NOTE on it (Game.showLoadError). Either way the bike must not
// move up or down by more than half a metre while it is held
WORLD_PROBES.push('world-toggle-ride');
WORLD['world-toggle-ride'] = async (page) => {
    const result = await page.evaluate(async (placeSource, to, every, check, id, camera, levels, skip, dropAfter, restoreMs) => {
    const placeAt = new Function('game', `return (${placeSource})`)(game);
    const env = game.environment, v = game.vehicle, r = game.renderer;
    game.quality.fix(Quality.LEVELS.length - 1);
    game.setCameraView(camera);
    await placeAt(10);
    game.worldCamera.reset(v.yawAngle);
    twistyDev.autopilot({ speed: 22 });
    // --drop-after S: from ride distance S on, the server answers no request for a tile's heights or cover (as a page
    // whose server has stopped)
    const drop = { restored: false, missingAt: null, refused: 0, noteFrames: 0, heldFrames: 0, heldMoveM: 0, ended: false };
    if (dropAfter) {
        const fetchFn = env.data.fetchFn;
        env.data.fetchFn = url => {
            if (v.routeS > dropAfter && !drop.restored && /\/(height|cover)\//.test(url)) {
                drop.refused++;
                return Promise.reject(new TypeError('Failed to fetch'));
            }
            return fetchFn(url);
        };
    }
    let heldY = null;
    const failures = [], seen = { byLod: {}, toggles: 0, checks: 0, frames: 0, errors: 0 };
    const m = WorldData.TILE_M;
    let on = game.effectLevels && game.effectLevels[id] === 'on', skippedAt = -1e9;
    for (let frame = 0; frame < 60 * 60 * 12 && v.routeS < to; frame++) {
        try {
            twistyDev.step(1);
        } catch (error) {
            seen.errors++;
            if (failures.length < 20) failures.push(`s ${Math.round(v.routeS)}: step threw ${error.message}`);
        }
        seen.frames++;
        if (game.environment !== env) { drop.ended = true; break; }
        if (v.crashed) { v.crashed = false; }
        if (dropAfter) {
            const land = game.landState || {};
            if (land.missing && drop.missingAt === null) { drop.missingAt = frame; drop.missingS = Math.round(v.routeS); }
            if (restoreMs && drop.missingAt !== null && !drop.restored && (frame - drop.missingAt) * 1000 / 60 >= restoreMs) { drop.restored = true; drop.restoredS = Math.round(v.routeS); }
            if (game.landNote && game.landNote.isConnected && !game.landNote.classList.contains('leaving')) drop.noteFrames++;
            if (game.landHeld) {
                drop.heldFrames++;
                if (heldY === null) heldY = v.position.y;
                drop.heldMoveM = Math.max(drop.heldMoveM, Math.abs(v.position.y - heldY));
            } else heldY = null;
        }
        // --skip N: every N frames the bike goes on to before the next station (Game.debugSkipToNextGate, N in debug)
        if (skip && frame % skip === skip - 1 && game.debugSkipToNextGate()) { seen.skips = (seen.skips || 0) + 1; skippedAt = frame; }
        if (every && frame % every === every - 1) {
            on = !on;
            game.effects.set(id, on ? 'on' : 'off');
            game.applyGraphicsSettings();
            // --levels: the ladder steps to the next level as well, as Auto does when the frame time moves
            if (levels) game.quality.fix(seen.toggles % Quality.LEVELS.length);
            seen.toggles++;
        }
        if (frame % check) continue;
        // The page's own tasks run between checks, as they do between a game's frames: a tile's data arrives by fetch
        await new Promise(done => setTimeout(done, 0));
        if (game.environment !== env) { drop.ended = true; break; }
        if (dropAfter) continue;
        game.graphics.render(game.scene, game.camera);
        seen.checks++;
        const bx = v.position.x, bz = v.position.z;
        const own = `${Math.floor(bx / m)},${Math.floor(bz / m)}`;
        const bad = [];
        for (const program of r.info.programs || []) if (program.diagnostics && !program.diagnostics.runnable) bad.push(`program ${program.name} ${program.cacheKey.slice(0, 40)} failed: ${(program.diagnostics.fragmentShader.log || program.diagnostics.vertexShader.log || program.diagnostics.programLog || '').slice(0, 300)}`);
        if (!env.tileMeshes.has(own) && frame - skippedAt > 300) {
            const st = env.streamer;
            bad.push(`own tile ${own} not resident (data ${env.hasTileData(own)}, loaded ${!!env.data.tile(own)}, held ${st.refs.has(own)}, built ${JSON.stringify(st.tiles.get(own) || null)}, loading ${st.loading.has(`t${own}`)}, queue ${st.queue.length})`);
        }
        for (const [key, held] of env.tileMeshes) {
            const [tx, tz] = key.split(',').map(Number);
            const dx = Math.max(tx * m - bx, 0, bx - (tx + 1) * m), dz = Math.max(tz * m - bz, 0, bz - (tz + 1) * m);
            if (Math.hypot(dx, dz) > 300) continue;
            const mesh = held.mesh;
            const lod = mesh.userData.lod;
            seen.byLod[lod] = (seen.byLod[lod] || 0) + 1;
            let shown = mesh.visible;
            for (let o = mesh.parent; o; o = o.parent) shown = shown && o.visible;
            if (lod !== 0 && frame - skippedAt > 300) bad.push(`${key} at lod ${lod}`);
            if (mesh.parent !== env.tileGroup) bad.push(`${key} lod ${lod} not in the tile group`);
            if (!shown) bad.push(`${key} lod ${lod} hidden`);
            if (mesh.material !== TerrainMesh.sharedMaterial) bad.push(`${key} lod ${lod} other material`);
            const props = r.properties.get(mesh.material);
            if (!props.currentProgram) bad.push(`${key} lod ${lod} no program`);
            else if (props.currentProgram.diagnostics && !props.currentProgram.diagnostics.runnable) bad.push(`${key} lod ${lod} program not runnable`);
            const pos = mesh.geometry.attributes.position;
            if (!pos || !pos.count || !mesh.geometry.index || !mesh.geometry.index.count) bad.push(`${key} lod ${lod} empty geometry`);
        }
        // Every fifth check the bike's tile is built again from nothing (its cuts too) and compared with what is drawn:
        // land drawn from a stale cut or plan stands apart from it
        if (seen.checks % 5 === 0 && env.tileMeshes.has(own)) {
            const held = env.tileMeshes.get(own), tile = env.data.tile(own), lod = held.mesh.userData.lod;
            const kept = env.cutCache.has(own), was = env.cutCache.get(own);
            env.cutCache.delete(own);
            const cuts = lod === 0 ? env.cutsOf(own) : null;
            if (kept) env.cutCache.set(own, was); else env.cutCache.delete(own);
            const fresh = TerrainMesh.build(tile, env.data.cover(own), lod, (x, y, z) => {
                const low = env.rideSurfaceAt(x, z, y);
                return low === null ? y : Math.min(y, low - TerrainMesh.SINK_M);
            }, env.nearTile, cuts);
            const a = held.mesh.geometry.attributes.position.array, b = fresh.mesh.geometry.attributes.position.array;
            let worst = 0, at = -1;
            const n = Math.min(a.length, b.length);
            for (let i = 1; i < n; i += 3) { const d = Math.abs(a[i] - b[i]); if (d > worst) { worst = d; at = i; } }
            seen.rebuilt = (seen.rebuilt || 0) + 1;
            if (a.length !== b.length || worst > 0.05) bad.push(`${own} drawn apart from a fresh build: ${a.length} vs ${b.length} floats, ${worst.toFixed(2)} m at (${a[at - 1] && a[at - 1].toFixed(0)}, ${a[at + 1] && a[at + 1].toFixed(0)})`);
            fresh.mesh.geometry.dispose();
        }
        if (bad.length && failures.length < 20) failures.push(`s ${Math.round(v.routeS)} (${id} ${game.effectLevels[id]}): ${bad.slice(0, 6).join('; ')}`);
    }
    // (the world is torn down a task after the loss is found)
    for (let k = 0; k < 5 && game.environment === env; k++) await new Promise(done => setTimeout(done, 0));
    if (game.environment !== env) drop.ended = true;
    if (dropAfter) {
        const card = document.getElementById('loadError');
        const notice = !!card && card.textContent.includes(RideMode.LAND_LOST_NOTE);
        const noteUp = !!(game.landNote && game.landNote.isConnected && !game.landNote.classList.contains('leaving'));
        Object.assign(drop, { notice, noteUp });
        if (drop.missingAt === null) failures.push('the land near the bike was never missing: nothing was proved');
        if (drop.heldMoveM > 0.5) failures.push(`the held bike moved ${drop.heldMoveM.toFixed(2)} m up or down`);
        if (restoreMs) {
            if (drop.ended) failures.push('the ride ended although the data came back');
            if (noteUp) failures.push('the note is still up after the land came back');
            if (game.landState && (game.landState.missing || game.landState.under)) failures.push('land near the bike is still missing at the end');
            if (v.routeS < to) failures.push(`the bike stopped at s ${Math.round(v.routeS)}, short of ${to}`);
            if (!drop.noteFrames) failures.push('the note never showed while the land was missing');
        } else {
            if (!drop.ended) failures.push(`the ride did not end with the data gone (at s ${Math.round(v.routeS)})`);
            if (!notice) failures.push('the error card did not open with the note that the land stopped loading');
        }
    } else game.graphics.render(game.scene, game.camera);
    return { s: Math.round(v.routeS), ...seen, inForce: game.effectLevels ? game.effectLevels[id] : null, drop: dropAfter ? drop : undefined, failures };
    }, placeAt.toString(), Number(option('to') || 7600), Number(option('every') ?? 240), Number(option('check') || 20), option('toggle') || 'landDetail', viewsOption('camera', ['far'])[0], flag('levels'), Number(option('skip') || 0), Number(option('drop-after') || 0), Number(option('restore-ms') || 0));
    // --out <dir>: the last frame
    if (option('out')) {
        mkdirSync(option('out'), { recursive: true });
        await page.addStyleTag({ content: 'body * { visibility: hidden !important; } body > canvas { visibility: visible !important; }' });
        await page.screenshot({ path: join(option('out'), `toggle-ride-s${result.s}.png`) });
    }
    return result;
};

// world-marmots: the marmot colonies of the ride (js/world/marmots.js). The bike is put down every --every m (default
// 400) so the land round the whole ride arrives, the colonies are gathered, and each animal is checked against the
// rule as drawn: on the land (the drawn ground under it within 0.3 m), RULE.rideMinM to RULE.rideMaxM past every road
// band, and not in water. Lists the colonies by ride distance. --out <dir> saves, for the first colonies, the chase view
// with the bike stopped RIDE m before it and a view from 25, 60 and 120 m with the camera on the colony
WORLD_PROBES.push('world-marmots');
WORLD['world-marmots'] = async (page) => {
    const result = await page.evaluate(async (placeSource, every) => {
        const placeAt = new Function('game', `return (${placeSource})`)(game);
        const env = game.environment, marmots = env.marmots;
        if (!marmots) return { error: 'no marmots in this world' };
        for (let k = 0; k < 200 && !marmots.meshes; k++) await new Promise(done => setTimeout(done, 50));
        for (let s = 10; s < env.route.length; s += every) {
            await placeAt(s);
            const p = env.route.sample(s, {});
            marmots.gather({ x: p.x, z: p.z, s });
        }
        const R = MarmotRule.RULE, failures = [], colonies = [];
        const roads = env.scenery.roads;
        for (const list of marmots.colonies.values()) {
            for (const c of list) {
                const loc = env.ground.locate(c.x, c.z, null, {});
                colonies.push({ id: c.id, s: Math.round(env.route.sArray[loc.index]), past: Math.round(c.past), animals: c.animals.length, y: Math.round(c.animals[0].y) });
                for (const a of c.animals) {
                    const past = roads.clearance(a.x, a.z, R.rideMaxM + 2);
                    if (past < R.rideMinM - 0.01) failures.push(`marmot ${a.id} ${past.toFixed(1)} m past a road band`);
                    if (env.ground.tileZone(a.x, a.z) === WorldData.ZONE.water) failures.push(`marmot ${a.id} in water`);
                    const drawn = env.ground.tileHeight(a.x, a.z);
                    if (drawn !== null && Math.abs(drawn - a.y) > 0.3) failures.push(`marmot ${a.id} ${(a.y - drawn).toFixed(2)} m off the ground`);
                }
            }
        }
        colonies.sort((p, q) => p.s - q.s);
        return { colonies, animals: colonies.reduce((n, c) => n + c.animals, 0), failures, loaded: !!marmots.meshes };
    }, placeAt.toString(), Number(option('every') || 400));
    // --watch: the bike stands still beside each colony (on the ride, --near m from its first animal: default 40) for 10 s
    // of the game's own frames; how far each animal moved and the modes it went through. A colony must not stand still
    if (flag('watch')) result.watch = await page.evaluate(async (placeSource, nearM) => {
        const placeAt = new Function('game', `return (${placeSource})`)(game);
        const env = game.environment, marmots = env.marmots, v = game.vehicle, out = [];
        for (const colony of [...marmots.colonies.values()].flat()) {
            const a0 = colony.animals[0], loc = env.ground.locate(a0.x, a0.z, null, {});
            // Back along the ride until the bike stands nearM from the first animal
            let s = env.route.sArray[loc.index];
            for (let k = 0; k < 400; k++) { const p = env.route.sample(s, {}); if (Math.hypot(p.x - a0.x, p.z - a0.z) >= nearM) break; s -= 1; }
            await placeAt(s);
            twistyDev.autopilot({ speed: 0 });
            const start = colony.animals.map(a => { const l = marmots.animals.get(a.id); return { x: l.x, z: l.z }; });
            const travelled = colony.animals.map(() => 0), modes = colony.animals.map(() => new Set());
            const last = start.map(p => ({ ...p }));
            for (let f = 0; f < 600; f++) {
                twistyDev.step(1);
                colony.animals.forEach((a, k) => {
                    const l = marmots.animals.get(a.id);
                    travelled[k] += Math.hypot(l.x - last[k].x, l.z - last[k].z);
                    last[k].x = l.x; last[k].z = l.z;
                    modes[k].add(l.alert ? 'alert' : l.mode);
                });
                if (f % 60 === 0) await new Promise(done => setTimeout(done, 0));
            }
            const bikeM = Math.round(Math.hypot(v.position.x - a0.x, v.position.z - a0.z));
            out.push({ id: colony.id, bikeM, travelled: travelled.map(t => Math.round(t * 10) / 10), modes: modes.map(m => [...m].join('/')) });
        }
        return out;
    }, placeAt.toString(), Number(option('near') || 40));
    if (result.watch) for (const w of result.watch) if (!w.travelled.some(t => t > 1)) result.failures.push(`colony ${w.id} stood still for 10 s with the bike ${w.bikeM} m off`);
    // --ride: the game's own frames ride the summit from --from at --speed in the chase view; how many marmots are drawn
    // and the nearest drawn one to the camera, every half second, and a picture where one is nearest (--out)
    if (flag('ride')) result.ride = await page.evaluate(async (placeSource, from, cruise) => {
        const placeAt = new Function('game', `return (${placeSource})`)(game);
        const env = game.environment, marmots = env.marmots, v = game.vehicle;
        await placeAt(from);
        game.setCameraView('near');
        game.worldCamera.reset(v.yawAngle);
        twistyDev.autopilot({ speed: cruise });
        const rows = [], shots = [];
        let best = null;
        for (let frame = 0; frame < 60 * 120 && v.routeS < env.route.length - 50; frame++) {
            twistyDev.step(1, { render: frame % 30 === 0 });
            if (frame % 30) continue;
            const cam = game.camera.position;
            let drawn = 0, near = Infinity;
            for (const life of marmots.animals.values()) {
                if (life.mode === 'gone') continue;
                const d = Math.hypot(life.x - cam.x, life.z - cam.z);
                if (d <= Marmots.LIFE.drawM) { drawn++; near = Math.min(near, d); }
            }
            rows.push({ s: Math.round(v.routeS), drawn, near: Math.round(near), counts: marmots.meshes ? marmots.meshes.map(m => m.count) : null, gone: [...marmots.animals.values()].filter(l => l.mode === 'gone').length });
            // (read in the same task as the draw: the canvas keeps no frame once it is shown)
            if (drawn && near < 70) shots.push({ near: Math.round(near), s: Math.round(v.routeS), png: game.graphics.renderer.domElement.toDataURL('image/png').split(',')[1] });
            if (drawn && (!best || near < best.near)) best = { near, s: Math.round(v.routeS) };
            await new Promise(done => setTimeout(done, 0));
        }
        shots.sort((p, q) => p.near - q.near);
        shots.splice(6);
        return { rows, best, shots };
    }, placeAt.toString(), Number(option('from') || 11800), Number(option('speed') || 15));
    if (result.ride && option('out')) {
        mkdirSync(option('out'), { recursive: true });
        for (const shot of result.ride.shots) writeFileSync(join(option('out'), `marmots-ride-s${shot.s}-${shot.near}m.png`), Buffer.from(shot.png, 'base64'));
    }
    if (result.ride) result.ride.shots = result.ride.shots.map(shot => ({ s: shot.s, near: shot.near }));
    // --crossing: the ride is given its one crossing and ridden through the colonies by the autopilot from --from
    // (default 11000) at --speed (default 20 m/s): the crossing must start where the rule allows, and the animal must be
    // off the road when the bike passes its place
    if (flag('crossing')) result.crossing = await page.evaluate(async (placeSource, from, cruise) => {
        const placeAt = new Function('game', `return (${placeSource})`)(game);
        const env = game.environment, marmots = env.marmots, v = game.vehicle;
        await placeAt(from);
        game.worldCamera.reset(v.yawAngle);
        marmots.crossingLeft = 1;
        marmots.anyColony = true;
        twistyDev.autopilot({ speed: cruise });
        let onRoadAtPass = null, frames = 0;
        for (; frames < 60 * 240 && v.routeS < env.route.length - 50; frames++) {
            twistyDev.step(1);
            const c = marmots.lastCrossing;
            if (c && onRoadAtPass === null && v.routeS >= c.s) {
                const life = c.life, loc = env.ground.locate(life.x, life.z, { start: c.index - 3, end: c.index + 3 }, {});
                onRoadAtPass = Math.abs(loc.lateral) < loc.width / 2 + RoadSurface.VERGE_M;
            }
            if (c && onRoadAtPass !== null) break;
            if (frames % 30 === 0) await new Promise(done => setTimeout(done, 0));
        }
        const c = marmots.lastCrossing;
        return c ? { s: Math.round(c.s), startAhead: Math.round(c.startAhead), startSpeed: Math.round(c.startSpeed * 10) / 10, onRoadAtPass, seen: MarmotRule.seenFrom(env.route, c.s) } : { none: true, reached: Math.round(v.routeS) };
    }, placeAt.toString(), Number(option('from') || 11000), Number(option('speed') || 20));
    // (none at all is right for a bike too fast for the sight line: the rule gives no crossing it cannot clear in time)
    if (result.crossing && ((result.crossing.none && Number(option('speed') || 20) <= 15) || result.crossing.onRoadAtPass || (!result.crossing.none && !result.crossing.seen))) result.failures.push(`crossing: ${JSON.stringify(result.crossing)}`);
    const out = option('out');
    if (out && result.colonies && result.colonies.length) {
        mkdirSync(out, { recursive: true });
        await page.addStyleTag({ content: 'body * { visibility: hidden !important; } body > canvas { visibility: visible !important; }' });
        const shots = [];
        for (const c of result.colonies.slice(0, Number(option('shots') || 3))) {
            for (const far of [6, 25, 60, 120]) {
                await page.evaluate(async (placeSource, id, far) => {
                    const placeAt = new Function('game', `return (${placeSource})`)(game);
                    const env = game.environment, marmots = env.marmots;
                    const colony = [...marmots.colonies.values()].flat().find(k => k.id === id);
                    const loc = env.ground.locate(colony.x, colony.z, null, {});
                    const s = env.route.sArray[loc.index];
                    await placeAt(Math.max(10, s - 5));
                    // The game's own frames would draw its camera over this one
                    twistyDev.freeze();
                    // The animals at home, sitting up, as the camera finds them before they see it
                    for (const a of colony.animals) { const life = marmots.animals.get(a.id); Object.assign(life, { mode: 'sit', x: a.x, y: a.y, z: a.z, t: 0, until: 99 }); }
                    const cam = game.camera, p = env.route.sample(s, {});
                    const a0 = colony.animals[0];
                    const dx = a0.x - p.x, dz = a0.z - p.z, d = Math.hypot(dx, dz) || 1;
                    const ex = a0.x - dx / d * far, ez = a0.z - dz / d * far;
                    const ground = env.ground.tileHeight(ex, ez);
                    const ey = Math.max(Number.isFinite(ground) ? ground : -Infinity, colony.animals[0].y) + 1.6;
                    cam.up.set(0, 1, 0);
                    cam.position.set(ex, ey, ez);
                    cam.lookAt(a0.x, a0.y + 0.2, a0.z);
                    cam.fov = far < 40 ? 40 : far < 90 ? 22 : 12;
                    cam.updateProjectionMatrix();
                    marmots.update(0, { x: ex + 1e4, z: ez + 1e4, s: -1 }, 0, cam.position, null);
                    cam.updateMatrix();
                    cam.updateMatrixWorld(true);
                    game.graphics.render(game.scene, game.camera);
                    // Read in the same task as the draw: the canvas keeps no frame once it is shown
                    return game.graphics.renderer.domElement.toDataURL('image/png').split(',')[1];
                }, placeAt.toString(), c.id, far).then(png => { result.png = png; });
                const file = join(out, `marmots-${c.id.replace(/[^0-9m-]+/g, '_')}-${far}m.png`);
                writeFileSync(file, Buffer.from(result.png, 'base64'));
                delete result.png;
                shots.push(file);
            }
        }
        result.shots = shots;
    }
    return result;
};

// world-vault-shots --out <dir>: under each arch of the ride's viaducts, from its open face and from beside it, the
// camera 1.6 m over the land looking into and up the arch's underside (the stone of the vault: 6b3)
WORLD_PROBES.push('world-vault-shots');
WORLD['world-vault-shots'] = async (page) => {
    const out = option('out');
    if (!out) return { error: 'name a folder with --out <dir>' };
    mkdirSync(out, { recursive: true });
    await page.addStyleTag({ content: 'body * { visibility: hidden !important; } body > canvas { visibility: visible !important; }' });
    const arches = await page.evaluate(async (placeSource) => {
        const placeAt = new Function('game', `return (${placeSource})`)(game);
        const env = game.environment;
        for (let s = 7800; s < 8200; s += 100) await placeAt(s);
        const list = [];
        for (const via of env.viaducts || []) for (const bay of via.bays) if (bay.rise > 0) list.push({ s: (bay.a0 + bay.a1) / 2, rise: bay.rise, spring: bay.spring, span: bay.a1 - bay.a0, side: bay.open.r ? 1 : -1 });
        return list;
    }, placeAt.toString());
    const files = [];
    for (const [k, arch] of arches.entries()) {
        for (const view of ['into', 'up']) {
            const png = await page.evaluate(async (placeSource, arch, view) => {
                const placeAt = new Function('game', `return (${placeSource})`)(game);
                const env = game.environment;
                await placeAt(Math.max(10, arch.s - 40));
                twistyDev.freeze();
                const p = env.route.sample(arch.s, {}), ox = Math.cos(p.heading) * arch.side, oz = -Math.sin(p.heading) * arch.side;
                const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
                // 'into': 7 m out from the open face, a little over the springing, looking in at the crown; 'up': under
                // the arch at its face, looking up the barrel across the road
                const halfW = p.width / 2 + 1.2, out = view === 'into' ? halfW + 7 : halfW - 0.5;
                const ex = p.x + ox * out, ez = p.z + oz * out;
                const g = env.ground.tileHeight(ex, ez), ey = Math.max(Number.isFinite(g) ? g + 0.8 : -Infinity, arch.spring + (view === 'into' ? 0.6 : -0.6));
                const cam = game.camera;
                cam.up.set(0, 1, 0);
                cam.position.set(ex, ey, ez);
                cam.lookAt(p.x - ox * (view === 'into' ? 0 : halfW), arch.spring + arch.rise * (view === 'into' ? 0.7 : 0.95), p.z - oz * (view === 'into' ? 0 : halfW));
                cam.fov = 70;
                cam.updateProjectionMatrix();
                cam.updateMatrix();
                cam.updateMatrixWorld(true);
                game.graphics.render(game.scene, cam);
                return game.graphics.renderer.domElement.toDataURL('image/png').split(',')[1];
            }, placeAt.toString(), arch, view);
            const file = join(out, `vault-${k}-s${Math.round(arch.s)}-${view}.png`);
            writeFileSync(file, Buffer.from(png, 'base64'));
            files.push(file);
        }
    }
    return { arches, files };
};

// world-crew-start: the crew is on its own bikes from the first frame of a ride (BikeModels.preloadCrew behind the loading
// screen): every rider of the group modelled before the game is stepped, and none changes model in the first 10 s.
// Also how long the crew's files took to fetch (the loading screen waits on them)
WORLD_PROBES.push('world-crew-start');
WORLD['world-crew-start'] = page => page.evaluate(async () => {
    const riders = (game.traffic && game.traffic.motorcycles || []).filter(b => b.character);
    const first = riders.map(b => ({ id: b.character.id, modelled: !!b.dressedAtStart }));
    const groups = riders.map(b => b.bikeGroup.children.slice());
    let changed = 0;
    for (let f = 0; f < 600; f++) {
        twistyDev.step(1);
        riders.forEach((b, k) => { if (b.bikeGroup.children.some((c, i) => c !== groups[k][i]) || b.bikeGroup.children.length !== groups[k].length) { changed++; groups[k] = b.bikeGroup.children.slice(); } });
    }
    const files = performance.getEntriesByType('resource').filter(e => /assets\/bikes\/(far\/|rider_far)/.test(e.name));
    const failures = [];
    if (!riders.length) failures.push('no crew riders');
    for (const r of first) if (!r.modelled) failures.push(`${r.id} started on the procedural bike`);
    if (changed) failures.push(`${changed} model changes in the first 10 s`);
    return { riders: first, changed, files: files.length, fetchMs: Math.round(Math.max(0, ...files.map(e => e.responseEnd)) - Math.min(...files.map(e => e.startTime))), bytes: files.reduce((n, e) => n + (e.transferSize || e.encodedBodySize || 0), 0), failures };
});

WORLD['world-clearance'] = async (page) => {
    const result = await page.evaluate(clearanceWalk, placeAt.toString(), Number(option('every') || 300), CLEAR_HEADROOM_M, CLEAR_STEP_M, CLEAR_FINE_M);
    const out = option('out');
    if (out && result.hits.length) {
        mkdirSync(out, { recursive: true });
        result.files = [];
        const tag = option('tag') || 'clearance';
        // A still view of each of the worst offenders from the ride 25 m before it, 3 m up, the HUD left out
        const worst = result.hits.slice().sort((p, q) => q.hits - p.hits).slice(0, Number(option('shots') || 4));
        for (const [k, hit] of worst.entries()) {
            const s = await page.evaluate(async (placeSource, h) => {
                const placeAt = new Function('game', `return (${placeSource})`)(game);
                const env = game.environment;
                const at = h.s !== null ? h.s : env.route.project(h.x, h.z, null, {}).s;
                await placeAt(Math.max(5, at - 25));
                env.streamer.pump(Infinity);
                const eye = env.route.sample(Math.max(0, at - 25), {});
                const target = env.route.sample(at, {});
                game.camera.position.set(eye.x, eye.y + 3, eye.z);
                game.camera.lookAt(h.x, target.y + 1.2, h.z);
                game.camera.updateMatrixWorld(true);
                game.graphics.renderer.render(game.scene, game.camera);
                return Math.round(at);
            }, placeAt.toString(), hit);
            const canvas = await page.evaluateHandle(() => game.graphics.renderer.domElement);
            const file = join(out, `${tag}-${k + 1}-${hit.type}-s${s}.png`);
            await canvas.screenshot({ path: file });
            result.files.push(file);
        }
    }
    return result;
};

// Physics can only kill the rider where the rider can see why (tests/helpers/world-fairness.js, run in the page on
// the meshes it draws): the whole ride every metre across the drawn road and verge, then the world pilot through
// every hairpin at 5 and 7 m/s on the centre line and 2.5 m either side, counting crashes and restarts. --every sets the window streamed in at a time.
// Then every roadworks site: its open lane clear of every drawn thing and physics zone (roadworksWindow), and the pilot
// through it in the open lane at 8 and 14 m/s, stopping at its light.
WORLD_PROBES.push('world-fairness');
WORLD['world-fairness'] = async (page) => page.evaluate(async (fairSource, placeSource, hairpinSource, every, worksSource) => {
    const fairness = new Function(`return (${fairSource})`)();
    const roadworks = new Function(`return (${worksSource})`)();
    const placeAt = new Function('game', `return (${placeSource})`)(game);
    const env = game.environment;
    const route = env.route;
    const v = game.vehicle;
    twistyDev.freeze();
    const sweep = { points: 0, widthCount: 0, solidCount: 0, runoffCount: 0, worstWidthM: 0, width: [], solid: [], runoff: [] };
    const parts = { THREE, RoadSurface, TerrainMesh };
    for (let s = env.startS; s < env.endS; s += every) {
        const mid = Math.min(env.endS, s + every / 2);
        const p = route.sample(mid, {});
        env.update(p, mid, null, Infinity);
        await env.streamer.settle(p, mid);
        const r = fairness(parts, env, v, { s0: s, s1: Math.min(env.endS, s + every - 1e-6), stepM: 1, acrossM: 0.25 });
        for (const k of ['points', 'widthCount', 'solidCount', 'runoffCount']) sweep[k] += r[k];
        sweep.worstWidthM = Math.max(sweep.worstWidthM, r.worstWidthM);
        for (const k of ['width', 'solid', 'runoff']) sweep[k].push(...r[k].slice(0, 5));
        await new Promise(resolve => setTimeout(resolve, 0));
    }
    // The rides: from 90 m before each hairpin's middle to 70 m after it, the pilot holding `cruise`
    const crashes = [], restarts = [];
    const log = console.log;
    console.log = (...args) => { if (/CRASHED/.test(String(args[0]))) crashes.push({ s: Math.round(v.projection.s ?? v.routeS), line: args.join(' ') }); log.apply(console, args); };
    const restart = game.restartFromCheckpoint.bind(game);
    game.restartFromCheckpoint = (reason) => { restarts.push({ s: Math.round(v.projection.s ?? v.routeS), reason }); return restart(reason); };
    game.worldLinger = false;
    const hairpins = new Function(`return (${hairpinSource})`)()(route).filter(s => !game.environment.stage || (s >= game.environment.startS && s <= game.environment.endS));
    let rides = 0;
    // The hairpin rides judge the road and the physics, on the centre line and to either side of it, the oncoming lane
    // too: with the traffic on the road a ride there met a car now and then. The traffic is judged in the site rides
    const traffic = game.traffic;
    game.traffic = null;
    try {
        // The centre line and either side of it: off the centre, a sample's step in the old projection was a restart
        for (const [cruise, lane] of [[5, 0], [7, 0], [5, -2.5], [7, 2.5]]) {
            for (const h of hairpins) {
                await placeAt(Math.max(env.startS, h - 90));
                v.speed = cruise;
                twistyDev.autopilot({ speed: cruise, lane });
                const before = crashes.length + restarts.length;
                let ticks = 0;
                while (!v.crashed && crashes.length + restarts.length === before && (v.projection.s ?? v.routeS) < h + 70 && ticks < 60 * 90) {
                    twistyDev.step(1);
                    ticks++;
                    if (ticks % 240 === 0) await new Promise(resolve => setTimeout(resolve, 0));
                }
                rides++;
                const last = crashes[crashes.length - 1] || restarts[restarts.length - 1];
                if (crashes.length + restarts.length > before) last.ride = { hairpin: Math.round(h), cruise, lane };
                if (v.crashed) { v.reset(); }
            }
        }
    } finally {
        console.log = log;
        game.restartFromCheckpoint = restart;
        game.traffic = traffic;
    }
    // The roadworks: the open lanes, then the pilot through each site in its open lane, waiting at a red
    const works = roadworks({ Roadworks }, env);
    const siteCrashes = [];
    let siteRides = 0;
    console.log = (...args) => { if (/CRASHED/.test(String(args[0]))) siteCrashes.push({ s: Math.round(v.projection.s ?? v.routeS), line: args.join(' ') }); log.apply(console, args); };
    game.restartFromCheckpoint = (reason) => { siteCrashes.push({ s: Math.round(v.projection.s ?? v.routeS), reason }); return restart(reason); };
    try {
        for (const cruise of [8, 14]) {
            for (const site of (env.roadworks ? env.roadworks.closed : [])) {
                await placeAt(Math.max(env.startS, site.s0 - 60));
                v.speed = cruise;
                twistyDev.autopilot({ speed: cruise, lane: 0 });
                const before = siteCrashes.length;
                let ticks = 0;
                // (time for a whole cycle of its lights at the stop line, then for the site's length at half the cruise)
                const most = 60 * (60 + site.cycleS * 1.5 + (site.length + 70) / (cruise / 2));
                while (!v.crashed && siteCrashes.length === before && (v.projection.s ?? v.routeS) < site.s1 + 10 && ticks < most) {
                    twistyDev.step(1);
                    ticks++;
                    if (ticks % 240 === 0) await new Promise(resolve => setTimeout(resolve, 0));
                }
                siteRides++;
                if (siteCrashes.length > before) siteCrashes[siteCrashes.length - 1].site = { id: site.id, cruise };
                else if ((v.projection.s ?? v.routeS) < site.s1 + 10) siteCrashes.push({ site: { id: site.id, cruise }, stuck: Math.round(v.projection.s ?? v.routeS) });
                if (v.crashed) v.reset();
            }
        }
    } finally {
        console.log = log;
        game.restartFromCheckpoint = restart;
    }
    return { every, stageM: Math.round(env.endS - env.startS), openM: Math.round((env.endS - env.startS) - (env.data.manifest.structures || []).filter(st => st.kind !== 'bridge').reduce((m, st) => m + Math.max(0, Math.min(st.s1, env.endS) - Math.max(st.s0, env.startS)), 0)), gates: (env.checkpoints || []).length, ...sweep, width: sweep.width.slice(0, 20), solid: sweep.solid.slice(0, 20), runoff: sweep.runoff.slice(0, 20), hairpins: hairpins.length, rides, crashes, restarts, works, siteRides, siteCrashes };
}, fairnessWindow.toString(), placeAt.toString(), worldHairpins.toString(), Number(option('every') || 100), roadworksWindow.toString());

// The least number of hairpins a stage's probes must find: the stage's own count by tools/world/verify.mjs
// findHairpins, so a finder that finds nothing fails where the data has hairpins and a stage with none (the run-in
// from the north, and the lookout leg, whose one hairpin is past its finish line at the stop) is not failed for having
// none. The Tremola has 31; the probes ask for 20 of them, as before.
// (the tour's legs, js/world/tour.js: the Tremola down has the Tremola's hairpins, the modern road up its few)
const HAIRPINS_LEAST = { tremola: 20, all: 20, 'gotthard-north': 0, 'lookout-andermatt': 0, 'airolo-lookout': 0 };
const hairpinsLeast = () => HAIRPINS_LEAST[option('world') || 'tremola'] ?? 1;

function fairnessChecks(results, failures) {
    const fair = results['world-fairness'];
    if (!fair) return;
    // (the Tremola's 13.2 km read over 500 000 points: 38 a metre of stage outside its tunnels and galleries; a shorter
    // stage has fewer, and a tunnel's road is not read)
    const least = Number.isFinite(fair.openM) ? 30 * fair.openM : 500000;
    if (!(fair.points > least)) failures.push(`world-fairness: only ${fair.points} points of the drawn road read, want over ${least}`);
    if (fair.widthCount) failures.push(`world-fairness: ${fair.widthCount} points where the physics band is over 0.1 m off the drawn ribbon (worst ${fair.worstWidthM} m): ${JSON.stringify(fair.width.slice(0, 10))}`);
    if (fair.solidCount) failures.push(`world-fairness: ${fair.solidCount} wall or fall points on the drawn road with nothing drawn within 0.5 m: ${JSON.stringify(fair.solid.slice(0, 10))}`);
    if (fair.runoffCount) failures.push(`world-fairness: ${fair.runoffCount} run-off points on the drawn carriageway: ${JSON.stringify(fair.runoff.slice(0, 10))}`);
    if (!(fair.hairpins >= hairpinsLeast() && fair.rides === fair.hairpins * 4)) failures.push(`world-fairness: ${fair.rides} rides over ${fair.hairpins} hairpins, want ${hairpinsLeast()} hairpins or more`);
    if (fair.crashes.length) failures.push(`world-fairness: ${fair.crashes.length} crashes in the hairpins at 5 and 7 m/s: ${JSON.stringify(fair.crashes.slice(0, 10))}`);
    if (fair.restarts.length) failures.push(`world-fairness: ${fair.restarts.length} restarts in the hairpins at 5 and 7 m/s: ${JSON.stringify(fair.restarts.slice(0, 10))}`);
    const works = fair.works || {};
    // (a stage with no checkpoint has no roadworks: the lookout leg is shorter than twice the station spacing)
    if (!((works.sites > 0) || fair.gates === 0) || fair.siteRides !== (works.sites || 0) * 2) failures.push(`world-fairness: ${fair.siteRides} rides through ${works.sites} roadworks sites`);
    if ((works.narrow || []).length) failures.push(`world-fairness: open lanes under 3.2 m: ${JSON.stringify(works.narrow)}`);
    if ((works.inOpen || []).length) failures.push(`world-fairness: roadworks in an open lane: ${JSON.stringify(works.inOpen.slice(0, 10))}`);
    if ((works.drawnOff || []).length) failures.push(`world-fairness: roadworks whose physics box is not the drawn one: ${JSON.stringify(works.drawnOff.slice(0, 10))}`);
    if ((fair.siteCrashes || []).length) failures.push(`world-fairness: ${fair.siteCrashes.length} rides ended in a roadworks site's open lane: ${JSON.stringify(fair.siteCrashes.slice(0, 10))}`);
}

function clearanceChecks(results, failures) {
    const clear = results['world-clearance'];
    if (!clear) return;
    if (!(clear.rays > 0 && clear.instancesSeen > 0)) failures.push(`world-clearance: nothing was cast (${clear.rays} rays over ${clear.instancesSeen} drawn things)`);
    if (clear.offenders) failures.push(`world-clearance: ${clear.offenders} drawn things stand in a road within ${clear.headroomM} m over it (${JSON.stringify(clear.byType)}): ${JSON.stringify(clear.hits.slice(0, 20))}`);
}

// Every road within the LOD0 radius looks like a road (tests/unit/world-road-look.test.js counts the triangles): the
// chase view just past the finish (where the stage's road ended in flat grey) and at the start, and the view from a
// side road, drawn as the game draws them but with the far (LOD1, flat) road material painted magenta and the near
// (textured) one green where they lie within ROAD_LOOK_M of the bike (black beyond). A magenta pixel is a flat road
// within the LOD0 radius (less the 5 m a ride section's box can lie inside its ribbon's edge, as the unit test reads
// it). --out <dir> saves each view's colour-coded picture.
//   node tools/terrain-check.mjs world-road-look --world tremola --gpu [--out <dir> --tag T]
const ROAD_LOOK_M = 395;
WORLD_PROBES.push('world-road-look');
WORLD['world-road-look'] = async (page) => {
    const views = await page.evaluate(async (placeSource, nearM) => {
        const placeAt = new Function('game', `return (${placeSource})`)(game);
        const env = game.environment, v = game.vehicle, renderer = game.graphics.renderer;
        twistyDev.freeze();
        const W = 480, H = 270;
        const target = new THREE.WebGLRenderTarget(W, H);
        // A road's colour within nearM of the bike (in plan), black beyond
        const centre = { value: new THREE.Vector2() };
        const painted = color => new THREE.ShaderMaterial({
            side: THREE.DoubleSide, uniforms: { centre, color: { value: new THREE.Color(color) }, reach: { value: nearM } },
            vertexShader: 'varying vec2 vPlan; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vPlan = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }',
            fragmentShader: 'uniform vec2 centre; uniform vec3 color; uniform float reach; varying vec2 vPlan; void main() { gl_FragColor = vec4(distance(vPlan, centre) <= reach ? color : vec3(0.0), 1.0); }'
        });
        const paint = { far: painted(0xff00ff), near: painted(0x00ff00) };
        // Chase views on the ride; the side road's view stands the bike on side edge 198, 120 m from its junction
        const places = [['finish', env.route.length - 8, null], ['start', env.startS, null], ['side-198', null, [198, 30]]];
        const out = [];
        for (const [name, s, onSide] of places) {
            game.setCameraView('near');
            if (onSide) {
                await env.data.ensureChunks(env.data.manifest.chunks.map((_, k) => k));
                const sm = env.graph.samples(onSide[0]);
                const i = Math.min(onSide[1], sm.x.length - 1);
                const p = { x: sm.x[i], y: sm.y[i], z: sm.z[i] };
                let best = Infinity, rideS = 0;
                env.route.points.forEach((q, k) => { const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < best) { best = d; rideS = env.route.sArray[k]; } });
                env.update(p, rideS, null, Infinity);
                await env.streamer.settle(p, rideS);
                v.position.set(p.x, p.y + 0.3, p.z);
                v.yawAngle = sm.heading[i];
            } else {
                await placeAt(s);
            }
            game.worldCamera.reset(v.yawAngle);
            twistyDev.step(1, { render: true });
            const camera = game.camera;
            centre.value.set(v.position.x, v.position.z);
            const swapped = [];
            env.group.traverse(o => {
                if (!o.isMesh) return;
                const kind = o.material === RoadSurface.far ? 'far' : o.material === RoadSurface.near ? 'near' : null;
                if (kind) { swapped.push([o, o.material]); o.material = paint[kind]; }
            });
            const fog = game.scene.fog;
            game.scene.fog = null;
            renderer.setRenderTarget(target);
            renderer.render(game.scene, camera);
            const pixels = new Uint8Array(W * H * 4);
            renderer.readRenderTargetPixels(target, 0, 0, W, H, pixels);
            renderer.setRenderTarget(null);
            game.scene.fog = fog;
            swapped.forEach(([o, m]) => { o.material = m; });
            let flat = 0, near = 0;
            for (let k = 0; k < W * H; k++) {
                const r = pixels[k * 4], g = pixels[k * 4 + 1], b = pixels[k * 4 + 2];
                if (r > 200 && g < 60 && b > 200) flat++;
                else if (g > 200 && r < 60 && b < 60) near++;
            }
            // The picture, flipped to screen order, for --out
            const canvas = document.createElement('canvas');
            canvas.width = W; canvas.height = H;
            const image = canvas.getContext('2d').createImageData(W, H);
            for (let y = 0; y < H; y++) image.data.set(pixels.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
            canvas.getContext('2d').putImageData(image, 0, 0);
            out.push({ name, s: Math.round(v.routeS || s || 0), flat, near, png: canvas.toDataURL('image/png') });
        }
        target.dispose();
        return out;
    }, placeAt.toString(), ROAD_LOOK_M);
    const dir = option('out');
    if (dir) mkdirSync(dir, { recursive: true });
    const tag = option('tag') || 'road-look';
    return {
        views: views.map(({ png, ...view }) => {
            if (dir) writeFileSync(join(dir, `${tag}-${view.name}.png`), Buffer.from(png.split(',')[1], 'base64'));
            return view;
        })
    };
};

function roadLookChecks(results, failures) {
    const look = results['world-road-look'];
    if (!look) return;
    for (const view of look.views) {
        if (!(view.near > 1000)) failures.push(`world-road-look: the ${view.name} view shows ${view.near} pixels of textured road, want over 1000`);
        if (view.flat) failures.push(`world-road-look: the ${view.name} view shows ${view.flat} pixels of flat (LOD1) road within ${ROAD_LOOK_M} m of the bike`);
    }
}

// world-ground-shots: GPU pictures of the bike on the drawn ground (Vehicle.groundPose; .agent/system/handling.md, "The
// bike stands on the ground"). The bike is stopped on the steepest grade of the ride (over 10 m, off the structures; or
// at each s of --at), facing up it, down it and across it, with the foot down, and each is drawn from the chase camera and
// from the side, 4.5 m to the bike's right at its middle. --out <dir> names the folder, --tag the file prefix.
//   node tools/terrain-check.mjs world-ground-shots --world tremola --gpu --out <dir> [--tag T] [--at s,s,...]
WORLD_PROBES.push('world-ground-shots');
WORLD['world-ground-shots'] = async (page) => {
    const dir = option('out');
    if (!dir) return { error: 'name a folder with --out <dir>' };
    mkdirSync(dir, { recursive: true });
    const tag = option('tag') || 'ground';
    const at = option('at') ? String(option('at')).split(',').map(Number) : null;
    const views = await page.evaluate(async (placeSource, at) => {
        const placeAt = new Function('game', `return (${placeSource})`)(game);
        const env = game.environment, route = env.route, v = game.vehicle, renderer = game.graphics.renderer;
        game.worldLinger = false;
        const gradeAt = s => (route.sample(s + 5, {}).y - route.sample(s - 5, {}).y) / 10;
        let list = at;
        if (!list) {
            let best = null;
            for (let s = env.startS + 60; s < env.endS - 60; s += 2) {
                const p = route.sample(s, {});
                if (p.flags && (p.flags.tunnel || p.flags.bridge || p.flags.gallery)) continue;
                const grade = gradeAt(s);
                if (Math.abs(grade - p.grade) > 0.03) continue;
                if (!best || Math.abs(grade) > Math.abs(best.grade)) best = { s, grade };
            }
            list = [best.s];
        }
        const W = 960, H = 540;
        const target = new THREE.WebGLRenderTarget(W, H);
        const side = new THREE.PerspectiveCamera(40, W / H, 0.1, 3000);
        const shot = camera => {
            renderer.setRenderTarget(target);
            renderer.render(game.scene, camera);
            const pixels = new Uint8Array(W * H * 4);
            renderer.readRenderTargetPixels(target, 0, 0, W, H, pixels);
            renderer.setRenderTarget(null);
            const canvas = document.createElement('canvas');
            canvas.width = W; canvas.height = H;
            const image = canvas.getContext('2d').createImageData(W, H);
            for (let y = 0; y < H; y++) image.data.set(pixels.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
            canvas.getContext('2d').putImageData(image, 0, 0);
            return canvas.toDataURL('image/png');
        };
        const out = [];
        for (const s of list) {
            const p = await placeAt(s);
            const grade = gradeAt(s);
            const up = grade > 0 ? p.heading : p.heading + Math.PI;
            for (const [way, heading] of [['uphill', up], ['downhill', up + Math.PI], ['across', up + Math.PI / 2]]) {
                v.position.set(p.x, p.y, p.z);
                v.yawAngle = heading;
                v.leanAngle = 0;
                v.speed = 0;
                v.findNearestRoadSegment();
                game.setCameraView('near');
                game.worldCamera.reset(v.yawAngle);
                // No input: the rider stops and puts a foot down (Vehicle.updateWorldSpeed, updateFooting)
                twistyDev.autopilot({ speed: 0, on: false });
                for (let i = 0; i < 120; i++) twistyDev.step(1);
                env.streamer.pump(Infinity);
                twistyDev.step(1, { render: true });
                const g = v.group.position;
                const sin = Math.sin(v.yawAngle), cos = Math.cos(v.yawAngle);
                side.position.set(g.x - cos * 4.5, g.y + 0.9, g.z + sin * 4.5);
                side.lookAt(g.x, g.y + 0.55, g.z);
                side.updateMatrixWorld(true);
                const r3 = x => Math.round(x * 1000) / 1000;
                const facts = { s: Math.round(s), grade: r3(grade), way, pitch: r3(v.group.rotation.x), roll: r3(v.group.rotation.z), y: r3(g.y - p.y), crashed: v.crashed, foot: !!v.footPlaced };
                out.push({ ...facts, view: 'chase', png: shot(game.camera) });
                out.push({ ...facts, view: 'side', png: shot(side) });
            }
        }
        target.dispose();
        return out;
    }, placeAt.toString(), at);
    return {
        views: views.map(({ png, ...view }) => {
            const file = join(dir, `${tag}-s${view.s}-${view.way}-${view.view}.png`);
            writeFileSync(file, Buffer.from(png.split(',')[1], 'base64'));
            return { file, ...view };
        })
    };
};

// world-vertex: a bike put down at a ride vertex's exact s (a restart, a resume or a put-down: stations sit at sample s
// values) takes finite physics and draws a lit frame. Such a put-down took a NaN height on its first step (0 / 0 in
// Vehicle.updateElevation): the NaN reached the fog density through the weather's fogElevation and bloom spread it
// over the whole frame, pure black. At each s the bike is put down at rest (placeAt) and stepped VERTEX_STEPS ticks;
// the fog density, the camera and the bike must be finite, the physics guard must not have fired (Vehicle
// nonFiniteSteps), under VERTEX_BLACK_SHARE of the frame may be black, and its luminance must vary by VERTEX_SPREAD or
// more (a NaN camera drew one flat colour, the sky's, as often as black). --at s,s,... picks the places; the default
// is the reported vertex, the start, every station and a dozen vertices spread along the ride.
//   node tools/terrain-check.mjs world-vertex --world tremola --gpu [--at s,s,...] [--out <dir> --tag T]
const VERTEX_STEPS = 3;
const VERTEX_BLACK_SHARE = 0.5;
const VERTEX_SPREAD = 5;
const VERTEX_REPORTED_S = 6569.245793820582;
WORLD_PROBES.push('world-vertex');
WORLD['world-vertex'] = async (page) => {
    const views = await page.evaluate(async (placeSource, list, steps, reported) => {
        const placeAt = new Function('game', `return (${placeSource})`)(game);
        const env = game.environment, route = env.route, v = game.vehicle, S = route.sArray;
        let at = list;
        if (!at.length) {
            at = [reported, env.startS, ...(env.stationGates || []).map(g => g.s)];
            for (let k = 1; k <= 12; k++) at.push(S[Math.round(k * (S.length - 1) / 13)]);
        }
        const finite = (...n) => n.every(Number.isFinite);
        const out = [];
        game.setCameraView('near');
        for (const s of at) {
            await placeAt(s);
            game.worldCamera.reset(v.yawAngle);
            const held = v.nonFiniteSteps || 0;
            twistyDev.step(steps - 1);
            env.streamer.pump(Infinity);
            twistyDev.step(1, { render: true });
            // The frame as drawn, read in the same task as the render
            const canvas = game.graphics.renderer.domElement;
            const copy = document.createElement('canvas');
            copy.width = canvas.width; copy.height = canvas.height;
            const ctx = copy.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(canvas, 0, 0);
            const image = ctx.getImageData(0, 0, copy.width, copy.height).data;
            let black = 0, sum = 0, square = 0;
            for (let i = 0; i < image.length; i += 4) {
                const lum = 0.2126 * image[i] + 0.7152 * image[i + 1] + 0.0722 * image[i + 2];
                sum += lum;
                square += lum * lum;
                if (lum < 2) black++;
            }
            const px = image.length / 4;
            const mean = sum / px;
            const c = game.camera.position, b = v.position, fog = game.scene.fog;
            out.push({
                s, vertex: S[route.indexAt(s)] === s,
                fogDensity: fog ? fog.density : null,
                fogFinite: !fog || fog.density === undefined || Number.isFinite(fog.density),
                cameraFinite: finite(c.x, c.y, c.z) && game.camera.matrixWorld.elements.every(Number.isFinite),
                bikeFinite: finite(b.x, b.y, b.z, v.speed, v.leanAngle, v.yawAngle),
                held: (v.nonFiniteSteps || 0) - held,
                blackShare: Math.round(black / px * 1000) / 1000,
                meanLum: Math.round(mean * 10) / 10,
                spread: Math.round(Math.sqrt(Math.max(0, square / px - mean * mean)) * 10) / 10,
                png: copy.toDataURL('image/png')
            });
        }
        return out;
    }, placeAt.toString(), option('at') ? option('at').split(',').map(Number) : [], VERTEX_STEPS, VERTEX_REPORTED_S);
    const dir = option('out');
    if (dir) mkdirSync(dir, { recursive: true });
    const tag = option('tag') || 'vertex';
    return {
        views: views.map(({ png, ...view }) => {
            if (dir) writeFileSync(join(dir, `${tag}-s${view.s}.png`), Buffer.from(png.split(',')[1], 'base64'));
            return view;
        })
    };
};

function vertexChecks(results, failures) {
    const vertex = results['world-vertex'];
    if (!vertex) return;
    if (!vertex.views.some(view => view.s === VERTEX_REPORTED_S && view.vertex) && !option('at')) failures.push(`world-vertex: the reported vertex s ${VERTEX_REPORTED_S} was not read at a vertex`);
    for (const view of vertex.views) {
        const where = `world-vertex: at s ${view.s}${view.vertex ? ' (a vertex)' : ''}`;
        if (!view.fogFinite) failures.push(`${where} the fog density is ${view.fogDensity}`);
        if (!view.cameraFinite) failures.push(`${where} the camera is not finite`);
        if (!view.bikeFinite) failures.push(`${where} the bike's state is not finite`);
        if (view.held) failures.push(`${where} the physics guard held ${view.held} non-finite steps`);
        if (!(view.blackShare < VERTEX_BLACK_SHARE)) failures.push(`${where} ${view.blackShare} of the frame is black (mean luminance ${view.meanLum})`);
        if (!(view.spread >= VERTEX_SPREAD)) failures.push(`${where} the frame is one flat colour (luminance ${view.meanLum}, spread ${view.spread})`);
    }
}

// world-walls: the retaining walls against the land drawn round them, in the page (tests/helpers/world-walls.js: the
// bike is put down every --every metres, 300 by default, and every wall within 350 m is read from the drawn
// triangles). It fails on land inside or in front of a wall (buried, climbs), a gap at a wall's top, at its foot or
// past its end (top, hangs, open) and a wall in pieces (blocks, steps), over what WALL_LIMITS holds. Then the views:
// --eyes s:lat:up:toS:toLat:toUp,... puts the eye beside the ride (metres of ride, metres right of the centre line,
// metres over the road) and s@x:y:z:tx:ty:tz in the world's own metres; with --out each is saved, and so is a view of
// the worst place of each kind the check found.
//   node tools/terrain-check.mjs world-walls --world tremola --gpu [--every 300] [--eyes ...] [--out <dir> --tag T]
WORLD_PROBES.push('world-walls');
WORLD['world-walls'] = async (page) => {
    const walls = await page.evaluate(async (windowSource, runsSource, placeSource, every) => {
        const read = new Function(`return (${windowSource})`)(), runs = new Function(`return (${runsSource})`)();
        const placeAt = new Function('game', `return (${placeSource})`)(game);
        const env = game.environment, store = {};
        game.worldLinger = false;
        for (let s = env.startS; s < env.endS; s += every) {
            const p = await placeAt(Math.min(env.endS - 1, s + every / 2));
            read({ THREE }, env, store, p);
        }
        const out = runs(store);
        // Where each worst place is seen from: 14 m out from the wall's face, a little over its top
        const eye = h => { const f = [...store.faces.values()].find(g => Math.abs((g.a.top[0] + g.b.top[0]) / 2 - h.x) < 0.2 && Math.abs((g.a.top[2] + g.b.top[2]) / 2 - h.z) < 0.2) || [...store.faces.values()].find(g => Math.hypot(g.a.top[0] - h.x, g.a.top[2] - h.z) < 0.2 || Math.hypot(g.b.top[0] - h.x, g.b.top[2] - h.z) < 0.2); return f ? { s: h.s, at: [h.x + f.ox * 14, f.a.top[1] + 3, h.z + f.oz * 14, h.x, f.a.top[1] - 2, h.z] } : null; };
        out.worst = {};
        for (const kind of ['buried', 'climbs', 'hangs', 'top', 'blocks', 'steps', 'open']) if (out[kind].length) out.worst[kind] = eye(out[kind][0]);
        for (const kind of ['buried', 'climbs', 'hangs', 'top', 'blocks', 'steps', 'open']) out[kind] = { count: out[kind].length, worst: out[kind].slice(0, 8) };
        return out;
    }, wallWindow.toString(), wallRuns.toString(), placeAt.toString(), Number(option('every') || 300));
    const out = option('out');
    if (out) mkdirSync(out, { recursive: true });
    const tag = option('tag') || 'walls';
    const views = [];
    const shoot = async (eye, name) => {
        await page.evaluate(wallEye, placeAt.toString(), eye);
        const file = out ? join(out, `${tag}-${name}.png`) : null;
        if (file) await page.screenshot({ path: file });
        views.push({ eye: name, file });
    };
    for (const spec of (option('eyes') ? option('eyes').split(',') : [])) {
        // s:lat:up:toS:toLat:toUp along the ride, or s@x:y:z:tx:ty:tz in the world's own metres (the bike put down at s)
        const eye = spec.includes('@') ? { s: Number(spec.split('@')[0]), at: spec.split('@')[1].split(':').map(Number) } : spec.split(':').map(Number);
        await shoot(eye, spec.replace(/[:@]/g, '_'));
    }
    if (out) for (const [kind, eye] of Object.entries(walls.worst)) if (eye) await shoot(eye, `worst-${kind}`);
    return { ...walls, views };
};

function wallChecks(results, failures) {
    const walls = results['world-walls'];
    if (!walls) return;
    if (!(walls.faces > 500)) failures.push(`world-walls: only ${walls.faces} wall faces were read`);
    const says = { buried: 'wall faces with the land in front at their top', climbs: 'wall faces the land climbs steeper than a fill stands', hangs: 'wall feet over the land', top: 'wall tops no road surface meets', blocks: 'runs of wall under 10 m', steps: 'pairs of runs under 12 m apart', open: 'wall ends past which the road\'s edge hangs open' };
    for (const [kind, text] of Object.entries(says)) {
        if (walls[kind].count > WALL_LIMITS[kind]) failures.push(`world-walls: ${walls[kind].count} ${text} (at most ${WALL_LIMITS[kind]}): ${JSON.stringify(walls[kind].worst.slice(0, 5))}`);
    }
}

async function wallEye(placeSource, eye) {
    const [s, lat, up, toS, toLat, toUp] = Array.isArray(eye) ? eye : [eye.s];
    const placeAt = new Function('game', `return (${placeSource})`)(game);
    const v = game.vehicle, route = game.environment.route;
    game.setCameraView('near');
    await placeAt(s);
    document.querySelectorAll('#finishBanner').forEach(el => el.remove());
    game.worldCamera.reset(v.yawAngle);
    twistyDev.autopilot({ speed: 0 });
    for (let i = 0; i < 30; i++) twistyDev.step(1);
    game.environment.streamer.pump(Infinity);
    twistyDev.step(1, { render: true });
    const at = (s, lat, up) => { const p = route.sample(s, {}); return new THREE.Vector3(p.x + lat * Math.cos(p.heading), p.y + up, p.z - lat * Math.sin(p.heading)); };
    if (Array.isArray(eye)) {
        game.camera.position.copy(at(s, lat, up));
        game.camera.lookAt(at(toS, toLat, toUp));
    } else {
        game.camera.position.set(eye.at[0], eye.at[1], eye.at[2]);
        game.camera.lookAt(new THREE.Vector3(eye.at[3], eye.at[4], eye.at[5]));
    }
    game.camera.updateMatrixWorld(true);
    game.graphics.render(game.scene, game.camera);
}

// world-junctions: every junction of the ride as it is drawn, in the page (tests/helpers/world-junctions.js: the bike
// is put down at each junction and every side road that leaves it is read from the drawn triangles). It fails on a
// step or a hole in a side road's surface from the junction out, land over it, a deck or parapet in its mouth, an
// edge that hangs open there, the ride's wall, coping or parapet drawn across its mouth, a mouth the physics
// shuts with the ride's wall band, land, laid ground or the ride's verge drawn over it in its mouth (`strips`) and a
// gap between it and the ride beside it at one height (`pits`) or a narrow one open to the land at any heights
// (`clefts`), over what JUNCTION_LIMITS holds. With --out, two views of every junction --at names
// (all of them without it) are saved as the frame alone: from the ride before the junction, and from over the side
// road looking back at it. --eyes s@x:y:z:tx:ty:tz adds views in the world's own metres.
//   node tools/terrain-check.mjs world-junctions --world tremola --gpu [--at j7,j12] [--eyes ...] [--out <dir> --tag T]
WORLD_PROBES.push('world-junctions');
WORLD['world-junctions'] = async (page) => {
    const only = option('at') ? option('at').split(',') : null;
    const read = await page.evaluate(async (windowSource, reportSource, placeSource) => {
        const window = new Function(`return (${windowSource})`)(), report = new Function(`return (${reportSource})`)();
        const placeAt = new Function('game', `return (${placeSource})`)(game);
        const env = game.environment, store = {};
        game.worldLinger = false;
        // (the junctions the stage rides past: a folder of several stages holds the others' too)
        for (const junction of env.graph.junctions.filter(j => !env.stage || j.passes.some(q => q.sIn >= env.stage.from - 1 && q.sIn <= env.stage.to + 1))) {
            const p = await placeAt(Math.max(env.startS + 1, Math.min(env.endS - 1, junction.passes[0].sIn)));
            window({ THREE }, env, store, p);
        }
        const out = report(store);
        // Where each side road is seen from: over the road 22 m out looking back at the node, and from the ride
        out.eyes = [...store.roads.values()].map(road => {
            const { rows } = env.graph.chainFrom(road.edge, env.graph.junctions.find(j => j.id === road.junction).node, 24);
            // (a side road with no drawn rows from its node has no view)
            if (!rows.length) return null;
            const node = rows[0], far = rows[rows.length - 1];
            return { junction: road.junction, edge: road.edge, s: Math.max(env.startS + 1, road.s), back: [far.x, far.y + 7, far.z, node.x, node.y, node.z] };
        }).filter(Boolean);
        for (const kind of ['steps', 'holes', 'sunk', 'decks', 'open', 'walls', 'blocked', 'cliffs', 'strips', 'pits', 'clefts']) out[kind] = { count: out[kind].length, worst: out[kind].slice(0, 12) };
        return out;
    }, junctionWindow.toString(), junctionReport.toString(), placeAt.toString());
    const out = option('out');
    if (out) mkdirSync(out, { recursive: true });
    const tag = option('tag') || 'junction';
    const views = [];
    const shoot = async (eye, name) => {
        const png = await page.evaluate(junctionEye, placeAt.toString(), eye);
        const file = out ? join(out, `${tag}-${name}.png`) : null;
        if (file) writeFileSync(file, Buffer.from(png.split(',')[1], 'base64'));
        views.push({ eye: name, file });
    };
    if (out) {
        for (const eye of read.eyes) {
            if (only && !only.includes(eye.junction)) continue;
            await shoot({ s: eye.s, at: eye.back }, `${eye.junction}-e${eye.edge}-back`);
            await shoot([eye.s - 22, 0, 5, eye.s + 4, 0, 0], `${eye.junction}-e${eye.edge}-ride`);
        }
    }
    for (const spec of (option('eyes') ? option('eyes').split(',') : [])) {
        const eye = spec.includes('@') ? { s: Number(spec.split('@')[0]), at: spec.split('@')[1].split(':').map(Number) } : spec.split(':').map(Number);
        await shoot(eye, spec.replace(/[:@]/g, '_'));
    }
    const { eyes, ...rest } = read;
    return { ...rest, views };
};

function junctionChecks(results, failures) {
    const junctions = results['world-junctions'];
    if (!junctions) return;
    // (the Tremola has 26 side roads; a stage has at least one a kilometre where the probe reads them)
    const roadsLeast = (option('world') || 'tremola') === 'tremola' ? 20 : 1;
    if (!(junctions.roads >= roadsLeast)) failures.push(`world-junctions: only ${junctions.roads} side roads were read`);
    const says = { steps: 'side roads with a step in their surface', holes: 'side roads with a hole in their surface', sunk: 'side roads with land over their surface', decks: 'side roads with a deck or parapet in their mouth', open: 'side roads whose edge hangs open in their mouth', walls: 'side roads with a wall of the ride drawn across their mouth', blocked: 'side roads whose mouth the physics shuts with the ride\'s wall', cliffs: 'side roads with a face of laid ground beside the other road in their mouth', strips: 'side roads with land, laid ground or the ride\'s verge drawn over them in their mouth', pits: 'side roads with a gap under the line between them and the ride beside them', clefts: 'side roads with a narrow gap open to the land between them and the ride beside them' };
    // (the new legs' open faults are their stage's debt: tests/helpers/world-junctions.js JUNCTION_OPEN)
    const JUNCTION_LIMITS = junctionLimits(option('world') || 'tremola');
    for (const [kind, text] of Object.entries(says)) {
        if (junctions[kind].count > JUNCTION_LIMITS[kind]) failures.push(`world-junctions: ${junctions[kind].count} ${text} (at most ${JUNCTION_LIMITS[kind]}): ${JSON.stringify(junctions[kind].worst.slice(0, 5))}`);
    }
}

// world-tunnels: the land and the tubes of every tunnel and gallery, ride and side road, as drawn in the page
// (tests/helpers/world-tunnels.js): the bike is put down every --every metres (200) along the stage and every tube near
// it is read. It fails on land in a tube's box, a gap in the ride's floor out to the walls, land over the road in front
// of a portal, or land over the roof behind a portal with nothing drawn to front it (TUNNEL_LIMITS). With --out, three
// views of every portal it found are saved, the frame alone: from the road 28 m out, from 22 m out and 12 m to the side
// and 9 m up, and from 14 m inside looking out (`<tag>-<road>-<x>_<z>-<view>.png`, with an index.json).
//   node tools/terrain-check.mjs world-tunnels --world gotthard-north --gpu [--every 200] [--out <dir> --tag T] [--portals <index.json>] [--eyes s:lat:up:toS:toLat:toUp,...] [--from s --to s]
WORLD_PROBES.push('world-tunnels');
WORLD['world-tunnels'] = async (page) => {
    const every = Number(option('every') || 200);
    // (one call a place, the store kept in the page between them: one call for the whole stage outran the protocol's
    // time on a busy machine; --from and --to read a stretch of the stage only)
    const span = await page.evaluate(() => [game.environment.startS + 1, game.environment.endS]);
    const from = Math.max(span[0], Number(option('from') || 0)), to = Math.min(span[1], Number(option('to') || Infinity));
    for (let s = from; s < to; s += every) {
        await page.evaluate(async (windowSource, placeSource, s, every) => {
            const window = new Function(`return (${windowSource})`)();
            const placeAt = new Function('game', `return (${placeSource})`)(game);
            game.worldLinger = false;
            const store = globalThis.tunnelStore || (globalThis.tunnelStore = {});
            const p = await placeAt(s);
            window({ THREE }, game.environment, store, p, { nearM: Math.max(every, 500) });
        }, tunnelWindow.toString(), placeAt.toString(), s, every);
    }
    const read = await page.evaluate((reportSource) => {
        const report = new Function(`return (${reportSource})`)(), env = game.environment;
        // (each portal with the ride distance it is seen from)
        const out = report(globalThis.tunnelStore || {});
        for (const portal of out.portalList) portal.at = portal.s !== null ? portal.s : env.route.sArray[env.route.project(portal.x, portal.z, null, {}).index];
        return out;
    }, tunnelReport.toString());
    const out = option('out');
    const views = [];
    if (out) {
        mkdirSync(out, { recursive: true });
        await page.addStyleTag({ content: 'body * { visibility: hidden !important; } canvas { visibility: visible !important; }' });
        const tag = option('tag') || 'tunnel';
        // (--portals <index.json>: the portals another run found, so a before and an after picture the same places)
        const portals = option('portals') ? JSON.parse(readFileSync(option('portals'), 'utf8')).portals : read.portalList;
        for (const portal of portals) {
            const [dx, dz] = portal.out, nx = -dz, nz = dx, y = portal.y;
            const eyes = {
                outside: [portal.x + dx * 28, y + 3.5, portal.z + dz * 28, portal.x, y + 3, portal.z],
                oblique: [portal.x + dx * 22 + nx * 12, y + 9, portal.z + dz * 22 + nz * 12, portal.x, y + 3, portal.z],
                inside: [portal.x - dx * 14, y + 2.2, portal.z - dz * 14, portal.x + dx * 10, y + 2, portal.z + dz * 10]
            };
            for (const [name, at] of Object.entries(eyes)) {
                const png = await page.evaluate(junctionEye, placeAt.toString(), { s: Math.max(1, portal.at - (portal.road === 'ride' ? 0 : 0)), at });
                const file = join(out, `${tag}-${portal.road}-${Math.round(portal.x)}_${Math.round(portal.z)}-${name}.png`);
                writeFileSync(file, Buffer.from(png.split(',')[1], 'base64'));
                views.push({ portal: portal.key, run: portal.run, view: name, file });
            }
        }
        // (--eyes s:lat:up:toS:toLat:toUp,...: more views along the ride, in its own metres)
        for (const spec of (option('eyes') ? option('eyes').split(',') : [])) {
            const png = await page.evaluate(junctionEye, placeAt.toString(), spec.split(':').map(Number));
            const file = join(out, `${tag}-eye-${spec.replace(/[:.]/g, '_')}.png`);
            writeFileSync(file, Buffer.from(png.split(',')[1], 'base64'));
            views.push({ eye: spec, file });
        }
        writeFileSync(join(out, 'index.json'), JSON.stringify({ report: { ...read, portalList: undefined }, portals: read.portalList, views }, null, 1));
    }
    return { ...read, views };
};

// world-tube-shots: pictures inside the ride's tunnels and galleries, the frame alone, as a rider sees them: for each
// run the near chase riding up to its first portal (`entry`, 30 m out), in the middle of the run (`chase`), and riding
// out of it (`exit`, 25 m before its last portal), with each --at
// station shot from the chase view too. The bike is ridden in at 18 m/s from 140 m back, so the eye has adapted as a
// rider's would (Graphics.adaptation). --level N holds that graphics level (js/quality.js) for every picture. The files
// are <tag>-<run s>-<view>.png and <tag>-s<s>-chase.png in --out, with <tag>-index.json (each view and the window's
// counts)
//   node tools/terrain-check.mjs world-tube-shots --world gotthard-north --gpu [--at 9100 [--at-only]] [--level 4] [--out <dir>] [--tag T]
const TUBE_SHOTS_OUT = join(process.env.HOME || '.', 'Library/Caches/twisty-world/tunnel-shots');
WORLD_PROBES.push('world-tube-shots');
WORLD['world-tube-shots'] = async (page) => {
    const out = option('out') || TUBE_SHOTS_OUT;
    mkdirSync(out, { recursive: true });
    const tag = option('tag') || 'tube';
    await page.addStyleTag({ content: 'body * { visibility: hidden !important; } canvas { visibility: visible !important; }' });
    const level = option('level') !== undefined ? Number(option('level')) : null;
    const runs = await page.evaluate(() => {
        const route = game.environment.route;
        return [...route.ranges('tunnel').map(r => ({ ...r, kind: 'tunnel' })), ...route.ranges('gallery').map(r => ({ ...r, kind: 'gallery' }))].sort((a, b) => a.s0 - b.s0);
    });
    const views = [];
    // (--at-only: the --at stations alone)
    for (const run of flag('at-only') ? [] : runs) {
        const mid = run.s0 + Math.min((run.s1 - run.s0) / 2, 200);
        views.push({ run, s: Math.max(10, run.s0 - 30), mode: 'near', name: `${Math.round(run.s0)}-entry` });
        views.push({ run, s: mid, mode: 'near', name: `${Math.round(run.s0)}-chase` });
        views.push({ run, s: Math.max(run.s0 + 5, run.s1 - 25), mode: 'near', name: `${Math.round(run.s0)}-exit` });
    }
    for (const s of (option('at') ? option('at').split(',').map(Number) : [])) views.push({ run: null, s, mode: 'near', name: `s${s}-chase` });
    const index = [];
    for (const view of views) {
        const at = await page.evaluate(async (placeSource, pilotSource, countSource, view, level) => {
            const placeAt = new Function('game', `return (${placeSource})`)(game);
            const v = game.vehicle;
            if (level !== null && game.quality) game.quality.fix(level);
            game.setCameraView(view.mode);
            await placeAt(Math.max(10, view.s - 140));
            game.worldCamera.reset(v.yawAngle);
            new Function('game', 'cruise', `return (${pilotSource})(game, cruise)`)(game, 18);
            let ticks = 0;
            while (v.routeS < view.s && !v.crashed && ticks < 3600) { twistyDev.step(1); ticks++; }
            game.environment.streamer.pump(Infinity);
            if (typeof Effects !== 'undefined' && game.effectLevels) { Effects.frame(game); game.graphics.easeEffects(10); }
            twistyDev.step(1, { render: true });
            const counts = new Function(`return (${countSource})`)()();
            return { s: Math.round(v.routeS), crashed: v.crashed, level: game.quality ? game.quality.level : null, adapt: game.graphics.adaptation ?? null, counts };
        }, placeAt.toString(), pilotWorld.toString(), countScene.toString(), view, level);
        const file = join(out, `${tag}-${view.name}.png`);
        await page.screenshot({ path: file });
        index.push({ ...view, file, ...at });
    }
    writeFileSync(join(out, `${tag}-index.json`), JSON.stringify(index, null, 1));
    return { shots: index.length, index: index.map(e => ({ name: e.name, s: e.s, crashed: e.crashed, level: e.level, adapt: e.adapt, ...e.counts })) };
};

function tunnelChecks(results, failures) {
    const found = results['world-tunnels'];
    if (!found) return;
    const says = { inside: 'places with land inside a tube', floor: 'places of the ride\'s tube floor with nothing drawn', mouth: 'places with land over the road in front of a portal', face: 'places with land over the roof behind a portal unfronted in its plane' };
    for (const [kind, text] of Object.entries(says)) {
        if (found[kind] > TUNNEL_LIMITS[kind]) failures.push(`world-tunnels: ${found[kind]} ${text} (at most ${TUNNEL_LIMITS[kind]}): ${JSON.stringify(found.list.filter(r => r[kind] > 0).slice(0, 4).map(r => ({ key: r.key, [kind]: r[kind], worst: r.worst[kind] })))}`);
    }
}

// world-stones: the marker stones as they are drawn, in the page. The bike is put down every --every metres (200 by
// default) and every stone drawn within STONE_NEAR_M of it, where the land is at full detail, is cast on against the
// drawn ground (the tiles, the roads and the ground of the edge works; a wall, a deck or a parapet is a structure).
// A stone seated on the coping of a wall (stone drawn under it at its seat) is a wall's stone. It fails on a stone
// with a corner of its foot over the drawn ground or its top under it; a stone that is neither on a wall, nor at a
// sharp drop drawn on its own side (Scenery.STONE_RULE: dropM within reachM of the verge, less STONE_DROP_TOL_M), nor
// on the outside of a hairpin (within STONE_HAIRPIN_M of a hairpin of worldHairpins, where the road turns
// STONE_BEND_DEG or more inside STONE_BEND_M); a stone on a hairpin with no drop of hairpinDropM behind it (less the
// same tolerance); a stone on the inside of a hairpin; a stone off a wall with a wall or a parapet drawn at its edge; a
// stone on a wall with a parapet drawn beside it, a corner of its foot off the coping, or a wall under it that is not
// low (the drawn land in front of its face wallMaxM or more under its coping, less the tolerance); a piece of kerb with its foot
// over the drawn ground or away from every hairpin (the kerb is a hairpin's row's only); a ride on which no stone was
// seen and a ride with no row at a hairpin. It reports the stones by case and how many hairpins of the game's list
// have a row.
//   node tools/terrain-check.mjs world-stones --world tremola --gpu [--every 200]
const STONE_NEAR_M = 160;
const STONE_FLOAT_M = 0.05;
const STONE_DROP_TOL_M = 0.3;
const STONE_HAIRPIN_M = 45;
const STONE_BEND_M = 40;
const STONE_BEND_DEG = 20;
WORLD_PROBES.push('world-stones');
WORLD['world-stones'] = page => page.evaluate(async (placeSource, hairpinSource, every, nearM, floatM, tolM, hairpinM, bendM, bendDeg) => {
    const placeAt = new Function('game', `return (${placeSource})`)(game);
    const env = game.environment, route = env.route, rule = Scenery.STONE_RULE;
    const apexes = new Function(`return (${hairpinSource})`)()(route);
    // How far the road turns round s, in pieces (a hairpin turns more than half a circle inside the span)
    const turnAt = s => { let turn = 0; for (let d = -bendM / 2; d < bendM / 2; d += 4) turn += route.headingChange(s + d, s + d + 4); return turn; };
    const kerbs = new Map(), K = Scenery.KERB;
    game.worldLinger = false;
    const raycaster = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
    const structure = h => h.object.name === 'road-works' && (h.face.materialIndex === 1 || h.face.materialIndex === 2 || h.face.materialIndex >= 4);
    const drawn = [env.tileGroup, env.roadGroup, env.sideGroup];
    const hits = (x, z, from) => { raycaster.set(new THREE.Vector3(x, from, z), down); return raycaster.intersectObjects(drawn, true); };
    const groundY = (x, z, from) => { const hit = hits(x, z, from).find(h => !structure(h)); return hit ? hit.point.y : null; };
    const seen = new Map();
    const matrix = new THREE.Matrix4(), world = new THREE.Matrix4(), v = new THREE.Vector3();
    let places = 0;
    for (let s0 = Math.min(every / 2, route.length / 2); s0 < route.length; s0 += every) {
        const bike = await placeAt(s0);
        env.streamer.pump(Infinity);
        env.group.updateMatrixWorld(true);
        places++;
        env.sceneryGroup.traverse(o => {
            if (!o.isInstancedMesh || o.name !== 'stones') return;
            if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
            const box = o.geometry.boundingBox;
            for (let i = 0; i < o.count; i++) {
                o.getMatrixAt(i, matrix);
                world.multiplyMatrices(o.matrixWorld, matrix);
                const at = v.set(0, 0, 0).applyMatrix4(world).clone();
                const key = `${at.x.toFixed(2)},${at.z.toFixed(2)}`;
                if (seen.has(key) || Math.hypot(at.x - bike.x, at.z - bike.z) > nearM) continue;
                const stone = { x: Math.round(at.x * 10) / 10, z: Math.round(at.z * 10) / 10 };
                seen.set(key, stone);
                const top = v.set(0, box.max.y, 0).applyMatrix4(world).y;
                // The foot: its four corners, each against the drawn ground under it
                let over = -Infinity;
                for (const [cx, cz] of [[box.min.x, box.min.z], [box.max.x, box.min.z], [box.max.x, box.max.z], [box.min.x, box.max.z]]) {
                    v.set(cx, box.min.y, cz).applyMatrix4(world);
                    const y = groundY(v.x, v.z, top + 3);
                    over = Math.max(over, y === null ? Infinity : v.y - y);
                }
                const middle = groundY(at.x, at.z, top + 3);
                // On a wall's coping: stone drawn under each corner of its foot at its seat (its matrix stands STONE_SINK_M
                // under the seat)
                const seat = at.y + Scenery.STONE_SINK_M;
                const coping = (x, z) => hits(x, z, top + 3).some(h => structure(h) && Math.abs(h.point.y - seat) < 0.08);
                stone.wall = coping(at.x, at.z) || undefined;
                if (stone.wall) {
                    const corners = [[box.min.x, box.min.z], [box.max.x, box.min.z], [box.max.x, box.max.z], [box.min.x, box.max.z]].map(([cx, cz]) => v.set(cx, 0, cz).applyMatrix4(world).clone());
                    if (!corners.every(c => coping(c.x, c.z))) stone.offTop = true;
                    // (a parapet beside it: stone drawn a metre about it higher than the stone's own seat)
                    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (hits(at.x + dx, at.z + dz, top + 3).some(h => structure(h) && h.point.y > seat + 0.4)) stone.railed = true;
                    seen.set(key, stone);
                    const own = route.project(at.x, at.z, null, {}), p = route.sample(own.s, {}), side = Math.sign(own.lateral);
                    stone.s = Math.round(own.s);
                    // (a low wall: the land drawn a metre in front of its face lies less than wallMaxM under the road)
                    const front = groundY(at.x + side * Math.cos(p.heading) * 1, at.z - side * Math.sin(p.heading) * 1, top + 3);
                    stone.wallDrop = front === null ? null : Math.round((seat - RoadMesh.COPING_UP_M - front) * 100) / 100;
                    if (!(stone.wallDrop < rule.wallMaxM + tolM)) stone.wallHigh = stone.wallDrop;
                    continue;
                }
                if (over > floatM) stone.floats = over === Infinity ? 'no ground drawn under it' : Math.round(over * 100) / 100;
                if (middle !== null && top <= middle) stone.buried = Math.round((middle - top) * 100) / 100;
                // Its own road, the side it stands on, and the drawn ground reachM past the verge there
                const own = route.project(at.x, at.z, null, {});
                const p = route.sample(own.s, {});
                const side = Math.sign(own.lateral), edge = p.width / 2 + RoadSurface.VERGE_M;
                stone.s = Math.round(own.s);
                stone.side = side;
                const out = d => [p.x + side * (edge + d) * Math.cos(p.heading), p.z - side * (edge + d) * Math.sin(p.heading)];
                const far = groundY(...out(rule.reachM), p.y + 3);
                stone.drop = far === null ? null : Math.round((p.y - far) * 100) / 100;
                // Its case: on a hairpin where the road bends (then on the outside of it), or at a sharp drop
                const turn = turnAt(own.s);
                stone.hairpin = apexes.some(a => Math.abs(a - own.s) <= hairpinM) && Math.abs(turn) >= bendDeg * Math.PI / 180;
                if (stone.hairpin && side !== -Math.sign(turn)) stone.inside = true;
                if (!stone.hairpin && !(stone.drop > rule.dropM - tolM)) stone.flat = true;
                // (a hairpin's row guards a drop, as a stretch does: the land falls away behind it)
                if (stone.hairpin && !(stone.drop > rule.hairpinDropM - tolM)) stone.noEdge = true;
                // A wall, a deck or a parapet drawn at its edge, from a metre in from the verge's edge to a metre out
                for (let d = -1; d <= 1; d += 0.25) if (hits(...out(d), p.y + 3).some(h => structure(h) && h.point.y > p.y - 1.5)) stone.guarded = true;
            }
        });
        // The kerb under the rows: the foot of each piece, at its ends and its middle, against the drawn ground
        env.sceneryGroup.traverse(o => {
            // (the kerb course of the granite style; the rails of the other styles carry no root to measure)
            if (!o.isInstancedMesh || o.name !== 'stone-kerbs' || (o.userData.link && o.userData.link !== 'kerb')) return;
            for (let i = 0; i < o.count; i++) {
                o.getMatrixAt(i, matrix);
                world.multiplyMatrices(o.matrixWorld, matrix);
                const at = v.set(0, 0, 0).applyMatrix4(world).clone();
                const key = `${at.x.toFixed(2)},${at.z.toFixed(2)}`;
                if (kerbs.has(key) || Math.hypot(at.x - bike.x, at.z - bike.z) > nearM) continue;
                const kerb = { x: Math.round(at.x * 10) / 10, z: Math.round(at.z * 10) / 10 };
                kerbs.set(key, kerb);
                let over = -Infinity;
                for (const along of [-0.5, 0, 0.5]) {
                    v.set(0, -K.rootM, along).applyMatrix4(world);
                    const y = groundY(v.x, v.z, v.y + K.rootM + 3);
                    over = Math.max(over, y === null ? Infinity : v.y - y);
                }
                if (over > 0) kerb.floats = over === Infinity ? 'no ground drawn under it' : Math.round(over * 100) / 100;
                // A piece of kerb is a granite row's (EdgeStyles: on a drop or round a hairpin): its middle is between two
                // granite stones of the scenery's sites
                const along = route.project(at.x, at.z, null, {}).s;
                let granite = false;
                for (const held of env.scenery.perTile.values()) for (const q of held.stoneSites || []) if (q.link === 'kerb' && q.next && Math.hypot((q.x + q.next.x) / 2 - at.x, (q.z + q.next.z) / 2 - at.z) < 0.2) granite = true;
                if (!granite) kerb.stray = Math.round(along);
            }
        });
    }
    const stones = [...seen.values()];
    const pick = (key, list = stones) => list.filter(t => t[key] !== undefined).slice(0, 12);
    const atWall = stones.filter(t => t.wall), atDrop = stones.filter(t => !t.hairpin && !t.wall), atHairpin = stones.filter(t => t.hairpin && !t.wall);
    const drops = atDrop.map(t => t.drop).filter(Number.isFinite).sort((a, b) => a - b);
    // The hairpins of the game's own list (WorldRoute.hairpins) with a stone on their arc
    const list = route.hairpins();
    const withRow = list.filter(h => atHairpin.some(t => t.s >= h.s0 - 3 && t.s <= h.s1 + 3));
    return {
        places, stones: stones.length, atDrops: atDrop.length, atHairpins: atHairpin.length, atWalls: atWall.length, kerbs: kerbs.size,
        hairpins: list.length, hairpinsWithRow: withRow.length, hairpinsWithout: list.filter(h => !withRow.includes(h)).map(h => Math.round(h.apex)),
        dropM: rule.dropM, hairpinDropM: rule.hairpinDropM, wallMaxM: rule.wallMaxM, reachM: rule.reachM, leastDrop: drops[0] ?? null, medianDrop: drops[Math.floor(drops.length / 2)] ?? null,
        floats: pick('floats'), buried: pick('buried'), flat: pick('flat'), noEdge: pick('noEdge'), leastHairpinDrop: atHairpin.map(t => t.drop).filter(Number.isFinite).sort((a, b) => a - b)[0] ?? null, inside: pick('inside'), guarded: pick('guarded'), offTop: pick('offTop'), railed: pick('railed'), wallHigh: pick('wallHigh'), kerbFloats: pick('floats', [...kerbs.values()]), kerbStray: pick('stray', [...kerbs.values()])
    };
}, placeAt.toString(), worldHairpins.toString(), Number(option('every') || 200), STONE_NEAR_M, STONE_FLOAT_M, STONE_DROP_TOL_M, STONE_HAIRPIN_M, STONE_BEND_M, STONE_BEND_DEG);

function stoneChecks(results, failures) {
    const stones = results['world-stones'];
    if (!stones) return;
    if (!(stones.stones > 0)) failures.push(`world-stones: no marker stone was seen at ${stones.places} places`);
    if (stones.hairpins > 0 && !(stones.hairpinsWithRow > 0)) failures.push(`world-stones: no row of stones at any of the ${stones.hairpins} hairpins`);
    const says = { floats: 'stones with a corner over the drawn ground', buried: 'stones under the drawn ground', flat: `stones off every hairpin with no drop of ${stones.dropM} m drawn within ${stones.reachM} m on their side`, noEdge: `stones on a hairpin with no drop of ${stones.hairpinDropM} m drawn within ${stones.reachM} m behind them`, inside: 'stones on the inside of a hairpin', guarded: 'stones off a wall where a wall or a parapet is drawn at the edge', offTop: 'stones on a wall with a corner off its coping', railed: 'stones on a wall with a parapet', wallHigh: `stones on a wall that drops ${stones.wallMaxM} m or more`, kerbFloats: 'pieces of kerb with their foot over the drawn ground', kerbStray: 'pieces of kerb not between two granite stones of a row' };
    for (const [kind, text] of Object.entries(says)) if (stones[kind].length) failures.push(`world-stones: ${text}: ${JSON.stringify(stones[kind])}`);
}

// world-camera-walls: nothing drawn stands between the chase camera and the bike. The world pilot rides every
// hairpin (from CAMWALL_BEFORE_M before its apex to CAMWALL_AFTER_M past it) in the near and the far chase, and on
// every frame a ray is cast from the camera to the bike and back (a face seen from behind counts too) at the meshes
// drawn: the road works (retaining walls, parapets, decks, aprons), the land's tiles, the houses and the roads'
// ribbons. It fails when one is met before the bike. It also casts along the four corners of the view's near plane
// (`clipped`: a face that near is cut open by the near plane, the camera in a wall) and fails on those at a wall, a
// house or the land.
// --lane M rides M metres off the centre line, --swing K and --far K multiply the camera's swing and its boom as the
// tuning rows camSwing and camDistance do, --apex s,s rides only the hairpins nearest those, and --off rides with
// the rule switched off (the camera is given no wall faces), for the count before it.
// --shots s,s,s --out <dir> takes two pictures at the hairpin nearest each s, in the mode and with the multipliers
// given (the first of --modes): the worst frame of the ride with the rule off (<dir>/before) and the same tick of
// the same ride with it on (<dir>/after). The bike's ride does not read the camera, so the two show one moment.
//   node tools/terrain-check.mjs world-camera-walls --world tremola --gpu
const CAMWALL_BEFORE_M = 90;
const CAMWALL_AFTER_M = 60;
// (in the page) One hairpin ridden in one mode: {frames, ticks, works, land, house, road, clipped, worst}. With `until`
// it stops at that tick and draws the frame
async function camWallRide(placeSource, pilotSource, apex, mode, setup, beforeM, afterM, until) {
    const placeAt = new Function('game', `return (${placeSource})`)(game);
    const env = game.environment, v = game.vehicle, cam = game.camera;
    twistyDev.freeze();
    game.setCameraView(mode);
    const linger = game.worldLinger;
    game.worldLinger = false;
    // (a crash in the ride before is not carried into this one: placeAt leaves `crashed` as it was)
    if (v.crashed) v.reset();
    await placeAt(apex - beforeM);
    game.worldLinger = linger;
    v.speed = 6;
    // The rule off: the camera is given no faces. The tuning rows' multipliers go in where Game applies them
    if (!game.camWallFaces) game.camWallFaces = game.worldCamera.faces;
    game.worldCamera.faces = setup.off ? null : game.camWallFaces;
    game.worldCamera.reset(v.yawAngle);
    if (!game.camWallInput) game.camWallInput = game.worldCameraInput;
    game.worldCameraInput = (...args) => {
        const input = game.camWallInput.apply(game, args);
        input.offset.y *= setup.far; input.offset.z *= setup.far;
        input.swing.x *= setup.swing; input.swing.look *= setup.swing;
        return input;
    };
    twistyDev.autopilot({ speed: 20, lane: setup.lane });
    // The shake is random on purpose: held at zero, so two rides of one hairpin are the same ride
    const update = game.updateCamera.bind(game);
    game.updateCamera = (...args) => {
        const random = Math.random;
        Math.random = () => 0.5;
        try { return update(...args); } finally { Math.random = random; }
    };
    const ray = new THREE.Raycaster();
    const from = new THREE.Vector3(), to = new THREE.Vector3(), dir = new THREE.Vector3(), corner = new THREE.Vector3();
    const targets = [];
    const collect = () => {
        targets.length = 0;
        const take = (kind, o) => { if (o.isMesh && o.visible) { o.userData.camWall = kind; targets.push(o); } };
        for (const group of [env.roadGroup, env.sideGroup]) if (group) group.traverse(o => take(o.name === 'road-ribbon' || o.name === 'road-side' ? 'road' : 'works', o));
        for (const held of env.tileMeshes.values()) take('land', held.mesh);
        env.scenery.houseGroup.traverse(o => { if (String(o.name).startsWith('houses:')) take('house', o); });
    };
    // The first thing between a and b, from either side: its kind, or null
    const between = (a, b, short) => {
        const length = a.distanceTo(b) - short;
        if (!(length > 0)) return null;
        let best = null;
        for (const [p, q] of [[a, b], [b, a]]) {
            dir.copy(q).sub(p).normalize();
            ray.set(p, dir);
            ray.near = p === a ? 0 : short;
            ray.far = p === a ? length : length + short;
            const hit = ray.intersectObjects(targets, false)[0];
            if (hit && (!best || (p === a ? hit.distance : length + short - hit.distance) < best.at)) best = { kind: hit.object.userData.camWall, at: p === a ? hit.distance : length + short - hit.distance };
        }
        return best;
    };
    const out = { apex: Math.round(apex), mode, frames: 0, ticks: 0, works: 0, land: 0, house: 0, road: 0, clipped: 0, worst: null, crashed: false };
    let ticks = 0, score = 0;
    try {
        while (v.routeS < apex + afterM && !v.crashed && ticks < 60 * 90 && !(until && ticks >= until)) {
            twistyDev.step(1, until && ticks === until - 1 ? { render: true } : {});
            ticks++;
            if (ticks < 20 || v.routeS < apex - 60) continue;
            if (ticks % 30 === 0 || !targets.length) collect();
            cam.updateMatrixWorld(true);
            from.copy(cam.position);
            to.set(v.position.x, v.position.y + 1, v.position.z);
            out.frames++;
            const block = between(from, to, 0.6);
            if (block) out[block.kind]++;
            // The near plane's corners: anything nearer the camera than they are is cut open
            let cut = null;
            for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
                corner.set(x, y, -1).unproject(cam);
                const near = between(from, corner, 0);
                if (near && near.kind !== 'road') cut = near.kind;
            }
            if (cut) out.clipped++;
            // The worst frame: the camera farthest behind what it crossed
            const depth = (block ? block.at : 0) + (cut ? 0.5 : 0);
            if (depth > score) { score = depth; out.worst = { tick: ticks, s: Math.round(v.routeS * 10) / 10, kind: block ? block.kind : cut, behind: Math.round(depth * 100) / 100 }; }
        }
    } finally {
        game.updateCamera = update;
        game.worldCameraInput = game.camWallInput;
        game.worldCamera.faces = game.camWallFaces;
    }
    out.ticks = ticks;
    out.crashed = v.crashed;
    if (v.crashed) out.cause = String(v.crashCause || v.crashReason || '');
    out.started = Math.round((apex - beforeM) * 10) / 10;
    out.s = Math.round(v.routeS * 10) / 10;
    const c = cam.position;
    out.camera = [c.x - v.position.x, c.y - v.position.y, c.z - v.position.z].map(n => Math.round(n * 100) / 100);
    out.fraction = Math.round((game.worldCamera.fraction ?? 1) * 1000) / 1000;
    out.swingShare = Math.round((game.worldCamera.swingShare ?? 1) * 100) / 100;
    return out;
}
WORLD_PROBES.push('world-camera-walls');
WORLD['world-camera-walls'] = async (page) => {
    const modes = viewsOption('modes', VIEWS);
    const setup = { lane: Number(option('lane') || 0), swing: Number(option('swing') || 1), far: Number(option('far') || 1), off: flag('off') };
    let apexes = await page.evaluate(hairpinSource => new Function(`return (${hairpinSource})`)()(game.environment.route).filter(s => !game.environment.stage || (s >= game.environment.startS && s <= game.environment.endS)), worldHairpins.toString());
    const nearest = s => apexes.reduce((a, b) => (Math.abs(b - s) < Math.abs(a - s) ? b : a));
    const ride = (apex, mode, how, until = 0) => page.evaluate(camWallRide, placeAt.toString(), pilotWorld.toString(), apex, mode, how, CAMWALL_BEFORE_M, CAMWALL_AFTER_M, until);
    const shots = option('shots');
    if (shots) {
        const out = option('out');
        if (!out) return { error: 'name a folder with --out <dir>' };
        for (const dir of ['before', 'after']) mkdirSync(join(out, dir), { recursive: true });
        const files = [];
        for (const s of shots.split(',').map(Number)) {
            const apex = nearest(s), mode = modes[0];
            const scan = await ride(apex, mode, { ...setup, off: true });
            // With nothing crossed, the frame at the apex
            const tick = scan.worst ? scan.worst.tick : Math.round(scan.ticks * CAMWALL_BEFORE_M / (CAMWALL_BEFORE_M + CAMWALL_AFTER_M));
            const pair = { apex: Math.round(apex), mode, tick, worst: scan.worst };
            for (const [dir, off] of [['before', true], ['after', false]]) {
                const at = await ride(apex, mode, { ...setup, off }, tick);
                const file = join(out, dir, `apex-${Math.round(apex)}-mode-${mode}.png`);
                await page.screenshot({ path: file });
                pair[dir] = { file, s: at.s, camera: at.camera, fraction: at.fraction, swingShare: at.swingShare };
            }
            files.push(pair);
        }
        return { setup, files };
    }
    if (option('apex')) apexes = [...new Set(option('apex').split(',').map(Number).map(nearest))];
    const rides = [];
    for (const mode of modes) for (const apex of apexes) rides.push(await ride(apex, mode, setup));
    const sum = key => rides.reduce((n, r) => n + r[key], 0);
    const bad = rides.filter(r => r.works + r.land + r.house + r.road + r.clipped > 0);
    return { setup, modes, hairpins: apexes.length, rides: rides.length, frames: sum('frames'), works: sum('works'), land: sum('land'), house: sum('house'), road: sum('road'), clipped: sum('clipped'), crashed: rides.filter(r => r.crashed).map(r => [r.apex, r.mode, r.s, r.cause]), short: rides.filter(r => !(r.frames > 100)).map(r => [r.apex, r.mode]), bad: bad.map(r => ({ apex: r.apex, mode: r.mode, frames: r.frames, works: r.works, land: r.land, house: r.house, road: r.road, clipped: r.clipped, worst: r.worst })) };
};

// world-fall-shots: the rider's fall of each kind (Vehicle.RIDER_FALLS) at three speeds, three moments each, from a
// camera beside him. The bike is put down on a straight, given the speed and a lean, and crashed with the kind's
// cause class; a front hit has a thing 2.5 m ahead (blockRider, hitFrom; it is not drawn). Each picture is the frame
// alone (no HUD), from the side he falls to, looking between him and the bike. --out <dir> saves the PNG files
//   node tools/terrain-check.mjs world-fall-shots --world tremola --gpu --out <dir> [--at s] [--speeds 6,14,28] [--moments 0.15,0.5,1.2] [--tag T]
const FALL_SHOTS = {
    at: 900,
    speeds: [6, 14, 28],
    moments: [0.15, 0.5, 1.2],
    // kind: [cause class, the bike's lean in rad, how the bike is drawn going down]
    kinds: { lowside: ['grip', 0.6, 'lowside'], highside: ['rear', 0.35, null], front: ['wall', 0.05, null], drop: ['drop', 0.3, null], tip: ['stall', 0.4, 'tip'] }
};
async function fallShot(placeSource, at, kind, cls, lean, fall, speed, moments) {
    const placeAt = new Function('game', `return (${placeSource})`)(game);
    const v = game.vehicle;
    game.setCameraView('near');
    game.worldLinger = false;
    if (v.crashed) v.reset();
    // Each fall is a crash of its own: the last one's clock (Game.updateWorldCrash) would restart this one early
    game.worldCrash = null;
    game.worldSinceRestartS = Infinity;
    await placeAt(at);
    game.worldCamera.reset(v.yawAngle);
    twistyDev.autopilot({ speed: 0 });
    twistyDev.step(1);
    game.environment.streamer.pump(Infinity);
    const sin = Math.sin(v.yawAngle), cos = Math.cos(v.yawAngle);
    v.speed = speed;
    v.rodeSpeed = speed;
    v.rodeYaw = v.yawAngle;
    v.velocity.set(sin * speed, 0, cos * speed);
    v.leanAngle = lean;
    v.updateMesh();
    if (kind === 'front') {
        v.blockRider(v.position.x + sin * 2.5, v.position.z + cos * 2.5, 1);
        v.hitFrom(-sin, -cos);
    }
    v.worldCrash('Probe', fall, cls);
    const shots = [];
    let t = 0;
    const rider = new THREE.Vector3();
    for (const moment of moments) {
        while (t < moment - 1e-9) { twistyDev.step(1); t += 1 / 60; }
        twistyDev.step(1, { render: true });
        t += 1 / 60;
        v.group.updateMatrixWorld(true);
        v.rider.getWorldPosition(rider);
        // On the side he falls to (the low side; a highside's the high side), a little back and up, looking between
        // him and the bike, and further off the further apart they are
        const rf = v.riderFall, side = (rf ? rf.low : 1) * (kind === 'highside' ? -1 : 1);
        const mx = (rider.x + v.position.x) / 2, my = (rider.y + v.position.y) / 2 + 0.3, mz = (rider.z + v.position.z) / 2;
        const off = 4.5 + 0.6 * Math.hypot(rider.x - v.position.x, rider.z - v.position.z);
        const cam = game.camera;
        cam.position.set(mx + cos * side * off - sin * 1.5, my + 1.4, mz - sin * side * off - cos * 1.5);
        cam.lookAt(mx, my, mz);
        cam.updateMatrixWorld(true);
        game.graphics.render(game.scene, cam);
        shots.push({ t: Math.round(t * 100) / 100, png: game.graphics.renderer.domElement.toDataURL('image/png'), row: rf && rf.row, kind: rf && rf.kind, rider: [rider.x - v.position.x, rider.y - v.position.y, rider.z - v.position.z].map(n => Math.round(n * 100) / 100) });
    }
    v.reset();
    return shots;
}
WORLD_PROBES.push('world-fall-shots');
WORLD['world-fall-shots'] = async (page) => {
    const out = option('out');
    if (!out) return { error: 'name a folder with --out <dir>' };
    mkdirSync(out, { recursive: true });
    const tag = option('tag') || 'fall';
    const at = Number(option('at') || FALL_SHOTS.at);
    const speeds = option('speeds') ? option('speeds').split(',').map(Number) : FALL_SHOTS.speeds;
    const moments = option('moments') ? option('moments').split(',').map(Number) : FALL_SHOTS.moments;
    const files = [];
    for (const [kind, [cls, lean, fall]] of Object.entries(FALL_SHOTS.kinds)) {
        for (const speed of speeds) {
            const shots = await page.evaluate(fallShot, placeAt.toString(), at, kind, cls, lean, fall, speed, moments);
            shots.forEach((shot, i) => {
                const file = join(out, `${tag}-${kind}-${speed}-${i + 1}.png`);
                writeFileSync(file, Buffer.from(shot.png.split(',')[1], 'base64'));
                files.push({ kind, speed, t: shot.t, row: shot.row, rider: shot.rider, file });
            });
        }
    }
    return { files };
};

// world-group-shots: the group ride (CrewGroup, .agent/system/group.md) in pictures (a straight also from high behind the
// line, for the riders' stagger): the crew at the start, in line on a
// straight, round a hairpin (from the chase view and from above), and waiting in a stopping place for a player who
// stopped (from the chase view and from across the road). Each picture comes with where each rider is and what it does.
//   node tools/terrain-check.mjs world-group-shots --world tremola --gpu [--out <dir>] [--tag <name>]
const GROUP_SHOTS_OUT = join(process.env.HOME || '.', 'Library/Caches/twisty-world/group-shots');
WORLD_PROBES.push('world-group-shots');
WORLD['world-group-shots'] = async (page) => {
    const out = option('out') || GROUP_SHOTS_OUT;
    mkdirSync(out, { recursive: true });
    const tag = option('tag') || 'group';
    const files = [];
    const save = (name, png) => {
        const file = join(out, `${tag}-${name}.png`);
        writeFileSync(file, Buffer.from(png.split(',')[1], 'base64'));
        return file;
    };
    const shoot = async (name) => {
        const file = join(out, `${tag}-${name}.png`);
        await page.screenshot({ path: file });
        return file;
    };
    // The start, as the ride begins
    const start = await page.evaluate(groupScene, placeAt.toString(), 'start');
    files.push({ shot: 'start', file: await shoot('start'), ...start });
    for (const kind of ['straight', 'hairpin', 'waiting']) {
        const info = await page.evaluate(groupScene, placeAt.toString(), kind);
        files.push({ shot: kind, file: await shoot(kind), ...info });
        {
            const view = await page.evaluate(groupEye, kind);
            files.push({ shot: `${kind}-view`, file: save(`${kind}-view`, view.png), eye: view.eye });
        }
    }
    return { out, files };
};

// In the page: the crew put in line by place before the bike (or, for 'start', the ride as it begins), ridden on with the
// autopilot, and the frame drawn. Returns where each rider is and what it does
async function groupScene(placeSource, kind) {
    const placeAt = new Function('game', `return (${placeSource})`)(game);
    const env = game.environment, route = env.route, traffic = game.traffic, group = traffic.group;
    const v = game.vehicle;
    const sOf = b => route.fromUnits(b.currentSegment + b.segmentProgress);
    const put = (bike, s) => {
        const u = route.toUnits(s);
        bike.currentSegment = Math.floor(u);
        bike.segmentProgress = u - Math.floor(u);
        bike.laneMoving = false;
        if (group && bike.ride) group.placed(bike.ride);
        bike.updatePosition();
    };
    const byPlace = () => traffic.motorcycles.slice().sort((a, b) => a.character.place - b.character.place);
    const settle = () => { if (group) { group.halted = group.standing = false; group.stoppedS = 0; } };
    game.setCameraView('near');
    let note = null;
    if (kind === 'start') {
        twistyDev.autopilot({ speed: 0 });
        for (let i = 0; i < 90; i++) twistyDev.step(1);
    } else if (kind === 'straight') {
        let s0 = 2400;
        while (s0 < route.length - 400 && !(group && group.straight(s0, 220))) s0 += 10;
        await placeAt(s0);
        game.worldCamera.reset(v.yawAngle);
        settle();
        byPlace().forEach((bike, k) => put(bike, s0 + 70 - k * 13));
        twistyDev.autopilot({ speed: 14 });
        // (long enough for the riders to take their stagger: GROUP.road)
        for (let i = 0; i < 360; i++) twistyDev.step(1);
        note = { straightFrom: s0 };
        const ahead = byPlace().map(sOf);
        window.groupEyeAt = { s: Math.min(...ahead), front: Math.max(...ahead) };
    } else if (kind === 'hairpin') {
        const h = route.hairpins().find(p => p.s0 > 2200) || route.hairpins()[0];
        await placeAt(h.s0 - 150);
        game.worldCamera.reset(v.yawAngle);
        settle();
        byPlace().forEach((bike, k) => put(bike, h.s0 - 70 - k * 12));
        twistyDev.autopilot({ speed: 12 });
        let ticks = 0;
        while (sOf(byPlace()[0]) < h.apex && ticks < 3600) { twistyDev.step(1); ticks++; }
        note = { hairpin: { s0: Math.round(h.s0), apex: Math.round(h.apex), s1: Math.round(h.s1) } };
        window.groupEyeAt = { s: h.apex };
    } else if (kind === 'waiting') {
        // A stopping place on the riders' own side; the bike stops 250 m before it with the crew just ahead
        const side = Route.keepRight(1);
        const place = env.places.list.find(p => p.side === side && p.s > 3000);
        await placeAt(place.s - 260);
        game.worldCamera.reset(v.yawAngle);
        settle();
        byPlace().forEach((bike, k) => put(bike, place.s - 200 - k * 12));
        // The bike held on its brake: the player has stopped
        twistyDev.autopilot({ speed: 0 });
        game.input.getThrottleInput = () => 0;
        game.input.getBrakeInput = () => 1;
        v.speed = 0;
        let ticks = 0;
        while (traffic.motorcycles.some(b => b.ride.state !== 'wait') && ticks < 60 * 180) { twistyDev.step(1); ticks++; }
        // The bike put down just short of the place, still standing: the riders wait on
        await placeAt(place.s - 30);
        game.worldCamera.reset(v.yawAngle);
        for (let i = 0; i < 60; i++) twistyDev.step(1);
        note = { place: { id: place.id, s: place.s, length: place.length, side: place.side, kind: place.kind }, waitedS: Math.round(ticks / 60), halted: group.halted };
        window.groupEyeAt = { s: place.s + place.length / 2, place };
    }
    env.streamer.pump(Infinity);
    twistyDev.step(1, { render: true });
    const riders = traffic.motorcycles.map(b => {
        const g = b.bikeGroup.position, p = route.project(g.x, g.z, null, {});
        return { place: b.character.place, s: Math.round(sOf(b) * 10) / 10, state: b.ride ? b.ride.state : null, speed: Math.round(b.currentSpeed * 10) / 10, lateral: Math.round(p.lateral * 100) / 100, half: Math.round(p.width / 2 * 100) / 100, off: b.ride ? Math.round(b.ride.off * 100) / 100 : 0, visible: b.bikeGroup.visible };
    });
    return { kind, playerS: Math.round(v.routeS), note, events: group ? { ...group.events } : null, riders };
}

// In the page: a view of the last scene from a camera of its own, the frame alone (no HUD), as a PNG data URL. 'hairpin'
// from 45 m over the apex; 'waiting' from the far side of the road, across the place
function groupEye(kind) {
    const env = game.environment, route = env.route, at = window.groupEyeAt;
    const p = route.sample(at.s, {});
    const point = (s, lat, up) => { const q = route.sample(s, {}); return new THREE.Vector3(q.x + lat * Math.cos(q.heading), q.y + up, q.z - lat * Math.sin(q.heading)); };
    let eye, look;
    if (kind === 'hairpin') {
        eye = point(at.s - 30, 0, 45);
        look = point(at.s, 0, 0);
    } else if (kind === 'straight') {
        // From high behind the last rider, down the line: the stagger across the lane
        eye = point(at.s - 12, 0, 7);
        look = point(at.s + 30, 0, 0);
    } else {
        const side = at.place.side;
        eye = point(at.s - 22, -side * (p.width / 2 + 3), 3.2);
        look = point(at.s + 4, side * (p.width / 2 + 1.5), 0.6);
    }
    game.camera.position.copy(eye);
    game.camera.lookAt(look);
    game.camera.updateMatrixWorld(true);
    game.graphics.render(game.scene, game.camera);
    return { png: game.graphics.renderer.domElement.toDataURL('image/png'), eye: [eye.x, eye.y, eye.z].map(n => Math.round(n)) };
}

// world-roam: free roam (GameModes, FreeRoam), run with `--query 'mode=roam&debug'`. Checks that the ride is in free
// roam (no run, the guide's rules off, the follow camera), that nothing in the scene is a barrier, that a bike ridden
// off the ride onto the side road that runs furthest from it rides 100 m and more off the ride on that road's own
// surface (never 1 m over or under it), and that a bike put
// inside the edge of the map is turned back to a road. Pictures (`--out <dir>`): the chase at the start, on the side
// road, and the rider screen of a debug page with its game mode row (`roam-menu.png`).
//   node tools/terrain-check.mjs world-roam --world tremola --gpu --query 'mode=roam&debug' [--out <dir>]
async function roamRun(placeSource) {
    const placeAt = new Function('game', `return (${placeSource})`)(game);
    const env = game.environment, v = game.vehicle, out = { shots: {} };
    const frame = () => game.renderer.domElement.toDataURL('image/jpeg', 0.9);
    out.freeRoam = !!game.freeRoam;
    // The group with the player (GROUP.roam): how many ride, and after the ride how they stand
    const crew = () => {
        const tr = game.traffic, route = game.environment.route;
        if (!tr) return null;
        const ps = route.project(v.position.x, v.position.z, null, {}).s;
        const riders = tr.motorcycles.filter(b => b.bikeGroup.visible);
        return { riders: riders.length, roam: !!tr.roam, aheadM: riders.map(b => Math.round(route.fromUnits(b.currentSegment + b.segmentProgress) - ps)), waiting: riders.filter(b => b.ride && (b.ride.state === 'wait' || b.ride.state === 'toWait')).length, halted: !!(tr.group && tr.group.halted) };
    };
    out.crewStart = crew();
    // Discoveries (js/world/discoveries.js): from none (a fresh page's store), and the HUD's line
    const finds = () => game.discoveries ? { line: document.getElementById('hudFinds').textContent, found: [...game.discoveries.found], total: game.discoveries.total } : null;
    out.findsStart = finds();
    window.roamCrew = crew;
    // (where the ride started: --query '...&start=summit' starts it at the summit)
    out.startedAt = { s: Math.round(game.environment.route.project(v.position.x, v.position.z, null, {}).s), start: game.rideMode && game.rideMode.start || 'start' };
    out.guideRoam = !!env.guide.roam;
    out.follow = !!game.worldCamera.followRider;
    const barriers = [];
    game.scene.traverse(o => { if (/barrier/i.test(o.name || '')) barriers.push(o.name); });
    out.barriers = barriers;
    // The near chase: a page starts in the view the rider last chose, the far chase on a fresh one
    game.setCameraView('near');
    for (let i = 0; i < 60; i++) twistyDev.step(1, { render: true });
    out.shots.start = frame();
    // The group on the ride (GROUP.roam): 45 s at 9 m/s on the autopilot. The player leads: no rider ahead of it, and
    // a picture from 14 m ahead of the bike, looking back at the line behind it
    if (out.crewStart && out.crewStart.riders) {
        twistyDev.autopilot({ speed: 9 });
        let most = -Infinity;
        for (let i = 0; i < 60 * 45; i++) {
            twistyDev.step(1, { render: i % 30 === 29 });
            most = Math.max(most, ...crew().aheadM);
        }
        out.crewRide = { ...crew(), mostAhead: most };
        const cam = game.camera, keep = { p: cam.position.clone(), q: cam.quaternion.clone() };
        cam.position.set(v.position.x + 14 * Math.sin(v.yawAngle), v.position.y + 4, v.position.z + 14 * Math.cos(v.yawAngle));
        cam.lookAt(v.position.x - 20 * Math.sin(v.yawAngle), v.position.y, v.position.z - 20 * Math.cos(v.yawAngle));
        // (through the game's own pipeline: its exposure and colour)
        (game.graphics || game.renderer).render(game.scene, cam);
        out.shots.group = frame();
        cam.position.copy(keep.p);
        cam.quaternion.copy(keep.q);
    }
    // The style ride (js/world/style.js): a wheelie on the ride from 4 m/s (a wheelie pops at low speed, the more so on
    // a bike with power to spare: Vehicle.popShare), held up on the throttle 2.5 s, then the front down. A picture in
    // the middle of it, and the wheelie as measured
    if (game.roamStyle) {
        const scoreBefore = game.score;
        // (the probe's rider is on a scooter, which has no power to spare to lift its front: the wheelie is ridden on a
        // superbike's facts, Vehicle.wheelieOf, and the rider's own are put back after)
        const facts = v.wheelieBike;
        v.wheelieBike = Vehicle.wheelieOf('bike13_panigale', v.riderKg);
        twistyDev.autopilot({ speed: 4 });
        for (let i = 0; i < 60 * 4; i++) twistyDev.step(1, { render: false });
        // (the key pops the front; the throttle holds it up: Vehicle.updateWheelie)
        const throttle = game.input.getThrottleInput, brake = game.input.getBrakeInput;
        game.input.getBrakeInput = () => 0;
        let hold = 0;
        game.input.getWheelieInput = () => (hold < 8 ? 1 : 0);
        game.input.getThrottleInput = () => (v.isWheelie ? (v.wheelieAngle > 0.5 ? 0.4 : 1) : 0.5);
        for (; hold < 60 * 2.5; hold++) {
            twistyDev.step(1, { render: hold % 30 === 29 });
            if (hold === 70) out.shots.wheelie = frame();
        }
        game.input.getWheelieInput = () => 0;
        game.input.getThrottleInput = throttle;
        game.input.getBrakeInput = brake;
        v.wheelieBike = facts;
        for (let i = 0; i < 60 * 6 && v.isWheelie; i++) twistyDev.step(1, { render: false });
        twistyDev.step(1, { render: false });
        out.style = { last: game.roamStyle.last, best: game.roamStyle.best, line: document.getElementById('hudStyleBest').textContent, scored: game.score - scoreBefore, crashed: !!v.crashed };
    }
    // Photo mode (js/world/photo.js): opened while riding, the camera taken round to the bike's front left and up, a
    // picture of what it sees, the picture saved (a PNG), then back to the ride
    if (game.openPhoto) {
        for (let i = 0; i < 60; i++) twistyDev.step(1, { render: false });
        game.openPhoto();
        const opened = !!game.photo && game.paused && document.body.classList.contains('photo-mode');
        for (const act of ['left', 'left', 'left', 'left', 'left', 'left', 'left', 'up', 'up', 'closer']) document.querySelector(`#photo-bar [data-photo="${act}"]`).click();
        // (twistyDev.step unpauses the ride for its frame: the paused frame is drawn here as the game draws it)
        game.photo.apply(game.camera);
        game.graphics.render(game.scene, game.camera);
        out.shots.photo = frame();
        const cam = game.camera.position, front = Math.cos(v.yawAngle) * (cam.z - v.position.z) + Math.sin(v.yawAngle) * (cam.x - v.position.x);
        document.querySelector('#photo-bar [data-photo="save"]').click();
        out.photo = { opened, ahead: +front.toFixed(1), saved: game.lastPhoto || null };
        document.querySelector('#photo-bar [data-photo="done"]').click();
        out.photo.back = !game.photo && !game.paused && !document.body.classList.contains('photo-mode');
    }
    // A side road, ridden onto from the ride as a rider would: the junction whose side road runs furthest, the bike put
    // 60 m before it on the ride, steered along the ride and then along the side road (the autopilot rides the ride only)
    const graph = env.graph, route = env.route;
    let pick = null;
    for (const [edgeId, node] of graph.sideStubs()) {
        const junction = graph.junctions.find(j => j.node === node);
        if (!junction || !junction.passes || !junction.passes.length) continue;
        const s = junction.passes[0].sIn;
        if (s < env.startS + 200 || s > env.endS - 200) continue;
        await env.data.ensureChunks(env.data.manifest.chunks.map((_, k) => k));
        const chain = graph.chainFrom(edgeId, node, 600);
        const far = chain.rows.length ? Math.abs(route.project(chain.rows[chain.rows.length - 1].x, chain.rows[chain.rows.length - 1].z, null, {}).lateral) : 0;
        if (!pick || far > pick.far) pick = { edgeId, node, s, rows: chain.rows, far };
    }
    out.side = pick ? { edge: pick.edgeId, s: Math.round(pick.s), far: Math.round(pick.far), rows: pick.rows.length } : null;
    if (pick) {
        await placeAt(Math.max(env.startS + 10, pick.s - 60));
        game.worldCamera.reset(v.yawAngle);
        const path = [];
        for (let d = -60; d <= 0; d += 4) { const p = route.sample(pick.s + d, {}); path.push({ x: p.x, z: p.z }); }
        for (const r of pick.rows) path.push({ x: r.x, z: r.z });
        twistyDev.autopilot({ speed: 0 });
        let near = 0;
        // (slow through the turn off the ride: the junction is the path's sixteenth point)
        const want = () => (near >= 8 && near <= 26 ? 5 : 11);
        game.input.getThrottleInput = () => (v.speed < want() ? 0.5 : 0);
        game.input.getBrakeInput = () => (v.speed > want() + 1.5 ? 0.6 : 0);
        game.input.getSteeringInput = () => {
            let best = near, d = Infinity;
            for (let k = Math.max(0, near - 5); k < Math.min(path.length, near + 30); k++) {
                const e = Math.hypot(path[k].x - v.position.x, path[k].z - v.position.z);
                if (e < d) { d = e; best = k; }
            }
            near = best;
            const t = path[Math.min(path.length - 1, near + 2)];
            let diff = Math.atan2(t.x - v.position.x, t.z - v.position.z) - v.yawAngle;
            diff = Math.atan2(Math.sin(diff), Math.cos(diff));
            // (positive steering turns left, to a greater yaw)
            return Math.max(-1, Math.min(1, diff * 2.5));
        };
        const before = game.restarts || 0;
        let crashed = false, most = 0;
        const trace = [];
        for (let i = 0; i < 60 * 60 && near < path.length - 3; i++) {
            twistyDev.step(1, { render: i % 30 === 29 });
            crashed = crashed || !!v.crashed;
            const off = Math.abs(route.project(v.position.x, v.position.z, null, {}).lateral);
            most = Math.max(most, off);
            if (i % 60 === 0) trace.push([i, +(v.position.y - env.ground.groundY(v.position.x, v.position.z, null)).toFixed(2), +v.speed.toFixed(1), Math.round(off)]);
            if (!out.shots.side && off > 120) {
                for (let k = 0; k < 20; k++) twistyDev.step(1, { render: true });
                out.shots.side = frame();
                // Where the bike is in the frame (-1 to 1 each way; 0 is the middle) and how fast it goes
                const ndc = new THREE.Vector3(v.position.x, v.position.y + 0.8, v.position.z).project(game.camera);
                out.framed = { x: +ndc.x.toFixed(2), y: +ndc.y.toFixed(2), speed: +v.speed.toFixed(1) };
                out.crewSide = crew();
            }
        }
        out.trace = trace;
        out.findsSide = finds();
        // Traffic on the side roads (js/world/sidetraffic.js): the cars out, their distance to the bike, how far each
        // stands over the drawn ground; a picture of the nearest from beside and above it
        const st = game.sideTraffic;
        if (st) {
            const cars = st.cars.map(c => ({ m: Math.round(Math.hypot(c.x - v.position.x, c.z - v.position.z)), over: +(c.group.position.y - 0.32 - env.ground.groundY(c.x, c.z, null)).toFixed(2), speed: +c.speed.toFixed(1) }));
            out.sideCars = { cars, crashedOnCar: v.crashCause === 'Rode into a car' };
            const near = st.cars.slice().sort((a, b) => Math.hypot(a.x - v.position.x, a.z - v.position.z) - Math.hypot(b.x - v.position.x, b.z - v.position.z))[0];
            if (near) {
                const cam = game.camera, keep = { p: cam.position.clone(), q: cam.quaternion.clone() };
                cam.position.set(near.x - 9 * Math.sin(near.heading) + 4 * Math.cos(near.heading), near.group.position.y + 4, near.z - 9 * Math.cos(near.heading) - 4 * Math.sin(near.heading));
                cam.lookAt(near.x, near.group.position.y, near.z);
                (game.graphics || game.renderer).render(game.scene, cam);
                out.shots.sidecar = frame();
                cam.position.copy(keep.p);
                cam.quaternion.copy(keep.q);
            }
        }
        out.sideRide = { furthest: Math.round(most), crashed, restarts: (game.restarts || 0) - before, nan: !Number.isFinite(v.position.x + v.position.y + v.position.z), speed: +v.speed.toFixed(1), moved: Math.round(most) };
        if (!out.shots.side) out.shots.side = frame();
    }
    // The edge of the map: a tile of the detailed land with no tile beside it, a point 25 m inside its open side
    const tiles = new Set(env.data.manifest.tiles.height.map(([a, b]) => `${a},${b}`)), m = WorldData.TILE_M;
    let edge = null;
    for (const [tx, tz] of env.data.manifest.tiles.height) {
        if (!tiles.has(`${tx + 1},${tz}`) && tiles.has(`${tx - 1},${tz}`)) { edge = { x: (tx + 1) * m - 25, z: (tz + 0.5) * m }; break; }
    }
    if (edge) {
        const roadBefore = { x: v.position.x, z: v.position.z };
        const keep = { x: v.position.x, y: v.position.y, z: v.position.z, yaw: v.yawAngle };
        v.reset();
        v.yawAngle = keep.yaw;
        v.position.set(edge.x, env.ground.groundY(edge.x, edge.z, null), edge.z);
        v.speed = 5;
        for (let i = 0; i < 3; i++) twistyDev.step(1);
        out.edge = { at: [Math.round(edge.x), Math.round(edge.z)], putBack: Math.round(Math.hypot(v.position.x - edge.x, v.position.z - edge.z)), zone: game.roam ? game.roam.zone : null, nearRoad: Math.round(Math.hypot(v.position.x - roadBefore.x, v.position.z - roadBefore.z)) };
    }
    return out;
}
WORLD_PROBES.push('world-roam');
WORLD['world-roam'] = async (page) => {
    await page.addStyleTag({ content: '.hud-keys { display: none !important; }' });
    const result = await page.evaluate(roamRun, placeAt.toString());
    const dir = option('out') || join(process.env.HOME || '.', 'Library/Caches/twisty-world/roam-shots');
    mkdirSync(dir, { recursive: true });
    for (const [k, data] of Object.entries(result.shots)) writeFileSync(join(dir, `roam-${k}.jpg`), Buffer.from(data.split(',')[1], 'base64'));
    delete result.shots;
    // The menu of a debug page: the rider screen with its game mode row
    await page.goto(`http://127.0.0.1:${option('port') || 8080}/?debug`, { waitUntil: 'load' });
    await page.waitForSelector('[data-game-mode-picker]', { timeout: 60000 }).catch(() => null);
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: join(dir, 'roam-menu.png') });
    result.menuRow = await page.evaluate(() => [...document.querySelectorAll('[data-game-mode]')].map(b => `${b.dataset.gameMode}:${b.disabled ? 'locked' : 'open'}`));
    // Free roam's rows (Start at, Ride with, Time of day, Weather) show with free roam chosen only
    const shown = () => page.evaluate(() => [...document.querySelectorAll('.game-start-row, .game-group-row, .game-time-row, .game-weather-row')].map(r => r.getBoundingClientRect().height > 0));
    result.roamRows = { trial: await shown() };
    await page.click('[data-game-mode="roam"]').catch(() => null);
    await new Promise(r => setTimeout(r, 300));
    result.roamRows.roam = await shown();
    await page.screenshot({ path: join(dir, 'roam-menu-roam.png') });
    const failures = [];
    if (!result.freeRoam || !result.guideRoam || !result.follow) failures.push('not in free roam');
    if (result.barriers.length) failures.push(`barriers in the scene: ${result.barriers.slice(0, 5).join(', ')}`);
    if (!result.side) failures.push('no side road found');
    else if (result.sideRide.nan || result.sideRide.furthest < 100) failures.push(`the side road ride: ${JSON.stringify(result.sideRide)}`);
    // (the bike rides on the side road's own surface, not the ride's height beside it: Vehicle.surfaceAt)
    if (result.trace && result.trace.some(([, over]) => Math.abs(over) > 1)) failures.push(`the bike off the side road's surface: ${JSON.stringify(result.trace.filter(([, over]) => Math.abs(over) > 1).slice(0, 4))}`);
    // (the bike well in the frame on the side road, not at its edge: WorldCamera.followRider's look)
    if (result.framed && (Math.abs(result.framed.x) > 0.6 || Math.abs(result.framed.y) > 0.6)) failures.push(`the bike at the edge of the frame on the side road: ${JSON.stringify(result.framed)}`);
    if (result.roamRows && (result.roamRows.trial.some(Boolean) || !result.roamRows.roam.every(Boolean))) failures.push(`free roam's rows on the rider screen: ${JSON.stringify(result.roamRows)}`);
    if (result.edge && result.edge.putBack < 50) failures.push(`not turned back at the edge: ${JSON.stringify(result.edge)}`);
    if (!result.findsStart || !result.findsStart.total || !result.findsSide || !result.findsSide.found.some(id => id.startsWith('side:')) || !/^Discoveries \d+\/\d+$/.test(result.findsSide.line)) failures.push(`the side road ridden is not a discovery: ${JSON.stringify(result.findsSide)}`);
    if (result.style && (!result.style.last || result.style.last.m < 5 || !(result.style.scored > 0) || !/Best wheelie/.test(result.style.line))) failures.push(`the wheelie not measured or scored: ${JSON.stringify(result.style)}`);
    if (result.photo && (!result.photo.opened || !(result.photo.ahead > 0) || !result.photo.saved || result.photo.saved.bytes < 100000 || !result.photo.back)) failures.push(`photo mode: ${JSON.stringify(result.photo)}`);
    if (result.sideCars && (!result.sideCars.cars.length || result.sideCars.cars.some(c => Math.abs(c.over) > 0.3) || result.sideCars.crashedOnCar)) failures.push(`side road traffic: ${JSON.stringify(result.sideCars)}`);
    if (result.crewRide && result.crewRide.mostAhead > 0) failures.push(`a rider of the group ${result.crewRide.mostAhead} m ahead of the leading player`);
    if (result.crewSide && result.crewSide.waiting < result.crewSide.riders) failures.push(`riders not waiting while the player is down a side road: ${JSON.stringify(result.crewSide)}`);
    return { ok: failures.length === 0, failures, ...result, dir };
};

// world-edge-shots: the edge furniture (EdgeStyles, Scenery.stoneSites) in pictures: for each style that stands
// somewhere on the stage, the first piece of it the ride passes, seen from the road 9 m before it
// (`<tag>-<style>.png`), and the stretch at km 2.8 from the chase view (`<tag>-km2.8.png`). Reports the styles found
// and how many pieces of each stand on the stage.
//   node tools/terrain-check.mjs world-edge-shots --world tremola --gpu [--out <dir>] [--tag <name>]
async function edgeShots(placeSource, stretchS) {
    const placeAt = new Function('game', `return (${placeSource})`)(game);
    const env = game.environment, route = env.route, g = game.graphics, v = game.vehicle;
    game.worldLinger = false;
    const shots = {}, counts = {}, seen = new Set();
    const styles = typeof EdgeStyles === 'undefined' ? [] : Object.keys(EdgeStyles.STYLES).filter(id => EdgeStyles.STYLES[id].piece);
    const frame = () => g.renderer.domElement.toDataURL('image/png');
    for (let s = env.startS + 50; s < env.endS && seen.size < styles.length; s += 350) {
        await placeAt(s);
        const sites = [];
        for (const held of env.scenery.perTile.values()) for (const q of held.stoneSites || []) sites.push(q);
        for (const q of sites) {
            const key = `${q.x.toFixed(1)},${q.z.toFixed(1)}`;
            if (!counts[key]) counts[key] = q.style || 'blocks';
        }
        for (const id of styles) {
            if (seen.has(id)) continue;
            const found = sites.filter(x => x.style === id && x.s !== undefined)[0];
            if (!found) continue;
            // The bike put down 12 m before it, so what stands there is drawn in full (the stones stand on the
            // nearest tiles only), then the piece of that style nearest it
            await placeAt(Math.max(10, found.s - 12));
            const near = [];
            for (const held of env.scenery.perTile.values()) for (const x of held.stoneSites || []) if (x.style === id && x.s !== undefined) near.push(x);
            const q = near.sort((a, b) => Math.abs(a.s - found.s) - Math.abs(b.s - found.s))[0] || found;
            const qs = q.s;
            const p = route.sample(Math.max(0, qs - 8), {});
            const side = Math.sign((q.x - p.x) * Math.cos(p.heading) - (q.z - p.z) * Math.sin(p.heading)) || 1;
            // From the road, a little to the piece's side of its middle, a rider's eye high
            const lat = side * 0.8;
            game.camera.position.set(p.x + lat * Math.cos(p.heading), p.y + 1.6, p.z - lat * Math.sin(p.heading));
            game.camera.lookAt(q.x, q.y + 0.5, q.z);
            game.camera.updateMatrixWorld(true);
            env.scenery.rankStones({ x: q.x, z: q.z }, true);
            g.render(game.scene, game.camera);
            shots[id] = frame();
            seen.add(id);
        }
    }
    // A stretch (--at <s>, by default km 2.8): the bike standing 15 m before it, the chase view
    await placeAt(Math.max(10, stretchS - 15));
    game.worldCamera.reset(v.yawAngle);
    for (let i = 0; i < 40; i++) twistyDev.step(1, { render: true });
    shots[`s${Math.round(stretchS)}`] = frame();
    const first = [];
    for (const held of env.scenery.perTile.values()) for (const q of held.stoneSites || []) if (q.kind === 'drop' && q.s !== undefined) first.push(Math.round(q.s));
    const tally = {};
    for (const style of Object.values(counts)) tally[style] = (tally[style] || 0) + 1;
    return { shots, found: [...seen], tally, dropsNear: first.sort((a, b) => a - b).slice(0, 5) };
}
WORLD_PROBES.push('world-edge-shots');
WORLD['world-edge-shots'] = async (page) => {
    await page.addStyleTag({ content: 'body * { visibility: hidden !important; } canvas { visibility: visible !important; }' });
    const result = await page.evaluate(edgeShots, placeAt.toString(), Number(option('at') || 2800));
    const dir = option('out') || join(process.env.HOME || '.', 'Library/Caches/twisty-world/edge-shots');
    mkdirSync(dir, { recursive: true });
    const files = [];
    for (const [k, data] of Object.entries(result.shots)) {
        const file = join(dir, `${option('tag') || 'edge'}-${k}.png`);
        writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'));
        files.push(file);
    }
    return { found: result.found, tally: result.tally, dropsNear: result.dropsNear, files };
};

// world-flash: no world mesh changes colour as the bike comes up to it. It rides up to a stopping place (its props,
// PlaceMesh, are built near the bike only) and to a hairpin's row of marker stones (the kerbs, Scenery.setStones by the
// tile's detail) at 18 m/s, and every frame records the mean colour of those meshes' pixels (a mask drawn on a layer
// of their own into a small target, against the frame drawn into another), and whether each is dressed as a world mesh
// should be before its first draw: its vertex colours decoded (Graphics.fixColorSpaces), its material hazed
// (LandShade.haze), its shadows set (Effects.dress). Fails on a frame-to-frame jump in luminance over `jump` with the
// mesh well in view, and on a mesh drawn undressed. --out <dir> saves the frames either side of each jump.
//   node tools/terrain-check.mjs world-flash --world tremola --gpu [--out <dir>]
async function flashRun(placeSource, jump) {
    const placeAt = new Function('game', `return (${placeSource})`)(game);
    const env = game.environment, route = env.route, g = game.graphics, renderer = g.renderer;
    const v = game.vehicle;
    const W = 480, H = 270;
    const frame = new THREE.WebGLRenderTarget(W, H), mask = new THREE.WebGLRenderTarget(W, H);
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff }), black = new THREE.MeshBasicMaterial({ color: 0x000000 });
    // A frame read back as a PNG (the target's rows run bottom up)
    const png = (pixels) => {
        const c = document.createElement('canvas');
        c.width = W;
        c.height = H;
        const ctx = c.getContext('2d'), img = ctx.createImageData(W, H);
        for (let y = 0; y < H; y++) img.data.set(pixels.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
        ctx.putImageData(img, 0, 0);
        return c.toDataURL('image/png');
    };
    const a = new Uint8Array(W * H * 4), b = new Uint8Array(W * H * 4);
    const side = Route.keepRight(1);
    const place = env.places.list.find(p => p.side === side && p.s > 3000 && p.kind === 'layby') || env.places.list.find(p => p.s > 3000);
    const pins = route.hairpins ? route.hairpins() : [];
    const runs = [{ name: 'place', toS: place.s, pick: o => o.name === 'world-places' }];
    const pin = pins.find(h => h.apex > 2000) || pins[0];
    if (pin) runs.push({ name: 'kerbs', toS: pin.apex, pick: o => o.name === 'stone-kerbs' });
    const dressed = o => {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        const decoded = !o.geometry.attributes.color || o.geometry.userData.linearColors || g.seenGeometries.has(o.geometry);
        const hazed = ms.every(m => !LandShade.hazeable(m) || m.userData.haze);
        const shadowed = !(game.effectLevels && game.effectLevels.shadows === 'on') || !Cascades.CASTERS.test(o.name) || o.castShadow;
        return { decoded, hazed, shadowed };
    };
    const out = [];
    for (const run of runs) {
        await placeAt(Math.max(10, run.toS - 320));
        game.worldCamera.reset(v.yawAngle);
        twistyDev.autopilot({ speed: 18 });
        const series = [];
        for (let f = 0; f < 60 * 22 && v.routeS < run.toS + 15; f++) {
            twistyDev.step(1, { render: true });
            const targets = [];
            game.scene.traverseVisible(o => { if (o.isMesh && run.pick(o)) targets.push(o); });
            if (!targets.length) { series.push({ f, s: Math.round(v.routeS), n: 0 }); continue; }
            renderer.setRenderTarget(frame);
            renderer.render(game.scene, game.camera);
            const layers = targets.map(o => o.layers.mask);
            targets.forEach(o => o.layers.enable(7));
            const keepLayers = game.camera.layers.mask, keepOverride = game.scene.overrideMaterial, keepBg = game.scene.background, keepFog = game.scene.fog;
            game.camera.layers.set(7);
            game.scene.overrideMaterial = white;
            game.scene.background = null;
            game.scene.fog = null;
            // The mask: everything black, then the targets white where they are in front (the depth kept between)
            const keepClear = renderer.autoClear;
            renderer.setRenderTarget(mask);
            renderer.setClearColor(0x000000, 1);
            renderer.clear();
            renderer.autoClear = false;
            game.camera.layers.mask = keepLayers;
            game.scene.overrideMaterial = black;
            renderer.render(game.scene, game.camera);
            game.camera.layers.set(7);
            game.scene.overrideMaterial = white;
            renderer.render(game.scene, game.camera);
            renderer.autoClear = keepClear;
            game.camera.layers.mask = keepLayers;
            game.scene.overrideMaterial = keepOverride;
            game.scene.background = keepBg;
            game.scene.fog = keepFog;
            targets.forEach((o, i) => { o.layers.mask = layers[i]; });
            renderer.readRenderTargetPixels(frame, 0, 0, W, H, a);
            renderer.readRenderTargetPixels(mask, 0, 0, W, H, b);
            renderer.setRenderTarget(null);
            let n = 0, r = 0, gg = 0, bb = 0;
            for (let i = 0; i < W * H; i++) if (b[i * 4] > 128) { n++; r += a[i * 4]; gg += a[i * 4 + 1]; bb += a[i * 4 + 2]; }
            const state = dressed(targets[0]);
            // The first frame a target is drawn undressed, and the first after it dressed again, as pictures
            if (!run.shots) run.shots = {};
            if (n > 0 && !state.decoded && !run.shots.undressed) run.shots.undressed = png(a);
            if (n > 0 && state.decoded && run.shots.undressed && !run.shots.dressed) run.shots.dressed = png(a);
            series.push({ f, s: Math.round(v.routeS), n, mesh: targets[0].uuid.slice(0, 6), luma: n ? +((0.2126 * r + 0.7152 * gg + 0.0722 * bb) / n / 255).toFixed(3) : null, rgb: n ? [r, gg, bb].map(x => Math.round(x / n)) : null, ...state });
        }
        const jumps = [], undressed = [];
        for (let i = 1; i < series.length; i++) {
            const p = series[i - 1], q = series[i];
            if (p.n > 60 && q.n > 60 && Math.abs(q.luma - p.luma) > jump) jumps.push({ f: q.f, s: q.s, from: p.luma, to: q.luma, pixels: q.n });
            if (q.n > 0 && (!q.decoded || !q.hazed || !q.shadowed)) undressed.push({ f: q.f, s: q.s, decoded: q.decoded, hazed: q.hazed, shadowed: q.shadowed });
        }
        out.push({ shots: run.shots || {}, run: run.name, toS: Math.round(run.toS), frames: series.length, seen: series.filter(x => x.n > 0).length, jumps: jumps.slice(0, 12), undressed: undressed.slice(0, 12), undressedFrames: undressed.length, meshes: [...new Set(series.filter(x => x.mesh).map(x => x.mesh))].length, lumas: series.filter(x => x.n > 15).map(x => `${x.s}:${x.luma}`).filter((x, i) => i % 8 === 0) });
    }
    // The props rebuilt with the bike stood 12 m short of the place (as when another place comes within reach,
    // PlaceMesh.update): the next frame must look as the one before it
    await placeAt(place.s - 12);
    game.worldCamera.reset(v.yawAngle);
    twistyDev.autopilot({ speed: 0 });
    for (let i = 0; i < 30; i++) twistyDev.step(1, { render: true });
    const measure = () => {
        const targets = [];
        game.scene.traverseVisible(o => { if (o.isMesh && o.name === 'world-places') targets.push(o); });
        renderer.setRenderTarget(frame);
        renderer.render(game.scene, game.camera);
        renderer.readRenderTargetPixels(frame, 0, 0, W, H, a);
        // (the mask as above)
        const keepClear = renderer.autoClear, keepLayers = game.camera.layers.mask, keepOverride = game.scene.overrideMaterial;
        targets.forEach(o => o.layers.enable(7));
        renderer.setRenderTarget(mask);
        renderer.clear();
        renderer.autoClear = false;
        game.scene.overrideMaterial = black;
        renderer.render(game.scene, game.camera);
        game.camera.layers.set(7);
        game.scene.overrideMaterial = white;
        renderer.render(game.scene, game.camera);
        renderer.autoClear = keepClear;
        game.camera.layers.mask = keepLayers;
        game.scene.overrideMaterial = keepOverride;
        targets.forEach(o => o.layers.disable(7));
        renderer.readRenderTargetPixels(mask, 0, 0, W, H, b);
        renderer.setRenderTarget(null);
        let n = 0, l = 0;
        for (let i = 0; i < W * H; i++) if (b[i * 4] > 128) { n++; l += (0.2126 * a[i * 4] + 0.7152 * a[i * 4 + 1] + 0.0722 * a[i * 4 + 2]) / 255; }
        return { n, luma: n ? +(l / n).toFixed(3) : null, png: png(a) };
    };
    const settled = measure();
    env.placeMesh.key = null;
    env.placeMesh.update(v.position);
    // One step drawn as the game draws it (Graphics.render), then measured
    twistyDev.step(1, { render: true });
    const rebuilt = measure();
    out.push({ run: 'rebuild', shots: { settled: settled.png, rebuilt: rebuilt.png }, frames: 2, seen: 2, meshes: 1, undressed: [], undressedFrames: 0,
        jumps: settled.n > 60 && Math.abs(rebuilt.luma - settled.luma) > jump ? [{ s: Math.round(v.routeS), from: settled.luma, to: rebuilt.luma, pixels: rebuilt.n }] : [],
        lumas: [`settled:${settled.luma} (${settled.n} px)`, `rebuilt:${rebuilt.luma} (${rebuilt.n} px)`] });
    frame.dispose();
    mask.dispose();
    return out;
}
WORLD_PROBES.push('world-flash');
WORLD['world-flash'] = async (page) => {
    const jump = Number(option('jump') || 0.06);
    const runs = await page.evaluate(flashRun, placeAt.toString(), jump);
    const dir = option('out');
    for (const r of runs) {
        for (const [k, data] of Object.entries(r.shots || {})) {
            if (dir) {
                mkdirSync(dir, { recursive: true });
                writeFileSync(join(dir, `${option('tag') || 'flash'}-${r.run}-${k}.png`), Buffer.from(data.split(',')[1], 'base64'));
            }
        }
        r.shots = Object.keys(r.shots || {});
    }
    const failures = runs.flatMap(r => [...r.jumps.map(j => `${r.run}: luminance ${j.from} to ${j.to} at s ${j.s}`), ...(r.undressedFrames ? [`${r.run}: ${r.undressedFrames} frames drawn undressed (first at s ${r.undressed[0].s}: ${JSON.stringify(r.undressed[0])})`] : [])]);
    return { ok: failures.length === 0, failures, runs };
};

// world-place-shots: the stopping places (WorldPlaces, PlaceMesh; .agent/system/world.md, "Stopping places") in
// pictures. For each place named (--ids p3,p7 or all; by default the first open layby, viewpoint and car park on the
// riders' side): the player stops 260 m before it with the crew just ahead, so the riders go to wait in it (a place on
// the other side has no riders: they wait only on their own side), then the bike stands 8 m short of it and the chase
// view is taken (`<tag>-<id>-chase.png`), and a view from across the road and over it (`<tag>-<id>-wait.png`). Writes
// index.json in the folder: each place's id, kind, s, side, depth, slots, the riders waiting in it and the two files.
//   node tools/terrain-check.mjs world-place-shots --world tremola --gpu [--out <dir>] [--tag <name>] [--ids <ids|all>]
const PLACE_SHOTS_OUT = join(process.env.HOME || '.', 'Library/Caches/twisty-world/places-shots');
WORLD_PROBES.push('world-place-shots');
WORLD['world-place-shots'] = async (page) => {
    const out = option('out') || PLACE_SHOTS_OUT;
    mkdirSync(out, { recursive: true });
    const tag = option('tag') || 'place';
    await page.addStyleTag({ content: 'body * { visibility: hidden !important; } canvas { visibility: visible !important; }' });
    const ids = await page.evaluate((want) => {
        const list = game.environment.places.list, side = Route.keepRight(1);
        if (want === 'all') return list.map(p => p.id);
        if (want) return want.split(',');
        // (past the first 3 km, as world-group-shots: the start's grid is not a stop)
        return ['layby', 'viewpoint', 'carpark'].map(kind => (list.find(p => p.kind === kind && p.side === side && p.s > 3000) || list.find(p => p.kind === kind) || {}).id).filter(Boolean);
    }, option('ids') || '');
    const index = [];
    for (const id of ids) {
        const info = await page.evaluate(placeScene, placeAt.toString(), id);
        if (info.error) { index.push({ id, error: info.error }); continue; }
        const chase = join(out, `${tag}-${id}-chase.png`);
        await page.screenshot({ path: chase });
        const view = await page.evaluate(placeEye, id);
        const wait = join(out, `${tag}-${id}-wait.png`);
        writeFileSync(wait, Buffer.from(view.png.split(',')[1], 'base64'));
        index.push({ ...info, chase, wait, eye: view.eye });
    }
    writeFileSync(join(out, 'index.json'), JSON.stringify(index, null, 1));
    return { out, places: index.length, index };
};

// In the page: the crew sent to wait in place `id` by a player who stopped before it, then the bike put down 8 m short
// of the place, standing, and the chase view drawn
async function placeScene(placeSource, id) {
    const placeAt = new Function('game', `return (${placeSource})`)(game);
    const env = game.environment, route = env.route, traffic = game.traffic, group = traffic.group;
    const place = env.places.list.find(p => p.id === id);
    if (!place) return { error: `no open place ${id}` };
    const v = game.vehicle;
    const sOf = b => route.fromUnits(b.currentSegment + b.segmentProgress);
    const put = (bike, s) => {
        const u = route.toUnits(s);
        bike.currentSegment = Math.floor(u);
        bike.segmentProgress = u - Math.floor(u);
        bike.laneMoving = false;
        if (group && bike.ride) group.placed(bike.ride);
        bike.updatePosition();
    };
    const input = window.placeInput || (window.placeInput = { throttle: game.input.getThrottleInput, brake: game.input.getBrakeInput });
    game.input.getThrottleInput = input.throttle;
    game.input.getBrakeInput = input.brake;
    game.setCameraView('near');
    const byPlace = traffic.motorcycles.slice().sort((a, b) => a.character.place - b.character.place);
    await placeAt(Math.max(10, place.s - 260));
    game.worldCamera.reset(v.yawAngle);
    if (group) { group.halted = group.standing = false; group.stoppedS = 0; }
    const own = place.side === Route.keepRight(1);
    // The crew just ahead of the stopped player (or, for a place on the far side, behind it, out of the picture)
    byPlace.forEach((bike, k) => put(bike, own ? place.s - 200 - k * 12 : Math.max(5, place.s - 330 - k * 12)));
    twistyDev.autopilot({ speed: 0 });
    game.input.getThrottleInput = () => 0;
    game.input.getBrakeInput = () => 1;
    v.speed = 0;
    let ticks = 0;
    while (own && traffic.motorcycles.some(b => b.ride && b.ride.state !== 'wait') && ticks < 60 * 180) { twistyDev.step(1); ticks++; }
    await placeAt(place.s - 8);
    game.worldCamera.reset(v.yawAngle);
    v.speed = 0;
    for (let i = 0; i < 60; i++) twistyDev.step(1);
    env.streamer.pump(Infinity);
    twistyDev.step(1, { render: true });
    const waiting = traffic.motorcycles.filter(b => b.ride && b.ride.state === 'wait' && b.ride.at.place === place).map(b => {
        const g = b.bikeGroup.position, p = route.project(g.x, g.z, null, {});
        return { place: b.character.place, s: Math.round(sOf(b) * 10) / 10, slot: b.ride.at.slot, past: Math.round((Math.abs(p.lateral) - p.width / 2) * 100) / 100 };
    });
    const part = env.placeMesh && env.placeMesh.parts.find(q => q.place === id);
    const drawn = !!(env.placeMesh && env.placeMesh.mesh && env.placeMesh.mesh.userData.places.includes(id));
    return { id, kind: place.kind, s: place.s, side: place.side, length: place.length, depth: place.depth, slots: place.slots, waitedS: Math.round(ticks / 60), waiting, props: part ? { triangles: part.triangles, drawn, near: env.placeMesh.triangles } : null };
}

// In the page: place `id` from across the road and over it, the frame alone (no HUD), as a PNG data URL
function placeEye(id) {
    const env = game.environment, route = env.route, place = env.places.list.find(p => p.id === id);
    const mid = place.s + place.length / 2, p = route.sample(mid, {});
    const point = (s, lat, up) => { const q = route.sample(s, {}); return new THREE.Vector3(q.x + lat * Math.cos(q.heading), q.y + up, q.z - lat * Math.sin(q.heading)); };
    const eye = point(mid - 16, -place.side * (p.width / 2 + 1.5), 4.5);
    const look = point(mid + 3, place.side * (p.width / 2 + 2.5), 0.4);
    game.camera.position.copy(eye);
    game.camera.lookAt(look);
    game.camera.updateMatrixWorld(true);
    game.graphics.render(game.scene, game.camera);
    return { png: game.graphics.renderer.domElement.toDataURL('image/png'), eye: [eye.x, eye.y, eye.z].map(n => Math.round(n)) };
}

function camWallChecks(results, failures) {
    const walls = results['world-camera-walls'];
    if (!walls || walls.files) return;
    if (walls.error) { failures.push(`world-camera-walls: ${walls.error}`); return; }
    if (!(walls.frames > 0) && hairpinsLeast() > 0) failures.push('world-camera-walls: no frame was read');
    if (walls.short.length) failures.push(`world-camera-walls: under 100 frames at ${JSON.stringify(walls.short)}`);
    const says = { works: 'a wall, a parapet or a deck', land: 'the land', house: 'a house', road: "a road's surface" };
    for (const [kind, text] of Object.entries(says)) if (walls[kind]) failures.push(`world-camera-walls: ${text} stood between the camera and the bike on ${walls[kind]} of ${walls.frames} frames: ${JSON.stringify(walls.bad.filter(r => r[kind]).slice(0, 8))}`);
    if (walls.clipped) failures.push(`world-camera-walls: the view's near plane cut a wall, a house or the land on ${walls.clipped} of ${walls.frames} frames: ${JSON.stringify(walls.bad.filter(r => r.clipped).slice(0, 8))}`);
}

// A view for world-junctions, in the page: the frame alone (no HUD), as a PNG data URL
async function junctionEye(placeSource, eye) {
    const [s, lat, up, toS, toLat, toUp] = Array.isArray(eye) ? eye : [eye.s];
    const placeAt = new Function('game', `return (${placeSource})`)(game);
    const v = game.vehicle, route = game.environment.route;
    game.setCameraView('near');
    await placeAt(s);
    game.worldCamera.reset(v.yawAngle);
    twistyDev.autopilot({ speed: 0 });
    for (let i = 0; i < 30; i++) twistyDev.step(1);
    game.environment.streamer.pump(Infinity);
    twistyDev.step(1, { render: true });
    const at = (s, lat, up) => { const p = route.sample(s, {}); return new THREE.Vector3(p.x + lat * Math.cos(p.heading), p.y + up, p.z - lat * Math.sin(p.heading)); };
    if (Array.isArray(eye)) {
        game.camera.position.copy(at(s, lat, up));
        game.camera.lookAt(at(toS, toLat, toUp));
    } else {
        game.camera.position.set(eye.at[0], eye.at[1], eye.at[2]);
        game.camera.lookAt(new THREE.Vector3(eye.at[3], eye.at[4], eye.at[5]));
    }
    game.camera.updateMatrixWorld(true);
    // The bike stands in the junction: out of the picture
    const shown = v.group ? v.group.visible : null;
    if (v.group) v.group.visible = false;
    game.graphics.render(game.scene, game.camera);
    const png = game.graphics.renderer.domElement.toDataURL('image/png');
    if (v.group) v.group.visible = shown;
    return png;
}

// world-ground-scan: the near land by distance, for the ground texture effect (js/world/groundtex.js). At each station of
// --at the view rides there (--camera N, default 2 the chase view), one pass draws the camera's distance to the land
// (nothing for anything in front of it), then for each spec of --specs the frame is drawn and read. In bins of 2 m
// from 2 to 120 m it gives the land's mean luma and fine contrast (the mean absolute difference of a pixel from the
// mean of its 3 x 3: a smear scores near 0), and against the first spec the mean change of luma and of contrast. A
// line that moves with the bike is a step in that change at one distance: `steps` is the largest jump of the change
// of luma and of contrast between two bins next to each other (bins of 3000 pixels or more). --straight also gives
// the straightest 400 m of the ride. --out saves the frames
WORLD_PROBES.push('world-ground-scan');
WORLD['world-ground-scan'] = async (page) => {
    const specs = (option('specs') || 'default;off').split(';');
    const stations = option('at') ? option('at').split(',').map(Number) : [1600];
    const camera = viewsOption('camera', ['near'])[0];
    await page.addStyleTag({ content: 'body * { visibility: hidden !important; } body > canvas { visibility: visible !important; }' });
    const rows = [];
    const straight = flag('straight') ? await page.evaluate(() => {
        const route = game.environment.route, every = 10, span = 400, heads = [];
        for (let s = 0; s < route.length; s += every) heads.push(route.sample(s, {}).heading);
        const turn = heads.slice(1).map((h, i) => Math.abs(Math.atan2(Math.sin(h - heads[i]), Math.cos(h - heads[i]))));
        const n = span / every;
        let best = null;
        for (let i = 0; i + n <= turn.length; i++) {
            let sum = 0;
            for (let k = i; k < i + n; k++) sum += turn[k];
            if (!best || sum < best.turnDeg) best = { from: i * every, to: i * every + span, turnDeg: sum };
        }
        best.turnDeg = Math.round(best.turnDeg * 180 / Math.PI * 10) / 10;
        return best;
    }) : null;
    for (const s of stations) {
        const at = await page.evaluate(async (placeSource, pilotSource, s, camera) => {
            const placeAt = new Function('game', `return (${placeSource})`)(game);
            const v = game.vehicle;
            game.setCameraView(camera);
            await placeAt(Math.max(10, s - 140));
            game.worldCamera.reset(v.yawAngle);
            new Function('game', 'cruise', `return (${pilotSource})(game, cruise)`)(game, 18);
            let ticks = 0;
            while (v.routeS < s && !v.crashed && ticks < 3600) { twistyDev.step(1); ticks++; }
            game.environment.streamer.pump(Infinity);
            return { s: Math.round(v.routeS), crashed: v.crashed };
        }, placeAt.toString(), pilotWorld.toString(), s, camera);
        await page.evaluate(() => {
            const r = game.graphics.renderer;
            const size = r.getDrawingBufferSize(new THREE.Vector2());
            const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.FloatType });
            const vertex = '#include <common>\nvarying vec3 vView;\nvoid main() {\n#include <begin_vertex>\n#include <project_vertex>\nvView = mvPosition.xyz;\n}';
            const make = land => new THREE.ShaderMaterial({ side: THREE.DoubleSide, vertexShader: vertex, fragmentShader: `varying vec3 vView;\nvoid main() { gl_FragColor = vec4(${land ? 'length(vView)' : '-1.0'}, 0.0, 0.0, 1.0); }` });
            const landMat = make(true), other = make(false);
            const swapped = [], hidden = [];
            game.scene.traverse(o => {
                if ((o.isPoints || o.isLine || o.isSprite) && o.visible) { hidden.push(o); o.visible = false; return; }
                if (!o.isMesh || o.isSkinnedMesh) return;
                swapped.push([o, o.material]);
                o.material = o.material === TerrainMesh.sharedMaterial ? landMat : other;
            });
            const background = game.scene.background, fog = game.scene.fog;
            game.scene.background = null; game.scene.fog = null;
            r.setRenderTarget(target);
            r.setClearColor(0x000000, 1);
            r.clear();
            r.render(game.scene, game.camera);
            r.setRenderTarget(null);
            game.scene.background = background; game.scene.fog = fog;
            swapped.forEach(([o, m]) => { o.material = m; });
            hidden.forEach(o => { o.visible = true; });
            const data = new Float32Array(size.x * size.y * 4);
            r.readRenderTargetPixels(target, 0, 0, size.x, size.y, data);
            target.dispose();
            const out = new Float32Array(size.x * size.y);
            for (let y = 0; y < size.y; y++) for (let x = 0; x < size.x; x++) out[(size.y - 1 - y) * size.x + x] = data[(y * size.x + x) * 4];
            window.__gsMask = { w: size.x, h: size.y, d: out };
        });
        for (const spec of specs) {
            const set = await page.evaluate(effectsSpec, spec);
            if (set.error) return { error: `${spec}: ${set.error}` };
            await page.evaluate(() => { game.graphics.render(game.scene, game.camera); game.graphics.render(game.scene, game.camera); });
            const png = await page.screenshot({ encoding: 'base64' });
            const result = await page.evaluate(async (data, first) => {
                const image = new Image();
                image.src = `data:image/png;base64,${data}`;
                await image.decode();
                const { w, h, d: dist } = window.__gsMask;
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(image, 0, 0, w, h);
                const px = ctx.getImageData(0, 0, w, h).data;
                const luma = new Float32Array(w * h);
                for (let i = 0; i < w * h; i++) luma[i] = 0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2];
                const fine = new Float32Array(w * h);
                for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
                    const i = y * w + x;
                    let sum = 0;
                    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sum += luma[i + dy * w + dx];
                    fine[i] = Math.abs(luma[i] - sum / 9);
                }
                const bins = Array.from({ length: 59 }, (_, k) => ({ from: 2 + 2 * k, n: 0, luma: 0, fine: 0, dLuma: 0, dFine: 0 }));
                const before = first ? null : window.__gsFirst;
                for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
                    const i = y * w + x, m = dist[i];
                    if (!(m >= 2 && m < 120)) continue;
                    const b = bins[Math.floor((m - 2) / 2)];
                    b.n++; b.luma += luma[i]; b.fine += fine[i];
                    if (before) { b.dLuma += luma[i] - before.luma[i]; b.dFine += fine[i] - before.fine[i]; }
                }
                if (first) window.__gsFirst = { luma, fine };
                const out = bins.filter(b => b.n > 0).map(b => ({ from: b.from, n: b.n, luma: Math.round(b.luma / b.n * 10) / 10, fine: Math.round(b.fine / b.n * 100) / 100, dLuma: before ? Math.round(b.dLuma / b.n * 100) / 100 : null, dFine: before ? Math.round(b.dFine / b.n * 100) / 100 : null }));
                const big = out.filter(b => b.n >= 3000);
                let stepLuma = 0, stepFine = 0, stepAt = null;
                for (let k = 1; k < big.length; k++) {
                    if (big[k].from !== big[k - 1].from + 2 || !before) continue;
                    const dl = Math.abs(big[k].dLuma - big[k - 1].dLuma), df = Math.abs(big[k].dFine - big[k - 1].dFine);
                    if (dl > stepLuma) { stepLuma = dl; stepAt = big[k].from; }
                    stepFine = Math.max(stepFine, df);
                }
                // Bands, for the table
                const bands = [[2, 5], [5, 15], [15, 30], [30, 60], [60, 120]].map(([a, z]) => {
                    const inBand = out.filter(b => b.from >= a - 1 && b.from < z);
                    const n = inBand.reduce((t, b) => t + b.n, 0);
                    const avg = key => (n && inBand[0][key] !== null ? Math.round(inBand.reduce((t, b) => t + b[key] * b.n, 0) / n * 100) / 100 : null);
                    return { band: `${a}-${z}`, n, luma: avg('luma'), fine: avg('fine'), dLuma: avg('dLuma'), dFine: avg('dFine') };
                });
                return { bands, steps: before ? { luma: Math.round(stepLuma * 100) / 100, fine: Math.round(stepFine * 100) / 100, lumaAtM: stepAt } : null, bins: out };
            }, png, rows.filter(r => r.s === at.s && r.camera === camera).length === 0);
            const out = option('out');
            if (out) mkdirSync(out, { recursive: true });
            if (out && !flag('no-frames')) { writeFileSync(join(out, `gs-s${s}-c${camera}-${spec.replace(/[^a-z0-9=,]+/gi, '').replace(/[=,]/g, '-')}.png`), Buffer.from(png, 'base64')); }
            rows.push({ s: at.s, station: s, camera, spec, crashed: at.crashed, ...result, bins: flag('bins') ? result.bins : undefined });
        }
        await page.evaluate(() => { delete window.__gsFirst; delete window.__gsMask; });
    }
    const memory = await page.evaluate(() => (typeof GroundTex !== 'undefined' ? { bytes: GroundTex.bytes(), madeMs: Math.round(GroundTex.madeMs || 0) } : null));
    // The bins are long: with --out the whole result is written there too, as scan.json
    if (option('out')) writeFileSync(join(option('out'), 'scan.json'), JSON.stringify({ straight, memory, rows }));
    return { straight, memory, rows: rows.map(row => ({ ...row, bins: undefined })) };
};

// world-ground-off: the ground texture effect off draws the frame the game drew before it, to the bit. At each station
// of --at (default 1600) the default effects are put in force with groundTex at high and then off again (the others
// at their defaults) (so its
// textures were made), the frame is read, then the land's program is compiled again without the effect's code at all
// (GroundTex.bare) and the frame is read again: the two must be the same
WORLD_PROBES.push('world-ground-off');
WORLD['world-ground-off'] = async (page) => {
    const stations = option('at') ? option('at').split(',').map(Number) : [1600];
    await page.addStyleTag({ content: 'body * { visibility: hidden !important; } body > canvas { visibility: visible !important; }' });
    const failures = [], rows = [];
    for (const s of stations) {
        await page.evaluate(async (placeSource, pilotSource, s) => {
            const placeAt = new Function('game', `return (${placeSource})`)(game);
            const v = game.vehicle;
            game.setCameraView('near');
            await placeAt(Math.max(10, s - 140));
            game.worldCamera.reset(v.yawAngle);
            new Function('game', 'cruise', `return (${pilotSource})(game, cruise)`)(game, 18);
            let ticks = 0;
            while (v.routeS < s && !v.crashed && ticks < 3600) { twistyDev.step(1); ticks++; }
            game.environment.streamer.pump(Infinity);
        }, placeAt.toString(), pilotWorld.toString(), s);
        const shot = async (bare) => {
            await page.evaluate((bare) => {
                GroundTex.bare = bare;
                TerrainMesh.sharedMaterial.needsUpdate = true;
                game.graphics.render(game.scene, game.camera);
                game.graphics.render(game.scene, game.camera);
            }, bare);
            return page.screenshot({ encoding: 'base64' });
        };
        let set = await page.evaluate(effectsSpec, 'ao=low,landDetail,shadows,reflections,grade,streaks,edgeBlur,groundTex=high');
        if (set.error) return { error: set.error };
        await page.evaluate(() => { game.graphics.render(game.scene, game.camera); });
        // The defaults but the ground texture off
        set = await page.evaluate(effectsSpec, 'ao=low,landDetail,shadows,reflections,grade,streaks,edgeBlur,groundTex=off');
        // Drawn until two frames in a row are the same: just after a change the scene still settles (an eased grade,
        // a sky bake), and that is not the effect's code
        let off = await shot(false), settled = false;
        for (let k = 0; k < 8 && !settled; k++) {
            const next = await shot(false);
            settled = next === off;
            off = next;
        }
        const bare = await shot(true);
        // The same frame again with the effect's code, to tell a change of the scene between draws from the code's
        const again = await shot(false);
        await page.evaluate(() => { GroundTex.bare = false; TerrainMesh.sharedMaterial.needsUpdate = true; });
        const compare = (a, b) => page.evaluate(async (a, b) => {
            const read = async data => {
                const image = new Image();
                image.src = `data:image/png;base64,${data}`;
                await image.decode();
                const canvas = document.createElement('canvas');
                canvas.width = image.width; canvas.height = image.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(image, 0, 0);
                return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            };
            const p = await read(a), q = await read(b);
            let differ = 0, most = 0;
            for (let i = 0; i < p.length; i++) if (p[i] !== q[i]) { differ++; most = Math.max(most, Math.abs(p[i] - q[i])); }
            return { bytes: p.length, differ, most };
        }, a, b);
        const diff = await compare(off, bare), drift = await compare(off, again);
        rows.push({ s, inForce: set.inForce.groundTex, landDetail: set.inForce.landDetail, settled, ...diff, sameCodeDiffer: drift.differ });
        if (diff.differ) failures.push(`s ${s}: ${diff.differ} bytes differ (most ${diff.most}) between the ground texture off and the land without it`);
    }
    return { rows, failures };
};

// world-ground-flip: the land is drawn whole while the graphics change under it. The bike rides --metres (default 2200)
// from --from (default 300) in the chase view --camera (default far) while, every --every frames (default
// 15), the ground texture is set as the settings dialog sets it (each level in turn) or the ladder is fixed at another
// level and released as Auto does (Rich, Full, High, Ultra: the shadows, the occlusion and the ground texture all
// change). Each frame is an update and a draw, and then every land tile (TerrainMesh's material) is read:
//   gone      a point on a 16 m grid within --reach m (default 300) that a visible land tile in the scene covered on
//             the frame before and none covers now
//   undrawn   a visible land tile in the scene within --reach m whose bounds the camera sees and that was not drawn
//   program   the land's material has no program, or one that did not compile, after the draw
//   stalls    frames over 50 ms after the first, with the programs compiled in that frame (a level that turns the
//             cascades on or off compiles every material again; that is the ladder's, not the ground's)
WORLD_PROBES.push('world-ground-flip');
WORLD['world-ground-flip'] = async (page) => {
    const from = Number(option('from') || 300), metres = Number(option('metres') || 2200);
    const camera = viewsOption('camera', ['far'])[0], every = Number(option('every') || 15), reach = Number(option('reach') || 300);
    const result = await page.evaluate(async (placeSource, from, metres, camera, every, reach) => {
        const placeAt = new Function('game', `return (${placeSource})`)(game);
        const v = game.vehicle, r = game.renderer, gl = r.getContext(), pixel = new Uint8Array(4);
        game.setCameraView(camera);
        await placeAt(from);
        game.worldCamera.reset(v.yawAngle);
        twistyDev.autopilot({ speed: 22 });
        const land = TerrainMesh.material();
        const drawn = new Set();
        const hooked = new WeakSet();
        const hook = mesh => {
            if (hooked.has(mesh)) return;
            hooked.add(mesh);
            const before = mesh.onBeforeRender;
            mesh.onBeforeRender = function (...args) { drawn.add(this); return before.apply(this, args); };
        };
        const levels = ['off', 'low', 'medium', 'high'];
        const ladder = ['rich', 'full', 'high', 'ultra'];
        let flips = 0, dialogFlips = 0, autoFlips = 0;
        const flip = k => {
            flips++;
            if (k % 2 === 0) {
                game.effects.set('groundTex', levels[(k / 2) % levels.length]);
                game.applyGraphicsSettings();
                dialogFlips++;
            } else {
                const id = ladder[((k - 1) / 2) % ladder.length];
                if (id === 'ultra') game.quality.release(performance.now());
                else game.quality.fix(id, performance.now());
                game.applyEffects();
                autoFlips++;
            }
        };
        const failures = [], stalls = [], frames = [];
        let covered = null, frame = 0, gone = 0, undrawn = 0, programs = 0, landTilesSeen = 0;
        const frustum = new THREE.Frustum(), m = new THREE.Matrix4(), box = new THREE.Box3();
        const start = v.routeS;
        while (v.routeS < start + metres && frame < 20000 && !v.crashed) {
            const levelsBefore = { ...game.effectLevels }, ladderBefore = game.quality.level;
            const kind = frame > 0 && frame % every === 0 ? ((frame / every) % 2 === 0 ? 'dialog' : 'ladder') : null;
            if (kind) flip(frame / every);
            const changed = Object.keys(game.effectLevels).filter(id => game.effectLevels[id] !== levelsBefore[id]).map(id => `${id} ${levelsBefore[id]}>${game.effectLevels[id]}`);
            if (game.quality.level !== ladderBefore) changed.unshift(`ladder ${ladderBefore}>${game.quality.level}`);
            const programsBefore = r.info.programs.length;
            drawn.clear();
            const t0 = performance.now();
            twistyDev.step(1);
            // Every land tile is watched before the draw, a tile the step streamed in too (a cheap walk of the scene)
            game.scene.traverse(o => { if (o.isMesh && o.material === land) hook(o); });
            game.graphics.render(game.scene, game.camera);
            gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
            const ms = performance.now() - t0;
            const compiled = r.info.programs.length - programsBefore;
            frames.push(ms);
            if (frame > 0 && ms > 50) stalls.push({ frame, s: Math.round(v.routeS), ms: Math.round(ms), compiled, kind, changed, ground: game.effectLevels.groundTex });
            // The land tiles in the scene
            const tiles = [];
            game.scene.traverse(o => { if (o.isMesh && o.material === land) tiles.push(o); });
            tiles.forEach(hook);
            const shown = tiles.filter(o => { for (let n = o; n; n = n.parent) if (!n.visible) return false; return true; });
            const p = v.position;
            m.multiplyMatrices(game.camera.projectionMatrix, game.camera.matrixWorldInverse);
            frustum.setFromProjectionMatrix(m);
            const near = [];
            for (const o of shown) {
                if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
                box.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
                const dx = Math.max(box.min.x - p.x, 0, p.x - box.max.x), dz = Math.max(box.min.z - p.z, 0, p.z - box.max.z);
                if (Math.hypot(dx, dz) > reach) continue;
                near.push({ o, min: box.min.clone(), max: box.max.clone() });
                if (frustum.intersectsBox(box) && !drawn.has(o)) {
                    undrawn++;
                    if (failures.length < 30) failures.push(`frame ${frame} s ${Math.round(v.routeS)}: ${o.name} is shown and in view but was not drawn`);
                }
            }
            landTilesSeen = Math.max(landTilesSeen, near.length);
            // Coverage of a 16 m grid round the bike
            const now = new Set();
            const gx = Math.round(p.x / 16), gz = Math.round(p.z / 16), cells = Math.ceil(reach / 16);
            for (let i = -cells; i <= cells; i++) for (let j = -cells; j <= cells; j++) {
                if (Math.hypot(i, j) * 16 > reach - 16) continue;
                const x = (gx + i) * 16, z = (gz + j) * 16;
                if (near.some(t => x >= t.min.x && x <= t.max.x && z >= t.min.z && z <= t.max.z)) now.add(`${gx + i},${gz + j}`);
            }
            if (covered) for (const key of covered) {
                const [i, j] = key.split(',').map(Number);
                if (Math.hypot(i * 16 - p.x, j * 16 - p.z) > reach - 32) continue;
                if (!now.has(key)) {
                    gone++;
                    if (failures.length < 30) failures.push(`frame ${frame} s ${Math.round(v.routeS)}: the land at ${i * 16}, ${j * 16} was drawn on the frame before and is not now`);
                }
            }
            covered = now;
            const props = r.properties.get(land);
            const program = props && props.currentProgram;
            if (!program || (program.diagnostics && program.diagnostics.runnable === false)) {
                programs++;
                if (failures.length < 30) failures.push(`frame ${frame}: the land has no program that runs`);
            }
            frame++;
        }
        frames.sort((a, b) => a - b);
        const q = k => Math.round(frames[Math.floor(k * (frames.length - 1))] * 10) / 10;
        game.quality.release(performance.now());
        return { from: Math.round(start), to: Math.round(v.routeS), crashed: v.crashed, frames: frame, flips, dialogFlips, autoFlips, landTilesSeen, gone, undrawn, programs, stallsOver50: stalls.length, stallsWithoutCompile: stalls.filter(s => s.compiled === 0).length, stallsOnLadderSteps: stalls.filter(s => s.changed.some(c => c.startsWith('ladder'))).length, stallsOther: stalls.filter(s => s.compiled === 0 && !s.changed.some(c => c.startsWith('ladder'))).length, groundStalls: stalls.filter(s => s.compiled === 0 && s.changed.length && s.changed.every(c => c.startsWith('groundTex'))).length, stalls: stalls.slice(0, 40), medianMs: q(0.5), p95Ms: q(0.95), worstMs: q(1), ready: typeof GroundTex !== 'undefined' ? GroundTex.state : null, failures };
    }, placeAt.toString(), from, metres, camera, every, reach);
    const failures = [...(result.failures || [])];
    // A ladder step that resizes the targets is the ladder's own cost (reported, not failed); any other frame over
    // 50 ms that compiles nothing is a fault, and one where only the ground texture changed is this effect's
    if (result.stallsOther) failures.push(`${result.stallsOther} frames over 50 ms with no program compiled and no ladder step`);
    if (result.groundStalls) failures.push(`${result.groundStalls} frames over 50 ms where only the ground texture changed`);
    return { ...result, failures };
};

// world-quality: the cost of each part of a world frame, and the frame at each level of the quality ladder (js/quality.js),
// at one place (--at s, QUALITY_AT_SHARE of the ride by default) from the chase view. --phone rides a phone-class page:
// a 390 x 844 view at a device pixel ratio of 3, touch, and the CPU slowed QUALITY_THROTTLE times (--throttle N). A frame
// is one step of the game without its draw (the update) and one draw with a 1-pixel read-back that waits for the GPU (the
// render); each is the median of --frames frames. --measure turns each part off or down by itself against the full
// frame (the order of the ladder comes from it); without it each level is set and timed, and --out <dir> saves its picture.
//   node tools/terrain-check.mjs world-quality --world tremola --gpu [--phone] [--throttle N] [--measure] [--at s] [--frames N] [--out <dir>]
// world-tree-shots: pictures of a world's trees, the frame alone. At each station (--at s,s, or by default the three
// stations with the most trees within 45 m of the ride, 400 m apart at the least) the chase view with the bike
// standing, a close view of the nearest tree (12 m from it, at a rider's eye) and a middle view of the densest group 60
// to 110 m out, with the counts of the window (countScene) in index.json. The views are chosen from where the trees
// stand, not from their shapes, so a change of shape keeps the same views
//   node tools/terrain-check.mjs world-tree-shots --world tremola --gpu --desk [--at s,s] [--out <dir>] [--tag T]
const TREE_SHOTS_OUT = join(process.env.HOME || '.', 'Library/Caches/twisty-world/tree-shots');
WORLD_PROBES.push('world-tree-shots');
WORLD['world-tree-shots'] = async (page) => {
    const out = option('out') || TREE_SHOTS_OUT;
    mkdirSync(out, { recursive: true });
    const tag = option('tag') || 'trees';
    await page.addStyleTag({ content: 'body * { visibility: hidden !important; } canvas { visibility: visible !important; }' });
    const chosen = option('at') ? option('at').split(',').map(Number) : await page.evaluate(treeStations, placeAt.toString(), treeFeet.toString());
    const index = [];
    for (const s of chosen) {
        const views = await page.evaluate(treeViews, placeAt.toString(), countScene.toString(), treeFeet.toString(), s);
        const entry = { s, counts: views.counts, trees: views.trees, views: {} };
        for (const [name, view] of Object.entries(views.views)) {
            const file = join(out, `${tag}-s${s}-${name}.png`);
            writeFileSync(file, Buffer.from(view.png.split(',')[1], 'base64'));
            entry.views[name] = { file, eye: view.eye, at: view.at };
        }
        index.push(entry);
    }
    writeFileSync(join(out, `${tag}-index.json`), JSON.stringify(index, null, 1));
    return { out, index: index.map(e => ({ s: e.s, counts: e.counts, trees: e.trees })) };
};

// In the page: every drawn tree's foot and scale, from the instanced meshes named trees:* (not the bushes)
function treeFeet() {
    const feet = [];
    const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), k = new THREE.Vector3();
    const seen = new Set();
    game.environment.group.traverse(o => {
        if (!o.isInstancedMesh || !o.name.startsWith('trees:') || o.name.includes('bush')) return;
        o.updateMatrixWorld(true);
        for (let i = 0; i < o.count; i++) {
            o.getMatrixAt(i, m);
            m.premultiply(o.matrixWorld).decompose(p, q, k);
            const key = `${p.x.toFixed(2)},${p.z.toFixed(2)}`;
            if (seen.has(key)) continue;
            seen.add(key);
            feet.push({ x: p.x, y: p.y, z: p.z, scale: k.y });
        }
    });
    return feet;
}

// In the page: the three stations with the most trees within 45 m of the ride, 400 m apart at the least
async function treeStations(placeSource, feetSource) {
    const placeAt = new Function('game', `return (${placeSource})`)(game);
    const feetOf = new Function(`return (${feetSource})`)();
    const route = game.environment.route;
    const scored = [];
    for (let s = 200; s < route.length - 200; s += 400) {
        await placeAt(s);
        const feet = feetOf();
        for (let t = s - 200; t < s + 200; t += 50) {
            const p = route.sample(t, {});
            scored.push({ s: t, n: feet.filter(f => Math.hypot(f.x - p.x, f.z - p.z) < 45).length });
        }
    }
    scored.sort((a, b) => b.n - a.n || a.s - b.s);
    const picked = [];
    for (const c of scored) {
        if (c.n === 0 || picked.length >= 3) break;
        if (picked.every(s => Math.abs(s - c.s) >= 400)) picked.push(c.s);
    }
    return picked.sort((a, b) => a - b);
}

// In the page: the chase, close and middle views at station s
async function treeViews(placeSource, countSource, feetSource, s) {
    const placeAt = new Function('game', `return (${placeSource})`)(game);
    const count = new Function(`return (${countSource})`)();
    const feetOf = new Function(`return (${feetSource})`)();
    const env = game.environment, route = env.route, v = game.vehicle;
    game.setCameraView('near');
    // (twice: a tile's scenery waits for the side roads round it, which the first put-down only asks for)
    await placeAt(s);
    await placeAt(s);
    game.worldCamera.reset(v.yawAngle);
    twistyDev.autopilot({ speed: 0 });
    v.speed = 0;
    for (let i = 0; i < 90; i++) twistyDev.step(1);
    env.streamer.pump(Infinity);
    twistyDev.step(1, { render: true });
    const shot = () => game.graphics.renderer.domElement.toDataURL('image/png');
    const views = { chase: { png: shot() } };
    const counts = count();
    const p = route.sample(s, {});
    const feet = feetOf();
    const near = feet.map(f => ({ f, d: Math.hypot(f.x - p.x, f.z - p.z) })).filter(e => e.d > 6 && e.d < 60).sort((a, b) => a.d - b.d)[0];
    const look = (eye, at, name) => {
        game.camera.position.copy(eye);
        game.camera.lookAt(at);
        game.camera.updateMatrixWorld(true);
        game.graphics.render(game.scene, game.camera);
        views[name] = { png: shot(), eye: [eye.x, eye.y, eye.z].map(n => Math.round(n * 10) / 10), at: [at.x, at.y, at.z].map(n => Math.round(n * 10) / 10) };
    };
    const shown = v.group ? v.group.visible : null;
    if (v.group) v.group.visible = false;
    if (near) {
        const f = near.f, dx = p.x - f.x, dz = p.z - f.z, d = Math.hypot(dx, dz);
        const ex = f.x + dx / d * 12, ez = f.z + dz / d * 12;
        const ground = env.ground.tileHeight(ex, ez);
        const ey = Math.max(ground === null ? p.y : ground, p.y) + 1.6;
        look(new THREE.Vector3(ex, ey, ez), new THREE.Vector3(f.x, f.y + 4.2 * f.scale, f.z), 'close');
    }
    const ring = feet.filter(f => { const d = Math.hypot(f.x - p.x, f.z - p.z); return d > 60 && d < 110; });
    const dense = ring.map(f => ({ f, n: ring.filter(g => Math.hypot(g.x - f.x, g.z - f.z) < 25).length })).sort((a, b) => b.n - a.n)[0];
    if (dense) look(new THREE.Vector3(p.x, p.y + 1.6, p.z), new THREE.Vector3(dense.f.x, dense.f.y + 3, dense.f.z), 'middle');
    if (v.group) v.group.visible = shown;
    return { counts, trees: feet.length, views };
}

const QUALITY_AT_SHARE = 0.1;
const QUALITY_THROTTLE = 4;
const QUALITY_PHONE = { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
WORLD_PROBES.push('world-quality');
WORLD['world-quality'] = async (page) => {
    const phone = flag('phone');
    const throttle = Number(option('throttle') || (phone ? QUALITY_THROTTLE : 1));
    if (phone) {
        // A change to touch reloads the page: the world starts again as a phone opens it, as openWorld waits for it
        await page.setViewport(QUALITY_PHONE);
        await page.waitForFunction('window.game && window.game.environment && window.game.environment.isWorld && window.game.vehicle && window.game.worldRun', { timeout: 120000 });
        await page.evaluate(() => { window.game.adaptResolution = () => {}; });
        await page.addScriptTag({ path: join(root, 'tools/autopilot.js') });
    }
    // The level the device was given at the start, before anything here fixes one
    const startLevel = await page.evaluate(() => (game.quality ? { level: game.quality.level, id: Quality.LEVELS[game.quality.level].id, device: game.quality.device, groundTex: (game.effectLevels || {}).groundTex } : null));
    const client = await page.target().createCDPSession();
    const frames = Number(option('frames') || 40);
    const at = await page.evaluate(async (placeSource, share, atS) => {
        const placeAt = new Function('game', `return (${placeSource})`)(game);
        const s = Number.isFinite(atS) ? atS : Math.round(share * game.environment.route.length);
        await placeAt(s);
        game.setCameraView('near');
        game.worldCamera.reset(game.vehicle.yawAngle);
        twistyDev.autopilot({ speed: 0 });
        for (let i = 0; i < 240; i++) twistyDev.step(1);
        game.environment.streamer.pump(Infinity);
        return s;
    }, placeAt.toString(), QUALITY_AT_SHARE, option('at') !== undefined ? Number(option('at')) : NaN);
    // The timing runs slowed; the setting up and the pictures do not
    const slow = rate => client.send('Emulation.setCPUThrottlingRate', { rate });
    const time = () => page.evaluate(qualityFrames, frames);
    const result = { at, phone, throttle, frames, startLevel, view: await page.evaluate(() => ({ css: [innerWidth, innerHeight], dpr: devicePixelRatio, buffer: [game.renderer.domElement.width, game.renderer.domElement.height] })) };
    if (flag('measure')) {
        // Each part against the full frame measured just before it, round after round: the machine's drift cancels
        // --parts a,b: only those parts (fx-<id> for an effect)
        const parts = option('parts') ? option('parts').split(',') : await page.evaluate(qualityParts);
        const rounds = Number(option('rounds') || 3);
        const keys = ['updateMs', 'submitMs', 'waitMs', 'renderMs', 'gpuMs', 'frameMs'];
        const median = list => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)];
        const rows = [];
        let full = null;
        // The same frame at full speed: what the throttle adds
        const unthrottled = await time();
        for (const name of parts) {
            const runs = [];
            for (let k = 0; k < rounds; k++) {
                await slow(throttle);
                const base = await time();
                await slow(1);
                await page.evaluate(qualityPart, name, true);
                await page.evaluate(() => game.graphics.render(game.scene, game.camera));
                await slow(throttle);
                const off = await time();
                await slow(1);
                await page.evaluate(qualityPart, name, false);
                runs.push({ base, off });
                if (!full) full = base;
            }
            const row = { part: name, calls: runs[0].off.calls, triangles: runs[0].off.triangles, baseCalls: runs[0].base.calls, baseTriangles: runs[0].base.triangles };
            for (const key of keys) {
                if (runs[0].base[key] === null) continue;
                row[key] = median(runs.map(r => r.off[key]));
                row[`saved${key[0].toUpperCase()}${key.slice(1)}`] = Math.round(median(runs.map(r => r.base[key] - r.off[key])) * 100) / 100;
            }
            rows.push(row);
        }
        return { ...result, unthrottled, full, rows };
    }
    const out = option('out');
    if (out) mkdirSync(out, { recursive: true });
    if (out) await page.addStyleTag({ content: 'body * { visibility: hidden !important; } canvas { visibility: visible !important; }' });
    const count = await page.evaluate(() => Quality.LEVELS.length);
    const levels = [];
    for (let level = count - 1; level >= 0; level--) {
        const set = await page.evaluate(lvl => {
            game.quality.fix(lvl);
            // A level's settings are in force from the next frame: one drawn frame compiles what it changed
            game.graphics.render(game.scene, game.camera);
            const L = Quality.LEVELS[lvl];
            game.applyEffects();
            return { id: L.id, groundTex: (game.effectLevels || {}).groundTex, buffer: [game.renderer.domElement.width, game.renderer.domElement.height], shadow: game.renderer.shadowMap.enabled ? game.directionalLight.shadow.mapSize.x : 0, samples: game.graphics.sceneTarget ? game.graphics.sceneTarget.samples : null };
        }, level);
        await slow(throttle);
        const timing = await time();
        await slow(1);
        if (out) {
            await page.evaluate(() => game.graphics.render(game.scene, game.camera));
            await page.screenshot({ path: join(out, `level-${level}-${set.id}.png`) });
        }
        levels.push({ level, ...set, ...timing });
    }
    await page.evaluate(() => game.quality.release());
    return { ...result, levels };
};

// In the page: the median of `count` frames, after five unmeasured: the update (a game step without its draw), the
// draw's CPU (submit), the wait for the GPU after it (a 1-pixel read-back), the GPU's own time where the browser has a
// timer query (gpuMs, else null), the whole frame, and the draw calls and triangles of one frame
async function qualityFrames(count) {
    const renderer = game.graphics.renderer, gl = renderer.getContext();
    const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const pixel = new Uint8Array(4);
    const median = list => (list.length ? [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)] : null);
    const round = n => (n === null ? null : Math.round(n * 100) / 100);
    const update = [], submit = [], wait = [], frame = [], queries = [];
    renderer.info.autoReset = false;
    let info = null;
    // The updates first, then the draws of a scene that stands still (traffic moves with every update, and a car
    // in view or out of it would count as a part of the frame); the frame is an update and a draw by their medians
    for (let i = 0; i < count + 5; i++) {
        const t0 = performance.now();
        twistyDev.step(1);
        if (i >= 5) update.push(performance.now() - t0);
    }
    for (let i = 0; i < count + 5; i++) {
        const t1 = performance.now();
        renderer.info.reset();
        const query = timer && i >= 5 ? gl.createQuery() : null;
        if (query) gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
        game.graphics.render(game.scene, game.camera);
        if (query) { gl.endQuery(timer.TIME_ELAPSED_EXT); queries.push(query); }
        const t2 = performance.now();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        const t3 = performance.now();
        info = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
        if (i < 5) continue;
        submit.push(t2 - t1);
        wait.push(t3 - t2);
        frame.push(t3 - t1 + update[i - 5]);
    }
    renderer.info.autoReset = true;
    const gpu = [];
    for (let tries = 0; tries < 50 && queries.length; tries++) {
        await new Promise(done => setTimeout(done, 20));
        for (let k = queries.length - 1; k >= 0; k--) {
            if (!gl.getQueryParameter(queries[k], gl.QUERY_RESULT_AVAILABLE)) continue;
            if (!gl.getParameter(timer.GPU_DISJOINT_EXT)) gpu.push(gl.getQueryParameter(queries[k], gl.QUERY_RESULT) / 1e6);
            gl.deleteQuery(queries[k]);
            queries.splice(k, 1);
        }
    }
    return { updateMs: round(median(update)), submitMs: round(median(submit)), waitMs: round(median(wait)), renderMs: round(median(submit.map((v, k) => v + wait[k]))), gpuMs: round(median(gpu)), frameMs: round(median(frame)), worstMs: round(Math.max(...frame)), ...info };
}

// In the page: the parts world-quality turns off or down, one at a time; with --effects, each effect in force too
// (fx-<id>: that effect off, the others as they are)
function qualityParts() {
    const effects = Object.entries(game.effectLevels || {}).filter(([, level]) => level !== 'off').map(([id]) => `fx-${id}`);
    return [...effects, 'pixel-1.5', 'pixel-1', 'pixel-0.75', 'shadow-1024', 'shadow-512', 'shadow-none', 'msaa-0', 'bloom-none', 'haze-none', 'trees-none', 'houses-none', 'scenery-none', 'side-roads-none', 'far-land-none', 'land-none', 'traffic-none'];
}

// In the page: turns a part off (`on` true) or back as it was (`on` false). Everything it changes it keeps in
// window.__qualitySaved, so the part after it starts from the full frame
function qualityPart(name, on) {
    const g = game.graphics, r = game.renderer, env = game.environment, light = game.directionalLight;
    const saved = window.__qualitySaved || (window.__qualitySaved = {});
    const materials = () => {
        const all = new Set();
        game.scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => all.add(m)); });
        return all;
    };
    const hide = test => {
        if (on) {
            saved.hidden = [];
            game.scene.traverse(o => { if (o.visible && test(o)) { o.visible = false; saved.hidden.push(o); } });
        } else {
            (saved.hidden || []).forEach(o => { o.visible = true; });
        }
    };
    const shadowSize = size => {
        if (on) saved.shadow = light.shadow.mapSize.x;
        light.shadow.mapSize.set(on ? size : saved.shadow, on ? size : saved.shadow);
        if (light.shadow.map) { light.shadow.map.dispose(); light.shadow.map = null; }
    };
    if (name === 'full') return;
    if (name.startsWith('fx-')) {
        const id = name.slice(3);
        if (on) saved.effect = { ...game.effectLevels };
        Effects.apply(game, on ? { ...saved.effect, [id]: 'off' } : saved.effect);
        return;
    }
    if (name.startsWith('pixel-')) {
        if (on) saved.pixel = r.getPixelRatio();
        r.setPixelRatio(on ? Number(name.slice(6)) : saved.pixel);
    } else if (name === 'shadow-1024') shadowSize(1024);
    else if (name === 'shadow-512') shadowSize(512);
    else if (name === 'shadow-none') {
        r.shadowMap.enabled = !on;
        materials().forEach(m => { m.needsUpdate = true; });
    } else if (name === 'msaa-0') {
        if (on) saved.samples = g.sceneTarget.samples;
        g.sceneTarget.samples = on ? 0 : saved.samples;
        g.sceneTarget.dispose();
    } else if (name === 'bloom-none') {
        if (on) {
            saved.renderPass = g.renderPass;
            const skip = new Set([g.prefilterMaterial, g.downMaterial, g.upMaterial]);
            g.renderPass = function (material, target) { if (!skip.has(material)) saved.renderPass.call(this, material, target); };
        } else {
            g.renderPass = saved.renderPass;
        }
    } else if (name === 'haze-none') {
        if (on) {
            saved.hazeGlsl = Object.getOwnPropertyDescriptor(LandShade, 'HAZE_GLSL');
            const keep = saved.hazeGlsl.get.call(LandShade).replace(/vec3 worldHaze\(vec3 c, vec3 p\) \{[\s\S]*\}$/, 'vec3 worldHaze(vec3 c, vec3 p) { return c; }');
            Object.defineProperty(LandShade, 'HAZE_GLSL', { configurable: true, get: () => keep });
            saved.keys = new Map();
            materials().forEach(m => {
                if (!m.onBeforeCompile || m.isShaderMaterial) return;
                const key = m.customProgramCacheKey;
                saved.keys.set(m, key);
                m.customProgramCacheKey = () => `${key.call(m)}|no-haze`;
                m.needsUpdate = true;
            });
        } else {
            Object.defineProperty(LandShade, 'HAZE_GLSL', saved.hazeGlsl);
            saved.keys.forEach((key, m) => { m.customProgramCacheKey = key; m.needsUpdate = true; });
        }
    } else if (name === 'trees-none') hide(o => /^trees:/.test(o.name));
    else if (name === 'houses-none') hide(o => /^houses:/.test(o.name));
    else if (name === 'scenery-none') hide(o => o === env.sceneryGroup);
    else if (name === 'side-roads-none') hide(o => o === env.sideGroup);
    else if (name === 'far-land-none') hide(o => o === env.horizon || (env.farLand || []).includes(o));
    else if (name === 'land-none') hide(o => o === env.tileGroup);
    else if (name === 'traffic-none') hide(o => !!game.traffic && [...(game.traffic.cars || []).map(c => c.carGroup), ...(game.traffic.motorcycles || []).map(m => m.bikeGroup)].includes(o));
}

// The data world-hud rides when the run names no --worldData: the 6 km fixture of three stages
const WORLD_HUD_DATA = 'tests/fixtures/world/mini';

// The seeds world-finish rides: --seeds N rides N seeds from --seed (default 1); --seed S alone rides S once.
// Neither: WORLD_FINISH_SEEDS seeds from 1, so one lucky draw of the traffic cannot pass the probe.
const WORLD_FINISH_SEEDS = 5;
function finishSeeds() {
    const first = option('seed') !== undefined ? Number(option('seed')) : 1;
    const count = option('seeds') !== undefined ? Number(option('seeds')) : option('seed') !== undefined ? 1 : WORLD_FINISH_SEEDS;
    if (!Number.isInteger(first) || !Number.isInteger(count) || count < 1) fail(2, `--seed and --seeds take whole numbers, --seeds at least 1 (got ${option('seed')}, ${option('seeds')})`);
    return Array.from({ length: count }, (_, i) => first + i);
}

// world-model-shots: the models a world ride draws, group by group, with their counts and GPU pictures. At each
// station (--at s,s, or every --every metres of the stage) the bike is put down and every drawn mesh is sorted into a
// group by its name or the name of what holds it (MODEL_GROUPS): its meshes, its copies and its triangles. For each
// group the copy nearest the ride's edge is pictured twice with the bike hidden: close (2.5 times its size off, at
// least 3 m, from the road's side) and at play distance (from the ride MODEL_PLAY_M back, 2.6 m up, as the chase view
// sees it). --groups a,b takes only those groups. <tag>-index.json holds the inventory by station and the views
//   node tools/terrain-check.mjs world-model-shots --world tremola --gpu --desk [--at s,s] [--every m] [--groups a,b] [--out <dir>] [--tag T]
const MODEL_SHOTS_OUT = join(process.env.HOME || '.', 'Library/Caches/twisty-world/model-shots');
const MODEL_PLAY_M = 22;
// A group's id from a drawn mesh's name, or (@) the name of a group that holds it; the first match wins
const MODEL_GROUPS = [
    ['bush', '^trees:bush'], ['tree', '^trees:'], ['tufts', '^tufts$'], ['boulders', '^boulders$'], ['houses', '^houses:'],
    ['stones', '^stones$'], ['kerbs', '^stone-kerbs$'], ['landmarks', '^landmark:'],
    ['plant', '^roadworks:(digger|roller|compressor)$'], ['stores', '^roadworks:(pallets|kerbs|setts|pipes)$'], ['roadworks', '^roadworks:'],
    ['places', '@^world-places$'], ['stops', '^stop-'], ['marmots', '^marmot'], ['cars', '@^probe-car$'],
    ['crew', '@^probe-crew$'], ['player', '@^probe-player$'], ['cover', '@^ground-cover$'],
    ['road', '@^world-road-section$|^world-side-'], ['world', '@^world$']
];
WORLD_PROBES.push('world-model-shots');
WORLD['world-model-shots'] = async (page) => {
    const out = option('out') || join(MODEL_SHOTS_OUT, 'shots');
    mkdirSync(out, { recursive: true });
    const tag = option('tag') || 'models';
    const only = option('groups') ? option('groups').split(',') : null;
    await page.addStyleTag({ content: 'body * { visibility: hidden !important; } canvas { visibility: visible !important; }' });
    const stations = option('at') ? option('at').split(',').map(Number) : await page.evaluate(every => {
        const env = game.environment, stage = env.stage, route = env.route;
        const from = stage ? stage.from : 0, to = stage ? stage.to : route.length;
        return Array.from({ length: Math.floor((to - from - 200) / every) + 1 }, (_, k) => Math.round(from + 100 + k * every));
    }, Number(option('every') || 600));
    // Each station and each picture is a call of its own: one call for the whole ride ran past the protocol's timeout
    const inventory = [], best = {};
    for (const s of stations) {
        const station = await page.evaluate(modelStation, placeAt.toString(), countScene.toString(), MODEL_GROUPS, s, only);
        inventory.push({ s, counts: station.counts, groups: station.groups });
        for (const [g, c] of Object.entries(station.best)) {
            if (best[g] && c.score >= best[g].score) continue;
            best[g] = c;
            if (station.live[g]) best[g].pngs = station.live[g];
        }
    }
    const views = {};
    for (const [group, b] of Object.entries(best)) {
        const { pngs: taken, ...copy } = b;
        const pngs = taken || await page.evaluate(modelPictures, placeAt.toString(), copy, MODEL_PLAY_M, group);
        views[group] = { s: Math.round(b.near.s), at: b.s, distance: Math.round(b.near.d * 10) / 10, size: Math.round(b.copy.size * 100) / 100, triangles: b.triangles, name: b.name, files: {} };
        for (const [name, png] of Object.entries(pngs)) {
            const file = join(out, `${tag}-${group}-${name}.png`);
            writeFileSync(file, Buffer.from(png.split(',')[1], 'base64'));
            views[group].files[name] = file;
        }
    }
    writeFileSync(join(out, `${tag}-index.json`), JSON.stringify({ stations: inventory, views }, null, 1));
    return { out, stations: inventory.map(st => ({ s: st.s, counts: st.counts, groups: Object.fromEntries(Object.entries(st.groups).map(([g, r]) => [g, `${r.meshes} meshes, ${r.instances} copies, ${r.triangles} triangles`])) })), views: Object.fromEntries(Object.entries(views).map(([g, r]) => [g, { s: r.s, name: r.name, triangles: r.triangles, distance: r.distance }])) };
};

// In the page: the bike put down at s, every drawn mesh sorted into its group with its counts, and for each group
// pictured the copy nearest the ride's edge: {counts, groups, best: {group: {score, s, copy, near, name, triangles}}}
async function modelStation(placeSource, countSource, groupRules, s, only) {
    const placeAt = new Function('game', `return (${placeSource})`)(game);
    const count = new Function(`return (${countSource})`)();
    const env = game.environment, route = env.route, v = game.vehicle;
    const rules = groupRules.map(([id, pattern]) => ({ id, held: pattern.startsWith('@'), re: new RegExp(pattern.replace(/^@/, '')) }));
    // The vehicles' groups have no names: give them the probe's own, once, where they have none
    const name = (o, id) => { if (o && !o.name) o.name = id; };
    const label = () => {
        name(v.group, 'probe-player');
        if (game.traffic) {
            for (const car of game.traffic.cars || []) name(car.carGroup, 'probe-car');
            for (const bike of game.traffic.motorcycles || []) name(bike.bikeGroup, 'probe-crew');
        }
    };
    const groupOf = o => {
        for (const rule of rules) {
            if (!rule.held) { if (rule.re.test(o.name)) return rule.id; continue; }
            for (let n = o.parent; n; n = n.parent) if (rule.re.test(n.name)) return rule.id;
        }
        return 'scene';
    };
    const visible = o => { for (let n = o; n; n = n.parent) if (!n.visible) return false; return true; };
    const m = new THREE.Matrix4(), box = new THREE.Box3(), size = new THREE.Vector3(), centre = new THREE.Vector3();
    await placeAt(s);
    await placeAt(s);
    for (let i = 0; i < 30; i++) twistyDev.step(1);
    label();
    const bike = v.position;
    // The copies of a mesh nearest the bike, at most 60: [{x, y, z, size, top, foot}]
    const copies = o => {
        o.updateMatrixWorld(true);
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        const list = [];
        const push = matrix => {
            box.copy(o.geometry.boundingBox).applyMatrix4(matrix);
            box.getSize(size); box.getCenter(centre);
            list.push({ x: centre.x, y: centre.y, z: centre.z, size: Math.max(size.x, size.y, size.z), top: box.max.y, foot: box.min.y });
        };
        if (o.isInstancedMesh) for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); push(m.premultiply(o.matrixWorld)); }
        else if (o.userData.tufts) for (const t of o.userData.tufts) list.push({ x: t.x, y: t.y + t.height / 2, z: t.z, size: Math.max(t.radius * 2, t.height), top: t.y + t.height, foot: t.y });
        // (a stopping place's props are one mesh: each solid prop of it, a bench, a bin or a post, is a copy)
        else if (o.userData.places && env.placeMesh) for (const w of env.placeMesh.solids) {
            const y = env.ground.tileHeight(w.x, w.z);
            if (y !== null) list.push({ x: w.x, y: y + 0.5, z: w.z, size: Math.max(w.along, w.across, 1), top: y + 1, foot: y });
        }
        else push(o.matrixWorld);
        return list.sort((p, q) => Math.hypot(p.x - bike.x, p.z - bike.z) - Math.hypot(q.x - bike.x, q.z - bike.z)).slice(0, 60);
    };
    const pictured = ['bush', 'tufts', 'boulders', 'houses', 'stones', 'kerbs', 'landmarks', 'plant', 'stores', 'roadworks', 'places', 'stops', 'marmots', 'cars', 'crew'];
    const groups = {}, best = {};
    game.scene.traverse(o => {
        if (!o.isMesh || !visible(o)) return;
        const g = groupOf(o);
        const pos = o.geometry.attributes.position, index = o.geometry.index;
        const each = Math.round((index ? index.count : pos.count) / 3);
        const n = o.isInstancedMesh ? o.count : 1;
        const r = groups[g] || (groups[g] = { meshes: 0, instances: 0, triangles: 0, names: {} });
        r.meshes++; r.instances += n; r.triangles += each * n;
        const key = o.name || (o.parent && o.parent.name) || '(none)';
        r.names[key] = Math.max(r.names[key] || 0, each);
        if (!pictured.includes(g) || (only && !only.includes(g)) || !n) return;
        for (const c of copies(o)) {
            const at = route.project(c.x, c.z, null, {});
            if (!at || !Number.isFinite(at.s)) continue;
            const p = route.sample(at.s, {});
            const d = Math.hypot(p.x - c.x, p.z - c.z) - p.width / 2 - c.size / 2;
            // A copy beside the ride: the nearest to the road's edge, not on it (a car or a rider on it is taken)
            if (d > 40 || (d < 0.5 && !['cars', 'crew', 'roadworks', 'plant', 'stores', 'places'].includes(g))) continue;
            const score = Math.max(d, 0) + Math.abs(at.s - s) * 0.01;
            if (!best[g] || score < best[g].score) best[g] = { score, s, copy: c, near: { s: at.s, d: Math.hypot(p.x - c.x, p.z - c.z), p: { x: p.x, y: p.y, z: p.z } }, name: key, triangles: each };
        }
    });
    // The vehicles move on as soon as the bike is put down again: their pictures are taken here, as they stand now,
    // from beside each (2.5 times its size off) and from the bike's place on the ride, the bike hidden
    const live = {};
    const shown = v.group ? v.group.visible : null;
    for (const g of ['cars', 'crew']) {
        const b = best[g];
        if (!b) continue;
        if (v.group) v.group.visible = false;
        const look = (eye, target) => {
            game.camera.position.copy(eye);
            game.camera.lookAt(target);
            game.camera.updateMatrixWorld(true);
            game.graphics.render(game.scene, game.camera);
            return game.graphics.renderer.domElement.toDataURL('image/png');
        };
        const c = b.copy, p = b.near.p, dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz) || 1;
        const reach = Math.max(3, c.size * 1.6), sx = dz / d, sz = -dx / d;
        const target = new THREE.Vector3(c.x, c.foot + (c.top - c.foot) * 0.5, c.z);
        live[g] = {
            close: look(new THREE.Vector3(c.x + (dx / d + sx) * reach * 0.7, c.foot + 1.4, c.z + (dz / d + sz) * reach * 0.7), target),
            play: look(new THREE.Vector3(v.position.x, v.position.y + 2.6, v.position.z), target)
        };
        if (v.group) v.group.visible = shown;
    }
    return { counts: count(), groups, best, live };
}

// In the page: the close and the play-distance pictures of one copy (modelStation's `best`), the bike hidden
async function modelPictures(placeSource, b, playM, group) {
    const placeAt = new Function('game', `return (${placeSource})`)(game);
    const env = game.environment, route = env.route, v = game.vehicle;
    game.setCameraView('near');
    // (the bike beside the copy, so its level of detail is the one a rider passing it sees)
    await placeAt(b.near.s);
    await placeAt(b.near.s);
    game.worldCamera.reset(v.yawAngle);
    twistyDev.autopilot({ speed: 0 });
    v.speed = 0;
    for (let i = 0; i < 30; i++) twistyDev.step(1);
    env.streamer.pump(Infinity);
    twistyDev.step(1, { render: true });
    const shown = v.group ? v.group.visible : null;
    if (v.group) v.group.visible = false;
    const shot = () => game.graphics.renderer.domElement.toDataURL('image/png');
    const look = (eye, target) => {
        game.camera.position.copy(eye);
        game.camera.lookAt(target);
        game.camera.updateMatrixWorld(true);
        game.graphics.render(game.scene, game.camera);
        return shot();
    };
    const c = b.copy, p = b.near.p;
    const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz) || 1;
    const reach = Math.max(3, c.size * 2.5);
    const ex = c.x + dx / d * reach, ez = c.z + dz / d * reach;
    const ground = env.ground.tileHeight(ex, ez);
    const ey = Math.max(ground === null ? c.foot : ground, c.foot) + Math.max(1.2, Math.min(c.size * 0.6, 6));
    const target = new THREE.Vector3(c.x, c.foot + (c.top - c.foot) * 0.45, c.z);
    const pngs = { close: look(new THREE.Vector3(ex, ey, ez), target) };
    const back = route.sample(Math.max(0, b.near.s - playM), {});
    pngs.play = look(new THREE.Vector3(back.x, back.y + 2.6, back.z), target);
    if (v.group) v.group.visible = shown;
    return pngs;
}

// The world probes about the group, and world-quality, which times the frame as a ride draws it: the pilot rides with
// the crew there (every other world probe's pilot rides alone, rideAlone)
const CREW_PROBES = new Set(['world-finish', 'world-shot', 'world-group-shots', 'world-place-shots', 'world-stop-shots', 'world-roam', 'world-crew-start', 'world-quality']);

async function worldMain() {
    const executablePath = chromePath();
    const gpu = flag('gpu');
    const server = await startServer();
    const port = server.address().port;
    const args = gpu ? [] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
    // (four hours for one call into the page: world-pops --villages rides every village of a long leg at two speeds in one)
    const browser = await puppeteer.launch({ protocolTimeout: 14400000, executablePath, headless: 'new', args: ['--no-sandbox', ...args] });
    const id = option('world') || 'tremola';
    const report = { chrome: executablePath, mode: gpu ? 'gpu' : 'headless', world: id, blocked: state.blocked, notFound: state.notFound, pageErrors: state.pageErrors, results: {}, failures: [], notes: [] };
    let exit = 0;
    try {
        for (const name of probes) {
            if (!WORLD[name]) { report.failures.push(`unknown probe ${name}`); continue; }
            if (name === 'world-finish') {
                // One ride per seed, each on a fresh page whose Math.random starts at that seed (traffic, the crew)
                const rides = [];
                for (const seed of finishSeeds()) {
                    state.requests = [];
                    const page = await openWorld(browser, port, id, seed);
                    await page.evaluate(crew => { window.probeCrew = crew; }, CREW_PROBES.has(name));
                    rides.push({ seed, ...(await WORLD[name](page, port)) });
                    await page.close();
                    state.requests = null;
                }
                report.results[name] = { seeds: rides.map(r => r.seed), finished: rides.filter(r => r.finished && !r.crashed).length, rides };
                continue;
            }
            state.requests = [];
            // The stage HUD needs a ride of two stages or more; the shipped data holds one, so without --worldData
            // it rides the two-stage fixture
            const page = name.startsWith('hill-') ? await openHill(browser, port) : name === 'world-hud' && !option('worldData')
                ? await openWorld(browser, port, 'all', 1, WORLD_HUD_DATA)
                : await openWorld(browser, port, id);
            await page.evaluate(crew => { window.probeCrew = crew; }, CREW_PROBES.has(name));
            report.results[name] = await WORLD[name](page, port);
            if (name === 'world-net') report.results[name].offHost = state.requests.filter(url => !isAllowedRequest(url, port));
            await page.close();
            state.requests = null;
        }
        worldChecks(report);
    } catch (error) {
        report.failures.push(String(error.stack || error));
        exit = 2;
    } finally {
        await browser.close();
        server.close();
    }
    if (state.pageErrors.length) report.failures.push(...state.pageErrors.map(e => `page error: ${e}`));
    const missing = state.notFound.filter(u => !u.endsWith('/favicon.ico'));
    if (missing.length) report.failures.push(...missing.map(u => `404: ${u}`));
    if (state.effects) report.effects = state.effects;
    if (state.consoleErrors) report.consoleErrors = state.consoleErrors;
    report.failures.length && (exit = exit || 1);
    // Exit once the report has drained: process.exit cuts a piped stdout at 64 KB
    process.stdout.write(`${JSON.stringify(report, null, 1)}\n`, () => process.exit(exit));
}

function isAllowedRequest(url, port) {
    if (url.startsWith('data:') || url.startsWith('blob:')) return true;
    const target = new URL(url);
    if (target.host === `127.0.0.1:${port}`) return ALLOWED_PATHS.test(target.pathname);
    return ALLOWED_HOSTS.some(host => target.hostname === host);
}

// world-trees: in a clear view each band with TREE_MIN_PX tree pixels or more keeps its mean saturation and value inside
// the photos' range (TREE_BANDS), and in every view (rain too) a band's trees outshine the land round them by no more
// than TREE_OVER_LAND
function treeChecks(results, failures) {
    const trees = results['world-trees'];
    if (!trees) return;
    let read = 0;
    for (const view of trees.views) {
        const where = `s ${view.s}${view.rain ? ' (rain)' : ''}${view.turnDeg ? ` turned ${view.turnDeg}` : ''}`;
        view.bands.forEach((band, k) => {
            const want = TREE_BANDS[k];
            if (!(band.trees.px >= TREE_MIN_PX)) return;
            read++;
            if (!view.rain) {
                if (band.trees.s < want.s[0] || band.trees.s > want.s[1]) failures.push(`world-trees: at ${where} the ${want.name} trees' mean saturation is ${band.trees.s}, outside the photos' ${want.s.join(' to ')}`);
                if (band.trees.v < want.v[0] || band.trees.v > want.v[1]) failures.push(`world-trees: at ${where} the ${want.name} trees' mean value is ${band.trees.v}, outside the photos' ${want.v.join(' to ')}`);
            }
            if (band.vOverLand > TREE_OVER_LAND) failures.push(`world-trees: at ${where} the ${want.name} trees are ${band.vOverLand} brighter (HSV value) than the land round them, over ${TREE_OVER_LAND}`);
        });
    }
    if (read < 5) failures.push(`world-trees: only ${read} view bands held ${TREE_MIN_PX} tree pixels or more, want 5`);
}

// world-stop-shots: the scene at the leg's end stop (js/world/stopscene.js). The bike is put down STOP_SHOTS_BACK_M
// before the finish line and the ride finished there; the scene is then run in steps of 1/30 s (the land streamed
// round the stop) and the screen saved at each moment (--at seconds), with the bars, the card and the riders. It
// fails on a stage with no stop at its end, a rider not parked in its slot (over STOP_SLOT_M off it) or not stood
// off its bike at the end, a bike or a standing rider's boots off the ground (STOP_GROUND_M), the camera under the
// ground, and no card at the end.
//   node tools/terrain-check.mjs world-stop-shots --world gotthard-north --gpu [--out <dir>] [--at 1,4,8,12,16,20]
const STOP_SHOTS_BACK_M = 20;
const STOP_SLOT_M = 0.3;
const STOP_GROUND_M = 0.15;
const STOP_SHOTS_OUT = join(process.env.HOME || '.', 'Library/Caches/twisty-world/6f-shots/stop');
WORLD_PROBES.push('world-stop-shots');
WORLD['world-stop-shots'] = async (page) => {
    const out = option('out') || STOP_SHOTS_OUT;
    mkdirSync(out, { recursive: true });
    const tag = option('tag') || (option('world') || 'tremola');
    const moments = (option('at') || '1,4,8,12,16,20').split(',').map(Number);
    const begun = await page.evaluate(async (placeSource, back) => {
        const placeAt = new Function('game', `return (${placeSource})`)(game);
        const env = game.environment;
        if (typeof StopScene === 'undefined' || !StopScene.stopAt(env)) return { error: `no stop at the end of ${env.stage ? env.stage.id : 'the ride'}` };
        game.worldLinger = false;
        await placeAt(env.endS - back);
        twistyDev.freeze();
        game.finishRun();
        return { stop: StopScene.stopAt(env).id, scene: !!game.stopScene };
    }, placeAt.toString(), STOP_SHOTS_BACK_M);
    if (begun.error) return { error: begun.error };
    const shots = [];
    let at = 0;
    for (const t of moments) {
        await page.evaluate(async (until) => {
            const env = game.environment, scene = game.stopScene;
            while (scene && scene.t < until) {
                game.stepStopScene(1 / 30);
                env.update(game.vehicle.position, scene.stop.s, null, Infinity, 1 / 30);
            }
            game.lastCullTime = 0;
            game.updatePerformanceCulling();
            await env.streamer.settle(game.vehicle.position, scene.stop.s);
            game.graphics.render(game.scene, game.camera);
        }, t);
        at = t;
        const file = join(out, `${tag}-stop-${String(t).padStart(2, '0')}s.png`);
        await page.screenshot({ path: file });
        shots.push({ t, file });
    }
    // (then on until every rider has parked and got off, for the checks)
    await page.evaluate(() => {
        const env = game.environment, scene = game.stopScene;
        while (scene && scene.t < Math.max(scene.allParkedS + StopScene.GET_OFF_S + 0.5, scene.cardAt + 0.1)) {
            game.stepStopScene(1 / 30);
            env.update(game.vehicle.position, scene.stop.s, null, Infinity, 1 / 30);
        }
    });
    const end = await page.evaluate(() => {
        const scene = game.stopScene, env = game.environment;
        const ground = (x, z) => env.ground.groundY(x, z, null);
        const riders = scene.riders.map((r) => {
            const group = r.player ? r.bike.group : r.bike.bikeGroup;
            const p = group.position;
            const y = ground(p.x, p.z);
            const boot = r.stood && r.bike.legs ? r.bike.rider.localToWorld(r.bike.legs[-1].at().clone()) : null;
            const by = boot ? ground(boot.x, boot.z) : null;
            let shown = true;
            for (let o = group; o; o = o.parent) if (!o.visible) shown = false;
            return { who: r.bike.character ? r.bike.character.id : '?', player: !!r.player, inScene: !!group.parent, shown, meshesShown: (() => { let n = 0; group.traverse(o => { if (o.isMesh && o.visible) n++; }); return n; })(), offSlotM: Math.round(Math.hypot(p.x - r.slot.x, p.z - r.slot.z) * 100) / 100,
                overGroundM: Math.round((p.y - y) * 100) / 100, stood: !!r.stood, bootOverGroundM: boot ? Math.round((boot.y - by - 0.03) * 100) / 100 : null, vape: r.actions.includes('vape') };
        });
        const cam = game.camera.position;
        const v = game.vehicle;
        const debug = { position: [v.position.x, v.position.y, v.position.z], group: [v.group.position.x, v.group.position.y, v.group.position.z], parent: v.group.parent && v.group.parent.type, slot0: scene.riders[0].slot, groundAt: ground(v.position.x, v.position.z) };
        return { debug, riders, cameraOverGroundM: Math.round((cam.y - ground(cam.x, cam.z)) * 100) / 100, card: !!document.querySelector('#finishBanner.stop-card'), bars: [...document.querySelectorAll('.stop-bar')].map(b => b.getBoundingClientRect().height), puffs: scene.puffs.length, kind: scene.stop.kind };
    });
    // and the stop from over it (25 m up and back from the bikes toward the road), and the group close (6 m up, 12 back)
    for (const [name, up, back] of [['over', 25, 25], ['group', 6, 12]]) {
        await page.evaluate((up, back) => {
            const scene = game.stopScene, f = StopScene.frame(scene.stop), env = game.environment;
            const y = env.ground.groundY(f.ox, f.oz, null);
            game.camera.position.set(f.ox - back * f.outX, y + up, f.oz - back * f.outZ);
            game.camera.lookAt(f.ox, y + 1, f.oz);
            game.graphics.render(game.scene, game.camera);
        }, up, back);
        const file = join(out, `${tag}-stop-${name}.png`);
        await page.screenshot({ path: file });
        shots.push({ t: name, file });
    }
    writeFileSync(join(out, `${tag}-index.json`), JSON.stringify({ begun, shots, end }, null, 1));
    return { ...begun, last: at, shots, ...end };
};

// world-steps: every streaming step of a ride, timed. The land is streamed along the stage every STEPS_M as the ride
// does (the streamer's own budget a frame), and each step is timed with its parts (the rows, the wall plans, the land's
// cut, the land, the scenery). A step is what one frame's pump ran of one task: a whole build, or a slice of a build in
// steps (WorldStreamer). Every build is taken in steps of about 12 ms at the most; it fails on any step over
// STEPS_MOST_MS. A step is timed by the wall clock, so a busy host times every kind of step long, with the time outside
// every part timed (the laptop at a load of 9 on 10 CPUs: steps of 68, 31, 26 and 18 ms where the Mac mini, on the
// same commit, took 12 at the most): the host's load per CPU is read before and after the ride, and over
// STEPS_LOAD_MOST the run fails as not measured, not as slow steps. Run it on a quiet host (heavy -c browser)
//   node tools/terrain-check.mjs world-steps --world tremola --gpu [--every 1] [--parts deep]
const STEPS_M = 1;
const STEPS_MOST_MS = 16;
const STEPS_LOAD_MOST = 0.8;
const hostLoad = () => Math.round(loadavg()[0] / cpus().length * 100) / 100;
WORLD_PROBES.push('world-steps');
WORLD['world-steps'] = async (page) => {
    const before = hostLoad();
    const ride = await stepsRide(page);
    return { ...ride, hostLoad: Math.max(before, hostLoad()) };
};
const stepsRide = async (page) => page.evaluate(async (every, deep) => {
    const env = game.environment, route = env.route;
    const now = () => performance.now();
    const parts = {};
    const wrap = (obj, name, label) => {
        const f = obj[name];
        if (typeof f !== 'function') return;
        obj[name] = function (...a) { const t = now(); try { return f.apply(this, a); } finally { parts[label] = (parts[label] || 0) + now() - t; } };
    };
    // (the parts timed are the coarse ones: a wrapper on a call made thousands of times a step, as the ground's height
    // is, costs more than the call and swells the step; --parts deep adds those to find where a step goes)
    for (const m of ['rowsOf', 'tubeRows', 'rideWalls', 'buildTile', 'buildSide', 'cutsOf']) wrap(env, m, `env.${m}`);
    for (const m of ['ribbon', 'tunnel', 'bridge', 'viaduct']) wrap(RoadMesh, m, `road.${m}`);
    wrap(TerrainMesh, 'build', 'land.build');
    for (const m of ['rankTrees', 'rankStones', 'instanced']) wrap(env.scenery, m, `scenery.${m}`);
    if (deep) {
        for (const m of ['footY', 'stonePlace', 'wallRuns', 'hairpinRuns', 'wetUnder', 'clear']) wrap(env.scenery, m, `scenery.${m}`);
        for (const m of ['tileHeight', 'groundY', 'sideRoadY', 'kindAt']) wrap(env.ground, m, `ground.${m}`);
        for (const m of ['surveyViaducts', 'mouthCut', 'goreRow', 'wallRunsNear', 'holdSide', 'sideMouths', 'fromRideEnd', 'liftSide', 'drawSideRibbons', 'rideWallEnds', 'wallJoins', 'sideOnward', 'edgeFoot', 'setSideWalls', 'setSideTubes', 'clipHorizon', 'tubesNear', 'rideSurfaceAt']) wrap(env, m, `env.${m}`);
        for (const m of ['sideStructures', 'vergeSides', 'sideRoad', 'ribbonMesh']) wrap(RoadMesh, m, `road.${m}`);
        for (const m of ['grid', 'build']) wrap(Horizon, m, `horizon.${m}`);
        for (const m of ['clumps', 'colours', 'laidBack', 'ring', 'skirtDepth', 'tubeBox']) wrap(TerrainMesh, m, `land.${m}`);
        for (const m of ['tubesNear', 'hasTileData']) wrap(env, m, `env.${m}`);
    }
    // A step is what one pump ran of one task: a whole build, or the slice of a build in steps (WorldStreamer.pump)
    const tasks = [];
    const streamer = env.streamer, enqueue = streamer.enqueue.bind(streamer), pump = streamer.pump.bind(streamer);
    let slices = new Map();
    const slice = (id) => { if (!slices.has(id)) slices.set(id, { id, ms: 0, parts: {} }); return slices.get(id); };
    const timed = (id, f) => {
        for (const k of Object.keys(parts)) delete parts[k];
        const t = now();
        try { return f(); } finally {
            const rec = slice(id);
            rec.ms += now() - t;
            for (const [k, v] of Object.entries(parts)) rec.parts[k] = (rec.parts[k] || 0) + v;
        }
    };
    streamer.enqueue = (id, priority, run) => enqueue(id, priority, () => {
        const out = timed(id, run);
        if (!out || typeof out.next !== 'function') return out;
        return { next: () => timed(id, () => out.next()), [Symbol.iterator]() { return this; } };
    });
    streamer.pump = (budget) => {
        slices = new Map();
        const n = pump(budget);
        for (const rec of slices.values()) tasks.push({ id: rec.id, ms: rec.ms, parts: Object.fromEntries(Object.entries(rec.parts).map(([k, v]) => [k, Math.round(v * 10) / 10])) });
        return n;
    };
    const stage = env.stage;
    const from = (stage ? stage.from : 0) + 50, to = stage ? Math.min(route.length, stage.to + 100) : route.length;
    const p0 = route.sample(from, {});
    env.update(p0, from, null, Infinity);
    await streamer.settle(p0, from);
    tasks.length = 0;
    let frames = 0;
    for (let s = from; s <= to; s += every) {
        const p = route.sample(s, {});
        env.update(p, s, null, 4, every / 25);
        frames++;
        if (frames % 200 === 0) await new Promise(r => setTimeout(r, 0));
    }
    streamer.enqueue = enqueue;
    streamer.pump = pump;
    const kinds = {};
    for (const t of tasks) { const k = t.id.split(':')[0]; (kinds[k] = kinds[k] || []).push(t.ms); }
    const stat = v => { v.sort((a, b) => a - b); return { n: v.length, median: Math.round(v[v.length >> 1] * 10) / 10, p95: Math.round(v[Math.floor(v.length * 0.95)] * 10) / 10, max: Math.round(v[v.length - 1] * 10) / 10, over: v.filter(x => x > 12).length }; };
    const byKind = Object.fromEntries(Object.entries(kinds).map(([k, v]) => [k, stat(v)]));
    const sorted = tasks.sort((a, b) => b.ms - a.ms);
    const slowest = sorted.slice(0, 25).map(t => ({ id: t.id, ms: Math.round(t.ms * 10) / 10, parts: t.parts }));
    const slowestByKind = {};
    for (const t of sorted) {
        const k = t.id.split(':')[0], list = slowestByKind[k] || (slowestByKind[k] = []);
        if (list.length < 4) list.push({ id: t.id, ms: Math.round(t.ms * 10) / 10, parts: t.parts });
    }
    return { frames, tasks: tasks.length, byKind, slowest, slowestByKind };
}, Number(option('every') || STEPS_M), option('parts') === 'deep');

// world-shot: the held shot at a leg's end (StopScene.flyAt, StopScene.holdOf, Game.raiseShot). The ride is ridden
// into its finish line by the autopilot at SHOT_RIDE_MS with the chase camera, and the scene starts there as in a ride.
// It saves the fly at each moment (--fly seconds), measures the step from the chase camera's last frame to the
// scene's first (place, aim, lens) and the worst frame of the fly, and the held shot. With --levels it fixes each
// graphics level in turn and times the held shot without and with the raise (SHOT_FRAMES frames: the update, the
// draw and its wait, the GPU timer), and saves the held shot at each. --phone is world-quality's phone (390 x 844 at
// 3, touch, the CPU 4 times slower). It fails on a step from the chase camera (SHOT_STEP), no bars, or a held shot
// with the camera under the ground. It reports what the held shot draws (counts, by kind of mesh).
//   node tools/terrain-check.mjs world-shot --world gotthard-north --gpu [--desk] [--phone] [--levels] [--fly 0,1,3,5,7,9] [--out <dir>]
const SHOT_RIDE_MS = 14;
// The ride into the line starts this far before it, so the scene's kinds of mesh have been drawn as in a real ride
const SHOT_APPROACH_M = 800;
const SHOT_FRAMES = 40;
// No frame of the fly may take longer than this (the scene's step, the land's update, the cull and the draw)
const SHOT_FRAME_MS = 50;
// A step is a frame whose move (or turn, or change of lens) differs from the frame before's by more than this: the fly may
// be fast (the Tremola's hold is 644 m back), never sudden. The first frame is held to the chase camera's own move
const SHOT_STEP = { moveM: 0.1, aimDeg: 0.05, lensDeg: 0.02 };
const SHOT_OUT = join(process.env.HOME || '.', 'Library/Caches/twisty-world/lookout-shots');
WORLD_PROBES.push('world-shot');
WORLD['world-shot'] = async (page) => {
    const phone = flag('phone');
    const throttle = phone ? QUALITY_THROTTLE : 1;
    if (phone) {
        await page.setViewport(QUALITY_PHONE);
        await page.waitForFunction('window.game && window.game.environment && window.game.environment.isWorld && window.game.vehicle && window.game.worldRun', { timeout: 120000 });
        await page.evaluate(() => { window.game.adaptResolution = () => {}; });
        await page.addScriptTag({ path: join(root, 'tools/autopilot.js') });
    }
    const client = await page.target().createCDPSession();
    const slow = rate => client.send('Emulation.setCPUThrottlingRate', { rate });
    const out = option('out') || SHOT_OUT;
    mkdirSync(out, { recursive: true });
    const tag = `${option('tag') || option('world') || 'tremola'}${phone ? '-phone' : ''}`;
    const moments = (option('fly') || '0,1,2,3,4,5,6,8,10,12,14,16,18').split(',').map(Number);
    await page.addStyleTag({ content: '#finishBanner, .modal-backdrop { visibility: hidden !important; }' });
    // --hold x,z,upM,bearing,pitch,hfov tries another hold for the stop (a candidate pose; the shipped table is not changed)
    const tryHold = option('hold') ? option('hold').split(',').map(Number) : null;
    // --no-raise: the scene with no raise at any level, to tell the raise's cost from the scene's own
    if (flag('no-raise')) await page.evaluate(() => Object.defineProperty(StopScene, 'RAISE', { configurable: true, get: () => ({}) }));
    const begun = await page.evaluate(async (placeSource, ride, tryHold, SHOT_APPROACH_M) => {
        const placeAt = new Function('game', `return (${placeSource})`)(game);
        const env = game.environment;
        if (typeof StopScene === 'undefined' || !StopScene.stopAt(env)) return { error: `no stop at the end of ${env.stage ? env.stage.id : 'the ride'}` };
        if (tryHold) {
            const [x, z, upM, bearing, pitch, hfov] = tryHold;
            const id = StopScene.stopAt(env).id;
            Object.defineProperty(StopScene, 'HOLDS', { configurable: true, get: () => ({ [id]: { x, z, upM, bearing, pitch, hfov, vfovMost: 60 } }) });
        }
        game.worldLinger = false;
        await placeAt(env.endS - SHOT_APPROACH_M);
        // (in the chase view, as a ride is: the scene starts from the chase camera's pose)
        game.setCameraView('near');
        game.worldCamera.reset(game.vehicle.yawAngle);
        twistyDev.autopilot({ speed: ride });
        // Ridden to just short of the line with the chase camera (each step updates it), then over the line
        const at = () => (Number.isFinite(game.vehicle.projection.s) ? game.vehicle.projection.s : game.vehicle.routeS);
        let ridden = 0;
        for (; ridden < 8000 && at() < env.endS - 1; ridden++) twistyDev.step(1);
        if (ridden < 10) return { error: `the autopilot rode ${ridden} frames to the line (from s ${Math.round(at())}, the line at ${Math.round(env.endS)})` };
        // (and what is in the scene is compiled, as a ride over the whole stage would have. A depth program of the sun's
        // shadow is not compiled here: the stop's own casters must not need one of their own)
        game.graphics.renderer.compile(game.scene, game.camera);
        const cam = game.camera;
        const aim = new THREE.Euler().setFromQuaternion(cam.quaternion, 'YXZ');
        const before = { x: cam.position.x, y: cam.position.y, z: cam.position.z, yaw: aim.y, pitch: aim.x, roll: aim.z, fov: cam.fov };
        const speed = game.vehicle.speed;
        game.finishRun();
        if (!game.stopScene) return { error: 'the finish started no stop scene' };
        const depthPrograms = (game.graphics.renderer.info.programs || []).filter(pr => pr.name === 'MeshDepthMaterial').map(pr => String(pr.cacheKey).slice(0, 120));
        return { warmed: game.stopShadowsWarmed || null, depthPrograms, shadowsOn: game.renderer.shadowMap.enabled, cascades: !!(game.distantLight && game.distantLight.castShadow), stop: StopScene.stopAt(env).id, before, speed, hold: game.stopScene.hold, raised: game.stopScene.raised };
    }, placeAt.toString(), SHOT_RIDE_MS, tryHold, SHOT_APPROACH_M);
    if (begun.error) return { error: begun.error };
    // The fly, frame by frame at 60 frames a second, every frame drawn: the steps of the camera and the worst frame
    // (in runs to each moment, the picture taken there as the frame was: the riders where they were then)
    const flyRun = async (moments, frameMs, until, final) => {
        const env = game.environment, scene = game.stopScene, cam = game.camera;
        const st = window.__shotFly || (window.__shotFly = { poses: [], frames: [], marks: [], inView: [], tasks: [], slow: [], next: 0, near: new Set() });
        const pose = () => { const e = new THREE.Euler().setFromQuaternion(cam.quaternion, 'YXZ'); return { x: cam.position.x, y: cam.position.y, z: cam.position.z, yaw: e.y, pitch: e.x, roll: e.z, fov: cam.fov }; };
        const turn = (a, b) => Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)));
        const step = (a, b) => ({ moveM: Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z), aimDeg: Math.max(turn(a.yaw, b.yaw), turn(a.pitch, b.pitch), turn(a.roll, b.roll)) * 180 / Math.PI, lensDeg: Math.abs(b.fov - a.fov) });
        const { poses, frames, marks, inView, slow } = st;
        // What each slow frame spent its time on: the scene's step, the land's update and each build task in it (by id),
        // the cull, the draw, and the programs the draw compiled
        const tasks = st.tasks;
        const streamer = env.streamer;
        if (!st.enqueue) {
            const enqueue = st.enqueue = streamer.enqueue.bind(streamer);
            streamer.enqueue = (id, priority, run) => enqueue(id, priority, () => { const a = performance.now(); const out = run(); tasks.push({ id, ms: performance.now() - a }); return out; });
        }
        const renderer = game.graphics.renderer, gl = renderer.getContext(), pixel = new Uint8Array(4);
        let next = st.next;
        // The shadow casters near the player (the sun's box follows it): the ones that came in this frame
        let near = st.near;
        const wp = new THREE.Vector3();
        const casters = () => {
            // (every caster that has been inside a shadow camera's box: the sun's near one and the far cascade's)
            const out = new Map();
            const boxes = [game.directionalLight, game.distantLight].filter(l => l && l.castShadow).map((l) => {
                l.shadow.camera.updateMatrixWorld();
                const f = new THREE.Frustum();
                f.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(l.shadow.camera.projectionMatrix, l.shadow.camera.matrixWorldInverse));
                return f;
            });
            game.scene.traverseVisible((o) => {
                if (!o.isMesh || !o.castShadow) return;
                if (o.isInstancedMesh ? o.count > 0 && boxes.length : boxes.some(f => f.intersectsObject(o))) out.set(o.uuid, `${o.name || o.type}${o.parent && o.parent.name ? ' < ' + o.parent.name : ''}${o.isInstancedMesh ? ' instanced' : ''}${o.isSkinnedMesh ? ' skinned' : ''}`);
            });
            for (const k of near) if (!out.has(k)) out.set(k, '');
            return out;
        };
        while (scene.t < until + 1 / 120) {
            tasks.length = 0;
            const before = near;
            const programs = renderer.info.programs ? renderer.info.programs.length : 0;
            const memory0 = { ...renderer.info.memory };
            const states = () => scene.riders.map(r => `${r.stood ? 'S' : ''}${(r.player ? r.bike.group : r.bike.bikeGroup || {}).visible ? 'V' : ''}`).join(',') + ` puffs ${scene.puffs.length} drawRaised ${!!scene.drawRaised}`;
            const was = states();
            const t0 = performance.now();
            game.stepStopScene(1 / 60);
            const t1 = performance.now();
            const is = states();
            env.update(game.vehicle.position, scene.stop.s, null, 4, 1 / 60);
            const t2 = performance.now();
            game.updatePerformanceCulling();
            const t3 = performance.now();
            game.graphics.render(game.scene, game.camera);
            // (each frame waits for the GPU to finish it, so its time is its own: unpaced, the loop queued frames faster
            // than the GPU drew them, and the queue's stall fell on whichever frame filled it: 45 to 59 ms at
            // susten-gadmen 13.5 s, where each frame drew in 15 to 18 ms; profileFrame)
            gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
            const t4 = performance.now();
            frames.push(t4 - t0);
            // (a program compiled in the draw: which objects draw with it)
            const known = renderer.info.programs ? new Set(renderer.info.programs.slice(0, programs)) : new Set();
            const compiled = renderer.info.programs ? renderer.info.programs.filter(pr => !known.has(pr)) : [];
            const users = [];
            if (compiled.length) game.scene.traverse((o) => {
                if (!o.material || users.length >= 6) return;
                for (const m of [].concat(o.material)) {
                    const props = renderer.properties.get(m);
                    if (props && compiled.includes(props.currentProgram)) users.push(`${o.name || o.type} (${m.name || m.type})`);
                }
            });
            const nowNear = frameMs < Infinity ? casters() : new Map();
            const came = [...nowNear.keys()].filter(k => !before.has(k)).map(k => nowNear.get(k));
            near = new Set(nowNear.keys());
            if (t4 - t0 > frameMs) slow.push({ scene: was === is ? is : `${was} -> ${is}`, came: [...new Set(came)].slice(0, 8), compiled: compiled.map(pr => `${pr.name} ${String(pr.cacheKey || "").slice(0, 400)}`), users, keys: compiled.map(pr => [String(pr.cacheKey), ...[...known].filter(o => String(o.cacheKey || '').split(',')[0] === String(pr.cacheKey).split(',')[0]).map(o => String(o.cacheKey))]), keyDiff: compiled.map((pr) => {
                // (what sets the new program apart from the nearest one made before: the fields of its key that differ)
                const mine = String(pr.cacheKey || '').split(',');
                let best = null, bestN = Infinity;
                for (const o of known) {
                    const theirs = String(o.cacheKey || '').split(',');
                    if (theirs.length !== mine.length || theirs[0] !== mine[0]) continue;
                    const n = mine.filter((v, i) => v !== theirs[i]).length;
                    if (n < bestN) { bestN = n; best = theirs; }
                }
                return best ? mine.map((v, i) => v !== best[i] ? `${i}:${best[i]}->${v}` : null).filter(Boolean).join(' ') : 'none alike';
            }), t: Math.round(scene.t * 100) / 100, ms: Math.round(t4 - t0), stepMs: Math.round(t1 - t0), updateMs: Math.round(t2 - t1), cullMs: Math.round(t3 - t2), renderMs: Math.round(t4 - t3), newPrograms: (renderer.info.programs ? renderer.info.programs.length : 0) - programs, newGeometries: renderer.info.memory.geometries - memory0.geometries, newTextures: renderer.info.memory.textures - memory0.textures, drawCalls: renderer.info.render.calls, drawTriangles: renderer.info.render.triangles, tasks: [...tasks].sort((a, b) => b.ms - a.ms).slice(0, 4).map(k => `${k.id} ${Math.round(k.ms)}`) });
            poses.push(pose());
            // (once the camera has passed the bike, the bike is out of the picture: StopScene.OVERTAKE; to the end at a
            // stop held on a view of its own, a photo's (HOLDS), and until the hold is flown to at one that looks back at
            // the group)
            const O = StopScene.OVERTAKE;
            if (scene.t > O.passFromS + O.passS && scene.t < (StopScene.HOLDS[scene.stop.id] ? scene.flyS + 1 : scene.holdFrom)) {
                const v = game.vehicle.group.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.9, 0)).project(cam);
                if (v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1) inView.push(Math.round(scene.t * 100) / 100);
            }
            if (next < moments.length && scene.t >= moments[next] - 1e-6) {
                const bike = game.vehicle.position;
                marks.push({ t: moments[next], k: poses.length - 1, camToBikeM: Math.round(Math.hypot(cam.position.x - bike.x, cam.position.z - bike.z) * 10) / 10, back: Math.round(scene.back * 10) / 10 });
                next++;
            }
        }
        st.next = next;
        st.near = near;
        if (!final) return null;
        delete window.__shotFly;
        const steps = poses.slice(1).map((p, k) => step(poses[k], p));
        const worst = key => Math.max(...steps.slice(1).map((st, k) => Math.abs(st[key] - steps[k][key])));
        const turns = steps.slice(1).map((st, k) => ({ t: Math.round((k + 2) * 100 / 60) / 100, aimKink: Math.round(Math.abs(st.aimDeg - steps[k].aimDeg) * 1000) / 1000, moveKink: Math.round(Math.abs(st.moveM - steps[k].moveM) * 1000) / 1000 })).sort((a, b) => b.aimKink + b.moveKink - a.aimKink - a.moveKink).slice(0, 6);
        const big = steps.map((st, k) => ({ t: Math.round((k + 2) * 100 / 60) / 100, moveM: Math.round(st.moveM * 1000) / 1000, dy: Math.round((poses[k + 1].y - poses[k].y) * 1000) / 1000, aimDeg: Math.round(st.aimDeg * 1000) / 1000 })).sort((a, b) => b.moveM - a.moveM).slice(0, 4);
        const sorted = [...frames].sort((a, b) => a - b);
        const slowest = frames.indexOf(Math.max(...frames));
        const top = frames.map((ms, k) => ({ t: Math.round((k + 1) * 100 / 60) / 100, ms: Math.round(ms * 10) / 10 })).sort((a, b) => b.ms - a.ms).slice(0, 6);
        streamer.enqueue = st.enqueue;
        return { poses, marks, slow, turns, inView: inView.slice(0, 10), inViewFrames: inView.length, flyS: scene.flyS, worstStep: { moveM: worst('moveM'), aimDeg: worst('aimDeg'), lensDeg: worst('lensDeg') }, frameWorstAtS: Math.round((slowest + 1) * 100 / 60) / 100, slowestFrames: top, biggestSteps: big, frameMedianMs: Math.round(sorted[Math.floor(sorted.length / 2)] * 100) / 100, frameWorstMs: Math.round(sorted[sorted.length - 1] * 100) / 100, frames: frames.length };
    };
    const shots = [], profiles = [];
    for (const t of moments) {
        await page.evaluate(flyRun, moments, SHOT_FRAME_MS, t, false);
        // (--profile-at <t>: the frame at that moment drawn again with each part of the scene left out, timed to the
        // GPU's finish, so a slow frame's cost is found by its part)
        if (option('profile-at') && String(option('profile-at')).split(',').map(Number).some(v => Math.abs(v - t) < 1e-6)) profiles.push({ t, ...(await page.evaluate(profileFrame)) });
        const file = join(out, `${tag}-fly-${String(t).replace('.', '_').padStart(4, '0')}s.png`);
        await page.screenshot({ path: file });
        shots.push({ t, file });
    }
    const fly = await page.evaluate(flyRun, moments, SHOT_FRAME_MS, Math.max(...moments), true);
    const first = fly.poses[0];
    const turn = (a, b) => Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)));
    const jump = { moveM: Math.hypot(first.x - begun.before.x, first.y - begun.before.y, first.z - begun.before.z), aimDeg: Math.max(turn(first.yaw, begun.before.yaw), turn(first.pitch, begun.before.pitch), turn(first.roll, begun.before.roll)) * 180 / Math.PI, lensDeg: Math.abs(first.fov - begun.before.fov) };
    // The held shot, everything streamed
    const held = await page.evaluate(async (countSource) => {
        const env = game.environment, scene = game.stopScene;
        while (scene.t < Math.max(scene.flyS + 0.5, scene.cardAt + 0.1)) {
            game.stepStopScene(1 / 30);
            env.update(game.vehicle.position, scene.stop.s, null, Infinity, 1 / 30);
        }
        await env.streamer.settle(game.vehicle.position, scene.stop.s);
        game.stepStopScene(1 / 60);
        game.graphics.render(game.scene, game.camera);
        const cam = game.camera.position;
        // What the held shot draws, against LEG_BUDGET (reported, not a failure: the Gotthard leg's draws 468 000
        // triangles at Ultra)
        const counts = new Function(`return (${countSource})`)()();
        // (the triangles by kind of mesh, its name less any tile key or number, most first)
        const parts = {};
        game.scene.traverse(o => {
            if (!o.isMesh) return;
            for (let n = o; n; n = n.parent) { if (!n.visible || n.name === 'ground-cover') return; }
            const index = o.geometry.index, pos = o.geometry.attributes.position;
            const name = (o.name || o.parent && o.parent.name || '?').replace(/[-:]?-?\d+(,-?\d+)?(-lod\d)?$/, '').replace(/-\d+$/, '');
            parts[name] = (parts[name] || 0) + Math.round((index ? index.count : pos.count) / 3 * (o.isInstancedMesh ? o.count : 1));
        });
        counts.parts = Object.entries(parts).sort((a, b) => b[1] - a[1]).slice(0, 16);
        return { counts, cameraOverGroundM: Math.round((cam.y - env.ground.groundY(cam.x, cam.z, null)) * 100) / 100, bars: [...document.querySelectorAll('.stop-bar')].map(b => b.getBoundingClientRect().height), card: !!document.querySelector('#finishBanner.stop-card'), buffer: [game.renderer.domElement.width, game.renderer.domElement.height], level: Quality.LEVELS[game.quality.level].id, raised: scene.raised };
    }, countScene.toString());
    const heldFile = join(out, `${tag}-held.png`);
    await page.screenshot({ path: heldFile });
    shots.push({ t: 'held', file: heldFile });
    // --hazes 4400,7000: the held shot again under each haze depth (metres of LandShade.HAZE.perM's 1 / m), to set a
    // hold's own `haze` against the photos; the shot's own haze is put back after
    for (const m of (option('hazes') || '').split(',').filter(Boolean).map(Number)) {
        await page.evaluate((m) => {
            LandShade.writeHaze({ ...LandShade.HAZE, perM: 1 / m });
            game.graphics.render(game.scene, game.camera);
        }, m);
        const file = join(out, `${tag}-held-haze-${m}.png`);
        await page.screenshot({ path: file });
        shots.push({ t: `haze ${m}`, file });
    }
    if (option('hazes')) await page.evaluate(() => { game.stepStopScene(0); game.graphics.render(game.scene, game.camera); });
    const levels = [];
    if (flag('levels')) {
        const count = await page.evaluate(() => Quality.LEVELS.length);
        for (let level = count - 1; level >= 0; level--) {
            const row = { level };
            for (const raise of [false, true]) {
                await page.evaluate(async (lvl, raise) => {
                    const env = game.environment, scene = game.stopScene;
                    game.quality.fix(lvl);
                    if (!raise) {
                        scene.raised = null;
                        env.streamer.tileLodM = null;
                        env.scenery.setShot(null);
                        game.applyQuality(Quality.LEVELS[lvl], lvl, 'fixed');
                    } else game.raiseShot();
                    await env.streamer.settle(game.vehicle.position, scene.stop.s);
                    game.graphics.render(game.scene, game.camera);
                }, level, raise);
                await slow(throttle);
                const timing = await page.evaluate(shotFrames, SHOT_FRAMES);
                await slow(1);
                row.id = timing.id;
                row[raise ? 'raised' : 'base'] = timing;
            }
            const file = join(out, `${tag}-held-${row.id}.png`);
            await page.screenshot({ path: file });
            row.file = file;
            levels.push(row);
        }
        await page.evaluate(() => game.quality.release(performance.now()));
    }
    const result = { ...begun, jump, worstStep: fly.worstStep, flyFrameMedianMs: fly.frameMedianMs, flyFrameWorstMs: fly.frameWorstMs, flyFrameWorstAtS: fly.frameWorstAtS, flySlowest: fly.slowestFrames, flyBiggestSteps: fly.biggestSteps, flySlow: fly.slow, flyS: fly.flyS, flyMarks: fly.marks, flyKinks: fly.turns, profiles, bikeInViewAfterPass: fly.inViewFrames, bikeInViewAt: fly.inView, flyFrames: fly.frames, held, shots, levels, phone };
    writeFileSync(join(out, `${tag}-shot.json`), JSON.stringify(result, null, 1));
    return result;
};

// SHOT_FRAMES frames of the held shot: the scene's step and the land's update, the draw and the wait for it, the GPU
// timer; medians, and what the frame draws. Runs in the page
async function shotFrames(count) {
    const renderer = game.graphics.renderer, gl = renderer.getContext();
    const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const pixel = new Uint8Array(4);
    const median = list => (list.length ? [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)] : null);
    const round = n => (n === null ? null : Math.round(n * 100) / 100);
    const frame = [], render = [], queries = [];
    let info = null;
    renderer.info.autoReset = false;
    for (let i = 0; i < count + 5; i++) {
        const t0 = performance.now();
        game.stepStopScene(1 / 60);
        game.environment.update(game.vehicle.position, game.stopScene.stop.s, null, 4, 1 / 60);
        renderer.info.reset();
        const query = timer && i >= 5 ? gl.createQuery() : null;
        const t1 = performance.now();
        if (query) gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
        game.graphics.render(game.scene, game.camera);
        if (query) { gl.endQuery(timer.TIME_ELAPSED_EXT); queries.push(query); }
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        const t2 = performance.now();
        info = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
        if (i < 5) continue;
        frame.push(t2 - t0);
        render.push(t2 - t1);
    }
    renderer.info.autoReset = true;
    const gpu = [];
    for (let tries = 0; tries < 50 && queries.length; tries++) {
        await new Promise(done => setTimeout(done, 20));
        for (let k = queries.length - 1; k >= 0; k--) {
            if (!gl.getQueryParameter(queries[k], gl.QUERY_RESULT_AVAILABLE)) continue;
            if (!gl.getParameter(timer.GPU_DISJOINT_EXT)) gpu.push(gl.getQueryParameter(queries[k], gl.QUERY_RESULT) / 1e6);
            gl.deleteQuery(queries[k]);
            queries.splice(k, 1);
        }
    }
    const L = Quality.LEVELS[game.quality.level];
    return { id: L.id, frameMs: round(median(frame)), worstMs: round(Math.max(...frame)), renderMs: round(median(render)), gpuMs: round(median(gpu)), buffer: [renderer.domElement.width, renderer.domElement.height], shadow: renderer.shadowMap.enabled ? game.directionalLight.shadow.mapSize.x : 0, samples: game.graphics.sceneTarget ? game.graphics.sceneTarget.samples : null, tileLodM: game.environment.streamer.tileLodM, trees: game.environment.scenery.treeShare, ...info };
}

function shotChecks(results, failures) {
    const shot = results['world-shot'];
    if (!shot) return;
    if (shot.error) { failures.push(`world-shot: ${shot.error}`); return; }
    // (the first frame moves as the bike does in one frame at the speed it crossed the line, and turns no more than most)
    const first = { moveM: shot.speed / 60 + SHOT_STEP.moveM, aimDeg: SHOT_STEP.aimDeg, lensDeg: SHOT_STEP.lensDeg };
    for (const [key, most] of Object.entries(SHOT_STEP)) {
        if (!(shot.jump[key] <= first[key])) failures.push(`world-shot: the first frame of the scene is ${shot.jump[key].toFixed(3)} (${key}) from the chase camera's last, over ${first[key]}`);
        if (!(shot.worstStep[key] <= most)) failures.push(`world-shot: a frame of the fly changes its ${key} by ${shot.worstStep[key].toFixed(3)} from the frame before, over ${most}`);
    }
    if (!(shot.flyFrameWorstMs <= SHOT_FRAME_MS)) failures.push(`world-shot: a frame of the fly took ${shot.flyFrameWorstMs} ms, over ${SHOT_FRAME_MS}: ${JSON.stringify((shot.flySlow || []).slice(0, 3))}`);
    if (shot.bikeInViewAfterPass) failures.push(`world-shot: the bike is in the picture in ${shot.bikeInViewAfterPass} frames after the camera passed it (at ${JSON.stringify(shot.bikeInViewAt)} s)`);
    if (!shot.held.bars.every(h => h > 0)) failures.push(`world-shot: the bars are ${JSON.stringify(shot.held.bars)} px high`);
    if (!(shot.held.cameraOverGroundM > 0.2)) failures.push(`world-shot: the held camera is ${shot.held.cameraOverGroundM} m over the ground`);
}

function stopChecks(results, failures) {
    const stop = results['world-stop-shots'];
    if (!stop) return;
    if (stop.error) { failures.push(`world-stop-shots: ${stop.error}`); return; }
    if (!stop.card) failures.push('world-stop-shots: no result card at the end of the scene');
    if (!(stop.cameraOverGroundM > 0.2)) failures.push(`world-stop-shots: the camera is ${stop.cameraOverGroundM} m over the ground`);
    if (!stop.bars.every(h => h > 0)) failures.push(`world-stop-shots: the bars are ${JSON.stringify(stop.bars)} px high`);
    stop.riders.forEach((r) => {
        if (!(r.meshesShown > 0)) failures.push(`world-stop-shots: ${r.who}'s bike is not drawn`);
        if (!(r.offSlotM <= STOP_SLOT_M)) failures.push(`world-stop-shots: ${r.who} stands ${r.offSlotM} m off its slot`);
        if (!(Math.abs(r.overGroundM) <= STOP_GROUND_M)) failures.push(`world-stop-shots: ${r.who}'s bike is ${r.overGroundM} m off the ground`);
        if (!r.stood) failures.push(`world-stop-shots: ${r.who} did not get off the bike`);
        else if (!(Math.abs(r.bootOverGroundM) <= STOP_GROUND_M)) failures.push(`world-stop-shots: ${r.who}'s boots are ${r.bootOverGroundM} m off the ground`);
    });
}

function worldChecks(report) {
    const { results, failures } = report;
    clearanceChecks(results, failures);
    fairnessChecks(results, failures);
    shotChecks(results, failures);
    // No thing of the window's scenery pops in view because the room changed (world-pops)
    const pops = results['world-pops'];
    if (pops && pops.summary && pops.summary.inView) failures.push(`world-pops: ${pops.summary.inView} pops in view in the ride (${JSON.stringify(pops.summary.inViewByKind)}), want none`);
    if (pops && pops.summary && pops.summary.villageNearInView) failures.push(`world-pops: ${pops.summary.villageNearInView} houses first drawn in view within ${HOUSE_NEAR_M} m of the camera in the villages, want none`);
    if (pops && pops.summary && pops.summary.standComesGoes) failures.push(`world-pops: ${pops.summary.standComesGoes} things came or went in view with the bike stopped (${JSON.stringify(pops.summary.standByKind)}), want none`);
    const steps = results['world-steps'];
    if (steps && steps.hostLoad > STEPS_LOAD_MOST) failures.push(`world-steps: the host's load was ${steps.hostLoad} per CPU, over ${STEPS_LOAD_MOST}: the steps are not measured (run it on a quiet host)`);
    else if (steps) for (const list of Object.values(steps.slowestByKind || {})) for (const t of list) if (t.ms > STEPS_MOST_MS) failures.push(`world-steps: ${t.id} took ${t.ms} ms, over ${STEPS_MOST_MS}: ${JSON.stringify(t.parts)}`);
    camWallChecks(results, failures);
    treeChecks(results, failures);
    roadLookChecks(results, failures);
    vertexChecks(results, failures);
    wallChecks(results, failures);
    junctionChecks(results, failures);
    tunnelChecks(results, failures);
    stoneChecks(results, failures);
    seamChecks(results, failures);
    farSeamChecks(results, failures);
    stopChecks(results, failures);
    const rows = (results['world-window'] || results['world-budget'] || {}).rows || [];
    rows.forEach(r => {
        Object.entries(LEG_BUDGET).forEach(([key, most]) => { if (!(r[key] <= most)) failures.push(`world at s ${r.s}: ${r[key]} ${key}, over ${most}`); });
        // Content grows: the window keeps WORLD_MESH_MARGIN of the mesh cap free everywhere
        if (r.meshes > LEG_BUDGET.meshes * (1 - WORLD_MESH_MARGIN)) failures.push(`world at s ${r.s}: ${r.meshes} meshes leave ${LEG_BUDGET.meshes - r.meshes} of the cap of ${LEG_BUDGET.meshes} free, want ${LEG_BUDGET.meshes * WORLD_MESH_MARGIN} or more`);
        if (r.tiles > WORLD_RESIDENT_TILES) failures.push(`world at s ${r.s}: ${r.tiles} resident tiles, over ${WORLD_RESIDENT_TILES}`);
        if (r.bikeTilesMissing) failures.push(`world at s ${r.s}: ${r.bikeTilesMissing} tiles within ${WORLD_BIKE_TILE_M} m are not drawn`);
        if (r.maxStepMs > 4 * 2) failures.push(`world at s ${r.s}: a build step took ${r.maxStepMs} ms`);
    });
    const ground = results['world-ground'];
    if (ground) {
        if (!(ground.road.n >= ground.want) || ground.road.max > 0.05) failures.push(`world-ground: road band ${JSON.stringify(ground.road)}, want ${ground.want} points with |delta| <= 0.05`);
        if (!(ground.land.n >= ground.want) || ground.land.p99 > 0.35) failures.push(`world-ground: land ${JSON.stringify(ground.land)}, want ${ground.want} points with p99 <= 0.35`);
        if (ground.aboveRoad.n !== ground.road.n || ground.aboveRoad.over) failures.push(`world-ground: the drawn land stands above the road surface at ${ground.aboveRoad.over} of ${ground.aboveRoad.n} road points (up to ${ground.aboveRoad.max} m), want none`);
    }
    (results['world-junction'] || []).forEach(j => j.passes.forEach(p => {
        if (p.barriers.length) failures.push(`world-junction ${j.id} at ${p.sIn}: a barrier is drawn (${p.barriers.join(', ')})`);
        if (p.missing.length) failures.push(`world-junction ${j.id} at ${p.sIn}: side roads ${JSON.stringify(p.missing)} are not drawn as stubs`);
        if (p.solid.length) failures.push(`world-junction ${j.id} at ${p.sIn}: the physics makes a wall or a fall on a stub: ${JSON.stringify(p.solid)}`);
    }));
    const haze = results['world-haze'];
    if (haze) hazeChecks(haze, failures);
    const wrong = results['world-wrongway'];
    if (wrong) {
        const [off, back, ride, side] = wrong;
        if (off.error) failures.push(`world-wrongway: ${off.error}`);
        else {
            if (!(off.warnedAt !== null && off.warnedAt <= 1) || !(Math.abs(off.restartAt - off.warnedAt - 10) <= 0.5)) failures.push(`world-wrongway off route: ${JSON.stringify(off)}, want the warning within 1 s and the restart 10 s later`);
            if (!(Math.abs(back.warnedAt - 5) <= 0.5) || !(Math.abs(back.restartAt - back.warnedAt - 10) <= 0.5)) failures.push(`world-wrongway backwards: ${JSON.stringify(back)}, want the warning at 5 s and the restart 10 s later`);
            if (ride.warned || ride.restarts || ride.crashed || ride.metres < 1900) failures.push(`world-wrongway control: ${JSON.stringify(ride)}, want neither a warning nor a restart over 2 km`);
            const sideOk = side && !side.crashed && side.warnedAt !== null && Math.abs(side.restartAt - side.warnedAt - 10) <= 0.5 && side.restartM <= 250
                && side.said.includes('Wrong way') && side.said.some(text => text.startsWith('Off route, back on the road'));
            if (!sideOk) failures.push(`world-wrongway side road: ${JSON.stringify(side)}, want "Wrong way", then "Off route, back on the road" 10 s later within 250 m`);
        }
    }
    const credit = results['world-credit'];
    if (credit) {
        const { manifest } = credit;
        const full = panel => panel && panel.credit === manifest.credit && panel.credit.includes('© swisstopo') && (!manifest.notice || panel.notice === manifest.notice);
        if (!manifest.credit || !manifest.credit.includes('© swisstopo')) failures.push(`world-credit: the manifest credit is missing or has no swisstopo: ${JSON.stringify(manifest.credit)}`);
        if (credit.riding.length) failures.push(`world-credit: a credit is on screen during the ride: ${credit.riding.join(', ')}`);
        if (!credit.pause.panel || !credit.pause.button || !full(credit.fromPause)) failures.push(`world-credit: Credits from the pause panel: ${JSON.stringify({ pause: credit.pause, panel: credit.fromPause })}`);
        if (credit.afterResume) failures.push('world-credit: the pause panel stays after resume');
        if (credit.loading !== manifest.credit) failures.push(`world-credit: the loading screen shows ${JSON.stringify(credit.loading)}`);
        if (!full(credit.fromMenu)) failures.push(`world-credit: Credits from the main menu: ${JSON.stringify(credit.fromMenu)}`);
        if (credit.legScreen.length) failures.push(`world-credit: a credit is on the menu screen itself: ${credit.legScreen.join(', ')}`);
    }
    const net = results['world-net'];
    if (net) {
        if (net.offHost.length) failures.push(`world-net: requests outside the allowed set: ${net.offHost.join(', ')}`);
        if (report.blocked.length) failures.push(`world-net: ${report.blocked.length} attempts at production hosts: ${report.blocked.join(', ')}`);
    }
    const finishes = results['world-finish'];
    if (finishes) {
        if (finishes.finished !== finishes.seeds.length) failures.push(`world-finish: ${finishes.finished} of ${finishes.seeds.length} seeded rides finished, want all`);
        for (const finish of finishes.rides) {
            const { rows, seed, ...rest } = finish;
            const at = `world-finish seed ${seed}`;
            if (!finish.finished || finish.crashed || finish.gates !== finish.gateTotal || finish.restarts || finish.maxLateral > 5) failures.push(`${at}: ${JSON.stringify(rest)}`);
            if (finish.badHud && finish.badHud.length) failures.push(`${at}: the HUD showed a number that is not one: ${JSON.stringify(finish.badHud)}`);
            if (finish.finished && !finish.restarts && !(Math.abs(finish.shownM - finish.stageM) <= 0.02 * finish.stageM)) failures.push(`${at}: the finish box shows ${finish.shownM} m for a stage of ${finish.stageM} m`);
            if (!finish.traffic || !finish.traffic.bikes || finish.cones || finish.rockfalls) failures.push(`${at}: traffic must ride and cones and rockfalls must be off: ${JSON.stringify({ traffic: finish.traffic, cones: finish.cones, rockfalls: finish.rockfalls })}`);
            rows.forEach(r => {
                Object.entries(LEG_BUDGET).forEach(([key, most]) => { if (!(r[key] <= most)) failures.push(`${at} at s ${r.s}: ${r[key]} ${key}, over ${most}`); });
                if (r.tiles > WORLD_RESIDENT_TILES) failures.push(`${at} at s ${r.s}: ${r.tiles} resident tiles, over ${WORLD_RESIDENT_TILES}`);
                if (r.maxStepMs > 4 * 2) failures.push(`${at} at s ${r.s}: a build step took ${r.maxStepMs} ms`);
            });
        }
    }
    const restart = results['world-restart'];
    if (restart) {
        const { before, after, crash, next, confirm, excursion, stationS, backM, station } = restart;
        const { held, cancelled, entered } = confirm;
        if (held.ticks !== 0 || held.moved !== 0 || held.clock !== 0 || !held.open) failures.push(`world-restart: the ride went on while the restart box was open: ${JSON.stringify(held)}`);
        if (cancelled.open || cancelled.paused || cancelled.proceeded !== 0 || cancelled.ticks !== 30) failures.push(`world-restart: Escape must cancel and give the ride back: ${JSON.stringify(cancelled)}`);
        if (entered.open || entered.paused || entered.proceeded !== 1) failures.push(`world-restart: Enter must answer yes: ${JSON.stringify(entered)}`);
        // In place: a few metres behind where the bike was (300 m past the station, so not on it), at a standstill
        if (!(before.s - after.s >= backM - 2 && before.s - after.s <= backM + 2) || Math.abs(after.s - stationS) < 100 || after.restarts !== 1 || after.penaltyMs !== 5000 || !(after.elapsedJump >= 5000 && after.elapsedJump < 5100) || after.speed !== 0 || after.passed !== before.passed) failures.push(`world-restart: ${JSON.stringify({ stationS, before, after })}`);
        if (crash.during.dialogs.length || crash.dialogs.length || crash.during.restarts !== 0 || !crash.during.crashed) failures.push(`world-restart: a crash must open no dialog and play its fall first: ${JSON.stringify(crash)}`);
        if (!crash.callout || !/Hit the probe\s+\+5 s/.test(crash.callout)) failures.push(`world-restart: the call-out must say the cause and the cost: ${JSON.stringify(crash.callout)}`);
        if (crash.restarts !== 1 || crash.penaltyMs !== 5000 || crash.crashed || !(crash.seconds <= crash.mostS + 0.1) || !(crash.backM >= 0 && crash.backM <= backM + 25) || Math.abs(crash.lateral) > crash.half) failures.push(`world-restart: the game must restart a crashed rider in place by itself: ${JSON.stringify(crash)}`);
        if (next.passed !== station + 1 || next.restarts !== 2 || next.crashed) failures.push(`world-restart: the ride did not go on to the next station: ${JSON.stringify(next)}`);
        if (excursion.restarts !== 1 || excursion.penaltyMs !== 15000 || excursion.guideCause !== null || excursion.pendingCutMs !== 0) failures.push(`world-restart: an excursion must cost one penalty: ${JSON.stringify(excursion)}`);
    }
    const cut = results['world-cut'];
    if (cut) {
        if (cut.error) failures.push(`world-cut: ${cut.error}`);
        else if (cut.none) report.notes.push(`world-cut: ${cut.none}`);
        else {
            if (cut.control.restarts || cut.control.crashed) failures.push(`world-cut control: ${JSON.stringify(cut.control)}`);
            if (cut.flicker.restarts) failures.push(`world-cut: a flicker restarted the ride: ${JSON.stringify(cut.flicker)}`);
            if (cut.cut.restarts !== 1 || cut.cut.penaltyMs !== 5000 || !(cut.cut.ms >= cut.cutConfirmMs - 20 && cut.cut.ms <= cut.cutConfirmMs + 120) || cut.cut.backAtS > cut.cut.lowerS + 100 || cut.cut.lowerS - cut.cut.backAtS > 2100) failures.push(`world-cut: ${JSON.stringify(cut.cut)}, want one restart after about ${cut.cutConfirmMs} ms`);
        }
    }
    const hud = results['world-hud'];
    if (hud) {
        for (const view of ['small', 'large', 'touch']) {
            const h = hud[view];
            if (h.error) { failures.push(`world-hud ${view}: ${h.error}`); continue; }
            if (h.bars !== 1 || h.pipsShown) failures.push(`world-hud ${view}: the checkpoints must show once, on the progress bar: ${h.bars} bars, pips shown ${h.pipsShown}`);
            if (h.ticks !== h.gateTotal || h.count !== `0/${h.gateTotal}`) failures.push(`world-hud ${view}: ${h.ticks} ticks and ${h.count} for a stage of ${h.gateTotal} checkpoints`);
            if (!new RegExp(`^Stage 2/${h.stages} · `).test(h.stageText)) failures.push(`world-hud ${view}: the stage text reads ${JSON.stringify(h.stageText)}, want Stage 2/${h.stages}`);
            if (h.missing.length) failures.push(`world-hud ${view}: not on the screen: ${h.missing.join(', ')}`);
            if (h.overlaps.length) failures.push(`world-hud ${view}: boxes overlap: ${JSON.stringify(h.overlaps)}`);
            if (h.off.length) failures.push(`world-hud ${view}: off the screen: ${h.off.join(', ')}`);
        }
    }
    const camera = results['world-camera'];
    if (camera && camera.none) report.notes.push(`world-camera: ${camera.none}`);
    else if (camera) {
        if (camera.boomUnderGround) failures.push(`world-camera: the boom went under the ground on ${camera.boomUnderGround} of ${camera.frames} frames`);
        if (!(camera.hairpinFrames > 0) || !(camera.share >= 0.95)) failures.push(`world-camera: the road 30 m ahead is in view on ${camera.share} of ${camera.hairpinFrames} hairpin frames, want 0.95 or more: ${JSON.stringify(camera.runs)}`);
        camera.runs.forEach(r => { if (r.crashed) failures.push(`world-camera: the ride from s ${r.start} crashed`); });
    }
    const frustum = results['world-frustum'];
    if (frustum) {
        if (frustum.crashed) failures.push(`world-frustum: the ride crashed at s ${frustum.reached}`);
        if (frustum.reached < frustum.end) failures.push(`world-frustum: the ride stopped at s ${frustum.reached}, before ${frustum.end}`);
        if (frustum.hairpins.length < hairpinsLeast()) failures.push(`world-frustum: ${frustum.hairpins.length} hairpins found, want ${hairpinsLeast()} or more`);
        if (frustum.out) failures.push(`world-frustum: the bike was within ${frustum.margin} of the screen edge or out of view on ${frustum.out} of ${frustum.frames} frames (worst ${frustum.least} at s ${frustum.worstAt})`);
        frustum.hairpins.forEach(h => { if (!(h.frames > 0)) failures.push(`world-frustum: no frames at the hairpin at s ${h.s}`); });
    }
    // The chase camera through the hairpins: the second difference a frame of its position (m), its look target (m)
    // and its view yaw (rad). The camera before its springs went to 11.5, 11.0 and 0.19 where the boom met the land,
    // and to 0.13, 1.0 and 0.015 elsewhere.
    const smooth = results['world-camera-smooth'];
    if (smooth) {
        if (smooth.crashed) failures.push(`world-camera-smooth: the ride crashed at s ${smooth.reached}`);
        const most = { position: 0.03, look: 0.3, yaw: 0.006 };
        Object.entries(most).forEach(([key, limit]) => {
            const got = smooth.stats[key];
            if (!(got.jerk <= limit)) failures.push(`world-camera-smooth: the ${key} moved by a second difference of ${got.jerk} in one frame at s ${got.jerkAt}, want ${limit} or less`);
        });
    }
    // The chase camera over the whole stage (world-camera-chicane): before the camera read the road's mean heading the
    // worst chicane gave a yaw acceleration of 10.2 rad/s^2 behind the world pilot (the Gotthard S at km 0.5, the
    // near chase) and the worst place 9.9 (the Tremola's pair of hairpins at km 10.8, the far chase); the far chase
    // went 2.7 m through a gallery's roof. Measured with the rule: 3.2, 4.6 and the eye and the near plane 2.0 m or more
    // inside every tube
    const chicane = results['world-camera-chicane'];
    if (chicane) {
        for (const [mode, m] of Object.entries(chicane.modes || {})) {
            if (m.crashed) failures.push(`world-camera-chicane: the ride in view ${mode} crashed at s ${m.reached}${m.cause ? ` (${m.cause})` : ''}`);
            if (m.reached < m.end) failures.push(`world-camera-chicane: the ride in view ${mode} stopped at s ${m.reached}, before ${m.end}`);
            if (!(m.accel <= CHASE_LIMITS.accel)) failures.push(`world-camera-chicane: view ${mode}: a yaw acceleration of ${m.accel} rad/s^2, want ${CHASE_LIMITS.accel} or less: ${JSON.stringify(m.places.slice(0, 3))}`);
            if (!(m.room >= CHASE_LIMITS.room)) failures.push(`world-camera-chicane: view ${mode}: the bike came within ${m.room} of a side of the view, want ${CHASE_LIMITS.room} or more`);
            const bad = m.chicanes.filter(c => !(c.accel <= CHASE_LIMITS.chicaneAccel) || !(c.rate <= CHASE_LIMITS.chicaneRate));
            if (bad.length) failures.push(`world-camera-chicane: view ${mode}: ${bad.length} chicanes over ${CHASE_LIMITS.chicaneAccel} rad/s^2 or ${CHASE_LIMITS.chicaneRate} rad/s: ${JSON.stringify(bad.slice(0, 6))}`);
            if (m.tube.under !== null && !(m.tube.under >= CHASE_LIMITS.tubeRoomM)) failures.push(`world-camera-chicane: view ${mode}: the eye or the near plane came within ${m.tube.under} m of a tube's roof or wall at s ${m.tube.underAt}, want ${CHASE_LIMITS.tubeRoomM} or more`);
            if (!(m.tube.bounce <= CHASE_LIMITS.tubeBounceM)) failures.push(`world-camera-chicane: view ${mode}: near a tube the camera's height moved by a second difference of ${m.tube.bounce} m in one frame at s ${m.tube.bounceAt}, want ${CHASE_LIMITS.tubeBounceM} or less`);
        }
    }
    const assist = results['world-hairpin-assist'];
    if (assist) {
        const normal = assist.levels.normal;
        if (assist.bends < hairpinsLeast()) failures.push(`world-hairpin-assist: ${assist.bends} hairpins found, want ${hairpinsLeast()} or more`);
        if (normal.crashes) failures.push(`world-hairpin-assist: the scripted rider crashed on ${normal.crashes} hairpins with the assist at normal: ${JSON.stringify(normal.bad)}`);
    }
    const models = results['world-models'];
    if (models) {
        if (models.rows.length < 16) failures.push(`world-models: ${models.rows.length} model files found`);
        models.rows.forEach(r => {
            if (r.error) failures.push(`world-models: ${r.file} did not load: ${r.error}`);
            if (r.noNormals || r.badNormals) failures.push(`world-models: ${r.file} has ${r.noNormals} parts with no normals and ${r.badNormals} bad normals`);
            if (/Float32/.test(r.colour)) failures.push(`world-models: ${r.file} has float colours`);
            if (r.metalness[0] < 0 || r.metalness[1] > 1 || r.roughness[0] < 0 || r.roughness[1] > 1) failures.push(`world-models: ${r.file} has metalness ${r.metalness} roughness ${r.roughness}`);
        });
    }
    const placedHouses = results['world-buildings'];
    if (placedHouses) {
        if (!(placedHouses.checked > 0)) failures.push('world-buildings: no building was drawn');
        if (placedHouses.onBand) failures.push(`world-buildings: ${placedHouses.onBand} drawn buildings stand on a road band: ${JSON.stringify(placedHouses.hits)}`);
    }
    const tight = results['world-watertight'];
    if (tight) {
        if (!(tight.views > 0)) failures.push('world-watertight: no view was read');
        if (tight.holes) failures.push(`world-watertight: ${tight.holes} pixels in ${tight.holeViews} views look through the drawn land: ${JSON.stringify(tight.worstHoles)}`);
        if (tight.backOpen) failures.push(`world-watertight: ${tight.backOpen} pixels in ${tight.backViews} views show a land triangle's underside through the land: ${JSON.stringify(tight.worstBack)}`);
        if (tight.skirtOpen) failures.push(`world-watertight: ${tight.skirtOpen} pixels in ${tight.skirtViews} views show a tile skirt through the land: ${JSON.stringify(tight.worstSkirt)}`);
        if (tight.jointOpen) failures.push(`world-watertight: ${tight.jointOpen} top edges of a retaining wall have no road drawn beside them: ${JSON.stringify(tight.worstJointOpen)}`);
        if (tight.footOpen) failures.push(`world-watertight: ${tight.footOpen} edges of an apron or retaining wall stand over the drawn land: ${JSON.stringify(tight.worstFootOpen)}`);
        if (tight.footOverRoad) failures.push(`world-watertight: ${tight.footOverRoad} edges of an apron or retaining wall stand over another road's carriageway: ${JSON.stringify(tight.worstFootOverRoad)}`);
    }
    const floating = results['world-floating'];
    if (floating) {
        if (!(floating.probes > 0)) failures.push('world-floating: no road edge was checked');
        if (floating.open) failures.push(`world-floating: ${floating.open} drawn road edges stand more than ${floating.tolM} m over the drawn land with nothing under them (worst ${floating.worstOpen[0].gapM} m at s ${floating.worstOpen[0].s} ${floating.worstOpen[0].side}, road LOD${floating.worstOpen[0].roadLod}, land LOD${floating.worstOpen[0].landLod}): ${JSON.stringify(floating.worstOpen.slice(0, 5))}`);
        if (floating.up.hits) failures.push(`world-floating: drawn land or far land stands within ${FLOAT_UP_M} m over the road surface at ${floating.up.hits} points (worst ${floating.up.worst[0].overM} m at s ${floating.up.worst[0].s}): ${JSON.stringify(floating.up.worst.slice(0, 5))}`);
        const side = floating.sideFloat;
        if (side && side.open) failures.push(`world-floating: ${side.open} of ${side.vertices} side-road points stand more than 3 m over the land drawn at LOD0 with no deck or wall under them (worst ${side.worstM} m): ${JSON.stringify(side.worst.slice(0, 5))}`);
        const far = floating.horizonOver;
        if (far && far.over) failures.push(`world-floating: the horizon mesh stands over the drawn land at ${far.over} of ${far.nodes} grid nodes within 400 m of the bike (worst ${far.worstM} m): ${JSON.stringify(far.worst.slice(0, 5))}`);
        if (floating.physics.over) failures.push(`world-floating: the physics ground beside the road differs from the drawn ground by more than ${floating.tolM} m at ${floating.physics.over} of ${floating.physics.checked} points (worst ${floating.physics.worstM} m): ${JSON.stringify(floating.physics.worst.slice(0, 5))}`);
        floating.views.forEach(v => {
            if (v.crashed) failures.push(`world-floating: the ride into the view at s ${v.want} crashed`);
            if (v.underside) failures.push(`world-floating: the view at s ${v.want} shows ${v.underside} pixels of a road's underside`);
            if (v.blackStructure > LAND_BLACK_SHARE) failures.push(`world-floating: the view at s ${v.want} has ${(v.blackStructure * 100).toFixed(2)}% of its structures (${v.structure} px) near black (over ${LAND_BLACK_SHARE * 100}%)`);
            if (v.blackLand > LAND_BLACK_SHARE) failures.push(`world-floating: the view at s ${v.want} has ${(v.blackLand * 100).toFixed(2)}% of its land near black (over ${LAND_BLACK_SHARE * 100}%)`);
            if (v.lane && v.lane.lines.length) failures.push(`world-floating: the view at s ${v.want} has ${v.lane.lines.length} thin dark lines along the road (${JSON.stringify(v.lane.lines)} m across, rows of ${v.lane.rows})`);
            if (v.seam && v.seam.profiles && v.seam.seams / v.seam.profiles > FLOAT_SEAM_SHARE) failures.push(`world-floating: the view at s ${v.want} has a dark seam beside the road on ${v.seam.seams} of ${v.seam.profiles} profiles: ${JSON.stringify(v.seam.worst)}`);
        });
    }
    const shots = results['world-shots'];
    if (shots) {
        if (shots.error) failures.push(`world-shots: ${shots.error}`);
        else {
            if (!shots.sites.junction) failures.push('world-shots: no junction on the ride to shoot');
            if (!shots.hud.guide || !shots.hud.stage) failures.push(`world-shots: the HUD is missing: ${JSON.stringify(shots.hud)}`);
            if (flag('gpu') && !/Apple|AMD|NVIDIA|Intel/.test(String(shots.hud.renderer))) failures.push(`world-shots: not a GPU renderer: ${shots.hud.renderer}`);
        }
    }
}

// world-bike-shots: a rider on two of his bikes side by side, stood on the road: each bike from its side and from in
// front, close, then the two together from the front and the rear three quarters (GPU pictures). Each bike is a Vehicle of its own, dressed from its detail file.
//   node tools/terrain-check.mjs world-bike-shots --world tremola --gpu --out <dir> [--rider steve] [--bikes a,b] [--at 300]
async function bikeShots(placeSource, at, riderId, bikes) {
    const placeAt = new Function('game', `return (${placeSource})`)(game);
    const own = game.vehicle;
    game.setCameraView('near');
    await placeAt(at);
    twistyDev.autopilot({ speed: 0 });
    twistyDev.step(1);
    const character = CHARACTERS.find(c => c.id === riderId);
    const sin = Math.sin(own.yawAngle), cos = Math.cos(own.yawAngle);
    const rides = bikes.map((id, i) => {
        const v = new Vehicle(game.scene, null, character, id);
        const side = (i - (bikes.length - 1) / 2) * 2.4;
        v.position.set(own.position.x + cos * side, own.position.y, own.position.z - sin * side);
        v.yawAngle = own.yawAngle;
        return v;
    });
    const until = performance.now() + 30000;
    while (rides.some(v => !v.modelled) && performance.now() < until) await new Promise(resolve => setTimeout(resolve, 200));
    own.group.visible = false;
    // Each bike from its own outer side, close, then the two together from the front and the rear three quarters
    const views = [
        ...rides.map((v, i) => [`side-${v.model}`, v.position.clone(), [i === 0 ? -1 : 1, 0], 3]),
        ...rides.map((v, i) => [`face-${v.model}`, v.position.clone(), [(i === 0 ? -1 : 1) * 0.35, 0.94], 2.6]),
        ['front', own.position.clone(), [-0.6, 0.8], 4.2],
        ['rear', own.position.clone(), [-0.6, -0.8], 4.2]
    ];
    const shots = [];
    for (const [name, centre, [across, along], off] of views) {
        rides.forEach(v => { v.updateMesh(); v.group.updateMatrixWorld(true); });
        const cam = game.camera;
        cam.position.set(centre.x + (cos * across + sin * along) * off, centre.y + 1.0, centre.z + (-sin * across + cos * along) * off);
        cam.up.set(0, 1, 0);
        cam.lookAt(centre.x, centre.y + 0.75, centre.z);
        cam.updateMatrixWorld(true);
        game.graphics.render(game.scene, cam);
        shots.push({ view: name, png: game.graphics.renderer.domElement.toDataURL('image/png') });
    }
    const facts = rides.map(v => ({ bike: v.model, modelled: v.modelled === true, seat: v.riderBasePos && v.riderBasePos.toArray().map(n => Math.round(n * 100) / 100) }));
    rides.forEach(v => game.scene.remove(v.group));
    own.group.visible = true;
    return { shots, facts };
}
WORLD_PROBES.push('world-bike-shots');
WORLD['world-bike-shots'] = async (page) => {
    const out = option('out');
    if (!out) return { error: 'name a folder with --out <dir>' };
    mkdirSync(out, { recursive: true });
    const rider = option('rider') || 'steve';
    const bikes = (option('bikes') || 'bike08_xsr900,bike17_minimoto').split(',');
    const { shots, facts } = await page.evaluate(bikeShots, placeAt.toString(), Number(option('at') || 300), rider, bikes);
    const files = shots.map(shot => {
        const file = join(out, `${rider}-${shot.view}.png`);
        writeFileSync(file, Buffer.from(shot.png.split(',')[1], 'base64'));
        return file;
    });
    return { facts, files };
};

// hill-compare: the hill ride beside the owner's reference stills. For each still (--stills <dir>: its pictures in
// name order, private, never in the repo) the game is drawn from the named shot that matches it (HillRide.SHOTS) with
// the bicycle where the still has the boy, and a sheet is saved: the still on the left, the game on the right, the
// same height. Each sheet comes with the mean colour of the lit house faces in both (a rectangle per still).
//   node tools/terrain-check.mjs hill-compare --gpu --stills <dir> [--out <dir>] [--tag before]
const HILL_COMPARE_OUT = join(process.env.HOME || '.', 'Library/Caches/twisty-world/hill-shots/compare');
// Per still, in name order: the shot, where the bicycle is ({ s, across, uphill, speed, legs }), and the rectangle of
// lit house faces in the picture (shares of its width and height). The video's own area of each still is CROP (px)
const HILL_STILLS = [
    { shot: 'climbFoot', bike: { s: 110, uphill: true }, lit: [0.06, 0.18, 0.42, 0.62] },
    { shot: 'basket', bike: { s: 108.5, uphill: true }, lit: [0.0, 0.0, 0.3, 0.35] },
    { shot: 'climbShop', bike: { s: 110, uphill: true }, lit: [0.25, 0.05, 0.7, 0.35] },
    { shot: 'shopSide', bike: { s: 109.5, across: -0.3, uphill: true }, lit: [0.3, 0.02, 0.75, 0.32] },
    { shot: 'shopSide', bike: { s: 109.5, across: -0.3, uphill: true }, lit: [0.3, 0.02, 0.75, 0.32] },
    { shot: 'shopSide', bike: { s: 109.5, across: -0.3, uphill: true }, lit: [0.3, 0.02, 0.75, 0.32] },
    { shot: 'opening', bike: { s: 22 }, lit: [0.27, 0.32, 0.5, 0.62] },
    { shot: 'opening', bike: { s: 30, speed: 7, legs: 1 }, lit: [0.27, 0.32, 0.5, 0.62] },
    { shot: 'opening', bike: { s: 38, speed: 7, legs: 1 }, lit: [0.27, 0.32, 0.5, 0.62] },
    { shot: 'opening', bike: { s: 48, speed: 7, legs: 1 }, lit: [0.27, 0.32, 0.5, 0.62] },
    { shot: 'loaf', bike: { s: 22 }, lit: [0.25, 0.25, 0.65, 0.75] }
];
const HILL_CROP = [114, 34, 772, 552];
async function hillCompare(shot, bike, still, crop, lit) {
    const ride = window.game.hill;
    ride.running = false;
    cancelAnimationFrame(ride.frameId);
    ride.hold = null;
    ride.ending = null;
    const b = ride.bike;
    b.reset(bike.s, bike.across || 0);
    if (bike.uphill) b.vehicle.yawAngle += Math.PI;
    b.vehicle.speed = bike.speed || 0;
    b.vehicle.footDown = !bike.speed;
    b.legs = bike.legs || 0;
    b.legsOut = b.legs > 0;
    ride.rider.foot = bike.speed ? 0 : 1;
    if (shot === 'loaf') {
        ride.makeLoaf();
        ride.showLoaf(true);
        ride.forcedShot = null;
    } else {
        if (ride.loafShown) ride.showLoaf(false);
        ride.forcedShot = shot;
    }
    ride.draw(0);
    ride.draw(0);
    const game = await new Promise(resolve => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.src = window.game.renderer.domElement.toDataURL('image/png');
    });
    ride.forcedShot = null;
    const source = await new Promise(resolve => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.src = still;
    });
    const [cx, cy, cw, ch] = crop;
    const H = 540, W1 = Math.round(cw * H / ch), W2 = Math.round(game.width * H / game.height);
    const canvas = document.createElement('canvas');
    canvas.width = W1 + W2 + 8;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, H);
    ctx.drawImage(source, cx, cy, cw, ch, 0, 0, W1, H);
    ctx.drawImage(game, 0, 0, game.width, game.height, W1 + 8, 0, W2, H);
    const mean = (x0, w) => {
        const d = ctx.getImageData(Math.round(x0 + lit[0] * w), Math.round(lit[1] * H), Math.max(1, Math.round((lit[2] - lit[0]) * w)), Math.max(1, Math.round((lit[3] - lit[1]) * H))).data;
        const sum = [0, 0, 0];
        for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) sum[c] += d[i + c];
        return sum.map(v => Math.round(v / (d.length / 4)));
    };
    const meanStill = mean(0, W1), meanGame = mean(W1 + 8, W2);
    // The rectangles drawn on the sheet
    ctx.strokeStyle = 'rgba(255, 220, 0, 0.8)';
    ctx.lineWidth = 2;
    for (const [x0, w] of [[0, W1], [W1 + 8, W2]]) ctx.strokeRect(x0 + lit[0] * w, lit[1] * H, (lit[2] - lit[0]) * w, (lit[3] - lit[1]) * H);
    return { png: canvas.toDataURL('image/png'), still: meanStill, game: meanGame };
}
WORLD_PROBES.push('hill-compare');
WORLD['hill-compare'] = async (page) => {
    const dir = option('stills');
    if (!dir) return { error: 'name the stills folder with --stills <dir>' };
    const out = option('out') || HILL_COMPARE_OUT;
    const tag = option('tag') || 'sheet';
    mkdirSync(out, { recursive: true });
    const names = readdirSync(dir).filter(n => /\.png$/i.test(n)).sort();
    const sheets = [];
    for (let i = 0; i < names.length && i < HILL_STILLS.length; i++) {
        const spec = HILL_STILLS[i];
        const still = `data:image/png;base64,${readFileSync(join(dir, names[i])).toString('base64')}`;
        const result = await page.evaluate(hillCompare, spec.shot, spec.bike, still, HILL_CROP, spec.lit);
        const file = join(out, `${tag}-${String(i + 1).padStart(2, '0')}-${spec.shot}.png`);
        writeFileSync(file, Buffer.from(result.png.split(',')[1], 'base64'));
        sheets.push({ file, shot: spec.shot, litStill: result.still, litGame: result.game });
    }
    return { sheets };
};

// hill-look: one picture of the hill ride after a script of the caller's (--script <file>: the body of an async
// function given `ride`, `game` and `THREE`, run in the page before the picture; what it returns is reported), from
// the camera as the script leaves it. For looking into a question of the light or the scene. The script may return
// `pictures` (name to a canvas PNG data URL) and `page` (a name for a screenshot of the page with its DOM); they are
// written beside --out.
//   node tools/terrain-check.mjs hill-look --gpu --script <file> [--out <file.png>]
WORLD_PROBES.push('hill-look');
WORLD['hill-look'] = async (page) => {
    const script = option('script');
    if (!script) return { error: 'name a script with --script <file>' };
    const body = readFileSync(script, 'utf8');
    const result = await page.evaluate(async (source) => {
        const ride = window.game.hill;
        ride.running = false;
        cancelAnimationFrame(ride.frameId);
        const run = new Function('ride', 'game', 'THREE', `return (async () => { ${source} })();`);
        const said = await run(ride, window.game, THREE);
        return { said, png: window.game.renderer.domElement.toDataURL('image/png') };
    }, body);
    const file = option('out') || join(HILL_SHOTS_OUT, 'hill-look.png');
    writeFileSync(file, Buffer.from(result.png.split(',')[1], 'base64'));
    // A script may hand back more pictures (said.pictures: name to a PNG data URL) and ask for the page as the rider
    // sees it, with the DOM over the canvas (said.page: a name); each is written beside --out
    const said = result.said && typeof result.said === 'object' ? result.said : null;
    const files = [file];
    if (said && said.pictures) {
        for (const [name, png] of Object.entries(said.pictures)) {
            const extra = join(dirname(file), `${name}.png`);
            writeFileSync(extra, Buffer.from(png.split(',')[1], 'base64'));
            files.push(extra);
        }
        delete said.pictures;
    }
    if (said && said.page) {
        const shot = join(dirname(file), `${said.page}.png`);
        writeFileSync(shot, await page.screenshot());
        files.push(shot);
    }
    return { said: result.said, file, files };
};

// world-pops: rides a stretch with the world pilot (--from, --to: ride metres, the stage's first 4 km by default;
// --speed, 18 m/s; --mode, the far chase) with every frame drawn, and logs every change of the window's scenery: each
// house, boulder, tuft and tree that appears, vanishes or changes its level of detail. A change is a pop when the drawn
// share of the thing (1 less its fade's cut: Fade) moves by more than POP_STEP in one frame; a fade is one that starts
// or ends over several frames. Each is logged with its distance from the camera, whether it was in the view frustum,
// and its cause: `room` when the window's room changed (Game.budgetWindow, Scenery.setWindowRoom; the caps and trees are
// chosen again at once at the same place, so the change is the room's alone), with what changed the room by kind (land,
// roads, riders, the player's bike, structures, scenery), else `tiles` when a tile came or went in the last second,
// else `move`. The forest's crown clumps on the land's middle tiles (TerrainMesh.clumps) are read too, as things of
// their own (`clump`). `--level <id>` holds a quality level for the ride (Quality.LEVELS; the ladder is off in a probe).
// `--stand <frames>` then stops the bike at --stands places (ride metres; every STAND_EVERY_M of the stretch by
// default) and holds it there: the far chase settles, then the quality level is stepped down the whole ladder and up
// again, --stand frames at each level, the window's room measured as the ride measures it. A stopped bike's view holds
// still (Scenery.holdsStill), so nothing may come into it or go out of it then, by a pop or a fade: only a tree that
// changes its level, which fades from the one to the other. It reads the frame too: each frame of the stand against the
// one before (at a quarter of its size, the frames of a level change and the two after apart, as its pixel ratio and
// shadow change them all), the pixels that changed by more than STAND_PIXEL, whatever drew them.
// `--villages` rides each village of the stage (VILLAGE_HOUSES buildings or more within VILLAGE_M of the ride) from
// VILLAGE_LEAD_M before it at each of --speeds (15,30 m/s) and logs the first frame each house is drawn in, with its
// distance from the camera; a house first drawn in view within HOUSE_NEAR_M fails.
// Fails on a pop in view of the ride, or a thing that comes or goes in view on a stand. `--out <dir>` writes frame
// strips round the first --strips pops and fades in view (the frame before, the frame of the change, then 8, 16 and
// 32 frames on, cropped round it)
//   node tools/terrain-check.mjs world-pops --world tremola --gpu [--from s] [--to s] [--speed 18] [--mode far] [--level <id>] [--stand 90] [--stands s,s] [--villages] [--speeds 15,30] [--out <dir>] [--strips 24]
const POP_STEP = 0.5;
const STAND_EVERY_M = 1000;
const VILLAGE_M = 300;
const VILLAGE_HOUSES = 15;
const VILLAGE_LEAD_M = 600;
const HOUSE_NEAR_M = 250;
const STAND_PIXEL = 25;
const STAND_QUIET = 300;
const POP_OUT = join(process.env.HOME || '.', 'Library/Caches/twisty-world/pop-shots');
function popRide(placeSource, pilotSource, opts) {
    return (async () => {
        const placeAt = new Function('game', `return (${placeSource})`)(game);
        const env = game.environment, sc = env.scenery, v = game.vehicle, cam = game.camera, route = env.route;
        twistyDev.freeze();
        game.setCameraView(opts.mode);
        if (opts.level) game.quality.fix(opts.level);
        const start = opts.from || Math.max(20, (env.startS ?? 0) + 20);
        // (with --villages and no --to, the villages alone)
        const end = opts.villages && !opts.to ? start : Math.min(route.length - 30, opts.to || start + 4000, (env.endS ?? route.length) - 30);
        await placeAt(start);
        game.worldCamera.reset(v.yawAngle);
        new Function('game', 'cruise', `return (${pilotSource})(game, cruise)`)(game, opts.speed);
        const frustum = new THREE.Frustum(), pv = new THREE.Matrix4(), sphere = new THREE.Sphere(), at = new THREE.Vector3();
        const view = () => {
            cam.updateMatrixWorld(true);
            pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
            frustum.setFromProjectionMatrix(pv);
        };
        const seen = (x, y, z, r) => { sphere.center.set(x, y, z); sphere.radius = r; return frustum.intersectsSphere(sphere); };
        const clumpsOf = new WeakMap();
        // What the window draws of each thing: key to { kind, x, y, z, r, levels: { level: drawn share } }
        const shareOf = (a, o) => 1 - Math.min(1, Math.abs(a[o + 3]));
        const snap = () => {
            const out = new Map();
            const put = (kind, key, level, share, x, y, z, r) => {
                let e = out.get(key);
                if (!e) out.set(key, e = { kind, x, y, z, r, levels: {} });
                e.levels[level] = Math.max(e.levels[level] || 0, share);
            };
            for (const [key, mesh] of sc.forestMeshes) {
                if (!key.endsWith(':0') || !mesh.visible || !mesh.parent) continue;
                const a = mesh.instanceMatrix.array, level = mesh.userData.treeLevel;
                for (let i = 0; i < mesh.count; i++) {
                    const o = i * 16, h = Math.hypot(a[o + 4], a[o + 5], a[o + 6]);
                    put('tree', `t${a[o + 12].toFixed(1)},${a[o + 14].toFixed(1)}`, level, shareOf(a, o), a[o + 12], a[o + 13] + h * 0.5, a[o + 14], Math.max(2, h * 0.6));
                }
            }
            for (const mesh of sc.houseGroup.children) {
                // (the far houses: one mesh, each house a run of its vertices with its share in `fadeCut`)
                if (mesh.userData.farHouses && mesh.visible) {
                    const cut = mesh.geometry.attributes.fadeCut.array;
                    for (const f of mesh.userData.farHouses) put('house', `h${f.x.toFixed(1)},${f.z.toFixed(1)}`, 'far', 1 - Math.min(1, Math.abs(cut[f.first])), f.x, f.y + 4, f.z, 9);
                    continue;
                }
                if (!mesh.isInstancedMesh || !mesh.visible) continue;
                const a = mesh.instanceMatrix.array;
                for (let i = 0; i < mesh.count; i++) {
                    const o = i * 16;
                    put('house', `h${a[o + 12].toFixed(1)},${a[o + 14].toFixed(1)}`, 'house', shareOf(a, o), a[o + 12], a[o + 13] + 4, a[o + 14], 9);
                }
            }
            for (const mesh of (sc.boulderMeshes || new Map()).values()) {
                if (!mesh.visible) continue;
                const a = mesh.instanceMatrix.array;
                for (let i = 0; i < mesh.count; i++) {
                    const o = i * 16;
                    put('boulder', `b${a[o + 12].toFixed(1)},${a[o + 14].toFixed(1)}`, 'boulder', shareOf(a, o), a[o + 12], a[o + 13], a[o + 14], 2);
                }
            }
            // (the crown clumps a middle tile's land draws: TerrainMesh.clumps, read once for each mesh)
            for (const [key, held] of env.tileMeshes) {
                const mesh = held.mesh;
                if (!mesh || !mesh.parent || !mesh.visible || mesh.userData.lod !== 1) continue;
                let list = clumpsOf.get(mesh);
                if (!list) clumpsOf.set(mesh, list = TerrainMesh.clumps(env.data.tile(key), env.data.cover(key), 1));
                // (each at the share the land's shader draws it at, by its tile's distance from the bike: TerrainMesh.clumpShare;
                // a build without that fade draws them whole)
                const limits = env.streamer.tileLodM || WorldStreamer.TILE_LOD_M;
                const entry = TerrainMesh.drawnClumps ? TerrainMesh.drawnClumps().get(key) : null;
                const byTime = entry && entry.mesh === mesh ? entry.share : 1;
                for (const c of list) put('clump', `c${c.x.toFixed(1)},${c.z.toFixed(1)}`, 'clump', TerrainMesh.clumpShare ? byTime * TerrainMesh.clumpShare(c.x, c.z, v.position, limits) : 1, c.x, c.y + c.h / 2, c.z, Math.max(c.r, c.h / 2));
            }
            for (const held of sc.perTile.values()) {
                for (const mesh of held.group.children) {
                    if (mesh.name !== 'tufts' || !mesh.userData.tufts) continue;
                    const cut = mesh.geometry.attributes.fadeCut, first = mesh.userData.tuftFirst;
                    mesh.userData.tufts.forEach((t, i) => put('tuft', `u${t.x.toFixed(1)},${t.z.toFixed(1)}`, 'tuft', cut && first ? 1 - Math.min(1, Math.abs(cut.array[first[i]])) : 1, t.x, t.y, t.z, 0.6));
                }
            }
            return out;
        };
        // What all but the scenery's houses, boulders and trees draw, by kind (as Game.budgetWindow counts it)
        const kindOf = (o, kind) => {
            if (o === v.group) return 'player';
            if (game.traffic && (game.traffic.motorcycles || []).some(b => b.bikeGroup === o)) return 'riders';
            if (game.traffic && (game.traffic.cars || []).some(c => c.carGroup === o)) return 'traffic';
            const n = o.name || '';
            if (/^world-(terrain|farland|horizon)/.test(n) || n === 'ground-cover') return 'land';
            if (/^world-(road-section|side)/.test(n)) return 'roads';
            if (/^world-scenery/.test(n) || n === 'world-houses') return 'scenery';
            if (o === env.group && kind === 'other') return 'structures';
            return kind;
        };
        const restByKind = () => {
            const kinds = {};
            const skip = new Set([sc.boulderGroup, sc.forest]);
            const walk = (o, kind) => {
                if (skip.has(o) || o.name === 'ground-cover' || (!o.visible && !o.isMesh)) return;
                kind = kindOf(o, kind);
                if (o.isMesh && o.geometry && o.geometry.attributes.position && !(o.parent === sc.houseGroup && o.name !== 'houses:footing')) {
                    const g = o.geometry;
                    kinds[kind] = (kinds[kind] || 0) + (g.index ? g.index.count : g.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1);
                }
                for (const child of o.children) walk(child, kind);
            };
            walk(game.scene, 'other');
            for (const k of Object.keys(kinds)) kinds[k] = Math.round(kinds[k]);
            return kinds;
        };
        const events = [], rooms = [], fades = [];
        // (`stand`: the place of the stand under way, or null while riding)
        let frame = 0, last = snap(), lastRest = restByKind(), cause = null, stand = null;
        // Whether a change of one level of a thing is a level change (another of its levels is drawn before or after),
        // not the thing coming or going
        const other = (e, level) => !!e && Object.entries(e.levels).some(([l, share]) => l !== level && share > 0);
        const tick = (now, why, room) => {
            const dist = e => Math.round(Math.hypot(e.x - cam.position.x, e.y - cam.position.y, e.z - cam.position.z));
            for (const [key, e] of now) {
                const was = last.get(key);
                for (const [level, share] of Object.entries(e.levels)) {
                    const before = was ? was.levels[level] || 0 : 0;
                    const step = share - before;
                    const swap = other(e, level) || other(was, level);
                    if (Math.abs(step) > opts.popStep) events.push({ frame, key, kind: e.kind, level, step: Math.round(step * 100) / 100, why, room, stand, swap, x: e.x, y: e.y, z: e.z, r: e.r, d: dist(e) });
                    else if (step && (before === 0 || share === 0 || before === 1 || share === 1) && Math.abs(step) <= opts.popStep) fades.push({ frame, key, kind: e.kind, level, from: before, to: share, stand, swap, x: e.x, y: e.y, z: e.z, r: e.r, d: dist(e) });
                }
            }
            for (const [key, e] of last) {
                const is = now.get(key);
                for (const [level, before] of Object.entries(e.levels)) {
                    if (is && is.levels[level] !== undefined) continue;
                    if (before > opts.popStep) events.push({ frame, key, kind: e.kind, level, step: -Math.round(before * 100) / 100, why, room, stand, swap: other(e, level) || other(is, level), x: e.x, y: e.y, z: e.z, r: e.r, d: dist(e) });
                }
            }
            last = now;
        };
        // A room the window takes changes the caps and the trees at once, here, so what changes then is the room's
        const setRoom = sc.setWindowRoom.bind(sc);
        sc.setWindowRoom = (value) => {
            const taken = setRoom(value);
            if (!taken) return taken;
            const rest = restByKind();
            const delta = {};
            for (const k of new Set([...Object.keys(rest), ...Object.keys(lastRest)])) { const d = (rest[k] || 0) - (lastRest[k] || 0); if (d) delta[k] = d; }
            lastRest = rest;
            const room = { frame, s: Math.round(v.routeS), room: value, delta };
            rooms.push(room);
            if (!sc.capsBusy) sc.rankCaps(sc.capsBike || v.position, true);
            sc.rankTrees(sc.treeBike || v.position, true);
            view();
            tick(snap(), 'room', rooms.length - 1);
            return taken;
        };
        const tileSig = () => [...sc.perTile.keys()].join('|');
        let tiles = tileSig(), tilesAt = -1e9;
        // The frames kept for the strips: the last drawn, and the ones asked for after a change
        const W = 320, H = 200;
        const ring = [document.createElement('canvas'), document.createElement('canvas')];
        ring.forEach(c => { c.width = game.graphics.renderer.domElement.width; c.height = game.graphics.renderer.domElement.height; });
        const strips = [];
        const grab = (into) => into.getContext('2d').drawImage(game.graphics.renderer.domElement, 0, 0);
        let stripAt = -1e9;
        const wantStrip = (e, kind) => {
            // (spread over the ride: one in 90 frames at the most)
            if (strips.length >= opts.strips || frame - stripAt < 90) return;
            at.set(e.x, e.y, e.z).project(cam);
            if (at.z < -1 || at.z > 1 || Math.abs(at.x) > 1 || Math.abs(at.y) > 1) return;
            const c = game.graphics.renderer.domElement;
            const sx = (at.x + 1) / 2 * c.width, sy = (1 - at.y) / 2 * c.height;
            const sheet = document.createElement('canvas');
            sheet.width = W * 5 + 16;
            sheet.height = H + 18;
            const ctx = sheet.getContext('2d');
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, sheet.width, sheet.height);
            const crop = [Math.max(0, Math.min(c.width - W, sx - W / 2)), Math.max(0, Math.min(c.height - H, sy - H / 2))];
            const put = (src, k) => {
                ctx.drawImage(src, crop[0], crop[1], W, H, k * (W + 4), 18, W, H);
                ctx.strokeStyle = 'rgba(255,220,0,0.7)';
                ctx.strokeRect(k * (W + 4) + sx - crop[0] - 12, 18 + sy - crop[1] - 12, 24, 24);
            };
            put(ring[(frame + 1) % 2], 0);
            put(c, 1);
            ctx.fillStyle = '#fff';
            ctx.font = '12px sans-serif';
            ctx.fillText(`${kind} ${e.kind} ${e.level} ${e.why || ''} s ${Math.round(v.routeS)} d ${Math.round(Math.hypot(e.x - cam.position.x, e.y - cam.position.y, e.z - cam.position.z))} m: before, the frame, +8, +16, +32`, 4, 13);
            stripAt = frame;
            strips.push({ sheet, ctx, put, left: [8, 16, 32].map(n => frame + n), k: 2, name: `${String(strips.length + 1).padStart(2, '0')}-${kind}-${e.kind}-s${Math.round(v.routeS)}` });
        };
        let ticks = 0, crashes = 0, checked = 0;
        const t0 = performance.now();
        while (v.routeS < end && !game.finished && ticks < 60 * 60 * 30) {
            twistyDev.step(1, { render: true });
            ticks++;
            frame++;
            if (v.crashed) crashes++;
            if (ticks % 60 === 0) await new Promise(resolve => setTimeout(resolve, 0));
            const sig = tileSig();
            if (sig !== tiles) { tiles = sig; tilesAt = frame; }
            view();
            const firstFade = fades.length;
            tick(snap(), frame - tilesAt < 60 ? 'tiles' : 'move', null);
            // (the room's own were logged inside the step, from the view of the frame before)
            for (const e of events.slice(checked)) e.inView = seen(e.x, e.y, e.z, e.r);
            for (const e of fades.slice(firstFade)) e.inView = seen(e.x, e.y, e.z, e.r);
            for (const e of events.slice(checked)) if (e.inView) wantStrip(e, 'pop');
            checked = events.length;
            for (const e of fades.slice(firstFade)) if (e.inView && (e.from === 0 || e.to === 0 || e.from === 1 || e.to === 1)) wantStrip(e, e.from === 0 ? 'fade-in' : e.to === 0 ? 'fade-out' : 'fade-level');
            for (const s of strips) while (s.left.length && s.left[0] === frame) { s.left.shift(); s.put(game.graphics.renderer.domElement, s.k++); }
            grab(ring[frame % 2]);
        }
        // The villages: each run of the stage where VILLAGE_HOUSES buildings or more stand within VILLAGE_M of the ride,
        // ridden from VILLAGE_LEAD_M before it at each speed; the first frame each house is drawn in, its distance and
        // whether it is in view (the ones drawn on the put-down's first frame apart)
        const villages = [];
        if (opts.villages) {
            // (the room's changes are not logged here: they are the ride's)
            const wrapped = sc.setWindowRoom;
            sc.setWindowRoom = setRoom;
            const buildings = env.data.buildings || [];
            const s0 = env.startS ?? 0, s1 = (env.endS ?? route.length) - 30;
            const spans = [];
            for (let at = s0; at < s1; at += 50) {
                const p = route.sample(at, {});
                const n = buildings.filter(b => Math.abs(b.x - p.x) < opts.villageM && Math.abs(b.z - p.z) < opts.villageM && Math.hypot(b.x - p.x, b.z - p.z) < opts.villageM).length;
                if (n < opts.villageHouses) continue;
                const lastSpan = spans[spans.length - 1];
                if (lastSpan && at - lastSpan.to <= 100) lastSpan.to = at;
                else spans.push({ from: at, to: at });
            }
            for (const span of spans) {
                for (const speed of opts.speeds) {
                    const from = Math.max(s0 + 20, span.from - opts.villageLead), to = Math.min(s1, span.to + 100);
                    await placeAt(from);
                    game.worldCamera.reset(v.yawAngle);
                    twistyDev.step(1, { render: true });
                    view();
                    const known = new Set([...snap()].filter(([, e]) => e.kind === 'house').map(([k]) => k));
                    const firsts = [];
                    new Function('game', 'cruise', `return (${pilotSource})(game, cruise)`)(game, speed);
                    let n = 0;
                    while (v.routeS < to && !game.finished && n < 60 * 60 * 10) {
                        twistyDev.step(1, { render: true });
                        n++;
                        if (n % 60 === 0) await new Promise(resolve => setTimeout(resolve, 0));
                        view();
                        for (const [key, e] of snap()) {
                            if (e.kind !== 'house' || known.has(key)) continue;
                            known.add(key);
                            firsts.push({ s: Math.round(v.routeS), d: Math.round(Math.hypot(e.x - cam.position.x, e.y - cam.position.y, e.z - cam.position.z)), inView: seen(e.x, e.y, e.z, e.r), x: Math.round(e.x), z: Math.round(e.z), level: Object.keys(e.levels).join('/') });
                        }
                    }
                    const near = firsts.filter(f => f.inView && f.d < opts.houseNearM);
                    villages.push({ from: Math.round(from), to: Math.round(to), speed, reached: Math.round(v.routeS), crashed: v.crashed, houses: firsts.length, nearInView: near.length, nearest: near.sort((a, b) => a.d - b.d).slice(0, 8) });
                }
            }
            last = snap();
            sc.setWindowRoom = wrapped;
        }
        const ms = performance.now() - t0;
        // The stands: the bike stopped and held, the ladder stepped down and up (opts.stand frames at each level)
        const stands = [];
        if (opts.stand > 0) {
            const input = game.input, saved = { throttle: input.getThrottleInput, brake: input.getBrakeInput };
            if (twistyDev.ap) twistyDev.ap.on = false;
            input.getThrottleInput = () => 0;
            input.getBrakeInput = () => 1;
            const top = Quality.LEVELS.length - 1;
            const ladder = [...Array(top + 1).keys()].reverse().concat([...Array(top).keys()].slice(1), [top]);
            const places = opts.stands && opts.stands.length ? opts.stands : [];
            if (!places.length) for (let at = start + opts.standEvery / 2; at < end; at += opts.standEvery) places.push(Math.round(at));
            const W = Math.max(1, Math.round(game.graphics.renderer.domElement.width / 4)), H = Math.max(1, Math.round(game.graphics.renderer.domElement.height / 4));
            const small = document.createElement('canvas');
            small.width = W;
            small.height = H;
            const sctx = small.getContext('2d', { willReadFrequently: true });
            const read = () => { sctx.drawImage(game.graphics.renderer.domElement, 0, 0, W, H); return sctx.getImageData(0, 0, W, H).data; };
            for (const at of places) {
                await placeAt(at);
                game.quality.fix(top);
                game.worldCamera.reset(v.yawAngle);
                // (settled: the chase camera comes to rest, what the put-down chose has faded in, and the tiles the place
                // before held are let go after the streamer's grace: a stop in a ride has none to let go. The tiles held
                // the same for STAND_QUIET frames running, 2 minutes of frames at the most)
                const landSig = () => `${[...env.streamer.tiles].map(([k, h]) => `${k}:${h.lod}`).join('|')}#${tileSig()}`;
                let quiet = 0, held = landSig();
                for (let k = 0; k < 7200 && (k < 150 || quiet < opts.standQuiet); k++) {
                    twistyDev.step(1, { render: true });
                    if (k % 60 === 0) await new Promise(resolve => setTimeout(resolve, 0));
                    const now = landSig();
                    quiet = now === held && !env.streamer.busy ? quiet + 1 : 0;
                    held = now;
                }
                view();
                last = snap();
                stand = Math.round(v.routeS);
                const firstEvent = events.length, firstFade = fades.length, firstRoom = rooms.length;
                let before = read(), changedFrames = 0, mostPixels = 0, changedAt = -99;
                for (const level of ladder) {
                    game.quality.fix(level);
                    changedAt = frame;
                    for (let k = 0; k < opts.stand; k++) {
                        twistyDev.step(1, { render: true });
                        frame++;
                        if (k % 60 === 0) await new Promise(resolve => setTimeout(resolve, 0));
                        view();
                        tick(snap(), 'stand', null);
                        const now = read();
                        if (frame - changedAt > 2) {
                            let n = 0;
                            for (let i = 0; i < now.length; i += 4) if (Math.abs(0.2126 * (now[i] - before[i]) + 0.7152 * (now[i + 1] - before[i + 1]) + 0.0722 * (now[i + 2] - before[i + 2])) > opts.standPixel) n++;
                            if (n) changedFrames++;
                            mostPixels = Math.max(mostPixels, n);
                        }
                        before = now;
                    }
                }
                for (const e of events.slice(firstEvent)) e.inView = seen(e.x, e.y, e.z, e.r);
                for (const e of fades.slice(firstFade)) e.inView = seen(e.x, e.y, e.z, e.r);
                const moved = Math.hypot(v.speed);
                stands.push({ s: stand, speed: Math.round(moved * 100) / 100, frames: ladder.length * opts.stand, rooms: rooms.length - firstRoom, changedFrames, mostPixels });
                stand = null;
            }
            input.getThrottleInput = saved.throttle;
            input.getBrakeInput = saved.brake;
        }
        sc.setWindowRoom = setRoom;
        const player = restByKind().player || 0;
        return {
            start: Math.round(start), end: Math.round(end), reached: Math.round(v.routeS), frames: frame, crashes, seconds: Math.round(ms / 1000),
            playerTriangles: player, bike: v.bike || null, riderRoom: game.riderRoom ?? null, level: Quality.LEVELS[game.quality.level].id, rooms, stands, villages,
            fadeCount: fades.filter(f => f.stand === null).length, fadesInView: fades.filter(f => f.stand === null && f.inView).length,
            // (a thing that came or went in view on a stand, by a fade: a level change is not one)
            standFades: fades.filter(f => f.stand !== null && f.inView && !f.swap && (f.from === 0 || f.to === 0)).map(f => ({ s: f.stand, frame: f.frame, kind: f.kind, level: f.level, from: f.from, to: f.to, d: f.d, x: Math.round(f.x), z: Math.round(f.z) })),
            events: events.map(e => ({ frame: e.frame, kind: e.kind, level: e.level, step: e.step, why: e.why, room: e.room, stand: e.stand, swap: e.swap, inView: e.inView, d: e.d, x: Math.round(e.x), z: Math.round(e.z) })),
            strips: strips.map(s => ({ name: s.name, png: s.sheet.toDataURL('image/png') }))
        };
    })();
}
WORLD_PROBES.push('world-pops');
WORLD['world-pops'] = async (page) => {
    const opts = { mode: option('mode') || 'far', speed: Number(option('speed') || 18), from: Number(option('from') || 0), to: Number(option('to') || 0), strips: Number(option('strips') || (option('out') ? 24 : 0)), popStep: POP_STEP,
        level: option('level') || null, stand: Number(option('stand') || 0), stands: option('stands') ? option('stands').split(',').map(Number) : [], standPixel: STAND_PIXEL, standEvery: STAND_EVERY_M, standQuiet: STAND_QUIET,
        villages: flag('villages'), speeds: (option('speeds') || '15,30').split(',').map(Number), villageM: VILLAGE_M, villageHouses: VILLAGE_HOUSES, villageLead: VILLAGE_LEAD_M, houseNearM: HOUSE_NEAR_M };
    const ride = await page.evaluate(popRide, placeAt.toString(), pilotWorld.toString(), opts);
    const files = [];
    if (ride.strips.length) {
        const out = option('out') || POP_OUT;
        mkdirSync(out, { recursive: true });
        for (const s of ride.strips) {
            const file = join(out, `${option('tag') || 'pops'}-${s.name}.png`);
            writeFileSync(file, Buffer.from(s.png.split(',')[1], 'base64'));
            files.push(file);
        }
    }
    delete ride.strips;
    // The shares: of the pops, by cause, by the kind of thing, in view; of the room's, by what changed the room
    const share = (list, key) => {
        const out = {};
        for (const e of list) out[key(e)] = (out[key(e)] || 0) + 1;
        return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]).map(([k, n]) => [k, { n, share: Math.round(n / Math.max(1, list.length) * 1000) / 10 }]));
    };
    const events = ride.events.filter(e => e.stand === null);
    const inView = events.filter(e => e.inView);
    const standEvents = ride.events.filter(e => e.stand !== null && e.inView);
    // What changed the room for a pop of the room's: the kind whose count moved most the way the room moved
    const roomKind = e => {
        const r = ride.rooms[e.room];
        if (!r) return 'none';
        const list = Object.entries(r.delta).filter(([, d]) => d !== 0).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
        return list.length ? list[0][0] : 'none';
    };
    const roomPops = events.filter(e => e.why === 'room');
    const summary = {
        pops: events.length, inView: inView.length, inViewShare: Math.round(inView.length / Math.max(1, events.length) * 1000) / 10,
        byCause: share(events, e => e.why), inViewByCause: share(inView, e => e.why), byKind: share(events, e => e.kind), inViewByKind: share(inView, e => e.kind),
        roomByKind: share(roomPops, roomKind), roomInViewByKind: share(roomPops.filter(e => e.inView), roomKind),
        roomChanges: ride.rooms.length, roomChangesByKind: share(ride.rooms.map((r, k) => ({ room: k })), roomKind),
        medianInViewM: inView.length ? [...inView].sort((a, b) => a.d - b.d)[Math.floor(inView.length / 2)].d : null,
        fades: ride.fadeCount, fadesInView: ride.fadesInView,
        // On the stands: pops in view, and things that came or went in view (pops or fades; a level change apart)
        stands: ride.stands.length, standPops: standEvents.length, standComesGoes: standEvents.filter(e => !e.swap).length + ride.standFades.length,
        standByKind: share([...standEvents.filter(e => !e.swap), ...ride.standFades], e => e.kind),
        standPixelFrames: ride.stands.reduce((n, st) => n + st.changedFrames, 0), standMostPixels: Math.max(0, ...ride.stands.map(st => st.mostPixels)),
        villages: ride.villages.length, villageHouses: ride.villages.reduce((n, r) => n + r.houses, 0), villageNearInView: ride.villages.reduce((n, r) => n + r.nearInView, 0)
    };
    const standList = [...standEvents, ...ride.standFades].slice(0, 40);
    delete ride.standFades;
    return { ...ride, events: option('dump') ? ride.events : inView.slice(0, 40), standList, summary, files };
};

// world-look: a script of the caller's in a world page (--script <file>: the body of an async function given `game`,
// `THREE` and `placeAt`), for looking into a question of the drawn world. What it returns is reported; its
// `pictures` (name to a PNG data URL) are written into --out <dir>.
//   node tools/terrain-check.mjs world-look --world gotthard-north --gpu --script <file> [--out <dir>]
WORLD_PROBES.push('world-look');
WORLD['world-look'] = async (page) => {
    const script = option('script');
    if (!script) return { error: 'name a script with --script <file>' };
    const said = await page.evaluate(async (source, placeSource) => {
        const placeAt = new Function('game', `return (${placeSource})`)(window.game);
        const run = new Function('game', 'THREE', 'placeAt', `return (async () => { ${source} })();`);
        return run(window.game, THREE, placeAt);
    }, readFileSync(script, 'utf8'), placeAt.toString());
    const files = [];
    if (said && typeof said === 'object' && said.pictures) {
        const out = option('out') || '.';
        mkdirSync(out, { recursive: true });
        for (const [name, png] of Object.entries(said.pictures)) {
            const file = join(out, `${name}.png`);
            writeFileSync(file, Buffer.from(png.split(',')[1], 'base64'));
            files.push(file);
        }
        delete said.pictures;
    }
    return { said, files };
};

// world-seams: no edge of the drawn land shows as a dark line. A tile's skirt (TerrainMesh.build) is lit as the land
// above it, so in the frame as drawn a pixel of one is about as light as the land round it, whichever side it is seen
// from. Every --every metres (SEAM_EVERY_M) of the stage the bike is put down
// and the frame is read from the near chase (--modes; far too when named), looking ahead and turned to each side
// (--turns): the whole frame, out to the far land. Read in the light alone (the land's colours white): a pixel of skirt
// seen from behind (with only land beside it) under SEAM_DARK of the median of the land within SEAM_REACH_PX of it,
// and of the land straight over it, is dark; a tile
// whose dark pixels in one view make a line (SEAM_LINE_PX or more, over SEAM_LINE_ROWS rows or more, one to every 2 px
// of its length) is a seam, and one seam fails. The frame is drawn without cast shadows. The window's edge too: read every 8 m
// along each tile edge with no drawn tile past it, where it is in view, the far land's tone less the tile's, averaged
// over 5 points along the edge, is more than SEAM_TONE_STEP on the mean of SEAM_TONE_LINE_PX points or more of a
// view, and one such view fails. --out <dir> saves each view with a seam or a tone line (and --at s,s views, with or without one).
//   node tools/terrain-check.mjs world-seams --world gotthard-north --gpu [--every 250] [--modes near] [--turns 0,-60,60] [--at s,s] [--out <dir> --tag T]
const SEAM_EVERY_M = 250;
const SEAM_MODES = ['near'];
const SEAM_TURNS = [0, -60, 60];
const SEAM_DARK = 0.7;
const SEAM_REACH_PX = 6;
const SEAM_LINE_PX = 8;
const SEAM_LINE_ROWS = 6;
const SEAM_TONE_STEP = 3.5;
const SEAM_TONE_LINE_PX = 20;
const SEAM_SIDE_M = 12;
async function seamView(placeSource, s, mode, turnDeg, keep, rule) {
    const DIST_CODE = 'floor(clamp(log2(max(vD, 1.0)) * 16.0, 0.0, 255.0) + 0.5) / 255.0';
    const placeAt = new Function('game', `return (${placeSource})`)(game);
    game.worldLinger = false;
    const env = game.environment, v = game.vehicle, renderer = game.graphics.renderer;
    game.setCameraView(mode);
    await placeAt(s);
    document.querySelectorAll('#finishBanner').forEach(el => el.remove());
    game.worldCamera.reset(v.yawAngle);
    twistyDev.autopilot({ speed: 0 });
    for (let i = 0; i < 60; i++) twistyDev.step(1);
    env.streamer.pump(Infinity);
    twistyDev.step(1, { render: true });
    const cam = game.camera;
    if (turnDeg) {
        cam.rotation.order = 'YXZ';
        cam.rotation.y += turnDeg * Math.PI / 180;
        cam.updateMatrixWorld(true);
    }
    // Drawn without cast shadows: a skirt in a wall's or a house's shadow is dark for its own reason
    const casting = [];
    game.scene.traverse(o => { if (o.isLight && o.castShadow) { casting.push(o); o.castShadow = false; } });
    game.graphics.render(game.scene, cam);
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const W = size.x, H = size.y;
    const canvas = renderer.domElement, copy = document.createElement('canvas');
    copy.width = W; copy.height = H;
    const ctx = copy.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(canvas, 0, 0);
    const frame = ctx.getImageData(0, 0, W, H).data;
    const png = keep ? copy.toDataURL('image/png') : null;
    // The light alone: the frame again with every tile's colours white, so a skirt is read by how it is lit, not by
    // the colour of the land it hangs from (a strip of dark forest beside light scree)
    // (the far land too: where it stands in front of a skirt's foot the pass and the frame can disagree by a pixel)
    const swapped = [];
    for (const g of [...[...env.tileMeshes.values()].map(held => held.mesh.geometry), ...[env.horizon, ...(env.farLand || [])].filter(Boolean).map(m => m.geometry)]) {
        const colour = g.attributes.color;
        if (!colour) continue;
        swapped.push([g, colour]);
        g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colour.array.length).fill(1), colour.itemSize));
    }
    // (and without the far land's colour at the window's edge, LandShade.EDGE_M, which would tint the white)
    const edge = LandShade.edgeShared ? LandShade.edgeShared.uEdgeM : null, edgeM = edge ? edge.value : 0;
    if (edge) edge.value = 0;
    game.graphics.render(game.scene, cam);
    ctx.drawImage(canvas, 0, 0);
    const shade = ctx.getImageData(0, 0, W, H).data;
    if (edge) edge.value = edgeM;
    for (const [g, colour] of swapped) g.setAttribute('color', colour);
    casting.forEach(o => { o.castShadow = true; });
    // The pass of kinds: land 1, skirt or closing face 2, the far land 3, anything else 0; the tile in green and blue
    const tiles = [];
    const flags = new WeakMap();
    const skirtOf = mesh => {
        const g = mesh.geometry;
        if (flags.has(g)) return;
        const count = g.attributes.position.count, out = new Float32Array(count);
        const side = (WorldData.TILE_N - 1) / (1 << (mesh.userData.lod || 0)) + 1, ground = side * side + side * 4;
        // (past the ground's vertices: a cut's own land, or a forest clump when the tile has no cuts; the faces that
        // close a cut's step stand at a wall's foot, in its shadow, and are read by world-walls: kind 4, not read here)
        for (let k = side * side; k < count; k++) out[k] = k < ground ? 1 : mesh.userData.cuts ? 0 : 2;
        if (mesh.userData.cuts) for (const k of mesh.userData.closing || []) out[k] = 3;
        g.setAttribute('seamSkirt', new THREE.BufferAttribute(out, 1));
        flags.set(g, true);
    };
    const landMat = id => new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        uniforms: { id: { value: id } },
        vertexShader: 'attribute float seamSkirt; varying float vSkirt; varying float vD; void main(){ vSkirt = seamSkirt; vec4 mv = modelViewMatrix * vec4(position, 1.0); vD = length(mv.xyz); gl_Position = projectionMatrix * mv; }',
        fragmentShader: `uniform float id; varying float vSkirt; varying float vD; void main(){ float k = vSkirt > 2.5 ? 4.0 : vSkirt > 1.5 ? 0.0 : vSkirt > 0.5 ? (gl_FrontFacing ? 2.0 : 5.0) : 1.0; gl_FragColor = vec4(k / 255.0, mod(id, 256.0) / 255.0, ${DIST_CODE}, 1.0); }`
    });
    // The far land: kind 3, and its distance as the land's; dropped with the Earth's curvature as it is drawn
    // (LandShade.patch `curvature`), or the far land just past a tile's edge stood in front of its skirt in the pass
    const far = new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        uniforms: { uDrop: LandShade.uniforms.uDrop },
        vertexShader: 'uniform float uDrop; varying float vD; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vec2 d = w.xz - cameraPosition.xz; w.y -= dot(d, d) * uDrop; vec4 mv = viewMatrix * w; vD = length(mv.xyz); gl_Position = projectionMatrix * mv; }',
        fragmentShader: `varying float vD; void main(){ gl_FragColor = vec4(3.0 / 255.0, 0.0, ${DIST_CODE}, 1.0); }`
    });
    const other = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide, fog: false });
    const saved = new Map(), hidden = [], made = [], offsets = new Map();
    const bike = v.group;
    game.scene.children.forEach(c => { if (c !== env.group && c !== bike && c.visible && !c.isLight) { hidden.push(c); c.visible = false; } });
    bike.traverse(o => { if (o.isMesh) { saved.set(o, o.material); o.material = other; } });
    const inside = (o, group) => { for (let n = o; n; n = n.parent) if (n === group) return true; return false; };
    env.group.traverse(o => {
        if (!o.isMesh) return;
        saved.set(o, o.material);
        if (inside(o, env.tileGroup) && o.userData.world === 'terrain') {
            skirtOf(o);
            const m = landMat(tiles.length);
            tiles.push(o.userData.tile);
            made.push(m);
            o.material = m;
        } else if (o === env.horizon || (env.farLand || []).includes(o)) o.material = far;
        else {
            // (a road drawn with a polygon offset over the land keeps it, or the land under it wins the pass)
            const own = Array.isArray(saved.get(o)) ? saved.get(o)[0] : saved.get(o);
            if (own && own.polygonOffset) {
                const key = `${own.polygonOffsetFactor},${own.polygonOffsetUnits}`;
                if (!offsets.has(key)) offsets.set(key, Object.assign(other.clone(), { polygonOffset: true, polygonOffsetFactor: own.polygonOffsetFactor, polygonOffsetUnits: own.polygonOffsetUnits }));
                o.material = offsets.get(key);
            } else o.material = other;
        }
    });
    const background = game.scene.background, fog = game.scene.fog;
    game.scene.background = new THREE.Color(0x000000);
    game.scene.fog = null;
    const target = new THREE.WebGLRenderTarget(W, H);
    renderer.setRenderTarget(target);
    renderer.render(game.scene, cam);
    const ids = new Uint8Array(W * H * 4);
    renderer.readRenderTargetPixels(target, 0, 0, W, H, ids);
    renderer.setRenderTarget(null);
    for (const [o, m] of saved) o.material = m;
    hidden.forEach(c => { c.visible = true; });
    game.scene.background = background;
    game.scene.fog = fog;
    target.dispose();
    made.forEach(m => m.dispose());
    offsets.forEach(m => m.dispose());
    far.dispose(); other.dispose();
    // (the pass's rows run bottom up, the frame's top down)
    const kind = (x, y) => ids[((H - 1 - y) * W + x) * 4];
    const tileAt = (x, y) => ids[((H - 1 - y) * W + x) * 4 + 1];
    // (the distance in steps of 1/16 of a doubling, about 4.4%: DIST_CODE)
    const distAt = (x, y) => ids[((H - 1 - y) * W + x) * 4 + 2];
    const lum = (x, y) => { const at = (y * W + x) * 4; return 0.2126 * frame[at] + 0.7152 * frame[at + 1] + 0.0722 * frame[at + 2]; };
    const lit = (x, y) => { const at = (y * W + x) * 4; return 0.2126 * shade[at] + 0.7152 * shade[at + 1] + 0.0722 * shade[at + 2]; };
    // (the reach is in pixels of a 900 px high frame)
    const R = Math.max(2, Math.round(rule.reachPx * H / 900));
    const byTile = new Map();
    let skirtPx = 0, darkPx = 0;
    const around = [], above = [];
    for (let y = R; y < H - R; y++) {
        for (let x = R; x < W - R; x++) {
            // (a skirt seen from behind, kind 5: three's two-sided flip turned its light down; one seen from in front
            // is lit as the land in any case)
            const k = kind(x, y);
            if (k === 2 || k === 5) skirtPx++;
            if (k !== 5) continue;
            // (a pixel beside anything but land is a blend of the two in the frame as drawn, which is smoothed: a wall's
            // dark stone or a tree beside a closing face is no seam)
            let clear = true;
            for (let dy = -1; dy <= 1 && clear; dy++) for (let dx = -1; dx <= 1; dx++) if (kind(x + dx, y + dy) === 0) { clear = false; break; }
            if (!clear) continue;
            around.length = 0;
            for (let dy = -R; dy <= R; dy += 2) for (let dx = -R; dx <= R; dx += 2) if (kind(x + dx, y + dy) === 1) around.push(lit(x + dx, y + dy));
            if (around.length < 6) continue;
            around.sort((a, b) => a - b);
            const median = around[around.length >> 1], l = lit(x, y);
            // (and darker than the land straight over it on screen, which it hangs from)
            above.length = 0;
            for (let dy = 1; dy <= R; dy++) if (kind(x, y - dy) === 1) above.push(lit(x, y - dy));
            above.sort((a, b) => a - b);
            const over = above.length >= 2 ? above[above.length >> 1] : median;
            if (l < rule.dark * median && l < rule.dark * over && median - l > 12) {
                darkPx++;
                const t = tiles[tileAt(x, y)];
                const held = byTile.get(t) || byTile.set(t, { tile: t, px: 0, x0: x, x1: x, y0: y, y1: y, l: 0, median: 0 }).get(t);
                held.px++; held.l += l; held.median += median;
                held.x0 = Math.min(held.x0, x); held.x1 = Math.max(held.x1, x); held.y0 = Math.min(held.y0, y); held.y1 = Math.max(held.y1, y);
            }
        }
    }
    // The window's edge: every edge of a drawn tile with no drawn tile past it, read every 8 m where it is in view.
    // The land's tone rule.sideM in from the edge on the tile and rule.sideM out on the far land (both seen there: the
    // pass's distance within 2 steps of their own), each the mean of 3 x 3 px. In metres, so a frame of any size reads
    // the same land; the slope's own shading changes little over twice rule.sideM. The grain of the land differs
    // place to place, and a step in tone changes its sign along a hillside as the light does: (far - tile) is averaged
    // over 5 points running along each edge, and a line of a new tone is a mean of that size over rule.toneLinePx or
    // more points in a view more than rule.toneStep in luminance (0 to 255)
    let edgePairs = 0, tonePx = 0, signed = 0, runSum = 0, runCount = 0;
    const steps = [], edgePoints = [];
    const M = WorldData.TILE_M;
    const project = (x, y, z) => { const p = new THREE.Vector3(x, y, z).project(cam); return p.z < 1 && p.z > -1 ? [(p.x + 1) / 2 * W, (1 - p.y) / 2 * H] : null; };
    const codeOf = (x, y, z) => Math.round(Math.log2(Math.max(1, cam.position.distanceTo(new THREE.Vector3(x, y, z)))) * 16);
    // The far land as drawn: its grid's own vertices (Horizon.grid, every `stride` nodes of far.bin), read bilinear
    const farData = env.horizon && env.data.far;
    const farStride = farData ? Horizon.strideFor(farData) : 1;
    const drawnFar = farData ? { x0: farData.x0, z0: farData.z0, cell: farData.cell * farStride, nx: Math.floor((farData.nx - 1) / farStride) + 1, nz: Math.floor((farData.nz - 1) / farStride) + 1 } : null;
    // (the grid whole: the drawn mesh may be cut to the tubes' boxes, WorldEnvironment.clipHorizon)
    const farPos = env.horizon ? (env.horizonWhole ? env.horizonWhole.positions : env.horizon.geometry.attributes.position.array) : null;
    const farY = (x, z) => {
        const g = drawnFar;
        const fx = (x - g.x0) / g.cell, fz = (z - g.z0) / g.cell;
        const i = Math.max(0, Math.min(g.nx - 2, Math.floor(fx))), j = Math.max(0, Math.min(g.nz - 2, Math.floor(fz)));
        const u = fx - i, w = fz - j, Y = (a, b) => farPos[((j + b) * g.nx + i + a) * 3 + 1];
        return (Y(0, 0) * (1 - u) + Y(1, 0) * u) * (1 - w) + (Y(0, 1) * (1 - u) + Y(1, 1) * u) * w;
    };
    // The tone at a world point seen in the frame as `want`, or null
    const toneAt = (x, y, z, want) => {
        const q = project(x, y, z);
        if (!q || q[0] < 2 || q[1] < 2 || q[0] >= W - 2 || q[1] >= H - 2) return null;
        const u = Math.round(q[0]), w = Math.round(q[1]);
        if (Math.abs(distAt(u, w) - codeOf(x, y, z)) > 2) return null;
        let sum = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (kind(u + dx, w + dy) !== want) return null; sum += lum(u + dx, w + dy); }
        return { tone: sum / 9, at: [u, w] };
    };
    for (const [key, held] of (drawnFar ? env.tileMeshes : [])) {
        const [tx, tz] = key.split(',').map(Number);
        const mesh = held.mesh;
        // [neighbour dx, dz, edge point (m along), inward direction]
        const sides = [[-1, 0, m => [tx * M, tz * M + m], [1, 0]], [1, 0, m => [(tx + 1) * M, tz * M + m], [-1, 0]], [0, -1, m => [tx * M + m, tz * M], [0, 1]], [0, 1, m => [tx * M + m, (tz + 1) * M], [0, -1]]];
        for (const [dx, dz, at, inward] of sides) {
            if (env.tileMeshes.has(`${tx + dx},${tz + dz}`)) continue;
            const run = [];
            for (let m = 4; m < M; m += 8) {
                const [x, z] = at(m);
                if (cam.position.distanceTo(new THREE.Vector3(x, TerrainMesh.drawnAt(mesh, x + inward[0] * 0.5, z + inward[1] * 0.5), z)) < 300) continue;
                const ix = x + inward[0] * rule.sideM, iz = z + inward[1] * rule.sideM, ox = x - inward[0] * rule.sideM, oz = z - inward[1] * rule.sideM;
                const tile = toneAt(ix, TerrainMesh.drawnAt(mesh, ix, iz), iz, 1);
                const far = tile && toneAt(ox, farY(ox, oz), oz, 3);
                if (!tile || !far) continue;
                const step = far.tone - tile.tone;
                edgePairs++;
                if (edgePoints.length < 400) edgePoints.push([...tile.at, ...far.at, Math.round(tile.tone), Math.round(far.tone), key]);
                steps.push(Math.abs(step));
                signed += step;
                run.push(step);
                if (Math.abs(step) > rule.toneStep) tonePx++;
            }
            for (let i = 2; i + 2 < run.length; i++) {
                runSum += Math.abs((run[i - 2] + run[i - 1] + run[i] + run[i + 1] + run[i + 2]) / 5);
                runCount++;
            }
        }
    }
    steps.sort((a, b) => a - b);
    const toneMedian = steps.length ? Math.round(steps[steps.length >> 1] * 10) / 10 : null;
    const toneP90 = steps.length ? Math.round(steps[Math.floor(steps.length * 0.9)] * 10) / 10 : null;
    const toneMean = runCount ? Math.round((runSum / runCount) * 10) / 10 : 0;
    const toneLine = runCount >= rule.toneLinePx && toneMean > rule.toneStep;
    // (a line: rule.linePx pixels or more, rule.lineRows rows or more, and at least one to every 2 px of its length,
    // where a patch of dark forest beside light scree is scattered)
    const seams = [...byTile.values()].filter(t => t.px >= rule.linePx && t.y1 - t.y0 + 1 >= rule.lineRows && t.px >= Math.max(t.x1 - t.x0, t.y1 - t.y0) / 2).map(t => ({ tile: t.tile, px: t.px, box: [t.x0, t.y0, t.x1, t.y1], lum: Math.round(t.l / t.px), land: Math.round(t.median / t.px) }));
    const lods = {};
    for (const [k, h] of env.tileMeshes) lods[k] = h.mesh.userData.lod;
    for (const seam of seams) seam.lod = lods[seam.tile];
    return { s, mode, turn: turnDeg, w: W, h: H, skirtPx, darkPx, seams, edgePairs, toneRuns: runCount, tonePx, toneMean, toneMedian, toneP90, toneLine, edgePoints: toneLine || keep ? edgePoints : undefined, png: keep || seams.length || toneLine ? (png || copy.toDataURL('image/png')) : null };
}
WORLD_PROBES.push('world-seams');
WORLD['world-seams'] = async (page) => {
    const out = option('out');
    if (out) mkdirSync(out, { recursive: true });
    const tag = option('tag') || 'seams';
    const span = await page.evaluate(() => { const e = game.environment; return e.stage ? [e.stage.from, e.stage.to] : [0, e.route.length - 1]; });
    const every = Number(option('every') || SEAM_EVERY_M);
    const modes = viewsOption('modes', SEAM_MODES);
    const turns = option('turns') ? option('turns').split(',').map(Number) : SEAM_TURNS;
    const at = option('at') ? option('at').split(',').map(Number) : [];
    const stations = [];
    for (let s = span[0] + 50; s <= span[1]; s += every) stations.push(Math.round(s));
    for (const s of at) if (!stations.includes(s)) stations.push(s);
    stations.sort((a, b) => a - b);
    const tunnels = await page.evaluate(list => list.filter(s => { const p = game.environment.route.sample(s, {}); return p.flags.tunnel || p.flags.gallery; }), stations);
    await page.evaluate(`window.seamView = ${seamView.toString()}`);
    const rule = { dark: SEAM_DARK, reachPx: SEAM_REACH_PX, linePx: SEAM_LINE_PX, lineRows: SEAM_LINE_ROWS, toneStep: SEAM_TONE_STEP, toneLinePx: SEAM_TONE_LINE_PX, sideM: SEAM_SIDE_M };
    const views = [];
    let skirtPx = 0, darkPx = 0, edgePairs = 0, tonePx = 0;
    for (const s of stations) {
        if (tunnels.includes(s)) continue;
        for (const mode of modes) {
            for (const turn of turns) {
                const keep = !!out && at.includes(s);
                const view = await page.evaluate((placeSource, s, mode, turn, keep, rule) => window.seamView(placeSource, s, mode, turn, keep, rule), placeAt.toString(), s, mode, turn, keep, rule);
                skirtPx += view.skirtPx;
                darkPx += view.darkPx;
                edgePairs += view.edgePairs;
                tonePx += view.tonePx;
                let file = null;
                if (out && view.png) {
                    file = join(out, `${tag}-s${s}-${mode}${turn ? `-turn${turn}` : ''}.png`);
                    writeFileSync(file, Buffer.from(view.png.split(',')[1], 'base64'));
                }
                delete view.png;
                if (view.seams.length || view.toneLine || file) views.push({ ...view, file });
            }
        }
    }
    const seams = views.reduce((n, v) => n + v.seams.length, 0);
    const toneLines = views.filter(v => v.toneLine).length;
    return { stations: stations.length, modes, turns, skirtPx, darkPx, seams, seamViews: views.filter(v => v.seams.length).length, edgePairs, tonePx, toneLines, views };
};

function seamChecks(results, failures) {
    const seams = results['world-seams'];
    if (!seams) return;
    if (!(seams.stations > 0)) failures.push('world-seams: no view was read');
    if (!(seams.skirtPx > 0)) failures.push('world-seams: no skirt was seen in any view (the pass reads nothing)');
    if (seams.toneLines) failures.push(`world-seams: the window's edge shows as a line of a new tone in ${seams.toneLines} views (the far land's tone less the tile's, averaged over 5 points along the edge, more than ${SEAM_TONE_STEP} of 255 on the mean): ${JSON.stringify(seams.views.filter(v => v.toneLine).slice(0, 6).map(v => ({ s: v.s, mode: v.mode, turn: v.turn, runs: v.toneRuns, mean: v.toneMean })))}`);
    if (seams.seams) failures.push(`world-seams: ${seams.seams} dark lines along the drawn land's tile edges in ${seams.seamViews} views (${seams.darkPx} pixels): ${JSON.stringify(seams.views.filter(v => v.seams.length).slice(0, 6).map(v => ({ s: v.s, mode: v.mode, turn: v.turn, seams: v.seams.slice(0, 3) })))}`);
}

// world-far-seams: the land is closed out to the farthest land drawn, and no edge of a far grid shows as a line. Past
// the drawn tiles a world draws far.bin's grid (Horizon) and the levels round it out to 40 km (FarLand). Every --every
// metres (FAR_SEAM_EVERY_M) of the stage the bike is put down and the whole frame is read from the near and the far
// chase camera (--modes), looking ahead and turned to each side (--turns), at FAR_SEAM_SIZE:
//   holes  the frame is drawn again with each kind in its own colour (a tile, the far grid, each level, anything else)
//          over a black sky. Down each column of pixels, the sky under land (the nearest thing drawn over it is land)
//          is the sky seen through the land: a land surface is a height field and an upright camera sees it under
//          the sky in every column. Pixels so found, joined (4 ways) into a patch of FAR_SEAM_HOLE_PX or more (in a
//          900 px high frame), are a crack and one fails. The owner's white wedge on a far ridge (airolo-lookout,
//          km 7.6) was one: far.bin's rim standing in the air over the 250 m level
//   tone   every FAR_SEAM_TONE_EVERY_M along the box of each far grid with a level round it (where it is in view),
//          the land's tone a quarter of the outer level's cell in from the edge and as far out, (out less in)
//          averaged over 5 points along the edge, is more than SEAM_TONE_STEP on the mean of SEAM_TONE_LINE_PX
//          points or more of a view: a straight line of a new tone across the hillsides, and one such view fails
// --out <dir> saves the frame and the pass of kinds of each view that fails (and of --at s,s views).
//   node tools/terrain-check.mjs world-far-seams --world <stage> --gpu [--every 100] [--modes near,far] [--turns 0,-60,60] [--at s,s] [--out <dir> --tag T]
// tests/unit/world-far-land.test.js reads the same rules in the far grids' geometry.
const FAR_SEAM_EVERY_M = 100;
const FAR_SEAM_MODES = ['near', 'far'];
const FAR_SEAM_TURNS = [0, -60, 60];
const FAR_SEAM_SIZE = [1440, 900];
const FAR_SEAM_HOLE_PX = 6;
const FAR_SEAM_TONE_EVERY_M = 20;
async function farSeamView(placeSource, s, mode, turnDeg, place, keep, rule) {
    const DIST_CODE = 'floor(clamp(log2(max(vD, 1.0)) * 16.0, 0.0, 255.0) + 0.5) / 255.0';
    const placeAt = new Function('game', `return (${placeSource})`)(game);
    game.worldLinger = false;
    const env = game.environment, v = game.vehicle, renderer = game.graphics.renderer;
    game.setCameraView(mode);
    if (place) await placeAt(s);
    document.querySelectorAll('#finishBanner').forEach(el => el.remove());
    game.worldCamera.reset(v.yawAngle);
    twistyDev.autopilot({ speed: 0 });
    for (let i = 0; i < 60; i++) twistyDev.step(1);
    env.streamer.pump(Infinity);
    twistyDev.step(1, { render: true });
    const cam = game.camera;
    if (turnDeg) {
        cam.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), -turnDeg * Math.PI / 180);
        cam.updateMatrixWorld(true);
    }
    game.graphics.render(game.scene, cam);
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const W = size.x, H = size.y;
    const canvas = renderer.domElement, copy = document.createElement('canvas');
    copy.width = W; copy.height = H;
    const ctx = copy.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(canvas, 0, 0);
    const frame = ctx.getImageData(0, 0, W, H).data;
    const png = keep ? copy.toDataURL('image/png') : null;
    // The pass of kinds: a tile 1, the far grid 2, far level k 3 + k, anything else 9, the sky 0; the distance in blue
    const grids = [env.horizon, ...(env.farLand || [])].filter(Boolean);
    const kindOf = o => (o === env.horizon ? 2 : (env.farLand || []).includes(o) ? 3 + env.farLand.indexOf(o) : null);
    const tileMat = new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        vertexShader: 'varying float vD; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vD = length(mv.xyz); gl_Position = projectionMatrix * mv; }',
        fragmentShader: `varying float vD; void main(){ gl_FragColor = vec4(1.0 / 255.0, 0.0, ${DIST_CODE}, 1.0); }`
    });
    // (dropped with the Earth's curvature as drawn, LandShade.patch `curvature`)
    const farMats = new Map();
    const farMat = k => farMats.get(k) || farMats.set(k, new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        uniforms: { uDrop: LandShade.uniforms.uDrop },
        vertexShader: 'uniform float uDrop; varying float vD; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vec2 d = w.xz - cameraPosition.xz; w.y -= dot(d, d) * uDrop; vec4 mv = viewMatrix * w; vD = length(mv.xyz); gl_Position = projectionMatrix * mv; }',
        fragmentShader: `varying float vD; void main(){ gl_FragColor = vec4(${k}.0 / 255.0, 0.0, ${DIST_CODE}, 1.0); }`
    })).get(k);
    const other = new THREE.MeshBasicMaterial({ color: new THREE.Color(9 / 255, 0, 0), side: THREE.DoubleSide, fog: false });
    const offsets = new Map();
    const saved = new Map(), hidden = [];
    const bike = v.group;
    game.scene.children.forEach(c => { if (c !== env.group && c !== bike && c.visible && !c.isLight) { hidden.push(c); c.visible = false; } });
    const toneMapping = renderer.toneMapping, encoding = renderer.outputEncoding;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputEncoding = THREE.LinearEncoding;
    const inside = (o, group) => { for (let n = o; n; n = n.parent) if (n === group) return true; return false; };
    const quiet = [];
    game.scene.traverse(o => {
        // (points, lines and sprites take no mesh material: left out, as the sky's own things are)
        if ((o.isPoints || o.isLine || o.isSprite) && o.visible) { quiet.push(o); o.visible = false; return; }
        if (!o.isMesh) return;
        saved.set(o, o.material);
        const k = kindOf(o);
        if (k) o.material = farMat(k);
        else if (inside(o, env.tileGroup) && o.userData.world === 'terrain') o.material = tileMat;
        else {
            const own = Array.isArray(o.material) ? o.material[0] : o.material;
            if (own && own.polygonOffset) {
                const key = `${own.polygonOffsetFactor},${own.polygonOffsetUnits}`;
                if (!offsets.has(key)) offsets.set(key, Object.assign(other.clone(), { polygonOffset: true, polygonOffsetFactor: own.polygonOffsetFactor, polygonOffsetUnits: own.polygonOffsetUnits }));
                o.material = offsets.get(key);
            } else o.material = other;
        }
    });
    const background = game.scene.background, fog = game.scene.fog;
    game.scene.background = new THREE.Color(0x000000);
    game.scene.fog = null;
    const target = new THREE.WebGLRenderTarget(W, H);
    renderer.setRenderTarget(target);
    renderer.render(game.scene, cam);
    const ids = new Uint8Array(W * H * 4);
    renderer.readRenderTargetPixels(target, 0, 0, W, H, ids);
    renderer.setRenderTarget(null);
    let kindsPng = null;
    for (const [o, m] of saved) o.material = m;
    hidden.forEach(c => { c.visible = true; });
    quiet.forEach(o => { o.visible = true; });
    game.scene.background = background;
    game.scene.fog = fog;
    renderer.toneMapping = toneMapping;
    renderer.outputEncoding = encoding;
    target.dispose();
    tileMat.dispose(); other.dispose();
    farMats.forEach(m => m.dispose());
    offsets.forEach(m => m.dispose());
    // (the pass's rows run bottom up, the frame's top down)
    const kind = (x, y) => ids[((H - 1 - y) * W + x) * 4];
    const distAt = (x, y) => ids[((H - 1 - y) * W + x) * 4 + 2];
    const land = k => k >= 1 && k <= 8;
    // Holes: down each column, the sky whose nearest drawn pixel above is land
    const hole = new Uint8Array(W * H);
    for (let x = 0; x < W; x++) {
        let over = 0;
        for (let y = 0; y < H; y++) {
            const k = kind(x, y);
            if (k) { over = k; continue; }
            if (land(over)) hole[y * W + x] = 1;
        }
    }
    const minPx = Math.max(2, Math.round(rule.holePx * (H / 900) * (H / 900)));
    const patches = [];
    const stack = [];
    for (let p0 = 0; p0 < W * H; p0++) {
        if (hole[p0] !== 1) continue;
        let px = 0, x0 = W, y0 = H, x1 = 0, y1 = 0;
        const above = {}, below = {};
        let far = 0, farN = 0;
        hole[p0] = 2;
        stack.push(p0);
        while (stack.length) {
            const p = stack.pop(), x = p % W, y = (p - x) / W;
            px++;
            x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
            if (y > 0 && !hole[p - W]) { const k = kind(x, y - 1); above[k] = (above[k] || 0) + 1; if (land(k)) { far += distAt(x, y - 1); farN++; } }
            if (y + 1 < H && !hole[p + W]) { const k = kind(x, y + 1); below[k] = (below[k] || 0) + 1; }
            for (const q of [x > 0 ? p - 1 : -1, x + 1 < W ? p + 1 : -1, y > 0 ? p - W : -1, y + 1 < H ? p + W : -1]) if (q >= 0 && hole[q] === 1) { hole[q] = 2; stack.push(q); }
        }
        if (px >= minPx) patches.push({ px, box: [x0, y0, x1, y1], above, below, farM: farN ? Math.round(Math.pow(2, far / farN / 16)) : null });
    }
    patches.sort((a, b) => b.px - a.px);
    const holePx = patches.reduce((n, p) => n + p.px, 0);
    // The tone at each far grid's box: the drawn land of a grid at (x, z) on its own triangles, from its lattice
    const uDrop = LandShade.uniforms.uDrop.value;
    const lattices = grids.map((mesh, k) => {
        if (k === 0) {
            const far = env.data.far, stride = Horizon.strideFor(far);
            return { mesh, x0: far.x0, z0: far.z0, cell: far.cell * stride, nx: Math.floor((far.nx - 1) / stride) + 1, nz: Math.floor((far.nz - 1) / stride) + 1, pos: env.horizonWhole ? env.horizonWhole.positions : mesh.geometry.attributes.position.array };
        }
        const level = env.data.farLevels[k - 1];
        return { mesh, x0: level.x0, z0: level.z0, cell: level.cell, nx: level.nx, nz: level.nz, pos: mesh.geometry.attributes.position.array };
    });
    const drawnY = (g, x, z) => {
        const fx = (x - g.x0) / g.cell, fz = (z - g.z0) / g.cell;
        if (fx < 0 || fz < 0 || fx > g.nx - 1 || fz > g.nz - 1) return null;
        const i = Math.min(g.nx - 2, Math.floor(fx)), j = Math.min(g.nz - 2, Math.floor(fz)), u = fx - i, w = fz - j;
        const Y = (a, b) => g.pos[((j + b) * g.nx + i + a) * 3 + 1];
        return u + w <= 1 ? Y(0, 0) + u * (Y(1, 0) - Y(0, 0)) + w * (Y(0, 1) - Y(0, 0)) : Y(1, 1) + (1 - u) * (Y(0, 1) - Y(1, 1)) + (1 - w) * (Y(1, 0) - Y(1, 1));
    };
    const lum = (x, y) => { const at = (y * W + x) * 4; return 0.2126 * frame[at] + 0.7152 * frame[at + 1] + 0.0722 * frame[at + 2]; };
    const eye = cam.position;
    const project = (x, y, z) => { const d2 = (x - eye.x) ** 2 + (z - eye.z) ** 2; const p = new THREE.Vector3(x, y - d2 * uDrop, z); const dist = p.distanceTo(eye); p.project(cam); return p.z < 1 && p.z > -1 ? [(p.x + 1) / 2 * W, (1 - p.y) / 2 * H, dist] : null; };
    const toneAt = (x, z, g, want) => {
        const y = drawnY(g, x, z);
        if (y === null) return null;
        const q = project(x, y, z);
        if (!q || q[0] < 2 || q[1] < 2 || q[0] >= W - 2 || q[1] >= H - 2) return null;
        const u = Math.round(q[0]), w = Math.round(q[1]);
        if (Math.abs(distAt(u, w) - Math.round(Math.log2(Math.max(1, q[2])) * 16)) > 2) return null;
        let sum = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (kind(u + dx, w + dy) !== want) return null; sum += lum(u + dx, w + dy); }
        return sum / 9;
    };
    const tones = [];
    for (let k = 0; k + 1 < lattices.length; k++) {
        const g = lattices[k], outer = lattices[k + 1];
        const x0 = g.x0, z0 = g.z0, x1 = g.x0 + (g.nx - 1) * g.cell, z1 = g.z0 + (g.nz - 1) * g.cell;
        const side = outer.cell / 4;
        let sum = 0, runs = 0;
        for (const [ax, az, bx, bz, ix, iz] of [[x0, z0, x1, z0, 0, 1], [x0, z1, x1, z1, 0, -1], [x0, z0, x0, z1, 1, 0], [x1, z0, x1, z1, -1, 0]]) {
            const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / rule.toneEveryM);
            const run = [];
            const flush = () => { for (let i = 2; i + 2 < run.length; i++) { sum += Math.abs((run[i - 2] + run[i - 1] + run[i] + run[i + 1] + run[i + 2]) / 5); runs++; } run.length = 0; };
            for (let s2 = 1; s2 < steps; s2++) {
                const x = ax + (bx - ax) * s2 / steps, z = az + (bz - az) * s2 / steps;
                const a = toneAt(x + ix * side, z + iz * side, g, 2 + k), b = a === null ? null : toneAt(x - ix * side, z - iz * side, outer, 3 + k);
                if (a === null || b === null) { flush(); continue; }
                run.push(b - a);
            }
            flush();
        }
        const mean = runs ? Math.round(sum / runs * 10) / 10 : 0;
        tones.push({ grid: k, runs, mean, line: runs >= rule.toneLinePx && mean > rule.toneStep });
    }
    const toneLine = tones.some(t => t.line);
    const failed = patches.length > 0 || toneLine;
    if (keep || failed) {
        // The pass of kinds as a picture: the sky black, a tile red, the far grid green, the levels blue and yellow,
        // anything else grey, and each hole magenta
        const colours = { 0: [0, 0, 0], 1: [200, 40, 40], 2: [40, 200, 40], 3: [40, 40, 220], 4: [220, 220, 40], 9: [110, 110, 110] };
        const pic = ctx.createImageData(W, H);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const c = hole[y * W + x] ? [255, 0, 255] : colours[kind(x, y)] || [255, 255, 255];
            const at = (y * W + x) * 4;
            pic.data[at] = c[0]; pic.data[at + 1] = c[1]; pic.data[at + 2] = c[2]; pic.data[at + 3] = 255;
        }
        ctx.putImageData(pic, 0, 0);
        kindsPng = copy.toDataURL('image/png');
    }
    return { s, mode, turn: turnDeg, w: W, h: H, holes: patches.length, holePx, patches: patches.slice(0, 4), tones, toneLine, png: failed || keep ? (png || null) : null, kindsPng, frameKept: !!png };
}
WORLD_PROBES.push('world-far-seams');
WORLD['world-far-seams'] = async (page) => {
    const out = option('out');
    if (out) mkdirSync(out, { recursive: true });
    const tag = option('tag') || 'far-seams';
    await page.setViewport({ width: FAR_SEAM_SIZE[0], height: FAR_SEAM_SIZE[1], deviceScaleFactor: 1 });
    await page.evaluate(() => game.onWindowResize());
    const span = await page.evaluate(() => { const e = game.environment; return e.stage ? [e.stage.from, e.stage.to] : [0, e.route.length - 1]; });
    const every = Number(option('every') || FAR_SEAM_EVERY_M);
    const modes = viewsOption('modes', FAR_SEAM_MODES);
    const turns = option('turns') ? option('turns').split(',').map(Number) : FAR_SEAM_TURNS;
    const at = option('at') ? option('at').split(',').map(Number) : [];
    const stations = [];
    if (!(option('at') && flag('at-only'))) for (let s = span[0] + 50; s <= span[1]; s += every) stations.push(Math.round(s));
    for (const s of at) if (!stations.includes(s)) stations.push(s);
    stations.sort((a, b) => a - b);
    const tunnels = await page.evaluate(list => list.filter(s => { const p = game.environment.route.sample(s, {}); return p.flags.tunnel || p.flags.gallery; }), stations);
    await page.evaluate(`window.farSeamView = ${farSeamView.toString()}`);
    const rule = { holePx: FAR_SEAM_HOLE_PX, toneEveryM: FAR_SEAM_TONE_EVERY_M, toneStep: SEAM_TONE_STEP, toneLinePx: SEAM_TONE_LINE_PX };
    const views = [];
    let read = 0, holePx = 0, toneRuns = 0;
    for (const s of stations) {
        if (tunnels.includes(s)) continue;
        let place = true;
        for (const mode of modes) {
            for (const turn of turns) {
                const keep = !!out && at.includes(s);
                const view = await page.evaluate((placeSource, s, mode, turn, place, keep, rule) => window.farSeamView(placeSource, s, mode, turn, place, keep, rule), placeAt.toString(), s, mode, turn, place, keep, rule);
                place = false;
                read++;
                holePx += view.holePx;
                toneRuns += view.tones.reduce((n, t) => n + t.runs, 0);
                const files = [];
                const name = `${tag}-s${s}-${mode}${turn ? `-turn${turn}` : ''}`;
                if (out && view.png) { const file = join(out, `${name}.png`); writeFileSync(file, Buffer.from(view.png.split(',')[1], 'base64')); files.push(file); }
                if (out && view.kindsPng) { const file = join(out, `${name}-kinds.png`); writeFileSync(file, Buffer.from(view.kindsPng.split(',')[1], 'base64')); files.push(file); }
                delete view.png; delete view.kindsPng;
                if (view.holes || view.toneLine || files.length) views.push({ ...view, files });
            }
        }
    }
    const holeViews = views.filter(v => v.holes).length, toneLines = views.filter(v => v.toneLine).length;
    return { stations: stations.length, read, modes, turns, holes: views.reduce((n, v) => n + v.holes, 0), holeViews, holePx, toneRuns, toneLines, views };
};

function farSeamChecks(results, failures) {
    const far = results['world-far-seams'];
    if (!far) return;
    if (!(far.read > 0)) failures.push('world-far-seams: no view was read');
    if (!(far.toneRuns > 0) && !option('at')) failures.push('world-far-seams: no far grid\'s edge was seen in any view (the tone pass reads nothing)');
    if (far.holes) failures.push(`world-far-seams: the sky shows through the land in ${far.holes} patches (${far.holePx} pixels) in ${far.holeViews} views: ${JSON.stringify(far.views.filter(v => v.holes).slice(0, 6).map(v => ({ s: v.s, mode: v.mode, turn: v.turn, patches: v.patches.slice(0, 2) })))}`);
    if (far.toneLines) failures.push(`world-far-seams: a far grid's edge shows as a line of a new tone in ${far.toneLines} views (the outer level's tone less the inner's, averaged over 5 points along the edge, more than ${SEAM_TONE_STEP} of 255 on the mean): ${JSON.stringify(far.views.filter(v => v.toneLine).slice(0, 6).map(v => ({ s: v.s, mode: v.mode, turn: v.turn, tones: v.tones })))}`);
}

// hill-overlay: the opening shot (HillRide.SHOTS.opening, from HillLane.RULE.opening) beside the reference frame it was
// fitted to: a sheet of the frame, the game at the frame's own shape, and the two at half each, with the frame's key
// points (the boy's head and shoulders, the lane's far end, the chimney tops, the post, the churn, the tower, the tree)
// marked where the frame has them (yellow) and where the game puts them (cyan), and the mean distance between them in
// pixels of the frame's height. --still <file> is the frame (private, never in the repo).
//   node tools/terrain-check.mjs hill-overlay --gpu --still <file> [--out <file.png>]
const HILL_KEYS = [
    ['boy head', [0.683, 0.35]], ['boy shoulders', [0.70, 0.47]], ['far lane', [0.43, 0.665]],
    ['chimney 56.6', [0.195, 0.02]], ['chimney 66.5', [0.388, 0.11]], ['chimney 75.75', [0.513, 0.11]], ['chimney 96.45', [0.698, 0.23]],
    ['post top', [0.135, 0.41]], ['churn top', [0.105, 0.79]], ['house corner', [0.92, 0.13]], ['tree', [0.6, 0.2]]
];
async function hillOverlay(still, keys) {
    const ride = window.game.hill, game = window.game, lane = ride.lane, o = lane.rule.opening;
    ride.running = false;
    cancelAnimationFrame(ride.frameId);
    ride.bike.reset(lane.rule.startM, o.startAcross);
    ride.hold = { phase: 'hold', t: 0 };
    ride.forcedShot = null;
    const source = await new Promise(resolve => { const im = new Image(); im.onload = () => resolve(im); im.src = still; });
    const H = 771, W = Math.round(H * source.width / source.height);
    const renderer = game.renderer, keep = renderer.getSize(new THREE.Vector2()), ratio = renderer.getPixelRatio();
    renderer.setPixelRatio(1);
    renderer.setSize(W, H, false);
    if (game.graphics.resizeTargets) game.graphics.resizeTargets();
    game.camera.aspect = W / H;
    game.camera.updateProjectionMatrix();
    ride.draw(1 / 60);
    ride.draw(1 / 60);
    const shot = await new Promise(resolve => { const im = new Image(); im.onload = () => resolve(im); im.src = renderer.domElement.toDataURL('image/png'); });
    // The game's key points: where its own pieces stand
    const cam = game.camera, v = new THREE.Vector3();
    const project = p => { v.set(p.x, p.y, p.z).project(cam); return [(v.x + 1) / 2, (1 - v.y) / 2]; };
    const at = (s, across, up) => lane.at(s, across, up, {});
    const chimney = s => {
        for (const c of lane.cottages) for (const ch of c.chimneys || []) if (Math.abs(c.mid + ch.along - s) < 0.01) {
            return { x: c.x + c.alongX * ch.along, y: ch.top + 0.45, z: c.z + c.alongZ * ch.along };
        }
        return null;
    };
    const front = lane.rule.halfWidthM + lane.rule.flagsM;
    const places = {
        'boy head': at(lane.rule.startM, o.startAcross, 1.74), 'boy shoulders': at(lane.rule.startM - 0.15, o.startAcross, 1.42), 'far lane': at(56, 0, 0),
        'chimney 56.6': chimney(56.6), 'chimney 66.5': chimney(66.5), 'chimney 75.75': chimney(75.75), 'chimney 96.45': chimney(96.45),
        'post top': at(o.post[0], o.post[1], o.post[2]), 'churn top': at(o.churn[0], o.churn[1], 0.62), 'house corner': (() => { const R = lane.rule; const q = at(o.right[0], -(R.halfWidthM + R.flagsM + o.right[6]), 0); q.y = lane.cottages.find(c => c.opening && c.side < 0).eaves; return q; })(),
        tree: at(o.tree[0], o.tree[1], o.tree[2])
    };
    const canvas = document.createElement('canvas');
    canvas.width = W * 3 + 16;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(source, 0, 0, W, H);
    ctx.drawImage(shot, W + 8, 0, W, H);
    ctx.globalAlpha = 1;
    ctx.drawImage(source, 2 * W + 16, 0, W, H);
    ctx.globalAlpha = 0.5;
    ctx.drawImage(shot, 2 * W + 16, 0, W, H);
    ctx.globalAlpha = 1;
    // The mean luminance of the right-hand house in shade (the box `shade`, shares of the frame), in the still and the game
    const shadeBox = [0.84, 0.18, 0.99, 0.62];
    const luma = (x0) => {
        const d = ctx.getImageData(x0 + shadeBox[0] * W, shadeBox[1] * H, (shadeBox[2] - shadeBox[0]) * W, (shadeBox[3] - shadeBox[1]) * H).data;
        let sum = 0;
        for (let i = 0; i < d.length; i += 4) sum += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
        return +(sum / (d.length / 4)).toFixed(3);
    };
    const shade = { still: luma(0), game: luma(W + 8) };
    const errors = [];
    for (const [name, want] of keys) {
        const p = places[name];
        if (!p) continue;
        const got = project(p);
        errors.push({ name, want, got: got.map(x => +x.toFixed(3)), px: +(Math.hypot((got[0] - want[0]) * W, (got[1] - want[1]) * H) * 857 / H).toFixed(1) });
        for (const x0 of [0, W + 8, 2 * W + 16]) {
            ctx.strokeStyle = 'rgba(255, 220, 0, 0.95)';
            ctx.beginPath(); ctx.arc(x0 + want[0] * W, want[1] * H, 7, 0, Math.PI * 2); ctx.stroke();
            ctx.strokeStyle = 'rgba(0, 230, 255, 0.95)';
            ctx.beginPath(); ctx.arc(x0 + got[0] * W, got[1] * H, 4, 0, Math.PI * 2); ctx.stroke();
        }
    }
    renderer.setPixelRatio(ratio);
    renderer.setSize(keep.x, keep.y, false);
    if (game.graphics.resizeTargets) game.graphics.resizeTargets();
    game.camera.aspect = keep.x / keep.y;
    game.camera.updateProjectionMatrix();
    const mean = errors.reduce((n, e) => n + e.px, 0) / errors.length;
    return { png: canvas.toDataURL('image/png'), errors, shade, meanPx: +mean.toFixed(1), info: { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles } };
}
WORLD_PROBES.push('hill-overlay');
WORLD['hill-overlay'] = async (page) => {
    const still = option('still');
    if (!still) return { error: 'name the frame with --still <file>' };
    const data = `data:image/png;base64,${readFileSync(still).toString('base64')}`;
    const result = await page.evaluate(hillOverlay, data, HILL_KEYS);
    const file = option('out') || join(HILL_COMPARE_OUT, 'opening-overlay.png');
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, Buffer.from(result.png.split(',')[1], 'base64'));
    return { file, meanPx: result.meanPx, shade: result.shade, errors: result.errors, info: result.info };
};

// hill-shots: the hill ride (js/hill/ride.js, opened by RideMode.HILL_KEY) in GPU pictures, the bicycle placed and
// ridden by the tests' autopilot: the start hold from the opening shot, the legs out on the main straight into the sun,
// the fast part, the sharp right, the camera held at the last curve with the bicycle at the bend and gone, both sides
// of the lane, a window's glint, the cobbles in the low sun, a wheelie, a thing knocked, the last picture and the end
// card. Each with the bicycle's state and the picture's mean luminance; the band is checked to play. Saved to --out
// (default ~/Library/Caches/twisty-world/hill-shots/).
//   node tools/terrain-check.mjs hill-shots --gpu [--out <dir>]
const HILL_SHOTS_OUT = join(process.env.HOME || '.', 'Library/Caches/twisty-world/hill-shots');
async function hillShots() {
    const ride = window.game.hill;
    ride.running = false;
    cancelAnimationFrame(ride.frameId);
    const game = window.game, lane = ride.lane, bike = ride.bike;
    const shots = [];
    const facts = [];
    const dt = 1 / 120;
    // The autopilot of the tests: steer for a point ahead on the centre, brake to `most`
    const pilot = (most = Infinity) => {
        const v = bike.speed, ahead = lane.sample(bike.s + 4 + v * 0.6), at = bike.vehicle.position;
        let err = Math.atan2(ahead.x - at.x, ahead.z - at.z) - bike.yaw;
        err = Math.atan2(Math.sin(err), Math.cos(err));
        const turn = 2.2 * err * Math.max(1, v);
        const lean = -Math.atan(Math.max(0, v) * Math.max(-3, Math.min(3, turn / Math.max(1, v))) / 9.81);
        return { pedal: 0, brake: v > most ? 1 : 0, steer: Math.max(-1, Math.min(1, (bike.lean - lean) * 5)) };
    };
    const run = (seconds, input = () => pilot()) => {
        for (let t = 0; t < seconds; t += dt) {
            bike.step(dt, input(t));
            ride.props.knock(bike, null);
            ride.props.step(dt);
        }
    };
    const shoot = (tag, view = 0, forced = null) => {
        ride.view = view;
        ride.forcedShot = forced;
        ride.placeCamera(1);
        ride.draw(1 / 60);
        ride.draw(1 / 60);
        shots.push({ tag, png: game.renderer.domElement.toDataURL('image/png') });
        facts.push({ tag, s: Math.round(bike.s * 10) / 10, speed: Math.round(bike.speed * 100) / 100, legs: Math.round(bike.legs * 100) / 100, lean: Math.round(bike.lean * 100) / 100, wheelie: Math.round(bike.wheelie * 100) / 100, footDown: bike.footDown, crashed: bike.crashed });
        ride.forcedShot = null;
    };
    const place = (s, speed, across = 0) => {
        bike.reset(s, across);
        bike.vehicle.speed = speed;
        bike.vehicle.footDown = speed === 0;
        ride.ending = null;
        ride.hold = null;
        ride.climb = null;
    };
    const L = lane.rule;
    // The start hold: the opening shot, a foot down, the sun to the right (the day's climb is passed over: hill-look's
    // scripts picture it)
    ride.restart();
    if (ride.climb) ride.endClimb();
    run(0.6, () => ({ pedal: 0, brake: 1, steer: 0 }));
    ride.hold = { phase: 'hold', t: 0 };
    shoot('hold-opening', 0, 'opening');
    ride.hold = null;
    shoot('hold-behind', 0);
    // Down the main straight into the sun, legs out
    place(130, 8);
    run(3);
    shoot('legs-out-behind', 0);
    shoot('legs-out-front', 2);
    place(200, 11);
    run(1.5);
    shoot('straight-into-sun', 0);
    // The fast part, then the sharp right
    place(360, 13);
    run(2);
    shoot('fast-behind', 0);
    place(412, 8);
    run(1.4, () => pilot(8));
    shoot('sharp-right', 0);
    shoot('sharp-right-front', 2);
    // The camera held at the last curve, the bicycle rolling round it and out of sight
    place(L.end.stopS + 2, 9);
    ride.ending = { phase: 'watching', t: 10, hidden: 0, from: game.camera.position.clone(), lookFrom: ride.look.clone() };
    run(1.5, () => pilot(9));
    shoot('end-held-bend', 0);
    run(3, () => pilot(9));
    shoot('end-held-gone', 0);
    ride.ending = null;
    // Both sides of the lane, from its middle
    place(150, 0);
    shoot('side-left', 0, { position: [150, -1.5, 1.7], target: [158, 6, 3], fov: 60 });
    shoot('side-right', 0, { position: [150, 1.5, 1.7], target: [158, -6, 3], fov: 60 });
    // A window's golden glint near the start, and the cobbles in the low sun, into it and with it behind, close and far
    place(22, 0);
    shoot('window-glint', 0, { position: [14, -1.2, 2.2], target: [19, 4, 2.4], fov: 40 });
    place(175, 0);
    shoot('cobbles-into-sun-close', 0, { position: [160, 0.5, 1.3], target: [168, 0, -0.6], fov: 50 });
    shoot('cobbles-into-sun-far', 0, { position: [125, 0.5, 2.5], target: [200, 0, -6], fov: 50 });
    shoot('cobbles-sun-behind-close', 0, { position: [190, 0.5, 1.3], target: [182, 0, 0.1], fov: 50 });
    // A wheelie at walking pace on the hill
    place(60, 1.5);
    run(0.7, t => ({ pedal: 1, brake: 0, steer: 0, wheelie: t < 0.1 ? 1 : 0 }));
    shoot('wheelie', 2);
    // A thing knocked: ride into the first one at the lane's edge on a straight
    // (a milk bottle when one stands there, to see it smash)
    const near = i => Math.abs(i.across) < L.halfWidthM && i.s > 130 && i.s < 220;
    const target = ride.props.items.find(i => near(i) && i.kind === 'bottle') || ride.props.items.find(near);
    if (target) {
        place(target.s - 5, 5, target.across);
        let hit = 0;
        for (let t = 0; t < 3 && !hit; t += dt) {
            bike.step(dt, { pedal: 0, brake: 0, steer: 0 });
            hit = ride.props.knock(bike, null);
            ride.props.step(dt);
        }
        run(0.15, () => ({ pedal: 0, brake: 0, steer: 0 }));
        shoot('knock', 2);
    }
    ride.props.reset();
    // The last picture
    ride.makeLoaf();
    ride.showLoaf(true);
    shoot('loaf', 0);
    ride.showLoaf(false);
    // Each picture's mean luminance, 0 to 1 (how dark the lane reads)
    for (const shot of shots) {
        const image = new Image();
        image.src = shot.png;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
        const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let sum = 0;
        for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        shot.luma = Math.round(sum / (d.length / 4) / 255 * 1000) / 1000;
    }
    // The band: woken as a key press wakes the game's sound, played for a moment, then put back as it was
    const sound = game.soundManager;
    const muted = sound.getSetting('muted');
    sound.setSetting('muted', false);
    sound.wake();
    ride.music.play();
    await new Promise(resolve => setTimeout(resolve, 600));
    const music = { context: sound.audioContext ? sound.audioContext.state : null, playing: ride.music.playing };
    ride.music.stop();
    sound.setSetting('muted', muted);
    return { shots, facts, music };
}
WORLD_PROBES.push('hill-shots');
WORLD['hill-shots'] = async (page) => {
    const out = option('out') || HILL_SHOTS_OUT;
    mkdirSync(out, { recursive: true });
    const { shots, facts, music } = await page.evaluate(hillShots);
    const luma = Object.fromEntries(shots.map(shot => [shot.tag, shot.luma]));
    // The end card over the last picture: the page itself, as the rider sees it
    await page.evaluate(() => {
        const ride = window.game.hill;
        ride.showLoaf(true);
        ride.fade.style.opacity = '0';
        ride.endNote.style.display = '';
        ride.draw(1 / 60);
    });
    const card = join(out, 'hill-end-card.png');
    writeFileSync(card, await page.screenshot());
    const files = shots.map(shot => {
        const file = join(out, `hill-${shot.tag}.png`);
        writeFileSync(file, Buffer.from(shot.png.split(',')[1], 'base64'));
        return file;
    });
    files.push(card);
    return { facts, music, luma, files };
};

async function openHill(browser, port) {
    // The address key is written in js/ridemode.js alone
    const key = new Function(`${readFileSync(join(root, 'js/ridemode.js'), 'utf8')}\nreturn RideMode.HILL_KEY;`)();
    const page = await openPage(browser, port, `/?${key}`);
    await page.waitForFunction('window.game && window.game.hill && window.game.hill.running', { timeout: 120000 });
    return page;
}

main();
