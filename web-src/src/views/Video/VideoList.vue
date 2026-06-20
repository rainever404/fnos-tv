<script setup>
// 获取 Vue 实例
import {getCurrentInstance, onMounted, ref, computed, watch} from "vue";
import {useMediaDbData} from '@/store.js'
import {useRoute} from "vue-router";

const MediaDbData = useMediaDbData()
const route = useRoute()

const DEFAULT_PAGE_SIZE = 240;
const FAVORITE_PAGE_SIZE = 50;
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
const size = ref(DEFAULT_PAGE_SIZE);
const totalCount = ref(0);
const MediaDbInfo = ref(null);
const layoutMode = ref('official');
const category = ref(null);
const favoriteType = ref('all');
let listRequestId = 0;
const filterOptionsLoaded = ref(false);
const officialGenreOptions = ref([]);
const officialCountryOptions = ref([]);
const filters = ref({
  genres: '',
  locate: '',
  decade: '',
  resolution: '',
  watched: ''
});

function isRouteFavorite(targetRoute = route) {
  return targetRoute.path === '/favorite'
}

const isFavoritePage = computed(() => isRouteFavorite(route))
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
  return pageSortModes.value.find(item => item.value === mode.value)?.label || (isFavoritePage.value ? '收藏时间' : '添加日期')
})

const layoutClass = computed(() => {
  return `layout-${layoutMode.value}`
})

const pageSortModes = computed(() => modes.map(item => {
  if (isFavoritePage.value && item.value === 'create_time') {
    return {...item, label: '收藏时间'}
  }
  return item
}))

const activeFilterCount = computed(() => {
  return Object.values(filters.value).filter(Boolean).length
})

const filterLabel = computed(() => {
  return activeFilterCount.value > 0 ? `筛选 ${activeFilterCount.value}` : '筛选'
})


const instance = getCurrentInstance();
const proxy = instance.appContext.config.globalProperties;
const COMMON = proxy.$COMMON;
applyRouteState(route, {resetList: false})


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

const fallbackGenreOptions = [
  {label: '冒险', value: 12},
  {label: '剧情', value: 18},
  {label: '动作', value: 1},
  {label: '动画', value: 16},
  {label: '喜剧', value: 35},
  {label: '家庭', value: 10751},
  {label: '悬疑', value: 9648},
  {label: '犯罪', value: 80},
  {label: '纪录', value: 99},
  {label: '科幻奇幻', value: 878},
  {label: '历史', value: 36},
  {label: '恐怖', value: 27},
  {label: '惊悚', value: 53},
  {label: '爱情', value: 10749},
  {label: '音乐', value: 10402},
  {label: '战争与政治', value: 10752}
]

const fallbackCountryOptions = [
  {label: '美国', value: 'US'},
  {label: '中国大陆', value: 'CN'},
  {label: '日本', value: 'JP'},
  {label: '韩国', value: 'KR'},
  {label: '法国', value: 'FR'},
  {label: '英国', value: 'GB'},
  {label: '中国香港', value: 'HK'},
  {label: '中国台湾', value: 'TW'},
  {label: '俄罗斯', value: 'RU'},
  {label: '印度', value: 'IN'},
  {label: '加拿大', value: 'CA'},
  {label: '澳大利亚', value: 'AU'},
  {label: '意大利', value: 'IT'},
  {label: '泰国', value: 'TH'}
]

const decadeOptions = [
  {label: '2020年代', value: '2020s'},
  {label: '2010年代', value: '2010s'},
  {label: '2000年代', value: '2000s'},
  {label: '1990年代', value: '1990s'},
  {label: '1980年代', value: '1980s'},
  {label: '1970年代', value: '1970s'},
  {label: '其他', value: 'other'}
]

const resolutionOptions = [
  {label: '4k', value: '4k'},
  {label: '1080P', value: '1080p'},
  {label: '720P', value: '720p'},
  {label: '480P', value: '480p'},
  {label: '其他', value: 'other'}
]

const watchedOptions = [
  {label: '已观看', value: '1'},
  {label: '未观看', value: '0'}
]

const filterRows = computed(() => [
  {key: 'genres', label: '类型', options: officialGenreOptions.value.length ? officialGenreOptions.value : fallbackGenreOptions},
  {key: 'resolution', label: '分辨率', options: resolutionOptions},
  {key: 'locate', label: '国家/地区', options: officialCountryOptions.value.length ? officialCountryOptions.value : fallbackCountryOptions},
  {key: 'decade', label: '发行年份', options: decadeOptions},
  {key: 'watched', label: '是否已观看', options: watchedOptions}
])

function applyRouteState(targetRoute = route, {resetList = true} = {}) {
  guid.value = targetRoute.query.gallery_uid || null
  category.value = targetRoute.query.category || null
  favoriteType.value = targetRoute.query.type || 'all'
  size.value = isRouteFavorite(targetRoute) ? FAVORITE_PAGE_SIZE : DEFAULT_PAGE_SIZE
  if (resetList) {
    MediaDbInfo.value = null
    totalCount.value = 0
  }
}

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

function responseList(res) {
  if (Array.isArray(res)) {
    return res
  }
  if (Array.isArray(res?.list)) {
    return res.list
  }
  if (Array.isArray(res?.data)) {
    return res.data
  }
  if (Array.isArray(res?.data?.list)) {
    return res.data.list
  }
  if (res && typeof res === 'object') {
    return Object.values(res).filter(item => item && typeof item === 'object')
  }
  return []
}

function pickOptionValue(item, keys) {
  for (const key of keys) {
    const value = item?.[key]
    if (value !== undefined && value !== null && value !== '') {
      return value
    }
  }
  return ''
}

function normalizeFilterOptions(res, valueKeys) {
  return responseList(res).map(item => {
    const label = pickOptionValue(item, ['name', 'title', 'label', 'zh', 'cn', 'text'])
    const value = pickOptionValue(item, valueKeys)
    return label && value !== '' ? {label: String(label), value} : null
  }).filter(Boolean)
}

async function loadOfficialFilterOptions() {
  if (filterOptionsLoaded.value) {
    return
  }
  filterOptionsLoaded.value = true
  const [genresRes, countriesRes] = await Promise.allSettled([
    COMMON.requests("GET", '/api/v1/tag/genres?lan=zh-CN', true),
    COMMON.requests("GET", '/api/v1/tag/iso3166?lan=zh-CN', true)
  ])
  if (genresRes.status === 'fulfilled') {
    const options = normalizeFilterOptions(genresRes.value, ['id', 'value', 'guid', 'key'])
    if (options.length) {
      officialGenreOptions.value = options
    }
  }
  if (countriesRes.status === 'fulfilled') {
    const options = normalizeFilterOptions(countriesRes.value, ['iso_3166_1', 'code', 'value', 'id', 'key'])
    if (options.length) {
      officialCountryOptions.value = options
    }
  }
}

function hasActiveFilters() {
  return activeFilterCount.value > 0
}

function applyActiveFilters(tags) {
  if (filters.value.genres) {
    tags.genres = filters.value.genres
  }
  if (filters.value.locate) {
    tags.locate = filters.value.locate
  }
  if (filters.value.decade) {
    tags.decade = filters.value.decade
  }
  if (filters.value.resolution) {
    tags.resolution = filters.value.resolution
  }
  if (filters.value.watched) {
    tags.watched = filters.value.watched
  }
  return tags
}

async function setFilter(key, value) {
  filters.value = {
    ...filters.value,
    [key]: value
  }
  await reloadMediaList()
}

async function clearFilter(key) {
  await setFilter(key, '')
}

async function clearAllFilters() {
  filters.value = {
    genres: '',
    locate: '',
    decade: '',
    resolution: '',
    watched: ''
  }
  await reloadMediaList()
}

function formatRating(item) {
  const rating = Number(item?.vote_average)
  if (!Number.isFinite(rating) || rating <= 0) {
    return ''
  }
  return rating.toFixed(1)
}

function resolutionTags(item) {
  const raw = item?.media_stream?.resolutions || item?.media_stream?.resolution || item?.resolution || []
  const values = Array.isArray(raw) ? raw : [raw]
  const seen = new Set()
  const tags = []
  for (const value of values) {
    const label = normalizeResolutionLabel(value)
    if (!label || seen.has(label)) {
      continue
    }
    seen.add(label)
    tags.push(label)
    if (tags.length >= 2) {
      break
    }
  }
  return tags
}

function normalizeResolutionLabel(value) {
  if (value === undefined || value === null) {
    return ''
  }
  const text = String(value).trim()
  if (!text || text.toLowerCase() === 'others') {
    return ''
  }
  if (/^4k$/i.test(text)) {
    return '4K'
  }
  const match = text.match(/(\d{3,4})\s*p/i)
  if (match) {
    return `${match[1]}P`
  }
  return text.toUpperCase()
}

function releaseYear(item) {
  if (isPerson(item)) {
    const count = item?.known_for_item_count || item?.item_count || item?.work_count
    return count ? `${count} 个作品` : '人物'
  }
  const source = item?.release_date || item?.air_date || item?.year || item?.premiere_date || item?.create_time || ''
  const match = String(source).match(/\d{4}/)
  return match ? match[0] : ''
}

function displayTitle(item) {
  return item?.title || item?.name || item?.tv_title || item?.parent_title || ''
}

function posterUrl(item, width = 200) {
  if (isPerson(item)) {
    const profile = item?.profile_path || item?.avatar || item?.poster || ''
    return COMMON.profileImageUrl(profile, width)
  }
  const poster = item?.poster || item?.posters || ''
  return COMMON.mediaImageUrl(poster, width)
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
  if (type === 'Person') {
    return {
      path: '/person',
      query: {
        guid: item?.guid || item?.item_guid
      }
    }
  }
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

function isPerson(item) {
  return (item?.type || item?.gallery_type || item?.ancestor_category) === 'Person'
}

function canMarkWatched(item) {
  return !isPerson(item)
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

async function GetFavoriteOfficialBootstrap() {
  if (!isFavoritePage.value) {
    return
  }
  const types = favoriteTypes(favoriteType.value)
  const params = new URLSearchParams({
    is_favorite: '1'
  })
  if (types.length === 1) {
    params.set('type', types[0])
  }
  await Promise.allSettled([
    COMMON.requests("GET", `/api/v1/tag/list?${params.toString()}`, true),
    COMMON.requests("POST", '/api/v1/user/getData', true, {
      key: `favorite:list:setting:${favoriteType.value}`
    }),
    COMMON.requests("POST", '/api/v1/user/getData', true, {
      key: 'list:card:setting'
    })
  ])
}

async function GetMediaDbInfos(requestId = listRequestId) {
  let api = isFavoritePage.value ? '/api/v1/favorite/list' : '/api/v1/item/list'

  let _data
  if (isFavoritePage.value) {
    _data = {
      "tags": {},
      "sort_type": MediaDbData.sort_type,
      "sort_column": MediaDbData.sort_column,
      "page": 1,
      "page_size": FAVORITE_PAGE_SIZE
    }
    const types = favoriteTypes(favoriteType.value)
    if (types.length) {
      _data.tags.type = types
    }
    applyActiveFilters(_data.tags)
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
    applyActiveFilters(_data.tags)
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
    applyActiveFilters(_data.tags)
  }
  let res = await COMMON.requests("POST", api, true, _data);
  if (requestId !== listRequestId) {
    return
  }
  MediaDbInfo.value = Array.isArray(res?.list) ? res.list : []
  totalCount.value = Number(res.total || totalCount.value || MediaDbInfo.value.length || 0)

}

async function GetMediaDbCount(requestId = listRequestId) {
  if (isFavoritePage.value) {
    totalCount.value = 0
    return
  }
  if (hasActiveFilters()) {
    totalCount.value = 0
    return
  }
  let api = '/api/v1/mediadb/sum'
  const res = await COMMON.requests("GET", api, true);
  if (requestId !== listRequestId) {
    return
  }
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

async function reloadMediaList({resetRouteState = false} = {}) {
  const requestId = ++listRequestId
  if (resetRouteState) {
    applyRouteState(route)
  }
  await loadOfficialFilterOptions()
  await GetFavoriteOfficialBootstrap()
  if (requestId !== listRequestId) {
    return
  }
  await GetMediaDbCount(requestId);
  if (requestId !== listRequestId) {
    return
  }
  await GetMediaDbInfos(requestId);
}

async function handleChange() {
  await reloadMediaList();
}

async function setSortMode(value) {
  MediaDbData.sort_column = value
  await reloadMediaList()
}

async function setSortOrder(value) {
  MediaDbData.sort_type = value
  await reloadMediaList()
}

function setLayoutMode(value) {
  layoutMode.value = value
}

onMounted(async () => {
  // 获取每个分类的列表
  await reloadMediaList();

})

watch(
    () => route.fullPath,
    async () => {
      await reloadMediaList({resetRouteState: true})
    }
)
</script>

<template>

  <div class="content" :class="{ 'favorite-content': isFavoritePage }">
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
              <span>{{ filterLabel }}</span>
              <i class='bx bx-chevron-down'></i>
            </label>
            <div class="sort-popover filter-popover" role="dialog" aria-label="筛选">
              <div class="filter-row" v-for="row in filterRows" :key="row.key">
                <div class="filter-row-title">{{ row.label }}</div>
                <div class="filter-options">
                  <button
                      type="button"
                      class="filter-option"
                      :class="{ active: !filters[row.key] }"
                      @click="clearFilter(row.key)"
                  >
                    全部
                  </button>
                  <button
                      v-for="item in row.options"
                      :key="`${row.key}-${item.value}`"
                      type="button"
                      class="filter-option"
                      :class="{ active: filters[row.key] === item.value }"
                      @click="setFilter(row.key, item.value)"
                  >
                    {{ item.label }}
                  </button>
                </div>
              </div>
              <div class="filter-actions" v-if="activeFilterCount > 0">
                <button type="button" class="filter-reset" @click="clearAllFilters">重置筛选</button>
              </div>
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
                <label class="sort-item" v-for="item in pageSortModes" :key="item.value">
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
        <div v-if="!isFavoritePage" class="seriesTab-item">
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
        <div class="poster-frame" :class="{ 'person-poster-frame': isPerson(item) }">
          <router-link class="poster-cover-link" :to="getItemRoute(item)">
            <div class="poster-inner">
              <img loading="lazy" class="carousel-img" v-lazy='posterUrl(item)'>
            </div>
          </router-link>
          <div class="view-item-header">
            <div class="view-item-tag-list">
              <div v-if="formatRating(item)" class="view-item-tag rating">{{ formatRating(item) }}</div>
              <div class="view-item-tag-right">
                <div
                    v-for="tag in resolutionTags(item)"
                    :key="`${item.guid}-resolution-${tag}`"
                    class="view-item-tag resolution"
                >
                  {{ tag }}
                </div>
                <div v-if="isWatched(item)" class="view-item-tag count">
                  <i class='bx bx-check'></i>
                </div>
              </div>
            </div>
          </div>
          <div class="card-action-row">
            <button
                v-if="canMarkWatched(item)"
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
  gap: 30px;
  max-width: 100%;
  margin: -8px 0 22px;
  overflow-x: auto;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--fn-border);
}

.favorite-tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  min-width: 0;
  height: 28px;
  padding: 0;
  color: var(--fn-muted);
  background: transparent;
  border-radius: 0;
  box-sizing: border-box;
  font-size: 14px;
  line-height: 20px;
  white-space: nowrap;
}

.favorite-tab:hover {
  color: var(--fn-text);
}

.favorite-tab.active {
  color: var(--fn-blue);
  font-weight: 500;
}

.favorite-tab.active::after {
  position: absolute;
  right: 0;
  bottom: -15px;
  left: 0;
  height: 2px;
  background: var(--fn-blue);
  border-radius: 999px;
  content: "";
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

.layout-popover {
  width: 220px;
}

.filter-popover {
  left: 0;
  right: auto;
  width: min(980px, calc(100vw - 340px));
  max-height: 360px;
  overflow: auto;
  padding: 20px 22px;
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

.filter-row {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 12px;
}

.filter-row:last-child {
  margin-bottom: 0;
}

.filter-row-title {
  flex: 0 0 84px;
  color: var(--fn-soft);
  font-size: 14px;
  line-height: 24px;
}

.filter-options {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.filter-option,
.filter-reset {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 24px;
  padding: 2px 12px;
  color: var(--fn-muted);
  background: transparent;
  border: 0;
  border-radius: 999px;
  cursor: pointer;
  font-size: 14px;
  line-height: 20px;
  white-space: nowrap;
}

.filter-option:hover,
.filter-reset:hover {
  color: var(--fn-text);
  background: var(--fn-top-control);
}

.filter-option.active {
  color: var(--fn-blue);
  font-weight: 600;
}

.filter-actions {
  display: flex;
  justify-content: flex-end;
  padding-top: 4px;
}

.filter-reset {
  color: var(--fn-blue);
}

.view-card-list {
  --poster-card-width: 170px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(var(--poster-card-width), 1fr));
  grid-gap: 26px 20px;
  padding: 0;
}

.favorite-content .view-card-list {
  --poster-card-width: 165px;
  grid-template-columns: repeat(auto-fill, var(--poster-card-width));
  justify-content: start;
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

.poster-frame.person-poster-frame {
  aspect-ratio: 1;
  border-radius: 999px;
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

.person-poster-frame .poster-inner,
.person-poster-frame img.carousel-img {
  border-radius: 999px;
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

.view-item-tag-right {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
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

.view-item-tag.resolution {
  min-width: auto;
  height: 22px;
  padding: 0 6px;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  line-height: 22px;
  letter-spacing: 0;
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

.view-item-tag-right .count {
  margin-left: 0;
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
    right: 8px;
    bottom: 10px;
    left: auto;
    gap: 7px;
    opacity: 1;
    pointer-events: auto;
    transform: none;
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

  .filter-popover {
    left: 0;
    right: auto;
    width: min(680px, calc(100vw - 32px));
    max-height: 60vh;
  }

  .filter-row {
    flex-direction: column;
    gap: 6px;
    margin-bottom: 14px;
  }

  .filter-row-title {
    flex: none;
    line-height: 20px;
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
