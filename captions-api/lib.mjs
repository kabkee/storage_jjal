// 짤 문구 서버 공통 로직 (Netlify Function 과 테스트가 같이 쓴다) — 외부 의존성 없음
import crypto from 'node:crypto';

export const LIMITS = {
    textMax: 80,          // 문구 길이
    perMinute: 5,         // 한 사람이 1분에 저장할 수 있는 수
    perDay: 60,           // 하루
    perImageShown: 30,    // 짤 하나에 보여줄 최근 문구 수
};

// ── 구글 ID 토큰(JWT, RS256) 검증 ──────────────────────────────
const GOOGLE_ISS = ['accounts.google.com', 'https://accounts.google.com'];
const b64url = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/**
 * @param {string} token  구글이 준 credential (ID 토큰)
 * @param {{ clientId: string, getKeys: () => Promise<Array<object>>, now?: number }} opts  getKeys = JWKS keys
 * @returns {Promise<{ sub, email, name, picture }>}
 */
export async function verifyGoogleToken(token, { clientId, getKeys, now = Date.now() }) {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) throw new HttpError(401, '로그인 정보가 이상해요');
    let header, payload;
    try {
        header = JSON.parse(b64url(parts[0]).toString('utf8'));
        payload = JSON.parse(b64url(parts[1]).toString('utf8'));
    } catch { throw new HttpError(401, '로그인 정보가 이상해요'); }
    if (header.alg !== 'RS256') throw new HttpError(401, '지원하지 않는 서명');
    const jwk = (await getKeys()).find(k => k.kid === header.kid);
    if (!jwk) throw new HttpError(401, '로그인 키를 찾지 못했어요 (다시 로그인해 주세요)');
    const ok = crypto.verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`),
        crypto.createPublicKey({ key: jwk, format: 'jwk' }), b64url(parts[2]));
    if (!ok) throw new HttpError(401, '로그인 서명이 맞지 않아요');
    if (!GOOGLE_ISS.includes(payload.iss)) throw new HttpError(401, '구글 로그인이 아니에요');
    if (payload.aud !== clientId) throw new HttpError(401, '이 사이트용 로그인이 아니에요');
    if (!payload.exp || payload.exp * 1000 < now - 30_000) throw new HttpError(401, '로그인이 만료됐어요 (다시 로그인해 주세요)');
    if (payload.email && payload.email_verified === false) throw new HttpError(401, '이메일 인증이 안 된 계정이에요');
    return { sub: payload.sub, email: (payload.email || '').toLowerCase(), name: payload.given_name || payload.name || '익명', picture: payload.picture || '' };
}

export class HttpError extends Error {
    constructor(status, message) { super(message); this.status = status; }
}

// 공개하지 않을 사용자 식별자: 구글 sub 를 소금과 함께 해시 (저장소에 구글 ID 가 그대로 남지 않게)
export const authorId = (sub, salt) => crypto.createHash('sha256').update(`${salt}:${sub}`).digest('hex').slice(0, 16);

// ── 입력 검증 ───────────────────────────────────────────────
const HEX = /^#[0-9a-fA-F]{6}$/;
const num = (v, min, max, dflt) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : dflt);

/** 문구 넣기 창의 설정(위치·크기·색·배경)만 허용한 값으로 걸러 낸다 */
export function cleanStyle(s = {}) {
    return {
        x: num(s.x, 0, 1, 0.5),
        y: num(s.y, 0, 1, 0.88),
        size: num(s.size, 3, 20, 9),
        color: HEX.test(s.color) ? s.color.toUpperCase() : '#FFFFFF',
        outline: s.outline !== false,
        bgMode: ['none', 'shade', 'fill'].includes(s.bgMode) ? s.bgMode : 'none',
        bgColor: HEX.test(s.bgColor) ? s.bgColor.toUpperCase() : '#FFFFFF',
        bgWide: !!s.bgWide,
        bgPad: num(s.bgPad, 0, 1.5, 0.3),
    };
}

export function cleanText(t) {
    const text = String(t ?? '').normalize('NFC').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '')
        .split('\n').map(l => l.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
    if (!text) throw new HttpError(400, '문구가 비어 있어요');
    if ([...text].length > LIMITS.textMax) throw new HttpError(400, `문구는 ${LIMITS.textMax}자까지예요`);
    return text;
}

export const cleanImageId = (v) => {
    const id = String(v ?? '');
    if (!/^\d{1,6}$/.test(id)) throw new HttpError(400, '짤 번호가 이상해요');
    return id;
};

// ── 데이터 다루기 (captions.json = { version: 1, captions: [...] }) ─────
export const emptyData = () => ({ version: 1, captions: [] });

/** 같은 사람이 너무 자주 저장하지 못하게 (저장된 기록의 시간으로 판단 — 별도 저장소 필요 없음) */
export function checkRate(data, author, now = Date.now()) {
    const mine = data.captions.filter(c => c.author === author).map(c => Date.parse(c.at));
    if (mine.filter(t => now - t < 60_000).length >= LIMITS.perMinute) throw new HttpError(429, '잠깐만요, 너무 빨리 저장하고 있어요 (1분 뒤 다시)');
    if (mine.filter(t => now - t < 86_400_000).length >= LIMITS.perDay) throw new HttpError(429, '오늘은 더 저장할 수 없어요');
}

export function addCaption(data, { image, text, style, author, name, now = Date.now(), id = crypto.randomUUID() }) {
    const c = { id, image, text, style, author, name: String(name || '익명').slice(0, 20), at: new Date(now).toISOString(), hidden: false };
    data.captions.push(c);
    return c;
}

/** 사이트에 보낼 형태: 숨긴 건 관리자만, author 해시는 「내 문구인지」 판단용으로만 */
export function publicView(c, { me, admin }) {
    const v = { id: c.id, image: c.image, text: c.text, style: c.style, name: c.name, at: c.at, mine: !!me && c.author === me };
    if (admin) { v.hidden = !!c.hidden; v.author = c.author; }
    return v;
}

export function listFor(data, { image, me, admin, all = false }) {
    let list = data.captions.filter(c => (all || c.image === image) && (admin || !c.hidden));
    list = list.sort((a, b) => b.at.localeCompare(a.at));
    if (!all) list = list.slice(0, LIMITS.perImageShown);
    return list.map(c => publicView(c, { me, admin }));
}
