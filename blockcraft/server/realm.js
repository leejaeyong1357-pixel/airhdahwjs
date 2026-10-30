// 월드 하나(= 멀티플레이 서버 월드, 또는 한 사람의 싱글플레이 월드)
// 블록 · 몹 · 아이템 · 상자 · 화로 · 시간 · 날씨와 그 안의 플레이어를 맡는다.
import { AIR, B, BLOCKS, isBlockId, needsSupport, isOpaque } from "../shared/blocks.js";
import { ITEMS, blockDrops, blockXp, digSeconds } from "../shared/items.js";
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
  constructor({ key, file, backupDir, title, owner = null, onCommand, onSave }) {
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
    });
    this.boxes = new Containers(this.world, (pl, obj) => pl.send(obj));
    this.tickN = 0;
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
    return { id: pl.id, name: pl.name, color: pl.color, p: pl.p, r: pl.r, held: pl.heldId, f: pl.flags, dead: pl.dead, armor: pl.st.armor.map((a) => a?.id ?? 0) };
  }

  join(pl) {
    this.players.set(pl.id, pl);
    const w = this.world;
    pl.send({
      t: "welcome", id: pl.id, name: pl.name, admin: pl.admin, color: pl.color, realm: this.key, title: this.title,
      seed: w.seed, spawn: w.spawn, edits: w.edits, time: w.time, weather: w.weather, rules: w.rules,
      p: pl.p, r: pl.r, sel: pl.sel, mode: pl.mode,
      inv: pl.st.inv, armor: pl.st.armor,
      players: [...this.players.values()].filter((p) => p !== pl).map((p) => this.publicInfo(p)),
    });
    pl.send(pl.stats());
    this.broadcast({ t: "join", ...this.publicInfo(pl) }, pl);
    if (this.players.size > 1 || !this.owner) this.sys(`${pl.name} 님이 들어왔습니다. (접속 ${this.players.size}명)`);
  }

  leave(pl) {
    this.boxes.close(pl);
    // 열어 둔 조합칸 · 커서는 가방으로
    applyOp(pl.st, { o: "close" }, pl.mode).drops.forEach((it) => this.entities.spawnItem(it, pl.p[0], pl.p[1] + 1, pl.p[2]));
    this.players.delete(pl.id);
    this.broadcast({ t: "leave", id: pl.id });
    if (this.players.size || !this.owner) this.sys(`${pl.name} 님이 나갔습니다. (접속 ${this.players.size}명)`);
    if (!this.players.size) this.emptySince = Date.now();
    this.onSave?.(pl);
  }

  /** 피해 → 죽었으면 처리 */
  damagePlayer(pl, dmg, cause, from = null, kb = 1, by = "") {
    const before = pl.hp;
    const died = pl.damage(dmg, cause, from, kb, by);
    if (pl.hp < before) this.broadcast({ t: "phurt", id: pl.id }, pl); // 다른 사람 화면에서 빨갛게 번쩍
    if (died) this.kill(pl);
  }

  kill(pl) {
    if (pl.dead) return;
    pl.dead = true;
    pl.hp = 0;
    this.boxes.close(pl);
    const st = pl.st;
    if (!this.world.rules.keepInventory) {
      const all = [...st.inv, ...st.armor, st.cursor, ...st.grid].filter(Boolean);
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
    this.broadcast({ t: "prespawn", id: pl.id, p: pl.p }, pl);
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
        const charge = Math.min(1, (now - (pl.lastAttack ?? 0)) / 600); // 연타하면 약해진다
        pl.lastAttack = now;
        const dmg = (held?.damage ?? 1) * (0.2 + charge * 0.8);
        let hit = false;
        if (Number.isInteger(m.mob)) hit = this.entities.attack(m.mob, pl, dmg);
        else if (Number.isInteger(m.pid)) {
          const o = this.players.get(m.pid);
          if (o && !o.dead && o !== pl && this.world.rules.pvp && pl.mode === "survival" &&
              Math.hypot(o.p[0] - pl.p[0], o.p[1] - pl.p[1], o.p[2] - pl.p[2]) < 5) {
            this.damagePlayer(o, dmg, "player", pl.p, 1, pl.name);
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
      case "eatstart": pl.eatAt = Date.now(); return;
      case "eat": {
        const held = pl.held;
        if (!held || !ITEMS[held.id]?.food || pl.dead) return;
        if (pl.food >= 20 && held.id !== 260) return pl.sync();
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

/** 블록 칸 (x,y,z) 와 몸(가운데 px,pz, 발 py, 반폭 w, 키 h)이 겹치나 */
function overlap(x, y, z, px, py, pz, w, h) {
  return x + 1 > px - w && x < px + w && y + 1 > py && y < py + h && z + 1 > pz - w && z < pz + w;
}
