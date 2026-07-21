import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getLiveState, submitLiveEval } from "@/lib/live.functions";
import { getLocalUser } from "@/integrations/supabase/demo";
import { toast } from "sonner";
import { CheckCircle2, Loader2 } from "lucide-react";

export const Route = createFileRoute("/live")({ component: LivePage });

const CRITERIA = [
  { key: "presentation", label: "발표", max: 20 },
  { key: "innovation", label: "혁신성", max: 40 },
  { key: "completeness", label: "완성도", max: 20 },
  { key: "utilization", label: "활용도", max: 20 },
] as const;

type Scores = { presentation: number; innovation: number; completeness: number; utilization: number };
const ZERO: Scores = { presentation: 0, innovation: 0, completeness: 0, utilization: 0 };

function LivePage() {
  const nav = useNavigate();
  useEffect(() => {
    const u = getLocalUser();
    if (!u) nav({ to: "/auth", replace: true });
  }, [nav]);

  const stateFn = useServerFn(getLiveState);
  const submitFn = useServerFn(submitLiveEval);
  const { data } = useQuery({ queryKey: ["liveState"], queryFn: () => stateFn(), refetchInterval: 1500 });

  const [scores, setScores] = useState<Scores>(ZERO);
  const [saved, setSaved] = useState(false);
  const curWorkId = useRef<string | null>(null);

  // 발표작이 바뀌면 폼 초기화 (내 기존 평가가 있으면 반영)
  useEffect(() => {
    const w = data?.work;
    if (data?.phase === "presenting" && w && curWorkId.current !== w.id) {
      curWorkId.current = w.id;
      if (data.myEval) { setScores(data.myEval as Scores); setSaved(true); }
      else { setScores(ZERO); setSaved(false); }
    }
    if (data?.phase !== "presenting") curWorkId.current = null;
  }, [data]);

  const submitMut = useMutation({
    mutationFn: () => submitFn({ data: { workId: data!.work!.id, ...scores } }),
    onSuccess: () => { setSaved(true); toast.success("평가가 제출되었습니다."); },
    onError: (e: any) => toast.error(e.message),
  });

  const phase = data?.phase ?? "idle";
  const work = data?.work;
  const raw = scores.presentation + scores.innovation + scores.completeness + scores.utilization;

  if (phase === "idle" || !work) {
    return (
      <Center>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <div className="mt-4 text-xl font-black text-foreground">대기 중입니다</div>
        <div className="mt-1 text-[15px] text-muted-foreground">진행자가 발표를 시작하면 이 화면에 나타납니다.</div>
      </Center>
    );
  }

  if (phase === "intro") {
    return (
      <div className="grid min-h-[calc(100vh-57px)] place-items-center bg-hyundai-gradient px-6 text-center">
        <div>
          <div className="text-[15px] font-bold uppercase tracking-widest text-white/70">NEXT PRESENTATION</div>
          <div className="mt-4 text-2xl font-semibold text-white/90">잠시 후</div>
          <div className="mt-2 text-5xl font-black text-white md:text-6xl">{work.name} 님</div>
          <div className="mt-4 text-2xl font-semibold text-white/90">의 발표가 시작되겠습니다</div>
          <div className="mt-6 text-[15px] text-white/70">{work.team} · {work.position}</div>
        </div>
      </div>
    );
  }

  // presenting
  return (
    <div className="mx-auto max-w-5xl px-5 py-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* 작품 정보 */}
        <div>
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="aspect-video w-full overflow-hidden bg-hyundai-gradient">
              {work.thumbnail
                ? <img src={work.thumbnail} alt={work.title} className="h-full w-full object-cover" />
                : <div className="grid h-full w-full place-items-center text-white/70">{work.name} 님의 작품</div>}
            </div>
            <div className="p-5">
              <div className="text-[12px] font-bold uppercase tracking-widest text-accent">발표 중</div>
              <h1 className="mt-1 text-2xl font-black tracking-tight">{work.title}</h1>
              <div className="mt-1 text-sm text-muted-foreground">{work.team} · {work.name} {work.position}</div>
              <Section title="기술 구현">{work.tech}</Section>
              <Section title="작품 설명">{work.content}</Section>
            </div>
          </div>
        </div>

        {/* 평가 */}
        <div className="lg:sticky lg:top-20 h-fit">
          <div className="rounded-2xl border-2 border-primary/25 bg-card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black">현장 발표 평가</h2>
              {saved && <span className="inline-flex items-center gap-1 text-[13px] font-bold text-emerald-600"><CheckCircle2 className="h-4 w-4" /> 제출됨</span>}
            </div>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">발표평가는 최종 점수의 30%에 반영됩니다.</p>

            <div className="mt-4 space-y-4">
              {CRITERIA.map((c) => (
                <ScoreRow
                  key={c.key}
                  label={c.label}
                  max={c.max}
                  value={scores[c.key]}
                  onChange={(v) => { setScores((s) => ({ ...s, [c.key]: v })); setSaved(false); }}
                />
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between rounded-xl bg-muted/60 px-4 py-3">
              <span className="text-[14px] font-bold text-foreground">합계</span>
              <span className="text-2xl font-black text-primary tabular-nums">{raw} <span className="text-base text-muted-foreground">/ 100</span></span>
            </div>

            <button
              onClick={() => submitMut.mutate()}
              disabled={submitMut.isPending}
              className="mt-4 w-full rounded-xl bg-primary py-3 text-[15px] font-black text-white transition hover:brightness-110 disabled:opacity-60"
            >
              {submitMut.isPending ? "제출 중…" : saved ? "평가 수정 저장" : "평가 제출"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScoreRow({ label, max, value, onChange }: { label: string; max: number; value: number; onChange: (v: number) => void }) {
  const clamp = (n: number) => Math.max(0, Math.min(max, Math.round(n || 0)));
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[15px] font-bold text-foreground">{label} <span className="text-[12px] font-normal text-muted-foreground">/ {max}</span></span>
        <input
          type="number" min={0} max={max} value={value}
          onChange={(e) => onChange(clamp(Number(e.target.value)))}
          className="w-16 rounded-lg border border-border bg-background px-2 py-1 text-right text-[15px] font-bold tabular-nums outline-none focus:border-primary"
        />
      </div>
      <input
        type="range" min={0} max={max} value={value}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
        className="w-full accent-[var(--primary)]"
      />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <div className="text-[12px] font-bold uppercase tracking-widest text-muted-foreground">{title}</div>
      <p className="mt-1 whitespace-pre-wrap text-[14.5px] leading-relaxed text-foreground/90">{children}</p>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-[calc(100vh-57px)] place-items-center px-6 text-center"><div>{children}</div></div>;
}
