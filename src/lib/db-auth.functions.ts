import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * 프로젝트 루트의 `DB` 파일(탭/공백 구분 텍스트) 기반 로그인.
 * 파일 형식과 파서는 src/lib/local-store.server.ts 의 loadRoster 참고.
 * 파일은 로그인할 때마다 다시 읽으므로 명단 수정 후 서버 재시작이 필요 없다.
 */

export type DbRole = "participant" | "judge" | "admin";

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
    const { loadRoster } = await import("@/lib/local-store.server");
    const people = await loadRoster();
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
