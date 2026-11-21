// 구글 로그인 (Google Identity Services). 회원 DB 없이, 구글이 준 ID 토큰을 문구 API 가 직접 검증한다.
// 토큰은 1시간짜리 — 만료되면 다시 「구글로 로그인」 (자동 선택이 켜져 있어 보통 한 번 누르면 끝)
import { ref } from 'vue';
import { GOOGLE_CLIENT_ID } from '@/config';

export const authEnabled = !!GOOGLE_CLIENT_ID;
const KEY = 'jjal_google_cred';

const decode = (jwt) => {
    const p = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(atob(p).split('').map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('')));
};
const valid = (u) => u && u.exp * 1000 > Date.now() + 30_000;
const loadSaved = () => {
    try { const u = JSON.parse(localStorage.getItem(KEY) || 'null'); return valid(u) ? u : null; } catch { return null; }
};

/** { credential, name, email, picture, exp } 또는 null */
export const user = ref(loadSaved());
export const isAdmin = ref(false);   // 문구 API 의 ?me=1 응답으로 채운다

let gis;
export function loadGis() {
    if (!authEnabled) return Promise.reject(new Error('구글 로그인이 아직 설정되지 않았어요'));
    gis ||= new Promise((resolve, reject) => {
        if (window.google?.accounts?.id) return resolve();
        const s = document.createElement('script');
        s.src = 'https://accounts.google.com/gsi/client';
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => { gis = null; reject(new Error('구글 로그인을 불러오지 못했어요')); };
        document.head.appendChild(s);
    }).then(() => {
        window.google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: onCredential, auto_select: true, ux_mode: 'popup', use_fedcm_for_prompt: true });
    });
    return gis;
}

const listeners = new Set();
export const onSignIn = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

function onCredential({ credential }) {
    const p = decode(credential);
    const u = { credential, name: p.given_name || p.name || '익명', email: p.email, picture: p.picture, exp: p.exp };
    localStorage.setItem(KEY, JSON.stringify(u));
    user.value = u;
    listeners.forEach(fn => fn(u));
}

/** el 안에 구글 로그인 버튼을 그린다 */
export async function renderSignInButton(el, { text = 'signin_with' } = {}) {
    await loadGis();
    if (!el) return;
    window.google.accounts.id.renderButton(el, { theme: 'outline', size: 'medium', shape: 'pill', text, locale: 'ko' });
}

export function signOut() {
    localStorage.removeItem(KEY);
    user.value = null;
    isAdmin.value = false;
    window.google?.accounts?.id?.disableAutoSelect();
}

export function authHeader() {
    if (!user.value) return {};
    if (!valid(user.value)) { signOut(); return {}; }
    return { Authorization: `Bearer ${user.value.credential}` };
}
