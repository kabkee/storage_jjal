
<template>
  
    <v-row no-gutters>
      <v-col
        cols="12"
        sm="12"
      >
        <v-sheet class="ma-2 pa-2 text-center" min-height="150" style="align-content: center;">
            <h1>{{ appTitle }}</h1>
        </v-sheet>
      </v-col>
    </v-row>
</template>

<script setup>
import { onMounted, ref } from "vue";

const appTitle = ref(null)

onMounted(async () => {
    const response = await fetch("/assets/data/config.json");
    const file = await response.json();

    // 데이터
    appTitle.value = file.name;
    document.title = file.name;
});
</script>
