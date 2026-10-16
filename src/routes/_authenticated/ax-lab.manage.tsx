import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { getLocalUser } from "@/integrations/supabase/demo";
import { isAxLabAdminViewer } from "@/lib/ax-lab";
import { AdminAxLabView } from "@/components/AdminAxLabView";
import { AlertCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/ax-lab/manage")({ component: AxLabManage });

function AxLabManage() {
  // localStorage 는 서버에서 읽을 수 없다. 그리기 도중에 읽으면 SSR 결과와
  // 어긋나 "권한 없음"이 잠깐 번쩍이므로, 마운트된 뒤에 확인한다.
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    const user = getLocalUser();
    setAllowed(isAxLabAdminViewer(user?.empNo) || !!user?.roles?.includes("admin"));
  }, []);

  if (allowed === null) {
    return <div className="p-16 text-center text-sm text-slate-400">불러오는 중…</div>;
  }

  if (!allowed) {
    return (
      <div className="mx-auto max-w-2xl p-16 text-center">
        <AlertCircle className="mx-auto h-10 w-10 text-destructive" />
        <div className="mt-4 text-lg font-semibold">열람 권한이 없습니다.</div>
        <p className="mt-1.5 text-sm text-slate-500">
          AX협의체 인원과 관리자만 볼 수 있는 화면입니다.
        </p>
      </div>
    );
  }

  return <AdminAxLabView />;
}
