// 가족관계증명서 글자 → 사람별 자료 정리 · 검증 (브라우저와 Node 테스트에서 함께 씀)

export const RELS = ["본인", "부", "모", "양부", "양모", "배우자", "자녀"];
const REL_RE = /^(본인|배우자|자녀|양부|양모|부|모)(?:\s+(.*))?$/;
const strip = s => String(s || "").replace(/\s+/g, "");

// ───────── 낱글자(토큰) → 줄
// token: { text, x0, y0, x1, y1 }
export function tokensToLines(tokens) {
  let ts = tokens.filter(t => t.text && t.text.trim()).map(t => ({ ...t, yc: (t.y0 + t.y1) / 2, h: Math.max(1, t.y1 - t.y0) }));
  if (!ts.length) return [];
  const hs = ts.map(t => t.h).sort((a, b) => a - b), med = hs[hs.length >> 1];
  ts = ts.filter(t => t.h <= med * 2.6); // 바탕 무늬처럼 아주 큰 글자는 뺌
  ts.sort((a, b) => a.yc - b.yc);
  const lines = [];
  for (const t of ts) {
    const L = lines[lines.length - 1];
    if (L && Math.abs(t.yc - L.yc) < Math.min(L.h, t.h) * 0.6) {
      L.tokens.push(t); L.yc = (L.yc * L.n + t.yc) / (L.n + 1); L.n++; L.h = (L.h * (L.n - 1) + t.h) / L.n;
    } else lines.push({ tokens: [t], yc: t.yc, h: t.h, n: 1 });
  }
  return lines.map(L => {
    L.tokens.sort((a, b) => a.x0 - b.x0);
    let text = "", prev = null;
    for (const t of L.tokens) {
      if (prev) text += t.x0 - prev.x1 > L.h * 0.22 ? " " : "";
      text += t.text.trim(); prev = t;
    }
    return {
      text,
      x0: Math.min(...L.tokens.map(t => t.x0)), x1: Math.max(...L.tokens.map(t => t.x1)),
      y0: Math.min(...L.tokens.map(t => t.y0)), y1: Math.max(...L.tokens.map(t => t.y1)),
    };
  });
}

// ───────── 칸별 해석
export function normRel(s) {
  const t = String(s || "").replace(/[^가-힣]/g, "");
  if (!t) return "";
  if (RELS.includes(t)) return t;
  if (/구|분/.test(t)) return "구분";
  if (/본|인/.test(t)) return "본인";
  if (/배|우/.test(t)) return "배우자";
  if (/양/.test(t)) return /모/.test(t) ? "양모" : "양부";
  if (/녀|자/.test(t)) return "자녀";
  if (/부/.test(t)) return "부";
  if (/모/.test(t)) return "모";
  return "";
}

export function parseBirth(s, loose = false) {
  const t = String(s || "");
  let m = t.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일?/);
  if (!m && loose) m = t.replace(/\s+/g, "").match(/(\d{4})\D{0,2}(\d{2})\D{0,2}(\d{2})/);
  if (!m) return "";
  const y = +m[1], mo = +m[2], d = +m[3];
  if (y < 1850 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return "";
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// 주민등록번호. 결과: "800101-1234567" · "800101-1******" · ""  (+ 자릿수 문제면 odd=true)
// forceMask: 그림에서 뒷자리가 별표(*)로 가려진 것이 확인된 경우
export function parseRrn(s, forceMask = false) {
  const t = String(s || "").replace(/\s+/g, "").replace(/[＊✱∗×xX]/g, "*").replace(/[–—−~_]/g, "-");
  const m = t.match(/(\d{6})-?([\d*]{1,9})/);
  if (!m) return { value: "", odd: /\d{4,}/.test(t) };
  let back = m[2], odd = false;
  if (forceMask || back.includes("*")) back = (/\d/.test(back[0]) ? back[0] : "*") + "******"; // 가려진 번호는 첫 숫자만 보인다
  else if (back.length !== 7) { odd = true; back = back.slice(0, 7); }
  return { value: `${m[1]}-${back}`, odd };
}

export function parseSex(s) {
  const t = String(s || "");
  if (/남/.test(t)) return "남";
  if (/여/.test(t)) return "여";
  return "";
}

// 성명 칸: "홍판서(洪判書) 사망" → { name, hanja, dead }
export function parseNameCell(s, keepHanja = true) {
  let t = String(s || "").replace(/[|\[\]{}_=~`'"“”‘’<>]/g, " ").replace(/（/g, "(").replace(/）/g, ")");
  let dead = false, hanja = "", odd = false;
  const open = t.indexOf("(");
  let name = t, after = "";
  if (open >= 0) {
    name = t.slice(0, open);
    const close = t.indexOf(")", open);
    hanja = close > open ? t.slice(open + 1, close) : "";
    after = close > open ? t.slice(close + 1) : t.slice(open + 1);
    if (close < 0) hanja = "";
  }
  const deadRe = /사\s*망|[사시샤]\s*[망당맘밍앙]/;
  if (deadRe.test(after)) dead = true;
  else if (open < 0) {
    const m = name.match(/^(.*?[가-힣A-Za-z])\s+(사\s*망)\s*[ㅣ1Il]?\s*$/) || name.match(/^(.{2,}?)\s*[ㅣ1Il]\s*(사\s*망)\s*[ㅣ1Il]?\s*$/);
    if (m) { name = m[1]; dead = true; }
  } else if (/[가-힣]{2,}/.test(after)) odd = true; // 괄호 뒤에 뜻 모를 글자
  name = name.replace(/[^가-힣A-Za-z·\- ]/g, " ").replace(/\s+/g, " ").trim();
  if (/^[가-힣 ]+$/.test(name) && strip(name).length <= 4) name = strip(name);
  hanja = keepHanja ? hanja.replace(/[^㐀-鿿豈-﫿]/g, "") : "";
  return { name, hanja, dead, odd };
}

// 같은 칸을 여러 방식으로 읽은 값들 중 다수결로 고른다
// cands: [{ name, dead }]  →  { name, dead, agree: "all" | "most" | "none", seen: [...] }
export function voteName(cands) {
  const names = cands.map(c => c.name).filter(Boolean);
  // "성춘향"과 "성춘향 츄좁"처럼 한쪽이 다른 쪽의 앞부분이면 같은 값으로 본다 (뒤는 한자를 잘못 읽은 찌꺼기)
  const norm = names.map(n => names.filter(m => m.length >= 2 && m.length < n.length && n.startsWith(m)).sort((a, b) => a.length - b.length)[0] || n);
  const freq = new Map(); for (const n of norm) freq.set(n, (freq.get(n) || 0) + 1);
  const nice = n => (/^[가-힣]{2,4}$/.test(n) ? 2 : 0) + (SURNAMES.has(n[0]) ? 1 : 0) + (n.slice(1).split("").every(c => COMMON.has(c)) ? 1 : 0);
  const best = [...freq.entries()].sort((a, b) => b[1] - a[1] || nice(b[0]) - nice(a[0]))[0] || ["", 0];
  const deadN = cands.filter(c => c.dead).length;
  return {
    name: best[0], dead: deadN * 2 > cands.length, deadSplit: deadN > 0 && deadN < cands.length,
    agree: !norm.length ? "none" : best[1] === cands.length ? "all" : best[1] * 2 > cands.length ? "most" : "none",
    seen: [...freq.keys()],
  };
}

// ───────── 글자 PDF용: 한 줄 → 한 사람
export function parseLine(text) {
  const s = String(text || "").replace(/[|｜]/g, " ").replace(/\s+/g, " ").trim();
  const m = s.match(REL_RE);
  if (!m) return null;
  const rest = m[2] || "";
  const bm = rest.match(/\d{4}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일/);
  const rm = rest.match(/\d{6}\s*-\s*[\d*]{1,7}/);
  const starts = [bm, rm].filter(Boolean).map(x => x.index);
  const ends = [bm, rm].filter(Boolean).map(x => x.index + x[0].length);
  let head = rest, sex = "", bon = "";
  if (starts.length) {
    head = rest.slice(0, Math.min(...starts));
    const tm = rest.slice(Math.max(...ends)).trim().match(/^(남|여)?\s*(.*)$/);
    sex = tm[1] || ""; bon = tm[2] || "";
  } else {
    const tm = rest.match(/^(.*?)\s+(남|여)(?:\s+(\S.*))?$/);
    if (tm) { head = tm[1]; sex = tm[2]; bon = tm[3] || ""; }
  }
  const nc = parseNameCell(head);
  if (!nc.name) return null;
  const rr = rm ? parseRrn(rm[0]) : { value: "", odd: false };
  return {
    rel: m[1], name: nc.name, hanja: nc.hanja, dead: nc.dead,
    birth: bm ? parseBirth(bm[0]) : "", rrn: rr.value, sex,
    bon: bon.replace(/[^㐀-鿿豈-﫿가-힣]/g, ""),
    ocrWarn: [nc.odd && "이름 옆 표시", rr.odd && "주민번호 자릿수"].filter(Boolean),
  };
}

// ───────── 쪽 판별
export function pageInfo(lines) {
  const all = lines.map(l => strip(l.text));
  const joined = all.join("\n");
  const title = /가[족죽쪽촉]관[계게][증중종]명서/.test(joined);
  const other = /기본[증중종]명서|혼인관[계게][증중종]명서|입양관[계게][증중종]명서|친양자입양|주민등록표/.test(joined) && !title;
  const km = joined.match(/가[족죽쪽촉]관[계게][증중종]명서\(?(상세|일반|특정)/);
  const header = all.findIndex(t => /구분/.test(t) && /성명/.test(t) && /주민등록번호|출생연월일/.test(t));
  return { title, other, kind: km ? km[1] : "", header };
}

// 글자 PDF 한 쪽 → 사람 줄들
export function parseTextPage(lines) {
  const info = pageInfo(lines);
  const rows = [];
  if (info.header >= 0) {
    for (let i = info.header + 1; i < lines.length; i++) {
      const t = strip(lines[i].text);
      if (/^위가[족죽]관계|상세내용/.test(t)) break;
      const r = parseLine(lines[i].text);
      if (r) rows.push({ ...r, box: { x0: lines[i].x0, y0: lines[i].y0, x1: lines[i].x1, y1: lines[i].y1 } });
    }
  }
  return { ...info, isCert: info.title && rows.some(r => r.rel === "본인"), rows };
}

// ───────── 스캔으로 읽은 이름 의심하기
// 글자 인식은 이름을 틀려도 스스로 알 수 없으므로, "성씨가 아닌 첫 글자"·"이름에 드문 글자"를 표시해 사람이 보게 한다.
const SURNAMES = new Set(("김이박최정강조윤장임한오서신권황안송전홍유고문양손배백허남심노하곽성차주우구민류나진지엄채원천방공현함변염여추도소석선설마길연위표명기반라왕금옥육인맹제모탁국어은편용예경봉사부가복태목형계피두감음빈동온호범좌팽승간상시갈단견당화창옹순빙종풍엽궁평판독점묵").split(""));
const COMMON = new Set(("가강건경고관광교구국권규균근금기길나남내노누다단달담대덕도동두라란람래려련령로록룡루류률리린림마만말매명모목무문미민반방배백범병보복봄봉부분비빈빛사산삼상새생서석선설섭성세소솔송수숙순술슬승시식신실심아안애양어언엄여연열염영예오옥온완왕요용우욱운울웅원월위유육윤율은을음의이익인일임자잔장재전점정제조종주준중지직진집찬창채천철청초춘출충치칠태택평표풍필하학한해향허헌혁현형혜호홍화환황회효후훈휘흥희" +
  "름롬솜르바별롱늘결힘샘겨꽃님랑터얼벼뫼큰푸른찬빛들봄솔잎단비온유담율봄결솔휼겸곤곽견강탁탄판팔학함합항혁협홍훤흠흔흡희엘율융율옹완용욱").split(""));
export function nameDoubt(name) {
  const n = String(name || "");
  if (!/^[가-힣]{2,4}$/.test(n)) return n && /^[가-힣 ]+$/.test(n) ? ["긴 이름(외국인일 수 있음)"] : [];
  const out = [];
  if (!SURNAMES.has(n[0])) out.push(`성 '${n[0]}'`);
  const rare = n.slice(1).split("").filter(c => !COMMON.has(c));
  if (rare.length) out.push(`드문 글자 '${rare.join("")}'`);
  return out;
}

// ───────── 검증 · 비고
export function rrnChecksumOk(rrn) {
  const d = String(rrn).replace(/-/g, "");
  if (!/^\d{13}$/.test(d)) return null;
  const w = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4, 5];
  let sum = 0; for (let i = 0; i < 12; i++) sum += +d[i] * w[i];
  return (11 - (sum % 11)) % 10 === +d[12];
}
const CENTURY = { 1: 1900, 2: 1900, 5: 1900, 6: 1900, 3: 2000, 4: 2000, 7: 2000, 8: 2000, 9: 1800, 0: 1800 };
export function birthFromRrn(rrn) {
  const m = String(rrn || "").match(/^(\d{2})(\d{2})(\d{2})-(\d)/);
  if (!m || !(m[4] in CENTURY)) return "";
  return `${CENTURY[m[4]] + +m[1]}-${m[2]}-${m[3]}`;
}

// row → { notes: 비고에 적을 사실, warn: 사람이 확인해야 할 점 }
export function checkRow(row) {
  const notes = [], warn = [...(row.ocrWarn || [])];
  const rrn = row.rrn || "", g = rrn[7], hasG = /\d/.test(g || "");
  if (row.dead) notes.push("사망");
  const foreign = hasG && "5678".includes(g);
  if (foreign || row.nation) notes.push(row.nation ? `외국인(${row.nation})` : "외국인");
  else if (/[A-Za-z]{2,}/.test(row.name || "")) notes.push("외국인 추정");
  if (!row.birth && !rrn) notes.push("생년월일·주민번호 없음");
  else if (!row.birth) notes.push("생년월일 없음");
  else if (!rrn) notes.push("주민번호 없음");
  if (rrn.includes("*")) notes.push("뒷자리 가려짐");
  if (!row.name) warn.push("이름 없음");
  if (row.src === "ocr" && !row.edited) { const d = nameDoubt(row.name); if (d.length) warn.push("이름 확인(" + d.join(", ") + ")"); }
  if (rrn && !/^\d{6}-[\d*]{7}$/.test(rrn)) warn.push("주민번호 형식");
  if (row.birth && !/^\d{4}-\d{2}-\d{2}$/.test(row.birth)) warn.push("생년월일 형식");
  if (row.birth && rrn) {
    if (row.birth.slice(2).replace(/-/g, "") !== rrn.slice(0, 6)) warn.push("생년월일과 주민번호 앞자리가 다름");
    else if (hasG && CENTURY[g] !== Math.floor(+row.birth.slice(0, 4) / 100) * 100) warn.push("출생 연도와 주민번호 뒷자리 첫 숫자가 안 맞음");
  }
  if (hasG && row.sex && (+g % 2 === 1 ? "남" : "여") !== row.sex) warn.push("성별과 주민번호가 안 맞음");
  if (hasG && !foreign && "1234".includes(g) && rrnChecksumOk(rrn) === false) {
    const b = row.birth || birthFromRrn(rrn);
    if (!b || b < "2020-10-01") warn.push("주민번호 검증번호 불일치");
  }
  if (row.rel && !RELS.includes(row.rel)) warn.push("구분 확인");
  if (!row.rel) warn.push("구분 없음");
  return { notes, warn: [...new Set(warn)] };
}

// 빈 칸 채우기 (문서에 없는 값을 주민번호로 보충)
export function fillRow(row) {
  const g = (row.rrn || "")[7];
  if (!row.sex && /\d/.test(g || "")) row.sex = +g % 2 === 1 ? "남" : "여";
  return row;
}

// ───────── 쪽별 줄 → 사람 묶음
// pages: [{ file, page, src, kind, rows }]
export function buildPeople(pages) {
  const people = [];
  let cur = null;
  for (const p of pages) {
    for (const r of p.rows) {
      const row = fillRow({ ...r, file: p.file, page: p.page, src: p.src });
      if (row.rel === "본인" || !cur || cur.file !== p.file) {
        cur = { file: p.file, page: p.page, src: p.src, kind: p.kind, rows: [], noSelf: row.rel !== "본인" };
        people.push(cur);
      }
      cur.rows.push(row);
    }
  }
  for (const p of people) { orderCheck(p); familyCheck(p); }
  return people;
}

// 증명서의 줄 순서는 본인 → 부 → 모 → (양부 → 양모) → 배우자 → 자녀. 어긋나거나 겹치면 구분을 잘못 읽었을 수 있다.
const RANK = { 본인: 0, 부: 1, 모: 2, 양부: 3, 양모: 4, 배우자: 5, 자녀: 6 };
function orderCheck(p) {
  const add = (r, msg) => { r.ocrWarn = [...new Set([...(r.ocrWarn || []), msg])]; };
  let prev = null;
  for (const r of p.rows) {
    if (!(r.rel in RANK)) continue;
    if (prev && (RANK[r.rel] < RANK[prev.rel] || (RANK[r.rel] === RANK[prev.rel] && r.rel !== "자녀"))) { add(r, "구분 순서·중복 확인"); add(prev, "구분 순서·중복 확인"); }
    prev = r;
  }
}

// 스캔으로 읽은 묶음: 가족끼리 성이 이어지는지 본다 (본인↔부, 자녀↔본인·배우자). 안 맞으면 오독일 수 있어 표시.
function familyCheck(p) {
  if (p.src !== "ocr") return;
  const kor = r => r && /^[가-힣]{2,4}$/.test(r.name || "");
  const self = p.rows.find(r => r.rel === "본인"), father = p.rows.find(r => r.rel === "부"), spouse = p.rows.find(r => r.rel === "배우자");
  const add = (r, msg) => { r.ocrWarn = [...(r.ocrWarn || []), msg]; };
  if (kor(self) && kor(father) && self.name[0] !== father.name[0]) add(self, "본인과 부의 성이 다름");
  for (const c of p.rows.filter(r => r.rel === "자녀")) {
    if (!kor(c)) continue;
    const parents = [self, spouse].filter(kor);
    if (parents.length && !parents.some(x => x.name[0] === c.name[0])) add(c, "자녀 성이 부모와 다름");
  }
}

export function maskRrn(rrn) {
  return /^\d{6}-\d/.test(rrn || "") ? rrn.slice(0, 8) + "******" : rrn || "";
}
