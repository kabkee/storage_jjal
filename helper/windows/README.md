# 짤 복사 도우미 (Windows · JjalCopy.exe)

jjal storage 에서 짤을 **클릭 한 번** → 원본(움직이는 GIF 그대로)이 클립보드에 복사 → 카톡·Slack 에서 `Ctrl+V`.
(맥은 WebPCap 이 같은 역할을 한다. 둘 다 `127.0.0.1:47321` 로 같은 신호에 응답)

## 설치 (친구에게 안내할 것)
1. 사이트 오른쪽 위 **「원클릭 복사 프로그램」** 또는
   <https://github.com/kabkee/storage_jjal/releases/latest/download/JjalCopy.exe> 다운로드
2. 실행 → **「Windows의 PC 보호」** 창이 뜨면 **추가 정보 → 실행** (서명 인증서가 없는 개인 프로그램이라 뜨는 경고)
3. 끝. 오른쪽 아래 트레이에 아이콘이 생기고, Windows 시작 시 자동으로 켜진다
   - 설치 위치: `%LOCALAPPDATA%\JjalCopy` (관리자 권한 불필요)
   - 새 버전 exe 를 실행하면 기존 것을 종료하고 덮어쓴다 (= 업데이트)

## 카톡에 보내기
- **윈도우 카톡은 클립보드의 「파일」 붙여넣기(Ctrl+V)를 받지 않는다** (탐색기에서 Ctrl+C 한 파일도 마찬가지 — 2026-11-21 실측)
- 그래서 복사 직후 **마우스 옆에 작은 미리보기 창**이 뜬다 → 그 창을 **카톡 대화창으로 끌어다 놓으면** 원본 파일이 전송된다
- 클립보드에도 그대로 들어가므로 탐색기·Slack 등은 Ctrl+V 가능. 창은 트레이 메뉴 「복사 후 끌어다 놓기 창 띄우기」로 끌 수 있다

## 종료 / 제거
트레이 아이콘 **우클릭** → `종료` · `Windows 시작 시 자동 실행` 끄기 · `제거 (프로그램 삭제)`

## 동작
- 사이트가 `GET /ping` 으로 감지 → 클릭 시 `POST /copy {"url","name"}`
- 원본을 끝까지 받은 뒤 탐색기 `Ctrl+C` 와 같은 형태(파일 드롭 목록)로 클립보드에 올린다
  (브라우저는 보안상 클립보드에 파일을 못 넣고, 드래그 앤 드롭은 빈 파일이 갈 수 있어서 만든 방식)
- `127.0.0.1` 에만 열리고, 허용 사이트(jjal Amplify 도메인·개발 서버)의 요청만 받는다. `image/*` · 100MB 이하만
- 받은 파일은 `%TEMP%\JjalCopy` 에 두고 하루 뒤 정리

## 빌드 · 배포
```bash
./build.sh                 # → dist/JjalCopy.exe  (리눅스/맥에서도 빌드: .NET SDK 8 + net48 참조 어셈블리)
gh release create jjalcopy-vX.Y.Z dist/JjalCopy.exe -R kabkee/storage_jjal --title "짤 복사 도우미 vX.Y.Z" --notes "..."
```
버전은 `JjalCopy.csproj` 의 `<Version>`. 사이트 링크는 `releases/latest/download/JjalCopy.exe` 라 최신 릴리스를 자동으로 가리킨다.

헤드리스 점검(트레이·클립보드 없이 브리지만 N초): `JjalCopy.exe --selftest 20`
