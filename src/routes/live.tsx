import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getJudgeBoard, toggleStar } from "@/lib/live.functions";
import { getLocalUser } from "@/integrations/supabase/demo";
import { toast } from "sonner";
import { Star } from "lucide-react";

export const Route = createFileRoute("/live")({ component: LivePage });

function LivePage() {
  const nav = useNavigate();
  useEffect(() => {
    const u = getLocalUser();
    if (!u) nav({ to: "/auth", replace: true });
  }, [nav]);

  const boardFn = useServerFn(getJudgeBoard);
  const starFn = useServerFn(toggleStar);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["judgeBoard"], queryFn: () => boardFn(), refetchInterval: 1500 });

  const starMut = useMutation({
    mutationFn: (workId: string) => starFn({ data: { workId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["judgeBoard"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const works = data?.works ?? [];
  const used = data?.myStarCount ?? 0;
  const max = data?.maxStars ?? 5;
  const live = data?.live;
  const [openId, setOpenId] = useState<string | null>(null);

  // 발표 예고 오버레이
  if (live?.phase === "intro" && live.name) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-hyundai-gradient px-6 text-center">
        <div>
          <div className="text-[15px] font-bold uppercase tracking-widest text-white/70">NEXT PRESENTATION</div>
          <div className="mt-4 text-2xl font-semibold text-white/90">잠시 후</div>
          <div className="mt-2 text-5xl font-black text-white md:text-6xl">{live.name} 님</div>
          <div className="mt-4 text-2xl font-semibold text-white/90">의 발표가 시작되겠습니다</div>
          <div className="mt-6 text-[15px] text-white/70">{live.team} · {live.position}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
      {/* 별 사용 현황 (상단 고정) */}
      <div className="sticky top-[57px] z-30 -mx-4 mb-4 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[15px] font-black text-foreground">마음에 드는 작품에 별을 주세요</div>
            <div className="text-[13px] text-muted-foreground">최대 {max}개까지 · 작품당 1개</div>
          </div>
          <div className="flex items-center gap-1.5">
            {Array.from({ length: max }).map((_, i) => (
              <Star key={i} className={`h-6 w-6 ${i < used ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
            ))}
            <span className="ml-1 text-[15px] font-black text-foreground">{used}/{max}</span>
          </div>
        </div>
      </div>

      {live?.phase === "presenting" && live.name && (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-rose-500/10 px-4 py-2.5 text-[14px] font-bold text-rose-600">
          <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" /></span>
          지금 발표 중: {live.name} 님 ({live.team})
        </div>
      )}

      {/* 작품 갤러리 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {works.map((w: any) => {
          const isCur = live?.phase === "presenting" && live.workId === w.id;
          const open = openId === w.id;
          return (
            <div key={w.id} className={`overflow-hidden rounded-2xl border bg-card transition ${w.starred ? "border-amber-400 ring-2 ring-amber-300" : isCur ? "border-rose-400" : "border-border"}`}>
              <button onClick={() => setOpenId(open ? null : w.id)} className="block w-full text-left">
                <div className="relative aspect-video w-full overflow-hidden bg-hyundai-gradient">
                  {w.thumbnail
                    ? <img src={w.thumbnail} alt={w.title} className="h-full w-full object-cover" />
                    : <div className="grid h-full w-full place-items-center text-sm text-white/70">{w.name} 님의 작품</div>}
                  <div className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-bold text-white">{w.order}번</div>
                  {isCur && <div className="absolute right-2 top-2 rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-black text-white">발표 중</div>}
                </div>
                <div className="p-3.5">
                  <div className="text-[15px] font-black leading-snug text-foreground">{w.title}</div>
                  <div className="mt-0.5 text-[13px] text-muted-foreground">{w.team} · {w.name} {w.position}</div>
                  {open && (
                    <div className="mt-3 space-y-2 border-t border-border pt-3">
                      <Detail label="기술 구현">{w.tech}</Detail>
                      <Detail label="작품 설명">{w.content}</Detail>
                    </div>
                  )}
                  {!open && <div className="mt-1 text-[12px] text-primary">자세히 보기 ▾</div>}
                </div>
              </button>
              <div className="border-t border-border p-3">
                <button
                  onClick={() => starMut.mutate(w.id)}
                  disabled={starMut.isPending}
                  className={`flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[15px] font-black transition ${w.starred ? "bg-amber-400 text-white" : "border border-border bg-background text-foreground hover:bg-muted"}`}
                >
                  <Star className={`h-5 w-5 ${w.starred ? "fill-white" : "text-amber-400"}`} />
                  {w.starred ? "별 준 작품" : "별 주기"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{label}</div>
      <p className="mt-0.5 whitespace-pre-wrap text-[13.5px] leading-relaxed text-foreground/90">{children}</p>
    </div>
  );
}
