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
                    <canvas ref="canvas" class="preview" :class="{ dragging }" title="끌어서 글자 위치 옮기기"
                        @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp" @pointercancel="onUp"></canvas>
                    <div v-if="!loaded" class="loading">불러오는 중…</div>
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
                        <span class="lbl">색</span>
                        <button v-for="c in COLORS" :key="c" class="sw" :class="{ on: color === c }"
                            :style="{ background: c }" :aria-label="`글자색 ${c}`" @click="color = c"></button>
                        <label class="chk"><input v-model="outline" type="checkbox"> 테두리</label>
                        <label class="chk"><input v-model="band" type="checkbox"> 글자 뒤 띠</label>
                    </div>
                </div>
            </div>

            <div class="cap-actions">
                <button class="btn primary" :disabled="!loaded" @click="copy()">📋 복사하기</button>
                <button class="btn" :disabled="!loaded" @click="save()">⬇ 저장</button>
            </div>
        </div>
    </div>
</template>

<script setup>
import { nextTick, onMounted, ref, watch } from 'vue';

const props = defineProps({ image: { type: Object, required: true } });
const emit = defineEmits(['close', 'toast', 'copied']);

const POSITIONS = [[0.12, '위'], [0.5, '가운데'], [0.88, '아래']];
const COLORS = ['#FFFFFF', '#111111', '#FFE14D', '#FF4D4D'];
const FONT = '"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

const canvas = ref(null);
const textInput = ref(null);
const loaded = ref(false);
const text = ref('');
const pos = ref({ x: 0.5, y: 0.88 });   // 글자 덩어리 가운데 (그림 대비 비율)
const size = ref(9);                     // 글자 높이 = 그림 폭의 size%
const color = ref('#FFFFFF');
const outline = ref(true);
const band = ref(false);
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
    const lines = wrapLines(ctx, t, W * 0.92);
    const lh = px * 1.22;
    const blockH = lh * lines.length;
    // 글자 덩어리가 그림 밖으로 나가지 않게 가운데 위치를 가둔다 (가로는 가장 긴 줄 폭 기준)
    const half = Math.min(W / 2, Math.max(...lines.map(l => ctx.measureText(l).width)) / 2 + px * 0.2);
    const cx = Math.min(Math.max(pos.value.x * W, half), W - half);
    const cy = Math.min(Math.max(pos.value.y * H, blockH / 2 + px * 0.2), H - blockH / 2 - px * 0.2);
    const top = cy - blockH / 2 + lh / 2;

    if (band.value) {
        const bw = Math.min(W, Math.max(...lines.map(l => ctx.measureText(l).width)) + px * 1.2);
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(cx - bw / 2, cy - blockH / 2 - px * 0.15, bw, blockH + px * 0.3);
    }
    lines.forEach((l, i) => {
        const y = top + i * lh;
        if (outline.value) {
            ctx.lineJoin = 'round';
            ctx.miterLimit = 2;
            ctx.lineWidth = Math.max(2, px * 0.16);
            ctx.strokeStyle = color.value === '#111111' ? '#FFFFFF' : '#000000';
            ctx.strokeText(l, cx, y);
        }
        ctx.fillStyle = color.value;
        ctx.fillText(l, cx, y);
    });
};

watch([text, pos, size, color, outline, band], draw, { deep: true });

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
const onDown = (e) => { if (!loaded.value) return; dragging.value = true; canvas.value.setPointerCapture?.(e.pointerId); pos.value = toRatio(e); };
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
.btn { height: 42px; padding: 0 16px; border-radius: 10px; background: var(--chip) !important; font-weight: 600; font-size: 14px; display: inline-flex; align-items: center; justify-content: center; gap: 4px; }
.btn.small { height: 34px; padding: 0 12px; font-size: 13px; }
.btn.primary { background: var(--accent) !important; color: var(--on-accent) !important; }
.btn:disabled { opacity: .45; cursor: default; }
.cap-actions { display: grid; grid-template-columns: 2fr 1fr; gap: 8px; }
.cap-actions .btn { height: 48px; font-size: 15px; }
@media (max-width: 640px) {
    .dim { align-items: flex-end; }
    .cap { width: 100vw; border-radius: 18px 18px 0 0; max-height: 94vh; }
    .cap-body { grid-template-columns: 1fr; }
    .preview { max-height: 42vh; }
}
</style>
