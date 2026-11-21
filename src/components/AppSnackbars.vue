<template>
    <!-- 화면 아래 가운데 작은 알림 (디자인 시안의 토스트). 여러 개면 위로 쌓인다 -->
    <div class="toasts" aria-live="polite">
        <TransitionGroup name="toast">
            <div v-for="t in toasts" :key="t.id" class="toast" :class="'toast--' + t.type" @click="remove(t.id)">
                {{ t.message }}
            </div>
        </TransitionGroup>
    </div>
</template>

<script setup>
import { ref } from 'vue';

let nextId = 1;
const toasts = ref([]);
const MAX = 3;

// type: success(기본) | info | warning | error — 경고·오류는 조금 더 오래 보인다
const showSnackbar = ({ message, type = 'success', timeout }) => {
    const id = nextId++;
    toasts.value = [...toasts.value, { id, message, type }].slice(-MAX);
    setTimeout(() => remove(id), timeout ?? (type === 'error' || type === 'warning' ? 4500 : 2600));
};
const remove = (id) => { toasts.value = toasts.value.filter(t => t.id !== id); };

defineExpose({ showSnackbar });
</script>

<style scoped>
.toasts { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 2500; display: flex; flex-direction: column; align-items: center; gap: 8px; pointer-events: none; width: max-content; max-width: calc(100vw - 24px); }
.toast { pointer-events: auto; cursor: pointer; background: var(--text, #191C22); color: var(--bg, #F6F7F9); padding: 10px 16px; border-radius: 10px; font-size: 14px; line-height: 1.45; box-shadow: 0 8px 24px rgba(0, 0, 0, .22); text-align: center; }
.toast--warning { background: #B45309; color: #fff; }
.toast--error { background: #C92A2A; color: #fff; }
.toast-enter-active, .toast-leave-active { transition: opacity .18s, transform .18s; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(8px); }
</style>
