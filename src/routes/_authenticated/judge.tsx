import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { listSubmissions, getSubmission } from "@/lib/submissions.functions";
import { listMyEvaluations, submitEvaluation } from "@/lib/evaluations.functions";
import { listTeamSubmissionCounts } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Gavel, AlertCircle, Check, ChevronDown, ChevronUp } from "lucide-react";

export const Route = createFileRoute("/_authenticated/judge")({
  component: JudgePage,
});

// KST window: 2026-07-14 07:00 ~ 2026-07-15 00:00
function isJudgingOpen() {
  const now = new Date();
  // Convert to KST
  const kst = new Date(now.getTime() + (9 * 60 - now.getTimezoneOffset()) * 60000);
  const start = new Date(Date.UTC(2026, 6, 14, 7, 0));  // Jul is month 6 (0-indexed) — using UTC constructor, then treat as KST clock
  const end = new Date(Date.UTC(2026, 6, 15, 0, 0));
  // Compare kst clock as UTC
  const kstAsUtc = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate(), kst.getUTCHours(), kst.getUTCMinutes());
  return kstAsUtc >= start.getTime() && kstAsUtc < end.getTime();
}

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
  const teamCountsFn = useServerFn(listTeamSubmissionCounts);
  const submitFn = useServerFn(submitEvaluation);
  const qc = useQueryClient();

  const { data: subs = [] } = useQuery({ queryKey: ["submissions"], queryFn: () => listFn() });
  const { data: myEvals = [] } = useQuery({ queryKey: ["myEvals"], queryFn: () => myEvalFn() });
  const { data: counts = [] } = useQuery({ queryKey: ["teamCounts"], queryFn: () => teamCountsFn() });

  const evalMap = useMemo(() => {
    const m = new Map<string, any>();
    for (const e of myEvals) m.set(e.submission_id, e);
    return m;
  }, [myEvals]);

  const open = isJudgingOpen();

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
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-widest text-accent">JUDGING</div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">심사위원 평가</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            평가 시간: 2026-07-14 07:00 ~ 24:00 (한국 시간)
          </p>
        </div>
        <div className={`rounded-full px-4 py-2 text-xs font-bold uppercase tracking-widest ${open ? "bg-emerald-500/15 text-emerald-700" : "bg-amber-500/15 text-amber-700"}`}>
          {open ? "● 평가 진행 중" : "○ 평가 시간 외"}
        </div>
      </div>

      {!open && (
        <div className="mt-6 flex items-center gap-3 rounded-2xl border-2 border-amber-400/60 bg-amber-50 px-6 py-5">
          <AlertCircle className="h-7 w-7 shrink-0 text-amber-600" />
          <div>
            <div className="text-lg font-black text-amber-800">지금은 평가 기간이 아닙니다!</div>
            <div className="mt-0.5 text-sm font-semibold text-amber-700">
              평가 기간: 2026년 7월 14일 (화) 07:00 ~ 24:00 · 기간 중에만 점수 입력이 가능합니다.
            </div>
          </div>
        </div>
      )}

      {/* 평가 진행 방법 안내 */}
      <div className="mt-6 rounded-2xl border border-accent/30 bg-gradient-to-br from-accent/5 to-primary/5 p-6">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-accent/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-accent">HOW TO</div>
          <div className="text-sm font-semibold">평가는 이렇게 진행됩니다</div>
        </div>
        <ol className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <li className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">1</span>
              <div className="text-base font-bold">작품 확인</div>
            </div>
            <div className="mt-2 text-sm leading-relaxed text-muted-foreground">아래 목록의 각 작품 카드에서 <b>[작품 상세 →]</b> 링크로 이동해 설명·기술스택·첨부파일을 확인합니다.</div>
          </li>
          <li className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">2</span>
              <div className="text-base font-bold">3개 항목 채점</div>
            </div>
            <div className="mt-2 text-xs leading-relaxed text-muted-foreground">
              슬라이더 또는 숫자 입력으로 점수를 매깁니다.<br/>
              · <b>혁신성 40점</b> — 새로운 아이디어, 창의적 AI 활용<br/>
              · <b>완성도 30점</b> — 결과물 품질·UI·안정성<br/>
              · <b>활용도 20점</b> — 실용성·업무 적용 가능성
            </div>
          </li>
          <li className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">3</span>
              <div className="text-base font-bold">평가 저장 · 평가완료</div>
            </div>
            <div className="mt-2 text-xs leading-relaxed text-muted-foreground"><b>[평가 저장]</b>은 임시 저장(수정 가능), <b>[평가완료]</b>를 누르면 해당 작품은 <b>더 이상 수정할 수 없습니다</b>.</div>
          </li>
        </ol>
        <div className="mt-4 rounded-xl border border-border/60 bg-background/50 p-5 text-[15px] leading-relaxed text-foreground/80">
          <b className="text-[17px] text-foreground">채점 규칙</b> — 실/팀장 평가 90점 만점(혁신성 40 + 완성도 30 + 활용도 20)을 100점으로 환산한 뒤 <b>× 0.8</b>, 좋아요 점수(최다 득표=100)를 <b>× 0.2</b>로 합산해 <b>최종 100점</b>을 실시간 계산합니다. 다른 심사위원의 점수는 서로 조회할 수 없으며, 본인 평가만 확인·수정할 수 있습니다.
        </div>
      </div>

      {counts.length > 0 && (
        <div className="mt-8 rounded-2xl border border-border bg-card p-6">
          <div className="text-sm font-semibold mb-3">실별 지원자 수</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {counts.map((c: any) => (
              <div key={c.team} className="rounded-lg border border-border bg-background px-4 py-3">
                <div className="text-xs text-muted-foreground">{c.team}</div>
                <div className="mt-1 text-2xl font-bold text-primary">{c.count}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 space-y-4">
        {(() => {
          const maxLikes = Math.max(1, ...subs.map((x: any) => x.likeCount ?? 0));
          return subs.map((s: any) => (
            <EvalRow key={s.id} sub={s} current={evalMap.get(s.id)} maxLikes={maxLikes} disabled={!open} onSave={async (v: { innovation: number; completeness: number; utilization: number; finalize?: boolean }) => {
              try {
                await submitFn({ data: { submissionId: s.id, ...v } });
                qc.invalidateQueries({ queryKey: ["myEvals"] });
                toast.success(v.finalize ? `${s.title} 평가완료` : `${s.title} 평가 저장`);
              } catch (e: any) { toast.error(e.message); }
            }} />
          ));
        })()}
        {subs.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
            평가할 작품이 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}

function EvalRow({ sub, current, maxLikes, disabled, onSave }: any) {
  const [inn, setInn] = useState<number>(current?.innovation ?? 0);
  const [com, setCom] = useState<number>(current?.completeness ?? 0);
  const [uti, setUti] = useState<number>(current?.utilization ?? 0);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (current) { setInn(current.innovation); setCom(current.completeness); setUti(current.utilization); }
  }, [current]);
  const rawJudge = inn + com + uti;                // 0-90
  const judge100 = (rawJudge / 90) * 100;          // 0-100
  const likeCount = sub.likeCount ?? 0;
  const likeScore100 = (likeCount / Math.max(1, maxLikes)) * 100;
  const final = judge100 * 0.8 + likeScore100 * 0.2;
  const finalRounded = Math.round(final * 10) / 10;
  const finalized = !!current?.is_finalized;
  const locked = disabled || finalized;

  const getDetailFn = useServerFn(getSubmission);
  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ["submission", sub.id],
    queryFn: () => getDetailFn({ data: { id: sub.id } }),
    enabled: expanded,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className={`rounded-xl border p-5 ${finalized ? "border-emerald-500/40 bg-emerald-500/5" : "border-border bg-card"}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs text-muted-foreground">{[sub.author.team, `${sub.author.name} ${sub.author.position}`.trim()].filter(Boolean).join(" · ")}</div>
          <div className="mt-0.5 text-lg font-bold">{sub.title}</div>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
          >
            {expanded ? <>작품 상세 접기 <ChevronUp className="h-3.5 w-3.5" /></> : <>작품 상세 펼치기 <ChevronDown className="h-3.5 w-3.5" /></>}
          </button>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase text-muted-foreground">최종 점수 (실시간)</div>
          <div className="text-3xl font-bold text-primary">{finalRounded}<span className="text-sm text-muted-foreground">/100</span></div>
          <div className="mt-1 text-[10px] text-muted-foreground">
            심사 {rawJudge}/90 → {judge100.toFixed(1)} × 0.8 <span className="mx-1">+</span> 좋아요 {likeCount} → {likeScore100.toFixed(1)} × 0.2
          </div>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 rounded-xl border border-border bg-background/60 p-5">
          {detailLoading && <div className="text-sm text-muted-foreground">불러오는 중…</div>}
          {detail && (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-[220px_1fr]">
              {detail.submission.thumbnailSignedUrl && (
                <img src={detail.submission.thumbnailSignedUrl} alt={detail.submission.title} className="h-40 w-full rounded-lg object-cover md:h-full" />
              )}
              <div className="space-y-4 text-sm">
                <DetailBlock title="주요 기능" body={detail.submission.features} />
                <DetailBlock title="설명" body={detail.submission.description} />
                <DetailBlock title="사용 기술" body={detail.submission.tech_stack} />
                <DetailBlock title="기대 효과" body={detail.submission.expected_impact} />
                {detail.files?.length > 0 && (
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">첨부파일</div>
                    <ul className="mt-2 space-y-1">
                      {detail.files.map((f: any) => (
                        <li key={f.id}>
                          <a href={f.signedUrl ?? f.url} target="_blank" rel="noreferrer" className="text-xs text-accent hover:underline">
                            📎 {f.file_name ?? f.name}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="text-xs text-muted-foreground">좋아요 {detail.likeCount ?? 0}개</div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        <ScoreInput label="혁신성" hint="새로운 아이디어, 창의적 AI 활용" max={40} value={inn} onChange={setInn} disabled={locked} />
        <ScoreInput label="완성도" hint="결과물 품질, UI/UX, 안정성, 디테일" max={30} value={com} onChange={setCom} disabled={locked} />
        <ScoreInput label="활용도" hint="실용성 · 업무 적용 가능성" max={20} value={uti} onChange={setUti} disabled={locked} />
      </div>

      <div className="mt-4 flex items-center justify-end gap-3">
        {finalized ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-700">
            <Check className="h-3.5 w-3.5" /> 평가완료 · 수정 불가
          </span>
        ) : (
          <>
            {current && <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><Check className="h-3 w-3" /> 임시 저장됨</span>}
            <Button size="sm" variant="outline" disabled={locked} onClick={() => onSave({ innovation: inn, completeness: com, utilization: uti, finalize: false })}>
              <Gavel className="mr-1.5 h-3.5 w-3.5" /> 평가 저장
            </Button>
            <Button size="sm" disabled={locked} onClick={() => {
              if (!confirm(`[${sub.title}] 평가를 완료 처리하시겠습니까?\n\n평가완료 후에는 더 이상 점수를 수정할 수 없습니다.`)) return;
              onSave({ innovation: inn, completeness: com, utilization: uti, finalize: true });
            }}>
              <Check className="mr-1.5 h-3.5 w-3.5" /> 평가완료
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function DetailBlock({ title, body }: { title: string; body?: string }) {
  if (!body) return null;
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{title}</div>
      <div className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{body}</div>
    </div>
  );
}

function ScoreInput({ label, hint, max, value, onChange, disabled }: { label: string; hint: string; max: number; value: number; onChange: (v: number) => void; disabled: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-baseline justify-between">
        <div className="text-sm font-semibold">{label}</div>
        <div className="text-xs text-muted-foreground">최대 {max}점</div>
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>
      <div className="mt-2 flex items-center gap-3">
        <input type="range" min={0} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} disabled={disabled} className="flex-1 accent-primary" />
        <input type="number" min={0} max={max} value={value} onChange={(e) => onChange(Math.min(max, Math.max(0, Number(e.target.value))))} disabled={disabled} className="w-16 rounded-md border border-border bg-background px-2 py-1 text-center text-sm font-bold text-primary" />
      </div>
    </div>
  );
}
