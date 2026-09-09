import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  axGetOrgBoard, axAdminSetGoal, axAdminListWorks, axAdminSetStage, axAdminListRequests, axAdminSetRequestStatus,
} from "@/lib/ax-lab.functions";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { Target, ListChecks, ClipboardList, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/axlab")({ component: AdminAxLab });

const STATUS_LABEL: Record<string, string> = {
  requested: "신청 완료", reviewing: "AX협의체 검토중", security: "보안검증중",
  approved: "승인", saas: "SaaS 등록 완료", rejected: "반려",
};

function AdminAxLab() {
  const qc = useQueryClient();
  const boardFn = useServerFn(axGetOrgBoard);
  const setGoalFn = useServerFn(axAdminSetGoal);
  const worksFn = useServerFn(axAdminListWorks);
  const setStageFn = useServerFn(axAdminSetStage);
  const reqFn = useServerFn(axAdminListRequests);
  const setReqStatusFn = useServerFn(axAdminSetRequestStatus);

  const { data: board = [] } = useQuery({ queryKey: ["admin", "ax", "board"], queryFn: () => boardFn() });
  const { data: works = [] } = useQuery({ queryKey: ["admin", "ax", "works"], queryFn: () => worksFn() });
  const { data: requests = [] } = useQuery({ queryKey: ["admin", "ax", "requests"], queryFn: () => reqFn() });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "ax"] });
  const goalMut = useMutation({
    mutationFn: (v: { sil: string; goal: number }) => setGoalFn({ data: v }),
    onSuccess: invalidate, onError: (e: any) => toast.error(e.message),
  });
  const stageMut = useMutation({
    mutationFn: (v: { workId: string; stage: 1 | 2 | 3 | null }) => setStageFn({ data: v }),
    onSuccess: invalidate, onError: (e: any) => toast.error(e.message),
  });
  const statusMut = useMutation({
    mutationFn: (v: { requestId: string; status: string }) => setReqStatusFn({ data: v }),
    onSuccess: invalidate, onError: (e: any) => toast.error(e.message),
  });

  const [q, setQ] = useState("");
  const filteredWorks = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (!k) return works;
    return works.filter((w: any) => `${w.title} ${w.authorName} ${w.authorTeam}`.toLowerCase().includes(k));
  }, [works, q]);

  return (
    <div className="space-y-12">
      {/* 실별 고도화 목표 */}
      <section>
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-black tracking-tight">실별 고도화 목표 관리</h2>
        </div>
        <p className="mt-1 text-[13px] text-muted-foreground">실별 전체 작품·단계별 분류·신청·승인 현황과 함께, 고도화 목표 건수를 직접 입력합니다.</p>
        <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/50 text-xs">
              <tr>
                <Th>실</Th><Th className="text-right">전체</Th><Th className="text-right">1단계</Th>
                <Th className="text-right">2단계</Th><Th className="text-right">3단계</Th>
                <Th className="text-right">목표</Th><Th className="text-right">신청</Th><Th className="text-right">승인</Th>
              </tr>
            </thead>
            <tbody>
              {board.map((g: any) => (
                <tr key={g.sil} className="border-t border-border">
                  <Td className="font-bold">{g.sil}{g.isDept && <span className="ml-1.5 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">부서</span>}</Td>
                  <Td className="text-right tabular-nums">{g.total}</Td>
                  <Td className="text-right tabular-nums text-muted-foreground">{g.stage1}</Td>
                  <Td className="text-right tabular-nums text-amber-600 font-semibold">{g.stage2}</Td>
                  <Td className="text-right tabular-nums text-emerald-600 font-semibold">{g.stage3}</Td>
                  <Td className="text-right">
                    <input
                      type="number" min={0} defaultValue={g.goal}
                      onBlur={(e) => { const v = Number(e.target.value) || 0; if (v !== g.goal) goalMut.mutate({ sil: g.sil, goal: v }); }}
                      className="w-16 rounded-lg border border-border bg-background px-2 py-1 text-right text-sm"
                    />
                  </Td>
                  <Td className="text-right tabular-nums font-bold text-primary">{g.requested}</Td>
                  <Td className="text-right tabular-nums font-bold text-emerald-600">{g.approved}</Td>
                </tr>
              ))}
              {board.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-sm text-muted-foreground">데이터가 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {/* 작품 1/2/3단계 분류 */}
      <section>
        <div className="flex flex-wrap items-center gap-2">
          <ListChecks className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-black tracking-tight">작품 단계 분류</h2>
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[13px] font-bold text-primary">총 {works.length}건</span>
          <div className="relative ml-auto">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="작품명 · 이름 · 팀 검색" className="w-60 rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm" />
          </div>
        </div>
        <div className="mt-3 max-h-[520px] overflow-y-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted text-xs">
              <tr><Th>작품</Th><Th>제출자</Th><Th>구분</Th><Th className="w-[220px]">단계 지정</Th></tr>
            </thead>
            <tbody>
              {filteredWorks.map((w: any) => (
                <tr key={w.id} className="border-t border-border">
                  <Td className="font-semibold">{w.title}</Td>
                  <Td className="text-xs text-muted-foreground">{w.authorTeam} · {w.authorName} {w.authorPosition}</Td>
                  <Td className="text-xs">{w.source === "contest" ? "경진대회" : "신규 등록"}</Td>
                  <Td>
                    <select
                      value={w.stage ?? ""}
                      onChange={(e) => stageMut.mutate({ workId: w.id, stage: e.target.value ? (Number(e.target.value) as 1 | 2 | 3) : null })}
                      className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-[13px]"
                    >
                      <option value="">미분류</option>
                      <option value="1">1단계 · 제외·보류</option>
                      <option value="2">2단계 · 고도화 대상</option>
                      <option value="3">3단계 · 즉시 적용</option>
                    </select>
                  </Td>
                </tr>
              ))}
              {filteredWorks.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-sm text-muted-foreground">작품이 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {/* 고도화 신청 검토 */}
      <section>
        <div className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-black tracking-tight">고도화 신청 검토</h2>
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[13px] font-bold text-primary">총 {requests.length}건</span>
        </div>
        <div className="mt-3 overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs">
              <tr><Th>신청일</Th><Th>작품</Th><Th>제출자</Th><Th className="w-[200px]">상태</Th></tr>
            </thead>
            <tbody>
              {requests.map((r: any) => (
                <tr key={r.id} className="border-t border-border">
                  <Td className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(r.createdAt)}</Td>
                  <Td className="font-semibold">{r.title}</Td>
                  <Td className="text-xs text-muted-foreground">{r.authorTeam} · {r.authorName}</Td>
                  <Td>
                    <select
                      value={r.status}
                      onChange={(e) => statusMut.mutate({ requestId: r.id, status: e.target.value })}
                      className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-[13px]"
                    >
                      {Object.entries(STATUS_LABEL).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                    </select>
                  </Td>
                </tr>
              ))}
              {requests.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-sm text-muted-foreground">아직 고도화 신청이 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Th({ children, className }: any) { return <th className={`px-3 py-2.5 text-left font-semibold ${className ?? ""}`}>{children}</th>; }
function Td({ children, className }: any) { return <td className={`px-3 py-2.5 ${className ?? ""}`}>{children}</td>; }
