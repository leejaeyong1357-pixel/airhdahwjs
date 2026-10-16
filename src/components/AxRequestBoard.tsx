import { useMemo, useState } from "react";
import { AX_STAGES, type AxStage } from "@/lib/ax-stages";
import {
  Check, X, Hash, Award, Ban, AlertCircle, Paperclip, Undo2, PenLine, Mail, Database, Search,
  ShieldCheck, ChevronDown, ChevronUp, Link2, ExternalLink,
} from "lucide-react";

/** 보드 한 칸(단계)의 정의 — 어떤 신청이 여기에 들어오는지와 색. */
const COLUMNS = [
  {
    key: "requested", n: "1", title: "신청 승인", sub: "AX 담당자 검토",
    match: (r: any) => r.status === "requested",
    accent: "border-blue-200 bg-blue-50/60", dot: "bg-blue-500", count: "text-blue-600",
    empty: "새로 들어온 신청이 없습니다.", todo: true,
  },
  {
    key: "planning", n: "2", title: "지원방안 수립", sub: "AX협의체 → 메일 통보",
    match: (r: any) => r.status === "planning",
    accent: "border-sky-200 bg-sky-50/60", dot: "bg-sky-500", count: "text-sky-700",
    empty: "지원방안을 세울 과제가 없습니다.", todo: true,
  },
  {
    key: "developing", n: "3", title: "고도화 · 재점검", sub: "신청자 진행 중",
    match: (r: any) => r.status === "developing",
    accent: "border-violet-200 bg-violet-50/60", dot: "bg-violet-500", count: "text-violet-600",
    empty: "고도화 중인 과제가 없습니다.", todo: false,
  },
  {
    key: "review", n: "4", title: "SaaS 승인 협의", sub: "보안 · 실효성 검토",
    match: (r: any) => r.status === "review",
    accent: "border-amber-200 bg-amber-50/60", dot: "bg-amber-500", count: "text-amber-600",
    empty: "승인 신청이 없습니다.", todo: true,
  },
  {
    key: "toIssue", n: "5", title: "SaaS 인증 부여", sub: "인증번호 발급 대기",
    match: (r: any) => r.status === "issued" && !r.saas?.number,
    accent: "border-emerald-200 bg-emerald-50/60", dot: "bg-emerald-500", count: "text-emerald-600",
    empty: "발급할 과제가 없습니다.", todo: true,
  },
  {
    key: "toRegister", n: "6", title: "업무시스템 등록", sub: "AX 담당자",
    match: (r: any) => r.status === "issued" && !!r.saas?.number && !r.registeredAt,
    accent: "border-teal-200 bg-teal-50/60", dot: "bg-teal-500", count: "text-teal-700",
    empty: "등록할 과제가 없습니다.", todo: true,
  },
  {
    key: "done", n: "✓", title: "등록 완료", sub: "인증 · 등록 끝",
    match: (r: any) => r.status === "issued" && !!r.saas?.number && !!r.registeredAt,
    accent: "border-emerald-300 bg-emerald-100/40", dot: "bg-emerald-600", count: "text-emerald-700",
    empty: "아직 등록이 끝난 SaaS가 없습니다.", todo: false,
  },
  {
    key: "rejected", n: "—", title: "반려", sub: "신청자 보완 중",
    match: (r: any) => r.status === "rejected",
    accent: "border-rose-200 bg-rose-50/60", dot: "bg-rose-400", count: "text-rose-600",
    empty: "반려한 신청이 없습니다.", todo: false,
  },
] as const;

type Gate = "request" | "review";

/**
 * 단계별 신청 현황 보드 — 협의체 인원이 지금 뭘 처리해야 하는지 한눈에 본다.
 * 칸마다 높이를 정해 두고 안에서 스크롤한다 → 신청이 쌓여도 화면이 길어지지 않는다.
 */
export function AxRequestBoard({
  requests, onApprove, onReject, onIssue, onCert, onDetail, onExclude, onCancelSaas,
  onPlan, onNotify, onRegister, onLink, busy,
}: {
  requests: any[];
  onApprove: (row: any, gate: Gate) => void;
  onReject: (row: any, gate: Gate) => void;
  onIssue: (row: any) => void;
  onCert: (row: any) => void;
  onDetail: (row: any) => void;
  onExclude: (row: any) => void;
  onCancelSaas: (row: any) => void;
  onPlan: (row: any) => void;
  onNotify: (row: any) => void;
  onRegister: (row: any, undo?: boolean) => void;
  onLink: (row: any) => void;
  busy?: boolean;
}) {
  const [q, setQ] = useState("");
  const [tall, setTall] = useState(false);

  // 먼저 신청한 사람이 위에 오도록 한다. 위에서부터 처리하면
  // 승인도 SaaS 번호도 신청 순서대로 나간다.
  const grouped = useMemo(() => {
    const k = q.trim().toLowerCase();
    const hit = (r: any) => !k || `${r.title} ${r.authorName} ${r.authorTeam}`.toLowerCase().includes(k);
    return COLUMNS.map((c) => ({
      col: c,
      rows: requests
        .filter(c.match)
        .filter(hit)
        .slice()
        .sort(
          (a: any, b: any) =>
            String(a.createdAt).localeCompare(String(b.createdAt)) ||
            String(a.id).localeCompare(String(b.id)),
        ),
    }));
  }, [requests, q]);
  const todo = grouped.filter((g) => g.col.todo).reduce((a, g) => a + g.rows.length, 0);

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
        <span className="text-[12px] font-semibold text-slate-400">작품명을 누르면 신청서 전체를 볼 수 있습니다.</span>
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="작품명 · 이름 · 팀 검색"
            className="w-56 rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-[13px]"
          />
        </div>
        <button
          onClick={() => setTall((v) => !v)}
          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-[12.5px] font-bold text-slate-500 hover:bg-slate-50"
        >
          {tall ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {tall ? "칸 줄이기" : "칸 늘리기"}
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {grouped.map(({ col, rows }) => (
          <div key={col.key} className={`flex flex-col rounded-2xl border p-2.5 ${col.accent}`}>
            <div className="flex items-center gap-2 px-0.5">
              <span className={`grid h-[20px] w-[20px] shrink-0 place-items-center rounded-full text-[11px] font-black text-white ${col.dot}`}>
                {col.n}
              </span>
              <div className="min-w-0">
                <div className="truncate text-[13.5px] font-black text-slate-900">{col.title}</div>
                <div className="truncate text-[11px] font-semibold text-slate-500">{col.sub}</div>
              </div>
              <span className={`ml-auto shrink-0 text-[17px] font-black tabular-nums ${col.count}`}>{rows.length}</span>
            </div>

            <div className={`mt-2 space-y-1.5 overflow-y-auto pr-0.5 ${tall ? "max-h-[620px]" : "max-h-[264px]"}`}>
              {rows.map((r) => (
                <Card
                  key={r.id}
                  row={r}
                  colKey={col.key}
                  busy={busy}
                  on={{ onApprove, onReject, onIssue, onCert, onDetail, onExclude, onCancelSaas, onPlan, onNotify, onRegister, onLink }}
                />
              ))}
              {rows.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-300/70 px-2 py-4 text-center text-[11.5px] leading-snug text-slate-400 break-keep">
                  {q ? "검색 결과가 없습니다." : col.empty}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

const btn = "inline-flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1 text-[11.5px] font-bold transition disabled:opacity-50";

/** 서비스 접속 링크 — 넣어 두면 대시보드에서 이 작품을 누를 때 바로 접속된다 */
function LinkButton({ row: r, onLink }: { row: any; onLink: (row: any) => void }) {
  if (!r.serviceUrl) {
    return (
      <button onClick={() => onLink(r)} className={`${btn} basis-full border border-blue-300 bg-white py-1.5 text-blue-600 hover:bg-blue-50`}>
        <Link2 className="h-3 w-3" /> 접속 링크 넣기
      </button>
    );
  }
  return (
    <div className="flex basis-full items-center gap-1 rounded-lg bg-blue-50 px-2 py-1">
      <a
        href={r.serviceUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={r.serviceUrl}
        className="inline-flex min-w-0 flex-1 items-center gap-1 text-[11px] font-semibold text-blue-600 hover:underline"
      >
        <ExternalLink className="h-3 w-3 shrink-0" />
        <span className="truncate">{r.serviceUrl}</span>
      </a>
      <button onClick={() => onLink(r)} className="shrink-0 text-[11px] font-bold text-slate-400 hover:text-slate-700">수정</button>
    </div>
  );
}

function Card({ row: r, colKey, busy, on }: { row: any; colKey: string; busy?: boolean; on: any }) {
  const gate: Gate | null = colKey === "requested" ? "request" : colKey === "review" ? "review" : null;
  const latest = r.versions?.[r.versions.length - 1];

  return (
    <div className="rounded-xl border border-white bg-white p-2 shadow-sm">
      <div className="flex items-start gap-1">
        <button onClick={() => on.onDetail(r)} className="min-w-0 flex-1 text-left" title={r.title}>
          <div className="truncate text-[12.5px] font-bold text-slate-900 underline-offset-2 hover:underline">{r.title}</div>
          <div className="truncate text-[11px] text-slate-500">{r.authorTeam} · {r.authorName}</div>
        </button>
        {/* 어느 단계에 있든 신청을 아예 없던 일로 되돌릴 수 있다 */}
        <button
          onClick={() => on.onExclude(r)}
          title="신청 초기화"
          aria-label={`${r.title} 신청 초기화`}
          className="shrink-0 rounded-md p-1 text-slate-300 transition hover:bg-rose-50 hover:text-rose-600"
        >
          <Ban className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-1">
        {r.stage && (
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${AX_STAGES[r.stage as AxStage].soft}`}>
            {AX_STAGES[r.stage as AxStage].name}
          </span>
        )}
        {latest && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
            <ShieldCheck className="h-2.5 w-2.5" /> {latest.securityScore}점
          </span>
        )}
        {(latest?.filePath || r.form?.attachmentName) && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
            <Paperclip className="h-2.5 w-2.5" /> 첨부
          </span>
        )}
        {colKey === "planning" && r.plan?.text && (
          <span className="rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-bold text-sky-700">방안 작성됨</span>
        )}
        {r.saas?.number && (
          <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-black tabular-nums text-emerald-700">
            {r.saas.number}
          </span>
        )}
      </div>

      {/* 반려 사유 — 어디서 반려됐는지 함께 */}
      {r.rejectReason && (
        <div className="mt-1 rounded-lg bg-rose-50 px-2 py-1.5">
          <div className="flex items-center gap-1 text-[10.5px] font-black text-rose-600">
            <AlertCircle className="h-3 w-3" />
            {r.rejectedFrom === "saasCancel" ? "SaaS 등록 취소"
              : r.rejectedFrom === "review" ? "SaaS 승인 반려" : "신청 반려"}
          </div>
          <p className="line-clamp-2 break-keep text-[11px] leading-snug text-slate-600">{r.rejectReason}</p>
        </div>
      )}

      {/* 이 칸에서 할 수 있는 일 */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {gate && (
          <>
            <button disabled={busy} onClick={() => on.onApprove(r, gate)} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}>
              <Check className="h-3 w-3" /> 승인
            </button>
            <button disabled={busy} onClick={() => on.onReject(r, gate)} className={`${btn} border border-rose-300 text-rose-600 hover:bg-rose-50`}>
              <X className="h-3 w-3" /> 반려
            </button>
          </>
        )}
        {colKey === "planning" && (
          <>
            <button onClick={() => on.onPlan(r)} className={`${btn} border border-sky-300 bg-white text-sky-700 hover:bg-sky-50`}>
              <PenLine className="h-3 w-3" /> {r.plan?.text ? "방안 수정" : "방안 작성"}
            </button>
            <button
              disabled={busy || !r.plan?.text}
              title={r.plan?.text ? "" : "지원방안을 먼저 작성하세요"}
              onClick={() => on.onNotify(r)}
              className={`${btn} bg-sky-600 text-white hover:bg-sky-700`}
            >
              <Mail className="h-3 w-3" /> 메일 통보
            </button>
          </>
        )}
        {colKey === "developing" && (
          <span className="w-full rounded-lg bg-slate-50 px-2 py-1 text-center text-[10.5px] font-semibold text-slate-400">
            신청자가 SaaS 승인을 신청할 때까지 대기
          </span>
        )}
        {colKey === "toIssue" && (
          <button onClick={() => on.onIssue(r)} className={`${btn} bg-blue-600 text-white hover:bg-blue-700`}>
            <Hash className="h-3 w-3" /> 인증번호 발급
          </button>
        )}
        {colKey === "toRegister" && (
          <>
            <button disabled={busy} onClick={() => on.onRegister(r)} className={`${btn} basis-full bg-teal-600 py-1.5 text-white hover:bg-teal-700`}>
              <Database className="h-3 w-3" /> 업무시스템 등록 완료
            </button>
            <button onClick={() => on.onCert(r)} className={`${btn} border border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50`}>
              <Award className="h-3 w-3" /> 인증서
            </button>
            <button onClick={() => on.onCancelSaas(r)} className={`${btn} border border-slate-200 bg-white text-slate-500 hover:border-rose-300 hover:text-rose-600`}>
              <Undo2 className="h-3 w-3" /> 인증 취소
            </button>
          </>
        )}
        {(colKey === "toRegister" || colKey === "done") && <LinkButton row={r} onLink={on.onLink} />}
        {colKey === "done" && (
          <>
            <button onClick={() => on.onCert(r)} className={`${btn} border border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50`}>
              <Award className="h-3 w-3" /> 인증서
            </button>
            <button disabled={busy} onClick={() => on.onRegister(r, true)} className={`${btn} border border-slate-200 bg-white text-slate-500 hover:border-rose-300 hover:text-rose-600`}>
              <Undo2 className="h-3 w-3" /> 등록 되돌리기
            </button>
          </>
        )}
      </div>
    </div>
  );
}
