import { useMemo } from "react";
import { AX_STAGES, type AxStage } from "@/lib/ax-stages";
import { Check, X, Hash, Award, Ban, AlertCircle, Paperclip, Undo2 } from "lucide-react";

/** 보드 한 칸(단계)의 정의 — 어떤 신청이 여기에 들어오는지와 색. */
const COLUMNS = [
  {
    key: "requested", n: "1", title: "고도화 신청", sub: "승인 대기",
    match: (r: any) => r.status === "requested",
    accent: "border-blue-200 bg-blue-50/60", dot: "bg-blue-500", count: "text-blue-600",
    empty: "새로 들어온 신청이 없습니다.",
  },
  {
    key: "developing", n: "2", title: "고도화", sub: "신청자 진행 중",
    match: (r: any) => r.status === "developing",
    accent: "border-violet-200 bg-violet-50/60", dot: "bg-violet-500", count: "text-violet-600",
    empty: "고도화 중인 과제가 없습니다.",
  },
  {
    key: "review", n: "3", title: "고도화 승인 검토", sub: "2차 검토 대기",
    match: (r: any) => r.status === "review",
    accent: "border-amber-200 bg-amber-50/60", dot: "bg-amber-500", count: "text-amber-600",
    empty: "검토 요청이 없습니다.",
  },
  {
    key: "toIssue", n: "4", title: "SaaS 번호 발급", sub: "발급 대기",
    match: (r: any) => r.status === "issued" && !r.saas?.number,
    accent: "border-emerald-200 bg-emerald-50/60", dot: "bg-emerald-500", count: "text-emerald-600",
    empty: "발급할 과제가 없습니다.",
  },
  {
    key: "issued", n: "✓", title: "등록 완료", sub: "번호 발급됨",
    match: (r: any) => r.status === "issued" && !!r.saas?.number,
    accent: "border-emerald-300 bg-emerald-100/50", dot: "bg-emerald-600", count: "text-emerald-700",
    empty: "아직 등록된 SaaS가 없습니다.",
  },
  {
    key: "rejected", n: "—", title: "반려", sub: "신청자 보완 중",
    match: (r: any) => r.status === "rejected",
    accent: "border-rose-200 bg-rose-50/60", dot: "bg-rose-400", count: "text-rose-600",
    empty: "반려한 신청이 없습니다.",
  },
] as const;

/**
 * 단계별 신청 현황 보드 — 협의체 인원이 지금 뭘 처리해야 하는지 한눈에 본다.
 * 승인/반려가 필요한 칸(1·3단계)에는 카드마다 버튼이 바로 붙는다.
 */
export function AxRequestBoard({ requests, onApprove, onReject, onIssue, onCert, onDetail, onExclude, onCancelSaas, busy }: {
  requests: any[];
  onApprove: (row: any, gate: "request" | "review") => void;
  onReject: (row: any, gate: "request" | "review") => void;
  onIssue: (row: any) => void;
  onCert: (row: any) => void;
  onDetail: (row: any) => void;
  onExclude: (row: any) => void;
  onCancelSaas: (row: any) => void;
  busy?: boolean;
}) {
  const grouped = useMemo(
    () => COLUMNS.map((c) => ({ col: c, rows: requests.filter(c.match) })),
    [requests],
  );
  const todo = grouped[0].rows.length + grouped[2].rows.length;

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[20px] font-black tracking-tight text-slate-900">단계별 신청 현황</h2>
        {todo > 0 ? (
          <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[13px] font-bold text-blue-600">
            처리 필요 {todo}건
          </span>
        ) : (
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[13px] font-bold text-slate-400">
            처리할 건 없음
          </span>
        )}
        <span className="ml-auto text-[12px] font-semibold text-slate-400">
          작품명을 누르면 신청서 전체를 볼 수 있습니다.
        </span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {grouped.map(({ col, rows }) => (
          <div key={col.key} className={`flex flex-col rounded-2xl border p-3 ${col.accent}`}>
            <div className="flex items-center gap-2">
              <span className={`grid h-[20px] w-[20px] shrink-0 place-items-center rounded-full text-[11px] font-black text-white ${col.dot}`}>
                {col.n}
              </span>
              <div className="min-w-0">
                <div className="truncate text-[13.5px] font-black text-slate-900">{col.title}</div>
                <div className="text-[11px] font-semibold text-slate-500">{col.sub}</div>
              </div>
              <span className={`ml-auto shrink-0 text-[17px] font-black tabular-nums ${col.count}`}>
                {rows.length}
              </span>
            </div>

            <div className="mt-2.5 space-y-2">
              {rows.map((r) => (
                <Card
                  key={r.id}
                  row={r}
                  colKey={col.key}
                  onApprove={onApprove}
                  onReject={onReject}
                  onIssue={onIssue}
                  onCert={onCert}
                  onDetail={onDetail}
                  onExclude={onExclude}
                  onCancelSaas={onCancelSaas}
                  busy={busy}
                />
              ))}
              {rows.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-300/70 px-2 py-6 text-center text-[11.5px] leading-snug text-slate-400 break-keep">
                  {col.empty}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Card({ row: r, colKey, onApprove, onReject, onIssue, onCert, onDetail, onExclude, onCancelSaas, busy }: any) {
  const gate: "request" | "review" | null =
    colKey === "requested" ? "request" : colKey === "review" ? "review" : null;

  return (
    <div className="rounded-xl border border-white bg-white p-2.5 shadow-sm">
      <button onClick={() => onDetail(r)} className="block w-full text-left">
        <div className="break-keep text-[13px] font-bold leading-snug text-slate-900 underline-offset-2 hover:underline">
          {r.title}
        </div>
        <div className="mt-0.5 truncate text-[11.5px] text-slate-500">
          {r.authorTeam} · {r.authorName}
        </div>
      </button>

      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {r.stage && (
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${AX_STAGES[r.stage as AxStage].soft}`}>
            {AX_STAGES[r.stage as AxStage].name}
          </span>
        )}
        {r.form?.attachmentName && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
            <Paperclip className="h-2.5 w-2.5" /> 첨부
          </span>
        )}
        {r.saas?.number && (
          <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-black tabular-nums text-emerald-700">
            {r.saas.number}
          </span>
        )}
      </div>

      {/* 반려 사유 — 어디서 반려됐는지 함께 */}
      {r.rejectReason && (
        <div className="mt-1.5 rounded-lg bg-rose-50 p-2">
          <div className="flex items-center gap-1 text-[10.5px] font-black text-rose-600">
            <AlertCircle className="h-3 w-3" />
            {r.rejectedFrom === "saasCancel" ? "SaaS 등록 취소"
              : r.rejectedFrom === "review" ? "2차 검토 반려" : "신청 반려"}
          </div>
          <p className="mt-0.5 line-clamp-3 break-keep text-[11px] leading-snug text-slate-600">
            {r.rejectReason}
          </p>
        </div>
      )}

      {/* 이 칸에서 할 수 있는 일 */}
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {gate && (
          <>
            <button
              disabled={busy}
              onClick={() => onApprove(r, gate)}
              className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-600 px-2 py-1.5 text-[11.5px] font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              <Check className="h-3 w-3" /> 승인
            </button>
            <button
              disabled={busy}
              onClick={() => onReject(r, gate)}
              className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-rose-300 px-2 py-1.5 text-[11.5px] font-bold text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
            >
              <X className="h-3 w-3" /> 반려
            </button>
          </>
        )}
        {colKey === "toIssue" && (
          <button
            onClick={() => onIssue(r)}
            className="inline-flex w-full items-center justify-center gap-1 rounded-lg bg-blue-600 px-2 py-1.5 text-[11.5px] font-bold text-white transition hover:bg-blue-700"
          >
            <Hash className="h-3 w-3" /> 번호 발급
          </button>
        )}
        {colKey === "issued" && (
          <>
            <button
              onClick={() => onCert(r)}
              className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-emerald-300 bg-white px-2 py-1.5 text-[11.5px] font-bold text-emerald-700 transition hover:bg-emerald-50"
            >
              <Award className="h-3 w-3" /> 인증서
            </button>
            <button
              onClick={() => onCancelSaas(r)}
              className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11.5px] font-bold text-slate-500 transition hover:border-rose-300 hover:text-rose-600"
            >
              <Undo2 className="h-3 w-3" /> 등록 취소
            </button>
          </>
        )}
        {colKey === "developing" && (
          <span className="w-full rounded-lg bg-slate-50 px-2 py-1.5 text-center text-[11px] font-semibold text-slate-400">
            본인이 검토 요청할 때까지 대기
          </span>
        )}
        {/* 어느 단계에 있든 신청을 아예 없던 일로 되돌릴 수 있다 */}
        <button
          onClick={() => onExclude(r)}
          className="inline-flex w-full items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-bold text-slate-400 transition hover:border-rose-300 hover:text-rose-600"
        >
          <Ban className="h-3 w-3" /> 신청 초기화
        </button>
      </div>
    </div>
  );
}
