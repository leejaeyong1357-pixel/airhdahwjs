// 로컬 파일 저장소 — Supabase 대신 서버 컴퓨터의 data/db.json 에 저장한다.
// 업로드 파일(썸네일·작품 파일)은 public/media/ 아래에 저장되어 정적으로 서빙된다.
// 서버 함수에서만 import 할 것 (클라이언트 번들 금지).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { getRequest } from "@tanstack/react-start/server";

export type StoreUser = {
  name: string;
  empNo: string;
  position: string;
  roles: ("participant" | "judge" | "admin")[];
  role: string;
};

export type Store = {
  submissions: any[];
  likes: any[];
  comments: any[];
  evaluations: any[];
  teams: any[];
};

const EMPTY: Store = { submissions: [], likes: [], comments: [], evaluations: [], teams: [] };

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

export function requireAdmin(): StoreUser {
  const user = requireUser();
  if (!user.roles?.includes("admin")) throw new Error("관리자 권한이 필요합니다.");
  return user;
}

export function requireJudgeOrAdmin(): StoreUser {
  const user = requireUser();
  if (!user.roles?.includes("judge") && !user.roles?.includes("admin")) {
    throw new Error("심사위원 또는 관리자만 볼 수 있습니다.");
  }
  return user;
}

export function profileOf(user: StoreUser) {
  return { name: user.name, team: "", position: user.position, employee_no: user.empNo };
}

export function mediaUrl(bucket: string, path: string) {
  return path ? `/media/${bucket}/${path}` : "";
}

// ---------- DB 파일(사용자 명단) 파서 ----------

export type DbRole = "participant" | "judge" | "admin";
export type DbPerson = {
  name: string;
  position: string;
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
    if (!name) continue;

    const existing = people.get(empNo);
    if (existing) {
      if (!existing.roles.includes(currentRole)) existing.roles.push(currentRole);
    } else {
      people.set(empNo, { name, position, empNo, password, roles: [currentRole] });
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
