// 관리자 화면 — 현황 · 파일 관리 · 문구 편집 · 기록 · 설정
import { fileIcon } from "./app.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const extOf = (n) => (String(n ?? "").match(/\.([a-z0-9]+)$/i)?.[1] ?? "").toLowerCase();
const I = {
  dash: '<path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z"/>',
  files: '<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',
  text: '<path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/>',
  log: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  set: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/>',
  out: '<path d="M15 4h4a1 1 0 011 1v14a1 1 0 01-1 1h-4M10 17l5-5-5-5M15 12H3"/>',
  up: '<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>',
  down: '<path d="M12 4v12M7 11l5 5 5-5M5 20h14"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
  grip: '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>', plus: '<path d="M12 5v14M5 12h14"/>', trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  upA: '<path d="M6 15l6-6 6 6"/>', downA: '<path d="M6 9l6 6 6-6"/>', search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>', file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
};
const ico = (k, cls = "ico") => `<svg viewBox="0 0 24 24" class="${cls}">${I[k]}</svg>`;

let S = null, saved = "", LOGS = null, view = location.hash.slice(1) || "dash";
const logFilter = { type: "download", period: "all", q: "" };
const TEXT_KEYS = ["tab", "brand", "title", "subtitle", "helmet", "clipboard", "greetPre", "greetName", "greetPost", "notice", "sectionTitle", "sectionHint", "infoTitle", "downloadLabel", "emptyLabel"];

// ── 도우미 ──
function toast(msg) { const t = $("toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("on"), 2400); }
async function api(path, opt = {}) {
  const r = await fetch(path, { headers: { "Content-Type": "application/json" }, ...opt, body: opt.body && typeof opt.body !== "string" ? JSON.stringify(opt.body) : opt.body });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== "/api/login") { showLogin(); throw new Error("로그인이 필요합니다."); }
  if (!r.ok) throw new Error(j.error ?? "실패했습니다.");
  return j;
}
const snap = () => JSON.stringify({ ...Object.fromEntries(TEXT_KEYS.map((k) => [k, S[k]])), info: S.info, columns: S.columns, askName: S.askName, cards: S.cards.map((c) => [c.id, c.title, c.label]) });
const isDirty = () => S && snap() !== saved;
function markSaved() { saved = snap(); updateSavebar(); }
function updateSavebar() { const b = $("savebar"); if (b) b.classList.toggle("on", isDirty()); }
window.addEventListener("beforeunload", (e) => { if (isDirty()) { e.preventDefault(); e.returnValue = ""; } });
const COLORS = ["#2457d6", "#16a34a", "#d97706", "#7c3aed", "#db2777", "#0891b2", "#dc2626", "#4f46e5"];
const avatar = (name) => { const n = String(name || "?"); let h = 0; for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return `<span class="av" style="background:${n === "?" ? "#98a2b3" : COLORS[h % COLORS.length]}">${esc(n === "?" ? "?" : n[0])}</span>`; };
function rel(iso) {
  const d = new Date(iso), now = new Date(), s = (now - d) / 1000;
  if (s < 60) return "방금";
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  const hm = d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return `오늘 ${hm}`;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `어제 ${hm}`;
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${hm}`;
}
const full = (iso) => new Date(iso).toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
const pageUrl = () => `${location.origin}/`;
async function copy(text) {
  try { await navigator.clipboard.writeText(text); } catch { const a = document.createElement("textarea"); a.value = text; document.body.append(a); a.select(); document.execCommand("copy"); a.remove(); }
  toast("복사했습니다.");
}

// ── 로그인 ──
function showLogin() {
  $("root").innerHTML = `
  <div class="login"><form id="loginForm">
    <h1>관리자 로그인</h1>
    <p>현장밀착점검 보고서 페이지 관리</p>
    <input id="pw" type="password" placeholder="비밀번호" autocomplete="current-password" autofocus>
    <div class="err" id="err"></div>
    <button class="btn primary" type="submit">들어가기</button>
    <p>처음 비밀번호는 서버 PC 의 <b>bs-report\\data\\admin-password.txt</b> 에 있습니다.</p>
    <a href="./" style="text-align:center;color:var(--sub);font-size:13.5px">← 보는 화면으로</a>
  </form></div>`;
  $("loginForm").onsubmit = async (e) => {
    e.preventDefault();
    try { await api("/api/login", { method: "POST", body: { password: $("pw").value } }); boot(); }
    catch (err) { $("err").textContent = err.message; }
  };
}

// ── 틀 ──
const MENU = [["dash", "현황", "dash"], ["files", "파일 관리", "files"], ["texts", "문구 편집", "text"], ["logs", "접속 · 다운로드 기록", "log"], ["settings", "설정", "set"]];
function shell() {
  $("root").innerHTML = `
  <div class="app">
    <aside class="side">
      <div class="brand"><svg viewBox="0 0 48 40"><path d="M6 38V8l16-6v36zM24 38V14l18 6v18z" fill="#fff"/></svg><div>${esc(S.brand)} 관리자<small>현장밀착점검 보고서</small></div></div>
      <nav class="nav" id="nav">${MENU.map(([k, t, i]) => `<button data-v="${k}" class="${view === k ? "on" : ""}">${ico(i)}${t}</button>`).join("")}</nav>
      <div class="foot">
        <a href="./" target="_blank">${ico("ext")}보는 화면 열기</a>
        <button id="logout" type="button">${ico("out")}로그아웃</button>
      </div>
    </aside>
    <main class="main" id="main"></main>
  </div>
  <div class="savebar" id="savebar"><div class="msg"><i></i>저장하지 않은 변경이 있습니다</div><button class="btn ghost" id="revert" type="button">되돌리기</button><button class="btn primary" id="save" type="button">저장하기</button></div>`;
  $("nav").onclick = (e) => { const b = e.target.closest("button"); if (b) go(b.dataset.v); };
  $("logout").onclick = async () => { if (isDirty() && !confirm("저장하지 않은 변경이 있습니다. 그래도 나갈까요?")) return; saved = snap(); await api("/api/logout", { method: "POST" }); showLogin(); };
  $("save").onclick = () => save();
  $("revert").onclick = async () => { S = await api("/api/admin/site"); markSaved(); draw(); toast("저장한 상태로 되돌렸습니다."); };
  draw();
}
function go(v) {
  view = v; location.hash = v;
  for (const b of document.querySelectorAll("#nav button")) b.classList.toggle("on", b.dataset.v === v);
  draw();
  window.scrollTo(0, 0);
}
function draw() {
  const m = $("main");
  ({ dash: drawDash, files: drawFiles, texts: drawTexts, logs: drawLogs, settings: drawSettings }[view] ?? drawDash)(m);
  updateSavebar();
}
async function save(quiet = false) {
  try {
    S = await api("/api/admin/site", { method: "POST", body: { ...S, cards: S.cards.map((c) => ({ id: c.id, title: c.title, label: c.label })) } });
    markSaved();
    if (!quiet) toast("저장했습니다. 보는 화면에 바로 반영됩니다.");
    if (view === "files") drawFiles($("main"));
  } catch (err) { toast(err.message); throw err; }
}
async function loadLogs() { try { LOGS = await api("/api/admin/logs"); } catch { LOGS = { rows: [], people: [], files: [], total: 0 }; } }

// ── 현황 ──
function drawDash(m) {
  const rows = LOGS?.rows ?? [];
  const today = new Date().toDateString();
  const isToday = (r) => new Date(r.at).toDateString() === today;
  const dls = rows.filter((r) => r.type === "download");
  const ready = S.cards.filter((c) => c.file).length;
  const people = new Set(dls.map((r) => r.name || r.ip)).size;
  m.innerHTML = `
  <div class="head"><div class="grow"><h1>현황</h1><p>${new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" })}</p></div>
    <button class="btn" id="copyLink">${ico("link")}KOI 에 올릴 링크 복사</button></div>
  <div class="stats">
    <div class="stat"><div class="ic c1">${ico("eye")}</div><div><small>오늘 접속</small><b>${rows.filter((r) => r.type === "visit" && isToday(r)).length}<i>회</i></b></div></div>
    <div class="stat"><div class="ic c2">${ico("down")}</div><div><small>오늘 다운로드</small><b>${dls.filter(isToday).length}<i>회</i></b></div></div>
    <div class="stat"><div class="ic c3">${ico("user")}</div><div><small>받아 간 사람 (전체)</small><b>${people}<i>명 · ${dls.length}회</i></b></div></div>
    <div class="stat"><div class="ic c4">${ico("file")}</div><div><small>올린 파일</small><b>${ready}<i>/ ${S.cards.length}칸</i></b></div></div>
  </div>
  <div class="two">
    <div class="card"><h2>최근 다운로드</h2><p class="desc">누가 언제 무엇을 받았는지 — 전체는 [접속 · 다운로드 기록]</p>
      <div class="feed">${dls.slice(0, 8).map((r) => `<div class="it">${avatar(r.name || "?")}<div><div class="who">${esc(r.name || "이름 없음")}<span>${esc(r.dept || r.ip)}</span></div><div class="what">${esc(`${r.title ?? ""} ${r.file ?? ""}`.trim())}</div></div><div class="t" title="${full(r.at)}">${rel(r.at)}</div></div>`).join("") || `<div class="empty">아직 다운로드가 없습니다.</div>`}</div>
      ${dls.length > 8 ? `<div style="margin-top:8px"><button class="btn ghost sm" data-go="logs">전체 기록 보기 →</button></div>` : ""}
    </div>
    <div class="card"><h2>월별 자료</h2><p class="desc">초록색은 파일이 올라간 칸 · 숫자는 다운로드 횟수</p>
      <div class="mgrid">${S.cards.map((c) => `<div class="mt ${c.file ? "ok" : ""}"><b>${esc(c.title)}</b><small>${c.file ? `${c.downloads ?? 0}회 받음` : "파일 없음"}</small></div>`).join("")}</div>
      <div style="margin-top:12px"><button class="btn sm" data-go="files">${ico("up")}파일 올리러 가기</button></div>
    </div>
  </div>`;
  $("copyLink").onclick = () => copy(pageUrl());
  for (const b of m.querySelectorAll("[data-go]")) b.onclick = () => go(b.dataset.go);
}

// ── 파일 관리 ──
function drawFiles(m) {
  const fmt = (iso) => new Date(iso).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
  m.innerHTML = `
  <div class="head"><div class="grow"><h1>파일 관리</h1><p>칸에 파일을 끌어다 놓거나 [올리기]를 누르면 바로 올라갑니다. 어떤 파일이든 되고, 큰 파일도 됩니다.</p></div></div>
  <div class="toolbar">
    <label>한 줄에 <select id="cols">${[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `<option ${S.columns === n ? "selected" : ""}>${n}</option>`).join("")}</select> 칸씩 보이기</label>
    <span style="flex:1"></span>
    <span style="color:var(--sub);font-size:13px">제목 · 칸 글자는 눌러서 바로 고치고, ⠿ 를 끌어 순서를 바꿉니다</span>
  </div>
  <div class="fgrid" id="fgrid">
    ${S.cards.map((c, i) => `
    <div class="fc ${c.file ? "has" : ""}" data-i="${i}">
      <div class="top"><button class="grip" draggable="true" data-i="${i}" title="끌어서 순서 바꾸기">${ico("grip")}</button>
        <input class="tt" data-c="${i}" data-f="title" value="${esc(c.title)}" placeholder="제목">
        <button class="x" data-del="${i}" title="칸 지우기">${ico("trash")}</button></div>
      <input class="lb" data-c="${i}" data-f="label" value="${esc(c.label)}" placeholder="보는 화면에 보일 파일 이름">
      <div class="fbox">
        ${c.file ? `<div class="fn">${fileIcon(extOf(c.file.name))}<span>${esc(c.file.name)}</span></div>
          <div class="meta"><span>${esc(c.file.sizeText)}</span><span>${fmt(c.file.at)} 올림</span><span>${ico("down", "ico")} ${c.downloads ?? 0}회</span></div>`
        : `<div>${ico("up")}</div><div>여기로 파일을 끌어다 놓거나</div>`}
        <div class="prog hidden" id="prog-${i}"><i></i></div>
        <div class="acts">
          <label class="btn sm ${c.file ? "" : "primary"}">${c.file ? "바꾸기" : "파일 올리기"}<input type="file" data-up="${i}" hidden></label>
          ${c.file ? `<button class="btn sm danger" data-rm="${i}">지우기</button>` : ""}
        </div>
      </div>
    </div>`).join("")}
    <button class="addc" id="addCard">${ico("plus")}칸 추가</button>
  </div>`;
  const g = $("fgrid");
  $("cols").onchange = (e) => { S.columns = Number(e.target.value); updateSavebar(); };
  g.oninput = (e) => { const t = e.target; if (t.dataset.c != null) { S.cards[t.dataset.c][t.dataset.f] = t.value; updateSavebar(); } };
  g.onclick = async (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.id === "addCard") { S.cards.push({ id: `new-${Date.now()}`, title: `${S.cards.length + 1}월`, label: S.cards.at(-1)?.label ?? "", file: null }); drawFiles(m); updateSavebar(); return; }
    if (b.dataset.del != null) {
      const c = S.cards[+b.dataset.del];
      if (!confirm(`‘${c.title}’ 칸을 지울까요?${c.file ? "\n올린 파일도 저장할 때 같이 지워집니다." : ""}`)) return;
      S.cards.splice(+b.dataset.del, 1); drawFiles(m); updateSavebar();
    }
    if (b.dataset.rm != null) {
      const c = S.cards[+b.dataset.rm];
      if (!confirm(`‘${c.title}’ 에 올린 파일(${c.file.name})을 지울까요?`)) return;
      try { if (isDirty()) await save(true); S = await api(`/api/admin/file/${c.id}`, { method: "DELETE" }); markSaved(); drawFiles(m); toast("파일을 지웠습니다."); } catch (err) { toast(err.message); }
    }
  };
  g.onchange = (e) => { if (e.target.dataset.up != null && e.target.files[0]) upload(+e.target.dataset.up, e.target.files[0]); };
  // 끌기: ⠿ 로 순서 바꾸기, 파일은 칸에 놓으면 올리기
  let from = null;
  g.ondragstart = (e) => { const gp = e.target.closest(".grip"); if (!gp) return; from = +gp.dataset.i; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", "card"); gp.closest(".fc").classList.add("dragging"); };
  g.ondragend = () => { for (const x of g.querySelectorAll(".dragging, .over")) x.classList.remove("dragging", "over"); };
  g.ondragover = (e) => { const fc = e.target.closest(".fc"); if (!fc) return; e.preventDefault(); for (const x of g.querySelectorAll(".over")) if (x !== fc) x.classList.remove("over"); fc.classList.add("over"); };
  g.ondragleave = (e) => { const fc = e.target.closest(".fc"); if (fc && !fc.contains(e.relatedTarget)) fc.classList.remove("over"); };
  g.ondrop = (e) => {
    const fc = e.target.closest(".fc"); if (!fc) return;
    e.preventDefault(); fc.classList.remove("over");
    const to = +fc.dataset.i;
    if (e.dataTransfer.files.length) { upload(to, e.dataTransfer.files[0]); return; }
    if (from == null || from === to) return;
    const [mv] = S.cards.splice(from, 1); S.cards.splice(to, 0, mv); from = null; drawFiles(m); updateSavebar();
  };
}
async function upload(i, file) {
  if (isDirty() || String(S.cards[i].id).startsWith("new-")) { try { await save(true); } catch { return; } }
  const c = S.cards[i];
  const prog = $(`prog-${i}`);
  prog?.classList.remove("hidden");
  const xhr = new XMLHttpRequest();
  xhr.open("PUT", `/api/admin/upload/${c.id}`);
  xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
  xhr.upload.onprogress = (e) => { if (e.lengthComputable && prog) prog.firstElementChild.style.width = `${(e.loaded / e.total) * 100}%`; };
  xhr.onload = () => {
    let j = {}; try { j = JSON.parse(xhr.responseText); } catch { /* */ }
    if (xhr.status === 401) return showLogin();
    if (xhr.status !== 200) { prog?.classList.add("hidden"); return toast(j.error ?? "올리지 못했습니다."); }
    S = j; markSaved(); if (view === "files") drawFiles($("main")); toast(`‘${c.title}’ 에 ${file.name} 을(를) 올렸습니다.`);
  };
  xhr.onerror = () => { prog?.classList.add("hidden"); toast("올리는 중 연결이 끊겼습니다. 다시 시도하세요."); };
  xhr.send(file);
  toast(`${file.name} 올리는 중… (${(file.size / 1048576).toFixed(1)}MB)`);
}

// ── 문구 편집 (오른쪽 미리보기가 바로 바뀜) ──
const fld = (k, label, area = false) => `<label class="f"><span>${label}</span>${area ? `<textarea data-k="${k}">${esc(S[k])}</textarea>` : `<input data-k="${k}" value="${esc(S[k])}">`}</label>`;
function toPublic() {
  return {
    ...Object.fromEntries(TEXT_KEYS.map((k) => [k, S[k]])), columns: S.columns, askName: S.askName !== false, info: S.info.filter((t) => t.trim()),
    heroImage: S.heroImage ? `/media/${S.heroImage}` : null,
    cards: S.cards.map((c) => ({ id: c.id, title: c.title, label: c.label, ready: !!c.file, size: c.file?.sizeText ?? null, ext: extOf(c.file ? c.file.name : c.label), fname: "" })),
  };
}
function pushPreview() { $("pvFrame")?.contentWindow?.postMessage({ type: "bs-preview", site: toPublic() }, location.origin); }
function fitPreview() { const f = $("pvFrame"), box = f?.parentElement; if (f && box) f.style.transform = `scale(${box.clientWidth / 1400})`; }
window.addEventListener("message", (e) => { if (e.origin === location.origin && e.data?.type === "bs-preview-ready") pushPreview(); });
window.addEventListener("resize", fitPreview);
function drawTexts(m) {
  m.innerHTML = `
  <div class="head"><div class="grow"><h1>문구 편집</h1><p>고치면 오른쪽 미리보기에 바로 보입니다. 다 고친 뒤 아래 [저장하기]를 누르세요.</p></div></div>
  <div class="edit">
    <div class="form">
      <details class="grp" open><summary>① 머리글 (맨 위 파란 띠)</summary><div class="body">
        <div class="row2">${fld("brand", "왼쪽 부서명")}${fld("tab", "브라우저 탭 제목")}</div>
        ${fld("title", "큰 제목")}${fld("subtitle", "작은 제목")}
        <div class="row2">${fld("helmet", "그림 속 안전모 글자")}${fld("clipboard", "그림 속 점검표 글자")}</div>
      </div></details>
      <details class="grp" open><summary>② 인사말</summary><div class="body">
        <div class="row3">${fld("greetPre", "앞부분")}${fld("greetName", "파란 글씨(이름)")}${fld("greetPost", "뒷부분")}</div>
        ${fld("notice", "안내 본문 (줄 바꿈 그대로 보임)", true)}
      </div></details>
      <details class="grp" open><summary>③ 자료 칸</summary><div class="body">
        ${fld("sectionTitle", "제목")}${fld("sectionHint", "오른쪽 안내 문구")}
        <div class="row2">${fld("downloadLabel", "버튼 글자")}${fld("emptyLabel", "파일 없을 때 버튼")}</div>
        <p style="margin:0;color:var(--sub);font-size:13px">칸 이름 · 순서 · 파일은 [파일 관리]에서 바꿉니다.</p>
      </div></details>
      <details class="grp" open><summary>④ 아래 안내</summary><div class="body">
        ${fld("infoTitle", "왼쪽 제목")}
        <div class="f"><span>안내 줄</span><div class="lines" id="lines"></div></div>
        <div><button class="btn sm" id="addLine" type="button">${ico("plus")}줄 추가</button></div>
      </div></details>
    </div>
    <div class="pv"><div class="bar"><div class="dots"><i></i><i></i><i></i></div><b>미리보기</b> · 저장 전 모습</div><div class="frame"><iframe id="pvFrame" src="./?preview=1" title="미리보기"></iframe></div></div>
  </div>`;
  drawLines();
  m.querySelector(".form").oninput = (e) => {
    const t = e.target;
    if (t.dataset.k) S[t.dataset.k] = t.value;
    else if (t.dataset.ln != null) S.info[t.dataset.ln] = t.value;
    else return;
    updateSavebar(); pushPreview();
  };
  $("addLine").onclick = () => { S.info.push(""); drawLines(); updateSavebar(); $("lines").querySelector(".ln:last-child input")?.focus(); };
  $("lines").onclick = (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const i = +b.dataset.i;
    if (b.dataset.a === "up") [S.info[i - 1], S.info[i]] = [S.info[i], S.info[i - 1]];
    if (b.dataset.a === "down") [S.info[i + 1], S.info[i]] = [S.info[i], S.info[i + 1]];
    if (b.dataset.a === "del") S.info.splice(i, 1);
    drawLines(); updateSavebar(); pushPreview();
  };
  $("pvFrame").onload = () => { fitPreview(); pushPreview(); };
  fitPreview();
}
function drawLines() {
  $("lines").innerHTML = S.info.map((t, i) => `<div class="ln"><input data-ln="${i}" value="${esc(t)}" placeholder="안내 문장">
    <button class="iconbtn" data-a="up" data-i="${i}" ${i === 0 ? "disabled" : ""} title="위로">${ico("upA")}</button>
    <button class="iconbtn" data-a="down" data-i="${i}" ${i === S.info.length - 1 ? "disabled" : ""} title="아래로">${ico("downA")}</button>
    <button class="iconbtn del" data-a="del" data-i="${i}" title="지우기">${ico("x")}</button></div>`).join("");
}

// ── 기록 ──
function drawLogs(m) {
  const TY = { visit: "접속", download: "다운로드", admin: "관리자 로그인", adminFail: "비밀번호 틀림" };
  const now = Date.now(), days = { today: 0, d7: 7, d30: 30 }[logFilter.period];
  const inPeriod = (r) => logFilter.period === "all" || (logFilter.period === "today" ? new Date(r.at).toDateString() === new Date().toDateString() : now - new Date(r.at) < days * 86400000);
  const q = logFilter.q.trim().toLowerCase();
  const all = LOGS?.rows ?? [];
  const rows = all.filter((r) => inPeriod(r) && (!logFilter.type || (logFilter.type === "admin" ? r.type.startsWith("admin") : r.type === logFilter.type))
    && (!q || [r.name, r.dept, r.file, r.title, r.ip, r.host].some((v) => String(v ?? "").toLowerCase().includes(q))));
  // 기간 안 요약
  const per = all.filter(inPeriod);
  const byP = new Map(), byF = new Map();
  for (const r of per) {
    if (r.type !== "download" && r.type !== "visit") continue;
    const k = r.name ? `${r.name}|${r.dept}` : `|${r.ip}`;
    const p = byP.get(k) ?? { name: r.name, sub: r.name ? r.dept : r.ip, v: 0, d: 0, last: r.at, files: new Set() };
    if (r.type === "visit") p.v++; else { p.d++; p.files.add(r.title ?? r.file); }
    byP.set(k, p);
    if (r.type === "download") { const fk = `${r.title ?? ""} ${r.file}`.trim(); const f = byF.get(fk) ?? { file: fk, n: 0, who: new Set() }; f.n++; f.who.add(r.name || r.ip); byF.set(fk, f); }
  }
  const chip = (grp, v, t) => `<button class="chip ${logFilter[grp] === v ? "on" : ""}" data-g="${grp}" data-v="${v}">${t}</button>`;
  m.innerHTML = `
  <div class="head"><div class="grow"><h1>접속 · 다운로드 기록</h1><p>언제 · 누가 · 어떤 파일을 받았는지 모두 남습니다 (전체 ${LOGS?.total ?? 0}건)</p></div>
    <button class="btn" id="reload">새로고침</button><a class="btn primary" href="/api/admin/logs.csv">${ico("down")}엑셀로 내려받기</a></div>
  <div class="toolbar">
    <div class="chips">${chip("type", "download", "다운로드")}${chip("type", "visit", "접속")}${chip("type", "", "전체")}${chip("type", "admin", "관리자")}</div>
    <div class="chips">${chip("period", "today", "오늘")}${chip("period", "d7", "7일")}${chip("period", "d30", "30일")}${chip("period", "all", "전체 기간")}</div>
    <label class="search">${ico("search")}<input id="q" value="${esc(logFilter.q)}" placeholder="이름 · 소속 · 파일 · IP 로 찾기"></label>
  </div>
  <div class="tblwrap"><table class="tbl"><thead><tr><th>시각</th><th>구분</th><th>누가</th><th>파일</th><th class="hide-m">PC</th><th class="hide-m">브라우저</th></tr></thead><tbody>
    ${rows.slice(0, 500).map((r) => `<tr>
      <td class="time"><b>${rel(r.at)}</b><small>${full(r.at)}</small></td>
      <td><span class="tag ${r.type}">${TY[r.type] ?? r.type}</span></td>
      <td><div class="person">${avatar(r.name || "?")}<div><b>${esc(r.name || "이름 없음")}</b><small>${esc(r.dept || "")}</small></div></div></td>
      <td>${r.file ? `<b>${esc(r.title ?? "")}</b> ${esc(r.file)}` : '<span style="color:var(--sub)">—</span>'}</td>
      <td class="pc hide-m">${esc(r.ip)}<small>${esc(r.host || "")}</small></td>
      <td class="hide-m" style="color:var(--sub);font-size:13px">${esc(r.ua ?? "")}</td></tr>`).join("") || `<tr><td colspan="6"><div class="empty">조건에 맞는 기록이 없습니다.</div></td></tr>`}
  </tbody></table></div>
  <p style="color:var(--sub);font-size:13px;margin:8px 2px 18px">${rows.length}건${rows.length > 500 ? " — 화면에는 최근 500건, 전체는 엑셀로" : ""}</p>
  <div class="two">
    <div class="card"><h2>사람별</h2><p class="desc">선택한 기간 · 다운로드 많은 순</p><div class="sumlist">
      ${[...byP.values()].sort((a, b) => b.d - a.d || b.v - a.v).map((p) => `<div class="sumi">${avatar(p.name || "?")}<div><b>${esc(p.name || "이름 없음")}</b> <small style="display:inline">${esc(p.sub || "")}</small><small>${p.files.size ? esc([...p.files].join(", ")) : "받은 파일 없음"} · 마지막 ${rel(p.last)}</small></div><div class="n">${p.d}회<small>접속 ${p.v}</small></div></div>`).join("") || '<div class="empty">없음</div>'}
    </div></div>
    <div class="card"><h2>파일별 다운로드</h2><p class="desc">선택한 기간</p><div class="sumlist">
      ${[...byF.values()].sort((a, b) => b.n - a.n).map((f) => `<div class="sumi">${fileIcon(extOf(f.file)).replace('class="fi"', 'style="width:28px;height:34px"')}<div><b>${esc(f.file)}</b><small>${esc([...f.who].join(", "))}</small></div><div class="n">${f.n}회<small>${f.who.size}명</small></div></div>`).join("") || '<div class="empty">없음</div>'}
    </div></div>
  </div>`;
  m.querySelector(".toolbar").onclick = (e) => { const b = e.target.closest(".chip"); if (b) { logFilter[b.dataset.g] = b.dataset.v; drawLogs(m); } };
  $("q").oninput = (e) => { logFilter.q = e.target.value; clearTimeout(drawLogs.t); drawLogs.t = setTimeout(() => { drawLogs(m); const q2 = $("q"); q2.focus(); q2.setSelectionRange(q2.value.length, q2.value.length); }, 250); };
  $("reload").onclick = async () => { await loadLogs(); drawLogs(m); toast("새로 불러왔습니다."); };
}

// ── 설정 ──
function drawSettings(m) {
  m.innerHTML = `
  <div class="head"><div class="grow"><h1>설정</h1><p>링크 · 이름 묻기 · 머리글 사진 · 비밀번호</p></div></div>
  <div class="set">
    <div class="card"><h2>보는 화면 주소</h2><p class="desc">이 주소를 KOI 에 링크로 올리면 됩니다. (서버 PC 의 IP 로 열어야 다른 PC 에서도 들어옵니다)</p>
      <div style="display:flex;gap:8px"><input value="${esc(pageUrl())}" readonly style="flex:1;border:1px solid #d0d8e6;border-radius:9px;padding:9px 11px;background:#fafbfd"><button class="btn" id="copyLink">${ico("link")}복사</button></div></div>
    <div class="card"><h2>다운로드 기록에 이름 남기기</h2><p class="desc">켜 두면 처음 들어온 사람에게 이름 · 소속을 한 번 묻습니다.</p>
      <label class="switch"><input type="checkbox" id="askName" ${S.askName !== false ? "checked" : ""}><div><b>이름 · 소속 묻기</b><small>끄면 IP · PC 이름만 남습니다</small></div></label></div>
    <div class="card"><h2>머리글 오른쪽 그림</h2><p class="desc">기본은 공장 · 안전모 · 점검표 그림입니다. 사진으로 바꿀 수 있습니다 (가로로 긴 png · jpg · webp).</p>
      <div class="hero-pv" style="${S.heroImage ? `background-image:url('/media/${esc(S.heroImage)}')` : ""}">${S.heroImage ? "" : '<div style="color:#c9d5ee;padding:34px;text-align:center;font-size:13px">기본 그림 사용 중</div>'}</div>
      <div class="prog hidden" id="heroProg" style="margin-bottom:8px"><i></i></div>
      <div style="display:flex;gap:8px"><label class="btn primary">${ico("up")}사진 올리기<input type="file" id="heroFile" accept="image/png,image/jpeg,image/webp" hidden></label>
      <button class="btn danger" id="heroDel" ${S.heroImage ? "" : "disabled"}>기본 그림으로</button></div></div>
    <div class="card"><h2>관리자 비밀번호</h2>
      <div class="row2" style="margin:10px 0"><label class="f"><span>지금 비밀번호</span><input type="password" id="pwCur" autocomplete="current-password"></label><label class="f"><span>새 비밀번호 (4자 이상)</span><input type="password" id="pwNew" autocomplete="new-password"></label></div>
      <button class="btn primary" id="pwBtn">비밀번호 바꾸기</button></div>
    <div class="card"><h2>문구 초기화</h2><p class="desc">모든 문구를 처음 상태로 되돌립니다. 칸 · 파일 · 기록은 그대로입니다.</p><button class="btn danger" id="resetBtn">문구 처음 상태로</button></div>
  </div>`;
  $("copyLink").onclick = () => copy(pageUrl());
  $("askName").onchange = async (e) => { S.askName = e.target.checked; try { await save(true); toast(S.askName ? "이름을 묻도록 했습니다." : "이름을 묻지 않도록 했습니다."); } catch { /* toast 함 */ } };
  $("heroFile").onchange = (e) => {
    const f = e.target.files[0]; if (!f) return;
    const prog = $("heroProg"); prog.classList.remove("hidden");
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", "/api/admin/hero"); xhr.setRequestHeader("X-File-Name", encodeURIComponent(f.name));
    xhr.upload.onprogress = (ev) => { if (ev.lengthComputable) prog.firstElementChild.style.width = `${(ev.loaded / ev.total) * 100}%`; };
    xhr.onload = () => { let j = {}; try { j = JSON.parse(xhr.responseText); } catch { /* */ } if (xhr.status !== 200) { prog.classList.add("hidden"); return toast(j.error ?? "올리지 못했습니다."); } S = j; markSaved(); drawSettings(m); toast("사진을 바꿨습니다."); };
    xhr.send(f);
  };
  $("heroDel").onclick = async () => { try { S = await api("/api/admin/hero", { method: "DELETE" }); markSaved(); drawSettings(m); toast("기본 그림으로 돌렸습니다."); } catch (err) { toast(err.message); } };
  $("pwBtn").onclick = async () => { try { await api("/api/admin/password", { method: "POST", body: { current: $("pwCur").value, next: $("pwNew").value } }); $("pwCur").value = $("pwNew").value = ""; toast("비밀번호를 바꿨습니다."); } catch (err) { toast(err.message); } };
  $("resetBtn").onclick = async () => { if (!confirm("모든 문구를 처음 상태로 되돌릴까요?")) return; try { S = await api("/api/admin/reset-texts", { method: "POST" }); markSaved(); toast("문구를 되돌렸습니다."); } catch (err) { toast(err.message); } };
}

async function boot() {
  try { S = await api("/api/admin/site"); } catch { return; }
  markSaved();
  await loadLogs();
  shell();
}
boot();
