// 설문 화면 — Section 1 업무 수행 역량 변화 · Section 2 AI 활용 역량 및 업무 효과 (한 쪽)
import { SECTIONS } from "./questions.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const ITEMS = SECTIONS.flatMap((s) => s.items);
const scores = {};

const ICONS = {
  doc: '<svg viewBox="0 0 24 24" class="ico"><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/><path d="M9 12h7M9 15.5h7M9 19h4"/></svg>',
  ai: '<svg viewBox="0 0 24 24" class="ico"><rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/><text x="12" y="14.6" text-anchor="middle" font-size="6.4" font-weight="800" fill="currentColor" stroke="none" font-family="Arial,sans-serif">AI</text></svg>',
};

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("on");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove("on"), 2200);
}

function sectionHtml(s) {
  const rows = s.items.map((it, i) => {
    const opts = [1, 2, 3, 4, 5].map((n) => `
      <label class="opt"><input type="radio" name="${it.id}" value="${n}" aria-label="${n}점 — ${esc(it.a[n - 1])}"><i class="dot"></i><span>${n}</span></label>`).join("");
    return `
    <div class="q" id="q-${it.id}">
      <div class="num">${i + 1}</div>
      <div class="qt">${esc(it.q)}<span class="pick" id="pick-${it.id}"></span></div>
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

function progress() {
  const n = Object.keys(scores).length;
  $("done").textContent = n;
  $("total").textContent = ITEMS.length;
  const pct = Math.round((n / ITEMS.length) * 100);
  $("pct").textContent = pct;
  $("barFill").style.width = `${pct}%`;
}

$("pages").innerHTML = SECTIONS.map(sectionHtml).join("");
for (const input of document.querySelectorAll(".opt input")) {
  input.onchange = () => {
    const id = input.name, n = Number(input.value);
    scores[id] = n;
    const it = ITEMS.find((x) => x.id === id);
    $(`pick-${id}`).textContent = `${n}점 · ${it.a[n - 1]}`;
    $(`q-${id}`).classList.remove("missing");
    progress();
  };
}
progress();

$("nextBtn").onclick = async () => {
  const miss = ITEMS.filter((it) => !scores[it.id]);
  if (miss.length) {
    for (const it of miss) $(`q-${it.id}`).classList.add("missing");
    $(`q-${miss[0].id}`).scrollIntoView({ behavior: "smooth", block: "center" });
    toast(`아직 답하지 않은 문항이 ${miss.length}개 있습니다.`);
    return;
  }
  const btn = $("nextBtn");
  btn.disabled = true;
  try {
    const r = await fetch("api/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scores }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error ?? "제출하지 못했습니다.");
    $("pages").innerHTML = `<div class="done"><div class="ok"><svg viewBox="0 0 24 24" class="ico"><path d="M5 12l5 5L20 7"/></svg></div><h2>응답해 주셔서 감사합니다</h2><p>소중한 의견은 27년도 교육 운영에 반영하겠습니다.</p></div>`;
    $("foot").style.display = "none";
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (err) {
    toast(err.message || "제출하지 못했습니다. 잠시 뒤 다시 눌러 주세요.");
    btn.disabled = false;
  }
};
