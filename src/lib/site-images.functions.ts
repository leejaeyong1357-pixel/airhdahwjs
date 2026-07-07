import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * 사이트 이미지 교체 — 관리자 [사진 관리] 탭에서 업로드하면
 * public/uploads/<슬롯>.png 로 저장되고, 페이지들은 그 파일이 있으면
 * 기본(번들) 이미지 대신 사용한다. 재빌드 없이 즉시 반영된다.
 */

export const SITE_IMAGE_SLOTS = [
  { slot: "hero", label: "메인 AI 헤드 이미지" },
  { slot: "prize-1", label: "경품 — 1등 대상" },
  { slot: "prize-2", label: "경품 — 2등 최우수상" },
  { slot: "prize-3", label: "경품 — 3등 우수상" },
  { slot: "news-1", label: "기사 1 — 바이브 코딩" },
  { slot: "news-2", label: "기사 2 — 젠슨 황" },
  { slot: "news-3", label: "기사 3 — AI 시대 독서" },
  { slot: "news-4", label: "기사 4 — AI 에이전트" },
  { slot: "news-5", label: "기사 5 — 메타 AI 안경" },
] as const;

const slotNames = SITE_IMAGE_SLOTS.map((s) => s.slot) as unknown as [string, ...string[]];

export const uploadSiteImage = createServerFn({ method: "POST" })
  .inputValidator((d: { slot: string; dataUrl: string }) => {
    return z
      .object({
        slot: z.enum(slotNames),
        dataUrl: z.string().regex(/^data:image\/(png|jpe?g|webp|gif);base64,/, "이미지 파일만 업로드할 수 있습니다."),
      })
      .parse(d);
  })
  .handler(async ({ data }) => {
    const base64 = data.dataUrl.slice(data.dataUrl.indexOf(",") + 1);
    const bytes = Buffer.from(base64, "base64");
    if (bytes.length > 10 * 1024 * 1024) throw new Error("이미지가 너무 큽니다 (10MB 이하).");

    const { mkdirSync, writeFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const dir = join(process.cwd(), "public", "uploads");
    mkdirSync(dir, { recursive: true });
    // 확장자는 .png 로 통일해 저장 — 브라우저는 <img>에서 실제 포맷을 스니핑하므로 문제없다.
    writeFileSync(join(dir, `${data.slot}.png`), bytes);
    return { ok: true, slot: data.slot };
  });
