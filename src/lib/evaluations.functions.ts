import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// 심사 평가 — data/db.json 에 저장 (Supabase 불필요).

/** Judge submits/updates an evaluation. */
export const submitEvaluation = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      submissionId: z.string().uuid(),
      innovation: z.number().int().min(0).max(40),
      completeness: z.number().int().min(0).max(30),
      utilization: z.number().int().min(0).max(20),
      finalize: z.boolean().optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { readStore, writeStore, requireJudgeOrAdmin, profileOf } = await import("@/lib/local-store.server");
    const judge = await requireJudgeOrAdmin();
    const store = readStore();
    const existing = store.evaluations.find(
      (e) => e.submission_id === data.submissionId && e.judge_id === judge.empNo,
    );
    if (existing?.is_finalized) throw new Error("이미 확정된 평가입니다.");
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
