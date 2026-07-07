// 데모 모드 — Supabase 백엔드 없이 디자인 확인용.
// .env 의 VITE_DEMO_MODE="1" 이거나 Supabase 환경변수가 없으면 활성화된다.
// 실제 백엔드를 연결하면 VITE_DEMO_MODE="0" 으로 바꾸고 다시 빌드하면 된다.

export const DEMO_MSG = "데모 모드 — 백엔드가 연결되어 있지 않아 저장되지 않습니다.";

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

export const demoUser: any = {
  id: "00000000-0000-4000-8000-000000000000",
  email: "demo@teczen.local",
  aud: "authenticated",
  user_metadata: { name: "데모 사용자", employee_no: "00000000" },
  app_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};

const demoSession: any = {
  user: demoUser,
  access_token: "demo",
  refresh_token: "demo",
  token_type: "bearer",
  expires_in: 3600,
};

const demoProfile = {
  id: demoUser.id,
  name: "데모 사용자",
  team: "미래성장팀",
  position: "매니저",
  employee_no: "00000000",
  must_change_password: false,
  created_at: "2026-01-01T00:00:00Z",
};

// 화면 디자인 확인에 필요한 최소한의 데이터. 그 외 테이블은 전부 빈 목록.
function tableRows(table: string): any[] {
  if (table === "user_roles")
    return [
      { user_id: demoUser.id, role: "admin" },
      { user_id: demoUser.id, role: "judge" },
    ];
  if (table === "profiles") return [demoProfile];
  return [];
}

// .from(...).select(...).eq(...).order(...) 같은 체이닝을 전부 받아주고,
// await 하면 { data, error: null } 을 돌려주는 쿼리 빌더 흉내.
function queryBuilder(table: string): any {
  const rows = tableRows(table);
  return new Proxy(() => {}, {
    get(_, prop) {
      if (prop === "then") {
        const p = Promise.resolve({ data: rows, error: null, count: rows.length });
        return p.then.bind(p);
      }
      if (prop === "single" || prop === "maybeSingle") {
        return () => Promise.resolve({ data: rows[0] ?? null, error: null });
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
      getSession: async () => ({ data: { session: demoSession }, error: null }),
      getUser: async () => ({ data: { user: demoUser }, error: null }),
      getClaims: async () => ({ data: { claims: { sub: demoUser.id } }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => ({ error: null }),
      signInWithPassword: async () => ({ data: { session: demoSession, user: demoUser }, error: null }),
      updateUser: async () => ({ data: { user: demoUser }, error: null }),
      admin: {
        createUser: async () => ({ data: { user: null }, error: { message: DEMO_MSG } }),
        updateUserById: async () => ({ data: { user: demoUser }, error: null }),
        deleteUser: async () => ({ data: null, error: { message: DEMO_MSG } }),
      },
    },
  };
}
