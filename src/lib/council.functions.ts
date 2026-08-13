import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// AI 협의체 혁신과제 선정 — 위원(당선 7인)만 접근. 저장은 data/db.json.

/** 내 담당 실/팀의 작품 목록 + 내 선정 현황 (썸네일·설명 포함) */
export const listCouncilWorks = createServerFn({ method: "GET" })
  .handler(async () => {
    const { readStore, requireUser, mediaUrl, loadRoster, liveProfile } = await import("@/lib/local-store.server");
    const { councilMember, COUNCIL_MAX_PICKS } = await import("@/lib/council");
    const { normalizeTeam } = await import("@/lib/org");
    const user = requireUser();
    const member = councilMember(user.empNo);
    if (!member) throw new Error("AI 협의체 위원만 접근할 수 있습니다.");
    const store = readStore();
    const roster = await loadRoster();
    const likeCounts = new Map<string, number>();
    for (const l of store.likes) likeCounts.set(l.submission_id, (likeCounts.get(l.submission_id) ?? 0) + 1);
    const myPicks = (store.councilPicks ?? []).filter((p) => p.empNo === user.empNo);
    const reasonMap = new Map(myPicks.map((p) => [p.submissionId, p.reason]));
    const teams = new Set(member.teams);
    const works = store.submissions
      .map((s) => ({ s, author: liveProfile(roster, s.user_id, s.profiles), likes: likeCounts.get(s.id) ?? 0 }))
      .filter(({ author }) => teams.has(normalizeTeam(author.team)))
      // 좋아요 많은 순 (동점은 최신순)
      .sort((a, b) => b.likes - a.likes || (a.s.created_at < b.s.created_at ? 1 : -1))
      .map(({ s, author }) => ({
        id: s.id,
        title: s.title,
        thumbnailUrl: mediaUrl("thumbnails", s.thumbnail_url),
        author: { name: author.name, team: author.team, position: author.position },
        authorEmpNo: s.user_id,
        features: s.features ?? "",
        description: s.description ?? "",
        techStack: s.tech_stack ?? "",
        expectedImpact: s.expected_impact ?? "",
        likeCount: likeCounts.get(s.id) ?? 0,
        picked: reasonMap.has(s.id),
        reason: reasonMap.get(s.id) ?? "",
      }));
    return { scope: member.scope, teams: member.teams, maxPicks: COUNCIL_MAX_PICKS, pickedCount: myPicks.length, works };
  });

/** 작품 선정(또는 선정 이유 수정) — 최대 3개 */
export const setCouncilPick = createServerFn({ method: "POST" })
  .inputValidator((d: { submissionId: string; reason: string }) =>
    z.object({ submissionId: z.string().uuid(), reason: z.string().trim().max(1000) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { readStore, writeStore, requireUser } = await import("@/lib/local-store.server");
    const { councilMember, COUNCIL_MAX_PICKS } = await import("@/lib/council");
    const user = requireUser();
    if (!councilMember(user.empNo)) throw new Error("AI 협의체 위원만 선정할 수 있습니다.");
    const store = readStore();
    store.councilPicks ??= [];
    const now = new Date().toISOString();
    const existing = store.councilPicks.find((p) => p.empNo === user.empNo && p.submissionId === data.submissionId);
    if (existing) {
      existing.reason = data.reason;
      existing.updatedAt = now;
    } else {
      const mine = store.councilPicks.filter((p) => p.empNo === user.empNo).length;
      if (mine >= COUNCIL_MAX_PICKS) throw new Error(`혁신과제는 최대 ${COUNCIL_MAX_PICKS}개까지 선정할 수 있습니다.`);
      store.councilPicks.push({ empNo: user.empNo, submissionId: data.submissionId, reason: data.reason, createdAt: now, updatedAt: now });
    }
    writeStore(store);
    return { ok: true };
  });

/** 선정 취소 */
export const removeCouncilPick = createServerFn({ method: "POST" })
  .inputValidator((d: { submissionId: string }) => z.object({ submissionId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { readStore, writeStore, requireUser } = await import("@/lib/local-store.server");
    const { councilMember } = await import("@/lib/council");
    const user = requireUser();
    if (!councilMember(user.empNo)) throw new Error("AI 협의체 위원만 접근할 수 있습니다.");
    const store = readStore();
    store.councilPicks = (store.councilPicks ?? []).filter(
      (p) => !(p.empNo === user.empNo && p.submissionId === data.submissionId),
    );
    writeStore(store);
    return { ok: true };
  });

/** 내 협의체 정체성(명·미션·슬로건·바램) 조회 */
export const getCouncilIdentity = createServerFn({ method: "GET" })
  .handler(async () => {
    const { readStore, requireUser } = await import("@/lib/local-store.server");
    const { councilMember } = await import("@/lib/council");
    const user = requireUser();
    if (!councilMember(user.empNo)) throw new Error("AI 협의체 위원만 접근할 수 있습니다.");
    const cur = (readStore().councilIdentity ?? {})[user.empNo];
    return cur ?? { councilName: "", mission: "", slogan: "", hope: "" };
  });

/** 협의체 정체성 저장 */
export const saveCouncilIdentity = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      councilName: z.string().trim().max(200),
      mission: z.string().trim().max(2000),
      slogan: z.string().trim().max(500),
      hope: z.string().trim().max(3000),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { readStore, writeStore, requireUser } = await import("@/lib/local-store.server");
    const { councilMember } = await import("@/lib/council");
    const user = requireUser();
    if (!councilMember(user.empNo)) throw new Error("AI 협의체 위원만 접근할 수 있습니다.");
    const store = readStore();
    store.councilIdentity ??= {};
    store.councilIdentity[user.empNo] = { ...data, updatedAt: new Date().toISOString() };
    writeStore(store);
    return { ok: true };
  });

/** 혁신과제 선정 결과 열람 (관리자 또는 지정 열람자 — 김충환). 선정 내역만. */
export const getCouncilResults = createServerFn({ method: "GET" })
  .handler(async () => {
    const { readStore, requireUser, loadRoster, liveProfile, mediaUrl } = await import("@/lib/local-store.server");
    const { isCouncilResultViewer } = await import("@/lib/council");
    const user = requireUser();
    const roster = await loadRoster();
    const me = roster.get(user.empNo);
    const isAdmin = !!me?.roles.includes("admin");
    if (!isAdmin && !isCouncilResultViewer(user.empNo)) throw new Error("열람 권한이 없습니다.");
    const store = readStore();
    const subMap = new Map(store.submissions.map((s) => [s.id, s]));
    const nameOf = (empNo: string) => liveProfile(roster, empNo, undefined).name || empNo;
    const picks = (store.councilPicks ?? [])
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((p) => {
        const s = subMap.get(p.submissionId);
        const author = s ? liveProfile(roster, s.user_id, s.profiles) : null;
        return {
          councilName: nameOf(p.empNo),
          submissionTitle: s?.title ?? "(삭제된 작품)",
          thumbnailUrl: s ? mediaUrl("thumbnails", s.thumbnail_url) : "",
          authorName: author?.name ?? "",
          authorTeam: author?.team ?? "",
          reason: p.reason,
          createdAt: p.createdAt,
        };
      });
    return { picks };
  });

/** 관리자: 누가·무엇을·왜 선정했는지 + 협의체 정체성 전체 */
export const adminGetCouncil = createServerFn({ method: "GET" })
  .handler(async () => {
    const { readStore, requireAdmin, loadRoster, liveProfile, mediaUrl } = await import("@/lib/local-store.server");
    const { COUNCIL } = await import("@/lib/council");
    await requireAdmin();
    const store = readStore();
    const roster = await loadRoster();
    const subMap = new Map(store.submissions.map((s) => [s.id, s]));
    const nameOf = (empNo: string) => liveProfile(roster, empNo, undefined).name || empNo;

    const picks = (store.councilPicks ?? [])
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((p) => {
        const s = subMap.get(p.submissionId);
        const author = s ? liveProfile(roster, s.user_id, s.profiles) : null;
        return {
          councilName: nameOf(p.empNo),
          councilEmpNo: p.empNo,
          submissionTitle: s?.title ?? "(삭제된 작품)",
          thumbnailUrl: s ? mediaUrl("thumbnails", s.thumbnail_url) : "",
          features: s?.features ?? "",
          description: s?.description ?? "",
          techStack: s?.tech_stack ?? "",
          expectedImpact: s?.expected_impact ?? "",
          authorName: author?.name ?? "",
          authorTeam: author?.team ?? "",
          reason: p.reason,
          createdAt: p.createdAt,
        };
      });

    const identity = store.councilIdentity ?? {};
    const members = COUNCIL.map((m) => ({
      empNo: m.empNo,
      name: m.name,
      scope: m.scope,
      pickCount: (store.councilPicks ?? []).filter((p) => p.empNo === m.empNo).length,
      ...(identity[m.empNo] ?? { councilName: "", mission: "", slogan: "", hope: "" }),
    }));

    return { picks, members };
  });
