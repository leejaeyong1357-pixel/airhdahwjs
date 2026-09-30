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

        try {
          mkdirSync(dirname(dest), { recursive: true });
          writeFileSync(dest, buf);
        } catch (err: any) {
          // 파일명이 너무 길거나(ENAMETOOLONG) 디스크가 꽉 찬 경우 등 —
          // 500 HTML 페이지 대신 사람이 읽을 수 있는 이유를 돌려준다.
          const reason =
            err?.code === "ENAMETOOLONG"
              ? "파일 이름이 너무 깁니다. 이름을 줄여서 다시 올려주세요."
              : err?.code === "ENOSPC"
                ? "서버 저장 공간이 부족합니다. 관리자에게 알려주세요."
                : `파일을 저장하지 못했습니다. (${err?.code ?? "알 수 없는 오류"})`;
          return new Response(reason, { status: 500 });
        }
        return Response.json({ ok: true, url: `/media/${path}` });
      },
    },
  },
});
