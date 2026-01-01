<template>
    <v-row no-gutters>
        <!-- 데스크탑용 사이드바 (1024px 이하에서 숨김) -->
        <v-col v-if="!isMobileCustom" cols="2" class="elevation-1">
            <v-list>
                <v-list-item prepend-icon="mdi-home" title="전체" value='all' @click="setCatFilter()"></v-list-item>
                <v-list-item prepend-icon="mdi-star" title="최근" value='fav' @click="isShowFav = true"></v-list-item>

                <template v-for="cat in cat1" :key='cat'>
                    <v-list-item prepend-icon="mdi-flower" :title="cat" :value='cat'
                        @click="setCatFilter(cat)"></v-list-item>
                </template>
            </v-list>
        </v-col>
        <!-- 메인 컨텐츠 영역 (1024px 이하에서 전체 너비) -->
        <v-col :cols="isMobileCustom ? 12 : 10" class="pl-3">
            <!-- 모바일 전용 카테고리 UI (상단) -->
            <div v-if="isMobileCustom" class="pa-2">
                <v-slide-group show-arrows>
                    <v-slide-group-item v-slot="{ toggle }">
                        <v-chip class="ma-1" :color="(!catFilter && !isShowFav) ? 'primary' : undefined"
                            @click="setCatFilter(); toggle">
                            <v-icon start icon="mdi-home"></v-icon>
                            전체
                        </v-chip>
                    </v-slide-group-item>
                    <v-slide-group-item v-slot="{ toggle }">
                        <v-chip class="ma-1" :color="isShowFav ? 'primary' : undefined"
                            @click="isShowFav = true; toggle">
                            <v-icon start icon="mdi-star"></v-icon>
                            최근
                        </v-chip>
                    </v-slide-group-item>
                    <v-slide-group-item v-for="cat in cat1" :key="cat" v-slot="{ toggle }">
                        <v-chip class="ma-1" :color="(catFilter === cat) ? 'primary' : undefined"
                            @click="setCatFilter(cat); toggle">
                            <v-icon start icon="mdi-flower"></v-icon>
                            {{ cat }}
                        </v-chip>
                    </v-slide-group-item>
                </v-slide-group>
            </div>

            <v-row no-gutters justify="center">
                <v-col :cols="isMobileCustom ? 12 : 5">
                    <v-sheet class="ma-2 pa-2 elevation-0">
                        <v-text-field v-model='search' align-self="center" hide-details="auto" label="검색">
                            <template v-slot:append>
                                <v-icon color="gray">
                                    mdi-magnify
                                </v-icon>
                            </template>
                        </v-text-field>
                    </v-sheet>
                </v-col>
            </v-row>
            <v-row v-if='!isShowFav' no-gutters>
                <div class="d-flex align-center justify-space-between w-100 pr-4">
                    <!-- 왼쪽: 총 개수 -->
                    <div class="mr-4 pl-2">
                        총 <span style="font-weight: bold; color: red;">{{ filteredImages.length }}</span>개 짤
                    </div>

                    <!-- 오른쪽: 스위치 + 텍스트 나란히 (전체 카테고리일 때만 표시) -->
                    <div class="d-flex align-center" v-if="!catFilter">
                        <v-switch v-model="excludeGif" hide-details inset color="primary" class="mr-2" />
                        <span>GIF 제외</span>
                    </div>
                </div>
                <v-col cols="12" class="d-flex align-content-center flex-wrap ga-2 pl-2">
                    <template v-for='img in filteredImages' :key="img?.file">
                        <div class="image-container">
                            <v-img v-if="img.file" :width="100" :max-width="100" :min-width="100" :max-height="100"
                                aspect-ratio="1/1" cover class="elevation-3" :src="img?.file"
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
                                aspect-ratio="1/1" cover class="elevation-3" :src="img?.file"></v-img>
                            <div class="hover-text">{{ img.name }}</div>
                            <div class="delete" @click="deleteFromFav($event, img)">X</div>
                        </div>
                    </template>
                </v-col>
            </v-row>
        </v-col>
    </v-row>

    <AppSnackbars ref="appSnackbars" />
</template>

<script setup>
import { onMounted, ref, computed, watch } from "vue";
import { useRoute, useRouter } from 'vue-router';
import { useDisplay } from 'vuetify';

const { width } = useDisplay();
const isMobileCustom = computed(() => width.value <= 1024);

const category = ref([]);
const search = ref(null);
const catFilter = ref(null);
const images = ref([]);
const favImageIdxs = ref([]);
const isShowFav = ref(false);
const appSnackbars = ref(null);
const excludeGif = ref(null);

const route = useRoute();
const router = useRouter();
const searchQuery = ref(route.query.search || null);

onMounted(async () => {
    const response = await fetch("/assets/data/data.json?v=" + new Date().getTime());
    const file = await response.json();

    // 데이터
    images.value = file.map(img => ({
        ...img,
        file: img.file && !img.file.startsWith('/') && !img.file.startsWith('http') 
            ? `/${img.file}` 
            : img.file
    }));
    // 카테고리
    let catSet = [];
    file.forEach(element => {
        if (!element.category_1) {
            return;
        }
        if (!catSet[element.category_1]) catSet[element.category_1] = []
        if (catSet[element.category_1].indexOf(element.category_2) == -1)
            catSet[element.category_1].push(element.category_2)
    });
    category.value = catSet;

    const favImageIdxsText = localStorage.getItem('favImageIdxs');
    favImageIdxs.value = favImageIdxsText ? favImageIdxsText?.split(',') : favImageIdxs.value;
    
    // 즐겨찾기 데이터 마이그레이션 및 유효성 검사
    if (favImageIdxs.value && Array.isArray(favImageIdxs.value) && favImageIdxs.value.length > 0) {
        // 1. 빠른 조회를 위한 맵 생성 (id -> file, file -> exists, name -> file)
        const idToFile = {};
        const nameToFile = {};
        const fileSet = new Set();
        file.forEach(it => {
            if (it.file) fileSet.add(it.file);
            if (it.id && it.file) idToFile[String(it.id)] = it.file;
            if (it.name && it.file) nameToFile[it.name] = it.file;
        });

        // 2. 마이그레이션 및 필터링 수행
        const migrated = favImageIdxs.value.map(v => {
            // 이미 유효한 파일 경로인 경우 그대로 유지
            if (fileSet.has(v)) return v;
            
            // 유효하지 않은 경우 (한글 경로 등 예전 경로)
            // 1) 숫자 ID인 경우 (기존 로직)
            if (v.indexOf('/') === -1 && idToFile[v]) return idToFile[v];
            
            // 2) 파일 경로에서 이름 추출하여 매칭 시도
            // 예: "assets/png/귀여워1.png" -> "귀여워1"
            try {
                const filename = v.split('/').pop(); // "귀여워1.png"
                if (filename) {
                    const name = filename.substring(0, filename.lastIndexOf('.')); // "귀여워1"
                    if (name && nameToFile[name]) {
                        return nameToFile[name];
                    }
                }
            } catch (e) {
                // ignore
            }
            
            return null; 
        }).filter(Boolean);

        // 변경사항이 있거나 길이가 줄어들었으면 업데이트
        if (migrated.length !== favImageIdxs.value.length || migrated.some((v, i) => v !== favImageIdxs.value[i])) {
             // 3. (추가 보완) 만약 file 경로 매칭에 실패했다면, 혹시 이름(name)으로 찾을 수 있을까?
             // 하지만 이름은 중복될 수 있어 위험함.
             // 일단 유효한 파일만 남깁니다.
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
        query: { search: newQuery || undefined } // Remove 'search' if empty
    });
});

// Watch for changes in the route query and update searchQuery
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
    let filteredImages = images.value.filter(img => {
        return favImageIdxs.value.includes(img.file) ? img : null;
    })
    function sortImagesByFavKeys(images, favKeys) {
        return images.sort((a, b) => {
            return favKeys.indexOf(a.file) - favKeys.indexOf(b.file);
        });
    }
    const sortedImages = sortImagesByFavKeys(filteredImages, favImageIdxs.value);
    return sortedImages;
})
const filteredImages = computed(() => {
    let filtered = images.value;
    if (catFilter.value) {
        filtered = filtered.filter(img => {
            return (img.category_1 && img.category_1.indexOf(catFilter.value) != -1) ||
                (img.category_2 && img.category_2.indexOf(catFilter.value) != -1)
        })
    }
    if (search.value) {
        filtered = filtered.filter(img => {
            if (!img.file) return;
            const fileLower = img.file.toLowerCase();
            const searchLower = search.value.toLowerCase();
            return (img.name && img.name.indexOf(search.value) != -1) ||
                (img.tag && img.tag.indexOf(search.value) != -1) ||
                (img.category_1 && img.category_1.indexOf(search.value) != -1) ||
                (img.category_2 && img.category_2.indexOf(search.value) != -1) ||
                (fileLower && fileLower.indexOf(searchLower) != -1);
        })
    }
    if (excludeGif.value) {
        filtered = filtered.filter(img => {
            return img.file.indexOf('gif') == -1;
        })
    }
    return filtered;
})
const cat1 = computed(() => {
    return Object.keys(category.value);
})

const setCatFilter = (filter) => {
    catFilter.value = filter;
    isShowFav.value = false;
}

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
        // downloadGIF(image);
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
                [
                    new ClipboardItem({ 'image/png': imgBlob })
                ]
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

    const fullUrl = `${window.location.origin}/${image.file}`;  // 전체 URL 생성

    // Create an anchor element
    const a = document.createElement('a');

    // Set the download attribute with the filename
    a.href = fullUrl;
    a.download = image.file.split('/').pop();  // Extract the filename from the URL

    // Append the anchor to the body (necessary for Firefox)
    document.body.appendChild(a);

    // Trigger the download by simulating a click
    a.click();

    // Clean up and remove the anchor element
    document.body.removeChild(a);

    appSnackbars.value.showSnackbar({
        message: `"${image.name}" 를 다운로드 합니다.`
    })
};

const deleteFromFav = (event, image) => {
    // Stop the click event from bubbling up
    event.stopPropagation();

    favImageIdxs.value = favImageIdxs.value.filter((idx) => {
        return idx != image.file
    })
    // Your logic for deleting the image
}
</script>


<style scoped>
.image-container {
    position: relative;
    display: flex;
    overflow: hidden;
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
    /* Initially hidden */
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
    /* Initially hidden */
    transition: opacity 0.3s ease-in-out;
    border-radius: 50%;
    width: 25px;
    height: 25px;
    cursor: pointer;
}

.image-container:hover .delete,
.image-container:hover .hover-text {
    opacity: 1;
    /* Show the text on hover */
}
</style>