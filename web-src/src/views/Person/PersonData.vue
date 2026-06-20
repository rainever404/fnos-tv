<script setup>
import {computed, getCurrentInstance, onMounted, ref, watch} from "vue";
import {useRoute} from "vue-router";

const route = useRoute();
const instance = getCurrentInstance();
const COMMON = instance.appContext.config.globalProperties.$COMMON;

const guid = ref(route.query.guid || route.query.id || '');
const person = ref({});
const workGroups = ref([]);
const loading = ref(true);

const jobRequests = [
  {key: 'Actor', label: '作为演员'},
  {key: 'Director', label: '作为导演'},
  {key: 'Screenplay', label: '作为编剧'},
  {key: 'Producer', label: '作为制片'}
];

const personName = computed(() => person.value?.name || person.value?.title || '人物');
const personBio = computed(() => person.value?.biography || person.value?.overview || '');
const isFavorite = computed(() => Boolean(person.value?.is_favorite || person.value?.favorite));
const hasWorkGroups = computed(() => workGroups.value.some(group => group.items.length > 0));

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

function profileUrl(width = 360) {
  const profile = person.value?.profile_path || person.value?.poster || '';
  return COMMON.profileImageUrl(profile, width);
}

function posterUrl(item, width = 240) {
  const poster = item?.poster || item?.posters || '';
  return COMMON.mediaImageUrl(poster, width);
}

function displayTitle(item) {
  return item?.title || item?.name || item?.tv_title || item?.parent_title || '';
}

function releaseYear(item) {
  const source = item?.release_date || item?.air_date || item?.year || item?.create_time || '';
  const match = String(source).match(/\d{4}/);
  return match ? match[0] : '';
}

function formatRating(item) {
  const rating = Number(item?.vote_average);
  if (!Number.isFinite(rating) || rating <= 0) {
    return '';
  }
  return rating.toFixed(1);
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
  const rawGuid = itemActionGuid(item);
  const itemGuid = type === 'Episode' ? (item?.parent_guid || rawGuid) : rawGuid;
  return {
    path: '/video',
    query: {
      guid: itemGuid,
      gallery_type: normalizeGalleryType(type)
    }
  };
}

function itemActionGuid(item) {
  return item?.guid || item?.item_guid || '';
}

function workKey(item, index) {
  return itemActionGuid(item) || `${displayTitle(item)}-${index}`;
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

function isItemFavorite(item) {
  return Boolean(item?.is_favorite || item?.favorite);
}

function isItemWatched(item) {
  return Boolean(item?.played || item?.watched);
}

function patchWorkItemsByGuid(guidValue, patch) {
  if (!guidValue) {
    return;
  }
  for (const group of workGroups.value) {
    for (const target of group.items) {
      if (itemActionGuid(target) === guidValue) {
        Object.assign(target, patch);
      }
    }
  }
}

function notifyFavoriteUpdated() {
  window.dispatchEvent(new CustomEvent('fnos-tv:favorites-updated'));
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
  workGroups.value = workResults.map((result, index) => {
    const job = jobRequests[index];
    const seen = new Set();
    const items = result.status === 'fulfilled'
        ? responseList(result.value).filter(item => {
          const key = itemActionGuid(item);
          if (!key || seen.has(key)) {
            return false;
          }
          seen.add(key);
          return true;
        })
        : [];
    return {
      key: job.key,
      label: job.label,
      items
    };
  }).filter(group => group.items.length > 0);
  loading.value = false;
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
    notifyFavoriteUpdated();
    COMMON.ShowMsg(next ? '已收藏' : '已取消收藏');
  } catch {
    COMMON.ShowMsg('收藏操作失败');
  }
}

async function toggleItemFavorite(event, item) {
  event.preventDefault();
  event.stopPropagation();
  const guidValue = itemActionGuid(item);
  if (!guidValue) {
    return;
  }
  const next = !isItemFavorite(item);
  try {
    await COMMON.requests(next ? "PUT" : "DELETE", "/api/v1/item/favorite", true, {
      item_guid: guidValue
    });
    patchWorkItemsByGuid(guidValue, {
      is_favorite: next ? 1 : 0,
      favorite: next ? 1 : 0
    });
    notifyFavoriteUpdated();
    COMMON.ShowMsg(next ? '已收藏' : '已取消收藏');
  } catch {
    COMMON.ShowMsg('收藏操作失败');
  }
}

async function toggleItemWatched(event, item) {
  event.preventDefault();
  event.stopPropagation();
  const guidValue = itemActionGuid(item);
  if (!guidValue) {
    return;
  }
  const next = !isItemWatched(item);
  try {
    await COMMON.requests(next ? "POST" : "DELETE", "/api/v1/item/watched", true, {
      item_guid: guidValue
    });
    patchWorkItemsByGuid(guidValue, {
      played: next ? 1 : 0,
      watched: next ? 1 : 0
    });
    COMMON.ShowMsg(next ? '已标记为已观看' : '已标记为未观看');
  } catch {
    COMMON.ShowMsg('观看状态更新失败');
  }
}

onMounted(loadPerson);

watch(
    () => route.fullPath,
    async () => {
      guid.value = route.query.guid || route.query.id || '';
      person.value = {};
      workGroups.value = [];
      await loadPerson();
    }
);
</script>

<template>
  <div class="content person-content">
    <div v-if="loading" class="person-loading">加载中...</div>
    <template v-else>
      <section class="person-hero">
        <div class="person-profile-frame">
          <img class="person-profile" :src="profileUrl()" :alt="personName">
        </div>
        <div class="person-main">
          <h1>{{ personName }}</h1>
          <div v-if="personMeta.length" class="person-meta">
            <span v-for="(item, index) in personMeta" :key="item">
              <span v-if="index > 0" class="person-separator">/</span>{{ item }}
            </span>
          </div>
          <p v-if="personBio" class="person-bio">{{ personBio }}</p>
          <div class="person-actions">
            <button
                class="person-action-button"
                type="button"
                :class="{ active: isFavorite }"
                :title="isFavorite ? '取消收藏' : '收藏'"
                :aria-label="isFavorite ? '取消收藏' : '收藏'"
                @click="toggleFavorite"
            >
              <i :class="isFavorite ? 'bx bxs-heart' : 'bx bx-heart'"></i>
            </button>
          </div>
        </div>
      </section>

      <template v-if="hasWorkGroups">
        <section
            v-for="group in workGroups"
            :key="group.key"
            class="person-section"
        >
          <h2>{{ group.label }}</h2>
          <div class="person-work-grid">
            <div
                v-for="(item, index) in group.items"
                :key="workKey(item, index)"
                class="person-work-card"
            >
              <div class="person-work-frame">
                <router-link class="person-work-cover" :to="getItemRoute(item)" :aria-label="displayTitle(item)">
                  <img loading="lazy" :src="posterUrl(item)" :alt="displayTitle(item)">
                </router-link>
                <div class="person-work-tags">
                  <span v-if="formatRating(item)" class="person-work-rating">{{ formatRating(item) }}</span>
                  <span v-if="isItemWatched(item)" class="person-work-watched">
                    <i class='bx bx-check'></i>
                  </span>
                </div>
                <div class="person-card-actions">
                  <button
                      type="button"
                      class="person-card-action"
                      :class="{ active: isItemWatched(item) }"
                      :title="isItemWatched(item) ? '标记为未观看' : '标记为已观看'"
                      :aria-label="isItemWatched(item) ? '标记为未观看' : '标记为已观看'"
                      @click="toggleItemWatched($event, item)"
                  >
                    <i :class="isItemWatched(item) ? 'bx bxs-check-circle' : 'bx bx-check-circle'"></i>
                  </button>
                  <button
                      type="button"
                      class="person-card-action"
                      :class="{ active: isItemFavorite(item) }"
                      :title="isItemFavorite(item) ? '取消收藏' : '收藏'"
                      :aria-label="isItemFavorite(item) ? '取消收藏' : '收藏'"
                      @click="toggleItemFavorite($event, item)"
                  >
                    <i :class="isItemFavorite(item) ? 'bx bxs-heart' : 'bx bx-heart'"></i>
                  </button>
                </div>
              </div>
              <router-link class="person-work-info" :to="getItemRoute(item)">
                <div class="person-work-title">{{ displayTitle(item) }}</div>
                <div class="person-work-year">{{ releaseYear(item) }}</div>
              </router-link>
            </div>
          </div>
        </section>
      </template>
      <div v-else class="person-empty">无相关作品</div>
    </template>
  </div>
</template>

<style scoped>
.person-content {
  color: var(--fn-text);
  padding-top: 80px;
}

.person-loading,
.person-empty {
  color: var(--fn-soft);
  font-size: 14px;
  line-height: 22px;
}

.person-hero {
  display: grid;
  grid-template-columns: 214px minmax(0, 1fr);
  gap: 36px;
  align-items: flex-start;
  width: 100%;
  min-height: 320px;
}

.person-profile-frame {
  width: 214px;
  height: 320px;
  overflow: hidden;
  background: var(--fn-panel);
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
}

.person-profile {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.person-main {
  min-width: 0;
  padding-top: 2px;
}

.person-main h1 {
  margin: 0 0 12px;
  color: var(--fn-text);
  font-size: 36px;
  font-weight: 650;
  line-height: 46px;
  letter-spacing: 0;
}

.person-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  color: var(--fn-muted);
  font-size: 15px;
  line-height: 23px;
}

.person-separator {
  margin-right: 6px;
  color: var(--fn-soft);
}

.person-bio {
  display: -webkit-box;
  max-width: 920px;
  margin-top: 16px;
  overflow: hidden;
  color: var(--fn-muted);
  font-size: 15px;
  line-height: 23px;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.person-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 24px;
}

.person-action-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 54px;
  height: 54px;
  padding: 0;
  color: var(--fn-text);
  background: var(--fn-top-control);
  border: 1px solid var(--fn-border);
  border-radius: 12px;
  box-sizing: border-box;
  cursor: pointer;
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease, transform 0.18s ease;
}

.person-action-button:hover {
  background: var(--fn-top-control-hover);
  transform: translateY(-1px);
}

.person-action-button.active {
  color: #fff;
  background: var(--fn-blue);
  border-color: var(--fn-blue);
}

.person-action-button i {
  font-size: 24px;
  line-height: 1;
}

.person-section {
  margin-top: 44px;
}

.person-section h2 {
  margin: 0 0 18px;
  color: var(--fn-text);
  font-size: 20px;
  font-weight: 600;
  line-height: 28px;
}

.person-work-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, 183px);
  gap: 30px 20px;
  justify-content: start;
}

.person-work-card {
  width: 183px;
  min-width: 0;
  color: var(--fn-text);
  text-align: center;
}

.person-work-frame {
  position: relative;
  width: 183px;
  aspect-ratio: 2 / 3;
  overflow: hidden;
  background: var(--fn-panel);
  border-radius: 8px;
}

.person-work-frame::after {
  content: "";
  position: absolute;
  inset: 45% 0 0;
  z-index: 2;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.34));
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.18s ease;
}

.person-work-card:hover .person-work-frame::after {
  opacity: 1;
}

.person-work-cover {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: block;
  color: inherit;
  text-decoration: none;
}

.person-work-cover img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: filter 0.18s ease;
}

.person-work-card:hover .person-work-cover img {
  filter: brightness(1.02);
}

.person-work-tags {
  position: absolute;
  top: 8px;
  right: 8px;
  left: 8px;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  pointer-events: none;
}

.person-work-rating {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 40px;
  height: 24px;
  color: rgb(255, 150, 0);
  background: rgba(0, 0, 0, 0.6);
  border-radius: 6px;
  font-family: "DIN Alternate", "Arial Narrow", Arial, sans-serif;
  font-size: 16px;
  font-weight: 700;
  line-height: 24px;
}

.person-work-watched {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  margin-left: auto;
  color: #fff;
  background: var(--fn-blue);
  border-radius: 50%;
}

.person-work-watched i {
  font-size: 17px;
  line-height: 1;
}

.person-card-actions {
  position: absolute;
  left: 50%;
  bottom: 13px;
  z-index: 4;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  opacity: 0;
  pointer-events: none;
  transform: translate(-50%, 8px);
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.person-work-card:hover .person-card-actions,
.person-work-card:focus-within .person-card-actions {
  opacity: 1;
  pointer-events: auto;
  transform: translate(-50%, 0);
}

.person-card-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  color: #fff;
  background: rgba(24, 25, 28, 0.58);
  border: 1px solid rgba(255, 255, 255, 0.24);
  border-radius: 999px;
  box-sizing: border-box;
  cursor: pointer;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  transition: background 0.16s ease, color 0.16s ease, transform 0.16s ease;
}

.person-card-action:hover {
  background: rgba(24, 25, 28, 0.76);
  transform: translateY(-1px);
}

.person-card-action.active {
  color: #fff;
  background: var(--fn-blue);
  border-color: rgba(255, 255, 255, 0.2);
}

.person-card-action i {
  font-size: 20px;
  line-height: 1;
}

.person-work-info {
  display: block;
  width: 100%;
  color: inherit;
  text-decoration: none;
}

.person-work-title {
  width: 100%;
  margin-top: 8px;
  overflow: hidden;
  color: var(--fn-text);
  font-size: 15px;
  font-weight: 400;
  line-height: 23px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.person-work-year {
  min-height: 18px;
  margin-top: 2px;
  color: var(--fn-soft);
  font-size: 13px;
  line-height: 18px;
}

@media (max-width: 768px) {
  .person-content {
    padding-top: 74px;
  }

  .person-hero {
    grid-template-columns: 112px minmax(0, 1fr);
    gap: 18px;
    min-height: 168px;
  }

  .person-profile-frame {
    width: 112px;
    height: 168px;
    border-radius: 8px;
  }

  .person-main h1 {
    margin-bottom: 8px;
    font-size: 24px;
    line-height: 32px;
  }

  .person-meta {
    font-size: 13px;
    line-height: 20px;
  }

  .person-bio {
    margin-top: 10px;
    font-size: 13px;
    line-height: 20px;
    -webkit-line-clamp: 4;
  }

  .person-actions {
    margin-top: 14px;
  }

  .person-action-button {
    width: 42px;
    height: 42px;
    border-radius: 10px;
  }

  .person-action-button i {
    font-size: 21px;
  }

  .person-section {
    margin-top: 32px;
  }

  .person-work-grid {
    grid-template-columns: repeat(auto-fill, minmax(118px, 1fr));
    gap: 20px 12px;
  }

  .person-work-card,
  .person-work-frame {
    width: 100%;
  }

  .person-card-actions {
    bottom: 10px;
    gap: 7px;
    opacity: 1;
    pointer-events: auto;
    transform: translate(-50%, 0);
  }

  .person-card-action {
    width: 32px;
    height: 32px;
  }

  .person-card-action i {
    font-size: 18px;
  }

  .person-work-title {
    font-size: 13px;
    line-height: 20px;
  }
}
</style>
