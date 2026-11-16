<template>
  <v-container class="my-4" fluid style="max-width: 1400px">
    <div class="d-flex align-center flex-wrap ga-2 mb-2">
      <h1 class="text-h5">짤 관리 <span class="text-caption text-medium-emphasis">(이 컴퓨터의 yarn dev 에서만 열려)</span></h1>
      <v-spacer />
      <v-btn href="/" prepend-icon="mdi-open-in-new" target="_blank" variant="text">사이트 보기</v-btn>
    </div>

    <v-alert v-if="git" :type="pendingCount ? 'warning' : 'success'" class="mb-4" density="compact" variant="tonal">
      <div class="d-flex align-center flex-wrap ga-2">
        <div v-if="pendingCount">
          배포 안 된 변경: 새 짤 <b>{{ git.added.length }}</b>개 · 수정 <b>{{ git.updated.length }}</b>개
          <span v-if="git.taxonomyChanged"> · 분류(taxonomy) 변경</span>
          <span v-if="git.unpushed.length"> · push 안 된 커밋 {{ git.unpushed.length }}개</span>
        </div>
        <div v-else>배포된 상태랑 같아 (브랜치 {{ git.branch }})</div>
        <v-spacer />
        <v-btn :disabled="!pendingCount" color="primary" prepend-icon="mdi-rocket-launch-outline" variant="flat" @click="publishDialog = true">배포</v-btn>
      </div>
    </v-alert>

    <v-tabs v-model="tab" class="mb-4" color="primary">
      <v-tab value="upload"><v-icon icon="mdi-upload" start />올리기</v-tab>
      <v-tab value="list"><v-icon icon="mdi-tag-multiple-outline" start />짤 목록·태그 편집 ({{ images.length }})</v-tab>
    </v-tabs>

    <v-window v-model="tab">
      <v-window-item value="upload">
        <UploadPanel :active="tab === 'upload'" :taxonomy="taxonomy" @committed="onChanged" @taxonomy-updated="t => (taxonomy = t)" />
      </v-window-item>
      <v-window-item value="list">
        <ImageList :images="images" :taxonomy="taxonomy" @saved="onChanged" @taxonomy-updated="t => (taxonomy = t)" />
      </v-window-item>
    </v-window>

    <v-dialog v-model="publishDialog" max-width="720" scrollable>
      <v-card v-if="git">
        <v-card-title>배포할 내용 확인</v-card-title>
        <v-card-text>
          <div v-if="git.added.length" class="mb-3">
            <div class="font-weight-bold">새 짤 {{ git.added.length }}개</div>
            <div v-for="r in git.added" :key="r.id" class="text-body-2">#{{ r.id }} {{ r.name }}</div>
          </div>
          <div v-if="git.updated.length" class="mb-3">
            <div class="font-weight-bold">수정 {{ git.updated.length }}개</div>
            <div v-for="r in git.updated" :key="r.id" class="text-body-2">#{{ r.id }} {{ r.name }} <span class="text-medium-emphasis">({{ r.fields.join(', ') }})</span></div>
          </div>
          <div v-if="git.removed.length" class="mb-3 text-error">
            <div class="font-weight-bold">빠진 짤 {{ git.removed.length }}개</div>
            <div v-for="r in git.removed" :key="r.id" class="text-body-2">#{{ r.id }} {{ r.name }}</div>
          </div>
          <div v-if="git.taxonomyChanged" class="mb-3">분류 목록(taxonomy.json)이 바뀌었어</div>
          <div v-if="git.unpushed.length" class="mb-3">
            <div class="font-weight-bold">같이 push 될 기존 커밋 {{ git.unpushed.length }}개</div>
            <div v-for="c in git.unpushed" :key="c" class="text-caption"><code>{{ c }}</code></div>
          </div>
          <v-alert v-if="git.branch !== git.deployBranch" density="compact" type="error" variant="tonal">
            지금 브랜치가 {{ git.branch }} 라서 push 는 못 해. 배포는 {{ git.deployBranch }} 에서만 돼.
          </v-alert>
          <div class="text-caption text-medium-emphasis mt-2">
            커밋에는 짤 데이터(이미지·썸네일·sources/*.json·taxonomy.json)만 들어가. «커밋하고 배포»는 <code>git push origin {{ git.deployBranch }}</code> 까지 해서 Amplify 가 바로 다시 배포해.
          </div>
        </v-card-text>
        <v-card-actions>
          <v-btn @click="publishDialog = false">취소</v-btn>
          <v-spacer />
          <v-btn :loading="publishing === 'commit'" variant="tonal" @click="publish(false)">커밋만</v-btn>
          <v-btn :disabled="git.branch !== git.deployBranch" :loading="publishing === 'push'" color="primary" variant="flat" @click="publish(true)">커밋하고 배포</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snack.show" :color="snack.color" :timeout="snack.color === 'error' ? 8000 : 3500" location="bottom right" multi-line>
      <span style="white-space: pre-line">{{ snack.text }}</span>
    </v-snackbar>
  </v-container>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import ImageList from './ImageList.vue'
import UploadPanel from './UploadPanel.vue'
import { api } from './api'

const tab = ref('upload')
const images = ref([])
const taxonomy = ref({ emotion: [], situation: [] })
const git = ref(null)
const publishDialog = ref(false)
const publishing = ref(null)
const snack = reactive({ show: false, text: '', color: 'success' })

const pendingCount = computed(() => git.value
  ? git.value.added.length + git.value.updated.length + git.value.removed.length + (git.value.taxonomyChanged ? 1 : 0) + git.value.unpushed.length
  : 0)

const toast = (text, color = 'success') => Object.assign(snack, { show: true, text, color })
const onToast = e => toast(e.detail.text, e.detail.color)

async function load () {
  const data = await api.images()
  images.value = data.images
  taxonomy.value = data.taxonomy
}
async function loadGit () {
  try {
    git.value = await api.gitStatus()
  } catch (e) {
    toast(e.message, 'error')
  }
}
async function onChanged () {
  await Promise.all([load(), loadGit()])
}

async function publish (push) {
  publishing.value = push ? 'push' : 'commit'
  try {
    const res = await api.publish(push)
    git.value = res.status
    publishDialog.value = false
    const parts = []
    if (res.committed) parts.push(`커밋 ${res.committed.sha}: ${res.committed.message}`)
    if (res.pushed) parts.push('push 했어. Amplify 배포는 보통 몇 분 걸려')
    toast(parts.join('\n') || '커밋할 변경이 없었어')
  } catch (e) {
    toast(e.message, 'error')
  } finally {
    publishing.value = null
  }
}

onMounted(() => {
  document.title = '짤 관리 (로컬)'
  window.addEventListener('admin-toast', onToast)
  onChanged().catch(e => toast(e.message, 'error'))
})
onBeforeUnmount(() => window.removeEventListener('admin-toast', onToast))
</script>
