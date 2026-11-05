// 26년도 교육 만족도 조사 — 설문 페이지 + 응답 저장 + 결과 분석 (Node.js 만 있으면 됨, 설치할 것 없음)
//   설문:   http://<이 PC>:2821/
//   결과:   http://<이 PC>:2821/results?key=<관리 키>   (키는 처음 켤 때 data/admin-key.txt 에 만들어짐)
//   엑셀용: http://<이 PC>:2821/results.csv?key=<관리 키>
import { createServer } from "node:http";
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, randomUUID } from "node:crypto";
import { networkInterfaces } from "node:os";
import { SECTIONS, ALL_ITEMS, TITLE, grade } from "./public/questions.js";

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 2821;
const DATA = process.env.DATA_DIR ?? join(ROOT, "data");
const FILE = join(DATA, "responses.jsonl");
mkdirSync(DATA, { recursive: true });
const KEY_FILE = join(DATA, "admin-key.txt");
if (!existsSync(KEY_FILE)) writeFileSync(KEY_FILE, randomBytes(6).toString("hex"));
const ADMIN_KEY = (process.env.ADMIN_KEY ?? readFileSync(KEY_FILE, "utf8")).trim();

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };
const GRADES = ["S", "A", "B", "C", "D"];

function readAll() {
  if (!existsSync(FILE)) return [];
  return readFileSync(FILE, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter((r) => r && ALL_ITEMS.every((it) => Number.isInteger(r.scores?.[it.id])));
}
const send = (res, code, body, type = "application/json; charset=utf-8") => {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : "-");
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

/** 받은 응답 검사 — 모든 문항 1~5 */
function clean(body) {
  const scores = {};
  for (const it of ALL_ITEMS) {
    const v = Number(body?.scores?.[it.id]);
    if (!Number.isInteger(v) || v < 1 || v > 5) return null;
    scores[it.id] = v;
  }
  return { id: randomUUID(), at: new Date().toISOString(), scores };
}

// ── 분석 ─────────────────────────────────────────────────
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const sd = (a) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };
const median = (a) => { if (!a.length) return NaN; const b = [...a].sort((x, y) => x - y), h = b.length >> 1; return b.length % 2 ? b[h] : (b[h - 1] + b[h]) / 2; };

function analyze(rows) {
  const n = rows.length;
  return SECTIONS.map((s) => {
    const items = s.items.map((it) => {
      const vals = rows.map((r) => r.scores[it.id]);
      const dist = [1, 2, 3, 4, 5].map((v) => vals.filter((x) => x === v).length);
      const mode = dist.indexOf(Math.max(...dist)) + 1;
      return { ...it, avg: mean(vals), sd: sd(vals), med: median(vals), dist, top2: pct(dist[3] + dist[4], n), low2: pct(dist[0] + dist[1], n), mode, grade: n ? grade(mean(vals)) : "-" };
    });
    // 사람마다 이 섹션 평균 → 등급
    const per = rows.map((r) => mean(s.items.map((it) => r.scores[it.id])));
    const gradeCount = Object.fromEntries(GRADES.map((g) => [g, per.filter((v) => grade(v) === g).length]));
    const avg = mean(per);
    const sorted = [...items].sort((a, b) => b.avg - a.avg);
    return { ...s, n, items, avg, sd: sd(per), grade: n ? grade(avg) : "-", gradeCount, best: sorted[0], worst: sorted[sorted.length - 1],
      top2: pct(per.filter((v) => v >= 3.5).length, n) };
  });
}

/** 정성 해석 — 평균 등급 문장 + 응답 분포를 문장으로 */
function narrative(s) {
  if (!s.n) return "아직 응답이 없습니다.";
  const g = s.grade;
  const lines = [];
  lines.push(`${s.kpi} — ${s.who} ${s.n}명, 평균 ${f2(s.avg)}점(5점 만점)으로 <b>${g}등급</b>: “${s.levels[g]}”으로 판단됩니다.`);
  const gc = GRADES.filter((x) => s.gradeCount[x]).map((x) => `${x} ${s.gradeCount[x]}명(${pct(s.gradeCount[x], s.n)}%)`).join(", ");
  lines.push(`개인별 등급 분포는 ${gc}이며, A등급 이상(평균 3.5점 이상)이 ${s.top2}%입니다.`);
  const b = s.best, w = s.worst;
  lines.push(`가장 높은 항목은 ‘${b.k}’(${f2(b.avg)}점)로 가장 많은 응답이 “${b.a[b.mode - 1]}”(${b.mode}점, ${pct(b.dist[b.mode - 1], s.n)}%)였습니다.`);
  if (w.id !== b.id) lines.push(`보완이 필요한 항목은 ‘${w.k}’(${f2(w.avg)}점)로 가장 많은 응답이 “${w.a[w.mode - 1]}”(${w.mode}점, ${pct(w.dist[w.mode - 1], s.n)}%)였습니다.`);
  const weak = s.items.filter((it) => it.low2 >= 20);
  if (weak.length) lines.push(`1~2점(추가 개입·기초 지도 필요) 응답이 20% 이상인 항목: ${weak.map((it) => `‘${it.k}’ ${it.low2}%`).join(", ")} — 대상자 개별 지도가 필요합니다.`);
  const spread = s.items.filter((it) => it.sd >= 1.1);
  if (spread.length) lines.push(`응답 편차가 큰 항목(표준편차 1.1 이상): ${spread.map((it) => `‘${it.k}’`).join(", ")} — 대상자 간 수준 차이가 큽니다.`);
  return lines.join(" ");
}

function resultsPage(rows) {
  const A = analyze(rows);
  const n = rows.length;
  const all = mean(rows.map((r) => mean(ALL_ITEMS.map((it) => r.scores[it.id]))));
  const distBar = (dist) => `<div class="dist">${dist.map((c, i) => `<span class="d d${i + 1}" style="flex:${c || 0.0001}" title="${i + 1}점 ${c}명">${c ? `${pct(c, n)}%` : ""}</span>`).join("")}</div>`;
  const cards = `
  <div class="cards">
    <div class="kc"><small>응답 수</small><b>${n}<i>명</i></b></div>
    ${A.map((s) => `<div class="kc"><small>Section ${s.no} · ${esc(s.title)}</small><b>${f2(s.avg)}<i>/ 5</i> <em class="g g${s.grade}">${s.grade}</em></b></div>`).join("")}
    <div class="kc"><small>전체 평균</small><b>${f2(all)}<i>/ 5</i></b></div>
  </div>`;
  const sections = A.map((s) => `
  <section class="rs">
    <header><div><h2>Section ${s.no} · ${esc(s.title)}</h2><p class="kpi">KPI: ${esc(s.kpi)} · ${esc(s.who)}</p></div>
      <div class="big">${f2(s.avg)}<small> / 5 · 표준편차 ${f2(s.sd)}</small> <b class="g g${s.grade}">${s.grade}</b></div></header>

    <h3>정성 분석</h3>
    <div class="story" id="story-${s.id}">${narrative(s)}</div>
    <button class="btn ghost copy" data-copy="story-${s.id}" type="button">성과 체크인용 문장 복사</button>

    <h3>정량 분석 — 문항별</h3>
    <table><thead><tr><th>#</th><th>항목</th><th>평균</th><th>표준편차</th><th>중앙값</th><th>4~5점</th><th>1~2점</th><th>등급</th><th class="w">응답 분포 (1 → 5점)</th></tr></thead><tbody>
    ${s.items.map((it, i) => `<tr><td>${i + 1}</td><td title="${esc(it.q)}">${esc(it.k)}</td><td class="n">${f2(it.avg)}</td><td>${f2(it.sd)}</td><td>${n ? it.med : "-"}</td><td>${it.top2}%</td><td>${it.low2}%</td><td><b class="g sm g${it.grade}">${it.grade}</b></td><td>${distBar(it.dist)}</td></tr>`).join("")}
    </tbody></table>

    <h3>개인별 등급 분포 <small>(응답자 1명의 섹션 평균 → 등급)</small></h3>
    <div class="gdist">${GRADES.map((g) => `<div class="gb"><b class="g g${g}">${g}</b><div class="gbar"><i style="width:${pct(s.gradeCount[g], n)}%"></i></div><span>${s.gradeCount[g]}명 · ${pct(s.gradeCount[g], n)}%</span><p>${esc(s.levels[g])}</p></div>`).join("")}</div>

    <h3>정성 분석 — 문항별 응답 수준 <small>(보기 문장별 인원)</small></h3>
    ${s.items.map((it, i) => `
    <details class="lv"><summary><b>${i + 1}. ${esc(it.k)}</b> — 가장 많은 응답: ${n ? `${it.mode}점 “${esc(it.a[it.mode - 1])}” (${pct(it.dist[it.mode - 1], n)}%)` : "-"}</summary>
      <p class="qfull">${esc(it.q)}</p>
      <ul>${[5, 4, 3, 2, 1].map((v) => `<li><span class="sc">${v}점</span><span class="tx">${esc(it.a[v - 1])}</span><span class="ct">${it.dist[v - 1]}명 · ${pct(it.dist[v - 1], n)}%</span><span class="mini"><i style="width:${pct(it.dist[v - 1], n)}%"></i></span></li>`).join("")}</ul>
    </details>`).join("")}
  </section>`).join("");

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>결과 · ${esc(TITLE)}</title><link rel="icon" href="logo-mark.svg"><link rel="stylesheet" href="style.css"></head>
<body class="results"><div class="rwrap">
<div class="rtop"><img src="logo.svg" alt="TECZEN" class="rlogo"><h1>${esc(TITLE)} — 결과 분석</h1>
<a class="btn ghost" href="results.csv?key=${encodeURIComponent(ADMIN_KEY)}">엑셀(CSV) 내려받기</a></div>
<div class="rmeta">등급 환산: 평균 4.5점 이상 S · 3.5 이상 A · 2.5 이상 B · 1.5 이상 C · 그 아래 D &nbsp;|&nbsp; 마지막 응답 ${n ? esc(new Date(rows[n - 1].at).toLocaleString("ko-KR")) : "-"}</div>
${cards}${sections}</div>
<script>
for (const b of document.querySelectorAll(".copy")) b.onclick = async () => {
  const t = document.getElementById(b.dataset.copy).innerText;
  try { await navigator.clipboard.writeText(t); } catch { const a = document.createElement("textarea"); a.value = t; document.body.append(a); a.select(); document.execCommand("copy"); a.remove(); }
  b.textContent = "복사했습니다"; setTimeout(() => (b.textContent = "성과 체크인용 문장 복사"), 1500);
};
</script></body></html>`;
}

function csv(rows) {
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["응답시각", ...ALL_ITEMS.map((it) => `${it.id} ${it.k}`), ...SECTIONS.flatMap((s) => [`S${s.no} 평균`, `S${s.no} 등급`])];
  const lines = [head.map(q).join(",")];
  for (const r of rows) {
    const secs = SECTIONS.flatMap((s) => { const m = mean(s.items.map((it) => r.scores[it.id])); return [m.toFixed(2), grade(m)]; });
    lines.push([new Date(r.at).toLocaleString("ko-KR"), ...ALL_ITEMS.map((it) => r.scores[it.id]), ...secs].map(q).join(","));
  }
  // 문항 요약 (아래쪽)
  const A = analyze(rows);
  lines.push("", ["항목", "평균", "표준편차", "중앙값", "4~5점 비율", "1~2점 비율", "1점", "2점", "3점", "4점", "5점"].map(q).join(","));
  for (const s of A) for (const it of s.items) lines.push([`S${s.no} ${it.k}`, f2(it.avg), f2(it.sd), it.med, `${it.top2}%`, `${it.low2}%`, ...it.dist].map(q).join(","));
  return "﻿" + lines.join("\r\n"); // BOM — 엑셀에서 한글이 안 깨지게
}

const server = createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const path = decodeURIComponent(url.pathname);
  const admin = url.searchParams.get("key") === ADMIN_KEY;

  if (req.method === "POST" && path === "/api/submit") {
    let body = "";
    req.on("data", (d) => { body += d; if (body.length > 20_000) req.destroy(); });
    req.on("end", () => {
      let data;
      try { data = JSON.parse(body); } catch { return send(res, 400, { error: "형식이 잘못되었습니다." }); }
      const row = clean(data);
      if (!row) return send(res, 400, { error: "모든 문항에 답해 주세요." });
      appendFileSync(FILE, JSON.stringify(row) + "\n");
      console.log(`[응답] ${row.at}`);
      send(res, 200, { ok: true });
    });
    return;
  }
  if (path === "/results" || path === "/results.csv") {
    if (!admin) return send(res, 403, "관리 키가 필요합니다. (data/admin-key.txt)", "text/plain; charset=utf-8");
    const rows = readAll();
    if (path === "/results.csv") {
      res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent("26년도_교육만족도_응답.csv")}` });
      return res.end(csv(rows));
    }
    return send(res, 200, resultsPage(rows), "text/html; charset=utf-8");
  }
  // 정적 파일
  const rel = path === "/" ? "index.html" : path.slice(1);
  const file = normalize(join(ROOT, "public", rel));
  if (!file.startsWith(join(ROOT, "public")) || !existsSync(file)) return send(res, 404, "없는 페이지입니다.", "text/plain; charset=utf-8");
  res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream", "Cache-Control": "no-cache" });
  res.end(readFileSync(file));
});

server.listen(PORT, () => {
  const ips = Object.values(networkInterfaces()).flat().filter((n) => n && n.family === "IPv4" && !n.internal).map((n) => n.address);
  console.log(`\n${TITLE} — 설문 서버가 켜졌습니다.`);
  console.log(`  설문 주소:  http://localhost:${PORT}/${ips.map((ip) => `   http://${ip}:${PORT}/`).join("")}`);
  console.log(`  결과 보기:  http://localhost:${PORT}/results?key=${ADMIN_KEY}`);
  console.log(`  (관리 키는 data/admin-key.txt — 결과 주소는 담당자만 보세요)\n`);
});
