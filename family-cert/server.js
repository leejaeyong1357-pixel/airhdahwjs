// 가족관계증명서 → 엑셀 정리 도구 (이 PC 안에서만 동작)
// 서버는 화면 파일만 내어 준다. 증명서 파일은 서버로 올라오지 않고 브라우저 안에서만 읽는다.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULTS, MODELS, readPage, ask, health } from "./hchat.js";

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
  ["/vendor/ort/", path.join(NM, "onnxruntime-web", "dist")],
  ["/vendor/ppocr/", path.join(NM, "@gutenye", "ocr-models", "assets")],
  ["/sample/", path.join(DIR, "sample")],
  ["/", path.join(DIR, "public")],
];
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png",
  ".wasm": "application/wasm", ".gz": "application/gzip", ".pdf": "application/pdf", ".map": "application/json", ".txt": "text/plain; charset=utf-8", ".onnx": "application/octet-stream",
};
// 화면이 인터넷 어디로도 자료를 보낼 수 없게 막는 규칙
const CSP = [
  "default-src 'self'", "connect-src 'self'", "img-src 'self' data: blob:", "worker-src 'self' blob:",
  "script-src 'self' 'wasm-unsafe-eval'", "style-src 'self' 'unsafe-inline'", "object-src 'none'", "base-uri 'none'", "form-action 'none'",
].join("; ");

// ───────── H Chat 판독 (선택 기능)
// 켰을 때만 쓰인다. 키는 기본으로 메모리에만 두고, "이 PC에 저장"을 고르면 data/hchat.json 에 둔다(깃허브에 올라가지 않는 폴더).
// 안내서대로 환경 변수(H_CHAT_API_KEY · H_CHAT_API_PROJECT_ID · H_CHAT_API_MODEL)를 잡아 두었으면 그 값을 처음 값으로 쓴다.
const HC_FILE = path.join(DIR, "data", "hchat.json");
let hc = { ...DEFAULTS, key: process.env.H_CHAT_API_KEY || "", projectId: process.env.H_CHAT_API_PROJECT_ID || "", saved: false };
if (process.env.H_CHAT_API_MODEL) hc.model = process.env.H_CHAT_API_MODEL;
if (process.env.H_CHAT_INSECURE === "1") hc.insecure = true;
try { hc = { ...hc, ...JSON.parse(fs.readFileSync(HC_FILE, "utf8")), saved: true }; } catch { /* 저장된 설정 없음 */ }
const hcPublic = () => ({ baseUrl: hc.baseUrl, model: hc.model, verifyModel: hc.verifyModel, hasKey: !!hc.key, saved: hc.saved, models: MODELS });
const json = (res, code, obj) => res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }).end(JSON.stringify(obj));
function readBody(req, limit = 12 << 20) {
  return new Promise((ok, bad) => {
    const chunks = []; let n = 0;
    req.on("data", c => { n += c.length; if (n > limit) { bad(new Error("그림이 너무 커요")); req.destroy(); } else chunks.push(c); });
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
      if (!/^https?:\/\/[^\s]+$/.test(baseUrl)) return json(res, 200, { ok: false, error: "주소는 http(s):// 로 시작해야 해요." });
      hc = { ...hc, baseUrl, model: String(b.model || "").trim() || DEFAULTS.model, verifyModel: String(b.verifyModel || "").trim() };
      if (hc.verifyModel === hc.model) hc.verifyModel = "";
      if (typeof b.key === "string" && b.key.trim()) hc.key = b.key.trim();
      if (b.save) { fs.mkdirSync(path.dirname(HC_FILE), { recursive: true }); const { saved, insecureAuto, ...keep } = hc; fs.writeFileSync(HC_FILE, JSON.stringify(keep), { mode: 0o600 }); hc.saved = true; }
      else { fs.rmSync(HC_FILE, { force: true }); hc.saved = false; }
      return json(res, 200, { ok: true, ...hcPublic() });
    }
    if (p === "/api/hchat" && req.method === "DELETE") { fs.rmSync(HC_FILE, { force: true }); hc = { ...hc, key: "", saved: false }; return json(res, 200, { ok: true, ...hcPublic() }); }
    // 연결 테스트: ① 통신 확인 ② 각 모델이 시험 그림(숫자가 적힌 작은 그림)을 읽는지
    if (p === "/api/hchat/test" && req.method === "POST") {
      const b = await readBody(req), steps = [];
      const h = await health(hc); steps.push({ name: "통신 확인 (/v1/are-you-okay)", ...h });
      for (const m of [hc.model, hc.verifyModel].filter(Boolean)) {
        try {
          const r = await ask(hc, m, "그림에 적힌 글자를 그대로만 답하세요. 다른 말은 쓰지 마세요.", b.image, 300);
          const hit = b.expect && r.text.replace(/\s+/g, "").includes(String(b.expect).replace(/\s+/g, ""));
          steps.push({ name: `모델 ${m}`, ok: !!hit, detail: hit ? `그림을 읽었어요 (형식: ${r.recipe}, 답: ${r.text.slice(0, 40)})` : `답은 왔지만 그림 속 글자와 달라요 (형식: ${r.recipe}, 답: ${r.text.slice(0, 60)})` });
        } catch (e) { steps.push({ name: `모델 ${m}`, ok: false, detail: String(e?.message || e) }); }
      }
      return json(res, 200, { ok: steps.slice(1).length > 0 && steps.slice(1)[0].ok, steps });
    }
    // 한 쪽 읽기: 주 모델 (+ 교차 확인 모델)
    if (p === "/api/hchat/page" && req.method === "POST") {
      const b = await readBody(req);
      const [a, v] = await Promise.all([readPage(hc, hc.model, b.image), hc.verifyModel ? readPage(hc, hc.verifyModel, b.image).catch(e => ({ error: String(e?.message || e), model: hc.verifyModel })) : null]);
      return json(res, 200, { ok: true, primary: a, verify: v, tokens: (a.tokens || 0) + (v?.tokens || 0) });
    }
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
