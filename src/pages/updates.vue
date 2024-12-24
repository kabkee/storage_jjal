
<template>
    <v-container class="elevation-1 my-4">
        <AppHeader />
        <v-timeline align="start">
            <v-timeline-item v-for="(data, i) in sortedUpdates" :key="i" :dot-color="data.color" size="small">
                <template v-slot:opposite>
                    <div :class="`pt-1 headline font-weight-bold text-${data.color}`" v-text="data.date"></div>
                </template>
                <div class='px-4'>
                    <ol>
                        <li v-for="line in data.content" :key="line" class="my-3">{{ line }}</li>
                    </ol>
                </div>
            </v-timeline-item>
        </v-timeline>
    </v-container>
</template>

<script setup>
import { ref, computed } from 'vue';

const updates = ref([
    {
        color: 'cyan',
        date: '2024.09.03',
        content: [
            '프로젝트 처음 시작',
        ]
    },
    {
        color: 'green',
        date: '2024.10.12',
        content: [
            '이미지 클릭 시, 클립보드 복사 기능 추가 & GIF는 파일 다운로드 구현',
            '이미지 파일과 데이터 업데이트, 파일명 기존과 동일하게 한글을 사용하여 검색 가능하도록 변경',
            "썸네일에 제목 표시",
            "'최근' 메뉴 추가하여, 최근에 사용한 이미지 목록 표시"
        ]
    },
    {
        color: 'pink',
        date: '2024.10.13',
        content: [
            '한글 파일명 검색 안되는 버그 수정 (MacOs와 WinOs 한글 표기 차이, Nomalization으로 해결)',
            '이미지 파일과 데이터 업데이트, 파일명 기존과 동일하게 한글을 사용하여 검색 가능하도록 변경',
            "썸네일에 제목 표시",
        ]
    },
    {
        color: 'amber',
        date: '2024.10.15',
        content: [
            '다 아는 사람들이구만 이명박 짤 추가',
            "김?남 친구가 전달해준 9개 짤 추가 : 검색창에 '우남쌩' 검색으로 확인 가능",
            "GIF 파일 다운로드 안되는 버그로 안내문 표기방식으로 변경 (마우스 오른쪽 클릭으로 저장 가능)",
        ]
    },
    {
        color: 'orange',
        date: '2024.10.21',
        content: [
            'GIF 이미지도 클릭으로 최신 사용한 목록에 추가되도록 수정',
        ]
    },
    {
        color: 'cyan',
        date: '2024.11.07',
        content: [
            '그 사람이 바로 나예요 백지영 짤 추가',
        ]
    },
    {
        color: 'green',
        date: '2024.12.07',
        content: [
            '와우, 아아아아아, 등 총 7개 짤 추가',
            '와우, 아아아아아, 애인이되어줄래물론장애인, 어휴저관종또왔네, 와참재밌다짝, 조카크레파스십팔색이야, 호이가계속되면그게둘리인줄알아요',
        ]
    },
]);

const sortedUpdates = computed(() => {
    return [...updates.value].sort((a, b) => new Date(b.date) - new Date(a.date));
});
</script>