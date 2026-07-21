import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { getLocalUser } from "@/integrations/supabase/demo";

export const Route = createFileRoute("/")({ component: Index });

function Index() {
  const nav = useNavigate();
  useEffect(() => {
    const u = getLocalUser();
    if (!u) nav({ to: "/auth", replace: true });
    else if (u.roles?.includes("admin")) nav({ to: "/control", replace: true });
    else nav({ to: "/live", replace: true });
  }, [nav]);
  return <div className="grid min-h-screen place-items-center text-muted-foreground">불러오는 중…</div>;
}
