// 그림 — 그림 파일 없이 코드로 16x16 픽셀 그림을 그린다.
//   buildAtlas()     블록 · 아이템 · 금 간 모양을 한 장(아틀라스)에
//   buildSkins()     몹 · 플레이어 몸 그림 한 장
//   itemIcon(id)     인벤토리 아이콘 (블록은 입체 정육면체)
//   hudIcon(name)    하트 · 배고픔 · 공기 방울
import { BLOCKS } from "/shared/blocks.js";
import { ITEMS } from "/shared/items.js";

export const TILE = 16;
const COLS = 16;

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
const shade = ([r, g, b, a], f) => (a == null ? [clamp(r * f), clamp(g * f), clamp(b * f)] : [clamp(r * f), clamp(g * f), clamp(b * f), a]);
const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];

/** 바탕색 + 점 무늬 (vary: 밝기 흔들림 정도) */
function speckle(px, base, vary, seed, w = TILE, h = TILE) {
  const r = rng(seed);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px(x, y, shade(base, 1 - vary + r() * vary * 2));
}
/** 픽셀 선 */
function line(px, x0, y0, x1, y1, c) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) px(Math.round(x0 + ((x1 - x0) * i) / (n || 1)), Math.round(y0 + ((y1 - y0) * i) / (n || 1)), c);
}
/** 글자 그림 — 문자열 배열, 글자 → 색 */
function pattern(px, rows, pal, ox = 0, oy = 0) {
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (pal[ch] !== undefined) px(ox + x, oy + y, pal[ch]); }));
}

// ── 블록 그림 ──────────────────────────────────────────────
const DRAW = {
  grass_top: (px) => speckle(px, [95, 159, 53], 0.18, 1),
  dirt: (px) => speckle(px, [134, 96, 67], 0.2, 2),
  grass_side: (px) => {
    DRAW.dirt(px);
    const r = rng(3);
    for (let x = 0; x < TILE; x++) {
      const d = 3 + Math.floor(r() * 3);
      for (let y = 0; y < d; y++) px(x, y, shade([95, 159, 53], 0.85 + r() * 0.3));
    }
  },
  stone: (px) => {
    speckle(px, [125, 125, 125], 0.12, 4);
    const r = rng(5);
    for (let i = 0; i < 10; i++) { const x = Math.floor(r() * 15), y = Math.floor(r() * 16); px(x, y, [100, 100, 100]); px(x + 1, y, [104, 104, 104]); }
  },
  cobble: (px) => {
    speckle(px, [118, 118, 118], 0.2, 6);
    const r = rng(7);
    for (let i = 0; i < 7; i++) {
      const cx = r() * 16, cy = r() * 16, rad = 2 + r() * 2.5;
      for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d < rad) px(x, y, shade([150, 150, 150], 0.85 + r() * 0.25));
        else if (d < rad + 1) px(x, y, [80, 80, 80]);
      }
    }
  },
  sand: (px) => speckle(px, [219, 207, 163], 0.08, 8),
  gravel: (px) => {
    speckle(px, [131, 127, 126], 0.25, 9);
    const r = rng(10);
    for (let i = 0; i < 14; i++) px(Math.floor(r() * 16), Math.floor(r() * 16), r() < 0.5 ? [90, 85, 85] : [170, 165, 160]);
  },
  log_side: (px) => {
    const r = rng(11);
    for (let x = 0; x < TILE; x++) {
      const f = 0.8 + r() * 0.35;
      for (let y = 0; y < TILE; y++) px(x, y, shade(x % 4 === 0 ? [80, 58, 32] : [104, 80, 46], f * (0.95 + r() * 0.1)));
    }
  },
  log_top: (px) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      px(x, y, d > 6.5 ? [104, 80, 46] : Math.floor(d) % 2 ? [176, 144, 90] : [154, 122, 74]);
    }
  },
  leaves: (px) => {
    const r = rng(12);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      if (r() < 0.18) px(x, y, null);
      else px(x, y, shade([58, 124, 38], 0.7 + r() * 0.5));
    }
  },
  planks: (px) => {
    const r = rng(13);
    for (let y = 0; y < TILE; y++) {
      const band = Math.floor(y / 4);
      for (let x = 0; x < TILE; x++) {
        const edge = y % 4 === 3 || (x === (band % 2 ? 4 : 11));
        px(x, y, edge ? [112, 84, 48] : shade([170, 134, 82], 0.9 + r() * 0.15));
      }
    }
  },
  glass: (px) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const border = x === 0 || y === 0 || x === 15 || y === 15;
      const shine = (x - y === 3 || x - y === 4) && x > 4 && x < 11;
      px(x, y, border ? [200, 225, 235] : shine ? [235, 248, 255] : null);
    }
  },
  water: (px) => {
    const r = rng(14);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) px(x, y, shade([48, 96, 200], 0.85 + r() * 0.25));
  },
  brick: (px) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const row = Math.floor(y / 4);
      const mortar = y % 4 === 3 || (x + (row % 2) * 4) % 8 === 7;
      px(x, y, mortar ? [190, 180, 170] : shade([150, 70, 55], 0.9 + ((x * 7 + y * 3) % 5) * 0.04));
    }
  },
  bedrock: (px) => {
    const r = rng(15);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) px(x, y, r() < 0.5 ? [60, 60, 60] : r() < 0.5 ? [100, 100, 100] : [35, 35, 35]);
  },
  snow: (px) => speckle(px, [240, 246, 250], 0.04, 16),
  snow_side: (px) => {
    DRAW.dirt(px);
    const r = rng(17);
    for (let x = 0; x < TILE; x++) {
      const d = 3 + Math.floor(r() * 3);
      for (let y = 0; y < d; y++) px(x, y, [240, 246, 250]);
    }
  },
  coal_ore: (px) => ore(px, [30, 30, 30], 18),
  iron_ore: (px) => ore(px, [215, 170, 140], 19),
  diamond_ore: (px) => ore(px, [90, 230, 225], 23),
  gold_block: (px) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const border = x === 0 || y === 0 || x === 15 || y === 15;
      px(x, y, border ? [210, 160, 30] : shade([250, 210, 60], 0.92 + ((x + y) % 4) * 0.03));
    }
  },
  bookshelf: (px) => {
    const colors = [[150, 40, 40], [40, 80, 150], [50, 120, 50], [180, 150, 60], [100, 50, 120]];
    const r = rng(20);
    DRAW.planks(px);
    for (let y = 1; y < 15; y++) for (let x = 1; x < 15; x++) if (y !== 7 && y !== 8) px(x, y, [60, 44, 26]);
    for (const top of [1, 9]) {
      for (let x = 1; x < 15;) {
        const w = 1 + Math.floor(r() * 2), c = colors[Math.floor(r() * colors.length)], h = 4 + Math.floor(r() * 3);
        for (let i = 0; i < w && x < 15; i++, x++) for (let y = top + 6 - h; y < top + 6; y++) px(x, y, shade(c, i ? 0.85 : 1));
      }
    }
  },
  pumpkin_top: (px) => {
    speckle(px, [200, 118, 30], 0.08, 21);
    for (let y = 6; y < 10; y++) for (let x = 6; x < 10; x++) px(x, y, [90, 120, 40]);
  },
  pumpkin_side: (px) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) px(x, y, x % 4 === 0 ? [170, 95, 20] : [210, 128, 35]);
  },
  teczen: (px) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const border = x === 0 || y === 0 || x === 15 || y === 15;
      const t = (y >= 3 && y <= 5 && x >= 3 && x <= 12) || (x >= 7 && x <= 8 && y >= 3 && y <= 12);
      const dot = x >= 11 && x <= 12 && y >= 2 && y <= 3;
      px(x, y, dot ? [230, 40, 50] : t ? [255, 255, 255] : border ? [12, 30, 70] : [24, 56, 120]);
    }
  },
  table_top: (px) => {
    DRAW.planks(px);
    for (let i = 0; i < 16; i++) { px(i, 0, [90, 62, 34]); px(i, 15, [90, 62, 34]); px(0, i, [90, 62, 34]); px(15, i, [90, 62, 34]); }
    for (let i = 2; i < 14; i++) { px(i, 5, [120, 88, 50]); px(i, 10, [120, 88, 50]); px(5, i, [120, 88, 50]); px(10, i, [120, 88, 50]); }
  },
  table_side: (px) => {
    DRAW.planks(px);
    for (let x = 0; x < 16; x++) for (let y = 0; y < 3; y++) px(x, y, shade([150, 112, 66], y === 2 ? 0.7 : 1));
    // 톱 · 망치 그림
    line(px, 3, 5, 3, 12, [200, 200, 205]); line(px, 4, 5, 4, 10, [170, 170, 175]); line(px, 3, 13, 4, 13, [90, 62, 34]);
    line(px, 9, 5, 13, 5, [110, 110, 115]); line(px, 9, 6, 13, 6, [140, 140, 145]); line(px, 11, 7, 11, 13, [100, 70, 40]);
  },
  furnace_top: (px) => {
    speckle(px, [110, 110, 110], 0.12, 24);
    for (let i = 0; i < 16; i++) { px(i, 0, [70, 70, 70]); px(i, 15, [70, 70, 70]); px(0, i, [70, 70, 70]); px(15, i, [70, 70, 70]); }
  },
  furnace_front: (px) => {
    DRAW.furnace_top(px);
    for (let y = 8; y < 14; y++) for (let x = 3; x < 13; x++) px(x, y, y === 8 ? [40, 40, 40] : [24, 22, 22]);
    for (let x = 4; x < 12; x++) px(x, 13, [180, 80, 20]);
    for (let x = 2; x < 14; x++) px(x, 3, [80, 80, 80]);
  },
  torch: (px) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) px(x, y, null);
    for (let y = 6; y < 16; y++) { px(7, y, [128, 92, 50]); px(8, y, [96, 68, 36]); }
    px(7, 5, [255, 230, 120]); px(8, 5, [255, 200, 80]); px(7, 4, [255, 160, 40]); px(8, 4, [255, 250, 200]);
    px(7, 6, [255, 210, 90]); px(8, 6, [240, 150, 40]);
  },
  tall_grass: (px) => {
    const r = rng(25);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) px(x, y, null);
    for (let i = 0; i < 9; i++) {
      const x = 1 + Math.floor(r() * 14), h = 5 + Math.floor(r() * 10), lean = r() < 0.5 ? -1 : 1;
      for (let y = 0; y < h; y++) px(x + (y > h * 0.6 ? lean : 0), 15 - y, shade([84, 150, 48], 0.7 + r() * 0.5));
    }
  },
  flower_yellow: (px) => flower(px, [250, 220, 40], [255, 245, 150]),
  chest_top: (px) => {
    DRAW.planks(px);
    for (let i = 0; i < 16; i++) { px(i, 0, [70, 48, 24]); px(i, 15, [70, 48, 24]); px(0, i, [70, 48, 24]); px(15, i, [70, 48, 24]); }
  },
  chest_front: (px) => {
    DRAW.chest_top(px);
    for (let x = 0; x < 16; x++) px(x, 5, [70, 48, 24]);
    for (let y = 4; y < 9; y++) for (let x = 7; x < 9; x++) px(x, y, y === 6 ? [60, 60, 60] : [200, 200, 205]);
  },
  lava: (px) => {
    const r = rng(26);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const v = Math.sin(x * 0.9 + y * 0.4) + Math.sin(y * 0.7 - x * 0.3) + r() * 0.8;
      px(x, y, v > 1.1 ? [255, 220, 90] : v > 0.2 ? [240, 120, 20] : [200, 70, 10]);
    }
  },
  cactus_side: (px) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) px(x, y, x % 4 === 1 ? [40, 110, 30] : [70, 150, 50]);
    for (let y = 2; y < 16; y += 4) { px(0, y, [230, 230, 200]); px(15, y + 2, [230, 230, 200]); }
  },
  cactus_top: (px) => { speckle(px, [80, 160, 60], 0.08, 27); for (let i = 0; i < 16; i++) { px(i, 0, [40, 110, 30]); px(0, i, [40, 110, 30]); px(15, i, [40, 110, 30]); px(i, 15, [40, 110, 30]); } },
  birch_side: (px) => {
    const r = rng(28);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) px(x, y, shade([220, 220, 210], 0.92 + r() * 0.1));
    for (let i = 0; i < 9; i++) { const x = Math.floor(r() * 14), y = Math.floor(r() * 16); px(x, y, [40, 40, 36]); px(x + 1, y, [60, 60, 54]); }
  },
  birch_top: (px) => { DRAW.log_top(px); for (let i = 0; i < 16; i++) { px(i, 0, [220, 220, 210]); px(0, i, [220, 220, 210]); px(15, i, [220, 220, 210]); px(i, 15, [220, 220, 210]); } },
  birch_leaves: (px) => { const r = rng(29); for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) px(x, y, r() < 0.16 ? null : shade([110, 160, 70], 0.7 + r() * 0.5)); },
  spruce_side: (px) => { const r = rng(30); for (let x = 0; x < TILE; x++) { const f = 0.8 + r() * 0.3; for (let y = 0; y < TILE; y++) px(x, y, shade(x % 3 === 0 ? [50, 34, 20] : [72, 50, 30], f)); } },
  spruce_top: (px) => { for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) { const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)); px(x, y, d > 6.5 ? [72, 50, 30] : Math.floor(d) % 2 ? [130, 96, 58] : [110, 80, 48]); } },
  spruce_leaves: (px) => { const r = rng(31); for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) px(x, y, r() < 0.12 ? null : shade([40, 86, 50], 0.7 + r() * 0.45)); },
  sandstone: (px) => { speckle(px, [216, 200, 150], 0.06, 32); for (let x = 0; x < 16; x++) { px(x, 4, [190, 172, 120]); px(x, 11, [190, 172, 120]); } },
  sandstone_top: (px) => speckle(px, [222, 208, 160], 0.05, 33),
  dead_bush: (px) => {
    clear(px);
    const c = [130, 90, 40];
    line(px, 8, 15, 8, 9, c); line(px, 8, 11, 4, 6, c); line(px, 8, 10, 12, 5, c); line(px, 5, 7, 3, 3, c); line(px, 11, 6, 13, 2, c); line(px, 8, 9, 7, 4, c);
  },
  obsidian: (px) => { const r = rng(34); for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) px(x, y, r() < 0.12 ? [70, 50, 110] : shade([22, 16, 36], 0.8 + r() * 0.4)); },
  flower_red: (px) => flower(px, [210, 30, 30], [60, 20, 20]),
};

function ore(px, spot, seed) {
  DRAW.stone(px);
  const r = rng(seed);
  for (let i = 0; i < 5; i++) {
    const cx = 2 + Math.floor(r() * 12), cy = 2 + Math.floor(r() * 12);
    px(cx, cy, spot); px(cx + 1, cy, spot); px(cx, cy + 1, shade(spot, 0.8));
  }
}
function flower(px, petal, center) {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) px(x, y, null);
  for (let y = 8; y < 16; y++) px(7, y, [70, 130, 40]);
  px(6, 11, [70, 130, 40]); px(5, 10, [70, 130, 40]); px(8, 12, [70, 130, 40]); px(9, 11, [70, 130, 40]);
  for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) px(7 + dx, 6 + dy, petal);
  px(7, 4, petal); px(5, 6, petal); px(9, 6, petal);
  px(7, 6, center);
}

const WOOL = { white: [234, 236, 237], red: [161, 39, 34], blue: [53, 57, 157], yellow: [249, 198, 39], green: [84, 109, 27], black: [32, 32, 38] };
for (const [k, c] of Object.entries(WOOL)) {
  DRAW[`wool_${k}`] = (px) => {
    const r = rng(c[0] + c[1]);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) px(x, y, shade(c, ((x + y * 3) % 4 === 0 ? 0.9 : 1) * (0.95 + r() * 0.08)));
  };
}

// ── 아이템 그림 ────────────────────────────────────────────
const clear = (px) => { for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) px(x, y, null); };
const ITEM_DRAW = {
  stick: (px) => { clear(px); line(px, 4, 12, 11, 5, [140, 100, 56]); line(px, 4, 13, 12, 5, [96, 68, 36]); },
  coal: (px) => blob(px, [40, 40, 44], [90, 90, 96], 30),
  iron_ingot: (px) => ingot(px, [216, 216, 216], [150, 150, 150]),
  diamond: (px) => {
    clear(px);
    pattern(px, [
      "....dddddd....", "...dlllllcd...", "..dllccccccd..", ".dlcccccccccd.", "dddccccccccddd",
      ".dccccccccccd.", "..dccccccccd...", "...dccccccd...", "....dccccd....", ".....dccd.....", "......dd......",
    ], { d: [20, 120, 120], l: [220, 255, 255], c: [80, 225, 220] }, 1, 3);
  },
  apple: (px) => {
    clear(px);
    pattern(px, [
      ".......b.ll...", "......b.ll....", "..rrrrbrrr....", ".rrhhrrrrrrr..", "rrhhrrrrrrrrr.", "rrhrrrrrrrrrr.",
      "rrrrrrrrrrrrd.", "rrrrrrrrrrrd..", ".rrrrrrrrrdd..", "..rrrrrrrdd...", "...rrddrrd....",
    ], { b: [90, 60, 30], l: [80, 160, 50], r: [210, 30, 40], h: [255, 150, 150], d: [140, 20, 28] }, 1, 2);
  },
  raw_pork: (px) => meat(px, [240, 140, 140], [255, 220, 210], [190, 90, 95]),
  cooked_pork: (px) => meat(px, [200, 130, 80], [240, 210, 160], [130, 75, 40]),
  raw_beef: (px) => meat(px, [200, 50, 50], [250, 220, 220], [130, 25, 30]),
  steak: (px) => meat(px, [130, 76, 40], [190, 140, 90], [80, 44, 22]),
  raw_chicken: (px) => drumstick(px, [245, 200, 180], [200, 150, 130]),
  cooked_chicken: (px) => drumstick(px, [210, 140, 60], [150, 90, 30]),
  rotten_flesh: (px) => meat(px, [130, 120, 60], [170, 90, 70], [80, 80, 40]),
  feather: (px) => {
    clear(px);
    line(px, 3, 13, 12, 3, [210, 210, 210]);
    for (let i = 0; i < 8; i++) { const x = 4 + i, y = 12 - i; px(x - 1, y - 1, [250, 250, 250]); px(x + 1, y + 1, [235, 235, 235]); px(x - 2, y - 1, [250, 250, 250]); }
    px(2, 14, [160, 160, 160]);
  },
  leather: (px) => { clear(px); for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) if (!((x === 3 || x === 12) && (y === 3 || y === 12))) px(x, y, (x + y) % 5 === 0 ? [120, 70, 35] : [150, 90, 45]); },
  bone: (px) => { clear(px); line(px, 4, 11, 11, 4, [235, 230, 215]); line(px, 4, 12, 12, 4, [210, 205, 190]); for (const [x, y] of [[3, 11], [4, 13], [11, 3], [13, 4], [3, 12], [12, 3]]) px(x, y, [240, 236, 222]); },
  arrow: (px) => {
    clear(px);
    line(px, 3, 12, 11, 4, [120, 90, 50]);
    for (const [x, y] of [[12, 3], [11, 3], [12, 4], [13, 2]]) px(x, y, [150, 150, 155]);
    for (const [x, y] of [[2, 12], [3, 13], [2, 13], [1, 13], [2, 14]]) px(x, y, [235, 235, 235]);
  },
  bread: (px) => { clear(px); for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) { const d = Math.hypot((x - 7.5) / 7, (y - 8.5) / 3.6); if (d < 1) px(x, y, d > 0.8 ? [150, 90, 30] : (x % 4 === 1 && y < 8) ? [230, 180, 100] : [200, 135, 55]); } },
  gunpowder: (px) => {
    clear(px);
    const r = rng(31);
    for (let y = 7; y < 15; y++) for (let x = 2; x < 14; x++) {
      const d = Math.hypot((x - 7.5) / 6, (y - 14) / 6.5);
      if (d < 1 && r() < 0.85) px(x, y, r() < 0.3 ? [60, 60, 60] : r() < 0.5 ? [120, 120, 120] : [90, 90, 90]);
    }
  },
};
function blob(px, c, hl, seed) {
  clear(px);
  const r = rng(seed);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const d = Math.hypot((x - 7.5) / 6, (y - 8) / 5.5) + r() * 0.15;
    if (d < 1) px(x, y, d < 0.5 && r() < 0.3 ? hl : shade(c, 0.8 + r() * 0.4));
  }
}
function ingot(px, c, d) {
  clear(px);
  for (let y = 6; y < 12; y++) for (let x = 2 + (11 - y); x < 14 - (y - 6) * 0.3; x++) px(x, y, y === 6 ? shade(c, 1.15) : y === 11 ? d : c);
  line(px, 4, 10, 11, 10, d);
}
function meat(px, c, fat, dark) {
  clear(px);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const d = Math.hypot((x - 7.5) / 6.5, (y - 8) / 4.5);
    if (d < 1) px(x, y, d > 0.82 ? dark : (x + y * 2) % 7 === 0 ? fat : c);
  }
  line(px, 4, 6, 10, 9, fat);
}
function drumstick(px, c, d) {
  clear(px);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const dd = Math.hypot((x - 9) / 5, (y - 6) / 4.5);
    if (dd < 1) px(x, y, dd > 0.8 ? d : c);
  }
  line(px, 3, 12, 6, 9, [240, 235, 220]); line(px, 2, 13, 3, 14, [240, 235, 220]); px(2, 12, [240, 235, 220]); px(4, 14, [240, 235, 220]);
}

// 도구 — 손잡이(갈색) + 머리(재료 색)
const TIER_COLOR = { wooden: [[165, 128, 74], [110, 82, 44]], stone: [[140, 140, 140], [86, 86, 86]], iron: [[230, 230, 230], [150, 150, 150]], diamond: [[90, 235, 225], [30, 150, 145]] };
const HANDLE = [[137, 103, 55], [86, 62, 32]];
const TOOL_PATTERN = {
  pickaxe: [
    "....mmmmmmm.....", "...mlllllllmm...", "..mm.....hm.mm..", ".mm.....hh...mm.", ".m.....hh.....m.",
    "......hh........", ".....hh.........", "....hh..........", "...hh...........", "..hh............", ".hh.............",
  ],
  axe: [
    "........mm......", ".......mllm.....", "......mlllmh....", ".....mlllmhh....", "......mmmhh.....",
    ".......hh.......", "......hh........", ".....hh.........", "....hh..........", "...hh...........", "..hh............",
  ],
  shovel: [
    "..........mmm...", ".........mlllm..", "........mllllm..", "........mlllm...", ".......hmmmm....",
    "......hh........", ".....hh.........", "....hh..........", "...hh...........", "..hh............", ".hh.............",
  ],
  sword: [
    "............mmm.", "...........mlm..", "..........mlm...", ".........mlm....", "........mlm.....",
    ".......mlm......", "..dd..mlm.......", "...ddmlm........", "....dd..........", "...hhdd.........", "..hh..dd........", ".hh.............",
  ],
};
for (const [tier, [c, d]] of Object.entries(TIER_COLOR)) {
  for (const [tool, rows] of Object.entries(TOOL_PATTERN)) {
    ITEM_DRAW[`${tier}_${tool}`] = (px) => {
      clear(px);
      pattern(px, rows, { m: d, l: c, h: HANDLE[0], d: tool === "sword" ? HANDLE[1] : d }, 0, 2);
    };
  }
}

// 방어구 — 0 투구 1 갑옷 2 바지 3 신발
const ARMOR_COLOR = { leather: [[160, 100, 55], [110, 66, 34]], iron: [[225, 225, 228], [150, 150, 156]], diamond: [[95, 230, 220], [35, 150, 150]] };
const ARMOR_PATTERN = [
  ["..mmmmmmmmmm..", ".mllllllllllm.", ".ml........lm.", ".ml........lm.", ".mm........mm."],
  ["mmm......mmm", "mlmmmmmmmmlm", "mlllllllllm.", ".mllllllllm.", ".mllllllllm.", ".mllllllllm.", ".mllllllllm.", ".mmmmmmmmmm."],
  ["mmmmmmmmmm", "mllllllllm", "mllm..mllm", "mllm..mllm", "mllm..mllm", "mllm..mllm", "mmmm..mmmm"],
  ["mmm....mmm", "mlm....mlm", "mlm....mlm", "mllm..mllm", "mmmm..mmmm"],
];
for (const [tier, [c, d]] of Object.entries(ARMOR_COLOR)) {
  ARMOR_PATTERN.forEach((rows, slot) => {
    ITEM_DRAW[`${tier}_armor_${slot}`] = (px) => {
      clear(px);
      const ox = Math.floor((16 - rows[0].length) / 2), oy = Math.floor((16 - rows.length) / 2);
      pattern(px, rows, { m: d, l: c }, ox, oy);
    };
  });
}

// 금 가는 모양 10단계
const CRACK = (stage) => (px) => {
  clear(px);
  const r = rng(77);
  const lines = [];
  for (let i = 0; i < 14; i++) lines.push([r() * 16, r() * 16, r() * Math.PI * 2, 2 + r() * 6]);
  const n = 1 + Math.floor(stage * 1.4);
  for (let i = 0; i < n && i < lines.length; i++) {
    const [x, y, a, len] = lines[i];
    const l = len * (0.6 + stage * 0.06);
    line(px, Math.floor(x), Math.floor(y), Math.floor(x + Math.cos(a) * l), Math.floor(y + Math.sin(a) * l), [20, 20, 20, 200]);
    if (stage > 4) line(px, Math.floor(x + 1), Math.floor(y), Math.floor(x + 1 + Math.cos(a + 0.6) * l * 0.6), Math.floor(y + Math.sin(a + 0.6) * l * 0.6), [30, 30, 30, 170]);
  }
};
for (let s = 0; s < 10; s++) DRAW[`crack_${s}`] = CRACK(s);
Object.assign(DRAW, ITEM_DRAW);

/** 아틀라스 — { canvas, uv(name) → [u0, v0, u1, v1], rect(name) } */
export function buildAtlas() {
  const names = Object.keys(DRAW);
  const rows = Math.ceil(names.length / COLS);
  const canvas = document.createElement("canvas");
  canvas.width = COLS * TILE;
  canvas.height = 2 ** Math.ceil(Math.log2(rows * TILE));
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(canvas.width, canvas.height);
  const where = {};
  names.forEach((name, i) => {
    const ox = (i % COLS) * TILE, oy = Math.floor(i / COLS) * TILE;
    where[name] = [ox, oy];
    DRAW[name]((x, y, c) => {
      if (x < 0 || y < 0 || x >= TILE || y >= TILE) return;
      const p = ((oy + y) * canvas.width + ox + x) * 4;
      if (c) { img.data[p] = c[0]; img.data[p + 1] = c[1]; img.data[p + 2] = c[2]; img.data[p + 3] = c[3] ?? 255; }
      else img.data[p + 3] = 0;
    });
  });
  ctx.putImageData(img, 0, 0);
  const W = canvas.width, H = canvas.height, e = 0.01;
  const atlas = {
    canvas, where,
    /** three.js UV (v 는 아래에서 위로) — px 단위 부분 영역도 가능 */
    uv(name, x0 = 0, y0 = 0, x1 = TILE, y1 = TILE) {
      const [ox, oy] = where[name] ?? where.stone;
      return [(ox + x0 + e) / W, 1 - (oy + y1 - e) / H, (ox + x1 - e) / W, 1 - (oy + y0 + e) / H];
    },
    rect(name) { const [ox, oy] = where[name] ?? where.stone; return [ox, oy, TILE, TILE]; },
  };
  ATLAS = atlas;
  return atlas;
}
let ATLAS = null;

// ── 아이콘 ─────────────────────────────────────────────────
const iconCache = new Map();
/** 아이템 아이콘 data URL (32x32). 블록은 입체 정육면체로 */
export function itemIcon(id) {
  if (iconCache.has(id)) return iconCache.get(id);
  const it = ITEMS[id];
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  const b = it?.block ? BLOCKS[it.block] : null;
  if (b && (b.kind === "solid" || b.kind === "cutout")) {
    const face = (name, f) => {
      const t = document.createElement("canvas");
      t.width = t.height = TILE;
      const tc = t.getContext("2d");
      const [sx, sy] = ATLAS.rect(name);
      tc.drawImage(ATLAS.canvas, sx, sy, TILE, TILE, 0, 0, TILE, TILE);
      const d = tc.getImageData(0, 0, TILE, TILE);
      for (let i = 0; i < d.data.length; i += 4) { d.data[i] *= f; d.data[i + 1] *= f; d.data[i + 2] *= f; }
      tc.putImageData(d, 0, 0);
      return t;
    };
    const [top, , side] = b.tex;
    const front = b.id === 28 ? "furnace_front" : side;
    ctx.setTransform(1, 0.5, -1, 0.5, 16, 1); ctx.drawImage(face(top, 1), 0, 0);
    ctx.setTransform(1, 0.5, 0, 1, 1, 8.5); ctx.drawImage(face(front, 0.82), 0, 0, 15, 15.5);
    ctx.setTransform(1, -0.5, 0, 1, 16, 16); ctx.drawImage(face(side, 0.62), 0, 0, 15, 15.5);
  } else {
    const name = it?.icon ?? (b ? b.tex[2] : "stone");
    const [sx, sy] = ATLAS.rect(name);
    ctx.drawImage(ATLAS.canvas, sx, sy, TILE, TILE, 0, 0, 32, 32);
  }
  const url = c.toDataURL();
  iconCache.set(id, url);
  return url;
}

/** 아이템을 그린 아틀라스 칸 이름 (손에 든 아이템 · 떨어진 아이템) */
export const itemTile = (id) => ITEMS[id]?.icon ?? BLOCKS[ITEMS[id]?.block]?.tex[2] ?? "stone";

// ── HUD 아이콘 (9x9) ───────────────────────────────────────
const HUD = {
  heart: [".rr.rr...", "rhrrrrr..", "rhrrrrr..", "rrrrrrr..", ".rrrrr...", "..rrr....", "...r....."],
  half: [".rr......", "rhr......", "rhr......", "rrr......", ".rr......", "..r......", "........."],
  heart_bg: [".kk.kk...", "k..k..k..", "k.....k..", "k.....k..", ".k...k...", "..k.k....", "...k....."],
  food: ["....bbb..", "...bmmmb.", "...bmmmmb", "..bbmmmb.", ".wb.bbb..", "w.w......", ".w......."],
  food_half: ["........", "........", ".....mmb.", "....bmmb.", ".wb.bbb..", "w.w......", ".w......."],
  food_bg: ["....kkk..", "...k...k.", "...k....k", "..kk...k.", ".kk.kkk..", "k.k......", ".k......."],
  air: [".bbb.", "bwccb", "bcccb", "bcccb", ".bbb."],
  armor: ["kkk.kkk..", "kwwkwwk..", "kwwwwwk..", ".kwwwk...", ".kwwwk...", ".kwwwk...", "..kkk...."],
  armor_half: ["kkk......", "kwwk.....", "kwwk.....", ".kwk.....", ".kwk.....", ".kwk.....", "..kk....."],
  armor_bg: ["kkk.kkk..", "k..k..k..", "k.....k..", ".k...k...", ".k...k...", ".k...k...", "..kkk...."],
};
const HUD_PAL = { r: [220, 30, 30], h: [255, 160, 160], k: [40, 20, 20], b: [120, 70, 30], m: [190, 120, 60], w: [240, 235, 220], c: [80, 160, 255] };
const ARMOR_PAL = { k: [40, 40, 50], w: [210, 215, 225] };
export function hudIcon(name) {
  const key = `hud:${name}`;
  if (iconCache.has(key)) return iconCache.get(key);
  const rows = HUD[name];
  const c = document.createElement("canvas");
  c.width = 9; c.height = 7;
  const ctx = c.getContext("2d");
  const pal = name === "air" ? { ...HUD_PAL, b: [40, 90, 200], w: [255, 255, 255] } : name.startsWith("armor") ? ARMOR_PAL : HUD_PAL;
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    const col = pal[ch];
    if (!col || !Array.isArray(col)) return;
    ctx.fillStyle = `rgb(${col.join(",")})`;
    ctx.fillRect(x, y + (name === "air" ? 1 : 0), 1, 1);
  }));
  const url = c.toDataURL();
  iconCache.set(key, url);
  return url;
}

// ── 몹 · 플레이어 몸 그림 ───────────────────────────────────
// 각 그림은 (이름, 가로, 세로, 그리기) — 몸 상자의 면에 붙인다
const SKIN_PAINT = {};
const sp = (name, w, h, fn) => { SKIN_PAINT[name] = { w, h, fn }; };
const fill = (px, w, h, c, vary = 0, seed = 1) => speckle(px, c, vary, seed, w, h);

// 플레이어 — 성별 · 옷(흰 집업 · 남색 작업복 · 관리자 와이셔츠) · 소매 · 머리 모양 · 머리색
const SKIN = [236, 194, 160], SKIN_D = [214, 166, 132];
const HAIR_COLOR = { black: [34, 32, 36], brown: [96, 64, 40], light: [126, 88, 54], blond: [200, 162, 90] };
const NAVY = [30, 52, 98], NAVY_D = [20, 36, 72], WHITE = [230, 232, 236], WHITE_D = [196, 198, 204];
const SHIRT = [244, 244, 248], SHIRT_D = [214, 216, 224], TIE = [22, 22, 26];
const LOGO_BLUE = [40, 84, 176], RED = [220, 40, 50];
const PANTS = { white: [118, 118, 122], navy: [206, 206, 210], admin: [30, 30, 34] };
const FEMALE = ["bob", "long", "pony"];

for (const [cname, h] of Object.entries(HAIR_COLOR)) {
  const hl = shade(h, 1.25);
  sp(`pt_${cname}`, 8, 8, (px) => { fill(px, 8, 8, h, 0.08, 5); px(2, 2, hl); px(5, 4, hl); });
  for (const style of ["short", "part", "buzz", "bob", "long", "pony"]) {
    const f = FEMALE.includes(style);
    // 얼굴 (앞머리 모양이 머리 모양마다 다름)
    sp(`pf_${style}_${cname}`, 8, 8, (px) => {
      fill(px, 8, 8, SKIN, 0.03, 2);
      const rows = style === "buzz" ? 1 : 2;
      for (let y = 0; y < rows; y++) for (let x = 0; x < 8; x++) px(x, y, h);
      if (style === "short") { px(0, 2, h); px(7, 2, h); px(1, 2, h); px(4, 2, h); px(6, 2, h); }
      if (style === "part") { for (let x = 0; x < 5; x++) px(x, 2, h); px(7, 2, h); px(0, 3, h); }
      if (f) { px(0, 2, h); px(1, 2, h); px(6, 2, h); px(7, 2, h); px(0, 3, h); px(7, 3, h); if (style !== "pony") { px(0, 4, h); px(7, 4, h); px(0, 5, h); px(7, 5, h); } }
      px(2, 4, [24, 24, 28]); px(5, 4, [24, 24, 28]);                                   // 눈
      if (f) { px(1, 3, [24, 24, 28]); px(6, 3, [24, 24, 28]); }                        // 속눈썹
      px(3, 6, f ? [200, 80, 90] : [120, 58, 50]); px(4, 6, f ? [200, 80, 90] : [120, 58, 50]);
      px(2, 5, [150, 84, 70]); px(5, 5, [150, 84, 70]);                                 // 웃는 입
      px(1, 5, [244, 170, 160]); px(6, 5, [244, 170, 160]);                             // 볼
    });
    // 옆머리
    sp(`ps_${style}_${cname}`, 8, 8, (px) => {
      fill(px, 8, 8, SKIN, 0.03, 3);
      const top = style === "buzz" ? 2 : 3;
      for (let y = 0; y < top; y++) for (let x = 0; x < 8; x++) px(x, y, h);
      if (f) { const down = style === "pony" ? 5 : 8; for (let y = top; y < down; y++) for (let x = style === "pony" ? 4 : 2; x < 8; x++) px(x, y, h); }
      else for (let y = top; y < 6; y++) for (let x = 5; x < 8; x++) px(x, y, h);
      px(2, 4, SKIN_D);                                                                 // 귀
    });
    // 뒷머리
    sp(`pk_${style}_${cname}`, 8, 8, (px) => {
      fill(px, 8, 8, h, 0.08, 4);
      if (style === "buzz") for (let y = 5; y < 8; y++) for (let x = 0; x < 8; x++) px(x, y, SKIN);
      else if (!f) for (let x = 1; x < 7; x++) px(x, 7, SKIN);
      if (style === "pony") { px(3, 3, [200, 40, 60]); px(4, 3, [200, 40, 60]); }      // 머리끈
    });
  }
}
sp("p_skin", 8, 8, (px) => fill(px, 8, 8, SKIN, 0.03, 5));
sp("p_arm_end", 4, 4, (px) => fill(px, 4, 4, SKIN, 0.03, 16));
sp("hair_tail", 2, 6, (px) => fill(px, 2, 6, [255, 255, 255], 0.06, 18)); // 색은 재질 색으로 곱한다

// 옷 — 앞 · 뒤 · 옆 · 어깨 · 팔(긴팔 · 반팔)
const OUTFIT = {
  white: { c: WHITE, d: WHITE_D, hem: NAVY, hem2: NAVY_D },
  navy: { c: NAVY, d: NAVY_D, hem: NAVY_D, hem2: NAVY_D },
  admin: { c: SHIRT, d: SHIRT_D, hem: TIE, hem2: TIE },
};
sp("o_white_f", 8, 12, (px) => {
  fill(px, 8, 12, WHITE, 0.03, 6);
  px(3, 0, NAVY); px(4, 0, NAVY); px(2, 0, WHITE_D); px(5, 0, WHITE_D); px(3, 1, NAVY_D); px(4, 1, NAVY_D);
  for (let y = 1; y < 10; y++) px(4, y, WHITE_D);
  px(1, 3, LOGO_BLUE); px(2, 3, LOGO_BLUE); px(3, 3, LOGO_BLUE); px(3, 2, RED);
  for (let x = 0; x < 8; x++) { px(x, 10, NAVY); px(x, 11, NAVY_D); }
});
sp("o_navy_f", 8, 12, (px) => {
  fill(px, 8, 12, NAVY, 0.05, 11);
  px(2, 0, NAVY_D); px(5, 0, NAVY_D); px(3, 0, SKIN); px(4, 0, SKIN); px(3, 1, NAVY_D); px(4, 1, NAVY_D);
  px(1, 1, [44, 70, 124]); px(6, 1, [44, 70, 124]);
  for (let y = 2; y < 12; y++) px(4, y, NAVY_D);
  px(1, 3, [240, 240, 244]); px(2, 3, [240, 240, 244]); px(3, 3, [240, 240, 244]); px(3, 2, RED);
  px(1, 8, NAVY_D); px(2, 8, NAVY_D); px(5, 8, NAVY_D); px(6, 8, NAVY_D);
});
sp("o_admin_f", 8, 12, (px) => {
  fill(px, 8, 12, SHIRT, 0.02, 30);
  px(2, 0, SHIRT_D); px(5, 0, SHIRT_D); px(1, 0, SHIRT_D); px(6, 0, SHIRT_D); px(2, 1, SHIRT_D); px(5, 1, SHIRT_D); // 깃
  px(3, 0, TIE); px(4, 0, TIE);                                                                                  // 넥타이 매듭
  for (let y = 1; y < 9; y++) { px(3, y, TIE); px(4, y, y > 6 ? TIE : shade(TIE, 1.6)); }                       // 넥타이
  px(3, 9, TIE);
  for (let y = 2; y < 10; y += 2) px(5, y, SHIRT_D);                                                             // 단추
  for (let x = 0; x < 8; x++) { px(x, 10, [20, 20, 22]); px(x, 11, [30, 30, 34]); }                              // 벨트
  px(3, 10, [190, 190, 196]); px(4, 10, [190, 190, 196]);
});
for (const [o, c] of Object.entries(OUTFIT)) {
  sp(`o_${o}_b`, 8, 12, (px) => { fill(px, 8, 12, c.c, 0.03, 7); for (let x = 2; x < 6; x++) px(x, 0, o === "admin" ? SHIRT_D : NAVY); for (let x = 0; x < 8; x++) { px(x, 10, c.hem); px(x, 11, c.hem2); } });
  sp(`o_${o}_s`, 4, 12, (px) => { fill(px, 4, 12, c.c, 0.03, 8); for (let x = 0; x < 4; x++) { px(x, 10, c.hem); px(x, 11, c.hem2); } });
  sp(`o_${o}_top`, 4, 4, (px) => fill(px, 4, 4, c.c, 0.03, 10));
  sp(`o_${o}_long`, 4, 12, (px) => { fill(px, 4, 12, c.c, 0.03, 9); for (let y = 0; y < 9; y++) px(3, y, c.d); for (let x = 0; x < 4; x++) px(x, 9, c.d); for (let y = 10; y < 12; y++) for (let x = 0; x < 4; x++) px(x, y, SKIN); });
  sp(`o_${o}_short`, 4, 12, (px) => { fill(px, 4, 12, SKIN, 0.03, 12); for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) px(x, y, c.c); for (let x = 0; x < 4; x++) px(x, 4, c.d); px(0, 9, SKIN_D); });
  sp(`lg_${o}`, 4, 12, (px) => {
    const pc = PANTS[o];
    fill(px, 4, 12, pc, 0.05, 17);
    px(3, 0, shade(pc, 0.85));
    for (let y = 10; y < 12; y++) for (let x = 0; x < 4; x++) px(x, y, o === "admin" ? [14, 14, 16] : [36, 30, 28]);
    if (o === "admin") px(1, 10, [80, 80, 90]);                                                                  // 구두 광
  });
}
sp("p_foot", 4, 4, (px) => fill(px, 4, 4, [36, 30, 28], 0.05, 21));

export const HAIR_RGB = HAIR_COLOR;

// 좀비 — 초록 피부, 찢어진 작업복
const ZSKIN = [92, 140, 84], ZSHIRT = [118, 96, 70], ZPANTS = [70, 72, 80];
sp("z_face", 8, 8, (px) => {
  fill(px, 8, 8, ZSKIN, 0.12, 20);
  for (let x = 0; x < 8; x++) px(x, 0, [52, 80, 46]);
  px(1, 3, [20, 30, 20]); px(2, 3, [20, 30, 20]); px(5, 3, [20, 30, 20]); px(6, 3, [20, 30, 20]);
  px(2, 4, [150, 30, 30]); px(5, 4, [150, 30, 30]);
  px(2, 6, [40, 50, 36]); px(3, 6, [40, 50, 36]); px(4, 6, [40, 50, 36]); px(5, 6, [40, 50, 36]);
});
sp("z_head", 8, 8, (px) => fill(px, 8, 8, ZSKIN, 0.12, 21));
sp("z_body", 8, 12, (px) => {
  fill(px, 8, 12, ZSHIRT, 0.12, 22);
  const r = rng(23);
  for (let i = 0; i < 6; i++) px(Math.floor(r() * 8), 6 + Math.floor(r() * 6), ZSKIN);
});
sp("z_arm", 4, 12, (px) => { fill(px, 4, 12, ZSHIRT, 0.12, 24); for (let y = 6; y < 12; y++) for (let x = 0; x < 4; x++) px(x, y, shade(ZSKIN, 0.95)); });
sp("z_leg", 4, 12, (px) => { fill(px, 4, 12, ZPANTS, 0.12, 25); px(1, 11, ZSKIN); px(2, 10, ZSKIN); });

// 돼지
const PIG = [240, 160, 160];
sp("pig", 8, 8, (px) => fill(px, 8, 8, PIG, 0.06, 30));
sp("pig_face", 8, 8, (px) => { fill(px, 8, 8, PIG, 0.06, 31); px(1, 3, [255, 255, 255]); px(2, 3, [30, 30, 30]); px(5, 3, [30, 30, 30]); px(6, 3, [255, 255, 255]); });
sp("pig_snout", 4, 3, (px) => { fill(px, 4, 3, [250, 180, 180], 0.03, 32); px(1, 1, [150, 80, 80]); px(2, 1, [150, 80, 80]); });
// 소
const COW = [80, 56, 40], COWW = [235, 235, 230];
sp("cow", 8, 8, (px) => {
  fill(px, 8, 8, COW, 0.08, 40);
  const r = rng(41);
  for (let i = 0; i < 3; i++) { const cx = r() * 8, cy = r() * 8; for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (Math.hypot(x - cx, y - cy) < 1.8) px(x, y, COWW); }
});
sp("cow_face", 8, 8, (px) => {
  fill(px, 8, 8, COW, 0.08, 42);
  for (let y = 2; y < 8; y++) for (let x = 2; x < 6; x++) px(x, y, COWW);
  px(1, 3, [20, 20, 20]); px(6, 3, [20, 20, 20]);
  for (let x = 2; x < 6; x++) px(x, 7, [200, 160, 150]);
});
sp("horn", 2, 2, (px) => fill(px, 2, 2, [220, 215, 200], 0.03, 43));
// 양
sp("wool", 8, 8, (px) => { const r = rng(50); for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) px(x, y, shade([240, 240, 240], 0.85 + r() * 0.2)); });
sp("sheep_face", 6, 6, (px) => { fill(px, 6, 6, [215, 195, 175], 0.05, 51); px(1, 2, [30, 30, 30]); px(4, 2, [30, 30, 30]); px(2, 4, [170, 140, 130]); px(3, 4, [170, 140, 130]); });
sp("sheep_skin", 6, 6, (px) => fill(px, 6, 6, [215, 195, 175], 0.05, 52));
// 닭
sp("chicken", 6, 6, (px) => fill(px, 6, 6, [250, 250, 250], 0.04, 60));
sp("chicken_face", 4, 6, (px) => { fill(px, 4, 6, [250, 250, 250], 0.04, 61); px(0, 2, [20, 20, 20]); px(3, 2, [20, 20, 20]); });
sp("beak", 4, 2, (px) => fill(px, 4, 2, [240, 170, 40], 0.05, 62));
sp("wattle", 2, 2, (px) => fill(px, 2, 2, [220, 40, 40], 0.05, 63));
sp("chicken_leg", 1, 5, (px) => fill(px, 1, 5, [240, 170, 40], 0.05, 64));
// 폭탄몬 — 둥근 쇠 폭탄 몸 + 화난 눈 + 심지
const BOMB = [52, 56, 66];
sp("bomb", 12, 12, (px) => {
  fill(px, 12, 12, BOMB, 0.1, 70);
  for (let x = 0; x < 12; x++) { px(x, 9, [150, 120, 50]); px(x, 10, [120, 96, 40]); }
  px(1, 1, [100, 106, 120]); px(2, 1, [100, 106, 120]); px(1, 2, [100, 106, 120]);
});
sp("bomb_face", 12, 12, (px) => {
  SKIN_PAINT.bomb.fn(px);
  // 화난 눈썹 + 흰 눈 + 빨간 눈동자
  px(2, 3, [20, 20, 24]); px(3, 4, [20, 20, 24]); px(9, 3, [20, 20, 24]); px(8, 4, [20, 20, 24]);
  for (const ex of [2, 7]) for (let y = 5; y < 7; y++) for (let x = ex; x < ex + 3; x++) px(x, y, [250, 250, 250]);
  px(4, 6, [220, 30, 30]); px(7, 6, [220, 30, 30]);
  for (let x = 4; x < 8; x++) px(x, 8, [20, 20, 24]);
});
sp("bomb_top", 12, 12, (px) => { fill(px, 12, 12, BOMB, 0.1, 71); for (let y = 4; y < 8; y++) for (let x = 4; x < 8; x++) px(x, y, [90, 90, 96]); });
sp("bomb_leg", 4, 4, (px) => fill(px, 4, 4, [30, 32, 38], 0.1, 72));
sp("fuse", 2, 4, (px) => fill(px, 2, 4, [170, 140, 90], 0.1, 73));
sp("spark", 2, 2, (px) => { px(0, 0, [255, 240, 120]); px(1, 0, [255, 160, 40]); px(0, 1, [255, 120, 30]); px(1, 1, [255, 230, 90]); });

// 멧돼지 — 갈색 털, 엄니
const BOAR = [104, 72, 46];
sp("boar", 8, 8, (px) => { fill(px, 8, 8, BOAR, 0.14, 80); for (let x = 0; x < 8; x++) px(x, 0, [70, 46, 28]); });
sp("boar_face", 8, 8, (px) => { fill(px, 8, 8, BOAR, 0.1, 81); px(1, 2, [240, 200, 60]); px(2, 2, [20, 10, 10]); px(5, 2, [20, 10, 10]); px(6, 2, [240, 200, 60]); });
sp("boar_snout", 4, 3, (px) => { fill(px, 4, 3, [150, 105, 80], 0.05, 82); px(1, 1, [60, 30, 20]); px(2, 1, [60, 30, 20]); });
sp("tusk", 1, 2, (px) => fill(px, 1, 2, [245, 240, 220], 0.02, 83));
// 해골 궁수 — 뼈 + 낡은 두건 망토
const BONE = [222, 218, 200], CLOAK = [64, 58, 78];
sp("s_face", 8, 8, (px) => {
  fill(px, 8, 8, BONE, 0.05, 90);
  for (let x = 0; x < 8; x++) { px(x, 0, CLOAK); px(x, 1, CLOAK); }
  px(0, 2, CLOAK); px(7, 2, CLOAK);
  px(1, 3, [20, 20, 30]); px(2, 3, [20, 20, 30]); px(5, 3, [20, 20, 30]); px(6, 3, [20, 20, 30]);
  px(2, 3, [120, 220, 255]); px(5, 3, [120, 220, 255]);
  px(3, 5, [60, 56, 50]); px(4, 5, [60, 56, 50]);
  for (let x = 1; x < 7; x += 2) px(x, 6, [60, 56, 50]);
});
sp("s_head", 8, 8, (px) => fill(px, 8, 8, CLOAK, 0.1, 91));
sp("s_body", 8, 12, (px) => {
  fill(px, 8, 12, CLOAK, 0.1, 92);
  for (let y = 2; y < 10; y += 2) for (let x = 2; x < 6; x++) px(x, y, BONE);
  for (let y = 1; y < 11; y++) px(4, y, shade(BONE, 0.85));
});
sp("s_arm", 2, 12, (px) => { fill(px, 2, 12, BONE, 0.06, 93); for (let y = 0; y < 4; y++) { px(0, y, CLOAK); px(1, y, CLOAK); } });
sp("s_leg", 2, 12, (px) => { fill(px, 2, 12, BONE, 0.06, 94); px(0, 11, shade(BONE, 0.7)); });
sp("bow", 2, 16, (px) => { for (let y = 0; y < 16; y++) px(0, y, [120, 80, 40]); for (let y = 1; y < 15; y++) px(1, y, [230, 230, 230]); });
sp("arrow", 1, 8, (px) => { fill(px, 1, 8, [120, 90, 50], 0.05, 95); px(0, 0, [170, 170, 175]); px(0, 7, [240, 240, 240]); });
// 방어구 덧입기 (색은 재질별로 곱한다)
sp("armor", 8, 8, (px) => { fill(px, 8, 8, [235, 235, 235], 0.06, 96); for (let x = 0; x < 8; x++) { px(x, 0, [180, 180, 180]); px(x, 7, [180, 180, 180]); } });
sp("shadow", 16, 16, (px) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x - 7.5, y - 7.5) / 8; if (d < 1) px(x, y, [0, 0, 0, Math.round((1 - d * d) * 150)]); } });

/** 몸 그림 아틀라스 — { canvas, uv(name) } */
export function buildSkins() {
  const S = 512;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(S, S);
  const where = {};
  let x = 0, y = 0, rowH = 0;
  for (const [name, { w, h, fn }] of Object.entries(SKIN_PAINT)) {
    if (x + w + 1 > S) { x = 0; y += rowH + 1; rowH = 0; }
    where[name] = [x, y, w, h];
    if (y + h > S) console.warn("몸 그림 아틀라스가 가득 찼습니다:", name);
    const ox = x, oy = y;
    fn((px, py, c) => {
      if (!c || px < 0 || py < 0 || px >= w || py >= h) return;
      const p = ((oy + py) * S + ox + px) * 4;
      img.data[p] = c[0]; img.data[p + 1] = c[1]; img.data[p + 2] = c[2]; img.data[p + 3] = c[3] ?? 255;
    });
    x += w + 1;
    rowH = Math.max(rowH, h);
  }
  ctx.putImageData(img, 0, 0);
  const e = 0.02;
  return {
    canvas,
    uv(name) {
      const [ox, oy, w, h] = where[name] ?? where.pig;
      return [(ox + e) / S, 1 - (oy + h - e) / S, (ox + w - e) / S, 1 - (oy + e) / S];
    },
  };
}

export { hex };
