// 테스트 도우미 — 임시 data 폴더로 서버를 켜고, 웹소켓으로 접속한다.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export async function startServer({ dataDir, port } = {}) {
  dataDir ??= mkdtempSync(join(tmpdir(), "tzw-"));
  port ??= 30000 + Math.floor(Math.random() * 20000);
  const proc = spawn(process.execPath, [join(ROOT, "server.js")], { env: { WORLD_SEED: "12345", ADMINS: "관리자", ...process.env, PORT: String(port), DATA_DIR: dataDir }, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  proc.stdout.on("data", (d) => { log += d; });
  proc.stderr.on("data", (d) => { log += d; });
  for (let i = 0; i < 100 && !log.includes("켜졌습니다"); i++) await sleep(50);
  if (!log.includes("켜졌습니다")) throw new Error(`서버가 켜지지 않음\n${log}`);
  const base = `http://127.0.0.1:${port}`;
  if (process.env.DEBUG_MSGS) proc.stdout.on("data", (d) => process.stderr.write(d));
  return {
    port, base, dataDir, proc, get log() { return log; },
    async stop() { proc.kill("SIGTERM"); await new Promise((r) => proc.once("exit", r)); },
    cleanup() { rmSync(dataDir, { recursive: true, force: true }); },
  };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function post(base, path, body) {
  const res = await fetch(base + path, { method: "POST", body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}

/** 웹소켓 접속 — 받은 메시지를 모아 두고 기다릴 수 있다 */
export async function connect(base, token, realm = "main") {
  const ws = new WebSocket(base.replace("http", "ws") + "/ws");
  const msgs = [];
  const waiters = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    msgs.push(m);
    for (const w of [...waiters]) if (w.pred(m)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(m); }
  };
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  const c = {
    ws, msgs,
    send: (o) => ws.send(JSON.stringify(o)),
    wait(pred, ms = 3000) {
      const hit = msgs.find(pred);
      if (hit) { msgs.splice(msgs.indexOf(hit), 1); return Promise.resolve(hit); }
      return new Promise((resolve, reject) => {
        const w = { pred, resolve: (m) => { msgs.splice(msgs.indexOf(m), 1); resolve(m); } };
        waiters.push(w);
        setTimeout(() => { if (waiters.includes(w)) { waiters.splice(waiters.indexOf(w), 1); reject(new Error(`시간 초과: ${pred} | 받은 것: ${msgs.filter((x) => x.t !== "ents").slice(-6).map((x) => JSON.stringify(x).slice(0, 160)).join(" ; ")}`)); } }, ms);
      });
    },
    /** 쌓인 메시지를 비우고 보낸 뒤 답을 기다린다 */
    ask(obj, pred, ms) { msgs.length = 0; c.send(obj); return c.wait(pred, ms); },
    close() { ws.close(); },
  };
  c.send({ t: "hello", token, realm });
  c.welcome = await c.wait((m) => m.t === "welcome" || m.t === "auth" || m.t === "kick");
  return c;
}
