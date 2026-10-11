import { useMemo, useState } from "react";
import { AxSaasCertificate, type SaasCertInfo } from "@/components/AxSaasCertificate";
import { SAAS_CATEGORIES, SAAS_CATEGORY_LABEL } from "@/lib/ax-stages";
import { formatDate } from "@/lib/utils";
import { Award, Package, Search, Undo2 } from "lucide-react";

/**
 * SaaS 등록 현황 — 번호가 실제로 발급된 과제만 모아서 보여준다.
 * 인증서를 다시 열어보거나 등록을 취소할 수 있다.
 */
export function AxSaasRegistry({ requests, onCancelSaas }: {
  requests: any[];
  onCancelSaas: (row: any) => void;
}) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [cert, setCert] = useState<SaasCertInfo | null>(null);

  const registered = useMemo(
    () =>
      requests
        .filter((r: any) => r.saas?.number)
        .sort((a: any, b: any) => (a.saas.number < b.saas.number ? -1 : 1)),
    [requests],
  );

  const rows = useMemo(() => {
    const k = q.trim().toLowerCase();
    return registered
      .filter((r: any) => (cat === "all" ? true : r.saas.category === cat))
      .filter((r: any) =>
        k ? `${r.saas.number} ${r.title} ${r.authorName} ${r.authorTeam}`.toLowerCase().includes(k) : true,
      );
  }, [registered, q, cat]);

  // 업무성격별 건수 — 어떤 구분이 많이 나갔는지 바로 보인다
  const byCat = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of registered) m[r.saas.category] = (m[r.saas.category] ?? 0) + 1;
    return m;
  }, [registered]);

  return (
    <section id="saas-registry" className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Package className="h-5 w-5 text-emerald-600" />
        <h2 className="text-[20px] font-black tracking-tight text-slate-900">SaaS 등록 현황</h2>
        <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[13px] font-bold text-emerald-700">
          총 {registered.length}건
        </span>
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="번호 · 작품명 · 이름 검색"
            className="w-[230px] rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-[13px]"
          />
        </div>
      </div>

      {/* 업무성격 구분 필터 */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Pill active={cat === "all"} onClick={() => setCat("all")} label={`전체 ${registered.length}`} />
        {SAAS_CATEGORIES.filter((c) => byCat[c.code]).map((c) => (
          <Pill
            key={c.code}
            active={cat === c.code}
            onClick={() => setCat(c.code)}
            label={`${c.code} ${c.label} ${byCat[c.code]}`}
          />
        ))}
      </div>

      <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-3 py-3 text-left font-bold">등록번호</th>
              <th className="px-3 py-3 text-left font-bold">업무성격</th>
              <th className="px-3 py-3 text-left font-bold">작품명</th>
              <th className="px-3 py-3 text-left font-bold">소속 · 성명</th>
              <th className="px-3 py-3 text-left font-bold">발급일</th>
              <th className="w-[170px] px-3 py-3 text-center font-bold">인증서</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.id} className="border-t border-slate-200">
                <td className="whitespace-nowrap px-3 py-2.5">
                  <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[12.5px] font-black tabular-nums text-emerald-700">
                    {r.saas.number}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-[12.5px] text-slate-500">
                  {SAAS_CATEGORY_LABEL[r.saas.category] ?? r.saas.category}
                </td>
                <td className="px-3 py-2.5 font-semibold text-slate-900">{r.title}</td>
                <td className="px-3 py-2.5 text-[12.5px] text-slate-500">
                  {r.authorTeam} · {r.authorName}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-500">
                  {formatDate(r.saas.issuedAt)}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center justify-center gap-1.5">
                    <button
                      onClick={() =>
                        setCert({
                          number: r.saas.number,
                          category: r.saas.category,
                          issuedAt: r.saas.issuedAt,
                          title: r.title,
                          authorName: r.authorName,
                          authorTeam: r.authorTeam,
                          authorPosition: r.authorPosition ?? "",
                          authorEmpNo: r.authorEmpNo ?? "",
                        })
                      }
                      className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 px-2.5 py-1.5 text-[12px] font-bold text-emerald-700 transition hover:bg-emerald-50"
                    >
                      <Award className="h-3.5 w-3.5" /> 보기
                    </button>
                    <button
                      onClick={() => onCancelSaas(r)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px] font-bold text-slate-500 transition hover:border-destructive/40 hover:text-destructive"
                    >
                      <Undo2 className="h-3.5 w-3.5" /> 취소
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-sm text-slate-400">
                  {registered.length === 0
                    ? "아직 SaaS 등록번호가 발급된 과제가 없습니다."
                    : "검색 결과가 없습니다."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <AxSaasCertificate info={cert} open={!!cert} onOpenChange={(o) => !o && setCert(null)} />
    </section>
  );
}

function Pill({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-2.5 py-1.5 text-[12.5px] font-bold transition ${
        active ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-500 hover:text-slate-700"
      }`}
    >
      {label}
    </button>
  );
}
