<template>
    <!-- 📝 문구 관리 (관리자): 모두가 남긴 문구를 최신순으로 보고 숨기기·다시 보이기·삭제 -->
    <div class="dim" @click.self="emit('close')">
        <div class="adm" role="dialog" aria-modal="true" aria-label="문구 관리">
            <div class="adm-head">
                <h2>📝 문구 관리</h2>
                <button class="btn small" @click="emit('close')">닫기</button>
            </div>
            <div class="adm-bar">
                <div class="seg">
                    <button v-for="[v, l] in FILTERS" :key="v" :class="{ on: filter === v }" @click="filter = v">{{ l }}</button>
                </div>
                <!-- 한글 조합 중에도 바로 걸러지게 :value + @input -->
                <input class="q" :value="q" placeholder="문구·이름 검색" @input="q = $event.target.value">
                <button class="btn small" :disabled="loading" @click="load()">↻</button>
            </div>
            <div class="adm-sum">
                전체 {{ items.length }}개 · 숨김 {{ items.filter(c => c.hidden).length }}개 · 지금 목록 {{ shown.length }}개
            </div>

            <div v-if="error" class="msg">{{ error }}</div>
            <div v-else-if="loading" class="msg">불러오는 중…</div>
            <div v-else-if="!shown.length" class="msg">해당하는 문구가 없어요</div>
            <div v-else class="adm-list">
                <div v-for="c in shown" :key="c.id" class="row" :class="{ hidden: c.hidden }">
                    <img v-if="thumbOf(c.image)" :src="thumbOf(c.image)" alt="" class="th" loading="lazy">
                    <div v-else class="th none">#{{ c.image }}</div>
                    <div class="body">
                        <div class="t">{{ c.text }}</div>
                        <div class="meta">
                            #{{ c.image }} {{ nameOf(c.image) }} · {{ c.name }} · {{ when(c.at) }}
                            <span v-if="c.hidden" class="tag">숨김</span>
                        </div>
                    </div>
                    <div class="acts">
                        <button class="btn small" @click="toggle(c)">{{ c.hidden ? '👁 보이기' : '🙈 숨기기' }}</button>
                        <button class="btn small danger" @click="remove(c)">🗑 삭제</button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { listAllCaptions, setCaptionHidden, deleteCaption } from '@/utils/captionsApi';

const props = defineProps({ images: { type: Array, default: () => [] } });
const emit = defineEmits(['close', 'toast']);

const FILTERS = [['all', '전체'], ['visible', '보이는 것'], ['hidden', '숨김']];
const items = ref([]);
const loading = ref(false);
const error = ref('');
const filter = ref('all');
const q = ref('');

const byId = computed(() => new Map(props.images.map(i => [String(i.id), i])));
const thumbOf = (id) => { const i = byId.value.get(String(id)); return i ? (i.thumb || i.file) : ''; };
const nameOf = (id) => byId.value.get(String(id))?.name || '(지워진 짤)';

const when = (iso) => new Date(iso).toLocaleString('sv-SE').slice(0, 16);   // 이 컴퓨터 시간대(한국) 기준 YYYY-MM-DD HH:MM
const shown = computed(() => {
    const k = q.value.trim().normalize('NFC').toLowerCase();
    return items.value.filter(c =>
        (filter.value === 'all' || (filter.value === 'hidden') === !!c.hidden) &&
        (!k || `${c.text} ${c.name} ${nameOf(c.image)}`.toLowerCase().includes(k)));
});

const load = async () => {
    loading.value = true;
    error.value = '';
    try { items.value = (await listAllCaptions()).captions; }
    catch (e) { error.value = `불러오지 못했어요 (${e.message})`; }
    finally { loading.value = false; }
};
const toggle = async (c) => {
    try { c.hidden = (await setCaptionHidden(c.id, !c.hidden)).hidden; }
    catch (e) { emit('toast', { message: e.message, type: 'error' }); }
};
const remove = async (c) => {
    if (!confirm(`「${c.text}」 문구를 지울까요? (되돌릴 수 없어요)`)) return;
    try { await deleteCaption(c.id); items.value = items.value.filter(x => x.id !== c.id); }
    catch (e) { emit('toast', { message: e.message, type: 'error' }); }
};
onMounted(load);
</script>

<style scoped>
.dim { position: fixed; inset: 0; background: rgba(0, 0, 0, .45); z-index: 45; display: flex; align-items: center; justify-content: center; }
.adm { background: var(--surface); color: var(--text); border-radius: 18px; width: min(820px, calc(100vw - 24px)); max-height: 90vh; display: flex; flex-direction: column; gap: 10px; padding: 16px 18px; }
.adm button { font: inherit; color: inherit; cursor: pointer; border: 0; background: none; }
.adm-head { display: flex; align-items: center; justify-content: space-between; }
.adm-head h2 { margin: 0; font-size: 19px; }
.adm-bar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.q { flex: 1; min-width: 140px; height: 34px; border: 1.5px solid var(--line); border-radius: 10px; background: var(--bg); color: var(--text); padding: 0 10px; font: inherit; outline: 0; }
.q:focus { border-color: var(--accent); }
.adm-sum, .msg { font-size: 12.5px; color: var(--sub); }
.adm-list { overflow: auto; display: flex; flex-direction: column; gap: 6px; }
.row { display: flex; gap: 10px; align-items: center; padding: 6px; border-radius: 10px; background: var(--bg); }
.row.hidden { opacity: .55; }
.th { width: 56px; height: 56px; border-radius: 8px; object-fit: cover; flex: 0 0 56px; background: var(--chip); }
.th.none { display: flex; align-items: center; justify-content: center; font-size: 11px; color: var(--sub); }
.body { flex: 1; min-width: 0; }
.t { font-weight: 700; font-size: 14px; white-space: pre-wrap; word-break: break-all; }
.meta { font-size: 11.5px; color: var(--sub); margin-top: 2px; }
.tag { background: var(--chip); padding: 0 6px; border-radius: 6px; margin-left: 4px; }
.acts { display: flex; flex-direction: column; gap: 4px; }
.seg { display: inline-flex; background: var(--chip); border-radius: 999px; padding: 3px; }
.seg button { height: 28px; padding: 0 12px; border-radius: 999px; font-size: 13px; color: var(--sub) !important; }
.seg button.on { background: var(--surface); color: var(--text) !important; font-weight: 700; box-shadow: 0 1px 3px rgba(0, 0, 0, .12); }
.btn { border-radius: 10px; background: var(--chip) !important; font-weight: 600; display: inline-flex; align-items: center; justify-content: center; gap: 4px; white-space: nowrap; }
.btn.small { height: 30px; padding: 0 10px; font-size: 12.5px; }
.btn.danger { color: #C92A2A !important; }
@media (max-width: 640px) {
    .dim { align-items: flex-end; }
    .adm { width: 100vw; border-radius: 18px 18px 0 0; max-height: 92vh; }
    .acts { flex-direction: row; }
    .row { flex-wrap: wrap; }
}
</style>
