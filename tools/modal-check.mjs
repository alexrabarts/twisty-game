#!/usr/bin/env node
// Browser proof for the game's dialogs (crash, finish, pause, the world ride's confirm, credits, settings, best times,
// the name entry and the menu). Opens them in every reachable sequence with real clicks, taps and key presses, and after each
// step checks the one rule every dialog keeps (js/modals.js):
//   - exactly one dialog is interactive, and it is the one the step opened (the others are hidden or inert)
//   - every button of that dialog is the element under its own centre (document.elementFromPoint), so a click lands
//   - keyboard focus is inside it
// and that the step's click or key had its effect (the next dialog on top, the one below back, or the menu).
//
//   node tools/modal-check.mjs [--only name,name] [--variant desktop|touch|both] [--out <dir>] [--jobs N] [--chrome <path>] [--gpu] [--port N]
//
// The menu sequences start on the plain page (no query), as a player does: choosing a rider rides the world, Classic
// legs rides a leg, and a world whose data does not load hands over to the legs (menu-world-fallback answers every
// world/ request with a 404). --gpu renders on the machine's GPU at full resolution, for screenshots worth looking at.
//
// Chrome: --chrome <path>, else TWISTY_CHROME, else PUPPETEER_EXECUTABLE_PATH, else puppeteer's own.
// Never lets a page reach production: cloudfunctions.net, firebasedatabase.app and firebaseio.com are aborted.
// Exit: 0 every sequence held, 1 a step failed or a page did not start (three tries), 2 no Chrome.
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const BLOCKED_HOSTS = ['cloudfunctions.net', 'firebasedatabase.app', 'firebaseio.com'];
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };
const VIEWPORTS = {
    desktop: { width: 1280, height: 800, deviceScaleFactor: 1 },
    touch: { width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true }
};

const argv = process.argv.slice(2);
const option = name => {
    const at = argv.indexOf(`--${name}`);
    return at >= 0 ? argv[at + 1] : undefined;
};
const only = option('only') ? option('only').split(',') : null;
const variants = (option('variant') || 'both') === 'both' ? ['desktop', 'touch'] : [option('variant')];
const outDir = option('out');
const jobs = Number(option('jobs') || 3);
const gpu = argv.includes('--gpu');
const listenPort = Number(option('port') || 0);
if (outDir) mkdirSync(outDir, { recursive: true });

// The dialogs the game had before js/modals.js, by selector; anything opened through Modals carries data-modal and
// is found too, so a dialog added later is held to the same rule without a change here
const KNOWN = ['#crashNotification', '#finishBanner', '#worldConfirm', '#world-pause', '#world-credits', '#settings', '#leaderboardViewer', '#leaderboardEntryOverlay', '.tour-selector-overlay'];

// What a step expects: the dialog on top by its id (or first class), 'none' for the ride with no dialog, and nav for
// a page load (a world goes to the menu by leaving ?world)
const MENU = 'tour-selector-overlay';

// Each sequence starts on a fresh page. `key` steps are keyboard-only: on the touch variant a key step with `tap` taps
// that button instead (so the sequence goes on from the same state), and one without is skipped;
// `eval` steps stand in for what the game does on its own (a crash, a finish).
const crash = { eval: () => { game.vehicle.crashed = true; game.showCrashNotification(); }, top: 'crashNotification' };
// A world ride has no crash dialog: the fall plays and the game restarts the rider in place (Game.beginWorldCrash)
const worldCrash = { eval: () => { game.vehicle.crashed = true; game.showCrashNotification(); }, top: 'none' };
// P on a keyboard; a touch screen has only its pause button to tap
const pause = { eval: () => game.pauseRace(), touch: '.virtual-button-pause', top: 'world-pause' };
const finish = { eval: () => game.finishRun(), top: 'finishBanner' };
// A world ride is up: the world's environment, the bike and the run
const WORLD_READY = 'window.game && window.game.environment && window.game.environment.isWorld && window.game.vehicle && window.game.worldRun';
// The world chosen on the menu is the leg picked on the leg list (js/world/legs.js): leg 1, the run-in from the north
const worldFromMenu = () => {
    const problems = [];
    const env = game.environment;
    if (!env || env.constructor.name !== 'WorldEnvironment') problems.push(`the environment is ${env && env.constructor.name}, not WorldEnvironment`);
    if (env && env.config.id !== 'gotthard-north') problems.push(`the stage is ${env.config.id}, not gotthard-north`);
    if (location.search) problems.push(`the page has a query: ${location.search}`);
    const chosen = game.tourSystem.selectedCharacterId;
    if (!game.selectedCharacter || game.selectedCharacter.id !== chosen) problems.push(`the ride has rider ${game.selectedCharacter && game.selectedCharacter.id}, the menu chose ${chosen}`);
    if (document.querySelector('.tour-selector-overlay') && getComputedStyle(document.querySelector('.tour-selector-overlay')).display !== 'none') problems.push('the menu is still shown');
    return problems;
};
// The leg list: grouped by pass, leg 1 focused, each open leg a button
const legsListed = () => {
    const problems = [];
    const rows = [...document.querySelectorAll('#world-legs .world-legs-row')];
    if (!rows.length) problems.push('the leg list has no legs');
    if (!document.querySelector('#world-legs .world-legs-pass')) problems.push('the leg list names no pass');
    if (document.activeElement !== document.querySelector('#world-legs [data-leg="gotthard-north"]')) problems.push('leg 1 is not focused');
    return problems;
};
const creditShown = () => {
    const text = (document.querySelector('#world-credits .world-credits-credit') || {}).textContent || '';
    return /swisstopo/.test(text) ? [] : [`the credits panel shows ${JSON.stringify(text)}`];
};
const legScreen = () => (getComputedStyle(document.querySelector('.track-select-screen')).display === 'none' ? ['the leg screen is not shown'] : []);
// Each check runs in the page, so it names nothing from this file
const fallbackShown = () => {
    const problems = [];
    if (getComputedStyle(document.querySelector('.track-select-screen')).display === 'none') problems.push('the leg screen is not shown');
    const note = document.querySelector('.tour-selector-overlay .menu-notice');
    if (!note || !/could not load/.test(note.textContent)) problems.push('no note on the menu');
    if (document.getElementById('world-loading')) problems.push('the loading screen is left over');
    return problems;
};
const legRide = () => {
    const env = game.environment;
    return env && env.constructor.name === 'Environment' && !env.isWorld ? [] : [`the environment is ${env && env.constructor.name}, not a leg's Environment`];
};
// The rider mode (js/ridermodes.js): the mode in force, the HUD's tag and every control on the page say `id`
const modeIs = (id) => {
    const problems = [];
    const mode = RiderModes.get();
    if (mode.id !== id) problems.push(`the rider mode is ${mode.id}, not ${id}`);
    // Nothing is stored until the rider chooses: the default then
    const stored = localStorage.getItem(RiderModes.KEY) || RiderModes.DEFAULT;
    if (stored !== id) problems.push(`the stored rider mode is ${stored}, not ${id}`);
    const tag = document.getElementById('hudMode').textContent;
    if (tag !== mode.name) problems.push(`the HUD's tag says "${tag}", not "${mode.name}"`);
    document.querySelectorAll('[data-mode-picker]').forEach((box) => {
        const on = [...box.querySelectorAll('[aria-checked="true"]')].map(b => b.dataset.mode).join(',');
        if (on !== id) problems.push(`a control shows ${on || 'nothing'}, not ${id}`);
    });
    return problems;
};
const modeCheck = id => new Function(`return (${modeIs})(${JSON.stringify(id)});`);
// The pause panel's control with the bike moving: every button off, the reason shown
const modeLocked = () => {
    const box = document.querySelector('#world-pause [data-mode-picker]');
    if (!box) return ['the pause panel has no rider mode control'];
    const problems = [];
    if ([...box.querySelectorAll('button')].some(b => !b.disabled)) problems.push('a rider mode button is enabled while the bike moves');
    if (box.querySelector('.mode-picker-hint').textContent !== RiderModes.LOCKED_TEXT) problems.push('the control does not say why it is locked');
    return problems;
};
// The settings dialog (js/settings.js): the preset in force, kept, and the ladder fixed by it (Auto: free), and the
// dialog's own row showing it
const presetIs = (id) => {
    const problems = [];
    if (game.effects.preset !== id) problems.push(`the preset is ${game.effects.preset}, not ${id}`);
    const stored = JSON.parse(localStorage.getItem(Effects.KEY) || '{}').preset || Effects.DEFAULT_PRESET;
    if (stored !== id) problems.push(`the stored preset is ${stored}, not ${id}`);
    const level = Effects.preset(id).level;
    const held = game.quality.isFixed ? Quality.LEVELS[game.quality.level].id : null;
    if ((level || null) !== held) problems.push(`the ladder is held at ${held}, not ${level || 'nothing (Auto)'}`);
    const shown = document.querySelector('#settings [data-preset-row] [aria-checked="true"]');
    if (shown && shown.dataset.value !== id) problems.push(`the dialog shows ${shown.dataset.value}`);
    return problems;
};
const presetCheck = id => new Function(`return (${presetIs})(${JSON.stringify(id)});`);
const effectIs = (id, level) => {
    const problems = [];
    if (game.effects.chosen[id] !== level) problems.push(`${id} is ${game.effects.chosen[id]}, not ${level}`);
    const stored = (JSON.parse(localStorage.getItem(Effects.KEY) || '{}').effects || {})[id];
    if (stored !== level) problems.push(`the stored ${id} is ${stored}, not ${level}`);
    const shown = document.querySelector(`#settings [data-effect="${id}"] [aria-checked="true"]`);
    if (!shown || shown.dataset.value !== level) problems.push(`the dialog shows ${shown && shown.dataset.value}`);
    return problems;
};
const effectCheck = (id, level) => new Function(`return (${effectIs})(${JSON.stringify(id)}, ${JSON.stringify(level)});`);
const SEQUENCES = [
    // A world ride: a crash opens no dialog (the game puts the bike back by itself), and the ride's own dialogs open
    // over the fall as over any riding
    { name: 'world-crash-no-dialog', page: 'world', steps: [
        worldCrash,
        { key: 'KeyR', top: 'none' },
        { key: 'KeyC', top: 'none' },
        pause,
        { click: '#world-pause [data-credits]', top: 'world-credits' },
        { click: '#world-credits button', top: 'world-pause' },
        { click: '#world-pause [data-resume]', top: 'none' }
    ] },
    { name: 'world-crash-pause-key', page: 'world', steps: [
        worldCrash,
        { key: 'KeyP', top: 'world-pause' },
        { key: 'KeyM', top: 'worldConfirm' },
        { key: 'Escape', top: 'world-pause' },
        { key: 'KeyP', top: 'none' }
    ] },
    // Restart leg is on the pause panel of a world ride, through the confirm
    { name: 'world-pause-restart', page: 'world', steps: [
        pause,
        { click: '#world-pause [data-restart]', top: 'worldConfirm' },
        { click: '#worldConfirmNo', top: 'world-pause' },
        { click: '#world-pause [data-restart]', top: 'worldConfirm' },
        { click: '#worldConfirmYes', top: 'none' }
    ] },
    { name: 'world-pause-restart-key', page: 'world', steps: [
        { key: 'KeyP', top: 'world-pause' },
        { key: 'KeyR', top: 'worldConfirm' },
        { key: 'Escape', top: 'world-pause' },
        { key: 'KeyR', top: 'worldConfirm' },
        { key: 'Enter', top: 'none' }
    ] },
    // The rider mode on the pause panel: free while the bike stands (a click, and H through the dialog stack), locked
    // with the reason once it moves
    { name: 'world-pause-rider-mode', page: 'world', steps: [
        { eval: () => { game.vehicle.speed = 0; game.pauseRace(); }, top: 'world-pause', check: modeCheck('road') },
        { click: '#world-pause [data-mode="sport"]', top: 'world-pause', check: modeCheck('sport') },
        { key: 'KeyH', tap: '#world-pause [data-mode="track"]', top: 'world-pause', check: modeCheck('track') },
        { click: '#world-pause [data-resume]', top: 'none', check: modeCheck('track') },
        { eval: () => { game.vehicle.speed = 20; game.pauseRace(); }, top: 'world-pause', check: modeLocked },
        { key: 'KeyH', top: 'world-pause', check: modeCheck('track') },
        { click: '#world-pause [data-resume]', top: 'none' }
    ] },
    // The pause panel of a world ride: credits, and the menu through the confirm
    { name: 'world-pause-menu', page: 'world', steps: [
        pause,
        { click: '#world-pause [data-credits]', top: 'world-credits' },
        { key: 'Escape', tap: '#world-credits button', top: 'world-pause', focus: '#world-pause [data-credits]' },
        { click: '#world-pause [data-menu]', top: 'worldConfirm' },
        { click: '#worldConfirmNo', top: 'world-pause' },
        { click: '#world-pause [data-menu]', top: 'worldConfirm' },
        { click: '#worldConfirmYes', top: MENU, nav: true }
    ] },
    { name: 'world-pause-key', page: 'world', steps: [
        { key: 'KeyP', top: 'world-pause' },
        { key: 'Escape', top: 'none' },
        { key: 'KeyP', top: 'world-pause' },
        { key: 'KeyM', top: 'worldConfirm' },
        { key: 'Escape', top: 'world-pause' },
        { key: 'KeyP', top: 'none' }
    ] },
    { name: 'world-finish', page: 'world', steps: [
        finish,
        { click: '#finishBanner [data-menu]', top: MENU, nav: true }
    ] },
    { name: 'world-finish-key', page: 'world', steps: [
        finish,
        { key: 'KeyM', top: MENU, nav: true }
    ] },

    // The settings over the pause panel of a world ride: an effect changed, O and Escape close it, the panel comes back
    { name: 'world-pause-settings', page: 'world', steps: [
        pause,
        { click: '#world-pause [data-settings]', top: 'settings' },
        { click: '#settings [data-effect="ao"] [data-value="high"]', top: 'settings', check: effectCheck('ao', 'high') },
        { key: 'Escape', tap: '#settings [data-settings-close]', top: 'world-pause', focus: '#world-pause [data-settings]' },
        { key: 'KeyO', tap: '#world-pause [data-settings]', top: 'settings' },
        { click: '#settings [data-preset-row] [data-value="balanced"]', top: 'settings', check: presetCheck('balanced') },
        { key: 'KeyO', tap: '#settings [data-settings-close]', top: 'world-pause' },
        { click: '#world-pause [data-resume]', top: 'none', check: presetCheck('balanced') }
    ] },

    // Free roam's fast travel (js/world/travel.js): from the pause panel (a click and G through the dialog stack) and with
    // G while riding; Escape goes back to where it opened from, a place takes the bike there and rides on
    { name: 'roam-pause-travel', page: 'roam', steps: [
        pause,
        { click: '#world-pause [data-travel-open]', top: 'fast-travel' },
        { key: 'Escape', tap: '#fast-travel [data-key="Escape"]', top: 'world-pause', focus: '#world-pause [data-travel-open]' },
        { key: 'KeyG', tap: '#world-pause [data-travel-open]', top: 'fast-travel' },
        { click: '#fast-travel [data-travel="summit"]', top: 'none' }
    ] },
    // Free roam's photo mode (js/world/photo.js): its bar from the pause panel and with V while riding; its buttons keep
    // it on top, Escape goes back to where it opened from
    { name: 'roam-pause-photo', page: 'roam', steps: [
        pause,
        { click: '#world-pause [data-photo-open]', top: 'photo-bar' },
        { click: '#photo-bar [data-photo="left"]', top: 'photo-bar' },
        { key: 'KeyW', tap: '#photo-bar [data-photo="up"]', top: 'photo-bar' },
        { key: 'Escape', tap: '#photo-bar [data-photo="done"]', top: 'world-pause', focus: '#world-pause [data-photo-open]' },
        { key: 'KeyV', tap: '#world-pause [data-photo-open]', top: 'photo-bar' },
        { click: '#photo-bar [data-photo="done"]', top: 'world-pause' },
        { click: '#world-pause [data-resume]', top: 'none' }
    ] },
    { name: 'roam-photo-key', page: 'roam', steps: [
        { key: 'KeyV', top: 'photo-bar' },
        { key: 'KeyA', top: 'photo-bar' },
        { key: 'Equal', top: 'photo-bar' },
        { key: 'Escape', top: 'none' }
    ] },
    // (keys only: a touch screen opens it from the pause panel, roam-pause-travel)
    { name: 'roam-travel-key', page: 'roam', steps: [
        { key: 'KeyG', top: 'fast-travel' },
        { key: 'Escape', top: 'none' },
        { key: 'KeyG', top: 'fast-travel' },
        { key: 'Digit2', top: 'none' }
    ] },

    // The menu of the legs: credits and best times over it
    { name: 'menu-credits', page: 'menu', steps: [
        { top: MENU },
        { click: '.character-select-screen [data-credits]', top: 'world-credits' },
        { key: 'Escape', tap: '#world-credits button', top: MENU },
        { click: '.character-select-screen [data-credits]', top: 'world-credits' },
        { click: '#world-credits button', top: MENU }
    ] },
    // The settings over the menu: a preset fixes the ladder, Default gives it back to Auto
    { name: 'menu-settings', page: 'menu', steps: [
        { top: MENU },
        { click: '.character-select-screen [data-settings]', top: 'settings', check: presetCheck('auto') },
        { click: '#settings [data-preset-row] [data-value="low"]', top: 'settings', check: presetCheck('low') },
        { key: 'Escape', tap: '#settings [data-settings-close]', top: MENU, focus: '.character-select-screen [data-settings]' },
        { key: 'KeyO', tap: '.character-select-screen [data-settings]', top: 'settings', check: presetCheck('low') },
        { click: '#settings [data-settings-default]', top: 'settings', check: presetCheck('auto') },
        { click: '#settings [data-settings-close]', top: MENU }
    ] },
    { name: 'menu-best-times', page: 'menu', steps: [
        { click: '#riderClassicBtn', top: MENU, check: legScreen },
        { click: '#legLeaderboardBtn', top: 'leaderboardViewer' },
        { key: 'Escape', tap: '#leaderboardViewerClose', top: MENU, focus: '#legLeaderboardBtn' },
        { click: '#legLeaderboardBtn', top: 'leaderboardViewer' },
        { click: '#leaderboardViewerClose', top: MENU }
    ] },

    // The rider mode on the menu: free, by a click or H, and Enter still rides (the focus goes back to RIDE)
    { name: 'menu-rider-mode', page: 'menu', steps: [
        { top: MENU, check: modeCheck('road') },
        { click: '#riderModeRow [data-mode="track"]', top: MENU, focus: '#riderContinueBtn', check: modeCheck('track') },
        { key: 'KeyH', tap: '#riderModeRow [data-mode="rain"]', top: MENU, check: modeCheck('rain') },
        { click: '#riderModeRow [data-mode="road"]', top: MENU, check: modeCheck('road') }
    ] },
    { name: 'leg-pause-rider-mode', page: 'leg', steps: [
        { eval: () => { game.vehicle.speed = 0; game.pauseRace(); }, top: 'world-pause' },
        { click: '#world-pause [data-mode="rain"]', top: 'world-pause', check: modeCheck('rain') },
        { click: '#world-pause [data-menu]', top: MENU, check: modeCheck('rain') }
    ] },

    // The plain page: a rider chosen with real clicks rides the world, as ?world=tremola does, to its finish card
    { name: 'menu-world-ride', page: 'menu', steps: [
        { top: MENU },
        { click: '#riderNextBtn', top: MENU },
        { click: '#riderPrevBtn', top: MENU },
        { click: '#riderContinueBtn', top: 'world-legs', check: legsListed },
        { click: '#world-legs [data-leg="gotthard-north"]', watch: "/swisstopo/.test((document.querySelector('.world-loading-credit') || {}).textContent || '')", ready: WORLD_READY, top: 'none', check: worldFromMenu },
        pause,
        { click: '#world-pause [data-credits]', top: 'world-credits', check: creditShown },
        { click: '#world-credits button', top: 'world-pause' },
        { click: '#world-pause [data-resume]', top: 'none' },
        { ...finish, check: () => (document.querySelector('#finishBanner .finish-title') || {}).textContent === 'STAGE COMPLETE' ? [] : ['the finish is not the world\'s card'] },
        { click: '#finishBanner [data-menu]', top: MENU, nav: true }
    ] },
    // Classic legs on the same menu rides a leg
    { name: 'menu-classic-leg', page: 'menu', steps: [
        { click: '#riderClassicBtn', top: MENU, check: legScreen },
        { click: '#legStartBtn', ready: 'window.game && window.game.environment && !window.game.environment.isWorld && window.game.vehicle', top: 'none', check: legRide }
    ] },
    // A host that does not serve the world: the legs take over with the note, and a leg rides
    // The leg list goes back to the rider screen with Back (Escape)
    { name: 'menu-world-legs-back', page: 'menu', steps: [
        { click: '#riderContinueBtn', top: 'world-legs', check: legsListed },
        { click: '#world-legs .world-legs-back', top: MENU }
    ] },
    { name: 'menu-world-fallback', page: 'menu', noWorld: true, steps: [
        { click: '#riderContinueBtn', top: 'world-legs' },
        { click: '#world-legs [data-leg="gotthard-north"]', ready: "document.querySelector('.tour-selector-overlay .menu-notice')", top: MENU, check: fallbackShown },
        { click: '#legStartBtn', ready: 'window.game && window.game.environment && !window.game.environment.isWorld && window.game.vehicle', top: 'none', check: legRide }
    ] },

    // A leg, for comparison: no confirm, the menu is one press away
    { name: 'leg-crash-menu', page: 'leg', steps: [
        crash,
        { click: '#menuCrashBtn', top: MENU }
    ] },
    { name: 'leg-crash-key', page: 'leg', steps: [
        crash,
        { key: 'KeyP', top: 'world-pause' },
        { key: 'Escape', top: 'crashNotification' },
        { key: 'KeyM', top: MENU }
    ] },
    { name: 'leg-pause-menu', page: 'leg', steps: [
        pause,
        { click: '#world-pause [data-credits]', top: 'world-credits' },
        { click: '#world-credits button', top: 'world-pause' },
        { click: '#world-pause [data-menu]', top: MENU }
    ] },
    { name: 'leg-finish-name', page: 'leg', board: true, steps: [
        finish,
        { click: '#nextLegBtn', top: 'leaderboardEntryOverlay', focus: '#leaderboardNameInput' },
        { type: 'ABCD', top: 'leaderboardEntryOverlay' },
        { click: '#leaderboardCancelBtn', top: 'none' }
    ] },
    { name: 'leg-finish-name-key', page: 'leg', board: true, steps: [
        finish,
        { key: 'KeyN', top: 'leaderboardEntryOverlay', focus: '#leaderboardNameInput' },
        { key: 'Escape', top: 'none' }
    ] },
    { name: 'leg-finish-menu', page: 'leg', steps: [
        finish,
        { click: '#returnToMenuBtn', top: MENU }
    ] }
];

// ---------------------------------------------------------------- Chrome and server
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
    return new Promise(done => server.listen(listenPort, '127.0.0.1', () => done(server)));
}

async function openPage(browser, port, kind, variant, errors, noWorld = false) {
    // The browser's own first tab: a second tab would be in the background, where frames stall
    const [page] = await browser.pages();
    await page.bringToFront();
    await page.setViewport(VIEWPORTS[variant]);
    await page.setRequestInterception(true);
    page.on('request', request => {
        const target = new URL(request.url());
        if (BLOCKED_HOSTS.some(host => target.hostname.endsWith(host))) {
            request.abort();
        } else if (noWorld && (target.pathname.startsWith('/world/') || target.pathname.startsWith('/worlds/'))) {
            request.respond({ status: 404, contentType: 'text/plain', body: 'not served' });
        } else if (/jsdelivr\.net\/npm\/three@0\.150\.0\/build\/three\.min\.js/.test(request.url())) {
            request.respond({ status: 200, contentType: 'text/javascript', body: readFileSync(join(root, 'node_modules/three/build/three.min.js')) });
        } else {
            request.continue();
        }
    });
    page.on('pageerror', error => errors.push(error.message));
    // (roam: the world in free roam, open in debug mode)
    const url = kind === 'world' ? '/?world=tremola' : kind === 'roam' ? '/?world=tremola&mode=roam&debug' : '/';
    await page.goto(`http://127.0.0.1:${port}${url}`, { waitUntil: 'load', timeout: 600000 });
    if (kind === 'world' || kind === 'roam') {
        await page.waitForFunction('window.game && window.game.environment && window.game.environment.isWorld && window.game.vehicle && window.game.worldRun', { timeout: 600000, polling: 500 });
    } else {
        await page.waitForFunction('window.game && window.game.tourSystem && document.querySelector(".tour-selector-overlay")', { timeout: 60000, polling: 250 });
    }
    // The rule is about the DOM over the canvas: a quarter-resolution canvas keeps a software renderer quick
    if (!gpu) await page.evaluate(() => { window.game.adaptResolution = () => {}; window.game.renderer.setPixelRatio(0.25); });
    if (variant === 'touch') await page.evaluate(() => document.body.classList.add('touch'));
    if (kind === 'leg') {
        await page.addScriptTag({ path: join(root, 'tools/autopilot.js') });
        await page.evaluate(() => twistyDev.start('mountain-dawn'));
        await settle(page, 20);
    }
    return page;
}

// A board that is always open and answers a submit at once, so the name entry shows without a network
async function openBoard(page) {
    await page.evaluate(() => {
        const service = game.leaderboardService;
        service.isActive = () => true;
        service.cancelSession = () => {};
        service.submitRun = async () => ({ success: true, rank: 1, flagged: false });
        service.nameRule = () => ({ min: 4, max: 4 });
    });
}

// A few frames of the live loop, or 3 s when frames do not come
const settle = (page, frames = 6) => page.evaluate(n => new Promise(done => {
    let left = n;
    const tick = () => (--left <= 0 ? done() : requestAnimationFrame(tick));
    requestAnimationFrame(tick);
    setTimeout(done, 3000);
}), frames);

// The rule, read off the page as it stands
function audit(known) {
    // The cards fade in: read them as they end up, not part-way (a busy machine can catch one at opacity 0)
    document.body.getBoundingClientRect();
    document.getAnimations().forEach(animation => {
        try {
            if (animation.effect && animation.effect.getTiming().iterations !== Infinity) animation.finish();
        } catch { /* an animation that cannot end stays as it is */ }
    });
    const shown = (el) => {
        if (!el || !el.isConnected) return false;
        const box = el.getBoundingClientRect();
        if (box.width < 1 || box.height < 1) return false;
        const style = getComputedStyle(el);
        if (style.visibility !== 'visible' || style.display === 'none') return false;
        for (let at = el; at && at.nodeType === 1; at = at.parentElement) {
            if (parseFloat(getComputedStyle(at).opacity) < 0.05) return false;
        }
        return true;
    };
    const describe = el => (el ? `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).join('.')}` : ''}` : 'nothing');
    const found = new Set();
    known.forEach(selector => document.querySelectorAll(selector).forEach(el => found.add(el)));
    document.querySelectorAll('[data-modal]').forEach(el => found.add(el));
    const dialogs = [...found].filter(shown).map(el => {
        const inert = !!el.closest('[inert]');
        const buttons = inert ? [] : [...el.querySelectorAll('button')].filter(b => shown(b) && !b.disabled).map(b => {
            b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            const box = b.getBoundingClientRect();
            const x = box.left + box.width / 2, y = box.top + box.height / 2;
            const hit = document.elementFromPoint(x, y);
            return { label: b.textContent.trim().replace(/\s+/g, ' ').slice(0, 24), ok: !!hit && (hit === b || b.contains(hit)), hit: describe(hit) };
        });
        return {
            name: el.id || el.className.trim().split(/\s+/)[0],
            z: getComputedStyle(el).zIndex,
            inert,
            focus: el.contains(document.activeElement),
            buttons
        };
    });
    return { dialogs, active: describe(document.activeElement), search: location.search };
}

function judge(state, step) {
    const problems = [];
    const live = state.dialogs.filter(d => !d.inert);
    if (step.top === 'none') {
        if (live.length) problems.push(`expected no dialog, found ${live.map(d => d.name).join(', ')}`);
        return problems;
    }
    if (live.length !== 1) problems.push(`${live.length} dialogs interactive (${live.map(d => `${d.name} z=${d.z}`).join(', ') || 'none'}), want only ${step.top}`);
    const top = live.find(d => d.name === step.top);
    if (!top) {
        problems.push(`${step.top} is not the interactive dialog`);
        return problems;
    }
    top.buttons.filter(b => !b.ok).forEach(b => problems.push(`${step.top} button "${b.label}" is covered by ${b.hit}`));
    if (!top.focus) problems.push(`focus is on ${state.active}, outside ${step.top}`);
    return problems;
}

// Runs `read` again when a navigation swapped the page under it
async function steady(page, read) {
    for (let attempt = 0; ; attempt++) {
        try {
            return await read();
        } catch (error) {
            if (attempt >= 4 || !/context was destroyed|Cannot find context/.test(error.message)) throw error;
            await page.waitForFunction('window.game && window.game.tourSystem', { timeout: 120000, polling: 500 }).catch(() => null);
        }
    }
}

async function pointAt(page, selector) {
    return page.evaluate(sel => {
        const el = document.querySelector(sel);
        if (!el) return null;
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        const box = el.getBoundingClientRect();
        if (box.width < 1 || box.height < 1) return null;
        return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    }, selector);
}

async function runSequence(port, sequence, variant) {
    const errors = [];
    const failures = [];
    const log = [];
    let page;
    let browser;
    // A busy machine can miss a page load: that is a run that did not start, retried, not a broken dialog
    for (let attempt = 0; attempt < 3 && !page; attempt++) {
        browser = await launch();
        try {
            page = await openPage(browser, port, sequence.page, variant, errors, sequence.noWorld);
        } catch (error) {
            await browser.close().catch(() => {});
            if (attempt === 2) return { failures: [], log, unstarted: error.message.split('\n')[0] };
        }
    }
    try {
        if (sequence.board) await openBoard(page);
        for (let index = 0; index < sequence.steps.length; index++) {
            let step = sequence.steps[index];
            if (step.key && step.tap && variant === 'touch') step = { ...step, key: undefined, click: step.tap };
            const label = step.touch && variant === 'touch' ? `tap ${step.touch}` : step.click ? `click ${step.click}` : step.key ? `key ${step.key}` : step.type ? `type ${step.type}` : step.eval ? 'game' : 'open';
            if (step.key && variant === 'touch') {
                log.push({ step: label, skipped: 'keyboard' });
                continue;
            }
            const watched = step.watch ? page.waitForFunction(step.watch, { timeout: 120000, polling: 50 }).then(() => true, () => false) : null;
            const navigation = step.nav ? page.waitForNavigation({ waitUntil: 'load', timeout: 60000 }).catch(() => null) : null;
            if (step.touch && variant === 'touch') {
                const point = await pointAt(page, step.touch);
                if (!point) {
                    failures.push(`step ${index + 1} tap ${step.touch}: no such button on screen`);
                    break;
                }
                await page.touchscreen.tap(point.x, point.y);
            } else if (step.eval) {
                await page.evaluate(step.eval);
            } else if (step.click) {
                const point = await pointAt(page, step.click);
                if (!point) {
                    failures.push(`step ${index + 1} ${label}: no such button on screen`);
                    break;
                }
                if (variant === 'touch') await page.touchscreen.tap(point.x, point.y);
                else await page.mouse.click(point.x, point.y);
            } else if (step.key) {
                await page.keyboard.press(step.key);
            } else if (step.type) {
                await page.keyboard.type(step.type);
            }
            const waits = [];
            if (watched && !(await watched)) waits.push(`never saw ${step.watch}`);
            if (step.ready) {
                const ready = await page.waitForFunction(step.ready, { timeout: 600000, polling: 500 }).then(() => true, () => false);
                if (!ready) waits.push(`never ready: ${step.ready}`);
            }
            if (navigation) {
                await navigation;
                await page.waitForFunction('window.game && window.game.tourSystem && document.querySelector(".tour-selector-overlay")', { timeout: 60000, polling: 250 }).catch(() => null);
            }
            // A few frames, then the page as it stands
            const state = await steady(page, async () => {
                await settle(page, 8);
                return page.evaluate(audit, KNOWN);
            });
            const problems = [...waits, ...judge(state, step)];
            if (step.check) problems.push(...await page.evaluate(step.check));
            if (step.nav && /world=/.test(state.search)) problems.push('still on the world ride, the menu did not open');
            if (step.focus) {
                const focused = await page.evaluate(sel => { const el = document.querySelector(sel); return !!el && document.activeElement === el; }, step.focus);
                if (!focused) problems.push(`focus is on ${state.active}, not ${step.focus}`);
            }
            log.push({ step: label, want: step.top, dialogs: state.dialogs.map(d => ({ name: d.name, z: d.z, inert: d.inert, focus: d.focus, covered: d.buttons.filter(b => !b.ok).map(b => `${b.label} under ${b.hit}`) })), active: state.active, problems });
            if (outDir) await page.screenshot({ path: join(outDir, `${variant}-${sequence.name}-${index + 1}.png`) });
            problems.forEach(problem => failures.push(`step ${index + 1} ${label}: ${problem}`));
            // A step that did not reach its dialog leaves the rest of the sequence meaningless
            if (problems.some(p => /not the interactive dialog|expected no dialog|did not open/.test(p))) break;
        }
    } catch (error) {
        failures.push(`error: ${error.message.split('\n')[0]}`);
    } finally {
        await browser.close().catch(() => {});
    }
    if (errors.length) failures.push(...errors.map(message => `page error: ${message}`));
    return { failures, log };
}

const executablePath = chromePath();
const server = await startServer();
const port = server.address().port;
// A fresh browser for each sequence, its one tab in front: a background tab's frames stall
const renderer = gpu ? [] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const launch = () => puppeteer.launch({ protocolTimeout: 300000, executablePath, headless: 'new', args: ['--no-sandbox', ...renderer, '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const report = { results: {}, failing: [] };
try {
    const queue = variants.flatMap(variant => SEQUENCES.filter(sequence => !only || only.includes(sequence.name)).map(sequence => ({ variant, sequence })));
    const order = queue.map(({ variant, sequence }) => `${variant}/${sequence.name}`);
    const worker = async () => {
        for (let job = queue.shift(); job; job = queue.shift()) {
            const id = `${job.variant}/${job.sequence.name}`;
            const result = await runSequence(port, job.sequence, job.variant);
            report.results[id] = result;
            if (result.unstarted) {
                process.stderr.write(`SKIP ${id}: the page did not start (${result.unstarted})\n`);
                continue;
            }
            process.stderr.write(`${result.failures.length ? 'FAIL' : 'ok  '} ${id}${result.failures.length ? `\n      ${result.failures.join('\n      ')}` : ''}\n`);
        }
    };
    await Promise.all(Array.from({ length: jobs }, worker));
    report.results = Object.fromEntries(order.map(id => [id, report.results[id]]));
    report.failing = order.filter(id => report.results[id].failures.length);
    report.unstarted = order.filter(id => report.results[id].unstarted);
} finally {
    server.close();
}
process.stdout.write(`${JSON.stringify(report, null, 1)}\n`);
process.stderr.write(`${report.failing.length} of ${Object.keys(report.results).length} sequences failed${report.unstarted.length ? `, ${report.unstarted.length} did not start` : ''}\n`);
process.exit(report.failing.length || report.unstarted.length ? 1 : 0);
