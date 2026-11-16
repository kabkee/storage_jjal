<template>
  <div>
    <div
      :class="{ 'drop-active': dragging }"
      class="drop-zone pa-6 text-center rounded-lg"
      @click="fileInput.click()"
      @dragleave.prevent="dragging = false"
      @dragover.prevent="dragging = true"
      @drop.prevent="onDrop"
    >
      <v-icon icon="mdi-cloud-upload-outline" size="48" />
      <div class="text-h6 mt-2">짤을 여기로 끌어다 놓거나 클릭해서 골라줘</div>
      <div class="text-body-2 text-medium-emphasis">Ctrl+V 로 클립보드 이미지를 바로 붙여넣어도 돼 · gif / jpg / png / webp · 여러 개 한 번에 가능</div>
      <div class="text-caption text-medium-emphasis mt-1">올리면 AI(Claude 구독, <code>claude -p</code>)가 이름·감정·상황·태그 초안을 채워줘. 확인하고 «등록»을 눌러야 저장돼.</div>
      <input ref="fileInput" accept="image/gif,image/jpeg,image/png,image/webp" hidden multiple type="file" @change="onPick">
    </div>

    <div v-if="uploads.length" class="d-flex align-center my-4">
      <div class="text-body-1">대기 중 <b>{{ uploads.length }}</b>개 · 등록 가능 <b>{{ readyCount }}</b>개</div>
      <v-spacer />
      <v-btn :disabled="!readyCount" :loading="committingAll" color="primary" variant="flat" @click="commitAll">준비된 것 모두 등록</v-btn>
    </div>
    <div v-else class="text-center text-medium-emphasis my-8">대기 중인 짤이 없어</div>

    <v-card v-for="u in uploads" :key="u.id" class="mb-4" variant="outlined">
      <v-card-text>
        <v-row>
          <v-col cols="12" md="4">
            <v-img :src="`/__admin/staging/${u.file}`" class="bg-grey-lighten-3" max-height="320" />
            <div class="text-caption text-medium-emphasis mt-1">{{ u.originalName }} · {{ (u.size / 1024).toFixed(0) }}KB</div>
            <v-alert v-if="u.duplicateOf" class="mt-2" density="compact" type="warning" variant="tonal">
              <template v-if="u.duplicateOf.staged">대기열에 같은 파일이 이미 있어 ({{ u.duplicateOf.name }})</template>
              <template v-else>이미 등록된 짤이랑 똑같은 파일이야: #{{ u.duplicateOf.id }} {{ u.duplicateOf.name }}</template>
            </v-alert>
            <v-alert v-if="u.status === 'error'" class="mt-2" density="compact" type="error" variant="tonal">{{ u.error }}</v-alert>
            <v-alert v-else-if="u.status === 'ready' && u.draft?.reason" class="mt-2" density="compact" type="info" variant="tonal">
              <div class="text-caption">AI 판단 근거</div>
              <div class="text-body-2">{{ u.draft.reason }}</div>
            </v-alert>
            <div class="d-flex ga-2 mt-2 align-center">
              <v-text-field v-model="hints[u.id]" :disabled="u.status === 'suggesting'" density="compact" hide-details label="AI에게 줄 메모 (선택)" placeholder="예: 박명수, 무한도전" />
              <v-btn :disabled="u.status === 'suggesting'" size="small" variant="tonal" @click="retry(u)">다시 분석</v-btn>
            </div>
          </v-col>
          <v-col cols="12" md="8">
            <div v-if="u.status === 'suggesting'" class="text-center py-8">
              <v-progress-circular color="primary" indeterminate />
              <div class="mt-2">AI가 짤을 보고 있어… (보통 5~15초)</div>
            </div>
            <template v-else>
              <TagEditor v-model="forms[u.id]" :taxonomy="taxonomy" @taxonomy-updated="t => emit('taxonomy-updated', t)" />
            </template>
          </v-col>
        </v-row>
      </v-card-text>
      <v-card-actions>
        <v-btn :disabled="busy[u.id]" color="error" variant="text" @click="remove(u)">버리기</v-btn>
        <v-spacer />
        <v-btn :disabled="u.status === 'suggesting' || !isValid(forms[u.id])" :loading="busy[u.id]" color="primary" variant="flat" @click="commit(u)">등록</v-btn>
      </v-card-actions>
    </v-card>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import TagEditor from './TagEditor.vue'
import { api, pickFields } from './api'

const props = defineProps({
  taxonomy: { type: Object, required: true },
  active: { type: Boolean, default: true }, // «올리기» 탭이 열려 있을 때만 붙여넣기를 받는다
})
const emit = defineEmits(['committed', 'taxonomy-updated'])

const uploads = ref([])
const forms = reactive({})
const hints = reactive({})
const busy = reactive({})
const dragging = ref(false)
const fileInput = ref(null)
const committingAll = ref(false)

const toast = (text, color = 'success') => window.dispatchEvent(new CustomEvent('admin-toast', { detail: { text, color } }))
const isValid = f => !!f && !!f.name?.trim() && f.emotion.length > 0 && f.situation.length > 0
const readyCount = computed(() => uploads.value.filter(u => u.status !== 'suggesting' && isValid(forms[u.id])).length)

// 서버 상태를 받아 오되, 오빠가 이미 고치고 있는 폼은 덮어쓰지 않는다.
function applyUploads (list) {
  for (const u of list) {
    if (u.status === 'suggesting') { delete forms[u.id]; continue }
    if (!forms[u.id]) forms[u.id] = pickFields(u.draft || { name: u.originalName.replace(/\.[^.]+$/, '') })
  }
  uploads.value = list
}

let timer = null
async function refresh () {
  try {
    applyUploads((await api.uploads()).uploads)
  } catch (e) {
    toast(e.message, 'error')
  }
  clearTimeout(timer)
  if (uploads.value.some(u => u.status === 'suggesting')) timer = setTimeout(refresh, 2000)
}

async function sendFiles (files) {
  const images = [...files].filter(f => /^image\/(gif|jpeg|png|webp)$/.test(f.type))
  if (images.length < files.length) toast('gif / jpg / png / webp 가 아닌 파일은 뺐어', 'warning')
  for (const f of images) {
    try {
      await api.upload(f)
    } catch (e) {
      toast(`${f.name}: ${e.message}`, 'error')
    }
  }
  await refresh()
}

const onPick = e => { sendFiles(e.target.files); e.target.value = '' }
const onDrop = e => { dragging.value = false; sendFiles(e.dataTransfer.files) }
function onPaste (e) {
  if (!props.active) return
  const files = [...(e.clipboardData?.items || [])].filter(i => i.kind === 'file').map(i => i.getAsFile()).filter(Boolean)
  if (!files.length) return
  // 텍스트 입력 중에 붙여넣은 이미지도 업로드로 처리한다(텍스트 붙여넣기는 그대로 둔다).
  e.preventDefault()
  sendFiles(files)
}

async function retry (u) {
  try {
    await api.retryUpload(u.id, hints[u.id] || '')
    delete forms[u.id]
    await refresh()
  } catch (e) {
    toast(e.message, 'error')
  }
}

async function remove (u) {
  busy[u.id] = true
  try {
    await api.removeUpload(u.id)
    delete forms[u.id]
    await refresh()
  } catch (e) {
    toast(e.message, 'error')
  } finally {
    delete busy[u.id]
  }
}

async function commit (u, { quiet = false } = {}) {
  busy[u.id] = true
  try {
    const { image } = await api.commitUpload(u.id, forms[u.id])
    delete forms[u.id]
    emit('committed', image)
    if (!quiet) toast(`#${image.id} «${image.name}» 등록했어. 배포하려면 위의 «배포» 버튼을 눌러줘`)
    return true
  } catch (e) {
    toast(e.message, 'error')
    return false
  } finally {
    delete busy[u.id]
    if (!quiet) await refresh()
  }
}

async function commitAll () {
  committingAll.value = true
  let ok = 0
  // id 를 순서대로 채번해야 해서 한 장씩 차례로 등록한다.
  for (const u of uploads.value.filter(x => x.status !== 'suggesting' && isValid(forms[x.id]))) {
    if (await commit(u, { quiet: true })) ok++
  }
  committingAll.value = false
  toast(`${ok}개 등록했어`)
  await refresh()
}

onMounted(() => { refresh(); window.addEventListener('paste', onPaste) })
onBeforeUnmount(() => { clearTimeout(timer); window.removeEventListener('paste', onPaste) })
</script>

<style scoped>
.drop-zone {
  border: 2px dashed rgba(0, 0, 0, 0.25);
  cursor: pointer;
  transition: background 0.15s;
}
.drop-zone:hover,
.drop-active {
  background: rgba(33, 150, 243, 0.08);
  border-color: rgb(33, 150, 243);
}
</style>
