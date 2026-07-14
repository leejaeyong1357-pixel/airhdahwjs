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

      {/* 작품 갤러리 — 카드를 누르면 작품 상세에서 평가 */}
      <div className="mt-8 flex items-end justify-between">
        <h2 className="text-xl font-black tracking-tight">
          작품 목록 <span className="text-primary">({total})</span>
        </h2>
        <div className="text-sm text-muted-foreground">카드를 누르면 상세 페이지에서 평가할 수 있어요</div>
      </div>

      {subs.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          아직 제출된 작품이 없습니다.
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
          {subs.map((s: any) => (
            <div key={s.id} className="relative">
              <SubmissionCard {...s} rank={undefined} />
              {evaluatedIds.has(s.id) && (
                <div className="pointer-events-none absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1 text-[11px] font-black text-white shadow">
                  <CheckCircle2 className="h-3.5 w-3.5" /> 평가완료
                </div>
              )}
            </div>
          ))}
        </div>
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
