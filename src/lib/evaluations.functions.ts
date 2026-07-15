import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// 심사 평가 — data/db.json 에 저장 (Supabase 불필요).

/** Judge submits/updates an evaluation. 평가완료 후에도 다시 수정 가능. */
export const submitEvaluation = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      submissionId: z.string().uuid(),
      innovation: z.number().int().min(0).max(40),
      completeness: z.number().int().min(0).max(40),
      utilization: z.number().int().min(0).max(20),
      finalize: z.boolean().optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { readStore, writeStore, requireJudgeOrAdmin, profileOf, loadRoster, liveProfile } = await import("@/lib/local-store.server");
    const { isJudgingOpen } = await import("@/lib/judging");
    const { isSameEvalScope } = await import("@/lib/org");
    const judge = await requireJudgeOrAdmin();
    if (!isJudgingOpen()) throw new Error("평가 기간이 아닙니다.");
    const store = readStore();
    const roster = await loadRoster();
    const me = roster.get(judge.empNo);
    const isAdmin = me?.roles.includes("admin");
    const target = store.submissions.find((s) => s.id === data.submissionId);
    // 평가 제외(밴) 대상 작품은 팀장(평가자)이 평가할 수 없다. (관리자는 예외)
    if (!isAdmin && target && (store.bannedFromJudges ?? []).includes(target.user_id)) {
      throw new Error("해당 작품은 평가 대상이 아닙니다.");
    }
    // 공정성: 자기 팀(실장은 자기 실) 작품은 평가할 수 없다. (관리자는 예외)
    if (!isAdmin && target) {
      const authorTeam = liveProfile(roster, target.user_id, target.profiles).team;
      if (isSameEvalScope(me?.team, authorTeam)) {
        throw new Error("공정성 원칙에 따라 소속 팀(실) 작품은 평가할 수 없습니다.");
      }
    }
    const existing = store.evaluations.find(
      (e) => e.submission_id === data.submissionId && e.judge_id === judge.empNo,
    );
    const now = new Date().toISOString();
    if (existing) {
      existing.innovation = data.innovation;
      existing.completeness = data.completeness;
      existing.utilization = data.utilization;
      existing.is_finalized = data.finalize ?? false;
      existing.updated_at = now;
    } else {
      store.evaluations.push({
        id: crypto.randomUUID(),
        submission_id: data.submissionId,
        judge_id: judge.empNo,
        innovation: data.innovation,
        completeness: data.completeness,
        utilization: data.utilization,
        is_finalized: data.finalize ?? false,
        created_at: now,
        profiles: profileOf(judge),
      });
    }
    writeStore(store);
    return { ok: true };
  });

/** My evaluations (submission_id -> scores + finalized). */
export const listMyEvaluations = createServerFn({ method: "GET" })
  .handler(async () => {
    const { readStore, requireUser } = await import("@/lib/local-store.server");
    const user = requireUser();
    return readStore()
      .evaluations.filter((e) => e.judge_id === user.empNo)
      .map((e) => ({
        submission_id: e.submission_id,
        innovation: e.innovation,
        completeness: e.completeness,
        utilization: e.utilization,
        is_finalized: e.is_finalized,
      }));
  });
