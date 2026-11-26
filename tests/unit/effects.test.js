// The effects (js/effects.js): one table, from which the settings dialog and the presets are built, and which the
// quality ladder reads. Held here:
//   - every effect is one row with a name, levels that start at 'off', a default, a level for each preset, a measured
//     cost and how it is switched; a row without one of them fails
//   - every switch the renderer has (Graphics.setEffects) belongs to a row, so an effect with no entry fails
//   - under Auto each ladder level holds the effects to its share, the dearest go first, and they go before the pixel
//     ratio does; a fixed preset leaves every effect as chosen
//   - the choice is kept and read back, and a stored choice that cannot be read leaves the defaults
//   - the cascade's light chunk is three's own with two casting lights, and three's own with one
//   - every time of day and weather has a grade; the land detail's textures are the same on every page
//   - the settings dialog is built from the table (and from Sound.SETTINGS when the sound engine defines it)
import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { loadScript, realThree } from '../helpers/load-game.js';

const three = realThree();
// A copy of the one chunk the cascade patches: the real module is shared with other test files
const fakeThree = { ShaderChunk: { lights_fragment_begin: three.ShaderChunk.lights_fragment_begin }, Vector3: three.Vector3 };
const { Effects, Cascades, EffectSettings } = new Function('THREE', `${loadScript('effects.js')}\nreturn { Effects, Cascades, EffectSettings };`)(fakeThree);
const { Quality } = new Function(`${loadScript('quality.js')}\nreturn { Quality };`)();
const { LandDetail } = new Function('THREE', `${loadScript('world/landdetail.js')}\nreturn { LandDetail };`)(three);
const graphicsSource = loadScript('graphics.js');
// Only the tables are read: no THREE, so the shared module's colour management is left alone
const { SKY_PRESETS, SKY_WEATHER, GFX_GRADES, GFX_GRADE_WEATHER } = new Function('THREE', `${graphicsSource}\nreturn { SKY_PRESETS, SKY_WEATHER, GFX_GRADES, GFX_GRADE_WEATHER };`)({});

const top = Quality.LEVELS.length - 1;

// A store like localStorage
function store(initial = {}) {
    const data = { ...initial };
    return { getItem: key => (key in data ? data[key] : null), setItem: (key, value) => { data[key] = String(value); }, data };
}

describe('the table', () => {
    test('every effect is a whole row', () => {
        expect(Effects.LIST.length).toBeGreaterThanOrEqual(6);
        for (const effect of Effects.LIST) expect(Effects.problems(effect)).toEqual([]);
        expect(new Set(Effects.LIST.map(e => e.id)).size).toBe(Effects.LIST.length);
    });

    test('a row with no default, no off state or no cost fails', () => {
        const good = Effects.LIST[0];
        expect(Effects.problems({ ...good, default: 'ultra' }).join()).toMatch(/no default/);
        expect(Effects.problems({ ...good, levels: ['low', 'high'] }).join()).toMatch(/first level must be 'off'/);
        expect(Effects.problems({ ...good, cost: {} }).join()).toMatch(/no measured cost/);
        expect(Effects.problems({ ...good, presets: {} }).join()).toMatch(/no level for the/);
        expect(Effects.problems({ ...good, switch: '' }).join()).toMatch(/how it is switched/);
        expect(Effects.problems({ id: 'x' })).toEqual(['an effect needs an id and a name']);
    });

    test('every switch the renderer has belongs to a row', () => {
        // The switches of Graphics.setEffects, read from its defaults
        const defaults = graphicsSource.match(/this\.fx \|\| \(this\.fx = \{([^}]*)\}\)/);
        expect(defaults).not.toBeNull();
        const switches = defaults[1].split(',').map(pair => pair.split(':')[0].trim());
        const set = new Set();
        const game = { graphics: { setEffects: values => Object.keys(values).forEach(key => set.add(key)) }, environment: null };
        for (const effect of Effects.LIST) {
            if (effect.id === 'shadows' || effect.id === 'landDetail') continue;
            for (const level of effect.levels) effect.apply(game, level);
        }
        expect([...set].sort()).toEqual([...switches].sort());
    });

    test('every fixed preset holds a ladder level, and Auto holds none', () => {
        for (const preset of Effects.PRESETS) {
            if (preset.id === 'auto') expect(preset.level).toBeUndefined();
            else expect(Quality.LEVELS.findIndex(l => l.id === preset.level)).toBeGreaterThanOrEqual(0);
        }
        expect(Effects.preset(Effects.DEFAULT_PRESET)).not.toBeNull();
    });
});

describe('the ladder and the effects', () => {
    const inForce = level => Effects.resolve(Object.fromEntries(Effects.LIST.map(e => [e.id, e.levels[e.levels.length - 1]])), Quality.LEVELS[level].effectMs);
    const cost = levels => Effects.LIST.map(e => Effects.costOf(e, levels[e.id]));

    test('no effect in force costs more than its level\'s share, but a level a row keeps by name', () => {
        for (let level = 0; level <= top; level++) {
            const levels = inForce(level);
            for (const effect of Effects.LIST) {
                const at = levels[effect.id];
                expect(Effects.keepOf(effect, at)).toBeLessThanOrEqual(Quality.LEVELS[level].effectMs);
                // Kept past its cost only where the row says so, and never under the cost of a level below it
                if (Effects.costOf(effect, at) > Quality.LEVELS[level].effectMs) expect(effect.keep[at]).toBeDefined();
            }
        }
        // The ground texture's Medium is the one kept past its cost: on to the Rich level, off the Full one
        const rich = Quality.LEVELS.findIndex(l => l.id === 'rich'), full = Quality.LEVELS.findIndex(l => l.id === 'full');
        expect(inForce(rich).groundTex).toBe('medium');
        expect(inForce(full).groundTex).toBe('low');
        expect(inForce(full - 1).groundTex).toBe('off');
    });

    test('a step down never turns an effect on, and the top holds every effect at its highest', () => {
        for (let level = 1; level <= top; level++) {
            const lower = inForce(level - 1), higher = inForce(level);
            for (const effect of Effects.LIST) expect(effect.levels.indexOf(lower[effect.id])).toBeLessThanOrEqual(effect.levels.indexOf(higher[effect.id]));
        }
        const all = inForce(top);
        for (const effect of Effects.LIST) expect(all[effect.id]).toBe(effect.levels[effect.levels.length - 1]);
    });

    test('the dearest effects go before the pixel ratio', () => {
        const fullRatio = Quality.LEVELS[top].pixelRatio;
        const lowestFull = Quality.LEVELS.findIndex(l => l.pixelRatio === fullRatio);
        // Over the lowest level at the full pixel ratio, a step down gives up effects only
        for (let level = lowestFull + 1; level <= top; level++) {
            const a = Quality.LEVELS[level], b = Quality.LEVELS[level - 1];
            for (const name of Object.keys(Quality.FIELDS).filter(n => n !== 'effectMs')) expect(a[name]).toBe(b[name]);
            expect(a.effectMs).toBeGreaterThan(b.effectMs);
        }
        // The three dearest effects are off at every level under the full pixel ratio
        const dearest = [...Effects.LIST].sort((a, b) => Math.max(...Object.values(b.cost)) - Math.max(...Object.values(a.cost))).slice(0, 3);
        for (let level = 0; level < lowestFull; level++) {
            const levels = inForce(level);
            for (const effect of dearest) expect(levels[effect.id]).toBe('off');
        }
    });

    test('the renderer that cannot draw an effect has it off', () => {
        const levels = Effects.resolve({}, Infinity, effect => effect.id !== 'ao');
        expect(levels.ao).toBe('off');
        expect(levels.grade).toBe(Effects.byId('grade').default);
    });
});

describe('the choice', () => {
    test('the defaults, a preset, one effect changed and Default', () => {
        const settings = new EffectSettings({ storage: store() });
        expect(settings.preset).toBe('auto');
        for (const effect of Effects.LIST) expect(settings.chosen[effect.id]).toBe(effect.default);
        settings.setPreset('low');
        for (const effect of Effects.LIST) expect(settings.chosen[effect.id]).toBe(effect.presets.low);
        expect(settings.fixedLevel()).toBe('low');
        settings.set('grade', 'on');
        expect(settings.preset).toBe('low');
        expect(settings.chosen.grade).toBe('on');
        settings.reset();
        expect(settings.preset).toBe('auto');
        expect(settings.fixedLevel()).toBeNull();
    });

    test('a fixed preset leaves each effect as chosen; Auto caps it', () => {
        const settings = new EffectSettings({ storage: store() });
        settings.setPreset('high');
        expect(settings.inForce(0).ao).toBe('high');
        settings.setPreset('auto');
        settings.set('ao', 'high');
        expect(settings.inForce(0).ao).toBe('off');
        expect(settings.inForce(99).ao).toBe('high');
    });

    test('the choice is kept and read back; a stored value that cannot be read leaves the defaults', () => {
        const storage = store();
        const a = new EffectSettings({ storage });
        a.setPreset('balanced');
        a.set('smoothing', 'on');
        const b = new EffectSettings({ storage });
        expect(b.preset).toBe('balanced');
        expect(b.chosen.smoothing).toBe('on');
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const c = new EffectSettings({ storage: store({ [Effects.KEY]: '{not json' }) });
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
        expect(c.preset).toBe('auto');
        const d = new EffectSettings({ storage: store({ [Effects.KEY]: JSON.stringify({ preset: 'nope', effects: { ao: 'ultra', grade: 'off' } }) }) });
        expect(d.preset).toBe('auto');
        expect(d.chosen.ao).toBe(Effects.byId('ao').default);
        expect(d.chosen.grade).toBe('off');
    });

    test('an effect is switched only when its level changes, and an effect never on is not switched off', () => {
        const calls = [];
        const saved = Effects.LIST.map(e => e.apply);
        Effects.LIST.forEach(e => { e.apply = (game, level) => calls.push(`${e.id}=${level}`); });
        try {
            const game = {};
            const off = Object.fromEntries(Effects.LIST.map(e => [e.id, 'off']));
            Effects.apply(game, off);
            expect(calls).toEqual([]);
            Effects.apply(game, { ...off, ao: 'low' });
            Effects.apply(game, { ...off, ao: 'low' });
            Effects.apply(game, off);
            expect(calls).toEqual(['ao=low', 'ao=off']);
        } finally {
            Effects.LIST.forEach((e, k) => { e.apply = saved[k]; });
        }
    });
});

describe('the shadow cascades', () => {
    test('two casting lights take one shadow, near inside its box and far past it; one light is three\'s own', () => {
        const before = fakeThree.ShaderChunk.lights_fragment_begin;
        Cascades.patch();
        const after = fakeThree.ShaderChunk.lights_fragment_begin;
        expect(after).not.toBe(before);
        expect(after).toMatch(/NUM_DIR_LIGHT_SHADOWS == 2/);
        expect(after).toMatch(/cascadeShadow = mix\( farShadow, nearShadow, inner \)/);
        // With one casting light the #else keeps three's own line
        const own = 'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ]';
        expect(after).toContain(own);
        // Patched once
        Cascades.patch();
        expect(fakeThree.ShaderChunk.lights_fragment_begin).toBe(after);
    });

    test('the sun\'s box is the near one only while the cascades are on', () => {
        Cascades.on = false;
        expect(Cascades.nearSpan(120)).toBe(120);
        Cascades.on = true;
        expect(Cascades.nearSpan(120)).toBe(Cascades.NEAR_M);
        Cascades.on = false;
    });

    test('the casters are the trees, houses, walls, structures and stones of a world, and go back as they were', () => {
        const meshes = ['trees:spruce', 'houses:barn', 'road-works', 'tunnel', 'stones', 'world-terrain-1-lod0', 'road-ribbon'].map(name => ({ isMesh: true, name, castShadow: false, userData: {} }));
        const root = { traverse: fn => meshes.forEach(fn) };
        Cascades.casters(root, true);
        expect(meshes.filter(m => m.castShadow).map(m => m.name)).toEqual(['trees:spruce', 'houses:barn', 'road-works', 'tunnel', 'stones']);
        Cascades.casters(root, false);
        expect(meshes.some(m => m.castShadow)).toBe(false);
    });
});

describe('the grade and the land detail', () => {
    test('every time of day and every weather has a grade, near neutral', () => {
        for (const key of Object.keys(SKY_PRESETS)) expect(GFX_GRADES[key]).toBeDefined();
        for (const key of Object.keys(SKY_WEATHER)) expect(GFX_GRADE_WEATHER[key]).toBeDefined();
        for (const row of [...Object.values(GFX_GRADES), ...Object.values(GFX_GRADE_WEATHER)]) {
            for (const v of [...row.shadow, ...row.light]) {
                expect(v).toBeGreaterThan(0.85);
                expect(v).toBeLessThan(1.15);
            }
            expect(row.curve).toBeGreaterThanOrEqual(0);
            expect(row.curve).toBeLessThanOrEqual(0.3);
        }
    });

    test('the land detail\'s textures are the same every time and tile without a seam', () => {
        const a = LandDetail.grass(), b = LandDetail.grass();
        expect(a).toEqual(b);
        const n = LandDetail.SIZE;
        expect(a.length).toBe(n * n * 4);
        for (const data of [a, LandDetail.rock()]) {
            // The step across the tile's edge is no larger than the steps inside it
            let inside = 0, edge = 0;
            for (let y = 0; y < n; y++) {
                for (let x = 1; x < n; x++) inside = Math.max(inside, Math.abs(data[(y * n + x) * 4 + 3] - data[(y * n + x - 1) * 4 + 3]));
                edge = Math.max(edge, Math.abs(data[(y * n) * 4 + 3] - data[(y * n + n - 1) * 4 + 3]));
            }
            expect(edge).toBeLessThanOrEqual(inside);
        }
    });

    test('the land detail goes into the land\'s shader at all three places, and off it reads nothing', () => {
        const shader = { uniforms: {}, fragmentShader: '#include <common>\n#include <color_fragment>\n#include <normal_fragment_maps>\n' };
        LandDetail.inject(shader);
        expect(shader.uniforms.uLandDetail).toBe(LandDetail.uniforms.uLandDetail);
        expect(shader.fragmentShader).toMatch(/uniform sampler2D tLandGrass/);
        expect(shader.fragmentShader).toMatch(/if \(uLandDetail > 0\.0\)/);
        expect(shader.fragmentShader).toMatch(/normal = normalize\(mat3\(viewMatrix\) \* n\)/);
        LandDetail.set(false);
        expect(LandDetail.uniforms.uLandDetail.value).toBe(0);
    });
});

describe('the settings dialog', () => {
    let SettingsDialog;
    beforeEach(() => {
        document.body.innerHTML = '';
        (0, eval)(readFileSync(new URL('../../js/modals.js', import.meta.url), 'utf8'));
        global.Effects = Effects;
        SettingsDialog = new Function(`${loadScript('settings.js')}\nreturn SettingsDialog;`)();
    });

    const control = (settings, applied) => ({
        settings,
        apply: () => applied.push({ preset: settings.preset, ...settings.chosen }),
        inForce: () => settings.inForce(Quality.LEVELS[top].effectMs),
        supported: () => true,
        sound: () => null
    });

    test('a row for each effect and each preset; a click applies and keeps it', () => {
        const settings = new EffectSettings({ storage: store() });
        const applied = [];
        SettingsDialog.connect(control(settings, applied));
        const panel = SettingsDialog.open();
        expect(Modals.isTop(panel)).toBe(true);
        expect([...panel.querySelectorAll('[data-effect]')].map(r => r.dataset.effect)).toEqual(Effects.LIST.map(e => e.id));
        expect([...panel.querySelectorAll('[data-preset-row] .mode-btn')].map(b => b.dataset.value)).toEqual(Effects.PRESETS.map(p => p.id));
        panel.querySelector('[data-preset-row] [data-value="high"]').click();
        expect(applied.at(-1).preset).toBe('high');
        expect(panel.querySelector('[data-preset-row] [data-value="high"]').getAttribute('aria-checked')).toBe('true');
        panel.querySelector('[data-effect="ao"] [data-value="off"]').click();
        expect(settings.chosen.ao).toBe('off');
        panel.querySelector('[data-settings-default]').click();
        expect(settings.preset).toBe('auto');
        // The sound section is empty without the sound engine's table
        expect(panel.querySelector('[data-section="sound"]').hidden).toBe(true);
        panel.querySelector('[data-settings-close]').click();
        expect(document.getElementById('settings')).toBeNull();
        delete global.Effects;
    });

    test('Auto that holds an effect below the choice says so', () => {
        const settings = new EffectSettings({ storage: store() });
        settings.set('ao', 'high');
        SettingsDialog.connect({ ...control(settings, []), inForce: () => settings.inForce(0) });
        const panel = SettingsDialog.open();
        expect(panel.querySelector('[data-effect="ao"] .settings-hint').textContent).toMatch(/Auto holds it at Off/);
        SettingsDialog.close();
        delete global.Effects;
    });

    test('the sound section is built from Sound.SETTINGS when it is defined', () => {
        // The rows as js/sound.js has them: a slider's range, step and named ends
        const values = { master: 0.6, muted: false, balance: 0.5 };
        global.Sound = { SETTINGS: [
            { id: 'muted', label: 'Mute', kind: 'toggle', default: true },
            { id: 'master', label: 'Volume', kind: 'slider', range: [0, 1], step: 0.05, default: 0.7 },
            { id: 'balance', label: 'Engine and effects', kind: 'slider', range: [0, 1], step: 0.05, default: 0.5, ends: ['Effects', 'Engine'] }
        ] };
        const watchers = [];
        const manager = {
            getSetting: id => values[id],
            setSetting: jest.fn((id, v) => { values[id] = v; watchers.forEach(fn => fn(id, v)); return v; }),
            watchSettings: fn => { watchers.push(fn); return () => watchers.splice(watchers.indexOf(fn), 1); }
        };
        SettingsDialog.connect({ ...control(new EffectSettings({ storage: store() }), []), sound: () => manager });
        const panel = SettingsDialog.open();
        const section = panel.querySelector('[data-section="sound"]');
        expect(section.hidden).toBe(false);
        const slider = section.querySelector('[data-sound-setting="master"] input');
        expect(slider.value).toBe('0.6');
        expect(slider.step).toBe('0.05');
        slider.value = '0.3';
        slider.dispatchEvent(new Event('input'));
        expect(manager.setSetting).toHaveBeenCalledWith('master', 0.3);
        expect(section.querySelector('[data-sound-setting="balance"] .settings-cost').textContent).toBe('Effects 50 : 50 Engine');
        section.querySelector('[data-sound-setting="muted"] [data-value="on"]').click();
        expect(manager.setSetting).toHaveBeenCalledWith('muted', true);
        // A mute from elsewhere (the M key) shows in the open dialog
        manager.setSetting('muted', false);
        expect(section.querySelector('[data-sound-setting="muted"] [data-value="off"]').getAttribute('aria-checked')).toBe('true');
        SettingsDialog.close();
        expect(watchers).toHaveLength(0);
        delete global.Sound;
        delete global.Effects;
    });
});
