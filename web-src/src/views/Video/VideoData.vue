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
const StreamList = ref(null);
const GenreMap = ref({})
const CountryMap = ref({})
const LanguageMap = ref({})
const showTechInfoDialog = ref(false)
const EpisodeCarouselRef = ref(null);
const play_item_guid = ref(null);
const play_guid = ref(null)
const MIN_RESUME_SECONDS = 30
const RESUME_END_BUFFER_SECONDS = 30

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
  return score.toFixed(1)
})

const watchedSeconds = computed(() => {
  const value = Number(playInfo.value?.ts ?? playInfo.value?.item?.watched_ts ?? VideoDataInfo.value?.watched_ts ?? 0)
  return Number.isFinite(value) ? value : 0
})

const hasPlaybackRecord = computed(() => {
  const watched = watchedSeconds.value
  if (watched < MIN_RESUME_SECONDS) {
    return false
  }
  const duration = selectedDuration.value
  if (!Number.isFinite(duration) || duration <= 0) {
    return true
  }
  return watched < Math.max(duration - RESUME_END_BUFFER_SECONDS, MIN_RESUME_SECONDS)
})

const primaryPlayLabel = computed(() => {
  return hasPlaybackRecord.value ? '继续播放' : '播放'
})

const isDetailFavorite = computed(() => {
  return Boolean(VideoDataInfo.value?.is_favorite || VideoDataInfo.value?.favorite)
})

const isDetailWatched = computed(() => {
  return Boolean(VideoDataInfo.value?.played || VideoDataInfo.value?.watched)
})

const detailMetaItems = computed(() => {
  const items = []
  if (scoreText.value) {
    items.push(`${scoreText.value} 分`)
  }
  const year = formatYear(VideoDataInfo.value?.release_date || VideoDataInfo.value?.air_date)
  if (year) {
    items.push(year)
  }
  const duration = selectedDuration.value || VideoDataInfo.value?.runtime * 60
  if (duration) {
    items.push(formatDuration(duration))
  }
  const genres = formatGenres(VideoDataInfo.value?.genres)
  if (genres) {
    items.push(genres)
  }
  const countries = formatCountries(VideoDataInfo.value?.production_countries)
  if (countries) {
    items.push(countries)
  }
  items.push(galleryTypeLabel.value)
  return items
})

const selectedMediaFile = computed(() => {
  const files = StreamList.value?.files || []
  const mediaGuid = playInfo.value?.media_guid
  return files.find(item => item.guid === mediaGuid || item.media_guid === mediaGuid) || files[0] || null
})

const selectedVideoStream = computed(() => {
  const streams = StreamList.value?.video_streams || []
  const mediaGuid = selectedMediaFile.value?.guid || playInfo.value?.media_guid
  return streams.find(item => item.guid === playInfo.value?.video_guid)
      || streams.find(item => item.media_guid === mediaGuid)
      || streams[0]
      || null
})

const selectedAudioStream = computed(() => {
  const streams = StreamList.value?.audio_streams || []
  const mediaGuid = selectedMediaFile.value?.guid || playInfo.value?.media_guid
  return streams.find(item => item.guid === playInfo.value?.audio_guid)
      || streams.find(item => item.media_guid === mediaGuid)
      || streams[0]
      || null
})

const selectedSubtitleStream = computed(() => {
  const streams = StreamList.value?.subtitle_streams || []
  const mediaGuid = selectedMediaFile.value?.guid || playInfo.value?.media_guid
  return streams.find(item => item.guid === playInfo.value?.subtitle_guid)
      || streams.find(item => item.media_guid === mediaGuid)
      || streams[0]
      || null
})

const selectedDuration = computed(() => {
  return Number(selectedVideoStream.value?.duration || playInfo.value?.item?.duration || VideoDataInfo.value?.duration || 0)
})

const remainingTimeText = computed(() => {
  const duration = selectedDuration.value
  const watched = watchedSeconds.value
  if (!hasPlaybackRecord.value || !Number.isFinite(duration) || duration <= 0 || watched >= duration) {
    return ''
  }
  return `剩余 ${formatDuration(duration - watched, true)}`
})

const streamFeatureTags = computed(() => {
  const streams = Array.isArray(StreamList.value?.video_streams) ? StreamList.value.video_streams : []
  const source = streams.length ? streams : (selectedVideoStream.value ? [selectedVideoStream.value] : [])
  return source.map(video => {
    const resolution = translateStreamLabel(video?.resolution_type)
    const color = translateStreamLabel(video?.color_range_type)
    return [resolution, color].filter(Boolean).join(' ')
  }).filter(Boolean)
})

const detailTrackLabels = computed(() => {
  const labels = []
  const subtitle = selectedSubtitleStream.value
  const audio = selectedAudioStream.value
  if (subtitle) {
    labels.push(`${languageLabel(subtitle.language, '字幕')}字幕`)
  }
  if (audio) {
    labels.push(`${languageLabel(audio.language, '音频')}音频`)
  }
  return labels
})

const fileInfoItems = computed(() => {
  const file = selectedMediaFile.value
  if (!file) {
    return []
  }
  return [
    {label: '文件位置', value: maskFilePath(file.path || file.file_name || '')},
    {label: '文件大小', value: formatBytes(file.size)},
    {label: '文件创建日期', value: formatDate(file.file_birth_time || file.timestamp)},
    {label: '添加日期', value: formatDate(file.create_time)}
  ].filter(item => item.value)
})

const fileInfoPathItem = computed(() => {
  return fileInfoItems.value.find(item => item.label === '文件位置') || null
})

const fileInfoMetaItems = computed(() => {
  return fileInfoItems.value.filter(item => item.label !== '文件位置')
})

const videoInfoCards = computed(() => {
  const cards = []
  const video = selectedVideoStream.value
  const audio = selectedAudioStream.value
  const subtitle = selectedSubtitleStream.value
  if (video) {
    cards.push({
      label: '视频',
      title: [upperLabel(video.resolution_type), upperLabel(video.codec_name)].filter(Boolean).join(' '),
      desc: [formatBitrate(video.bps), video.bit_depth ? `${video.bit_depth} bit` : ''].filter(Boolean).join(' · ')
    })
  }
  if (audio) {
    cards.push({
      label: '音频',
      title: [languageLabel(audio.language, '音频'), upperLabel(audio.codec_name)].filter(Boolean).join(' '),
      desc: [audio.channel_layout, audio.sample_rate ? `${audio.sample_rate} Hz` : ''].filter(Boolean).join(' · ')
    })
  }
  if (subtitle) {
    cards.push({
      label: '字幕',
      title: [languageLabel(subtitle.language, '字幕'), upperLabel(subtitle.codec_name)].filter(Boolean).join(' '),
      desc: subtitle.is_external ? '外部字幕' : '内嵌字幕'
    })
  }
  return cards
})

const hasDetailedTechInfo = computed(() => videoInfoCards.value.length > 0)

const externalLinks = computed(() => {
  const links = []
  if (VideoDataInfo.value?.imdb_id) {
    links.push({
      label: 'IMDB链接',
      href: `https://www.imdb.com/title/${VideoDataInfo.value.imdb_id}/`
    })
  }
  return links
})

function formatYear(value) {
  const match = String(value || '').match(/\d{4}/)
  return match ? match[0] : ''
}

function normalizeDict(list, keyName = 'id') {
  const dict = {}
  if (!Array.isArray(list)) {
    return dict
  }
  for (const item of list) {
    const key = item?.[keyName] ?? item?.id ?? item?.code
    const value = item?.value || item?.name || item?.title || item?.cn || item?.zh
    if (key !== undefined && value) {
      dict[String(key)] = value
    }
  }
  return dict
}

function dictValue(dict, key) {
  if (key === undefined || key === null || key === '') {
    return ''
  }
  return dict?.[String(key)] || ''
}

function formatGenres(values) {
  if (!Array.isArray(values)) {
    return ''
  }
  return values.map(item => dictValue(GenreMap.value, item) || item).filter(Boolean).join(' · ')
}

function formatCountries(values) {
  if (!Array.isArray(values)) {
    return ''
  }
  const fallback = {
    CN: '中国大陆',
    HK: '中国香港',
    TW: '中国台湾',
    US: '美国',
    JP: '日本',
    KR: '韩国',
    GB: '英国',
    FR: '法国',
    DE: '德国',
    RU: '俄罗斯'
  }
  return values.map(item => dictValue(CountryMap.value, item) || fallback[item] || item).filter(Boolean).join(' · ')
}

function languageLabel(value, fallbackType = '') {
  const fallback = {
    chi: '中文',
    zho: '中文',
    'zh-CN': '中文',
    cmn: '中文',
    eng: '英语',
    jpn: '日语',
    kor: '韩语',
    fre: '法语',
    fra: '法语',
    ger: '德语',
    deu: '德语',
    rus: '俄语',
    'zz-unknow': '未知',
    und: '未知',
    unknown: '未知'
  }
  return dictValue(LanguageMap.value, value) || fallback[value] || (value ? String(value).toUpperCase() : (fallbackType === '字幕' ? '未知' : '未知'))
}

function translateStreamLabel(value) {
  if (!value) {
    return ''
  }
  const map = {
    Others: '其他',
    others: '其他',
    SDR: 'SDR',
    HDR: 'HDR'
  }
  return map[value] || value
}

function upperLabel(value) {
  return value ? String(value).toUpperCase() : ''
}

function formatDuration(seconds, withSeconds = false) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  const parts = []
  if (hours) {
    parts.push(`${hours} 小时`)
  }
  if (minutes || hours) {
    parts.push(`${minutes} 分钟`)
  }
  if (withSeconds || parts.length === 0) {
    parts.push(`${secs} 秒`)
  }
  return parts.join(' ')
}

function formatBytes(value) {
  const bytes = Number(value)
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return ''
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = bytes
  let index = 0
  while (size >= 1024 && index < units.length - 1) {
    size = size / 1024
    index += 1
  }
  return `${size.toFixed(index === 0 ? 0 : 2)} ${units[index]}`
}

function formatBitrate(value) {
  const bps = Number(value)
  if (!Number.isFinite(bps) || bps <= 0) {
    return ''
  }
  if (bps >= 1000000) {
    return `${(bps / 1000000).toFixed(2)} Mbps`
  }
  return `${(bps / 1000).toFixed(2)} Kbps`
}

function formatDate(value) {
  const timestamp = Number(value)
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return ''
  }
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function maskFilePath(value) {
  return String(value || '')
      .replace(/\b(\d{3})\d{4}(\d{4})\b/g, '$1XXXX$2')
      .replace(/\/vol\d+\/[^/]+/g, '远程挂载')
}

function formatPersonRole(item) {
  if (item?.role) {
    return item.job === 'Actor' ? `饰 ${item.role}` : item.role
  }
  const map = {
    Director: '导演',
    Writer: '编剧',
    Actor: '演员',
    Screenplay: '编剧',
    Producer: '制片',
    Editing: '剪辑',
    Camera: '摄影',
    Sound: '声音',
    Art: '美术'
  }
  return map[item?.job] || map[item?.known_for_department] || item?.job || ''
}

function personRoute(item) {
  return {
    path: '/person',
    query: {
      guid: item?.id || item?.guid || item?.person_guid
    }
  }
}

async function GetTagDictionaries() {
  const [genres, countries, languages] = await Promise.allSettled([
    COMMON.requests("GET", "/api/v1/tag/genres?lan=zh-CN", true),
    COMMON.requests("GET", "/api/v1/tag/iso3166?lan=zh-CN", true),
    COMMON.requests("GET", "/api/v1/tag/iso6392?lan=zh-CN", true)
  ])
  if (genres.status === 'fulfilled') {
    GenreMap.value = normalizeDict(genres.value)
  }
  if (countries.status === 'fulfilled') {
    CountryMap.value = normalizeDict(countries.value)
  }
  if (languages.status === 'fulfilled') {
    LanguageMap.value = normalizeDict(languages.value)
  }
}

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

function detailActionGuid() {
  return guid.value || VideoDataInfo.value?.guid || ''
}

function notifyFavoriteUpdated() {
  window.dispatchEvent(new CustomEvent('fnos-tv:favorites-updated'))
}

async function toggleDetailFavorite() {
  const itemGuid = detailActionGuid()
  if (!itemGuid) {
    return
  }
  const next = !isDetailFavorite.value
  try {
    await COMMON.requests(next ? "PUT" : "DELETE", "/api/v1/item/favorite", true, {
      item_guid: itemGuid
    })
    VideoDataInfo.value = {
      ...VideoDataInfo.value,
      is_favorite: next ? 1 : 0,
      favorite: next ? 1 : 0
    }
    notifyFavoriteUpdated()
    COMMON.ShowMsg(next ? '已收藏' : '已取消收藏')
  } catch (error) {
    COMMON.ShowMsg('收藏操作失败')
  }
}

async function toggleDetailWatched() {
  const itemGuid = detailActionGuid()
  if (!itemGuid) {
    return
  }
  const next = !isDetailWatched.value
  try {
    await COMMON.requests(next ? "POST" : "DELETE", "/api/v1/item/watched", true, {
      item_guid: itemGuid
    })
    VideoDataInfo.value = {
      ...VideoDataInfo.value,
      played: next ? 1 : 0,
      watched: next ? 1 : 0
    }
    COMMON.ShowMsg(next ? '已标记为已观看' : '已标记为未观看')
  } catch (error) {
    COMMON.ShowMsg('观看状态更新失败')
  }
}

async function GetPersonList() {
  let api = "/api/v1/person/list/" + guid.value;
  let res = await COMMON.requests("POST", api, true, {
    page: 1,
    page_size: 200
  })
  PersonList.value = (res?.list || []).filter(o => o?.name);
}

async function GetStreamList() {
  if (gallery_type.value === 'TV') {
    StreamList.value = null
    return
  }
  try {
    let api = "/api/v1/stream/list/" + guid.value;
    StreamList.value = await COMMON.requests("GET", api, true)
  } catch {
    StreamList.value = null
  }
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
      episode_guid: _guid,
      media_guid: playInfo.value?.media_guid || undefined
    }
  })
}

const onMountedFun = async () => {
  // 获取剧集详情
  await GetVideoData();
  await GetTagDictionaries();
  // 获取剧集
  if (gallery_type.value === "TV") {
    await GetSeasonData();
  }
  if (gallery_type.value !== 'TV') {
    await GetPersonList();
    await GetStreamList();
  }
  await GetPayInfo();
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
              <div class="itemPrimaryNameContainer">
                <h1 class="itemName-primary">{{ displayTitle }}</h1>
              </div>
            </div>
          </div>
        </div>
        <div v-if="remainingTimeText" class="detail-remaining-row">
          {{ remainingTimeText }}
        </div>
        <div class="detail-action-row">
          <button @click="Play()" class="detailButton outlineButton">
            <span class="button-icon">
              <i class='bx bxs-caret-right-circle'></i>
            </span>
            <span class="button-text">{{ primaryPlayLabel }}</span>
          </button>
          <button
              type="button"
              class="detailButton circleButton"
              :class="{ active: isDetailFavorite }"
              :title="isDetailFavorite ? '取消收藏' : '收藏'"
              :aria-label="isDetailFavorite ? '取消收藏' : '收藏'"
              @click="toggleDetailFavorite"
          >
            <span class="button-icon">
              <i :class="isDetailFavorite ? 'bx bxs-heart' : 'bx bx-heart'"></i>
            </span>
          </button>
          <button
              type="button"
              class="detailButton circleButton"
              :class="{ active: isDetailWatched }"
              :title="isDetailWatched ? '标记为未观看' : '标记为已观看'"
              :aria-label="isDetailWatched ? '标记为未观看' : '标记为已观看'"
              @click="toggleDetailWatched"
          >
            <span class="button-icon">
              <i :class="isDetailWatched ? 'bx bxs-check-circle' : 'bx bx-check-circle'"></i>
            </span>
          </button>
          <div class="detail-action-info">
            <div class="detail-meta-list">
              <template v-for="(item, index) in detailMetaItems" :key="item">
                <span v-if="index > 0" class="detail-meta-separator">/</span>
                <span class="mediaInfoItem">{{ item }}</span>
              </template>
            </div>
            <div v-if="detailTrackLabels.length" class="detail-track-list">
              <span v-for="item in detailTrackLabels" :key="item">{{ item }}</span>
            </div>
          </div>
        </div>
        <div v-if="streamFeatureTags.length" class="stream-feature-row">
          <button
              v-for="(tag, index) in streamFeatureTags"
              :key="tag + index"
              class="stream-feature-chip"
              :class="{ active: index === 0 }"
              type="button"
          >
            {{ tag }}
          </button>
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

        <div class="showContainer people-section" v-if="gallery_type !== 'TV'">
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
                <div class="show-card-item person-card" v-for="(item, index) in PersonList" :key="index">
                  <router-link :to="personRoute(item)">
                    <div class="show-img person-avatar">
                      <img v-if="item.profile_path" loading="lazy"
                           v-lazy='COMMON.imgUrl + "/t/p/w220_and_h330_face/" + item.profile_path'
                           alt="">
                      <img v-else loading="lazy" v-lazy="'/images/not_person.jpg'" alt="">
                    </div>
                  </router-link>
                  <div class="show-name">
                    {{ item.name }}
                  </div>
                  <div v-if="item.role" class="person-role">
                    {{ formatPersonRole(item) }}
                  </div>
                  <div v-else-if="formatPersonRole(item)" class="person-role">
                    {{ formatPersonRole(item) }}
                  </div>
                </div>
              </div>
            </div>
          </n-scrollbar>
        </div>

        <div class="detail-info-section" v-if="fileInfoItems.length">
          <h3>文件信息</h3>
          <div class="file-info-flow">
            <div v-if="fileInfoPathItem" class="file-info-row file-info-path-row">
              <span class="file-info-label">{{ fileInfoPathItem.label }}：</span>
              <span class="file-info-value">{{ fileInfoPathItem.value }}</span>
            </div>
            <div v-if="fileInfoMetaItems.length" class="file-info-meta-line">
              <span class="file-info-meta-item" v-for="item in fileInfoMetaItems" :key="item.label">
                <span class="file-info-label">{{ item.label }}：</span>
                <span class="file-info-value">{{ item.value }}</span>
              </span>
            </div>
          </div>
        </div>

        <div class="detail-info-section" v-if="videoInfoCards.length">
          <div class="detail-info-heading">
            <h3>视频信息</h3>
            <button
                v-if="hasDetailedTechInfo"
                class="tech-info-more"
                type="button"
                @click="showTechInfoDialog = true"
            >
              查看全部
            </button>
          </div>
          <div class="tech-info-flow">
            <div class="tech-info-row" v-for="item in videoInfoCards" :key="item.label">
              <h4>{{ item.label }}</h4>
              <div class="tech-info-line">
                <span class="tech-info-title">{{ item.title }}</span>
                <span v-if="item.desc" class="tech-info-desc">{{ item.desc }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="external-link-row" v-if="externalLinks.length">
          <span>链接：</span>
          <a v-for="item in externalLinks" :key="item.label" :href="item.href" target="_blank" rel="noopener">
            {{ item.label }}
          </a>
        </div>
      </div>
    </div>
    <div
        v-if="showTechInfoDialog"
        class="tech-info-dialog-mask"
        role="presentation"
        @click.self="showTechInfoDialog = false"
    >
      <div class="tech-info-dialog" role="dialog" aria-modal="true" aria-label="视频信息">
        <div class="tech-info-dialog-header">
          <h3>视频信息</h3>
          <button type="button" class="tech-info-dialog-close" aria-label="关闭" @click="showTechInfoDialog = false">
            <i class='bx bx-x'></i>
          </button>
        </div>
        <div class="tech-info-dialog-list">
          <div class="tech-info-dialog-card" v-for="item in videoInfoCards" :key="`dialog-${item.label}`">
            <div class="tech-info-dialog-label">{{ item.label }}</div>
            <div class="tech-info-dialog-title">{{ item.title }}</div>
            <div v-if="item.desc" class="tech-info-dialog-desc">{{ item.desc }}</div>
          </div>
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
  --detail-hero-height: 700px;
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

.remaining-time {
  margin-top: 8px;
  color: rgba(255, 255, 255, 0.9);
  font-size: 16px;
  line-height: 22px;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.36);
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
    margin: 0 16px 24px;
    padding: 0;
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
  height: var(--detail-hero-height);
}

.backdropContainer::after {
  background:
      linear-gradient(180deg, rgba(0, 0, 0, 0.1) 0%, rgba(0, 0, 0, 0.2) 44%, rgba(0, 0, 0, 0.86) 100%),
      linear-gradient(90deg, rgba(0, 0, 0, 0.48) 0%, rgba(0, 0, 0, 0.12) 46%, rgba(0, 0, 0, 0.18) 100%);
}

.view-backdrop,
.dark .view-backdrop {
  background: linear-gradient(
      180deg,
      transparent 0,
      transparent calc(var(--detail-hero-height) - 70px),
      var(--fn-bg) var(--detail-hero-height)
  );
}

.view-scroller {
  align-items: flex-end;
  min-height: calc(var(--detail-hero-height) - 30px);
  padding: 0 46px 30px;
}

.view-card-detail {
  width: 100%;
  max-width: none;
  margin-bottom: 0;
}

.itemName-primary {
  width: 100%;
  max-width: 100%;
  font-size: clamp(36px, 3.4vw, 60px);
  font-weight: 400;
  line-height: 1.4;
}

.detail-remaining-row {
  box-sizing: border-box;
  height: 16px;
  margin-top: 16px;
  padding: 0 46px;
  color: var(--fn-muted);
  background: var(--fn-bg);
  font-size: 12px;
  line-height: 16px;
}

.detail-action-row {
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  gap: 8px;
  min-height: 54px;
  margin-top: 8px;
  padding: 0 46px;
  color: var(--fn-text);
  background: var(--fn-bg);
}

.detail-action-info {
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: flex-end;
  gap: 12px;
  min-width: 0;
  min-height: 54px;
  margin-left: clamp(18px, 4vw, 96px);
}

.detail-meta-list {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px 0;
  min-width: 0;
  color: var(--fn-muted);
  font-size: 14px;
  line-height: 22px;
}

.detail-meta-list .mediaInfoItem {
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
}

.detail-meta-separator {
  display: inline-flex;
  align-items: center;
  margin: -2px 8px 0;
  color: color-mix(in srgb, var(--fn-muted) 64%, transparent);
  font-size: 16px;
  line-height: 24px;
}

.detail-track-list {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 20px;
  color: var(--fn-muted);
  font-size: 14px;
  line-height: 20px;
}

.stream-feature-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 42px 46px 40px;
  background: var(--fn-bg);
}

.stream-feature-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 36px;
  min-width: 88px;
  padding: 0 24px;
  color: var(--fn-text);
  background: transparent;
  border: 1px solid var(--fn-border);
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: default;
}

.stream-feature-chip.active {
  color: var(--fn-blue);
  border: 2px solid var(--fn-blue);
}

.detailButton {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 150px;
  height: 54px;
  padding: 0 16px;
  color: #fff;
  background: var(--fn-blue);
  border: 0;
  border-radius: 999px;
  box-shadow: 0 8px 22px rgba(10, 132, 255, 0.25);
  cursor: pointer;
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
  transition: transform 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
}

.detailButton.circleButton {
  flex: 0 0 54px;
  width: 54px;
  min-width: 54px;
  padding: 0;
  color: var(--fn-text);
  background: var(--fn-panel);
  border: 1px solid var(--fn-border);
  box-shadow: none;
}

.detailButton:hover {
  color: #fff;
  background: #0066ff;
  box-shadow: 0 10px 26px rgba(10, 132, 255, 0.32);
  transform: translateY(-1px);
}

.detailButton.circleButton:hover {
  color: var(--fn-text);
  background: var(--fn-panel-hover);
  box-shadow: none;
}

.detailButton.circleButton.active {
  color: #fff;
  background: var(--fn-blue);
  border-color: var(--fn-blue);
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
  font-size: 18px;
}

span.button-text {
  margin-left: 0;
  font-size: inherit;
  font-weight: inherit;
  line-height: inherit;
}

.detail-overview {
  box-sizing: border-box;
  width: auto;
  max-width: none;
  margin: 0 46px 34px;
  padding: 0;
  color: var(--fn-muted);
  font-size: 15px;
  line-height: 23px;
  text-align: left;
}

.showContainer {
  padding-top: 8px;
}

.people-section {
  padding: 20px 44px 39px;
}

.people-section .show-header {
  margin-bottom: 8px;
}

.people-section .show-title {
  font-size: 16px;
}

.people-section .show-title h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 400;
  line-height: 22px;
}

.people-section .show-card-list {
  gap: 20px;
}

.person-card {
  width: 120px;
  white-space: nowrap;
}

.person-avatar {
  width: 90px;
  height: 90px;
  margin: 0 auto 10px;
}

.person-avatar img {
  width: 90px;
  height: 90px;
  aspect-ratio: 1 / 1;
  border-radius: 6px;
  object-fit: cover;
  display: block;
}

.people-section .show-name,
.person-role {
  width: 120px;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.people-section .show-name {
  color: var(--fn-text);
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
}

.person-role {
  color: var(--fn-soft);
  font-size: 12px;
  line-height: 16px;
}

.detail-info-section {
  padding: 18px 46px 0;
  color: var(--fn-text);
}

.detail-info-section h3,
.detail-info-heading h3 {
  margin: 0 0 10px;
  color: var(--fn-text);
  font-size: 14px;
  font-weight: 400;
  line-height: 20px;
}

.file-info-flow {
  display: grid;
  gap: 6px;
  max-width: 1720px;
  color: var(--fn-muted);
  font-size: 14px;
  line-height: 22px;
}

.file-info-row,
.file-info-meta-line {
  display: flex;
  align-items: center;
  min-width: 0;
}

.file-info-path-row .file-info-value {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-info-meta-line {
  flex-wrap: wrap;
  gap: 0 18px;
}

.file-info-meta-item {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  white-space: nowrap;
}

.file-info-label {
  flex: 0 0 auto;
  color: var(--fn-soft);
}

.file-info-value {
  min-width: 0;
}

.detail-info-heading {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 18px;
}

.tech-info-more {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0;
  color: var(--fn-blue);
  background: transparent;
  border: 0;
  cursor: pointer;
  font-size: 14px;
  line-height: 20px;
}

.tech-info-more:hover {
  text-decoration: underline;
}

.tech-info-flow {
  display: grid;
  gap: 8px;
  max-width: 1720px;
  color: var(--fn-muted);
  font-size: 14px;
  line-height: 22px;
}

.tech-info-row {
  display: grid;
  grid-template-columns: 46px minmax(0, 1fr);
  align-items: baseline;
  gap: 0;
}

.tech-info-row h4 {
  margin: 0;
  color: var(--fn-soft);
  font-size: 14px;
  font-weight: 400;
  line-height: 22px;
}

.tech-info-line {
  display: flex;
  flex-wrap: wrap;
  gap: 0 8px;
  min-width: 0;
}

.tech-info-title {
  color: var(--fn-text);
  font-size: 14px;
  font-weight: 400;
  line-height: 22px;
}

.tech-info-desc {
  color: var(--fn-muted);
  font-size: 14px;
  line-height: 22px;
}

.tech-info-desc::before {
  content: "·";
  margin-right: 8px;
  color: var(--fn-soft);
}

.tech-info-dialog-mask {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.42);
  box-sizing: border-box;
}

.tech-info-dialog {
  width: min(560px, 100%);
  max-height: min(720px, calc(100vh - 48px));
  overflow: hidden;
  color: var(--fn-text);
  background: var(--fn-panel);
  border: 1px solid var(--fn-border);
  border-radius: 8px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.28);
}

.tech-info-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  padding: 0 18px;
  border-bottom: 1px solid var(--fn-border);
  box-sizing: border-box;
}

.tech-info-dialog-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  line-height: 24px;
}

.tech-info-dialog-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  color: var(--fn-muted);
  background: transparent;
  border: 0;
  border-radius: 50%;
  cursor: pointer;
}

.tech-info-dialog-close:hover {
  color: var(--fn-text);
  background: var(--fn-top-control);
}

.tech-info-dialog-close i {
  font-size: 22px;
  line-height: 1;
}

.tech-info-dialog-list {
  display: grid;
  gap: 10px;
  max-height: calc(min(720px, 100vh - 48px) - 56px);
  overflow: auto;
  padding: 16px 18px 18px;
  box-sizing: border-box;
}

.tech-info-dialog-card {
  padding: 12px 14px;
  background: var(--fn-bg);
  border: 1px solid var(--fn-border);
  border-radius: 8px;
}

.tech-info-dialog-label {
  color: var(--fn-soft);
  font-size: 13px;
  line-height: 18px;
}

.tech-info-dialog-title {
  margin-top: 4px;
  color: var(--fn-text);
  font-size: 14px;
  line-height: 22px;
}

.tech-info-dialog-desc {
  margin-top: 2px;
  color: var(--fn-muted);
  font-size: 13px;
  line-height: 20px;
}

.external-link-row {
  display: flex;
  gap: 8px;
  padding: 20px 46px 42px;
  color: var(--fn-muted);
  font-size: 14px;
  line-height: 20px;
}

.external-link-row a {
  color: var(--fn-muted);
  text-decoration: none;
}

.external-link-row a:hover {
  color: var(--fn-blue);
  text-decoration: underline;
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
    line-height: 1.3;
  }

  .detail-remaining-row {
    height: auto;
    margin-top: 10px;
    padding: 0 16px;
    font-size: 12px;
    line-height: 18px;
  }

  .detail-action-row {
    align-items: center;
    flex-direction: row;
    flex-wrap: wrap;
    gap: 8px;
    min-height: 0;
    margin-top: 8px;
    padding: 0 16px 10px;
  }

  .detailButton {
    height: 48px;
  }

  .detailButton.outlineButton {
    flex: 1 1 auto;
    min-width: 0;
  }

  .detailButton.circleButton {
    flex: 0 0 48px;
    width: 48px;
    min-width: 48px;
  }

  .detail-action-info {
    flex: 1 0 100%;
    gap: 8px;
    min-height: 0;
    margin-left: 0;
  }

  .detail-meta-list {
    justify-content: flex-start;
    gap: 6px 0;
    font-size: 13px;
    line-height: 20px;
  }

  .detail-track-list {
    justify-content: flex-start;
    gap: 12px;
    font-size: 13px;
  }

  .stream-feature-row {
    padding: 20px 16px 22px;
  }

  .stream-feature-chip {
    min-width: 0;
    height: 34px;
    padding: 0 16px;
  }

  .detail-overview {
    width: auto;
    min-width: 0;
    margin: 0 16px 24px;
    padding: 0;
  }

  .people-section .show-card-list {
    gap: 16px;
  }

  .person-card,
  .people-section .show-name,
  .person-role {
    width: 92px;
  }

  .person-avatar,
  .person-avatar img {
    width: 76px;
    height: 76px;
  }

  .detail-info-section {
    padding: 16px 16px 0;
  }

  .file-info-row,
  .file-info-meta-line {
    display: block;
  }

  .file-info-meta-item {
    display: block;
    margin-bottom: 4px;
    white-space: normal;
  }

  .file-info-value,
  .file-info-path-row .file-info-value {
    display: block;
    white-space: normal;
    word-break: break-all;
  }

  .tech-info-flow {
    gap: 10px;
  }

  .tech-info-row {
    grid-template-columns: 42px minmax(0, 1fr);
  }

  .external-link-row {
    padding: 18px 16px 34px;
  }
}
</style>
