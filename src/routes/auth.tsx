import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { loginWithDb } from "@/lib/db-auth.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import teczenLogo from "@/assets/teczen-logo.png";
import { User, Gavel, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { setLocalUser } from "@/integrations/supabase/demo";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

const AUTH_FIREFLIES = [
  { left: "12%", top: "80%", size: 5, dur: 15, delay: 0,   fx: "20vw",  fy: "-55vh" },
  { left: "26%", top: "92%", size: 4, dur: 19, delay: 3,   fx: "14vw",  fy: "-62vh" },
  { left: "46%", top: "84%", size: 5, dur: 16, delay: 6.5, fx: "-8vw",  fy: "-50vh" },
  { left: "66%", top: "90%", size: 4, dur: 20, delay: 1.5, fx: "-12vw", fy: "-58vh" },
  { left: "82%", top: "78%", size: 6, dur: 17, delay: 8,   fx: "-18vw", fy: "-48vh" },
  { left: "90%", top: "60%", size: 4, dur: 21, delay: 4.5, fx: "-20vw", fy: "-38vh" },
  { left: "8%",  top: "58%", size: 4, dur: 18, delay: 10,  fx: "22vw",  fy: "-40vh" },
];

type Role = "participant" | "judge" | "admin";
const ROLES: { key: Role; label: string; icon: any }[] = [
  { key: "participant", label: "참여자", icon: User },
  { key: "judge", label: "평가자", icon: Gavel },
  { key: "admin", label: "관리자", icon: Shield },
];

function AuthPage() {
  const nav = useNavigate();
  const login = useServerFn(loginWithDb);
  const [role, setRole] = useState<Role>("participant");
  const [name, setName] = useState("");
  const [empNo, setEmpNo] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      // 프로젝트 루트 DB 파일의 명단과 대조 (비밀번호 = 주민번호 앞 6자리)
      const user = await login({
        data: { name: name.trim(), employeeNo: empNo.trim(), password: pw.trim(), role },
      });
      setLocalUser({ ...user, role });
      if (user.mustChangePassword || user.needsConsent) {
        toast.info("첫 로그인입니다. 동의 및 비밀번호 변경을 진행해 주세요.");
        nav({ to: "/change-password", replace: true });
        return;
      }
      toast.success(`${user.name}님, 환영합니다!`);
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
    <div
      className="relative min-h-screen overflow-hidden"
      style={{ background: "radial-gradient(900px 520px at 50% 0%, #10203d 0%, #000105 62%)" }}
    >
      {/* 빛 번짐 */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-10 h-[320px] w-[640px] -translate-x-1/2 rounded-full opacity-60" style={{ background: "rgba(80,70,220,0.30)", filter: "blur(90px)" }} />
        <div className="absolute left-[12%] top-[45%] h-[240px] w-[380px] rounded-full opacity-50" style={{ background: "rgba(210,60,140,0.14)", filter: "blur(90px)" }} />
        <div className="absolute right-[10%] top-[30%] h-[260px] w-[400px] rounded-full opacity-60" style={{ background: "rgba(40,120,255,0.20)", filter: "blur(90px)" }} />
        {/* 반딧불 */}
        {AUTH_FIREFLIES.map((f, i) => (
          <span key={i} className="firefly" style={{ left: f.left, top: f.top, width: f.size, height: f.size, animationDuration: `${f.dur}s`, animationDelay: `${f.delay}s`, ["--fx" as any]: f.fx, ["--fy" as any]: f.fy }} />
        ))}
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center px-6 py-14">
        {/* 카드 밖 상단 — 로고 + 문구 */}
        <img src={teczenLogo} alt="TECZEN" className="h-9 w-auto object-contain" style={{ filter: "brightness(0) invert(1)" }} />
        <h1 className="mt-6 text-center font-black leading-[1.15] tracking-tight" style={{ fontSize: "clamp(34px, 5vw, 48px)" }}>
          <span className="text-white">새로운 도전.</span>
          <br />
          <span style={{ background: "linear-gradient(100deg,#5ea1ff 10%,#a97bff 50%,#ff7bb1 90%)", WebkitBackgroundClip: "text", color: "transparent" }}>
            어마무시한 가능성.
          </span>
        </h1>
        <p className="mt-4 text-center text-sm text-white/60">
          제 1회 테크젠 사내 AI 경진대회 · 여러분의 끼를 마음껏 뽐내주세요!
        </p>

        {/* 흰색 로그인 카드 */}
        <form onSubmit={onSubmit} className="mt-10 flex w-full max-w-md flex-col gap-5 rounded-3xl bg-white px-9 py-10 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.7)]">
          <h2 className="text-center text-2xl font-black tracking-tight text-[#0a0a0a]">로그인</h2>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="login-name">이름</Label>
              <Input
                id="login-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="홍길동"
                autoComplete="name"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="login-empno">사번</Label>
              <Input
                id="login-empno"
                value={empNo}
                onChange={(e) => setEmpNo(e.target.value)}
                placeholder="82210000"
                inputMode="numeric"
                autoComplete="username"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="login-pw">비밀번호</Label>
              <Input
                id="login-pw"
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                placeholder="주민번호 앞 6자리"
                autoComplete="current-password"
                required
              />
            </div>
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

          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            비밀번호를 모르시나요?
          </button>
        </form>
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
