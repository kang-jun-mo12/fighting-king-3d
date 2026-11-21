// =====================================================================
//  격투왕 3D  -  Three.js 2인 대전 격투 게임
//  캐릭터 : 드래곤 워리어(Sketchfab) / 뮤턴트(Mixamo)
//  애니메이션 : Mixamo 모션캡처 29종 (드래곤은 실시간 리타겟)
//  맵 : Low Poly Lava Fighting Arena (Sketchfab, CC-BY)
//  이펙트 텍스처 : Kenney Particle Pack (CC0) + 직접 만든 셰이더
// =====================================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// ---------------- 상수 ----------------
const DT = 1 / 60;
const GRAV = 24;
const JUMP_VY = 7.5;
const ROUND_TIME = 60, WINS_NEEDED = 2, MAX_HP = 100;
const MAP_SCALE = 80;
let ARENA_R = 7;
const ANIM_NAMES = ['idle', 'walk_fwd', 'walk_back', 'strafe_left', 'strafe_right', 'jump', 'jab', 'cross', 'kick',
  'uppercut', 'air_kick', 'fireball', 'spin_kick', 'block', 'hit', 'hit_big', 'stagger', 'knockdown', 'getup',
  'victory', 'roar', 'taunt', 'fly', 'hard_land', 'spell_up', 'slam', 'dive', 'flex', 'falling',
  'run', 'low_kick', 'mid_kick', 'high_kick', 'spin_back', 'run_back', 'run_left', 'run_right'];
const TEX_NAMES = ['flame_02', 'fire_02', 'circle_05', 'magic_05', 'flame_03', 'fire_01', 'smoke_04', 'smoke_07', 'magic_02', 'magic_04', 'twirl_02', 'dirt_02',
  'star_06', 'flare_01', 'light_02', 'scorch_01', 'scorch_03', 'circle_03', 'symbol_01', 'symbol_02', 'muzzle_02'];

const V3 = THREE.Vector3, Q = THREE.Quaternion;
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
let RNG = Math.random;   // 온라인 대전 중 게임 계산(step) 동안에만 두 PC가 같은 씨앗의 난수를 씀
const rand = (a, b) => a + RNG() * (b - a);
const vrand = (a, b) => a + Math.random() * (b - a);   // 화면 · 소리 전용 (게임 결과에 영향 없음)
function makeRng(seed) {   // mulberry32
  let st = seed >>> 0;
  return () => { st = (st + 0x6D2B79F5) >>> 0; let t = st; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
const UP = new V3(0, 1, 0), DOWN = new V3(0, -1, 0);
const _v1 = new V3(), _v2 = new V3(), _v3 = new V3(), _v4 = new V3(), _q1 = new Q(), _q2 = new Q(), _q3 = new Q(), _s1 = new V3();
const TEX = {};

// =====================================================================
//  렌더러 / 장면 (선명하게 : 노출·안개·빛번짐 낮춤)
// =====================================================================
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
let PR = Math.min(devicePixelRatio, 1);
renderer.setPixelRatio(PR);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.88;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;   // 그림자는 2프레임에 한 번만 갱신

const scene = new THREE.Scene();
const BG = new THREE.Color(0x0a0204), BLACK = new THREE.Color(0);
scene.background = BG.clone();
scene.fog = new THREE.FogExp2(0x1a0604, 0.004);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 800);
camera.position.set(0, 4, 12);

const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth * PR, innerHeight * PR, { type: THREE.HalfFloatType, samples: 2 }));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.32, 0.35, 0.92);
composer.addPass(bloom);
composer.addPass(new OutputPass());
composer.setPixelRatio(PR);
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
});

const hemi = new THREE.HemisphereLight(0xffe2cc, 0x3a0d06, 0.5);
scene.add(hemi);
const keyLight = new THREE.DirectionalLight(0xfff3e6, 2.5);
keyLight.position.set(5, 14, 8); keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
Object.assign(keyLight.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 45 });
keyLight.shadow.bias = -0.0004; keyLight.shadow.normalBias = 0.03;
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0x6aa8ff, 2.0);
rimLight.position.set(-7, 6, -9); scene.add(rimLight);
const lavaLights = [];
for (let i = 0; i < 3; i++) {
  const l = new THREE.PointLight(0xff5a14, 25, 18, 2); const a = i / 3 * Math.PI * 2;
  l.position.set(Math.cos(a) * 9, -0.5, Math.sin(a) * 9); scene.add(l); lavaLights.push(l);
}
const LIGHT_BASE = { hemi: 0.5, key: 2.5 };
const LIGHT_POOL = [];
for (let i = 0; i < 6; i++) { const l = new THREE.PointLight(0xffffff, 0, 10, 2); l.position.set(0, -100, 0); scene.add(l); LIGHT_POOL.push({ l, life: 0, max: 1, inten: 0, follow: null }); }
function grabLight(color, intensity, dist, life, follow = null) {
  const s = LIGHT_POOL.reduce((a, b) => (b.life < a.life ? b : a));
  s.l.color.set(color); s.l.distance = dist; s.inten = intensity; s.life = s.max = life; s.follow = follow; return s;
}
function updateLights(dt) {
  for (const s of LIGHT_POOL) {
    if (s.life <= 0) { s.l.intensity = 0; s.follow = null; continue; }
    s.life -= dt; if (s.follow) s.l.position.copy(s.follow.position);
    s.l.intensity = s.follow ? s.inten : s.inten * Math.max(0, s.life / s.max);
  }
}
let darkK = 0, darkTarget = 0;

// =====================================================================
//  사운드 (WebAudio 즉석 합성)
// =====================================================================
const SFX_GROUPS = { swing: [10, 'wav'], hit: [5], hitheavy: [5], block: [4], metal: [4], rockhit: [5], step: [5], land: [4], explode: [5], bigboom: [2],
  fire: [5], charge: [5], plasma: [3], rockbreak: [3], rockfall: [5], glass: [3], slam: [5], explosion: [1], roar: [3], monster: [7], hurt: [5], grunt: [5], howl: [1], flap: [4] };
const SFX_VO = ['round_1', 'round_2', 'round_3', 'final_round', 'fight', 'winner', 'you_win', 'game_over', 'combo', 'flawless_victory', 'time', 'tie', 'prepare_yourself', 'ready'];
const sfx = {
  ctx: null, buf: {}, last: {},
  async load() {   // 효과음 파일 미리 디코딩 (Kenney · OpenGameArt CC0)
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const c = this.ctx;
    this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -14; this.comp.ratio.value = 4; this.comp.connect(c.destination);
    this.master = c.createGain(); this.master.gain.value = 0.75; this.master.connect(this.comp);
    const get = async url => { try { const r = await fetch(url); return await c.decodeAudioData(await r.arrayBuffer()); } catch (e) { console.warn('sfx', url, e); return null; } };
    const jobs = [];
    for (const [g, [n, ext = 'ogg']] of Object.entries(SFX_GROUPS)) { this.buf[g] = []; for (let i = 0; i < n; i++) jobs.push(get(`assets/sfx/${g}_${i}.${ext}`).then(b => b && this.buf[g].push(b))); }
    for (const v of SFX_VO) jobs.push(get(`assets/sfx/vo_${v}.ogg`).then(b => { if (b) this.buf['vo_' + v] = [b]; }));
    await Promise.all(jobs);
  },
  init() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  play(name, vol = 1, rate = 1, delay = 0) {
    const list = this.buf[name]; if (!this.ctx || !list || !list.length) return;
    const now = this.ctx.currentTime;
    if (!name.startsWith('vo_') && (this.last[name] || -1) > now - 0.035) return;   // 같은 소리가 한 프레임에 겹쳐 터지지 않게
    this.last[name] = now;
    const src = this.ctx.createBufferSource(); src.buffer = list[Math.floor(Math.random() * list.length)]; src.playbackRate.value = rate;
    const g = this.ctx.createGain(); g.gain.value = vol; src.connect(g); g.connect(this.master); src.start(now + delay);
  },
  tone(dur, f0, f1, gain, type = 'sine') {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  },
  whoosh(big) { this.play('swing', big ? 0.7 : 0.5, big ? vrand(0.7, 0.85) : vrand(0.95, 1.25)); },
  hit(heavy) { this.play(heavy ? 'hitheavy' : 'hit', heavy ? 1 : 0.85, vrand(0.9, 1.1)); if (heavy) { this.play('explode', 0.3, vrand(1.2, 1.4)); this.tone(0.25, 110, 40, 0.5); } },
  block() { this.play('block', 0.75, vrand(0.95, 1.1)); this.play('metal', 0.25, 1.4); },
  fire() { this.play('plasma', 0.45, vrand(0.75, 0.9)); this.play('fire', 0.7, 1.1); },
  flame() { this.play('fire', 0.4, vrand(0.85, 1.15)); },
  boom() { this.play('bigboom', 0.9, vrand(0.9, 1.05)); this.play('explode', 0.6, vrand(0.8, 1)); },
  crack() { this.play('rockbreak', 0.8, vrand(0.9, 1.1)); this.play('rockhit', 0.5); },
  rockHit() { this.play('rockhit', 0.45, vrand(0.8, 1.2)); },
  rumble() { this.play('rockfall', 0.75, 0.75); },
  slam() { this.play('slam', 0.9, 0.75); this.tone(0.4, 90, 30, 0.7); },
  roar(who) { if (who === 'dragon') this.play('monster', 1, vrand(0.7, 0.8)); else this.play('roar', 1, vrand(0.85, 1)); },
  whistle() { this.tone(0.6, 1500, 280, 0.06, 'triangle'); this.play('fire', 0.25, 1.6); },
  flap() { this.play('flap', 0.9, 0.55); this.play('swing', 0.35, 0.5); },
  breakGuard() { this.play('glass', 0.7); this.play('metal', 0.6, 0.8); },
  ult() { this.play('charge', 0.9, 0.8); this.play('bigboom', 0.5, 1.2); },
  step() { this.play('step', 0.3, vrand(0.85, 1.1)); },
  land(heavy) { this.play('land', heavy ? 0.85 : 0.5, vrand(0.8, 1)); },
  hurt(f, force) { if (!force && Math.random() < 0.45) return; if (f.voice === 'mech') this.play('grunt', 0.6, vrand(0.6, 0.7)); else this.play('hurt', 0.75, vrand(0.8, 0.95)); },
  vo(n) { this.play('vo_' + n, 1.15); },
};

// =====================================================================
//  이펙트 : 텍스처 파티클
// =====================================================================
const NOISE_GLSL = `
float hash3(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(hash3(i),hash3(i+vec3(1,0,0)),f.x),mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm(vec3 p){ float a=0.5, s=0.0; for(int i=0;i<4;i++){ s+=a*vnoise(p); p*=2.03; a*=0.5; } return s; }`;
const TP_VS = `
attribute float size; attribute float alpha; attribute float rot; attribute vec3 color;
varying vec3 vC; varying float vA; varying float vR; uniform float uScale;
void main(){ vC = color; vA = alpha; vR = rot; vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`;
const TP_FS = `
uniform sampler2D uTex; uniform float uAdd; varying vec3 vC; varying float vA; varying float vR;
void main(){ vec2 c = gl_PointCoord - 0.5; float s = sin(vR), co = cos(vR); c = mat2(co, -s, s, co) * c; vec2 uv = c + 0.5;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) discard;
  vec4 t = texture2D(uTex, vec2(uv.x, 1.0 - uv.y)); float a = t.a * vA; if (a < 0.004) discard;
  if (uAdd > 0.5) gl_FragColor = vec4(vC * t.rgb * a, 1.0); else gl_FragColor = vec4(vC * t.rgb, a); }`;

class Particles {
  constructor(max, tex, additive) {
    this.max = max; this.n = 0;
    const F = n => new Float32Array(n);
    this.pos = F(max * 3); this.vel = F(max * 3); this.col = F(max * 3);
    this.size = F(max); this.alpha = F(max); this.rot = F(max); this.spin = F(max);
    this.life = F(max); this.maxLife = F(max); this.s0 = F(max); this.s1 = F(max); this.drag = F(max); this.grav = F(max);
    const g = new THREE.BufferGeometry();
    const at = (n, a, s) => g.setAttribute(n, new THREE.BufferAttribute(a, s).setUsage(THREE.DynamicDrawUsage));
    at('position', this.pos, 3); at('color', this.col, 3); at('size', this.size, 1); at('alpha', this.alpha, 1); at('rot', this.rot, 1);
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 }, uTex: { value: tex }, uAdd: { value: additive ? 1 : 0 } },
      vertexShader: TP_VS, fragmentShader: TP_FS, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.points.renderOrder = additive ? 3 : 2;
    scene.add(this.points);
  }
  spawn(p, v, c, life, s0, s1 = 0, drag = 0.9, grav = 0, spin = 0) {
    if (this.n >= this.max) return;
    const i = this.n++, i3 = i * 3;
    this.pos[i3] = p.x; this.pos[i3 + 1] = p.y; this.pos[i3 + 2] = p.z;
    this.vel[i3] = v.x; this.vel[i3 + 1] = v.y; this.vel[i3 + 2] = v.z;
    this.col[i3] = c.r; this.col[i3 + 1] = c.g; this.col[i3 + 2] = c.b;
    this.life[i] = life; this.maxLife[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.drag[i] = drag; this.grav[i] = grav;
    this.size[i] = s0; this.alpha[i] = 0; this.rot[i] = Math.random() * 6.283; this.spin[i] = spin || vrand(-2, 2);
  }
  update(dt) {
    if (this.n === 0 && !this.lastN) return;
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.copy(this.n - 1, i); this.n--; i--; continue; }
      const i3 = i * 3, k = this.life[i] / this.maxLife[i], dr = Math.pow(this.drag[i], dt * 60);
      this.vel[i3] *= dr; this.vel[i3 + 1] = this.vel[i3 + 1] * dr - this.grav[i] * dt; this.vel[i3 + 2] *= dr;
      this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      this.size[i] = lerp(this.s1[i], this.s0[i], k);
      this.alpha[i] = Math.min(1, (1 - k) * 8) * Math.min(1, k * 1.8);
      this.rot[i] += this.spin[i] * dt;
    }
    this.geo.setDrawRange(0, this.n); this.lastN = this.n; this.points.visible = this.n > 0;
    for (const a of ['position', 'color', 'size', 'alpha', 'rot']) {
      const at = this.geo.attributes[a]; at.needsUpdate = true;
      if (at.clearUpdateRanges) { at.clearUpdateRanges(); at.addUpdateRange(0, Math.max(1, this.n) * at.itemSize); }
    }
  }
  copy(from, to) {
    const f3 = from * 3, t3 = to * 3;
    for (let k = 0; k < 3; k++) { this.pos[t3 + k] = this.pos[f3 + k]; this.vel[t3 + k] = this.vel[f3 + k]; this.col[t3 + k] = this.col[f3 + k]; }
    for (const a of ['size', 'alpha', 'rot', 'spin', 'life', 'maxLife', 's0', 's1', 'drag', 'grav']) this[a][to] = this[a][from];
  }
}
const P = {};
const C = (r, g, b) => new THREE.Color(r, g, b);
const COL = {
  spark: C(3.2, 2.1, 0.8), hot: C(2.8, 1.0, 0.25), fire: C(1.7, 0.55, 0.12), core: C(4, 3, 1.6), blue: C(0.6, 2.0, 4), cyan: C(0.7, 2.6, 3.4),
  purple: C(2.6, 0.9, 4), white: C(3, 3, 3), ember: C(2.4, 0.7, 0.15), smoke: C(0.16, 0.12, 0.1), dust: C(0.42, 0.33, 0.27), dirt: C(0.36, 0.26, 0.2),
  red: C(3.4, 0.4, 0.2), magma: C(3.2, 0.8, 0.1),
};
function sparks(p, c, n, speed = 9, life = 0.4, size = 0.22) {
  for (let i = 0; i < n; i++) { _v1.randomDirection().multiplyScalar(rand(0.3, 1) * speed); P.spark.spawn(p, _v1, c, rand(0.6, 1) * life, size * rand(0.6, 1.3), 0.02, 0.9, 9); }
}
function fireBurst(p, n, power = 1, c = COL.fire) {
  for (let i = 0; i < n; i++) {
    _v1.randomDirection().multiplyScalar(rand(1, 5) * power); _v1.y = Math.abs(_v1.y) * 1.2;
    (i % 2 ? P.fire : P.fire2).spawn(p, _v1, c, rand(0.35, 0.7), rand(0.5, 1.0) * power, rand(1.4, 2.4) * power, 0.88, -2, rand(-3, 3));
  }
}
function smokeBurst(p, n, size = 1.2, life = 1.1) {
  for (let i = 0; i < n; i++) { _v1.set(rand(-1, 1), rand(0.3, 1.2), rand(-1, 1)).multiplyScalar(2); P.smoke.spawn(p, _v1, COL.smoke, rand(0.7, 1) * life, size * 0.5, size * rand(1.4, 2.2), 0.92, -0.6, rand(-1, 1)); }
}
function dust(p, n, size = 0.9, spread = 2.4) {
  for (let i = 0; i < n; i++) { _v1.set(rand(-1, 1), rand(0.1, 0.7), rand(-1, 1)).multiplyScalar(spread); P.dust.spawn(p, _v1, COL.dust, rand(0.5, 1), size * 0.5, size * rand(1.2, 2), 0.9, -0.3, rand(-1.5, 1.5)); }
}

// 수명 있는 오브젝트 (링, 섬광, 조명, 데칼, 불기둥, 마법진)
const transients = [];
const GEO_CACHE = {};
const sharedGeo = (key, make) => { if (!GEO_CACHE[key]) { GEO_CACHE[key] = make(); GEO_CACHE[key].userData.shared = true; } return GEO_CACHE[key]; };
const PLANE_GEO = () => sharedGeo('plane', () => new THREE.PlaneGeometry(1, 1));
function addTransient(obj, life, update) { scene.add(obj); transients.push({ obj, life, max: life, update }); return obj; }
function spawnRing(p, color, { size = 2.2, life = 0.3, flat = false, width = 0.86 } = {}) {
  const m = new THREE.Mesh(sharedGeo('ring' + width, () => new THREE.RingGeometry(width, 1, 48)),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(0.3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  m.position.copy(p); if (flat) m.rotation.x = -Math.PI / 2;
  addTransient(m, life, k => { m.scale.setScalar(lerp(size, 0.15, k * k)); m.material.opacity = k; if (!flat) m.quaternion.copy(camera.quaternion); });
}
function spawnFlash(p, color, size = 2.5, life = 0.12, tex) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex || TEX.magic_05, color: new THREE.Color(color).multiplyScalar(0.7), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  s.position.copy(p); s.material.rotation = rand(0, 6.28);
  addTransient(s, life, k => { s.scale.setScalar(size * (1.3 - k * 0.3)); s.material.opacity = k; });
}
function spawnLight(p, color, intensity, dist, life) { grabLight(color, intensity, dist, life).l.position.copy(p); }
function decal(p, tex, size, life, { color = 0xffffff, additive = false, rot = rand(0, 6.28), opacity = 1, grow = 0 } = {}) {
  const m = new THREE.Mesh(PLANE_GEO(), new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.rotation.set(-Math.PI / 2, 0, rot); m.position.set(p.x, 0.02 + Math.random() * 0.01, p.z); m.renderOrder = 1;
  addTransient(m, life, k => { m.material.opacity = Math.min(1, k * 3) * opacity; m.scale.setScalar(size * (1 + grow * (1 - k))); });
  return m;
}
const pillarMat = (color, alpha) => new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uAlpha: { value: alpha }, uColor: { value: color } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: NOISE_GLSL + `uniform float uTime; uniform float uAlpha; uniform vec3 uColor; varying vec2 vUv;
    void main(){ float y = clamp(vUv.y, 0.0, 1.0);   // MSAA 가장자리에서 uv가 0~1을 살짝 벗어나면 pow(음수) = NaN → 블룸이 검은 네모로 번짐
      float n = fbm(vec3(vUv.x*7.0, y*3.0 - uTime*5.0, uTime*0.7));
      float shape = smoothstep(0.0, 0.12, y) * pow(max(1.0 - y, 0.0), 1.3);
      float k = shape * smoothstep(0.32, 0.78, n + (1.0 - y) * 0.25);
      vec3 col = mix(uColor, vec3(2.4, 1.5, 0.6), smoothstep(0.6, 0.92, n));
      gl_FragColor = vec4(col * k * uAlpha * 0.5, 1.0); }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
});
function firePillar(p, radius = 1.1, height = 5, life = 0.9, color = new THREE.Vector3(2.6, 0.6, 0.1)) {
  const g = new THREE.Group();
  for (const [r, h, a] of [[1, 1, 1], [0.55, 1.15, 0.8], [1.5, 0.7, 0.35]]) {
    const m = new THREE.Mesh(sharedGeo('cyl', () => new THREE.CylinderGeometry(0.75, 1, 1, 20, 1, true).translate(0, 0.5, 0)), pillarMat(color, a));
    m.scale.set(radius * r, height * h, radius * r); m.userData.a = a; g.add(m);
  }
  g.position.set(p.x, 0, p.z);
  let t = 0;
  addTransient(g, life, k => {
    t += SDT;
    g.children.forEach(m => { m.material.uniforms.uTime.value = t + m.userData.a; m.material.uniforms.uAlpha.value = Math.min(1, k * 2.5) * m.userData.a; });
    g.scale.set(1 + (1 - k) * 0.4, smooth(Math.min(1, (1 - k) * 6)), 1 + (1 - k) * 0.4); g.rotation.y += SDT * 2;
  });
}
function magicCircle(p, color) {
  const g = new THREE.Group();
  for (const [tex, s, sp] of [[TEX.symbol_01, 7, 0.6], [TEX.symbol_02, 5, -1], [TEX.magic_02, 9, 0.3]]) {
    const m = new THREE.Mesh(PLANE_GEO(), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(color).multiplyScalar(2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.scale.setScalar(s); m.userData.sp = sp; g.add(m);
  }
  g.position.copy(p); const ctl = { fade: false };
  let k = 0;
  addTransient(g, 4, () => { k = ctl.fade ? Math.max(0, k - SDT * 2) : Math.min(1, k + SDT * 2); g.children.forEach(m => { m.rotation.z += m.userData.sp * SDT; m.material.opacity = k; }); g.scale.setScalar(0.5 + k * 0.5); });
  return ctl;
}
function updateTransients(dt) {
  for (let i = transients.length - 1; i >= 0; i--) {
    const t = transients[i]; t.life -= dt;
    if (t.life <= 0) { scene.remove(t.obj); t.obj.traverse(o => { if (o.geometry && !o.isSprite && !o.geometry.userData.shared) o.geometry.dispose(); o.material && o.material.dispose(); }); transients.splice(i, 1); continue; }
    t.update(t.life / t.max);
  }
}
function makeCrackTex() {   // 바닥 균열 텍스처 (캔버스로 생성)
  const cv = document.createElement('canvas'); cv.width = cv.height = 512; const g = cv.getContext('2d');
  g.strokeStyle = '#fff'; g.lineCap = 'round'; g.shadowColor = '#fff'; g.shadowBlur = 10;
  const branch = (x, y, a, len, w, depth) => {
    if (depth > 4 || len < 8) return;
    let cx = x, cy = y; g.lineWidth = w; g.beginPath(); g.moveTo(cx, cy);
    for (let i = 0; i < 6; i++) { a += rand(-0.5, 0.5); cx += Math.cos(a) * len / 6; cy += Math.sin(a) * len / 6; g.lineTo(cx, cy); }
    g.stroke();
    for (let i = 0; i < (depth < 2 ? 2 : 1); i++) branch(cx, cy, a + rand(-0.9, 0.9), len * rand(0.45, 0.7), w * 0.65, depth + 1);
  };
  for (let i = 0; i < 9; i++) branch(256, 256, i / 9 * Math.PI * 2 + rand(-0.2, 0.2), rand(120, 200), 7, 0);
  return new THREE.CanvasTexture(cv);
}

// 바위 가시 / 파편
let ROCK_MAT = null, ROCK_GEO = null, DEBRIS = null;
const SPIKE_GEOS = [], spikes = [];
function makeSpikeGeo() {
  const g = new THREE.ConeGeometry(0.42, 1, 7, 4); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { if (p.getY(i) > 0.49) continue; p.setX(i, p.getX(i) + rand(-0.07, 0.07)); p.setZ(i, p.getZ(i) + rand(-0.07, 0.07)); p.setY(i, p.getY(i) + rand(-0.04, 0.04)); }
  g.translate(0, 0.5, 0); g.computeVertexNormals(); return g;
}
function rockSpike(p, height, { delay = 0, life = 1.1, tilt = 0.2, dir = null, onErupt = null } = {}) {
  if (!SPIKE_GEOS.length) for (let i = 0; i < 4; i++) SPIKE_GEOS.push(makeSpikeGeo());
  const m = new THREE.Mesh(SPIKE_GEOS[Math.floor(Math.random() * 4)], ROCK_MAT);
  m.scale.set(rand(0.8, 1.3), height, rand(0.8, 1.3));
  const tx = dir ? dir.z * tilt : rand(-tilt, tilt), tz = dir ? -dir.x * tilt : rand(-tilt, tilt);
  m.rotation.set(tx, rand(0, 6.28), tz); m.position.set(p.x, -height, p.z); m.visible = false;
  scene.add(m);
  spikes.push({ m, t: -delay, life, height, p: p.clone(), erupted: false, onErupt });
}
function updateSpikes(dt) {
  for (let i = spikes.length - 1; i >= 0; i--) {
    const s = spikes[i]; s.t += dt;
    if (s.t < 0) continue;
    if (!s.erupted) {
      s.erupted = true; s.m.visible = true;
      dust(s.p, 4, 1.0, 2.6); debris(s.p, 5, 5); decal(s.p, TEX.crack, rand(1.6, 2.4), 1.6, { color: 0xff6a20, additive: true });
      sparks(_v1.copy(s.p).setY(0.2), COL.magma, 6, 5, 0.4, 0.2);
      sfx.rockHit(); if (s.onErupt) s.onErupt(s);
    }
    const up = s.t < 0.1 ? smooth(s.t / 0.1) * 1.12 : (s.t < 0.18 ? lerp(1.12, 1, (s.t - 0.1) / 0.08) : 1);
    const down = s.t > s.life ? smooth((s.t - s.life) / 0.35) : 0;
    s.m.position.y = -s.height + s.height * up - s.height * 1.05 * down;
    if (s.t > s.life + 0.35) { scene.remove(s.m); spikes.splice(i, 1); }
  }
}
function clearSpikes() { for (const s of spikes) scene.remove(s.m); spikes.length = 0; }
function debris(p, n, power = 6) {
  for (let i = 0; i < n; i++) {
    const d = DEBRIS.free.pop(); if (d === undefined) return;
    const o = DEBRIS.items[d];
    o.p.set(p.x + rand(-0.3, 0.3), Math.max(0.1, p.y), p.z + rand(-0.3, 0.3));
    o.v.set(rand(-1, 1), rand(0.6, 1.4), rand(-1, 1)).multiplyScalar(power * rand(0.5, 1));
    o.r.set(rand(0, 6), rand(0, 6), rand(0, 6)); o.w.set(rand(-9, 9), rand(-9, 9), rand(-9, 9)); o.s = rand(0.5, 1.5); o.life = rand(1, 1.8);
  }
}
const _m4 = new THREE.Matrix4(), _e = new THREE.Euler();
function updateDebris(dt) {
  if (DEBRIS.free.length === DEBRIS.items.length && !DEBRIS.dirty) return;
  DEBRIS.dirty = DEBRIS.free.length !== DEBRIS.items.length;
  DEBRIS.items.forEach((o, i) => {
    if (o.life <= 0) { _m4.makeScale(0, 0, 0); DEBRIS.mesh.setMatrixAt(i, _m4); return; }
    o.life -= dt; o.v.y -= 20 * dt; o.p.addScaledVector(o.v, dt); o.r.addScaledVector(o.w, dt);
    if (o.p.y < 0.06) { o.p.y = 0.06; o.v.y *= -0.35; o.v.x *= 0.7; o.v.z *= 0.7; o.w.multiplyScalar(0.7); }
    const sc = o.s * Math.min(1, o.life * 3);
    _m4.compose(o.p, _q1.setFromEuler(_e.set(o.r.x, o.r.y, o.r.z)), _s1.set(sc, sc, sc)); DEBRIS.mesh.setMatrixAt(i, _m4);
    if (o.life <= 0) DEBRIS.free.push(i);
  });
  DEBRIS.mesh.instanceMatrix.needsUpdate = true;
}

// 팔다리 궤적 (리본 트레일)
const TRAIL_VS = `attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const TRAIL_FS = `uniform vec3 uColor; varying float vA; void main(){ gl_FragColor = vec4(uColor * vA * 1.5, 1.0); }`;
class Trail {
  constructor(color, n = 18, life = 0.16) {
    this.n = n; this.lifeMax = life; this.pts = [];
    this.posArr = new Float32Array(n * 6); this.aArr = new Float32Array(n * 2);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.posArr, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.aArr, 1).setUsage(THREE.DynamicDrawUsage));
    const idx = []; for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx); this.geo = g;
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: { uColor: { value: color } }, vertexShader: TRAIL_VS, fragmentShader: TRAIL_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.mesh.frustumCulled = false; scene.add(this.mesh);
  }
  push(a, b) { this.pts.unshift({ a: a.clone(), b: b.clone(), age: 0 }); if (this.pts.length > this.n) this.pts.pop(); }
  update(dt) {
    for (const p of this.pts) p.age += dt;
    while (this.pts.length && this.pts[this.pts.length - 1].age > this.lifeMax) this.pts.pop();
    const n = this.pts.length;
    for (let i = 0; i < n; i++) {
      const p = this.pts[i], k = Math.max(0, 1 - p.age / this.lifeMax) * (1 - i / this.n);
      p.a.toArray(this.posArr, i * 6); p.b.toArray(this.posArr, i * 6 + 3); this.aArr[i * 2] = k; this.aArr[i * 2 + 1] = k * 0.12;
    }
    this.geo.setDrawRange(0, Math.max(0, n - 1) * 6);
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.alpha.needsUpdate = true;
  }
}

// =====================================================================
//  로딩 / 리그
// =====================================================================
const manager = new THREE.LoadingManager();
manager.onProgress = (url, l, t) => { $('loadFill').style.width = (l / t * 100).toFixed(0) + '%'; $('loadText').textContent = `에셋 불러오는 중... ${l} / ${t}`; };
const gltfLoader = new GLTFLoader(manager), fbxLoader = new FBXLoader(manager), texLoader = new THREE.TextureLoader(manager);

function prepClip(fbx, name) {
  const clip = fbx.animations[0]; clip.name = name;
  clip.tracks = clip.tracks.filter(t => t.name.endsWith('.quaternion') || t.name === 'mixamorigHips.position');
  const hp = clip.tracks.find(t => t.name === 'mixamorigHips.position');
  if (hp) { const v = hp.values, x0 = v[0], z0 = v[2]; for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; } }
  return clip;
}
function prepModel(root) {
  const mats = [];
  root.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
    const one = !Array.isArray(o.material);
    const list = (one ? [o.material] : o.material).map(m => { const c = m.clone(); c.userData.baseColor = c.color ? c.color.clone() : null; mats.push(c); return c; });
    o.material = one ? list[0] : list;
  });
  return mats;
}
function baseName(n) { return n.replace(/_\d+$/, ''); }
function cleanDragon(root) {   // Rigify 리그에서 변형 뼈를 깔끔한 계층으로 다시 연결
  root.updateMatrixWorld(true);
  const used = new Set();
  root.traverse(o => {
    if (!o.isSkinnedMesh) return;
    const si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight, acc = {};
    for (let i = 0; i < si.count; i++) for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(i, k); if (w <= 0.01) continue;
      const nm = o.skeleton.bones[si.getComponent(i, k)].name; used.add(nm); acc[nm] = (acc[nm] || 0) + w;
    }
    const top = Object.entries(acc).sort((a, b) => b[1] - a[1])[0];
    if (top && /hand_sword|hand_gun/.test(top[0])) o.visible = false;
  });
  const byBase = {}; root.traverse(o => { if (o.isBone) byBase[baseName(o.name)] = o; });
  const B = n => byBase[n];
  const hips = B('DEF-spine'), chest = B('DEF-spine003'), head = B('DEF-spine006'), spine1 = B('DEF-spine001');
  const side = b => (b.match(/([LR])(\d{3})?$/) || [])[1] || 'L';
  const rule = b => {
    const s = side(b);
    if (/eye|brow|lid|ear|jaw|chin|nose|lip|cheek|tongue|forehead|temple|teeth/i.test(b)) return head;
    if (/Wing/.test(b)) return chest;
    if (/upper_arm|hand_shoulder/.test(b)) return B('DEF-shoulder' + s) || chest;
    if (/shoulder|Breast/.test(b)) return chest;
    if (/hand_sword|hand_gun|f_|palm/.test(b)) return B('DEF-hand' + s) || chest;
    if (/belly/.test(b)) return spine1;
    if (/r_|toe/.test(b)) return B('DEF-foot' + s) || hips;
    return hips;
  };
  const isDesc = (a, anc) => { let p = a; while (p) { if (p === anc) return true; p = p.parent; } return false; };
  const depth = o => { let d = 0; while (o.parent) { d++; o = o.parent; } return d; };
  const list = [...used].map(n => root.getObjectByName(n)).filter(b => b && b !== hips).sort((a, b) => depth(a) - depth(b));
  for (const b of list) {
    if (used.has(b.parent.name)) continue;
    let a = b.parent, target = null;
    while (a && a !== root) { if (used.has(a.name)) { target = a; break; } a = a.parent; }
    if (!target) target = rule(baseName(b.name));
    if (target && !isDesc(target, b)) target.attach(b);
  }
  root.updateMatrixWorld(true);
  return byBase;
}
const RT_MAP = [['Hips', 'DEF-spine'], ['Spine', 'DEF-spine001'], ['Spine1', 'DEF-spine002'], ['Spine2', 'DEF-spine003'], ['Neck', 'DEF-spine004'], ['Head', 'DEF-spine006']];
for (const [S, s] of [['Left', 'L'], ['Right', 'R']]) {
  RT_MAP.push([S + 'Shoulder', 'DEF-shoulder' + s, S + 'Arm', 'DEF-upper_arm' + s], [S + 'Arm', 'DEF-upper_arm' + s, S + 'ForeArm', 'DEF-forearm' + s],
    [S + 'ForeArm', 'DEF-forearm' + s, S + 'Hand', 'DEF-hand' + s], [S + 'Hand', 'DEF-hand' + s],
    [S + 'UpLeg', 'DEF-thigh' + s, S + 'Leg', 'DEF-shin' + s], [S + 'Leg', 'DEF-shin' + s, S + 'Foot', 'DEF-foot' + s], [S + 'Foot', 'DEF-foot' + s]);
}
const wpos = o => new V3().setFromMatrixPosition(o.matrixWorld);
const wquat = o => { const q = new Q(); o.matrixWorld.decompose(_v1, q, _s1); return q; };

class DirectRig {
  constructor(root) { this.root = root; this.mixer = new THREE.AnimationMixer(root); }
  bone(n) { return this.root.getObjectByName('mixamorig' + n); }
  update(dt) { this.mixer.update(dt); }
}
class RetargetRig {
  constructor(dstRoot, byBase, srcTemplate) {
    this.dst = dstRoot; this.byBase = byBase;
    this.src = SkeletonUtils.clone(srcTemplate);
    const meshes = []; this.src.traverse(o => { if (o.isMesh) meshes.push(o); }); meshes.forEach(m => m.parent.remove(m));
    this.src.updateMatrixWorld(true); dstRoot.updateMatrixWorld(true);
    const sb = n => this.src.getObjectByName('mixamorig' + n);
    this.pairs = RT_MAP.map(([s, d, sc, dc]) => {
      const S = sb(s), D = byBase[d];
      const qT0 = wquat(D); let rest = qT0.clone();
      if (sc) { const dS = wpos(sb(sc)).sub(wpos(S)).normalize(), dT = wpos(byBase[dc]).sub(wpos(D)).normalize(); rest = new Q().setFromUnitVectors(dT, dS).multiply(qT0); }
      return { S, D, qS0inv: wquat(S).invert(), rest, out: new Q() };
    });
    const mapped = new Map(this.pairs.map(p => [p.D, p]));
    this.hips = this.pairs[0].D; this.hipsParent = this.hips.parent; this.hipsParentQ = wquat(this.hipsParent);
    for (const p of this.pairs) {
      const chain = []; let o = p.D.parent;
      while (o !== this.hipsParent && !mapped.has(o)) { chain.push(o); o = o.parent; }
      p.anchor = o === this.hipsParent ? null : mapped.get(o); p.chain = chain.reverse();
    }
    this.srcHips0 = wpos(sb('Hips')); this.dstHips0 = wpos(this.hips);
    this.ratio = this.dstHips0.y / this.srcHips0.y;
    this.hipsParentInv = this.hipsParent.matrixWorld.clone().invert();
    this.mixer = new THREE.AnimationMixer(this.src);
    this.chestPair = this.pairs.find(p => p.D === byBase['DEF-spine003']);
    this.wings = ['L', 'R'].map(s => byBase['WingShoulder' + s]).filter(Boolean).map((b, i) => ({ b, rest: b.quaternion.clone(), sign: i === 0 ? 1 : -1 }));
    this.wingAngle = 0; this.wingSpread = 0;
  }
  bone(n) {
    const map = { LeftHand: 'DEF-handL', RightHand: 'DEF-handR', LeftFoot: 'DEF-footL', RightFoot: 'DEF-footR', LeftForeArm: 'DEF-forearmL',
      RightForeArm: 'DEF-forearmR', LeftLeg: 'DEF-shinL', RightLeg: 'DEF-shinR', Spine2: 'DEF-spine003', Head: 'DEF-spine006', Hips: 'DEF-spine' };
    return this.byBase[map[n]];
  }
  update(dt) {
    this.mixer.update(dt); this.src.updateMatrixWorld(true);
    for (const p of this.pairs) {
      p.S.matrixWorld.decompose(_v1, _q1, _s1);
      p.out.multiplyQuaternions(_q1, p.qS0inv).multiply(p.rest);
      _q3.copy(p.anchor ? p.anchor.out : this.hipsParentQ);
      for (const c of p.chain) _q3.multiply(c.quaternion);
      p.D.quaternion.copy(_q3.invert().multiply(p.out));
    }
    _v2.setFromMatrixPosition(this.pairs[0].S.matrixWorld).sub(this.srcHips0).multiplyScalar(this.ratio).add(this.dstHips0).applyMatrix4(this.hipsParentInv);
    this.hips.position.copy(_v2);
    if (this.chestPair) for (const w of this.wings) {   // 날갯짓 : 몸 앞뒤 축 기준 위아래 회전 + 펼치기
      const co = this.chestPair.out;
      _q1.setFromAxisAngle(_v1.set(0, 0, 1), w.sign * this.wingAngle);
      _q2.setFromAxisAngle(_v1.set(0, 1, 0), -w.sign * this.wingSpread);
      w.b.quaternion.copy(co).invert().multiply(_q1).multiply(_q2).multiply(co).multiply(w.rest);
    }
  }
}
class Animator {
  constructor(mixer, clips) { this.mixer = mixer; this.actions = {}; for (const c of clips) this.actions[c.name] = mixer.clipAction(c); this.cur = null; this.curName = ''; }
  play(name, { loop = true, fade = 0.12, speed = 1, start = 0 } = {}) {
    const a = this.actions[name], prev = this.cur;
    if (prev === a) a.stop();
    a.reset(); a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); a.clampWhenFinished = !loop;
    a.setEffectiveTimeScale(speed); a.setEffectiveWeight(1); a.time = start; a.play();
    if (prev && prev !== a) a.crossFadeFrom(prev, fade, false);
    this.cur = a; this.curName = name; return a;
  }
  loco(name, speed = 1, fade = 0.15) {
    if (this.curName === name && this.cur.isRunning()) { this.cur.setEffectiveTimeScale(speed); return; }
    this.play(name, { loop: true, fade, speed });
  }
  get time() { return this.cur ? this.cur.time : 0; }
  set speed(s) { if (this.cur) this.cur.setEffectiveTimeScale(s); }
}
function analyzeClips(template, clips) {
  const rig = SkeletonUtils.clone(template); const mixer = new THREE.AnimationMixer(rig);
  const g = n => rig.getObjectByName('mixamorig' + n);
  const hips = g('Hips'), effs = { LeftHand: g('LeftHand'), RightHand: g('RightHand'), LeftFoot: g('LeftFoot'), RightFoot: g('RightFoot') };
  const info = {};
  for (const clip of clips) {
    const act = mixer.clipAction(clip); act.play();
    const S = [];
    for (let t = 0; t <= clip.duration + 1e-4; t += 1 / 60) {
      act.time = t; mixer.update(0); rig.updateMatrixWorld(true);
      const h = wpos(hips), e = {}; for (const k in effs) e[k] = wpos(effs[k]); S.push({ t, h, e });
    }
    act.stop(); mixer.uncacheAction(clip);
    let best = -1e9, eff = 'RightHand', peak = 0;
    for (const s of S) for (const k in s.e) { const v = (s.e[k].z - s.h.z) + 0.35 * (s.e[k].y - s.h.y) * (k.includes('Hand') ? 0.6 : 1); if (v > best) { best = v; eff = k; peak = s.t; } }
    const ys = S.map(s => s.h.y), minY = Math.min(...ys), maxY = Math.max(...ys), iMax = ys.indexOf(maxY), iMin = ys.indexOf(minY), base = ys[0];
    let takeoff = 0, land = clip.duration, lying = clip.duration, rise = 0, stand = clip.duration;
    for (let i = 0; i < iMax; i++) if (ys[i] > base + (maxY - base) * 0.2) { takeoff = S[i].t; break; }
    for (let i = iMax; i < S.length; i++) if (ys[i] < base + (maxY - base) * 0.2) { land = S[i].t; break; }
    for (let i = 0; i < S.length; i++) if (ys[i] < minY + (base - minY) * 0.12) { lying = S[i].t; break; }
    for (let i = iMin; i < S.length; i++) if (ys[i] > minY + (maxY - minY) * 0.15) { rise = S[i].t; break; }
    for (let i = iMin; i < S.length; i++) if (ys[i] > minY + (maxY - minY) * 0.92) { stand = S[i].t; break; }
    let handHi = -1e9, hold = clip.duration * 0.4;
    for (const s of S) { if (s.t > clip.duration * 0.75) break; const v = s.e.LeftHand.y + s.e.RightHand.y; if (v > handHi) { handHi = v; hold = s.t; } }
    info[clip.name] = { dur: clip.duration, eff, peak, takeoff, land, lying, rise, stand, hold, tMin: S[iMin].t, tMax: S[iMax].t };
  }
  return info;
}

// =====================================================================
//  기본기
// =====================================================================
const MOVES = {
  jab:      { clip: 'jab',      startup: 0.10, active: 0.07, recover: 0.20, dmg: 5,  hitstun: 0.32, blockstun: 0.16, knock: 2.2, reach: 1.35, lunge: 2.6, next: 'cross', nextK: 'mid_kick' },
  cross:    { clip: 'cross',    startup: 0.13, active: 0.07, recover: 0.24, dmg: 6,  hitstun: 0.36, blockstun: 0.18, knock: 2.6, reach: 1.45, lunge: 2.8, next: 'uppercut', nextK: 'high_kick' },
  uppercut: { clip: 'uppercut', startup: 0.15, active: 0.08, recover: 0.30, dmg: 8,  hitstun: 0.5,  blockstun: 0.2,  knock: 1.6, reach: 1.3,  lunge: 2.4, launch: 6.2, next: 'kick', nextK: 'high_kick' },
  low_kick:  { clip: 'low_kick',  startup: 0.12, active: 0.07, recover: 0.22, dmg: 6,  hitstun: 0.34, blockstun: 0.17, knock: 2.0, reach: 1.55, lunge: 2.4, next: 'cross', nextK: 'mid_kick', kick: true },
  mid_kick:  { clip: 'mid_kick',  startup: 0.15, active: 0.08, recover: 0.26, dmg: 8,  hitstun: 0.42, blockstun: 0.2,  knock: 3.2, reach: 1.65, lunge: 2.4, next: 'uppercut', nextK: 'high_kick', kick: true },
  high_kick: { clip: 'high_kick', startup: 0.18, active: 0.08, recover: 0.30, dmg: 9,  hitstun: 0.5,  blockstun: 0.22, knock: 2.0, reach: 1.7,  lunge: 2.2, launch: 6.0, next: 'kick', nextK: 'spin_back', kick: true },
  spin_back: { clip: 'spin_back', startup: 0.22, active: 0.09, recover: 0.45, dmg: 13, hitstun: 0.6,  blockstun: 0.28, knock: 7.5, reach: 1.85, lunge: 2.6, launch: 4.5, knockdown: true, heavy: true, kick: true },
  kick:     { clip: 'kick',     startup: 0.22, active: 0.09, recover: 0.42, dmg: 12, hitstun: 0.6,  blockstun: 0.26, knock: 6.5, reach: 1.8,  lunge: 2.2, launch: 4.5, knockdown: true, heavy: true },
  air_kick: { clip: 'air_kick', startup: 0.12, active: 0.22, recover: 0.25, dmg: 9,  hitstun: 0.45, blockstun: 0.2,  knock: 4.0, reach: 1.6,  air: true },
};
let CI = null;
function finalizeMoves() {
  for (const k in MOVES) {
    const m = MOVES[k], ci = CI[m.clip];
    m.eff = ci.eff; m.t0 = Math.max(0, ci.peak - 0.42);
    m.speed1 = clamp((ci.peak - m.t0) / m.startup, 0.8, 4);
    m.speed2 = clamp((Math.min(ci.dur, ci.peak + 0.6) - ci.peak) / (m.active + m.recover), 0.6, 2.6);
  }
}

// =====================================================================
//  캐릭터
// =====================================================================
const KEYS = {
  p1: { left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'], guard: ['Tab'], attack: ['KeyE'], kick: ['Space'], run: ['ShiftLeft'], s0: ['KeyR'], s1: ['KeyF'], s2: ['KeyQ'], ult: ['KeyT'] },
  p2: { left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'], guard: ['Digit7', 'Numpad7'], attack: ['Digit8', 'Numpad8'], kick: ['Digit1', 'Numpad1'], run: ['Digit0', 'Numpad0', 'ShiftRight'],
    s0: ['Digit9', 'Numpad9'], s1: ['Digit4', 'Numpad4'], s2: ['Digit5', 'Numpad5'], ult: ['Digit6', 'Numpad6'] },
};
const KEY_LABEL = { p1: ['R', 'F', 'Q', 'T'], p2: ['9', '4', '5', '6'] };
let frame = 0;
const camRight = new V3(1, 0, 0), camFwd = new V3(0, 0, -1);
const _fwdTmp = new V3();

class Fighter {
  constructor(o) {
    Object.assign(this, o);
    this.group = new THREE.Group(); this.holder = new THREE.Group();
    this.group.add(this.holder); this.holder.add(this.model); scene.add(this.group);
    this.anim = new Animator(this.rig.mixer, o.clips);
    this.pos = new V3(); this.vel = new V3(); this.yaw = 0; this.wins = 0;
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.66, 0.74, 48),
      new THREE.MeshBasicMaterial({ color: this.color.clone().multiplyScalar(1.4), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2; scene.add(this.ring);
    this.trailHand = new Trail(this.color.clone().multiplyScalar(1.3));
    this.trailFoot = new Trail(this.color.clone().multiplyScalar(1.3));
    this.effBones = {};
    for (const n of ['LeftHand', 'RightHand', 'LeftFoot', 'RightFoot', 'LeftForeArm', 'RightForeArm', 'LeftLeg', 'RightLeg', 'Spine2', 'Head', 'Hips'])
      this.effBones[n] = this.rig.bone(n);
    this.cds = [0, 0, 0];
    this.reset(0);
  }
  get fwd() { return _fwdTmp.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  fwdNew() { return new V3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  get airborne() { return this.pos.y > 0.01 || this.vel.y > 0; }
  effPos(name, out = new V3()) { return out.setFromMatrixPosition(this.effBones[name].matrixWorld); }
  chest(out = new V3()) { return out.set(this.pos.x, this.pos.y + this.height * 0.62, this.pos.z); }
  reset(x) {
    this.pos.set(x, 0, 0); this.vel.set(0, 0, 0);
    this.yaw = x < 0 ? Math.PI / 2 : -Math.PI / 2;
    this.hp = MAX_HP; this.shownHp = MAX_HP; this.cds = [0, 0, 0]; this.meter = 0;
    this.combo = 0; this.comboTimer = 0; this.atkBuf = 0; this.kickBuf = 0; this.stepT = 0; this.comboVo = false; this.skBuf = -1; this.skBufT = 0; this.jumpBuf = 0; this.lastUpTap = -999;
    this.airUsed = false; this.invuln = 0; this.flashT = 0; this.knockdownFlag = false; this.noGrav = false; this.wingFlap = 0;
    this.move = null; this.sk = null; this.state = 'idle'; this.t = 0;
    this.setHidden(false);
    this.anim.play('idle', { fade: 0 });
  }
  setHidden(h) { this.hidden = h; this.model.visible = !h; this.ring.visible = !h; }
  setState(s) { this.state = s; this.t = 0; this.hasHit = false; }
  toNeutral() { this.noGrav = false; this.sk = null; this.setState('idle'); this.anim.loco('idle', 1, 0.18); }
  faceOpp(opp, rate) {
    const want = Math.atan2(opp.pos.x - this.pos.x, opp.pos.z - this.pos.z), d = angDiff(this.yaw, want);
    this.yaw += rate == null ? d : clamp(d, -rate * SDT, rate * SDT);
  }
  gainMeter(v) { this.meter = Math.min(100, this.meter + v); }

  update(inp, opp) {
    const dt = SDT;
    for (let i = 0; i < 3; i++) this.cds[i] = Math.max(0, this.cds[i] - dt);
    this.comboTimer = Math.max(0, this.comboTimer - dt); this.invuln = Math.max(0, this.invuln - dt);
    if (this.shownHp > this.hp) this.shownHp = Math.max(this.hp, this.shownHp - 30 * dt);
    this.atkBuf = inp.attack ? 0.2 : Math.max(0, this.atkBuf - dt);
    this.kickBuf = inp.kick ? 0.2 : Math.max(0, this.kickBuf - dt);
    const skp = inp.s0 ? 0 : inp.s1 ? 1 : inp.s2 ? 2 : inp.ult ? 3 : -1;
    if (skp >= 0) { this.skBuf = skp; this.skBufT = 0.12; } else { this.skBufT = Math.max(0, this.skBufT - dt); if (this.skBufT === 0) this.skBuf = -1; }
    this.jumpBuf = Math.max(0, this.jumpBuf - dt);
    if (inp.upTap) { if (frame - this.lastUpTap <= 15) { this.jumpBuf = 0.1; this.lastUpTap = -999; } else this.lastUpTap = frame; }
    this.t += dt;
    const grounded = !this.airborne;
    this.wingFlap = Math.max(0, this.wingFlap - dt);

    switch (this.state) {
      case 'idle': case 'walk': case 'run': this.neutral(inp, opp); break;
      case 'guard':
        this.faceOpp(opp, 14); this.vel.x = this.vel.z = 0;
        if (this.anim.time >= CI.block.hold) this.anim.speed = 0;
        if (!inp.guard) this.toNeutral();
        break;
      case 'jump':
        if ((this.atkBuf > 0 || this.kickBuf > 0) && !this.airUsed) { this.atkBuf = this.kickBuf = 0; this.airUsed = true; this.startMove('air_kick'); }
        else if (this.trySkill(true)) { /* 공중 스킬 */ }
        else if (grounded && this.t > 0.1) { dust(this.pos, 4); sfx.land(); this.toNeutral(); }
        break;
      case 'attack': this.updateAttack(inp, opp); break;
      case 'skill': this.sk.def.update(this, opp, this.sk); break;
      case 'hitstun': if (this.t >= this.stun && grounded) this.toNeutral(); break;
      case 'air':
        if (grounded && this.t > 0.08) { dust(this.pos, 8, 1.1); sfx.land(true); shake = Math.max(shake, 0.12); if (this.knockdownFlag || this.hp <= 0) this.goDown(); else this.toNeutral(); }
        break;
      case 'blockstun': if (this.t >= this.stun) { if (inp.guard) this.setState('guard'); else this.toNeutral(); } break;
      case 'guardbreak': if (this.t >= this.stun) this.toNeutral(); break;
      case 'down': if (this.hp > 0 && this.t >= 1.05) this.getUp(); break;
      case 'getup': if (this.t >= this.getupTime) { this.invuln = 0.35; this.toNeutral(); } break;
    }
    if (this.airborne && !this.noGrav) this.vel.y -= GRAV * dt;
    if (grounded && /hitstun|blockstun|guardbreak|down|getup|ko|victory/.test(this.state)) { const f = Math.pow(0.86, dt * 60); this.vel.x *= f; this.vel.z *= f; }
    this.pos.addScaledVector(this.vel, dt);
    if (this.pos.y <= 0) { this.pos.y = 0; if (this.vel.y < 0) this.vel.y = 0; }
    const r = Math.hypot(this.pos.x, this.pos.z);
    if (r > ARENA_R) { this.pos.x *= ARENA_R / r; this.pos.z *= ARENA_R / r; }
  }

  trySkill(air) {
    if (this.skBuf < 0) return false;
    const i = this.skBuf;
    if (i === 3) { if (this.meter < 100 || air) return false; this.skBuf = -1; this.meter = 0; startUlt(this); return true; }
    const def = this.skills[i];
    if (this.cds[i] > 0 || (air && !def.air)) return false;
    this.skBuf = -1; this.cds[i] = def.cd;
    this.setState('skill'); this.sk = { def, air, flags: {} };
    this.faceOpp(G.opp(this));
    def.start(this, G.opp(this), this.sk);
    return true;
  }

  neutral(inp, opp) {
    this.faceOpp(opp, 14); this.airUsed = false;
    const dash = this.state === 'run' && this.runFwd;
    if (this.atkBuf > 0) { this.atkBuf = 0; this.startMove(dash ? 'cross' : 'jab'); return; }
    if (this.kickBuf > 0) { this.kickBuf = 0; this.startMove(dash ? 'spin_back' : 'low_kick'); return; }
    if (this.trySkill(false)) return;
    if (inp.guard) {
      this.vel.set(0, 0, 0); this.setState('guard');
      this.anim.play('block', { loop: false, fade: 0.08, start: Math.max(0, CI.block.hold - 0.18), speed: 1.4 });
      return;
    }
    const a = _v3.set(opp.pos.x - this.pos.x, 0, opp.pos.z - this.pos.z).normalize();
    const net = inp.fIn !== undefined;   // 온라인 : 보내기 전에 이미 '앞/뒤 · 왼/오른쪽'으로 바꿔 둔 입력
    const screenSign = Math.sign(a.dot(camRight)) || 1;
    const fIn = net ? inp.fIn : ((inp.right ? 1 : 0) - (inp.left ? 1 : 0)) * screenSign;
    const sIn = net ? inp.sIn : (inp.up ? 1 : 0) - (inp.down ? 1 : 0);
    const tan = _v2.set(-a.z, 0, a.x); if (!net && tan.dot(camFwd) < 0) tan.negate();
    if (this.jumpBuf > 0) {
      this.jumpBuf = 0; this.vel.set(a.x * fIn * 3.6, JUMP_VY, a.z * fIn * 3.6); this.pos.y = 0.001; this.setState('jump');
      const ci = CI.jump, air = 2 * JUMP_VY / GRAV;
      this.anim.play('jump', { loop: false, fade: 0.06, start: Math.max(0, ci.takeoff - 0.05), speed: clamp((ci.land - ci.takeoff) / air, 0.6, 3) });
      dust(this.pos, 5); sfx.whoosh(); if (this.wings) { this.wingFlap = 0.5; sfx.flap(); }
      return;
    }
    if (inp.run && (fIn !== 0 || sIn !== 0)) {   // 달리기 : 앞·뒤·옆 어느 방향이든
      const d = Math.hypot(opp.pos.x - this.pos.x, opp.pos.z - this.pos.z);
      const fsp = fIn > 0 ? (d > 1.15 ? 6.6 : 2.5) : 5.4, ssp = 5.6, diag = fIn !== 0 && sIn !== 0 ? 0.75 : 1;
      this.vel.x = (a.x * fIn * fsp + tan.x * sIn * ssp) * diag; this.vel.z = (a.z * fIn * fsp + tan.z * sIn * ssp) * diag;
      const right = _v1.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
      const clip = fIn > 0 ? 'run' : fIn < 0 ? 'run_back' : (tan.dot(right) * sIn > 0 ? 'run_right' : 'run_left');
      this.anim.loco(clip, 1.15, 0.12); this.state = 'run'; this.runFwd = fIn > 0;
      this.stepT -= SDT; if (this.stepT <= 0) { this.stepT = 0.27; sfx.step(); dust(this.pos, 1, 0.7, 1.5); }
      return;
    }
    const sp = fIn > 0 ? 3.1 : 2.5;
    this.vel.x = a.x * fIn * sp + tan.x * sIn * 2.8; this.vel.z = a.z * fIn * sp + tan.z * sIn * 2.8;
    if (sIn !== 0) { const right = _v1.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw)); this.anim.loco(tan.dot(right) * sIn > 0 ? 'strafe_right' : 'strafe_left', 1.35); this.state = 'walk'; }
    else if (fIn !== 0) { this.anim.loco(fIn > 0 ? 'walk_fwd' : 'walk_back', 1.3); this.state = 'walk'; }
    else { this.anim.loco('idle', 1); this.state = 'idle'; }
  }

  startMove(name) {
    const m = MOVES[name];
    this.lungeMul = this.state === 'run' && this.runFwd ? 2.3 : 1;
    this.move = m; this.setState('attack'); this.chainReq = false; this.sped = false; this.whooshed = false;
    this.anim.play(m.clip, { loop: false, fade: 0.06, start: m.t0, speed: m.speed1 });
    if (!m.air) this.faceOpp(G.opp(this));
  }
  updateAttack(inp, opp) {
    const m = this.move, f = this.fwdNew();
    if (!this.sped && this.t >= m.startup) { this.anim.speed = m.speed2; this.sped = true; }
    if (!this.whooshed && this.t >= m.startup * 0.5) { sfx.whoosh(m.kick || m.heavy); this.whooshed = true; }
    if (!m.air) { const l = this.t < m.startup + 0.03 ? m.lunge * this.lungeMul : 0; this.vel.x = f.x * l; this.vel.z = f.z * l; }
    const trail = m.eff.includes('Foot') ? this.trailFoot : this.trailHand;
    if (this.t > m.startup * 0.35 && this.t < m.startup + m.active + 0.05) {
      const tip = this.effPos(m.eff), base = this.effPos(m.eff.replace('Hand', 'ForeArm').replace('Foot', 'Leg'));
      trail.push(tip, base.lerp(tip, 0.45));
    }
    if (!this.hasHit && this.t >= m.startup - 0.02 && this.t <= m.startup + m.active && inStrike(this, opp, m.reach, 0.62))
      this.hasHit = applyHit(this, opp, m, this.effPos(m.eff));
    if (!this.chainReq && this.atkBuf > 0 && m.next && this.t > 0.03) { this.chainReq = m.next; this.atkBuf = 0; }
    if (!this.chainReq && this.kickBuf > 0 && m.nextK && this.t > 0.03) { this.chainReq = m.nextK; this.kickBuf = 0; }
    if (this.chainReq && this.t >= m.startup + m.active * 0.6 + (this.hasHit ? 0 : 0.1)) { this.startMove(this.chainReq); return; }
    if (m.air && !this.airborne && this.t > 0.05) { dust(this.pos, 4); this.toNeutral(); return; }
    if (this.t >= m.startup + m.active + m.recover) {
      if (this.airborne) { this.setState('jump'); this.anim.play('jump', { loop: false, fade: 0.15, start: CI.jump.land - 0.3, speed: 0.6 }); } else this.toNeutral();
    }
  }
  goDown() {
    this.setState('down'); this.vel.y = 0;
    if (this.anim.curName !== 'knockdown') this.anim.play('knockdown', { loop: false, fade: 0.1, start: Math.max(0, CI.knockdown.lying - 0.35), speed: 1 });
  }
  getUp() {
    this.setState('getup');
    const ci = CI.getup, start = Math.max(0, ci.rise - 0.35), speed = 2.2;
    this.getupTime = Math.min(1.3, (ci.stand - start) / speed);
    this.anim.play('getup', { loop: false, fade: 0.2, start, speed }); this.invuln = this.getupTime + 0.3;
  }
  updateVisual(animDt) {
    if (this.rig.wings) {   // 드래곤 날개 : 평소엔 살짝, 날 때는 크게 펄럭임
      const flying = this.wingFlap > 0 || (this.pos.y > 0.6 && /skill|cine/.test(this.state));
      this.rig.wingSpread = lerp(this.rig.wingSpread, flying ? 0.35 : 0.05, 0.15);
      this.rig.wingAngle = flying ? 0.25 + Math.sin(G.time * 13) * 0.55 : Math.sin(G.time * 1.6) * 0.06;
    }
    this.rig.update(animDt);
    this.group.position.copy(this.pos); this.group.rotation.y = this.yaw;
    this.ring.position.set(this.pos.x, 0.03, this.pos.z); this.ring.material.opacity = 0.42 / (1 + this.pos.y * 0.8);
    if (this.flashT > 0) {
      this.flashT -= animDt || SDT;
      const on = this.flashT > 0 && Math.floor(this.flashT * 60) % 2 === 0;
      for (const m of this.mats) if (m.userData.baseColor) m.color.copy(m.userData.baseColor).multiplyScalar(on ? 5 : 1);
    }
    this.trailHand.update(animDt); this.trailFoot.update(animDt);
  }
  flash(t = 0.1) { this.flashT = t; }
}

// 공격 판정 / 피격 처리
function inStrike(att, def, reach, width) {
  if (def.hidden) return false;
  const dx = def.pos.x - att.pos.x, dz = def.pos.z - att.pos.z, f = att.fwd;
  const along = dx * f.x + dz * f.z, lat = Math.abs(dx * f.z - dz * f.x), dy = def.pos.y - att.pos.y;
  return along > 0 && along < reach + 0.45 && lat < width && dy < 1.5 && dy > -1.7;
}
function applyHit(att, def, h, point, dirOverride) {
  if (def.invuln > 0 || def.hidden || /ko|down|getup|cine/.test(def.state)) return false;
  const toAtt = _v1.set(att.pos.x - def.pos.x, 0, att.pos.z - def.pos.z).normalize();
  const facing = def.fwd.dot(toAtt) > 0.2;
  const guarding = (def.state === 'guard' || def.state === 'blockstun') && facing;
  const f = dirOverride ? dirOverride.clone() : att.fwdNew();
  const p = point ? point.clone().lerp(def.chest(), 0.35) : def.chest();
  if (guarding && h.guardBreak) {
    def.hp -= h.chip || 0; def.setState('guardbreak'); def.stun = 1.0;
    def.anim.play('stagger', { loop: true, fade: 0.08, start: 0.2, speed: 1.4 });
    def.vel.set(f.x * 6, 0, f.z * 6);
    sparks(p, COL.purple, 40, 11, 0.5, 0.3); spawnRing(p, COL.purple, { size: 2.4, life: 0.35 }); spawnFlash(p, COL.purple, 2.6, 0.12, TEX.star_06);
    floatText(p, 'GUARD BREAK!', '#e48bff'); hitStop = 0.14; shake = 0.35; sfx.breakGuard(); screenFlash(0.16);
  } else if (guarding) {
    def.hp -= h.chip || 0; def.setState('blockstun'); def.stun = h.blockstun || 0.2;
    def.vel.set(f.x * (h.knock || 3) * 0.55, 0, f.z * (h.knock || 3) * 0.55);
    sparks(p, COL.blue, 16, 7, 0.3, 0.2); spawnRing(p, COL.blue, { size: 1.4, life: 0.2 }); spawnFlash(p, COL.blue, 1.6, 0.08, TEX.magic_05);
    hitStop = 0.05; shake = Math.max(shake, 0.06); sfx.block(); def.gainMeter(2);
  } else {
    if (/hitstun|air/.test(def.state) && att.comboTimer > 0) att.combo++; else { att.combo = 1; att.comboVo = false; }
    if (att.combo >= 5 && !att.comboVo) { att.comboVo = true; sfx.vo('combo'); }
    sfx.hurt(def, !!h.heavy);
    att.comboTimer = 1.1; def.noGrav = false; def.sk = null;
    const dmg = Math.max(1, Math.round(h.dmg * Math.max(0.5, 1 - (att.combo - 1) * 0.07)));
    def.hp -= dmg; def.flash(0.1); att.gainMeter(dmg * 1.3); def.gainMeter(dmg * 0.9);
    const launched = h.launch || def.airborne;
    if (launched) {
      def.setState('air'); def.knockdownFlag = !!h.knockdown;
      def.vel.set(f.x * (h.knock || 3), h.launch || 3.5, f.z * (h.knock || 3)); def.pos.y = Math.max(def.pos.y, 0.02);
      if (h.knockdown) def.anim.play('knockdown', { loop: false, fade: 0.06, start: 0, speed: Math.max(1, CI.knockdown.lying / 0.65) });
      else def.anim.play('hit_big', { loop: false, fade: 0.05, start: 0, speed: 1.1 });
    } else {
      def.setState('hitstun'); def.stun = h.hitstun;
      def.vel.set(f.x * (h.knock || 2), 0, f.z * (h.knock || 2));
      def.anim.play(h.heavy ? 'hit_big' : 'hit', { loop: false, fade: 0.04, start: 0, speed: h.heavy ? 1.2 : 1.5 });
    }
    hitFx(p, !!h.heavy, h.fxColor);
    hitStop = Math.max(hitStop, h.heavy ? 0.12 : 0.06); shake = Math.max(shake, h.heavy ? 0.3 : 0.1);
  }
  if (def.hp <= 0) koFx(def, f, p);
  return true;
}
function hitFx(p, heavy, color) {
  const col = color || (heavy ? COL.hot : COL.spark);
  sparks(p, col, heavy ? 36 : 18, heavy ? 12 : 8, heavy ? 0.45 : 0.32, heavy ? 0.32 : 0.22);
  spawnFlash(p, col, heavy ? 2.6 : 1.6, heavy ? 0.12 : 0.08, TEX.star_06);
  spawnFlash(p, col, heavy ? 1.8 : 1.1, 0.1, TEX.muzzle_02);
  spawnRing(p, col, { size: heavy ? 2.1 : 1.3, life: heavy ? 0.26 : 0.18, width: 0.9 });
  if (heavy) { spawnLight(p, 0xff7a2a, 25, 10, 0.25); fireBurst(p, 8, 0.6); fovKick = Math.max(fovKick, 3.5); }
  sfx.hit(heavy);
}
function koFx(def, f, p) {
  sfx.hurt(def, true);
  def.hp = 0; def.setState('ko'); def.knockdownFlag = true; def.noGrav = false; def.setHidden(false);
  def.vel.set(f.x * 7, 6, f.z * 7); def.pos.y = Math.max(def.pos.y, 0.02);
  def.anim.play('knockdown', { loop: false, fade: 0.05, start: 0, speed: 1.1 });
  hitStop = 0.35; shake = 0.6; sfx.boom(); screenFlash(0.25); fovKick = 7;
  sparks(p, COL.hot, 70, 16, 0.7, 0.35); spawnRing(p, COL.hot, { size: 3.4, life: 0.5, width: 0.9 }); fireBurst(p, 20, 1.2);
}
function aoeHit(att, center, radius, h, maxY = 1.3) {   // 범위 공격
  const def = G.opp(att);
  if (def.pos.y > maxY || Math.hypot(def.pos.x - center.x, def.pos.z - center.z) > radius) return false;
  const dir = new V3(def.pos.x - center.x, 0, def.pos.z - center.z); if (dir.lengthSq() < 1e-4) dir.copy(att.fwd); dir.normalize();
  return applyHit(att, def, h, def.chest(), dir);
}

// =====================================================================
//  투사체 (플라즈마 / 운석)
// =====================================================================
const projectiles = [];
const orbMat = () => new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 } },
  vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vP = position; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`,
  fragmentShader: NOISE_GLSL + `uniform float uTime; varying vec3 vN; varying vec3 vV; varying vec3 vP;
    void main(){ float fr = 1.0 - abs(dot(normalize(vN), normalize(vV))); float n = fbm(vP * 6.0 + vec3(0.0, -uTime*6.0, uTime*2.0));
      vec3 c = mix(vec3(3.2, 0.9, 0.2), vec3(4.0, 3.4, 2.2), smoothstep(0.35, 0.8, n)) * (0.55 + n) + vec3(3.0, 1.2, 0.3) * fr * fr * 1.5;
      gl_FragColor = vec4(c, 1.0); }`,
  blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
});
function spawnPlasma(owner, p, vy) {
  const grp = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.3, 28, 18), orbMat());
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.circle_05, color: 0xff8a3a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  glow.scale.setScalar(2.0);
  const rune = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.magic_04, color: 0xffb060, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 }));
  rune.scale.setScalar(1.3);
  grp.add(core, glow, rune); grp.position.copy(p); scene.add(grp);
  const f = owner.fwdNew();
  projectiles.push({ kind: 'plasma', owner, grp, core, glow, rune, vel: new V3(f.x * 13, vy * 13, f.z * 13), age: 0, light: grabLight(0xff6a1a, 40, 12, 99, grp) });
  sfx.fire(); spawnFlash(p, COL.hot, 2.2, 0.12, TEX.muzzle_02); spawnRing(p, COL.hot, { size: 1.6, life: 0.2 });
}
function spawnMeteor(owner, target, delay = 0) {
  const start = target.clone().add(new V3(rand(-3, 3), 16, rand(-3, 3)));
  const grp = new THREE.Group();
  const rock = new THREE.Mesh(ROCK_GEO, ROCK_MAT); rock.scale.setScalar(rand(0.9, 1.4));
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.circle_05, color: 0xff6a20, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  glow.scale.setScalar(1.6);
  grp.add(rock, glow); grp.position.copy(start); grp.visible = false; scene.add(grp);
  const travel = 0.55;
  decal(target, TEX.circle_03, 2.6, delay + travel + 0.1, { color: 0xff3010, additive: true, grow: -0.4 });
  const pr = { kind: 'meteor', owner, grp, rock, vel: target.clone().sub(start).divideScalar(travel), age: -delay, travel, target: target.clone() };
  projectiles.push(pr); return pr;
}
function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const pr = projectiles[i]; pr.age += dt;
    if (pr.age < 0) continue;
    const p = pr.grp.position;
    let dead = false;
    if (pr.kind === 'plasma') {
      p.addScaledVector(pr.vel, dt); pr.core.material.uniforms.uTime.value = pr.age;
      pr.glow.scale.setScalar(1.9 + Math.sin(pr.age * 40) * 0.2); pr.rune.material.rotation += dt * 9;
      _v2.copy(pr.vel).multiplyScalar(-0.12);
      for (let k = 0; k < 2; k++) { _v1.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(0.7).add(_v2); P.fire.spawn(p, _v1, COL.fire, 0.3, 0.7, 0.15, 0.9, -1, rand(-4, 4)); }
      if (frame % 2 === 0) P.spark.spawn(p, _v1.randomDirection().multiplyScalar(2), COL.core, 0.3, 0.18, 0.02, 0.9, 2);
      const def = G.opp(pr.owner);
      const hitDef = !def.hidden && Math.hypot(def.pos.x - p.x, def.pos.z - p.z) < 0.75 && p.y > def.pos.y - 0.2 && p.y < def.pos.y + def.height + 0.2;
      dead = pr.age > 2.5 || Math.hypot(p.x, p.z) > ARENA_R + 10;
      if (hitDef && applyHit(pr.owner, def, { dmg: 13, chip: 3, hitstun: 0.45, blockstun: 0.25, knock: 5, heavy: true }, p)) dead = true;
      if (p.y < 0.15) dead = true;
      if (dead) {
        fireBurst(p, 22, 1); sparks(p, COL.hot, 30, 12, 0.5, 0.3); spawnRing(p, COL.hot, { size: 2.2, life: 0.3, width: 0.9 });
        spawnFlash(p, COL.hot, 2.6, 0.12, TEX.star_06); smokeBurst(p, 6, 1.2); spawnLight(p, 0xff6a1a, 30, 10, 0.3);
        if (p.y < 1) decal(p, TEX.scorch_01, 2.2, 3, { color: 0x000000, opacity: 0.7 });
      }
    } else if (pr.kind === 'meteor') {
      if (!pr.grp.visible) { pr.grp.visible = true; sfx.whistle(); }
      p.addScaledVector(pr.vel, dt); pr.rock.rotation.x += dt * 8; pr.rock.rotation.z += dt * 5;
      for (let k = 0; k < 3; k++) { _v1.set(rand(-0.5, 0.5), rand(-0.5, 0.5), rand(-0.5, 0.5)).addScaledVector(pr.vel, -0.08); P.fire.spawn(p, _v1, COL.fire, 0.35, 0.9, 0.3, 0.92, -1, rand(-4, 4)); }
      if (frame % 2 === 0) P.smoke.spawn(p, _v1.set(0, 0.5, 0), COL.smoke, 0.8, 0.5, 1.4, 0.95, -0.4);
      if (pr.age >= pr.travel) {
        dead = true; p.copy(pr.target).setY(0.1);
        fireBurst(p, 26, 1.2); debris(p, 10, 7); dust(p, 6, 1.4); sparks(p, COL.hot, 20, 12, 0.5, 0.3);
        spawnRing(_v1.copy(p).setY(0.06), COL.hot, { size: 3.2, life: 0.4, flat: true, width: 0.8 });
        decal(p, TEX.scorch_03, 2.6, 4, { color: 0x000000, opacity: 0.8 }); decal(p, TEX.crack, 2.4, 1.8, { color: 0xff5a10, additive: true });
        spawnLight(p, 0xff5a10, 40, 12, 0.35); shake = Math.max(shake, 0.25); sfx.boom();
        if (pr.onHit) pr.onHit(p);
      }
    }
    if (dead) { if (pr.light) { pr.light.life = 0; pr.light.follow = null; } scene.remove(pr.grp); projectiles.splice(i, 1); }
  }
}
function clearProjectiles() { for (const p of projectiles) { scene.remove(p.grp); if (p.light) { p.light.life = 0; p.light.follow = null; } } projectiles.length = 0; }

// 잔상 (뮤턴트 돌진)
const ghosts = [];
function makeGhosts(f, n) {
  for (let i = 0; i < n; i++) {
    const wrap = new THREE.Group(); wrap.matrixAutoUpdate = false; wrap.visible = false;
    const clone = SkeletonUtils.clone(f.model);
    const mat = new THREE.MeshBasicMaterial({ color: f.color.clone().multiplyScalar(1.4), transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false });
    clone.traverse(o => { if (o.isMesh) { o.material = mat; o.castShadow = false; o.frustumCulled = false; } });
    wrap.add(clone); scene.add(wrap);
    const srcB = [], dstB = []; f.model.traverse(o => { if (o.isBone) srcB.push(o); }); clone.traverse(o => { if (o.isBone) dstB.push(o); });
    ghosts.push({ owner: f, wrap, mat, srcB, dstB, life: 0 });
  }
}
function spawnGhost(f) {
  const g = ghosts.filter(x => x.owner === f).sort((a, b) => a.life - b.life)[0]; if (!g) return;
  f.holder.updateMatrixWorld(true); g.wrap.matrix.copy(f.holder.matrixWorld); g.wrap.matrixWorldNeedsUpdate = true;
  for (let i = 0; i < g.srcB.length; i++) { g.dstB[i].position.copy(g.srcB[i].position); g.dstB[i].quaternion.copy(g.srcB[i].quaternion); }
  g.life = 0.28; g.wrap.visible = true;
}
function updateGhosts(dt) { for (const g of ghosts) { if (g.life <= 0) continue; g.life -= dt; g.mat.opacity = Math.max(0, g.life / 0.28) * 0.22; if (g.life <= 0) g.wrap.visible = false; } }

// =====================================================================
//  스킬
// =====================================================================
const once = (sk, key) => { if (sk.flags[key]) return false; sk.flags[key] = true; return true; };
const handsMid = f => f.effPos('RightHand').lerp(f.effPos('LeftHand'), 0.5);
function endSkill(f) { f.noGrav = false; if (f.airborne) { f.sk = null; f.setState('jump'); } else f.toNeutral(); }

const SK_PLASMA = {   // 드래곤 R : 플라즈마 기공파
  name: '플라즈마 기공파', cd: 3, air: true,
  start(f, opp, sk) {
    const ci = CI.fireball, t0 = Math.max(0, ci.peak - 0.6);
    f.anim.play('fireball', { loop: false, fade: 0.08, start: t0, speed: (ci.peak - t0) / 0.3 });
    if (sk.air) { f.vel.set(f.vel.x * 0.3, 0, f.vel.z * 0.3); f.noGrav = true; f.wingFlap = 0.6; } else f.vel.set(0, 0, 0);
  },
  update(f, opp, sk) {
    if (sk.air) { if (f.t < 0.5) f.vel.y = 0; else f.noGrav = false; }
    if (f.t < 0.3) {
      const hp = handsMid(f);
      for (let i = 0; i < 3; i++) { _v1.randomDirection().multiplyScalar(1.0); P.magic.spawn(_v2.copy(hp).add(_v1), _v1.multiplyScalar(-3.2), COL.hot, 0.3, 0.35, 0.05, 1, 0, 6); }
      if (frame % 3 === 0) spawnFlash(hp, COL.hot, 0.8 + f.t * 3, 0.06, TEX.magic_05);
    } else if (once(sk, 'fire')) spawnPlasma(f, handsMid(f), sk.air ? -0.5 : 0);
    if (sk.air && !f.airborne && f.t > 0.45) { f.toNeutral(); return; }
    if (f.t >= 0.72) endSkill(f);
  },
};
const SK_BREATH = {   // 드래곤 F : 드래곤 브레스
  name: '드래곤 브레스', cd: 5, air: true,
  start(f, opp, sk) {
    f.anim.play('roar', { loop: false, fade: 0.1, start: 0.55, speed: 1.25 }); f.vel.set(0, 0, 0); sfx.roar('dragon');
    if (sk.air) { f.noGrav = true; f.wingFlap = 1.5; }
    sk.tick = 0;
  },
  update(f, opp, sk) {
    if (sk.air) f.vel.y = 0;
    const fw = f.fwdNew(), mouth = f.effPos('Head').addScaledVector(fw, 0.35); mouth.y -= 0.08;
    if (f.t < 0.25) {
      for (let i = 0; i < 2; i++) { _v1.randomDirection().multiplyScalar(0.7); P.fire.spawn(_v2.copy(mouth).add(_v1), _v1.multiplyScalar(-2.5), COL.fire, 0.25, 0.3, 0.05, 1, 0, 5); }
    } else if (f.t < 1.05) {
      f.faceOpp(opp, 1.6);
      const down = sk.air ? -0.35 : -0.08;
      for (let i = 0; i < 3; i++) {
        const sp = rand(9, 13), s = 0.17;
        _v1.set(fw.x + rand(-s, s), down + rand(-s, s) * 0.6, fw.z + rand(-s, s)).normalize().multiplyScalar(sp);
        (i % 2 ? P.fire : P.fire2).spawn(mouth, _v1, i % 3 ? COL.fire : COL.hot, rand(0.35, 0.5), 0.2, rand(1.0, 1.6), 0.95, -1.5, rand(-5, 5));
      }
      if (frame % 2 === 0) P.smoke.spawn(_v2.copy(mouth).addScaledVector(fw, 3.5), _v1.set(rand(-1, 1), 1.2, rand(-1, 1)), COL.smoke, 1, 0.8, 2, 0.95, -0.5);
      if (frame % 4 === 0) spawnLight(_v2.copy(mouth).addScaledVector(fw, 1.5), 0xff6a1a, 30, 9, 0.12);
      if (frame % 10 === 0) sfx.flame();
      if (frame % 9 === 0) decal(_v2.copy(f.pos).addScaledVector(fw, rand(1.5, 4.2)), TEX.scorch_01, rand(1.2, 2), 3, { color: 0x000000, opacity: 0.55 });
      shake = Math.max(shake, 0.05);
      sk.tick -= SDT;
      if (sk.tick <= 0) {
        sk.tick = 0.12;
        const dx = opp.pos.x - f.pos.x, dz = opp.pos.z - f.pos.z, dist = Math.hypot(dx, dz);
        const ang = Math.acos(clamp((dx * fw.x + dz * fw.z) / Math.max(dist, 1e-3), -1, 1)), last = f.t > 0.93, dy = opp.pos.y - f.pos.y;
        if (dist < 4.8 && ang < 0.36 && dy < 2.2 && dy > -4.5)
          applyHit(f, opp, { dmg: 3, chip: 1, hitstun: 0.28, blockstun: 0.16, knock: last ? 4 : 1.2, launch: last ? 3.5 : 0, fxColor: COL.fire }, opp.chest());
      }
    }
    if (f.t >= 1.35) endSkill(f);
  },
};
const SK_DIVE = {   // 드래곤 Q : 천공 강하
  name: '천공 강하', cd: 6, air: true,
  start(f, opp, sk) {
    f.noGrav = true; f.vel.set(0, 0, 0); f.wingFlap = 3;
    f.anim.play('fly', { loop: true, fade: 0.15, speed: 1.2 });
    sk.phase = sk.air ? 1 : 0; sk.pt = 0;
    if (!sk.air) { dust(f.pos, 14, 1.4, 4); spawnRing(_v1.copy(f.pos).setY(0.05), COL.white, { size: 3, life: 0.35, flat: true }); }
    sfx.flap(); sfx.whoosh();
  },
  update(f, opp, sk) {
    sk.pt += SDT;
    if (sk.phase === 0) {   // 이륙
      f.vel.set(0, (4.6 - f.pos.y) * 6, 0); f.wingFlap = 1;
      if (frame % 2 === 0) P.twirl.spawn(_v1.copy(f.pos).add(_v2.set(rand(-1, 1), 0.3, rand(-1, 1))), _v2.set(0, 3, 0), COL.white, 0.4, 0.6, 1.6, 0.9, 0, 8);
      if (frame % 14 === 0) sfx.flap();
      if (sk.pt > 0.45) { sk.phase = 1; sk.pt = 0; }
    } else if (sk.phase === 1) {   // 조준
      f.vel.set(0, 0, 0); f.faceOpp(opp, 10); f.wingFlap = 1;
      const c = f.chest();
      for (let i = 0; i < 3; i++) { _v1.randomDirection().multiplyScalar(1.3); P.fire.spawn(_v2.copy(c).add(_v1), _v1.multiplyScalar(-1.5), COL.fire, 0.3, 0.5, 0.1, 0.95, 0, 4); }
      if (sk.pt > 0.3) {
        sk.phase = 2; sk.pt = 0;
        sk.target = opp.pos.clone().addScaledVector(opp.vel, 0.15); sk.target.y = 0;
        const d = sk.target.clone().sub(f.pos); sk.dir = d.clone().normalize(); sk.travel = d.length() / 19;
        f.anim.play('hard_land', { loop: false, fade: 0.1, start: 0, speed: clamp(CI.hard_land.tMin / (sk.travel + 0.05), 0.5, 4) });
        f.faceOpp(opp); sfx.fire();
        decal(sk.target, TEX.circle_03, 3.4, sk.travel + 0.2, { color: 0xff4010, additive: true, grow: -0.5 });
      }
    } else if (sk.phase === 2) {   // 불꽃 다이브
      f.vel.copy(sk.dir).multiplyScalar(19);
      const c = f.chest();
      for (let i = 0; i < 5; i++) { _v1.set(rand(-0.6, 0.6), rand(-0.6, 0.6), rand(-0.6, 0.6)).addScaledVector(f.vel, -0.15); P.fire.spawn(_v2.copy(c).addScaledVector(_v1, 0.2), _v1, COL.fire, 0.35, 1.0, 0.3, 0.9, 0, 5); }
      f.trailFoot.push(f.effPos('RightFoot'), f.effPos('LeftFoot'));
      if (f.pos.y <= 0.05 || sk.pt > 1.2) {
        sk.phase = 3; sk.pt = 0; f.pos.y = 0; f.vel.set(0, 0, 0); f.noGrav = false;
        const p = f.pos.clone();
        firePillar(p, 1.3, 6, 1.0); fireBurst(_v1.copy(p).setY(0.5), 40, 1.6); debris(p, 28, 9); dust(p, 16, 1.6, 5);
        spawnRing(_v1.copy(p).setY(0.08), COL.hot, { size: 6, life: 0.5, flat: true, width: 0.78 });
        spawnRing(_v1.copy(p).setY(0.1), COL.white, { size: 4, life: 0.3, flat: true, width: 0.9 });
        decal(p, TEX.scorch_03, 5, 5, { color: 0x000000, opacity: 0.85 }); decal(p, TEX.crack, 5.5, 2.5, { color: 0xff5010, additive: true });
        for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + rand(-0.3, 0.3); rockSpike(new V3(p.x + Math.cos(a) * 1.7, 0, p.z + Math.sin(a) * 1.7), rand(0.8, 1.3), { delay: 0.03 * i, life: 0.7, tilt: 0.45, dir: new V3(Math.cos(a), 0, Math.sin(a)) }); }
        spawnLight(_v1.copy(p).setY(1), 0xff5010, 90, 16, 0.6); shake = 0.6; fovKick = 6; sfx.boom(); sfx.crack(); screenFlash(0.12);
        aoeHit(f, p, 2.5, { dmg: 18, chip: 5, hitstun: 0.7, blockstun: 0.35, knock: 7, launch: 7, knockdown: true, heavy: true });
        f.anim.play('hard_land', { loop: false, fade: 0.05, start: Math.max(0, CI.hard_land.tMin - 0.05), speed: 1.2 });
      }
    } else if (sk.pt > 0.6) f.toNeutral();
  },
};
const SK_SPIN = {   // 뮤턴트 9 : 광폭 회오리킥
  name: '광폭 회오리킥', cd: 4, air: true,
  start(f, opp, sk) { f.anim.play('spin_kick', { loop: false, fade: 0.06, start: 0, speed: CI.spin_kick.dur / (sk.air ? 0.7 : 0.95) }); f.vel.set(0, sk.air ? 1.5 : 0, 0); sfx.play('charge', 0.6, 1.3); },
  sfxT: 0,
  update(f, opp, sk) {
    const dt = SDT, fw = f.fwdNew(), dashStart = sk.air ? 0.1 : 0.2, dashEnd = sk.air ? 0.9 : 0.68;
    if (f.t < dashStart) { f.vel.x *= 0.8; f.vel.z *= 0.8; }
    else if (f.t < dashEnd && !sk.landed) {
      if (!f.hasHit) { const want = Math.atan2(opp.pos.x - f.pos.x, opp.pos.z - f.pos.z); f.yaw += clamp(angDiff(f.yaw, want), -4 * dt, 4 * dt); }
      const sp = f.hasHit ? 1.5 : (sk.air ? 9 : 10.5);
      f.vel.x = fw.x * sp; f.vel.z = fw.z * sp; if (sk.air) f.vel.y = -8;
      if (frame % 3 === 0) spawnGhost(f);
      if (frame % 9 === 0) sfx.whoosh(true);
      const c = f.chest();
      for (let i = 0; i < 2; i++) { const a = G.time * 25 + i * Math.PI; P.twirl.spawn(_v1.set(c.x + Math.cos(a) * 0.9, c.y + rand(-0.6, 0.4), c.z + Math.sin(a) * 0.9), _v2.set(0, 0.5, 0), COL.cyan, 0.25, 0.9, 1.4, 0.9, 0, 14); }
      if (frame % 2 === 0 && !f.airborne) dust(f.pos, 1, 0.7, 2);
      f.trailFoot.push(f.effPos('RightFoot'), f.effPos('RightLeg').lerp(f.effPos('RightFoot'), 0.45));
      if (!f.hasHit && inStrike(f, opp, 1.35, 0.85))
        f.hasHit = applyHit(f, opp, { dmg: 16, chip: 5, hitstun: 0.7, knock: 8, launch: 5.5, knockdown: true, heavy: true, guardBreak: true, fxColor: COL.cyan }, f.effPos('RightFoot'));
      if (sk.air && !f.airborne) { sk.landed = true; f.t = dashEnd; dust(f.pos, 10, 1.2); shake = Math.max(shake, 0.25); spawnRing(_v1.copy(f.pos).setY(0.05), COL.cyan, { flat: true, size: 3, life: 0.35 }); }
    } else { f.vel.x *= 0.82; f.vel.z *= 0.82; }
    if (f.t >= dashEnd + 0.32) endSkill(f);
  },
};
const SK_QUAKE = {   // 뮤턴트 4 : 대지 균열
  name: '대지 균열', cd: 5, air: false,
  start(f, opp, sk) {
    const ci = CI.slam, t0 = Math.max(0, ci.tMin - 0.75); sk.impactT = 0.5;
    f.anim.play('slam', { loop: false, fade: 0.08, start: t0, speed: clamp((ci.tMin - t0) / sk.impactT, 0.6, 3) });
    f.vel.set(0, 0, 0); sk.dir = f.fwdNew();
  },
  update(f, opp, sk) {
    if (f.t < sk.impactT) {
      const c = f.chest(); _v1.randomDirection().multiplyScalar(1.2);
      P.magic.spawn(_v2.copy(c).add(_v1), _v1.multiplyScalar(-2), COL.red, 0.3, 0.4, 0.05, 1, 0, 5);
    } else if (once(sk, 'impact')) {
      const p = f.pos.clone().addScaledVector(sk.dir, 0.9);
      spawnRing(_v1.copy(p).setY(0.06), COL.magma, { size: 4.5, life: 0.4, flat: true, width: 0.8 });
      decal(p, TEX.crack, 3.5, 2.5, { color: 0xff5010, additive: true }); decal(p, TEX.scorch_03, 3, 4, { color: 0x000000, opacity: 0.7 });
      debris(p, 18, 8); dust(p, 12, 1.4, 4); sparks(_v1.copy(p).setY(0.3), COL.magma, 20, 9, 0.5, 0.28);
      spawnLight(_v1.copy(p).setY(0.8), 0xff4a10, 60, 12, 0.4); shake = 0.45; sfx.slam(); sfx.crack(); fovKick = 4;
      for (let i = 0; i < 9; i++) {
        const sp = p.clone().addScaledVector(sk.dir, 1.0 + i * 0.85).add(new V3(rand(-0.2, 0.2), 0, rand(-0.2, 0.2)));
        rockSpike(sp, rand(1.3, 2.1) * (1 + i * 0.04), { delay: 0.05 + i * 0.065, life: 0.75, tilt: 0.3, dir: sk.dir,
          onErupt: s => {
            if (!f.hasHit && Math.hypot(opp.pos.x - s.p.x, opp.pos.z - s.p.z) < 0.95 && opp.pos.y < 1.3)
              f.hasHit = applyHit(f, opp, { dmg: 15, chip: 4, hitstun: 0.7, blockstun: 0.3, knock: 3, launch: 8.5, knockdown: true, heavy: true, fxColor: COL.magma }, opp.chest(), sk.dir);
          } });
      }
    }
    if (f.t >= sk.impactT + 0.65) f.toNeutral();
  },
};
const SK_BURROW = {   // 뮤턴트 5 : 지하 습격
  name: '지하 습격', cd: 6, air: false,
  start(f, opp, sk) { f.anim.play('dive', { loop: false, fade: 0.08, start: 0.25, speed: 1.7 }); f.vel.set(0, 0, 0); sk.phase = 0; sk.pt = 0; sk.lastCrack = f.pos.clone(); },
  update(f, opp, sk) {
    sk.pt += SDT;
    if (sk.phase === 0) {
      const fw = f.fwdNew(); f.vel.set(fw.x * 3, 0, fw.z * 3);
      if (sk.pt > 0.32) {
        sk.phase = 1; sk.pt = 0; f.setHidden(true); f.invuln = 9; f.vel.set(0, 0, 0);
        debris(f.pos, 16, 7); dust(f.pos, 14, 1.4, 4); decal(f.pos, TEX.scorch_03, 2.4, 2.5, { color: 0x000000, opacity: 0.85 });
        decal(f.pos, TEX.crack, 2.6, 1.5, { color: 0xff5010, additive: true }); sfx.crack(); sfx.rumble(); shake = 0.3;
      }
    } else if (sk.phase === 1) {   // 땅속 이동
      const want = Math.atan2(opp.pos.x - f.pos.x, opp.pos.z - f.pos.z); f.yaw += clamp(angDiff(f.yaw, want), -6 * SDT, 6 * SDT);
      const fw = f.fwdNew(); f.vel.set(fw.x * 8, 0, fw.z * 8);
      if (frame % 2 === 0) { dust(f.pos, 2, 0.9, 2.2); P.dirt.spawn(_v1.copy(f.pos).setY(0.1), _v2.set(rand(-1, 1), rand(2, 4), rand(-1, 1)), COL.dirt, 0.6, 0.35, 0.2, 0.95, 9); }
      if (frame % 6 === 0) debris(f.pos, 1, 3);
      if (f.pos.distanceTo(sk.lastCrack) > 0.55) { decal(f.pos, TEX.crack, 1.4, 1.3, { color: 0xff5010, additive: true, opacity: 0.8 }); sk.lastCrack.copy(f.pos); }
      shake = Math.max(shake, 0.08); if (frame % 24 === 0) sfx.rumble();
      if (Math.hypot(opp.pos.x - f.pos.x, opp.pos.z - f.pos.z) < 0.55 || sk.pt > 1.5) {
        sk.phase = 2; sk.pt = 0; f.setHidden(false); f.invuln = 0.15; f.vel.set(0, 7.5, 0); f.pos.y = 0.02;
        f.anim.play('uppercut', { loop: false, fade: 0.02, start: Math.max(0, CI.uppercut.peak - 0.25), speed: 1.4 });
        const p = f.pos.clone().setY(0);
        debris(p, 30, 10); dust(p, 16, 1.6, 5); fireBurst(_v1.copy(p).setY(0.3), 14, 1);
        spawnRing(_v1.copy(p).setY(0.06), COL.magma, { size: 4, life: 0.35, flat: true }); decal(p, TEX.scorch_03, 3, 4, { color: 0x000000, opacity: 0.85 });
        for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; rockSpike(new V3(p.x + Math.cos(a) * 1.1, 0, p.z + Math.sin(a) * 1.1), rand(1.2, 1.8), { delay: 0.02 * i, life: 0.8, tilt: 0.5, dir: new V3(Math.cos(a), 0, Math.sin(a)) }); }
        spawnLight(_v1.copy(p).setY(1), 0xff4a10, 70, 12, 0.4); shake = 0.5; sfx.boom(); sfx.crack(); fovKick = 5;
        if (Math.hypot(opp.pos.x - p.x, opp.pos.z - p.z) < 1.4 && opp.pos.y < 1.5)
          f.hasHit = applyHit(f, opp, { dmg: 15, chip: 5, hitstun: 0.7, knock: 2, launch: 9, knockdown: true, heavy: true, guardBreak: true, fxColor: COL.magma }, opp.chest(), f.fwdNew());
      }
    } else if (!f.airborne && sk.pt > 0.2) { dust(f.pos, 6); f.toNeutral(); }
  },
};

// =====================================================================
//  궁극기 : 돌진 타격이 맞으면 시네마틱 연출 (철권 레이지 아츠 방식)
// =====================================================================
function startUlt(f) {
  const opp = G.opp(f);
  f.setState('ultStart'); f.vel.set(0, 0, 0); f.faceOpp(opp);
  f.anim.play('cross', { loop: false, fade: 0.05, start: MOVES.cross.t0, speed: MOVES.cross.speed1 * 0.75 });
  sfx.ult(); screenFlash(0.15); hitStop = 0.25;
  spawnFlash(f.chest(), f.color.clone().multiplyScalar(3), 4, 0.3, TEX.star_06);
  floatText(f.chest().add(new V3(0, 0.9, 0)), '궁극기!', f === G.f[0] ? '#ffb04a' : '#6fe6ff');
}
function updateUltStart(f, opp) {
  const fw = f.fwdNew(), sp = f.t < 0.3 ? 6 : 0;
  f.vel.set(fw.x * sp, 0, fw.z * sp);
  const c = f.chest(); _v1.randomDirection(); P.magic.spawn(_v2.copy(c).addScaledVector(_v1, 1), _v1.multiplyScalar(-2), f.color.clone().multiplyScalar(3), 0.3, 0.5, 0.05, 1, 0, 6);
  f.trailHand.push(f.effPos('RightHand'), f.effPos('RightForeArm').lerp(f.effPos('RightHand'), 0.45));
  if (f.t > 0.12 && f.t < 0.36 && inStrike(f, opp, 1.6, 0.85) && opp.invuln <= 0 && !/ko|down|getup/.test(opp.state)) {
    const toAtt = _v1.set(f.pos.x - opp.pos.x, 0, f.pos.z - opp.pos.z).normalize();
    if ((opp.state === 'guard' || opp.state === 'blockstun') && opp.fwd.dot(toAtt) > 0.2) {
      applyHit(f, opp, { dmg: 0, chip: 6, blockstun: 0.4, knock: 6 }, f.effPos('RightHand')); f.setState('ultRecover');
    } else startCine(f, opp);
    return;
  }
  if (f.t > 0.75) f.setState('ultRecover');
}

const cine = { active: false };
function startCine(att, def) {
  const O = att.pos.clone(); O.y = 0;
  const F = new V3(def.pos.x - att.pos.x, 0, def.pos.z - att.pos.z); if (F.lengthSq() < 1e-4) F.copy(att.fwdNew()); F.normalize();
  const R = new V3(-F.z, 0, F.x); if (R.dot(camSide) < 0) R.negate();   // 카메라가 있던 쪽
  Object.assign(cine, { active: true, att, def, O, F, R, t: 0, flags: {}, script: att.ult, dealt: 0 });
  clearProjectiles();
  for (const f of [att, def]) { f.setState('cine'); f.vel.set(0, 0, 0); f.noGrav = true; f.setHidden(false); f.sk = null; }
  att.yaw = Math.atan2(F.x, F.z); def.yaw = Math.atan2(-F.x, -F.z);
  $('cutWho').textContent = att.name; $('cutWhat').textContent = att.ult.name;
  $('cutin').className = (att === G.f[0] ? 'p1' : 'p2') + ' hidden';
  $('hud').classList.add('cine');
  hitFx(def.chest(), true); hitStop = 0.15; sfx.ult();
}
function cineHit(c, dmg, opts = {}) {
  const { def, att } = c;
  dmg = Math.min(dmg, c.script.dmg - c.dealt);
  c.dealt += dmg; def.hp = Math.max(0, def.hp - dmg); def.flash(0.1);
  att.combo = (att.comboTimer > 0 ? att.combo : 0) + 1; att.comboTimer = 2;
  const p = opts.point || def.chest();
  hitFx(p, !!opts.heavy, opts.color);
  if (opts.anim !== false) def.anim.play(opts.heavy ? 'hit_big' : 'hit', { loop: false, fade: 0.03, start: 0, speed: opts.heavy ? 1.2 : 1.6 });
  hitStop = Math.max(hitStop, opts.stop ?? (opts.heavy ? 0.1 : 0.05)); shake = Math.max(shake, opts.heavy ? 0.35 : 0.14);
}
function endCine() {
  const c = cine; c.active = false;
  const { att, def } = c;
  $('cutin').className = 'hidden'; $('hud').classList.remove('cine');
  if (c.dealt < c.script.dmg) def.hp = Math.max(0, def.hp - (c.script.dmg - c.dealt));
  for (const f of [att, def]) { f.noGrav = false; f.pos.y = 0; f.vel.set(0, 0, 0); }
  att.toNeutral(); att.invuln = 0.5; darkTarget = 0;
  if (def.anim.curName !== 'knockdown' || def.anim.time < CI.knockdown.lying - 0.3) def.anim.play('knockdown', { loop: false, fade: 0.1, start: Math.max(0, CI.knockdown.lying - 0.3), speed: 1 });
  if (def.hp <= 0) { def.hp = 0; def.setState('ko'); }
  else { def.setState('down'); def.t = 0.2; }
}
const at = (c, f, u, r, out = new V3()) => out.copy(c.O).addScaledVector(c.F, f).addScaledVector(UP, u).addScaledVector(c.R, r);
const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);

const ULT_DRAGON = {
  name: '메테오 스톰', dmg: 40, dur: 6.4,
  update(c, t) {
    const { att, def, F } = c, ce = k => { if (c.flags[k]) return false; c.flags[k] = true; return true; };
    if (t < 1.0) {   // 1) 컷인
      if (ce('in')) { $('cutin').classList.remove('hidden'); att.anim.play('taunt', { loop: false, fade: 0.1, start: 0.3, speed: 1.4 }); def.anim.play('stagger', { loop: true, fade: 0.1, speed: 1.2 }); sfx.roar('dragon'); }
      att.wingFlap = 1; at(c, 0, 0, 0, att.pos); at(c, 1.4, 0, 0, def.pos); return;
    }
    if (ce('cutOut')) $('cutin').classList.add('hidden');
    if (t < 1.5) {   // 2) 어퍼컷으로 띄우기
      if (ce('upper')) att.anim.play('uppercut', { loop: false, fade: 0.05, start: MOVES.uppercut.t0, speed: 2.2 });
      if (t > 1.2 && ce('h1')) { cineHit(c, 6, { heavy: true, anim: false }); def.anim.play('hit_big', { loop: false, fade: 0.03, speed: 1 }); }
      at(c, 0, 0, 0, att.pos); at(c, 1.4, t > 1.2 ? smooth(seg(t, 1.2, 1.5)) * 2.5 : 0, 0, def.pos); return;
    }
    if (t < 3.0) {   // 3) 함께 날아올라 공중 연타
      if (ce('fly')) { att.anim.play('fly', { loop: true, fade: 0.15, speed: 1.4 }); sfx.flap(); dust(att.pos, 14, 1.5, 4); def.anim.play('hit_big', { loop: false, fade: 0.1, speed: 0.8 }); }
      att.wingFlap = 1;
      const h = 2.5 + smooth(seg(t, 1.5, 2.2)) * 2.5;
      at(c, 0.2, h - 0.3, 0, att.pos); at(c, 1.3, h + 0.2, 0, def.pos);
      for (const [ht, mv] of [[1.85, 'jab'], [2.1, 'cross'], [2.35, 'air_kick'], [2.65, 'kick']]) {
        if (t > ht - 0.12 && ce('s' + ht)) { const m = MOVES[mv]; att.anim.play(m.clip, { loop: false, fade: 0.04, start: m.t0, speed: m.speed1 * 1.1 }); sfx.whoosh(); }
        if (t > ht && ce('h' + ht)) cineHit(c, 4, { heavy: mv === 'kick' });
      }
      att.trailHand.push(att.effPos('RightHand'), att.effPos('RightForeArm').lerp(att.effPos('RightHand'), 0.45));
      if (t > 2.3) { const tip = att.effPos('RightFoot'); att.trailFoot.push(tip, att.effPos('RightLeg').lerp(tip, 0.45)); }
      return;
    }
    if (t < 5.0) {   // 4) 마법진 + 운석 폭격
      if (ce('cast')) {
        att.anim.play('spell_up', { loop: false, fade: 0.15, start: 0.2, speed: 1.0 }); def.anim.play('falling', { loop: true, fade: 0.2 });
        darkTarget = 1; c.circle = magicCircle(at(c, 1.3, 10, 0), 0xff7a2a); sfx.ult();
      }
      att.wingFlap = 1;
      at(c, -0.6, 5 + smooth(seg(t, 3.0, 3.5)) * 2.5, 0, att.pos);
      at(c, 1.4 + smooth(seg(t, 3.0, 3.7)), 5 - smooth(seg(t, 3.0, 3.8)) * 5, 0, def.pos);
      if (t > 3.8 && ce('land')) { dust(def.pos, 10, 1.4); def.anim.play('knockdown', { loop: false, fade: 0.05, start: CI.knockdown.lying - 0.2, speed: 1 }); shake = 0.3; }
      for (let i = 0; i < 9; i++) {
        if (t > 3.4 + i * 0.16 && ce('m' + i)) {
          const last = i === 8, tgt = last ? def.pos.clone().setY(0) : def.pos.clone().setY(0).add(new V3(rand(-1.4, 1.4), 0, rand(-1.4, 1.4)));
          spawnMeteor(att, tgt).onHit = () => cineHit(c, last ? 6 : 1.6, { heavy: true, stop: last ? 0.12 : 0.03, anim: false, point: def.chest() });
        }
      }
      return;
    }
    // 5) 불꽃 다이브 피니시
    if (ce('dive')) { att.anim.play('hard_land', { loop: false, fade: 0.1, start: 0, speed: CI.hard_land.tMin / 0.45 }); sfx.fire(); }
    const k = seg(t, 5.0, 5.45);
    at(c, lerp(-0.6, 1.0, k), lerp(7.5, 0, k * k), 0, att.pos); at(c, 2.4, 0, 0, def.pos);
    if (k < 1) { const ch = att.chest(); for (let i = 0; i < 6; i++) { _v1.set(rand(-0.6, 0.6), rand(0.5, 3), rand(-0.6, 0.6)); P.fire.spawn(_v2.copy(ch).addScaledVector(_v1, 0.25), _v1, COL.fire, 0.35, 1.1, 0.3, 0.9, 0, 5); } }
    else if (ce('impact')) {
      const p = att.pos.clone().addScaledVector(F, 0.7);
      firePillar(p, 1.5, 8, 1.3); fireBurst(_v1.copy(p).setY(0.5), 60, 2); debris(p, 40, 11); dust(p, 24, 2, 6);
      spawnRing(_v1.copy(p).setY(0.08), COL.hot, { size: 9, life: 0.7, flat: true, width: 0.75 }); spawnRing(_v1.copy(p).setY(0.1), COL.white, { size: 5, life: 0.35, flat: true });
      decal(p, TEX.scorch_03, 7, 6, { color: 0x000000, opacity: 0.9 }); decal(p, TEX.crack, 8, 3, { color: 0xff5010, additive: true });
      for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; rockSpike(new V3(p.x + Math.cos(a) * 2.4, 0, p.z + Math.sin(a) * 2.4), rand(1, 1.8), { delay: 0.02 * i, life: 1.0, tilt: 0.5, dir: new V3(Math.cos(a), 0, Math.sin(a)) }); }
      spawnLight(_v1.copy(p).setY(1.5), 0xff5010, 140, 20, 0.8); screenFlash(0.15); shake = 0.9; fovKick = 9; sfx.boom(); sfx.crack();
      cineHit(c, 99, { heavy: true, stop: 0.3, anim: false }); def.anim.play('knockdown', { loop: false, fade: 0.05, start: Math.max(0, CI.knockdown.lying - 0.9), speed: 1 });
      att.anim.play('hard_land', { loop: false, fade: 0.05, start: CI.hard_land.tMin - 0.05, speed: 0.9 }); darkTarget = 0;
      if (c.circle) c.circle.fade = true;
    }
  },
  camera(c, t) {
    const att = c.att.pos, def = c.def.pos;
    if (t < 1.0) return { pos: at(c, 1.0 + t * 0.3, 1.6, 2.3 - t * 0.5), look: at(c, 0.2, 1.45, 0), fov: 34 };
    if (t < 1.5) return { pos: at(c, -1.2, 0.5, 2.2), look: def.clone().add(new V3(0, 1.4, 0)), fov: 46 };
    if (t < 3.0) { const a = (t - 1.5) * 1.4; return { pos: att.clone().addScaledVector(c.F, 0.6 - Math.cos(a) * 3.2).addScaledVector(c.R, Math.sin(a) * 3.2 + 0.8).add(new V3(0, 1.2, 0)), look: att.clone().lerp(def, 0.5).add(new V3(0, 1.1, 0)), fov: 44 }; }
    if (t < 3.9) { const k = seg(t, 3.0, 3.9); return { pos: at(c, 2.2, lerp(2.6, 3.4, k), lerp(2.4, 2.9, k)), look: at(c, -0.6, lerp(5.8, 7.2, k), 0), fov: 52 }; }
    if (t < 5.0) { const k = seg(t, 3.9, 5.0); return { pos: at(c, lerp(0.2, -0.4, k), lerp(3.4, 4.2, k), lerp(5.6, 6.4, k)), look: at(c, 2.0, 0.6, 0), fov: 50 }; }
    const k = seg(t, 5.0, 6.4); return { pos: at(c, lerp(-2.5, -4, k), lerp(0.4, 1.8, k), lerp(5.5, 7.5, k)), look: at(c, 1.4, lerp(2.5, 1.2, k), 0), fov: 50 };
  },
};
const ULT_MUTANT = {
  name: '지옥의 포효', dmg: 42, dur: 6.2,
  update(c, t) {
    const { att, def } = c, ce = k => { if (c.flags[k]) return false; c.flags[k] = true; return true; };
    if (t < 1.0) {   // 1) 컷인 + 근육 과시
      if (ce('in')) { $('cutin').classList.remove('hidden'); att.anim.play('flex', { loop: false, fade: 0.1, start: 0.4, speed: 1.3 }); def.anim.play('stagger', { loop: true, fade: 0.1, speed: 1.2 }); sfx.rumble(); sfx.roar(); }
      for (let i = 0; i < 3; i++) { _v1.set(rand(-1, 1), 0, rand(-1, 1)).multiplyScalar(0.9); P.magic.spawn(_v2.copy(att.pos).add(_v1).setY(rand(0, 0.4)), _v4.set(0, rand(2, 5), 0), COL.red, 0.6, 0.5, 0.1, 0.98, 0, 4); }
      at(c, 0, 0, 0, att.pos); at(c, 1.35, 0, 0, def.pos); shake = Math.max(shake, 0.06); return;
    }
    if (ce('cutOut')) $('cutin').classList.add('hidden');
    if (t < 2.6) {   // 2) 연타 → 어퍼컷 띄우기
      at(c, 0, 0, 0, att.pos);
      for (const [ht, mv, d] of [[1.25, 'jab', 4], [1.55, 'cross', 4], [1.85, 'jab', 4], [2.15, 'uppercut', 6]]) {
        if (t > ht - 0.14 && ce('s' + ht)) { const m = MOVES[mv]; att.anim.play(m.clip, { loop: false, fade: 0.04, start: m.t0, speed: m.speed1 }); sfx.whoosh(); }
        if (t > ht && ce('h' + ht)) cineHit(c, d, { heavy: mv === 'uppercut', color: COL.red });
      }
      att.trailHand.push(att.effPos('RightHand'), att.effPos('RightForeArm').lerp(att.effPos('RightHand'), 0.45));
      const up = t > 2.15 ? smooth(seg(t, 2.15, 2.6)) * 4 : 0;
      at(c, 1.35, up, 0, def.pos);
      if (up > 0.2 && ce('fall')) def.anim.play('falling', { loop: true, fade: 0.1 });
      return;
    }
    if (t < 3.6) {   // 3) 뛰어올라 내리찍기
      if (ce('slam')) { const ci = CI.slam, t0 = Math.max(0, ci.tMin - 0.9); att.anim.play('slam', { loop: false, fade: 0.08, start: t0, speed: (ci.tMin - t0) / 0.75 }); sfx.whoosh(); }
      const k = seg(t, 2.6, 3.35);
      at(c, lerp(0, 1.0, k), Math.sin(k * Math.PI) * 3.5, 0, att.pos); at(c, 1.35, lerp(4, 0, smooth(k)), 0, def.pos);
      if (k >= 1 && ce('smash')) {
        const p = def.pos.clone();
        spawnRing(_v1.copy(p).setY(0.06), COL.magma, { size: 7, life: 0.5, flat: true, width: 0.78 }); decal(p, TEX.crack, 6, 3, { color: 0xff5010, additive: true });
        decal(p, TEX.scorch_03, 4, 6, { color: 0x000000, opacity: 0.85 }); debris(p, 35, 10); dust(p, 20, 1.8, 6); fireBurst(_v1.copy(p).setY(0.3), 20, 1.2);
        spawnLight(_v1.copy(p).setY(1), 0xff4a10, 90, 14, 0.5); shake = 0.7; fovKick = 7; sfx.boom(); sfx.crack();
        cineHit(c, 8, { heavy: true, stop: 0.16, anim: false }); def.anim.play('knockdown', { loop: false, fade: 0.03, start: CI.knockdown.lying - 0.15, speed: 1 });
      }
      return;
    }
    if (t < 4.6) {   // 4) 포효 : 가시 고리 두 겹
      if (ce('roar')) { att.anim.play('roar', { loop: false, fade: 0.15, start: 0.55, speed: 1.2 }); sfx.roar(); sfx.play('howl', 0.7, 0.8); darkTarget = 0.7; }
      at(c, 1.0, 0, 0, att.pos); at(c, 1.9, 0, 0, def.pos);
      const p = att.pos;
      if (t > 3.8 && ce('wave1')) {
        for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; rockSpike(new V3(p.x + Math.cos(a) * 2.0, 0, p.z + Math.sin(a) * 2.0), rand(1.4, 2.2), { delay: 0.015 * i, life: 1.6, tilt: 0.4, dir: new V3(Math.cos(a), 0, Math.sin(a)) }); }
        spawnRing(_v1.copy(p).setY(1), COL.red, { size: 5, life: 0.4 }); shake = 0.6;
        cineHit(c, 6, { heavy: true, anim: false, color: COL.magma }); def.anim.play('hit_big', { loop: false, fade: 0.03, speed: 1 });
      }
      if (t > 4.05 && ce('wave2')) {
        for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2 + 0.2; rockSpike(new V3(p.x + Math.cos(a) * 3.6, 0, p.z + Math.sin(a) * 3.6), rand(1.8, 2.8), { delay: 0.012 * i, life: 1.4, tilt: 0.5, dir: new V3(Math.cos(a), 0, Math.sin(a)) }); }
        spawnRing(_v1.copy(p).setY(0.06), COL.magma, { size: 9, life: 0.5, flat: true, width: 0.8 }); shake = 0.7;
      }
      if (frame % 3 === 0) { _v1.set(rand(-1, 1), 0, rand(-1, 1)).normalize().multiplyScalar(rand(1, 4)); dust(_v2.copy(p).add(_v1), 1, 1.2, 3); }
      return;
    }
    if (ce('erupt')) {   // 5) 용암 분출 피니시
      const p = def.pos.clone();
      firePillar(p, 1.6, 10, 1.5, new THREE.Vector3(3.4, 0.6, 0.1));
      for (let i = 0; i < 5; i++) firePillar(att.pos.clone().add(new V3(rand(-4, 4), 0, rand(-4, 4))), rand(0.6, 1.0), rand(4, 7), 1.2);
      fireBurst(_v1.copy(p).setY(0.5), 60, 2); debris(p, 40, 12); spawnLight(_v1.copy(p).setY(2), 0xff4010, 160, 22, 0.9);
      screenFlash(0.3); shake = 1.0; fovKick = 9; sfx.boom(); sfx.play('explosion', 0.9, 0.8);
      cineHit(c, 99, { heavy: true, stop: 0.3, anim: false }); def.anim.play('knockdown', { loop: false, fade: 0.05, start: Math.max(0, CI.knockdown.lying - 0.9), speed: 1 }); darkTarget = 0;
    }
    const k = seg(t, 4.6, 5.4);
    at(c, 1.0, 0, 0, att.pos); at(c, 1.9 + k * 1.5, Math.sin(k * Math.PI) * 4.5, 0, def.pos);
  },
  camera(c, t) {
    if (t < 1.0) return { pos: at(c, 1.3, 1.8 - t * 0.2, 1.4 + t * 0.4), look: at(c, 0, 1.6, 0), fov: 34 };
    if (t < 2.6) { const a = (t - 1.0) * 0.9; return { pos: at(c, 0.7 - Math.cos(a) * 1.5, 1.3, 2.6 + Math.sin(a) * 0.8), look: at(c, 0.7, 1.3, 0), fov: 40 }; }
    if (t < 3.6) { const k = seg(t, 2.6, 3.6); return { pos: at(c, -2.2, lerp(0.4, 2.8, k), lerp(3.2, 4.5, k)), look: at(c, 0.8, lerp(2.5, 1.0, k), 0), fov: 48 }; }
    if (t < 4.6) { const k = seg(t, 3.6, 4.6); return { pos: at(c, lerp(-1.5, -3.5, k), lerp(5.5, 7, k), lerp(4.5, 7.5, k)), look: at(c, 1.0, 0.5, 0), fov: 54 }; }
    const k = seg(t, 4.6, 6.2); return { pos: at(c, lerp(-3, -5, k), lerp(1.2, 2.2, k), lerp(6, 8, k)), look: at(c, 2, lerp(2.5, 1.5, k), 0), fov: 50 };
  },
};
function updateCine(dt) { cine.t += dt; cine.script.update(cine, cine.t); if (cine.t >= cine.script.dur) endCine(); }

// =====================================================================
//  화면 연출
// =====================================================================
let hitStop = 0, shake = 0, fovKick = 0, timeScale = 1;
function screenFlash(a) { const el = $('flash'); el.style.transition = 'none'; el.style.opacity = a; requestAnimationFrame(() => { el.style.transition = 'opacity .25s'; el.style.opacity = 0; }); }
function floatText(p, text, color) {
  const v = p.clone().project(camera);
  const el = document.createElement('div'); el.className = 'floater'; el.textContent = text; el.style.color = color;
  el.style.left = ((v.x + 1) / 2 * innerWidth) + 'px'; el.style.top = ((1 - v.y) / 2 * innerHeight) + 'px';
  $('floaters').appendChild(el); setTimeout(() => el.remove(), 1000);
}
function announce(text, cls = '') { const el = $('announce'); el.className = ''; void el.offsetWidth; el.textContent = text; el.className = 'go ' + cls; }
function clearAnnounce() { $('announce').className = ''; $('announce').textContent = ''; }

// =====================================================================
//  입력
// =====================================================================
const held = new Set(), pressed = new Set();
addEventListener('keydown', e => {
  if (e.target && e.target.tagName === 'INPUT') { if (e.code === 'Escape') e.target.blur(); else if (e.code === 'Enter' || e.code === 'NumpadEnter') NET.inputEnter(e.target); return; }
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
  sfx.init();
  if (!held.has(e.code)) pressed.add(e.code);
  held.add(e.code);
  if (!e.repeat) G.menuKey(e.code);
});
addEventListener('keyup', e => held.delete(e.code));
addEventListener('blur', () => held.clear());
const anyK = (set, list) => list.some(k => set.has(k));
function readInput(k) {
  return { left: anyK(held, k.left), right: anyK(held, k.right), up: anyK(held, k.up), down: anyK(held, k.down), upTap: anyK(pressed, k.up), guard: anyK(held, k.guard),
    attack: anyK(pressed, k.attack), kick: anyK(pressed, k.kick), run: anyK(held, k.run), s0: anyK(pressed, k.s0), s1: anyK(pressed, k.s1), s2: anyK(pressed, k.s2), ult: anyK(pressed, k.ult) };
}
const NO_INPUT = { left: false, right: false, up: false, down: false, upTap: false, guard: false, attack: false, kick: false, run: false, s0: false, s1: false, s2: false, ult: false };

// =====================================================================
//  카메라
// =====================================================================
const camPos = new V3(0, 3, 10), camLook = new V3(0, 1, 0), camSide = new V3(0, 0, 1);
let camFov = 42;
function updateCamera(dt, mode) {
  const [a, b] = G.f;
  let desiredPos, desiredLook, desiredFov = 42, kPos = 7, kLook = 9;
  if (mode === 'cine') {
    const r = cine.script.camera(cine, cine.t);
    desiredPos = r.pos; desiredLook = r.look; desiredFov = r.fov; kPos = 6; kLook = 10;
  } else if (mode === 'title') {
    const ang = G.time * 0.18;
    desiredPos = new V3(Math.sin(ang) * 10, 3.2, Math.cos(ang) * 10); desiredLook = new V3(0, 1.3, 0); kPos = 2;
  } else {
    const mid = new V3().addVectors(a.pos, b.pos).multiplyScalar(0.5);
    const axis = new V3(b.pos.x - a.pos.x, 0, b.pos.z - a.pos.z); const sep = Math.max(0.5, axis.length()); axis.divideScalar(sep);
    const perp = new V3(-axis.z, 0, axis.x); if (perp.dot(camSide) < 0) perp.negate();
    camSide.lerp(perp, 1 - Math.exp(-dt * 9)).normalize();
    const vSep = Math.abs(a.pos.y - b.pos.y);
    let dist = clamp(3.4 + sep * 0.95 + vSep * 0.7, 5.2, 12), h = 1.45 + sep * 0.12;
    const look = new V3(mid.x, (a.pos.y + b.pos.y) * 0.5 + 1.15, mid.z);
    if (mode === 'ko') {
      dist *= 0.72; h *= 0.8;
      const side = new V3().crossVectors(UP, camSide).multiplyScalar(Math.sin(G.phaseT * 0.8) * 2.2);
      desiredPos = look.clone().addScaledVector(camSide, dist).add(side).setY(look.y + h - 0.6);
    } else if (mode === 'intro') {
      const k = clamp(G.phaseT / 1.9, 0, 1), e = 1 - Math.pow(1 - k, 3);
      desiredPos = look.clone().addScaledVector(camSide, lerp(13, dist, e)).setY(lerp(7.5, look.y + h - 0.75, e));
    } else desiredPos = look.clone().addScaledVector(camSide, dist).setY(look.y + h - 0.75);
    desiredLook = look;
  }
  camPos.lerp(desiredPos, 1 - Math.exp(-dt * kPos)); camLook.lerp(desiredLook, 1 - Math.exp(-dt * kLook));
  camFov = lerp(camFov, desiredFov, 1 - Math.exp(-dt * 6));
  camera.position.copy(camPos);
  if (shake > 0) { camera.position.x += vrand(-1, 1) * shake * 0.3; camera.position.y += vrand(-1, 1) * shake * 0.3; }
  camera.lookAt(camLook);
  fovKick *= Math.pow(0.86, dt * 60);
  camera.fov = camFov - fovKick; camera.updateProjectionMatrix();
  const m = camera.matrixWorld.elements;
  camRight.set(m[0], 0, m[2]).normalize(); camFwd.set(-m[8], 0, -m[10]).normalize();
}

// =====================================================================
//  게임 진행
// =====================================================================
let SDT = DT;
const G = {
  f: [], phase: 'loading', phaseT: 0, round: 1, roundTime: ROUND_TIME, time: 0, paused: false, winner: null,
  opp(f) { return f === this.f[0] ? this.f[1] : this.f[0]; },
  menuKey(c) {
    if (this.phase === 'loading') return;
    if (NET.menuOpen) { NET.menuKey(c); return; }
    if (c === 'Escape') { if (NET.active) NET.leave(); this.goTitle(); return; }
    if (NET.active) return;   // 온라인 대전 중엔 일시정지 · 다시하기 키를 쓰지 않음 (재대결은 입력으로 처리)
    if (c === 'KeyO' && this.phase === 'title') { NET.openMenu(); return; }
    if ((c === 'Enter' || c === 'NumpadEnter') && this.phase === 'title') this.startMatch();
    else if (c === 'KeyR' && this.phase === 'matchend') this.startMatch();
    else if (c === 'KeyP' && this.phase === 'fight') { this.paused = !this.paused; $('pause').classList.toggle('hidden', !this.paused); }
  },
  resetWorld() { clearProjectiles(); clearSpikes(); cine.active = false; darkTarget = 0; $('cutin').className = 'hidden'; $('hud').classList.remove('cine'); },
  goTitle() {
    this.phase = 'title'; this.phaseT = 0; this.paused = false; this.resetWorld();
    for (const [i, f] of this.f.entries()) { f.wins = 0; f.reset(i ? 2.2 : -2.2); }
    clearAnnounce();
    $('title').classList.remove('hidden'); $('hud').classList.add('hidden'); $('pause').classList.add('hidden'); $('matchend').classList.add('hidden');
    $('netHud').classList.add('hidden');
  },
  startMatch() { this.round = 1; for (const f of this.f) f.wins = 0; $('matchend').classList.add('hidden'); this.startRound(); },
  startRound() {
    this.f[0].reset(-2.6); this.f[1].reset(2.6); this.resetWorld();
    this.roundTime = ROUND_TIME; this.paused = false; this.winner = null;
    this.phase = 'intro'; this.phaseT = 0; this.announced = 0; camSide.set(0, 0, 1);
    $('title').classList.add('hidden'); $('hud').classList.remove('hidden');
    const [a, b] = this.f; a.setState('intro'); b.setState('intro');
    a.anim.play('taunt', { loop: false, fade: 0.2, speed: 1.1 }); b.anim.play('roar', { loop: false, fade: 0.2, start: 0.4, speed: 1.6 }); setTimeout(() => sfx.roar(), 700);
  },
  endRound() {
    const [a, b] = this.f;
    if (a.hp <= 0 && b.hp <= 0) { this.winner = null; this.endText = 'DOUBLE K.O.'; }
    else if (a.hp <= 0) { this.winner = b; this.endText = 'K.O.'; }
    else if (b.hp <= 0) { this.winner = a; this.endText = 'K.O.'; }
    else { this.endText = 'TIME UP'; this.winner = a.hp > b.hp ? a : (b.hp > a.hp ? b : null); sfx.vo('time'); }
    if (this.winner) this.winner.wins++;
    this.phase = 'roundend'; this.phaseT = 0; this.victoryDone = false;
    announce(this.endText, 'red');
  },
};

function step() {
  if (G.paused) return false;
  G.time += DT; frame++;
  shake = Math.max(0, shake - DT * 1.6);
  timeScale = (G.phase === 'roundend' && G.phaseT < 1.4) ? 0.3 : 1;
  SDT = DT * timeScale;
  G.fxAcc = (G.fxAcc || 0) + SDT;
  updateTransients(SDT); updateLights(SDT); updateGhosts(SDT); updateSpikes(SDT); updateDebris(SDT);
  ambientEmbers();
  darkK = lerp(darkK, darkTarget, 0.05);
  hemi.intensity = LIGHT_BASE.hemi * (1 - darkK * 0.7); keyLight.intensity = LIGHT_BASE.key * (1 - darkK * 0.6);
  scene.background.copy(BG).lerp(BLACK, darkK);
  for (const l of lavaLights) l.intensity = 22 + Math.sin(G.time * 7 + l.position.x) * 4 + rand(-2, 2);
  if (hitStop > 0) { hitStop -= DT; return false; }

  G.phaseT += SDT;
  const [a, b] = G.f;
  const fight = G.phase === 'fight';
  if (cine.active) {
    updateCine(SDT);
    for (const f of G.f) { f.comboTimer = Math.max(0, f.comboTimer - SDT); if (f.shownHp > f.hp) f.shownHp = Math.max(f.hp, f.shownHp - 30 * SDT); }
  } else if (G.phase !== 'title') {
    const i1 = fight ? inputFor(0) : NO_INPUT, i2 = fight ? inputFor(1) : NO_INPUT;
    for (const [f, inp, o] of [[a, i1, b], [b, i2, a]]) {
      if (f.state === 'ultStart') { f.t += SDT; updateUltStart(f, o); if (cine.active) break; f.pos.addScaledVector(f.vel, SDT); }
      else if (f.state === 'ultRecover') { f.t += SDT; f.vel.multiplyScalar(0.8); f.pos.addScaledVector(f.vel, SDT); if (f.t > 0.55) f.toNeutral(); }
      else if (f.state !== 'cine') f.update(inp, o);
    }
    if (!cine.active) separate(a, b);
  } else { for (const f of G.f) { f.faceOpp(G.opp(f), 6); f.anim.loco('idle', 1); } }
  updateProjectiles(SDT);
  if (NET.active) { for (const f of G.f) { f.updateVisual(SDT); f.group.updateMatrixWorld(true); } }   // 온라인 : 손·발 위치가 두 PC에서 같도록
  else for (const f of G.f) f.animAcc = (f.animAcc || 0) + SDT;

  if (G.phase === 'intro') {
    if (G.announced === 0 && G.phaseT > 0.3) { announce(G.round >= 3 ? 'FINAL ROUND' : 'ROUND ' + G.round); sfx.vo(G.round >= 3 ? 'final_round' : 'round_' + G.round); G.announced = 1; }
    if (G.announced === 1 && G.phaseT > 1.6) { announce('FIGHT!', 'gold'); G.announced = 2; sfx.vo('fight'); sfx.play('bigboom', 0.5, 1.2); }
    if (G.phaseT > 2.1) { G.phase = 'fight'; G.phaseT = 0; for (const f of G.f) f.toNeutral(); setTimeout(clearAnnounce, 500); }
  } else if (fight) {
    if (!cine.active) { G.roundTime -= DT; if (a.hp <= 0 || b.hp <= 0 || G.roundTime <= 0) G.endRound(); }
  } else if (G.phase === 'roundend') {
    if (!G.victoryDone && G.phaseT > 2.0) {
      G.victoryDone = true;
      if (G.winner) { const w = G.winner; w.setState('victory'); w.vel.set(0, 0, 0); w.anim.play(w.victoryClip, { loop: false, fade: 0.25, speed: 1 }); announce(w.name + ' 승리!', 'gold'); sfx.vo(w.hp >= MAX_HP ? 'flawless_victory' : 'winner'); if (w.voice !== 'mech') sfx.roar(); }
      else { announce('DRAW'); sfx.vo('tie'); }
    }
    if (G.phaseT > 4.6) {
      if (a.wins >= WINS_NEEDED || b.wins >= WINS_NEEDED) {
        G.phase = 'matchend'; clearAnnounce();
        const w = a.wins >= WINS_NEEDED ? a : b;
        $('meText').textContent = (w === a ? 'P1 ' : 'P2 ') + w.name + ' 최종 승리!'; $('meScore').textContent = a.wins + '  :  ' + b.wins;
        $('matchend').classList.remove('hidden'); sfx.vo('you_win');
        $('meHelp').textContent = NET.active ? 'R 재대결 (둘 다 눌러야 시작) · ESC 나가기' : 'R 다시하기 · ESC 타이틀로';
      } else { G.round++; G.startRound(); }
    }
  }
  return true;
}
function separate(a, b) {
  if (a.hidden || b.hidden || Math.abs(a.pos.y - b.pos.y) > 1.3) return;
  const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz), min = 0.95;
  if (d >= min || d < 1e-4) return;
  const push = (min - d) / 2, nx = dx / d, nz = dz / d;
  a.pos.x -= nx * push; a.pos.z -= nz * push; b.pos.x += nx * push; b.pos.z += nz * push;
}
let emberAcc = 0;
function ambientEmbers() {
  emberAcc += 0.8;
  while (emberAcc >= 1) {
    emberAcc--;
    const ang = rand(0, Math.PI * 2), r = rand(ARENA_R + 1.5, 22);
    _v1.set(Math.cos(ang) * r, rand(-2.5, -0.5), Math.sin(ang) * r); _v2.set(rand(-0.3, 0.3), rand(0.8, 2.2), rand(-0.3, 0.3));
    P.spark.spawn(_v1, _v2, COL.ember, rand(2, 4), rand(0.1, 0.2), 0.03, 0.995, -0.2);
  }
}

// ---------------- HUD ----------------
function buildSkillHud(f, n, keys) {
  const el = $('skills' + n); el.innerHTML = '';
  f.hudSk = f.skills.map((s, i) => { const d = document.createElement('div'); d.className = 'skb'; d.innerHTML = `<b>${keys[i]}</b><span>${s.name}</span><i class="cd"></i>`; el.appendChild(d); return d; });
  $('ultl' + n).textContent = `${keys[3]} 궁극기 · ${f.ult.name}`;
}
const HC = new Map();   // HUD 캐시 : 값이 바뀔 때만 DOM을 건드림 (레이아웃 재계산 방지)
const hset = (el, key, val, fn) => { const k = el.id + key; if (HC.get(k) === val) return; HC.set(k, val); fn(val); };
function updateHud() {
  if (G.phase === 'title' || G.phase === 'loading') return;
  G.f.forEach((f, i) => {
    const n = i + 1, hp = $('hp' + n), lag = $('lag' + n), ult = $('ult' + n), c = $('combo' + n);
    hset(hp, 'w', Math.round(f.hp / MAX_HP * 1000) / 10, v => { hp.style.width = v + '%'; hp.classList.toggle('low', v <= 30); });
    hset(lag, 'w', Math.round(f.shownHp / MAX_HP * 200) / 2, v => { lag.style.width = v + '%'; });
    f.hudSk.forEach((d, k) => { const r = Math.ceil(f.cds[k] / f.skills[k].cd * 40) / 40; const key = 'sk' + n + k; if (HC.get(key) !== r) { HC.set(key, r); d.lastChild.style.height = (r * 100) + '%'; d.classList.toggle('ready', r === 0); } });
    hset(ult, 'w', Math.floor(f.meter), v => { ult.style.width = v + '%'; ult.classList.toggle('full', v >= 100); });
    hset($('w' + n), 'n', f.wins, v => [...$('w' + n).children].forEach((el, k) => el.classList.toggle('on', k < v)));
    const show = f.comboTimer > 0 && f.combo >= 2 ? f.combo : 0;
    hset(c, 'c', show, v => { if (v) { c.innerHTML = v + ' HIT<small>COMBO!</small>'; c.classList.add('show'); } else c.classList.remove('show'); });
  });
  const sec = Math.max(0, Math.ceil(G.roundTime)), t = $('timer');
  hset(t, 's', sec, v => { t.textContent = v; t.classList.toggle('low', v <= 10); });
}

// =====================================================================
//  시작
// =====================================================================
async function main() {
  const texPromises = TEX_NAMES.map(n => texLoader.loadAsync(`assets/fx/kenney/${n}.png`).then(t => { TEX[n] = t; }));
  const [mapG, dragonG, mutantF, ...animF] = await Promise.all([
    gltfLoader.loadAsync('assets/maps/lava_arena/lava_arena.glb'),
    gltfLoader.loadAsync('assets/characters/dragon_warrior/dragon_warrior.glb'),
    fbxLoader.loadAsync('assets/characters/mutant/mutant.fbx'),
    ...ANIM_NAMES.map(n => fbxLoader.loadAsync(`assets/animations/${n}.fbx`)),
  ]);
  await Promise.all(texPromises);
  $('loadText').textContent = '효과음 불러오는 중...';
  await sfx.load();
  TEX.crack = makeCrackTex();
  $('loadText').textContent = '맵과 캐릭터 준비 중...';
  await new Promise(r => setTimeout(r, 30));

  // 맵 (용암 발광을 낮춰 눈부심 줄이기)
  const map = mapG.scene; map.scale.setScalar(MAP_SCALE); scene.add(map); map.updateMatrixWorld(true);
  const solid = [];
  map.traverse(o => {
    if (!o.isMesh) return;
    if (o.material.emissiveIntensity !== undefined) o.material.emissiveIntensity *= /sky/i.test(o.name) ? 0.7 : 0.42;
    if (/sky/i.test(o.name)) { o.material.fog = false; o.material.depthWrite = false; o.renderOrder = -1; }
    else { o.receiveShadow = true; solid.push(o); }
    if (/Outer/i.test(o.name)) ROCK_MAT = o.material.clone();
  });
  if (!ROCK_MAT) ROCK_MAT = new THREE.MeshStandardMaterial({ color: 0x3a2a24, roughness: 1 });
  for (const o of solid) seeThrough(o.material);
  ROCK_MAT.emissiveIntensity = 0.9; ROCK_MAT.flatShading = true; ROCK_MAT.needsUpdate = true;
  ROCK_GEO = new THREE.DodecahedronGeometry(0.42, 0);
  const rc = new THREE.Raycaster();
  rc.set(new V3(0, 500, 0), DOWN); const floorY = rc.intersectObjects(solid, false)[0].point.y;
  map.position.y = -floorY; map.updateMatrixWorld(true);
  let minR = 99;
  for (let ang = 0; ang < 360; ang += 10) {
    const c = Math.cos(ang * Math.PI / 180), s = Math.sin(ang * Math.PI / 180);
    for (let r = 1; r < 30; r += 0.2) { rc.set(new V3(c * r, 60, s * r), DOWN); const h = rc.intersectObjects(solid, false)[0]; if (!h || h.point.y < -0.4) { minR = Math.min(minR, r); break; } }
  }
  ARENA_R = Math.max(4, minR - 0.9);

  // 파티클 / 파편
  P.spark = new Particles(4000, TEX.circle_05, true);
  P.fire = new Particles(2500, TEX.flame_02, true);
  P.fire2 = new Particles(2500, TEX.fire_02, true);
  P.magic = new Particles(800, TEX.magic_05, true);
  P.twirl = new Particles(300, TEX.twirl_02, true);
  P.smoke = new Particles(600, TEX.smoke_04, false);
  P.dust = new Particles(800, TEX.smoke_07, false);
  P.dirt = new Particles(400, TEX.dirt_02, false);
  const dm = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.12, 0), ROCK_MAT, 260);
  dm.frustumCulled = false; scene.add(dm);
  DEBRIS = { mesh: dm, items: [], free: [] };
  for (let i = 0; i < 260; i++) { DEBRIS.items.push({ p: new V3(), v: new V3(), r: new V3(), w: new V3(), s: 1, life: 0 }); DEBRIS.free.push(i); }

  // 애니메이션
  const clips = animF.map((f, i) => prepClip(f, ANIM_NAMES[i]));
  CI = analyzeClips(mutantF, clips); finalizeMoves();

  // 캐릭터
  const mutant = mutantF; const mutMats = prepModel(mutant); mutant.updateMatrixWorld(true);
  const mHead = wpos(mutant.getObjectByName('mixamorigHead')).y, mBox = new THREE.Box3().setFromObject(mutant);
  const mScale = 2.15 / ((mHead - mBox.min.y) * 1.1);
  const dragon = dragonG.scene; const byBase = cleanDragon(dragon); const drgMats = prepModel(dragon); dragon.updateMatrixWorld(true);
  dragon.traverse(o => { if (o.isMesh) o.castShadow = o.visible && o.geometry.attributes.position.count > 4000; });
  let sharedSkel = null, shared = 0;
  dragon.traverse(o => {
    if (!o.isSkinnedMesh) return;
    if (!sharedSkel) { sharedSkel = o.skeleton; return; }
    const b = o.skeleton.bones;
    const inv = o.skeleton.boneInverses, inv0 = sharedSkel.boneInverses;
    const same = b.length === sharedSkel.bones.length && b.every((x, i) => x === sharedSkel.bones[i]) &&
      inv.every((m, i) => m.elements.every((e, j) => Math.abs(e - inv0[i].elements[j]) < 1e-4));
    if (same) { o.skeleton = sharedSkel; shared++; }
  });
  console.log('[격투왕] 드래곤 뼈대 공유', shared + 1, '개 부품');
  const dHead = wpos(byBase['DEF-spine006']).y, dToe = wpos(byBase['DEF-r_toeL'] || byBase['DEF-footL']).y;
  const dMinY = dToe - (dHead - dToe) * 0.05, dScale = 2.05 / ((dHead - dMinY) * 1.08);
  const dragonRig = new RetargetRig(dragon, byBase, mutantF), mutantRig = new DirectRig(mutant);

  const p1 = new Fighter({ name: '드래곤 워리어', color: new THREE.Color(1, 0.42, 0.12), model: dragon, rig: dragonRig, clips, mats: drgMats, height: 2.05,
    victoryClip: 'victory', skills: [SK_PLASMA, SK_BREATH, SK_DIVE], ult: ULT_DRAGON, wings: true, voice: 'mech' });
  p1.holder.scale.setScalar(dScale); p1.holder.position.y = -dMinY * dScale;
  const p2 = new Fighter({ name: '뮤턴트', color: new THREE.Color(0.18, 0.84, 1), model: mutant, rig: mutantRig, clips, mats: mutMats, height: 2.15,
    victoryClip: 'roar', skills: [SK_SPIN, SK_QUAKE, SK_BURROW], ult: ULT_MUTANT, voice: 'beast' });
  p2.holder.scale.setScalar(mScale); p2.holder.position.y = -mBox.min.y * mScale;
  G.f = [p1, p2];
  makeGhosts(p2, 5);
  $('n1').textContent = p1.name; $('n2').textContent = p2.name;
  buildSkillHud(p1, 1, KEY_LABEL.p1); buildSkillHud(p2, 2, KEY_LABEL.p2);
  const sc = innerHeight * 0.9 * renderer.getPixelRatio(); for (const k in P) P[k].mat.uniforms.uScale.value = sc;

  window.G = G; window.THREE = THREE; window.scene = scene; window.camera = camera;
  window.DBG = { NET, SEE: SEE_U, bloom, composer, renderer, render: () => render(),
    run(n, keys = []) {
      for (let i = 0; i < n; i++) { keys.forEach(k => { if (!held.has(k)) pressed.add(k); held.add(k); }); if (step() !== false) pressed.clear(); flushVisual(); updateCamera(DT, camMode()); }
      keys.forEach(k => held.delete(k)); updateHud(); render();
    },
    tap(k) { pressed.add(k); held.add(k); if (step() !== false) pressed.clear(); held.delete(k); updateCamera(DT, camMode()); render(); },
    MOVES, CI, cine, P,
  };

  // 셰이더 미리 컴파일 (첫 사용 때 멈칫하지 않도록)
  const off = new V3(0, -50, 0);
  sparks(off, COL.spark, 1); spawnRing(off, COL.spark); spawnFlash(off, COL.spark); fireBurst(off, 2); smokeBurst(off, 1); dust(off, 1);
  firePillar(off, 1, 1, 0.05); decal(off, TEX.crack, 1, 0.05); rockSpike(off, 1, { life: 0.01 });
  renderer.shadowMap.needsUpdate = true; renderer.compile(scene, camera);

  $('loading').classList.add('hidden');
  G.goTitle();
  if (new URLSearchParams(location.search).get('net')) NET.openMenu();   // ?net=quick : 바로 온라인 빠른 매칭
  requestAnimationFrame(loop);
}

// 카메라와 캐릭터 사이를 가리는 기둥·벽은 그 부분만 뚫어서 보이게 (바닥은 그대로)
const SEE_U = { uSeeCam: { value: new V3() }, uSeeA: { value: new V3() }, uSeeB: { value: new V3() }, uSeeOn: { value: 1 } };
function seeThrough(mat) {
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, SEE_U);
    sh.vertexShader = 'varying vec3 vSeeW;\n' + sh.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\n  vSeeW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = `uniform vec3 uSeeCam, uSeeA, uSeeB; uniform float uSeeOn; varying vec3 vSeeW;
float seeCut(vec3 T) {
  vec3 d = T - uSeeCam; float L = length(d); vec3 n = d / L, w = vSeeW - uSeeCam; float t = dot(w, n);
  if (t <= 0.0 || t > L - 0.3) return 0.0;
  float r = mix(0.45, 1.45, t / L), dist = length(w - n * t);
  return 1.0 - smoothstep(r * 0.65, r, dist);
}
` + sh.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  if (uSeeOn > 0.5 && vSeeW.y > 0.12) {
    float c = max(seeCut(uSeeA), seeCut(uSeeB));
    vec2 q = mod(floor(gl_FragCoord.xy), 2.0);
    float bay = (q.x * 2.0 + q.y * 3.0 - 4.0 * q.x * q.y + 0.5) * 0.25;
    if (c > bay) discard;
  }`);
  };
  mat.customProgramCacheKey = () => 'seeThrough';
  mat.needsUpdate = true;
}
function updateSee() {
  SEE_U.uSeeCam.value.copy(camera.position);
  const [a, b] = G.f;
  if (a) SEE_U.uSeeA.value.set(a.pos.x, a.pos.y + 1.05, a.pos.z);
  if (b) SEE_U.uSeeB.value.set(b.pos.x, b.pos.y + 1.05, b.pos.z);
}
function flushVisual() {   // 그리기 직전에 한 번만 : 뼈대 애니메이션 · 파티클 갱신
  if (!NET.active) for (const f of G.f) { f.updateVisual(f.animAcc || 0); f.animAcc = 0; }
  if (G.fxAcc) { for (const k in P) P[k].update(G.fxAcc); G.fxAcc = 0; }
}
let renderCount = 0;
function render() { flushVisual(); updateSee(); renderer.shadowMap.needsUpdate = (renderCount++ % 2 === 0); composer.render(); }
function camMode() { return cine.active ? 'cine' : G.phase === 'title' ? 'title' : G.phase === 'intro' ? 'intro' : (G.phase === 'roundend' && G.phaseT < 2) ? 'ko' : 'fight'; }
const QLOCK = new URLSearchParams(location.search).has('lockq');   // 테스트용 : 자동 품질 낮추기 끄기
let last = performance.now(), acc = 0, frameAvg = 16, lowFrames = 0, qLevel = 0;
// =====================================================================
//  온라인 대전 (지연 기반 록스텝)
//   - 중계 서버(server/server.js)를 거쳐 두 사람이 '매 프레임 입력'만 주고받음
//   - 두 PC가 같은 입력 · 같은 난수 씨앗으로 같은 계산을 해서 똑같은 경기가 진행됨
//   - 입력은 D 프레임 뒤에 적용 (D = 왕복 지연에 맞춰 자동 결정)
// =====================================================================
const NB = { F: 1, B: 2, SL: 4, SR: 8, GUARD: 16, RUN: 32, UPTAP: 64, ATK: 128, KICK: 256, S0: 512, S1: 1024, S2: 2048, ULT: 4096, RE: 8192 };
const NB_PRESS = NB.UPTAP | NB.ATK | NB.KICK | NB.S0 | NB.S1 | NB.S2 | NB.ULT | NB.RE;
const NET_KEYS = {};   // 온라인에선 P1 키 · P2 키 어느 쪽으로든 내 캐릭터를 조작
for (const k in KEYS.p1) NET_KEYS[k] = [...KEYS.p1[k], ...KEYS.p2[k]];
function netDecode(b) {
  return { left: false, right: false, up: false, down: false, fIn: (b & NB.F ? 1 : 0) - (b & NB.B ? 1 : 0), sIn: (b & NB.SL ? 1 : 0) - (b & NB.SR ? 1 : 0),
    upTap: !!(b & NB.UPTAP), guard: !!(b & NB.GUARD), run: !!(b & NB.RUN), attack: !!(b & NB.ATK), kick: !!(b & NB.KICK),
    s0: !!(b & NB.S0), s1: !!(b & NB.S1), s2: !!(b & NB.S2), ult: !!(b & NB.ULT) };
}
function inputFor(i) { return NET.active ? NET.cur[i] : readInput(i ? KEYS.p2 : KEYS.p1); }
function simHash() {
  let str = G.phase + G.round + '|' + G.roundTime.toFixed(3);
  for (const f of G.f) str += `|${f.hp.toFixed(2)},${f.meter.toFixed(2)},${f.pos.x.toFixed(3)},${f.pos.y.toFixed(3)},${f.pos.z.toFixed(3)},${f.state},${f.wins}`;
  let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const NET_POINTER = 'https://api.github.com/repos/kang-jun-mo12/fighting-king-3d/contents/server.json?ref=server';   // 고정 링크용 서버 주소 파일
const NET = {
  ws: null, url: '', connected: false, menuOpen: false, active: false, role: 0, seed: 0, D: 4,
  simF: 0, sendF: 0, inputs: [new Map(), new Map()], cur: [NO_INPUT, NO_INPUT], curBits: [0, 0], carry: [0, 0], re: [false, false],
  rng: null, sums: new Map(), rsums: new Map(), desync: 0, fixF: null, fixSnap: null,
  rtt: 0, pingSent: new Map(), pingId: 0, lastTick: 0, rttSamples: [], online: 0, startT: 0,

  // ---------------- 화면 ----------------
  el(id) { return $(id); },
  show(part) { for (const id of ['netServerRow', 'netMenu', 'netWait']) $(id).classList.toggle('hidden', id !== part); $('netRetryRow').classList.toggle('hidden', part !== 'netServerRow'); },
  status(t, cls = '') { const e = $('netStatus'); e.textContent = t; e.className = cls; },
  openMenu() {
    this.menuOpen = true; $('online').classList.remove('hidden'); $('title').classList.add('hidden');
    if (this.connected) { this.show('netMenu'); this.status(`서버 연결됨 · 접속자 ${this.online}명`, 'ok'); return; }
    this.autoServer();
  },
  closeMenu() {
    this.menuOpen = false; $('online').classList.add('hidden');
    if (!this.active) { this.send({ t: 'cancel' }); $('title').classList.remove('hidden'); }
  },
  menuKey(c) {
    if (c === 'Escape') { if ($('netWait').classList.contains('hidden')) this.closeMenu(); else this.cancel(); }
    else if (c === 'Digit1' && this.connected) this.quick();
    else if (c === 'Digit2' && this.connected) this.create();
  },
  inputEnter(el) { if (el.id === 'netServer') this.connect(el.value); else if (el.id === 'netCode') this.join(el.value); },

  // ---------------- 서버 찾기 · 연결 ----------------
  wsUrlFrom(v) {
    v = String(v || '').trim(); if (!v) return '';
    if (/^wss?:\/\//.test(v)) return v.replace(/\/+$/, '') + (/\/ws$/.test(v) ? '' : '/ws');
    let m = v.match(/^(https?):\/\/([^/?#]+)/); const host = m ? m[2] : v.replace(/[/?#].*$/, '');
    const secure = m ? m[1] === 'https' : !/^(localhost|127\.|192\.168\.|10\.|\[?::1)/.test(host);
    return (secure ? 'wss://' : 'ws://') + host + '/ws';
  },
  async autoServer() {
    const q = new URLSearchParams(location.search).get('server');
    if (q) return this.connect(q);
    try {   // 중계 서버가 이 페이지를 직접 제공 중이면 같은 주소로 연결
      const r = await fetch('status', { cache: 'no-store' });
      if (r.ok && (await r.json()).ok) return this.connect(location.origin);
    } catch {}
    this.status('방장 서버를 찾는 중...'); this.show(null);
    try {   // 고정 링크 : 방장 서버가 켜질 때 GitHub 저장소(server 브랜치)에 적어 둔 주소
      const r = await fetch(NET_POINTER + '&t=' + Date.now(), { cache: 'no-store' });
      if (r.ok) {
        const j = await r.json(), info = JSON.parse(atob(String(j.content).replace(/\s/g, '')));
        if (info.url) { this.fromPointer = true; return this.connect(info.url); }
        this.show('netServerRow'); this.status('방장 서버가 꺼져 있어요. 방장 PC에서 "온라인 서버 실행.bat"을 켠 뒤 [다시 찾기]를 눌러 주세요.', 'bad'); return;
      }
    } catch {}
    this.show('netServerRow'); this.status('방장 서버 주소를 넣어 주세요 (서버 창에 나온 trycloudflare 링크)');
    try { const last = localStorage.getItem('fk3d_server'); if (last) $('netServer').value = last; } catch {}
    $('netServer').focus();
  },
  connect(v) {
    const url = this.wsUrlFrom(v); if (!url) return;
    if (this.ws) { try { this.ws.onclose = null; this.ws.close(); } catch {} }
    this.url = url; this.status('서버에 연결하는 중...'); this.show(null);
    let ws;
    try { ws = new WebSocket(url); } catch { this.status('주소가 올바르지 않아요', 'bad'); this.show('netServerRow'); return; }
    this.ws = ws;
    const timer = setTimeout(() => { if (!this.connected) { try { ws.close(); } catch {} } }, 8000);
    ws.onopen = () => {
      clearTimeout(timer); this.connected = true;
      try { if (!/localhost|127\.0\.0\.1/.test(url)) localStorage.setItem('fk3d_server', v); } catch {}
      this.status('서버 연결됨', 'ok'); this.show('netMenu');
      const auto = new URLSearchParams(location.search).get('net');
      if (auto === 'quick') this.quick();
    };
    ws.onmessage = e => this.onMsg(e.data);
    ws.onclose = () => {
      clearTimeout(timer);
      const was = this.connected; this.connected = false; this.ws = null;
      if (this.active) this.endOnline('서버와 연결이 끊겼어요');
      if (this.menuOpen) { this.show('netServerRow'); this.status(was ? '서버와 연결이 끊겼어요. 서버 창이 켜져 있는지 확인해 주세요.' : this.fromPointer ? '방장 서버에 연결하지 못했어요. 서버가 꺼졌거나 방금 켜졌다면 잠시 뒤 다시 시도해 주세요.' : '서버에 연결하지 못했어요. 주소를 확인하거나 서버 창이 켜져 있는지 확인해 주세요.', 'bad'); this.fromPointer = false; }
    };
  },
  send(o) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); },
  sendR(o) { if (this.ws && this.ws.readyState === 1) this.ws.send('{"t":"r",' + JSON.stringify(o).slice(1)); },

  quick() { this.send({ t: 'quick' }); },
  create() { this.send({ t: 'create' }); },
  join(code) { code = String(code).trim(); if (!/^\d{4}$/.test(code)) { this.status('방 코드는 숫자 4자리예요', 'bad'); return; } this.send({ t: 'join', code }); },
  cancel() { this.send({ t: 'cancel' }); this.show('netMenu'); this.status(`서버 연결됨 · 접속자 ${this.online}명`, 'ok'); },

  onMsg(data) {
    let m; try { m = JSON.parse(data); } catch { return; }
    if (m.t === 'r') return this.onGame(m);
    if (m.t === 'hello' || m.t === 'count') { this.online = m.online; if (this.menuOpen && !$('netMenu').classList.contains('hidden')) this.status(`서버 연결됨 · 접속자 ${this.online}명`, 'ok'); }
    else if (m.t === 'wait') {
      this.show('netWait');
      $('netWaitText').innerHTML = m.mode === 'room' ? `방 코드 <b class="code">${m.code}</b><br>친구에게 이 코드를 알려 주세요. 기다리는 중...` : '상대를 찾는 중... (다른 사람이 빠른 매칭을 누르면 바로 시작돼요)';
    }
    else if (m.t === 'err') { this.status(m.msg, 'bad'); }
    else if (m.t === 'idle') { this.show('netMenu'); }
    else if (m.t === 'match') { this.role = m.role; this.seed = m.seed; this.prepare(); }
    else if (m.t === 'left') { if (this.active || this.startT) this.endOnline('상대가 나갔어요'); else { this.show('netMenu'); this.status('상대가 나갔어요', 'bad'); } }
    else if (m.t === 'pong') { const t0 = this.pingSent.get(m.id); if (t0) { this.srvRtt = performance.now() - t0; this.pingSent.delete(m.id); } }
  },

  // ---------------- 매칭 후 : 지연 측정 → 시작 ----------------
  prepare() {
    this.startT = performance.now(); this.rttSamples = [];
    $('netWaitText').innerHTML = `상대를 찾았어요! 나는 <b>${this.role === 0 ? '드래곤 워리어 (P1)' : '뮤턴트 (P2)'}</b><br>연결 상태 확인 중...`; this.show('netWait');
    if (this.role === 0) {
      let n = 0;
      const ping = () => { if (!this.startT || this.active) return; this.sendR({ k: 'ping', id: ++this.pingId, at: performance.now() }); if (++n < 8) setTimeout(ping, 80); };
      ping();
      setTimeout(() => {   // 응답이 다 안 와도 1.5초 뒤엔 시작
        if (this.active || !this.startT) return;
        const s = this.rttSamples.slice().sort((a, b) => a - b), med = s.length ? s[s.length >> 1] : 150;
        const D = clamp(Math.ceil(med / 2 / (DT * 1000)) + 2, 3, 12);
        this.sendR({ k: 'go', D }); this.start(D, med);
      }, 1500);
    }
  },
  onGame(m) {
    if (m.k === 'in') { const q = this.inputs[1 - this.role]; for (let i = 0; i < m.b.length; i++) q.set(m.f + i, m.b[i]); }
    else if (m.k === 'ping') this.sendR({ k: 'pong', id: m.id, at: m.at });
    else if (m.k === 'pong') { const r = performance.now() - m.at; this.rttSamples.push(r); this.rtt = this.rtt ? this.rtt * 0.8 + r * 0.2 : r; }
    else if (m.k === 'go') { if (!this.active) this.start(m.D, 0); }
    else if (m.k === 'sum') { this.rsums.set(m.f, m.s); this.checkSum(m.f); }
    else if (m.k === 'fixat') { if (this.role === 1) { this.fixF = m.f; this.fixSnap = null; } }
    else if (m.k === 'fix') { if (this.role === 1 && m.f === this.fixF) this.fixSnap = m.snap; }
  },
  start(D, rtt) {
    this.D = D; if (rtt) this.rtt = rtt;
    this.active = true; this.menuOpen = false; this.startT = 0;
    this.simF = 0; this.sendF = D; this.inputs = [new Map(), new Map()]; this.carry = [0, 0]; this.re = [false, false];
    for (let f = 0; f < D; f++) { this.inputs[0].set(f, 0); this.inputs[1].set(f, 0); }
    this.sums.clear(); this.rsums.clear(); this.desync = 0; this.fixF = null; this.fixSnap = null; this.outbox = [];
    this.rng = makeRng(this.seed);
    $('online').classList.add('hidden'); $('title').classList.add('hidden'); $('netHud').classList.remove('hidden');
    pressed.clear();
    // 두 PC의 시작 상태를 완전히 똑같이
    RNG = this.rng;
    frame = 0; G.time = 0; hitStop = 0; timeScale = 1; emberAcc = 0; darkK = 0; darkTarget = 0; G.paused = false;
    for (const f of G.f) { f.anim.mixer.stopAllAction(); f.anim.cur = null; f.anim.curName = ''; f.meter = 0; f.wins = 0; }
    G.startMatch();
    RNG = Math.random;
    acc = 0; this.lastTick = performance.now();
    announce(this.role === 0 ? '나 : 드래곤 워리어' : '나 : 뮤턴트', 'gold');
  },

  // ---------------- 록스텝 ----------------
  sampleLocal() {
    const k = NET_KEYS, me = G.f[this.role], op = G.f[1 - this.role];
    const ax = op.pos.x - me.pos.x, az = op.pos.z - me.pos.z;
    const screenSign = Math.sign(ax * camRight.x + az * camRight.z) || 1;
    const fIn = ((anyK(held, k.right) ? 1 : 0) - (anyK(held, k.left) ? 1 : 0)) * screenSign;
    const sideSign = (-az * camFwd.x + ax * camFwd.z) < 0 ? -1 : 1;   // 화면 '위쪽(안쪽)'이 상대 기준 어느 옆인지
    const sIn = ((anyK(held, k.up) ? 1 : 0) - (anyK(held, k.down) ? 1 : 0)) * sideSign;
    let b = 0;
    if (fIn > 0) b |= NB.F; else if (fIn < 0) b |= NB.B;
    if (sIn > 0) b |= NB.SL; else if (sIn < 0) b |= NB.SR;
    if (anyK(held, k.guard)) b |= NB.GUARD; if (anyK(held, k.run)) b |= NB.RUN;
    if (anyK(pressed, k.up)) b |= NB.UPTAP; if (anyK(pressed, k.attack)) b |= NB.ATK; if (anyK(pressed, k.kick)) b |= NB.KICK;
    if (anyK(pressed, k.s0)) b |= NB.S0; if (anyK(pressed, k.s1)) b |= NB.S1; if (anyK(pressed, k.s2)) b |= NB.S2; if (anyK(pressed, k.ult)) b |= NB.ULT;
    if (G.phase === 'matchend' && anyK(pressed, ['KeyR', 'Enter', 'NumpadEnter'])) b |= NB.RE;
    pressed.clear();
    return b;
  },
  tick() {
    const f = this.simF;
    for (let i = 0; i < 2; i++) {
      const b = (this.inputs[i].get(f) | 0) | this.carry[i]; this.inputs[i].delete(f);
      this.curBits[i] = b; this.cur[i] = netDecode(b);
    }
    RNG = this.rng;
    const r = step();
    for (let i = 0; i < 2; i++) this.carry[i] = r === false ? (this.curBits[i] & NB_PRESS) : 0;
    if (G.phase === 'matchend') {
      for (let i = 0; i < 2; i++) if (this.curBits[i] & NB.RE) this.re[i] = true;
      $('meHelp').textContent = this.re[0] && this.re[1] ? '재대결 시작!' : this.re[this.role] ? '상대가 재대결을 누르길 기다리는 중... (ESC 나가기)' : this.re[1 - this.role] ? '상대가 재대결을 원해요! R 키를 누르세요 (ESC 나가기)' : 'R 재대결 (둘 다 눌러야 시작) · ESC 나가기';
      if (this.re[0] && this.re[1]) { this.re = [false, false]; for (const ft of G.f) ft.meter = 0; G.startMatch(); }
    }
    RNG = Math.random;
    this.simF++;
    if (f % 30 === 0) { const h = simHash(); this.sums.set(f, h); this.sendR({ k: 'sum', f, s: h }); this.checkSum(f); }
    if (this.fixF !== null && f === this.fixF) this.applyFix();
  },
  checkSum(f) {
    if (!this.sums.has(f) || !this.rsums.has(f)) return;
    const ok = this.sums.get(f) === this.rsums.get(f);
    this.sums.delete(f); this.rsums.delete(f);
    if (ok) return;
    this.desync++; console.warn('[격투왕 온라인] 동기화 어긋남 감지 : 프레임', f);
    if (this.role === 0 && this.fixF === null) { this.fixF = this.simF + 45; this.sendR({ k: 'fixat', f: this.fixF }); }
  },
  snapshot() {
    return { rt: G.roundTime, round: G.round, f: G.f.map(ft => ({ p: ft.pos.toArray(), v: ft.vel.toArray(), y: ft.yaw, hp: ft.hp, sh: ft.shownHp, m: ft.meter, cd: ft.cds.slice(), w: ft.wins, c: ft.combo, ct: ft.comboTimer, iv: ft.invuln })) };
  },
  applyFix() {   // 방장 기준으로 핵심 값을 맞추고 난수도 같이 다시 맞춤
    if (this.role === 0) this.sendR({ k: 'fix', f: this.fixF, snap: this.snapshot() });
    else if (this.fixSnap) {
      const s = this.fixSnap; G.roundTime = s.rt; G.round = s.round;
      s.f.forEach((d, i) => { const ft = G.f[i]; ft.pos.fromArray(d.p); ft.vel.fromArray(d.v); ft.yaw = d.y; ft.hp = d.hp; ft.shownHp = d.sh; ft.meter = d.m; ft.cds = d.cd; ft.wins = d.w; ft.combo = d.c; ft.comboTimer = d.ct; ft.invuln = d.iv; });
    }
    this.rng = makeRng((this.seed ^ Math.imul(this.fixF + 1, 2654435761)) >>> 0);
    this.fixF = null; this.fixSnap = null;
  },
  pump() {
    let n = 0;
    while (acc >= DT && n < 8) {
      while (this.sendF < this.simF + this.D) {   // 내 입력은 D 프레임 앞서 보냄
        const b = this.sampleLocal(); this.inputs[this.role].set(this.sendF, b); this.outbox.push(b); this.outF ??= this.sendF; this.sendF++;
      }
      if (!this.inputs[1 - this.role].has(this.simF)) break;   // 상대 입력이 아직 안 옴 → 대기
      if (this.role === 1 && this.fixF !== null && this.simF === this.fixF && !this.fixSnap) break;   // 보정 데이터 대기
      this.tick(); acc -= DT; n++;
    }
    if (this.outbox.length) { this.sendR({ k: 'in', f: this.outF, b: this.outbox }); this.outbox = []; this.outF = undefined; }
    if (n) this.lastTick = performance.now();
    return n > 0;
  },

  // ---------------- 종료 ----------------
  leave() { this.sendR({ k: 'bye' }); this.send({ t: 'leave' }); this.active = false; this.startT = 0; RNG = Math.random; $('netHud').classList.add('hidden'); },
  endOnline(msg) {
    const wasActive = this.active;
    this.active = false; this.startT = 0; RNG = Math.random; $('netHud').classList.add('hidden');
    if (wasActive) {
      announce(msg, 'red');
      setTimeout(() => { if (this.active) return; G.goTitle(); clearAnnounce(); this.openMenu(); this.status(msg, 'bad'); }, 2200);
    } else if (this.menuOpen) { this.show('netMenu'); this.status(msg, 'bad'); }
  },
  hud(now) {
    if (!this.active) return;
    const stall = now - this.lastTick;
    const txt = `ONLINE · 나 ${this.role === 0 ? 'P1 드래곤' : 'P2 뮤턴트'} · 핑 ${Math.round(this.rtt)}ms · 입력지연 ${this.D}F` + (this.desync ? ` · 보정 ${this.desync}` : '') + (stall > 600 ? ' · 상대 기다리는 중...' : '');
    if (txt !== this.lastHud) { $('netHud').textContent = txt; this.lastHud = txt; $('netHud').classList.toggle('warn', stall > 600); }
    if (now - (this.lastPing || 0) > 2000) { this.lastPing = now; this.sendR({ k: 'ping', id: ++this.pingId, at: now }); }
  },
};
for (const [id, fn] of [['netQuick', () => NET.quick()], ['netCreate', () => NET.create()], ['netJoin', () => NET.join($('netCode').value)], ['netCancel', () => NET.cancel()],
  ['netConnect', () => NET.connect($('netServer').value)], ['netRetry', () => NET.autoServer()], ['netBack', () => NET.closeMenu()], ['titleOnline', () => { if (G.phase === 'title') NET.openMenu(); }]]) {
  const el = $(id); if (el) el.addEventListener('click', fn);
}

function applyQuality(q) {   // 프레임이 계속 낮으면 단계적으로 품질을 낮춤
  if (q >= 1) PR = Math.min(PR, 1.0);
  if (q >= 2) { PR = 0.85; keyLight.castShadow = false; for (const rt of [composer.renderTarget1, composer.renderTarget2]) { rt.samples = 0; rt.dispose(); } }
  if (q >= 3) { PR = 0.7; bloom.enabled = false; }
  renderer.setPixelRatio(PR); composer.setPixelRatio(PR); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  const sc = innerHeight * 0.9 * PR; for (const k in P) P[k].mat.uniforms.uScale.value = sc;
  console.log('[격투왕] 품질 단계', q, 'pixelRatio', PR);
}
function loop(now) {
  const ft = now - last;
  frameAvg = frameAvg * 0.95 + Math.min(ft, 100) * 0.05;
  if (G.phase === 'fight' && frameAvg > 21) lowFrames++; else lowFrames = Math.max(0, lowFrames - 2);
  if (lowFrames > 150 && qLevel < 3 && !QLOCK) { qLevel++; lowFrames = 0; applyQuality(qLevel); }
  acc += ft / 1000; last = now;
  if (acc > 0.1) acc = 0.1;   // 느린 PC에서 한 번에 너무 많이 몰아서 계산하지 않게
  let stepped = false;
  if (NET.active) stepped = NET.pump();
  else while (acc >= DT) { if (step() !== false) pressed.clear(); acc -= DT; stepped = true; }
  NET.hud(now);
  if (stepped) { updateCamera(DT, camMode()); updateHud(); render(); }
  requestAnimationFrame(loop);
}
main().catch(e => { console.error(e); $('loadText').textContent = '불러오기 실패: ' + e.message + '  (격투왕 실행.bat 으로 열어 주세요)'; });
