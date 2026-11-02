// TECZEN WORLD 서버 — Node.js 만 있으면 된다 (npm 설치 없음).
//   node server.js            → http://<이 PC 주소>:25565
//   PORT=8080 node server.js  → 포트 바꾸기
//
// 하는 일
//   1) public/ 의 게임 화면을 브라우저에 보내준다
//   2) /api/register · /api/login 으로 가입 · 로그인 (계정마다 진행 상황 저장)
//   3) /ws 웹소켓으로 블록 · 몹 · 아이템 · 상자 · 화로 · 시간 · 날씨 · 채팅을 모두에게 똑같이 맞춘다
//      인벤토리 · 체력 · 조합 · 전투 결과는 서버가 정한다 (브라우저가 마음대로 못 바꿈)
//   4) 멀티플레이 월드(data/world.json) + 사람마다 싱글플레이 월드(data/solo/*.json), 계정(data/accounts.json)
//      10분마다 data/backups/ 에 백업
import { createServer } from "node:http";
import { existsSync, statSync, createReadStream, readFileSync } from "node:fs";
import { join, dirname, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { networkInterfaces } from "node:os";
import { createInterface } from "node:readline";
import { createHash } from "node:crypto";
import { findItem, itemName, maxStack } from "./shared/items.js";
import { addItem } from "./shared/inventory.js";
import { MOBS } from "./shared/mobs.js";
import { cleanLook } from "./shared/look.js";
import { accept } from "./server/ws.js";
import { Accounts } from "./server/accounts.js";
import { Realm } from "./server/realm.js";
import { Player } from "./server/player.js";
import { backup } from "./server/world.js";

export const VERSION = "2.0.0";
const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 25565);
const MAX_PLAYERS = 50;
const DATA_DIR = process.env.DATA_DIR ?? join(ROOT, "data");
const BACKUP_DIR = join(DATA_DIR, "backups");
const TICK = 0.05; // 1초에 20번
const started = Date.now();

// 관리자 아이디 — config.json 의 admins (또는 ADMINS="아이디1,아이디2" 환경변수). 처음 가입자가 관리자가 되지 않는다.
let CONFIG = { admins: [] };
try { CONFIG = JSON.parse(readFileSync(join(ROOT, "config.json"), "utf8")); } catch { /* 기본값 */ }
const ADMINS = [...(CONFIG.admins ?? []), ...String(process.env.ADMINS ?? "").split(",")].filter((s) => s.trim());
const accounts = new Accounts(join(DATA_DIR, "accounts.json"), ADMINS);

// ── 월드들 ─────────────────────────────────────────────────
const realms = new Map();
function savePlayer(pl) {
  const u = pl.user;
  u.states ??= {};
  u.states[pl.realm.key] = pl.serialize();
  u.lastRealm = pl.realm.key;
  accounts.dirty = true;
}
/** 닉네임 바꾸기 — 다른 사람 아이디 · 닉네임과 겹치면 안 됨. 실패하면 이유 문자열 */
function changeNick(pl, raw) {
  const nick = String(raw ?? "").trim();
  if (!/^[\p{L}\p{N}_]{2,12}$/u.test(nick)) return "닉네임은 한글 · 영문 · 숫자 2~12자로 해 주세요.";
  if (Date.now() - (pl.nickAt ?? 0) < 10_000) return "닉네임은 10초에 한 번 바꿀 수 있습니다.";
  const low = nick.toLowerCase();
  for (const [k, u] of Object.entries(accounts.data.users)) {
    if (k === pl.key) continue;
    if (k === low || String(u.nick ?? "").toLowerCase() === low) return `'${nick}' 은(는) 이미 쓰는 이름입니다.`;
  }
  const old = pl.name;
  pl.user.nick = nick;
  pl.name = nick;
  pl.nickAt = Date.now();
  accounts.dirty = true;
  pl.realm.broadcast({ t: "nick", id: pl.id, name: nick });
  pl.realm.sys(`${old} 님이 닉네임을 '${nick}'(으)로 바꿨습니다.`);
  pl.realm.pushScores();
  return null;
}

function getRealm(key, user) {
  let r = realms.get(key);
  if (r) return r;
  if (key === "main") {
    r = new Realm({ key, file: join(DATA_DIR, "world.json"), backupDir: BACKUP_DIR, title: "멀티플레이", onCommand: command, onSave: savePlayer, onNick: changeNick });
  } else {
    const id = createHash("sha1").update(user.name.toLowerCase()).digest("hex").slice(0, 16);
    r = new Realm({ key, file: join(DATA_DIR, "solo", `${id}.json`), backupDir: join(BACKUP_DIR, "solo"), title: "싱글플레이", owner: user.name.toLowerCase(), onCommand: command, onSave: savePlayer, onNick: changeNick });
  }
  realms.set(key, r);
  return r;
}
getRealm("main");
const allPlayers = () => [...realms.values()].flatMap((r) => [...r.players.values()]);
const findPlayer = (name, realm) => [...(realm ? realm.players.values() : allPlayers())].find((p) => p.name.toLowerCase() === String(name).toLowerCase() || p.key === String(name).toLowerCase()); // 닉네임 또는 아이디

// ── 정적 파일 · API ────────────────────────────────────────
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".json": "application/json",
};

function serveFile(res, base, rel) {
  const file = normalize(join(base, rel));
  if (!file.startsWith(base) || !existsSync(file) || !statSync(file).isFile()) return false;
  res.writeHead(200, {
    "content-type": MIME[extname(file)] ?? "application/octet-stream",
    "cache-control": rel.startsWith("vendor/") || rel.startsWith("img/") ? "public, max-age=86400" : "no-cache",
  });
  createReadStream(file).pipe(res);
  return true;
}

function json(res, code, obj) {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const parts = [];
    req.on("data", (d) => {
      size += d.length;
      if (size > 8192) { reject(new Error("too big")); req.destroy(); return; }
      parts.push(d);
    });
    req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(parts).toString("utf8") || "{}")); } catch (e) { reject(e); } });
    req.on("error", reject);
  });
}

async function api(req, res, path) {
  const ip = req.socket.remoteAddress ?? "?";
  if (path === "/api/status" && req.method === "GET") {
    return json(res, 200, { online: realms.get("main").players.size, max: MAX_PLAYERS, accounts: accounts.count, version: VERSION });
  }
  if (req.method !== "POST") return json(res, 405, { error: "잘못된 요청" });
  let body;
  try { body = await readBody(req); } catch { return json(res, 400, { error: "잘못된 요청" }); }
  try {
    if (path === "/api/register") {
      const r = await accounts.register(body.name, body.password, ip);
      console.log(`[계정] 새 가입: ${r.name}${r.admin ? " (관리자)" : ""}`);
      return json(res, 200, r);
    }
    if (path === "/api/login") return json(res, 200, await accounts.login(body.name, body.password, ip));
    if (path === "/api/look") {
      // 캐릭터 꾸미기 저장 — 관리자 옷은 관리자만
      const u = accounts.byToken(body.token);
      if (!u) return json(res, 401, { error: "다시 로그인해 주세요." });
      u.look = cleanLook(body.look, u.admin);
      accounts.dirty = true;
      accounts.save();
      for (const pl of allPlayers().filter((p) => p.key === u.name.toLowerCase())) {
        pl.look = u.look;
        pl.realm.broadcast({ t: "look", id: pl.id, look: u.look });
      }
      return json(res, 200, { look: u.look });
    }
    if (path === "/api/logout") { accounts.logout(body.token); return json(res, 200, { ok: true }); }
    if (path === "/api/me") {
      const u = accounts.byToken(body.token);
      if (!u) return json(res, 401, { error: "다시 로그인해 주세요." });
      const solo = `solo:${u.name.toLowerCase()}`;
      return json(res, 200, {
        name: u.nick ?? u.name, id: u.name, admin: u.admin, last: u.lastRealm === solo ? "solo" : u.lastRealm ? "main" : null,
        look: u.look ?? null, suggest: cleanLook({}, u.admin),
        hasMain: !!(u.states?.main ?? u.state), hasSolo: !!u.states?.[solo],
      });
    }
  } catch (err) {
    return json(res, 400, { error: err.message });
  }
  return json(res, 404, { error: "없는 주소" });
}

const server = createServer((req, res) => {
  let path;
  try { path = decodeURIComponent(new URL(req.url, "http://x").pathname); } catch { res.writeHead(400).end(); return; }
  if (path.includes("..")) { res.writeHead(400).end(); return; }
  if (path.startsWith("/api/")) { api(req, res, path).catch(() => json(res, 500, { error: "서버 오류" })); return; }
  if (path === "/" && serveFile(res, join(ROOT, "public"), "index.html")) return;
  if (path.startsWith("/shared/") && serveFile(res, join(ROOT, "shared"), path.slice(8))) return;
  if (serveFile(res, join(ROOT, "public"), path.slice(1))) return;
  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("없는 페이지입니다.");
});

// ── 게임 접속 ──────────────────────────────────────────────
let nextPid = 1;

server.on("upgrade", (req, socket) => {
  if (new URL(req.url, "http://x").pathname !== "/ws") return socket.destroy();
  const conn = accept(req, socket);
  if (!conn) return;
  let me = null;
  let rate = [];

  conn.onmessage = (m) => {
    if (!me) {
      if (m.t !== "hello") return;
      const u = accounts.byToken(m.token);
      if (!u) { conn.send({ t: "auth", msg: "로그인이 필요합니다." }); return conn.close(); }
      const key = u.name.toLowerCase();
      for (const old of allPlayers().filter((p) => p.key === key)) {
        old.send({ t: "kick", msg: "다른 곳에서 같은 계정으로 접속해서 연결을 끊었습니다." });
        old.conn.close();
      }
      const realmKey = m.realm === "solo" ? `solo:${key}` : "main";
      const realm = getRealm(realmKey, u);
      if (realmKey === "main" && realm.players.size >= MAX_PLAYERS) { conn.send({ t: "kick", msg: "서버가 가득 찼습니다." }); return conn.close(); }
      // 예전 저장 형식(u.state) 옮기기
      if (u.state && !u.states) { u.states = { main: u.state }; delete u.state; }
      const saved = u.states?.[realmKey === "main" ? "main" : realmKey];
      me = new Player({ id: nextPid++, user: u, conn, realm, saved, spawn: realm.world.spawn });
      if (realmKey !== "main") me.admin = me.admin || false;
      realm.join(me);
      console.log(`[접속] ${me.name} → ${realm.title} (${realm.players.size}명)`);
      return;
    }
    // 1초에 200개 넘는 메시지는 버린다
    const now = Date.now();
    rate = rate.filter((t) => now - t < 1000);
    if (rate.length > 200) return;
    rate.push(now);
    me.realm.handle(me, m);
  };

  conn.onclose = () => {
    if (!me) return;
    me.realm.leave(me);
    console.log(`[퇴장] ${me.name} ← ${me.realm.title}`);
  };
});

// ── 명령어 ─────────────────────────────────────────────────
const HELP = [
  "/spawn 스폰으로 · /kill 다시 시작 · /who 접속자 · /time 지금 시간",
  "관리자: /gamemode survival|creative [이름] · /time day|night|noon|midnight|set 숫자",
  "  /weather clear|rain|thunder · /give 아이템 [개수] [이름] · /tp 이름 | x y z | 이름 x y z · /summon 몹 [마리] · /setspawn",
  "  /gamerule keepInventory|mobGriefing|pvp true|false",
  "서버 관리자: /say 공지 · /kick 이름 · /op 이름 · /deop 이름 · /status · /save · /backup",
];
const MOB_NAMES = Object.fromEntries(MOBS.flatMap((m, i) => [[m.key, i], [m.name.replace(/\s/g, ""), i]]));

function command(me, line) {
  const realm = me.realm;
  const [cmd, ...args] = line.slice(1).split(/\s+/);
  const cheats = me.admin;                      // 관리자만 (싱글플레이도 마찬가지)
  const sys = (msg) => realm.sys(msg, me);
  const deny = () => sys("관리자만 쓸 수 있는 명령어입니다.");
  console.log(`[명령 ${realm.title}] ${me.name}: ${line}`);
  switch (cmd) {
    case "help": case "도움말": HELP.forEach(sys); return;
    case "spawn": case "스폰": me.p = [...realm.world.spawn]; me.tpGrace = true; me.send({ t: "tp", p: me.p }); return;
    case "kill": realm.damagePlayer(me, 1000, "kill"); return;
    case "who": case "list": sys(`접속자 ${realm.players.size}명: ${[...realm.players.values()].map((p) => p.name).join(", ")}`); return;
    case "gamemode": case "gm": {
      if (!cheats) return deny();
      const mode = { survival: "survival", s: "survival", 0: "survival", 서바이벌: "survival", creative: "creative", c: "creative", 1: "creative", 크리에이티브: "creative" }[args[0]];
      if (!mode) return sys("/gamemode survival 또는 /gamemode creative");
      const target = args[1] ? findPlayer(args[1], realm) : me;
      if (!target) return sys(`'${args[1]}' 님은 이 월드에 없습니다.`);
      target.mode = mode;
      target.send({ t: "mode", mode });
      target.statsDirty = true;
      sys(`${target.name} 님의 게임 모드: ${mode === "creative" ? "크리에이티브" : "서바이벌"}`);
      if (target !== me) realm.sys(`게임 모드가 ${mode === "creative" ? "크리에이티브" : "서바이벌"}로 바뀌었습니다.`, target);
      return;
    }
    case "time": {
      if (!args[0]) {
        const t = realm.world.time, h = Math.floor(((t / 1000) + 6) % 24), mm = Math.floor(((t % 1000) / 1000) * 60);
        return sys(`지금 ${h}시 ${String(mm).padStart(2, "0")}분 (${Math.round(t)})`);
      }
      if (!cheats) return deny();
      const t = { day: 1000, 낮: 1000, noon: 6000, 정오: 6000, night: 13500, 밤: 13500, midnight: 18000, 자정: 18000, sunrise: 23200, 아침: 23200 }[args[0]]
        ?? (args[0] === "set" ? Number(args[1]) : NaN);
      if (!Number.isFinite(t)) return sys("/time day · night · noon · midnight · set 숫자(0~23999)");
      realm.world.time = t;
      realm.broadcast({ t: "time", time: realm.world.time });
      realm.sys(`시간을 바꿨습니다. (${me.name})`);
      return;
    }
    case "weather": {
      if (!cheats) return deny();
      const k = { clear: "clear", 맑음: "clear", rain: "rain", 비: "rain", thunder: "thunder", 천둥: "thunder" }[args[0]];
      if (!k) return sys("/weather clear · rain · thunder");
      realm.setWeather(k);
      realm.sys(`날씨: ${{ clear: "맑음", rain: "비", thunder: "천둥번개" }[k]} (${me.name})`);
      return;
    }
    case "give": {
      if (!cheats) return deny();
      const id = findItem(args[0] ?? "");
      if (!id) return sys(`'${args[0] ?? ""}' 아이템을 찾지 못했습니다. 예) /give 다이아몬드 10`);
      const n = Math.max(1, Math.min(64 * 36, Number(args[1]) || 1));
      const target = args[2] ? findPlayer(args[2], realm) : me;
      if (!target) return sys(`'${args[2]}' 님은 이 월드에 없습니다.`);
      let left = n;
      while (left > 0) {
        const c = Math.min(left, maxStack(id));
        const item = { id, n: c };
        const rest = addItem(target.st.inv, item);
        target.send({ t: "give", item });
        if (rest) realm.entities.spawnItem({ id, n: rest }, target.p[0], target.p[1] + 1, target.p[2], [0, 2, 0], 0);
        left -= c;
      }
      sys(`${target.name} 님에게 ${itemName(id)} ${n}개를 줬습니다.`);
      return;
    }
    case "tp": {
      if (!cheats) return deny();
      let p = null;
      // /tp 이름 x y z — 다른 사람을 옮기기
      if (args.length >= 4 && args.slice(1, 4).every((v) => Number.isFinite(Number(v)))) {
        const t = findPlayer(args[0], realm);
        if (!t) return sys(`'${args[0]}' 님은 이 월드에 없습니다.`);
        t.p = args.slice(1, 4).map(Number); t.tpGrace = true;
        t.send({ t: "tp", p: t.p });
        return sys(`${t.name} 님을 옮겼습니다.`);
      }
      if (args.length >= 3 && args.slice(0, 3).every((v) => Number.isFinite(Number(v)))) p = args.slice(0, 3).map(Number);
      else { const t = findPlayer(args[0] ?? "", realm); if (t) p = t.p; }
      if (!p) return sys("/tp 이름  또는  /tp x y z");
      me.p = [...p]; me.tpGrace = true;
      me.send({ t: "tp", p });
      return;
    }
    case "summon": {
      if (!cheats) return deny();
      const type = MOB_NAMES[args[0]] ?? MOB_NAMES[String(args[0] ?? "").toLowerCase()];
      if (type == null) return sys(`몹 이름: ${MOBS.map((m) => m.name).join(", ")}`);
      const n = Math.max(1, Math.min(20, Number(args[1]) || 1));
      const [yaw] = me.r;
      for (let i = 0; i < n; i++) {
        realm.entities.spawnMob(type, me.p[0] - Math.sin(yaw) * 3 + (Math.random() - 0.5), me.p[1] + 0.5, me.p[2] - Math.cos(yaw) * 3 + (Math.random() - 0.5));
      }
      sys(`${MOBS[type].name} ${n}마리를 불렀습니다.`);
      return;
    }
    case "setspawn": {
      if (!cheats) return deny();
      realm.world.w.spawn = me.p.map((v, i) => (i === 1 ? Math.ceil(v) : Math.floor(v) + 0.5));
      realm.world.dirty = true;
      realm.broadcast({ t: "spawn", spawn: realm.world.spawn });
      sys(`스폰 위치를 ${realm.world.spawn.map(Math.floor).join(", ")} 으로 바꿨습니다.`);
      return;
    }
    case "gamerule": {
      if (!cheats) return deny();
      const rules = realm.world.rules;
      if (!(args[0] in rules)) return sys(`규칙: ${Object.entries(rules).map(([k, v]) => `${k}=${v}`).join(", ")}`);
      if (args[1] !== "true" && args[1] !== "false") return sys(`${args[0]} = ${rules[args[0]]}`);
      rules[args[0]] = args[1] === "true";
      realm.world.dirty = true;
      realm.broadcast({ t: "rules", rules });
      realm.sys(`규칙 ${args[0]} = ${args[1]} (${me.name})`);
      return;
    }
    // ── 서버 관리자 전용 ──
    case "say": case "공지": {
      if (!me.admin) return deny();
      const msg = args.join(" ");
      for (const r of realms.values()) r.broadcast({ t: "notice", msg: `[공지] ${msg}` });
      return;
    }
    case "kick": {
      if (!me.admin) return deny();
      const t = findPlayer(args[0] ?? "");
      if (!t) return sys(`'${args[0] ?? ""}' 님은 접속해 있지 않습니다.`);
      t.send({ t: "kick", msg: `${me.name} 님이 강제 퇴장시켰습니다. ${args.slice(1).join(" ")}` });
      t.conn.close();
      sys(`${t.name} 님을 내보냈습니다.`);
      return;
    }
    case "op": case "deop": {
      if (!me.admin) return deny();
      const u = accounts.get(args[0] ?? "");
      if (!u) return sys(`'${args[0] ?? ""}' 계정이 없습니다.`);
      u.op = cmd === "op";
      u.admin = u.op || accounts.admins.has(u.name.toLowerCase());
      accounts.dirty = true;
      const online = findPlayer(u.name);
      if (online) { online.admin = u.admin; online.send({ t: "admin", admin: u.admin }); }
      sys(`${u.name} 님은 이제 ${u.admin ? "관리자입니다" : "관리자가 아닙니다"}.`);
      return;
    }
    case "status": {
      if (!me.admin) return deny();
      const mem = Math.round(process.memoryUsage().rss / 1048576);
      const up = Math.round((Date.now() - started) / 60000);
      sys(`버전 ${VERSION} · 켜진 지 ${up}분 · 메모리 ${mem}MB · 월드 ${realms.size}개 · 접속 ${allPlayers().length}명 · 가입 ${accounts.count}명`);
      sys(`이 월드: 몹 ${realm.entities.mobs.size} · 아이템 ${realm.entities.items.size} · 청크 ${realm.world.chunks.size} · 바뀐 블록 ${Object.keys(realm.world.edits).length}`);
      return;
    }
    case "save": {
      if (!me.admin) return deny();
      saveAll(true);
      sys("모든 월드와 계정을 저장했습니다.");
      return;
    }
    case "backup": {
      if (!me.admin) return deny();
      saveAll(true);
      const files = [...realms.values()].map((r) => r.world.backupNow()).concat(backup(accounts.file, BACKUP_DIR)).filter(Boolean);
      sys(`백업 ${files.length}개를 만들었습니다. (data/backups)`);
      return;
    }
    default: sys(`모르는 명령어입니다: /${cmd}  (/help 로 목록 보기)`);
  }
}

// ── 게임 시계 ──────────────────────────────────────────────
function saveAll(force = false) {
  for (const r of realms.values()) { for (const pl of r.players.values()) savePlayer(pl); r.world.save(force); }
  accounts.save(force);
}

let tickN = 0;
setInterval(() => {
  tickN++;
  for (const [k, r] of realms) {
    if (!r.players.size && k !== "main") {
      // 비어 있는 싱글플레이 월드는 1분 뒤 저장하고 내린다
      if (Date.now() - r.emptySince > 60_000) { r.world.save(true); realms.delete(k); }
      continue;
    }
    r.tick(TICK);
  }
  if (tickN % 600 === 0) accounts.save();
  if (tickN % 12000 === 0) backup(accounts.file, BACKUP_DIR); // 10분마다 계정 백업
}, TICK * 1000);

// ── 서버 창에서 쓰는 명령 ──────────────────────────────────
const rl = process.stdin.isTTY ? createInterface({ input: process.stdin }) : null;
rl?.on("line", async (line) => {
  const [cmd, ...a] = line.trim().split(/\s+/);
  try {
    if (cmd === "/passwd" || cmd === "비번") {
      await accounts.setPassword(a[0], a[1]);
      console.log(`${a[0]} 의 비밀번호를 바꿨습니다.`);
    } else if (cmd === "/op") {
      const u = accounts.get(a[0]); if (!u) throw new Error("없는 아이디");
      u.op = true; u.admin = true; accounts.dirty = true; accounts.save(); console.log(`${u.name} 을(를) 관리자로 만들었습니다.`);
    } else if (cmd === "/list" || cmd === "목록") {
      console.log(`접속자 ${allPlayers().length}명: ${allPlayers().map((p) => `${p.name}(${p.realm.title})`).join(", ")}`);
      console.log(`가입 ${accounts.count}명: ${Object.values(accounts.data.users).map((u) => u.name + (u.admin ? "(관리자)" : "")).join(", ")}`);
    } else if (cmd === "/say") {
      for (const r of realms.values()) r.broadcast({ t: "notice", msg: `[공지] ${a.join(" ")}` });
    } else if (cmd === "/save") { saveAll(true); console.log("저장했습니다."); }
    else if (cmd === "/backup") { saveAll(true); for (const r of realms.values()) console.log("백업:", r.world.backupNow()); console.log("백업:", backup(accounts.file, BACKUP_DIR)); }
    else if (cmd) console.log("서버 명령: /list · /say 공지 · /op 아이디 · /passwd 아이디 새비밀번호 · /save · /backup");
  } catch (err) { console.log("실패:", err.message); }
});

// ── 시작 · 종료 ────────────────────────────────────────────
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") console.error(`\n!! 포트 ${PORT} 를 이미 다른 프로그램이 쓰고 있습니다. 이미 서버가 켜져 있는지 확인하세요.\n`);
  else console.error(err);
  process.exit(1);
});

server.listen(PORT, "0.0.0.0", () => {
  const ips = Object.values(networkInterfaces()).flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i.address);
  const main = realms.get("main");
  console.log("==========================================================");
  console.log(`  TECZEN WORLD 서버 v${VERSION} 가 켜졌습니다`);
  console.log("==========================================================");
  console.log(`  이 PC 에서:     http://localhost:${PORT}`);
  for (const ip of ips) console.log(`  직원 접속 주소: http://${ip}:${PORT}`);
  console.log("");
  console.log(`  월드 시드 ${main.world.seed} · 바뀐 블록 ${Object.keys(main.world.edits).length}개 · 가입 ${accounts.count}명`);
  console.log(`  관리자 아이디: ${ADMINS.join(", ") || "(없음 — config.json 의 admins 에 적으세요)"}`);
  console.log("  서버 명령: /list · /say 공지 · /op 아이디 · /passwd 아이디 새비밀번호 · /save · /backup");
  console.log("  끄기: Ctrl+C (30초마다 · 끌 때 자동 저장, 10분마다 백업)");
  console.log("----------------------------------------------------------");
});

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  console.log("\n서버를 끄는 중... 월드와 계정을 저장합니다.");
  for (const pl of allPlayers()) pl.send({ t: "kick", msg: "서버가 꺼졌습니다." });
  saveAll(true);
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("SIGBREAK", shutdown); // Windows 창 닫기
