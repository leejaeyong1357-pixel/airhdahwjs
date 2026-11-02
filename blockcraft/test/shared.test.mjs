// 공용 규칙 단위 테스트 — 조합 · 인벤토리 조작 · 캐는 시간 · 지형
import { test } from "node:test";
import assert from "node:assert/strict";
import { B } from "../shared/blocks.js";
import { I, digSeconds, blockDrops } from "../shared/items.js";
import { craft } from "../shared/recipes.js";
import { newState, applyOp, digest, wear } from "../shared/invops.js";
import { clickSlot, addItem } from "../shared/inventory.js";
import { generateChunk, findSpawn } from "../shared/worldgen.js";

test("조합법", () => {
  assert.deepEqual(craft([B.LOG, 0, 0, 0], 2), [B.PLANKS, 4]);
  assert.deepEqual(craft([0, B.BIRCH_LOG, 0, 0], 2), [B.PLANKS, 4]);
  assert.deepEqual(craft([B.PLANKS, B.PLANKS, B.PLANKS, B.PLANKS], 2), [B.CRAFTING_TABLE, 1]);
  assert.deepEqual(craft([B.PLANKS, 0, B.PLANKS, 0], 2), [I.STICK, 4]);
  const P = B.PLANKS, S = I.STICK, C = B.COBBLE;
  assert.deepEqual(craft([P, P, P, 0, S, 0, 0, S, 0], 3), [270, 1], "나무 곡괭이");
  assert.deepEqual(craft([C, C, C, 0, S, 0, 0, S, 0], 3), [274, 1], "돌 곡괭이");
  assert.deepEqual(craft([C, C, 0, S, C, 0, S, 0, 0].map((v, i) => [C, C, 0, C, S, 0, 0, S, 0][i]), 3), [275, 1], "돌 도끼");
  assert.deepEqual(craft([0, C, C, 0, S, C, 0, S, 0], 3), [275, 1], "좌우 반전 도끼");
  assert.deepEqual(craft([C, C, C, C, 0, C, C, C, C], 3), [B.FURNACE, 1]);
  assert.deepEqual(craft([P, P, P, P, 0, P, P, P, P], 3), [B.CHEST, 1]);
  const IR = I.IRON_INGOT;
  assert.deepEqual(craft([IR, 0, IR, IR, IR, IR, IR, IR, IR], 3), [295, 1], "철 갑옷");
  assert.equal(craft([P, B.DIRT, 0, 0], 2), null, "없는 조합");
});

test("칸 클릭 규칙", () => {
  const r1 = clickSlot({ id: 1, n: 10 }, null, 2);
  assert.deepEqual(r1, { slot: { id: 1, n: 5 }, cursor: { id: 1, n: 5 } }, "오른쪽 클릭 = 반");
  const r2 = clickSlot({ id: 1, n: 60 }, { id: 1, n: 10 }, 0);
  assert.deepEqual(r2, { slot: { id: 1, n: 64 }, cursor: { id: 1, n: 6 } }, "최대 64개");
  const r3 = clickSlot({ id: 2, n: 3 }, { id: 1, n: 1 }, 0);
  assert.deepEqual(r3, { slot: { id: 1, n: 1 }, cursor: { id: 2, n: 3 } }, "바꾸기");
  const r4 = clickSlot({ id: 270, n: 1 }, { id: 270, n: 1 }, 0);
  assert.deepEqual(r4.slot, { id: 270, n: 1 }, "도구는 겹치지 않음");
});

test("인벤토리 조작 — 같은 조작이면 같은 결과", () => {
  const a = newState(), b = newState();
  for (const st of [a, b]) addItem(st.inv, { id: B.LOG, n: 3 });
  const ops = [
    { o: "open", screen: "inv" }, { o: "click", a: "inv", i: 0, b: 0 }, { o: "click", a: "craft", i: 0, b: 2 },
    { o: "click", a: "result", b: 0, s: true }, { o: "close" },
  ];
  for (const op of ops) { applyOp(a, op, "survival"); applyOp(b, op, "survival"); }
  assert.equal(digest(a), digest(b));
  const planks = a.inv.filter((s) => s?.id === B.PLANKS).reduce((n, s) => n + s.n, 0);
  assert.equal(planks, 4, "나무 1개 → 판자 4");
  assert.equal(a.inv.filter((s) => s?.id === B.LOG).reduce((n, s) => n + s.n, 0), 2, "들고 있던 나무 2개는 가방으로 돌아옴");
  const d = newState();
  d.cursor = { id: B.DIRT, n: 10 };
  applyOp(d, { o: "drag", a: "inv", slots: [5, 6], b: 0 }, "survival");
  assert.deepEqual([d.inv[5], d.inv[6], d.cursor], [{ id: B.DIRT, n: 5 }, { id: B.DIRT, n: 5 }, null], "끌어서 고르게 나누기");
  const c = newState();
  applyOp(c, { o: "click", a: "all", i: I.DIAMOND, b: 0 }, "survival");
  assert.equal(c.cursor, null, "서바이벌에선 아이템 목록 못 씀");
});

test("도구 내구도 · 캐는 시간 · 드롭", () => {
  const inv = [{ id: 270, n: 1, dmg: 58 }];
  assert.equal(wear(inv, 0), true, "다 닳으면 부서짐");
  assert.equal(inv[0], null);
  assert.ok(digSeconds(B.DIRT, 0) < digSeconds(B.STONE, 270), "흙이 돌보다 빨리 캐짐");
  assert.ok(digSeconds(B.STONE, 274) < digSeconds(B.STONE, 270), "돌 곡괭이가 더 빠름");
  assert.deepEqual(blockDrops(B.STONE, 0), [], "맨손으로 돌은 안 나옴");
  assert.deepEqual(blockDrops(B.STONE, 270), [[B.COBBLE, 1]]);
  assert.deepEqual(blockDrops(B.IRON_ORE, 270), [], "철광석은 돌 곡괭이 이상");
  assert.deepEqual(blockDrops(B.DIAMOND_ORE, 278), [[I.DIAMOND, 1]]);
});

test("같은 시드 = 같은 지형", () => {
  const a = generateChunk(3, -2, 777), b = generateChunk(3, -2, 777), c = generateChunk(3, -2, 778);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.deepEqual(findSpawn(777), findSpawn(777));
});
