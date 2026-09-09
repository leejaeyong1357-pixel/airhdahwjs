import { FileText, Send, Users, ShieldCheck, CheckCircle2, Box, BarChart3, ChevronRight } from "lucide-react";

const STEPS = [
  { label: "작품 등록", icon: FileText },
  { label: "고도화 신청", icon: Send },
  { label: "AX협의체 검토", icon: Users },
  { label: "보안검증", icon: ShieldCheck },
  { label: "SaaS 승인", icon: CheckCircle2 },
  { label: "SaaS 등록", icon: Box },
  { label: "전사 확산", icon: BarChart3 },
];

/** 파이프라인 전체 흐름을 보여주는 가로 스텝퍼. activeIndex 를 주면 해당 단계까지 강조된다. */
export function AxPipelineStepper({ activeIndex }: { activeIndex?: number }) {
  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-3 overflow-x-auto rounded-2xl border border-border bg-card px-5 py-4">
      <span className="mr-2 shrink-0 text-[12px] font-black uppercase tracking-widest text-muted-foreground">업무 적용까지 한눈에</span>
      {STEPS.map((s, i) => {
        const active = activeIndex !== undefined && i <= activeIndex;
        return (
          <span key={s.label} className="flex shrink-0 items-center gap-1">
            <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12.5px] font-bold ${active ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}>
              <s.icon className="h-4 w-4" /> {s.label}
            </span>
            {i < STEPS.length - 1 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />}
          </span>
        );
      })}
    </div>
  );
}

/** 목표 대비 신청 비율 진행 바 (0-100%). */
export function AxProgressBar({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-9 shrink-0 text-right text-[12px] font-bold text-muted-foreground">{pct}%</span>
    </div>
  );
}

/** 신청 이후 진행 과정 (사이드 패널용) — AX협의체 검토부터 끝까지. */
export const AX_AFTER_SUBMIT_STEPS = [
  { title: "AX협의체 검토", desc: "신청 내용을 바탕으로 고도화 방향과 지원 범위를 검토합니다.", icon: Users },
  { title: "보안검증", desc: "데이터 사용 범위와 보안 요건을 확인합니다.", icon: ShieldCheck },
  { title: "SaaS 승인", desc: "검토 결과를 바탕으로 사내 서비스 적용을 승인합니다.", icon: CheckCircle2 },
  { title: "Techzen SaaS 등록", desc: "승인된 작품을 사내 SaaS로 등록하고, 구성원에게 안내합니다.", icon: Box },
  { title: "전사 확산", desc: "우수 사례로 선정되어 전사에 소개·확산됩니다.", icon: BarChart3 },
];
