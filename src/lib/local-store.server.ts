// 로컬 파일 저장소 — Supabase 대신 서버 컴퓨터의 data/db.json 에 저장한다.
// 업로드 파일(썸네일·작품 파일)은 public/media/ 아래에 저장되어 정적으로 서빙된다.
// 서버 함수에서만 import 할 것 (클라이언트 번들 금지).
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { getRequest } from "@tanstack/react-start/server";

export type StoreUser = {
  name: string;
  empNo: string;
  position: string;
  team?: string;
  roles: ("participant" | "judge" | "admin")[];
  role: string;
};

export type Store = {
  submissions: any[];
  likes: any[];
  comments: any[];
  evaluations: any[];
  teams: any[];
  /** 사번 → 변경된 비밀번호(sha256). 없으면 아직 초기 비밀번호(주민번호 앞6자리) 상태 */
  passwords: Record<string, string>;
  /** 사번 → 개인정보 동의 시각(ISO) */
  consents: Record<string, string>;
  /** 팀장(평가자) 화면에서 숨길 사번 목록 (직급 M1 등). 관리자가 밴/해제. */
  bannedFromJudges: string[];
};

// 초기 밴 목록 시드 — 직급 M1 (고빛나·임보라·양선미). 기존 db.json 에도 자동 적용.
const DEFAULT_BANNED = ["82211553", "82211017", "82210701"];

const EMPTY: Store = {
  submissions: [], likes: [], comments: [], evaluations: [], teams: [],
  passwords: {}, consents: {}, bannedFromJudges: [...DEFAULT_BANNED],
};

function storePath() {
  return join(process.cwd(), "data", "db.json");
}

export function readStore(): Store {
  try {
    const raw = readFileSync(storePath(), "utf8");
    return { ...EMPTY, ...JSON.parse(raw) };
  } catch {
    return { ...EMPTY };
  }
}

export function writeStore(store: Store) {
  const path = storePath();
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(store, null, 2));
  renameSync(tmp, path);
}

/** 클라이언트(auth-attacher)가 붙여주는 x-teczen-user 헤더에서 로그인 사용자 읽기 */
export function getRequestUser(): StoreUser | null {
  const request = getRequest();
  const header = request?.headers?.get("x-teczen-user");
  if (!header) return null;
  try {
    return JSON.parse(Buffer.from(header, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

export function requireUser(): StoreUser {
  const user = getRequestUser();
  if (!user?.empNo) throw new Error("로그인이 필요합니다.");
  return user;
}

export function hashPassword(pw: string): string {
  return createHash("sha256").update(pw).digest("hex");
}

/** 헤더의 역할 주장을 믿지 않고, DB 명단(서버 원본)에서 실제 역할을 재확인한다. */
async function requireRosterRole(roles: DbRole[], message: string): Promise<StoreUser> {
  const user = requireUser();
  const roster = await loadRoster();
  const person = roster.get(user.empNo);
  if (!person || !roles.some((r) => person.roles.includes(r))) throw new Error(message);
  return user;
}

export async function requireAdmin(): Promise<StoreUser> {
  return requireRosterRole(["admin"], "관리자 권한이 필요합니다.");
}

export async function requireJudgeOrAdmin(): Promise<StoreUser> {
  return requireRosterRole(["judge", "admin"], "심사위원 또는 관리자만 볼 수 있습니다.");
}

export function profileOf(user: StoreUser) {
  return { name: user.name, team: user.team ?? "", position: user.position, employee_no: user.empNo };
}

/**
 * 사번(user_id)의 최신 프로필을 DB 명단에서 조회한다.
 * 명단에 있으면 DB 기준(팀·직급·이름 최신)으로, 없으면 저장된 스냅샷으로 대체.
 * → 제출 이후 DB에서 팀을 채워 넣어도 갤러리/상세에 바로 반영된다.
 */
export function liveProfile(
  roster: Map<string, DbPerson>,
  empNo: string,
  fallback?: { name?: string; team?: string; position?: string },
) {
  const p = roster.get(empNo);
  if (p) return { name: p.name, team: p.team ?? "", position: p.position, employee_no: empNo };
  return {
    name: fallback?.name ?? "",
    team: fallback?.team ?? "",
    position: fallback?.position ?? "",
    employee_no: empNo,
  };
}

export function mediaUrl(bucket: string, path: string) {
  return path ? `/media/${bucket}/${path}` : "";
}

// ---------- DB 파일(사용자 명단) 파서 ----------

export type DbRole = "participant" | "judge" | "admin";
export type DbPerson = {
  name: string;
  position: string;
  team: string;
  empNo: string;
  password: string; // 주민번호 앞 6자리
  roles: DbRole[];
};

const SECTION_ROLES: Record<string, DbRole> = {
  참여자: "participant",
  평가자: "judge",
  관리자: "admin",
};

export function parseRosterText(text: string): Map<string, DbPerson> {
  const people = new Map<string, DbPerson>();
  let currentRole: DbRole | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const compact = line.replace(/\s+/g, "");
    if (SECTION_ROLES[compact]) {
      currentRole = SECTION_ROLES[compact];
      continue;
    }
    if (!currentRole) continue;
    if (compact.includes("이름") && compact.includes("사번")) continue; // 헤더 행

    const tokens = line.split(/\s+/).filter(Boolean);
    const empNo = tokens.find((t) => /^\d{7,}$/.test(t));
    if (!empNo) continue;

    const afterEmpNo = tokens.slice(tokens.indexOf(empNo) + 1);
    const password =
      afterEmpNo.find((t) => /^\d{6}$/.test(t)) ??
      tokens.filter((t) => /^\d{6}$/.test(t) && t !== empNo).pop();
    if (!password) continue;

    const words = tokens.filter((t) => !/^\d+$/.test(t));
    const name = words[0];
    const position = words[1] ?? "";
    const team = words[2] ?? ""; // DB 파일에 직급 뒤 팀명을 추가하면 표시된다
    if (!name) continue;

    const existing = people.get(empNo);
    if (existing) {
      if (!existing.roles.includes(currentRole)) existing.roles.push(currentRole);
      if (team && !existing.team) existing.team = team;
    } else {
      people.set(empNo, { name, position, team, empNo, password, roles: [currentRole] });
    }
  }
  return people;
}

export async function loadRoster(): Promise<Map<string, DbPerson>> {
  const candidates = [
    process.env.DB_FILE,
    join(process.cwd(), "DB"),
    join(process.cwd(), "DB.txt"),
    join(process.cwd(), "db"),
    join(process.cwd(), "db.txt"),
  ].filter(Boolean) as string[];

  for (const path of candidates) {
    if (existsSync(path)) return parseRosterText(readFileSync(path, "utf8"));
  }
  throw new Error("DB 파일을 찾을 수 없습니다. 프로젝트 폴더에 'DB' 파일을 두세요.");
}
