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
      team: p.team ?? "",
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
    const { readStore, writeStore, requireAdmin, hashPassword } = await import("@/lib/local-store.server");
    await requireAdmin();
    const store = readStore();
    const pw = (data.newPassword ?? "").trim();
    if (pw) {
      // 지정한 비밀번호로 설정 (해당 사용자는 이 비밀번호로 바로 로그인)
      store.passwords[data.userId] = hashPassword(pw);
    } else {
      // 빈 값이면 초기화: 변경된 비밀번호 삭제 → 초기 비밀번호(주민번호 앞 6자리)로 복귀
      delete store.passwords[data.userId];
    }
    writeStore(store);
    return { ok: true, set: !!pw };
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
    // 작품별 심사위원 상세(누가 몇 점 줬는지)
    const breakdownMap = new Map<string, any[]>();
    for (const e of store.evaluations) {
      const jp = liveProfile(roster, e.judge_id, e.profiles);
      const total = (e.innovation ?? 0) + (e.completeness ?? 0) + (e.utilization ?? 0);
      const list = breakdownMap.get(e.submission_id) ?? [];
      list.push({
        judgeName: jp.name || e.judge_id,
        judgeTeam: jp.team || "",
        judgePosition: jp.position || "",
        innovation: e.innovation ?? 0,
        completeness: e.completeness ?? 0,
        utilization: e.utilization ?? 0,
        total,
      });
      breakdownMap.set(e.submission_id, list);
    }
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
        judgeAvg: Math.round(judgeAvgRaw * 10) / 10,     // 0-100
        judgeScore: Math.round(judgeScore * 10) / 10,    // 0-80 (환산)
        likeCount,
        likeScore,                                       // 0-20
        final: Math.round(final * 10) / 10,
        breakdown: (breakdownMap.get(s.id) ?? []).sort((a, b) => b.total - a.total),
      };
    });
    rows.sort((a, b) => b.final - a.final);
    return rows.map((r, i) => ({ ...r, rank: i + 1 }));
  });

// ── 본선 30명 선발 (각 팀 1명 + 예비후보) ─────────────────────────────

function computeFinalOf(store: any, submissionId: string): { final: number; judgeCount: number; likeCount: number } {
  const likeCount = store.likes.filter((l: any) => l.submission_id === submissionId).length;
  const evs = store.evaluations.filter((e: any) => e.submission_id === submissionId);
  const avg = evs.length
    ? evs.reduce((a: number, e: any) => a + (e.innovation ?? 0) + (e.completeness ?? 0) + (e.utilization ?? 0), 0) / evs.length
    : 0;
  const final = Math.round(((avg / 100) * 80 + Math.min(likeCount, 20)) * 10) / 10;
  return { final, judgeCount: evs.length, likeCount };
}

/** 팀별 순위 + 본선/예비 상태 보드 (관리자 전용). */
export const adminGetSelectionBoard = createServerFn({ method: "GET" })
  .handler(async () => {
    const { readStore, requireAdmin, loadRoster, liveProfile } = await import("@/lib/local-store.server");
    const { normalizeTeam } = await import("@/lib/org");
    await requireAdmin();
    const store = readStore();
    const roster = await loadRoster();
    const sel = new Set(store.selection?.selected ?? []);
    const res = new Set(store.selection?.reserve ?? []);
    const exc = new Set(store.selection?.excluded ?? []);
    const byTeam = new Map<string, any[]>();
    for (const s of store.submissions) {
      const a = liveProfile(roster, s.user_id, s.profiles);
      const team = normalizeTeam(a.team) || "미지정";
      const { final, judgeCount, likeCount } = computeFinalOf(store, s.id);
      const status = sel.has(s.id) ? "selected" : res.has(s.id) ? "reserve" : exc.has(s.id) ? "excluded" : "none";
      const list = byTeam.get(team) ?? [];
      list.push({
        submissionId: s.id, title: s.title,
        authorName: a.name, authorPosition: a.position, authorTeam: a.team,
        final, judgeCount, likeCount, status,
      });
      byTeam.set(team, list);
    }
    const teams = [...byTeam.entries()]
      .map(([team, subs]) => {
        subs.sort((a, b) => b.final - a.final);
        return {
          team, submissions: subs,
          selectedCount: subs.filter((x) => x.status === "selected").length,
          reserveCount: subs.filter((x) => x.status === "reserve").length,
        };
      })
      .sort((a, b) => a.team.localeCompare(b.team, "ko"));
    return {
      teams,
      selectedCount: teams.reduce((a, t) => a + t.selectedCount, 0),
      reserveCount: teams.reduce((a, t) => a + t.reserveCount, 0),
      excludedCount: exc.size,
      teamsWithoutPick: teams.filter((t) => t.selectedCount === 0).map((t) => t.team),
    };
  });

/** 작품의 본선/예비/해제 상태 설정 (관리자 전용). */
export const adminSetSelectionStatus = createServerFn({ method: "POST" })
  .inputValidator((d: { submissionId: string; status: "selected" | "reserve" | "excluded" | "none" }) =>
    z.object({ submissionId: z.string().uuid(), status: z.enum(["selected", "reserve", "excluded", "none"]) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { readStore, writeStore, requireAdmin } = await import("@/lib/local-store.server");
    await requireAdmin();
    const store = readStore();
    const cur = { selected: [], reserve: [], excluded: [], ...(store.selection ?? {}) } as
      { selected: string[]; reserve: string[]; excluded: string[] };
    cur.selected = cur.selected.filter((id) => id !== data.submissionId);
    cur.reserve = cur.reserve.filter((id) => id !== data.submissionId);
    cur.excluded = (cur.excluded ?? []).filter((id) => id !== data.submissionId);
    if (data.status === "selected") cur.selected.push(data.submissionId);
    else if (data.status === "reserve") cur.reserve.push(data.submissionId);
    else if (data.status === "excluded") cur.excluded.push(data.submissionId);
    store.selection = cur;
    writeStore(store);
    return { ok: true };
  });

/** 각 팀 1위를 본선, 2위를 예비로 자동 선발 (기존 선택 덮어씀). */
export const adminAutoSelectTopPerTeam = createServerFn({ method: "POST" })
  .handler(async () => {
    const { readStore, writeStore, requireAdmin, loadRoster, liveProfile } = await import("@/lib/local-store.server");
    const { normalizeTeam } = await import("@/lib/org");
    await requireAdmin();
    const store = readStore();
    const roster = await loadRoster();
    const byTeam = new Map<string, { id: string; final: number }[]>();
    for (const s of store.submissions) {
      const a = liveProfile(roster, s.user_id, s.profiles);
      const team = normalizeTeam(a.team) || "미지정";
      const { final } = computeFinalOf(store, s.id);
      const list = byTeam.get(team) ?? [];
      list.push({ id: s.id, final });
      byTeam.set(team, list);
    }
    const selected: string[] = [];
    const reserve: string[] = [];
    for (const list of byTeam.values()) {
      list.sort((a, b) => b.final - a.final);
      if (list[0]) selected.push(list[0].id);
      if (list[1]) reserve.push(list[1].id);
    }
    store.selection = { selected, reserve, excluded: store.selection?.excluded ?? [] };
    writeStore(store);
    return { ok: true, selected: selected.length, reserve: reserve.length };
  });

/** All evaluations detailed (admin only). */
export const adminListEvaluations = createServerFn({ method: "GET" })
  .handler(async () => {
    const { readStore, requireAdmin, loadRoster, liveProfile } = await import("@/lib/local-store.server");
    await requireAdmin();
    const store = readStore();
    const roster = await loadRoster();
    const titleMap = new Map(store.submissions.map((s) => [s.id, s.title]));
    const authorMap = new Map(
      store.submissions.map((s) => {
        const a = liveProfile(roster, s.user_id, s.profiles);
        return [s.id, { name: a.name, team: a.team, position: a.position }];
      }),
    );
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
        author: authorMap.get(e.submission_id) ?? null,
        profiles: e.profiles ?? null,
      }));
  });

/** 평가 내역 전체 초기화 — 좋아요·작품은 유지, 평가만 삭제 (관리자 전용). */
export const adminResetEvaluations = createServerFn({ method: "POST" })
  .handler(async () => {
    const { readStore, writeStore, requireAdmin } = await import("@/lib/local-store.server");
    await requireAdmin();
    const store = readStore();
    const removed = store.evaluations.length;
    store.evaluations = [];
    writeStore(store);
    return { ok: true, removed };
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
    // 이재용 매니저(대회 운영)가 준 좋아요는 관리자 내역에서도 숨긴다.
    const HIDDEN_LIKER_EMP_NOS = ["82211489"];
    return [...store.likes]
      .filter((l) => !HIDDEN_LIKER_EMP_NOS.includes(l.user_id))
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .map((l, i) => {
        const liker = liveProfile(roster, l.user_id, undefined);
        const author = authorMap.get(l.submission_id);
        return {
          key: `${l.user_id}-${l.submission_id}-${l.created_at}-${i}`,
          submissionId: l.submission_id,
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

/** 작품별 좋아요 수 (관리자 전용) — 하트 조정용. */
export const adminListSubmissionLikeCounts = createServerFn({ method: "GET" })
  .handler(async () => {
    const { readStore, requireAdmin, loadRoster, liveProfile } = await import("@/lib/local-store.server");
    await requireAdmin();
    const store = readStore();
    const roster = await loadRoster();
    const likeMap = new Map<string, number>();
    for (const l of store.likes) likeMap.set(l.submission_id, (likeMap.get(l.submission_id) ?? 0) + 1);
    return store.submissions
      .map((s) => {
        const a = liveProfile(roster, s.user_id, s.profiles);
        return {
          submissionId: s.id,
          title: s.title,
          author: `${a.team ? a.team + " · " : ""}${a.name}`,
          likeCount: likeMap.get(s.id) ?? 0,
        };
      })
      .sort((a, b) => b.likeCount - a.likeCount);
  });

/** 하트 조정 (관리자 전용) — delta -1: 최근 좋아요 1개 제거 / +1: 운영 좋아요 1개 추가. */
export const adminAdjustLike = createServerFn({ method: "POST" })
  .inputValidator((d: { submissionId: string; delta: number }) =>
    z.object({ submissionId: z.string().uuid(), delta: z.number().int().min(-1).max(1) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { readStore, writeStore, requireAdmin } = await import("@/lib/local-store.server");
    await requireAdmin();
    const store = readStore();
    if (data.delta < 0) {
      // 해당 작품의 가장 최근 좋아요 1개 제거
      let removeIdx = -1;
      for (let i = 0; i < store.likes.length; i++) {
        const l = store.likes[i];
        if (l.submission_id !== data.submissionId) continue;
        if (removeIdx < 0 || l.created_at > store.likes[removeIdx].created_at) removeIdx = i;
      }
      if (removeIdx >= 0) store.likes.splice(removeIdx, 1);
    } else if (data.delta > 0) {
      // 운영 좋아요 추가 (82211489 = 내역에서 숨겨지는 운영 계정)
      store.likes.push({ submission_id: data.submissionId, user_id: "82211489", created_at: new Date().toISOString() });
    }
    writeStore(store);
    const count = store.likes.filter((l) => l.submission_id === data.submissionId).length;
    return { ok: true, likeCount: count };
  });

/** 특정 좋아요 1건 삭제 (관리자 전용). */
export const adminRemoveLike = createServerFn({ method: "POST" })
  .inputValidator((d: { submissionId: string; userId: string; createdAt: string }) =>
    z.object({ submissionId: z.string(), userId: z.string(), createdAt: z.string() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { readStore, writeStore, requireAdmin } = await import("@/lib/local-store.server");
    await requireAdmin();
    const store = readStore();
    const idx = store.likes.findIndex(
      (l) => l.submission_id === data.submissionId && l.user_id === data.userId && l.created_at === data.createdAt,
    );
    if (idx >= 0) store.likes.splice(idx, 1);
    writeStore(store);
    return { ok: true };
  });

/** 평가자별 심사 진행 현황 — 누가 몇 건 중 몇 건을 심사했는지, 안 한 작품은 무엇인지. */
export const adminJudgeProgress = createServerFn({ method: "GET" })
  .handler(async () => {
    const { readStore, requireAdmin, loadRoster, liveProfile } = await import("@/lib/local-store.server");
    const { sameSil, silOfTeam } = await import("@/lib/org");
    await requireAdmin();
    const store = readStore();
    const roster = await loadRoster();
    const banned = new Set(store.bannedFromJudges ?? []);
    // 작품 + 작성자 팀 캐시
    const subs = store.submissions.map((s) => ({
      id: s.id,
      title: s.title,
      author: liveProfile(roster, s.user_id, s.profiles),
      user_id: s.user_id,
    }));
    // 평가자별 이미 평가한 submission id
    const doneByJudge = new Map<string, Set<string>>();
    for (const e of store.evaluations) {
      const set = doneByJudge.get(e.judge_id) ?? new Set<string>();
      set.add(e.submission_id);
      doneByJudge.set(e.judge_id, set);
    }
    const judges = Array.from(roster.values()).filter((p) => p.roles.includes("judge"));
    const rows = judges.map((j) => {
      // 담당(본인이 속한 실) 작품 — 밴 제외, 본인 작품 제외
      const assigned = subs.filter(
        (s) => !banned.has(s.user_id) && s.user_id !== j.empNo && sameSil(j.team, s.author.team),
      );
      const done = doneByJudge.get(j.empNo) ?? new Set<string>();
      const doneCount = assigned.filter((s) => done.has(s.id)).length;
      const remainingWorks = assigned
        .filter((s) => !done.has(s.id))
        .map((s) => ({ title: s.title, authorName: s.author.name, authorTeam: s.author.team }));
      return {
        empNo: j.empNo,
        name: j.name,
        team: j.team ?? "",
        position: j.position,
        sil: silOfTeam(j.team) ?? "",
        assigned: assigned.length,
        done: doneCount,
        remaining: assigned.length - doneCount,
        remainingWorks,
      };
    });
    // 안 한 게 많은(미완료) 순 → 이름 순
    rows.sort((a, b) => b.remaining - a.remaining || a.name.localeCompare(b.name, "ko"));
    return rows;
  });

/** 평가자(심사위원) 명단 (관리자 전용). */
export const adminListJudges = createServerFn({ method: "GET" })
  .handler(async () => {
    const { requireAdmin, loadRoster } = await import("@/lib/local-store.server");
    await requireAdmin();
    const roster = await loadRoster();
    return Array.from(roster.values())
      .filter((p) => p.roles.includes("judge"))
      .map((p) => ({
        empNo: p.empNo,
        name: p.name,
        team: p.team ?? "",
        position: p.position,
        alsoAdmin: p.roles.includes("admin"),
      }))
      .sort((a, b) => a.team.localeCompare(b.team, "ko") || a.name.localeCompare(b.name, "ko"));
  });

/** 평가 제외(밴) 관리 — 참여자 목록 + 밴 여부 (관리자 전용). */
export const adminListBanRoster = createServerFn({ method: "GET" })
  .handler(async () => {
    const { requireAdmin, loadRoster, readStore } = await import("@/lib/local-store.server");
    await requireAdmin();
    const roster = await loadRoster();
    const banned = new Set(readStore().bannedFromJudges ?? []);
    return Array.from(roster.values())
      .filter((p) => p.roles.includes("participant"))
      .map((p) => ({
        empNo: p.empNo,
        name: p.name,
        team: p.team ?? "",
        position: p.position,
        banned: banned.has(p.empNo),
      }))
      .sort((a, b) =>
        Number(b.banned) - Number(a.banned) ||
        a.team.localeCompare(b.team, "ko") ||
        a.name.localeCompare(b.name, "ko"),
      );
  });

/** 평가 담당 지정 보드 — 담당 평가자가 없는 작품(구조적 공백) + 현재 지정 현황. */
export const adminGetAssignmentBoard = createServerFn({ method: "GET" })
  .handler(async () => {
    const { readStore, requireAdmin, loadRoster, liveProfile } = await import("@/lib/local-store.server");
    const { sameSil } = await import("@/lib/org");
    await requireAdmin();
    const store = readStore();
    const roster = await loadRoster();
    const people = Array.from(roster.values());
    const judges = people.filter((p) => p.roles.includes("judge"));
    // 지정 가능한 평가자 = 평가자 + 관리자
    const assignees = people
      .filter((p) => p.roles.includes("judge") || p.roles.includes("admin"))
      .map((p) => ({ empNo: p.empNo, name: p.name, team: p.team ?? "", position: p.position }))
      .sort((a, b) => a.name.localeCompare(b.name, "ko"));
    // submissionId → 지정된 평가자 사번
    const assignMap = new Map<string, string>();
    for (const [emp, ids] of Object.entries(store.evalAssignments ?? {})) for (const id of ids) assignMap.set(id, emp);
    const rows = store.submissions
      .map((s) => {
        const author = liveProfile(roster, s.user_id, s.profiles);
        const eligible = judges.filter((j) => j.empNo !== s.user_id && sameSil(j.team, author.team)).length;
        const assignedTo = assignMap.get(s.id) ?? null;
        return { s, author, eligible, assignedTo };
      })
      .filter((r) => r.eligible === 0 || r.assignedTo) // 평가자 없는 작품 또는 이미 지정된 작품
      .map((r) => ({
        submissionId: r.s.id,
        title: r.s.title,
        author: { name: r.author.name, team: r.author.team, position: r.author.position },
        eligibleJudges: r.eligible,
        assignedTo: r.assignedTo,
        assignedName: r.assignedTo ? liveProfile(roster, r.assignedTo, undefined).name || r.assignedTo : null,
      }))
      .sort((a, b) => a.eligibleJudges - b.eligibleJudges || a.author.team.localeCompare(b.author.team, "ko"));
    return { rows, assignees };
  });

/** 작품의 평가 담당자 지정/해제 (관리자 전용). judgeEmpNo 가 빈 값이면 해제. */
export const adminSetAssignment = createServerFn({ method: "POST" })
  .inputValidator((d: { submissionId: string; judgeEmpNo: string }) =>
    z.object({ submissionId: z.string().uuid(), judgeEmpNo: z.string().default("") }).parse(d),
  )
  .handler(async ({ data }) => {
    const { readStore, writeStore, requireAdmin, loadRoster } = await import("@/lib/local-store.server");
    await requireAdmin();
    const store = readStore();
    const ea: Record<string, string[]> = store.evalAssignments ?? {};
    // 기존 지정 제거
    for (const emp of Object.keys(ea)) ea[emp] = ea[emp].filter((id) => id !== data.submissionId);
    if (data.judgeEmpNo) {
      const roster = await loadRoster();
      if (!roster.get(data.judgeEmpNo)) throw new Error("존재하지 않는 평가자입니다.");
      (ea[data.judgeEmpNo] ??= []).push(data.submissionId);
    }
    for (const emp of Object.keys(ea)) if (ea[emp].length === 0) delete ea[emp];
    store.evalAssignments = ea;
    writeStore(store);
    return { ok: true };
  });

/** 특정 사번을 평가자 화면에서 숨기기/해제 (관리자 전용). */
export const adminSetBan = createServerFn({ method: "POST" })
  .inputValidator((d: { empNo: string; banned: boolean }) =>
    z.object({ empNo: z.string().min(1), banned: z.boolean() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { readStore, writeStore, requireAdmin } = await import("@/lib/local-store.server");
    await requireAdmin();
    const store = readStore();
    const set = new Set(store.bannedFromJudges ?? []);
    if (data.banned) set.add(data.empNo);
    else set.delete(data.empNo);
    store.bannedFromJudges = [...set];
    writeStore(store);
    return { ok: true, banned: data.banned };
  });

/** 평가자 화면에서 숨길 사번 목록 (심사위원·관리자 조회용). */
export const listBannedFromJudges = createServerFn({ method: "GET" })
  .handler(async () => {
    const { readStore, requireJudgeOrAdmin } = await import("@/lib/local-store.server");
    await requireJudgeOrAdmin();
    return readStore().bannedFromJudges ?? [];
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
