// H Chat(사내 AI)로 증명서 그림을 읽는다 — 선택 기능. 켰을 때만, 스캔·캡처 "쪽 그림"을 H Chat에 보내 표를 그대로 옮겨 적게 한다.
//
// H Chat API 명세(사내 안내서)대로 부른다. Base URL = …/hchat-in/api
//   통신 확인        GET  {base}/v1/are-you-okay
//   OpenAI Chat      POST {base}/v3/openai/deployments/{model}/chat/completions   (AzureOpenAI 기반)
//   OpenAI Responses POST {base}/v3/openai/responses                              (GPT-5 시리즈)
//   Claude Messages  POST {base}/v3/claude/messages                               (VertexAI 기반)
//   Gemini           POST {base}/v3/models/{model}:generateContent                (VertexAI 기반, REST 키는 카멜 케이스)
//   머리글: Authorization: Bearer {키}  (+ 프로젝트 키일 때 X-Project-Id)
// 명세에 "원래 API와 다를 수 있다"고 적혀 있어, 요청이 400으로 거절되면 흔한 차이(토큰 수 이름 등)를 바꿔 한 번 더 시도한다.
import http from "node:http";
import https from "node:https";

export const DEFAULTS = {
  baseUrl: "https://internal-apigw-kr.hmg-corp.io/hchat-in/api",
  model: "claude-sonnet-5-5", // 주 판독 모델
  verifyModel: "gpt-5.5",     // 교차 확인 모델 (다른 회사 모델로 한 번 더 읽어 견준다). "" 이면 안 씀
  projectId: "", api: "auto", insecure: false,
};
export const MODELS = ["claude-sonnet-5-5", "claude-sonnet-5", "claude-sonnet-4-6", "claude-haiku-5-5", "claude-haiku-4-5", "gpt-5.5", "gpt-5.4", "gpt-6-sol", "gpt-6.1-sol", "gpt-5.6-terra", "gpt-5.4-mini", "gemini-3.1-pro-preview", "gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.5-flash"];

// ───────── 통신
export function request(url, { method = "POST", headers = {}, body, insecure = false, timeout = 180000 } = {}) {
  return new Promise((ok, bad) => {
    let u; try { u = new URL(url); } catch { bad(new Error("주소가 올바르지 않아요: " + url)); return; }
    const lib = u.protocol === "http:" ? http : https;
    const req = lib.request(u, { method, headers, rejectUnauthorized: !insecure, timeout }, res => {
      const chunks = []; res.on("data", c => chunks.push(c)); res.on("end", () => ok({ status: res.statusCode, text: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("timeout", () => req.destroy(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })));
    req.on("error", bad);
    if (body) req.write(body);
    req.end();
  });
}
export function netError(e) {
  const code = String(e?.code || e?.cause?.code || e?.message || e);
  if (/CERT|SELF_SIGNED|UNABLE_TO_VERIFY|ISSUER/.test(code)) return `사내 인증서 문제로 연결하지 못했어요 (${code}).`;
  if (/ETIMEDOUT|timeout/.test(code)) return "응답이 너무 오래 걸려 멈췄어요. 잠시 뒤 다시 해 보세요.";
  return `H Chat 서버에 연결하지 못했어요. 사내망(또는 VPN) 연결을 확인해 주세요. (${code})`;
}

// 사내 인증서를 이 PC가 믿지 못해 연결이 막히면, 검증 없이 한 번 더 시도하고 그 뒤로는 그렇게 쓴다 (안내서가 권하는 curl -k 와 같음).
const isCertError = e => /CERT|SELF_SIGNED|UNABLE_TO_VERIFY|ISSUER/.test(String(e?.code || e?.cause?.code || e?.message || ""));
async function send(cfg, url, opts) {
  try { return await request(url, { ...opts, insecure: !!cfg.insecure }); }
  catch (e) {
    if (cfg.insecure || !isCertError(e)) throw e;
    const r = await request(url, { ...opts, insecure: true });
    cfg.insecure = true; cfg.insecureAuto = true;
    return r;
  }
}

// ───────── 호출 형식들
const split = dataUrl => { const m = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || ""); return m ? { mime: m[1], b64: m[2] } : null; };
// variants: 400(요청 거절)일 때 차례로 바꿔 볼 요청 모양
const RECIPES = {
  responses: {
    path: () => "/v3/openai/responses", variants: [{ effort: "low" }, {}, { noMax: true }], // 글자 옮겨 적기는 긴 추론이 필요 없다 → 추론을 낮춰 빠르게
    body: (model, prompt, img, v) => ({ model, ...(v.effort ? { reasoning: { effort: v.effort } } : {}), ...(v.noMax ? {} : { max_output_tokens: v.maxTokens * 2 }), input: [{ role: "user", content: img ? [{ type: "input_text", text: prompt }, { type: "input_image", image_url: img }] : [{ type: "input_text", text: prompt }] }] }),
    text: j => (typeof j.output_text === "string" && j.output_text) || (Array.isArray(j.output) ? j.output.flatMap(o => o.content || []).map(p => p.text || "").join("") || undefined : undefined),
    tokens: j => j.usage?.total_tokens,
  },
  chat: {
    path: model => `/v3/openai/deployments/${encodeURIComponent(model)}/chat/completions`, variants: [{ tokKey: "max_completion_tokens" }, { tokKey: "max_tokens" }, { tokKey: "" }],
    body: (model, prompt, img, v) => ({ model, messages: [{ role: "user", content: img ? [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: img, detail: "high" } }] : prompt }], ...(v.tokKey ? { [v.tokKey]: v.tokKey === "max_tokens" ? v.maxTokens : v.maxTokens * 2 } : {}) }),
    text: j => { const c = j.choices?.[0]?.message?.content; return typeof c === "string" ? c : Array.isArray(c) ? c.map(p => p.text || "").join("") : undefined; },
    tokens: j => j.usage?.total_tokens,
  },
  messages: {
    path: () => "/v3/claude/messages", variants: [{}, { vertex: true }],
    body: (model, prompt, img, v) => { const s = split(img); return { model, max_tokens: v.maxTokens, ...(v.vertex ? { anthropic_version: "vertex-2023-10-16" } : {}), messages: [{ role: "user", content: s ? [{ type: "image", source: { type: "base64", media_type: s.mime, data: s.b64 } }, { type: "text", text: prompt }] : prompt }] }; },
    text: j => (Array.isArray(j.content) ? j.content.filter(p => p.type === "text").map(p => p.text).join("") : undefined),
    tokens: j => (j.usage ? (j.usage.input_tokens || 0) + (j.usage.output_tokens || 0) : undefined),
  },
  gemini: {
    path: model => `/v3/models/${encodeURIComponent(model)}:generateContent`, variants: [{}, { snake: true }],
    body: (model, prompt, img, v) => {
      const s = split(img), pic = s ? (v.snake ? { inline_data: { mime_type: s.mime, data: s.b64 } } : { inlineData: { mimeType: s.mime, data: s.b64 } }) : null;
      return { contents: [{ role: "user", parts: pic ? [{ text: prompt }, pic] : [{ text: prompt }] }], [v.snake ? "generation_config" : "generationConfig"]: v.snake ? { max_output_tokens: v.maxTokens * 2 } : { maxOutputTokens: v.maxTokens * 2 } };
    },
    text: j => j.candidates?.[0]?.content?.parts?.filter(p => !p.thought).map(p => p.text || "").join("") || undefined,
    tokens: j => j.usageMetadata?.totalTokenCount,
  },
};
// 모델 이름으로 형식을 고른다. (GPT-5 이상은 명세가 Responses API를 안내한다. 안 되면 Chat Completions)
export const orderFor = (model, api) => (api && api !== "auto" ? [api] : /^claude/i.test(model) ? ["messages"] : /^gemini/i.test(model) ? ["gemini"] : /^(gpt|o\d)/i.test(model) ? ["responses", "chat"] : ["chat", "responses", "messages", "gemini"]);
const working = new Map(); // 모델 → { recipe, variant }  (한 번 성공한 모양을 기억)

function headersFor(cfg) {
  const h = { "Content-Type": "application/json", Authorization: `Bearer ${cfg.key}` };
  if (cfg.projectId) h["X-Project-Id"] = cfg.projectId;
  return h;
}
const brief = t => String(t || "").replace(/\s+/g, " ").slice(0, 260);

/** 모델에 물어 답 글자를 받는다. { text, tokens, recipe }.  실패하면 시도 내역이 담긴 Error */
export async function ask(cfg, model, prompt, image, maxTokens = 4000) {
  if (!cfg.key) throw new Error("API 키가 없어요. 설정에서 넣어 주세요.");
  if (image && !split(image)) throw new Error("그림 형식이 올바르지 않아요.");
  const base = cfg.baseUrl.replace(/\/+$/, ""), tried = [];
  const known = working.get(model + "|" + base);
  const order = orderFor(model, cfg.api);
  if (known && order.includes(known.recipe)) { order.splice(order.indexOf(known.recipe), 1); order.unshift(known.recipe); }
  for (const name of order) {
    const R = RECIPES[name]; if (!R) continue;
    const start = known?.recipe === name ? known.variant : 0;
    for (let k = 0; k < R.variants.length; k++) {
      const vi = (start + k) % R.variants.length;
      let res;
      try { res = await send(cfg, base + R.path(model), { headers: headersFor(cfg), body: JSON.stringify(R.body(model, prompt, image, { maxTokens, ...R.variants[vi] })) }); }
      catch (e) { throw new Error(netError(e)); }
      if (res.status >= 200 && res.status < 300) {
        let j; try { j = JSON.parse(res.text); } catch { tried.push(`${name}: 답이 JSON이 아님 ${brief(res.text)}`); break; }
        const text = R.text(j);
        if (typeof text !== "string" || !text.trim()) { tried.push(`${name}: 답에 글이 없음 ${brief(res.text)}`); break; }
        working.set(model + "|" + base, { recipe: name, variant: vi });
        return { text: text.trim(), tokens: R.tokens(j) || 0, recipe: name };
      }
      if (res.status === 401 || res.status === 403) throw new Error(`API 키가 맞지 않거나 이 모델을 쓸 권한이 없어요. [${res.status}] ${brief(res.text)}`);
      if (res.status === 429) throw new Error(`요청이 너무 많거나 사용량 한도에 걸렸어요. 잠시 뒤 다시 해 주세요. [429] ${brief(res.text)}`);
      tried.push(`${name}${vi ? "#" + (vi + 1) : ""}: [${res.status}] ${brief(res.text)}`);
      if (res.status !== 400 && res.status !== 422) break; // 400(요청 모양 거절)일 때만 모양을 바꿔 다시
    }
  }
  throw new Error(`'${model}' 호출에 실패했어요. ${tried.join(" | ")}`);
}

export async function health(cfg) {
  try {
    const r = await send(cfg, cfg.baseUrl.replace(/\/+$/, "") + "/v1/are-you-okay", { method: "GET", timeout: 15000 });
    return { ok: r.status >= 200 && r.status < 300, detail: `[${r.status}] ${brief(r.text)}` + (cfg.insecureAuto ? " (사내 인증서를 확인하지 못해 검증 없이 연결했어요)" : "") };
  } catch (e) { return { ok: false, detail: netError(e) }; }
}

// ───────── 증명서 한 쪽 읽기
export const PAGE_PROMPT = `사내 인사 담당자가 직원이 제출한 서류를 엑셀로 옮기는 작업입니다. 그림 속 한국 "가족관계증명서"의 표를 보이는 그대로 옮겨 적으세요.

규칙 (가장 중요: 추측 금지)
- 글자와 숫자를 한 자씩 보고 그림에 있는 그대로 적습니다. 고치거나 채워 넣지 마세요.
- 읽을 수 없는 글자·숫자는 그 자리에 ? 를 적습니다. 그럴듯한 값을 지어내지 마세요.
- 주민등록번호는 "앞6자리-뒤7자리"입니다. 한 자리씩 확인하고, 별표(*)로 가려진 자리는 * 그대로 적습니다.
- 표에서 비어 있는 칸은 빈 문자열("")입니다. 주민등록번호로 생년월일을 만들거나 그 반대로 하지 마세요. 칸에 적힌 것만 적습니다.
- 표의 사람 줄을 위에서 아래 순서대로 빠짐없이 적습니다. "구분/성명/출생연월일…" 머리글 줄과 "상세내용(정정 등)" 표는 넣지 않습니다.
- 구분은 표에 적힌 낱말 그대로(본인, 부, 모, 양부, 양모, 배우자, 자녀).
- 성명에는 한글(또는 표기된) 이름만, 괄호 안 한자는 "한자"에 적습니다. 이름 옆 네모 안에 "사망"이 있으면 "사망": true.
- 바탕의 흐린 무늬 글자(대한민국 등)와 도장은 무시합니다.
- 가족관계증명서가 아니면 {"문서":"다른 문서","줄":[]} 만 답합니다.

아래 모양의 JSON 한 개만 답하세요. 설명이나 다른 말은 쓰지 마세요.
{"문서":"가족관계증명서","종류":"상세","줄":[{"구분":"본인","성명":"","한자":"","사망":false,"생년월일":"YYYY-MM-DD","주민등록번호":"","성별":"","본":""}]}`;

const s = v => (v == null ? "" : String(v).trim());
export function parsePageJson(text) {
  const t = String(text || ""), a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  let j; try { j = JSON.parse(t.slice(a, b + 1)); } catch { return null; }
  const list = Array.isArray(j["줄"]) ? j["줄"] : Array.isArray(j.rows) ? j.rows : null;
  if (!list) return null;
  return {
    cert: /가족관계/.test(s(j["문서"])) && list.length > 0, kind: (s(j["종류"]).match(/상세|일반|특정/) || [""])[0],
    rows: list.map(r => ({
      rel: s(r["구분"]), name: s(r["성명"]), hanja: s(r["한자"]), dead: r["사망"] === true || /^(true|예|사망)$/i.test(s(r["사망"])),
      birth: s(r["생년월일"]), rrn: s(r["주민등록번호"]), sex: s(r["성별"]), bon: s(r["본"]),
    })),
  };
}

export async function readPage(cfg, model, image) {
  const t0 = Date.now(), r = await ask(cfg, model, PAGE_PROMPT, image, 4000);
  const page = parsePageJson(r.text);
  if (!page) throw new Error(`'${model}' 답이 정해진 모양이 아니에요: ${brief(r.text)}`);
  return { ...page, tokens: r.tokens, model, recipe: r.recipe, ms: Date.now() - t0 };
}
