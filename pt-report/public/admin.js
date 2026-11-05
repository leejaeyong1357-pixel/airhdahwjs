// 환경설정 (관리자) — 문구 · 칸 순서 · 칸 수 · 파일 올리기 · 머리글 사진 · 비밀번호
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
let S = null;          // 편집 중인 설정
let dirty = false;

function toast(msg) {
  const t = $("toast");
  t.textContent = msg; t.classList.add("on");
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("on"), 2400);
}
async function api(path, opt = {}) {
  const r = await fetch(path, { headers: { "Content-Type": "application/json" }, ...opt, body: opt.body && typeof opt.body !== "string" ? JSON.stringify(opt.body) : opt.body });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== "/api/login") { showLogin(); throw new Error("로그인이 필요합니다."); }
  if (!r.ok) throw new Error(j.error ?? "실패했습니다.");
  return j;
}
function setDirty(v = true) { dirty = v; $("saveBtn")?.classList.toggle("dirty", v); if ($("saveBtn")) $("saveBtn").textContent = v ? "저장 (바뀐 내용 있음)" : "저장됨"; }
window.addEventListener("beforeunload", (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

// ── 로그인 ──
function showLogin() {
  $("root").innerHTML = `
  <form class="login" id="loginForm">
    <h1>환경설정 (관리자)</h1>
    <p>처음 비밀번호는 서버 PC 의 <b>pt-report/data/admin-password.txt</b> 파일과, 서버를 켤 때 창에 나옵니다. 들어온 뒤 꼭 바꾸세요.</p>
    <input id="pw" type="password" placeholder="비밀번호" autocomplete="current-password" autofocus>
    <div class="err" id="err"></div>
    <button type="submit">들어가기</button>
    <a href="./" style="text-align:center;color:#5b6475;font-size:14px">← 보는 화면으로</a>
  </form>`;
  $("loginForm").onsubmit = async (e) => {
    e.preventDefault();
    try { await api("/api/login", { method: "POST", body: { password: $("pw").value } }); load(); }
    catch (err) { $("err").textContent = err.message; }
  };
}

// ── 화면 ──
const F = (key, label, opt = {}) => opt.area
  ? `<label class="fld ${opt.full ? "full" : ""}">${label}<textarea data-k="${key}">${esc(S[key])}</textarea></label>`
  : `<label class="fld ${opt.full ? "full" : ""}">${label}<input data-k="${key}" value="${esc(S[key])}"></label>`;

function render() {
  $("root").innerHTML = `
  <div class="ad-top">
    <h1>⚙ 환경설정 — 현장밀착점검 보고서</h1>
    <a href="./" target="_blank">보는 화면 열기 ↗</a>
    <button id="logoutBtn" type="button">로그아웃</button>
    <button id="saveBtn" class="save" type="button">저장됨</button>
  </div>
  <div class="ad-wrap">
    <section class="panel">
      <h2>머리글</h2><p class="d">맨 위 파란 띠의 글자와 오른쪽 그림입니다.</p>
      <div class="fields">
        ${F("brand", "왼쪽 부서명")}${F("tab", "브라우저 탭 제목")}
        ${F("title", "큰 제목")}${F("subtitle", "작은 제목")}
        ${F("helmet", "그림 속 안전모 글자")}${F("clipboard", "그림 속 점검표 글자")}
        <div class="fld full">오른쪽 그림을 사진으로 바꾸기 <span style="font-weight:400;color:#5b6475">(png · jpg · webp, 가로로 긴 사진 권장)</span>
          <div class="lst"><div class="row">
            <span id="heroName" style="flex:1;font-weight:400">${S.heroImage ? "올린 사진 사용 중" : "기본 그림 사용 중 (공장 · 안전모 · 점검표)"}</span>
            <label class="sm blue">사진 올리기<input type="file" id="heroFile" accept="image/png,image/jpeg,image/webp" hidden></label>
            <button class="sm red" id="heroDel" type="button" ${S.heroImage ? "" : "disabled"}>기본 그림으로</button>
          </div><div class="prog" id="heroProg"><i></i></div></div>
        </div>
      </div>
    </section>

    <section class="panel">
      <h2>인사말</h2><p class="d">파란 글씨(이름)는 가운데 칸입니다. 본문은 줄을 바꾸면 화면에서도 줄이 바뀝니다.</p>
      <div class="fields">
        ${F("greetPre", "인사 앞부분")}${F("greetName", "강조(파란 글씨)")}
        ${F("greetPost", "인사 뒷부분")}<div></div>
        ${F("notice", "안내 본문", { area: true, full: true })}
      </div>
    </section>

    <section class="panel">
      <h2>자료 칸 (월별 파일)</h2><p class="d">칸 순서는 ▲▼ 또는 번호를 끌어서 바꿉니다. 파일은 [파일 올리기]를 누르거나 칸 위로 끌어다 놓으면 바로 올라갑니다 (큰 파일도 됨).</p>
      <div class="fields">
        ${F("sectionTitle", "제목")}${F("sectionHint", "오른쪽 안내 문구")}
        ${F("downloadLabel", "버튼 글자")}${F("emptyLabel", "파일 없을 때 버튼 글자")}
        <label class="fld">한 줄에 칸 수<select id="columns">${[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `<option ${S.columns === n ? "selected" : ""}>${n}</option>`).join("")}</select></label>
        <label class="fld" style="flex-direction:row;align-items:center;gap:8px;font-weight:600"><input type="checkbox" id="useName" style="width:18px;height:18px"> 파일을 올리면 칸 글자를 올린 파일 이름으로 바꾸기</label>
      </div>
      <div class="cards-ad" id="cards" style="margin-top:14px"></div>
      <div style="display:flex;gap:8px;margin-top:10px"><button class="sm" id="addCard" type="button">+ 칸 추가</button></div>
    </section>

    <section class="panel">
      <h2>아래 안내</h2><p class="d">맨 아래 회색 상자입니다. 줄 순서 · 추가 · 삭제가 됩니다.</p>
      <div class="fields">${F("infoTitle", "왼쪽 제목")}<div></div></div>
      <div class="lst" id="info" style="margin-top:12px"></div>
      <div style="margin-top:8px"><button class="sm" id="addInfo" type="button">+ 줄 추가</button></div>
    </section>

    <section class="panel">
      <h2>미리보기</h2><p class="d">저장하면 바로 바뀝니다.</p>
      <iframe class="preview" id="preview" src="./"></iframe>
    </section>

    <section class="panel">
      <h2>관리자 비밀번호 바꾸기</h2>
      <div class="fields">
        <label class="fld">지금 비밀번호<input type="password" id="pwCur" autocomplete="current-password"></label>
        <label class="fld">새 비밀번호 (4자 이상)<input type="password" id="pwNew" autocomplete="new-password"></label>
      </div>
      <div style="margin-top:10px;display:flex;gap:8px"><button class="sm blue" id="pwBtn" type="button">비밀번호 바꾸기</button>
      <button class="sm red" id="resetBtn" type="button" style="margin-left:auto">문구를 처음 상태로 되돌리기</button></div>
    </section>
  </div>`;
  renderCards();
  renderInfo();
  bind();
}

function renderCards() {
  const fmt = (iso) => new Date(iso).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" });
  $("cards").innerHTML = S.cards.map((c, i) => `
    <div class="crow drop" data-i="${i}" draggable="true">
      <div class="no" title="끌어서 순서 바꾸기">${i + 1}</div>
      <input data-c="${i}" data-f="title" value="${esc(c.title)}" placeholder="제목 (예: 1월)">
      <input data-c="${i}" data-f="label" value="${esc(c.label)}" placeholder="칸에 보일 파일 이름">
      <div class="file">
        ${c.file ? `<b>${esc(c.file.name)}</b><span>${esc(c.file.sizeText)} · ${fmt(c.file.at)} · 다운로드 ${c.downloads ?? 0}회</span>` : `<span>올린 파일 없음 — 보는 화면에 “${esc(S.emptyLabel)}”</span>`}
        <div class="prog" id="prog-${i}"><i></i></div>
        <div class="acts">
          <label class="sm blue">${c.file ? "파일 바꾸기" : "파일 올리기"}<input type="file" data-up="${i}" hidden></label>
          ${c.file ? `<button class="sm red" data-rmfile="${i}" type="button">파일 지우기</button>` : ""}
        </div>
      </div>
      <div class="moves">
        <button class="sm" data-mv="${i}" data-d="-1" type="button" ${i === 0 ? "disabled" : ""} title="위로">▲</button>
        <button class="sm" data-mv="${i}" data-d="1" type="button" ${i === S.cards.length - 1 ? "disabled" : ""} title="아래로">▼</button>
        <button class="sm red" data-del="${i}" type="button" title="칸 삭제">✕</button>
      </div>
    </div>`).join("");
}
function renderInfo() {
  $("info").innerHTML = S.info.map((t, i) => `
    <div class="row"><input data-info="${i}" value="${esc(t)}">
      <button class="sm" data-imv="${i}" data-d="-1" type="button" ${i === 0 ? "disabled" : ""}>▲</button>
      <button class="sm" data-imv="${i}" data-d="1" type="button" ${i === S.info.length - 1 ? "disabled" : ""}>▼</button>
      <button class="sm red" data-idel="${i}" type="button">✕</button></div>`).join("");
}

function bind() {
  const root = $("root");
  root.oninput = (e) => {
    const t = e.target;
    if (t.dataset.k) { S[t.dataset.k] = t.value; setDirty(); }
    else if (t.dataset.c != null) { S.cards[t.dataset.c][t.dataset.f] = t.value; setDirty(); }
    else if (t.dataset.info != null) { S.info[t.dataset.info] = t.value; setDirty(); }
  };
  $("columns").onchange = (e) => { S.columns = Number(e.target.value); setDirty(); };
  $("saveBtn").onclick = () => save();
  $("logoutBtn").onclick = async () => { if (dirty && !confirm("저장하지 않은 내용이 있습니다. 그래도 나갈까요?")) return; dirty = false; await api("/api/logout", { method: "POST" }); showLogin(); };
  $("addCard").onclick = () => { S.cards.push({ id: `new-${Date.now()}`, title: `${S.cards.length + 1}월`, label: "일일현장안전점검.pptx", file: null }); renderCards(); setDirty(); };
  $("addInfo").onclick = () => { S.info.push(""); renderInfo(); setDirty(); $("info").querySelector("input:last-of-type")?.focus(); };
  $("cards").onclick = async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.mv != null) { const i = +b.dataset.mv, j = i + +b.dataset.d; [S.cards[i], S.cards[j]] = [S.cards[j], S.cards[i]]; renderCards(); setDirty(); }
    if (b.dataset.del != null) {
      const c = S.cards[+b.dataset.del];
      if (!confirm(`‘${c.title}’ 칸을 지울까요?${c.file ? " 올린 파일도 저장할 때 같이 지워집니다." : ""}`)) return;
      S.cards.splice(+b.dataset.del, 1); renderCards(); setDirty();
    }
    if (b.dataset.rmfile != null) {
      const c = S.cards[+b.dataset.rmfile];
      if (!confirm(`‘${c.title}’ 에 올린 파일을 지울까요?`)) return;
      try { if (dirty) await save(true); const r = await api(`/api/admin/file/${c.id}`, { method: "DELETE" }); S = r; renderCards(); reloadPreview(); toast("파일을 지웠습니다."); } catch (err) { toast(err.message); }
    }
  };
  $("cards").onchange = (e) => { if (e.target.dataset.up != null && e.target.files[0]) upload(+e.target.dataset.up, e.target.files[0]); };
  // 끌어서 순서 바꾸기 · 파일 끌어다 놓기
  let dragFrom = null;
  $("cards").ondragstart = (e) => { const r = e.target.closest(".crow"); if (r) { dragFrom = +r.dataset.i; e.dataTransfer.effectAllowed = "move"; } };
  $("cards").ondragover = (e) => { const r = e.target.closest(".crow"); if (!r) return; e.preventDefault(); for (const x of document.querySelectorAll(".crow.drag-over, .crow.over")) x.classList.remove("drag-over", "over"); r.classList.add(e.dataTransfer.types.includes("Files") ? "over" : "drag-over"); };
  $("cards").ondragleave = (e) => { const r = e.target.closest(".crow"); r?.classList.remove("drag-over", "over"); };
  $("cards").ondrop = (e) => {
    const r = e.target.closest(".crow"); if (!r) return;
    e.preventDefault(); r.classList.remove("drag-over", "over");
    const to = +r.dataset.i;
    if (e.dataTransfer.files.length) { upload(to, e.dataTransfer.files[0]); return; }
    if (dragFrom == null || dragFrom === to) return;
    const [m] = S.cards.splice(dragFrom, 1); S.cards.splice(to, 0, m); dragFrom = null; renderCards(); setDirty();
  };
  $("info").onclick = (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.imv != null) { const i = +b.dataset.imv, j = i + +b.dataset.d; [S.info[i], S.info[j]] = [S.info[j], S.info[i]]; }
    if (b.dataset.idel != null) S.info.splice(+b.dataset.idel, 1);
    renderInfo(); setDirty();
  };
  $("heroFile").onchange = (e) => { const f = e.target.files[0]; if (f) sendFile("/api/admin/hero", f, "heroProg"); };
  $("heroDel").onclick = async () => { try { if (dirty) await save(true); S = await api("/api/admin/hero", { method: "DELETE" }); render(); reloadPreview(); toast("기본 그림으로 돌렸습니다."); } catch (err) { toast(err.message); } };
  $("pwBtn").onclick = async () => {
    try { await api("/api/admin/password", { method: "POST", body: { current: $("pwCur").value, next: $("pwNew").value } }); $("pwCur").value = $("pwNew").value = ""; toast("비밀번호를 바꿨습니다."); }
    catch (err) { toast(err.message); }
  };
  $("resetBtn").onclick = async () => {
    if (!confirm("모든 문구를 처음 상태로 되돌릴까요? (칸 · 파일은 그대로)")) return;
    try { S = await api("/api/admin/reset-texts", { method: "POST" }); setDirty(false); render(); reloadPreview(); toast("문구를 되돌렸습니다."); } catch (err) { toast(err.message); }
  };
}

function reloadPreview() { const f = $("preview"); if (f) f.src = `./?t=${Date.now()}`; }

async function save(quiet = false) {
  try {
    const body = { ...S, cards: S.cards.map((c) => ({ id: c.id, title: c.title, label: c.label })) };
    S = await api("/api/admin/site", { method: "POST", body });
    setDirty(false);
    renderCards();
    reloadPreview();
    if (!quiet) toast("저장했습니다. 보는 화면에 바로 반영됩니다.");
  } catch (err) { toast(err.message); throw err; }
}

/** 파일 올리기 — 진행 막대 표시 (큰 파일도 그대로 흘려 보냄) */
async function upload(i, file) {
  if (dirty || String(S.cards[i].id).startsWith("new-")) { try { await save(true); } catch { return; } }
  const c = S.cards[i];
  sendFile(`/api/admin/upload/${c.id}${$("useName").checked ? "?label=1" : ""}`, file, `prog-${i}`, `‘${c.title}’ 에 ${file.name} 을(를) 올렸습니다.`);
}
function sendFile(url, file, progId, okMsg = "올렸습니다.") {
  const prog = $(progId);
  prog?.classList.add("on");
  const xhr = new XMLHttpRequest();
  xhr.open("PUT", url);
  xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
  xhr.upload.onprogress = (e) => { if (e.lengthComputable && prog) prog.firstElementChild.style.width = `${(e.loaded / e.total) * 100}%`; };
  xhr.onload = () => {
    let j = {};
    try { j = JSON.parse(xhr.responseText); } catch { /* */ }
    if (xhr.status === 401) return showLogin();
    if (xhr.status !== 200) { prog?.classList.remove("on"); return toast(j.error ?? "올리지 못했습니다."); }
    S = j; render(); reloadPreview(); toast(okMsg);
  };
  xhr.onerror = () => { prog?.classList.remove("on"); toast("올리는 중 연결이 끊겼습니다. 다시 시도하세요."); };
  xhr.send(file);
  toast(`${file.name} 올리는 중... (${(file.size / 1048576).toFixed(1)}MB)`);
}

async function load() {
  try { S = await api("/api/admin/site"); setDirty(false); render(); } catch { /* 로그인 화면 */ }
}
load();
