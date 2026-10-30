// 지형 생성기 — 같은 시드(seed)면 서버와 모든 브라우저에서 똑같은 세상이 나온다.
// 그래서 서버는 '사람이 바꾼 블록'만 저장하고 보내면 된다.

export const CHUNK = 16;       // 청크 가로 · 세로
export const HEIGHT = 96;      // 세상 높이 (y 0 ~ 95)
export const SEA = 32;         // 바다 높이

// 블록 번호 (shared/blocks.js 와 같다)
const GRASS = 1, DIRT = 2, STONE = 3, SAND = 5, LOG = 6, LEAVES = 7, WATER = 10;
const BEDROCK = 12, SNOW = 13, COAL = 14, IRON = 15, GRAVEL = 16;

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

// ── 지형 높이 ──────────────────────────────────────────────
/** (x, z) 기둥의 땅 높이 — 그 높이까지 블록이 찬다 */
export function heightAt(x, z, seed) {
  const base = fbm(x / 90, z / 90, seed, 4);
  let h = SEA + 3 + base * 14;
  const mountain = fbm(x / 220 + 100, z / 220 - 50, seed + 77, 3);
  const m = Math.max(0, mountain - 0.12);
  h += m * m * 140;
  return Math.max(4, Math.min(HEIGHT - 10, Math.floor(h)));
}

const topBlockFor = (h) => (h <= SEA + 1 ? SAND : h >= 72 ? SNOW : GRASS);

/** 나무 — 5x5 칸마다 한 그루 후보, 숲이 짙은 곳일수록 많이 */
function treeAt(cellX, cellZ, seed) {
  const forest = fbm(cellX / 6, cellZ / 6, seed + 555, 2); // -1 ~ 1
  const chance = 0.08 + Math.max(0, forest) * 0.9;
  if (hash2(cellX, cellZ, seed + 9) > chance) return null;
  const x = cellX * 5 + 1 + Math.floor(hash2(cellX, cellZ, seed + 11) * 3);
  const z = cellZ * 5 + 1 + Math.floor(hash2(cellX, cellZ, seed + 13) * 3);
  const h = heightAt(x, z, seed);
  if (topBlockFor(h) !== GRASS || h <= SEA + 1) return null;
  const trunk = 4 + Math.floor(hash2(x, z, seed + 17) * 3);
  return { x, z, base: h, trunk };
}

// ── 청크 만들기 ────────────────────────────────────────────
/** (cx, cz) 청크의 블록 배열 — 크기 16 x 96 x 16 */
export function generateChunk(cx, cz, seed) {
  const data = new Uint8Array(CHUNK * CHUNK * HEIGHT);
  const ox = cx * CHUNK, oz = cz * CHUNK;

  for (let z = 0; z < CHUNK; z++) {
    for (let x = 0; x < CHUNK; x++) {
      const wx = ox + x, wz = oz + z;
      const h = heightAt(wx, wz, seed);
      const top = topBlockFor(h);
      for (let y = 0; y <= Math.max(h, SEA); y++) {
        let b;
        if (y === 0) b = BEDROCK;
        else if (y > h) b = WATER;
        else if (y === h) b = h < SEA ? (hash2(wx, wz, seed + 3) < 0.3 ? GRAVEL : SAND) : top;
        else if (y > h - 4) b = top === SAND ? SAND : DIRT;
        else {
          b = STONE;
          const r = hash3(wx, y, wz, seed + 21);
          if (y < 64 && r < 0.012) b = COAL;
          else if (y < 40 && r < 0.018) b = IRON;
        }
        data[index(x, y, z)] = b;
      }
    }
  }

  // 나무 — 이웃 청크에 뿌리를 둔 나무의 잎도 이 청크 안에 들어오면 그린다
  const c0x = Math.floor((ox - 3) / 5), c1x = Math.floor((ox + CHUNK + 3) / 5);
  const c0z = Math.floor((oz - 3) / 5), c1z = Math.floor((oz + CHUNK + 3) / 5);
  for (let cellZ = c0z; cellZ <= c1z; cellZ++) {
    for (let cellX = c0x; cellX <= c1x; cellX++) {
      const t = treeAt(cellX, cellZ, seed);
      if (!t) continue;
      const topY = t.base + t.trunk;
      // 잎
      for (let dy = -2; dy <= 1; dy++) {
        const r = dy >= 0 ? 1 : 2;
        for (let dz = -r; dz <= r; dz++) {
          for (let dx = -r; dx <= r; dx++) {
            if (r === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2 && hash3(t.x + dx, topY + dy, t.z + dz, seed) < 0.6) continue;
            const lx = t.x + dx - ox, lz = t.z + dz - oz, y = topY + dy;
            if (lx < 0 || lx >= CHUNK || lz < 0 || lz >= CHUNK || y >= HEIGHT) continue;
            if (data[index(lx, y, lz)] === 0) data[index(lx, y, lz)] = LEAVES;
          }
        }
      }
      // 줄기
      const lx = t.x - ox, lz = t.z - oz;
      if (lx >= 0 && lx < CHUNK && lz >= 0 && lz < CHUNK) {
        for (let y = t.base + 1; y <= topY && y < HEIGHT; y++) data[index(lx, y, lz)] = LOG;
      }
    }
  }
  return data;
}

/** 시작 지점 — (0,0) 근처에서 물이 아닌 땅을 찾는다 */
export function findSpawn(seed) {
  for (let r = 0; r < 400; r += 4) {
    for (let a = 0; a < 16; a++) {
      const x = Math.round(Math.cos((a / 16) * Math.PI * 2) * r);
      const z = Math.round(Math.sin((a / 16) * Math.PI * 2) * r);
      const h = heightAt(x, z, seed);
      if (h > SEA + 1 && h < 70) return [x + 0.5, h + 1, z + 0.5];
    }
  }
  return [0.5, heightAt(0, 0, seed) + 1, 0.5];
}
