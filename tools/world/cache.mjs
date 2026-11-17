// Data cache for the world importer. Raw swisstopo data never enters the repo:
// the cache directory is resolved here and refused when it sits inside the repo root.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const TLM_NAME = 'swisstlm3d_2026-02_2056_5728.gpkg.zip';
export const TLM_URL = `https://data.geo.admin.ch/ch.swisstopo.swisstlm3d/swisstlm3d_2026-02/${TLM_NAME}`;
export const TLM_BYTES = 4795840706;
const STAC_ALTI = 'https://data.geo.admin.ch/api/stac/v0.9/collections/ch.swisstopo.swissalti3d/items';

function isInside(child, parent) {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

export function resolveCacheDir(env = process.env, repoRoot = REPO_ROOT) {
  const dir = path.resolve(env.TWISTY_WORLD_CACHE || path.join(os.homedir(), 'Library', 'Caches', 'twisty-world'));
  // realpath of the nearest existing ancestor, so a symlink cannot smuggle the cache into the repo
  let probe = dir;
  while (!fs.existsSync(probe)) probe = path.dirname(probe);
  const real = path.join(fs.realpathSync(probe), path.relative(probe, dir));
  if (isInside(real, fs.realpathSync(repoRoot)) || isInside(dir, repoRoot)) {
    throw new Error(`cache directory ${dir} is inside the repo (${repoRoot}); refusing`);
  }
  return dir;
}

async function remoteLength(url) {
  const res = await fetch(url, { method: 'HEAD' });
  if (!res.ok) throw new Error(`HEAD ${url}: ${res.status}`);
  return Number(res.headers.get('content-length'));
}

// Streams url into dest, resuming from the bytes already on disk with a Range request.
export async function downloadResumable(url, dest, expectedBytes, log = () => {}) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const total = expectedBytes ?? await remoteLength(url);
  if (expectedBytes != null) {
    const remote = await remoteLength(url);
    if (remote !== expectedBytes) throw new Error(`${url}: content-length ${remote}, expected ${expectedBytes}`);
  }
  const part = `${dest}.part`;
  if (fs.existsSync(dest) && fs.statSync(dest).size === total) return dest;
  for (let attempt = 0; attempt < 20; attempt++) {
    const have = fs.existsSync(part) ? fs.statSync(part).size : 0;
    if (have === total) break;
    if (have > total) { fs.rmSync(part); continue; }
    try {
      const res = await fetch(url, { headers: have ? { Range: `bytes=${have}-` } : {} });
      if (have && res.status !== 206) { fs.rmSync(part); continue; }
      if (!res.ok) throw new Error(`GET ${url}: ${res.status}`);
      const out = fs.createWriteStream(part, { flags: have ? 'a' : 'w' });
      let written = have, lastLog = Date.now();
      for await (const chunk of res.body) {
        if (!out.write(chunk)) await new Promise(r => out.once('drain', r));
        written += chunk.length;
        if (Date.now() - lastLog > 30000) { log(`${path.basename(dest)} ${(written / 1e6).toFixed(0)}/${(total / 1e6).toFixed(0)} MB`); lastLog = Date.now(); }
      }
      await new Promise((r, j) => out.end(e => (e ? j(e) : r())));
    } catch (err) {
      log(`download interrupted (${err.message}); resuming`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  const size = fs.existsSync(part) ? fs.statSync(part).size : 0;
  if (size !== total) throw new Error(`${dest}: got ${size} bytes, expected ${total}`);
  fs.renameSync(part, dest);
  return dest;
}

export async function ensureTlm(cacheDir = resolveCacheDir(), log = console.error) {
  const dir = path.join(cacheDir, 'tlm');
  const zip = path.join(dir, TLM_NAME);
  await downloadResumable(TLM_URL, zip, TLM_BYTES, log);
  const marker = path.join(dir, '.unzipped');
  if (!fs.existsSync(marker)) {
    log('unzipping');
    // ditto fails on this archive (no pkzip signature at the offset it expects); unzip reads it
    const r = spawnSync('unzip', ['-o', '-q', zip, '-d', dir], { stdio: 'inherit' });
    if (r.status !== 0) throw new Error('unzip failed');
    fs.writeFileSync(marker, new Date().toISOString());
  }
  return findGpkg(dir);
}

export function findGpkg(dir) {
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.name.endsWith('.gpkg')) return p;
    }
  }
  throw new Error(`no .gpkg under ${dir}`);
}

// Walks the swissALTI3D STAC items for an LV95-derived WGS84 bbox [w,s,e,n], following rel=next.
export async function listAlti3dTiles(bboxWgs84, fetchJson = async u => (await fetch(u)).json()) {
  let url = `${STAC_ALTI}?bbox=${bboxWgs84.join(',')}&limit=100`;
  const best = new Map();
  while (url) {
    const page = await fetchJson(url);
    for (const f of page.features) {
      const [, year, key] = f.id.match(/^swissalti3d_(\d{4})_(\d+-\d+)$/) ?? [];
      if (!key) continue;
      const asset = Object.entries(f.assets).find(([n]) => /_2_2056_5728\.tif$/.test(n));
      if (!asset) continue;
      const prev = best.get(key);
      if (!prev || Number(year) > prev.year) best.set(key, { key, year: Number(year), name: asset[0], href: asset[1].href });
    }
    url = page.links.find(l => l.rel === 'next')?.href ?? null;
  }
  return [...best.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
}

export async function ensureAlti3d(bboxWgs84, cacheDir = resolveCacheDir(), log = console.error) {
  const dir = path.join(cacheDir, 'alti3d', '2m');
  const tiles = await listAlti3dTiles(bboxWgs84);
  for (const t of tiles) {
    const dest = path.join(dir, t.name);
    if (fs.existsSync(dest)) continue;
    await downloadResumable(t.href, dest, undefined, log);
  }
  return tiles.map(t => path.join(dir, t.name));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === 'tlm') console.log(await ensureTlm());
  else if (cmd === 'alti3d' && args.length === 4) console.log((await ensureAlti3d(args.map(Number))).join('\n'));
  else { console.error('usage: cache.mjs tlm | alti3d <west> <south> <east> <north>'); process.exit(2); }
}
