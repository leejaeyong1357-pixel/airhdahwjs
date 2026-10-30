// 블록 정의 — 서버와 브라우저가 함께 쓴다.
// tex: [윗면, 아랫면, 옆면] 텍스처 이름 (텍스처는 public/textures.js 가 코드로 그린다)
// kind: solid(꽉 찬 블록) · cutout(구멍 뚫린 블록: 잎 · 유리) · liquid(물)

export const AIR = 0;

export const BLOCKS = [
  null, // 0 공기
  { id: 1, name: "잔디", tex: ["grass_top", "dirt", "grass_side"], kind: "solid" },
  { id: 2, name: "흙", tex: ["dirt", "dirt", "dirt"], kind: "solid" },
  { id: 3, name: "돌", tex: ["stone", "stone", "stone"], kind: "solid" },
  { id: 4, name: "조약돌", tex: ["cobble", "cobble", "cobble"], kind: "solid" },
  { id: 5, name: "모래", tex: ["sand", "sand", "sand"], kind: "solid" },
  { id: 6, name: "나무", tex: ["log_top", "log_top", "log_side"], kind: "solid" },
  { id: 7, name: "나뭇잎", tex: ["leaves", "leaves", "leaves"], kind: "cutout" },
  { id: 8, name: "나무 판자", tex: ["planks", "planks", "planks"], kind: "solid" },
  { id: 9, name: "유리", tex: ["glass", "glass", "glass"], kind: "cutout" },
  { id: 10, name: "물", tex: ["water", "water", "water"], kind: "liquid" },
  { id: 11, name: "벽돌", tex: ["brick", "brick", "brick"], kind: "solid" },
  { id: 12, name: "기반암", tex: ["bedrock", "bedrock", "bedrock"], kind: "solid", unbreakable: true },
  { id: 13, name: "눈", tex: ["snow", "dirt", "snow_side"], kind: "solid" },
  { id: 14, name: "석탄 광석", tex: ["coal_ore", "coal_ore", "coal_ore"], kind: "solid" },
  { id: 15, name: "철 광석", tex: ["iron_ore", "iron_ore", "iron_ore"], kind: "solid" },
  { id: 16, name: "자갈", tex: ["gravel", "gravel", "gravel"], kind: "solid" },
  { id: 17, name: "하얀 양털", tex: ["wool_white", "wool_white", "wool_white"], kind: "solid" },
  { id: 18, name: "빨간 양털", tex: ["wool_red", "wool_red", "wool_red"], kind: "solid" },
  { id: 19, name: "파란 양털", tex: ["wool_blue", "wool_blue", "wool_blue"], kind: "solid" },
  { id: 20, name: "노란 양털", tex: ["wool_yellow", "wool_yellow", "wool_yellow"], kind: "solid" },
  { id: 21, name: "초록 양털", tex: ["wool_green", "wool_green", "wool_green"], kind: "solid" },
  { id: 22, name: "검은 양털", tex: ["wool_black", "wool_black", "wool_black"], kind: "solid" },
  { id: 23, name: "금 블록", tex: ["gold_block", "gold_block", "gold_block"], kind: "solid" },
  { id: 24, name: "책장", tex: ["planks", "planks", "bookshelf"], kind: "solid" },
  { id: 25, name: "호박", tex: ["pumpkin_top", "pumpkin_top", "pumpkin_side"], kind: "solid" },
  { id: 26, name: "테크젠 블록", tex: ["teczen", "teczen", "teczen"], kind: "solid" },
];

export const BLOCK_COUNT = BLOCKS.length;

/** 플레이어가 부딪히는 블록인지 */
export const isSolid = (b) => b !== AIR && BLOCKS[b]?.kind !== "liquid";
/** 뒤쪽 면이 비쳐 보이는 블록인지 (면 숨김 판단용) */
export const isSeeThrough = (b) => b === AIR || BLOCKS[b]?.kind !== "solid";
/** 그림자(AO) 계산에서 빛을 막는 블록 */
export const isOccluder = (b) => b !== AIR && BLOCKS[b]?.kind === "solid";
export const isValidBlock = (b) => Number.isInteger(b) && b >= 0 && b < BLOCK_COUNT;

/** 처음 들고 있는 단축칸 9개 */
export const DEFAULT_HOTBAR = [1, 3, 4, 8, 6, 9, 11, 5, 26];
