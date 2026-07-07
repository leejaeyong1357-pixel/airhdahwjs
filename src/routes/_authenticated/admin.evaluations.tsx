import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminListEvaluations } from "@/lib/admin.functions";
import { formatDate } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/evaluations")({
  component: AdminEvals,
});

function AdminEvals() {
  const fn = useServerFn(adminListEvaluations);
  const { data = [] } = useQuery({ queryKey: ["admin", "evals"], queryFn: () => fn() });

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs">
          <tr>
            <Th>일시</Th><Th>작품</Th><Th>심사위원</Th><Th className="text-right">혁신성</Th><Th className="text-right">완성도</Th><Th className="text-right">활용도</Th><Th className="text-right">합계</Th>
          </tr>
        </thead>
        <tbody>
          {data.map((e: any) => {
            const total = e.innovation + e.completeness + e.utilization;
            return (
              <tr key={e.id} className="border-t border-border">
                <Td className="text-xs text-muted-foreground">{formatDate(e.created_at)}</Td>
                <Td className="font-semibold">{e.submissions?.title}</Td>
                <Td>{e.profiles?.team} · {e.profiles?.name} {e.profiles?.position}</Td>
                <Td className="text-right">{e.innovation}</Td>
                <Td className="text-right">{e.completeness}</Td>
                <Td className="text-right">{e.utilization}</Td>
                <Td className="text-right font-bold text-primary">{total}</Td>
              </tr>
            );
          })}
          {data.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-sm text-muted-foreground">평가 기록이 없습니다.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, className }: any) { return <th className={`px-4 py-2.5 text-left ${className ?? ""}`}>{children}</th>; }
function Td({ children, className }: any) { return <td className={`px-4 py-2.5 ${className ?? ""}`}>{children}</td>; }
