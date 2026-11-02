// 인벤토리 칸 다루기 — 브라우저(가방 · 조합)와 서버(화로)가 같은 규칙을 쓴다.
// 한 칸 = null 또는 { id, n(개수), dmg(도구가 닳은 정도) }
import { maxStack, ITEMS } from "./items.js";

export const INV_SIZE = 36; // 0~8 단축칸, 9~35 가방

export const stack = (id, n = 1, dmg = 0) => (id && n > 0 ? (dmg ? { id, n, dmg } : { id, n }) : null);
export const copy = (s) => (s ? { ...s } : null);
export const canMerge = (a, b) => !!a && !!b && a.id === b.id && !(a.dmg || b.dmg) && maxStack(a.id) > 1;

/** 받아들일 수 있는 칸인지 검사 — 잘못된 데이터는 null 로 */
export function clean(s) {
  if (!s || typeof s !== "object") return null;
  const id = Number(s.id), n = Math.floor(Number(s.n));
  if (!ITEMS[id] || !(n > 0)) return null;
  const dmg = Math.max(0, Math.floor(Number(s.dmg) || 0));
  return stack(id, Math.min(n, maxStack(id)), Math.min(dmg, ITEMS[id].uses ?? 0));
}

/**
 * 마크와 같은 칸 클릭.
 * button 0(왼쪽): 집기 / 놓기 / 합치기 / 바꾸기 · 2(오른쪽): 반 집기 / 1개 놓기
 * takeOnly: 결과칸처럼 꺼내기만 되는 칸
 * 결과 { slot, cursor }
 */
export function clickSlot(slot, cursor, button, takeOnly = false) {
  slot = copy(slot); cursor = copy(cursor);
  if (!cursor) {
    if (!slot) return { slot, cursor };
    if (button === 2) {
      const half = Math.ceil(slot.n / 2);
      cursor = { ...slot, n: half };
      slot.n -= half;
      return { slot: slot.n > 0 ? slot : null, cursor };
    }
    return { slot: null, cursor: slot };
  }
  if (takeOnly) {
    if (slot && canMerge(slot, cursor) && cursor.n + slot.n <= maxStack(slot.id)) {
      cursor.n += slot.n;
      return { slot: null, cursor };
    }
    return { slot, cursor };
  }
  if (!slot) {
    if (button === 2) {
      const one = { ...cursor, n: 1 };
      cursor.n -= 1;
      return { slot: one, cursor: cursor.n > 0 ? cursor : null };
    }
    return { slot: cursor, cursor: null };
  }
  if (canMerge(slot, cursor)) {
    const room = maxStack(slot.id) - slot.n;
    const move = Math.min(room, button === 2 ? 1 : cursor.n);
    slot.n += move; cursor.n -= move;
    return { slot, cursor: cursor.n > 0 ? cursor : null };
  }
  return { slot: cursor, cursor: slot }; // 바꾸기
}

/** 몇 개까지 넣을 수 있나 */
export function roomFor(inv, item, from = 0, to = inv.length) {
  let room = 0;
  const max = maxStack(item.id);
  for (let i = from; i < to; i++) {
    const s = inv[i];
    if (!s) room += max;
    else if (canMerge(s, item)) room += max - s.n;
  }
  return room;
}

/**
 * 아이템 넣기 — 같은 묶음부터 채우고 빈 칸으로. 넣지 못한 개수를 돌려준다.
 * order: 칸 번호 순서 (기본: 단축칸 → 가방)
 */
export function addItem(inv, item, order) {
  if (!item) return 0;
  let left = item.n;
  const idx = order ?? inv.map((_, i) => i);
  const max = maxStack(item.id);
  for (const i of idx) {
    if (left <= 0) break;
    const s = inv[i];
    if (s && canMerge(s, item) && s.n < max) {
      const m = Math.min(max - s.n, left);
      s.n += m; left -= m;
    }
  }
  for (const i of idx) {
    if (left <= 0) break;
    if (!inv[i]) {
      const m = Math.min(max, left);
      inv[i] = { ...item, n: m };
      left -= m;
    }
  }
  return left;
}

/** 칸 배열에서 id 를 n 개 빼기 — 다 빼면 true */
export function removeItem(inv, id, n) {
  for (let i = 0; i < inv.length && n > 0; i++) {
    const s = inv[i];
    if (s?.id !== id) continue;
    const m = Math.min(s.n, n);
    s.n -= m; n -= m;
    if (s.n <= 0) inv[i] = null;
  }
  return n === 0;
}
