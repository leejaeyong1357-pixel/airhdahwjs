// 프로덕션 실행용 서버 (Node.js 18+ 용, Bun 불필요).
// 사용법: npm run build && npm run start
// dist/client 의 정적 파일을 서빙하고, 나머지 요청은 SSR 핸들러로 넘긴다.
import { createReadStream, existsSync, statSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { createSecureContext } from "node:tls";
import { createServer as createNetServer } from "node:net";
import {
  parseBlocks, buildChain, isSelfSigned, sanNames, domainMatches, cnOf, daysLeft, fmtDate,
} from "./tls-util.mjs";
import { join, normalize, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");

// .env 를 process.env 로 로드 (Node는 자동으로 읽지 않음)
// .env.local 을 먼저 읽어 우선한다. 인증서 경로·암호처럼 이 서버에만 있고
// 저장소(git)에 올라가면 안 되는 값은 .env.local 에 둔다.
for (const name of [".env.local", ".env"]) {
  const envFile = join(rootDir, name);
  if (!existsSync(envFile)) continue;
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
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
  let opts = null;
  try {
    if (SSL_PFX) {
      opts = {
        pfx: read(SSL_PFX, "SSL_PFX"),
        ...(SSL_PASSPHRASE ? { passphrase: SSL_PASSPHRASE } : {}),
      };
    } else if (SSL_CERT && SSL_KEY) {
      let cert = read(SSL_CERT, "SSL_CERT");
      // 체인 파일을 따로 줬으면 서버 인증서 뒤에 중간 인증서를 순서대로 붙인다 (루트 제외).
      // ca 옵션으로 넘기면 브라우저에 중간 인증서가 안 갈 수 있다.
      if (SSL_CA) {
        const pool = parseBlocks(read(SSL_CA, "SSL_CA")).certs;
        const own = parseBlocks(cert).certs;
        if (own.length === 1) {
          const { chain } = buildChain(own[0], pool);
          cert = Buffer.from(chain.map((c) => c.toString().trim()).join("\n") + "\n");
        }
      }
      opts = {
        cert,
        key: read(SSL_KEY, "SSL_KEY"),
        // 개인키가 암호로 잠겨 있으면(회사 인증서처럼) 그 암호
        ...(SSL_PASSPHRASE ? { passphrase: SSL_PASSPHRASE } : {}),
      };
    }
    if (!opts) return null;
    // 미리 한 번 열어본다. 암호가 틀리거나 인증서·키 짝이 안 맞으면
    // 서버를 띄우는 순간 죽어버리므로, 여기서 잡아 이유를 알려준다.
    createSecureContext(opts);
    return opts;
  } catch (err) {
    const msg = String(err?.message ?? err);
    let hint = "경로를 확인하세요.";
    if (/bad decrypt|bad password|mac verify|wrong password/i.test(msg)) {
      hint = "개인키 암호(SSL_PASSPHRASE)가 틀렸습니다. 받은 암호를 다시 확인하세요.";
    } else if (/no start line|bad base64|PEM/i.test(msg) && !SSL_PASSPHRASE) {
      hint = "개인키가 암호로 잠겨 있을 수 있습니다. SSL_PASSPHRASE 를 넣어보세요.";
    } else if (/key values mismatch|KEY_VALUES_MISMATCH/i.test(msg)) {
      hint = "인증서와 개인키가 서로 짝이 아닙니다. 같이 받은 파일인지 확인하세요.";
    }
    console.error("");
    console.error("!! HTTPS 인증서를 쓸 수 없습니다:", msg);
    console.error("   " + hint);
    console.error("   우선 http 로 실행합니다.");
    console.error("");
    return null;
  }
}

// 메모장으로 만들면 .env.local.txt 로 저장되는 일이 잦다 — 그러면 설정이 안 읽힌다
if (existsSync(join(rootDir, ".env.local.txt"))) {
  console.error("");
  console.error("!! .env.local.txt 파일이 있습니다. 이름이 .env.local 이어야 읽힙니다.");
  console.error("   명령창에서:  ren .env.local.txt .env.local");
  console.error("");
}

const tls = readTls();
const scheme = tls ? "https" : "http";

/** 지금 쓰는 인증서가 무엇인지 — 회사 인증서가 맞게 들어갔는지 눈으로 확인하는 용도 */
function describeCert() {
  if (!tls?.cert) return null;
  try {
    const [x, ...rest] = parseBlocks(tls.cert).certs;
    if (!x) return null;
    return {
      file: process.env.SSL_CERT,
      subject: cnOf(x.subject),
      issuer: cnOf(x.issuer),
      selfSigned: isSelfSigned(x),
      from: fmtDate(x.validFrom),
      to: fmtDate(x.validTo),
      left: daysLeft(x),
      names: sanNames(x),
      intermediates: rest.length,
    };
  } catch {
    return null;
  }
}
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

    const headers = Object.fromEntries(response.headers);
    // HTML 은 절대 캐시하지 않는다.
    // 캐시하면 재빌드 뒤에도 브라우저가 옛날 HTML 을 들고 있는데,
    // 거기 적힌 JS 파일은 이름이 바뀌어 사라진 뒤라 404 가 난다.
    // 그러면 자바스크립트가 안 붙어서 화면이 먹통이 되거나,
    // 폼이 브라우저 방식으로 전송되며 보안 경고가 뜬다.
    const type = headers["content-type"] ?? "";
    if (type.includes("text/html")) {
      headers["cache-control"] = "no-store, must-revalidate";
      headers["pragma"] = "no-cache";
      headers["expires"] = "0";
    }

    res.writeHead(response.status, headers);
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

/**
 * http 로 들어온 요청을 같은 주소의 https 로 보낸다.
 * IP 로 들어왔으면 인증서에 맞는 도메인(SITE_DOMAIN)으로 바꿔서 보낸다.
 * 302 — POST 로 들어와도(그룹웨어 링크) GET 으로 바뀌어 로그인 화면이 열린다.
 */
function redirectToHttps(req, res) {
  const domain = (process.env.SITE_DOMAIN ?? "").trim();
  let host = req.headers.host ?? `localhost:${port}`;
  if (domain && /^[\d.]+(:\d+)?$/.test(host)) host = `${domain}:${port}`;
  res.writeHead(302, { location: `https://${host}${req.url ?? "/"}`, "cache-control": "no-store" });
  res.end();
}

let server;
if (tls) {
  // 한 포트에서 https 와 http 를 같이 받는다.
  // 첫 바이트가 0x16 이면 TLS(https), 아니면 평문 http → https 로 넘긴다.
  // (그룹웨어 링크가 아직 http:// 여도 '어쨌든 보내기' 하면 https 로 들어온다)
  const httpsServer = createHttpsServer(tls, onRequest);
  const plainServer = createServer(redirectToHttps);
  server = createNetServer((socket) => {
    socket.on("error", () => socket.destroy());
    socket.setTimeout(15_000, () => socket.destroy());
    socket.once("data", (buf) => {
      socket.setTimeout(0);
      socket.pause();
      socket.unshift(buf);
      (buf[0] === 0x16 ? httpsServer : plainServer).emit("connection", socket);
      process.nextTick(() => socket.resume());
    });
  });
} else {
  server = createServer(onRequest);
}

server.listen(port, "0.0.0.0", async () => {
  const { networkInterfaces } = await import("node:os");
  const lanIps = Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => i.address);
  console.log("=====================================================");
  console.log(`TECZEN 서버 실행 중  (이 컴퓨터에서: ${scheme}://localhost:${port})`);
  const info = describeCert();
  const domain = (process.env.SITE_DOMAIN ?? "").trim();
  if (info) {
    console.log("");
    console.log(info.selfSigned ? "사용 중인 인증서: 자체 서명 (사설)" : "사용 중인 인증서: 공인 인증서");
    console.log(`   파일        ${info.file}`);
    console.log(`   발급 대상   ${info.subject}`);
    console.log(`   발급자      ${info.issuer}`);
    console.log(`   유효기간    ${info.from} ~ ${info.to}` + (info.left >= 0 ? ` (${info.left}일 남음)` : " (만료됨)"));
    console.log(`   등록 도메인 ${info.names.join(", ") || "(없음)"}`);
    if (info.selfSigned) {
      console.log("   ※ 자체 서명 인증서라 직원 브라우저에 '안전하지 않음' 경고가 뜹니다.");
      console.log("     회사 인증서 파일을 certs 폴더에 넣고  npm run cert:setup  을 실행하세요.");
    } else {
      if (!info.intermediates) {
        console.log("   ※ 중간 인증서가 빠져 있어 일부 PC 에서 경고가 뜰 수 있습니다. npm run cert:setup 을 다시 실행하세요.");
      }
      if (info.left < 0) console.log("   !! 인증서가 만료됐습니다. 전산팀에 새 인증서를 요청하세요.");
      else if (info.left < 30) console.log(`   ※ 만료까지 ${info.left}일 — 전산팀에 갱신을 미리 요청하세요.`);
    }
    if (domain && !domainMatches(domain, info.names)) {
      console.log(`   !! ${domain} 은 이 인증서에 없는 주소입니다. 이 주소로 접속하면 인증서 오류가 납니다.`);
    }
  }
  if (tls && domain) {
    // 도메인 인증서는 IP 로 접속하면 '주소가 다르다'는 오류가 난다 — 도메인만 안내한다.
    console.log("");
    console.log("직원들에게 공유할 접속 주소:");
    console.log(`   https://${domain}${port === 443 ? "" : `:${port}`}`);
    console.log("   (IP 주소로 접속하면 인증서 오류가 납니다. 반드시 위 도메인으로 접속하세요)");
  } else if (lanIps.length) {
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
    console.log("   https 로 바꾸려면 회사 인증서 파일을 certs 폴더에 넣고:");
    console.log("      npm run cert:setup");
  }
  console.log("=====================================================");
});
