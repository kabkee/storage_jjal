# 짤 복사 도우미 (macOS) — JjalCopy.app

jjal 사이트에서 **움짤을 누르면 원본 파일을 클립보드에 올려** 카톡·Slack 에서 `⌘V` 로 움직이는 그대로 보내게 해 주는 메뉴 막대 앱.
윈도우 도우미(`helper/windows`)와 같은 규약(`127.0.0.1:47321`)으로 동작한다. 맥 카톡은 파일 붙여넣기를 받아서 끌어다 놓기 창이 필요 없다.

> 예전엔 WebPCap(화면 캡처 앱)에 이 기능이 붙어 있었는데 2026-11-21 에 빼고 이 전용 앱으로 옮겼다. 사이트는 `app: "JjalCopy"` 만 인정한다.

## 설치 (사용자)
1. 사이트의 「움짤 복사 도우미」 → `JjalCopy-mac.zip` 받기 → 압축 풀기 → `JjalCopy` 를 **응용 프로그램** 폴더로
2. 열기 → 「확인되지 않은 개발자」 경고가 뜨면 완료 → **시스템 설정 → 개인정보 보호 및 보안** 맨 아래 **「그래도 열기」** (처음 한 번)
3. 메뉴 막대에 아이콘이 생기면 끝. 처음 실행 때 「로그인할 때 자동 실행」이 켜진다(메뉴에서 끌 수 있음)

## 동작
- `GET /ping` → `{"app":"JjalCopy","version","os":"mac","features":["copy-data"]}`
- `POST /copy {"url","name"}` → 원본을 끝까지 받아 Finder ⌘C 와 같은 형태(파일 URL)로 클립보드 → `{"ok":true,"name","hint":"paste"}`
- `POST /copy-data?name=이름.gif` (본문 = 이미지 바이트) → 사이트 「GIF 모드」가 만든 GIF 를 같은 방식으로 클립보드에
- `127.0.0.1` 에만 열리고, 허용 사이트(Origin)만 응답: jjal Amplify 도메인 · `kabkee-main.tailfe017f.ts.net`(개발 서버 https) · `100.64.25.50` · localhost.
  추가: `defaults write com.kabkee.jjalcopy allowedHosts -array 호스트`
- `image/*` · 100MB 이하. 받은 파일은 `~/Library/Caches/com.kabkee.jjalcopy/clipboard/` 에 두고 하루 뒤 정리

## 빌드 · 배포
```bash
UNIVERSAL=1 VERSION=1.0.0 ./build.sh   # 맥에서 → dist/JjalCopy.app, dist/JjalCopy-mac.zip (arm64 + x86_64, ad-hoc 서명)
```
- 태그 `jjalcopy-mac-vX.Y.Z` 를 올리면 CI(`.github/workflows/jjalcopy-mac-release.yml`)가 빌드해서 그 릴리스에 zip 을 붙인다.
- 릴리스는 **「Latest」로 만들지 말 것**(`--latest=false`) — 사이트의 윈도우 링크가 `releases/latest/download/JjalCopySetup.exe` 라서 맥 릴리스가 최신이 되면 깨진다.
- 사이트 링크는 버전 고정: `src/components/AppContent.vue` 의 `MAC_HELPER_URL` — 새 버전을 내면 같이 바꾼다.
- Apple 개발자 인증서가 없어 ad-hoc 서명이다 → 처음 열 때 「그래도 열기」가 필요하다.

헤드리스 점검(메뉴 막대 없이 브리지만 N초): `JjalCopy.app/Contents/MacOS/JjalCopy --selftest 20`
