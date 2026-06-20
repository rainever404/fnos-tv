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
  const usable = width <= 768 ? Math.max(320, width - 28) : Math.max(720, width - 348);
  per_view.value = width <= 768 ? 1 : Math.max(2, Math.min(6.6, usable / 346));
  per_card.value = width <= 768 ? 3 : Math.max(5, Math.min(11.2, usable / 203));
}

updateCarouselDensity();

const visibleLibraries = computed(() => {
  return (MediaDbData.list || []).filter(item => item.category !== 'Others')
})

function getLibraryPreview(guid) {
  const source = MediaDbData.info?.[guid]?.list || []
  return source.filter(item => item.poster).slice(0, 3)
}

function getPlaybackParentGuid(item) {
  return item?.parent_guid || item?.guid || ''
}

function getPlaybackRoute(item) {
  return {
    path: '/player',
    query: {
      gallery_type: item.type,
      guid: getPlaybackParentGuid(item),
      episode_guid: item.guid
    }
  }
}

function getVideoRoute(item) {
  return {
    path: '/video',
    query: {
      guid: item.guid,
      gallery_type: item.type
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
          "item_guid": item.guid
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

// 监听窗口大小变化
window.addEventListener('resize', () => {
  updateCarouselDensity();
});

async function GetPlayList() {
  let api = "/api/v1/play/list"
  playList.value = await COMMON.requests("GET", api, true);
}

// 下一张
const goNext = () => {
  let _index = EpisodeCarouselRef.value.getCurrentIndex();
  EpisodeCarouselRef.value?.to(_index + per_view.value);
};

// 上一张
const goPrev = () => {
  let _index = EpisodeCarouselRef.value.getCurrentIndex();
  EpisodeCarouselRef.value?.to(_index - per_view.value);
};

onMounted(async () => {
  await GetPlayList();
  // 添加全局点击事件监听
  document.addEventListener('click', handleClickOutside)
})

// 组件卸载时移除事件监听
onUnmounted(() => {
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
              :to="{
                path: '/list', query: {
                  gallery_uid: item.guid,
                  gallery_type: item.category
                }
              }"
          >
            <div class="library-posters">
              <img
                  v-for="poster in getLibraryPreview(item.guid)"
                  :key="poster.guid"
                  loading="lazy"
                  v-lazy='COMMON.imgUrl +  "/92/17/" + poster.poster + "?w=200"'
                  alt=""
              >
              <div v-if="getLibraryPreview(item.guid).length === 0" class="library-empty">
                <i class='bx bx-film'></i>
              </div>
            </div>
            <div class="library-reflection" v-if="getLibraryPreview(item.guid).length > 0" aria-hidden="true">
              <img
                  v-for="poster in getLibraryPreview(item.guid)"
                  :key="`${poster.guid}-reflection`"
                  loading="lazy"
                  v-lazy='COMMON.imgUrl +  "/92/17/" + poster.poster + "?w=200"'
                  alt=""
              >
            </div>
            <div class="library-label">{{ item.title }}</div>
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
                    <img v-if="item.poster.length > 0" loading="lazy" class='gallery-img'
                         v-lazy='COMMON.imgUrl + item.poster'>
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
                  <div v-if="item.type === 'Episode'" class="view-item-title"
                       style="font-size: 0.8em;color:rgba(0, 0, 0, 0.4);">
                    第 {{ item.season_number }} 季·第 {{ item.episode_number }} 集
                  </div>
                  <div v-else class="view-item-title" style="font-size: 0.8em;color:rgba(0, 0, 0, 0.4);">
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
        <div v-if="MediaDbData.list.find((item) => item.guid === key).category !== 'Others'">
          <div class="card-show-title">
            {{ MediaDbData.list.find((item) => item.guid === key).title }} <i class='bx bx-chevron-right'></i>
          </div>
          <div class="card-show-content view-card">
            <n-carousel :show-dots="false" show-arrow :slides-per-view="per_card" :space-between="20" :loop="false"
                        draggable>
              <div class="view-item" v-for="item in MediaDbData.info[key].list" :key="item.id">
                <div class="poster-frame-shell">
                  <div class="view-item-header">
                    <div class="view-item-tag-list">
                      <div class="view-item-tag rating">
                        {{
                          isNaN(Math.floor(item.vote_average * 100) /
                              100) ? "" : Math.floor(item.vote_average * 100) / 100
                        }}
                      </div>
                      <!-- <div v-if="item.Type != 'Movie' && item.ChildCount != 0" class="view-item-tag count">
                          {{ item.ChildCount }}
                      </div> -->
                      <!--                  <p>{{ item }}</p>-->
                      <div v-if="item.played" class="view-item-tag count">
                        <i class='bx bx-check'></i>
                      </div>
                    </div>
                  </div>
                  <router-link class="poster-image-link" :to="getVideoRoute(item)">
                    <img v-if="item.poster !== undefined" loading="lazy" class="carousel-img"
                         v-lazy='COMMON.imgUrl +  "/92/17/"+item.poster + "?w=200"'>
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
  width: 95%;
  padding-left: 4px;
  pointer-events: none;
}

.view-item-tag-list {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.view-item-tag-list .count {
  background-color: #2d8cf0 !important;
  border-radius: 50%;
  width: 20px;
  height: 20px;
  color: white;
  padding: 4px;
  text-align: center;
}

.rating {
  color: yellow;
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
  max-width: 100%;
}

.card-shows {
  margin-bottom: 34px;
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

.library-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, 284px);
  gap: 20px;
}

.library-card {
  position: relative;
  overflow: hidden;
  box-sizing: border-box;
  width: 284px;
  height: 205px;
  color: var(--fn-text);
  background: #fff;
  border: 1px solid rgba(198, 202, 207, 0.25);
  border-radius: 10px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
  transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}

.library-card:hover {
  transform: translateY(-2px);
  border-color: rgba(10, 132, 255, 0.32);
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.1);
}

.dark .library-card {
  background: var(--fn-panel);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
}

.dark .library-card:hover {
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.3);
}

.library-posters {
  position: relative;
  z-index: 1;
  display: flex;
  gap: 1px;
  grid-template-columns: repeat(3, 1fr);
  width: calc(100% - 9px);
  aspect-ratio: 16 / 9;
  margin: 4px 4px 0;
  overflow: hidden;
  background: rgba(198, 202, 207, 0.15);
  border-radius: 6px 6px 0 0;
}

.library-posters::after {
  content: "";
  position: absolute;
  inset: 0;
  background: rgba(41, 45, 53, 0);
  pointer-events: none;
  transition: background 0.18s ease;
}

.library-card:hover .library-posters::after {
  background: rgba(41, 45, 53, 0.34);
}

.dark .library-posters::after {
  background: rgba(0, 0, 0, 0);
}

.dark .library-card:hover .library-posters::after {
  background: rgba(0, 0, 0, 0.28);
}

.library-posters img {
  flex: 1 1 0;
  min-width: 0;
  height: 100%;
  object-fit: cover;
}

.library-empty {
  flex: 1 1 100%;
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: var(--fn-soft);
  font-size: 34px;
  background: linear-gradient(135deg, var(--fn-panel), var(--fn-bg));
}

.library-label {
  position: absolute;
  right: 1px;
  bottom: 1px;
  left: 1px;
  z-index: 3;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 12px;
  color: var(--fn-text);
  background: linear-gradient(0deg, #fff 0%, rgba(255, 255, 255, 0.96) 58%, rgba(255, 255, 255, 0.64) 100%);
  border-radius: 0 0 6px 6px;
  font-size: 15px;
  font-weight: 600;
  line-height: 23px;
}

.library-reflection {
  position: absolute;
  right: 5px;
  bottom: 4px;
  left: 4px;
  z-index: 2;
  display: flex;
  gap: 1px;
  height: 32px;
  overflow: hidden;
  border-radius: 0 0 12px 12px;
  opacity: 0.3;
  pointer-events: none;
}

.library-reflection img {
  flex: 1 1 0;
  min-width: 0;
  height: 100%;
  object-fit: cover;
  transform: scaleY(-1);
}

.dark .library-label {
  background: linear-gradient(0deg, var(--fn-panel) 0%, rgba(29, 29, 31, 0.96) 58%, rgba(29, 29, 31, 0.62) 100%);
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

.view-item .view-item-title + .view-item-title {
  margin-top: 3px;
  color: var(--fn-soft) !important;
  font-size: 12px !important;
  font-weight: 500;
}

.view-item-tag-list {
  justify-content: space-between;
  padding: 7px;
}

.view-item-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 22px;
  padding: 0 6px;
  color: #ffd327;
  background: rgba(0, 0, 0, 0.68);
  border-radius: 5px;
  font-size: 13px;
  font-weight: 800;
}

.view-item-tag-list .count {
  min-width: 22px;
  width: 22px;
  height: 22px;
  padding: 0;
  color: #fff;
  background: var(--fn-blue) !important;
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
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .library-card {
    width: 100%;
  }

  .card-shows {
    margin-bottom: 26px;
    padding: 0;
  }

  .view-item-title {
    font-size: 13px;
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
}
</style>
