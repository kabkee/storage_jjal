# storage_jjal

Vue 3 + Vuetify 3 + Vite 짤(리액션 이미지) 저장/검색 사이트. AWS Amplify(`jjal_kabkee` 브랜치, push 시 자동 배포)로 서비스 중.

## 새 이미지 추가하는 법 ("새 이미지 추가해줘" 요청 시 이 절차를 따를 것)

1. 원본 파일을 `public/assets/new/`에 넣는다 (원본 파일명에 한글이 있어도 상관없음, 최종적으로 UUID로 바뀜).
2. **Claude Code 세션에서 각 이미지를 직접 Read 도구로 열어서 본다.** 외부 AI API(Gemini 등)를 호출하는 자동 태깅은 쓰지 않는다 — Claude가 이미지를 직접 보고 판단한다.
3. `public/assets/data/taxonomy.json`에 정의된 감정(emotion)/상황(situation) 목록에서만 골라 태그를 정한다:
   - 이미지 하나당 감정 1~2개, 상황 1~2개를 **반드시** 붙인다(빈 배열로 두지 않는다 — 모든 짤이 두 축 모두에서 필터링 가능해야 함).
   - 기존 taxonomy에 맞는 태그가 정말 없으면 `taxonomy.json`에 새 항목을 추가한다(한글 라벨 `ko` + 영어 별칭 배열 `en`). 임의로 새 태그를 만들어서 안 쓰던 값으로 넣지 않는다.
   - 자유 키워드(`tag` 필드)는 개념 하나당 한글/영어를 항상 짝으로 넣는다 (예: "고양이, Cat").
4. `public/assets/data/new-images.manifest.json`에 `[{ sourceFilename, name, emotion: [...], situation: [...], tag }, ...]` 형태로 작성한다.
5. `yarn import-images` 실행 → `public/assets/data/import-tagged-images.js`가:
   - 파일명을 UUID + 원본 확장자로 바꾸고 확장자별 폴더(`gif`/`jpg`/`png`/`webp`)로 이동 (한글이 파일 경로에 남지 않도록 — 과거 배포 후 "이미지 없음" 에러의 원인이었음)
   - `generate-thumbnail.js`로 그리드용 썸네일을 `public/assets/thumbs/`에 생성 — **GIF는 애니메이션을 유지한 움직이는 webp**로, 나머지(JPG/PNG/WEBP)는 정지 webp로 만든다(240x240). GIF를 정지 프레임으로 만들면 용량은 별로 안 줄면서 움직임만 사라지므로, GIF는 항상 animated webp로 유지할 것.
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
    "file": "assets/gif/<uuid>.gif",
    "thumb": "assets/thumbs/<uuid>.webp",
    "emotion": ["웃김", "황당"],
    "situation": ["놀리기/드립"],
    "tag": "고양이, Cat, ..."
}
```

- `file`: 클립보드 복사/다운로드에 쓰이는 원본. 항상 UUID 파일명, 한글 금지.
- `thumb`: 그리드 표시 전용 경량 썸네일. GIF 원본이면 움직이는 webp, 아니면 정지 webp. 프론트엔드는 `img.thumb || img.file`로 우선 썸네일을 쓰고 없으면 원본 폴백.
- 기존 ~310개 레거시 이미지(2026-01-01 이전에 들어온 것들)는 `category_1`/`category_2`(파일형식) 필드가 남아있지만 프론트엔드는 더 이상 참조하지 않는 죽은 필드다 — 지우지 않아도 무해함.

## 알아둘 것

- 한글 파일 경로는 절대 만들지 말 것(배포 후 이미지 깨짐의 과거 원인). 표시 텍스트(이름/태그/감정/상황)는 한글 가능하지만 반드시 NFC 정규화.
- `public/assets/data/*.js`는 `.gitignore`에서 제외되어 있어 새 스크립트를 추가해도 정상적으로 git에 추적된다.
- `yarn build`가 Amplify의 실제 빌드 명령(`buildSpec`: `yarn install --immutable && yarn run build`)과 동일하게 동작하므로, push 전에 로컬에서 `yarn install --immutable && yarn build`를 돌려보면 CI 실패를 미리 잡을 수 있다.
