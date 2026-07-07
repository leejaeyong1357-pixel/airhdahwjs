import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { markPasswordChanged } from "@/lib/auth.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/change-password")({
  component: ChangePasswordPage,
});

function ChangePasswordPage() {
  const nav = useNavigate();
  const mark = useServerFn(markPasswordChanged);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 6) return toast.error("비밀번호는 6자 이상이어야 합니다.");
    if (pw !== pw2) return toast.error("비밀번호가 일치하지 않습니다.");
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      await mark({ data: {} as any });
      toast.success("비밀번호가 변경되었습니다.");
      nav({ to: "/", replace: true });
    } catch (err: any) {
      toast.error(err.message ?? "변경 실패");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center px-6 py-12">
      <div className="rounded-2xl border border-border bg-card p-8 shadow-xl">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-accent">SECURITY</div>
        <h1 className="mt-2 text-2xl font-bold">비밀번호 변경</h1>
        <p className="mt-2 text-sm text-muted-foreground">보안을 위해 새 비밀번호를 설정해 주세요.</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pw">새 비밀번호 (6자 이상)</Label>
            <Input id="pw" type="password" required value={pw} onChange={(e) => setPw(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pw2">새 비밀번호 확인</Label>
            <Input id="pw2" type="password" required value={pw2} onChange={(e) => setPw2(e.target.value)} />
          </div>
          <Button type="submit" disabled={loading} className="w-full bg-primary hover:bg-primary/90">
            {loading ? "변경 중…" : "비밀번호 변경"}
          </Button>
        </form>
      </div>
    </div>
  );
}
