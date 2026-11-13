// H Chat API 호출 — 호출 형식(경로 · 인증 헤더)은 설정에서 바꿀 수 있다.
//   azure : {base}/openai/deployments/{model}/chat/completions?api-version=...   헤더 api-key
//   openai: {base}/v1/chat/completions                                           헤더 Authorization: Bearer
const FORMATS = {
  azure: { path: "/openai/deployments/{model}/chat/completions?api-version=2024-10-21", header: "api-key", prefix: "" },
  openai: { path: "/v1/chat/completions", header: "Authorization", prefix: "Bearer " },
};
const DEFAULTS = { baseUrl: "https://internal-apigw-kr.hmg-corp.io/hchat-in/api", format: "azure", model: "gpt-4o-mini", path: "" };

function buildRequest(cfg, messages) {
  const f = FORMATS[cfg.format] ?? FORMATS.azure;
  const path = (cfg.path?.trim() || f.path).replaceAll("{model}", encodeURIComponent(cfg.model));
  const url = cfg.baseUrl.replace(/\/+$/, "") + (path.startsWith("/") ? path : `/${path}`);
  return {
    url,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json", [f.header]: f.prefix + cfg.apiKey },
      body: JSON.stringify({ model: cfg.model, messages, temperature: 0.6, max_tokens: 700 }),
    },
  };
}

/** 답 글자를 돌려준다. 실패하면 사람이 읽을 수 있는 이유로 Error */
async function chat(cfg, messages, fetchImpl = fetch) {
  if (!cfg.apiKey) throw new Error("API 키가 없어요. 설정에서 넣어 주세요.");
  const { url, init } = buildRequest(cfg, messages);
  let res;
  try { res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(60_000) }); }
  catch (e) { throw new Error(`H Chat 서버에 연결하지 못했어요. 사내망(또는 VPN) 연결을 확인해 주세요. (${e.cause?.code ?? e.name ?? e.message})`); }
  const text = await res.text();
  if (!res.ok) {
    const why = res.status === 401 || res.status === 403 ? "API 키가 맞지 않거나 권한이 없어요." : res.status === 404 ? "주소 또는 모델 이름이 맞지 않아요 (호출 형식 · 모델을 확인해 주세요)." : res.status === 429 ? "요청이 너무 많아요. 잠시 뒤 다시 해 주세요." : "H Chat 이 오류를 돌려줬어요.";
    throw new Error(`${why} [${res.status}] ${text.slice(0, 200)}`);
  }
  let j;
  try { j = JSON.parse(text); } catch { throw new Error(`H Chat 답을 읽지 못했어요: ${text.slice(0, 120)}`); }
  const out = j.choices?.[0]?.message?.content ?? j.content?.[0]?.text ?? j.output_text;
  if (typeof out !== "string") throw new Error(`H Chat 답 형식이 예상과 달라요: ${text.slice(0, 160)}`);
  return out.trim();
}

module.exports = { chat, buildRequest, FORMATS, DEFAULTS };
