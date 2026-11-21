<template>
    <div class="jjal">
        <!-- ── 헤더 (스크롤해도 위에 고정) ── -->
        <header class="hdr">
            <div class="hdr-inner">
                <a class="logo" href="/" @click.prevent="resetAll()">🐾 값기의 <span>짤방</span></a>
                <label class="search">
                    <v-icon size="20" class="search-icon">mdi-magnify</v-icon>
                    <input ref="searchInput" v-model="search" placeholder="어떤 짤 찾아? 축하·퇴근·고양이…"
                        autocomplete="off" enterkeyhint="search" aria-label="짤 검색">
                    <button v-if="search" class="search-clear" title="지우기" aria-label="검색어 지우기"
                        @click.prevent="search = ''; searchInput?.focus()">✕</button>
                    <kbd v-else>/</kbd>
                </label>
                <button class="icon-btn square" :title="isDark ? '라이트 모드로' : '다크 모드로'" aria-label="테마 전환"
                    @click="toggleTheme()">
                    <v-icon size="20">{{ isDark ? 'mdi-white-balance-sunny' : 'mdi-weather-night' }}</v-icon>
                </button>
                <button class="icon-btn square" title="설정" aria-label="설정" @click="settingsOpen = true">
                    <v-icon size="20">mdi-cog-outline</v-icon>
                </button>
                <button class="icon-btn" :class="{ on: selectMode }" :title="selectMode ? '선택 끝' : '여러 짤을 골라 링크로 공유'"
                    @click="toggleSelectMode()">
                    <v-icon size="18">mdi-link-variant</v-icon><span class="label">{{ selectMode ? '선택 끝' : '골라서 공유' }}</span>
                </button>
            </div>
        </header>

        <!-- ── 필터 줄: 감정·상황(펼치기) / 전부·정지·움짤 / 개수 ── -->
        <div class="toolbar">
            <button class="drop" :class="{ has: selectedEmotion.length, open: openAxis === 'emotion' }"
                @click="toggleAxis('emotion')">
                감정<b v-if="selectedEmotion.length"> {{ selectedEmotion.length }}</b>
                <v-icon size="16" class="caret">{{ openAxis === 'emotion' ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
            </button>
            <button class="drop" :class="{ has: selectedSituation.length, open: openAxis === 'situation' }"
                @click="toggleAxis('situation')">
                상황<b v-if="selectedSituation.length"> {{ selectedSituation.length }}</b>
                <v-icon size="16" class="caret">{{ openAxis === 'situation' ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
            </button>
            <!-- 정지 이미지(클릭하면 바로 복사)와 움짤을 나눠 보기. webp 전환 후 확장자로는 구분이 안 돼서 데이터의 animated 를 본다 -->
            <div class="seg" role="group" aria-label="움직임">
                <button v-for="[v, l, t] in MOTION_OPTIONS" :key="v" :class="{ on: motionFilter === v }" :title="t"
                    @click="motionFilter = v">{{ l }}</button>
            </div>
            <div class="spacer"></div>
            <a v-if="showWinHelperLink" href="#" class="helper-link" title="움짤도 클릭 한 번으로 카톡에 보내는 「짤 복사 도우미」(Windows) 설치 안내"
                @click.prevent="openHelperGuide(null)">
                <v-icon size="15">mdi-download</v-icon> 움짤 복사 도우미
            </a>
            <div class="count"><b>{{ filteredImages.length }}</b>개 짤 · 최신순</div>
        </div>

        <div v-if="openAxis" class="panel">
            <div class="panel-inner">
                <button v-for="t in (openAxis === 'emotion' ? visibleEmotionTags : visibleSituationTags)" :key="t.ko"
                    class="chip" :class="{ on: (openAxis === 'emotion' ? selectedEmotion : selectedSituation).includes(t.ko) }"
                    @click="openAxis === 'emotion' ? toggleEmotion(t.ko) : toggleSituation(t.ko)">{{ t.ko }}</button>
            </div>
        </div>

        <div v-if="activeFilterCount" class="active-row">
            <span v-for="v in selectedEmotion" :key="'e-' + v" class="active-chip">{{ v }}
                <button class="x" :aria-label="v + ' 빼기'" @click="toggleEmotion(v)">×</button></span>
            <span v-for="v in selectedSituation" :key="'s-' + v" class="active-chip">{{ v }}
                <button class="x" :aria-label="v + ' 빼기'" @click="toggleSituation(v)">×</button></span>
            <button class="link" @click="clearFilters()">모두 지우기</button>
        </div>

        <div v-if="sharedIds.length" class="shared-banner">
            <v-icon size="20">mdi-gift-outline</v-icon>
            <span>공유된 짤 <b>{{ sharedIds.length }}</b>개를 보고 있어요</span>
            <div class="spacer"></div>
            <button class="btn small" @click="clearShared()">전체 보기</button>
        </div>

        <!-- ── 최근 쓴 짤 (검색·필터가 없을 때만) ── -->
        <section v-if="showRecent" class="section">
            <h3 class="section-title"><v-icon size="16">mdi-history</v-icon> 최근 쓴 짤</h3>
            <div class="strip">
                <div v-for="img in favImages" :key="'r-' + img.file" class="card image-container" :data-file="img.file"
                    @pointerenter="onThumbEnter($event, img)" @pointerleave="onThumbLeave($event, img)"
                    @dragstart="onThumbDragStart($event, img)" @dragend="onThumbDragEnd($event, img)">
                    <div class="thumb" :title="img.name" @click="onImageClick(img, 'r')">
                        <img :src="img.thumb || img.file" :alt="img.name" loading="lazy">
                        <span v-if="isAnimated(img)" class="badge mini">▶</span>
                        <div v-if="copiedKey === img.id + 'r'" class="copied"><span class="check">✓</span></div>
                    </div>
                </div>
            </div>
        </section>

        <!-- ── 짤 목록 ── -->
        <section class="section">
            <h3 v-if="showRecent" class="section-title">전체 짤</h3>
            <div v-if="filteredImages.length" class="grid">
                <div v-for="img in filteredImages" :key="img.file" class="card image-container"
                    :class="{ selected: selectMode && selectedIds.includes(img.id) }" :data-file="img.file"
                    @pointerenter="onThumbEnter($event, img)" @pointerleave="onThumbLeave($event, img)"
                    @dragstart="onThumbDragStart($event, img)" @dragend="onThumbDragEnd($event, img)">
                    <div class="thumb" @click="onImageClick(img, 'g')">
                        <img :src="img.thumb || img.file" :alt="img.name" loading="lazy">
                        <span v-if="isAnimated(img)" class="badge">▶ 움짤</span>
                        <span v-if="selectMode" class="sel-mark">{{ selectedIds.includes(img.id) ? selectedIds.indexOf(img.id) + 1 : '' }}</span>
                        <button v-else class="more" title="자세히" aria-label="자세히" @click.stop="openDetail(img)">⋯</button>
                        <div v-if="copiedKey === img.id + 'g'" class="copied"><span class="check">✓</span>복사됨</div>
                    </div>
                    <div class="name" :title="img.name">{{ img.name }}</div>
                </div>
            </div>
            <div v-else-if="images.length" class="empty">
                맞는 짤이 없어요 🥲<br>
                <button class="btn" @click="resetAll()">검색·필터 모두 풀기</button>
            </div>
        </section>

        <!-- ── 상세 보기 ── -->
        <div v-if="detail" class="dim" @click.self="detail = null">
            <div class="sheet" role="dialog" aria-modal="true" :aria-label="detail.name">
                <div class="big"><img :src="detail.file" :alt="detail.name"></div>
                <div class="info">
                    <h2>{{ detail.name }} <span v-if="isAnimated(detail)" class="badge static">▶ 움짤</span></h2>
                    <div>
                        <div class="meta-label">감정 · 상황 (누르면 필터)</div>
                        <div class="tags">
                            <button v-for="v in detail.emotion || []" :key="'de-' + v" class="chip" @click="applyFacet('emotion', v)">{{ v }}</button>
                            <button v-for="v in detail.situation || []" :key="'ds-' + v" class="chip" @click="applyFacet('situation', v)">{{ v }}</button>
                        </div>
                    </div>
                    <div v-if="detailTags.length">
                        <div class="meta-label">태그 (누르면 검색)</div>
                        <div class="tags">
                            <button v-for="t in detailTags" :key="t" class="chip" @click="searchTag(t)">#{{ t }}</button>
                        </div>
                    </div>
                    <div class="actions">
                        <button class="btn primary" @click="copyFromDetail()">📋 복사하기</button>
                        <button class="btn" @click="downloadImage(detail)">⬇ 저장</button>
                        <button class="btn" @click="copySingleShareLink(detail)">🔗 공유</button>
                        <button class="btn" @click="detail = null">닫기</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- ── 설정 ── -->
        <div v-if="settingsOpen" class="dim" @click.self="settingsOpen = false">
            <div class="settings" role="dialog" aria-modal="true" aria-label="설정">
                <h2>⚙️ 설정 <button class="btn small" @click="settingsOpen = false">닫기</button></h2>
                <div>
                    <div class="set-label">화면 모드</div>
                    <div class="set-desc">「시스템」은 폰·PC 설정을 따라가요. 위쪽 🌙/☀️ 버튼으로도 바로 바꿀 수 있어요.</div>
                    <div class="seg wide">
                        <button v-for="[v, l] in THEME_OPTIONS" :key="v" :class="{ on: settings.theme === v }"
                            @click="setTheme(v)">{{ l }}</button>
                    </div>
                </div>
                <div>
                    <div class="set-label">강조색</div>
                    <div class="set-desc">버튼·선택한 칩·복사 표시에 쓰이는 색이에요. 무지개 동그라미로 직접 고를 수도 있어요.</div>
                    <div class="swatches">
                        <button v-for="[c, n] in ACCENTS" :key="c" class="swatch"
                            :class="{ on: settings.accent.toLowerCase() === c.toLowerCase() }"
                            :style="{ background: c, '--sw-on': onColor(c) }" :title="n" :aria-label="n"
                            @click="setAccent(c)"></button>
                        <label class="custom" :class="{ on: !isPresetAccent }" title="직접 고르기"
                            :style="isPresetAccent ? null : { background: settings.accent }">
                            <input type="color" :value="settings.accent" aria-label="강조색 직접 고르기"
                                @input="setAccent($event.target.value)">
                        </label>
                    </div>
                </div>
                <div>
                    <div class="set-label">미리보기</div>
                    <div class="preview">
                        <span class="chip on">웃김</span><span class="chip">황당</span>
                        <span class="active-chip">축하 <span class="x">×</span></span>
                        <span class="btn primary inline">📋 복사하기</span>
                    </div>
                </div>
                <div>
                    <div class="set-label">기록</div>
                    <div class="set-desc">설정과 「최근 쓴 짤」은 이 브라우저에만 저장돼요.</div>
                    <div class="set-row">
                        <button class="btn" :disabled="!favImageIdxs.length" @click="clearRecent()">🕘 최근 쓴 짤 지우기 ({{ favImages.length }}개)</button>
                        <button class="btn" @click="resetSettings()">↺ 설정 초기화</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- ── 골라서 공유 바 ── -->
        <div v-if="selectMode" class="select-bar">
            <span class="text-no-wrap"><b>{{ selectedIds.length }}</b>개 선택</span>
            <span class="recent-pick">
                최근 추가
                <input v-model.number="recentCount" type="number" min="1" max="50" class="recent-count" aria-label="최근 추가 개수">
                <button class="btn" @click="selectRecent()">고르기</button>
            </span>
            <button class="btn" :disabled="!selectedIds.length" @click="selectedIds = []">해제</button>
            <button class="btn primary" :disabled="!selectedIds.length" @click="copyShareLink()">🔗 링크 복사</button>
            <button class="btn icon" aria-label="선택 끝" @click="exitSelectMode()">✕</button>
        </div>

    <!-- 도우미 없이 움짤을 눌렀을 때 / 「움짤 복사 도우미」 링크: Save As 안내 + 윈도우 도우미 설치 안내 -->
    <v-dialog v-model="helperGuide.show" max-width="520" scrollable>
        <v-card class="helper-guide" rounded="lg">
            <v-card-title class="d-flex align-center ga-2 pt-4 px-5">
                <v-icon color="primary">mdi-movie-open-play-outline</v-icon>
                <span class="text-h6 font-weight-bold">움짤을 카톡으로 보내는 법</span>
                <v-spacer></v-spacer>
                <v-btn icon="mdi-close" variant="text" size="small" aria-label="닫기" @click="closeHelperGuide()"></v-btn>
            </v-card-title>

            <v-card-text class="px-5 pb-2">
                <v-alert v-if="helperGuide.name" type="warning" variant="tonal" density="compact" class="mb-4">
                    <b>"{{ helperGuide.name }}"</b> 는 움직이는 짤이에요.<br>
                    클릭 복사로는 움직임이 사라져서, 아래 방법 중 하나로 보내 주세요.
                </v-alert>

                <!-- 방법 1: 지금 바로 (설치 없이) -->
                <div class="guide-box">
                    <div class="guide-head">
                        <v-chip size="small" color="grey-darken-1" variant="flat" label>방법 1</v-chip>
                        <span>설치 없이 지금 바로</span>
                    </div>
                    <div class="guide-step"><span class="step-no">1</span>
                        <span>짤을 <b>마우스 오른쪽 클릭</b></span></div>
                    <div class="guide-step"><span class="step-no">2</span>
                        <span><b>「다른 이름으로 이미지 저장」</b>(Save As)</span></div>
                    <div class="guide-step"><span class="step-no">3</span>
                        <span>저장한 파일을 <b>카톡 대화창에 끌어다 놓기</b></span></div>
                </div>

                <!-- 방법 2: 도우미 설치 (윈도우) -->
                <div v-if="isWindows" class="guide-box guide-box--primary mt-3">
                    <div class="guide-head">
                        <v-chip size="small" color="primary" variant="flat" label>방법 2 · 추천</v-chip>
                        <span>「짤 복사 도우미」 한 번 설치</span>
                    </div>
                    <p class="guide-desc">
                        설치해 두면 움짤을 <b>클릭만 해도</b> 마우스 옆에 작은 창이 떠요.
                        그 창을 <b>카톡 대화창으로 끌어다 놓으면</b> 바로 전송돼요.
                    </p>
                    <div class="guide-step"><span class="step-no">1</span>
                        <span>아래 <b>「도우미 받기」</b> 버튼으로 <code>JjalCopy.exe</code> 받기
                            <div class="step-note">브라우저가 「흔하지 않은 파일」이라며 막으면 → 다운로드 목록에서 <b>「유지」/「계속」</b></div>
                        </span></div>
                    <div class="guide-step"><span class="step-no">2</span>
                        <span>받은 파일 실행
                            <div class="step-note">「Windows의 PC 보호」 파란 창이 뜨면 → <b>「추가 정보」 → 「실행」</b></div>
                        </span></div>
                    <div class="guide-step"><span class="step-no">3</span>
                        <span>화면 오른쪽 아래 트레이에 아이콘이 생기면 끝!
                            <div class="step-note">이 탭으로 돌아오면 자동으로 알아채요 — 다시 움짤을 눌러 보세요</div>
                        </span></div>
                </div>

                <div class="text-caption text-medium-emphasis mt-3">
                    💡 정지 이미지는 도우미와 상관없이 <b>클릭 → 카톡에서 Ctrl+V</b> 로 바로 보내져요.
                    <template v-if="isWindows">도우미 종료·제거는 트레이 아이콘 우클릭.</template>
                </div>
                <v-checkbox v-if="helperGuide.name" v-model="helperGuide.mute" density="compact" hide-details
                    label="다음부터 이 창 대신 짧은 안내만 보기" class="mt-1"></v-checkbox>
            </v-card-text>

            <v-divider></v-divider>
            <v-card-actions class="px-5 py-3 ga-2">
                <v-btn variant="outlined" size="large" @click="closeHelperGuide()">닫기</v-btn>
                <v-spacer></v-spacer>
                <v-btn v-if="isWindows" color="primary" variant="flat" size="large" :href="WIN_HELPER_URL"
                    prepend-icon="mdi-download" class="px-6 font-weight-bold text-none">
                    도우미 받기 (Windows)
                </v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>

    <AppSnackbars ref="appSnackbars" />
    </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref, computed, watch } from "vue";
import { useRoute, useRouter } from 'vue-router';
import { useDisplay, useTheme } from 'vuetify';
import { matchesSearch, matchesFacetFilters } from '@/utils/imageFilter';
import { parseFilterQuery, buildFilterQuery, recentIds, orderByIds } from '@/utils/urlState';

const { width } = useDisplay();
const isMobileCustom = computed(() => width.value <= 1024);
// 움직이는 짤인지: webp 전환(2026-11-21) 후엔 확장자로 알 수 없어서 데이터의 animated 를 본다 (옛 .gif 경로도 호환)
const isAnimated = (img) => !!img?.animated || /\.gif$/i.test(img?.file || '');

const search = ref(null);
const images = ref([]);
const taxonomy = ref({ emotion: [], situation: [] });
const selectedEmotion = ref([]);
const selectedSituation = ref([]);
const favImageIdxs = ref([]);
const appSnackbars = ref(null);
const motionFilter = ref('all');   // 'all' | 'still'(정지만) | 'anim'(움짤만)
const openAxis = ref(null);         // 펼친 필터 패널: 'emotion' | 'situation' | null
const detail = ref(null);           // 상세 보기 중인 짤
const settingsOpen = ref(false);
const searchInput = ref(null);
const copiedKey = ref(null);        // 「복사됨」 표시 중인 카드 (id + 'g'(목록) | 'r'(최근 띠))
const MOTION_OPTIONS = [['all', '전부', '정지·움짤 모두'], ['still', '정지', '움직이지 않는 이미지만 (클릭하면 바로 복사)'], ['anim', '움짤', '움직이는 짤만']];
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
        // 화면의 img.file 은 앞에 「/」가 붙은 경로라 저장값도 그 형태로 맞춘다
        // (예전엔 data.json 의 「/」 없는 경로와 비교해서 새로고침할 때마다 최근 목록이 지워졌다)
        file.forEach(it => {
            const f = withLeadingSlash(it.file);
            if (f) fileSet.add(f);
            if (it.id && f) idToFile[String(it.id)] = f;
            if (it.name && f) nameToFile[it.name] = f;
        });

        const migrated = favImageIdxs.value.map(v => {
            if (fileSet.has(v)) return v;
            if (fileSet.has(withLeadingSlash(v))) return withLeadingSlash(v);
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

    // 옛 설정(excludeGif=1)은 「정지만」으로 이어받는다
    const stored = localStorage.getItem('motionFilter');
    motionFilter.value = ['all', 'still', 'anim'].includes(stored) ? stored
        : (localStorage.getItem('excludeGif') === '1' ? 'still' : 'all');

    applyFilterQuery(route.query, { initial: true });
    urlSyncReady.value = true;
});

// URL(/?search=카드&emotion=웃김,황당&situation=한턱/쏘기&motion=still) -> 화면 상태
// initial: 첫 진입 때만 motion 이 없으면 저장된(localStorage) 설정을 유지한다.
// 그 이후엔 상태가 항상 URL에 반영돼 있으므로 motion 이 없으면 「전체」다 (뒤로가기 대응).
const applyFilterQuery = (query, { initial = false } = {}) => {
    const parsed = parseFilterQuery(query, taxonomy.value);
    search.value = parsed.search;
    selectedEmotion.value = parsed.emotion;
    selectedSituation.value = parsed.situation;
    if (parsed.motion !== null) motionFilter.value = parsed.motion;
    else if (!initial) motionFilter.value = 'all';
    sharedIds.value = parsed.ids;
};

const currentFilterQuery = () => buildFilterQuery({
    search: search.value,
    emotion: selectedEmotion.value,
    situation: selectedSituation.value,
    motion: motionFilter.value,
    ids: sharedIds.value
});

const sameQuery = (a, b) => {
    const norm = q => JSON.stringify(Object.keys(q).sort().map(k => [k, String(q[k]).normalize('NFC')]));
    return norm(a) === norm(b);
};

// 화면 상태 -> URL (검색어 입력/칩 클릭/정지·움짤 필터 모두 반영, 히스토리는 쌓지 않음)
watch([search, selectedEmotion, selectedSituation, motionFilter, sharedIds], () => {
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
watch(motionFilter, (newValue) => {
    localStorage.setItem('motionFilter', newValue || 'all');
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
    // 공유받은 짤은 받는 사람의 정지/움짤 설정 때문에 숨겨지지 않게 한다
    if (!isShared && motionFilter.value === 'still') filtered = filtered.filter(img => !isAnimated(img));
    if (!isShared && motionFilter.value === 'anim') filtered = filtered.filter(img => isAnimated(img));
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
const resetAll = () => {
    search.value = '';
    clearFilters();
    motionFilter.value = 'all';
    sharedIds.value = [];
    openAxis.value = null;
};
const toggleAxis = (axis) => { openAxis.value = openAxis.value === axis ? null : axis; };

// 「최근 쓴 짤」 띠: 검색·필터·공유 보기·선택 모드가 아닐 때만
const showRecent = computed(() => !search.value && !activeFilterCount.value && motionFilter.value === 'all'
    && !sharedIds.value.length && !selectMode.value && favImages.value.length > 0);
const clearRecent = () => {
    favImageIdxs.value = [];
    appSnackbars.value.showSnackbar({ message: '최근 쓴 짤을 지웠어요' });
};

// ── 상세 보기 ──
const openDetail = (img) => { detail.value = img; };
const detailTags = computed(() => (detail.value?.tag || '').split(',').map(s => s.trim()).filter(Boolean));
const applyFacet = (axis, v) => {
    const target = axis === 'emotion' ? selectedEmotion : selectedSituation;
    if (!target.value.includes(v)) target.value = [...target.value, v];
    sharedIds.value = [];
    detail.value = null;
};
const searchTag = (t) => {
    search.value = t;
    sharedIds.value = [];
    detail.value = null;
};
const copyFromDetail = () => {
    const img = detail.value;
    detail.value = null;
    copyImageToClipboard(img, 'g');
};
const copySingleShareLink = async (img) => {
    const url = `${location.origin}/s/${img.id}.html`;
    try {
        await navigator.clipboard.writeText(url);
        appSnackbars.value.showSnackbar({ message: `"${img.name}" 공유 링크를 복사했어요.` });
    } catch {
        appSnackbars.value.showSnackbar({ message: `복사에 실패했어요. 직접 복사하세요: ${url}`, type: 'warning' });
    }
};

// ── 키보드: / 로 검색, Esc 로 닫기 ──
const onKeydown = (e) => {
    const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
    if (e.key === '/' && !typing) { e.preventDefault(); searchInput.value?.focus(); }
    if (e.key === 'Escape') {
        if (detail.value) detail.value = null;
        else if (settingsOpen.value) settingsOpen.value = false;
        else openAxis.value = null;
    }
};
onMounted(() => window.addEventListener('keydown', onKeydown));
onUnmounted(() => window.removeEventListener('keydown', onKeydown));

// ── 설정 (localStorage 'jjal_settings' = { theme: 'system'|'light'|'dark', accent: '#RRGGBB' }) ──
// index.html 의 인라인 스크립트가 첫 그리기 전에 같은 값을 적용한다(다크 모드 번쩍임 방지)
const ACCENTS = [
    ['#3B6CF6', '파랑(기본)'], ['#7C5CFC', '보라'], ['#E64980', '핑크'], ['#F76707', '주황'],
    ['#F5C400', '노랑'], ['#12B886', '초록'], ['#15AABF', '청록'], ['#495057', '먹색'],
];
const THEME_OPTIONS = [['system', '🖥 시스템'], ['light', '☀️ 라이트'], ['dark', '🌙 다크']];
const SETTINGS_DEFAULTS = { theme: 'system', accent: '#3B6CF6' };
const loadSettings = () => {
    try { return { ...SETTINGS_DEFAULTS, ...JSON.parse(localStorage.getItem('jjal_settings') || '{}') }; }
    catch { return { ...SETTINGS_DEFAULTS }; }
};
const settings = ref(loadSettings());
const darkMq = window.matchMedia('(prefers-color-scheme: dark)');
const systemDark = ref(darkMq.matches);
const onSystemTheme = (e) => { systemDark.value = e.matches; };
onMounted(() => darkMq.addEventListener('change', onSystemTheme));
onUnmounted(() => darkMq.removeEventListener('change', onSystemTheme));
const isDark = computed(() => settings.value.theme === 'dark' || (settings.value.theme === 'system' && systemDark.value));
const isPresetAccent = computed(() => ACCENTS.some(([c]) => c.toLowerCase() === settings.value.accent.toLowerCase()));
// 밝은 강조색(노랑 등) 위에는 검은 글자, 어두운 색 위에는 흰 글자
const onColor = (hex) => {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#191C22' : '#FFFFFF';
};
const vTheme = useTheme();
const applySettings = () => {
    const root = document.documentElement;
    if (isDark.value) root.dataset.theme = 'dark'; else delete root.dataset.theme;
    root.style.setProperty('--accent', settings.value.accent);
    root.style.setProperty('--on-accent', onColor(settings.value.accent));
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark.value ? '#111317' : '#F6F7F9');
    // Vuetify 컴포넌트(도우미 안내 창 등)도 같은 모드·강조색을 쓰게
    for (const name of ['light', 'dark']) vTheme.themes.value[name].colors.primary = settings.value.accent;
    vTheme.global.name.value = isDark.value ? 'dark' : 'light';
};
watch([settings, isDark], () => {
    localStorage.setItem('jjal_settings', JSON.stringify(settings.value));
    applySettings();
}, { deep: true, immediate: true });
const setTheme = (v) => { settings.value.theme = v; };
const toggleTheme = () => { settings.value.theme = isDark.value ? 'light' : 'dark'; };
const setAccent = (c) => { settings.value.accent = c; };
const resetSettings = () => {
    settings.value = { ...SETTINGS_DEFAULTS };
    localStorage.removeItem('jjal_settings');
    appSnackbars.value.showSnackbar({ message: '설정을 처음으로 돌렸어요' });
};

// 복사 성공 표시 (카드 위 「✓ 복사됨」)
let copiedTimer;
const flashCopied = (img, where) => {
    copiedKey.value = img.id + where;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => { copiedKey.value = null; }, 900);
};

const startSelectMode = () => {
    selectMode.value = true;
    // 공유받은 화면에서 시작하면 그 짤들을 미리 골라 둔다 (일부 빼고 다시 공유하기 쉽게)
    selectedIds.value = [...sharedIds.value];
};
const exitSelectMode = () => {
    selectMode.value = false;
    selectedIds.value = [];
};
const toggleSelectMode = () => (selectMode.value ? exitSelectMode() : startSelectMode());
const onImageClick = (img, where = 'g') => {
    if (!selectMode.value) return copyImageToClipboard(img, where);
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
// ── 움짤 원본 복사 (맥 WebPCap / 윈도우 짤 복사 도우미) ─────────────────────────
// 로컬 도우미가 켜져 있으면(127.0.0.1:47321/ping 응답) 「움짤」 클릭 한 번에 원본 파일을 클립보드로 + 끌어다 놓기 창.
// 정지 이미지는 도우미를 쓰지 않는다: 파일로 넣으면 윈도우 카톡이 붙여넣기를 거부하므로 브라우저 PNG 복사가 낫다.
// 브라우저는 클립보드에 파일을 넣을 수 없고, 드래그 앤 드롭은 Zen 이 파일을 다 쓰기 전에 넘겨 빈 파일이 되므로 이 경로를 쓴다.
// 도우미가 없으면 움짤은 Save As 안내(윈도우 데스크톱은 도우미 설치 안내 창). 윈도우 데스크톱에서만 작은 안내 링크를 보여준다.
const WEBPCAP = 'http://127.0.0.1:47321';
const HELPER_APPS = ['WebPCap', 'JjalCopy'];
const WIN_HELPER_URL = 'https://github.com/kabkee/storage_jjal/releases/latest/download/JjalCopySetup.exe';
const webpcapReady = ref(false);
const platformStr = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent;
const isMac = /Mac/i.test(platformStr) && navigator.maxTouchPoints <= 1;   // iPad(데스크톱 모드) 제외
const isWindows = /Win/i.test(platformStr);
const pasteKey = isMac ? '⌘V' : 'Ctrl+V';
const showWinHelperLink = computed(() => isWindows && !webpcapReady.value && !isMobileCustom.value);
const probeWebPCap = async () => {
    if (!isMac && !isWindows) return;
    try {
        const r = await fetch(`${WEBPCAP}/ping`, { signal: AbortSignal.timeout(800) });
        webpcapReady.value = HELPER_APPS.includes((await r.json())?.app);
    } catch {
        webpcapReady.value = false;
    }
};
onMounted(() => {
    probeWebPCap();
    window.addEventListener('focus', probeWebPCap);   // WebPCap 을 나중에 켜도 탭으로 돌아오면 감지
});
onUnmounted(() => window.removeEventListener('focus', probeWebPCap));

let lastWebPCapCopy = { file: '', at: 0 };
const copyViaWebPCap = async (image, where) => {
    // 짤톡 확장의 더블클릭 저장과 겹치면 클릭이 두 번 들어오므로 같은 짤 연속 요청은 무시
    const now = Date.now();
    if (lastWebPCapCopy.file === image.file && now - lastWebPCapCopy.at < 1500) return;
    lastWebPCapCopy = { file: image.file, at: now };

    const url = new URL(withLeadingSlash(image.file), window.location.origin).href;
    const ext = (image.file.split('.').pop() || 'gif').toLowerCase();
    try {
        const r = await fetch(`${WEBPCAP}/copy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, name: `${image.name || 'jjal'}.${ext}` }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
        // 윈도우 카톡은 클립보드 파일 붙여넣기를 안 받아서, 도우미가 띄운 미리보기 창을 끌어다 놓게 안내
        const how = j.hint === 'drag'
            ? `옆에 뜬 창을 카톡으로 끌어다 놓기 (탐색기·Slack은 ${pasteKey})`
            : `카톡·Slack에서 ${pasteKey}`;
        flashCopied(image, where);
        appSnackbars.value.showSnackbar({ message: `"${image.name}" 원본 복사 완료 — ${how}` });
    } catch (e) {
        appSnackbars.value.showSnackbar({ message: `원클릭 복사 실패: ${e.message}`, type: 'error' });
        probeWebPCap();
    }
};

// 도우미 없이 움짤을 눌렀을 때 띄우는 안내 창. 「다음부터 안 띄우기」를 고르면 예전처럼 짧은 안내만 한다
const HELPER_GUIDE_MUTE_KEY = 'jjal.helperGuideMuted';
const helperGuide = ref({ show: false, name: '', mute: false });
const openHelperGuide = (image) => {
    helperGuide.value = { show: true, name: image?.name || '', mute: false };
};
const closeHelperGuide = () => {
    if (helperGuide.value.mute) localStorage.setItem(HELPER_GUIDE_MUTE_KEY, '1');
    helperGuide.value.show = false;
};

const copyImageToClipboard = async (image, where = 'g') => {
    addFavImage(image.file);

    if (isAnimated(image)) {
        // 움짤만 도우미로: 원본 파일을 클립보드에 넣고 「끌어다 놓기」 창을 띄운다 (윈도우 카톡은 파일 붙여넣기를 안 받음)
        if (webpcapReady.value) return copyViaWebPCap(image, where);
        // 짤톡 확장 프로그램이 설치돼 있으면(<html data-jjaltok>) 더블클릭으로 바로 저장되므로 안내하지 않는다
        if (document.documentElement.dataset.jjaltok) return;
        if (isWindows && !isMobileCustom.value && !localStorage.getItem(HELPER_GUIDE_MUTE_KEY)) {
            return openHelperGuide(image);
        }
        appSnackbars.value.showSnackbar({
            message: `안내 : "${image.name}" 를 Save As 로 다운 받으세요!!  `, type: 'warning'
        })
        return;
    }
    // 정지 이미지는 도우미가 켜져 있어도 브라우저가 PNG 그림으로 복사 → 카톡에서 바로 붙여넣기(파일이 아니라 그림이라 윈도우 카톡도 받음)
    // 누르자마자 「✓ 복사됨」을 보여 준다(원본을 받아 PNG 로 바꾸는 동안 아무 반응이 없어 보이지 않게). 실패하면 표시를 거두고 알린다.
    flashCopied(image, where);
    const fail = (e) => {
        console.error('이미지를 클립보드에 복사하는 중 오류 발생:', e);
        if (copiedKey.value === image.id + where) copiedKey.value = null;
        const why = window.isSecureContext ? '' : ' (https 주소에서만 복사돼요)';
        appSnackbars.value.showSnackbar({ message: `복사에 실패했어요${why}. 「⋯ → 저장」으로 받아 주세요`, type: 'error' });
    };
    // PNG 변환은 비동기라, 클립보드 쓰기는 클릭 직후에 Promise 를 넘겨서 호출한다(사파리는 클릭 순간에 불러야 허용)
    const pngBlob = new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const c = document.createElement('canvas');
            c.width = img.naturalWidth;
            c.height = img.naturalHeight;
            c.getContext('2d').drawImage(img, 0, 0);
            c.toBlob(blob => (blob ? resolve(blob) : reject(new Error('PNG 변환 실패'))), 'image/png');
        };
        img.onerror = () => reject(new Error('이미지를 불러오지 못했어요'));
        img.src = image.file;
    });
    try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
        appSnackbars.value.showSnackbar({ message: `"${image.name}" 복사됨 — 카톡에서 ${pasteKey}` });
    } catch (e) {
        fail(e);
    }
}

// ── 썸네일 드래그 앤 드롭 = 「원본 이미지」 드래그 ──────────────────────────────
// 썸네일(240px webp)을 그대로 끌면 받는 앱(카톡 등)에 빈 파일/빈 webp 가 간다.
// 원본 이미지를 직접 끄는 건 Chrome·Firefox(Zen) 모두 잘 되므로, 마우스를 올리면 원본을 미리 받아
// 썸네일 <img> 의 src 를 원본으로 바꿔치기 → 브라우저 기본 이미지 드래그가 원본 파일을 넘긴다.
// (Chrome 전용 DownloadURL 방식은 카톡이 받지 않고, Firefox 는 아예 지원하지 않아 폐기)
const HOVER_PRELOAD_DELAY = 120;
const hoverTimers = new WeakMap();
const thumbImgEl = (el) => el?.querySelector('img');

const swapToOriginal = (el, image) => {
    if (!image?.thumb || el.dataset.original) return;      // 썸네일이 없으면 이미 원본을 보여주는 중
    const src = withLeadingSlash(image.file);
    const pre = new Image();
    pre.onload = () => {
        const imgEl = thumbImgEl(el);
        if (!imgEl || !(el.matches(':hover') || el.dataset.dragging)) return;  // 그 사이 마우스가 떠났으면 안 바꿈
        imgEl.src = src;                                      // 캐시에 있으니 즉시 표시
        el.dataset.original = '1';
    };
    pre.src = src;
};
const restoreThumb = (el, image) => {
    const imgEl = thumbImgEl(el);
    if (!imgEl || !el.dataset.original) return;
    imgEl.src = withLeadingSlash(image.thumb);                // 원본 GIF 디코딩 메모리 해제
    delete el.dataset.original;
};
const onThumbEnter = (e, image) => {
    if (e.pointerType && e.pointerType !== 'mouse') return;  // 터치 기기는 드래그 앤 드롭 대상 아님
    const el = e.currentTarget;
    clearTimeout(hoverTimers.get(el));
    hoverTimers.set(el, setTimeout(() => swapToOriginal(el, image), HOVER_PRELOAD_DELAY));
};
const onThumbLeave = (e, image) => {
    const el = e.currentTarget;
    clearTimeout(hoverTimers.get(el));
    if (!el.dataset.dragging) restoreThumb(el, image);
};
const onThumbDragStart = (e, image) => {
    const el = e.currentTarget;
    if (image?.thumb && !el.dataset.original) {
        // 원본이 아직 안 들어왔으면 썸네일이 끌려가 빈 파일이 되므로 막는다
        e.preventDefault();
        swapToOriginal(el, image);
        appSnackbars.value?.showSnackbar({ message: '원본 불러오는 중… 잠시 후 다시 끌어주세요', type: 'info' });
        return;
    }
    el.dataset.dragging = '1';
};
const onThumbDragEnd = (e, image) => {
    const el = e.currentTarget;
    delete el.dataset.dragging;
    if (!el.matches(':hover')) restoreThumb(el, image);
};

const downloadImage = (image) => {
    const a = document.createElement('a');
    a.href = withLeadingSlash(image.file);
    a.download = `${image.name || 'jjal'}.${(image.file.split('.').pop() || 'webp').toLowerCase()}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    appSnackbars.value.showSnackbar({ message: `"${image.name}" 를 다운로드 합니다.` });
};
</script>

<style>
/* ── 디자인 토큰 (mockup/redesign.html 시안) — 강조색(--accent)·글자색(--on-accent)은 설정에서 JS 가 넣는다 ── */
:root {
    --accent: #3B6CF6; --on-accent: #fff;
    --bg: #F6F7F9; --surface: #fff; --text: #191C22; --sub: #6B7280; --line: #E5E7EB; --chip: #F0F1F4;
    --accent-soft: color-mix(in srgb, var(--accent) 14%, var(--surface));
    --radius: 10px;
    color-scheme: light;
}
:root[data-theme="dark"] {
    --bg: #111317; --surface: #1B1E24; --text: #ECEEF2; --sub: #9AA1AC; --line: #2B2F37; --chip: #262A32;
    --accent-soft: color-mix(in srgb, var(--accent) 24%, var(--surface));
    color-scheme: dark;
}
html, body { background: var(--bg); }
body, .v-application {
    font-family: "Pretendard Variable", Pretendard, system-ui, -apple-system, "Segoe UI", sans-serif !important;
    -webkit-font-smoothing: antialiased;
}
.v-application { background: var(--bg) !important; color: var(--text) !important; }
</style>

<style scoped>
.jjal { color: var(--text); min-height: 100vh; }
.jjal button { font: inherit; color: inherit; cursor: pointer; border: 0; background: none; }
.jjal button:disabled { opacity: .45; cursor: default; }

/* ── 헤더 ── */
.hdr { position: sticky; top: 0; z-index: 20; background: color-mix(in srgb, var(--bg) 88%, transparent); backdrop-filter: blur(10px); border-bottom: 1px solid var(--line); }
.hdr-inner { max-width: 1240px; margin: 0 auto; padding: 10px 16px; display: flex; align-items: center; gap: 12px; }
.logo { font-weight: 800; font-size: 17px; white-space: nowrap; letter-spacing: -.02em; color: var(--text); text-decoration: none; }
.logo span { color: var(--accent); }
.search { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; background: var(--surface); border: 1.5px solid var(--line); border-radius: 12px; padding: 0 12px; height: 44px; transition: border-color .15s; cursor: text; }
.search:focus-within { border-color: var(--accent); }
.search-icon { color: var(--sub); }
.search input { flex: 1; border: 0; outline: 0; background: none; font: inherit; font-size: 15px; color: var(--text); min-width: 0; }
.search input::placeholder { color: var(--sub); }
.search kbd { font-size: 11px; color: var(--sub); border: 1px solid var(--line); border-radius: 5px; padding: 1px 6px; font-family: inherit; }
.search-clear { color: var(--sub) !important; padding: 4px; }
.icon-btn { height: 44px; padding: 0 14px; border-radius: 12px; background: var(--surface) !important; border: 1.5px solid var(--line) !important; display: inline-flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 600; white-space: nowrap; }
.icon-btn.square { width: 44px; padding: 0; justify-content: center; }
.icon-btn.on { background: var(--accent) !important; color: var(--on-accent) !important; border-color: var(--accent) !important; }

/* ── 필터 줄 ── */
.toolbar { max-width: 1240px; margin: 0 auto; padding: 12px 16px 0; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.drop { height: 36px; padding: 0 10px 0 14px; border-radius: 999px; background: var(--surface) !important; border: 1px solid var(--line) !important; font-size: 14px; display: inline-flex; align-items: center; gap: 2px; }
.drop.has, .drop.open { border-color: var(--accent) !important; }
.drop.has { font-weight: 700; background: var(--accent-soft) !important; }
.drop .caret { opacity: .6; }
.seg { display: inline-flex; background: var(--chip); border-radius: 999px; padding: 3px; }
.seg button { height: 30px; padding: 0 12px; border-radius: 999px; font-size: 13px; color: var(--sub) !important; }
.seg button.on { background: var(--surface); color: var(--text) !important; font-weight: 700; box-shadow: 0 1px 3px rgba(0, 0, 0, .12); }
.spacer { flex: 1; }
.count { font-size: 13px; color: var(--sub); white-space: nowrap; }
.count b { color: var(--text); }
.helper-link { font-size: 13px; color: var(--sub); text-decoration: none; white-space: nowrap; display: inline-flex; align-items: center; gap: 3px; }
.helper-link:hover { color: var(--accent); }

.panel { max-width: 1240px; margin: 8px auto 0; padding: 0 16px; }
.panel-inner { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 12px; display: flex; flex-wrap: wrap; gap: 6px; }
.chip { height: 32px; padding: 0 12px; border-radius: 999px; background: var(--chip) !important; font-size: 13.5px; display: inline-flex; align-items: center; }
.chip.on { background: var(--accent) !important; color: var(--on-accent) !important; font-weight: 600; }
.active-row { max-width: 1240px; margin: 8px auto 0; padding: 0 16px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.active-chip { height: 28px; padding: 0 8px 0 12px; border-radius: 999px; background: var(--accent-soft); font-size: 13px; display: inline-flex; align-items: center; gap: 4px; }
.active-chip .x { opacity: .6; font-size: 15px; line-height: 1; padding: 0 2px; }
.link { font-size: 13px; color: var(--sub) !important; text-decoration: underline; }

.shared-banner { max-width: 1208px; margin: 12px auto 0; padding: 10px 14px; display: flex; align-items: center; gap: 8px; background: var(--accent-soft); border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent); border-radius: 12px; font-size: 14px; }
@media (max-width: 1240px) { .shared-banner { margin-left: 16px; margin-right: 16px; } }

/* ── 섹션 · 최근 쓴 짤 띠 ── */
.section { max-width: 1240px; margin: 16px auto 0; padding: 0 16px; }
.section-title { font-size: 13px; font-weight: 700; color: var(--sub); margin: 0 0 8px; display: flex; align-items: center; gap: 6px; }
.strip { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 6px; scroll-snap-type: x proximity; }
.strip .card { flex: 0 0 76px; scroll-snap-align: start; }

/* ── 그리드 ── */
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); min-width: 0; gap: 10px; padding-bottom: 120px; }
.card { position: relative; min-width: 0; }
.thumb { position: relative; aspect-ratio: 1; border-radius: var(--radius); overflow: hidden; background: var(--chip); cursor: pointer; transition: transform .12s, box-shadow .12s; }
.thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.card:hover .thumb { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(0, 0, 0, .14); }
.badge { position: absolute; left: 6px; top: 6px; background: rgba(0, 0, 0, .6); color: #fff; font-size: 10px; font-weight: 700; border-radius: 6px; padding: 2px 5px; pointer-events: none; }
.badge.mini { font-size: 9px; padding: 1px 4px; left: 4px; top: 4px; }
.badge.static { position: static; vertical-align: middle; font-size: 11px; }
.more { position: absolute; right: 5px; top: 5px; width: 28px; height: 28px; border-radius: 50%; background: rgba(0, 0, 0, .55) !important; color: #fff !important; font-size: 16px; line-height: 28px; opacity: 0; transition: opacity .15s; }
.card:hover .more, .more:focus-visible { opacity: 1; }
.name { font-size: 12px; color: var(--sub); margin-top: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 0 2px; }
.copied { position: absolute; inset: 0; background: color-mix(in srgb, var(--accent) 80%, transparent); color: var(--on-accent); display: flex; flex-direction: column; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; gap: 2px; animation: pop .9s ease forwards; pointer-events: none; }
.copied .check { font-size: 26px; line-height: 1; }
@keyframes pop { 0% { opacity: 0; } 12% { opacity: 1; } 75% { opacity: 1; } 100% { opacity: 0; } }
.sel-mark { position: absolute; right: 6px; top: 6px; width: 24px; height: 24px; border-radius: 50%; border: 2px solid #fff; background: rgba(0, 0, 0, .3); color: var(--on-accent); font-size: 13px; font-weight: 800; display: flex; align-items: center; justify-content: center; pointer-events: none; }
.card.selected .thumb { outline: 3px solid var(--accent); outline-offset: -3px; }
.card.selected .sel-mark { background: var(--accent); border-color: var(--accent); }
.empty { text-align: center; padding: 60px 16px; color: var(--sub); }
.empty .btn { margin-top: 12px; padding: 0 16px; }

/* ── 버튼 ── */
.btn { height: 42px; padding: 0 14px; border-radius: 10px; background: var(--chip) !important; font-weight: 600; font-size: 14px; display: inline-flex; align-items: center; justify-content: center; gap: 4px; white-space: nowrap; }
.btn.small { height: 34px; padding: 0 12px; font-size: 13px; }
.btn.primary { background: var(--accent) !important; color: var(--on-accent) !important; }
.btn.primary.inline { height: 36px; font-size: 13px; }

/* ── 상세 보기 · 설정 (어둡게 덮는 창) ── */
.dim { position: fixed; inset: 0; background: rgba(0, 0, 0, .45); z-index: 40; display: flex; align-items: center; justify-content: center; }
.sheet { background: var(--surface); border-radius: 18px; width: min(720px, calc(100vw - 32px)); max-height: 86vh; overflow: auto; display: grid; grid-template-columns: 1fr 1fr; }
.sheet .big { background: #000; display: flex; align-items: center; justify-content: center; min-height: 320px; }
.sheet .big img { max-width: 100%; max-height: 70vh; display: block; }
.sheet .info { padding: 20px; display: flex; flex-direction: column; gap: 14px; }
.sheet h2 { margin: 0; font-size: 19px; letter-spacing: -.02em; }
.meta-label { font-size: 12px; color: var(--sub); margin-bottom: 6px; font-weight: 600; }
.tags { display: flex; flex-wrap: wrap; gap: 6px; }
.tags .chip { height: 28px; font-size: 12.5px; }
.actions { margin-top: auto; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
.actions .btn.primary { grid-column: 1 / -1; height: 48px; font-size: 15px; }

.settings { background: var(--surface); border-radius: 18px; width: min(440px, calc(100vw - 24px)); max-height: 86vh; overflow: auto; padding: 20px; display: flex; flex-direction: column; gap: 22px; }
.settings h2 { margin: 0; font-size: 19px; display: flex; align-items: center; justify-content: space-between; }
.set-label { font-size: 13px; font-weight: 700; margin-bottom: 4px; }
.set-desc { font-size: 12px; color: var(--sub); margin-bottom: 10px; }
.seg.wide { display: flex; }
.seg.wide button { flex: 1; height: 38px; font-size: 14px; }
.swatches { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.swatch { width: 36px; height: 36px; border-radius: 50%; position: relative; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, .1); }
.swatch.on::after { content: '✓'; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-weight: 800; color: var(--sw-on, #fff); }
.swatch.on, .custom.on { outline: 2px solid var(--text); outline-offset: 2px; }
.custom { width: 36px; height: 36px; border-radius: 50%; overflow: hidden; position: relative; background: conic-gradient(red, yellow, lime, aqua, blue, magenta, red); }
.custom input { position: absolute; inset: 0; opacity: 0; width: 100%; height: 100%; cursor: pointer; }
.preview { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding: 12px; border-radius: 12px; background: var(--bg); }
.set-row { display: flex; gap: 8px; flex-wrap: wrap; }
.set-row .btn { height: 38px; font-size: 13px; }

/* ── 골라서 공유 바 ── */
.select-bar { position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%); z-index: 30; background: var(--text); color: var(--bg); border-radius: 14px; padding: 10px 12px 10px 18px; display: flex; align-items: center; gap: 10px; box-shadow: 0 10px 30px rgba(0, 0, 0, .25); max-width: calc(100vw - 24px); flex-wrap: wrap; justify-content: center; }
.select-bar .btn { height: 36px; padding: 0 12px; background: rgba(255, 255, 255, .14) !important; color: inherit !important; font-size: 13px; }
:root[data-theme="dark"] .select-bar .btn { background: rgba(0, 0, 0, .1) !important; }
.select-bar .btn.primary, :root[data-theme="dark"] .select-bar .btn.primary { background: var(--accent) !important; color: var(--on-accent) !important; }
.select-bar .btn.icon { width: 36px; padding: 0; }
.recent-pick { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; white-space: nowrap; }
.recent-count { width: 46px; height: 32px; border-radius: 8px; border: 1px solid rgba(128, 128, 128, .5); background: transparent; color: inherit; text-align: center; font: inherit; }

/* ── 모바일 ── */
@media (max-width: 640px) {
    .logo { display: none; }
    .hdr-inner { padding: 8px 12px; gap: 8px; }
    .search kbd { display: none; }
    .icon-btn .label { display: none; }
    .icon-btn { width: 44px; padding: 0; justify-content: center; }
    .toolbar, .panel, .active-row, .section { padding-left: 12px; padding-right: 12px; }
    .count { width: 100%; order: 9; }
    .grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
    .more { opacity: 1; width: 24px; height: 24px; line-height: 24px; font-size: 14px; }
    .dim { align-items: flex-end; }
    .sheet { width: 100vw; border-radius: 18px 18px 0 0; grid-template-columns: 1fr; max-height: 90vh; }
    .sheet .big { min-height: 0; }
    .sheet .big img { max-height: 45vh; }
    .settings { width: 100vw; border-radius: 18px 18px 0 0; }
}

/* 움짤 안내 창 */
.helper-guide .guide-box {
    border: 1px solid rgba(0, 0, 0, 0.12);
    border-radius: 10px;
    padding: 12px 14px;
    background: rgba(0, 0, 0, 0.02);
}
.helper-guide .guide-box--primary {
    border: 2px solid rgb(var(--v-theme-primary));
    background: rgba(var(--v-theme-primary), 0.05);
}
.helper-guide .guide-head {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 700;
    font-size: 1.02em;
    margin-bottom: 8px;
}
.helper-guide .guide-desc {
    margin-bottom: 10px;
    line-height: 1.55;
}
.helper-guide .guide-step {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    margin: 7px 0;
    line-height: 1.5;
}
.helper-guide .step-no {
    flex: 0 0 22px;
    height: 22px;
    border-radius: 50%;
    background: rgb(var(--v-theme-primary));
    color: #fff;
    font-size: 0.8em;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-top: 1px;
}
.helper-guide .guide-box:not(.guide-box--primary) .step-no {
    background: #757575;
}
.helper-guide .step-note {
    font-size: 0.85em;
    color: rgba(0, 0, 0, 0.6);
    margin-top: 2px;
}
</style>
