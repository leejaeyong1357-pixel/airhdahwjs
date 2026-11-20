// 에보 맵 — 블루 vs 레드 팀전용 고정 맵 (서버 · 브라우저가 같은 코드로 똑같이 만든다)
// 사용자가 올린 제작 참고집(서든에보_제작참고집)의 그림을 기준으로 한 블록 배치.
//
//  좌표 (위에서 본 그림, x → 동쪽, z → 남쪽)                      바닥 높이 y = 40
//
//            z=-22 ┌──────────┐ 블루 리스폰 (x 49~60)
//                  │ ■■■■■    │
//            z=-12 └───┐ ┌문─┘
//     ┌창고(뒤 벽 · 셔터 2 · 간판)┐ 현관 → 외곽 통로 (x 48~51)
//  z=0 │ C04   별관      ▭ledge │ │
//      │        C03         ║ 1문│ │ (z 10~12)
//      │ 낮은    C01══C02    ║    │ │
//      │ 건물                ║    │ │
// z=31 └──────숏 문 (x 24~25)┘    └─┘ z=41
//               │ 숏 통로
//         홀 ── ┘ (삼박)
//          │ 연결부 (꺾임)
//   z=57 레드 리스폰 (x 12~23)
import { CHUNK, HEIGHT, index } from "./worldgen.js";
import { B } from "./blocks.js";

export const FLOOR = 40;        // 사람이 서는 높이
const F = FLOOR - 1;            // 바닥 블록 높이
// 맵 영역 (이 밖은 산으로 둘러싼 배경)
const X0 = -26, X1 = 78, Z0 = -38, Z1 = 82;
const W = X1 - X0 + 1, D = Z1 - Z0 + 1;

/** 팀 리스폰 — 바닥 표시 위, 출구를 바라봄 (yaw 0 = 북쪽(-z), π = 남쪽(+z)) */
export const SPAWNS = {
  red: [[14, 60], [16, 58], [18, 60], [20, 58], [22, 60]].map(([x, z]) => ({ p: [x + 0.5, FLOOR, z + 0.5], yaw: 0 })),
  blue: [[51, -16], [53, -18], [55, -16], [57, -18], [59, -16]].map(([x, z]) => ({ p: [x + 0.5, FLOOR, z + 0.5], yaw: Math.PI })),
};
/** 리스폰 구역 [x0, z0, x1, z1] (무기고는 자기 팀 구역에서만) */
export const ZONES = { red: [12, 57, 23, 64], blue: [49, -22, 60, -13] };
/** 큰 그림(간판) — 브라우저가 판 하나로 그린다. 창고 앞면(z = 0 평면)에 붙음 */
export const DECALS = [{ kind: "sign", x0: 36.5, x1: 45, y0: 43.5, y1: 48.6, z: 0 }];
export const ARENA_INFO = { spawns: SPAWNS, zones: ZONES, decals: DECALS, floor: FLOOR };
export const inZone = (team, x, z) => { const q = ZONES[team]; return !!q && x >= q[0] && x <= q[2] + 1 && z >= q[1] && z <= q[3] + 1; };

let MAP = null;
const at = (x, y, z) => ((y * D) + (z - Z0)) * W + (x - X0);
const inside = (x, z) => x >= X0 && x <= X1 && z >= Z0 && z <= Z1;

function build() {
  const m = new Uint8Array(W * D * HEIGHT);
  const set = (x, y, z, b) => { if (inside(x, z) && y >= 0 && y < HEIGHT) m[at(x, y, z)] = b; };
  const get = (x, y, z) => (inside(x, z) && y >= 0 && y < HEIGHT ? m[at(x, y, z)] : B.BRICK);
  const fill = (x0, y0, z0, x1, y1, z1, b) => {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++)
        for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) set(x, y, z, b);
  };

  // 1) 바탕 — 땅 + 건물 덩어리(벽돌). 열린 곳은 아래에서 파낸다
  const roofH = (x, z) => {
    if (x >= 23 && x <= 47 && z <= -1 && z >= -16) return 51;   // 뒤 창고
    if (x < 0 && x >= -14) return 52;                             // 서쪽 높은 건물
    if (x >= 52 && x <= 64) return 50;                            // 외곽 통로 동쪽 창고
    if (z >= 32 && z <= 54 && x >= 0 && x <= 47) return 49;       // 남쪽 건물 (숏 · 홀)
    return 47;
  };
  for (let z = Z0; z <= Z1; z++) for (let x = X0; x <= X1; x++) {
    set(x, 0, z, B.BEDROCK);
    fill(x, 1, z, x, F - 1, z, B.STONE);
    set(x, F, z, B.CONCRETE_DARK);
    const h = roofH(x, z);
    fill(x, FLOOR, z, x, h - 1, z, B.BRICK);
    set(x, h, z, B.CONCRETE_LIGHT);
  }

  // 2) 열린 마당 (하늘이 보이는 곳)
  const open = (x0, z0, x1, z1, floor = B.YARD) => { fill(x0, FLOOR, z0, x1, HEIGHT - 1, z1, 0); fill(x0, F, z0, x1, F, z1, floor); };
  open(0, 0, 45, 31);       // 중앙 마당
  open(48, -11, 51, 41);    // 외곽 통로
  open(12, 57, 23, 64);     // 레드 리스폰
  open(49, -22, 60, -13);   // 블루 리스폰

  // 3) 실내 (천장 높이 4칸)
  const rooms = [];
  const room = (x0, z0, x1, z1, floor = B.YARD) => {
    fill(x0, FLOOR, z0, x1, FLOOR + 3, z1, 0);
    fill(x0, F, z0, x1, F, z1, floor);
    fill(x0, FLOOR + 4, z0, x1, FLOOR + 4, z1, B.CEILING);
    rooms.push([x0, z0, x1, z1]);
  };
  room(24, 33, 26, 39);                 // 숏 통로 (마당 문에서 남쪽으로)
  room(10, 36, 21, 47);                 // 홀
  room(15, 49, 17, 53);                 // 연결부 1
  room(15, 51, 21, 53);                 // 연결부 2 (동쪽으로 꺾임)
  room(19, 51, 21, 55);                 // 연결부 3 (레드 리스폰 문으로)
  room(52, -11, 60, -9, B.FLOOR_TILE);  // 블루 현관 (서쪽이 통로로 열림)
  room(52, 19, 54, 23, B.FLOOR_TILE);   // 외곽 통로 옆 작은 출입구 (막힌 방)

  // 문 (폭 w, 높이 3) + 밝은 콘크리트 문틀
  const door = (x0, z0, x1, z1, frame = true) => {
    fill(x0, FLOOR, z0, x1, FLOOR + 2, z1, 0);
    if (!frame) return;
    const alongX = x1 - x0 >= z1 - z0 && z0 === z1;
    if (alongX) {
      for (const z of [z0]) { fill(x0 - 1, FLOOR, z, x0 - 1, FLOOR + 3, z, B.CONCRETE_LIGHT); fill(x1 + 1, FLOOR, z, x1 + 1, FLOOR + 3, z, B.CONCRETE_LIGHT); fill(x0 - 1, FLOOR + 3, z, x1 + 1, FLOOR + 3, z, B.CONCRETE_LIGHT); }
    } else {
      for (const x of [x0]) { fill(x, FLOOR, z0 - 1, x, FLOOR + 3, z0 - 1, B.CONCRETE_LIGHT); fill(x, FLOOR, z1 + 1, x, FLOOR + 3, z1 + 1, B.CONCRETE_LIGHT); fill(x, FLOOR + 3, z0 - 1, x, FLOOR + 3, z1 + 1, B.CONCRETE_LIGHT); }
    }
  };
  door(24, 32, 25, 32);          // 숏 문 (마당 남쪽 벽)
  fill(22, FLOOR, 38, 23, FLOOR + 2, 39, 0); // 숏 통로 → 홀 (두꺼운 벽 사이)
  fill(15, FLOOR, 48, 16, FLOOR + 2, 48, 0); // 홀 → 연결부
  door(19, 56, 20, 56);          // 연결부 → 레드 리스폰
  door(57, -12, 58, -12);        // 블루 리스폰 → 현관
  door(46, 10, 47, 12, false);   // 1문 (마당 동쪽 벽, 두께 2)
  fill(46, FLOOR, 10, 47, FLOOR + 3, 12, 0);
  fill(46, FLOOR + 4, 9, 47, FLOOR + 4, 13, B.CONCRETE_LIGHT); fill(46, FLOOR, 9, 47, FLOOR + 3, 9, B.CONCRETE_LIGHT); fill(46, FLOOR, 13, 47, FLOOR + 3, 13, B.CONCRETE_LIGHT);

  // 4) 벽 마감 — 실내에 닿는 벽은 회색 조적벽, 바깥에 닿는 벽 아래는 어두운 기단
  const isAir = (x, y, z) => get(x, y, z) === 0;
  const inRoom = (x, z) => rooms.some(([a, b, c, d]) => x >= a && x <= c && z >= b && z <= d);
  for (let z = Z0 + 1; z < Z1; z++) for (let x = X0 + 1; x < X1; x++) {
    for (let y = FLOOR; y <= FLOOR + 3; y++) {
      if (get(x, y, z) !== B.BRICK) continue;
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dz]) => isAir(x + dx, y, z + dz));
      if (!nb.length) continue;
      const indoor = nb.some(([dx, dz]) => inRoom(x + dx, z + dz));
      if (indoor) set(x, y, z, B.BLOCK_WALL);
      else if (y === FLOOR) set(x, y, z, B.CONCRETE_DARK);
    }
  }

  // 5) 낮은 건물 (마당 남서쪽) — 벽돌 + 밝은 파라펫, 지붕은 평평하게 열림
  fill(0, FLOOR, 17, 12, FLOOR + 3, 31, B.BRICK);
  fill(0, FLOOR, 17, 12, FLOOR, 31, B.CONCRETE_DARK);
  fill(1, FLOOR + 1, 18, 11, FLOOR + 3, 30, B.BRICK);
  fill(0, FLOOR + 4, 17, 12, FLOOR + 5, 31, B.CONCRETE_LIGHT);
  fill(1, FLOOR + 4, 18, 11, FLOOR + 5, 30, 0);
  fill(1, FLOOR + 3, 18, 11, FLOOR + 3, 30, B.CONCRETE_DARK); // 지붕 바닥

  // 6) 뒤쪽 벽 (북쪽) — 서쪽 긴 벽의 창 + 골함석 문 + 별관
  for (let x = 2; x <= 7; x++) for (let y = FLOOR + 4; y <= FLOOR + 5; y++) set(x, y, -1, B.WINDOW);
  fill(9, FLOOR, -1, 14, FLOOR + 3, -1, B.METAL_PANEL);
  fill(9, FLOOR + 4, -1, 14, FLOOR + 4, -1, B.CONCRETE_LIGHT);
  // 별관 (마당으로 튀어나온 낮은 벽돌 건물)
  fill(15, FLOOR, 0, 22, FLOOR + 4, 4, B.BRICK);
  fill(15, FLOOR, 0, 22, FLOOR, 4, B.CONCRETE_DARK);
  fill(15, FLOOR + 5, 0, 22, FLOOR + 5, 4, B.CONCRETE_LIGHT);
  fill(14, FLOOR, 4, 14, FLOOR + 5, 4, B.POLE); // 홈통

  // 7) 창고 앞면 — 기둥 · 셔터 2개 · 창 띠 · 하역장 턱 · 간판 · 벽등
  for (const x of [23, 29, 35]) { fill(x, FLOOR, 0, x, 50, 0, B.BRICK); set(x, FLOOR, 0, B.CONCRETE_DARK); set(x, 51, 0, B.CONCRETE_LIGHT); }
  for (const x0 of [24, 30]) {
    fill(x0, FLOOR, -1, x0 + 3, FLOOR + 3, -1, B.SHUTTER);
    fill(x0 - 1, FLOOR + 4, -1, x0 + 4, FLOOR + 4, -1, B.CONCRETE_LIGHT);
    fill(x0, FLOOR + 6, -1, x0 + 3, FLOOR + 6, -1, B.WINDOW);
  }
  fill(24, FLOOR, 0, 45, FLOOR, 1, B.CONCRETE_LIGHT); // 하역장 턱
  for (const x of [29, 35]) fill(x, FLOOR, 0, x, FLOOR, 1, B.CONCRETE_LIGHT);
  fill(36, 43, -1, 45, 49, -1, B.SIGN);              // 간판 뒤판 (그림은 브라우저가 판으로)
  for (const x of [38, 40, 42, 44]) set(x, 49, 0, B.WALL_LAMP);

  // 8) 마당 동쪽 벽 · 남쪽 벽 마감
  fill(0, FLOOR + 4, 32, 45, FLOOR + 4, 32, B.CONCRETE_LIGHT);              // 남쪽 벽 가로 띠
  for (let x = 2; x <= 22; x++) if (x % 7 !== 0) for (let y = FLOOR + 6; y <= FLOOR + 7; y++) set(x, y, 32, B.WINDOW);
  for (let x = 28; x <= 43; x++) if (x % 8 !== 3) for (let y = FLOOR + 6; y <= FLOOR + 7; y++) set(x, y, 32, B.WINDOW);
  for (let z = 3; z <= 28; z += 1) if (z < 9 || z > 14) if (z % 6 === 4 || z % 6 === 5) for (let y = FLOOR + 3; y <= FLOOR + 5; y++) set(-1, y, z, B.WINDOW); // 서쪽 건물 세로창
  set(24, F, 31, B.CONCRETE_LIGHT); set(25, F, 31, B.CONCRETE_LIGHT); set(24, F, 32, B.CONCRETE_LIGHT); set(25, F, 32, B.CONCRETE_LIGHT); // 숏 문 문턱 (바닥과 같은 높이 — 걸리지 않게)

  // 9) 컨테이너 4개 (C01 ~ C04) — 폭 3 · 높이 3
  const container = (x0, y0, z0, len, alongX, doorEnd = 1) => {
    const x1 = alongX ? x0 + len - 1 : x0 + 2, z1 = alongX ? z0 + 2 : z0 + len - 1;
    for (let y = y0; y <= y0 + 2; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const ex = x === x0 || x === x1, ez = z === z0 || z === z1;
      const end = alongX ? ex : ez;                // 짧은 면
      const corner = ex && ez;
      let b = y === y0 + 2 ? B.CONTAINER_TOP : B.CONTAINER;
      if (corner) b = B.CONTAINER_CORNER;
      else if (end && (alongX ? (doorEnd > 0 ? x === x1 : x === x0) : (doorEnd > 0 ? z === z1 : z === z0))) b = B.CONTAINER_DOOR;
      set(x, y, z, b);
    }
  };
  container(25, FLOOR, 20, 13, true, -1);       // C01 앞쪽 오른편 긴 하단
  container(35, FLOOR + 3, 13, 10, false, -1);  // C02 C01 동쪽 끝 위에 직각으로
  container(19, FLOOR, 11, 9, true);            // C03 가운데
  container(6, FLOOR, 5, 9, true, -1);          // C04 뒤편 왼쪽

  // 10) 바닥 옅은 선 · 드럼통
  for (let x = 14; x <= 18; x++) set(x, F, 8, B.YARD_LINE_X);
  for (let x = 13; x <= 33; x++) set(x, F, 16, B.YARD_LINE_X);
  for (let x = 13; x <= 23; x++) set(x, F, 26, B.YARD_LINE_X);
  set(33, FLOOR, 2, B.DRUM); set(34, FLOOR, 2, B.DRUM); set(34, FLOOR + 1, 2, B.DRUM);
  set(14, FLOOR, 29, B.DRUM);
  set(44, FLOOR, 30, B.DRUM); set(44, FLOOR, 29, B.DRUM);

  // 11) 외곽 통로 (1문 연결) — 골함석 끝 문, 녹색 수거함, 가로등, 옆 출입구 계단
  fill(48, FLOOR, -12, 51, FLOOR + 5, -12, B.METAL_PANEL);
  fill(48, FLOOR, 42, 51, FLOOR + 5, 42, B.METAL_PANEL);
  set(51, FLOOR, 30, B.DUMPSTER); set(51, FLOOR, 31, B.DUMPSTER);
  set(51, FLOOR, 2, B.DUMPSTER);
  fill(48, FLOOR, 0, 48, FLOOR + 5, 0, B.POLE); set(48, FLOOR + 6, 0, B.WALL_LAMP);
  fill(48, FLOOR, 24, 48, FLOOR + 5, 24, B.POLE); set(48, FLOOR + 6, 24, B.WALL_LAMP);
  fill(52, FLOOR, 20, 52, FLOOR + 2, 22, 0);                                   // 옆 출입구 (작은 방)
  fill(52, FLOOR + 3, 19, 52, FLOOR + 3, 23, B.CONCRETE_LIGHT); fill(52, FLOOR, 19, 52, FLOOR + 2, 19, B.CONCRETE_LIGHT); fill(52, FLOOR, 23, 52, FLOOR + 2, 23, B.CONCRETE_LIGHT);
  set(51, FLOOR, 20, B.CONCRETE_LIGHT); set(51, FLOOR, 22, B.CONCRETE_LIGHT);  // 계단 양옆 턱
  for (let z = -6; z <= 38; z++) if (z % 7 === 0 || z % 7 === 1) for (let y = FLOOR + 6; y <= FLOOR + 7; y++) set(52, y, z, B.WINDOW);
  for (let z = -6; z <= 38; z++) if (z % 9 === 3) for (let y = FLOOR + 5; y <= FLOOR + 6; y++) set(47, y, z, B.WINDOW);

  // 12) 레드 리스폰 — 창 띠, 드럼통, 무기고, 바닥 표시
  for (let z = 58; z <= 63; z++) for (let y = FLOOR + 4; y <= FLOOR + 5; y++) set(11, y, z, B.WINDOW);
  for (let x = 13; x <= 22; x++) if (x % 3 !== 0) for (let y = FLOOR + 4; y <= FLOOR + 5; y++) set(x, y, 65, B.WINDOW);
  set(23, FLOOR, 64, B.DRUM); set(23, FLOOR + 1, 64, B.DRUM); set(22, FLOOR, 64, B.DRUM);
  fill(12, FLOOR, 63, 12, FLOOR + 1, 64, B.ARMORY);
  for (const s of SPAWNS.red) set(Math.floor(s.p[0]), F, Math.floor(s.p[2]), B.SPAWN_RED);
  set(13, FLOOR + 4, 57, B.WALL_LAMP); set(22, FLOOR + 4, 57, B.WALL_LAMP);

  // 13) 블루 리스폰 — 셔터, 창 띠, 녹색 수거함, 무기고, 바닥 표시
  fill(61, FLOOR, -20, 61, FLOOR + 3, -17, B.SHUTTER); fill(61, FLOOR + 4, -21, 61, FLOOR + 4, -16, B.CONCRETE_LIGHT);
  for (let x = 51; x <= 58; x++) for (let y = FLOOR + 4; y <= FLOOR + 5; y++) set(x, y, -23, B.WINDOW);
  set(59, FLOOR, -22, B.DUMPSTER); set(60, FLOOR, -22, B.DUMPSTER);
  fill(49, FLOOR, -22, 49, FLOOR + 1, -21, B.ARMORY);
  for (const s of SPAWNS.blue) set(Math.floor(s.p[0]), F, Math.floor(s.p[2]), B.SPAWN_BLUE);

  // 14) 실내 — 홀 삼박(나무 상자 3개), 형광등, 숏 통로 상자
  set(11, FLOOR, 46, B.CRATE); set(12, FLOOR, 46, B.CRATE); set(11, FLOOR + 1, 46, B.CRATE);
  set(20, FLOOR, 37, B.CRATE);
  set(26, FLOOR, 33, B.CRATE);
  set(60, FLOOR, -9, B.CRATE); set(60, FLOOR + 1, -9, B.CRATE);
  for (const [x, z] of [[25, 34], [25, 37], [12, 37], [16, 37], [20, 38], [12, 41], [16, 41], [20, 42], [12, 45], [16, 45], [20, 46], [16, 50], [18, 52], [20, 54], [54, -10], [58, -10], [53, 21]]) set(x, FLOOR + 4, z, B.LAMP);

  MAP = m;
}

// 맵 밖 배경 — 둘러싼 산 (노이즈)
function hash(x, z) { let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi;
  const s = (t) => t * t * (3 - 2 * t);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * s(fx) + (c - a) * s(fz) + (a - b - c + d) * s(fx) * s(fz);
}
function mountainH(x, z) {
  const dx = Math.max(X0 - x, 0, x - X1), dz = Math.max(Z0 - z, 0, z - Z1);
  const d = Math.hypot(dx, dz);
  const n = vnoise(x / 40, z / 40) * 0.6 + vnoise(x / 14, z / 14) * 0.3 + vnoise(x / 6, z / 6) * 0.1;
  return Math.min(HEIGHT - 4, Math.floor(42 + Math.min(1, d / 50) * (24 + n * 34) + n * 4));
}

/** 에보 맵 청크 */
export function arenaChunk(cx, cz) {
  if (!MAP) build();
  const data = new Uint8Array(CHUNK * CHUNK * HEIGHT);
  for (let z = 0; z < CHUNK; z++) for (let x = 0; x < CHUNK; x++) {
    const wx = cx * CHUNK + x, wz = cz * CHUNK + z;
    if (inside(wx, wz)) {
      for (let y = 0; y < HEIGHT; y++) data[index(x, y, z)] = MAP[at(wx, y, wz)];
      continue;
    }
    const h = mountainH(wx, wz);
    const steep = Math.abs(mountainH(wx + 2, wz) - h) + Math.abs(mountainH(wx, wz + 2) - h) > 5;
    data[index(x, 0, z)] = B.BEDROCK;
    for (let y = 1; y <= h; y++) data[index(x, y, z)] = y === h ? (steep ? B.STONE : B.GRASS) : y > h - 3 && !steep ? B.DIRT : B.STONE;
    // 드문드문 가문비나무
    if (!steep && h < 80 && hash(wx * 3, wz * 7) < 0.02) {
      for (let y = h + 1; y <= h + 5 && y < HEIGHT; y++) data[index(x, y, z)] = B.SPRUCE_LOG;
    }
  }
  // 나무 잎 (이웃 칸에 있는 나무 줄기 둘레)
  for (let z = 0; z < CHUNK; z++) for (let x = 0; x < CHUNK; x++) {
    const wx = cx * CHUNK + x, wz = cz * CHUNK + z;
    if (inside(wx, wz)) continue;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const tx = wx + dx, tz = wz + dz;
      if (inside(tx, tz)) continue;
      const th = mountainH(tx, tz);
      const steep = Math.abs(mountainH(tx + 2, tz) - th) + Math.abs(mountainH(tx, tz + 2) - th) > 5;
      if (steep || th >= 80 || hash(tx * 3, tz * 7) >= 0.02) continue;
      const r = Math.abs(dx) + Math.abs(dz);
      for (let y = th + 3; y <= th + 7 && y < HEIGHT; y++) {
        const lr = y >= th + 6 ? 1 : 2;
        if (r <= lr && !(dx === 0 && dz === 0 && y <= th + 5) && data[index(x, y, z)] === 0) data[index(x, y, z)] = B.SPRUCE_LEAVES;
      }
    }
  }
  return data;
}
