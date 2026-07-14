import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { listSubmissions } from "@/lib/submissions.functions";
import { listMyEvaluations } from "@/lib/evaluations.functions";
import { SubmissionCard } from "@/components/SubmissionCard";
import { AlertCircle, ClipboardList, CheckCircle2, Clock } from "lucide-react";
import { isJudgingOpen, JUDGING_PERIOD_LABEL, SCORE_RULE_LABEL } from "@/lib/judging";

export const Route = createFileRoute("/_authenticated/judge")({
  component: JudgePage,
});

function JudgePage() {
  const [role, setRole] = useState<string>("");
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      setRole((data?.[0] as any)?.role ?? "participant");
    })();
  }, []);

  const listFn = useServerFn(listSubmissions);
  const myEvalFn = useServerFn(listMyEvaluations);
  const { data: subs = [] } = useQuery({ queryKey: ["submissions"], queryFn: () => listFn() });
  const { data: myEvals = [] } = useQuery({ queryKey: ["myEvals"], queryFn: () => myEvalFn() });

  const open = isJudgingOpen();

  // 내가 평가한 작품 id 집합
  const evaluatedIds = useMemo(() => new Set(myEvals.map((e: any) => e.submission_id)), [myEvals]);
  const total = subs.length;
  const done = subs.filter((s: any) => evaluatedIds.has(s.id)).length;
  const remaining = total - done;

  // 갤러리와 동일하게 좋아요 많은 순 정렬 + 순위 부여
  const ranked = useMemo(() => {
    return [...subs]
      .sort((a: any, b: any) => (b.likeCount ?? 0) - (a.likeCount ?? 0) || (a.createdAt < b.createdAt ? 1 : -1))
      .map((s: any, i: number) => ({ ...s, rank: (s.likeCount ?? 0) > 0 ? i + 1 : undefined }));
  }, [subs]);
  const pending = ranked.filter((s: any) => !evaluatedIds.has(s.id));   // 아직 평가 안 함
  const completed = ranked.filter((s: any) => evaluatedIds.has(s.id));  // 평가완료

  if (role && role !== "judge" && role !== "admin") {
    return (
      <div className="mx-auto max-w-2xl p-12 text-center">
        <AlertCircle className="mx-auto h-10 w-10 text-destructive" />
        <div className="mt-4 text-lg font-semibold">심사위원 전용 페이지입니다.</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="text-[11px] font-semibold uppercase tracking-widest text-accent">JUDGING</div>
      <h1 className="mt-2 text-3xl font-black tracking-tight">심사위원 평가</h1>
      <p className="mt-2 text-[15px] text-muted-foreground">
        평가 기간: <b className="text-foreground">{JUDGING_PERIOD_LABEL}</b>
      </p>

      {/* 진행 상황 요약 */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={ClipboardList} tone="primary" label="평가 대상 작품" value={total} unit="개" />
        <StatCard icon={CheckCircle2} tone="emerald" label="평가 완료" value={done} unit="개" />
        <StatCard icon={Clock} tone="amber" label="남은 평가" value={remaining} unit="개" />
      </div>

      {!open && (
        <div className="mt-6 flex items-center gap-3 rounded-2xl border-2 border-amber-400/60 bg-amber-50 px-6 py-5">
          <AlertCircle className="h-7 w-7 shrink-0 text-amber-600" />
          <div>
            <div className="text-lg font-black text-amber-800">지금은 평가 기간이 아닙니다!</div>
            <div className="mt-0.5 text-sm font-semibold text-amber-700">
              평가 가능 기간: {JUDGING_PERIOD_LABEL}
            </div>
          </div>
        </div>
      )}

      {/* 채점 규칙 */}
      <div className="mt-6 rounded-2xl border border-primary/20 bg-primary/5 p-6">
        <div className="text-[17px] font-black text-primary">채점 규칙</div>
        <div className="mt-2 text-[15px] leading-relaxed text-foreground/85">{SCORE_RULE_LABEL}</div>
        <div className="mt-2 text-[13px] text-muted-foreground">
          다른 심사위원의 점수는 서로 볼 수 없으며, 본인 평가만 확인·수정할 수 있습니다.
        </div>
      </div>

      {subs.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          아직 제출된 작품이 없습니다.
        </div>
      ) : (
        <>
          {/* 평가할 작품 (아직 평가 안 한 것) */}
          <div className="mt-10 flex items-end justify-between">
            <h2 className="text-xl font-black tracking-tight">
              평가할 작품 <span className="text-primary">({pending.length})</span>
            </h2>
            <div className="text-sm text-muted-foreground">카드를 누르면 상세 페이지에서 평가할 수 있어요</div>
          </div>
          {pending.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-emerald-300 bg-emerald-50/50 p-10 text-center text-sm font-semibold text-emerald-700">
              🎉 모든 작품 평가를 완료했습니다!
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
              {pending.map((s: any) => (
                <SubmissionCard key={s.id} {...s} />
              ))}
            </div>
          )}

          {/* 평가완료 섹션 (맨 아래, 구분선) */}
          {completed.length > 0 && (
            <>
              <div className="mt-14 flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-4 py-1.5 text-[13px] font-black text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" /> 평가완료 ({completed.length})
                </div>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
                {completed.map((s: any) => (
                  <div key={s.id} className="relative opacity-90">
                    <SubmissionCard {...s} />
                    <div className="pointer-events-none absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1 text-[11px] font-black text-white shadow">
                      <CheckCircle2 className="h-3.5 w-3.5" /> 완료
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, tone, label, value, unit }: {
  icon: any; tone: "primary" | "emerald" | "amber"; label: string; value: number; unit: string;
}) {
  const tones: Record<string, string> = {
    primary: "border-primary/20 bg-primary/5 text-primary",
    emerald: "border-emerald-500/20 bg-emerald-500/5 text-emerald-600",
    amber: "border-amber-500/20 bg-amber-500/5 text-amber-600",
  };
  return (
    <div className={`rounded-2xl border p-5 ${tones[tone]}`}>
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5" />
        <span className="text-[14px] font-bold">{label}</span>
      </div>
      <div className="mt-2 text-4xl font-black text-foreground">
        {value}<span className="ml-1 text-lg font-bold text-muted-foreground">{unit}</span>
      </div>
    </div>
  );
}
