<script setup>
import {computed, getCurrentInstance, onMounted, ref, watch} from "vue";
import {useRoute, useRouter} from "vue-router";

const route = useRoute();
const router = useRouter();
const instance = getCurrentInstance();
const COMMON = instance.appContext.config.globalProperties.$COMMON;

const guid = ref(route.query.guid || route.query.id || '');
const person = ref({});
const works = ref([]);
const loading = ref(true);

const jobRequests = [
  {key: 'Actor', label: '演员'},
  {key: 'Director', label: '导演'},
  {key: 'Screenplay', label: '编剧'},
  {key: 'Producer', label: '制片'}
];

const personName = computed(() => person.value?.name || person.value?.title || '人物');
const personBio = computed(() => person.value?.biography || person.value?.overview || '');
const isFavorite = computed(() => Boolean(person.value?.is_favorite || person.value?.favorite));

const personMeta = computed(() => {
  const items = [];
  const department = person.value?.known_for_department || person.value?.department;
  if (department) {
    items.push(formatDepartment(department));
  }
  if (person.value?.birthday) {
    items.push(person.value.birthday);
  }
  if (person.value?.place_of_birth) {
    items.push(person.value.place_of_birth);
  }
  return items.filter(Boolean);
});

function responseList(res) {
  if (Array.isArray(res)) {
    return res;
  }
  if (Array.isArray(res?.list)) {
    return res.list;
  }
  if (Array.isArray(res?.data)) {
    return res.data;
  }
  if (Array.isArray(res?.data?.list)) {
    return res.data.list;
  }
  return [];
}

function profileUrl(width = 260) {
  const profile = person.value?.profile_path || person.value?.poster || '';
  return profile ? `${COMMON.imgUrl}/t/p/w220_and_h330_face/${String(profile).replace(/^\/+/, '')}?w=${width}` : '/images/not_person.jpg';
}

function posterUrl(item, width = 200) {
  const poster = item?.poster || item?.posters || '';
  if (!poster) {
    return '/images/not_video.jpg';
  }
  const prefix = poster.startsWith('/') ? '' : '/92/17/';
  return `${COMMON.imgUrl}${prefix}${poster}?w=${width}`;
}

function displayTitle(item) {
  return item?.title || item?.name || item?.tv_title || item?.parent_title || '';
}

function releaseYear(item) {
  const source = item?.release_date || item?.air_date || item?.year || item?.create_time || '';
  const match = String(source).match(/\d{4}/);
  return match ? match[0] : '';
}

function normalizeGalleryType(value) {
  if (value === 'Episode' || value === 'Season' || value === 'season') {
    return 'season';
  }
  if (value === 'Movie') {
    return 'Movie';
  }
  if (value === 'TV') {
    return 'TV';
  }
  return value || 'Video';
}

function getItemRoute(item) {
  const type = item?.type || item?.gallery_type || item?.ancestor_category || 'Video';
  const rawGuid = item?.guid || item?.item_guid;
  const itemGuid = type === 'Episode' ? (item?.parent_guid || rawGuid) : rawGuid;
  return {
    path: '/video',
    query: {
      guid: itemGuid,
      gallery_type: normalizeGalleryType(type)
    }
  };
}

function workKey(item, index) {
  return item?.guid || item?.item_guid || `${displayTitle(item)}-${index}`;
}

function formatDepartment(value) {
  const map = {
    Actor: '演员',
    Acting: '演员',
    Director: '导演',
    Directing: '导演',
    Screenplay: '编剧',
    Writer: '编剧',
    Writing: '编剧',
    Producer: '制片',
    Production: '制片'
  };
  return map[value] || value;
}

async function loadOfficialTags() {
  await Promise.allSettled([
    COMMON.requests("GET", "/api/v1/tag/iso6391?lan=zh-CN", true),
    COMMON.requests("GET", "/api/v1/tag/iso6392?lan=zh-CN", true),
    COMMON.requests("GET", "/api/v1/tag/iso3166?lan=zh-CN", true),
    COMMON.requests("GET", "/api/v1/tag/genres?lan=zh-CN", true)
  ]);
}

async function loadPerson() {
  if (!guid.value) {
    loading.value = false;
    return;
  }
  loading.value = true;
  const requestGuid = guid.value;
  await loadOfficialTags();
  const [personRes, ...workResults] = await Promise.allSettled([
    COMMON.requests("GET", `/api/v1/person/${requestGuid}`, true),
    ...jobRequests.map(job => COMMON.requests("POST", "/api/v1/person/item/list", true, {
      person_guid: requestGuid,
      page: 1,
      page_size: 200,
      job: job.key,
      sort_column: "update_time",
      sort_type: "desc"
    }))
  ]);
  if (requestGuid !== guid.value) {
    return;
  }
  if (personRes.status === 'fulfilled') {
    person.value = personRes.value || {};
  }
  const seen = new Set();
  const nextWorks = [];
  workResults.forEach((result, index) => {
    if (result.status !== 'fulfilled') {
      return;
    }
    const job = jobRequests[index];
    for (const item of responseList(result.value)) {
      const key = item?.guid || item?.item_guid;
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      nextWorks.push({
        ...item,
        person_job_label: job.label
      });
    }
  });
  works.value = nextWorks;
  loading.value = false;
}

function goBack() {
  if (window.history.length > 1) {
    router.back();
  } else {
    router.push('/');
  }
}

async function toggleFavorite() {
  if (!guid.value) {
    return;
  }
  const next = !isFavorite.value;
  try {
    await COMMON.requests(next ? "PUT" : "DELETE", "/api/v1/item/favorite", true, {
      item_guid: guid.value
    });
    person.value = {
      ...person.value,
      is_favorite: next ? 1 : 0,
      favorite: next ? 1 : 0
    };
    window.dispatchEvent(new CustomEvent('fnos-tv:favorites-updated'));
    COMMON.ShowMsg(next ? '已收藏' : '已取消收藏');
  } catch {
    COMMON.ShowMsg('收藏操作失败');
  }
}

onMounted(loadPerson);

watch(
    () => route.fullPath,
    async () => {
      guid.value = route.query.guid || route.query.id || '';
      person.value = {};
      works.value = [];
      await loadPerson();
    }
);
</script>

<template>
  <div class="content person-content">
    <button class="person-back" type="button" aria-label="返回" @click="goBack">
      <i class='bx bx-chevron-left'></i>
    </button>
    <div v-if="loading" class="person-loading">加载中...</div>
    <template v-else>
      <section class="person-hero">
        <img class="person-avatar-large" :src="profileUrl()" :alt="personName">
        <div class="person-main">
          <h1>{{ personName }}</h1>
          <div v-if="personMeta.length" class="person-meta">
            <span v-for="(item, index) in personMeta" :key="item">
              <span v-if="index > 0" class="person-separator">/</span>{{ item }}
            </span>
          </div>
          <button
              class="person-favorite"
              type="button"
              :class="{ active: isFavorite }"
              @click="toggleFavorite"
          >
            <i :class="isFavorite ? 'bx bxs-heart' : 'bx bx-heart'"></i>
            <span>{{ isFavorite ? '已收藏' : '收藏' }}</span>
          </button>
          <p v-if="personBio" class="person-bio">{{ personBio }}</p>
        </div>
      </section>

      <section class="person-section">
        <h2>相关作品</h2>
        <div v-if="works.length" class="person-work-grid">
          <router-link
              v-for="(item, index) in works"
              :key="workKey(item, index)"
              class="person-work-card"
              :to="getItemRoute(item)"
          >
            <div class="person-work-poster">
              <img loading="lazy" :src="posterUrl(item)" :alt="displayTitle(item)">
            </div>
            <div class="person-work-title">{{ displayTitle(item) }}</div>
            <div class="person-work-meta">{{ releaseYear(item) }} · {{ item.person_job_label }}</div>
          </router-link>
        </div>
        <div v-else class="person-empty">无相关作品</div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.person-content {
  position: relative;
}

.person-back {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  margin-bottom: 18px;
  padding: 0;
  color: var(--fn-text);
  background: var(--fn-top-control);
  border: 0;
  border-radius: 999px;
  cursor: pointer;
}

.person-back:hover {
  background: var(--fn-top-control-hover);
}

.person-back i {
  font-size: 25px;
  line-height: 1;
}

.person-loading,
.person-empty {
  color: var(--fn-soft);
  font-size: 14px;
}

.person-hero {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  gap: 30px;
  align-items: flex-start;
  max-width: 980px;
}

.person-avatar-large {
  width: 180px;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 999px;
  background: var(--fn-panel);
}

.person-main h1 {
  margin: 4px 0 10px;
  color: var(--fn-text);
  font-size: 32px;
  font-weight: 650;
  line-height: 1.2;
}

.person-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  color: var(--fn-muted);
  font-size: 14px;
  line-height: 22px;
}

.person-separator {
  margin-right: 6px;
  color: var(--fn-soft);
}

.person-favorite {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  margin-top: 18px;
  padding: 0 18px;
  color: var(--fn-text);
  background: var(--fn-top-control);
  border: 1px solid var(--fn-border);
  border-radius: 999px;
  cursor: pointer;
  font-size: 14px;
}

.person-favorite.active {
  color: #fff;
  background: var(--fn-blue);
  border-color: var(--fn-blue);
}

.person-favorite i {
  font-size: 18px;
}

.person-bio {
  max-width: 760px;
  margin-top: 18px;
  color: var(--fn-muted);
  font-size: 15px;
  line-height: 1.7;
}

.person-section {
  margin-top: 42px;
}

.person-section h2 {
  margin: 0 0 20px;
  color: var(--fn-text);
  font-size: 20px;
  font-weight: 600;
}

.person-work-grid {
  --work-card-width: 160px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(var(--work-card-width), 1fr));
  gap: 26px 20px;
}

.person-work-card {
  display: block;
  min-width: 0;
  color: var(--fn-text);
  text-align: center;
}

.person-work-poster {
  width: 100%;
  aspect-ratio: 2 / 3;
  overflow: hidden;
  border-radius: 8px;
  background: var(--fn-panel);
}

.person-work-poster img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.person-work-title {
  overflow: hidden;
  margin-top: 8px;
  color: var(--fn-text);
  font-size: 15px;
  line-height: 23px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.person-work-meta {
  min-height: 18px;
  margin-top: 2px;
  color: var(--fn-soft);
  font-size: 13px;
  line-height: 18px;
}

@media (max-width: 768px) {
  .person-hero {
    grid-template-columns: 112px minmax(0, 1fr);
    gap: 18px;
  }

  .person-avatar-large {
    width: 112px;
  }

  .person-main h1 {
    font-size: 24px;
  }

  .person-work-grid {
    --work-card-width: 118px;
    gap: 18px 12px;
  }
}
</style>
