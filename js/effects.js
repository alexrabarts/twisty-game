// Effects: the lighting and screen effects a player can turn on and off, as one table (Effects.LIST). An effect is one
// row: its id, its name, its levels (the first is always 'off', which draws the game as it was before the effect), the
// level it has by default, the level of each preset, its cost as measured, what it needs of the renderer and how it is
// switched (`apply`, called only when its level changes). The settings dialog (js/settings.js) and the presets are
// built from the table, so a new effect is one row. The rules are in .agent/system/rendering.md ("Effects") and the
// cost and the ladder's share in .agent/system/graphics.md.
//
// Under the Auto preset the quality ladder (js/quality.js) caps each effect by its cost: a level's `effectMs` is the
// most GPU time one effect may take, so as the frame time steps the ladder down the dearest effects go first, before
// the pixel ratio does. A fixed preset fixes the ladder's level and leaves every effect as chosen.
const Effects = {
    KEY: 'twistyGraphics',

    // The presets of the dialog's first row. `level` is the ladder level a fixed preset holds (Quality.LEVELS id);
    // Auto has none and hands the level to the frame time
    PRESETS: [
        { id: 'auto', label: 'Auto', hint: 'The frame time chooses the detail and turns the dearest effects off first' },
        { id: 'low', label: 'Low', level: 'low', hint: 'For a slow GPU: no shadows, no samples, no effects' },
        { id: 'balanced', label: 'Balanced', level: 'high', hint: 'A lower pixel ratio, the cheap effects on' },
        { id: 'high', label: 'High', level: 'ultra', hint: 'Every effect at its top level, at full resolution' }
    ],
    DEFAULT_PRESET: 'auto',

    // The level names a row may use, in order of cost, and how the dialog writes them
    LABELS: { off: 'Off', on: 'On', low: 'Low', medium: 'Medium', high: 'High' },

    // cost: the ms each level adds to the drawing of a world frame (the draw and the wait for the GPU), the most of three
    // places: `node tools/terrain-check.mjs world-quality --world tremola --gpu --desk --measure --effects high` at
    // s 1319 by day, with --at 7900 in the rain and with --night (a 2880 x 1800 frame on an Apple M-series GPU; the
    // table and the method: .agent/system/graphics.md, "What the effects cost"). cpu: the draw submit it adds.
    // needs: what the renderer must have ('post': float targets; 'depth': the depth texture of the scene target)
    LIST: [
        {
            id: 'ao', name: 'Ambient occlusion', group: 1,
            hint: 'Dark where the bike, stones, wall feet, kerbs and house corners meet the ground',
            levels: ['off', 'low', 'high'], default: 'low', presets: { low: 'off', balanced: 'low', high: 'high' },
            cost: { low: 0.6, high: 1.1 }, cpu: 0.1, needs: 'depth',
            switch: 'Graphics.setEffects({ ao }): a half-resolution pass over the depth and a blur, multiplied in the composite; no material compiles again',
            apply: (game, level) => game.graphics.setEffects({ ao: level === 'high' ? 2 : level === 'low' ? 1 : 0 })
        },
        {
            id: 'landDetail', name: 'Land detail', group: 2,
            hint: 'Grass blades, scree and rock grain near the bike, fading with distance',
            levels: ['off', 'on'], default: 'on', presets: { low: 'off', balanced: 'on', high: 'on' },
            cost: { on: 0.1 }, cpu: 0, needs: null,
            switch: 'LandDetail.set(on): a uniform the land tiles read (LandShade.patch, detail); no material compiles again',
            apply: (game, level) => { if (typeof LandDetail !== 'undefined') LandDetail.set(level === 'on'); }
        },
        {
            id: 'groundTex', name: 'Ground texture', group: 2,
            hint: 'Fields of soil, stones and dry grass (Low), grass, soil, scree and rock textures (Medium), and their relief near the bike (High)',
            levels: ['off', 'low', 'medium', 'high'], default: 'medium', presets: { low: 'off', balanced: 'medium', high: 'high' },
            cost: { low: 0.3, medium: 1.7, high: 2.3 }, cpu: 0, needs: null,
            // Auto keeps Medium to the Rich level, not by its cost alone: it is the most look for its time of any effect
            // (.agent/system/graphics.md, "The effects on the ladder")
            keep: { medium: 0.7 },
            switch: 'GroundTex.set(game, level): a uniform the land tiles read (LandShade.patch, detail); the textures are made once, in a worker, as the settings are read; no material compiles again',
            prepare: (game, level) => { if (level !== 'off' && typeof GroundTex !== 'undefined') GroundTex.prepare(game); },
            apply: (game, level) => { if (typeof GroundTex !== 'undefined') GroundTex.set(game, level); }
        },
        {
            // On by default since the owner saw it with the ground textures. cpu: the draw submit; making the chunks as the
            // bike moves takes up to GroundCover.BUDGET_MS of a frame's update besides
            id: 'groundCover', name: 'Ground cover', group: 2,
            hint: 'Close by, grass clumps, soil and small stones on the ground, and tufts and stones standing on it',
            levels: ['off', 'on'], default: 'on', presets: { low: 'off', balanced: 'on', high: 'on' },
            cost: { on: 1.3 }, cpu: 0.1, needs: null,
            // Auto keeps it to the Rich level beside the ground texture's Medium, as that row does: by its cost alone
            // only Ultra would draw it
            keep: { on: 0.7 },
            switch: 'GroundCover.set(game, on): a uniform the land tiles read (LandShade.patch, detail), and the instanced tufts and stones round the camera (GroundCover.frame); no material compiles again',
            apply: (game, level) => { if (typeof GroundCover !== 'undefined') GroundCover.set(game, level === 'on'); }
        },
        {
            id: 'shadows', name: 'Sun shadows', group: 3,
            hint: 'Two cascades: sharp near the bike, soft far off; trees, walls and houses throw shadows',
            levels: ['off', 'on'], default: 'on', presets: { low: 'off', balanced: 'off', high: 'on' },
            cost: { on: 0.6 }, cpu: 0.2, needs: 'shadows',
            switch: 'Cascades.set(game, on): the shadowless companion light casts the far cascade, the sun the near one; every material compiles again once',
            apply: (game, level) => Cascades.set(game, level === 'on')
        },
        {
            id: 'reflections', name: 'Reflections', group: 4,
            hint: 'The wet road mirrors lamps and headlights; paint, visors and tanks get a clear coat',
            levels: ['off', 'on'], default: 'on', presets: { low: 'off', balanced: 'on', high: 'on' },
            cost: { on: 0.1 }, cpu: 0, needs: 'depth',
            switch: 'Graphics.setEffects({ wet }) in the composite, and the clear coat of the bike\'s materials (Effects.coat, a uniform)',
            apply: (game, level) => {
                game.graphics.setEffects({ wet: level === 'on' });
                Effects.coatUniform.value = level === 'on' ? 1 : 0;
                if (level === 'on') Effects.coatVehicles(game);
            }
        },
        {
            // Its cost is the frame with a lake in view (the Gotthard summit's), not the Tremola's: water drawn costs
            // nothing where no lake is (.agent/system/graphics.md, "The lakes")
            id: 'water', name: 'Lake water', group: 4,
            hint: 'Moving water on the lakes: layered waves, the sky in it and the sun\'s glint (Low, Medium), and the mountains mirrored (High)',
            levels: ['off', 'low', 'medium', 'high'], default: 'high', presets: { low: 'low', balanced: 'medium', high: 'high' },
            cost: { low: 0.2, medium: 0.3, high: 1.0 }, cpu: 0.3, needs: null,
            switch: 'Water.set(game, level): uniforms of the one water material (octaves, swell, streaks); High draws the planar reflection, a mirrored camera into a reduced target, only with a lake near and in view; nothing compiles again',
            apply: (game, level) => { if (typeof Water !== 'undefined') Water.set(game, level); }
        },
        {
            id: 'grade', name: 'Colour grade', group: 5,
            hint: 'Contrast, warm highlights and cool shadows by the time of day',
            levels: ['off', 'on'], default: 'on', presets: { low: 'off', balanced: 'on', high: 'on' },
            cost: { on: 0.2 }, cpu: 0, needs: 'post',
            switch: 'Graphics.setEffects({ grade }): a uniform of the composite; the grade of each time of day is GFX_GRADES',
            apply: (game, level) => game.graphics.setEffects({ grade: level === 'on' })
        },
        {
            id: 'smoothing', name: 'Edge smoothing', group: 6,
            hint: 'Smooths thin things (rails, wires, grass) after the samples',
            levels: ['off', 'on'], default: 'off', presets: { low: 'off', balanced: 'off', high: 'on' },
            cost: { on: 0.8 }, cpu: 0.1, needs: 'post',
            switch: 'Graphics.setEffects({ smoothing }): the composite draws to a target, and one more full-screen pass smooths its edges',
            apply: (game, level) => game.graphics.setEffects({ smoothing: level === 'on' })
        },
        {
            id: 'streaks', name: 'Headlight glare', group: 6,
            hint: 'Glow and streaks on lamps and oncoming headlights at night and in rain',
            levels: ['off', 'on'], default: 'on', presets: { low: 'off', balanced: 'on', high: 'on' },
            cost: { on: 0.2 }, cpu: 0, needs: 'bloom',
            switch: 'Graphics.setEffects({ streaks }): two passes at a quarter of the bloom, added in the composite by the night and the rain',
            apply: (game, level) => game.graphics.setEffects({ streaks: level === 'on' })
        },
        {
            id: 'edgeBlur', name: 'Speed blur', group: 6,
            hint: 'Light motion blur at the screen edges at speed (the game had it before the effects)',
            levels: ['off', 'on'], default: 'on', presets: { low: 'on', balanced: 'on', high: 'on' },
            cost: { on: 0.2 }, cpu: 0, needs: 'post',
            switch: 'Graphics.setEffects({ edgeBlur }): the composite\'s radial blur',
            apply: (game, level) => game.graphics.setEffects({ edgeBlur: level === 'on' })
        }
    ],

    byId(id) {
        return Effects.LIST.find(effect => effect.id === id) || null;
    },

    preset(id) {
        return Effects.PRESETS.find(preset => preset.id === id) || null;
    },

    // The cost of a level of an effect, 0 for 'off'
    costOf(effect, level) {
        return level === 'off' ? 0 : Number(effect.cost[level]) || 0;
    },

    // The ms a level counts as on the ladder: its cost, or its `keep` where a row keeps a level longer than its cost
    // alone would (the look it gives for its time); never less than the cost of the level under it
    keepOf(effect, level) {
        return effect.keep && effect.keep[level] !== undefined ? effect.keep[level] : Effects.costOf(effect, level);
    },

    // Before any level is in force: what a row must make for the level chosen (textures, in the background)
    prepare(game, chosen) {
        for (const effect of Effects.LIST) {
            if (typeof effect.prepare !== 'function') continue;
            try {
                effect.prepare(game, chosen[effect.id] || effect.default);
            } catch (error) {
                console.error(`Effects: ${effect.id} could not prepare:`, error);
            }
        }
    },

    // The problems of one row as a list of text, empty for a valid row
    problems(effect) {
        const out = [];
        if (!effect || typeof effect.id !== 'string' || typeof effect.name !== 'string') return ['an effect needs an id and a name'];
        const levels = effect.levels;
        if (!Array.isArray(levels) || levels[0] !== 'off' || levels.length < 2) out.push(`${effect.id}: the first level must be 'off', and there must be another`);
        if (Array.isArray(levels) && levels.some(level => !Effects.LABELS[level])) out.push(`${effect.id}: a level has no label`);
        if (!Array.isArray(levels) || !levels.includes(effect.default)) out.push(`${effect.id}: no default level`);
        for (const preset of Effects.PRESETS.filter(p => p.level)) {
            if (!effect.presets || !Array.isArray(levels) || !levels.includes(effect.presets[preset.id])) out.push(`${effect.id}: no level for the ${preset.id} preset`);
        }
        for (const level of (levels || []).slice(1)) {
            if (!effect.cost || !(Number(effect.cost[level]) >= 0)) out.push(`${effect.id}: no measured cost for ${level}`);
        }
        // A level kept longer than its cost must still cost the ladder more than the level under it
        for (const [k, level] of (levels || []).entries()) {
            if (k > 1 && Effects.keepOf(effect, level) < Effects.keepOf(effect, levels[k - 1])) out.push(`${effect.id}: ${level} is kept for less than the level under it`);
            if (effect.keep && effect.keep[level] !== undefined && effect.keep[level] > Effects.costOf(effect, level)) out.push(`${effect.id}: ${level} is kept for more than it costs`);
        }
        if (typeof effect.apply !== 'function') out.push(`${effect.id}: no apply`);
        if (typeof effect.switch !== 'string' || !effect.switch) out.push(`${effect.id}: no text of how it is switched`);
        return out;
    },

    // Whether the renderer can draw an effect (a page without float targets has no post-processing)
    supported(effect, graphics, game = null) {
        if (!graphics) return false;
        if (effect.needs === 'post') return !!graphics.postEnabled;
        if (effect.needs === 'depth') return !!graphics.atmosphereSupported;
        if (effect.needs === 'bloom') return !!graphics.postEnabled;
        if (effect.needs === 'shadows') return !!(game && game.distantLight);
        return true;
    },

    // The level in force of each effect: the chosen level, or under Auto the highest level up to it that costs no more
    // than `effectMs` (the ladder level's share), and 'off' where the renderer cannot draw it
    resolve(chosen, effectMs = Infinity, supported = () => true) {
        const out = {};
        for (const effect of Effects.LIST) {
            let at = Math.max(0, effect.levels.indexOf(chosen[effect.id] || effect.default));
            while (at > 0 && Effects.keepOf(effect, effect.levels[at]) > effectMs) at--;
            out[effect.id] = supported(effect) ? effect.levels[at] : 'off';
        }
        return out;
    },

    // What each effect was last switched to on a game, so `apply` runs only at a change
    apply(game, levels) {
        const done = game.effectLevels || (game.effectLevels = {});
        for (const effect of Effects.LIST) {
            const level = levels[effect.id] || 'off';
            if (done[effect.id] === level) continue;
            // A level never applied before is 'off' as the game starts: turning an effect off that was never on is a no-op
            if (done[effect.id] === undefined && level === 'off') { done[effect.id] = level; continue; }
            try {
                effect.apply(game, level);
                done[effect.id] = level;
            } catch (error) {
                console.error(`Effects: ${effect.id} could not be set to ${level}:`, error);
            }
        }
    },

    // A built world mesh (a tile, a section, a side road): what an effect in force adds to it
    dress(game, root) {
        if (game.effectLevels && game.effectLevels.shadows === 'on') Cascades.casters(root, true);
    },

    // Once a frame, before the draw
    frame(game) {
        const levels = game.effectLevels || {};
        if (levels.reflections === 'on') Effects.coatVehicles(game);
        if (levels.groundCover === 'on' && typeof GroundCover !== 'undefined') GroundCover.frame(game);
        if (typeof Water !== 'undefined') Water.frame(game);
        const g = game.graphics;
        if (!g || !g.setGlare) return;
        // The glare and the wet road by the night and the rain (WeatherSystem.mix, RoadSurface.wetness on a world)
        const mix = game.weatherSystem && game.weatherSystem.mix ? game.weatherSystem.mix : null;
        const rain = mix ? Math.min(1, (mix.rain || 0) * (mix.intensity === undefined ? 1 : mix.intensity)) : 0;
        const wet = typeof RoadSurface !== 'undefined' && game.environment && game.environment.isWorld ? RoadSurface.wetness || 0 : rain;
        const night = g.timeKey === 'night' ? 1 : g.timeKey === 'twilight' ? 0.5 : 0;
        g.setGlare(Math.max(night, rain), wet);
    },

    // The clear coat: a second, sharp lobe of the environment over paint, visors and tanks. One uniform for all; a
    // material is patched once, the first time the effect is on, and at 0 the lobe adds nothing
    coatUniform: { value: 0 },

    coat(material) {
        if (!material || material.userData.coat || !material.isMeshStandardMaterial) return;
        material.userData.coat = true;
        const before = material.onBeforeCompile;
        const key = `${material.customProgramCacheKey()}|coat`;
        material.onBeforeCompile = (shader, renderer) => {
            if (before) before.call(material, shader, renderer);
            shader.uniforms.uCoat = Effects.coatUniform;
            shader.fragmentShader = shader.fragmentShader
                .replace('#include <common>', '#include <common>\nuniform float uCoat;')
                .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
if (uCoat > 0.0) {
    // A clear lacquer over the base: Schlick's Fresnel at an index of 1.5, the environment at a near-mirror roughness
    float coatNV = saturate(dot(geometry.normal, geometry.viewDir));
    float coatF = (0.04 + 0.96 * pow(1.0 - coatNV, 5.0)) * uCoat;
    vec3 coatLight = getIBLRadiance(geometry.viewDir, geometry.normal, 0.03);
    reflectedLight.directDiffuse *= 1.0 - coatF;
    reflectedLight.directSpecular *= 1.0 - coatF;
    reflectedLight.indirectDiffuse *= 1.0 - coatF;
    reflectedLight.indirectSpecular = reflectedLight.indirectSpecular * (1.0 - coatF) + coatLight * coatF;
}
#endif`);
        };
        material.customProgramCacheKey = () => key;
        material.needsUpdate = true;
    },

    // The coated parts of every bike on the road: the paint, the tank, the helmet and the visor (the vehicle contract:
    // .agent/system/rendering.md, "Contract")
    coatVehicles(game) {
        const vehicles = [game.vehicle, ...((game.traffic && game.traffic.motorcycles) || [])].filter(Boolean);
        for (const vehicle of vehicles) {
            const parts = [vehicle.frame, vehicle.fuelTank, vehicle.helmet, vehicle.visor];
            const stamp = parts.map(part => (part && part.uuid) || '').join();
            if (vehicle.coated === stamp) continue;
            vehicle.coated = stamp;
            for (const part of parts) {
                if (!part) continue;
                if (part.material) [].concat(part.material).forEach(m => Effects.coat(m));
                if (part.traverse) part.traverse(o => { if (o.material) [].concat(o.material).forEach(m => Effects.coat(m)); });
            }
        }
    }
};

// The two shadow cascades. Before them the sun had one shadow box (render.shadowSpan, 120 m) round the bike, and the
// shadowless companion light (Game.distantLight) shone the same way. With them the sun's box is near (NEAR_M, sharp)
// and the companion casts a far one (FAR_M, soft); the light chunk (patched once below) takes the near map where a
// point lies in its box and the far one past it, blended over the near box's rim, for both lights. Trees, walls and
// houses cast while the cascades are on (they cast nothing before them: one 120 m box could not hold their shadows)
const Cascades = {
    NEAR_M: 60,
    FAR_M: 420,
    // The far map is drawn every other frame: it is the softer one and moves least
    FAR_EVERY: 2,
    // Names of the world meshes that cast while the cascades are on: the trees and houses of a tile (Scenery.buildTile),
    // a section's edge works (walls, aprons, parapets: RoadMesh.addEdgeWorks) and its tunnels and bridges, the stones
    CASTERS: /^(trees:|houses:|landmark:|road-works$|tube-lining$|tunnel$|bridge$|stones$|stone-kerbs$|boulders$)/,

    set(game, on) {
        const far = game.distantLight;
        const sun = game.directionalLight;
        if (!far || !sun) return;
        Cascades.patch();
        Cascades.on = on;
        far.castShadow = on;
        if (on) {
            const s = far.shadow;
            s.bias = -0.0008;
            s.normalBias = 0.25;
            s.camera.near = 1;
            s.camera.far = Cascades.FAR_M * 2.2;
            const half = Cascades.FAR_M / 2;
            Object.assign(s.camera, { left: -half, right: half, top: half, bottom: -half });
            s.camera.updateProjectionMatrix();
            const size = Math.min(2048, sun.shadow.mapSize.x || 2048);
            s.mapSize.set(size, size);
            s.autoUpdate = false;
            s.needsUpdate = true;
        }
        // Every draw moves the far box and asks for its map at its pace, a probe's draw as the game's
        if (game.graphics) game.graphics.onRender = on ? () => Cascades.follow(game) : null;
        // The sun's own box: near while the cascades are on, the leg's span when they are off
        if (game.applyShadowBox) game.applyShadowBox({ shadowSpan: game.appliedShadowSpan || 120 });
        const root = game.environment && game.environment.group;
        if (root) Cascades.casters(root, on);
    },

    // The span of the sun's box: the near cascade's while the cascades are on, else the leg's own
    nearSpan(span) {
        return Cascades.on ? Math.min(span, Cascades.NEAR_M) : span;
    },

    casters(root, on) {
        root.traverse(o => {
            if (!o.isMesh || !Cascades.CASTERS.test(o.name)) return;
            if (o.userData.castBefore === undefined) o.userData.castBefore = o.castShadow;
            o.castShadow = on ? true : o.userData.castBefore;
        });
    },

    // The far cascade follows the camera's view, ahead of the bike, and is drawn every FAR_EVERY draws (Graphics.render
    // calls it first)
    follow(game) {
        const far = game.distantLight;
        if (!far || !far.castShadow) return;
        const frames = (Cascades.frames = (Cascades.frames || 0) + 1);
        if (frames % Cascades.FAR_EVERY) return;
        const at = game.vehicle ? game.vehicle.position : null;
        const camera = game.camera;
        if (!at || !camera) return;
        const ahead = Cascades.ahead || (Cascades.ahead = new THREE.Vector3());
        camera.getWorldDirection(ahead);
        ahead.y = 0;
        if (ahead.lengthSq() > 1e-6) ahead.normalize().multiplyScalar(Cascades.FAR_M * 0.3);
        const offset = game.sunOffset || { x: 50, y: 80, z: 0 };
        // On the far map's texel grid, so its shadows do not crawl as the box moves
        const texel = Cascades.FAR_M / far.shadow.mapSize.x;
        const snap = v => Math.round(v / texel) * texel;
        const x = snap(at.x + ahead.x), y = snap(at.y), z = snap(at.z + ahead.z);
        const length = Math.hypot(offset.x, offset.y, offset.z || 0) || 1;
        const reach = Cascades.FAR_M;
        far.position.set(x + offset.x / length * reach, y + offset.y / length * reach, z + (offset.z || 0) / length * reach);
        far.target.position.set(x, y, z);
        far.target.updateMatrixWorld();
        far.shadow.needsUpdate = true;
    },

    // three's light chunk with the cascade: when two directional lights cast (the sun near, the companion far), both
    // take one shadow, the near map's inside its box and the far map's past it. With one, the chunk is three's own
    patch() {
        if (Cascades.patched || typeof THREE === 'undefined') return;
        const chunk = THREE.ShaderChunk.lights_fragment_begin;
        const call = 'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;';
        const loop = '#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )';
        if (!chunk.includes(call) || !chunk.includes(loop)) throw new Error('Cascades: three\'s lights_fragment_begin is not the one the cascade was written for');
        const cascade = `#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS == 2 && defined( RE_Direct )
	float cascadeShadow = 1.0;
	{
		vec4 nearCoord = vDirectionalShadowCoord[ 0 ];
		vec3 c = nearCoord.xyz / nearCoord.w;
		// 1 well inside the near box, 0 at its rim and outside
		float edge = min( min( c.x, 1.0 - c.x ), min( c.y, 1.0 - c.y ) );
		float inner = smoothstep( 0.0, 0.12, edge ) * step( c.z, 1.0 );
		float nearShadow = 1.0;
		float farShadow = 1.0;
		if ( inner > 0.0 ) nearShadow = getShadow( directionalShadowMap[ 0 ], directionalLightShadows[ 0 ].shadowMapSize, directionalLightShadows[ 0 ].shadowBias, directionalLightShadows[ 0 ].shadowRadius, vDirectionalShadowCoord[ 0 ] );
		if ( inner < 1.0 ) farShadow = getShadow( directionalShadowMap[ 1 ], directionalLightShadows[ 1 ].shadowMapSize, directionalLightShadows[ 1 ].shadowBias, directionalLightShadows[ 1 ].shadowRadius, vDirectionalShadowCoord[ 1 ] );
		cascadeShadow = mix( farShadow, nearShadow, inner );
	}
#endif
`;
        const shadowed = `#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS == 2
		directLight.color *= ( directLight.visible && receiveShadow ) ? cascadeShadow : 1.0;
		#else
		${call}
		#endif`;
        THREE.ShaderChunk.lights_fragment_begin = chunk.replace(loop, `${cascade}${loop}`).replace(call, shadowed);
        Cascades.patched = true;
    }
};

// The player's choice: a preset and a level for each effect, kept in localStorage (Effects.KEY). Choosing a preset
// sets every effect to that preset's level (Auto: the defaults); an effect changed after keeps the preset
class EffectSettings {
    constructor({ storage = null } = {}) {
        this.storage = storage;
        this.reset(false);
        this.load();
    }

    reset(save = true) {
        this.preset = Effects.DEFAULT_PRESET;
        this.chosen = Object.fromEntries(Effects.LIST.map(effect => [effect.id, effect.default]));
        if (save) this.save();
    }

    load() {
        if (!this.storage) return;
        let saved = null;
        try {
            saved = JSON.parse(this.storage.getItem(Effects.KEY) || 'null');
        } catch (error) {
            console.warn('Effects: the stored graphics settings could not be read; the defaults stand:', error);
            return;
        }
        if (!saved || typeof saved !== 'object') return;
        if (Effects.preset(saved.preset)) this.preset = saved.preset;
        for (const effect of Effects.LIST) {
            const level = saved.effects && saved.effects[effect.id];
            if (effect.levels.includes(level)) this.chosen[effect.id] = level;
        }
    }

    save() {
        if (!this.storage) return;
        try {
            this.storage.setItem(Effects.KEY, JSON.stringify({ preset: this.preset, effects: this.chosen }));
        } catch (error) {
            console.warn('Effects: the graphics settings could not be stored:', error);
        }
    }

    setPreset(id) {
        const preset = Effects.preset(id);
        if (!preset) throw new Error(`Effects: no preset ${id}`);
        this.preset = id;
        for (const effect of Effects.LIST) this.chosen[effect.id] = preset.level ? effect.presets[id] : effect.default;
        this.save();
    }

    set(id, level) {
        const effect = Effects.byId(id);
        if (!effect || !effect.levels.includes(level)) throw new Error(`Effects: no level ${level} of ${id}`);
        this.chosen[id] = level;
        this.save();
    }

    // The ladder level a fixed preset holds, or null for Auto
    fixedLevel() {
        const preset = Effects.preset(this.preset);
        return preset && preset.level ? preset.level : null;
    }

    // The level in force of each effect, under the ladder's share when the preset is Auto
    inForce(effectMs, supported) {
        return Effects.resolve(this.chosen, this.fixedLevel() ? Infinity : effectMs, supported);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Effects, Cascades, EffectSettings };
}
