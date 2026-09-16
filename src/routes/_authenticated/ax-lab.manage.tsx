import { createFileRoute } from "@tanstack/react-router";
import { getLocalUser } from "@/integrations/supabase/demo";
import { isAxLabAdminViewer } from "@/lib/ax-lab";
import { AdminAxLabView } from "@/components/AdminAxLabView";
import { AlertCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/ax-lab/manage")({ component: AxLabManage });

function AxLabManage() {
  const user = getLocalUser();
  const allowed = isAxLabAdminViewer(user?.empNo) || user?.roles?.includes("admin");

  if (!allowed) {
    return (
      <div className="mx-auto max-w-2xl p-16 text-center">
        <AlertCircle className="mx-auto h-10 w-10 text-destructive" />
        <div className="mt-4 text-lg font-semibold">열람 권한이 없습니다.</div>
      </div>
    );
  }

  return <AdminAxLabView />;
}
