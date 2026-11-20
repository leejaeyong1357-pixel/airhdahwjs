import { Link } from "@tanstack/react-router";
import {
  Send, ShieldCheck, FilePenLine, UserCheck, Users, Mail, Settings, Database, FileSearch,
  User, ArrowUpRight, ArrowRight, ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
} from "lucide-react";
import { SECURITY_PASS_SCORE } from "@/lib/ax-stages";

/**
 * AI 개발 · 고도화 및 SaaS 인증 절차 — 두 갈래 흐름도.
 *   셀프 보안점검 칸을 누르면 보안점검 프롬프트, SaaS 인증 부여 칸을 누르면 인증서가 열린다.
 */
export function AxProcessFlow({ onSecurity, onCert, showApply = true }: {
  onSecurity?: () => void;
  onCert?: () => void;
  showApply?: boolean;
}) {
  const pass = `${SECURITY_PASS_SCORE}점 이상`;
  const fail = `${SECURITY_PASS_SCORE}점 미만 · 보완`;

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[28px] font-black tracking-tight text-[#0f1f38] sm:text-[32px]">
          AI 개발 · 고도화 및 SaaS 인증 절차
        </h2>
        {showApply && (
          <Link
            to="/ax-lab/request"
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-[15px] font-bold text-white transition hover:bg-blue-700"
          >
            고도화 신청하기 <ArrowUpRight className="h-4 w-4" />
          </Link>
        )}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {/* ── 고도화 신청 및 지원 ── */}
        <Panel title="고도화 신청 및 지원">
          <Grid>
            {/* 1행 */}
            <Box icon={Send} title="AI 개발" actor="신청자" />
            <HArrow />
            <Box icon={ShieldCheck} title="셀프 보안점검" actor="신청자" onClick={onSecurity} />
            <HArrow label={pass} />
            <Box icon={FilePenLine} title="고도화 신청" actor="신청자" to="/ax-lab/request" />

            {/* 70점 미만 → AI 개발로 */}
            <LoopRow label={fail} />
            <div />
            <VArrow />

            {/* 2행 */}
            <Box icon={Mail} title="이메일 통보" actor="AX 담당자" />
            <HArrow left />
            <Box icon={Users} title="고도화 지원방안 수립" actor="AX협의체" />
            <HArrow left />
            <Box icon={UserCheck} title="신청 승인" actor="AX 담당자" />
          </Grid>

          <div className="mt-5 flex items-center gap-2.5 rounded-xl bg-[#f1f5fb] px-4 py-3.5 text-[14px] text-slate-600">
            <Mail className="h-[18px] w-[18px] text-blue-600" />
            이메일 안내 후 고도화 진행
            <ArrowRight className="h-4 w-4 text-slate-500" />
          </div>
        </Panel>

        {/* ── 고도화 및 SaaS 인증 ── */}
        <Panel title="고도화 및 SaaS 인증">
          <Grid>
            {/* 1행 */}
            <Box icon={Settings} title="고도화" actor="신청자" />
            <HArrow />
            <Box icon={ShieldCheck} title="셀프 보안점검" actor="신청자" onClick={onSecurity} />
            <HArrow label={pass} />
            <Box icon={FilePenLine} title="SaaS 승인 신청" actor="신청자" />

            {/* 70점 미만 → 고도화로, 반려 후 보완 → 셀프 보안점검으로 */}
            <LoopRow label={fail} returnUp />
            <div />
            <VArrow />

            {/* 2행 */}
            <Box icon={Database} title="업무시스템 등록" actor="AX 담당자" />
            <HArrow left />
            <div className="relative">
              <Box icon={FileSearch} title="SaaS 인증 부여" actor="AX협의체" onClick={onCert} />
            </div>
            <HArrow left label="승인" />
            <Box icon={Users} title="승인 협의" actor="AX협의체" sub="보안 · 실효성 검토" />

            {/* 반려 */}
            <div />
            <div />
            <div className="relative h-14">
              <span className="absolute bottom-0 left-[72%] top-0 border-l-[1.5px] border-dashed border-slate-400" />
            </div>
            <div />
            <VArrow label="반려" short />

            {/* 3행 */}
            <div />
            <div />
            <div className="relative">
              <span className="absolute left-[72%] top-0 h-1/2 border-l-[1.5px] border-dashed border-slate-400" />
              <span className="absolute left-[72%] right-0 top-1/2 border-t-[1.5px] border-dashed border-slate-400" />
              <span className="absolute left-[72%] top-[calc(50%+8px)] -translate-x-1/2 whitespace-nowrap text-[12.5px] text-slate-500">
                보완 후 셀프 보안점검
              </span>
            </div>
            <div className="relative">
              <span className="absolute left-0 right-0 top-1/2 border-t-[1.5px] border-dashed border-slate-400" />
            </div>
            <Box icon={Mail} title="반려 사유 안내" actor="AX 담당자" />
          </Grid>
        </Panel>
      </div>
    </section>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#e6eaf1] bg-white p-5">
      <h3 className="text-[21px] font-black tracking-tight text-[#0f1f38]">{title}</h3>
      <div className="mt-5 overflow-x-auto pb-1">{children}</div>
    </div>
  );
}

/** 칸 3개 + 화살표 2개 */
function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-w-[500px] grid-cols-[minmax(0,1fr)_30px_minmax(0,1fr)_58px_minmax(0,1fr)] items-stretch">
      {children}
    </div>
  );
}

function Box({ icon: Icon, title, actor, sub, onClick, to }: {
  icon: any; title: string; actor: string; sub?: string; onClick?: () => void; to?: string;
}) {
  const body = (
    <>
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 shrink-0 text-[#12315c]" strokeWidth={1.7} />
        <span className="break-keep text-[14px] font-bold leading-snug tracking-[-0.01em] text-[#0f1f38]">{title}</span>
      </div>
      <div className="mt-2 flex items-start gap-1.5 pl-0.5 text-[12.5px] text-slate-500">
        <User className="mt-[2px] h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
        <span className="leading-snug">
          {actor}
          {sub && <span className="block text-[12px] text-slate-500">{sub}</span>}
        </span>
      </div>
    </>
  );
  const cls = "relative z-[1] flex h-full min-h-[88px] w-full flex-col justify-center rounded-xl border border-[#e3e8f0] bg-white px-3 py-3 text-left";
  if (to) {
    return <Link to={to} className={`${cls} transition hover:border-blue-300 hover:shadow-sm`}>{body}</Link>;
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${cls} transition hover:border-blue-300 hover:shadow-sm`}>
        {body}
      </button>
    );
  }
  return <div className={cls}>{body}</div>;
}

/** 가로 화살표 (left 면 왼쪽을 향한다) */
function HArrow({ left, label }: { left?: boolean; label?: string }) {
  return (
    <div className="relative flex items-center px-1">
      {label && (
        <span className="absolute inset-x-0 bottom-[calc(50%+6px)] whitespace-nowrap text-center text-[12px] text-slate-500">
          {label}
        </span>
      )}
      <span className="relative h-[1.5px] flex-1 bg-blue-500">
        {left ? (
          <ChevronLeft className="absolute -left-[7px] top-1/2 h-4 w-4 -translate-y-1/2 text-blue-500" strokeWidth={2.4} />
        ) : (
          <ChevronRight className="absolute -right-[7px] top-1/2 h-4 w-4 -translate-y-1/2 text-blue-500" strokeWidth={2.4} />
        )}
      </span>
    </div>
  );
}

/** 위 칸에서 아래 칸으로 내려가는 화살표 */
function VArrow({ label, short }: { label?: string; short?: boolean }) {
  return (
    <div className={`relative flex flex-col items-center ${short ? "h-14" : "h-[76px]"}`}>
      <span className="relative w-[1.5px] flex-1 bg-blue-500">
        <ChevronDown className="absolute -bottom-[7px] left-1/2 h-4 w-4 -translate-x-1/2 text-blue-500" strokeWidth={2.4} />
      </span>
      {label && (
        <span className="absolute left-[calc(50%+12px)] top-1/2 -translate-y-1/2 text-[12.5px] text-slate-600">
          {label}
        </span>
      )}
    </div>
  );
}

/**
 * 셀프 보안점검(가운데 칸) 아래에서 첫 칸으로 되돌아가는 점선.
 * returnUp: 반려 후 보완해서 셀프 보안점검으로 다시 올라오는 점선도 함께 그린다.
 */
function LoopRow({ label, returnUp }: { label: string; returnUp?: boolean }) {
  const dash = "border-dashed border-slate-400";
  return (
    <>
      <div className="relative h-[76px]">
        <span className={`absolute left-1/2 right-0 top-0 h-7 rounded-bl-lg border-b-[1.5px] border-l-[1.5px] ${dash}`} />
        <ChevronUp className="absolute -top-[7px] left-1/2 h-4 w-4 -translate-x-1/2 text-slate-400" strokeWidth={2.2} />
      </div>
      <div className="relative h-[76px]">
        <span className={`absolute inset-x-0 top-7 border-t-[1.5px] ${dash}`} />
        <span className="absolute left-1/2 top-10 -translate-x-1/2 whitespace-nowrap text-[12.5px] text-slate-500">
          {label}
        </span>
      </div>
      <div className="relative h-[76px]">
        <span className={`absolute left-0 right-1/2 top-0 h-7 rounded-br-lg border-b-[1.5px] border-r-[1.5px] ${dash}`} />
        {returnUp && (
          <>
            <span className={`absolute bottom-0 left-[72%] top-1 border-l-[1.5px] ${dash}`} />
            <ChevronUp className="absolute -top-[6px] left-[72%] h-4 w-4 -translate-x-1/2 text-slate-400" strokeWidth={2.2} />
          </>
        )}
      </div>
    </>
  );
}
