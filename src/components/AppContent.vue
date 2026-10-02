<template>
    <v-row no-gutters>
        <v-col cols="12">
            <v-row no-gutters justify="center">
                <v-col :cols="isMobileCustom ? 12 : 5">
                    <v-sheet class="ma-2 pa-2 elevation-0">
                        <div class="d-flex ga-2">
                            <v-text-field v-model='search' align-self="center" hide-details="auto" label="검색"
                                class="flex-grow-1">
                                <template v-slot:append>
                                    <v-icon color="gray">mdi-magnify</v-icon>
                                    <v-icon class="ml-2 share-toggle" :color="selectMode ? 'primary' : 'gray'"
                                        role="button" tabindex="0" :aria-label="selectMode ? '선택 끝' : '골라서 공유'"
                                        :title="selectMode ? '선택 끝' : '골라서 공유'"
                                        @click="toggleSelectMode()" @keydown.enter="toggleSelectMode()">mdi-share-variant</v-icon>
                                </template>
                            </v-text-field>
                            <v-btn v-if="isMobileCustom" variant="outlined" @click="showFilterSheet = true">
                                필터
                                <v-badge v-if="activeFilterCount > 0" :content="activeFilterCount" color="primary"
                                    inline></v-badge>
                            </v-btn>
                        </div>
                    </v-sheet>
                </v-col>
            </v-row>

            <!-- PC: 감정/상황 칩바, 아코디언 없이 항상 펼침 -->
            <v-row v-if="!isMobileCustom && !isShowFav" no-gutters class="px-2">
                <v-col cols="12">
                    <div class="chip-row-label">감정</div>
                    <div class="mb-1">
                        <v-chip class="ma-1" size="small" :color="activeFilterCount === 0 ? 'primary' : undefined"
                            @click="clearFilters()">전체</v-chip>
                        <v-chip v-for="t in visibleEmotionTags" :key="'e-' + t.ko" class="ma-1" size="small"
                            :color="selectedEmotion.includes(t.ko) ? 'primary' : undefined"
                            @click="toggleEmotion(t.ko)">{{ t.ko }}</v-chip>
                    </div>
                    <div class="chip-row-label">상황</div>
                    <div class="mb-2">
                        <v-chip v-for="t in visibleSituationTags" :key="'s-' + t.ko" class="ma-1" size="small"
                            :color="selectedSituation.includes(t.ko) ? 'primary' : undefined"
                            @click="toggleSituation(t.ko)">{{ t.ko }}</v-chip>
                    </div>
                </v-col>
            </v-row>

            <!-- 전체/최근 전환 (PC+모바일) -->
            <div class="pa-2">
                <v-slide-group show-arrows>
                    <v-slide-group-item v-slot="{ toggle }">
                        <v-chip class="ma-1" :color="!isShowFav ? 'primary' : undefined"
                            @click="isShowFav = false; toggle()">
                            <v-icon start icon="mdi-home"></v-icon>전체
                        </v-chip>
                    </v-slide-group-item>
                    <v-slide-group-item v-slot="{ toggle }">
                        <v-chip class="ma-1" :color="isShowFav ? 'primary' : undefined" @click="isShowFav = true; toggle()">
                            <v-icon start icon="mdi-star"></v-icon>최근
                        </v-chip>
                    </v-slide-group-item>
                </v-slide-group>
            </div>

            <v-row v-if='!isShowFav' no-gutters>
                <v-alert v-if="sharedIds.length" type="info" variant="tonal" density="compact" class="mx-2 mb-2 w-100"
                    icon="mdi-gift-outline">
                    <div class="d-flex align-center justify-space-between flex-wrap ga-2">
                        <span>공유된 짤 <b>{{ sharedIds.length }}</b>개를 보고 있어요</span>
                        <v-btn size="small" variant="outlined" @click="clearShared()">전체 보기</v-btn>
                    </div>
                </v-alert>
                <div class="d-flex align-center justify-space-between w-100 pr-4">
                    <div class="mr-4 pl-2">
                        총 <span style="font-weight: bold; color: red;">{{ filteredImages.length }}</span>개 짤
                    </div>
                    <div class="d-flex align-center">
                        <v-switch v-model="excludeGif" hide-details inset color="primary" class="mr-2" />
                        <span>GIF 제외</span>
                    </div>
                </div>
                <v-col cols="12" class="d-flex align-content-center flex-wrap ga-2 pl-2">
                    <template v-for='img in filteredImages' :key="img?.file">
                        <div class="image-container" :class="{ 'is-selected': selectMode && selectedIds.includes(img.id) }"
                            :data-file="img.file">
                            <v-img v-if="img.file" :width="100" :max-width="100" :min-width="100" :max-height="100"
                                aspect-ratio="1" cover :eager="!!img.thumb" :transition="false" class="elevation-3" :src="img.thumb || img.file"
                                @click="onImageClick(img)"></v-img>
                            <div v-if="selectMode" class="select-mark">
                                <v-icon size="18" :icon="selectedIds.includes(img.id) ? 'mdi-check-circle' : 'mdi-checkbox-blank-circle-outline'"></v-icon>
                            </div>
                            <div v-if="img.file.indexOf('gif') !== -1" class="gif-badge">GIF</div>
                            <div class="hover-text">{{ img.name }}</div>
                        </div>
                    </template>
                </v-col>
            </v-row>
            <v-row v-else no-gutters>
                <v-col cols="12" class="d-flex align-content-center flex-wrap ga-2 pl-2">
                    <template v-for='img in favImages' :key="img?.file">
                        <div class="image-container" :data-file="img.file" @click="copyImageToClipboard(img)">
                            <v-img v-if="img.file" :width="100" :max-width="100" :min-width="100" :max-height="100"
                                aspect-ratio="1" cover :eager="!!img.thumb" :transition="false" class="elevation-3" :src="img.thumb || img.file"></v-img>
                            <div v-if="img.file.indexOf('gif') !== -1" class="gif-badge">GIF</div>
                            <div class="hover-text">{{ img.name }}</div>
                            <div class="delete" @click="deleteFromFav($event, img)">X</div>
                        </div>
                    </template>
                </v-col>
            </v-row>
        </v-col>
    </v-row>

    <v-bottom-sheet v-model="showFilterSheet">
        <v-sheet class="pa-4" style="max-height: 70vh; overflow-y: auto;">
            <div class="d-flex justify-space-between align-center mb-2">
                <h3>필터</h3>
                <v-btn variant="text" @click="clearFilters()">초기화</v-btn>
            </div>
            <div class="chip-row-label">감정</div>
            <div class="mb-2">
                <v-chip v-for="t in visibleEmotionTags" :key="'me-' + t.ko" class="ma-1"
                    :color="selectedEmotion.includes(t.ko) ? 'primary' : undefined"
                    @click="toggleEmotion(t.ko)">{{ t.ko }}</v-chip>
            </div>
            <div class="chip-row-label">상황</div>
            <div class="mb-2">
                <v-chip v-for="t in visibleSituationTags" :key="'ms-' + t.ko" class="ma-1"
                    :color="selectedSituation.includes(t.ko) ? 'primary' : undefined"
                    @click="toggleSituation(t.ko)">{{ t.ko }}</v-chip>
            </div>
            <v-btn block color="primary" class="mt-2" @click="showFilterSheet = false">
                적용 ({{ filteredImages.length }}개)
            </v-btn>
        </v-sheet>
    </v-bottom-sheet>

    <div v-if="selectMode" class="select-bar elevation-8">
        <div class="d-flex align-center flex-wrap ga-2 justify-center">
            <span class="text-no-wrap mr-2"><b>{{ selectedIds.length }}</b>개 선택</span>
            <div class="d-flex align-center ga-1">
                <span class="text-caption text-no-wrap">최근 추가</span>
                <input v-model.number="recentCount" type="number" min="1" max="50" class="recent-count" />
                <span class="text-caption">개</span>
                <v-btn size="small" variant="tonal" @click="selectRecent()">선택</v-btn>
            </div>
            <v-btn size="small" variant="text" :disabled="!selectedIds.length" @click="selectedIds = []">선택 해제</v-btn>
            <v-btn size="small" color="primary" :disabled="!selectedIds.length" @click="copyShareLink()">
                <v-icon start icon="mdi-link-variant"></v-icon>링크 복사
            </v-btn>
            <v-btn size="small" variant="text" icon="mdi-close" aria-label="선택 끝" @click="exitSelectMode()"></v-btn>
        </div>
    </div>

    <AppSnackbars ref="appSnackbars" />
</template>

<script setup>
import { onMounted, ref, computed, watch } from "vue";
import { useRoute, useRouter } from 'vue-router';
import { useDisplay } from 'vuetify';
import { matchesSearch, matchesFacetFilters } from '@/utils/imageFilter';
import { parseFilterQuery, buildFilterQuery, recentIds, orderByIds } from '@/utils/urlState';

const { width } = useDisplay();
const isMobileCustom = computed(() => width.value <= 1024);

const search = ref(null);
const images = ref([]);
const taxonomy = ref({ emotion: [], situation: [] });
const selectedEmotion = ref([]);
const selectedSituation = ref([]);
const favImageIdxs = ref([]);
const isShowFav = ref(false);
const appSnackbars = ref(null);
const excludeGif = ref(null);
const showFilterSheet = ref(false);
// 공유 링크(/?ids=...)로 들어왔을 때 보여줄 짤 id 목록 (URL과 동기화)
const sharedIds = ref([]);
// 골라서 공유: 선택 모드에선 짤 클릭이 복사 대신 선택이 된다
const selectMode = ref(false);
const selectedIds = ref([]);
const recentCount = ref(3);

const route = useRoute();
const router = useRouter();
// 데이터/taxonomy 로딩 전에는 URL을 덮어쓰지 않도록 막는 플래그
const urlSyncReady = ref(false);

const withLeadingSlash = (p) => (p && !p.startsWith('/') && !p.startsWith('http')) ? `/${p}` : p;

onMounted(async () => {
    const response = await fetch("/assets/data/data.json?v=" + new Date().getTime());
    const file = await response.json();

    images.value = file.map(img => ({
        ...img,
        file: withLeadingSlash(img.file),
        thumb: withLeadingSlash(img.thumb)
    }));

    const taxonomyResponse = await fetch("/assets/data/taxonomy.json?v=" + new Date().getTime());
    taxonomy.value = await taxonomyResponse.json();

    const favImageIdxsText = localStorage.getItem('favImageIdxs');
    favImageIdxs.value = favImageIdxsText ? favImageIdxsText?.split(',') : favImageIdxs.value;

    // 즐겨찾기 데이터 마이그레이션 및 유효성 검사
    if (favImageIdxs.value && Array.isArray(favImageIdxs.value) && favImageIdxs.value.length > 0) {
        const idToFile = {};
        const nameToFile = {};
        const fileSet = new Set();
        file.forEach(it => {
            if (it.file) fileSet.add(it.file);
            if (it.id && it.file) idToFile[String(it.id)] = it.file;
            if (it.name && it.file) nameToFile[it.name] = it.file;
        });

        const migrated = favImageIdxs.value.map(v => {
            if (fileSet.has(v)) return v;
            if (v.indexOf('/') === -1 && idToFile[v]) return idToFile[v];
            try {
                const filename = v.split('/').pop();
                if (filename) {
                    const name = filename.substring(0, filename.lastIndexOf('.'));
                    if (name && nameToFile[name]) {
                        return nameToFile[name];
                    }
                }
            } catch (e) {
                // ignore
            }
            return null;
        }).filter(Boolean);

        if (migrated.length !== favImageIdxs.value.length || migrated.some((v, i) => v !== favImageIdxs.value[i])) {
            favImageIdxs.value = migrated;
            localStorage.setItem('favImageIdxs', favImageIdxs.value.join(','));
            console.log('즐겨찾기 목록이 최신 파일 경로 기준으로 갱신되었습니다.');
        }
    }

    const stored = localStorage.getItem('excludeGif');
    excludeGif.value = stored ? stored === '1' : false;

    applyFilterQuery(route.query, { initial: true });
    urlSyncReady.value = true;
});

// URL(/?search=카드&emotion=웃김,황당&situation=한턱/쏘기&nogif=1) -> 화면 상태
// initial: 첫 진입 때만 nogif가 없으면 저장된(localStorage) GIF 설정을 유지한다.
// 그 이후엔 상태가 항상 URL에 반영돼 있으므로 nogif가 없으면 꺼진 것이다 (뒤로가기 대응).
const applyFilterQuery = (query, { initial = false } = {}) => {
    const parsed = parseFilterQuery(query, taxonomy.value);
    search.value = parsed.search;
    selectedEmotion.value = parsed.emotion;
    selectedSituation.value = parsed.situation;
    if (parsed.excludeGif !== null) excludeGif.value = parsed.excludeGif;
    else if (!initial) excludeGif.value = false;
    sharedIds.value = parsed.ids;
    if (parsed.ids.length) isShowFav.value = false;
};

const currentFilterQuery = () => buildFilterQuery({
    search: search.value,
    emotion: selectedEmotion.value,
    situation: selectedSituation.value,
    excludeGif: excludeGif.value,
    ids: sharedIds.value
});

const sameQuery = (a, b) => {
    const norm = q => JSON.stringify(Object.keys(q).sort().map(k => [k, String(q[k]).normalize('NFC')]));
    return norm(a) === norm(b);
};

// 화면 상태 -> URL (검색어 입력/칩 클릭/GIF 스위치 모두 반영, 히스토리는 쌓지 않음)
watch([search, selectedEmotion, selectedSituation, excludeGif, sharedIds], () => {
    if (!urlSyncReady.value) return;
    const query = currentFilterQuery();
    if (!sameQuery(query, route.query)) router.replace({ query });
});

// 주소창 직접 수정/뒤로가기 -> 화면 상태
watch(() => route.query, (query) => {
    if (!urlSyncReady.value || sameQuery(currentFilterQuery(), query)) return;
    applyFilterQuery(query);
});

watch(favImageIdxs, (newValue) => {
    newValue && Array.isArray(newValue) && localStorage.setItem('favImageIdxs', newValue.join(','));
})
watch(excludeGif, (newValue) => {
    localStorage.setItem('excludeGif', newValue ? '1' : '0');
})

const favImages = computed(() => {
    let filteredFav = images.value.filter(img => {
        return favImageIdxs.value.includes(img.file) ? img : null;
    })
    function sortImagesByFavKeys(imgs, favKeys) {
        return imgs.sort((a, b) => favKeys.indexOf(a.file) - favKeys.indexOf(b.file));
    }
    return sortImagesByFavKeys(filteredFav, favImageIdxs.value);
})

const filteredImages = computed(() => {
    const isShared = sharedIds.value.length > 0;
    // 공유 링크면 고른 순서대로 그 짤만
    const base = isShared ? orderByIds(images.value, sharedIds.value) : images.value;
    let filtered = base.filter(img =>
        matchesFacetFilters(img, { emotion: selectedEmotion.value, situation: selectedSituation.value })
    );
    if (search.value) {
        filtered = filtered.filter(img => matchesSearch(img, search.value));
    }
    // 공유받은 짤은 받는 사람의 'GIF 제외' 설정 때문에 숨겨지지 않게 한다
    if (excludeGif.value && !isShared) {
        filtered = filtered.filter(img => img.file.indexOf('gif') == -1);
    }
    return filtered;
})

const activeFilterCount = computed(() => selectedEmotion.value.length + selectedSituation.value.length);

const emotionCounts = computed(() => {
    const counts = {};
    images.value.forEach(img => {
        (img.emotion || []).forEach(e => { counts[e] = (counts[e] || 0) + 1; });
    });
    return counts;
});
const situationCounts = computed(() => {
    const counts = {};
    images.value.forEach(img => {
        (img.situation || []).forEach(s => { counts[s] = (counts[s] || 0) + 1; });
    });
    return counts;
});
const visibleEmotionTags = computed(() => taxonomy.value.emotion.filter(t => emotionCounts.value[t.ko] > 0));
const visibleSituationTags = computed(() => taxonomy.value.situation.filter(t => situationCounts.value[t.ko] > 0));

const toggleEmotion = (tag) => {
    selectedEmotion.value = selectedEmotion.value.includes(tag)
        ? selectedEmotion.value.filter(t => t !== tag)
        : [...selectedEmotion.value, tag];
};
const toggleSituation = (tag) => {
    selectedSituation.value = selectedSituation.value.includes(tag)
        ? selectedSituation.value.filter(t => t !== tag)
        : [...selectedSituation.value, tag];
};
const clearFilters = () => {
    selectedEmotion.value = [];
    selectedSituation.value = [];
};

const clearShared = () => {
    sharedIds.value = [];
};

const startSelectMode = () => {
    selectMode.value = true;
    isShowFav.value = false;
    // 공유받은 화면에서 시작하면 그 짤들을 미리 골라 둔다 (일부 빼고 다시 공유하기 쉽게)
    selectedIds.value = [...sharedIds.value];
};
const exitSelectMode = () => {
    selectMode.value = false;
    selectedIds.value = [];
};
const toggleSelectMode = () => (selectMode.value ? exitSelectMode() : startSelectMode());
const onImageClick = (img) => {
    if (!selectMode.value) return copyImageToClipboard(img);
    selectedIds.value = selectedIds.value.includes(img.id)
        ? selectedIds.value.filter(id => id !== img.id)
        : [...selectedIds.value, img.id];
};
const selectRecent = () => {
    const count = Math.min(Math.max(Number(recentCount.value) || 3, 1), 50);
    selectedIds.value = recentIds(images.value, count);
};
const copyShareLink = async () => {
    // 1개면 그 짤이 미리보기에 뜨는 정적 페이지(/s/<id>.html, 빌드 때 생성), 여러 개면 SPA 링크
    const url = selectedIds.value.length === 1
        ? `${location.origin}/s/${selectedIds.value[0]}.html`
        : `${location.origin}/?ids=${selectedIds.value.join(',')}`;
    try {
        await navigator.clipboard.writeText(url);
        appSnackbars.value.showSnackbar({ message: `짤 ${selectedIds.value.length}개 공유 링크를 복사했어요.` });
    } catch (e) {
        console.error('링크 복사 실패:', e);
        appSnackbars.value.showSnackbar({ message: `복사에 실패했어요. 직접 복사하세요: ${url}`, type: 'warning' });
    }
};

const addFavImage = (imageKey) => {
    const imgIdx = favImageIdxs.value && favImageIdxs.value.length > 0 ? favImageIdxs.value.indexOf(imageKey) : -1;
    if (imgIdx == -1) {
        favImageIdxs.value = [imageKey, ...favImageIdxs.value,];
    } else {
        const newFavIdxs = [...favImageIdxs.value];
        const [item] = newFavIdxs.splice(imgIdx, 1);
        newFavIdxs.unshift(item);
        favImageIdxs.value = [...newFavIdxs];
    }
}
const copyImageToClipboard = async (image) => {
    addFavImage(image.file);

    if (image.file.indexOf('gif') != -1) {
        appSnackbars.value.showSnackbar({
            message: `안내 : "${image.name}" 를 Save As 로 다운 받으세요!!  `, type: 'warning'
        })
        return;
    }

    function setCanvasImage(path, func) {
        const img = new Image
        const c = document.createElement('canvas')
        const ctx = c.getContext('2d')

        img.onload = function () {
            c.width = this.naturalWidth
            c.height = this.naturalHeight
            ctx.drawImage(this, 0, 0)
            c.toBlob(blob => {
                func(blob)
            }, 'image/png')
        }
        img.src = path
    }

    try {
        setCanvasImage(image.file, (imgBlob) => {
            navigator.clipboard.write(
                [new ClipboardItem({ 'image/png': imgBlob })]
            )
                .then(() => {
                    appSnackbars.value.showSnackbar({
                        message: `"${image.name}" 를 클립보드에 복사되었습니다.`
                    })
                })
                .catch((e) => { console.log(e) })
        })
    } catch (error) {
        console.error("이미지를 클립보드에 복사하는 중 오류 발생:", error);
    }
}

const downloadGIF = (image) => {
    const fullUrl = `${window.location.origin}/${image.file}`;
    const a = document.createElement('a');
    a.href = fullUrl;
    a.download = image.file.split('/').pop();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    appSnackbars.value.showSnackbar({
        message: `"${image.name}" 를 다운로드 합니다.`
    })
};

const deleteFromFav = (event, image) => {
    event.stopPropagation();
    favImageIdxs.value = favImageIdxs.value.filter((idx) => idx != image.file)
}
</script>

<style scoped>
.image-container {
    position: relative;
    display: flex;
    overflow: hidden;
}

.chip-row-label {
    font-size: 0.7em;
    color: #888;
    text-transform: uppercase;
    letter-spacing: .04em;
    margin: 4px 0 2px 8px;
}

.hover-text {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background-color: rgba(0, 0, 0, 0.8);
    color: white;
    text-align: center;
    padding: 5px;
    opacity: 0;
    transition: opacity 0.3s ease-in-out;
    font-size: 0.5em;
}

.gif-badge {
    position: absolute;
    top: 3px;
    left: 3px;
    background-color: rgba(0, 0, 0, 0.7);
    color: white;
    font-size: 0.55em;
    font-weight: bold;
    letter-spacing: .03em;
    padding: 1px 4px;
    border-radius: 3px;
    pointer-events: none;
}

.delete {
    position: absolute;
    top: 0;
    right: 0;
    background-color: rgba(255, 0, 0, 0.6);
    color: white;
    text-align: center;
    font-weight: bold;
    opacity: 0;
    transition: opacity 0.3s ease-in-out;
    border-radius: 50%;
    width: 25px;
    height: 25px;
    cursor: pointer;
}

.share-toggle {
    cursor: pointer;
}

.select-mark {
    position: absolute;
    top: 2px;
    right: 2px;
    color: white;
    background-color: rgba(0, 0, 0, 0.45);
    border-radius: 50%;
    line-height: 0;
    pointer-events: none;
}

.image-container.is-selected {
    outline: 3px solid rgb(var(--v-theme-primary));
    outline-offset: -3px;
}

.image-container.is-selected .select-mark {
    color: rgb(var(--v-theme-primary));
    background-color: white;
}

.select-bar {
    position: fixed;
    left: 50%;
    bottom: 16px;
    transform: translateX(-50%);
    z-index: 1000;
    width: max-content;
    max-width: calc(100vw - 32px);
    background: rgb(var(--v-theme-surface));
    border-radius: 12px;
    padding: 10px 16px;
}

.recent-count {
    width: 44px;
    border: 1px solid #ccc;
    border-radius: 4px;
    padding: 2px 4px;
    text-align: center;
}

.image-container:hover .delete,
.image-container:hover .hover-text {
    opacity: 1;
}
</style>
