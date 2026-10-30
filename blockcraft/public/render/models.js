// 모양 — 사람(나 · 다른 사람 · 좀비) · 동물 · 폭탄몬 · 손에 든 아이템 · 떨어진 아이템 · 부서지는 조각
import * as THREE from "../vendor/three.module.min.js";
import { BLOCKS } from "/shared/blocks.js";
import { ITEMS } from "/shared/items.js";
import { MOB, SHEEP_WOOL } from "/shared/mobs.js";
import { itemTile } from "../textures.js";

let SK = null, SKIN_TEX = null, ATLAS = null, ATLAS_TEX = null;
export function initModels(skins, skinTex, atlas, atlasTex) { SK = skins; SKIN_TEX = skinTex; ATLAS = atlas; ATLAS_TEX = atlasTex; }

const WOOL_COLOR = { 17: 0xeaeced, 22: 0x2a2a30, 18: 0xb02a25, 19: 0x3a3fa8, 20: 0xf0c030, 21: 0x5a7420 };

/** 상자에 면별 그림 붙이기. faces: 이름 하나 또는 { f, b, l, r, t, u } (앞 = -z) */
function setUV(geo, faces, uvOf) {
  const order = ["r", "l", "t", "u", "b", "f"];
  const uv = geo.attributes.uv;
  for (let fi = 0; fi < 6; fi++) {
    const name = typeof faces === "string" ? faces : faces[order[fi]] ?? faces.all ?? faces.f;
    const [u0, v0, u1, v1] = uvOf(name);
    for (let k = 0; k < 4; k++) {
      const i = fi * 4 + k;
      uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
    }
  }
  uv.needsUpdate = true;
}

/** px 단위 상자. pivot: 상자 안에서 회전 중심 (px, 상자 중심 기준) */
function part(mat, w, h, d, faces, s, pivot = [0, 0, 0]) {
  const g = new THREE.BoxGeometry(w * s, h * s, d * s);
  setUV(g, faces, (n) => SK.uv(n));
  g.translate(-pivot[0] * s, -pivot[1] * s, -pivot[2] * s);
  return new THREE.Mesh(g, mat);
}

const skinMat = () => new THREE.MeshBasicMaterial({ map: SKIN_TEX, alphaTest: 0.5 });

// ── 사람 모양 ──────────────────────────────────────────────
/** kind: "player" | "zombie". hue: 안전모 색 */
export function makeHumanoid(kind = "player", hue = 200) {
  const s = 1.8 / 32;
  const mat = skinMat();
  const mats = [mat];
  const z = kind === "zombie";
  const root = new THREE.Group();
  const T = z
    ? { face: "z_face", head: "z_head", top: "z_head", body: "z_body", arm: "z_arm", armEnd: "z_head", leg: "z_leg", foot: "z_leg", bodyB: "z_body", bodyS: "z_body", armTop: "z_body" }
    : { face: "p_face", head: "p_head", top: "p_hair", body: "p_body_f", arm: "p_arm", armEnd: "p_arm_end", leg: "p_leg", foot: "p_foot", bodyB: "p_body_b", bodyS: "p_body_s", armTop: "p_arm_top" };
  const head = part(mat, 8, 8, 8, { f: T.face, b: T.head, l: T.head, r: T.head, t: T.top, u: T.head }, s, [0, -4, 0]);
  head.position.y = 24 * s;
  const body = part(mat, 8, 12, 4, { f: T.body, b: T.bodyB, l: T.bodyS, r: T.bodyS, t: T.armTop, u: T.armTop }, s);
  body.position.y = 18 * s;
  const arm = (side) => {
    const m = part(mat, 4, 12, 4, { f: T.arm, b: T.arm, l: T.arm, r: T.arm, t: T.armTop, u: T.armEnd }, s, [0, 4, 0]);
    m.position.set(side * 6 * s, 22 * s, 0);
    return m;
  };
  const leg = (side) => {
    const m = part(mat, 4, 12, 4, { f: T.leg, b: T.leg, l: T.leg, r: T.leg, t: T.leg, u: T.foot }, s, [0, 6, 0]);
    m.position.set(side * 2 * s, 12 * s, 0);
    return m;
  };
  const armL = arm(-1), armR = arm(1), legL = leg(-1), legR = leg(1);
  root.add(head, body, armL, armR, legL, legR);
  let hatMat = null;
  if (!z) {
    hatMat = skinMat();
    hatMat.userData.base = new THREE.Color().setHSL(hue / 360, 0.65, 0.62);
    const hat = part(hatMat, 9, 3, 9, { f: "hat_front", b: "hat", l: "hat", r: "hat", t: "hat", u: "hat" }, s, [0, -1.5, 0]);
    hat.position.y = 5.5 * s;
    const brim = part(hatMat, 10, 1, 11, "hat", s, [0, -0.5, 1]);
    brim.position.y = 5 * s;
    head.add(hat, brim);
    mats.push(hatMat);
  }
  if (z) { armL.rotation.x = armR.rotation.x = -Math.PI / 2; }
  const hand = new THREE.Group();
  hand.position.set(0, -10 * s, -1 * s);
  armR.add(hand);
  return { root, head, body, arms: [armL, armR], legs: [legL, legR], hand, mats, kind, walk: 0, swing: 0, zombie: z };
}

/** 걷기 · 휘두르기 움직임 */
export function animateHumanoid(h, speed, dt, pitch = 0) {
  h.walk += dt * Math.min(speed, 6) * 2.2;
  const sw = speed > 0.3 ? Math.sin(h.walk) * 0.7 : 0;
  h.legs[0].rotation.x = sw; h.legs[1].rotation.x = -sw;
  if (!h.zombie) { h.arms[0].rotation.x = -sw * 0.8; h.arms[1].rotation.x = sw * 0.8; }
  else { h.arms[0].rotation.x = -Math.PI / 2 + sw * 0.15; h.arms[1].rotation.x = -Math.PI / 2 - sw * 0.15; }
  if (h.swing > 0) {
    h.swing = Math.max(0, h.swing - dt * 3.5);
    const t = 1 - h.swing;
    h.arms[1].rotation.x = -Math.sin(t * Math.PI) * 1.4 - (h.zombie ? Math.PI / 2 : 0);
  }
  h.head.rotation.x = pitch;
}

/** 밝기 · 빨간 번쩍임 적용 */
export function tint(mats, light, hurt = false, extra = null) {
  for (const m of mats) {
    const base = m.userData.base;
    if (base) m.color.copy(base).multiplyScalar(light); else m.color.setScalar(light);
    if (hurt) m.color.setRGB(Math.min(1, light * 1.4 + 0.25), light * 0.35, light * 0.35);
    if (extra) m.color.lerp(extra, 0.6);
  }
}

// ── 몹 ─────────────────────────────────────────────────────
export function makeMob(type, extra) {
  if (type === MOB.ZOMBIE) { const h = makeHumanoid("zombie"); h.type = type; return h; }
  const s = 1 / 16;
  const mat = skinMat();
  const mats = [mat];
  const root = new THREE.Group();
  const m = { root, mats, legs: [], head: null, walk: 0, type };
  const legs = (w, h, d, tex, sx, sz) => {
    for (const [x, z] of [[-sx, -sz], [sx, -sz], [-sx, sz], [sx, sz]]) {
      const l = part(mat, w, h, d, { all: tex, f: tex }, s, [0, h / 2, 0]);
      l.position.set(x * s, h * s, z * s);
      root.add(l); m.legs.push(l);
    }
  };
  if (type === MOB.PIG) {
    const body = part(mat, 10, 8, 16, "pig", s); body.position.y = 10 * s; root.add(body);
    m.head = part(mat, 8, 8, 8, { f: "pig_face", all: "pig" }, s, [0, 0, 4]);
    m.head.position.set(0, 12 * s, -8 * s);
    const snout = part(mat, 4, 3, 1, { f: "pig_snout", all: "pig_snout" }, s); snout.position.set(0, -1 * s, -8.5 * s);
    m.head.add(snout);
    root.add(m.head);
    legs(4, 6, 4, "pig", 3, 5);
  } else if (type === MOB.COW) {
    const body = part(mat, 12, 10, 18, "cow", s); body.position.y = 17 * s; root.add(body);
    m.head = part(mat, 8, 8, 6, { f: "cow_face", all: "cow" }, s, [0, 0, 3]);
    m.head.position.set(0, 20 * s, -9 * s);
    for (const x of [-4.5, 4.5]) { const h = part(mat, 1, 3, 1, "horn", s); h.position.set(x * s, 4.5 * s, -4 * s); m.head.add(h); }
    root.add(m.head);
    legs(4, 12, 4, "cow", 4, 6);
  } else if (type === MOB.SHEEP) {
    const wool = skinMat();
    wool.userData.base = new THREE.Color(WOOL_COLOR[SHEEP_WOOL[extra] ?? 17] ?? 0xeaeced);
    mats.push(wool);
    const body = part(wool, 10, 10, 16, "wool", s); body.position.y = 16 * s; root.add(body);
    m.head = part(mat, 6, 6, 8, { f: "sheep_face", all: "sheep_skin" }, s, [0, 0, 4]);
    m.head.position.set(0, 19 * s, -8 * s);
    const cap = part(wool, 7, 3, 6, "wool", s); cap.position.set(0, 3 * s, -1 * s); m.head.add(cap);
    root.add(m.head);
    legs(4, 12, 4, "sheep_skin", 3, 5);
  } else if (type === MOB.CHICKEN) {
    const body = part(mat, 6, 6, 8, "chicken", s); body.position.y = 8 * s; root.add(body);
    m.head = part(mat, 4, 6, 3, { f: "chicken_face", all: "chicken" }, s, [0, -2, 1.5]);
    m.head.position.set(0, 9 * s, -4 * s);
    const beak = part(mat, 4, 2, 2, "beak", s); beak.position.set(0, 1 * s, -2.5 * s);
    const wat = part(mat, 2, 2, 2, "wattle", s); wat.position.set(0, -1 * s, -2.5 * s);
    m.head.add(beak, wat);
    root.add(m.head);
    for (const x of [-3.5, 3.5]) { const w = part(mat, 1, 4, 6, "chicken", s); w.position.set(x * s, 9 * s, 0); root.add(w); }
    for (const x of [-1.5, 1.5]) {
      const l = part(mat, 1, 5, 1, "chicken_leg", s, [0, 2.5, 0]);
      l.position.set(x * s, 5 * s, 0); root.add(l); m.legs.push(l);
    }
  } else if (type === MOB.BOMBER) {
    const body = part(mat, 12, 12, 12, { f: "bomb_face", all: "bomb", t: "bomb_top", u: "bomb" }, s); body.position.y = 10 * s;
    root.add(body);
    m.body = body;
    const fuse = part(mat, 2, 4, 2, "fuse", s); fuse.position.set(0, 18 * s, 0); root.add(fuse);
    const sparkMat = skinMat(); sparkMat.userData.glow = true;
    const spark = part(sparkMat, 2, 2, 2, "spark", s); spark.position.set(0, 21 * s, 0); root.add(spark);
    m.spark = spark;
    legs(4, 4, 4, "bomb_leg", 4, 4);
  }
  return m;
}

export function animateMob(m, speed, dt, extra, time) {
  if (m.zombie) return animateHumanoid(m, speed, dt);
  m.walk += dt * Math.min(speed, 5) * 3;
  const sw = speed > 0.2 ? Math.sin(m.walk) * 0.6 : 0;
  m.legs.forEach((l, i) => { l.rotation.x = (i === 0 || i === 3 ? sw : -sw); });
  if (m.type === MOB.BOMBER) {
    const f = Math.max(0, extra);
    const sc = 1 + f * 0.25 + (f > 0 ? Math.sin(time * 30) * 0.03 : 0);
    m.body.scale.setScalar(sc);
    m.spark.visible = f > 0 ? Math.sin(time * 25) > -0.3 : Math.sin(time * 4) > 0;
  }
}

// ── 아이템 모양 ────────────────────────────────────────────
/** 아이템 메시 — 블록은 작은 정육면체, 나머지는 납작한 그림 */
export function makeItemMesh(id, size = 0.25) {
  const it = ITEMS[id];
  const b = it?.block ? BLOCKS[it.block] : null;
  const mat = new THREE.MeshBasicMaterial({ map: ATLAS_TEX, alphaTest: 0.5, side: THREE.DoubleSide });
  let mesh;
  if (b && (b.kind === "solid" || b.kind === "cutout")) {
    const g = new THREE.BoxGeometry(size, size, size);
    const [top, bottom, side] = b.tex;
    setUV(g, { r: side, l: side, t: top, u: bottom, b: side, f: b.id === 28 ? "furnace_front" : side }, (n) => ATLAS.uv(n));
    mesh = new THREE.Mesh(g, mat);
    mesh.userData.block = true;
  } else {
    const g = new THREE.PlaneGeometry(size * 1.6, size * 1.6);
    const [u0, v0, u1, v1] = ATLAS.uv(itemTile(id));
    const uv = g.attributes.uv;
    for (let i = 0; i < 4; i++) uv.setXY(i, uv.getX(i) ? u1 : u0, uv.getY(i) ? v1 : v0);
    mesh = new THREE.Mesh(g, mat);
  }
  mesh.userData.mat = mat;
  return mesh;
}
export const disposeTree = (o) => o.traverse((m) => { m.geometry?.dispose(); if (m.material && m.material.map !== SKIN_TEX && m.material.map !== ATLAS_TEX) m.material.map?.dispose(); m.material?.dispose?.(); });

// ── 1인칭 손 ───────────────────────────────────────────────
export class Hand {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.01, 10);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.mat = skinMat();
    const s = 1 / 16;
    this.arm = part(this.mat, 4, 12, 4, { f: "p_arm", b: "p_arm", l: "p_arm", r: "p_arm", t: "p_arm_end", u: "p_arm_top" }, s * 1.6, [0, 4, 0]);
    this.root.add(this.arm);
    this.itemId = -1;
    this.item = null;
    this.swing = 0;      // 0 ~ 1 (휘두르는 중)
    this.equip = 0;      // 바꿀 때 내려갔다 올라오기
    this.bob = 0;
    this.eat = 0;
  }
  setItem(id) {
    if (id === this.itemId) return;
    this.itemId = id;
    if (this.item) { this.root.remove(this.item); disposeTree(this.item); this.item = null; }
    if (id) {
      this.item = makeItemMesh(id, 0.4);
      this.root.add(this.item);
    }
    this.equip = 1;
  }
  doSwing() { if (this.swing <= 0.2) this.swing = 1; }
  update(dt, walkSpeed, light, aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    if (walkSpeed > 0.5) this.bob += dt * walkSpeed * 1.6;
    this.swing = Math.max(0, this.swing - dt * 3.3);
    this.equip = Math.max(0, this.equip - dt * 4);
    const t = 1 - this.swing;
    const sw = this.swing > 0 ? Math.sin(t * Math.PI) : 0;
    const sw2 = this.swing > 0 ? Math.sin(Math.sqrt(t) * Math.PI) : 0;
    const bx = Math.sin(this.bob) * 0.025, by = -Math.abs(Math.cos(this.bob)) * 0.03;
    const eatY = this.eat > 0 ? Math.abs(Math.sin(this.eat * 18)) * 0.05 : 0;
    this.root.position.set(bx - sw2 * 0.25, by - this.equip * 0.5 + sw * 0.12 + eatY, -sw * 0.15);
    this.root.rotation.set(0, 0, 0);
    const it = this.item;
    this.arm.visible = !it;
    if (!it) {
      this.arm.position.set(0.42, -0.42, -0.42);
      this.arm.rotation.set(-1.2 - sw * 0.6, 0.35 - sw2 * 0.4, 0.25);
    } else if (it.userData.block) {
      it.position.set(0.42 - (this.eat > 0 ? 0.3 : 0), -0.36, -0.62);
      it.rotation.set(-sw * 0.8, Math.PI / 4 - sw2 * 0.6, 0);
    } else {
      it.position.set(0.38 - (this.eat > 0 ? 0.3 : 0), -0.24, -0.55);
      it.rotation.set(-sw * 1.1, -Math.PI / 2 + 0.35 - sw2 * 0.3, 0.45);
    }
    tint([this.mat, it?.userData.mat].filter(Boolean), light);
  }
}

// ── 부서지는 조각 · 연기 ───────────────────────────────────
export class Particles {
  constructor(scene, world) { this.scene = scene; this.world = world; this.list = []; }
  /** 블록 조각 — tile: 아틀라스 그림 이름 */
  burst(x, y, z, tile, count, light, spread = 0.5, speed = 3) {
    const mat = new THREE.MeshBasicMaterial({ map: ATLAS_TEX, alphaTest: 0.5, side: THREE.DoubleSide });
    mat.color.setScalar(light);
    for (let i = 0; i < count; i++) {
      const g = new THREE.PlaneGeometry(0.1, 0.1);
      const px = Math.floor(Math.random() * 12), py = Math.floor(Math.random() * 12);
      const [u0, v0, u1, v1] = ATLAS.uv(tile, px, py, px + 4, py + 4);
      const uv = g.attributes.uv;
      for (let k = 0; k < 4; k++) uv.setXY(k, uv.getX(k) ? u1 : u0, uv.getY(k) ? v1 : v0);
      const m = new THREE.Mesh(g, mat);
      m.position.set(x + (Math.random() - 0.5) * spread, y + (Math.random() - 0.5) * spread, z + (Math.random() - 0.5) * spread);
      this.scene.add(m);
      this.list.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * speed, Math.random() * speed, (Math.random() - 0.5) * speed), life: 0.4 + Math.random() * 0.6, g: 14, shared: mat });
    }
  }
  /** 연기 · 폭발 */
  puff(x, y, z, count, size, color = 0xffffff, speed = 2) {
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
      m.position.set(x + (Math.random() - 0.5) * size * 2, y + (Math.random() - 0.5) * size * 2, z + (Math.random() - 0.5) * size * 2);
      this.scene.add(m);
      this.list.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * speed, Math.random() * speed * 0.6, (Math.random() - 0.5) * speed), life: 0.6 + Math.random() * 0.6, g: -1, fade: true, grow: 1.5 });
    }
  }
  update(dt, cam) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.m); p.m.geometry.dispose();
        if (!p.shared) p.m.material.dispose();
        else if (!this.list.some((q) => q !== p && q.shared === p.shared)) p.shared.dispose();
        this.list.splice(i, 1);
        continue;
      }
      p.v.y -= p.g * dt;
      const n = p.m.position.clone().addScaledVector(p.v, dt);
      if (p.g > 0 && this.world.solidAt(n.x, n.y, n.z)) { p.v.set(0, 0, 0); } else p.m.position.copy(n);
      p.m.quaternion.copy(cam.quaternion);
      if (p.fade) { p.m.material.opacity = Math.min(0.9, p.life); p.m.scale.multiplyScalar(1 + p.grow * dt); }
    }
  }
}

/** 이름표 */
export function nameSprite(text) {
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
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, fog: false }));
  sp.scale.set((w / 56) * 0.32, 0.32, 1);
  sp.renderOrder = 999;
  return sp;
}
