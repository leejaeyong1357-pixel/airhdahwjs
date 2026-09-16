import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminListEvaluations, adminResetEvaluations } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/evaluations")({
  component: AdminEvals,
});

function AdminEvals() {
  const fn = useServerFn(adminListEvaluations);
  const resetFn = useServerFn(adminResetEvaluations);
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["admin", "evals"], queryFn: () => fn() });

  const resetMut = useMutation({
    mutationFn: () => resetFn(),
    onSuccess: (r: any) => {
      toast.success(`평가 ${r.removed}건을 초기화했습니다. (좋아요는 유지)`);
      qc.invalidateQueries({ queryKey: ["admin", "evals"] });
      qc.invalidateQueries({ queryKey: ["admin", "rankings"] });
      qc.invalidateQueries({ queryKey: ["myEvals"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          전체 평가 내역입니다. <span className="font-semibold text-foreground">총 {data.length}건</span>
        </div>
        <Button
          variant="outline"
          className="border-destructive/40 text-destructive hover:bg-destructive/5 hover:text-destructive"
          disabled={resetMut.isPending || data.length === 0}
          onClick={() => {
            if (confirm("평가 내역을 전부 초기화할까요?\n좋아요 수는 그대로 유지되고, 평가 점수만 모두 삭제됩니다.")) {
              resetMut.mutate();
            }
          }}
        >
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> 평가 전체 초기화 (좋아요 유지)
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs">
            <tr>
              <Th>일시</Th><Th>작품</Th><Th>제출자</Th><Th>심사위원</Th>
              <Th className="text-right">혁신성</Th><Th className="text-right">완성도</Th><Th className="text-right">활용도</Th><Th className="text-right">합계</Th>
            </tr>
          </thead>
          <tbody>
            {data.map((e: any) => {
              const total = e.innovation + e.completeness + e.utilization;
              return (
                <tr key={e.id} className="border-t border-border">
                  <Td className="text-xs text-muted-foreground">{formatDate(e.created_at)}</Td>
                  <Td className="font-semibold">{e.submissions?.title}</Td>
                  <Td className="text-xs">
                    {e.author ? (
                      <>
                        <span className="font-semibold text-foreground">{e.author.name}</span>
                        <span className="text-muted-foreground"> {e.author.position}</span>
                        {e.author.team ? <div className="text-muted-foreground">{e.author.team}</div> : null}
                      </>
                    ) : <span className="text-muted-foreground">—</span>}
                  </Td>
                  <Td>{e.profiles?.team} · {e.profiles?.name} {e.profiles?.position}</Td>
                  <Td className="text-right">{e.innovation}</Td>
                  <Td className="text-right">{e.completeness}</Td>
                  <Td className="text-right">{e.utilization}</Td>
                  <Td className="text-right font-bold text-primary">{total}</Td>
                </tr>
              );
            })}
            {data.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-sm text-muted-foreground">평가 기록이 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, className }: any) { return <th className={`px-4 py-2.5 text-left ${className ?? ""}`}>{children}</th>; }
function Td({ children, className }: any) { return <td className={`px-4 py-2.5 ${className ?? ""}`}>{children}</td>; }
