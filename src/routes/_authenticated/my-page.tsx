import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { listSubmissions } from "@/lib/submissions.functions";
import { changePasswordDb } from "@/lib/db-auth.functions";
import { SubmissionActions } from "@/components/SubmissionActions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/my-page")({
  component: MyPage,
});

function MyPage() {
  const [profile, setProfile] = useState<any>(null);
  const [role, setRole] = useState<string>("");
  const [current, setCurrent] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const changePw = useServerFn(changePasswordDb);
  const listFn = useServerFn(listSubmissions);
  const qc = useQueryClient();
  const { data: subs = [] } = useQuery({ queryKey: ["submissions"], queryFn: () => listFn() });
  const mySubs = subs.filter((x: any) => x.mine);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [{ data: p }, { data: r }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user.id),
      ]);
      setProfile(p); setRole((r?.[0] as any)?.role ?? "participant");
    })();
  }, []);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 6) return toast.error("6자 이상 입력해 주세요.");
    if (pw !== pw2) return toast.error("비밀번호가 일치하지 않습니다.");
    setBusy(true);
    try {
      await changePw({ data: { currentPassword: current.trim(), newPassword: pw.trim() } });
      toast.success("비밀번호가 변경되었습니다.");
      setCurrent(""); setPw(""); setPw2("");
    } catch (err: any) {
      toast.error(err.message ?? "변경 실패");
    } finally {
      setBusy(false);
    }
  }

  if (!profile) return <div className="p-12 text-center text-muted-foreground">로딩 중…</div>;

  const roleKo = { admin: "관리자", judge: "심사위원", participant: "참여자" }[role] ?? role;

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <div className="text-[11px] font-semibold uppercase tracking-widest text-accent">MY PAGE</div>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">마이페이지</h1>

      <div className="mt-8 rounded-2xl border border-border bg-card p-6">
        <div className="text-sm font-semibold">내 정보</div>
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div><dt className="text-xs text-muted-foreground">이름</dt><dd className="mt-0.5 font-semibold">{profile.name}</dd></div>
          <div><dt className="text-xs text-muted-foreground">사번</dt><dd className="mt-0.5 font-mono font-semibold">{profile.employee_no}</dd></div>
          <div><dt className="text-xs text-muted-foreground">팀</dt><dd className="mt-0.5 font-semibold">{profile.team ?? "—"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">직급</dt><dd className="mt-0.5 font-semibold">{profile.position ?? "—"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">권한</dt><dd className="mt-0.5"><span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{roleKo}</span></dd></div>
        </dl>
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-card p-6">
        <div className="text-sm font-semibold">내 작품</div>
        {mySubs.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            아직 제출한 작품이 없습니다.{" "}
            <Link to="/submit" className="font-semibold text-primary underline-offset-2 hover:underline">작품 제출하기 →</Link>
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {mySubs.map((w: any) => (
              <li key={w.id} className="flex items-center gap-4 rounded-xl border border-border bg-background p-3">
                <div className="h-14 w-24 shrink-0 overflow-hidden rounded-lg bg-muted">
                  {w.thumbnailUrl && <img src={w.thumbnailUrl} alt={w.title} className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <Link to="/work/$id" params={{ id: w.id }} className="block truncate text-sm font-bold hover:text-primary">
                    {w.title}
                  </Link>
                  <div className="mt-0.5 text-xs text-muted-foreground">좋아요 {w.likeCount}개</div>
                </div>
                <SubmissionActions
                  id={w.id}
                  onChanged={() => qc.invalidateQueries({ queryKey: ["submissions"] })}
                  afterDelete={() => qc.invalidateQueries({ queryKey: ["submissions"] })}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <form onSubmit={changePassword} className="mt-6 rounded-2xl border border-border bg-card p-6">
        <div className="text-sm font-semibold">비밀번호 변경</div>
        <div className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="p0">현재 비밀번호</Label>
            <Input id="p0" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p1">새 비밀번호</Label>
            <Input id="p1" type="password" value={pw} onChange={(e) => setPw(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p2">새 비밀번호 확인</Label>
            <Input id="p2" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} required />
          </div>
          <Button type="submit" disabled={busy}>{busy ? "변경 중…" : "변경"}</Button>
        </div>
      </form>
    </div>
  );
}
