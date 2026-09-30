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

// ── 고도화 진행 3단계 ───────────────────────────────────────
// 신청 건의 status 가 곧 현재 단계다. 단계 사이에는 AX협의체의 승인/반려 관문이 있다.
//
//   1단계 고도화 신청  ──[AX협의체 승인/반려]──▶  2단계 고도화
//                                                   │ (1차 보안검증 후 개발)
//                                                   ▼ 본인이 2차 승인 검토 요청
//                                            3단계 고도화 승인 검토
//                                                   │
//                              반려 ◀──────────────┴──────────────▶ 승인
//                         (2단계로 되돌림)                    SaaS 등록번호 발급
export type AxStepKey = "requested" | "developing" | "review" | "issued";

export const AX_STEPS: {
  n: number;
  key: AxStepKey;
  label: string;
  desc: string;
  /** 이 단계를 끝내는 사람 */
  actor: string;
  /** 다음 단계로 넘어가는 방법 */
  gate?: string;
}[] = [
  {
    n: 1, key: "requested", label: "고도화 신청",
    desc: "고도화하고 싶은 내용을 신청합니다.",
    actor: "신청자", gate: "AX협의체 승인 / 반려",
  },
  {
    n: 2, key: "developing", label: "고도화",
    desc: "1차 보안검증 프롬프트를 넣고 개발을 시작합니다.",
    actor: "신청자", gate: "본인이 2차 승인 검토 요청",
  },
  {
    n: 3, key: "review", label: "고도화 승인 검토",
    desc: "AX협의체가 실효성과 보안을 검토합니다.",
    actor: "AX협의체", gate: "승인 시 SaaS 등록번호 발급 · 반려 시 2단계로",
  },
  {
    n: 4, key: "issued", label: "SaaS 등록번호 발급",
    desc: "테크젠 공식 SaaS 번호를 발급하고 인증서를 드립니다.",
    actor: "AX협의체",
  },
];

/** 신청 status → 몇 단계인지 */
export const STEP_OF: Record<string, number> = Object.fromEntries(
  AX_STEPS.map((s) => [s.key as string, s.n]),
);

export const AX_STATUS: Record<string, { label: string; tone: string }> = {
  requested: { label: "승인 대기", tone: "bg-blue-500/10 text-blue-600" },
  developing: { label: "고도화 진행", tone: "bg-violet-500/15 text-violet-600" },
  review: { label: "승인 검토 중", tone: "bg-amber-400/15 text-amber-600" },
  issued: { label: "SaaS 등록 완료", tone: "bg-emerald-500/15 text-emerald-600" },
  rejected: { label: "반려", tone: "bg-destructive/10 text-destructive" },
};

// ── SaaS 등록번호 ───────────────────────────────────────────
// TZAX + 업무성격(2) + 년도(2) + 일련번호(3)   예) TZAXHR26001
export const SAAS_PREFIX = "TZAX";

export const SAAS_CATEGORIES: { code: string; label: string }[] = [
  { code: "QM", label: "품질" },
  { code: "PP", label: "생산" },
  { code: "BS", label: "비즈니스솔루션" },
  { code: "HR", label: "미래성장" },
  { code: "SP", label: "기획" },
  { code: "FI", label: "재경" },
  { code: "ET", label: "기타" },
];

export const SAAS_CATEGORY_LABEL: Record<string, string> =
  Object.fromEntries(SAAS_CATEGORIES.map((c) => [c.code, c.label]));

/** TZAX + 구분 + 년도 + 3자리 일련번호 */
export function formatSaasNumber(category: string, year: string, seq: number) {
  return `${SAAS_PREFIX}${category}${year}${String(seq).padStart(3, "0")}`;
}
