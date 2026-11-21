# 짤 문구 API (jjal-captions-api)

「✏️ 문구 넣기」에서 만든 문구를 짤마다 남겨 모두와 나누는 작은 서버. **사이트 본체는 AWS Amplify(서울 엣지라 빠름), 이 API 만 Netlify 개인 계정**에 따로 둔다 (2026-11-21 실측: 첫 응답 Amplify ~130ms · Netlify ~650ms → 사이트는 옮기지 않음. 회사 AWS 와 개인 것을 나누려고 API 는 Netlify).

- 로그인: 구글 로그인(Google Identity Services) — 회원 DB 없음. 함수가 구글 ID 토큰을 JWKS 로 직접 검증(`lib.mjs` `verifyGoogleToken`)
- 저장: **비공개 GitHub 저장소**의 `captions.json` 한 파일 (Contents API). 동시에 저장해서 sha 가 충돌하면 다시 읽어 합친 뒤 재시도
- 저장소에는 구글 ID·이메일을 남기지 않는다 — 작성자는 `sha256(AUTHOR_SALT:sub)` 앞 16자, 이름은 구글 이름(given_name)만
- 관리자(`ADMIN_EMAILS`)는 숨긴 문구까지 보고 숨기기·다시 보이기·삭제. 일반 사용자는 자기 문구만 삭제
- 제한: 문구 80자 · 1분 5개 · 하루 60개 · 짤마다 최근 30개 표시

## API
| | |
|---|---|
| `GET /api/captions?image=<id>` | 그 짤의 문구 (로그인 시 `mine`, 관리자면 숨긴 것도) |
| `GET /api/captions?me=1` | `{ me: { name, admin } }` |
| `GET /api/captions?all=1` | (관리자) 전체 |
| `POST /api/captions` `{ image, text, style }` | 저장 (로그인 필요) |
| `PATCH /api/captions/:id` `{ hidden }` | (관리자) 숨김 |
| `DELETE /api/captions/:id` | 관리자 또는 쓴 사람 |

## 환경변수 (Netlify 사이트 설정)
`GITHUB_TOKEN`(문구 저장소 Contents 읽기·쓰기만 있는 fine-grained 토큰) · `CAPTIONS_REPO`(owner/name) · `CAPTIONS_BRANCH`(main) · `GOOGLE_CLIENT_ID` · `ADMIN_EMAILS`(쉼표) · `AUTHOR_SALT`(아무 긴 문자열, 바꾸면 「내 문구」 판단이 초기화됨) · `ALLOWED_ORIGINS`(사이트 주소들, 쉼표)

## 배포 (AI 가 실행할 때는 ~/docker/silverbullet/space/claude_works/rules/scripts.md §Netlify CLI 규칙대로)
```bash
cd captions-api
CI=1 timeout 600 netlify deploy --prod --dir=public --functions=netlify/functions --site <SITE_ID> --json --message "<설명>" < /dev/null
```
시험: 저장소 루트에서 `yarn test` (lib 단위 + 함수 통합 — GitHub·구글을 가짜 fetch 로)
사이트 쪽 설정: `src/config.js` (`CAPTIONS_API`, `GOOGLE_CLIENT_ID` — 공개값). 클라이언트 ID 가 비어 있으면 문구 모음·로그인을 숨긴다.
