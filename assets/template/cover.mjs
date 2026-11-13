// 封面底图：node cover.mjs <秒> <x0,y0,x1,y1> <渲染宽> <渲染高> <输出.png>
// 取景框用成片 1920×1080 画面坐标，可以超出画面（负数 = 往上多看天空）
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const [t, rect, cw, ch, out] = process.argv.slice(2);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = path.normalize(path.join(ROOT, decodeURIComponent(req.url.split('?')[0])));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--hide-scrollbars', '--force-device-scale-factor=1'],
  defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
page.on('pageerror', e => console.log('[pageerror]', e.message));
if (t === 'compose') {            // node cover.mjs compose <html相对路径?参数> <宽> <高> <输出.jpg>
  await page.setViewport({ width: +cw, height: +ch, deviceScaleFactor: 1 });
  await page.goto(`${base}/${rect}`); await page.evaluate(() => document.fonts.ready);
  await new Promise(r => setTimeout(r, 400));
  fs.writeFileSync(out, await page.screenshot({ type: out.endsWith('.png') ? 'png' : 'jpeg', ...(out.endsWith('.png') ? {} : { quality: 95 }) }));
} else {
  await page.goto(`${base}/src/index.html?still=1&cw=${cw}&ch=${ch}&cover=${rect}`);
  await page.waitForFunction('window.READY === true', { timeout: 60000 });
  const url = await page.evaluate((f) => { window.renderFrame(f); return document.getElementById('c').toDataURL('image/png'); }, Math.round(parseFloat(t) * 30));
  fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
}
console.log('done', out);
await browser.close(); server.close();
