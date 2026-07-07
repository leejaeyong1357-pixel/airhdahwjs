// 프로덕션 실행용 서버 (Node.js 18+ 용, Bun 불필요).
// 사용법: npm run build && npm run start
// dist/client 의 정적 파일을 서빙하고, 나머지 요청은 SSR 핸들러로 넘긴다.
import { createReadStream, existsSync, statSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { join, normalize, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");

// .env 를 process.env 로 로드 (Node는 자동으로 읽지 않음)
const envFile = join(rootDir, ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

const handler = (await import("../dist/server/server.js")).default;

const clientDir = join(rootDir, "dist", "client");
const port = Number(process.env.PORT ?? 3000);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".txt": "text/plain; charset=utf-8",
};

function tryServeStatic(pathname, res) {
  if (pathname === "/" || pathname.includes("..") || pathname.includes("\0")) return false;
  const filePath = normalize(join(clientDir, decodeURIComponent(pathname)));
  if (!filePath.startsWith(clientDir) || !existsSync(filePath)) return false;
  const stat = statSync(filePath);
  if (!stat.isFile()) return false;
  res.writeHead(200, {
    "content-type": MIME[extname(filePath).toLowerCase()] ?? "application/octet-stream",
    "content-length": stat.size,
    "cache-control": pathname.startsWith("/assets/")
      ? "public, max-age=31536000, immutable"
      : "public, max-age=3600",
  });
  createReadStream(filePath).pipe(res);
  return true;
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
    if (tryServeStatic(url.pathname, res)) return;

    const body =
      req.method === "GET" || req.method === "HEAD" ? undefined : Readable.toWeb(req);
    const request = new Request(url, {
      method: req.method,
      headers: req.headers,
      body,
      duplex: body ? "half" : undefined,
    });
    const response = await handler.fetch(request, {}, {});

    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) {
      Readable.fromWeb(response.body).pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    console.error(error);
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end("Internal Server Error");
  }
}).listen(port, "0.0.0.0", () => {
  console.log(`TECZEN 서버 실행 중: http://localhost:${port}`);
});
