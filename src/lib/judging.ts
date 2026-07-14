// 심사(평가) 기간 — 클라이언트/서버 공용 (외부 의존 없음).
// 평가 가능: 2026-07-15(수) 13:00 ~ 2026-07-20(월) 11:00 (한국 시간, KST)
// 기존 코드와 동일하게 "KST 시계값을 UTC 숫자로" 비교한다.

export const JUDGING_START_LABEL = "2026. 7. 15 (수) 오후 1시";
export const JUDGING_END_LABEL = "2026. 7. 20 (월) 오전 11시";
export const JUDGING_PERIOD_LABEL = `${JUDGING_START_LABEL} ~ ${JUDGING_END_LABEL}`;

// 배점 안내
export const SCORE_RULE_LABEL =
  "실/팀장 평가 80점 (혁신성 40 + 완성도 40 + 활용도 20 = 100점을 80점으로 환산) + 좋아요 20점 (좋아요 1개당 1점, 최대 20점)";

function kstNowAsUtc(): number {
  const now = new Date();
  const kst = new Date(now.getTime() + (9 * 60 - now.getTimezoneOffset()) * 60000);
  return Date.UTC(
    kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate(),
    kst.getUTCHours(), kst.getUTCMinutes(),
  );
}

export function isJudgingOpen(): boolean {
  const start = Date.UTC(2026, 6, 15, 13, 0); // 7/15 13:00 KST
  const end = Date.UTC(2026, 6, 20, 11, 0);   // 7/20 11:00 KST
  const now = kstNowAsUtc();
  return now >= start && now < end;
}

// 최종 점수 계산 — 심사 raw(0-100) × 0.8 + 좋아요(1개당 1점, 최대 20)
export function computeFinalScore(judgeRaw: number, likeCount: number) {
  const judgeScore = (judgeRaw / 100) * 80; // 0-80
  const likeScore = Math.min(likeCount, 20); // 0-20
  return Math.round((judgeScore + likeScore) * 10) / 10;
}
