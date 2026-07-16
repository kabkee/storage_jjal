
<template>
  
    <v-row no-gutters>
      <v-col
        cols="12"
        sm="12"
      >
        <v-sheet class="ma-2 pa-4 pa-sm-6 text-center">
            <h1 class="app-title">{{ appTitle }}</h1>
        </v-sheet>
      </v-col>
    </v-row>
</template>

<script setup>
import { onMounted, ref } from "vue";
const appTitle = ref(null)

onMounted(async () => {

    const response = await fetch("assets/data/config.json");
    const file = await response.json();

    // 데이터
    appTitle.value = file.name;
    document.title = file.name;
});
</script>

<style scoped>
.app-title {
    font-size: clamp(1.25rem, 4vw, 2rem);
    margin: 0;
}
</style>
