# TECZEN 2026 · 제 1회 AI 경진대회

TanStack Start + React 19 + Tailwind CSS 4 + Supabase 기반 경진대회 사이트.
Lovable에서 제작 후 내부망 이관을 위해 Lovable 의존성을 제거한 버전입니다.

## 실행 방법

Node.js 18 이상만 있으면 됩니다 (Bun 불필요).

**윈도우: `start.bat` 더블클릭** — 최초 실행 시 패키지 설치와 빌드까지 자동으로 하고
브라우저(http://localhost:3000)를 열어줍니다. 소스 코드를 수정한 뒤에는 `rebuild.bat`.

명령어로 직접 할 때:

```bash
npm install        # 최초 한 번 (패키지 설치)
npm run dev        # 개발 서버 (http://localhost:8080)
npm run build      # 프로덕션 빌드 (dist/ 생성)
npm run start      # 서버 실행 (http://localhost:3000, PORT 환경변수로 변경 가능)
```

## 로그인 (DB 파일)

프로젝트 루트의 `DB` 텍스트 파일이 사용자 명단입니다. `참여자` / `평가자` / `관리자`
섹션 아래에 탭 구분으로 `순번, 이름, 직급, 사번, 주민번호 앞 6자리`가 한 줄씩 들어갑니다.

- 로그인: **이름 + 사번 + 비밀번호(주민번호 앞 6자리)** + 역할 선택.
  선택한 역할의 명단에 있어야 로그인됩니다 (한 사람이 여러 명단에 있어도 됨).
- 명단 수정: `DB` 파일만 고치면 됩니다. 로그인할 때마다 새로 읽으므로
  **서버 재시작이나 재빌드가 필요 없습니다.**
- 파일 이름은 `DB` 또는 `DB.txt`, 다른 위치를 쓰려면 환경변수 `DB_FILE`로 지정.

## 내부망 이관 전 해야 할 일

이미지 원본과 폰트는 Lovable 서버에만 있어서, 현재 레포에는 **플레이스홀더 이미지**가
들어 있습니다. 외부 인터넷이 되는 PC에서 아래 스크립트를 한 번 실행해 원본으로 교체한 뒤
커밋하고 내부망으로 반입하세요.

```bash
bash scripts/fetch-assets.sh
```

- `src/assets/*.png|jpg` — 사이트에서 쓰는 이미지 18장 (Lovable에서 다운로드)
- `public/fonts/PretendardVariable.woff2` — Pretendard 폰트 (셀프호스팅, 없으면 시스템 폰트로 대체)

## 로컬 모드 (기본값)

Supabase 백엔드 없이 동작하는 모드가 기본으로 켜져 있습니다 (`.env` 의 `VITE_DEMO_MODE="1"`).

- 로그인은 위의 `DB` 파일 명단으로 실제 검증됩니다.
- 작품 목록 등의 데이터는 빈 상태로 나오고, 저장/업로드는
  "백엔드가 연결되어 있지 않아 저장되지 않습니다" 안내가 표시됩니다.

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
