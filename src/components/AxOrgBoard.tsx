import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { axListWorksBy } from "@/lib/ax-lab.functions";
import { AxWorkCard, AxWorkDetailDialog } from "@/components/AxWorkDetailDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AX_STAGES, AX_STAGE_LIST } from "@/lib/ax-stages";
import { ChevronDown, ChevronRight, MousePointerClick } from "lucide-react";

type Filter = "all" | "stage1" | "stage2" | "stage3" | "stage4" | "requested" | "approved";
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

  const stageCols = (row: any, scope: "sil" | "team") =>
    AX_STAGE_LIST.map((st) => (
      <NumCell
        key={st}
        value={row[`stage${st}`]}
        tone={AX_STAGES[st].num}
        onPick={() => open(scope, scope === "sil" ? row.sil : row.team, `stage${st}` as Filter, AX_STAGES[st].label)}
      />
    ));

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-[19px] font-black tracking-tight text-slate-900">실별 고도화 현황</h2>
          <p className="text-[13px] text-slate-500">실을 선택하면 팀별 현황과 작품을 확인할 수 있습니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-xl bg-[#eef4fd] p-1">
            {(["sil", "team"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`rounded-lg px-3 py-1.5 text-[13px] font-bold transition ${
                  tab === k ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {k === "sil" ? "실별 현황" : "팀별 현황"}
              </button>
            ))}
          </div>
          <select
            value={silFilter}
            onChange={(e) => setSilFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] font-semibold text-slate-700"
          >
            <option>전체 실</option>
            {board.map((g: any) => <option key={g.sil}>{g.sil}</option>)}
          </select>
        </div>
      </div>

      <div className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-slate-400">
        <MousePointerClick className="h-3.5 w-3.5" /> 숫자를 클릭하면 해당 작품 목록이 열립니다.
      </div>

      <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200">
        {tab === "sil" ? (
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <Th className="w-8"></Th>
                <Th className="text-left">실</Th>
                <Th>전체 작품</Th>
                {AX_STAGE_LIST.map((st) => <Th key={st}>{AX_STAGES[st].head}</Th>)}
                <Th>고도화 목표</Th>
                <Th>신청</Th>
                <Th>승인</Th>
              </tr>
            </thead>
            <tbody>
              {visibleSils.map((g: any) => {
                const expanded = openSils.has(g.sil);
                return (
                  <Fragment key={g.sil}>
                    <tr className="cursor-pointer border-t border-slate-200 hover:bg-slate-50/80" onClick={() => toggleSil(g.sil)}>
                      <Td className="w-8 text-slate-400">
                        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </Td>
                      <Td className="font-bold text-slate-900">{g.sil}</Td>
                      <NumCell value={g.total} strong onPick={() => open("sil", g.sil, "all", "전체 작품")} />
                      {stageCols(g, "sil")}
                      <NumCell value={g.goal} />
                      <NumCell value={g.requested} onPick={() => open("sil", g.sil, "requested", "고도화 신청")} />
                      <NumCell value={g.approved} tone="text-emerald-600" onPick={() => open("sil", g.sil, "approved", "승인")} />
                    </tr>
                    {expanded && g.teams.map((t: any) => (
                      <tr key={g.sil + t.team} className="border-t border-slate-100 bg-slate-50/50 text-[13px]">
                        <Td></Td>
                        <Td>
                          <button
                            onClick={() => open("team", t.team, "all", "전체 작품")}
                            className="rounded-md px-1 py-0.5 font-semibold text-slate-600 underline-offset-4 hover:bg-slate-100 hover:underline"
                          >
                            └ {t.team}
                          </button>
                        </Td>
                        <NumCell value={t.total} onPick={() => open("team", t.team, "all", "전체 작품")} />
                        {stageCols(t, "team")}
                        <Td className="text-center text-slate-300">—</Td>
                        <NumCell value={t.requested} onPick={() => open("team", t.team, "requested", "고도화 신청")} />
                        <NumCell value={t.approved} tone="text-emerald-600" onPick={() => open("team", t.team, "approved", "승인")} />
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
              {visibleSils.length === 0 && (
                <tr><td colSpan={10} className="p-8 text-center text-sm text-slate-400">데이터가 없습니다.</td></tr>
              )}
              <tr className="border-t-2 border-slate-200 bg-slate-50">
                <Td></Td>
                <Td className="font-black text-slate-900">합계</Td>
                <TotalCell value={sum(visibleSils, "total")} />
                {AX_STAGE_LIST.map((st) => <TotalCell key={st} value={sum(visibleSils, `stage${st}`)} tone={AX_STAGES[st].num} />)}
                <TotalCell value={sum(visibleSils, "goal")} />
                <TotalCell value={sum(visibleSils, "requested")} />
                <TotalCell value={sum(visibleSils, "approved")} tone="text-emerald-600" />
              </tr>
            </tbody>
          </table>
        ) : (
          <table className="w-full min-w-[880px] text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <Th className="text-left">소속 실</Th>
                <Th className="text-left">팀</Th>
                <Th>전체 작품</Th>
                {AX_STAGE_LIST.map((st) => <Th key={st}>{AX_STAGES[st].head}</Th>)}
                <Th>신청</Th>
                <Th>승인</Th>
              </tr>
            </thead>
            <tbody>
              {visibleTeams.map((t: any) => (
                <tr key={t.sil + t.team} className="border-t border-slate-200 hover:bg-slate-50/80">
                  <Td className="text-slate-500">{t.sil}</Td>
                  <Td>
                    <button
                      onClick={() => open("team", t.team, "all", "전체 작품")}
                      className="rounded-md px-1 py-0.5 font-bold text-slate-900 underline-offset-4 hover:bg-slate-100 hover:underline"
                    >
                      {t.team}
                    </button>
                  </Td>
                  <NumCell value={t.total} strong onPick={() => open("team", t.team, "all", "전체 작품")} />
                  {stageCols(t, "team")}
                  <NumCell value={t.requested} onPick={() => open("team", t.team, "requested", "고도화 신청")} />
                  <NumCell value={t.approved} tone="text-emerald-600" onPick={() => open("team", t.team, "approved", "승인")} />
                </tr>
              ))}
              {visibleTeams.length === 0 && (
                <tr><td colSpan={9} className="p-8 text-center text-sm text-slate-400">데이터가 없습니다.</td></tr>
              )}
              <tr className="border-t-2 border-slate-200 bg-slate-50">
                <Td></Td>
                <Td className="font-black text-slate-900">합계</Td>
                <TotalCell value={sum(visibleTeams, "total")} />
                {AX_STAGE_LIST.map((st) => <TotalCell key={st} value={sum(visibleTeams, `stage${st}`)} tone={AX_STAGES[st].num} />)}
                <TotalCell value={sum(visibleTeams, "requested")} />
                <TotalCell value={sum(visibleTeams, "approved")} tone="text-emerald-600" />
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

function NumCell({ value, tone, onPick, strong }: { value: number; tone?: string; onPick?: () => void; strong?: boolean }) {
  const weight = strong ? "font-black" : "font-semibold";
  if (!value || !onPick) {
    return (
      <td className="px-3 py-2.5 text-center">
        <span className={`px-2 tabular-nums ${weight} ${value ? tone ?? "text-slate-900" : "text-slate-300"}`}>{value ?? 0}</span>
      </td>
    );
  }
  return (
    <td className="px-3 py-2.5 text-center">
      <button
        onClick={(e) => { e.stopPropagation(); onPick(); }}
        className={`rounded-md px-2 py-0.5 tabular-nums underline-offset-4 transition hover:bg-slate-100 hover:underline ${weight} ${tone ?? "text-slate-900"}`}
      >
        {value}
      </button>
    </td>
  );
}

function TotalCell({ value, tone }: { value: number; tone?: string }) {
  return (
    <td className="px-3 py-3 text-center">
      <span className={`px-2 text-[15px] font-black tabular-nums ${tone ?? "text-slate-900"}`}>{value}</span>
    </td>
  );
}

function Th({ children, className }: any) {
  return <th className={`px-3 py-3 text-center text-[12px] font-bold ${className ?? ""}`}>{children}</th>;
}
function Td({ children, className }: any) {
  return <td className={`px-3 py-2.5 ${className ?? ""}`}>{children}</td>;
}
