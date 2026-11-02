// 몹 · 바닥에 떨어진 아이템 · 화살 · 폭발 — 서버가 움직이고 모두에게 똑같이 보낸다.
//
// 몹 AI (상태 기계)
//   idle(가만히) → wander(돌아다님) → chase(플레이어 발견: 눈으로 보여야 함, 길찾기로 추적) → attack
//   → 놓치면 return(원래 자리로) · passive 는 맞으면 flee(도망) · neutral(멧돼지)은 맞으면 chase
import { AIR, B, BLOCKS, needsSupport, isOpaque } from "../shared/blocks.js";
import { blockDrops } from "../shared/items.js";
import { MOBS, MOB, mobDrops } from "../shared/mobs.js";
import { HEIGHT } from "../shared/worldgen.js";
import { blocksBody } from "./world.js";

const GRAVITY = 28;
export const GRENADE_G = 20; // 수류탄 중력 (브라우저의 궤적 미리보기와 같은 값)
const ITEM_LIFE = 300;
const MAX_ITEMS = 400;
const MAX_MOBS = 140;
const r2 = (v) => Math.round(v * 100) / 100;
const rand = (a, b) => a + Math.random() * (b - a);

export class Entities {
  /**
   * hooks.players(): [Player] · hooks.damagePlayer(pl, dmg, cause, from, kb, by)
   * hooks.broadcast(obj) · hooks.blocksChanged([[x,y,z,b]...]) · hooks.removeContainer(key) → [아이템]
   */
  constructor(world, hooks) {
    this.world = world;
    this.hooks = hooks;
    this.mobs = new Map();
    this.items = new Map();
    this.arrows = new Map();
    this.grenades = new Map();
    this.nextId = 1;
    this.spawnTimer = 0;
  }

  // ── 아이템 ───────────────────────────────────────────────
  spawnItem(item, x, y, z, v = null, pickDelay = 0.5) {
    if (!item || item.n <= 0) return null;
    const id = this.nextId++;
    const vel = v ?? [rand(-1.5, 1.5), rand(3, 5), rand(-1.5, 1.5)];
    this.items.set(id, { id, item: { ...item }, x, y, z, vx: vel[0], vy: vel[1], vz: vel[2], age: 0, pickAt: pickDelay, ground: false });
    if (this.items.size > MAX_ITEMS) {
      const old = this.items.keys().next().value;
      this.items.delete(old);
      this.hooks.broadcast({ t: "take", id: old, by: 0 });
    }
    return id;
  }

  /** 줍기 — 먼저 요청한 사람이 가져간다. 성공하면 아이템 */
  takeItem(id, pl) {
    const it = this.items.get(id);
    if (!it || it.age < it.pickAt) return null;
    const d = Math.hypot(it.x - pl.p[0], it.y - (pl.p[1] + 0.9), it.z - pl.p[2]);
    if (d > 3) return null;
    this.items.delete(id);
    this.hooks.broadcast({ t: "take", id, by: pl.id });
    return it.item;
  }

  // ── 몹 ───────────────────────────────────────────────────
  spawnMob(type, x, y, z, extra = 0) {
    if (this.mobs.size >= MAX_MOBS || !MOBS[type]) return null;
    const def = MOBS[type];
    const id = this.nextId++;
    this.mobs.set(id, {
      id, type, def, x, y, z, vx: 0, vy: 0, vz: 0, yaw: rand(0, Math.PI * 2), hp: def.hp,
      hurt: 0, inv: 0, ground: false, state: "idle", timer: rand(1, 4), goal: null, path: null, pathT: 0,
      target: null, lostT: 0, angry: 0, from: null, fuse: 0, burn: 0, attackCd: 0, act: 0,
      extra, farTime: 0, home: [x, y, z], fallStart: y,
    });
    return id;
  }

  /** 플레이어가 몹을 때림 — 서버가 거리 · 무기 공격력을 확인한다 */
  attack(id, pl, dmg) {
    const m = this.mobs.get(id);
    if (!m || m.inv > 0) return false;
    const d = Math.hypot(m.x - pl.p[0], m.y + m.def.h / 2 - (pl.p[1] + 1.4), m.z - pl.p[2]);
    if (d > 5) return false;
    if (!this.world.sees([pl.p[0], pl.p[1] + 1.6, pl.p[2]], [m.x, m.y + m.def.h * 0.6, m.z])) return false;
    this.damageMob(m, dmg, pl.p, pl);
    return true;
  }

  damageMob(m, dmg, from, by = null) {
    if (m.inv > 0 || !this.mobs.has(m.id)) return;
    m.hp -= dmg;
    this.hooks.broadcast({ t: "blood", p: [r2(m.x), r2(m.y + m.def.h * 0.6), r2(m.z)], n: Math.min(30, 6 + dmg * 3), mob: m.type });
    m.hurt = 0.4;
    m.inv = 0.5;
    if (from) {
      const dx = m.x - from[0], dz = m.z - from[2], l = Math.hypot(dx, dz) || 1;
      m.vx = (dx / l) * 7; m.vz = (dz / l) * 7; m.vy = 5.5;
      m.from = [from[0], from[1], from[2]];
    }
    this.hooks.broadcast({ t: "mobhurt", id: m.id });
    if (m.def.attitude === "passive") { m.state = "flee"; m.timer = 5; }
    if (m.def.attitude === "neutral" && by) {
      m.angry = 25; m.target = by.id; m.state = "chase";
      // 늑대는 무리가 같이 덤빈다
      if (m.def.pack) for (const o of this.mobs.values()) {
        if (o !== m && o.type === m.type && Math.hypot(o.x - m.x, o.z - m.z) < 14) { o.angry = 25; o.target = by.id; o.state = "chase"; }
      }
    }
    if (m.def.attitude === "hostile" && by && by.mode === "survival") { m.target = by.id; m.state = "chase"; }
    if (m.hp <= 0) {
      this.mobs.delete(m.id);
      this.hooks.broadcast({ t: "mobdie", id: m.id, p: [r2(m.x), r2(m.y), r2(m.z)] });
      for (const [id, n] of mobDrops(m.type, m.extra)) if (n > 0) this.spawnItem({ id, n }, m.x, m.y + 0.5, m.z);
      if (by) by.addXp(m.def.xp ?? 1);
    }
  }

  // ── 폭발 ─────────────────────────────────────────────────
  explode(x, y, z, power = 3) {
    const w = this.world;
    const changes = [];
    if (w.rules.mobGriefing) {
      const R = power + 0.5;
      for (let dy = -Math.ceil(R); dy <= Math.ceil(R); dy++) {
        for (let dz = -Math.ceil(R); dz <= Math.ceil(R); dz++) {
          for (let dx = -Math.ceil(R); dx <= Math.ceil(R); dx++) {
            const bx = Math.floor(x) + dx, by = Math.floor(y) + dy, bz = Math.floor(z) + dz;
            if (by < 1 || by >= HEIGHT) continue;
            if (Math.hypot(dx, dy, dz) > R - Math.random() * 1.2) continue;
            const b = w.get(bx, by, bz);
            if (b === AIR || b === B.WATER || b === B.LAVA || b === B.OBSIDIAN || BLOCKS[b]?.unbreakable) continue;
            w.set(bx, by, bz, AIR);
            changes.push([bx, by, bz, AIR]);
            if (Math.random() < 0.3) for (const [id, n] of blockDrops(b, 282)) this.spawnItem({ id, n }, bx + 0.5, by + 0.5, bz + 0.5);
            for (const it of this.hooks.removeContainer(`${bx},${by},${bz}`)) this.spawnItem(it, bx + 0.5, by + 0.5, bz + 0.5);
          }
        }
      }
      for (const [bx, by, bz] of changes.slice()) {
        const up = w.get(bx, by + 1, bz);
        if (needsSupport(up)) { w.set(bx, by + 1, bz, AIR); changes.push([bx, by + 1, bz, AIR]); }
      }
      if (changes.length) this.hooks.blocksChanged(changes);
    }
    this.hooks.broadcast({ t: "boom", p: [r2(x), r2(y), r2(z)], power });
    const reach = power * 2;
    for (const pl of this.hooks.players()) {
      const d = Math.hypot(pl.p[0] - x, pl.p[1] + 0.9 - y, pl.p[2] - z);
      if (d < reach) this.hooks.damagePlayer(pl, Math.round((1 - d / reach) * 22), "explosion", [x, y - 0.5, z], 1.8);
    }
    for (const m of [...this.mobs.values()]) {
      const d = Math.hypot(m.x - x, m.y + m.def.h / 2 - y, m.z - z);
      if (d < reach) { m.inv = 0; this.damageMob(m, (1 - d / reach) * 20, [x, y, z]); }
    }
  }

  // ── 매 틱 (1초에 20번) ─────────────────────────────────────
  tick(dt) {
    const players = this.hooks.players().filter((p) => !p.dead);
    for (const it of [...this.items.values()]) this.tickItem(it, dt);
    for (const a of [...this.arrows.values()]) this.tickArrow(a, dt, players);
    for (const g of [...this.grenades.values()]) this.tickGrenade(g, dt);
    for (const m of [...this.mobs.values()]) this.tickMob(m, dt, players);
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 1;
      this.trySpawn(players);
      this.mergeItems();
    }
  }

  tickItem(it, dt) {
    it.age += dt;
    if (it.age > ITEM_LIFE || it.y < -20) { this.items.delete(it.id); this.hooks.broadcast({ t: "take", id: it.id, by: 0 }); return; }
    const w = this.world;
    const at = w.get(Math.floor(it.x), Math.floor(it.y + 0.1), Math.floor(it.z));
    if (at === B.LAVA) { this.items.delete(it.id); this.hooks.broadcast({ t: "take", id: it.id, by: -1 }); return; }
    if (it.ground && it.age > 1 && blocksBody(w.get(Math.floor(it.x), Math.floor(it.y - 0.05), Math.floor(it.z)))) return;
    if (at === B.WATER) { it.vy = Math.min(it.vy + 20 * dt, 1.2); it.vx *= 0.9; it.vz *= 0.9; }
    else it.vy -= GRAVITY * 0.6 * dt;
    if (blocksBody(at)) { it.y = Math.floor(it.y + 0.1) + 1.01; it.vy = 0; }
    move(w, it, 0.125, 0.25, dt);
    if (it.ground) { it.vx *= 0.6; it.vz *= 0.6; } else { it.vx *= 0.98; it.vz *= 0.98; }
  }

  mergeItems() {
    const list = [...this.items.values()].filter((i) => i.ground);
    for (let a = 0; a < list.length; a++) {
      const A = list[a];
      if (!this.items.has(A.id)) continue;
      for (let b = a + 1; b < list.length; b++) {
        const Bi = list[b];
        if (!this.items.has(Bi.id) || A.item.id !== Bi.item.id || A.item.dmg || Bi.item.dmg) continue;
        if (Math.abs(A.x - Bi.x) > 1.2 || Math.abs(A.y - Bi.y) > 0.6 || Math.abs(A.z - Bi.z) > 1.2) continue;
        if (A.item.n + Bi.item.n > 64) continue;
        A.item.n += Bi.item.n;
        A.age = Math.min(A.age, Bi.age);
        this.items.delete(Bi.id);
        this.hooks.broadcast({ t: "take", id: Bi.id, by: 0 });
      }
    }
  }

  // ── 수류탄 ───────────────────────────────────────────────
  throwGrenade(owner, o, v, fuse) {
    const id = this.nextId++;
    this.grenades.set(id, { id, owner, x: o[0], y: o[1], z: o[2], vx: v[0], vy: v[1], vz: v[2], fuse });
    return id;
  }

  tickGrenade(g, dt) {
    g.fuse -= dt;
    if (g.fuse <= 0) { this.grenades.delete(g.id); this.hooks.grenadeBoom(g); return; }
    g.vy -= GRENADE_G * dt;
    const steps = 3;
    for (let i = 0; i < steps; i++) {
      const sdt = dt / steps;
      for (const ax of ["x", "y", "z"]) {
        const v = g["v" + ax];
        const n = { x: g.x, y: g.y, z: g.z };
        n[ax] += v * sdt;
        if (blocksBody(this.world.get(Math.floor(n.x), Math.floor(n.y), Math.floor(n.z)))) {
          g["v" + ax] = -v * 0.35;                                 // 튕기기
          if (ax === "y") { g.vx *= 0.7; g.vz *= 0.7; }
        } else g[ax] = n[ax];
      }
    }
  }

  // ── 화살 ─────────────────────────────────────────────────
  shoot(m, target) {
    const sx = m.x, sy = m.y + 1.5, sz = m.z;
    const tx = target.p[0], ty = target.p[1] + 1.2, tz = target.p[2];
    const dx = tx - sx, dz = tz - sz, flat = Math.hypot(dx, dz);
    const speed = 18;
    const t = flat / speed;
    const vy = (ty - sy) / t + 0.5 * 20 * t; // 중력만큼 위로
    const err = 0.06 * flat / 10;
    const id = this.nextId++;
    this.arrows.set(id, { id, x: sx, y: sy, z: sz, vx: (dx / flat) * speed + rand(-err, err) * speed, vy, vz: (dz / flat) * speed + rand(-err, err) * speed, age: 0, stuck: false, by: m.def.name });
  }

  tickArrow(a, dt, players) {
    a.age += dt;
    if (a.age > (a.stuck ? 10 : 6)) { this.arrows.delete(a.id); return; }
    if (a.stuck) return;
    a.vy -= 20 * dt;
    const steps = 4;
    for (let i = 0; i < steps; i++) {
      a.x += (a.vx * dt) / steps; a.y += (a.vy * dt) / steps; a.z += (a.vz * dt) / steps;
      if (isOpaque(this.world.get(Math.floor(a.x), Math.floor(a.y), Math.floor(a.z)))) { a.stuck = true; return; }
      for (const pl of players) {
        if (Math.abs(pl.p[0] - a.x) < 0.4 && Math.abs(pl.p[2] - a.z) < 0.4 && a.y > pl.p[1] && a.y < pl.p[1] + 1.85) {
          this.hooks.damagePlayer(pl, 3 + Math.floor(Math.random() * 2), "arrow", [a.x - a.vx * 0.05, a.y, a.z - a.vz * 0.05], 0.6, a.by);
          this.arrows.delete(a.id);
          return;
        }
      }
    }
  }

  // ── 몹 행동 ──────────────────────────────────────────────
  tickMob(m, dt, players) {
    const w = this.world, def = m.def;
    m.hurt = Math.max(0, m.hurt - dt);
    m.inv = Math.max(0, m.inv - dt);
    m.attackCd = Math.max(0, m.attackCd - dt);
    m.act = Math.max(0, m.act - dt);
    m.angry = Math.max(0, m.angry - dt);

    let anyD = Infinity;
    for (const pl of players) anyD = Math.min(anyD, Math.hypot(pl.p[0] - m.x, pl.p[1] - m.y, pl.p[2] - m.z));
    if (anyD > 96) { this.mobs.delete(m.id); return; }
    if (def.attitude === "hostile" && anyD > 44) { m.farTime += dt; if (m.farTime > 30) { this.mobs.delete(m.id); return; } } else m.farTime = 0;

    const feet = w.get(Math.floor(m.x), Math.floor(m.y + 0.1), Math.floor(m.z));
    const inWater = feet === B.WATER || w.get(Math.floor(m.x), Math.floor(m.y + 0.6), Math.floor(m.z)) === B.WATER;
    if (feet === B.LAVA) { m.inv = 0; this.damageMob(m, 4 * dt * 5, null); if (!this.mobs.has(m.id)) return; }

    // 좀비 · 해골은 맑은 날 해를 보면 불탄다
    if ((m.type === MOB.ZOMBIE || m.type === MOB.ARCHER) && w.daylight > 0.5 && w.weather === "clear" && !inWater &&
        w.seesSky(Math.floor(m.x), Math.floor(m.y + def.h - 0.1), Math.floor(m.z))) {
      m.burn += dt;
      if (m.burn >= 1) { m.burn = 0.001; m.inv = 0; this.damageMob(m, 1, null); if (!this.mobs.has(m.id)) return; }
    } else m.burn = 0;

    const target = m.target ? players.find((p) => p.id === m.target && p.mode === "survival") : null;
    if (m.target && !target) { m.target = null; if (m.state === "chase" || m.state === "attack") { m.state = "return"; m.path = null; } }

    // ── 플레이어 찾기 (눈으로 보여야 한다) ──
    const hunts = def.attitude === "hostile" || (def.attitude === "neutral" && m.angry > 0);
    if (hunts && !target && def.attitude === "hostile") {
      let best = null, bestD = def.sight;
      for (const pl of players) {
        if (pl.mode !== "survival") continue;
        const d = Math.hypot(pl.p[0] - m.x, pl.p[1] - m.y, pl.p[2] - m.z);
        if (d >= bestD) continue;
        const sneakMul = pl.flags & 1 ? 0.6 : 1;
        if (d > def.sight * sneakMul) continue;
        if (d > 2.5 && !w.sees([m.x, m.y + def.h * 0.85, m.z], [pl.p[0], pl.p[1] + 1.6, pl.p[2]])) continue;
        best = pl; bestD = d;
      }
      if (best) { m.target = best.id; m.state = "chase"; m.path = null; m.lostT = 0; }
    }
    if (def.attitude === "neutral" && m.angry <= 0 && m.target) { m.target = null; m.state = "wander"; }

    let speed = 0, gx = 0, gz = 0;
    const tgt = m.target ? players.find((p) => p.id === m.target) : null;
    if (tgt && (m.state === "chase" || m.state === "attack")) {
      const d = Math.hypot(tgt.p[0] - m.x, tgt.p[1] - m.y, tgt.p[2] - m.z);
      const seen = w.sees([m.x, m.y + def.h * 0.85, m.z], [tgt.p[0], tgt.p[1] + 1.6, tgt.p[2]]);
      m.lostT = seen ? 0 : m.lostT + dt;
      if (d > def.sight * 1.6 || m.lostT > 6) { m.target = null; m.state = "return"; m.path = null; }
      else {
        const flat = Math.hypot(tgt.p[0] - m.x, tgt.p[2] - m.z);
        speed = def.run;
        if (m.type === MOB.ZOMBIE || m.type === MOB.BOAR || m.type === MOB.WOLF) {
          if (flat < 1.4 && Math.abs(tgt.p[1] - m.y) < 1.8 && m.attackCd <= 0 && seen) {
            m.attackCd = 1; m.act = 0.4;
            this.hooks.damagePlayer(tgt, def.damage, "mob", [m.x, m.y, m.z], 1, def.name);
          }
          if (flat < 0.9) speed = 0;
        } else if (m.type === MOB.BOMBER) {
          if (d < 3.2 && seen) { m.fuse += dt; speed = 0; if (m.fuse < dt * 1.5) this.hooks.broadcast({ t: "hiss", id: m.id }); }
          else if (d > 6) m.fuse = Math.max(0, m.fuse - dt);
          else if (m.fuse > 0) m.fuse += dt;
          if (m.fuse >= def.fuse) { this.mobs.delete(m.id); this.explode(m.x, m.y + 0.6, m.z, 3); return; }
        } else if (m.type === MOB.ARCHER) {
          if (seen && d < 16) {
            // 6~12칸 거리를 유지하며 쏜다
            if (d < 6) { speed = def.walk; gx = m.x - tgt.p[0]; gz = m.z - tgt.p[2]; }
            else speed = 0;
            if (m.attackCd <= 0) { m.attackCd = 2; m.act = 0.8; this.shoot(m, tgt); }
          }
        }
        if (speed > 0 && !(m.type === MOB.ARCHER && gx)) [gx, gz] = this.steer(m, Math.floor(tgt.p[0]), Math.floor(tgt.p[1]), Math.floor(tgt.p[2]), dt);
        this.face(m, tgt.p[0] - m.x, tgt.p[2] - m.z, dt);
      }
    } else {
      if (m.type === MOB.BOMBER) m.fuse = Math.max(0, m.fuse - dt);
      m.timer -= dt;
      if (m.state === "flee") {
        if (m.timer <= 0) { m.state = "idle"; m.timer = rand(1, 3); }
        if (!m.goal || Math.hypot(m.goal[0] - m.x, m.goal[1] - m.z) < 1) {
          const ax = m.from ? m.x - m.from[0] : rand(-1, 1), az = m.from ? m.z - m.from[2] : rand(-1, 1);
          const a = Math.atan2(az, ax) + rand(-0.8, 0.8);
          m.goal = [m.x + Math.cos(a) * 8, m.z + Math.sin(a) * 8];
        }
        speed = def.run;
      } else if (m.state === "return") {
        if (Math.hypot(m.home[0] - m.x, m.home[2] - m.z) < 3 || m.timer < -20) { m.state = "idle"; m.timer = rand(1, 3); m.path = null; }
        else { speed = def.walk; [gx, gz] = this.steer(m, Math.floor(m.home[0]), Math.floor(m.home[1]), Math.floor(m.home[2]), dt); }
      } else if (m.timer <= 0) {
        m.timer = rand(2, 7);
        if (Math.random() < 0.65) {
          m.state = "wander";
          // 집에서 너무 멀어지지 않게
          const hx = m.home[0] - m.x, hz = m.home[2] - m.z;
          const far = Math.hypot(hx, hz) > 16;
          m.goal = [m.x + (far ? Math.sign(hx) * 6 : 0) + rand(-7, 7), m.z + (far ? Math.sign(hz) * 6 : 0) + rand(-7, 7)];
        } else { m.state = "idle"; m.goal = null; }
      }
      if (m.goal && (m.state === "wander" || m.state === "flee")) {
        gx = m.goal[0] - m.x; gz = m.goal[1] - m.z;
        if (Math.hypot(gx, gz) < 0.5) { m.goal = null; if (m.state === "wander") m.state = "idle"; }
        else if (m.state === "wander") speed = def.walk;
      }
      // 낭떠러지 · 물 · 용암 앞에서 멈춤
      const len = Math.hypot(gx, gz);
      if (speed > 0 && len > 0.01 && m.ground) {
        const ax = Math.floor(m.x + (gx / len) * 0.9), az = Math.floor(m.z + (gz / len) * 0.9);
        let drop = 0;
        while (drop < 4 && !blocksBody(w.get(ax, Math.floor(m.y) - 1 - drop, az))) drop++;
        const below = w.get(ax, Math.floor(m.y) - 1, az);
        if (drop >= 4 || below === B.LAVA || w.get(ax, Math.floor(m.y), az) === B.LAVA || (below === B.WATER && m.state !== "flee")) { m.goal = null; speed = 0; }
      }
      if (speed > 0 && len > 0.01) this.face(m, gx, gz, dt);
    }

    const len = Math.hypot(gx, gz);
    if (len > 0.01) { gx /= len; gz /= len; } else speed = 0;
    const accel = m.ground ? 10 : 2;
    m.vx += (gx * speed - m.vx) * Math.min(1, accel * dt);
    m.vz += (gz * speed - m.vz) * Math.min(1, accel * dt);
    if (inWater) m.vy = Math.min(m.vy + 22 * dt, 2.2);
    else {
      m.vy -= GRAVITY * dt;
      if (m.type === MOB.CHICKEN) m.vy = Math.max(m.vy, -3);
    }
    const wasGround = m.ground;
    const blocked = move(w, m, def.w, def.h, dt);
    if (blocked && m.ground && speed > 0) m.vy = 8.2;
    // 낙하 피해
    if (!m.ground && wasGround) m.fallStart = m.y;
    if (m.ground && !wasGround) {
      const fall = m.fallStart - m.y;
      if (fall > 3.5 && m.type !== MOB.CHICKEN && !inWater) { m.inv = 0; this.damageMob(m, Math.floor(fall - 3), null); }
      m.fallStart = m.y;
    }
    if (inWater) m.fallStart = m.y;
    if (m.y < -20 && this.mobs.has(m.id)) this.mobs.delete(m.id);
  }

  face(m, dx, dz, dt) {
    const want = Math.atan2(-dx, -dz);
    let diff = want - m.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    m.yaw += diff * Math.min(1, dt * 8);
  }

  /** 길찾기로 다음 지점 방향 — 막히면 곧장 */
  steer(m, tx, ty, tz, dt) {
    m.pathT -= dt;
    const goalMoved = !m.pathGoal || Math.abs(m.pathGoal[0] - tx) + Math.abs(m.pathGoal[2] - tz) > 2;
    if ((!m.path || m.pathT <= 0 || goalMoved) && m.ground) {
      m.path = findPath(this.world, Math.floor(m.x), Math.floor(m.y + 0.01), Math.floor(m.z), tx, ty, tz);
      m.pathGoal = [tx, ty, tz];
      m.pathT = 1 + Math.random() * 0.5;
    }
    if (m.path?.length) {
      let n = m.path[0];
      while (n && Math.hypot(n[0] + 0.5 - m.x, n[2] + 0.5 - m.z) < 0.45 && Math.abs(n[1] - m.y) < 1.2) { m.path.shift(); n = m.path[0]; }
      if (n) return [n[0] + 0.5 - m.x, n[2] + 0.5 - m.z];
    }
    return [tx + 0.5 - m.x, tz + 0.5 - m.z];
  }

  // ── 몹 생기기 ────────────────────────────────────────────
  trySpawn(players) {
    const w = this.world;
    for (const pl of players) {
      let passive = 0, hostile = 0;
      for (const m of this.mobs.values()) {
        if (Math.abs(m.x - pl.p[0]) > 64 || Math.abs(m.z - pl.p[2]) > 64) continue;
        if (m.def.attitude === "hostile") hostile++; else passive++;
      }
      if (passive < 9 && w.daylight > 0.3 && Math.random() < 0.3) {
        const a = rand(0, Math.PI * 2), d = rand(22, 44);
        const x = Math.floor(pl.p[0] + Math.cos(a) * d), z = Math.floor(pl.p[2] + Math.sin(a) * d);
        const y = w.surface(x, z);
        if ((w.get(x, y - 1, z) === B.GRASS || w.get(x, y - 1, z) === B.SNOW) && w.standable(x, y, z)) {
          const r = Math.random();
          const type = r < 0.08 ? MOB.BOAR : r < 0.25 ? MOB.WOLF : [MOB.PIG, MOB.PIG, MOB.CHICKEN, MOB.CHICKEN, MOB.COW, MOB.SHEEP][Math.floor(Math.random() * 6)];
          const n = type === MOB.BOAR ? 1 : type === MOB.WOLF ? 2 + Math.floor(Math.random() * 2) : 1 + Math.floor(Math.random() * 3);
          for (let i = 0; i < n; i++) {
            const sx = x + Math.floor(rand(-2, 3)), sz = z + Math.floor(rand(-2, 3)), sy = w.surface(sx, sz);
            if (!w.standable(sx, sy, sz)) continue;
            const rr = Math.random();
            const wool = rr < 0.75 ? 0 : rr < 0.85 ? 1 : 2 + Math.floor(Math.random() * 4);
            this.spawnMob(type, sx + 0.5, sy, sz + 0.5, type === MOB.SHEEP ? wool : 0);
          }
        }
      }
      const darkOutside = w.isNight || w.weather === "thunder";
      if (hostile < 7) {
        for (let attempt = 0; attempt < 3; attempt++) {
          const a = rand(0, Math.PI * 2), d = rand(18, 40);
          const x = Math.floor(pl.p[0] + Math.cos(a) * d), z = Math.floor(pl.p[2] + Math.sin(a) * d);
          const top = w.surface(x, z);
          let y;
          if (Math.random() < 0.5) { if (!darkOutside) continue; y = top; }
          else { y = Math.floor(rand(4, Math.min(top - 4, pl.p[1] + 16))); if (y < 4) continue; }
          if (!w.standable(x, y, z)) continue;
          if (y < top - 1 && w.seesSky(x, y + 1, z)) continue;
          if (y >= top - 1 && !darkOutside) continue;
          if (w.torchNear(x, y, z, 8)) continue;
          if (players.some((p) => Math.hypot(p.p[0] - x, p.p[1] - y, p.p[2] - z) < 16)) continue;
          const r = Math.random();
          this.spawnMob(r < 0.45 ? MOB.ZOMBIE : r < 0.72 ? MOB.ARCHER : MOB.BOMBER, x + 0.5, y, z + 0.5);
          break;
        }
      }
    }
  }

  /** 이 플레이어 주변 몹 · 아이템 · 화살 (1초에 10번 보냄 — 관심 영역만) */
  snapshot(p) {
    const m = [], i = [], a = [], g = [];
    for (const e of this.grenades.values()) g.push([e.id, r2(e.x), r2(e.y), r2(e.z)]);
    for (const e of this.mobs.values()) {
      if (Math.abs(e.x - p[0]) > 80 || Math.abs(e.z - p[2]) > 80) continue;
      const flags = (e.hurt > 0 ? 1 : 0) | (e.burn > 0 ? 2 : 0) | (e.act > 0 ? 4 : 0) | (e.angry > 0 || e.target ? 8 : 0);
      const extra = e.type === MOB.BOMBER ? r2(e.fuse / e.def.fuse) : e.extra;
      m.push([e.id, e.type, r2(e.x), r2(e.y), r2(e.z), r2(e.yaw), flags, extra]);
    }
    for (const e of this.items.values()) {
      if (Math.abs(e.x - p[0]) > 64 || Math.abs(e.z - p[2]) > 64) continue;
      i.push([e.id, e.item.id, e.item.n, r2(e.x), r2(e.y), r2(e.z)]);
    }
    for (const e of this.arrows.values()) {
      if (Math.abs(e.x - p[0]) > 64 || Math.abs(e.z - p[2]) > 64) continue;
      a.push([e.id, r2(e.x), r2(e.y), r2(e.z), r2(Math.atan2(e.vx, e.vz)), r2(Math.atan2(e.vy, Math.hypot(e.vx, e.vz)))]);
    }
    return { m, i, a, g };
  }
}

// ── 길찾기 (A*) — 한 칸 올라가기 · 세 칸까지 내려가기 ───────
export function findPath(world, sx, sy, sz, tx, ty, tz, maxNodes = 500) {
  if (Math.abs(sx - tx) + Math.abs(sz - tz) > 48) return null;
  const key = (x, y, z) => `${x},${y},${z}`;
  const h = (x, y, z) => Math.abs(x - tx) + Math.abs(y - ty) * 1.5 + Math.abs(z - tz);
  const open = [[h(sx, sy, sz), 0, sx, sy, sz]];
  const came = new Map([[key(sx, sy, sz), null]]);
  const cost = new Map([[key(sx, sy, sz), 0]]);
  let best = null, bestH = Infinity, n = 0;
  while (open.length && n++ < maxNodes) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
    const [, g, x, y, z] = open.splice(bi, 1)[0];
    const hh = h(x, y, z);
    if (hh < bestH) { bestH = hh; best = [x, y, z]; }
    if (Math.abs(x - tx) <= 1 && Math.abs(z - tz) <= 1 && Math.abs(y - ty) <= 1) { best = [x, y, z]; break; }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      let ny = null;
      if (world.standable(nx, y, nz)) ny = y;
      else if (world.standable(nx, y + 1, nz) && !blocksBody(world.get(x, y + 2, z))) ny = y + 1;
      else {
        for (let d = 1; d <= 3; d++) {
          if (blocksBody(world.get(nx, y - d + 1, nz))) break;
          if (world.standable(nx, y - d, nz)) { ny = y - d; break; }
        }
      }
      if (ny == null) continue;
      const k = key(nx, ny, nz);
      const ng = g + 1 + (ny !== y ? 0.5 : 0);
      if (cost.has(k) && cost.get(k) <= ng) continue;
      cost.set(k, ng);
      came.set(k, [x, y, z]);
      open.push([ng + h(nx, ny, nz), ng, nx, ny, nz]);
    }
  }
  if (!best) return null;
  const path = [];
  let cur = best;
  while (cur && !(cur[0] === sx && cur[1] === sy && cur[2] === sz)) { path.unshift(cur); cur = came.get(key(...cur)); }
  return path;
}

// ── 블록에 부딪히며 움직이기 ───────────────────────────────
function hits(world, x, y, z, w, h) {
  const x0 = Math.floor(x - w), x1 = Math.floor(x + w);
  const y0 = Math.floor(y), y1 = Math.floor(y + h - 0.01);
  const z0 = Math.floor(z - w), z1 = Math.floor(z + w);
  for (let yy = y0; yy <= y1; yy++) for (let zz = z0; zz <= z1; zz++) for (let xx = x0; xx <= x1; xx++) {
    if (blocksBody(world.get(xx, yy, zz))) return true;
  }
  return false;
}

/** e = {x,y,z,vx,vy,vz,ground}. 옆으로 막혔으면 true */
function move(world, e, w, h, dt) {
  const maxStep = Math.max(Math.abs(e.vx), Math.abs(e.vy), Math.abs(e.vz)) * dt;
  const n = Math.max(1, Math.ceil(maxStep / 0.4));
  const sdt = dt / n;
  let blocked = false;
  e.ground = false;
  for (let i = 0; i < n; i++) {
    for (const ax of ["x", "y", "z"]) {
      const v = ax === "x" ? e.vx : ax === "y" ? e.vy : e.vz;
      const step = v * sdt;
      if (!step) continue;
      const nx = e.x + (ax === "x" ? step : 0), ny = e.y + (ax === "y" ? step : 0), nz = e.z + (ax === "z" ? step : 0);
      if (!hits(world, nx, ny, nz, w, h)) { e.x = nx; e.y = ny; e.z = nz; continue; }
      if (ax === "y") {
        const oldY = e.y;
        if (step < 0) { e.ground = true; e.y = Math.floor(e.y + step) + 1; }
        else e.y = Math.floor(e.y + step + h) - h - 0.001;
        if (hits(world, e.x, e.y, e.z, w, h)) e.y = oldY;
        e.vy = 0;
      } else {
        blocked = true;
        if (ax === "x") e.vx = 0; else e.vz = 0;
      }
    }
  }
  return blocked;
}
