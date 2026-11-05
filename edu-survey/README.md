# 26년도 교육 만족도 조사 (설문 페이지)

게임(blockcraft) · KPI 문서(kpi)와는 별개 폴더입니다. Node.js 만 있으면 되고 설치할 것은 없습니다.

## 켜기
- Windows: `edu-survey\start.cmd` 더블클릭 (또는 `cd edu-survey` → `node server.js`)
- 포트: **2821** (바꾸려면 `set PORT=다른번호` 후 실행)
- 설문 주소: `http://<이 PC IP>:2821/` — 켜면 창에 주소가 나옵니다. 다른 PC에서 안 열리면 방화벽에서 2821 포트를 허용하세요.

## 구성
- 1쪽: Section 1 업무 수행 역량 변화(5문항) · Section 2 AI 활용 역량 및 업무 효과(5문항)
- 2쪽: Section 3 교육 만족도(5문항) · 응답자 정보(부서 · 직급, 선택) · 의견 2개
- 모든 문항 1~5점. 점수를 고르면 그 점수의 뜻(KPI 평가기준 문장)이 문항 아래에 보입니다.
- 임시 저장: 같은 PC · 같은 브라우저에서 다시 열면 이어서 할 수 있습니다.

## 결과 보기 (담당자만)
- `http://localhost:2821/results?key=<관리 키>` — 섹션별 평균 · 등급(4.5↑ S · 3.5↑ A · 2.5↑ B · 1.5↑ C · 그 아래 D) · 문항별 응답 분포 · 의견 모음
- `results.csv?key=<관리 키>` — 엑셀용 내려받기
- 관리 키는 처음 켤 때 `edu-survey/data/admin-key.txt` 에 만들어지고, 켤 때 창에도 나옵니다.
- 응답은 `edu-survey/data/responses.jsonl` 에 쌓입니다 (git 에 올라가지 않음).

## 문항 고치기
`public/questions.js` 한 파일만 고치면 설문 화면과 결과 화면이 같이 바뀝니다.
