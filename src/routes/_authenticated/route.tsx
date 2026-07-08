import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/demo";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    const lu = getLocalUser();
    if (lu?.mustChangePassword || lu?.needsConsent) throw redirect({ to: "/change-password" });
    return { user: data.user };
  },
  component: () => <Outlet />,
});
