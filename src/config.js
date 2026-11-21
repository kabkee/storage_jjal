// 공개해도 되는 설정값 (빌드에 그대로 들어간다). 비밀값(GitHub 토큰 등)은 절대 여기 두지 말 것 — 그건 Netlify 함수 환경변수에.
// .env 의 VITE_* 가 있으면 그게 우선 (로컬 시험용)
export const CAPTIONS_API = import.meta.env.VITE_CAPTIONS_API || 'https://jjal-captions-api.netlify.app/api/captions';
// 구글 로그인 OAuth 클라이언트 ID (Google Cloud Console → 사용자 인증 정보). 비어 있으면 로그인·문구 공유를 숨긴다
// 360 작업실(pano-stitcher)과 같은 OAuth 클라이언트를 같이 쓴다 (2026-11-21). 승인된 JavaScript 원본에 사이트·개발 서버 주소가 등록돼 있어야 함
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '596825481694-6pjq9a9qfpank8ds8pugegfup0j02ep3.apps.googleusercontent.com';
