import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { buildRequest, parseAiJson, readRow, ping } from "../hchat.js";
import { mergeAi, checkRow } from "../public/parse.js";

const rrn = (front, back6) => { const d = (front + back6).split("").map(Number), w = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4, 5]; return `${front}-${back6}${(11 - (d.reduce((s, v, i) => s + v * w[i], 0) % 11)) % 10}`; };

test("H Chat 요청 모양 · 답 해석", () => {
  const a = buildRequest({ baseUrl: "https://x/api/", format: "azure", model: "gpt-4o-mini", key: "K" }, []);
  assert.equal(a.url, "https://x/api/openai/deployments/gpt-4o-mini/chat/completions?api-version=2024-10-21");
  assert.equal(a.init.headers["api-key"], "K");
  const b = buildRequest({ baseUrl: "https://x/api", format: "openai", model: "m", key: "K" }, []);
  assert.equal(b.url, "https://x/api/v1/chat/completions"); assert.equal(b.init.headers.Authorization, "Bearer K");
  const r = parseAiJson('```json\n{"구분":"부","성명":"홍판서","한자":"洪判書","사망":true,"생년월일":"1950-02-10","주민등록번호":"500210-1******","성별":"남","본":"南陽"}\n```');
  assert.deepEqual(r, { rel: "부", name: "홍판서", hanja: "洪判書", dead: true, birth: "1950-02-10", rrn: "500210-1******", sex: "남", bon: "南陽" });
  assert.equal(parseAiJson("죄송하지만 읽을 수 없습니다"), null);
});

test("가짜 H Chat 서버로 한 줄 읽기 · 오류 안내", async () => {
  let seen = null;
  const srv = http.createServer((req, res) => {
    let body = ""; req.on("data", c => (body += c)); req.on("end", () => {
      seen = { url: req.url, key: req.headers["api-key"], body: JSON.parse(body) };
      if (req.headers["api-key"] !== "good") { res.writeHead(401).end('{"error":"bad key"}'); return; }
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ choices: [{ message: { content: '{"구분":"모","성명":"곽은숙","한자":"","사망":false,"생년월일":"","주민등록번호":"","성별":"여","본":""}' } }], usage: { total_tokens: 321 } }));
    });
  });
  await new Promise(r => srv.listen(0, "127.0.0.1", r));
  const cfg = { baseUrl: `http://127.0.0.1:${srv.address().port}/hchat-in/api`, format: "azure", model: "gpt-4o-mini", key: "good" };
  const out = await readRow(cfg, "data:image/jpeg;base64,AAAA");
  assert.equal(out.row.name, "곽은숙"); assert.equal(out.tokens, 321);
  assert.equal(seen.url, "/hchat-in/api/openai/deployments/gpt-4o-mini/chat/completions?api-version=2024-10-21");
  assert.equal(seen.body.messages[0].content[1].image_url.url, "data:image/jpeg;base64,AAAA");
  assert.equal(seen.body.temperature, 0);
  await assert.rejects(() => readRow({ ...cfg, key: "bad" }, "data:image/jpeg;base64,AAAA"), /API 키가 맞지 않거나/);
  await assert.rejects(() => readRow(cfg, "http://evil/x.png"), /그림 형식/);
  await assert.rejects(() => ping({ ...cfg, key: "" }), /API 키가 없어요/);
  srv.close();
});

test("로컬 판독 + H Chat 판독 합치기", () => {
  const good = rrn("880505", "123460");
  const base = { rel: "본인", name: "박문수", birth: "1988-05-05", rrn: good, sex: "남", src: "ocr", ocrWarn: [] };
  // 1) 로컬이 주민번호를 잘못 읽음 → 검증번호를 통과하는 H Chat 값으로
  const wrong = good.slice(0, 13) + ((+good[13] + 1) % 10); // 끝자리만 틀린 값 (검증번호 불통과)
  let r = mergeAi({ ...base, rrn: wrong, ocrWarn: ["주민번호 자릿수"] }, { rel: "본인", name: "박문수", birth: "1988-05-05", rrn: good, sex: "남" });
  assert.equal(r.rrn, good); assert.deepEqual(r.ai.used, ["숫자"]); assert.deepEqual(checkRow(r).warn, []);
  // 2) H Chat이 숫자를 지어냄(검증 불통과) → 로컬의 검증된 값을 지킨다
  r = mergeAi(base, { rel: "본인", name: "박문수", birth: "1988-05-05", rrn: wrong, sex: "남" });
  assert.equal(r.rrn, good); assert.deepEqual(checkRow(r).warn, []);
  // 3) 둘 다 검증 불통과 + 서로 다름 → 표시
  r = mergeAi({ ...base, rrn: wrong }, { rel: "본인", name: "박문수", birth: "1988-05-05", rrn: good.slice(0, 13) + ((+good[13] + 2) % 10), sex: "남" });
  assert.ok(checkRow(r).warn.some(w => w.includes("H Chat 판독과 다름: 주민번호")));
  // 4) 이름이 다르면 H Chat 값을 쓰되 반드시 표시
  r = mergeAi({ ...base, rel: "배우자", name: "응우엔티란", birth: "1990-03-05", rrn: "900305-6123451", sex: "여" }, { rel: "배우자", name: "응우옌티란", birth: "1990-03-05", rrn: "900305-6123451", sex: "여" });
  assert.equal(r.name, "응우옌티란"); assert.ok(r.ocrWarn[0].includes("글자 인식 '응우엔티란' / H Chat '응우옌티란'"));
  r = mergeAi({ ...base, rel: "모", name: "김춘섬" }, { rel: "모", name: "응우옌티란", birth: "1988-05-05", rrn: good, sex: "남" });
  assert.equal(r.name, "김춘섬", "전혀 다른 이름은 받아들이지 않는다"); assert.ok(checkRow(r).warn.some(w => w.includes("H Chat '응우옌티란'")));
  // 5) 두 판독이 같으면 이름 의심(드문 글자)과 인식 경고를 내린다 + 한자·본을 채운다
  r = mergeAi({ ...base, rel: "모", name: "김춘섬", birth: "1952-11-05", rrn: rrn("521105", "234567"), sex: "여", ocrWarn: ["이름을 읽을 때마다 다름(김춘섬 / 김춘성)"] }, { rel: "모", name: "김춘섬", hanja: "金春蟾", birth: "1952-11-05", rrn: rrn("521105", "234567"), sex: "여", bon: "金海" });
  assert.deepEqual(checkRow(r).warn, []); assert.equal(r.hanja, "金春蟾"); assert.equal(r.bon, "金海"); assert.deepEqual(r.ai.diff, []);
  // 6) 가려진 번호: 첫 숫자가 다르면 표시(대조할 검증번호가 없음)
  r = mergeAi({ ...base, rrn: "880505-1******" }, { rel: "본인", name: "박문수", birth: "1988-05-05", rrn: "880505-5******", sex: "남" });
  assert.equal(r.rrn, "880505-1******"); assert.ok(checkRow(r).warn.some(w => w.includes("주민번호")));
  // 7) 로컬이 못 읽은 성별·구분을 채운다
  r = mergeAi({ rel: "", name: "박기부", birth: "", rrn: "", sex: "", src: "ocr", ocrWarn: ["구분 글자가 흐림", "성별을 읽지 못함"] }, { rel: "부", name: "박기부", birth: "", rrn: "", sex: "남" });
  assert.deepEqual([r.rel, r.sex], ["부", "남"]); assert.ok(!r.ocrWarn.includes("성별을 읽지 못함"));
});
