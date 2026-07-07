import { createMiddleware } from '@tanstack/react-start'
import { getLocalUser } from './demo'

// 서버 함수 호출마다 로그인 사용자(localStorage 세션)를 x-teczen-user 헤더로 붙인다.
// 서버 쪽에서는 src/lib/local-store.server.ts 의 getRequestUser() 로 읽는다.
// Must be registered as a global `functionMiddleware` in `src/start.ts`.
export const attachSupabaseAuth = createMiddleware({ type: 'function' }).client(
  async ({ next }) => {
    const user = getLocalUser()
    if (!user) return next({ headers: {} })
    const encoded =
      typeof btoa === 'function'
        ? btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(user))))
        : Buffer.from(JSON.stringify(user)).toString('base64')
    return next({ headers: { 'x-teczen-user': encoded } })
  },
)
