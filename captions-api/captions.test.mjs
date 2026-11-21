// Netlify 함수 통합 시험: GitHub Contents API·구글 JWKS 를 가짜 fetch 로 바꿔 실제 요청 흐름을 돌린다
import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'node:crypto';

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256' };
const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const token = (email, sub, name = '사람') => {
    const h = enc({ alg: 'RS256', kid: 'k1' }), p = enc({ iss: 'accounts.google.com', aud: 'cid', sub, email, email_verified: true, given_name: name, exp: Math.floor(Date.now() / 1000) + 600 });
    return `${h}.${p}.${crypto.sign('RSA-SHA256', Buffer.from(`${h}.${p}`), privateKey).toString('base64url')}`;
};
const ADMIN = token('boss@x.com', 'b', '오빠'), USER = token('u@x.com', 'u', '유저'), OTHER = token('o@x.com', 'o', '남');

let store, conflictsLeft;
beforeEach(() => {
    Object.assign(process.env, { GITHUB_TOKEN: 't', CAPTIONS_REPO: 'k/jc', CAPTIONS_BRANCH: 'main', GOOGLE_CLIENT_ID: 'cid', ADMIN_EMAILS: 'Boss@x.com', AUTHOR_SALT: 's', ALLOWED_ORIGINS: 'https://site.example,https://dev.example' });
    store = { content: null, sha: null, n: 0 }; conflictsLeft = 0;
    vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
        if (String(url).includes('googleapis.com')) return new Response(JSON.stringify({ keys: [jwk] }), { headers: { 'cache-control': 'max-age=60' } });
        if ((init.method || 'GET') === 'GET') {
            if (!store.content) return new Response('{}', { status: 404 });
            return Response.json({ content: Buffer.from(store.content).toString('base64'), sha: store.sha });
        }
        const body = JSON.parse(init.body);
        if (conflictsLeft > 0) { conflictsLeft--; store.content = JSON.stringify({ version: 1, captions: [...JSON.parse(store.content || '{"captions":[]}').captions, { id: 'race', image: '9', text: '동시', style: {}, author: 'x', name: 'x', at: new Date().toISOString(), hidden: false }] }); store.sha = 'race' + store.n; return new Response('{}', { status: 409 }); }
        if ((body.sha || null) !== store.sha) return new Response('{}', { status: 409 });
        store.content = Buffer.from(body.content, 'base64').toString('utf8'); store.sha = 'sha' + (++store.n);
        return Response.json({ content: { sha: store.sha } });
    }));
    vi.resetModules();
});
const call = async (method, path, { tok, body, origin = 'https://site.example' } = {}) => {
    const mod = await import('./netlify/functions/captions.mjs');
    const id = path.match(/\/api\/captions\/([^?]+)/)?.[1];
    const res = await mod.default(new Request('https://api.example' + path, {
        method, headers: { origin, ...(tok ? { authorization: `Bearer ${tok}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    }), { params: id ? { id } : {} });
    return { status: res.status, cors: res.headers.get('access-control-allow-origin'), json: res.status === 204 ? null : await res.json() };
};

describe('문구 API', () => {
    it('저장 → 조회 → 숨김(관리자) → 삭제 흐름', async () => {
        expect((await call('POST', '/api/captions', { body: { image: '10', text: 'x' } })).status).toBe(401);
        const a = await call('POST', '/api/captions', { tok: USER, body: { image: '10', text: ' 그래서 회의 했어? ', style: { y: 0.1, color: '#ffe14d', evil: 1 } } });
        expect(a.status).toBe(200);
        expect(a.json.caption).toMatchObject({ text: '그래서 회의 했어?', name: '유저', mine: true, style: { y: 0.1, color: '#FFE14D' } });
        const id = a.json.caption.id;
        const saved = JSON.parse(store.content).captions[0];
        expect(saved.author).toMatch(/^[0-9a-f]{16}$/);           // 구글 ID·이메일은 저장 안 함
        expect(store.content).not.toContain('u@x.com');

        const anon = await call('GET', '/api/captions?image=10');
        expect(anon.json.captions.map(c => [c.text, c.mine])).toEqual([['그래서 회의 했어?', false]]);
        expect(anon.json.captions[0].author).toBeUndefined();
        expect((await call('GET', '/api/captions?image=10', { tok: USER })).json.captions[0].mine).toBe(true);

        expect((await call('PATCH', `/api/captions/${id}`, { tok: USER, body: { hidden: true } })).status).toBe(403);
        expect((await call('PATCH', `/api/captions/${id}`, { tok: ADMIN, body: { hidden: true } })).json.hidden).toBe(true);
        expect((await call('GET', '/api/captions?image=10')).json.captions).toEqual([]);
        const adm = await call('GET', '/api/captions?image=10', { tok: ADMIN });
        expect(adm.json.admin).toBe(true);
        expect(adm.json.captions[0].hidden).toBe(true);
        expect((await call('GET', '/api/captions?all=1', { tok: USER })).status).toBe(403);
        expect((await call('GET', '/api/captions?all=1', { tok: ADMIN })).json.captions).toHaveLength(1);

        expect((await call('DELETE', `/api/captions/${id}`, { tok: OTHER })).status).toBe(403);
        expect((await call('DELETE', `/api/captions/${id}`, { tok: USER })).status).toBe(200);
        expect(JSON.parse(store.content).captions).toEqual([]);
    });
    it('동시에 저장해서 충돌하면 다시 읽어 합친다', async () => {
        await call('POST', '/api/captions', { tok: USER, body: { image: '1', text: '첫' } });
        conflictsLeft = 1;
        const r = await call('POST', '/api/captions', { tok: OTHER, body: { image: '1', text: '둘' } });
        expect(r.status).toBe(200);
        expect(JSON.parse(store.content).captions.map(c => c.text)).toEqual(['첫', '동시', '둘']);
    });
    it('CORS: 허용된 주소만 그대로 돌려준다', async () => {
        expect((await call('OPTIONS', '/api/captions', { origin: 'https://dev.example' })).cors).toBe('https://dev.example');
        expect((await call('GET', '/api/captions?image=1', { origin: 'https://evil.example' })).cors).toBe('https://site.example');
    });
    it('읽기는 만료·이상한 토큰이어도 익명으로, me=1 은 관리자 여부', async () => {
        expect((await call('GET', '/api/captions?image=1', { tok: 'a.b.c' })).status).toBe(200);
        expect((await call('GET', '/api/captions?me=1', { tok: ADMIN })).json.me).toEqual({ name: '오빠', admin: true });
        expect((await call('GET', '/api/captions?me=1', { tok: USER })).json.me).toEqual({ name: '유저', admin: false });
        expect((await call('GET', '/api/captions?me=1')).json.me).toBeNull();
        expect((await call('POST', '/api/captions', { tok: 'a.b.c', body: { image: '1', text: 'x' } })).status).toBe(401);
    });
    it('입력 오류는 400', async () => {
        expect((await call('POST', '/api/captions', { tok: USER, body: { image: 'abc', text: 'x' } })).status).toBe(400);
        expect((await call('GET', '/api/captions?image=../../x')).status).toBe(400);
    });
});
