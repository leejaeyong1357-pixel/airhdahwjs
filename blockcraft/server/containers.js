// 상자 · 화로 — 내용은 서버에 저장되어 모두가 같은 것을 본다. 화로는 창을 닫아도 서버에서 계속 굽는다.
import { B } from "../shared/blocks.js";
import { maxStack } from "../shared/items.js";
import { SMELT, SMELT_XP, FUEL, SMELT_SECONDS } from "../shared/recipes.js";
import { clickSlot, addItem, canMerge } from "../shared/inventory.js";

export const CHEST_SIZE = 27;
const F_SLOTS = ["in", "fuel", "out"];

export class Containers {
  /** send(player, obj) */
  constructor(world, send) {
    this.world = world;
    this.send = send;
    this.viewers = new Map(); // key → Set(player)
    this.pushTimer = 0;
  }

  kindAt(k) {
    const [x, y, z] = k.split(",").map(Number);
    const b = this.world.get(x, y, z);
    return b === B.CHEST ? "chest" : b === B.FURNACE ? "furnace" : null;
  }

  data(k) {
    const kind = this.kindAt(k);
    if (kind === "chest") return (this.world.chests[k] ??= new Array(CHEST_SIZE).fill(null));
    if (kind === "furnace") return (this.world.furnaces[k] ??= { in: null, fuel: null, out: null, burn: 0, burnMax: 0, cook: 0, xp: 0 });
    return null;
  }

  view(k) {
    const kind = this.kindAt(k);
    if (kind === "chest") return { t: "box", kind, k, slots: this.data(k) };
    const f = this.data(k);
    if (!f) return { t: "box", kind: null, k };
    return { t: "box", kind, k, in: f.in, fuel: f.fuel, out: f.out, burn: Math.max(0, f.burn), burnMax: f.burnMax, cook: f.cook, total: SMELT_SECONDS };
  }

  push(k) {
    const v = this.viewers.get(k);
    if (!v?.size) return;
    const msg = this.view(k);
    for (const pl of v) this.send(pl, msg);
  }

  open(pl, k) {
    if (!this.data(k)) return false;
    this.close(pl);
    if (!this.viewers.has(k)) this.viewers.set(k, new Set());
    this.viewers.get(k).add(pl);
    pl.box = k;
    this.send(pl, this.view(k));
    return true;
  }

  close(pl) {
    for (const v of this.viewers.values()) v.delete(pl);
    pl.box = null;
  }

  /** 창 안에서 클릭 — a: "c"(상자 · 화로 칸) 또는 "inv"(Shift 로 넣기) */
  click(pl, op) {
    const k = pl.box;
    const d = k && this.data(k);
    if (!d) return;
    const st = pl.st;
    const kind = this.kindAt(k);
    const b = op.b === 2 ? 2 : 0;
    if (op.a === "inv") {
      // 가방 → 상자 · 화로 (Shift+클릭)
      const i = op.i;
      if (!Number.isInteger(i) || i < 0 || i >= st.inv.length || !st.inv[i]) return;
      st.inv[i] = this.insert(k, kind, d, st.inv[i]);
    } else if (kind === "chest") {
      const i = op.i;
      if (!Number.isInteger(i) || i < 0 || i >= CHEST_SIZE) return;
      if (op.s) {
        if (!d[i]) return;
        const left = addItem(st.inv, d[i]);
        d[i] = left ? { ...d[i], n: left } : null;
      } else {
        const r = clickSlot(d[i], st.cursor, b);
        d[i] = r.slot; st.cursor = r.cursor;
      }
    } else if (kind === "furnace") {
      const slot = op.i;
      if (!F_SLOTS.includes(slot)) return;
      if (op.s) {
        if (!d[slot]) return;
        const before = d[slot].n;
        const left = addItem(st.inv, d[slot]);
        if (slot === "out") this.giveXp(pl, d, before - left);
        d[slot] = left ? { ...d[slot], n: left } : null;
      } else {
        if (slot === "fuel" && st.cursor && !FUEL[st.cursor.id]) return; // 연료만
        const before = d[slot]?.n ?? 0;
        const r = clickSlot(d[slot], st.cursor, b, slot === "out");
        if (slot === "out") this.giveXp(pl, d, before - (r.slot?.n ?? 0));
        d[slot] = r.slot; st.cursor = r.cursor;
      }
    }
    this.world.dirty = true;
    this.push(k);
  }

  giveXp(pl, f, taken) {
    if (taken <= 0 || !f.xp) return;
    const per = f.xp / Math.max(1, f.out ? f.out.n : taken);
    const gain = per * taken;
    f.xp = Math.max(0, f.xp - gain);
    pl.addXp(gain);
  }

  /** 넣을 수 있는 만큼 넣고 나머지를 돌려준다 */
  insert(k, kind, d, item) {
    item = { ...item };
    if (kind === "chest") {
      const left = addItem(d, item);
      return left ? { ...item, n: left } : null;
    }
    const slot = SMELT[item.id] ? "in" : FUEL[item.id] ? "fuel" : null;
    if (!slot) return item;
    const cur = d[slot];
    if (!cur) return (d[slot] = item, null);
    if (!canMerge(cur, item)) return item;
    const m = Math.min(maxStack(cur.id) - cur.n, item.n);
    cur.n += m; item.n -= m;
    return item.n > 0 ? item : null;
  }

  /** 블록이 부서지면 내용물을 돌려준다 */
  remove(k) {
    const out = [];
    const c = this.world.chests[k];
    if (c) { out.push(...c.filter(Boolean)); delete this.world.chests[k]; }
    const f = this.world.furnaces[k];
    if (f) { out.push(...[f.in, f.fuel, f.out].filter(Boolean)); delete this.world.furnaces[k]; }
    const v = this.viewers.get(k);
    if (v) for (const pl of v) { pl.box = null; this.send(pl, { t: "box", kind: null, k }); }
    this.viewers.delete(k);
    return out;
  }

  tick(dt) {
    this.pushTimer -= dt;
    const pushAll = this.pushTimer <= 0;
    if (pushAll) this.pushTimer = 0.5;
    for (const [k, f] of Object.entries(this.world.furnaces)) {
      const res = f.in ? SMELT[f.in.id] : null;
      const canOut = !!res && (!f.out || (f.out.id === res && f.out.n < maxStack(res)));
      let changed = false;
      if (f.burn > 0) f.burn -= dt;
      if (f.burn <= 0 && canOut && f.fuel && FUEL[f.fuel.id]) {
        f.burn = f.burnMax = FUEL[f.fuel.id];
        f.fuel = f.fuel.n > 1 ? { ...f.fuel, n: f.fuel.n - 1 } : null;
        changed = true;
      }
      if (f.burn > 0 && canOut) {
        f.cook += dt;
        if (f.cook >= SMELT_SECONDS) {
          f.cook = 0;
          f.in = f.in.n > 1 ? { ...f.in, n: f.in.n - 1 } : null;
          f.out = f.out ? { ...f.out, n: f.out.n + 1 } : { id: res, n: 1 };
          f.xp = (f.xp ?? 0) + (SMELT_XP[res] ?? 0.1);
          changed = true;
        }
      } else if (f.cook > 0) f.cook = Math.max(0, f.cook - dt * 2);
      if (f.burn < 0) f.burn = 0;
      if (changed) this.world.dirty = true;
      if (changed || (pushAll && (f.burn > 0 || f.cook > 0))) this.push(k);
    }
  }
}
