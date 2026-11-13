// 표준소스코드 — 처음 열었을 때 들어 있는 기본 코드.
// 관리자가 화면에서 추가 · 수정하면 data/db.json 의 axCodeLib 에 저장되고, 그때부터는 그 내용을 쓴다.
// 모두 Node.js(Express) 기준이며 비밀값(비밀번호 · 키)은 코드에 넣지 않고 환경변수(.env)로 받는다.

export type AxCodeItem = {
  id: string;
  /** 분류 — 보안 / 권한 / 활용도 … */
  category: string;
  title: string;
  /** 상세설명 — 무엇을 하는 코드인지, 어떻게 쓰는지 */
  description: string;
  language: string;
  code: string;
  updatedAt?: string;
  updatedByName?: string;
};

export const AX_CODE_DEFAULTS: AxCodeItem[] = [
  // ── 보안 ───────────────────────────────────────────────
  {
    id: "security-grade",
    category: "보안",
    title: "보안등급 점검",
    language: "JavaScript (Node.js)",
    description: `[보안등급 점검] 소스코드는 개발한 프로그램 폴더를 훑어서 회사 보안규정에 어긋나는 코드를 찾아 점수와 등급을 매기는 프로그램입니다.

· 소스코드에 그대로 적힌 비밀번호 · API 키 · 토큰
· .env 같은 비밀 설정 파일이 저장소(git)에서 빠져 있는지
· eval, innerHTML 처럼 해킹에 악용되기 쉬운 코드
· 사용자 입력을 그대로 이어 붙인 SQL
· 주민번호 · 전화번호처럼 보이는 개인정보

100점에서 발견된 문제만큼 빼서 70점 이상이면 통과입니다. (AX LAB 셀프 보안점검 기준과 같음)

사용법: 프로젝트 폴더에 security-check.mjs 로 저장 → node security-check.mjs`,
    code: `// security-check.mjs — 프로젝트 폴더 보안등급 점검
// 사용법: node security-check.mjs [점검할 폴더(기본: 현재 폴더)]
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = process.argv[2] ?? ".";
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next"]);
const CODE_EXT = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".py", ".java", ".html", ".vue"]);

// [규칙 이름, 찾는 패턴, 1건당 감점, 최대 감점]
const RULES = [
  ["비밀번호·키 하드코딩", /(password|passwd|secret|api[_-]?key|token)\\s*[:=]\\s*["'][^"']{4,}["']/i, 15, 45],
  ["AWS·OpenAI 등 실제 키 형태", /(AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9]{20,})/, 25, 50],
  ["eval / new Function 사용", /\\beval\\s*\\(|new\\s+Function\\s*\\(/, 10, 20],
  ["innerHTML 직접 대입", /\\.innerHTML\\s*=/, 5, 15],
  ["SQL 문자열 이어붙이기", /(SELECT|INSERT|UPDATE|DELETE)[^;\\n]*["'\`]\\s*\\+\\s*\\w/i, 10, 30],
  ["주민번호 형태 데이터", /\\b\\d{6}-[1-4]\\d{6}\\b/, 20, 40],
  ["http:// 외부 주소", /["']http:\\/\\/(?!localhost|127\\.0\\.0\\.1)[^"']+["']/, 3, 9],
];

const hits = new Map(RULES.map(([name]) => [name, []]));

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) { walk(path); continue; }
    if (!CODE_EXT.has(extname(name)) || st.size > 1_000_000) continue;
    readFileSync(path, "utf8").split(/\\r?\\n/).forEach((line, i) => {
      for (const [rule, re] of RULES) {
        if (re.test(line)) hits.get(rule).push(\`\${path}:\${i + 1}\`);
      }
    });
  }
}
walk(ROOT);

let score = 100;
const report = [];
for (const [rule, , each, max] of RULES) {
  const list = hits.get(rule);
  if (!list.length) continue;
  const minus = Math.min(list.length * each, max);
  score -= minus;
  report.push(\`- \${rule}: \${list.length}건 (-\${minus}점)\\n    \${list.slice(0, 5).join("\\n    ")}\`);
}

// .env 가 있는데 .gitignore 에 빠져 있으면 감점
if (existsSync(join(ROOT, ".env"))) {
  const ignore = existsSync(join(ROOT, ".gitignore")) ? readFileSync(join(ROOT, ".gitignore"), "utf8") : "";
  if (!/^\\.env/m.test(ignore)) {
    score -= 20;
    report.push("- .env 가 .gitignore 에 없음 (-20점)");
  }
}

score = Math.max(score, 0);
const grade = score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : "D";
console.log(\`보안 점수: \${score}점 / 등급: \${grade} \${score >= 70 ? "(통과)" : "(70점 미만 · 보완 필요)"}\`);
console.log(report.length ? report.join("\\n") : "발견된 문제가 없습니다.");
process.exit(score >= 70 ? 0 : 1);
`,
  },

  // ── 권한 ───────────────────────────────────────────────
  {
    id: "auth-login",
    category: "권한",
    title: "로그인",
    language: "JavaScript (Node.js · Express)",
    description: `[로그인] 소스코드는 사번과 비밀번호로 로그인하고, 로그인 상태를 안전한 쿠키(세션)로 유지하는 프로그램입니다.

· 비밀번호는 bcrypt 로 암호화해서 저장 — 원래 비밀번호는 어디에도 남지 않습니다.
· 5번 연속 틀리면 10분 동안 로그인을 막아 비밀번호 추측 공격을 차단합니다.
· "사번이 없음" / "비밀번호 틀림"을 구분해서 알려주지 않습니다. (사번 존재 여부 노출 방지)
· 세션 쿠키는 httpOnly · sameSite 로 설정해 다른 사이트에서 훔쳐 쓸 수 없게 합니다.

필요 패키지: npm i express express-session bcrypt
환경변수: SESSION_SECRET (긴 임의 문자열)`,
    code: `// login.js — 사번 · 비밀번호 로그인 (Express)
import express from "express";
import session from "express-session";
import bcrypt from "bcrypt";

const app = express();
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET,          // 코드에 직접 쓰지 말 것
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", maxAge: 8 * 60 * 60 * 1000 }, // 8시간
}));

// 사용자 조회 — 실제로는 DB 에서 가져온다. passwordHash 는 bcrypt.hash(pw, 12) 결과
async function findUser(empNo) {
  return db.users.findOne({ empNo });          // { empNo, name, role, passwordHash }
}

// 연속 실패 제한 — 5회 실패 시 10분 잠금
const failures = new Map();                    // empNo -> { count, until }
const LIMIT = 5, LOCK_MS = 10 * 60 * 1000;

app.post("/api/login", async (req, res) => {
  const { empNo, password } = req.body ?? {};
  if (!empNo || !password) return res.status(400).json({ message: "사번과 비밀번호를 입력하세요." });

  const f = failures.get(empNo);
  if (f?.until > Date.now()) {
    return res.status(429).json({ message: "로그인을 여러 번 실패했습니다. 10분 뒤 다시 시도하세요." });
  }

  const user = await findUser(empNo);
  const ok = user && (await bcrypt.compare(password, user.passwordHash));
  if (!ok) {
    const count = (f?.count ?? 0) + 1;
    failures.set(empNo, { count, until: count >= LIMIT ? Date.now() + LOCK_MS : 0 });
    return res.status(401).json({ message: "사번 또는 비밀번호가 올바르지 않습니다." });
  }

  failures.delete(empNo);
  req.session.regenerate((err) => {             // 세션 고정 공격 방지
    if (err) return res.status(500).json({ message: "로그인 처리 중 오류가 났습니다." });
    req.session.user = { empNo: user.empNo, name: user.name, role: user.role };
    res.json({ ok: true, name: user.name });
  });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// 로그인한 사람만 통과
export function requireLogin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ message: "로그인이 필요합니다." });
  next();
}
`,
  },
  {
    id: "auth-role",
    category: "권한",
    title: "사용자 권한",
    language: "JavaScript (Node.js · Express)",
    description: `[사용자 권한] 소스코드는 로그인한 사람의 역할(일반 사용자 · 팀장 · 관리자)에 따라 쓸 수 있는 기능을 나누는 프로그램입니다.

· requireRole("manager") 처럼 API 앞에 붙이면 그 역할 이상만 통과합니다.
· 역할은 브라우저가 보낸 값을 믿지 않고, 서버 세션(로그인 때 DB 에서 읽은 값)으로만 판단합니다.
· "본인 글만 수정" 같은 소유자 확인은 requireOwner 로 처리합니다.
· 권한이 없으면 403 으로 막고, 어떤 기능인지 자세한 이유는 알려주지 않습니다.

[로그인] 코드의 세션(req.session.user)을 그대로 사용합니다.`,
    code: `// role.js — 역할별 권한 확인 (Express 미들웨어)
// 역할 순서: 낮은 것 → 높은 것
const ROLE_LEVEL = { user: 1, manager: 2, admin: 3 };

/** 지정한 역할 이상만 통과 */
export function requireRole(minRole) {
  return (req, res, next) => {
    const user = req.session?.user;            // 서버 세션 기준 — 요청 본문의 role 은 믿지 않는다
    if (!user) return res.status(401).json({ message: "로그인이 필요합니다." });
    if ((ROLE_LEVEL[user.role] ?? 0) < ROLE_LEVEL[minRole]) {
      return res.status(403).json({ message: "권한이 없습니다." });
    }
    next();
  };
}

/** 본인 데이터(또는 관리자)만 통과 — getOwnerId 로 대상의 작성자 사번을 찾는다 */
export function requireOwner(getOwnerId) {
  return async (req, res, next) => {
    const user = req.session?.user;
    if (!user) return res.status(401).json({ message: "로그인이 필요합니다." });
    const ownerId = await getOwnerId(req);
    if (ownerId == null) return res.status(404).json({ message: "대상을 찾을 수 없습니다." });
    if (ownerId !== user.empNo && user.role !== "admin") {
      return res.status(403).json({ message: "본인 것만 수정할 수 있습니다." });
    }
    next();
  };
}

// ── 사용 예 ──
// app.get("/api/reports", requireRole("user"), listReports);
// app.post("/api/approve/:id", requireRole("manager"), approve);
// app.put("/api/posts/:id",
//   requireOwner(async (req) => (await db.posts.findById(req.params.id))?.authorEmpNo),
//   updatePost);
`,
  },
  {
    id: "auth-admin",
    category: "권한",
    title: "관리자 모드",
    language: "JavaScript (Node.js · Express)",
    description: `[관리자 모드] 소스코드는 관리자 전용 화면 · API 를 한곳에 묶고, 관리자가 한 일을 모두 기록으로 남기는 프로그램입니다.

· /api/admin 아래 API 는 관리자 명단(환경변수 ADMIN_EMP_NOS)에 있는 사번만 쓸 수 있습니다.
· 관리자가 데이터를 바꾸면 누가 · 언제 · 무엇을 했는지 감사 로그(admin-audit.log)에 남깁니다.
· 관리자 명단을 코드가 아니라 환경변수로 관리해서, 사람이 바뀌어도 코드를 고칠 필요가 없습니다.

환경변수 예) ADMIN_EMP_NOS=82211489,82210350`,
    code: `// admin.js — 관리자 모드 (Express 라우터 + 감사 로그)
import express from "express";
import { appendFile } from "node:fs/promises";

const ADMINS = new Set((process.env.ADMIN_EMP_NOS ?? "").split(",").map((s) => s.trim()).filter(Boolean));

function requireAdmin(req, res, next) {
  const user = req.session?.user;
  if (!user) return res.status(401).json({ message: "로그인이 필요합니다." });
  if (!ADMINS.has(user.empNo)) return res.status(403).json({ message: "관리자만 사용할 수 있습니다." });
  next();
}

/** 관리자가 한 일을 한 줄씩 기록 (GET 조회는 남기지 않음) */
function auditLog(req, res, next) {
  if (req.method === "GET") return next();
  res.on("finish", () => {
    const line = JSON.stringify({
      at: new Date().toISOString(),
      empNo: req.session.user.empNo,
      name: req.session.user.name,
      action: \`\${req.method} \${req.originalUrl}\`,
      status: res.statusCode,
    });
    appendFile("admin-audit.log", line + "\\n").catch(() => {});
  });
  next();
}

export const adminRouter = express.Router();
adminRouter.use(requireAdmin, auditLog);

// ── 관리자 기능 예시 ──
adminRouter.get("/users", async (req, res) => {
  res.json(await db.users.find({}, { projection: { passwordHash: 0 } })); // 비밀번호 해시는 내보내지 않음
});

adminRouter.post("/users/:empNo/role", async (req, res) => {
  const { role } = req.body ?? {};
  if (!["user", "manager", "admin"].includes(role)) return res.status(400).json({ message: "역할 값이 올바르지 않습니다." });
  await db.users.updateOne({ empNo: req.params.empNo }, { $set: { role } });
  res.json({ ok: true });
});

// app.js 에서: app.use("/api/admin", adminRouter);
`,
  },

  // ── 활용도 ─────────────────────────────────────────────
  {
    id: "usage-visitors",
    category: "활용도",
    title: "방문자 카운트",
    language: "JavaScript (Node.js)",
    description: `[방문자 카운트] 소스코드는 개발된 SaaS 프로그램 사용도를 측정하기 위한 프로그램으로,

사용자가 로그인한 날짜와 시간을 기준으로 방문 숫자를 카운트 하며,

동일인이 중복 로그인했을 경우 같은 날에는 1명으로만 셉니다. (순방문자)
대신 로그인 횟수는 따로 세어 두어, "몇 명이 썼는지"와 "몇 번 썼는지"를 함께 볼 수 있습니다.

· recordVisit(사번) — 로그인에 성공했을 때 한 번 부르면 됩니다.
· getVisitStats("2026-10-01", "2026-10-31") — 기간별 일자 · 순방문자 · 로그인 횟수를 돌려줍니다.
· 날짜는 한국 시간(KST) 기준으로 나눕니다.
· 데이터는 visits.json 파일에 쌓입니다. (DB 를 쓰면 같은 구조로 테이블에 저장)`,
    code: `// visitor-count.js — 방문자 카운트 (일별 순방문자 + 로그인 횟수)
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const FILE = "visits.json";

/** 한국 시간 기준 날짜 "YYYY-MM-DD" */
function kstDate(d = new Date()) {
  return new Date(d.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function load() {
  return existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : {};
}

/**
 * 로그인 성공 시 호출.
 * 같은 사람이 같은 날 여러 번 로그인해도 순방문자는 1명, 로그인 횟수만 늘어난다.
 */
export function recordVisit(empNo, at = new Date()) {
  const data = load();                          // { "2026-10-28": { users: { "8221...": 3 }, logins: 5 } }
  const day = (data[kstDate(at)] ??= { users: {}, logins: 0 });
  day.users[empNo] = (day.users[empNo] ?? 0) + 1;
  day.logins += 1;
  writeFileSync(FILE, JSON.stringify(data));
}

/** 기간 통계 — from / to 는 "YYYY-MM-DD" (둘 다 포함) */
export function getVisitStats(from, to) {
  const data = load();
  const days = Object.keys(data).filter((d) => d >= from && d <= to).sort();
  const everyone = new Set();
  const daily = days.map((d) => {
    const users = Object.keys(data[d].users);
    users.forEach((u) => everyone.add(u));
    return { date: d, visitors: users.length, logins: data[d].logins };
  });
  return {
    daily,                                      // 일자별 순방문자 · 로그인 횟수
    totalVisitors: everyone.size,               // 기간 전체 순방문자 (중복 제거)
    totalLogins: daily.reduce((a, d) => a + d.logins, 0),
  };
}

// ── 사용 예 ──
// 로그인 성공 직후:  recordVisit(user.empNo);
// 관리자 화면 API:   app.get("/api/admin/visits", requireAdmin, (req, res) =>
//                      res.json(getVisitStats(req.query.from, req.query.to)));
`,
  },
  {
    id: "usage-log",
    category: "활용도",
    title: "방문로그 관리",
    language: "JavaScript (Node.js · Express)",
    description: `[방문로그 관리] 소스코드는 누가 · 언제 · 어떤 화면을 열었는지 기록하고, 관리자가 조회 · 엑셀(CSV)로 내려받을 수 있게 하는 프로그램입니다.

· 요청마다 시간, 사번, 이름, 경로, IP 를 한 줄씩 남깁니다.
· 개인정보 보호를 위해 IP 마지막 자리는 가리고(예: 10.208.1.*), 비밀번호 · 토큰 같은 값은 남기지 않습니다.
· 90일이 지난 기록은 하루에 한 번 자동으로 지웁니다. (보관 기간은 KEEP_DAYS 로 조정)
· 관리자는 /api/admin/logs 에서 기간 · 사번으로 조회하고 ?format=csv 로 내려받습니다.`,
    code: `// access-log.js — 방문로그 기록 · 조회 · 자동 정리
import { appendFileSync, readFileSync, writeFileSync, existsSync } from "node:fs";

const FILE = "access-log.jsonl";               // 한 줄에 기록 하나
const KEEP_DAYS = 90;

const maskIp = (ip = "") => ip.replace(/^::ffff:/, "").replace(/\\.\\d+$/, ".*");

/** 모든 요청 기록 — 정적 파일(이미지 · js · css)은 제외 */
export function accessLogger(req, res, next) {
  if (/\\.(js|css|png|jpe?g|svg|ico|woff2?)$/.test(req.path)) return next();
  res.on("finish", () => {
    const u = req.session?.user;
    appendFileSync(FILE, JSON.stringify({
      at: new Date().toISOString(),
      empNo: u?.empNo ?? "",
      name: u?.name ?? "",
      method: req.method,
      path: req.path,                           // 쿼리스트링은 남기지 않음 (토큰 등 노출 방지)
      status: res.statusCode,
      ip: maskIp(req.ip),
    }) + "\\n");
  });
  next();
}

function readLogs() {
  if (!existsSync(FILE)) return [];
  return readFileSync(FILE, "utf8").split("\\n").filter(Boolean).map((l) => JSON.parse(l));
}

/** 보관 기간이 지난 기록 삭제 */
export function cleanupLogs() {
  const limit = new Date(Date.now() - KEEP_DAYS * 86400000).toISOString();
  const kept = readLogs().filter((r) => r.at >= limit);
  writeFileSync(FILE, kept.map((r) => JSON.stringify(r)).join("\\n") + (kept.length ? "\\n" : ""));
}
setInterval(cleanupLogs, 24 * 60 * 60 * 1000); // 하루에 한 번

/** 관리자 조회 API — ?from=2026-10-01&to=2026-10-31&empNo=...&format=csv */
export function logsHandler(req, res) {
  const { from = "0000", to = "9999", empNo, format } = req.query;
  const rows = readLogs().filter((r) =>
    r.at.slice(0, 10) >= from && r.at.slice(0, 10) <= to && (!empNo || r.empNo === empNo));
  if (format !== "csv") return res.json(rows);
  const head = "시간,사번,이름,방식,경로,상태,IP";
  const body = rows.map((r) => [r.at, r.empNo, r.name, r.method, r.path, r.status, r.ip]
    .map((v) => \`"\${String(v).replace(/"/g, '""')}"\`).join(","));
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=access-log.csv");
  res.send("\\uFEFF" + [head, ...body].join("\\n"));   // BOM — 엑셀에서 한글 깨짐 방지
}

// ── 사용 예 ──
// app.use(accessLogger);
// app.get("/api/admin/logs", requireAdmin, logsHandler);
`,
  },
  {
    id: "usage-mail",
    category: "활용도",
    title: "메일 발송",
    language: "JavaScript (Node.js)",
    description: `[메일 발송] 소스코드는 프로그램에서 사내 메일(SMTP)로 알림 메일을 보내는 프로그램입니다.

· 메일 서버 주소 · 계정 · 비밀번호는 코드에 쓰지 않고 환경변수(.env)로 받습니다.
· 제목과 본문 틀(템플릿)을 정해 두고 이름 · 내용만 바꿔 끼워 보냅니다.
· 받는 사람 주소 형식을 확인하고, 실패하면 이유를 남기고 한 번 더 시도합니다.
· 사용자 입력은 HTML 로 바꿀 때 특수문자를 막아(escape) 메일 본문 변조를 막습니다.

필요 패키지: npm i nodemailer
환경변수: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM (주소는 전산팀에 확인)`,
    code: `// mail.js — 사내 SMTP 메일 발송
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

const escapeHtml = (s = "") =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** 알림 메일 틀 */
function noticeTemplate({ name, title, message, link }) {
  return {
    subject: \`[알림] \${title}\`,
    text: \`\${name}님, 안녕하세요.\\n\\n\${message}\\n\\n\${link ?? ""}\`,
    html: \`<p>\${escapeHtml(name)}님, 안녕하세요.</p>
           <p style="white-space:pre-wrap">\${escapeHtml(message)}</p>
           \${link ? \`<p><a href="\${escapeHtml(link)}">바로가기</a></p>\` : ""}\`,
  };
}

/** 메일 보내기 — 실패하면 1번 더 시도 */
export async function sendNotice(to, data) {
  if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(to)) throw new Error(\`메일 주소가 올바르지 않습니다: \${to}\`);
  const mail = { from: process.env.MAIL_FROM, to, ...noticeTemplate(data) };
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const info = await transporter.sendMail(mail);
      return { ok: true, id: info.messageId };
    } catch (err) {
      console.error(\`메일 발송 실패 (\${attempt}회차) → \${to}: \${err.message}\`);
      if (attempt === 2) throw err;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

// ── 사용 예 ──
// await sendNotice("82211489@teczen.kr", {
//   name: "이재용", title: "승인 완료", message: "신청하신 과제가 승인되었습니다.",
//   link: "https://vibe.teczen.kr:2222",
// });
`,
  },
];
