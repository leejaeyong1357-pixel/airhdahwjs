import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getLocalUser } from "@/integrations/supabase/demo";
import { listJudgeSubmissions } from "@/lib/submissions.functions";
import { listMyEvaluations } from "@/lib/evaluations.functions";
import { SubmissionCard } from "@/components/SubmissionCard";
import { AlertCircle, ClipboardList, CheckCircle2, Clock, ChevronDown, Building2, Filter, X, Scale, ShieldCheck, LifeBuoy } from "lucide-react";
import { isJudgingOpen, JUDGING_PERIOD_LABEL, SCORE_RULE_LABEL } from "@/lib/judging";
import { ORG, silOfTeam, normalizeTeam } from "@/lib/org";

export const Route = createFileRoute("/_authenticated/judge")({
  component: JudgePage,
});

function JudgePage() {
  const localUser = getLocalUser();
  const roles = localUser?.roles ?? [];
  const isAdmin = roles.includes("admin");
  const isJudge = roles.includes("judge");

  // 평가 제외(밴) + 공정성(자기 팀/실) 제외는 서버(로스터 기준)에서 처리된다.
  const listFn = useServerFn(listJudgeSubmissions);
  const myEvalFn = useServerFn(listMyEvaluations);
  const { data: subs = [] } = useQuery({ queryKey: ["judgeSubmissions"], queryFn: () => listFn() });
  const { data: myEvals = [] } = useQuery({ queryKey: ["myEvals"], queryFn: () => myEvalFn() });

  const open = isJudgingOpen();

  // 선택된 팀 필터
  const [selectedTeams, setSelectedTeams] = useState<Set<string>>(new Set());
  const toggleTeam = (team: string) =>
    setSelectedTeams((prev) => {
      const next = new Set(prev);
      next.has(team) ? next.delete(team) : next.add(team);
      return next;
    });

  // 내가 평가한 작품 id 집합
  const evaluatedIds = useMemo(() => new Set(myEvals.map((e: any) => e.submission_id)), [myEvals]);
  const total = subs.length;
  const done = subs.filter((s: any) => evaluatedIds.has(s.id)).length;
  const remaining = total - done;

  // 갤러리와 동일하게 좋아요 많은 순 정렬 + 순위 부여 (순위는 전체 기준)
  const ranked = useMemo(() => {
    return [...subs]
      .sort((a: any, b: any) => (b.likeCount ?? 0) - (a.likeCount ?? 0) || (a.createdAt < b.createdAt ? 1 : -1))
      .map((s: any, i: number) => ({ ...s, rank: (s.likeCount ?? 0) > 0 ? i + 1 : undefined }));
  }, [subs]);

  // 팀 필터 적용
  const visible = useMemo(() => {
    if (selectedTeams.size === 0) return ranked;
    return ranked.filter((s: any) => selectedTeams.has(normalizeTeam(s.author?.team) || "미지정"));
  }, [ranked, selectedTeams]);

  const pending = visible.filter((s: any) => !evaluatedIds.has(s.id));   // 아직 평가 안 함
  const completed = visible.filter((s: any) => evaluatedIds.has(s.id));  // 평가완료

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

      {/* 평가 원칙 */}
      <EvalPrinciples />

      {/* 진행 상황 요약 */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={ClipboardList} tone="primary" label="평가 대상 작품" value={total} unit="개" />
        <StatCard icon={CheckCircle2} tone="emerald" label="평가 완료" value={done} unit="개" />
        <StatCard icon={Clock} tone="amber" label="남은 평가" value={remaining} unit="개" />
      </div>

      {/* 실별 / 팀별 접수 현황 + 팀 필터 */}
      <OrgSubmissionPanel subs={subs} selectedTeams={selectedTeams} onToggleTeam={toggleTeam} onClear={() => setSelectedTeams(new Set())} />

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
          {/* 활성 필터 표시 */}
          {selectedTeams.size > 0 && (
            <div className="mt-8 flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
              <Filter className="h-4 w-4 text-primary" />
              <span className="text-[13px] font-bold text-primary">선택한 팀만 보기</span>
              {[...selectedTeams].map((t) => (
                <button
                  key={t}
                  onClick={() => toggleTeam(t)}
                  className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[12px] font-bold text-white"
                >
                  {t} <X className="h-3 w-3" />
                </button>
              ))}
              <button onClick={() => setSelectedTeams(new Set())} className="ml-1 text-[12px] font-semibold text-muted-foreground underline">
                전체 해제
              </button>
            </div>
          )}

          {/* 평가할 작품 (아직 평가 안 한 것) */}
          <div className="mt-10 flex items-end justify-between">
            <h2 className="text-xl font-black tracking-tight">
              평가할 작품 <span className="text-primary">({pending.length})</span>
            </h2>
            <div className="text-sm text-muted-foreground">카드를 누르면 상세 페이지에서 평가할 수 있어요</div>
          </div>
          {pending.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-emerald-300 bg-emerald-50/50 p-10 text-center text-sm font-semibold text-emerald-700">
              {selectedTeams.size > 0 ? "선택한 팀에 평가할 작품이 없습니다." : "🎉 모든 작품 평가를 완료했습니다!"}
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

/** 실별 → 팀별 접수 건수. 실을 펼치고(다중 가능) 팀을 누르면 아래 목록이 그 팀들만 필터된다. */
function OrgSubmissionPanel({
  subs, selectedTeams, onToggleTeam, onClear,
}: {
  subs: any[];
  selectedTeams: Set<string>;
  onToggleTeam: (team: string) => void;
  onClear: () => void;
}) {
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
      const silSelf = teamCounts.get(g.name) ?? 0;
      if (silSelf > 0) teams.push({ name: g.name, count: silSelf });
      const total = teams.reduce((a, b) => a + b.count, 0);
      return { name: g.name, isDept: g.isDept, teams, total };
    });
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
  // 다중 펼침 — 기본은 모두 펼침. 사용자가 접은 실만 기억한다.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleSil = (name: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });

  return (
    <div className="mt-6 rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Building2 className="h-5 w-5 text-primary" />
        <h2 className="text-[17px] font-black tracking-tight">실별 · 팀별 접수 현황</h2>
        <span className="ml-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[13px] font-bold text-primary">
          총 {grandTotal}건
        </span>
        {selectedTeams.size > 0 && (
          <button onClick={onClear} className="ml-auto inline-flex items-center gap-1 text-[13px] font-semibold text-muted-foreground underline">
            필터 초기화
          </button>
        )}
      </div>
      <p className="mt-1 text-[13px] text-muted-foreground">
        팀을 누르면 아래 목록이 그 팀 작품만 보입니다. 여러 팀을 선택할 수 있어요. (4실 · 직속 · 15개 팀)
      </p>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {groups.map((g) => {
          const expanded = !collapsed.has(g.name);
          return (
            <div key={g.name} className="overflow-hidden rounded-xl border border-border">
              <button
                type="button"
                onClick={() => toggleSil(g.name)}
                className="flex w-full items-center justify-between gap-3 bg-muted/40 px-4 py-3 text-left transition-colors hover:bg-muted/70"
              >
                <span className="flex items-center gap-2">
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? "" : "-rotate-90"}`} />
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
                    g.teams.map((t) => {
                      const active = selectedTeams.has(t.name);
                      return (
                        <button
                          key={t.name}
                          type="button"
                          onClick={() => onToggleTeam(t.name)}
                          className={`flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors ${
                            active ? "bg-primary/10" : "hover:bg-muted/50"
                          }`}
                        >
                          <span className={`flex items-center gap-2 text-[14px] ${active ? "font-bold text-primary" : "text-foreground/85"}`}>
                            <span className={`grid h-4 w-4 shrink-0 place-items-center rounded border text-[10px] font-black text-white ${active ? "border-primary bg-primary" : "border-muted-foreground/40"}`}>
                              {active ? "✓" : ""}
                            </span>
                            {t.name}
                          </span>
                          <span className={`text-[14px] font-bold ${t.count > 0 ? "text-foreground" : "text-muted-foreground/50"}`}>
                            {t.count}건
                          </span>
                        </button>
                      );
                    })
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

function EvalPrinciples() {
  return (
    <div className="mt-6 overflow-hidden rounded-2xl border-2 border-primary/25 bg-gradient-to-br from-primary/5 to-transparent">
      <div className="flex items-center gap-2 border-b border-primary/15 bg-primary/10 px-6 py-3.5">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <h2 className="text-[17px] font-black tracking-tight text-primary">평가 원칙 (꼭 읽어주세요)</h2>
      </div>
      <ol className="space-y-4 px-6 py-5">
        <Principle n={1} icon={Scale} title="공정성">
          평가의 공정성을 위해, 팀장님께서는 소속 <b>팀원의 작품</b>을, 실장님께서는 소속 <b>실의 작품</b>을 평가하실 수 없습니다.
          해당 작품은 평가 목록에 표시되지 않으니 양해 부탁드립니다.
        </Principle>
        <Principle n={2} icon={ShieldCheck} title="평가의 질">
          보다 충실한 평가를 위해, 기술 검증 등 <b>참여에 의의를 둔 작품</b>은 평가 대상에서 제외하였습니다.
          <span className="text-muted-foreground"> (예: 미래성장팀 이재용 매니저 「기술 검증」)</span>
        </Principle>
        <Principle n={3} icon={LifeBuoy} title="작품 열람 안내">
          제출 작품은 웹사이트·영상·프로그램·파이썬 등 형태가 다양합니다. 평가 중 작품이 열리지 않을 경우
          <b> ICT팀 헬프데스크(소종진 매니저 · 류태곤 매니저)</b>로 협조 요청 부탁드립니다.
          열람이 어려우실 때에는 <b>작품 설명 내용</b>을 참고하여 평가해 주시면 감사하겠습니다.
        </Principle>
      </ol>
      <div className="border-t border-primary/15 bg-primary/[0.04] px-6 py-4 text-[13.5px] leading-relaxed text-foreground/80">
        예상보다 많은 구성원께서 관심을 가져주신 덕분에 평가하실 작품이 많습니다. 하루라는 짧은 시간 동안
        평가해 주시느라 노고가 크시겠지만, 소중한 평가에 진심으로 감사드립니다. 🙏
      </div>
    </div>
  );
}

function Principle({ n, icon: Icon, title, children }: {
  n: number; icon: any; title: string; children: ReactNode;
}) {
  return (
    <li className="flex gap-3.5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-[15px] font-black text-white">{n}</span>
      <div>
        <div className="flex items-center gap-1.5 text-[15.5px] font-black text-foreground">
          <Icon className="h-4 w-4 text-primary" /> {title}
        </div>
        <p className="mt-1 text-[14.5px] leading-relaxed text-foreground/85">{children}</p>
      </div>
    </li>
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
