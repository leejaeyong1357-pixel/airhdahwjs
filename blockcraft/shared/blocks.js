// 블록 정의 — 서버와 브라우저가 함께 쓴다.
// tex: [윗면, 아랫면, 옆면]  (텍스처는 public/textures.js 가 코드로 그린다)
// kind: solid(꽉 찬 블록) · cutout(잎 · 유리처럼 구멍) · liquid(물) · lava(용암) · torch(횃불) · plant(풀 · 꽃 — X자 모양)
//       torch · plant 는 부딪히지 않고, 아래 블록이 없어지면 같이 부서진다
// hard: 단단함(마크 기준 값). 캐는 시간 = hard × 1.5초 (알맞은 도구면 도구 배율로 나눔)
// tool: 빠르게 캐는 도구, need: 이 등급 이상 도구가 있어야 아이템이 나옴(0 나무 · 1 돌 · 2 철)
// drop: 캤을 때 나오는 아이템 (없으면 자기 자신, null 이면 아무것도 안 나옴)

export const AIR = 0;

export const B = {
  GRASS: 1, DIRT: 2, STONE: 3, COBBLE: 4, SAND: 5, LOG: 6, LEAVES: 7, PLANKS: 8, GLASS: 9, WATER: 10,
  BRICK: 11, BEDROCK: 12, SNOW: 13, COAL_ORE: 14, IRON_ORE: 15, GRAVEL: 16,
  WOOL_WHITE: 17, WOOL_RED: 18, WOOL_BLUE: 19, WOOL_YELLOW: 20, WOOL_GREEN: 21, WOOL_BLACK: 22,
  GOLD_BLOCK: 23, BOOKSHELF: 24, PUMPKIN: 25, TECZEN: 26, CRAFTING_TABLE: 27, FURNACE: 28, TORCH: 29,
  DIAMOND_ORE: 30, TALL_GRASS: 31, FLOWER_YELLOW: 32, FLOWER_RED: 33,
  CHEST: 34, LAVA: 35, CACTUS: 36, BIRCH_LOG: 37, BIRCH_LEAVES: 38, SPRUCE_LOG: 39, SPRUCE_LEAVES: 40,
  SANDSTONE: 41, DEAD_BUSH: 42, OBSIDIAN: 43,
  // 에보(팀전) 맵용
  CONCRETE_LIGHT: 44, CONCRETE_DARK: 45, YARD: 46, YARD_LINE_X: 47, YARD_LINE_Z: 48,
  CONTAINER: 49, CONTAINER_TOP: 50, CONTAINER_CORNER: 51, CONTAINER_DOOR: 52, SHUTTER: 53, WINDOW: 54,
  CRATE: 55, BLOCK_WALL: 56, CEILING: 57, FLOOR_TILE: 58, LAMP: 59, METAL_PANEL: 60,
  SPAWN_RED: 61, SPAWN_BLUE: 62, DUMPSTER: 63, DRUM: 64, ARMORY: 65, POLE: 66, WALL_LAMP: 67, SIGN: 68,
};

export const BLOCKS = [
  null, // 0 공기
  { id: 1, name: "잔디 블록", tex: ["grass_top", "dirt", "grass_side"], kind: "solid", hard: 0.6, tool: "shovel", drop: B.DIRT },
  { id: 2, name: "흙", tex: ["dirt", "dirt", "dirt"], kind: "solid", hard: 0.5, tool: "shovel" },
  { id: 3, name: "돌", tex: ["stone", "stone", "stone"], kind: "solid", hard: 1.5, tool: "pickaxe", need: 0, drop: B.COBBLE },
  { id: 4, name: "조약돌", tex: ["cobble", "cobble", "cobble"], kind: "solid", hard: 2, tool: "pickaxe", need: 0 },
  { id: 5, name: "모래", tex: ["sand", "sand", "sand"], kind: "solid", hard: 0.5, tool: "shovel" },
  { id: 6, name: "참나무", tex: ["log_top", "log_top", "log_side"], kind: "solid", hard: 2, tool: "axe" },
  { id: 7, name: "나뭇잎", tex: ["leaves", "leaves", "leaves"], kind: "cutout", hard: 0.2, drop: "leaves" },
  { id: 8, name: "참나무 판자", tex: ["planks", "planks", "planks"], kind: "solid", hard: 2, tool: "axe" },
  { id: 9, name: "유리", tex: ["glass", "glass", "glass"], kind: "cutout", hard: 0.3, drop: null },
  { id: 10, name: "물", tex: ["water", "water", "water"], kind: "liquid", hard: Infinity, unbreakable: true },
  { id: 11, name: "벽돌", tex: ["brick", "brick", "brick"], kind: "solid", hard: 2, tool: "pickaxe", need: 0 },
  { id: 12, name: "기반암", tex: ["bedrock", "bedrock", "bedrock"], kind: "solid", hard: Infinity, unbreakable: true },
  { id: 13, name: "눈 덮인 흙", tex: ["snow", "dirt", "snow_side"], kind: "solid", hard: 0.6, tool: "shovel", drop: B.DIRT },
  { id: 14, name: "석탄 광석", tex: ["coal_ore", "coal_ore", "coal_ore"], kind: "solid", hard: 3, tool: "pickaxe", need: 0, drop: 257 },
  { id: 15, name: "철 광석", tex: ["iron_ore", "iron_ore", "iron_ore"], kind: "solid", hard: 3, tool: "pickaxe", need: 1 },
  { id: 16, name: "자갈", tex: ["gravel", "gravel", "gravel"], kind: "solid", hard: 0.6, tool: "shovel" },
  { id: 17, name: "하얀 양털", tex: ["wool_white", "wool_white", "wool_white"], kind: "solid", hard: 0.8 },
  { id: 18, name: "빨간 양털", tex: ["wool_red", "wool_red", "wool_red"], kind: "solid", hard: 0.8 },
  { id: 19, name: "파란 양털", tex: ["wool_blue", "wool_blue", "wool_blue"], kind: "solid", hard: 0.8 },
  { id: 20, name: "노란 양털", tex: ["wool_yellow", "wool_yellow", "wool_yellow"], kind: "solid", hard: 0.8 },
  { id: 21, name: "초록 양털", tex: ["wool_green", "wool_green", "wool_green"], kind: "solid", hard: 0.8 },
  { id: 22, name: "검은 양털", tex: ["wool_black", "wool_black", "wool_black"], kind: "solid", hard: 0.8 },
  { id: 23, name: "금 블록", tex: ["gold_block", "gold_block", "gold_block"], kind: "solid", hard: 3, tool: "pickaxe", need: 2 },
  { id: 24, name: "책장", tex: ["planks", "planks", "bookshelf"], kind: "solid", hard: 1.5, tool: "axe" },
  { id: 25, name: "호박", tex: ["pumpkin_top", "pumpkin_top", "pumpkin_side"], kind: "solid", hard: 1, tool: "axe" },
  { id: 26, name: "테크젠 블록", tex: ["teczen", "teczen", "teczen"], kind: "solid", hard: 1.5, tool: "pickaxe" },
  { id: 27, name: "작업대", tex: ["table_top", "planks", "table_side"], kind: "solid", hard: 2.5, tool: "axe" },
  { id: 28, name: "화로", tex: ["furnace_top", "furnace_top", "furnace_front"], kind: "solid", hard: 3.5, tool: "pickaxe", need: 0 },
  { id: 29, name: "횃불", tex: ["torch", "torch", "torch"], kind: "torch", hard: 0, light: 14 },
  { id: 30, name: "다이아몬드 광석", tex: ["diamond_ore", "diamond_ore", "diamond_ore"], kind: "solid", hard: 3, tool: "pickaxe", need: 2, drop: 259 },
  { id: 31, name: "풀", tex: ["tall_grass", "tall_grass", "tall_grass"], kind: "plant", hard: 0, drop: null },
  { id: 32, name: "민들레", tex: ["flower_yellow", "flower_yellow", "flower_yellow"], kind: "plant", hard: 0 },
  { id: 33, name: "양귀비", tex: ["flower_red", "flower_red", "flower_red"], kind: "plant", hard: 0 },
  { id: 34, name: "상자", tex: ["chest_top", "chest_top", "chest_front"], kind: "solid", hard: 2.5, tool: "axe" },
  { id: 35, name: "용암", tex: ["lava", "lava", "lava"], kind: "lava", hard: Infinity, unbreakable: true, light: 15 },
  { id: 36, name: "선인장", tex: ["cactus_top", "cactus_top", "cactus_side"], kind: "solid", hard: 0.4 },
  { id: 37, name: "자작나무", tex: ["birch_top", "birch_top", "birch_side"], kind: "solid", hard: 2, tool: "axe" },
  { id: 38, name: "자작나무 잎", tex: ["birch_leaves", "birch_leaves", "birch_leaves"], kind: "cutout", hard: 0.2, drop: "leaves" },
  { id: 39, name: "가문비나무", tex: ["spruce_top", "spruce_top", "spruce_side"], kind: "solid", hard: 2, tool: "axe" },
  { id: 40, name: "가문비나무 잎", tex: ["spruce_leaves", "spruce_leaves", "spruce_leaves"], kind: "cutout", hard: 0.2, drop: "leaves" },
  { id: 41, name: "사암", tex: ["sandstone_top", "sandstone_top", "sandstone"], kind: "solid", hard: 0.8, tool: "pickaxe", need: 0 },
  { id: 42, name: "마른 덤불", tex: ["dead_bush", "dead_bush", "dead_bush"], kind: "plant", hard: 0, drop: null },
  { id: 43, name: "흑요석", tex: ["obsidian", "obsidian", "obsidian"], kind: "solid", hard: 50, tool: "pickaxe", need: 3 },
  // ── 에보 맵 블록 (shape: 정육면체가 아닌 모양 — 부딪힘은 한 칸) ──
  { id: 44, name: "밝은 콘크리트", tex: ["concrete_light", "concrete_light", "concrete_light"], kind: "solid", hard: 1.8, tool: "pickaxe", need: 0 },
  { id: 45, name: "어두운 콘크리트", tex: ["concrete_dark", "concrete_dark", "concrete_dark"], kind: "solid", hard: 1.8, tool: "pickaxe", need: 0 },
  { id: 46, name: "마당 바닥", tex: ["yard", "concrete_dark", "yard"], kind: "solid", hard: 1.5, tool: "pickaxe", need: 0 },
  { id: 47, name: "마당 선 (가로)", tex: ["yard_line_x", "concrete_dark", "yard"], kind: "solid", hard: 1.5, tool: "pickaxe", need: 0 },
  { id: 48, name: "마당 선 (세로)", tex: ["yard_line_z", "concrete_dark", "yard"], kind: "solid", hard: 1.5, tool: "pickaxe", need: 0 },
  { id: 49, name: "컨테이너 벽", tex: ["container_top", "container_rail", "container_side"], kind: "solid", hard: 3, tool: "pickaxe", need: 0 },
  { id: 50, name: "컨테이너 윗판", tex: ["container_top", "container_rail", "container_side_top"], kind: "solid", hard: 3, tool: "pickaxe", need: 0 },
  { id: 51, name: "컨테이너 모서리", tex: ["container_corner_top", "container_rail", "container_corner"], kind: "solid", hard: 3, tool: "pickaxe", need: 0 },
  { id: 52, name: "컨테이너 문", tex: ["container_top", "container_rail", "container_door"], kind: "solid", hard: 3, tool: "pickaxe", need: 0 },
  { id: 53, name: "셔터", tex: ["concrete_dark", "concrete_dark", "shutter"], kind: "solid", hard: 3, tool: "pickaxe", need: 0 },
  { id: 54, name: "창고 창문", tex: ["window", "window", "window"], kind: "solid", hard: 0.5 },
  { id: 55, name: "나무 상자", tex: ["crate_top", "crate_top", "crate"], kind: "solid", hard: 2, tool: "axe" },
  { id: 56, name: "회색 조적벽", tex: ["block_wall", "block_wall", "block_wall"], kind: "solid", hard: 2, tool: "pickaxe", need: 0 },
  { id: 57, name: "천장", tex: ["ceiling", "ceiling", "ceiling"], kind: "solid", hard: 2, tool: "pickaxe", need: 0 },
  { id: 58, name: "타일 바닥", tex: ["floor_tile", "concrete_dark", "concrete_dark"], kind: "solid", hard: 1.5, tool: "pickaxe", need: 0 },
  { id: 59, name: "형광등", tex: ["lamp", "lamp", "lamp_side"], kind: "solid", hard: 0.5, light: 15 },
  { id: 60, name: "골함석 벽", tex: ["metal_panel", "metal_panel", "metal_panel"], kind: "solid", hard: 3, tool: "pickaxe", need: 0 },
  { id: 61, name: "레드 스폰 표시", tex: ["spawn_red", "concrete_dark", "yard"], kind: "solid", hard: 1.5, tool: "pickaxe", need: 0 },
  { id: 62, name: "블루 스폰 표시", tex: ["spawn_blue", "concrete_dark", "yard"], kind: "solid", hard: 1.5, tool: "pickaxe", need: 0 },
  { id: 63, name: "녹색 수거함", tex: ["dumpster_top", "dumpster_side", "dumpster_side"], kind: "solid", hard: 3, tool: "pickaxe", need: 0 },
  { id: 64, name: "드럼통", tex: ["drum_top", "drum_top", "drum_side"], kind: "cutout", shape: "drum", hard: 2, tool: "pickaxe", need: 0 },
  { id: 65, name: "무기고", tex: ["armory_top", "armory_top", "armory"], kind: "solid", hard: 4, tool: "pickaxe", need: 0, light: 6 },
  { id: 66, name: "철 기둥", tex: ["pole", "pole", "pole"], kind: "cutout", shape: "pole", hard: 2, tool: "pickaxe", need: 0 },
  { id: 67, name: "벽 조명", tex: ["wall_lamp_top", "wall_lamp_light", "wall_lamp"], kind: "torch", shape: "walllamp", hard: 0.5, light: 13 },
  { id: 68, name: "간판 뒤판", tex: ["concrete_dark", "concrete_dark", "sign_back"], kind: "solid", hard: 2, tool: "pickaxe", need: 0 },
];

export const BLOCK_COUNT = BLOCKS.length;

/** 플레이어 · 몹이 부딪히는 블록 */
export const isSolid = (b) => b !== AIR && (BLOCKS[b]?.kind === "solid" || BLOCKS[b]?.kind === "cutout");
/** 빛 · 시야를 완전히 막는 블록 */
export const isOpaque = (b) => b !== AIR && BLOCKS[b]?.kind === "solid";
/** 그림자(AO) 계산에서 빛을 막는 블록 */
export const isOccluder = isOpaque;
export const isBlockId = (b) => Number.isInteger(b) && b > 0 && b < BLOCK_COUNT;
export const isValidBlock = (b) => Number.isInteger(b) && b >= 0 && b < BLOCK_COUNT;
/** 아래 블록이 받쳐줘야 하는 블록 (횃불 · 풀 · 꽃) */
export const needsSupport = (b) => BLOCKS[b]?.kind === "torch" || BLOCKS[b]?.kind === "plant";
/** 손이 닿아 캘 수 있는 블록 (물은 통과) */
export const isTargetable = (b) => b !== AIR && BLOCKS[b]?.kind !== "liquid" && BLOCKS[b]?.kind !== "lava";
export const isLiquid = (b) => BLOCKS[b]?.kind === "liquid" || BLOCKS[b]?.kind === "lava";
/** 나무 기둥 (판자 재료) */
export const isLog = (b) => b === B.LOG || b === B.BIRCH_LOG || b === B.SPRUCE_LOG;
export const isLeaves = (b) => b === B.LEAVES || b === B.BIRCH_LEAVES || b === B.SPRUCE_LEAVES;
