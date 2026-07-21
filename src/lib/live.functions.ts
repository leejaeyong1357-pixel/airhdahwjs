import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// 실시간 발표 평가 (별점 투표) — 저장은 data/live-db.json (live-store.server.ts).

// ── 로그인 ──────────────────────────────────────────────────
export const loginJudge = createServerFn({ method: "POST" })
  .inputValidator((d: { name: string; empNo: string }) =>
    z.object({ name: z.string().trim().min(1), empNo: z.string().trim().min(1) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { JUDGE_POSITIONS } = await import("@/lib/live-store.server");
    const { loadRoster } = await import("@/lib/local-store.server");
    const roster = await loadRoster();
    const person = roster.get(data.empNo.trim());
    if (!person || person.name !== data.name.trim()) {
      throw new Error("이름 또는 사번이 올바르지 않습니다.");
    }
    if (!JUDGE_POSITIONS.includes(person.position)) {
      throw new Error("평가자(대표·상무·실장·팀장)만 로그인할 수 있습니다.");
    }
    return {
      name: person.name, empNo: person.empNo, team: person.team ?? "",
      position: person.position, roles: ["judge"], role: "judge",
    };
  });

export const loginAdmin = createServerFn({ method: "POST" })
  .inputValidator((d: { empNo: string; password: string }) =>
    z.object({ empNo: z.string().trim().min(1), password: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { ADMIN_EMP_NO, ADMIN_PASSWORD } = await import("@/lib/live-store.server");
    if (data.empNo.trim() !== ADMIN_EMP_NO || data.password !== ADMIN_PASSWORD) {
      throw new Error("관리자 사번 또는 비밀번호가 올바르지 않습니다.");
    }
    return { name: "관리자", empNo: ADMIN_EMP_NO, roles: ["admin"], role: "admin" };
  });

// ── 평가자 (태블릿 갤러리 + 별점) ──────────────────────────────
/** 전체 9개 작품 + 내가 준 별 + 현재 발표 상태 (평가자 대시보드가 폴링) */
export const getJudgeBoard = createServerFn({ method: "GET" })
  .handler(async () => {
    const { readLive, requireJudge, MAX_STARS } = await import("@/lib/live-store.server");
    const me = requireJudge();
    const store = readLive();
    const myStars = new Set(store.stars.filter((s) => s.judgeEmpNo === me.empNo).map((s) => s.workId));
    const works = [...store.works]
      .sort((a, b) => a.order - b.order)
      .map((w) => ({
        id: w.id, order: w.order, name: w.name, team: w.team, position: w.position,
        title: w.title, tech: w.tech, content: w.content, thumbnail: w.thumbnail,
        starred: myStars.has(w.id),
      }));
    const cur = store.live.workId ? store.works.find((w) => w.id === store.live.workId) : null;
    return {
      works,
      myStarCount: myStars.size,
      maxStars: MAX_STARS,
      live: { phase: store.live.phase, name: cur?.name ?? null, team: cur?.team ?? null, position: cur?.position ?? null, workId: store.live.workId },
    };
  });

/** 별 주기/취소 (최대 5개, 작품당 1개) */
export const toggleStar = createServerFn({ method: "POST" })
  .inputValidator((d: { workId: string }) => z.object({ workId: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const { readLive, writeLive, requireJudge, MAX_STARS } = await import("@/lib/live-store.server");
    const me = requireJudge();
    const store = readLive();
    if (!store.works.some((w) => w.id === data.workId)) throw new Error("작품을 찾을 수 없습니다.");
    const idx = store.stars.findIndex((s) => s.workId === data.workId && s.judgeEmpNo === me.empNo);
    if (idx >= 0) {
      store.stars.splice(idx, 1);
      writeLive(store);
      return { starred: false };
    }
    const mine = store.stars.filter((s) => s.judgeEmpNo === me.empNo).length;
    if (mine >= MAX_STARS) throw new Error(`별은 최대 ${MAX_STARS}개까지 줄 수 있습니다.`);
    store.stars.push({ workId: data.workId, judgeEmpNo: me.empNo, judgeName: me.name, judgeTeam: me.team ?? "", createdAt: new Date().toISOString() });
    writeLive(store);
    return { starred: true };
  });

// ── 관리자 ──────────────────────────────────────────────────
/** 관리자 보드 — 발표 순서 + 실시간 별점/총점/순위 + 현재 상태 */
export const adminGetLiveBoard = createServerFn({ method: "GET" })
  .handler(async () => {
    const { readLive, requireAdmin, STAR_POINT } = await import("@/lib/live-store.server");
    requireAdmin();
    const store = readLive();
    const starMap = new Map<string, typeof store.stars>();
    for (const s of store.stars) {
      const list = starMap.get(s.workId) ?? [];
      list.push(s);
      starMap.set(s.workId, list);
    }
    const rows = store.works.map((w) => {
      const stars = starMap.get(w.id) ?? [];
      const starPoints = Math.round(stars.length * STAR_POINT * 1000) / 1000;
      const total = Math.round((w.base + starPoints) * 1000) / 1000;
      return {
        id: w.id, order: w.order, name: w.name, team: w.team, position: w.position,
        title: w.title, tech: w.tech, content: w.content, thumbnail: w.thumbnail,
        base: w.base, starCount: stars.length, starPoints, total,
        voters: stars.map((s) => `${s.judgeTeam ? s.judgeTeam + " " : ""}${s.judgeName}`),
      };
    });
    const ordered = [...rows].sort((a, b) => a.order - b.order);
    const ranking = [...rows].sort((a, b) => b.total - a.total).map((r, i) => ({ ...r, rank: i + 1 }));
    return { works: ordered, ranking, live: store.live, starPoint: STAR_POINT };
  });

export const adminSetPhase = createServerFn({ method: "POST" })
  .inputValidator((d: { workId: string | null; phase: "idle" | "intro" | "presenting" }) =>
    z.object({ workId: z.string().nullable(), phase: z.enum(["idle", "intro", "presenting"]) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { readLive, writeLive, requireAdmin } = await import("@/lib/live-store.server");
    requireAdmin();
    const store = readLive();
    store.live = { workId: data.phase === "idle" ? null : data.workId, phase: data.phase };
    writeLive(store);
    return { ok: true };
  });

export const adminReorder = createServerFn({ method: "POST" })
  .inputValidator((d: { orderedIds: string[] }) => z.object({ orderedIds: z.array(z.string()) }).parse(d))
  .handler(async ({ data }) => {
    const { readLive, writeLive, requireAdmin } = await import("@/lib/live-store.server");
    requireAdmin();
    const store = readLive();
    const pos = new Map(data.orderedIds.map((id, i) => [id, i + 1]));
    for (const w of store.works) if (pos.has(w.id)) w.order = pos.get(w.id)!;
    store.works.sort((a, b) => a.order - b.order);
    writeLive(store);
    return { ok: true };
  });

export const adminUpdateWork = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().min(1),
      title: z.string().max(200).optional(),
      tech: z.string().max(5000).optional(),
      content: z.string().max(5000).optional(),
      thumbnail: z.string().max(2000).optional(),
      base: z.number().min(0).max(100).optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { readLive, writeLive, requireAdmin } = await import("@/lib/live-store.server");
    requireAdmin();
    const store = readLive();
    const w = store.works.find((x) => x.id === data.id);
    if (!w) throw new Error("작품을 찾을 수 없습니다.");
    if (data.title !== undefined) w.title = data.title;
    if (data.tech !== undefined) w.tech = data.tech;
    if (data.content !== undefined) w.content = data.content;
    if (data.thumbnail !== undefined) w.thumbnail = data.thumbnail;
    if (data.base !== undefined) w.base = data.base;
    writeLive(store);
    return { ok: true };
  });

/** 기존 사이트(data/db.json)에서 9명 작품 내용을 다시 긁어온다. */
export const adminImportLegacy = createServerFn({ method: "POST" })
  .handler(async () => {
    const { readLive, writeLive, requireAdmin, importLegacyWorks } = await import("@/lib/live-store.server");
    requireAdmin();
    const store = readLive();
    const matched = importLegacyWorks(store.works);
    writeLive(store);
    return { ok: true, matched };
  });

/** 별점 전체 초기화 (1차 점수·작품은 유지) */
export const adminResetStars = createServerFn({ method: "POST" })
  .handler(async () => {
    const { readLive, writeLive, requireAdmin } = await import("@/lib/live-store.server");
    requireAdmin();
    const store = readLive();
    store.stars = [];
    writeLive(store);
    return { ok: true };
  });
