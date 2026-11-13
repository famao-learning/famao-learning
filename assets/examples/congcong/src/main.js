import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import * as C from './content.js';
import { VO } from './vo.js';
import { buildPages, rng, CW, CH } from './pages.js';

const W = 1920, H = 1080;
const PW = 1, PH = 1.414, TH = 0.045;       // 单页宽、高、书芯厚
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const easeIO = (x) => { x = clamp01(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const easeOutCubic = (x) => 1 - Math.pow(1 - clamp01(x), 3);
const easeOutBack = (x) => { x = clamp01(x); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const ramp = (t, a, b) => clamp01((t - a) / (b - a));

// ------------------------------------------------------------------ 渲染器
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H, false);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.12;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x04060a);
scene.fog = new THREE.Fog(0x04060a, 5, 13);
const camera = new THREE.PerspectiveCamera(32, W / H, 0.1, 30);

const P = await buildPages(THREE, renderer.capabilities.getMaxAnisotropy());
const BK = C.BOOK;

// ------------------------------------------------------------------ 灯光
const key = new THREE.SpotLight(0xfff3e2, 2.7, 0, 0.62, 1, 0);
key.position.set(2.0, 3.2, 1.15); key.target.position.set(0.1, 0, 0.05);
key.castShadow = true; key.shadow.mapSize.set(4096, 4096);
key.shadow.camera.near = 1.5; key.shadow.camera.far = 9; key.shadow.bias = -0.00025; key.shadow.normalBias = 0.004;
scene.add(key, key.target);
const hemi = new THREE.HemisphereLight(0xfbf8f2, 0x4a4640, 1.05); scene.add(hemi);
const rim = new THREE.DirectionalLight(0xfff6ee, 0.7); rim.position.set(-0.6, 1.4, 2.6); scene.add(rim);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40),
  new THREE.MeshStandardMaterial({ color: 0x0b0e15, roughness: 0.95 }));
ground.rotation.x = -Math.PI / 2; ground.position.y = -0.014; ground.receiveShadow = true; scene.add(ground);

// ------------------------------------------------------------------ 书
const pageH = (u, d) => TH * (1 - 0.72 * d * Math.exp(-u / 0.065)) + 0.004 * d * Math.sin(Math.PI * u);
let DIP = 0;
const NX = 56;
const paperMat = (map) => new THREE.MeshStandardMaterial({ map, roughness: 0.93, bumpMap: P.bump, bumpScale: 0.5 });
const edgeMat = new THREE.MeshStandardMaterial({ map: P.edge, roughness: 0.9, side: THREE.DoubleSide });
const coverMat = new THREE.MeshStandardMaterial({ color: 0xa88b6b, roughness: 0.7 });

function makeBlock(side, map) {
  const g = new THREE.Group();
  const top = new THREE.BufferGeometry();
  const pos = new Float32Array((NX + 1) * 2 * 3), uv = new Float32Array((NX + 1) * 2 * 2), idx = [];
  for (let i = 0; i <= NX; i++) {
    const s = i / NX;
    uv.set([s, 1, s, 0], i * 4);
    if (i < NX) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
  }
  top.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  top.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  top.setIndex(idx);
  const topMesh = new THREE.Mesh(top, paperMat(map)); topMesh.receiveShadow = true; topMesh.castShadow = true;

  const wall = new THREE.BufferGeometry();
  const nW = (NX + 1) * 4 + 4;
  const wpos = new Float32Array(nW * 3), wuv = new Float32Array(nW * 2), widx = [];
  for (let i = 0; i < NX; i++) {
    const f = i * 4;      // 每列 4 顶点：前下 前上 后下 后上
    widx.push(f, f + 4, f + 1, f + 1, f + 4, f + 5, f + 2, f + 3, f + 6, f + 6, f + 3, f + 7);
  }
  const o = (NX + 1) * 4; widx.push(o, o + 1, o + 2, o + 2, o + 1, o + 3);
  wall.setAttribute('position', new THREE.BufferAttribute(wpos, 3));
  wall.setAttribute('uv', new THREE.BufferAttribute(wuv, 2));
  wall.setIndex(widx);
  const wallMesh = new THREE.Mesh(wall, edgeMat); wallMesh.castShadow = true; wallMesh.receiveShadow = true;

  const board = new THREE.Mesh(new THREE.BoxGeometry(PW + 0.022, 0.012, PH + 0.05), coverMat);
  board.position.set(side * (PW + 0.022) / 2, -0.007, 0); board.castShadow = true; board.receiveShadow = true;
  g.add(topMesh, wallMesh, board);

  g.userData.update = (d) => {
    for (let i = 0; i <= NX; i++) {
      const s = i / NX, x = side > 0 ? s : s - 1, u = side > 0 ? s : 1 - s, y = pageH(u, d);
      pos.set([x, y, -PH / 2, x, y, PH / 2], i * 6);
      wpos.set([x, 0, PH / 2, x, y, PH / 2, x, 0, -PH / 2, x, y, -PH / 2], i * 12);
      wuv.set([s * 3, 0, s * 3, y * 60, s * 3, 0, s * 3, y * 60], i * 8);
    }
    const yo = pageH(1, d);
    wpos.set([side, 0, -PH / 2, side, yo, -PH / 2, side, 0, PH / 2, side, yo, PH / 2], o * 3);
    wuv.set([0, 0, 0, yo * 60, 4, 0, 4, yo * 60], o * 2);
    top.attributes.position.needsUpdate = true; wall.attributes.position.needsUpdate = true; wall.attributes.uv.needsUpdate = true;
    top.computeVertexNormals(); wall.computeVertexNormals();
  };
  g.userData.update(0);
  scene.add(g);
  return g;
}
const blockR = makeBlock(1, P.right), blockL = makeBlock(-1, P.left);

// 翻动的书页
const NL = 6, FLIP0 = 0.5, FLIP_GAP = 0.15, FLIP_DUR = 0.46;
const FLIP_END = FLIP0 + (NL - 1) * FLIP_GAP + FLIP_DUR;
const leaves = [];
for (let i = 0; i < NL; i++) {
  const n = 28, geo = new THREE.BufferGeometry();
  const pos = new Float32Array((n + 1) * 2 * 3), uvF = new Float32Array((n + 1) * 4), uvB = new Float32Array((n + 1) * 4), idx = [];
  for (let k = 0; k <= n; k++) {
    const r = k / n;
    uvF.set([r, 1, r, 0], k * 4); uvB.set([1 - r, 1, 1 - r, 0], k * 4);
    if (k < n) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvF, 2));
  geo.setIndex(idx);
  const geoB = geo.clone(); geoB.setAttribute('position', geo.attributes.position);
  geoB.setAttribute('uv', new THREE.BufferAttribute(uvB, 2));
  const fm = new THREE.MeshStandardMaterial({ map: P.fronts[i], roughness: i === 0 ? 0.62 : 0.93 });
  const bm = new THREE.MeshStandardMaterial({ map: P.backs[i], roughness: 0.93, side: THREE.BackSide });
  const front = new THREE.Mesh(geo, fm), back = new THREE.Mesh(geoB, bm);
  front.castShadow = back.castShadow = true; front.receiveShadow = back.receiveShadow = true;
  const grp = new THREE.Group(); grp.add(front, back); scene.add(grp);
  leaves.push({ grp, geo, geoB, pos, n, i });
}
function setLeaf(L, t) {
  const k = ramp(t, FLIP0 + L.i * FLIP_GAP, FLIP0 + L.i * FLIP_GAP + FLIP_DUR);
  const th = easeIO(k) * Math.PI;
  const y0 = TH + lerp(0.0016 * (NL - L.i), 0.0016 * (L.i + 1), k);
  for (let j = 0; j <= L.n; j++) {
    const r = j / L.n;
    const phi = Math.max(0, th - 0.95 * Math.sin(th) * r * r);
    const x = r * Math.cos(phi), y = y0 + r * Math.sin(phi);
    L.pos.set([x, y, -PH / 2, x, y, PH / 2], j * 6);
  }
  L.geo.attributes.position.needsUpdate = true;
  L.geo.computeVertexNormals();
  L.geoB.setAttribute('normal', L.geo.attributes.normal);
}

// ------------------------------------------------------------------ 页面坐标 → 世界坐标
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const Y = V(0, 1, 0);
const toW = (side, px, py, lift = 0) => {
  const x = side > 0 ? px / CW : px / CW - 1;
  return V(x, pageH(Math.abs(x), 1) + lift, (py / CH - 0.5) * PH);
};
const MK = VO.marks;

// ------------------------------------------------------------------ 荧光笔
const hlMat = (seed) => new THREE.ShaderMaterial({
  uniforms: { uP: { value: 0 }, uSeed: { value: seed }, uAspect: { value: 10 } },
  transparent: true, depthWrite: false,
  blending: THREE.CustomBlending, blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor,
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `
    varying vec2 vUv; uniform float uP, uSeed, uAspect;
    float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))+uSeed*17.3)*43758.5453); }
    float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
      return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
    void main(){
      vec2 q = vec2(vUv.x*uAspect, vUv.y);
      float wob = n(q*vec2(1.6,1.)+3.)*.5 + n(q*vec2(5.,2.))*.25;
      float top = smoothstep(.0,.10, vUv.y - .02 - wob*.10);
      float bot = smoothstep(.0,.10, 1.-vUv.y - .02 - n(q*vec2(1.9,1.)+9.)*.10);
      float head = uP*(1.+.04) - .02;
      float tip = smoothstep(head, head-.012-.01*n(vec2(vUv.y*6., uSeed)), vUv.x);
      float start = smoothstep(.0, .012, vUv.x - .004*n(vec2(vUv.y*8., 4.)));
      float streak = .88 + .12*n(vec2(q.x*.7, vUv.y*9.));
      float a = top*bot*tip*start*streak;
      gl_FragColor = vec4(mix(vec3(1.), vec3(1., .80, .20), a*.95), 1.);
    }`,
});

const hlGroups = [];
C.HL.forEach((G, gi) => {
  const side = G.side === 'L' ? -1 : 1, total = G.lines.reduce((s, l) => s + l[3], 0); let acc = 0;
  const lines = G.lines.map(([x0, x1, y, n], i) => {
    const a = toW(side, x0 - 5, y), b = toW(side, x1 + 5, y);
    const len = b.x - a.x, hz = BK.lineHeight / CH * PH;
    const g = new THREE.PlaneGeometry(len, hz, 24, 1); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) p.setY(k, pageH(Math.abs(a.x + len / 2 + p.getX(k)), 1) + 0.0012);
    const m = hlMat(gi * 5 + i + 1); m.uniforms.uAspect.value = len / hz;
    const mesh = new THREE.Mesh(g, m); mesh.position.set(a.x + len / 2, 0, a.z); mesh.renderOrder = 5; scene.add(mesh);
    const L = { mesh, from: acc / total, to: (acc + n) / total }; acc += n; return L;
  });
  hlGroups.push({ times: VO.groups[G.id], lines });
});

// ------------------------------------------------------------------ 小工具
const M = new THREE.Matrix4(), S = new THREE.Vector3(), Q = new THREE.Quaternion(), Q2 = new THREE.Quaternion(), Pv = new THREE.Vector3(), Pw = new THREE.Vector3();
const restY = (x, z) => (Math.abs(x) <= 1 && Math.abs(z) <= PH / 2) ? pageH(Math.abs(x), 1) + 0.003 : 0.002;
const FLAT = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -Math.PI / 2);

// ------------------------------------------------------------------ 垂柳（按课本插图画风生成的柳枝贴图，做成会摆动的飘带）
const Rw = rng(77);
const texLoad = async (url) => { const t = await new THREE.TextureLoader().loadAsync(url); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t; };
const willowTex = await texLoad('/assets/willow.png');
const W_COLS = [[43, 165], [243, 350], [435, 563], [640, 763], [830, 974]], W_IMG = [1024, 1536];
const W_TOP = 2.2, W_T0 = MK.yanzi - 0.4, NSEG = 26;
const willowMat = new THREE.MeshStandardMaterial({ map: willowTex, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.8,
  emissive: 0xffffff, emissiveMap: willowTex, emissiveIntensity: 0.38 });
const willowDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: willowTex, alphaTest: 0.3, side: THREE.DoubleSide });
const strands = [];
function addStrand(x, z, len, yaw) {
  const [c0, c1] = W_COLS[Math.floor(Rw() * W_COLS.length)], pad = 14;
  const u0 = (c0 - pad) / W_IMG[0], u1 = (c1 + pad) / W_IMG[0], flip = Rw() < 0.5;
  const w = len * ((c1 - c0 + 2 * pad) / W_IMG[1]);
  const g = new THREE.PlaneGeometry(w, len, 1, NSEG); const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) { const u = uv.getX(i); uv.setX(i, flip ? lerp(u1, u0, u) : lerp(u0, u1, u)); }
  const m = new THREE.Mesh(g, willowMat); m.customDepthMaterial = willowDepth; m.castShadow = true; m.frustumCulled = false; scene.add(m);
  strands.push({ m, g, x, z, len, w, yaw, ph: Rw() * 6.28, ph2: Rw() * 6.28, delay: Rw() * 1.6, amp: 0.7 + Rw() * 0.6 });
}
// 后排：垂在书页上沿一带（对应页面顶部的柳枝插图）
for (let i = 0; i < 22; i++) addStrand(-1.45 + 2.9 * (i + Rw() * 0.9) / 22, -1.02 + Rw() * 0.42, 1.7 + Rw() * 0.42, (Rw() - 0.5) * 0.9);
// 中排：探到书页上方
for (let i = 0; i < 16; i++) addStrand(-1.25 + 2.5 * (i + Rw() * 0.9) / 16, -0.76 + Rw() * 0.2, 1.9 + Rw() * 0.26, (Rw() - 0.5) * 0.9);
// 前景：两侧靠近镜头的几条，虚化后增加层次
for (const [x, z, len] of [[-1.42, 0.25, 1.35], [-1.28, 0.62, 1.2], [1.36, 0.3, 1.3], [1.5, 0.7, 1.15], [1.16, -0.1, 1.2]]) addStrand(x, z, len, (Rw() - 0.5) * 0.6);
function strandOff(s, u, t, out) {
  const sw = s.amp * (0.06 * Math.pow(u, 1.5) * Math.sin(t * 0.9 + s.ph + u * 2.2) + 0.022 * u * Math.sin(t * 1.7 + s.ph2 + u * 4));
  return out.set(sw + 0.1 * u * u, 0, s.amp * 0.035 * Math.pow(u, 1.5) * Math.cos(t * 0.8 + s.ph));   // 0.1*u*u：像插图那样被风吹斜
}
function updateWillow(t) {
  for (const s of strands) {
    const g = easeOutCubic(ramp(t, W_T0 + s.delay, W_T0 + s.delay + 2.4)), top = W_TOP + (s.len + 0.5) * (1 - g);
    const p = s.g.attributes.position, c = Math.cos(s.yaw), sn = Math.sin(s.yaw);
    for (let r = 0; r <= NSEG; r++) {
      const u = r / NSEG; strandOff(s, u, t, Pv);
      for (let k = 0; k < 2; k++) {
        const h = (k - 0.5) * s.w;
        p.setXYZ(r * 2 + k, s.x + Pv.x + h * c, top - u * s.len, s.z + Pv.z + h * sn);
      }
    }
    p.needsUpdate = true; s.g.computeVertexNormals();
  }
}
const wLeafGeo = (() => {
  const sh = new THREE.Shape(); sh.moveTo(0, 0);
  sh.bezierCurveTo(0.11, 0.25, 0.09, 0.7, 0, 1); sh.bezierCurveTo(-0.09, 0.7, -0.11, 0.25, 0, 0);
  const g = new THREE.ShapeGeometry(sh, 8); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, 0.9 * p.getX(i) * p.getX(i) + 0.08 * Math.sin(p.getY(i) * 3.14));
  g.computeVertexNormals(); return g;
})();
const wLeafMat = new THREE.MeshStandardMaterial({ roughness: 0.6, side: THREE.DoubleSide, emissive: 0x2c4a12, emissiveIntensity: 0.35 });

// ------------------------------------------------------------------ 桃枝
const Rp = rng(515);
const barkMat = new THREE.MeshStandardMaterial({ color: 0x4a2f25, roughness: 0.85 });
const branchStems = [], blossoms = [];
const BR_T0 = 2.3, BR_T1 = 5.6;
function addBranch(pts, radius, delay, span, nBloom, bloomFrom) {
  nBloom = Math.round(nBloom * 1.7);
  const curve = new THREE.CatmullRomCurve3(pts);
  const g = new THREE.TubeGeometry(curve, 40, radius, 6, false);
  const m = new THREE.Mesh(g, barkMat); m.castShadow = true; scene.add(m);
  branchStems.push({ g, count: g.index.count, delay, span });
  for (let i = 0; i < nBloom; i++) {
    const u = bloomFrom + (1 - bloomFrom) * (i + Rp()) / nBloom;
    const p = curve.getPoint(Math.min(1, u)), tan = curve.getTangent(Math.min(1, u));
    const up = V(Rp() - 0.5, 0.5 + Rp() * 0.8, Rp() - 0.2).normalize();
    const nrm = up.clone().addScaledVector(tan, -up.dot(tan) * 0.7).normalize();
    p.addScaledVector(nrm, radius + 0.008);
    blossoms.push({ p, q: new THREE.Quaternion().setFromUnitVectors(Y, nrm).multiply(new THREE.Quaternion().setFromAxisAngle(Y, Rp() * 6.28)),
      sc: 0.021 + Rp() * 0.012, birth: delay + span * u + 0.06 + Rp() * 0.05, bud: Rp() < 0.22,
      col: new THREE.Color().setHSL(0.955 + Rp() * 0.03, 0.62 + Rp() * 0.2, 0.8 + Rp() * 0.1) });
  }
  return curve;
}
const LY = (p) => { p.y = 0.1 + (p.y - 0.36) * 0.6; p.z -= 0.06; return p; };
const mainBr = addBranch([V(-2.1, 0.36, -0.66), V(-1.6, 0.47, -0.6), V(-1.15, 0.45, -0.5), V(-0.8, 0.5, -0.47), V(-0.5, 0.45, -0.52)].map(LY), 0.011, 0, 0.62, 16, 0.3);
const twig = (u, a, b, delay, n) => addBranch([mainBr.getPoint(u), LY(a), LY(b)], 0.006, delay, 0.3, n, 0.25);
twig(0.42, V(-1.22, 0.6, -0.7), V(-0.98, 0.7, -0.8), 0.3, 7);
twig(0.58, V(-0.95, 0.4, -0.34), V(-0.74, 0.34, -0.22), 0.4, 8);
twig(0.78, V(-0.66, 0.62, -0.62), V(-0.44, 0.7, -0.7), 0.52, 7);
twig(0.92, V(-0.44, 0.38, -0.4), V(-0.27, 0.35, -0.3), 0.6, 6);
function flowerGeo(np, wd, cup) {
  const pos = [], idx = []; const rows = 5;
  for (let p = 0; p < np; p++) {
    const a = p * Math.PI * 2 / np, ca = Math.cos(a), sa = Math.sin(a), base = pos.length / 3;
    for (let k = 0; k <= rows; k++) {
      const r = 0.08 + 0.92 * k / rows, q = k / rows;
      const w = wd * Math.pow(Math.sin(Math.PI * Math.pow(q, 0.75) * 0.9 + 0.1), 0.7) + 0.015, y = cup * r * r;
      for (const [lx, ly] of [[-w, y + 0.08 * w], [0, y - 0.03], [w, y + 0.08 * w]]) pos.push(lx * ca + r * sa, ly, -lx * sa + r * ca);
      if (k < rows) { const o = base + k * 3; idx.push(o, o + 3, o + 1, o + 1, o + 3, o + 4, o + 1, o + 4, o + 2, o + 2, o + 4, o + 5); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
const petalMat = new THREE.MeshStandardMaterial({ roughness: 0.6, side: THREE.DoubleSide, emissive: 0x8a4a5c, emissiveIntensity: 0.3 });
const bloomMesh = new THREE.InstancedMesh(flowerGeo(5, 0.36, 0.55), petalMat, blossoms.length);
const coreGeo = new THREE.IcosahedronGeometry(1, 1);
const coreMesh = new THREE.InstancedMesh(coreGeo, new THREE.MeshStandardMaterial({ roughness: 0.5, emissive: 0x7a2a45, emissiveIntensity: 0.3 }), blossoms.length);
blossoms.forEach((b, i) => { bloomMesh.setColorAt(i, b.col); coreMesh.setColorAt(i, new THREE.Color().setHSL(0.96, 0.7, b.bud ? 0.66 : 0.5)); });
for (const m of [bloomMesh, coreMesh]) { m.castShadow = true; m.frustumCulled = false; scene.add(m); }

// ------------------------------------------------------------------ 落花与落叶
const petalGeo = (() => {
  const sh = new THREE.Shape(); sh.moveTo(0, -0.5);
  sh.bezierCurveTo(0.55, -0.4, 0.5, 0.35, 0, 0.5); sh.bezierCurveTo(-0.5, 0.35, -0.55, -0.4, 0, -0.5);
  const g = new THREE.ShapeGeometry(sh, 8); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, 0.5 * p.getX(i) * p.getX(i) + 0.25 * p.getY(i) * p.getY(i));
  g.computeVertexNormals(); return g;
})();
function makeFallers(n, R, geo, mat, init) {
  const list = [];
  for (let i = 0; i < n; i++) {
    const f = init(i, R);
    f.ph = R() * 6.28; f.ph2 = R() * 6.28; f.sp = 0.7 + R() * 0.8; f.dur = f.dur || 2.4 + R() * 1.6;
    f.ax = V(R() - 0.5, R() - 0.5, R() - 0.5).normalize();
    f.qr = FLAT.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), R() * 6.28))
      .multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), (R() - 0.5) * 0.25));
    f.to.y = restY(f.to.x, f.to.z) + R() * 0.002;
    list.push(f);
  }
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  list.forEach((f, i) => mesh.setColorAt(i, f.col));
  mesh.frustumCulled = false; mesh.castShadow = true; scene.add(mesh);
  return { list, mesh };
}
function updateFallers(F, t) {
  F.list.forEach((f, i) => {
    const tau = t - f.birth;
    if (tau <= 0) { S.setScalar(1e-5); M.compose(f.from, Q.identity(), S); F.mesh.setMatrixAt(i, M); return; }
    const k = clamp01(tau / f.dur), air = 1 - smooth(ramp(k, 0.8, 1));
    Pv.lerpVectors(f.from, f.to, lerp(k, smooth(k), 0.4));
    Pv.y = lerp(f.from.y, f.to.y, Math.pow(k, 1.25));
    Pv.x += air * 0.06 * Math.sin(tau * f.sp * 2.2 + f.ph) * Math.min(1, tau);
    Pv.z += air * 0.05 * Math.cos(tau * f.sp * 1.9 + f.ph2) * Math.min(1, tau);
    Q.setFromAxisAngle(f.ax, f.ph + tau * f.sp * 3.0); Q.slerp(f.qr, smooth(ramp(k, 0.78, 1)));
    S.setScalar(f.sc * smooth(tau / 0.35) * (f.fade ? 1 - smooth(ramp(t, f.fade, f.fade + 1.5)) : 1) + 1e-5); M.compose(Pv, Q, S); F.mesh.setMatrixAt(i, M);
  });
  F.mesh.instanceMatrix.needsUpdate = true;
}
const petals = makeFallers(170, rng(909), petalGeo, petalMat, (i, R) => {
  const b = blossoms[Math.floor(R() * blossoms.length)], wide = R() < 0.16, early = R() < 0.14;
  return { from: b.p.clone().add(V(0, -0.01, 0)), sc: 0.02 + R() * 0.012,
    birth: early ? 5.8 + R() * 4 : MK.taohua - 0.2 + Math.pow(R(), 1.3) * 4.6,
    to: wide ? V(-1.0 + R() * 1.9, 0, -0.69 + R() * 0.3) : V(-0.9 + R() * 0.9, 0, -0.69 + R() * 0.32),
    col: new THREE.Color().setHSL(0.955 + R() * 0.03, 0.6 + R() * 0.25, 0.8 + R() * 0.1) };
});
const deadLeaves = makeFallers(46, rng(313), wLeafGeo, wLeafMat, (i, R) => {
  const s = strands[Math.floor(R() * 38)], u = 0.3 + R() * 0.7;
  return { from: V(s.x + 0.1 * u * u, W_TOP - u * s.len, s.z), sc: 0.045 + R() * 0.025, dur: 3.0 + R() * 2.2,
    birth: MK.yangliu - 0.3 + Math.pow(R(), 1.2) * 3.4,
    to: V(s.x + (R() - 0.5) * 0.9, 0, -0.85 + R() * 0.46), fade: MK.B + 1 + R() * 3,
    col: new THREE.Color().setHSL(0.15 + R() * 0.07, 0.5 + R() * 0.15, 0.45 + R() * 0.14) };
});

// ------------------------------------------------------------------ 燕子（按课本插图画风生成的四帧扑翼图）
const swTex = await texLoad('/assets/swallow.png');
const SW_SIZE = 0.25, SEQ = [0, 1, 2, 3, 2, 1];
function makeBird() {
  const tex = swTex.clone(); tex.repeat.set(0.25, 1); tex.needsUpdate = true;
  const mat = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.4, alphaToCoverage: true, side: THREE.DoubleSide });
  const g = new THREE.PlaneGeometry(SW_SIZE, SW_SIZE); g.translate(SW_SIZE * 0.12, 0, 0);
  const inner = new THREE.Mesh(g, mat); inner.castShadow = true;
  inner.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.4, side: THREE.DoubleSide });
  const b = new THREE.Group(); b.add(inner); b.userData = { inner, tex, mat }; scene.add(b); return b;
}
const sw0 = toW(1, ...BK.swallows[0], 0.012), sw1 = toW(1, ...BK.swallows[1], 0.012);
const flights = [
  { bird: makeBird(), t0: MK.yanzi + 0.1, dur: 6.2, emerge: true, ph: 0,
    curve: new THREE.CatmullRomCurve3([sw0, V(0.28, 0.1, -0.5), V(-0.12, 0.17, -0.56), V(-0.5, 0.2, -0.5), V(-0.92, 0.24, -0.56), V(-1.5, 0.45, -0.8), V(-2.7, 1.0, -1.2)]) },
  { bird: makeBird(), t0: MK.yanzi + 0.7, dur: 6.4, emerge: true, ph: 2.1,
    curve: new THREE.CatmullRomCurve3([sw1, V(0.45, 0.12, -0.6), V(0.05, 0.22, -0.64), V(-0.36, 0.26, -0.58), V(-0.75, 0.2, -0.5), V(-1.2, 0.3, -0.55), V(-1.7, 0.6, -0.7), V(-2.8, 1.0, -0.9)]) },
  { bird: makeBird(), t0: VO.end - 1.8, dur: 5.4, ph: 1.0,
    curve: new THREE.CatmullRomCurve3([V(3.0, 1.5, -1.6), V(1.7, 0.95, -0.7), V(1.05, 0.72, -0.3), V(0.35, 0.8, -0.45), V(-0.8, 1.1, -0.9), V(-2.8, 1.6, -1.3)]) },
  { bird: makeBird(), t0: VO.end - 1.1, dur: 5.4, ph: 3.3,
    curve: new THREE.CatmullRomCurve3([V(3.1, 1.8, -1.9), V(1.9, 1.2, -1.1), V(1.2, 0.98, -0.6), V(0.3, 1.05, -0.75), V(-0.8, 1.35, -1.1), V(-2.8, 1.8, -1.5)]) },
];
// 起飞后盖住书页上印着的燕子
const patches = await Promise.all(BK.patches.map(async ([x0, y0, x1, y1], i) => {
  const tex = await texLoad(`/assets/patch${i + 1}.png`);
  const a = toW(1, x0, (y0 + y1) / 2), b = toW(1, x1, (y0 + y1) / 2), len = b.x - a.x, hz = (y1 - y0) / CH * PH;
  const g = new THREE.PlaneGeometry(len, hz, 12, 1); g.rotateX(-Math.PI / 2);
  const pp = g.attributes.position;
  for (let k = 0; k < pp.count; k++) pp.setY(k, pageH(Math.abs(a.x + len / 2 + pp.getX(k)), 1) + 0.0009);
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, roughness: 0.93 }));
  m.position.set(a.x + len / 2, 0, a.z); m.renderOrder = 3; m.receiveShadow = true; scene.add(m);
  return { m, t0: flights[i].t0 };
}));
const _a = V(), _b = V(), QF = new THREE.Quaternion();
function updateBirds(t, tint) {
  for (const f of flights) {
    const k = ramp(t, f.t0, f.t0 + f.dur), b = f.bird, ud = b.userData;
    b.visible = k > 0 && k < 1; if (!b.visible) continue;
    const u = f.emerge ? lerp(k, k * k, 0.45) : k;
    f.curve.getPoint(u, Pv); f.curve.getPoint(Math.min(1, u + 0.012), Pw);
    b.position.copy(Pv);
    // 屏幕上的前进方向 → 朝向与俯仰
    _a.copy(Pv).project(camera); _b.copy(Pw).project(camera);
    const vx = (_b.x - _a.x) * (W / H), vy = _b.y - _a.y, right = vx > 0;
    const roll = THREE.MathUtils.clamp(Math.atan2(vy, Math.abs(vx)), -0.8, 0.8);
    ud.inner.scale.x = right ? -1 : 1; ud.inner.rotation.z = right ? roll : -roll;
    b.quaternion.copy(camera.quaternion);
    if (f.emerge) {                        // 起飞：先平贴在书页上，再立起来
      const lift = smooth(ramp(k, 0.0, 0.14));
      QF.copy(FLAT); b.quaternion.copy(QF.slerp(camera.quaternion, lift));
      b.scale.setScalar(lerp(0.62, 1, lift) * smooth(ramp(k, 0, 0.03)));
    }
    const glide = smooth(Math.sin(t * 1.5 + f.ph) * 2 - 1.1);
    const fr = glide > 0.5 ? 2 : SEQ[Math.floor(t * 15 + f.ph * 3) % SEQ.length];
    ud.tex.offset.x = fr * 0.25; ud.mat.color.copy(tint);
  }
}

// ------------------------------------------------------------------ 人物（生成图抠出来的立牌）
const FIG_T0 = MK.C - 1.9, FIG_H = 0.56;
const figTex = await texLoad('/assets/zhu.png');
const figW = FIG_H * figTex.image.width / figTex.image.height;
const figGeo = new THREE.PlaneGeometry(figW, FIG_H); figGeo.translate(0, FIG_H / 2, 0);
const figMat = new THREE.MeshBasicMaterial({ map: figTex, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide });
const fig = new THREE.Mesh(figGeo, figMat);
const FIG_P = toW(1, ...BK.figure, -0.006);
fig.position.copy(FIG_P); fig.rotation.order = 'YXZ'; fig.rotation.x = 0; fig.castShadow = true;
fig.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: figTex, alphaTest: 0.5, side: THREE.DoubleSide });
scene.add(fig);
const mulMat = (frag, uniforms = {}) => new THREE.ShaderMaterial({
  uniforms: { uA: { value: 0 }, ...uniforms }, transparent: true, depthWrite: false,
  blending: THREE.CustomBlending, blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor,
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `varying vec2 vUv; uniform float uA; void main(){ ${frag} }`,
});
const contact = new THREE.Mesh(new THREE.PlaneGeometry(figW * 1.25, 0.2), mulMat(
  `vec2 d=(vUv-.5)*2.; float a=exp(-dot(d,d)*2.6)*uA; gl_FragColor=vec4(vec3(1.-a*.55),1.);`));
contact.rotation.x = -Math.PI / 2; contact.position.copy(FIG_P).add(V(-0.01, 0.009, 0.01)); contact.renderOrder = 4; scene.add(contact);
const ripple = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
  uniforms: { uT: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `varying vec2 vUv; uniform float uT;
    void main(){ float d=length(vUv-.5)*2.; float r=1.-pow(1.-uT,2.4);
      float ring=exp(-pow((d-r*.92)/.04,2.)) + .5*exp(-pow((d-r*.6)/.06,2.));
      float a=ring*pow(1.-uT,1.3)*smoothstep(1.,.85,d);
      gl_FragColor=vec4(vec3(1.,.9,.7)*a*.7, a); }`,
}));
ripple.rotation.x = -Math.PI / 2; ripple.position.copy(FIG_P).add(V(0, 0.012, 0)); ripple.scale.setScalar(0.85); ripple.renderOrder = 6; scene.add(ripple);

// 月亮（暖色光晕）
const moon = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
  uniforms: { uA: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `varying vec2 vUv; uniform float uA;
    void main(){ float d=length(vUv-.5)*2.; float disc=smoothstep(.36,.2,d); float halo=exp(-d*d*4.)*.5;
      vec3 c=vec3(1.,.7,.4)*(disc*.95+halo); gl_FragColor=vec4(c*uA, 1.); }`,
}));
moon.position.set(-0.15, 1.22, -4.6); moon.scale.setScalar(1.25); scene.add(moon);

// ------------------------------------------------------------------ 后期
const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1); composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
const bokeh = new BokehPass(scene, camera, { focus: 3, aperture: 0.012, maxblur: 0.006 });
bokeh.materialDepth.side = THREE.DoubleSide;
composer.addPass(bokeh);
composer.addPass(new OutputPass());
const finalPass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uFade: { value: 1 }, uSeed: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `varying vec2 vUv; uniform sampler2D tDiffuse; uniform float uFade, uSeed;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))+uSeed)*43758.5453); }
    void main(){ vec3 c=texture2D(tDiffuse,vUv).rgb; vec2 d=(vUv-.5)*vec2(1.,.82);
      float v=smoothstep(.95,.25,length(d)*1.45); c*=mix(.56,1.,v);
      c=mix(c, c*vec3(1.01,1.,.99), .5);
      c+=(h(vUv*vec2(1920.,1080.))-.5)*.022;
      gl_FragColor=vec4(c*uFade,1.); }`,
});
composer.addPass(finalPass);

// ------------------------------------------------------------------ 运镜
// 运镜在“读文字”和“看意象”之间来回：念到哪句先落在字上，意象出现时抬起去看，再回到字上
const FG = FIG_P;
const KEYS = [
  { t: 0.0, p: V(1.5, 1.75, 2.35), q: V(0.5, 0.02, 0.05) },
  { t: 1.85, p: V(0.0, 2.9, 0.5), q: V(0.0, 0, 0.0), e: 'io' },
  { t: MK.yanzi - 1.3, p: V(0.02, 2.8, 0.53), q: V(0.0, 0, -0.01), e: 'lin' },
  { t: MK.yanzi + 1.0, p: V(-0.55, 0.62, 0.32), q: V(-0.5, 0, -0.34), e: 'io' },          // 字：燕子去了
  { t: MK.yanzi + 2.9, p: V(-0.5, 0.5, 0.56), q: V(-0.5, 0.22, -0.5), e: 'io' },           // 抬头：燕子飞过
  { t: MK.yangliu + 2.0, p: V(-0.42, 0.47, 0.62), q: V(-0.44, 0.29, -0.5), e: 'io' },      // 垂柳
  { t: MK.taohua + 0.8, p: V(-0.6, 0.5, 0.52), q: V(-0.66, 0.2, -0.5), e: 'io' },          // 桃枝
  { t: MK.taohua + 3.0, p: V(-0.55, 0.6, 0.42), q: V(-0.52, 0.04, -0.4), e: 'io' },        // 随落花回到书页
  { t: MK.danshi + 1.4, p: V(-0.5, 0.7, 0.36), q: V(-0.5, 0, -0.3), e: 'io' },             // 字：但是，聪明的……
  { t: MK.B - 0.6, p: V(-0.46, 0.72, 0.42), q: V(-0.48, 0, -0.26), e: 'lin' },
  { t: MK.B + 1.6, p: V(-0.5, 0.66, 0.5), q: V(-0.5, 0, -0.16), e: 'io' },                 // 字：我不知道他们给了我多少日子
  { t: MK.C - 2.8, p: V(-0.45, 0.68, 0.55), q: V(-0.47, 0, -0.14), e: 'lin' },
  { t: MK.C - 0.4, p: V(0.3, 0.46, 1.5), q: FG.clone().add(V(-0.1, 0.29, 0)), e: 'io' },   // 人物升起
  { t: MK.C + 2.4, p: V(0.38, 0.48, 1.42), q: FG.clone().add(V(-0.1, 0.28, 0)), e: 'lin' },
  { t: MK.buneng - 0.8, p: V(0.38, 0.76, 1.42), q: V(0.57, 0.19, 0.0), e: 'io' },            // 字：但不能平的……
  { t: VO.end - 1.0, p: V(0.43, 0.72, 1.36), q: V(0.58, 0.18, 0.0), e: 'lin' },
  { t: C.DURATION, p: V(0.12, 0.5, 1.98), q: V(0.42, 0.3, 0.0), e: 'io' },                 // 拉开：书、人、垂柳、月亮
];
const _q = V();
function cam(t) {
  let i = 0; while (i < KEYS.length - 2 && t > KEYS[i + 1].t) i++;
  const a = KEYS[i], b = KEYS[i + 1]; let k = ramp(t, a.t, b.t);
  if (b.e === 'io') k = easeIO(k); else k = lerp(k, smooth(k), 0.35);
  camera.position.lerpVectors(a.p, b.p, k); _q.lerpVectors(a.q, b.q, k); camera.lookAt(_q);
  return lerp(a.f || a.p.distanceTo(a.q), b.f || b.p.distanceTo(b.q), k);
}

// ------------------------------------------------------------------ 每帧
const elTitle = document.getElementById('title'), elSub = document.getElementById('sub');
document.getElementById('titleText').textContent = C.TITLE;
let lastDip = -1;
const KP0 = V(2.0, 3.2, 1.15), KP1 = V(2.9, 1.35, 0.25), KC0 = new THREE.Color(0xfff3e2), KC1 = new THREE.Color(0xffb46a);
const BG0 = new THREE.Color(0x04060a), BG1 = new THREE.Color(0x0d0a0c), FT0 = new THREE.Color(0xffffff), FT1 = new THREE.Color(0xf2dcc2);

function update(t) {
  // 书
  const dip = smooth(ramp(t, FLIP_END - 0.05, FLIP_END + 0.7));
  if (dip !== lastDip) { blockR.userData.update(dip); blockL.userData.update(dip); lastDip = dip; }
  blockL.visible = t > FLIP0 + FLIP_DUR * 0.8;
  leaves.forEach(L => { L.grp.visible = t < FLIP_END + 0.02; if (L.grp.visible) setLeaf(L, t); });

  // 黄昏：主光移到人物侧后方并变暖
  const dusk = smooth(ramp(t, MK.C - 1.6, MK.C + 2.0));
  key.position.lerpVectors(KP0, KP1, dusk); key.color.lerpColors(KC0, KC1, dusk); key.intensity = lerp(2.7, 3.3, dusk); key.angle = lerp(0.62, 0.5, dusk);
  hemi.intensity = lerp(1.05, 0.86, dusk); rim.intensity = lerp(0.7, 0.3, dusk);
  scene.background.lerpColors(BG0, BG1, dusk); scene.fog.color.copy(scene.background);
  figMat.color.lerpColors(FT0, FT1, dusk);
  moon.material.uniforms.uA.value = smooth(ramp(t, VO.end - 2.4, VO.end + 0.8));
  patches.forEach(P_ => { P_.m.material.opacity = smooth(ramp(t, P_.t0 + 0.05, P_.t0 + 0.5)); P_.m.visible = P_.m.material.opacity > 0; });

  updateWillow(t);

  // 桃枝
  const g = ramp(t, BR_T0, BR_T1);
  branchStems.forEach(s => s.g.setDrawRange(0, Math.floor(s.count * easeOutCubic(ramp(g, s.delay, s.delay + s.span)) / 3) * 3));
  blossoms.forEach((b, i) => {
    const e = easeOutBack(ramp(g, b.birth, b.birth + 0.1));
    S.setScalar(Math.max(1e-5, b.sc * e * (b.bud ? 0.5 : 1))); M.compose(b.p, b.q, S); bloomMesh.setMatrixAt(i, M);
    S.setScalar(Math.max(1e-5, b.sc * e * (b.bud ? 0.42 : 0.14))); Pv.copy(b.p).addScaledVector(Y.clone().applyQuaternion(b.q), b.sc * 0.06);
    M.compose(Pv, b.q, S); coreMesh.setMatrixAt(i, M);
  });
  bloomMesh.instanceMatrix.needsUpdate = true; coreMesh.instanceMatrix.needsUpdate = true;

  updateFallers(petals, t); updateFallers(deadLeaves, t);

  // 人物：始终竖直、正对镜头
  fig.rotation.y = Math.atan2(camera.position.x - FIG_P.x, camera.position.z - FIG_P.z);
  const fk = ramp(t, FIG_T0, FIG_T0 + 1.7), fe = easeOutCubic(fk);
  fig.visible = fk > 0; fig.scale.set(lerp(0.86, 1, fe), Math.max(1e-4, fe), 1);
  contact.material.uniforms.uA.value = smooth(ramp(fk, 0.2, 1));
  const rp = ramp(t, FIG_T0 - 0.35, FIG_T0 + 1.1); ripple.visible = rp > 0 && rp < 1; ripple.material.uniforms.uT.value = rp;

  // 荧光笔
  const th = t + 0.08;
  hlGroups.forEach(G => {
    const HT = G.times; let hp = 0;
    if (th >= HT[HT.length - 1]) hp = 1;
    else if (th > HT[0]) { let k = 0; while (th >= HT[k + 1]) k++; hp = (k + (th - HT[k]) / Math.max(1e-3, HT[k + 1] - HT[k])) / (HT.length - 1); }
    G.lines.forEach(l => { const p = ramp(hp, l.from, l.to); l.mesh.visible = p > 0; l.mesh.material.uniforms.uP.value = p; });
  });

  // 镜头与景深
  bokeh.uniforms.focus.value = cam(t); camera.updateMatrixWorld();
  updateBirds(t, figMat.color);
  bokeh.uniforms.aperture.value = lerp(0.004, 0.0075, smooth(ramp(t, MK.yanzi - 0.5, MK.yanzi + 2)));
  bokeh.uniforms.maxblur.value = 0.0055;

  finalPass.uniforms.uFade.value = smooth(ramp(t, -0.3, 0.3)) * (1 - smooth(ramp(t, C.DURATION - 0.9, C.DURATION - 0.05)));
  finalPass.uniforms.uSeed.value = (t * 61.7) % 10;

  // 文字
  elTitle.style.opacity = smooth(ramp(t, 0.3, 1.0)) * (1 - smooth(ramp(t, MK.yanzi - 0.7, MK.yanzi)));
  elTitle.style.transform = `translateY(${(1 - easeOutCubic(ramp(t, 0.3, 1.2))) * 14}px)`;
  let sub = '', so = 0;
  for (const [a, b, txt] of VO.subs) if (t >= a && t <= b) { sub = txt; so = smooth(ramp(t, a, a + 0.18)) * (1 - smooth(ramp(t, b - 0.18, b))); }
  if (elSub.textContent !== sub) elSub.textContent = sub;
  elSub.style.opacity = so;
}

window.renderFrame = (frame) => { update(frame / C.FPS); composer.render(); };
window.TOTAL_FRAMES = Math.round(C.DURATION * C.FPS);
window.renderFrame(0);
window.READY = true;

const qs = new URLSearchParams(location.search);
if (qs.has('t')) window.renderFrame(parseFloat(qs.get('t')) * C.FPS);
else if (!qs.has('still')) {
  const t0 = performance.now();
  const loop = () => { window.renderFrame((((performance.now() - t0) / 1000) % C.DURATION) * C.FPS); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}
