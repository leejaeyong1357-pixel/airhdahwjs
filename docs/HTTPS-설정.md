# HTTPS 설정 (회사 공인 인증서)

전산팀에서 받은 `*.teczen.kr` 와일드카드 인증서로 서버를 https 로 띄운다.
접속 주소: **https://vibe.teczen.kr:2222**

## 받은 파일 (PEM, 3개)

| 파일 | 내용 |
|---|---|
| `star_teczen_kr_cert.pem` | 서버(리프) 인증서 |
| `Chain_RootCA_Bundle.crt` | 중간 + 루트 인증서 |
| `star_teczen_kr_key.pem` | 개인키 — 암호로 잠겨 있음 (`Proc-Type: 4,ENCRYPTED`) |

파일 이름이 달라도 된다. 스크립트가 내용을 보고 알아서 구분한다.

## 적용 (명령 프롬프트)

```
cd C:\Users\TECZ\airhdahwjs
git pull
```

1. 받은 파일 3개를 `C:\Users\TECZ\airhdahwjs\certs` 폴더에 넣는다.
   예전 인증서 파일이 있으면 지운다 (`axlab.*` 는 스크립트가 지운다).
2. 실행:
   ```
   npm run cert:setup
   ```
   - 개인키 암호를 묻는다 (화면에는 `*` 로 보임). 한 번만 입력하면 된다.
   - **적용 전 확인** 결과를 보여준다: 유효기간, 등록 도메인(SAN), 키·인증서 짝, 체인 순서,
     접속 도메인이 인증서에 들어 있는지, 사내 DNS 가 이 서버를 가리키는지.
   - 문제가 있으면 적용하지 않고 이유를 알려준다.
   - `Y` 를 누르면 적용된다.
3. 서버를 다시 켠다 (켜져 있으면 `Ctrl + C` 로 먼저 끈다):
   ```
   npm start
   ```
   시작 화면에 `사용 중인 인증서: 공인 인증서`, `발급 대상 *.teczen.kr` 이 나오면 끝.

## 스크립트가 하는 일

- 리프 인증서 + 중간 인증서를 순서대로(리프 먼저) 이어붙여 `certs\active\cert.pem` 으로 저장한다.
  루트 인증서는 넣지 않는다 (직원 PC 에 이미 있다).
- 개인키를 `certs\active\key.pem` 으로 저장한다.
- 경로와 개인키 암호를 `.env.local` 에 넣는다 → 서버를 켤 때마다 암호를 입력할 필요가 없다.
- `certs\`, `.env.local`, `*.pem`, `*.key` 는 `.gitignore` 에 있어 git 에 올라가지 않는다.
  (`.env` 는 git 에 올라가는 파일이라 비밀 값을 넣지 않는다.)

## 접속 주소 주의

- 와일드카드 인증서는 **등록된 도메인으로 접속할 때만** 경고가 안 뜬다.
  `https://vibe.teczen.kr:2222` 는 O, `https://10.208.x.x:2222` (IP) 는 인증서 오류.
- `vibe.teczen.kr` 이 사내 DNS 에 등록돼 있어야 한다. 확인: `nslookup vibe.teczen.kr`
  → 서버 IP 가 나오면 OK. 안 나오면 전산팀에 DNS 등록을 요청하거나,
  접속할 PC 의 `C:\Windows\System32\drivers\etc\hosts` 에 아래처럼 한 줄 추가한다 (관리자 권한 메모장):
  ```
  10.208.1.212 vibe.teczen.kr
  ```
  (`10.208.1.212` 자리에 `npm run cert:setup` 이 알려주는 서버 IP 를 넣는다.)

## 오토웨이 메뉴

오토웨이에 등록된 링크가 `http://` 로 되어 있으면 "제출하려는 정보가 보안되지 않음" 경고가 뜬다.
위 적용이 끝난 뒤 메뉴 주소를 **`https://vibe.teczen.kr:2222`** 로 바꿔달라고 요청한다.

## 인증서 갱신

새 인증서를 받으면 `certs` 폴더의 예전 파일을 새 파일로 바꾸고 `npm run cert:setup` → `npm start`.
만료 30일 전부터 서버 시작 화면에 알림이 나온다.
