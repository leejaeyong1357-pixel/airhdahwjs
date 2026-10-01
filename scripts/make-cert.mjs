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
const extraNames = process.argv.slice(2); // npm run cert -- axlab.company.local

const allDns = [...new Set([...dnsNames, ...extraNames])];
const allIps = [...new Set([...ips, "127.0.0.1"])];

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
CN = ${host}
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
console.log("※ 자체 서명 인증서라 직원 PC 에서 처음 접속할 때 경고가 뜹니다.");
console.log("   경고를 없애려면 아래 파일을 전산팀에 전달해 GPO 로 배포하세요.");
console.log(`   (직원 PC 의 '신뢰할 수 있는 루트 인증 기관'에 설치하면 경고가 사라집니다)`);
console.log("");
console.log(`   배포용 인증서: ${crtPath}`);
if (existsSync(crtPath)) {
  const pem = readFileSync(crtPath, "utf8");
  if (!pem.includes("BEGIN CERTIFICATE")) console.warn("   (형식 확인 필요)");
}
console.log("");
