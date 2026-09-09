// AX LAB — 정식 관리자는 아니지만 AX LAB 관리자 화면(/ax-lab/manage)만
// 열람·운영할 수 있는 사번. 다른 관리자 화면(사용자·평가·순위 등)은 접근 불가.
//   82210350 김충환 팀장
export const AX_LAB_ADMIN_VIEWERS = ["82210350"];

export function isAxLabAdminViewer(empNo?: string): boolean {
  return !!empNo && AX_LAB_ADMIN_VIEWERS.includes(empNo);
}
