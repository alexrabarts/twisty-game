#!/usr/bin/env node
// One model in the game's own renderer and light, at fixed views, so the pictures of one round compare with the next
// (the model-build skill, .claude/skills/model-build). The page is the game itself (index.html with ?debug): the menu's
// rider stage (Game.startRiderShowcase: its stand, its floor, its golden light and its sun) and the game's post chain
// (Graphics.render) at the quality level `full`, held. A bike is built as the menu builds it (new Vehicle, then
// BikeModels.dress) with its rider in the outfit named; the far crew view dresses a crew rider with BikeModels.crew from
// the bike's far file. Any other file (a car, a building, a prop) is read with SceneAssets.loadModel and stood on the
// stand in its file's colours.
//
// Views (each `<view>.png`, with `<view>.mask.png`: the model alone in white on black, which tools/model-stats.mjs reads):
//   front3q   front three-quarter, the sun side            side      the left side, in sun
//   rear3q    rear three-quarter, the shade side            close     a close-up of --close <node> or --close-at
//   menu      the menu's stage close-up: the stage box at its own distance (HomeStage.frame) and field of view
//   chase-near, chase-far   the two chase views (Game.cameraModes offsets, their look-ahead and field of view), still
//   crew      the far crew distance: a crew rider from its far file 40 m ahead of the far chase camera, with a crop
//             enlarged four times (`crew-crop.png`)
//
//   node tools/model-look.mjs --model bike15_crf250 [--rider lucy] [--outfit <id>] [--file <detail.glb>] [--far <far.glb>]
//        [--set paint.roughness=0.6] [--set exposure=1.1] [--views front3q,side] [--close handlebar | --close-at x,y,z,r]
//        [--size 1440x900] [--gpu] [--chrome <path>] --out <dir>
//   node tools/model-look.mjs --model assets/cars/hatchback.glb --out <dir>
//   node tools/model-look.mjs --sheet <dir>=<label>,<dir>=<label>[,...] --out <dir> [--views close] [--crop x,y,w,h --crop-name wheel]
//
// --set names a value of the scene: `<material>.<color|roughness|metalness|envMapIntensity|emissiveIntensity>=<value>`
// on the subject's materials of that name (`*` for all of them; `<map>=none` takes a map away), `exposure=<v>` (tone mapping), `sun=<v>` (the sun's intensity). --file and
// --far draw a candidate file in place of the bike's own (served from where it lies; the repo is not touched).
// --sheet lays the same views of several runs side by side, each column labelled, one sheet per view and one of all.
// Never lets a page reach production. Exit: 0 pictures saved, 1 a step failed, 2 no Chrome.
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { basename, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const BLOCKED_HOSTS = ['cloudfunctions.net', 'firebasedatabase.app', 'firebaseio.com'];
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };
export const VIEWS = ['front3q', 'side', 'rear3q', 'close', 'menu', 'chase-near', 'chase-far', 'crew'];
// The crew rider stands this far ahead of the far chase camera's bike (m)
export const CREW_M = 40;

const argv = process.argv.slice(2);
const option = (name) => { const at = argv.indexOf(`--${name}`); return at >= 0 ? argv[at + 1] : undefined; };
const options = (name) => argv.flatMap((a, i) => (a === `--${name}` ? [argv[i + 1]] : []));

// `--set` pairs as { key: value }, the value a number where it reads as one (a colour stays a string: 0x... or #...)
export function parseSets(list) {
    const out = {};
    for (const item of list) {
        const at = item.indexOf('=');
        if (at < 1) throw new Error(`--set ${item}: write name=value`);
        const key = item.slice(0, at), raw = item.slice(at + 1);
        out[key] = /^(0x|#)/i.test(raw) || Number.isNaN(Number(raw)) ? raw : Number(raw);
    }
    return out;
}

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

// The repo, and the candidate files under /__look/
function startServer(extra) {
    const server = createServer((req, res) => {
        const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
        const file = extra[path] || join(root, path === '/' ? 'index.html' : path);
        if ((!extra[path] && !file.startsWith(root)) || !existsSync(file) || !statSync(file).isFile()) {
            res.writeHead(404).end();
            return;
        }
        res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
        createReadStream(file).pipe(res);
    });
    return new Promise(done => server.listen(0, '127.0.0.1', () => done(server)));
}

// In the page: the stage, the subject, and a function that draws one view into a PNG data URL
async function stage(spec) {
    const g = window.game;
    const wait = (test, ms = 60000) => new Promise((done, fail) => {
        const start = performance.now();
        const tick = () => {
            if (test()) return done();
            if (performance.now() - start > ms) return fail(new Error('timed out'));
            setTimeout(tick, 100);
        };
        tick();
    });
    const level = Quality.LEVELS.findIndex(l => l.id === 'full');
    g.quality.fix(level, performance.now());
    const bikeId = BIKE_MODELS[spec.model] ? spec.model : null;
    const character = bikeId ? CHARACTERS.find(c => c.id === spec.rider) || CHARACTERS.find(c => (c.bikes || []).includes(bikeId)) : CHARACTERS[0];
    if (!character) throw new Error(`no rider ${spec.rider}`);
    if (bikeId && spec.file) BIKE_MODELS[bikeId].file = spec.file;
    if (bikeId && spec.far) BIKE_MODELS[bikeId].far = spec.far;
    g.startRiderShowcase(character.id);
    // The menu's own framing, read while its layout stands, then the menu loop stops and the page shows the canvas alone
    const box = HomeStage.box(document);
    const menu = { box: box ? { x: box.x, y: box.y, w: box.w, h: box.h } : null, frame: HomeStage.frame(box, { w: innerWidth, h: innerHeight }, Game.SHOWCASE_FOV) };
    g.showcaseMode = null;
    await new Promise(done => setTimeout(done, 200));
    const canvas = g.renderer.domElement;
    for (const el of document.body.children) if (el !== canvas && !el.contains(canvas)) el.style.visibility = 'hidden';
    Object.values(g.showcaseBikes || {}).forEach(v => { v.group.visible = false; });
    const spot = g.showcaseSpot.clone();

    let subject, crew = null, places = {};
    if (bikeId) {
        const v = new Vehicle(g.scene, null, character, bikeId, { model: false, outfit: spec.outfit || null });
        v.position.copy(spot);
        v.yawAngle = 0;
        v.updateMesh();
        BikeModels.dress(v);
        await wait(() => v.modelled);
        v.updateMesh();
        subject = v.group;
        // A crew rider on the same bike, from its far file
        const group = new THREE.Group();
        g.scene.add(group);
        const lens = new THREE.MeshStandardMaterial({ color: 0x550000 });
        const fake = { character, model: bikeId, bikeGroup: group, brakeLight: { material: lens }, rearWheel: { rotation: new THREE.Euler() }, frontWheel: { rotation: new THREE.Euler() }, wheelRotation: 0 };
        const dressed = await BikeModels.crew(fake);
        if (!dressed) throw new Error(`the crew rider of ${bikeId} was not dressed from ${BIKE_MODELS[bikeId].far}`);
        group.visible = false;
        crew = group;
    } else {
        const model = await SceneAssets.loadModel(spec.file || spec.model);
        subject = new THREE.Group();
        for (const [name, parts] of model.meshes) {
            const node = new THREE.Group();
            node.name = name;
            node.position.copy(model.places.get(name) || new THREE.Vector3());
            for (const part of parts) {
                const mesh = new THREE.Mesh(part.geometry, part.material);
                mesh.castShadow = mesh.receiveShadow = true;
                node.add(mesh);
            }
            subject.add(node);
        }
        // The file's first level only, where it has levels
        if (model.groups && model.groups.size) {
            const first = [...model.groups.values()][0];
            subject.children.forEach(node => { node.visible = first.meshes.has(node.name); });
        }
        subject.position.copy(spot);
        g.scene.add(subject);
    }
    subject.updateMatrixWorld(true);
    // The named nodes' boxes in the subject's own metres, for --close
    subject.traverse(o => {
        if (!o.name || places[o.name]) return;
        const b = new THREE.Box3().setFromObject(o);
        if (b.isEmpty()) return;
        const c = b.getCenter(new THREE.Vector3()).sub(spot), s = b.getSize(new THREE.Vector3());
        places[o.name] = [c.x, c.y, c.z, Math.max(s.x, s.y, s.z) / 2];
    });

    // The --set values
    const materials = new Map();
    subject.traverse(o => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.set(m.uuid, m)); });
    const unknown = [];
    for (const [key, value] of Object.entries(spec.sets)) {
        if (key === 'exposure') { g.renderer.toneMappingExposure = value; continue; }
        if (key === 'sun') { g.directionalLight.intensity = value; continue; }
        const [name, prop] = key.split('.');
        // (`*` names every material; `none` takes a map away, to find which map a fault comes from)
        const hits = [...materials.values()].filter(m => (name === '*' || m.name === name) && prop in m);
        if (!hits.length) { unknown.push(key); continue; }
        hits.forEach(m => {
            if (value === 'none') m[prop] = null;
            else if (prop === 'color' || prop === 'emissive') m[prop].set(typeof value === 'string' ? value.replace(/^0x/i, '#') : value);
            else m[prop] = value;
            m.needsUpdate = true;
        });
    }
    if (unknown.length) throw new Error(`--set names nothing in the model: ${unknown.join(', ')}`);

    const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
    window.__look = { g, spot, subject, crew, menu, places, white, size: { w: innerWidth, h: innerHeight } };
    return { character: character.id, outfit: spec.outfit || (character.outfits && character.outfits[0] ? character.outfits[0].id : null), places, renderer: (() => {
        const gl = g.renderer.getContext();
        const info = gl.getExtension('WEBGL_debug_renderer_info');
        return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    })() };
}

// In the page: one view as { image, mask } data URLs, and the crop box for the crew
function shoot(view) {
    const { g, spot, subject, crew, menu, places, white } = window.__look;
    const cam = g.camera;
    cam.clearViewOffset();
    const at = (x, y, z) => new THREE.Vector3(spot.x + x, spot.y + y, spot.z + z);
    let eye, look, fov = Game.SHOWCASE_FOV, drawn = subject, crop = null, offset = null;
    subject.visible = true;
    if (crew) crew.visible = false;
    // The menu's own rider comes in when its files arrive: never in these pictures
    Object.values(g.showcaseBikes || {}).forEach(v => { v.group.visible = false; });
    if (view.name === 'front3q') { eye = at(2.6, 1.25, 2.6); look = at(0, 0.7, 0); }
    else if (view.name === 'side') { eye = at(3.8, 0.95, 0); look = at(0, 0.7, 0); }
    else if (view.name === 'rear3q') { eye = at(-2.6, 1.3, -2.6); look = at(0, 0.7, 0); }
    else if (view.name === 'close') {
        const p = view.at || places[view.node];
        if (!p) throw new Error(`no node ${view.node} in the model (it has ${Object.keys(places).join(', ')})`);
        const r = Math.max(0.12, p[3]);
        const d = r / Math.tan((fov * Math.PI) / 360) * 1.25;
        const way = new THREE.Vector3(0.75, 0.35, 0.56).normalize().multiplyScalar(d);
        eye = at(p[0] + way.x, p[1] + way.y, p[2] + way.z);
        look = at(p[0], p[1], p[2]);
    } else if (view.name === 'menu') {
        // As Game.startMenuShowcaseLoop: the orbit at a fixed angle, the box's own distance and view offset
        const r = menu.frame.shown ? menu.frame.distance : 4.2, a = 0.6;
        eye = at(Math.cos(a) * r, 0.9 + r * 0.3, Math.sin(a) * r);
        look = at(0, 0.7, 0);
        if (menu.frame.shown) offset = menu.frame;
        crop = menu.box;
    } else if (view.name === 'chase-near' || view.name === 'chase-far') {
        const mode = g.cameraModes.find(m => m.type === (view.name === 'chase-far' ? 'far' : 'near'));
        const far = mode.type === 'far';
        eye = at(mode.offset.x, mode.offset.y, mode.offset.z);
        look = at(0, far ? 2 : 1, far ? 5 : 3);
        fov = far ? 70 : 75;
    } else if (view.name === 'crew') {
        const mode = g.cameraModes.find(m => m.type === 'far');
        subject.visible = false;
        crew.visible = true;
        crew.position.copy(spot);
        drawn = crew;
        eye = at(mode.offset.x, mode.offset.y, mode.offset.z - CREW_LOOK_M);
        look = at(0, 2, 5 - CREW_LOOK_M);
        fov = 70;
    }
    cam.fov = fov;
    cam.position.copy(eye);
    cam.up.set(0, 1, 0);
    if (offset) cam.setViewOffset(window.__look.size.w, window.__look.size.h, offset.offsetX, offset.offsetY, window.__look.size.w, window.__look.size.h);
    cam.lookAt(look);
    cam.updateProjectionMatrix();
    // The sun and its shadow frustum on the stage, as the menu loop sets them
    g.directionalLight.position.set(spot.x + 30, spot.y + 45, spot.z + 22);
    g.directionalLight.target.position.copy(spot);
    g.directionalLight.target.updateMatrixWorld();
    // Two frames: the first settles what the post chain carries from frame to frame
    g.graphics.update(1 / 60);
    g.graphics.render(g.scene, cam);
    g.graphics.update(1 / 60);
    g.graphics.render(g.scene, cam);
    const image = g.renderer.domElement.toDataURL('image/png');
    // The mask: only the model, flat white, on black, with no post
    const hidden = [];
    g.scene.traverse(o => { if (o.isMesh || o.isPoints || o.isLine || o.isSprite) { if (o.visible && !isIn(o, drawn)) { hidden.push(o); o.visible = false; } } });
    const swapped = [];
    drawn.traverse(o => { if (o.isMesh) { swapped.push([o, o.material]); o.material = white; } });
    const background = g.scene.background, fog = g.scene.fog;
    g.scene.background = new THREE.Color(0x000000);
    g.scene.fog = null;
    const tone = g.renderer.toneMapping;
    g.renderer.toneMapping = THREE.NoToneMapping;
    g.renderer.setRenderTarget(null);
    g.renderer.render(g.scene, cam);
    const mask = g.renderer.domElement.toDataURL('image/png');
    g.renderer.toneMapping = tone;
    g.scene.background = background;
    g.scene.fog = fog;
    swapped.forEach(([o, m]) => { o.material = m; });
    hidden.forEach(o => { o.visible = true; });
    if (view.name === 'crew') {
        // The rider's box on screen, enlarged later
        const box = new THREE.Box3().setFromObject(crew), w = g.renderer.domElement.width, h = g.renderer.domElement.height;
        const xs = [], ys = [];
        for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
            const p = new THREE.Vector3(x, y, z).project(cam);
            xs.push((p.x + 1) / 2 * w);
            ys.push((1 - p.y) / 2 * h);
        }
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
        const half = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 0.9 + 8;
        crop = { x: cx - half, y: cy - half, w: half * 2, h: half * 2, scale: 4 };
    }
    cam.clearViewOffset();
    return { image, mask, crop, ratio: g.renderer.getPixelRatio() };

    function isIn(o, group) {
        for (let p = o; p; p = p.parent) if (p === group) return true;
        return false;
    }
}

// In the page: a crop of a data URL, scaled, as a data URL
async function cropImage(url, box, scale) {
    const image = await new Promise(done => { const i = new Image(); i.onload = () => done(i); i.src = url; });
    const c = document.createElement('canvas');
    c.width = Math.round(box.w * scale);
    c.height = Math.round(box.h * scale);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = scale <= 1;
    ctx.drawImage(image, box.x, box.y, box.w, box.h, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
}

// In the page: a sheet of pictures in columns with a label over each, as a data URL
async function sheetImage(columns, width, crop) {
    const load = src => new Promise(done => { const i = new Image(); i.onload = () => done(i); i.onerror = () => done(null); i.src = src; });
    const cut = (image) => {
        if (!image || !crop) return image;
        const c = document.createElement('canvas');
        c.width = Math.round(crop[2] * image.width);
        c.height = Math.round(crop[3] * image.height);
        c.getContext('2d').drawImage(image, crop[0] * image.width, crop[1] * image.height, c.width, c.height, 0, 0, c.width, c.height);
        return c;
    };
    const images = (await Promise.all(columns.map(c => (c.src ? load(c.src) : null)))).map(cut);
    const head = 34, gap = 8;
    const heights = images.map(i => (i ? Math.round(i.height * width / i.width) : 0));
    const canvas = document.createElement('canvas');
    canvas.width = columns.length * (width + gap) - gap;
    canvas.height = head + Math.max(1, ...heights);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#101216';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = '600 18px sans-serif';
    columns.forEach((c, k) => {
        const x = k * (width + gap);
        ctx.fillStyle = '#e8e8e8';
        ctx.fillText(c.label, x + 6, 23, width - 12);
        if (images[k]) ctx.drawImage(images[k], x, head, width, heights[k]);
        else { ctx.fillStyle = '#7a2020'; ctx.fillText('missing', x + 6, head + 40); }
    });
    return canvas.toDataURL('image/png');
}

const save = (file, url) => writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));

async function browserPage(gpu) {
    const args = gpu ? [] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
    const browser = await puppeteer.launch({ protocolTimeout: 900000, executablePath: chromePath(), headless: 'new', args: ['--no-sandbox', ...args] });
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (request) => {
        const host = new URL(request.url()).hostname;
        if (BLOCKED_HOSTS.some(blocked => host.endsWith(blocked))) request.abort();
        else request.continue();
    });
    return { browser, page };
}

async function sheets() {
    const out = option('out');
    if (!out) throw new Error('name --out');
    mkdirSync(out, { recursive: true });
    const runs = option('sheet').split(',').map((pair) => {
        const at = pair.lastIndexOf('=');
        return at > 0 ? { dir: pair.slice(0, at), label: pair.slice(at + 1) } : { dir: pair, label: basename(pair) };
    });
    const views = [...new Set(runs.flatMap(r => readdirSync(r.dir).filter(n => /\.png$/.test(n) && !/\.mask\.png$|^sheet/.test(n)).map(n => n.replace(/\.png$/, ''))))]
        .sort((a, b) => (VIEWS.indexOf(a) + 1 || 99) - (VIEWS.indexOf(b) + 1 || 99) || a.localeCompare(b));
    const { browser, page } = await browserPage(false);
    const width = Number(option('width') || 720);
    // --crop x,y,w,h (shares of each picture): the same part of every run, for a part a whole picture shows too small
    const crop = option('crop') ? option('crop').split(',').map(Number) : null;
    const only = option('views') ? option('views').split(',') : null;
    const made = [];
    for (const view of views.filter(v => !only || only.includes(v))) {
        const columns = runs.map(r => {
            const file = join(r.dir, `${view}.png`);
            return { label: `${r.label} · ${view}`, src: existsSync(file) ? `data:image/png;base64,${readFileSync(file).toString('base64')}` : null };
        });
        const file = join(out, `sheet-${view}${crop ? `-${option('crop-name') || 'crop'}` : ''}.png`);
        save(file, await page.evaluate(sheetImage, columns, width, crop));
        made.push(file);
    }
    await browser.close();
    console.log(JSON.stringify({ sheets: made }, null, 1));
}

async function look() {
    const out = option('out');
    const model = option('model');
    if (!out || !model) throw new Error('name --model and --out');
    if (resolve(out).startsWith(root + '/')) throw new Error('the pictures go to a cache folder, never the repo');
    mkdirSync(out, { recursive: true });
    const [w, h] = (option('size') || '1440x900').split('x').map(Number);
    const views = (option('views') || VIEWS.join(',')).split(',');
    const bad = views.filter(v => !VIEWS.includes(v));
    if (bad.length) throw new Error(`unknown views: ${bad.join(', ')} (the views: ${VIEWS.join(', ')})`);
    const extra = {};
    const serve = (path, key) => {
        if (!path) return null;
        const file = resolve(path);
        if (!existsSync(file)) throw new Error(`${path} does not exist`);
        extra[`/__look/${key}${extname(file)}`] = file;
        return `__look/${key}${extname(file)}`;
    };
    const generic = /\.glb$/.test(model);
    const spec = {
        model: generic ? null : model,
        rider: option('rider') || null,
        outfit: option('outfit') || null,
        file: generic ? (resolve(model).startsWith(root) ? resolve(model).slice(root.length + 1) : serve(model, 'model')) : serve(option('file'), 'detail'),
        far: serve(option('far'), 'far'),
        sets: parseSets(options('set'))
    };
    const close = option('close-at') ? { at: option('close-at').split(',').map(Number) } : { node: option('close') || 'handlebar' };
    const server = await startServer(extra);
    const port = server.address().port;
    const { browser, page } = await browserPage(argv.includes('--gpu'));
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    try {
        await page.setViewport({ width: w, height: h, deviceScaleFactor: Number(option('scale') || 1) });
        await page.goto(`http://127.0.0.1:${port}/?debug`, { waitUntil: 'load', timeout: 120000 });
        await page.waitForFunction('window.game && window.game.renderer && typeof BikeModels !== "undefined"', { timeout: 120000, polling: 250 });
        await page.evaluate(`window.CREW_LOOK_M = ${CREW_M}`);
        const info = await page.evaluate(stage, spec);
        const shots = {};
        for (const name of views) {
            if (name === 'crew' && generic) continue;
            const view = { name, ...(name === 'close' ? close : {}) };
            const shot = await page.evaluate(shoot, view);
            let { image, mask } = shot;
            if (shot.crop && name === 'menu') {
                const box = { x: shot.crop.x * shot.ratio, y: shot.crop.y * shot.ratio, w: shot.crop.w * shot.ratio, h: shot.crop.h * shot.ratio };
                image = await page.evaluate(cropImage, image, box, 1);
                mask = await page.evaluate(cropImage, mask, box, 1);
            }
            save(join(out, `${name}.png`), image);
            save(join(out, `${name}.mask.png`), mask);
            if (name === 'crew' && shot.crop) save(join(out, 'crew-crop.png'), await page.evaluate(cropImage, image, shot.crop, shot.crop.scale));
            shots[name] = join(out, `${name}.png`);
        }
        const report = { model, ...info, sets: spec.sets, file: spec.file, far: spec.far, size: `${w}x${h}`, mode: argv.includes('--gpu') ? 'gpu' : 'swiftshader', shots, pageErrors: errors };
        writeFileSync(join(out, 'look.json'), JSON.stringify(report, null, 1));
        console.log(JSON.stringify(report, null, 1));
    } finally {
        await browser.close();
        server.close();
    }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    (option('sheet') ? sheets() : look()).catch((error) => {
        console.error(error.stack || String(error));
        process.exit(1);
    });
}
