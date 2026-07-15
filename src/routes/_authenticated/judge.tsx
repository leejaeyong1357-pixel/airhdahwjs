import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getLocalUser } from "@/integrations/supabase/demo";
import { listSubmissions } from "@/lib/submissions.functions";
import { listMyEvaluations } from "@/lib/evaluations.functions";
import { SubmissionCard } from "@/components/SubmissionCard";
import { AlertCircle, ClipboardList, CheckCircle2, Clock, ChevronDown, Building2 } from "lucide-react";
import { isJudgingOpen, JUDGING_PERIOD_LABEL, SCORE_RULE_LABEL } from "@/lib/judging";
import { ORG, silOfTeam, normalizeTeam, HIDDEN_FROM_JUDGES_EMP_NOS } from "@/lib/org";

export const Route = createFileRoute("/_authenticated/judge")({
  component: JudgePage,
});

function JudgePage() {
  const localUser = getLocalUser();
  const roles = localUser?.roles ?? [];
  const isAdmin = roles.includes("admin");
  const isJudge = roles.includes("judge");

  const listFn = useServerFn(listSubmissions);
  const myEvalFn = useServerFn(listMyEvaluations);
  const { data: rawSubs = [] } = useQuery({ queryKey: ["submissions"], queryFn: () => listFn() });
  const { data: myEvals = [] } = useQuery({ queryKey: ["myEvals"], queryFn: () => myEvalFn() });

  const open = isJudgingOpen();

  // 직급 M1 인원(팀장 평가 대상 제외)은 평가자에게 숨긴다. 관리자는 전부 볼 수 있다.
  const hidden = new Set(HIDDEN_FROM_JUDGES_EMP_NOS);
  const subs = useMemo(
    () => (isAdmin ? rawSubs : rawSubs.filter((s: any) => !hidden.has(s.authorEmpNo))),
    [rawSubs, isAdmin],
  );

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

  if (localUser && !isJudge && !isAdmin) {
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

      {/* 실별 / 팀별 접수 현황 */}
      <OrgSubmissionPanel subs={subs} />

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

/** 실별 → 팀별 접수 건수. 버튼으로 실을 펼치면 팀별 건수가 보인다. */
function OrgSubmissionPanel({ subs }: { subs: any[] }) {
  // 팀별 접수 건수 집계
  const teamCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of subs) {
      const team = normalizeTeam(s.author?.team) || "미지정";
      m.set(team, (m.get(team) ?? 0) + 1);
    }
    return m;
  }, [subs]);

  // 실별 합계 + 매핑되지 않은 팀은 "기타"로 모은다
  const groups = useMemo(() => {
    const rows = ORG.map((g) => {
      const teams = g.teams.map((t) => ({ name: t, count: teamCounts.get(t) ?? 0 }));
      // 실 이름 자체로 접수된 항목(실장/실 직속)도 합산해 보여준다
      const silSelf = teamCounts.get(g.name) ?? 0;
      if (silSelf > 0) teams.push({ name: `${g.name} 직속`, count: silSelf });
      const total = teams.reduce((a, b) => a + b.count, 0);
      return { name: g.name, isDept: g.isDept, teams, total };
    });
    // 조직도에 없는 팀 모으기
    const known = new Set<string>();
    for (const g of ORG) { g.teams.forEach((t) => known.add(t)); known.add(g.name); }
    const etcTeams: { name: string; count: number }[] = [];
    for (const [team, count] of teamCounts) {
      if (!known.has(team) && silOfTeam(team) === null) etcTeams.push({ name: team, count });
    }
    if (etcTeams.length) {
      etcTeams.sort((a, b) => b.count - a.count);
      rows.push({ name: "기타", isDept: true, teams: etcTeams, total: etcTeams.reduce((a, b) => a + b.count, 0) });
    }
    return rows;
  }, [teamCounts]);

  const grandTotal = subs.length;
  const [openSil, setOpenSil] = useState<string | null>(null);

  return (
    <div className="mt-6 rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center gap-2">
        <Building2 className="h-5 w-5 text-primary" />
        <h2 className="text-[17px] font-black tracking-tight">실별 · 팀별 접수 현황</h2>
        <span className="ml-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[13px] font-bold text-primary">
          총 {grandTotal}건
        </span>
      </div>
      <p className="mt-1 text-[13px] text-muted-foreground">
        실 이름을 누르면 팀별 접수 건수를 볼 수 있어요. (4실 · 직속 · 15개 팀)
      </p>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {groups.map((g) => {
          const expanded = openSil === g.name;
          return (
            <div key={g.name} className="overflow-hidden rounded-xl border border-border">
              <button
                type="button"
                onClick={() => setOpenSil(expanded ? null : g.name)}
                className="flex w-full items-center justify-between gap-3 bg-muted/40 px-4 py-3 text-left transition-colors hover:bg-muted/70"
              >
                <span className="flex items-center gap-2">
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
                  <span className="text-[15px] font-bold text-foreground">{g.name}</span>
                  {g.isDept && (
                    <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">부서</span>
                  )}
                </span>
                <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 text-[13px] font-black text-primary">
                  {g.total}건
                </span>
              </button>
              {expanded && (
                <div className="divide-y divide-border/70 border-t border-border">
                  {g.teams.length === 0 ? (
                    <div className="px-4 py-3 text-[13px] text-muted-foreground">소속 팀이 없습니다.</div>
                  ) : (
                    g.teams.map((t) => (
                      <div key={t.name} className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-[14px] text-foreground/85">{t.name}</span>
                        <span className={`text-[14px] font-bold ${t.count > 0 ? "text-foreground" : "text-muted-foreground/50"}`}>
                          {t.count}건
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
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
