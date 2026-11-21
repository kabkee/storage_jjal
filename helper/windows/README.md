# 짤 복사 도우미 (Windows · JjalCopy.exe)

jjal storage 에서 짤을 **클릭 한 번** → 원본(움직이는 GIF 그대로)이 클립보드에 복사 → 카톡·Slack 에서 `Ctrl+V`.
(맥은 WebPCap 이 같은 역할을 한다. 둘 다 `127.0.0.1:47321` 로 같은 신호에 응답)

## 설치 (친구에게 안내할 것)
1. 사이트 오른쪽 위 **「원클릭 복사 프로그램」** 또는
   <https://github.com/kabkee/storage_jjal/releases/latest/download/JjalCopySetup.exe> 다운로드
2. 실행 → **「Windows의 PC 보호」** 창이 뜨면 **추가 정보 → 실행** (서명 인증서가 없는 개인 프로그램이라 뜨는 경고)
3. 「설치」 → 끝. 오른쪽 아래 트레이에 아이콘이 생긴다
   - 설치 위치: `%LOCALAPPDATA%\Programs\JjalCopy` (관리자 권한 불필요, Inno Setup)
   - 「Windows 시작 시 자동 실행」은 설치 화면에서 선택(기본 켜짐)
   - 새 버전 설치 파일을 실행하면 실행 중인 옛 버전에 종료 신호를 보내고 업데이트한다

> v1.2 까지는 exe 가 스스로 `%LOCALAPPDATA%\JjalCopy` 에 복사·Run 키 등록·숨은 cmd 로 자가 삭제를 했는데,
> **안랩 V3 가 악성 행위로 차단**했다. v1.3 부터 앱은 그런 일을 하지 않고 설치 프로그램이 맡는다 → V3 통과(2026-11-21 실측).

## 카톡에 보내기
- **윈도우 카톡은 클립보드의 「파일」 붙여넣기(Ctrl+V)를 받지 않는다** — WinForms 파일 목록도, 탐색기와 똑같은 셸 데이터 객체(Shell IDList Array·FileContents 포함)도 실패 (2026-11-21 실측)
- 그래서 복사 직후 **마우스 옆에 작은 미리보기 창**이 뜬다 → 그 창을 **카톡 대화창으로 끌어다 놓으면** 원본 파일이 전송된다
  - v1.1 은 WinForms 파일 목록으로 끌어서 카톡이 받지 않았고, **v1.2 부터 셸 데이터 객체(탐색기에서 끄는 것과 같은 형식)로 끌어서 전송된다** (실측 확인)
- 클립보드에도 그대로 들어가므로 탐색기·Slack 등은 Ctrl+V 가능. 창은 트레이 메뉴 「복사 후 끌어다 놓기 창 띄우기」로 끌 수 있다

## 종료 / 제거
- 종료: 트레이 아이콘 **우클릭** → `종료` (자동 실행·「끌어다 놓기 창」 켜고 끄기도 여기서)
- 제거: **설정 → 앱 → 설치된 앱 → 「짤 복사 도우미」** (트레이 메뉴 `제거` 도 같은 제거기를 실행)

## 동작
- 사이트가 `GET /ping` 으로 감지 → 클릭 시 `POST /copy {"url","name"}`
- 원본을 끝까지 받은 뒤 탐색기 `Ctrl+C` 와 같은 형태(파일 드롭 목록)로 클립보드에 올린다
  (브라우저는 보안상 클립보드에 파일을 못 넣고, 드래그 앤 드롭은 빈 파일이 갈 수 있어서 만든 방식)
- `127.0.0.1` 에만 열리고, 허용 사이트(jjal Amplify 도메인·개발 서버)의 요청만 받는다. `image/*` · 100MB 이하만
- 받은 파일은 `%TEMP%\JjalCopy` 에 두고 하루 뒤 정리

## 빌드 · 배포
- 로컬 빌드(앱만): `./build.sh` → `dist/JjalCopy.exe` (리눅스/맥에서도 빌드: .NET SDK 8 + net48 참조 어셈블리)
- 설치 프로그램: `installer/JjalCopy.iss` (Inno Setup 6) — **GitHub Actions 가 만든다** (`.github/workflows/jjalcopy-release.yml`, windows-latest)
- 배포 순서 (🔴 정식 릴리스를 먼저 만들지 말 것 — 태그 생성이 자동 빌드를 다시 돌려 테스트한 파일을 덮어쓴다):
  1. `JjalCopy.csproj` 의 `<Version>` 올리고 커밋·push
  2. `git tag jjalcopy-vX.Y.Z && git push origin jjalcopy-vX.Y.Z` → 자동 빌드가 **시험판** 릴리스에 `JjalCopySetup.exe`·`JjalCopy.exe` 첨부
  3. 윈도우에서 시험판 설치 테스트
  4. `gh release edit jjalcopy-vX.Y.Z -R kabkee/storage_jjal --prerelease=false --latest --title ... --notes ...` → 사이트 링크(`releases/latest/download/JjalCopySetup.exe`)가 자동으로 새 버전을 가리킨다
- `workflow_dispatch` 는 기본 브랜치(main)에 워크플로 파일이 있어야 동작해서 여기선 못 쓴다 → 태그로 돌린다
- 워크플로 파일을 push 하려면 gh 토큰에 `workflow` scope 가 필요하다 (`gh auth refresh -h github.com -s workflow`)

헤드리스 점검(트레이·클립보드 없이 브리지만 N초): `JjalCopy.exe --selftest 20`
