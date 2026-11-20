const test = require("node:test");
const assert = require("node:assert/strict");
const { parseKorean, fmtWhen, dueAlarms } = require("../src/schedule");
const { inspect, convert } = require("../src/convert");
const { chat, buildRequest } = require("../src/hchat");
const zlib = require("node:zlib");

const NOW = new Date(2026, 10, 13, 9, 30); // 2026-11-13(금) 오전 9:30
const hm = (d) => `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;

test("일정 문장 해석", () => {
  const cases = [
    ["오늘 11시에 회의", "11/13 11:00", "회의"],
    ["오늘 11시에 회의야", "11/13 11:00", "회의"],
    ["내일 오후 2시 반 팀 주간회의 잡아줘", "11/14 14:30", "팀 주간회의"],
    ["3시에 고객사 미팅", "11/13 15:00", "고객사 미팅"],
    ["모레 9시 교육", "11/15 9:00", "교육"],
    ["11월 20일 10시 30분에 KPI 보고", "11/20 10:30", "KPI 보고"],
    ["30분 뒤에 전화", "11/13 10:00", "전화"],
    ["다음주 월요일 오전 10시 주간보고", "11/16 10:00", "주간보고"],
    ["14:00 설비 점검", "11/13 14:00", "설비 점검"],
    ["8시 조회", "11/14 8:00", "조회"], // 이미 지난 오전 8시 → 내일
  ];
  for (const [text, when, title] of cases) {
    const r = parseKorean(text, NOW);
    assert.ok(r && r.at, text);
    assert.equal(hm(r.at), when, text);
    assert.equal(r.title, title, text);
  }
  assert.equal(parseKorean("안녕 뭐해", NOW), null);
  assert.equal(parseKorean("지금 몇 시야?", NOW), null);
  assert.ok(parseKorean("오늘 8시 조회", NOW).error, "날짜를 말했는데 지난 시각이면 되묻기");
  assert.match(parseKorean("3시에 미팅", NOW).assumed.join(), /오후/);
  assert.equal(fmtWhen(new Date(2026, 10, 13, 11, 0), NOW), "오늘 오전 11:00");
  assert.equal(fmtWhen(new Date(2026, 10, 14, 14, 30), NOW), "내일 오후 2:30");
});

test("알림 — 10분 전 한 번, 정각 한 번", () => {
  const ev = [{ id: 1, title: "회의", at: new Date(2026, 10, 13, 11, 0).toISOString() }];
  assert.equal(dueAlarms(ev, new Date(2026, 10, 13, 10, 40)).length, 0);
  const pre = dueAlarms(ev, new Date(2026, 10, 13, 10, 50));
  assert.equal(pre.length, 1); assert.equal(pre[0].text, "이제 곧 회의예요! (10분 전)");
  assert.match(dueAlarms([{ id: 3, title: "고객사 미팅", at: new Date(2026, 10, 13, 11, 0).toISOString() }], new Date(2026, 10, 13, 10, 51))[0].text, /미팅이에요! \(9분 전\)/);
  assert.equal(dueAlarms(ev, new Date(2026, 10, 13, 10, 55)).length, 0, "같은 알림 두 번 안 울림");
  const at = dueAlarms(ev, new Date(2026, 10, 13, 11, 0, 5));
  assert.equal(at.length, 1); assert.equal(at[0].kind, "now");
  assert.equal(dueAlarms(ev, new Date(2026, 10, 13, 11, 1)).length, 0);
  const old = [{ id: 2, title: "지난 일", at: new Date(2026, 10, 13, 6, 0).toISOString() }];
  assert.equal(dueAlarms(old, NOW).length, 0, "꺼져 있던 동안 한참 지난 일정은 조용히");
  assert.ok(old[0].done);
});

function tinyPng() { // 2x2 빨간 PNG
  const crc = (b) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(2, 0); ihdr.writeUInt32BE(2, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.from([0, 255, 0, 0, 255, 0, 0, 0, 255, 0, 0, 255, 0, 0]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

test("파일 규칙 · 보안 문서 감지 · 그림 → PDF", async () => {
  const png = tinyPng();
  const a = inspect("사진.PNG", png);
  assert.equal(a.locked, false);
  assert.deepEqual(a.targets.map((t) => t.to), ["pdf", "ai"]);
  assert.deepEqual(inspect("보고.pptx", Buffer.from("PK\u0003\u0004")).targets.map((t) => t.to), ["pdf"]);
  assert.deepEqual(inspect("문서.pdf", Buffer.from("%PDF-1.7")).targets.map((t) => t.to), ["pptx", "docx"]);
  // 암호화된(DRM) 문서 — 확장자는 pptx 인데 첫머리가 다름
  assert.equal(inspect("보안.pptx", Buffer.from("<## DRM ENCRYPTED ##>")).locked, true);
  assert.equal(inspect("보안.pdf", Buffer.from("SCDSA002xxxxxxxx")).locked, true);
  assert.equal(inspect("메모.txt", Buffer.from("hello")).known, false);
  const prog = [];
  const pdf = await convert(png, "사진.png", "pdf", (p) => prog.push(p));
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.equal(prog.at(-1), 100);
  assert.ok(prog.every((p, i) => i === 0 || p >= prog[i - 1]), "진행률은 늘기만");
  await assert.rejects(convert(Buffer.from("PK"), "a.pptx", "pdf"), /다음 업데이트/);
});

test("H Chat 호출 형식 · 오류 안내", async () => {
  const cfg = { baseUrl: "https://x.test/hchat-in/api/", apiKey: "K", model: "gpt-4o", format: "azure" };
  const r = buildRequest(cfg, []);
  assert.equal(r.url, "https://x.test/hchat-in/api/openai/deployments/gpt-4o/chat/completions?api-version=2024-10-21");
  assert.equal(r.init.headers["api-key"], "K");
  const o = buildRequest({ ...cfg, format: "openai" }, []);
  assert.equal(o.url, "https://x.test/hchat-in/api/v1/chat/completions");
  assert.equal(o.init.headers.Authorization, "Bearer K");
  assert.equal(buildRequest({ ...cfg, path: "/custom/{model}/chat" }, []).url, "https://x.test/hchat-in/api/custom/gpt-4o/chat");
  const ok = async () => new Response(JSON.stringify({ choices: [{ message: { content: " 안녕하세요! " } }] }), { status: 200 });
  assert.equal(await chat(cfg, [], ok), "안녕하세요!");
  await assert.rejects(chat(cfg, [], async () => new Response("no", { status: 401 })), /API 키가 맞지 않/);
  await assert.rejects(chat(cfg, [], async () => new Response("no", { status: 404 })), /주소 또는 모델/);
  await assert.rejects(chat(cfg, [], async () => { throw Object.assign(new Error("x"), { cause: { code: "ENOTFOUND" } }); }), /사내망/);
  await assert.rejects(chat({ ...cfg, apiKey: "" }, [], ok), /API 키가 없어요/);
});
