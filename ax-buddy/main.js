// AX 버디 — 화면 위에 떠 있는 캐릭터 비서 (Electron 메인)
const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, screen, safeStorage, Notification, nativeImage, net } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { parseKorean, fmtWhen, dueAlarms, PRE_MIN } = require("./src/schedule");
const { inspect, convert, extOf } = require("./src/convert");
const hchat = require("./src/hchat");

const TEST = !!process.env.AXB_TEST;            // 자동 시험용 (창 모양 · 자동 시작을 건드리지 않음)
if (process.env.AXB_DATA) app.setPath("userData", process.env.AXB_DATA);
if (!app.requestSingleInstanceLock()) app.quit();

const W = 400, H = 620;
let win = null, tray = null, apiKey = "";
const file = (n) => path.join(app.getPath("userData"), n);
const readJson = (n, d) => { try { return JSON.parse(fs.readFileSync(file(n), "utf8")); } catch { return d; } };
const writeJson = (n, v) => { fs.mkdirSync(app.getPath("userData"), { recursive: true }); fs.writeFileSync(file(n) + ".tmp", JSON.stringify(v, null, 2)); fs.renameSync(file(n) + ".tmp", file(n)); };

let settings = { ...hchat.DEFAULTS, setupDone: false, photo: null, autoStart: true, pos: null, keyEnc: null };
let events = [];
const results = new Map(); // 변환 결과 (저장 위치를 고를 때까지 메모리에)

function loadAll() {
  settings = { ...settings, ...readJson("settings.json", {}) };
  events = readJson("schedule.json", []);
  // API 키는 윈도우 계정으로 암호화해서 보관 (다른 사람 · 다른 PC 에서는 못 읽음)
  if (settings.keyEnc && safeStorage.isEncryptionAvailable()) { try { apiKey = safeStorage.decryptString(Buffer.from(settings.keyEnc, "base64")); } catch { apiKey = ""; } }
}
const saveSettings = () => writeJson("settings.json", settings);
const saveEvents = () => writeJson("schedule.json", events);
const publicSettings = () => ({ baseUrl: settings.baseUrl, model: settings.model, format: settings.format, path: settings.path, setupDone: settings.setupDone, photo: settings.photo, autoStart: settings.autoStart, hasKey: !!apiKey, keySaved: !!settings.keyEnc });
const cfg = () => ({ baseUrl: settings.baseUrl, model: settings.model, format: settings.format, path: settings.path, apiKey });
const netFetch = (url, init) => net.fetch(url, init); // 윈도우 인증서 저장소 · 프록시 설정을 그대로 씀 (사내 인증서)

function createWindow() {
  const area = screen.getPrimaryDisplay().workArea;
  const pos = settings.pos && settings.pos.x > area.x - W + 80 && settings.pos.x < area.x + area.width - 80 && settings.pos.y < area.y + area.height - 80 && settings.pos.y > area.y - 200
    ? settings.pos : { x: area.x + area.width - W - 24, y: area.y + area.height - H - 8 };
  win = new BrowserWindow({
    width: W, height: H, x: pos.x, y: pos.y,
    transparent: true, frame: false, resizable: false, maximizable: false, fullscreenable: false, hasShadow: false,
    alwaysOnTop: true, skipTaskbar: true, show: false,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  win.setAlwaysOnTop(true, "floating");
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
  win.once("ready-to-show", () => win.show());
  win.on("moved", () => { const [x, y] = win.getPosition(); settings.pos = { x, y }; saveSettings(); });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e) => e.preventDefault()); // 파일을 창에 떨어뜨려도 그 파일로 이동하지 않게
}

function trayIcon() {
  const n = 32, buf = Buffer.alloc(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const d = Math.hypot(x - 15.5, y - 15.5), i = (y * n + x) * 4;
    const eye = Math.hypot(x - 11, y - 14) < 2.4 || Math.hypot(x - 20, y - 14) < 2.4;
    if (d < 14) { const c = eye ? [255, 255, 255] : [0x8f, 0x3f, 0x1d]; buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = 255; } // BGRA
  }
  return nativeImage.createFromBitmap(buf, { width: n, height: n });
}
function createTray() {
  try {
    tray = new Tray(trayIcon());
    tray.setToolTip("AX 버디");
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: "보이기 / 숨기기", click: () => (win.isVisible() ? win.hide() : win.show()) },
      { label: "일정 보기", click: () => { win.show(); win.webContents.send("ui", "schedule"); } },
      { label: "설정", click: () => { win.show(); win.webContents.send("ui", "settings"); } },
      { type: "separator" },
      { label: "끝내기", click: () => app.quit() },
    ]));
    tray.on("click", () => win.show());
  } catch { /* 트레이가 없는 환경 */ }
}
function applyAutoStart() { if (!TEST && process.platform === "win32" && app.isPackaged) app.setLoginItemSettings({ openAtLogin: !!settings.autoStart }); }

// ── 일정 알림 ──
function tickAlarms() {
  const due = dueAlarms(events, new Date());
  if (!due.length) return;
  saveEvents();
  for (const a of due) {
    win?.webContents.send("alarm", { kind: a.kind, text: a.text, title: a.event.title, when: fmtWhen(new Date(a.event.at)) });
    if (!win?.isVisible()) win?.showInactive();
    if (Notification.isSupported()) new Notification({ title: "AX 버디", body: a.text }).show();
  }
}
const listEvents = () => events.filter((e) => !e.done).sort((a, b) => new Date(a.at) - new Date(b.at)).map((e) => ({ id: e.id, title: e.title, at: e.at, when: fmtWhen(new Date(e.at)) }));

// ── 화면에서 오는 요청 ──
function wire() {
  ipcMain.handle("settings:get", () => publicSettings());
  ipcMain.handle("settings:save", (_e, s) => {
    for (const k of ["baseUrl", "model", "format", "path"]) if (typeof s[k] === "string") settings[k] = s[k].trim();
    if (typeof s.autoStart === "boolean") settings.autoStart = s.autoStart;
    if (typeof s.setupDone === "boolean") settings.setupDone = s.setupDone;
    if (typeof s.apiKey === "string" && s.apiKey.trim()) {
      apiKey = s.apiKey.trim();
      settings.keyEnc = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(apiKey).toString("base64") : null;
    }
    saveSettings(); applyAutoStart();
    return publicSettings();
  });
  ipcMain.handle("hchat:test", async () => {
    try { const out = await hchat.chat(cfg(), [{ role: "user", content: "한 단어로 인사해 줘." }], netFetch); return { ok: true, text: out.slice(0, 80) }; }
    catch (e) { return { ok: false, error: e.message }; }
  });
  ipcMain.handle("photo:pick", async () => {
    const r = await dialog.showOpenDialog(win, { title: "본인 사진 고르기", properties: ["openFile"], filters: [{ name: "사진", extensions: ["jpg", "jpeg", "png"] }] });
    if (r.canceled || !r.filePaths[0]) return publicSettings();
    const dest = file(`photo.${extOf(r.filePaths[0]) || "jpg"}`);
    fs.copyFileSync(r.filePaths[0], dest);
    settings.photo = dest; saveSettings();
    return publicSettings();
  });
  ipcMain.handle("photo:clear", () => { settings.photo = null; saveSettings(); return publicSettings(); });

  // 채팅 — 일정 문장이면 일정으로, 아니면 H Chat 에 묻는다
  ipcMain.handle("chat:send", async (_e, { text, history }) => {
    const t = String(text ?? "").trim().slice(0, 2000);
    if (!t) return { type: "text", text: "" };
    if (/^(오늘\s*)?(일정|스케줄)(\s*(보여|알려|뭐|목록|확인).*)?$/.test(t)) return { type: "list", events: listEvents() };
    const p = parseKorean(t, new Date());
    if (p?.error) return { type: "text", text: p.error, mood: "worry" };
    if (p) {
      const ev = { id: `${Date.now()}${Math.floor(Math.random() * 1000)}`, title: p.title, at: p.at.toISOString(), pre: false, done: false };
      // 10분 안쪽 일정이면 '곧' 알림은 건너뛰고 정각에만
      if (p.at - Date.now() <= PRE_MIN * 60_000) ev.pre = true;
      events.push(ev); saveEvents();
      const alarmAt = new Date(p.at.getTime() - PRE_MIN * 60_000);
      const msg = `${fmtWhen(p.at)} ‘${p.title}’ 기억했어요! ${ev.pre ? "시간 되면 알려드릴게요." : `${fmtWhen(alarmAt).replace(/^오늘 /, "")}에 미리 알려드릴게요.`}${p.assumed.length ? ` (${p.assumed.join(", ")})` : ""}`;
      return { type: "event", text: msg, event: { id: ev.id, title: ev.title, when: fmtWhen(p.at) }, mood: "happy" };
    }
    if (!apiKey) return { type: "text", text: "아직 H Chat 과 연결되지 않았어요. 설정(⚙)에서 API 키를 넣어 주세요. 일정은 지금도 기억할 수 있어요!", mood: "worry" };
    const sys = `너는 TECZEN 직원의 화면에 사는 작은 비서 캐릭터 'AX 버디'야. 밝고 친근한 존댓말로, 두세 문장 안에서 짧게 답해. 지금은 ${new Date().toLocaleString("ko-KR")}이야. 일정을 기억해 달라는 말은 "오늘 3시에 회의"처럼 시간을 넣어 말하면 된다고 안내해.`;
    const msgs = [{ role: "system", content: sys }, ...(Array.isArray(history) ? history.slice(-8) : []).map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content).slice(0, 2000) })), { role: "user", content: t }];
    try { return { type: "text", text: await hchat.chat(cfg(), msgs, netFetch) }; }
    catch (e) { return { type: "text", text: e.message, mood: "worry" }; }
  });
  ipcMain.handle("schedule:list", () => listEvents());
  ipcMain.handle("schedule:remove", (_e, id) => { events = events.filter((e) => e.id !== id); saveEvents(); return listEvents(); });

  // 파일 먹이기
  ipcMain.handle("file:inspect", (_e, p) => {
    try {
      const st = fs.statSync(p);
      if (!st.isFile()) return { error: "폴더는 못 먹어요. 파일을 주세요!" };
      const fd = fs.openSync(p, "r"); const head = Buffer.alloc(2048); const n = fs.readSync(fd, head, 0, 2048, 0); fs.closeSync(fd);
      return { name: path.basename(p), size: st.size, ...inspect(p, head.subarray(0, n)) };
    } catch (e) { return { error: e.code === "EACCES" || e.code === "EPERM" || e.code === "EBUSY" ? "파일을 열 수 없어요. 다른 프로그램에서 열려 있거나 잠겨 있어요." : "파일을 읽지 못했어요." }; }
  });
  ipcMain.handle("file:convert", async (e, { path: p, to }) => {
    try {
      const buf = fs.readFileSync(p);
      const out = await convert(buf, p, to, (pct) => e.sender.send("progress", pct));
      const id = `${Date.now()}`;
      results.clear(); // 한 번에 하나만 들고 있는다
      results.set(id, { buf: out, name: `${path.basename(p).replace(/\.[^.]+$/, "")}.${to}`, to, dir: path.dirname(p) });
      return { ok: true, id, name: results.get(id).name, size: out.length };
    } catch (err) { return { ok: false, error: err.message }; }
  });
  ipcMain.handle("file:save", async (_e, id) => {
    const r = results.get(id);
    if (!r) return { ok: false, error: "결과 파일이 없어요. 다시 변환해 주세요." };
    const pick = await dialog.showSaveDialog(win, { title: "어디에 저장할까요?", defaultPath: path.join(r.dir, r.name), filters: [{ name: r.to.toUpperCase(), extensions: [r.to] }] });
    if (pick.canceled || !pick.filePath) return { ok: false, canceled: true };
    try { fs.writeFileSync(pick.filePath, r.buf); results.delete(id); return { ok: true, path: pick.filePath }; }
    catch (err) { return { ok: false, error: `저장하지 못했어요: ${err.code ?? err.message}` }; }
  });

  // 창
  ipcMain.on("win:shape", (_e, rects) => {
    if (TEST || !win || !Array.isArray(rects)) return;
    // 캐릭터 · 말풍선 등 보이는 부분만 마우스가 닿고, 나머지 투명한 곳은 뒤 화면을 그대로 쓸 수 있게
    try { win.setShape(rects.slice(0, 20).map((r) => ({ x: Math.max(0, Math.round(r.x)), y: Math.max(0, Math.round(r.y)), width: Math.round(r.width), height: Math.round(r.height) })).filter((r) => r.width > 0 && r.height > 0)); } catch { /* 지원 안 하는 환경 */ }
  });
  ipcMain.on("win:move", (_e, { dx, dy }) => { if (!win) return; const [x, y] = win.getPosition(); win.setPosition(Math.round(x + dx), Math.round(y + dy)); });
  ipcMain.on("win:hide", () => win?.hide());
  ipcMain.on("app:quit", () => app.quit());
}

app.whenReady().then(() => {
  app.setAppUserModelId("com.teczen.axbuddy");
  loadAll(); wire(); createWindow(); createTray(); applyAutoStart();
  setInterval(tickAlarms, 5_000);
});
app.on("second-instance", () => win?.show());
app.on("window-all-closed", () => app.quit());
