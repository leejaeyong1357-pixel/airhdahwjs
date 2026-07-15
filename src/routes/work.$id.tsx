import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { getSubmission, toggleLike, addComment, listMyLikes } from "@/lib/submissions.functions";
import { listMyEvaluations, submitEvaluation } from "@/lib/evaluations.functions";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/demo";
import { Heart, MessageSquare, Download, ArrowLeft, Gavel, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import { SubmissionActions } from "@/components/SubmissionActions";
import { isJudgingOpen, JUDGING_PERIOD_LABEL, computeFinalScore } from "@/lib/judging";
import { listBannedFromJudges } from "@/lib/admin.functions";

export const Route = createFileRoute("/work/$id")({
  component: WorkPage,
});

function WorkPage() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const get = useServerFn(getSubmission);
  const like = useServerFn(toggleLike);
  const myLikesFn = useServerFn(listMyLikes);
  const comment = useServerFn(addComment);
  const qc = useQueryClient();
  const [signedIn, setSignedIn] = useState(false);
  const [body, setBody] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["submission", id],
    queryFn: () => get({ data: { id } }),
  });
  const { data: myLikes = [] } = useQuery({
    queryKey: ["myLikes"],
    queryFn: () => myLikesFn(),
    enabled: signedIn,
  });
  // 이재용 매니저(대회 운영)는 좋아요 무제한 + 같은 작품에도 여러 번 누적 가능
  const unlimited = getLocalUser()?.empNo === "82211489";
  const liked = !unlimited && myLikes.includes(id);

  // 심사위원/관리자면 평가 패널 표시
  const roles = getLocalUser()?.roles ?? [];
  const isAdmin = roles.includes("admin");
  const isJudge = roles.includes("judge") || isAdmin;
  const myEvalFn = useServerFn(listMyEvaluations);
  const { data: myEvals = [] } = useQuery({
    queryKey: ["myEvals"],
    queryFn: () => myEvalFn(),
    enabled: isJudge,
  });
  const myEval = myEvals.find((e: any) => e.submission_id === id);
  const bannedFn = useServerFn(listBannedFromJudges);
  const { data: bannedList = [] } = useQuery({
    queryKey: ["bannedFromJudges"],
    queryFn: () => bannedFn(),
    enabled: isJudge,
  });
  // 평가 제외(밴) 대상은 팀장(평가자) 평가 대상에서 제외 — 관리자는 예외
  const authorEmpNo = (data as any)?.submission?.user_id ?? "";
  const hiddenFromJudge = !isAdmin && bannedList.includes(authorEmpNo);
  const canEvaluate = isJudge && !hiddenFromJudge;

  const likeMut = useMutation({
    mutationFn: () => like({ data: { submissionId: id } }),
    onMutate: async () => {
      const prevSub = qc.getQueryData<any>(["submission", id]);
      if (unlimited) {
        // 항상 +1 (누적)
        if (prevSub) qc.setQueryData(["submission", id], { ...prevSub, likeCount: prevSub.likeCount + 1 });
        return { prevSub };
      }
      await qc.cancelQueries({ queryKey: ["myLikes"] });
      const prevLikes = qc.getQueryData<string[]>(["myLikes"]) ?? [];
      const nextLikes = prevLikes.includes(id) ? prevLikes.filter((x) => x !== id) : [...prevLikes, id];
      qc.setQueryData<string[]>(["myLikes"], nextLikes);
      if (prevSub) {
        qc.setQueryData(["submission", id], {
          ...prevSub,
          likeCount: prevSub.likeCount + (prevLikes.includes(id) ? -1 : 1),
        });
      }
      return { prevLikes, prevSub };
    },
    onError: (e: any, _v, ctx) => {
      if (ctx?.prevLikes) qc.setQueryData(["myLikes"], ctx.prevLikes);
      if (ctx?.prevSub) qc.setQueryData(["submission", id], ctx.prevSub);
      toast.error(e.message);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["submissions"] });
      qc.invalidateQueries({ queryKey: ["submission", id] });
    },
  });


  const commentMut = useMutation({
    mutationFn: (b: string) => comment({ data: { submissionId: id, body: b } }),
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["submission", id] });
      toast.success("댓글이 등록되었습니다.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading || !data) {
    return <div className="p-12 text-center text-muted-foreground">불러오는 중…</div>;
  }
  const s = data.submission;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> 갤러리로
      </Link>

      <article className="mt-6 overflow-hidden rounded-2xl border border-border bg-card">
        <div className="border-b border-border px-8 py-6">
          <div className="flex items-start justify-between gap-4">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-accent">SUBMISSION</div>
            {(data as any).mine && (
              <SubmissionActions
                id={id}
                onChanged={() => qc.invalidateQueries({ queryKey: ["submission", id] })}
                afterDelete={() => { qc.invalidateQueries({ queryKey: ["submissions"] }); nav({ to: "/", replace: true }); }}
              />
            )}
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">{s.title}</h1>
          <div className="mt-3 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{(s as any).profiles?.team}</span>
            {" · "}
            {(s as any).profiles?.name} {(s as any).profiles?.position}
            {" · "}
            {formatDate(s.created_at)}
          </div>
        </div>

        <div className="aspect-video w-full overflow-hidden bg-muted">
          {s.thumbnailSignedUrl && (
            <img src={s.thumbnailSignedUrl} alt={s.title} className="h-full w-full object-cover" />
          )}
        </div>

        <div className="grid grid-cols-1 gap-8 p-8">
          <Section title="주요 기능">{s.features}</Section>
          <Section title="설명">{s.description}</Section>
          <Section title="사용 AI · 기술 · 스택">{s.tech_stack}</Section>
          <Section title="기대 효과">{s.expected_impact}</Section>
        </div>

        {data.files.length > 0 && (
          <div className="border-t border-border px-8 py-6">
            <div className="text-sm font-semibold mb-3">첨부 파일 ({data.files.length})</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {data.files.map((f: any) => (
                <a
                  key={f.id}
                  href={f.signedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  download={f.file_name}
                  className="flex items-center justify-between rounded-lg border border-border bg-background px-4 py-3 text-sm hover:border-primary/40 hover:bg-muted/50"
                >
                  <span className="truncate font-medium">{f.file_name}</span>
                  <Download className="h-4 w-4 text-muted-foreground" />
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border bg-muted/40 px-8 py-5">
          <div>
            <div className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{data.likeCount}</span> likes ·{" "}
              <span className="font-semibold text-foreground">{data.comments.length}</span> comments
            </div>
            <div className="mt-1 text-xs font-semibold text-rose-500">
              좋아요는 평가 점수(20%)에 반영됩니다 · 인당 최대 3개
            </div>
          </div>
          {signedIn ? (
            <Button
              variant={liked ? "default" : "outline"}
              onClick={() => likeMut.mutate()}
              className={liked ? "bg-rose-500 text-white hover:bg-rose-600 border-rose-500" : "hover:text-rose-500 hover:border-rose-300"}
            >
              <Heart className={`mr-2 h-4 w-4 ${liked ? "fill-white text-white" : "text-rose-500"}`} />
              {unlimited ? "좋아요 +1" : liked ? "좋아요 취소" : "좋아요"}
            </Button>
          ) : (
            <Button asChild variant="outline">
              <Link to="/auth">로그인 후 좋아요</Link>
            </Button>
          )}
        </div>
      </article>

      {/* 심사위원 평가 패널 */}
      {canEvaluate && (
        <EvalPanel
          submissionId={id}
          title={s.title}
          likeCount={data.likeCount}
          current={myEval}
          onSaved={() => qc.invalidateQueries({ queryKey: ["myEvals"] })}
        />
      )}


      {/* Comments */}
      <section className="mt-10">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <MessageSquare className="h-4 w-4" /> 댓글
        </h2>
        {signedIn && (
          <form
            onSubmit={(e) => { e.preventDefault(); if (body.trim()) commentMut.mutate(body); }}
            className="mt-4 flex gap-2"
          >
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="응원과 피드백을 남겨주세요"
              rows={2}
              maxLength={500}
            />
            <Button type="submit" disabled={commentMut.isPending || !body.trim()}>등록</Button>
          </form>
        )}
        <ul className="mt-6 space-y-3">
          {data.comments.map((c: any) => (
            <li key={c.id} className="rounded-lg border border-border bg-card p-4">
              <div className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {c.profiles?.name}
                  {c.profiles?.position ? <span className="ml-1 font-normal text-muted-foreground">{c.profiles.position}</span> : null}
                </span>
                {c.profiles?.team ? ` · ${c.profiles.team}` : ""} · {formatDate(c.created_at)}
              </div>
              <div className="mt-1.5 text-sm whitespace-pre-wrap">{c.body}</div>
            </li>
          ))}

          {data.comments.length === 0 && (
            <li className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              아직 댓글이 없습니다.
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-bold uppercase tracking-widest text-accent">{title}</div>
      <div className="mt-2.5 whitespace-pre-wrap text-[16px] leading-[1.85] text-foreground">{children}</div>
    </div>
  );
}

// ───────── 심사위원 평가 패널 (작품 상세 하단) ─────────
function EvalPanel({
  submissionId, title, likeCount, current, onSaved,
}: {
  submissionId: string;
  title: string;
  likeCount: number;
  current?: { innovation: number; completeness: number; utilization: number; is_finalized?: boolean };
  onSaved: () => void;
}) {
  const submitFn = useServerFn(submitEvaluation);
  const [inn, setInn] = useState<number>(current?.innovation ?? 0);
  const [com, setCom] = useState<number>(current?.completeness ?? 0);
  const [uti, setUti] = useState<number>(current?.utilization ?? 0);
  const [busy, setBusy] = useState(false);
  const open = isJudgingOpen();

  useEffect(() => {
    if (current) { setInn(current.innovation); setCom(current.completeness); setUti(current.utilization); }
  }, [current]);

  const judgeRaw = inn + com + uti;                 // 0-100
  const finalScore = computeFinalScore(judgeRaw, likeCount);
  const finalized = !!current?.is_finalized;

  async function save(finalize: boolean) {
    setBusy(true);
    try {
      await submitFn({ data: { submissionId, innovation: inn, completeness: com, utilization: uti, finalize } });
      toast.success(finalize ? "평가를 완료했습니다." : "평가를 저장했습니다.");
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "저장 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-8 rounded-3xl border-2 border-primary/25 bg-primary/5 p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Gavel className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-black tracking-tight">심사위원 평가</h2>
          {finalized && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-3 py-1 text-[13px] font-black text-emerald-700">
              <Check className="h-4 w-4" /> 평가완료
            </span>
          )}
        </div>
        <div className="text-right">
          <div className="text-[13px] font-bold text-muted-foreground">최종 점수 (실시간)</div>
          <div className="text-4xl font-black text-primary">
            {finalScore}<span className="text-lg text-muted-foreground">/100</span>
          </div>
        </div>
      </div>

      {!open && (
        <div className="mt-5 flex items-center gap-3 rounded-2xl border-2 border-amber-400/60 bg-amber-50 px-5 py-4">
          <span className="text-2xl">⏰</span>
          <div>
            <div className="text-[16px] font-black text-amber-800">지금은 평가 기간이 아닙니다!</div>
            <div className="text-[13px] font-semibold text-amber-700">평가 가능 기간: {JUDGING_PERIOD_LABEL}</div>
          </div>
        </div>
      )}

      <div className="mt-6 space-y-5">
        <ScoreRow label="혁신성" hint="새로운 아이디어, 창의적인 AI 활용" max={40} value={inn} onChange={setInn} disabled={!open} />
        <ScoreRow label="완성도" hint="결과물의 품질, UI/UX, 안정성, 디테일" max={40} value={com} onChange={setCom} disabled={!open} />
        <ScoreRow label="활용도" hint="실제 업무 적용 가능성, 실용성" max={20} value={uti} onChange={setUti} disabled={!open} />
      </div>

      <div className="mt-6 rounded-2xl bg-white/70 px-5 py-4 text-[15px] font-semibold text-foreground">
        심사 점수 <b className="text-primary">{judgeRaw}</b>/100 → {((judgeRaw / 100) * 80).toFixed(1)}점
        <span className="mx-2 text-muted-foreground">+</span>
        좋아요 <b className="text-rose-500">{likeCount}</b>개 → {Math.min(likeCount, 20)}점
        <span className="mx-2 text-muted-foreground">=</span>
        최종 <b className="text-primary">{finalScore}</b>점
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
        <Button size="lg" variant="outline" disabled={busy || !open} onClick={() => save(false)}>
          <Gavel className="mr-2 h-4 w-4" /> 평가 저장
        </Button>
        <Button size="lg" disabled={busy || !open} onClick={() => save(true)}>
          <Check className="mr-2 h-4 w-4" /> 평가완료
        </Button>
      </div>
      <div className="mt-2 text-right text-[13px] text-muted-foreground">
        평가완료 후에도 기간 내에는 언제든 다시 수정할 수 있습니다.
      </div>
    </section>
  );
}

function ScoreRow({ label, hint, max, value, onChange, disabled }: {
  label: string; hint: string; max: number; value: number; onChange: (v: number) => void; disabled: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-white p-5">
      <div className="flex items-baseline justify-between">
        <div className="text-[19px] font-black text-foreground">{label}</div>
        <div className="text-[14px] font-bold text-muted-foreground">최대 {max}점</div>
      </div>
      <div className="mt-1 text-[14px] text-muted-foreground">{hint}</div>
      <div className="mt-4 flex items-center gap-4">
        <input
          type="range"
          min={0}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          disabled={disabled}
          className="h-2 flex-1 accent-primary"
        />
        <input
          type="number"
          min={0}
          max={max}
          value={value}
          onChange={(e) => onChange(Math.min(max, Math.max(0, Math.round(Number(e.target.value) || 0))))}
          disabled={disabled}
          className="w-20 rounded-lg border-2 border-border bg-background px-2 py-2 text-center text-xl font-black text-primary disabled:opacity-60"
        />
      </div>
    </div>
  );
}
