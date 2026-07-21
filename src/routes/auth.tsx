import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { loginJudge, loginAdmin } from "@/lib/live.functions";
import { setLocalUser } from "@/integrations/supabase/demo";
import teczenLogo from "@/assets/teczen-logo.png";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({ component: Auth });

function Auth() {
  const nav = useNavigate();
  const judgeFn = useServerFn(loginJudge);
  const adminFn = useServerFn(loginAdmin);
  const [tab, setTab] = useState<"judge" | "admin">("judge");
  const [name, setName] = useState("");
  const [empNo, setEmpNo] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (tab === "judge") {
        const u = await judgeFn({ data: { name: name.trim(), empNo: empNo.trim() } });
        setLocalUser({ name: u.name, empNo: u.empNo, position: u.position, team: u.team, roles: u.roles as any, role: "judge" });
        nav({ to: "/live", replace: true });
      } else {
        const u = await adminFn({ data: { empNo: empNo.trim(), password: pw } });
        setLocalUser({ name: u.name, empNo: u.empNo, position: "관리자", roles: u.roles as any, role: "admin" });
        nav({ to: "/control", replace: true });
      }
    } catch (err: any) {
      toast.error(err?.message ?? "로그인에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-hyundai-gradient px-5">
      <div className="pointer-events-none absolute inset-0 opacity-30 [background:radial-gradient(60%_50%_at_50%_0%,white,transparent)]" />
      <div className="relative w-full max-w-md">
        <div className="mb-6 text-center">
          <img src={teczenLogo} alt="TECZEN" className="mx-auto h-12 w-auto object-contain brightness-0 invert" />
          <div className="mt-3 text-[15px] font-semibold text-white/90">AI 경진대회 · 현장 발표 평가</div>
        </div>

        <div className="rounded-2xl border border-white/15 bg-white p-6 shadow-2xl">
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
            <TabBtn active={tab === "judge"} onClick={() => setTab("judge")}>평가자</TabBtn>
            <TabBtn active={tab === "admin"} onClick={() => setTab("admin")}>관리자</TabBtn>
          </div>

          <form onSubmit={submit} className="space-y-3">
            {tab === "judge" ? (
              <>
                <Field label="이름" value={name} onChange={setName} placeholder="이름" autoFocus />
                <Field label="사번" value={empNo} onChange={(v) => setEmpNo(v.replace(/\D/g, ""))} placeholder="사번" />
                <p className="text-[12px] text-muted-foreground">대표·상무·실장·팀장만 로그인할 수 있습니다.</p>
              </>
            ) : (
              <>
                <Field label="관리자 사번" value={empNo} onChange={(v) => setEmpNo(v.replace(/\D/g, ""))} placeholder="사번" autoFocus />
                <Field label="비밀번호" value={pw} onChange={setPw} placeholder="비밀번호" type="password" />
              </>
            )}
            <button
              type="submit"
              disabled={busy}
              className="mt-2 w-full rounded-xl bg-primary py-3 text-[15px] font-black text-white transition hover:brightness-110 disabled:opacity-60"
            >
              {busy ? "확인 중…" : "로그인"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg py-2 text-[14px] font-bold transition ${active ? "bg-primary text-white shadow" : "text-muted-foreground hover:text-foreground"}`}
    >
      {children}
    </button>
  );
}

function Field({ label, value, onChange, placeholder, type = "text", autoFocus }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-semibold text-foreground">{label}</span>
      <input
        type={type}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-border bg-background px-4 py-3 text-[15px] outline-none focus:border-primary"
      />
    </label>
  );
}
