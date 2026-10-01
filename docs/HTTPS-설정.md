# HTTPS(SSL) 설정 — http → https 전환

사내 포털(오토웨이 업무시스템)에 이 사이트를 넣으려면 https 여야 합니다.

`http://` 로 두면:

- 로그인 화면에서 **"제출하려는 정보가 보안되지 않음"** 경고가 뜹니다.
- 포털 화면 안에 **iframe 으로 넣으면 아예 차단**됩니다 (혼합 콘텐츠). 빈 화면만 나옵니다.
- 브라우저 비밀번호 저장·자동완성이 막힙니다.

서버는 이미 https 를 지원합니다. **인증서만 준비하면 됩니다.**

---

## ⚠️ 먼저 알아야 할 것 — 인증서는 IP 로 못 받습니다

공인 인증서(브라우저가 믿는 인증서)는 **`192.168.x.x` 같은 사내 IP 로는 발급되지 않습니다.**
국제 규정(CA/Browser Forum)상 CA 가 내부 주소로는 발급할 수 없습니다.

그래서 **도메인 이름이 반드시 필요합니다.** 예: `vibe.teczen.kr`

> 좋은 소식: 그 도메인이 **인터넷에 공개될 필요는 없습니다.**
> DNS 레코드만 공개해 두고, 실제 서버는 사내에만 있어도 됩니다.
> (아래 DNS-01 방식이 바로 그걸 가능하게 합니다)

---

## 전체 순서

```
1) 도메인 정하기          vibe.teczen.kr
2) DNS A 레코드 추가      vibe.teczen.kr  →  192.168.0.10 (서버 PC 내부 IP)
3) 인증서 발급            Let's Encrypt(무료) 또는 유료 인증서
4) .env 에 경로 넣기
5) 서버 재시작 + 방화벽
```

---

## 1) 도메인 정하기

회사 도메인 아래에 하위 이름을 하나 만듭니다.

```
vibe.teczen.kr
```

## 2) DNS A 레코드 추가 (전산팀 요청)

```
[요청] DNS 레코드 추가

  이름(호스트) : vibe
  도메인       : teczen.kr
  타입         : A
  값           : 192.168.0.10     ← AX LAB 서버 PC 의 사내 IP
  TTL          : 기본값

※ 사내 IP 를 가리키므로 외부에서는 접속되지 않습니다.
  사내망에서만 열리며, 이건 의도된 동작입니다.
```

**사내 DNS 서버가 따로 있다면** 거기에만 등록해도 됩니다.
다만 아래 3번에서 **DNS-01 인증을 쓰려면 공개 DNS 에도 TXT 레코드를 넣을 수 있어야 합니다.**

## 3) 인증서 발급

> **우리 환경 확인 결과 (2026-10)**
> `nslookup vibe.teczen.kr` → **10.208.1.212** (사내 IP)
> 인터넷에서 닿지 않으므로 **HTTP-01 은 불가능**합니다. **DNS-01 로 진행**하세요.
>
> ⚠️ TXT 레코드는 사내 DNS(TECZADDC001)가 아니라
> **외부에 공개된 teczen.kr 존**에 넣어야 합니다.
> Let's Encrypt 는 인터넷에서 조회하므로, 사내 DNS 에만 넣으면 실패합니다.

### 먼저 — 어떤 방식을 쓸 수 있는지 확인

서버 PC 의 명령창에서:

```
nslookup vibe.teczen.kr
```

나오는 **Address** 를 보고 고릅니다.

| 나온 주소 | 뜻 | 쓸 방식 |
|---|---|---|
| `192.168.*` · `10.*` · `172.16~31.*` | 사내 IP | **DNS-01** (방법 A) |
| 그 외 (공인 IP) | 인터넷에서 접속 가능할 수도 | **HTTP-01** 가능 (방법 A-2, 훨씬 간단) |

공인 IP 라도 **외부에서 80 포트가 막혀 있으면** HTTP-01 은 안 됩니다.
확실치 않으면 그냥 **DNS-01** 로 하세요. 어떤 환경에서든 됩니다.

### 방법 A — Let's Encrypt (무료, 권장)

서버가 외부에 열려 있지 않아도 **DNS-01 방식**으로 받을 수 있습니다.
TXT 레코드만 잠깐 추가하면 되고, 서버는 인터넷에 노출되지 않습니다.

윈도우에서는 **win-acme** 를 씁니다.

1. https://www.win-acme.com 에서 내려받아 압축 해제
2. 관리자 명령창에서 `wacs.exe` 실행
3. 메뉴에서 차례로 선택
   - `M` (수동으로 도메인 지정)
   - 도메인: `vibe.teczen.kr`
   - 인증 방식: **DNS-01** (`4` 또는 `dns-01` 계열)
   - 화면에 나오는 **TXT 레코드**를 DNS 에 추가 → 전산팀에 요청
     ```
     이름 : _acme-challenge.vibe
     타입 : TXT
     값   : (화면에 나오는 긴 문자열)
     ```
   - 추가 후 Enter → 발급 완료
4. 저장 위치(보통 `C:\ProgramData\win-acme\...\vibe.teczen.kr\`)에서
   `fullchain.pem` 과 `privkey.pem` 경로를 확인

### 방법 A-2 — HTTP-01 (공인 IP + 80 포트가 열려 있을 때만)

이게 되면 제일 간단합니다. TXT 레코드도 필요 없고 **갱신도 완전 자동**입니다.

관리자 명령창에서:

```
wacs.exe --target manual --host vibe.teczen.kr --validation selfhosting --store pemfiles --pemfilespath C:\certs
```

win-acme 가 80 포트로 잠깐 서버를 띄워 인증하고, `C:\certs` 에 PEM 파일을 떨궈 줍니다.
작업 스케줄러에 자동 갱신도 알아서 등록됩니다.

> 80 포트를 이미 다른 프로그램이 쓰고 있으면 실패합니다. 그때는 DNS-01 로 가세요.

> **갱신**: Let's Encrypt 는 **90일**마다 갱신해야 합니다.
> DNS 업체가 API 를 지원하면 win-acme 가 자동 갱신하도록 설정할 수 있습니다
> (가비아·후이즈·Cloudflare 등). 수동이면 90일마다 TXT 를 다시 넣어야 하니,
> 가능하면 API 자동 갱신으로 설정하세요.

### 방법 B — 유료 인증서 (1년 단위)

90일 갱신이 번거로우면 유료 인증서를 사면 됩니다. 보통 1년입니다.

- 국내: 가비아, 후이즈, 아이네임즈 등에서 판매 (연 5~10만원대)
- 발급 과정에서 **DNS TXT 인증**을 고르면 서버를 외부에 열 필요가 없습니다
- 받은 파일을 아래처럼 넣으면 됩니다

보통 이렇게 옵니다.

| 파일 | 넣을 곳 |
|---|---|
| `도메인.crt` (인증서) | `SSL_CERT` |
| `도메인.key` (개인키) | `SSL_KEY` |
| `chain.crt` / `ca-bundle.crt` (중간 인증서) | `SSL_CA` |

**중간 인증서를 빠뜨리면** 일부 브라우저·모바일에서 "안전하지 않음"이 뜹니다.
꼭 함께 넣으세요. (`SSL_CA` 로 넣으면 서버가 알아서 같이 내려보냅니다 — 확인 완료)

---

## 4) .env 에 경로 넣기

프로젝트 폴더의 `.env` 파일에 추가합니다.

**Let's Encrypt (fullchain 한 파일로 올 때)**

```
SSL_CERT=C:\certs\fullchain.pem
SSL_KEY=C:\certs\privkey.pem
```

`fullchain.pem` 에는 중간 인증서가 이미 들어 있어 `SSL_CA` 가 필요 없습니다.

**유료 인증서 (파일이 따로 올 때)**

```
SSL_CERT=C:\certs\vibe.crt
SSL_KEY=C:\certs\vibe.key
SSL_CA=C:\certs\chain.crt
```

**PFX(.pfx) 로 받았다면**

```
SSL_PFX=C:\certs\vibe.pfx
SSL_PASSPHRASE=비밀번호
```

**포트도 443 으로 바꾸려면** (주소에 `:2222` 가 안 붙어 깔끔해집니다)

```
PORT=443
HTTP_REDIRECT_PORT=80
```

`HTTP_REDIRECT_PORT` 를 넣으면 기존 `http://…` 주소로 들어온 사람이 **자동으로 https 로 넘어갑니다.**
80·443 같은 낮은 포트는 관리자 권한이 필요할 수 있습니다.

## 5) 서버 재시작

```
npm run build
npm start
```

화면에 주소가 이렇게 바뀌어 있어야 합니다.

```
TECZEN 서버 실행 중  (이 컴퓨터에서: https://localhost:443)
```

인증서 경로가 틀리면 서버가 멈추지 않고 이유를 알려준 뒤 http 로 뜹니다.
`!! HTTPS 인증서를 읽지 못했습니다` 가 보이면 경로를 확인하세요.

## 방화벽

포트를 바꿨다면 방화벽도 함께 엽니다 (관리자 명령창).

```
netsh advfirewall firewall add rule name="TECZEN-HTTPS" dir=in action=allow protocol=TCP localport=443
netsh advfirewall firewall add rule name="TECZEN-HTTP"  dir=in action=allow protocol=TCP localport=80
```

---

## 확인

사내 PC 에서 `https://vibe.teczen.kr` 로 접속해서:

- 주소창에 **자물쇠**가 보이는지
- 로그인할 때 보안 경고가 **안 뜨는지**
- 포털에 iframe 으로 넣었을 때 **화면이 정상으로 나오는지**

중간 인증서가 빠졌는지 확인하려면 (서버 PC 에서):

```
openssl s_client -connect vibe.teczen.kr:443 -showcerts
```

맨 아래 `Verify return code: 0 (ok)` 가 나오면 정상입니다.
`21 (unable to verify the first certificate)` 가 나오면 **중간 인증서가 빠진 것**이니
`SSL_CA` 를 넣으세요.

---

## 급할 때 — 자체 서명 인증서 (임시)

정식 인증서를 기다리는 동안 임시로 https 를 켜려면:

```
npm run cert
```

이 PC 의 사내 IP·컴퓨터이름이 들어간 인증서를 만들고 `.env` 까지 설정해 줍니다.

**단, 직원 PC 에서 처음 접속할 때 경고가 뜹니다** (`고급 → 계속` 으로 넘어갈 수 있음).
**포털 iframe 은 이 방식으로는 동작하지 않습니다.** 정식 인증서를 받기 전까지의 임시 수단으로만 쓰세요.

만들어진 `certs/vibe.crt` 를 전산팀이 GPO 로 직원 PC 에 배포하면 경고가 사라집니다.
