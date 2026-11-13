// 조합법 · 굽기 — 생존 게임에서 흔히 쓰는 모양 조합
import { B } from "./blocks.js";
import { I, TOOL_TIERS, ARMOR_TIER_LIST, ARMOR_KIND_LIST } from "./items.js";

const S = I.STICK;

// 모양 조합: rows 의 글자를 key 로 바꿔 비교한다 (빈칸은 " ")
const SHAPED = [
  { rows: ["#", "#"], key: { "#": B.PLANKS }, out: [S, 4] },
  { rows: ["##", "##"], key: { "#": B.PLANKS }, out: [B.CRAFTING_TABLE, 1] },
  { rows: ["C", "S"], key: { C: I.COAL, S }, out: [B.TORCH, 4] },
  { rows: ["###", "# #", "###"], key: { "#": B.COBBLE }, out: [B.FURNACE, 1] },
  { rows: ["###", "# #", "###"], key: { "#": B.PLANKS }, out: [B.CHEST, 1] },
  { rows: ["##", "##"], key: { "#": B.SAND }, out: [B.SANDSTONE, 1] },
  { rows: ["##", "##"], key: { "#": B.STONE }, out: [B.BRICK, 4] },
  { rows: ["###", "#B#", "###"], key: { "#": B.PLANKS, B: I.LEATHER }, out: [B.BOOKSHELF, 1] },
  { rows: ["F", "S", "A"], key: { F: I.FEATHER, S, A: B.COBBLE }, out: [I.ARROW, 4] },
];
TOOL_TIERS.forEach((t) => {
  const key = { M: t.mat, S };
  SHAPED.push(
    { rows: ["MMM", " S ", " S "], key, out: [t.base + 0, 1] }, // 곡괭이
    { rows: ["MM", "MS", " S"], key, out: [t.base + 1, 1] },     // 도끼
    { rows: ["M", "S", "S"], key, out: [t.base + 2, 1] },        // 삽
    { rows: ["M", "M", "S"], key, out: [t.base + 3, 1] },        // 검
  );
});
ARMOR_TIER_LIST.forEach((t) => {
  ARMOR_KIND_LIST.forEach((k, slot) => SHAPED.push({ rows: k.rows, key: { M: t.mat }, out: [t.base + slot, 1] }));
});

// 모양 상관없는 조합
const SHAPELESS = [
  { items: [I.WOLF_PELT, I.WOLF_PELT], out: [I.WOLF_COAT, 1] },
  { items: [B.LOG], out: [B.PLANKS, 4] },
  { items: [B.BIRCH_LOG], out: [B.PLANKS, 4] },
  { items: [B.SPRUCE_LOG], out: [B.PLANKS, 4] },
  { items: [B.WOOL_WHITE, B.FLOWER_RED], out: [B.WOOL_RED, 1] },
  { items: [B.WOOL_WHITE, B.FLOWER_YELLOW], out: [B.WOOL_YELLOW, 1] },
  { items: [B.WOOL_WHITE, I.COAL], out: [B.WOOL_BLACK, 1] },
  { items: [B.WOOL_WHITE, B.CACTUS], out: [B.WOOL_GREEN, 1] },
  { items: [B.WOOL_WHITE, I.DIAMOND], out: [B.WOOL_BLUE, 1] },
];

/** 조합칸(size x size, 0 = 빈칸)의 결과 → [id, 개수] 또는 null */
export function craft(grid, size) {
  let r0 = size, r1 = -1, c0 = size, c1 = -1;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    if (grid[r * size + c]) { r0 = Math.min(r0, r); r1 = Math.max(r1, r); c0 = Math.min(c0, c); c1 = Math.max(c1, c); }
  }
  if (r1 < 0) return null;
  const h = r1 - r0 + 1, w = c1 - c0 + 1;
  const at = (r, c) => grid[(r0 + r) * size + c0 + c];

  for (const rc of SHAPED) {
    if (rc.rows.length !== h || rc.rows[0].length !== w) continue;
    for (const mirror of [false, true]) {
      let ok = true;
      for (let r = 0; r < h && ok; r++) for (let c = 0; c < w && ok; c++) {
        const ch = rc.rows[r][mirror ? w - 1 - c : c];
        const want = ch === " " ? 0 : rc.key[ch];
        if (at(r, c) !== want) ok = false;
      }
      if (ok) return rc.out;
    }
  }
  const have = grid.filter(Boolean).sort((a, b) => a - b);
  for (const rc of SHAPELESS) {
    const want = [...rc.items].sort((a, b) => a - b);
    if (have.length === want.length && have.every((v, i) => v === want[i])) return rc.out;
  }
  return null;
}

/** 조합법 목록 (도움말 · 테스트용) */
export const RECIPE_COUNT = () => SHAPED.length + SHAPELESS.length;

// 굽기 (화로)
export const SMELT = {
  [B.IRON_ORE]: I.IRON_INGOT,
  [B.SAND]: B.GLASS,
  [B.COBBLE]: B.STONE,
  [B.LOG]: I.COAL, [B.BIRCH_LOG]: I.COAL, [B.SPRUCE_LOG]: I.COAL,
  [B.CACTUS]: B.WOOL_GREEN,
  [I.RAW_PORK]: I.COOKED_PORK,
  [I.RAW_BEEF]: I.STEAK,
  [I.RAW_CHICKEN]: I.COOKED_CHICKEN,
};
/** 굽기 경험치 */
export const SMELT_XP = { [I.IRON_INGOT]: 0.7, [B.GLASS]: 0.1, [B.STONE]: 0.1, [I.COAL]: 0.15, [I.COOKED_PORK]: 0.35, [I.STEAK]: 0.35, [I.COOKED_CHICKEN]: 0.35, [B.WOOL_GREEN]: 0.2 };
/** 연료 — 태울 수 있는 시간(초). 한 개 굽는 데 10초 */
export const FUEL = {
  [I.COAL]: 80, [B.LOG]: 15, [B.BIRCH_LOG]: 15, [B.SPRUCE_LOG]: 15, [B.PLANKS]: 15, [S]: 5,
  [B.CRAFTING_TABLE]: 15, [B.BOOKSHELF]: 15, [B.CHEST]: 15,
  270: 10, 271: 10, 272: 10, 273: 10,
};
export const SMELT_SECONDS = 10;
