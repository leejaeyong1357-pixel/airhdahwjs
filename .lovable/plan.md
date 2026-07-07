## 개요

2026년 제1회 테크젠 AI 경진대회 사이트. 참여자는 작품을 업로드하고, 서로 좋아요·댓글을 남기며, 임원(심사위원)은 지정된 시간에만 평가하고, 관리자는 모든 것을 관리하는 풀스택 사이트입니다.

## 기술 스택
- TanStack Start + React 19, Tailwind v4
- **Lovable Cloud** (DB, Auth, Storage) — 모든 데이터 영속화
- 현대자동차 무드(딥 네이비 #002C5F, 스틸 실버, 화이트, 액센트 블루)

## 페이지 구조

```
/                 홈 (히어로 + 갤러리 그리드) + 진입 팝업(경품)
/auth             로그인 (이름/사번/주민번호 앞자리)
/change-password  최초 로그인 시 비밀번호 변경 (강제)
/work/$id         작품 상세 (설명, 파일, 좋아요, 댓글)
/submit           작품 업로드 (참여자)
/my-page          내 정보/비밀번호 변경
/judge            심사위원 평가 페이지 (7/14 07:00~24:00 KST 게이트)
/admin            관리자 대시보드
  /admin/users        사용자 관리 (등록, CSV, 비번 재설정)
  /admin/teams        실/팀 관리
  /admin/submissions  작품 관리
  /admin/evaluations  평가 내역 열람
  /admin/rankings     전체 순위 & 통계
```

## 역할 & 로그인

3개 역할: `participant`(참여자) / `judge`(심사위원) / `admin`(관리자)

로그인은 커스텀 방식: **이름 + 사번 + 주민번호 앞자리(6자리)**
- 내부적으로 Supabase Auth 이메일은 `{사번}@teczen.local`로 합성
- 초기 비밀번호 = 주민번호 앞자리 6자리
- `must_change_password` 플래그가 true면 로그인 후 강제로 `/change-password` 이동
- 심사위원/관리자는 필수 변경(요청사항 반영)
- 비밀번호 분실 시 팝업: "미래성장팀 이재용 매니저에게 문의"

초기 관리자: 사번 `82211489`, 초기 비번 `990903` (최초 로그인 시 변경 강제)

## 좋아요 규칙
- 인당 최대 3개
- 같은 작품에 중복 불가
- **누가 눌렀는지 익명** — RLS로 본인 것만 조회 가능, 총합만 공개

## 심사 규칙
- 심사 기간: **2026-07-14 07:00 ~ 24:00 KST** (서버 시각 검증)
- 항목: 혁신성 40 / 완성도 30 / 활용도 20 (합 90점 만점 → 100 스케일)
- 임원 간 서로의 점수 조회 불가 (RLS: 본인 것만)
- 최종 점수 = 임원 평균 × 0.8 + 좋아요 점수(정규화) × 0.2

## 작품 카드 (썸네일 카드)
```
┌─────────────────────┐
│  제목: AI Vision     │
├─────────────────────┤
│    [ 썸네일 이미지 ]   │
├─────────────────────┤
│  미래성장팀           │
│  이재용 매니저        │
└─────────────────────┘
```

## 업로드 필드
1. 제목 2. 주요기능 3. 설명 4. 사용 AI/기술/스택/알고리즘/아키텍처 5. 기대효과
+ **썸네일 이미지**(필수) + **작품 파일**(어떤 확장자든 다중 업로드 가능: HTML, ZIP, py, exe 등)

## 메인 디자인 (현대차 무드)
- 좌측 상단: **TECZEN 로고**(업로드해주신 파일 사용)
- 우측 상단: 팀·사번·직급·마이페이지 드롭다운
- 히어로: 화면 좌측에 YouTube 영상 임베드(`q0OJCyW9w1Q`), 우측에 대회 카피 + CTA
- **하단 좌측 고정 플로팅 영상 플레이어** (awwwards 스타일) — 스크롤해도 따라옴
- 진입 팝업: 경품 3종 (Claude 1년 / 기계식 키보드 / 마우스) — 자리 잡아두고, 이미지 추가되면 교체
- "오늘 하루 창 열지 않기" 체크박스 (localStorage)

## 데이터베이스 (Lovable Cloud)

```
profiles         (id, employee_no, name, team, position, role, must_change_password)
teams            (id, name)  -- 관리자 등록용
submissions      (id, user_id, title, features, description, tech_stack, expected_impact,
                  thumbnail_url, created_at)
submission_files (id, submission_id, file_name, file_url, mime_type)
likes            (id, submission_id, user_id, created_at)  -- UNIQUE(submission_id,user_id), CHECK per-user max 3 via trigger
comments         (id, submission_id, user_id, body, created_at)
evaluations      (id, submission_id, judge_id, innovation, completeness, utilization, created_at)
                 -- UNIQUE(submission_id, judge_id)
user_roles       (user_id, role) -- 권한
```

Storage 버킷:
- `thumbnails` (public) — 썸네일 이미지
- `submissions` (private) — 작품 파일 (로그인 사용자만 다운로드)

## 관리자 기능
- 사용자 등록 (단건 + CSV 업로드): 이름/사번/주민번호앞자리/팀/직급/역할
- 비밀번호 재설정 (Admin API)
- 실/팀 등록·수정
- 전체 작품·평가·순위 조회
- **실별 지원자 수** 통계 (심사위원도 조회 가능)

## 상세 기술 노트
- 커스텀 로그인: 프론트에서 이름+사번+주민번호 앞자리 → 서버 함수가 `{사번}@teczen.local` + 비번으로 `signInWithPassword` 실행. 이름은 profile과 대조.
- 좋아요 3개 제한: DB 트리거 `BEFORE INSERT ON likes` → `count where user_id = new.user_id` >= 3 이면 raise.
- 심사 시간 게이트: 서버 함수 `submitEvaluation`에서 `now() AT TIME ZONE 'Asia/Seoul'` 검증.
- 파일 업로드는 Storage 사용, RLS로 소유자 write / 로그인 사용자 read.
- 플로팅 영상: `youtube.com/embed/{id}?autoplay=1&mute=1&loop=1` iframe, `position: fixed`.

## 진행 순서
1. Lovable Cloud 활성화 + 로고 자산 등록
2. DB 스키마 + RLS + 트리거 + 초기 관리자 시드
3. Storage 버킷 + 정책
4. 커스텀 로그인 & 비밀번호 변경 흐름
5. 홈(히어로/갤러리/팝업/플로팅 영상) + 헤더
6. 작품 업로드 + 상세(좋아요·댓글)
7. 심사위원 평가 페이지 (시간 게이트)
8. 관리자 대시보드 (사용자·팀·평가·순위·CSV)
9. 디자인 폴리시 (현대차 무드 마감)

이 계획대로 진행할까요? 승인해주시면 바로 Cloud 활성화하고 순서대로 구축하겠습니다.