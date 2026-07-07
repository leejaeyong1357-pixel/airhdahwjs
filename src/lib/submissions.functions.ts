import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const SubmissionInput = z.object({
  title: z.string().trim().min(1).max(120),
  features: z.string().trim().min(1).max(2000),
  description: z.string().trim().min(1).max(5000),
  techStack: z.string().trim().min(1).max(2000),
  expectedImpact: z.string().trim().min(1).max(2000),
  thumbnailPath: z.string().min(1),
  files: z.array(z.object({
    path: z.string().min(1),
    name: z.string().min(1),
    mime: z.string().optional(),
    size: z.number().optional(),
  })).max(20),
});

async function signThumb(supabase: any, path: string): Promise<string> {
  const { data } = await supabase.storage.from("thumbnails").createSignedUrl(path, 60 * 60 * 24 * 30);
  return data?.signedUrl ?? "";
}

/** List submissions (authenticated users only). */
export const listSubmissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase;
    const { data: subs } = await sb
      .from("submissions")
      .select("id,title,thumbnail_url,created_at,user_id")
      .order("created_at", { ascending: false });
    const list = subs ?? [];
    const userIds = Array.from(new Set(list.map((s: any) => s.user_id as string)));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profs } = userIds.length
      ? await supabaseAdmin.from("profiles").select("id,name,team,position").in("id", userIds)
      : { data: [] as any[] };
    const profMap = new Map((profs ?? []).map((p: any) => [p.id, p]));
    const { data: counts } = await sb.from("submission_like_counts").select("*");
    const map = new Map((counts ?? []).map((c: any) => [c.submission_id, c.like_count]));
    const paths = list.map((s: any) => s.thumbnail_url).filter(Boolean);
    const { data: signed } = paths.length
      ? await sb.storage.from("thumbnails").createSignedUrls(paths, 60 * 60 * 24 * 7)
      : { data: [] as any[] };
    const urlMap = new Map((signed ?? []).map((s: any) => [s.path, s.signedUrl]));
    return list.map((s: any) => {
      const p: any = profMap.get(s.user_id);
      return {
        id: s.id,
        title: s.title,
        thumbnailUrl: urlMap.get(s.thumbnail_url) ?? "",
        createdAt: s.created_at,
        author: {
          name: p?.name ?? "",
          team: p?.team ?? "",
          position: p?.position ?? "",
        },
        likeCount: (map.get(s.id) as number | undefined) ?? 0,
      };
    });
  });


/** Submission detail (authenticated). */
export const getSubmission = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: s, error: sErr } = await sb
      .from("submissions")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!s) throw new Error("작품을 찾을 수 없습니다.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: authorProfile } = await supabaseAdmin
      .from("profiles")
      .select("name,team,position,employee_no")
      .eq("id", s.user_id)
      .maybeSingle();
    const [{ data: files }, { data: commentsRaw }, { data: like }] = await Promise.all([
      sb.from("submission_files").select("*").eq("submission_id", data.id).order("created_at"),
      sb.from("comments")
        .select("id, body, created_at, user_id")
        .eq("submission_id", data.id)
        .order("created_at", { ascending: false }),
      sb.from("submission_like_counts").select("like_count").eq("submission_id", data.id).maybeSingle(),
    ]);
    const commentUserIds = Array.from(new Set((commentsRaw ?? []).map((c: any) => c.user_id as string)));
    const { data: commentProfiles } = commentUserIds.length
      ? await supabaseAdmin.from("profiles").select("id,name,team,position").in("id", commentUserIds)
      : { data: [] as any[] };
    const profileMap = new Map((commentProfiles ?? []).map((p: any) => [p.id, p]));
    const comments = (commentsRaw ?? []).map((c: any) => ({ ...c, profiles: profileMap.get(c.user_id) ?? null }));
    const signedFiles = await Promise.all(
      (files ?? []).map(async (f: any) => {
        const { data: su } = await sb.storage.from("submissions").createSignedUrl(f.file_path, 60 * 60);
        return { ...f, signedUrl: su?.signedUrl ?? "" };
      }),
    );
    return {
      submission: {
        ...s,
        profiles: authorProfile,
        thumbnailSignedUrl: await signThumb(sb, s.thumbnail_url),
      },
      files: signedFiles,
      comments,
      likeCount: like?.like_count ?? 0,
    };
  });


/** Create submission (metadata + file records). Files must already be uploaded to storage by client. */
export const createSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SubmissionInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: created, error } = await context.supabase
      .from("submissions")
      .insert({
        user_id: context.userId,
        title: data.title,
        features: data.features,
        description: data.description,
        tech_stack: data.techStack,
        expected_impact: data.expectedImpact,
        thumbnail_url: data.thumbnailPath,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    if (data.files.length > 0) {
      const rows = data.files.map((f) => ({
        submission_id: created.id,
        file_name: f.name,
        file_path: f.path,
        mime_type: f.mime ?? null,
        size_bytes: f.size ?? null,
      }));
      const { error: fe } = await context.supabase.from("submission_files").insert(rows);
      if (fe) throw new Error(fe.message);
    }
    return { id: created.id };
  });

/** Toggle like — enforced max 3 by DB trigger. */
export const toggleLike = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { submissionId: string }) =>
    z.object({ submissionId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("likes")
      .select("id")
      .eq("submission_id", data.submissionId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (existing) {
      const { error } = await context.supabase.from("likes").delete().eq("id", existing.id);
      if (error) throw new Error(error.message);
      return { liked: false };
    }
    const { error } = await context.supabase
      .from("likes")
      .insert({ submission_id: data.submissionId, user_id: context.userId });
    if (error) throw new Error(error.message.replace(/^.*좋아요는/, "좋아요는"));
    return { liked: true };
  });

/** My likes summary (for showing filled heart). */
export const listMyLikes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("likes")
      .select("submission_id")
      .eq("user_id", context.userId);
    return (data ?? []).map((r: any) => r.submission_id as string);
  });

export const addComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { submissionId: string; body: string }) =>
    z.object({
      submissionId: z.string().uuid(),
      body: z.string().trim().min(1).max(500),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("comments").insert({
      submission_id: data.submissionId,
      user_id: context.userId,
      body: data.body,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
