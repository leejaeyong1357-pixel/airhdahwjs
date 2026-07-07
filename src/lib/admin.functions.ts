import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function requireAdmin(context: any) {
  const { data } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("관리자 권한이 필요합니다.");
}

const UserInput = z.object({
  name: z.string().trim().min(1).max(50),
  employeeNo: z.string().regex(/^\d{1,20}$/),
  jumin: z.string().regex(/^\d{6}$/),
  team: z.string().trim().max(50).optional().default(""),
  position: z.string().trim().max(50).optional().default(""),
  role: z.enum(["participant", "judge", "admin"]),
});

/** Create a user (admin only). */
export const adminCreateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UserInput.parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = `emp${data.employeeNo}@teczen.local`;
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.jumin,
      email_confirm: true,
      user_metadata: { employee_no: data.employeeNo, name: data.name },
    });
    if (error || !created?.user) throw new Error(error?.message || "사용자 생성 실패");
    const uid = created.user.id;
    await supabaseAdmin.from("profiles").upsert({
      id: uid,
      employee_no: data.employeeNo,
      name: data.name,
      team: data.team || null,
      position: data.position || null,
      must_change_password: data.role !== "participant", // judge/admin required to change
    });
    await supabaseAdmin.from("user_roles").upsert({ user_id: uid, role: data.role });
    return { ok: true, id: uid };
  });

/** Bulk CSV import: rows of { name, employeeNo, jumin, team, position, role } */
export const adminImportUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ rows: z.array(UserInput).min(1).max(1000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let ok = 0, failed: { employeeNo: string; error: string }[] = [];
    for (const row of data.rows) {
      const email = `emp${row.employeeNo}@teczen.local`;
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email, password: row.jumin, email_confirm: true,
        user_metadata: { employee_no: row.employeeNo, name: row.name },
      });
      if (error || !created?.user) {
        failed.push({ employeeNo: row.employeeNo, error: error?.message ?? "unknown" });
        continue;
      }
      const uid = created.user.id;
      await supabaseAdmin.from("profiles").upsert({
        id: uid, employee_no: row.employeeNo, name: row.name,
        team: row.team || null, position: row.position || null,
        must_change_password: row.role !== "participant",
      });
      await supabaseAdmin.from("user_roles").upsert({ user_id: uid, role: row.role });
      ok++;
    }
    return { ok, failed };
  });

export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { data: profiles } = await context.supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });
    const { data: roles } = await context.supabase.from("user_roles").select("user_id,role");
    const roleMap = new Map((roles ?? []).map((r: any) => [r.user_id, r.role]));
    return (profiles ?? []).map((p: any) => ({
      ...p,
      role: roleMap.get(p.id) ?? "participant",
    }));
  });

export const adminResetPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; newPassword: string }) =>
    z.object({
      userId: z.string().uuid(),
      newPassword: z.string().min(6).max(72),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.newPassword,
    });
    if (error) throw new Error(error.message);
    await supabaseAdmin
      .from("profiles")
      .update({ must_change_password: true })
      .eq("id", data.userId);
    return { ok: true };
  });

export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Team CRUD */
export const adminListTeams = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { data } = await context.supabase.from("teams").select("*").order("name");
    return data ?? [];
  });

export const adminCreateTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { name: string }) =>
    z.object({ name: z.string().trim().min(1).max(50) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { error } = await context.supabase.from("teams").insert({ name: data.name });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { error } = await context.supabase.from("teams").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Rankings: aggregate 임원 점수 (80%) + 좋아요 정규화 (20%) */
export const adminGetRankings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const [{ data: subs }, { data: evals }, { data: likes }] = await Promise.all([
      context.supabase
        .from("submissions")
        .select("id,title,user_id,profiles:user_id(name,team,position)"),
      context.supabase.from("evaluations").select("submission_id,innovation,completeness,utilization"),
      context.supabase.from("submission_like_counts").select("*"),
    ]);
    const likeMap = new Map((likes ?? []).map((r: any) => [r.submission_id, r.like_count]));
    const evalMap = new Map<string, { total: number; count: number }>();
    for (const e of evals ?? []) {
      const total = (e.innovation ?? 0) + (e.completeness ?? 0) + (e.utilization ?? 0);
      const cur = evalMap.get(e.submission_id) ?? { total: 0, count: 0 };
      cur.total += total; cur.count += 1;
      evalMap.set(e.submission_id, cur);
    }
    // Rubric: 혁신성 40 + 완성도 30 + 활용도 20 = 90 raw → scale to 100 → weight 80%
    // Likes: normalize (max → 100) → weight 20%
    const maxLikes = Math.max(1, ...Array.from(likeMap.values() as Iterable<number>));
    const rows = (subs ?? []).map((s: any) => {
      const ev = evalMap.get(s.id);
      const judgeAvgRaw = ev && ev.count > 0 ? ev.total / ev.count : 0; // 0-90
      const judgeScore100 = (judgeAvgRaw / 90) * 100;
      const likeCount = (likeMap.get(s.id) as number | undefined) ?? 0;
      const likeScore100 = (likeCount / maxLikes) * 100;
      const final = judgeScore100 * 0.8 + likeScore100 * 0.2;
      return {
        submissionId: s.id,
        title: s.title,
        author: s.profiles,
        judgeCount: ev?.count ?? 0,
        judgeAvg: Math.round(judgeAvgRaw * 10) / 10,
        likeCount,
        final: Math.round(final * 10) / 10,
      };
    });
    rows.sort((a, b) => b.final - a.final);
    return rows.map((r, i) => ({ ...r, rank: i + 1 }));
  });

/** All evaluations detailed (admin only). */
export const adminListEvaluations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { data } = await context.supabase
      .from("evaluations")
      .select(
        "id, submission_id, innovation, completeness, utilization, created_at, judge_id, submissions:submission_id(title), profiles:judge_id(name, team, position)",
      )
      .order("created_at", { ascending: false });
    return data ?? [];
  });

/** Team-wise submission counts (visible to judges + admins). */
export const listTeamSubmissionCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Only judges + admins should see cross-team data.
    const isJudgeOrAdmin =
      (await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "judge" })).data ||
      (await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" })).data;
    if (!isJudgeOrAdmin) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: subs } = await supabaseAdmin
      .from("submissions")
      .select("user_id, profiles:user_id(team)");
    const map = new Map<string, number>();
    for (const s of subs ?? []) {
      const team = (s as any).profiles?.team ?? "미지정";
      map.set(team, (map.get(team) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([team, count]) => ({ team, count }))
      .sort((a, b) => b.count - a.count);
  });
