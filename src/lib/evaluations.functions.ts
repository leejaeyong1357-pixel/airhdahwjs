import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/** Judge submits/updates an evaluation. Time window & finalized-lock enforced by DB trigger. */
export const submitEvaluation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      submissionId: z.string().uuid(),
      innovation: z.number().int().min(0).max(40),
      completeness: z.number().int().min(0).max(30),
      utilization: z.number().int().min(0).max(20),
      finalize: z.boolean().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("evaluations").upsert(
      {
        submission_id: data.submissionId,
        judge_id: context.userId,
        innovation: data.innovation,
        completeness: data.completeness,
        utilization: data.utilization,
        is_finalized: data.finalize ?? false,
      },
      { onConflict: "submission_id,judge_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** My evaluations (submission_id -> scores + finalized). */
export const listMyEvaluations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("evaluations")
      .select("submission_id, innovation, completeness, utilization, is_finalized")
      .eq("judge_id", context.userId);
    return data ?? [];
  });
