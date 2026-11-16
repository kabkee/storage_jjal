<template>
  <div class="tag-editor">
    <v-text-field
      :model-value="modelValue.name"
      :disabled="disabled"
      density="compact"
      hide-details="auto"
      label="이름 (검색됨)"
      @update:model-value="v => patch({ name: v })"
    />

    <div v-for="axis in axes" :key="axis.key" class="mt-3">
      <div class="d-flex align-center text-caption text-medium-emphasis">
        {{ axis.label }}
        <span :class="countClass(modelValue[axis.key].length)" class="ml-1">({{ modelValue[axis.key].length }}개 · 1~2개 권장)</span>
        <v-spacer />
        <v-btn v-if="!disabled" density="compact" size="x-small" variant="text" @click="openAdd(axis.key)">+ 새 {{ axis.label }}</v-btn>
      </div>
      <v-chip-group
        :model-value="modelValue[axis.key]"
        :disabled="disabled"
        column
        multiple
        @update:model-value="v => patch({ [axis.key]: v })"
      >
        <v-chip
          v-for="t in taxonomy[axis.key]"
          :key="t.ko"
          :color="axis.color"
          :title="t.en.join(', ')"
          :value="t.ko"
          filter
          size="small"
          variant="outlined"
        >{{ t.ko }}</v-chip>
      </v-chip-group>
      <div v-if="adding === axis.key" class="d-flex ga-2 align-center">
        <v-text-field v-model="newKo" density="compact" hide-details label="한글 라벨 (예: 응원)" />
        <v-text-field v-model="newEn" density="compact" hide-details label="영어 별칭, 쉼표 구분" />
        <v-btn :loading="savingTax" color="primary" size="small" @click="addTaxonomy(axis.key)">추가</v-btn>
        <v-btn size="small" variant="text" @click="adding = null">취소</v-btn>
      </div>
    </div>

    <v-combobox
      :model-value="tagList"
      :disabled="disabled"
      chips
      class="mt-3"
      closable-chips
      density="compact"
      hide-details="auto"
      hint="쉼표나 Enter 로 추가. 개념마다 한글·English 짝으로 넣어줘 (예: 고양이, Cat)"
      label="검색 태그"
      multiple
      persistent-hint
      @update:model-value="onTagInput"
    />

    <div class="mt-3 pa-2 rounded bg-grey-lighten-4">
      <div class="text-caption text-medium-emphasis">이 짤을 찾을 수 있는지 시험해봐 (실제 사이트 검색과 같은 규칙)</div>
      <v-text-field v-model="probe" class="mt-1" density="compact" hide-details label="검색어" prepend-inner-icon="mdi-magnify" />
      <div v-if="probe" class="mt-1 text-body-2">
        <span v-if="probeHit" class="text-success">✅ «{{ probe }}» 로 검색하면 나와 ({{ probeHit }}에서 찾음)</span>
        <span v-else class="text-error">❌ «{{ probe }}» 로는 안 나와. 태그에 넣어줘</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { includesNormalized } from '@/utils/textNormalize'
import { api, joinTag, splitTag } from './api'

const props = defineProps({
  modelValue: { type: Object, required: true },
  taxonomy: { type: Object, required: true },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'taxonomy-updated'])

const axes = [
  { key: 'emotion', label: '감정', color: 'deep-orange' },
  { key: 'situation', label: '상황', color: 'indigo' },
]

const patch = p => emit('update:modelValue', { ...props.modelValue, ...p })
const countClass = n => (n === 0 || n > 2 ? 'text-error' : '')

const tagList = computed(() => splitTag(props.modelValue.tag))
// 한 칸에 "개, Dog" 처럼 쉼표째 붙여넣어도 나눠서 넣는다.
const onTagInput = list => patch({ tag: joinTag(list.flatMap(v => splitTag(v))) })

const probe = ref('')
// src/utils/imageFilter.js 의 matchesSearch 와 같은 필드를 같은 방식으로 본다(파일 경로는 UUID 라 뺐다).
const probeHit = computed(() => {
  const q = probe.value.trim()
  if (!q) return ''
  const m = props.modelValue
  if (includesNormalized(m.name, q)) return '이름'
  if (includesNormalized(m.tag, q)) return '태그'
  if (m.emotion.some(v => includesNormalized(v, q))) return '감정'
  if (m.situation.some(v => includesNormalized(v, q))) return '상황'
  return ''
})

const adding = ref(null)
const newKo = ref('')
const newEn = ref('')
const savingTax = ref(false)
const openAdd = axis => { adding.value = axis; newKo.value = ''; newEn.value = '' }
async function addTaxonomy (axis) {
  savingTax.value = true
  try {
    const { taxonomy } = await api.addTaxonomy(axis, newKo.value, splitTag(newEn.value))
    emit('taxonomy-updated', taxonomy)
    patch({ [axis]: [...props.modelValue[axis], newKo.value.trim()] })
    adding.value = null
  } catch (e) {
    alertError(e)
  } finally {
    savingTax.value = false
  }
}
// 화면 위 스낵바로 보여준다 (AdminPage 가 window 이벤트를 받는다).
const alertError = e => window.dispatchEvent(new CustomEvent('admin-toast', { detail: { text: e.message, color: 'error' } }))
</script>
