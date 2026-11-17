// 가족관계증명서 → 엑셀 정리 도구 (이 PC 안에서만 동작)
// 서버는 화면 파일만 내어 준다. 증명서 파일은 서버로 올라오지 않고 브라우저 안에서만 읽는다.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULTS, readRow, ping } from "./hchat.js";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 2824);
const HOST = process.env.HOST || "127.0.0.1"; // 다른 PC에서는 접속할 수 없다
const NM = path.join(DIR, "node_modules");

const ROOTS = [
  ["/vendor/pdfjs/", path.join(NM, "pdfjs-dist")],
  ["/vendor/tesseract/", path.join(NM, "tesseract.js", "dist")],
  ["/vendor/tesseract-core/", path.join(NM, "tesseract.js-core")],
  ["/vendor/tessdata/", path.join(NM, "@tesseract.js-data", "kor", "4.0.0_best_int")],
  ["/vendor/exceljs/", path.join(NM, "exceljs", "dist")],
  ["/sample/", path.join(DIR, "sample")],
  ["/", path.join(DIR, "public")],
];
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png",
  ".wasm": "application/wasm", ".gz": "application/gzip", ".pdf": "application/pdf", ".map": "application/json",
};
// 화면이 인터넷 어디로도 자료를 보낼 수 없게 막는 규칙
const CSP = [
  "default-src 'self'", "connect-src 'self'", "img-src 'self' data: blob:", "worker-src 'self' blob:",
  "script-src 'self' 'wasm-unsafe-eval'", "style-src 'self' 'unsafe-inline'", "object-src 'none'", "base-uri 'none'", "form-action 'none'",
].join("; ");

// ───────── H Chat 보조 판독 (선택 기능)
// 켰을 때만 쓰인다. 키는 기본으로 메모리에만 두고, "이 PC에 저장"을 고르면 data/hchat.json 에 둔다(깃허브에 올라가지 않는 폴더).
const HC_FILE = path.join(DIR, "data", "hchat.json");
let hc = { ...DEFAULTS, key: "", saved: false };
try { hc = { ...hc, ...JSON.parse(fs.readFileSync(HC_FILE, "utf8")), saved: true }; } catch { /* 저장된 설정 없음 */ }
const hcPublic = () => ({ baseUrl: hc.baseUrl, format: hc.format, model: hc.model, hasKey: !!hc.key, saved: hc.saved });
const json = (res, code, obj) => res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }).end(JSON.stringify(obj));
function readBody(req, limit = 4 << 20) {
  return new Promise((ok, bad) => {
    const chunks = []; let n = 0;
    req.on("data", c => { n += c.length; if (n > limit) { bad(new Error("too large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { ok(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); } catch (e) { bad(e); } });
    req.on("error", bad);
  });
}
// 이 화면에서 온 요청만 받는다 (다른 웹사이트가 이 PC의 주소를 몰래 부르는 것을 막음)
function sameSite(req) {
  const host = String(req.headers.host || ""), origin = req.headers.origin;
  if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return false;
  return !origin || origin === `http://${host}`;
}
async function api(req, res, p) {
  if (!sameSite(req)) return json(res, 403, { ok: false, error: "허용되지 않은 요청" });
  try {
    if (p === "/api/hchat" && req.method === "GET") return json(res, 200, hcPublic());
    if (p === "/api/hchat" && req.method === "POST") {
      const b = await readBody(req, 20000);
      const baseUrl = String(b.baseUrl || "").trim();
      if (!/^https?:\/\/[^\s]+$/.test(baseUrl)) return json(res, 400, { ok: false, error: "주소는 http(s):// 로 시작해야 해요." });
      hc = { ...hc, baseUrl, format: b.format === "openai" ? "openai" : "azure", model: String(b.model || "").trim() || DEFAULTS.model };
      if (typeof b.key === "string" && b.key.trim()) hc.key = b.key.trim();
      if (b.save) { fs.mkdirSync(path.dirname(HC_FILE), { recursive: true }); fs.writeFileSync(HC_FILE, JSON.stringify({ baseUrl: hc.baseUrl, format: hc.format, model: hc.model, key: hc.key }), { mode: 0o600 }); hc.saved = true; }
      else { fs.rmSync(HC_FILE, { force: true }); hc.saved = false; }
      return json(res, 200, { ok: true, ...hcPublic() });
    }
    if (p === "/api/hchat" && req.method === "DELETE") { fs.rmSync(HC_FILE, { force: true }); hc = { ...hc, key: "", saved: false }; return json(res, 200, { ok: true, ...hcPublic() }); }
    if (p === "/api/hchat/test" && req.method === "POST") { const t = await ping(hc); return json(res, 200, { ok: true, message: t.slice(0, 60) }); }
    if (p === "/api/hchat/read" && req.method === "POST") { const b = await readBody(req); const r = await readRow(hc, b.image); return json(res, 200, { ok: true, ...r }); }
    return json(res, 404, { ok: false, error: "없는 주소" });
  } catch (e) { return json(res, 200, { ok: false, error: String(e?.message || e) }); }
}

const server = http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, "http://x").pathname); } catch { res.writeHead(400).end(); return; }
  if (p.startsWith("/api/")) { api(req, res, p); return; }
  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405).end(); return; }
  if (p === "/") p = "/index.html";
  for (const [prefix, root] of ROOTS) {
    if (!p.startsWith(prefix)) continue;
    const file = path.normalize(path.join(root, p.slice(prefix.length)));
    if (!file.startsWith(root + path.sep)) break;
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("없는 주소입니다."); return; }
      res.writeHead(200, {
        "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
        "Content-Length": st.size,
        "Cache-Control": prefix.startsWith("/vendor/") ? "public, max-age=86400" : "no-cache",
        "Content-Security-Policy": CSP, "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
      });
      if (req.method === "HEAD") res.end(); else fs.createReadStream(file).pipe(res);
    });
    return;
  }
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("없는 주소입니다.");
});

if (!fs.existsSync(path.join(NM, "pdfjs-dist"))) {
  console.error("필요한 파일이 아직 없습니다. 이 폴더에서  npm install  을 먼저 실행하세요. (start.cmd 는 자동으로 합니다)");
  process.exit(1);
}
server.listen(PORT, HOST, () => {
  console.log(`가족관계증명서 → 엑셀 정리: http://localhost:${PORT}`);
  console.log("증명서 파일은 이 PC 밖으로 나가지 않습니다. 끄려면 이 창을 닫으세요.");
});
