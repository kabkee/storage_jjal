import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { verifyGoogleToken, cleanStyle, cleanText, cleanImageId, checkRate, addCaption, listFor, emptyData, authorId, HttpError, LIMITS } from './lib.mjs';

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const sign = (payload, { kid = 'k1', key = privateKey } = {}) => {
    const h = enc({ alg: 'RS256', kid, typ: 'JWT' }), p = enc(payload);
    return `${h}.${p}.${crypto.sign('RSA-SHA256', Buffer.from(`${h}.${p}`), key).toString('base64url')}`;
};
const now = Date.now();
const good = { iss: 'https://accounts.google.com', aud: 'cid', sub: '123', email: 'A@x.com', email_verified: true, given_name: '오빠', exp: Math.floor(now / 1000) + 600 };
const opts = { clientId: 'cid', getKeys: async () => [jwk], now };

describe('구글 토큰 검증', () => {
    it('정상 토큰', async () => {
        expect(await verifyGoogleToken(sign(good), opts)).toMatchObject({ sub: '123', email: 'a@x.com', name: '오빠' });
    });
    it.each([
        ['다른 사이트(aud)', { ...good, aud: 'other' }],
        ['만료', { ...good, exp: Math.floor(now / 1000) - 600 }],
        ['구글 아님(iss)', { ...good, iss: 'evil' }],
        ['이메일 미인증', { ...good, email_verified: false }],
    ])('거절: %s', async (_, p) => {
        await expect(verifyGoogleToken(sign(p), opts)).rejects.toBeInstanceOf(HttpError);
    });
    it('거절: 다른 키로 서명', async () => {
        const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
        await expect(verifyGoogleToken(sign(good, { key: other }), opts)).rejects.toThrow('서명');
    });
    it('거절: 내용 바꿔치기', async () => {
        const [h, , s] = sign(good).split('.');
        await expect(verifyGoogleToken(`${h}.${enc({ ...good, email: 'boss@x.com' })}.${s}`, opts)).rejects.toThrow('서명');
    });
});

describe('입력 검증', () => {
    it('스타일은 허용 범위로 자른다', () => {
        expect(cleanStyle({ x: 5, y: -1, size: 99, color: 'red', bgMode: 'evil', bgColor: '#abcdef', extra: 1 }))
            .toEqual({ x: 1, y: 0, size: 20, color: '#FFFFFF', outline: true, bgMode: 'none', bgColor: '#ABCDEF', bgWide: false, bgPad: 0.3 });
    });
    it('문구: NFC·공백 정리·길이 제한', () => {
        expect(cleanText('  안녕\r\n\n\n\n하세요 ')).toBe('안녕\n\n하세요');
        expect(cleanText('ㅎ'.normalize('NFD'))).toBe('ㅎ'.normalize('NFC'));
        expect(() => cleanText('  ')).toThrow('비어');
        expect(() => cleanText('가'.repeat(LIMITS.textMax + 1))).toThrow('자까지');
    });
    it('짤 번호는 숫자만', () => {
        expect(cleanImageId(12)).toBe('12');
        expect(() => cleanImageId('../x')).toThrow();
    });
});

describe('데이터', () => {
    it('목록: 최신순 · 숨김은 관리자만 · 내 문구 표시', () => {
        const d = emptyData();
        addCaption(d, { image: '1', text: 'a', style: {}, author: 'me', name: '나', now: now - 2000, id: 'a' });
        addCaption(d, { image: '1', text: 'b', style: {}, author: 'you', name: '너', now: now - 1000, id: 'b' });
        addCaption(d, { image: '2', text: 'c', style: {}, author: 'you', name: '너', now, id: 'c' });
        d.captions.find(c => c.id === 'b').hidden = true;
        expect(listFor(d, { image: '1', me: 'me' }).map(c => [c.id, c.mine])).toEqual([['a', true]]);
        const adm = listFor(d, { image: '1', admin: true });
        expect(adm.map(c => [c.id, c.hidden])).toEqual([['b', true], ['a', false]]);
        expect(listFor(d, { all: true, admin: true }).map(c => c.id)).toEqual(['c', 'b', 'a']);
        expect('author' in listFor(d, { image: '1' })[0]).toBe(false);
    });
    it('너무 자주 저장하면 막는다', () => {
        const d = emptyData();
        for (let i = 0; i < LIMITS.perMinute; i++) addCaption(d, { image: '1', text: 't', style: {}, author: 'me', now: now - i * 1000 });
        expect(() => checkRate(d, 'me', now)).toThrow('너무 빨리');
        expect(() => checkRate(d, 'other', now)).not.toThrow();
    });
    it('작성자 해시는 소금마다 다르고 구글 ID 를 드러내지 않는다', () => {
        expect(authorId('123', 's1')).not.toBe(authorId('123', 's2'));
        expect(authorId('123', 's1')).not.toContain('123');
    });
});
