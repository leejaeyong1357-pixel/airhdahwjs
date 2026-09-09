import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  axGetOverview, axGetOrgBoard, axListTeamWorks, axGetMyWorks, axRegisterNewWork, axRequestAdvancement,
} from "@/lib/ax-lab.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  FlaskConical, ChevronDown, ChevronRight, Sparkles, Rocket, ShieldCheck, PlusCircle, Send, CheckCircle2,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/ax-lab")({ component: AxLabPage });

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
  const qc = useQueryClient();
  const overviewFn = useServerFn(axGetOverview);
  const boardFn = useServerFn(axGetOrgBoard);
  const teamWorksFn = useServerFn(axListTeamWorks);
  const myWorksFn = useServerFn(axGetMyWorks);
  const registerFn = useServerFn(axRegisterNewWork);
  const requestFn = useServerFn(axRequestAdvancement);

  const { data: overview } = useQuery({ queryKey: ["ax", "overview"], queryFn: () => overviewFn() });
  const { data: board = [] } = useQuery({ queryKey: ["ax", "board"], queryFn: () => boardFn() });
  const { data: myWorks } = useQuery({ queryKey: ["ax", "myWorks"], queryFn: () => myWorksFn() });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["ax"] });
  };
  const requestMut = useMutation({
    mutationFn: (v: { workId: string; workSource: "contest" | "new" }) => requestFn({ data: v }),
    onSuccess: () => { toast.success("고도화 신청이 접수되었습니다."); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const [openSil, setOpenSil] = useState<string | null>(null);
  const [teamSel, setTeamSel] = useState<string | null>(null);
  const { data: teamWorks = [] } = useQuery({
    queryKey: ["ax", "teamWorks", teamSel],
    queryFn: () => teamWorksFn({ data: { team: teamSel! } }),
    enabled: !!teamSel,
  });

  const [registerOpen, setRegisterOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [techStack, setTechStack] = useState("");
  const registerMut = useMutation({
    mutationFn: () => registerFn({ data: { title, description, techStack } }),
    onSuccess: () => {
      toast.success("새 작품이 등록되었습니다.");
      setRegisterOpen(false); setTitle(""); setDescription(""); setTechStack("");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-accent">
        <FlaskConical className="h-4 w-4" /> AX LAB
      </div>
      <h1 className="mt-2 text-3xl font-black tracking-tight">104개의 아이디어, 이제 실제 업무로 연결합니다</h1>
      <p className="mt-2 text-[15px] text-muted-foreground">
        경진대회 작품을 AX협의체가 선별·고도화하여 실제 사내 SaaS로 전환하는 과정입니다.
      </p>

      {/* 상단 통계 */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Rocket} tone="slate" label="경진대회 작품" value={overview?.totalContestWorks ?? 0} />
        <StatCard icon={Sparkles} tone="amber" label="고도화 대상" value={overview?.advancementTargetCount ?? 0} />
        <StatCard icon={Send} tone="primary" label="고도화 신청" value={overview?.requestedCount ?? 0} />
        <StatCard icon={ShieldCheck} tone="emerald" label="SaaS 승인" value={overview?.saasApprovedCount ?? 0} />
      </div>

      {/* 내 작품 고도화 신청 */}
      <section className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-black tracking-tight">내 작품 고도화 신청</h2>
          <Button variant="outline" onClick={() => setRegisterOpen(true)}>
            <PlusCircle className="mr-1.5 h-4 w-4" /> 새로운 작품 등록
          </Button>
        </div>
        <div className="mt-3 space-y-2">
          {myWorks?.contestWork && (
            <MyWorkRow
              title={myWorks.contestWork.title}
              badge="경진대회 출품작"
              stage={myWorks.contestWork.stage}
              request={myWorks.contestWork.request}
              onRequest={() => requestMut.mutate({ workId: myWorks.contestWork!.id, workSource: "contest" })}
              pending={requestMut.isPending}
            />
          )}
          {myWorks?.newWorks.map((w: any) => (
            <MyWorkRow
              key={w.id}
              title={w.title}
              badge="신규 등록"
              stage={w.stage}
              request={w.request}
              onRequest={() => requestMut.mutate({ workId: w.id, workSource: "new" })}
              pending={requestMut.isPending}
            />
          ))}
          {!myWorks?.contestWork && (myWorks?.newWorks.length ?? 0) === 0 && (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              등록된 작품이 없습니다. 경진대회에 출품하지 않았다면 "새로운 작품 등록"으로 아이디어를 추가해 보세요.
            </div>
          )}
        </div>
      </section>

      {/* 실별·팀별 현황 */}
      <section className="mt-10">
        <h2 className="text-xl font-black tracking-tight">실별·팀별 고도화 현황</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/50 text-xs">
              <tr>
                <Th></Th><Th>실</Th><Th className="text-right">전체 작품</Th>
                <Th className="text-right">1단계</Th><Th className="text-right">2단계</Th><Th className="text-right">3단계</Th>
                <Th className="text-right">고도화 목표</Th><Th className="text-right">신청</Th><Th className="text-right">승인</Th>
              </tr>
            </thead>
            <tbody>
              {board.map((g: any) => {
                const expanded = openSil === g.sil;
                return (
                  <Fragment key={g.sil}>
                    <tr
                      className="cursor-pointer border-t border-border hover:bg-muted/40"
                      onClick={() => setOpenSil(expanded ? null : g.sil)}
                    >
                      <Td className="w-8">{expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</Td>
                      <Td className="font-bold">{g.sil}{g.isDept && <span className="ml-1.5 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">부서</span>}</Td>
                      <Td className="text-right tabular-nums">{g.total}</Td>
                      <Td className="text-right tabular-nums text-muted-foreground">{g.stage1}</Td>
                      <Td className="text-right tabular-nums text-amber-600 font-semibold">{g.stage2}</Td>
                      <Td className="text-right tabular-nums text-emerald-600 font-semibold">{g.stage3}</Td>
                      <Td className="text-right tabular-nums">{g.goal}</Td>
                      <Td className="text-right tabular-nums font-bold text-primary">{g.requested}</Td>
                      <Td className="text-right tabular-nums font-bold text-emerald-600">{g.approved}</Td>
                    </tr>
                    {expanded && g.teams.map((t: any) => (
                      <tr key={g.sil + t.team} className="cursor-pointer border-t border-border/60 bg-muted/20 text-[13px] hover:bg-muted/40" onClick={() => setTeamSel(t.team)}>
                        <Td></Td>
                        <Td className="pl-6 text-foreground/80">└ {t.team}</Td>
                        <Td className="text-right tabular-nums">{t.total}</Td>
                        <Td className="text-right tabular-nums text-muted-foreground">{t.stage1}</Td>
                        <Td className="text-right tabular-nums text-amber-600">{t.stage2}</Td>
                        <Td className="text-right tabular-nums text-emerald-600">{t.stage3}</Td>
                        <Td className="text-right text-muted-foreground">—</Td>
                        <Td className="text-right tabular-nums text-primary">{t.requested}</Td>
                        <Td className="text-right tabular-nums text-emerald-600">{t.approved}</Td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
              {board.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-sm text-muted-foreground">데이터가 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[12px] text-muted-foreground">실을 누르면 팀별 현황이, 팀을 누르면 작품 목록이 펼쳐집니다.</p>
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

      {/* 새 작품 등록 */}
      <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>새로운 작품 등록</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="작품명" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Textarea placeholder="작품 설명" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
            <Input placeholder="사용 AI · 기술 스택 (선택)" value={techStack} onChange={(e) => setTechStack(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRegisterOpen(false)}>취소</Button>
            <Button disabled={!title.trim() || !description.trim() || registerMut.isPending} onClick={() => registerMut.mutate()}>등록</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MyWorkRow({ title, badge, stage, request, onRequest, pending }: {
  title: string; badge: string; stage: number | null; request: any; onRequest: () => void; pending: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">{badge}</span>
          {stage && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STAGE_LABEL[stage].tone}`}>{STAGE_LABEL[stage].label}</span>}
        </div>
        <div className="mt-1 text-[16px] font-black text-foreground">{title}</div>
      </div>
      {request ? (
        <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-bold ${STATUS_LABEL[request.status].tone}`}>
          <CheckCircle2 className="h-4 w-4" /> {STATUS_LABEL[request.status].label}
        </span>
      ) : (
        <Button onClick={onRequest} disabled={pending}>
          <Send className="mr-1.5 h-4 w-4" /> 고도화 신청
        </Button>
      )}
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
