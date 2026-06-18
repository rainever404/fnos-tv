<script setup>
import {computed, getCurrentInstance, onMounted, ref, watch} from 'vue'
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
const route = useRoute();
const router = useRouter();
const systemThemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
const systemDark = ref(systemThemeQuery.matches);
const legacyDark = VueCookies.get("dark");
const themeMode = ref(VueCookies.get("theme_mode") || (legacyDark === "true" ? "dark" : legacyDark === "false" ? "light" : "system"));
const dark = computed(() => themeMode.value === "dark" || (themeMode.value === "system" && systemDark.value));
const theme = computed(() => dark.value ? darkTheme : null);
const isDetailPage = computed(() => route.path === '/video');
const searchOpen = ref(false);
const searchKeyword = ref('');
const userInitial = computed(() => {
  const username = UserInfo.value?.username || '';
  return username ? username.slice(0, 1).toUpperCase() : 'U';
});
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
  const items = flattenedMediaItems.value
  const movieCount = items.filter(item => item.type === 'Movie').length
  const tvCount = items.filter(item => ['TV', 'season', 'Episode'].includes(item.type)).length
  const otherCount = Math.max(0, mediaTotalCount.value - movieCount - tvCount)
  const movieLibrary = allLibraryItems.value.find(item => item.category === 'Movie')
  const tvLibrary = allLibraryItems.value.find(item => item.category === 'TV')
  return [
    {
      label: '全部',
      icon: 'bx bx-grid-alt',
      count: mediaTotalCount.value,
      to: '/'
    },
    {
      label: '电影',
      icon: 'bx bx-film',
      count: movieCount || 0,
      to: movieLibrary ? {
        path: '/list',
        query: {
          gallery_uid: movieLibrary.guid,
          gallery_type: movieLibrary.category
        }
      } : null
    },
    {
      label: '电视节目',
      icon: 'bx bx-tv',
      count: tvCount || 0,
      to: tvLibrary ? {
        path: '/list',
        query: {
          gallery_uid: tvLibrary.guid,
          gallery_type: tvLibrary.category
        }
      } : null
    },
    {
      label: '电视直播',
      icon: 'bx bx-desktop',
      count: 0,
      to: null
    },
    {
      label: '其他',
      icon: 'bx bx-folder',
      count: otherCount,
      to: otherLibrary.value ? {
        path: '/list',
        query: {
          gallery_uid: otherLibrary.value.guid,
          gallery_type: otherLibrary.value.category
        }
      } : null
    }
  ]
})

const searchResults = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  if (!keyword) {
    return []
  }
  return flattenedMediaItems.value.filter(item => {
    const title = [item.title, item.name, item.tv_title, item.library_title].filter(Boolean).join(' ').toLowerCase()
    return title.includes(keyword)
  }).slice(0, 18)
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

// 监听窗口大小变化
window.addEventListener('resize', () => {
  isMobile.value = window.innerWidth <= 768;
  if (isMobile.value) {
    collapsed.value = true;
  }
});

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

async function GetMediaDbInfos() {
  let api = '/api/v1/item/list'

  if (data.value !== undefined) {
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
        "page_size": MediaDbSum.value[guid]
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
    // 在移动端时，点击菜单按钮显示/隐藏侧边栏
    collapsed.value = !collapsed.value;
  } else {
    // 在桌面端时，保持原有的折叠/展开行为
    collapsed.value = !collapsed.value;
    VueCookies.set("collapsed", collapsed.value);
  }
}

function Home() {
  router.push({
    path: "/",
  })
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

function isLibraryActive(item) {
  if (!item) {
    return false
  }
  if (route.path === '/list') {
    return route.query.gallery_uid === item.guid
  }
  if (route.path === '/video') {
    return normalizeGalleryType(route.query.gallery_type) === item.category
  }
  return false
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
  return {
    path: '/video',
    query: {
      guid: item.guid,
      gallery_type: item.type
    }
  }
}

function searchTitle(item) {
  return item?.title || item?.name || item?.tv_title || ''
}

function searchYear(item) {
  const source = item?.release_date || item?.year || item?.create_time || ''
  const match = String(source).match(/\d{4}/)
  return match ? match[0] : item?.library_title || ''
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
  // if (VueCookies.get("authorization")) {

  // 获取每个分类的数量
  // await runFunByPath('/login', GetMediaDbSum)
  await GetMediaDbSum();

  // 获取分类列表
  // await runFunByPath('/login', GetMediaDbList)
  await GetMediaDbList();

  // 获取每个分类的列表
  // await runFunByPath('/login', GetMediaDbInfos)
  await GetMediaDbInfos();
  // }

  document.title = title;
  load.value = false;
}

onMounted(async () => {
  await onMountedFun();
})

// 监听路由变化
watch(
    () => route.fullPath,
    async (newPath, oldPath) => {
      if (newPath === "/") {
        await onMountedFun();
      }
    }
);

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
              :class='[dark ? "dark" : "light", "home", { "detail-page": isDetailPage, "sidebar-collapsed": collapsed || isMobile }]'
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
                  <n-button class="topbar-control" quaternary circle aria-label="搜索"
                            @click="searchOpen = true">
                    <template #icon>
                      <i class='bx bx-search'></i>
                    </template>
                  </n-button>

                  <n-dropdown trigger="hover" placement="bottom-start" :options="options"
                              @select="handleSelect">
                    <n-avatar class="topbar-control user-avatar" circle :title="UserInfo?.username || ''">
                      {{ userInitial }}
                    </n-avatar>
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
            <button v-if="isDetailPage" class="detail-back-button" type="button" aria-label="返回" @click="goBack">
              <i class='bx bx-chevron-left'></i>
            </button>
            <n-layout position="absolute" :style="{ top: '0' }" has-sider>
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
                  <div class="brand-mark"><i class='bx bxs-videos'></i></div>
                  <div class="brand-text">{{ title }}</div>
                </div>
                <div class="sider-item primary-nav">
                  <div class="navigation">
                    <ul class="nav-links">
                      <li>
                        <router-link to="/" :class="{ 'is-active': route.path === '/' }">
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
                        <span class="nav-link is-muted">
                          <span class="icon">
                            <i class='bx bx-heart'></i>
                          </span>
                          <span class="title">收藏</span>
                          <span class="title nav-count">0</span>
                        </span>
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
                          <router-link :class="{ 'is-active': isLibraryActive(item) }" :to="{
                                                    path: '/list', query: {
                                                        gallery_uid: item.guid,
                                                        gallery_type: item.category
                                                    }
                                                }">
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
                        <router-link v-if="item.to" :to="item.to">
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
              <n-layout :native-scrollbar="false" :class="{ 'mobile-content': isMobile }">
                <router-view/>
              </n-layout>
            </n-layout>
            <n-modal v-model:show="searchOpen" preset="card" class="search-modal" :bordered="false"
                     :segmented="false" title="搜索">
              <div class="search-panel">
                <n-input v-model:value="searchKeyword" clearable placeholder="搜索片名、剧名或媒体库">
                  <template #prefix>
                    <i class='bx bx-search'></i>
                  </template>
                </n-input>
                <div class="search-result-list" v-if="searchResults.length > 0">
                  <router-link
                      class="search-result-item"
                      v-for="item in searchResults"
                      :key="item.guid"
                      :to="getSearchRoute(item)"
                      @click="searchOpen = false"
                  >
                    <img v-if="item.poster" loading="lazy"
                         v-lazy='COMMON.imgUrl + "/92/17/" + item.poster + "?w=120"' alt="">
                    <img v-else loading="lazy" v-lazy="'/images/not_video.jpg'" alt="">
                    <div class="search-result-meta">
                      <div class="search-result-title">{{ searchTitle(item) }}</div>
                      <div class="search-result-subtitle">{{ searchYear(item) }} · {{ item.library_title }}</div>
                    </div>
                  </router-link>
                </div>
                <div v-else class="search-empty">
                  {{ searchKeyword.trim() ? '没有匹配的内容' : '输入关键词后搜索媒体库内容' }}
                </div>
              </div>
            </n-modal>
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
    top: 50px;
    left: 0;
    height: calc(100vh - 50px);
    z-index: 1000;
    transition: transform 0.3s ease;
    background-color: var(--n-color);
  }

  .mobile-sider.n-layout-sider--collapsed {
    transform: translateX(-100%);
  }

  /* 修改遮罩层样式 */
  .mobile-sider::before {
    content: '';
    position: fixed;
    top: 50px;
    left: 0;
    right: 0;
    bottom: 0;
    background: transparent; /* 移除背景色 */
    z-index: -1;
    opacity: 0;
    transition: opacity 0.3s ease;
    pointer-events: none;
  }

  .mobile-sider:not(.n-layout-sider--collapsed)::before {
    opacity: 1;
    pointer-events: auto; /* 保持点击阻止功能 */
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
  --fn-nav-active: #ffffff;
  --fn-blue: #0066ff;
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
  --fn-nav-active: rgba(255, 255, 255, 0.07);
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

.header-right > div {
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
  color: #fff;
  background: transparent;
  border: 0;
  border-radius: 999px;
  cursor: pointer;
  transition: background 0.16s ease;
}

.detail-back-button:hover {
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
  align-items: center;
  gap: 10px;
  height: 76px;
  padding: 0 22px;
  color: var(--fn-text);
  cursor: pointer;
}

.brand-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  color: var(--fn-blue);
  font-size: 24px;
}

.brand-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 15px;
  font-weight: 650;
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
}

.navigation ul li a:hover {
  color: var(--fn-text) !important;
  background: var(--fn-nav-hover);
}

.navigation ul li a.is-active {
  color: var(--fn-blue) !important;
  background: var(--fn-nav-active) !important;
  font-weight: 400;
  box-shadow: none;
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
    top: 0;
    height: 100vh;
  }

  .content {
    padding: 64px 14px 40px;
  }
}

.search-modal {
  width: min(680px, calc(100vw - 32px));
  border-radius: 10px;
}

.search-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.search-result-list {
  display: grid;
  gap: 8px;
  max-height: min(62vh, 620px);
  overflow: auto;
  padding-right: 2px;
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
  padding: 28px 8px 18px;
  text-align: center;
}
</style>
