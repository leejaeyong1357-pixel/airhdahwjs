// 테크젠 크래프트 서버 — Node.js 만 있으면 된다 (npm 설치 없음).
//   node server.js            → http://<이 PC 주소>:25565
//   PORT=8080 node server.js  → 포트 바꾸기
//
// 하는 일
//   1) public/ 의 게임 화면을 브라우저에 보내준다
//   2) /ws 웹소켓으로 접속한 사람들의 위치 · 블록 변경 · 채팅을 서로 전달한다
//   3) 사람이 바꾼 블록만 data/world.json 에 저장한다 (지형은 시드로 다시 만든다)
import { createServer } from "node:http";
import { createHash, randomInt } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, statSync, createReadStream } from "node:fs";
import { join, dirname, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { networkInterfaces } from "node:os";
import { BLOCKS, isValidBlock } from "./shared/blocks.js";
import { HEIGHT, findSpawn } from "./shared/worldgen.js";

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 25565);
const MAX_PLAYERS = 50;
const DATA_DIR = join(ROOT, "data");
const SAVE_FILE = join(DATA_DIR, "world.json");

// ── 월드 (시드 + 바뀐 블록) ─────────────────────────────────
let world = { seed: randomInt(1, 2_000_000_000), edits: {}, createdAt: new Date().toISOString() };
if (existsSync(SAVE_FILE)) {
  try {
    world = JSON.parse(readFileSync(SAVE_FILE, "utf8"));
    world.edits ??= {};
  } catch (err) {
    console.error("!! data/world.json 을 읽지 못했습니다. 새 월드로 시작합니다:", err.message);
  }
}
const spawn = world.spawn ?? findSpawn(world.seed);
world.spawn = spawn;
let dirty = true;

function save() {
  if (!dirty) return;
  mkdirSync(DATA_DIR, { recursive: true });
  const tmp = SAVE_FILE + ".tmp";
  writeFileSync(tmp, JSON.stringify(world));
  renameSync(tmp, SAVE_FILE);
  dirty = false;
}
save();
setInterval(save, 30_000);

// ── 정적 파일 ──────────────────────────────────────────────
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json",
};

function serveFile(res, base, rel) {
  const file = normalize(join(base, rel));
  if (!file.startsWith(base) || !existsSync(file) || !statSync(file).isFile()) return false;
  res.writeHead(200, {
    "content-type": MIME[extname(file)] ?? "application/octet-stream",
    "cache-control": rel.startsWith("vendor/") ? "public, max-age=86400" : "no-cache",
  });
  createReadStream(file).pipe(res);
  return true;
}

const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (path.includes("..")) { res.writeHead(400).end(); return; }
  if (path === "/" && serveFile(res, join(ROOT, "public"), "index.html")) return;
  if (path.startsWith("/shared/") && serveFile(res, join(ROOT, "shared"), path.slice(8))) return;
  if (serveFile(res, join(ROOT, "public"), path.slice(1))) return;
  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("없는 페이지입니다.");
});

// ── 웹소켓 (RFC 6455 최소 구현 — 텍스트 메시지만) ─────────────
const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

class Conn {
  constructor(socket) {
    this.socket = socket;
    this.buf = Buffer.alloc(0);
    this.frag = [];
    this.alive = true;
    this.onmessage = () => {};
    this.onclose = () => {};
    socket.on("data", (d) => this.read(d));
    socket.on("close", () => this.closed());
    socket.on("error", () => this.closed());
  }
  read(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    for (;;) {
      const b = this.buf;
      if (b.length < 2) return;
      const fin = b[0] & 0x80, op = b[0] & 0x0f, masked = b[1] & 0x80;
      let len = b[1] & 0x7f, off = 2;
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); off = 10; }
      if (len > 1 << 20) return this.close(); // 1MB 넘는 메시지는 받지 않는다
      const maskAt = off;
      if (masked) off += 4;
      if (b.length < off + len) return;
      const payload = Buffer.from(b.subarray(off, off + len));
      if (masked) for (let i = 0; i < len; i++) payload[i] ^= b[maskAt + (i & 3)];
      this.buf = b.subarray(off + len);

      if (op === 0x8) return this.close();
      if (op === 0x9) { this.frame(0xa, payload); continue; } // ping → pong
      if (op === 0xa) continue;
      if (op === 0x1) this.frag = [payload];
      else if (op === 0x0) this.frag.push(payload);
      else continue;
      if (fin) {
        const text = Buffer.concat(this.frag).toString("utf8");
        this.frag = [];
        try { this.onmessage(JSON.parse(text)); } catch { /* 잘못된 메시지는 무시 */ }
      }
    }
  }
  frame(op, data) {
    if (!this.alive) return;
    const len = data.length;
    let head;
    if (len < 126) head = Buffer.from([0x80 | op, len]);
    else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(len, 2); }
    else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
    this.socket.write(Buffer.concat([head, data]));
  }
  send(obj) { this.frame(0x1, Buffer.from(JSON.stringify(obj))); }
  close() {
    if (this.alive) { try { this.frame(0x8, Buffer.alloc(0)); } catch { /* 이미 끊김 */ } }
    this.socket.end();
    this.closed();
  }
  closed() {
    if (!this.alive) return;
    this.alive = false;
    this.onclose();
  }
}

// ── 게임 ───────────────────────────────────────────────────
const players = new Map(); // id → { id, name, color, p, r, conn }
let nextId = 1;

const broadcast = (obj, except) => {
  for (const pl of players.values()) if (pl.conn !== except) pl.conn.send(obj);
};
const sys = (msg) => { console.log(`[알림] ${msg}`); broadcast({ t: "chat", name: "", msg }); };

function cleanName(raw) {
  // 한글 · 영문 · 숫자 · _ - 만, 16자까지
  return String(raw ?? "").replace(/[^\p{L}\p{N}_\-]/gu, "").slice(0, 16);
}

server.on("upgrade", (req, socket) => {
  if (new URL(req.url, "http://x").pathname !== "/ws") return socket.destroy();
  const key = req.headers["sec-websocket-key"];
  if (!key) return socket.destroy();
  const accept = createHash("sha1").update(key + WS_GUID).digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n" +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
  );
  socket.setNoDelay(true);
  const conn = new Conn(socket);
  let me = null;
  let lastSet = [];

  conn.onmessage = (m) => {
    if (!me) {
      if (m.t !== "hello") return;
      const name = cleanName(m.name);
      if (!name) return conn.send({ t: "error", msg: "닉네임을 입력하세요. (한글 · 영문 · 숫자 16자까지)" });
      if ([...players.values()].some((p) => p.name === name)) {
        return conn.send({ t: "error", msg: `'${name}' 은 이미 접속 중인 닉네임입니다.` });
      }
      if (players.size >= MAX_PLAYERS) return conn.send({ t: "error", msg: "서버가 가득 찼습니다." });
      me = { id: nextId++, name, color: randomInt(0, 360), p: [...spawn], r: [0, 0], conn };
      players.set(me.id, me);
      conn.send({
        t: "welcome", id: me.id, seed: world.seed, spawn,
        edits: world.edits,
        players: [...players.values()].filter((p) => p !== me).map(({ id, name, color, p, r }) => ({ id, name, color, p, r })),
      });
      broadcast({ t: "join", id: me.id, name, color: me.color, p: me.p, r: me.r }, conn);
      sys(`${name} 님이 들어왔습니다. (접속 ${players.size}명)`);
      return;
    }

    if (m.t === "move" && Array.isArray(m.p) && m.p.length === 3 && m.p.every(Number.isFinite)) {
      me.p = m.p.map((v) => Math.round(v * 100) / 100);
      me.r = Array.isArray(m.r) && m.r.every(Number.isFinite) ? m.r.slice(0, 2) : me.r;
      broadcast({ t: "move", id: me.id, p: me.p, r: me.r }, conn);
    } else if (m.t === "set") {
      const { x, y, z, b } = m;
      if (![x, y, z].every(Number.isInteger) || !isValidBlock(b)) return;
      if (y < 1 || y >= HEIGHT) return; // 맨 아래 기반암 층은 못 바꾼다
      // 너무 먼 곳은 무시 (손이 닿는 거리 + 여유)
      const d = Math.hypot(x + 0.5 - me.p[0], y + 0.5 - me.p[1] - 1.6, z + 0.5 - me.p[2]);
      if (d > 10) return;
      // 1초에 30번 넘게는 무시
      const now = Date.now();
      lastSet = lastSet.filter((t) => now - t < 1000);
      if (lastSet.length >= 30) return;
      lastSet.push(now);
      world.edits[`${x},${y},${z}`] = b;
      dirty = true;
      broadcast({ t: "set", x, y, z, b }, conn);
    } else if (m.t === "chat" && typeof m.msg === "string") {
      const msg = m.msg.trim().slice(0, 200);
      if (!msg) return;
      console.log(`[채팅] ${me.name}: ${msg}`);
      broadcast({ t: "chat", name: me.name, msg });
    }
  };

  conn.onclose = () => {
    if (!me) return;
    players.delete(me.id);
    broadcast({ t: "leave", id: me.id });
    sys(`${me.name} 님이 나갔습니다. (접속 ${players.size}명)`);
  };
});

// ── 시작 · 종료 ────────────────────────────────────────────
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n!! 포트 ${PORT} 를 이미 다른 프로그램이 쓰고 있습니다. 이미 서버가 켜져 있는지 확인하세요.\n`);
  } else {
    console.error(err);
  }
  process.exit(1);
});

server.listen(PORT, "0.0.0.0", () => {
  const ips = Object.values(networkInterfaces()).flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i.address);
  console.log("==========================================================");
  console.log("  테크젠 크래프트 서버가 켜졌습니다");
  console.log("==========================================================");
  console.log(`  이 PC 에서:     http://localhost:${PORT}`);
  for (const ip of ips) console.log(`  직원 접속 주소: http://${ip}:${PORT}`);
  console.log("");
  console.log(`  월드 시드 ${world.seed} · 바뀐 블록 ${Object.keys(world.edits).length}개 · 블록 종류 ${BLOCKS.length - 1}가지`);
  console.log("  끄기: Ctrl+C (월드는 30초마다 · 끌 때 자동 저장)");
  console.log("----------------------------------------------------------");
});

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  console.log("\n서버를 끄는 중... 월드를 저장합니다.");
  dirty = true;
  save();
  for (const pl of players.values()) pl.conn.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("SIGBREAK", shutdown); // Windows 창 닫기
