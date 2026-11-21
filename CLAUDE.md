# storage_jjal

Vue 3 + Vuetify 3 + Vite 짤(리액션 이미지) 저장/검색 사이트. AWS Amplify(`jjal_kabkee` 브랜치, push 시 자동 배포)로 서비스 중.

## 로컬 관리 화면 (https://kabkee-main.tailfe017f.ts.net:8445/admin · Tailscale 전용)

- 🔐 **https 주소로 쓸 것**: `tailscale serve --https=8445` → `http://100.64.25.50:3010` (tailnet only, 2026-11-21). 브라우저는 https(또는 localhost)에서만 클립보드에 그림을 넣게 해 줘서, `http://100.64.25.50:3010` 으로 열면 짤 클릭 복사가 「https 주소에서만 복사돼요」로 실패한다. 설정 확인 `tailscale serve status`, 끄기 `sudo tailscale serve --https=8445 off`. (8443 paperclip · 8444 l3 client · 8446 은 다른 서비스)

- 상시 실행: PM2 `storage-jjal-admin` (`JJAL_ADMIN_HOST=100.64.25.50 pm2 start yarn --name storage-jjal-admin --cwd <repo> -- admin`). 재시작은 `pm2 restart storage-jjal-admin`.
- 🔴 관리 API 에는 인증이 없다. 그래서 **Tailscale IP 에만 바인딩**한다(127.0.0.1·LAN·0.0.0.0 에는 열지 않음). 오너는 외부에서 Tailscale 로만 접속한다(2026-11-16).
- `yarn admin` 을 환경변수 없이 실행하면 127.0.0.1 에만 열린다. 서버 코드(`admin/server/*`)를 고치면 PM2 재시작이 필요하다(Vite 가 플러그인 모듈을 다시 읽지 않음).

2026-11-16 추가. 짤 올리기·태그 확인/수정·배포를 브라우저에서 한다. **이 컴퓨터의 dev 서버에서만** 열린다(오너 결정: 온라인 관리 화면은 만들지 않음).

- **올리기 탭**: 드래그·파일 선택·Ctrl+V 붙여넣기 → `.admin-staging/`(gitignore)에 대기 → AI가 이름·감정·상황·태그 초안을 채움 → 오빠가 확인·수정 → «등록» 시 `importOne()`(import-tagged-images.js)으로 UUID 파일명·썸네일·id 채번까지 기존 절차와 똑같이 처리. 같은 파일(md5)이 이미 있으면 경고.
- **짤 목록·태그 편집 탭**: 실제 사이트와 같은 검색 규칙으로 찾고, 카드를 눌러 이름·감정·상황·태그를 고친다. «AI 초안»으로 다시 받아볼 수도 있다. 편집기마다 «이 검색어로 나오는지» 시험 칸이 있다.
- **배포 버튼**: HEAD 대비 추가·수정된 짤을 보여주고, 짤 데이터 경로(`public/assets/{gif,jpg,png,webp,thumbs}`, `sources/*.json`, `taxonomy.json`)만 커밋한다. «커밋하고 배포»는 `git push origin jjal_kabkee`(= Amplify 배포)까지 한다. 커밋 전에 파일 존재·id 중복·taxonomy 값을 점검한다.
- 코드 위치: 서버 `admin/server/*.js` + `admin/vite-plugin-admin.mjs`(vite serve 전용), 화면 `src/admin/*.vue`(`/admin` 라우트는 `import.meta.env.DEV` 일 때만 등록 → 프로덕션 빌드에 안 들어감).

### AI 태그 초안 = Claude 구독(`claude -p`) 전용 (2026-11-16 오너 결정)

- `admin/server/suggest-tags.js` 가 로컬 Claude Code CLI(`claude -p`, 로그인된 **구독 계정**)를 호출한다. 🚫 Anthropic API 키 과금 경로는 쓰지 않는다: 자식 프로세스 환경에서 `ANTHROPIC_API_KEY`·`ANTHROPIC_AUTH_TOKEN` 을 지운다. 🚫 `--bare` 금지(API 키 인증만 받음).
- 구독 사용량을 줄이려고 `--setting-sources ""`·`--strict-mcp-config`·`--tools Read`·`--system-prompt` 로 띄운다(전역 설정을 다 읽으면 1회 약 8만 토큰 → 약 4천 토큰). 모델은 기본 `sonnet`, `JJAL_TAG_MODEL` 로 바꿀 수 있다.
- 감정·상황은 `--json-schema` 의 enum 으로 taxonomy 안의 값만 나오게 강제한다. GIF는 처음·중간·끝 프레임을 이어 붙인 미리보기를 보여준다.
- 단독 실행: `node admin/server/suggest-tags.js <이미지> [메모]`
- 예전 규칙 «외부 AI API 자동 태깅 금지»는 이 구독 경로로 대체됐다. Gemini 등 다른 외부 AI API 는 여전히 쓰지 않는다.

## 새 이미지 추가하는 법 — Claude Code 세션에서 몰아서 할 때 ("새 이미지 추가해줘" 요청 시 이 절차를 따를 것)

> 하나씩 그때그때 올릴 때는 위의 관리 화면을 쓰면 된다. 아래는 여러 장을 Claude Code 세션이 직접 보고 태깅하는 절차다.

1. 원본 파일을 `public/assets/new/`에 넣는다 (원본 파일명에 한글이 있어도 상관없음, 최종적으로 UUID로 바뀜).
2. **Claude Code 세션에서 각 이미지를 직접 Read 도구로 열어서 본다.** Gemini 등 외부 AI API 를 호출하는 자동 태깅은 쓰지 않는다 — Claude가 이미지를 직접 보고 판단한다.
3. `public/assets/data/taxonomy.json`에 정의된 감정(emotion)/상황(situation) 목록에서만 골라 태그를 정한다:
   - 이미지 하나당 감정 1~2개, 상황 1~2개를 **반드시** 붙인다(빈 배열로 두지 않는다 — 모든 짤이 두 축 모두에서 필터링 가능해야 함).
   - 기존 taxonomy에 맞는 태그가 정말 없으면 `taxonomy.json`에 새 항목을 추가한다(한글 라벨 `ko` + 영어 별칭 배열 `en`). 임의로 새 태그를 만들어서 안 쓰던 값으로 넣지 않는다.
   - 자유 키워드(`tag` 필드)는 개념 하나당 한글/영어를 항상 짝으로 넣는다 (예: "고양이, Cat").
4. `public/assets/data/new-images.manifest.json`에 `[{ sourceFilename, name, emotion: [...], situation: [...], tag }, ...]` 형태로 작성한다.
5. `yarn import-images` 실행 → `public/assets/data/import-tagged-images.js`가:
   - **정지 이미지는 webp 로 변환**해 `assets/webp/<UUID>.webp`(`webp-convert.js` — PNG q90·JPG q80), **움짤은 GIF 로** `assets/gif/<UUID>.gif` 에 둔다(원본이 GIF 면 다시 인코딩하지 않고 그대로, 움직이는 webp·png 면 GIF 로 변환). 원본은 지운다. 레코드는 원본 형식별 `sources/<gif|jpg|png|webp>.json` 에 들어가고 `md5`(원본 기준)·`animated`(움직이면 true)가 붙는다. 파일명은 UUID 라 한글이 경로에 남지 않는다 (과거 배포 후 "이미지 없음" 에러의 원인이었음)
   - `generate-thumbnail.js`로 그리드용 썸네일을 `public/assets/thumbs/`에 생성 — **움직이는 이미지는 애니메이션을 유지한 움직이는 webp**로, 정지 이미지는 정지 webp로 만든다(240x240). 확장자가 아니라 실제 프레임 수로 판단한다. 움직이는 짤을 정지 프레임으로 만들면 용량은 별로 안 줄면서 움직임만 사라지므로 항상 animated webp로 유지할 것.
   - 모든 신규 레코드의 id를 `sources/*.json` 4개 파일 전체를 스캔한 전역 최대값+1로 채번한다(파일별로 따로 채번하면 다른 타입 파일과 id가 충돌할 수 있음).
   - 모든 한글 문자열을 `.normalize('NFC')`로 정규화해서 `public/assets/data/sources/<type>.json`에 레코드를 추가한다.
6. `yarn generate:data`로 `data.json`을 재생성한다.
7. `yarn test`(vitest + 두 스모크테스트)와 `yarn build`로 검증한다.
8. `yarn dev`로 띄워서 브라우저로 실제 확인한다(칩 필터, 검색, GIF 배지, 썸네일 애니메이션 등).
9. 사용자에게 배포(`git push origin jjal_kabkee`) 여부를 확인받은 뒤 push한다 — push 즉시 Amplify가 자동 빌드/배포한다.

## 데이터 스키마

`public/assets/data/sources/{gif,jpg,png,webp}.json`이 원본(git 추적 대상)이고, `public/assets/data.json`은 `yarn generate:data`로 매번 재생성되는 빌드 산출물(gitignore됨, 커밋하지 않음).

```json
{
    "id": "300",
    "name": "표시용 이름",
    "file": "assets/webp/<uuid>.webp",
    "thumb": "assets/thumbs/<uuid>.webp",
    "md5": "<원본 파일 md5>",
    "animated": true,
    "emotion": ["웃김", "황당"],
    "situation": ["놀리기/드립"],
    "tag": "고양이, Cat, ...",
    "added": "2026-10-02"
}
```

- `file`: 클립보드 복사/다운로드에 쓰이는 원본. **정지 짤은 `assets/webp/<UUID>.webp`, 움짤은 `assets/gif/<UUID>.gif`** (2026-11-21). 한글 금지.
- `md5`: 업로드 원본의 md5. 관리 화면 「이미 등록된 짤」 감지가 webp 변환본이 아니라 원본끼리 비교하도록 남긴다.
- `animated`: 움직이는 짤이면 `true`. 사이트의 「움짤」 배지·「전체/정지/움짤」 필터(`motion`)·복사 동작이 확장자 대신 이걸 본다. (`sources/gif.json` = 원래 GIF 였던 짤)
- `added`: 추가 날짜(YYYY-MM-DD). `yarn import-images` 가 자동으로 넣는다. "최근 추가 N개"가 이걸 먼저 본다(옛 짤엔 없음). id는 2026-10-02 중복 정리로 옛 짤 18개가 312~329 를 받아서 id 순서만으로는 최근 판단이 안 된다.
- `thumb`: 그리드 표시 전용 경량 썸네일. GIF 원본이면 움직이는 webp, 아니면 정지 webp. 프론트엔드는 `img.thumb || img.file`로 우선 썸네일을 쓰고 없으면 원본 폴백.
- 기존 ~310개 레거시 이미지(2026-01-01 이전에 들어온 것들)는 `category_1`/`category_2`(파일형식) 필드가 남아있지만 프론트엔드는 더 이상 참조하지 않는 죽은 필드다 — 지우지 않아도 무해함.

## URL 파라미터 (공유 링크)

history 라우터라 `/?...` 형태(2026-10-02 해시 라우터에서 전환 — 카카오톡이 `#` 들어간 링크는 미리보기를 안 만든다. 예전 `#/?...` 링크는 `src/router/index.js` 가 해시 없는 주소로 바꿔 준다). 상태↔URL 변환은 `src/utils/urlState.js`(테스트 있음).

- `search=카드` 검색어 / `emotion=웃김,황당` · `situation=한턱/쏘기` 칩 필터(쉼표 구분, taxonomy에 없는 값은 무시) / `motion=still`(정지 이미지만) · `motion=anim`(움짤만) — 옛 링크 `nogif=1` 은 `motion=still` 로 읽음
- `ids=309,310,311` 골라서 공유한 짤만 그 순서대로 표시. 검색창의 공유 아이콘 → 선택 모드 → "링크 복사". "최근 추가 N개"는 id 큰 순(= 최근 추가).
- 1개만 골라 공유하면 `/s/<id>.html` 링크가 복사된다. `yarn build` 마지막에 `generate-share-pages.js` 가 짤마다 정적 페이지를 `dist/s/`에 만들고, 열면 `/?ids=<id>` 로 넘어간다. **og:image 는 원본 webp 가 아니라 빌드 때 만든 `dist/s/<id>.jpg`(첫 프레임, 최대 800px)** — 미리보기 봇이 webp·애니메이션을 못 읽을 수 있어서. **Amplify 재작성 규칙의 예외 확장자에 `html|xml` 이 있어야 동작**(없으면 index.html 로 덮임, 2026-10-02 추가).
- 링크 미리보기(OG 태그)는 `index.html`에 정적으로 있음. 검색·필터·여러 개 공유 링크는 모두 같은 대표 카드(`public/og-image.jpg`, 1200x630)를 쓴다.

## 알아둘 것

- **화면 디자인**(2026-11-21 시안 `mockup/redesign.html` 적용): 고정 헤더(검색·🌙/☀️·⚙️ 설정·골라서 공유) + 감정/상황 펼침 버튼 + 「최근 쓴 짤」 띠 + 카드 그리드(⋯ = 상세 보기: 감정·상황 칩은 필터, 태그는 검색, 복사·저장·공유). 색은 `AppContent.vue` 의 CSS 변수(`--accent`·`--bg` 등)로, 설정은 localStorage `jjal_settings`(`theme`·`accent`)에 저장되고 `index.html` 인라인 스크립트가 첫 그리기 전에 적용한다. 「최근 쓴 짤」은 기존 `favImageIdxs`(앞에 `/` 붙은 파일 경로)를 그대로 쓴다.

- **정지 짤은 webp, 움짤은 원본 GIF**(2026-11-21 오너 결정). 같은 날 전부 webp 로 바꿨다가(305MB→66MB) **카톡이 움직이는 webp 를 작게 보여줘서(GIF 는 크게) 움짤 87개만 원본 GIF 로 되돌렸다**(55MB → 237MB, `restore-animated-gif.js` 가 `e9a565f` 의 git 기록에서 원본을 꺼냄 — 재인코딩 없음). 썸네일은 전부 webp 그대로. 🚫 `convert-to-webp.js` 다시 돌리지 말 것(움짤이 또 webp 가 됨). `public/assets/{jpg,png}` 는 비어 있다.
- 짤 클릭 복사: **정지 이미지는 도우미 유무와 상관없이 브라우저가 PNG 그림으로 복사**(카톡 Ctrl+V 로 바로 전송). **움짤만** 로컬 「짤 복사 도우미」(윈도우 `helper/windows` · 맥 `helper/mac`, 둘 다 app `JjalCopy`, `127.0.0.1:47321`)로 원본 파일을 클립보드에 넣는다(윈도우는 + 끌어다 놓기 창, 맥은 카톡 ⌘V). 윈도우 도우미의 「끌어다 놓기 창」이 꺼져 있으면(ping `popup:false`, v1.5+) 움짤은 복사하지 않고 Save As 안내 — 윈도우 카톡은 파일 붙여넣기를 안 받기 때문. 끌어다 놓기 창 미리보기는 윈도우에 webp 코덱이 없을 수 있어 사이트가 300px JPEG(`preview`)를 같이 보낸다(v1.5+ 에만, 옛 도우미는 본문 64KB 제한). 도우미가 없으면 움짤 클릭 시 OS 별 설치 안내 창(윈도우·맥 데스크톱, 창 폭 무관, 「짧은 안내만 보기」는 localStorage `jjal.helperGuideMuted`). 🚫 맥 WebPCap 의 jjal 연결 기능은 2026-11-21 에 뺐다(사이트도 WebPCap 응답을 무시). 맥 도우미 릴리스는 태그 `jjalcopy-mac-vX.Y.Z` 이고 **Latest 로 만들지 말 것**(윈도우 링크가 latest 를 씀), 사이트 링크는 `MAC_HELPER_URL` 에 버전 고정.

- **✏️ 문구 넣기**(2026-11-21, `src/components/CaptionEditor.vue`): 상세 보기(⋯)에서 정지 짤에 글귀를 넣어 PNG 로 복사·저장. 원본 해상도 캔버스, 위치(위·가운데·아래·끌어서 이동, 그림 가장자리에 딱 붙일 수 있음)·크기·글자색(직접 고르기)·테두리·배경(없음/반투명/색 채우기 — 「🎯 그림에서」로 주변 색을 찍어 원래 글귀를 덮고 쓰기, 글자에 맞춤/가로 꽉 채움, 여백). 움짤은 프레임마다 그려야 해서 지원 안 함. 결과물은 저장소에 올리지 않는다(그때그때 만들어 씀) → **글귀만 다른 변형 짤은 올리지 말고 글귀 없는 원본 하나만 둔다**(오너 결정, 같은 날 변형 짤 정리).
- **💬 문구 모음**(2026-11-21): 문구 넣기에서 만든 문구(글자+위치·색·배경)를 짤마다 남겨 모두에게 보여 준다. 구글 로그인 필수, 오너(관리자 이메일)는 ⚙️ 설정 →「📝 문구 관리」에서 숨기기·삭제. 서버는 **Netlify 개인 계정의 함수만**(`captions-api/`, 사이트 `jjal-captions-api`) + 비공개 GitHub 저장소 JSON — 자세한 건 `captions-api/README.md`. 🚫 **사이트 본체를 Netlify 로 옮기지 말 것**: Amplify(서울 엣지) 첫 응답 ~130ms vs Netlify ~650ms(2026-11-21 실측) — 원래 Amplify 로 옮긴 이유가 속도. 공개값은 `src/config.js`(`.env` 는 gitignore 라 빌드에 안 들어감). 구글 로그인은 **360 작업실(pano-stitcher)과 같은 OAuth 클라이언트**(`596825481694-…`)를 같이 쓴다 — 사이트 주소가 바뀌면 그 클라이언트의 「승인된 JavaScript 원본」과 브랜딩의 「승인된 도메인」(`d271z96h7lorpb.amplifyapp.com`), 함수의 `ALLOWED_ORIGINS` 를 같이 고칠 것. 개인정보처리방침 `/privacy.html`(구글 앱 게시 요건, 360 작업실도 함께 설명). GitHub 토큰 원본은 Bitwarden 「github - jjal-captions-api personal access tokens」.
- 🚫 **GIF 모드는 없앴다**(2026-11-21, 움짤을 원본 GIF 로 되돌리면서). 브라우저 webp→GIF 변환(`webpToGif.js`·`gifenc`)·모바일 GIF 공유 창도 같이 빠졌다. 옛 설정 `jjal_settings.gifMode` 는 읽을 때 버린다. 도우미의 `/copy-data` 는 남아 있지만 사이트는 쓰지 않는다.

- 한글 파일 경로는 절대 만들지 말 것(배포 후 이미지 깨짐의 과거 원인). 표시 텍스트(이름/태그/감정/상황)는 한글 가능하지만 반드시 NFC 정규화.
- `public/assets/data/*.js`는 `.gitignore`에서 제외되어 있어 새 스크립트를 추가해도 정상적으로 git에 추적된다.
- 이 컴퓨터의 전역 `yarn` 은 1.22 인데 저장소는 yarn 4(lockfile v8)다. 패키지 설치는 `corepack yarn@4.9.4 install` 로 한다. 스크립트 실행(`yarn dev`/`test`/`build`)은 1.22 로도 동작한다.
- `yarn build`가 Amplify의 실제 빌드 명령(`buildSpec`: `yarn install --immutable && yarn run build`)과 동일하게 동작하므로, push 전에 로컬에서 `yarn install --immutable && yarn build`를 돌려보면 CI 실패를 미리 잡을 수 있다.
