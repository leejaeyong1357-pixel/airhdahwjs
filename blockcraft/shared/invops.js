// 인벤토리 조작 — 브라우저가 먼저 해 보고(바로 반응), 서버가 똑같이 해서 확정한다.
// 결과가 다르면 서버가 정답(sync)을 보내 브라우저를 고친다. 그래서 브라우저가 아이템을 마음대로 만들 수 없다.
//
// state = { inv[36], armor[4], cursor, grid[4|9], screen: "inv" | "table" | null }
import { ITEMS, maxStack } from "./items.js";
import { craft } from "./recipes.js";
import { clickSlot, addItem, roomFor, canMerge, clean, INV_SIZE } from "./inventory.js";

export function newState() {
  return { inv: new Array(INV_SIZE).fill(null), armor: [null, null, null, null], cursor: null, grid: [], screen: null };
}

/** 저장된 값을 안전하게 읽기 */
export function loadState(saved) {
  const s = newState();
  if (Array.isArray(saved?.inv)) for (let i = 0; i < INV_SIZE; i++) s.inv[i] = clean(saved.inv[i]);
  if (Array.isArray(saved?.armor)) for (let i = 0; i < 4; i++) { const a = clean(saved.armor[i]); s.armor[i] = a && ITEMS[a.id].armor === i ? a : null; }
  return s;
}

export function craftResult(st) {
  const size = st.screen === "table" ? 3 : 2;
  if (st.grid.length !== size * size) return null;
  const r = craft(st.grid.map((s) => s?.id ?? 0), size);
  return r ? { id: r[0], n: r[1] } : null;
}

/** 비교용 요약 (브라우저 · 서버 결과가 같은지) */
export function digest(st) {
  const f = (s) => (s ? `${s.id}.${s.n}.${s.dmg ?? 0}` : "-");
  return [...st.inv, ...st.armor, st.cursor, ...st.grid].map(f).join(",");
}

/** 아이템 조작 하나 적용. 결과 { drops: [아이템...] } — 버린 것은 서버가 바닥에 떨어뜨린다 */
export function applyOp(st, op, mode) {
  const drops = [];
  const inv = st.inv;
  const area = (a) => (a === "inv" ? inv : a === "armor" ? st.armor : a === "craft" ? st.grid : null);
  const okIndex = (a, i) => Number.isInteger(i) && i >= 0 && i < (area(a)?.length ?? 0);
  switch (op?.o) {
    case "open": {
      closeGrid(st, drops);
      st.screen = op.screen === "table" ? "table" : "inv";
      st.grid = new Array(st.screen === "table" ? 9 : 4).fill(null);
      break;
    }
    case "close": {
      closeGrid(st, drops);
      st.screen = null;
      break;
    }
    case "click": {
      const b = op.b === 2 ? 2 : 0;
      if (op.a === "all") {
        if (mode !== "creative" || !ITEMS[op.i]) break;
        if (st.cursor) st.cursor = null;
        else if (op.s) addItem(inv, { id: op.i, n: maxStack(op.i) });
        else st.cursor = { id: op.i, n: b === 2 ? 1 : maxStack(op.i) };
        break;
      }
      if (op.a === "result") { takeResult(st, !!op.s); break; }
      if (!okIndex(op.a, op.i)) break;
      if (op.a === "armor") {
        const c = st.cursor;
        if (c && ITEMS[c.id]?.armor !== op.i) break; // 맞는 칸에만
        const r = clickSlot(st.armor[op.i], c, 0);
        st.armor[op.i] = r.slot; st.cursor = r.cursor;
        break;
      }
      const arr = area(op.a);
      if (op.s) {
        if (op.a === "inv") quickMove(st, op.i);
        else { const s = arr[op.i]; if (s) { const left = addItem(inv, s); arr[op.i] = left ? { ...s, n: left } : null; } }
      } else {
        const r = clickSlot(arr[op.i], st.cursor, b);
        arr[op.i] = r.slot; st.cursor = r.cursor;
      }
      break;
    }
    case "drag": {
      // 들고 끌어서 여러 칸에 나눠 놓기 (왼쪽: 고르게, 오른쪽: 1개씩)
      const c = st.cursor;
      const arr = area(op.a);
      if (!c || !arr || !Array.isArray(op.slots)) break;
      const slots = [...new Set(op.slots)].filter((i) => okIndex(op.a, i) && (!arr[i] || canMerge(arr[i], c)));
      if (!slots.length) break;
      const each = op.b === 2 ? 1 : Math.floor(c.n / slots.length);
      if (each < 1) break;
      for (const i of slots) {
        if (c.n <= 0) break;
        const cur = arr[i];
        const room = maxStack(c.id) - (cur?.n ?? 0);
        const m = Math.min(each, room, c.n);
        if (m <= 0) continue;
        arr[i] = cur ? { ...cur, n: cur.n + m } : { ...c, n: m };
        c.n -= m;
      }
      st.cursor = c.n > 0 ? c : null;
      break;
    }
    case "key": {
      // 칸 위에서 숫자키 → 그 단축칸과 바꾸기
      const arr = area(op.a);
      if (!arr || op.a === "armor" || !okIndex(op.a, op.i) || !Number.isInteger(op.n) || op.n < 0 || op.n > 8) break;
      const t = arr[op.i]; arr[op.i] = inv[op.n]; inv[op.n] = t;
      break;
    }
    case "drop": {
      // Q — 칸(또는 손)에 있는 것 버리기
      const arr = area(op.a);
      if (!arr || !okIndex(op.a, op.i) || !arr[op.i]) break;
      const s = arr[op.i];
      const n = op.all ? s.n : 1;
      drops.push({ ...s, n });
      arr[op.i] = s.n - n > 0 ? { ...s, n: s.n - n } : null;
      break;
    }
    case "out": {
      // 창 바깥 클릭 — 들고 있던 것 버리기
      const c = st.cursor;
      if (!c) break;
      const n = op.b === 2 ? 1 : c.n;
      drops.push({ ...c, n });
      st.cursor = c.n - n > 0 ? { ...c, n: c.n - n } : null;
      break;
    }
  }
  return { drops };
}

function closeGrid(st, drops) {
  for (const s of [...st.grid, st.cursor]) {
    if (!s) continue;
    const left = addItem(st.inv, s);
    if (left) drops.push({ ...s, n: left });
  }
  st.grid = [];
  st.cursor = null;
}

function takeResult(st, shift) {
  let made = 0;
  do {
    const r = craftResult(st);
    if (!r) break;
    if (shift) {
      if (roomFor(st.inv, r) < r.n) break;
      addItem(st.inv, r);
    } else {
      if (st.cursor && !(canMerge(st.cursor, r) && st.cursor.n + r.n <= maxStack(r.id))) break;
      st.cursor = st.cursor ? { ...st.cursor, n: st.cursor.n + r.n } : r;
    }
    st.grid = st.grid.map((s) => (s && s.n > 1 ? { ...s, n: s.n - 1 } : null));
    made++;
  } while (shift && made < 64);
}

/** Shift+클릭 — 방어구는 방어구 칸으로, 그 밖에는 단축칸 ↔ 가방 */
function quickMove(st, i) {
  const inv = st.inv;
  const s = inv[i];
  if (!s) return;
  const slot = ITEMS[s.id]?.armor;
  if (slot != null && !st.armor[slot]) { st.armor[slot] = s; inv[i] = null; return; }
  const target = i < 9 ? [...Array(27).keys()].map((k) => k + 9) : [...Array(9).keys()];
  const tmp = inv.slice();
  tmp[i] = null;
  const left = addItem(tmp, s, target);
  tmp[i] = left ? { ...s, n: left } : null;
  for (let k = 0; k < inv.length; k++) inv[k] = tmp[k];
}

/** 방어 점수 (0~20) */
export const armorPoints = (st) => st.armor.reduce((sum, a) => sum + (a ? ITEMS[a.id].points : 0), 0);

/** 손에 든 도구 · 방어구 닳기. 부서지면 true */
export function wear(arr, i, amount = 1) {
  const s = arr[i];
  const uses = s ? ITEMS[s.id]?.uses : 0;
  if (!uses) return false;
  const dmg = (s.dmg ?? 0) + amount;
  if (dmg >= uses) { arr[i] = null; return true; }
  arr[i] = { ...s, dmg };
  return false;
}

/** 손에 든 것 1개 쓰기 (블록 놓기 · 먹기) */
export function useOne(arr, i) {
  const s = arr[i];
  if (!s) return false;
  arr[i] = s.n > 1 ? { ...s, n: s.n - 1 } : null;
  return true;
}
