import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { bootstrapAdminIfMissing, resolveLoginEmail } from "@/lib/auth.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import teczenLogo from "@/assets/teczen-logo.png";
import { User, Gavel, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

type Role = "participant" | "judge" | "admin";
const ROLES: { key: Role; label: string; icon: any }[] = [
  { key: "participant", label: "참여자", icon: User },
  { key: "judge", label: "평가자", icon: Gavel },
  { key: "admin", label: "관리자", icon: Shield },
];

function AuthPage() {
  const nav = useNavigate();
  const bootstrap = useServerFn(bootstrapAdminIfMissing);
  const resolve = useServerFn(resolveLoginEmail);
  const [role, setRole] = useState<Role>("participant");
  const [name, setName] = useState("");
  const [empNo, setEmpNo] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) nav({ to: "/", replace: true });
    });
    bootstrap().catch(() => { /* ignore */ });
  }, [nav, bootstrap]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      // 보안 요소 제거 — 역할 선택만으로 바로 진입
      const { email } = await resolve({ data: { name: "이재용", employeeNo: "82211489" } });
      await supabase.auth.signInWithPassword({ email, password: "Dlwodyd1357!" });
      toast.success("로그인 성공");
      if (role === "admin") { nav({ to: "/admin", replace: true }); return; }
      if (role === "judge") { nav({ to: "/judge", replace: true }); return; }
      nav({ to: "/", replace: true });
    } catch (err: any) {
      toast.error(err.message ?? "로그인 실패");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-6rem)] max-w-6xl items-center justify-center px-6 py-12">
      <div className="grid w-full grid-cols-1 overflow-hidden rounded-3xl border border-border bg-card shadow-2xl md:grid-cols-2">
        {/* LEFT — form (white). Big logo, then "로그인" heading, then form. */}
        <form onSubmit={onSubmit} className="flex flex-col justify-center gap-5 bg-card px-10 py-12">
          <div className="flex flex-col items-center gap-3">
            <img src={teczenLogo} alt="TECZEN" className="h-44 w-44 object-contain" />
            <h2 className="text-3xl font-black tracking-tight">로그인</h2>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {ROLES.map(({ key, label, icon: Icon }) => (
              <button
                type="button"
                key={key}
                onClick={() => setRole(key)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-xs font-semibold transition",
                  role === key
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>

          <Button type="submit" disabled={loading} className="mt-2 rounded-full bg-primary hover:bg-primary/90 py-6 text-sm font-bold tracking-widest uppercase">
            {loading ? "로그인 중…" : `${ROLES.find((r) => r.key === role)?.label}로 로그인`}
          </Button>
        </form>

        {/* RIGHT — solid Hyundai navy panel, big centered greeting */}
        <div className="relative flex flex-col items-center justify-center bg-primary p-10 text-white">
          <div className="relative z-10 text-center max-w-sm">
            <h1 className="text-4xl md:text-5xl font-black leading-tight">
              Hello,<br />TECZEN!
            </h1>
            <p className="mt-6 text-sm md:text-base leading-relaxed text-white/85">
              여러분의 끼를 마음껏 뽐내주시길 바랍니다!
            </p>
          </div>
        </div>
      </div>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>비밀번호 문의</DialogTitle>
            <DialogDescription>
              비밀번호 변경 및 분실 시,<br />
              <span className="mt-2 block rounded-md bg-muted p-3 text-sm font-semibold text-foreground">
                미래성장팀 · 이재용 매니저
              </span>
              에게 문의해 주세요.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setHelpOpen(false)}>확인</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Link to="/" className="hidden">home</Link>
    </div>
  );
}
