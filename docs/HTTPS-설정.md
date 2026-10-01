# HTTPS(SSL) 설정 — http → https 전환

사내 포털(오토웨이 업무시스템)에 이 사이트를 넣으려면 https 여야 합니다.

지금처럼 `http://` 로 두면:

- 로그인 화면에서 **"제출하려는 정보가 보안되지 않음"** 경고가 뜹니다.
- 포털 화면 안에 **iframe 으로 넣으면 아예 차단**됩니다 (혼합 콘텐츠). 빈 화면만 나옵니다.
- 브라우저 비밀번호 저장·자동완성이 막힙니다.

서버는 이미 https 를 지원합니다. **인증서만 준비하면 됩니다.**

---

## 어떤 인증서를 받아야 하나

> ⚠️ 외부 무료 인증서(Let's Encrypt 등)는 **사내 IP·사내 전용 주소로는 발급되지 않습니다.**
> 반드시 아래 방법 중 하나로 진행하세요.

### 방법 A — 전산팀에 사내 인증서 요청 (권장)

사내 CA에서 발급한 인증서는 **사내 PC가 이미 신뢰**하므로 경고가 전혀 없습니다.

전산팀에 아래 내용으로 요청하세요.

```
[요청] 사내 웹서비스용 SSL 인증서 발급

- 용도   : AX LAB (사내 AI 과제 관리 사이트)
- 서버   : (서버를 돌리는 PC 이름 / IP)
- 희망 주소 : axlab.<사내도메인>  ← 사내 DNS 등록도 함께 요청
- 포트   : 443 (또는 2222)
- 형식   : PEM(.crt + .key) 또는 PFX(.pfx + 비밀번호)
- 사유   : 사내 포털 메뉴에 등록 예정. http 로는 포털(https)에서
          iframe 차단 및 로그인 보안 경고가 발생함.
```

### 방법 B — 회사 웹서버 뒤에 붙이기 (리버스 프록시)

회사에 이미 https 웹서버(IIS·nginx 등)가 있으면, 그 뒤에 연결하는 방법이 가장 간단합니다.
**이 경우 이 서버는 지금처럼 http 로 두면 되고**, 인증서는 전산팀이 관리합니다.

전산팀 전달용:

```
https://axlab.<사내도메인>/  →  http://<이 PC IP>:2222/  로 프록시
- WebSocket 불필요
- 업로드 때문에 최대 요청 크기를 300MB 이상으로 설정
- X-Forwarded-Proto 헤더 전달
```

### 방법 C — 자체 서명 인증서 (임시·테스트용)

**직원 PC마다 경고가 뜨므로 권장하지 않습니다.** 전산팀이 GPO로 인증서를 배포할 수 있을 때만 쓰세요.

윈도우 PowerShell(관리자)에서 생성:

```powershell
# 1) 인증서 생성 (사내 주소/IP 를 본인 환경에 맞게 수정)
$c = New-SelfSignedCertificate `
  -DnsName "axlab.company.local", "192.168.0.10" `
  -CertStoreLocation "Cert:\LocalMachine\My" `
  -NotAfter (Get-Date).AddYears(3) `
  -KeyExportPolicy Exportable

# 2) .pfx 로 내보내기
$pw = ConvertTo-SecureString -String "원하는비밀번호" -Force -AsPlainText
Export-PfxCertificate -Cert $c -FilePath C:\certs\axlab.pfx -Password $pw
```

---

## 서버에 적용하기

받은 인증서를 서버 PC에 두고, 프로젝트 폴더의 `.env` 파일에 아래를 추가합니다.

**PEM(.crt + .key) 으로 받은 경우**

```
SSL_CERT=C:\certs\axlab.crt
SSL_KEY=C:\certs\axlab.key
SSL_CA=C:\certs\chain.crt
```

`SSL_CA` 는 중간 인증서가 따로 올 때만 넣습니다. 없으면 생략하세요.

**PFX(.pfx) 로 받은 경우**

```
SSL_PFX=C:\certs\axlab.pfx
SSL_PASSPHRASE=비밀번호
```

**포트도 바꾸려면** (https 기본 포트는 443)

```
PORT=443
HTTP_REDIRECT_PORT=80
```

`HTTP_REDIRECT_PORT` 를 넣으면 기존 `http://…` 주소로 들어온 사람이 **자동으로 https 로 넘어갑니다.**
(80·443 같은 낮은 포트는 관리자 권한이 필요할 수 있습니다.)

그리고 서버를 다시 시작합니다.

```
npm run build
npm start
```

---

## 확인

서버를 켜면 화면에 주소가 이렇게 바뀌어 있어야 합니다.

```
TECZEN 서버 실행 중  (이 컴퓨터에서: https://localhost:443)

직원들에게 공유할 접속 주소:
   https://192.168.0.10:443
```

브라우저에서 접속해 **주소창에 자물쇠**가 보이고, 로그인할 때 보안 경고가 뜨지 않으면 완료입니다.

인증서 경로가 틀리면 서버가 멈추지 않고 이유를 알려준 뒤 http 로 뜹니다.
콘솔에 `!! HTTPS 인증서를 읽지 못했습니다` 가 보이면 경로를 확인하세요.

---

## 방화벽

포트를 바꿨다면 방화벽도 함께 열어야 합니다 (관리자 명령창).

```
netsh advfirewall firewall add rule name="TECZEN-HTTPS" dir=in action=allow protocol=TCP localport=443
netsh advfirewall firewall add rule name="TECZEN-HTTP"  dir=in action=allow protocol=TCP localport=80
```
