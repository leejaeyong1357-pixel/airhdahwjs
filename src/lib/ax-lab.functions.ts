import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// AX LAB — 경진대회 104건을 1/2/3단계로 분류하고, 실별 고도화 목표를 세워
// 구성원이 직접 고도화를 신청 → AX협의체 검토 → 보안검증 → 승인 → SaaS 등록까지
// 이어지는 파이프라인. 저장은 기존 data/db.json (local-store.server.ts) 그대로 사용.

const STAGE = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
const STATUS = z.enum([
  "requested", "reviewing", "developing", "field", "security",
  "approved", "saas", "serial", "rollout", "rejected",
]);

// ── 공용 헬퍼 ────────────────────────────────────────────────
/** AX LAB 관리 기능 접근 — 정식 관리자 또는 AX LAB 전용 뷰어(김충환)만 허용. */
async function requireAxLabAdmin() {
  const { requireUser, loadRoster } = await import("@/lib/local-store.server");
  const { isAxLabAdminViewer } = await import("@/lib/ax-lab");
  const user = requireUser();
  if (isAxLabAdminViewer(user.empNo)) return user;
  const roster = await loadRoster();
  if (!roster.get(user.empNo)?.roles.includes("admin")) {
    throw new Error("AX LAB 관리자만 접근할 수 있습니다.");
  }
  return user;
}

async function resolveWork(store: any, roster: any, workId: string) {
  const c = store.submissions.find((s: any) => s.id === workId);
  if (c) {
    const { liveProfile } = await import("@/lib/local-store.server");
    const author = liveProfile(roster, c.user_id, c.profiles);
    return { id: c.id, source: "contest" as const, title: c.title, user_id: c.user_id, author };
  }
  const n = (store.axNewWorks ?? []).find((w: any) => w.id === workId);
  if (n) {
    const { liveProfile } = await import("@/lib/local-store.server");
    const author = liveProfile(roster, n.user_id, undefined);
    return { id: n.id, source: "new" as const, title: n.title, user_id: n.user_id, author };
  }
  return null;
}

// ── 전체 현황 (상단 통계) ────────────────────────────────────
export const axGetOverview = createServerFn({ method: "GET" })
  .handler(async () => {
    const { readStore, requireUser } = await import("@/lib/local-store.server");
    requireUser();
    const store = readStore();
    const stage = store.axStage ?? {};
    const requests = store.axRequests ?? [];
    const totalContestWorks = store.submissions.length;
    const advancementTargetCount = Object.values(stage).filter((s) => s === 3).length;
    const requestedCount = requests.length;
    const saasApprovedCount = requests.filter((r) => r.status === "saas").length;
    // 단계별 건수 — 실별 현황 표와 같은 기준(경진대회 출품작)으로 센다.
    const stageCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const s of store.submissions) {
      const v = stage[s.id];
      if (v) stageCounts[v] += 1;
    }
    return { totalContestWorks, advancementTargetCount, requestedCount, saasApprovedCount, stageCounts };
  });

/**
 * 10단계 파이프라인 — 각 단계에 누가 있는지, 내 신청은 몇 단계인지.
 * 협의체가 신청 status 를 바꾸면 그대로 반영된다.
 */
export const axGetPipeline = createServerFn({ method: "GET" })
  .handler(async () => {
    const { readStore, requireUser, loadRoster, liveProfile } = await import("@/lib/local-store.server");
    const { STEP_OF } = await import("@/lib/ax-stages");
    const user = requireUser();
    const store = readStore();
    const roster = await loadRoster();

    const titleOf = (workId: string) =>
      store.submissions.find((s: any) => s.id === workId)?.title
      ?? (store.axNewWorks ?? []).find((w: any) => w.id === workId)?.title
      ?? "(삭제된 작품)";

    const steps: Record<number, { id: string; title: string; authorName: string; authorTeam: string; mine: boolean }[]> = {};
    for (let n = 1; n <= 10; n++) steps[n] = [];

    let myStep: number | null = null;
    for (const r of store.axRequests ?? []) {
      if (r.status === "rejected") continue;
      const n = STEP_OF[r.status];
      if (!n) continue;
      const author = liveProfile(roster, r.user_id, undefined);
      const mine = r.user_id === user.empNo;
      if (mine) myStep = n;
      steps[n].push({ id: r.id, title: titleOf(r.workId), authorName: author.name, authorTeam: author.team, mine });
    }

    return {
      // 1단계(작품 등록)는 경진대회 출품작 전체
      totalWorks: store.submissions.length,
      steps,
      myStep,
    };
  });

// ── 1차 보안검증 안내 (프롬프트 + 배너) ─────────────────────
const DEFAULT_SECURITY_PROMPT = `아래 기준으로 지금 개발 중인 과제의 보안을 점검하고, 문제가 되는 부분과 수정 방법을 알려줘.

1. 인증·권한
   - 로그인하지 않은 사용자가 접근할 수 있는 화면·API 가 있는지
   - 다른 사람의 데이터를 조회·수정할 수 있는 경로가 있는지

2. 비밀정보 관리
   - API 키·비밀번호·토큰이 소스코드나 프론트엔드에 노출돼 있는지
   - 설정 파일이 저장소에 함께 올라가 있는지

3. 개인정보·사내정보
   - 수집하는 항목 중 꼭 필요하지 않은 개인정보가 있는지
   - 사내 정보가 외부 서비스(AI API 포함)로 전송되는 구간이 있는지
   - 로그에 개인정보가 그대로 남는지

4. 입력값 검증
   - 사용자 입력이 그대로 DB 질의나 명령어에 들어가는 곳이 있는지
   - 업로드 파일의 확장자·크기 제한이 있는지

5. 운영
   - 오류 화면에 내부 경로·스택이 그대로 노출되는지
   - 접속 기록이 남는지

각 항목별로 [문제 없음 / 확인 필요 / 조치 필요] 로 표시하고, 조치가 필요한 항목은 수정 코드를 함께 제시해줘.`;

export const axGetSecurityGuide = createServerFn({ method: "GET" })
  .handler(async () => {
    const { readStore, requireUser } = await import("@/lib/local-store.server");
    requireUser();
    const g = readStore().axSecurityGuide;
    return {
      prompt: g?.prompt?.trim() ? g.prompt : DEFAULT_SECURITY_PROMPT,
      checklistImage: g?.checklistImage ?? "",
      openCriteriaImage: g?.openCriteriaImage ?? "",
    };
  });

export const axAdminSetSecurityGuide = createServerFn({ method: "POST" })
  .inputValidator((d: { prompt: string; checklistImage?: string; openCriteriaImage?: string }) =>
    z.object({
      prompt: z.string().max(10000),
      checklistImage: z.string().max(500).optional().default(""),
      openCriteriaImage: z.string().max(500).optional().default(""),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { readStore, writeStore } = await import("@/lib/local-store.server");
    await requireAxLabAdmin();
    const store = readStore();
    store.axSecurityGuide = {
      prompt: data.prompt,
      checklistImage: data.checklistImage,
      openCriteriaImage: data.openCriteriaImage,
    };
    writeStore(store);
    return { ok: true };
  });

// ── 실별·팀별 현황 보드 ──────────────────────────────────────
export const axGetOrgBoard = createServerFn({ method: "GET" })
  .handler(async () => {
    const { readStore, requireUser, loadRoster, liveProfile } = await import("@/lib/local-store.server");
    const { ORG, normalizeTeam, silOfTeam } = await import("@/lib/org");
    requireUser();
    const store = readStore();
    const roster = await loadRoster();
    const stage = store.axStage ?? {};
    const goals = store.axGoals ?? {};
    const requests = store.axRequests ?? [];

    // workId -> 실 이름 (작성자 팀 기준)
    const silOfWork = new Map<string, string | null>();
    for (const s of store.submissions) silOfWork.set(s.id, silOfTeam(liveProfile(roster, s.user_id, s.profiles).team));
    for (const w of store.axNewWorks ?? []) silOfWork.set(w.id, silOfTeam(liveProfile(roster, w.user_id, undefined).team));

    const teamOfWork = new Map<string, string>();
    for (const s of store.submissions) teamOfWork.set(s.id, normalizeTeam(liveProfile(roster, s.user_id, s.profiles).team) || "미지정");
    for (const w of store.axNewWorks ?? []) teamOfWork.set(w.id, normalizeTeam(liveProfile(roster, w.user_id, undefined).team) || "미지정");

    const silTeams = ORG.map((g) => {
      const teamStats = g.teams.map((team) => {
        const contestInTeam = store.submissions.filter((s: any) => teamOfWork.get(s.id) === team);
        const c1 = contestInTeam.filter((s: any) => stage[s.id] === 1).length;
        const c2 = contestInTeam.filter((s: any) => stage[s.id] === 2).length;
        const c3 = contestInTeam.filter((s: any) => stage[s.id] === 3).length;
        const c4 = contestInTeam.filter((s: any) => stage[s.id] === 4).length;
        const reqInTeam = requests.filter((r) => teamOfWork.get(r.workId) === team);
        const approvedInTeam = reqInTeam.filter((r) => r.status === "approved" || r.status === "saas").length;
        return { team, total: contestInTeam.length, stage1: c1, stage2: c2, stage3: c3, stage4: c4, requested: reqInTeam.length, approved: approvedInTeam };
      });
      const contestInSil = store.submissions.filter((s: any) => silOfWork.get(s.id) === g.name);
      const reqInSil = requests.filter((r) => silOfWork.get(r.workId) === g.name);
      return {
        sil: g.name,
        isDept: !!g.isDept,
        total: contestInSil.length,
        stage1: contestInSil.filter((s: any) => stage[s.id] === 1).length,
        stage2: contestInSil.filter((s: any) => stage[s.id] === 2).length,
        stage3: contestInSil.filter((s: any) => stage[s.id] === 3).length,
        stage4: contestInSil.filter((s: any) => stage[s.id] === 4).length,
        goal: goals[g.name] ?? 0,
        requested: reqInSil.length,
        approved: reqInSil.filter((r) => r.status === "approved" || r.status === "saas").length,
        teams: teamStats,
      };
    });

    return silTeams;
  });

/** 특정 팀의 작품 목록 (드릴다운) — 단계·신청상태 포함. */
export const axListTeamWorks = createServerFn({ method: "GET" })
  .inputValidator((d: { team: string }) => z.object({ team: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const { readStore, requireUser, mediaUrl, loadRoster, liveProfile } = await import("@/lib/local-store.server");
    const { normalizeTeam } = await import("@/lib/org");
    requireUser();
    const store = readStore();
    const roster = await loadRoster();
    const stage = store.axStage ?? {};
    const requests = store.axRequests ?? [];
    const reqByWork = new Map(requests.map((r) => [r.workId, r]));

    const contest = store.submissions
      .map((s: any) => ({ s, author: liveProfile(roster, s.user_id, s.profiles) }))
      .filter(({ author }) => normalizeTeam(author.team) === data.team)
      .map(({ s, author }) => ({
        id: s.id, source: "contest" as const, title: s.title,
        thumbnailUrl: mediaUrl("thumbnails", s.thumbnail_url),
        authorName: author.name, authorTeam: author.team, authorPosition: author.position,
        stage: stage[s.id] ?? null,
        request: reqByWork.get(s.id) ?? null,
        description: s.description ?? "", features: s.features ?? "",
        techStack: s.tech_stack ?? "", expectedImpact: s.expected_impact ?? "",
        files: (s.files ?? []).map((f: any) => ({ ...f, signedUrl: mediaUrl("submissions", f.file_path) })),
      }));

    const news = (store.axNewWorks ?? [])
      .map((w: any) => ({ w, author: liveProfile(roster, w.user_id, undefined) }))
      .filter(({ author }) => normalizeTeam(author.team) === data.team)
      .map(({ w, author }) => ({
        id: w.id, source: "new" as const, title: w.title, thumbnailUrl: "", files: [],
        authorName: author.name, authorTeam: author.team, authorPosition: author.position,
        stage: stage[w.id] ?? null,
        request: reqByWork.get(w.id) ?? null,
        description: w.description ?? "", features: "",
        techStack: w.techStack ?? "", expectedImpact: "",
      }));

    return [...contest, ...news];
  });

/**
 * 실별/팀별 현황 표의 숫자를 눌렀을 때 그 숫자에 해당하는 작품만 보여주기 위한 목록.
 * 집계(axGetOrgBoard)와 개수가 어긋나지 않도록 같은 기준을 쓴다 —
 * 전체·단계는 경진대회 출품작 기준, 신청·승인은 신규 등록작까지 포함.
 */
export const axListWorksBy = createServerFn({ method: "GET" })
  .inputValidator((d: { scope: "sil" | "team"; name: string; filter: string }) =>
    z.object({
      scope: z.enum(["sil", "team"]),
      name: z.string().min(1),
      filter: z.enum(["all", "stage1", "stage2", "stage3", "stage4", "requested", "approved"]),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { readStore, requireUser, mediaUrl, loadRoster, liveProfile } = await import("@/lib/local-store.server");
    const { normalizeTeam, silOfTeam } = await import("@/lib/org");
    requireUser();
    const store = readStore();
    const roster = await loadRoster();
    const stage = store.axStage ?? {};
    const reqByWork = new Map((store.axRequests ?? []).map((r) => [r.workId, r]));

    const contest = store.submissions.map((s: any) => {
      const author = liveProfile(roster, s.user_id, s.profiles);
      return {
        id: s.id, source: "contest" as const, title: s.title,
        thumbnailUrl: mediaUrl("thumbnails", s.thumbnail_url),
        authorName: author.name, authorTeam: author.team, authorPosition: author.position,
        stage: stage[s.id] ?? null, request: reqByWork.get(s.id) ?? null,
        description: s.description ?? "", features: s.features ?? "",
        techStack: s.tech_stack ?? "", expectedImpact: s.expected_impact ?? "",
        files: (s.files ?? []).map((f: any) => ({ ...f, signedUrl: mediaUrl("submissions", f.file_path) })),
      };
    });
    const news = (store.axNewWorks ?? []).map((w: any) => {
      const author = liveProfile(roster, w.user_id, undefined);
      return {
        id: w.id, source: "new" as const, title: w.title, thumbnailUrl: "", files: [],
        authorName: author.name, authorTeam: author.team, authorPosition: author.position,
        stage: stage[w.id] ?? null, request: reqByWork.get(w.id) ?? null,
        description: w.description ?? "", features: "",
        techStack: w.techStack ?? "", expectedImpact: "",
      };
    });

    const inScope = (rows: any[]) =>
      rows.filter((r) =>
        data.scope === "team" ? normalizeTeam(r.authorTeam) === data.name : silOfTeam(r.authorTeam) === data.name,
      );

    if (data.filter === "requested") return inScope([...contest, ...news]).filter((r) => !!r.request);
    if (data.filter === "approved") {
      return inScope([...contest, ...news]).filter((r) => r.request?.status === "approved" || r.request?.status === "saas");
    }
    const scoped = inScope(contest);
    if (data.filter === "all") return scoped;
    const want = Number(data.filter.replace("stage", ""));
    return scoped.filter((r) => r.stage === want);
  });

// ── 구성원: 내 작품 + 고도화 신청 ────────────────────────────
/** 신청 위저드용 — 내가 신청 가능한 작품 목록 (경진대회 출품작 + 신규 등록작). */
export const axGetMyWorks = createServerFn({ method: "GET" })
  .handler(async () => {
    const { readStore, requireUser, loadRoster, liveProfile } = await import("@/lib/local-store.server");
    const { silOfTeam } = await import("@/lib/org");
    const user = requireUser();
    const store = readStore();
    const roster = await loadRoster();
    const me = liveProfile(roster, user.empNo, undefined);
    const stage = store.axStage ?? {};
    const requests = store.axRequests ?? [];
    const reqByWork = new Map(requests.map((r) => [r.workId, r]));
    const sil = silOfTeam(me.team);
    const orgLabel = me.team ? (sil && sil !== me.team ? `${sil} > ${me.team}` : me.team) : "미지정";

    const contestWork = store.submissions.find((s: any) => s.user_id === user.empNo);
    const myNewWorks = (store.axNewWorks ?? []).filter((w: any) => w.user_id === user.empNo);

    return {
      authorName: me.name, authorTeam: me.team, orgLabel,
      contestWork: contestWork
        ? {
            id: contestWork.id, source: "contest" as const, title: contestWork.title,
            description: contestWork.description ?? "",
            stage: stage[contestWork.id] ?? null,
            request: reqByWork.get(contestWork.id) ?? null,
          }
        : null,
      newWorks: myNewWorks.map((w: any) => ({
        id: w.id, source: "new" as const, title: w.title, description: w.description, techStack: w.techStack,
        stage: stage[w.id] ?? null, request: reqByWork.get(w.id) ?? null,
      })),
    };
  });

/** 새로운 아이디어 등록 (경진대회 이후에 만든 것). */
export const axRegisterNewWork = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      title: z.string().trim().min(1).max(120),
      description: z.string().trim().min(1).max(3000),
      techStack: z.string().trim().max(500).optional().default(""),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { readStore, writeStore, requireUser } = await import("@/lib/local-store.server");
    const user = requireUser();
    const store = readStore();
    store.axNewWorks ??= [];
    store.axNewWorks.push({
      id: crypto.randomUUID(), user_id: user.empNo,
      title: data.title, description: data.description, techStack: data.techStack ?? "",
      createdAt: new Date().toISOString(),
    });
    writeStore(store);
    return { ok: true };
  });

/** 고도화 신청서 제출 (경진대회 작품 또는 신규 등록작 대상). 본인 작품만 가능. */
export const axRequestAdvancement = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      workId: z.string().min(1),
      workSource: z.enum(["contest", "new"]),
      form: z.object({
        painPoint: z.string().trim().max(500),
        improvementTypes: z.array(z.string()).max(10),
        improvementDetail: z.string().trim().max(500),
        neededSupport: z.string().trim().max(500).optional().default(""),
        expectedDone: z.string().trim().max(100).optional().default(""),
        expectedUsers: z.string().trim().max(50),
        expectedImpact: z.string().trim().max(500),
        dataTypes: z.array(z.string()).max(10),
        referenceLink: z.string().trim().max(500),
        attachmentPath: z.string().max(500).optional(),
        attachmentName: z.string().max(200).optional(),
      }).optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { readStore, writeStore, requireUser } = await import("@/lib/local-store.server");
    const user = requireUser();
    const store = readStore();
    const owner =
      data.workSource === "contest"
        ? store.submissions.find((s: any) => s.id === data.workId)?.user_id
        : (store.axNewWorks ?? []).find((w: any) => w.id === data.workId)?.user_id;
    if (!owner) throw new Error("작품을 찾을 수 없습니다.");
    if (owner !== user.empNo) throw new Error("본인 작품만 고도화 신청할 수 있습니다.");
    store.axRequests ??= [];
    if (store.axRequests.some((r) => r.workId === data.workId)) {
      throw new Error("이미 고도화 신청된 작품입니다.");
    }
    const now = new Date().toISOString();
    store.axRequests.push({
      id: crypto.randomUUID(), workId: data.workId, workSource: data.workSource,
      user_id: user.empNo, status: "requested", createdAt: now, updatedAt: now,
      form: data.form,
    });
    writeStore(store);
    return { ok: true };
  });

// ── 관리자: 전체 작품 분류 ───────────────────────────────────
export const axAdminListWorks = createServerFn({ method: "GET" })
  .handler(async () => {
    const { readStore, mediaUrl, loadRoster, liveProfile } = await import("@/lib/local-store.server");
    await requireAxLabAdmin();
    const store = readStore();
    const roster = await loadRoster();
    const stage = store.axStage ?? {};
    const requests = store.axRequests ?? [];
    const reqByWork = new Map(requests.map((r) => [r.workId, r]));

    const contest = store.submissions.map((s: any) => {
      const author = liveProfile(roster, s.user_id, s.profiles);
      return {
        id: s.id, source: "contest" as const, title: s.title,
        thumbnailUrl: mediaUrl("thumbnails", s.thumbnail_url),
        authorName: author.name, authorTeam: author.team, authorPosition: author.position,
        stage: stage[s.id] ?? null, request: reqByWork.get(s.id) ?? null,
        description: s.description ?? "", features: s.features ?? "",
        techStack: s.tech_stack ?? "", expectedImpact: s.expected_impact ?? "",
        files: (s.files ?? []).map((f: any) => ({ ...f, signedUrl: mediaUrl("submissions", f.file_path) })),
      };
    });
    const news = (store.axNewWorks ?? []).map((w: any) => {
      const author = liveProfile(roster, w.user_id, undefined);
      return {
        id: w.id, source: "new" as const, title: w.title, thumbnailUrl: "", files: [],
        authorName: author.name, authorTeam: author.team, authorPosition: author.position,
        stage: stage[w.id] ?? null, request: reqByWork.get(w.id) ?? null,
        description: w.description ?? "", features: "",
        techStack: w.techStack ?? "", expectedImpact: "",
      };
    });
    return [...contest, ...news];
  });

export const axAdminSetStage = createServerFn({ method: "POST" })
  .inputValidator((d: { workId: string; stage: 1 | 2 | 3 | 4 | null }) =>
    z.object({ workId: z.string().min(1), stage: STAGE.nullable() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { readStore, writeStore } = await import("@/lib/local-store.server");
    await requireAxLabAdmin();
    const store = readStore();
    store.axStage ??= {};
    if (data.stage === null) delete store.axStage[data.workId];
    else store.axStage[data.workId] = data.stage;
    writeStore(store);
    return { ok: true };
  });

export const axAdminSetGoal = createServerFn({ method: "POST" })
  .inputValidator((d: { sil: string; goal: number }) =>
    z.object({ sil: z.string().min(1), goal: z.number().int().min(0).max(999) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { readStore, writeStore } = await import("@/lib/local-store.server");
    await requireAxLabAdmin();
    const store = readStore();
    store.axGoals ??= {};
    store.axGoals[data.sil] = data.goal;
    writeStore(store);
    return { ok: true };
  });

/** 관리자: 전체 고도화 신청 목록 (검토용). */
export const axAdminListRequests = createServerFn({ method: "GET" })
  .handler(async () => {
    const { readStore, loadRoster } = await import("@/lib/local-store.server");
    await requireAxLabAdmin();
    const store = readStore();
    const roster = await loadRoster();
    const stage = store.axStage ?? {};
    const rows = [];
    for (const r of store.axRequests ?? []) {
      const work = await resolveWork(store, roster, r.workId);
      rows.push({
        id: r.id, workId: r.workId, workSource: r.workSource,
        title: work?.title ?? "(삭제된 작품)",
        authorName: work?.author?.name ?? "", authorTeam: work?.author?.team ?? "",
        stage: stage[r.workId] ?? null,
        status: r.status, createdAt: r.createdAt, updatedAt: r.updatedAt,
        form: r.form ?? null,
      });
    }
    rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return rows;
  });

export const axAdminSetRequestStatus = createServerFn({ method: "POST" })
  .inputValidator((d: { requestId: string; status: string }) =>
    z.object({ requestId: z.string().min(1), status: STATUS }).parse(d),
  )
  .handler(async ({ data }) => {
    const { readStore, writeStore } = await import("@/lib/local-store.server");
    await requireAxLabAdmin();
    const store = readStore();
    const r = (store.axRequests ?? []).find((x) => x.id === data.requestId);
    if (!r) throw new Error("신청 내역을 찾을 수 없습니다.");
    r.status = data.status as any;
    r.updatedAt = new Date().toISOString();
    writeStore(store);
    return { ok: true };
  });
