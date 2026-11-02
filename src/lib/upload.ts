// 파일 업로드 공용 헬퍼 — /api/media 로 올리고 저장 경로를 돌려준다.
//
// 주의: crypto.randomUUID() 는 보안 컨텍스트(https 또는 localhost)에서만 쓸 수 있다.
// 직원들은 http://<사내IP>:2222 로 접속하므로 그 환경에서는 undefined 라
// 호출하는 순간 TypeError 가 나면서 업로드가 통째로 실패했다. 그래서 직접 만든다.

/** 어디서든 동작하는 충돌 없는 짧은 ID */
export function uniqueId(): string {
  const rnd =
    typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function"
      ? Array.from(crypto.getRandomValues(new Uint8Array(8)))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")
      : Math.random().toString(16).slice(2, 18);
  return `${Date.now().toString(36)}-${rnd}`;
}

/** UTF-8 바이트 기준으로 자른다 (한글은 글자당 3바이트). */
function truncateBytes(text: string, maxBytes: number): string {
  const enc = new TextEncoder();
  if (enc.encode(text).length <= maxBytes) return text;
  let out = "";
  let used = 0;
  for (const ch of text) {
    const size = enc.encode(ch).length;
    if (used + size > maxBytes) break;
    out += ch;
    used += size;
  }
  return out;
}

/**
 * 서버·파일시스템이 거부하는 문자를 지운 안전한 파일명.
 * 경로 구분자·상위 경로·제어문자를 없애고, 길이는 글자 수가 아니라
 * 바이트 기준으로 줄인다. (리눅스 파일명 상한이 255바이트라
 * 한글 85자만 넘어도 저장이 실패한다.)
 */
export function safeFileName(name: string, maxBytes = 170): string {
  const cleaned = (name || "file")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/^\.+/, "")
    .trim();
  if (!cleaned) return "file";

  // 확장자는 지키면서 앞부분만 자른다
  const dot = cleaned.lastIndexOf(".");
  const ext = dot > 0 ? truncateBytes(cleaned.slice(dot), 12) : "";
  const stem = dot > 0 ? cleaned.slice(0, dot) : cleaned;
  const room = maxBytes - new TextEncoder().encode(ext).length;
  return (truncateBytes(stem, Math.max(room, 1)) || "file") + ext;
}

export const MAX_UPLOAD_BYTES = 300 * 1024 * 1024;

/**
 * 파일을 올리고 저장된 경로(prefix 아래의 상대 경로)를 돌려준다.
 * 실패하면 사람이 읽을 수 있는 이유를 담은 Error 를 던진다.
 */
export async function uploadFile(prefix: string, file: File): Promise<string> {
  if (!file.size) throw new Error("빈 파일은 올릴 수 없습니다.");
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`파일이 너무 큽니다. 300MB 이하로 올려주세요. (현재 ${(file.size / 1024 / 1024).toFixed(1)}MB)`);
  }

  const relative = `${uniqueId()}-${safeFileName(file.name)}`;
  const full = `${prefix}/${relative}`;

  let res: Response;
  try {
    res = await fetch(`/api/media?path=${encodeURIComponent(full)}`, {
      method: "POST",
      body: file,
      ...(file.type ? { headers: { "Content-Type": file.type } } : {}),
    });
  } catch {
    throw new Error("서버에 연결하지 못했습니다. 네트워크를 확인하고 다시 시도해주세요.");
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(detail?.trim() ? `업로드 실패 (${res.status}): ${detail.slice(0, 200)}` : `업로드 실패 (${res.status})`);
  }
  return relative;
}
