// 파일 먹이기 — 어떤 파일을 무엇으로 바꿀 수 있는지(규칙), 잠긴 보안 문서 감지, 그림 → PDF · AI
const { PDFDocument } = require("pdf-lib");

// 파일 첫머리(매직 넘버) — 확장자와 다르면 암호화(보안 문서 · DRM)된 것으로 본다
const MAGIC = {
  png: [[0x89, 0x50, 0x4e, 0x47]], jpg: [[0xff, 0xd8, 0xff]], jpeg: [[0xff, 0xd8, 0xff]],
  pdf: [[0x25, 0x50, 0x44, 0x46]],
  pptx: [[0x50, 0x4b]], docx: [[0x50, 0x4b]], xlsx: [[0x50, 0x4b]], hwpx: [[0x50, 0x4b]],
  ppt: [[0xd0, 0xcf, 0x11, 0xe0]], doc: [[0xd0, 0xcf, 0x11, 0xe0]], xls: [[0xd0, 0xcf, 0x11, 0xe0]], hwp: [[0xd0, 0xcf, 0x11, 0xe0]],
};
// 변환 규칙 — ready: 지금 되는 것, false 는 다음 단계에서 붙일 것
const RULES = {
  jpg: [{ to: "pdf", label: "PDF", ready: true }, { to: "ai", label: "AI", ready: true }],
  jpeg: [{ to: "pdf", label: "PDF", ready: true }, { to: "ai", label: "AI", ready: true }],
  png: [{ to: "pdf", label: "PDF", ready: true }, { to: "ai", label: "AI", ready: true }],
  ppt: [{ to: "pdf", label: "PDF", ready: false }], pptx: [{ to: "pdf", label: "PDF", ready: false }],
  pdf: [{ to: "pptx", label: "PPT", ready: false }, { to: "docx", label: "Word", ready: false }],
  doc: [{ to: "pdf", label: "PDF", ready: false }], docx: [{ to: "pdf", label: "PDF", ready: false }],
  hwp: [{ to: "pdf", label: "PDF", ready: false }], hwpx: [{ to: "pdf", label: "PDF", ready: false }],
};
const extOf = (name) => (/\.([a-z0-9]+)$/i.exec(String(name))?.[1] ?? "").toLowerCase();

/** 파일 살펴보기 — { ext, known, locked, targets } */
function inspect(name, head) {
  const ext = extOf(name);
  const sigs = MAGIC[ext];
  const known = !!sigs;
  // 암호화된 문서는 원래 형식의 첫머리가 아니다 (PDF 는 앞 1KB 안에 %PDF 가 있으면 정상)
  let locked = false;
  if (known) {
    const starts = (sig, off = 0) => sig.every((b, i) => head[off + i] === b);
    locked = !sigs.some((sig) => starts(sig));
    if (locked && ext === "pdf") { for (let i = 1; i < Math.min(head.length - 4, 1024); i++) if (starts(sigs[0], i)) { locked = false; break; } }
  }
  return { ext, known, locked, targets: RULES[ext] ?? [] };
}

/** 그림(JPG · PNG) → PDF. 한 쪽에 그림 크기 그대로. .ai 는 일러스트레이터가 여는 PDF 호환 형식으로 같은 내용 */
async function imageToPdf(buf, ext, onProgress = () => {}) {
  onProgress(10);
  const pdf = await PDFDocument.create();
  onProgress(30);
  const img = ext === "png" ? await pdf.embedPng(buf) : await pdf.embedJpg(buf);
  onProgress(65);
  const page = pdf.addPage([img.width * 0.75, img.height * 0.75]); // 96dpi 픽셀 → 포인트
  page.drawImage(img, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
  onProgress(85);
  const out = await pdf.save();
  onProgress(100);
  return Buffer.from(out);
}

async function convert(buf, name, to, onProgress) {
  const ext = extOf(name);
  const rule = (RULES[ext] ?? []).find((r) => r.to === to);
  if (!rule) throw new Error("이 파일은 그 형식으로 바꿀 수 없어요.");
  if (!rule.ready) throw new Error("이 변환은 다음 업데이트에서 지원할 예정이에요.");
  if (["jpg", "jpeg", "png"].includes(ext) && (to === "pdf" || to === "ai")) return imageToPdf(buf, ext, onProgress);
  throw new Error("아직 지원하지 않는 변환이에요.");
}

module.exports = { inspect, convert, imageToPdf, extOf, RULES };
