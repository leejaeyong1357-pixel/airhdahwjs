// H Chat(사내 AI) 보조 판독 — 선택 기능. 켰을 때만, 표의 "한 줄 그림"을 H Chat에 보내 다시 읽게 한다.
// 호출 형식은 AX 버디와 같다.
//   azure : {base}/openai/deployments/{model}/chat/completions?api-version=...   헤더 api-key
//   openai: {base}/v1/chat/completions                                           헤더 Authorization: Bearer
export const FORMATS = {
  azure: { path: "/openai/deployments/{model}/chat/completions?api-version=2024-10-21", header: "api-key", prefix: "" },
  openai: { path: "/v1/chat/completions", header: "Authorization", prefix: "Bearer " },
};
export const DEFAULTS = { baseUrl: "https://internal-apigw-kr.hmg-corp.io/hchat-in/api", format: "azure", model: "gpt-4o-mini", path: "" };

export function buildRequest(cfg, messages, maxTokens = 300) {
  const f = FORMATS[cfg.format] ?? FORMATS.azure;
  const p = (cfg.path?.trim() || f.path).replaceAll("{model}", encodeURIComponent(cfg.model));
  return {
    url: cfg.baseUrl.replace(/\/+$/, "") + (p.startsWith("/") ? p : `/${p}`),
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json", [f.header]: f.prefix + cfg.key },
      body: JSON.stringify({ model: cfg.model, messages, temperature: 0, max_tokens: maxTokens }),
    },
  };
}

/** 답 글자를 돌려준다. 실패하면 사람이 읽을 수 있는 이유로 Error */
export async function chat(cfg, messages, maxTokens) {
  if (!cfg.key) throw new Error("API 키가 없어요. 설정에서 넣어 주세요.");
  const { url, init } = buildRequest(cfg, messages, maxTokens);
  let res;
  try { res = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) }); }
  catch (e) {
    const code = e.cause?.code ?? e.name ?? e.message;
    if (/CERT|SELF_SIGNED|UNABLE_TO_VERIFY/.test(String(code))) throw new Error(`사내 인증서를 확인하지 못했어요. start.cmd 로 실행했는지, Node.js 가 22.15 이상인지 확인해 주세요. (${code})`);
    throw new Error(`H Chat 서버에 연결하지 못했어요. 사내망(또는 VPN) 연결을 확인해 주세요. (${code})`);
  }
  const text = await res.text();
  if (!res.ok) {
    const why = res.status === 401 || res.status === 403 ? "API 키가 맞지 않거나 권한이 없어요." : res.status === 404 ? "주소 또는 모델 이름이 맞지 않아요 (호출 형식 · 모델을 확인해 주세요)." : res.status === 429 ? "요청이 너무 많아요. 잠시 뒤 다시 해 주세요." : res.status === 400 ? "H Chat 이 요청을 받지 않았어요 (이 모델이 그림을 못 읽는 모델일 수 있어요)." : "H Chat 이 오류를 돌려줬어요.";
    throw new Error(`${why} [${res.status}] ${text.slice(0, 200)}`);
  }
  let j;
  try { j = JSON.parse(text); } catch { throw new Error(`H Chat 답을 읽지 못했어요: ${text.slice(0, 120)}`); }
  const out = j.choices?.[0]?.message?.content ?? j.content?.[0]?.text ?? j.output_text;
  if (typeof out !== "string") throw new Error(`H Chat 답 형식이 예상과 달라요: ${text.slice(0, 160)}`);
  return { text: out.trim(), tokens: j.usage?.total_tokens ?? 0 };
}

export const ROW_PROMPT = `그림은 한국 가족관계증명서 표에서 잘라낸 "한 줄"입니다.
칸은 왼쪽부터 구분 / 성명 / 출생연월일 / 주민등록번호 / 성별 / 본 입니다.
- 성명 칸에는 한글 이름 뒤에 괄호 안 한자가 있을 수 있고, 네모 안에 "사망" 표시가 있을 수 있습니다.
- 보이는 그대로만 옮기세요. 추측하거나 채워 넣지 마세요. 빈 칸은 빈 문자열("")입니다.
- 주민등록번호의 별표(*)는 별표 그대로 적으세요. 숫자는 한 자리씩 확인하세요.
아래 JSON 한 개만 답하세요. 다른 말은 쓰지 마세요.
{"구분":"","성명":"","한자":"","사망":false,"생년월일":"YYYY-MM-DD","주민등록번호":"","성별":"","본":""}`;

// 답에서 JSON을 꺼내 영문 키로 바꾼다. 못 꺼내면 null
export function parseAiJson(text) {
  const a = String(text || "").indexOf("{"), b = String(text || "").lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  let j;
  try { j = JSON.parse(text.slice(a, b + 1)); } catch { return null; }
  const s = v => (v == null ? "" : String(v).trim());
  return {
    rel: s(j["구분"]), name: s(j["성명"]), hanja: s(j["한자"]), dead: j["사망"] === true || /^(true|예|사망)$/i.test(s(j["사망"])),
    birth: s(j["생년월일"]), rrn: s(j["주민등록번호"]), sex: s(j["성별"]), bon: s(j["본"]),
  };
}

export async function readRow(cfg, dataUrl) {
  if (!/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(dataUrl || "")) throw new Error("그림 형식이 올바르지 않아요.");
  const r = await chat(cfg, [{ role: "user", content: [{ type: "text", text: ROW_PROMPT }, { type: "image_url", image_url: { url: dataUrl, detail: "high" } }] }], 300);
  const row = parseAiJson(r.text);
  if (!row) throw new Error(`H Chat 답이 정해진 모양이 아니에요: ${r.text.slice(0, 100)}`);
  return { row, tokens: r.tokens };
}

export async function ping(cfg) {
  const r = await chat(cfg, [{ role: "user", content: "연결 확인입니다. '확인'이라고만 답하세요." }], 20);
  return r.text;
}
