// 실시간 발표 평가 사이트 — 로컬 파일 저장소 (data/live-db.json).
// 기존 사내망 사이트와 분리된 새 저장소. 서버 함수에서만 import.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getRequest } from "@tanstack/react-start/server";

export type Phase = "idle" | "intro" | "presenting";

export type LiveWork = {
  id: string;
  order: number;
  name: string;      // 발표자
  team: string;
  position: string;
  empNo: string;
  title: string;     // 작품명
  tech: string;      // 기술 구현
  content: string;   // 작품 설명/내용
  thumbnail: string; // 이미지 URL (없으면 그라데이션 placeholder)
  base: number;      // 1차 사전 점수 (0-100, 최종의 70%)
};

export type Star = {
  workId: string;
  judgeEmpNo: string;
  judgeName: string;
  judgeTeam: string;
  createdAt: string;
};

export type LiveState = { workId: string | null; phase: Phase };
export type LiveStore = { works: LiveWork[]; stars: Star[]; live: LiveState };

// ── 로그인 규칙 ──────────────────────────────────────────────
export const ADMIN_EMP_NO = "82211489";
export const ADMIN_PASSWORD = "Dlwodyd1357!";
// 평가자 = 대표·상무·실장·팀장 (직급 기준)
export const JUDGE_POSITIONS = ["대표이사", "상무", "실장", "팀장"];

// ── 배점 ────────────────────────────────────────────────────
// 최종 = 1차(사전) 점수 + 현장 별점 보너스
// 평가자당 마음에 드는 작품 최대 5개에 별 1개씩. 별 1개 = 0.316점.
export const STAR_POINT = 0.316;
export const MAX_STARS = 5;

// ── 9명 시드 (1차 점수 포함, 내용은 관리자에서 수정) ─────────────
const SEED: Omit<LiveWork, "id" | "order">[] = [
  { name: "박운하", team: "비즈니스솔루션팀", position: "매니저", empNo: "82211473", base: 90.4, title: "", tech: "", content: "", thumbnail: "" },
  { name: "오세정", team: "엔진품질관리1팀", position: "매니저", empNo: "82211618", base: 88.2, title: "", tech: "", content: "", thumbnail: "" },
  { name: "양선미", team: "PT생산2팀", position: "매니저", empNo: "82210701", base: 84.5, title: "", tech: "", content: "", thumbnail: "" },
  { name: "김진겸", team: "엔진생산2팀", position: "매니저", empNo: "82210329", base: 83.9, title: "", tech: "", content: "", thumbnail: "" },
  { name: "성진욱", team: "PT생산2팀", position: "매니저", empNo: "82210624", base: 83.0, title: "", tech: "", content: "", thumbnail: "" },
  { name: "윤채영", team: "엔진생산관리팀", position: "매니저", empNo: "82211502", base: 82.0, title: "", tech: "", content: "", thumbnail: "" },
  { name: "김소진", team: "비즈니스솔루션팀", position: "매니저", empNo: "82211492", base: 80.6, title: "", tech: "", content: "", thumbnail: "" },
  { name: "서준현", team: "비즈니스솔루션팀", position: "매니저", empNo: "82210611", base: 70.0, title: "", tech: "", content: "", thumbnail: "" },
  { name: "윤영주", team: "PT품질관리팀", position: "책임매니저", empNo: "82210801", base: 69.5, title: "", tech: "", content: "", thumbnail: "" },
];

function makeSeed(): LiveStore {
  const works: LiveWork[] = SEED.map((w, i) => ({
    id: crypto.randomUUID(),
    order: i + 1,
    ...w,
    title: `${w.name} 발표 작품`,
    tech: "관리자 화면에서 기술 구현 내용을 입력하세요.",
    content: "관리자 화면에서 작품 설명을 입력하세요.",
  }));
  return { works, stars: [], live: { workId: null, phase: "idle" } };
}

function storePath() {
  return join(process.cwd(), "data", "live-db.json");
}

export function readLive(): LiveStore {
  try {
    const raw = readFileSync(storePath(), "utf8");
    const parsed = JSON.parse(raw) as LiveStore;
    if (!parsed.works || parsed.works.length === 0) {
      const seeded = makeSeed();
      writeLive(seeded);
      return seeded;
    }
    return { works: parsed.works, stars: parsed.stars ?? [], live: parsed.live ?? { workId: null, phase: "idle" } };
  } catch {
    const seeded = makeSeed();
    writeLive(seeded);
    return seeded;
  }
}

export function writeLive(store: LiveStore) {
  const path = storePath();
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(store, null, 2));
  renameSync(tmp, path);
}

// ── 인증 (x-teczen-user 헤더 — auth-attacher 미들웨어가 붙여줌) ──
export type SessionUser = { name: string; empNo: string; team?: string; position?: string; roles: string[]; role: string };

export function getSessionUser(): SessionUser | null {
  const request = getRequest();
  const header = request?.headers?.get("x-teczen-user");
  if (!header) return null;
  try {
    return JSON.parse(Buffer.from(header, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

export function requireAdmin(): SessionUser {
  const u = getSessionUser();
  if (!u || u.empNo !== ADMIN_EMP_NO || !u.roles?.includes("admin")) throw new Error("관리자만 접근할 수 있습니다.");
  return u;
}

export function requireJudge(): SessionUser {
  const u = getSessionUser();
  if (!u?.empNo) throw new Error("로그인이 필요합니다.");
  if (u.roles?.includes("admin") || u.roles?.includes("judge")) return u;
  throw new Error("평가자만 접근할 수 있습니다.");
}
