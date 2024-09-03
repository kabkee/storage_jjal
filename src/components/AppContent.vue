<template>
    <v-row no-gutters>
        <v-col cols="2" sm="2" class="elevation-1">
            <v-list>
                <v-list-item prepend-icon="mdi-home" title="전체" value='all' @click="setCatFilter()"></v-list-item>

                <template v-for="cat in cat1" :key='cat'>
                    <v-list-item prepend-icon="mdi-flower" :title="cat" :value='cat'
                        @click="setCatFilter(cat)"></v-list-item>
                    <div class="pl-6">
                        <v-list-item v-for='cat2 in category[cat]' :key='cat2' :value='cat2'
                            prepend-icon="mdi-circle-small" :title="cat2" @click="setCatFilter(cat2)"></v-list-item>
                    </div>
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
            <v-row no-gutters>
                <v-col cols="12" sm="12" class="d-flex align-content-center flex-wrap ga-2">
                    <template v-for='img in filteredImages' :key="img?.id">
                        <v-img v-if="img.file" :width="100" :max-width="100" :min-width="100" :max-height="100"
                            aspect-ratio="1/1" cover class="elevation-3" :src="img?.file"></v-img>
                    </template>
                </v-col>

            </v-row>
        </v-col>
    </v-row>
</template>

<script setup>
import { onMounted, ref, computed } from "vue";

const category = ref([]);
const search = ref(null);
const catFilter = ref(null);
const images = ref([]);

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
}

onMounted(async () => {
    const response = await fetch("assets/data/data.json");
    const file = await response.json();
    console.info('file', file)
    // 데이터
    images.value = file;
    // 카테고리
    let catSet = [];
    file.forEach(element => {
        if(!element.category_1){
            return;
        }
        if (!catSet[element.category_1]) catSet[element.category_1] = []
        if (catSet[element.category_1].indexOf(element.category_2) == -1)
            catSet[element.category_1].push(element.category_2)
    });
    category.value = catSet
});



</script>
