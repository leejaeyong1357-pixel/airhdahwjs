import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { axListWorksBy } from "@/lib/ax-lab.functions";
import { AxWorkCard, AxWorkDetailDialog } from "@/components/AxWorkDetailDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronDown, ChevronRight } from "lucide-react";

type Filter = "all" | "stage3" | "requested" | "approved";
type Pick = { scope: "sil" | "team"; name: string; filter: Filter; title: string };

const sum = (rows: any[], key: string) => rows.reduce((a: number, r: any) => a + (r[key] ?? 0), 0);

/** 실별/팀별 고도화 현황 표 — 숫자를 누르면 해당 작품 목록이 열린다. */
export function AxOrgBoard({ board }: { board: any[] }) {
  const listByFn = useServerFn(axListWorksBy);

  const [tab, setTab] = useState<"sil" | "team">("sil");
  const [silFilter, setSilFilter] = useState("전체 실");
  const [openSils, setOpenSils] = useState<Set<string>>(new Set());
  const [pick, setPick] = useState<Pick | null>(null);
  const [detail, setDetail] = useState<any | null>(null);

  const toggleSil = (sil: string) =>
    setOpenSils((prev) => {
      const next = new Set(prev);
      if (next.has(sil)) next.delete(sil);
      else next.add(sil);
      return next;
    });

  const { data: pickWorks = [], isFetching } = useQuery({
    queryKey: ["axWorksBy", pick?.scope, pick?.name, pick?.filter],
    queryFn: () => listByFn({ data: { scope: pick!.scope, name: pick!.name, filter: pick!.filter } }),
    enabled: !!pick,
  });

  const flatTeams = useMemo(
    () => board.flatMap((g: any) => g.teams.map((t: any) => ({ ...t, sil: g.sil }))),
    [board],
  );
  const visibleSils = silFilter === "전체 실" ? board : board.filter((g: any) => g.sil === silFilter);
  const visibleTeams = silFilter === "전체 실" ? flatTeams : flatTeams.filter((t: any) => t.sil === silFilter);

  const open = (scope: "sil" | "team", name: string, filter: Filter, what: string) =>
    setPick({ scope, name, filter, title: `${name} · ${what}` });

  const cells = (row: any, scope: "sil" | "team") => {
    const key = scope === "sil" ? row.sil : row.team;
    return (
      <>
        <NumCell value={row.total} onPick={() => open(scope, key, "all", "전체 작품")} />
        <NumCell value={row.stage3} onPick={() => open(scope, key, "stage3", "고도화 대상")} />
        <NumCell value={row.requested} pill onPick={() => open(scope, key, "requested", "고도화 신청")} />
        <NumCell value={row.approved} tone="text-emerald-600" onPick={() => open(scope, key, "approved", "승인")} />
      </>
    );
  };

  return (
    <section className="rounded-2xl border border-[#e9ecf2] bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[19px] font-black tracking-tight text-slate-900">실별 고도화 현황</h2>
          <p className="mt-1 text-[13px] text-slate-400">실을 선택하면 해당 실의 현황을 확인할 수 있습니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-xl bg-[#f1f4f9] p-1">
            {(["sil", "team"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`rounded-lg px-3 py-1.5 text-[13px] font-bold transition ${
                  tab === k ? "bg-[#eef4ff] text-blue-600" : "text-slate-400 hover:text-slate-600"
                }`}
              >
                {k === "sil" ? "실별 현황" : "팀별 현황"}
              </button>
            ))}
          </div>
          <select
            value={silFilter}
            onChange={(e) => setSilFilter(e.target.value)}
            className="rounded-xl border border-[#e3e8f0] bg-white px-3 py-2 text-[13px] font-semibold text-slate-600"
          >
            <option>전체 실</option>
            {board.map((g: any) => <option key={g.sil}>{g.sil}</option>)}
          </select>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-[#eef1f6]">
        {tab === "sil" ? (
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-[#f7f9fc] text-slate-400">
              <tr>
                <Th className="w-8"></Th>
                <Th className="text-left">실</Th>
                <Th>전체 작품</Th>
                <Th>고도화 대상</Th>
                <Th>신청</Th>
                <Th>승인</Th>
              </tr>
            </thead>
            <tbody>
              {visibleSils.map((g: any) => {
                const expanded = openSils.has(g.sil);
                return (
                  <Fragment key={g.sil}>
                    <tr className="cursor-pointer border-t border-[#eef1f6] hover:bg-[#fafbfd]" onClick={() => toggleSil(g.sil)}>
                      <Td className="w-8 text-slate-300">
                        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </Td>
                      <Td className="font-bold text-slate-800">{g.sil}</Td>
                      {cells(g, "sil")}
                    </tr>
                    {expanded && g.teams.map((t: any) => (
                      <tr key={g.sil + t.team} className="border-t border-[#f1f4f9] bg-[#fafbfd] text-[13px]">
                        <Td></Td>
                        <Td>
                          <button
                            onClick={() => open("team", t.team, "all", "전체 작품")}
                            className="rounded-md px-1 py-0.5 font-semibold text-slate-500 underline-offset-4 hover:bg-slate-100 hover:underline"
                          >
                            └ {t.team}
                          </button>
                        </Td>
                        {cells(t, "team")}
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
              {visibleSils.length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center text-sm text-slate-400">데이터가 없습니다.</td></tr>
              )}
              <tr className="border-t border-[#e9ecf2] bg-[#f7f9fc]">
                <Td></Td>
                <Td className="font-black text-slate-800">합계</Td>
                <TotalCell value={sum(visibleSils, "total")} />
                <TotalCell value={sum(visibleSils, "stage3")} />
                <TotalCell value={sum(visibleSils, "requested")} pill />
                <TotalCell value={sum(visibleSils, "approved")} />
              </tr>
            </tbody>
          </table>
        ) : (
          <table className="w-full min-w-[620px] text-sm">
            <thead className="bg-[#f7f9fc] text-slate-400">
              <tr>
                <Th className="text-left">소속 실</Th>
                <Th className="text-left">팀</Th>
                <Th>전체 작품</Th>
                <Th>고도화 대상</Th>
                <Th>신청</Th>
                <Th>승인</Th>
              </tr>
            </thead>
            <tbody>
              {visibleTeams.map((t: any) => (
                <tr key={t.sil + t.team} className="border-t border-[#eef1f6] hover:bg-[#fafbfd]">
                  <Td className="text-slate-400">{t.sil}</Td>
                  <Td>
                    <button
                      onClick={() => open("team", t.team, "all", "전체 작품")}
                      className="rounded-md px-1 py-0.5 font-bold text-slate-800 underline-offset-4 hover:bg-slate-100 hover:underline"
                    >
                      {t.team}
                    </button>
                  </Td>
                  {cells(t, "team")}
                </tr>
              ))}
              {visibleTeams.length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center text-sm text-slate-400">데이터가 없습니다.</td></tr>
              )}
              <tr className="border-t border-[#e9ecf2] bg-[#f7f9fc]">
                <Td></Td>
                <Td className="font-black text-slate-800">합계</Td>
                <TotalCell value={sum(visibleTeams, "total")} />
                <TotalCell value={sum(visibleTeams, "stage3")} />
                <TotalCell value={sum(visibleTeams, "requested")} pill />
                <TotalCell value={sum(visibleTeams, "approved")} />
              </tr>
            </tbody>
          </table>
        )}
      </div>

      {/* 숫자 클릭 → 해당 작품 목록 */}
      <Dialog open={!!pick} onOpenChange={(o) => !o && setPick(null)}>
        <DialogContent className="max-h-[80vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{pick?.title} {!isFetching && `· ${pickWorks.length}건`}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3">
            {pickWorks.map((w: any) => (
              <AxWorkCard key={w.id} work={w} onClick={() => { setPick(null); setDetail(w); }} />
            ))}
            {!isFetching && pickWorks.length === 0 && (
              <div className="col-span-full p-6 text-center text-sm text-muted-foreground">작품이 없습니다.</div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AxWorkDetailDialog work={detail} onClose={() => setDetail(null)} />
    </section>
  );
}

function NumCell({ value, tone, onPick, pill }: { value: number; tone?: string; onPick?: () => void; pill?: boolean }) {
  if (!value) {
    return <td className="px-3 py-3 text-center"><span className="px-2 font-semibold tabular-nums text-slate-300">0</span></td>;
  }
  return (
    <td className="px-3 py-3 text-center">
      <button
        onClick={(e) => { e.stopPropagation(); onPick?.(); }}
        className={
          pill
            ? "rounded-full bg-[#eef4ff] px-3 py-1 font-bold tabular-nums text-blue-600 transition hover:bg-[#dde8fb]"
            : `rounded-md px-2 py-0.5 font-semibold tabular-nums underline-offset-4 transition hover:bg-slate-100 hover:underline ${tone ?? "text-slate-800"}`
        }
      >
        {value}
      </button>
    </td>
  );
}

function TotalCell({ value, pill }: { value: number; pill?: boolean }) {
  return (
    <td className="px-3 py-3 text-center">
      {pill && value > 0 ? (
        <span className="rounded-full bg-[#eef4ff] px-3 py-1 text-[15px] font-black tabular-nums text-blue-600">{value}</span>
      ) : (
        <span className={`px-2 text-[15px] font-black tabular-nums ${value ? "text-slate-800" : "text-slate-300"}`}>{value}</span>
      )}
    </td>
  );
}

function Th({ children, className }: any) {
  return <th className={`px-3 py-3 text-center text-[12.5px] font-semibold ${className ?? ""}`}>{children}</th>;
}
function Td({ children, className }: any) {
  return <td className={`px-3 py-3 ${className ?? ""}`}>{children}</td>;
}
