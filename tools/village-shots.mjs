#!/usr/bin/env node
// Screenshots and frame times of night-ride's village, for judging a change
// to its houses by eye. Serves the repo on an ephemeral port and drives the
// real page in Chrome, as tools/terrain-check.mjs does.
//
//   node tools/village-shots.mjs <output directory> <label> [--no-assets] [--gpu] [--times]
//
// Writes <label>-<view>.png for each view below, at night as played and with
// daylight forced. --no-assets keeps the procedural village. --times prints
// the median frame time of each night view instead of writing pictures.
// Never let a page reach production: the hosts below are aborted.
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const BLOCKED_HOSTS = ['cloudfunctions.net', 'firebasedatabase.app', 'firebaseio.com'];
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary' };
const argv = process.argv.slice(2);
const flag = name => argv.includes(`--${name}`);
const [out, label] = argv.filter(a => !a.startsWith('--'));
if (!out || !label) {
    process.stderr.write('usage: node tools/village-shots.mjs <output directory> <label> [--no-assets] [--gpu] [--times]\n');
    process.exit(2);
}
const chrome = process.env.TWISTY_CHROME || process.env.PUPPETEER_EXECUTABLE_PATH;

// Each view: the segment the bike stands at, and where the camera is from it
// (metres to the road's right, up, behind) and looks (right, up, ahead).
// `chase` is the game's own camera after 2.5 s of riding at 20 m/s, which
// is 50 m on from the segment named: the first second of a leg is not its
// steady look (the camera and the post-processing are still settling).
const VIEWS = {
    approach: { segment: 577, chase: true },
    street: { segment: 583, chase: true },
    side: { segment: 586, from: [-5, 2.2, 6], to: [9, 4.5, 6] },
    oblique: { segment: 584, from: [-3, 4, 4], to: [8, 4, 30] },
    roofs: { segment: 586, from: [-4, 26, 30], to: [0, 0, -15] },
    lamp: { segment: 586, from: [1.5, 2, 5], to: [5.6, 3, -2] },
};

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
await new Promise(done => server.listen(0, '127.0.0.1', done));
const port = server.address().port;

const browser = await puppeteer.launch({
    executablePath: chrome || undefined,
    headless: flag('gpu') ? false : 'new',
    args: flag('gpu') ? ['--window-size=1280,800'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
let code = 0;
try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    await page.setRequestInterception(true);
    const errors = [];
    page.on('request', request => {
        const target = new URL(request.url());
        if (BLOCKED_HOSTS.some(host => target.hostname.endsWith(host))) request.abort();
        else if (/jsdelivr\.net\/npm\/three@0\.150\.0\/build\/three\.min\.js/.test(request.url())) {
            request.respond({ status: 200, contentType: 'text/javascript', body: readFileSync(join(root, 'node_modules/three/build/three.min.js')) });
        } else request.continue();
    });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction('window.game && window.game.tourSystem', { timeout: 60000 });
    await page.addScriptTag({ path: join(root, 'tools/autopilot.js') });
    if (flag('no-assets')) await page.evaluate(() => { SceneAssets.dress = () => null; });
    const renderer = await page.evaluate(() => {
        const gl = document.createElement('canvas').getContext('webgl2');
        const info = gl.getExtension('WEBGL_debug_renderer_info');
        return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unknown';
    });

    const pose = async (view, daylight) => page.evaluate(async (view, daylight) => {
        game.adaptResolution = () => {};
        twistyDev.start('night-ride');
        twistyDev.freeze();
        game.rockfalls = null;
        game.traffic = null;
        if (typeof BikeModels !== 'undefined') await BikeModels.preload();
        const dressed = game.environment.dressing ? await game.environment.dressing : null;
        if (daylight) game.setTimeOfDay('golden');
        twistyDev.teleport(view.segment);
        if (view.chase) {
            twistyDev.autopilot({ speed: 20, lane: -3 });
            game.vehicle.speed = 20;
            twistyDev.step(150, { render: true });
        } else {
            const p = game.environment.roadPath[view.segment];
            const at = ([side, up, ahead]) => new THREE.Vector3(
                p.x + Math.cos(p.heading) * side + Math.sin(p.heading) * ahead, p.y + up, p.z - Math.sin(p.heading) * side + Math.cos(p.heading) * ahead);
            game.paused = true;
            game.camera.up.set(0, 1, 0);
            game.camera.fov = 60;
            game.camera.updateProjectionMatrix();
            game.camera.position.copy(at(view.from));
            game.camera.lookAt(at(view.to));
        }
        const gl = game.graphics.renderer.getContext();
        const pixel = new Uint8Array(4);
        const frame = () => {
            const t0 = performance.now();
            game.graphics.render(game.scene, game.camera);
            gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
            return performance.now() - t0;
        };
        for (let i = 0; i < 5; i++) frame();
        // Every draw call of one frame: the shadow pass, the scene and the post passes
        const info = game.graphics.renderer.info;
        info.autoReset = false;
        info.reset();
        frame();
        const calls = info.render.calls;
        info.autoReset = true;
        const times = Array.from({ length: 60 }, frame).sort((a, b) => a - b);
        const village = game.scene.children.find(o => o.userData.setPiece === 'village');
        let meshes = 0;
        let triangles = 0;
        village.traverse(o => {
            if (!o.isMesh) return;
            meshes++;
            triangles += ((o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3) * (o.isInstancedMesh ? o.count : 1);
        });
        let lights = 0;
        game.scene.traverse(o => { if (o.isLight) lights++; });
        return { ms: Math.round(times[30] * 100) / 100, village: dressed && dressed.village, meshes, triangles: Math.round(triangles), lights, calls };
    }, view, daylight);

    mkdirSync(out, { recursive: true });
    const report = { renderer, label, views: {} };
    // Every night view before any day view, so no night frame follows a change of the time of day
    for (const daylight of flag('times') ? [false] : [false, true]) {
        for (const [name, view] of Object.entries(VIEWS)) {
            const result = await pose(view, daylight);
            report.views[`${name}${daylight ? '-day' : ''}`] = result;
            if (!flag('times')) await page.screenshot({ path: join(out, `${label}-${name}${daylight ? '-day' : '-night'}.png`) });
        }
    }
    report.pageErrors = errors;
    if (errors.length) code = 1;
    process.stdout.write(`${JSON.stringify(report, null, 1)}\n`);
} finally {
    await browser.close();
    server.close();
}
process.exit(code);
