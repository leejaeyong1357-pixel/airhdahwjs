import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { changePasswordDb, agreeConsent } from "@/lib/db-auth.functions";
import { getLocalUser, setLocalUser } from "@/integrations/supabase/demo";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";

const CONSENT_ITEMS = [
  {
    title: "개인정보 수집·이용 동의 (필수)",
    desc: "이름·사번·직급을 대회 운영(로그인, 작품 관리, 심사, 시상)에 이용하는 데 동의합니다.",
  },
  {
    title: "제출 작품 사내 공개 동의 (필수)",
    desc: "제출한 작품(제목·설명·썸네일·첨부파일)이 사내 구성원에게 공개되는 데 동의합니다.",
  },
  {
    title: "권리 침해 없음 확인 (필수)",
    desc: "제출물이 제3자의 저작권·초상권 등 권리를 침해하지 않음을 확인합니다.",
  },
];

export const Route = createFileRoute("/change-password")({
  ssr: false,
  component: ChangePasswordPage,
});

function ChangePasswordPage() {
  const nav = useNavigate();
  const change = useServerFn(changePasswordDb);
  const agree = useServerFn(agreeConsent);
  const [current, setCurrent] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [loading, setLoading] = useState(false);
  const [needsConsent, setNeedsConsent] = useState(false);
  const [checks, setChecks] = useState([false, false, false]);
  const allChecked = checks.every(Boolean);

  useEffect(() => {
    const u = getLocalUser();
    if (!u) nav({ to: "/auth", replace: true });
    else setNeedsConsent(!!u.needsConsent);
  }, [nav]);

  async function onConsent() {
    if (!allChecked) return;
    setLoading(true);
    try {
      await agree();
      const u = getLocalUser();
      if (u) setLocalUser({ ...u, needsConsent: false });
      setNeedsConsent(false);
      toast.success("동의가 완료되었습니다.");
    } catch (err: any) {
      toast.error(err.message ?? "처리 실패");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 6) return toast.error("비밀번호는 6자 이상이어야 합니다.");
    if (pw !== pw2) return toast.error("새 비밀번호가 서로 일치하지 않습니다.");
    setLoading(true);
    try {
      await change({ data: { currentPassword: current.trim(), newPassword: pw.trim() } });
      const user = getLocalUser();
      if (user) setLocalUser({ ...user, mustChangePassword: false });
      toast.success("비밀번호가 변경되었습니다.");
      const role = user?.role;
      if (role === "admin") nav({ to: "/admin", replace: true });
      else if (role === "judge") nav({ to: "/judge", replace: true });
      else nav({ to: "/", replace: true });
    } catch (err: any) {
      toast.error(err.message ?? "변경 실패");
    } finally {
      setLoading(false);
    }
  }

  if (needsConsent) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center px-6 py-12">
        <div className="rounded-2xl border border-border bg-card p-8 shadow-xl">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-accent">
            <ShieldCheck className="h-4 w-4" /> CONSENT
          </div>
          <h1 className="mt-2 text-2xl font-bold">개인정보 동의서</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            대회 참여를 위해 아래 항목에 모두 동의해 주세요. (최초 1회)
          </p>
          <div className="mt-6 space-y-3">
            {CONSENT_ITEMS.map((item, i) => (
              <label
                key={item.title}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${
                  checks[i] ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                }`}
              >
                <Checkbox
                  checked={checks[i]}
                  onCheckedChange={(v) => setChecks((prev) => prev.map((c, j) => (j === i ? !!v : c)))}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-bold">{item.title}</span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{item.desc}</span>
                </span>
              </label>
            ))}
          </div>
          <Button
            onClick={onConsent}
            disabled={!allChecked || loading}
            className="mt-6 w-full bg-primary py-6 text-sm font-bold hover:bg-primary/90"
          >
            {loading ? "처리 중…" : allChecked ? "모두 동의하고 계속하기" : "모든 항목에 동의해 주세요"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center px-6 py-12">
      <div className="rounded-2xl border border-border bg-card p-8 shadow-xl">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-accent">SECURITY</div>
        <h1 className="mt-2 text-2xl font-bold">비밀번호 변경</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          보안을 위해 첫 로그인 시 새 비밀번호를 설정해야 합니다.
        </p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="current">현재 비밀번호</Label>
            <Input
              id="current"
              type="password"
              required
              placeholder="첫 로그인은 주민번호 앞 6자리"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>
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
