// 자체 서명 SSL 인증서 생성기 — 사내망 전용.
// 사용법: npm run cert
//
// 이 PC 의 모든 사내 IP·컴퓨터이름·localhost 를 인증서에 넣는다.
// (주소가 인증서에 없으면 그 주소로 접속할 때 또 경고가 뜬다)
//
// 만들어진 파일은 certs/ 에 저장되고, .env 에 넣을 줄을 화면에 띄워준다.
import { execFileSync, execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { networkInterfaces, hostname } from "node:os";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const certDir = join(rootDir, "certs");
const YEARS = 5;

// ── 이 서버로 접속할 수 있는 모든 주소 모으기 ──────────────
const ips = Object.values(networkInterfaces())
  .flat()
  .filter((i) => i && i.family === "IPv4" && !i.internal)
  .map((i) => i.address);
const host = hostname();
const dnsNames = ["localhost", host, ...(host.includes(".") ? [] : [`${host}.local`])];

// 직원들이 실제로 쓰는 주소를 넣어야 한다.
//   npm run cert -- vibe.teczen.kr
// .env 의 SITE_DOMAIN 에 적어두면 매번 안 써도 된다.
const envDomain = (process.env.SITE_DOMAIN ?? "").trim();
const extraNames = [...process.argv.slice(2), ...(envDomain ? [envDomain] : [])]
  .map((s) => s.trim().replace(/^https?:\/\//, "").replace(/[:/].*$/, ""))
  .filter(Boolean);

const allDns = [...new Set([...extraNames, ...dnsNames])];
const allIps = [...new Set([...ips, "127.0.0.1"])];

if (!extraNames.length) {
  console.log("");
  console.log("⚠️  접속 도메인을 지정하지 않았습니다.");
  console.log("   직원들이 도메인으로 접속한다면 그 주소를 꼭 넣어야 합니다.");
  console.log("   안 넣으면 접속할 때 '주소가 인증서와 다르다'는 오류가 더 뜹니다.");
  console.log("");
  console.log("   예)  npm run cert -- vibe.teczen.kr");
  console.log("");
}

console.log("");
console.log("이 인증서에 들어갈 주소:");
for (const d of allDns) console.log(`   https://${d}:포트`);
for (const i of allIps) console.log(`   https://${i}:포트`);
console.log("");

// ── openssl 찾기 (Git for Windows 에 들어있다) ─────────────
function findOpenssl() {
  const candidates = [
    "openssl",
    "C:\\Program Files\\Git\\usr\\bin\\openssl.exe",
    "C:\\Program Files (x86)\\Git\\usr\\bin\\openssl.exe",
  ];
  for (const bin of candidates) {
    try {
      execFileSync(bin, ["version"], { stdio: "pipe" });
      return bin;
    } catch {
      /* 다음 후보 */
    }
  }
  return null;
}

mkdirSync(certDir, { recursive: true });
const keyPath = join(certDir, "axlab.key");
const crtPath = join(certDir, "axlab.crt");

const openssl = findOpenssl();
let envLines = [];

if (openssl) {
  const san = [
    ...allDns.map((d) => `DNS:${d}`),
    ...allIps.map((i) => `IP:${i}`),
  ].join(",");
  const cnfPath = join(certDir, "openssl.cnf");
  writeFileSync(
    cnfPath,
    `[req]
distinguished_name = dn
x509_extensions = v3
prompt = no

[dn]
CN = ${allDns[0]}
O = TECZEN
OU = AX LAB

[v3]
subjectAltName = ${san}
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature,keyEncipherment
extendedKeyUsage = serverAuth
`,
  );

  execFileSync(openssl, [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes",
    "-keyout", keyPath, "-out", crtPath,
    "-days", String(YEARS * 365),
    "-config", cnfPath,
  ], { stdio: "pipe" });
  rmSync(cnfPath, { force: true });

  console.log("인증서를 만들었습니다 (openssl).");
  console.log(`   ${crtPath}`);
  console.log(`   ${keyPath}`);
  console.log("");
  console.log("─────────────────────────────────────────────");
  console.log(".env 파일에 아래 두 줄을 추가하세요:");
  console.log("");
  console.log(`SSL_CERT=${crtPath}`);
  console.log(`SSL_KEY=${keyPath}`);
  console.log("─────────────────────────────────────────────");
  envLines = [`SSL_CERT=${crtPath}`, `SSL_KEY=${keyPath}`];
} else if (process.platform === "win32") {
  // openssl 이 없으면 윈도우 기본 기능으로 .pfx 를 만든다
  const pfxPath = join(certDir, "axlab.pfx");
  const pw = Math.random().toString(36).slice(2, 12);
  const dnsArg = allDns.concat(allIps).map((n) => `"${n}"`).join(",");
  const ps = `
$ErrorActionPreference = "Stop"
$c = New-SelfSignedCertificate \`
  -DnsName ${dnsArg} \`
  -CertStoreLocation "Cert:\\CurrentUser\\My" \`
  -NotAfter (Get-Date).AddYears(${YEARS}) \`
  -KeyExportPolicy Exportable \`
  -FriendlyName "TECZEN AX LAB"
$pw = ConvertTo-SecureString -String "${pw}" -Force -AsPlainText
Export-PfxCertificate -Cert $c -FilePath "${pfxPath}" -Password $pw | Out-Null
Export-Certificate  -Cert $c -FilePath "${crtPath}" -Type CERT | Out-Null
`;
  execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${ps.replace(/"/g, '\\"').replace(/\n/g, " ")}"`, { stdio: "pipe" });

  console.log("인증서를 만들었습니다 (윈도우 기본 기능).");
  console.log(`   ${pfxPath}`);
  console.log("");
  console.log("─────────────────────────────────────────────");
  console.log(".env 파일에 아래 두 줄을 추가하세요:");
  console.log("");
  console.log(`SSL_PFX=${pfxPath}`);
  console.log(`SSL_PASSPHRASE=${pw}`);
  console.log("─────────────────────────────────────────────");
  envLines = [`SSL_PFX=${pfxPath}`, `SSL_PASSPHRASE=${pw}`];
} else {
  console.error("openssl 을 찾지 못했습니다. Git for Windows 를 설치했는지 확인하세요.");
  process.exit(1);
}

/** .env 에 설정을 넣어준다. 이미 SSL 설정이 있으면 건드리지 않는다. */
function writeEnv(lines) {
  const envPath = join(rootDir, ".env");
  const before = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  if (/^\s*SSL_(CERT|PFX)\s*=/m.test(before)) {
    console.log("");
    console.log("※ .env 에 이미 SSL 설정이 있어 그대로 두었습니다.");
    console.log("   새로 만든 인증서를 쓰려면 위 내용으로 직접 바꿔주세요.");
    return;
  }
  if (before) writeFileSync(`${envPath}.bak`, before); // 혹시 모르니 백업
  const add = `\n# HTTPS — npm run cert 로 만든 자체 서명 인증서\n${lines.join("\n")}\n`;
  writeFileSync(envPath, before + add);
  console.log("");
  console.log(`.env 에 설정을 넣었습니다. (${envPath})`);
  if (before) console.log("   기존 .env 는 .env.bak 으로 백업했습니다.");
}

writeEnv(envLines);

console.log("");
console.log("그 다음 서버를 다시 시작하면 https 로 뜹니다:");
console.log("   npm run build");
console.log("   npm start");
console.log("");
// 직원에게 그대로 보낼 설치 안내문을 같이 만들어 둔다.
const site = allDns[0];
const guidePath = join(certDir, "직원-설치안내.txt");
writeFileSync(guidePath, `AX LAB 접속 전 1회만 하면 되는 설정

같이 받은 "${crtPath.split(/[\\/]/).pop()}" 파일을 바탕화면에 두고,
아래 둘 중 편한 방법으로 한 번만 설치해 주세요.
설치하면 "이 사이트는 안전하지 않습니다" 경고가 사라집니다.


[방법 1] 파일을 더블클릭해서 설치
  1. 인증서 파일 더블클릭
  2. [인증서 설치] 클릭
  3. 저장소 위치: "현재 사용자" 선택 → [다음]
  4. "모든 인증서를 다음 저장소에 저장" 선택 → [찾아보기]
  5. "신뢰할 수 있는 루트 인증 기관" 선택 → [확인] → [다음] → [마침]
  6. 보안 경고가 뜨면 [예]
  7. 브라우저를 완전히 껐다가 다시 켜기


[방법 2] 명령어 한 줄 (빠름)
  시작 메뉴에서 "PowerShell" 검색 → 실행 후 아래를 붙여넣고 엔터

  Import-Certificate -FilePath "$env:USERPROFILE\\Desktop\\${crtPath.split(/[\\/]/).pop()}" -CertStoreLocation Cert:\\CurrentUser\\Root

  (관리자 권한 없어도 됩니다)
  끝나면 브라우저를 완전히 껐다가 다시 켜기


접속 주소: https://${site}:2222

문의: 미래성장팀 이재용
`, "utf8");

console.log("※ 자체 서명 인증서입니다. 직원 PC 에 이 인증서를 설치해야");
console.log("   '안전하지 않음' 경고 없이 접속됩니다. 설치 전에는 경고가 뜹니다.");
console.log("");
console.log(`   직원에게 보낼 파일 2개:`);
console.log(`     ${crtPath}`);
console.log(`     ${guidePath}`);
console.log("");
console.log("   (전산팀이 GPO 로 배포해 주면 직원이 따로 할 일은 없습니다)");
if (existsSync(crtPath)) {
  const pem = readFileSync(crtPath, "utf8");
  if (!pem.includes("BEGIN CERTIFICATE")) console.warn("   (형식 확인 필요)");
}
console.log("");
