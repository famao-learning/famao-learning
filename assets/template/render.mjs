// 用法（默认 3:4 竖版；加 --fmt 169 出 16:9 横版）：
//   node render.mjs --stills 0,1.5,4,8        抽几张定格图到 out/stills/（--dir 换目录）
//   node render.mjs --video out/master.mp4    渲染整片
//   QS=sf=Xingkai%20SC node render.mjs ...    临时换字幕字体等页面参数
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const FPS = 30;
const FMT = opt('--fmt') || '34';                 // 34 = 3:4 竖版 1080×1440（默认，发抖音用）；169 = 16:9 横版 1920×1080
const [VW, VH] = FMT === '169' ? [1920, 1080] : [1080, 1440];
const SDIR = opt('--dir') || 'out/stills';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = path.normalize(path.join(ROOT, decodeURIComponent(req.url.split('?')[0])));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--hide-scrollbars', '--force-device-scale-factor=1'],
  defaultViewport: { width: VW, height: VH, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}/src/index.html?still=1${FMT === '169' ? '' : '&fmt=34'}${process.env.QS ? '&' + process.env.QS : ''}`);
await page.waitForFunction('window.READY === true', { timeout: 60000 });
const total = await page.evaluate('window.TOTAL_FRAMES');

const shot = async (frame, type) => {
  await page.evaluate((f) => window.renderFrame(f), frame);
  return page.screenshot({ type, quality: type === 'jpeg' ? 96 : undefined, clip: { x: 0, y: 0, width: VW, height: VH } });
};

if (opt('--stills')) {
  const dir = path.join(ROOT, SDIR); fs.mkdirSync(dir, { recursive: true });
  for (const s of opt('--stills').split(',')) {
    const buf = await shot(Math.round(parseFloat(s) * FPS), 'jpeg');
    fs.writeFileSync(path.join(dir, `t${parseFloat(s).toFixed(2).padStart(5, '0')}.jpg`), buf);
  }
  console.log('stills done');
} else {
  const out = path.resolve(ROOT, opt('--video') || 'out/master.mp4');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let f = 0; f < total; f++) {
    const buf = await shot(f, 'png');
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (f % 60 === 0) console.log(`frame ${f}/${total}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  console.log('video done', out);
}
await browser.close(); server.close();
