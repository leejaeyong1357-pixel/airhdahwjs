import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// 표준소스코드 — 누구나 보고 복사할 수 있고, AX Hub 관리 권한이 있는 사람만 추가 · 수정 · 삭제한다.

async function requireCodeAdmin() {
  const { requireUser, loadRoster } = await import("@/lib/local-store.server");
  const { isAxLabAdminViewer } = await import("@/lib/ax-lab");
  const user = requireUser();
  if (isAxLabAdminViewer(user.empNo)) return user;
  const roster = await loadRoster();
  if (!roster.get(user.empNo)?.roles.includes("admin")) {
    throw new Error("AX Hub 관리 권한이 있는 사람만 수정할 수 있습니다.");
  }
  return user;
}

/** 저장된 목록, 없으면 기본 코드 */
async function currentItems(store: any) {
  const { AX_CODE_DEFAULTS } = await import("@/lib/ax-code-defaults");
  return (store.axCodeLib ?? AX_CODE_DEFAULTS).map((x: any) => ({ ...x }));
}

export const axGetCodeLib = createServerFn({ method: "GET" })
  .handler(async () => {
    const { readStore, requireUser } = await import("@/lib/local-store.server");
    requireUser();
    return currentItems(readStore());
  });

export const axAdminSaveCode = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      /** 없으면 새로 추가 */
      id: z.string().max(80).optional(),
      category: z.string().trim().min(1).max(30),
      title: z.string().trim().min(1).max(60),
      description: z.string().trim().max(5000),
      language: z.string().trim().max(60).optional().default(""),
      code: z.string().min(1).max(200_000),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { readStore, writeStore } = await import("@/lib/local-store.server");
    const admin = await requireCodeAdmin();
    const store = readStore();
    const items = await currentItems(store);
    const now = new Date().toISOString();
    const fields = {
      category: data.category, title: data.title, description: data.description,
      language: data.language, code: data.code, updatedAt: now, updatedByName: admin.name,
    };
    let id = data.id;
    const i = id ? items.findIndex((x: any) => x.id === id) : -1;
    if (i >= 0) {
      items[i] = { ...items[i], ...fields };
    } else {
      id = `code-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      // 같은 분류의 마지막 항목 뒤에 넣는다 (분류가 처음이면 맨 뒤)
      let at = -1;
      items.forEach((x: any, j: number) => { if (x.category === data.category) at = j; });
      items.splice(at >= 0 ? at + 1 : items.length, 0, { id, ...fields });
    }
    store.axCodeLib = items;
    writeStore(store);
    return { ok: true, id };
  });

export const axAdminDeleteCode = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => z.object({ id: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const { readStore, writeStore } = await import("@/lib/local-store.server");
    await requireCodeAdmin();
    const store = readStore();
    const items = await currentItems(store);
    const next = items.filter((x: any) => x.id !== data.id);
    if (next.length === items.length) throw new Error("코드를 찾을 수 없습니다.");
    store.axCodeLib = next;
    writeStore(store);
    return { ok: true };
  });
