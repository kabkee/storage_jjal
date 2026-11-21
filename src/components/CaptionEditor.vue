<template>
    <!-- 짤에 문구 넣기: 원본 해상도 캔버스에 글자를 그려 PNG 로 복사·저장한다 (정지 짤 전용 — 움짤은 프레임마다 그려야 해서 지원 안 함) -->
    <div class="dim" @click.self="emit('close')">
        <div class="cap" role="dialog" aria-modal="true" :aria-label="`${image.name} 에 문구 넣기`">
            <div class="cap-head">
                <h2>✏️ 문구 넣기</h2>
                <button class="btn small" @click="emit('close')">닫기</button>
            </div>

            <div class="cap-body">
                <div class="stage">
                    <canvas ref="canvas" class="preview" :class="{ dragging, picking }"
                        :title="picking ? '배경으로 쓸 색을 그림에서 누르세요' : '끌어서 글자 위치 옮기기'"
                        @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp" @pointercancel="onUp"></canvas>
                    <div v-if="!loaded" class="loading">불러오는 중…</div>
                    <div v-if="picking" class="pick-hint">🎯 그림에서 배경으로 쓸 색을 누르세요</div>
                </div>

                <div class="controls">
                    <!-- v-model 은 한글 조합이 끝날 때까지 값을 안 넘겨서 글자가 늦게 그려진다 → input 이벤트 값을 직접 받는다 -->
                    <textarea ref="textInput" class="text" rows="2" :value="text" placeholder="넣을 문구 (엔터로 줄바꿈)"
                        @input="text = $event.target.value"></textarea>

                    <div class="row">
                        <span class="lbl">위치</span>
                        <div class="seg">
                            <button v-for="[v, l] in POSITIONS" :key="v" :class="{ on: Math.abs(pos.y - v) < 0.01 }"
                                @click="pos = { x: 0.5, y: v }">{{ l }}</button>
                        </div>
                        <span class="hint">그림을 끌어서 옮겨도 돼요</span>
                    </div>

                    <div class="row">
                        <span class="lbl">크기</span>
                        <input v-model.number="size" type="range" min="3" max="20" step="0.5" class="range" aria-label="글자 크기">
                    </div>

                    <div class="row">
                        <span class="lbl">글자</span>
                        <button v-for="c in COLORS" :key="c" class="sw" :class="{ on: color.toLowerCase() === c.toLowerCase() }"
                            :style="{ background: c }" :aria-label="`글자색 ${c}`" @click="color = c"></button>
                        <label class="sw custom" :class="{ on: !COLORS.some(c => c.toLowerCase() === color.toLowerCase()) }"
                            :style="customStyle(color, COLORS)" title="글자색 직접 고르기">
                            <input type="color" :value="color" aria-label="글자색 직접 고르기" @input="color = $event.target.value">
                        </label>
                        <label class="chk"><input v-model="outline" type="checkbox"> 테두리</label>
                    </div>

                    <!-- 배경: 원래 그림의 글귀를 덮고 새로 쓰고 싶을 때. 「그림에서」 로 주변 색을 찍어 오면 티가 덜 난다 -->
                    <div class="row">
                        <span class="lbl">배경</span>
                        <div class="seg">
                            <button v-for="[v, l] in BG_MODES" :key="v" :class="{ on: bgMode === v }" @click="bgMode = v">{{ l }}</button>
                        </div>
                    </div>
                    <template v-if="bgMode === 'fill'">
                        <div class="row">
                            <span class="lbl"></span>
                            <button v-for="c in BG_COLORS" :key="c" class="sw" :class="{ on: bgColor.toLowerCase() === c.toLowerCase() }"
                                :style="{ background: c }" :aria-label="`배경색 ${c}`" @click="bgColor = c"></button>
                            <label class="sw custom" :class="{ on: !BG_COLORS.some(c => c.toLowerCase() === bgColor.toLowerCase()) }"
                                :style="customStyle(bgColor, BG_COLORS)" title="배경색 직접 고르기">
                                <input type="color" :value="bgColor" aria-label="배경색 직접 고르기" @input="bgColor = $event.target.value">
                            </label>
                            <button class="btn small pick" :class="{ on: picking }" @click="picking = !picking">🎯 그림에서</button>
                        </div>
                    </template>
                    <template v-if="bgMode !== 'none'">
                        <div class="row">
                            <span class="lbl"></span>
                            <div class="seg">
                                <button :class="{ on: !bgWide }" @click="bgWide = false">글자에 맞춤</button>
                                <button :class="{ on: bgWide }" @click="bgWide = true">가로 꽉 채움</button>
                            </div>
                        </div>
                        <div class="row">
                            <span class="lbl">여백</span>
                            <input v-model.number="bgPad" type="range" min="0" max="1.5" step="0.05" class="range" aria-label="배경 여백">
                        </div>
                    </template>

                    <!-- 💬 문구 모음: 모두가 저장한 문구(구글 로그인). 누르면 글자·위치·색까지 그대로 불러온다 -->
                    <div v-if="sharingOn" class="shared">
                        <div class="shared-head">
                            <span>💬 이 짤의 문구 모음 <small v-if="shared.length">({{ shared.length }})</small></span>
                            <span v-if="isAdmin" class="admin-badge">관리자</span>
                        </div>
                        <div v-if="sharedError" class="shared-msg">{{ sharedError }}</div>
                        <div v-else-if="sharedLoading" class="shared-msg">불러오는 중…</div>
                        <div v-else-if="!shared.length" class="shared-msg">아직 저장된 문구가 없어요. 첫 문구를 남겨 보세요!</div>
                        <div v-else class="shared-list">
                            <div v-for="c in shared" :key="c.id" class="shared-item" :class="{ hidden: c.hidden }">
                                <button class="shared-text" :title="c.text" @click="applyCaption(c)">
                                    <span class="t">{{ c.text.replace(/\n/g, ' / ') }}</span>
                                    <span class="by">{{ c.mine ? '내 문구' : c.name }} · {{ ago(c.at) }}<template v-if="c.hidden"> · 숨김</template></span>
                                </button>
                                <button v-if="isAdmin" class="mini" :title="c.hidden ? '다시 보이기' : '숨기기'" @click="toggleHidden(c)">{{ c.hidden ? '👁' : '🙈' }}</button>
                                <button v-if="isAdmin || c.mine" class="mini" title="삭제" @click="removeCaption(c)">🗑</button>
                            </div>
                        </div>
                        <div v-show="showLogin && !user" class="login">
                            <span>문구를 모두와 나누려면 로그인해 주세요</span>
                            <div ref="loginEl"></div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="cap-actions" :class="{ three: sharingOn }">
                <button class="btn primary" :disabled="!loaded" @click="copy()">📋 복사하기</button>
                <button class="btn" :disabled="!loaded" @click="save()">⬇ 저장</button>
                <button v-if="sharingOn" class="btn share" :disabled="!loaded || !text.trim() || saving" @click="share()"
                    title="이 문구(글자·위치·색)를 이 짤의 문구 모음에 남겨요 — 모두에게 보여요">
                    {{ saving ? '저장 중…' : '💬 문구 모음에 남기기' }}
                </button>
            </div>
        </div>
    </div>
</template>

<script setup>
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { authEnabled, user, isAdmin, renderSignInButton, onSignIn } from '@/utils/googleAuth';
import { listCaptions, saveCaption, setCaptionHidden, deleteCaption, refreshMe } from '@/utils/captionsApi';

const props = defineProps({ image: { type: Object, required: true } });
const emit = defineEmits(['close', 'toast', 'copied']);

const POSITIONS = [[0.12, '위'], [0.5, '가운데'], [0.88, '아래']];
const COLORS = ['#FFFFFF', '#111111', '#FFE14D', '#FF4D4D'];
const BG_COLORS = ['#FFFFFF', '#000000', '#FFE14D'];
const BG_MODES = [['none', '없음'], ['shade', '반투명'], ['fill', '색 채우기']];
// 직접 고른 색이면 그 색으로, 아니면 무지개 동그라미
const customStyle = (c, presets) => presets.some(p => p.toLowerCase() === c.toLowerCase()) ? null : { background: c };
const FONT = '"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

const canvas = ref(null);
const textInput = ref(null);
const loaded = ref(false);
const text = ref('');
const pos = ref({ x: 0.5, y: 0.88 });   // 글자 덩어리 가운데 (그림 대비 비율)
const size = ref(9);                     // 글자 높이 = 그림 폭의 size%
const color = ref('#FFFFFF');
const outline = ref(true);
const bgMode = ref('none');            // 'none' | 'shade'(반투명 검정) | 'fill'(단색으로 덮기)
const bgColor = ref('#FFFFFF');
const bgWide = ref(false);              // 배경을 그림 가로 전체로
const bgPad = ref(0.3);                 // 배경 여백 (글자 크기 대비)
const picking = ref(false);             // 그림에서 배경색 찍기 모드
const dragging = ref(false);
let img = null;

// 폭에 맞춰 줄바꿈 (한글은 띄어쓰기가 없어도 끊어야 해서 글자 단위로 넘친 곳을 자른다)
const wrapLines = (ctx, raw, maxW) => {
    const out = [];
    for (const para of raw.split('\n')) {
        let line = '';
        for (const ch of para) {
            if (line && ctx.measureText(line + ch).width > maxW) {
                const sp = line.lastIndexOf(' ');
                if (sp > 0) { out.push(line.slice(0, sp)); line = line.slice(sp + 1) + ch; }
                else { out.push(line); line = ch; }
            } else line += ch;
        }
        out.push(line);
    }
    return out;
};

const draw = () => {
    const c = canvas.value;
    if (!c || !img) return;
    const W = img.naturalWidth, H = img.naturalHeight;
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(img, 0, 0, W, H);
    const t = text.value.trim() ? text.value : '';
    if (!t) return;

    const px = Math.max(12, Math.round(W * size.value / 100));
    ctx.font = `800 ${px}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lines = wrapLines(ctx, t, W * 0.96);
    const lh = px * 1.22;
    const widths = lines.map(l => ctx.measureText(l).width);
    const maxW = Math.max(...widths);
    // 실제 글자 모양의 위·아래 끝 (줄 간격 여백 제외) — 그림 가장자리에 딱 붙일 수 있게 이걸로 가둔다
    const m0 = ctx.measureText(lines[0] || '가'), m1 = ctx.measureText(lines[lines.length - 1] || '가');
    const asc = m0.actualBoundingBoxAscent || px * 0.45, desc = m1.actualBoundingBoxDescent || px * 0.45;
    const span = lh * (lines.length - 1);                 // 첫 줄 가운데 ~ 마지막 줄 가운데
    const stroke = outline.value ? Math.max(2, px * 0.16) : 0;
    const edge = stroke / 2;                              // 테두리가 잘리지 않을 만큼만 띄운다 (거의 0)
    const halfW = Math.min(W / 2, maxW / 2 + edge);
    const cx = Math.min(Math.max(pos.value.x * W, halfW), W - halfW);
    const upper = asc + span / 2 + edge, lower = desc + span / 2 + edge;
    const cy = upper + lower >= H ? H / 2 : Math.min(Math.max(pos.value.y * H, upper), H - lower);
    const top = cy - span / 2;

    if (bgMode.value !== 'none') {
        const pad = px * bgPad.value;
        const y0 = cy - span / 2 - asc - pad, y1 = cy + span / 2 + desc + pad;
        const bw = bgWide.value ? W : maxW + pad * 2;
        ctx.fillStyle = bgMode.value === 'shade' ? 'rgba(0,0,0,0.55)' : bgColor.value;
        ctx.fillRect(bgWide.value ? 0 : cx - bw / 2, y0, bw, y1 - y0);
    }
    lines.forEach((l, i) => {
        const y = top + i * lh;
        if (outline.value) {
            ctx.lineJoin = 'round';
            ctx.miterLimit = 2;
            ctx.lineWidth = stroke;
            ctx.strokeStyle = isDark(color.value) ? '#FFFFFF' : '#000000';
            ctx.strokeText(l, cx, y);
        }
        ctx.fillStyle = color.value;
        ctx.fillText(l, cx, y);
    });
};

// 어두운 글자색이면 흰 테두리, 밝으면 검은 테두리
const isDark = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return ((n >> 16) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) < 128;
};

watch([text, pos, size, color, outline, bgMode, bgColor, bgWide, bgPad], draw, { deep: true });

// ── 💬 문구 모음 (구글 로그인 · Netlify 함수 jjal-captions-api · GitHub JSON) ──
const sharingOn = authEnabled;          // 구글 클라이언트 ID 가 설정돼 있을 때만 보인다
const shared = ref([]);
const sharedLoading = ref(false);
const sharedError = ref('');
const saving = ref(false);
const showLogin = ref(false);
const loginEl = ref(null);

const currentStyle = () => ({
    x: pos.value.x, y: pos.value.y, size: size.value, color: color.value, outline: outline.value,
    bgMode: bgMode.value, bgColor: bgColor.value, bgWide: bgWide.value, bgPad: bgPad.value,
});
const applyCaption = (c) => {
    const st = c.style || {};
    text.value = c.text;
    pos.value = { x: st.x ?? 0.5, y: st.y ?? 0.88 };
    size.value = st.size ?? 9;
    color.value = st.color || '#FFFFFF';
    outline.value = st.outline !== false;
    bgMode.value = st.bgMode || 'none';
    bgColor.value = st.bgColor || '#FFFFFF';
    bgWide.value = !!st.bgWide;
    bgPad.value = st.bgPad ?? 0.3;
};
const ago = (iso) => {
    const s = (Date.now() - Date.parse(iso)) / 1000;
    if (s < 60) return '방금';
    if (s < 3600) return `${Math.floor(s / 60)}분 전`;
    if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
    if (s < 86400 * 30) return `${Math.floor(s / 86400)}일 전`;
    return iso.slice(0, 10);
};
const loadShared = async () => {
    sharedLoading.value = true;
    sharedError.value = '';
    try { shared.value = (await listCaptions(props.image.id)).captions; }
    catch (e) { sharedError.value = `문구 모음을 불러오지 못했어요 (${e.message})`; }
    finally { sharedLoading.value = false; }
};
const askLogin = async () => {
    showLogin.value = true;
    await nextTick();
    try { await renderSignInButton(loginEl.value); }
    catch (e) { emit('toast', { message: e.message, type: 'error' }); }
};
const share = async () => {
    if (!user.value) return askLogin();
    saving.value = true;
    try {
        const { caption } = await saveCaption(props.image.id, text.value, currentStyle());
        shared.value = [caption, ...shared.value];
        emit('toast', { message: '문구 모음에 남겼어요 — 다른 사람도 볼 수 있어요' });
    } catch (e) {
        emit('toast', { message: e.message, type: 'error' });
        if (!user.value) askLogin();   // 로그인이 만료됐으면 다시
    } finally { saving.value = false; }
};
const toggleHidden = async (c) => {
    try { const r = await setCaptionHidden(c.id, !c.hidden); c.hidden = r.hidden; }
    catch (e) { emit('toast', { message: e.message, type: 'error' }); }
};
const removeCaption = async (c) => {
    if (!confirm(`「${c.text}」 문구를 지울까요?`)) return;
    try { await deleteCaption(c.id); shared.value = shared.value.filter(x => x.id !== c.id); }
    catch (e) { emit('toast', { message: e.message, type: 'error' }); }
};
// 로그인하면: 관리자 여부 확인 → 목록 다시(내 문구 표시) → 저장하려던 중이었으면 이어서 저장
const offSignIn = onSignIn(async () => {
    await refreshMe();
    await loadShared();
    if (showLogin.value && text.value.trim()) { showLogin.value = false; share(); }
});
onUnmounted(offSignIn);
if (sharingOn) {
    loadShared();
    if (user.value) refreshMe().then(() => isAdmin.value && loadShared());
}

onMounted(async () => {
    const im = new Image();
    im.src = props.image.file;
    try {
        await Promise.all([
            im.decode(),
            document.fonts?.load(`800 40px ${FONT}`, '가나다ABC').catch(() => {}),
        ]);
    } catch {
        emit('toast', { message: '그림을 불러오지 못했어요', type: 'error' });
        return emit('close');
    }
    img = im;
    loaded.value = true;
    await nextTick();
    draw();
    textInput.value?.focus();
});

// ── 끌어서 위치 옮기기 ──
const toRatio = (e) => {
    const r = canvas.value.getBoundingClientRect();
    return {
        x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
        y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
};
const onDown = (e) => {
    if (!loaded.value) return;
    if (picking.value) return pickColor(e);
    dragging.value = true;
    canvas.value.setPointerCapture?.(e.pointerId);
    pos.value = toRatio(e);
};
// 원본 그림(글자 없이)에서 누른 곳 주변 3x3 평균색을 배경색으로
const pickColor = (e) => {
    const { x, y } = toRatio(e);
    const W = img.naturalWidth, H = img.naturalHeight;
    const off = document.createElement('canvas');
    off.width = 3; off.height = 3;
    const octx = off.getContext('2d', { willReadFrequently: true });
    octx.drawImage(img, Math.min(W - 3, Math.max(0, Math.round(x * W) - 1)), Math.min(H - 3, Math.max(0, Math.round(y * H) - 1)), 3, 3, 0, 0, 3, 3);
    const d = octx.getImageData(0, 0, 3, 3).data;
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    const hex = (v) => Math.round(v / 9).toString(16).padStart(2, '0');
    bgColor.value = `#${hex(r)}${hex(g)}${hex(b)}`;
    picking.value = false;
};
const onMove = (e) => { if (dragging.value) pos.value = toRatio(e); };
const onUp = () => { dragging.value = false; };

// ── 내보내기 ──
const fileName = () => `${props.image.name || 'jjal'}_문구.png`;
const pngBlob = () => new Promise((resolve, reject) =>
    canvas.value.toBlob(b => (b ? resolve(b) : reject(new Error('PNG 만들기 실패'))), 'image/png'));

const copy = async () => {
    try {
        // 클립보드 쓰기는 클릭 순간에 불러야 해서(사파리) PNG 는 Promise 로 넘긴다
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob() })]);
        emit('copied');
        emit('toast', { message: `문구 넣은 "${props.image.name}" 복사됨 — 카톡에서 붙여넣기` });
    } catch {
        const why = window.isSecureContext ? '' : ' (https 주소에서만 복사돼요)';
        emit('toast', { message: `복사에 실패했어요${why} — 「저장」으로 받아 주세요`, type: 'warning' });
    }
};
const save = async () => {
    const blob = await pngBlob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
    emit('toast', { message: `"${fileName()}" 저장` });
};
</script>

<style scoped>
.dim { position: fixed; inset: 0; background: rgba(0, 0, 0, .45); z-index: 45; display: flex; align-items: center; justify-content: center; }
.cap { background: var(--surface); color: var(--text); border-radius: 18px; width: min(860px, calc(100vw - 24px)); max-height: 92vh; overflow: auto; padding: 16px 18px; display: flex; flex-direction: column; gap: 12px; }
.cap button { font: inherit; color: inherit; cursor: pointer; border: 0; background: none; }
.cap-head { display: flex; align-items: center; justify-content: space-between; }
.cap-head h2 { margin: 0; font-size: 19px; }
.cap-body { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); gap: 16px; align-items: start; }
.stage { position: relative; background: #000; border-radius: 12px; display: flex; align-items: center; justify-content: center; min-height: 200px; overflow: hidden; }
.preview { display: block; max-width: 100%; max-height: 60vh; touch-action: none; cursor: grab; }
.preview.dragging { cursor: grabbing; }
.loading { position: absolute; color: #ccc; font-size: 14px; }
.controls { display: flex; flex-direction: column; gap: 12px; }
.text { width: 100%; resize: vertical; min-height: 64px; border: 1.5px solid var(--line); border-radius: 10px; background: var(--bg); color: var(--text); padding: 10px 12px; font: inherit; font-size: 16px; outline: 0; }
.text:focus { border-color: var(--accent); }
.row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.lbl { font-size: 13px; font-weight: 700; width: 32px; flex: 0 0 auto; }
.hint { font-size: 12px; color: var(--sub); }
.seg { display: inline-flex; background: var(--chip); border-radius: 999px; padding: 3px; }
.seg button { height: 30px; padding: 0 12px; border-radius: 999px; font-size: 13px; color: var(--sub) !important; }
.seg button.on { background: var(--surface); color: var(--text) !important; font-weight: 700; box-shadow: 0 1px 3px rgba(0, 0, 0, .12); }
.range { flex: 1; accent-color: var(--accent); }
.sw { width: 28px; height: 28px; border-radius: 50%; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, .25); }
.sw.on { outline: 2px solid var(--accent); outline-offset: 2px; }
.chk { font-size: 13px; display: inline-flex; align-items: center; gap: 4px; margin-left: 4px; cursor: pointer; }
.chk input { accent-color: var(--accent); }
.sw.custom { position: relative; overflow: hidden; background: conic-gradient(red, yellow, lime, aqua, blue, magenta, red); }
.sw.custom input { position: absolute; inset: 0; opacity: 0; width: 100%; height: 100%; cursor: pointer; }
.btn.pick { height: 30px; font-size: 12.5px; }
.btn.pick.on { background: var(--accent) !important; color: var(--on-accent) !important; }
.preview.picking { cursor: crosshair; }
.pick-hint { position: absolute; top: 8px; left: 50%; transform: translateX(-50%); background: rgba(0, 0, 0, .7); color: #fff; font-size: 12.5px; padding: 5px 10px; border-radius: 8px; pointer-events: none; white-space: nowrap; }
.btn { height: 42px; padding: 0 16px; border-radius: 10px; background: var(--chip) !important; font-weight: 600; font-size: 14px; display: inline-flex; align-items: center; justify-content: center; gap: 4px; }
.btn.small { height: 34px; padding: 0 12px; font-size: 13px; }
.btn.primary { background: var(--accent) !important; color: var(--on-accent) !important; }
.btn:disabled { opacity: .45; cursor: default; }
.cap-actions { display: grid; grid-template-columns: 2fr 1fr; gap: 8px; }
.cap-actions.three { grid-template-columns: 2fr 1fr 1.6fr; }
.btn.share { background: var(--accent-soft) !important; }
.shared { border-top: 1px solid var(--line); padding-top: 10px; display: flex; flex-direction: column; gap: 6px; }
.shared-head { display: flex; align-items: center; justify-content: space-between; font-size: 13px; font-weight: 700; }
.shared-head small { color: var(--sub); font-weight: 600; }
.admin-badge { font-size: 11px; background: var(--accent); color: var(--on-accent); padding: 1px 8px; border-radius: 999px; }
.shared-msg { font-size: 12.5px; color: var(--sub); }
.shared-list { display: flex; flex-direction: column; gap: 4px; max-height: 190px; overflow: auto; }
.shared-item { display: flex; align-items: stretch; gap: 4px; }
.shared-item.hidden { opacity: .5; }
.shared-text { flex: 1; min-width: 0; text-align: left; background: var(--chip) !important; border-radius: 8px; padding: 6px 10px; display: flex; flex-direction: column; }
.shared-text:hover { outline: 1.5px solid var(--accent); }
.shared-text .t { font-size: 13.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.shared-text .by { font-size: 11px; color: var(--sub); }
.mini { width: 32px; border-radius: 8px; background: var(--chip) !important; font-size: 14px; }
.login { display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; color: var(--sub); }
.cap-actions .btn { height: 48px; font-size: 15px; }
@media (max-width: 640px) {
    .dim { align-items: flex-end; }
    .cap { width: 100vw; border-radius: 18px 18px 0 0; max-height: 94vh; }
    .cap-body { grid-template-columns: 1fr; }
    .preview { max-height: 42vh; }
    .cap-actions.three { grid-template-columns: 1fr 1fr; }
    .cap-actions.three .share { grid-column: 1 / -1; }
}
</style>
