import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminGetCouncil } from "@/lib/council.functions";
import { formatDate } from "@/lib/utils";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Star, Sparkles, Quote, Target, Heart as HeartIcon, Maximize2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/council")({ component: AdminCouncil });

function AdminCouncil() {
  const fn = useServerFn(adminGetCouncil);
  const { data } = useQuery({ queryKey: ["admin", "council"], queryFn: () => fn() });
  const picks = data?.picks ?? [];
  const members = data?.members ?? [];
  const [modal, setModal] = useState<any | null>(null);

  return (
    <div className="space-y-12">
      {/* 혁신과제 선정 내역 — 썸네일 카드 */}
      <section>
        <div className="flex items-center gap-2">
          <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
          <h2 className="text-lg font-black tracking-tight">혁신과제 선정 내역</h2>
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[13px] font-bold text-primary">총 {picks.length}건</span>
        </div>
        <p className="mt-1 text-[13px] text-muted-foreground">썸네일을 누르면 작품 설명이 크게 보입니다. 누가·무엇을·왜 선정했는지, 누가 올린 작품인지 확인하세요.</p>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          {picks.map((p: any, i: number) => (
            <div key={i} className="overflow-hidden rounded-2xl border border-border bg-card">
              <button onClick={() => setModal(p)} className="group relative block w-full overflow-hidden bg-muted">
                <div className="aspect-video w-full overflow-hidden">
                  {p.thumbnailUrl
                    ? <img src={p.thumbnailUrl} alt={p.submissionTitle} className="h-full w-full object-cover transition group-hover:scale-[1.03]" />
                    : <div className="grid h-full w-full place-items-center bg-hyundai-gradient text-sm text-white/70">이미지 없음</div>}
                </div>
                <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur">
                  <Maximize2 className="h-3 w-3" /> 크게 보기
                </span>
              </button>
              <div className="p-4">
                <div className="text-[16px] font-black leading-snug text-foreground">{p.submissionTitle}</div>
                <div className="mt-1 text-[13px] text-muted-foreground">
                  제출: <b className="text-foreground/80">{p.authorTeam} {p.authorName}</b>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2.5 py-1 text-[12px] font-black text-amber-600">
                    <Star className="h-3.5 w-3.5 fill-amber-400" /> {p.councilName} 위원 선정
                  </span>
                  <span className="text-[11px] text-muted-foreground">{formatDate(p.createdAt)}</span>
                </div>
                <div className="mt-3 rounded-xl border-l-4 border-primary/60 bg-primary/[0.04] px-4 py-3">
                  <div className="flex items-center gap-1 text-[11px] font-black uppercase tracking-wider text-primary">
                    <Quote className="h-3.5 w-3.5" /> 선정 이유
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-[14px] leading-relaxed text-foreground/90">{p.reason || "—"}</p>
                </div>
              </div>
            </div>
          ))}
          {picks.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground md:col-span-2">
              아직 선정 내역이 없습니다.
            </div>
          )}
        </div>
      </section>

      {/* AI 협의체 — 명·미션·슬로건·바램 (가독성 카드) */}
      <section>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-black tracking-tight">AI 협의체 — 명 · 슬로건 · 미션 · 바램</h2>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-2">
          {members.map((m: any) => (
            <div key={m.empNo} className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
              {/* 헤더 */}
              <div className="flex items-center justify-between gap-2 bg-gradient-to-r from-primary/10 to-accent/10 px-6 py-4">
                <div>
                  <div className="text-[18px] font-black text-foreground">{m.name}</div>
                  <div className="text-[12px] text-muted-foreground">{m.scope}</div>
                </div>
                <span className="shrink-0 rounded-full bg-amber-400/15 px-3 py-1 text-[12px] font-black text-amber-600">선정 {m.pickCount}건</span>
              </div>
              <div className="space-y-4 px-6 py-5">
                {/* 협의체 명 + 슬로건 (크게) */}
                <div className="text-center">
                  <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">협의체 명</div>
                  <div className="mt-1 text-[22px] font-black tracking-tight text-primary">{m.councilName || <span className="text-muted-foreground/50">미작성</span>}</div>
                  {m.slogan && (
                    <div className="mt-2 inline-block rounded-full bg-primary/10 px-4 py-1.5 text-[15px] font-bold italic text-foreground/85">
                      “{m.slogan}”
                    </div>
                  )}
                </div>
                {/* 미션 */}
                <div className="rounded-xl bg-muted/40 p-4">
                  <div className="flex items-center gap-1.5 text-[12px] font-black text-foreground"><Target className="h-4 w-4 text-primary" /> 미션</div>
                  <p className="mt-1 whitespace-pre-wrap text-[14px] leading-relaxed text-foreground/85">{m.mission || <span className="text-muted-foreground/50">미작성</span>}</p>
                </div>
                {/* 바램 */}
                <div className="rounded-xl bg-muted/40 p-4">
                  <div className="flex items-center gap-1.5 text-[12px] font-black text-foreground"><HeartIcon className="h-4 w-4 text-rose-500" /> 바램 · 방향성</div>
                  <p className="mt-1 whitespace-pre-wrap text-[14px] leading-relaxed text-foreground/85">{m.hope || <span className="text-muted-foreground/50">미작성</span>}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 작품 상세 팝업 */}
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
                <h3 className="text-2xl font-black tracking-tight text-foreground">{modal.submissionTitle}</h3>
                <div className="mt-1 text-[14px] text-muted-foreground">제출: {modal.authorTeam} {modal.authorName}</div>
                <div className="mt-3 rounded-xl border-l-4 border-amber-400 bg-amber-50/60 px-4 py-3">
                  <div className="text-[11px] font-black uppercase tracking-wider text-amber-600">{modal.councilName} 위원의 선정 이유</div>
                  <p className="mt-1 whitespace-pre-wrap text-[14px] leading-relaxed text-foreground/90">{modal.reason || "—"}</p>
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
      <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{label}</div>
      <p className="mt-0.5 whitespace-pre-wrap text-[14px] leading-relaxed text-foreground/90">{children || "—"}</p>
    </div>
  );
}
