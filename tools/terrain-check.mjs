#!/usr/bin/env node
// Browser proof harness for the terrain work. Serves the repo on an ephemeral
// port, drives the real page in Chrome and prints one JSON document.
//
//   node tools/terrain-check.mjs <probe>[,<probe>] [--legs id,id] [--chrome <path>] [--gpu]
//   node tools/terrain-check.mjs record-frozen          (phase 0a only: writes tests/golden/browser-baseline.json)
//   node tools/terrain-check.mjs record-jest            (phase 0a only: writes tests/golden/terrain-baseline.json)
//   node tools/terrain-check.mjs <probe> --add parts,surface   (writes tests/golden/parts-baseline.json)
//   node tools/terrain-check.mjs <probe> --update-baseline --legs id [--part ground,decals]
//   node tools/terrain-check.mjs baseline-diff [--against <sha>]
//
// Probes: legs snapshot raycast surface frames traj gates look shortcuts pages budget mutate
// Chrome: --chrome <path>, else TWISTY_CHROME, else PUPPETEER_EXECUTABLE_PATH, else puppeteer's own.
// Exit: 0 ok, 1 failures, 2 no Chrome or no window.game, 3 --gpu without a hardware renderer.
//
// Baselines
//   tests/golden/browser-baseline.json   frozen at phase 0a: its sha256 must not change
//   tests/golden/terrain-baseline.json   frozen at phase 0a: the jest goldens
//   tests/golden/parts-baseline.json     mutable per-leg `parts` and `surface`, guarded as below
// Never let a page reach production: cloudfunctions.net, firebasedatabase.app and firebaseio.com are aborted.
import { execFileSync, spawnSync } from 'node:child_process';
import { createReadStream, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { D6_CLASSES, buildEnvironment, captureLeg, loadGame } from '../tests/helpers/load-game.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const FROZEN = join(root, 'tests/golden/browser-baseline.json');
const JEST_GOLDEN = join(root, 'tests/golden/terrain-baseline.json');
const PARTS = join(root, 'tests/golden/parts-baseline.json');
const LEG_IDS = ['mountain-dawn', 'valley-run', 'coastal-descent', 'foggy-gorge', 'high-pass', 'storm-valley', 'night-ride', 'winter-pass'];
const FROZEN_SECTIONS = ['snapshot', 'raycast', 'frames', 'traj', 'gates', 'look', 'shortcuts', 'budget'];
const BLOCKED_HOSTS = ['cloudfunctions.net', 'firebasedatabase.app', 'firebaseio.com'];
const LATERALS = [-80, -40, -20, -12, 0, 12, 20, 40, 80];
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg' };

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

const state = { blocked: [], notFound: [], pageErrors: [], lastError: '' };

async function openPage(browser, port, url = '/') {
    const page = await browser.newPage();
    await page.setViewport({ width: 960, height: 540, deviceScaleFactor: 1 });
    await page.setRequestInterception(true);
    page.on('request', request => {
        const target = new URL(request.url());
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
    page.on('console', message => { if (message.type() === 'error') state.lastError = message.text().slice(0, 200); });
    page.on('pageerror', error => state.pageErrors.push(`${url}: ${error.message}`));
    // One seeded generator, reset before each leg starts
    await page.evaluateOnNewDocument(() => {
        let seed = 1;
        window.__reseed = value => { seed = value; };
        Math.random = () => {
            seed = (seed + 0x6d2b79f5) | 0;
            let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    });
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

    P.snapshot = async legIndex => {
        const { env, scene, marks, buildMs } = P.build(legIndex);
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

    // Chord search: no straight rideable chord may be much shorter than the road it replaces
    P.shortcuts = legIndex => {
        const { env } = P.build(legIndex);
        const path = env.roadPath;
        const a = env.startSegment, b = Math.min(env.endSegment, path.length - 1);
        const limit = env.roadWidth / 2 + 2; // road plus ledge: the rideable ground today
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
                    let best = Infinity;
                    for (let n = Math.max(a, i - 3); n <= Math.min(b, j + 3); n++) {
                        const d = Math.hypot(x - path[n].x, z - path[n].z);
                        if (d < best) best = d;
                    }
                    ok = best <= limit;
                }
                if (ok) open.push([i, j, round(chord, 10), round(road, 10)]);
            }
        }
        return open;
    };

    // Where the leg's gates sit and the nearest foreign road stretch inside each gate's band
    P.gateMap = legIndex => {
        const { env } = P.build(legIndex);
        const path = env.roadPath;
        const gates = env.checkpoints.map(c => ({ name: `cp${c.index}`, position: c.position, heading: c.heading, segment: c.segmentIndex }));
        if (env.finishLinePosition) {
            const f = env.finishLinePosition;
            let best = 0, bd = Infinity;
            path.forEach((p, i) => { const d = Math.hypot(p.x - f.x, p.z - f.z); if (d < bd) { bd = d; best = i; } });
            gates.push({ name: 'finish', position: f, heading: env.finishLineHeading, segment: best });
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
        game.showFinishScreen = () => {};
        if (gate === 'finish') {
            // Ten segments short of the finish line, which sits just past endSegment
            const f = game.environment.finishLinePosition;
            let near = 0, best = Infinity;
            game.environment.roadPath.forEach((p, i) => { const d = Math.hypot(p.x - f.x, p.z - f.z); if (d < best) { best = d; near = i; } });
            twistyDev.teleport(near - 10);
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
        for (let tick = 1; tick <= 9000; tick++) {
            twistyDev.step(1);
            while (seen < game.checkpointsPassed) { out.checkpointTicks.push(tick); seen++; }
            if (tick % 60 === 0) out.positions.push([game.vehicle.position.x, game.vehicle.position.y, game.vehicle.position.z].map(n => round(n)));
            if (game.finished) { out.finishTick = tick; break; }
            if (game.vehicle.crashed) { out.crashTick = tick; break; }
        }
        return out;
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
    legs: (page, i) => inPage(page, 'legCheck', i, 60),
    snapshot: (page, i) => inPage(page, 'snapshot', i),
    raycast: (page, i) => inPage(page, 'raycast', i),
    surface: (page, i) => inPage(page, 'surface', i),
    parts: (page, i) => inPage(page, 'parts', i),
    frames: (page, i) => inPage(page, 'frames', i),
    look: (page, i) => inPage(page, 'look', i),
    shortcuts: (page, i) => inPage(page, 'shortcuts', i),
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
        const snap = await inPage(page, 'snapshot', i);
        return { ...snap.counts, buildMs: snap.buildMs };
    },
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
    if (!probes.length) fail(2, 'Name a probe: legs snapshot raycast surface parts frames traj gates look shortcuts pages budget mutate | record-jest | record-frozen | baseline-diff');

    const executablePath = chromePath();
    const gpu = flag('gpu');
    const server = await startServer();
    const port = server.address().port;
    const args = gpu ? [] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
    const launch = () => puppeteer.launch({ protocolTimeout: 900000, executablePath, headless: gpu ? false : 'new', args: ['--no-sandbox', ...args] });
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
            const sections = [...new Set([...guarded, ...probes.flatMap(name => (name === 'record-frozen' ? [...FROZEN_SECTIONS, 'pages'] : [name]))])];
            for (const name of sections) {
                if (name === 'pages') {
                    report.results.pages = await withBrowser(browser => pagesProbe(browser, port));
                } else if (PROBES[name]) {
                    report.results[name] = await withBrowser(browser => runPool(browser, port, legIds, (page, i, id) => PROBES[name](page, i, id)));
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
        const comparable = Object.fromEntries(Object.entries(fresh).map(([id, sections]) => [id, Object.fromEntries(Object.entries(sections).filter(([s]) => FROZEN_SECTIONS.includes(s)))]));
        failures.push(...diffAgainst(frozen, comparable, 'frozen'));
        if (results.pages && frozen.pages && !same(frozen.pages, results.pages)) failures.push('pages differ from the frozen baseline');
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

main();
