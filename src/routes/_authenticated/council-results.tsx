import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCouncilResults } from "@/lib/council.functions";
import { getLocalUser } from "@/integrations/supabase/demo";
import { isCouncilResultViewer } from "@/lib/council";
import { formatDate } from "@/lib/utils";
import { AlertCircle, Lightbulb, Star } from "lucide-react";

export const Route = createFileRoute("/_authenticated/council-results")({ component: CouncilResults });

function CouncilResults() {
  const user = getLocalUser();
  const allowed = isCouncilResultViewer(user?.empNo) || user?.roles?.includes("admin");

  const fn = useServerFn(getCouncilResults);
  const { data } = useQuery({ queryKey: ["councilResults"], queryFn: () => fn(), enabled: !!allowed });
  const picks = data?.picks ?? [];

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
      <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-accent">
        <Lightbulb className="h-4 w-4" /> AI 협의체
      </div>
      <h1 className="mt-2 text-3xl font-black tracking-tight">핵심(혁신)과제 선정 결과</h1>
      <p className="mt-2 text-[15px] text-muted-foreground">
        이번 회차에 AI 협의체 위원들이 선정한 혁신과제 목록입니다.
        <span className="ml-2 font-semibold text-foreground">총 {picks.length}건</span>
      </p>

      <div className="mt-6 space-y-3">
        {picks.map((p: any, i: number) => (
          <div key={i} className="flex gap-4 rounded-2xl border border-border bg-card p-4">
            <div className="aspect-video w-36 shrink-0 overflow-hidden rounded-xl bg-muted">
              {p.thumbnailUrl
                ? <img src={p.thumbnailUrl} alt={p.submissionTitle} className="h-full w-full object-cover" />
                : <div className="grid h-full w-full place-items-center bg-hyundai-gradient text-[11px] text-white/70">No image</div>}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                <span className="text-[17px] font-black text-foreground">{p.submissionTitle}</span>
              </div>
              <div className="mt-1 text-[13px] text-muted-foreground">
                제출: <b className="text-foreground/80">{p.authorTeam} {p.authorName}</b>
                <span className="mx-2 text-border">|</span>
                선정: <b className="text-foreground/80">{p.councilName}</b> 위원
                <span className="mx-2 text-border">|</span>
                {formatDate(p.createdAt)}
              </div>
              {p.reason && (
                <div className="mt-2 rounded-lg bg-muted/50 px-3 py-2 text-[14px] leading-relaxed text-foreground/90">
                  <span className="font-bold text-primary">선정 이유 · </span>{p.reason}
                </div>
              )}
            </div>
          </div>
        ))}
        {picks.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
            아직 선정된 혁신과제가 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}
