#!/bin/bash
# 짤 문구 API 배포 (Netlify 사이트 jjal-captions-api)
# 저장소 안에서 netlify deploy 를 하면 루트 package.json 때문에 프레임워크를 잘못 짐작해 실패한다
# → 배포할 파일만 저장소 밖 임시 폴더로 복사해서 올린다. AI 가 실행할 때 규칙: CI=1 · timeout · stdin 닫기 (scripts.md §Netlify CLI)
set -euo pipefail
SITE_ID="${SITE_ID:-faa612b5-5237-40fa-a806-305218f5675f}"
MSG="${1:-문구 API 배포}"
cd "$(dirname "$0")"
TMP=$(mktemp -d /tmp/jjal-captions-deploy.XXXXXX)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/netlify"
cp -r lib.mjs netlify.toml package.json public "$TMP/"
cp -r netlify/functions "$TMP/netlify/"
cd "$TMP"
CI=1 timeout 600 netlify deploy --prod --dir=public --functions=netlify/functions --site "$SITE_ID" --json --message "$MSG" < /dev/null \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('✅', d.get('url'), d.get('deploy_id'))"
