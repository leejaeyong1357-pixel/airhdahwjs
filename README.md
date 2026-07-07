# TECZEN 2026 · 제 1회 AI 경진대회

TanStack Start + React 19 + Tailwind CSS 4 + Supabase 기반 경진대회 사이트.
Lovable에서 제작 후 내부망 이관을 위해 Lovable 의존성을 제거한 버전입니다.

## 실행 방법

Node.js 18 이상만 있으면 됩니다 (Bun 불필요).

```bash
npm install        # 최초 한 번 (패키지 설치)
npm run dev        # 개발 서버 (http://localhost:8080)
```

실제 서비스(프로덕션)로 띄울 때:

```bash
npm run build      # 프로덕션 빌드 (dist/ 생성)
npm run start      # 서버 실행 (http://localhost:3000, PORT 환경변수로 변경 가능)
```

Bun을 쓰는 경우 `bun install` / `bun run dev` / `bun run build` / `bun run start:bun` 으로
동일하게 실행할 수 있습니다.

## 내부망 이관 전 해야 할 일

이미지 원본과 폰트는 Lovable 서버에만 있어서, 현재 레포에는 **플레이스홀더 이미지**가
들어 있습니다. 외부 인터넷이 되는 PC에서 아래 스크립트를 한 번 실행해 원본으로 교체한 뒤
커밋하고 내부망으로 반입하세요.

```bash
bash scripts/fetch-assets.sh
```

- `src/assets/*.png|jpg` — 사이트에서 쓰는 이미지 18장 (Lovable에서 다운로드)
- `public/fonts/PretendardVariable.woff2` — Pretendard 폰트 (셀프호스팅, 없으면 시스템 폰트로 대체)

## 데모 모드 (기본값)

백엔드(Supabase) 없이 **디자인 전체를 에러 없이 볼 수 있는 모드**가 기본으로 켜져 있습니다
(`.env` 의 `VITE_DEMO_MODE="1"`).

- 로그인 화면에서 역할(참여자/평가자/관리자)을 고르고 버튼만 누르면 바로 들어가집니다.
- 모든 페이지(메인, 작품 제출, 심사, 관리자, 마이페이지)를 둘러볼 수 있고, 목록은 빈 상태로 나옵니다.
- 저장/업로드 같은 동작은 "데모 모드 — 저장되지 않습니다" 안내만 표시됩니다.

## 백엔드 (Supabase)

- 실제 백엔드를 붙이려면 `.env` 에서 `VITE_DEMO_MODE="0"` 으로 바꾸고, Supabase 접속 정보
  (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` 등)를 채운 뒤
  다시 빌드하세요. 연동 코드는 `src/integrations/supabase/` 에 있습니다.
- DB 스키마는 `supabase/migrations/` 에 SQL로 들어 있습니다.

## 기타 외부 의존

- 메인 화면의 플로팅 영상은 YouTube 임베드입니다 (`src/components/FloatingVideo.tsx`).
  내부망에서 YouTube가 차단되면 이 컴포넌트를 내부 영상으로 교체하거나 제거하세요.
- 메인 화면 기사 카드의 링크는 외부 뉴스 사이트로 연결됩니다 (`src/routes/index.tsx`).

## 구조

```
src/
  routes/            페이지 (메인, 로그인, 제출, 심사, 관리자, 작품 상세)
  components/        앱 컴포넌트 + shadcn/ui
  integrations/      Supabase 클라이언트/인증
  lib/               서버 함수 (auth/admin/submissions/evaluations)
  styles.css         디자인 시스템 (현대차 스타일 네이비 테마)
supabase/migrations/ DB 스키마
scripts/             에셋 다운로드 스크립트
```
