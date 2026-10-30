# TECZEN 사내 마크 서버 (Luanti + Mineclonia)

[Luanti](https://www.luanti.org)(옛 이름 Minetest)는 무료 오픈소스 블록 게임 엔진이고,
그 위에서 돌아가는 **Mineclonia** 게임은 마인크래프트와 거의 같게 만든 게임입니다.
(서바이벌 · 조합 · 몹 · 레드스톤 · 네더 등. 마인크래프트 원작 코드나 그림은 쓰지 않음)

모든 작업은 **명령 프롬프트(cmd)** 로 합니다. PowerShell · 관리자 권한 없이 됩니다. (방화벽만 예외)

## 1. 서버 PC — 처음 한 번 설치

```
cd C:\Users\TECZ\airhdahwjs
git pull
cd luanti
setup.cmd
```

- 엔진(약 17MB)과 Mineclonia 를 내려받아 `luanti\app` 에 설치합니다.
- 중간에 **서버 관리자 닉네임**을 묻습니다. 영문 · 숫자만 됩니다. (예: `admin`)
  이 닉네임으로 접속하면 모든 권한(킥 · 밴 · 날기 · 시간 바꾸기 등)을 갖습니다.
- 회사망에서 다운로드가 막히면 화면에 나오는 안내대로 브라우저로 받아 `luanti\downloads` 에 넣고 다시 실행하세요.
- Mineclonia 만 못 받았다면: `play.cmd` → **[콘텐츠 / Content]** → **[온라인 콘텐츠 탐색 / Browse online content]** → Mineclonia → **[설치 / Install]**

## 2. 서버 켜기 / 끄기

```
cd C:\Users\TECZ\airhdahwjs\luanti
start-server.cmd
```

- 화면에 직원들이 넣을 **접속 주소(이 PC 의 IP)와 포트(30000)** 가 나옵니다.
- 끄기: 서버 창에서 **Ctrl+C** (월드는 자동 저장)
- 월드는 `luanti\app\worlds\teczen` 에 저장됩니다. 백업은 이 폴더를 통째로 복사하면 됩니다.

### 다른 PC 에서 접속이 안 되면 (방화벽)

`firewall.cmd` 를 **마우스 오른쪽 클릭 → 관리자 권한으로 실행** 하면 UDP 30000 포트를 엽니다.
회사 보안 정책으로 막히면 전산팀에 **"이 PC 의 UDP 30000 포트 수신 허용"** 을 요청하세요.
(마크 서버는 TCP 가 아니라 **UDP** 입니다)

## 3. 서버 PC 에서 같이 하기

`play.cmd` → **[게임 참가 / Join Game]** 탭 → 주소 `127.0.0.1`, 포트 `30000` → 닉네임 · 비밀번호 → **[접속]**

## 4. 직원 PC — 접속 방법

1. Luanti 받기
   - AX LAB 서버가 켜져 있으면: `http://<서버 PC 주소>:2222/downloads/luanti-win64.zip`
     (setup.cmd 가 이 파일을 넣어 둡니다)
   - 또는 https://github.com/luanti-org/luanti/releases 에서 `luanti-…-win64.zip`
2. 압축을 풀고 `bin\luanti.exe` 실행 (설치 필요 없음)
3. **[게임 참가 / Join Game]** 탭 → 주소 · 포트(30000) 입력 → 닉네임(영문) · 비밀번호 → **[접속]**
   - 처음 접속할 때 넣은 비밀번호가 그 닉네임의 비밀번호가 됩니다.
   - 게임(Mineclonia)은 서버에서 자동으로 받아오므로 따로 설치할 필요 없습니다.
4. 한국어 화면: 메인 화면 **[설정 / Settings]** → Language → **한국어**

## 5. 관리자 명령 (게임 안 채팅창 `T` 키 → `/명령`)

| 명령 | 뜻 |
|---|---|
| `/grant 닉네임 fly` | 날기 권한 주기 (`all` 이면 모든 권한) |
| `/revoke 닉네임 fly` | 권한 빼기 |
| `/kick 닉네임` · `/ban 닉네임` · `/unban 닉네임` | 내보내기 · 차단 · 차단 해제 |
| `/time 6:00` | 아침으로 |
| `/setpassword 닉네임 새비번` | 비밀번호 잊은 직원 비밀번호 바꾸기 |
| `/status` | 접속자 · 서버 상태 |

## 파일

| 파일 | 하는 일 |
|---|---|
| `setup.cmd` | 엔진 · 게임 설치, server.conf 만들기 |
| `start-server.cmd` | 서버 켜기 (포트 · 월드 이름은 파일 위쪽에서 바꿈) |
| `play.cmd` | 게임 화면 열기 |
| `firewall.cmd` | 방화벽 UDP 30000 열기 (관리자 권한) |
| `server.conf.template` | 서버 설정 기본값 — 실제 설정은 `server.conf` |

`app\` · `downloads\` · `server.conf` · `server.log` 는 이 PC 에만 있고 git 에 올라가지 않습니다.
