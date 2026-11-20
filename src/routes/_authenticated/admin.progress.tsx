import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminJudgeProgress } from "@/lib/admin.functions";
import { CheckCircle2, AlertTriangle, ChevronDown } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/progress")({
  component: AdminProgress,
});

function AdminProgress() {
  const fn = useServerFn(adminJudgeProgress);
  const { data = [] } = useQuery({ queryKey: ["admin", "judgeProgress"], queryFn: () => fn() });
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const stats = useMemo(() => {
    const totalJudges = data.length;
    const doneJudges = data.filter((r: any) => r.assigned > 0 && r.remaining === 0).length;
    const notStarted = data.filter((r: any) => r.assigned > 0 && r.done === 0).length;
    const remainSum = data.reduce((a: number, r: any) => a + r.remaining, 0);
    return { totalJudges, doneJudges, notStarted, remainSum };
  }, [data]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="평가자" value={stats.totalJudges} unit="명" tone="slate" />
        <Stat label="완료한 평가자" value={stats.doneJudges} unit="명" tone="emerald" />
        <Stat label="아직 안 한 평가자" value={stats.notStarted} unit="명" tone="rose" />
        <Stat label="남은 심사 건수" value={stats.remainSum} unit="건" tone="amber" />
      </div>

      <div className="overflow-auto rounded-xl border border-border bg-card" style={{ maxHeight: "68vh" }}>
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-muted text-xs">
            <tr>
              <Th>평가자</Th>
              <Th>담당 실</Th>
              <Th className="text-center">진행</Th>
              <Th className="w-[42%]">진행률</Th>
              <Th className="text-right">남음</Th>
              <Th className="w-10"></Th>
            </tr>
          </thead>
          <tbody>
            {data.map((r: any) => {
              const pct = r.assigned ? Math.round((r.done / r.assigned) * 100) : 0;
              const complete = r.assigned > 0 && r.remaining === 0;
              const none = r.done === 0 && r.assigned > 0;
              const expanded = open.has(r.empNo);
              return (
                <Fragment key={r.empNo}>
                  <tr
                    className={`border-t border-border ${r.remaining > 0 ? "cursor-pointer hover:bg-muted/40" : ""} ${none ? "bg-rose-50/50" : ""}`}
                    onClick={() => r.remaining > 0 && toggle(r.empNo)}
                  >
                    <Td>
                      <div className="font-semibold text-foreground">
                        {r.name} <span className="font-normal text-muted-foreground">{r.position}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">{r.team}</div>
                    </Td>
                    <Td className="text-muted-foreground">{r.sil || "—"}</Td>
                    <Td className="text-center whitespace-nowrap tabular-nums">
                      <span className="font-bold text-foreground">{r.done}</span>
                      <span className="text-muted-foreground"> / {r.assigned}</span>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-full rounded-full ${complete ? "bg-emerald-500" : none ? "bg-rose-400" : "bg-amber-400"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{pct}%</span>
                      </div>
                    </Td>
                    <Td className="text-right">
                      {complete ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600">
                          <CheckCircle2 className="h-3.5 w-3.5" /> 완료
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-black text-rose-600">
                          <AlertTriangle className="h-3.5 w-3.5" /> {r.remaining}건
                        </span>
                      )}
                    </Td>
                    <Td className="text-center">
                      {r.remaining > 0 && (
                        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
                      )}
                    </Td>
                  </tr>
                  {expanded && r.remainingWorks.length > 0 && (
                    <tr className="border-t border-border bg-muted/20">
                      <td colSpan={6} className="px-6 py-3">
                        <div className="mb-2 text-[13px] font-bold text-rose-700">아직 심사 안 한 작품 ({r.remainingWorks.length})</div>
                        <div className="flex flex-wrap gap-2">
                          {r.remainingWorks.map((w: any, i: number) => (
                            <span key={i} className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1 text-[12.5px]">
                              <b className="text-foreground">{w.title}</b>
                              <span className="text-muted-foreground">— {w.authorTeam} {w.authorName}</span>
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {data.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-sm text-muted-foreground">평가자가 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="text-[12px] text-muted-foreground">미완료 평가자(빨간 줄) 행을 클릭하면 아직 심사하지 않은 작품이 펼쳐집니다.</div>
    </div>
  );
}

function Stat({ label, value, unit, tone }: { label: string; value: number; unit: string; tone: string }) {
  const tones: Record<string, string> = {
    slate: "border-border bg-muted/40 text-foreground",
    emerald: "border-emerald-500/20 bg-emerald-500/5 text-emerald-600",
    rose: "border-rose-500/20 bg-rose-500/5 text-rose-600",
    amber: "border-amber-500/20 bg-amber-500/5 text-amber-600",
  };
  return (
    <div className={`rounded-xl border p-4 ${tones[tone]}`}>
      <div className="text-[13px] font-semibold">{label}</div>
      <div className="mt-1 text-3xl font-black text-foreground tabular-nums">
        {value}<span className="ml-1 text-base font-bold text-muted-foreground">{unit}</span>
      </div>
    </div>
  );
}

function Th({ children, className }: any) { return <th className={`px-4 py-2.5 text-left font-semibold ${className ?? ""}`}>{children}</th>; }
function Td({ children, className }: any) { return <td className={`px-4 py-2.5 ${className ?? ""}`}>{children}</td>; }
