<template>
    <div>
        <!-- 버튼을 클릭할 때마다 새로운 snackbar 추가 -->


        <!-- 여러 개의 Snackbars를 배열로 관리하여 동시에 표시 -->
        <v-snackbar v-for="(snackbar) in snackbars" :key="snackbar.id" v-model="snackbar.show"
            :timeout="snackbar.timeout" :color="snackbar.color" :style="{ bottom: `${snackbar.position * 65}px` }">
            {{ snackbar.message }}
            <v-btn text @click="snackbar.show = false">Close</v-btn>
        </v-snackbar>
    </div>
</template>

<script setup>
import { ref } from 'vue';

let nextId = 1;  // A unique ID for each snackbar
const snackbars = ref([]);

const showSnackbar = (message) => {
    // Find the lowest available position
    const usedPositions = snackbars.value.map(snackbar => snackbar.position);
    let availablePosition = 0;
    while (usedPositions.includes(availablePosition)) {
        availablePosition++;
    }

    // Add a new snackbar at the available position
    const id = nextId++;
    snackbars.value.push({
        id,
        message,
        show: true,
        timeout: 3000,
        color: 'success',
        position: availablePosition,
    });

    // Automatically remove snackbar after timeout
    setTimeout(() => {
        removeSnackbar(id);
    }, 3000);
};

const removeSnackbar = (id) => {
    // Find the snackbar by ID and remove it
    snackbars.value = snackbars.value.filter(snackbar => snackbar.id !== id);
};


defineExpose({
    showSnackbar
})
</script>
