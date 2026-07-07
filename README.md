# TECZEN 2026 · 제 1회 AI 경진대회

TanStack Start + React 19 + Tailwind CSS 4 + Supabase 기반 경진대회 사이트.
Lovable에서 제작 후 내부망 이관을 위해 Lovable 의존성을 제거한 버전입니다.

## 실행 방법

```bash
bun install        # 또는 npm install
bun run dev        # 개발 서버 (http://localhost:8080)
```

실제 서비스(프로덕션)로 띄울 때:

```bash
bun run build      # 프로덕션 빌드 (dist/ 생성)
bun run start      # 서버 실행 (http://localhost:3000, PORT 환경변수로 변경 가능)
```

## 내부망 이관 전 해야 할 일

이미지 원본과 폰트는 Lovable 서버에만 있어서, 현재 레포에는 **플레이스홀더 이미지**가
들어 있습니다. 외부 인터넷이 되는 PC에서 아래 스크립트를 한 번 실행해 원본으로 교체한 뒤
커밋하고 내부망으로 반입하세요.

```bash
bash scripts/fetch-assets.sh
```

- `src/assets/*.png|jpg` — 사이트에서 쓰는 이미지 18장 (Lovable에서 다운로드)
- `public/fonts/PretendardVariable.woff2` — Pretendard 폰트 (셀프호스팅, 없으면 시스템 폰트로 대체)

## 백엔드 (Supabase)

- 접속 정보는 `.env` 에 있습니다 (공개용 anon 키만 포함). 내부망용 Supabase 또는
  자체 백엔드로 교체하려면 `.env` 와 `src/integrations/supabase/` 를 수정하세요.
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
