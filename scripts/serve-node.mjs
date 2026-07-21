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
// public/ 은 런타임 폴백 — 관리자 [사진 관리] 업로드(public/uploads)가 재빌드 없이 반영된다
const publicDir = join(rootDir, "public");
const port = Number(process.env.PORT ?? 7262);

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
  const decoded = decodeURIComponent(pathname);
  // 업로드 파일(/uploads, /media)은 public/ 을 먼저 봐서 빌드 이후 추가분이 반영되게 한다
  const baseDirs =
    decoded.startsWith("/uploads/") || decoded.startsWith("/media/")
      ? [publicDir, clientDir]
      : [clientDir, publicDir];
  for (const base of baseDirs) {
    const filePath = normalize(join(base, decoded));
    if (!filePath.startsWith(base) || !existsSync(filePath)) continue;
    const stat = statSync(filePath);
    if (!stat.isFile()) continue;
    res.writeHead(200, {
      "content-type": MIME[extname(filePath).toLowerCase()] ?? "application/octet-stream",
      "content-length": stat.size,
      "cache-control": pathname.startsWith("/assets/")
        ? "public, max-age=31536000, immutable"
        : "no-cache",
    });
    createReadStream(filePath).pipe(res);
    return true;
  }
  return false;
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
}).listen(port, "0.0.0.0", async () => {
  const { networkInterfaces } = await import("node:os");
  const lanIps = Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => i.address);
  console.log("=====================================================");
  console.log(`TECZEN 서버 실행 중  (이 컴퓨터에서: http://localhost:${port})`);
  if (lanIps.length) {
    console.log("");
    console.log("직원들에게 공유할 접속 주소:");
    for (const ip of lanIps) console.log(`   http://${ip}:${port}`);
    console.log("");
    console.log("접속이 안 되면 윈도우 방화벽에서 포트를 허용하세요 (관리자 명령창):");
    console.log(`   netsh advfirewall firewall add rule name="TECZEN" dir=in action=allow protocol=TCP localport=${port}`);
  }
  console.log("=====================================================");
});
