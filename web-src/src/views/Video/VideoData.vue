<script setup>
import {computed, getCurrentInstance, onMounted, ref} from "vue";
import {onBeforeRouteUpdate} from "vue-router";
import {usePlayerData} from "@/store.js";

const instance = getCurrentInstance();
const proxy = instance.appContext.config.globalProperties;
const COMMON = proxy.$COMMON;

const per_view = ref(5);

const PlayerData = usePlayerData()
const guid = ref(null);
const gallery_type = ref(null);
const VideoDataInfo = ref({})
const SeasonData = ref(null)
const playInfo = ref(null)
const backImg = ref(null)
const siderRef = ref(null);
const PersonList = ref(null);
const EpisodeList = ref(null);
const EpisodeCarouselRef = ref(null);
const play_item_guid = ref(null);
const play_guid = ref(null)

guid.value = proxy.$route.query.guid
gallery_type.value = proxy.$route.query.gallery_type

const displayTitle = computed(() => {
  const info = VideoDataInfo.value || {}
  if (gallery_type.value === 'TV') {
    return info.name || info.title || info.tv_title || ''
  }
  if (gallery_type.value === 'season') {
    return info.title || info.name || info.tv_title || ''
  }
  return info.title || info.name || [info.tv_title, info.title].filter(Boolean).join(' ') || ''
})

const galleryTypeLabel = computed(() => {
  if (gallery_type.value === 'Movie') {
    return '电影'
  }
  if (gallery_type.value === 'TV') {
    return '电视剧'
  }
  if (gallery_type.value === 'season') {
    return '剧集'
  }
  return '视频'
})

const scoreText = computed(() => {
  const score = Number(VideoDataInfo.value?.vote_average)
  if (!Number.isFinite(score) || score <= 0) {
    return ''
  }
  return String(Math.floor(score * 10) / 10)
})

const primaryPlayLabel = computed(() => {
  const item = playInfo.value?.item
  if (item && gallery_type.value !== 'Movie') {
    return `第 ${item.season_number || 1} 季 第 ${item.episode_number || 1} 集`
  }
  return '播放'
})

const detailMetaItems = computed(() => {
  const items = []
  if (scoreText.value) {
    items.push(`${scoreText.value} 分`)
  }
  if (VideoDataInfo.value?.release_date) {
    items.push(String(VideoDataInfo.value.release_date).slice(0, 4))
  }
  items.push(galleryTypeLabel.value)
  return items
})

// 获取剧集信息
async function GetVideoData() {
  let api = "/api/v1/item/" + guid.value;
  let res = await COMMON.requests("GET", api, true)
  VideoDataInfo.value = res;
  if (res.backdrops !== undefined) {
    backImg.value = COMMON.imgUrl + "/92/17/" + res.backdrops + "?w=200"
  } else {
    backImg.value = COMMON.imgUrl + "/92/17/" + VideoDataInfo.value.posters + "?w=200"
    // play_guid.value = VideoDataInfo.value.type === "Movie"?VideoDataInfo.value.guid:  VideoDataInfo.value.play_item_guid
  }
}

// 获取季信息
async function GetSeasonData() {
  let api = "/api/v1/season/list/" + guid.value;
  SeasonData.value = await COMMON.requests("GET", api, true)
}

// 获取播放信息
async function GetPayInfo() {
  let api = "/api/v1/play/info";
  let _data = {
    "item_guid": guid.value
  }
  playInfo.value = await COMMON.requests("POST", api, true, _data);
  play_guid.value = playInfo.value.item.parent_guid===''?guid.value:playInfo.value.item.parent_guid??guid.value;
}

async function GetPersonList() {
  let api = "/api/v1/person/list/" + guid.value;
  let res = await COMMON.requests("POST", api, true)
  PersonList.value = res.list.filter(o => o.role !== "");
}

async function GetEpisodeList() {
  let api = "/api/v1/episode/list/" + guid.value;
  EpisodeList.value = await COMMON.requests("GET", api, true);
  // 滚动到当前观看集
  setTimeout(function () {
    goToSlide(playInfo.value.item.episode_number - 1)
  }, 10)
}

async function Play(_guid = playInfo.value?.item?.guid || play_guid.value) {
  if (!_guid) {
    return
  }
  PlayerData.episode_guid = _guid
  let _gallery_type = gallery_type.value;
  if(_gallery_type === "season"){
    _gallery_type = "TV"
  }
  proxy.$router.push({
    path: "/player",
    query: {
      gallery_type: playInfo.value.type,
      guid: play_guid.value,
      episode_guid: _guid
    }
  })
}

const onMountedFun = async () => {
  // 获取剧集详情
  await GetVideoData();
  await GetPayInfo();
  // 获取剧集
  if (gallery_type.value === "TV") {
    await GetSeasonData();
  }
  if (gallery_type.value !== 'TV') {
    await GetPersonList();
  }
  if (gallery_type.value === 'season') {
    await GetEpisodeList()
  }
};


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

// 跳转到指定索引（例如第二张图，索引从 0 开始）
const goToSlide = (index) => {
  EpisodeCarouselRef.value?.to(index);
};

onBeforeRouteUpdate(async (to, from) => {
  guid.value = to.query.guid;
  gallery_type.value = to.query.gallery_type
  await onMountedFun();
});

onMounted(async () => {
  await onMountedFun();
})


</script>

<template>
  <div class="main-content">
    <div class="backdropContainer" v-bind:style="{ backgroundImage: 'url(' + backImg + ')' }">
    </div>
    <div class="view-backdrop">
      <div class="mainColumn">
        <div class="view-scroller">
          <div class="view-card-detail detailTextContainer">
            <div class="lex-direction-column">
              <div class="detail-kicker">{{ galleryTypeLabel }}</div>
              <div class="itemPrimaryNameContainer">
                <h1 class="itemName-primary">{{ displayTitle }}</h1>
              </div>
            </div>
          </div>
        </div>
        <div class="detail-action-row">
          <button @click="Play()" class="detailButton outlineButton">
            <span class="button-icon">
              <i class='bx bxs-caret-right-circle'></i>
            </span>
            <span class="button-text">{{ primaryPlayLabel }}</span>
          </button>
          <div class="detail-meta-list">
            <div class="mediaInfoItem" v-for="item in detailMetaItems" :key="item">
              <span v-if="item.includes('分')" class="icon-star">
                <i class='bx bxs-star'></i>
              </span>
              {{ item }}
            </div>
          </div>
        </div>
        <div v-if="VideoDataInfo.overview" class="overview-text detail-overview">
          {{ VideoDataInfo.overview }}
        </div>
        <div v-if="gallery_type === 'TV'" class="showContainer">
          <div class="show-header">
            <div class="show-title">
              <h3>季</h3>
            </div>
          </div>
          <n-scrollbar ref="seasonRef" x-scrollable>
            <div style="white-space: nowrap;">
              <div class="show-card-list">
                <div class="show-card-item" v-for="(item, index) in SeasonData" :key="index">
                  <router-link :to="{
                                        path: '/video', query: {
                                            guid: item.guid,
                                            gallery_type: 'season'
                                        }
                                    }">
                    <div class="show-img">
                      <img v-lazy='COMMON.imgUrl + item.poster + "?w=200"'
                           alt="">
                    </div>
                  </router-link>
                  <div class="show-name season-name">
                    {{ item.title }}
                  </div>
                </div>

              </div>
            </div>
          </n-scrollbar>
        </div>

        <div v-if="gallery_type === 'season'" class="carousel-container">
          <n-carousel :show-dots="false" :slides-per-view="per_view" :space-between="20" ref="EpisodeCarouselRef"
                      :loop="false" draggable>
            <div class="view-item" v-for="(item, index) in EpisodeList" :key="item.guid"
                 @mouseenter="play_item_guid = item.guid"
                 @mouseleave="play_item_guid = null" @click="Play(item.guid)">
              <div>
                <img v-if="item.poster!== undefined && item.poster.length > 0" loading="lazy" class='gallery-img'
                     v-lazy='COMMON.imgUrl + item.poster' style="border-radius:10px">
                <img v-else loading="lazy" class='gallery-img' v-lazy="'/images/not_gellery.png'">
                <!-- 播放图标 (仅在 hover 时显示) -->
                <div v-if="play_item_guid === item.guid" class="play-icon">
                  <i class="bx bx-play"></i>
                </div>
                <div class="view-item-title">
                  第 {{ item.episode_number }} 集{{ item.title }}
                </div>
              </div>
            </div>
          </n-carousel>
          <!-- 左箭头 -->
          <button class="carousel-arrow left" @click="goPrev">‹</button>

          <!-- 右箭头 -->
          <button class="carousel-arrow right" @click="goNext">›</button>
        </div>

        <div class="showContainer" v-if="gallery_type !== 'TV'">
          <div class="show-header">
            <div class="show-title">
              <h3>演职人员</h3>
            </div>
            <!--            <div class="show-header-tool">-->
            <!--              <n-space>-->
            <!--                <n-button @click="siderRef?.scrollBy({ left: -left })" circle>-->
            <!--                  <i class='bx bx-chevron-left'></i>-->
            <!--                </n-button>-->
            <!--                <n-button @click="siderRef?.scrollBy({ left: left })" circle>-->
            <!--                  <i class='bx bx-chevron-right'></i>-->
            <!--                </n-button>-->
            <!--              </n-space>-->
            <!--            </div>-->
          </div>
          <n-scrollbar ref="siderRef" x-scrollable>
            <div style="white-space: nowrap;">
              <div class="show-card-list">
                <div class="show-card-item" v-for="(item, index) in PersonList" :key="index">
                  <router-link :to="{ path: '/person', query: { id: item.id, } }">
                    <div class="show-img">
                      <img v-if="item.profile_path!==''" loading="lazy"
                           v-lazy='COMMON.imgUrl + "/t/p/w220_and_h330_face/" + item.profile_path'
                           alt="">
                      <img v-else loading="lazy" v-lazy="'/images/not_person.jpg'" alt="">
                    </div>
                  </router-link>
                  <div class="show-name">
                    {{ item.name }}
                  </div>
                </div>
              </div>
            </div>
          </n-scrollbar>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.backdropContainer {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 620px;
  inset-inline-start: 0;
  inset-inline-end: 0;
  touch-action: none;
  background-size: cover;
  background-position: center 28%;
  background-repeat: no-repeat;
  filter: saturate(0.98);
}

.backdropContainer::after {
  content: "";
  position: absolute;
  inset: 0;
  background:
      linear-gradient(180deg, rgba(0, 0, 0, 0.28) 0%, rgba(0, 0, 0, 0.18) 42%, rgba(0, 0, 0, 0.74) 100%),
      linear-gradient(90deg, rgba(0, 0, 0, 0.42) 0%, rgba(0, 0, 0, 0.1) 46%, rgba(0, 0, 0, 0.34) 100%);
}

.mainColumn .show-header ion-icon {
  color: white;
}

.main-content {
  position: relative;
  min-height: 100vh;
  overflow: hidden;
  background: var(--fn-bg);
}

.view-backdrop {
  position: relative;
  min-height: 100vh;
  background: linear-gradient(180deg, transparent 0, transparent 530px, var(--fn-bg) 620px);
}

.dark .view-backdrop {
  background: linear-gradient(180deg, transparent 0, transparent 530px, var(--fn-bg) 620px);
}

.view-scroller {
  display: flex;
  align-items: flex-end;
  gap: 24px;
  min-height: 620px;
  padding: 96px 46px 44px;
  color: white;
}

.view-scroller .mediaInfo {
  display: flex;
  gap: 20px;
  align-items: center;
  margin-top: 20px;
  margin-bottom: 20px;
}

.view-card-image {
  flex: 0 0 190px;
  width: 190px;
  border-radius: 8px;
}


.view-card-image img {
  width: 100%;
  border-radius: 8px;
  aspect-ratio: 11/16;
  object-fit: cover;
  box-shadow: 0 16px 34px rgba(0, 0, 0, 0.35);
}

.view-card-detail {
  margin-bottom: 86px;
}

.season-name {
  text-align: center;
}

@media (min-width: 1300px) {
  .view-card-image img {
    min-width: 190px;
  }
}

.itemName-primary {
  margin: 0;
  color: #fff;
  font-size: clamp(30px, 3vw, 48px);
  font-weight: 750;
  line-height: 1.12;
  letter-spacing: 0;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.45);
}

.mediaInfo .icon-star {
  color: yellow;
}

.mediaInfo .mediaInfoOfficialRating {
  border: 0.09em solid;
  padding: 0 0.6em;
}

.mediaInfoItem.tag-list {
  display: inherit;
}

.mediaInfoItem.tag-list .tag-item {
  margin-left: 4px;
}

.detailButtons {
  margin-top: 12px;
}

.detailButton {
  background: rgba(255, 255, 255, 0.18);
  color: hsla(0, 0%, 100%, 1);
  border-radius: 12px;
  position: relative;
  display: -webkit-inline-flex;
  display: inline-flex;
  -webkit-align-items: center;
  align-items: center;
  box-sizing: border-box;
  font-size: inherit;
  font-family: inherit;
  color: inherit;
  z-index: 0;
  padding: 0.72em 2ch;
  vertical-align: middle;
  border: 0;
  backdrop-filter: blur(14px);
  vertical-align: middle;
  border-radius: 0.6em;
  position: relative;
  font-weight: 500;
  -webkit-tap-highlight-color: transparent;
  text-decoration: none;
  line-height: inherit;
  outline: 0 !important;
  margin: 0 auto;
}

.detailButton:hover .button-icon,
.detailButton:hover .button-text {
  color: #fff;
}

.detailButton.active .button-icon {
  color: #fff;
}

.detailButton.circleButton {
  border-radius: 50%;
  padding: 0.72em 1.7ch;
}

.button-icon {
  font-size: 25px;
}

span.button-text {
  font-size: 20px;
  margin-left: 4px;
}

.detailButton.outlineButton .button-icon {
  position: relative;
  top: 2px;
}

.overview-text {
  color: var(--fn-text);
  line-height: 1.8;
}

.detail-overview {
  max-width: 1680px;
  padding: 4px 46px 34px;
  font-size: 15px;
}

@media (max-width: 750px) {
  .overview-text {
    min-width: 100%;
  }
}


.showContainer {
  padding: 24px 46px 8px;
  color: var(--fn-text);
}

.show-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.show-card-list {
  display: flex;
  gap: 20px;
}

.show-title {
  color: var(--fn-text);
  font-size: 1.2em;
}

.show-img img {
  border-radius: 4px;
  width: 160px;
  aspect-ratio: 11/16;
}

.show-name {
  width: 160px;
  color: var(--fn-text);
  text-overflow: ellipsis;
  overflow: hidden;
}


.view-card-list {
  justify-content: space-between;
  display: flex;
  gap: 20px;
}

.view-card-list img {
  border-radius: 4px;
  width: 160px;
  aspect-ratio: 11/16;
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
}


.view-card-list .view-item {
  transform: translateY(0) scale(1);
  transition: all .2s ease-in-out;
}

.view-card-list .view-item:hover {
  transform: translateY(-4px) scale(0.95);
  transition: all .2s ease-in-out;
}

.view-item-header {
  position: absolute;
  width: 95%;
  padding-left: 4px;
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

.search-list {
  margin-top: 20px;
}

.search-title {
  font-size: 1.2em;
}

.search-itme {
  display: flex;
  gap: 10px;
}

.search-overview {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 8;
  margin-bottom: 10px;
}

.search-itme img {
  border-radius: 5px;
}

@media (max-width: 750px) {
  .view-scroller {
    flex-direction: column;
  }

  .view-card-image {
    width: 65%;
    margin: 0 auto;
  }
}


/* 轮播容器，确保箭头在正确位置 */
.carousel-container {
  position: relative;
  width: 100%;
  padding: 0 46px 8px;
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
  .view-scroller {
    flex-direction: column;
    align-items: flex-start;
    min-height: auto;
    padding: 76px 16px 24px;
    gap: 15px;
  }

  .view-card-image {
    width: 58%;
    flex-basis: auto;
    max-width: 300px;
    margin: 0 auto;
  }

  .view-card-detail {
    width: 100%;
    margin-bottom: 0;
  }

  .overview-text {
    width: 100%;
    min-width: unset;
    font-size: 14px;
  }

  .detail-overview {
    padding: 0 16px 24px;
  }

  .detailButton {
    width: 100%;
    justify-content: center;
    padding: 0.5em 1ch;
  }

  .button-icon {
    font-size: 20px;
  }

  .button-text {
    font-size: 16px;
  }

  .showContainer {
    padding: 18px 16px 8px;
  }

  .show-card-list {
    gap: 10px;
  }

  .show-img img {
    width: 120px;
  }

  .show-name {
    width: 120px;
    font-size: 12px;
  }

  .carousel-container {
    padding: 0 16px;
  }

  .carousel-arrow {
    padding: 8px 12px;
    font-size: 18px;
  }

  .view-item-title {
    font-size: 12px;
    margin-top: 5px;
  }

  .play-icon {
    width: 40px;
    height: 40px;
    font-size: 24px;
  }

  .itemName-primary {
    font-size: 20px;
    line-height: 1.3;
  }

  .mediaInfo {
    gap: 10px;
    margin-top: 10px;
    margin-bottom: 10px;
    font-size: 12px;
  }

  .detailButtons {
    margin-top: 8px;
  }
}

/* 平板适配 */
@media (min-width: 769px) and (max-width: 1024px) {
  .view-card-image {
    width: 25%;
  }

  .overview-text {
    width: 70%;
    min-width: unset;
  }

  .show-img img {
    width: 140px;
  }

  .show-name {
    width: 140px;
  }
}

/* 确保轮播图在移动端正确显示 */
@media (max-width: 768px) {
  :deep(.n-carousel) {
    --n-slides-per-view: 2;
  }
}

@media (min-width: 769px) and (max-width: 1024px) {
  :deep(.n-carousel) {
    --n-slides-per-view: 3;
  }
}

/* 优化背景图片在移动端的显示 */
@media (max-width: 768px) {
  .backdropContainer {
    height: 560px;
    background-position: center;
    background-size: cover;
  }

  .view-backdrop {
    background: linear-gradient(180deg, transparent 0, transparent 470px, var(--fn-bg) 560px);
  }
}

/* 优化标题在移动端的显示 */
@media (max-width: 768px) {
  .itemPrimaryNameContainer {
    margin-bottom: 5px;
  }

  .itemName-primary {
    word-break: break-word;
  }
}

/* 优化按钮在移动端的触摸体验 */
@media (max-width: 768px) {
  .detailButton {
    min-height: 44px; /* 确保触摸目标足够大 */
  }

  .carousel-arrow {
    min-width: 44px;
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
}
.backdropContainer {
  height: 576px;
}

.backdropContainer::after {
  background:
      linear-gradient(180deg, rgba(0, 0, 0, 0.1) 0%, rgba(0, 0, 0, 0.2) 44%, rgba(0, 0, 0, 0.86) 100%),
      linear-gradient(90deg, rgba(0, 0, 0, 0.48) 0%, rgba(0, 0, 0, 0.12) 46%, rgba(0, 0, 0, 0.18) 100%);
}

.view-backdrop,
.dark .view-backdrop {
  background: linear-gradient(180deg, transparent 0, transparent 520px, var(--fn-bg) 576px);
}

.view-scroller {
  align-items: flex-end;
  min-height: 576px;
  padding: 0 46px 38px;
}

.view-card-detail {
  max-width: min(760px, 74vw);
  margin-bottom: 0;
}

.detail-kicker {
  display: inline-flex;
  align-items: center;
  height: 26px;
  padding: 0 10px;
  margin-bottom: 12px;
  color: rgba(255, 255, 255, 0.9);
  background: rgba(0, 0, 0, 0.34);
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
  backdrop-filter: blur(12px);
}

.itemName-primary {
  max-width: 860px;
  font-size: clamp(32px, 3.4vw, 54px);
}

.detail-action-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 28px;
  min-height: 86px;
  padding: 16px 46px 12px;
  color: var(--fn-text);
  background: var(--fn-bg);
}

.detail-meta-list {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px 18px;
  min-width: 0;
  color: var(--fn-muted);
  font-size: 14px;
  line-height: 22px;
}

.detail-meta-list .mediaInfoItem {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}

.detail-meta-list .icon-star {
  color: #f5b500;
}

.detailButton {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 150px;
  height: 54px;
  padding: 0 28px;
  color: #fff;
  background: var(--fn-blue);
  border: 0;
  border-radius: 999px;
  box-shadow: 0 8px 22px rgba(10, 132, 255, 0.25);
  cursor: pointer;
  transition: transform 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
}

.detailButton:hover {
  color: #fff;
  background: #0066ff;
  box-shadow: 0 10px 26px rgba(10, 132, 255, 0.32);
  transform: translateY(-1px);
}

.detailButton:active {
  transform: translateY(0);
}

.detailButton .button-icon,
.detailButton .button-text {
  color: inherit;
}

.detailButton .button-icon {
  display: inline-flex;
  align-items: center;
  font-size: 22px;
}

span.button-text {
  margin-left: 7px;
  font-size: 15px;
  font-weight: 700;
}

.detail-overview {
  max-width: 1120px;
  padding: 0 46px 34px;
  color: var(--fn-muted);
  font-size: 15px;
  line-height: 1.65;
  text-align: justify;
}

.showContainer {
  padding-top: 20px;
}

@media (max-width: 768px) {
  .backdropContainer {
    height: 430px;
  }

  .view-backdrop,
  .dark .view-backdrop {
    background: linear-gradient(180deg, transparent 0, transparent 380px, var(--fn-bg) 430px);
  }

  .view-scroller {
    min-height: 430px;
    padding: 84px 16px 28px;
  }

  .view-card-detail {
    max-width: 100%;
  }

  .itemName-primary {
    font-size: 28px;
  }

  .detail-action-row {
    align-items: stretch;
    flex-direction: column;
    gap: 14px;
    min-height: 0;
    padding: 14px 16px 10px;
  }

  .detailButton {
    width: 100%;
    height: 48px;
  }

  .detail-meta-list {
    justify-content: flex-start;
    gap: 8px 14px;
  }

  .detail-overview {
    padding: 0 16px 24px;
  }
}
</style>
