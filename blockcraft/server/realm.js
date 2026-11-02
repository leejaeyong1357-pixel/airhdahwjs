// 월드 하나(= 멀티플레이 서버 월드, 또는 한 사람의 싱글플레이 월드)
// 블록 · 몹 · 아이템 · 상자 · 화로 · 시간 · 날씨와 그 안의 플레이어를 맡는다.
import { AIR, B, BLOCKS, isBlockId, needsSupport, isOpaque } from "../shared/blocks.js";
import { ITEMS, KIT, KIT_COUNT, blockDrops, blockXp, digSeconds } from "../shared/items.js";
import { applyOp, digest, wear, useOne } from "../shared/invops.js";
import { addItem, roomFor } from "../shared/inventory.js";
import { HEIGHT } from "../shared/worldgen.js";
import { World } from "./world.js";
import { Entities } from "./entities.js";
import { Containers } from "./containers.js";

const r2 = (v) => Math.round(v * 100) / 100;
const num = (v) => Number.isFinite(v);
const vec3 = (v) => Array.isArray(v) && v.length === 3 && v.every(num);

export class Realm {
  /** key: "main" 또는 "solo:<아이디>", onCommand(pl, line) */
  constructor({ key, file, backupDir, title, owner = null, onCommand, onSave, onNick }) {
    this.onNick = onNick;
    this.key = key;
    this.title = title;
    this.owner = owner;
    this.onCommand = onCommand;
    this.onSave = onSave;
    this.world = new World(file, backupDir);
    this.players = new Map();
    this.entities = new Entities(this.world, {
      players: () => [...this.players.values()],
      damagePlayer: (pl, dmg, cause, from, kb, by) => this.damagePlayer(pl, dmg, cause, from, kb, by),
      broadcast: (obj) => this.broadcast(obj),
      blocksChanged: (list) => this.broadcast({ t: "sets", s: list }),
      removeContainer: (k) => this.boxes.remove(k),
      grenadeBoom: (g) => this.grenadeBoom(g),
    });
    this.boxes = new Containers(this.world, (pl, obj) => pl.send(obj));
    this.tickN = 0;
    this.scores = new Map(); // 아이디 → { name, k, d, a } (서버가 켜져 있는 동안)
    this.emptySince = Date.now();
    this.world.save(true);
  }

  broadcast(obj, except) {
    const text = JSON.stringify(obj);
    for (const pl of this.players.values()) if (pl !== except) pl.conn.sendRaw(text);
  }
  sys(msg, to) {
    if (to) return to.send({ t: "chat", name: "", msg });
    this.broadcast({ t: "chat", name: "", msg });
  }

  publicInfo(pl) {
    return { id: pl.id, name: pl.name, color: pl.color, look: pl.look, p: pl.p, r: pl.r, held: pl.heldId, f: pl.flags, dead: pl.dead, armor: pl.st.armor.map((a) => a?.id ?? 0) };
  }

  join(pl) {
    this.players.set(pl.id, pl);
    const w = this.world;
    pl.send({
      t: "welcome", id: pl.id, name: pl.name, admin: pl.admin, color: pl.color, look: pl.look, realm: this.key, title: this.title,
      seed: w.seed, spawn: w.spawn, edits: w.edits, time: w.time, weather: w.weather, rules: w.rules,
      p: pl.p, r: pl.r, sel: pl.sel, mode: pl.mode,
      inv: pl.st.inv, armor: pl.st.armor,
      players: [...this.players.values()].filter((p) => p !== pl).map((p) => this.publicInfo(p)),
    });
    pl.send(pl.stats());
    this.giveKit(pl);
    this.broadcast({ t: "join", ...this.publicInfo(pl) }, pl);
    this.pushScores();
    if (this.players.size > 1 || !this.owner) this.sys(`${pl.name} 님이 들어왔습니다. (접속 ${this.players.size}명)`);
  }

  leave(pl) {
    this.boxes.close(pl);
    // 열어 둔 조합칸 · 커서는 가방으로
    applyOp(pl.st, { o: "close" }, pl.mode).drops.forEach((it) => this.entities.spawnItem(it, pl.p[0], pl.p[1] + 1, pl.p[2]));
    this.players.delete(pl.id);
    this.broadcast({ t: "leave", id: pl.id });
    this.pushScores();
    if (this.players.size || !this.owner) this.sys(`${pl.name} 님이 나갔습니다. (접속 ${this.players.size}명)`);
    if (!this.players.size) this.emptySince = Date.now();
    this.onSave?.(pl);
  }

  /** 피해 → 죽었으면 처리 */
  damagePlayer(pl, dmg, cause, from = null, kb = 1, by = "", attacker = null) {
    const before = pl.hp;
    if (attacker && attacker !== pl) { pl.damagers ??= new Map(); pl.damagers.set(attacker.key, Date.now()); pl.lastAttacker = attacker; pl.lastAttackAt = Date.now(); }
    const died = pl.damage(dmg, cause, from, kb, by);
    if (pl.hp < before) {
      this.broadcast({ t: "phurt", id: pl.id }, pl); // 다른 사람 화면에서 빨갛게 번쩍
      // 피 — 세게 맞을수록 많이, 헤드샷은 머리에서 크게
      if (!["starve", "drown"].includes(cause)) {
        const head = cause === "headshot";
        this.broadcast({ t: "blood", p: [pl.p[0], pl.p[1] + (head ? 1.6 : 1.1), pl.p[2]], n: head ? 60 : Math.min(40, 8 + (before - pl.hp) * 6), from });
      }
    }
    if (died) {
      this.kill(pl, cause);
      this.broadcast({ t: "blood", p: [pl.p[0], pl.p[1] + 0.9, pl.p[2]], n: 70, gore: true });
    }
  }

  /** 점수판 (킬 · 데스 · 어시스트) */
  score(pl) {
    let sc = this.scores.get(pl.key);
    if (!sc) this.scores.set(pl.key, (sc = { name: pl.name, k: 0, d: 0, a: 0 }));
    sc.name = pl.name;
    return sc;
  }
  scoreboard() {
    return [...this.players.values()].map((p) => ({ id: p.id, ...this.score(p) })).sort((a, b) => b.k - a.k || a.d - b.d);
  }
  pushScores() { this.broadcast({ t: "scores", list: this.scoreboard() }); }

  kill(pl, cause = "") {
    if (pl.dead) return;
    // 마지막으로 때린 사람이 킬, 10초 안에 때린 다른 사람들은 어시스트
    const now = Date.now();
    const killer = pl.lastAttacker && now - pl.lastAttackAt < 10_000 && this.players.has(pl.lastAttacker.id) ? pl.lastAttacker : null;
    this.score(pl).d++;
    if (killer) {
      this.score(killer).k++;
      for (const [key, t] of pl.damagers ?? []) {
        if (key === killer.key || now - t > 10_000) continue;
        const helper = [...this.players.values()].find((p) => p.key === key);
        if (helper) this.score(helper).a++;
      }
      this.broadcast({ t: "feed", killer: killer.name, victim: pl.name, head: cause === "headshot", weapon: cause });
    }
    pl.damagers = new Map();
    pl.lastAttacker = null;
    pl.dead = true;
    pl.hp = 0;
    this.boxes.close(pl);
    const st = pl.st;
    if (!this.world.rules.keepInventory) {
      const all = [...st.inv, ...st.armor, st.cursor, ...st.grid].filter((it) => it && !ITEMS[it.id]?.kit); // 칼 · 총은 부활하면 다시 받음
      for (const it of all) this.entities.spawnItem(it, pl.p[0], pl.p[1] + 1, pl.p[2], null, 1);
      st.inv.fill(null); st.armor.fill(null);
      pl.xp = Math.floor(pl.xp * 0.3);
    } else applyOp(st, { o: "close" }, pl.mode);
    st.cursor = null; st.grid = []; st.screen = null;
    pl.statsDirty = true;
    pl.send({ t: "dead", why: pl.deathCause ?? "죽었습니다" });
    pl.sync();
    this.broadcast({ t: "pdead", id: pl.id }, pl);
    this.sys(`${pl.name} 님이 ${pl.deathCause ?? "죽었습니다"}.`);
    this.pushScores();
    this.onSave?.(pl);
  }

  respawn(pl) {
    if (!pl.dead) return;
    pl.dead = false;
    pl.hp = 20; pl.food = 20; pl.sat = 5; pl.ex = 0;
    pl.p = [...this.world.spawn];
    pl.statsDirty = true;
    pl.send({ t: "respawn", p: pl.p });
    pl.send(pl.stats());
    this.giveKit(pl);
    this.broadcast({ t: "prespawn", id: pl.id, p: pl.p }, pl);
  }

  /** 칼 · M16 · 저격총 — 없으면 단축칸에 넣어 주고 탄창을 채운다 */
  giveKit(pl) {
    const st = pl.st;
    // 죽어서 남아 있던 칼 · 총은 없애고 다시 준다 (여러 개 생기지 않게)
    for (const id of KIT) {
      const want = KIT_COUNT[id] ?? 1;
      const at = st.inv.findIndex((it) => it?.id === id);
      if (at >= 0) { st.inv[at] = { id, n: Math.max(st.inv[at].n, want) }; continue; } // 수류탄은 3개로 채움
      if ([st.cursor, ...st.grid].some((it) => it?.id === id)) continue;
      const free = st.inv.findIndex((it, i) => i < 9 && !it);
      if (free >= 0) st.inv[free] = { id, n: want };
      else addItem(st.inv, { id, n: want });
    }
    pl.ammo = {};
    pl.reserve = {};
    pl.reload = null;
    pl.pinAt = null;
    for (const id of KIT) if (ITEMS[id].gun) { pl.ammo[id] = ITEMS[id].gun.mag; pl.reserve[id] = ITEMS[id].gun.total - ITEMS[id].gun.mag; }
    pl.send({ t: "ammo", ammo: pl.ammo, reserve: pl.reserve });
    pl.sync();
  }

  /** 수류탄 폭발 — 반경 안 사람 · 몹 피해 (벽 뒤는 덜 아픔), 던진 사람에게 킬 */
  grenadeBoom(g) {
    const gd = ITEMS[305].grenade;
    const c = [g.x, g.y + 0.2, g.z];
    this.broadcast({ t: "boom", p: c.map(r2), power: 2.5, grenade: true });
    const owner = this.players.get(g.owner.id) ?? null;
    for (const p2 of [...this.players.values()]) {
      if (p2.dead) continue;
      const d = Math.hypot(p2.p[0] - c[0], p2.p[1] + 0.9 - c[1], p2.p[2] - c[2]);
      if (d >= gd.radius) continue;
      const cover = this.world.sees(c, [p2.p[0], p2.p[1] + 1.2, p2.p[2]]) ? 1 : 0.35;
      const dmg = Math.round((1 - d / gd.radius) * gd.damage * cover);
      if (dmg <= 0) continue;
      if (p2 !== g.owner && !this.world.rules.pvp) continue;
      this.damagePlayer(p2, dmg, "grenade", c, 2, g.owner.name, p2 === g.owner ? null : owner);
    }
    for (const e of [...this.entities.mobs.values()]) {
      const d = Math.hypot(e.x - c[0], e.y + e.def.h / 2 - c[1], e.z - c[2]);
      if (d < gd.radius) { e.inv = 0; this.entities.damageMob(e, (1 - d / gd.radius) * gd.damage, c, owner); }
    }
  }

  /** 총 쏘기 — 서버가 탄 · 연사 속도 · 벽을 확인하고 맞은 곳(머리 · 몸)을 정한다 */
  shoot(pl, m) {
    const g = ITEMS[pl.heldId]?.gun;
    if (!g || pl.dead || pl.reload) return;
    const now = Date.now();
    if (now - (pl.lastShot ?? 0) < g.rate * 1000 * 0.8) return;
    if (!(pl.ammo?.[pl.heldId] > 0)) { pl.send({ t: "ammo", ammo: pl.ammo, reserve: pl.reserve, empty: true }); return; }
    if (!vec3(m.o) || !vec3(m.d)) return;
    const eye = [pl.p[0], pl.p[1] + 1.5, pl.p[2]];
    if (Math.hypot(m.o[0] - eye[0], m.o[1] - eye[1], m.o[2] - eye[2]) > 2) return;
    const dl = Math.hypot(...m.d);
    if (!(dl > 0.5)) return;
    const d = m.d.map((v) => v / dl);
    pl.lastShot = now;
    pl.ammo[pl.heldId] -= 1;
    const o = m.o;
    // 벽(불투명 블록)까지 거리
    let wall = g.range;
    for (let t = 0; t < g.range; t += 0.1) {
      const b = this.world.get(Math.floor(o[0] + d[0] * t), Math.floor(o[1] + d[1] * t), Math.floor(o[2] + d[2] * t));
      if (b !== AIR && BLOCKS[b] && (BLOCKS[b].kind === "solid" || BLOCKS[b].kind === "cutout")) { wall = t; break; }
    }
    // 가장 가까운 사람 · 몹
    let best = null;
    const test = (kind, target, x, y, z, w, h) => {
      const t = rayBox(o, d, [x - w, y, z - w], [x + w, y + h, z + w]);
      if (t != null && t < wall && (!best || t < best.t)) best = { kind, target, t, y, h };
    };
    for (const p2 of this.players.values()) if (p2 !== pl && !p2.dead) test("player", p2, p2.p[0], p2.p[1], p2.p[2], 0.3, p2.flags & 1 ? 1.5 : 1.8);
    for (const e of this.entities.mobs.values()) test("mob", e, e.x, e.y, e.z, e.def.w, e.def.h);
    const end = best ? best.t : wall;
    const hitP = [o[0] + d[0] * end, o[1] + d[1] * end, o[2] + d[2] * end].map(r2);
    this.broadcast({ t: "shot", id: pl.id, gun: pl.heldId, o: o.map(r2), e: hitP, wall: !best && wall < g.range }, pl);
    let head = false, kill = false;
    if (best) {
      head = hitP[1] > best.y + best.h * 0.78; // 몸 위쪽 22% = 머리
      if (best.kind === "player") {
        const t2 = best.target;
        if (this.world.rules.pvp && t2.mode === "survival") {
          this.damagePlayer(t2, head ? 1000 : g.body, head ? "headshot" : "gun", pl.p, head ? 1.2 : 0.35, pl.name, pl);
          kill = t2.dead;
        }
      } else {
        const e = best.target;
        e.inv = 0;
        this.entities.damageMob(e, head ? 1000 : g.body * 2, pl.p, pl);
        kill = !this.entities.mobs.has(e.id);
      }
      this.broadcast({ t: "blood", p: hitP, n: head ? 45 : 14, dir: d.map(r2), head });
    }
    pl.send({ t: "hit", hit: !!best, head, kill, e: hitP, ammo: pl.ammo, reserve: pl.reserve });
  }

  // ── 블록 ─────────────────────────────────────────────────
  breakBlock(x, y, z, pl) {
    const w = this.world;
    const b = w.get(x, y, z);
    if (b === AIR || b === B.WATER || b === B.LAVA || BLOCKS[b]?.unbreakable) return false;
    const survival = pl.mode === "survival";
    const tool = pl.heldId;
    const changes = [[x, y, z, AIR]];
    w.set(x, y, z, AIR);
    if (survival) {
      const drops = blockDrops(b, tool);
      for (const [id, n] of drops) this.entities.spawnItem({ id, n }, x + 0.5, y + 0.3, z + 0.5);
      if (drops.length) pl.addXp(blockXp(b));
      if (ITEMS[tool]?.uses && BLOCKS[b].hard > 0) { if (wear(pl.st.inv, pl.sel, ITEMS[tool].tool === "sword" ? 2 : 1)) pl.send({ t: "toolbreak" }); }
      pl.addEx(0.005);
    }
    for (const it of this.boxes.remove(`${x},${y},${z}`)) this.entities.spawnItem(it, x + 0.5, y + 0.5, z + 0.5);
    const up = w.get(x, y + 1, z);
    if (needsSupport(up) && y + 1 < HEIGHT) {
      w.set(x, y + 1, z, AIR);
      changes.push([x, y + 1, z, AIR]);
      if (survival) for (const [id, n] of blockDrops(up, 0)) this.entities.spawnItem({ id, n }, x + 0.5, y + 1.3, z + 0.5);
    }
    this.broadcast({ t: "sets", s: changes, by: pl.id, brk: b });
    return true;
  }

  // ── 메시지 ───────────────────────────────────────────────
  handle(pl, m) {
    const w = this.world;
    const near = (x, y, z, r) => Math.hypot(x + 0.5 - pl.p[0], y + 0.5 - pl.p[1] - 1.6, z + 0.5 - pl.p[2]) <= r;
    const check = (d) => { if (typeof d === "string" && d !== digest(pl.st)) pl.sync(); };
    switch (m.t) {
      case "move": {
        if (!vec3(m.p) || pl.dead) return;
        const d = Math.hypot(m.p[0] - pl.p[0], m.p[2] - pl.p[2]);
        if (d > 15 && pl.mode === "survival" && !pl.tpGrace) { pl.send({ t: "tp", p: pl.p }); return; } // 순간이동 막기
        pl.tpGrace = false;
        pl.p = m.p.map(r2);
        if (Array.isArray(m.r) && m.r.length === 2 && m.r.every(num)) pl.r = m.r.map(r2);
        pl.flags = Number(m.f) & 3;
        if (pl.p[1] < -40) this.damagePlayer(pl, 100, "void");
        this.broadcast({ t: "move", id: pl.id, p: pl.p, r: pl.r, f: pl.flags }, pl);
        return;
      }
      case "sel": {
        if (!Number.isInteger(m.i) || m.i < 0 || m.i > 8) return;
        pl.sel = m.i;
        this.broadcast({ t: "held", id: pl.id, held: pl.heldId }, pl);
        return;
      }
      case "ex": if (num(m.v)) pl.addEx(Math.max(0, Math.min(3, m.v))); return;
      case "env": {
        const causes = ["fall", "drown", "lava", "cactus"];
        if (!causes.includes(m.why) || !num(m.dmg)) return;
        this.damagePlayer(pl, Math.max(0, Math.min(40, m.dmg)), m.why);
        return;
      }
      case "swing": this.broadcast({ t: "swing", id: pl.id }, pl); return;
      case "digstart": if ([m.x, m.y, m.z].every(Number.isInteger)) pl.dig = { x: m.x, y: m.y, z: m.z, t: Date.now() }; return;
      case "dig": {
        const { x, y, z } = m;
        if (![x, y, z].every(Number.isInteger) || y < 0 || y >= HEIGHT || pl.dead || !near(x, y, z, 7)) return this.fix(pl, x, y, z);
        const b = w.get(x, y, z);
        if (pl.mode === "survival") {
          // 캐는 시간 확인 (네트워크 지연을 감안해 조금 여유)
          const need = digSeconds(b, pl.heldId) * 1000;
          const started = pl.dig && pl.dig.x === x && pl.dig.y === y && pl.dig.z === z ? pl.dig.t : Date.now();
          if (!Number.isFinite(need) || Date.now() - started < need * 0.75 - 250) return this.fix(pl, x, y, z);
        }
        pl.dig = null;
        if (!this.breakBlock(x, y, z, pl)) return this.fix(pl, x, y, z);
        check(m.d);
        return;
      }
      case "place": {
        const { x, y, z } = m;
        if (![x, y, z].every(Number.isInteger) || y < 1 || y >= HEIGHT || pl.dead || !near(x, y, z, 7)) return this.fix(pl, x, y, z);
        const held = pl.held;
        const b = held && ITEMS[held.id]?.block;
        if (!b || !isBlockId(b)) return this.fix(pl, x, y, z);
        const cur = w.get(x, y, z);
        if (cur !== AIR && cur !== B.WATER && BLOCKS[cur].kind !== "plant") return this.fix(pl, x, y, z);
        if (needsSupport(b) && !isOpaque(w.get(x, y - 1, z))) return this.fix(pl, x, y, z);
        // 사람 · 몹 몸과 겹치면 안 됨
        const solid = BLOCKS[b].kind === "solid" || BLOCKS[b].kind === "cutout";
        if (solid) {
          for (const o of this.players.values()) if (!o.dead && overlap(x, y, z, o.p[0], o.p[1], o.p[2], 0.3, 1.8)) return this.fix(pl, x, y, z);
          for (const e of this.entities.mobs.values()) if (overlap(x, y, z, e.x, e.y, e.z, e.def.w, e.def.h)) return this.fix(pl, x, y, z);
        }
        w.set(x, y, z, b);
        if (pl.mode === "survival") useOne(pl.st.inv, pl.sel);
        this.broadcast({ t: "sets", s: [[x, y, z, b]], by: pl.id, put: b }, pl);
        check(m.d);
        return;
      }
      case "use": {
        const { x, y, z } = m;
        if (![x, y, z].every(Number.isInteger) || pl.dead || !near(x, y, z, 7)) return;
        const b = w.get(x, y, z);
        if (b === B.CRAFTING_TABLE) { applyOp(pl.st, { o: "open", screen: "table" }, pl.mode); check(m.d); }
        else if (b === B.CHEST || b === B.FURNACE) { applyOp(pl.st, { o: "close" }, pl.mode); this.boxes.open(pl, `${x},${y},${z}`); pl.sync(); }
        return;
      }
      case "op": {
        if (pl.dead || typeof m.op !== "object") return;
        const { drops } = applyOp(pl.st, m.op, pl.mode);
        for (const it of drops) this.throwItem(pl, it);
        check(m.d);
        return;
      }
      case "cop": if (pl.box && !pl.dead && typeof m.op === "object") { this.boxes.click(pl, m.op); pl.sync(); } return;
      case "cclose": {
        this.boxes.close(pl);
        const { drops } = applyOp(pl.st, { o: "close" }, pl.mode);
        for (const it of drops) this.throwItem(pl, it);
        pl.sync();
        return;
      }
      case "q": {
        if (pl.dead) return;
        const { drops } = applyOp(pl.st, { o: "drop", a: "inv", i: pl.sel, all: !!m.all }, pl.mode);
        for (const it of drops) this.throwItem(pl, it);
        if (drops.length) this.broadcast({ t: "held", id: pl.id, held: pl.heldId }, pl);
        check(m.d);
        return;
      }
      case "pickup": {
        if (pl.dead) return;
        const it = this.entities.items.get(m.id);
        if (!it || roomFor(pl.st.inv, it.item) <= 0) return;
        const got = this.entities.takeItem(m.id, pl);
        if (!got) return;
        const left = addItem(pl.st.inv, got);
        pl.send({ t: "give", item: got });
        if (left) this.entities.spawnItem({ ...got, n: left }, pl.p[0], pl.p[1] + 0.5, pl.p[2], [0, 2, 0], 1);
        return;
      }
      case "attack": {
        if (pl.dead) return;
        const now = Date.now();
        const held = ITEMS[pl.heldId];
        const knife = held?.weapon === "knife";
        if (knife && now - (pl.lastAttack ?? 0) < 220) return;           // 칼: 1초에 4번까지, 한 번에 반 칸 (20번 맞으면 죽음)
        const charge = Math.min(1, (now - (pl.lastAttack ?? 0)) / 600); // 맨손 · 검은 연타하면 약해진다
        pl.lastAttack = now;
        const dmg = knife ? 1 : (held?.damage ?? 1) * (0.2 + charge * 0.8);
        let hit = false;
        if (Number.isInteger(m.mob)) hit = this.entities.attack(m.mob, pl, dmg);
        else if (Number.isInteger(m.pid)) {
          const o = this.players.get(m.pid);
          if (o && !o.dead && o !== pl && this.world.rules.pvp &&
              Math.hypot(o.p[0] - pl.p[0], o.p[1] - pl.p[1], o.p[2] - pl.p[2]) < 5) {
            this.damagePlayer(o, dmg, knife ? "knife" : "player", pl.p, knife ? 0.5 : 1, pl.name, pl);
            hit = true;
          }
        }
        if (hit) {
          pl.addEx(0.1);
          if (held?.tool && pl.mode === "survival") { if (wear(pl.st.inv, pl.sel, held.tool === "sword" ? 1 : 2)) pl.send({ t: "toolbreak" }); }
          check(m.d);
        }
        return;
      }
      case "shoot": this.shoot(pl, m); return;
      case "pin": {
        if (!ITEMS[pl.heldId]?.grenade || pl.dead) return;
        pl.pinAt = Date.now();
        this.broadcast({ t: "pin", id: pl.id }, pl);
        return;
      }
      case "throw": {
        const gd = ITEMS[pl.heldId]?.grenade;
        if (!gd || !pl.pinAt || pl.dead || !vec3(m.o) || !vec3(m.v)) return;
        const eye = [pl.p[0], pl.p[1] + 1.5, pl.p[2]];
        if (Math.hypot(m.o[0] - eye[0], m.o[1] - eye[1], m.o[2] - eye[2]) > 2) return;
        const sp = Math.hypot(...m.v);
        const v = sp > gd.speed * 1.15 ? m.v.map((c) => (c / sp) * gd.speed) : m.v;
        const fuse = Math.max(0.05, gd.fuse - (Date.now() - pl.pinAt) / 1000); // 오래 쥐고 있으면 빨리 터진다
        pl.pinAt = null;
        useOne(pl.st.inv, pl.sel);
        this.entities.throwGrenade(pl, m.o, v, fuse);
        this.broadcast({ t: "throw", id: pl.id }, pl);
        check(m.d);
        return;
      }
      case "nick": {
        const r = this.onNick?.(pl, m.nick);
        if (r) pl.send({ t: "chat", name: "", msg: r });
        return;
      }
      case "dance": {
        pl.dancing = !!m.on && !pl.dead;
        this.broadcast({ t: "dance", id: pl.id, on: pl.dancing }, pl);
        return;
      }
      case "reload": {
        const g = ITEMS[pl.heldId]?.gun;
        if (!g || pl.reload || pl.dead || (pl.ammo?.[pl.heldId] ?? 0) >= g.mag || !(pl.reserve?.[pl.heldId] > 0)) return;
        pl.reload = { gun: pl.heldId, at: Date.now() + g.reload * 1000 };
        pl.send({ t: "ammo", ammo: pl.ammo, reserve: pl.reserve, reloading: g.reload });
        this.broadcast({ t: "reload", id: pl.id }, pl);
        return;
      }
      case "eatstart": pl.eatAt = Date.now(); return;
      case "eat": {
        const held = pl.held;
        if (!held || !ITEMS[held.id]?.food || pl.dead) return;
        if (pl.food >= 20 && pl.hp >= 20 && held.id !== 260) return pl.sync(); // 배부르고 체력도 가득이면 못 먹음
        if (Date.now() - pl.eatAt < 1300) return pl.sync();
        pl.eat(held.id);
        if (pl.mode === "survival") useOne(pl.st.inv, pl.sel);
        pl.eatAt = Date.now();
        check(m.d);
        return;
      }
      case "respawn": this.respawn(pl); return;
      case "chat": {
        if (typeof m.msg !== "string") return;
        const msg = m.msg.trim().slice(0, 200);
        if (!msg) return;
        if (msg.startsWith("/")) return this.onCommand(pl, msg);
        console.log(`[채팅 ${this.title}] ${pl.name}: ${msg}`);
        this.broadcast({ t: "chat", name: pl.name, msg });
        return;
      }
    }
  }

  /** 잘못된 블록 변경 요청 — 그 자리의 실제 블록과 인벤토리를 돌려보낸다 */
  fix(pl, x, y, z) {
    if ([x, y, z].every(Number.isInteger)) pl.send({ t: "sets", s: [[x, y, z, this.world.get(x, y, z)]] });
    pl.sync();
  }

  /** Q · 창 바깥 클릭으로 버린 아이템 — 바라보는 쪽으로 던진다 */
  throwItem(pl, it) {
    const [yaw, pitch] = pl.r;
    const dir = [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
    this.entities.spawnItem(it, pl.p[0] + dir[0] * 0.3, pl.p[1] + 1.3, pl.p[2] + dir[2] * 0.3, [dir[0] * 5, dir[1] * 5 + 2, dir[2] * 5], 1.5);
  }

  // ── 시간 ─────────────────────────────────────────────────
  tick(dt) {
    this.tickN++;
    const w = this.world;
    w.time = w.time + 20 * dt;
    // 날씨 — 맑음 10~25분, 비 3~8분 (가끔 천둥)
    const wt = w.w.weather;
    wt.left -= dt;
    if (wt.left <= 0) this.setWeather(wt.kind === "clear" ? (Math.random() < 0.25 ? "thunder" : "rain") : "clear");
    for (const pl of this.players.values()) if (pl.tick(dt)) this.kill(pl);
    this.entities.tick(dt);
    this.boxes.tick(dt);
    for (const pl of this.players.values()) {
      if (pl.reload && Date.now() >= pl.reload.at) {
        const id = pl.reload.gun;
        const take = Math.min(ITEMS[id].gun.mag - pl.ammo[id], pl.reserve[id] ?? 0); // 예비 탄에서 채운다
        pl.ammo[id] += take; pl.reserve[id] -= take;
        pl.reload = null;
        pl.send({ t: "ammo", ammo: pl.ammo, reserve: pl.reserve });
      }
      if (pl.statsDirty) { pl.statsDirty = false; pl.send(pl.stats()); }
      if (pl.needSync) { pl.needSync = false; pl.sync(); }
    }
    if (this.tickN % 2 === 0) for (const pl of this.players.values()) pl.send({ t: "ents", ...this.entities.snapshot(pl.p) });
    if (this.tickN % 100 === 0) this.broadcast({ t: "time", time: Math.round(w.time) });
    if (this.tickN % 600 === 0) {
      w.dirty = true;
      this.save();
      w.prune([...this.players.values()].map((p) => p.p));
    }
  }

  setWeather(kind, seconds) {
    const wt = this.world.w.weather;
    wt.kind = kind;
    wt.left = seconds ?? (kind === "clear" ? 600 + Math.random() * 900 : 180 + Math.random() * 300);
    this.world.dirty = true;
    this.broadcast({ t: "weather", weather: kind });
  }

  save() {
    this.world.save();
    for (const pl of this.players.values()) this.onSave?.(pl);
  }
}

/** 광선이 상자에 처음 닿는 거리 (안 닿으면 null) */
function rayBox(o, d, min, max) {
  let t0 = 0, t1 = Infinity;
  for (let i = 0; i < 3; i++) {
    const inv = 1 / d[i];
    let a = (min[i] - o[i]) * inv, b = (max[i] - o[i]) * inv;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    if (t1 < t0) return null;
  }
  return t0;
}

/** 블록 칸 (x,y,z) 와 몸(가운데 px,pz, 발 py, 반폭 w, 키 h)이 겹치나 */
function overlap(x, y, z, px, py, pz, w, h) {
  return x + 1 > px - w && x < px + w && y + 1 > py && y < py + h && z + 1 > pz - w && z < pz + w;
}
