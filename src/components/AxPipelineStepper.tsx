import { Fragment } from "react";
import {
  FileText, Send, Users, Settings, BarChart3, Shield, CheckCircle2, Cloud, Award, TrendingUp, ChevronRight, ChevronDown,
} from "lucide-react";

type Step = { n: string; title: string; desc: string; icon: any; highlight?: boolean };

const ROW_1: Step[] = [
  { n: "01", title: "작품 등록", desc: "아이디어를 제안합니다.", icon: FileText },
  { n: "02", title: "고도화 신청", desc: "고도화를 신청합니다.", icon: Send },
  { n: "03", title: "AX협의체 검토", desc: "실현 가능성과 효과를 검토합니다.", icon: Users },
  { n: "04", title: "고도화 개발", desc: "기능을 고도화합니다.", icon: Settings },
  { n: "05", title: "현장 검증 · 업무 적용", desc: "실제 업무 활용 · 효과 확인", icon: BarChart3, highlight: true },
];

const ROW_2: Step[] = [
  { n: "06", title: "보안 검증", desc: "보안 요건을 검토합니다.", icon: Shield },
  { n: "07", title: "SaaS 승인", desc: "서비스 전환을 승인합니다.", icon: CheckCircle2 },
  { n: "08", title: "SaaS 등록", desc: "SaaS로 등록합니다.", icon: Cloud },
  { n: "09", title: "테크젠 공식 SaaS 일련번호 발급", desc: "공식 일련번호를 발급합니다.", icon: Award },
  { n: "10", title: "전사 확산", desc: "전사로 확산합니다.", icon: TrendingUp },
];

function StepCard({ s }: { s: Step }) {
  return (
    <div
      className={`flex flex-1 flex-col gap-1.5 rounded-xl border px-3.5 py-3 ${
        s.highlight ? "border-blue-600 bg-blue-600 shadow-md shadow-blue-600/25" : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-start gap-2">
        <span
          className={`grid h-6 w-7 shrink-0 place-items-center rounded-md text-[12px] font-black ${
            s.highlight ? "bg-white/20 text-white" : "bg-blue-50 text-blue-600"
          }`}
        >
          {s.n}
        </span>
        <s.icon className={`mt-0.5 h-[17px] w-[17px] shrink-0 ${s.highlight ? "text-white" : "text-blue-500"}`} />
        <span className={`break-keep text-[13.5px] font-black leading-tight ${s.highlight ? "text-white" : "text-slate-900"}`}>
          {s.title}
        </span>
      </div>
      <div className={`break-keep text-[12px] leading-snug ${s.highlight ? "text-white/85" : "text-slate-500"}`}>
        {s.desc}
      </div>
    </div>
  );
}

function StepRow({ steps }: { steps: Step[] }) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
      {steps.map((s, i) => (
        <Fragment key={s.n}>
          <StepCard s={s} />
          {i < steps.length - 1 && (
            <ChevronRight className="hidden h-4 w-4 shrink-0 self-center text-slate-300 lg:block" />
          )}
        </Fragment>
      ))}
    </div>
  );
}

/** 아이디어 제안부터 전사 확산까지 10단계 흐름. */
export function AxPipelineStepper() {
  return (
    <section className="rounded-2xl border border-slate-200 bg-[#f7faff] p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-[19px] font-black tracking-tight text-slate-900">아이디어에서 업무 적용까지</h2>
        <p className="text-[13px] text-slate-500">개발로 끝나지 않고, 현장 검증과 업무 적용을 거쳐 전사로 확산합니다.</p>
      </div>

      <div className="mt-4">
        <StepRow steps={ROW_1} />

        {/* 1행 → 2행으로 이어지는 연결선 */}
        <div aria-hidden className="relative hidden h-7 w-full lg:block">
          <div className="absolute left-[8%] right-[8%] top-0 h-4 rounded-b-2xl border-b-2 border-l-2 border-r-2 border-slate-200" />
          <ChevronDown className="absolute left-[8%] top-3 h-4 w-4 -translate-x-1/2 text-slate-300" />
        </div>
        <div className="h-3 lg:hidden" />

        <StepRow steps={ROW_2} />
      </div>
    </section>
  );
}

/** 신청 이후 진행 과정 (사이드 패널용) — AX협의체 검토부터 끝까지. */
export const AX_AFTER_SUBMIT_STEPS = [
  { title: "AX협의체 검토", desc: "신청 내용을 바탕으로 고도화 방향과 지원 범위를 검토합니다.", icon: Users },
  { title: "고도화 개발", desc: "검토 결과를 바탕으로 기능을 고도화합니다.", icon: Settings },
  { title: "현장 검증 · 업무 적용", desc: "실제 업무에 적용해 효과를 확인합니다.", icon: BarChart3 },
  { title: "보안 검증 · SaaS 승인", desc: "보안 요건을 확인하고 사내 서비스 전환을 승인합니다.", icon: Shield },
  { title: "SaaS 등록 · 전사 확산", desc: "공식 일련번호를 발급받아 등록하고, 전사에 확산합니다.", icon: Cloud },
];
