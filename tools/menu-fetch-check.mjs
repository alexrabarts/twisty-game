#!/usr/bin/env node
// Browser proof of what the menu fetches (.agent/system/ui.md, "What the menu fetches"): from a cold load of the plain
// page, every model file (.glb) the page asks for, its size and when, through the rider page, stepping riders, bikes
// and outfits, the map, and the start of a world ride. The rules it holds:
//   - the rider page fetches the rider file (assets/bikes/rider.glb) and the shown bike's detail file, and no other
//     bike file: a bike not shown stands in as its far file or the procedural model;
//   - each step to a bike not shown before fetches that bike's detail file and nothing else; a step back, or to an
//     outfit of the same bike, fetches nothing;
//   - the map fetches nothing;
//   - the world ride's start fetches no detail file but the one of the bike ridden (already in), and the crew's far
//     files and the light rider, as it did before.
//
//   node tools/menu-fetch-check.mjs [--chrome <path>] [--json <file>] [--no-ride]
//
// Chrome: --chrome <path>, else TWISTY_CHROME, else puppeteer's own. Never lets a page reach production.
// Exit: 0 every rule held, 1 a rule failed, 2 no Chrome.
import { createReadStream, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const BLOCKED_HOSTS = ['cloudfunctions.net', 'firebasedatabase.app', 'firebaseio.com'];
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };
const argv = process.argv.slice(2);
const option = name => { const at = argv.indexOf(`--${name}`); return at >= 0 ? argv[at + 1] : undefined; };
const ride = !argv.includes('--no-ride');

function chromePath() {
    const candidate = option('chrome') || process.env.TWISTY_CHROME || process.env.PUPPETEER_EXECUTABLE_PATH;
    if (candidate) return candidate;
    try { return puppeteer.executablePath(); } catch {
        process.stderr.write('Set TWISTY_CHROME or run: npx puppeteer browsers install chrome\n');
        process.exit(2);
    }
}

const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
    const file = join(root, path === '/' ? 'index.html' : path);
    if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    createReadStream(file).pipe(res);
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const port = server.address().port;
const pause = ms => new Promise(done => setTimeout(done, ms));

const browser = await puppeteer.launch({ protocolTimeout: 300000, executablePath: chromePath(), headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const failures = [];
const fetched = [];
let phase = 'cold';
let started = Date.now();
try {
    const [page] = await browser.pages();
    await page.setViewport({ width: 1440, height: 900 });
    await page.setRequestInterception(true);
    page.on('request', request => {
        const target = new URL(request.url());
        if (BLOCKED_HOSTS.some(host => target.hostname.endsWith(host))) request.abort();
        else if (/three@0\.150\.0\/build\/three\.min\.js/.test(request.url())) request.respond({ status: 200, contentType: 'text/javascript', body: readFileSync(join(root, 'node_modules/three/build/three.min.js')) });
        else {
            if (target.pathname.endsWith('.glb')) {
                const file = target.pathname.replace(/^\//, '');
                fetched.push({ phase, file, bytes: statSync(join(root, file)).size, ms: Date.now() - started });
            }
            request.continue();
        }
    });
    page.on('pageerror', error => failures.push(`page error: ${error.message}`));
    // A rider with a second bike open, so the bike row steps: set in the page's store, then a cold load (the page's
    // model cache is the page's own, and the server sends no-store)
    phase = 'setup';
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction('window.game && window.game.showcaseBikes', { timeout: 120000, polling: 250 });
    await page.evaluate(() => localStorage.setItem('twistyBikeUnlocks', JSON.stringify(Object.fromEntries(CHARACTERS.map(c => [c.id, 2])))));
    fetched.length = 0;
    phase = 'cold';
    started = Date.now();
    await page.reload({ waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction('window.game && window.game.showcaseBikes', { timeout: 120000, polling: 250 });
    await page.evaluate(() => { window.game.renderer.setPixelRatio(0.5); });
    const settle = async () => {
        await page.waitForFunction(() => { const g = window.game; const v = g.showcaseBikes && g.showcaseBikes[g.showcaseFocusId]; return !v || v.modelled || !v.dressing; }, { timeout: 60000, polling: 200 }).catch(() => null);
        await pause(1500);
    };
    // The detail file of the bike on show: the tour system's choice for the focused rider
    const shown = () => page.evaluate(() => {
        const t = window.game.tourSystem, c = t.riderDisplayOrder()[t.riderFocusIndex];
        // (a locked rider next in line is shown, dimmed; one further on is a silhouette, with no file of its own)
        return { rider: c.id, file: BikeModels.file({ model: t.getSelectedBike(c.id) }), lit: window.game.riderTier(c.id) !== 'silhouette' };
    });
    const bikeFiles = list => list.filter(f => f.file.startsWith('assets/bikes/'));
    const seen = new Set();
    const expect = (label, want) => {
        const got = bikeFiles(fetched.filter(f => f.phase === label)).map(f => f.file).sort();
        const need = [...want].filter(f => !seen.has(f)).sort();
        got.forEach(f => seen.add(f));
        if (JSON.stringify(got) !== JSON.stringify(need)) failures.push(`${label}: fetched [${got.join(', ')}], want [${need.join(', ')}]`);
    };

    await settle();
    let show = await shown();
    expect('cold', ['assets/bikes/rider.glb', show.file]);

    const step = async (label, selector) => {
        phase = label;
        const there = await page.$(`${selector}:not([disabled])`);
        if (!there) { process.stderr.write(`      (${label}: no ${selector} to press)\n`); return; }
        await page.click(selector);
        await settle();
        show = await shown();
        expect(label, show.lit ? [show.file] : []);
    };
    await step('next outfit', '#outfitNextBtn');
    await step('next bike', '#bikeNextBtn');
    await step('previous bike', '#bikePrevBtn');
    await step('next rider', '#riderNextBtn');
    await step('previous rider', '#riderPrevBtn');

    phase = 'map';
    await page.click('#riderContinueBtn');
    await page.waitForFunction(() => document.querySelector('#world-legs .map-pin'), { timeout: 30000 });
    await pause(3000);
    expect('map', []);

    if (ride) {
        phase = 'ride start';
        await page.click('#world-legs .map-ride');
        await page.waitForFunction('window.game.environment && window.game.environment.isWorld && window.game.vehicle && window.game.worldRun', { timeout: 600000, polling: 500 });
        await pause(3000);
        const files = bikeFiles(fetched.filter(f => f.phase === 'ride start')).map(f => f.file);
        const details = files.filter(f => f.startsWith('assets/bikes/detail/'));
        if (details.length) failures.push(`ride start: fetched detail files [${details.join(', ')}]`);
    }
} catch (error) {
    failures.push(`error: ${error.message.split('\n')[0]}`);
} finally {
    await browser.close().catch(() => {});
    server.close();
}
const json = option('json');
if (json) writeFileSync(json, `${JSON.stringify({ fetched, failures }, null, 1)}\n`);
for (const f of fetched) process.stdout.write(`${f.phase.padEnd(16)} ${String(f.ms).padStart(6)} ms  ${String(f.bytes).padStart(9)} B  ${f.file}\n`);
const sum = list => list.reduce((n, f) => n + f.bytes, 0);
const phases = [...new Set(fetched.map(f => f.phase))];
process.stdout.write(phases.map(p => `${p}: ${fetched.filter(f => f.phase === p).length} files, ${sum(fetched.filter(f => f.phase === p))} B`).join('\n') + '\n');
process.stderr.write(failures.length ? `FAIL\n      ${failures.join('\n      ')}\n` : 'ok   every rule held\n');
process.exit(failures.length ? 1 : 0);
