#!/usr/bin/env node
// Browser proof harness for the terrain work. Serves the repo on an ephemeral
// port, drives the real page in Chrome and prints one JSON document.
//
//   node tools/terrain-check.mjs <probe>[,<probe>] [--legs id,id] [--chrome <path>] [--gpu] [--no-assets]
//   node tools/terrain-check.mjs record-frozen          (phase 0a only: writes tests/golden/browser-baseline.json)
//   node tools/terrain-check.mjs record-jest            (phase 0a only: writes tests/golden/terrain-baseline.json)
//   node tools/terrain-check.mjs <probe> --add parts,surface   (writes tests/golden/parts-baseline.json)
//   node tools/terrain-check.mjs <probe> --update-baseline --legs id [--part ground,decals]
//   node tools/terrain-check.mjs baseline-diff [--against <sha>]
//
// Probes: legs snapshot raycast surface parts frames traj gates look shortcuts runoff fog pages budget frametime scene submit mutate atmostate draws atmo
// World probes (the streamed world, `?world=<id>`; --world <id> picks it, default tremola; --worldData <path> picks the data folder):
//   world-near-ground world-cover-off world-toggle-ride world-ground-flip world-ground-scan world-ground-off world-window world-haze world-budget world-ground world-junction world-wrongway world-credit world-net world-finish world-restart world-cut world-camera world-frustum world-camera-smooth world-camera-frames world-camera-walls world-hud world-shots world-hairpin-shots world-buildings world-frametime world-ride-shots world-hairpin-assist world-floating world-watertight world-trees world-stones world-quality world-fall-shots world-group-shots world-place-shots
//   node tools/terrain-check.mjs world-camera-walls --world tremola --gpu [--modes 2,3] [--lane M] [--swing K] [--far K] [--apex s,s] [--off] [--shots s,s,s --out <dir>]   (nothing drawn between the chase camera and the bike in any hairpin)
//   node tools/terrain-check.mjs world-fall-shots --world tremola --gpu --out <dir> [--at s] [--speeds 6,14,28] [--moments 0.15,0.5,1.2]   (the rider's fall of each kind, beside him)
//   node tools/terrain-check.mjs world-trees --world tremola --gpu [--views 300,1800] [--out <dir> --tag T]   (tree colour against the photos and the land round it)
//   node tools/terrain-check.mjs world-floating --world tremola --gpu [--every 500] [--views 3600,7990] [--out <dir> --tag T]   (floating roads and land over the road, drawn)
//   node tools/terrain-check.mjs world-watertight --world tremola --gpu [--every 50] [--from S --to S] [--modes 1,2,3] [--at s,s]   (no gap in the drawn land, no edge works foot over it)
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
// submit: finishes each leg and types a name into the form, against a server answered locally. --reply old|new picks the startRun reply
//   (new adds protocol and gates for a board in Course.boardTable()); --mutate ready-always makes the client's handshake pass whatever the reply says
// (`shortcuts` runs its own doubled-back control)
// --no-assets keeps every leg's procedural dressing, trees and bushes, the procedural bike and the procedural cars (js/sceneassets.js, js/treemodels.js, js/bikemodels.js and js/carmodels.js swap nothing), for a before/after measure.
// Chrome: --chrome <path>, else TWISTY_CHROME, else PUPPETEER_EXECUTABLE_PATH, else puppeteer's own.
// Exit: 0 ok, 1 failures, 2 no Chrome or no window.game, 3 --gpu without a hardware renderer.
//
// Baselines
//   tests/golden/browser-baseline.json   frozen at phase 0a: its sha256 must not change
//   tests/golden/terrain-baseline.json   frozen at phase 0a: the jest goldens
//   tests/golden/parts-baseline.json     mutable per-leg `parts` and `surface`, guarded as below
// Never let a page reach production: cloudfunctions.net, firebasedatabase.app and firebaseio.com are aborted.
// The `submit` probe is the one exception in kind, not in effect: it answers the callable requests itself, so none leaves the machine.
import { execFileSync, spawnSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { D6_CLASSES, buildEnvironment, captureLeg, loadGame } from '../tests/helpers/load-game.js';
import { fairnessWindow, roadworksWindow } from '../tests/helpers/world-fairness.js';
import { wallWindow, wallRuns, WALL_LIMITS } from '../tests/helpers/world-walls.js';
import { junctionWindow, junctionReport, JUNCTION_LIMITS } from '../tests/helpers/world-junctions.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const FROZEN = join(root, 'tests/golden/browser-baseline.json');
const JEST_GOLDEN = join(root, 'tests/golden/terrain-baseline.json');
const PARTS = join(root, 'tests/golden/parts-baseline.json');
const AMENDMENTS = join(root, 'tests/golden/amendments.json');
const LEG_IDS = ['mountain-dawn', 'valley-run', 'coastal-descent', 'foggy-gorge', 'high-pass', 'storm-valley', 'night-ride', 'winter-pass'];
const FROZEN_SECTIONS = ['snapshot', 'raycast', 'frames', 'traj', 'gates', 'look', 'shortcuts', 'budget'];
const BLOCKED_HOSTS = ['cloudfunctions.net', 'firebasedatabase.app', 'firebaseio.com'];
// The plan's bound on environment.boulders[] entries the bike can hit, per leg
const SOLID_BOULDER_BUDGET = 1500;
// Per leg, counted as the budget probe counts them, with any modelled scenery (js/sceneassets.js) in place
const LEG_BUDGET = { meshes: 800, triangles: 450000, instances: 1400 };
// The whole-scene digest of each leg that is still on the shared course, in the real
// page with modelled assets (the `scene` probe). A converted leg's row is removed in
// its own commit.
const SCENE_PINS = {
    'valley-run': ['f542b41ad8fe87d2', 836, 639, 10, true],
    'coastal-descent': ['5ff10ec2ea619c7d', 747, 125, 8, true],
    'foggy-gorge': ['230562653b2ff748', 679, 167, 11, true],
    'high-pass': ['87c5427b85e7af14', 1061, 723, 9, false],
    'storm-valley': ['b748d8c76572fb44', 704, 1173, 13, true],
    'night-ride': ['b40ac41dad1d0656', 700, 833, 11, true],
    'winter-pass': ['ee6c0030fa0c2523', 692, 1249, 10, true]
};
const LATERALS = [-80, -40, -20, -12, 0, 12, 20, 40, 80];
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary' };

// ---------------------------------------------------------------- CLI
const argv = process.argv.slice(2);
const flag = name => argv.includes(`--${name}`);
const option = name => {
    const at = argv.indexOf(`--${name}`);
    return at >= 0 ? argv[at + 1] : undefined;
};
const command = argv[0] && !argv[0].startsWith('--') ? argv[0] : undefined;
const probes = command ? command.split(',') : [];
const legIds = option('legs') ? option('legs').split(',') : LEG_IDS;
// The run-off probe pins the valley's timings and lateral 14 (mountain-dawn), which is a wall or a drop on other legs
// The shortcuts control builds its own road and reads no leg, so it runs once, filed under the first leg asked for
// The long-leg probes need a converted leg: leg 1 (the fixture under --fixture) unless --legs names others
const LONG_PROBES = ['course', 'window', 'stream', 'preview', 'finish', 'hudgates'];
const probeLegIds = name => (LONG_PROBES.includes(name) && !option('legs') ? ['mountain-dawn'] : name === 'runoff' && !option('legs') ? ['mountain-dawn'] : name === 'shortcutsControl' ? legIds.slice(0, 1) : (name === 'atmo' || name === 'atmoControl') && !option('legs') ? ['mountain-dawn'] : legIds);
const jobs = Number(option('jobs') || 3);

const fail = (code, message) => {
    process.stderr.write(`${message}\n`);
    process.exit(code);
};
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const sha256File = path => execFileSync('shasum', ['-a', '256', path], { encoding: 'utf8' }).split(' ')[0];
const readJson = path => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null);
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 1)}\n`);

// What the capture ran against, so a digest also says it came from untouched source
function provenance() {
    return {
        head: git('rev-parse', 'HEAD'),
        jsTree: git('rev-parse', 'HEAD:js'),
        gameSourceClean: git('status', '--porcelain', '--', 'js', '*.html') === ''
    };
}

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

const state = { blocked: [], notFound: [], pageErrors: [], lastError: '', injected: false };

// The `submit` probe answers the leaderboard callables itself. Never a request.continue():
// nothing it handles reaches a network.
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
function fulfilCallable(calls, request) {
    if (request.method() === 'OPTIONS') return request.respond({ status: 204, headers: CORS });
    const name = new URL(request.url()).pathname.split('/').pop();
    (calls[name] ||= []).push(JSON.parse(request.postData() || '{}').data || {});
    const result = name === 'startRun' ? calls.reply : name === 'submitRun' ? { rank: 1, flagged: false, entryId: 'probe' } : { entries: [] };
    return request.respond({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ result }) });
}

// `prepare(page)`, when given, runs before the page loads (a probe's evaluateOnNewDocument)
async function openPage(browser, port, url = '/', seed = 1, prepare = null) {
    const page = await browser.newPage();
    await page.setViewport({ width: 960, height: 540, deviceScaleFactor: 1 });
    await page.setRequestInterception(true);
    page.on('request', request => {
        const target = new URL(request.url());
        if (state.requests) state.requests.push(request.url());
        if (page.callables && target.hostname.endsWith('cloudfunctions.net')) {
            fulfilCallable(page.callables, request);
        } else if (BLOCKED_HOSTS.some(host => target.hostname.endsWith(host))) {
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
    // One seeded generator, reset before each leg starts; `seed` is where a page starts it
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

async function openGame(browser, port) {
    // Under load Chrome sometimes cannot create the WebGL context and the constructor throws; retry
    for (let attempt = 0; attempt < 4; attempt++) {
        const page = await openPage(browser, port);
        try {
            await page.waitForFunction('window.game && window.game.tourSystem', { timeout: 60000 });
        } catch {
            await page.close();
            continue;
        }
        // The live loop lowers the pixel ratio when the machine is busy, which would make a
        // frame depend on how many pages ran beside it
        await page.evaluate(() => { window.game.adaptResolution = () => {}; });
        await page.addScriptTag({ path: join(root, 'tools/autopilot.js') });
        // The modelled scenery's loader, until index.html loads it itself
        if (flag('no-assets')) {
            await page.evaluate(() => {
                if (typeof SceneAssets !== 'undefined') SceneAssets.dress = () => null;
                if (typeof BikeModels !== 'undefined') BikeModels.dress = () => false;
                if (typeof CarModels !== 'undefined') CarModels.dress = () => false;
            });
        } else if (await page.evaluate(() => typeof SceneAssets === 'undefined')) {
            await page.addScriptTag({ url: '/js/sceneassets.js' });
            state.injected = true;
        }
        // The 150-segment fixture course stands in for a converted leg until one ships (installed on leg 1)
        if (flag('fixture')) {
            const source = readFileSync(join(root, 'tests/fixtures/course-fixture.js'), 'utf8').replace(/^export /gm, '');
            await page.evaluate(code => {
                new Function(`${code}\nCourse.LEGS[FIXTURE_LEG] = fixtureCourse(Terrain); Terrain.adopt(Course.LEGS);\nconst leg = game.tourSystem.legs.find(row => row.id === FIXTURE_LEG); leg.startSegment = 0; leg.endSegment = Course.LEGS[FIXTURE_LEG].segments - 1;`)();
            }, source);
        }
        await page.evaluate(installProbe, D6_CLASSES.map(r => r.source), LATERALS);
        return page;
    }
    return fail(2, `window.game was not created after 4 attempts: ${state.pageErrors.join(' | ')} ${state.lastError}`);
}

// ---------------------------------------------------------------- in-page library
// Serialised into the page, so it may not close over anything in this module.
function installProbe(d6Sources, latSet) {
    const P = (window.__probe = {});
    const sha = async bytes => {
        const out = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
        return Array.from(out, b => b.toString(16).padStart(2, '0')).join('');
    };
    const cat = parts => {
        const total = parts.reduce((n, p) => n + p.byteLength, 0);
        const all = new Uint8Array(total);
        let at = 0;
        parts.forEach(p => { all.set(new Uint8Array(p.buffer, p.byteOffset, p.byteLength), at); at += p.byteLength; });
        return all;
    };
    const round = (v, k = 1000) => Math.round(v * k) / k;
    const fnv = values => {
        let h = 0x811c9dc5;
        for (const v of values) {
            h ^= Math.round(v * 1000) | 0;
            h = Math.imul(h, 0x01000193) >>> 0;
        }
        return h.toString(16);
    };
    const hasFlag = (object, key) => {
        for (let n = object; n; n = n.parent) if (n.userData && n.userData[key]) return true;
        return false;
    };
    const d6 = (d6Sources || []).map(source => new RegExp(source));

    P.build = legIndex => {
        const leg = game.tourSystem.legs[legIndex];
        const scene = new THREE.Scene();
        const marks = {};
        const original = Environment.prototype.createRoadWalls;
        Environment.prototype.createRoadWalls = function (...args) {
            marks.beforeWalls = this.randState;
            const result = original.apply(this, args);
            marks.afterWalls = this.randState;
            return result;
        };
        const quiet = console.log;
        console.log = () => {};
        const t0 = performance.now();
        let env;
        try {
            env = new Environment(scene, leg.startSegment, leg.endSegment, legIndex);
        } finally {
            Environment.prototype.createRoadWalls = original;
            console.log = quiet;
        }
        const buildMs = performance.now() - t0;
        marks.end = env.randState;
        scene.updateMatrixWorld(true);
        return { env, scene, marks, buildMs };
    };

    P.ribbons = env => {
        const rows = Math.min(743, env.endSegment + 20) - env.startSegment + 1;
        const found = [];
        env.scene.traverse(o => {
            const pos = o.isMesh && o.geometry.attributes.position;
            if (pos && o.geometry.attributes.color && pos.count === rows * 144) found.push(o);
        });
        return found;
    };
    P.decals = env => P.ribbons(env).map(ribbon => {
        const list = [];
        ribbon.parent.traverse(o => { if (o.isMesh && o !== ribbon && hasFlag(o, 'allowFloating')) list.push(o); });
        return list;
    });

    P.fingerprints = async (env, scene) => {
        const decals = new Set(P.decals(env).flat());
        const d6Objects = new Set();
        env.groundedObjects.filter(g => d6.some(r => r.test(g.label))).forEach(g => g.object.traverse(c => d6Objects.add(c)));
        const lines = { full: [], noDecal: [], stable: [] };
        const meshes = [];
        scene.traverse(o => { if (o.isMesh) meshes.push(o); });
        for (const mesh of meshes) {
            const parts = [new TextEncoder().encode(`${mesh.type}|`), new Float64Array(mesh.matrixWorld.elements), mesh.geometry.attributes.position.array];
            if (mesh.isInstancedMesh) parts.push(mesh.instanceMatrix.array);
            const line = await sha(cat(parts));
            lines.full.push(line);
            if (decals.has(mesh)) continue;
            lines.noDecal.push(line);
            if (hasFlag(mesh, 'allowFloating') || d6Objects.has(mesh)) continue;
            lines.stable.push(line);
        }
        const out = {};
        for (const [mode, list] of Object.entries(lines)) {
            out[mode] = { hash: (await sha(new TextEncoder().encode(list.join('\n')))).slice(0, 16), meshes: list.length };
        }
        return out;
    };

    P.groundGrid = env => {
        const rows = [];
        for (let s = env.startSegment; s <= env.endSegment; s += 10) {
            const p = env.roadPath[s];
            const rx = Math.cos(p.heading), rz = -Math.sin(p.heading);
            rows.push([s, ...(latSet || []).map(l => round(env.groundYAt(p.x + rx * l, p.z + rz * l), 1e6))]);
        }
        return rows;
    };

    // `dressed`: wait for the leg's modelled scenery (js/sceneassets.js) to replace its procedural dressing first
    P.snapshot = async (legIndex, dressed = false) => {
        const { env, scene, marks, buildMs } = P.build(legIndex);
        const assets = dressed && env.dressing ? await env.dressing : null;
        if (assets) scene.updateMatrixWorld(true);
        const hashes = [];
        const instances = [];
        let triangles = 0;
        let instanceCount = 0;
        const m = new THREE.Matrix4();
        scene.traverse(o => {
            if (!o.isMesh) return;
            const pos = o.geometry.attributes.position;
            const index = o.geometry.index;
            triangles += (index ? index.count : pos.count) / 3 * (o.isInstancedMesh ? o.count : 1);
            const v = new THREE.Vector3();
            const world = [];
            for (let i = 0; i < pos.count; i++) {
                v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
                world.push(v.x, v.y, v.z);
            }
            hashes.push(fnv(world));
            if (o.isInstancedMesh) {
                const values = [];
                for (let i = 0; i < o.count; i++) {
                    o.getMatrixAt(i, m);
                    m.premultiply(o.matrixWorld);
                    values.push(...m.elements);
                }
                instances.push(fnv(values));
                instanceCount += o.count;
            }
        });
        return {
            rand: marks,
            hashes: hashes.sort(),
            instances: instances.sort(),
            boulders: env.boulders.map(b => [b.x ?? b.position?.x, b.y ?? b.position?.y, b.z ?? b.position?.z, b.radius, !!b.solid].map(n => (typeof n === 'number' ? round(n) : n))),
            groundGrid: P.groundGrid(env),
            fingerprints: await P.fingerprints(env, scene),
            decalCounts: P.decals(env).map(list => list.length),
            counts: { meshes: hashes.length, triangles: Math.round(triangles), instances: instanceCount, grounded: env.groundedObjects.length, d6: env.groundedObjects.filter(g => d6.some(r => r.test(g.label))).length },
            ...(assets && { assets: { bytes: assets.bytes, ms: assets.ms, rocks: { rocks: assets.rocks.rocks, meshes: assets.rocks.meshes, error: assets.rocks.error }, portals: assets.portals, rockFace: assets.rockFace, village: assets.village, ...(assets.bridge && { bridge: assets.bridge }), ...(assets.files && { files: assets.files }), ...(assets.trees && { trees: assets.trees }), floating: assets.violations.filter(v => v.kind === 'floating').length, buried: assets.violations.filter(v => v.kind === 'buried').length } }),
            buildMs: round(buildMs, 1)
        };
    };

    // Straight-down rays at every 10th segment, against the meshes `pick` keeps
    P.rays = (legIndex, pick, first = 0) => {
        const { env, scene } = P.build(legIndex);
        const meshes = [];
        scene.traverse(o => { if (o.isMesh && pick(o, env)) { o.material.side = THREE.DoubleSide; meshes.push(o); } });
        const half = env.roadWidth / 2;
        const laterals = [...new Set([...(latSet || []), -(half + 1), half + 1])].sort((a, b) => a - b);
        const caster = new THREE.Raycaster();
        const out = [];
        for (let s = env.startSegment + first; s <= env.endSegment; s += 10) {
            const p = env.roadPath[s];
            const rx = Math.cos(p.heading), rz = -Math.sin(p.heading);
            for (const l of laterals) {
                const x = p.x + rx * l, z = p.z + rz * l;
                caster.set(new THREE.Vector3(x, 500, z), new THREE.Vector3(0, -1, 0));
                const hit = caster.intersectObjects(meshes, false)[0];
                const ground = env.groundYAt(x, z);
                const partOf = hit ? (() => { for (let n = hit.object; n; n = n.parent) if (n.userData && n.userData.part) return n.userData.part; return null; })() : null;
                out.push([s, l, hit ? round(hit.point.y, 1e4) : null, hit ? round(hit.point.y - ground, 1e4) : null, partOf, round(p.y, 1e4)]);
            }
        }
        return { roadWidth: env.roadWidth, rays: out };
    };

    P.raycast = legIndex => {
        const result = P.rays(legIndex, (o, env) => P.ribbons(env).includes(o));
        // Segment, lateral, hit height and its gap to groundYAt: the part and road height are surface-only
        result.rays = result.rays.map(r => r.slice(0, 4));
        return result;
    };
    // Offset 5: a ray on the first row of the road mesh lies on its boundary edge and can slip through
    P.surface = legIndex => P.rays(legIndex, o => {
        for (let n = o; n; n = n.parent) if (n.userData && (n.userData.part === 'ground' || n.userData.part === 'floor')) return true;
        return false;
    }, 5);
    P.parts = async legIndex => {
        const { env, scene } = P.build(legIndex);
        const out = { ground: [], decals: [], floor: [], fixed: [] };
        const v = new THREE.Vector3();
        scene.traverse(o => {
            if (!o.isMesh) return;
            let part = 'fixed';
            for (let n = o; n; n = n.parent) if (n.userData && n.userData.part) { part = n.userData.part; break; }
            const pos = o.geometry.attributes.position;
            const world = [];
            const c = new THREE.Vector3();
            for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); world.push(v.x, v.y, v.z); c.add(v); }
            c.multiplyScalar(1 / Math.max(1, pos.count));
            const entry = { hash: fnv(world) };
            if (part === 'ground' || part === 'decals') { entry.vertices = pos.count; entry.centroid = [round(c.x, 100), round(c.y, 100), round(c.z, 100)]; }
            out[part].push(entry);
        });
        Object.values(out).forEach(list => list.sort((a, b) => (a.hash < b.hash ? -1 : 1)));
        return out;
    };

    // Chord search: no straight rideable chord may be much shorter than the road it replaces.
    // `limitAt(n, x, z)` is the rideable limit beside road point n at a sample (x, z).
    const searchChords = (path, a, b, limitAt) => {
        const dist = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);
        const cum = [0];
        for (let i = a + 1; i <= b; i++) cum[i - a] = cum[i - a - 1] + dist(path[i - 1], path[i]);
        const open = [];
        for (let i = a; i <= b; i++) {
            for (let j = i + 6; j <= b; j++) {
                const road = cum[j - a] - cum[i - a];
                const chord = dist(path[i], path[j]);
                if (chord >= 0.6 * road) continue;
                const steps = Math.ceil(chord / 2);
                let ok = true;
                for (let k = 0; k <= steps && ok; k++) {
                    const x = path[i].x + (path[j].x - path[i].x) * k / steps;
                    const z = path[i].z + (path[j].z - path[i].z) * k / steps;
                    let best = Infinity, nearest = i;
                    for (let n = Math.max(a, i - 3); n <= Math.min(b, j + 3); n++) {
                        const d = Math.hypot(x - path[n].x, z - path[n].z);
                        if (d < best) { best = d; nearest = n; }
                    }
                    ok = best <= limitAt(nearest, x, z);
                }
                if (ok) open.push([i, j, round(chord, 10), round(road, 10)]);
            }
        }
        return open;
    };

    P.shortcuts = legIndex => {
        const { env } = P.build(legIndex);
        const path = env.roadPath;
        const halfRoad = env.roadWidth / 2;
        // The rideable ground: the profile's own limit on the side the sample falls, or
        // the road plus its ledge on a tree that has no profiles (the frozen baselines)
        const limitAt = (n, x, z) => {
            if (typeof Terrain === 'undefined' || !env.terrain) return halfRoad + 2;
            const lateral = (x - path[n].x) * Math.cos(path[n].heading) - (z - path[n].z) * Math.sin(path[n].heading);
            return Terrain.rideableLimit(env.terrain, n, lateral < 0 ? -1 : 1, halfRoad);
        };
        return searchChords(path, env.startSegment, Math.min(env.endSegment, path.length - 1), limitAt);
    };

    // The positive control of `shortcuts`: a road that doubles back on itself with
    // its two runs 6 m apart. The search must report a chord across it, or an
    // all-empty answer on the real legs says nothing.
    P.shortcutsControl = () => {
        const path = [];
        for (let k = 0; k <= 9; k++) path.push({ x: 20 * k, z: 0 });
        path.push({ x: 210, z: 3 });
        for (let k = 9; k >= 0; k--) path.push({ x: 20 * k, z: 6 });
        return searchChords(path, 0, path.length - 1, () => 12);
    };

    // Where the leg's gates sit and the nearest foreign road stretch inside each gate's band
    P.gateMap = legIndex => {
        const { env } = P.build(legIndex);
        const path = env.roadPath;
        const gates = env.checkpoints.map(c => ({ name: `cp${c.index}`, position: c.position, heading: c.heading, segment: c.segmentIndex }));
        if (env.finishGate) {
            const f = env.finishGate.position;
            gates.push({ name: 'finish', position: f, heading: env.finishGate.heading, segment: env.finishGate.segmentIndex });
        }
        return gates.map(g => {
            let nearest = null;
            path.forEach((p, i) => {
                if (Math.abs(i - g.segment) <= 3) return;
                const dx = p.x - g.position.x, dz = p.z - g.position.z;
                const along = dx * Math.sin(g.heading) + dz * Math.cos(g.heading);
                const across = dx * Math.cos(g.heading) - dz * Math.sin(g.heading);
                if (Math.abs(along) < 5 && (!nearest || Math.abs(across) < nearest.metres)) nearest = { metres: round(Math.abs(across), 10), segment: i };
            });
            return { name: g.name, segment: g.segment, foreign: nearest ? `${nearest.metres}@seg${nearest.segment}` : 'none' };
        });
    };

    // A stepped approach to a gate along `lane`; reports the outcome
    P.approach = (legIndex, gate, lane) => {
        const leg = game.tourSystem.legs[legIndex];
        window.__reseed(1);
        twistyDev.start(leg.id);
        twistyDev.freeze();
        game.rockfalls = null;
        // An approach proves the gate fires on a lateral; a collision with a rival bike says nothing about the gate
        game.traffic = null;
        game.showFinishScreen = () => {};
        if (gate === 'finish') {
            // Ten segments short of the finish line, which sits just past endSegment
            twistyDev.teleport(game.environment.finishGate.segmentIndex - 10);
        }
        twistyDev.autopilot({ speed: 15, lane });
        const result = { gate, lane, fired: false, crashed: false, ticks: 0 };
        for (let i = 0; i < 1500; i++) {
            twistyDev.step(1);
            result.ticks = i + 1;
            if (game.vehicle.crashed) { result.crashed = true; break; }
            if (gate === 'finish' ? game.finished : game.checkpointsPassed >= 1) { result.fired = true; break; }
        }
        return result;
    };

    // Run-off clock: the bike at 25 m/s, 14 m out on the right of mountain-dawn (4 m past the
    // road edge). `driven` starts on the centre line and lets the autopilot steer out to lane
    // 14, so the clock starts only when the bike reaches the edge; `placed` starts at lateral
    // 14 with the heading along the road, so the clock runs from tick 0
    P.runoff = legIndex => {
        const leg = game.tourSystem.legs[legIndex];
        const run = placed => {
            window.__reseed(1);
            twistyDev.start(leg.id);
            twistyDev.freeze();
            game.rockfalls = null;
            const logs = [];
            const original = console.log;
            console.log = (...a) => { logs.push(a.join(' ')); };
            try {
                const segment = leg.startSegment + 20;
                twistyDev.teleport(segment);
                const v = game.vehicle;
                v.speed = 25;
                if (placed) {
                    const p = game.environment.roadPath[segment];
                    v.position.x += Math.cos(p.heading) * 14;
                    v.position.z -= Math.sin(p.heading) * 14;
                    v.findNearestRoadSegment();
                }
                twistyDev.autopilot({ speed: 25, lane: 14 });
                const out = {};
                let tick = 0;
                for (const seconds of [3, 7, 10]) {
                    while (tick < seconds * 60) { twistyDev.step(1); tick++; }
                    out[seconds] = { crashed: !!v.crashed, offRoadTime: round(v.offRoadTime), speed: round(v.speed) };
                }
                out.offRoadLines = logs.filter(l => l.includes('Off the road for 6.0 s')).length;
                return out;
            } finally {
                console.log = original;
            }
        };
        return { driven: run(false), placed: run(true) };
    };

    // Height fog follows depth: render a fixed view with the leg's fog and with none. Pixels whose
    // view ray meets ground within 15 m (the near road) must not change; pixels whose ray meets
    // ground beyond 150 m must. Each pixel is the mean of a 5 x 5 patch, in 1/255 levels.
    P.fog = legIndex => {
        const leg = game.tourSystem.legs[legIndex];
        window.__reseed(1);
        twistyDev.start(leg.id);
        twistyDev.freeze();
        game.rockfalls = null;
        game.scene.traverse(o => { if (o.isPoints) o.visible = false; });
        const canvas = game.graphics.renderer.domElement;
        const read = document.createElement('canvas');
        read.width = 960; read.height = 540;
        const ctx = read.getContext('2d', { willReadFrequently: true });
        const atmosphere = game.graphics.atmosphere;
        const density = atmosphere.heightFog.density;
        const shoot = fogDensity => {
            atmosphere.heightFog.density = fogDensity;
            game.graphics.time = 0;
            game.graphics.render(game.scene, game.camera);
            ctx.drawImage(canvas, 0, 0, 960, 540);
            return ctx.getImageData(0, 0, 960, 540).data;
        };
        const patch = (data, x, y) => {
            let sum = 0;
            for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
                const i = ((y + dy) * 960 + x + dx) * 4;
                sum += data[i] + data[i + 1] + data[i + 2];
            }
            return sum / 75;
        };
        const meshes = [];
        game.scene.traverse(o => { if (o.isMesh && o.visible && o.geometry.attributes.position && !o.isInstancedMesh) meshes.push(o); });
        const caster = new THREE.Raycaster();
        const mid = Math.floor((leg.startSegment + leg.endSegment) / 2);
        const views = { camera: [30, 12, 25, 40], chase: [0, 3, 12, 40], low: [0, 1.5, 8, 40], opposite: [-30, 12, 25, 40] };
        const out = {};
        twistyDev.teleport(mid);
        for (const [name, view] of Object.entries(views)) {
            twistyDev.view(...view);
            game.camera.updateMatrixWorld(true);
            const clear = shoot(0);
            const fogged = shoot(density);
            const again = shoot(density);
            const near = [], far = [];
            let noise = 0;
            for (let y = 8; y < 532; y += 12) {
                for (const x of [120, 320, 480, 640, 840]) {
                    caster.setFromCamera(new THREE.Vector2((x / 960) * 2 - 1, -(y / 540) * 2 + 1), game.camera);
                    const hit = caster.intersectObjects(meshes, false)[0];
                    if (!hit || hit.object.material.transparent) continue;
                    const delta = Math.abs(patch(fogged, x, y) - patch(clear, x, y));
                    noise = Math.max(noise, Math.abs(patch(fogged, x, y) - patch(again, x, y)));
                    if (hit.distance < 15) near.push(delta);
                    else if (hit.distance > 150) far.push(delta);
                }
            }
            const mean = list => (list.length ? round(list.reduce((a, b) => a + b, 0) / list.length, 100) : null);
            out[name] = { nearSamples: near.length, nearMax: near.length ? round(Math.max(...near), 100) : null, farSamples: far.length, farMean: mean(far), farMin: far.length ? round(Math.min(...far), 100) : null, noise: round(noise, 100) };
        }
        atmosphere.heightFog.density = density;
        return out;
    };

    // A stepped autopilot ride of a whole leg
    P.ride = (legIndex, speed) => {
        const leg = game.tourSystem.legs[legIndex];
        window.__reseed(1);
        twistyDev.start(leg.id);
        twistyDev.freeze();
        game.rockfalls = null;
        game.showFinishScreen = () => {};
        twistyDev.autopilot({ speed });
        const out = { speed, checkpointTicks: [], finishTick: null, crashTick: null, positions: [] };
        let seen = 0;
        // A long leg needs more ticks than the 9000 of a short one (which keep their cap)
        const cap = Math.max(9000, Math.ceil((leg.endSegment - leg.startSegment + 1) * 20 / speed * 60 * 1.5));
        for (let tick = 1; tick <= cap; tick++) {
            twistyDev.step(1);
            while (seen < game.checkpointsPassed) { out.checkpointTicks.push(tick); seen++; }
            if (tick % 60 === 0) out.positions.push([game.vehicle.position.x, game.vehicle.position.y, game.vehicle.position.z].map(n => round(n)));
            if (game.finished) { out.finishTick = tick; break; }
            if (game.vehicle.crashed) { out.crashTick = tick; break; }
        }
        return out;
    };

    // Milliseconds to render one frame (scene, post and a 1-pixel read-back
    // that waits for the GPU), at five points along the leg from the chase
    // view, after the leg's modelled scenery has loaded. The median of `count`
    // frames per point, and of all of them. The bike is the modelled one
    // (js/bikemodels.js) unless --no-assets holds it back.
    P.frametime = async (legIndex, count = 15) => {
        const leg = game.tourSystem.legs[legIndex];
        if (typeof BikeModels !== 'undefined') await BikeModels.preload();
        window.__reseed(1);
        twistyDev.start(leg.id);
        twistyDev.freeze();
        game.rockfalls = null;
        game.traffic = null;
        const assets = game.environment.dressing ? await game.environment.dressing : null;
        game.directionalLight.intensity = game.baseSunIntensity !== undefined ? game.baseSunIntensity : 0.8;
        const gl = game.graphics.renderer.getContext();
        const pixel = new Uint8Array(4);
        const frame = () => {
            const t0 = performance.now();
            game.graphics.render(game.scene, game.camera);
            gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
            return performance.now() - t0;
        };
        const median = list => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)];
        const all = [];
        // A converted leg: each part's middle and each boundary between parts
        const parts = game.environment.sections ? game.environment.terrain.parts : null;
        const stations = parts
            ? parts.flatMap((part, n) => [Math.floor((part.from + (n === parts.length - 1 ? leg.endSegment : part.to)) / 2), ...(n ? [part.from] : [])]).sort((a, b) => a - b)
            : [0.1, 0.3, 0.5, 0.7, 0.9].map(f => Math.round(leg.startSegment + f * (leg.endSegment - leg.startSegment)));
        const points = stations.map(segment => {
            twistyDev.teleport(segment);
            twistyDev.view(0, 3, 12, 40);
            for (let i = 0; i < 3; i++) frame();
            const times = Array.from({ length: count }, frame);
            all.push(...times);
            return { segment, ms: round(median(times), 10) };
        });
        let moving = null;
        if (parts) {
            // 600 rendered frames ridden across the first boundary, the world built as it goes
            const from = Math.max(0, parts[1].from - 12);
            twistyDev.teleport(from);
            twistyDev.autopilot({ speed: 30 });
            game.vehicle.speed = 30;
            game.cameraIntroActive = false;
            const frames = [];
            for (let n = 0; n < 600 && !game.vehicle.crashed; n++) {
                twistyDev.step(1);
                frames.push(frame());
            }
            moving = { from, to: Math.floor(game.vehicle.currentRoadSegment), frames: frames.length, worstMs: round(Math.max(...frames.slice(5)), 10), medianMs: round(median(frames), 10), crashed: game.vehicle.crashed };
        }
        return { ms: round(median(all), 10), points, moving, dressed: !!assets, bike: game.vehicle.modelled ? 'modelled' : 'procedural' };
    };

    // The whole scene of the page, with the leg's modelled dressing in place, as one
    // digest: FNV-1a over each mesh's world matrix (and its instance matrices),
    // sorted, then SHA-256. Pins "an unconverted leg did not move" where node cannot
    // see the modelled assets, the cones, the crew and the oncoming car.
    P.scene = async legIndex => {
        const leg = game.tourSystem.legs[legIndex];
        if (typeof BikeModels !== 'undefined') await BikeModels.preload();
        window.__reseed(1);
        twistyDev.start(leg.id);
        twistyDev.freeze();
        const assets = game.environment.dressing ? await game.environment.dressing : null;
        game.scene.updateMatrixWorld(true);
        const fnv = (bytes, seed) => {
            let hash = seed;
            for (let i = 0; i < bytes.length; i++) hash = Math.imul(hash ^ bytes[i], 16777619) >>> 0;
            return hash;
        };
        const lines = [];
        let instances = 0;
        game.scene.traverse(object => {
            if (!object.isMesh) return;
            let hash = fnv(new Uint8Array(new Float32Array(object.matrixWorld.elements).buffer), 2166136261);
            if (object.isInstancedMesh) {
                const used = object.instanceMatrix.array.subarray(0, object.count * 16);
                hash = fnv(new Uint8Array(used.buffer, used.byteOffset, used.byteLength), hash);
                instances += object.count;
            }
            lines.push(hash.toString(16).padStart(8, '0'));
        });
        lines.sort();
        const bytes = new TextEncoder().encode(lines.join(''));
        const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
        return { digest, meshes: lines.length, instances, cones: game.cones ? game.cones.cones.length : 0, dressed: !!assets };
    };

    // Mean RGB per tile of the main canvas, from fixed poses
    P.frames = legIndex => {
        const leg = game.tourSystem.legs[legIndex];
        window.__reseed(1);
        twistyDev.start(leg.id);
        twistyDev.freeze();
        game.rockfalls = null;
        const mid = Math.floor((leg.startSegment + leg.endSegment) / 2);
        const poses = [
            [leg.startSegment + 10, [0, 3, 12, 40]],
            [mid, [0, 3, 12, 40]],
            [leg.endSegment - 10, [0, 3, 12, 40]],
            [mid, [30, 12, 25, 40]]
        ];
        // animate() varies the sun with wall-clock time (+-6%); pin it to its base value
        game.directionalLight.intensity = game.baseSunIntensity !== undefined ? game.baseSunIntensity : 0.8;
        game.scene.traverse(o => { if (o.isPoints) o.visible = false; });
        const canvas = game.graphics.renderer.domElement;
        const read = document.createElement('canvas');
        read.width = 960; read.height = 540;
        const ctx = read.getContext('2d', { willReadFrequently: true });
        const shoot = () => {
            game.graphics.time = 0;
            game.graphics.render(game.scene, game.camera);
            ctx.drawImage(canvas, 0, 0, 960, 540);
            const tiles = [];
            for (let ty = 0; ty < 9; ty++) {
                for (let tx = 0; tx < 16; tx++) {
                    const d = ctx.getImageData(tx * 60, ty * 60, 60, 60).data;
                    let r = 0, g = 0, b = 0;
                    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
                    const n = d.length / 4;
                    tiles.push([round(r / n, 100), round(g / n, 100), round(b / n, 100)]);
                }
            }
            return tiles;
        };
        return poses.map(([segment, view]) => {
            twistyDev.teleport(segment);
            twistyDev.view(...view);
            const first = shoot();
            const second = shoot();
            let drift = 0;
            first.forEach((t, i) => t.forEach((c, k) => { drift = Math.max(drift, Math.abs(c - second[i][k])); }));
            return { segment, view, tiles: first, drift: round(drift, 100) };
        });
    };

    P.look = legIndex => {
        const leg = game.tourSystem.legs[legIndex];
        const colours = scene => {
            let terrain = null, mountain = null;
            scene.traverse(o => {
                if (!o.isMesh) return;
                if (!terrain && o.userData.type === 'terrain') terrain = o.material.color.getHex();
                if (!mountain && o.userData.type === 'mountain' && !o.geometry.attributes.color) mountain = o.material.color.getHex();
            });
            return { terrain, mountain };
        };
        window.__reseed(1);
        twistyDev.start(leg.id);
        const ride = { config: game.environment.landscapeConfig, fog: game.scene.fog ? game.scene.fog.density : null, ...colours(game.scene) };
        let preview;
        try {
            game.startTrackPreview(legIndex);
            preview = { config: game.previewEnv.landscapeConfig, fog: game.scene.fog ? game.scene.fog.density : null, ...colours(game.scene) };
        } catch (error) {
            preview = { error: String(error.message || error) };
        }
        return { ride, preview };
    };

    // Every value a surface of the game writes when it sets the look of the world: sky uniforms,
    // grade, scene colours and fog, the six lights, exposure, headlight, the road material of `env`
    // and the first terrain and mountain colours. Reads only fields that exist at 6fbc542, so the same
    // dump runs in a base worktree. `env` may be null (the rider showcase has none).
    P.dump = env => {
        const hex = c => c.getHex();
        const graphics = game.graphics;
        const sky = {};
        Object.keys(graphics.skyUniforms).forEach(key => {
            const v = graphics.skyUniforms[key].value;
            if (key === 'uTime' || key === 'tPanorama') return;
            if (typeof v === 'number') sky[key] = v;
            else if (v && v.isColor) sky[key] = hex(v);
            else if (v && (v.isVector3 || v.isVector2)) sky[key] = v.toArray();
        });
        const light = l => ({ color: hex(l.color), intensity: l.intensity, ...(l.groundColor && { ground: hex(l.groundColor) }) });
        let terrain = null, mountain = null;
        game.scene.traverse(o => {
            if (!o.isMesh) return;
            if (terrain === null && o.userData.type === 'terrain') terrain = hex(o.material.color);
            if (mountain === null && o.userData.type === 'mountain' && !o.geometry.attributes.color) mountain = hex(o.material.color);
        });
        const road = env && env.roadMaterial ? { roughness: env.roadMaterial.roughness, metalness: env.roadMaterial.metalness, envMapIntensity: env.roadMaterial.envMapIntensity, color: hex(env.roadMaterial.color) } : null;
        const grade = graphics.grade ? { ...graphics.grade, tint: hex(graphics.grade.tint) } : null;
        return {
            sky,
            timeKey: graphics.timeKey,
            weatherType: graphics.weatherType,
            ringStrength: graphics.ringStrength,
            atmosphere: graphics.atmosphere ? JSON.parse(JSON.stringify(graphics.atmosphere)) : null,
            grade,
            background: hex(game.scene.background),
            fogColor: hex(game.scene.fog.color),
            fogDensity: game.scene.fog.density,
            ambient: light(game.ambientLight),
            hemisphere: light(game.hemisphereLight),
            directional: light(game.directionalLight),
            distant: light(game.distantLight),
            fill: light(game.fillLight),
            rim: light(game.rimLight),
            baseSunIntensity: game.baseSunIntensity,
            exposure: game.renderer.toneMappingExposure,
            headlightStrength: game.headlightStrength,
            headlightVisible: game.headlight.visible,
            road,
            terrain,
            mountain,
            physics: game.weatherSystem && env === game.environment ? game.weatherSystem.getPhysicsMultipliers() : null
        };
    };

    // The wall clock varies the sun by +-6% in animate(); the dump reads its base value
    const settle = (frames = 1) => {
        for (let i = 0; i < frames; i++) twistyDev.step(1, { render: true });
        game.directionalLight.intensity = game.baseSunIntensity !== undefined ? game.baseSunIntensity : 0.8;
    };
    const menuFrame = () => {
        game.graphics.time = 0;
        game.graphics.update(0, 0, 0);
        game.graphics.render(game.scene, game.camera);
    };

    // The look that the menu preview, the rider showcase, a time override and a ride give, per leg
    // (arms preview, previewAfterRide, showcase, timeOverride and ride of the plan's PR9 and PR23)
    P.atmostate = legIndex => {
        const leg = game.tourSystem.legs[legIndex];
        const times = Object.fromEntries([leg.timeOfDay, 'golden', 'night'].map(key => [key, { sunIntensity: game.timeConfigs[key].sunIntensity, hemisphereIntensity: game.timeConfigs[key].hemisphereIntensity, fogColor: game.timeConfigs[key].fogColor, headlight: game.timeConfigs[key].headlight || 0 }]));
        const out = { expectedFogDensity: Terrain.legConfig(legIndex).look.fogDensity, times, weather: leg.weather, weatherIntensity: leg.weatherIntensity };
        window.__reseed(1);
        game.startTrackPreview(legIndex);
        menuFrame();
        out.preview = P.dump(game.previewEnv);
        if (leg.id === 'storm-valley') {
            game.startRiderShowcase(CHARACTERS[0].id);
            menuFrame();
            out.showcase = P.dump(null);
        }
        window.__reseed(1);
        twistyDev.start(leg.id);
        twistyDev.freeze();
        game.rockfalls = null;
        game.showFinishScreen = () => {};
        out.ride = [0, 0.25, 0.5, 0.75, 1].map(f => {
            const segment = Math.round(leg.startSegment + f * (leg.endSegment - leg.startSegment));
            twistyDev.teleport(segment);
            settle();
            return { segment, dump: P.dump(game.environment) };
        });
        game.returnToMenu();
        window.__reseed(1);
        game.startTrackPreview(legIndex);
        menuFrame();
        out.previewAfterRide = P.dump(game.previewEnv);
        if (leg.id === 'storm-valley' || leg.id === 'night-ride') {
            window.__reseed(1);
            twistyDev.start(leg.id);
            twistyDev.freeze();
            game.rockfalls = null;
            game.setTimeOfDay(leg.id === 'storm-valley' ? 'night' : 'golden');
            settle();
            const first = P.dump(game.environment);
            settle(60);
            out.timeOverride = { first, after60: P.dump(game.environment) };
        }
        return out;
    };

    // Draws from the global random stream: at leg start, 600 ticks into a ride, in the menu preview and
    // in the rider showcase. `nextValue` is what the stream gives next after the start.
    P.draws = legIndex => {
        const leg = game.tourSystem.legs[legIndex];
        const real = Math.random;
        let count = 0;
        Math.random = () => { count++; return real(); };
        try {
            window.__reseed(1);
            count = 0;
            twistyDev.start(leg.id);
            const startDraws = count;
            const nextValue = real();
            window.__reseed(1);
            twistyDev.start(leg.id);
            twistyDev.freeze();
            count = 0;
            twistyDev.step(600);
            const rideDraws = count;
            window.__reseed(1);
            count = 0;
            game.startTrackPreview(legIndex);
            const previewDraws = count;
            window.__reseed(1);
            count = 0;
            game.startRiderShowcase(CHARACTERS[0].id);
            return { startDraws, nextValue, rideDraws, previewDraws, showcaseDraws: count };
        } finally {
            Math.random = real;
        }
    };

    // Rides across one part boundary with rendering on and reports what the blend does: the mean luminance
    // of the sky band per frame, the environment bakes, whether the rain buffer is the one made at leg start,
    // its draw range, and the grip along the way. `control` snaps at the boundary instead of blending.
    // The track is synthetic: dawn in clear air to night in rain at the middle of the leg.
    P.atmo = (legIndex, control = false) => {
        const leg = game.tourSystem.legs[legIndex];
        const config = Terrain.legConfig(legIndex);
        window.__reseed(1);
        twistyDev.start(leg.id);
        twistyDev.freeze();
        game.rockfalls = null;
        game.traffic = null;
        game.showFinishScreen = () => {};
        const env = game.environment;
        const mid = Math.round((leg.startSegment + leg.endSegment) / 2);
        const part = (from, to, look) => ({ startSegment: from, endSegment: to, look: { fogDensity: config.look.fogDensity, heightFog: config.atmosphere.heightFog, shafts: 0, ring: 1, baseY: game.atmosphereTrack.parts[0].look.baseY, ...look } });
        const track = AtmosphereTrack.build([
            part(leg.startSegment, mid - 1, { timeOfDay: 'dawn', weather: 'clear', weatherIntensity: 0 }),
            part(mid, leg.endSegment, { timeOfDay: 'night', weather: 'rain', weatherIntensity: 0.9, fogDensity: 0.003 })
        ]);
        game.weatherSystem.prepare(track.weatherTypes());
        const rain = game.weatherSystem.systems.rain.points;
        const buffer = rain.geometry.attributes.position;
        game.atmosphereTrack = track;
        const targets = { environment: env, weatherSystem: game.weatherSystem };
        game.snapAtmosphere(track, leg.startSegment, targets);
        if (control) {
            let snapped = false;
            game.applyAtmosphere = () => {
                if (!snapped && game.vehicle.currentRoadSegment >= mid) {
                    snapped = true;
                    game.snapAtmosphere(track, mid + 10, targets);
                }
            };
        }
        twistyDev.teleport(mid - 14);
        twistyDev.autopilot({ speed: 30 });
        const canvas = game.graphics.renderer.domElement;
        const read = document.createElement('canvas');
        read.width = 32; read.height = 18;
        const ctx = read.getContext('2d', { willReadFrequently: true });
        const luminance = () => {
            ctx.drawImage(canvas, 0, 0, 32, 18);
            // The upper third is sky and far ranges, the part of the picture the blend moves
            const d = ctx.getImageData(0, 0, 32, 6).data;
            let sum = 0;
            for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
            return sum / (d.length / 4);
        };
        const SETTLE = 40;
        const frames = [];
        const gripAt = [];
        for (let tick = 0; tick < 2400 && game.vehicle.currentRoadSegment < mid + 14; tick++) {
            twistyDev.step(1, { render: true });
            game.vehicle.crashed = false;
            const sample = track.sample(game.vehicle.currentRoadSegment);
            frames.push({ segment: round(game.vehicle.currentRoadSegment, 10), t: round(sample.t, 1000), luminance: round(luminance(), 100) });
            if (tick % 10 === 0) gripAt.push({ t: round(sample.t, 100), lateralFriction: round(game.weatherSystem.getPhysicsMultipliers().lateralFriction, 10000) });
        }
        const lum = frames.map(f => f.luminance);
        const mean = list => list.reduce((a, b) => a + b, 0) / list.length;
        const totalChange = Math.abs(mean(lum.slice(-10)) - mean(lum.slice(0, 10)));
        // The first frames after the teleport settle the camera and are not the blend
        const steps = lum.slice(1).map((v, i) => (i < SETTLE ? 0 : Math.abs(v - lum[i])));
        const counts = rain.geometry.drawRange.count;
        return {
            control,
            frames: frames.length,
            totalChange: round(totalChange, 100),
            maxFrameStep: round(Math.max(...steps), 100),
            maxStepAt: frames[steps.indexOf(Math.max(...steps)) + 1],
            around: frames.slice(steps.indexOf(Math.max(...steps)) - 3, steps.indexOf(Math.max(...steps)) + 6).map(f => [f.t, f.luminance]),
            envBakes: game.graphics.stats.envBakes,
            lastBakeFrame: game.graphics.stats.lastBakeFrame,
            rainBufferSame: rain.geometry.attributes.position === buffer,
            drawRange: counts,
            gripAt,
            lum: lum.filter((_, i) => i % 10 === 0)
        };
    };

    P.legCheck = (legIndex, ticks) => {
        const leg = game.tourSystem.legs[legIndex];
        const lines = [];
        const original = { error: console.error, log: console.log, warn: console.warn };
        ['error', 'log', 'warn'].forEach(k => { console[k] = (...a) => { lines.push(a.join(' ')); }; });
        let result;
        try {
            window.__reseed(1);
            twistyDev.start(leg.id);
            twistyDev.freeze();
            twistyDev.step(ticks);
            result = {
                vehicle: !!game.vehicle,
                postEnabled: !!game.graphics.postEnabled,
                roadWidth: game.environment.roadWidth,
                groundingViolations: game.environment.validateGrounding().length
            };
        } finally {
            Object.assign(console, original);
        }
        result.floatingObjects = lines.some(l => l.includes('FLOATING OBJECTS'));
        result.terrainRoadOverlap = lines.some(l => l.includes('TERRAIN-ROAD OVERLAP'));
        return result;
    };

    // The same build with groundYAt raised, to prove the fingerprint reacts to terrain changes
    P.mutate = async (legIndex, amount) => {
        const original = Environment.prototype.groundYAt;
        Environment.prototype.groundYAt = function (...args) { return original.apply(this, args) + amount; };
        try {
            const { env, scene } = P.build(legIndex);
            return await P.fingerprints(env, scene);
        } finally {
            Environment.prototype.groundYAt = original;
        }
    };

    // ---- Converted legs: sections, the drawn window, parts
    // A mesh is drawn unless a group above it is hidden (a section outside
    // the window, a step not yet revealed, a parked rider) or it is a hidden
    // floor plane. A mesh's own visible flag is the distance cull: not counted out.
    const drawn = object => {
        if (object.userData.part === 'floor' && !object.visible) return false;
        for (let n = object.parent; n; n = n.parent) if (!n.visible) return false;
        return true;
    };
    P.countDrawn = () => {
        let meshes = 0, triangles = 0, instances = 0;
        game.scene.traverse(o => {
            if (!o.isMesh || !drawn(o)) return;
            const pos = o.geometry.attributes.position;
            const index = o.geometry.index;
            meshes++;
            triangles += (index ? index.count : pos.count) / 3 * (o.isInstancedMesh ? o.count : 1);
            if (o.isInstancedMesh) instances += o.count;
        });
        return { meshes, triangles: Math.round(triangles), instances };
    };
    const segmentOf = (env, x, z) => Terrain.locate(env.roadPath, x, z, 0, env.roadPath.length - 1, {}).index;
    const inSections = (sections, s) => sections.some(section => s >= section.from && s < section.to);
    // Bytes of every geometry the leg keeps: its own group and its built sections
    const retainedBytes = (env, which = 'all') => {
        const seen = new Set();
        let total = 0;
        const add = o => {
            if (!o.isMesh || seen.has(o.geometry)) return;
            seen.add(o.geometry);
            Object.values(o.geometry.attributes).forEach(a => { total += a.array.byteLength; });
            if (o.geometry.index) total += o.geometry.index.array.byteLength;
            if (o.isInstancedMesh) total += o.instanceMatrix.array.byteLength;
        };
        if (which !== 'sections') env.fixed.traverse(add);
        if (which !== 'fixed') env.sections.forEach(section => section.group && section.group.traverse(add));
        return total;
    };
    const lastGateBefore = (env, s) => {
        const passed = env.checkpoints.filter(gate => gate.segmentIndex <= s);
        return passed.length ? passed[passed.length - 1].segmentIndex : null;
    };
    const startConverted = legIndex => {
        const leg = game.tourSystem.legs[legIndex];
        window.__reseed(1);
        twistyDev.start(leg.id);
        twistyDev.freeze();
        const env = game.environment;
        if (!env.sections) throw new Error(`${leg.id} is not a converted leg`);
        return { leg, env };
    };

    // PW6: every window position of the leg, with modelled assets, cones, the
    // crew and oncoming cars, counted as `budget` counts but only what is drawn
    P.window = async legIndex => {
        const { env } = startConverted(legIndex);
        game.rockfalls = null;
        const windows = [];
        for (const section of env.sections) {
            const s = Math.min(env.endSegment, section.from + Math.floor((section.to - section.from) / 2));
            twistyDev.teleport(s);
            env.update(s, 1e9, lastGateBefore(env, s));
            if (game.traffic) game.traffic.update(0, game.vehicle.position, s);
            await Promise.all(env.sections.map(entry => entry.dressing).filter(Boolean));
            game.scene.updateMatrixWorld(true);
            const built = env.sections.filter(entry => entry.state === 'built');
            const cones = game.cones ? game.cones.cones : [];
            windows.push({
                section: section.index,
                segment: s,
                visible: env.visibleSections().map(entry => entry.index),
                retained: built.map(entry => entry.index),
                ...P.countDrawn(),
                solidBoulders: env.boulders.filter(b => b.solid).length,
                retainedMB: round(retainedBytes(env) / 1048576, 100),
                sectionsMB: round(retainedBytes(env, 'sections') / 1048576, 100),
                legMB: round(retainedBytes(env, 'fixed') / 1048576, 100),
                cones: cones.length,
                conesOutsideRetained: cones.filter(cone => !inSections(built, segmentOf(env, cone.position.x, cone.position.z))).length,
                vehicles: game.traffic ? game.traffic.cars.length + game.traffic.motorcycles.filter(bike => bike.bikeGroup.visible).length : 0
            });
        }
        const peak = {};
        ['meshes', 'triangles', 'instances', 'solidBoulders', 'retainedMB', 'sectionsMB', 'legMB', 'conesOutsideRetained'].forEach(key => { peak[key] = Math.max(...windows.map(w => w[key])); });
        return { windows, peak, sections: env.sections.length };
    };

    // PW7, PW14: the whole leg ridden at a fixed step with the world built
    // ahead of the bike. `gpu`: every frame rendered and one pixel read back.
    P.stream = async (legIndex, { speed = 45, gpu = false, traffic = false, cones = false, rockfalls = false } = {}) => {
        // The modelled bike is in before the leg starts, as in the frametime probe
        if (typeof BikeModels !== 'undefined') await BikeModels.preload();
        const { env } = startConverted(legIndex);
        if (!rockfalls) game.rockfalls = null;
        if (!traffic && game.traffic) {
            game.traffic.reset();
            game.traffic = null;
        }
        if (!cones && game.cones) game.cones.checkCollision = () => {};
        game.showFinishScreen = () => {};
        // Oncoming cars keep to lateral +3: with traffic the bike keeps to its own side
        twistyDev.autopilot({ speed, lane: traffic ? -3.5 : 0 });
        const gl = game.graphics.renderer.getContext();
        const pixel = new Uint8Array(4);
        const render = () => {
            const t0 = performance.now();
            game.graphics.render(game.scene, game.camera);
            gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
            return performance.now() - t0;
        };
        const stats = env.sectionStats;
        const syncAtStart = stats.syncBuilds;
        const out = {
            speed, finished: false, crashes: 0, airborneFrames: 0, framesOnUnbuiltGround: 0, maxVisibleSections: 0,
            vehiclesDrawnOutsideVisible: 0, conesOutsideRetained: 0, rocksOutsideVisible: 0, vehiclesPastTail: 0, ticks: 0
        };
        const frames = [];
        const firstVisible = {};
        const cap = Math.ceil((env.endSegment + 1) * 20 / speed * 60 * 1.5);
        let revealed = stats.revealed.length;
        const tail = env.endSegment + 16;
        for (let tick = 1; tick <= cap; tick++) {
            const s = Math.floor(game.vehicle.currentRoadSegment || 0);
            if (env.sections[env.sectionAt(s)].state !== 'built') out.framesOnUnbuiltGround++;
            twistyDev.step(1);
            out.ticks = tick;
            if (game.vehicle.isJumping) out.airborneFrames++;
            const visible = env.visibleSections();
            out.maxVisibleSections = Math.max(out.maxVisibleSections, visible.length);
            if (game.traffic) {
                const shown = [...game.traffic.cars.filter(car => car.carGroup.visible), ...game.traffic.motorcycles.filter(bike => bike.bikeGroup.visible)];
                out.vehiclesDrawnOutsideVisible += shown.filter(v => !inSections(visible, Math.floor(v.currentSegment))).length;
                out.vehiclesPastTail += [...game.traffic.cars, ...game.traffic.motorcycles].filter(v => v.currentSegment > tail).length;
            }
            if (tick % 30 === 0 && game.cones) {
                const built = env.sections.filter(entry => entry.state === 'built');
                out.conesOutsideRetained += game.cones.cones.filter(cone => !inSections(built, segmentOf(env, cone.position.x, cone.position.z))).length;
            }
            if (game.rockfalls) out.rocksOutsideVisible += game.rockfalls.rocks.filter(rock => !inSections(visible, segmentOf(env, rock.mesh.position.x, rock.mesh.position.z))).length;
            if (gpu) {
                const bakes = game.graphics.stats.envBakes;
                const programs = game.graphics.renderer.info.programs.length;
                const ms = render();
                const compiled = game.graphics.renderer.info.programs.slice(programs).map(p => p.name);
                if (compiled.length) (out.compiledInRide ||= []).push({ tick, segment: s, ms: round(ms, 10), programs: compiled });
                if (game.graphics.stats.envBakes !== bakes) (out.bakeFrames ||= []).push({ tick, segment: s, ms: round(ms, 10) });
                frames.push(ms);
                if (ms > 16 && tick > 30) (out.slowFrames ||= []).push({ tick, segment: s, ms: round(ms, 10), headlight: !!(game.vehicle.headlight && game.vehicle.headlight.visible), weather: game.weatherSystem ? game.weatherSystem.weatherType || null : null });
                // The frame on which a section's first step became drawn
                for (; revealed < stats.revealed.length; revealed++) {
                    const { section } = stats.revealed[revealed];
                    if (firstVisible[section] === undefined) firstVisible[section] = round(ms, 10);
                }
            }
            if (game.vehicle.crashed) {
                out.crashes++;
                out.crashSegment = s;
                break;
            }
            if (game.finished) {
                out.finished = true;
                break;
            }
        }
        Object.assign(out, {
            syncBuildsAfterStart: stats.syncBuilds - syncAtStart,
            maxStepMs: round(stats.maxStepMs, 10),
            slowestStep: stats.slowest,
            stepMs: stats.stepMs,
            sectionsBuilt: stats.built,
            sectionsDisposed: stats.disposed,
            sections: env.sections.length,
            oncomingEncounters: game.traffic ? game.traffic.oncomingEncounters : null,
            conesPlaced: game.cones ? game.cones.placedTotal || 0 : null,
            km: round((env.endSegment + 1) * 20 / 1000, 10)
        });
        if (out.conesPlaced !== null) out.conesPerKm = round(out.conesPlaced / out.km, 100);
        if (gpu) {
            const settled = frames.slice(30);
            out.meanFrameMs = round(settled.reduce((a, b) => a + b, 0) / Math.max(1, settled.length), 100);
            out.maxFrameMs = round(Math.max(...settled), 10);
            out.framesOver16ms = settled.filter(ms => ms > 16).length;
            out.firstVisibleFrameMs = firstVisible;
        }
        return out;
    };

    // PW10: the menu preview of a leg, opened through the real menu call
    P.preview = legIndex => {
        game.startTrackPreview(legIndex);
        const env = game.previewEnv;
        game.scene.updateMatrixWorld(true);
        return {
            converted: !!env.sections,
            sectionsBuilt: env.sections ? env.sections.filter(section => section.state === 'built').map(section => section.index) : null,
            ...P.countDrawn()
        };
    };

    // PW16: the leg ridden to the finish; the best time and splits read back
    // through the game's own keys
    P.finish = (legIndex, speed = 25) => {
        const leg = game.tourSystem.legs[legIndex];
        const id = leg.id;
        window.__reseed(1);
        twistyDev.start(id);
        twistyDev.freeze();
        game.rockfalls = null;
        twistyDev.autopilot({ speed });
        const cap = Math.ceil((leg.endSegment - leg.startSegment + 1) * 20 / speed * 60 * 1.5);
        for (let tick = 1; tick <= cap && !game.finished && !game.vehicle.crashed; tick++) twistyDev.step(1);
        const current = game.tourSystem.legs[legIndex];
        const stored = localStorage.getItem(game.bestTimeKey(current));
        const gates = game.environment.checkpoints.length;
        const splits = RaceTiming.loadSplits(localStorage, game.bestSplitsKey(current), gates);
        return {
            finished: game.finished === true,
            crashed: game.vehicle.crashed,
            boardId: TourSystem.boardId(current),
            gates,
            bestTimeStored: stored !== null,
            bestTimeMs: stored === null ? null : Math.round(parseFloat(stored) * 1000),
            finishTimeMs: Math.round(game.finishTime),
            lastGateMs: game.checkpointTimes[gates - 1],
            splitsStored: splits ? splits.length : 0,
            finishLine: game.environment.finishGate.segmentIndex,
            lastGate: game.environment.checkpoints[gates - 1].segmentIndex
        };
    };

    // PW4: the built facts of each part, measured from the scene at the part's
    // middle: ground colour (G), trees per segment (T), side shape (S), floor
    // (F), buildings (B), road height change (H), and the part's landmark
    P.course = async (legIndex, { gpu = false } = {}) => {
        const { env } = startConverted(legIndex);
        game.rockfalls = null;
        if (game.traffic) {
            game.traffic.reset();
            game.traffic = null;
        }
        const parts = env.terrain.parts;
        const path = env.roadPath;
        const ray = new THREE.Raycaster();
        const lateralOf = (s, x, z) => {
            const p = path[s];
            return (x - p.x) * Math.cos(p.heading) - (z - p.z) * Math.sin(p.heading);
        };
        const ground = () => {
            const list = [];
            game.scene.traverse(o => { if (o.isMesh && o.userData.part === 'ground' && o.userData.type !== 'terrain' && drawn(o)) list.push(o); });
            return list;
        };
        const solid = () => {
            const list = [];
            game.scene.traverse(o => { if (o.isMesh && drawn(o) && !o.userData.isSky && o.userData.part !== 'floor') list.push(o); });
            return list;
        };
        const out = [];
        for (const [n, part] of parts.entries()) {
            const to = n === parts.length - 1 ? env.endSegment + 1 : part.to;
            const mid = Math.floor((part.from + to) / 2);
            twistyDev.teleport(mid);
            env.update(mid, 1e9, null);
            await Promise.all(env.sections.map(entry => entry.dressing).filter(Boolean));
            if (game.atmosphereTrack) game.snapAtmosphere(game.atmosphereTrack, mid, { environment: env, weatherSystem: game.weatherSystem || null });
            game.scene.updateMatrixWorld(true);
            const from = mid - 10;
            const end = mid + 10;
            // G: mean vertex colour of the drawn ribbons between lateral 10 and 40
            const sum = [0, 0, 0];
            let count = 0;
            game.scene.traverse(o => {
                if (!o.isMesh || o.userData.firstColumn === undefined || !drawn(o)) return;
                const pos = o.geometry.attributes.position;
                const col = o.geometry.attributes.color;
                const rows = Terrain.ROWS + 1;
                for (let v = 0; v < pos.count; v++) {
                    const s = Math.floor((o.userData.firstColumn + Math.floor(v / rows)) / Terrain.COLUMNS_PER_SEGMENT);
                    if (s < from || s >= end) continue;
                    const d = Math.abs(lateralOf(s, pos.getX(v), pos.getZ(v)));
                    if (d < 10 || d > 40) continue;
                    sum[0] += col.getX(v); sum[1] += col.getY(v); sum[2] += col.getZ(v);
                    count++;
                }
            });
            const G = sum.map(v => round(v / Math.max(1, count) * 255, 10));
            // T: tree instances per segment (procedural or modelled forest meshes)
            let trees = 0;
            const m = new THREE.Matrix4();
            game.scene.traverse(o => {
                if (!o.isInstancedMesh || !/^forest-/.test(o.name) || !drawn(o)) return;
                for (let i = 0; i < o.count; i++) {
                    o.getMatrixAt(i, m);
                    const s = Terrain.locate(path, m.elements[12], m.elements[14], Math.max(0, from - 8), Math.min(path.length - 1, end + 8), {}).index;
                    if (s >= from && s < end) trees++;
                }
            });
            const T = round(trees / 20, 100);
            // S: the ground at lateral 40 against the road, each side; roofed when a ray up hits within 8 m
            const meshes = ground();
            const all = solid();
            const p = path[mid];
            const S = [-1, 1].map(sign => {
                ray.set(new THREE.Vector3(p.x, p.y + 1.5, p.z), new THREE.Vector3(0, 1, 0));
                ray.far = 8;
                if (ray.intersectObjects(all, true).length) return 'roofed';
                ray.far = Infinity;
                const x = p.x + Math.cos(p.heading) * 40 * sign;
                const z = p.z - Math.sin(p.heading) * 40 * sign;
                ray.set(new THREE.Vector3(x, 3000, z), new THREE.Vector3(0, -1, 0));
                const hit = ray.intersectObjects(meshes, false)[0];
                const rise = hit ? hit.point.y - p.y : -Infinity;
                return rise > 3 ? 'up' : rise < -3 ? 'down' : 'level';
            });
            // F: the plane floor drawn under the part, or a river mesh in it
            let F = 'none';
            (env.floors || []).forEach(entry => { if (entry.mesh.visible && entry.parts.includes(n)) F = entry.floor.kind; });
            if (F === 'none') {
                game.scene.traverse(o => {
                    if (o.isMesh && o.name === 'floor-river' && drawn(o)) {
                        const a = o.geometry.attributes.position;
                        for (let v = 0; v < a.count; v += 2) {
                            const s = Terrain.locate(path, a.getX(v), a.getZ(v), Math.max(0, from - 30), Math.min(path.length - 1, end + 30), {}).index;
                            if (s >= from && s < end) { F = 'river'; break; }
                        }
                    }
                });
            }
            // B: buildings inside the part
            let B = 0;
            game.scene.traverse(o => {
                const count = o.userData.buildings || (o.userData.building ? (o.isInstancedMesh ? o.count : 1) : 0);
                if (!count || !drawn(o)) return;
                // A set piece group stands at the middle of its span
                const s = o.userData.span ? Math.floor((o.userData.span.from + o.userData.span.to) / 2) : segmentOf(env, ...(() => { const at = new THREE.Vector3(); o.getWorldPosition(at); return [at.x, at.z]; })());
                if (s >= part.from && s < to) B += count;
            });
            const H = round(path[Math.min(to, path.length - 1)].y - path[part.from].y, 10);
            // The landmark: its meshes, drawn, and where it stands against the road
            const group = game.scene.getObjectByName(`landmark-${part.id}`);
            let landmark = null;
            if (group) {
                let triangles = 0;
                group.traverse(o => {
                    if (!o.isMesh) return;
                    const index = o.geometry.index;
                    triangles += (index ? index.count : o.geometry.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1);
                });
                let shown = true;
                for (let node = group; node; node = node.parent) if (!node.visible) shown = false;
                const box = new THREE.Box3().setFromObject(group);
                const centre = box.getCenter(new THREE.Vector3());
                const s = segmentOf(env, centre.x, centre.z);
                const road = path[s];
                landmark = { triangles: Math.round(triangles), visible: shown, segment: s, inside: s >= part.from && s < to, metres: round(Math.hypot(centre.x - road.x, centre.z - road.z), 10) };
            }
            const row = { id: part.id, from: part.from, to, mid, differs: part.differs || [], G, T, S, F, B, H, landmark };
            if (gpu) {
                twistyDev.view(0, 3, 12, 40);
                game.graphics.render(game.scene, game.camera);
                const canvas = game.graphics.renderer.domElement;
                const probe = document.createElement('canvas');
                probe.width = 48; probe.height = 27;
                const c2 = probe.getContext('2d');
                c2.drawImage(canvas, 0, 0, 48, 27);
                const data = c2.getImageData(0, 0, 48, 27).data;
                const rgb = [0, 0, 0];
                for (let i = 0; i < data.length; i += 4) { rgb[0] += data[i]; rgb[1] += data[i + 1]; rgb[2] += data[i + 2]; }
                row.frameRGB = rgb.map(v => round(v / (data.length / 4), 10));
                row.look = { timeOfDay: part.timeOfDay, weather: part.weather || 'clear', fog: (part.look || {}).fogDensity };
            }
            out.push(row);
        }
        return { parts: out };
    };

    // PW4(c): every part takes part 0's ground, dressing and look
    P.flattenParts = legIndex => {
        const id = game.tourSystem.legs[legIndex].id;
        const course = Course.LEGS[id];
        const first = course.parts[0];
        Course.LEGS[id] = { ...course, parts: course.parts.map(part => ({ ...part, profile: first.profile, dressing: first.dressing, look: first.look, floor: first.floor, render: first.render, timeOfDay: first.timeOfDay, weather: first.weather, setPieces: [] })) };
        Terrain.adopt(Course.LEGS);
        return true;
    };
}

// ---------------------------------------------------------------- probes
async function runPool(browser, port, ids, work) {
    const results = {};
    const queue = [...ids];
    // A fresh page per leg, so no leg inherits another's scene, preview or stubs
    const worker = async () => {
        while (queue.length) {
            const id = queue.shift();
            const page = await openGame(browser, port);
            results[id] = await work(page, LEG_IDS.indexOf(id), id);
            await page.close();
        }
    };
    await Promise.all(Array.from({ length: Math.min(jobs, ids.length) }, worker));
    return results;
}

const inPage = (page, name, ...args) => page.evaluate((n, a) => window.__probe[n](...a), name, args);

const PROBES = {
    // A whole leg ridden to the finish and the name form filled in, against a server answered locally
    submit: async (page, index) => {
        const info = await page.evaluate(i => {
            const leg = game.tourSystem.legs[i];
            return { id: leg.id, boardId: TourSystem.boardId(leg), row: Course.boardTable()[TourSystem.boardId(leg)] || null, last: i === game.tourSystem.legs.length - 1 };
        }, index);
        // --fixture: leg 1 is the 3-gate fixture board; the default reply is an old server (no fields), --reply new states
        // protocol and gates, --reply names adds the name limit a server with the 1 to 5 character rule states
        const reply = { sessionId: 'probe-session', sessionToken: 'probe-token-not-a-secret' };
        const replyMode = option('reply');
        if (info.row && (replyMode === 'new' || replyMode === 'names')) Object.assign(reply, { protocol: 2, gates: info.row.gates });
        if (replyMode === 'names') reply.nameMax = 5;
        const typedName = option('name') || 'TEST';
        const calls = { reply };
        page.callables = calls;
        const errors = [];
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
        if (option('mutate') === 'ready-always') {
            // The handshake always agrees with whatever the server said
            await page.evaluate(expected => {
                const service = game.leaderboardService;
                const start = service.startRun.bind(service);
                service.startRun = legId => start(legId, expected);
            }, { protocol: reply.protocol ?? 1, gates: reply.gates ?? 5 });
        }
        if (option('mutate') === 'names-always') {
            // The form and the service take 1 to 5 characters whatever the server said
            await page.evaluate(() => { game.leaderboardService.nameRule = () => ({ min: 1, max: 5 }); });
        }
        await page.evaluate(i => { window.__legIndex = i; }, index);
        const ridden = await page.evaluate(async () => {
            const wait = async (done, ms) => {
                for (let t = 0; t < ms / 50 && !done(); t++) await new Promise(r => setTimeout(r, 50));
                return done();
            };
            window.__reseed(1);
            twistyDev.start(game.tourSystem.legs[window.__legIndex].id);
            twistyDev.freeze();
            game.rockfalls = null;
            const service = game.leaderboardService;
            await wait(() => service.isActive() || service.unsupported, 5000);
            twistyDev.autopilot({ speed: 20 });
            // A long leg needs more ticks than the 9000 of a short one
            const leg = game.tourSystem.legs[window.__legIndex];
            const cap = Math.max(9000, Math.ceil((leg.endSegment - leg.startSegment + 1) * 20 / 20 * 60 * 1.5));
            for (let tick = 1; tick <= cap && !game.finished && !game.vehicle.crashed; tick++) twistyDev.step(1);
            await service.recordQueue;
            return { finished: game.finished, crashed: game.vehicle.crashed, unsupported: service.unsupported };
        }).catch(error => ({ error: String(error) }));
        // Counted before "next leg" starts the following leg's own session
        const startRunCalls = (calls.startRun || []).length;
        let nameFormShown = false;
        let submitState = 'none';
        let form = null;
        if (ridden.finished && !info.last) {
            await page.evaluate(() => document.getElementById('nextLegBtn').click());
            nameFormShown = await page.waitForFunction("document.getElementById('leaderboardEntryOverlay').classList.contains('active')", { polling: 100, timeout: 2000 }).then(() => true, () => false);
            if (nameFormShown) {
                form = await page.evaluate(name => {
                    const input = document.getElementById('leaderboardNameInput');
                    input.value = name;
                    input.dispatchEvent(new Event('input'));
                    const button = document.getElementById('leaderboardSubmitBtn');
                    const disabled = button.disabled;
                    button.click();
                    return {
                        submitDisabled: disabled,
                        maxLength: input.maxLength,
                        placeholder: input.placeholder,
                        subtitle: document.querySelector('#leaderboardEntryForm .leaderboard-entry-subtitle').textContent,
                        clipped: input.scrollWidth > input.clientWidth
                    };
                }, typedName);
                if (form.submitDisabled) {
                    submitState = 'blocked';
                } else {
                    const done = await page.waitForFunction("document.getElementById('leaderboardResult').style.display === 'block' || document.getElementById('leaderboardError').style.display !== 'none'", { polling: 100, timeout: 5000 }).then(() => true, () => false);
                    submitState = done && await page.evaluate(() => document.getElementById('leaderboardResult').style.display === 'block') ? 'submitted' : 'failed';
                }
            } else if (ridden.unsupported) {
                submitState = 'not-submitted';
            }
        }
        const [submit] = calls.submitRun || [];
        return {
            finished: ridden.finished === true,
            startRunCalls,
            submitCalls: (calls.submitRun || []).length,
            submitState,
            nameFormShown,
            payload: submit ? { gates: submit.checkpointTimes.length, proofs: submit.proofChain.length, finish: submit.finishTime !== undefined, playerName: submit.playerName } : null,
            form,
            typedName,
            nameMax: reply.nameMax,
            consoleErrors: errors.filter(text => /Incomplete run|Failed to submit|No active/.test(text)).length,
            expectedGates: info.row ? info.row.gates : 5,
            tableBoard: !!info.row,
            replyFields: Object.keys(reply).filter(key => key === 'protocol' || key === 'gates'),
            forwarded: 0,
            skipped: info.last ? 'the last leg has no name form' : undefined,
            error: ridden.error
        };
    },
    // Converted legs (or the --fixture course on leg 1): parts, window, stream, preview, finish
    async course(page, i) {
        if (option('mutate') === 'flat-parts') await inPage(page, 'flattenParts', i);
        return inPage(page, 'course', i, { gpu: flag('gpu') });
    },
    window: (page, i) => inPage(page, 'window', i),
    stream: (page, i) => inPage(page, 'stream', i, { speed: Number(option('speed') || 45), gpu: flag('gpu'), traffic: flag('traffic'), cones: flag('cones'), rockfalls: flag('rockfalls') }),
    // A fresh page and no ride: the preview as the menu opens it
    preview: (page, i) => inPage(page, 'preview', i),
    finish: (page, i) => inPage(page, 'finish', i),
    // PR8: the gate pips on a phone, 360 x 640, for 5 to 20 gates
    async hudgates(page, i) {
        // A phone's width; isMobile would reload the page and lose the probe's scripts
        await page.setViewport({ width: 360, height: 640, deviceScaleFactor: 2 });
        return page.evaluate(async legIndex => {
            window.__reseed(1);
            twistyDev.start(game.tourSystem.legs[legIndex].id);
            twistyDev.freeze();
            const out = {};
            for (const total of [5, 14, 16, 20]) {
                game.hud.setGates(7 > total ? total : 7, total);
                // A frozen game has no animation frames: a timer lets the layout settle
                await new Promise(r => setTimeout(r, 80));
                const pips = document.getElementById('hudGatePips');
                const row = pips.getBoundingClientRect();
                const panel = pips.parentElement.getBoundingClientRect();
                const boxes = Array.from(pips.children).map(pip => pip.getBoundingClientRect());
                // The whole line the pips share: count, style score and combo, in the timer panel
                const combo = document.getElementById('comboDisplay');
                if (!combo.textContent) combo.textContent = 'COMBO x1';
                const meta = document.querySelector('.hud-meta');
                const timer = document.querySelector('.hud-timer');
                const items = Array.from(meta.children).filter(el => el.getBoundingClientRect().width > 0).map(el => el.getBoundingClientRect());
                const timerBox = timer.getBoundingClientRect();
                out[total] = {
                    timerLeft: Math.round(timerBox.left * 10) / 10,
                    timerRight: Math.round(timerBox.right * 10) / 10,
                    metaRows: new Set(items.map(b => Math.round(b.top))).size,
                    metaRight: Math.round(Math.max(...items.map(b => b.right)) * 10) / 10,
                    metaOverflow: meta.scrollWidth > meta.clientWidth + 1,
                    pips: pips.children.length,
                    on: pips.querySelectorAll('i.on').length,
                    count: document.getElementById('hudGateCount').textContent,
                    left: Math.round(row.left * 10) / 10,
                    right: Math.round(row.right * 10) / 10,
                    panelLeft: Math.round(panel.left * 10) / 10,
                    panelRight: Math.round(panel.right * 10) / 10,
                    rows: new Set(boxes.map(b => Math.round(b.top))).size,
                    lastPipRight: Math.round(Math.max(...boxes.map(b => b.right)) * 10) / 10,
                    pipWidth: Math.round(boxes[0].width * 10) / 10
                };
            }
            return { viewport: [innerWidth, innerHeight], gates: out };
        }, i);
    },
    legs: (page, i) => inPage(page, 'legCheck', i, 60),
    snapshot: (page, i) => inPage(page, 'snapshot', i),
    raycast: (page, i) => inPage(page, 'raycast', i),
    surface: (page, i) => inPage(page, 'surface', i),
    parts: (page, i) => inPage(page, 'parts', i),
    frames: (page, i) => inPage(page, 'frames', i),
    look: (page, i) => inPage(page, 'look', i),
    atmostate: (page, i) => inPage(page, 'atmostate', i),
    draws: (page, i) => inPage(page, 'draws', i),
    // The synthetic two-part track and its control (a snap at the boundary), on a fresh page each
    async atmo(page, i) {
        if (!flag('synthetic')) throw new Error('no leg has parts yet: run atmo with --synthetic');
        return inPage(page, 'atmo', i, false);
    },
    atmoControl: (page, i) => inPage(page, 'atmo', i, true),
    runoff: (page, i) => inPage(page, 'runoff', i),
    fog: (page, i) => inPage(page, 'fog', i),
    shortcuts: (page, i) => inPage(page, 'shortcuts', i),
    shortcutsControl: (page, i) => inPage(page, 'shortcutsControl', i),
    async gates(page, i) {
        const map = await inPage(page, 'gateMap', i);
        const approaches = [];
        // Laterals for the approach runs (U6): 0, +6, +9, driven by the autopilot lane, never coasting
        for (const gate of ['cp0', 'finish']) {
            for (const lane of [0, 6, 9]) approaches.push(await inPage(page, 'approach', i, gate, lane));
        }
        return { map, approaches };
    },
    async traj(page, i) {
        // The autopilot may not finish a tight leg at 25 m/s; fall back to a slower speed and record which one rode
        let last;
        for (const speed of [25, 20, 15]) {
            const runs = [await inPage(page, 'ride', i, speed), await inPage(page, 'ride', i, speed)];
            last = { ...runs[0], repeatable: JSON.stringify(runs[0]) === JSON.stringify(runs[1]) };
            if (last.finishTick !== null) break;
        }
        return last;
    },
    async budget(page, i) {
        // A converted leg is counted per drawn window, with the leg's modelled assets: the peak is what is drawn at once
        if (await page.evaluate(n => !!Course.forLeg(game.tourSystem.legs[n].id), i)) {
            const window = await inPage(page, 'window', i);
            const snap = await inPage(page, 'snapshot', i, true);
            return { windowed: true, peak: window.peak, windows: window.windows.length, ...(snap.assets && { assets: snap.assets }), buildMs: snap.buildMs };
        }
        const snap = await inPage(page, 'snapshot', i, true);
        // Solid boulders are collision work on every tick, so they count against the budget with the meshes
        return { ...snap.counts, solidBoulders: snap.boulders.filter(b => b[4] === true).length, ...(snap.assets && { assets: snap.assets }), buildMs: snap.buildMs };
    },
    frametime: (page, i) => inPage(page, 'frametime', i),
    scene: (page, i) => inPage(page, 'scene', i),
    async mutate(page, i) {
        const clean = (await inPage(page, 'snapshot', i)).fingerprints;
        const moved = await inPage(page, 'mutate', i, 0.5);
        return { clean, moved, differs: Object.keys(clean).every(mode => clean[mode].hash !== moved[mode].hash) };
    }
};
// `traj` and `look` start legs; everything else builds environments alone

async function pagesProbe(browser, port) {
    const pages = readdirHtml();
    const out = {};
    for (const name of pages) {
        const before = state.pageErrors.length;
        const page = await openPage(browser, port, `/${name}`);
        await new Promise(done => setTimeout(done, 3000));
        out[name] = {
            pageErrors: state.pageErrors.slice(before).map(e => e.replace(/^[^:]+: /, '')),
            definesEnvironment: await page.evaluate(() => typeof Environment === 'function'),
            definesTerrain: await page.evaluate(() => typeof Terrain !== 'undefined')
        };
        await page.close();
    }
    return out;
}
const readdirHtml = () => execFileSync('git', ['ls-files', '*.html'], { cwd: root, encoding: 'utf8' }).split('\n').filter(f => f && f !== 'index.html' && !f.includes('/'));

// ---------------------------------------------------------------- baseline handling
const strip = value => JSON.parse(JSON.stringify(value, (key, v) => (key === 'buildMs' ? undefined : v)));
const same = (a, b) => JSON.stringify(strip(a)) === JSON.stringify(strip(b));

// tests/golden/amendments.json, read once: the legs released from the frozen golden and,
// per bound leg, its amended stable fingerprint and each declared field with its expected value
function readAmendments() {
    const raw = readJson(AMENDMENTS) || {};
    const { released, pages, ...legs } = raw;
    return { released: new Set(released?.legs || []), releasedReason: released?.reason || '', pages: pages || {}, legs };
}
const amendedStable = (amend, stable) => !!stable && stable.hash === amend.stable.hash && stable.meshes === amend.stable.meshes;
function resolvePath(value, keys) {
    let at = value;
    for (const key of keys) {
        if (at === null || typeof at !== 'object' || !(key in at)) return { found: false };
        at = at[key];
    }
    return { found: true, value: at };
}
function assignPath(value, keys, replacement) {
    if (!keys.length) return replacement;
    const last = keys[keys.length - 1];
    keys.slice(0, -1).reduce((o, k) => o[k], value)[last] = replacement;
    return value;
}

// Rendered tiles carry sub-level noise between page loads (film grain, GPU rounding), so frames
// are equal when every tile channel is within one level of 255; everything else is exact
function sectionEqual(section, stored, fresh) {
    // treeTypes and rockFrequency were dead config (read nowhere) removed in phase 0c
    if (section === 'look') {
        const live = ({ treeTypes, rockFrequency, ...config }) => config;
        const view = ({ ride, preview }) => ({ ride: { ...ride, config: live(ride.config) }, preview: preview.error ? preview : { ...preview, config: live(preview.config) } });
        return same(view(stored), view(fresh));
    }
    if (section !== 'frames') return same(stored, fresh);
    return stored.length === fresh.length && stored.every((pose, i) => pose.segment === fresh[i].segment
        && JSON.stringify(pose.view) === JSON.stringify(fresh[i].view)
        && pose.tiles.every((tile, t) => tile.every((c, k) => Math.abs(c - fresh[i].tiles[t][k]) <= 1)));
}

function diffAgainst(stored, fresh, label) {
    const failures = [];
    for (const id of Object.keys(fresh)) {
        if (!stored?.[id]) { failures.push(`${label} ${id}: not in baseline`); continue; }
        for (const section of Object.keys(fresh[id])) {
            if (stored[id][section] !== undefined && !sectionEqual(section, stored[id][section], fresh[id][section])) failures.push(`${label} ${id}.${section} differs`);
        }
    }
    return failures;
}

// ---------------------------------------------------------------- main
async function main() {
    if (command === 'record-jest') {
        const game = loadGame();
        const captured = { provenance: provenance(), legs: LEG_IDS.map((_, i) => captureLeg(game, i)) };
        if (existsSync(JEST_GOLDEN)) fail(2, `${JEST_GOLDEN} exists; the jest golden is frozen`);
        writeJson(JEST_GOLDEN, captured);
        console.log(JSON.stringify({ wrote: JEST_GOLDEN, provenance: captured.provenance }));
        return;
    }
    if (command === 'baseline-diff') {
        const against = option('against') || 'HEAD';
        const out = {};
        for (const [file, name] of [[FROZEN, 'browser-baseline.json'], [PARTS, 'parts-baseline.json']]) {
            const old = JSON.parse(git('show', `${against}:tests/golden/${name}`) || 'null');
            const now = readJson(file);
            out[name] = Object.keys(now || {}).filter(id => LEG_IDS.includes(id)).flatMap(id => Object.keys(now[id]).filter(section => !same(old?.[id]?.[section], now[id][section])).map(section => `${id}.${section}`));
        }
        console.log(JSON.stringify(out, null, 1));
        return;
    }
    if (probes.some(name => WORLD_PROBES.includes(name))) return worldMain();
    if (!probes.length) fail(2, 'Name a probe: legs snapshot raycast surface parts frames traj gates look shortcuts runoff fog pages budget mutate atmostate draws atmo | record-jest | record-frozen | baseline-diff');

    const executablePath = chromePath();
    const gpu = flag('gpu');
    const server = await startServer();
    const port = server.address().port;
    const args = gpu ? [] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
    const launch = () => puppeteer.launch({ protocolTimeout: 900000, executablePath, headless: 'new', args: ['--no-sandbox', ...args] });
    // A fresh browser for each probe: a long run of game pages can exhaust one Chrome
    const withBrowser = async work => {
        const browser = await launch();
        try {
            return await work(browser);
        } finally {
            await browser.close();
        }
    };
    const report = { chrome: executablePath, renderer: null, mode: gpu ? 'gpu' : 'headless', port, blocked: state.blocked, notFound: state.notFound, pageErrors: state.pageErrors, results: {}, failures: [], notes: [] };
    let exit = 0;
    try {
        report.renderer = await withBrowser(async browser => {
            const probe = await openGame(browser, port);
            return probe.evaluate(() => {
                const gl = document.createElement('canvas').getContext('webgl');
                const info = gl && gl.getExtension('WEBGL_debug_renderer_info');
                return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unknown';
            });
        });
        if (gpu && /SwiftShader|llvmpipe/i.test(report.renderer)) {
            report.failures.push(`--gpu has no hardware renderer: ${report.renderer}`);
            exit = 3;
        } else {
            // Writing to the mutable file re-runs every frozen section first, as the guard
            const guarded = flag('add') || flag('update-baseline') ? FROZEN_SECTIONS : [];
            const sections = [...new Set([...guarded, ...probes.flatMap(name => (name === 'record-frozen' ? [...FROZEN_SECTIONS, 'pages'] : name === 'shortcuts' ? [name, 'shortcutsControl'] : name === 'atmo' ? [name, 'atmoControl'] : [name]))])];
            for (const name of sections) {
                if (name === 'pages') {
                    report.results.pages = await withBrowser(browser => pagesProbe(browser, port));
                } else if (PROBES[name]) {
                    report.results[name] = await withBrowser(browser => runPool(browser, port, probeLegIds(name), (page, i, id) => PROBES[name](page, i, id)));
                } else {
                    report.failures.push(`unknown probe ${name}`);
                }
            }
            finishChecks(report);
        }
    } catch (error) {
        report.failures.push(String(error.stack || error));
        exit = exit || 2;
    } finally {
        server.close();
    }
    if (state.injected) report.notes.push('js/sceneassets.js was injected: index.html does not load it');
    report.failures.length && (exit = exit || 1);
    console.log(JSON.stringify(report, null, 1));
    process.exit(exit);
}

// Per-probe expectations, then baseline comparison and writes
function finishChecks(report) {
    const { results, failures, notes } = report;
    if (results.legs) {
        Object.entries(results.legs).forEach(([id, r]) => {
            if (!r.vehicle) failures.push(`${id}: no vehicle after start`);
            if (r.floatingObjects) failures.push(`${id}: FLOATING OBJECTS`);
            if (r.terrainRoadOverlap) failures.push(`${id}: TERRAIN-ROAD OVERLAP`);
        });
    }
    if (results.scene) {
        Object.entries(results.scene).forEach(([id, r]) => {
            const pin = SCENE_PINS[id];
            if (!pin) return;
            const got = [r.digest, r.meshes, r.instances, r.cones, r.dressed];
            if (JSON.stringify(got) !== JSON.stringify(pin)) failures.push(`${id}: scene ${JSON.stringify(got)} differs from the pin ${JSON.stringify(pin)}`);
        });
    }
    if (results.submit) {
        Object.entries(results.submit).forEach(([id, r]) => {
            if (r.skipped) return notes.push(`${id}: submit not run: ${r.skipped}`);
            if (r.error) return failures.push(`${id}: submit probe error: ${r.error}`);
            if (!r.finished) failures.push(`${id}: the autopilot did not finish the leg`);
            // A mutation on a leg that is not a table board has no guard to defeat; a green run would prove nothing
            if (option('mutate') === 'ready-always' && !r.tableBoard) failures.push(`${id}: --mutate ready-always needs a table board; this leg has no guard to defeat`);
            // A board in the table is submitted only to a server that states its gate count
            const accepted = !r.tableBoard || r.replyFields.length === 2;
            // The name limit is the server's: 1 to nameMax when stated, exactly 4 when not
            const nameOk = r.nameMax ? r.typedName.trim().length >= 1 && r.typedName.trim().length <= r.nameMax : r.typedName.trim().length === 4;
            const expectedCalls = accepted && nameOk ? 1 : 0;
            if (r.startRunCalls !== 1) failures.push(`${id}: startRunCalls: ${r.startRunCalls}, expected 1`);
            if (r.submitCalls !== expectedCalls) failures.push(`${id}: submitCalls: ${r.submitCalls}, expected ${expectedCalls}`);
            if (accepted && r.payload && (r.payload.gates !== r.expectedGates || r.payload.proofs !== r.expectedGates)) failures.push(`${id}: payload ${JSON.stringify(r.payload)}, expected ${r.expectedGates} times and proofs`);
            if (accepted && r.nameFormShown && nameOk && r.submitState !== 'submitted') failures.push(`${id}: submitState ${r.submitState}, expected submitted`);
            if (accepted && r.nameFormShown && !nameOk && (r.submitState !== 'blocked' || r.submitCalls !== 0)) failures.push(`${id}: name ${JSON.stringify(r.typedName)} gave submitState ${r.submitState} with ${r.submitCalls} submitRun calls, expected blocked and 0`);
            if (r.form) {
                const limit = r.nameMax || 4;
                const letters = r.nameMax ? `1-${r.nameMax} letters` : '4 letters';
                if (r.submitState === 'submitted' && r.payload.playerName !== r.typedName.trim().toUpperCase()) failures.push(`${id}: payload playerName ${JSON.stringify(r.payload.playerName)}, expected ${JSON.stringify(r.typedName.trim().toUpperCase())}`);
                if (r.form.maxLength !== limit || r.form.placeholder !== '_'.repeat(limit) || r.form.subtitle !== `Enter your name (${letters})`) failures.push(`${id}: form shows ${JSON.stringify(r.form)}, expected maxLength ${limit} and "${letters}"`);
                if (r.form.clipped) failures.push(`${id}: the name input clips a letter`);
            }
            if (!accepted && (r.submitState !== 'not-submitted' || r.nameFormShown)) failures.push(`${id}: submitState ${r.submitState} with nameFormShown ${r.nameFormShown}, expected not-submitted and no form`);
            if (r.consoleErrors) failures.push(`${id}: ${r.consoleErrors} console errors from the submit path`);
        });
    }
    longLegChecks(report);
    if (results.hudgates) {
        Object.entries(results.hudgates).forEach(([id, r]) => {
            Object.entries(r.gates).forEach(([total, g]) => {
                const width = r.viewport[0];
                const fits = g.pips === Number(total) && g.left >= 0 && g.right <= width && g.lastPipRight <= width && g.panelLeft >= 0 && g.panelRight <= width && g.rows === 1
                    && g.timerLeft >= 0 && g.timerRight <= width && g.metaRight <= g.timerRight && !g.metaOverflow;
                if (!fits) failures.push(`${id}: ${total} gates on a ${r.viewport[0]} px phone: ${JSON.stringify(g)}`);
            });
        });
    }
    if (results.surface) {
        // Hard expectations, and only these (U5): the road centre and the ledge edge. Every other
        // lateral is recorded as found; beyond the wall top groundYAt describes ground that is not drawn.
        Object.entries(results.surface).forEach(([id, r]) => {
            const edge = r.roadWidth / 2 + 1;
            r.rays.forEach(([segment, lateral, hitY, delta, part, roadY]) => {
                if (lateral === 0 && !(part === 'ground' && Math.abs(hitY - roadY) <= 0.01)) failures.push(`${id}: segment ${segment} lateral 0 does not hit ground at road height (hit ${hitY}, road ${roadY})`);
                if (Math.abs(lateral) === edge && !(part === 'ground' && Math.abs(delta) <= 0.15)) failures.push(`${id}: segment ${segment} lateral ${lateral} does not hit ground within 0.15 (delta ${delta})`);
            });
        });
    }
    const amendments = readAmendments();
    if (results.snapshot) {
        // A leg whose stable fingerprint moves only by declared meshes is bound to the
        // golden's own fingerprint with those meshes left out, not to the golden itself
        Object.entries(results.snapshot).forEach(([id, r]) => {
            const amended = amendments.legs[id];
            if (!amended?.stable) return;
            const stable = r.fingerprints.stable;
            if (amendedStable(amended, stable)) {
                notes.push(`${id}: stable ${stable.hash}/${stable.meshes} is the amended value for the golden ${amended.goldenStable.hash}/${amended.goldenStable.meshes} (amendments.json: its reason lists the declared meshes)`);
            } else {
                failures.push(`${id}: stable ${stable.hash}/${stable.meshes} is neither the golden nor the amended ${amended.stable.hash}/${amended.stable.meshes}`);
            }
        });
    }
    if (results.runoff) {
        // The placed run starts out on the run-off, so the 6 s clock is exact; the driven run
        // is the autopilot steering out from the centre line, which only starts the clock at the edge
        Object.entries(results.runoff).forEach(([id, r]) => {
            const { placed } = r;
            if (placed[3].crashed || placed[3].offRoadTime < 2 || placed[3].offRoadTime > 3.2) failures.push(`${id}: placed at lateral 14, 3 s: crashed ${placed[3].crashed}, offRoadTime ${placed[3].offRoadTime}`);
            if (!placed[7].crashed || placed.offRoadLines !== 1) failures.push(`${id}: placed at lateral 14, 7 s: not crashed once for the clock (${placed.offRoadLines} lines)`);
            if (placed[10].speed >= 0.5) failures.push(`${id}: placed at lateral 14, 10 s: speed ${placed[10].speed}`);
        });
    }
    if (results.atmostate) {
        // The pinned values of the plan's PR23 arms; the dump is also compared whole against a base tree by hand
        Object.entries(results.atmostate).forEach(([id, r]) => {
            const fail = text => failures.push(`${id}: atmostate ${text}`);
            const weather = r.weather || 'clear';
            const own = r.times[Object.keys(r.times)[0]];
            const sun = { rain: 0.25, snow: 0.25, fog: 0.6 }[weather] ?? 1;
            const hemisphere = { rain: 1.35, snow: 1.35, fog: 1.15 }[weather] ?? 1;
            const road = { rain: [0.85 * (1 - r.weatherIntensity) + 0.2 * r.weatherIntensity, 0.12 * r.weatherIntensity, 0.3 + 1.9 * r.weatherIntensity], snow: [0.32, 0.08, 1.2] }[weather] || [0.85, 0, 0.3];
            [['preview', r.preview], ['previewAfterRide', r.previewAfterRide]].forEach(([name, dump]) => {
                if (dump.weatherType !== weather) fail(`${name}.weatherType ${dump.weatherType}, want ${weather}`);
                if (dump.directional.intensity / own.sunIntensity !== sun) fail(`${name} sun ratio ${dump.directional.intensity / own.sunIntensity}, want ${sun}`);
                if (dump.hemisphere.intensity / own.hemisphereIntensity !== hemisphere) fail(`${name} hemisphere ratio ${dump.hemisphere.intensity / own.hemisphereIntensity}, want ${hemisphere}`);
                if (JSON.stringify([dump.road.roughness, dump.road.metalness, dump.road.envMapIntensity]) !== JSON.stringify(road)) fail(`${name} road ${[dump.road.roughness, dump.road.metalness, dump.road.envMapIntensity]}, want ${road}`);
                if (dump.fogDensity !== r.expectedFogDensity) fail(`${name} fog density ${dump.fogDensity}, want the leg's look ${r.expectedFogDensity}`);
            });
            if (id === 'mountain-dawn' && (r.preview.ringStrength !== 0.15 || r.preview.sky.uMountains !== 0.15)) fail(`preview ring ${r.preview.ringStrength}, want 0.15`);
            if (r.showcase) {
                const s = r.showcase;
                const golden = r.times.golden;
                const ok = s.timeKey === 'golden' && s.weatherType === 'clear' && s.ringStrength === 1 && s.sky.uMountains === 1 && s.atmosphere === null
                    && s.fogDensity === 0.0018 && s.fogColor === golden.fogColor && s.directional.intensity === golden.sunIntensity && s.hemisphere.intensity === golden.hemisphereIntensity;
                if (!ok) fail('showcase is not the clear golden look');
            }
            if (r.timeOverride) {
                const night = id === 'storm-valley';
                const key = night ? 'night' : 'golden';
                const cfg = r.times[key];
                [r.timeOverride.first, r.timeOverride.after60].forEach((dump, n) => {
                    if (dump.timeKey !== key) fail(`timeOverride[${n}] timeKey ${dump.timeKey}`);
                    if (dump.weatherType !== weather) fail(`timeOverride[${n}] lost the weather: ${dump.weatherType}`);
                    if (dump.directional.intensity !== cfg.sunIntensity) fail(`timeOverride[${n}] sun ${dump.directional.intensity}, want ${cfg.sunIntensity}`);
                    if (night && dump.sky.uMoon !== 1) fail(`timeOverride[${n}] uMoon ${dump.sky.uMoon}`);
                    if (dump.headlightVisible !== cfg.headlight > 0) fail(`timeOverride[${n}] headlight ${dump.headlightVisible}`);
                });
                if (JSON.stringify(r.timeOverride.first) !== JSON.stringify(r.timeOverride.after60)) fail('timeOverride changed in 60 frames');
            }
        });
    }
    if (results.atmo) {
        // PR10, PR12: the blend moves the picture without a cut; the particles are the buffer made at leg start
        Object.entries(results.atmo).forEach(([id, r]) => {
            const control = results.atmoControl && results.atmoControl[id];
            if (!(r.totalChange >= 30)) failures.push(`${id}: atmo totalChange ${r.totalChange}, want >= 30`);
            if (!(r.maxFrameStep <= 0.1 * r.totalChange)) failures.push(`${id}: atmo maxFrameStep ${r.maxFrameStep} over a tenth of ${r.totalChange}`);
            if (control && !(control.maxFrameStep > 0.5 * control.totalChange)) failures.push(`${id}: atmo control did not cut (${control.maxFrameStep} of ${control.totalChange})`);
            if (!r.rainBufferSame) failures.push(`${id}: atmo reallocated the rain buffer`);
            const inside = r.gripAt.filter(point => point.t > 0.2 && point.t < 0.8);
            if (!inside.length || inside.some(point => !(point.lateralFriction < 1 && point.lateralFriction > 0.73))) failures.push(`${id}: atmo grip inside the blend is not between clear and rain`);
        });
    }
    if (results.fog) {
        Object.entries(results.fog).forEach(([id, views]) => Object.entries(views).forEach(([name, r]) => {
            if (r.nearMax !== null && r.nearMax >= 2) failures.push(`${id}: fog changes the near road by ${r.nearMax}/255 in view ${name}`);
            if (r.farMean !== null && r.farMean < 8) failures.push(`${id}: fog changes far ground by only ${r.farMean}/255 in view ${name}`);
        }));
    }
    if (results.shortcutsControl) {
        // Without this the all-empty answer on the real legs could mean a probe that cannot see
        Object.entries(results.shortcutsControl).forEach(([id, open]) => { if (!open.length) failures.push(`${id}: the shortcuts probe missed a chord it was built to find`); });
    }
    if (results.budget) {
        Object.entries(results.budget).forEach(([id, r]) => {
            if (r.windowed) {
                if (!(r.peak.solidBoulders <= SOLID_BOULDER_BUDGET)) failures.push(`${id}: ${r.peak.solidBoulders} solid boulders in a window, over ${SOLID_BOULDER_BUDGET}`);
                Object.entries(LEG_BUDGET).forEach(([key, most]) => { if (!(r.peak[key] <= most)) failures.push(`${id}: peak window ${r.peak[key]} ${key}, over ${most}`); });
                if (r.assets) checkAssets(id, r.assets, failures);
                return;
            }
            if (!(r.solidBoulders <= SOLID_BOULDER_BUDGET)) failures.push(`${id}: ${r.solidBoulders} solid boulders, over the budget of ${SOLID_BOULDER_BUDGET} per leg`);
            Object.entries(LEG_BUDGET).forEach(([key, most]) => { if (!(r[key] <= most)) failures.push(`${id}: ${r[key]} ${key}, over the budget of ${most} per leg`); });
            if (r.assets?.floating) failures.push(`${id}: ${r.assets.floating} modelled rocks float`);
            ['rocks', 'portals', 'rockFace', 'village'].forEach(part => { if (r.assets?.[part]?.error) failures.push(`${id}: modelled ${part} did not load: ${r.assets[part].error}`); });
            (r.assets?.trees?.errors || []).forEach(error => failures.push(`${id}: modelled trees did not load: ${error}`));
        });
    }
    if (results.mutate) {
        Object.entries(results.mutate).forEach(([id, r]) => { if (!r.differs) failures.push(`${id}: a 0.5 ground shift did not move every fingerprint mode`); });
    }
    if (results.frames) {
        Object.entries(results.frames).forEach(([id, poses]) => poses.forEach(p => { if (p.drift > 1) failures.push(`${id}: frame at ${p.segment} differs by ${p.drift}/255 between two captures`); }));
    }
    if (results.traj) {
        Object.entries(results.traj).forEach(([id, r]) => {
            if (!r.repeatable) failures.push(`${id}: two stepped rides differ`);
            if (r.finishTick === null) notes.push(`${id}: the autopilot did not finish (crashTick ${r.crashTick}, speed ${r.speed})`);
        });
    }

    const fresh = {};
    for (const [section, byLeg] of Object.entries(results)) {
        if (section === 'pages') continue;
        Object.entries(byLeg).forEach(([id, value]) => { (fresh[id] ||= {})[section] = value; });
    }

    const frozen = readJson(FROZEN);
    if (probes.includes('record-frozen') || flag('update-baseline') || flag('add')) writeBaselines(report, fresh, frozen);
    else if (frozen) {
        const comparable = {};
        Object.entries(fresh).forEach(([id, sections]) => {
            // A leg released from the golden (a new course, a new board) is compared with nothing
            if (amendments.released.has(id)) {
                notes.push(`${id}: released from the frozen golden (amendments.json): ${amendments.releasedReason}`);
                return;
            }
            comparable[id] = Object.fromEntries(Object.entries(sections).filter(([s]) => FROZEN_SECTIONS.includes(s)));
        });
        // A leg with declared deltas (tests/golden/amendments.json) must show each declared field at its
        // declared value; that field is then compared no further. Everything else must equal the golden.
        Object.entries(comparable).forEach(([id, sections]) => {
            const amend = amendments.legs[id];
            if (!amend || !frozen[id]) return;
            // A section the plan rules is no equality bind on this leg is recorded, not compared
            Object.entries(amend.unbound || {}).forEach(([section, reason]) => {
                if (!sections[section]) return;
                notes.push(`${id}.${section} is not compared with the golden (amendments.json): ${reason}`);
                delete sections[section];
            });
            const snap = sections.snapshot;
            if (snap && amend.stable && amendedStable(amend, snap.fingerprints?.stable)) {
                sections.snapshot = structuredClone(snap);
                sections.snapshot.fingerprints.stable = frozen[id].snapshot.fingerprints.stable;
            }
            Object.entries(amend.declared || {}).forEach(([path, expected]) => {
                const [section, ...keys] = path.split('.');
                if (!sections[section]) return;
                const golden = resolvePath(frozen[id][section], keys);
                const now = resolvePath(sections[section], keys);
                if (!golden.found || !now.found) {
                    failures.push(`${id}: declared path ${path} does not resolve in the ${golden.found ? 'fresh result' : 'golden'} (amendments.json)`);
                    return;
                }
                if (!same(now.value, expected)) {
                    failures.push(`${id}: ${path} is not the declared value (amendments.json)`);
                    return;
                }
                notes.push(`${id}: ${path} equals its declared value (amendments.json)`);
                sections[section] = assignPath(structuredClone(sections[section]), keys, golden.value);
            });
        });
        failures.push(...diffAgainst(frozen, comparable, 'frozen'));
        // Pages deleted since the baseline are gone; every page still there must read as it did
        // A page the plan changes on purpose (debug.html loads js/terrain.js from phase 1) is bound to its declared record
        Object.entries(results.pages || {}).forEach(([name, page]) => {
            const declared = amendments.pages[name];
            if (declared) {
                if (!same(declared.record, page)) failures.push(`pages ${name} is not its declared record (amendments.json)`);
                else notes.push(`pages ${name} equals its declared record (amendments.json): ${declared.reason}`);
                return;
            }
            if (!same(frozen.pages?.[name], page)) failures.push(`pages ${name} differs from the frozen baseline`);
        });
    }
}

function writeBaselines(report, fresh, frozen) {
    const { results, failures } = report;
    if (probes.includes('record-frozen')) {
        if (frozen) { failures.push(`${FROZEN} exists; the frozen baseline is written once`); return; }
        if (legIds.length !== LEG_IDS.length) { failures.push('record-frozen needs all eight legs'); return; }
        const prov = provenance();
        if (!prov.gameSourceClean) { failures.push('js/ or an html page is modified; the frozen baseline must come from untouched source'); return; }
        if (failures.length) return;
        writeJson(FROZEN, { provenance: prov, ...fresh, pages: results.pages });
        report.notes.push(`wrote ${FROZEN}`);
        return;
    }
    const stored = readJson(PARTS) || {};
    const wanted = (flag('add') ? option('add') : probes.join(',')).split(',');
    if (!wanted.every(section => ['parts', 'surface'].includes(section))) { failures.push('only parts and surface live in the mutable baseline'); return; }
    // Every frozen section must still match before anything is written
    const guard = Object.fromEntries(Object.entries(fresh).map(([id, s]) => [id, Object.fromEntries(Object.entries(s).filter(([k]) => FROZEN_SECTIONS.includes(k)))]));
    if (frozen) failures.push(...diffAgainst(frozen, guard, 'guard'));
    if (failures.length) return;
    const part = option('part') ? option('part').split(',') : null;
    for (const id of legIds) {
        stored[id] ||= {};
        for (const section of wanted) {
            if (flag('add') && stored[id][section] !== undefined) { failures.push(`${id}.${section} already exists; --add never overwrites`); continue; }
            if (flag('update-baseline') && !option('legs')) { failures.push('--update-baseline needs --legs'); continue; }
            if (part && section === 'parts' && stored[id].parts) {
                // Re-recording the ribbon must not carry a change to any prop
                const frozenParts = ['fixed', 'floor'].filter(k => !same(stored[id].parts[k], fresh[id].parts[k]));
                if (frozenParts.length) { failures.push(`${id}: ${frozenParts.join(',')} changed; refusing a partial re-record`); continue; }
                part.forEach(k => { stored[id].parts[k] = fresh[id].parts[k]; });
            } else {
                stored[id][section] = fresh[id][section];
            }
        }
    }
    if (!failures.length) {
        writeJson(PARTS, stored);
        report.notes.push(`wrote ${PARTS}`);
    }
}

// ---------------------------------------------------------------- world probes
// The streamed world (`?world=<id>`), one page for each probe. Every page blocks cloudfunctions.net
// like the leg probes do, and nothing here answers a callable: a world submits nothing yet.
const WORLD_PROBES = ['world-effect-shots', 'world-window', 'world-budget', 'world-ground', 'world-junction', 'world-wrongway', 'world-credit', 'world-net', 'world-finish', 'world-restart', 'world-cut', 'world-camera', 'world-frustum', 'world-camera-smooth', 'world-camera-frames', 'world-hud', 'world-shots', 'world-hairpin-shots', 'world-buildings', 'world-models', 'world-frametime', 'world-ride-shots', 'world-hairpin-assist', 'world-floating', 'world-watertight', 'world-trees', 'world-haze'];
// Hosts the page may reach besides itself: the script CDNs and the font host of index.html
const ALLOWED_HOSTS = ['cdn.jsdelivr.net', 'www.gstatic.com', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const ALLOWED_PATHS = /^\/(world\/|tests\/fixtures\/world\/|assets\/|js\/|css\/|tools\/autopilot\.js|favicon|$|index\.html)/;
const WORLD_RESIDENT_TILES = 60;
// The share of the mesh cap the window keeps free (world-budget reports each place's margin)
const WORLD_MESH_MARGIN = 0.15;
const WORLD_BIKE_TILE_M = 900;

async function openWorld(browser, port, id, seed = 1, data = option('worldData')) {
    for (let attempt = 0; attempt < 3; attempt++) {
        const page = await openPage(browser, port, `/?world=${encodeURIComponent(id)}${data ? `&worldData=${encodeURIComponent(data)}` : ''}`, seed);
        try {
            // The vehicle is made before the first window settles; the ride state comes after it, so wait for that
            await page.waitForFunction('window.game && window.game.environment && window.game.environment.isWorld && window.game.vehicle && window.game.worldRun', { timeout: 120000 });
        } catch {
            await page.close();
            continue;
        }
        await page.evaluate(() => { window.game.adaptResolution = () => {}; });
        await page.addScriptTag({ path: join(root, 'tools/autopilot.js') });
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
function countScene() {
    let meshes = 0, triangles = 0, instances = 0;
    game.scene.traverse(o => {
        if (!o.isMesh) return;
        for (let n = o.parent; n; n = n.parent) if (!n.visible) return;
        const pos = o.geometry.attributes.position;
        const index = o.geometry.index;
        meshes++;
        triangles += (index ? index.count : pos.count) / 3 * (o.isInstancedMesh ? o.count : 1);
        if (o.isInstancedMesh) instances += o.count;
    });
    return { meshes, triangles: Math.round(triangles), instances };
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
    for (let s0 = every / 2; s0 < route.length; s0 += every) {
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
                // Down: the drawn land meets each drawn edge, or a skirt closes the gap
                const offsets = RoadMesh.hold(held.lod === 0 ? [-h - VERGE, h + VERGE] : [-h, h], curve).offsets;
                for (const [side, edge] of [[-1, offsets[0]], [1, offsets[1]]]) {
                    const out = place(p, edge + side * 0.05);
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
                            // The edge works under the edge (an apron at the batter, a wall, a deck side): a ray from under
                            // the road, out across the edge, at three heights of the gap, must meet them
                            const from = place(p, edge - side * 0.5);
                            const dir = new THREE.Vector3(Math.cos(p.heading) * side, 0, -Math.sin(p.heading) * side);
                            raycaster.far = 0.6 + 1.6 * (roadY - top);
                            open = [0.2, 0.5, 0.8].some(f => {
                                raycaster.set(new THREE.Vector3(from.x, roadY - (roadY - top) * f, from.z), dir);
                                return !raycaster.intersectObjects(skirts, false).length;
                            });
                        }
                    }
                    const key = `${k}:${side}:${held.lod}:${land.lod}`;
                    const was = edges.get(key);
                    // What the edge works were built on there (WorldEnvironment.edgeFoot), for an open edge
                    let foot;
                    if (open && env.edgeFoot) {
                        const at = place(p, edge);
                        const f = env.edgeFoot()(at.x, roadY, at.z, Math.cos(p.heading) * side, -Math.sin(p.heading) * side);
                        foot = f ? { kind: f.kind, y: f.y !== undefined ? r2(f.y - roadY) : null } : null;
                    }
                    if (!was || was.gapM < gap) edges.set(key, { s: Math.round(p.s), side: side > 0 ? 'right' : 'left', roadLod: held.lod, landLod: land.lod, gapM: r2(gap), open, foot });
                    // Physics: the ground the bike reads beside the road against the drawn land, where the land is drawn at LOD0
                    if (land.lod === 0 && Math.abs(k - bikeK) < 120 && !open) {
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
    game.cameraMode = 2;
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
    game.cameraMode = 2;
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
    game.cameraMode = 2;
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

// world-watertight: the drawn land is closed. From the helmet, the chase and the high camera at stations along the
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
const WATERTIGHT_MODES = [1, 2, 3];
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
            if (y < land - tol) return { t: Math.round(t), x: Math.round(x), z: Math.round(z), key: `${Math.floor(x / WorldData.TILE_M)},${Math.floor(z / WorldData.TILE_M)}`, underM: Math.round((land - y) * 10) / 10 };
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
            game.cameraMode = mode;
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
    // the land, from the helmet, chase and high cameras every --every metres (50) between --from and --to
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
    'world-watertight': async (page) => page.evaluate(watertightWalk, placeAt.toString(), Number(option('every') || WATERTIGHT_EVERY_M), Number(option('from') || 0), Number(option('to') || Infinity), option('modes') ? option('modes').split(',').map(Number) : WATERTIGHT_MODES, WATERTIGHT_TOL_M, option('at') ? option('at').split(',').map(Number) : WATERTIGHT_VIEWS),
    // Floating roads and land over the road, as drawn: floatingWalk over the whole slice (every --every metres, 500 by
    // default), then the named views (FLOATING_VIEWS, or --views), each saved to --out when given
    'world-floating': async (page) => {
        const walk = await page.evaluate(floatingWalk, placeAt.toString(), Number(option('every') || 500), FLOAT_TOL_M, FLOAT_UP_M);
        const out = option('out');
        if (out) mkdirSync(out, { recursive: true });
        const tag = option('tag') || 'floating';
        const views = [];
        for (const s of (option('views') ? option('views').split(',').map(Number) : FLOATING_VIEWS)) {
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
            const route = game.environment.route;
            const out = [];
            for (let s = 0; s <= route.length; s += step) {
                const p = await placeAt(s);
                const env = game.environment;
                const near = [...env.streamer.refs.keys()].length;
                const m = env.tileMeshes;
                const bike = [...env.streamer.tilesNear(p.x, p.z, bikeTileM)];
                const counted = countScene();
                out.push({ s: Math.round(s), ...counted, meshMargin: meshCap - counted.meshes, tiles: m.size, refTiles: near, bikeTilesMissing: bike.filter(key => !env.streamer.refs.has(key) || !m.has(key)).length, sections: env.roadMeshes.size, sides: env.sideMeshes.size, trees: env.scenery.treeCount, byKind: { ...env.streamer.stats.maxStepByKind }, maxStepMs: Math.round(env.streamer.stats.maxStepMs * 100) / 100 });
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
            game.cameraMode = 2;
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
                game.cameraMode = 2;
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
        // --camera N: the view mode (Game.cameraModes; 1 the helmet, 2 the chase view, the default)
        const camera = Number(option('camera') || 2);
        await page.addStyleTag({ content: 'body * { visibility: hidden !important; } body > canvas { visibility: visible !important; }' });
        const files = [];
        for (const s of stations) {
            const at = await page.evaluate(async (placeSource, pilotSource, s, camera) => {
                const placeAt = new Function('game', `return (${placeSource})`)(game);
                const v = game.vehicle;
                game.cameraMode = camera;
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
        const ride = (until, limit = 60 * 600) => {
            for (let tick = 0; tick < limit && !until() && !v.crashed; tick++) twistyDev.step(1);
        };
        ride(() => game.checkpointsPassed >= 2);
        const station = env.stationGates[2];
        ride(() => v.routeS >= station.s + 300);
        const before = { passed: game.checkpointsPassed, elapsed: game.raceElapsed(), s: v.routeS, penaltyMs: game.penaltyMs };
        game.restartFromCheckpoint('key');
        const after = { s: v.projection.s, speed: v.speed, restarts: game.restarts, penaltyMs: game.penaltyMs, elapsedJump: game.raceElapsed() - before.elapsed, passed: game.checkpointsPassed, lastS: game.worldRun.lastS };
        // A crash 150 m on: no dialog, the cause in a call-out, and the game puts the bike back by itself
        ride(() => v.routeS >= before.s + 150);
        const crashAt = { s: v.projection.s, elapsed: game.raceElapsed(), restarts: game.restarts, ticks: twistyDev.ticks };
        v.crashed = true;
        v.crashCause = 'Hit the probe';
        twistyDev.step(1);
        const callout = [...document.querySelectorAll('.hud-top *')].map(el => el.textContent).find(text => /Hit the probe/.test(text)) || null;
        const dialogs = () => ['crashNotification', 'worldConfirm', 'world-pause'].filter(id => document.getElementById(id));
        const during = { dialogs: dialogs(), restarts: game.restarts - crashAt.restarts, crashed: v.crashed };
        for (let tick = 0; tick < 60 * 5 && game.restarts === crashAt.restarts; tick++) twistyDev.step(1);
        const crash = { callout, during, dialogs: dialogs(), seconds: (twistyDev.ticks - crashAt.ticks) / 60, mostS: Game.WORLD_CRASH.mostS, backM: crashAt.s - v.projection.s, speed: v.speed, crashed: v.crashed,
            restarts: game.restarts - crashAt.restarts, penaltyMs: game.penaltyMs - after.penaltyMs, lateral: v.projection.lateral, half: v.projection.width / 2 };
        ride(() => game.checkpointsPassed >= 3);
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
        const p = route.sample(v.routeS + 40, {});
        const at = { x: p.x + 60 * Math.cos(p.heading), z: p.z - 60 * Math.sin(p.heading) };
        const restarts = game.restarts;
        const base = v.update.bind(v);
        v.update = (...args) => {
            base(...args);
            if (game.restarts === restarts) { v.position.x = at.x; v.position.z = at.z; v.speed = 0; v.crashed = false; v.offRoadTime = 0; }
        };
        for (let tick = 0; tick < 60 * 16 && game.restarts === restarts; tick++) twistyDev.step(1);
        v.update = base;
        for (let tick = 0; tick < 60 * 12; tick++) twistyDev.step(1);
        return { station: 2, stationS: station.s, backM: env.physics.restartBackM, before, after, crash, next, confirm, excursion: { restarts: game.restarts - restarts, penaltyMs: game.penaltyMs, guideCause: env.guide.cause, pendingCutMs: game.worldRun.pendingCutMs } };
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
        const starts = [2900, 3900, 4400, 5000, 7400, 8000];
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
        const hairpins = new Function(`return (${hairpinSource})`)()(game.environment.route);
        const env = game.environment;
        const v = game.vehicle;
        const route = env.route;
        const cam = game.camera;
        twistyDev.freeze();
        game.cameraMode = 2;
        const start = Math.max(20, hairpins[0] - 400);
        await placeAt(start);
        game.worldCamera.reset(v.yawAngle);
        new Function('game', 'cruise', `return (${pilotSource})(game, cruise)`)(game, cruise);
        const point = new THREE.Vector3();
        const per = hairpins.map(s => ({ s: Math.round(s), frames: 0, out: 0, least: Infinity }));
        let frames = 0, out = 0, least = Infinity, ticks = 0, worstAt = null;
        const end = Math.min(route.length - 30, hairpins[hairpins.length - 1] + 200);
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
            let hairpins = new Function(`return (${hairpinSource})`)()(game.environment.route);
            if (onlyApex) hairpins = [hairpins.reduce((a, b) => (Math.abs(b - onlyApex) < Math.abs(a - onlyApex) ? b : a))];
            const v = game.vehicle;
            const route = game.environment.route;
            const cam = game.camera;
            twistyDev.freeze();
            game.cameraMode = 2;
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
    // A GPU frame sequence through one hairpin: the world pilot rides in from 140 m before the apex nearest --apex
    // (default the first), then `--count` pictures (default 8), one every `--every` frames (default 4), from
    // --from metres before the apex (default 20). The shake is held at zero. Needs --out <dir>; --tag names the files.
    'world-camera-frames': async (page) => {
        const out = option('out');
        if (!out) return { error: 'name a folder with --out <dir>' };
        mkdirSync(out, { recursive: true });
        const tag = option('tag') || 'frame';
        const count = Number(option('count') || 8), every = Number(option('every') || 4), from = Number(option('from') || 20);
        const apex = await page.evaluate(async (placeSource, pilotSource, hairpinSource, onlyApex, from) => {
            const placeAt = new Function('game', `return (${placeSource})`)(game);
            const hairpins = new Function(`return (${hairpinSource})`)()(game.environment.route);
            const apex = onlyApex ? hairpins.reduce((a, b) => (Math.abs(b - onlyApex) < Math.abs(a - onlyApex) ? b : a)) : hairpins[0];
            const v = game.vehicle;
            game.cameraMode = 2;
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
        }, placeAt.toString(), pilotWorld.toString(), worldHairpins.toString(), Number(option('apex') || 0), from);
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
        const hairpins = new Function(`return (${hairpinSource})`)()(game.environment.route);
        const env = game.environment;
        const route = env.route;
        const physics = env.physics;
        const v = game.vehicle;
        const input = game.input;
        const tight = 1 / 30;
        const k = s => route.curvatureAt(s, 4);
        twistyDev.freeze();
        game.worldLinger = false;
        const bends = hairpins.map(apex => {
            let from = apex, to = apex;
            while (from > apex - 120 && Math.abs(k(from - 2)) > tight) from -= 2;
            while (to < apex + 120 && Math.abs(k(to + 2)) > tight) to += 2;
            const advice = WorldAssist.advice(route, physics, from, 4);
            return { apex: Math.round(apex), from, to, advised: advice ? advice.speed : 8 };
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
                // Where and how it went down: metres from the bend's start, the lean, the speed, the bike's colour
                if (v.crashed) row.at = { ds: Math.round((v.projection.s - bend.from) * 10) / 10, lean: Math.round(v.leanAngle * 573) / 10, speed: Math.round(v.speed * 10) / 10, lateral: Math.round(v.projection.lateral * 100) / 100, cause: v.frame.material.color.getHexString(), radius: Math.round((bend.to - bend.from)), advised: Math.round(bend.advised * 10) / 10 };
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
        const apexes = await page.evaluate(hairpinSource => new Function(`return (${hairpinSource})`)()(game.environment.route).slice(0, 3).map(Math.round), worldHairpins.toString());
        const files = [];
        for (let k = 0; k < apexes.length; k++) {
            const rooms = await page.evaluate(async (placeSource, pilotSource, apex) => {
                const placeAt = new Function('game', `return (${placeSource})`)(game);
                const v = game.vehicle;
                game.cameraMode = 2;
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
            game.cameraMode = 2;
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
        for (let i = 100; i < pts.length - 200 && !pair; i++) {
            for (let j = i + 36; j < Math.min(pts.length - 1, i + 80); j++) {
                const gap = Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z);
                if (gap >= 14 && gap <= 28) { pair = { i, j, gap, ds: route.sArray[j] - route.sArray[i] }; break; }
            }
        }
        if (!pair) return { error: 'no stacked pair of legs on the ride' };
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
                game.cameraMode = cameraMode;
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
        for (let k = 0; k < sites.hairpins.length; k++) await shoot(`hairpin-${k + 1}`, sites.hairpins[k], 2);
        await shoot('hairpin-high-view', sites.hairpins[0], 3);
        if (sites.junction) await shoot('junction', sites.junction.s, 2);
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
    const camera = Number(option('camera') || 2);
    await page.addStyleTag({ content: 'body * { visibility: hidden !important; } body > canvas { visibility: visible !important; }' });
    const rows = [];
    for (const s of stations) {
        const at = await page.evaluate(async (placeSource, pilotSource, s, camera) => {
            const placeAt = new Function('game', `return (${placeSource})`)(game);
            const v = game.vehicle;
            game.cameraMode = camera;
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
            game.cameraMode = 2;
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

// world-toggle-ride: rides from the start to --to (default 7600) in the view --camera (default 3, the high view), and
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
// never comes back: the ride must end with the legs open and RideMode.LAND_LOST_NOTE shown. Either way the bike must not
// move up or down by more than half a metre while it is held
WORLD_PROBES.push('world-toggle-ride');
WORLD['world-toggle-ride'] = async (page) => {
    const result = await page.evaluate(async (placeSource, to, every, check, id, camera, levels, skip, dropAfter, restoreMs) => {
    const placeAt = new Function('game', `return (${placeSource})`)(game);
    const env = game.environment, v = game.vehicle, r = game.renderer;
    game.quality.fix(Quality.LEVELS.length - 1);
    game.cameraMode = camera;
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
        const notice = document.body.innerText.includes(RideMode.LAND_LOST_NOTE);
        const noteUp = !!(game.landNote && game.landNote.isConnected && !game.landNote.classList.contains('leaving'));
        Object.assign(drop, { notice, noteUp, legs: game.rideMode && game.rideMode.kind });
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
            if (!notice) failures.push('the legs did not open with the note that the land stopped loading');
        }
    } else game.graphics.render(game.scene, game.camera);
    return { s: Math.round(v.routeS), ...seen, inForce: game.effectLevels ? game.effectLevels[id] : null, drop: dropAfter ? drop : undefined, failures };
    }, placeAt.toString(), Number(option('to') || 7600), Number(option('every') ?? 240), Number(option('check') || 20), option('toggle') || 'landDetail', Number(option('camera') || 3), flag('levels'), Number(option('skip') || 0), Number(option('drop-after') || 0), Number(option('restore-ms') || 0));
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
    // --ride: the game's own frames ride the summit from --from at --speed in the chase view; how many marmots are drawn
    // and the nearest drawn one to the camera, every half second, and a picture where one is nearest (--out)
    if (flag('ride')) result.ride = await page.evaluate(async (placeSource, from, cruise) => {
        const placeAt = new Function('game', `return (${placeSource})`)(game);
        const env = game.environment, marmots = env.marmots, v = game.vehicle;
        await placeAt(from);
        game.cameraMode = 2;
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
    const hairpins = new Function(`return (${hairpinSource})`)()(route);
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
    return { every, ...sweep, width: sweep.width.slice(0, 20), solid: sweep.solid.slice(0, 20), runoff: sweep.runoff.slice(0, 20), hairpins: hairpins.length, rides, crashes, restarts, works, siteRides, siteCrashes };
}, fairnessWindow.toString(), placeAt.toString(), worldHairpins.toString(), Number(option('every') || 100), roadworksWindow.toString());

function fairnessChecks(results, failures) {
    const fair = results['world-fairness'];
    if (!fair) return;
    if (!(fair.points > 500000)) failures.push(`world-fairness: only ${fair.points} points of the drawn road read`);
    if (fair.widthCount) failures.push(`world-fairness: ${fair.widthCount} points where the physics band is over 0.1 m off the drawn ribbon (worst ${fair.worstWidthM} m): ${JSON.stringify(fair.width.slice(0, 10))}`);
    if (fair.solidCount) failures.push(`world-fairness: ${fair.solidCount} wall or fall points on the drawn road with nothing drawn within 0.5 m: ${JSON.stringify(fair.solid.slice(0, 10))}`);
    if (fair.runoffCount) failures.push(`world-fairness: ${fair.runoffCount} run-off points on the drawn carriageway: ${JSON.stringify(fair.runoff.slice(0, 10))}`);
    if (!(fair.hairpins >= 20 && fair.rides === fair.hairpins * 4)) failures.push(`world-fairness: ${fair.rides} rides over ${fair.hairpins} hairpins`);
    if (fair.crashes.length) failures.push(`world-fairness: ${fair.crashes.length} crashes in the hairpins at 5 and 7 m/s: ${JSON.stringify(fair.crashes.slice(0, 10))}`);
    if (fair.restarts.length) failures.push(`world-fairness: ${fair.restarts.length} restarts in the hairpins at 5 and 7 m/s: ${JSON.stringify(fair.restarts.slice(0, 10))}`);
    const works = fair.works || {};
    if (!(works.sites > 0) || fair.siteRides !== works.sites * 2) failures.push(`world-fairness: ${fair.siteRides} rides through ${works.sites} roadworks sites`);
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
            game.cameraMode = 2;
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
                game.cameraMode = 2;
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
        game.cameraMode = 2;
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
    game.cameraMode = 2;
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
        for (const junction of env.graph.junctions) {
            const p = await placeAt(Math.max(env.startS + 1, Math.min(env.endS - 1, junction.passes[0].sIn)));
            window({ THREE }, env, store, p);
        }
        const out = report(store);
        // Where each side road is seen from: over the road 22 m out looking back at the node, and from the ride
        out.eyes = [...store.roads.values()].map(road => {
            const { rows } = env.graph.chainFrom(road.edge, env.graph.junctions.find(j => j.id === road.junction).node, 24);
            const node = rows[0], far = rows[rows.length - 1];
            return { junction: road.junction, edge: road.edge, s: Math.max(env.startS + 1, road.s), back: [far.x, far.y + 7, far.z, node.x, node.y, node.z] };
        });
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
    if (!(junctions.roads >= 20)) failures.push(`world-junctions: only ${junctions.roads} side roads were read`);
    const says = { steps: 'side roads with a step in their surface', holes: 'side roads with a hole in their surface', sunk: 'side roads with land over their surface', decks: 'side roads with a deck or parapet in their mouth', open: 'side roads whose edge hangs open in their mouth', walls: 'side roads with a wall of the ride drawn across their mouth', blocked: 'side roads whose mouth the physics shuts with the ride\'s wall', cliffs: 'side roads with a face of laid ground beside the other road in their mouth', strips: 'side roads with land, laid ground or the ride\'s verge drawn over them in their mouth', pits: 'side roads with a gap under the line between them and the ride beside them', clefts: 'side roads with a narrow gap open to the land between them and the ride beside them' };
    for (const [kind, text] of Object.entries(says)) {
        if (junctions[kind].count > JUNCTION_LIMITS[kind]) failures.push(`world-junctions: ${junctions[kind].count} ${text} (at most ${JUNCTION_LIMITS[kind]}): ${JSON.stringify(junctions[kind].worst.slice(0, 5))}`);
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
            if (!o.isInstancedMesh || o.name !== 'stone-kerbs') return;
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
                // (the kerb course is a hairpin's row's only)
                const along = route.project(at.x, at.z, null, {}).s;
                if (!apexes.some(a => Math.abs(a - along) <= hairpinM)) kerb.stray = Math.round(along);
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
    if (!(stones.hairpinsWithRow > 0)) failures.push(`world-stones: no row of stones at any of the ${stones.hairpins} hairpins`);
    const says = { floats: 'stones with a corner over the drawn ground', buried: 'stones under the drawn ground', flat: `stones off every hairpin with no drop of ${stones.dropM} m drawn within ${stones.reachM} m on their side`, noEdge: `stones on a hairpin with no drop of ${stones.hairpinDropM} m drawn within ${stones.reachM} m behind them`, inside: 'stones on the inside of a hairpin', guarded: 'stones off a wall where a wall or a parapet is drawn at the edge', offTop: 'stones on a wall with a corner off its coping', railed: 'stones on a wall with a parapet', wallHigh: `stones on a wall that drops ${stones.wallMaxM} m or more`, kerbFloats: 'pieces of kerb with their foot over the drawn ground', kerbStray: 'pieces of kerb away from every hairpin' };
    for (const [kind, text] of Object.entries(says)) if (stones[kind].length) failures.push(`world-stones: ${text}: ${JSON.stringify(stones[kind])}`);
}

// world-camera-walls: nothing drawn stands between the chase camera and the bike. The world pilot rides every
// hairpin (from CAMWALL_BEFORE_M before its apex to CAMWALL_AFTER_M past it) in the standard and the high view, and on
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
    game.cameraMode = mode;
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
        for (const held of env.scenery.perTile.values()) held.group.traverse(o => { if (String(o.name).startsWith('houses:')) take('house', o); });
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
    const modes = (option('modes') || '2,3').split(',').map(Number);
    const setup = { lane: Number(option('lane') || 0), swing: Number(option('swing') || 1), far: Number(option('far') || 1), off: flag('off') };
    let apexes = await page.evaluate(hairpinSource => new Function(`return (${hairpinSource})`)()(game.environment.route), worldHairpins.toString());
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
    game.cameraMode = 2;
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

// world-group-shots: the group ride (CrewGroup, .agent/system/group.md) in pictures: the crew at the start, in line on a
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
        if (kind !== 'straight') {
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
    game.cameraMode = 2;
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
        for (let i = 0; i < 120; i++) twistyDev.step(1);
        note = { straightFrom: s0 };
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
    game.cameraMode = 2;
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
    if (!(walls.frames > 0)) failures.push('world-camera-walls: no frame was read');
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
    game.cameraMode = 2;
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
    const camera = Number(option('camera') || 2);
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
            game.cameraMode = camera;
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
            game.cameraMode = 2;
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
// from --from (default 300) in the view of --camera (default 3, the high view) while, every --every frames (default
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
    const camera = Number(option('camera') || 3), every = Number(option('every') || 15), reach = Number(option('reach') || 300);
    const result = await page.evaluate(async (placeSource, from, metres, camera, every, reach) => {
        const placeAt = new Function('game', `return (${placeSource})`)(game);
        const v = game.vehicle, r = game.renderer, gl = r.getContext(), pixel = new Uint8Array(4);
        game.cameraMode = camera;
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
        game.cameraMode = 2;
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

async function worldMain() {
    const executablePath = chromePath();
    const gpu = flag('gpu');
    const server = await startServer();
    const port = server.address().port;
    const args = gpu ? [] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
    const browser = await puppeteer.launch({ protocolTimeout: 1800000, executablePath, headless: 'new', args: ['--no-sandbox', ...args] });
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
            const page = name === 'world-hud' && !option('worldData')
                ? await openWorld(browser, port, 'all', 1, WORLD_HUD_DATA)
                : await openWorld(browser, port, id);
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
    console.log(JSON.stringify(report, null, 1));
    process.exit(exit);
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

function worldChecks(report) {
    const { results, failures } = report;
    clearanceChecks(results, failures);
    fairnessChecks(results, failures);
    camWallChecks(results, failures);
    treeChecks(results, failures);
    roadLookChecks(results, failures);
    vertexChecks(results, failures);
    wallChecks(results, failures);
    junctionChecks(results, failures);
    stoneChecks(results, failures);
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
        const { before, after, crash, next, confirm, excursion, stationS, backM } = restart;
        const { held, cancelled, entered } = confirm;
        if (held.ticks !== 0 || held.moved !== 0 || held.clock !== 0 || !held.open) failures.push(`world-restart: the ride went on while the restart box was open: ${JSON.stringify(held)}`);
        if (cancelled.open || cancelled.paused || cancelled.proceeded !== 0 || cancelled.ticks !== 30) failures.push(`world-restart: Escape must cancel and give the ride back: ${JSON.stringify(cancelled)}`);
        if (entered.open || entered.paused || entered.proceeded !== 1) failures.push(`world-restart: Enter must answer yes: ${JSON.stringify(entered)}`);
        // In place: a few metres behind where the bike was (300 m past the station, so not on it), at a standstill
        if (!(before.s - after.s >= backM - 2 && before.s - after.s <= backM + 2) || Math.abs(after.s - stationS) < 100 || after.restarts !== 1 || after.penaltyMs !== 5000 || !(after.elapsedJump >= 5000 && after.elapsedJump < 5100) || after.speed !== 0 || after.passed !== before.passed) failures.push(`world-restart: ${JSON.stringify({ stationS, before, after })}`);
        if (crash.during.dialogs.length || crash.dialogs.length || crash.during.restarts !== 0 || !crash.during.crashed) failures.push(`world-restart: a crash must open no dialog and play its fall first: ${JSON.stringify(crash)}`);
        if (!crash.callout || !/Hit the probe\s+\+5 s/.test(crash.callout)) failures.push(`world-restart: the call-out must say the cause and the cost: ${JSON.stringify(crash.callout)}`);
        if (crash.restarts !== 1 || crash.penaltyMs !== 5000 || crash.crashed || !(crash.seconds <= crash.mostS + 0.1) || !(crash.backM >= 0 && crash.backM <= backM + 25) || Math.abs(crash.lateral) > crash.half) failures.push(`world-restart: the game must restart a crashed rider in place by itself: ${JSON.stringify(crash)}`);
        if (next.passed !== 3 || next.restarts !== 2 || next.crashed) failures.push(`world-restart: the ride did not go on to the next station: ${JSON.stringify(next)}`);
        if (excursion.restarts !== 1 || excursion.penaltyMs !== 15000 || excursion.guideCause !== null || excursion.pendingCutMs !== 0) failures.push(`world-restart: an excursion must cost one penalty: ${JSON.stringify(excursion)}`);
    }
    const cut = results['world-cut'];
    if (cut) {
        if (cut.error) failures.push(`world-cut: ${cut.error}`);
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
    if (camera) {
        if (camera.boomUnderGround) failures.push(`world-camera: the boom went under the ground on ${camera.boomUnderGround} of ${camera.frames} frames`);
        if (!(camera.hairpinFrames > 0) || !(camera.share >= 0.95)) failures.push(`world-camera: the road 30 m ahead is in view on ${camera.share} of ${camera.hairpinFrames} hairpin frames, want 0.95 or more: ${JSON.stringify(camera.runs)}`);
        camera.runs.forEach(r => { if (r.crashed) failures.push(`world-camera: the ride from s ${r.start} crashed`); });
    }
    const frustum = results['world-frustum'];
    if (frustum) {
        if (frustum.crashed) failures.push(`world-frustum: the ride crashed at s ${frustum.reached}`);
        if (frustum.reached < frustum.end) failures.push(`world-frustum: the ride stopped at s ${frustum.reached}, before ${frustum.end}`);
        if (frustum.hairpins.length < 20) failures.push(`world-frustum: ${frustum.hairpins.length} hairpins found, want 20 or more`);
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
    const assist = results['world-hairpin-assist'];
    if (assist) {
        const normal = assist.levels.normal;
        if (assist.bends < 20) failures.push(`world-hairpin-assist: ${assist.bends} hairpins found, want 20 or more`);
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

main();

// A converted leg's asset load: nothing failed, nothing floats or is buried
function checkAssets(id, assets, failures) {
    ['rocks', 'portals', 'village', 'bridge', 'trees'].forEach(key => { if (assets[key] && assets[key].error) failures.push(`${id}: ${key} failed to load: ${assets[key].error}`); });
    if (assets.trees && assets.trees.errors && assets.trees.errors.length) failures.push(`${id}: trees ${assets.trees.errors.join('; ')}`);
    if (assets.floating) failures.push(`${id}: ${assets.floating} modelled objects float`);
    if (assets.buried) failures.push(`${id}: ${assets.buried} modelled objects are buried`);
}

// The expectations of the long-leg probes (plan, World section 7)
function longLegChecks(report) {
    const { results, failures } = report;
    const fail = text => failures.push(text);
    if (results.course) {
        Object.entries(results.course).forEach(([id, r]) => {
            const parts = r.parts;
            parts.forEach((part, n) => {
                const mark = part.landmark;
                if (!mark) return fail(`${id}: part ${part.id} has no landmark-${part.id}`);
                if (!(mark.triangles > 0) || !mark.visible || !mark.inside || !(mark.metres <= 600)) fail(`${id}: landmark of ${part.id} ${JSON.stringify(mark)}`);
                if (n === 0) return;
                const before = parts[n - 1];
                const ratio = (a, b) => (Math.min(a, b) === 0 ? Math.max(a, b) >= 1 : Math.max(a, b) / Math.min(a, b) >= 2);
                const tests = {
                    G: () => before.G.some((v, c) => Math.abs(v - part.G[c]) >= 20),
                    T: () => ratio(before.T, part.T),
                    S: () => before.S.some((v, c) => v !== part.S[c]),
                    F: () => before.F !== part.F,
                    B: () => Math.min(before.B, part.B) === 0 && Math.max(before.B, part.B) >= 6,
                    H: () => Math.sign(before.H) !== Math.sign(part.H) && Math.abs(before.H) >= 30 && Math.abs(part.H) >= 30
                };
                const missed = part.differs.filter(code => !tests[code]());
                if (missed.length) fail(`${id}: ${before.id} to ${part.id} does not differ by ${missed.join(', ')}`);
                if (flag('gpu') && part.look && before.look && JSON.stringify(part.look) !== JSON.stringify(before.look) && before.frameRGB) {
                    const change = Math.max(...before.frameRGB.map((v, c) => Math.abs(v - part.frameRGB[c])));
                    if (change < 12) fail(`${id}: ${before.id} to ${part.id} frame colour changes by ${change}, under 12`);
                }
            });
        });
    }
    if (results.window) {
        Object.entries(results.window).forEach(([id, r]) => {
            r.windows.forEach(w => {
                Object.entries(LEG_BUDGET).forEach(([key, most]) => { if (!(w[key] <= most)) fail(`${id}: window ${w.section} ${w[key]} ${key}, over ${most}`); });
                if (!(w.solidBoulders <= SOLID_BOULDER_BUDGET)) fail(`${id}: window ${w.section} ${w.solidBoulders} solid boulders`);
                if (!(w.retainedMB <= 12)) fail(`${id}: window ${w.section} retains ${w.retainedMB} MB`);
                if (w.conesOutsideRetained) fail(`${id}: window ${w.section} has ${w.conesOutsideRetained} cones outside retained sections`);
            });
        });
    }
    if (results.stream) {
        Object.entries(results.stream).forEach(([id, r]) => {
            const want = { finished: true, crashes: 0, airborneFrames: 0, syncBuildsAfterStart: 0, framesOnUnbuiltGround: 0, maxVisibleSections: 4, sectionsBuilt: r.sections, sectionsDisposed: r.sections - 2 };
            if (flag('traffic') || flag('cones') || flag('rockfalls')) Object.assign(want, { vehiclesDrawnOutsideVisible: 0, conesOutsideRetained: 0, rocksOutsideVisible: 0, vehiclesPastTail: 0 });
            Object.entries(want).forEach(([key, value]) => { if (r[key] !== value) fail(`${id}: stream ${key}: ${r[key]}, expected ${value}`); });
            if (!(r.maxStepMs <= 16)) fail(`${id}: stream maxStepMs ${r.maxStepMs}, over 16`);
            // The fixture is 3 km of mostly straight road: its cone rate is not a leg's
            if (flag('cones') && !flag('fixture') && !(r.conesPerKm >= 3 && r.conesPerKm <= 8)) fail(`${id}: stream conesPerKm ${r.conesPerKm}`);
            if (flag('gpu')) {
                if (!/ANGLE Metal Renderer: Apple M5/.test(report.renderer)) fail(`${id}: renderer ${report.renderer}`);
                if (r.framesOver16ms) fail(`${id}: stream framesOver16ms ${r.framesOver16ms}`);
                if (!(r.meanFrameMs <= 8)) fail(`${id}: stream meanFrameMs ${r.meanFrameMs}`);
                Object.entries(r.firstVisibleFrameMs).forEach(([k, ms]) => { if (!(ms <= 16.7)) fail(`${id}: section ${k} first drawn in ${ms} ms`); });
            }
        });
    }
    if (results.preview) {
        Object.entries(results.preview).forEach(([id, r]) => {
            if (!r.converted) return;
            if (r.sectionsBuilt.length !== 2) fail(`${id}: preview built sections ${JSON.stringify(r.sectionsBuilt)}, expected 2`);
            Object.entries(LEG_BUDGET).forEach(([key, most]) => { if (!(r[key] <= most)) fail(`${id}: preview ${r[key]} ${key}`); });
            if (!(r.triangles <= 191322)) fail(`${id}: preview ${r.triangles} triangles, over today's whole leg 1 (191322)`);
        });
    }
    if (results.finish) {
        Object.entries(results.finish).forEach(([id, r]) => {
            if (!r.finished || !r.bestTimeStored) fail(`${id}: finish ${JSON.stringify(r)}`);
            // The board time of a table board is the finish-line time (protocol 2)
            if (r.bestTimeMs !== r.finishTimeMs) fail(`${id}: stored best ${r.bestTimeMs} is not the finish time ${r.finishTimeMs}`);
            if (r.splitsStored !== r.gates) fail(`${id}: ${r.splitsStored} splits stored for ${r.gates} gates`);
        });
    }
}
