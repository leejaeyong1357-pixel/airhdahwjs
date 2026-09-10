// AX LAB 작품 분류 단계 — 라벨·색상은 이 파일 하나만 고치면 전 화면에 반영된다.
export type AxStage = 1 | 2 | 3 | 4;

export const AX_STAGES: Record<AxStage, {
  stage: AxStage;
  /** 단계 이름만 (보류 / 과제성 / 고도화 / 적용완료) */
  name: string;
  /** 표 머리글용 — "1단계 (보류)" */
  head: string;
  /** 배지·안내용 — "1단계 · 보류" */
  label: string;
  desc: string;
  /** 표 숫자 색 */
  num: string;
  /** 연한 배지 */
  soft: string;
  /** 진한 배지 */
  solid: string;
  /** 안내 카드 테두리·배경 */
  card: string;
  /** 컨텍스트 메뉴 점 색 */
  dot: string;
}> = {
  1: {
    stage: 1, name: "보류", head: "1단계 (보류)", label: "1단계 · 보류",
    desc: "추가 고도화 없이 보관합니다.",
    num: "text-slate-500", soft: "bg-slate-400/15 text-slate-600", solid: "bg-slate-400 text-white",
    card: "border-slate-300 bg-slate-50", dot: "bg-slate-400",
  },
  2: {
    stage: 2, name: "과제성", head: "2단계 (과제성)", label: "2단계 · 과제성",
    desc: "과제로 다룰 가치가 있어 보완이 필요합니다.",
    num: "text-orange-600", soft: "bg-orange-400/15 text-orange-600", solid: "bg-orange-500 text-white",
    card: "border-orange-300 bg-orange-50", dot: "bg-orange-500",
  },
  3: {
    stage: 3, name: "고도화", head: "3단계 (고도화)", label: "3단계 · 고도화",
    desc: "AX협의체와 함께 고도화를 진행합니다.",
    num: "text-blue-600", soft: "bg-blue-500/15 text-blue-600", solid: "bg-blue-600 text-white",
    card: "border-blue-300 bg-blue-50", dot: "bg-blue-600",
  },
  4: {
    stage: 4, name: "적용완료", head: "4단계 (적용완료)", label: "4단계 · 적용완료",
    desc: "실제 업무에 적용되어 운영 중입니다.",
    num: "text-emerald-600", soft: "bg-emerald-500/15 text-emerald-600", solid: "bg-emerald-500 text-white",
    card: "border-emerald-300 bg-emerald-50", dot: "bg-emerald-500",
  },
};

export const AX_STAGE_LIST: AxStage[] = [1, 2, 3, 4];

export const AX_STATUS: Record<string, { label: string; tone: string }> = {
  requested: { label: "신청 완료", tone: "bg-primary/10 text-primary" },
  reviewing: { label: "AX협의체 검토중", tone: "bg-amber-400/15 text-amber-600" },
  security: { label: "보안검증중", tone: "bg-orange-400/15 text-orange-600" },
  approved: { label: "승인", tone: "bg-emerald-500/15 text-emerald-600" },
  saas: { label: "SaaS 등록 완료", tone: "bg-blue-500/15 text-blue-600" },
  rejected: { label: "반려", tone: "bg-destructive/10 text-destructive" },
};
