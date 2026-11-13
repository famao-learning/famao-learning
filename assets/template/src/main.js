import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import * as C from './content.js';
import { VO } from './vo.js';
import { buildPages, rng, CW, CH } from './pages.js';

const QS0 = new URLSearchParams(location.search);          // 封面用：?cw=&ch= 改画幅，?cover=x0,y0,x1,y1 取成片画面坐标里的任意取景框（可超出画面）
const FMT = QS0.get('fmt');                                   // ?fmt=34 → 3:4 竖版（1080×1440），镜头沿用横版的机位，用取景框重新构图
const W = +(QS0.get('cw') || (FMT === '34' ? 1080 : 1920)), H = +(QS0.get('ch') || (FMT === '34' ? 1440 : 1080));
{ const st = document.getElementById('stage'); st.style.width = W + 'px'; st.style.height = H + 'px'; if (FMT) st.classList.add('f' + FMT); }
const COVER = QS0.get('cover') ? QS0.get('cover').split(',').map(Number) : null;
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
key.position.set(-2.0, 3.1, 1.3); key.target.position.set(-0.1, 0, -0.05);
key.castShadow = true; key.shadow.mapSize.set(4096, 4096);
key.shadow.camera.near = 1.5; key.shadow.camera.far = 9; key.shadow.bias = -0.00025; key.shadow.normalBias = 0.004;
scene.add(key, key.target);
const hemi = new THREE.HemisphereLight(0xfbf8f2, 0x4a4640, 1.05); scene.add(hemi);
const rim = new THREE.DirectionalLight(0xfff6ee, 0.7); rim.position.set(-0.6, 1.4, 2.6); scene.add(rim);

const ground = new THREE.Mesh(new THREE.CircleGeometry(3.3, 128),
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
  const side = G.side === 'L' ? -1 : 1, total = G.lines.reduce((s, l) => s + l[3].length, 0); let acc = 0;
  const lines = G.lines.map(([x0, x1, y, text], i) => {
    const a = toW(side, x0 - 5, y), b = toW(side, x1 + 5, y);
    const len = b.x - a.x, hz = BK.lineHeight / CH * PH;
    const g = new THREE.PlaneGeometry(len, hz, 24, 1); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) p.setY(k, pageH(Math.abs(a.x + len / 2 + p.getX(k)), 1) + 0.0012);
    const m = hlMat(gi * 5 + i + 1); m.uniforms.uAspect.value = len / hz;
    const mesh = new THREE.Mesh(g, m); mesh.position.set(a.x + len / 2, 0, a.z); mesh.renderOrder = 5; scene.add(mesh);
    // 注释角标只占半个多字宽：按字宽累加，把“念到第几个字”换算成横向位置
    const cum = [0]; for (const ch of text) cum.push(cum[cum.length - 1] + ('①②③④⑤'.includes(ch) ? 0.58 : 1));
    const n = text.length, L = { mesh, from: acc / total, to: (acc + n) / total, cum, n }; acc += n; return L;
  });
  hlGroups.push({ times: VO.groups[G.id], lines });
});

// ------------------------------------------------------------------ 小工具
const M = new THREE.Matrix4(), S = new THREE.Vector3(), Q = new THREE.Quaternion(), Pv = new THREE.Vector3(), Pw = new THREE.Vector3();
const restY = (x, z) => (Math.abs(x) <= 1 && Math.abs(z) <= PH / 2) ? pageH(Math.abs(x), 1) + 0.003 : 0.002;
const FLAT = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -Math.PI / 2);
const texLoad = async (url) => { const t = await new THREE.TextureLoader().loadAsync(url); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t; };
const [treeTex, bridgeTex, houseTex, manTex, horseTex, vineTex, crowTex, perchTex] = await Promise.all(
  ['tree', 'bridge', 'house', 'man3d', 'horse3d', 'vine', 'crow', 'perch'].map(n => texLoad(`/assets/${n}.png`)));
const VS = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
const NOISE = `float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
  float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
    return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }`;

// 各意象的位置（世界坐标 x, z）：左页上沿一排是 枯藤老树 | 小桥 | 人家，古道从桥头绕到右页，瘦马和断肠人站在道上
const POS = { tree: [-0.845, -0.645], bridge: [-0.447, -0.642], house: [-0.165, -0.672], horse: [0.455, -0.07], man: [0.2, 0.0] };
const T = { tree: MK.kuteng - 0.55, bridge: MK.xiaoqiao - 0.45, stream: MK.liushui - 0.75, house: MK.renjia - 0.5, road: MK.gudao - 0.4,
  wind: MK.xifeng - 0.5, horse: MK.shouma - 0.6, man: MK.duanchang - 1.0 };

// ------------------------------------------------------------------ 立牌：生成图抠出来的意象，从书页上长出来
const mulMat = (frag, uniforms = {}) => new THREE.ShaderMaterial({
  uniforms: { uA: { value: 0 }, ...uniforms }, transparent: true, depthWrite: false,
  blending: THREE.CustomBlending, blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor,
  vertexShader: VS, fragmentShader: `varying vec2 vUv; uniform float uA; ${NOISE} void main(){ ${frag} }`,
});
const cutouts = [], proxies = [];
function makeCutout(tex, { h, at, t0, dur = 1.7, yaw = 1, sway = 0, ripple = 0.5, lift = -0.004 }) {
  const w = h * tex.image.width / tex.image.height, pos = V(at[0], restY(at[0], at[1]) + lift, at[1]);
  const geo = new THREE.PlaneGeometry(w, h, 1, sway ? 14 : 1); geo.translate(0, h / 2, 0);
  const mat = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide });
  const vis = new THREE.Mesh(geo, mat); vis.position.copy(pos); scene.add(vis);
  // 影子：一张只投影、不显示的面片，始终正对主光，这样侧光下影子也是完整的剪影
  const px = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, colorWrite: false, depthWrite: false, side: THREE.DoubleSide }));
  px.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.5, side: THREE.DoubleSide });
  px.castShadow = true; px.position.copy(pos); scene.add(px); proxies.push(px);
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.1, Math.max(0.07, w * 0.3)), mulMat(
    `vec2 d=(vUv-.5)*2.; float a=exp(-dot(d,d)*2.8)*uA; gl_FragColor=vec4(vec3(1.-a*.5),1.);`));
  contact.rotation.x = -Math.PI / 2; contact.position.copy(pos).add(V(0, 0.006 - lift, 0.012)); contact.renderOrder = 4; scene.add(contact);
  const rip = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexShader: VS,
    fragmentShader: `varying vec2 vUv; uniform float uT;
      void main(){ float d=length(vUv-.5)*2.; float r=1.-pow(1.-uT,2.4);
        float ring=exp(-pow((d-r*.92)/.04,2.)) + .5*exp(-pow((d-r*.6)/.06,2.));
        float a=ring*pow(1.-uT,1.3)*smoothstep(1.,.85,d);
        gl_FragColor=vec4(vec3(1.,.86,.62)*a*.7, a); }` }));
  rip.rotation.x = -Math.PI / 2; rip.position.copy(pos).add(V(0, 0.01 - lift, 0)); rip.scale.setScalar(ripple); rip.renderOrder = 6; scene.add(rip);
  const c = { vis, px, mat, contact, rip, pos, w, h, t0, dur, yaw, sway, base: geo.attributes.position.array.slice() };
  cutouts.push(c); return c;
}
const tree = makeCutout(treeTex, { h: 0.47, at: POS.tree, t0: T.tree, dur: 2.2, sway: 1, ripple: 0.6 });
const bridge = makeCutout(bridgeTex, { h: 0.072, at: POS.bridge, t0: T.bridge, dur: 1.4, yaw: 0.35, ripple: 0.5, lift: -0.002 });
const house = makeCutout(houseTex, { h: 0.2, at: POS.house, t0: T.house, dur: 1.5, yaw: 0.5, ripple: 0.55 });
const horse = makeCutout(horseTex, { h: 0.29, at: POS.horse, t0: T.horse, dur: 1.6, ripple: 0.7 });
const man = makeCutout(manTex, { h: 0.36, at: POS.man, t0: T.man, dur: 1.8, ripple: 0.6 });
function updateCutouts(t, tint, wind) {
  for (const c of cutouts) {
    const k = ramp(t, c.t0, c.t0 + c.dur), e = easeOutCubic(k);
    c.vis.visible = c.px.visible = k > 0;
    c.vis.rotation.y = c.yaw * Math.atan2(camera.position.x - c.pos.x, camera.position.z - c.pos.z);
    c.px.rotation.y = Math.atan2(key.position.x - c.pos.x, key.position.z - c.pos.z);
    c.vis.scale.set(lerp(0.86, 1, e), Math.max(1e-4, e), 1); c.px.scale.copy(c.vis.scale);
    c.mat.color.copy(tint);
    c.contact.material.uniforms.uA.value = smooth(ramp(k, 0.2, 1));
    const rp = ramp(t, c.t0 - 0.3, c.t0 + 1.1); c.rip.visible = rp > 0 && rp < 1; c.rip.material.uniforms.uT.value = rp;
    if (c.sway) {                              // 老树的枝梢随风轻晃
      const p = c.vis.geometry.attributes.position, b = c.base;
      for (let i = 0; i < p.count; i++) { const u = b[i * 3 + 1] / c.h; p.setX(i, b[i * 3] + u * u * (0.004 * Math.sin(t * 1.3) + wind * (0.012 + 0.006 * Math.sin(t * 2.3 + 1)))); }
      p.needsUpdate = true;
    }
  }
}

// ------------------------------------------------------------------ 流水与古道：贴在书页空白处的两条带子
function ribbon(pts, widthAt, mat, order, N = 220) {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => V(x, 0, z))), L = curve.getLength();
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N, c = curve.getPointAt(u), tg = curve.getTangentAt(u), w = widthAt(u) / 2;
    for (const s of [-1, 1]) {
      const x = c.x - tg.z * w * s, z = c.z + tg.x * w * s;
      pos.push(x, restY(x, z) - 0.0016, z); uv.push(u * L, (s + 1) / 2);
    }
    if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  mat.uniforms.uLen.value = L; mat.side = THREE.DoubleSide;
  const m = new THREE.Mesh(g, mat); m.renderOrder = order; m.frustumCulled = false; scene.add(m); return m;
}
// 流水：从桥洞下流出，沿曲文和注释之间的空白流下来，再从曲文下面的空白向左流出书页
const streamMat = new THREE.ShaderMaterial({
  uniforms: { uT: { value: 0 }, uP: { value: 0 }, uLen: { value: 1 }, uSun: { value: new THREE.Color(1, 1, 1) }, uLight: { value: 1 } },
  transparent: true, depthWrite: false, vertexShader: VS,
  fragmentShader: `varying vec2 vUv; uniform float uT, uP, uLen, uLight; uniform vec3 uSun; ${NOISE}
    void main(){
      float s = vUv.x, v = vUv.y;
      float wob = (n(vec2(s*26., 1.7)) - .5)*.16;
      float edge = smoothstep(.0,.24, v+wob)*smoothstep(1.,.76, v+wob);
      float front = smoothstep(uP*(uLen+.06), uP*(uLen+.06)-.06, s) * smoothstep(uLen, uLen-.05, s);
      float f1 = n(vec2(s*46. - uT*2.0, v*4.5));
      float f2 = n(vec2(s*110. - uT*3.4, v*8. + 3.));
      float f3 = n(vec2(s*18. - uT*1.1, v*2. + 7.));
      vec3 col = mix(vec3(.44,.58,.63), vec3(.74,.84,.85), f1*.7 + f3*.3) * uLight;
      float glint = smoothstep(.70,.92, f2*.6+f1*.4) + .5*smoothstep(.8,.95,f2);
      col += glint * uSun * .55;
      float a = edge*front*(.80 + .15*f3);
      gl_FragColor = vec4(col, a);
    }`,
});
const stream = ribbon([[-0.449, -0.705], [-0.445, -0.64], [-0.451, -0.56], [-0.444, -0.49], [-0.448, -0.425], [-0.468, -0.366], [-0.53, -0.324],
  [-0.62, -0.312], [-0.72, -0.319], [-0.82, -0.31], [-0.91, -0.317], [-0.996, -0.311]], u => lerp(0.04, 0.052, smooth(ramp(u, 0.3, 0.6))), streamMat, 3);
// 古道：从桥头经过人家门前，越过书脊，蜿蜒到右页
const roadMat = new THREE.ShaderMaterial({
  uniforms: { uP: { value: 0 }, uLen: { value: 1 }, uLight: { value: new THREE.Color(1, 1, 1) } },
  transparent: true, depthWrite: false, vertexShader: VS,
  fragmentShader: `varying vec2 vUv; uniform float uP, uLen; uniform vec3 uLight; ${NOISE}
    void main(){
      float s = vUv.x, v = vUv.y;
      float wob = (n(vec2(s*13., 2.3)) - .5)*.34;
      float edge = smoothstep(.0,.26, v+wob)*smoothstep(1.,.74, v+wob);
      float front = smoothstep(uP*(uLen+.1), uP*(uLen+.1)-.1, s) * smoothstep(.0,.05,s) * smoothstep(uLen, uLen-.1, s);
      float g = n(vec2(s*50., v*7.))*.55 + n(vec2(s*150., v*26.))*.45;
      float rut = exp(-pow((v-.34+wob*.2)/.045,2.)) + exp(-pow((v-.66+wob*.2)/.045,2.));
      vec3 col = mix(vec3(.80,.69,.50), vec3(.62,.50,.34), g*.6 + rut*.35*n(vec2(s*24., 3.)));
      col = mix(col, vec3(.45,.36,.26), (1.-smoothstep(.0,.5,edge))*.5);
      gl_FragColor = vec4(col*uLight, edge*front*(.62 + .2*g));
    }`,
});
const road = ribbon([[-0.3, -0.632], [-0.17, -0.628], [-0.05, -0.634], [0.07, -0.63], [0.2, -0.6], [0.31, -0.5], [0.355, -0.36], [0.33, -0.2], [0.3, -0.03],
  [0.34, 0.16], [0.47, 0.36], [0.62, 0.54], [0.74, 0.69]], u => lerp(0.05, 0.12, Math.pow(u, 1.3)), roadMat, 2, 260);

// ------------------------------------------------------------------ 枯藤（按课本水墨插图画风生成的藤条贴图，做成会摆动的飘带，从画面上方垂下来）
const Rw = rng(77);
const W_COLS = [[56, 197], [248, 379], [412, 574], [619, 753], [812, 967]], W_IMG = [1024, 1536];
const W_TOP = 2.0, W_T0 = MK.kuteng - 0.9, NSEG = 26;
const vineMat = new THREE.MeshStandardMaterial({ map: vineTex, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.85, color: 0xa8957a,
  emissive: 0xffffff, emissiveMap: vineTex, emissiveIntensity: 0.1 });
const vineDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: vineTex, alphaTest: 0.3, side: THREE.DoubleSide });
const strands = [];
function addStrand(x, z, len, yaw) {
  const [c0, c1] = W_COLS[Math.floor(Rw() * W_COLS.length)], pad = 10;
  const u0 = (c0 - pad) / W_IMG[0], u1 = (c1 + pad) / W_IMG[0], flip = Rw() < 0.5;
  const w = len * ((c1 - c0 + 2 * pad) / W_IMG[1]);
  const g = new THREE.PlaneGeometry(w, len, 1, NSEG); const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) { const u = uv.getX(i); uv.setX(i, flip ? lerp(u1, u0, u) : lerp(u0, u1, u)); }
  const m = new THREE.Mesh(g, vineMat); m.customDepthMaterial = vineDepth; m.castShadow = false; m.frustumCulled = false; scene.add(m);
  strands.push({ m, g, x, z, len, w, yaw, ph: Rw() * 6.28, ph2: Rw() * 6.28, delay: Rw() * 1.6, amp: 0.7 + Rw() * 0.6 });
}
// 后排：老树身后垂下的一片枯藤
for (let i = 0; i < 9; i++) addStrand(-1.55 + 1.5 * (i + Rw() * 0.9) / 9, -1.08 + Rw() * 0.22, 1.5 + Rw() * 0.3, (Rw() - 0.5) * 0.9);
// 老树上方垂到枝梢的几条
for (const [x, z, len] of [[-1.12, -0.8, 1.62], [-0.6, -0.86, 1.55], [-0.52, -0.8, 1.7], [-1.22, -0.62, 1.74]]) addStrand(x, z, len, (Rw() - 0.5) * 0.6);
// 前景：靠近镜头的几条，虚化后增加层次
for (const [x, z, len] of [[-1.3, -0.1, 1.5], [-1.2, 0.3, 1.7], [1.25, 0.25, 1.62], [1.02, 0.86, 1.75], [0.9, -0.62, 1.5], [1.32, -0.3, 1.55]]) addStrand(x, z, len, (Rw() - 0.5) * 0.6);
function updateVines(t, wind) {
  for (const s of strands) {
    const g = easeOutCubic(ramp(t, W_T0 + s.delay, W_T0 + s.delay + 2.4)), top = W_TOP + (s.len + 0.5) * (1 - g);
    const p = s.g.attributes.position, c = Math.cos(s.yaw), sn = Math.sin(s.yaw), sp = 1 + wind * 0.8;
    for (let r = 0; r <= NSEG; r++) {
      const u = r / NSEG;
      const sw = s.amp * (0.05 * Math.pow(u, 1.5) * Math.sin(t * 0.9 * sp + s.ph + u * 2.2) + 0.02 * u * Math.sin(t * 1.7 * sp + s.ph2 + u * 4));
      const ox = sw + (0.03 + 0.16 * wind) * u * u, oz = s.amp * 0.03 * Math.pow(u, 1.5) * Math.cos(t * 0.8 + s.ph);   // 西风一起，藤条被吹斜
      for (let k = 0; k < 2; k++) { const hh = (k - 0.5) * s.w; p.setXYZ(r * 2 + k, s.x + ox + hh * c, top - u * s.len, s.z + oz + hh * sn); }
    }
    p.needsUpdate = true; s.g.computeVertexNormals();
  }
}

// ------------------------------------------------------------------ 枯叶：先是老树上零星飘落，西风一起就横着卷过书页
const leafGeo = (() => {
  const sh = new THREE.Shape(); sh.moveTo(0, 0);
  sh.bezierCurveTo(0.3, 0.2, 0.3, 0.72, 0, 1); sh.bezierCurveTo(-0.3, 0.72, -0.3, 0.2, 0, 0);
  const g = new THREE.ShapeGeometry(sh, 8); g.translate(0, -0.5, 0); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, 0.7 * p.getX(i) * p.getX(i) + 0.14 * Math.sin(p.getY(i) * 3.14));
  g.computeVertexNormals(); return g;
})();
const leafMat = new THREE.MeshStandardMaterial({ roughness: 0.7, side: THREE.DoubleSide, emissive: 0x8a4a12, emissiveIntensity: 0.55 });
const leafCol = (R) => new THREE.Color().setHSL(0.06 + R() * 0.06, 0.6 + R() * 0.25, 0.42 + R() * 0.2);
const Rf = rng(313), NF = 26, fallers = [];
for (let i = 0; i < NF; i++) {
  const from = V(POS.tree[0] + (Rf() - 0.5) * 0.3, 0.2 + Rf() * 0.26, POS.tree[1] + 0.01), right = Rf() < 0.3;
  const to = right ? V(-0.42 + Rf() * 0.4, 0, -0.69 + Rf() * 0.08) : V(-0.99 + Rf() * 0.52, 0, -0.69 + Rf() * 0.2);
  to.y = restY(to.x, to.z) + Rf() * 0.002;
  fallers.push({ from, to, birth: MK.laoshu - 0.2 + Math.pow(Rf(), 1.2) * 9, dur: 2.6 + Rf() * 1.8, sc: 0.022 + Rf() * 0.012, ph: Rf() * 6.28, ph2: Rf() * 6.28, sp: 0.7 + Rf() * 0.8,
    ax: V(Rf() - 0.5, Rf() - 0.5, Rf() - 0.5).normalize(), col: leafCol(Rf),
    qr: FLAT.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), Rf() * 6.28)) });
}
const NWL = 150, wleaves = [];
for (let i = 0; i < NWL; i++) wleaves.push({ x: -1.9 + Rf() * 1.5, y: 0.04 + Math.pow(Rf(), 1.6) * 0.5, z: -1.0 + Rf() * 1.5, sp: 0.5 + Rf() * 0.55, life: 3.2 + Rf() * 1.6, gap: Rf() * 1.5,
  off: Rf() * 6, ph: Rf() * 6.28, ph2: Rf() * 6.28, sc: 0.012 + Rf() * 0.01, ax: V(Rf() - 0.5, Rf() - 0.5, Rf() - 0.5).normalize(), col: leafCol(Rf) });
const leafMesh = new THREE.InstancedMesh(leafGeo, leafMat, NF + NWL);
[...fallers, ...wleaves].forEach((f, i) => leafMesh.setColorAt(i, f.col));
leafMesh.frustumCulled = false; leafMesh.castShadow = false; scene.add(leafMesh);
function updateLeaves(t) {
  fallers.forEach((f, i) => {
    const tau = t - f.birth;
    if (tau <= 0) { S.setScalar(1e-5); M.compose(f.from, Q.identity(), S); leafMesh.setMatrixAt(i, M); return; }
    const k = clamp01(tau / f.dur), air = 1 - smooth(ramp(k, 0.8, 1));
    Pv.lerpVectors(f.from, f.to, lerp(k, smooth(k), 0.4)); Pv.y = lerp(f.from.y, f.to.y, Math.pow(k, 1.25));
    Pv.x += air * 0.05 * Math.sin(tau * f.sp * 2.2 + f.ph) * Math.min(1, tau); Pv.z += air * 0.03 * Math.cos(tau * f.sp * 1.9 + f.ph2) * Math.min(1, tau);
    Q.setFromAxisAngle(f.ax, f.ph + tau * f.sp * 3.0); Q.slerp(f.qr, smooth(ramp(k, 0.78, 1)));
    S.setScalar(f.sc * smooth(tau / 0.35) + 1e-5); M.compose(Pv, Q, S); leafMesh.setMatrixAt(i, M);
  });
  wleaves.forEach((f, i) => {
    const cyc = f.life + f.gap, tt = t - T.wind - f.off * 0.45; let sc = 0;
    if (tt > 0) {
      const tau = tt % cyc;
      if (tau < f.life) {
        const k = tau / f.life;
        Pv.set(f.x + f.sp * tau * (0.75 + 0.25 * Math.sin(tau * 1.3 + f.ph)) , 0, f.z + 0.12 * Math.sin(tau * 1.1 + f.ph2) + 0.05 * tau);
        Pv.y = Math.max(restY(Pv.x, Pv.z) + 0.006, f.y + 0.07 * Math.sin(tau * 2.3 + f.ph) - 0.05 * tau + 0.03 * Math.sin(tau * 5.1 + f.ph2));
        Q.setFromAxisAngle(f.ax, f.ph + tau * (4 + f.sp * 4));
        sc = f.sc * smooth(k / 0.12) * (1 - smooth(ramp(k, 0.85, 1)));
      }
    }
    S.setScalar(sc + 1e-5); M.compose(Pv, Q, S); leafMesh.setMatrixAt(NF + i, M);
  });
  leafMesh.instanceMatrix.needsUpdate = true;
}

// ------------------------------------------------------------------ 昏鸦（按课本插图画风生成的四帧扑翼图）：黄昏时飞回老树，落在枝头
const CR = 0.105, SEQ = [0, 1, 2, 3, 2, 1], PERCH_W = 0.05;
function makeBird() {
  const tex = crowTex.clone(); tex.repeat.set(0.25, 1); tex.needsUpdate = true;
  const mat = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.4, alphaToCoverage: true, side: THREE.DoubleSide });
  const g = new THREE.PlaneGeometry(CR, CR); g.translate(CR * 0.14, 0, 0);
  const inner = new THREE.Mesh(g, mat);
  const b = new THREE.Group(); b.add(inner); scene.add(b);
  const ph = PERCH_W * perchTex.image.height / perchTex.image.width;
  const pg = new THREE.PlaneGeometry(PERCH_W, ph); pg.translate(PERCH_W * 0.08, ph * 0.42, 0);
  const pm = new THREE.MeshBasicMaterial({ map: perchTex, alphaTest: 0.4, alphaToCoverage: true, side: THREE.DoubleSide });
  const perch = new THREE.Mesh(pg, pm); scene.add(perch);
  return { b, inner, tex, mat, perch, pm };
}
// 栖落点：老树贴图上的位置 [横向 0~1, 高度 0~1]
const perchW = (uv, out) => out.set((uv[0] - 0.5) * tree.w, uv[1] * tree.h, 0.004).applyAxisAngle(Y, tree.vis.rotation.y).add(tree.pos);
const flights = [
  { t0: MK.hunya - 0.7, dur: 5.6, ph: 0, spot: [0.665, 0.578], flip: 1,
    pts: [V(1.0, 0.62, -1.3), V(0.3, 0.44, -0.95), V(-0.2, 0.36, -0.62), V(-0.62, 0.4, -0.45), V(-1.1, 0.42, -0.55), V(-1.0, 0.46, -0.86), V(-0.6, 0.41, -0.8)] },
  { t0: MK.hunya + 0.1, dur: 6.2, ph: 2.1, spot: [0.325, 0.8], flip: -1,
    pts: [V(1.3, 0.8, -0.9), V(0.5, 0.52, -0.6), V(-0.1, 0.42, -0.5), V(-0.5, 0.46, -0.66), V(-1.0, 0.5, -0.85), V(-1.22, 0.44, -0.6), V(-1.0, 0.43, -0.45)] },
  { t0: VO.end - 1.2, dur: 5.2, ph: 1.0, spot: [0.86, 0.6], flip: 1,
    pts: [V(2.3, 0.9, -2.0), V(1.0, 0.62, -1.4), V(0.1, 0.5, -1.1), V(-0.4, 0.46, -0.85)] },
].map(f => { const B = makeBird(); f.curve = new THREE.CatmullRomCurve3([...f.pts, perchW(f.spot, V())]); return { ...f, ...B }; });
const _a = V(), _b = V();
function updateBirds(t, tint) {
  for (const f of flights) {
    const k = ramp(t, f.t0, f.t0 + f.dur); perchW(f.spot, Pw);
    f.b.visible = k > 0 && k < 1; f.perch.visible = k >= 1;
    f.perch.position.copy(Pw); f.perch.quaternion.copy(camera.quaternion); f.perch.scale.x = f.flip; f.pm.color.copy(tint);
    if (!f.b.visible) continue;
    const u = 1 - Math.pow(1 - k, 1.35), land = smooth(ramp(k, 0.84, 1));
    f.curve.getPointAt(u, Pv); f.curve.getPointAt(Math.min(1, u + 0.012), _b);
    Pv.lerp(Pw, land); f.b.position.copy(Pv);
    _a.copy(Pv).project(camera); _b.project(camera);
    const vx = (_b.x - _a.x) * (W / H), vy = _b.y - _a.y, right = land > 0.5 ? f.flip < 0 : vx > 0;
    const roll = THREE.MathUtils.clamp(Math.atan2(vy, Math.abs(vx)), -0.7, 0.7) * (1 - land);
    f.inner.scale.x = right ? -1 : 1; f.inner.rotation.z = right ? roll : -roll;
    f.b.quaternion.copy(camera.quaternion); f.b.scale.setScalar(smooth(ramp(k, 0, 0.04)) * lerp(1, 0.8, land));
    const glide = smooth(Math.sin(t * 1.5 + f.ph) * 2 - 1.1);
    const fr = land > 0.6 ? (Math.floor(t * 14) % 2) : glide > 0.5 ? 2 : SEQ[Math.floor(t * 13 + f.ph * 3) % SEQ.length];
    f.tex.offset.x = fr * 0.25; f.mat.color.copy(tint);
  }
}

// ------------------------------------------------------------------ 夕阳与晚霞
const SUN = V(-2.19, 0.3, -2.86);
const sun = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
  uniforms: { uA: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, vertexShader: VS,
  fragmentShader: `varying vec2 vUv; uniform float uA;
    void main(){ float d=length(vUv-.5)*2.; float disc=smoothstep(.335,.3,d); float halo=(exp(-d*d*5.)*.55 + exp(-d*d*1.6)*.16)*smoothstep(1.,.55,d);
      vec3 c=mix(vec3(1.,.30,.07), vec3(1.,.62,.22), smoothstep(.2,.8,vUv.y))*disc*1.15 + vec3(1.,.42,.12)*halo;
      gl_FragColor=vec4(c*uA, 1.); }`,
}));
sun.scale.setScalar(1.7); scene.add(sun);
const glow = new THREE.Mesh(new THREE.CylinderGeometry(3.75, 3.75, 4.4, 64, 1, true), new THREE.ShaderMaterial({
  uniforms: { uA: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.BackSide,
  vertexShader: `varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
  fragmentShader: `varying vec3 vW; uniform float uA;
    void main(){ float hgt=clamp(vW.y/2.2,0.,1.); float az=max(0., dot(normalize(vW.xz), normalize(vec2(-1.3,-1.7))));
      float f=pow(az,2.2)*.85+.15*az;
      vec3 c=mix(vec3(1.,.40,.10), vec3(.42,.13,.24), smoothstep(0.,.5,hgt))*exp(-hgt*3.4)*f;
      gl_FragColor=vec4(c*uA*.75, 1.); }`,
}));
glow.position.y = 2.1; scene.add(glow);

// ------------------------------------------------------------------ 后期
const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1); composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
const bokeh = new BokehPass(scene, camera, { focus: 3, aperture: 0.012, maxblur: 0.006 });
bokeh.materialDepth.side = THREE.DoubleSide;
const bokehRender = bokeh.render.bind(bokeh);          // 景深的深度图里不要算上“只投影”的面片和天空
bokeh.render = (...a) => { const hide = [...proxies, sun, glow].filter(o => o.visible); hide.forEach(o => o.visible = false); bokehRender(...a); hide.forEach(o => o.visible = true); };
composer.addPass(bokeh);
composer.addPass(new OutputPass());
const finalPass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uFade: { value: 1 }, uSeed: { value: 0 }, uWarm: { value: 0 } },
  vertexShader: VS,
  fragmentShader: `varying vec2 vUv; uniform sampler2D tDiffuse; uniform float uFade, uSeed, uWarm;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))+uSeed)*43758.5453); }
    void main(){ vec3 c=texture2D(tDiffuse,vUv).rgb; vec2 d=(vUv-.5)*vec2(1.,.82);
      float v=smoothstep(.95,.25,length(d)*1.45); c*=mix(.56,1.,v);
      c=mix(c, c*vec3(1.05,.98,.9), uWarm);
      c+=(h(vUv*vec2(${W}.,${H}.))-.5)*.022;
      gl_FragColor=vec4(c*uFade,1.); }`,
});
composer.addPass(finalPass);

// ------------------------------------------------------------------ 运镜
// 在“读文字”和“看意象”之间来回：念到哪句先落在字上，意象出现时抬起去看，再回到字上
const KEYS = [
  { t: 0.0, p: V(1.5, 1.75, 2.35), q: V(0.5, 0.02, 0.05) },
  { t: 1.85, p: V(0.0, 2.9, 0.5), q: V(0.0, 0, 0.0), e: 'io', r: [960, 600, 1680] },
  { t: MK.kuteng - 2.3, p: V(-0.06, 2.72, 0.5), q: V(-0.05, 0, -0.03), e: 'lin', r: [960, 600, 1680] },
  { t: MK.kuteng - 0.15, p: V(-0.7, 0.5, -0.02), q: V(-0.69, 0, -0.41), e: 'io', r: [960, 430, 1680] },             // 字：枯藤老树昏鸦
  { t: MK.laoshu - 0.3, p: V(-0.7, 0.5, 0.02), q: V(-0.7, 0, -0.42), e: 'lin', r: [960, 430, 1680] },
  { t: MK.hunya - 0.1, p: V(-0.64, 0.48, 0.5), q: V(-0.75, 0.18, -0.63), e: 'io' },            // 抬头：老树、枯藤、归鸦
  { t: MK.xiaoqiao - 0.3, p: V(-0.62, 0.47, 0.5), q: V(-0.72, 0.18, -0.63), e: 'lin' },
  { t: MK.xiaoqiao + 0.9, p: V(-0.5, 0.42, 0.34), q: V(-0.47, 0.06, -0.6), e: 'io' },          // 小桥
  { t: MK.liushui + 0.9, p: V(-0.58, 0.52, 0.08), q: V(-0.6, 0, -0.4), e: 'io', r: [800, 430, 1640] },              // 字 + 流水绕着曲文流过
  { t: MK.renjia + 1.0, p: V(-0.34, 0.36, 0.2), q: V(-0.24, 0.07, -0.62), e: 'io' },           // 人家
  { t: MK.gudao + 1.3, p: V(0.28, 0.66, 0.78), q: V(0.08, 0.03, -0.26), e: 'io' },             // 拉开：古道绕到右页
  { t: MK.shouma + 1.0, p: V(0.7, 0.32, 0.74), q: V(0.4, 0.13, -0.08), e: 'io', r: [1060, 430, 1440] },              // 瘦马
  { t: MK.xiyang + 0.9, p: V(-0.18, 0.5, 0.36), q: V(-0.78, 0.14, -0.58), e: 'io' },           // 字 + 夕阳落在老树后
  { t: MK.duanchang - 0.5, p: V(-0.12, 0.48, 0.42), q: V(-0.74, 0.14, -0.56), e: 'lin' },
  { t: MK.duanchang + 1.0, p: V(0.52, 0.3, 0.72), q: V(0.2, 0.19, -0.02), e: 'io', r: [1250, 430, 1560] },           // 断肠人
  { t: VO.end + 0.6, p: V(0.6, 0.31, 0.8), q: V(0.18, 0.19, -0.04), e: 'lin', r: [1250, 430, 1560] },
  { t: C.DURATION, p: V(0.92, 0.44, 1.2), q: V(-0.12, 0.17, -0.3), e: 'io', r: [1120, 430, 1760] },                  // 拉开：书、人、马、桥、人家、老树、夕阳
];
const _q = V();
// 竖版取景框 [中心x, 中心y, 宽]，单位是横版 1920×1080 画面的像素；高 = 宽×4/3，可以超出横版画面（往上多露天空）。关键帧里用 r 单独指定
const R34 = [960, 430, 1440]; let viewR = R34;
function cam(t) {
  let i = 0; while (i < KEYS.length - 2 && t > KEYS[i + 1].t) i++;
  const a = KEYS[i], b = KEYS[i + 1]; let k = ramp(t, a.t, b.t);
  if (b.e === 'io') k = easeIO(k); else k = lerp(k, smooth(k), 0.35);
  camera.position.lerpVectors(a.p, b.p, k); _q.lerpVectors(a.q, b.q, k); camera.lookAt(_q);
  { const ra = a.r || R34, rb = b.r || R34; viewR = ra.map((v, j) => lerp(v, rb[j], k)); }
  return lerp(a.f || a.p.distanceTo(a.q), b.f || b.p.distanceTo(b.q), k);
}

// ------------------------------------------------------------------ 每帧
const elTitle = document.getElementById('title'), elSub = document.getElementById('sub'), elShade = document.getElementById('shade');
const elStage = document.getElementById('stage');
if (QS0.get('sf')) { elStage.style.setProperty('--art', `"${QS0.get('sf')}"`); elStage.style.setProperty('--artw', QS0.get('sw') || 700); }
// 艺术字：每个字一个 span，大小、高低、倾斜都略有出入，像手写的
const jit = (i, k) => { const x = Math.sin(i * 127.1 + k * 311.7 + 4.2) * 43758.5453; return x - Math.floor(x); };
const artChars = (el, txt, sizes, seed, seal) => {
  el.innerHTML = [...txt].map((ch, k) => `<span style="font-size:${(sizes && sizes[k]) || 1}em">${ch}</span>`).join('') + (seal ? `<b class="seal">${seal}</b>` : '');
  return [...el.querySelectorAll('span')].map((sp, k) => ({ sp, dy: (jit(seed, k) - 0.5) * 14, rot: (jit(seed + 9, k) - 0.5) * 6 }));
};
const artPose = (c, p) => { const e = easeOutCubic(p);
  c.sp.style.opacity = p; c.sp.style.filter = p < 1 ? `blur(${((1 - p) * 9).toFixed(2)}px)` : 'none';
  c.sp.style.transform = `translateY(${(c.dy + (1 - e) * 16).toFixed(2)}px) rotate(${c.rot.toFixed(2)}deg) scale(${(1 + (1 - e) * 0.14).toFixed(3)})`; };
// 水墨晕开：退场时笔画先向外洇、边缘被水纹带歪，再被一片片“吃掉”，像墨在水里散开。每句一个滤镜，互不影响
const inkDefs = document.getElementById('inkDefs');
const makeInk = (id, seed) => {
  inkDefs.insertAdjacentHTML('beforeend', `<filter id="${id}" x="-25%" y="-90%" width="150%" height="280%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.006 0.010" numOctaves="3" seed="${seed}" result="n1"/>
    <feDisplacementMap in="SourceGraphic" in2="n1" scale="0" xChannelSelector="R" yChannelSelector="G" result="d"/>
    <feGaussianBlur in="d" stdDeviation="0" result="b"/>
    <feComponentTransfer in="b" result="g"><feFuncA type="linear" slope="1" intercept="0"/></feComponentTransfer>
    <feTurbulence type="fractalNoise" baseFrequency="0.010 0.015" numOctaves="3" seed="${seed + 5}" result="n2"/>
    <feColorMatrix in="n2" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  2.6 0 0 0 1" result="m"/>
    <feComposite in="g" in2="m" operator="in" result="e"/>
    <feGaussianBlur in="e" stdDeviation="0"/></filter>`);
  const f = inkDefs.lastElementChild, [, disp, blur1, , , mask, , blur2] = f.children, gain = f.querySelector('feFuncA');
  return (el, p) => {
    if (p <= 0) { el.style.filter = 'none'; el.style.transform = 'none'; return 1; }
    const e = Math.pow(p, 1.3);
    disp.setAttribute('scale', (e * 130).toFixed(2)); blur1.setAttribute('stdDeviation', (p * 13).toFixed(2));
    gain.setAttribute('slope', (1 + 2.2 * Math.sin(Math.PI * Math.min(1, p * 1.15))).toFixed(3));
    mask.setAttribute('values', `0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  2.6 0 0 0 ${(-2.6 * lerp(-0.4, 0.8, e)).toFixed(3)}`);
    blur2.setAttribute('stdDeviation', (0.5 + p * 6).toFixed(2));
    el.style.filter = `url(#${id})`; el.style.transform = `translateY(${(-8 * e).toFixed(2)}px) scale(${(1 + 0.08 * e).toFixed(4)})`;
    return 1 - smooth(ramp(p, 0.45, 1));
  };
};
const [TITLE_ZH, TITLE_BY] = C.TITLE.split('　');
const titleCue = elTitle.querySelector('.cue'), titleInk = makeInk('inkT', 3);
const titleChars = artChars(document.getElementById('titleZh'), TITLE_ZH, [.74, .78, .74, .5, 1.18, 1.1], 77, TITLE_BY);
document.getElementById('titleEn').textContent = C.SUB_EN ? C.TITLE_EN : '';
const titleSeal = elTitle.querySelector('.seal'), titleEn = document.getElementById('titleEn');
const INK_HOLD = 0.4, INK_DUR = 1.05;                        // 晕开从每句结束前 0.25 秒开始，持续约 1 秒（会和下一句的开头叠一点）
const cues = VO.subs.map((sb, i) => {
  elSub.insertAdjacentHTML('beforeend', '<div class="cue"><div class="zh"></div><div class="en"></div></div>');
  const el = elSub.lastElementChild, zh = el.querySelector('.zh'), en = el.querySelector('.en');
  const chars = artChars(zh, sb[2], C.SUB_SIZES[i], i * 13 + 1, i === VO.subs.length - 1 ? C.SEAL : ''); en.textContent = C.SUB_EN ? sb[3] : '';
  return { el, en, chars, seal: zh.querySelector('.seal'), ink: makeInk('ink' + i, 11 + i * 7), sb, dur: i === VO.subs.length - 1 ? INK_DUR * 1.45 : INK_DUR };
});
let lastDip = -1;
const KP0 = V(-2.0, 3.1, 1.3), KP1 = V(-3.3, 1.05, -0.45), KC0 = new THREE.Color(0xfff0dc), KC1 = new THREE.Color(0xff9c4e);
const BG0 = new THREE.Color(0x04060a), BG1 = new THREE.Color(0x140b0b), BG2 = new THREE.Color(0x0a0810);
const FT0 = new THREE.Color(0xffffff), FT1 = new THREE.Color(0xf6cfa4), FT2 = new THREE.Color(0xb98f78), tint = new THREE.Color();
const SUN_C = new THREE.Color(), HC0 = new THREE.Color(0xfbf8f2), HC1 = new THREE.Color(0xf6d6b4);

function applyView() {
  let R = COVER;
  if (!R && FMT === '34') { const [cx, cy, w] = viewR, h = w * H / W; R = [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2]; }
  if (!R) return;
  const [x0, y0, x1, y1] = R, n = camera.near, top0 = n * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), r0 = top0 * 16 / 9;
  camera.projectionMatrix.makePerspective(r0 * (2 * x0 / 1920 - 1), r0 * (2 * x1 / 1920 - 1), top0 * (1 - 2 * y0 / 1080), top0 * (1 - 2 * y1 / 1080), n, camera.far);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
}
function update(t) {
  // 书
  const dip = smooth(ramp(t, FLIP_END - 0.05, FLIP_END + 0.7));
  if (dip !== lastDip) { blockR.userData.update(dip); blockL.userData.update(dip); lastDip = dip; }
  blockL.visible = t > FLIP0 + FLIP_DUR * 0.8;
  leaves.forEach(L => { L.grp.visible = t < FLIP_END + 0.02; if (L.grp.visible) setLeaf(L, t); });

  // 黄昏：主光从左上方慢慢落到左侧低处并变暖；念完以后天色再暗下去
  const dusk = smooth(ramp(t, MK.laoshu, MK.xiyang + 0.4)), night = smooth(ramp(t, VO.end + 0.2, C.DURATION + 1.5));
  const wind = smooth(ramp(t, T.wind, T.wind + 1.6));
  key.position.lerpVectors(KP0, KP1, dusk); key.color.lerpColors(KC0, KC1, dusk); key.intensity = lerp(2.7, 3.9, dusk) * (1 - 0.4 * night); key.angle = lerp(0.62, 0.55, dusk);
  hemi.intensity = lerp(1.05, 0.8, dusk) * (1 - 0.3 * night); hemi.color.lerpColors(HC0, HC1, dusk); rim.intensity = lerp(0.7, 0.3, dusk);
  scene.background.lerpColors(BG0, BG1, dusk).lerp(BG2, night); scene.fog.color.copy(scene.background);
  tint.lerpColors(FT0, FT1, dusk).lerp(FT2, night);
  const sunA = smooth(ramp(t, MK.hunya - 1.2, MK.xiyang));
  sun.position.set(SUN.x, lerp(0.36, 0.13, smooth(ramp(t, MK.hunya, MK.xiyang + 0.9))) - 0.2 * smooth(ramp(t, MK.xixia + 0.6, C.DURATION + 0.6)), SUN.z);
  sun.quaternion.copy(camera.quaternion); sun.material.uniforms.uA.value = sunA; sun.visible = sunA > 0;
  glow.material.uniforms.uA.value = sunA * (1 - 0.35 * night); glow.visible = sunA > 0;

  updateVines(t, wind);
  updateLeaves(t);
  streamMat.uniforms.uT.value = t; streamMat.uniforms.uP.value = easeOutCubic(ramp(t, T.stream, T.stream + 3.2));
  streamMat.uniforms.uSun.value.copy(SUN_C.lerpColors(FT0, KC1, dusk)); streamMat.uniforms.uLight.value = lerp(1, 0.74, dusk) * (1 - 0.25 * night);
  stream.visible = t > T.stream;
  roadMat.uniforms.uLight.value.copy(tint).multiplyScalar(lerp(1, 0.86, dusk) * (1 - 0.25 * night)); roadMat.uniforms.uP.value = lerp(ramp(t, T.road, T.road + 2.6), easeOutCubic(ramp(t, T.road, T.road + 2.6)), 0.6); road.visible = t > T.road;

  // 荧光笔
  const th = t + 0.08;
  hlGroups.forEach(G => {
    const HT = G.times; let hp = 0;
    if (th >= HT[HT.length - 1]) hp = 1;
    else if (th > HT[0]) { let k = 0; while (th >= HT[k + 1]) k++; hp = (k + (th - HT[k]) / Math.max(1e-3, HT[k + 1] - HT[k])) / (HT.length - 1); }
    G.lines.forEach(l => {
      const p = ramp(hp, l.from, l.to) * l.n, i = Math.min(l.n - 1, Math.floor(p));
      const x = lerp(l.cum[i], l.cum[i + 1], p - i) / l.cum[l.n];
      l.mesh.visible = p > 0; l.mesh.material.uniforms.uP.value = x;
    });
  });

  // 镜头与景深
  bokeh.uniforms.focus.value = cam(t); camera.updateMatrixWorld(); applyView();
  updateCutouts(t, tint, wind);
  updateBirds(t, tint);
  bokeh.uniforms.aperture.value = lerp(0.004, 0.0075, smooth(ramp(t, MK.kuteng - 0.5, MK.kuteng + 2)));
  bokeh.uniforms.maxblur.value = 0.0055;

  finalPass.uniforms.uFade.value = smooth(ramp(t, -0.3, 0.3)) * (1 - smooth(ramp(t, C.DURATION - 1.0, C.DURATION - 0.05)));
  finalPass.uniforms.uSeed.value = (t * 61.7) % 10; finalPass.uniforms.uWarm.value = dusk * 0.6;

  // 文字
  { const T1 = MK.kuteng - 2.5;                                // 标题：逐字写出 → 晕开
    titleCue.style.opacity = t < T1 + INK_DUR ? titleInk(titleCue, ramp(t, T1, T1 + INK_DUR)) : 0;
    titleChars.forEach((c, k) => artPose(c, ramp(t, 0.35 + k * 0.13, 0.75 + k * 0.13)));
    const p = ramp(t, 1.35, 1.65); titleSeal.style.opacity = p; titleSeal.style.transform = `scale(${1 + (1 - easeOutCubic(p)) * 0.5})`;
    titleEn.style.opacity = smooth(ramp(t, 0.9, 1.6)); }
  for (const c of cues) {
    const [a, b, , , ct] = c.sb, t0 = b - INK_HOLD, last = ct[ct.length - 1];
    if (t < a || t > t0 + c.dur) { c.el.style.opacity = 0; c.el.style.filter = 'none'; continue; }
    c.chars.forEach((ch, k) => artPose(ch, ramp(t, ct[k] - 0.08, ct[k] + 0.3)));
    if (c.seal) { const sp = ramp(t, last + 0.45, last + 0.7); c.seal.style.opacity = sp; c.seal.style.transform = `scale(${1 + (1 - easeOutCubic(sp)) * 0.5})`; }
    c.en.style.opacity = smooth(ramp(t, ct[0] + 0.25, ct[0] + 0.95));
    c.el.style.opacity = c.ink(c.el, ramp(t, t0, t0 + c.dur));
  }
  const S1 = VO.subs[VO.subs.length - 1][1] + INK_DUR * 1.45 - INK_HOLD;
  elShade.style.opacity = smooth(ramp(t, 0.2, 0.9)) * (1 - smooth(ramp(t, S1 - 0.6, S1 + 0.1))) * lerp(1, 0.7, dusk);
}

window.renderFrame = (frame) => { update(frame / C.FPS); composer.render(); };
window.TOTAL_FRAMES = Math.round(C.DURATION * C.FPS);
window.renderFrame(0);
if (QS0.get('sfu')) { const ff = new FontFace(QS0.get('sf'), `url(/assets/fonts/${QS0.get('sfu')})`); document.fonts.add(ff); await ff.load().catch(e => console.error('font', e)); }
await Promise.all(['400 80px ZhiMangXing', '700 80px "Xingkai SC"'].map(f => document.fonts.load(f, '秋思古道Aa').catch(() => 0)));
window.READY = true;

const qs = new URLSearchParams(location.search);
if (qs.has('t')) window.renderFrame(parseFloat(qs.get('t')) * C.FPS);
else if (!qs.has('still')) {
  const t0 = performance.now();
  const loop = () => { window.renderFrame((((performance.now() - t0) / 1000) % C.DURATION) * C.FPS); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}
