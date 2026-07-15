import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// 작품 제출/조회/좋아요/댓글 — 서버 컴퓨터의 data/db.json 에 저장된다 (Supabase 불필요).
// 업로드 파일은 /api/media 로 올라가 public/media/ 에 저장되고 정적으로 서빙된다.

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

const MAX_LIKES_PER_USER = 3;

/** List submissions (authenticated users only). */
export const listSubmissions = createServerFn({ method: "GET" })
  .handler(async () => {
    const { readStore, requireUser, mediaUrl, loadRoster, liveProfile } = await import("@/lib/local-store.server");
    const user = requireUser();
    const store = readStore();
    const roster = await loadRoster();
    const likeCounts = new Map<string, number>();
    for (const l of store.likes) {
      likeCounts.set(l.submission_id, (likeCounts.get(l.submission_id) ?? 0) + 1);
    }
    return [...store.submissions]
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .map((s) => {
        const author = liveProfile(roster, s.user_id, s.profiles);
        return {
          id: s.id,
          title: s.title,
          thumbnailUrl: mediaUrl("thumbnails", s.thumbnail_url),
          createdAt: s.created_at,
          author: { name: author.name, team: author.team, position: author.position },
          authorEmpNo: s.user_id,
          likeCount: likeCounts.get(s.id) ?? 0,
          mine: s.user_id === user.empNo,
        };
      });
  });

/**
 * 평가자 전용 목록 — 밴 대상 + (팀장/실장의) 자기 소속 작품을 서버(로스터 기준)에서 제외.
 * 로컬 세션 스냅샷에 의존하지 않으므로 항상 정확하게 걸러진다.
 */
export const listJudgeSubmissions = createServerFn({ method: "GET" })
  .handler(async () => {
    const { readStore, requireJudgeOrAdmin, mediaUrl, loadRoster, liveProfile } = await import("@/lib/local-store.server");
    const { sameSil } = await import("@/lib/org");
    const user = await requireJudgeOrAdmin();
    const store = readStore();
    const roster = await loadRoster();
    const me = roster.get(user.empNo);
    const banned = new Set(store.bannedFromJudges ?? []);
    const likeCounts = new Map<string, number>();
    for (const l of store.likes) likeCounts.set(l.submission_id, (likeCounts.get(l.submission_id) ?? 0) + 1);
    return [...store.submissions]
      .filter((s) => {
        if (banned.has(s.user_id)) return false; // 평가 제외(밴)
        const authorTeam = liveProfile(roster, s.user_id, s.profiles).team;
        return sameSil(me?.team, authorTeam);     // 본인이 속한 실의 작품만
      })
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .map((s) => {
        const author = liveProfile(roster, s.user_id, s.profiles);
        return {
          id: s.id,
          title: s.title,
          thumbnailUrl: mediaUrl("thumbnails", s.thumbnail_url),
          createdAt: s.created_at,
          author: { name: author.name, team: author.team, position: author.position },
          authorEmpNo: s.user_id,
          likeCount: likeCounts.get(s.id) ?? 0,
          mine: s.user_id === user.empNo,
        };
      });
  });

/** Submission detail (authenticated). */
export const getSubmission = createServerFn({ method: "GET" })
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { readStore, requireUser, mediaUrl, loadRoster, liveProfile } = await import("@/lib/local-store.server");
    const { sameSil } = await import("@/lib/org");
    const user = requireUser();
    const store = readStore();
    const roster = await loadRoster();
    const s = store.submissions.find((x) => x.id === data.id);
    if (!s) throw new Error("작품을 찾을 수 없습니다.");
    const files = store.submissions
      .find((x) => x.id === data.id)!
      .files.map((f: any) => ({ ...f, signedUrl: mediaUrl("submissions", f.file_path) }));
    const comments = store.comments
      .filter((c) => c.submission_id === data.id)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .map((c) => ({ ...c, profiles: liveProfile(roster, c.user_id, c.profiles) }));
    const likeCount = store.likes.filter((l) => l.submission_id === data.id).length;

    // 평가 가능 여부 (로스터 기준, 서버 판정) — 본인이 속한 실의 작품만
    const me = roster.get(user.empNo);
    const isJudge = !!me?.roles.includes("judge") || !!me?.roles.includes("admin");
    const authorTeam = liveProfile(roster, s.user_id, s.profiles).team;
    const isBanned = (store.bannedFromJudges ?? []).includes(s.user_id);
    const canEvaluate = isJudge && !isBanned && sameSil(me?.team, authorTeam);

    return {
      submission: {
        ...s,
        profiles: liveProfile(roster, s.user_id, s.profiles),
        thumbnailSignedUrl: mediaUrl("thumbnails", s.thumbnail_url),
      },
      files,
      comments,
      likeCount,
      mine: s.user_id === user.empNo,
      canEvaluate,
    };
  });

/** Create submission (metadata + file records). Files must already be uploaded via /api/media. */
export const createSubmission = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SubmissionInput.parse(d))
  .handler(async ({ data }) => {
    const { readStore, writeStore, requireUser, profileOf } = await import("@/lib/local-store.server");
    const user = requireUser();
    const store = readStore();
    if (store.submissions.some((x) => x.user_id === user.empNo)) {
      throw new Error("작품은 1인당 1개만 제출할 수 있습니다. 이미 제출한 작품이 있습니다.");
    }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    store.submissions.push({
      id,
      user_id: user.empNo,
      title: data.title,
      features: data.features,
      description: data.description,
      tech_stack: data.techStack,
      expected_impact: data.expectedImpact,
      thumbnail_url: data.thumbnailPath,
      created_at: now,
      profiles: profileOf(user),
      files: data.files.map((f) => ({
        submission_id: id,
        file_name: f.name,
        file_path: f.path,
        mime_type: f.mime ?? null,
        size_bytes: f.size ?? null,
        created_at: now,
      })),
    });
    writeStore(store);
    return { id };
  });

/** Toggle like — 인당 최대 3개. */
export const toggleLike = createServerFn({ method: "POST" })
  .inputValidator((d: { submissionId: string }) =>
    z.object({ submissionId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { readStore, writeStore, requireUser } = await import("@/lib/local-store.server");
    const user = requireUser();
    const store = readStore();
    // 이재용 매니저(대회 운영)는 좋아요 무제한 + 같은 작품에도 여러 번 누적 가능
    const UNLIMITED_EMP_NOS = ["82211489"];
    if (UNLIMITED_EMP_NOS.includes(user.empNo)) {
      store.likes.push({
        submission_id: data.submissionId,
        user_id: user.empNo,
        created_at: new Date().toISOString(),
      });
      writeStore(store);
      return { liked: true, unlimited: true };
    }
    // 일반 사용자: 토글 + 인당 3개 제한
    const idx = store.likes.findIndex(
      (l) => l.submission_id === data.submissionId && l.user_id === user.empNo,
    );
    if (idx >= 0) {
      store.likes.splice(idx, 1);
      writeStore(store);
      return { liked: false };
    }
    const mine = store.likes.filter((l) => l.user_id === user.empNo).length;
    if (mine >= MAX_LIKES_PER_USER) {
      throw new Error(`좋아요는 인당 최대 ${MAX_LIKES_PER_USER}개까지 가능합니다.`);
    }
    store.likes.push({
      submission_id: data.submissionId,
      user_id: user.empNo,
      created_at: new Date().toISOString(),
    });
    writeStore(store);
    return { liked: true };
  });

/** My likes summary (for showing filled heart). */
export const listMyLikes = createServerFn({ method: "GET" })
  .handler(async () => {
    const { readStore, requireUser } = await import("@/lib/local-store.server");
    const user = requireUser();
    return readStore()
      .likes.filter((l) => l.user_id === user.empNo)
      .map((l) => l.submission_id as string);
  });

export const addComment = createServerFn({ method: "POST" })
  .inputValidator((d: { submissionId: string; body: string }) =>
    z.object({
      submissionId: z.string().uuid(),
      body: z.string().trim().min(1).max(500),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { readStore, writeStore, requireUser, profileOf } = await import("@/lib/local-store.server");
    const user = requireUser();
    const store = readStore();
    if (!store.submissions.some((s) => s.id === data.submissionId)) {
      throw new Error("작품을 찾을 수 없습니다.");
    }
    store.comments.push({
      id: crypto.randomUUID(),
      submission_id: data.submissionId,
      user_id: user.empNo,
      body: data.body,
      created_at: new Date().toISOString(),
      profiles: profileOf(user),
    });
    writeStore(store);
    return { ok: true };
  });

/** 본인 작품 수정 (텍스트 항목 + 선택적 썸네일 교체 + 첨부파일 교체). */
export const updateSubmission = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      title: z.string().trim().min(1).max(120),
      features: z.string().trim().min(1).max(2000),
      description: z.string().trim().min(1).max(5000),
      techStack: z.string().trim().min(1).max(2000),
      expectedImpact: z.string().trim().min(1).max(2000),
      // 썸네일을 새로 올렸을 때만 전달 (/api/media 업로드 후의 경로)
      thumbnailPath: z.string().min(1).optional(),
      // 첨부파일 목록을 함께 관리할 때 전달 (유지할 기존 파일 + 새로 올린 파일의 최종 목록)
      files: z
        .array(z.object({
          path: z.string().min(1),
          name: z.string().min(1),
          mime: z.string().optional(),
          size: z.number().optional(),
        }))
        .max(20)
        .optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { readStore, writeStore, requireUser } = await import("@/lib/local-store.server");
    const user = requireUser();
    const store = readStore();
    const s = store.submissions.find((x) => x.id === data.id);
    if (!s) throw new Error("작품을 찾을 수 없습니다.");
    if (s.user_id !== user.empNo) throw new Error("본인 작품만 수정할 수 있습니다.");
    s.title = data.title;
    s.features = data.features;
    s.description = data.description;
    s.tech_stack = data.techStack;
    s.expected_impact = data.expectedImpact;

    const removedFiles: string[] = [];
    if (data.thumbnailPath && data.thumbnailPath !== s.thumbnail_url) {
      if (s.thumbnail_url) {
        try {
          const { rmSync } = await import("node:fs");
          const { join } = await import("node:path");
          rmSync(join(process.cwd(), "public", "media", "thumbnails", s.thumbnail_url), { force: true });
        } catch { /* ignore */ }
      }
      s.thumbnail_url = data.thumbnailPath;
    }

    if (data.files) {
      const now = new Date().toISOString();
      const keepPaths = new Set(data.files.map((f) => f.path));
      // 목록에서 빠진 기존 첨부파일은 디스크에서 삭제
      for (const old of s.files ?? []) {
        if (!keepPaths.has(old.file_path)) removedFiles.push(old.file_path);
      }
      s.files = data.files.map((f) => {
        const existing = (s.files ?? []).find((x: any) => x.file_path === f.path);
        return existing ?? {
          submission_id: s.id,
          file_name: f.name,
          file_path: f.path,
          mime_type: f.mime ?? null,
          size_bytes: f.size ?? null,
          created_at: now,
        };
      });
    }

    s.updated_at = new Date().toISOString();
    writeStore(store);

    if (removedFiles.length) {
      try {
        const { rmSync } = await import("node:fs");
        const { join } = await import("node:path");
        for (const p of removedFiles) {
          rmSync(join(process.cwd(), "public", "media", "submissions", p), { force: true });
        }
      } catch { /* ignore */ }
    }
    return { ok: true };
  });

/** 본인(또는 관리자) 작품 삭제 — 좋아요·댓글·평가·업로드 파일까지 정리. */
export const deleteSubmission = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { readStore, writeStore, requireUser, loadRoster } = await import("@/lib/local-store.server");
    const user = requireUser();
    const store = readStore();
    const s = store.submissions.find((x) => x.id === data.id);
    if (!s) throw new Error("작품을 찾을 수 없습니다.");
    if (s.user_id !== user.empNo) {
      const me = (await loadRoster()).get(user.empNo);
      if (!me?.roles.includes("admin")) throw new Error("본인 작품만 삭제할 수 있습니다.");
    }
    store.submissions = store.submissions.filter((x) => x.id !== data.id);
    store.likes = store.likes.filter((l) => l.submission_id !== data.id);
    store.comments = store.comments.filter((c) => c.submission_id !== data.id);
    store.evaluations = store.evaluations.filter((e) => e.submission_id !== data.id);
    writeStore(store);
    // 업로드 파일 정리 (실패해도 무시)
    try {
      const { rmSync } = await import("node:fs");
      const { join } = await import("node:path");
      const base = join(process.cwd(), "public", "media");
      if (s.thumbnail_url) rmSync(join(base, "thumbnails", s.thumbnail_url), { force: true });
      for (const f of s.files ?? []) rmSync(join(base, "submissions", f.file_path), { force: true });
    } catch { /* ignore */ }
    return { ok: true };
  });
