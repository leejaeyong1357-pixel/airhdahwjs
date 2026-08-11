// AI 협의체 — 당선된 7명(위원)과 각자 담당(선정 대상) 팀. 클라이언트/서버 공용.
export type CouncilMember = { empNo: string; name: string; scope: string; teams: string[] };

export const COUNCIL: CouncilMember[] = [
  { empNo: "82211494", name: "정지운", scope: "직속 (부서)", teams: ["재경팀", "사업기획팀"] },
  { empNo: "82210857", name: "이상욱", scope: "경영지원실", teams: ["미래성장팀", "비즈니스솔루션팀"] },
  { empNo: "82210813", name: "윤혁진", scope: "PT생산실", teams: ["PT생산1팀", "PT생산2팀", "PT생산관리팀"] },
  { empNo: "82211504", name: "박근호", scope: "엔진생산실", teams: ["엔진생산관리팀", "엔진생산1팀", "엔진생산2팀", "엔진생산3팀", "엔진보전팀"] },
  { empNo: "82211618", name: "오세정", scope: "엔진품질관리", teams: ["엔진품질관리1팀", "엔진품질관리2팀"] },
  { empNo: "82210626", name: "손경철", scope: "PT품질관리", teams: ["PT품질관리팀"] },
  { empNo: "82211474", name: "소종진", scope: "경영지원실", teams: ["미래성장팀", "비즈니스솔루션팀"] },
];

export const COUNCIL_MAX_PICKS = 3;

export function councilMember(empNo?: string): CouncilMember | null {
  if (!empNo) return null;
  return COUNCIL.find((c) => c.empNo === empNo) ?? null;
}

export function isCouncil(empNo?: string): boolean {
  return !!councilMember(empNo);
}

// 혁신과제 선정 '결과'만 열람 가능한 사번 (관리자 아님, 선정도 안 함 — 결과 확인 전용)
//   82210350 김충환
export const COUNCIL_RESULT_VIEWERS = ["82210350"];
export function isCouncilResultViewer(empNo?: string): boolean {
  return !!empNo && COUNCIL_RESULT_VIEWERS.includes(empNo);
}
