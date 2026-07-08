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
    const { loadRoster, readStore, hashPassword } = await import("@/lib/local-store.server");
    const people = await loadRoster();
    const person = people.get(data.employeeNo);
    if (!person) throw new Error("명단에 없는 사번입니다.");
    if (person.name !== data.name.replace(/\s+/g, "")) {
      throw new Error("이름과 사번이 일치하지 않습니다.");
    }
    // 비밀번호: 변경한 적 있으면 변경된 것, 아니면 초기(주민번호 앞 6자리)
    const custom = readStore().passwords[person.empNo];
    if (custom) {
      if (hashPassword(data.password) !== custom) throw new Error("비밀번호가 올바르지 않습니다.");
    } else if (person.password !== data.password) {
      throw new Error("비밀번호가 올바르지 않습니다. (첫 로그인은 주민번호 앞 6자리)");
    }
    if (!person.roles.includes(data.role)) {
      throw new Error(`${ROLE_LABEL[data.role]} 명단에 없는 사용자입니다. 다른 역할로 로그인하세요.`);
    }
    const consented = !!readStore().consents[person.empNo];
    return {
      name: person.name,
      empNo: person.empNo,
      position: person.position,
      team: person.team,
      roles: person.roles,
      mustChangePassword: !custom, // 첫 로그인이면 비밀번호 변경 강제
      needsConsent: !consented, // 첫 로그인이면 개인정보 동의 필요
    };
  });

/** 개인정보 수집·이용 동의 저장 (최초 로그인 시 1회) */
export const agreeConsent = createServerFn({ method: "POST" })
  .handler(async () => {
    const { readStore, writeStore, requireUser } = await import("@/lib/local-store.server");
    const user = requireUser();
    const store = readStore();
    store.consents[user.empNo] = new Date().toISOString();
    writeStore(store);
    return { ok: true };
  });

/** 비밀번호 변경 — data/db.json 에 해시로 저장된다. */
export const changePasswordDb = createServerFn({ method: "POST" })
  .inputValidator((d: { currentPassword: string; newPassword: string }) =>
    z.object({
      currentPassword: z.string().trim().min(1),
      newPassword: z.string().trim().min(6, "새 비밀번호는 6자 이상이어야 합니다.").max(50),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { loadRoster, readStore, writeStore, hashPassword, requireUser } = await import("@/lib/local-store.server");
    const user = requireUser();
    const person = (await loadRoster()).get(user.empNo);
    if (!person) throw new Error("명단에 없는 사용자입니다.");
    const store = readStore();
    const custom = store.passwords[user.empNo];
    const currentOk = custom
      ? hashPassword(data.currentPassword) === custom
      : data.currentPassword === person.password;
    if (!currentOk) throw new Error("현재 비밀번호가 올바르지 않습니다.");
    if (data.newPassword === person.password) {
      throw new Error("주민번호 앞 6자리와 다른 비밀번호를 사용하세요.");
    }
    store.passwords[user.empNo] = hashPassword(data.newPassword);
    writeStore(store);
    return { ok: true };
  });
