import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { getSubmission, toggleLike, addComment, listMyLikes } from "@/lib/submissions.functions";
import { supabase } from "@/integrations/supabase/client";
import { Heart, MessageSquare, Download, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import { SubmissionActions } from "@/components/SubmissionActions";

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
  const liked = myLikes.includes(id);

  const likeMut = useMutation({
    mutationFn: () => like({ data: { submissionId: id } }),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ["myLikes"] });
      const prevLikes = qc.getQueryData<string[]>(["myLikes"]) ?? [];
      const nextLikes = prevLikes.includes(id) ? prevLikes.filter((x) => x !== id) : [...prevLikes, id];
      qc.setQueryData<string[]>(["myLikes"], nextLikes);
      const prevSub = qc.getQueryData<any>(["submission", id]);
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
          <div className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{data.likeCount}</span> likes ·{" "}
            <span className="font-semibold text-foreground">{data.comments.length}</span> comments
          </div>
          {signedIn ? (
            <Button
              variant={liked ? "default" : "outline"}
              onClick={() => likeMut.mutate()}
              className={liked ? "bg-rose-500 text-white hover:bg-rose-600 border-rose-500" : "hover:text-rose-500 hover:border-rose-300"}
            >
              <Heart className={`mr-2 h-4 w-4 ${liked ? "fill-white text-white" : "text-rose-500"}`} />
              {liked ? "좋아요 취소" : "좋아요"}
            </Button>
          ) : (
            <Button asChild variant="outline">
              <Link to="/auth">로그인 후 좋아요</Link>
            </Button>
          )}
        </div>
      </article>


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
