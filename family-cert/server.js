// 가족관계증명서 → 엑셀 정리 도구 (이 PC 안에서만 동작)
// 서버는 화면 파일만 내어 준다. 증명서 파일은 서버로 올라오지 않고 브라우저 안에서만 읽는다.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

const server = http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, "http://x").pathname); } catch { res.writeHead(400).end(); return; }
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
