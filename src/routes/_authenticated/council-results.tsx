import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCouncilResults } from "@/lib/council.functions";
import { getLocalUser } from "@/integrations/supabase/demo";
import { isCouncilResultViewer } from "@/lib/council";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { AlertCircle, Star, Quote, Maximize2, Users, Lightbulb } from "lucide-react";

export const Route = createFileRoute("/_authenticated/council-results")({ component: CouncilResults });

function CouncilResults() {
  const user = getLocalUser();
  const allowed = isCouncilResultViewer(user?.empNo) || user?.roles?.includes("admin");
  const fn = useServerFn(getCouncilResults);
  const { data } = useQuery({ queryKey: ["councilResults"], queryFn: () => fn(), enabled: !!allowed });
  const picks = data?.picks ?? [];
  const members = data?.members ?? [];
  const [sel, setSel] = useState<string | null>(null);
  const [modal, setModal] = useState<any | null>(null);
  useEffect(() => { if (!sel && members.length) setSel(members[0].empNo); }, [members, sel]);

  const member = members.find((m: any) => m.empNo === sel) ?? null;
  const myPicks = useMemo(() => picks.filter((p: any) => p.councilEmpNo === sel), [picks, sel]);

  if (!allowed) {
    return (
      <div className="mx-auto max-w-2xl p-16 text-center">
        <AlertCircle className="mx-auto h-10 w-10 text-destructive" />
        <div className="mt-4 text-lg font-semibold">열람 권한이 없습니다.</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex items-center gap-2 text-[12px] font-black uppercase tracking-widest text-accent">
        <Lightbulb className="h-4 w-4" /> AX 협의체
      </div>
      <h1 className="mt-2 text-3xl font-black tracking-tight">핵심(혁신)과제 선정 결과</h1>

      {/* 구성원 이름 */}
      <div className="mt-6 flex items-center gap-2">
        <Users className="h-6 w-6 text-primary" />
        <h2 className="text-2xl font-black tracking-tight">AX 협의체 구성원</h2>
      </div>
      <p className="mt-1 text-[15px] text-muted-foreground">구성원 이름을 누르면 그분이 선정한 혁신과제가 나옵니다.</p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {members.map((m: any) => {
          const active = m.empNo === sel;
          return (
            <button
              key={m.empNo}
              onClick={() => setSel(m.empNo)}
              className={`rounded-2xl border-2 px-4 py-5 text-center transition ${active ? "border-primary bg-primary/5 shadow-md" : "border-border bg-card hover:border-primary/40"}`}
            >
              <div className={`text-[24px] font-black ${active ? "text-primary" : "text-foreground"}`}>{m.name}</div>
              <div className="mt-0.5 text-[12px] text-muted-foreground">{m.scope}</div>
              <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2.5 py-0.5 text-[12px] font-black text-amber-600">
                <Star className="h-3.5 w-3.5 fill-amber-400" /> 선정 {m.pickCount}건
              </div>
            </button>
          );
        })}
      </div>

      {member && (
        <section className="mt-8">
          <div className="rounded-2xl bg-gradient-to-r from-primary/10 to-accent/10 px-6 py-5">
            <div className="text-[13px] font-bold uppercase tracking-widest text-primary">AX 협의체 위원</div>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-3">
              <span className="text-[32px] font-black tracking-tight text-foreground">{member.name}</span>
              <span className="text-[16px] font-semibold text-muted-foreground">{member.scope}</span>
              <span className="text-[16px] font-black text-primary">— 선정한 혁신과제 {myPicks.length}건</span>
            </div>
          </div>

          <div className="mt-5 space-y-5">
            {myPicks.map((p: any, i: number) => (
              <div key={i} className="overflow-hidden rounded-2xl border border-border bg-card md:flex">
                <button onClick={() => setModal(p)} className="group relative block w-full shrink-0 overflow-hidden bg-muted md:w-72">
                  <div className="aspect-video w-full overflow-hidden">
                    {p.thumbnailUrl
                      ? <img src={p.thumbnailUrl} alt={p.submissionTitle} className="h-full w-full object-cover transition group-hover:scale-[1.03]" />
                      : <div className="grid h-full w-full place-items-center bg-hyundai-gradient text-sm text-white/70">이미지 없음</div>}
                  </div>
                  <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[12px] font-bold text-white backdrop-blur">
                    <Maximize2 className="h-3.5 w-3.5" /> 크게 보기
                  </span>
                </button>
                <div className="flex-1 p-6">
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/15 px-3 py-1 text-[14px] font-black text-amber-600">
                    <Star className="h-4 w-4 fill-amber-400" /> 혁신과제 {i + 1}
                  </div>
                  <h3 className="mt-2 text-[26px] font-black leading-tight tracking-tight text-foreground">{p.submissionTitle}</h3>
                  <div className="mt-1.5 text-[16px] font-semibold text-muted-foreground">제출: <span className="text-foreground">{p.authorTeam} · {p.authorName}</span></div>
                  <div className="mt-4 rounded-2xl border-l-[6px] border-primary bg-primary/[0.05] px-5 py-4">
                    <div className="flex items-center gap-2 text-[15px] font-black text-primary"><Quote className="h-5 w-5" /> 선정 이유</div>
                    <p className="mt-1.5 whitespace-pre-wrap text-[19px] font-medium leading-relaxed text-foreground">{p.reason || "—"}</p>
                  </div>
                </div>
              </div>
            ))}
            {myPicks.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border p-12 text-center text-[15px] text-muted-foreground">아직 선정한 혁신과제가 없습니다.</div>
            )}
          </div>
        </section>
      )}

      <Dialog open={!!modal} onOpenChange={(o) => !o && setModal(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0">
          {modal && (
            <div>
              <div className="w-full overflow-hidden rounded-t-lg bg-black">
                {modal.thumbnailUrl
                  ? <img src={modal.thumbnailUrl} alt={modal.submissionTitle} className="max-h-[60vh] w-full object-contain" />
                  : <div className="grid aspect-video w-full place-items-center bg-hyundai-gradient text-white/70">이미지 없음</div>}
              </div>
              <div className="p-6">
                <h3 className="text-[26px] font-black tracking-tight text-foreground">{modal.submissionTitle}</h3>
                <div className="mt-1 text-[15px] text-muted-foreground">제출: {modal.authorTeam} · {modal.authorName}</div>
                <div className="mt-4 rounded-2xl border-l-[6px] border-amber-400 bg-amber-50/60 px-5 py-4">
                  <div className="text-[14px] font-black text-amber-600">{modal.councilName} 위원의 선정 이유</div>
                  <p className="mt-1 whitespace-pre-wrap text-[18px] leading-relaxed text-foreground">{modal.reason || "—"}</p>
                </div>
                <div className="mt-5 space-y-4">
                  <Detail label="주요 기능">{modal.features}</Detail>
                  <Detail label="작품 설명">{modal.description}</Detail>
                  <Detail label="사용 AI · 기술 · 스택">{modal.techStack}</Detail>
                  <Detail label="기대 효과">{modal.expectedImpact}</Detail>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
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
