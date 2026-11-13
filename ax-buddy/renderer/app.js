// AX 버디 화면 — 캐릭터 · 말풍선 · 대화 · 일정 · 설정 · 파일 먹기
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const B = window.buddy;
const char = $("charBox");
let S = null;               // 설정 (키 자체는 화면으로 오지 않는다)
let busy = false;           // 파일을 먹고 있는 중
let history = [];           // H Chat 에 같이 보내는 최근 대화
let moodTimer = 0, idleTimer = 0, bubbleTimer = 0;

// ── 캐릭터 표정 ──
function mood(m, backMs = 0) {
  clearTimeout(moodTimer);
  char.dataset.mood = m;
  if (backMs) moodTimer = setTimeout(() => { char.dataset.mood = "idle"; }, backMs);
  wake();
}
function wake() {
  clearTimeout(idleTimer);
  if (char.dataset.mood === "sleep") char.dataset.mood = "idle";
  idleTimer = setTimeout(() => { if (char.dataset.mood === "idle" && !busy) char.dataset.mood = "sleep"; }, 5 * 60_000); // 5분 조용하면 졸기
}

// ── 말풍선 ──
function say(text, { buttons = [], alarm = false, keep = false, moodNow = "talk" } = {}) {
  clearTimeout(bubbleTimer);
  $("bubble").classList.remove("hidden");
  $("bubble").classList.toggle("alarm", alarm);
  $("bubbleText").textContent = text;
  $("bar").classList.add("hidden");
  const box = $("bubbleBtns");
  box.innerHTML = "";
  for (const b of buttons) {
    const el = document.createElement("button");
    el.className = `btn ${b.primary ? "primary" : ""}`;
    el.innerHTML = esc(b.label) + (b.sub ? `<small>${esc(b.sub)}</small>` : "");
    el.disabled = !!b.disabled;
    el.onclick = b.onClick;
    box.append(el);
  }
  if (moodNow) mood(moodNow, moodNow === "talk" ? 1800 : 0);
  if (!keep && !buttons.length) bubbleTimer = setTimeout(hideBubble, Math.max(5000, text.length * 120));
  syncShape();
}
function hideBubble() { clearTimeout(bubbleTimer); $("bubble").classList.add("hidden"); syncShape(); }
$("bubbleX").onclick = () => { hideBubble(); if (!busy) mood("idle"); };
function progress(pct) {
  $("bar").classList.remove("hidden");
  $("barFill").style.width = `${pct}%`;
  $("barPct").textContent = `${Math.round(pct)}%`;
}

// ── 창 모양: 보이는 부분만 마우스가 닿게 ──
let shapeQueued = false;
function syncShape() {
  if (shapeQueued) return;
  shapeQueued = true;
  requestAnimationFrame(() => {
    shapeQueued = false;
    const rects = [...document.querySelectorAll(".solid:not(.hidden)")].map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left - 6, y: r.top - 6, width: r.width + 12, height: r.height + 18 };
    });
    B.shape(rects);
  });
}
new MutationObserver(syncShape).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });

// ── 캐릭터: 끌면 이동, 누르면 대화창 ──
let drag = null;
char.addEventListener("mousedown", (e) => { if (e.button === 0) drag = { x: e.screenX, y: e.screenY, moved: false }; });
window.addEventListener("mousemove", (e) => {
  wake();
  if (!drag) return;
  const dx = e.screenX - drag.x, dy = e.screenY - drag.y;
  if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 5) return;
  drag.moved = true;
  B.move(dx, dy);
  drag.x = e.screenX; drag.y = e.screenY;
});
window.addEventListener("mouseup", () => {
  if (drag && !drag.moved && !busy) togglePanel();
  drag = null;
});

// ── 대화 · 일정 · 설정 창 ──
function openPanel(tab = "chat") {
  hideBubble();
  $("panel").classList.remove("hidden");
  for (const b of document.querySelectorAll(".tabs button")) b.classList.toggle("on", b.dataset.tab === tab);
  for (const t of ["chat", "schedule", "settings"]) $(`tab-${t}`).classList.toggle("hidden", t !== tab);
  if (tab === "chat") setTimeout(() => $("chatIn").focus(), 30);
  if (tab === "schedule") drawEvents();
  if (tab === "settings") drawSettings();
  syncShape();
}
function closePanel() { $("panel").classList.add("hidden"); syncShape(); }
function togglePanel() { $("panel").classList.contains("hidden") ? openPanel("chat") : closePanel(); }
$("panelX").onclick = closePanel;
document.querySelector(".tabs").onclick = (e) => { const b = e.target.closest("button"); if (b) openPanel(b.dataset.tab); };
$("tools").onclick = (e) => { const b = e.target.closest("button"); if (b?.dataset.open) openPanel(b.dataset.open); };
$("hideBtn").onclick = () => B.hide();

function addMsg(who, text, extra) {
  const el = document.createElement("div");
  el.className = `msg ${who}`;
  el.textContent = text;
  if (extra) el.append(extra);
  $("msgs").append(el);
  $("msgs").scrollTop = $("msgs").scrollHeight;
  return el;
}
$("chatForm").onsubmit = async (e) => {
  e.preventDefault();
  const text = $("chatIn").value.trim();
  if (!text) return;
  $("chatIn").value = "";
  addMsg("me", text);
  const wait = addMsg("bot", "…");
  mood("work");
  const r = await B.send({ text, history });
  wait.remove();
  if (r.type === "list") { addMsg("bot", r.events.length ? `등록된 일정이에요:\n${r.events.map((ev) => `• ${ev.when} ${ev.title}`).join("\n")}` : "등록된 일정이 없어요."); mood("talk", 1500); return; }
  let undo = null;
  if (r.type === "event") {
    undo = document.createElement("button");
    undo.className = "undo"; undo.textContent = "잘못 들었어요 — 이 일정 취소";
    undo.onclick = async () => { await B.removeEvent(r.event.id); undo.remove(); addMsg("bot", "취소했어요. 다시 말해 주세요!"); };
  } else history.push({ role: "user", content: text }, { role: "assistant", content: r.text });
  history = history.slice(-12);
  addMsg("bot", r.text, undo);
  mood(r.mood ?? "talk", 2000);
};

async function drawEvents() {
  const list = await B.listEvents();
  $("evList").innerHTML = list.length ? list.map((ev) => `<div class="ev"><div><small>${esc(ev.when)}</small><b>${esc(ev.title)}</b></div><button data-id="${esc(ev.id)}">지우기</button></div>`).join("") : '<div class="none">등록된 일정이 없어요.</div>';
}
$("evList").onclick = async (e) => { const b = e.target.closest("button[data-id]"); if (b) { await B.removeEvent(b.dataset.id); drawEvents(); } };

// ── 설정 (H Chat 연결 · 자동 시작) ──
const ENVS = [["운영", "https://internal-apigw-kr.hmg-corp.io/hchat-in/api"], ["검증", "https://stg-internal-apigw-kr.hmg-corp.io/hchat-in/api"], ["개발", "https://dev-internal-apigw-kr.hmg-corp.io/hchat-in/api"]];
function apiFields() {
  return `
    <label class="f"><span>API 키 ${S.hasKey ? "(저장됨 — 바꿀 때만 입력)" : ""}</span><input id="fKey" type="password" placeholder="${S.hasKey ? "••••••••" : "H Chat API 키"}" autocomplete="off"></label>
    <label class="f"><span>환경 (Base URL)</span><select id="fEnv">${ENVS.map(([n, u]) => `<option value="${u}" ${S.baseUrl === u ? "selected" : ""}>${n} — ${u.replace("https://", "")}</option>`).join("")}<option value="" ${ENVS.some(([, u]) => u === S.baseUrl) ? "" : "selected"}>직접 입력</option></select></label>
    <label class="f ${ENVS.some(([, u]) => u === S.baseUrl) ? "hidden" : ""}" id="fUrlRow"><span>Base URL</span><input id="fUrl" value="${esc(S.baseUrl)}"></label>
    <div class="row"><label class="f" style="flex:1"><span>모델 이름</span><input id="fModel" value="${esc(S.model)}"></label>
    <label class="f" style="flex:1"><span>호출 형식</span><select id="fFormat"><option value="azure" ${S.format === "azure" ? "selected" : ""}>Azure OpenAI 형식</option><option value="openai" ${S.format === "openai" ? "selected" : ""}>OpenAI 형식</option></select></label></div>
    <label class="f"><span>호출 경로 (비워 두면 형식 기본값 · {model} 사용 가능)</span><input id="fPath" value="${esc(S.path ?? "")}" placeholder="/openai/deployments/{model}/chat/completions?api-version=…"></label>
    <div class="row"><button class="btn" id="fTest" type="button">연결 시험</button><span id="fTestOut" class="note"></span></div>`;
}
function readApiFields() {
  const env = $("fEnv").value;
  return { apiKey: $("fKey").value, baseUrl: env || $("fUrl").value, model: $("fModel").value, format: $("fFormat").value, path: $("fPath").value };
}
function bindApiFields() {
  $("fEnv").onchange = () => $("fUrlRow").classList.toggle("hidden", !!$("fEnv").value);
  $("fTest").onclick = async () => {
    $("fTestOut").className = "note"; $("fTestOut").textContent = "시험 중…";
    S = await B.saveSettings(readApiFields());
    const r = await B.testHchat();
    $("fTestOut").className = r.ok ? "ok" : "bad";
    $("fTestOut").textContent = r.ok ? `연결됐어요! “${r.text}”` : r.error;
  };
}
function drawSettings() {
  $("tab-settings").innerHTML = `${apiFields()}
    <label class="chk"><input type="checkbox" id="fAuto" ${S.autoStart ? "checked" : ""}> PC 를 켜면 자동으로 시작 (일정 알림을 놓치지 않게)</label>
    <p class="note">API 키는 이 PC 의 윈도우 계정으로 암호화해 저장하고, H Chat 서버 말고는 어디에도 보내지 않아요.</p>
    <div class="row"><button class="btn primary" id="fSave" type="button">저장</button><button class="btn" id="fQuit" type="button">AX 버디 끝내기</button></div>`;
  bindApiFields();
  $("fSave").onclick = async () => { S = await B.saveSettings({ ...readApiFields(), autoStart: $("fAuto").checked }); closePanel(); say("설정을 저장했어요!", { moodNow: "happy" }); setTimeout(() => mood("idle"), 1800); };
  $("fQuit").onclick = () => B.quit();
}

// ── 처음 실행: ① API 키 ② 캐릭터 ──
function setupStep1() {
  $("setup").classList.remove("hidden");
  $("setup").innerHTML = `
    <div class="step">1 / 2 · H CHAT 연결</div>
    <h1>안녕하세요, AX 버디예요!</h1>
    <p>회사 H Chat API 키를 넣으면 대화할 수 있어요. 일정 알림과 파일 변환은 키 없이도 돼요.</p>
    ${apiFields()}
    <div class="grow"></div>
    <div class="row"><button class="btn" id="sSkip" type="button">나중에 넣을게요</button><span style="flex:1"></span><button class="btn primary" id="sNext" type="button">다음</button></div>`;
  bindApiFields();
  $("sNext").onclick = async () => { S = await B.saveSettings(readApiFields()); setupStep2(); };
  $("sSkip").onclick = () => setupStep2();
  syncShape();
}
function setupStep2() {
  const photoUrl = S.photo ? `file:///${S.photo.replace(/\\/g, "/").replace(/^\/+/, "")}?t=${Date.now()}` : "";
  $("setup").innerHTML = `
    <div class="step">2 / 2 · 캐릭터</div>
    <h1>어떤 모습으로 지낼까요?</h1>
    <p>기본 AI 봇으로 시작하거나, 본인 사진을 등록할 수 있어요.</p>
    <div class="pick">
      <button id="pBot" class="${S.photo ? "" : "on"}" type="button"><div class="thumb">🤖</div>기본 AI 봇<small>바로 사용</small></button>
      <button id="pPhoto" class="${S.photo ? "on" : ""}" type="button"><div class="thumb" style="${photoUrl ? `background-image:url('${photoUrl}')` : ""}">${photoUrl ? "" : "📷"}</div>내 사진으로<small>${S.photo ? "사진 등록됨 · 눌러서 바꾸기" : "사진 고르기"}</small></button>
    </div>
    <p class="note">사진을 애니메이션풍 캐릭터로 바꾸는 기능은 H Chat 의 그림 생성 기능을 확인한 뒤 연결돼요. 그때까지는 사진을 등록해도 기본 AI 봇으로 보여요.</p>
    <div class="grow"></div>
    <div class="row"><button class="btn" id="sBack" type="button">이전</button><span style="flex:1"></span><button class="btn primary" id="sDone" type="button">시작하기</button></div>`;
  $("pBot").onclick = async () => { S = await B.clearPhoto(); setupStep2(); };
  $("pPhoto").onclick = async () => { S = await B.pickPhoto(); setupStep2(); };
  $("sBack").onclick = setupStep1;
  $("sDone").onclick = async () => {
    S = await B.saveSettings({ setupDone: true });
    $("setup").classList.add("hidden");
    say("반가워요! 저를 누르면 대화할 수 있어요.\n“오늘 3시에 회의”처럼 말하면 10분 전에 알려드리고,\n파일을 끌어다 주면 먹고 바꿔 드려요.", { keep: true, moodNow: "happy", buttons: [{ label: "알겠어요", primary: true, onClick: () => { hideBubble(); mood("idle"); } }] });
  };
  syncShape();
}

// ── 파일 먹기: 입 벌리기 → 먹기 → 씹기 → 고르기 → 변환(진행 막대) → 뱉기 → 저장 ──
const mouth = () => { const r = char.getBoundingClientRect(); return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.42 }; };
function chip(label, from, to, { shrink }) {
  const el = document.createElement("div");
  el.className = "chip";
  el.textContent = label.toUpperCase().slice(0, 4);
  document.body.append(el);
  const k = [{ transform: `translate(${from.x - 27}px, ${from.y - 33}px) scale(${shrink ? 1 : 0.15}) rotate(${shrink ? -8 : 0}deg)`, opacity: 1 }, { transform: `translate(${to.x - 27}px, ${to.y - 33}px) scale(${shrink ? 0.15 : 1}) rotate(${shrink ? 20 : -6}deg)`, opacity: shrink ? 0.4 : 1 }];
  return el.animate(k, { duration: 480, easing: shrink ? "ease-in" : "cubic-bezier(.2,1.4,.5,1)", fill: "forwards" }).finished.then(() => el);
}
let outChip = null;
let dragDepth = 0;
window.addEventListener("dragenter", (e) => { e.preventDefault(); if (busy || !$("setup").classList.contains("hidden")) return; if (dragDepth++ === 0) { closePanel(); say("아~ 여기에 주세요!", { keep: true, moodNow: "open" }); } });
window.addEventListener("dragover", (e) => { e.preventDefault(); e.dataTransfer.dropEffect = busy ? "none" : "copy"; });
window.addEventListener("dragleave", () => { if (busy) return; if (--dragDepth <= 0) { dragDepth = 0; hideBubble(); mood("idle"); } });
window.addEventListener("drop", async (e) => {
  e.preventDefault();
  dragDepth = 0;
  if (busy || !$("setup").classList.contains("hidden")) return;
  const f = e.dataTransfer.files[0];
  if (!f) { hideBubble(); mood("idle"); return; }
  const more = e.dataTransfer.files.length - 1;
  eat(B.pathOf(f), f.name, { x: e.clientX, y: e.clientY }, more);
});

async function eat(path, name, from, more = 0) {
  busy = true;
  hideBubble();
  const ext = (/\.([a-z0-9]+)$/i.exec(name)?.[1] ?? "파일").toLowerCase();
  mood("open");
  (await chip(ext, from, mouth(), { shrink: true })).remove();
  mood("chew");
  const [info] = await Promise.all([B.inspect(path), sleep(1300)]);
  const done = (text, m = "worry") => { busy = false; say(text, { moodNow: m, keep: true, buttons: [{ label: "알겠어요", onClick: () => { hideBubble(); mood("idle"); } }] }); };
  if (info.error) return done(info.error);
  if (info.locked) return done(`퉤! ‘${info.name}’은(는) 보안이 걸려 있어서 열 수 없어요.\n보안 해제해 주세요! 해제한 뒤 다시 주시면 돼요.`);
  if (!info.targets.length) return done(`‘${info.name}’은(는) 아직 바꿀 수 있는 형식이 없어요.\n(그림 → PDF · AI 부터 돼요)`);
  say(`냠냠! ‘${info.name}’${more ? `\n(한 번에 하나씩 먹어요 — 나머지 ${more}개는 다시 주세요)` : ""}\n무엇으로 바꿀까요?`, {
    keep: true, moodNow: "idle",
    buttons: [...info.targets.map((t) => ({ label: t.label, sub: t.ready ? (t.to === "ai" ? "그림 그대로 담김" : "") : "다음 업데이트", primary: t.ready, disabled: !t.ready, onClick: () => run(path, info, t) })),
      { label: "그만두기", onClick: () => { busy = false; hideBubble(); mood("idle"); } }],
  });
}
async function run(path, info, t) {
  say(`${t.label}(으)로 바꾸는 중이에요…`, { keep: true, moodNow: "work" });
  progress(0);
  const r = await B.convert({ path, to: t.to });
  if (!r.ok) { busy = false; return say(`바꾸지 못했어요.\n${r.error}`, { moodNow: "worry", keep: true, buttons: [{ label: "알겠어요", onClick: () => { hideBubble(); mood("idle"); } }] }); }
  progress(100);
  await sleep(450);
  mood("spit");
  const m = mouth();
  outChip?.remove();
  outChip = await chip(t.to, m, { x: m.x - 128, y: m.y + 62 }, { shrink: false }); // 뱉은 파일은 저장할 때까지 옆에 놓여 있다
  askSave(r);
}
function askSave(r) {
  say(`다 됐어요! ‘${r.name}’\n어디에 저장할까요?`, {
    keep: true, moodNow: "happy",
    buttons: [{ label: "저장 위치 고르기", primary: true, onClick: async () => {
      const s = await B.save(r.id);
      if (s.canceled) return;                       // 창을 그냥 닫았으면 다시 고를 수 있게 그대로
      busy = false; outChip?.remove(); outChip = null;
      if (s.ok) { say(`저장했어요!\n${s.path}`, { moodNow: "happy" }); setTimeout(() => mood("idle"), 2500); }
      else say(s.error, { moodNow: "worry" });
    } }, { label: "버리기", onClick: () => { busy = false; outChip?.remove(); outChip = null; hideBubble(); mood("idle"); } }],
  });
}

// ── 알림 · 진행률 · 트레이 메뉴 ──
B.on("alarm", (a) => {
  closePanel();
  say(a.text, { alarm: true, keep: true, moodNow: "happy", buttons: [{ label: "확인", primary: true, onClick: () => { hideBubble(); mood("idle"); } }] });
});
B.on("progress", (pct) => progress(pct));
B.on("ui", (tab) => openPanel(tab));

(async () => {
  S = await B.getSettings();
  if (!S.setupDone) setupStep1();
  wake();
  syncShape();
})();
