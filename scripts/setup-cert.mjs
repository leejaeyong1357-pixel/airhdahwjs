// 회사(공인) 인증서 적용 — 전산팀에서 받은 파일을 certs/ 에 넣고 실행한다.
//   npm run cert:setup
//
// 1) certs/ 안의 파일을 읽어 리프 인증서·중간/루트 체인·개인키를 알아서 구분한다
// 2) 적용 전에 유효기간·등록 도메인(SAN)·키 짝·체인을 확인해 보여준다
// 3) 리프 + 중간 인증서(루트 제외)를 certs/active/cert.pem 으로,
//    개인키를 certs/active/key.pem 으로 저장한다
// 4) 경로와 개인키 암호를 .env.local (git 에 안 올라감) 에 넣는다
//    → 서버를 켤 때마다 암호를 입력할 필요가 없다
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, statSync, rmSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { networkInterfaces } from "node:os";
import { lookup } from "node:dns/promises";
import { createInterface } from "node:readline";
import {
  parseBlocks, buildChain, isSelfSigned, sanNames, domainMatches, cnOf, daysLeft, fmtDate, openKey,
} from "./tls-util.mjs";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const certDir = join(rootDir, "certs");
const outDir = join(certDir, "active");
const envLocal = join(rootDir, ".env.local");
const DEFAULT_DOMAIN = "vibe.teczen.kr";

const line = () => console.log("─────────────────────────────────────────────");
const fail = (msg, ...more) => {
  console.error("");
  console.error("!! " + msg);
  for (const m of more) console.error("   " + m);
  console.error("");
  process.exit(1);
};

/** .env 형식 파일을 { 키: 값 } 으로 */
function readEnv(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const l of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

/** 화면에 안 보이게 암호 입력받기 */
function askHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let muted = false;
    rl._writeToOutput = (s) => {
      if (!muted) rl.output.write(s);
      else if (s.includes("\n") || s.includes("\r")) rl.output.write("\n");
      else rl.output.write("*");
    };
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
    muted = true;
  });
}

function ask(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (a) => {
      rl.close();
      resolve(a.trim());
    });
  });
}

// ── 0. 예전 자체 서명 인증서 정리 ────────────────────────────
if (!existsSync(certDir)) {
  mkdirSync(certDir, { recursive: true });
  fail(
    "certs 폴더가 비어 있습니다.",
    `전산팀에서 받은 인증서 파일 3개를 여기에 넣고 다시 실행하세요: ${certDir}`,
  );
}
for (const f of readdirSync(certDir)) {
  if (/^axlab\./i.test(f) || f === "직원-설치안내.txt") {
    rmSync(join(certDir, f), { force: true });
    console.log(`예전 자체 서명 인증서 삭제: certs\\${f}`);
  }
}

// ── 1. 파일 읽기 ─────────────────────────────────────────────
const files = readdirSync(certDir)
  .filter((f) => statSync(join(certDir, f)).isFile())
  .filter((f) => [".pem", ".crt", ".cer", ".key", ".ca-bundle"].includes(extname(f).toLowerCase()));

const certs = [];
const keys = [];
console.log("");
console.log("certs 폴더에서 찾은 파일:");
for (const f of files) {
  let parsed;
  try {
    parsed = parseBlocks(readFileSync(join(certDir, f)));
  } catch (err) {
    console.log(`   ${f}  → 읽을 수 없음 (${err.message})`);
    continue;
  }
  const kinds = [];
  if (parsed.certs.length) kinds.push(`인증서 ${parsed.certs.length}개`);
  for (const k of parsed.keys) kinds.push(k.encrypted ? "개인키 (암호로 잠김)" : "개인키");
  console.log(`   ${f}  → ${kinds.join(", ") || "인증서/키 아님"}`);
  for (const x of parsed.certs) {
    if (!certs.some((c) => c.fingerprint256 === x.fingerprint256)) certs.push(Object.assign(x, { file: f }));
  }
  for (const k of parsed.keys) keys.push({ ...k, file: f });
}

if (!keys.length) fail("개인키 파일을 찾지 못했습니다.", "전산팀에서 받은 key 파일을 certs 폴더에 넣었는지 확인하세요.");
const leaves = certs.filter((x) => !x.ca && !isSelfSigned(x));
if (!leaves.length) fail("서버 인증서(리프)를 찾지 못했습니다.", "전산팀에서 받은 cert 파일을 certs 폴더에 넣었는지 확인하세요.");

// ── 2. 개인키 열기 (암호) ────────────────────────────────────
const saved = { ...readEnv(join(rootDir, ".env")), ...readEnv(envLocal) };
let passphrase = saved.SSL_PASSPHRASE ?? "";
const needsPass = keys.some((k) => k.encrypted);
const tryOpen = (pw) => keys.map((k) => ({ ...k, obj: openKey(k.pem, pw) })).filter((k) => k.obj);

let opened = tryOpen(passphrase);
if (needsPass && !opened.length) {
  console.log("");
  console.log("개인키가 암호로 잠겨 있습니다. 전산팀에서 받은 암호를 입력하세요.");
  console.log("(입력한 글자는 * 로 보입니다. 붙여넣기는 마우스 오른쪽 클릭)");
  for (let i = 0; i < 3 && !opened.length; i++) {
    passphrase = (await askHidden("개인키 암호: ")).trim();
    opened = tryOpen(passphrase);
    if (!opened.length) console.log("   암호가 맞지 않습니다. 다시 입력하세요.");
  }
  if (!opened.length) fail("개인키 암호가 맞지 않습니다.", "전산팀에서 받은 암호를 다시 확인하세요.");
}

// ── 3. 키와 짝이 맞는 리프 고르기 (여러 개면 만료가 가장 늦은 것) ─────
const pairs = [];
for (const leaf of leaves) {
  const key = opened.find((k) => leaf.checkPrivateKey(k.obj));
  if (key) pairs.push({ leaf, key });
}
if (!pairs.length) {
  fail(
    "인증서와 개인키가 서로 짝이 아닙니다.",
    "같이 받은 파일인지 확인하세요. 예전 파일이 섞여 있으면 지우고 새 파일만 남기세요.",
  );
}
pairs.sort((a, b) => new Date(b.leaf.validTo) - new Date(a.leaf.validTo));
const { leaf, key } = pairs[0];
if (leaves.length > 1) {
  console.log("");
  console.log(`서버 인증서가 ${leaves.length}개 있어 만료일이 가장 늦은 것을 씁니다: ${leaf.file}`);
}
const { chain, missing } = buildChain(leaf, certs);

// ── 4. 확인 결과 ─────────────────────────────────────────────
const names = sanNames(leaf);
const domain = (process.argv[2] ?? saved.SITE_DOMAIN ?? DEFAULT_DOMAIN)
  .replace(/^https?:\/\//, "")
  .replace(/[:/].*$/, "")
  .trim()
  .toLowerCase();
const left = daysLeft(leaf);
const notYet = new Date(leaf.validFrom) > new Date();
const problems = [];

console.log("");
line();
console.log("적용 전 확인");
line();
console.log(`서버 인증서   ${leaf.file}`);
console.log(`  발급 대상   ${cnOf(leaf.subject)}`);
console.log(`  발급자      ${cnOf(leaf.issuer)}`);
console.log(`  유효기간    ${fmtDate(leaf.validFrom)} ~ ${fmtDate(leaf.validTo)}`
  + (left >= 0 ? `  (${left}일 남음)` : "  (만료됨)"));
console.log(`  등록 도메인 ${names.join(", ") || "(없음)"}`);
console.log(`개인키        ${key.file}${key.encrypted ? " (암호로 잠김 — 암호 확인 완료)" : ""}`);
console.log(`  인증서와 짝 맞음`);
console.log("체인 (서버가 보내는 순서)");
chain.forEach((c, i) =>
  console.log(`  ${i + 1}. ${cnOf(c.subject)}  ${i === 0 ? "← 서버 인증서" : "← 중간 인증서"}  ~${fmtDate(c.validTo)}`),
);
const root = certs.find((c) => isSelfSigned(c) && chain.at(-1).checkIssued(c));
if (root) console.log(`  (루트 ${cnOf(root.subject)} 는 넣지 않음 — 직원 PC 에 이미 있음)`);

for (const c of chain.slice(1)) {
  if (daysLeft(c) < 0) problems.push(`중간 인증서(${cnOf(c.subject)})가 만료됐습니다.`);
}
if (notYet) problems.push(`아직 유효기간이 시작되지 않았습니다 (${fmtDate(leaf.validFrom)} 부터).`);
if (left < 0) problems.push("인증서가 만료됐습니다. 전산팀에 새 인증서를 요청하세요.");
else if (left < 30) console.log(`\n※ 만료까지 ${left}일 남았습니다. 전산팀에 갱신을 미리 요청하세요.`);
if (missing) {
  problems.push(
    "중간 인증서를 찾지 못했습니다. Chain/Bundle 파일도 certs 폴더에 넣었는지 확인하세요.",
  );
}

console.log("");
console.log(`접속 도메인   ${domain}`);
if (domainMatches(domain, names)) {
  console.log(`  인증서에 포함됨 → https://${domain}:${saved.PORT ?? 2222} 로 접속하면 경고 없음`);
} else {
  problems.push(
    `${domain} 은 이 인증서에 없습니다. 등록 도메인(${names.join(", ")}) 중 하나로 접속해야 합니다.`
    + `  다른 주소를 쓰려면: npm run cert:setup -- 주소`,
  );
}
console.log("  ※ IP 주소(예: https://10.x.x.x:2222)로 접속하면 인증서 오류가 납니다. 반드시 도메인으로.");

// DNS — 도메인이 이 서버를 가리키는지
const lanIps = Object.values(networkInterfaces())
  .flat()
  .filter((i) => i && i.family === "IPv4" && !i.internal)
  .map((i) => i.address);
let resolved = null;
try {
  resolved = (await lookup(domain, { family: 4 })).address;
} catch {
  /* 등록 안 됨 */
}
console.log("");
if (resolved && lanIps.includes(resolved)) {
  console.log(`DNS           ${domain} → ${resolved} (이 서버) — 직원 PC 에서 따로 할 일 없음`);
} else {
  const ip = lanIps[0] ?? "<서버 IP>";
  console.log(
    resolved
      ? `DNS           ${domain} → ${resolved}  ※ 이 서버 IP(${lanIps.join(", ")}) 와 다릅니다`
      : `DNS           ${domain} 이 사내 DNS 에 등록돼 있지 않습니다`,
  );
  console.log("  해결: 전산팀에 사내 DNS 등록을 요청하거나 (권장),");
  console.log("        접속할 PC 의 hosts 파일에 아래 한 줄을 추가합니다 (관리자 권한 메모장 필요):");
  console.log("          파일: C:\\Windows\\System32\\drivers\\etc\\hosts");
  console.log(`          추가: ${ip} ${domain}`);
}

if (problems.length) {
  console.log("");
  line();
  for (const p of problems) console.log("!! " + p);
  line();
  console.log("위 문제 때문에 적용하지 않았습니다.");
  process.exit(1);
}

console.log("");
const yes = await ask("이대로 적용할까요? (Y/n) ");
if (/^n/i.test(yes)) {
  console.log("취소했습니다.");
  process.exit(0);
}

// ── 5. 적용 ─────────────────────────────────────────────────
mkdirSync(outDir, { recursive: true });
const certOut = join(outDir, "cert.pem");
const keyOut = join(outDir, "key.pem");
writeFileSync(certOut, chain.map((c) => c.toString().trim()).join("\n") + "\n");
writeFileSync(keyOut, key.pem);

// .env.local 갱신 — 다른 줄은 그대로 두고 인증서 관련 줄만 바꾼다
const set = {
  SSL_CERT: certOut,
  SSL_KEY: keyOut,
  SITE_DOMAIN: domain,
  ...(key.encrypted ? { SSL_PASSPHRASE: passphrase } : {}),
};
const drop = new Set(["SSL_CA", "SSL_PFX", ...(key.encrypted ? [] : ["SSL_PASSPHRASE"])]);
const kept = (existsSync(envLocal) ? readFileSync(envLocal, "utf8").split(/\r?\n/) : []).filter((l) => {
  const k = l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1];
  return !(k && (k in set || drop.has(k))) && l.trim() !== "" && !l.startsWith("# HTTPS");
});
writeFileSync(
  envLocal,
  [...kept, "# HTTPS — npm run cert:setup 이 넣은 값 (git 에 올라가지 않음)",
    ...Object.entries(set).map(([k, v]) => `${k}=${v}`)].join("\r\n") + "\r\n",
);

// .env 에 예전 자체 서명 설정이 남아 있으면 지운다 (.env 는 git 에 올라가는 파일이라 비밀을 두지 않는다)
const envPath = join(rootDir, ".env");
if (existsSync(envPath)) {
  const before = readFileSync(envPath, "utf8");
  const eol = before.includes("\r\n") ? "\r\n" : "\n";
  const after =
    before
      .split(/\r?\n/)
      .filter((l) => !/^\s*SSL_[A-Z]+\s*=/.test(l) && !l.startsWith("# HTTPS — npm run cert"))
      .join(eol)
      .replace(/(\r?\n)+$/, "") + eol;
  if (after !== before) {
    writeFileSync(envPath, after);
    console.log("");
    console.log(".env 에 남아 있던 예전 인증서 설정을 지웠습니다.");
  }
}

console.log("");
line();
console.log("적용했습니다.");
console.log(`   ${certOut}   (서버 인증서 + 중간 인증서)`);
console.log(`   ${keyOut}`);
console.log(`   ${envLocal}   (경로·암호 — git 에 올라가지 않음)`);
line();
console.log("서버를 다시 켜세요 (켜져 있으면 Ctrl+C 로 끄고):");
console.log("   npm start");
console.log("");
console.log(`접속 주소: https://${domain}:${saved.PORT ?? 2222}`);
console.log("");
