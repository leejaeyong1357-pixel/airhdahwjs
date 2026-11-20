// 두 번째 글자 인식 엔진: PaddleOCR 인식 모델(PP-OCRv4, 오픈소스)을 브라우저 안에서 돌린다 (ONNX Runtime Web).
// 숫자 칸(주민등록번호·출생일)을 한 번 더 읽어 기존 엔진과 대조하는 데 쓴다. 이 PC 안에서만 돌고 토큰을 쓰지 않는다.
// 모델이 한국어 글자는 모르므로(중국어·영문·숫자용) 이름 칸에는 쓰지 않는다.
let loading = null, sess = null, keys = null;

export function ppReady() {
  if (!loading) loading = (async () => {
    if (!window.ort) throw new Error("ort 없음");
    ort.env.wasm.wasmPaths = "/vendor/ort/"; ort.env.wasm.numThreads = 1; ort.env.wasm.proxy = false;
    const [txt, s] = await Promise.all([
      fetch("/vendor/ppocr/ppocr_keys_v1.txt").then(r => { if (!r.ok) throw new Error("사전 없음"); return r.text(); }),
      ort.InferenceSession.create("/vendor/ppocr/ch_PP-OCRv4_rec_infer.onnx", { executionProviders: ["wasm"] }),
    ]);
    keys = txt.split("\n"); if (keys[keys.length - 1] === "") keys.pop();
    sess = s;
    return true;
  })().catch(e => { console.warn("두 번째 인식 엔진을 켜지 못했어요 (기존 엔진만 사용):", e?.message || e); return false; });
  return loading;
}

// 한 줄짜리 그림(canvas) → { text, minP }.  엔진을 못 켰으면 null
export async function ppRead(canvas) {
  if (!(await ppReady())) return null;
  const H = 48, W = Math.max(16, Math.min(960, Math.round(canvas.width * H / canvas.height)));
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d", { willReadFrequently: true });
  x.fillStyle = "#fff"; x.fillRect(0, 0, W, H); x.imageSmoothingQuality = "high"; x.drawImage(canvas, 0, 0, W, H);
  const px = x.getImageData(0, 0, W, H).data, n = W * H, input = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) { // BGR 순서, -1~1 로 맞춤
    input[i] = (px[i * 4 + 2] / 255 - 0.5) / 0.5; input[n + i] = (px[i * 4 + 1] / 255 - 0.5) / 0.5; input[2 * n + i] = (px[i * 4] / 255 - 0.5) / 0.5;
  }
  const out = (await sess.run({ [sess.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, H, W]) }))[sess.outputNames[0]];
  const T = out.dims[1], C = out.dims[2], d = out.data;
  let text = "", prev = 0, minP = 1;
  for (let t = 0; t < T; t++) { // CTC: 칸마다 가장 높은 글자, 연속 중복·빈칸(0) 제거
    let bi = 0, bv = -1; const o = t * C;
    for (let k = 0; k < C; k++) if (d[o + k] > bv) { bv = d[o + k]; bi = k; }
    if (bi !== 0 && bi !== prev) { text += bi - 1 < keys.length ? keys[bi - 1] : " "; if (bv < minP) minP = bv; }
    prev = bi;
  }
  return { text, minP };
}
