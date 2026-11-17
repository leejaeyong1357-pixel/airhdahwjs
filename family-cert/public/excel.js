// 사람 묶음 → 엑셀 파일 (ExcelJS, 브라우저 안에서 만듦)
import { checkRow, maskRrn } from "./parse.js";

export function remarkOf(row) {
  const { notes, warn } = checkRow(row);
  const parts = [...notes];
  if (warn.length && !row.confirmed) parts.push("확인 필요: " + warn.join(" / "));
  if (row.memo) parts.push(row.memo);
  return parts.join(", ");
}

// opt: { maskRrn, hanja, rels: Set }
export async function buildWorkbook(people, opt) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "가족관계증명서 정리 도구"; wb.created = new Date();
  const cols = [
    { h: "번호", w: 6, v: (r, p, i) => (r === p.rows[0] ? i + 1 : "") },
    { h: "구분", w: 9, v: r => r.rel },
    { h: "성명", w: 16, v: r => r.name },
    ...(opt.hanja ? [{ h: "한자", w: 12, v: r => r.hanja || "" }] : []),
    { h: "생년월일", w: 13, v: r => r.birth || "" },
    { h: "주민등록번호", w: 18, v: r => (opt.maskRrn ? maskRrn(r.rrn) : r.rrn || "") },
    { h: "성별", w: 6, v: r => r.sex || "" },
    ...(opt.hanja ? [{ h: "본", w: 8, v: r => r.bon || "" }] : []),
    { h: "비고", w: 44, v: r => remarkOf(r), left: true },
    { h: "파일", w: 30, v: r => r.file + (r.page > 1 ? ` (${r.page}쪽)` : ""), left: true },
  ];
  const thin = { style: "thin", color: { argb: "FFB8C2D6" } }, border = { top: thin, left: thin, bottom: thin, right: thin };
  const head = ws => {
    const row = ws.getRow(1); row.height = 24;
    row.eachCell(c => {
      c.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "맑은 고딕", size: 10 };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF16346C" } };
      c.alignment = { horizontal: "center", vertical: "middle" }; c.border = border;
    });
    ws.views = [{ state: "frozen", ySplit: 1 }];
  };
  const paint = (row, r, list, self) => {
    row.height = 20;
    row.eachCell({ includeEmpty: true }, (c, n) => {
      if (n > list.length) return;
      c.font = { name: "맑은 고딕", size: 10, bold: self && list[n - 1].h === "성명" };
      c.alignment = { horizontal: list[n - 1].left ? "left" : "center", vertical: "middle", wrapText: !!list[n - 1].left && list[n - 1].h === "비고" };
      c.border = border; c.numFmt = "@";
      if (self) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF1FB" } };
      if (list[n - 1].h === "비고" && /확인 필요/.test(String(c.value))) c.font = { ...c.font, color: { argb: "FFC62828" }, bold: true };
    });
  };
  const shown = p => p.rows.filter(r => r.rel === "본인" || !opt.rels || opt.rels.has(r.rel) || !["부", "모", "양부", "양모", "배우자", "자녀"].includes(r.rel));

  // ① 사람별 묶음 (사람 사이에 빈 줄)
  const ws = wb.addWorksheet("가족관계");
  ws.columns = cols.map(c => ({ width: c.w }));
  ws.addRow(cols.map(c => c.h)); head(ws);
  people.forEach((p, i) => {
    for (const r of shown(p)) paint(ws.addRow(cols.map(c => c.v(r, { rows: shown(p) }, i))), r, cols, r.rel === "본인");
    if (i < people.length - 1) ws.addRow([]);
  });

  // ② 한 줄 목록 (필터·정렬용)
  const cols2 = [{ h: "번호", w: 6, v: (r, p, i) => i + 1 }, { h: "본인", w: 14, v: (r, p) => (p.rows.find(x => x.rel === "본인") || {}).name || "" }, ...cols.slice(1)];
  const ws2 = wb.addWorksheet("목록(필터용)");
  ws2.columns = cols2.map(c => ({ width: c.w }));
  ws2.addRow(cols2.map(c => c.h)); head(ws2);
  people.forEach((p, i) => { for (const r of shown(p)) paint(ws2.addRow(cols2.map(c => c.v(r, p, i))), r, cols2, r.rel === "본인"); });
  ws2.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols2.length } };

  return wb.xlsx.writeBuffer();
}
