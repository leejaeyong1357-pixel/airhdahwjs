// 파일 읽기 엔진: PDF/그림 → (글자 그대로 꺼내기 | 스캔 글자 인식) → 사람 줄
// 모든 처리는 이 브라우저 안에서만 한다. 어디로도 보내지 않는다.
import * as pdfjs from "/vendor/pdfjs/build/pdf.min.mjs";
import { RELS, tokensToLines, parseTextPage, pageInfo, normRel, parseBirth, parseRrn, parseSex, parseNameCell, parseLine, rrnChecksumOk, voteName } from "./parse.js";
import { toGray, binarize, lineMasks, estimateSkew, findRows, eraseLines, inkRatio, inkBox, looksMasked } from "./image.js";

pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/build/pdf.worker.min.mjs";
const OCR_LONG = 3508; // A4 300dpi 긴 변

// ───────── 글자 인식 일꾼 묶음
class OcrPool {
  constructor(n) { this.max = n; this.made = 0; this.idle = []; this.waiters = []; this.all = []; }
  async acquire() {
    if (this.idle.length) return this.idle.pop();
    if (this.made < this.max) {
      this.made++;
      const w = await Tesseract.createWorker("kor", 1, {
        workerPath: "/vendor/tesseract/worker.min.js", corePath: "/vendor/tesseract-core/", langPath: "/vendor/tessdata/",
        gzip: true, workerBlobURL: false,
      });
      w._p = ""; this.all.push(w);
      return w;
    }
    return new Promise(r => this.waiters.push(r));
  }
  release(w) { const next = this.waiters.shift(); if (next) next(w); else this.idle.push(w); }
  async use(fn) { const w = await this.acquire(); try { return await fn(w); } finally { this.release(w); } }
  async close() { await Promise.all(this.all.map(w => w.terminate().catch(() => {}))); this.all = []; this.idle = []; this.made = 0; }
}
let pool = null;
export function getPool() {
  if (!pool) pool = new OcrPool(Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1)));
  return pool;
}

async function ocr(w, canvas, psm, whitelist = "", blocks = false) {
  const key = psm + "|" + whitelist;
  if (w._p !== key) {
    await w.setParameters({ tessedit_pageseg_mode: String(psm), tessedit_char_whitelist: whitelist, preserve_interword_spaces: "1" });
    w._p = key;
  }
  const { data } = await w.recognize(canvas, {}, blocks ? { text: true, blocks: true } : { text: true });
  if (window.__fcDebug) window.__fcDebug.push({ psm, whitelist, text: data.text, conf: data.confidence, url: canvas.width < 1400 ? canvas.toDataURL() : "" });
  return data;
}

// ───────── 캔버스 도우미
function newCanvas(w, h) { const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
function rotated(src, deg) {
  const c = newCanvas(src.width, src.height), x = c.getContext("2d");
  x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
  x.translate(c.width / 2, c.height / 2); x.rotate(deg * Math.PI / 180); x.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}
// 잉크 마스크의 한 영역 → 흰 바탕 검은 글자 그림 (여백 포함)
function binCanvas(bin, w, b, pad = 16) {
  const bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1, c = newCanvas(bw + pad * 2, bh + pad * 2), x = c.getContext("2d");
  const img = x.createImageData(c.width, c.height); img.data.fill(255);
  for (let yy = 0; yy < bh; yy++) for (let xx = 0; xx < bw; xx++) if (bin[(b.y0 + yy) * w + b.x0 + xx]) {
    const i = ((yy + pad) * c.width + xx + pad) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = 0;
  }
  x.putImageData(img, 0, 0);
  return c;
}
// 같은 영역의 회색 그림 (선 자리는 종이색으로 덮음) — 두 번째 읽기용
function grayCanvas(gray, bin, clean, w, b, pad = 16, zoom = 1.25) {
  const bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1, c = newCanvas(bw + pad * 2, bh + pad * 2), x = c.getContext("2d");
  const img = x.createImageData(c.width, c.height); img.data.fill(255);
  let lo = 255; for (let yy = 0; yy < bh; yy++) for (let xx = 0; xx < bw; xx++) { const v = gray[(b.y0 + yy) * w + b.x0 + xx]; if (v < lo) lo = v; }
  const span = Math.max(40, 235 - lo);
  for (let yy = 0; yy < bh; yy++) for (let xx = 0; xx < bw; xx++) {
    const k = (b.y0 + yy) * w + b.x0 + xx;
    let v = bin[k] && !clean[k] ? 255 : Math.max(0, Math.min(255, Math.round((gray[k] - lo) * 255 / span)));
    const i = ((yy + pad) * c.width + xx + pad) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
  }
  x.putImageData(img, 0, 0);
  const z = newCanvas(c.width * zoom, c.height * zoom), zx = z.getContext("2d");
  zx.imageSmoothingQuality = "high"; zx.drawImage(c, 0, 0, z.width, z.height);
  return z;
}
// 한 글자만 있는 칸(부·모·남·여)은 글자 인식이 통째로 놓치기 쉬워, 같은 그림을 3번 이어 붙여 읽힌다
function tiled(c, n = 3) {
  const t = newCanvas(c.width * n, c.height), x = t.getContext("2d");
  x.fillStyle = "#fff"; x.fillRect(0, 0, t.width, t.height);
  for (let i = 0; i < n; i++) x.drawImage(c, i * c.width, 0);
  return t;
}
function cropUrl(src, x0, y0, x1, y1, maxW = 1000) {
  x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(src.width, Math.ceil(x1)); y1 = Math.min(src.height, Math.ceil(y1));
  const w = x1 - x0, h = y1 - y0; if (w < 4 || h < 4) return "";
  const s = Math.min(1, maxW / w), c = newCanvas(w * s, h * s), x = c.getContext("2d");
  x.imageSmoothingQuality = "high"; x.drawImage(src, x0, y0, w, h, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.82);
}

// ───────── 스캔 방식: 한 쪽 읽기
async function analyze(canvas) {
  const w = canvas.width, h = canvas.height;
  const gray = toGray(canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, w, h).data, w, h);
  const bin = binarize(gray, w, h);
  const { hm, vm } = lineMasks(bin, w, h, Math.round(w * 0.04), Math.round(w * 0.036));
  return { canvas, w, h, gray, bin, hm, vm };
}

// 생년월일과 주민번호가 서로 맞물리는지 (앞 6자리 일치 + 검증번호). 맞물리면 둘 다 제대로 읽은 것으로 본다.
const checkable = (birth, rrn) => /^\d{6}-\d{7}$/.test(rrn || "") && "1234".includes(rrn[7]) && (birth || "") < "2020-10-01"; // 검증번호로 확인되는 번호인가
const consistent = (birth, rrn) => !!birth && /^\d{6}-[\d*]{7}$/.test(rrn || "") && birth.slice(2).replace(/-/g, "") === rrn.slice(0, 6) && (!checkable(birth, rrn) || rrnChecksumOk(rrn) === true);

async function ocrPage(srcCanvas) {
  let a = await analyze(srcCanvas);
  const skew = estimateSkew(a.hm, a.w, a.h);
  if (Math.abs(skew) >= 0.12) a = await analyze(rotated(srcCanvas, -skew));
  const { w, h, gray, bin, hm, vm } = a;
  const clean = eraseLines(bin, hm, vm, w, h, 2);
  const bands = findRows(hm, vm, w, h);
  if (window.__fcDebug) window.__fcDebug.push({ skew, bands: bands.map(b => [b.y0, b.y1, b.est]) });
  const P = getPool();

  if (!bands.length) return P.use(wk => ocrPageLoose(wk, a, clean));

  return P.use(async wk => {
    // 1) 제목 확인 (표 위쪽 띠, 안 되면 아래쪽 띠)
    const stripText = async (y0, y1) => {
      y0 = Math.max(0, Math.round(y0)); y1 = Math.min(h - 1, Math.round(y1));
      if (y1 - y0 < 30) return "";
      const d = await ocr(wk, binCanvas(clean, w, { x0: 0, y0, x1: w - 1, y1 }, 0), 6);
      return d.text || "";
    };
    const top = await stripText(bands[0].y0 - h * 0.3, bands[0].y0 - 4);
    let info = pageInfo(top.split("\n").map(t => ({ text: t })));
    if (!info.title) {
      const bot = await stripText(bands[bands.length - 1].y1 + 4, bands[bands.length - 1].y1 + h * 0.2);
      const i2 = pageInfo((top + "\n" + bot).split("\n").map(t => ({ text: t })));
      info = { ...i2, kind: i2.kind || info.kind };
    }
    if (!info.title && info.other) return { isCert: false, rows: [], skipped: "다른 증명서" };

    // 2) 칸별로 읽기
    const cellBox = (band, k) => {
      const c = band.cells[k], inX = 4, inY = 3;
      const r = { x0: c.x0 + inX, y0: band.y0 + inY, x1: c.x1 - inX, y1: band.y1 - inY };
      if (r.x1 - r.x0 < 6 || r.y1 - r.y0 < 6) return null;
      if (inkRatio(clean, w, r.x0, r.y0, r.x1, r.y1) < 0.004) return null;
      const ib = inkBox(clean, w, r.x0, r.y0, r.x1, r.y1);
      return ib && ib.x1 - ib.x0 >= 4 && ib.y1 - ib.y0 >= 8 ? ib : null;
    };
    const A = b => binCanvas(clean, w, b), B = b => grayCanvas(gray, bin, clean, w, b), C = b => grayCanvas(gray, bin, clean, w, b, 16, 0.8);
    const items = bands.map(band => ({ band, box: [0, 1, 2, 3, 4, 5].map(k => cellBox(band, k)), t: {} }));

    let lastText = "";
    const short = async (b, wl, parse) => {
      const single = b.x1 - b.x0 < (b.y1 - b.y0) * 1.4;
      for (const mk of [A, B, C]) {
        const cv = mk(b); lastText = (await ocr(wk, single ? tiled(cv) : cv, 8, wl)).text;
        const v = parse(lastText);
        if (v) return v;
      }
      return "";
    };
    // 구분: 정확히 그 낱말로 읽힌 것만 받는다. 세 번 다 어긋나면 비슷한 것으로 채우되 확인 표시.
    const relExact = t => {
      const k = String(t || "").replace(/[^가-힣]/g, "");
      if (k === "구분" || RELS.includes(k)) return k;
      return k.length >= 2 && new Set(k).size === 1 && "부모".includes(k[0]) ? k[0] : "";
    };
    for (const it of items) {
      it.rel = it.box[0] ? await short(it.box[0], "구분본인부모배우자녀양", relExact) : "";
      if (it.box[0] && !it.rel) { it.rel = normRel(lastText); it.relWarn = true; }
    }
    const rows = items.filter(it => it.rel !== "구분" && (it.box[1] || it.box[2] || it.box[3]));
    for (const it of rows) if (it.box[2]) it.t.birthA = (await ocr(wk, A(it.box[2]), 7, "0123456789년월일")).text;
    for (const it of rows) if (it.box[3]) it.t.rrnA = (await ocr(wk, A(it.box[3]), 7, "0123456789-*")).text;
    for (const it of rows) { it.t.sex = it.box[4] ? await short(it.box[4], "남여", t => { const k = String(t || "").replace(/[^남여]/g, ""); return k && new Set(k).size === 1 ? k[0] : ""; }) : ""; it.sexWarn = !!it.box[4] && !it.t.sex; }
    for (const it of rows) {
      it.names = [];
      if (it.box[1]) for (const mk of [A, B, C]) it.names.push(parseNameCell((await ocr(wk, mk(it.box[1]), 7)).text, false));
    }

    const out = [];
    for (const it of rows) {
      const warn = [];
      const masked = it.box[3] ? looksMasked(clean, w, it.box[3]) : false;
      let birth = parseBirth(it.t.birthA, true), rr = parseRrn(it.t.rrnA, masked), rrn = rr.value;
      // 숫자 다시 읽기: 생년월일↔주민번호가 서로 안 맞거나, 대조할 짝이 없을 때
      if ((it.box[2] || it.box[3]) && !consistent(birth, rrn)) {
        const birthB = it.box[2] ? parseBirth((await ocr(wk, B(it.box[2]), 7, "0123456789년월일")).text, true) : "";
        const rrB = it.box[3] ? parseRrn((await ocr(wk, B(it.box[3]), 7, "0123456789-*")).text, masked) : { value: "", odd: false };
        const pick = [[birth, rrn], [birthB, rrn], [birth, rrB.value], [birthB, rrB.value]].find(([b, r]) => consistent(b, r));
        if (pick) { [birth, rrn] = pick; if (rrn === rrB.value) rr = rrB; }
        else {
          if (it.box[2] && birthB !== birth) { warn.push("생년월일을 두 번 읽은 값이 다름"); birth = birth || birthB; }
          if (it.box[3] && rrB.value !== rrn) { warn.push("주민번호를 두 번 읽은 값이 다름"); if (!rrn || (rr.odd && !rrB.odd)) { rrn = rrB.value; rr = rrB; } }
        }
      }
      // 검증번호로 확인할 수 없는 번호(가려진 번호·2020.10 이후 출생·외국인)는 뒷자리를 한 번 더 읽어 견준다
      if (it.box[3] && /^\d{6}-[\d*]{7}$/.test(rrn) && !checkable(birth, rrn) && !warn.length) {
        const again = parseRrn((await ocr(wk, B(it.box[3]), 7, "0123456789-*")).text, masked).value;
        if (again !== rrn) warn.push("주민번호 뒷자리를 두 번 읽은 값이 다름"); // (숫자는 비고에 적지 않는다 — 가리기 옵션과 무관하게 새지 않도록)
      }
      // 뒷자리 첫 숫자가 5~8(외국인)인데 본(本) 칸에 글자가 있으면 1~4를 잘못 읽었을 수 있다
      if (/^\d{6}-[5-8]/.test(rrn) && it.box[5]) warn.push("외국인 번호(뒷자리 첫 숫자)인데 본이 있음");
      if (it.band.est) warn.push("표 선이 흐려 줄 위치를 추정함");
      if (it.relWarn) warn.push("구분 글자가 흐림");
      if (it.sexWarn) warn.push("성별을 읽지 못함");
      if (it.box[2] && !birth) warn.push("생년월일을 읽지 못함");
      if (it.box[3] && !rrn) warn.push("주민번호를 읽지 못함");
      if (rr.odd) warn.push("주민번호 자릿수");
      const v = voteName(it.names);
      if (it.box[1] && v.agree !== "all") warn.push(`이름을 읽을 때마다 다름(${v.seen.join(" / ")})`);
      if (v.deadSplit) warn.push("사망 표시 확인");
      if (it.names.length && it.names.every(n => n.odd)) warn.push("이름 옆 표시");
      const nm = v, nA = v, nB = { dead: false };
      const band = it.band;
      out.push({
        rel: it.rel, name: nm.name, hanja: "", dead: nA.dead || nB.dead, birth, rrn, sex: it.t.sex, bon: "",
        ocrWarn: warn, crop: cropUrl(a.canvas, band.cells[0].x0 - 8, band.y0 - 6, band.cells[5].x1 + 8, band.y1 + 6),
      });
    }
    const pageWarn = info.title ? "" : "제목을 읽지 못함";
    const data = out.filter(r => (r.name || r.birth || r.rrn) && r.name !== "성명"); // "성 명"은 머리글 줄
    return { isCert: data.some(r => r.name), kind: info.kind, rows: data, pageWarn };
  });
}

// 표 선을 못 찾은 쪽: 쪽 전체를 줄 단위로 읽는다 (덜 정확 — 모두 확인 표시)
async function ocrPageLoose(wk, a, clean) {
  const { w, h } = a;
  const d = await ocr(wk, binCanvas(clean, w, { x0: 0, y0: 0, x1: w - 1, y1: h - 1 }, 0), 6, "", true);
  const tokens = [];
  for (const b of d.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) for (const wd of l.words || [])
    tokens.push({ text: wd.text, x0: wd.bbox.x0, y0: wd.bbox.y0, x1: wd.bbox.x1, y1: wd.bbox.y1 });
  const lines = tokensToLines(tokens), info = pageInfo(lines), rows = [];
  if (!info.title) return { isCert: false, rows: [] };
  for (const L of lines) {
    const r = parseLine(L.text.replace(/[\[\]]/g, " "));
    if (!r) continue;
    rows.push({ ...r, hanja: "", bon: "", ocrWarn: [...(r.ocrWarn || []), "표 선을 못 찾아 줄 단위로 읽음"], crop: cropUrl(a.canvas, w * 0.04, L.y0 - 14, w * 0.96, L.y1 + 14) });
  }
  return { isCert: rows.some(r => r.rel === "본인"), kind: info.kind, rows };
}

// ───────── PDF
const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
// 쪽 전체를 덮는 그림이 있으면 스캔본으로 본다 (글자 정보가 있어도 믿지 않음)
async function hasFullPageImage(page) {
  try {
    const ops = await page.getOperatorList(), O = pdfjs.OPS, [x0, y0, x1, y1] = page.view, pw = x1 - x0, ph = y1 - y0;
    let ctm = [1, 0, 0, 1, 0, 0]; const st = [];
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i], ar = ops.argsArray[i];
      if (fn === O.save) st.push(ctm);
      else if (fn === O.restore) ctm = st.pop() || ctm;
      else if (fn === O.transform) ctm = mul(ctm, ar);
      else if (fn === O.paintFormXObjectBegin) { st.push(ctm); if (ar && ar[0]) ctm = mul(ctm, ar[0]); }
      else if (fn === O.paintFormXObjectEnd) ctm = st.pop() || ctm;
      else if (fn === O.paintImageXObject || fn === O.paintInlineImageXObject || fn === O.paintImageXObjectRepeat) {
        const xs = [ctm[4], ctm[0] + ctm[4], ctm[2] + ctm[4], ctm[0] + ctm[2] + ctm[4]], ys = [ctm[5], ctm[1] + ctm[5], ctm[3] + ctm[5], ctm[1] + ctm[3] + ctm[5]];
        const iw = Math.max(...xs) - Math.min(...xs), ih = Math.max(...ys) - Math.min(...ys);
        if (iw >= pw * 0.8 && ih >= ph * 0.8) return true;
      }
    }
  } catch { /* 판별 실패 → 글자 정보 기준으로 */ }
  return false;
}

async function renderPage(page, scale) {
  const vp = page.getViewport({ scale }), c = newCanvas(vp.width, vp.height), x = c.getContext("2d", { willReadFrequently: true });
  x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: x, viewport: vp }).promise;
  return { canvas: c, vp };
}

async function readPdfPage(page, mode) {
  const base = page.getViewport({ scale: 1 });
  if (mode !== "ocr") {
    const tc = await page.getTextContent();
    const hangul = tc.items.reduce((n, it) => n + (it.str.match(/[가-힣]/g) || []).length, 0);
    if (hangul >= 20 && !(await hasFullPageImage(page))) {
      const scale = 2, vp = page.getViewport({ scale });
      const tokens = tc.items.filter(it => it.str.trim()).map(it => {
        const tx = pdfjs.Util.transform(vp.transform, it.transform), hh = Math.hypot(tx[2], tx[3]);
        return { text: it.str, x0: tx[4], x1: tx[4] + it.width * scale, y0: tx[5] - hh, y1: tx[5] };
      });
      const lines = tokensToLines(tokens), res = parseTextPage(lines);
      if (res.isCert) {
        const { canvas } = await renderPage(page, scale);
        const xs0 = Math.min(...res.rows.map(r => r.box.x0)), xs1 = Math.max(...res.rows.map(r => r.box.x1));
        for (const r of res.rows) { r.crop = cropUrl(canvas, xs0 - 30, r.box.y0 - 12, xs1 + 30, r.box.y1 + 12); delete r.box; }
        return { ...res, src: "text" };
      }
      // 글자는 멀쩡히 읽히는데 가족관계증명서 제목이 없음 → 다른 서류로 보고 건너뜀
      if (!res.title) return { isCert: false, rows: [], src: "text", skipped: "다른 서류" };
      // 제목은 있는데 표를 못 읽음 → 아래 스캔 방식으로 다시 읽는다
    }
  }
  const scale = Math.min(5, OCR_LONG / Math.max(base.width, base.height));
  const { canvas } = await renderPage(page, scale);
  return { ...(await ocrPage(canvas)), src: "ocr" };
}

// ───────── 바깥에서 부르는 함수
// file → { pages: [{ file, page, src, kind, rows, pageWarn }], total, skipped, error }
export async function readFile(file, mode, onProgress = () => {}) {
  const name = file.name, out = { pages: [], total: 0, skipped: 0, error: "" };
  const isPdf = /\.pdf$/i.test(name) || file.type === "application/pdf";
  try {
    if (!isPdf) {
      const bmp = await createImageBitmap(file), s = OCR_LONG / Math.max(bmp.width, bmp.height) * (bmp.width > bmp.height ? 0.72 : 1);
      const c = newCanvas(bmp.width * s, bmp.height * s), x = c.getContext("2d", { willReadFrequently: true });
      x.imageSmoothingQuality = "high"; x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(bmp, 0, 0, c.width, c.height);
      out.total = 1; onProgress(0, 1);
      const r = await ocrPage(c);
      if (r.isCert) out.pages.push({ file: name, page: 1, src: "ocr", kind: r.kind, rows: r.rows, pageWarn: r.pageWarn || "" }); else out.skipped++;
      onProgress(1, 1);
      return out;
    }
    const data = new Uint8Array(await file.arrayBuffer());
    if (String.fromCharCode(...data.slice(0, 1024)).indexOf("%PDF") < 0) { out.error = "PDF 형식이 아니에요. 보안(DRM)이 걸린 파일이면 보안을 해제한 뒤 다시 넣어 주세요."; return out; }
    let doc;
    try {
      doc = await pdfjs.getDocument({ data, cMapUrl: "/vendor/pdfjs/cmaps/", cMapPacked: true, standardFontDataUrl: "/vendor/pdfjs/standard_fonts/", isEvalSupported: false }).promise;
    } catch (e) {
      out.error = e?.name === "PasswordException" ? "암호가 걸린 PDF예요. 암호를 풀어서 다시 넣어 주세요." : "PDF를 열 수 없어요. 보안(DRM)이 걸렸거나 손상된 파일일 수 있어요.";
      return out;
    }
    out.total = doc.numPages; let done = 0; onProgress(0, out.total);
    const results = new Array(doc.numPages);
    let next = 1;
    const runner = async () => {
      while (next <= doc.numPages) {
        const n = next++;
        try {
          const page = await doc.getPage(n);
          results[n - 1] = await readPdfPage(page, mode);
          page.cleanup();
        } catch (e) { console.error(e); results[n - 1] = { isCert: false, rows: [], failed: true }; }
        onProgress(++done, out.total);
      }
    };
    await Promise.all(Array.from({ length: Math.min(getPool().max, doc.numPages) }, runner));
    results.forEach((r, i) => {
      if (r?.isCert && r.rows.length) out.pages.push({ file: name, page: i + 1, src: r.src, kind: r.kind, rows: r.rows, pageWarn: r.pageWarn || "" });
      else out.skipped++;
      if (r?.failed) out.failedPages = (out.failedPages || 0) + 1;
    });
    await doc.destroy();
  } catch (e) {
    console.error(e);
    out.error = "읽는 중 문제가 생겼어요: " + (e?.message || e);
  }
  return out;
}
