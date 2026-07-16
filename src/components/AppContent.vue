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
                        <v-chip v-for="t in taxonomy.emotion" :key="'e-' + t.ko" class="ma-1" size="small"
                            :color="selectedEmotion.includes(t.ko) ? 'primary' : undefined"
                            @click="toggleEmotion(t.ko)">{{ t.ko }}</v-chip>
                    </div>
                    <div class="chip-row-label">상황</div>
                    <div class="mb-2">
                        <v-chip v-for="t in taxonomy.situation" :key="'s-' + t.ko" class="ma-1" size="small"
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
                        <div class="image-container">
                            <v-img v-if="img.file" :width="100" :max-width="100" :min-width="100" :max-height="100"
                                aspect-ratio="1" cover :eager="!!img.thumb" :transition="false" class="elevation-3" :src="img.thumb || img.file"
                                @click="copyImageToClipboard(img)"></v-img>
                            <div class="hover-text">{{ img.name }}</div>
                        </div>
                    </template>
                </v-col>
            </v-row>
            <v-row v-else no-gutters>
                <v-col cols="12" class="d-flex align-content-center flex-wrap ga-2 pl-2">
                    <template v-for='img in favImages' :key="img?.file">
                        <div class="image-container" @click="copyImageToClipboard(img)">
                            <v-img v-if="img.file" :width="100" :max-width="100" :min-width="100" :max-height="100"
                                aspect-ratio="1" cover :eager="!!img.thumb" :transition="false" class="elevation-3" :src="img.thumb || img.file"></v-img>
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
                <v-chip v-for="t in taxonomy.emotion" :key="'me-' + t.ko" class="ma-1"
                    :color="selectedEmotion.includes(t.ko) ? 'primary' : undefined"
                    @click="toggleEmotion(t.ko)">{{ t.ko }}</v-chip>
            </div>
            <div class="chip-row-label">상황</div>
            <div class="mb-2">
                <v-chip v-for="t in taxonomy.situation" :key="'ms-' + t.ko" class="ma-1"
                    :color="selectedSituation.includes(t.ko) ? 'primary' : undefined"
                    @click="toggleSituation(t.ko)">{{ t.ko }}</v-chip>
            </div>
            <v-btn block color="primary" class="mt-2" @click="showFilterSheet = false">
                적용 ({{ filteredImages.length }}개)
            </v-btn>
        </v-sheet>
    </v-bottom-sheet>

    <AppSnackbars ref="appSnackbars" />
</template>

<script setup>
import { onMounted, ref, computed, watch } from "vue";
import { useRoute, useRouter } from 'vue-router';
import { useDisplay } from 'vuetify';
import { matchesSearch, matchesFacetFilters } from '@/utils/imageFilter';

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

const route = useRoute();
const router = useRouter();
const searchQuery = ref(route.query.search || null);

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

    search.value = searchQuery.value;
});

watch(searchQuery, (newQuery) => {
    router.replace({
        query: { search: newQuery || undefined }
    });
});

watch(
    () => route.query.search,
    (newSearch) => {
        if (newSearch !== searchQuery.value) {
            searchQuery.value = newSearch || null;
            search.value = searchQuery.value;
        }
    }
);

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
    let filtered = images.value.filter(img =>
        matchesFacetFilters(img, { emotion: selectedEmotion.value, situation: selectedSituation.value })
    );
    if (search.value) {
        filtered = filtered.filter(img => matchesSearch(img, search.value));
    }
    if (excludeGif.value) {
        filtered = filtered.filter(img => img.file.indexOf('gif') == -1);
    }
    return filtered;
})

const activeFilterCount = computed(() => selectedEmotion.value.length + selectedSituation.value.length);

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

.image-container:hover .delete,
.image-container:hover .hover-text {
    opacity: 1;
}
</style>
