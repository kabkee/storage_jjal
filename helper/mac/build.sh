#!/bin/bash
# 짤 복사 도우미(macOS) 빌드 → dist/JjalCopy.app + dist/JjalCopy-mac.zip
# 필요: Xcode 또는 Command Line Tools (swift). 맥에서 실행한다 (CI: .github/workflows/jjalcopy-mac-release.yml)
#   VERSION=1.0.0 ./build.sh          # 기본은 이 머신 아키텍처
#   UNIVERSAL=1 ./build.sh            # arm64 + x86_64 (배포용, Xcode 필요)
set -euo pipefail
cd "$(dirname "$0")"
VERSION="${VERSION:-1.0.0}"

if [ "${UNIVERSAL:-0}" = "1" ]; then
  swift build -c release --arch arm64 --arch x86_64
  BIN=.build/apple/Products/Release/JjalCopy
else
  swift build -c release
  BIN=.build/release/JjalCopy
fi

APP=dist/JjalCopy.app
rm -rf dist && mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN" "$APP/Contents/MacOS/JjalCopy"
sed "s/__VERSION__/$VERSION/g" Info.plist > "$APP/Contents/Info.plist"
[ -f Resources/AppIcon.icns ] && cp Resources/AppIcon.icns "$APP/Contents/Resources/AppIcon.icns"
# ad-hoc 서명 (Apple 개발자 인증서 없음 → 처음 열 때 「확인되지 않은 개발자」 경고, 사이트 안내 참고)
codesign --force --deep --sign - --identifier com.kabkee.jjalcopy "$APP"
ditto -c -k --keepParent "$APP" dist/JjalCopy-mac.zip
shasum -a 256 dist/JjalCopy-mac.zip | awk '{print $1}' > dist/JjalCopy-mac.sha256
lipo -info "$APP/Contents/MacOS/JjalCopy" || true
echo "✅ dist/JjalCopy-mac.zip ($VERSION)"
