// 프로덕션 실행용 서버 (Bun 전용).
// 사용법: bun run build && bun run start
// dist/client 의 정적 파일을 서빙하고, 나머지 요청은 SSR 핸들러로 넘긴다.
import { join, normalize } from "node:path";

import handler from "../dist/server/server.js";

const clientDir = join(import.meta.dir, "..", "dist", "client");
const port = Number(process.env.PORT ?? 2222);

Bun.serve({
  port,
  hostname: "0.0.0.0",
  async fetch(req) {
    const url = new URL(req.url);
    const pathname = decodeURIComponent(url.pathname);
    if (pathname !== "/" && !pathname.includes("..")) {
      const filePath = normalize(join(clientDir, pathname));
      if (filePath.startsWith(clientDir)) {
        const file = Bun.file(filePath);
        if (await file.exists()) return new Response(file);
      }
    }
    return handler.fetch(req, {}, {});
  },
});

console.log(`TECZEN 서버 실행 중: http://localhost:${port}`);
