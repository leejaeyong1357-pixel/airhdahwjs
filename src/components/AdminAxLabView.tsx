import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  axGetOverview, axGetOrgBoard, axAdminSetGoal, axAdminListWorks, axAdminSetStage,
  axAdminListRequests, axAdminSetRequestStatus,
} from "@/lib/ax-lab.functions";
import { AxPipelineStepper } from "@/components/AxPipelineStepper";
import { AxOrgBoard } from "@/components/AxOrgBoard";
import { AxWorkDetailDialog } from "@/components/AxWorkDetailDialog";
import { AX_STAGES, AX_STAGE_LIST, AX_STATUS, type AxStage } from "@/lib/ax-stages";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuLabel,
} from "@/components/ui/context-menu";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import {
  Target, ListChecks, ClipboardList, Search, Rocket, TrendingUp, Send, CheckCircle2,
  FileText, ArrowRight, MousePointerClick, Paperclip,
} from "lucide-react";

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

      <AxPipelineStepper />

      <AxOrgBoard board={board} />

      {/* 검토가 필요한 작품 */}
      <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[20px] font-black tracking-tight text-slate-900">검토가 필요한 작품</h2>
          <a href="#requests-table" className="inline-flex items-center gap-1 text-[13px] font-semibold text-blue-600">
            전체 신청 보기 <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
        <div className="mt-3 flex w-fit gap-1 rounded-xl bg-slate-100 p-1">
          {REVIEW_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setReviewTab(t.key)}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-bold transition ${
                reviewTab === t.key ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="mt-3 space-y-2">
          {reviewFiltered.slice(0, 6).map((r: any) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 p-3.5">
              <FileText className="h-5 w-5 shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14.5px] font-bold text-slate-900">{r.title}</div>
                <div className="text-[12px] text-slate-500">{r.authorTeam} · {r.authorName}</div>
              </div>
              {r.stage && (
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${AX_STAGES[r.stage as AxStage].soft}`}>
                  {AX_STAGES[r.stage as AxStage].label}
                </span>
              )}
              <select
                value={r.status}
                onChange={(e) => statusMut.mutate({ requestId: r.id, status: e.target.value })}
                className={`shrink-0 rounded-full border-0 px-2.5 py-1 text-[12px] font-bold ${AX_STATUS[r.status].tone}`}
              >
                {Object.entries(AX_STATUS).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}
              </select>
            </div>
          ))}
          {reviewFiltered.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">해당하는 작품이 없습니다.</div>
          )}
        </div>
      </section>

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
              </tr>
            </thead>
            <tbody>
              {requests.map((r: any) => (
                <tr key={r.id} className="border-t border-slate-200">
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-500">{formatDate(r.createdAt)}</td>
                  <td className="px-3 py-2.5 font-semibold text-slate-900">{r.title}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-500">{r.authorTeam} · {r.authorName}</td>
                  <td className="px-3 py-2.5">
                    <select
                      value={r.status}
                      onChange={(e) => statusMut.mutate({ requestId: r.id, status: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[13px]"
                    >
                      {Object.entries(AX_STATUS).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
              {requests.length === 0 && (
                <tr><td colSpan={4} className="p-8 text-center text-sm text-slate-400">아직 고도화 신청이 없습니다.</td></tr>
              )}
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

      <AxWorkDetailDialog work={detailWork} onClose={() => setDetailWork(null)} />
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
