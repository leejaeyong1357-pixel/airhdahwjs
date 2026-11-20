// 로컬(백엔드 없는) 모드 — Supabase 대신 프로젝트 루트의 DB 파일 로그인과
// localStorage 세션으로 동작한다. .env 의 VITE_DEMO_MODE="1" 이거나
// Supabase 환경변수가 없으면 활성화된다.
// 실제 Supabase 백엔드를 연결하면 VITE_DEMO_MODE="0" 으로 바꾸고 다시 빌드하면 된다.

export const DEMO_MSG = "로컬 모드 — 백엔드가 연결되어 있지 않아 저장되지 않습니다.";

export function isDemoMode(): boolean {
  try {
    if (import.meta.env?.VITE_DEMO_MODE === "1") return true;
  } catch {
    /* import.meta.env가 없는 런타임 */
  }
  if (typeof process !== "undefined" && process.env) {
    if (process.env.VITE_DEMO_MODE === "1" || process.env.DEMO_MODE === "1") return true;
  }
  return false;
}

// ---------- 로컬 세션 (DB 파일 로그인 결과를 localStorage에 보관) ----------

export type LocalRole = "participant" | "judge" | "admin";
export type LocalUser = {
  name: string;
  empNo: string;
  position: string;
  roles: LocalRole[];
  role: LocalRole; // 로그인 시 선택한 역할
  mustChangePassword?: boolean; // 첫 로그인 — 비밀번호 변경 전
  needsConsent?: boolean; // 첫 로그인 — 개인정보 동의 전
  team?: string;
};

const LOCAL_USER_KEY = "teczen-user";

export function getLocalUser(): LocalUser | null {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem(LOCAL_USER_KEY) ?? "null");
  } catch {
    return null;
  }
}

export function setLocalUser(user: LocalUser) {
  localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(user));
}

export function clearLocalUser() {
  localStorage.removeItem(LOCAL_USER_KEY);
}

function localUserId(u: LocalUser) {
  return `local-${u.empNo}`;
}

function toAuthUser(u: LocalUser): any {
  return {
    id: localUserId(u),
    email: `emp${u.empNo}@teczen.local`,
    aud: "authenticated",
    user_metadata: { name: u.name, employee_no: u.empNo },
    app_metadata: {},
    created_at: "2026-01-01T00:00:00Z",
  };
}

function toSession(u: LocalUser): any {
  return {
    user: toAuthUser(u),
    access_token: "local",
    refresh_token: "local",
    token_type: "bearer",
    expires_in: 3600,
  };
}

// 서버 함수(미들웨어) 컨텍스트용 기본 사용자
export const demoUser: any = {
  id: "00000000-0000-4000-8000-000000000000",
  email: "demo@teczen.local",
  aud: "authenticated",
  user_metadata: { name: "데모 사용자", employee_no: "00000000" },
  app_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};

// ---------- Supabase 클라이언트 흉내 ----------

// 화면이 조회하는 테이블에는 로그인한 사용자 정보를 돌려준다. 그 외에는 빈 목록.
function tableRows(table: string): any[] {
  const u = getLocalUser();
  if (!u) return [];
  if (table === "profiles") {
    return [
      {
        id: localUserId(u),
        name: u.name,
        team: u.team ?? "",
        position: u.position,
        employee_no: u.empNo,
        must_change_password: false,
      },
    ];
  }
  if (table === "user_roles") {
    // 첫 행을 로그인 시 선택한 역할로 — 화면들이 첫 행을 대표 역할로 사용한다.
    const ordered = [u.role, ...u.roles.filter((r) => r !== u.role)];
    return ordered.map((role) => ({ user_id: localUserId(u), role }));
  }
  return [];
}

// .from(...).select(...).eq(...).order(...) 같은 체이닝을 전부 받아주고,
// await 하면 { data, error: null } 을 돌려주는 쿼리 빌더 흉내.
function queryBuilder(table: string): any {
  return new Proxy(() => {}, {
    get(_, prop) {
      if (prop === "then") {
        const rows = tableRows(table);
        const p = Promise.resolve({ data: rows, error: null, count: rows.length });
        return p.then.bind(p);
      }
      if (prop === "single" || prop === "maybeSingle") {
        return () => Promise.resolve({ data: tableRows(table)[0] ?? null, error: null });
      }
      return () => queryBuilder(table);
    },
  });
}

export function createDemoSupabaseClient(): any {
  return {
    from: (table: string) => queryBuilder(table),
    rpc: async () => ({ data: true, error: null }),
    storage: {
      from: () => ({
        createSignedUrl: async () => ({ data: { signedUrl: "" }, error: null }),
        createSignedUrls: async () => ({ data: [], error: null }),
        createSignedUploadUrl: async () => ({ data: null, error: { message: DEMO_MSG } }),
        upload: async () => ({ data: null, error: { message: DEMO_MSG } }),
        getPublicUrl: () => ({ data: { publicUrl: "" } }),
      }),
    },
    auth: {
      getSession: async () => {
        const u = getLocalUser();
        return { data: { session: u ? toSession(u) : null }, error: null };
      },
      getUser: async () => {
        const u = getLocalUser();
        return { data: { user: u ? toAuthUser(u) : null }, error: u ? null : { message: "not signed in" } };
      },
      getClaims: async () => ({ data: { claims: { sub: demoUser.id } }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => {
        if (typeof window !== "undefined") clearLocalUser();
        return { error: null };
      },
      signInWithPassword: async () => ({ data: { session: null, user: null }, error: { message: DEMO_MSG } }),
      updateUser: async () => ({ data: { user: null }, error: { message: DEMO_MSG } }),
      admin: {
        createUser: async () => ({ data: { user: null }, error: { message: DEMO_MSG } }),
        updateUserById: async () => ({ data: { user: null }, error: { message: DEMO_MSG } }),
        deleteUser: async () => ({ data: null, error: { message: DEMO_MSG } }),
      },
    },
  };
}
