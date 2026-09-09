import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { axGetOverview, axGetOrgBoard, axListTeamWorks, axGetMyWorks } from "@/lib/ax-lab.functions";
import { Button } from "@/components/ui/button";
import { AxPipelineStepper, AxProgressBar } from "@/components/AxPipelineStepper";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  FlaskConical, ChevronDown, ChevronRight, Sparkles, Rocket, ShieldCheck, Send, CheckCircle2, ArrowRight, Users2,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/ax-lab/")({ component: AxLabPage });

const STAGE_LABEL: Record<number, { label: string; tone: string }> = {
  1: { label: "1단계 · 제외·보류", tone: "bg-muted text-muted-foreground" },
  2: { label: "2단계 · 고도화 대상", tone: "bg-amber-400/15 text-amber-600" },
  3: { label: "3단계 · 즉시 적용", tone: "bg-emerald-500/15 text-emerald-600" },
};
const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  requested: { label: "신청 완료", tone: "bg-primary/10 text-primary" },
  reviewing: { label: "AX협의체 검토중", tone: "bg-amber-400/15 text-amber-600" },
  security: { label: "보안검증중", tone: "bg-orange-400/15 text-orange-600" },
  approved: { label: "승인", tone: "bg-emerald-500/15 text-emerald-600" },
  saas: { label: "SaaS 등록 완료", tone: "bg-blue-500/15 text-blue-600" },
  rejected: { label: "반려", tone: "bg-destructive/10 text-destructive" },
};

function AxLabPage() {
  const overviewFn = useServerFn(axGetOverview);
  const boardFn = useServerFn(axGetOrgBoard);
  const teamWorksFn = useServerFn(axListTeamWorks);
  const myWorksFn = useServerFn(axGetMyWorks);

  const { data: overview } = useQuery({ queryKey: ["ax", "overview"], queryFn: () => overviewFn() });
  const { data: board = [] } = useQuery({ queryKey: ["ax", "board"], queryFn: () => boardFn() });
  const { data: myWorks } = useQuery({ queryKey: ["ax", "myWorks"], queryFn: () => myWorksFn() });

  const [tab, setTab] = useState<"sil" | "team">("sil");
  const [silFilter, setSilFilter] = useState<string>("전체 실");
  const [openSil, setOpenSil] = useState<string | null>(null);
  const [teamSel, setTeamSel] = useState<string | null>(null);
  const { data: teamWorks = [] } = useQuery({
    queryKey: ["ax", "teamWorks", teamSel],
    queryFn: () => teamWorksFn({ data: { team: teamSel! } }),
    enabled: !!teamSel,
  });

  const flatTeams = useMemo(
    () => board.flatMap((g: any) => g.teams.map((t: any) => ({ ...t, sil: g.sil }))),
    [board],
  );
  const visibleSils = silFilter === "전체 실" ? board : board.filter((g: any) => g.sil === silFilter);
  const visibleTeams = silFilter === "전체 실" ? flatTeams : flatTeams.filter((t: any) => t.sil === silFilter);

  const myWorkRows = [
    ...(myWorks?.contestWork ? [{ ...myWorks.contestWork, badge: "경진대회 출품작" }] : []),
    ...(myWorks?.newWorks ?? []).map((w: any) => ({ ...w, badge: "신규 등록" })),
  ];

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-accent">
            <FlaskConical className="h-4 w-4" /> AX LAB
          </div>
          <h1 className="mt-2 text-3xl font-black tracking-tight">104개의 아이디어, 실제 업무의 변화로</h1>
        </div>
        <Button asChild size="lg">
          <Link to="/ax-lab/request">내 작품 고도화 신청하기 <ArrowRight className="ml-1.5 h-4 w-4" /></Link>
        </Button>
      </div>

      {/* 배너 */}
      <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10"><Users2 className="h-5 w-5 text-primary" /></span>
          <div>
            <div className="text-[15px] font-black text-foreground">AX협의체와 함께하는 AX 고도화 프로젝트</div>
            <div className="text-[13px] text-muted-foreground">작품을 선별하고 고도화하여, 사내 SaaS로 연결합니다.</div>
          </div>
        </div>
        <div className="text-right text-[13px] text-muted-foreground">작은 아이디어가<br />더 나은 업무의 시작이 됩니다.</div>
      </div>

      {/* 상단 통계 */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Rocket} tone="slate" label="경진대회 작품" value={overview?.totalContestWorks ?? 0} />
        <StatCard icon={Sparkles} tone="amber" label="고도화 대상 · 2단계" value={overview?.advancementTargetCount ?? 0} />
        <StatCard icon={Send} tone="primary" label="고도화 신청" value={overview?.requestedCount ?? 0} />
        <StatCard icon={ShieldCheck} tone="emerald" label="SaaS 승인" value={overview?.saasApprovedCount ?? 0} />
      </div>

      {/* 파이프라인 */}
      <div className="mt-4">
        <AxPipelineStepper />
      </div>

      {/* 내 신청 현황 */}
      {myWorkRows.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-black tracking-tight">내 신청 현황</h2>
          <div className="mt-3 space-y-2">
            {myWorkRows.map((w: any) => (
              <div key={w.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">{w.badge}</span>
                    {w.stage && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STAGE_LABEL[w.stage].tone}`}>{STAGE_LABEL[w.stage].label}</span>}
                  </div>
                  <div className="mt-1 text-[15px] font-black text-foreground">{w.title}</div>
                </div>
                {w.request ? (
                  <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-bold ${STATUS_LABEL[w.request.status].tone}`}>
                    <CheckCircle2 className="h-4 w-4" /> {STATUS_LABEL[w.request.status].label}
                  </span>
                ) : (
                  <Button asChild size="sm"><Link to="/ax-lab/request">고도화 신청하기 <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link></Button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 실별·팀별 현황 */}
      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-black tracking-tight">실별 고도화 현황</h2>
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
        <p className="mt-1 text-[13px] text-muted-foreground">실을 선택하면 팀별 현황과 작품을 확인할 수 있습니다.</p>

        <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-card">
          {tab === "sil" ? (
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-muted/50 text-xs">
                <tr>
                  <Th></Th><Th>실</Th><Th className="text-right">전체 작품</Th>
                  <Th className="text-right">1단계</Th><Th className="text-right">2단계</Th><Th className="text-right">3단계</Th>
                  <Th className="text-right">고도화 목표</Th><Th className="text-right">신청</Th><Th className="text-right">승인</Th>
                  <Th className="w-[160px]">목표 대비 신청</Th>
                </tr>
              </thead>
              <tbody>
                {visibleSils.map((g: any) => {
                  const expanded = openSil === g.sil;
                  const pct = g.goal > 0 ? Math.min(100, Math.round((g.requested / g.goal) * 100)) : 0;
                  return (
                    <Fragment key={g.sil}>
                      <tr className="cursor-pointer border-t border-border hover:bg-muted/40" onClick={() => setOpenSil(expanded ? null : g.sil)}>
                        <Td className="w-8">{expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</Td>
                        <Td className="font-bold">{g.sil}{g.isDept && <span className="ml-1.5 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">부서</span>}</Td>
                        <Td className="text-right tabular-nums">{g.total}</Td>
                        <Td className="text-right tabular-nums text-muted-foreground">{g.stage1}</Td>
                        <Td className="text-right tabular-nums text-amber-600 font-semibold">{g.stage2}</Td>
                        <Td className="text-right tabular-nums text-emerald-600 font-semibold">{g.stage3}</Td>
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
                          <Td className="text-right tabular-nums text-emerald-600">{t.stage3}</Td>
                          <Td className="text-right text-muted-foreground">—</Td>
                          <Td className="text-right tabular-nums text-primary">{t.requested}</Td>
                          <Td className="text-right tabular-nums text-emerald-600">{t.approved}</Td>
                          <Td></Td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
                {visibleSils.length === 0 && <tr><td colSpan={10} className="p-8 text-center text-sm text-muted-foreground">데이터가 없습니다.</td></tr>}
              </tbody>
            </table>
          ) : (
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/50 text-xs">
                <tr>
                  <Th>소속 실</Th><Th>팀</Th><Th className="text-right">전체</Th>
                  <Th className="text-right">1단계</Th><Th className="text-right">2단계</Th><Th className="text-right">3단계</Th>
                  <Th className="text-right">신청</Th><Th className="text-right">승인</Th>
                </tr>
              </thead>
              <tbody>
                {visibleTeams.map((t: any) => (
                  <tr key={t.sil + t.team} className="cursor-pointer border-t border-border hover:bg-muted/40" onClick={() => setTeamSel(t.team)}>
                    <Td className="text-muted-foreground">{t.sil}</Td>
                    <Td className="font-bold">{t.team}</Td>
                    <Td className="text-right tabular-nums">{t.total}</Td>
                    <Td className="text-right tabular-nums text-muted-foreground">{t.stage1}</Td>
                    <Td className="text-right tabular-nums text-amber-600">{t.stage2}</Td>
                    <Td className="text-right tabular-nums text-emerald-600">{t.stage3}</Td>
                    <Td className="text-right tabular-nums text-primary font-bold">{t.requested}</Td>
                    <Td className="text-right tabular-nums text-emerald-600 font-bold">{t.approved}</Td>
                  </tr>
                ))}
                {visibleTeams.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-sm text-muted-foreground">데이터가 없습니다.</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* 팀 작품 목록 팝업 */}
      <Dialog open={!!teamSel} onOpenChange={(o) => !o && setTeamSel(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{teamSel} 작품 목록</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {teamWorks.map((w: any) => (
              <div key={w.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-bold text-foreground">{w.title}</div>
                  <div className="text-xs text-muted-foreground">{w.authorName} {w.authorPosition} {w.source === "new" && "· 신규 등록"}</div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {w.stage && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STAGE_LABEL[w.stage].tone}`}>{STAGE_LABEL[w.stage].label}</span>}
                  {w.request && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_LABEL[w.request.status].tone}`}>{STATUS_LABEL[w.request.status].label}</span>}
                </div>
              </div>
            ))}
            {teamWorks.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">작품이 없습니다.</div>}
          </div>
        </DialogContent>
      </Dialog>
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

function Th({ children, className }: any) { return <th className={`px-3 py-2.5 text-left font-semibold ${className ?? ""}`}>{children}</th>; }
function Td({ children, className }: any) { return <td className={`px-3 py-2.5 ${className ?? ""}`}>{children}</td>; }
