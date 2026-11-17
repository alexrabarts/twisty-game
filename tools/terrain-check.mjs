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
//   world-window world-budget world-ground world-junction world-wrongway world-credit world-net world-finish world-restart world-cut world-camera world-frustum world-camera-smooth world-camera-frames world-hud world-shots world-hairpin-shots world-buildings world-frametime world-ride-shots world-hairpin-assist world-floating
//   node tools/terrain-check.mjs world-floating --world tremola --gpu [--every 500] [--views 3600,7990] [--out <dir> --tag T]   (floating roads and land over the road, drawn)
//   node tools/terrain-check.mjs world-frametime --world tremola --gpu [--frames N]   (chase-view frame time at five points: median and worst)
//   node tools/terrain-check.mjs world-ride-shots --world tremola --gpu --out <dir> [--tag T]   (the chase view at five points of the ride)
//   node tools/terrain-check.mjs world-budget --world tremola --every 1000 --gpu
//   world-hud rides the two-stage fixture tests/fixtures/world/mini (--world all) unless --worldData is given
//   node tools/terrain-check.mjs world-finish --world tremola --gpu [--seed S] [--seeds N]   (N rides from seed S; default 5 rides from 1, all must finish)
//   node tools/terrain-check.mjs world-shots --world tremola --gpu --out <dir>   (hairpins, a junction barrier and the minimap, as PNG files in <dir>)
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
    return new Promise(done => server.listen(0, '127.0.0.1', () => done(server)));
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
    page.on('console', message => { if (message.type() === 'error') state.lastError = message.text().slice(0, 200); });
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
const WORLD_PROBES = ['world-window', 'world-budget', 'world-ground', 'world-junction', 'world-wrongway', 'world-credit', 'world-net', 'world-finish', 'world-restart', 'world-cut', 'world-camera', 'world-frustum', 'world-camera-smooth', 'world-camera-frames', 'world-hud', 'world-shots', 'world-hairpin-shots', 'world-buildings', 'world-models', 'world-frametime', 'world-ride-shots', 'world-hairpin-assist', 'world-floating'];
// Hosts the page may reach besides itself: the script CDNs and the font host of index.html
const ALLOWED_HOSTS = ['cdn.jsdelivr.net', 'www.gstatic.com', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const ALLOWED_PATHS = /^\/(world\/|tests\/fixtures\/world\/|assets\/|js\/|css\/|tools\/autopilot\.js|favicon|$|index\.html)/;
const WORLD_RESIDENT_TILES = 60;
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
        return page;
    }
    return fail(2, `the world page did not start: ${state.pageErrors.join(' | ')} ${state.lastError}`);
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
const FLOATING_VIEWS = [100, 1300, 3600, 7800, 7900, 7990, 9500, 10900];
// Tolerances of world-floating: the drawn land may lie this far under a drawn road edge, and no land stands over the
// road surface within UP_M over it
const FLOAT_TOL_M = 0.3;
const FLOAT_UP_M = 4;
// The share of luminance profiles across the road edges of a view that may show a thin dark stripe (a stone, a shadow
// edge or a tree crossing a profile reads as one now and then; a seam along the road reads on most of them)
const FLOAT_SEAM_SHARE = 0.1;

// world-floating, in the page: walks the slice every `every` metres and checks the drawn world round each place
// (the LOD each tile and each road section is drawn at from there). Returns per-LOD counts and the worst cases.
async function floatingWalk(placeSource, every, tol, upM) {
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
    let checked = 0, missing = 0, upChecked = 0;
    const r2 = v => Math.round(v * 100) / 100;
    for (let s0 = every / 2; s0 < route.length; s0 += every) {
        const bike = await placeAt(s0);
        const works = o => o.name === 'road-works';
        const skirts = [...meshes(env.roadGroup, works), ...meshes(env.sideGroup, works)];
        const roads = [...meshes(env.roadGroup, o => o.name === 'road-ribbon' || o.name === 'road-side'), ...meshes(env.sideGroup, o => o.name === 'road-ribbon' || o.name === 'road-side')];
        const far = [env.horizon, ...(env.farLand || [])].filter(Boolean);
        const bikeK = route.toUnits(s0);
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
                            raycaster.set(new THREE.Vector3(q.x, roadY + 0.3, q.z), down);
                            raycaster.far = 2;
                            const road = raycaster.intersectObjects([...roads, ...skirts], false)[0];
                            // A retaining wall's parapet is not ground: the physics there is the importer's drop
                            if (road && road.object.name === 'road-works' && road.face.materialIndex === 1) continue;
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
        physics: { checked: physics.length, over: badPhysics.length, worstM: badPhysics.length ? badPhysics[0].deltaM : 0, worst: badPhysics.slice(0, 8) }
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
    return { s: Math.round(v.routeS), crashed: v.crashed, seam: { profiles, seams: seams.length, worst: seams.slice(0, 6) } };
}

function floatingCount() {
    const env = game.environment;
    const renderer = game.graphics.renderer;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y);
    const flat = c => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide, fog: false });
    const land = flat(0x0000ff), other = flat(0x000000), structure = flat(0x808080);
    const ribbon = new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        vertexShader: 'varying vec3 vWorld; varying vec3 vN; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }',
        fragmentShader: 'varying vec3 vWorld; varying vec3 vN; void main() { vec3 n = vN.y < 0.0 ? -vN : vN; gl_FragColor = dot(cameraPosition - vWorld, n) < 0.0 ? vec4(1.0, 0.0, 0.0, 1.0) : vec4(0.0, 1.0, 0.0, 1.0); }'
    });
    const saved = new Map();
    const hidden = [];
    game.scene.children.forEach(c => { if (c !== env.group && c.visible && !c.isLight) { hidden.push(c); c.visible = false; } });
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
    let underside = 0, top = 0;
    for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] > 200 && pixels[i + 1] < 50) underside++;
        else if (pixels[i + 1] > 200 && pixels[i] < 50) top++;
    }
    return { underside, top, pixels: size.x * size.y };
}

const WORLD = {
    // Floating roads and land over the road, as drawn: floatingWalk over the whole slice (every --every metres, 500 by
    // default), then the named views (FLOATING_VIEWS, or --views), each saved to --out when given
    'world-floating': async (page) => {
        const walk = await page.evaluate(floatingWalk, placeAt.toString(), Number(option('every') || 500), FLOAT_TOL_M, FLOAT_UP_M);
        const out = option('out');
        if (out) mkdirSync(out, { recursive: true });
        const tag = option('tag') || 'floating';
        const views = [];
        for (const s of (option('views') ? option('views').split(',').map(Number) : FLOATING_VIEWS)) {
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
        const rows = await page.evaluate(async (step, bikeTileM, countSource, placeSource) => {
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
                out.push({ s: Math.round(s), ...countScene(), tiles: m.size, refTiles: near, bikeTilesMissing: bike.filter(key => !env.streamer.refs.has(key) || !m.has(key)).length, sections: env.roadMeshes.size, sides: env.sideMeshes.size, trees: env.scenery.treeCount, byKind: { ...env.streamer.stats.maxStepByKind }, maxStepMs: Math.round(env.streamer.stats.maxStepMs * 100) / 100 });
            }
            return out;
        }, every, WORLD_BIKE_TILE_M, countScene.toString(), placeAt.toString());
        return { every, rows };
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
        for (const f of [0.05, 0.25, 0.45, 0.65, 0.85]) {
            const s = Math.round(f * length);
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
                twistyDev.step(1, { render: true });
                return { s: Math.round(v.routeS), crashed: v.crashed };
            }, placeAt.toString(), pilotWorld.toString(), s);
            const file = join(out, `${tag}-s${s}.png`);
            await page.screenshot({ path: file });
            files.push({ file, ...at });
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
            const hit = raycaster.intersectObjects(groups, true).find(h => !(h.object.name === 'road-works' && h.face.materialIndex === 1));
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
    // Every pass of every ride junction: its barrier set stands, the open pair has none
    'world-junction': async page => page.evaluate(async (placeSource) => {
        const placeAt = new Function('game', `return (${placeSource})`)(game);
        const env = game.environment;
        const out = [];
        for (const junction of env.graph.junctions) {
            const passes = [];
            for (const pass of junction.passes) {
                if (pass.inEdge === null) continue;
                await placeAt(Math.max(0, pass.sIn - 200));
                const active = env.activeBarriers.filter(b => b.junctionId === junction.id).map(b => b.edgeId).sort((a, b) => a - b);
                const expected = pass.barriers.map(b => b.edgeId).sort((a, b) => a - b);
                // Where each barrier was placed (moved off the ride and the other roads: WorldGraph.barrierPose)
                const walls = env.activeBarriers.filter(b => b.junctionId === junction.id).map(b => env.ground.zoneAt({ x: b.x, z: b.z, index: 0, lateral: 100 }, 5).kind);
                passes.push({ sIn: pass.sIn, expected, active, walls, outClosed: expected.includes(pass.outEdge), mesh: env.barrierMesh.count });
            }
            if (passes.length) out.push({ id: junction.id, name: junction.name, passes });
        }
        return out;
    }, placeAt.toString()),
    // Off the ride line, backwards, and the ordinary ride between (the control)
    'world-wrongway': async page => page.evaluate(async (placeSource, pilotSource) => {
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
        return results;
    }, placeAt.toString(), pilotWorld.toString()),
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
        while (!game.finished && !v.crashed && ticks < limit) {
            twistyDev.step(1);
            ticks++;
            maxLateral = Math.max(maxLateral, Math.abs(v.projection.lateral));
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
        return { finished: game.finished, crashed: v.crashed, crash: crashes[0] || null, lowside: v.lowsideTimerMs, speed: Math.round(v.speed * 10) / 10, lateral: Math.round(v.projection.lateral * 10) / 10, maxLateral: Math.round(maxLateral * 10) / 10, ticks, seconds: Math.round(ticks / 60), gates: game.checkpointsPassed, gateTotal: env.checkpoints.length, at: Math.round(v.routeS), length: Math.round(env.route.length), restarts: game.restarts, penaltyMs: game.penaltyMs, traffic, cones: !!game.cones, rockfalls: !!game.rockfalls, rows };
    }, pilotWorld.toString(), Number(option('speed') || 20), countScene.toString(), Number(option('every') || 1000)),
    // A restart from a key press: the bike is put on the last station, +5 s, a rolling start, and the ride goes on
    // to the next station. An excursion that the guide ends costs one penalty, not two.
    'world-restart': async page => page.evaluate(async (pilotSource) => {
        const env = game.environment;
        const v = game.vehicle;
        const route = env.route;
        twistyDev.freeze();
        new Function('game', 'cruise', `return (${pilotSource})(game, cruise)`)(game, 20);
        const ride = (until, limit = 60 * 600) => {
            for (let tick = 0; tick < limit && !until() && !v.crashed; tick++) twistyDev.step(1);
        };
        ride(() => game.checkpointsPassed >= 3);
        const station = env.stationGates[3];
        ride(() => v.routeS >= station.s + 300);
        const before = { passed: game.checkpointsPassed, elapsed: game.raceElapsed(), s: v.routeS, penaltyMs: game.penaltyMs };
        game.restartFromCheckpoint('key');
        const after = { s: v.projection.s, speed: v.speed, restarts: game.restarts, penaltyMs: game.penaltyMs, elapsedJump: game.raceElapsed() - before.elapsed, passed: game.checkpointsPassed, lastS: game.worldRun.lastS };
        ride(() => game.checkpointsPassed >= 4);
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
        return { station: 3, stationS: station.s, before, after, next, confirm, excursion: { restarts: game.restarts - restarts, penaltyMs: game.penaltyMs, guideCause: env.guide.cause, pendingCutMs: game.worldRun.pendingCutMs } };
    }, pilotWorld.toString()),
    // The HUD of a ride that holds more than one stage (P48): put the bike in stage 2 of the mini world
    // (--worldData tests/fixtures/world/mini, --world all), at 1280x720 and at 390x844 as a touch device. The stage line,
    // the pips of the stage and a box that overlaps no other.
    'world-hud': async page => {
        const read = () => page.evaluate(async (placeSource) => {
            const placeAt = new Function('game', `return (${placeSource})`)(game);
            const env = game.environment;
            const stage = env.route.stages[1];
            if (!stage) return { error: 'the world has no second stage' };
            await placeAt(stage.from + 300);
            // Put down mid-ride, the stations behind the bike count as passed
            const run = game.worldRun;
            run.stationIndex = env.stationGates.filter(st => st.s <= stage.from + 300).length - 1;
            run.stageIndex = run.stageOf(stage.from + 300);
            twistyDev.freeze();
            for (let i = 0; i < 20; i++) twistyDev.step(1);
            const box = el => { if (!el) return null; const r = el.getBoundingClientRect(); return r.width && r.height ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null; };
            const boxes = { timer: box(document.querySelector('.hud-timer')), minimap: box(document.querySelector('.world-guide')), speed: box(document.querySelector('.hud-speed')) };
            const names = Object.keys(boxes).filter(k => boxes[k]);
            const overlaps = [];
            for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
                const a = boxes[names[i]], b = boxes[names[j]];
                if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) overlaps.push([names[i], names[j]]);
            }
            const gates = game.worldRun.stageGates(1);
            const hud = game.hud;
            hud.setGates(0, 30);
            const many = { pips: document.querySelectorAll('#hudGatePips i').length, count: document.getElementById('hudGateCount').textContent };
            hud.setGates(0, gates.total);
            return { pips: document.querySelectorAll('#hudGatePips i').length, gateTotal: gates.total, count: document.getElementById('hudGateCount').textContent, meta: document.getElementById('hudStageName').textContent, many, overlaps, stageIndex: game.worldRun.stageIndex };
        }, placeAt.toString());
        const out = {};
        await page.setViewport({ width: 1280, height: 720 });
        out.desktop = await read();
        await page.setViewport({ width: 390, height: 844 });
        await page.evaluate(() => document.body.classList.add('touch'));
        out.touch = await read();
        return out;
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
    // GPU screenshots to --out: two hairpins, a junction barrier, and the minimap and HUD in each
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
            const junction = env.graph.junctions.find(j => j.passes.some(p => p.inEdge !== null && p.barriers.length));
            const pass = junction ? junction.passes.find(p => p.inEdge !== null && p.barriers.length) : null;
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
        if (sites.junction) await shoot('junction-barrier', sites.junction.s, 2);
        const hud = await page.evaluate(() => ({
            guide: !!document.getElementById('world-guide'),
            guideBox: (() => { const b = document.getElementById('world-guide').getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; })(),
            stage: document.getElementById('hudStage') ? document.getElementById('hudStage').textContent : null,
            renderer: game.graphics.renderer.getContext().getParameter(game.graphics.renderer.getContext().getExtension('WEBGL_debug_renderer_info') ? game.graphics.renderer.getContext().getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL : 0x1F01)
        }));
        return { sites, files, hud };
    }
};

// world-clearance: nothing drawn stands in a road. The slice is walked every --every metres (default 300); at each
// place the drawn road bands round the bike (the ride within half a step either side, and every side road drawn) are
// cast down on across their full drawn width, every CLEAR_STEP_M along and across, from HEADROOM_M over the surface to
// just under it, against every scenery mesh: trees, boulders, houses, landmarks, signposts, barriers and the gate
// frames, instanced or not. Where a mesh's box reaches into a cell, the cell is cast on again every CLEAR_FINE_M, so a
// pole or a board a few centimetres thick is not missed between rays. A hit is a failure, except a barrier over the
// side road it closes (it is there to close it, never on the ride); a station banner spans the ride above HEADROOM_M,
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
        if (n === 'world-signposts') return 'signpost';
        if (n === 'world-barriers') return 'barrier';
        if (n === 'world-gates') return 'gate';
        return null;
    };
    // The barrier instances, in the order placeBarriers set them (env.activeBarriers), with the side roads each closes
    const closes = (b) => {
        const out = new Set();
        let edge = env.data.edges[b.edgeId], from = b.node, run = 0;
        while (edge && !edge.onRide && !out.has(edge.id) && run < 80) {
            out.add(edge.id);
            run += edge.length;
            const far = edge.a === from ? edge.b : edge.a;
            if (env.data.nodes.degree[far] !== 2) break;
            from = far;
            const last = edge.id;
            edge = env.data.edges.find(e => e.id !== last && (e.a === far || e.b === far));
        }
        return out;
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
            // The gate frames are one mesh over the whole stage: a box round each gate instead of the mesh's own
            if (type === 'gate') {
                for (const st of env.stationGates || []) {
                    const p = route.sample(st.s, {});
                    const r = p.width / 2 + 3;
                    const thing = { mesh: o, type, index: 0, world: o.matrixWorld.clone(), x: p.x, z: p.z, x0: p.x - r, x1: p.x + r, z0: p.z - r, z1: p.z + r, y0: p.y - 1, y1: p.y + 7, barrier: null };
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
                const thing = { mesh: o, type, index: i, world, x: (box.min.x + box.max.x) / 2, z: (box.min.z + box.max.z) / 2, x0: box.min.x, x1: box.max.x, z0: box.min.z, z1: box.max.z, y0: box.min.y, y1: box.max.y, barrier: type === 'barrier' ? env.activeBarriers[i] : null };
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
                if (t.type === 'barrier' && road.edgeId !== null && t.barrier && closes(t.barrier).has(road.edgeId)) continue;
                probe.geometry = t.mesh.geometry;
                probe.material = t.mesh.material;
                probe.matrixWorld.copy(t.world);
                const found = [];
                for (let fx = Math.max(x - h, t.x0); fx <= Math.min(x + h, t.x1) && !found.length; fx += fine) {
                    for (let fz = Math.max(z - h, t.z0); fz <= Math.min(z + h, t.z1) && !found.length; fz += fine) {
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
            for (let o = -half; o <= half + 1e-9; o += step) cast(sample.x + o * Math.cos(sample.heading), sample.z - o * Math.sin(sample.heading), sample.y, { edgeId: null, s });
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
                    for (let o = -half; o <= half + 1e-9; o += step) cast(x + o * fz, z - o * fx, y, { edgeId: edge.id, s: null });
                }
            }
        }
    }
    const rows = [...hits.values()].sort((p, q) => q.hits - p.hits);
    const byType = {};
    for (const r of rows) byType[r.type] = (byType[r.type] || 0) + 1;
    return { places, rays, instancesSeen, headroomM: headroom, stepM: step, offenders: rows.length, byType, hits: rows.slice(0, 60) };
}

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

function clearanceChecks(results, failures) {
    const clear = results['world-clearance'];
    if (!clear) return;
    if (!(clear.rays > 0 && clear.instancesSeen > 0)) failures.push(`world-clearance: nothing was cast (${clear.rays} rays over ${clear.instancesSeen} drawn things)`);
    if (clear.offenders) failures.push(`world-clearance: ${clear.offenders} drawn things stand in a road within ${clear.headroomM} m over it (${JSON.stringify(clear.byType)}): ${JSON.stringify(clear.hits.slice(0, 20))}`);
}

// The data world-hud rides when the run names no --worldData: the 6 km fixture of two stages
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

function worldChecks(report) {
    const { results, failures } = report;
    clearanceChecks(results, failures);
    const rows = (results['world-window'] || results['world-budget'] || {}).rows || [];
    rows.forEach(r => {
        Object.entries(LEG_BUDGET).forEach(([key, most]) => { if (!(r[key] <= most)) failures.push(`world at s ${r.s}: ${r[key]} ${key}, over ${most}`); });
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
        if (JSON.stringify(p.active) !== JSON.stringify(p.expected)) failures.push(`world-junction ${j.id} at ${p.sIn}: barriers ${JSON.stringify(p.active)}, want ${JSON.stringify(p.expected)}`);
        if (p.walls.some(kind => kind !== 'wall')) failures.push(`world-junction ${j.id} at ${p.sIn}: a barrier does not give wall (${p.walls})`);
        if (p.outClosed) failures.push(`world-junction ${j.id} at ${p.sIn}: the road out is closed`);
    }));
    const wrong = results['world-wrongway'];
    if (wrong) {
        const [off, back, ride] = wrong;
        if (off.error) failures.push(`world-wrongway: ${off.error}`);
        else {
            if (!(off.warnedAt !== null && off.warnedAt <= 1) || !(Math.abs(off.restartAt - off.warnedAt - 10) <= 0.5)) failures.push(`world-wrongway off route: ${JSON.stringify(off)}, want the warning within 1 s and the restart 10 s later`);
            if (!(Math.abs(back.warnedAt - 5) <= 0.5) || !(Math.abs(back.restartAt - back.warnedAt - 10) <= 0.5)) failures.push(`world-wrongway backwards: ${JSON.stringify(back)}, want the warning at 5 s and the restart 10 s later`);
            if (ride.warned || ride.restarts || ride.crashed || ride.metres < 1900) failures.push(`world-wrongway control: ${JSON.stringify(ride)}, want neither a warning nor a restart over 2 km`);
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
        const { before, after, next, confirm, excursion, stationS } = restart;
        const { held, cancelled, entered } = confirm;
        if (held.ticks !== 0 || held.moved !== 0 || held.clock !== 0 || !held.open) failures.push(`world-restart: the ride went on while the restart box was open: ${JSON.stringify(held)}`);
        if (cancelled.open || cancelled.paused || cancelled.proceeded !== 0 || cancelled.ticks !== 30) failures.push(`world-restart: Escape must cancel and give the ride back: ${JSON.stringify(cancelled)}`);
        if (entered.open || entered.paused || entered.proceeded !== 1) failures.push(`world-restart: Enter must answer yes: ${JSON.stringify(entered)}`);
        if (!(Math.abs(after.s - stationS) <= 6) || after.restarts !== 1 || after.penaltyMs !== 5000 || !(after.elapsedJump >= 5000 && after.elapsedJump < 5100) || !(after.speed <= 15) || after.passed !== before.passed) failures.push(`world-restart: ${JSON.stringify({ stationS, before, after })}`);
        if (next.passed !== 4 || next.restarts !== 1 || next.crashed) failures.push(`world-restart: the ride did not go on to the next station: ${JSON.stringify(next)}`);
        if (excursion.restarts !== 1 || excursion.penaltyMs !== 10000 || excursion.guideCause !== null || excursion.pendingCutMs !== 0) failures.push(`world-restart: an excursion must cost one penalty: ${JSON.stringify(excursion)}`);
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
        for (const view of ['desktop', 'touch']) {
            const h = hud[view];
            if (h.error) { failures.push(`world-hud ${view}: ${h.error}`); continue; }
            if (!/^Stage 2\/\d+ · /.test(h.meta)) failures.push(`world-hud ${view}: the stage line reads ${JSON.stringify(h.meta)}, want Stage 2/<n>`);
            if (h.pips !== h.gateTotal || h.count !== `0/${h.gateTotal}`) failures.push(`world-hud ${view}: ${h.pips} pips and ${h.count} for a stage of ${h.gateTotal} gates`);
            if (h.many.pips !== 0 || h.many.count !== '0/30') failures.push(`world-hud ${view}: 30 gates must show the count and no pips: ${JSON.stringify(h.many)}`);
            if (h.overlaps.length) failures.push(`world-hud ${view}: boxes overlap: ${JSON.stringify(h.overlaps)}`);
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
    const floating = results['world-floating'];
    if (floating) {
        if (!(floating.probes > 0)) failures.push('world-floating: no road edge was checked');
        if (floating.open) failures.push(`world-floating: ${floating.open} drawn road edges stand more than ${floating.tolM} m over the drawn land with nothing under them (worst ${floating.worstOpen[0].gapM} m at s ${floating.worstOpen[0].s} ${floating.worstOpen[0].side}, road LOD${floating.worstOpen[0].roadLod}, land LOD${floating.worstOpen[0].landLod}): ${JSON.stringify(floating.worstOpen.slice(0, 5))}`);
        if (floating.up.hits) failures.push(`world-floating: drawn land or far land stands within ${FLOAT_UP_M} m over the road surface at ${floating.up.hits} points (worst ${floating.up.worst[0].overM} m at s ${floating.up.worst[0].s}): ${JSON.stringify(floating.up.worst.slice(0, 5))}`);
        if (floating.physics.over) failures.push(`world-floating: the physics ground beside the road differs from the drawn ground by more than ${floating.tolM} m at ${floating.physics.over} of ${floating.physics.checked} points (worst ${floating.physics.worstM} m): ${JSON.stringify(floating.physics.worst.slice(0, 5))}`);
        floating.views.forEach(v => {
            if (v.crashed) failures.push(`world-floating: the ride into the view at s ${v.want} crashed`);
            if (v.underside) failures.push(`world-floating: the view at s ${v.want} shows ${v.underside} pixels of a road's underside`);
            if (v.seam && v.seam.profiles && v.seam.seams / v.seam.profiles > FLOAT_SEAM_SHARE) failures.push(`world-floating: the view at s ${v.want} has a dark seam beside the road on ${v.seam.seams} of ${v.seam.profiles} profiles: ${JSON.stringify(v.seam.worst)}`);
        });
    }
    const shots = results['world-shots'];
    if (shots) {
        if (shots.error) failures.push(`world-shots: ${shots.error}`);
        else {
            if (!shots.sites.junction) failures.push('world-shots: no junction barrier on the ride to shoot');
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
