import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminListJudges, adminListBanRoster, adminSetBan } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Gavel, EyeOff, Eye, Search, Shield } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/judging")({
  component: AdminJudging,
});

function AdminJudging() {
  const judgesFn = useServerFn(adminListJudges);
  const rosterFn = useServerFn(adminListBanRoster);
  const setBanFn = useServerFn(adminSetBan);
  const qc = useQueryClient();

  const { data: judges = [] } = useQuery({ queryKey: ["admin", "judges"], queryFn: () => judgesFn() });
  const { data: roster = [] } = useQuery({ queryKey: ["admin", "banRoster"], queryFn: () => rosterFn() });
  const [q, setQ] = useState("");

  const setBanMut = useMutation({
    mutationFn: (v: { empNo: string; banned: boolean }) => setBanFn({ data: v }),
    onSuccess: (_r, v) => {
      toast.success(v.banned ? "평가 대상에서 제외했습니다." : "제외를 해제했습니다.");
      qc.invalidateQueries({ queryKey: ["admin", "banRoster"] });
      qc.invalidateQueries({ queryKey: ["bannedFromJudges"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const bannedCount = roster.filter((r: any) => r.banned).length;
  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (!k) return roster;
    return roster.filter((r: any) =>
      `${r.name} ${r.team} ${r.position} ${r.empNo}`.toLowerCase().includes(k),
    );
  }, [roster, q]);

  return (
    <div className="space-y-10">
      {/* 평가자(심사위원) 명단 */}
      <section>
        <div className="flex items-center gap-2">
          <Gavel className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-black tracking-tight">평가자(심사위원) 명단</h2>
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[13px] font-bold text-primary">{judges.length}명</span>
        </div>
        <p className="mt-1 text-[13px] text-muted-foreground">DB 파일의 ‘평가자’ 항목에 등록된 인원입니다.</p>
        <div className="mt-3 overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs">
              <tr><Th>이름</Th><Th>팀</Th><Th>직급</Th><Th>사번</Th><Th>권한</Th></tr>
            </thead>
            <tbody>
              {judges.map((j: any) => (
                <tr key={j.empNo} className="border-t border-border">
                  <Td className="font-semibold">{j.name}</Td>
                  <Td>{j.team || "—"}</Td>
                  <Td>{j.position || "—"}</Td>
                  <Td className="font-mono text-xs">{j.empNo}</Td>
                  <Td>
                    {j.alsoAdmin && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-bold text-accent">
                        <Shield className="h-3 w-3" /> 관리자 겸직
                      </span>
                    )}
                  </Td>
                </tr>
              ))}
              {judges.length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-sm text-muted-foreground">등록된 평가자가 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 평가 제외(밴) 관리 */}
      <section>
        <div className="flex flex-wrap items-center gap-2">
          <EyeOff className="h-5 w-5 text-destructive" />
          <h2 className="text-lg font-black tracking-tight">팀장 평가 제외 관리</h2>
          <span className="rounded-full bg-destructive/10 px-2.5 py-0.5 text-[13px] font-bold text-destructive">제외 {bannedCount}명</span>
          <div className="relative ml-auto">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="이름 · 팀 · 사번 검색"
              className="w-60 rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm"
            />
          </div>
        </div>
        <p className="mt-1 text-[13px] text-muted-foreground">
          제외한 인원의 작품은 평가자(팀장) 화면과 접수 현황에서 숨겨지고, 평가할 수 없습니다. (관리자에게는 보입니다.)
        </p>
        <div className="mt-3 overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs">
              <tr><Th>상태</Th><Th>이름</Th><Th>팀</Th><Th>직급</Th><Th>사번</Th><Th className="text-right">평가 노출</Th></tr>
            </thead>
            <tbody>
              {filtered.map((r: any) => (
                <tr key={r.empNo} className={`border-t border-border ${r.banned ? "bg-destructive/5" : ""}`}>
                  <Td>
                    {r.banned ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-bold text-destructive">
                        <EyeOff className="h-3 w-3" /> 제외됨
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-600">
                        <Eye className="h-3 w-3" /> 노출
                      </span>
                    )}
                  </Td>
                  <Td className="font-semibold">{r.name}</Td>
                  <Td>{r.team || "—"}</Td>
                  <Td>{r.position || "—"}</Td>
                  <Td className="font-mono text-xs">{r.empNo}</Td>
                  <Td className="text-right">
                    <Button
                      size="sm"
                      variant={r.banned ? "outline" : "ghost"}
                      disabled={setBanMut.isPending}
                      onClick={() => setBanMut.mutate({ empNo: r.empNo, banned: !r.banned })}
                      className={r.banned ? "" : "text-destructive hover:text-destructive"}
                    >
                      {r.banned ? "제외 해제" : "평가 제외"}
                    </Button>
                  </Td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center text-sm text-muted-foreground">검색 결과가 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Th({ children, className }: any) { return <th className={`px-4 py-2.5 text-left ${className ?? ""}`}>{children}</th>; }
function Td({ children, className }: any) { return <td className={`px-4 py-3 align-middle ${className ?? ""}`}>{children}</td>; }
