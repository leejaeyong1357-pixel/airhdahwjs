// 일정 — 한국어 문장에서 날짜 · 시각 · 제목을 뽑고, 알림 시각을 계산한다 (인터넷 없이 동작)
const PRE_MIN = 10; // 몇 분 전에 미리 알릴지
const DOW = "일월화수목금토";

/** "오늘 11시에 회의" → { title, at(Date), assumed: [가정한 내용] } / 일정 문장이 아니면 null */
function parseKorean(text, now = new Date()) {
  let s = ` ${String(text).trim()} `;
  if (!s.trim() || /[?？]\s*$/.test(s.trim()) || /몇\s*시|언제/.test(s)) return null;
  const assumed = [];
  const cut = (re) => { const m = re.exec(s); if (m) s = s.replace(m[0], " "); return m; };

  // 1) "30분 뒤", "2시간 후"
  let at = null;
  const rel = cut(/(\d+)\s*(분|시간)\s*(뒤|후|있다가|이따가)(에)?/);
  if (rel) at = new Date(now.getTime() + Number(rel[1]) * (rel[2] === "분" ? 60_000 : 3_600_000));

  // 2) 날짜
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let dayGiven = false;
  let m;
  if ((m = cut(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/))) { day.setMonth(Number(m[1]) - 1, Number(m[2])); if (day < new Date(now.getFullYear(), now.getMonth(), now.getDate())) day.setFullYear(day.getFullYear() + 1); dayGiven = true; }
  else if ((m = cut(/(\d{1,2})\s*\/\s*(\d{1,2})(?!\s*\d)/))) { day.setMonth(Number(m[1]) - 1, Number(m[2])); dayGiven = true; }
  else if (cut(/오늘/)) dayGiven = true;
  else if (cut(/내일\s*모레|모레/)) { day.setDate(day.getDate() + 2); dayGiven = true; }
  else if (cut(/내일|낼/)) { day.setDate(day.getDate() + 1); dayGiven = true; }
  else if ((m = cut(/(이번\s*주|다음\s*주|담주)?\s*([일월화수목금토])요일/))) {
    const want = DOW.indexOf(m[2]);
    let add = (want - day.getDay() + 7) % 7;
    if (m[1] && /다음|담/.test(m[1])) add += add === 0 ? 7 : (want <= day.getDay() ? 0 : 7);
    day.setDate(day.getDate() + add);
    dayGiven = true;
  }

  // 3) 시각
  if (!at) {
    let h = null, min = 0, mer = null;
    if ((m = cut(/(오전|오후|아침|저녁|밤|낮|새벽)?\s*(\d{1,2})\s*시\s*(?:(\d{1,2})\s*분|(반))?/))) { mer = m[1] ?? null; h = Number(m[2]); min = m[4] ? 30 : Number(m[3] ?? 0); }
    else if ((m = cut(/(오전|오후|아침|저녁|밤|낮|새벽)?\s*(\d{1,2}):(\d{2})/))) { mer = m[1] ?? null; h = Number(m[2]); min = Number(m[3]); }
    else if (cut(/정오/)) { h = 12; mer = "낮"; }
    else if (cut(/자정/)) { h = 0; mer = "밤"; day.setDate(day.getDate() + 1); }
    if (h == null || h > 24 || min > 59) return null;
    if (mer) {
      if (/오후|저녁|밤|낮/.test(mer) && h < 12) h += 12;
      if (/오전|아침|새벽/.test(mer) && h === 12) h = 0;
    } else if (h >= 1 && h <= 6) { h += 12; assumed.push("오후로 이해했어요"); }  // "3시" → 보통 오후 3시
    at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, min, 0, 0);
    if (!dayGiven && at <= now) { at.setDate(at.getDate() + 1); assumed.push("이미 지난 시각이라 내일로 잡았어요"); }
    else if (dayGiven && at <= now) return { error: "이미 지난 시각이에요. 날짜나 시각을 다시 알려 주세요." };
  }

  // 4) 제목 — 남은 말에서 조사 · 끝말을 떼어 낸다
  let title = s.replace(/\s+/g, " ").trim()
    .replace(/^(에|에는|부터|쯤|쯤에)\s+/, "")
    .replace(/\s*(이라고|라고|있어요?|있음|있습니다|이야|야|이에요|예요|입니다|임|잡아\s*줘|등록해\s*줘|알려\s*줘|알림(해\s*줘)?|해\s*줘|요)\s*[.!~]*$/, "")
    .replace(/^(에|에는|부터)\s*/, "").replace(/[.!~]+$/, "").trim();
  if (!title) title = "일정";
  return { title, at, assumed };
}

/** 사람이 읽는 시각 — "오늘 오전 11:00", "내일 오후 2:30", "11월 20일(금) 오전 9:00" */
function fmtWhen(at, now = new Date()) {
  const d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const d1 = new Date(at.getFullYear(), at.getMonth(), at.getDate());
  const diff = Math.round((d1 - d0) / 86_400_000);
  const dayTxt = diff === 0 ? "오늘" : diff === 1 ? "내일" : diff === 2 ? "모레" : `${at.getMonth() + 1}월 ${at.getDate()}일(${DOW[at.getDay()]})`;
  const h = at.getHours(), mm = String(at.getMinutes()).padStart(2, "0");
  return `${dayTxt} ${h < 12 ? "오전" : "오후"} ${h % 12 === 0 ? 12 : h % 12}:${mm}`;
}

/** 마지막 글자에 받침이 있나 (회의 → 예요, 미팅 → 이에요) */
function endsWithBatchim(word) {
  const c = String(word).trim().at(-1)?.charCodeAt(0) ?? 0;
  return c >= 0xac00 && c <= 0xd7a3 ? (c - 0xac00) % 28 !== 0 : /[0-9a-z]$/i.test(String(word)) ? /[0136-8lmnr]$/i.test(String(word)) : false;
}

/** 지금 울려야 할 알림을 고르고 울린 표시를 남긴다. events: [{id,title,at(ISO),pre,done}] */
function dueAlarms(events, now = new Date()) {
  const out = [];
  for (const e of events) {
    const at = new Date(e.at), left = at - now;
    if (!e.done && left <= 0) {
      // 프로그램이 꺼져 있다가 1시간 넘게 지난 일정은 조용히 넘긴다
      if (left > -3_600_000) out.push({ kind: "now", event: e, text: `지금 ${e.title} 시간이에요!` });
      e.done = true; e.pre = true;
    } else if (!e.pre && left <= PRE_MIN * 60_000) {
      const min = Math.max(1, Math.round(left / 60_000));
      out.push({ kind: "pre", event: e, text: `이제 곧 ${e.title}${endsWithBatchim(e.title) ? "이에요" : "예요"}! (${min}분 전)` });
      e.pre = true;
    }
  }
  return out;
}

module.exports = { parseKorean, fmtWhen, dueAlarms, PRE_MIN };
