// 载入真实课本页面图并做成贴图。页面图放在 assets/book/N.jpg
import * as C from './content.js';

export const CW = 1303, CH = 1842;     // 页面图原始像素，所有页面坐标都按这个尺寸写

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

const load = (n) => new Promise((res, rej) => {
  const img = new Image();
  img.onload = () => res(img); img.onerror = () => rej(new Error('缺少页面图 ' + n));
  img.src = `/assets/book/${n}.jpg`;
});

// 把页面图画进贴图，并在靠书脊一侧加一道压暗；side: 'L' 左页（书脊在右）/'R' 右页/null 不加
function pageCanvas(img, side, scale) {
  const w = Math.round(CW * scale), h = Math.round(CH * scale);
  const [c, x] = mk(w, h);
  x.imageSmoothingQuality = 'high';
  x.drawImage(img, 0, 0, w, h);
  if (side) {
    const spineLeft = side === 'R';
    const g = x.createLinearGradient(spineLeft ? 0 : w, 0, spineLeft ? w * 0.15 : w * 0.85, 0);
    g.addColorStop(0, 'rgba(60,52,44,.36)');
    g.addColorStop(0.35, 'rgba(80,72,62,.10)');
    g.addColorStop(1, 'rgba(80,72,62,0)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  }
  return c;
}

export async function buildPages(THREE, maxAniso) {
  const tex = (c) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  };
  const B = C.BOOK;
  const need = [...new Set([B.cover, B.left, B.right, ...B.leafFronts, ...B.leafBacks].filter(Boolean))];
  const imgs = Object.fromEntries(await Promise.all(need.map(async n => [n, await load(n)])));

  const [wc, w] = mk(64, 90); w.fillStyle = '#f7f6f2'; w.fillRect(0, 0, 64, 90);
  const white = tex(wc);

  const left = tex(pageCanvas(imgs[B.left], 'L', 2));
  const right = tex(pageCanvas(imgs[B.right], 'R', 2));
  const fronts = B.leafFronts.map((n, i) => tex(pageCanvas(imgs[n], i === 0 ? null : 'R', 1)));
  const backs = B.leafBacks.map((n, i) => n ? (n === B.left ? left : tex(pageCanvas(imgs[n], 'L', 1))) : white);

  // 纸纹（凹凸）与书口条纹
  const [nc, n] = mk(512, 512); const Rn = rng(9);
  const id = n.createImageData(512, 512);
  for (let i = 0; i < 512 * 512; i++) { const v = 118 + Rn() * 20; id.data.set([v, v, v, 255], i * 4); }
  n.putImageData(id, 0, 0);
  n.globalAlpha = 0.5; n.filter = 'blur(1.2px)'; n.drawImage(nc, 0, 0); n.filter = 'none';
  const bump = new THREE.CanvasTexture(nc);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping; bump.repeat.set(7, 10);

  const [ec, e] = mk(16, 128); const Re = rng(3);
  for (let y = 0; y < 128; y++) { const v = 214 + Re() * 36; e.fillStyle = `rgb(${v},${v - 2},${v - 8})`; e.fillRect(0, y, 16, 1); }
  const edge = tex(ec); edge.wrapS = edge.wrapT = THREE.RepeatWrapping;

  // 叶片贴图
  const [vc, v] = mk(256, 512);
  const lg = v.createLinearGradient(0, 512, 0, 0);
  lg.addColorStop(0, '#3f6b3c'); lg.addColorStop(0.6, '#5f9050'); lg.addColorStop(1, '#8db36a');
  v.fillStyle = lg; v.fillRect(0, 0, 256, 512);
  v.strokeStyle = 'rgba(210,235,190,.55)'; v.lineWidth = 4;
  v.beginPath(); v.moveTo(128, 512); v.lineTo(128, 0); v.stroke();
  v.lineWidth = 2;
  for (let i = 1; i < 8; i++) {
    const y = 512 - i * 58;
    v.beginPath(); v.moveTo(128, y); v.quadraticCurveTo(190, y - 30, 250, y - 90); v.stroke();
    v.beginPath(); v.moveTo(128, y); v.quadraticCurveTo(66, y - 30, 6, y - 90); v.stroke();
  }

  return { left, right, white, fronts, backs, bump, edge, leaf: tex(vc) };
}
