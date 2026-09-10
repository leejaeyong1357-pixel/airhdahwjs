import { Fragment, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  axGetOverview, axGetOrgBoard, axAdminSetGoal, axAdminListWorks, axAdminSetStage,
  axAdminListRequests, axAdminSetRequestStatus, axListTeamWorks,
} from "@/lib/ax-lab.functions";
import { AxPipelineStepper, AxProgressBar } from "@/components/AxPipelineStepper";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuLabel,
} from "@/components/ui/context-menu";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import {
  Target, ListChecks, ClipboardList, Search, Rocket, Sparkles, Send, ShieldCheck,
  ChevronDown, ChevronRight, Users2, FileText, ArrowRight, MousePointerClick, Download, Paperclip,
} from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  requested: "신청 완료", reviewing: "AX협의체 검토중", security: "보안검증중",
  approved: "승인", saas: "SaaS 등록 완료", rejected: "반려",
};
const STATUS_TONE: Record<string, string> = {
  requested: "bg-primary/10 text-primary", reviewing: "bg-amber-400/15 text-amber-600",
  security: "bg-orange-400/15 text-orange-600", approved: "bg-emerald-500/15 text-emerald-600",
  saas: "bg-blue-500/15 text-blue-600", rejected: "bg-destructive/10 text-destructive",
};
const STAGE_TONE: Record<number, string> = {
  1: "bg-slate-400 text-white", 2: "bg-amber-500 text-white", 3: "bg-sky-500 text-white", 4: "bg-emerald-500 text-white",
};
const STAGE_TONE_SOFT: Record<number, string> = {
  1: "bg-muted text-muted-foreground", 2: "bg-amber-400/15 text-amber-600", 3: "bg-sky-500/15 text-sky-600", 4: "bg-emerald-500/15 text-emerald-600",
};
const STAGE_TEXT: Record<number, string> = {
  1: "1단계 · 제외·보류", 2: "2단계 · 보완 대상", 3: "3단계 · 고도화 대상", 4: "4단계 · 적용중",
};
const STAGE_DESC: Record<number, string> = {
  1: "추가 고도화 없이 보관",
  2: "기능·보안·사용성 등 보완이 필요한 작품",
  3: "AX협의체 검토를 거쳐 고도화를 진행할 작품",
  4: "SaaS 등록·전사 확산되어 실제 업무에 적용 중",
};

const REVIEW_TABS = [
  { key: "all", label: "전체", match: (s: string) => s !== "saas" && s !== "rejected" },
  { key: "review", label: "AX 검토", match: (s: string) => s === "requested" || s === "reviewing" },
  { key: "security", label: "보안검증", match: (s: string) => s === "security" },
  { key: "approved", label: "승인 대기", match: (s: string) => s === "approved" },
] as const;

export function AdminAxLabView() {
  const qc = useQueryClient();
  const overviewFn = useServerFn(axGetOverview);
  const boardFn = useServerFn(axGetOrgBoard);
  const setGoalFn = useServerFn(axAdminSetGoal);
  const worksFn = useServerFn(axAdminListWorks);
  const setStageFn = useServerFn(axAdminSetStage);
  const reqFn = useServerFn(axAdminListRequests);
  const setReqStatusFn = useServerFn(axAdminSetRequestStatus);
  const teamWorksFn = useServerFn(axListTeamWorks);

  const { data: overview } = useQuery({ queryKey: ["admin", "ax", "overview"], queryFn: () => overviewFn() });
  const { data: board = [] } = useQuery({ queryKey: ["admin", "ax", "board"], queryFn: () => boardFn() });
  const { data: works = [] } = useQuery({ queryKey: ["admin", "ax", "works"], queryFn: () => worksFn() });
  const { data: requests = [] } = useQuery({ queryKey: ["admin", "ax", "requests"], queryFn: () => reqFn() });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "ax"] });
  const goalMut = useMutation({
    mutationFn: (v: { sil: string; goal: number }) => setGoalFn({ data: v }),
    onSuccess: invalidate, onError: (e: any) => toast.error(e.message),
  });
  const stageMut = useMutation({
    mutationFn: (v: { workId: string; stage: 1 | 2 | 3 | 4 | null }) => setStageFn({ data: v }),
    onSuccess: (_r, v) => { toast.success(v.stage ? `${STAGE_TEXT[v.stage]}(으)로 분류했습니다.` : "분류를 해제했습니다."); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });
  const statusMut = useMutation({
    mutationFn: (v: { requestId: string; status: string }) => setReqStatusFn({ data: v }),
    onSuccess: invalidate, onError: (e: any) => toast.error(e.message),
  });

  // 실별/팀별 현황 표시 상태
  const [tab, setTab] = useState<"sil" | "team">("sil");
  const [silFilter, setSilFilter] = useState("전체 실");
  const [openSils, setOpenSils] = useState<Set<string>>(new Set());
  const toggleSil = (sil: string) =>
    setOpenSils((prev) => {
      const next = new Set(prev);
      if (next.has(sil)) next.delete(sil);
      else next.add(sil);
      return next;
    });
  const flatTeams = useMemo(() => board.flatMap((g: any) => g.teams.map((t: any) => ({ ...t, sil: g.sil }))), [board]);
  const visibleSils = silFilter === "전체 실" ? board : board.filter((g: any) => g.sil === silFilter);
  const visibleTeams = silFilter === "전체 실" ? flatTeams : flatTeams.filter((t: any) => t.sil === silFilter);

  // 팀 작품 목록 팝업 (썸네일 포함)
  const [teamSel, setTeamSel] = useState<string | null>(null);
  const { data: teamWorks = [] } = useQuery({
    queryKey: ["admin", "ax", "teamWorks", teamSel],
    queryFn: () => teamWorksFn({ data: { team: teamSel! } }),
    enabled: !!teamSel,
  });

  // 목표 편집 다이얼로그
  const [goalOpen, setGoalOpen] = useState(false);
  const [goalDraft, setGoalDraft] = useState<Record<string, number>>({});
  const openGoalDialog = () => {
    setGoalDraft(Object.fromEntries(board.map((g: any) => [g.sil, g.goal])));
    setGoalOpen(true);
  };
  const saveGoals = async () => {
    await Promise.all(board.map((g: any) => (goalDraft[g.sil] !== g.goal ? goalMut.mutateAsync({ sil: g.sil, goal: goalDraft[g.sil] ?? 0 }) : null)));
    toast.success("실별 고도화 목표를 저장했습니다.");
    setGoalOpen(false);
  };

  // 검토가 필요한 작품
  const [reviewTab, setReviewTab] = useState<(typeof REVIEW_TABS)[number]["key"]>("all");
  const reviewFiltered = useMemo(() => {
    const matcher = REVIEW_TABS.find((t) => t.key === reviewTab)!.match;
    return requests.filter((r: any) => matcher(r.status));
  }, [requests, reviewTab]);

  // 작품 단계 분류 검색 · 단계 필터
  const [q, setQ] = useState("");
  const [stageFilter, setStageFilter] = useState<"all" | "none" | 1 | 2 | 3 | 4>("all");
  const filteredWorks = useMemo(() => {
    const k = q.trim().toLowerCase();
    return works
      .filter((w: any) => (k ? `${w.title} ${w.authorName} ${w.authorTeam}`.toLowerCase().includes(k) : true))
      .filter((w: any) => {
        if (stageFilter === "all") return true;
        if (stageFilter === "none") return !w.stage;
        return w.stage === stageFilter;
      });
  }, [works, q, stageFilter]);

  // 작품 상세 보기
  const [detailWork, setDetailWork] = useState<any | null>(null);

  return (
    <div className="space-y-10">
      {/* 헤더 */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-black uppercase tracking-widest text-accent">AX LAB · 관리자</div>
          <h1 className="mt-1 text-2xl font-black tracking-tight">104개의 아이디어, 실제 업무의 변화로</h1>
        </div>
        <Button variant="outline" onClick={openGoalDialog}><Target className="mr-1.5 h-4 w-4" /> 목표 편집</Button>
      </div>

      {/* 배너 */}
      <div className="flex flex-col gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10"><Users2 className="h-5 w-5 text-primary" /></span>
          <div>
            <div className="text-[15px] font-black text-foreground">AX협의체와 함께하는 AX 고도화 프로젝트</div>
            <div className="text-[13px] text-muted-foreground">작품을 선별하고 고도화하여, 사내 SaaS로 연결합니다.</div>
          </div>
        </div>
      </div>

      {/* 통계 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Rocket} tone="slate" label="경진대회 작품" value={overview?.totalContestWorks ?? 0} />
        <StatCard icon={Sparkles} tone="amber" label="고도화 대상 · 3단계" value={overview?.advancementTargetCount ?? 0} />
        <StatCard icon={Send} tone="primary" label="고도화 신청" value={overview?.requestedCount ?? 0} />
        <StatCard icon={ShieldCheck} tone="emerald" label="SaaS 승인" value={overview?.saasApprovedCount ?? 0} />
      </div>

      <AxPipelineStepper />

      {/* 실별 고도화 현황 */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black tracking-tight">실별 고도화 현황</h2>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">실을 클릭하면 팀별로 펼쳐지고, 팀을 클릭하면 작품 목록을 볼 수 있습니다.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 rounded-lg bg-muted p-1">
              <button onClick={() => setTab("sil")} className={`rounded-md px-3 py-1.5 text-[13px] font-bold transition ${tab === "sil" ? "bg-background text-foreground shadow" : "text-muted-foreground"}`}>실별 현황</button>
              <button onClick={() => setTab("team")} className={`rounded-md px-3 py-1.5 text-[13px] font-bold transition ${tab === "team" ? "bg-background text-foreground shadow" : "text-muted-foreground"}`}>팀별 현황</button>
            </div>
            <select value={silFilter} onChange={(e) => setSilFilter(e.target.value)} className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-[13px]">
              <option>전체 실</option>
              {board.map((g: any) => <option key={g.sil}>{g.sil}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-card">
          {tab === "sil" ? (
            <table className="w-full min-w-[940px] text-sm">
              <thead className="bg-muted/50 text-xs">
                <tr>
                  <Th></Th><Th>실</Th><Th className="text-right">전체</Th><Th className="text-right">1단계</Th>
                  <Th className="text-right">2단계</Th><Th className="text-right">3단계</Th><Th className="text-right">4단계</Th><Th className="text-right">목표</Th>
                  <Th className="text-right">신청</Th><Th className="text-right">승인</Th><Th className="w-[160px]">목표 대비 신청</Th>
                </tr>
              </thead>
              <tbody>
                {visibleSils.map((g: any) => {
                  const expanded = openSils.has(g.sil);
                  const pct = g.goal > 0 ? Math.min(100, Math.round((g.requested / g.goal) * 100)) : 0;
                  return (
                    <Fragment key={g.sil}>
                      <tr className="cursor-pointer border-t border-border hover:bg-muted/40" onClick={() => toggleSil(g.sil)}>
                        <Td className="w-8">{expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</Td>
                        <Td className="font-bold">{g.sil}{g.isDept && <span className="ml-1.5 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">부서</span>}</Td>
                        <Td className="text-right tabular-nums">{g.total}</Td>
                        <Td className="text-right tabular-nums text-muted-foreground">{g.stage1}</Td>
                        <Td className="text-right tabular-nums text-amber-600 font-semibold">{g.stage2}</Td>
                        <Td className="text-right tabular-nums text-sky-600 font-semibold">{g.stage3}</Td>
                        <Td className="text-right tabular-nums text-emerald-600 font-semibold">{g.stage4}</Td>
                        <Td className="text-right tabular-nums">{g.goal}</Td>
                        <Td className="text-right tabular-nums font-bold text-primary">{g.requested}</Td>
                        <Td className="text-right tabular-nums font-bold text-emerald-600">{g.approved}</Td>
                        <Td><AxProgressBar pct={pct} /></Td>
                      </tr>
                      {expanded && g.teams.map((t: any) => (
                        <tr key={g.sil + t.team} className="cursor-pointer border-t border-border/60 bg-muted/20 text-[13px] hover:bg-muted/40" onClick={(e) => { e.stopPropagation(); setTeamSel(t.team); }}>
                          <Td></Td>
                          <Td className="pl-6 text-foreground/80">└ {t.team}</Td>
                          <Td className="text-right tabular-nums">{t.total}</Td>
                          <Td className="text-right tabular-nums text-muted-foreground">{t.stage1}</Td>
                          <Td className="text-right tabular-nums text-amber-600">{t.stage2}</Td>
                          <Td className="text-right tabular-nums text-sky-600">{t.stage3}</Td>
                          <Td className="text-right tabular-nums text-emerald-600">{t.stage4}</Td>
                          <Td className="text-right text-muted-foreground">—</Td>
                          <Td className="text-right tabular-nums text-primary">{t.requested}</Td>
                          <Td className="text-right tabular-nums text-emerald-600">{t.approved}</Td>
                          <Td></Td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
                <tr className="border-t-2 border-border bg-muted/40 font-black">
                  <Td></Td><Td>합계</Td>
                  <Td className="text-right tabular-nums">{board.reduce((a: number, g: any) => a + g.total, 0)}</Td>
                  <Td className="text-right tabular-nums">{board.reduce((a: number, g: any) => a + g.stage1, 0)}</Td>
                  <Td className="text-right tabular-nums">{board.reduce((a: number, g: any) => a + g.stage2, 0)}</Td>
                  <Td className="text-right tabular-nums">{board.reduce((a: number, g: any) => a + g.stage3, 0)}</Td>
                  <Td className="text-right tabular-nums">{board.reduce((a: number, g: any) => a + g.stage4, 0)}</Td>
                  <Td className="text-right tabular-nums">{board.reduce((a: number, g: any) => a + g.goal, 0)}</Td>
                  <Td className="text-right tabular-nums text-primary">{board.reduce((a: number, g: any) => a + g.requested, 0)}</Td>
                  <Td className="text-right tabular-nums text-emerald-600">{board.reduce((a: number, g: any) => a + g.approved, 0)}</Td>
                  <Td></Td>
                </tr>
              </tbody>
            </table>
          ) : (
            <table className="w-full min-w-[800px] text-sm">
              <thead className="bg-muted/50 text-xs">
                <tr><Th>소속 실</Th><Th>팀</Th><Th className="text-right">전체</Th><Th className="text-right">1단계</Th><Th className="text-right">2단계</Th><Th className="text-right">3단계</Th><Th className="text-right">4단계</Th><Th className="text-right">신청</Th><Th className="text-right">승인</Th></tr>
              </thead>
              <tbody>
                {visibleTeams.map((t: any) => (
                  <tr key={t.sil + t.team} className="cursor-pointer border-t border-border hover:bg-muted/40" onClick={() => setTeamSel(t.team)}>
                    <Td className="text-muted-foreground">{t.sil}</Td>
                    <Td className="font-bold">{t.team}</Td>
                    <Td className="text-right tabular-nums">{t.total}</Td>
                    <Td className="text-right tabular-nums text-muted-foreground">{t.stage1}</Td>
                    <Td className="text-right tabular-nums text-amber-600">{t.stage2}</Td>
                    <Td className="text-right tabular-nums text-sky-600">{t.stage3}</Td>
                    <Td className="text-right tabular-nums text-emerald-600">{t.stage4}</Td>
                    <Td className="text-right tabular-nums text-primary font-bold">{t.requested}</Td>
                    <Td className="text-right tabular-nums text-emerald-600 font-bold">{t.approved}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* 검토가 필요한 작품 */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-black tracking-tight">검토가 필요한 작품</h2>
          <a href="#requests-table" className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary">전체 작품 보기 <ArrowRight className="h-3.5 w-3.5" /></a>
        </div>
        <div className="mt-2 flex gap-1 rounded-lg bg-muted p-1 w-fit">
          {REVIEW_TABS.map((t) => (
            <button key={t.key} onClick={() => setReviewTab(t.key)} className={`rounded-md px-3 py-1.5 text-[13px] font-bold transition ${reviewTab === t.key ? "bg-background text-foreground shadow" : "text-muted-foreground"}`}>{t.label}</button>
          ))}
        </div>
        <div className="mt-3 space-y-2">
          {reviewFiltered.slice(0, 6).map((r: any) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3.5">
              <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14.5px] font-bold text-foreground">{r.title}</div>
                <div className="text-[12px] text-muted-foreground">{r.authorTeam} · {r.authorName}</div>
              </div>
              {r.stage && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${STAGE_TONE_SOFT[r.stage]}`}>{STAGE_TEXT[r.stage]}</span>}
              <select
                value={r.status}
                onChange={(e) => statusMut.mutate({ requestId: r.id, status: e.target.value })}
                className={`shrink-0 rounded-full border-0 px-2.5 py-1 text-[12px] font-bold ${STATUS_TONE[r.status]}`}
              >
                {Object.entries(STATUS_LABEL).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
              </select>
            </div>
          ))}
          {reviewFiltered.length === 0 && <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">해당하는 작품이 없습니다.</div>}
        </div>
      </section>

      {/* 작품 단계 분류 (썸네일 카드 + 우클릭 지정) */}
      <section id="classify">
        <div className="flex flex-wrap items-center gap-2">
          <ListChecks className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-black tracking-tight">작품 단계 분류</h2>
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[13px] font-bold text-primary">총 {works.length}건</span>
          <span className="ml-1 inline-flex items-center gap-1 text-[12px] font-semibold text-muted-foreground">
            <MousePointerClick className="h-3.5 w-3.5" /> 클릭하면 상세보기 · 우클릭하면 단계를 지정하세요
          </span>
          <div className="relative ml-auto">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="작품명 · 이름 · 팀 검색" className="w-60 rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm" />
          </div>
        </div>

        {/* 1/2/3/4단계가 뭔지 크고 또렷하게 */}
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StageLegendCard stage={1} />
          <StageLegendCard stage={2} />
          <StageLegendCard stage={3} />
          <StageLegendCard stage={4} />
        </div>

        {/* 단계별 필터 */}
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <FilterPill active={stageFilter === "all"} onClick={() => setStageFilter("all")} label={`전체 ${works.length}`} />
          <FilterPill active={stageFilter === "none"} onClick={() => setStageFilter("none")} label={`미분류 ${works.filter((w: any) => !w.stage).length}`} />
          {[1, 2, 3, 4].map((s) => (
            <FilterPill
              key={s}
              active={stageFilter === s}
              onClick={() => setStageFilter(s as 1 | 2 | 3 | 4)}
              label={`${STAGE_TEXT[s]} ${works.filter((w: any) => w.stage === s).length}`}
              tone={STAGE_TONE_SOFT[s]}
            />
          ))}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {filteredWorks.map((w: any) => (
            <ContextMenu key={w.id}>
              <ContextMenuTrigger asChild>
                <div className="cursor-pointer select-none" onClick={() => setDetailWork(w)}>
                  <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-muted">
                    {w.thumbnailUrl ? (
                      <img src={w.thumbnailUrl} alt={w.title} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-hyundai-gradient text-xs text-white/60">No thumbnail</div>
                    )}
                    <div className="absolute left-2 top-2">
                      {w.stage ? (
                        <span className={`rounded-full px-2 py-1 text-[11px] font-black shadow ${STAGE_TONE[w.stage]}`}>{STAGE_TEXT[w.stage]}</span>
                      ) : (
                        <span className="rounded-full bg-black/60 px-2 py-1 text-[11px] font-bold text-white backdrop-blur">미분류</span>
                      )}
                    </div>
                    {w.files?.length > 0 && (
                      <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[11px] font-bold text-white backdrop-blur">
                        <Paperclip className="h-3 w-3" /> {w.files.length}
                      </div>
                    )}
                  </div>
                  <div className="px-1 pt-3">
                    <h3 className="line-clamp-2 text-[15px] font-bold leading-snug text-foreground">{w.title}</h3>
                    <div className="mt-2 text-xs text-muted-foreground">{w.authorTeam || "—"}</div>
                    <div className="mt-0.5 text-xs font-semibold text-foreground/80">
                      {w.authorName} <span className="font-normal text-muted-foreground">{w.authorPosition}</span>
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">{w.source === "contest" ? "경진대회 출품작" : "신규 등록"}</div>
                  </div>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-56">
                <ContextMenuLabel>단계 지정 — {w.title}</ContextMenuLabel>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => stageMut.mutate({ workId: w.id, stage: 1 })}>
                  <span className="mr-2 h-2.5 w-2.5 rounded-full bg-slate-400" /> 1단계 · 제외·보류
                </ContextMenuItem>
                <ContextMenuItem onClick={() => stageMut.mutate({ workId: w.id, stage: 2 })}>
                  <span className="mr-2 h-2.5 w-2.5 rounded-full bg-amber-500" /> 2단계 · 보완 대상
                </ContextMenuItem>
                <ContextMenuItem onClick={() => stageMut.mutate({ workId: w.id, stage: 3 })}>
                  <span className="mr-2 h-2.5 w-2.5 rounded-full bg-sky-500" /> 3단계 · 고도화 대상
                </ContextMenuItem>
                <ContextMenuItem onClick={() => stageMut.mutate({ workId: w.id, stage: 4 })}>
                  <span className="mr-2 h-2.5 w-2.5 rounded-full bg-emerald-500" /> 4단계 · 적용중
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => stageMut.mutate({ workId: w.id, stage: null })}>미분류로 변경</ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          ))}
          {filteredWorks.length === 0 && (
            <div className="col-span-full rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">작품이 없습니다.</div>
          )}
        </div>
      </section>

      {/* 고도화 신청 검토 (전체) */}
      <section id="requests-table">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-black tracking-tight">고도화 신청 검토 — 전체</h2>
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[13px] font-bold text-primary">총 {requests.length}건</span>
        </div>
        <div className="mt-3 overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs">
              <tr><Th>신청일</Th><Th>작품</Th><Th>제출자</Th><Th className="w-[200px]">상태</Th></tr>
            </thead>
            <tbody>
              {requests.map((r: any) => (
                <tr key={r.id} className="border-t border-border">
                  <Td className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(r.createdAt)}</Td>
                  <Td className="font-semibold">{r.title}</Td>
                  <Td className="text-xs text-muted-foreground">{r.authorTeam} · {r.authorName}</Td>
                  <Td>
                    <select
                      value={r.status}
                      onChange={(e) => statusMut.mutate({ requestId: r.id, status: e.target.value })}
                      className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-[13px]"
                    >
                      {Object.entries(STATUS_LABEL).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                    </select>
                  </Td>
                </tr>
              ))}
              {requests.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-sm text-muted-foreground">아직 고도화 신청이 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {/* 목표 편집 다이얼로그 */}
      <Dialog open={goalOpen} onOpenChange={setGoalOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>실별 고도화 목표 편집</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {board.map((g: any) => (
              <div key={g.sil} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                <span className="font-semibold text-foreground">{g.sil}</span>
                <input
                  type="number" min={0}
                  value={goalDraft[g.sil] ?? 0}
                  onChange={(e) => setGoalDraft((d) => ({ ...d, [g.sil]: Number(e.target.value) || 0 }))}
                  className="w-24 rounded-lg border border-border bg-background px-2 py-1.5 text-right text-sm"
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setGoalOpen(false)}>취소</Button>
            <Button onClick={saveGoals} disabled={goalMut.isPending}>저장</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 작품 상세보기 다이얼로그 */}
      <Dialog open={!!detailWork} onOpenChange={(o) => !o && setDetailWork(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto p-0">
          {detailWork && (
            <div>
              <div className="relative aspect-video w-full overflow-hidden rounded-t-lg bg-black">
                {detailWork.thumbnailUrl ? (
                  <img src={detailWork.thumbnailUrl} alt={detailWork.title} className="absolute inset-0 h-full w-full object-contain" />
                ) : (
                  <div className="grid h-full w-full place-items-center bg-hyundai-gradient text-sm text-white/70">No thumbnail</div>
                )}
              </div>
              <div className="p-6">
                <div className="flex flex-wrap items-center gap-2">
                  {detailWork.stage ? (
                    <span className={`rounded-full px-2.5 py-1 text-[12px] font-black ${STAGE_TONE_SOFT[detailWork.stage]}`}>{STAGE_TEXT[detailWork.stage]}</span>
                  ) : (
                    <span className="rounded-full bg-muted px-2.5 py-1 text-[12px] font-bold text-muted-foreground">미분류</span>
                  )}
                  <span className="text-[12px] text-muted-foreground">{detailWork.source === "contest" ? "경진대회 출품작" : "신규 등록"}</span>
                </div>
                <h3 className="mt-2 text-[24px] font-black tracking-tight text-foreground">{detailWork.title}</h3>
                <div className="mt-1 text-[14px] text-muted-foreground">{detailWork.authorTeam} · {detailWork.authorName} {detailWork.authorPosition}</div>
                <div className="mt-5 space-y-4">
                  <Detail label="작품 설명">{detailWork.description}</Detail>
                  {detailWork.features && <Detail label="주요 기능">{detailWork.features}</Detail>}
                  {detailWork.techStack && <Detail label="사용 AI · 기술 · 스택">{detailWork.techStack}</Detail>}
                  {detailWork.expectedImpact && <Detail label="기대 효과">{detailWork.expectedImpact}</Detail>}
                </div>
                {detailWork.files?.length > 0 && (
                  <div className="mt-5 border-t border-border pt-4">
                    <div className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-widest text-muted-foreground">
                      <Paperclip className="h-3.5 w-3.5" /> 첨부 파일 ({detailWork.files.length})
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {detailWork.files.map((f: any, i: number) => (
                        <a
                          key={i}
                          href={f.signedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          download={f.file_name}
                          className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3.5 py-2.5 text-[13px] hover:border-primary/40 hover:bg-muted/50"
                        >
                          <span className="truncate font-medium">{f.file_name}</span>
                          <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 팀 작품 목록 팝업 (썸네일 포함) */}
      <Dialog open={!!teamSel} onOpenChange={(o) => !o && setTeamSel(null)}>
        <DialogContent className="max-h-[80vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>{teamSel} 작품 목록</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3">
            {teamWorks.map((w: any) => (
              <button
                key={w.id}
                type="button"
                className="text-left"
                onClick={() => { setTeamSel(null); setDetailWork(w); }}
              >
                <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-muted">
                  {w.thumbnailUrl ? (
                    <img src={w.thumbnailUrl} alt={w.title} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-hyundai-gradient text-xs text-white/60">No thumbnail</div>
                  )}
                  <div className="absolute left-2 top-2">
                    {w.stage ? (
                      <span className={`rounded-full px-2 py-1 text-[11px] font-black shadow ${STAGE_TONE[w.stage]}`}>{STAGE_TEXT[w.stage]}</span>
                    ) : (
                      <span className="rounded-full bg-black/60 px-2 py-1 text-[11px] font-bold text-white backdrop-blur">미분류</span>
                    )}
                  </div>
                  {w.files?.length > 0 && (
                    <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[11px] font-bold text-white backdrop-blur">
                      <Paperclip className="h-3 w-3" /> {w.files.length}
                    </div>
                  )}
                </div>
                <div className="px-0.5 pt-2">
                  <h4 className="line-clamp-2 text-[14px] font-bold leading-snug text-foreground">{w.title}</h4>
                  <div className="mt-1 text-xs text-muted-foreground">{w.authorName} {w.authorPosition} {w.source === "new" && "· 신규 등록"}</div>
                  {w.request && <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_TONE[w.request.status]}`}>{STATUS_LABEL[w.request.status]}</span>}
                </div>
              </button>
            ))}
            {teamWorks.length === 0 && <div className="col-span-full p-6 text-center text-sm text-muted-foreground">작품이 없습니다.</div>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const STAGE_LEGEND_CARD_TONE: Record<number, string> = {
  1: "border-slate-300 bg-slate-50",
  2: "border-amber-300 bg-amber-50",
  3: "border-sky-300 bg-sky-50",
  4: "border-emerald-300 bg-emerald-50",
};

function StageLegendCard({ stage }: { stage: 1 | 2 | 3 | 4 }) {
  return (
    <div className={`flex items-center gap-3 rounded-2xl border-2 p-4 ${STAGE_LEGEND_CARD_TONE[stage]}`}>
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-[15px] font-black text-white ${STAGE_TONE[stage]}`}>{stage}</span>
      <div>
        <div className="text-[15px] font-black text-foreground">{STAGE_TEXT[stage]}</div>
        <div className="text-[12.5px] font-medium text-foreground/70">{STAGE_DESC[stage]}</div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, tone, label, value }: { icon: any; tone: "slate" | "amber" | "primary" | "emerald"; label: string; value: number }) {
  const tones: Record<string, string> = {
    slate: "border-border bg-muted/40 text-foreground",
    amber: "border-amber-500/20 bg-amber-500/5 text-amber-600",
    primary: "border-primary/20 bg-primary/5 text-primary",
    emerald: "border-emerald-500/20 bg-emerald-500/5 text-emerald-600",
  };
  return (
    <div className={`rounded-2xl border p-4 ${tones[tone]}`}>
      <div className="flex items-center gap-1.5 text-[13px] font-bold"><Icon className="h-4 w-4" /> {label}</div>
      <div className="mt-1 text-3xl font-black text-foreground tabular-nums">{value}</div>
    </div>
  );
}

function FilterPill({ active, onClick, label, tone }: { active: boolean; onClick: () => void; label: string; tone?: string }) {
  const inactiveClass = tone ? `border-transparent ${tone}` : "border-border bg-card text-foreground/80 hover:border-primary/40";
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-[12.5px] font-bold transition ${active ? "border-primary bg-primary text-primary-foreground" : inactiveClass}`}
    >
      {label}
    </button>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[12px] font-bold uppercase tracking-widest text-muted-foreground">{label}</div>
      <p className="mt-0.5 whitespace-pre-wrap text-[15px] leading-relaxed text-foreground/90">{children || "—"}</p>
    </div>
  );
}

function Th({ children, className }: any) { return <th className={`px-3 py-2.5 text-left font-semibold ${className ?? ""}`}>{children}</th>; }
function Td({ children, className }: any) { return <td className={`px-3 py-2.5 ${className ?? ""}`}>{children}</td>; }
