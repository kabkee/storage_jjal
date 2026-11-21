// 짤 문구 API (Netlify Functions v2) — 문구는 비공개 GitHub 저장소의 captions.json 한 파일에 저장한다 (DB 없음)
//   GET    /api/captions?image=<id>   그 짤의 최근 문구 (로그인하면 「내 문구」 표시, 관리자면 숨긴 것까지)
//   GET    /api/captions?all=1        (관리자) 전체 목록
//   GET    /api/captions?me=1         로그인한 사람 정보 { name, admin }
//   POST   /api/captions              { image, text, style }   — 구글 로그인 필요
//   PATCH  /api/captions/:id          { hidden }               — 관리자
//   DELETE /api/captions/:id                                   — 관리자 또는 쓴 사람
// 환경변수: GITHUB_TOKEN · CAPTIONS_REPO(owner/name) · CAPTIONS_BRANCH · GOOGLE_CLIENT_ID · ADMIN_EMAILS(쉼표) · AUTHOR_SALT · ALLOWED_ORIGINS(쉼표)
import { verifyGoogleToken, cleanStyle, cleanText, cleanImageId, checkRate, addCaption, listFor, emptyData, authorId, HttpError } from '../../lib.mjs';

export const config = { path: ['/api/captions', '/api/captions/:id'] };

const env = (k, d = '') => (globalThis.Netlify?.env?.get(k) ?? process.env[k] ?? d);
const list = (k) => env(k).split(',').map(s => s.trim()).filter(Boolean);
const FILE = 'captions.json';

// ── 구글 공개키 (JWKS) — 응답의 max-age 동안 캐시 ──
let jwks = { keys: [], until: 0 };
async function googleKeys() {
    if (Date.now() < jwks.until && jwks.keys.length) return jwks.keys;
    const r = await fetch('https://www.googleapis.com/oauth2/v3/certs');
    if (!r.ok) throw new HttpError(503, '구글 로그인 키를 받지 못했어요');
    const maxAge = Number((r.headers.get('cache-control') || '').match(/max-age=(\d+)/)?.[1] || 3600);
    jwks = { keys: (await r.json()).keys, until: Date.now() + maxAge * 1000 };
    return jwks.keys;
}

// ── GitHub 저장소 읽기/쓰기 (Contents API) ──
const gh = (path, init = {}) => fetch(`https://api.github.com/repos/${env('CAPTIONS_REPO')}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env('GITHUB_TOKEN')}`, Accept: 'application/vnd.github+json', 'User-Agent': 'jjal-captions', 'X-GitHub-Api-Version': '2022-11-28', ...(init.headers || {}) },
});
let cache = { data: null, sha: null, at: 0 };
async function load({ fresh = false } = {}) {
    if (!fresh && cache.data && Date.now() - cache.at < 15_000) return cache;
    const r = await gh(`/contents/${FILE}?ref=${encodeURIComponent(env('CAPTIONS_BRANCH', 'main'))}`);
    if (r.status === 404) { cache = { data: emptyData(), sha: null, at: Date.now() }; return cache; }
    if (!r.ok) throw new HttpError(502, `문구 저장소를 읽지 못했어요 (${r.status})`);
    const j = await r.json();
    // 1MB 넘으면 content 가 비어서 온다 → raw 로 다시
    let text = j.content ? Buffer.from(j.content, 'base64').toString('utf8') : null;
    if (text === null) {
        const raw = await gh(`/contents/${FILE}?ref=${encodeURIComponent(env('CAPTIONS_BRANCH', 'main'))}`, { headers: { Accept: 'application/vnd.github.raw' } });
        text = await raw.text();
    }
    cache = { data: JSON.parse(text), sha: j.sha, at: Date.now() };
    return cache;
}
/** 최신 내용을 읽어 change() 로 고친 뒤 저장. 그 사이 다른 사람이 저장했으면(sha 충돌) 다시 읽어서 재시도 */
async function update(change, message) {
    for (let attempt = 0; attempt < 4; attempt++) {
        const { data, sha } = await load({ fresh: true });
        const result = change(data);
        const body = { message, content: Buffer.from(JSON.stringify(data, null, 1)).toString('base64'), branch: env('CAPTIONS_BRANCH', 'main') };
        if (sha) body.sha = sha;
        const r = await gh(`/contents/${FILE}`, { method: 'PUT', body: JSON.stringify(body) });
        if (r.ok) { cache = { data, sha: (await r.json()).content.sha, at: Date.now() }; return result; }
        if (r.status !== 409 && r.status !== 422) throw new HttpError(502, `문구를 저장하지 못했어요 (${r.status})`);
        await new Promise(res => setTimeout(res, 150 + Math.random() * 350));
    }
    throw new HttpError(503, '동시에 저장하는 사람이 많아요. 잠시 뒤 다시 해 주세요');
}

// ── 요청 처리 ──
async function whoami(req) {
    const h = req.headers.get('authorization') || '';
    if (!h.startsWith('Bearer ')) return null;
    const u = await verifyGoogleToken(h.slice(7), { clientId: env('GOOGLE_CLIENT_ID'), getKeys: googleKeys });
    return { ...u, id: authorId(u.sub, env('AUTHOR_SALT', 'jjal')), admin: list('ADMIN_EMAILS').map(e => e.toLowerCase()).includes(u.email) };
}
const need = (cond, status, msg) => { if (!cond) throw new HttpError(status, msg); };

async function handle(req, context) {
    const url = new URL(req.url);
    const id = context.params?.id;
    // 읽기는 로그인이 만료·이상해도 「로그인 안 한 사람」으로 보여 준다
    const me = req.method === 'GET' ? await whoami(req).catch(() => null) : await whoami(req);

    if (req.method === 'GET') {
        if (url.searchParams.get('me')) return { me: me ? { name: me.name, admin: me.admin } : null };
        const { data } = await load();
        if (url.searchParams.get('all')) {
            need(me?.admin, 403, '관리자만 볼 수 있어요');
            return { captions: listFor(data, { all: true, me: me.id, admin: true }), admin: true };
        }
        const image = cleanImageId(url.searchParams.get('image'));
        return { captions: listFor(data, { image, me: me?.id, admin: me?.admin }), admin: !!me?.admin };
    }

    need(me, 401, '구글로 로그인해 주세요');
    const body = req.method === 'DELETE' ? {} : await req.json().catch(() => { throw new HttpError(400, '요청이 이상해요'); });

    if (req.method === 'POST' && !id) {
        const image = cleanImageId(body.image), text = cleanText(body.text), style = cleanStyle(body.style);
        const c = await update((data) => {
            checkRate(data, me.id);
            return addCaption(data, { image, text, style, author: me.id, name: me.name });
        }, `문구 추가 #${image}`);
        return { caption: { ...c, author: undefined, mine: true } };
    }
    if (req.method === 'PATCH' && id) {
        need(me.admin, 403, '관리자만 숨길 수 있어요');
        return update((data) => {
            const c = data.captions.find(x => x.id === id);
            need(c, 404, '문구를 찾지 못했어요');
            c.hidden = !!body.hidden;
            return { ok: true, id, hidden: c.hidden };
        }, `문구 ${body.hidden ? '숨김' : '다시 보이기'} ${id}`);
    }
    if (req.method === 'DELETE' && id) {
        return update((data) => {
            const i = data.captions.findIndex(x => x.id === id);
            need(i >= 0, 404, '문구를 찾지 못했어요');
            need(me.admin || data.captions[i].author === me.id, 403, '내가 쓴 문구만 지울 수 있어요');
            data.captions.splice(i, 1);
            return { ok: true, id };
        }, `문구 삭제 ${id}`);
    }
    throw new HttpError(405, '지원하지 않는 요청');
}

export default async (req, context) => {
    const origin = req.headers.get('origin') || '';
    const allowed = list('ALLOWED_ORIGINS');
    const cors = {
        'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : (allowed[0] || ''),
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '600',
        Vary: 'Origin',
    };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    try {
        const out = await handle(req, context);
        return Response.json(out, { headers: { ...cors, 'Cache-Control': 'no-store' } });
    } catch (e) {
        const status = e instanceof HttpError ? e.status : 500;
        if (status === 500) console.error(e);
        return Response.json({ error: status === 500 ? '서버 오류' : e.message }, { status, headers: cors });
    }
};
