// 아이템 정의 — 블록 아이템(1~255, 블록 번호와 같음) + 일반 아이템(256~)
import { BLOCKS, B, isLeaves } from "./blocks.js";

export const I = {
  STICK: 256, COAL: 257, IRON_INGOT: 258, DIAMOND: 259, APPLE: 260,
  RAW_PORK: 261, COOKED_PORK: 262, RAW_BEEF: 263, STEAK: 264, RAW_CHICKEN: 265, COOKED_CHICKEN: 266,
  ROTTEN_FLESH: 267, FEATHER: 268, GUNPOWDER: 269,
  // 270~285 도구
  LEATHER: 286, BONE: 287, ARROW: 288, BREAD: 289,
  // 290~301 방어구
  KNIFE: 302, M16: 303, SNIPER: 304, GRENADE: 305, WOLF_PELT: 306, WOLF_COAT: 307,
};

const TIERS = [
  { key: "wooden", name: "나무", speed: 2, uses: 59, mat: B.PLANKS, base: 270 },
  { key: "stone", name: "돌", speed: 4, uses: 131, mat: B.COBBLE, base: 274 },
  { key: "iron", name: "철", speed: 6, uses: 250, mat: I.IRON_INGOT, base: 278 },
  { key: "diamond", name: "다이아몬드", speed: 8, uses: 1561, mat: I.DIAMOND, base: 282 },
];
const TOOL_KINDS = [
  { tool: "pickaxe", name: "곡괭이", damage: [2, 3, 4, 5] },
  { tool: "axe", name: "도끼", damage: [3, 4, 5, 6] },
  { tool: "shovel", name: "삽", damage: [1.5, 2.5, 3.5, 4.5] },
  { tool: "sword", name: "검", damage: [4, 5, 6, 7] },
];
// 방어구 — slot: 0 머리 1 몸 2 다리 3 발
const ARMOR_TIERS = [
  { key: "leather", name: "가죽", mat: I.LEATHER, base: 290, points: [1, 3, 2, 1], uses: [55, 80, 75, 65] },
  { key: "iron", name: "철", mat: I.IRON_INGOT, base: 294, points: [2, 6, 5, 2], uses: [165, 240, 225, 195] },
  { key: "diamond", name: "다이아몬드", mat: I.DIAMOND, base: 298, points: [3, 8, 6, 3], uses: [363, 528, 495, 429] },
];
const ARMOR_KINDS = [
  { name: "투구", rows: ["MMM", "M M"] },
  { name: "갑옷", rows: ["M M", "MMM", "MMM"] },
  { name: "바지", rows: ["MMM", "M M", "M M"] },
  { name: "신발", rows: ["M M", "M M"] },
];

export const ITEMS = {};

// 블록 아이템
for (const b of BLOCKS) {
  if (!b || b.kind === "liquid" || b.kind === "lava" || b.unbreakable) continue;
  ITEMS[b.id] = { id: b.id, name: b.name, block: b.id, stack: 64 };
}

// 일반 아이템 (icon: public/textures.js 의 아이콘 이름)
const plain = [
  [I.STICK, "막대기", "stick"], [I.COAL, "석탄", "coal"], [I.IRON_INGOT, "철괴", "iron_ingot"], [I.DIAMOND, "다이아몬드", "diamond"],
  [I.APPLE, "사과", "apple", { food: 4, sat: 2.4 }],
  [I.RAW_PORK, "익히지 않은 돼지고기", "raw_pork", { food: 3, sat: 1.8, heal: 4 }], [I.COOKED_PORK, "익힌 돼지고기", "cooked_pork", { food: 8, sat: 12.8, heal: 8 }],
  [I.RAW_BEEF, "익히지 않은 소고기", "raw_beef", { food: 3, sat: 1.8, heal: 4 }], [I.STEAK, "스테이크", "steak", { food: 8, sat: 12.8, heal: 8 }],
  [I.RAW_CHICKEN, "익히지 않은 닭고기", "raw_chicken", { food: 2, sat: 1.2, heal: 3 }], [I.COOKED_CHICKEN, "익힌 닭고기", "cooked_chicken", { food: 6, sat: 7.2, heal: 6 }],
  [I.ROTTEN_FLESH, "썩은 살점", "rotten_flesh", { food: 4, sat: 0.8 }], [I.FEATHER, "깃털", "feather"], [I.GUNPOWDER, "화약", "gunpowder"],
  [I.LEATHER, "가죽", "leather"], [I.WOLF_PELT, "늑대 가죽", "wolf_pelt"], [I.BONE, "뼈", "bone"], [I.ARROW, "화살", "arrow"], [I.BREAD, "빵", "bread", { food: 5, sat: 6 }],
];
for (const [id, name, icon, extra] of plain) ITEMS[id] = { id, name, icon, stack: 64, ...extra };

// 도구 (270~285)
TIERS.forEach((t, ti) => {
  TOOL_KINDS.forEach((k, ki) => {
    const id = t.base + ki;
    ITEMS[id] = {
      id, name: `${t.name} ${k.name}`, icon: `${t.key}_${k.tool}`, stack: 1,
      tool: k.tool, tier: ti, speed: t.speed, uses: t.uses, damage: k.damage[ti], mat: t.mat,
    };
  });
});

// 방어구 (290~301)
ARMOR_TIERS.forEach((t) => {
  ARMOR_KINDS.forEach((k, slot) => {
    const id = t.base + slot;
    ITEMS[id] = {
      id, name: `${t.name} ${k.name}`, icon: `${t.key}_armor_${slot}`, stack: 1,
      armor: slot, points: t.points[slot], uses: t.uses[slot], mat: t.mat, tierKey: t.key,
    };
  });
});

// 무기 — 리스폰하면 받는다. 몸에 맞으면 칼 1(20대) · 총 2(10발), 머리에 맞은 총알은 한 방
// 총알: M16 90발(탄창 30 + 예비 60) · 저격총 30발(탄창 10 + 예비 20), R 재장전 — 리스폰하면 다시 가득
// 수류탄 3개
ITEMS[I.KNIFE] = { id: I.KNIFE, name: "칼", icon: "knife", stack: 1, damage: 1, weapon: "knife", kit: true };
ITEMS[I.M16] = {
  id: I.M16, name: "M16", icon: "m16", stack: 1, kit: true,
  gun: { auto: true, rate: 0.11, mag: 30, total: 90, reload: 2, body: 2, range: 90, spread: 0.01, kick: 0.015, zoom: 0.72 },
};
ITEMS[I.SNIPER] = {
  id: I.SNIPER, name: "저격총", icon: "sniper", stack: 1, kit: true,
  gun: { auto: false, rate: 1.2, mag: 10, total: 30, reload: 3, body: 2, range: 160, spread: 0.0, kick: 0.06, zoom: 0.16, scope: true },
};
ITEMS[I.GRENADE] = { id: I.GRENADE, name: "수류탄", icon: "grenade", stack: 3, kit: true, grenade: { fuse: 2, maxAir: 6, radius: 5, damage: 30, minSpeed: 5, speed: 30, charge: 1.1 } };
// 수류탄: 꾹 누르면 힘을 모으고(최대 1.1초) 떼면 던진다 — 짧게는 눈앞, 길게는 멀리. 땅에 떨어지고 2초 뒤 폭발
// 늑대 가죽 옷 — 늑대 가죽 2장으로 만든다 (방어구 몸 칸, 방어력 · 내구도 높음)
ITEMS[I.WOLF_COAT] = { id: I.WOLF_COAT, name: "늑대 가죽 옷", icon: "wolf_coat", stack: 1, armor: 1, points: 7, uses: 400, tierKey: "wolf" };
export const KIT = [I.KNIFE, I.M16, I.SNIPER, I.GRENADE];
export const KIT_COUNT = { [I.GRENADE]: 3 };

export const TOOL_TIERS = TIERS;
export const TOOL_KIND_LIST = TOOL_KINDS;
export const ARMOR_TIER_LIST = ARMOR_TIERS;
export const ARMOR_KIND_LIST = ARMOR_KINDS;
export const isItem = (id) => !!ITEMS[id];
export const maxStack = (id) => ITEMS[id]?.stack ?? 64;
export const itemName = (id) => ITEMS[id]?.name ?? "?";

/** 이름(한글) 또는 번호로 아이템 찾기 — /give 명령용 */
export function findItem(q) {
  const n = Number(q);
  if (Number.isInteger(n) && ITEMS[n]) return n;
  const s = String(q).replace(/[\s_]+/g, "");
  if (!s) return null;
  const hit = Object.values(ITEMS).find((it) => it.name.replace(/\s+/g, "") === s)
    ?? Object.values(ITEMS).find((it) => it.name.replace(/\s+/g, "").includes(s));
  return hit?.id ?? null;
}

/** 캐는 데 걸리는 시간(초). Infinity 면 못 캠 */
export function digSeconds(blockId, toolId) {
  const b = BLOCKS[blockId];
  if (!b || b.unbreakable) return Infinity;
  if (!b.hard) return 0;
  const t = ITEMS[toolId];
  const right = t?.tool && t.tool === b.tool;
  const canHarvest = b.need == null || (right && t.tier >= b.need);
  let speed = right ? t.speed : 1;
  if (t?.tool === "sword" && isLeaves(b.id)) speed = 1.5;
  return (b.hard * (canHarvest ? 1.5 : 5)) / speed;
}

/** 캤을 때 나오는 아이템 [[id, 개수], ...] */
export function blockDrops(blockId, toolId, rnd = Math.random) {
  const b = BLOCKS[blockId];
  if (!b || b.unbreakable) return [];
  const t = ITEMS[toolId];
  if (b.need != null && !(t?.tool === b.tool && t.tier >= b.need)) return [];
  if (b.drop === null) return [];
  if (b.drop === "leaves") return rnd() < 0.05 ? [[I.APPLE, 1]] : rnd() < 0.08 ? [[I.STICK, 1]] : [];
  return [[b.drop ?? b.id, 1]];
}

/** 블록을 캤을 때 경험치 */
export function blockXp(blockId) {
  return blockId === B.COAL_ORE ? 1 : blockId === B.DIAMOND_ORE ? 5 : 0;
}
