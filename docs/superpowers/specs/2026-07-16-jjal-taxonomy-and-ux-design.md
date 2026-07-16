# 짤 저장소 — 감정/상황 분류체계 및 UX 재설계

날짜: 2026-07-16
작성자: Claude Code (브레인스토밍 세션), 검토: Kabkee

## 배경

`storage_jjal`은 원본 짤(리액션 이미지)을 `public/assets/{gif,jpg,png,webp}`에 저장하고, 검색/필터를 통해 찾아서 클립보드로 복사해 쓰는 개인용 짤 저장소 웹사이트다.

기존 구조를 조사한 결과 핵심 문제를 확인했다:
- `category_1`에는 감정/상황이 아니라 **파일 형식**(GIF/JPG/PNG/WEBP)이 들어있고, `category_2`는 **항상 null**이다. 즉 사이드바 카테고리 필터가 사실상 무의미하며, 사용자는 자유 텍스트 태그 검색에만 의존하고 있었다.
- 한글 인코딩 버그가 실제로 존재한다: `name` 필드 일부가 macOS의 NFD(자모 분리형)로 저장되어 있어, NFC로 입력하는 일반 검색어와 문자열이 일치하지 않아 검색이 실패한다(4건 확인).
- 이미지 최적화 코드가 전혀 없다. 100x100 썸네일을 보여주면서 원본(최대 8.5MB GIF 포함)을 그대로 내려받는다. `public/` 폴더는 Vite 빌드 시 가공 없이 그대로 복사된다.
- 이미지 태그 자동 생성은 Gemini API를 호출하는 스크립트(`process-new-images.js`, `generate-tags-gemini.js`)로 되어 있었으나, 이번 개편부터는 Claude Code 세션이 이미지를 직접 읽고 태깅한다.
- 태그 데이터 중 1건(`id: 128`)이 과거 자동 태깅 버그로 10만 자 이상 반복된 손상 데이터를 갖고 있다.

## 목표

1. 감정(emotion) / 상황(situation) 두 축의 다중 태그 분류체계 도입
2. 신규 이미지(Downloads 폴더 11개)를 새 체계로 반영
3. PC/모바일 필터·검색 UX 개편
4. 한글 인코딩 버그 방지 장치 추가
5. 이미지 최적화(썸네일) 파이프라인 도입
6. 개발 완료 후 배포(Amplify)까지 진행, 엔드포인트 제공

## 데이터 스키마

`category_1`/`category_2`를 폐기하고 아래 필드로 대체한다. 파일 형식은 별도 필드 없이 `file` 확장자로 판별한다(기존 "GIF 제외" 스위치와 동일한 방식).

```json
{
  "id": "227",
  "name": "어휴",
  "file": "assets/gif/036761b1-....gif",
  "thumb": "assets/thumbs/036761b1-....webp",
  "emotion": ["웃김", "황당"],
  "situation": ["회사", "재촉"],
  "tag": "고양이, Cat, 모자, Hat, 운전, Driving, straw hat, countryside"
}
```

- `emotion`, `situation`: 문자열 배열. 이미지 하나에 여러 개 허용.
- `tag`: 기존처럼 자유 키워드(캐릭터명/드라마명/출처 등). **개념 하나당 한글/영어를 항상 짝으로 등록**(예: "고양이, Cat"). 중복이어도 상관없이 양방향 등록.
- `thumb`: 신규 필드. 그리드 표시용 경량 썸네일 경로.

### 분류체계 마스터 파일

`public/assets/data/taxonomy.json`에 감정/상황의 정식 목록을 관리한다. 태깅 작업과 프론트엔드 칩 UI가 동일한 파일을 참조해 목록이 어긋나지 않게 한다. 각 항목은 한글 라벨 + 영어 별칭 배열을 갖는다(칩 UI에는 한글만 표시, 영어는 텍스트 검색 매칭용).

```json
{
  "emotion": [
    { "ko": "웃김", "en": ["Funny", "Hilarious", "LOL"] },
    { "ko": "황당", "en": ["Absurd", "WTF", "Dumbfounded"] },
    { "ko": "분노", "en": ["Angry", "Furious", "Rage"] },
    { "ko": "슬픔", "en": ["Sad", "Sorrow"] },
    { "ko": "놀람/충격", "en": ["Shocked", "Surprised"] },
    { "ko": "소름/무서움", "en": ["Creeped out", "Scared"] },
    { "ko": "부끄러움/민망", "en": ["Embarrassed", "Awkward"] },
    { "ko": "지침/귀찮음", "en": ["Exhausted", "Annoyed"] },
    { "ko": "자신감/뿌듯", "en": ["Confident", "Proud"] },
    { "ko": "무표정/시크", "en": ["Deadpan", "Nonchalant"] },
    { "ko": "불신/의심", "en": ["Doubtful", "Suspicious"] },
    { "ko": "사랑/설렘", "en": ["Affection", "Excited (romance)"] },
    { "ko": "귀여움", "en": ["Cute"] }
  ],
  "situation": [
    { "ko": "인사", "en": ["Greeting"] },
    { "ko": "동의/긍정", "en": ["Agree", "Positive"] },
    { "ko": "거절/부정", "en": ["Refuse", "Negative"] },
    { "ko": "질문/궁금", "en": ["Question", "Curious"] },
    { "ko": "축하", "en": ["Congrats", "Celebration"] },
    { "ko": "위로/공감", "en": ["Comfort", "Empathy"] },
    { "ko": "감사", "en": ["Thanks"] },
    { "ko": "사과", "en": ["Apology"] },
    { "ko": "재촉/독촉", "en": ["Urging", "Nagging"] },
    { "ko": "놀리기/드립", "en": ["Teasing", "Joke"] },
    { "ko": "자랑", "en": ["Bragging"] },
    { "ko": "신세한탄", "en": ["Complaining", "Venting"] },
    { "ko": "회사/업무", "en": ["Work", "Office"] },
    { "ko": "밥/먹방/술", "en": ["Food", "Mukbang", "Drinking"] }
  ]
}
```

새 태그가 필요하면 이 파일에 추가한다(코드 변경 불필요).

## 태깅 워크플로우 (신규 이미지)

1. 원본 이미지를 `public/assets/new/`에 넣는다.
2. Claude Code 세션에서 각 이미지를 직접 읽고(Read 도구), `taxonomy.json`을 참고해 emotion 1~2개, situation 1~2개를 부여한다. 목록에 맞는 태그가 없으면 `taxonomy.json`에 추가한다.
3. 자유 태그(`tag`)는 보이는 요소마다 한글+영어를 짝으로 채운다.
4. 파일명은 UUID + 원본 확장자로 변경(한글 파일명이 파일시스템에 닿지 않도록). 확장자별 폴더(`gif/jpg/png/webp`)로 이동.
5. `sharp`로 그리드용 썸네일(240x240 webp, GIF는 첫 프레임 정지 이미지)을 `public/assets/thumbs/`에 생성.
6. `public/assets/data/sources/<type>.json`에 레코드 추가. 이때 모든 한글 문자열은 `.normalize('NFC')` 적용.
7. `yarn convert`(생성 + 정규화)로 `data.json` 재생성.

기존 310개 이미지의 감정/상황 소급 태깅과 썸네일 백필은 별도 배치 작업으로 분리한다(이번 스코프는 신규 11개 + 스키마/UX 변경까지).

## UI/필터/검색

- **PC**: 검색창 아래 감정 칩 줄 + 상황 칩 줄을 아코디언 없이 항상 펼쳐서 표시. 선택된 칩은 강조색으로 표시. 총 개수 표시 옆에 "GIF 제외" 스위치 유지.
- **모바일**: 검색창 + "필터(N)" 버튼(선택 개수 뱃지) → 탭하면 바텀시트로 감정/상황 칩 전체 표시.
- **필터 로직**: 같은 축 안에서는 OR, 축 사이에서는 AND. 예: 감정=[웃김, 황당], 상황=[거절] → (웃김 OR 황당) AND 거절.
- **검색 대상 필드 확장**: `name`, `tag`, `emotion`, `situation`, `file` 문자열 부분일치(대소문자 무시, 기존 동작 유지).
- **즐겨찾기("최근") 기능**: 현재 동작(클릭 시 저장, 최근 항목이 앞으로) 그대로 유지, 이번 변경과 무관.

## 한글 인코딩 안전장치

- 파일 경로: 항상 UUID(ASCII)만 사용. 한글이 파일시스템 경로에 들어가지 않게 해 배포 후 "이미지 없음" 에러를 방지(신규 파이프라인은 이미 이렇게 동작 중, 계속 유지).
- 저장 시: 태깅 스크립트/워크플로우에서 한글 텍스트를 `.normalize('NFC')` 후 저장.
- 빌드 시: `normalize-data_json.js`, `normalize-assets.js`를 통한 NFC 재정규화를 `yarn convert`에 계속 연결(현재도 되어 있음, 유지 필수).
- 검색 시: `AppContent.vue`의 검색 비교 로직에 `.normalize('NFC')`를 검색어/대상 필드 양쪽에 추가(현재는 없음 → 방어선 하나 추가).
- 정리 대상: `id: 128` 항목의 손상된(10만자+) `tag` 필드를 재태깅 시 정상화.

## 이미지 최적화

- 신규 이미지 등록 시 `sharp`로 그리드용 썸네일(240x240 webp) 생성, 원본은 클립보드 복사/저장에만 사용.
- GIF는 애니메이션 대신 첫 프레임 정지 이미지를 썸네일로 사용(그리드에서는 정지 이미지로 충분, 클릭 시에만 원본 GIF 사용).
- Vuetify `v-img`는 이미 IntersectionObserver 기반 lazy-load를 내장하고 있어 추가 작업 불필요.
- 기존 310개 이미지의 썸네일 백필은 별도 일괄 스크립트로 처리(이번 스코프 밖, 후속 작업으로 명시).

## 배포

- 실제 배포 플랫폼은 AWS Amplify로 확인됨(`gh-pages` 스크립트는 사용되지 않는 죽은 코드).
- 배포 트리거(어느 브랜치를 Amplify가 보고 있는지)는 사용자가 Amplify 콘솔에서 직접 확인 필요 — 확인 전에는 실제 push/배포를 진행하지 않는다.
- 구현 완료 후: 로컬 빌드 검증(`yarn build`) → 사용자가 확인한 배포 트리거 브랜치로 push(사용자 승인 하에) → Amplify 빌드 확인 → 엔드포인트 URL 전달.

## 스코프 경계 (이번 라운드)

**포함**: 스키마 변경, `taxonomy.json` 도입, 신규 이미지 11개 태깅/반영, PC/모바일 필터 UI 개편, 검색 인코딩 안전장치, 신규 이미지 썸네일 파이프라인, 빌드 검증 후 배포.

**제외(후속 작업)**: 기존 310개 이미지의 감정/상황 소급 태깅, 기존 이미지 썸네일 백필, `id: 128` 외 다른 데이터 품질 이슈 전수조사.
