// 지형 생성기 — 같은 시드(seed)면 서버와 모든 브라우저에서 똑같은 세상이 나온다.
// 그래서 서버는 '사람이 바꾼 블록'만 저장하고 보내면 된다.
//   지형: 평원 · 숲 · 자작나무숲 · 눈 덮인 침엽수림 · 사막 · 산 · 바다 · 강 · 호수 · 해변
//   땅속: 동굴 · 협곡 · 용암 호수 · 광석(석탄 · 철 · 다이아몬드) · 기반암

export const CHUNK = 16;       // 청크 가로 · 세로
export const HEIGHT = 96;      // 세상 높이 (y 0 ~ 95)
export const SEA = 32;         // 바다 높이
export const LAVA_LEVEL = 10;  // 이 높이 아래 동굴은 용암으로 찬다

// 블록 번호 (shared/blocks.js 와 같다)
const GRASS = 1, DIRT = 2, STONE = 3, SAND = 5, LOG = 6, LEAVES = 7, WATER = 10;
const BEDROCK = 12, SNOW = 13, COAL = 14, IRON = 15, GRAVEL = 16, DIAMOND = 30;
const TALL_GRASS = 31, FLOWER_Y = 32, FLOWER_R = 33, LAVA = 35, CACTUS = 36;
const BIRCH_LOG = 37, BIRCH_LEAVES = 38, SPRUCE_LOG = 39, SPRUCE_LEAVES = 40, SANDSTONE = 41, DEAD_BUSH = 42, OBSIDIAN = 43;

export const index = (x, y, z) => (y * CHUNK + z) * CHUNK + x;

// ── 노이즈 ─────────────────────────────────────────────────
function hash3(x, y, z, seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483647) ^ Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296; // 0 ~ 1
}
const hash2 = (x, z, seed) => hash3(x, 0, z, seed);
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/** 부드러운 2D 노이즈 (-1 ~ 1) */
function noise2(x, z, seed) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const tx = fade(x - xi), tz = fade(z - zi);
  const a = hash2(xi, zi, seed), b = hash2(xi + 1, zi, seed);
  const c = hash2(xi, zi + 1, seed), d = hash2(xi + 1, zi + 1, seed);
  return lerp(lerp(a, b, tx), lerp(c, d, tx), tz) * 2 - 1;
}

function fbm(x, z, seed, octaves) {
  let sum = 0, amp = 1, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise2(x * freq, z * freq, seed + i * 1013) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/** 부드러운 3D 노이즈 (-1 ~ 1) — 동굴용 */
function noise3(x, y, z, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const tx = fade(x - xi), ty = fade(y - yi), tz = fade(z - zi);
  const h = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz, seed);
  const x00 = lerp(h(0, 0, 0), h(1, 0, 0), tx), x10 = lerp(h(0, 1, 0), h(1, 1, 0), tx);
  const x01 = lerp(h(0, 0, 1), h(1, 0, 1), tx), x11 = lerp(h(0, 1, 1), h(1, 1, 1), tx);
  return lerp(lerp(x00, x10, ty), lerp(x01, x11, ty), tz) * 2 - 1;
}

// ── 바이옴 · 땅 높이 ───────────────────────────────────────
export const BIOME = { PLAINS: 0, FOREST: 1, BIRCH: 2, TAIGA: 3, DESERT: 4, MOUNTAIN: 5 };
export const BIOME_NAME = ["평원", "숲", "자작나무숲", "눈 덮인 침엽수림", "사막", "산"];

/** (x, z) 기둥 정보 — 땅 높이 · 바이옴 · 강 · 협곡 */
export function column(x, z, seed) {
  const t = fbm(x / 420, z / 420, seed + 600, 3);
  const wet = fbm(x / 360 + 50, z / 360 - 80, seed + 700, 3);
  const base = fbm(x / 90, z / 90, seed, 4);
  const mountain = fbm(x / 220 + 100, z / 220 - 50, seed + 77, 3);
  const m = Math.max(0, mountain - 0.12);
  const desert = smooth(0.12, 0.3, t) * smooth(0.05, -0.15, wet); // 0 ~ 1
  let h = SEA + 3 + base * (14 - desert * 8);
  h += m * m * 140 * (1 - desert * 0.7);
  // 강 — 구불구불한 띠를 따라 땅을 바다 높이 아래로 판다
  const rv = Math.abs(fbm(x / 320, z / 320, seed + 900, 3));
  const river = h < SEA + 30 ? smooth(0.045, 0.012, rv) : 0;
  h = lerp(h, SEA - 3 - (river > 0.8 ? 1 : 0), river);
  h = Math.max(4, Math.min(HEIGHT - 10, Math.floor(h)));

  let biome = BIOME.PLAINS;
  if (h >= 66 && m > 0.15) biome = BIOME.MOUNTAIN;
  else if (desert > 0.5) biome = BIOME.DESERT;
  else if (t < -0.22) biome = BIOME.TAIGA;
  else if (wet > 0.18) biome = wet > 0.38 ? BIOME.BIRCH : BIOME.FOREST;

  // 협곡 — 좁고 깊게 갈라진 틈
  const cv = Math.abs(noise2(x / 150, z / 150, seed + 950) + noise2(x / 61, z / 61, seed + 951) * 0.08);
  const ravineMask = noise2(x / 400, z / 400, seed + 952);
  let ravine = 0;
  if (ravineMask > 0.25 && cv < 0.022 && h > SEA + 2) ravine = 1 - cv / 0.022;
  return { h, biome, river, ravine, ravineFloor: Math.floor(6 + hash2(x >> 4, z >> 4, seed + 953) * 10) };
}

/** 땅 높이만 */
export const heightAt = (x, z, seed) => column(x, z, seed).h;

/** 동굴 — 두 노이즈가 동시에 0 근처인 곳을 파낸다(국수 모양 굴) */
export function isCave(x, y, z, h, seed) {
  if (y < 2 || y > h) return false;
  if (h <= SEA + 1 && y > h - 6) return false; // 바다 · 강 · 모래사장 밑은 막아 둔다
  const nearTop = y > h - 4;
  const a = noise3(x / 24, y / 14, z / 24, seed + 301);
  const b = noise3(x / 24, y / 14, z / 24, seed + 302);
  const t = nearTop ? 0.045 : 0.085;
  if (a * a + b * b < t * t * (y < 20 ? 2.2 : 1)) return true;
  if (y < 40) {
    const c = noise3(x / 40, y / 18, z / 40, seed + 303);
    if (c > 0.62 + (nearTop ? 1 : 0)) return true;
  }
  return false;
}

export function surfaceFor(col) {
  if (col.h <= SEA + 1) return SAND;
  if (col.biome === BIOME.DESERT) return SAND;
  if (col.biome === BIOME.TAIGA || col.h >= 72) return SNOW;
  if (col.biome === BIOME.MOUNTAIN && col.h >= 68) return STONE;
  return GRASS;
}

// ── 나무 ───────────────────────────────────────────────────
const TREE_CHANCE = [0.06, 0.55, 0.5, 0.4, 0, 0.08];
/** 5x5 칸마다 한 그루 후보 */
function treeAt(cellX, cellZ, seed) {
  const x = cellX * 5 + 1 + Math.floor(hash2(cellX, cellZ, seed + 11) * 3);
  const z = cellZ * 5 + 1 + Math.floor(hash2(cellX, cellZ, seed + 13) * 3);
  const col = column(x, z, seed);
  const forest = Math.max(0, fbm(cellX / 6, cellZ / 6, seed + 555, 2));
  const chance = TREE_CHANCE[col.biome] * (0.5 + forest);
  if (hash2(cellX, cellZ, seed + 9) > chance) return null;
  const top = surfaceFor(col);
  if ((top !== GRASS && top !== SNOW) || col.h <= SEA + 1 || col.river > 0.2 || col.ravine > 0) return null;
  if (isCave(x, col.h, z, col.h, seed) || isCave(x, col.h - 1, z, col.h, seed)) return null;
  const r = hash2(x, z, seed + 17);
  let kind = "oak";
  if (col.biome === BIOME.TAIGA || top === SNOW) kind = "spruce";
  else if (col.biome === BIOME.BIRCH) kind = r < 0.7 ? "birch" : "oak";
  else if (col.biome === BIOME.FOREST) kind = r < 0.15 ? "big" : r < 0.35 ? "birch" : "oak";
  const trunk = kind === "big" ? 7 + Math.floor(r * 3) : kind === "spruce" ? 6 + Math.floor(r * 4) : kind === "birch" ? 5 + Math.floor(r * 3) : 4 + Math.floor(r * 3);
  return { x, z, base: col.h, trunk, kind };
}

/** 사막 선인장 · 마른 덤불, 평원 풀 · 꽃 */
function decorate(data, x, h, z, wx, wz, col, seed) {
  if (h + 1 >= HEIGHT) return;
  const top = data[index(x, h, z)];
  const g = hash2(wx, wz, seed + 41);
  if (top === SAND && col.biome === BIOME.DESERT && h > SEA + 1) {
    if (g < 0.006) { const n = 1 + Math.floor(hash2(wx, wz, seed + 42) * 3); for (let i = 1; i <= n && h + i < HEIGHT; i++) data[index(x, h + i, z)] = CACTUS; }
    else if (g < 0.016) data[index(x, h + 1, z)] = DEAD_BUSH;
    return;
  }
  if (top !== GRASS) return;
  const meadow = fbm(wx / 40, wz / 40, seed + 43, 2);
  const grassy = col.biome === BIOME.PLAINS ? 0.18 : 0.08;
  if (g < grassy + Math.max(0, meadow) * 0.35) data[index(x, h + 1, z)] = TALL_GRASS;
  else if (g > (col.biome === BIOME.PLAINS ? 0.985 : 0.995)) data[index(x, h + 1, z)] = hash2(wx, wz, seed + 47) < 0.5 ? FLOWER_Y : FLOWER_R;
}

// ── 청크 만들기 ────────────────────────────────────────────
/** (cx, cz) 청크의 블록 배열 — 크기 16 x 96 x 16 */
export function generateChunk(cx, cz, seed) {
  const data = new Uint8Array(CHUNK * CHUNK * HEIGHT);
  const ox = cx * CHUNK, oz = cz * CHUNK;

  for (let z = 0; z < CHUNK; z++) {
    for (let x = 0; x < CHUNK; x++) {
      const wx = ox + x, wz = oz + z;
      const col = column(wx, wz, seed);
      const h = col.h;
      const top = surfaceFor(col);
      const desert = col.biome === BIOME.DESERT;
      const rFloor = col.ravine > 0 ? Math.max(col.ravineFloor, Math.floor(h - col.ravine * (h - col.ravineFloor))) : HEIGHT;
      for (let y = 0; y <= Math.max(h, SEA); y++) {
        let b;
        if (y === 0 || (y <= 3 && hash3(wx, y, wz, seed + 5) < 0.5 / y)) b = BEDROCK;
        else if (y > h) b = WATER;
        else if (y >= rFloor) b = y <= LAVA_LEVEL ? LAVA : 0;
        else if (isCave(wx, y, wz, h, seed)) b = y <= LAVA_LEVEL ? LAVA : 0;
        else if (y === h) b = h < SEA ? (hash2(wx, wz, seed + 3) < 0.3 ? GRAVEL : SAND) : top;
        else if (y > h - 4) b = top === SAND ? SAND : top === STONE ? STONE : DIRT;
        else if (desert && y > h - 8) b = SANDSTONE;
        else {
          b = STONE;
          const r = hash3(wx >> 1, y >> 1, wz >> 1, seed + 21), r2 = hash3(wx, y, wz, seed + 22);
          if (y < 80 && r < 0.03 && r2 < 0.55) b = COAL;
          else if (y < 48 && r > 0.975 && r2 < 0.5) b = IRON;
          else if (y < 16 && r2 < 0.0016) b = DIAMOND;
          else if (y < 30 && r2 > 0.998) b = GRAVEL;
          else if (y < 6 && r2 > 0.994) b = OBSIDIAN;
        }
        data[index(x, y, z)] = b;
      }
      if (col.ravine === 0) decorate(data, x, h, z, wx, wz, col, seed);
    }
  }

  // 나무 — 이웃 청크에 뿌리를 둔 나무의 잎도 이 청크 안에 들어오면 그린다
  const M = 4;
  const c0x = Math.floor((ox - M) / 5), c1x = Math.floor((ox + CHUNK + M) / 5);
  const c0z = Math.floor((oz - M) / 5), c1z = Math.floor((oz + CHUNK + M) / 5);
  const put = (wx, y, wz, b) => {
    const lx = wx - ox, lz = wz - oz;
    if (lx < 0 || lx >= CHUNK || lz < 0 || lz >= CHUNK || y < 0 || y >= HEIGHT) return;
    const cur = data[index(lx, y, lz)];
    if (cur === 0 || cur === TALL_GRASS || cur === FLOWER_Y || cur === FLOWER_R) data[index(lx, y, lz)] = b;
  };
  for (let cellZ = c0z; cellZ <= c1z; cellZ++) {
    for (let cellX = c0x; cellX <= c1x; cellX++) {
      const t = treeAt(cellX, cellZ, seed);
      if (!t) continue;
      const topY = t.base + t.trunk;
      const log = t.kind === "birch" ? BIRCH_LOG : t.kind === "spruce" ? SPRUCE_LOG : LOG;
      const leaf = t.kind === "birch" ? BIRCH_LEAVES : t.kind === "spruce" ? SPRUCE_LEAVES : LEAVES;
      if (t.kind === "spruce") {
        put(t.x, topY + 1, t.z, leaf);
        for (let dy = 0; dy >= -(t.trunk - 2); dy--) {
          const r = Math.min(3, Math.floor(-dy / 2) + ((-dy) % 2));
          for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
            if (Math.abs(dx) + Math.abs(dz) > r + 1) continue;
            put(t.x + dx, topY + dy, t.z + dz, leaf);
          }
        }
      } else {
        const big = t.kind === "big";
        for (let dy = big ? -3 : -2; dy <= 1; dy++) {
          const r = dy >= 0 ? (big ? 2 : 1) : big ? 3 : 2;
          for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
            if (Math.abs(dx) === r && Math.abs(dz) === r && hash3(t.x + dx, topY + dy, t.z + dz, seed) < 0.6) continue;
            put(t.x + dx, topY + dy, t.z + dz, leaf);
          }
        }
      }
      const lx = t.x - ox, lz = t.z - oz;
      if (lx >= 0 && lx < CHUNK && lz >= 0 && lz < CHUNK) {
        const g = data[index(lx, t.base, lz)];
        if (g === GRASS || g === SNOW) data[index(lx, t.base, lz)] = DIRT;
        for (let y = t.base + 1; y <= topY && y < HEIGHT; y++) data[index(lx, y, lz)] = log;
      }
    }
  }
  return data;
}

/** 시작 지점 — (0,0) 근처에서 물 · 사막이 아닌 풀밭을 찾는다 */
export function findSpawn(seed) {
  for (let r = 0; r < 600; r += 4) {
    for (let a = 0; a < 16; a++) {
      const x = Math.round(Math.cos((a / 16) * Math.PI * 2) * r);
      const z = Math.round(Math.sin((a / 16) * Math.PI * 2) * r);
      const col = column(x, z, seed);
      if (col.h > SEA + 1 && col.h < 66 && surfaceFor(col) === 1 && col.river === 0 && col.ravine === 0) return [x + 0.5, col.h + 1, z + 0.5];
    }
  }
  return [0.5, heightAt(0, 0, seed) + 1, 0.5];
}
