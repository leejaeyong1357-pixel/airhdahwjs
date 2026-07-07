import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * 프로젝트 루트의 `DB` 파일(탭/공백 구분 텍스트) 기반 로그인.
 *
 * 파일 형식 — 역할 이름(참여자/평가자/관리자)이 한 줄로 나오고,
 * 그 아래로 [순번, 이름, 직급, 사번, 주민번호 앞6자리] 행이 이어진다.
 * 열이 조금 밀려 있어도 되도록 "사번 = 7자리 이상 숫자, 비밀번호 = 6자리 숫자"
 * 패턴으로 각 행을 해석한다. 같은 사람이 여러 명단에 있으면 역할이 합쳐진다.
 * 파일은 로그인할 때마다 다시 읽으므로 명단 수정 후 서버 재시작이 필요 없다.
 */

export type DbRole = "participant" | "judge" | "admin";

type DbPerson = {
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

function parseDbText(text: string): Map<string, DbPerson> {
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

    // 비밀번호(주민번호 앞6자리): 사번 뒤쪽에서 우선 찾고, 없으면 행 전체에서 마지막 6자리 숫자
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

async function loadDb(): Promise<Map<string, DbPerson>> {
  const { readFileSync, existsSync } = await import("node:fs");
  const { join } = await import("node:path");
  const candidates = [
    process.env.DB_FILE,
    join(process.cwd(), "DB"),
    join(process.cwd(), "DB.txt"),
    join(process.cwd(), "db"),
    join(process.cwd(), "db.txt"),
  ].filter(Boolean) as string[];

  for (const path of candidates) {
    if (existsSync(path)) return parseDbText(readFileSync(path, "utf8"));
  }
  throw new Error("DB 파일을 찾을 수 없습니다. 프로젝트 폴더에 'DB' 파일을 두세요.");
}

const ROLE_LABEL: Record<DbRole, string> = {
  participant: "참여자",
  judge: "평가자",
  admin: "관리자",
};

export const loginWithDb = createServerFn({ method: "POST" })
  .inputValidator((d: { name: string; employeeNo: string; password: string; role: DbRole }) => {
    return z
      .object({
        name: z.string().trim().min(1).max(50),
        employeeNo: z.string().trim().regex(/^\d{1,20}$/, "사번은 숫자만 입력하세요."),
        password: z.string().trim().min(1).max(50),
        role: z.enum(["participant", "judge", "admin"]),
      })
      .parse(d);
  })
  .handler(async ({ data }) => {
    const people = await loadDb();
    const person = people.get(data.employeeNo);
    if (!person) throw new Error("명단에 없는 사번입니다.");
    if (person.name !== data.name.replace(/\s+/g, "")) {
      throw new Error("이름과 사번이 일치하지 않습니다.");
    }
    if (person.password !== data.password) {
      throw new Error("비밀번호가 올바르지 않습니다. (주민번호 앞 6자리)");
    }
    if (!person.roles.includes(data.role)) {
      throw new Error(`${ROLE_LABEL[data.role]} 명단에 없는 사용자입니다. 다른 역할로 로그인하세요.`);
    }
    return {
      name: person.name,
      empNo: person.empNo,
      position: person.position,
      roles: person.roles,
    };
  });
