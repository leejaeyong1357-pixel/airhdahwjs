import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const empNoRegex = /^\d{1,20}$/;
const juminRegex = /^\d{6}$/;

function synthEmail(empNo: string) {
  return `emp${empNo}@teczen.local`;
}

/**
 * Bootstrap: create the very first admin (미래성장팀 이재용 매니저) if no admin exists.
 * Idempotent — safe to call on every /auth page load.
 */
export const bootstrapAdminIfMissing = createServerFn({ method: "POST" }).handler(
  async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Check for existing admin
    const { data: existing } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("role", "admin")
      .limit(1);
    if (existing && existing.length > 0) return { created: false };

    // Read bootstrap credentials from environment (never hardcode).
    const empNo = process.env.BOOTSTRAP_ADMIN_EMP_NO;
    const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
    if (!empNo || !password) {
      // Silently skip bootstrap when credentials aren't configured.
      return { created: false };
    }
    const email = synthEmail(empNo);

    // Create auth user (email pre-confirmed)
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { employee_no: empNo, name: "이재용" },
    });
    if (error || !created?.user) throw new Error(error?.message || "Failed to create admin");

    const uid = created.user.id;
    await supabaseAdmin.from("profiles").upsert({
      id: uid,
      employee_no: empNo,
      name: "이재용",
      team: "미래성장팀",
      position: "매니저",
      must_change_password: true,
    });
    await supabaseAdmin.from("user_roles").upsert({ user_id: uid, role: "admin" });
    return { created: true };
  },
);

/**
 * Resolve login credentials: given name + empNo, verify a matching profile exists
 * and return the synthesized email the client should sign in with. This does NOT
 * validate password (client does that via supabase.auth.signInWithPassword).
 */
export const resolveLoginEmail = createServerFn({ method: "POST" })
  .inputValidator((d: { name: string; employeeNo: string }) => {
    return z
      .object({
        name: z.string().trim().min(1).max(50),
        employeeNo: z.string().regex(empNoRegex),
      })
      .parse(d);
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, name, employee_no")
      .eq("employee_no", data.employeeNo)
      .maybeSingle();
    if (!profile || profile.name.trim() !== data.name.trim()) {
      throw new Error("이름 또는 사번이 일치하지 않습니다.");
    }
    return { email: synthEmail(data.employeeNo) };
  });

/** After successful password change, flip the must_change_password flag.
 * Uses admin client because column-level UPDATE on must_change_password
 * is revoked from the authenticated role (prevents client-side bypass). */
export const markPasswordChanged = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ must_change_password: false, updated_at: new Date().toISOString() })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Return the caller's profile plus role. */
export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: profile }, { data: roles }] = await Promise.all([
      context.supabase.from("profiles").select("*").eq("id", context.userId).maybeSingle(),
      context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
    ]);
    return {
      profile,
      role: (roles?.[0]?.role as "admin" | "judge" | "participant" | undefined) ?? "participant",
    };
  });
