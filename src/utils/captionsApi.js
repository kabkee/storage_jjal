// 짤 문구 API (Netlify 함수 jjal-captions-api) 호출
import { CAPTIONS_API } from '@/config';
import { authHeader, signOut, user, isAdmin } from '@/utils/googleAuth';

async function call(method, path = '', body) {
    const r = await fetch(CAPTIONS_API + path, {
        method,
        headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...authHeader() },
        body: body ? JSON.stringify(body) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && user.value) signOut();   // 토큰 만료 → 다시 로그인하게
    if (!r.ok) throw new Error(j.error || `문구 서버 오류 (${r.status})`);
    return j;
}

export const listCaptions = (image) => call('GET', `?image=${encodeURIComponent(image)}`);
export const listAllCaptions = () => call('GET', '?all=1');
export const saveCaption = (image, text, style) => call('POST', '', { image, text, style });
export const setCaptionHidden = (id, hidden) => call('PATCH', `/${id}`, { hidden });
export const deleteCaption = (id) => call('DELETE', `/${id}`);
export async function refreshMe() {
    if (!user.value) { isAdmin.value = false; return null; }
    try {
        const { me } = await call('GET', '?me=1');
        isAdmin.value = !!me?.admin;
        return me;
    } catch { isAdmin.value = false; return null; }
}
