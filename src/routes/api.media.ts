import { createFileRoute } from "@tanstack/react-router";

// 작품 파일/썸네일 업로드 엔드포인트 — 파일 본문을 그대로 받아
// public/media/<경로> 에 저장한다 (XHR 업로드 진행률 지원을 위해 raw POST 사용).
export const Route = createFileRoute("/api/media")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const path = url.searchParams.get("path") ?? "";
        if (
          !path ||
          path.length > 500 ||
          path.includes("..") ||
          path.includes("\\") ||
          path.includes("\0") ||
          path.startsWith("/")
        ) {
          return new Response("잘못된 경로입니다.", { status: 400 });
        }

        const buf = Buffer.from(await request.arrayBuffer());
        if (buf.length === 0) return new Response("빈 파일입니다.", { status: 400 });
        if (buf.length > 300 * 1024 * 1024) {
          return new Response("파일이 너무 큽니다 (300MB 이하).", { status: 413 });
        }

        const { mkdirSync, writeFileSync } = await import("node:fs");
        const { join, dirname, normalize } = await import("node:path");
        const base = join(process.cwd(), "public", "media");
        const dest = normalize(join(base, path));
        if (!dest.startsWith(base)) return new Response("잘못된 경로입니다.", { status: 400 });
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, buf);
        return Response.json({ ok: true, url: `/media/${path}` });
      },
    },
  },
});
