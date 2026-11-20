import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { ask, health, readPage, parsePageJson, orderFor } from "../hchat.js";
import { mergeSources, checkRow } from "../public/parse.js";

const rrn = (front, back6) => { const d = (front + back6).split("").map(Number), w = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4, 5]; return `${front}-${back6}${(11 - (d.reduce((s, v, i) => s + v * w[i], 0) % 11)) % 10}`; };
const PAGE = { 문서: "가족관계증명서", 종류: "상세", 줄: [{ 구분: "본인", 성명: "홍길동", 한자: "洪吉童", 사망: false, 생년월일: "1980-03-15", 주민등록번호: rrn("800315", "123456"), 성별: "남", 본: "南陽" }] };
const IMG = "data:image/png;base64,AAAA";

// 가짜 H Chat 관문: 명세의 v3 주소들 (형식 선택 · 요청 모양 바꿔 재시도 시험용)
function gateway() {
  const seen = [];
  const srv = http.createServer((req, res) => {
    let body = ""; req.on("data", c => (body += c)); req.on("end", () => {
      const j = body ? JSON.parse(body) : {}; seen.push({ url: req.url, headers: req.headers, body: j });
      const send = (code, obj) => res.writeHead(code, { "Content-Type": "application/json" }).end(JSON.stringify(obj));
      if (req.url === "/api/v1/are-you-okay") return res.end("Yes I am okay (from: 10.0.0.1)");
      if (req.headers.authorization !== "Bearer good") return send(401, { error: "invalid key" });
      const answer = JSON.stringify(PAGE);
      if (req.url === "/api/v3/openai/responses") {
        if (j.model === "gpt-old") return send(404, { error: "responses not supported for this model" });
        return send(200, { output: [{ type: "reasoning", summary: [] }, { type: "message", content: [{ type: "output_text", text: answer }] }], usage: { total_tokens: 1500 } });
      }
      if (req.url === "/api/v3/openai/deployments/gpt-old/chat/completions") {
        if ("max_completion_tokens" in j) return send(400, { error: { message: "Unsupported parameter: 'max_completion_tokens'." } });
        return send(200, { choices: [{ message: { content: "```json\n" + answer + "\n```" } }], usage: { total_tokens: 900 } });
      }
      if (req.url === "/api/v3/claude/messages") {
        if (!j.anthropic_version) return send(400, { error: { message: "anthropic_version: Field required" } });
        return send(200, { content: [{ type: "text", text: answer }], usage: { input_tokens: 1200, output_tokens: 200 } });
      }
      if (req.url === "/api/v3/models/gemini-3.8-flash:generateContent") return send(200, { candidates: [{ content: { parts: [{ text: answer }] } }], usageMetadata: { totalTokenCount: 777 } });
      send(404, { error: "no such path" });
    });
  });
  return new Promise(r => srv.listen(0, "127.0.0.1", () => r({ srv, seen, cfg: { baseUrl: `http://127.0.0.1:${srv.address().port}/api`, key: "good", projectId: "", api: "auto", insecure: false } })));
}

test("H Chat 호출: 명세의 주소·머리글 · 요청 모양 재시도 · 오류 안내", async () => {
  const { srv, seen, cfg } = await gateway();
  assert.deepEqual(orderFor("claude-sonnet-5-5", "auto"), ["messages"]); assert.deepEqual(orderFor("gpt-5.5", "auto"), ["responses", "chat"]); assert.deepEqual(orderFor("gemini-3.8-flash", "auto"), ["gemini"]);
  assert.equal((await health(cfg)).ok, true);
  // GPT-5 계열: Responses API
  let r = await readPage({ ...cfg, projectId: "P1" }, "gpt-5.5", IMG);
  assert.equal(r.recipe, "responses"); assert.equal(r.cert, true); assert.equal(r.rows[0].name, "홍길동"); assert.equal(r.tokens, 1500);
  let last = seen[seen.length - 1];
  assert.equal(last.url, "/api/v3/openai/responses"); assert.equal(last.headers["x-project-id"], "P1"); assert.equal(last.headers["api-key"], undefined);
  assert.deepEqual(last.body.input[0].content[1], { type: "input_image", image_url: IMG });
  // Responses 가 안 되는 모델 → Chat Completions (배포 이름이 주소에 들어감), 토큰 수 이름을 바꿔 재시도
  r = await readPage(cfg, "gpt-old", IMG);
  assert.equal(r.recipe, "chat"); last = seen[seen.length - 1];
  assert.ok("max_tokens" in last.body); assert.equal(last.body.messages[0].content[1].image_url.url, IMG); assert.equal(last.headers["x-project-id"], undefined);
  // Claude: /v3/claude/messages. 400 을 보고 Vertex 식 anthropic_version 을 넣어 재시도, 다음부터는 바로 그 모양
  r = await readPage(cfg, "claude-sonnet-5-5", IMG);
  assert.equal(r.recipe, "messages"); assert.equal(r.tokens, 1400); last = seen[seen.length - 1];
  assert.deepEqual(last.body.messages[0].content[0].source, { type: "base64", media_type: "image/png", data: "AAAA" });
  const n = seen.length; await readPage(cfg, "claude-sonnet-5-5", IMG); assert.equal(seen.length, n + 1, "찾은 모양을 기억한다");
  // Gemini: /v3/models/{model}:generateContent, 카멜 케이스
  r = await readPage(cfg, "gemini-3.8-flash", IMG);
  assert.equal(r.recipe, "gemini"); last = seen[seen.length - 1];
  assert.deepEqual(last.body.contents[0].parts[1], { inlineData: { mimeType: "image/png", data: "AAAA" } }); assert.ok(last.body.generationConfig);
  // 오류 안내
  await assert.rejects(() => ask({ ...cfg, key: "bad" }, "gpt-5.5", "x", null), /API 키가 맞지 않거나/);
  await assert.rejects(() => ask({ ...cfg, key: "" }, "gpt-5.5", "x", null), /API 키가 없어요/);
  await assert.rejects(() => ask(cfg, "gpt-5.5", "x", "http://evil/x.png"), /그림 형식/);
  await assert.rejects(() => ask(cfg, "gemini-none", "x", null), /호출에 실패했어요.*404/);
  srv.close();
  await assert.rejects(() => ask({ ...cfg, baseUrl: cfg.baseUrl + "x" }, "gpt-5.5", "x", null), /연결하지 못했어요/);
});

test("H Chat 답 해석", () => {
  const p = parsePageJson('설명입니다.\n{"문서":"가족관계증명서","종류":"일반","줄":[{"구분":"부","성명":"홍판서","한자":"洪判書","사망":true,"생년월일":"1950-02-10","주민등록번호":"500210-1******","성별":"남","본":"南陽"}]}');
  assert.equal(p.cert, true); assert.equal(p.kind, "일반");
  assert.deepEqual(p.rows[0], { rel: "부", name: "홍판서", hanja: "洪判書", dead: true, birth: "1950-02-10", rrn: "500210-1******", sex: "남", bon: "南陽" });
  assert.equal(parsePageJson('{"문서":"다른 문서","줄":[]}').cert, false);
  assert.equal(parsePageJson("죄송하지만 읽을 수 없습니다"), null);
});

test("여러 판독 합치기 (주 모델 · 교차 확인 모델 · 이 PC 글자 인식)", () => {
  const good = rrn("880505", "123460"), bad = good.slice(0, 13) + ((+good[13] + 1) % 10);
  const A = { rel: "본인", name: "박문수", hanja: "朴文秀", dead: false, birth: "1988-05-05", rrn: good, sex: "남", bon: "潘南" };
  const local = { ...A, hanja: "", bon: "", crop: "data:crop" };
  // 1) 셋이 같음 → 경고 없음, 한자·본은 AI 값, 줄 그림은 이 PC 것
  let [r] = mergeSources([{ tag: "m1", rows: [A] }, { tag: "m2", rows: [A] }, { tag: "이 PC 글자 인식", rows: [local], local: true }]);
  assert.deepEqual(checkRow({ ...r, src: "ai" }).warn, []); assert.equal(r.hanja, "朴文秀"); assert.equal(r.crop, "data:crop"); assert.equal(r.readers.length, 3);
  // 2) 주 모델이 숫자 한 자리를 틀림 → 검증번호를 통과하는 값으로 (다른 판독에서)
  [r] = mergeSources([{ tag: "m1", rows: [{ ...A, rrn: bad }] }, { tag: "m2", rows: [A] }]);
  assert.equal(r.rrn, good); assert.deepEqual(checkRow({ ...r, src: "ai" }).warn, []);
  // 3) 주 모델 혼자 읽었고 검증번호도 안 맞음 → 반드시 경고
  [r] = mergeSources([{ tag: "m1", rows: [{ ...A, rrn: bad }] }]);
  assert.ok(checkRow({ ...r, src: "ai" }).warn.includes("주민번호 검증번호 불일치"));
  // 4) 검증번호 대상이 아닌 번호(2020.10 이후 출생): 한 번만 읽었으면 경고, 두 판독이 같으면 통과
  const kid = { rel: "자녀", name: "박하늘", hanja: "", dead: false, birth: "2021-05-03", rrn: "210503-4123491", sex: "여", bon: "" };
  [r] = mergeSources([{ tag: "m1", rows: [kid] }]);
  assert.ok(r.ocrWarn.includes("주민번호 뒷자리를 한 번만 읽음(검증번호 대상 아님)"));
  [r] = mergeSources([{ tag: "m1", rows: [kid] }, { tag: "m2", rows: [kid] }]);
  assert.deepEqual(r.ocrWarn, []);
  [r] = mergeSources([{ tag: "m1", rows: [kid] }, { tag: "m2", rows: [{ ...kid, rrn: "210503-4123497" }] }]);
  assert.ok(r.ocrWarn.includes("주민번호 뒷자리 판독이 서로 다름"));
  // 5) 가려진 번호는 출생일·성별과 맞물리면 통과
  [r] = mergeSources([{ tag: "m1", rows: [{ ...A, rrn: "880505-1******" }] }]);
  assert.deepEqual(checkRow({ ...r, src: "ai" }).warn, []);
  // 6) 이름: AI 둘이 같으면 이 PC 글자 인식이 달라도 통과. AI끼리 다르면 주 모델 값 + 경고. AI 하나뿐이면 이 PC와 다를 때 경고(값은 AI)
  const f = { rel: "배우자", name: "응우옌티란", hanja: "", dead: false, birth: "1990-03-05", rrn: "900305-6123451", sex: "여", bon: "" };
  const fl = { ...f, name: "응우엔티란", rrn: "900305-7612345" };
  [r] = mergeSources([{ tag: "m1", rows: [f] }, { tag: "m2", rows: [f] }, { tag: "이 PC 글자 인식", rows: [fl], local: true }]);
  assert.equal(r.name, "응우옌티란"); assert.equal(r.rrn, f.rrn); assert.deepEqual(r.ocrWarn, [], "AI 둘이 같으면 이 PC 판독이 달라도 경고 없음");
  [r] = mergeSources([{ tag: "m1", rows: [f] }, { tag: "m2", rows: [{ ...f, name: "응우엔티란" }] }, { tag: "이 PC 글자 인식", rows: [fl], local: true }]);
  assert.equal(r.name, "응우옌티란", "AI끼리 다르면 주 모델 값"); assert.ok(r.ocrWarn.some(w => w.startsWith("이름 판독이 서로 다름")));
  [r] = mergeSources([{ tag: "m1", rows: [f] }, { tag: "이 PC 글자 인식", rows: [fl], local: true }]);
  assert.equal(r.name, "응우옌티란"); assert.ok(r.ocrWarn.some(w => w.startsWith("이름 판독이 서로 다름"))); assert.ok(r.ocrWarn.includes("주민번호 뒷자리 판독이 서로 다름"));
  // 7) 못 읽은 자리(?)와 줄 수 불일치는 표시. 머리글 줄은 버린다
  [r] = mergeSources([{ tag: "m1", rows: [{ rel: "구분", name: "성 명" }, { ...A, name: "박?수", rrn: "88050?-1234567" }] }, { tag: "m2", rows: [A, kid] }]);
  assert.ok(r.ocrWarn.includes("H Chat이 이름 일부를 읽지 못함")); assert.ok(r.ocrWarn.includes("H Chat이 주민번호 일부를 읽지 못함"));
  assert.ok(r.ocrWarn.some(w => w.startsWith("줄 수가 판독마다 다름(m1 1줄 / m2 2줄)")));
});
