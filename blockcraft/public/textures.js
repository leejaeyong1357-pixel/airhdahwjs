// 블록 텍스처 — 그림 파일 없이 코드로 16x16 픽셀 그림을 그려 한 장(아틀라스)에 모은다.
export const TILE = 16;
const COLS = 8;

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
const shade = ([r, g, b], f) => [clamp(r * f), clamp(g * f), clamp(b * f)];

/** 바탕색 + 점 무늬 (vary: 밝기 흔들림 정도) */
function speckle(px, base, vary, seed) {
  const r = rng(seed);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) px(x, y, shade(base, 1 - vary + r() * vary * 2));
}

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
      if (r() < 0.18) px(x, y, null); // 구멍 — 투명
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
  gold_block: (px) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const border = x === 0 || y === 0 || x === 15 || y === 15;
      px(x, y, border ? [210, 160, 30] : shade([250, 210, 60], 0.92 + ((x + y) % 4) * 0.03));
    }
  },
  bookshelf: (px) => {
    const colors = [[150, 40, 40], [40, 80, 150], [50, 120, 50], [180, 150, 60], [100, 50, 120]];
    const r = rng(20);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const shelf = y === 0 || y === 7 || y === 8 || y === 15;
      px(x, y, shelf ? [160, 125, 75] : x === 0 || x === 15 ? [120, 90, 52] : null);
    }
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
    // 남색 바탕에 흰 T
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const border = x === 0 || y === 0 || x === 15 || y === 15;
      const t = (y >= 3 && y <= 5 && x >= 3 && x <= 12) || (x >= 7 && x <= 8 && y >= 3 && y <= 12);
      const dot = x >= 11 && x <= 12 && y >= 2 && y <= 3;
      px(x, y, dot ? [230, 40, 50] : t ? [255, 255, 255] : border ? [12, 30, 70] : [24, 56, 120]);
    }
  },
};

function ore(px, spot, seed) {
  DRAW.stone(px);
  const r = rng(seed);
  for (let i = 0; i < 5; i++) {
    const cx = 2 + Math.floor(r() * 12), cy = 2 + Math.floor(r() * 12);
    px(cx, cy, spot); px(cx + 1, cy, spot); px(cx, cy + 1, shade(spot, 0.8));
  }
}

const WOOL = { white: [234, 236, 237], red: [161, 39, 34], blue: [53, 57, 157], yellow: [249, 198, 39], green: [84, 109, 27], black: [21, 21, 26] };
for (const [k, c] of Object.entries(WOOL)) {
  DRAW[`wool_${k}`] = (px) => {
    const r = rng(c[0] + c[1]);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) px(x, y, shade(c, ((x + y * 3) % 4 === 0 ? 0.9 : 1) * (0.95 + r() * 0.08)));
  };
}

/** 아틀라스 그리기 — { canvas, uv(name) → [u0, v0, u1, v1] } */
export function buildAtlas() {
  const names = Object.keys(DRAW);
  const rows = Math.ceil(names.length / COLS);
  const canvas = document.createElement("canvas");
  canvas.width = COLS * TILE;
  canvas.height = rows * TILE;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(canvas.width, canvas.height);
  const where = {};
  names.forEach((name, i) => {
    const ox = (i % COLS) * TILE, oy = Math.floor(i / COLS) * TILE;
    where[name] = [ox, oy];
    DRAW[name]((x, y, c) => {
      if (x < 0 || y < 0 || x >= TILE || y >= TILE) return;
      const p = ((oy + y) * canvas.width + ox + x) * 4;
      if (c) { img.data[p] = c[0]; img.data[p + 1] = c[1]; img.data[p + 2] = c[2]; img.data[p + 3] = 255; }
      else img.data[p + 3] = 0;
    });
  });
  ctx.putImageData(img, 0, 0);
  const W = canvas.width, H = canvas.height, e = 0.01; // 가장자리 번짐 방지
  return {
    canvas,
    uv(name) {
      const [ox, oy] = where[name] ?? where.stone;
      // three.js 는 v 가 아래에서 위로 — 캔버스는 위에서 아래
      return [(ox + e) / W, 1 - (oy + TILE - e) / H, (ox + TILE - e) / W, 1 - (oy + e) / H];
    },
    /** 아이콘용 — 캔버스 좌표 */
    rect(name) { const [ox, oy] = where[name] ?? where.stone; return [ox, oy, TILE, TILE]; },
  };
}
