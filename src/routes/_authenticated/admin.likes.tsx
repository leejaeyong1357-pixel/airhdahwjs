import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminListLikes } from "@/lib/admin.functions";
import { formatDate } from "@/lib/utils";
import { Heart, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/likes")({
  component: AdminLikes,
});

function AdminLikes() {
  const fn = useServerFn(adminListLikes);
  const { data = [] } = useQuery({ queryKey: ["admin", "likes"], queryFn: () => fn() });
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (!k) return data;
    return data.filter((l: any) =>
      `${l.likerName} ${l.likerTeam} ${l.likerEmpNo} ${l.submissionTitle} ${l.submissionAuthor}`
        .toLowerCase()
        .includes(k),
    );
  }, [data, q]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          누가 어떤 작품에 좋아요를 눌렀는지 전체 내역입니다. (관리자 전용)
          <span className="ml-2 font-semibold text-foreground">총 {data.length}건</span>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="이름 · 작품 · 팀 검색"
            className="w-64 rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs">
            <tr>
              <Th>일시</Th>
              <Th>좋아요 누른 사람</Th>
              <Th></Th>
              <Th>받은 작품</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((l: any) => (
              <tr key={l.key} className="border-t border-border">
                <Td className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(l.createdAt)}</Td>
                <Td>
                  <div className="font-semibold text-foreground">{l.likerName} <span className="font-normal text-muted-foreground">{l.likerPosition}</span></div>
                  <div className="text-xs text-muted-foreground">{l.likerTeam}{l.likerTeam ? " · " : ""}사번 {l.likerEmpNo}</div>
                </Td>
                <Td className="text-center text-rose-500">
                  <Heart className="mx-auto h-4 w-4 fill-rose-500" />
                </Td>
                <Td>
                  <div className="font-semibold text-foreground">{l.submissionTitle}</div>
                  <div className="text-xs text-muted-foreground">{l.submissionAuthor}</div>
                </Td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="p-8 text-center text-sm text-muted-foreground">
                  {data.length === 0 ? "아직 좋아요 내역이 없습니다." : "검색 결과가 없습니다."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children }: any) { return <th className="px-4 py-2.5 text-left font-semibold">{children}</th>; }
function Td({ children, className }: any) { return <td className={`px-4 py-3 align-top ${className ?? ""}`}>{children}</td>; }
