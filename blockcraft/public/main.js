// TECZEN WORLD — 브라우저 쪽 게임
//   첫 화면 · 로그인 → 월드 접속 → 1인칭 이동 · 캐기 · 놓기 · 전투 · 인벤토리 · HUD
//   인벤토리 · 체력 · 조합 결과는 서버가 정하고, 여기서는 먼저 보여 준 뒤 서버 결과에 맞춘다.
import * as THREE from "./vendor/three.module.min.js";
import { BLOCKS, AIR, B, isSolid, isTargetable, needsSupport, isOpaque } from "/shared/blocks.js";
import { ITEMS, digSeconds } from "/shared/items.js";
import { MOBS, MOB } from "/shared/mobs.js";
import { roomFor, addItem } from "/shared/inventory.js";
import { newState, applyOp, digest, wear, useOne } from "/shared/invops.js";
import { HEIGHT, column, BIOME } from "/shared/worldgen.js";
import { buildAtlas, buildSkins, hudIcon } from "./textures.js";
import { WorldView, makeMaterials, brightness } from "./render/world.js";
import { Sky, daylightAt } from "./render/sky.js";
import { initModels, makeHumanoid, animateHumanoid, makeMob, animateMob, tint, makeItemMesh, makeArrow, disposeTree, Hand, Particles, nameSprite, setArmor } from "./render/models.js";
import { InventoryUI, fillSlot } from "./ui/inventory.js";
import { sfx, unlock, setVolume } from "./sound.js";

THREE.ColorManagement.enabled = false;
const $ = (id) => document.getElementById(id);
const VERSION = "2.0.0";
const REACH = 5, ATTACK_REACH = 3.6;
const PW = 0.3;
const WATER = B.WATER, LAVA = B.LAVA;

// ── 설정 ───────────────────────────────────────────────────
const settings = { sens: 100, dist: 6, fov: 75, bright: 50, vol: 60, gfx: "high" };
try { Object.assign(settings, JSON.parse(localStorage.getItem("tzw-settings") ?? "{}")); } catch { /* 기본값 */ }
const saveSettings = () => { try { localStorage.setItem("tzw-settings", JSON.stringify(settings)); } catch { /* 무시 */ } };

// ── 렌더러 ─────────────────────────────────────────────────
const canvas = $("game");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.autoClear = false;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x8ec5ff, 60, 90);
const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 1000);
camera.rotation.order = "YXZ";

const atlas = buildAtlas();
const atlasTex = new THREE.CanvasTexture(atlas.canvas);
atlasTex.magFilter = atlasTex.minFilter = THREE.NearestFilter;
atlasTex.generateMipmaps = false;
const skins = buildSkins();
const skinTex = new THREE.CanvasTexture(skins.canvas);
skinTex.magFilter = skinTex.minFilter = THREE.NearestFilter;
skinTex.generateMipmaps = false;
initModels(skins, skinTex, atlas, atlasTex);

const mats = makeMaterials(atlasTex);
const world = new WorldView(scene, atlas, mats);
const sky = new Sky(scene);
const hand = new Hand();
const particles = new Particles(scene, world);

function applySettings() {
  const low = settings.gfx === "low";
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, low ? 0.75 : settings.gfx === "mid" ? 1 : 1.5));
  world.renderDist = Math.min(settings.dist, low ? 5 : 12);
  camera.fov = settings.fov;
  camera.updateProjectionMatrix();
  mats.shared.gamma.value = 1 - settings.bright / 100 * 0.45; // 밝기 높을수록 어두운 곳이 밝게
  sky.clouds.visible = !low;
  setVolume(settings.vol / 100);
  resize();
}
function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);

// ── 게임 상태 ──────────────────────────────────────────────
const game = {
  token: null, me: null, realm: null, connected: false, ready: false,
  id: 0, name: "", admin: false, hue: 200, mode: "survival", dead: false,
  st: newState(), sel: 0,
  hp: 20, food: 20, armor: 0, lvl: 0, prog: 0, air: 300,
  time: 1000, timeAt: performance.now(), weather: "clear", rules: {},
  spawn: [0.5, 60, 0.5], view: 0,
};
const player = {
  pos: new THREE.Vector3(0, 60, 0), vel: new THREE.Vector3(), yaw: 0, pitch: 0,
  onGround: false, flying: false, inWater: false, inLava: false, headWater: false,
  sprint: false, sneak: false, fallTop: null, walkDist: 0, stepAt: 0,
};
const keys = new Set();

// ── 네트워크 ───────────────────────────────────────────────
let ws = null;
const net = (o) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };

function op(o, send = true) {
  applyOp(game.st, o, game.mode);
  if (send) net({ t: "op", op: o, d: digest(game.st) });
  changed();
}

const ui = new InventoryUI({
  get st() { return game.st; },
  get mode() { return game.mode; },
  get hue() { return game.hue; },
  op: (o) => op(o),
  cop: (o) => net({ t: "cop", op: o }),
  closeBox: () => { applyOp(game.st, { o: "close" }, game.mode); net({ t: "cclose" }); },
  sfx, changed: () => changed(),
});

function connect(realm) {
  disconnect();
  game.realm = realm;
  $("loading").textContent = "서버에 연결하는 중...";
  $("loading").classList.remove("hidden");
  ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
  ws.onopen = () => net({ t: "hello", token: game.token, realm });
  ws.onerror = () => toast("서버에 연결하지 못했습니다. 서버가 켜져 있는지 확인하세요.");
  ws.onclose = () => {
    if (game.connected) { game.connected = false; toast(game.kickMsg ?? "서버와 연결이 끊겼습니다."); showTitle(); }
    $("loading").classList.add("hidden");
  };
  ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch { return; } onMessage(m); };
}
function disconnect() {
  if (ws) { ws.onclose = null; ws.close(); ws = null; }
  game.connected = false;
  game.ready = false;
  for (const id of [...others.keys()]) removeOther(id);
  for (const id of [...mobs.keys()]) removeMob(id);
  for (const id of [...drops.keys()]) removeDrop(id);
  for (const id of [...arrows.keys()]) removeArrow(id);
}

function onMessage(m) {
  switch (m.t) {
    case "auth": game.token = null; store("tzw-token", null); showTitle(); openLogin("다시 로그인해 주세요."); return;
    case "kick": game.kickMsg = m.msg; return;
    case "welcome": return onWelcome(m);
    case "join": addOther(m); return;
    case "leave": removeOther(m.id); renderPlayers(); return;
    case "move": { const o = others.get(m.id); if (o) { o.target.set(...m.p); o.rot = m.r; o.flags = m.f ?? 0; } return; }
    case "held": { const o = others.get(m.id); if (o) setOtherHeld(o, m.held); return; }
    case "swing": { const o = others.get(m.id); if (o) o.model.swing = 1; return; }
    case "phurt": { const o = others.get(m.id); if (o) { o.flash = 0.4; if (o.model.root.position.distanceTo(player.pos) < 24) sfx.hurt(); } return; }
    case "pdead": { const o = others.get(m.id); if (o) { o.dead = true; o.model.root.visible = false; } return; }
    case "prespawn": { const o = others.get(m.id); if (o) { o.dead = false; o.model.root.visible = true; o.target.set(...m.p); o.model.root.position.set(...m.p); } return; }
    case "sets": return onSets(m);
    case "ents": return onEnts(m);
    case "take": return onTake(m);
    case "mobhurt": { const e = mobs.get(m.id); if (e) { e.flash = 0.4; sfx.mobHurt(); } return; }
    case "mobdie": return onMobDie(m);
    case "hiss": sfx.hiss(); return;
    case "boom": return onBoom(m);
    case "hurt": return onHurt(m);
    case "stats": return onStats(m);
    case "sync": return onSync(m);
    case "give": addItem(game.st.inv, m.item); sfx.pop(); changed(); return;
    case "toolbreak": sfx.toolBreak(); return;
    case "box": ui.setBox(m); return;
    case "dead": return onDead(m);
    case "respawn": return onRespawn(m);
    case "tp": player.pos.set(...m.p); player.vel.set(0, 0, 0); player.fallTop = null; return;
    case "time": game.time = m.time; game.timeAt = performance.now(); return;
    case "weather": game.weather = m.weather; return;
    case "rules": game.rules = m.rules; return;
    case "spawn": game.spawn = m.spawn; return;
    case "mode": game.mode = m.mode; if (m.mode !== "creative") player.flying = false; updateMode(); if (ui.isOpen) ui.close(); renderHud(); return;
    case "admin": game.admin = m.admin; return;
    case "chat": chatLine(m.name, m.msg); return;
    case "notice": chatLine("", m.msg, "notice"); toast(m.msg); return;
  }
}

function onWelcome(m) {
  game.connected = true;
  game.kickMsg = null;
  Object.assign(game, { id: m.id, name: m.name, admin: m.admin, hue: m.color, mode: m.mode, spawn: m.spawn, time: m.time, timeAt: performance.now(), weather: m.weather, rules: m.rules, dead: false, title: m.title });
  hand.setLook(m.color);
  game.st = newState();
  m.inv.forEach((s, i) => { game.st.inv[i] = s; });
  m.armor.forEach((s, i) => { game.st.armor[i] = s; });
  game.sel = m.sel ?? 0;
  world.reset(m.seed, m.edits);
  player.pos.set(...m.p);
  player.yaw = m.r?.[0] ?? 0; player.pitch = m.r?.[1] ?? 0;
  player.vel.set(0, 0, 0);
  player.flying = false; player.fallTop = null;
  game.air = 300;
  for (const o of m.players) addOther(o);
  hideTitle();
  $("hud").classList.remove("hidden");
  $("loading").textContent = "월드 불러오는 중...";
  $("loading").classList.remove("hidden");
  game.ready = false;
  chatLine("", `${m.title} — ${m.name} 님, TECZEN WORLD 에 오신 걸 환영합니다! 화면을 클릭하면 시작합니다.`);
  updateMode();
  changed();
  showPause(true);
}

function onSets(m) {
  for (const [x, y, z, b] of m.s) {
    const before = world.get(x, y, z);
    world.set(x, y, z, b);
    if (m.by && m.by !== game.id && b === AIR && before !== AIR) {
      particles.burst(x + 0.5, y + 0.5, z + 0.5, BLOCKS[before]?.tex[2] ?? "stone", 14, lightAtBlock(x, y, z));
      if (dist3(x, y, z) < 16) sfx.brk(BLOCKS[before]);
    } else if (m.put && dist3(x, y, z) < 16) sfx.place(BLOCKS[b]);
  }
}

function onStats(m) {
  const lost = m.hp < game.hp;
  Object.assign(game, { hp: m.hp, food: m.food, armor: m.armor, lvl: m.lvl, prog: m.prog });
  if (lost) $("hearts").classList.add("blink"), setTimeout(() => $("hearts").classList.remove("blink"), 400);
  renderHud();
}

function onSync(m) {
  const st = game.st;
  st.inv = m.inv; st.armor = m.armor; st.cursor = m.cursor; st.grid = m.grid ?? [];
  if (!m.screen && (ui.screen === "inv" || ui.screen === "table")) st.screen = ui.screen; else st.screen = m.screen;
  ui.synced();
  changed();
}

function onHurt(m) {
  sfx.hurt();
  const fx = $("hurtFx");
  fx.style.opacity = 1;
  setTimeout(() => { fx.style.opacity = 0; }, 250);
  game.hurtTilt = 1;
  if (m.from && m.kb) {
    const dx = player.pos.x - m.from[0], dz = player.pos.z - m.from[2], l = Math.hypot(dx, dz) || 1;
    player.vel.x += (dx / l) * 7 * m.kb; player.vel.z += (dz / l) * 7 * m.kb;
    player.vel.y = Math.max(player.vel.y, 5 * Math.min(1.5, m.kb));
  }
}

function onDead(m) {
  game.dead = true;
  uiMode = "dead";
  if (ui.isOpen) ui.close();
  document.exitPointerLock?.();
  $("deathWhy").textContent = m.why;
  $("death").classList.remove("hidden");
  $("pause").classList.add("hidden");
  keys.clear();
}
function onRespawn(m) {
  game.dead = false;
  game.air = 300;
  player.pos.set(...m.p);
  player.vel.set(0, 0, 0);
  player.fallTop = null;
  $("death").classList.add("hidden");
  lockPointer();
}

// ── 다른 플레이어 ──────────────────────────────────────────
const others = new Map();
function addOther(p) {
  if (others.has(p.id)) return;
  const model = makeHumanoid("player", p.color);
  const tag = nameSprite(p.name);
  tag.position.y = 2.25;
  model.root.add(tag);
  model.root.position.set(...p.p);
  scene.add(model.root);
  const o = { id: p.id, name: p.name, color: p.color, model, target: new THREE.Vector3(...p.p), rot: p.r ?? [0, 0], flags: p.f ?? 0, held: 0, heldMesh: null, dead: !!p.dead, last: new THREE.Vector3(...p.p) };
  model.root.visible = !o.dead;
  setOtherHeld(o, p.held ?? 0);
  if (p.armor) setArmor(model, p.armor);
  others.set(p.id, o);
  renderPlayers();
}
function setOtherHeld(o, id) {
  if (o.held === id) return;
  o.held = id;
  if (o.heldMesh) { o.model.hand.remove(o.heldMesh); disposeTree(o.heldMesh); o.heldMesh = null; }
  if (id) { o.heldMesh = makeItemMesh(id, 0.3); o.heldMesh.rotation.set(0, Math.PI / 2, 0); o.heldMesh.position.z = -0.1; o.model.hand.add(o.heldMesh); }
}
function removeOther(id) {
  const o = others.get(id);
  if (!o) return;
  scene.remove(o.model.root);
  disposeTree(o.model.root);
  others.delete(id);
}

// ── 몹 · 떨어진 아이템 · 화살 ──────────────────────────────
const mobs = new Map(), drops = new Map(), arrows = new Map();
function onEnts(m) {
  const now = performance.now();
  const seen = new Set();
  for (const [id, type, x, y, z, yaw, flags, extra] of m.m) {
    seen.add(id);
    let e = mobs.get(id);
    if (!e) {
      const model = makeMob(type, extra);
      model.root.position.set(x, y, z);
      scene.add(model.root);
      e = { id, type, model, target: new THREE.Vector3(x, y, z), yaw, flags, extra, flash: 0, dying: 0 };
      mobs.set(id, e);
    }
    e.target.set(x, y, z); e.yaw = yaw; e.flags = flags; e.extra = extra; e.seen = now;
  }
  for (const [id, e] of mobs) if (!seen.has(id) && !e.dying) removeMob(id);

  const seenI = new Set();
  for (const [id, item, n, x, y, z] of m.i) {
    seenI.add(id);
    let d = drops.get(id);
    if (!d) {
      const g = new THREE.Group();
      const mesh = makeItemMesh(item, 0.25);
      g.add(mesh);
      if (n > 1) { const m2 = makeItemMesh(item, 0.25); m2.position.set(0.06, 0.05, 0.06); g.add(m2); }
      g.position.set(x, y, z);
      scene.add(g);
      d = { id, item, n, g, target: new THREE.Vector3(x, y, z), phase: (id * 1.7) % 6.28, born: now };
      drops.set(id, d);
    }
    d.target.set(x, y, z); d.n = n;
  }
  for (const [id, d] of drops) if (!seenI.has(id) && !d.flying) removeDrop(id);

  const seenA = new Set();
  for (const [id, x, y, z, yaw, pitch] of m.a ?? []) {
    seenA.add(id);
    let a = arrows.get(id);
    if (!a) { const g = makeArrow(); g.position.set(x, y, z); scene.add(g); a = { g, target: new THREE.Vector3(x, y, z) }; arrows.set(id, a); }
    a.target.set(x, y, z);
    a.g.rotation.set(0, yaw, 0);
    a.g.rotateX(-pitch);
  }
  for (const id of [...arrows.keys()]) if (!seenA.has(id)) removeArrow(id);
}
function removeMob(id) { const e = mobs.get(id); if (!e) return; scene.remove(e.model.root); disposeTree(e.model.root); mobs.delete(id); }
function removeDrop(id) { const d = drops.get(id); if (!d) return; scene.remove(d.g); disposeTree(d.g); drops.delete(id); }
function removeArrow(id) { const a = arrows.get(id); if (!a) return; scene.remove(a.g); disposeTree(a.g); arrows.delete(id); }

function onTake(m) {
  const d = drops.get(m.id);
  if (!d) return;
  if (m.by === game.id) { d.flying = { to: null, t: 0 }; }
  else if (others.has(m.by)) { d.flying = { to: others.get(m.by), t: 0 }; }
  else if (m.by === -1) { particles.puff(d.g.position.x, d.g.position.y, d.g.position.z, 3, 0.15, 0x333333, 1); removeDrop(m.id); }
  else removeDrop(m.id);
}

function onMobDie(m) {
  const e = mobs.get(m.id);
  if (!e) return;
  e.dying = 0.9;
  e.flash = 1;
  sfx.mobDie();
}

function onBoom(m) {
  sfx.boom();
  particles.puff(m.p[0], m.p[1], m.p[2], 26, 0.7, 0xdddddd, 6);
  particles.puff(m.p[0], m.p[1], m.p[2], 10, 0.5, 0xffaa33, 4);
  const d = player.pos.distanceTo(new THREE.Vector3(...m.p));
  game.shake = Math.max(game.shake ?? 0, Math.max(0, 1 - d / 16));
}

// ── 빛 ─────────────────────────────────────────────────────
function lightAt(x, y, z) {
  const [s, l] = world.light(Math.floor(x), Math.floor(y), Math.floor(z));
  return brightness(s, l, mats.shared.daylight.value, mats.shared.gamma.value);
}
const lightAtBlock = (x, y, z) => Math.max(lightAt(x, y + 1, z), lightAt(x + 1, y, z), lightAt(x - 1, y, z), lightAt(x, y, z + 1), lightAt(x, y, z - 1));
const dist3 = (x, y, z) => Math.hypot(x + 0.5 - player.pos.x, y + 0.5 - player.pos.y, z + 0.5 - player.pos.z);

// ── 플레이어 움직임 ────────────────────────────────────────
const bodyH = () => (player.sneak && !player.flying ? 1.5 : 1.8);
const eyeH = () => (player.sneak && !player.flying ? 1.32 : 1.62);

function collides(px, py, pz, h = bodyH()) {
  const x0 = Math.floor(px - PW), x1 = Math.floor(px + PW);
  const y0 = Math.floor(py), y1 = Math.floor(py + h - 0.01);
  const z0 = Math.floor(pz - PW), z1 = Math.floor(pz + PW);
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    if (isSolid(world.get(x, y, z))) return true;
  }
  return false;
}
/** 발밑에 받쳐 주는 블록이 있나 (웅크리면 낭떠러지에서 안 떨어지게) */
const hasGround = (px, py, pz) => collides(px, py - 0.08, pz, 0.05);
const touching = (b, grow = 0.02) => {
  const p = player.pos;
  for (let y = Math.floor(p.y); y <= Math.floor(p.y + bodyH() - 0.01); y++)
    for (let z = Math.floor(p.z - PW - grow); z <= Math.floor(p.z + PW + grow); z++)
      for (let x = Math.floor(p.x - PW - grow); x <= Math.floor(p.x + PW + grow); x++) if (world.get(x, y, z) === b) return true;
  return false;
};

let exAcc = 0, lastW = 0, envT = { lava: 0, cactus: 0, drown: 0 };
function physics(dt) {
  const n = Math.ceil(dt / 0.016);
  for (let i = 0; i < n; i++) physicsStep(dt / n);
}

function physicsStep(dt) {
  const p = player;
  const creative = game.mode === "creative";
  const fwd = (keys.has("KeyW") ? 1 : 0) - (keys.has("KeyS") ? 1 : 0);
  const side = (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0);
  p.sneak = (keys.has("ShiftLeft") || keys.has("ShiftRight")) && !p.flying;
  if (fwd <= 0 || p.sneak || (game.food <= 6 && !creative)) p.sprint = false;
  else if (keys.has("ControlLeft") || keys.has("ControlRight")) p.sprint = true;
  const feet = world.get(Math.floor(p.pos.x), Math.floor(p.pos.y + 0.1), Math.floor(p.pos.z));
  const waist = world.get(Math.floor(p.pos.x), Math.floor(p.pos.y + 0.6), Math.floor(p.pos.z));
  const wasWater = p.inWater;
  p.inWater = feet === WATER || waist === WATER;
  p.inLava = feet === LAVA || waist === LAVA;
  p.headWater = world.get(Math.floor(p.pos.x), Math.floor(p.pos.y + eyeH()), Math.floor(p.pos.z)) === WATER;
  if (p.inWater && !wasWater && p.vel.y < -4) sfx.splash();

  const speed = p.flying ? (p.sprint ? 22 : 11) : p.inLava ? 1.5 : p.inWater ? (p.sprint ? 3.6 : 2.6) : p.sneak ? 1.3 : p.sprint ? 5.6 : 4.3;
  const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
  let mx = -sin * fwd + cos * side, mz = -cos * fwd - sin * side;
  const len = Math.hypot(mx, mz);
  if (len > 0) { mx /= len; mz /= len; }
  const accel = p.onGround || p.flying || p.inWater ? 14 : 3.5;
  p.vel.x += (mx * speed - p.vel.x) * Math.min(1, accel * dt);
  p.vel.z += (mz * speed - p.vel.z) * Math.min(1, accel * dt);

  const jump = keys.has("Space");
  if (p.flying) {
    const up = (jump ? 1 : 0) - (keys.has("ShiftLeft") || keys.has("ShiftRight") ? 1 : 0);
    p.vel.y += (up * 9 - p.vel.y) * Math.min(1, 12 * dt);
  } else if (p.inWater || p.inLava) {
    p.vel.y -= (p.inLava ? 6 : 9) * dt;
    if (jump) p.vel.y = Math.min(p.vel.y + 22 * dt, p.inLava ? 2 : 3.2);
    p.vel.y = Math.max(p.vel.y, p.inLava ? -2 : -3);
  } else {
    p.vel.y -= 28 * dt;
    if (jump && p.onGround) {
      p.vel.y = 8.6;
      if (p.sprint) { p.vel.x += mx * 2; p.vel.z += mz * 2; }
      exAcc += p.sprint ? 0.2 : 0.05;
    }
    p.vel.y = Math.max(p.vel.y, -50);
  }

  const before = p.pos.clone();
  const wasGround = p.onGround;
  p.onGround = false;
  for (const ax of ["x", "y", "z"]) {
    const step = p.vel[ax] * dt;
    if (!step) continue;
    const next = p.pos.clone();
    next[ax] += step;
    // 웅크리고 있으면 가장자리에서 멈춘다
    if (ax !== "y" && p.sneak && wasGround && !p.inWater && !hasGround(next.x, next.y, next.z)) { p.vel[ax] = 0; continue; }
    if (!collides(next.x, next.y, next.z)) { p.pos.copy(next); continue; }
    if (ax === "y") {
      if (step < 0) { p.onGround = true; p.pos.y = Math.floor(p.pos.y + step) + 1; }
      else p.pos.y = Math.floor(p.pos.y + step + bodyH()) - bodyH() - 0.001;
      if (collides(p.pos.x, p.pos.y, p.pos.z)) p.pos.y = next.y - step;
    } else if (p.onGround || wasGround) {
      // 반 블록 정도는 자연스럽게 오르지 않음 — 한 칸은 점프해야 한다
    }
    p.vel[ax] = 0;
  }
  if (p.flying && p.onGround && creative) p.flying = false;

  // 걸은 거리 → 발소리 · 배고픔
  const moved = Math.hypot(p.pos.x - before.x, p.pos.z - before.z);
  if (p.onGround || p.inWater) {
    p.walkDist += moved;
    if (p.sprint) exAcc += moved * 0.1;
    if (p.inWater) exAcc += moved * 0.01;
    if (p.onGround && p.walkDist - p.stepAt > (p.sprint ? 1.9 : 1.5) && !p.sneak) {
      p.stepAt = p.walkDist;
      sfx.step(BLOCKS[world.get(Math.floor(p.pos.x), Math.floor(p.pos.y - 0.2), Math.floor(p.pos.z))]);
    }
  }

  // 낙하 피해 — 물에 떨어지면 피해 없음
  if (p.flying || p.inWater || p.inLava || creative) p.fallTop = null;
  else if (!p.onGround) p.fallTop = Math.max(p.fallTop ?? p.pos.y, p.pos.y);
  else if (p.fallTop != null) {
    const fall = p.fallTop - p.pos.y;
    p.fallTop = null;
    if (fall > 3.4) net({ t: "env", why: "fall", dmg: Math.floor(fall - 3) });
  }
}

/** 숨 · 용암 · 선인장 — 서버에 알린다 (서버가 체력을 깎는다) */
function survivalTick(dt) {
  if (game.mode !== "survival" || game.dead) { game.air = 300; return; }
  if (player.headWater) {
    game.air = Math.max(0, game.air - 20 * dt);
    if (game.air <= 0) { envT.drown += dt; if (envT.drown >= 1) { envT.drown = 0; net({ t: "env", why: "drown", dmg: 2 }); } }
  } else game.air = Math.min(300, game.air + 100 * dt);
  if (player.inLava) { envT.lava += dt; if (envT.lava >= 0.5) { envT.lava = 0; net({ t: "env", why: "lava", dmg: 4 }); } } else envT.lava = 0.5;
  if (touching(B.CACTUS, 0.04)) { envT.cactus += dt; if (envT.cactus >= 0.5) { envT.cactus = 0; net({ t: "env", why: "cactus", dmg: 1 }); } } else envT.cactus = 0.5;
}

function placeAboveGround() {
  let guard = 0;
  while (collides(player.pos.x, player.pos.y, player.pos.z) && guard++ < HEIGHT) player.pos.y += 1;
}

// ── 바라보는 블록 · 몹 ─────────────────────────────────────
const tmpDir = new THREE.Vector3();
function raycastBlock(reach = REACH) {
  const o = camera.position, d = tmpDir;
  camera.getWorldDirection(d);
  let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
  const sx = Math.sign(d.x), sy = Math.sign(d.y), sz = Math.sign(d.z);
  const tdx = Math.abs(1 / d.x), tdy = Math.abs(1 / d.y), tdz = Math.abs(1 / d.z);
  let tx = (sx > 0 ? x + 1 - o.x : o.x - x) * tdx;
  let ty = (sy > 0 ? y + 1 - o.y : o.y - y) * tdy;
  let tz = (sz > 0 ? z + 1 - o.z : o.z - z) * tdz;
  let face = [0, 0, 0], t = 0;
  while (t <= reach) {
    const b = world.get(x, y, z);
    if (isTargetable(b)) return { x, y, z, b, face, t };
    if (tx < ty && tx < tz) { x += sx; t = tx; tx += tdx; face = [-sx, 0, 0]; }
    else if (ty < tz) { y += sy; t = ty; ty += tdy; face = [0, -sy, 0]; }
    else { z += sz; t = tz; tz += tdz; face = [0, 0, -sz]; }
  }
  return null;
}
function rayBox(o, d, min, max) {
  let t0 = 0, t1 = Infinity;
  for (const ax of ["x", "y", "z"]) {
    const inv = 1 / d[ax];
    let a = (min[ax] - o[ax]) * inv, b = (max[ax] - o[ax]) * inv;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    if (t1 < t0) return null;
  }
  return t0;
}
function raycastEntity() {
  const o = camera.position, d = new THREE.Vector3();
  camera.getWorldDirection(d);
  let best = null;
  const test = (kind, id, p, w, h) => {
    const t = rayBox(o, d, { x: p.x - w, y: p.y, z: p.z - w }, { x: p.x + w, y: p.y + h, z: p.z + w });
    if (t != null && t <= ATTACK_REACH && (!best || t < best.t)) best = { kind, id, t };
  };
  for (const e of mobs.values()) if (!e.dying) test("mob", e.id, e.model.root.position, MOBS[e.type].w, MOBS[e.type].h);
  for (const o2 of others.values()) if (!o2.dead) test("player", o2.id, o2.model.root.position, 0.3, 1.8);
  return best;
}

const highlight = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)),
  new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55, fog: false }),
);
highlight.visible = false;
scene.add(highlight);
// 놓을 자리 미리보기
const ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, depthWrite: false, fog: false }));
ghost.visible = false;
scene.add(ghost);
// 금 간 모양
const crackGeo = new THREE.BoxGeometry(1.006, 1.006, 1.006);
const crack = new THREE.Mesh(crackGeo, new THREE.MeshBasicMaterial({ map: atlasTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, fog: false }));
crack.visible = false;
scene.add(crack);
const crackBaseUV = crackGeo.attributes.uv.array.slice();
let crackStage = -1;
function setCrack(stage) {
  if (stage === crackStage) return;
  crackStage = stage;
  const [u0, v0, u1, v1] = atlas.uv(`crack_${stage}`);
  const uv = crackGeo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + crackBaseUV[i * 2] * (u1 - u0), v0 + crackBaseUV[i * 2 + 1] * (v1 - v0));
  uv.needsUpdate = true;
}

// ── 캐기 · 공격 · 놓기 · 먹기 ──────────────────────────────
const dig = { active: false, x: 0, y: 0, z: 0, b: 0, progress: 0, total: 1, hitAt: 0, cool: 0 };
let mouseL = false, mouseR = false, rightRepeat = 0, attackCool = 0;
const held = () => game.st.inv[game.sel];
const heldId = () => held()?.id ?? 0;

function leftPress() {
  if (attackCool > 0) return;
  const ent = raycastEntity();
  const blk = raycastBlock();
  if (ent && (!blk || ent.t < blk.t)) {
    attackCool = 0.25;
    hand.doSwing();
    net({ t: "swing" });
    sfx.attack();
    // 도구 닳기도 서버와 똑같이 미리 해 둔다
    const it = ITEMS[heldId()];
    if (it?.tool && game.mode === "survival") { if (wear(game.st.inv, game.sel, it.tool === "sword" ? 1 : 2)) sfx.toolBreak(); changed(); }
    net(ent.kind === "mob" ? { t: "attack", mob: ent.id, d: digest(game.st) } : { t: "attack", pid: ent.id, d: digest(game.st) });
    exAcc += 0.1;
    return true;
  }
  return false;
}

function updateDig(dt) {
  dig.cool = Math.max(0, dig.cool - dt);
  if (!mouseL || !locked() || game.dead) { stopDig(); return; }
  const hit = raycastBlock();
  if (!hit || BLOCKS[hit.b]?.unbreakable) { stopDig(); return; }
  if (!dig.active || hit.x !== dig.x || hit.y !== dig.y || hit.z !== dig.z) {
    if (dig.cool > 0) return;
    Object.assign(dig, { active: true, x: hit.x, y: hit.y, z: hit.z, b: hit.b, progress: 0, total: game.mode === "creative" ? 0 : digSeconds(hit.b, heldId()), hitAt: 0 });
    net({ t: "digstart", x: hit.x, y: hit.y, z: hit.z });
  }
  dig.progress += dt;
  hand.doSwing();
  dig.hitAt -= dt;
  if (dig.hitAt <= 0 && dig.total > 0) {
    dig.hitAt = 0.25;
    sfx.hit(BLOCKS[dig.b]);
    particles.burst(dig.x + 0.5 + hit.face[0] * 0.5, dig.y + 0.5 + hit.face[1] * 0.5, dig.z + 0.5 + hit.face[2] * 0.5, BLOCKS[dig.b].tex[2], 2, lightAtBlock(dig.x, dig.y, dig.z), 0.6, 1.5);
  }
  if (dig.progress >= dig.total) finishDig();
  else { crack.visible = true; crack.position.set(dig.x + 0.5, dig.y + 0.5, dig.z + 0.5); setCrack(Math.min(9, Math.floor((dig.progress / dig.total) * 10))); }
}
function stopDig() { dig.active = false; crack.visible = false; }

function finishDig() {
  const { x, y, z, b } = dig;
  stopDig();
  dig.cool = game.mode === "creative" ? 0.2 : 0.05;
  world.set(x, y, z, AIR);
  if (needsSupport(world.get(x, y + 1, z))) world.set(x, y + 1, z, AIR);
  particles.burst(x + 0.5, y + 0.5, z + 0.5, BLOCKS[b].tex[2], 22, lightAtBlock(x, y, z));
  sfx.brk(BLOCKS[b]);
  const it = ITEMS[heldId()];
  if (game.mode === "survival" && it?.uses && BLOCKS[b].hard > 0) { if (wear(game.st.inv, game.sel, it.tool === "sword" ? 2 : 1)) sfx.toolBreak(); changed(); }
  exAcc += 0.005;
  net({ t: "dig", x, y, z, d: digest(game.st) });
}

const eating = { on: false, t: 0 };
function rightPress() {
  if (game.dead) return;
  const hit = raycastBlock();
  // 작업대 · 상자 · 화로 열기 (웅크리면 대신 블록을 놓는다)
  if (hit && !player.sneak && [B.CRAFTING_TABLE, B.CHEST, B.FURNACE].includes(hit.b)) {
    if (hit.b === B.CRAFTING_TABLE) { applyOp(game.st, { o: "open", screen: "table" }, game.mode); openUI("table", false); }
    net({ t: "use", x: hit.x, y: hit.y, z: hit.z, d: digest(game.st) });
    if (hit.b !== B.CRAFTING_TABLE) {
      // 상자 · 화로는 서버가 내용을 보내 주면 열린다
      uiMode = "inv";
      keys.clear(); mouseL = mouseR = false;
      document.exitPointerLock?.();
      setTimeout(() => { if (uiMode === "inv" && !ui.isOpen) showPause(); }, 1500);
    }
    return;
  }
  const h = held();
  const it = h ? ITEMS[h.id] : null;
  if (it?.food && (game.food < 20 || game.mode === "creative")) {
    if (!eating.on) { eating.on = true; eating.t = 0; net({ t: "eatstart" }); }
    return;
  }
  if (!hit || !it?.block) return;
  const x = hit.x + hit.face[0], y = hit.y + hit.face[1], z = hit.z + hit.face[2];
  if (y < 1 || y >= HEIGHT) return;
  const cur = world.get(x, y, z);
  if (cur !== AIR && cur !== WATER && BLOCKS[cur]?.kind !== "plant") return;
  const b = it.block;
  if (needsSupport(b) && !isOpaque(world.get(x, y - 1, z))) return;
  if (BLOCKS[b].kind === "solid" || BLOCKS[b].kind === "cutout") {
    const bodies = [[player.pos, 0.3, bodyH()], ...[...others.values()].filter((o) => !o.dead).map((o) => [o.target, 0.3, 1.8]),
      ...[...mobs.values()].map((e) => [e.target, MOBS[e.type].w, MOBS[e.type].h])];
    for (const [p, w, hh] of bodies) {
      if (x + 1 > p.x - w && x < p.x + w && y + 1 > p.y && y < p.y + hh && z + 1 > p.z - w && z < p.z + w) return;
    }
  }
  world.set(x, y, z, b);
  if (game.mode === "survival") useOne(game.st.inv, game.sel);
  hand.doSwing();
  sfx.place(BLOCKS[b]);
  net({ t: "swing" });
  net({ t: "place", x, y, z, d: digest(game.st) });
  changed();
}

function updateEating(dt) {
  const it = ITEMS[heldId()];
  if (!eating.on) { hand.eat = 0; return; }
  if (!mouseR || !it?.food || !locked()) { eating.on = false; hand.eat = 0; return; }
  eating.t += dt;
  hand.eat = eating.t;
  if (Math.floor(eating.t * 5) !== Math.floor((eating.t - dt) * 5)) sfx.eat();
  if (eating.t >= 1.6) {
    eating.on = false;
    hand.eat = 0;
    if (game.mode === "survival") useOne(game.st.inv, game.sel);
    sfx.burp();
    net({ t: "eat", d: digest(game.st) });
    changed();
  }
}

function dropHeld(all) {
  if (!held()) return;
  applyOp(game.st, { o: "drop", a: "inv", i: game.sel, all }, game.mode);
  net({ t: "q", all, d: digest(game.st) });
  hand.doSwing();
  changed();
}

/** 가까운 아이템 줍기 — 서버에 요청 (먼저 요청한 사람이 가져감) */
const pickAsked = new Map();
function tryPickup() {
  if (game.dead) return;
  const c = new THREE.Vector3(player.pos.x, player.pos.y + 0.9, player.pos.z);
  const now = performance.now();
  for (const d of drops.values()) {
    if (d.flying || now - d.born < 400) continue;
    if (d.g.position.distanceTo(c) > 1.8) continue;
    if ((pickAsked.get(d.id) ?? 0) > now) continue;
    if (roomFor(game.st.inv, { id: d.item, n: 1 }) <= 0) continue;
    pickAsked.set(d.id, now + 600);
    net({ t: "pickup", id: d.id });
  }
}

// ── HUD ────────────────────────────────────────────────────
function changed() {
  renderHud();
  if (ui.isOpen) ui.render();
  hand.setItem(heldId());
}

function renderHud() {
  const bar = $("hotbar");
  if (bar.children.length !== 9) {
    bar.innerHTML = "";
    for (let i = 0; i < 9; i++) { const s = document.createElement("div"); s.className = "slot"; bar.append(s); }
  }
  [...bar.children].forEach((el, i) => { fillSlot(el, game.st.inv[i]); el.classList.toggle("on", i === game.sel); });
  const survival = game.mode === "survival";
  $("bars").classList.toggle("hidden", !survival);
  if (!survival) return;
  const icons = (el, val, full, half, bg, rev = false) => {
    let h = "";
    for (let i = 0; i < 10; i++) {
      const v = val - i * 2;
      h += `<span><img class="bg" src="${hudIcon(bg)}">${v >= 2 ? `<img src="${hudIcon(full)}">` : v === 1 || (v > 0 && v < 2) ? `<img src="${hudIcon(half)}">` : ""}</span>`;
    }
    el.innerHTML = h;
    el.style.flexDirection = rev ? "row-reverse" : "row";
  };
  icons($("hearts"), game.hp, "heart", "half", "heart_bg");
  icons($("food"), game.food, "food", "food_half", "food_bg", true);
  const ar = $("armorBar");
  ar.classList.toggle("hidden", game.armor <= 0);
  if (game.armor > 0) icons(ar, game.armor, "armor", "armor_half", "armor_bg");
  const airEl = $("air");
  const showAir = game.air < 300;
  airEl.classList.toggle("hidden", !showAir);
  if (showAir) {
    const n = Math.ceil(game.air / 30);
    airEl.innerHTML = Array.from({ length: n }, () => `<img src="${hudIcon("air")}">`).join("");
  }
  $("xpFill").style.width = `${game.prog * 100}%`;
  $("xpLvl").textContent = game.lvl > 0 ? game.lvl : "";
}

let nameTimer = 0;
function selectSlot(i) {
  game.sel = (i + 9) % 9;
  net({ t: "sel", i: game.sel });
  const el = $("itemName");
  el.textContent = ITEMS[heldId()]?.name ?? "";
  el.style.opacity = 1;
  clearTimeout(nameTimer);
  nameTimer = setTimeout(() => (el.style.opacity = 0), 1500);
  eating.on = false;
  changed();
}

function clockText() {
  const t = curTime();
  const h = Math.floor((t / 1000 + 6) % 24), m = Math.floor(((t % 1000) / 1000) * 60);
  const ampm = h < 12 ? "오전" : "오후";
  const icon = game.weather === "clear" ? (h >= 6 && h < 18 ? "☀" : "☾") : game.weather === "rain" ? "☂" : "⚡";
  return `${icon} ${ampm} ${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")}`;
}
const curTime = () => (game.time + ((performance.now() - game.timeAt) / 1000) * 20) % 24000;

function renderTopRight() {
  const n = others.size + 1;
  $("topRight").innerHTML = `${clockText()}<br>${game.title ?? ""} · 접속 ${n}명`;
}

function chatLine(name, msg, cls = "") {
  const log = $("chatLog");
  const line = document.createElement("div");
  line.className = `chatLine${name ? "" : " sys"} ${cls}`;
  if (name) { const w = document.createElement("span"); w.className = "who"; w.textContent = `${name}: `; line.append(w); }
  line.append(document.createTextNode(msg));
  log.append(line);
  while (log.children.length > 10) log.firstChild.remove();
  setTimeout(() => { line.style.opacity = 0; }, 10_000);
  setTimeout(() => line.remove(), 11_000);
}

function renderPlayers() {
  const rows = [{ name: `${game.name} (나)`, color: game.hue }, ...[...others.values()].map((o) => ({ name: o.name, color: o.color }))];
  $("pausePlayers").innerHTML = `<b>접속자 ${rows.length}명</b>` + rows.map((r) =>
    `<div class="pl"><span class="dot" style="background:hsl(${r.color},65%,62%)"></span>${esc(r.name)}</div>`).join("");
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

let toastTimer = 0;
function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 4000);
}

function updateMode() {
  $("mode").textContent = game.mode === "creative" ? (player.flying ? "크리에이티브 · 날기 (Space 위 · Shift 아래 · Space 두 번 끄기)" : "크리에이티브 (Space 두 번: 날기)") : "";
}

// ── 화면 전환 ──────────────────────────────────────────────
const locked = () => document.pointerLockElement === canvas;
function lockPointer() {
  unlock();
  try { const r = canvas.requestPointerLock?.(); r?.catch?.(() => {}); } catch { /* 클릭하면 다시 시도 */ }
}
let uiMode = "title"; // title · play · pause · chat · inv · dead
function showPause(first = false) {
  uiMode = "pause";
  $("resumeBtn").textContent = first ? "클릭해서 시작하기" : "게임으로 돌아가기";
  renderPlayers();
  $("pause").classList.remove("hidden");
}
function openUI(screen, sendOpen = true) {
  uiMode = "inv";
  document.exitPointerLock?.();
  $("pause").classList.add("hidden");
  if (sendOpen) ui.open(screen);
  else { ui.screen = screen; ui.el.classList.remove("hidden"); ui.build(); ui.render(); }
  keys.clear();
  mouseL = mouseR = false;
}
function closeUI() {
  ui.close();
  uiMode = "pause";
  lockPointer();
}

document.addEventListener("pointerlockchange", () => {
  if (!game.connected) return;
  if (locked()) { uiMode = "play"; $("pause").classList.add("hidden"); }
  else if (uiMode === "play") { keys.clear(); mouseL = mouseR = false; if (game.dead) uiMode = "dead"; else showPause(); }
});
canvas.addEventListener("click", () => { if (game.connected && !locked() && uiMode !== "chat" && uiMode !== "inv" && !game.dead) lockPointer(); });
$("resumeBtn").onclick = () => lockPointer();
$("pauseSettings").onclick = () => openSettings();
$("pauseTitle").onclick = () => { disconnect(); showTitle(); };
$("respawnBtn").onclick = () => net({ t: "respawn" });
$("deathTitle").onclick = () => { net({ t: "respawn" }); disconnect(); $("death").classList.add("hidden"); showTitle(); };

// 채팅 ui 가 열려 있으면 그 키는 채팅에만
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

// ── 입력 ───────────────────────────────────────────────────
document.addEventListener("mousemove", (e) => {
  if (!locked()) return;
  const k = 0.0022 * (settings.sens / 100);
  player.yaw -= e.movementX * k;
  player.pitch -= e.movementY * k;
  player.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, player.pitch));
});
document.addEventListener("mousedown", (e) => {
  if (!locked() || game.dead) return;
  if (e.button === 0) { mouseL = true; if (leftPress()) mouseL = false; }
  else if (e.button === 2) { mouseR = true; rightPress(); rightRepeat = 0.3; }
  else if (e.button === 1) {
    e.preventDefault();
    const hit = raycastBlock();
    if (hit) { const at = game.st.inv.slice(0, 9).findIndex((s) => s?.id === hit.b); if (at >= 0) selectSlot(at); }
  }
});
document.addEventListener("mouseup", (e) => { if (e.button === 0) mouseL = false; if (e.button === 2) { mouseR = false; eating.on = false; } });
document.addEventListener("contextmenu", (e) => e.preventDefault());
document.addEventListener("wheel", (e) => { if (locked()) selectSlot(game.sel + Math.sign(e.deltaY)); }, { passive: true });

let lastSpace = 0, debugOn = false, hudOff = false;
document.addEventListener("keydown", (e) => {
  if (!game.connected) return;
  if (uiMode === "chat") {
    if (e.code === "Enter") {
      const msg = $("chatInput").value.trim();
      if (msg) net({ t: "chat", msg });
      closeChat();
    } else if (e.code === "Escape") closeChat();
    return;
  }
  if (game.dead) return;
  if (["Tab", "F3", "F5", "F1", "Slash"].includes(e.code) || (e.ctrlKey && ["KeyS", "KeyD", "KeyW"].includes(e.code))) e.preventDefault();
  if (uiMode === "inv") {
    if (e.code === "KeyE" || e.code === "Tab" || e.code === "Escape") { e.preventDefault(); closeUI(); }
    else if (e.code.startsWith("Digit") && e.code !== "Digit0") ui.hotkey(Number(e.code.slice(5)) - 1);
    else if (e.code === "KeyQ") ui.dropHovered(e.ctrlKey);
    return;
  }
  if (e.code === "KeyE" || e.code === "Tab") { e.preventDefault(); openUI("inv"); return; }
  if (e.code === "KeyT" || e.code === "Enter") { e.preventDefault(); openChat(); return; }
  if (e.code === "Slash") { openChat("/"); return; }
  if (e.code === "F3") { debugOn = !debugOn; $("debug").classList.toggle("hidden", !debugOn); return; }
  if (e.code === "F1") { hudOff = !hudOff; $("hud").style.visibility = hudOff ? "hidden" : ""; return; }
  if (e.code === "F5") { game.view = (game.view + 1) % 2; return; }
  if (!locked()) return;
  if (e.code.startsWith("Digit") && e.code !== "Digit0") selectSlot(Number(e.code.slice(5)) - 1);
  if (e.code === "KeyQ") dropHeld(e.ctrlKey);
  if (e.code === "KeyW" && !e.repeat) {
    const now = performance.now();
    if (now - lastW < 280) player.sprint = true;
    lastW = now;
  }
  if (e.code === "Space" && !e.repeat && game.mode === "creative") {
    const now = performance.now();
    if (now - lastSpace < 280) { player.flying = !player.flying; player.vel.y = 0; updateMode(); }
    lastSpace = now;
  }
  keys.add(e.code);
});
document.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("blur", () => { keys.clear(); mouseL = mouseR = false; });

// ── 첫 화면 · 로그인 · 설정 ────────────────────────────────
function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* 무시 */ } }
function load(k) { try { return localStorage.getItem(k); } catch { return null; } }

async function api(path, body) {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "서버 오류");
  return data;
}

function showTitle() {
  uiMode = "title";
  document.exitPointerLock?.();
  if (ui.isOpen) ui.close();
  for (const id of ["hud", "pause", "death", "loading"]) $(id).classList.add("hidden");
  $("title").classList.remove("hidden");
  refreshTitle();
}
function hideTitle() {
  $("title").classList.add("hidden");
  for (const id of ["loginModal", "playModal", "settingsModal"]) $(id).classList.add("hidden");
}

async function refreshTitle() {
  let status = { online: 0, version: VERSION };
  try { status = await (await fetch("/api/status")).json(); } catch { /* 서버 꺼짐 */ }
  if (game.token && !game.me) {
    try { game.me = await api("/api/me", { token: game.token }); } catch { game.token = null; store("tzw-token", null); }
  }
  const me = game.me;
  $("btnLoginText").textContent = me ? `${me.name} 님` : "로그인";
  $("titleStatus").innerHTML = me
    ? `<b>${esc(me.name)}</b> 님 로그인됨${me.admin ? " · 관리자" : ""} · 서버 접속 ${status.online}명`
    : `로그인하고 시작하세요 · 서버 접속 ${status.online}명`;
  $("titleVersion").textContent = `TECZEN WORLD v${status.version ?? VERSION}`;
}

function openLogin(msg = "") {
  const me = game.me;
  $("loginForms").classList.toggle("hidden", !!me);
  $("loggedIn").classList.toggle("hidden", !me);
  if (me) { $("meName").textContent = me.name; $("meRole").textContent = me.admin ? "관리자 계정입니다." : "일반 계정입니다."; }
  $("authError").textContent = msg;
  $("loginModal").classList.remove("hidden");
  if (!me) setTimeout(() => $("authName").focus(), 0);
}
let joinMode = false;
function setAuthTab(join) {
  joinMode = join;
  $("tabLogin").classList.toggle("on", !join);
  $("tabJoin").classList.toggle("on", join);
  $("pw2Row").classList.toggle("hidden", !join);
  $("authSubmit").textContent = join ? "가입하기" : "로그인";
  $("authPw").autocomplete = join ? "new-password" : "current-password";
  $("authError").textContent = "";
}
$("tabLogin").onclick = () => setAuthTab(false);
$("tabJoin").onclick = () => setAuthTab(true);
$("authForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("authName").value.trim(), password = $("authPw").value;
  if (joinMode && password !== $("authPw2").value) { $("authError").textContent = "비밀번호 확인이 다릅니다."; return; }
  $("authSubmit").disabled = true;
  try {
    const r = await api(joinMode ? "/api/register" : "/api/login", { name, password });
    game.token = r.token;
    store("tzw-token", r.token);
    game.me = null;
    $("authPw").value = $("authPw2").value = "";
    await refreshTitle();
    $("loginModal").classList.add("hidden");
    toast(joinMode ? `가입했습니다. ${r.name} 님 환영합니다!${r.admin ? " (첫 가입자 — 관리자)" : ""}` : `${r.name} 님 로그인했습니다.`);
    openPlay();
  } catch (err) { $("authError").textContent = err.message; }
  $("authSubmit").disabled = false;
});
$("btnLogout").onclick = async () => {
  try { await api("/api/logout", { token: game.token }); } catch { /* 무시 */ }
  game.token = null; game.me = null; store("tzw-token", null);
  $("loginModal").classList.add("hidden");
  refreshTitle();
};
$("btnPlay2").onclick = () => { $("loginModal").classList.add("hidden"); openPlay(); };

function openPlay() {
  if (!game.me) { openLogin("먼저 로그인하거나 가입하세요."); return; }
  const last = game.me.last;
  const cont = $("playContinue");
  cont.classList.toggle("hidden", !last);
  cont.textContent = `이어하기 — ${last === "solo" ? "싱글플레이" : "멀티플레이"}`;
  cont.onclick = () => { $("playModal").classList.add("hidden"); connect(last); };
  $("playWho").textContent = `${game.me.name} 님으로 접속합니다.`;
  $("playModal").classList.remove("hidden");
}
$("playMulti").onclick = () => { $("playModal").classList.add("hidden"); connect("main"); };
$("playSolo").onclick = () => { $("playModal").classList.add("hidden"); connect("solo"); };

$("btnStart").onclick = () => { unlock(); sfx.click(); openPlay(); };
$("btnLogin").onclick = () => { unlock(); sfx.click(); openLogin(); };
$("btnSettings").onclick = () => { unlock(); sfx.click(); openSettings(); };
$("btnQuit").onclick = () => {
  disconnect();
  window.close();
  setTimeout(() => $("quitScreen").classList.remove("hidden"), 150);
};
for (const x of document.querySelectorAll("[data-close]")) x.onclick = () => x.closest(".modal").classList.add("hidden");

function openSettings() {
  const bind = (id, key, fmt) => {
    const input = $(`s${id}`), label = $(`v${id}`);
    input.value = settings[key];
    if (label) label.textContent = fmt(settings[key]);
    input.oninput = () => {
      settings[key] = input.type === "range" ? Number(input.value) : input.value;
      if (label) label.textContent = fmt(settings[key]);
      saveSettings();
      applySettings();
    };
  };
  bind("Sens", "sens", (v) => `${v}%`);
  bind("Dist", "dist", (v) => `${v}청크`);
  bind("Fov", "fov", (v) => `${v}°`);
  bind("Bright", "bright", (v) => `${v}%`);
  bind("Vol", "vol", (v) => `${v}%`);
  bind("Gfx", "gfx", (v) => v);
  $("settingsModal").classList.remove("hidden");
}

// ── 루프 ───────────────────────────────────────────────────
let last = performance.now(), fps = 0, frames = 0, fpsAt = last, sendAt = 0, exAt = 0, ambientAt = 0;
const camBob = { t: 0 };
let selfModel = makeHumanoid("player", 200);
selfModel.root.visible = false;
scene.add(selfModel.root);

function loop(now) {
  requestAnimationFrame(loop);
  const real = Math.min(0.25, (now - last) / 1000); // 캐기 · 먹기는 실제 시간으로 (느린 PC 에서도 같은 시간)
  const dt = Math.min(0.1, real);
  last = now;
  if (game.connected) frame(dt, now, real);
  renderer.clear();
  renderer.render(scene, camera);
  if (game.connected && game.view === 0 && !game.dead) { renderer.clearDepth(); renderer.render(hand.scene, hand.camera); }
}

function frame(dt, now, real = dt) {
  const pending = world.update(player.pos.x, player.pos.z, game.ready ? 6 : 14);
  if (!game.ready) {
    const here = world.chunks.get(`${Math.floor(player.pos.x / 16)},${Math.floor(player.pos.z / 16)}`);
    const total = (2 * world.renderDist + 1) ** 2 * 0.785;
    $("loading").textContent = `월드 불러오는 중... ${Math.min(99, Math.round((1 - pending / total) * 100))}%`;
    if (here?.meshes && pending < total * 0.5) {
      game.ready = true;
      placeAboveGround();
      $("loading").classList.add("hidden");
    }
  }
  if (game.ready && !game.dead) {
    if (uiMode === "play" || uiMode === "inv" || uiMode === "pause" || uiMode === "chat") {
      if (uiMode !== "play") keys.clear();
      physics(dt);
    }
    survivalTick(dt);
    attackCool = Math.max(0, attackCool - dt);
    updateDig(real);
    updateEating(real);
    if (mouseR && !eating.on && locked()) { rightRepeat -= dt; if (rightRepeat <= 0) { rightRepeat = 0.25; rightPress(); } }
    tryPickup();
    if (now - sendAt > 100) {
      sendAt = now;
      const p = [player.pos.x, player.pos.y, player.pos.z].map((v) => Math.round(v * 100) / 100);
      net({ t: "move", p, r: [Math.round(player.yaw * 100) / 100, Math.round(player.pitch * 100) / 100], f: (player.sneak ? 1 : 0) | (player.sprint ? 2 : 0) });
    }
    if (now - exAt > 1000) { exAt = now; if (exAcc > 0) { net({ t: "ex", v: Math.round(exAcc * 1000) / 1000 }); exAcc = 0; } }
  }

  // 카메라 — 걷는 흔들림 · 맞았을 때 기울기 · 폭발 흔들림 · 달리기 시야각
  const speed = Math.hypot(player.vel.x, player.vel.z);
  if (player.onGround && speed > 0.5) camBob.t += dt * speed * 1.9;
  const bob = player.onGround && !player.flying ? Math.sin(camBob.t) * 0.04 * Math.min(1, speed / 4) : 0;
  game.hurtTilt = Math.max(0, (game.hurtTilt ?? 0) - dt * 3);
  game.shake = Math.max(0, (game.shake ?? 0) - dt * 2);
  const sh = game.shake * 0.25;
  camera.position.set(player.pos.x + (Math.random() - 0.5) * sh, player.pos.y + eyeH() + Math.abs(bob) + (Math.random() - 0.5) * sh, player.pos.z);
  camera.rotation.set(player.pitch, player.yaw, Math.sin(camBob.t * 0.5) * 0.004 * Math.min(1, speed / 4) + game.hurtTilt * 0.12);
  const wantFov = settings.fov * (player.sprint && speed > 4 ? 1.12 : 1) * (player.flying && player.sprint ? 1.1 : 1);
  if (Math.abs(camera.fov - wantFov) > 0.1) { camera.fov += (wantFov - camera.fov) * Math.min(1, dt * 10); camera.updateProjectionMatrix(); }

  // 3인칭 (F5)
  selfModel.root.visible = game.view === 1 && !game.dead;
  if (game.view === 1) {
    camera.getWorldDirection(tmpDir);
    const back = camera.position.clone();
    for (let d = 0; d < 4; d += 0.1) {
      const q = camera.position.clone().addScaledVector(tmpDir, -d);
      if (isOpaque(world.get(Math.floor(q.x), Math.floor(q.y), Math.floor(q.z)))) break;
      back.copy(q);
    }
    camera.position.copy(back);
    selfModel.root.position.copy(player.pos);
    selfModel.root.rotation.y = player.yaw;
    if (selfModel.hue !== game.hue) {
      // 내 유니폼으로 다시 만든다
      scene.remove(selfModel.root);
      disposeTree(selfModel.root);
      selfModel = makeHumanoid("player", game.hue);
      selfModel.hue = game.hue;
      scene.add(selfModel.root);
    }
    animateHumanoid(selfModel, speed, dt, -player.pitch, player.sneak);
    tint(selfModel.mats, lightAt(player.pos.x, player.pos.y + 1, player.pos.z));
  }

  // 하늘 · 빛
  const time = curTime();
  const eyeWater = world.get(Math.floor(camera.position.x), Math.floor(camera.position.y), Math.floor(camera.position.z)) === WATER;
  sky.update(time, camera, eyeWater, mats.shared, world.renderDist * 16);
  if (game.weather !== "clear") {
    mats.shared.daylight.value *= 0.65;
    scene.background.multiplyScalar(0.6);
    mats.shared.fogColor.value.multiplyScalar(0.6);
    mats.shared.fogFar.value *= 0.75;
  }
  if (game.weather === "thunder" && Math.random() < dt / 15) { $("flash").style.opacity = 0.7; setTimeout(() => { $("flash").style.opacity = 0; }, 120); setTimeout(() => sfx.boom(), 600 + Math.random() * 1500); }
  updateWeather(dt);
  $("water").classList.toggle("hidden", !eyeWater);
  $("fireFx").classList.toggle("hidden", !player.inLava);

  // 선택한 블록 · 놓을 자리
  const hit = locked() ? raycastBlock() : null;
  highlight.visible = !!hit;
  ghost.visible = false;
  if (hit) {
    highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    const hb = ITEMS[heldId()]?.block;
    if (hb && ["solid", "cutout"].includes(BLOCKS[hb].kind) && !mouseL) {
      const gx = hit.x + hit.face[0], gy = hit.y + hit.face[1], gz = hit.z + hit.face[2];
      const cur = world.get(gx, gy, gz);
      if (cur === AIR || cur === WATER || BLOCKS[cur]?.kind === "plant") {
        ghost.visible = true;
        ghost.position.set(gx + 0.5, gy + 0.5, gz + 0.5);
        ghost.material.color.setScalar(lightAt(gx, gy, gz));
      }
    }
  }

  // 손
  const light = lightAt(player.pos.x, player.pos.y + eyeH(), player.pos.z);
  hand.update(dt, player.onGround ? speed : 0, light, window.innerWidth / window.innerHeight, { sprint: player.sprint && speed > 4, air: !player.onGround && !player.inWater, mining: dig.active && dig.total > 0, vy: player.vel.y });

  animateEntities(dt, now);
  particles.update(dt, camera);
  ambient(now);
  if (ui.isOpen) ui.renderPreview(dt, heldId());
  renderHud();
  renderTopRight();

  frames++;
  if (now - fpsAt > 500) { fps = Math.round((frames * 1000) / (now - fpsAt)); frames = 0; fpsAt = now; }
  if (debugOn) {
    const p = player.pos;
    const col = column(Math.floor(p.x), Math.floor(p.z), world.seed);
    const [sl, bl] = world.light(Math.floor(p.x), Math.floor(p.y + 1), Math.floor(p.z));
    $("debug").textContent = `TECZEN WORLD v${VERSION}  FPS ${fps}\nXYZ ${p.x.toFixed(1)} / ${p.y.toFixed(1)} / ${p.z.toFixed(1)}\n바이옴 ${["평원", "숲", "자작나무숲", "눈 덮인 침엽수림", "사막", "산"][col.biome]} · 빛 하늘 ${sl} 횃불 ${bl}\n청크 ${world.chunks.size} (남은 ${pending}, 1개 ${(world.buildMs ?? 0).toFixed(1)}ms) · 몹 ${mobs.size} · 아이템 ${drops.size}\n시간 ${Math.round(time)} · 날씨 ${game.weather}`;
  }
}

function animateEntities(dt, now) {
  const dl = mats.shared.daylight.value;
  for (const o of others.values()) {
    if (o.dead) continue;
    const g = o.model.root;
    o.last.copy(g.position);
    g.position.lerp(o.target, Math.min(1, dt * 12));
    let dy = o.rot[0] - g.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    g.rotation.y += dy * Math.min(1, dt * 15);
    const moved = Math.hypot(g.position.x - o.last.x, g.position.z - o.last.z) / Math.max(dt, 0.001);
    animateHumanoid(o.model, moved, dt, -o.rot[1], !!(o.flags & 1));
    o.flash = Math.max(0, (o.flash ?? 0) - dt);
    tint(o.model.mats, lightAt(g.position.x, g.position.y + 1, g.position.z), o.flash > 0);
  }
  for (const e of mobs.values()) {
    const g = e.model.root;
    const before = g.position.clone();
    if (!e.dying) g.position.lerp(e.target, Math.min(1, dt * 10));
    let dy = e.yaw - g.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    g.rotation.y += dy * Math.min(1, dt * 10);
    const moved = Math.hypot(g.position.x - before.x, g.position.z - before.z) / Math.max(dt, 0.001);
    animateMob(e.model, e.dying ? 0 : moved, dt, e.type === MOB.BOMBER ? e.extra : 0, now / 1000, !!(e.flags & 4));
    e.flash = Math.max(0, e.flash - dt);
    const l = lightAt(g.position.x, g.position.y + 0.8, g.position.z);
    const burning = e.flags & 2;
    const fuse = e.type === MOB.BOMBER && e.extra > 0 && Math.sin(now / 50) > 0;
    tint(e.model.mats, burning ? Math.max(l, 0.9) : l, e.flash > 0 || !!(e.flags & 1), fuse ? new THREE.Color(1, 1, 1) : burning ? new THREE.Color(1, 0.5, 0.1) : null);
    if (burning && Math.random() < dt * 8) particles.puff(g.position.x, g.position.y + MOBS[e.type].h * Math.random(), g.position.z, 1, 0.15, 0xff8822, 1);
    if (e.dying) {
      // 쓰러지며 사라짐
      e.dying -= dt;
      g.rotation.z = Math.min(Math.PI / 2, g.rotation.z + dt * 5);
      if (e.dying <= 0) { particles.puff(g.position.x, g.position.y + 0.5, g.position.z, 10, 0.25, 0xffffff, 2); removeMob(e.id); }
    }
    // 가까운 좀비 소리
    if (e.type === MOB.ZOMBIE && Math.random() < dt / 8 && g.position.distanceTo(player.pos) < 16) sfx.groan();
  }
  for (const d of drops.values()) {
    const g = d.g;
    if (d.flying) {
      d.flying.t += dt * 4;
      const to = d.flying.to ? d.flying.to.model.root.position.clone().setY(d.flying.to.model.root.position.y + 1) : new THREE.Vector3(player.pos.x, player.pos.y + 1, player.pos.z);
      g.position.lerp(to, Math.min(1, d.flying.t));
      if (d.flying.t >= 1) { if (!d.flying.to) sfx.pop(); removeDrop(d.id); }
      continue;
    }
    g.position.lerp(d.target, Math.min(1, dt * 10));
    g.rotation.y = now / 600 + d.phase;
    g.children.forEach((c) => { c.position.y = 0.12 + Math.sin(now / 400 + d.phase) * 0.06; });
    const l = lightAt(g.position.x, g.position.y + 0.3, g.position.z);
    g.children.forEach((c) => c.userData.mat?.color.setScalar(l));
  }
  for (const a of arrows.values()) { a.g.position.lerp(a.target, Math.min(1, dt * 15)); tint(a.g.userData.mats ?? [], lightAt(a.g.position.x, a.g.position.y, a.g.position.z)); }
  void dl;
}

// 비 · 눈
const rainGeo = new THREE.BufferGeometry();
const RAIN_N = 900;
const rainPos = new Float32Array(RAIN_N * 6);
rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0x9fb8e0, transparent: true, opacity: 0.55, fog: false }));
rain.frustumCulled = false;
rain.visible = false;
scene.add(rain);
const drop0 = Array.from({ length: RAIN_N }, () => ({ x: 0, y: -999, z: 0, s: 0 }));
let rainSoundAt = 0;
function updateWeather(dt) {
  const on = game.weather !== "clear";
  rain.visible = on;
  if (!on) return;
  const p = player.pos;
  const col = column(Math.floor(p.x), Math.floor(p.z), world.seed);
  const snow = col.biome === BIOME.TAIGA || col.h >= 72;
  if (col.biome === BIOME.DESERT) { rain.visible = false; return; }
  rain.material.color.set(snow ? 0xffffff : 0x9fb8e0);
  for (let i = 0; i < RAIN_N; i++) {
    const d = drop0[i];
    d.y -= (snow ? 3 : 22) * dt * (0.8 + (i % 5) * 0.1);
    if (snow) d.x += Math.sin(d.y + i) * dt * 0.4;
    if (d.y < p.y - 8 || Math.abs(d.x - p.x) > 16 || Math.abs(d.z - p.z) > 16) {
      d.x = p.x + (Math.random() - 0.5) * 32; d.z = p.z + (Math.random() - 0.5) * 32; d.y = p.y + 8 + Math.random() * 10;
    }
    // 지붕 밑에는 안 내림
    const roof = world.get(Math.floor(d.x), Math.floor(d.y), Math.floor(d.z));
    const len = snow ? 0.08 : 0.6;
    const o = i * 6;
    if (roof !== AIR) { rainPos[o + 1] = rainPos[o + 4] = -999; continue; }
    rainPos[o] = d.x; rainPos[o + 1] = d.y; rainPos[o + 2] = d.z;
    rainPos[o + 3] = d.x + (snow ? 0.05 : 0); rainPos[o + 4] = d.y + len; rainPos[o + 5] = d.z;
  }
  rainGeo.attributes.position.needsUpdate = true;
  const now = performance.now();
  if (!snow && now - rainSoundAt > 400) { rainSoundAt = now; sfx.rain?.(); }
}

/** 환경음 — 낮엔 새소리, 밤엔 귀뚜라미, 동굴은 바람 */
function ambient(now) {
  if (now - ambientAt < 2500) return;
  ambientAt = now + Math.random() * 4000;
  const dl = daylightAt(curTime());
  const [skyL] = world.light(Math.floor(player.pos.x), Math.floor(player.pos.y + 1), Math.floor(player.pos.z));
  if (skyL < 4) sfx.cave?.();
  else if (game.weather === "clear") (dl > 0.5 ? sfx.bird : sfx.cricket)?.();
}

// 테스트 · 디버깅용
window.__game = {
  game, player, world, others, mobs, drops, ui, net, op, raycastBlock, camera, scene, hand,
  get connected() { return game.connected; }, get ready() { return game.ready; }, get uiMode() { return uiMode; },
  selectSlot, keys, finishDig, dig, rightPress, leftPress,
};

// ── 시작 ───────────────────────────────────────────────────
game.token = load("tzw-token");
applySettings();
showTitle();
requestAnimationFrame(loop);
