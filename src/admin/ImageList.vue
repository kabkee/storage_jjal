<template>
  <div>
    <div class="d-flex flex-wrap ga-2 align-center">
      <v-text-field
        v-model="search"
        clearable
        density="compact"
        hide-details
        label="검색 (실제 사이트와 같은 규칙)"
        prepend-inner-icon="mdi-magnify"
        style="min-width: 240px; flex: 2"
      />
      <v-select v-model="emotionFilter" :items="taxonomy.emotion.map(t => t.ko)" clearable density="compact" hide-details label="감정" style="min-width: 140px; flex: 1" />
      <v-select v-model="situationFilter" :items="taxonomy.situation.map(t => t.ko)" clearable density="compact" hide-details label="상황" style="min-width: 140px; flex: 1" />
      <v-select v-model="sort" :items="sortItems" density="compact" hide-details label="정렬" style="min-width: 150px; flex: 1" />
      <v-checkbox v-model="onlyWeak" density="compact" hide-details label="태그 부실한 것만" />
    </div>
    <div class="text-body-2 my-2">
      <b>{{ filtered.length }}</b>개 / 전체 {{ images.length }}개
      <span v-if="onlyWeak" class="text-medium-emphasis">· 태그가 4개 미만이거나 감정·상황이 비어 있는 짤</span>
    </div>

    <v-row dense>
      <v-col v-for="img in shown" :key="img.id" cols="6" lg="2" md="3" sm="4">
        <v-card class="h-100" hover @click="openEdit(img)">
          <v-img :src="'/' + (img.thumb || img.file)" aspect-ratio="1" cover />
          <v-card-text class="pa-2">
            <div class="text-caption text-medium-emphasis">#{{ img.id }} · {{ img.type }}<span v-if="img.added"> · {{ img.added }}</span></div>
            <div class="font-weight-bold text-truncate" :title="img.name">{{ img.name }}</div>
            <div class="mt-1">
              <v-chip v-for="e in img.emotion" :key="e" class="mr-1 mb-1" color="deep-orange" size="x-small" variant="outlined">{{ e }}</v-chip>
              <v-chip v-for="s in img.situation" :key="s" class="mr-1 mb-1" color="indigo" size="x-small" variant="outlined">{{ s }}</v-chip>
            </div>
            <div class="text-caption tag-preview" :title="img.tag">{{ img.tag || '(태그 없음)' }}</div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
    <div v-if="shown.length < filtered.length" class="text-center my-4">
      <v-btn variant="tonal" @click="limit += 60">더 보기 ({{ filtered.length - shown.length }}개 남음)</v-btn>
    </div>

    <v-dialog v-model="dialog" max-width="1100" scrollable>
      <v-card v-if="editing">
        <v-card-title class="d-flex align-center">
          #{{ editing.id }} {{ editing.name }}
          <v-spacer />
          <v-btn icon="mdi-close" variant="text" @click="dialog = false" />
        </v-card-title>
        <v-card-text>
          <v-row>
            <v-col cols="12" md="5">
              <v-img :src="'/' + editing.file" class="bg-grey-lighten-3" max-height="420" />
              <div class="text-caption text-medium-emphasis mt-1">{{ editing.file }}</div>
              <v-alert v-if="draft" class="mt-3" density="compact" type="info" variant="tonal">
                <div class="font-weight-bold">AI 초안을 폼에 넣었어 ({{ draft.model }})</div>
                <div class="text-body-2">{{ draft.reason }}</div>
                <div class="text-caption mt-1">마음에 안 들면 «되돌리기»로 원래 값으로 돌아가.</div>
              </v-alert>
              <div class="d-flex ga-2 mt-3 align-center">
                <v-text-field v-model="hint" density="compact" hide-details label="AI에게 줄 메모 (선택)" placeholder="예: 무한도전 박명수" />
                <v-btn :loading="suggesting" prepend-icon="mdi-robot-outline" variant="tonal" @click="suggest">AI 초안</v-btn>
              </div>
            </v-col>
            <v-col cols="12" md="7">
              <TagEditor v-model="form" :taxonomy="taxonomy" @taxonomy-updated="t => emit('taxonomy-updated', t)" />
              <div v-if="changedFields.length" class="mt-3 text-caption">
                바뀐 항목: <b>{{ changedFields.join(', ') }}</b>
              </div>
            </v-col>
          </v-row>
        </v-card-text>
        <v-card-actions>
          <v-btn :disabled="!changedFields.length" @click="reset">되돌리기</v-btn>
          <v-spacer />
          <v-btn @click="dialog = false">닫기</v-btn>
          <v-btn :disabled="!changedFields.length" :loading="saving" color="primary" variant="flat" @click="save">저장</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { matchesSearch } from '@/utils/imageFilter'
import TagEditor from './TagEditor.vue'
import { api, pickFields, splitTag } from './api'

const props = defineProps({
  images: { type: Array, required: true },
  taxonomy: { type: Object, required: true },
})
const emit = defineEmits(['saved', 'taxonomy-updated'])

const search = ref('')
const emotionFilter = ref(null)
const situationFilter = ref(null)
const onlyWeak = ref(false)
const sortItems = [
  { title: '최근 추가 순', value: 'recent' },
  { title: 'id 큰 순', value: 'id-desc' },
  { title: 'id 작은 순', value: 'id-asc' },
  { title: '태그 적은 순', value: 'tag-asc' },
]
const sort = ref('recent')
const limit = ref(60)

const isWeak = img => splitTag(img.tag).length < 4 || !img.emotion?.length || !img.situation?.length

const filtered = computed(() => {
  const list = props.images.filter(img =>
    matchesSearch(img, search.value) &&
    (!emotionFilter.value || img.emotion?.includes(emotionFilter.value)) &&
    (!situationFilter.value || img.situation?.includes(situationFilter.value)) &&
    (!onlyWeak.value || isWeak(img))
  )
  const byId = (a, b) => Number(a.id) - Number(b.id)
  const sorters = {
    recent: (a, b) => (b.added || '').localeCompare(a.added || '') || byId(b, a),
    'id-desc': (a, b) => byId(b, a),
    'id-asc': byId,
    'tag-asc': (a, b) => splitTag(a.tag).length - splitTag(b.tag).length || byId(a, b),
  }
  return list.sort(sorters[sort.value])
})
watch([search, emotionFilter, situationFilter, onlyWeak, sort], () => { limit.value = 60 })
const shown = computed(() => filtered.value.slice(0, limit.value))

const dialog = ref(false)
const editing = ref(null)
const form = ref(pickFields())
const draft = ref(null)
const hint = ref('')
const suggesting = ref(false)
const saving = ref(false)

function openEdit (img) {
  editing.value = img
  form.value = pickFields(img)
  draft.value = null
  hint.value = ''
  dialog.value = true
}
const reset = () => { form.value = pickFields(editing.value); draft.value = null }

const changedFields = computed(() => {
  if (!editing.value) return []
  const orig = pickFields(editing.value)
  const labels = { name: '이름', emotion: '감정', situation: '상황', tag: '태그' }
  return Object.keys(labels).filter(k => JSON.stringify(orig[k]) !== JSON.stringify(form.value[k])).map(k => labels[k])
})

const toast = (text, color = 'success') => window.dispatchEvent(new CustomEvent('admin-toast', { detail: { text, color } }))

async function suggest () {
  suggesting.value = true
  try {
    const res = await api.suggestForImage(editing.value.id, hint.value)
    draft.value = res.draft
    form.value = pickFields(res.draft)
  } catch (e) {
    toast(e.message, 'error')
  } finally {
    suggesting.value = false
  }
}

async function save () {
  saving.value = true
  try {
    const { image } = await api.updateImage(editing.value.id, form.value)
    emit('saved', image)
    editing.value = image
    form.value = pickFields(image)
    draft.value = null
    toast(`#${image.id} 저장했어. 배포하려면 위의 «배포» 버튼을 눌러줘`)
  } catch (e) {
    toast(e.message, 'error')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.tag-preview {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-all;
}
</style>
