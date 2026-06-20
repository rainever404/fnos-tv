<script setup>
import {computed, getCurrentInstance, nextTick, onMounted, onUnmounted, ref, watch} from 'vue'
import VueCookies from 'vue-cookies';
import {darkTheme} from "naive-ui";

import {useMediaDbData} from './store.js'
import {useRoute, useRouter} from "vue-router";

const MediaDbData = useMediaDbData()

// 获取 Vue 实例
const instance = getCurrentInstance();
const COMMON = instance.appContext.config.globalProperties.$COMMON;
let UserInfo = ref({})
let load = ref(true)
let title = COMMON.title === 'FnTv' ? '飞牛影视' : COMMON.title
let collapsed = ref(false);
const data = ref(null)
const MediaDbSum = ref({})
const MediaDbInfo = ref({})
const ConfigData = ref({})
const HOME_SHELF_PAGE_SIZE = 22
const route = useRoute();
const router = useRouter();
const systemThemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
const systemDark = ref(systemThemeQuery.matches);
const legacyDark = VueCookies.get("dark");
const themeMode = ref(VueCookies.get("theme_mode") || (legacyDark === "true" ? "dark" : legacyDark === "false" ? "light" : "dark"));
const dark = computed(() => themeMode.value === "dark" || (themeMode.value === "system" && systemDark.value));
const theme = computed(() => dark.value ? darkTheme : null);
const detailRouteNames = new Set(['VideoData', 'MovieData', 'PersonData'])
const mediaDetailRouteNames = new Set(['VideoData', 'MovieData'])
const isDetailPage = computed(() => mediaDetailRouteNames.has(route.name));
const hasDetailBackButton = computed(() => detailRouteNames.has(route.name));
const searchOpen = ref(false);
const searchKeyword = ref('');
const searchResults = ref([]);
const searchActiveTab = ref('all');
const searchLoading = ref(false);
const searchInputRef = ref(null);
const favoriteCount = ref(0);
let searchTimer = null;
let searchRequestId = 0;
const options = ref([
  {
    label: '注销登录',
    key: "out"
  },
])
const themeOptions = ref([
  {
    label: '跟随系统',
    key: 'system'
  },
  {
    label: '浅色',
    key: 'light'
  },
  {
    label: '深色',
    key: 'dark'
  }
])
const settingsOptions = ref([
  {
    label: '跟随系统',
    key: 'system'
  },
  {
    label: '浅色模式',
    key: 'light'
  },
  {
    label: '深色模式',
    key: 'dark'
  }
])

const allLibraryItems = computed(() => {
  return (MediaDbData.list || []).filter(item => item.category !== 'Others')
})

const otherLibrary = computed(() => {
  return (MediaDbData.list || []).find(item => item.category === 'Others')
})

const mediaTotalCount = computed(() => {
  return (MediaDbData.list || []).reduce((sum, library) => {
    const count = Number(MediaDbSum.value?.[library.guid] || 0)
    return sum + (Number.isFinite(count) ? count : 0)
  }, 0)
})

const flattenedMediaItems = computed(() => {
  const items = []
  const seen = new Set()
  for (const library of MediaDbData.list || []) {
    const source = MediaDbData.info?.[library.guid]?.list || []
    for (const item of source) {
      if (!item?.guid || seen.has(item.guid)) {
        continue
      }
      seen.add(item.guid)
      items.push({
        ...item,
        library_title: library.title,
        library_category: library.category
      })
    }
  }
  return items
})

const categoryNavItems = computed(() => {
  return [
    {
      label: '全部',
      icon: 'bx bx-grid-alt',
      count: sumCount('total', mediaTotalCount.value),
      category: 'all',
      to: {
        path: '/list/all'
      }
    },
    {
      label: '电影',
      icon: 'bx bx-film',
      count: sumCount('movie'),
      category: 'movie',
      to: {
        path: '/list/movie'
      }
    },
    {
      label: '电视节目',
      icon: 'bx bx-tv',
      count: sumCount('tv'),
      category: 'tv',
      to: {
        path: '/list/tv'
      }
    },
    {
      label: '电视直播',
      icon: 'bx bx-desktop',
      count: sumCount('live'),
      category: 'live',
      to: {
        path: '/list/live'
      }
    },
    {
      label: '其他',
      icon: 'bx bx-folder',
      count: sumCount('video'),
      category: 'other',
      to: {
        path: '/list/other'
      }
    }
  ]
})

const searchTabOptions = computed(() => {
  const tabs = [
    {key: 'all', label: '全部'},
    {key: 'movie', label: '电影'},
    {key: 'tv', label: '电视节目'},
    {key: 'live', label: '电视直播'},
    {key: 'person', label: '人物'},
    {key: 'other', label: '其他'}
  ]
  return tabs.map(tab => ({
    ...tab,
    count: searchResults.value.filter(item => tab.key === 'all' || searchCategory(item) === tab.key).length
  }))
})

const visibleSearchResults = computed(() => {
  if (searchActiveTab.value === 'all') {
    return searchResults.value
  }
  return searchResults.value.filter(item => searchCategory(item) === searchActiveTab.value)
})

if (COMMON.isMo) {
  collapsed.value = true;
}
const collapsedItem = VueCookies.get("collapsed");
if (collapsedItem === "true") {
  collapsed.value = true;
}

systemThemeQuery.addEventListener('change', event => {
  systemDark.value = event.matches;
});

// 添加移动端检测
const isMobile = ref(window.innerWidth <= 768);
const mobileSiderOpen = computed(() => isMobile.value && !collapsed.value);

function handleWindowResize() {
  const nextIsMobile = window.innerWidth <= 768;
  isMobile.value = nextIsMobile;
  if (nextIsMobile) {
    collapsed.value = true;
  }
}

function handleGlobalKeydown(event) {
  if (event.key === 'Escape' && mobileSiderOpen.value) {
    closeMobileSider()
  }
}

// 获取用户信息
async function GetUserInfo() {
  if (VueCookies.get('authorization') !== null) {
    let api = '/api/v1/user/info'
    UserInfo.value = await COMMON.requests("GET", api, true);
  }
  load.value = false;
}

async function getConfig() {
  let api = '/api/v1/sys/config'
  ConfigData.value = await COMMON.requests("GET", api);
  if (ConfigData.value !== undefined) {
    localStorage.setItem("title", ConfigData.value.server_name)
  }
}

async function GetMediaDbList() {
  let api = '/api/v1/mediadb/list'
  data.value = await COMMON.requests("GET", api, true);
  MediaDbData.list = data.value
}

async function GetMediaDbSum() {
  let api = '/api/v1/mediadb/sum'
  MediaDbSum.value = await COMMON.requests("GET", api, true);
}

async function GetFavoriteSummary() {
  if (VueCookies.get('authorization') === null) {
    favoriteCount.value = 0
    return
  }
  try {
    const res = await COMMON.requests("POST", '/api/v1/favorite/list', true, {
      tags: {},
      sort_type: 'DESC',
      sort_column: 'create_time',
      page: 1,
      page_size: 1
    })
    favoriteCount.value = Number(res?.total || 0)
  } catch {
    favoriteCount.value = 0
  }
}

function handleFavoriteUpdated() {
  GetFavoriteSummary()
}

function isCurrentPath(path) {
  return route.path === path || window.location.pathname === path
}

async function GetOfficialBootstrapData() {
  if (isCurrentPath('/login') || VueCookies.get('authorization') === null) {
    return
  }

  const includeHomeData = !isCurrentPath('/player')
  const getApis = [
    '/api/v1/sys/version',
    '/api/v1/server/info',
    '/api/v1/tag/iso6391?lan=zh-CN',
    '/api/v1/tag/iso6392?lan=zh-CN',
    '/api/v1/tag/iso3166?lan=zh-CN',
    '/api/v1/tag/genres?lan=zh-CN',
    '/api/v1/server/getAppAuthorizedDir'
  ]
  if (includeHomeData) {
    getApis.push('/api/v1/task/running')
  }
  const tasks = getApis.map(api => COMMON.requests("GET", api, true))
  if (includeHomeData) {
    tasks.push(COMMON.requests("POST", '/api/v1/user/getData', true, {
      key: 'list:card:setting'
    }))
  }
  await Promise.allSettled(tasks)
}

async function GetMediaDbInfos() {
  let api = '/api/v1/item/list'

  if (Array.isArray(data.value)) {
    for (let _d of data.value) {
      let guid = _d.guid;
      let _data = {
        "ancestor_guid": guid,
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
        "page_size": HOME_SHELF_PAGE_SIZE
      }
      let res = await COMMON.requests("POST", api, true, _data);
      MediaDbInfo.value[guid] = res
      MediaDbData.info[guid] = res
    }
  }


}


const reF = async () => {
  await onMountedFun();
};


// 修改 toggDrawer 函数
function toggDrawer() {
  if (isMobile.value) {
    collapsed.value = !collapsed.value;
  } else {
    collapsed.value = !collapsed.value;
    VueCookies.set("collapsed", collapsed.value);
  }
}

function closeMobileSider() {
  if (isMobile.value) {
    collapsed.value = true;
  }
}

function Home() {
  router.push({
    path: "/",
  })
  closeMobileSider()
}

function goBack() {
  Home()
}

function normalizeGalleryType(value) {
  if (value === 'season' || value === 'Episode' || value === 'TV') {
    return 'TV'
  }
  if (value === 'Movie') {
    return 'Movie'
  }
  return value
}

function isMediaDetailRoute(targetRoute = route) {
  return mediaDetailRouteNames.has(targetRoute.name)
}

function routeCategory(targetRoute = route) {
  return targetRoute.params?.category || targetRoute.query?.category || null
}

function getMediaDetailRoute(itemGuid, type) {
  const normalizedType = normalizeGalleryType(type)
  if (normalizedType === 'Movie' && itemGuid) {
    return {
      path: `/movie/${itemGuid}`
    }
  }
  return {
    path: '/video',
    query: {
      guid: itemGuid,
      gallery_type: normalizedType
    }
  }
}

function isLibraryActive(item) {
  if (!item) {
    return false
  }
  if (isMediaDetailRoute()) {
    return false
  }
  if (route.name === 'LibraryList' && route.params.guid) {
    return route.params.guid === item.guid
  }
  if (route.path === '/list') {
    return route.query.gallery_uid === item.guid
  }
  return false
}

function isHomeActive() {
  return route.path === '/' || detailRouteNames.has(route.name)
}

function isCategoryActive(item) {
  return (route.name === 'CategoryList' || route.path === '/list') && routeCategory() === item?.category
}

function isFavoriteActive() {
  return route.path === '/favorite'
}

function sumCount(key, fallback = 0) {
  const value = Number(MediaDbSum.value?.[key])
  if (Number.isFinite(value)) {
    return value
  }
  return fallback
}

function setThemeMode(mode) {
  themeMode.value = mode;
  VueCookies.set("theme_mode", mode, 60 * 60 * 24 * 365);
  VueCookies.set("dark", dark.value ? "true" : "false", 60 * 60 * 24 * 365);
}

function handleSelect(key) {
  if (key === "out") {
    VueCookies.remove("authorization");
    COMMON.ShowMsg("注销登录成功！")
    setTimeout(function () {
      location.reload();
    }, 1000)
  }
}

function handleSettingsSelect(key) {
  setThemeMode(key)
}

function getSearchRoute(item) {
  const type = normalizeSearchType(item?.type || item?.gallery_type || item?.ancestor_category)
  const rawGuid = item?.guid || item?.item_guid
  if (type === 'Person') {
    return {
      path: '/person',
      query: {
        guid: rawGuid
      }
    }
  }
  const itemGuid = item?.type === 'Episode' ? (item.parent_guid || rawGuid) : rawGuid
  return getMediaDetailRoute(itemGuid, type)
}

function searchListFromResponse(res) {
  const collected = []
  const seen = new Set()
  collectSearchItems(res, collected)
  return collected.filter(item => {
    const key = item?.guid || item?.item_guid || `${searchTitle(item)}-${item?.type || ''}`
    if (!key || seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

function collectSearchItems(value, collected) {
  if (!value) {
    return
  }
  if (Array.isArray(value)) {
    value.forEach(item => collectSearchItems(item, collected))
    return
  }
  if (typeof value !== 'object') {
    return
  }
  if (looksLikeSearchItem(value)) {
    collected.push(value)
    return
  }
  for (const key of ['list', 'items', 'data', 'result', 'records']) {
    if (value[key] !== undefined) {
      collectSearchItems(value[key], collected)
    }
  }
  if (collected.length === 0) {
    Object.values(value).forEach(item => collectSearchItems(item, collected))
  }
}

function looksLikeSearchItem(value) {
  return Boolean(
      value
      && typeof value === 'object'
      && (value.guid || value.item_guid)
      && (value.title || value.name || value.tv_title || value.parent_title)
  )
}

function normalizeSearchType(value) {
  if (value === 'Episode' || value === 'Season' || value === 'season') {
    return 'season'
  }
  if (value === 'Person') {
    return 'Person'
  }
  return normalizeGalleryType(value || 'Video')
}

function normalizeSearchItem(item) {
  const type = normalizeSearchType(item?.type || item?.gallery_type || item?.ancestor_category)
  return {
    ...item,
    gallery_type: type,
    library_title: item?.library_title || item?.ancestor_name || item?.parent_title || searchCategoryTitle(type),
    library_category: item?.library_category || item?.ancestor_category || item?.type || type
  }
}

function searchItemKey(item, index) {
  return item?.guid || item?.item_guid || `${searchTitle(item)}-${index}`
}

function localSearch(keyword) {
  const normalizedKeyword = keyword.toLowerCase()
  return flattenedMediaItems.value.filter(item => {
    const title = [item.title, item.name, item.tv_title, item.library_title].filter(Boolean).join(' ').toLowerCase()
    return title.includes(normalizedKeyword)
  }).slice(0, 18)
}

function searchPosterUrl(item, width = 120) {
  if (searchCategory(item) === 'person') {
    const profile = item?.profile_path || item?.avatar || item?.poster || ''
    return COMMON.profileImageUrl(profile, width)
  }
  const poster = item?.poster || item?.posters || ''
  return COMMON.mediaImageUrl(poster, width)
}

function searchTitle(item) {
  return item?.title || item?.name || item?.tv_title || ''
}

function searchYear(item) {
  if (searchCategory(item) === 'person') {
    const count = item?.known_for_item_count || item?.item_count || item?.work_count
    return count ? `${count} 个作品` : '人物'
  }
  const source = item?.release_date || item?.year || item?.create_time || ''
  const match = String(source).match(/\d{4}/)
  return match ? match[0] : item?.library_title || ''
}

function searchCategory(item) {
  const type = normalizeSearchType(item?.type || item?.gallery_type || item?.ancestor_category)
  if (type === 'Movie') {
    return 'movie'
  }
  if (type === 'TV' || type === 'season') {
    return 'tv'
  }
  if (type === 'LiveChannel') {
    return 'live'
  }
  if (type === 'Person') {
    return 'person'
  }
  return 'other'
}

function searchCategoryTitle(type) {
  const normalized = normalizeSearchType(type)
  if (normalized === 'Movie') {
    return '电影'
  }
  if (normalized === 'TV' || normalized === 'season') {
    return '电视节目'
  }
  if (normalized === 'LiveChannel') {
    return '电视直播'
  }
  if (normalized === 'Person') {
    return '人物'
  }
  return '其他'
}

async function performSearch(keyword, requestId) {
  try {
    const res = await COMMON.requests("GET", `/api/v1/search/list?q=${encodeURIComponent(keyword)}`, true)
    if (requestId !== searchRequestId) {
      return
    }
    const list = searchListFromResponse(res).map(normalizeSearchItem).slice(0, 30)
    searchResults.value = list.length > 0 ? list : localSearch(keyword)
    searchActiveTab.value = 'all'
  } catch {
    if (requestId === searchRequestId) {
      searchResults.value = localSearch(keyword)
      searchActiveTab.value = 'all'
    }
  } finally {
    if (requestId === searchRequestId) {
      searchLoading.value = false
    }
  }
}

function queueSearch(value, delay = 280) {
  const keyword = value.trim()
  searchRequestId += 1
  const requestId = searchRequestId
  if (searchTimer) {
    window.clearTimeout(searchTimer)
    searchTimer = null
  }
  if (!keyword) {
    searchResults.value = []
    searchActiveTab.value = 'all'
    searchLoading.value = false
    return
  }
  searchLoading.value = true
  searchTimer = window.setTimeout(() => {
    searchTimer = null
    performSearch(keyword, requestId)
  }, delay)
}

function openSearch() {
  searchOpen.value = true
  nextTick(() => {
    searchInputRef.value?.focus()
  })
}

function closeSearch({clear = false} = {}) {
  searchOpen.value = false
  if (clear) {
    searchKeyword.value = ''
    searchResults.value = []
    searchActiveTab.value = 'all'
    searchLoading.value = false
  }
}

function clearSearch() {
  searchKeyword.value = ''
  searchResults.value = []
  searchActiveTab.value = 'all'
  searchLoading.value = false
  nextTick(() => {
    searchInputRef.value?.focus()
  })
}

function selectSearchResult() {
  closeSearch({clear: true})
}

async function runFunByPath(path, fun) {
  if (route.path !== path) {
    await fun()
  }
}

async function onMountedFun() {
  // 获取配置
  await getConfig();

  // 获取用户信息
  // await runFunByPath('/login', GetUserInfo)
  await GetUserInfo();
  await GetOfficialBootstrapData();
  if (isCurrentPath('/login')) {
    document.title = title;
    load.value = false;
    return;
  }
  // if (VueCookies.get("authorization")) {

  // 获取每个分类的数量
  // await runFunByPath('/login', GetMediaDbSum)
  await GetMediaDbSum();
  await GetFavoriteSummary();

  // 获取分类列表
  // await runFunByPath('/login', GetMediaDbList)
  await GetMediaDbList();
  if (isCurrentPath('/player')) {
    document.title = title;
    load.value = false;
    return;
  }

  // 获取每个分类的列表
  // await runFunByPath('/login', GetMediaDbInfos)
  await GetMediaDbInfos();
  // }

  document.title = title;
  load.value = false;
}

onMounted(async () => {
  window.addEventListener('resize', handleWindowResize)
  window.addEventListener('keydown', handleGlobalKeydown)
  window.addEventListener('fnos-tv:favorites-updated', handleFavoriteUpdated)
  await onMountedFun();
})

onUnmounted(() => {
  window.removeEventListener('resize', handleWindowResize)
  window.removeEventListener('keydown', handleGlobalKeydown)
  window.removeEventListener('fnos-tv:favorites-updated', handleFavoriteUpdated)
  document.body.classList.remove('mobile-sider-open')
  if (searchTimer) {
    window.clearTimeout(searchTimer)
    searchTimer = null
  }
})

// 监听路由变化
watch(
    () => route.fullPath,
    async (newPath, oldPath) => {
      closeMobileSider();
      if (newPath === "/" || (oldPath?.startsWith('/player') && route.path !== '/player')) {
        await onMountedFun();
      } else if (newPath === "/favorite" || newPath?.startsWith('/favorite?')) {
        await GetFavoriteSummary();
      }
    }
);

watch(
    searchKeyword,
    (value) => queueSearch(value)
)

watch(
    mobileSiderOpen,
    (value) => {
      document.body.classList.toggle('mobile-sider-open', value);
    },
    {immediate: true}
)

watch(
    searchOpen,
    (value) => {
      if (value && searchKeyword.value.trim() && !searchResults.value.length && !searchLoading.value) {
        queueSearch(searchKeyword.value, 0)
      }
    }
)

watch(
    dark,
    (value) => {
      document.documentElement.dataset.theme = value ? "dark" : "light";
    },
    {immediate: true}
)

</script>

<template>
  <div v-if="load" class="load"></div>
  <n-config-provider preflight-style-disabled=true :theme="theme" v-else>
    <n-message-provider>
      <n-notification-provider>
        <n-dialog-provider>
          <router-view v-if="route.path === '/player'"/>
          <n-layout
              v-else-if="route.path !== '/login'"
              :class='[dark ? "dark" : "light", "home", { "detail-page": isDetailPage, "sidebar-collapsed": collapsed || isMobile, "mobile-sider-open": mobileSiderOpen }]'
          >
            <n-layout-header bordered>
              <div class="header-content">
                <div class="header-left">
                  <div @click="toggDrawer" class="menu-button">
                    <n-button class="topbar-control" circle>
                      <i class='bx bx-menu'></i>
                    </n-button>
                  </div>
                  <div @click="Home" class="title">
                    {{ title }}
                  </div>
                </div>
                <div class="header-right">
                  <div class="top-search" :class="{ open: searchOpen || searchKeyword.trim() }">
                    <n-button
                        v-if="!searchOpen && !searchKeyword.trim()"
                        class="topbar-control"
                        quaternary
                        circle
                        aria-label="搜索"
                        @click="openSearch"
                    >
                      <template #icon>
                        <i class='bx bx-search'></i>
                      </template>
                    </n-button>
                    <div v-else class="top-search-box">
                      <i class='bx bx-search top-search-icon'></i>
                      <input
                          ref="searchInputRef"
                          v-model="searchKeyword"
                          class="top-search-input"
                          type="text"
                          placeholder="搜索片名、演员"
                          autocomplete="off"
                          @focus="searchOpen = true"
                          @keydown.esc="closeSearch({ clear: true })"
                      >
                      <button
                          v-if="searchKeyword.trim()"
                          class="top-search-clear"
                          type="button"
                          aria-label="清空搜索"
                          @click="clearSearch"
                      >
                        <i class='bx bx-x'></i>
                      </button>
                      <div
                          v-if="searchOpen && (searchKeyword.trim() || searchLoading)"
                          class="search-popover"
                          role="dialog"
                          aria-label="搜索结果"
                      >
                        <div v-if="searchLoading" class="search-empty">
                          搜索中...
                        </div>
                        <div v-else-if="searchResults.length > 0" class="search-panel">
                          <div class="search-tabs" role="tablist" aria-label="搜索分类">
                            <button
                                v-for="item in searchTabOptions"
                                :key="item.key"
                                class="search-tab"
                                :class="{ active: searchActiveTab === item.key }"
                                type="button"
                                role="tab"
                                :aria-selected="searchActiveTab === item.key"
                                @click="searchActiveTab = item.key"
                            >
                              <span>{{ item.label }}</span>
                              <span v-if="item.count > 0" class="search-tab-count">{{ item.count }}</span>
                            </button>
                          </div>
                          <div class="search-result-list" v-if="visibleSearchResults.length > 0">
                            <router-link
                                class="search-result-item"
                                :class="`type-${searchCategory(item)}`"
                                v-for="(item, index) in visibleSearchResults"
                                :key="searchItemKey(item, index)"
                                :to="getSearchRoute(item)"
                                @click="selectSearchResult"
                            >
                              <img loading="lazy" v-lazy='searchPosterUrl(item)' alt="">
                              <div class="search-result-meta">
                                <div class="search-result-title">{{ searchTitle(item) }}</div>
                                <div class="search-result-subtitle">{{ searchYear(item) }} · {{ item.library_title }}</div>
                              </div>
                            </router-link>
                          </div>
                          <div v-else class="search-empty compact">
                            当前分类无结果
                          </div>
                        </div>
                        <div v-else class="search-empty">
                          没有匹配的内容
                        </div>
                      </div>
                    </div>
                  </div>

                  <n-dropdown trigger="hover" placement="bottom-start" :options="options"
                              @select="handleSelect">
                    <n-button class="topbar-control" quaternary circle aria-label="用户" :title="UserInfo?.username || ''">
                      <template #icon>
                        <i class='bx bxs-user'></i>
                      </template>
                    </n-button>
                  </n-dropdown>

                  <n-dropdown trigger="click" placement="bottom-end" :options="settingsOptions"
                              @select="handleSettingsSelect">
                    <n-button class="topbar-control" quaternary circle aria-label="设置">
                      <template #icon>
                        <i class='bx bx-cog'></i>
                      </template>
                    </n-button>
                  </n-dropdown>
                </div>
              </div>
            </n-layout-header>
            <button v-if="hasDetailBackButton" class="detail-back-button" type="button" aria-label="返回" @click="goBack">
              <i class='bx bx-chevron-left'></i>
            </button>
            <n-layout position="absolute" :style="{ top: '0' }" has-sider>
              <div
                  v-if="isMobile && !collapsed"
                  class="mobile-sider-mask"
                  aria-hidden="true"
                  @click="closeMobileSider"
              ></div>
              <n-layout-sider
                :collapsed="collapsed"
                collapse-mode="width"
                :collapsed-width="0"
                :width="260"
                :native-scrollbar="false"
                bordered
                :show-collapsed-content="false"
                :class="{ 'mobile-sider': isMobile }"
              >
                <div class="sidebar-brand" @click="Home">
                  <img class="brand-logo" src="/images/fnos-logo.png" :alt="title"/>
                  <button
                      v-if="isMobile"
                      class="mobile-sider-close"
                      type="button"
                      aria-label="收起菜单"
                      @click.stop="closeMobileSider"
                  >
                    <i class='bx bx-x'></i>
                  </button>
                </div>
                <div class="sider-item primary-nav">
                  <div class="navigation">
                    <ul class="nav-links">
                      <li>
                        <router-link to="/" :class="{ 'is-active': isHomeActive() }" @click="closeMobileSider">
                                                    <span class="icon">
                                                        <i class='bx bx-home'></i>
                                                    </span>
                          <span class="title">首页</span>
                        </router-link>
                      </li>
                      <!--                      <li>-->
                      <!--                        <router-link to="/star">-->
                      <!--                                                    <span class="icon">-->
                      <!--                                                        <i class='bx bx-star'></i>-->

                      <!--                                                    </span>-->
                      <!--                          <span class="title">收藏</span>-->
                      <!--                        </router-link>-->
                      <!--                      </li>-->
                      <li>
                        <router-link to="/favorite" :class="{ 'is-active': isFavoriteActive() }" @click="closeMobileSider">
                          <span class="icon">
                            <i class='bx bx-heart'></i>
                          </span>
                          <span class="title">收藏</span>
                          <span class="title nav-count">{{ favoriteCount }}</span>
                        </router-link>
                      </li>
                    </ul>
                  </div>
                </div>
                <div class="sider-item gallery-list">
                  <div class="sider-item-title">媒体库</div>
                  <div class="navigation more">
                    <ul class="nav-links">
                      <li v-for="(item, index) in allLibraryItems" :key="index">
                        <div>
                          <router-link :class="{ 'is-active': isLibraryActive(item) }" :to="`/library/${item.guid}`" @click="closeMobileSider">
                                                    <span v-if="item.category === 'Movie'" class="icon">
                                                        <i class='bx bxs-movie'></i>
                                                    </span>
                            <span v-else class="icon">
                                                        <i class='bx bx-desktop'></i>
                                                    </span>
                            <span :data-id="item.gallery_uid" class="title">{{ item.title }}</span>
                            <span class="title nav-count">{{
                                MediaDbSum[item.guid]
                              }}</span>
                          </router-link>
                        </div>
                      </li>
                    </ul>
                  </div>
                </div>
                <div class="sider-item category-list">
                  <div class="sider-item-title">分类</div>
                  <div class="navigation more">
                    <ul class="nav-links">
                      <li v-for="item in categoryNavItems" :key="item.label">
                        <router-link v-if="item.to" :to="item.to" :class="{ 'is-active': isCategoryActive(item) }" @click="closeMobileSider">
                          <span class="icon">
                            <i :class='item.icon'></i>
                          </span>
                          <span class="title">{{ item.label }}</span>
                          <span class="title nav-count">{{ item.count }}</span>
                        </router-link>
                        <span v-else class="nav-link is-muted">
                          <span class="icon">
                            <i :class='item.icon'></i>
                          </span>
                          <span class="title">{{ item.label }}</span>
                          <span class="title nav-count">{{ item.count }}</span>
                        </span>
                      </li>
                    </ul>
                  </div>
                </div>
              </n-layout-sider>
              <n-layout
                  :native-scrollbar="false"
                  :class="{ 'mobile-content': isMobile }"
                  @click.capture="mobileSiderOpen && closeMobileSider()"
                  @touchstart.capture="mobileSiderOpen && closeMobileSider()"
              >
                <router-view/>
              </n-layout>
            </n-layout>
          </n-layout>
          <router-view v-else/>
        </n-dialog-provider>
      </n-notification-provider>
    </n-message-provider>
  </n-config-provider>

</template>

<style>
body {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  overflow: auto;
  overflow-x: hidden;
  background-position: top left;
}

body.mobile-sider-open {
  overflow: hidden;
  touch-action: none;
}

p {
  margin: 0;
  padding: 0;
}

ul li .title,
.sider-item-title {
  white-space: nowrap;
  font-size: 1.5em;
}


.load {
  position: absolute;
  top: 50%;
  left: 50%;
  border: 4px solid #2d8cf0;
  border-radius: 50%;
  border-bottom-color: transparent;
  z-index: 1;
  height: 100px;
  width: 100px;
  display: inline-block;
  animation: spin 1s linear infinite;
  margin-left: -50px;
  margin-top: -50px;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(360deg);
  }
}

.gallery-img {
  width: 100%;
  aspect-ratio: 355/200;
}

.title {
  font-size: 1.5em;
}

.content {
  padding: 12px;
}

a,
a:hover {
  text-decoration: none;
}

a {
  color: black;

}

.dark a {
  color: #fff;
}

.home {
  min-height: 100vh;
  width: -webkit-fill-available;
  font-family: -apple-system, BlinkMacSystemFont, Helvetica Neue, PingFang SC, Microsoft YaHei, Source Han Sans SC, Noto Sans CJK SC, WenQuanYi Micro Hei, sans-serif;
  font-size: 15px;
}

.n-layout-header {
  max-width: 100%;
  padding-left: 10px;
  padding-right: 10px;
  height: 60px;
  line-height: 60px;
  position: sticky;
  top: 0;
  z-index: 2;
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: nowrap;
}

.navigation ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

.navigation ul li {
  position: relative;
  list-style: none;
  width: 100%;
}

.navigation ul li:hover {
  background: rgba(0, 0, 0, .1);
}

.navigation ul li a {
  position: relative;
  width: 100%;
  display: flex;
  text-decoration: none;
  color: black;
  font-weight: 500;
}

.navigation ul {
  overflow: visible;
}

.navigation ul li a .icon i {
  position: relative;
  display: block;
  min-width: 80px;
  font-size: 26px;
  line-height: 65px;
  text-align: center;
}


.navigation ul li a .title {
  position: relative;
  display: block;
  height: 60px;
  line-height: 60px;
  white-space: nowrap;
  font-size: 1.3em;
}

.sider-item-title {
  font-size: 1.4em;
  font-weight: 400;
  padding: 20px;
}


.n-layout-footer {
  text-align: center;
}

/* 移动端适配样式 */
@media (max-width: 768px) {
  .n-layout-header {
    padding: 0 10px;
    height: 50px;
    line-height: 50px;
  }

  .header-content {
    align-items: center;
  }

  .title {
    font-size: 1.2em;
  }

  .menu-button {
    display: block;
  }

  .header-right {
    gap: 8px;
  }

  .n-avatar {
    width: 32px !important;
    height: 32px !important;
    font-size: 14px !important;
  }

  .mobile-sider {
    position: fixed;
    top: 0;
    left: 0;
    height: 100vh;
    height: 100dvh;
    z-index: 1001;
    transition: transform 0.3s ease;
    background-color: var(--n-color);
  }

  .mobile-sider.n-layout-sider--collapsed {
    transform: translateX(-100%);
  }

  .mobile-sider::before {
    display: none;
    content: none;
  }

  .mobile-sider:not(.n-layout-sider--collapsed)::before {
    display: none;
  }

  .mobile-content {
    margin-left: 0 !important;
  }

  .navigation ul li a .icon i {
    min-width: 50px;
    font-size: 20px;
    line-height: 50px;
  }

  .navigation ul li a .title {
    height: 50px;
    line-height: 50px;
    font-size: 1.1em;
  }

  .sider-item-title {
    font-size: 1.2em;
    padding: 15px;
  }

  .content {
    padding: 8px;
  }

  /* 优化下拉菜单在移动端的显示 */
  .n-dropdown-menu {
    max-width: 200px;
  }

  .n-dropdown-option {
    padding: 8px 12px;
    font-size: 14px;
  }
}

/* 小屏幕手机适配 */
@media (max-width: 480px) {
  .n-layout-header {
    padding: 0 8px;
  }

  .title {
    font-size: 1.1em;
  }

  .n-button {
    padding: 0 8px;
  }

  .n-avatar {
    width: 28px !important;
    height: 28px !important;
    font-size: 12px !important;
  }

  .navigation ul li a .icon i {
    min-width: 40px;
    font-size: 18px;
  }

  .navigation ul li a .title {
    font-size: 1em;
  }

  .sider-item-title {
    font-size: 1.1em;
    padding: 12px;
  }
}

/* 优化滚动条 */
.n-layout-sider {
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 0, 0, 0.2) transparent;
}

.n-layout-sider::-webkit-scrollbar {
  width: 4px;
}

.n-layout-sider::-webkit-scrollbar-track {
  background: transparent;
}

.n-layout-sider::-webkit-scrollbar-thumb {
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 2px;
}

.dark .n-layout-sider::-webkit-scrollbar-thumb {
  background-color: rgba(255, 255, 255, 0.2);
}

:root,
html[data-theme="light"] {
  --fn-bg: #ffffff;
  --fn-sidebar: #f3f4f6;
  --fn-panel: #f7f8fa;
  --fn-panel-hover: #eef0f4;
  --fn-border: rgba(15, 23, 42, 0.08);
  --fn-text: rgba(15, 23, 42, 0.9);
  --fn-muted: rgba(0, 0, 0, 0.8);
  --fn-soft: rgba(15, 23, 42, 0.42);
  --fn-top-control: rgba(15, 23, 42, 0.06);
  --fn-top-control-hover: rgba(15, 23, 42, 0.1);
  --fn-nav-hover: rgba(15, 23, 42, 0.06);
  --fn-nav-active: rgba(0, 102, 255, 0.1);
  --fn-nav-active-text: rgba(15, 23, 42, 0.92);
  --fn-blue: #0066ff;
  --fn-rating: #ffd327;
  --fn-on-accent: #ffffff;
}

html[data-theme="dark"] {
  --fn-bg: #151515;
  --fn-sidebar: #101113;
  --fn-panel: #1d1d1f;
  --fn-panel-hover: #242426;
  --fn-border: rgba(255, 255, 255, 0.07);
  --fn-text: rgba(255, 255, 255, 0.88);
  --fn-muted: rgba(255, 255, 255, 0.58);
  --fn-soft: rgba(255, 255, 255, 0.38);
  --fn-top-control: rgba(255, 255, 255, 0.08);
  --fn-top-control-hover: rgba(255, 255, 255, 0.14);
  --fn-nav-hover: rgba(255, 255, 255, 0.06);
  --fn-nav-active: rgba(255, 255, 255, 0.08);
  --fn-nav-active-text: rgba(255, 255, 255, 0.92);
  --fn-rating: #ffd327;
  --fn-on-accent: #ffffff;
}

body {
  background: var(--fn-bg);
  color: var(--fn-text);
}

.home,
.home .n-layout,
.home .n-layout-scroll-container {
  background: var(--fn-bg) !important;
  color: var(--fn-text);
}

.home .n-layout-header {
  position: fixed;
  top: 23px;
  right: 44px;
  left: auto;
  width: auto;
  height: 36px;
  padding: 0;
  line-height: 36px;
  background: transparent !important;
  border: 0 !important;
  z-index: 20;
}

.header-content {
  align-items: center;
  height: 36px;
  gap: 12px;
}

.header-left {
  display: none !important;
  align-items: center;
  gap: 10px;
  min-width: 0;
  height: 36px;
}

.header-right {
  display: flex;
  align-items: center !important;
  justify-content: flex-end;
  flex: 0 0 auto;
  flex-wrap: nowrap;
  height: 36px;
  line-height: 0;
  gap: 16px !important;
  white-space: nowrap;
}

.header-right > div:not(.top-search) {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 36px;
  width: 36px;
  flex: 0 0 36px;
}

.topbar-control.n-button,
.topbar-control.n-avatar {
  width: 36px !important;
  height: 36px !important;
  min-width: 36px !important;
  color: var(--fn-text);
  background: var(--fn-top-control) !important;
  border: 0;
  box-sizing: border-box;
  padding: 0 !important;
}

.topbar-control.n-avatar {
  position: relative;
  top: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  color: var(--fn-text);
  border-radius: 9999px;
  font-size: 14px !important;
  font-weight: 700;
  line-height: 1;
  text-transform: uppercase;
}

.topbar-control.n-avatar .n-avatar__text {
  left: 50% !important;
  top: 50% !important;
  line-height: 1 !important;
  transform: translate(-50%, -50%) !important;
}

.topbar-control.n-button:hover {
  background: var(--fn-top-control-hover) !important;
}

.top-search {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 36px;
  width: 36px;
  height: 36px;
  line-height: normal;
}

.top-search.open {
  flex: 0 0 200px;
  width: 200px;
  height: 40px;
}

.top-search-box {
  position: relative;
  display: flex;
  align-items: center;
  width: 200px;
  height: 40px;
  color: var(--fn-text);
  background: var(--fn-panel);
  border: 2px solid rgba(255, 255, 255, 0.86);
  border-radius: 999px;
  box-sizing: border-box;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
}

.dark .top-search-box {
  border-color: rgba(255, 255, 255, 0.16);
  box-shadow: none;
}

.top-search-icon {
  flex: 0 0 auto;
  margin-left: 14px;
  color: var(--fn-soft);
  font-size: 18px;
  line-height: 1;
}

.top-search-input {
  flex: 1 1 auto;
  min-width: 0;
  height: 34px;
  padding: 0 10px;
  color: var(--fn-text);
  background: transparent;
  border: 0;
  outline: none;
  font-size: 14px;
  line-height: 34px;
}

.top-search-input::placeholder {
  color: var(--fn-soft);
}

.top-search-clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 26px;
  height: 26px;
  margin-right: 5px;
  padding: 0;
  color: var(--fn-soft);
  background: transparent;
  border: 0;
  border-radius: 999px;
  cursor: pointer;
}

.top-search-clear:hover {
  color: var(--fn-text);
  background: var(--fn-top-control);
}

.top-search-clear i {
  font-size: 18px;
  line-height: 1;
}

.search-popover {
  position: absolute;
  top: 48px;
  right: 0;
  z-index: 40;
  width: 430px;
  max-width: calc(100vw - 32px);
  padding: 8px;
  color: var(--fn-text);
  background: var(--fn-panel);
  border: 1px solid var(--fn-border);
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.14);
}

.dark .search-popover {
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.38);
}

.home.detail-page .topbar-control.n-button,
.home.detail-page .topbar-control.n-avatar {
  color: rgba(255, 255, 255, 0.86) !important;
  background: rgba(255, 255, 255, 0.06) !important;
}

.home.detail-page .topbar-control.n-button i,
.home.detail-page .topbar-control.n-avatar .n-avatar__text {
  color: rgba(255, 255, 255, 0.86) !important;
}

.home.detail-page .topbar-control.n-button:hover {
  background: rgba(255, 255, 255, 0.12) !important;
}

.home.detail-page .top-search-box {
  color: #fff;
  background: rgba(24, 25, 28, 0.48);
  border-color: rgba(255, 255, 255, 0.18);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

.home.detail-page .top-search-input {
  color: #fff;
}

.home.detail-page .top-search-clear:hover {
  background: rgba(255, 255, 255, 0.12);
}

.detail-back-button {
  position: fixed;
  top: 23px;
  left: 304px;
  z-index: 25;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  color: var(--fn-text);
  background: transparent;
  border: 0;
  border-radius: 999px;
  cursor: pointer;
  transition: background 0.16s ease;
}

.detail-back-button:hover {
  background: rgba(0, 0, 0, 0.1);
}

.home.detail-page .detail-back-button {
  color: #fff;
}

.home.detail-page .detail-back-button:hover {
  background: rgba(255, 255, 255, 0.12);
}

.home.detail-page.sidebar-collapsed .detail-back-button {
  left: 44px;
}

.detail-back-button i {
  font-size: 26px;
  line-height: 1;
}

.home .n-layout-sider {
  background: var(--fn-sidebar) !important;
  border-right: 1px solid var(--fn-border) !important;
}

.sidebar-brand {
  display: flex;
  align-items: flex-start;
  box-sizing: border-box;
  position: relative;
  height: 76px;
  padding: 36px 28px 0;
  color: var(--fn-text);
  cursor: pointer;
}

.brand-logo {
  display: block;
  width: auto;
  height: 26px;
  user-select: none;
}

.mobile-sider-mask {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(15, 23, 42, 0.38);
  cursor: pointer;
  touch-action: none;
  backdrop-filter: blur(2px);
}

.mobile-sider-close {
  display: none;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  margin: -4px 0 0 auto;
  color: var(--fn-text);
  background: var(--fn-top-control);
  border: 0;
  border-radius: 50%;
  cursor: pointer;
}

.mobile-sider-close i {
  font-size: 22px;
}

.sider-item {
  margin-bottom: 18px;
}

.primary-nav {
  margin-top: 18px;
  margin-bottom: 9px;
}

.sider-item-title {
  padding: 14px 22px 8px;
  color: var(--fn-soft);
  font-size: 13px;
  font-weight: 600;
}

.navigation ul li {
  padding: 0 20px;
  margin: 3px 0;
  box-sizing: border-box;
}

.navigation ul li:hover {
  background: transparent;
}

.navigation ul li a,
.navigation ul li .nav-link {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  height: 40px;
  padding: 0 44px 0 12px;
  color: var(--fn-muted) !important;
  border-radius: 8px;
  font-weight: 400;
  box-sizing: border-box;
  overflow: hidden;
}

.navigation ul li a:hover {
  color: var(--fn-text) !important;
  background: var(--fn-nav-hover);
}

.navigation ul li a.is-active {
  color: var(--fn-nav-active-text) !important;
  background: var(--fn-nav-active) !important;
  font-weight: 500;
  box-shadow: none;
}

.navigation ul li a.is-active::before {
  position: absolute;
  top: 10px;
  bottom: 10px;
  left: 0;
  width: 3px;
  background: var(--fn-blue);
  border-radius: 0 999px 999px 0;
  content: "";
}

.navigation ul li a .icon i,
.navigation ul li .nav-link .icon i {
  min-width: 28px;
  font-size: 18px;
  line-height: 1;
  text-align: left;
}

.navigation ul li a .title,
.navigation ul li .nav-link .title {
  flex: 1 1 auto;
  height: auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 23px;
  color: inherit !important;
  font-size: 15px;
  font-weight: 400;
}

.navigation ul li a .nav-count,
.navigation ul li .nav-link .nav-count {
  position: absolute;
  right: 12px;
  flex: 0 0 auto;
  color: inherit !important;
  font-size: 14px !important;
  font-weight: 400;
  line-height: 20px;
  font-variant-numeric: tabular-nums;
}

.navigation ul li .nav-link {
  color: var(--fn-muted) !important;
}

.navigation ul li .nav-link.is-muted {
  cursor: default;
}

.navigation ul li a.is-active .icon,
.navigation ul li a.is-active .title:not(.nav-count) {
  color: var(--fn-nav-active-text) !important;
}

.navigation ul li a.is-active .icon,
.navigation ul li a.is-active .icon i {
  color: var(--fn-blue) !important;
}

.navigation ul li a.is-active .nav-count {
  color: var(--fn-muted) !important;
}

.home.light .navigation ul li a.is-active,
.home.dark .navigation ul li a.is-active {
  background: var(--fn-nav-active) !important;
}

.home.light .navigation ul li a.router-link-active:not(.is-active),
.home.dark .navigation ul li a.router-link-active:not(.is-active) {
  color: var(--fn-muted) !important;
  background: transparent !important;
  box-shadow: none !important;
}

.home.light .navigation ul li a.router-link-active:not(.is-active) .icon,
.home.light .navigation ul li a.router-link-active:not(.is-active) .icon i,
.home.light .navigation ul li a.router-link-active:not(.is-active) .title,
.home.dark .navigation ul li a.router-link-active:not(.is-active) .icon,
.home.dark .navigation ul li a.router-link-active:not(.is-active) .icon i,
.home.dark .navigation ul li a.router-link-active:not(.is-active) .title {
  color: inherit !important;
}

.home.light .navigation ul li a.is-active .icon,
.home.light .navigation ul li a.is-active .icon i,
.home.light .navigation ul li a.is-active .title:not(.nav-count),
.home.dark .navigation ul li a.is-active .icon,
.home.dark .navigation ul li a.is-active .icon i,
.home.dark .navigation ul li a.is-active .title:not(.nav-count) {
  color: var(--fn-nav-active-text) !important;
}

.home.light .navigation ul li a.is-active .icon,
.home.light .navigation ul li a.is-active .icon i,
.home.dark .navigation ul li a.is-active .icon,
.home.dark .navigation ul li a.is-active .icon i {
  color: var(--fn-blue) !important;
}

.home.light .navigation ul li a.is-active .nav-count,
.home.dark .navigation ul li a.is-active .nav-count {
  color: var(--fn-muted) !important;
}

.content {
  min-height: 100vh;
  padding: 32px 44px 72px;
}

.content a {
  color: inherit;
}

@media (max-width: 768px) {
  .home .n-layout-header {
    top: 10px;
    right: 12px;
    left: 12px;
    width: auto;
  }

  .header-left {
    display: flex !important;
  }

  .header-left .title {
    display: none;
  }

  .header-right {
    gap: 10px !important;
  }

  .top-search.open,
  .top-search-box {
    width: min(200px, calc(100vw - 166px));
    min-width: 150px;
    flex-basis: min(200px, calc(100vw - 166px));
  }

  .search-popover {
    right: -92px;
    width: min(430px, calc(100vw - 24px));
  }

  .home.detail-page .n-layout-header {
    left: auto;
    width: auto;
  }

  .home.detail-page .detail-back-button,
  .home.detail-page.sidebar-collapsed .detail-back-button {
    top: 10px;
    left: 12px;
  }

  .mobile-sider {
    position: fixed !important;
    top: 0;
    height: 100vh;
    height: 100dvh;
    z-index: 1001 !important;
    box-shadow: 12px 0 32px rgba(15, 23, 42, 0.18);
  }

  .mobile-sider-close {
    display: inline-flex;
  }

  .content {
    padding: 64px 14px 40px;
  }
}

.search-result-list {
  display: grid;
  gap: 8px;
  max-height: min(62vh, 520px);
  overflow: auto;
  padding-right: 2px;
}

.search-tabs {
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  margin: 2px 2px 10px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.search-tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  flex: 0 0 auto;
  height: 30px;
  padding: 0 10px;
  color: var(--fn-muted);
  background: transparent;
  border: 0;
  border-radius: 999px;
  cursor: pointer;
  font-size: 13px;
  line-height: 20px;
  white-space: nowrap;
}

.search-tab:hover {
  color: var(--fn-text);
  background: var(--fn-top-control);
}

.search-tab.active {
  color: var(--fn-blue);
  background: var(--fn-nav-active);
  font-weight: 600;
}

.search-tab-count {
  color: inherit;
  font-size: 12px;
  opacity: 0.72;
}

.search-result-item {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  padding: 8px;
  color: var(--fn-text);
  border-radius: 8px;
}

.search-result-item:hover {
  background: var(--fn-nav-hover);
}

.search-result-item img {
  width: 42px;
  aspect-ratio: 2 / 3;
  object-fit: cover;
  border-radius: 5px;
  background: var(--fn-panel);
}

.search-result-item.type-person img {
  border-radius: 999px;
}

.search-result-title {
  overflow: hidden;
  color: var(--fn-text);
  font-size: 14px;
  font-weight: 700;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-result-subtitle,
.search-empty {
  margin-top: 3px;
  color: var(--fn-soft);
  font-size: 13px;
}

.search-empty {
  padding: 24px 8px 18px;
  text-align: center;
}

.search-empty.compact {
  padding: 18px 8px 14px;
}
</style>
