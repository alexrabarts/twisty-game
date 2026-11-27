/**
 * The HUD rules and the DOM they drive: the controls hint fades after the
 * first seconds (sooner once the rider rides), the FPS counter is off unless
 * asked for, touch controls exist only on touch devices, and per-frame writes
 * reuse text nodes.
 */

import { jest } from '@jest/globals';
import { readFileSync } from 'fs';

const read = name => readFileSync(new URL(`../../js/${name}`, import.meta.url), 'utf8');
(0, eval)(`${read('hud.js')}\n${read('virtualcontrols.js')}\n${read('input.js')}\nglobalThis.HudRules = HudRules; globalThis.Hud = Hud; globalThis.UiIcons = UiIcons; globalThis.VirtualControls = VirtualControls; globalThis.InputHandler = InputHandler;`);

const markup = `
    <p id="raceTimer">0:00.00</p>
    <span id="hudGates"><span id="hudGatePips"></span><b id="hudGateCount">0/5</b></span>
    <span id="score">0</span><span id="comboDisplay"></span>
    <div id="hudSpeed" data-band="-1"><svg><path id="speedFill"/></svg><span id="speed">0</span></div>
    <div id="startCard"><div id="startLeg"></div></div>
    <div id="splitPopup"></div>
    <div id="callouts"></div>
    <div id="hudHint"></div>
    <div id="hudProgress" hidden><div id="hudProgressBar"><span id="hudProgressMarks"></span></div><b id="hudProgressCount">0/0</b></div>
    <span id="hudProgressKm"></span><div id="hudStageText"></div>
    <div id="fps" hidden>FPS 0</div>`;

// A window whose media queries answer from `matches`
const fakeWindow = (search = '', matches = {}) => ({
    location: { search },
    localStorage: window.localStorage,
    matchMedia: query => ({ matches: Boolean(matches[query]) })
});

describe('HudRules', () => {
    // No HUD number is ever "Infinity", "NaN" or "∞": one formatter for all of them, and the inputs that went
    // non-finite (a section of no time after a put-down) are guarded where they are made
    test('every shown number goes through one formatter that refuses what is not a finite number', () => {
        for (const bad of [Infinity, -Infinity, NaN, undefined, null, '12']) expect(HudRules.number(bad)).toBe('\u2014');
        expect(HudRules.number(13187.4)).toBe('13,187');
        expect(HudRules.number(1636, { sign: true })).toBe('+1,636');
        expect(HudRules.number(-3, { sign: true })).toBe('-3');
        expect(HudRules.number(41.25, { digits: 1 })).toBe('41.3');
        // A section of no time, no length or a few milliseconds earns finite points, the speed bonus capped
        expect(HudRules.checkpointPoints(800, 0, 2)).toBe(200);
        expect(HudRules.checkpointPoints(Infinity, 30, 1)).toBe(100);
        expect(HudRules.checkpointPoints(800, 0.001, 1)).toBe(100 + Math.floor((HudRules.SECTION_KMH_MAX - 60) * 1.5));
        expect(HudRules.checkpointPoints(1000, 36, 1.5)).toBe(Math.round((100 + 60) * 1.5));
        for (const [d, t, m] of [[800, 0, 1], [0, 0, 1], [800, -1, 5], [NaN, 2, 1], [800, 2, NaN]]) expect(Number.isFinite(HudRules.checkpointPoints(d, t, m))).toBe(true);
        // The pages that write numbers into the HUD and the run's boxes do it through HudRules.number only
        for (const file of ['main.js', 'hud.js']) {
            const src = read(file);
            const raw = [...src.matchAll(/\.toLocaleString\(/g)].length - (file === 'hud.js' ? 1 : 0);
            expect({ file, raw }).toEqual({ file, raw: 0 });
            expect({ file, pointsRaw: /\+\$\{points\}/.test(src) }).toEqual({ file, pointsRaw: false });
        }
    });

    test('the hint shows at the start and is gone after HINT_MS', () => {
        expect(HudRules.hintVisible(0, NaN)).toBe(true);
        expect(HudRules.hintVisible(HudRules.HINT_MS - 1, NaN)).toBe(true);
        expect(HudRules.hintVisible(HudRules.HINT_MS, NaN)).toBe(false);
    });

    test('the first input shortens the hint to HINT_AFTER_INPUT_MS', () => {
        expect(HudRules.hintVisible(1000, 500)).toBe(true);
        expect(HudRules.hintVisible(500 + HudRules.HINT_AFTER_INPUT_MS, 500)).toBe(false);
        // Input never makes the hint last longer than HINT_MS
        expect(HudRules.hintVisible(HudRules.HINT_MS, HudRules.HINT_MS - 100)).toBe(false);
    });

    test('a broken clock hides the hint rather than pinning it on screen', () => {
        expect(HudRules.hintVisible(NaN, NaN)).toBe(false);
    });

    test('the FPS counter is off unless the address or the stored toggle asks', () => {
        expect(HudRules.fpsEnabled('', null)).toBe(false);
        expect(HudRules.fpsEnabled('?fps=1', null)).toBe(true);
        expect(HudRules.fpsEnabled('?leg=2&fps=true', null)).toBe(true);
        expect(HudRules.fpsEnabled('', '1')).toBe(true);
        expect(HudRules.fpsEnabled('?fps=0', '1')).toBe(false);
    });

    test('touch controls are for coarse pointers, not for touch laptops with a mouse', () => {
        expect(HudRules.isTouch(fakeWindow('', { '(pointer: coarse)': true }))).toBe(true);
        expect(HudRules.isTouch(fakeWindow('', { '(any-pointer: coarse)': true }))).toBe(true);
        expect(HudRules.isTouch(fakeWindow('', { '(any-pointer: coarse)': true, '(any-pointer: fine)': true }))).toBe(false);
        expect(HudRules.isTouch(fakeWindow('', { '(pointer: fine)': true }))).toBe(false);
        expect(HudRules.isTouch({})).toBe(false);
    });

    test('the stage clock, line, share and distance read as the world HUD shows them', () => {
        expect(HudRules.stageClock(192400)).toBe('3:12.4');
        expect(HudRules.stageClock(-5)).toBe('0:00.0');
        expect(HudRules.stageLine(8, 14, 'Tremola', 192400)).toBe('Stage 8/14 · Tremola  3:12.4');
        // A ride of one stage: its stage clock is the main clock and "Stage 1/1" says nothing
        expect(HudRules.stageLine(1, 1, 'Tremola', 192400)).toBe('');
        expect(HudRules.stageLabel(1, 1, 'Tremola')).toBe('Tremola');
        expect(HudRules.stageLabel(1, 3, 'Mini 1')).toBe('Stage 1/3 · Mini 1');
        expect(HudRules.stageShare(150, 100, 300)).toBe(0.25);
        expect(HudRules.stageShare(50, 100, 300)).toBe(0);
        expect(HudRules.stageShare(900, 100, 300)).toBe(1);
        expect(HudRules.stageShare(5, 10, 10)).toBe(0);
        expect(HudRules.kmText(3200, 13300)).toBe('km 3.2 / 13.3');
    });

    test('the speed gauge fills with speed and clamps at both ends', () => {
        expect(HudRules.gaugeOffset(0, 150)).toBe(100);
        expect(HudRules.gaugeOffset(75, 150)).toBe(50);
        expect(HudRules.gaugeOffset(200, 150)).toBe(0);
        expect(HudRules.gaugeOffset(-5, 150)).toBe(100);
        expect(HudRules.speedBand(0)).toBe(-1);
        expect(HudRules.speedBand(10)).toBe(0);
        expect(HudRules.speedBand(30)).toBe(1);
        expect(HudRules.speedBand(60)).toBe(2);
    });
});

describe('Hud', () => {
    let hud;

    beforeEach(() => {
        jest.useFakeTimers();
        localStorage.clear();
        document.body.innerHTML = markup;
        document.body.className = '';
        hud = new Hud(document, fakeWindow());
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('the hint fades once, when its rule turns false, and comes back for a new run', () => {
        const hint = document.getElementById('hudHint');
        const toggle = jest.spyOn(hint.classList, 'toggle');
        hud.startRun('Leg 1 · Mountain Dawn');
        hud.update(100, NaN);
        expect(hint.classList.contains('hidden')).toBe(false);
        hud.update(800, 600);
        hud.update(600 + HudRules.HINT_AFTER_INPUT_MS, 600);
        expect(hint.classList.contains('hidden')).toBe(true);
        hud.update(4000, 600);
        hud.update(9000, 600);
        expect(toggle).toHaveBeenCalledTimes(1);

        hud.startRun('Leg 1 · Mountain Dawn');
        expect(hint.classList.contains('hidden')).toBe(false);
    });

    test('the leg name and GO wait for the third frame and leave after START_CARD_MS', () => {
        const card = document.getElementById('startCard');
        hud.startRun('Leg 2 · Valley Run');
        hud.update(0, NaN);
        hud.update(16, NaN);
        expect(card.classList.contains('active')).toBe(false);
        hud.update(33, NaN);
        expect(card.classList.contains('active')).toBe(true);
        expect(document.getElementById('startLeg').textContent).toBe('Leg 2 · Valley Run');
        jest.advanceTimersByTime(HudRules.START_CARD_MS);
        expect(card.classList.contains('active')).toBe(false);
    });

    test('FPS is hidden by default; Backquote shows it and the choice is kept', () => {
        const fps = document.getElementById('fps');
        expect(fps.hidden).toBe(true);
        hud.setFps(58);
        expect(fps.textContent).toBe('FPS 0');

        document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backquote' }));
        expect(fps.hidden).toBe(false);
        expect(localStorage.getItem(HudRules.FPS_KEY)).toBe('1');
        hud.setFps(58);
        expect(fps.textContent).toBe('FPS 58');

        const next = new Hud(document, fakeWindow());
        expect(next.fpsVisible).toBe(true);
    });

    test('?fps=1 turns the counter on without a stored choice', () => {
        document.body.innerHTML = markup;
        const shown = new Hud(document, fakeWindow('?fps=1'));
        expect(document.getElementById('fps').hidden).toBe(false);
        expect(shown.fpsVisible).toBe(true);
    });

    test('the timer is written into its existing text node, and only when it changes', () => {
        const timer = document.getElementById('raceTimer');
        const node = timer.firstChild;
        hud.setTime('0:01.23');
        expect(timer.firstChild).toBe(node);
        expect(node.nodeValue).toBe('0:01.23');
        hud.setTime('0:01.23');
        expect(node.nodeValue).toBe('0:01.23');
    });

    test('speed writes the digits, the band and the gauge only on a new whole value', () => {
        hud.setSpeed(55.2, 150);
        const fill = document.getElementById('speedFill');
        expect(document.getElementById('speed').textContent).toBe('55');
        expect(document.getElementById('hudSpeed').dataset.band).toBe('2');
        expect(fill.style.strokeDashoffset).toBe(String(HudRules.gaugeOffset(55, 150)));
        fill.style.strokeDashoffset = 'untouched';
        hud.setSpeed(54.9, 150);
        expect(fill.style.strokeDashoffset).toBe('untouched');
    });

    test('checkpoint pips follow the gates passed', () => {
        hud.setGates(0, 5);
        expect(document.querySelectorAll('#hudGatePips i')).toHaveLength(5);
        hud.setGates(2, 5);
        expect(document.querySelectorAll('#hudGatePips i.on')).toHaveLength(2);
        expect(document.getElementById('hudGateCount').textContent).toBe('2/5');
    });

    test('many gates: a long leg has up to 20 pips, which shrink; 5 gates keep the full size', () => {
        const pips = document.getElementById('hudGatePips');
        hud.setGates(7, 20);
        expect(document.querySelectorAll('#hudGatePips i')).toHaveLength(20);
        expect(document.querySelectorAll('#hudGatePips i.on')).toHaveLength(7);
        expect(document.getElementById('hudGateCount').textContent).toBe('7/20');
        expect('many' in pips.dataset).toBe(true);
        hud.setGates(0, HudRules.MANY_GATES);
        expect('many' in pips.dataset).toBe(false);
        hud.setGates(0, 14);
        expect('many' in pips.dataset).toBe(true);
        hud.setGates(0, 5);
        expect('many' in pips.dataset).toBe(false);
    });

    test('a stage with more gates than MAX_PIPS shows the count and no pips', () => {
        hud.setGates(3, HudRules.MAX_PIPS + 6);
        expect(document.querySelectorAll('#hudGatePips i')).toHaveLength(0);
        expect(document.getElementById('hudGateCount').textContent).toBe(`3/${HudRules.MAX_PIPS + 6}`);
    });

    test('a stage of exactly MAX_PIPS gates still shows every pip, and a new stage starts the pips again', () => {
        hud.setGates(5, HudRules.MAX_PIPS);
        expect(document.querySelectorAll('#hudGatePips i')).toHaveLength(HudRules.MAX_PIPS);
        hud.setGates(0, 3);
        expect(document.querySelectorAll('#hudGatePips i')).toHaveLength(3);
        expect(document.querySelectorAll('#hudGatePips i.on')).toHaveLength(0);
        expect(document.getElementById('hudGateCount').textContent).toBe('0/3');
    });

    test('a world ride shows one progress element: the bar with a tick for each checkpoint, the rider\'s place and the count', () => {
        const box = document.getElementById('hudProgress');
        const pips = document.getElementById('hudGates');
        expect(box.hidden).toBe(true);
        hud.setGates(0, 5);
        hud.showProgress([0.25, 0.5]);
        expect(box.hidden).toBe(false);
        // The pips of the classic legs are out of sight: the checkpoints are shown once
        expect(pips.hidden).toBe(true);
        expect(document.querySelectorAll('#hudProgressMarks i')).toHaveLength(2);
        expect(document.querySelector('#hudProgressMarks i').style.left).toBe('25.00%');
        hud.setGates(1, 2);
        expect(document.getElementById('hudProgressCount').textContent).toBe('1/2');
        expect(document.querySelectorAll('#hudProgressMarks i.on')).toHaveLength(1);
        // (the pips are not written while the bar shows the checkpoints)
        expect(document.getElementById('hudGateCount').textContent).toBe('0/5');
        hud.setProgress(0.4567, 'km 1.2 / 13.3');
        expect(document.getElementById('hudProgressBar').style.getPropertyValue('--at')).toBe('45.7%');
        expect(document.getElementById('hudProgressKm').textContent).toBe('km 1.2 / 13.3');
        expect(document.getElementById('hudStageText').textContent).toBe('');
        hud.hideProgress();
        expect(box.hidden).toBe(true);
        expect(pips.hidden).toBe(false);
        hud.setGates(2, 5);
        expect(document.getElementById('hudGateCount').textContent).toBe('2/5');
    });

    test('the progress of a frame writes only what changed', () => {
        hud.showProgress([0.5]);
        hud.setProgress(0.25, 'km 0.5 / 6.0', 'Stage 2/3 · Mini 2  0:03.2');
        const bar = document.getElementById('hudProgressBar');
        const setProperty = jest.spyOn(bar.style, 'setProperty');
        const km = document.getElementById('hudProgressKm').firstChild;
        hud.setProgress(0.25004, 'km 0.5 / 6.0', 'Stage 2/3 · Mini 2  0:03.2');
        expect(setProperty).not.toHaveBeenCalled();
        expect(document.getElementById('hudProgressKm').firstChild).toBe(km);
        hud.setProgress(0.3, 'km 0.5 / 6.0', 'Stage 2/3 · Mini 2  0:03.3');
        expect(setProperty).toHaveBeenCalledTimes(1);
        expect(document.getElementById('hudStageText').textContent).toBe('Stage 2/3 · Mini 2  0:03.3');
    });

    // The rides as their data has them: the shipped world (the Tremola, and leg 12 ridden against it), and the fixture of
    // three. A stage's stations are its own list in the manifest, turned round for a stage ridden against the ride, as
    // WorldData.useStage gives the game them: the folder's file holds every stage's, and a stage reads only its own
    const json = path => JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));
    const stagesOf = folder => {
        const ride = json(`${folder}/ride.json`), manifest = json(`${folder}/manifest.json`);
        return manifest.stages.map(stage => {
            const dir = stage.dir === -1 ? -1 : 1;
            const at = s => (dir === 1 ? s : Math.round((ride.length - s) * 1000) / 1000);
            const [from, to] = dir === 1 ? [stage.from, stage.to] : [at(stage.to), at(stage.from)];
            const own = Array.isArray(stage.stations) ? stage.stations.map(i => ride.stations[i]) : ride.stations.filter(st => st.stage === stage.id);
            const stations = own.map(st => ({ s: at(st.s) })).sort((a, b) => a.s - b.s);
            stations.forEach((st, i) => { st.kind = i === 0 ? 'start' : i === stations.length - 1 ? 'end' : 'gate'; });
            return { id: stage.id, from, to, stations, gates: stations.slice(1, -1) };
        });
    };

    test('the count and the ticks are the data\'s checkpoints of the stage, whatever their number', () => {
        for (const path of ['world', 'tests/fixtures/world/mini']) {
            const stages = stagesOf(path);
            expect(stages.length).toBeGreaterThan(0);
            for (const stage of stages) {
                const gates = stage.gates;
                expect(gates.length).toBeGreaterThan(0);
                const marks = HudRules.progressMarks(stage.stations, stage.from, stage.to);
                expect({ path, stage: stage.id, marks: marks.length }).toEqual({ path, stage: stage.id, marks: gates.length });
                marks.forEach((share, i) => expect(share).toBeCloseTo((gates[i].s - stage.from) / (stage.to - stage.from), 6));
                // The start, the end and a stage boundary are no checkpoint: no tick at either end of the bar
                marks.forEach(share => { expect(share).toBeGreaterThan(0); expect(share).toBeLessThan(1); });
                hud.showProgress(marks);
                hud.setGates(0, gates.length);
                expect(document.querySelectorAll('#hudProgressMarks i')).toHaveLength(gates.length);
                expect(document.getElementById('hudProgressCount').textContent).toBe(`0/${gates.length}`);
            }
        }
    });

    test('the stage text is absent with one stage and present with three', () => {
        const one = json('world/ride.json');
        const three = json('tests/fixtures/world/mini/ride.json');
        expect(one.stages).toHaveLength(1);
        expect(three.stages).toHaveLength(3);
        hud.showProgress([]);
        hud.setProgress(0.1, 'km 0.1 / 13.2', HudRules.stageLine(1, one.stages.length, one.stages[0].name, 3200));
        expect(document.getElementById('hudStageText').textContent).toBe('');
        hud.setProgress(0.1, 'km 0.1 / 6.0', HudRules.stageLine(2, three.stages.length, three.stages[1].name, 3200));
        expect(document.getElementById('hudStageText').textContent).toBe(`Stage 2/3 · ${three.stages[1].name}  0:03.2`);
        // The start card names the stage the same way
        expect(HudRules.stageLabel(1, one.stages.length, 'Road')).toBe('Road');
        expect(HudRules.stageLabel(1, three.stages.length, 'Road')).toBe('Stage 1/3 · Road');
    });

    // index.html and css/ui.css as they ship
    const page = () => {
        const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
        return new DOMParser().parseFromString(html.replace(/<script[\s\S]*?<\/script>/g, ''), 'text/html');
    };

    test('the page holds one progress element, and the pips and the bar are never shown together', () => {
        const doc = page();
        expect(doc.querySelectorAll('.hud-progress-bar')).toHaveLength(1);
        expect(doc.querySelectorAll('#hudProgressCount')).toHaveLength(1);
        // The stage line of the old HUD, with its own clock and its own marks, is gone
        for (const id of ['hudStage', 'hudStageName', 'hudStageKm', 'hudStageMarks', 'hudStageFill']) expect({ id, found: !!doc.getElementById(id) }).toEqual({ id, found: false });
        const real = new Hud(doc, fakeWindow());
        expect(doc.getElementById('hudProgress').hidden).toBe(true);
        real.showProgress([0.5]);
        expect([doc.getElementById('hudProgress').hidden, doc.getElementById('hudGates').hidden]).toEqual([false, true]);
        real.hideProgress();
        expect([doc.getElementById('hudProgress').hidden, doc.getElementById('hudGates').hidden]).toEqual([true, false]);
        const css = readFileSync(new URL('../../css/ui.css', import.meta.url), 'utf8');
        expect(css).toMatch(/\.hud-gates\[hidden\] \{\s*display: none;/);
        expect(css).toMatch(/\.hud-progress\[hidden\] \{\s*display: none;/);
    });

    test('the bike\'s corner keeps empty, named room for the gear, the revs and the rider mode', () => {
        const doc = page();
        const css = readFileSync(new URL('../../css/ui.css', import.meta.url), 'utf8');
        for (const [id, name] of [['hudGear', 'hud-gear'], ['hudRevs', 'hud-revs'], ['hudMode', 'hud-mode']]) {
            const slot = doc.getElementById(id);
            expect({ id, inCorner: !!slot && !!slot.closest('#hudBike'), empty: !!slot && slot.childNodes.length === 0 }).toEqual({ id, inCorner: true, empty: true });
            expect(css).toMatch(new RegExp(`\\.${name} \\{`));
        }
        expect(doc.getElementById('hudSpeed').closest('#hudBike')).not.toBeNull();
    });

    test('the pause panel brings the key hints back, and a new run or a resume lets them go', () => {
        const hint = document.getElementById('hudHint');
        hud.startRun('Road');
        hud.update(HudRules.HINT_MS, NaN);
        expect(hint.classList.contains('hidden')).toBe(true);
        hud.recallHint(true);
        expect(hint.classList.contains('recall')).toBe(true);
        hud.recallHint(false);
        expect([hint.classList.contains('recall'), hint.classList.contains('hidden')]).toEqual([false, true]);
        hud.recallHint(true);
        hud.startRun('Road');
        expect(hint.classList.contains('recall')).toBe(false);
        const src = read('main.js');
        expect(src).toMatch(/recallHint\(true\)/);
        expect(src).toMatch(/recallHint\(false\)/);
    });

    test('the many-gates pips are smaller and closer in css/ui.css', () => {
        const css = readFileSync(new URL('../../css/ui.css', import.meta.url), 'utf8');
        expect(css).toMatch(/#hudGatePips\[data-many\] \{\s*gap: 2px;/);
        expect(css).toMatch(/#hudGatePips\[data-many\] i \{\s*width: calc\(var\(--fs-meta\) \* 0\.4\);/);
    });

    test('call-outs stack without overlap, cap at CALLOUT_LIMIT, merge repeats and leave on time', () => {
        const box = document.getElementById('callouts');
        hud.callout('Cone hit +50', 'warn', 1000);
        hud.callout('Cone hit +50', 'warn', 1000);
        expect(box.children).toHaveLength(1);
        hud.callout('Flip! +200', 'gold', 1000);
        hud.callout('Near miss +100', 'gold', 1000);
        hud.callout('Speed streak +250', 'gold', 1000);
        expect(box.children).toHaveLength(HudRules.CALLOUT_LIMIT);
        expect(box.lastElementChild.className).toBe('callout tone-gold');
        jest.advanceTimersByTime(1000);
        expect(Array.from(box.children).every(child => child.classList.contains('leaving'))).toBe(true);
        jest.advanceTimersByTime(300);
        expect(box.children).toHaveLength(0);
    });

    test('a new run clears the last run\'s split and call-outs', () => {
        hud.showSplit('<div>CHECKPOINT 1/5</div>');
        hud.callout('Cone hit +50', 'warn', 5000);
        document.body.classList.add('run-over');
        hud.startRun('Leg 1 · Mountain Dawn');
        expect(document.getElementById('splitPopup').classList.contains('show')).toBe(false);
        expect(document.getElementById('callouts').children).toHaveLength(0);
        expect(document.body.classList.contains('run-over')).toBe(false);
    });
});

describe('touch controls', () => {
    const realMatchMedia = window.matchMedia;

    afterEach(() => {
        window.matchMedia = realMatchMedia;
        document.body.innerHTML = '';
        document.body.className = '';
    });

    const stubPointer = coarse => {
        window.matchMedia = query => ({ matches: coarse ? /coarse/.test(query) : /fine/.test(query) });
    };

    test('a desktop gets no on-screen buttons until it is touched', () => {
        stubPointer(false);
        const input = new InputHandler();
        expect(input.virtualControls).toBeNull();
        expect(document.querySelector('.virtual-controls-left')).toBeNull();

        window.dispatchEvent(new Event('touchstart'));
        expect(input.virtualControls).not.toBeNull();
        expect(document.body.classList.contains('touch')).toBe(true);
    });

    test('a phone gets labelled thumb buttons that report their keys', () => {
        stubPointer(true);
        const input = new InputHandler();
        const throttle = document.querySelector('.virtual-button.throttle');
        expect(throttle.getAttribute('aria-label')).toBe('Throttle');
        expect(document.querySelectorAll('.virtual-button')).toHaveLength(5);
        expect(document.querySelector('.virtual-button-camera')).not.toBeNull();

        throttle.dispatchEvent(new Event('touchstart', { cancelable: true }));
        expect(input.virtualControls.getKey('KeyW')).toBe(true);
        expect(throttle.classList.contains('pressed')).toBe(true);
        throttle.dispatchEvent(new Event('touchend', { cancelable: true }));
        expect(input.virtualControls.getKey('KeyW')).toBe(false);
    });
});
