import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminLayout,
});

const tabs = [
  { to: "/admin", label: "대시보드", exact: true },
  { to: "/admin/users", label: "사용자" },
  { to: "/admin/teams", label: "실/팀" },
  { to: "/admin/evaluations", label: "평가 내역" },
  { to: "/admin/rankings", label: "순위" },
];

function AdminLayout() {
  const [role, setRole] = useState<string | null>(null);
  const loc = useLocation();
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return setRole("participant");
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      setRole((data?.[0] as any)?.role ?? "participant");
    })();
  }, []);
  if (role === null) return <div className="p-12 text-center text-muted-foreground">확인 중…</div>;
  if (role !== "admin") {
    return (
      <div className="mx-auto max-w-2xl p-12 text-center">
        <AlertCircle className="mx-auto h-10 w-10 text-destructive" />
        <div className="mt-4 text-lg font-semibold">관리자 전용 페이지입니다.</div>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <div className="flex flex-col gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-accent">ADMIN</div>
        <h1 className="text-3xl font-bold tracking-tight">관리자 대시보드</h1>
      </div>
      <nav className="mt-6 flex flex-wrap gap-1 border-b border-border">
        {tabs.map((t) => {
          const active = t.exact ? loc.pathname === t.to : loc.pathname.startsWith(t.to);
          return (
            <Link key={t.to} to={t.to} className={cn(
              "border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
            )}>{t.label}</Link>
          );
        })}
      </nav>
      <div className="mt-8"><Outlet /></div>
    </div>
  );
}
