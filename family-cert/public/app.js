import { readFile } from "./engine.js";
import { buildPeople, checkRow, RELS } from "./parse.js";
import { buildWorkbook } from "./excel.js";

const $ = s => document.querySelector(s);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const state = { items: [], people: [], running: false, seq: 0 };

const opt = () => ({
  mode: document.querySelector('input[name="mode"]:checked').value,
  maskRrn: document.querySelector('input[name="rrn"]:checked').value === "mask",
  hanja: $("#hanja").checked,
  rels: new Set([...document.querySelectorAll(".rel:checked")].map(i => i.value)),
});
const FAMILY = ["부", "모", "양부", "양모", "배우자", "자녀"];
const included = (r, o) => r.rel === "본인" || !FAMILY.includes(r.rel) || o.rels.has(r.rel) || (r.rel === "양부" && o.rels.has("부")) || (r.rel === "양모" && o.rels.has("모"));

function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("on"), 2600); }

// ───────── 파일 넣기
const drop = $("#drop"), pick = $("#pick");
drop.addEventListener("click", () => pick.click());
drop.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick.click(); } });
pick.addEventListener("change", () => { addFiles(pick.files); pick.value = ""; });
["dragenter", "dragover"].forEach(n => drop.addEventListener(n, e => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach(n => drop.addEventListener(n, e => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", e => addFiles(e.dataTransfer.files));
window.addEventListener("dragover", e => e.preventDefault());
window.addEventListener("drop", e => e.preventDefault());

$("#demo").addEventListener("click", async () => {
  try {
    const names = ["견본_글자_1명.pdf", "견본_스캔_3명.pdf"];
    addFiles(await Promise.all(names.map(async n => new File([await (await fetch("/sample/" + encodeURIComponent(n))).blob()], n, { type: "application/pdf" }))));
  } catch { toast("견본 파일을 불러오지 못했어요."); }
});

function addFiles(list) {
  const ok = [...list].filter(f => /\.(pdf|jpe?g|png)$/i.test(f.name));
  if (ok.length < list.length) toast("PDF · JPG · PNG 파일만 읽을 수 있어요.");
  for (const f of ok) state.items.push({ id: ++state.seq, file: f, status: "wait", done: 0, total: 0 });
  renderFiles();
  run();
}

async function run() {
  if (state.running) return;
  state.running = true;
  for (;;) {
    const it = state.items.find(i => i.status === "wait");
    if (!it) break;
    it.status = "work"; it.t0 = performance.now(); renderFiles();
    const res = await readFile(it.file, opt().mode, (d, t) => { it.done = d; it.total = t; renderFiles(); });
    it.res = res; it.status = res.error ? "error" : "done"; it.sec = (performance.now() - it.t0) / 1000;
    const people = buildPeople(res.pages);
    for (const p of people) {
      p.id = ++state.seq; p.itemId = it.id;
      p.pageWarn = (res.pages.find(x => x.page === p.page) || {}).pageWarn || "";
      for (const r of p.rows) { r.id = ++state.seq; r.memo = ""; r.confirmed = false; }
    }
    it.count = people.length;
    state.people.push(...people);
    renderFiles(); renderPeople();
  }
  state.running = false;
}

function renderFiles() {
  const ul = $("#files"); ul.textContent = "";
  for (const it of state.items) {
    const li = el("li", "file " + it.status);
    li.append(el("span", "fname", it.file.name));
    let msg = "";
    if (it.status === "wait") msg = "기다리는 중";
    else if (it.status === "work") msg = it.total ? `읽는 중… ${it.done} / ${it.total}쪽` : "여는 중…";
    else if (it.status === "error") msg = it.res.error;
    else {
      const pages = it.res.pages, t = pages.filter(p => p.src === "text").length, o = pages.length - t;
      msg = it.count ? `${it.count}명 찾음` : "가족관계증명서를 찾지 못했어요";
      const how = [t && `글자 그대로 ${t}쪽`, o && `스캔 인식 ${o}쪽`, it.res.skipped && `다른 쪽 ${it.res.skipped}쪽 건너뜀`].filter(Boolean).join(" · ");
      if (how) msg += ` (${how})`;
      msg += ` · ${it.sec.toFixed(1)}초`;
      if (!it.count) li.classList.add("none");
    }
    li.append(el("span", "fmsg", msg));
    if (it.status === "work") { const bar = el("span", "fbar"), i = el("i"); i.style.width = (it.total ? Math.round(it.done / it.total * 100) : 5) + "%"; bar.append(i); li.append(bar); }
    ul.append(li);
  }
}

// ───────── 검수 화면
function warnCount() {
  const o = opt();
  let n = 0;
  for (const p of state.people) for (const r of p.rows) if (included(r, o) && !r.confirmed && checkRow(r).warn.length) n++;
  return n;
}
function renderSummary() {
  const o = opt(), people = state.people;
  const rows = people.flatMap(p => p.rows.filter(r => included(r, o)));
  const chips = $("#chips"); chips.textContent = "";
  const chip = (label, n, cls) => { const c = el("span", "chip " + (cls || "")); c.append(el("b", "", String(n)), document.createTextNode(" " + label)); chips.append(c); };
  chip("명 (본인)", people.length);
  chip("줄 (가족 포함)", rows.length);
  const w = warnCount();
  chip("줄 확인 필요", w, w ? "red" : "green");
  $("#barNote").textContent = w ? `확인 필요 ${w}줄이 남았어요. 그대로 받으면 비고에 '확인 필요'로 표시됩니다.` : "모든 줄이 검증을 통과했어요.";
  $("#result").classList.toggle("hidden", !people.length);
  $("#bar").classList.toggle("hidden", !people.length);
}

function renderPeople() {
  const o = opt(), only = $("#onlyWarn").checked, box = $("#people");
  box.textContent = "";
  state.people.forEach((p, idx) => {
    const rows = p.rows.filter(r => included(r, o) && (!only || (!r.confirmed && checkRow(r).warn.length)));
    if (!rows.length) return;
    const card = el("article", "person");
    const head = el("header", "phead");
    const self = p.rows.find(r => r.rel === "본인");
    head.append(el("span", "pno", String(idx + 1)), el("b", "pname", self ? self.name : "(본인 줄 없음)"));
    head.append(el("span", "pfile", `${p.file}${p.page > 1 ? ` · ${p.page}쪽` : ""}`));
    head.append(el("span", "psrc " + p.src, p.src === "text" ? "글자 그대로 읽음" : "스캔 글자 인식"));
    if (p.noSelf) head.append(el("span", "pwarn", "본인 줄을 찾지 못했어요"));
    if (p.pageWarn) head.append(el("span", "pwarn", p.pageWarn));
    card.append(head);
    for (const r of rows) card.append(rowView(p, r));
    box.append(card);
  });
  renderSummary();
}

function rowView(p, r) {
  const row = el("div", "row");
  if (r.crop) { const img = el("img", "crop"); img.src = r.crop; img.alt = "원본에서 잘라낸 줄"; row.append(img); }
  const f = el("div", "fields");
  const field = (label, node, cls) => { const l = el("label", "f " + (cls || "")); l.append(el("span", "", label), node); f.append(l); return node; };
  const sel = (vals, v) => { const s = el("select"); for (const x of vals) { const op = el("option", "", x || "—"); op.value = x; s.append(op); } if (!vals.includes(v)) { const op = el("option", "", v); op.value = v; s.append(op); } s.value = v; return s; };
  const inp = (v, ph) => { const i = el("input"); i.value = v || ""; i.placeholder = ph || ""; i.spellcheck = false; i.autocomplete = "off"; return i; };
  const rel = field("구분", sel(["", ...RELS], r.rel || ""), "w-rel");
  const name = field("성명", inp(r.name), "w-name");
  const birth = field("생년월일", inp(r.birth, "없음"), "w-birth");
  const rrn = field("주민등록번호", inp(r.rrn, "없음"), "w-rrn");
  const sex = field("성별", sel(["", "남", "여"], r.sex || ""), "w-sex");
  const dead = el("input"); dead.type = "checkbox"; dead.checked = !!r.dead;
  const dl = el("label", "f chk"); dl.append(dead, el("span", "", "사망")); f.append(dl);
  const memo = field("비고 메모", inp(r.memo, "직접 적을 내용"), "w-memo");
  const del = el("button", "del", "삭제"); del.type = "button"; del.title = "이 줄을 엑셀에서 뺍니다";
  f.append(del);
  row.append(f);

  const meta = el("div", "meta"); row.append(meta);
  const refresh = () => {
    const { notes, warn } = checkRow(r);
    meta.textContent = "";
    for (const n of notes) meta.append(el("span", "note", n));
    if (warn.length) {
      const w = el("span", "warn" + (r.confirmed ? " ok" : ""), (r.confirmed ? "확인함: " : "확인 필요: ") + warn.join(" / "));
      const cb = el("input"); cb.type = "checkbox"; cb.checked = r.confirmed;
      cb.addEventListener("change", () => { r.confirmed = cb.checked; refresh(); renderSummary(); });
      const l = el("label", "confirm"); l.append(cb, el("span", "", "원본과 맞는지 확인했어요"));
      meta.append(w, l);
    } else if (!notes.length) meta.append(el("span", "fine", "검증 통과"));
    row.classList.toggle("bad", warn.length > 0 && !r.confirmed);
    row.classList.toggle("self", r.rel === "본인");
  };
  const bind = (node, key, conv = v => v.trim()) => node.addEventListener(node.tagName === "SELECT" || node.type === "checkbox" ? "change" : "input", () => {
    r[key] = node.type === "checkbox" ? node.checked : conv(node.value);
    if (key !== "memo") { r.ocrWarn = []; r.edited = true; } // 사람이 손본 줄은 인식 경고를 내리고, 형식 검증만 다시 한다
    refresh(); renderSummary();
    if (key === "name" && r.rel === "본인") row.closest(".person").querySelector(".pname").textContent = r.name;
  });
  bind(rel, "rel", v => v); bind(name, "name"); bind(birth, "birth"); bind(rrn, "rrn"); bind(sex, "sex", v => v); bind(dead, "dead"); bind(memo, "memo");
  del.addEventListener("click", () => { p.rows.splice(p.rows.indexOf(r), 1); if (!p.rows.length) state.people.splice(state.people.indexOf(p), 1); renderPeople(); });
  refresh();
  return row;
}

document.querySelectorAll(".rel, #hanja, input[name='rrn']").forEach(i => i.addEventListener("change", renderPeople));
$("#onlyWarn").addEventListener("change", renderPeople);

// ───────── 엑셀 받기
$("#save").addEventListener("click", async () => {
  if (!state.people.length) return;
  if (state.running) { toast("아직 읽는 중인 파일이 있어요. 끝난 뒤에 받아 주세요."); return; }
  const btn = $("#save"); btn.disabled = true;
  try {
    const buf = await buildWorkbook(state.people, opt());
    const d = new Date(), z = n => String(n).padStart(2, "0");
    const name = `가족관계_정리_${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}_${z(d.getHours())}${z(d.getMinutes())}.xlsx`;
    const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const a = el("a"); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast("엑셀 파일을 내려받았어요: " + name);
  } catch (e) { console.error(e); toast("엑셀을 만드는 중 문제가 생겼어요."); }
  btn.disabled = false;
});
$("#reset").addEventListener("click", () => {
  if (state.running) { toast("읽는 중에는 지울 수 없어요."); return; }
  if (!confirm("넣은 파일과 고친 내용을 모두 지우고 처음부터 다시 할까요?")) return;
  state.items = []; state.people = []; renderFiles(); renderPeople();
});

// 검수 자동화(테스트)용
window.__fc = { state, opt, checkRow };
