// 테크젠 크래프트 — 브라우저 쪽 게임
import * as THREE from "./vendor/three.module.min.js";
import { BLOCKS, AIR, BLOCK_COUNT, isSolid, isOccluder, DEFAULT_HOTBAR } from "/shared/blocks.js";
import { CHUNK, HEIGHT, generateChunk, index } from "/shared/worldgen.js";
import { buildAtlas } from "./textures.js";

const $ = (id) => document.getElementById(id);
const RENDER_DIST = 6;           // 청크 단위 시야
const REACH = 6;                 // 손이 닿는 거리 (블록)
const EYE = 1.62, PW = 0.3, PH = 1.8; // 눈 높이, 몸 반폭, 키
const WATER = 10, LEAVES = 7;

// ── 렌더러 ─────────────────────────────────────────────────
const canvas = $("game");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
const scene = new THREE.Scene();
const SKY = new THREE.Color(0x8ec5ff);
scene.background = SKY;
scene.fog = new THREE.Fog(SKY, RENDER_DIST * CHUNK * 0.55, RENDER_DIST * CHUNK * 0.95);
const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
camera.rotation.order = "YXZ";

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

const atlas = buildAtlas();
const atlasTex = new THREE.CanvasTexture(atlas.canvas);
atlasTex.magFilter = THREE.NearestFilter;
atlasTex.minFilter = THREE.NearestFilter;
atlasTex.generateMipmaps = false;
atlasTex.colorSpace = THREE.SRGBColorSpace;
const solidMat = new THREE.MeshBasicMaterial({ map: atlasTex, vertexColors: true, alphaTest: 0.5 });
const waterMat = new THREE.MeshBasicMaterial({ map: atlasTex, vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false, side: THREE.DoubleSide });

// 블록별 면 UV 미리 계산 — [윗면, 아랫면, 옆면]
const BLOCK_UV = BLOCKS.map((b) => (b ? b.tex.map((t) => atlas.uv(t)) : null));

// ── 월드 데이터 ────────────────────────────────────────────
let seed = 0;
const chunks = new Map();          // "cx,cz" → { cx, cz, data, meshes, dirty }
const editsByChunk = new Map();    // "cx,cz" → Map("x,y,z" → b)
const ckey = (cx, cz) => `${cx},${cz}`;

function addEdit(x, y, z, b) {
  const k = ckey(Math.floor(x / CHUNK), Math.floor(z / CHUNK));
  if (!editsByChunk.has(k)) editsByChunk.set(k, new Map());
  editsByChunk.get(k).set(`${x},${y},${z}`, b);
}

function chunkData(cx, cz) {
  const k = ckey(cx, cz);
  let c = chunks.get(k);
  if (!c) {
    const data = generateChunk(cx, cz, seed);
    const edits = editsByChunk.get(k);
    if (edits) {
      for (const [pos, b] of edits) {
        const [x, y, z] = pos.split(",").map(Number);
        data[index(x - cx * CHUNK, y, z - cz * CHUNK)] = b;
      }
    }
    c = { cx, cz, data, meshes: null, dirty: true };
    chunks.set(k, c);
  }
  return c;
}

/** 블록 읽기 — 아직 안 만든 청크는 '돌'로 본다 (불러오기 전에 떨어지지 않게) */
function getBlock(x, y, z) {
  if (y < 0) return 3;
  if (y >= HEIGHT) return AIR;
  const c = chunks.get(ckey(Math.floor(x / CHUNK), Math.floor(z / CHUNK)));
  if (!c) return 3;
  return c.data[index(x - c.cx * CHUNK, y, z - c.cz * CHUNK)];
}

function setBlock(x, y, z, b) {
  addEdit(x, y, z, b);
  const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
  const c = chunks.get(ckey(cx, cz));
  if (!c) return;
  const lx = x - cx * CHUNK, lz = z - cz * CHUNK;
  c.data[index(lx, y, lz)] = b;
  c.dirty = true;
  // 청크 경계면 옆 청크도 다시 그린다
  const mark = (dx, dz) => { const n = chunks.get(ckey(cx + dx, cz + dz)); if (n) n.dirty = true; };
  if (lx === 0) mark(-1, 0);
  if (lx === CHUNK - 1) mark(1, 0);
  if (lz === 0) mark(0, -1);
  if (lz === CHUNK - 1) mark(0, 1);
  if (lx === 0 && lz === 0) mark(-1, -1);
  if (lx === CHUNK - 1 && lz === 0) mark(1, -1);
  if (lx === 0 && lz === CHUNK - 1) mark(-1, 1);
  if (lx === CHUNK - 1 && lz === CHUNK - 1) mark(1, 1);
}

// ── 메시 만들기 ────────────────────────────────────────────
// 면: 법선 n, 꼭짓점 4개(블록 기준 0/1 좌표), 기본 밝기, 텍스처(0 위 1 아래 2 옆)
const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], light: 0.8, tex: 2 },
  { n: [-1, 0, 0], c: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], light: 0.8, tex: 2 },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], light: 1.0, tex: 0 },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], light: 0.55, tex: 1 },
  { n: [0, 0, 1], c: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], light: 0.9, tex: 2 },
  { n: [0, 0, -1], c: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], light: 0.9, tex: 2 },
];
// 바깥에서 볼 때 반시계 방향이 되도록 꼭짓점 순서를 맞춘다
for (const f of FACES) {
  const [a, b, c] = f.c;
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  if (cross[0] * f.n[0] + cross[1] * f.n[1] + cross[2] * f.n[2] < 0) f.c.reverse();
  // 꼭짓점별 UV (0/1) 와 AO 를 볼 이웃 방향
  const axes = [0, 1, 2].filter((i) => f.n[i] === 0);
  f.uv = f.c.map((p) => (f.n[1] !== 0 ? [p[0], p[2]] : [p[f.n[0] !== 0 ? 2 : 0], p[1]]));
  // 꼭짓점마다 그림자를 볼 두 방향 (면과 나란한 축으로 ±1)
  const dir = (p, ax) => { const d = [0, 0, 0]; d[ax] = p[ax] === 1 ? 1 : -1; return d; };
  f.aoD1 = f.c.map((p) => dir(p, axes[0]));
  f.aoD2 = f.c.map((p) => dir(p, axes[1]));
}
const AO_LEVEL = [0.5, 0.68, 0.84, 1];

function faceVisible(b, nb) {
  const kind = BLOCKS[b].kind;
  if (nb === AIR) return true;
  const nk = BLOCKS[nb].kind;
  if (kind === "liquid") return false;
  if (kind === "cutout") return nk !== "solid" && (nb !== b || b === LEAVES);
  return nk !== "solid";
}

function buildMesh(c) {
  // 주변 8개 청크 데이터 (경계 면 · 그림자 계산용)
  const nbs = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) nbs.push(chunkData(c.cx + dx, c.cz + dz).data);
  const get = (x, y, z) => {
    if (y < 0) return 3;
    if (y >= HEIGHT) return AIR;
    const dx = x < 0 ? -1 : x >= CHUNK ? 1 : 0, dz = z < 0 ? -1 : z >= CHUNK ? 1 : 0;
    return nbs[(dz + 1) * 3 + dx + 1][index(x - dx * CHUNK, y, z - dz * CHUNK)];
  };

  const out = { solid: { pos: [], col: [], uv: [], idx: [] }, water: { pos: [], col: [], uv: [], idx: [] } };
  const data = c.data;
  for (let y = 0; y < HEIGHT; y++) {
    for (let z = 0; z < CHUNK; z++) {
      for (let x = 0; x < CHUNK; x++) {
        const b = data[index(x, y, z)];
        if (b === AIR) continue;
        const liquid = BLOCKS[b].kind === "liquid";
        const g = liquid ? out.water : out.solid;
        const uvs = BLOCK_UV[b];
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
            if (liquid && p[1] === 1 && get(x, y + 1, z) !== WATER) py -= 0.12; // 물 표면은 살짝 낮게
            g.pos.push(x + p[0], py, z + p[2]);
            g.uv.push(f.uv[i][0] ? u1 : u0, f.uv[i][1] ? v1 : v0);
            // 꼭짓점 그림자 — 면 앞쪽 이웃 3칸이 막혀 있을수록 어둡게
            let level = 3;
            if (!liquid) {
              const d1 = f.aoD1[i], d2 = f.aoD2[i];
              const o1 = isOccluder(get(nx + d1[0], ny + d1[1], nz + d1[2])) ? 1 : 0;
              const o2 = isOccluder(get(nx + d2[0], ny + d2[1], nz + d2[2])) ? 1 : 0;
              const oc = isOccluder(get(nx + d1[0] + d2[0], ny + d1[1] + d2[1], nz + d1[2] + d2[2])) ? 1 : 0;
              level = o1 && o2 ? 0 : 3 - (o1 + o2 + oc);
            }
            ao.push(level);
            const l = f.light * AO_LEVEL[level];
            g.col.push(l, l, l);
          }
          // 그림자가 대각선으로 갈라지지 않게 삼각형 나누는 방향을 고른다
          if (ao[0] + ao[2] >= ao[1] + ao[3]) g.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
          else g.idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
        }
      }
    }
  }

  const make = (g, mat) => {
    if (!g.idx.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(g.pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(g.col, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(g.uv, 2));
    geo.setIndex(g.idx);
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, mat);
    m.position.set(c.cx * CHUNK, 0, c.cz * CHUNK);
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    return m;
  };
  disposeMeshes(c);
  c.meshes = [make(out.solid, solidMat), make(out.water, waterMat)].filter(Boolean);
  for (const m of c.meshes) scene.add(m);
  c.dirty = false;
}

function disposeMeshes(c) {
  if (!c.meshes) return;
  for (const m of c.meshes) { scene.remove(m); m.geometry.dispose(); }
  c.meshes = null;
}

/** 플레이어 주변 청크를 가까운 것부터 조금씩 만든다 (한 프레임에 너무 오래 걸리지 않게) */
function updateChunks() {
  const pcx = Math.floor(player.pos.x / CHUNK), pcz = Math.floor(player.pos.z / CHUNK);
  const todo = [];
  for (let dz = -RENDER_DIST; dz <= RENDER_DIST; dz++) {
    for (let dx = -RENDER_DIST; dx <= RENDER_DIST; dx++) {
      const d = dx * dx + dz * dz;
      if (d > RENDER_DIST * RENDER_DIST) continue;
      const c = chunks.get(ckey(pcx + dx, pcz + dz));
      if (!c || c.dirty || !c.meshes) todo.push([d, pcx + dx, pcz + dz]);
    }
  }
  todo.sort((a, b) => a[0] - b[0]);
  const t0 = performance.now();
  for (const [, cx, cz] of todo) {
    buildMesh(chunkData(cx, cz));
    if (performance.now() - t0 > 8) break;
  }
  // 멀어진 청크 정리
  for (const [k, c] of chunks) {
    const dx = c.cx - pcx, dz = c.cz - pcz;
    if (dx * dx + dz * dz > (RENDER_DIST + 3) ** 2) { disposeMeshes(c); chunks.delete(k); }
  }
  return todo.length;
}

// ── 플레이어 ───────────────────────────────────────────────
const player = {
  pos: new THREE.Vector3(0, 60, 0), vel: new THREE.Vector3(), yaw: 0, pitch: 0,
  onGround: false, flying: false, inWater: false,
};
const keys = new Set();
let hotbar = DEFAULT_HOTBAR.slice();
try { const h = JSON.parse(localStorage.getItem("tzc-hotbar") ?? "null"); if (Array.isArray(h) && h.length === 9) hotbar = h; } catch { /* 기본값 */ }
let slot = 0;

function collides(px, py, pz) {
  const x0 = Math.floor(px - PW), x1 = Math.floor(px + PW);
  const y0 = Math.floor(py), y1 = Math.floor(py + PH - 0.01);
  const z0 = Math.floor(pz - PW), z1 = Math.floor(pz + PW);
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    if (isSolid(getBlock(x, y, z))) return true;
  }
  return false;
}

function physics(dt) {
  // 빠르게 떨어질 때 얇은 바닥을 뚫지 않도록 잘게 나눠 계산
  const n = Math.ceil(dt / 0.016);
  for (let i = 0; i < n; i++) physicsStep(dt / n);
}

function physicsStep(dt) {
  const p = player;
  const fwd = (keys.has("KeyW") ? 1 : 0) - (keys.has("KeyS") ? 1 : 0);
  const side = (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0);
  const sprint = keys.has("ShiftLeft") || keys.has("ShiftRight");
  p.inWater = getBlock(Math.floor(p.pos.x), Math.floor(p.pos.y + 0.4), Math.floor(p.pos.z)) === WATER;

  const speed = p.flying ? 11 : p.inWater ? 2.6 : sprint ? 5.8 : 4.3;
  const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
  let mx = (-sin * fwd + cos * side), mz = (-cos * fwd - sin * side);
  const len = Math.hypot(mx, mz);
  if (len > 0) { mx /= len; mz /= len; }
  const accel = p.onGround || p.flying ? 14 : 4;
  p.vel.x += (mx * speed - p.vel.x) * Math.min(1, accel * dt);
  p.vel.z += (mz * speed - p.vel.z) * Math.min(1, accel * dt);

  if (p.flying) {
    const up = (keys.has("Space") ? 1 : 0) - (sprint ? 1 : 0);
    p.vel.y += (up * 9 - p.vel.y) * Math.min(1, 12 * dt);
  } else if (p.inWater) {
    p.vel.y -= 9 * dt;
    if (keys.has("Space")) p.vel.y = Math.min(p.vel.y + 22 * dt, 3.2);
    p.vel.y = Math.max(p.vel.y, -3);
  } else {
    p.vel.y -= 28 * dt;
    if (keys.has("Space") && p.onGround) p.vel.y = 8.6;
    p.vel.y = Math.max(p.vel.y, -50);
  }

  // 축마다 따로 움직여 벽에 미끄러지듯 막히게
  p.onGround = false;
  for (const ax of ["x", "y", "z"]) {
    const step = p.vel[ax] * dt;
    if (!step) continue;
    const next = p.pos.clone();
    next[ax] += step;
    if (!collides(next.x, next.y, next.z)) { p.pos.copy(next); continue; }
    if (ax === "y") {
      if (step < 0) { p.onGround = true; p.pos.y = Math.floor(p.pos.y + step) + 1; }
      else p.pos.y = Math.floor(p.pos.y + step + PH) - PH - 0.001;
      if (collides(p.pos.x, p.pos.y, p.pos.z)) p.pos.y = next.y - step; // 안전장치
    }
    p.vel[ax] = 0;
  }
  if (p.pos.y < -30) respawn(); // 세상 밖으로 떨어지면 처음 위치로
}

let spawnPoint = [0.5, 60, 0.5];
function respawn() {
  player.pos.set(...spawnPoint);
  player.vel.set(0, 0, 0);
  placeAboveGround();
}
/** 끼인 곳에 나타나지 않게 위로 올린다 */
function placeAboveGround() {
  let guard = 0;
  while (collides(player.pos.x, player.pos.y, player.pos.z) && guard++ < HEIGHT) player.pos.y += 1;
}

// ── 블록 고르기 (시선 끝 블록) ─────────────────────────────
function raycast() {
  const o = camera.position, d = new THREE.Vector3();
  camera.getWorldDirection(d);
  let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
  const sx = Math.sign(d.x), sy = Math.sign(d.y), sz = Math.sign(d.z);
  const tdx = Math.abs(1 / d.x), tdy = Math.abs(1 / d.y), tdz = Math.abs(1 / d.z);
  let tx = (sx > 0 ? x + 1 - o.x : o.x - x) * tdx;
  let ty = (sy > 0 ? y + 1 - o.y : o.y - y) * tdy;
  let tz = (sz > 0 ? z + 1 - o.z : o.z - z) * tdz;
  let face = [0, 0, 0];
  for (let t = 0; t <= REACH;) {
    const b = getBlock(x, y, z);
    if (b !== AIR && b !== WATER) return { x, y, z, b, face };
    if (tx < ty && tx < tz) { x += sx; t = tx; tx += tdx; face = [-sx, 0, 0]; }
    else if (ty < tz) { y += sy; t = ty; ty += tdy; face = [0, -sy, 0]; }
    else { z += sz; t = tz; tz += tdz; face = [0, 0, -sz]; }
  }
  return null;
}

const highlight = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)),
  new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6 }),
);
highlight.visible = false;
scene.add(highlight);

function breakBlock() {
  const hit = raycast();
  if (!hit || BLOCKS[hit.b]?.unbreakable || hit.y < 1) return;
  setBlock(hit.x, hit.y, hit.z, AIR);
  send({ t: "set", x: hit.x, y: hit.y, z: hit.z, b: AIR });
}

function placeBlock() {
  const hit = raycast();
  if (!hit) return;
  const x = hit.x + hit.face[0], y = hit.y + hit.face[1], z = hit.z + hit.face[2];
  if (y < 1 || y >= HEIGHT) return;
  const cur = getBlock(x, y, z);
  if (cur !== AIR && cur !== WATER) return;
  const b = hotbar[slot];
  // 내 몸이나 다른 사람 몸 자리에는 못 놓는다
  if (BLOCKS[b].kind !== "liquid") {
    const bodies = [player.pos, ...[...others.values()].map((o) => o.target)];
    for (const p of bodies) {
      if (x + 1 > p.x - PW && x < p.x + PW && y + 1 > p.y && y < p.y + PH && z + 1 > p.z - PW && z < p.z + PW) return;
    }
  }
  setBlock(x, y, z, b);
  send({ t: "set", x, y, z, b });
}

function pickBlock() {
  const hit = raycast();
  if (!hit) return;
  const at = hotbar.indexOf(hit.b);
  if (at >= 0) selectSlot(at);
  else { hotbar[slot] = hit.b; saveHotbar(); renderHotbar(); }
}

// ── 다른 플레이어 ──────────────────────────────────────────
const others = new Map(); // id → { name, group, target, rot, legs, walk }

function nameSprite(text) {
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");
  ctx.font = "bold 40px Malgun Gothic, sans-serif";
  const w = Math.ceil(ctx.measureText(text).width) + 24;
  c.width = w; c.height = 56;
  ctx.font = "bold 40px Malgun Gothic, sans-serif";
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(0, 0, w, 56);
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 12, 30);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set((w / 56) * 0.32, 0.32, 1);
  s.renderOrder = 999;
  return s;
}

function addOther({ id, name, color, p, r }) {
  if (others.has(id)) return;
  const shirt = new THREE.Color().setHSL(color / 360, 0.55, 0.5);
  const box = (w, h, d, col) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color: col }));
  const group = new THREE.Group();
  const body = box(0.5, 0.72, 0.28, shirt); body.position.y = 1.1;
  const head = box(0.48, 0.48, 0.48, 0xf0c8a0); head.position.y = 1.72;
  const hair = box(0.5, 0.14, 0.5, 0x3b2a1a); hair.position.y = 1.93;
  const eyeL = box(0.08, 0.08, 0.02, 0x222222); eyeL.position.set(-0.11, 1.75, -0.25);
  const eyeR = eyeL.clone(); eyeR.position.x = 0.11;
  const legL = box(0.24, 0.74, 0.26, 0x2c3e70); legL.geometry.translate(0, -0.37, 0); legL.position.set(-0.13, 0.74, 0);
  const legR = legL.clone(); legR.position.x = 0.13;
  const armL = box(0.2, 0.7, 0.24, shirt); armL.geometry.translate(0, -0.33, 0); armL.position.set(-0.36, 1.44, 0);
  const armR = armL.clone(); armR.position.x = 0.36;
  const tag = nameSprite(name); tag.position.y = 2.3;
  group.add(body, head, hair, eyeL, eyeR, legL, legR, armL, armR, tag);
  group.position.set(...p);
  scene.add(group);
  others.set(id, { id, name, color, group, head, legs: [legL, legR], arms: [armL, armR], target: new THREE.Vector3(...p), rot: r ?? [0, 0], walk: 0 });
  renderPlayerList();
}

function removeOther(id) {
  const o = others.get(id);
  if (!o) return;
  scene.remove(o.group);
  o.group.traverse((m) => { m.geometry?.dispose(); m.material?.map?.dispose(); m.material?.dispose(); });
  others.delete(id);
  renderPlayerList();
}

function animateOthers(dt) {
  for (const o of others.values()) {
    const g = o.group;
    const before = g.position.clone();
    g.position.lerp(o.target, Math.min(1, dt * 12));
    g.rotation.y = o.rot[0];
    o.head.rotation.x = 0;
    const moved = before.distanceTo(g.position) / Math.max(dt, 0.001);
    o.walk += dt * Math.min(moved, 6) * 2.2;
    const swing = moved > 0.3 ? Math.sin(o.walk) * 0.7 : 0;
    o.legs[0].rotation.x = swing; o.legs[1].rotation.x = -swing;
    o.arms[0].rotation.x = -swing; o.arms[1].rotation.x = swing;
  }
}

// ── 네트워크 ───────────────────────────────────────────────
let ws = null, myName = "", connected = false, worldReady = false;
const send = (o) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };

function connect(name) {
  myName = name;
  $("startError").textContent = "";
  $("joinBtn").disabled = true;
  ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
  ws.onopen = () => send({ t: "hello", name });
  ws.onerror = () => { $("startError").textContent = "서버에 연결하지 못했습니다. 서버가 켜져 있는지 확인하세요."; };
  ws.onclose = () => {
    $("joinBtn").disabled = false;
    if (connected) {
      connected = false;
      chat("", "서버와 연결이 끊겼습니다. 새로고침(F5)해서 다시 접속하세요.");
      document.exitPointerLock?.();
    }
  };
  ws.onmessage = (ev) => {
    let m;
    try { m = JSON.parse(ev.data); } catch { return; }
    if (m.t === "error") { $("startError").textContent = m.msg; $("joinBtn").disabled = false; ws.close(); }
    else if (m.t === "welcome") onWelcome(m);
    else if (m.t === "join") { addOther(m); }
    else if (m.t === "leave") removeOther(m.id);
    else if (m.t === "move") { const o = others.get(m.id); if (o) { o.target.set(...m.p); o.rot = m.r; } }
    else if (m.t === "set") setBlock(m.x, m.y, m.z, m.b);
    else if (m.t === "chat") chat(m.name, m.msg);
  };
}

function onWelcome(m) {
  connected = true;
  seed = m.seed;
  editsByChunk.clear();
  for (const [pos, b] of Object.entries(m.edits)) { const [x, y, z] = pos.split(",").map(Number); addEdit(x, y, z, b); }
  spawnPoint = m.spawn;
  player.pos.set(...m.spawn);
  for (const o of m.players) addOther(o);
  localStorage.setItem("tzc-name", myName);
  $("start").classList.add("hidden");
  $("hud").classList.remove("hidden");
  $("loading").classList.remove("hidden");
  renderHotbar();
  chat("", `${myName} 님, 테크젠 크래프트에 오신 걸 환영합니다! 화면을 클릭하면 시작합니다.`);
  uiMode = "pause";
  $("resumeBtn").textContent = "클릭해서 시작하기";
  $("pause").classList.remove("hidden");
  renderPlayerList();
}

let lastSent = 0, lastSentPos = "";
function sendMove(now) {
  if (now - lastSent < 100) return;
  const p = [player.pos.x, player.pos.y, player.pos.z].map((v) => Math.round(v * 100) / 100);
  const r = [Math.round(player.yaw * 100) / 100, Math.round(player.pitch * 100) / 100];
  const s = p.join() + r.join();
  if (s === lastSentPos) return;
  lastSent = now; lastSentPos = s;
  send({ t: "move", p, r });
}

// ── UI ─────────────────────────────────────────────────────
function blockIcon(b, size = 36) {
  const c = document.createElement("canvas");
  c.width = c.height = 16;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  const [sx, sy, sw, sh] = atlas.rect(BLOCKS[b].tex[2]);
  ctx.drawImage(atlas.canvas, sx, sy, sw, sh, 0, 0, 16, 16);
  c.style.width = c.style.height = `${size}px`;
  return c;
}

function renderHotbar() {
  const bar = $("hotbar");
  bar.innerHTML = "";
  hotbar.forEach((b, i) => {
    const s = document.createElement("div");
    s.className = `slot${i === slot ? " on" : ""}`;
    s.append(blockIcon(b));
    const n = document.createElement("span"); n.className = "num"; n.textContent = i + 1;
    s.append(n);
    bar.append(s);
  });
  showBlockName();
}
let nameTimer = 0;
function showBlockName() {
  const el = $("blockName");
  el.textContent = BLOCKS[hotbar[slot]].name;
  el.style.opacity = 1;
  clearTimeout(nameTimer);
  nameTimer = setTimeout(() => (el.style.opacity = 0), 1500);
}
function selectSlot(i) { slot = (i + 9) % 9; renderHotbar(); $("invSlot").textContent = slot + 1; }
const saveHotbar = () => localStorage.setItem("tzc-hotbar", JSON.stringify(hotbar));

function buildInventory() {
  const grid = $("invGrid");
  grid.innerHTML = "";
  for (let b = 1; b < BLOCK_COUNT; b++) {
    const it = document.createElement("div");
    it.className = "invItem";
    it.append(blockIcon(b, 40), document.createTextNode(BLOCKS[b].name));
    it.onclick = () => { hotbar[slot] = b; saveHotbar(); renderHotbar(); };
    grid.append(it);
  }
}

function chat(name, msg) {
  const log = $("chatLog");
  const line = document.createElement("div");
  line.className = `chatLine${name ? "" : " sys"}`;
  if (name) { const w = document.createElement("span"); w.className = "who"; w.textContent = `${name}: `; line.append(w); }
  line.append(document.createTextNode(msg));
  log.append(line);
  while (log.children.length > 10) log.firstChild.remove();
  setTimeout(() => { line.style.opacity = 0; }, 10_000);
  setTimeout(() => line.remove(), 11_000);
}

function renderPlayerList() {
  const rows = [{ name: `${myName} (나)`, color: null }, ...[...others.values()].map((o) => ({ name: o.name, color: o.color }))];
  const html = `<b>접속자 ${rows.length}명</b>` + rows.map((r) =>
    `<div class="pl"><span class="dot" style="background:${r.color == null ? "#fff" : `hsl(${r.color},55%,50%)`}"></span>${escapeHtml(r.name)}</div>`).join("");
  $("playerList").innerHTML = html;
  $("pausePlayers").innerHTML = html;
}
const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// ── 입력 ───────────────────────────────────────────────────
let uiMode = "start"; // start · play · pause · chat · inventory
const locked = () => document.pointerLockElement === canvas;
/** 마우스 잠그기 — 클릭 없이 요청하면 브라우저가 거절할 수 있어 오류는 무시한다 */
function lockPointer() {
  try { const r = canvas.requestPointerLock?.(); r?.catch?.(() => {}); } catch { /* 클릭하면 다시 시도 */ }
}

function openChat(prefix = "") {
  uiMode = "chat";
  document.exitPointerLock?.();
  const input = $("chatInput");
  input.classList.remove("hidden");
  input.value = prefix;
  setTimeout(() => input.focus(), 0);
}
function closeChat() {
  $("chatInput").classList.add("hidden");
  $("chatInput").blur();
  uiMode = "pause";
  lockPointer();
}
function toggleInventory(open) {
  uiMode = open ? "inventory" : "pause";
  $("inventory").classList.toggle("hidden", !open);
  $("invSlot").textContent = slot + 1;
  if (open) { document.exitPointerLock?.(); $("pause").classList.add("hidden"); }
  else lockPointer();
}

document.addEventListener("pointerlockchange", () => {
  if (!connected) return;
  if (locked()) { uiMode = "play"; $("pause").classList.add("hidden"); $("resumeBtn").textContent = "클릭해서 계속하기"; }
  else if (uiMode === "play") { uiMode = "pause"; $("pause").classList.remove("hidden"); keys.clear(); }
});
canvas.addEventListener("click", () => { if (connected && !locked() && uiMode !== "chat") lockPointer(); });
$("resumeBtn").onclick = () => lockPointer();

document.addEventListener("mousemove", (e) => {
  if (!locked()) return;
  player.yaw -= e.movementX * 0.0022;
  player.pitch -= e.movementY * 0.0022;
  player.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, player.pitch));
});

let mouseHeld = -1, mouseRepeat = 0;
document.addEventListener("mousedown", (e) => {
  if (!locked()) return;
  if (e.button === 0) breakBlock();
  else if (e.button === 2) placeBlock();
  else if (e.button === 1) { e.preventDefault(); pickBlock(); }
  mouseHeld = e.button; mouseRepeat = performance.now() + 300;
});
document.addEventListener("mouseup", () => { mouseHeld = -1; });
document.addEventListener("contextmenu", (e) => e.preventDefault());
document.addEventListener("wheel", (e) => { if (locked()) selectSlot(slot + Math.sign(e.deltaY)); }, { passive: true });

let lastSpace = 0, debugOn = false;
document.addEventListener("keydown", (e) => {
  if (uiMode === "chat") {
    if (e.code === "Enter") {
      const msg = $("chatInput").value.trim();
      if (msg === "/spawn") respawn();
      else if (msg) send({ t: "chat", msg });
      closeChat();
    } else if (e.code === "Escape") closeChat();
    return;
  }
  if (uiMode === "start") return;
  if (e.code === "KeyE") { e.preventDefault(); toggleInventory(uiMode !== "inventory"); return; }
  if (uiMode === "inventory") { if (e.code === "Escape") toggleInventory(false); return; }
  if (e.code === "KeyT" || e.code === "Enter") { e.preventDefault(); openChat(); return; }
  if (e.code === "Slash") { e.preventDefault(); openChat("/"); return; }
  if (e.code === "Tab") { e.preventDefault(); renderPlayerList(); $("playerList").classList.remove("hidden"); return; }
  if (e.code === "F3") { e.preventDefault(); debugOn = !debugOn; $("debug").classList.toggle("hidden", !debugOn); return; }
  if (!locked()) return;
  if (e.code.startsWith("Digit") && e.code !== "Digit0") selectSlot(Number(e.code.slice(5)) - 1);
  if (e.code === "KeyF") { player.flying = !player.flying; player.vel.y = 0; updateMode(); }
  if (e.code === "Space") {
    const now = performance.now();
    if (now - lastSpace < 280) { player.flying = !player.flying; player.vel.y = 0; updateMode(); }
    lastSpace = now;
  }
  keys.add(e.code);
});
document.addEventListener("keyup", (e) => {
  keys.delete(e.code);
  if (e.code === "Tab") $("playerList").classList.add("hidden");
});
function updateMode() { $("mode").textContent = player.flying ? "✈ 날기 (Space 위 · Shift 아래 · F 끄기)" : ""; }

$("nameInput").value = localStorage.getItem("tzc-name") ?? "";
$("joinForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("nameInput").value.trim();
  if (!name) { $("startError").textContent = "닉네임을 입력하세요."; return; }
  connect(name);
});
buildInventory();

// ── 루프 ───────────────────────────────────────────────────
const waterOverlay = document.createElement("div");
waterOverlay.id = "water"; waterOverlay.className = "hidden";
document.body.append(waterOverlay);

let last = performance.now(), fps = 0, frames = 0, fpsAt = last;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (connected) {
    const pending = updateChunks();
    const here = chunks.get(ckey(Math.floor(player.pos.x / CHUNK), Math.floor(player.pos.z / CHUNK)));
    if (!worldReady && here?.meshes) {
      worldReady = true;
      placeAboveGround();
      $("loading").classList.add("hidden");
    }
    if (worldReady) {
      if (uiMode === "play") physics(dt);
      if (mouseHeld >= 0 && locked() && now > mouseRepeat) {
        if (mouseHeld === 0) breakBlock(); else if (mouseHeld === 2) placeBlock();
        mouseRepeat = now + 220;
      }
      sendMove(now);
    }
    camera.position.set(player.pos.x, player.pos.y + EYE, player.pos.z);
    camera.rotation.set(player.pitch, player.yaw, 0);
    const hit = locked() ? raycast() : null;
    highlight.visible = !!hit;
    if (hit) highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    const eyeInWater = getBlock(Math.floor(camera.position.x), Math.floor(camera.position.y), Math.floor(camera.position.z)) === WATER;
    waterOverlay.classList.toggle("hidden", !eyeInWater);
    animateOthers(dt);
    frames++;
    if (now - fpsAt > 500) { fps = Math.round((frames * 1000) / (now - fpsAt)); frames = 0; fpsAt = now; }
    if (debugOn) {
      const p = player.pos;
      $("debug").textContent = `FPS ${fps}\nXYZ ${p.x.toFixed(1)} / ${p.y.toFixed(1)} / ${p.z.toFixed(1)}\n청크 ${chunks.size} (남은 ${pending})\n접속자 ${others.size + 1}명`;
    }
  }
  renderer.render(scene, camera);
}
requestAnimationFrame(loop);

// 테스트 · 디버깅용
window.__game = { player, others, chunks, getBlock, setBlock, send, breakBlock, placeBlock, raycast, camera, get connected() { return connected; }, get ready() { return worldReady; } };
