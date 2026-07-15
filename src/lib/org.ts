// 조직도 — 4실 + 직속(부서) 아래 15개 팀. 클라이언트/서버 공용 (외부 의존 없음).
// DB 명단에는 팀(부서)만 저장되므로, 팀 → 실 매핑을 여기서 관리한다.
//
// 사용자 확인 기준(2026):
//   직속(부서): 재경팀, 사업기획팀
//   경영지원실: 미래성장팀, 비즈니스솔루션팀
//   PT생산실:   PT생산1팀, PT생산2팀, PT생산관리팀
//   엔진생산실: 엔진생산1팀, 엔진생산2팀, 엔진생산3팀, 엔진생산관리팀, 엔진보전팀
//   품질관리실: PT품질관리팀, 엔진품질관리1팀, 엔진품질관리2팀
// ※ "직속"은 실이 아니라 부서 단위 묶음이다.

export type OrgGroup = {
  /** 화면에 보이는 이름 */
  name: string;
  /** 실이 아니라 직속(부서) 묶음인지 */
  isDept?: boolean;
  /** 이 묶음에 속한 팀들 (정렬 순서 그대로 표시) */
  teams: string[];
};

export const ORG: OrgGroup[] = [
  { name: "직속 (부서)", isDept: true, teams: ["재경팀", "사업기획팀"] },
  { name: "경영지원실", teams: ["미래성장팀", "비즈니스솔루션팀"] },
  { name: "PT생산실", teams: ["PT생산1팀", "PT생산2팀", "PT생산관리팀"] },
  { name: "엔진생산실", teams: ["엔진생산1팀", "엔진생산2팀", "엔진생산3팀", "엔진생산관리팀", "엔진보전팀"] },
  { name: "품질관리실", teams: ["PT품질관리팀", "엔진품질관리1팀", "엔진품질관리2팀"] },
];

/** 모든 실 이름 (실 직속/실장 레벨 항목을 흡수하기 위해 사용) */
const SIL_NAMES = new Set(ORG.filter((g) => !g.isDept).map((g) => g.name));

/** 팀명 표기 흔들림 보정: "PT생산1팀_서산파견" 같은 파견/접미 변형 → 기본 팀명 */
export function normalizeTeam(raw?: string): string {
  const t = (raw ?? "").trim();
  if (!t) return "";
  // 언더바/괄호 뒤 파견·부기 제거
  const base = t.split(/[_(]/)[0].trim();
  return base || t;
}

/** 팀명이 실(室) 이름인지 (실장/실 직속 판별용). */
export function isSilName(rawTeam?: string): boolean {
  return SIL_NAMES.has(normalizeTeam(rawTeam));
}

/** 팀 → 소속 실(또는 "직속 (부서)") 이름. 매핑에 없으면 null. */
export function silOfTeam(rawTeam?: string): string | null {
  const team = normalizeTeam(rawTeam);
  if (!team) return null;
  // 실 이름 자체(실장/실 직속)면 해당 실로
  if (SIL_NAMES.has(team)) return team;
  for (const g of ORG) {
    if (g.teams.includes(team)) return g.name;
  }
  return null;
}

/**
 * 평가 범위 — 평가자(실장/팀장)는 "본인이 속한 실"의 작품만 평가한다.
 * - 실장(team = 실명)  → 그 실 전체
 * - 팀장(team = 팀명)  → 그 팀이 속한 실 전체 (실 내 모든 팀)
 * 두 사람의 소속 실이 같으면 true.
 */
export function sameSil(judgeTeam?: string, authorTeam?: string): boolean {
  const js = silOfTeam(judgeTeam);
  const as = silOfTeam(authorTeam);
  return js !== null && js === as;
}
