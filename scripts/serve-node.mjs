// 프로덕션 실행용 서버 (Node.js 18+ 용, Bun 불필요).
// 사용법: npm run build && npm run start
// dist/client 의 정적 파일을 서빙하고, 나머지 요청은 SSR 핸들러로 넘긴다.
import { createReadStream, existsSync, statSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
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
const port = Number(process.env.PORT ?? 2222);

/**
 * HTTPS 설정 — .env 에 인증서 경로를 넣으면 자동으로 https 로 뜬다.
 *
 *   # 1) 인증서 + 개인키 파일로 받은 경우
 *   SSL_CERT=C:\certs\teczen.crt
 *   SSL_KEY=C:\certs\teczen.key
 *   SSL_CA=C:\certs\chain.crt        (중간 인증서가 따로 있으면)
 *
 *   # 2) 윈도우에서 .pfx 로 받은 경우
 *   SSL_PFX=C:\certs\teczen.pfx
 *   SSL_PASSPHRASE=비밀번호
 *
 * 아무것도 없으면 지금처럼 http 로 뜬다.
 */
function readTls() {
  const { SSL_CERT, SSL_KEY, SSL_CA, SSL_PFX, SSL_PASSPHRASE } = process.env;
  const read = (p, label) => {
    if (!existsSync(p)) throw new Error(`${label} 파일을 찾을 수 없습니다: ${p}`);
    return readFileSync(p);
  };
  try {
    if (SSL_PFX) {
      return {
        pfx: read(SSL_PFX, "SSL_PFX"),
        ...(SSL_PASSPHRASE ? { passphrase: SSL_PASSPHRASE } : {}),
      };
    }
    if (SSL_CERT && SSL_KEY) {
      return {
        cert: read(SSL_CERT, "SSL_CERT"),
        key: read(SSL_KEY, "SSL_KEY"),
        ...(SSL_CA ? { ca: read(SSL_CA, "SSL_CA") } : {}),
      };
    }
  } catch (err) {
    console.error("");
    console.error("!! HTTPS 인증서를 읽지 못했습니다:", err.message);
    console.error("   경로를 확인하세요. 우선 http 로 실행합니다.");
    console.error("");
    return null;
  }
  return null;
}

const tls = readTls();
const scheme = tls ? "https" : "http";
// 기존 http 주소로 들어온 사람을 https 로 넘겨준다 (예: HTTP_REDIRECT_PORT=80)
const redirectPort = Number(process.env.HTTP_REDIRECT_PORT ?? 0);

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

const onRequest = async (req, res) => {
  try {
    const url = new URL(req.url, `${scheme}://${req.headers.host ?? "localhost"}`);
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
};

const server = tls ? createHttpsServer(tls, onRequest) : createServer(onRequest);

server.listen(port, "0.0.0.0", async () => {
  const { networkInterfaces } = await import("node:os");
  const lanIps = Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => i.address);
  console.log("=====================================================");
  console.log(`TECZEN 서버 실행 중  (이 컴퓨터에서: ${scheme}://localhost:${port})`);
  if (lanIps.length) {
    console.log("");
    console.log("직원들에게 공유할 접속 주소:");
    for (const ip of lanIps) console.log(`   ${scheme}://${ip}:${port}`);
    console.log("");
    console.log("접속이 안 되면 윈도우 방화벽에서 포트를 허용하세요 (관리자 명령창):");
    console.log(`   netsh advfirewall firewall add rule name="TECZEN" dir=in action=allow protocol=TCP localport=${port}`);
  }
  // http 로 들어온 요청을 https 로 넘기는 작은 서버
  if (tls && redirectPort) {
    createServer((req, res) => {
      const host = (req.headers.host ?? "").replace(/:\d+$/, "");
      const target = `https://${host}${port === 443 ? "" : `:${port}`}${req.url ?? "/"}`;
      res.writeHead(301, { location: target });
      res.end();
    })
      .listen(redirectPort, "0.0.0.0", () => {
        console.log("");
        console.log(`http://…:${redirectPort} 로 들어오면 https 로 자동 연결됩니다.`);
      })
      .on("error", (err) => {
        console.error("");
        console.error(`!! http→https 전환 포트(${redirectPort})를 열지 못했습니다: ${err.message}`);
        console.error("   80·443 같은 낮은 포트는 관리자 권한이 필요할 수 있습니다.");
      });
  }

  if (!tls) {
    console.log("");
    console.log("※ 지금은 http 입니다. 로그인처럼 정보를 입력하는 화면에서");
    console.log("   브라우저가 '제출하려는 정보가 보안되지 않음' 경고를 띄웁니다.");
    console.log("   사내 포털(https)에 넣으려면 인증서를 받아 .env 에 아래를 넣으세요:");
    console.log("      SSL_CERT=인증서경로   SSL_KEY=개인키경로");
    console.log("      (또는 SSL_PFX=pfx경로  SSL_PASSPHRASE=비밀번호)");
  }
  console.log("=====================================================");
});
