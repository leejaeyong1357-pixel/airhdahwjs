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

// ── AI 개발 · 고도화 및 SaaS 인증 절차 ──────────────────────
// 신청 건의 status 가 곧 현재 위치다.
//
//  [고도화 신청 및 지원]
//   AI 개발 → 셀프 보안점검 ─70점 이상→ 고도화 신청            (신청자)
//            └─70점 미만 · 보완─┘          │
//                                           ▼ requested   신청 승인        (AX 담당자)
//                                             planning    지원방안 수립    (AX협의체)
//                                                          → 이메일 통보    (AX 담당자)
//  [고도화 및 SaaS 인증]
//   developing  고도화 → 셀프 보안점검 ─70점 이상→ SaaS 승인 신청  (신청자)
//   review      승인 협의 (보안 · 실효성 검토)                      (AX협의체)
//                 ├ 반려 → 반려 사유 안내 → developing 으로 (보완 후 셀프 보안점검)
//                 └ 승인 → issued  SaaS 인증 부여 (번호 발급)       (AX협의체)
//                                   → 업무시스템 등록 (registeredAt) (AX 담당자)
export type AxStatus = "requested" | "planning" | "developing" | "review" | "issued" | "rejected";

/** 셀프 보안점검 통과 점수 */
export const SECURITY_PASS_SCORE = 70;

export const AX_STATUS: Record<string, { label: string; tone: string }> = {
  requested: { label: "신청 승인 대기", tone: "bg-blue-500/10 text-blue-600" },
  planning: { label: "지원방안 수립", tone: "bg-sky-500/15 text-sky-700" },
  developing: { label: "고도화 · 재점검", tone: "bg-violet-500/15 text-violet-600" },
  review: { label: "SaaS 승인 협의", tone: "bg-amber-400/15 text-amber-600" },
  issued: { label: "SaaS 인증 완료", tone: "bg-emerald-500/15 text-emerald-600" },
  rejected: { label: "반려", tone: "bg-destructive/10 text-destructive" },
};

/** 신청자 화면의 6단계 진행 표시 */
export const AX_PROGRESS_STEPS = [
  "개발 · 점검",
  "신청 승인",
  "지원방안 수립",
  "고도화 · 재점검",
  "SaaS 신청",
  "인증 · 등록",
] as const;

/** 아직 진행 중인 신청 (승인 완료·반려 제외) — '신청' 집계 기준 */
export const isOpenRequest = (r: { status: string } | null | undefined) =>
  !!r && r.status !== "rejected" && r.status !== "issued";

/**
 * 신청 상태 → 신청자 화면에 보여줄 현재 위치.
 *   step   : 1~6 (AX_PROGRESS_STEPS 순서)
 *   done   : 6단계까지 모두 끝남
 *   action : 신청자가 지금 할 수 있는 일
 */
export function progressOf(r: any | null | undefined): {
  step: number; done: boolean; title: string; desc: string; next: string;
  action: "apply" | "reapply" | "saas" | "cert" | null;
} {
  if (!r) {
    return {
      step: 1, done: false, title: "개발 · 점검 중", action: "apply",
      desc: `AI 개발 후 셀프 보안점검 ${SECURITY_PASS_SCORE}점 이상이면 고도화를 신청할 수 있습니다.`,
      next: "셀프 보안점검 후 고도화 신청",
    };
  }
  switch (r.status) {
    case "rejected":
      return {
        step: 1, done: false, title: "신청 반려 · 보완 필요", action: "reapply",
        desc: "반려 사유를 확인하고 보완해서 다시 신청해 주세요.",
        next: "반려 사유 확인 후 보완해서 다시 신청",
      };
    case "requested":
      return {
        step: 2, done: false, title: "신청 승인 대기 중", action: null,
        desc: "AX 담당자가 신청 내용을 확인하고 있습니다.",
        next: "신청 승인 결과 안내 대기",
      };
    case "planning":
      return {
        step: 3, done: false, title: "고도화 지원방안 수립 중", action: null,
        desc: "AX협의체 검토 후 이메일로 안내드립니다.",
        next: "지원방안 안내 메일 확인 후 고도화 진행",
      };
    case "developing":
      return r.rejectedFrom === "review"
        ? {
            step: 4, done: false, title: "SaaS 승인 반려 · 보완 필요", action: "saas",
            desc: `반려 사유를 보완한 뒤 셀프 보안점검(${SECURITY_PASS_SCORE}점 이상)을 다시 하고 SaaS 승인을 신청하세요.`,
            next: "보완 후 셀프 보안점검 → SaaS 승인 신청",
          }
        : {
            step: 4, done: false, title: "고도화 · 재점검 중", action: "saas",
            desc: `고도화를 마치고 셀프 보안점검 ${SECURITY_PASS_SCORE}점 이상이면 최신 결과물로 SaaS 승인을 신청합니다.`,
            next: "고도화 후 셀프 보안점검 → SaaS 승인 신청",
          };
    case "review":
      return {
        step: 5, done: false, title: "SaaS 승인 협의 중", action: null,
        desc: "AX협의체가 보안 · 실효성을 검토하고 있습니다.",
        next: "승인 협의 결과 안내 대기",
      };
    case "issued":
      if (!r.saas?.number) {
        return {
          step: 6, done: false, title: "SaaS 인증 부여 중", action: null,
          desc: "승인되었습니다. AX협의체가 SaaS 인증번호를 부여하고 있습니다.",
          next: "SaaS 인증번호 발급 대기",
        };
      }
      return r.registeredAt
        ? {
            step: 6, done: true, title: "인증 · 등록 완료", action: "cert",
            desc: `SaaS 인증번호 ${r.saas.number} · 업무시스템 등록이 끝났습니다.`,
            next: "업무에 활용하세요",
          }
        : {
            step: 6, done: false, title: "업무시스템 등록 중", action: "cert",
            desc: `SaaS 인증번호 ${r.saas.number} 가 부여되었습니다. AX 담당자가 업무시스템에 등록합니다.`,
            next: "인증서 확인 · 업무시스템 등록 대기",
          };
  }
  return { step: 1, done: false, title: "", desc: "", next: "", action: null };
}

/** 고도화 신청 화면 옆에 보여주는 '신청 후 진행 과정' */
export const AX_AFTER_SUBMIT_STEPS = [
  { title: "신청 승인", desc: "AX 담당자가 신청 내용을 확인합니다. 반려되면 사유를 알려드립니다." },
  { title: "고도화 지원방안 수립", desc: "AX협의체가 지원방안을 정해 이메일로 안내합니다." },
  { title: "고도화 · 재점검", desc: `본인이 고도화하고 셀프 보안점검 ${SECURITY_PASS_SCORE}점 이상을 받습니다.` },
  { title: "SaaS 승인 신청", desc: "최신 결과물을 올려 승인을 신청합니다. 반려되면 보완 후 다시 점검합니다." },
  { title: "SaaS 인증 · 업무시스템 등록", desc: "테크젠 공식 인증번호와 인증서를 받고 업무시스템에 등록됩니다." },
];

/** 신청 첨부파일 경로 → 내려받기 주소 (예전 건은 앞부분 없이 저장돼 있다) */
export function axFileUrl(path?: string) {
  if (!path) return "";
  return path.startsWith("/") ? path : `/media/ax-attachments/${path}`;
}

/** 사번 → 사내 메일 주소 (메일 작성 창을 미리 채우는 용도 — 보내기 전에 확인) */
export const mailOf = (empNo?: string) => (empNo ? `${empNo}@teczen.kr` : "");

/** 기본 메일 프로그램(아웃룩 등)에 받는사람·제목·내용을 채워 연다 */
export function openMail(to: string, subject: string, body: string) {
  const q = `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = `mailto:${to}?${q}`;
}

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
