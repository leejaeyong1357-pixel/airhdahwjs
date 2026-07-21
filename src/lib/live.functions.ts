import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// 실시간 발표 평가 — 서버 함수. 저장은 data/live-db.json (live-store.server.ts).

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
      name: person.name,
      empNo: person.empNo,
      team: person.team ?? "",
      position: person.position,
      roles: ["judge"],
      role: "judge",
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

// ── 평가자 화면 ─────────────────────────────────────────────
/** 현재 발표 상태 + 현재 발표작 + 내 평가 (평가자 대시보드가 폴링) */
export const getLiveState = createServerFn({ method: "GET" })
  .handler(async () => {
    const { readLive, requireJudge } = await import("@/lib/live-store.server");
    const me = requireJudge();
    const store = readLive();
    const { phase, workId } = store.live;
    if (!workId || phase === "idle") return { phase: "idle" as const, work: null, myEval: null };
    const w = store.works.find((x) => x.id === workId);
    if (!w) return { phase: "idle" as const, work: null, myEval: null };
    const myEval = store.evaluations.find((e) => e.workId === workId && e.judgeEmpNo === me.empNo) ?? null;
    return {
      phase,
      work: { id: w.id, name: w.name, team: w.team, position: w.position, title: w.title, tech: w.tech, content: w.content, thumbnail: w.thumbnail },
      myEval: myEval && {
        presentation: myEval.presentation, innovation: myEval.innovation,
        completeness: myEval.completeness, utilization: myEval.utilization,
      },
    };
  });

/** 현장 발표평가 제출/수정 (발표20 · 혁신40 · 완성20 · 활용20) */
export const submitLiveEval = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      workId: z.string().min(1),
      presentation: z.number().int().min(0).max(20),
      innovation: z.number().int().min(0).max(40),
      completeness: z.number().int().min(0).max(20),
      utilization: z.number().int().min(0).max(20),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { readLive, writeLive, requireJudge } = await import("@/lib/live-store.server");
    const me = requireJudge();
    const store = readLive();
    if (store.live.phase !== "presenting" || store.live.workId !== data.workId) {
      throw new Error("지금은 이 작품을 평가할 수 없습니다.");
    }
    const now = new Date().toISOString();
    const existing = store.evaluations.find((e) => e.workId === data.workId && e.judgeEmpNo === me.empNo);
    if (existing) {
      existing.presentation = data.presentation;
      existing.innovation = data.innovation;
      existing.completeness = data.completeness;
      existing.utilization = data.utilization;
      existing.updatedAt = now;
    } else {
      store.evaluations.push({
        workId: data.workId, judgeEmpNo: me.empNo, judgeName: me.name, judgeTeam: me.team ?? "",
        presentation: data.presentation, innovation: data.innovation,
        completeness: data.completeness, utilization: data.utilization, updatedAt: now,
      });
    }
    writeLive(store);
    return { ok: true };
  });

// ── 관리자 화면 ─────────────────────────────────────────────
function liveRaw(e: { presentation: number; innovation: number; completeness: number; utilization: number }) {
  return e.presentation + e.innovation + e.completeness + e.utilization; // 0-100
}

/** 관리자 보드 — 발표 순서 목록 + 실시간 집계/총점/순위 + 현재 상태 */
export const adminGetLiveBoard = createServerFn({ method: "GET" })
  .handler(async () => {
    const { readLive, requireAdmin, WEIGHT_BASE, WEIGHT_LIVE } = await import("@/lib/live-store.server");
    requireAdmin();
    const store = readLive();
    const rows = store.works.map((w) => {
      const evs = store.evaluations.filter((e) => e.workId === w.id);
      const liveAvg = evs.length ? evs.reduce((a, e) => a + liveRaw(e), 0) / evs.length : 0; // 0-100
      const total = w.base * WEIGHT_BASE + liveAvg * WEIGHT_LIVE;
      return {
        id: w.id, order: w.order, name: w.name, team: w.team, position: w.position,
        title: w.title, tech: w.tech, content: w.content, thumbnail: w.thumbnail,
        base: w.base,
        liveAvg: Math.round(liveAvg * 10) / 10,
        liveCount: evs.length,
        total: Math.round(total * 10) / 10,
        breakdown: evs
          .map((e) => ({
            judgeName: e.judgeName, judgeTeam: e.judgeTeam,
            presentation: e.presentation, innovation: e.innovation, completeness: e.completeness, utilization: e.utilization,
            raw: liveRaw(e),
          }))
          .sort((a, b) => b.raw - a.raw),
      };
    });
    const ordered = [...rows].sort((a, b) => a.order - b.order);
    const ranking = [...rows].sort((a, b) => b.total - a.total).map((r, i) => ({ ...r, rank: i + 1 }));
    return { works: ordered, ranking, live: store.live };
  });

/** 발표 상태 제어 — intro(잠시 후 발표) / presenting(작품+평가 오픈) / idle(대기) */
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

/** 발표 순서 재정렬 */
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

/** 작품 내용/1차점수 수정 */
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

/** 현장 발표평가 전체 초기화 (1차 점수·작품은 유지) */
export const adminResetLiveEvals = createServerFn({ method: "POST" })
  .handler(async () => {
    const { readLive, writeLive, requireAdmin } = await import("@/lib/live-store.server");
    requireAdmin();
    const store = readLive();
    store.evaluations = [];
    writeLive(store);
    return { ok: true };
  });
