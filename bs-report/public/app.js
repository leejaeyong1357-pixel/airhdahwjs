// 보는 화면 — /api/site 에서 문구 · 칸을 받아 그린다
// 처음 들어오면 이름(+소속)을 한 번 묻고, 접속 · 다운로드 기록에 남긴다 (이 PC 브라우저에 기억)
const PREVIEW = new URLSearchParams(location.search).has("preview"); // 관리자 미리보기는 기록 안 함
const WHO_KEY = "bs-report-viewer";
function getWho() { try { return JSON.parse(localStorage.getItem(WHO_KEY) ?? "null"); } catch { return null; } }
function setWho(w) { try { localStorage.setItem(WHO_KEY, JSON.stringify(w)); } catch { /* 저장 안 되는 브라우저 */ } WHO = w; }
let WHO = getWho();
const whoParam = () => (WHO?.name ? `who=${encodeURIComponent(JSON.stringify(WHO))}` : "");
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** 파일 종류 아이콘 (P · X · W · PDF · 그 밖) */
export function fileIcon(ext) {
  const map = {
    ppt: ["P", "#d24726"], pptx: ["P", "#d24726"], pptm: ["P", "#d24726"],
    xls: ["X", "#1d7044"], xlsx: ["X", "#1d7044"], xlsm: ["X", "#1d7044"], csv: ["CSV", "#1d7044"],
    doc: ["W", "#2b579a"], docx: ["W", "#2b579a"], pdf: ["PDF", "#c62828"], hwp: ["H", "#1f86c9"], hwpx: ["H", "#1f86c9"],
    txt: ["TXT", "#5b6475"], zip: ["ZIP", "#7a5a2b"], "7z": ["ZIP", "#7a5a2b"], rar: ["ZIP", "#7a5a2b"],
    jpg: ["IMG", "#8e44ad"], jpeg: ["IMG", "#8e44ad"], png: ["IMG", "#8e44ad"], gif: ["IMG", "#8e44ad"],
    mp4: ["VID", "#d35400"], mov: ["VID", "#d35400"], avi: ["VID", "#d35400"], dwg: ["CAD", "#a61d24"],
  };
  const [t, c] = map[ext] ?? ["F", "#5b6475"];
  return `<svg viewBox="0 0 40 48" class="fi" aria-hidden="true"><path d="M4 2h22l10 10v32a2 2 0 01-2 2H4a2 2 0 01-2-2V4a2 2 0 012-2z" fill="#fff" stroke="${c}" stroke-width="2.5"/><path d="M26 2v10h10" fill="none" stroke="${c}" stroke-width="2.5"/><rect x="0" y="16" width="${t.length > 1 ? 30 : 22}" height="20" rx="3" fill="${c}"/><text x="${t.length > 1 ? 15 : 11}" y="31" text-anchor="middle" font-size="${t.length > 1 ? 10 : 14}" font-weight="800" fill="#fff" font-family="Arial,sans-serif">${t}</text></svg>`;
}

/** 간단한 꾸밈 — 줄 앞 "- " 또는 "• " 는 글머리표, **글자** 는 굵게 */
function richText(t) {
  const bold = (x) => esc(x).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  const lines = String(t ?? "").split("\n");
  let html = "", inList = false;
  for (const ln of lines) {
    const m = /^\s*[-•·]\s+(.*)$/.exec(ln);
    if (m) { if (!inList) { html += "<ul>"; inList = true; } html += `<li>${bold(m[1])}</li>`; continue; }
    if (inList) { html += "</ul>"; inList = false; }
    if (ln.trim()) html += `<div>${bold(ln)}</div>`;
  }
  return html + (inList ? "</ul>" : "");
}

/** 취합 현황 — 안내 문구 + 요약 + 월별 표 (합계는 자동) */
function renderStats(s) {
  const box = $("stats");
  if (!box) return;
  const rows = s.statsRows ?? [];
  box.classList.toggle("hidden", !s.statsShow || (!rows.length && !String(s.statsText ?? "").trim()));
  $("statsTitle").textContent = s.statsTitle ?? "";
  $("statsText").innerHTML = richText(s.statsText);
  const sum = [1, 2, 3].map((k) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0));
  const h = s.statsHead ?? ["월", "평일 수", "공휴일(미작성)", "취합 완료"];
  // 취합률 = 취합 완료 ÷ (평일 수 − 공휴일 미작성) — 공휴일은 작성 대상이 아니므로 뺀다
  const need = Math.max(0, sum[0] - sum[1]);
  const rate = need ? Math.round(Math.min(1, sum[2] / need) * 1000) / 10 : 0;
  $("statsSum").innerHTML = rows.length ? `
    <div class="sv"><small>${esc(h[1])} 합계</small><b>${sum[0]}<i>일</i></b></div>
    <div class="sv"><small>${esc(h[2])}</small><b>${sum[1]}<i>개</i></b></div>
    <div class="sv on"><small>${esc(h[3])}</small><b>${sum[2]}<i>개</i></b></div>
    <div class="sv"><small>취합률 (공휴일 미작성 제외)</small><b>${rate}<i>% · ${sum[2]} / ${need}</i></b></div>` : "";
  $("statsTable").innerHTML = rows.length ? `
    <thead><tr>${h.map((t) => `<th>${esc(t)}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((r) => `<tr><td>${esc(r[0])}</td><td>${r[1]}</td><td class="${r[2] ? "warn" : ""}">${r[2]}</td><td class="done">${r[3]}</td></tr>`).join("")}</tbody>
    <tfoot><tr><td>합계</td><td>${sum[0]}</td><td>${sum[1]}</td><td>${sum[2]}</td></tr></tfoot>` : "";
}

export function render(s, { preview = false } = {}) {
  document.title = s.tab;
  for (const k of ["brand", "title", "subtitle", "greetPre", "greetName", "greetPost", "notice", "sectionTitle", "sectionHint", "infoTitle"]) if ($(k)) $(k).textContent = s[k];
  if ($("artHelmet")) $("artHelmet").textContent = s.helmet;
  if ($("artClip")) $("artClip").textContent = s.clipboard;
  const art = $("heroArt");
  if (art) {
    art.classList.toggle("photo", !!s.heroImage);
    art.style.backgroundImage = s.heroImage ? `linear-gradient(90deg, #16346c 0%, rgba(22,52,108,0) 40%), url("${s.heroImage}")` : "";
  }
  const grid = $("grid");
  grid.style.setProperty("--cols", s.columns);
  grid.innerHTML = s.cards.map((c) => `
    <div class="cardf${c.ready ? "" : " empty"}">
      <div class="ct">${fileIcon(c.ext)}<b>${esc(c.title)}</b></div>
      <div class="cl" title="${esc(c.label)}">${esc(c.label)}</div>
      ${c.ready
        ? `<a class="dl" data-href="download/${c.id}/${encodeURIComponent(c.fname)}" href="${preview ? "#" : `download/${c.id}/${encodeURIComponent(c.fname)}`}"><svg viewBox="0 0 24 24" class="ico"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>${esc(s.downloadLabel)}</a><small class="sz">${esc(c.size)}</small>`
        : `<span class="dl off">${esc(s.emptyLabel)}</span><small class="sz">&nbsp;</small>`}
    </div>`).join("");
  $("info").innerHTML = s.info.map((t) => `<li>${esc(t)}</li>`).join("");
  renderStats(s);
}

/** 이름 묻는 창 — 다운로드 기록에 누가 받았는지 남기려고 */
function askName(then) {
  const m = $("whoModal");
  $("whoName").value = WHO?.name ?? "";
  $("whoDept").value = WHO?.dept ?? "";
  m.classList.remove("hidden");
  setTimeout(() => $("whoName").focus(), 30);
  $("whoForm").onsubmit = (e) => {
    e.preventDefault();
    const name = $("whoName").value.trim();
    if (!name) { $("whoName").focus(); return; }
    setWho({ name, dept: $("whoDept").value.trim() });
    m.classList.add("hidden");
    showWho();
    then?.();
  };
}
function showWho() {
  const el = $("whoChip");
  if (!el) return;
  el.classList.toggle("hidden", !WHO?.name);
  if (WHO?.name) $("whoText").textContent = `${WHO.name}${WHO.dept ? ` (${WHO.dept})` : ""} 님`;
}

async function start() {
  let s;
  try { s = await (await fetch("api/site")).json(); }
  catch { document.body.insertAdjacentHTML("afterbegin", '<p style="padding:20px;color:#c00">자료를 불러오지 못했습니다. 잠시 뒤 새로고침해 주세요.</p>'); return; }
  render(s);
  if (PREVIEW) {
    // 관리자 화면에서 고치는 대로 바로 보여 주기
    window.addEventListener("message", (e) => { if (e.origin === location.origin && e.data?.type === "bs-preview") render(e.data.site, { preview: true }); });
    parent.postMessage({ type: "bs-preview-ready" }, location.origin);
    return;
  }
  const logVisit = () => fetch(`api/site?log=1&${whoParam()}`).catch(() => {});
  showWho();
  if (s.askName && !WHO?.name) askName(logVisit); else logVisit();
  // 다운로드 — 이름을 붙여서 (이름이 없으면 먼저 묻기)
  $("grid").addEventListener("click", (e) => {
    const a = e.target.closest("a.dl");
    if (!a) return;
    e.preventDefault();
    const go = () => { location.href = `${a.dataset.href}?${whoParam()}`; };
    if (s.askName && !WHO?.name) askName(go); else go();
  });
  $("whoEdit").onclick = () => askName();
}
if ($("grid")) start(); // 관리자 화면이 아이콘만 가져다 쓸 때는 실행 안 함
