<script setup>
// 获取 Vue 实例
import {getCurrentInstance, onMounted, ref, computed} from "vue";
import {useMediaDbData} from '@/store.js'
import {onBeforeRouteUpdate, useRoute} from "vue-router";

const MediaDbData = useMediaDbData()
const route = useRoute()

const guid = ref(null);
const mode = computed({
  get: () => MediaDbData.sort_column,
  set: (value) => {
    MediaDbData.sort_column = value;
  }
});
const order = computed({
  get: () => MediaDbData.sort_type,
  set: (value) => {
    MediaDbData.sort_type = value;
  }
});
const size = ref(240);
const totalCount = ref(0);
const MediaDbInfo = ref(null);
const layoutMode = ref('official');
const category = ref(null);
const favoriteType = ref('all');
const isFavoritePage = computed(() => route.path === '/favorite')
const galleryTitle = computed(() => {
  if (isFavoritePage.value) {
    return '收藏'
  }
  if (category.value) {
    return categoryTitle(category.value)
  }
  return MediaDbData.list.find(item => item.guid === guid.value)?.title || '媒体库'
})

const listCountText = computed(() => {
  if (MediaDbInfo.value === null) {
    return '加载中'
  }
  const loaded = MediaDbInfo.value.length || 0
  const total = totalCount.value || loaded
  return `共 ${total} 项`
})

const sortModeLabel = computed(() => {
  return modes.find(item => item.value === mode.value)?.label || '添加日期'
})

const layoutClass = computed(() => {
  return `layout-${layoutMode.value}`
})


const instance = getCurrentInstance();
const proxy = instance.appContext.config.globalProperties;
const COMMON = proxy.$COMMON;
guid.value = route.query.gallery_uid
category.value = route.query.category || null
favoriteType.value = route.query.type || 'all'


const modes = [
  {
    value: 'sort_title',
    label: '标题'
  },
  {
    value: 'vote_average',
    label: '评分'
  },
  {
    value: 'release_date',
    label: '发行年份'
  },
  {
    value: 'create_time',
    label: '添加日期'
  }
]

const orders = [
  {
    value: "ASC",
    label: "升序"
  },
  {
    value: 'DESC',
    label: '降序'
  }
]

const layoutOptions = [
  {
    value: 'compact',
    label: '紧凑'
  },
  {
    value: 'official',
    label: '默认'
  },
  {
    value: 'large',
    label: '大卡片'
  }
]

const categoryTitleMap = {
  all: '全部',
  movie: '电影',
  tv: '电视节目',
  live: '电视直播',
  other: '其他'
}

const favoriteTabs = [
  {value: 'all', label: '全部'},
  {value: 'movie', label: '电影'},
  {value: 'tv', label: '电视节目'},
  {value: 'live', label: '电视直播'},
  {value: 'episode', label: '单集'},
  {value: 'person', label: '人物'}
]

function categoryTitle(value) {
  return categoryTitleMap[value] || '分类'
}

function categoryTypes(value) {
  if (value === 'movie') {
    return ['Movie']
  }
  if (value === 'tv') {
    return ['TV']
  }
  if (value === 'live') {
    return ['LiveChannel']
  }
  if (value === 'other') {
    return ['Directory', 'Video']
  }
  return ['Movie', 'TV', 'Directory', 'Video', 'LiveChannel']
}

function favoriteTypes(value) {
  if (value === 'movie') {
    return ['Movie']
  }
  if (value === 'tv') {
    return ['TV']
  }
  if (value === 'live') {
    return ['LiveChannel']
  }
  if (value === 'episode') {
    return ['Episode']
  }
  if (value === 'person') {
    return ['Person']
  }
  return []
}

function shouldExcludeGroupedVideo(value) {
  return ['all', 'other'].includes(value)
}

function formatRating(item) {
  const rating = Number(item?.vote_average)
  if (!Number.isFinite(rating) || rating <= 0) {
    return ''
  }
  return String(Math.floor(rating * 10) / 10)
}

function releaseYear(item) {
  const source = item?.release_date || item?.air_date || item?.year || item?.premiere_date || item?.create_time || ''
  const match = String(source).match(/\d{4}/)
  return match ? match[0] : ''
}

function displayTitle(item) {
  return item?.title || item?.name || item?.tv_title || item?.parent_title || ''
}

function posterUrl(item, width = 200) {
  const poster = item?.poster || item?.posters || ''
  if (!poster) {
    return '/images/not_video.jpg'
  }
  const prefix = poster.startsWith('/') ? '' : '/92/17/'
  return `${COMMON.imgUrl}${prefix}${poster}?w=${width}`
}

function normalizeGalleryType(value) {
  if (value === 'Episode' || value === 'Season' || value === 'season') {
    return 'season'
  }
  if (value === 'Movie') {
    return 'Movie'
  }
  if (value === 'TV') {
    return 'TV'
  }
  return value || 'Video'
}

function getItemRoute(item) {
  const type = item?.type || item?.gallery_type || item?.ancestor_category || 'Video'
  const itemGuid = type === 'Episode' ? (item?.parent_guid || item?.guid) : item?.guid
  return {
    path: '/video',
    query: {
      guid: itemGuid,
      gallery_type: normalizeGalleryType(type)
    }
  }
}

function itemActionGuid(item) {
  return item?.guid || item?.item_guid || ''
}

function isFavorite(item) {
  return Boolean(item?.is_favorite || item?.favorite)
}

function isWatched(item) {
  return Boolean(item?.played || item?.watched)
}

function notifyFavoriteUpdated() {
  window.dispatchEvent(new CustomEvent('fnos-tv:favorites-updated'))
}

function patchListItem(item, patch) {
  const guid = itemActionGuid(item)
  if (!guid) {
    return
  }
  Object.assign(item, patch)
  if (!Array.isArray(MediaDbInfo.value)) {
    return
  }
  for (const target of MediaDbInfo.value) {
    if (itemActionGuid(target) === guid) {
      Object.assign(target, patch)
    }
  }
}

async function toggleFavorite(event, item) {
  event.preventDefault()
  event.stopPropagation()
  const guid = itemActionGuid(item)
  if (!guid) {
    return
  }
  const next = !isFavorite(item)
  try {
    await COMMON.requests(next ? "PUT" : "DELETE", "/api/v1/item/favorite", true, {
      item_guid: guid
    })
    if (isFavoritePage.value && !next) {
      MediaDbInfo.value = (MediaDbInfo.value || []).filter(target => itemActionGuid(target) !== guid)
      totalCount.value = Math.max(0, Number(totalCount.value || 0) - 1)
    } else {
      patchListItem(item, {
        is_favorite: next ? 1 : 0,
        favorite: next ? 1 : 0
      })
    }
    notifyFavoriteUpdated()
    COMMON.ShowMsg(next ? '已收藏' : '已取消收藏')
  } catch (error) {
    COMMON.ShowMsg('收藏操作失败')
  }
}

async function toggleWatched(event, item) {
  event.preventDefault()
  event.stopPropagation()
  const guid = itemActionGuid(item)
  if (!guid) {
    return
  }
  const next = !isWatched(item)
  try {
    await COMMON.requests(next ? "POST" : "DELETE", "/api/v1/item/watched", true, {
      item_guid: guid
    })
    patchListItem(item, {
      played: next ? 1 : 0,
      watched: next ? 1 : 0
    })
    COMMON.ShowMsg(next ? '已标记为已观看' : '已标记为未观看')
  } catch (error) {
    COMMON.ShowMsg('观看状态更新失败')
  }
}

function favoriteTabRoute(item) {
  if (item.value === 'all') {
    return {
      path: '/favorite'
    }
  }
  return {
    path: '/favorite',
    query: {
      type: item.value
    }
  }
}

async function GetMediaDbInfos() {
  let api = isFavoritePage.value ? '/api/v1/favorite/list' : '/api/v1/item/list'

  let _data
  if (isFavoritePage.value) {
    _data = {
      "tags": {},
      "sort_type": MediaDbData.sort_type,
      "sort_column": MediaDbData.sort_column,
      "page": 1,
      "page_size": size.value
    }
    const types = favoriteTypes(favoriteType.value)
    if (types.length) {
      _data.tags.type = types
    }
  } else if (category.value) {
    _data = {
      "tags": {
        "type": categoryTypes(category.value)
      },
      "sort_type": MediaDbData.sort_type,
      "sort_column": MediaDbData.sort_column,
      "page": 1,
      "page_size": size.value
    }
    if (shouldExcludeGroupedVideo(category.value)) {
      _data.exclude_grouped_video = 1
    }
  } else {
    _data = {
      "ancestor_guid": guid.value,
      "tags": {
        "type": [
          "Movie",
          "TV",
          "Directory",
          "Video"
        ]
      },
      "exclude_grouped_video": 1,
      "sort_type": MediaDbData.sort_type,
      "sort_column": MediaDbData.sort_column,
      "page_size": size.value
    }
  }
  let res = await COMMON.requests("POST", api, true, _data);
  MediaDbInfo.value = Array.isArray(res?.list) ? res.list : []
  totalCount.value = Number(res.total || totalCount.value || MediaDbInfo.value.length || 0)

}

async function GetMediaDbCount() {
  if (isFavoritePage.value) {
    const data = {
      tags: {},
      sort_type: MediaDbData.sort_type,
      sort_column: MediaDbData.sort_column,
      page: 1,
      page_size: 1
    }
    const types = favoriteTypes(favoriteType.value)
    if (types.length) {
      data.tags.type = types
    }
    const res = await COMMON.requests("POST", '/api/v1/favorite/list', true, data);
    const count = Number(res?.total || 0)
    totalCount.value = Number.isFinite(count) ? count : 0
    if (totalCount.value > 0) {
      size.value = totalCount.value
    }
    return
  }
  let api = '/api/v1/mediadb/sum'
  const res = await COMMON.requests("GET", api, true);
  const countKey = category.value === 'all' ? 'total'
      : category.value === 'movie' ? 'movie'
          : category.value === 'tv' ? 'tv'
              : category.value === 'live' ? 'live'
                  : category.value === 'other' ? 'video'
                      : guid.value
  const count = Number(res?.[countKey] || 0)
  totalCount.value = Number.isFinite(count) ? count : 0
  if (totalCount.value > 0) {
    size.value = totalCount.value
  }
}

async function handleChange() {
  await GetMediaDbInfos();
}

async function setSortMode(value) {
  MediaDbData.sort_column = value
  await GetMediaDbInfos()
}

async function setSortOrder(value) {
  MediaDbData.sort_type = value
  await GetMediaDbInfos()
}

function setLayoutMode(value) {
  layoutMode.value = value
}

onBeforeRouteUpdate(async (to, from) => {
  guid.value = to.query.gallery_uid;
  category.value = to.query.category || null;
  favoriteType.value = to.query.type || 'all';
  // gallery_type.value = to.query.gallery_type;
  await GetMediaDbCount();
  await GetMediaDbInfos();
});

onMounted(async () => {
  // 获取每个分类的列表
  await GetMediaDbCount();
  await GetMediaDbInfos();

})
</script>

<template>

  <div class="content">
    <div class="list-title">{{ galleryTitle }}</div>
    <div v-if="isFavoritePage" class="favorite-tabs" role="tablist" aria-label="收藏分类">
      <router-link
          v-for="item in favoriteTabs"
          :key="item.value"
          class="favorite-tab"
          :class="{ active: favoriteType === item.value }"
          :to="favoriteTabRoute(item)"
      >
        {{ item.label }}
      </router-link>
    </div>
    <div class="list-toolbar">
      <div class="seriesTab-list">
        <div class="seriesTab-item">
          <div class="sort-menu">
            <input id="video-list-filter-toggle" class="sort-toggle" type="checkbox">
            <label class="toolbar-pill filter-pill" for="video-list-filter-toggle" aria-label="筛选">
              <span>筛选</span>
              <i class='bx bx-chevron-down'></i>
            </label>
            <div class="sort-popover filter-popover" role="dialog" aria-label="筛选">
              <div class="sort-popover-header">筛选</div>
              <div class="filter-empty">当前媒体库暂无可用筛选条件</div>
            </div>
          </div>
        </div>
        <div class="seriesTab-item">
          <div class="sort-menu">
            <input id="video-list-sort-toggle" class="sort-toggle" type="checkbox">
            <label class="toolbar-pill sort-pill" for="video-list-sort-toggle" aria-label="排序">
              <span>{{ sortModeLabel }}</span>
              <i class='bx bx-chevron-down'></i>
            </label>
            <div class="sort-popover" role="dialog" aria-label="排序">
              <div class="sort-popover-header">排序</div>
              <div class="sort-title">
                排序方式
              </div>
              <div class="sort-list">
                <label class="sort-item" v-for="item in modes" :key="item.value">
                  <input type="radio" name="sort-mode" :value="item.value" :checked="mode === item.value"
                         @change="setSortMode(item.value)">
                  <span>{{ item.label }}</span>
                </label>
              </div>
              <div class="sort-title">
                排序顺序
              </div>
              <div class="sort-list">
                <label class="sort-item" v-for="item in orders" :key="item.value">
                  <input type="radio" name="sort-order" :value="item.value" :checked="order === item.value"
                         @change="setSortOrder(item.value)">
                  <span>{{ item.label }}</span>
                </label>
              </div>
            </div>
          </div>
        </div>
        <div class="seriesTab-item">
          <div class="sort-menu">
            <input id="video-list-layout-toggle" class="sort-toggle" type="checkbox">
            <label class="toolbar-pill layout-pill" for="video-list-layout-toggle" aria-label="布局">
              <span>布局</span>
              <i class='bx bx-chevron-down'></i>
            </label>
            <div class="sort-popover layout-popover" role="dialog" aria-label="布局">
              <div class="sort-popover-header">布局</div>
              <div class="sort-list">
                <label class="sort-item" v-for="item in layoutOptions" :key="item.value">
                  <input type="radio" name="layout-mode" :value="item.value" :checked="layoutMode === item.value"
                         @change="setLayoutMode(item.value)">
                  <span>{{ item.label }}</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="list-total">{{ listCountText }}</div>
    </div>
    <div class="card-show-content view-card-list" :class="layoutClass">
      <div class="view-item" v-for="item in MediaDbInfo" :key="item.guid">
        <div class="poster-frame">
          <router-link class="poster-cover-link" :to="getItemRoute(item)">
            <div class="poster-inner">
              <img loading="lazy" class="carousel-img" v-lazy='posterUrl(item)'>
            </div>
          </router-link>
          <div class="view-item-header">
            <div class="view-item-tag-list">
              <div v-if="formatRating(item)" class="view-item-tag rating">{{ formatRating(item) }}</div>
              <div v-if="item.played" class="view-item-tag count">
                <i class='bx bx-check'></i>
              </div>
            </div>
          </div>
          <div class="card-action-row">
            <button
                type="button"
                class="card-action-button"
                :class="{ active: isWatched(item) }"
                :title="isWatched(item) ? '标记为未观看' : '标记为已观看'"
                :aria-label="isWatched(item) ? '标记为未观看' : '标记为已观看'"
                @click="toggleWatched($event, item)"
            >
              <i :class="isWatched(item) ? 'bx bxs-check-circle' : 'bx bx-check-circle'"></i>
            </button>
            <button
                type="button"
                class="card-action-button"
                :class="{ active: isFavorite(item) }"
                :title="isFavorite(item) ? '取消收藏' : '收藏'"
                :aria-label="isFavorite(item) ? '取消收藏' : '收藏'"
                @click="toggleFavorite($event, item)"
            >
              <i :class="isFavorite(item) ? 'bx bxs-heart' : 'bx bx-heart'"></i>
            </button>
          </div>
        </div>
        <router-link class="view-item-link" :to="getItemRoute(item)">
          <div class="view-item-title">
            {{ displayTitle(item) }}
          </div>
          <div class="view-item-year">{{ releaseYear(item) }}</div>
        </router-link>
      </div>
    </div>
  </div>
</template>

<style scoped>
.list-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 16px;
  min-height: 36px;
  margin-bottom: 24px;
}

.list-title {
  margin-top: -5px;
  margin-bottom: 25px;
  width: fit-content;
  max-width: 100%;
  color: var(--fn-text);
  font-size: 20px;
  font-weight: 500;
  line-height: 28px;
}

.favorite-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  margin: -8px 0 22px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.favorite-tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 72px;
  height: 36px;
  padding: 0 16px;
  color: var(--fn-muted);
  background: transparent;
  border-radius: 999px;
  box-sizing: border-box;
  font-size: 14px;
  line-height: 20px;
  white-space: nowrap;
}

.favorite-tab:hover {
  color: var(--fn-text);
  background: var(--fn-top-control);
}

.favorite-tab.active {
  color: var(--fn-blue);
  background: var(--fn-nav-active);
  font-weight: 500;
}

.list-total {
  display: flex;
  align-items: center;
  height: 36px;
  min-height: 36px;
  margin-left: auto;
  color: var(--fn-soft);
  font-size: 14px;
  line-height: 20px;
  white-space: nowrap;
}

.seriesTab-list {
  display: flex;
  align-items: center;
  gap: 16px;
}

.sort-menu {
  position: relative;
}

.sort-toggle {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.toolbar-pill {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 36px;
  padding: 0 14px;
  color: var(--fn-text);
  background: transparent;
  border: 1px solid var(--fn-border);
  border-radius: 999px;
  box-sizing: border-box;
  cursor: pointer;
  font-size: 14px;
  font-weight: 400;
  line-height: 20px;
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
}

.filter-pill {
  width: 86px;
}

.sort-pill {
  width: 133px;
}

.layout-pill {
  width: 77px;
}

.toolbar-pill i {
  color: var(--fn-muted);
  font-size: 16px;
}

.toolbar-pill:hover,
.sort-toggle:checked + .toolbar-pill {
  background: var(--fn-top-control);
  border-color: rgba(10, 132, 255, 0.2);
}

.sort-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  color: var(--fn-text);
  background: var(--fn-top-control);
  border: 1px solid var(--fn-border);
  border-radius: 50%;
  cursor: pointer;
  font-size: 18px;
  transition: background 0.18s ease, color 0.18s ease, border-color 0.18s ease;
}

.sort-trigger:hover,
.sort-toggle:checked + .sort-trigger {
  background: var(--fn-top-control-hover);
}

.sort-popover {
  position: absolute;
  top: 46px;
  right: 0;
  z-index: 30;
  width: 260px;
  padding: 16px;
  color: var(--fn-text);
  background: var(--fn-panel);
  border: 1px solid var(--fn-border);
  border-radius: 8px;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.18);
  text-align: left;
}

.filter-popover,
.layout-popover {
  width: 220px;
}

.sort-toggle:not(:checked) ~ .sort-popover {
  display: none;
}

.sort-popover-header {
  color: var(--fn-text);
  font-size: 16px;
  font-weight: 750;
}

.sort-title {
  color: var(--fn-text);
  font-size: 15px;
  font-weight: 700;
  margin-top: 12px;
  margin-bottom: 12px;
}

.sort-list .sort-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  margin-top: 4px;
  margin-bottom: 4px;
  color: var(--fn-text);
  cursor: pointer;
}

.sort-list input[type="radio"] {
  accent-color: var(--fn-blue);
}

.filter-empty {
  margin-top: 12px;
  color: var(--fn-soft);
  font-size: 14px;
  line-height: 1.5;
}

.view-card-list {
  --poster-card-width: 170px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(var(--poster-card-width), 1fr));
  grid-gap: 26px 20px;
  padding: 0;
}

.view-card-list.layout-compact {
  --poster-card-width: 150px;
  grid-gap: 22px 18px;
}

.view-card-list.layout-large {
  --poster-card-width: 200px;
  grid-gap: 30px 22px;
}

.view-item {
  text-align: center;
  position: relative;
  color: var(--fn-text);
  cursor: pointer;
}

.view-item-link {
  display: flex;
  width: 100%;
  flex-direction: column;
  align-items: center;
  color: inherit;
  text-decoration: none;
}

.poster-cover-link {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: block;
  color: inherit;
  text-decoration: none;
}

.poster-frame {
  position: relative;
  width: 100%;
  aspect-ratio: 2/3;
  margin-bottom: 8px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--fn-panel);
}

.poster-inner {
  position: absolute;
  top: 1px;
  right: 0;
  bottom: 0;
  left: 1px;
  border-radius: 8px;
  overflow: hidden;
}

.view-card-list img.carousel-img {
  width: 100%;
  height: 100%;
  border-radius: 8px;
  object-fit: cover;
  background: var(--fn-panel);
  transition: filter 0.18s ease;
}

.view-item-title {
  color: var(--fn-text);
  font-size: 15px;
  font-weight: 400;
  margin-top: 0;
  line-height: 23px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
  padding: 0;
  box-sizing: border-box;
}

.view-item-year {
  min-height: 18px;
  margin-top: 2px;
  color: var(--fn-soft);
  font-size: 13px;
  line-height: 18px;
}

.view-card-list .view-item {
  transition: none;
}

.view-card-list .view-item:hover img.carousel-img {
  filter: brightness(1.02);
}

.view-item-header {
  position: absolute;
  inset: 0;
  padding: 10px;
  z-index: 2;
  pointer-events: none;
  box-sizing: border-box;
}

.card-action-row {
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

.view-item:hover .card-action-row,
.view-item:focus-within .card-action-row {
  opacity: 1;
  pointer-events: auto;
  transform: translate(-50%, 0);
}

.card-action-button {
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

.card-action-button:hover {
  background: rgba(24, 25, 28, 0.76);
  transform: translateY(-1px);
}

.card-action-button.active {
  color: #fff;
  background: var(--fn-blue);
  border-color: rgba(255, 255, 255, 0.2);
}

.card-action-button i {
  font-size: 20px;
  line-height: 1;
}

.view-item-tag-list {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  min-height: 24px;
}

.view-item-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 40px;
  height: 24px;
  padding: 0;
  color: rgb(255, 150, 0);
  background: rgba(0, 0, 0, 0.6);
  border-radius: 6px;
  font-family: "DIN Alternate", "Arial Narrow", Arial, sans-serif;
  font-size: 16px;
  font-weight: 700;
  line-height: 24px;
}

.view-item-tag-list .count {
  margin-left: auto;
  background-color: var(--fn-blue) !important;
  border-radius: 50%;
  width: 22px;
  height: 22px;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
}

.rating {
  color: rgb(255, 150, 0);
}

/* 移动端适配 */
@media (max-width: 768px) {
  .view-card-list {
    grid-template-columns: repeat(auto-fill, minmax(118px, 1fr));
    grid-gap: 18px 12px;
  }

  .list-toolbar {
    padding-right: 0;
    flex-wrap: wrap;
  }

  .list-title {
    margin-bottom: 16px;
    font-size: 20px;
  }

  .favorite-tabs {
    margin-top: -4px;
    margin-bottom: 16px;
  }

  .list-total {
    width: 100%;
    margin-left: 0;
    line-height: 18px;
  }

  .seriesTab-list {
    gap: 8px;
    max-width: 100%;
    overflow-x: auto;
    padding-bottom: 2px;
  }

  .toolbar-pill {
    min-width: auto;
    padding: 0 14px;
    white-space: nowrap;
  }

  .view-item-title {
    font-size: 13px;
    line-height: 20px;
  }

  .view-item-header {
    padding: 6px;
  }

  .card-action-row {
    bottom: 10px;
    gap: 7px;
    opacity: 1;
    pointer-events: auto;
    transform: translate(-50%, 0);
  }

  .card-action-button {
    width: 32px;
    height: 32px;
  }

  .card-action-button i {
    font-size: 18px;
  }

  .view-item-tag {
    min-width: 34px;
    height: 20px;
    font-size: 13px;
    line-height: 20px;
  }

  .view-item-tag-list .count {
    width: 20px;
    height: 20px;
  }

  .sort-title {
    font-size: 14px;
    margin-top: 8px;
    margin-bottom: 8px;
  }

  .sort-list .sort-item {
    font-size: 1em;
  }

  .sort-popover {
    right: -8px;
    width: min(280px, calc(100vw - 32px));
  }
}

/* 小屏幕手机适配 */
@media (max-width: 375px) {
  .view-card-list {
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    grid-gap: 6px;
  }

  .view-item-title {
    font-size: 0.75em;
  }
}
</style>
