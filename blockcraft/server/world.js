// 서버 쪽 월드 — 시드 · 바뀐 블록 · 상자 · 화로 · 시간 · 날씨 · 규칙을 저장하고,
// 몹 · 아이템이 부딪힐 지형을 들고 있다.
import { randomInt } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, copyFileSync, readdirSync, unlinkSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { AIR, B, BLOCKS, isOpaque } from "../shared/blocks.js";
import { CHUNK, HEIGHT, generateChunk, index, findSpawn } from "../shared/worldgen.js";

export const DAY = 24000; // 하루 = 24000틱 = 20분 (1초에 20틱)
const BACKUP_EVERY = 10 * 60_000; // 10분마다 백업
const BACKUP_KEEP = 24;

/** 파일을 안전하게 쓰기 — 임시 파일에 쓴 뒤 바꿔치기 (쓰다가 꺼져도 원래 파일은 남는다) */
export function writeSafe(file, text) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, file);
}

/** 백업 — data/backups/<이름>-<시각>.json, 오래된 것은 지운다 */
export function backup(file, dir) {
  if (!existsSync(file)) return null;
  mkdirSync(dir, { recursive: true });
  const name = basename(file, ".json");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const out = join(dir, `${name}-${stamp}.json`);
  copyFileSync(file, out);
  const list = readdirSync(dir).filter((f) => f.startsWith(`${name}-`) && f.endsWith(".json")).sort();
  while (list.length > BACKUP_KEEP) unlinkSync(join(dir, list.shift()));
  return out;
}

/** 망가진 파일이면 가장 최근 백업에서 읽는다 */
export function readJsonWithBackup(file, dir) {
  if (existsSync(file)) {
    try { return JSON.parse(readFileSync(file, "utf8")); } catch (err) {
      console.error(`!! ${basename(file)} 을 읽지 못했습니다: ${err.message}`);
      copyFileSync(file, `${file}.broken-${Date.now()}`);
    }
  }
  if (existsSync(dir)) {
    const name = basename(file, ".json");
    const list = readdirSync(dir).filter((f) => f.startsWith(`${name}-`) && f.endsWith(".json")).sort().reverse();
    for (const f of list) {
      try {
        const data = JSON.parse(readFileSync(join(dir, f), "utf8"));
        console.error(`   → 백업 ${f} 에서 되살렸습니다.`);
        return data;
      } catch { /* 다음 백업 */ }
    }
  }
  return null;
}

export class World {
  constructor(file, backupDir) {
    this.file = file;
    this.backupDir = backupDir;
    const w = readJsonWithBackup(file, backupDir) ?? { seed: Number(process.env.WORLD_SEED) || randomInt(1, 2_000_000_000), edits: {}, createdAt: new Date().toISOString() };
    w.edits ??= {};
    w.furnaces ??= {};
    w.chests ??= {};
    w.time ??= 1000; // 아침
    w.spawn ??= findSpawn(w.seed);
    w.weather ??= { kind: "clear", left: 900 };
    w.rules ??= {};
    w.rules.keepInventory ??= false;
    w.rules.mobGriefing ??= true;
    w.rules.pvp ??= true;
    this.w = w;
    this.chunks = new Map();
    this.editsByChunk = new Map();
    this.torches = new Set();
    for (const [k, b] of Object.entries(w.edits)) {
      const [x, y, z] = k.split(",").map(Number);
      this.indexEdit(x, y, z, b);
    }
    this.dirty = true;
    this.lastBackup = Date.now();
  }

  get seed() { return this.w.seed; }
  get spawn() { return this.w.spawn; }
  get edits() { return this.w.edits; }
  get furnaces() { return this.w.furnaces; }
  get chests() { return this.w.chests; }
  get rules() { return this.w.rules; }
  get weather() { return this.w.weather.kind; }
  get time() { return this.w.time; }
  set time(t) { this.w.time = ((t % DAY) + DAY) % DAY; }

  /** 0 = 깜깜한 밤 ~ 1 = 한낮 (브라우저와 같은 식) */
  get daylight() {
    const s = Math.sin((this.w.time / DAY) * Math.PI * 2);
    return Math.max(0, Math.min(1, s * 2.2 + 0.45)) * (this.weather === "clear" ? 1 : 0.6);
  }
  get isNight() { return this.w.time > 12800 && this.w.time < 23200; }

  indexEdit(x, y, z, b) {
    const k = ckey(Math.floor(x / CHUNK), Math.floor(z / CHUNK));
    let list = this.editsByChunk.get(k);
    if (!list) this.editsByChunk.set(k, (list = new Map()));
    list.set(`${x},${y},${z}`, b);
    if (b === B.TORCH) this.torches.add(`${x},${y},${z}`);
    else this.torches.delete(`${x},${y},${z}`);
  }

  chunk(cx, cz) {
    const k = ckey(cx, cz);
    let c = this.chunks.get(k);
    if (!c) {
      c = generateChunk(cx, cz, this.w.seed);
      const edits = this.editsByChunk.get(k);
      if (edits) for (const [pos, b] of edits) {
        const [x, y, z] = pos.split(",").map(Number);
        c[index(x - cx * CHUNK, y, z - cz * CHUNK)] = b;
      }
      this.chunks.set(k, c);
    }
    return c;
  }

  get(x, y, z) {
    if (y < 0) return B.BEDROCK;
    if (y >= HEIGHT) return AIR;
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    return this.chunk(cx, cz)[index(x - cx * CHUNK, y, z - cz * CHUNK)];
  }

  set(x, y, z, b) {
    if (y < 0 || y >= HEIGHT) return;
    this.w.edits[`${x},${y},${z}`] = b;
    this.indexEdit(x, y, z, b);
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const c = this.chunks.get(ckey(cx, cz));
    if (c) c[index(x - cx * CHUNK, y, z - cz * CHUNK)] = b;
    this.dirty = true;
  }

  /** 위로 하늘이 뚫려 있나 */
  seesSky(x, y, z) {
    for (let yy = Math.max(0, Math.floor(y) + 1); yy < HEIGHT; yy++) {
      const b = this.get(x, yy, z);
      if (b !== AIR && BLOCKS[b].kind !== "plant" && BLOCKS[b].kind !== "torch") return false;
    }
    return true;
  }

  /** 땅 위 첫 빈칸 높이 */
  surface(x, z) {
    for (let y = HEIGHT - 1; y > 0; y--) {
      const b = this.get(x, y, z);
      if (b !== AIR && BLOCKS[b].kind !== "plant") return y + 1;
    }
    return 1;
  }

  torchNear(x, y, z, r) {
    for (const k of this.torches) {
      const [tx, ty, tz] = k.split(",").map(Number);
      if (Math.abs(tx - x) + Math.abs(ty - y) + Math.abs(tz - z) <= r) return true;
    }
    return false;
  }

  /** 몹이 서 있을 수 있는 칸 (발 · 머리 빈칸 + 밟을 땅, 물 · 용암 아님) */
  standable(x, y, z) {
    const below = this.get(x, y - 1, z);
    const feet = this.get(x, y, z), head = this.get(x, y + 1, z);
    return isOpaque(below) && below !== B.CACTUS && !blocksBody(feet) && !blocksBody(head) &&
      feet !== B.WATER && feet !== B.LAVA && head !== B.LAVA;
  }

  /** 시야 — 두 점 사이를 불투명 블록이 막고 있나 */
  sees(a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const d = Math.hypot(dx, dy, dz);
    const n = Math.ceil(d / 0.3);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (isOpaque(this.get(Math.floor(a[0] + dx * t), Math.floor(a[1] + dy * t), Math.floor(a[2] + dz * t)))) return false;
    }
    return true;
  }

  /** 플레이어 근처가 아닌 청크는 메모리에서 뺀다 */
  prune(players) {
    if (this.chunks.size < 300) return;
    for (const k of this.chunks.keys()) {
      const [cx, cz] = k.split(",").map(Number);
      const near = players.some((p) => Math.abs(p[0] / CHUNK - cx) < 8 && Math.abs(p[2] / CHUNK - cz) < 8);
      if (!near) this.chunks.delete(k);
    }
  }

  save(force = false) {
    if (!this.dirty && !force) return;
    writeSafe(this.file, JSON.stringify(this.w));
    this.dirty = false;
    if (Date.now() - this.lastBackup > BACKUP_EVERY) this.backupNow();
  }
  backupNow() {
    this.lastBackup = Date.now();
    return backup(this.file, this.backupDir);
  }
}

export const ckey = (cx, cz) => `${cx},${cz}`;
/** 몸이 부딪히는 블록 */
export const blocksBody = (b) => b !== AIR && (BLOCKS[b]?.kind === "solid" || BLOCKS[b]?.kind === "cutout");
