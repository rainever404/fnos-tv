<script setup>
import {useMediaDbData} from '../store'
import {getCurrentInstance, onMounted, ref, onUnmounted, h, computed} from "vue";
import {useMessage, NIcon, NProgress} from 'naive-ui'

const MediaDbData = useMediaDbData()
const message = useMessage()
const per_view = ref(4);
const per_card = ref(10);
const instance = getCurrentInstance();
const proxy = instance.appContext.config.globalProperties;
const COMMON = proxy.$COMMON;
const playList = ref(null)
const play_item_guid = ref(null);
const EpisodeCarouselRef = ref(null);
const showDropdown = ref(false)
const dropdownX = ref(0)
const dropdownY = ref(0)
const currentContextItem = ref(null)
let resizeTimer = null

// 渲染图标的函数
const renderIcon = (icon) => {
  return () => h(NIcon, null, {default: () => icon})
}

// 右键菜单选项
const dropdownOptions = [
  {
    label: '继续播放',
    key: 'continue',
    icon: renderIcon('▶')
  },
  {
    label: '从继续观看中移除',
    key: 'remove',
    icon: renderIcon('🗑')
  }
]

function updateCarouselDensity() {
  const width = window.innerWidth;
  const usable = width <= 768 ? Math.max(320, width - 28) : Math.max(720, width - 304);
  per_view.value = width <= 768 ? 1 : Math.max(2, Math.min(6.8, (usable + 16) / 326));
  per_card.value = width <= 768 ? 3 : Math.max(5, Math.min(12, (usable + 20) / 190));
}

updateCarouselDensity();

function handleViewportResize() {
  if (resizeTimer) {
    window.clearTimeout(resizeTimer)
  }
  resizeTimer = window.setTimeout(() => {
    updateCarouselDensity()
    resizeTimer = null
  }, 80)
}

const visibleLibraries = computed(() => {
  return (MediaDbData.list || []).filter(item => item.category !== 'Others')
})

function posterImageUrl(item, width = 200, fallback = '/images/not_video.jpg') {
  return COMMON.mediaImageUrl(item?.poster || item?.posters || '', width, fallback)
}

function galleryImageUrl(item, width = 400) {
  return COMMON.mediaImageUrl(item?.poster || item?.posters || '', width, '/images/not_gellery.png')
}

function libraryIconClass(item) {
  switch (item?.category) {
    case 'Movie':
      return 'bx bx-film'
    case 'TV':
      return 'bx bx-tv'
    case 'LiveChannel':
      return 'bx bx-desktop'
    case 'Music':
      return 'bx bx-music'
    case 'Directory':
      return 'bx bx-folder'
    case 'Video':
      return 'bx bx-video'
    case 'Mix':
      return 'bx bx-collection'
    default:
      return 'bx bx-collection'
  }
}

function libraryPreviewItems(item) {
  const officialPosters = Array.isArray(item?.posters)
      ? item.posters.filter(Boolean).slice(0, 3)
      : []
  if (officialPosters.length > 0) {
    return officialPosters.map((poster, index) => ({
      guid: `${item?.guid || item?.title || 'library'}-poster-${index}`,
      poster
    }))
  }
  const list = MediaDbData.info?.[item?.guid]?.list
  if (!Array.isArray(list)) {
    return []
  }
  return list.filter(target => target?.poster || target?.posters).slice(0, 3)
}

function getPlaybackParentGuid(item) {
  return item?.parent_guid || item?.guid || ''
}

function getPlaybackRoute(item) {
  const query = {
    gallery_type: item?.type || item?.gallery_type,
    guid: getPlaybackParentGuid(item),
    episode_guid: item?.guid || item?.item_guid,
    media_guid: item?.media_guid || item?.play_info?.media_guid || item?.media?.guid
  }
  Object.keys(query).forEach(key => {
    if (query[key] === undefined || query[key] === null || query[key] === '') {
      delete query[key]
    }
  })
  return {
    path: '/player',
    query
  }
}

function getVideoRoute(item) {
  if (item?.type === 'Movie' && item?.guid) {
    return {
      path: `/movie/${item.guid}`
    }
  }
  return {
    path: '/video',
    query: {
      guid: item.guid,
      gallery_type: item.type
    }
  }
}

function libraryByGuid(guid) {
  return (MediaDbData.list || []).find(item => item.guid === guid)
}

function isVisibleLibraryShelf(guid) {
  const library = libraryByGuid(guid)
  return Boolean(library && library.category !== 'Others')
}

function getLibraryRouteByGuid(guid) {
  return {
    path: `/library/${guid}`
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

function formatRating(item) {
  const rating = Number(item?.vote_average)
  if (!Number.isFinite(rating) || rating <= 0) {
    return ''
  }
  return rating.toFixed(1)
}

function formatResolution(item) {
  const values = []
  if (Array.isArray(item?.media_stream?.resolutions)) {
    values.push(...item.media_stream.resolutions)
  }
  values.push(
      item?.media_stream?.resolution,
      item?.resolution,
      item?.video_resolution,
      item?.max_resolution,
      item?.display_resolution
  )
  const labels = values
      .flat()
      .filter(Boolean)
      .map(value => String(value).trim())
      .filter(value => value && !/^others?$/i.test(value))
  if (!labels.length) {
    return ''
  }
  const normalized = labels
      .map(label => {
        const lower = label.toLowerCase()
        if (lower.includes('4k') || lower.includes('2160')) {
          return {label: '4K', rank: 2160}
        }
        const match = lower.match(/(\d{3,4})/)
        if (!match) {
          return null
        }
        const size = Number(match[1])
        if (!Number.isFinite(size) || size < 300) {
          return null
        }
        return {label: String(size), rank: size}
      })
      .filter(Boolean)
      .sort((a, b) => b.rank - a.rank)
  return normalized[0]?.label || ''
}

function patchItemsByGuid(list, guid, patch) {
  if (!Array.isArray(list)) {
    return
  }
  for (const target of list) {
    if (itemActionGuid(target) === guid) {
      Object.assign(target, patch)
    }
  }
}

function updateHomeItemState(item, patch) {
  const guid = itemActionGuid(item)
  if (!guid) {
    return
  }
  Object.assign(item, patch)
  patchItemsByGuid(playList.value, guid, patch)
  for (const info of Object.values(MediaDbData.info || {})) {
    patchItemsByGuid(info?.list, guid, patch)
  }
}

function notifyFavoriteUpdated() {
  window.dispatchEvent(new CustomEvent('fnos-tv:favorites-updated'))
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
    updateHomeItemState(item, {
      is_favorite: next ? 1 : 0,
      favorite: next ? 1 : 0
    })
    notifyFavoriteUpdated()
    message.success(next ? '已收藏' : '已取消收藏')
  } catch (error) {
    message.error('收藏操作失败')
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
    updateHomeItemState(item, {
      played: next ? 1 : 0,
      watched: next ? 1 : 0
    })
    message.success(next ? '已标记为已观看' : '已标记为未观看')
  } catch (error) {
    message.error('观看状态更新失败')
  }
}

// 处理右键菜单点击
const handleContextMenu = (e, item) => {
  e.preventDefault()
  currentContextItem.value = item
  dropdownX.value = e.clientX
  dropdownY.value = e.clientY
  showDropdown.value = true
}

// 处理菜单选项点击
const handleDropdownSelect = async (key) => {
  const item = currentContextItem.value
  if (!item) return

  switch (key) {
    case 'continue':
      // 跳转到播放页面
      proxy.$router.push(getPlaybackRoute(item))
      break
    case 'remove':
      try {
        // 调用移除API
        await COMMON.requests("DELETE", `/api/v1/play/record`, true, {
          "item_guid": itemActionGuid(item)
        })
        message.success('已从继续观看中移除')
        // 重新获取播放列表
        await GetPlayList()
      } catch (error) {
        message.error('移除失败')
      }
      break
  }
  showDropdown.value = false
}

// 点击其他地方关闭菜单
const handleClickOutside = () => {
  showDropdown.value = false
}

async function GetPlayList() {
  let api = "/api/v1/play/list"
  const result = await COMMON.requests("GET", api, true);
  playList.value = Array.isArray(result) ? result : [];
}

// 下一张
const goNext = () => {
  const carousel = EpisodeCarouselRef.value
  if (!carousel?.getCurrentIndex || !carousel?.to) {
    return
  }
  let _index = carousel.getCurrentIndex();
  carousel.to(_index + per_view.value);
};

// 上一张
const goPrev = () => {
  const carousel = EpisodeCarouselRef.value
  if (!carousel?.getCurrentIndex || !carousel?.to) {
    return
  }
  let _index = carousel.getCurrentIndex();
  carousel.to(_index - per_view.value);
};

onMounted(async () => {
  window.addEventListener('resize', handleViewportResize)
  window.visualViewport?.addEventListener?.('resize', handleViewportResize)
  await GetPlayList();
  // 添加全局点击事件监听
  document.addEventListener('click', handleClickOutside)
})

// 组件卸载时移除事件监听
onUnmounted(() => {
  window.removeEventListener('resize', handleViewportResize)
  window.visualViewport?.removeEventListener?.('resize', handleViewportResize)
  if (resizeTimer) {
    window.clearTimeout(resizeTimer)
    resizeTimer = null
  }
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div class="content">
    <div class="home-page-title">首页</div>
    <div class="card-list">
      <div class="card-shows media-libraries" v-if="visibleLibraries.length > 0">
        <div class="card-show-title">媒体库</div>
        <div class="library-grid">
            <router-link
                class="library-card"
                v-for="item in visibleLibraries"
                :key="item.guid"
                :to="`/library/${item.guid}`"
            >
            <div class="library-preview" aria-hidden="true">
              <template v-if="libraryPreviewItems(item).length > 0">
                <div
                    class="library-preview-poster"
                    v-for="preview in libraryPreviewItems(item)"
                    :key="preview.guid || preview.id || preview.title"
                >
                  <img class="library-poster-main" :src="posterImageUrl(preview, 400)" alt="">
                  <img class="library-poster-reflection" :src="posterImageUrl(preview, 400)" alt="" aria-hidden="true">
                </div>
              </template>
              <div v-else class="library-icon-wrap">
                <i :class="libraryIconClass(item)"></i>
              </div>
            </div>
            <div class="library-card-info">
              <div class="library-title">
                {{ item.title }}
              </div>
            </div>
          </router-link>
        </div>
      </div>
      <div class="card-shows continue-section" v-if="playList && playList.length > 0">
        <div class="card-show-title">
          继续观看
        </div>
        <div class="carousel-container">
          <n-carousel :show-dots="false" :slides-per-view="per_view" :space-between="16" ref="EpisodeCarouselRef"
                      :loop="false" draggable>
            <div class="view-item" v-for="(item, index) in playList" :key="item.guid"
                 @mouseenter="play_item_guid = item.guid"
                 @mouseleave="play_item_guid = null"
                 @contextmenu="handleContextMenu($event, item)">
              <div>
                <router-link class="continue-link" :to="getPlaybackRoute(item)">
                  <div class="continue-poster-box">
                    <img v-if="item.poster && item.poster.length > 0" loading="lazy" class='gallery-img'
                         v-lazy='galleryImageUrl(item)'>
                    <img v-else loading="lazy" class='gallery-img' v-lazy="'/images/not_gellery.png'">
                    <!-- 进度条：仅当duration和ts存在且duration>0时显示 -->
                    <n-progress
                      v-if="item.duration && item.ts && item.duration > 0"
                      class="continue-progress"
                      type="line"
                      :percentage="Math.min(100, Math.floor(item.ts / item.duration * 100))"
                      :height="5"
                      :show-indicator="false"
                    />
                    <!-- 播放图标 (仅在 hover 时显示) -->
                    <div v-if="play_item_guid === item.guid" class="play-icon">
                      <i class="bx bx-play"></i>
                    </div>
                    <div class="card-action-row continue-action-row">
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
                  <div class="view-item-title landscape-title">
                    {{ item.type === 'Episode' ? item.tv_title : item.title }}
                  </div>
                  <div v-if="item.type === 'Episode'" class="continue-subtitle">
                    第 {{ item.season_number }} 季 · 第 {{ item.episode_number }} 集
                  </div>
                  <div v-else class="continue-subtitle">
                    电影
                  </div>
                </router-link>
              </div>
            </div>
          </n-carousel>
          <!-- 左箭头 -->
          <button class="carousel-arrow left" @click="goPrev">‹</button>

          <!-- 右箭头 -->
          <button class="carousel-arrow right" @click="goNext">›</button>
        </div>
      </div>
      <div class="card-shows" v-for="(key, index) in Object.keys(MediaDbData.info)" :key="index">
        <div v-if="isVisibleLibraryShelf(key)">
          <router-link
              class="card-show-title card-show-title-link"
              :to="getLibraryRouteByGuid(key)"
              :aria-label="`进入${libraryByGuid(key)?.title || '媒体库'}列表`"
          >
            {{ libraryByGuid(key)?.title }} <i class='bx bx-chevron-right'></i>
          </router-link>
          <div class="card-show-content view-card">
            <n-carousel :show-dots="false" show-arrow :slides-per-view="per_card" :space-between="20" :loop="false"
                        draggable>
              <div class="view-item" v-for="item in MediaDbData.info[key].list" :key="item.id">
                <div class="poster-frame-shell">
                  <div class="view-item-header">
                    <div class="view-item-tag-list">
                      <div v-if="formatRating(item)" class="view-item-tag rating">{{ formatRating(item) }}</div>
                      <!-- <div v-if="item.Type != 'Movie' && item.ChildCount != 0" class="view-item-tag count">
                          {{ item.ChildCount }}
                      </div> -->
                      <!--                  <p>{{ item }}</p>-->
                      <div class="view-item-tag-right">
                        <div v-if="formatResolution(item)" class="view-item-tag resolution-badge">{{ formatResolution(item) }}</div>
                        <div v-if="isWatched(item)" class="view-item-tag count">
                          <i class='bx bx-check'></i>
                        </div>
                      </div>
                    </div>
                  </div>
                  <router-link class="poster-image-link" :to="getVideoRoute(item)">
                    <img v-if="item.poster !== undefined" loading="lazy" class="carousel-img"
                         v-lazy='posterImageUrl(item)'>
                    <img v-else loading="lazy" class='carousel-img' v-lazy="'/images/not_video.jpg'">
                  </router-link>
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
                <router-link class="poster-title-link" :to="getVideoRoute(item)">
                  <div v-if="item.title != null" class="view-item-title">
                    {{ item.title }}
                  </div>
                  <div v-else class="view-item-title">
                    {{ item.name }}
                  </div>
                </router-link>
              </div>
              <template #arrow="{ prev, next }">
                <div class="custom-arrow">
                  <button type="button" class="custom-arrow--left" @click="prev">
                    <i class='bx bx-chevron-left'></i>
                  </button>
                  <button type="button" class="custom-arrow--right" @click="next">
                    <i class='bx bx-chevron-right'></i>
                  </button>
                </div>
              </template>
            </n-carousel>
          </div>
        </div>
      </div>
    </div>

    <!-- 右键菜单 -->
    <n-dropdown
        :show="showDropdown"
        :options="dropdownOptions"
        :x="dropdownX"
        :y="dropdownY"
        placement="bottom-start"
        trigger="manual"
        @select="handleDropdownSelect"
    />
  </div>
</template>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
.movie-container {
  display: flex; /* 使用 Flexbox 排列 */
  justify-content: center; /* 居中对齐 */
  gap: 2px; /* 卡片之间的间距 */
  padding: 1px; /* 容器的内边距 */
  border-radius: 10px; /* 容器的圆角 */
  overflow-x: auto; /* 当内容超出时允许横向滚动 */
  backdrop-filter: blur(10px); /* 毛玻璃模糊效果 */
  -webkit-backdrop-filter: blur(10px); /* 兼容 Safari 浏览器 */
  background-color: rgba(255, 255, 255, 0.1); /* 半透明背景色 */
  border: 1px solid rgba(255, 255, 255, 0.2); /* 淡色边框 */
}

/* 单个卡片样式 */
.movie-card {
  text-align: center; /* 文字居中 */
  width: 150px; /* 卡片宽度 */
}

/* 图片样式 */
.movie-poster {
  width: 100%; /* 图片宽度占满卡片 */
  height: auto; /* 高度自适应 */
  border-radius: 10px; /* 图片的圆角 */
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3); /* 添加阴影效果 */
  transition: transform 0.3s; /* 添加平滑缩放动画 */
}


.card-show-title {
  font-size: 1.2em;
  font-weight: 400;
  padding-bottom: 16px;
}

.card-shows {
  margin-bottom: 20px;
}

.view-item {
  text-align: center;
  cursor: context-menu; /* 添加右键菜单光标样式 */
}

.gallery-card .view-item {
  transform: translateY(0) scale(1);
  transition: all .2s ease-in-out;
}

.gallery-card .view-item:hover {
  transform: translateY(0) scale(0.99);
  transition: all .2s ease-in-out;
}

.gallery-card .view-item img {
  border-radius: 5px;
}

.medias .view-item-title {
  font-size: 1.2em;
  font-weight: 400;
}

.custom-arrow {
  display: flex;
  position: absolute;
  top: 70%;
  right: 10px;
}

@media (max-width: 750px) {
  .custom-arrow {
    display: none;
  }
}

.view-card .custom-arrow {
  top: 75%;
}

.custom-arrow button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin-right: 12px;
  color: #fff;
  background-color: rgba(255, 255, 255, 0.1);
  border-width: 0;
  border-radius: 8px;
  transition: background-color 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
}

.custom-arrow button:hover {
  background-color: rgba(255, 255, 255, 0.2);
}

.custom-arrow button:active {
  transform: scale(0.95);
  transform-origin: center;
}

img.carousel-img {
  width: 100%;
  aspect-ratio: 16/10;
}

.view-card img.carousel-img {
  width: 100%;
  aspect-ratio: 11/16;
  border-radius: 5px;
}


.view-card .view-item {
  transform: translateY(0) scale(1);
  transition: all .2s ease-in-out;
}

.view-card .view-item:hover {
  transform: translateY(-4px) scale(0.95);
  transition: all .2s ease-in-out;
}

.view-item-header {
  position: absolute;
  inset: 0;
  z-index: 2;
  padding: 0;
  pointer-events: none;
  box-sizing: border-box;
}

.view-item-tag-list {
  position: relative;
  width: 100%;
  height: 100%;
  text-align: left;
}

.view-item-tag-list .count {
  background-color: var(--fn-blue) !important;
  border-radius: 50%;
  width: 20px;
  height: 20px;
  color: var(--fn-on-accent);
  padding: 4px;
  text-align: center;
}

.rating {
  color: var(--fn-rating);
}

.project {
  margin-top: 10px;
}

.project .n-pagination {
  float: right;
}

@media (max-width: 767px) {
  .card-show-title {
    font-size: 1.2em;
    font-weight: 400;
    padding-bottom: 10px;
  }

  .view-item-title {
    font-size: 0.5em;
    font-weight: 400;
  }

  .custom-arrow.next {
    bottom: 60px;
  }
}


/* 轮播容器，确保箭头在正确位置 */
.carousel-container {
  position: relative;
  width: 100%;
}


/* 左右箭头按钮 */
.carousel-arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  background: rgba(0, 0, 0, 0.5);
  color: white;
  border: none;
  font-size: 24px;
  padding: 10px 15px;
  cursor: pointer;
  z-index: 10;
  border-radius: 50%;
  transition: background 0.3s ease;
}

.carousel-arrow:hover {
  background: rgba(0, 0, 0, 0.8);
}

/* 左箭头位置 */
.carousel-arrow.left {
  left: 5px;
}

/* 右箭头位置 */
.carousel-arrow.right {
  right: 5px;
}

/* 鼠标悬浮时放大 */
.view-item:hover .gallery-img {
  transform: scale(1.05);
  border-radius: 10px !important;
}

/* 播放按钮 */
.play-icon {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 40px;
  color: white;
  background: rgba(0, 0, 0, 0.6);
  width: 60px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: background 0.3s ease;
  cursor: pointer;
}

/* 悬浮时背景变亮 */
.play-icon:hover {
  background: rgba(0, 0, 0, 0.8);
}

/* 移动端适配样式 */
@media (max-width: 768px) {
  .card-show-title {
    font-size: 1.1em;
    padding-bottom: 12px;
  }

  .view-item-title {
    font-size: 0.9em;
    margin-top: 4px;
  }

  .carousel-container {
    margin: 0 -10px;
  }

  .carousel-arrow {
    padding: 8px 12px;
    font-size: 20px;
  }

  .play-icon {
    width: 40px;
    height: 40px;
    font-size: 24px;
  }

  .view-item-tag {
    font-size: 0.8em;
    padding: 2px 6px;
  }

  .view-item-tag-list .count {
    width: 16px;
    height: 16px;
    padding: 2px;
  }

  .custom-arrow button {
    width: 24px;
    height: 24px;
    margin-right: 8px;
  }

  /* 调整图片容器间距 */
  .card-shows {
    margin-bottom: 16px;
    padding: 0 10px;
  }

  /* 优化卡片间距 */
  .n-carousel {
    margin: 0 -5px;
  }

  .view-item {
    padding: 0 5px;
  }

  /* 调整图片比例 */
  img.carousel-img {
    aspect-ratio: 2/3;
  }

  .gallery-img {
    aspect-ratio: 16/9;
  }
}

/* 小屏幕手机适配 */
@media (max-width: 480px) {
  .card-show-title {
    font-size: 1em;
  }

  .view-item-title {
    font-size: 0.8em;
  }

  .carousel-arrow {
    padding: 6px 10px;
    font-size: 18px;
  }

  .play-icon {
    width: 36px;
    height: 36px;
    font-size: 20px;
  }
}

.gallery-img {
  border-radius: 10px !important;
  transition: transform 0.3s;
}

.home-page-title {
  width: fit-content;
  max-width: 100%;
  margin-top: -5px;
  margin-bottom: 25px;
  color: var(--fn-text);
  font-size: 20px;
  font-weight: 500;
  line-height: 28px;
}

.card-list {
  width: calc(100% + 88px);
  max-width: none;
  margin-left: -44px;
}

.card-shows {
  margin-bottom: 34px;
  padding-left: 44px;
  box-sizing: border-box;
}

.media-libraries {
  margin-bottom: 42px;
}

.continue-section {
  margin-bottom: 38px;
}

.card-show-title {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  margin-bottom: 16px;
  color: var(--fn-text);
  font-size: 16px;
  font-weight: 600;
  line-height: 22px;
}

.card-show-title i {
  color: var(--fn-soft);
  font-size: 20px;
}

.card-show-title-link {
  width: fit-content;
  max-width: 100%;
  text-decoration: none;
  cursor: pointer;
  transition: color 0.16s ease;
}

.card-show-title-link:hover,
.card-show-title-link:hover i {
  color: var(--fn-blue);
}

.card-show-title-link i {
  transition: color 0.16s ease, transform 0.16s ease;
}

.card-show-title-link:hover i {
  transform: translateX(2px);
}

.library-grid {
  display: flex;
  gap: 20px;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 0;
  scrollbar-width: none;
}

.library-grid::-webkit-scrollbar {
  display: none;
}

.library-card {
  box-sizing: border-box;
  position: relative;
  display: block;
  flex: 0 0 256px;
  width: 256px;
  aspect-ratio: 256 / 185;
  padding: 0;
  color: var(--fn-text);
  background: var(--fn-panel);
  border: 1px solid var(--fn-border);
  border-radius: 10px;
  box-shadow: none;
  overflow: hidden;
  text-decoration: none;
  transition: background 0.18s ease, border-color 0.18s ease, transform 0.18s ease;
}

.library-card:hover {
  border-color: rgba(0, 102, 255, 0.18);
  background: var(--fn-panel-hover);
}

.dark .library-card:hover {
  border-color: rgba(255, 255, 255, 0.12);
}

.library-preview {
  position: absolute;
  top: 4px;
  right: 4px;
  bottom: 4px;
  left: 4px;
  display: grid;
  grid-auto-columns: minmax(0, 1fr);
  grid-auto-flow: column;
  gap: 1px;
  overflow: hidden;
  background: var(--fn-top-control);
  border-radius: 6px;
}

.library-preview::after {
  content: "";
  position: absolute;
  inset: 54% 0 0;
  z-index: 2;
  background: linear-gradient(180deg, rgba(25, 25, 26, 0) 0%, rgba(25, 25, 26, 0.58) 46%, rgba(25, 25, 26, 0.9) 100%);
  pointer-events: none;
}

.library-preview-poster {
  position: relative;
  min-width: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--fn-top-control);
}

.library-poster-main,
.library-poster-reflection {
  display: block;
  width: 100%;
  object-fit: cover;
}

.library-poster-main {
  height: calc(100% - 39px);
}

.library-poster-reflection {
  height: 39px;
  opacity: 0.28;
  filter: saturate(0.82) brightness(0.66);
  transform: scaleY(-1);
  transform-origin: center;
  -webkit-mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.48), rgba(0, 0, 0, 0));
  mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.48), rgba(0, 0, 0, 0));
}

.library-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: var(--fn-blue);
  background: rgba(0, 102, 255, 0.1);
  font-size: 36px;
}

.library-card-info {
  position: absolute;
  right: 2px;
  bottom: 2px;
  left: 2px;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 0 12px 1px;
  text-align: center;
  background: linear-gradient(180deg, rgba(25, 25, 26, 0) 0%, rgba(25, 25, 26, 0.62) 46%, rgba(25, 25, 26, 0.92) 100%);
  border-radius: 0 0 6px 6px;
  pointer-events: none;
}

.library-title {
  display: block;
  max-width: 100%;
  overflow: hidden;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  line-height: 24px;
  text-align: center;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.42);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.carousel-container {
  margin: 0;
}

.view-item {
  position: relative;
  color: var(--fn-text);
  cursor: pointer;
}

.view-item a {
  color: inherit;
}

.continue-link {
  position: relative;
  display: block;
  width: 100%;
  color: inherit;
  line-height: normal;
  text-decoration: none;
}

.continue-poster-box {
  position: relative;
  box-sizing: border-box;
  width: 100%;
  aspect-ratio: 16 / 9;
  margin-bottom: 8px;
  overflow: hidden;
  background: var(--fn-panel);
  border: 1px solid rgba(198, 202, 207, 0.25);
  border-radius: 10px;
}

.continue-poster-box::after {
  content: "";
  position: absolute;
  inset: 45% 0 0;
  z-index: 1;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.28));
  pointer-events: none;
}

.continue-poster-box .gallery-img {
  display: block;
  width: 100%;
  height: 100%;
  aspect-ratio: auto;
  border-radius: 8px !important;
}

.continue-progress {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 2;
  margin: 0 !important;
  border-radius: 0;
}

.poster-image-link,
.poster-title-link {
  color: inherit;
  text-decoration: none;
}

.poster-frame-shell {
  position: relative;
  width: 100%;
  overflow: hidden;
  border-radius: 8px;
  line-height: 0;
}

.poster-image-link {
  display: block;
  width: 100%;
  line-height: 0;
}

.poster-image-link img {
  display: block;
}

.poster-title-link {
  display: block;
}

.card-action-row {
  position: absolute;
  left: 50%;
  bottom: 13px;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  opacity: 0;
  pointer-events: none;
  transform: translate(-50%, 8px);
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.continue-action-row {
  bottom: 12px;
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

.gallery-img,
img.carousel-img,
.view-card img.carousel-img {
  overflow: hidden;
  background: var(--fn-panel);
  border-radius: 8px !important;
  object-fit: cover;
}

.gallery-img {
  aspect-ratio: 16 / 9;
}

.view-card img.carousel-img {
  aspect-ratio: 2 / 3;
}

.view-item-title {
  margin-top: 8px;
  padding: 0 2px;
  color: var(--fn-text);
  font-size: 14px;
  font-weight: 650;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.landscape-title {
  margin-top: 9px;
}

.continue-link .landscape-title {
  margin-top: 0;
}

.continue-subtitle {
  min-height: 18px;
  margin-top: 3px;
  padding: 0 2px;
  overflow: hidden;
  color: var(--fn-soft);
  font-size: 12px;
  font-weight: 500;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.view-item .view-item-title + .view-item-title {
  margin-top: 3px;
  color: var(--fn-soft) !important;
  font-size: 12px !important;
  font-weight: 500;
}

.view-item-tag-list {
  position: relative;
  width: 100%;
  height: 100%;
  padding: 7px;
  box-sizing: border-box;
  text-align: left;
}

.view-item-tag-right {
  position: absolute;
  right: 7px;
  bottom: 7px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.view-item-tag-list > .rating {
  position: absolute;
  top: 7px;
  left: 7px;
}

.view-item-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 22px;
  padding: 0 6px;
  color: var(--fn-rating);
  background: rgba(0, 0, 0, 0.68);
  border-radius: 5px;
  font-size: 13px;
  font-weight: 800;
}

.view-item-tag.resolution-badge {
  min-width: 30px;
  height: 18px;
  padding: 0 3px;
  color: rgba(255, 255, 255, 0.92);
  background: rgba(28, 28, 29, 0.58);
  border: 1px solid rgba(255, 255, 255, 0.58);
  border-radius: 4px;
  box-sizing: border-box;
  font-family: Arial, sans-serif;
  font-size: 11px;
  font-weight: 600;
  line-height: 16px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
}

.view-item-tag-list .count {
  min-width: 22px;
  width: 22px;
  height: 22px;
  padding: 0;
  color: var(--fn-on-accent);
  background: var(--fn-blue) !important;
}

.view-item-tag-right .count {
  margin-left: 0;
}

.play-icon {
  width: 48px;
  height: 48px;
  color: #fff;
  background: rgba(0, 0, 0, 0.55);
  font-size: 34px;
}

.view-item:hover .gallery-img,
.view-card .view-item:hover {
  transform: translateY(-2px);
}

.view-card .view-item:hover {
  scale: 1;
}

.custom-arrow {
  top: -42px;
  right: 0;
}

.custom-arrow button,
.carousel-arrow {
  color: var(--fn-text);
  background: var(--fn-top-control);
  border: 1px solid var(--fn-border);
}

.custom-arrow,
.carousel-arrow {
  opacity: 0;
  pointer-events: none;
}

.carousel-container:hover .carousel-arrow,
.view-card:hover .custom-arrow {
  opacity: 1;
  pointer-events: auto;
}

.custom-arrow button:hover,
.carousel-arrow:hover {
  background: var(--fn-top-control-hover);
}

@media (max-width: 768px) {
  .home-page-title {
    margin-bottom: 18px;
    font-size: 20px;
  }

  .library-grid {
    gap: 12px;
  }

  .library-card {
    flex-basis: min(256px, calc(100vw - 40px));
    width: min(256px, calc(100vw - 40px));
  }

  .card-shows {
    margin-bottom: 26px;
    padding: 0;
  }

  .card-list {
    width: 100%;
    max-width: 100%;
    margin-left: 0;
  }

  .view-item-title {
    font-size: 13px;
  }

  .card-action-row {
    top: auto;
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
}
</style>
