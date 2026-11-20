import { readFile } from "./engine.js";
import { buildPeople, checkRow, RELS, mergeSources } from "./parse.js";
import { buildWorkbook } from "./excel.js";

const $ = s => document.querySelector(s);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const state = { items: [], people: [], running: false, seq: 0 };

const opt = () => ({
  maskRrn: document.querySelector('input[name="rrn"]:checked').value === "mask",
  hanja: $("#hanja").checked,
  birthCol: $("#birthCol").checked,
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
    addFiles(await Promise.all(names.map(async n => new File([await (await fetch("/sample/" + encodeURIComponent(n))).blob()], n, { type: "application/pdf" }))), true);
  } catch { toast("견본 파일을 불러오지 못했어요."); }
});

function addFiles(list, startNow = false) {
  const ok = [...list].filter(f => /\.(pdf|jpe?g|png)$/i.test(f.name));
  if (ok.length < list.length) toast("PDF · JPG · PNG 파일만 읽을 수 있어요.");
  for (const f of ok) state.items.push({ id: ++state.seq, file: f, status: "wait", done: 0, total: 0 });
  renderFiles();
  if (startNow) run();
}
$("#start").addEventListener("click", () => run());

// 한꺼번에 n개까지만 돌리는 줄 세우기
function limiter(n) {
  let active = 0; const q = [];
  const pump = () => { while (active < n && q.length) { active++; const j = q.shift(); j.fn().then(j.ok, j.bad).finally(() => { active--; pump(); }); } };
  return fn => new Promise((ok, bad) => { q.push({ fn, ok, bad }); pump(); });
}
const aiLimit = limiter(4);

async function run() {
  if (state.running) return;
  state.running = true; renderFiles();
  for (;;) {
    const it = state.items.find(i => i.status === "wait");
    if (!it) break;
    const useAi = hc.mode === "on" && hc.hasKey;
    Object.assign(it, { status: "work", t0: performance.now(), aiTotal: 0, aiDone: 0, aiPages: [], aiSkipped: 0, aiError: "" });
    renderFiles();
    const progress = (d, t) => { it.done = d; it.total = t; renderFiles(); };
    // H Chat을 쓰면: 스캔·그림 쪽은 그림이 준비되는 대로 곧바로 H Chat에 보낸다 (이 PC에서는 줄 그림만 만든다)
    const jobs = [];
    let res = await readFile(it.file, progress, useAi ? p => { it.aiTotal++; renderFiles(); jobs.push(aiLimit(() => aiPage(it, p))); } : null);
    if (jobs.length) { it.status = "ai"; renderFiles(); await Promise.all(jobs); }
    if (it.aiError && !res.error) { // H Chat이 안 되면 이 PC의 글자 인식으로 다시 읽는다
      it.status = "work"; it.done = 0; renderFiles();
      res = await readFile(it.file, progress, null);
      $("#hc").open = true; hcMsg("H Chat 판독을 멈추고 이 PC 글자 인식으로 읽었어요: " + it.aiError, "err");
    } else if (jobs.length) {
      res.pages.push(...it.aiPages); res.pages.sort((p, q) => p.page - q.page); res.skipped += it.aiSkipped;
      hcSummary();
    }
    it.aiPages = [];
    it.res = res; it.status = res.error ? "error" : "done"; it.sec = (performance.now() - it.t0) / 1000;
    const people = buildPeople(res.pages);
    for (const p of people) {
      p.id = ++state.seq; p.itemId = it.id;
      const page = res.pages.find(x => x.page === p.page) || {};
      p.pageWarn = page.pageWarn || ""; p.models = page.models || [];
      p.img = p.rows.some(r => !r.crop) ? page.img || "" : ""; // 줄 그림이 없는 묶음은 쪽 그림을 보여 준다
      for (const r of p.rows) { r.id = ++state.seq; r.memo = ""; r.confirmed = false; }
    }
    for (const pg of res.pages) delete pg.img;
    it.count = people.length;
    state.people.push(...people);
    renderFiles(); renderPeople();
  }
  state.running = false; renderFiles();
}

function renderFiles() {
  const ul = $("#files"); ul.textContent = "";
  for (const it of state.items) {
    const li = el("li", "file " + it.status);
    li.append(el("span", "fname", it.file.name));
    let msg = "";
    if (it.status === "wait") msg = state.running ? "차례를 기다리는 중" : "넣었어요 — '읽기 시작'을 누르세요";
    else if (it.status === "work") msg = (it.total ? `읽는 중… ${it.done} / ${it.total}쪽` : "여는 중…") + (it.aiTotal ? ` · H Chat ${it.aiDone} / ${it.aiTotal}쪽` : "");
    else if (it.status === "ai") msg = `H Chat으로 읽는 중… ${it.aiDone || 0} / ${it.aiTotal || 0}쪽`;
    else if (it.status === "error") msg = it.res.error;
    else {
      const pages = it.res.pages, t = pages.filter(p => p.src === "text").length, a = pages.filter(p => p.src === "ai").length, o = pages.length - t - a;
      msg = it.count ? `${it.count}명 찾음` : "가족관계증명서를 찾지 못했어요";
      const how = [t && `글자 그대로 ${t}쪽`, a && `H Chat 판독 ${a}쪽`, o && `스캔 인식 ${o}쪽`, it.res.skipped && `다른 쪽 ${it.res.skipped}쪽 건너뜀`].filter(Boolean).join(" · ");
      if (how) msg += ` (${how})`;
      msg += ` · ${it.sec.toFixed(1)}초`;
      if (!it.count) li.classList.add("none");
    }
    li.append(el("span", "fmsg", msg));
    if (it.status === "work" || it.status === "ai") { const bar = el("span", "fbar"), i = el("i"), d = it.status === "ai" ? it.aiDone || 0 : it.done, tt = it.status === "ai" ? it.aiTotal : it.total; i.style.width = (tt ? Math.round(d / tt * 100) : 5) + "%"; bar.append(i); li.append(bar); li.classList.add("work"); }
    if (it.aiError) { const e = el("span", "ferr", "H Chat 오류로 이 PC 글자 인식으로 읽음: " + it.aiError); li.append(e); }
    if (it.status === "wait" && !state.running) { const x = el("button", "frm", "빼기"); x.type = "button"; x.addEventListener("click", () => { state.items.splice(state.items.indexOf(it), 1); renderFiles(); }); li.querySelector(".fmsg").append(x); }
    ul.append(li);
  }
  const waiting = state.items.filter(i => i.status === "wait").length;
  $("#startRow").classList.toggle("hidden", !waiting && !state.running);
  const btn = $("#start"); btn.disabled = state.running; btn.textContent = state.running ? "읽는 중…" : `읽기 시작 (${waiting}개)`;
  $("#startNote").textContent = state.running ? "" : hc.mode === "on" && hc.hasKey ? "스캔·그림 쪽은 H Chat으로 읽습니다." : "이 PC 안에서만 읽습니다.";
}

// ───────── H Chat으로 읽기 (선택)
const hc = { mode: "off", hasKey: false, tokens: 0, calls: 0, time: {} };
function hcMsg(lines, cls = "") {
  const m = $("#hcMsg"); m.textContent = ""; m.className = "hcmsg " + cls;
  for (const l of [].concat(lines)) { const d = el("div", typeof l === "object" ? (l.ok ? "ok" : "err") : "", typeof l === "object" ? `${l.ok ? "✔" : "✘"} ${l.name} — ${l.detail}` : l); m.append(d); }
}
async function hcApi(pathname, method = "GET", body) {
  const r = await fetch(pathname, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  return r.json();
}
function hcPaint() {
  const on = hc.mode === "on" && hc.hasKey;
  const st = $("#hcState"); st.textContent = on ? "켜짐" : hc.mode === "on" ? "키 필요" : "꺼짐"; st.className = "hcstate " + (on ? "on" : "off");
  $("#bPc").innerHTML = on ? "글자 PDF·검수는 <b>이 PC 안에서</b>" : "<b>이 PC 안에서만</b> 처리";
  $("#bNet").innerHTML = on ? "스캔·캡처 그림 → <b>사내 H Chat 전송</b>" : "인터넷 전송 <b>없음</b>"; $("#bNet").classList.toggle("live", on);
  $("#bAi").innerHTML = on ? "AI 토큰 <b>사용</b>" : "AI 토큰 사용 <b>없음</b>"; $("#bAi").classList.toggle("live", on);
}
const keyHint = () => { $("#hcKey").placeholder = hc.hasKey ? "입력된 키 사용 중 (바꾸려면 새로 붙여 넣기)" : "키를 붙여 넣으세요"; };
async function hcLoad() {
  try {
    const c = await hcApi("/api/hchat");
    $("#hcUrl").value = c.baseUrl; $("#hcModel").value = c.model; $("#hcVerify").value = c.verifyModel || ""; $("#hcSave").checked = !!c.saved;
    const dl = $("#hcModels"); dl.textContent = ""; for (const m of c.models || []) { const o = el("option"); o.value = m; dl.append(o); }
    hc.hasKey = !!c.hasKey; keyHint();
    hc.mode = c.hasKey && localStorage.getItem("fc-hc-mode") === "on" ? "on" : "off"; $("#hcMode").value = hc.mode;
  } catch { /* 설정 주소가 없으면 기능을 끈 채로 둔다 */ }
  hcPaint();
}
async function hcApply() {
  const r = await hcApi("/api/hchat", "POST", { baseUrl: $("#hcUrl").value, model: $("#hcModel").value, verifyModel: $("#hcVerify").value, key: $("#hcKey").value, save: $("#hcSave").checked });
  if (!r.ok) { hcMsg(r.error || "설정을 적용하지 못했어요.", "err"); return false; }
  hc.hasKey = !!r.hasKey; $("#hcKey").value = ""; $("#hcVerify").value = r.verifyModel || ""; keyHint(); hcPaint();
  return true;
}
$("#hcMode").addEventListener("change", () => { hc.mode = $("#hcMode").value; localStorage.setItem("fc-hc-mode", hc.mode); hcPaint(); if (hc.mode === "on" && !hc.hasKey) hcMsg("API 키를 넣고 '연결 테스트'를 눌러 주세요.", "err"); });
$("#hcApply").addEventListener("click", async () => { if (await hcApply()) hcMsg(hc.hasKey ? "설정을 적용했어요." + ($("#hcSave").checked ? " 키는 이 PC의 data 폴더에 저장했어요." : " 키는 프로그램을 끄면 지워져요.") : "키가 비어 있어요.", hc.hasKey ? "ok" : "err"); });
// 연결 테스트: 숫자가 적힌 작은 그림을 만들어 보내고, 모델이 그 숫자를 읽어 오는지 본다
$("#hcTest").addEventListener("click", async () => {
  if (!(await hcApply())) return;
  if (!hc.hasKey) { hcMsg("API 키를 먼저 넣어 주세요.", "err"); return; }
  const code = String(Math.floor(100000 + Math.random() * 899999)), c = document.createElement("canvas"); c.width = 420; c.height = 110;
  const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, 420, 110); x.fillStyle = "#111"; x.font = "bold 44px serif"; x.textBaseline = "middle"; x.fillText("시험 " + code, 30, 56);
  hcMsg("연결 확인 중… (모델에 따라 수십 초 걸릴 수 있어요)");
  const btn = $("#hcTest"); btn.disabled = true;
  try {
    const r = await hcApi("/api/hchat/test", "POST", { image: c.toDataURL("image/png"), expect: code });
    hcMsg(r.steps || [r.error || "테스트에 실패했어요."], r.ok ? "" : "err");
    if (r.ok && hc.mode !== "on") { hc.mode = "on"; $("#hcMode").value = "on"; localStorage.setItem("fc-hc-mode", "on"); hcPaint(); }
  } catch (e) { hcMsg("테스트 요청에 실패했어요: " + (e?.message || e), "err"); }
  btn.disabled = false;
});
// 스캔·그림 한 쪽을 H Chat에 보내 표를 옮겨 적게 하고, 주 모델과 교차 확인 모델의 답을 줄 단위로 대조한다
async function aiPage(it, p) {
  try {
    if (it.aiError) return;
    const r = await hcApi("/api/hchat/page", "POST", { image: p.img });
    if (!r.ok) { it.aiError = r.error || "H Chat 오류"; return; }
    hc.tokens += r.tokens || 0; hc.calls++;
    for (const m of [r.primary, r.verify]) if (m && m.ms) { const t = hc.time[m.model] || (hc.time[m.model] = { n: 0, ms: 0 }); t.n++; t.ms += m.ms; }
    const v = r.verify && !r.verify.error ? r.verify : null, readers = [r.primary, v].filter(x => x && x.cert);
    if (!readers.length) { it.aiSkipped++; return; }
    const rows = mergeSources(readers.map(x => ({ tag: x.model, rows: x.rows })));
    if (p.rows.length === rows.length) rows.forEach((row, i) => { row.crop = p.rows[i].crop; }); // 이 PC가 찾은 줄 수와 같을 때만 줄 그림을 붙인다
    const pageWarn = !r.primary.cert ? `${r.primary.model}은 가족관계증명서가 아니라고 답함` : r.verify?.error ? "교차 확인 모델이 답하지 못함" : v && !v.cert ? `${v.model}은 가족관계증명서가 아니라고 답함` : "";
    it.aiPages.push({ file: p.file, page: p.page, src: "ai", kind: readers[0].kind, rows, models: readers.map(x => x.model), pageWarn, img: rows.some(x => !x.crop) ? p.img : "" });
  } catch (e) { it.aiError = "H Chat 요청에 실패했어요: " + (e?.message || e); }
  finally { it.aiDone++; renderFiles(); }
}
function hcSummary() {
  const per = Object.entries(hc.time).map(([m, t]) => `${m} ${(t.ms / t.n / 1000).toFixed(1)}초`).join(" / ");
  hcMsg(`H Chat으로 누적 ${hc.calls}쪽을 읽었어요.${per ? ` 쪽당 평균: ${per}.` : ""}${hc.tokens ? ` 약 ${hc.tokens.toLocaleString()} 토큰.` : ""}`, "ok");
}
hcLoad();

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
    head.append(el("span", "psrc " + p.src, p.src === "text" ? "글자 그대로 읽음" : p.src === "ai" ? "H Chat 판독" + (p.models?.length ? ` (${p.models.join(" + ")})` : "") : "스캔 글자 인식"));
    if (p.noSelf) head.append(el("span", "pwarn", "본인 줄을 찾지 못했어요"));
    if (p.pageWarn) head.append(el("span", "pwarn", p.pageWarn));
    card.append(head);
    if (p.img) { const d = el("details", "pageimg"); d.open = true; d.append(el("summary", "", "원본 그림 (줄별 그림을 만들지 못해 쪽 전체를 보여 드려요)")); const im = el("img"); im.src = p.img; im.alt = "원본 쪽"; d.append(im); card.append(d); }
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
  const birth = field("생년월일", inp(r.birth, "없음"), "w-birth" + (opt().birthCol ? "" : " hidden")); // 생년월일은 주민번호 대조용 — 칸은 옵션을 켰을 때만 보인다
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
    if (r.readers) meta.append(el("span", "note " + (r.readers.length > 1 ? "ai" : "aiused"), r.readers.length > 1 ? `${r.readers.length}가지 판독 대조` : "H Chat 한 번 판독"));
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
    if (key !== "memo") { r.ocrWarn = []; r.edited = true; }
    if (key === "rrn" && !opt().birthCol) r.birth = ""; // 사람이 주민번호를 직접 고쳤으면, 화면에 없는 출생일 값과의 대조는 그만둔다(검증번호 검사는 계속) // 사람이 손본 줄은 인식 경고를 내리고, 형식 검증만 다시 한다
    refresh(); renderSummary();
    if (key === "name" && r.rel === "본인") row.closest(".person").querySelector(".pname").textContent = r.name;
  });
  bind(rel, "rel", v => v); bind(name, "name"); bind(birth, "birth"); bind(rrn, "rrn"); bind(sex, "sex", v => v); bind(dead, "dead"); bind(memo, "memo");
  del.addEventListener("click", () => { p.rows.splice(p.rows.indexOf(r), 1); if (!p.rows.length) state.people.splice(state.people.indexOf(p), 1); renderPeople(); });
  refresh();
  return row;
}

document.querySelectorAll(".rel, #hanja, #birthCol, input[name='rrn']").forEach(i => i.addEventListener("change", renderPeople));
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
window.__fc = { state, opt, checkRow, hc };
