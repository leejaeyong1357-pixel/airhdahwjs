// 설문 화면 — 1쪽: 업무 수행 역량 변화 · AI 활용 역량, 2쪽: 교육 만족도 · 응답자 정보 · 의견
import { SECTIONS, RANKS, OPEN } from "./questions.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const DRAFT = "teczen-survey-2026-draft";
const PAGES = 2;

const ICONS = {
  doc: '<svg viewBox="0 0 24 24" class="ico"><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/><path d="M9 12h7M9 15.5h7M9 19h4"/></svg>',
  ai: '<svg viewBox="0 0 24 24" class="ico"><rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/><text x="12" y="14.6" text-anchor="middle" font-size="6.4" font-weight="800" fill="currentColor" stroke="none" font-family="Arial,sans-serif">AI</text></svg>',
  star: '<svg viewBox="0 0 24 24" class="ico"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>',
};

const state = { page: 1, scores: {}, dept: "", rank: "", text: {} };
try { Object.assign(state, JSON.parse(localStorage.getItem(DRAFT) ?? "{}"), { page: 1 }); } catch { /* 저장 안 됨 */ }

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("on");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove("on"), 2200);
}
function saveDraft(silent = true) {
  try { localStorage.setItem(DRAFT, JSON.stringify({ scores: state.scores, dept: state.dept, rank: state.rank, text: state.text })); if (!silent) toast("임시 저장했습니다. 이 PC에서 다시 열면 이어서 할 수 있습니다."); }
  catch { if (!silent) toast("이 브라우저에서는 임시 저장을 할 수 없습니다."); }
}

function sectionHtml(s) {
  const rows = s.items.map((it, i) => {
    const v = state.scores[it.id];
    const opts = [1, 2, 3, 4, 5].map((n) => `
      <label class="opt"><input type="radio" name="${it.id}" value="${n}" ${v === n ? "checked" : ""} aria-label="${n}점${it.a ? ` — ${esc(it.a[n - 1])}` : ""}"><i class="dot"></i><span>${n}</span></label>`).join("");
    return `
    <div class="q" id="q-${it.id}">
      <div class="num">${i + 1}</div>
      <div class="qt">${esc(it.q)}<span class="pick" id="pick-${it.id}">${v && it.a ? `${v}점 · ${esc(it.a[v - 1])}` : ""}</span></div>
      <div class="scale" role="radiogroup" aria-label="${esc(it.q)}">
        <div class="end"><b>낮음</b>(${esc(it.low)})</div>${opts}
        <div class="end hi"><b>높음</b>(${esc(it.high)})</div>
      </div>
    </div>`;
  }).join("");
  return `
  <section class="sec" data-sec="${s.id}">
    <div class="sec-h">
      <div class="sec-ic">${ICONS[s.icon]}</div>
      <div class="sec-t"><h2><span>Section ${s.no}</span>${esc(s.title)}</h2><p>${esc(s.desc)}</p></div>
      <div class="count">총 ${s.items.length}문항</div>
    </div>
    ${rows}
  </section>`;
}

function infoHtml() {
  return `
  <section class="sec">
    <div class="sec-h">
      <div class="sec-ic"><svg viewBox="0 0 24 24" class="ico"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg></div>
      <div class="sec-t"><h2><span>Section ${SECTIONS.length + 1}</span>응답자 정보 · 의견</h2><p>결과 분석에만 쓰며 이름은 묻지 않습니다. (선택 사항)</p></div>
    </div>
    <div class="form">
      <div class="row">
        <label>소속 부서 <small>예: 생산관리팀</small><input id="dept" maxlength="40" value="${esc(state.dept)}" placeholder="소속 부서"></label>
        <label>직급<select id="rank"><option value="">선택 안 함</option>${RANKS.map((r) => `<option ${state.rank === r ? "selected" : ""}>${r}</option>`).join("")}</select></label>
      </div>
      ${OPEN.map((o) => `<label>${esc(o.q)}<textarea id="t-${o.id}" maxlength="1000" placeholder="자유롭게 적어 주세요.">${esc(state.text[o.id] ?? "")}</textarea></label>`).join("")}
    </div>
  </section>`;
}

function render() {
  const p = state.page;
  const html = SECTIONS.filter((s) => s.page === p).map(sectionHtml).join("") + (p === PAGES ? infoHtml() : "");
  $("pages").innerHTML = html;
  $("pageNo").textContent = p;
  const pct = Math.round((p / PAGES) * 100);
  $("pct").textContent = pct;
  $("barFill").style.width = `${pct}%`;
  $("prevBtn").disabled = p === 1;
  $("nextBtn").innerHTML = p === PAGES ? '제출하기 <svg viewBox="0 0 24 24" class="ico"><path d="M5 12l5 5L20 7"/></svg>' : '다음 <svg viewBox="0 0 24 24" class="ico"><path d="M9 5l7 7-7 7"/></svg>';
  // 이벤트
  for (const input of document.querySelectorAll('.opt input')) {
    input.onchange = () => {
      const id = input.name, n = Number(input.value);
      state.scores[id] = n;
      const it = SECTIONS.flatMap((s) => s.items).find((x) => x.id === id);
      const pick = $(`pick-${id}`);
      if (pick) pick.textContent = it?.a ? `${n}점 · ${it.a[n - 1]}` : "";
      $(`q-${id}`).classList.remove("missing");
      saveDraft();
    };
  }
  if (p === PAGES) {
    $("dept").oninput = (e) => { state.dept = e.target.value; saveDraft(); };
    $("rank").onchange = (e) => { state.rank = e.target.value; saveDraft(); };
    for (const o of OPEN) $(`t-${o.id}`).oninput = (e) => { state.text[o.id] = e.target.value; saveDraft(); };
  }
}

/** 이 쪽에서 안 고른 문항 */
function missing(page) {
  return SECTIONS.filter((s) => s.page === page).flatMap((s) => s.items).filter((it) => !state.scores[it.id]);
}
function checkPage() {
  const miss = missing(state.page);
  for (const it of miss) $(`q-${it.id}`)?.classList.add("missing");
  if (miss.length) {
    $(`q-${miss[0].id}`).scrollIntoView({ behavior: "smooth", block: "center" });
    toast(`아직 답하지 않은 문항이 ${miss.length}개 있습니다.`);
    return false;
  }
  return true;
}

async function submit() {
  const btn = $("nextBtn");
  btn.disabled = true;
  try {
    const r = await fetch("api/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scores: state.scores, dept: state.dept, rank: state.rank, text: state.text }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error ?? "제출하지 못했습니다.");
    try { localStorage.removeItem(DRAFT); } catch { /* 무시 */ }
    $("pages").innerHTML = `<div class="done"><div class="ok"><svg viewBox="0 0 24 24" class="ico"><path d="M5 12l5 5L20 7"/></svg></div><h2>응답해 주셔서 감사합니다</h2><p>소중한 의견은 27년도 교육 운영에 반영하겠습니다.</p></div>`;
    $("foot").style.display = "none";
    $("barFill").style.width = "100%"; $("pct").textContent = "100"; $("pageNo").textContent = PAGES;
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (err) {
    toast(err.message || "제출하지 못했습니다. 잠시 뒤 다시 눌러 주세요.");
    btn.disabled = false;
  }
}

$("nextBtn").onclick = () => {
  if (!checkPage()) return;
  if (state.page < PAGES) { state.page++; render(); window.scrollTo({ top: document.querySelector(".card").offsetTop - 20, behavior: "smooth" }); }
  else submit();
};
$("prevBtn").onclick = () => { if (state.page > 1) { state.page--; render(); window.scrollTo({ top: document.querySelector(".card").offsetTop - 20, behavior: "smooth" }); } };
$("saveBtn").onclick = () => saveDraft(false);

render();
