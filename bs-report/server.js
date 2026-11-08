// 현장밀착점검 보고서 (일일현장안전점검) — 월별 파일 내려받기 페이지 + 관리자 페이지
// Node.js 만 있으면 됨 (설치할 것 없음)
//   보는 주소:   http://<이 PC>:2823/
//   관리자:      http://<이 PC>:2823/admin  (페이지 맨 아래 톱니바퀴) — 처음 비밀번호는 data/admin-password.txt
import { createServer } from "node:http";
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, createReadStream, createWriteStream, renameSync, unlinkSync, statSync } from "node:fs";
import { reverse as dnsReverse } from "node:dns/promises";
import { join, dirname, extname, normalize, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, scryptSync, timingSafeEqual, randomUUID } from "node:crypto";
import { networkInterfaces } from "node:os";

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 2823;
const DATA = process.env.DATA_DIR ?? join(ROOT, "data");
const FILES = join(DATA, "files");
const SITE = join(DATA, "site.json");
const PW_FILE = join(DATA, "admin-password.txt");
const AUTH_FILE = join(DATA, "auth.json");
const LOG = join(DATA, "access-log.jsonl"); // 접속 · 다운로드 기록 (한 줄에 하나)
const MAX_UPLOAD = (Number(process.env.MAX_UPLOAD_MB) || 2048) * 1024 * 1024; // 기본 2GB
mkdirSync(FILES, { recursive: true });

// ── 기본 문구 (관리자 페이지에서 모두 바꿀 수 있음) ───────────
const MONTHS = Array.from({ length: 12 }, (_, i) => ({ id: randomUUID().slice(0, 8), title: `${i + 1}월`, label: "일일현장안전점검.pptx", file: null }));
const DEFAULT = {
  tab: "현장밀착점검 보고서 · 비즈니스솔루션팀",
  brand: "비즈니스솔루션팀",
  title: "현장밀착점검 보고서",
  subtitle: "(일일현장안전점검)",
  helmet: "비즈니스솔루션팀",
  clipboard: "일일현장안전점검",
  heroImage: null,
  greetPre: "안녕하세요, 비즈니스솔루션팀 ",
  greetName: "김소진 매니저",
  greetPost: "입니다.",
  notice: "KPI 향상을 위한 ‘현장밀착점검 보고서(일일현장안전점검)’ 파일이 용량이 커서,\n전체 자료를 아래 링크 페이지에서 확인 및 다운로드하실 수 있도록 준비하였습니다.",
  sectionTitle: "현장밀착점검 보고서 (일일현장안전점검)",
  sectionHint: "월별 파일을 선택하시면 해당 자료를 다운로드하실 수 있습니다.",
  columns: 6,
  cards: MONTHS,
  infoTitle: "안내",
  info: ["자료명 : 현장밀착점검 보고서 (일일현장안전점검)", "담당자 : 비즈니스솔루션팀 김소진 매니저", "문의사항이 있으시면 언제든지 연락 부탁드립니다."],
  downloadLabel: "다운로드",
  emptyLabel: "준비 중",
  askName: true, // 처음 들어올 때 이름을 물어 기록에 남김
};
const TEXT_KEYS = ["tab", "brand", "title", "subtitle", "helmet", "clipboard", "greetPre", "greetName", "greetPost", "notice", "sectionTitle", "sectionHint", "infoTitle", "downloadLabel", "emptyLabel"];

function loadSite() {
  try { return { ...DEFAULT, ...JSON.parse(readFileSync(SITE, "utf8")) }; } catch { return structuredClone(DEFAULT); }
}
let site = loadSite();
function saveSite() {
  const tmp = `${SITE}.tmp`;
  writeFileSync(tmp, JSON.stringify(site, null, 2));
  renameSync(tmp, SITE);
}
if (!existsSync(SITE)) saveSite();

// ── 관리자 비밀번호 · 로그인 ─────────────────────────────
function hash(pw, salt = randomBytes(16).toString("hex")) { return `${salt}:${scryptSync(String(pw), salt, 32).toString("hex")}`; }
function verify(pw, stored) {
  const [salt, h] = String(stored).split(":");
  if (!salt || !h) return false;
  const a = Buffer.from(scryptSync(String(pw), salt, 32).toString("hex")), b = Buffer.from(h);
  return a.length === b.length && timingSafeEqual(a, b);
}
let auth = existsSync(AUTH_FILE) ? JSON.parse(readFileSync(AUTH_FILE, "utf8")) : null;
if (!auth) {
  const first = randomBytes(4).toString("hex");
  writeFileSync(PW_FILE, `${first}\n(처음 비밀번호입니다. 관리자 페이지에서 바꾸면 이 파일은 더 이상 쓰이지 않습니다.)\n`);
  auth = { hash: hash(first) };
  writeFileSync(AUTH_FILE, JSON.stringify(auth));
}
const sessions = new Map(); // 토큰 → 만료 시각
const SESSION_MS = 8 * 3600_000;
const tries = new Map();    // IP → [시각...] (비밀번호 막 넣기 방지)

function tokenOf(req) {
  const m = /(?:^|;\s*)bs_admin=([a-f0-9]+)/.exec(req.headers.cookie ?? "");
  return m ? m[1] : null;
}
function isAdmin(req) {
  const t = tokenOf(req);
  const exp = t && sessions.get(t);
  if (!exp || exp < Date.now()) { if (t) sessions.delete(t); return false; }
  return true;
}

// ── 접속 · 다운로드 기록 ───────────────────────────────────
const hostCache = new Map(); // IP → PC 이름 (사내 DNS 가 알려 주면)
async function hostOf(ip) {
  if (hostCache.has(ip)) return hostCache.get(ip);
  let name = "";
  try { name = (await Promise.race([dnsReverse(ip), new Promise((_, j) => setTimeout(() => j(new Error("timeout")), 800))]))[0] ?? ""; } catch { /* 모름 */ }
  hostCache.set(ip, name);
  return name;
}
const ipOf = (req) => String(req.socket.remoteAddress ?? "").replace(/^::ffff:/, "").replace(/^::1$/, "127.0.0.1");
/** 브라우저 · 운영체제 짧게 */
function uaOf(ua = "") {
  const b = /Edg\//.test(ua) ? "Edge" : /Whale\//.test(ua) ? "Whale" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : /Trident|MSIE/.test(ua) ? "IE" : "기타";
  const o = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "";
  return `${b}${o ? ` · ${o}` : ""}${/Mobile/.test(ua) ? " (휴대폰)" : ""}`;
}
/** 보는 사람이 적은 이름 (주소의 ?who=) */
function whoOf(url) {
  try { const w = JSON.parse(url.searchParams.get("who") ?? "null"); return { name: String(w?.name ?? "").slice(0, 30), dept: String(w?.dept ?? "").slice(0, 40) }; }
  catch { return { name: "", dept: "" }; }
}
async function logEvent(req, url, type, extra = {}) {
  const ip = ipOf(req);
  const who = whoOf(url);
  const row = { at: new Date().toISOString(), type, ...who, ip, host: await hostOf(ip), ua: uaOf(req.headers["user-agent"]), ...extra };
  appendFileSync(LOG, JSON.stringify(row) + "\n");
  const label = { visit: "접속", download: "다운로드", admin: "관리자 로그인", adminFail: "관리자 비밀번호 틀림" }[type] ?? type;
  console.log(`[${new Date(row.at).toLocaleString("ko-KR")}] ${label} — ${row.name || "이름 없음"}${row.dept ? `(${row.dept})` : ""} · ${ip}${row.host ? ` (${row.host})` : ""}${row.file ? ` · ${row.title ?? ""} ${row.file}` : ""}`);
}
function readLog() {
  if (!existsSync(LOG)) return [];
  return readFileSync(LOG, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}
const TYPE_KO = { visit: "접속", download: "다운로드", admin: "관리자 로그인", adminFail: "관리자 비밀번호 틀림" };
function logCsv(rows) {
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [["시각", "구분", "이름", "소속", "파일", "IP", "PC 이름", "브라우저"].map(q).join(",")];
  for (const r of rows) lines.push([new Date(r.at).toLocaleString("ko-KR"), TYPE_KO[r.type] ?? r.type, r.name, r.dept, r.file ? `${r.title ?? ""} ${r.file}`.trim() : "", r.ip, r.host, r.ua].map(q).join(","));
  return "\uFEFF" + lines.join("\r\n");
}

// ── 응답 도우미 ─────────────────────────────────────────
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon" };
const send = (res, code, body, type = "application/json; charset=utf-8", extra = {}) => {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store", ...extra });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};
function readJson(req, limit = 200_000) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (d) => { body += d; if (body.length > limit) { reject(new Error("too big")); req.destroy(); } });
    req.on("end", () => { try { resolve(JSON.parse(body || "{}")); } catch (e) { reject(e); } });
    req.on("error", reject);
  });
}
const fmtSize = (n) => (n >= 1 << 30 ? `${(n / (1 << 30)).toFixed(1)}GB` : n >= 1 << 20 ? `${(n / (1 << 20)).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);

/** 보는 사람용 — 저장 경로 같은 내부 정보는 빼고 */
function publicSite() {
  return {
    ...Object.fromEntries(TEXT_KEYS.map((k) => [k, site[k]])),
    columns: site.columns, askName: site.askName !== false, info: site.info, heroImage: site.heroImage ? `/media/${site.heroImage}` : null,
    cards: site.cards.map((c) => ({ id: c.id, title: c.title, label: c.label, ready: !!c.file, fname: c.file ? `${c.title} ${c.file.name}`.trim() : null, size: c.file ? fmtSize(c.file.size) : null, ext: c.file ? extname(c.file.name).slice(1).toLowerCase() : extname(c.label).slice(1).toLowerCase() })),
  };
}
function adminSite() {
  return { ...site, cards: site.cards.map((c) => ({ ...c, file: c.file ? { ...c.file, sizeText: fmtSize(c.file.size) } : null })) };
}

/** 관리자 — 문구 · 칸 순서 · 칸 수 저장 (파일은 따로 올림) */
function applyEdit(body) {
  for (const k of TEXT_KEYS) if (typeof body[k] === "string") site[k] = body[k].slice(0, 2000);
  if (Array.isArray(body.info)) site.info = body.info.map((s) => String(s).slice(0, 300)).filter((s) => s.trim()).slice(0, 20);
  const cols = Number(body.columns);
  if (Number.isInteger(cols) && cols >= 1 && cols <= 8) site.columns = cols;
  if (typeof body.askName === "boolean") site.askName = body.askName;
  if (Array.isArray(body.cards)) {
    const byId = new Map(site.cards.map((c) => [c.id, c]));
    const next = [];
    for (const c of body.cards.slice(0, 60)) {
      const old = byId.get(c.id);
      next.push({ id: old?.id ?? randomUUID().slice(0, 8), title: String(c.title ?? "").slice(0, 40), label: String(c.label ?? "").slice(0, 120), file: old?.file ?? null, downloads: old?.downloads ?? 0 });
      byId.delete(c.id);
    }
    // 지운 칸의 파일도 지운다
    for (const gone of byId.values()) if (gone.file) { try { unlinkSync(join(FILES, gone.file.stored)); } catch { /* 이미 없음 */ } }
    site.cards = next;
  }
  saveSite();
}

/** 큰 파일 올리기 — 요청 본문을 그대로 디스크에 흘려 쓴다 (여러 GB 도 메모리를 안 씀) */
function receiveFile(req, res, onDone) {
  const name = basename(decodeURIComponent(req.headers["x-file-name"] ?? "file")).replace(/[\\/:*?"<>|]/g, "_").slice(0, 150) || "file";
  const len = Number(req.headers["content-length"]);
  if (len > MAX_UPLOAD) return send(res, 413, { error: `파일이 너무 큽니다 (최대 ${fmtSize(MAX_UPLOAD)}).` });
  const stored = `${randomUUID()}${extname(name).toLowerCase().slice(0, 10)}`;
  const tmp = join(FILES, `${stored}.part`);
  const out = createWriteStream(tmp);
  let size = 0, failed = false;
  req.on("data", (d) => { size += d.length; if (size > MAX_UPLOAD && !failed) { failed = true; req.unpipe(out); out.destroy(); try { unlinkSync(tmp); } catch { /* */ } send(res, 413, { error: "파일이 너무 큽니다." }); req.destroy(); } });
  req.pipe(out);
  out.on("finish", () => {
    if (failed) return;
    renameSync(tmp, join(FILES, stored));
    onDone({ name, stored, size, at: new Date().toISOString() });
  });
  out.on("error", () => { if (!failed) { failed = true; send(res, 500, { error: "저장하지 못했습니다." }); } });
  req.on("aborted", () => { failed = true; out.destroy(); try { unlinkSync(tmp); } catch { /* */ } });
}

function serveStatic(res, file, cache = "no-cache") {
  if (!existsSync(file) || !statSync(file).isFile()) return send(res, 404, "없는 페이지입니다.", "text/plain; charset=utf-8");
  res.writeHead(200, { "Content-Type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream", "Cache-Control": cache });
  createReadStream(file).pipe(res);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const path = decodeURIComponent(url.pathname);
  const ip = req.socket.remoteAddress ?? "";
  try {
    // ── 보는 사람 ──
    if (path === "/api/site" && req.method === "GET") {
      if (url.searchParams.get("log") === "1") logEvent(req, url, "visit").catch(() => {});
      return send(res, 200, publicSite());
    }
    const dl = /^\/download\/([a-f0-9-]+)(?:\/.*)?$/.exec(path); // 주소 끝에 파일 이름을 붙여도 됨
    if (dl) {
      const c = site.cards.find((x) => x.id === dl[1]);
      if (!c?.file) return send(res, 404, "아직 올라온 파일이 없습니다.", "text/plain; charset=utf-8");
      const file = join(FILES, c.file.stored);
      if (!existsSync(file)) return send(res, 404, "파일을 찾을 수 없습니다.", "text/plain; charset=utf-8");
      c.downloads = (c.downloads ?? 0) + 1;
      logEvent(req, url, "download", { title: c.title, file: c.file.name }).catch(() => {});
      saveSite();
      const fname = `${c.title} ${c.file.name}`.trim();
      res.writeHead(200, {
        "Content-Type": "application/octet-stream", "Content-Length": statSync(file).size,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fname)}`,
      });
      return createReadStream(file).pipe(res);
    }
    if (path.startsWith("/media/")) return serveStatic(res, join(FILES, basename(path)), "public, max-age=3600");

    // ── 관리자 ──
    if (path === "/api/login" && req.method === "POST") {
      const list = (tries.get(ip) ?? []).filter((t) => Date.now() - t < 10 * 60_000);
      if (list.length >= 10) return send(res, 429, { error: "잠시 뒤 다시 시도하세요. (10분에 10번까지)" });
      const { password } = await readJson(req);
      if (!verify(password, auth.hash)) { list.push(Date.now()); tries.set(ip, list); logEvent(req, url, "adminFail").catch(() => {}); return send(res, 401, { error: "비밀번호가 맞지 않습니다." }); }
      logEvent(req, url, "admin").catch(() => {});
      const t = randomBytes(24).toString("hex");
      sessions.set(t, Date.now() + SESSION_MS);
      return send(res, 200, { ok: true }, undefined, { "Set-Cookie": `bs_admin=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}` });
    }
    if (path === "/api/logout" && req.method === "POST") {
      sessions.delete(tokenOf(req));
      return send(res, 200, { ok: true }, undefined, { "Set-Cookie": "bs_admin=; Path=/; Max-Age=0" });
    }
    if (path.startsWith("/api/admin")) {
      if (!isAdmin(req)) return send(res, 401, { error: "로그인이 필요합니다." });
      if (path === "/api/admin/site" && req.method === "GET") return send(res, 200, adminSite());
      if (path === "/api/admin/logs" && req.method === "GET") {
        const all = readLog().reverse(); // 최근 것부터
        const people = new Map(), files = new Map();
        for (const r of all) {
          const key = r.name ? `${r.name}${r.dept ? ` (${r.dept})` : ""}` : `이름 없음 · ${r.ip}`;
          const p = people.get(key) ?? { who: key, visits: 0, downloads: 0, last: r.at, files: new Set() };
          if (r.type === "visit") p.visits++;
          if (r.type === "download") { p.downloads++; p.files.add(r.title ?? r.file); const f = files.get(r.title ?? r.file) ?? { file: `${r.title ?? ""} ${r.file}`.trim(), count: 0, people: new Set() }; f.count++; f.people.add(key); files.set(r.title ?? r.file, f); }
          if (r.type === "visit" || r.type === "download") people.set(key, p);
        }
        return send(res, 200, {
          total: all.length, rows: all.slice(0, 2000),
          people: [...people.values()].map((p) => ({ ...p, files: [...p.files] })),
          files: [...files.values()].map((f) => ({ ...f, people: [...f.people] })),
        });
      }
      if (path === "/api/admin/logs.csv" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent("접속·다운로드_기록.csv")}` });
        return res.end(logCsv(readLog()));
      }
      if (path === "/api/admin/site" && req.method === "POST") { applyEdit(await readJson(req)); return send(res, 200, adminSite()); }
      if (path === "/api/admin/reset-texts" && req.method === "POST") { for (const k of TEXT_KEYS) site[k] = DEFAULT[k]; site.info = [...DEFAULT.info]; saveSite(); return send(res, 200, adminSite()); }
      const up = /^\/api\/admin\/upload\/([a-f0-9-]+)$/.exec(path);
      if (up && req.method === "PUT") {
        const c = site.cards.find((x) => x.id === up[1]);
        if (!c) return send(res, 404, { error: "없는 칸입니다." });
        return receiveFile(req, res, (f) => {
          if (c.file) { try { unlinkSync(join(FILES, c.file.stored)); } catch { /* */ } }
          c.file = f;
          if (url.searchParams.get("label") === "1") c.label = f.name; // 파일 이름을 칸 글자로
          else {
            // 칸 글자의 확장자를 올린 파일에 맞춘다 (예: 점검.pptx 칸에 엑셀을 올리면 점검.xlsx)
            const newExt = extname(f.name), oldExt = extname(c.label);
            if (newExt && oldExt && newExt.toLowerCase() !== oldExt.toLowerCase()) c.label = c.label.slice(0, -oldExt.length) + newExt;
          }
          saveSite();
          console.log(`[올림] ${c.title} ← ${f.name} (${fmtSize(f.size)})`);
          send(res, 200, adminSite());
        });
      }
      const rm = /^\/api\/admin\/file\/([a-f0-9-]+)$/.exec(path);
      if (rm && req.method === "DELETE") {
        const c = site.cards.find((x) => x.id === rm[1]);
        if (c?.file) { try { unlinkSync(join(FILES, c.file.stored)); } catch { /* */ } c.file = null; saveSite(); }
        return send(res, 200, adminSite());
      }
      if (path === "/api/admin/hero" && req.method === "PUT") {
        return receiveFile(req, res, (f) => {
          if (!/\.(png|jpe?g|webp)$/i.test(f.name)) { try { unlinkSync(join(FILES, f.stored)); } catch { /* */ } return send(res, 400, { error: "그림 파일(png · jpg · webp)만 됩니다." }); }
          if (site.heroImage) { try { unlinkSync(join(FILES, site.heroImage)); } catch { /* */ } }
          site.heroImage = f.stored;
          saveSite();
          send(res, 200, adminSite());
        });
      }
      if (path === "/api/admin/hero" && req.method === "DELETE") {
        if (site.heroImage) { try { unlinkSync(join(FILES, site.heroImage)); } catch { /* */ } }
        site.heroImage = null; saveSite();
        return send(res, 200, adminSite());
      }
      if (path === "/api/admin/password" && req.method === "POST") {
        const { current, next } = await readJson(req);
        if (!verify(current, auth.hash)) return send(res, 400, { error: "지금 비밀번호가 맞지 않습니다." });
        if (String(next ?? "").length < 4) return send(res, 400, { error: "새 비밀번호는 4자 이상으로 해 주세요." });
        auth = { hash: hash(next) };
        writeFileSync(AUTH_FILE, JSON.stringify(auth));
        try { unlinkSync(PW_FILE); } catch { /* */ }
        return send(res, 200, { ok: true });
      }
      return send(res, 404, { error: "없는 기능입니다." });
    }

    // ── 화면 파일 ──
    if (path === "/admin" || path === "/admin/") return serveStatic(res, join(ROOT, "public", "admin.html"));
    const rel = path === "/" ? "index.html" : path.slice(1);
    const file = normalize(join(ROOT, "public", rel));
    if (!file.startsWith(join(ROOT, "public"))) return send(res, 404, "없는 페이지입니다.", "text/plain; charset=utf-8");
    return serveStatic(res, file);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) send(res, 500, { error: "서버 오류가 났습니다." });
  }
});
server.requestTimeout = 0; // 큰 파일 올리기가 중간에 끊기지 않게

server.listen(PORT, () => {
  const ips = Object.values(networkInterfaces()).flat().filter((n) => n && n.family === "IPv4" && !n.internal).map((n) => n.address);
  console.log(`\n현장밀착점검 보고서 페이지가 켜졌습니다.`);
  console.log(`  보는 주소:  http://localhost:${PORT}/${ips.map((ip) => `   http://${ip}:${PORT}/`).join("")}`);
  console.log(`  관리자:     http://localhost:${PORT}/admin   (페이지 맨 아래 톱니바퀴)`);
  if (existsSync(PW_FILE)) console.log(`  처음 비밀번호: ${readFileSync(PW_FILE, "utf8").split("\n")[0]}  (data/admin-password.txt — 관리자 페이지에서 꼭 바꾸세요)`);
  console.log("");
});
