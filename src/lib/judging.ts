// 심사(평가) 기간 — 클라이언트/서버 공용 (외부 의존 없음).
// 평가 가능: 2026-07-16(목) 06:00 ~ 2026-07-20(월) 11:00 (한국 시간, KST)

export const JUDGING_START_LABEL = "상시";
export const JUDGING_END_LABEL = "상시";
export const JUDGING_PERIOD_LABEL = "상시 평가 가능 (기간 제한 없음)";

// 배점 안내
export const SCORE_RULE_LABEL =
  "실/팀장 평가 80점 (혁신성 40 + 완성도 40 + 활용도 20 = 100점을 80점으로 환산) + 좋아요 20점 (좋아요 1개당 1점, 최대 20점)";

// 실제 UTC 기준 시각(ms). created_at(ISO, 실제 UTC)과 바로 비교할 수 있다.
// KST 시각에서 9시간을 빼면 그 순간의 실제 UTC epoch 이 된다.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
export const JUDGING_START_UTC_MS = Date.UTC(2026, 6, 16, 6, 0) - KST_OFFSET_MS; // 7/16 06:00 KST
export const JUDGING_END_UTC_MS = Date.UTC(2026, 6, 20, 11, 0) - KST_OFFSET_MS;  // 7/20 11:00 KST

export function isJudgingOpen(): boolean {
  // 평가 기간 제한 없음 — 상시 평가 가능.
  return true;
}

// 최종 점수 계산 — 심사 raw(0-100) × 0.8 + 좋아요(1개당 1점, 최대 20)
export function computeFinalScore(judgeRaw: number, likeCount: number) {
  const judgeScore = (judgeRaw / 100) * 80; // 0-80
  const likeScore = Math.min(likeCount, 20); // 0-20
  return Math.round((judgeScore + likeScore) * 10) / 10;
}
