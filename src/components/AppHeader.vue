
<template>
  
    <v-row no-gutters>
      <v-col
        cols="12"
        sm="12"
      >
        <v-sheet class="ma-2 pa-2 text-center" min-height="150" style="align-content: center;">
            <h1>{{ appTitle }}</h1>
        </v-sheet>
        <div style='display: flex; justify-content: end;'>
            <v-chip v-if='currentRouteName != `/updates`'><router-link to="updates" style="text-decoration: none; color: inherit;">
                업데이트 이력
            </router-link></v-chip>
            <v-chip v-else><router-link to="/" style="text-decoration: none; color: inherit;">
                홈
            </router-link></v-chip>
        </div>
      </v-col>
    </v-row>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { useRoute } from 'vue-router';
const route = useRoute();
const currentRouteName = ref(route.name);
const appTitle = ref(null)

onMounted(async () => {

    const response = await fetch("assets/data/config.json");
    const file = await response.json();

    // 데이터
    appTitle.value = file.name;
    document.title = file.name;
});
</script>
