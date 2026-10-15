import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// AX LAB — 경진대회 104건을 1/2/3단계로 분류하고, 실별 고도화 목표를 세워
// 구성원이 직접 고도화를 신청 → AX협의체 검토 → 보안검증 → 승인 → SaaS 등록까지
// 이어지는 파이프라인. 저장은 기존 data/db.json (local-store.server.ts) 그대로 사용.

const STAGE = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
const STATUS = z.enum(["requested", "planning", "developing", "review", "issued", "rejected"]);

/** 셀프 보안점검 통과 점수 (ax-stages 의 SECURITY_PASS_SCORE 와 같다) */
const PASS = 70;

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

/**
 * 작품의 단계. 아직 분류하지 않은 작품은 1단계(보류)로 본다.
 * 그래야 1~4단계를 더한 값이 전체 작품 수와 맞는다.
 */
function stageOf(stage: Record<string, 1 | 2 | 3 | 4>, workId: string): 1 | 2 | 3 | 4 {
  return stage[workId] ?? 1;
}

/**
 * 구성원에게 보여줄 workId → 신청 맵.
 * 반려된 신청은 없는 것으로 취급해, 목록·집계·배지 어디에도 남지 않게 한다.
 * (관리자 화면은 되돌리거나 제외해야 하므로 반려 건도 그대로 본다.)
 */
function liveRequestsByWork(store: any) {
  const live = (store.axRequests ?? []).filter((r: any) => r.status !== "rejected");
  return new Map<string, any>(live.map((r: any) => [r.workId, r]));
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
    // '신청'은 아직 진행 중인 건만 센다. 승인(SaaS 인증)되면 '승인'으로 넘어가고,
    // 반려된 건은 어디에도 세지 않는다 → 신청 + 승인 = 살아있는 전체 신청.
    const requestedCount = requests.filter((r) => r.status !== "rejected" && r.status !== "issued").length;
    const saasApprovedCount = requests.filter((r) => r.status === "issued").length;
    // 단계별 건수 — 실별 현황 표와 같은 기준(경진대회 출품작)으로 센다.
    const stageCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const s of store.submissions) {
      stageCounts[stageOf(stage, s.id)] += 1;
    }
    return { totalContestWorks, advancementTargetCount, requestedCount, saasApprovedCount, stageCounts };
  });

// ── 1차 보안검증 안내 (프롬프트 + 배너) ─────────────────────
/** 보안 점검 프롬프트 최대 길이 — 실제 점검표를 통째로 붙여넣을 수 있도록 넉넉하게. */
export const PROMPT_MAX = 100_000;

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
      saasCertImage: g?.saasCertImage ?? "",
    };
  });

export const axAdminSetSecurityGuide = createServerFn({ method: "POST" })
  .inputValidator((d: { prompt: string; checklistImage?: string; openCriteriaImage?: string; saasCertImage?: string }) =>
    z.object({
      prompt: z.string().max(PROMPT_MAX),
      checklistImage: z.string().max(500).optional().default(""),
      openCriteriaImage: z.string().max(500).optional().default(""),
      saasCertImage: z.string().max(500).optional().default(""),
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
      saasCertImage: data.saasCertImage,
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
    // 반려된 신청은 '신청' 집계에서 빠진다.
    const requests = (store.axRequests ?? []).filter((r) => r.status !== "rejected");

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
        const c1 = contestInTeam.filter((s: any) => stageOf(stage, s.id) === 1).length;
        const c2 = contestInTeam.filter((s: any) => stageOf(stage, s.id) === 2).length;
        const c3 = contestInTeam.filter((s: any) => stageOf(stage, s.id) === 3).length;
        const c4 = contestInTeam.filter((s: any) => stageOf(stage, s.id) === 4).length;
        const reqInTeam = requests.filter((r) => teamOfWork.get(r.workId) === team);
        const approvedInTeam = reqInTeam.filter((r) => r.status === "issued").length;
        return {
          team, total: contestInTeam.length, stage1: c1, stage2: c2, stage3: c3, stage4: c4,
          requested: reqInTeam.length - approvedInTeam, approved: approvedInTeam,
        };
      });
      const contestInSil = store.submissions.filter((s: any) => silOfWork.get(s.id) === g.name);
      const reqInSil = requests.filter((r) => silOfWork.get(r.workId) === g.name);
      return {
        sil: g.name,
        isDept: !!g.isDept,
        total: contestInSil.length,
        stage1: contestInSil.filter((s: any) => stageOf(stage, s.id) === 1).length,
        stage2: contestInSil.filter((s: any) => stageOf(stage, s.id) === 2).length,
        stage3: contestInSil.filter((s: any) => stageOf(stage, s.id) === 3).length,
        stage4: contestInSil.filter((s: any) => stageOf(stage, s.id) === 4).length,
        goal: goals[g.name] ?? 0,
        // 신청 = 진행 중, 승인 = SaaS 인증 완료 (승인되면 신청에서 빠진다)
        requested: reqInSil.filter((r) => r.status !== "issued").length,
        approved: reqInSil.filter((r) => r.status === "issued").length,
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
    const reqByWork = liveRequestsByWork(store);

    const contest = store.submissions
      .map((s: any) => ({ s, author: liveProfile(roster, s.user_id, s.profiles) }))
      .filter(({ author }) => normalizeTeam(author.team) === data.team)
      .map(({ s, author }) => ({
        id: s.id, source: "contest" as const, title: s.title,
        thumbnailUrl: mediaUrl("thumbnails", s.thumbnail_url),
        authorName: author.name, authorTeam: author.team, authorPosition: author.position,
        stage: stageOf(stage, s.id),
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
        stage: stageOf(stage, w.id),
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
  .inputValidator((d: { scope: "sil" | "team" | "all"; name: string; filter: string }) =>
    z.object({
      scope: z.enum(["sil", "team", "all"]),
      name: z.string(),
      filter: z.enum(["all", "stage1", "stage2", "stage3", "stage4", "requested", "approved", "target"]),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { readStore, requireUser, mediaUrl, loadRoster, liveProfile } = await import("@/lib/local-store.server");
    const { normalizeTeam, silOfTeam } = await import("@/lib/org");
    requireUser();
    const store = readStore();
    const roster = await loadRoster();
    const stage = store.axStage ?? {};
    const reqByWork = liveRequestsByWork(store);

    const contest = store.submissions.map((s: any) => {
      const author = liveProfile(roster, s.user_id, s.profiles);
      return {
        id: s.id, source: "contest" as const, title: s.title,
        thumbnailUrl: mediaUrl("thumbnails", s.thumbnail_url),
        authorName: author.name, authorTeam: author.team, authorPosition: author.position,
        stage: stageOf(stage, s.id), request: reqByWork.get(s.id) ?? null,
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
        stage: stageOf(stage, w.id), request: reqByWork.get(w.id) ?? null,
        description: w.description ?? "", features: "",
        techStack: w.techStack ?? "", expectedImpact: "",
      };
    });

    const inScope = (rows: any[]) =>
      data.scope === "all"
        ? rows
        : rows.filter((r) =>
            data.scope === "team" ? normalizeTeam(r.authorTeam) === data.name : silOfTeam(r.authorTeam) === data.name,
          );

    if (data.filter === "requested") {
      return inScope([...contest, ...news]).filter((r) => r.request && r.request.status !== "issued");
    }
    if (data.filter === "target") {
      // 상단 '고도화 대상' — 3단계로 분류된 작품 (신규 등록작 포함)
      return inScope([...contest, ...news]).filter((r) => stage[r.id] === 3);
    }
    if (data.filter === "approved") {
      return inScope([...contest, ...news]).filter((r) => r.request?.status === "issued");
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
    // 내 화면에서는 반려 건도 봐야 한다 — 사유를 확인하고 다시 신청해야 하므로.
    const reqByWork = new Map<string, any>(
      (store.axRequests ?? []).filter((r: any) => r.user_id === user.empNo).map((r: any) => [r.workId, r]),
    );
    const sil = silOfTeam(me.team);
    const orgLabel = me.team ? (sil && sil !== me.team ? `${sil} > ${me.team}` : me.team) : "미지정";

    const contestWork = store.submissions.find((s: any) => s.user_id === user.empNo);
    const myNewWorks = (store.axNewWorks ?? []).filter((w: any) => w.user_id === user.empNo);

    return {
      authorName: me.name, authorTeam: me.team, authorPosition: me.position,
      authorEmpNo: user.empNo, orgLabel,
      contestWork: contestWork
        ? {
            id: contestWork.id, source: "contest" as const, title: contestWork.title,
            description: contestWork.description ?? "",
            stage: stageOf(stage, contestWork.id),
            request: reqByWork.get(contestWork.id) ?? null,
          }
        : null,
      newWorks: myNewWorks.map((w: any) => ({
        id: w.id, source: "new" as const, title: w.title, description: w.description, techStack: w.techStack,
        stage: stageOf(stage, w.id), request: reqByWork.get(w.id) ?? null,
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
      /** 셀프 보안점검 점수 — 70점 이상이어야 신청할 수 있다 */
      securityScore: z.number().int().min(0).max(100),
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
    // 반려된 신청은 없는 것으로 보고 다시 신청할 수 있게 한다(옛 기록은 대체).
    if (store.axRequests.some((r) => r.workId === data.workId && r.status !== "rejected")) {
      throw new Error("이미 고도화 신청된 작품입니다.");
    }
    if (data.securityScore < PASS) {
      throw new Error(`셀프 보안점검 ${PASS}점 미만입니다. 보완 후 다시 점검해 주세요.`);
    }
    const link = data.form?.referenceLink?.trim() ?? "";
    if (!data.form?.attachmentPath && !link) {
      throw new Error("최신 결과물을 파일 또는 링크로 올려주세요.");
    }
    store.axRequests = store.axRequests.filter((r) => r.workId !== data.workId);
    const now = new Date().toISOString();
    store.axRequests.push({
      id: crypto.randomUUID(), workId: data.workId, workSource: data.workSource,
      user_id: user.empNo, status: "requested", createdAt: now, updatedAt: now,
      form: data.form,
      versions: [{
        kind: "request", at: now, securityScore: data.securityScore,
        note: data.form?.improvementDetail ?? "", link,
        filePath: data.form?.attachmentPath, fileName: data.form?.attachmentName,
      }],
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
        stage: stageOf(stage, s.id), request: reqByWork.get(s.id) ?? null,
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
        stage: stageOf(stage, w.id), request: reqByWork.get(w.id) ?? null,
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
        stage: stageOf(stage, r.workId),
        status: r.status, createdAt: r.createdAt, updatedAt: r.updatedAt,
        form: r.form ?? null,
        rejectReason: r.rejectReason ?? "",
        rejectedFrom: r.rejectedFrom ?? null,
        saas: r.saas ?? null,
        plan: r.plan ?? null,
        notifiedAt: r.notifiedAt ?? "",
        registeredAt: r.registeredAt ?? "",
        versions: r.versions ?? [],
        authorPosition: work?.author?.position ?? "",
        authorEmpNo: work?.user_id ?? "",
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

// ── 승인 관문 ────────────────────────────────────────────────

/** 관문에서 신청 건을 찾아 꺼낸다. */
async function takeRequest(requestId: string) {
  const { readStore, writeStore } = await import("@/lib/local-store.server");
  const store = readStore();
  const r = (store.axRequests ?? []).find((x) => x.id === requestId);
  if (!r) throw new Error("신청 내역을 찾을 수 없습니다.");
  return { store, r, save: () => writeStore(store) };
}

/**
 * 신청 승인 — AX 담당자가 고도화 신청을 승인/반려한다.
 * 승인하면 지원방안 수립으로, 반려하면 사유와 함께 신청자에게 돌아간다.
 */
export const axAdminDecideRequest = createServerFn({ method: "POST" })
  .inputValidator((d: { requestId: string; approve: boolean; reason?: string }) =>
    z.object({
      requestId: z.string().min(1),
      approve: z.boolean(),
      reason: z.string().trim().max(2000).optional().default(""),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    await requireAxLabAdmin();
    const { r, save } = await takeRequest(data.requestId);
    if (r.status !== "requested") throw new Error("승인 대기 중인 신청만 처리할 수 있습니다.");
    if (!data.approve && !data.reason) throw new Error("반려 사유를 입력해주세요.");

    const now = new Date().toISOString();
    if (data.approve) {
      r.status = "planning";
      r.rejectReason = "";
      r.rejectedFrom = undefined;
    } else {
      r.status = "rejected";
      r.rejectReason = data.reason;
      r.rejectedFrom = "request";
      r.rejectedAt = now;
    }
    r.updatedAt = now;
    save();
    return { ok: true };
  });

/**
 * 지원방안 수립 — AX협의체가 고도화 지원방안을 적는다 (여러 번 고쳐 쓸 수 있다).
 */
export const axAdminSavePlan = createServerFn({ method: "POST" })
  .inputValidator((d: { requestId: string; text: string }) =>
    z.object({ requestId: z.string().min(1), text: z.string().trim().min(1).max(3000) }).parse(d),
  )
  .handler(async ({ data }) => {
    const admin = await requireAxLabAdmin();
    const { r, save } = await takeRequest(data.requestId);
    if (r.status !== "planning" && r.status !== "developing") {
      throw new Error("지원방안 수립 단계의 과제만 작성할 수 있습니다.");
    }
    const now = new Date().toISOString();
    r.plan = { text: data.text, by: admin.empNo, byName: admin.name, at: now };
    r.updatedAt = now;
    save();
    return { ok: true };
  });

/**
 * 이메일 통보 — AX 담당자가 지원방안을 메일로 알린 뒤 누른다. 이때부터 고도화가 시작된다.
 */
export const axAdminNotifyPlan = createServerFn({ method: "POST" })
  .inputValidator((d: { requestId: string }) => z.object({ requestId: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    await requireAxLabAdmin();
    const { r, save } = await takeRequest(data.requestId);
    if (r.status !== "planning") throw new Error("지원방안 수립 단계의 과제만 통보할 수 있습니다.");
    if (!r.plan?.text) throw new Error("지원방안을 먼저 작성해 주세요.");
    const now = new Date().toISOString();
    r.status = "developing";
    r.notifiedAt = now;
    r.updatedAt = now;
    save();
    return { ok: true };
  });

/**
 * SaaS 승인 신청 — 고도화를 마친 본인이 셀프 보안점검(70점 이상) 후
 * 최신 결과물을 올려 승인을 신청한다. 옛날 결과물로는 올라갈 수 없도록 매번 새로 받는다.
 */
export const axRequestSaasApproval = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      requestId: z.string().min(1),
      securityScore: z.number().int().min(0).max(100),
      note: z.string().trim().min(1).max(2000),
      link: z.string().trim().max(500).optional().default(""),
      filePath: z.string().max(500).optional(),
      fileName: z.string().max(200).optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { requireUser } = await import("@/lib/local-store.server");
    const user = requireUser();
    const { r, save } = await takeRequest(data.requestId);
    if (r.user_id !== user.empNo) throw new Error("본인 신청만 SaaS 승인을 신청할 수 있습니다.");
    if (r.status !== "developing") throw new Error("고도화 · 재점검 단계의 과제만 SaaS 승인을 신청할 수 있습니다.");
    if (data.securityScore < PASS) {
      throw new Error(`셀프 보안점검 ${PASS}점 미만입니다. 보완 후 다시 점검해 주세요.`);
    }
    if (!data.filePath && !data.link) throw new Error("최신 결과물을 파일 또는 링크로 올려주세요.");

    const now = new Date().toISOString();
    r.versions ??= [];
    r.versions.push({
      kind: "saas", at: now, securityScore: data.securityScore, note: data.note,
      link: data.link, filePath: data.filePath, fileName: data.fileName,
    });
    r.status = "review";
    r.rejectReason = "";
    r.rejectedFrom = undefined;
    r.updatedAt = now;
    save();
    return { ok: true };
  });

/**
 * 승인 협의 — AX협의체가 보안·실효성을 검토해 승인/반려한다.
 * 반려하면 처음이 아니라 고도화·재점검 단계로 돌아가 보완 후 다시 점검한다.
 */
export const axAdminDecideReview = createServerFn({ method: "POST" })
  .inputValidator((d: { requestId: string; approve: boolean; reason?: string }) =>
    z.object({
      requestId: z.string().min(1),
      approve: z.boolean(),
      reason: z.string().trim().max(2000).optional().default(""),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    await requireAxLabAdmin();
    const { r, save } = await takeRequest(data.requestId);
    if (r.status !== "review") throw new Error("승인 협의 중인 과제만 처리할 수 있습니다.");
    if (!data.approve && !data.reason) throw new Error("반려 사유를 입력해주세요.");

    const now = new Date().toISOString();
    if (data.approve) {
      // 승인 — 발급 대기. 번호는 발급 버튼을 눌러야 채번된다.
      r.status = "issued";
      r.rejectReason = "";
      r.rejectedFrom = undefined;
    } else {
      // 반려 — 전 단계(고도화)로 되돌린다.
      r.status = "developing";
      r.rejectReason = data.reason;
      r.rejectedFrom = "review";
      r.rejectedAt = now;
    }
    r.updatedAt = now;
    save();
    return { ok: true };
  });

/**
 * SaaS 등록번호 발급 — TZAX + 업무성격(2) + 년도(2) + 일련번호(3).
 * 일련번호는 같은 업무성격·같은 년도 안에서 자동으로 이어 붙인다.
 */
export const axAdminIssueSaasNumber = createServerFn({ method: "POST" })
  .inputValidator((d: { requestId: string; category: string }) =>
    z.object({
      requestId: z.string().min(1),
      category: z.string().regex(/^[A-Z]{2}$/),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { requireUser } = await import("@/lib/local-store.server");
    const { SAAS_CATEGORY_LABEL, formatSaasNumber } = await import("@/lib/ax-stages");
    const admin = await requireAxLabAdmin();
    requireUser();
    if (!SAAS_CATEGORY_LABEL[data.category]) throw new Error("업무성격 구분이 올바르지 않습니다.");

    const { store, r, save } = await takeRequest(data.requestId);
    if (r.status !== "issued") throw new Error("승인 완료된 과제만 번호를 발급할 수 있습니다.");
    if (r.saas?.number) throw new Error("이미 번호가 발급된 과제입니다.");

    const year = String(new Date().getFullYear()).slice(-2);
    // 같은 구분·같은 년도에서 이미 나간 번호들. 취소된 번호도 다시 쓰지 않는다.
    const sameSlot = (s: { category: string; year: string } | undefined) =>
      !!s && s.category === data.category && s.year === year;
    const taken = new Set(
      [...(store.axRequests ?? []).map((x) => x.saas), ...(store.axRetiredSaas ?? [])]
        .filter(sameSlot)
        .map((s) => s!.seq),
    );
    // 가장 큰 번호 다음부터 시작하되, 혹시라도 이미 쓰인 번호면 더 밀어낸다.
    let seq = (taken.size ? Math.max(...taken) : 0) + 1;
    while (taken.has(seq)) seq += 1;

    const number = formatSaasNumber(data.category, year, seq);
    const allNumbers = new Set([
      ...(store.axRequests ?? []).map((x) => x.saas?.number).filter(Boolean),
      ...(store.axRetiredSaas ?? []).map((x) => x.number),
    ]);
    if (allNumbers.has(number)) {
      throw new Error(`${number} 는 이미 사용된 번호입니다. 다시 시도해주세요.`);
    }

    r.saas = {
      number,
      category: data.category,
      year,
      seq,
      issuedAt: new Date().toISOString(),
      issuedBy: admin.empNo,
      issuedByName: admin.name,
    };
    r.updatedAt = r.saas.issuedAt;
    save();
    return { ok: true, number: r.saas.number };
  });

/**
 * 업무시스템 등록 — AX 담당자가 등록을 마치면 누른다 (undo 로 되돌릴 수 있다).
 */
export const axAdminMarkRegistered = createServerFn({ method: "POST" })
  .inputValidator((d: { requestId: string; undo?: boolean }) =>
    z.object({ requestId: z.string().min(1), undo: z.boolean().optional().default(false) }).parse(d),
  )
  .handler(async ({ data }) => {
    const admin = await requireAxLabAdmin();
    const { r, save } = await takeRequest(data.requestId);
    if (r.status !== "issued" || !r.saas?.number) {
      throw new Error("SaaS 인증번호가 발급된 과제만 업무시스템 등록을 처리할 수 있습니다.");
    }
    const now = new Date().toISOString();
    if (data.undo) {
      r.registeredAt = undefined;
      r.registeredBy = undefined;
      r.registeredByName = undefined;
    } else {
      r.registeredAt = now;
      r.registeredBy = admin.empNo;
      r.registeredByName = admin.name;
    }
    r.updatedAt = now;
    save();
    return { ok: true };
  });

/**
 * SaaS 등록 취소 — 등록이 끝난 뒤에도 되돌릴 수 있다.
 *   reissue : 번호만 지우고 발급 대기로 (구분을 잘못 골랐을 때 다시 발급)
 *   review  : 번호를 지우고 3단계 승인 검토로 되돌린다 (사유 필요)
 * 반납한 번호는 다시 쓰지 않고 비워 둔다 — 같은 번호가 두 곳에 남지 않도록.
 */
export const axAdminCancelSaas = createServerFn({ method: "POST" })
  .inputValidator((d: { requestId: string; mode: "reissue" | "review"; reason?: string }) =>
    z.object({
      requestId: z.string().min(1),
      mode: z.enum(["reissue", "review"]),
      reason: z.string().trim().max(2000).optional().default(""),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    await requireAxLabAdmin();
    const { store, r, save } = await takeRequest(data.requestId);
    if (r.status !== "issued") throw new Error("등록 완료된 과제만 취소할 수 있습니다.");
    if (data.mode === "reissue" && !r.saas?.number) {
      throw new Error("아직 번호가 발급되지 않았습니다.");
    }
    if (data.mode === "review" && !data.reason) throw new Error("취소 사유를 입력해주세요.");

    const now = new Date().toISOString();
    const released = r.saas?.number ?? "";

    // 반납한 번호는 재사용하지 않는다 — 취소 이력으로 남겨 채번에서 건너뛴다.
    if (r.saas) {
      store.axRetiredSaas ??= [];
      store.axRetiredSaas.push({
        ...r.saas,
        retiredAt: now,
        reason: data.reason || (data.mode === "reissue" ? "번호 재발급" : ""),
      });
    }
    r.saas = undefined;
    // 번호가 없어지면 업무시스템 등록도 무효
    r.registeredAt = undefined;
    r.registeredBy = undefined;
    r.registeredByName = undefined;

    if (data.mode === "review") {
      r.status = "review";
      r.rejectReason = data.reason;
      r.rejectedFrom = "saasCancel";
      r.rejectedAt = now;
    }
    r.updatedAt = now;
    save();
    return { ok: true, released };
  });

/**
 * 관리자: 고도화 신청 제외 — 신청 자체를 지운다.
 * 반려(rejected)로 남겨두면 본인이 다시 신청할 수 없으므로, 제외는 삭제로 처리한다.
 */
export const axAdminDeleteRequest = createServerFn({ method: "POST" })
  .inputValidator((d: { requestId: string }) =>
    z.object({ requestId: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { readStore, writeStore } = await import("@/lib/local-store.server");
    await requireAxLabAdmin();
    const store = readStore();
    const list = store.axRequests ?? [];
    const i = list.findIndex((x) => x.id === data.requestId);
    if (i < 0) throw new Error("신청 내역을 찾을 수 없습니다.");

    const [removed] = list.splice(i, 1);
    // 번호가 나가 있었다면 반납 처리한다. 그냥 지우면 그 번호가
    // 비어 보여서 다음 사람에게 똑같이 발급될 수 있다.
    if (removed?.saas) {
      store.axRetiredSaas ??= [];
      store.axRetiredSaas.push({
        ...removed.saas,
        retiredAt: new Date().toISOString(),
        reason: "신청 초기화",
      });
    }
    store.axRequests = list;
    writeStore(store);
    return { ok: true, released: removed?.saas?.number ?? "" };
  });
