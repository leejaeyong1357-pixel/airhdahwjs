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
  /** 단계 안내 카드에만 덧붙는 부연 설명 */
  note?: string;
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
    desc: "추가 고도화 없이 보관",
    num: "text-slate-500", soft: "bg-slate-400/15 text-slate-600", solid: "bg-slate-400 text-white",
    card: "border-slate-300 bg-slate-50", dot: "bg-slate-400",
  },
  2: {
    stage: 2, name: "과제성", head: "2단계 (과제성)", label: "2단계 · 과제성",
    desc: "보완이 필요한 과제",
    num: "text-orange-600", soft: "bg-orange-400/15 text-orange-600", solid: "bg-orange-500 text-white",
    card: "border-orange-300 bg-orange-50", dot: "bg-orange-500",
  },
  3: {
    stage: 3, name: "고도화", head: "3단계 (고도화)", label: "3단계 · 고도화",
    desc: "AX협의체와 고도화 진행",
    num: "text-blue-600", soft: "bg-blue-500/15 text-blue-600", solid: "bg-blue-600 text-white",
    card: "border-blue-300 bg-blue-50", dot: "bg-blue-600",
  },
  4: {
    stage: 4, name: "적용완료", head: "4단계 (적용완료)", label: "4단계 · 적용완료",
    desc: "사용 중 · 선승인 후 고도화",
    note: "이미 업무에 적용해 쓰고 있는 작품입니다. 전사 확산 전에 보안검증과 고도화를 거쳐야 하므로 '선승인 후 고도화'로 진행합니다.",
    num: "text-emerald-600", soft: "bg-emerald-500/15 text-emerald-600", solid: "bg-emerald-500 text-white",
    card: "border-emerald-300 bg-emerald-50", dot: "bg-emerald-500",
  },
};

export const AX_STAGE_LIST: AxStage[] = [1, 2, 3, 4];

// ── 진행 10단계 ─────────────────────────────────────────────
// 신청 건의 status 가 곧 현재 단계다. 협의체가 status 를 바꾸면 화면의
// 단계 표시도 함께 움직인다. 1단계(작품 등록)는 신청 이전이라 status 가 없다.
export type AxStepKey =
  | "requested" | "reviewing" | "developing" | "field" | "security"
  | "approved" | "saas" | "serial" | "rollout";

export const AX_STEPS: { n: number; key: AxStepKey | null; label: string; desc: string }[] = [
  { n: 1, key: null, label: "작품 등록", desc: "아이디어를 제안합니다." },
  { n: 2, key: "requested", label: "고도화 신청", desc: "고도화를 신청합니다." },
  { n: 3, key: "reviewing", label: "AX협의체 검토", desc: "실현 가능성과 효과를 검토합니다." },
  { n: 4, key: "developing", label: "고도화 개발", desc: "본인이 직접 기능을 고도화합니다." },
  { n: 5, key: "field", label: "현장 검증 · 업무 적용", desc: "실제 업무에 적용해 효과를 확인합니다." },
  { n: 6, key: "security", label: "보안 검증", desc: "1차(본인) · 2차(AX협의체)" },
  { n: 7, key: "approved", label: "SaaS 승인", desc: "서비스 전환을 승인합니다." },
  { n: 8, key: "saas", label: "SaaS 등록", desc: "사내 SaaS로 등록합니다." },
  { n: 9, key: "serial", label: "공식 일련번호 발급", desc: "테크젠 공식 일련번호를 발급합니다." },
  { n: 10, key: "rollout", label: "전사 확산", desc: "전사에 공유하고 활용합니다." },
];

/** 신청 status → 몇 단계인지 */
export const STEP_OF: Record<string, number> = Object.fromEntries(
  AX_STEPS.filter((s) => s.key).map((s) => [s.key as string, s.n]),
);

export const AX_STATUS: Record<string, { label: string; tone: string }> = {
  requested: { label: "고도화 신청", tone: "bg-blue-500/10 text-blue-600" },
  reviewing: { label: "AX협의체 검토", tone: "bg-amber-400/15 text-amber-600" },
  developing: { label: "고도화 개발", tone: "bg-violet-500/15 text-violet-600" },
  field: { label: "현장 검증 · 업무 적용", tone: "bg-sky-500/15 text-sky-600" },
  security: { label: "보안 검증", tone: "bg-orange-400/15 text-orange-600" },
  approved: { label: "SaaS 승인", tone: "bg-emerald-500/15 text-emerald-600" },
  saas: { label: "SaaS 등록", tone: "bg-blue-500/15 text-blue-600" },
  serial: { label: "공식 일련번호 발급", tone: "bg-indigo-500/15 text-indigo-600" },
  rollout: { label: "전사 확산", tone: "bg-emerald-600/15 text-emerald-700" },
  rejected: { label: "반려", tone: "bg-destructive/10 text-destructive" },
};
