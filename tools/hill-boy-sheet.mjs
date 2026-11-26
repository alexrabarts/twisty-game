// The hill ride's boy beside the owner's reference stills, on this machine only: for each still that
// tools/hill-boy-look.js drew a moment of (its said.stills, saved beside its pictures as stills.json), a sheet of
// the still and the game side by side, the same height, and under them the boy's own part of each, enlarged; with the
// mean colour of each boy's box. The stills are private: they are read from --stills and never copied, and the sheets
// go to --out (a cache folder, never the repo).
//   node tools/hill-boy-sheet.mjs --stills <dir> --shots <dir with stills.json and the look's pictures> --out <dir> [--tag r1]
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer from 'puppeteer';

const option = (name) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : null; };
const stills = option('stills'), shots = option('shots'), out = option('out'), tag = option('tag') || 'sheet';
if (!stills || !shots || !out) throw new Error('name --stills, --shots and --out');
if (/twisty-long|worktrees/.test(out) && !/Caches/.test(out)) throw new Error('the sheets go to a cache folder, never the repo');
mkdirSync(out, { recursive: true });
// The video's area of each still's picture (shares of the whole picture)
const VIDEO = [0.1133, 0.0531, 0.8867, 0.9456];
const names = readdirSync(stills).filter(n => /\.png$/i.test(n)).sort();
const list = JSON.parse(readFileSync(join(shots, 'stills.json'), 'utf8'));
const browser = await puppeteer.launch({ headless: 'new', executablePath: process.env.TWISTY_CHROME || undefined });
const page = await browser.newPage();
const report = [];
for (const item of list) {
    const still = `data:image/png;base64,${readFileSync(join(stills, names[item.still])).toString('base64')}`;
    const game = `data:image/png;base64,${readFileSync(join(shots, `${item.name}.png`)).toString('base64')}`;
    const result = await page.evaluate(async (still, game, video, sb, gb) => {
        const load = (src) => new Promise(resolve => { const image = new Image(); image.onload = () => resolve(image); image.src = src; });
        const source = await load(still), shot = await load(game);
        const vx = video[0] * source.width, vy = video[1] * source.height, vw = (video[2] - video[0]) * source.width, vh = (video[3] - video[1]) * source.height;
        const H = 480, BH = 560, W1 = Math.round(vw * H / vh), W2 = Math.round(shot.width * H / shot.height);
        const canvas = document.createElement('canvas');
        canvas.width = W1 + W2 + 8;
        canvas.height = H + 8 + BH;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(source, vx, vy, vw, vh, 0, 0, W1, H);
        ctx.drawImage(shot, 0, 0, shot.width, shot.height, W1 + 8, 0, W2, H);
        const crop = (image, sx, sy, sw, sh, at) => {
            const w = Math.round(sw * BH / sh);
            ctx.drawImage(image, sx, sy, sw, sh, at, H + 8, w, BH);
            return w;
        };
        const w1 = crop(source, vx + sb[0] * vw, vy + sb[1] * vh, (sb[2] - sb[0]) * vw, (sb[3] - sb[1]) * vh, 0);
        crop(shot, gb[0] * shot.width, gb[1] * shot.height, (gb[2] - gb[0]) * shot.width, (gb[3] - gb[1]) * shot.height, w1 + 8);
        const mean = (x, y, w, h) => {
            const d = ctx.getImageData(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))).data, sum = [0, 0, 0];
            for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) sum[c] += d[i + c];
            return sum.map(k => Math.round(k / (d.length / 4)));
        };
        const means = { still: mean(sb[0] * W1, sb[1] * H, (sb[2] - sb[0]) * W1, (sb[3] - sb[1]) * H), game: mean(W1 + 8 + gb[0] * W2, gb[1] * H, (gb[2] - gb[0]) * W2, (gb[3] - gb[1]) * H) };
        ctx.strokeStyle = 'rgba(255, 220, 0, 0.8)';
        ctx.lineWidth = 2;
        ctx.strokeRect(sb[0] * W1, sb[1] * H, (sb[2] - sb[0]) * W1, (sb[3] - sb[1]) * H);
        ctx.strokeRect(W1 + 8 + gb[0] * W2, gb[1] * H, (gb[2] - gb[0]) * W2, (gb[3] - gb[1]) * H);
        return { png: canvas.toDataURL('image/png'), means };
    }, still, game, VIDEO, item.stillBox, item.gameBox);
    const file = join(out, `${tag}-${item.name}.png`);
    writeFileSync(file, Buffer.from(result.png.split(',')[1], 'base64'));
    report.push({ file, boyStill: result.means.still, boyGame: result.means.game });
}
await browser.close();
console.log(JSON.stringify(report, null, 1));
