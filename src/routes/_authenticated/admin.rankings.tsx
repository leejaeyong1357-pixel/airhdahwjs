import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminGetRankings } from "@/lib/admin.functions";
import { Trophy, Medal } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/rankings")({
  component: AdminRankings,
});

function AdminRankings() {
  const fn = useServerFn(adminGetRankings);
  const { data = [] } = useQuery({ queryKey: ["admin", "rankings"], queryFn: () => fn() });

  return (
    <div className="space-y-4">
      <div className="text-xs text-muted-foreground">
        최종점수 = 임원 평균 점수(90 만점 → 100 정규화) × 80% + 좋아요 점수(정규화) × 20%
      </div>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs">
            <tr>
              <Th className="w-16">순위</Th><Th>작품</Th><Th>지원자</Th>
              <Th className="text-right">심사수</Th><Th className="text-right">임원평균</Th><Th className="text-right">좋아요</Th><Th className="text-right">최종점수</Th>
            </tr>
          </thead>
          <tbody>
            {data.map((r: any) => (
              <tr key={r.submissionId} className={`border-t border-border ${r.rank <= 3 ? "bg-amber-50/30" : ""}`}>
                <Td>
                  <span className="inline-flex items-center gap-1 font-bold">
                    {r.rank === 1 && <Trophy className="h-4 w-4 text-yellow-500" />}
                    {r.rank === 2 && <Medal className="h-4 w-4 text-zinc-400" />}
                    {r.rank === 3 && <Medal className="h-4 w-4 text-orange-500" />}
                    {r.rank}
                  </span>
                </Td>
                <Td className="font-semibold">{r.title}</Td>
                <Td className="text-muted-foreground">{r.author?.team} · {r.author?.name} {r.author?.position}</Td>
                <Td className="text-right">{r.judgeCount}</Td>
                <Td className="text-right">{r.judgeAvg} / 90</Td>
                <Td className="text-right">{r.likeCount}</Td>
                <Td className="text-right"><span className="text-lg font-bold text-primary">{r.final}</span></Td>
              </tr>
            ))}
            {data.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-sm text-muted-foreground">아직 순위가 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, className }: any) { return <th className={`px-4 py-2.5 text-left ${className ?? ""}`}>{children}</th>; }
function Td({ children, className }: any) { return <td className={`px-4 py-2.5 ${className ?? ""}`}>{children}</td>; }
