// 월드 그리기 — 청크 데이터 · 빛(하늘빛 + 횃불빛) · 메시 · 셰이더
import * as THREE from "../vendor/three.module.min.js";
import { BLOCKS, AIR, B } from "/shared/blocks.js";
import { CHUNK, HEIGHT, generateChunk, index } from "/shared/worldgen.js";

const WATER = B.WATER, LEAVES = B.LEAVES;
const R = CHUNK * 3;                 // 빛 계산 영역 (주변 3x3 청크) 가로 · 세로
const RV = R * R * HEIGHT;
const ri = (x, y, z) => (y * R + z) * R + x; // 영역 좌표 (x, z 는 0~47)

// 블록 성질 표 (빠르게 보려고 숫자 배열로)
const KIND = new Uint8Array(256);    // 0 공기 1 solid 2 cutout 3 liquid 4 torch 5 plant
const LIGHT_COST = new Uint8Array(256); // 빛이 지날 때 줄어드는 양 (255 = 막힘)
const EMIT = new Uint8Array(256);
for (let i = 0; i < 256; i++) LIGHT_COST[i] = 1;
for (const b of BLOCKS) {
  if (!b) continue;
  KIND[b.id] = { solid: 1, cutout: 2, liquid: 3, torch: 4, plant: 5 }[b.kind] ?? 1;
  LIGHT_COST[b.id] = b.kind === "solid" ? 255 : b.kind === "liquid" || b.id === LEAVES ? 2 : 1;
  EMIT[b.id] = b.light ?? 0;
}
const opaque = (b) => KIND[b] === 1;
/** 하늘빛이 줄지 않고 곧장 내려가는 블록 */
const skyPass = (b) => b === AIR || KIND[b] === 4 || KIND[b] === 5 || b === B.GLASS;

// ── 셰이더 ─────────────────────────────────────────────────
const VERT = /* glsl */`
attribute float aShade;
attribute vec2 aLight;
varying vec2 vUv;
varying float vShade;
varying vec2 vLight;
varying float vDepth;
void main() {
  vUv = uv; vShade = aShade; vLight = aLight;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */`
uniform sampler2D map;
uniform float daylight;
uniform float gamma;
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;
uniform float opacity;
uniform float alphaTest;
varying vec2 vUv;
varying float vShade;
varying vec2 vLight;
varying float vDepth;
float br(float l) { return l / (4.0 - 3.0 * l); }
void main() {
  vec4 tex = texture2D(map, vUv);
  if (tex.a < alphaTest) discard;
  float s = br(vLight.x * daylight);
  float b = br(vLight.y);
  vec3 light = max(vec3(s), vec3(b, b * 0.92, b * 0.78));
  light = pow(max(light, vec3(0.035)), vec3(gamma));
  vec3 col = tex.rgb * light * vShade;
  float f = smoothstep(fogNear, fogFar, vDepth);
  gl_FragColor = vec4(mix(col, fogColor, f), tex.a * opacity);
}`;

export function makeMaterials(atlasTex) {
  const shared = {
    map: { value: atlasTex }, daylight: { value: 1 }, gamma: { value: 0.85 },
    fogColor: { value: new THREE.Color(0x8ec5ff) }, fogNear: { value: 60 }, fogFar: { value: 90 },
  };
  const solid = new THREE.ShaderMaterial({
    uniforms: { ...shared, opacity: { value: 1 }, alphaTest: { value: 0.5 } }, vertexShader: VERT, fragmentShader: FRAG,
  });
  const water = new THREE.ShaderMaterial({
    uniforms: { ...shared, opacity: { value: 0.75 }, alphaTest: { value: 0.01 } }, vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  return { solid, water, shared };
}

/** 빛 0~15 → 밝기 (셰이더와 같은 식) — 몹 · 손 색에 쓴다 */
export function brightness(sky, blk, daylight, gamma = 0.85) {
  const br = (l) => l / (4 - 3 * l);
  const v = Math.max(br((sky / 15) * daylight), br(blk / 15));
  return Math.max(0.035, v) ** gamma;
}

// ── 면 정의 ────────────────────────────────────────────────
const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], light: 0.8, tex: 2 },
  { n: [-1, 0, 0], c: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], light: 0.8, tex: 2 },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], light: 1.0, tex: 0 },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], light: 0.55, tex: 1 },
  { n: [0, 0, 1], c: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], light: 0.9, tex: 2 },
  { n: [0, 0, -1], c: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], light: 0.9, tex: 2 },
];
for (const f of FACES) {
  const [a, b, c] = f.c;
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  if (cross[0] * f.n[0] + cross[1] * f.n[1] + cross[2] * f.n[2] < 0) f.c.reverse();
  const axes = [0, 1, 2].filter((i) => f.n[i] === 0);
  f.uv = f.c.map((p) => (f.n[1] !== 0 ? [p[0], p[2]] : [p[f.n[0] !== 0 ? 2 : 0], p[1]]));
  const dir = (p, ax) => { const d = [0, 0, 0]; d[ax] = p[ax] === 1 ? 1 : -1; return d; };
  f.aoD1 = f.c.map((p) => dir(p, axes[0]));
  f.aoD2 = f.c.map((p) => dir(p, axes[1]));
}
const AO_LEVEL = [0.5, 0.68, 0.84, 1];

function faceVisible(b, nb) {
  if (nb === AIR) return true;
  const k = KIND[b], nk = KIND[nb];
  if (k === 3) return false;
  if (k === 2) return nk !== 1 && (nb !== b || b === LEAVES);
  return nk !== 1;
}

// 계산용 버퍼 (청크마다 새로 만들지 않고 재사용)
const RB = new Uint8Array(RV);
const SKY = new Uint8Array(RV);
const BLK = new Uint8Array(RV);
const QUEUE = new Int32Array(1 << 20);
const HMAP = new Int16Array(R * R);

function flood(light, qh, qt) {
  const Q = QUEUE, M = Q.length - 1;
  const step = R, layer = R * R;
  while (qh !== qt) {
    const i = Q[qh]; qh = (qh + 1) & M;
    const v = light[i];
    if (v <= 1) continue;
    const x = i % R, z = ((i / R) | 0) % R, y = (i / layer) | 0;
    for (let d = 0; d < 6; d++) {
      let j;
      if (d === 0) { if (x === R - 1) continue; j = i + 1; }
      else if (d === 1) { if (x === 0) continue; j = i - 1; }
      else if (d === 2) { if (z === R - 1) continue; j = i + step; }
      else if (d === 3) { if (z === 0) continue; j = i - step; }
      else if (d === 4) { if (y === HEIGHT - 1) continue; j = i + layer; }
      else { if (y === 0) continue; j = i - layer; }
      const cost = LIGHT_COST[RB[j]];
      if (cost === 255) continue;
      const nv = v - cost;
      if (nv > light[j]) { light[j] = nv; Q[qt] = j; qt = (qt + 1) & M; }
    }
  }
}

// ── 월드 ───────────────────────────────────────────────────
export class WorldView {
  constructor(scene, atlas, materials) {
    this.scene = scene;
    this.atlas = atlas;
    this.mat = materials;
    this.seed = 0;
    this.chunks = new Map();
    this.editsByChunk = new Map();
    this.uvs = BLOCKS.map((b) => (b ? b.tex.map((t) => atlas.uv(t)) : null));
    this.torchUV = { side: atlas.uv("torch", 7, 6, 9, 16), top: atlas.uv("torch", 7, 4, 9, 6), bottom: atlas.uv("torch", 7, 14, 9, 16) };
    this.renderDist = 6;
  }

  reset(seed, edits) {
    for (const c of this.chunks.values()) this.dispose(c);
    this.chunks.clear();
    this.editsByChunk.clear();
    this.seed = seed;
    for (const [pos, b] of Object.entries(edits)) { const [x, y, z] = pos.split(",").map(Number); this.addEdit(x, y, z, b); }
  }

  addEdit(x, y, z, b) {
    const k = ckey(Math.floor(x / CHUNK), Math.floor(z / CHUNK));
    if (!this.editsByChunk.has(k)) this.editsByChunk.set(k, new Map());
    this.editsByChunk.get(k).set(`${x},${y},${z}`, b);
  }

  data(cx, cz) {
    const k = ckey(cx, cz);
    let c = this.chunks.get(k);
    if (!c) {
      const data = generateChunk(cx, cz, this.seed);
      const edits = this.editsByChunk.get(k);
      if (edits) for (const [pos, b] of edits) {
        const [x, y, z] = pos.split(",").map(Number);
        data[index(x - cx * CHUNK, y, z - cz * CHUNK)] = b;
      }
      c = { cx, cz, data, meshes: null, dirty: true, sky: null, blk: null };
      this.chunks.set(k, c);
    }
    return c;
  }

  /** 아직 안 만든 청크는 '돌'로 본다 (불러오기 전에 떨어지지 않게) */
  get(x, y, z) {
    if (y < 0) return B.STONE;
    if (y >= HEIGHT) return AIR;
    const c = this.chunks.get(ckey(Math.floor(x / CHUNK), Math.floor(z / CHUNK)));
    if (!c) return B.STONE;
    return c.data[index(x - c.cx * CHUNK, y, z - c.cz * CHUNK)];
  }

  /** 부딪히는 블록이 있나 (실수 좌표) */
  solidAt(x, y, z) {
    const k = KIND[this.get(Math.floor(x), Math.floor(y), Math.floor(z))];
    return k === 1 || k === 2;
  }

  /** 빛 [하늘, 횃불] 0~15 */
  light(x, y, z) {
    if (y >= HEIGHT) return [15, 0];
    if (y < 0) return [0, 0];
    const c = this.chunks.get(ckey(Math.floor(x / CHUNK), Math.floor(z / CHUNK)));
    if (!c?.sky) return [15, 0];
    const i = index(x - c.cx * CHUNK, y, z - c.cz * CHUNK);
    return [c.sky[i], c.blk[i]];
  }

  set(x, y, z, b) {
    this.addEdit(x, y, z, b);
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const c = this.chunks.get(ckey(cx, cz));
    if (!c) return;
    c.data[index(x - cx * CHUNK, y, z - cz * CHUNK)] = b;
    c.dirty = true;
    c.urgent = true;
    // 빛이 바뀌므로 주변 청크도 다시 그린다 (가까운 쪽은 빨리)
    const lx = x - cx * CHUNK, lz = z - cz * CHUNK;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const n = this.chunks.get(ckey(cx + dx, cz + dz));
      if (!n) continue;
      n.dirty = true;
      // 경계에 붙은 블록이면 옆 청크 면도 바로 바뀌어야 한다
      const ex = dx === 0 || (dx === -1 ? lx === 0 : lx === CHUNK - 1);
      const ez = dz === 0 || (dz === -1 ? lz === 0 : lz === CHUNK - 1);
      if (ex && ez) n.urgent = true;
    }
  }

  dispose(c) {
    if (!c.meshes) return;
    for (const m of c.meshes) { this.scene.remove(m); m.geometry.dispose(); }
    c.meshes = null;
  }

  /** 주변 청크를 가까운 것부터 조금씩 만든다. 남은 개수를 돌려준다 */
  update(px, pz, budget = 8) {
    const pcx = Math.floor(px / CHUNK), pcz = Math.floor(pz / CHUNK);
    const D = this.renderDist;
    const t0 = performance.now();
    // 블록을 바꾼 청크는 바로
    for (const c of this.chunks.values()) {
      if (c.urgent && c.meshes) { this.build(c); c.urgent = false; }
    }
    const todo = [];
    for (let dz = -D; dz <= D; dz++) for (let dx = -D; dx <= D; dx++) {
      const d = dx * dx + dz * dz;
      if (d > D * D) continue;
      const c = this.chunks.get(ckey(pcx + dx, pcz + dz));
      if (!c || c.dirty || !c.meshes) todo.push([d, pcx + dx, pcz + dz]);
    }
    todo.sort((a, b) => a[0] - b[0]);
    for (const [, cx, cz] of todo) {
      if (performance.now() - t0 > budget) break;
      this.build(this.data(cx, cz));
    }
    for (const [k, c] of this.chunks) {
      const dx = c.cx - pcx, dz = c.cz - pcz;
      if (dx * dx + dz * dz > (D + 3) ** 2) { this.dispose(c); this.chunks.delete(k); }
    }
    return todo.length;
  }

  // ── 빛 계산 + 메시 ──────────────────────────────────────
  build(c) {
    const t0 = performance.now();
    const nbs = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) nbs.push(this.data(c.cx + dx, c.cz + dz).data);
    // 3x3 청크 블록을 한 배열로
    for (let n = 0; n < 9; n++) {
      const src = nbs[n], ox = (n % 3) * CHUNK, oz = Math.floor(n / 3) * CHUNK;
      for (let y = 0; y < HEIGHT; y++) for (let z = 0; z < CHUNK; z++) {
        const s = (y * CHUNK + z) * CHUNK, d = ri(ox, y, oz + z);
        for (let x = 0; x < CHUNK; x++) RB[d + x] = src[s + x];
      }
    }
    SKY.fill(0); BLK.fill(0);
    // 하늘빛 — 기둥 맨 위에서 처음 막히는 곳까지는 15
    for (let z = 0; z < R; z++) for (let x = 0; x < R; x++) {
      let y = HEIGHT - 1;
      while (y >= 0 && skyPass(RB[ri(x, y, z)])) { SKY[ri(x, y, z)] = 15; y--; }
      HMAP[z * R + x] = y;
    }
    let qt = 0;
    const M = QUEUE.length - 1;
    for (let z = 0; z < R; z++) for (let x = 0; x < R; x++) {
      const h = HMAP[z * R + x];
      let hn = h + 1;
      if (x > 0) hn = Math.max(hn, HMAP[z * R + x - 1]);
      if (x < R - 1) hn = Math.max(hn, HMAP[z * R + x + 1]);
      if (z > 0) hn = Math.max(hn, HMAP[(z - 1) * R + x]);
      if (z < R - 1) hn = Math.max(hn, HMAP[(z + 1) * R + x]);
      for (let y = h + 1; y <= Math.min(hn, HEIGHT - 1); y++) { QUEUE[qt] = ri(x, y, z); qt = (qt + 1) & M; }
    }
    flood(SKY, 0, qt);
    // 횃불빛
    qt = 0;
    for (let i = 0; i < RV; i++) {
      const e = EMIT[RB[i]];
      if (e) { BLK[i] = e; QUEUE[qt] = i; qt = (qt + 1) & M; }
    }
    if (qt) flood(BLK, 0, qt);

    // 이 청크 몫의 빛 저장 (몹 · 손 밝기용)
    const sky = c.sky ?? new Uint8Array(CHUNK * CHUNK * HEIGHT);
    const blk = c.blk ?? new Uint8Array(CHUNK * CHUNK * HEIGHT);
    for (let y = 0; y < HEIGHT; y++) for (let z = 0; z < CHUNK; z++) for (let x = 0; x < CHUNK; x++) {
      const s = ri(x + CHUNK, y, z + CHUNK);
      sky[index(x, y, z)] = SKY[s]; blk[index(x, y, z)] = BLK[s];
    }
    c.sky = sky; c.blk = blk;

    this.mesh(c);
    this.buildMs = (this.buildMs ?? 0) * 0.9 + (performance.now() - t0) * 0.1; // 평균 (F3 화면)
  }

  mesh(c) {
    const out = { solid: newGeo(), water: newGeo() };
    const get = (x, y, z) => (y < 0 ? B.STONE : y >= HEIGHT ? AIR : RB[ri(x + CHUNK, y, z + CHUNK)]);
    const lightAt = (x, y, z, arr) => (y >= HEIGHT ? (arr === SKY ? 15 : 0) : y < 0 ? 0 : arr[ri(x + CHUNK, y, z + CHUNK)]);
    const data = c.data;
    for (let y = 0; y < HEIGHT; y++) for (let z = 0; z < CHUNK; z++) for (let x = 0; x < CHUNK; x++) {
      const b = data[index(x, y, z)];
      if (b === AIR) continue;
      const k = KIND[b];
      if (k === 4) { this.torch(out.solid, x, y, z, lightAt(x, y, z, SKY), lightAt(x, y, z, BLK)); continue; }
      if (k === 5) { this.plant(out.solid, b, x, y, z, lightAt(x, y, z, SKY), lightAt(x, y, z, BLK)); continue; }
      const liquid = k === 3;
      const g = liquid ? out.water : out.solid;
      const uvs = this.uvs[b];
      for (const f of FACES) {
        const nx = x + f.n[0], ny = y + f.n[1], nz = z + f.n[2];
        if (ny < 0) continue;
        const nb = get(nx, ny, nz);
        if (!faceVisible(b, nb)) continue;
        if (liquid && nb === WATER) continue;
        const [u0, v0, u1, v1] = uvs[f.tex];
        const base = g.pos.length / 3;
        const ao = [];
        for (let i = 0; i < 4; i++) {
          const p = f.c[i];
          let py = y + p[1];
          if (liquid && p[1] === 1 && get(x, y + 1, z) !== WATER) py -= 0.12;
          g.pos.push(x + p[0], py, z + p[2]);
          g.uv.push(f.uv[i][0] ? u1 : u0, f.uv[i][1] ? v1 : v0);
          const d1 = f.aoD1[i], d2 = f.aoD2[i];
          const b1 = get(nx + d1[0], ny + d1[1], nz + d1[2]);
          const b2 = get(nx + d2[0], ny + d2[1], nz + d2[2]);
          const bc = get(nx + d1[0] + d2[0], ny + d1[1] + d2[1], nz + d1[2] + d2[2]);
          const o1 = opaque(b1), o2 = opaque(b2), oc = opaque(bc);
          const level = liquid ? 3 : o1 && o2 ? 0 : 3 - (+o1 + +o2 + +oc);
          ao.push(level);
          g.shade.push(f.light * AO_LEVEL[level]);
          // 부드러운 빛 — 면 앞 4칸 평균 (막힌 칸 제외)
          let s = lightAt(nx, ny, nz, SKY), l = lightAt(nx, ny, nz, BLK), n = 1;
          if (!o1) { s += lightAt(nx + d1[0], ny + d1[1], nz + d1[2], SKY); l += lightAt(nx + d1[0], ny + d1[1], nz + d1[2], BLK); n++; }
          if (!o2) { s += lightAt(nx + d2[0], ny + d2[1], nz + d2[2], SKY); l += lightAt(nx + d2[0], ny + d2[1], nz + d2[2], BLK); n++; }
          if (!oc && !(o1 && o2)) { s += lightAt(nx + d1[0] + d2[0], ny + d1[1] + d2[1], nz + d1[2] + d2[2], SKY); l += lightAt(nx + d1[0] + d2[0], ny + d1[1] + d2[1], nz + d1[2] + d2[2], BLK); n++; }
          g.light.push(s / n / 15, l / n / 15);
        }
        if (ao[0] + ao[2] >= ao[1] + ao[3]) g.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        else g.idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
      }
    }
    this.dispose(c);
    c.meshes = [this.makeMesh(out.solid, this.mat.solid, c), this.makeMesh(out.water, this.mat.water, c)].filter(Boolean);
    for (const m of c.meshes) this.scene.add(m);
    c.dirty = false;
  }

  /** 풀 · 꽃 — X자 두 장 (앞뒤 모두) */
  plant(g, b, x, y, z, s, l) {
    const [u0, v0, u1, v1] = this.uvs[b][2];
    const quads = [[[0.15, 0.15], [0.85, 0.85]], [[0.85, 0.15], [0.15, 0.85]]];
    for (const [[ax, az], [bx, bz]] of quads) {
      for (const flip of [false, true]) {
        const base = g.pos.length / 3;
        const pts = [[ax, 0, az, u0, v0], [bx, 0, bz, u1, v0], [bx, 0.9, bz, u1, v1], [ax, 0.9, az, u0, v1]];
        for (const [px, py, pz, u, v] of pts) { g.pos.push(x + px, y + py, z + pz); g.uv.push(u, v); g.shade.push(0.95); g.light.push(s / 15, l / 15); }
        if (flip) g.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
        else g.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
  }

  /** 횃불 — 가는 막대 */
  torch(g, x, y, z, s, l) {
    const w0 = 7 / 16, w1 = 9 / 16, h = 10 / 16;
    const box = [[w0, 0, w0], [w1, h, w1]];
    for (const f of FACES) {
      if (f.n[1] === -1) continue;
      const [u0, v0, u1, v1] = f.n[1] === 1 ? this.torchUV.top : this.torchUV.side;
      const base = g.pos.length / 3;
      for (let i = 0; i < 4; i++) {
        const p = f.c[i];
        g.pos.push(x + box[p[0]][0], y + box[p[1]][1], z + box[p[2]][2]);
        g.uv.push(f.uv[i][0] ? u1 : u0, f.uv[i][1] ? v1 : v0);
        g.shade.push(f.light);
        g.light.push(s / 15, Math.max(l, 14) / 15);
      }
      g.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  makeMesh(g, mat, c) {
    if (!g.idx.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(g.pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(g.uv, 2));
    geo.setAttribute("aShade", new THREE.Float32BufferAttribute(g.shade, 1));
    geo.setAttribute("aLight", new THREE.Float32BufferAttribute(g.light, 2));
    geo.setIndex(g.idx);
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, mat);
    m.position.set(c.cx * CHUNK, 0, c.cz * CHUNK);
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    return m;
  }
}

const newGeo = () => ({ pos: [], uv: [], shade: [], light: [], idx: [] });
const ckey = (cx, cz) => `${cx},${cz}`;
export { KIND };
