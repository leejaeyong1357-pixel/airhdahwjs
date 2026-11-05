// 2026년도 교육 만족도 조사 — 설문 페이지 + 응답 저장 + 결과 보기 (Node.js 만 있으면 됨, 설치할 것 없음)
//   설문:   http://<이 PC>:2821/
//   결과:   http://<이 PC>:2821/results?key=<관리 키>   (키는 처음 켤 때 data/admin-key.txt 에 만들어짐)
//   엑셀용: http://<이 PC>:2821/results.csv?key=<관리 키>
import { createServer } from "node:http";
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, randomUUID } from "node:crypto";
import { networkInterfaces } from "node:os";
import { SECTIONS, ALL_ITEMS, RANKS, OPEN, TITLE, grade } from "./public/questions.js";

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 2821;
const DATA = process.env.DATA_DIR ?? join(ROOT, "data");
const FILE = join(DATA, "responses.jsonl");
mkdirSync(DATA, { recursive: true });
const KEY_FILE = join(DATA, "admin-key.txt");
if (!existsSync(KEY_FILE)) writeFileSync(KEY_FILE, randomBytes(6).toString("hex"));
const ADMIN_KEY = (process.env.ADMIN_KEY ?? readFileSync(KEY_FILE, "utf8")).trim();

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };

function readAll() {
  if (!existsSync(FILE)) return [];
  return readFileSync(FILE, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}
const send = (res, code, body, type = "application/json; charset=utf-8") => {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** 받은 응답 검사 — 문항 점수 1~5, 글자 수 제한 */
function clean(body) {
  const scores = {};
  for (const it of ALL_ITEMS) {
    const v = Number(body?.scores?.[it.id]);
    if (!Number.isInteger(v) || v < 1 || v > 5) return null;
    scores[it.id] = v;
  }
  const text = {};
  for (const o of OPEN) text[o.id] = String(body?.text?.[o.id] ?? "").slice(0, 1000);
  return {
    id: randomUUID(), at: new Date().toISOString(), scores, text,
    dept: String(body?.dept ?? "").slice(0, 40), rank: RANKS.includes(body?.rank) ? body.rank : "",
  };
}

function summary(rows) {
  const avg = (ids) => {
    const vals = rows.flatMap((r) => ids.map((id) => r.scores[id]));
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  };
  return SECTIONS.map((s) => {
    const items = s.items.map((it) => {
      const dist = [0, 0, 0, 0, 0];
      for (const r of rows) dist[r.scores[it.id] - 1]++;
      return { id: it.id, q: it.q, avg: avg([it.id]), dist };
    });
    const a = avg(s.items.map((it) => it.id));
    return { id: s.id, no: s.no, title: s.title, avg: a, grade: rows.length ? grade(a) : "-", items };
  });
}

function resultsPage(rows) {
  const sum = summary(rows);
  const bar = (dist, n) => dist.map((c, i) => `<span class="d d${i + 1}" style="flex:${c || 0.0001}" title="${i + 1}점 ${c}명">${c && n ? Math.round((c / n) * 100) + "%" : ""}</span>`).join("");
  const sections = sum.map((s) => `
    <section class="rs">
      <header><h2>Section ${s.no} · ${esc(s.title)}</h2><div class="big">${rows.length ? s.avg.toFixed(2) : "-"}<small> / 5</small> <b class="g g${s.grade}">${s.grade}</b></div></header>
      <table><thead><tr><th>#</th><th>문항</th><th>평균</th><th class="w">응답 분포 (1 → 5점)</th></tr></thead><tbody>
      ${s.items.map((it, i) => `<tr><td>${i + 1}</td><td>${esc(it.q)}</td><td class="n">${rows.length ? it.avg.toFixed(2) : "-"}</td><td><div class="dist">${bar(it.dist, rows.length)}</div></td></tr>`).join("")}
      </tbody></table>
    </section>`).join("");
  const opens = OPEN.map((o) => {
    const list = rows.map((r) => r.text?.[o.id]).filter((t) => t && t.trim());
    return `<section class="rs"><header><h2>${esc(o.q)}</h2><div class="cnt">${list.length}건</div></header><ul class="op">${list.map((t) => `<li>${esc(t)}</li>`).join("") || "<li class=none>아직 없음</li>"}</ul></section>`;
  }).join("");
  const byRank = RANKS.map((r) => [r, rows.filter((x) => x.rank === r).length]).filter(([, n]) => n).map(([r, n]) => `${r} ${n}`).join(" · ");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>결과 · ${esc(TITLE)}</title><link rel="icon" href="logo-mark.svg"><link rel="stylesheet" href="style.css"></head>
<body class="results"><div class="rwrap">
<div class="rtop"><img src="logo.svg" alt="TECZEN" class="rlogo"><h1>${esc(TITLE)} — 결과</h1>
<a class="btn ghost" href="results.csv?key=${encodeURIComponent(ADMIN_KEY)}">엑셀(CSV) 내려받기</a></div>
<div class="rmeta">응답 <b>${rows.length}</b>명${byRank ? ` · ${byRank}` : ""} · 등급 환산: 평균 4.5↑ S · 3.5↑ A · 2.5↑ B · 1.5↑ C · 그 아래 D</div>
${sections}${opens}</div></body></html>`;
}

function csv(rows) {
  const head = ["응답시각", "부서", "직급", ...ALL_ITEMS.map((it) => `${it.id} ${it.q}`), ...OPEN.map((o) => o.q)];
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [head.map(q).join(",")];
  for (const r of rows) lines.push([r.at, r.dept, r.rank, ...ALL_ITEMS.map((it) => r.scores[it.id]), ...OPEN.map((o) => r.text?.[o.id])].map(q).join(","));
  return "﻿" + lines.join("\r\n"); // BOM — 엑셀에서 한글이 안 깨지게
}

const server = createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const path = decodeURIComponent(url.pathname);
  const admin = url.searchParams.get("key") === ADMIN_KEY;

  if (req.method === "POST" && path === "/api/submit") {
    let body = "";
    req.on("data", (d) => { body += d; if (body.length > 50_000) req.destroy(); });
    req.on("end", () => {
      let data;
      try { data = JSON.parse(body); } catch { return send(res, 400, { error: "형식이 잘못되었습니다." }); }
      const row = clean(data);
      if (!row) return send(res, 400, { error: "모든 문항에 답해 주세요." });
      appendFileSync(FILE, JSON.stringify(row) + "\n");
      console.log(`[응답] ${row.at} ${row.rank || "-"} ${row.dept || ""}`);
      send(res, 200, { ok: true });
    });
    return;
  }
  if (path === "/results" || path === "/results.csv") {
    if (!admin) return send(res, 403, "관리 키가 필요합니다. (data/admin-key.txt)", "text/plain; charset=utf-8");
    const rows = readAll();
    if (path === "/results.csv") {
      res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent("2026_교육만족도_응답.csv")}` });
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
