// 모양 — 사람(나 · 다른 사람 · 좀비) · 동물 · 폭탄몬 · 손에 든 아이템 · 떨어진 아이템 · 부서지는 조각
import * as THREE from "../vendor/three.module.min.js";
import { BLOCKS } from "/shared/blocks.js";
import { ITEMS } from "/shared/items.js";
import { MOB, SHEEP_WOOL } from "/shared/mobs.js";
import { itemTile, HAIR_RGB } from "../textures.js";
import { cleanLook, defaultLook } from "/shared/look.js";

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
const ARMOR_TINT = { leather: 0xa0663a, iron: 0xd8d8dc, diamond: 0x55e0d8, wolf: 0x8a8a90 };

/** 그림자 — 발밑 둥근 그림자 */
export function makeShadow(size = 0.8) {
  const g = new THREE.PlaneGeometry(size, size);
  setUV(g, "shadow", (n) => SK.uv(n));
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0.03, 0);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: SKIN_TEX, transparent: true, depthWrite: false, fog: true }));
  m.renderOrder = 1;
  return m;
}

/** 모습 값 — 꾸민 모습 객체, 없으면 색 번호로 기본 모습 */
const lookOf = (look) => (look && typeof look === "object" ? cleanLook(look, true) : defaultLook(Number(look) || 0));

/** kind: "player" | "zombie" | "archer". look: 꾸민 모습(성별 · 옷 · 소매 · 머리) 또는 색 번호 */
export function makeHumanoid(kind = "player", look = 200) {
  const s = 1.8 / 32;
  const mat = skinMat();
  const mats = [mat];
  const z = kind === "zombie", sk = kind === "archer";
  const root = new THREE.Group();
  const L = lookOf(look);
  const female = kind === "player" && L.gender === "f";
  const T = z
    ? { face: "z_face", head: "z_head", top: "z_head", back: "z_head", body: "z_body", arm: "z_arm", armEnd: "z_head", leg: "z_leg", foot: "z_leg", bodyB: "z_body", bodyS: "z_body", armTop: "z_body" }
    : sk ? { face: "s_face", head: "s_head", top: "s_head", back: "s_head", body: "s_body", arm: "s_arm", armEnd: "s_arm", leg: "s_leg", foot: "s_leg", bodyB: "s_body", bodyS: "s_head", armTop: "s_head" }
    : { face: `pf_${L.hair}_${L.hairColor}`, head: `ps_${L.hair}_${L.hairColor}`, top: `pt_${L.hairColor}`, back: `pk_${L.hair}_${L.hairColor}`,
        body: `o_${L.outfit}_f`, arm: `o_${L.outfit}_${L.sleeve}`, armEnd: "p_arm_end", leg: `lg_${L.outfit}`, foot: "p_foot",
        bodyB: `o_${L.outfit}_b`, bodyS: `o_${L.outfit}_s`, armTop: `o_${L.outfit}_top` };
  const limb = sk ? 2 : 4;
  const armW = sk ? 2 : female ? 3 : 4; // 여자 캐릭터는 팔이 조금 가늘다
  const head = part(mat, 8, 8, 8, { f: T.face, b: T.back, l: T.head, r: T.head, t: T.top, u: T.head }, s, [0, -4, 0]);
  head.position.y = 24 * s;
  const body = part(mat, 8, 12, 4, { f: T.body, b: T.bodyB, l: T.bodyS, r: T.bodyS, t: T.armTop, u: T.armTop }, s);
  body.position.y = 18 * s;
  const arm = (side) => {
    const m = part(mat, armW, 12, limb, { f: T.arm, b: T.arm, l: T.arm, r: T.arm, t: T.armTop, u: T.armEnd }, s, [0, 4, 0]);
    m.position.set(side * (4 + armW / 2) * s, 22 * s, 0);
    return m;
  };
  const leg = (side) => {
    const m = part(mat, limb, 12, limb, { f: T.leg, b: T.leg, l: T.leg, r: T.leg, t: T.leg, u: T.foot }, s, [0, 6, 0]);
    m.position.set(side * 2 * s, 12 * s, 0);
    return m;
  };
  const armL = arm(-1), armR = arm(1), legL = leg(-1), legR = leg(1);
  root.add(head, body, armL, armR, legL, legR);
  if (kind === "player" && (L.hair === "pony" || L.hair === "long" || L.hair === "bob")) {
    const hairMat = skinMat();
    const rgb = HAIR_RGB[L.hairColor];
    hairMat.userData.base = new THREE.Color(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
    mats.push(hairMat);
    if (L.hair === "pony") {
      // 묶은 머리 — 뒤통수에서 아래로
      const tail = part(hairMat, 2, 6, 2, "hair_tail", s, [0, 3, 0]);
      tail.position.set(0, 4 * s, 4.6 * s);
      tail.rotation.x = 0.3;
      head.add(tail);
    } else if (L.hair === "long") {
      // 긴 머리 — 등 위까지 내려옴
      const back = part(hairMat, 8, 6, 1, "hair_tail", s, [0, 3, 0]);
      back.position.set(0, 0, 4.4 * s);
      head.add(back);
    } else {
      // 단발 — 옆머리가 볼까지
      for (const side of [-1, 1]) { const b = part(hairMat, 1, 3, 6, "hair_tail", s, [0, 1.5, 0]); b.position.set(side * 4.4 * s, 1 * s, 0.6 * s); head.add(b); }
    }
  }
  if (z) { armL.rotation.x = armR.rotation.x = -Math.PI / 2; }
  const hand = new THREE.Group();
  hand.position.set(0, -10 * s, -1 * s);
  armR.add(hand);
  if (sk) {
    const bow = part(mat, 1, 16, 2, { all: "bow", f: "bow" }, s);
    bow.rotation.x = Math.PI / 2;
    const bh = new THREE.Group(); bh.position.set(0, -10 * s, 0); bh.add(bow);
    armL.add(bh);
  }
  // 방어구 (보이지 않게 만들어 두고 입으면 보인다)
  const armorMat = skinMat();
  armorMat.userData.base = new THREE.Color(0xffffff);
  const armorParts = [
    [part(armorMat, 9, 9, 9, "armor", s, [0, -4, 0])],
    [part(armorMat, 9, 13, 5, "armor", s), part(armorMat, 5, 6, 5, "armor", s, [0, 1, 0]), part(armorMat, 5, 6, 5, "armor", s, [0, 1, 0])],
    [part(armorMat, 5, 8, 5, "armor", s, [0, 2, 0]), part(armorMat, 5, 8, 5, "armor", s, [0, 2, 0])],
    [part(armorMat, 5, 4, 5, "armor", s, [0, -4, 0]), part(armorMat, 5, 4, 5, "armor", s, [0, -4, 0])],
  ];
  head.add(armorParts[0][0]);
  body.add(armorParts[1][0]); armL.add(armorParts[1][1]); armR.add(armorParts[1][2]);
  legL.add(armorParts[2][0]); legR.add(armorParts[2][1]);
  legL.add(armorParts[3][0]); legR.add(armorParts[3][1]);
  armorParts[3].forEach((m) => { m.position.y = -10 * s; });
  armorParts.flat().forEach((m) => { m.visible = false; });
  const armorMats = [];
  const h = { root, head, body, arms: [armL, armR], legs: [legL, legR], hand, mats, kind, walk: 0, swing: 0, zombie: z || sk, archer: sk, armorParts, armorMats, look: L, armX: (4 + armW / 2) * s };
  const shadow = makeShadow(0.9);
  root.add(shadow);
  h.shadow = shadow;
  return h;
}

/** 입은 방어구 보이기 — ids: [투구, 갑옷, 바지, 신발] 아이템 번호 (0 = 없음) */
export function setArmor(h, ids) {
  ids.forEach((id, slot) => {
    const it = ITEMS[id];
    for (const m of h.armorParts[slot]) {
      m.visible = !!it?.armor;
      if (it?.armor != null) {
        if (!m.userData.own) { m.material = m.material.clone(); m.userData.own = true; h.mats.push(m.material); }
        m.material.userData.base = new THREE.Color(ARMOR_TINT[it.tierKey] ?? 0xffffff);
      }
    }
  });
}

/** 걷기 · 휘두르기 움직임 */
export function animateHumanoid(h, speed, dt, pitch = 0, crouch = false, act = false) {
  h.pitchAim = -pitch;
  h.walk += dt * Math.min(speed, 7) * 2.2;
  h.t = (h.t ?? 0) + dt;
  const amp = speed > 5 ? 0.95 : 0.7;
  const sw = speed > 0.3 ? Math.sin(h.walk) * amp : 0;
  h.legs[0].rotation.x = sw; h.legs[1].rotation.x = -sw;
  const idle = Math.sin(h.t * 1.6) * 0.04;
  if (h.dance) {
    // L 춤 — 오른손으로 이마에 L 자, 왼팔은 허리, 박자에 맞춰 다리를 번갈아 옆으로 차며 깡충
    const t = (h.danceT = (h.danceT ?? 0) + dt);
    const beat = Math.floor(t * 4) % 2;                 // 1초에 4박
    const hop = Math.abs(Math.sin(t * Math.PI * 4)) * 0.12;
    h.root.children.forEach((c) => { if (c !== h.shadow) c.userData.baseY ??= c.position.y; });
    for (const c of h.root.children) if (c.userData.baseY != null && c !== h.shadow) c.position.y = c.userData.baseY + hop;
    h.arms[1].rotation.set(-2.6, 0, -0.9);            // 오른팔 — 손이 이마로
    h.arms[0].rotation.set(0.2, 0, 0.9 + Math.sin(t * Math.PI * 4) * 0.2); // 왼팔 — 옆으로 흔들
    h.legs[0].rotation.set(0, 0, beat ? 0.7 : 0);       // 다리 번갈아 옆차기
    h.legs[1].rotation.set(0, 0, beat ? 0 : -0.7);
    h.body.rotation.z = beat ? 0.08 : -0.08;
    h.head.rotation.set(-0.15, beat ? 0.25 : -0.25, 0);
    return;
  }
  if (h.danceT) {
    // 춤 끝 — 원래 자세로
    h.danceT = 0;
    for (const c of h.root.children) if (c.userData.baseY != null) c.position.y = c.userData.baseY;
    for (const l of h.legs) l.rotation.set(0, 0, 0);
    h.body.rotation.z = 0;
    h.arms[1].rotation.set(0, 0, 0); h.arms[0].rotation.set(0, 0, 0);
  }
  if (h.gun) {
    // 총 겨누기 — 두 팔을 앞으로
    h.arms[1].rotation.set(-Math.PI / 2 - h.pitchAim * 0.8, -0.1, 0);
    h.arms[0].rotation.set(-Math.PI / 2 - h.pitchAim * 0.8, 0.5, 0);
  } else if (h.archer) {
    // 활 겨누기
    h.arms[0].rotation.set(act ? -Math.PI / 2 : -sw * 0.6, act ? 0.3 : 0, 0);
    h.arms[1].rotation.set(act ? -Math.PI / 2 : sw * 0.6, act ? -0.6 : 0, 0);
  } else if (h.zombie) { h.arms[0].rotation.x = -Math.PI / 2 + sw * 0.15 + idle; h.arms[1].rotation.x = -Math.PI / 2 - sw * 0.15 - idle; }
  else { h.arms[0].rotation.x = -sw * 0.8; h.arms[1].rotation.x = sw * 0.8; h.arms[0].rotation.z = -0.05 - idle; h.arms[1].rotation.z = 0.05 + idle; }
  if (h.swing > 0) {
    h.swing = Math.max(0, h.swing - dt * 3.5);
    const t = 1 - h.swing;
    h.arms[1].rotation.x = -Math.sin(t * Math.PI) * 1.4 - (h.zombie ? Math.PI / 2 : 0);
  }
  h.head.rotation.x = pitch;
  h.head.rotation.y = 0;
  // 웅크리기 — 몸을 앞으로 숙이고 낮춘다
  const c = crouch ? 1 : 0;
  h.body.rotation.x = c * 0.45;
  h.body.position.z = c * 0.12;
  h.head.position.y = 24 * (1.8 / 32) - c * 0.12;
  h.head.position.z = c * 0.08;
  for (const a of h.arms) a.position.y = 22 * (1.8 / 32) - c * 0.12;
  h.root.children.forEach((ch) => { if (ch === h.legs[0] || ch === h.legs[1]) ch.position.z = c * 0.18; });
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
  if (type === MOB.ZOMBIE || type === MOB.ARCHER) { const h = makeHumanoid(type === MOB.ZOMBIE ? "zombie" : "archer"); h.type = type; return h; }
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
  } else if (type === MOB.BOAR) {
    const body = part(mat, 10, 9, 16, "boar", s); body.position.y = 11 * s; root.add(body);
    const mane = part(mat, 4, 3, 12, "boar", s); mane.position.set(0, 17 * s, 1 * s); root.add(mane);
    m.head = part(mat, 8, 8, 7, { f: "boar_face", all: "boar" }, s, [0, 0, 3.5]);
    m.head.position.set(0, 12 * s, -8 * s);
    const snout = part(mat, 4, 3, 2, { f: "boar_snout", all: "boar_snout" }, s); snout.position.set(0, -1.5 * s, -8 * s);
    m.head.add(snout);
    for (const x of [-2.5, 2.5]) { const t = part(mat, 1, 2, 1, "tusk", s); t.position.set(x * s, -1 * s, -8.5 * s); m.head.add(t); }
    root.add(m.head);
    legs(4, 7, 4, "boar", 3, 5);
  } else if (type === MOB.WOLF) {
    const body = part(mat, 6, 6, 12, "wolf", s); body.position.y = 9 * s; root.add(body);
    const mane = part(mat, 8, 7, 6, "wolf", s); mane.position.set(0, 9.5 * s, -4 * s); root.add(mane);
    m.head = part(mat, 6, 6, 4, { f: "wolf_face", all: "wolf" }, s, [0, 0, 2]);
    m.head.position.set(0, 11 * s, -9 * s);
    const snout = part(mat, 3, 3, 4, { f: "wolf_snout", all: "wolf_snout" }, s); snout.position.set(0, -1.5 * s, -3.5 * s);
    for (const x of [-2, 2]) { const ear = part(mat, 2, 2, 1, "wolf_dark", s); ear.position.set(x * s, 4 * s, 0); m.head.add(ear); }
    m.head.add(snout);
    root.add(m.head);
    m.tail = part(mat, 2, 2, 8, "wolf", s, [0, 0, -4]); m.tail.position.set(0, 10 * s, 6 * s); m.tail.rotation.x = 0.7;
    root.add(m.tail);
    legs(2, 6, 2, "wolf", 2, 4);
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
  m.shadow = makeShadow(type === MOB.CHICKEN ? 0.45 : 1.0);
  root.add(m.shadow);
  return m;
}

export function animateMob(m, speed, dt, extra, time, act = false) {
  if (m.zombie) return animateHumanoid(m, speed, dt, 0, false, act);
  if (m.head) m.head.rotation.x = act ? 0.5 : Math.sin(time * 0.7 + m.root.id) * 0.08;
  if (m.tail) m.tail.rotation.y = Math.sin(time * (speed > 0.5 ? 12 : 3)) * 0.4;
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
// 납작한 아이템(도구 · 음식 등)은 그림 픽셀마다 두께를 줘서 입체로 만든다 — 그림 칸 이름별로 한 번만 만든다
const extrudeCache = new Map();
function extrudedGeometry(tile) {
  if (extrudeCache.has(tile)) return extrudeCache.get(tile);
  const [ox, oy] = ATLAS.where[tile] ?? ATLAS.where.stone;
  const ctx = ATLAS.canvas.getContext("2d");
  const data = ctx.getImageData(ox, oy, 16, 16).data;
  const solid = (x, y) => x >= 0 && y >= 0 && x < 16 && y < 16 && data[(y * 16 + x) * 4 + 3] > 20;
  const pos = [], uv = [], nrm = [], idx = [];
  const T = 1 / 16, D = 1 / 32; // 픽셀 크기 · 반두께
  const quad = (pts, n, u, v) => {
    const b = pos.length / 3;
    for (const q of pts) { pos.push(...q); nrm.push(...n); uv.push(u, v); }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (!solid(x, y)) continue;
    // 그 픽셀 가운데 색을 쓴다
    const [u0, v0, u1, v1] = ATLAS.uv(tile, x, y, x + 1, y + 1);
    const u = (u0 + u1) / 2, v = (v0 + v1) / 2;
    const x0 = x * T - 0.5, x1 = x0 + T, y1 = 0.5 - y * T, y0 = y1 - T;
    quad([[x0, y0, D], [x1, y0, D], [x1, y1, D], [x0, y1, D]], [0, 0, 1], u, v);
    quad([[x1, y0, -D], [x0, y0, -D], [x0, y1, -D], [x1, y1, -D]], [0, 0, -1], u, v);
    if (!solid(x - 1, y)) quad([[x0, y0, -D], [x0, y0, D], [x0, y1, D], [x0, y1, -D]], [-1, 0, 0], u, v);
    if (!solid(x + 1, y)) quad([[x1, y0, D], [x1, y0, -D], [x1, y1, -D], [x1, y1, D]], [1, 0, 0], u, v);
    if (!solid(x, y - 1)) quad([[x0, y1, D], [x1, y1, D], [x1, y1, -D], [x0, y1, -D]], [0, 1, 0], u, v);
    if (!solid(x, y + 1)) quad([[x0, y0, -D], [x1, y0, -D], [x1, y0, D], [x0, y0, D]], [0, -1, 0], u, v);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  g.userData.shared = true;
  extrudeCache.set(tile, g);
  return g;
}

/** 아이템 메시 — 블록은 작은 정육면체, 나머지는 입체 픽셀 모양 */
export function makeItemMesh(id, size = 0.25) {
  const it = ITEMS[id];
  const b = it?.block ? BLOCKS[it.block] : null;
  const mat = new THREE.MeshBasicMaterial({ map: ATLAS_TEX, alphaTest: 0.5, side: THREE.DoubleSide });
  let mesh;
  if (b && (b.kind === "solid" || b.kind === "cutout")) {
    const g = new THREE.BoxGeometry(size, size, size);
    const [top, bottom, side] = b.tex;
    setUV(g, { r: side, l: side, t: top, u: bottom, b: side, f: b.id === 28 ? "furnace_front" : b.id === 34 ? "chest_front" : side }, (n) => ATLAS.uv(n));
    mesh = new THREE.Mesh(g, mat);
    mesh.userData.block = true;
  } else {
    mesh = new THREE.Mesh(extrudedGeometry(itemTile(id)), mat);
    mesh.scale.setScalar(size * 1.6);
  }
  mesh.userData.mat = mat;
  return mesh;
}
export const disposeTree = (o) => o.traverse((m) => { if (!m.geometry?.userData.shared) m.geometry?.dispose(); if (m.material && m.material.map !== SKIN_TEX && m.material.map !== ATLAS_TEX) m.material.map?.dispose(); m.material?.dispose?.(); });

/** 날아가는 화살 */
export function makeArrow() {
  const mat = skinMat();
  const g = new THREE.Group();
  const shaft = part(mat, 1, 8, 1, "arrow", 1 / 16);
  shaft.rotation.x = Math.PI / 2;
  g.add(shaft);
  g.userData.mats = [mat];
  return g;
}

// ── 1인칭 손 ───────────────────────────────────────────────
export class Hand {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.01, 10);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.mat = skinMat();
    const s = 1 / 16;
    this.arm = part(this.mat, 4, 12, 4, { f: "o_white_long", b: "o_white_long", l: "o_white_long", r: "o_white_long", t: "o_white_top", u: "p_arm_end" }, s, [0, 6, 0]);
    this.arm.rotation.order = "YXZ";
    this.root.add(this.arm);
    this.grip = new THREE.Group();          // 손 끝 — 든 아이템이 여기 붙는다
    this.grip.position.set(0, -11 / 16, 0);
    this.arm.add(this.grip);
    this.itemId = -1;
    this.item = null;
    this.swing = 0;      // 0 ~ 1 (휘두르는 중)
    this.equip = 0;      // 바꿀 때 내려갔다 올라오기
    this.bob = 0;
    this.eat = 0;
  }
  /** 내 옷 소매로 (긴팔 · 반팔) */
  setLook(look) {
    const L = lookOf(look);
    const a = `o_${L.outfit}_${L.sleeve}`;
    const g = new THREE.BoxGeometry((L.gender === "f" ? 3 : 4) / 16, 12 / 16, 4 / 16);
    setUV(g, { f: a, b: a, l: a, r: a, t: `o_${L.outfit}_top`, u: "p_arm_end" }, (n) => SK.uv(n));
    g.translate(0, -6 / 16, 0);
    this.arm.geometry.dispose();
    this.arm.geometry = g;
  }
  setItem(id) {
    if (id === this.itemId) return;
    this.itemId = id;
    if (this.item) { this.item.parent?.remove(this.item); disposeTree(this.item); this.item = null; }
    this.gun = ITEMS[id]?.gun ?? null;
    if (id && this.gun) {
      // 총은 팔이 아니라 화면에 붙여 앞을 겨누게 (총구가 앞)
      this.item = makeItemMesh(id, 0.34);
      this.item.rotation.set(0, Math.PI / 2, 0);
      this.root.add(this.item);
      this.flash = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0.95, depthTest: false }));
      this.flash.visible = false;
      this.item.add(this.flash);
      this.flash.position.set(0.5, 0.05, 0);
      this.flash.rotation.y = -Math.PI / 2;
    } else if (id) {
      const tool = !(ITEMS[id]?.block && ["solid", "cutout"].includes(BLOCKS[ITEMS[id].block].kind));
      this.item = makeItemMesh(id, tool ? 0.5 : 0.3);
      // 도구는 손잡이를 쥐고 머리가 앞쪽 위로, 블록은 손바닥 위에
      const tp = this.toolPose ?? { pos: [0, -0.32, -0.12], rot: [0.2, Math.PI / 2, -Math.PI * 0.7] };
      if (tool) { this.item.rotation.set(...tp.rot); this.item.position.set(...tp.pos); }
      else { this.item.rotation.set(0.3, Math.PI / 4, 0); this.item.position.set(0, -0.14, -0.12); }
      this.grip.add(this.item);
    }
    this.equip = 1;
  }
  doSwing() { if (this.swing <= 0.2) this.swing = 1; }
  /** 총 반동 · 총구 불꽃 */
  fire() { this.kick = 1; if (this.flash) { this.flash.visible = true; this.flash.rotation.z = Math.random() * 3; } }
  update(dt, walkSpeed, light, aspect, o = {}) {
    if (this.camera.aspect !== aspect) { this.camera.aspect = aspect; this.camera.updateProjectionMatrix(); }
    if (walkSpeed > 0.5 && !o.air) this.bob += dt * walkSpeed * 1.6;
    if (o.mining) this.doSwing();
    // 점프 · 낙하 때 손이 살짝 따라 움직인다
    this.lift = (this.lift ?? 0) + ((o.vy ? Math.max(-0.08, Math.min(0.08, -o.vy * 0.01)) : 0) - (this.lift ?? 0)) * Math.min(1, dt * 8);
    this.swing = Math.max(0, this.swing - dt * 3.3);
    this.equip = Math.max(0, this.equip - dt * 4);
    const t = 1 - this.swing;
    const sw = this.swing > 0 ? Math.sin(t * Math.PI) : 0;
    const sw2 = this.swing > 0 ? Math.sin(Math.sqrt(t) * Math.PI) : 0;
    const k = o.sprint ? 1.8 : 1;
    const breathe = Math.sin(performance.now() / 900) * 0.006;
    const bx = Math.sin(this.bob) * 0.025 * k, by = -Math.abs(Math.cos(this.bob)) * 0.03 * k + breathe + this.lift;
    const eatY = this.eat > 0 ? Math.abs(Math.sin(this.eat * 18)) * 0.05 : 0;
    this.root.position.set(bx - sw2 * 0.25, by - this.equip * 0.5 + sw * 0.12 + eatY, -sw * 0.15);
    this.root.rotation.set(o.sprint ? -0.08 : 0, 0, o.sprint ? Math.sin(this.bob) * 0.04 : 0);
    const it = this.item;
    this.root.visible = !o.scoped; // 스코프로 볼 때는 손 · 총을 숨긴다
    if (this.gun && it) {
      // 총 — 허리 높이 ↔ 조준(가운데) · 반동 · 장전 때 내리기
      this.kick = Math.max(0, (this.kick ?? 0) - dt * 9);
      if (this.flash && this.kick < 0.6) this.flash.visible = false;
      const a = this.aimK = (this.aimK ?? 0) + ((o.aim ? 1 : 0) - (this.aimK ?? 0)) * Math.min(1, dt * 12);
      const rl = o.reloading ? 1 : 0;
      it.position.set(0.3 * (1 - a), -0.22 * (1 - a) - 0.11 * a - rl * 0.2, -0.7 + this.kick * 0.06);
      it.rotation.set(this.kick * 0.12 + rl * 0.6, Math.PI / 2, 0);
      this.arm.position.set(0.42 - a * 0.22, -0.8, -0.72);
      this.arm.rotation.set(1.6, 0.35, -0.1);
      tint([this.mat, it.userData.mat], light);
      return;
    }
    // 팔 아래쪽(어깨)이 화면 오른쪽 아래 밖, 손이 앞쪽 위로 보이게 · 먹을 때는 입 쪽으로
    const eatK = this.eat > 0 ? 1 : 0;
    this.arm.position.set((this.armPos?.[0] ?? 0.64) - eatK * 0.3, (this.armPos?.[1] ?? -0.7) + eatK * 0.08, this.armPos?.[2] ?? -0.85);
    this.arm.rotation.set((this.armRot?.[0] ?? 1.78) + sw * 0.5 - (it ? 0.15 : 0), (this.armRot?.[1] ?? 0.4) + sw2 * 0.45 + eatK * 0.5, this.armRot?.[2] ?? -0.1);
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
  /** 피 — 튀는 핏방울(작은 상자) + 바닥에 남는 핏자국. dir: 튀는 방향 */
  blood(x, y, z, n, dir = null, big = false) {
    this.bloodMats ??= [0x8a0000, 0xa80c0c, 0x6a0000, 0xc41818].map((c) => new THREE.MeshBasicMaterial({ color: c }));
    this.dropGeo ??= new THREE.BoxGeometry(0.07, 0.07, 0.07);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.dropGeo, this.bloodMats[i % 4]);
      m.position.set(x + (Math.random() - 0.5) * 0.3, y + (Math.random() - 0.5) * 0.3, z + (Math.random() - 0.5) * 0.3);
      const sc = 0.5 + Math.random() * (big ? 1.6 : 1);
      m.scale.setScalar(sc);
      this.scene.add(m);
      const sp = big ? 5 : 3.2;
      const v = new THREE.Vector3((Math.random() - 0.5) * sp, Math.random() * sp * 0.8 + 0.5, (Math.random() - 0.5) * sp);
      if (dir) v.addScaledVector(new THREE.Vector3(...dir), 3 + Math.random() * 3);
      this.list.push({ m, v, life: 1.2 + Math.random() * 0.8, g: 18, blood: true, shared: true, keep: true });
    }
  }
  /** 바닥 핏자국 (오래되면 사라짐) */
  splat(x, y, z, size) {
    this.decals ??= [];
    this.splatMat ??= [0x6a0000, 0x7c0606, 0x560000].map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    const g = new THREE.PlaneGeometry(size, size);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, this.splatMat[Math.floor(Math.random() * 3)]);
    m.rotation.y = Math.random() * Math.PI;
    m.position.set(x, Math.floor(y) + 0.015, z);
    this.scene.add(m);
    this.decals.push({ m, t: 60 });
    if (this.decals.length > 400) { const old = this.decals.shift(); this.scene.remove(old.m); old.m.geometry.dispose(); }
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
    if (this.decals) for (let i = this.decals.length - 1; i >= 0; i--) {
      const d = this.decals[i];
      d.t -= dt;
      if (d.t <= 0) { this.scene.remove(d.m); d.m.geometry.dispose(); this.decals.splice(i, 1); }
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.m);
        if (p.blood) { this.list.splice(i, 1); continue; }
        p.m.geometry.dispose();
        if (!p.shared) p.m.material.dispose();
        else if (!this.list.some((q) => q !== p && q.shared === p.shared)) p.shared.dispose();
        this.list.splice(i, 1);
        continue;
      }
      p.v.y -= p.g * dt;
      const n = p.m.position.clone().addScaledVector(p.v, dt);
      if (p.g > 0 && this.world.solidAt(n.x, n.y, n.z)) {
        if (p.blood && !p.landed) { p.landed = true; if (Math.random() < 0.5) this.splat(p.m.position.x, n.y + 1, p.m.position.z, 0.15 + Math.random() * 0.35); }
        p.v.set(0, 0, 0);
      } else p.m.position.copy(n);
      if (!p.blood) p.m.quaternion.copy(cam.quaternion);
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

/** 말풍선 (춤 대사 등) */
export function speechSprite(text) {
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");
  ctx.font = "bold 44px Malgun Gothic, sans-serif";
  const w = Math.ceil(ctx.measureText(text).width) + 40;
  c.width = w; c.height = 84;
  ctx.font = "bold 44px Malgun Gothic, sans-serif";
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.roundRect(2, 2, w - 4, 62, 18); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(w / 2 - 12, 62); ctx.lineTo(w / 2, 82); ctx.lineTo(w / 2 + 12, 62); ctx.fill();
  ctx.fillStyle = "#111";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 20, 34);
  const tex = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, fog: false }));
  sp.scale.set((w / 84) * 0.45, 0.45, 1);
  sp.renderOrder = 1000;
  return sp;
}
