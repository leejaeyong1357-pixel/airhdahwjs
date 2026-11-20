import test from "node:test";
import assert from "node:assert/strict";
import { parseLine, parseRrn, parseBirth, parseNameCell, voteName, checkRow, buildPeople, tokensToLines, parseTextPage, rrnChecksumOk, nameDoubt, maskRrn, normRel, pickNumbers } from "../public/parse.js";
import { lineMasks, findRows, looksMasked, binarize, estimateSkew } from "../public/image.js";

// 검증번호가 맞는 견본 번호 만들기 (실존 번호 아님)
const rrn = (front, back6) => { const d = (front + back6).split("").map(Number), w = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4, 5]; return `${front}-${back6}${(11 - (d.reduce((s, v, i) => s + v * w[i], 0) % 11)) % 10}`; };

test("글자 PDF 한 줄 해석", () => {
  const a = parseLine(`본인 홍길동(洪吉童) 1980년 03월 15일 ${rrn("800315", "123456")} 남 南陽`);
  assert.deepEqual([a.rel, a.name, a.hanja, a.birth, a.sex, a.bon, a.dead], ["본인", "홍길동", "洪吉童", "1980-03-15", "남", "南陽", false]);
  assert.equal(a.rrn, rrn("800315", "123456"));
  const b = parseLine("부 홍판서(洪判書) 사망 1950년 02월 10일 500210-1****** 남 南陽");
  assert.equal(b.dead, true); assert.equal(b.name, "홍판서"); assert.equal(b.rrn, "500210-1******");
  const c = parseLine("모 곽은숙 여");
  assert.deepEqual([c.rel, c.name, c.birth, c.rrn, c.sex], ["모", "곽은숙", "", "", "여"]);
  const d = parseLine("배우자 응우옌티란 1990년 03월 05일 900305-6123451 여");
  assert.equal(d.name, "응우옌티란"); assert.equal(d.bon, "");
  assert.equal(parseLine("부산광역시 서구 견본동 117번지"), null);
  assert.equal(parseLine("정정 [정정일] 2010년 04월 19일"), null);
});

test("칸별 해석: 주민번호·생년월일·이름", () => {
  assert.equal(parseRrn("761226-1******").value, "761226-1******");
  assert.equal(parseRrn("761226-15*****").value, "761226-1******", "별표를 숫자로 잘못 읽어도 첫 숫자만 남긴다");
  assert.equal(parseRrn("780203-215888", true).value, "780203-2******", "그림으로 가려진 것이 확인되면 강제");
  assert.equal(parseRrn("800315 - 1234560").value, "800315-1234560");
  assert.equal(parseRrn("210503-412349").odd, true);
  assert.equal(parseRrn("").value, "");
  assert.equal(parseBirth("1980년 03월 15일"), "1980-03-15");
  assert.equal(parseBirth("1980년03월15", true), "1980-03-15");
  assert.equal(parseBirth("1980년 13월 15일"), "");
  assert.deepEqual(parseNameCell("홍판서(洪判書) |사망|"), { name: "홍판서", hanja: "洪判書", dead: true, odd: false });
  assert.equal(parseNameCell("박기부 사망").dead, true);
  assert.equal(parseNameCell("홍 길 동").name, "홍길동");
  assert.equal(parseNameCell("성춘향(&슈좀)", false).hanja, "");
  assert.equal(normRel("배 우 자"), "배우자"); assert.equal(normRel("부부부"), "부");
});

test("여러 번 읽은 이름 다수결", () => {
  assert.deepEqual([voteName([{ name: "신은추" }, { name: "신은주" }, { name: "신은주" }]).name, voteName([{ name: "신은추" }, { name: "신은주" }, { name: "신은주" }]).agree], ["신은주", "most"]);
  assert.equal(voteName([{ name: "성춘향" }, { name: "성춘향 츄좁" }, { name: "성춘향" }]).agree, "all", "한자 찌꺼기가 붙은 것은 같은 값");
  assert.equal(voteName([{ name: "선은주때" }, { name: "선은주애삐파이" }, { name: "신은주" }]).name, "신은주", "모두 다르면 이름다운 쪽");
  assert.equal(voteName([{ name: "가", dead: true }, { name: "가", dead: true }, { name: "가", dead: false }]).dead, true);
});

test("검증과 비고", () => {
  const ok = { rel: "본인", name: "홍길동", birth: "1980-03-15", rrn: rrn("800315", "123456"), sex: "남" };
  assert.deepEqual(checkRow(ok), { notes: [], warn: [] });
  assert.equal(rrnChecksumOk(ok.rrn), true);
  assert.ok(checkRow({ ...ok, birth: "1980-08-15" }).warn.includes("주민번호 앞자리가 문서의 출생일과 다름"));
  assert.ok(checkRow({ ...ok, sex: "여" }).warn.includes("성별과 주민번호가 안 맞음"));
  const bad = ok.rrn.slice(0, 13) + ((+ok.rrn[13] + 1) % 10);
  assert.ok(checkRow({ ...ok, rrn: bad }).warn.includes("주민번호 검증번호 불일치"));
  assert.deepEqual(checkRow({ rel: "자녀", name: "박하늘", birth: "2021-05-03", rrn: "210503-4123494", sex: "여" }).warn, [], "2020.10 이후 출생은 검증번호 대상 아님");
  assert.deepEqual(checkRow({ rel: "부", name: "홍판서", birth: "1950-02-10", rrn: "500210-1******", sex: "남", dead: true }).notes, ["사망", "뒷자리 가려짐"]);
  assert.deepEqual(checkRow({ rel: "모", name: "곽은숙", sex: "여" }).notes, ["주민번호 없음"]);
  assert.deepEqual(checkRow({ rel: "배우자", name: "응우옌티란", birth: "1990-03-05", rrn: "900305-6123451", sex: "여" }).notes, ["외국인"]);
  assert.ok(checkRow({ ...ok, name: "흥길동", src: "ocr" }).warn.some(w => w.includes("성 '흥'")));
  assert.deepEqual(checkRow({ ...ok, name: "흥길동", src: "ocr", edited: true }).warn, [], "사람이 고친 줄은 이름 의심을 내린다");
  assert.deepEqual(nameDoubt("김민준"), []);
  assert.equal(maskRrn("800315-1234560"), "800315-1******");
});

test("사람 묶기 · 구분 순서 · 가족 성 대조", () => {
  const R = (rel, name) => ({ rel, name });
  const people = buildPeople([
    { file: "a.pdf", page: 1, src: "text", rows: [R("본인", "홍길동"), R("부", "홍판서"), R("자녀", "홍민준")] },
    { file: "a.pdf", page: 2, src: "text", rows: [R("본인", "이몽룡"), R("배우자", "신은주")] },
    { file: "b.pdf", page: 1, src: "ocr", rows: [R("본인", "박문수"), R("배우자", "최하나"), R("배우자", "박기부"), R("자녀", "김하늘")] },
  ]);
  assert.equal(people.length, 3);
  assert.deepEqual(people.map(p => p.rows.length), [3, 2, 4]);
  assert.ok(people[2].rows[1].ocrWarn.includes("구분 순서·중복 확인"));
  assert.ok(people[2].rows[3].ocrWarn.includes("자녀 성이 부모와 다름"));
  assert.equal(people[0].rows[2].ocrWarn, undefined);
});

test("글자 위치 → 줄 → 쪽 해석", () => {
  const T = (text, x, y, w = text.length * 10) => ({ text, x0: x, x1: x + w, y0: y, y1: y + 12 });
  const tokens = [
    T("가 족 관 계 증 명 서 ( 상 세 )", 200, 50, 300), T("대한민국", 100, 150, 400),
    T("구분", 40, 100), T("성 명", 150, 100), T("출생연월일", 300, 100), T("주민등록번호", 420, 100), T("성별", 540, 100), T("본", 590, 100),
    T("본인", 40, 130), T("홍길동(洪吉童)", 130, 131), T("1980년 03월 15일", 290, 130, 110), T(rrn("800315", "123456"), 420, 130, 100), T("남", 545, 130), T("南陽", 585, 130),
    T("부", 45, 200), T("홍판서(洪判書)", 120, 200), T("사망", 215, 201), T("1950년 02월 10일", 290, 200, 110), T("500210-1******", 420, 200, 100), T("남", 545, 200), T("南陽", 585, 200),
    T("위 가족관계증명서(상세)는 가족관계등록부의 기록사항과 틀림없음을 증명합니다.", 60, 300, 500),
    T("부 록", 45, 340),
  ];
  tokens[1].y1 = tokens[1].y0 + 150; // 바탕 무늬처럼 아주 큰 글자
  const res = parseTextPage(tokensToLines(tokens));
  assert.equal(res.isCert, true); assert.equal(res.kind, "상세");
  assert.deepEqual(res.rows.map(r => [r.rel, r.name, r.dead]), [["본인", "홍길동", false], ["부", "홍판서", true]]);
});

// ── 그림 처리: 가짜 표를 그려서 줄·칸을 찾는지
function drawTable(w, h, rowsY, skipH = []) {
  const bin = new Uint8Array(w * h), x0 = Math.round(w * 0.08), x1 = Math.round(w * 0.92), tw = x1 - x0;
  const xs = [0, 0.09, 0.39, 0.62, 0.83, 0.915, 1].map(f => Math.round(x0 + tw * f));
  const hl = y => { for (let t = 0; t < 3; t++) bin.fill(1, (y + t) * w + x0, (y + t) * w + x1 + 3); };
  const vl = (x, ya, yb) => { for (let y = ya; y <= yb + 2; y++) for (let t = 0; t < 3; t++) bin[y * w + x + t] = 1; };
  rowsY.forEach((y, i) => { if (!skipH.includes(i)) hl(y); });
  for (const x of xs) vl(x, rowsY[0], rowsY[rowsY.length - 1]);
  return { bin, xs };
}
test("표 줄·칸 찾기 (가로선이 빠져도 줄을 잃지 않는다)", () => {
  const w = 1000, h = 700, ys = [100, 150, 200, 250];
  const a = drawTable(w, h, ys);
  let m = lineMasks(a.bin, w, h, 40, 36);
  let rows = findRows(m.hm, m.vm, w, h);
  assert.equal(rows.length, 3); assert.ok(rows.every(r => r.cells.length === 6 && !r.est));
  assert.ok(Math.abs(rows[0].cells[1].x0 - a.xs[1]) < 6);
  const b = drawTable(w, h, ys, [2]); // 가운데 가로선 하나가 안 보이는 스캔
  m = lineMasks(b.bin, w, h, 40, 36);
  rows = findRows(m.hm, m.vm, w, h);
  assert.equal(rows.length, 3, "합쳐진 줄을 보통 높이로 나눈다");
  assert.equal(rows.filter(r => r.est).length, 2);
  assert.equal(estimateSkew(m.hm, w, h), 0);
});

test("가려진 주민번호(별표) 그림 판별 · 옅은 무늬 제외", () => {
  const w = 400, h = 60, bin = new Uint8Array(w * h);
  const glyph = (x, tall) => { for (let y = tall ? 10 : 20; y < (tall ? 50 : 34); y++) for (let k = 0; k < 12; k++) bin[y * w + x + k] = 1; };
  let x = 10; for (let i = 0; i < 6; i++, x += 20) glyph(x, true);
  for (let k = 0; k < 8; k++) bin[30 * w + x + k] = 1; x += 14; // 붙임표
  glyph(x, true); x += 20;
  const full = bin.slice(); let xf = x; for (let i = 0; i < 6; i++, xf += 20) { for (let y = 10; y < 50; y++) for (let k = 0; k < 12; k++) full[y * w + xf + k] = 1; }
  for (let i = 0; i < 6; i++, x += 20) glyph(x, false);
  const box = { x0: 0, y0: 0, x1: w - 1, y1: h - 1 };
  assert.equal(looksMasked(bin, w, box), true);
  assert.equal(looksMasked(full, w, box), false);
  // 종이 235 · 무늬 170 · 글자 40 → 글자만 잉크
  const g = new Uint8Array(100 * 100).fill(235);
  for (let y = 20; y < 60; y++) for (let xx = 10; xx < 90; xx++) g[y * 100 + xx] = 170;
  for (let y = 38; y < 42; y++) for (let xx = 30; xx < 70; xx++) g[y * 100 + xx] = 40;
  const bw = binarize(g, 100, 100);
  assert.equal(bw[40 * 100 + 50], 1); assert.equal(bw[25 * 100 + 50], 0);
});

test("여러 엔진이 읽은 숫자 고르기", () => {
  const good = rrn("880505", "123460"), b = "1988-05-05", bad = good.slice(0, 13) + ((+good[13] + 1) % 10);
  // 한 엔진만 맞게 읽어도 검증번호를 통과하는 값을 고른다
  assert.deepEqual(pickNumbers([b, b, b], [bad, good, "880505-12346"]), { birth: b, rrn: good, warn: [], sure: true });
  // 주민번호 앞자리를 모두 틀렸어도 출생일로 바로잡아 검증번호 통과
  assert.equal(pickNumbers([b, b, ""], ["880506-" + good.slice(7), "860505-" + good.slice(7)]).rrn, good);
  // 출생일 칸을 못 읽었어도, 두 엔진이 같은 값을 읽고 검증번호 통과 → 경고 없음
  assert.deepEqual(pickNumbers(["", "", ""], [good, good, bad]), { birth: b, rrn: good, warn: [], sure: true });
  // 가려진 번호: 첫 숫자를 못 읽은 후보는 빼고, 두 엔진이 같으면 통과
  assert.deepEqual(pickNumbers([b, b], ["880505-1******", "880505-*******", "880505-1******"]), { birth: b, rrn: "880505-1******", warn: [], sure: false });
  // 같은 엔진의 두 변형이 같은 값이어도 "두 판독 일치"로 치지 않는다 (groups)
  assert.ok(pickNumbers([b, b, b], ["880505-5******", "880505-1******", "880505-5******"], ["t", "p", "t"]).warn.includes("주민번호 뒷자리 판독이 서로 다름"));
  assert.deepEqual(pickNumbers([b, b, b], ["880505-1******", "880505-1******", "880505-5******"], ["t", "p", "t"]).warn, []);
  assert.ok(pickNumbers([b, b], ["880505-1******", "880505-5******"]).warn.includes("주민번호 뒷자리 판독이 서로 다름"));
  // 아무것도 안 맞으면 경고와 함께 가장 많이 나온 값
  const r = pickNumbers([b, b], [bad, bad, good.slice(0, 13) + ((+good[13] + 2) % 10)]);
  assert.equal(r.rrn, bad); assert.ok(r.warn.includes("주민번호 판독이 서로 다름"));
  assert.ok(checkRow({ rel: "본인", name: "박문수", birth: r.birth, rrn: r.rrn, sex: "남" }).warn.includes("주민번호 검증번호 불일치"));
  assert.ok(pickNumbers([b], ["880505-12346", "880505-1234"]).warn.includes("주민번호 자릿수"));
});
