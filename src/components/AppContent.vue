<template>
    <v-row no-gutters>
        <v-col cols="2" sm="2" class="elevation-1">
            <v-list>
                <v-list-item prepend-icon="mdi-home" title="전체" value='all' @click="setCatFilter()"></v-list-item>
                <v-list-item prepend-icon="mdi-star" title="최근" value='fav' @click="isShowFav = true"></v-list-item>

                <template v-for="cat in cat1" :key='cat'>
                    <v-list-item prepend-icon="mdi-flower" :title="cat" :value='cat'
                        @click="setCatFilter(cat)"></v-list-item>
                </template>
            </v-list>
        </v-col>
        <v-col cols="10" sm="10" class="pl-3">
            <v-row no-gutters justify="center">
                <v-col cols="5" sm="5">
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
                <v-col cols="12" sm="12" class="d-flex align-content-center flex-wrap ga-2">
                    <template v-for='img in filteredImages' :key="img?.id">
                        <div class="image-container" >
                            <v-img v-if="img.file" :width="100" :max-width="100" :min-width="100" :max-height="100"
                                aspect-ratio="1/1" cover class="elevation-3" :src="img?.file" @click="copyImageToClipboard(img)"></v-img>
                            <div class="hover-text">{{ img.name }}</div>

                        </div>
                    </template>
                </v-col>
            </v-row>
            <v-row v-else no-gutters>
                <v-col cols="12" sm="12" class="d-flex align-content-center flex-wrap ga-2">
                    <template v-for='img in favImages' :key="img?.id">
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

const category = ref([]);
const search = ref(null);
const catFilter = ref(null);
const images = ref([]);
const favImageIdxs = ref([]);
const isShowFav = ref(false);
const appSnackbars = ref(null);



onMounted(async () => {
    const response = await fetch("assets/data/data.json");
    const file = await response.json();

    // 데이터
    images.value = file;
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
});


watch(favImageIdxs, (newValue) => {
    newValue && Array.isArray(newValue) && localStorage.setItem('favImageIdxs', newValue.join(','));
})

const favImages = computed(() => {
    let filteredImages = images.value.filter(img => {
        return favImageIdxs.value.includes(img.id) ? img : null;
    })
    function sortImagesByFavIds(images, favImageIdxs) {
        return images.sort((a, b) => {
            // Compare the index of each image's id in the favImageIdxs array
            return favImageIdxs.indexOf(a.id) - favImageIdxs.indexOf(b.id);
        });
    }
    const sortedImages = sortImagesByFavIds(filteredImages, favImageIdxs.value);
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
            const fileLower = img.file.toLowerCase();
            const searchLower = search.value.toLowerCase();
            return (img.name && img.name.indexOf(search.value) != -1) ||
                (img.tag && img.tag.indexOf(search.value) != -1) ||
                (img.category_1 && img.category_1.indexOf(search.value) != -1) ||
                (img.category_2 && img.category_2.indexOf(search.value) != -1) ||
                (fileLower && fileLower.indexOf(searchLower) != -1);
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

const addFavImage = (imageId) => {
    const imgIdx = favImageIdxs.value && favImageIdxs.value.length > 0 ? favImageIdxs.value.indexOf(imageId) : -1;
    if (imgIdx == -1) {
        favImageIdxs.value = [imageId, ...favImageIdxs.value,];
    } else {
        const newFavIdxs = [...favImageIdxs.value];
        const [item] = newFavIdxs.splice(imgIdx, 1);
        newFavIdxs.unshift(item);
        favImageIdxs.value = [...newFavIdxs];
    }
}
const copyImageToClipboard = async (image) => {

    if (image.file.indexOf('gif') != -1) {
        downloadGIF(image);
        return;
    }
    addFavImage(image.id);

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
                    appSnackbars.value.showSnackbar(`"${image.name}" 를 클립보드에 복사되었습니다.`)
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

    appSnackbars.value.showSnackbar(`"${image.name}" 를 다운로드 합니다.`)
};

const deleteFromFav = (event, image) => {
    // Stop the click event from bubbling up
    event.stopPropagation();

    favImageIdxs.value = favImageIdxs.value.filter((idx)=>{
        return idx != image.id
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