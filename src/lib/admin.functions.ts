import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// 관리자 기능 — 사용자 명단은 프로젝트 루트의 DB 파일이 원본이고,
// 작품/평가/좋아요 데이터는 data/db.json 에서 집계한다 (Supabase 불필요).

const ROSTER_GUIDE =
  "사용자 명단은 프로젝트 폴더의 DB 파일로 관리됩니다. DB 파일을 수정하면 즉시 반영됩니다.";

const UserInput = z.object({
  name: z.string(),
  employeeNo: z.string(),
  jumin: z.string(),
  team: z.string().optional(),
  position: z.string().optional(),
  role: z.enum(["participant", "judge", "admin"]),
});

/** Create a user (admin only) — DB 파일 안내. */
export const adminCreateUser = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => UserInput.parse(d))
  .handler(async () => {
    const { requireAdmin } = await import("@/lib/local-store.server");
    await requireAdmin();
    throw new Error(ROSTER_GUIDE);
  });

/** Bulk CSV import — DB 파일 안내. */
export const adminImportUsers = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ rows: z.array(UserInput) }).parse(d))
  .handler(async () => {
    const { requireAdmin } = await import("@/lib/local-store.server");
    await requireAdmin();
    throw new Error(ROSTER_GUIDE);
  });

export const adminListUsers = createServerFn({ method: "GET" })
  .handler(async () => {
    const { requireAdmin, loadRoster } = await import("@/lib/local-store.server");
    await requireAdmin();
    const { readStore } = await import("@/lib/local-store.server");
    const roster = await loadRoster();
    const passwords = readStore().passwords;
    return Array.from(roster.values()).map((p) => ({
      id: p.empNo,
      employee_no: p.empNo,
      name: p.name,
      team: "",
      position: p.position,
      must_change_password: !passwords[p.empNo], // 아직 초기 비밀번호 상태
      created_at: null,
      role: p.roles.includes("admin") ? "admin" : p.roles.includes("judge") ? "judge" : "participant",
    }));
  });

export const adminResetPassword = createServerFn({ method: "POST" })
  .inputValidator((d: { userId: string; newPassword: string }) =>
    z.object({ userId: z.string(), newPassword: z.string().optional().default("") }).parse(d),
  )
  .handler(async ({ data }) => {
    const { readStore, writeStore, requireAdmin } = await import("@/lib/local-store.server");
    await requireAdmin();
    // 초기화: 변경된 비밀번호를 삭제해 초기 비밀번호(주민번호 앞 6자리)로 되돌리고,
    // 다음 로그인 때 다시 변경하게 만든다.
    const store = readStore();
    delete store.passwords[data.userId];
    writeStore(store);
    return { ok: true };
  });

export const adminDeleteUser = createServerFn({ method: "POST" })
  .inputValidator((d: { userId: string }) => z.object({ userId: z.string() }).parse(d))
  .handler(async () => {
    const { requireAdmin } = await import("@/lib/local-store.server");
    await requireAdmin();
    throw new Error(ROSTER_GUIDE);
  });

/** Team CRUD — data/db.json 에 저장. */
export const adminListTeams = createServerFn({ method: "GET" })
  .handler(async () => {
    const { readStore, requireAdmin } = await import("@/lib/local-store.server");
    await requireAdmin();
    return [...readStore().teams].sort((a, b) => String(a.name).localeCompare(String(b.name), "ko"));
  });

export const adminCreateTeam = createServerFn({ method: "POST" })
  .inputValidator((d: { name: string }) =>
    z.object({ name: z.string().trim().min(1).max(50) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { readStore, writeStore, requireAdmin } = await import("@/lib/local-store.server");
    await requireAdmin();
    const store = readStore();
    if (store.teams.some((t) => t.name === data.name)) throw new Error("이미 있는 실/팀입니다.");
    store.teams.push({ id: crypto.randomUUID(), name: data.name, created_at: new Date().toISOString() });
    writeStore(store);
    return { ok: true };
  });

export const adminDeleteTeam = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { readStore, writeStore, requireAdmin } = await import("@/lib/local-store.server");
    await requireAdmin();
    const store = readStore();
    store.teams = store.teams.filter((t) => t.id !== data.id);
    writeStore(store);
    return { ok: true };
  });

/** Rankings: 심사 점수 (80%) + 좋아요 정규화 (20%) */
export const adminGetRankings = createServerFn({ method: "GET" })
  .handler(async () => {
    const { readStore, requireAdmin, loadRoster, liveProfile } = await import("@/lib/local-store.server");
    await requireAdmin();
    const store = readStore();
    const roster = await loadRoster();
    const likeMap = new Map<string, number>();
    for (const l of store.likes) likeMap.set(l.submission_id, (likeMap.get(l.submission_id) ?? 0) + 1);
    const evalMap = new Map<string, { total: number; count: number }>();
    for (const e of store.evaluations) {
      const total = (e.innovation ?? 0) + (e.completeness ?? 0) + (e.utilization ?? 0);
      const cur = evalMap.get(e.submission_id) ?? { total: 0, count: 0 };
      cur.total += total; cur.count += 1;
      evalMap.set(e.submission_id, cur);
    }
    // 배점: 혁신성 40 + 완성도 40 + 활용도 20 = 100 raw → ×0.8 (0-80점)
    //       좋아요 1개당 1점, 최대 20점 (0-20점)  →  최종 100점
    const rows = store.submissions.map((s) => {
      const ev = evalMap.get(s.id);
      const judgeAvgRaw = ev && ev.count > 0 ? ev.total / ev.count : 0; // 0-100
      const judgeScore = (judgeAvgRaw / 100) * 80;                      // 0-80
      const likeCount = likeMap.get(s.id) ?? 0;
      const likeScore = Math.min(likeCount, 20);                       // 0-20
      const final = judgeScore + likeScore;
      return {
        submissionId: s.id,
        title: s.title,
        author: liveProfile(roster, s.user_id, s.profiles),
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
  .handler(async () => {
    const { readStore, requireAdmin } = await import("@/lib/local-store.server");
    await requireAdmin();
    const store = readStore();
    const titleMap = new Map(store.submissions.map((s) => [s.id, s.title]));
    return [...store.evaluations]
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .map((e) => ({
        id: e.id,
        submission_id: e.submission_id,
        innovation: e.innovation,
        completeness: e.completeness,
        utilization: e.utilization,
        created_at: e.created_at,
        judge_id: e.judge_id,
        submissions: { title: titleMap.get(e.submission_id) ?? "" },
        profiles: e.profiles ?? null,
      }));
  });

/** 좋아요 상세 내역 (관리자 전용) — 누가 어떤 작품에 좋아요를 눌렀는지. */
export const adminListLikes = createServerFn({ method: "GET" })
  .handler(async () => {
    const { readStore, requireAdmin, loadRoster, liveProfile } = await import("@/lib/local-store.server");
    await requireAdmin();
    const store = readStore();
    const roster = await loadRoster();
    const titleMap = new Map(store.submissions.map((s) => [s.id, s.title]));
    const authorMap = new Map(store.submissions.map((s) => [s.id, liveProfile(roster, s.user_id, s.profiles)]));
    return [...store.likes]
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .map((l, i) => {
        const liker = liveProfile(roster, l.user_id, undefined);
        const author = authorMap.get(l.submission_id);
        return {
          key: `${l.user_id}-${l.submission_id}-${l.created_at}-${i}`,
          likerName: liker.name || l.user_id,
          likerTeam: liker.team || "",
          likerPosition: liker.position || "",
          likerEmpNo: l.user_id,
          submissionTitle: titleMap.get(l.submission_id) ?? "(삭제된 작품)",
          submissionAuthor: author ? `${author.team ? author.team + " · " : ""}${author.name}` : "",
          createdAt: l.created_at,
        };
      });
  });

/** Team-wise submission counts (visible to judges + admins). */
export const listTeamSubmissionCounts = createServerFn({ method: "GET" })
  .handler(async () => {
    const { readStore, requireJudgeOrAdmin, loadRoster, liveProfile } = await import("@/lib/local-store.server");
    await requireJudgeOrAdmin();
    const store = readStore();
    const roster = await loadRoster();
    const map = new Map<string, number>();
    for (const s of store.submissions) {
      const team = liveProfile(roster, s.user_id, s.profiles).team || "미지정";
      map.set(team, (map.get(team) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([team, count]) => ({ team, count }))
      .sort((a, b) => b.count - a.count);
  });
