#!/usr/bin/env node
// Browser proof for the home screen (.agent/system/ui.md, "The home screen"): the menu at 1024x640, 1440x900 and a
// phone (390x844, touch), on the plain page as a player opens it.
//   - the rider's panel: its parts (the title, the card, the modes, the buttons) meet nowhere, stay on screen, and on
//     a wide window the panel needs no scrolling;
//   - the rider: the chosen bike is drawn inside the stage box, beside the panel, never under it; it follows the
//     rider, bike and outfit chosen (the showcase's bike is the tour system's choice after each step);
//   - the map (RIDE): its parts meet nowhere and stay on screen, every row of the tour has a line with a hit area
//     and every tour row with a line a pin, no two pins and no two place names meet, nor a pin and a name; a closed
//     leg does not ride; the arrow keys step the legs (wide windows);
//   - no GPU memory is left behind: the renderer's geometry and texture counts at the menu are the same after a
//     classic leg ridden and left, twice (the second and third menus).
// With --out <dir> it saves a picture of each screen, the map with a leg hovered among them.
//
//   node tools/home-check.mjs [--out <dir>] [--only 1024x640,1440x900,phone] [--chrome <path>] [--gpu] [--no-dispose]
//
// Chrome: --chrome <path>, else TWISTY_CHROME, else puppeteer's own. Never lets a page reach production.
// Exit: 0 every check held, 1 a check failed, 2 no Chrome.
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const BLOCKED_HOSTS = ['cloudfunctions.net', 'firebasedatabase.app', 'firebaseio.com'];
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };
const SIZES = {
    '1024x640': { width: 1024, height: 640, deviceScaleFactor: 1 },
    '1440x900': { width: 1440, height: 900, deviceScaleFactor: 1 },
    phone: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
};

const argv = process.argv.slice(2);
const option = name => {
    const at = argv.indexOf(`--${name}`);
    return at >= 0 ? argv[at + 1] : undefined;
};
const outDir = option('out');
const only = option('only') ? option('only').split(',') : Object.keys(SIZES);
const gpu = argv.includes('--gpu');
const dispose = !argv.includes('--no-dispose');
if (outDir) mkdirSync(outDir, { recursive: true });

function chromePath() {
    const candidate = option('chrome') || process.env.TWISTY_CHROME || process.env.PUPPETEER_EXECUTABLE_PATH;
    if (candidate) return candidate;
    try {
        return puppeteer.executablePath();
    } catch {
        process.stderr.write('Set TWISTY_CHROME or run: npx puppeteer browsers install chrome\n');
        process.exit(2);
    }
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

const pause = ms => new Promise(done => setTimeout(done, ms));

// Boxes that must not meet and must stay on screen; `inside` names a box each must keep within
function layout(pairs) {
    const problems = [];
    const box = (selector) => {
        const el = document.querySelector(selector);
        if (!el) return null;
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return null;
        const r = el.getBoundingClientRect();
        return r.width < 1 || r.height < 1 ? null : r;
    };
    const meet = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
    const shown = pairs.items.map(s => [s, box(s)]).filter(([, r]) => r);
    for (const [s, r] of shown) {
        if (r.left < -0.5 || r.top < -0.5 || r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5) problems.push(`${s} leaves the screen (${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)})`);
    }
    for (let i = 0; i < shown.length; i++) {
        for (let j = i + 1; j < shown.length; j++) {
            if (meet(shown[i][1], shown[j][1])) problems.push(`${shown[i][0]} meets ${shown[j][0]}`);
        }
    }
    // Groups of many (pins, names): none meets another of any group listed
    const many = (pairs.many || []).flatMap(s => [...document.querySelectorAll(s)].map((el, k) => [`${s}[${k}] ${el.textContent.trim()}`, el.getBoundingClientRect()]));
    for (let i = 0; i < many.length; i++) {
        for (let j = i + 1; j < many.length; j++) {
            if (meet(many[i][1], many[j][1])) problems.push(`${many[i][0]} meets ${many[j][0]}`);
        }
    }
    if (pairs.within) {
        const frame = box(pairs.within);
        for (const [s, r] of many) {
            if (frame && (r.left < frame.left - 0.5 || r.right > frame.right + 0.5 || r.top < frame.top - 0.5 || r.bottom > frame.bottom + 0.5)) problems.push(`${s} leaves ${pairs.within}`);
        }
    }
    if (pairs.noScroll) {
        const el = document.querySelector(pairs.noScroll);
        if (el && el.scrollHeight > el.clientHeight + 1) problems.push(`${pairs.noScroll} needs scrolling (${el.scrollHeight} px in ${el.clientHeight})`);
    }
    return problems;
}

// The focused bike, projected: its screen box lies inside the stage box, and it is the rider, bike and outfit chosen
function riderCheck() {
    const problems = [];
    const g = window.game, tour = g.tourSystem;
    const order = tour.riderDisplayOrder();
    const rider = order[tour.riderFocusIndex];
    if (g.showcaseFocusId !== rider.id) problems.push(`the stage shows ${g.showcaseFocusId}, the panel ${rider.id}`);
    const bike = g.showcaseBikes && g.showcaseBikes[rider.id];
    if (!bike) return [...problems, 'no bike on the stage'];
    if (tour.riderTierFor(rider.id) === 'lit') {
        if (bike.model !== tour.getSelectedBike(rider.id)) problems.push(`the stage's bike is ${bike.model}, the chosen ${tour.getSelectedBike(rider.id)}`);
        const outfit = tour.getSelectedOutfit(rider.id);
        if (outfit && bike.outfit && bike.outfit.id !== outfit) problems.push(`the stage's outfit is ${bike.outfit.id}, the chosen ${outfit}`);
    }
    const stage = document.querySelector('.home-stage').getBoundingClientRect();
    if (stage.width < 48 || stage.height < 48) return [...problems, `the stage box is ${Math.round(stage.width)}x${Math.round(stage.height)}`];
    const box = new THREE.Box3().setFromObject(bike.group);
    g.camera.updateMatrixWorld();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const cx of [box.min.x, box.max.x]) for (const cy of [box.min.y, box.max.y]) for (const cz of [box.min.z, box.max.z]) {
        const p = new THREE.Vector3(cx, cy, cz).project(g.camera);
        const sx = (p.x + 1) / 2 * innerWidth, sy = (1 - p.y) / 2 * innerHeight;
        x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
    // The box's corners overstate the bike seen from a quarter: 10% of the stage is allowed past its edge
    const slack = 0.1;
    if (x0 < stage.left - stage.width * slack || x1 > stage.right + stage.width * slack || y0 < stage.top - stage.height * slack || y1 > stage.bottom + stage.height * slack) {
        problems.push(`the bike (${Math.round(x0)}..${Math.round(x1)}, ${Math.round(y0)}..${Math.round(y1)}) is not inside the stage (${Math.round(stage.left)}..${Math.round(stage.right)}, ${Math.round(stage.top)}..${Math.round(stage.bottom)})`);
    }
    if ((x1 - x0) < stage.width * 0.3 && (y1 - y0) < stage.height * 0.3) problems.push('the bike is drawn small in its stage');
    return problems;
}

// The map's rules that hold at any size: every tour row has a line and a hit area, every tour row with a line its
// pin, an earlier leg a button; the closed legs are marked so
function mapRows() {
    const problems = [];
    const rows = WorldLegs.LIST.filter(l => l.n);
    for (const leg of rows) {
        const group = document.querySelector(`#world-legs .map-leg[data-leg="${leg.id}"]`);
        if (!group) { problems.push(`leg ${leg.n} has no line`); continue; }
        const hit = group.querySelector('.map-hit');
        if (!hit || getComputedStyle(hit).pointerEvents !== 'stroke' || parseFloat(getComputedStyle(hit).strokeWidth) < 12) problems.push(`leg ${leg.n} has no hit area`);
        if (!document.querySelector(`#world-legs .map-pin[data-leg="${leg.id}"]`)) problems.push(`leg ${leg.n} has no pin`);
    }
    for (const leg of WorldLegs.LIST.filter(l => !l.n)) {
        if (!document.querySelector(`#world-legs .map-earlier-btn[data-leg="${leg.id}"]`)) problems.push(`the earlier leg ${leg.id} is not listed`);
    }
    return problems;
}

async function run(browser, port, name) {
    const viewport = SIZES[name];
    const failures = [];
    const errors = [];
    // The browser's own first tab, in front: a second tab would be in the background, where frames stall
    const [page] = await browser.pages();
    await page.bringToFront();
    page.removeAllListeners('request');
    page.removeAllListeners('pageerror');
    page.setDefaultNavigationTimeout(120000);
    page.setDefaultTimeout(60000);
    await page.setViewport(viewport);
    await page.setRequestInterception(true);
    page.on('request', request => {
        const target = new URL(request.url());
        if (BLOCKED_HOSTS.some(host => target.hostname.endsWith(host))) request.abort();
        else if (/jsdelivr\.net\/npm\/three@0\.150\.0\/build\/three\.min\.js/.test(request.url())) request.respond({ status: 200, contentType: 'text/javascript', body: readFileSync(join(root, 'node_modules/three/build/three.min.js')) });
        else request.continue();
    });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction('window.game && window.game.showcaseBikes && document.querySelector(".tour-selector-overlay")', { timeout: 120000, polling: 250 });
    if (!gpu) await page.evaluate(() => { window.game.renderer.setPixelRatio(0.5); });
    if (viewport.hasTouch) await page.evaluate(() => document.body.classList.add('touch'));
    const shot = async (label) => { if (outDir) await page.screenshot({ path: join(outDir, `${name}-${label}.png`) }); };
    const check = (label, problems) => problems.forEach(p => failures.push(`${label}: ${p}`));
    const wide = !viewport.hasTouch;
    // The modelled bike is fetched on focus: give it time, then let the camera settle
    const settle = async () => { await page.waitForFunction(() => { const g = window.game; const v = g.showcaseBikes && g.showcaseBikes[g.showcaseFocusId]; return !v || !v.dressing || v.modelled; }, { timeout: 30000, polling: 200 }).catch(() => null); await pause(1500); };
    await settle();
    const homeItems = ['.home-stage', '.home-panel'];
    const panelItems = ['.home .tour-title', '.home .character-select-screen .showcase-label', '.home .showcase-info', '#gameModeRow', '#riderModeRow', '.home .character-select-screen .showcase-actions'];
    check('home', await page.evaluate(layout, { items: homeItems }));
    // (a phone's panel scrolls, its buttons at its foot: read at the end of the scroll, its parts must not meet)
    if (!wide) await page.evaluate(() => { const panel = document.querySelector('.home-panel'); panel.scrollTop = panel.scrollHeight; });
    check('home panel', await page.evaluate(layout, { items: wide ? panelItems : [], many: wide ? [] : panelItems, noScroll: wide ? '.home-panel' : null }));
    if (!wide) await page.evaluate(() => { document.querySelector('.home-panel').scrollTop = 0; });
    check('home rider', await page.evaluate(riderCheck));
    await shot('home');

    // The rider follows each choice: the next rider, a bike up and down, an outfit
    await page.click('#riderNextBtn');
    await settle();
    check('next rider', await page.evaluate(riderCheck));
    await page.click('#riderPrevBtn');
    await settle();
    const steps = await page.evaluate(() => ({ bike: !!document.querySelector('#bikeNextBtn:not([disabled])'), outfit: !!document.querySelector('#outfitNextBtn:not([disabled])') }));
    if (steps.outfit) {
        await page.click('#outfitNextBtn');
        await settle();
        check('next outfit', await page.evaluate(riderCheck));
        await shot('home-outfit');
    }
    if (steps.bike) {
        await page.click('#bikeNextBtn');
        await settle();
        check('next bike', await page.evaluate(riderCheck));
    }

    // The map
    await page.click('#riderContinueBtn');
    await page.waitForFunction(() => document.querySelector('#world-legs .map-pin'), { timeout: 10000 });
    await page.waitForFunction(() => { const img = document.querySelector('#world-legs .map-relief'); return img && img.getAttribute('href'); }, { timeout: 30000, polling: 200 }).catch(() => failures.push('map: the relief was never drawn'));
    await pause(800);
    check('map rows', await page.evaluate(mapRows));
    check('map', await page.evaluate(layout, { items: ['#world-legs .map-head', '#world-legs .map-box', '#world-legs .map-card', '#world-legs .map-go'] }));
    check('map pins and names', await page.evaluate(layout, { items: [], many: ['#world-legs .map-pin', '#world-legs .map-place'], within: '#world-legs .map-frame' }));
    if (wide) check('map beside the rider', await page.evaluate(riderCheck));
    await shot('map');
    // Hover: a leg not yet built shows in the card as coming later; an open one with its numbers
    const hover = async (id, label) => {
        const point = await page.evaluate(sel => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, `#world-legs .map-pin[data-leg="${id}"]`);
        if (!point) { failures.push(`map: no pin for ${id}`); return; }
        if (viewport.hasTouch) await page.touchscreen.tap(point.x, point.y);
        else await page.mouse.move(point.x, point.y);
        await pause(300);
        const card = await page.evaluate(() => ({ name: document.querySelector('#world-legs .map-name').textContent, state: document.querySelector('#world-legs .map-state').textContent, stats: [...document.querySelectorAll('#world-legs .map-stat dd')].map(d => d.textContent) }));
        if (!card.name || card.stats.some(s => !s)) failures.push(`map: hovering ${id} shows an empty card`);
        await shot(label);
        return card;
    };
    const planned = await page.evaluate(() => (WorldLegs.LIST.find(l => l.planned) || {}).id);
    if (planned) {
        const card = await hover(planned, 'map-hover-later');
        if (card && card.state !== 'Coming later') failures.push(`map: a leg not built says "${card.state}"`);
        // A leg not built does not ride: chosen, RIDE is off, and a second click rides nothing
        if (!viewport.hasTouch) await page.click(`#world-legs .map-pin[data-leg="${planned}"]`);
        await page.click(`#world-legs .map-pin[data-leg="${planned}"]`);
        const still = await page.evaluate(() => ({ open: !!document.getElementById('world-legs'), ride: document.querySelector('#world-legs .map-ride').disabled }));
        if (!still.open || !still.ride) failures.push('map: a leg not built could be ridden');
    }
    await hover('airolo-lookout', 'map-hover');
    if (wide) {
        // The keys: right steps to the next leg, left back, through the dialog stack
        const before = await page.evaluate(() => document.getElementById('world-legs').mapState().chosen);
        await page.keyboard.press('ArrowRight');
        const after = await page.evaluate(() => document.getElementById('world-legs').mapState().chosen);
        await page.keyboard.press('ArrowLeft');
        const back = await page.evaluate(() => document.getElementById('world-legs').mapState().chosen);
        const want = await page.evaluate((id) => { const list = WorldLegs.LIST; return list[Math.min(list.length - 1, list.findIndex(l => l.id === id) + 1)].id; }, before);
        if (after !== want || back !== before) failures.push(`map: the arrow keys stepped ${before} -> ${after} -> ${back}, want ${want} and back`);
    }
    // Back to the rider
    await page.click('#world-legs .map-back');
    await pause(400);
    if (await page.evaluate(() => !!document.getElementById('world-legs'))) failures.push('map: Back left the map open');

    // GPU memory across menus: a classic leg ridden and left, three times; the second and third menus hold the same
    if (dispose && wide && name === only.find(n => SIZES[n] && !SIZES[n].hasTouch)) {
        const counts = [];
        for (let round = 0; round < 3; round++) {
            await page.click('#riderClassicBtn');
            await pause(500);
            await page.click('#legStartBtn');
            await page.waitForFunction('window.game.environment && !window.game.environment.isWorld && window.game.vehicle && !window.game.showcaseMode', { timeout: 120000, polling: 250 });
            await pause(1500);
            await page.evaluate(() => window.game.returnToMenu());
            // (a player back from a leg lands on the classic leg screen: back to the rider)
            await page.waitForFunction('window.game.showcaseMode && document.querySelector("#backToRidersBtn") && getComputedStyle(document.querySelector(".tour-selector-overlay")).display !== "none"', { timeout: 60000, polling: 250 });
            await page.click('#backToRidersBtn');
            await page.waitForFunction('window.game.showcaseBikes', { timeout: 60000, polling: 250 });
            await settle();
            counts.push(await page.evaluate(() => ({ ...window.game.renderer.info.memory })));
        }
        if (counts[1].geometries !== counts[2].geometries || counts[1].textures !== counts[2].textures) failures.push(`dispose: the menu's GPU memory grew: ${counts.map(c => `${c.geometries} geometries, ${c.textures} textures`).join(' -> ')}`);
        process.stderr.write(`      menu GPU memory after each leg: ${counts.map(c => `${c.geometries}/${c.textures}`).join(', ')} (geometries/textures)\n`);
        check('home after legs', await page.evaluate(riderCheck));
    }
    return [...failures, ...errors.map(e => `page error: ${e}`)];
}

const server = await startServer();
const port = server.address().port;
const renderer = gpu ? [] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const launch = () => puppeteer.launch({ protocolTimeout: 300000, executablePath: chromePath(), headless: 'new', args: ['--no-sandbox', ...renderer, '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
let failed = 0;
try {
    // A fresh browser for each size: a phone's viewport on a page that rode a leg does not load cleanly
    for (const name of only) {
        if (!SIZES[name]) continue;
        const browser = await launch();
        const failures = await run(browser, port, name).catch(error => [`error: ${error.message.split('\n')[0]}`]);
        await browser.close().catch(() => {});
        failed += failures.length ? 1 : 0;
        process.stderr.write(`${failures.length ? 'FAIL' : 'ok  '} ${name}${failures.length ? `\n      ${failures.join('\n      ')}` : ''}\n`);
    }
} finally {
    server.close();
}
process.stderr.write(`${failed} of ${only.length} sizes failed${outDir ? `; pictures in ${outDir}` : ''}\n`);
process.exit(failed ? 1 : 0);
