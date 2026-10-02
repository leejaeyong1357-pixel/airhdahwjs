import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  axGetOverview, axGetOrgBoard, axAdminSetGoal, axAdminListWorks, axAdminSetStage,
  axAdminListRequests, axAdminSetRequestStatus, axAdminDeleteRequest,
  axAdminDecideRequest, axAdminDecideReview, axAdminIssueSaasNumber, axAdminCancelSaas,
} from "@/lib/ax-lab.functions";
import { AxPipeline } from "@/components/AxPipeline";
import { AxOrgBoard } from "@/components/AxOrgBoard";
import { AxWorkDetailDialog } from "@/components/AxWorkDetailDialog";
import { AxSecurityGuideAdmin } from "@/components/AxSecurityGuideAdmin";
import { AxSaasCertificate, type SaasCertInfo } from "@/components/AxSaasCertificate";
import { AxRequestBoard } from "@/components/AxRequestBoard";
import {
  AX_STAGES, AX_STAGE_LIST, AX_STATUS, SAAS_CATEGORIES, type AxStage,
} from "@/lib/ax-stages";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuLabel,
} from "@/components/ui/context-menu";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import {
  Target, ListChecks, ClipboardList, Search, Rocket, TrendingUp, Send, CheckCircle2,
  FileText, ArrowRight, MousePointerClick, Paperclip, Ban, Check, X, Award, Hash,
  RotateCcw, Undo2,
} from "lucide-react";

export function AdminAxLabView() {
  const qc = useQueryClient();
  const overviewFn = useServerFn(axGetOverview);
  const boardFn = useServerFn(axGetOrgBoard);
  const setGoalFn = useServerFn(axAdminSetGoal);
  const worksFn = useServerFn(axAdminListWorks);
  const setStageFn = useServerFn(axAdminSetStage);
  const reqFn = useServerFn(axAdminListRequests);
  const setReqStatusFn = useServerFn(axAdminSetRequestStatus);
  const delReqFn = useServerFn(axAdminDeleteRequest);

  const { data: overview } = useQuery({ queryKey: ["admin", "ax", "overview"], queryFn: () => overviewFn() });
  const { data: board = [] } = useQuery({ queryKey: ["admin", "ax", "board"], queryFn: () => boardFn() });
  const { data: works = [] } = useQuery({ queryKey: ["admin", "ax", "works"], queryFn: () => worksFn() });
  const { data: requests = [] } = useQuery({ queryKey: ["admin", "ax", "requests"], queryFn: () => reqFn() });

  // 관리자 화면과 구성원 대시보드(["ax", ...])를 함께 갱신한다.
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin", "ax"] });
    qc.invalidateQueries({ queryKey: ["ax"] });
  };
  const goalMut = useMutation({
    mutationFn: (v: { sil: string; goal: number }) => setGoalFn({ data: v }),
    onSuccess: invalidate, onError: (e: any) => toast.error(e.message),
  });
  const stageMut = useMutation({
    mutationFn: (v: { workId: string; stage: AxStage | null }) => setStageFn({ data: v }),
    onSuccess: (_r, v) => {
      toast.success(v.stage ? `${AX_STAGES[v.stage].label}(으)로 분류했습니다.` : "분류를 해제했습니다.");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });
  const statusMut = useMutation({
    mutationFn: (v: { requestId: string; status: string }) => setReqStatusFn({ data: v }),
    onSuccess: invalidate, onError: (e: any) => toast.error(e.message),
  });
  // ── 승인 관문 ──────────────────────────────────────────────
  const decideReqFn = useServerFn(axAdminDecideRequest);
  const decideReviewFn = useServerFn(axAdminDecideReview);
  const issueFn = useServerFn(axAdminIssueSaasNumber);

  /** 반려 사유 입력 — gate 는 어느 관문인지 */
  const [rejectTarget, setRejectTarget] = useState<{ row: any; gate: "request" | "review" } | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const decideMut = useMutation({
    mutationFn: (v: { row: any; gate: "request" | "review"; approve: boolean; reason?: string }) =>
      (v.gate === "request" ? decideReqFn : decideReviewFn)({
        data: { requestId: v.row.id, approve: v.approve, reason: v.reason ?? "" },
      }),
    onSuccess: (_r, v) => {
      toast.success(
        v.approve
          ? v.gate === "request" ? "승인했습니다. 2단계 고도화로 넘어갑니다." : "승인했습니다. SaaS 등록번호를 발급하세요."
          : v.gate === "request" ? "반려했습니다. 신청자에게 사유가 표시됩니다." : "반려했습니다. 2단계 고도화로 되돌렸습니다.",
      );
      setRejectTarget(null);
      setRejectReason("");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  // ── SaaS 등록번호 발급 ─────────────────────────────────────
  const [issueTarget, setIssueTarget] = useState<any | null>(null);
  const [issueCategory, setIssueCategory] = useState(SAAS_CATEGORIES[0].code);
  const [cert, setCert] = useState<SaasCertInfo | null>(null);

  const issueMut = useMutation({
    mutationFn: (v: { requestId: string; category: string }) => issueFn({ data: v }),
    onSuccess: (r: any) => {
      toast.success(`SaaS 등록번호 ${r.number} 를 발급했습니다.`);
      setIssueTarget(null);
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  // ── SaaS 등록 취소 ─────────────────────────────────────────
  const cancelSaasFn = useServerFn(axAdminCancelSaas);
  const [cancelTarget, setCancelTarget] = useState<any | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const cancelMut = useMutation({
    mutationFn: (v: { requestId: string; mode: "reissue" | "review"; reason?: string }) =>
      cancelSaasFn({ data: v }),
    onSuccess: (r: any, v) => {
      toast.success(
        v.mode === "reissue"
          ? `번호 ${r.released} 를 취소했습니다. 다시 발급할 수 있습니다.`
          : `SaaS 등록을 취소하고 승인 검토 단계로 되돌렸습니다.`,
      );
      setCancelTarget(null);
      setCancelReason("");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  // 신청 초기화(삭제) — 되돌릴 수 없어 확인을 받는다.
  const [excludeTarget, setExcludeTarget] = useState<any | null>(null);
  const deleteMut = useMutation({
    mutationFn: (requestId: string) => delReqFn({ data: { requestId } }),
    onSuccess: () => {
      toast.success("신청을 초기화했습니다. 신청 전 상태로 돌아갑니다.");
      setExcludeTarget(null);
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
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

  // 작품 단계 분류 검색 · 단계 필터
  const [q, setQ] = useState("");
  const [stageFilter, setStageFilter] = useState<"all" | "none" | AxStage>("all");
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

  const [detailWork, setDetailWork] = useState<any | null>(null);
  const [reqDetail, setReqDetail] = useState<any | null>(null);

  return (
    <div className="space-y-8">
      {/* 헤더 */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[12px] font-black uppercase tracking-[0.2em] text-blue-600">AX LAB · 관리자</div>
          <h1 className="mt-2 text-[28px] font-black leading-tight tracking-tight text-slate-900">
            104개의 아이디어, 실제 업무의 변화로
          </h1>
          <p className="mt-1.5 text-[14px] text-slate-500">
            AX협의체와 함께 작품을 고도화하고, 실제 업무 적용과 전사 확산으로 연결합니다.
          </p>
        </div>
        <Button variant="outline" onClick={openGoalDialog}><Target className="mr-1.5 h-4 w-4" /> 목표 편집</Button>
      </div>

      {/* 통계 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Rocket} tone="slate" label="경진대회 작품" value={overview?.totalContestWorks ?? 0} />
        <StatCard icon={TrendingUp} tone="orange" label="고도화 대상 · 3단계" value={overview?.advancementTargetCount ?? 0} />
        <StatCard icon={Send} tone="blue" label="고도화 신청" value={overview?.requestedCount ?? 0} />
        <StatCard icon={CheckCircle2} tone="emerald" label="SaaS 승인" value={overview?.saasApprovedCount ?? 0} />
      </div>

      <AxPipeline />

      <AxOrgBoard board={board} />

      {/* 단계별 신청 현황 보드 */}
      <AxRequestBoard
        requests={requests}
        busy={decideMut.isPending}
        onDetail={(r) => setReqDetail(r)}
        onApprove={(r, gate) => decideMut.mutate({ row: r, gate, approve: true })}
        onReject={(r, gate) => { setRejectReason(""); setRejectTarget({ row: r, gate }); }}
        onIssue={(r) => { setIssueCategory(SAAS_CATEGORIES[0].code); setIssueTarget(r); }}
        onCert={(r) => setCert(certInfoOf(r))}
        onExclude={(r) => setExcludeTarget(r)}
        onCancelSaas={(r) => { setCancelReason(""); setCancelTarget(r); }}
      />

      {/* 작품 단계 분류 (썸네일 카드 + 우클릭 지정) */}
      <section id="classify" className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <ListChecks className="h-5 w-5 text-blue-600" />
          <h2 className="text-[20px] font-black tracking-tight text-slate-900">작품 단계 분류</h2>
          <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[13px] font-bold text-blue-600">총 {works.length}건</span>
          <span className="ml-1 inline-flex items-center gap-1 text-[12px] font-semibold text-slate-400">
            <MousePointerClick className="h-3.5 w-3.5" /> 클릭하면 상세보기 · 우클릭하면 단계를 지정하세요
          </span>
          <div className="relative ml-auto">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="작품명 · 이름 · 팀 검색"
              className="w-60 rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm"
            />
          </div>
        </div>

        {/* 각 단계가 무슨 뜻인지 */}
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {AX_STAGE_LIST.map((st) => (
            <div key={st} className={`flex items-center gap-3 rounded-2xl border-2 p-4 ${AX_STAGES[st].card}`}>
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-[15px] font-black ${AX_STAGES[st].solid}`}>
                {st}
              </span>
              <div>
                <div className="text-[15px] font-black text-slate-900">{AX_STAGES[st].label}</div>
                <div className="text-[12.5px] font-medium text-slate-600">{AX_STAGES[st].desc}</div>
                {AX_STAGES[st].note && (
                  <div className="mt-1 break-keep text-[11.5px] leading-snug text-slate-500">{AX_STAGES[st].note}</div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* 단계별 필터 */}
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <FilterPill active={stageFilter === "all"} onClick={() => setStageFilter("all")} label={`전체 ${works.length}`} />
          <FilterPill active={stageFilter === "none"} onClick={() => setStageFilter("none")} label={`미분류 ${works.filter((w: any) => !w.stage).length}`} />
          {AX_STAGE_LIST.map((st) => (
            <FilterPill
              key={st}
              active={stageFilter === st}
              onClick={() => setStageFilter(st)}
              label={`${AX_STAGES[st].label} ${works.filter((w: any) => w.stage === st).length}`}
              tone={AX_STAGES[st].soft}
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
                        <span className={`rounded-full px-2 py-1 text-[11px] font-black shadow ${AX_STAGES[w.stage as AxStage].solid}`}>
                          {AX_STAGES[w.stage as AxStage].label}
                        </span>
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
                    <h3 className="line-clamp-2 text-[15px] font-bold leading-snug text-slate-900">{w.title}</h3>
                    <div className="mt-2 text-xs text-slate-500">{w.authorTeam || "—"}</div>
                    <div className="mt-0.5 text-xs font-semibold text-slate-700">
                      {w.authorName} <span className="font-normal text-slate-500">{w.authorPosition}</span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400">{w.source === "contest" ? "경진대회 출품작" : "신규 등록"}</div>
                  </div>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-60">
                <ContextMenuLabel>단계 지정 — {w.title}</ContextMenuLabel>
                <ContextMenuSeparator />
                {AX_STAGE_LIST.map((st) => (
                  <ContextMenuItem key={st} onClick={() => stageMut.mutate({ workId: w.id, stage: st })}>
                    <span className={`mr-2 h-2.5 w-2.5 rounded-full ${AX_STAGES[st].dot}`} /> {AX_STAGES[st].label}
                  </ContextMenuItem>
                ))}
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => stageMut.mutate({ workId: w.id, stage: null })}>미분류로 변경</ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          ))}
          {filteredWorks.length === 0 && (
            <div className="col-span-full rounded-2xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-400">작품이 없습니다.</div>
          )}
        </div>
      </section>

      <AxSecurityGuideAdmin />

      {/* 고도화 신청 검토 (전체) */}
      <section id="requests-table" className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-blue-600" />
          <h2 className="text-[20px] font-black tracking-tight text-slate-900">고도화 신청 검토 — 전체</h2>
          <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[13px] font-bold text-blue-600">총 {requests.length}건</span>
        </div>
        <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-3 py-3 text-left font-bold">신청일</th>
                <th className="px-3 py-3 text-left font-bold">작품</th>
                <th className="px-3 py-3 text-left font-bold">제출자</th>
                <th className="w-[200px] px-3 py-3 text-left font-bold">상태</th>
                <th className="w-[210px] px-3 py-3 text-left font-bold">처리</th>
                <th className="w-[80px] px-3 py-3 text-center font-bold">초기화</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r: any) => (
                <tr key={r.id} className="border-t border-slate-200">
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-500">{formatDate(r.createdAt)}</td>
                  <td className="px-3 py-2.5">
                    <button onClick={() => setReqDetail(r)} className="font-semibold text-slate-900 underline-offset-4 hover:text-blue-600 hover:underline">
                      {r.title}
                    </button>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-500">{r.authorTeam} · {r.authorName}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`rounded-full px-2.5 py-1 text-[12px] font-bold ${AX_STATUS[r.status]?.tone ?? ""}`}>
                        {AX_STATUS[r.status]?.label ?? r.status}
                      </span>
                      {r.saas?.number && (
                        <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-[11px] font-black tabular-nums text-emerald-700">
                          {r.saas.number}
                        </span>
                      )}
                    </div>
                    {r.rejectReason && (
                      <div className="mt-1 break-keep text-[11.5px] leading-snug text-destructive">
                        반려 사유: {r.rejectReason}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <GateActions
                      row={r}
                      onApprove={(gate) => decideMut.mutate({ row: r, gate, approve: true })}
                      onReject={(gate) => { setRejectReason(""); setRejectTarget({ row: r, gate }); }}
                      onIssue={() => { setIssueCategory(SAAS_CATEGORIES[0].code); setIssueTarget(r); }}
                      onCert={() => setCert(certInfoOf(r))}
                      onCancelSaas={() => { setCancelReason(""); setCancelTarget(r); }}
                      busy={decideMut.isPending}
                    />
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <button
                      onClick={() => setExcludeTarget(r)}
                      aria-label={`${r.title} 신청 초기화`}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[12px] font-bold text-slate-500 transition hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive"
                    >
                      <Ban className="h-3.5 w-3.5" /> 초기화
                    </button>
                  </td>
                </tr>
              ))}
              {requests.length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center text-sm text-slate-400">아직 고도화 신청이 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 반려 사유 */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {rejectTarget?.gate === "request" ? "고도화 신청을 반려합니다" : "고도화 승인 검토를 반려합니다"}
            </DialogTitle>
          </DialogHeader>
          {rejectTarget && (
            <div className="rounded-xl border border-slate-200 p-3.5">
              <div className="text-[15px] font-black text-slate-900">{rejectTarget.row.title}</div>
              <div className="mt-0.5 text-[12.5px] text-slate-500">
                {rejectTarget.row.authorTeam} · {rejectTarget.row.authorName}
              </div>
            </div>
          )}
          <div>
            <label className="text-[12.5px] font-bold text-slate-500">반려 사유 (신청자에게 그대로 표시됩니다)</label>
            <Textarea
              rows={5}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="mt-1.5"
              placeholder="어떤 점을 보완해야 하는지 구체적으로 적어주세요."
            />
          </div>
          <p className="break-keep text-[12.5px] leading-relaxed text-slate-500">
            {rejectTarget?.gate === "request"
              ? "반려하면 신청자가 사유를 확인하고 보완해 다시 신청할 수 있습니다."
              : "반려하면 처음이 아니라 바로 전 단계인 2단계(고도화)로 돌아갑니다."}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>취소</Button>
            <Button
              variant="destructive"
              disabled={decideMut.isPending || !rejectReason.trim()}
              onClick={() =>
                decideMut.mutate({
                  row: rejectTarget!.row, gate: rejectTarget!.gate,
                  approve: false, reason: rejectReason.trim(),
                })
              }
            >
              <X className="mr-1.5 h-4 w-4" /> 반려하기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SaaS 등록번호 발급 */}
      <Dialog open={!!issueTarget} onOpenChange={(o) => !o && setIssueTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>SaaS 등록번호 발급</DialogTitle></DialogHeader>
          {issueTarget && (
            <div className="rounded-xl border border-slate-200 p-3.5">
              <div className="text-[15px] font-black text-slate-900">{issueTarget.title}</div>
              <div className="mt-0.5 text-[12.5px] text-slate-500">
                {issueTarget.authorTeam} · {issueTarget.authorName}
              </div>
            </div>
          )}
          <div>
            <label className="text-[12.5px] font-bold text-slate-500">업무성격 구분</label>
            <select
              value={issueCategory}
              onChange={(e) => setIssueCategory(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[14px] font-semibold"
            >
              {SAAS_CATEGORIES.map((c) => (
                <option key={c.code} value={c.code}>{c.code} · {c.label}</option>
              ))}
            </select>
          </div>
          <div className="rounded-xl bg-[#f4f8ff] p-4 text-center">
            <div className="text-[11.5px] font-bold uppercase tracking-[0.2em] text-slate-400">발급될 번호</div>
            <div className="mt-1.5 text-[24px] font-black tabular-nums tracking-[0.06em] text-[#12315c]">
              TZAX{issueCategory}{String(new Date().getFullYear()).slice(-2)}
              <span className="text-slate-400">###</span>
            </div>
            <div className="mt-1 text-[11.5px] text-slate-400">
              일련번호는 같은 구분·같은 년도에서 자동으로 이어 붙습니다.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIssueTarget(null)}>취소</Button>
            <Button
              disabled={issueMut.isPending}
              onClick={() => issueMut.mutate({ requestId: issueTarget.id, category: issueCategory })}
            >
              <Hash className="mr-1.5 h-4 w-4" /> 발급하기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SaaS 등록 취소 */}
      <Dialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>SaaS 등록을 취소합니다</DialogTitle></DialogHeader>
          {cancelTarget && (
            <div className="rounded-xl border border-slate-200 p-3.5">
              <div className="text-[15px] font-black text-slate-900">{cancelTarget.title}</div>
              <div className="mt-0.5 text-[12.5px] text-slate-500">
                {cancelTarget.authorTeam} · {cancelTarget.authorName}
              </div>
              {cancelTarget.saas?.number && (
                <div className="mt-2 inline-block rounded-full bg-emerald-500/15 px-2.5 py-1 text-[12px] font-black tabular-nums text-emerald-700">
                  {cancelTarget.saas.number}
                </div>
              )}
            </div>
          )}

          <div className="space-y-2.5">
            {/* 1) 번호만 다시 발급 */}
            <div className="rounded-xl border border-slate-200 p-3.5">
              <div className="text-[14px] font-black text-slate-900">번호만 취소하고 다시 발급</div>
              <p className="mt-1 break-keep text-[12.5px] leading-relaxed text-slate-500">
                업무성격 구분을 잘못 골랐을 때 씁니다. 등록 상태는 그대로 두고
                번호만 비워 [발급 대기]로 돌아갑니다.
              </p>
              <Button
                variant="outline"
                className="mt-2.5 w-full"
                disabled={cancelMut.isPending || !cancelTarget?.saas?.number}
                onClick={() => cancelMut.mutate({ requestId: cancelTarget.id, mode: "reissue" })}
              >
                <RotateCcw className="mr-1.5 h-4 w-4" /> 번호 다시 발급
              </Button>
            </div>

            {/* 2) 승인 검토로 되돌리기 */}
            <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-3.5">
              <div className="text-[14px] font-black text-slate-900">등록을 취소하고 승인 검토로</div>
              <p className="mt-1 break-keep text-[12.5px] leading-relaxed text-slate-500">
                번호를 반납하고 3단계(승인 검토)로 되돌립니다. 사유는 신청자에게 그대로 보입니다.
              </p>
              <Textarea
                rows={3}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="mt-2 bg-white"
                placeholder="취소 사유를 적어주세요."
              />
              <Button
                variant="destructive"
                className="mt-2 w-full"
                disabled={cancelMut.isPending || !cancelReason.trim()}
                onClick={() =>
                  cancelMut.mutate({
                    requestId: cancelTarget.id, mode: "review", reason: cancelReason.trim(),
                  })
                }
              >
                <Undo2 className="mr-1.5 h-4 w-4" /> 등록 취소하고 되돌리기
              </Button>
            </div>
          </div>

          <p className="text-[12px] leading-relaxed text-slate-400">
            취소한 번호는 다시 쓰지 않고 비워 둡니다. 같은 번호가 두 곳에 남지 않도록 다음 발급은 그 다음 번호부터 이어집니다.
          </p>
        </DialogContent>
      </Dialog>

      <AxSaasCertificate info={cert} open={!!cert} onOpenChange={(o) => !o && setCert(null)} />

      {/* 신청 초기화 확인 */}
      <Dialog open={!!excludeTarget} onOpenChange={(o) => !o && setExcludeTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>신청을 초기화할까요?</DialogTitle></DialogHeader>
          {excludeTarget && (
            <div className="rounded-xl border border-slate-200 p-3.5">
              <div className="text-[15px] font-black text-slate-900">{excludeTarget.title}</div>
              <div className="mt-0.5 text-[12.5px] text-slate-500">
                {excludeTarget.authorTeam} · {excludeTarget.authorName}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${AX_STATUS[excludeTarget.status]?.tone ?? ""}`}>
                  현재 {AX_STATUS[excludeTarget.status]?.label ?? excludeTarget.status}
                </span>
                {excludeTarget.saas?.number && (
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-black tabular-nums text-emerald-700">
                    {excludeTarget.saas.number}
                  </span>
                )}
              </div>
            </div>
          )}
          <p className="break-keep text-[13.5px] leading-relaxed text-slate-500">
            아예 신청하지 않은 상태로 되돌립니다. 지금 어느 단계에 있든
            목록·집계·파이프라인에서 모두 빠지고, 작성한 신청서 내용도 함께 사라집니다.
            되돌릴 수 없으며, 초기화한 뒤에는 본인이 다시 신청할 수 있습니다.
          </p>
          {excludeTarget?.saas?.number && (
            <p className="break-keep rounded-lg bg-amber-50 p-3 text-[12.5px] leading-relaxed text-amber-700">
              발급된 SaaS 등록번호 <b>{excludeTarget.saas.number}</b> 도 함께 회수됩니다.
              이 번호는 다시 쓰지 않고 비워 두며, 다음 발급은 그 다음 번호로 이어집니다.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setExcludeTarget(null)}>취소</Button>
            <Button
              variant="destructive"
              disabled={deleteMut.isPending}
              onClick={() => deleteMut.mutate(excludeTarget.id)}
            >
              <Ban className="mr-1.5 h-4 w-4" /> 초기화하기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      {/* 고도화 신청서 상세 — AX협의체 실효성 검토용 */}
      <Dialog open={!!reqDetail} onOpenChange={(o) => !o && setReqDetail(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          {reqDetail && (
            <>
              <DialogHeader><DialogTitle>고도화 신청서 — {reqDetail.title}</DialogTitle></DialogHeader>
              <div className="flex flex-wrap items-center gap-2">
                {reqDetail.stage && (
                  <span className={`rounded-full px-2.5 py-1 text-[12px] font-black ${AX_STAGES[reqDetail.stage as AxStage].soft}`}>
                    {AX_STAGES[reqDetail.stage as AxStage].label}
                  </span>
                )}
                <span className={`rounded-full px-2.5 py-1 text-[12px] font-bold ${AX_STATUS[reqDetail.status].tone}`}>
                  {AX_STATUS[reqDetail.status].label}
                </span>
                <span className="text-[12.5px] text-slate-500">
                  {reqDetail.authorTeam} · {reqDetail.authorName} · 신청 {formatDate(reqDetail.createdAt)}
                </span>
              </div>

              {reqDetail.form ? (
                <div className="mt-2 space-y-4">
                  <ReqItem n={1} label="활용할 업무와 현재의 불편함">{reqDetail.form.painPoint}</ReqItem>
                  <ReqItem n={2} label="고도화하고 싶은 내용">
                    {reqDetail.form.improvementTypes?.length > 0 && (
                      <div className="mb-1.5 flex flex-wrap gap-1.5">
                        {reqDetail.form.improvementTypes.map((t: string) => (
                          <span key={t} className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11.5px] font-bold text-blue-600">{t}</span>
                        ))}
                      </div>
                    )}
                    {reqDetail.form.improvementDetail}
                  </ReqItem>
                  <ReqItem n={3} label="고도화에 필요한 지원">{reqDetail.form.neededSupport}</ReqItem>
                  <ReqItem n={4} label="예상 사용자 수">{reqDetail.form.expectedUsers}</ReqItem>
                  <ReqItem n={5} label="예상 개발 완료 기간">{reqDetail.form.expectedDone}</ReqItem>
                  <ReqItem n={6} label="기대 효과">{reqDetail.form.expectedImpact}</ReqItem>
                  <ReqItem n={7} label="사용 데이터">
                    {reqDetail.form.dataTypes?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {reqDetail.form.dataTypes.map((t: string) => (
                          <span
                            key={t}
                            className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-bold ${
                              t === "개인정보" || t === "회사 내부정보" ? "bg-amber-400/15 text-amber-700" : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </ReqItem>
                  <ReqItem n={8} label="프로그램 · 문서 링크">
                    {reqDetail.form.referenceLink ? (
                      <a href={reqDetail.form.referenceLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline underline-offset-4">
                        {reqDetail.form.referenceLink}
                      </a>
                    ) : ""}
                  </ReqItem>
                  {reqDetail.form.attachmentPath && (
                    <ReqItem n={9} label="소개 자료">
                      <a
                        href={reqDetail.form.attachmentPath}
                        target="_blank"
                        rel="noopener noreferrer"
                        download={reqDetail.form.attachmentName}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-[13px] hover:border-blue-300"
                      >
                        <Paperclip className="h-4 w-4 text-slate-400" />
                        {reqDetail.form.attachmentName ?? "첨부파일"}
                      </a>
                    </ReqItem>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
                  신청서 상세 내용이 없습니다. (신청서 양식 도입 전 접수 건)
                </div>
              )}

              <div className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3">
                <span className="text-[13px] font-bold text-slate-600">검토 상태 변경</span>
                <select
                  value={reqDetail.status}
                  onChange={(e) => {
                    statusMut.mutate({ requestId: reqDetail.id, status: e.target.value });
                    setReqDetail({ ...reqDetail, status: e.target.value });
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] font-semibold"
                >
                  {Object.entries(AX_STATUS).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}
                </select>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AxWorkDetailDialog work={detailWork} onClose={() => setDetailWork(null)} />
    </div>
  );
}

function ReqItem({ n, label, children }: { n: number; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[12px] font-bold text-slate-500">
        <span className="grid h-5 w-5 place-items-center rounded-md bg-slate-100 text-[11px] font-black text-slate-500">{n}</span>
        {label}
      </div>
      <div className="mt-1 whitespace-pre-wrap break-keep pl-6.5 text-[14.5px] leading-relaxed text-slate-800">
        {children || <span className="text-slate-400">—</span>}
      </div>
    </div>
  );
}

function FilterPill({ active, onClick, label, tone }: { active: boolean; onClick: () => void; label: string; tone?: string }) {
  const inactive = tone ? `border-transparent ${tone}` : "border-slate-200 bg-white text-slate-600 hover:border-blue-300";
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-[12.5px] font-bold transition ${active ? "border-blue-600 bg-blue-600 text-white" : inactive}`}
    >
      {label}
    </button>
  );
}

function StatCard({ icon: Icon, tone, label, value }: {
  icon: any; tone: "slate" | "orange" | "blue" | "emerald"; label: string; value: number;
}) {
  const tones = {
    slate: { box: "border-slate-200 bg-white", text: "text-slate-500" },
    orange: { box: "border-orange-200 bg-orange-50/70", text: "text-orange-600" },
    blue: { box: "border-blue-200 bg-blue-50/70", text: "text-blue-600" },
    emerald: { box: "border-emerald-200 bg-emerald-50/70", text: "text-emerald-600" },
  }[tone];
  return (
    <div className={`rounded-2xl border p-5 ${tones.box}`}>
      <div className={`flex items-center gap-2 text-[14px] font-bold ${tones.text}`}>
        <Icon className="h-[18px] w-[18px]" /> {label}
      </div>
      <div className="mt-2 text-[34px] font-black leading-none tabular-nums text-slate-900">{value}</div>
    </div>
  );
}

/** 신청 행 → 인증서에 채울 정보 */
function certInfoOf(r: any): SaasCertInfo | null {
  if (!r?.saas?.number) return null;
  return {
    number: r.saas.number,
    category: r.saas.category,
    issuedAt: r.saas.issuedAt,
    title: r.title,
    authorName: r.authorName,
    authorTeam: r.authorTeam,
    authorEmpNo: r.authorEmpNo ?? "",
  };
}

/**
 * 현재 단계에 맞는 처리 버튼만 보여준다.
 *   승인 대기 → [승인] [반려]      2차 검토 대기 → [승인] [반려]
 *   고도화 중 → 본인이 검토 요청할 때까지 대기
 *   승인 완료 → [번호 발급] → 발급 후 [인증서]
 */
function GateActions({ row, onApprove, onReject, onIssue, onCert, onCancelSaas, busy }: {
  row: any;
  onApprove: (gate: "request" | "review") => void;
  onReject: (gate: "request" | "review") => void;
  onIssue: () => void;
  onCert: () => void;
  onCancelSaas: () => void;
  busy?: boolean;
}) {
  const gate: "request" | "review" | null =
    row.status === "requested" ? "request" : row.status === "review" ? "review" : null;

  if (gate) {
    return (
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          disabled={busy}
          onClick={() => onApprove(gate)}
          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[12px] font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" /> 승인
        </button>
        <button
          disabled={busy}
          onClick={() => onReject(gate)}
          className="inline-flex items-center gap-1 rounded-lg border border-destructive/30 px-2.5 py-1.5 text-[12px] font-bold text-destructive transition hover:bg-destructive/5 disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" /> 반려
        </button>
      </div>
    );
  }

  if (row.status === "issued") {
    return row.saas?.number ? (
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          onClick={onCert}
          className="inline-flex items-center gap-1 rounded-lg border border-[#dbe5f5] px-2.5 py-1.5 text-[12px] font-bold text-blue-600 transition hover:bg-[#eef4ff]"
        >
          <Award className="h-3.5 w-3.5" /> 인증서
        </button>
        <button
          onClick={onCancelSaas}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px] font-bold text-slate-500 transition hover:border-destructive/40 hover:text-destructive"
        >
          <Undo2 className="h-3.5 w-3.5" /> 등록 취소
        </button>
      </div>
    ) : (
      <button
        onClick={onIssue}
        className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-[12px] font-bold text-white transition hover:bg-blue-700"
      >
        <Hash className="h-3.5 w-3.5" /> 번호 발급
      </button>
    );
  }

  return <span className="shrink-0 text-[12px] text-slate-400">본인 진행 중</span>;
}
