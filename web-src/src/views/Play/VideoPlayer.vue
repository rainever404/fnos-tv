<script setup>
import flvjs from 'flv.js';
import Hls from 'hls.js';
import {computed, getCurrentInstance, onBeforeUnmount, onMounted, ref} from "vue";

import Artplayer from "./ArtPlayer.vue";
import {onBeforeRouteLeave, onBeforeRouteUpdate} from "vue-router";
import VueCookies from "vue-cookies";
import {usePlayerData} from "@/store.js";
import sortedIndexBy from 'lodash-es/sortedIndexBy'
import artplayerPluginDanmuku from "artplayer-plugin-danmuku";
import axios from "axios";
import md5 from 'js-md5';
import {createBlobVTTUrl, M3U8SubtitlePlugin} from "./subtitle.js"

const instance = getCurrentInstance();
const proxy = instance.appContext.config.globalProperties;
const COMMON = proxy.$COMMON;
const device = proxy.$device;

const PlayerData = usePlayerData()
function isMobileRuntime() {
  const userAgent = navigator.userAgent || ''
  const isMobileUserAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|Mobile/i.test(userAgent)
  const hasCoarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches || false
  const hasTouch = Number(navigator.maxTouchPoints || 0) > 0
  const viewport = window.visualViewport
  const widthCandidates = [
    window.innerWidth,
    document.documentElement?.clientWidth,
    viewport?.width,
    window.screen?.width,
    window.screen?.availWidth
  ].map(value => Number(value || 0)).filter(value => value > 0)
  const heightCandidates = [
    window.innerHeight,
    document.documentElement?.clientHeight,
    viewport?.height,
    window.screen?.height,
    window.screen?.availHeight
  ].map(value => Number(value || 0)).filter(value => value > 0)
  const shortSide = Math.min(...widthCandidates, ...heightCandidates)
  const isSmallTouchScreen = Number.isFinite(shortSide) && shortSide > 0 && shortSide <= 1200
  return isMobileUserAgent || hasCoarsePointer || (hasTouch && isSmallTouchScreen)
}

function isCompactPlayerViewport() {
  const viewport = window.visualViewport
  const widthCandidates = [
    window.innerWidth,
    document.documentElement?.clientWidth,
    viewport?.width
  ].map(value => Number(value || 0)).filter(value => value > 0)
  const heightCandidates = [
    window.innerHeight,
    document.documentElement?.clientHeight,
    viewport?.height
  ].map(value => Number(value || 0)).filter(value => value > 0)
  const shortSide = Math.min(...widthCandidates, ...heightCandidates)
  return Number.isFinite(shortSide) && shortSide > 0 && shortSide <= 820
}

const MOBILE_UA = isMobileRuntime() || isCompactPlayerViewport();
const mobileUiActive = ref(MOBILE_UA);
const mobilePortraitDanmuControlsActive = ref(MOBILE_UA);
let art = null;
let lastDanmuLoadedUntil = 0;
let mobileLandscapeActive = false;
const mobileLandscapeModeActive = ref(false);
const mobilePortraitActive = ref(false);
const forcedLandscapeActive = ref(false);
const fullscreenChangeEvents = ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'];
const guid = ref(null);
const episode_guid = ref(null);
const gallery_type = ref(null);
const EpisodeList = ref(null);
const StreamList = ref(null);
const QualityData = ref(null);
const playInfo = ref(null);
const playSessionInfo = ref(null);
const showModal = ref(false);
const loading = ref(true);
const playError = ref('');
const urlBase = ref(null);
const url = ref(null);
const playUrl = ref(null);
const requestedMediaGuid = ref(null);
const skipList = ref([])
const seasonConfig = ref({})
const showSetUp = ref(false)
const timerSendPlayRecord = ref(null);
const emojos = ref(null);
const allDanmaku = ref({})
const danmuSource = ref('custom')
localStorage.setItem('danmu_source', 'custom')
const danmuSourceOptions = [
  {html: '自建弹幕', value: 'custom'}
]
const currentSubtitle = ref(null);
const use302Play = localStorage.getItem('use_302_play');
const use_302_play = ref(use302Play === null ? false : use302Play === 'true')
let vttUrls = ref([])
const danmuConfig = ref({
  loadedUntil: 0,
  segmentDuration: 10
})
const playerFrame = ref(null);
const brightnessLevel = ref(Number(localStorage.getItem('player_brightness') || 1));
const brightnessOverlayOpacity = ref(0);
const gestureFeedback = ref({
  visible: false,
  title: '',
  value: '',
  progress: null
});
let gestureFeedbackTimer = null;
const touchState = {
  active: false,
  mode: '',
  startX: 0,
  startY: 0,
  startTime: 0,
  startVolume: 0.5,
  startBrightness: 1,
  previewTime: 0,
  width: 0,
  height: 0,
  moved: false
};
let playerTouchFrame = null;
let mobileDanmuFallbackSyncTimer = null;
let mobileControlRefreshTimers = [];
let mobileControlObserver = null;
let mobileControlObserverRoot = null;
let mobileControlMutationScheduled = false;
const boundMobileDanmuPanelTriggers = new WeakSet();
let lastMobileDanmuSettingsToggleAt = 0;
let lastMobileDanmuSettingsTouchAt = 0;
let lastMobileDanmuSettingsPointerUpAt = 0;
let lastMobileDanmuSettingsTouchEndAt = 0;
let mobileDanmuSettingsPressStarted = false;
const MOBILE_DANMU_SETTINGS_PRESS_DEDUPE_MS = 140;
const MOBILE_DANMU_SETTINGS_RELEASE_DEDUPE_MS = 900;
const MOBILE_DANMU_SETTINGS_TRIGGER_SELECTOR = [
  '.art-control-mobile-danmu-settings-trigger',
  '.artplayer-plugin-danmuku .apd-config',
  '.artplayer-plugin-danmuku [class*="apd-config"]',
  '.artplayer-plugin-danmuku .apd-style',
  '.artplayer-plugin-danmuku [class*="apd-style"]'
].join(', ');
const MOBILE_CORE_CONTROL_SELECTOR = [
  '.art-control-mobile-danmu-toggle',
  '.art-control-mobile-danmu-settings-trigger',
  '.art-control-画质',
  '.art-control-倍速',
  '.art-control-字幕',
  '.art-control-setting',
  '.art-control-mobile-landscape-fullscreen',
  '.art-control-fullscreen',
  '.art-control-fullscreenWeb'
].join(',');

const qualitySelector = ref([]);
const currentQuality = ref(null);

const IsFullscreen = () => {
  art.fullscreen
}

guid.value = proxy.$route.query.guid
episode_guid.value = proxy.$route.query.episode_guid || proxy.$route.query.season_id || null
gallery_type.value = proxy.$route.query.gallery_type
requestedMediaGuid.value = proxy.$route.query.media_guid || null

const DANMU_OUTLINE_SHADOW = 'rgb(0, 0, 0) 1px 0 1px, rgb(0, 0, 0) 0 1px 1px, rgb(0, 0, 0) 0 -1px 1px, rgb(0, 0, 0) -1px 0 1px'

function applyDanmuVisibleStyle(danmu) {
  if (!danmu) {
    return true
  }
  danmu.border = false
  danmu.style = {
    ...(danmu.style || {}),
    textShadow: danmu_setting.outline === false ? 'none' : DANMU_OUTLINE_SHADOW
  }
  return true
}

function defaultDanmuSetting() {
  return {
    speed: 8.5,
    opacity: 0.58,
    fontSize: window.innerWidth <= 768 ? '2.5%' : '3%',
    color: '#FFFFFF',
    mode: 0,
    modes: [0, 1, 2],
    margin: window.innerWidth <= 768 ? [5, '85%'] : [10, '75%'],
    antiOverlap: true,
    outline: true,
    useWorker: true,
    synchronousPlayback: true,
    beforeVisible: applyDanmuVisibleStyle,
    theme: 'dark',
    heatmap: false,
    width: 0,
    emitter: false,
    OPACITY: {min: 20, max: 100},
    FONT_SIZE: {min: 16, max: 42},
    SPEED: {
      steps: [
        {name: '极慢', value: 10},
        {name: '较慢', value: 7.5, hide: true},
        {name: '适中', value: 5},
        {name: '较快', value: 2.5, hide: true},
        {name: '极快', value: 1}
      ]
    }
  }
}

function normalizeDanmuSetting(value = {}) {
  const base = defaultDanmuSetting()
  return {
    ...base,
    ...value,
    color: value.color || base.color,
    modes: Array.isArray(value.modes) ? value.modes : base.modes,
    outline: value.outline !== false,
    beforeVisible: applyDanmuVisibleStyle,
    theme: 'dark',
    emitter: false,
    width: 0,
    OPACITY: {...base.OPACITY, ...(value.OPACITY || {})},
    FONT_SIZE: {...base.FONT_SIZE, ...(value.FONT_SIZE || {})},
    SPEED: {...base.SPEED, ...(value.SPEED || {})}
  }
}

function getStoredDanmuSetting() {
  try {
    const stored = window.localStorage.danmu_setting
    if (!stored) {
      return defaultDanmuSetting()
    }
    return normalizeDanmuSetting(JSON.parse(stored)?.value || {})
  } catch {
    return defaultDanmuSetting()
  }
}

const danmu_setting = getStoredDanmuSetting()
window.localStorage.danmu_setting = JSON.stringify({value: danmu_setting})
function getMobileDanmuFontSize(value) {
  const text = String(value ?? '')
  if (text.includes('%')) {
    return window.innerWidth <= 768 ? 24 : 28
  }
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) && parsed >= 16 ? parsed : (window.innerWidth <= 768 ? 24 : 28)
}

const mobileDanmuVisible = ref(true);
const showMobileDanmuSettings = ref(false);
const showMobileDanmuFallbackControls = ref(mobileUiActive.value);
const mobileArtDanmuControlsVisible = ref(false);
const mobileArtTextControlsVisible = ref(false);
const mobilePlayerControlsVisible = ref(true);
const mobileControlMenu = ref('');
const mobilePlaybackRate = ref(Number(localStorage.playbackRate || 1) || 1);
const mobileDanmuSetting = ref({
  opacity: Math.round((Number(danmu_setting.opacity) || 0.58) * 100),
  fontSize: getMobileDanmuFontSize(danmu_setting.fontSize),
  speed: Number(danmu_setting.speed) || 8.5,
  area: Array.isArray(danmu_setting.margin) ? Number.parseFloat(danmu_setting.margin[1]) || 85 : 85,
  modes: Array.isArray(danmu_setting.modes) ? [...danmu_setting.modes] : [0, 1, 2],
  antiOverlap: danmu_setting.antiOverlap !== false,
  outline: danmu_setting.outline !== false,
  synchronousPlayback: danmu_setting.synchronousPlayback !== false
});
const shouldShowMobileDanmuControls = computed(() => {
  return false
})
const shouldShowMobilePortraitDockControls = computed(() => false)
const shouldUsePortraitDanmuPortalControls = computed(() => {
  return false
})
const shouldShowMobileDanmuInlineControls = computed(() => {
  return isMobileUiActive() &&
      isPortraitMobilePlayer() &&
      mobilePlayerControlsVisible.value &&
      !shouldShowMobilePortraitDockControls.value &&
      !shouldUsePortraitDanmuPortalControls.value &&
      !mobileArtTextControlsVisible.value
})
const shouldShowMobileDanmuPortalControls = computed(() => {
  if (!isMobileUiActive()) {
    return false
  }
  if (shouldShowMobilePortraitDockControls.value) {
    return false
  }
  if (isPortraitMobilePlayer()) {
    return shouldUsePortraitDanmuPortalControls.value
  }
  if (shouldUsePortraitDanmuPortalControls.value) {
    return true
  }
  return shouldShowMobileDanmuControls.value
})
const mobileDanmuPortalLandscapeActive = computed(() => forcedLandscapeActive.value || isForcedLandscapeActive())
const mobileDanmuPortalPortraitActive = computed(() => isMobileUiActive() && isPortraitViewport() && !mobileDanmuPortalLandscapeActive.value)
const shouldShowMobileExtraControls = computed(() => false)
const shouldShowMobileInlineTextControls = computed(() => {
  return false
})
const mobileQualityOptions = computed(() => qualitySelector.value.flatMap(group => group.selector || []))
const mobileSubtitleOptions = computed(() => {
  const streams = StreamList.value?.subtitle_streams || []
  return [...new Map(streams.map(item => [item.index, item])).values()]
})
const mobileQualityLabel = computed(() => currentQuality.value?.resolution || QualityData.value?.[0]?.resolution || '画质')
const mobileSubtitleLabel = computed(() => currentSubtitle.value ? '字幕' : '字幕')
const mobileRateOptions = [0.5, 0.8, 1, 1.2, 1.5, 1.8, 2, 2.5, 2.8, 3]

const setting = ref({
  url: "",
  id: "",
  customType: {
    m3u8: function (video, url) {
      const hls = new Hls({
        enableWebVTT: false, // 仍然关闭 WebVTT 的原生渲染
        xhrSetup: (xhr, reqUrl) => {
          if (reqUrl.endsWith('.vtt')) {
            // 在真正发送前就中断请求
            xhr.abort();
          }
          // 还可以在这里对其他请求做自定义头等处理
        },
      });
      hls.loadSource(url)
      hls.attachMedia(video)
    },
    flv: function (video, url) {
      const flvPlayer = flvjs.createPlayer({
        type: 'flv',
        url: url
      })
      flvPlayer.attachMediaElement(video)
      flvPlayer.load()
    },
    mkv: function (video, url) {
      const flvPlayer = flvjs.createPlayer({
        type: 'mkv',
        url: url
      })
      flvPlayer.attachMediaElement(video)
      flvPlayer.load()
    },
    mp4: function (video, url) {
      const flvPlayer = flvjs.createPlayer({
        type: 'mkv',
        url: url
      })
      flvPlayer.attachMediaElement(video)
      flvPlayer.load()
    }
  },
  title: "",
  hotkey: true,
  poster: '',
  volume: 0.5,
  isLive: false,
  muted: false,
  autoplay: false,
  lock: true,
  pip: false,
  autoSize: false,
  autoMini: false,
  screenshot: !MOBILE_UA,
  setting: true,
  loop: true,
  flip: false,    // 是否显示视频翻转功能，目前只出现在 设置面板 和 右键菜单 里
  playbackRate: false,
  aspectRatio: true,
  fastForward: true,
  fullscreen: !MOBILE_UA,
  fullscreenWeb: !MOBILE_UA,
  subtitleOffset: false,
  miniProgressBar: false,
  mutex: true,
  backdrop: true,
  playsInline: true,
  gesture: false,
  autoPlayback: true,
  autoOrientation: true,
  airplay: true,
  theme: '#23ade5',
  lang: navigator.language.toLowerCase(),
  // whitelist: [(ua) => /iPhone/gi.test(ua)],
  moreVideoAttr: {
    crossOrigin: 'anonymous',
  },
  settings: [],
  controls: [
    {
      name: 'mobile-danmu-toggle',
      index: 0.1,
      position: 'right',
      html: '<span class="mobile-art-danmu-symbol">弹</span>',
      tooltip: '弹幕',
      click: function () {
        toggleMobileDanmuVisible()
      }
    },
    {
      name: 'mobile-danmu-settings-trigger',
      index: 0.2,
      position: 'right',
      html: '<span class="mobile-art-danmu-symbol">弹</span><i class="bx bx-slider-alt"></i>',
      tooltip: '弹幕设置',
      mounted: function ($ref) {
        bindMobileDanmuPanelTriggerElement($ref)
      },
      click: function (...args) {
        toggleMobileDanmuSettingsFromTrigger(...args)
      }
    },
    {
      name: 'mobile-landscape-fullscreen',
      index: 99,
      position: 'right',
      html: '<i class="bx bx-fullscreen"></i>',
      tooltip: '横屏全屏',
      click: async function () {
        await toggleMobileLandscapeFullscreen()
      }
    },
    // {
    //     position: 'right',
    //     index: 15,
    //     html: '<img width="18" heigth="18" src="./images/download.svg">',
    //     tooltip: '下载视频',
    //     style: {
    //         color: 'red',
    //     },
    //     click: function () {
    //         const a = document.createElement('a');
    //         a.setAttribute('href', url.value);
    //         a.setAttribute('target', "_blank");
    //         a.setAttribute('download', "001.mp4");
    //         a.click();
    //     },
    // }


  ],
  quality: [],
  icons: {
    loading: '<img width="60" heigth="60" src="./images/loading.gif">',
    state: '<img width="60" heigth="60" src="./images/play2.svg">',
    indicator: '<img width="16" heigth="16" src="./images/indicator.svg">',
  },
  plugins: [
    artplayerPluginDanmuku(danmu_setting)
  ],
})
const ArtplayerStyle = {
  width: '100%',
  height: '100%',
  maxHeight: '100%',
  margin: '0',
}

const debounce = (fn, delay) => {
  let timer = null;
  return function () {
    let context = this;
    let args = arguments;
    clearTimeout(timer);
    timer = setTimeout(function () {
      fn.apply(context, args);
    }, delay);
  }
}

function getDanmuparams() {
  let episode_number = playInfo.value.episode_number === undefined ? 1 : playInfo.value.episode_number;
  let episode_title = playInfo.value.title;
  let season = playInfo.value.type !== "Movie";
  let title = season ? playInfo.value.tv_title : playInfo.value.title
  let season_number = season ? playInfo.value.season_number : 1
  return new URLSearchParams({
    douban_id: playInfo.value.douban_id ?? '',
    episode_number: episode_number ?? '',
    episode_title: episode_title ?? '',
    title: title ?? '',
    season_number: season_number ?? '',
    season: String(season),
    guid: episode_guid.value ?? '',
    parent_guid: guid.value ?? '',
    danmu_source: danmuSource.value
  }).toString()
}

function getDanmuSourceLabel(value = danmuSource.value) {
  return danmuSourceOptions.find(item => item.value === value)?.html || '自建弹幕'
}

function getPlayerTitle() {
  if (!playInfo.value) {
    return ''
  }
  if (playInfo.value.type === 'Movie') {
    return playInfo.value.title || ''
  }
  const showTitle = playInfo.value.tv_title || ''
  const episodeTitle = playInfo.value.title ? ` ${playInfo.value.title}` : ''
  const episodeNumber = playInfo.value.episode_number ? `第${playInfo.value.episode_number}集` : ''
  return `${showTitle} ${episodeNumber}${episodeTitle}`.trim()
}

function goBack() {
  const backPath = window.history.state?.back || ''
  const currentPath = proxy.$route.fullPath
  if (backPath && backPath !== currentPath && !backPath.startsWith('/player')) {
    proxy.$router.back()
    return
  }
  if (guid.value) {
    proxy.$router.push({
      path: '/video',
      query: {
        guid: guid.value,
        gallery_type: gallery_type.value || playInfo.value?.type || 'Movie'
      }
    })
    return
  }
  proxy.$router.push({path: '/'})
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(seconds || 0))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatTimeDelta(seconds) {
  const total = Math.max(0, Math.floor(Math.abs(seconds || 0)))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function hasPlayableDuration() {
  return !!art && Number.isFinite(art.duration) && art.duration > 0
}

function isEditableTarget(target) {
  return !!target?.closest?.('input, textarea, select, [contenteditable="true"], .n-input, .n-input-number')
}

function isPlayerInteractiveTarget(target) {
  if (!target?.closest) {
    return false
  }
  if (target.closest('.art-control-progress, .art-progress, .art-control-progress-inner, .art-progress-played, .art-progress-loaded, .art-progress-hover')) {
    return false
  }
  return !!target.closest(
      '.art-setting, .art-contextmenus, .art-volume-panel, .art-control, .artplayer-plugin-danmuku, .apd-config-panel, .apd-style-panel, .mobile-danmu-controls, .mobile-danmu-settings, .mobile-extra-controls, .mobile-inline-text-controls, .mobile-extra-menu, .player-back-button, button, a, input, textarea, select, [contenteditable="true"]'
  )
}

function refreshMobileUiState() {
  const active = isMobileRuntime() || isCompactPlayerViewport()
  mobileUiActive.value = active
  mobilePortraitActive.value = active && isPortraitViewport() && !isForcedLandscapeActive()
  const shouldShowPortraitControls = active && !isForcedLandscapeActive()
  mobilePortraitDanmuControlsActive.value = active && (isForcedLandscapeActive() || shouldShowPortraitControls)
  showMobileDanmuFallbackControls.value = false
  if (!active) {
    showMobileDanmuSettings.value = false
    showMobileDanmuFallbackControls.value = false
    mobileArtDanmuControlsVisible.value = false
    mobileArtTextControlsVisible.value = false
  }
  return active
}

function isMobileUiActive() {
  return mobileUiActive.value || MOBILE_UA || isCompactPlayerViewport()
}

function isMobileDanmuControlContext() {
  return isMobileUiActive() ||
      isMobileRuntime() ||
      isCompactPlayerViewport() ||
      !!playerFrame.value?.querySelector?.(MOBILE_DANMU_SETTINGS_TRIGGER_SELECTOR)
}

function isPortraitMobilePlayer() {
  return isMobileUiActive() && !isForcedLandscapeActive() && isPortraitViewport()
}

function isForcedLandscapeActive() {
  return isMobileUiActive() && (forcedLandscapeActive.value || playerFrame.value?.classList.contains('is-forced-landscape'))
}

function shouldForceMobileDanmuFallbackControls() {
  return false
}

function shouldShowPortraitFloatingDanmuControls() {
  return false
}

function touchPointForPlayer(touch) {
  if (isForcedLandscapeActive()) {
    return {
      x: touch.clientY,
      y: -touch.clientX
    }
  }
  return {
    x: touch.clientX,
    y: touch.clientY
  }
}

function setMobileDanmuSettingsVisible(visible) {
  showMobileDanmuSettings.value = !!visible
  const root = playerFrame.value
  const panel = root?.querySelector?.('.mobile-danmu-settings')
  if (panel) {
    panel.classList.toggle('is-visible', !!visible)
  }
  syncMobileDanmuControlButtons()
}

function closeMobileDanmuPanels() {
  if (!isMobileDanmuControlContext()) {
    return
  }
  setMobileDanmuSettingsVisible(false)
  mobileControlMenu.value = ''
  playerFrame.value?.querySelectorAll?.('.apd-config.is-panel-open, .apd-style.is-panel-open, [class*="apd-config"].is-panel-open, [class*="apd-style"].is-panel-open').forEach(panel => {
    panel.classList.remove('is-panel-open')
  })
}

function preventMobileDanmuTriggerEvent(event) {
  if (event?.cancelable !== false) {
    event?.preventDefault?.()
  }
  event?.stopPropagation?.()
  event?.stopImmediatePropagation?.()
}

function stopMobileDanmuTriggerEvent(event) {
  event?.stopPropagation?.()
  event?.stopImmediatePropagation?.()
}

function keepMobileControlsVisible() {
  if (!isMobileUiActive()) {
    return
  }
  mobilePlayerControlsVisible.value = true
  if (art?.controls) {
    art.controls.show = true
  }
}

function closeArtSettingPanel() {
  try {
    if (art?.setting) {
      art.setting.show = false
    }
  } catch {
  }
}

function isMobileDanmuTriggerActivator(event) {
  const type = event?.type || ''
  if (type === 'touchend' || type === 'click' || type === 'mouseup') {
    return true
  }
  if (type === 'pointerup') {
    return event.button === undefined || event.button === 0
  }
  return false
}

function isMobileDanmuTriggerPress(event) {
  const type = event?.type || ''
  if (type === 'touchstart' || type === 'mousedown') {
    return true
  }
  if (type === 'pointerdown') {
    return event.button === undefined || event.button === 0
  }
  return false
}

function getMobileDanmuTriggerEvent(args = []) {
  return args.find(item => item?.target && (typeof item.preventDefault === 'function' || typeof item.stopPropagation === 'function')) || null
}

function markMobileDanmuTriggerEvent(event) {
  if (!event) {
    return false
  }
  if (event.__fnosMobileDanmuSettingsHandled) {
    return true
  }
  try {
    event.__fnosMobileDanmuSettingsHandled = true
  } catch {
  }
  return false
}

function getMobileDanmuTriggerPoint(event) {
  const touch = event?.changedTouches?.[0] || event?.touches?.[0]
  if (touch) {
    return {x: touch.clientX, y: touch.clientY}
  }
  if (Number.isFinite(event?.clientX) && Number.isFinite(event?.clientY)) {
    return {x: event.clientX, y: event.clientY}
  }
  return null
}

function findMobileDanmuSettingsTrigger(event) {
  const root = playerFrame.value
  const target = event?.target
  const directTrigger = target?.closest?.(MOBILE_DANMU_SETTINGS_TRIGGER_SELECTOR)
  if (directTrigger && root?.contains(directTrigger)) {
    return directTrigger
  }
  const pathTrigger = event?.composedPath?.().find?.(item => {
    return item?.matches?.(MOBILE_DANMU_SETTINGS_TRIGGER_SELECTOR) && root?.contains(item)
  })
  if (pathTrigger) {
    return pathTrigger
  }
  const point = getMobileDanmuTriggerPoint(event)
  if (!root || !point) {
    return null
  }
  return Array.from(root.querySelectorAll(MOBILE_DANMU_SETTINGS_TRIGGER_SELECTOR)).find(trigger => {
    const rect = trigger.getBoundingClientRect()
    return point.x >= rect.left - 18 &&
        point.x <= rect.right + 18 &&
        point.y >= rect.top - 18 &&
        point.y <= rect.bottom + 18
  }) || null
}

function shouldSkipMobileDanmuSettingsActivator(event, now) {
  const type = event?.type || ''
  if (!event) {
    return now - lastMobileDanmuSettingsToggleAt < MOBILE_DANMU_SETTINGS_PRESS_DEDUPE_MS
  }
  if (markMobileDanmuTriggerEvent(event)) {
    return true
  }
  if (type === 'touchstart') {
    return now - lastMobileDanmuSettingsTouchAt < MOBILE_DANMU_SETTINGS_PRESS_DEDUPE_MS
  }
  if (type === 'pointerdown' && event.pointerType !== 'mouse') {
    return now - lastMobileDanmuSettingsTouchAt < MOBILE_DANMU_SETTINGS_PRESS_DEDUPE_MS
  }
  if (type === 'touchend') {
    return now - Math.max(lastMobileDanmuSettingsPointerUpAt, lastMobileDanmuSettingsTouchAt) < MOBILE_DANMU_SETTINGS_RELEASE_DEDUPE_MS
  }
  if (type === 'pointerup' && event.pointerType !== 'mouse') {
    return now - lastMobileDanmuSettingsTouchAt < MOBILE_DANMU_SETTINGS_RELEASE_DEDUPE_MS
  }
  if (type === 'click') {
    return now - Math.max(lastMobileDanmuSettingsTouchEndAt, lastMobileDanmuSettingsPointerUpAt, lastMobileDanmuSettingsTouchAt) < MOBILE_DANMU_SETTINGS_RELEASE_DEDUPE_MS
  }
  if (type === 'pointerup' && event.pointerType === 'mouse') {
    return false
  }
  if (type === 'mouseup') {
    return false
  }
  return false
}

function noteMobileDanmuSettingsActivator(event, now) {
  const type = event?.type || ''
  if (type === 'touchstart') {
    lastMobileDanmuSettingsTouchAt = now
  }
  if (type === 'pointerdown' && event?.pointerType !== 'mouse') {
    lastMobileDanmuSettingsTouchAt = now
  }
  if (type === 'pointerup') {
    lastMobileDanmuSettingsPointerUpAt = now
  }
  if (type === 'mouseup') {
    lastMobileDanmuSettingsPointerUpAt = now
  }
  if (type === 'touchend') {
    lastMobileDanmuSettingsTouchEndAt = now
    lastMobileDanmuSettingsTouchAt = now
  }
  if (type === 'click' && event?.pointerType !== 'mouse') {
    lastMobileDanmuSettingsTouchAt = now
  }
  lastMobileDanmuSettingsToggleAt = now
  mobileDanmuSettingsPressStarted = false
}

function handleDirectMobileDanmuPanelTrigger(event) {
  if (!isMobileDanmuControlContext()) {
    return
  }
  const isPointerEvent = String(event?.type || '').startsWith('pointer')
  const isMousePointer = isPointerEvent && event.pointerType === 'mouse'
  if (isMousePointer && event.button !== 0) {
    return
  }
  const target = event.target
  const trigger = target?.closest?.(MOBILE_DANMU_SETTINGS_TRIGGER_SELECTOR)
  if (!trigger || !playerFrame.value?.contains(trigger)) {
    return
  }
  if (isMobileDanmuTriggerPress(event)) {
    const type = event?.type || ''
    const shouldToggleOnPress = type === 'touchstart' || (type === 'pointerdown' && event.pointerType !== 'mouse')
    if (shouldToggleOnPress) {
      toggleMobileDanmuSettingsFromTrigger(event)
    } else {
      mobileDanmuSettingsPressStarted = true
      stopMobileDanmuTriggerEvent(event)
      keepMobileControlsVisible()
    }
    return
  }
  if (!isMobileDanmuTriggerActivator(event)) {
    return
  }
  triggerMobileDanmuSettingsPanel(event)
}

function toggleMobileDanmuSettingsFromTrigger(...args) {
  if (!isMobileDanmuControlContext()) {
    return
  }
  const event = getMobileDanmuTriggerEvent(args)
  const now = window.performance?.now?.() || Date.now()
  if (shouldSkipMobileDanmuSettingsActivator(event, now)) {
    preventMobileDanmuTriggerEvent(event)
    return
  }
  noteMobileDanmuSettingsActivator(event, now)
  preventMobileDanmuTriggerEvent(event)
  keepMobileControlsVisible()
  closeArtSettingPanel()
  const shouldOpen = !showMobileDanmuSettings.value
  closeMobileDanmuPanels()
  if (shouldOpen) {
    mobileControlMenu.value = ''
    setMobileDanmuSettingsVisible(true)
    if (art?.controls) {
      art.controls.show = true
      mobilePlayerControlsVisible.value = true
    }
  }
  syncMobileDanmuControlButtons()
}

function triggerMobileDanmuSettingsPanel(event) {
  if (!isMobileDanmuTriggerActivator(event)) {
    return
  }
  toggleMobileDanmuSettingsFromTrigger(event)
}

function bindMobileDanmuPanelTriggerElement(trigger) {
  if (!trigger || boundMobileDanmuPanelTriggers.has(trigger)) {
    return
  }
  boundMobileDanmuPanelTriggers.add(trigger)
  trigger.setAttribute('data-mobile-danmu-settings-trigger', '1')
  trigger.setAttribute('role', 'button')
  trigger.style.touchAction = 'manipulation'
  trigger.style.pointerEvents = 'auto'
  trigger.style.position = trigger.style.position || 'relative'
  trigger.style.zIndex = '45'
  trigger.querySelectorAll?.('span, i, svg, path, .apd-icon').forEach(child => {
    child.style.pointerEvents = 'none'
  })
  if (window.PointerEvent) {
    trigger.addEventListener('pointerdown', handleDirectMobileDanmuPanelTrigger, {capture: true})
    trigger.addEventListener('pointerup', handleDirectMobileDanmuPanelTrigger, {capture: true})
  }
  trigger.addEventListener('mousedown', handleDirectMobileDanmuPanelTrigger, {capture: true})
  trigger.addEventListener('mouseup', handleDirectMobileDanmuPanelTrigger, {capture: true})
  trigger.addEventListener('touchstart', handleDirectMobileDanmuPanelTrigger, {capture: true, passive: false})
  trigger.addEventListener('touchend', handleDirectMobileDanmuPanelTrigger, {capture: true, passive: false})
  trigger.addEventListener('click', handleDirectMobileDanmuPanelTrigger, {capture: true})
}

function bindMobileDanmuPanelTriggers() {
  const root = playerFrame.value
  if (!root || !isMobileUiActive()) {
    return
  }
  root.querySelectorAll(MOBILE_DANMU_SETTINGS_TRIGGER_SELECTOR).forEach(trigger => {
    bindMobileDanmuPanelTriggerElement(trigger)
  })
}

function isMobileArtControlVisible(selector) {
  const root = playerFrame.value
  const el = root?.querySelector?.(selector) || document.querySelector?.(selector)
  if (!el) {
    return false
  }
  const style = window.getComputedStyle(el)
  if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
    return false
  }
  const rect = el.getBoundingClientRect()
  return rect.width >= 20 &&
      rect.height >= 20 &&
      rect.right > 0 &&
      rect.left < window.innerWidth &&
      rect.bottom > 0 &&
      rect.top < window.innerHeight
}

function areMobileTextControlsVisible() {
  const requiredControls = ['.art-control-倍速']
  if (qualitySelector.value.length > 0) {
    requiredControls.push('.art-control-画质')
  }
  if (StreamList.value?.subtitle_streams?.length > 0) {
    requiredControls.push('.art-control-字幕')
  }
  return requiredControls.every(selector => isMobileArtControlVisible(selector))
}

function normalizeMobileCoreControls() {
  const root = playerFrame.value
  if (!root || !isMobileUiActive()) {
    return
  }
  const usePortraitInlineTextControls = false
  root.querySelectorAll(MOBILE_CORE_CONTROL_SELECTOR).forEach(button => {
    const isTextControl = button.matches?.('.art-control-画质, .art-control-倍速, .art-control-字幕')
    if (usePortraitInlineTextControls && isTextControl) {
      button.classList.add('art-control-hide')
      button.style.setProperty('display', 'none', 'important')
      button.style.setProperty('visibility', 'hidden', 'important')
      button.style.setProperty('opacity', '0', 'important')
      button.style.setProperty('pointer-events', 'none', 'important')
      return
    }
    button.classList.remove('art-control-hide')
    button.style.setProperty('display', 'flex', 'important')
    button.style.setProperty('visibility', 'visible', 'important')
    button.style.setProperty('opacity', '1', 'important')
    button.style.setProperty('pointer-events', 'auto', 'important')
    button.style.setProperty('margin-left', '0', 'important')
    button.style.removeProperty('transform')
    if (isTextControl) {
      button.style.setProperty('overflow', 'visible', 'important')
    }
  })
  root.querySelectorAll('.art-control-mobile-danmu-toggle span, .art-control-mobile-danmu-settings-trigger span, .art-control-mobile-danmu-settings-trigger i').forEach(child => {
    child.style.pointerEvents = 'none'
  })
}

function scheduleMobileControlDomRefresh() {
  if (mobileControlMutationScheduled || !isMobileUiActive()) {
    return
  }
  mobileControlMutationScheduled = true
  window.requestAnimationFrame(() => {
    mobileControlMutationScheduled = false
    if (!isMobileUiActive()) {
      return
    }
    bindMobileDanmuPanelTriggers()
    normalizeMobileCoreControls()
    syncMobilePlayerControlsVisibleFromDom()
    syncMobileDanmuControlButtons()
  })
}

function observeMobileControlDom() {
  const root = playerFrame.value?.querySelector?.('.art-video-player') || playerFrame.value
  if (!root || !isMobileUiActive() || typeof window.MutationObserver !== 'function') {
    return
  }
  if (mobileControlObserverRoot === root && mobileControlObserver) {
    return
  }
  mobileControlObserver?.disconnect()
  mobileControlObserverRoot = root
  mobileControlObserver = new MutationObserver(scheduleMobileControlDomRefresh)
  mobileControlObserver.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'style']
  })
}

function disconnectMobileControlDomObserver() {
  mobileControlObserver?.disconnect()
  mobileControlObserver = null
  mobileControlObserverRoot = null
  mobileControlMutationScheduled = false
}

function syncMobilePlayerControlsVisibleFromDom(root = playerFrame.value) {
  if (!root || !isMobileUiActive()) {
    return
  }
  mobilePlayerControlsVisible.value = !!root.querySelector('.art-video-player.art-control-show')
}

function syncMobileDanmuFallbackControls() {
  if (!refreshMobileUiState()) {
    return
  }
  if (art && playerFrame.value) {
    bindPlayerTouchListeners()
    bindMobileDanmuPanelTriggers()
    normalizeMobileCoreControls()
    observeMobileControlDom()
  }
  window.requestAnimationFrame(() => {
    refreshMobileUiState()
    bindMobileDanmuPanelTriggers()
    normalizeMobileCoreControls()
    syncMobilePlayerControlsVisibleFromDom()
    const hasArtControls = isMobileArtControlVisible('.art-control-mobile-danmu-toggle') &&
        isMobileArtControlVisible('.art-control-mobile-danmu-settings-trigger')
    mobileArtDanmuControlsVisible.value = hasArtControls
    mobileArtTextControlsVisible.value = areMobileTextControlsVisible()
    const shouldForcePortraitControls = isPortraitMobilePlayer()
    const shouldForceLandscapeControls = isForcedLandscapeActive()
    mobilePortraitDanmuControlsActive.value = shouldForcePortraitControls || shouldForceLandscapeControls
    showMobileDanmuFallbackControls.value = false
    syncMobileDanmuControlButtons()
  })
}

function scheduleMobileDanmuFallbackSync() {
  if (!refreshMobileUiState()) {
    return
  }
  syncMobileDanmuFallbackControls()
  window.setTimeout(syncMobileDanmuFallbackControls, 160)
  window.setTimeout(syncMobileDanmuFallbackControls, 640)
  window.setTimeout(syncMobileDanmuFallbackControls, 1600)
  window.setTimeout(syncMobileDanmuFallbackControls, 3000)
}

function startMobileDanmuFallbackSyncLoop() {
  if (mobileDanmuFallbackSyncTimer || !isMobileUiActive()) {
    return
  }
  mobileDanmuFallbackSyncTimer = window.setInterval(syncMobileDanmuFallbackControls, 1000)
}

function stopMobileDanmuFallbackSyncLoop() {
  if (!mobileDanmuFallbackSyncTimer) {
    return
  }
  clearInterval(mobileDanmuFallbackSyncTimer)
  mobileDanmuFallbackSyncTimer = null
}

function clearMobileControlRefreshTimers() {
  mobileControlRefreshTimers.forEach(timer => window.clearTimeout(timer))
  mobileControlRefreshTimers = []
}

function refreshPlayerControls() {
  if (!art) {
    return
  }
  void UpdateControl(art).then(() => {
    scheduleMobileDanmuFallbackSync()
    syncMobileDanmuControlButtons()
  })
}

function schedulePlayerControlRefresh() {
  clearMobileControlRefreshTimers()
  refreshPlayerControls()
  ;[120, 360, 900, 1600].forEach(delay => {
    const timer = window.setTimeout(refreshPlayerControls, delay)
    mobileControlRefreshTimers.push(timer)
  })
}

function handleMobileDanmuPanelClick(event) {
  if (!isMobileUiActive()) {
    return
  }
  const root = playerFrame.value
  const target = event.target
  if (root && target && root.contains(target)) {
    keepMobileControlsVisible()
  }
  if (target?.closest?.('.mobile-danmu-controls, .mobile-danmu-settings, .mobile-extra-controls, .mobile-inline-text-controls, .mobile-extra-menu')) {
    return
  }
  if (!root || !target || !root.contains(target)) {
    if (event?.type === 'click') {
      closeMobileDanmuPanels()
    }
    return
  }
  if (target.closest('.apd-config-panel, .apd-style-panel')) {
    return
  }
  const panelTrigger = findMobileDanmuSettingsTrigger(event)
  if (panelTrigger && root.contains(panelTrigger)) {
    keepMobileControlsVisible()
    if ((event?.type === 'pointerdown' || event?.type === 'pointerup') && event.pointerType === 'mouse' && event.button !== 0) {
      return
    }
    if (isMobileDanmuTriggerPress(event)) {
      const type = event?.type || ''
      const shouldToggleOnPress = type === 'touchstart' || (type === 'pointerdown' && event.pointerType !== 'mouse')
      if (shouldToggleOnPress) {
        toggleMobileDanmuSettingsFromTrigger(event)
      }
      return
    }
    if (!isMobileDanmuTriggerActivator(event)) {
      return
    }
    triggerMobileDanmuSettingsPanel(event)
    return
  }
  if (event?.type !== 'click') {
    return
  }
  if (!panelTrigger || !root.contains(panelTrigger)) {
    closeMobileDanmuPanels()
    return
  }
}

function handleMobileFullscreenControlClick(event) {
  if (!isMobileUiActive()) {
    return
  }
  const target = event.target
  if (!target?.closest) {
    return
  }
  const fullscreenControl = target.closest('.art-control-fullscreen, .art-control-fullscreenWeb')
  if (!fullscreenControl || !playerFrame.value?.contains(fullscreenControl)) {
    return
  }
  event.preventDefault()
  event.stopPropagation()
  void toggleMobileLandscapeFullscreen()
}

function getDanmuPlugin() {
  return art?.plugins?.artplayerPluginDanmuku || null
}

function syncMobileDanmuVisible() {
  const danmu = getDanmuPlugin()
  if (danmu) {
    mobileDanmuVisible.value = !danmu.isHide
  }
  syncMobileDanmuControlButtons()
}

function syncMobileDanmuControlButtons() {
  if (!isMobileUiActive()) {
    return
  }
  window.requestAnimationFrame(() => {
    const root = playerFrame.value
    if (!root) {
      return
    }
    normalizeMobileCoreControls()
    root.querySelectorAll('.art-control-mobile-danmu-toggle').forEach(button => {
      button.classList.toggle('is-muted', !mobileDanmuVisible.value)
    })
    root.querySelectorAll(MOBILE_DANMU_SETTINGS_TRIGGER_SELECTOR).forEach(button => {
      button.classList.toggle('is-active', showMobileDanmuSettings.value)
    })
  })
}

function persistMobileDanmuSetting(nextValue) {
  Object.assign(danmu_setting, nextValue)
  try {
    window.localStorage.danmu_setting = JSON.stringify({value: danmu_setting})
  } catch {
  }
}

function syncMobileDanmuSettingFromOption(option = danmu_setting) {
  mobileDanmuSetting.value = {
    ...mobileDanmuSetting.value,
    opacity: Math.round((Number(option.opacity) || 0.58) * 100),
    fontSize: getMobileDanmuFontSize(option.fontSize),
    speed: Number(option.speed) || mobileDanmuSetting.value.speed,
    area: Array.isArray(option.margin) ? Number.parseFloat(option.margin[1]) || mobileDanmuSetting.value.area : mobileDanmuSetting.value.area,
    modes: Array.isArray(option.modes) && option.modes.length ? [...option.modes] : mobileDanmuSetting.value.modes,
    antiOverlap: option.antiOverlap !== false,
    outline: option.outline !== false,
    synchronousPlayback: option.synchronousPlayback !== false
  }
}

function applyMobileDanmuSetting(partial = {}) {
  const outlineChanged = danmu_setting.outline !== (mobileDanmuSetting.value.outline !== false)
  const nextValue = {
    opacity: clamp(mobileDanmuSetting.value.opacity, 20, 100) / 100,
    fontSize: `${clamp(mobileDanmuSetting.value.fontSize, 16, 42)}px`,
    speed: clamp(mobileDanmuSetting.value.speed, 1, 10),
    margin: [5, `${clamp(mobileDanmuSetting.value.area, 25, 100)}%`],
    modes: mobileDanmuSetting.value.modes.length ? [...mobileDanmuSetting.value.modes] : [0],
    antiOverlap: mobileDanmuSetting.value.antiOverlap,
    outline: mobileDanmuSetting.value.outline !== false,
    synchronousPlayback: mobileDanmuSetting.value.synchronousPlayback,
    ...partial
  }
  persistMobileDanmuSetting(nextValue)
  const danmu = getDanmuPlugin()
  danmu?.config(nextValue)
  if (outlineChanged) {
    danmu?.reset()
  }
}

function toggleMobileDanmuVisible() {
  const danmu = getDanmuPlugin()
  if (!danmu) {
    return
  }
  keepMobileControlsVisible()
  if (danmu.isHide) {
    danmu.show()
  } else {
    danmu.hide()
  }
  syncMobileDanmuVisible()
}

function toggleMobileDanmuSettings() {
  mobileControlMenu.value = ''
  setMobileDanmuSettingsVisible(!showMobileDanmuSettings.value)
  playerFrame.value?.querySelectorAll?.('.apd-config.is-panel-open, .apd-style.is-panel-open, [class*="apd-config"].is-panel-open, [class*="apd-style"].is-panel-open').forEach(panel => {
    panel.classList.remove('is-panel-open')
  })
}

function toggleMobileControlMenu(menu) {
  keepMobileControlsVisible()
  closeArtSettingPanel()
  showMobileDanmuSettings.value = false
  mobileControlMenu.value = mobileControlMenu.value === menu ? '' : menu
}

async function selectMobileQuality(option) {
  if (!option) {
    return
  }
  keepMobileControlsVisible()
  await switchQuality(option)
  mobileControlMenu.value = ''
}

function selectMobilePlaybackRate(rate) {
  keepMobileControlsVisible()
  const nextRate = Number(rate) || 1
  if (art) {
    art.playbackRate = nextRate
  }
  mobilePlaybackRate.value = nextRate
  localStorage.playbackRate = nextRate
  mobileControlMenu.value = ''
}

async function selectMobileSubtitle(option) {
  keepMobileControlsVisible()
  await switchSubtitle(option || {html: '关闭字幕', guid: null, index: -1})
  mobileControlMenu.value = ''
}

function toggleMobileDanmuMode(mode) {
  const modes = new Set(mobileDanmuSetting.value.modes)
  if (modes.has(mode)) {
    modes.delete(mode)
  } else {
    modes.add(mode)
  }
  if (modes.size === 0) {
    modes.add(mode)
  }
  mobileDanmuSetting.value.modes = [...modes].sort((a, b) => a - b)
  applyMobileDanmuSetting()
}

function showGestureFeedback(title, value, autoHide = false, progress = null) {
  gestureFeedback.value = {
    visible: true,
    title,
    value,
    progress: progress === null ? null : clamp(progress, 0, 100)
  }
  if (gestureFeedbackTimer) {
    clearTimeout(gestureFeedbackTimer)
    gestureFeedbackTimer = null
  }
  if (autoHide) {
    gestureFeedbackTimer = setTimeout(() => {
      gestureFeedback.value = {
        ...gestureFeedback.value,
        visible: false,
        progress: null
      }
    }, 700)
  }
}

function hideGestureFeedback(delay = 500) {
  if (gestureFeedbackTimer) {
    clearTimeout(gestureFeedbackTimer)
  }
  gestureFeedbackTimer = setTimeout(() => {
    gestureFeedback.value = {
      ...gestureFeedback.value,
      visible: false,
      progress: null
    }
  }, delay)
}

function applyPlayerBrightness(value = brightnessLevel.value) {
  const nextValue = clamp(Number(value) || 1, 0.45, 1.6)
  brightnessLevel.value = nextValue
  brightnessOverlayOpacity.value = nextValue < 1 ? clamp((1 - nextValue) * 0.6, 0, 0.35) : 0
  localStorage.setItem('player_brightness', String(nextValue))
  if (art?.video?.style) {
    art.video.style.filter = `brightness(${nextValue})`
  }
}

function seekPlayerTo(time, notice = true) {
  if (!hasPlayableDuration()) {
    return
  }
  const nextTime = clamp(time, 0, art.duration)
  art.seek = nextTime
  if (notice) {
    showGestureFeedback('进度', `${formatTime(nextTime)} / ${formatTime(art.duration)}`, true, (nextTime / art.duration) * 100)
  }
}

function seekPlayerBy(delta) {
  if (!hasPlayableDuration()) {
    return
  }
  seekPlayerTo((art.currentTime || 0) + delta)
}

function setPlayerVolume(value, notice = true) {
  if (!art) {
    return
  }
  const nextVolume = clamp(value, 0, 1)
  art.volume = nextVolume
  if (nextVolume > 0) {
    art.muted = false
  }
  if (notice) {
    showGestureFeedback('音量', `${Math.round(nextVolume * 100)}%`)
  }
}

function setPlayerBrightness(value, notice = true) {
  const nextValue = clamp(value, 0.45, 1.6)
  applyPlayerBrightness(nextValue)
  if (notice) {
    showGestureFeedback('亮度', `${Math.round(nextValue * 100)}%`)
  }
}

function handlePlayerKeydown(event) {
  if (!art || showModal.value || showSetUp.value || isEditableTarget(event.target)) {
    return
  }
  if (event.altKey || event.ctrlKey || event.metaKey) {
    return
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault()
    seekPlayerBy(10)
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault()
    seekPlayerBy(-10)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    setPlayerVolume((art.volume || 0) + 0.08, true)
    hideGestureFeedback()
  } else if (event.key === 'ArrowDown') {
    event.preventDefault()
    setPlayerVolume((art.volume || 0) - 0.08, true)
    hideGestureFeedback()
  } else if (event.key === ' ') {
    event.preventDefault()
    art.playing ? art.pause() : art.play()
  }
}

function handleTouchStart(event) {
  if (isMobileUiActive()) {
    keepMobileControlsVisible()
    window.setTimeout(syncMobileDanmuFallbackControls, 220)
  }
  if (!art || showModal.value || showSetUp.value || event.touches.length !== 1 || isPlayerInteractiveTarget(event.target)) {
    touchState.active = false
    return
  }
  const rect = playerFrame.value?.getBoundingClientRect()
  if (!rect) {
    return
  }
  const touch = event.touches[0]
  const point = touchPointForPlayer(touch)
  const forcedLandscape = isForcedLandscapeActive()
  touchState.active = true
  touchState.mode = ''
  touchState.startX = point.x
  touchState.startY = point.y
  touchState.startTime = art.currentTime || 0
  touchState.startVolume = art.volume || 0
  touchState.startBrightness = brightnessLevel.value
  touchState.previewTime = touchState.startTime
  touchState.width = (forcedLandscape ? rect.height : rect.width) || window.innerWidth
  touchState.height = (forcedLandscape ? rect.width : rect.height) || window.innerHeight
  touchState.moved = false
  closeMobileDanmuPanels()
}

function handleTouchMove(event) {
  if (!touchState.active || event.touches.length !== 1) {
    return
  }
  const touch = event.touches[0]
  const point = touchPointForPlayer(touch)
  const dx = point.x - touchState.startX
  const dy = point.y - touchState.startY
  const absX = Math.abs(dx)
  const absY = Math.abs(dy)
  if (!touchState.mode) {
    if (Math.max(absX, absY) < 14) {
      return
    }
    touchState.mode = absX >= absY ? 'seek' : (touchState.startX < touchState.width / 2 ? 'brightness' : 'volume')
  }

  if (event.cancelable) {
    event.preventDefault()
  }
  event.stopPropagation()
  touchState.moved = true

  if (touchState.mode === 'seek') {
    if (!hasPlayableDuration()) {
      return
    }
    const seekWindow = Math.min(art.duration, 600)
    const nextTime = clamp(touchState.startTime + (dx / touchState.width) * seekWindow, 0, art.duration)
    const delta = nextTime - touchState.startTime
    touchState.previewTime = nextTime
    showGestureFeedback(delta >= 0 ? `快进 ${formatTimeDelta(delta)}` : `快退 ${formatTimeDelta(delta)}`, `${formatTime(nextTime)} / ${formatTime(art.duration)}`, false, (nextTime / art.duration) * 100)
    return
  }

  if (touchState.mode === 'volume') {
    const nextVolume = touchState.startVolume + (-dy / touchState.height) * 1.2
    setPlayerVolume(nextVolume, true)
    return
  }

  if (touchState.mode === 'brightness') {
    const nextBrightness = touchState.startBrightness + (-dy / touchState.height) * 1.4
    setPlayerBrightness(nextBrightness, true)
  }
}

function handleTouchEnd() {
  if (!touchState.active) {
    return
  }
  if (touchState.moved && touchState.mode === 'seek') {
    seekPlayerTo(touchState.previewTime, true)
  } else if (touchState.moved) {
    hideGestureFeedback()
  }
  touchState.active = false
  touchState.mode = ''
}

function bindPlayerTouchListeners() {
  const frame = playerFrame.value
  if (!isMobileUiActive() || !frame) {
    return
  }
  if (playerTouchFrame === frame) {
    return
  }
  removePlayerTouchListeners()
  frame.addEventListener('touchstart', handleTouchStart, {capture: true, passive: true})
  frame.addEventListener('touchmove', handleTouchMove, {capture: true, passive: false})
  frame.addEventListener('touchend', handleTouchEnd, {capture: true, passive: true})
  frame.addEventListener('touchcancel', handleTouchEnd, {capture: true, passive: true})
  playerTouchFrame = frame
}

function removePlayerTouchListeners() {
  const frame = playerTouchFrame
  if (!frame) {
    return
  }
  frame.removeEventListener('touchstart', handleTouchStart, {capture: true})
  frame.removeEventListener('touchmove', handleTouchMove, {capture: true})
  frame.removeEventListener('touchend', handleTouchEnd, {capture: true})
  frame.removeEventListener('touchcancel', handleTouchEnd, {capture: true})
  playerTouchFrame = null
}

async function lockLandscapeForMobile() {
  if (!isMobileUiActive() || !window.screen?.orientation?.lock) {
    return
  }
  try {
    await window.screen.orientation.lock('landscape')
  } catch {
    try {
      await window.screen.orientation.lock('landscape-primary')
    } catch {
    }
  }
}

async function unlockOrientationForMobile() {
  if (!isMobileUiActive() || !window.screen?.orientation?.unlock) {
    return
  }
  try {
    window.screen.orientation.unlock()
  } catch {
  }
}

function fullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement || null
}

function playerFullscreenTarget() {
  return playerFrame.value || art?.template?.$player || document.documentElement
}

async function requestBrowserFullscreen(target) {
  const element = target || playerFullscreenTarget()
  const request = element.requestFullscreen || element.webkitRequestFullscreen || element.mozRequestFullScreen || element.msRequestFullscreen
  if (!request) {
    return false
  }
  try {
    await request.call(element)
    return true
  } catch {
    return false
  }
}

async function exitBrowserFullscreen() {
  const exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen
  if (!exit || !fullscreenElement()) {
    return
  }
  try {
    await exit.call(document)
  } catch {
  }
}

function getViewportSize() {
  const viewport = window.visualViewport
  const width = Math.max(1, Math.round(viewport?.width || window.innerWidth || document.documentElement?.clientWidth || 1))
  const height = Math.max(1, Math.round(viewport?.height || window.innerHeight || document.documentElement?.clientHeight || 1))
  return {width, height}
}

function isPortraitLayoutViewport() {
  const {width, height} = getViewportSize()
  if (width <= 0 || height <= 0) {
    return null
  }
  return height >= width
}

function isPortraitViewport() {
  const layoutPortrait = isPortraitLayoutViewport()
  if (layoutPortrait !== null) {
    return layoutPortrait
  }
  const orientationType = String(window.screen?.orientation?.type || '')
  if (orientationType.startsWith('landscape')) {
    return false
  }
  if (orientationType.startsWith('portrait')) {
    return true
  }
  return window.matchMedia?.('(orientation: portrait)')?.matches ?? window.innerHeight >= window.innerWidth
}

function shouldUseLandscapeFallback() {
  const orientationType = String(window.screen?.orientation?.type || '')
  return isPortraitViewport() || orientationType.startsWith('portrait')
}

function setImportantStyle(element, property, value) {
  element?.style?.setProperty(property, value, 'important')
}

function clearInlineStyles(element, properties) {
  if (!element) {
    return
  }
  properties.forEach(property => element.style.removeProperty(property))
}

function applyMobileForcedLandscapeLayout(active) {
  const frame = playerFrame.value
  if (!frame) {
    return
  }
  const artRoot = frame.querySelector('.art-player')
  const artVideoPlayer = frame.querySelector('.art-video-player')
  const frameProps = ['position', 'inset', 'top', 'left', 'z-index', 'width', 'height', 'max-width', 'max-height', 'margin', 'overflow', 'transform', 'transform-origin']
  const artProps = ['position', 'top', 'left', 'width', 'height', 'max-width', 'max-height', 'margin', 'transform', 'transform-origin', 'overflow']
  const videoProps = ['width', 'height', 'max-width', 'max-height']

  if (!active) {
    clearInlineStyles(frame, frameProps)
    clearInlineStyles(artRoot, artProps)
    clearInlineStyles(artVideoPlayer, videoProps)
    return
  }

  const {width, height} = getViewportSize()
  const landscapeWidth = Math.max(width, height)
  const landscapeHeight = Math.min(width, height)

  setImportantStyle(frame, 'position', 'fixed')
  setImportantStyle(frame, 'inset', '0')
  setImportantStyle(frame, 'top', '0')
  setImportantStyle(frame, 'left', '0')
  setImportantStyle(frame, 'z-index', '99999')
  setImportantStyle(frame, 'width', `${width}px`)
  setImportantStyle(frame, 'height', `${height}px`)
  setImportantStyle(frame, 'max-width', 'none')
  setImportantStyle(frame, 'max-height', 'none')
  setImportantStyle(frame, 'margin', '0')
  setImportantStyle(frame, 'overflow', 'hidden')
  setImportantStyle(frame, 'transform', 'none')
  setImportantStyle(frame, 'transform-origin', 'center center')

  setImportantStyle(artRoot, 'position', 'absolute')
  setImportantStyle(artRoot, 'top', '50%')
  setImportantStyle(artRoot, 'left', '50%')
  setImportantStyle(artRoot, 'width', `${landscapeWidth}px`)
  setImportantStyle(artRoot, 'height', `${landscapeHeight}px`)
  setImportantStyle(artRoot, 'max-width', 'none')
  setImportantStyle(artRoot, 'max-height', 'none')
  setImportantStyle(artRoot, 'margin', '0')
  setImportantStyle(artRoot, 'transform', 'translate(-50%, -50%) rotate(90deg)')
  setImportantStyle(artRoot, 'transform-origin', 'center center')
  setImportantStyle(artRoot, 'overflow', 'hidden')

  setImportantStyle(artVideoPlayer, 'width', '100%')
  setImportantStyle(artVideoPlayer, 'height', '100%')
  setImportantStyle(artVideoPlayer, 'max-width', 'none')
  setImportantStyle(artVideoPlayer, 'max-height', 'none')
}

function setForcedLandscape(active) {
  forcedLandscapeActive.value = !!active
  mobilePortraitActive.value = isMobileUiActive() && isPortraitViewport() && !active
  const frame = playerFrame.value
  document.documentElement.classList.toggle('player-forced-landscape-active', active)
  document.body.classList.toggle('player-forced-landscape-active', active)
  if (frame) {
    frame.classList.toggle('is-forced-landscape', active)
  }
  applyMobileForcedLandscapeLayout(active)
  art?.resize?.()
  scheduleMobileDanmuFallbackSync()
}

function syncMobileLandscapeFallback() {
  if (!isMobileUiActive() || !mobileLandscapeActive) {
    setForcedLandscape(false)
    return
  }
  setForcedLandscape(shouldUseLandscapeFallback())
}

async function enterMobileLandscapeFullscreen() {
  if (!isMobileUiActive()) {
    return
  }
  mobileLandscapeActive = true
  mobileLandscapeModeActive.value = true
  setForcedLandscape(true)
  await requestBrowserFullscreen(playerFullscreenTarget())
  await lockLandscapeForMobile()
  syncMobileLandscapeFallback()
  scheduleMobileDanmuFallbackSync()
  window.setTimeout(syncMobileLandscapeFallback, 320)
  window.setTimeout(scheduleMobileDanmuFallbackSync, 360)
}

async function exitMobileLandscapeFullscreen() {
  mobileLandscapeActive = false
  mobileLandscapeModeActive.value = false
  setForcedLandscape(false)
  await unlockOrientationForMobile()
  await exitBrowserFullscreen()
  scheduleMobileDanmuFallbackSync()
}

async function toggleMobileLandscapeFullscreen() {
  if (mobileLandscapeActive || mobileLandscapeModeActive.value || playerFrame.value?.classList.contains('is-forced-landscape')) {
    await exitMobileLandscapeFullscreen()
  } else {
    await enterMobileLandscapeFullscreen()
  }
}

function handleDocumentFullscreenChange() {
  if (!isMobileUiActive()) {
    return
  }
  if (fullscreenElement()) {
    mobileLandscapeActive = true
    mobileLandscapeModeActive.value = true
    setForcedLandscape(true)
    lockLandscapeForMobile()
    syncMobileLandscapeFallback()
  } else if (mobileLandscapeActive) {
    exitMobileLandscapeFullscreen()
  }
  scheduleMobileDanmuFallbackSync()
}

function addMobileLandscapeListeners() {
  fullscreenChangeEvents.forEach(eventName => {
    document.addEventListener(eventName, handleDocumentFullscreenChange)
  })
  window.addEventListener('orientationchange', syncMobileLandscapeFallback)
  window.addEventListener('resize', syncMobileLandscapeFallback)
  window.addEventListener('orientationchange', scheduleMobileDanmuFallbackSync)
  window.addEventListener('resize', scheduleMobileDanmuFallbackSync)
  window.visualViewport?.addEventListener?.('resize', syncMobileLandscapeFallback)
  window.visualViewport?.addEventListener?.('resize', scheduleMobileDanmuFallbackSync)
}

function removeMobileLandscapeListeners() {
  fullscreenChangeEvents.forEach(eventName => {
    document.removeEventListener(eventName, handleDocumentFullscreenChange)
  })
  window.removeEventListener('orientationchange', syncMobileLandscapeFallback)
  window.removeEventListener('resize', syncMobileLandscapeFallback)
  window.removeEventListener('orientationchange', scheduleMobileDanmuFallbackSync)
  window.removeEventListener('resize', scheduleMobileDanmuFallbackSync)
  window.visualViewport?.removeEventListener?.('resize', syncMobileLandscapeFallback)
  window.visualViewport?.removeEventListener?.('resize', scheduleMobileDanmuFallbackSync)
}

function cleanupMobileLandscape() {
  removeMobileLandscapeListeners()
  void exitMobileLandscapeFullscreen()
  closeMobileDanmuPanels()
}

function resetDanmuLoadState(currentTime = 0) {
  allDanmaku.value = {}
  danmuConfig.value.loadedUntil = currentTime > 5 ? currentTime - 5 : 0
  lastDanmuLoadedUntil = -1
  if (art && art.plugins && art.plugins.artplayerPluginDanmuku) {
    art.plugins.artplayerPluginDanmuku.load()
  }
}

function resolveDanmuEpisodeKey(data, episodeNumber) {
  if (!data || typeof data !== 'object') {
    return String(episodeNumber)
  }
  const episodeText = String(episodeNumber ?? 1)
  const candidates = [
    episodeText,
    episodeText.padStart(2, '0'),
    episodeText.padStart(3, '0')
  ]
  for (const candidate of candidates) {
    if (candidate in data) {
      return candidate
    }
  }
  return Object.keys(data)[0] || episodeText
}

async function loadDanmuku() {
  let episode_number = playInfo.value.episode_number === undefined ? 1 : playInfo.value.episode_number;
  let danmuku = `/danmu/get?${getDanmuparams()}`;
  fetch(danmuku)
      .then(res => res.json())
      .then(json => {
        const episodeKey = resolveDanmuEpisodeKey(json, episode_number)
        const episodeDanmuku = Array.isArray(json?.[episodeKey]) ? json[episodeKey] : []
        allDanmaku.value = {
          ...(json || {}),
          [episode_number]: episodeDanmuku
        };
        // art.plugins.artplayerPluginDanmuku.load(json[episode_number])
      }).catch(() => {})
}

// 获取清晰度
async function GetQuality() {
  let res = StreamList.value?.qualities || []
  if (res.length === 0) {
    let api = "/api/v1/play/quality"
    const local = getSelectedMediaFile()
    if (!local?.guid) {
      throw new Error('media file is empty')
    }
    let _data = {
      "media_guid": local.guid
    }
    res = await COMMON.requests("POST", api, true, _data);
  }
  QualityData.value = res;

  // 按分辨率分组，每个分辨率下按码率排序
  const qualityGroups = {};
  res.forEach(item => {
    if (!qualityGroups[item.resolution]) {
      qualityGroups[item.resolution] = [];
    }
    qualityGroups[item.resolution].push({
      bitrate: item.bitrate,
      progressive: item.progressive
    });
  });

  // 对每个分辨率组内的码率进行排序
  Object.keys(qualityGroups).forEach(resolution => {
    qualityGroups[resolution].sort((a, b) => b.bitrate - a.bitrate);
  });

  // 构建画质选择器数据
  const selector = [];
  const resolutions = Object.keys(qualityGroups).sort((a, b) => {
    const resolutionOrder = {'4k': 4, '1080': 3, '720': 2, '480': 1, '360': 0};
    return resolutionOrder[b] - resolutionOrder[a];
  });

  resolutions.forEach(resolution => {
    const qualities = qualityGroups[resolution];
    const baseItem = {
      html: resolution,
      selector: qualities.map(quality => ({
        html: `${resolution} (${(quality.bitrate / 1000000).toFixed(1)}Mbps)`,
        bitrate: quality.bitrate,
        resolution: resolution,
        progressive: quality.progressive
      }))
    };
    selector.push(baseItem);
  });

  qualitySelector.value = selector;

  // 设置默认画质为最高质量
  if (selector.length > 0 && selector[0].selector.length > 0) {
    currentQuality.value = selector[0].selector[0];
  }
}

// 切换清晰度
async function switchQuality(item, $dom, event) {
  // 处理选择器返回的数据结构
  const qualityData = item.selector ? item.selector[0] : item;
  if (!qualityData || !qualityData.bitrate || !qualityData.resolution) {
    console.error('Invalid quality item:', qualityData);
    return;
  }

  try {
    await mediaP("media.checkPlayLink", urlBase.value)
    let api = "/api/v1/media/p";
    let _data = {
      "req": "media.resetQuality",
      "reqid": "1234567890ABCDEF2s",
      "playLink": urlBase.value,
      "quality": {
        "resolution": qualityData.resolution,
        "bitrate": qualityData.bitrate
      },
      "startTimestamp": Math.floor(art.currentTime),
      "clearCache": true
    };

    art.loading.show = true;
    let res = await COMMON.requests("POST", api, true, _data);

    if (res.updateM3u8) {
      // 更新当前画质状态
      currentQuality.value = {
        resolution: qualityData.resolution,
        bitrate: qualityData.bitrate,
        html: `${qualityData.resolution} (${(qualityData.bitrate / 1000000).toFixed(1)}Mbps)`
      };

      // 更新播放器URL
      await art.switchQuality(url.value);
      COMMON.ShowMsg(`已切换到${qualityData.resolution} (${(qualityData.bitrate / 1000000).toFixed(1)}Mbps)`);
      return isMobileUiActive() ? qualityData.resolution : `${qualityData.resolution} (${(qualityData.bitrate / 1000000).toFixed(1)}Mbps)`;

    }
  } catch (error) {
    console.error('Failed to switch quality:', error);
    COMMON.ShowMsg('画质切换失败，请重试');
  } finally {
    art.loading.show = false;
  }
}

async function GetEpisodeList() {
  let api = "/api/v1/episode/list/" + guid.value;
  EpisodeList.value = await COMMON.requests("GET", api, true)
}

// 获取播放信息
async function GetPayInfo(_guid) {
  let api = "/api/v1/play/info";
  let _data = {
    "item_guid": _guid
  }
  let res = await COMMON.requests("POST", api, true, _data)
  return res;
}

async function ensureEpisodeGuid() {
  if (episode_guid.value) {
    return
  }
  let guidPlayInfo = await GetPayInfo(guid.value)
  episode_guid.value = guidPlayInfo.item.guid
  PlayerData.episode_guid = episode_guid.value
}

async function GetStreamList() {
  const mediaGuid = getPreferredMediaGuid()
  if (mediaGuid) {
    try {
      const streamData = await COMMON.requests("POST", "/api/v1/stream", true, {
        media_guid: mediaGuid,
        ip: md5(`${navigator.userAgent}|${window.location.host}|${mediaGuid}`),
        header: {
          "User-Agent": [navigator.userAgent]
        },
        level: 1
      })
      StreamList.value = normalizeStreamPlaybackData(streamData)
      return
    } catch (err) {
      console.warn('stream playback api failed, fallback to stream list', err)
    }
  }
  let api = "/api/v1/stream/list/" + episode_guid.value + '?before_play=1';
  StreamList.value = await COMMON.requests("GET", api, true)
}

function normalizeStreamPlaybackData(data) {
  return {
    ...data,
    files: data?.files || (data?.file_stream ? [data.file_stream] : []),
    video_streams: data?.video_streams || (data?.video_stream ? [data.video_stream] : []),
    audio_streams: data?.audio_streams || [],
    subtitle_streams: data?.subtitle_streams || [],
    qualities: data?.qualities || []
  }
}

function getPreferredMediaGuid() {
  return requestedMediaGuid.value || playSessionInfo.value?.media_guid || playSessionInfo.value?.item?.media_guid || null
}

function getSelectedMediaFile() {
  const files = StreamList.value?.files || []
  const mediaGuid = getPreferredMediaGuid()
  if (mediaGuid) {
    const matched = files.find(item => item.guid === mediaGuid || item.media_guid === mediaGuid)
    if (matched) {
      return matched
    }
  }
  let regex = /\d+-\d+-\S+/;
  let local = files.find(o => !regex.test(o.path))
  return local || files[0] || null
}

function getSelectedVideoStream() {
  const videoStreams = StreamList.value?.video_streams || []
  const mediaGuid = getPreferredMediaGuid()
  if (mediaGuid) {
    const matched = videoStreams.find(item => item.media_guid === mediaGuid || item.guid === playSessionInfo.value?.video_guid)
    if (matched) {
      return matched
    }
  }
  return videoStreams.find(item => item.guid === playSessionInfo.value?.video_guid) || videoStreams[0] || null
}

function getSelectedAudioStream() {
  const audioStreams = StreamList.value?.audio_streams || []
  return audioStreams.find(item => item.guid === playSessionInfo.value?.audio_guid)
      || audioStreams.find(item => item.codec_name === 'aac')
      || audioStreams.find(item => item.is_default === 1)
      || audioStreams[0]
      || null
}

function getCurrentSubtitleGuid() {
  if (currentSubtitle.value && typeof currentSubtitle.value === 'object') {
    return currentSubtitle.value.guid || ''
  }
  return playSessionInfo.value?.subtitle_guid || ''
}

async function preloadOfficialSubtitle() {
  const subtitleGuid = getCurrentSubtitleGuid()
  if (!subtitleGuid) {
    return
  }
  try {
    await COMMON.rawGet(`/api/v1/subtitle/dl/${subtitleGuid}`, true)
  } catch {
  }
}

function getPlayVideoEncoder(videoStream) {
  if (!videoStream?.codec_name) {
    return 'h264'
  }
  const codec = String(videoStream.codec_name).toLowerCase()
  if (codec === 'h264' || codec === 'avc1') {
    return 'h264'
  }
  return 'h264'
}

async function GetChannels(s) {
  return s < 6 ? 2 : device.mediaCanPlay.audioChannels >= 6 ? 6 : 2
}

async function GetPalyUrlBy302() {
  let regex = /\d+-\d+-\S+/;
  // 获取远程挂载的视频信息
  let remote = StreamList.value.files.find(o => regex.test(o.path))
  if (remote !== null && remote !== undefined && use_302_play.value) {
    let _data = {
      path: remote.path
    }
    let res = await axios.get("/api/play", {
      params: _data,
      headers: {Authorization: VueCookies.get("authorization")}
    })
    if (res.data.code === 0) {
      url.value = res.data.data;
      playUrl.value = res.data.data
    }
  }
}

async function GetPalyUrl() {
  if (art !== null && art !== undefined) {
    art.loading.show = true;
  }
  playError.value = '';
  let api = "/api/v1/play/play"
  const local = getSelectedMediaFile()
  const videoStream = getSelectedVideoStream()
  const audioStream = getSelectedAudioStream()
  const quality = QualityData.value?.[0] || {}
  if (!local?.guid || !videoStream?.guid || !audioStream?.guid) {
    throw new Error('play stream is incomplete')
  }
  let _channels = audioStream.channels;
  let _data = {
    "media_guid": local.guid,
    "video_guid": videoStream.guid,
    "video_encoder": getPlayVideoEncoder(videoStream),
    "resolution": quality.resolution || String(videoStream.height || ''),
    "bitrate": quality.bitrate || videoStream.bps,
    "startTimestamp": playInfo.value.watched_ts,
    "audio_encoder": "aac",
    "audio_guid": audioStream.guid,
    "subtitle_guid": "",
    "channels": await GetChannels(_channels)
  };
  let res = null
  try {
    res = await COMMON.requests("POST", api, true, _data)
  } catch (err) {
    if (art !== null && art !== undefined) {
      art.loading.show = false;
    }
    COMMON.ShowMsg("播放链接获取失败，请切换清晰度或尝试其他操作")
    throw err
  }
  if (res !== null) {
    urlBase.value = res.play_link;
    url.value = COMMON.fnHost + res.play_link;
    playUrl.value = window.location.origin + url.value
    if (use_302_play.value) {
      await GetPalyUrlBy302();
    }
  } else {
    COMMON.ShowMsg("播放链接获取失败，请切换清晰度或尝试其他操作")
    throw new Error('play link is empty')
  }
}

async function SendPlayRecord() {
  if (art.currentTime >= 5) {
    let api = "/api/v1/play/record"
    const local = getSelectedMediaFile()
    const videoStream = getSelectedVideoStream()
    const audioStream = getSelectedAudioStream()
    const quality = currentQuality.value || QualityData.value?.[0] || {}
    if (!local?.guid || !videoStream?.guid || !audioStream?.guid) {
      return
    }
    let data = {
      "item_guid": episode_guid.value,
      "media_guid": local.guid,
      "video_guid": videoStream.guid,
      "audio_guid": audioStream.guid,
      "subtitle_guid": getCurrentSubtitleGuid(),
      "resolution": quality.resolution,
      "bitrate": quality.bitrate,
      "ts": Math.floor(art.currentTime),
      "duration": art.duration,
      "play_link": urlBase.value
    }
    await COMMON.requests("POST", api, true, data)
  }
}

async function GetSkipList() {
  // const instance = axios.create()
  // let api = "/api/skipList?guid=" + guid.value
  // let res = await instance.get(api)
  // if (res.data.code === 0) {
  //   skipList.value = res.data.data
  // }
}

async function mediaP(req, playLink) {
  let api = "/api/v1/media/p"
  let data = {
    "req": req,
    "reqid": "1234567890ABCDEF",
    "playLink": playLink
  }
  let res = await COMMON.requests("POST", api, true, data)
}

async function GetEmoji() {
  if (danmuSource.value === 'custom') {
    emojos.value = []
    return
  }
  try {
    let api = "/danmu/getEmoji?" + getDanmuparams()
    let res = await fetch(api)
    let res_json = await res.json()
    emojos.value = res_json
  } catch {
    emojos.value = []
  }
}

async function putVideoConfig() {
  let sendData = {
    list: [],
    url: []
  }
  if (seasonConfig.value.list !== undefined) {
    for (let item of seasonConfig.value.list) {
      if (!(item.startTime === 0 && item.endTime === 0)) {
        if (item.endTime === null) {
          // 如果endtime为空，直接跳到最后
          item.endTime = art.duration
        }
        sendData.list.push(item)
      }
    }
  }
  if (seasonConfig.value.url !== undefined) {
    for (let item of seasonConfig.value.url) {
      if (item.url !== "" && item.url !== null && item.url !== undefined) {
        sendData.url.push(item)
      }
    }
  }
  try {
    let api = "/api/videoConfig?episode_guid=" + episode_guid.value + "&guid=" + guid.value
    let res = await axios.post(api, sendData, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: VueCookies.get("authorization")
      },
    })
    let res_json = await res.data
    skipList.value = sendData.list
    seasonConfig.value = sendData
    art.plugins.artplayerPluginDanmuku.load();
    void loadDanmuku()
  } catch {
  }
  showSetUp.value = false;

}

async function getVideoConfig() {
  try {
    let api = "/api/videoConfig?episode_guid=" + episode_guid.value + "&guid=" + guid.value
    let res = await axios.get(api, {headers: {Authorization: VueCookies.get("authorization")}})
    seasonConfig.value = await res.data;
    skipList.value = seasonConfig.value.list
  } catch (err) {
  }
}


// 添加字幕切换函数
async function switchSubtitle(item, $dom, event) {
  if (!item || !item.guid) {
    // 关闭字幕
    currentSubtitle.value = "";
  } else {
    currentSubtitle.value = item;
  }
  var api = '/api/v1/media/p'
  let data = {
    "req": "media.resetSubtitle",
    "reqid": "1234567890ABCDEF",
    "playLink": urlBase.value,
    "startTimestamp": 1783,
    "subtitleIndex": item.index
  }
  let res = await COMMON.requests("POST", api, true, data)
  if (res.updateM3u8) {
    // 重新获取播放地址
    await GetPalyUrl();
    if (art) {
      await art.switchUrl(url.value);
    }
  }
  if (art) {
    const subtitle_url = '/fnos' + urlBase.value.replace("preset", "subtitle");
    switchSubtitleUrl(subtitle_url)
  }
  return item.html
}

async function addArtConfig(_art, key, v) {
  try {
    _art[key].remove(v.name)
  } catch (err) {
  }
  _art[key].add(v)
}

async function UpdateControl(_art) {
  let forData = []

  // 添加画质选择器
  if (qualitySelector.value.length > 0) {
    const qualityControl = {
      disable: false,
      index: 1,
      name: '画质',
      position: 'right',
      html: currentQuality.value ?
          (isMobileUiActive() ? currentQuality.value.resolution : `${currentQuality.value.resolution} (${(currentQuality.value.bitrate / 1000000).toFixed(1)}Mbps)`) :
          '画质',
      selector: qualitySelector.value.map(group => ({
        html: group.html,
        selector: group.selector.map(item => ({
          html: item.html,
          bitrate: item.bitrate,
          resolution: item.resolution,
          progressive: item.progressive
        }))
      })),
      onSelect: switchQuality
    };
    forData.push(qualityControl);
  }

  let 倍速 = {
    disable: false,
    index: 2,
    name: '倍速',
    position: 'right',
    html: art.playbackRate + 'X',
    selector: [
      {
        html: 0.5,
      },
      {
        html: 0.8,
      },
      {
        html: 1,
      }, {
        html: 1.2,
      }, {
        html: 1.5,
      }, {
        html: 1.8,
      }, {
        html: 2,
      }, {
        html: 2.5,
      }, {
        html: 2.8,
      }, {
        html: 3,
      },
    ],
    onSelect: function (item, $dom) {
      art.playbackRate = item.html;
      return `${item.html}X`;
    },
  }
  倍速.selector.forEach(item => {
    if (item.html === art.playbackRate) {
      item.default = true;
    }
  })
  forData.push(倍速)

  // 添加字幕选择器
  if (StreamList.value && StreamList.value.subtitle_streams && StreamList.value.subtitle_streams.length > 0) {
    const subtitleControl = {
      disable: false,
      index: 3,
      name: '字幕',
      position: 'right',
      html: '字幕',
      selector: [
        {
          html: '关闭字幕',
          guid: null
        },
        ...[...new Map(StreamList.value.subtitle_streams.map(item => [item.index, item])).values()].map(sub => ({
          html: sub.title + sub.language,
          guid: sub.guid,
          default: sub.is_default === 1,
          index: sub.index
        }))
      ],
      onSelect: switchSubtitle
    };
    forData.push(subtitleControl);
  }

  if (EpisodeList.value !== null && EpisodeList.value.length > 0) {
    let 下一集 = {
      name: '下一集',
      position: 'left',
      index: 11,
      html: '<img width="22" heigth="22" src="./images/next.svg">',
      tooltip: '下一集',
      style: {
        color: 'green',
      },
      click: function () {
        play_next()
      }
    }
    forData.push(下一集)

    let 选集_selector = []
    for (let item of EpisodeList.value) {
      选集_selector.push(
          {
            default: playInfo.value.episode_number === item.episode_number,
            html: `第${item.episode_number}集：${item.title}`,
            episode_guid: item.guid
          }
      )
    }

    let 选集 = {
      disable: false,
      name: '选集',
      index: 4,
      position: 'right',
      html: "选集",
      selector: 选集_selector,
      onSelect: async function (item, $dom, event) {
        episode_guid.value = item.episode_guid;
        await play();
        return "选集";
      }
    }
    forData.push(选集)
  }

  for (let item of forData) {
    await addArtConfig(_art, 'controls', item)
  }

  await addArtConfig(_art, 'setting', {
    name: "跳过片头片尾",
    html: '跳过片头片尾',
    tooltip: VueCookies.get('skip') === null ? "打开" : (VueCookies.get('skip') ? "打开" : "关闭"),
    switch: VueCookies.get('skip') === null ? true : VueCookies.get('skip'),
    onSwitch: function (item, $dom, event) {
      VueCookies.set('skip', !item.switch, -1);
      const nextState = !item.switch;
      item.tooltip = nextState ? '打开' : '关闭';
      return nextState;
    },
  })
  await addArtConfig(_art, 'setting', {
    name: '是否开启302',
    html: '是否开启302',
    tooltip: use_302_play.value ? '开启' : '关闭',
    switch: use_302_play.value,
    onSwitch: async function (item, $dom, event) {
      use_302_play.value = !item.switch;
      localStorage.use_302_play = use_302_play.value
      let _url = url.value;
      let _currentTime = art.currentTime;
      if (use_302_play.value) {
        await GetPalyUrlBy302();
      }
      if (!use_302_play.value) {
        url.value = COMMON.fnHost + urlBase.value;
        playUrl.value = window.location.origin + url.value
      }
      if (art && _url !== url.value) {
        await art.switchUrl(url.value);
        art.currentTime = _currentTime;
      }
      item.tooltip = use_302_play.value ? '开启' : '关闭';
      return use_302_play.value;
    },
  })
  await addArtConfig(_art, 'setting', {
    name: '弹幕源',
    html: '弹幕源',
    tooltip: getDanmuSourceLabel(),
    selector: danmuSourceOptions.map(item => ({
      html: item.html,
      value: item.value,
      default: item.value === danmuSource.value
    })),
    onSelect: async function (item, $dom, event) {
      danmuSource.value = item.value;
      localStorage.setItem('danmu_source', item.value);
      resetDanmuLoadState(art ? art.currentTime : 0);
      await loadDanmuku();
      await GetEmoji();
      return item.html;
    },
  })

}

async function play() {
  if (timerSendPlayRecord.value !== null) {
    clearInterval(timerSendPlayRecord.value)
  }
  let playLink = urlBase.value;
  await ensureEpisodeGuid()
  let _PayInfo = await GetPayInfo(episode_guid.value);
  playSessionInfo.value = _PayInfo;
  playInfo.value = _PayInfo.item;
  await GetStreamList();

  // 初始化字幕
  if (StreamList.value && StreamList.value.subtitle_streams && StreamList.value.subtitle_streams.length > 0) {
    const defaultSubtitle = StreamList.value.subtitle_streams.find(sub => sub.is_default === 1);
    currentSubtitle.value = defaultSubtitle || StreamList.value.subtitle_streams[0] || null;
  }

  await GetQuality();
  if (art !== null && art !== undefined) {
    await UpdateControl(art);
    schedulePlayerControlRefresh();
  }
  await GetPalyUrl();
  GetEmoji();
  if (art !== null && url.value) {
    await art.switchUrl(url.value);
  }
  if (playLink !== null) {
    await mediaP("media.quit", playLink)
  }
}

async function play_next() {
  if (!Array.isArray(EpisodeList.value) || EpisodeList.value.length === 0 || !playInfo.value) {
    return
  }
  let episode_data = EpisodeList.value.find(o => o.episode_number === (playInfo.value.episode_number + 1))
  if (!episode_data?.guid) {
    return
  }
  episode_guid.value = episode_data.guid
  await play()
}

function switchSubtitleUrl(m3u8Url) {
  M3U8SubtitlePlugin(m3u8Url).then(r => {
    vttUrls.value = r
  })
}


async function ready() {
  if (timerSendPlayRecord.value !== null) {
    clearInterval(timerSendPlayRecord.value)
  }
  art.playbackRate = localStorage.playbackRate
  art.loading.show = false;
  timerSendPlayRecord.value = setInterval(SendPlayRecord, 10000)
  art.seek = playInfo.value.watched_ts

  if (currentSubtitle.value) {
    const subtitle_url = '/fnos' + urlBase.value.replace("preset", "subtitle");
    switchSubtitleUrl(subtitle_url)
  }
  await preloadOfficialSubtitle()

  danmuConfig.value.loadedUntil = playInfo.value.watched_ts;
  resetDanmuLoadState(playInfo.value.watched_ts);
  void loadDanmuku()
  await GetSkipList();
  await getVideoConfig();
  // if (!art.plugins.hasOwnProperty("artplayerPluginDanmuku")) {
  //   // 加载自己修改的弹幕js
  //   await import('../../../public/packages//artplayer-plugin-danmuku.js');
  //   art.plugins.add(window.artplayerPluginDanmuku(danmu_setting));
  // }
  // art.plugins.artplayerPluginDanmuku.config(danmu_setting)

  await UpdateControl(art);
  schedulePlayerControlRefresh();
  art.plugins.artplayerPluginDanmuku.reset();
  syncMobileDanmuVisible();
  scheduleMobileDanmuFallbackSync();

}

const artF = async (data) => {
  art = data;
  art.on('restart', () => {
    ready();
  });
  art.on('ready', ready);
  art.on('video:ratechange', () => {
    localStorage.playbackRate = art.playbackRate;
    mobilePlaybackRate.value = Number(art.playbackRate || 1);
  });
  art.on('control', (state) => {
    mobilePlayerControlsVisible.value = !!state;
    if (!state) {
      mobileControlMenu.value = '';
    }
  });
  let lastSkipIndex = -1;
  art.on("video:timeupdate", () => {
    const currentTime = art.currentTime;

    // 跳过片头片尾
    if (skipList.value && skipList.value.length > 0) {
      const skipIndex = skipList.value.findIndex(
          o => currentTime > o.startTime && currentTime < o.endTime
      );
      const is_skip = VueCookies.get('skip') === 'true' || VueCookies.get('skip') === null;
      if (
          skipIndex !== -1 &&
          is_skip &&
          lastSkipIndex !== skipIndex
      ) {
        COMMON.ShowMsg("当前内容跳过");
        art.currentTime = skipList.value[skipIndex].endTime;
        lastSkipIndex = skipIndex;
        return; // 跳过后不再执行后续弹幕加载
      }
      if (skipIndex === -1) {
        lastSkipIndex = -1;
      }
    }

    // 弹幕分段加载
    let episode_number = playInfo.value.episode_number === undefined ? 1 : playInfo.value.episode_number;
    if (episode_number in allDanmaku.value) {
      let danmuList = allDanmaku.value[episode_number];
      if (currentTime >= danmuConfig.value.loadedUntil) {
        // 避免重复加载同一段
        if (danmuConfig.value.loadedUntil === lastDanmuLoadedUntil) return;
        lastDanmuLoadedUntil = danmuConfig.value.loadedUntil;

        if (
            danmuConfig.value.loadedUntil === 0 ||
            (currentTime - danmuConfig.value.loadedUntil) > (danmuConfig.value.segmentDuration * 2)
        ) {
          danmuConfig.value.loadedUntil = currentTime - 5;
        }
        const startTime = danmuConfig.value.loadedUntil;
        const endTime = startTime + danmuConfig.value.segmentDuration;
        const startIndex = sortedIndexBy(danmuList, {time: danmuConfig.value.loadedUntil}, o => o.time);
        const segment = danmuList.slice(startIndex).filter(d => d.time < endTime);
        if (segment.length && !art.plugins.artplayerPluginDanmuku.isHide) {
          art.plugins.artplayerPluginDanmuku.load(segment); // 追加弹幕
        }
        danmuConfig.value.loadedUntil = endTime;
      }


    }
  });

  let lastSubtitleIndex = -1;
  let vttText = 'WEBVTT\n\nX-TIMESTAMP-MAP=MPEGTS:0,LOCAL:00:00:00.000';   // ← 预置一个干净的头
  let currentBlobUrl = null;
  const cache = new Map();
  const addedIndexes = new Set(); // 防止重复添加段

  // 带重试的 fetch
  async function fetchWithRetry(url, options = {}, retries = 3, delay = 500) {
    for (let i = 0; i < retries; i++) {
      try {
        const res = await fetch(url, options);
        if (res.ok) {
          return res;
        } else {
          console.warn(`Fetch ${url} 返回 ${res.status}，第 ${i + 1} 次重试`);
        }
      } catch (err) {
        console.warn(`Fetch ${url} 出错，第 ${i + 1} 次重试：`, err);
      }
      // 等待
      await new Promise(r => setTimeout(r, delay));
    }
    throw new Error(`Fetch ${url} 失败，超过 ${retries} 次重试`);
  }

  async function loadSegment(i) {
    if (cache.has(i)) return cache.get(i);
    const vttUrl = vttUrls.value[i];
    if (!vttUrl) return '';

    const res = await fetchWithRetry(vttUrl, {}, 3, 500);
    const text = await res.text();

    // 1)丢掉头部
    const parts = text.split(/\r?\n\r?\n/);
    const payload = parts.slice(1).join('\n\n').trim();
    const clean = payload ? (payload + '\n\n') : '';

    cache.set(i, clean);
    return clean;
  }

  function updateSubtitle() {
    const nowIndex = Math.floor(art.currentTime / 6);
    // 如果是回退
    if (nowIndex < lastSubtitleIndex) {
      vttText = 'WEBVTT\n\nX-TIMESTAMP-MAP=MPEGTS:0,LOCAL:00:00:00.000';
      lastSubtitleIndex = -1;
      addedIndexes.clear();
      if (currentBlobUrl) {
        URL.revokeObjectURL(currentBlobUrl);
        currentBlobUrl = null;
      }
    }
    if (nowIndex > lastSubtitleIndex) {
      lastSubtitleIndex = nowIndex;
      // 跳过已加载段
      if (addedIndexes.has(nowIndex)) return;
      loadSegment(nowIndex).then(clean => {
        if (!clean) return;
        // 只添加未加载的内容
        addedIndexes.add(nowIndex);
        vttText += clean;
        // 预加载下一个
        loadSegment(nowIndex + 1).catch(() => {
        });
        // 释放旧 URL
        if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
        currentBlobUrl = createBlobVTTUrl(vttText);
        art.subtitle.switch(currentBlobUrl);
      }).catch(err => console.error('字幕加载失败', err));
    }

  }

  art.on('video:timeupdate', updateSubtitle);
  // 监听用户 seek
  art.on('video:seeked', () => {
    lastSubtitleIndex = -1;
    vttText = 'WEBVTT\n\nX-TIMESTAMP-MAP=MPEGTS:0,LOCAL:00:00:00.000';
  });


  art.on('video:ended', () => {
    play_next()
  });
  art.on('fullscreen', async (state) => {
    if (state && isMobileUiActive()) {
      mobileLandscapeActive = true
      mobileLandscapeModeActive.value = true
      setForcedLandscape(shouldUseLandscapeFallback())
      await lockLandscapeForMobile();
      syncMobileLandscapeFallback()
      window.setTimeout(syncMobileLandscapeFallback, 320)
      scheduleMobileDanmuFallbackSync()
    } else if (state) {
      await lockLandscapeForMobile();
    } else if (isMobileUiActive()) {
      mobileLandscapeActive = false
      mobileLandscapeModeActive.value = false
      setForcedLandscape(false)
      await unlockOrientationForMobile();
      scheduleMobileDanmuFallbackSync()
    } else {
      await unlockOrientationForMobile();
    }
    await UpdateControl(art);
  });

  art.on('artplayerPluginDanmuku:config', (option) => {
    art.storage.name = 'danmu_setting';
    var o = JSON.parse(JSON.stringify(option))
    delete o.danmuku;
    delete o.mount;
    art.storage.set("value", o);
    art.storage.name = 'artplayer_settings';
    syncMobileDanmuSettingFromOption(o);
  });
  art.on('artplayerPluginDanmuku:show', syncMobileDanmuVisible);
  art.on('artplayerPluginDanmuku:hide', syncMobileDanmuVisible);
  art.on('artplayerPluginDanmuku:visible', (danmu) => {
    const $ref = danmu.$ref;
    let text = $ref.textContent;
    // 正则表达式，用于匹配被中括号括起来的内容
    const regex = /\[([^\]]+)\]/g;
    // 用于存储匹配结果的数组
    let matches = [];
    // 使用正则表达式的 exec 方法匹配所有符合条件的内容
    let match;
    while ((match = regex.exec(text)) !== null) {
      matches.push(match[1]);
    }

    // 从对象转换为 Map，提高查找性能
    const emojosMap = new Map(Object.entries(emojos.value));

    // 一次性替换所有匹配项
    matches.forEach(match => {
      const emojo = emojosMap.get(`[${match}]`);
      if (emojo !== undefined) {
        text = text.replace(`[${match}]`, `<img v-lazy="${emojo}" style="height: 1em; width: auto; vertical-align: middle;"/>`);
      }
    });
    $ref.innerHTML = text;
  });
  // art.on('pause', () => {
  //   if_play.value = false;
  // });
  // art.on('play', () => {
  //   if_play.value = true;
  // });


}

const dynamicInputCreateBySkipTime = () => {
  return {
    startTime: 0,
    endTime: 0,
  }
}
const dynamicInputCreateByUrl = () => {
  return {
    url: ""
  }
}

async function getInstance(_art) {
  await artF(_art);
  art = _art;
  art.id = episode_guid.value
  art.url = url.value
  applyPlayerBrightness()
  refreshMobileUiState()
  bindPlayerTouchListeners()
  schedulePlayerControlRefresh()
  scheduleMobileDanmuFallbackSync()
}

const onMountedFun = async () => {
  loading.value = true;
  playError.value = '';
  try {
    await ensureEpisodeGuid();
    await getVideoConfig();
    if (gallery_type.value !== "Movie") {
      await GetEpisodeList();
    }
    await play()
  } catch (err) {
    playError.value = '播放链接获取失败，请返回后换一集或换一个片源。'
    if (art !== null && art !== undefined) {
      art.loading.show = false;
    }
  } finally {
    loading.value = false;
  }
};

onBeforeRouteUpdate(async (to, from) => {
  guid.value = to.query.guid || to.query.id;
  gallery_type.value = to.query.gallery_type;
  episode_guid.value = to.query.episode_guid || to.query.season_id || null;
  requestedMediaGuid.value = to.query.media_guid || null;
  await onMountedFun();
});

onBeforeRouteLeave((to, from) => {
  if (timerSendPlayRecord.value) {
    clearInterval(timerSendPlayRecord.value)
    timerSendPlayRecord.value = null
  }
  window.removeEventListener('keydown', handlePlayerKeydown)
  document.removeEventListener('click', handleMobileDanmuPanelClick, true)
  document.removeEventListener('mousedown', handleMobileDanmuPanelClick, true)
  document.removeEventListener('mouseup', handleMobileDanmuPanelClick, true)
  document.removeEventListener('pointerdown', handleMobileDanmuPanelClick, true)
  document.removeEventListener('pointerup', handleMobileDanmuPanelClick, true)
  document.removeEventListener('touchstart', handleMobileDanmuPanelClick, true)
  document.removeEventListener('touchend', handleMobileDanmuPanelClick, true)
  document.removeEventListener('click', handleMobileFullscreenControlClick, true)
  removePlayerTouchListeners()
  stopMobileDanmuFallbackSyncLoop()
  clearMobileControlRefreshTimers()
  disconnectMobileControlDomObserver()
  cleanupMobileLandscape()
});

onBeforeUnmount(async () => {
  if (timerSendPlayRecord.value) {
    clearInterval(timerSendPlayRecord.value)
    timerSendPlayRecord.value = null
  }
  if (gestureFeedbackTimer) {
    clearTimeout(gestureFeedbackTimer)
    gestureFeedbackTimer = null
  }
  window.removeEventListener('keydown', handlePlayerKeydown)
  document.removeEventListener('click', handleMobileDanmuPanelClick, true)
  document.removeEventListener('mousedown', handleMobileDanmuPanelClick, true)
  document.removeEventListener('mouseup', handleMobileDanmuPanelClick, true)
  document.removeEventListener('pointerdown', handleMobileDanmuPanelClick, true)
  document.removeEventListener('pointerup', handleMobileDanmuPanelClick, true)
  document.removeEventListener('touchstart', handleMobileDanmuPanelClick, true)
  document.removeEventListener('touchend', handleMobileDanmuPanelClick, true)
  document.removeEventListener('click', handleMobileFullscreenControlClick, true)
  removePlayerTouchListeners()
  stopMobileDanmuFallbackSyncLoop()
  clearMobileControlRefreshTimers()
  disconnectMobileControlDomObserver()
  cleanupMobileLandscape()
})
onMounted(async () => {
  refreshMobileUiState()
  startMobileDanmuFallbackSyncLoop()
  window.addEventListener('keydown', handlePlayerKeydown)
  document.addEventListener('click', handleMobileDanmuPanelClick, true)
  document.addEventListener('mousedown', handleMobileDanmuPanelClick, true)
  document.addEventListener('mouseup', handleMobileDanmuPanelClick, true)
  document.addEventListener('pointerdown', handleMobileDanmuPanelClick, true)
  document.addEventListener('pointerup', handleMobileDanmuPanelClick, true)
  document.addEventListener('touchstart', handleMobileDanmuPanelClick, {capture: true, passive: false})
  document.addEventListener('touchend', handleMobileDanmuPanelClick, {capture: true, passive: false})
  document.addEventListener('click', handleMobileFullscreenControlClick, true)
  addMobileLandscapeListeners()
  await onMountedFun();
})

</script>

<template>
  <div v-if="loading" class="load"></div>
  <div v-else class="content player-page">
    <div class="player-topbar">
      <button class="player-back-button" type="button" @click="goBack">
        <i class='bx bx-left-arrow-alt'></i>
      </button>
      <div class="player-topbar-title">{{ getPlayerTitle() }}</div>
    </div>
    <div v-if="playError" class="player-error">
      <div class="player-error-title">无法播放</div>
      <div class="player-error-text">{{ playError }}</div>
      <button class="player-error-button" type="button" @click="goBack">返回</button>
    </div>
    <div
        v-else
        ref="playerFrame"
        class="player"
        :class="{ 'is-mobile-player': isMobileUiActive(), 'is-mobile-portrait': mobilePortraitActive }"
    >
      <Artplayer class="art-player" @get-instance="getInstance" :option="setting" :style="ArtplayerStyle"/>
      <div class="player-brightness-overlay" :style="{ opacity: brightnessOverlayOpacity }"></div>
      <div class="gesture-feedback" :class="{ 'is-visible': gestureFeedback.visible }">
        <div class="gesture-feedback-title">{{ gestureFeedback.title }}</div>
        <div class="gesture-feedback-value">{{ gestureFeedback.value }}</div>
        <div v-if="gestureFeedback.progress !== null" class="gesture-feedback-progress" aria-hidden="true">
          <span :style="{ width: `${gestureFeedback.progress}%` }"></span>
        </div>
      </div>
      <div
          v-if="shouldShowMobileExtraControls"
          class="mobile-extra-controls"
          @click.stop
          @touchstart.stop
          @touchmove.stop
          @touchend.stop
      >
        <button type="button" @click.stop.prevent="toggleMobileControlMenu('quality')">
          {{ mobileQualityLabel }}
        </button>
        <button type="button" @click.stop.prevent="toggleMobileControlMenu('rate')">
          {{ mobilePlaybackRate }}X
        </button>
        <button type="button" @click.stop.prevent="toggleMobileControlMenu('subtitle')">
          {{ mobileSubtitleLabel }}
        </button>
      </div>
      <div
          v-if="shouldShowMobileInlineTextControls"
          class="mobile-inline-text-controls"
          @click.stop
          @touchstart.stop
          @touchmove.stop
          @touchend.stop
      >
        <button type="button" @click.stop.prevent="toggleMobileControlMenu('quality')">
          {{ mobileQualityLabel }}
        </button>
        <button type="button" @click.stop.prevent="toggleMobileControlMenu('rate')">
          {{ mobilePlaybackRate }}X
        </button>
        <button type="button" @click.stop.prevent="toggleMobileControlMenu('subtitle')">
          {{ mobileSubtitleLabel }}
        </button>
      </div>
      <div
          v-if="(shouldShowMobileExtraControls || shouldShowMobileInlineTextControls) && mobileControlMenu"
          class="mobile-extra-menu"
          @click.stop
          @touchstart.stop
          @touchmove.stop
          @touchend.stop
      >
        <template v-if="mobileControlMenu === 'quality'">
          <button
              v-for="option in mobileQualityOptions"
              :key="`${option.resolution}-${option.bitrate}`"
              type="button"
              :class="{ 'is-active': currentQuality?.resolution === option.resolution && currentQuality?.bitrate === option.bitrate }"
              @click.stop.prevent="selectMobileQuality(option)"
          >
            {{ option.resolution }} <small v-if="option.bitrate">({{ (option.bitrate / 1000000).toFixed(1) }}Mbps)</small>
          </button>
          <button v-if="!mobileQualityOptions.length" type="button" disabled>暂无清晰度</button>
        </template>
        <template v-else-if="mobileControlMenu === 'rate'">
          <button
              v-for="rate in mobileRateOptions"
              :key="rate"
              type="button"
              :class="{ 'is-active': Number(mobilePlaybackRate) === Number(rate) }"
              @click.stop.prevent="selectMobilePlaybackRate(rate)"
          >
            {{ rate }}X
          </button>
        </template>
        <template v-else-if="mobileControlMenu === 'subtitle'">
          <button
              type="button"
              :class="{ 'is-active': !currentSubtitle }"
              @click.stop.prevent="selectMobileSubtitle({ html: '关闭字幕', guid: null, index: -1 })"
          >
            关闭字幕
          </button>
          <button
              v-for="subtitle in mobileSubtitleOptions"
              :key="subtitle.guid || subtitle.index"
              type="button"
              :class="{ 'is-active': currentSubtitle?.guid === subtitle.guid }"
              @click.stop.prevent="selectMobileSubtitle({ ...subtitle, html: `${subtitle.title || ''}${subtitle.language || ''}` || '字幕' })"
          >
            {{ subtitle.title || '字幕' }}{{ subtitle.language || '' }}
          </button>
          <button v-if="!mobileSubtitleOptions.length" type="button" disabled>暂无字幕</button>
        </template>
      </div>
      <div
          class="mobile-danmu-settings is-mobile-portal"
          :class="{ 'is-visible': showMobileDanmuSettings, 'is-forced-landscape-portal': mobileDanmuPortalLandscapeActive, 'is-portrait-portal': mobileDanmuPortalPortraitActive }"
          @click.stop
          @touchstart.stop
          @touchmove.stop
          @touchend.stop
      >
        <div class="mobile-danmu-settings-header">
          <span>弹幕设置</span>
          <button type="button" aria-label="关闭弹幕设置" @click.stop.prevent="closeMobileDanmuPanels">
            <i class='bx bx-x'></i>
          </button>
        </div>
        <div class="mobile-danmu-mode-row">
          <button
              type="button"
              :class="{ 'is-active': mobileDanmuSetting.modes.includes(0) }"
              @click.stop.prevent="toggleMobileDanmuMode(0)"
          >
            滚动
          </button>
          <button
              type="button"
              :class="{ 'is-active': mobileDanmuSetting.modes.includes(1) }"
              @click.stop.prevent="toggleMobileDanmuMode(1)"
          >
            顶部
          </button>
          <button
              type="button"
              :class="{ 'is-active': mobileDanmuSetting.modes.includes(2) }"
              @click.stop.prevent="toggleMobileDanmuMode(2)"
          >
            底部
          </button>
        </div>
        <label class="mobile-danmu-slider">
          <span>不透明度</span>
          <input v-model.number="mobileDanmuSetting.opacity" type="range" min="20" max="100" step="1" @input="applyMobileDanmuSetting()">
          <em>{{ mobileDanmuSetting.opacity }}%</em>
        </label>
        <label class="mobile-danmu-slider">
          <span>字号</span>
          <input v-model.number="mobileDanmuSetting.fontSize" type="range" min="16" max="42" step="1" @input="applyMobileDanmuSetting()">
          <em>{{ mobileDanmuSetting.fontSize }}px</em>
        </label>
        <label class="mobile-danmu-slider">
          <span>速度</span>
          <input v-model.number="mobileDanmuSetting.speed" type="range" min="1" max="10" step="0.5" @input="applyMobileDanmuSetting()">
          <em>{{ mobileDanmuSetting.speed }}</em>
        </label>
        <label class="mobile-danmu-slider">
          <span>显示区域</span>
          <input v-model.number="mobileDanmuSetting.area" type="range" min="25" max="100" step="5" @input="applyMobileDanmuSetting()">
          <em>{{ mobileDanmuSetting.area }}%</em>
        </label>
        <div class="mobile-danmu-switches">
          <button
              type="button"
              :class="{ 'is-active': mobileDanmuSetting.antiOverlap }"
              @click.stop.prevent="mobileDanmuSetting.antiOverlap = !mobileDanmuSetting.antiOverlap; applyMobileDanmuSetting()"
          >
            防重叠
          </button>
          <button
              type="button"
              :class="{ 'is-active': mobileDanmuSetting.outline }"
              @click.stop.prevent="mobileDanmuSetting.outline = !mobileDanmuSetting.outline; applyMobileDanmuSetting()"
          >
            描边
          </button>
          <button
              type="button"
              :class="{ 'is-active': mobileDanmuSetting.synchronousPlayback }"
              @click.stop.prevent="mobileDanmuSetting.synchronousPlayback = !mobileDanmuSetting.synchronousPlayback; applyMobileDanmuSetting()"
          >
            同步倍速
          </button>
        </div>
      </div>
    </div>

    <div v-if="!playError" class="showContainer">
      <div class="data-header">
        <div class="header-left">
          <div class="season-title">
            {{ playInfo.title }}
          </div>
        </div>
        <div class="header-right">
          <n-button @click="showSetUp = !showSetUp;art.pause()" strong secondary circle>
            <i class='bx bx-cog'></i>
          </n-button>
          <n-button @click="showModal = !showModal;art.pause()" strong secondary circle>
            <i class='bx bx-dots-vertical-rounded'></i>
          </n-button>
        </div>
      </div>
      <div class="data-content">
        <div class="overview-text">
          简介：
          <p>{{ playInfo.overview }}</p>
        </div>
      </div>
    </div>
  </div>

  <n-modal v-model:show="showSetUp" title="跳过时间段整季可用，平台链接当前集可用" preset="dialog" draggable="true"
           :style="{ width: '30em', maxHeight: '30em', overflowY: 'auto' }">
    <n-form ref="formRef" :model="seasonConfig">
      <n-form-item path="age" label="跳过开始时间/跳过结束时间">
        <n-dynamic-input
            v-model:value="seasonConfig.list"
            placeholder="请输入跳过时间段"
            :on-create="dynamicInputCreateBySkipTime"
        >
          <template #default="{ value }">
            <div style="display: flex; align-items: center; width: 100%">
              <n-input-number
                  v-model:value="value.startTime"
                  style="margin-right: 12px; width: 160px"
                  placeholder="请输入跳过开始时间"
              />
              <n-input-number
                  v-model:value="value.endTime"
                  style="margin-right: 12px; width: 160px"
                  placeholder="请输入跳过结束时间"
              />
            </div>
          </template>
        </n-dynamic-input>
      </n-form-item>
      <n-form-item label="平台链接">
        <n-dynamic-input
            v-model:value="seasonConfig.url"
            placeholder="请输入平台链接"
            :on-create="dynamicInputCreateByUrl"
        >
          <template #default="{ value }">
            <div style="display: flex; align-items: center; width: 100%">
              <n-input
                  v-model:value="value.url"
                  style="margin-right: 12px;"
                  placeholder="请输入平台链接"
              />
            </div>
          </template>
        </n-dynamic-input>
      </n-form-item>
    </n-form>

    <template #action>
      <n-button @click="putVideoConfig">确认</n-button>
      <n-button @click="showSetUp = false">取消</n-button>
    </template>
  </n-modal>
  <n-modal transform-origin="center" v-model:show="showModal">
    <n-card style="width: 600px" title="外部播放器/播放时请不要关闭本网页，不然播放链接会过期" :bordered="false"
            size="huge" role="dialog" aria-modal="true">
      <template #header-extra>
        <n-button @click="showModal = !showModal" strong secondary circle>
          <i class='bx bx-x'></i>
        </n-button>
      </template>
      <ul class="play-list">
        <li class="play-item">
          <a :href="'iina://weblink/?url=' + playUrl" target="_blank">
            <n-tooltip trigger="hover">
              <template #trigger>
                <img class="play-icon" src="/images/iina.webp" alt="">
              </template>
              IINA
            </n-tooltip>
          </a>
        </li>
        <li class="play-item">
          <a :href="'potplayer://' + playUrl" target="_blank">
            <n-tooltip trigger="hover">
              <template #trigger>
                <img class="play-icon" src="/images/potplayer.webp" alt="">
              </template>
              Potplayer
            </n-tooltip>
          </a>
        </li>
        <li class="play-item">
          <a :href="'vlc://' + playUrl" target="_blank">
            <n-tooltip trigger="hover">
              <template #trigger>
                <img class="play-icon" src="/images/vlc.webp" alt="">
              </template>
              vcl
            </n-tooltip>
          </a>
        </li>
        <li class="play-item">
          <a :href="'nplayer-' + playUrl" target="_blank">
            <n-tooltip trigger="hover">
              <template #trigger>
                <img class="play-icon" src="/images/nplayer.webp" alt="">
              </template>
              nplayer
            </n-tooltip>
          </a>
        </li>
        <li class="play-item">
          <a :href="'infuse://x-callback-url/play?url=' + playUrl" target="_blank">
            <n-tooltip trigger="hover">
              <template #trigger>
                <img class="play-icon" src="/images/infuse.webp" alt="">
              </template>
              infuse
            </n-tooltip>
          </a>
        </li>
        <li class="play-item">
          <a :href="'intent:' + playUrl" target="_blank">
            <n-tooltip trigger="hover">
              <template #trigger>
                <img class="play-icon" src="/images/mxplayer.webp" alt="">
              </template>
              Mxplayer
            </n-tooltip>
          </a>
        </li>
        <li class="play-item">
          <a :href="'intent:' + playUrl" target="_blank">
            <n-tooltip trigger="hover">
              <template #trigger>
                <img class="play-icon" src="/images/mxplayer-pro.webp" alt="">
              </template>
              Mxplayer-Pro
            </n-tooltip>
          </a>
        </li>
      </ul>
    </n-card>
  </n-modal>

</template>


<style scoped>
h1 {
  padding: auto;
}

.content {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  height: 100dvh;
  min-height: 100svh;
  max-height: 100dvh;
  padding: 0 !important;
  overflow: hidden;
  color: #fff;
  background: #000;
  overscroll-behavior: none;
  touch-action: none;
}

.player .art-player {
  background-color: black;
  width: 100%;
  height: 100%;
  aspect-ratio: auto;
}

.player {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #000;
  touch-action: none;
}

:global(html.player-forced-landscape-active),
:global(body.player-forced-landscape-active) {
  overflow: hidden !important;
  background: #000;
  overscroll-behavior: none;
}

:global(body.player-forced-landscape-active) {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
}

.player-brightness-overlay {
  position: absolute;
  inset: 0;
  z-index: 12;
  pointer-events: none;
  background: #000;
  opacity: 0;
  transition: opacity 0.12s ease;
}

.gesture-feedback {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 100050;
  min-width: 124px;
  padding: 12px 18px;
  color: #fff;
  text-align: center;
  background: rgba(0, 0, 0, 0.62);
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 8px;
  opacity: 0;
  pointer-events: none;
  transform: translate(-50%, -50%) scale(0.96);
  transition: opacity 0.12s ease, transform 0.12s ease;
}

.gesture-feedback.is-visible {
  opacity: 1;
  transform: translate(-50%, -50%) scale(1);
}

.player.is-mobile-player .gesture-feedback {
  position: fixed;
  z-index: 2147483001;
}

.player.is-mobile-player,
.player.is-mobile-player .art-player,
.player.is-mobile-player :deep(.art-video-player),
.player.is-mobile-player :deep(.art-video) {
  touch-action: none;
  overscroll-behavior: contain;
}

.player.is-mobile-player.is-forced-landscape {
  position: fixed !important;
  top: 50% !important;
  left: 50% !important;
  z-index: 99999;
  width: 100vh !important;
  width: 100dvh !important;
  height: 100vw !important;
  height: 100dvw !important;
  max-width: none !important;
  max-height: none !important;
  margin: 0 !important;
  background: #000;
  transform: translate(-50%, -50%) rotate(90deg);
  transform-origin: center center;
}

.player.is-mobile-player.is-forced-landscape .art-player,
.player.is-mobile-player.is-forced-landscape :deep(.art-video-player) {
  width: 100% !important;
  height: 100% !important;
}

:global(body.player-forced-landscape-active .player-topbar) {
  opacity: 0;
  pointer-events: none;
}

.gesture-feedback-title {
  margin-bottom: 4px;
  color: rgba(255, 255, 255, 0.76);
  font-size: 13px;
  line-height: 1.2;
}

.gesture-feedback-value {
  color: #fff;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.2;
}

.gesture-feedback-progress {
  width: min(220px, 56vw);
  height: 4px;
  margin: 10px auto 0;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.22);
  border-radius: 999px;
}

.gesture-feedback-progress span {
  display: block;
  height: 100%;
  background: #00aeec;
  border-radius: inherit;
}

.mobile-danmu-controls,
.mobile-danmu-settings {
  display: none;
}

.player.is-mobile-player .mobile-danmu-settings {
  display: block;
}

.player.is-mobile-player .mobile-danmu-controls.is-visible {
  display: flex;
}

.mobile-danmu-controls.is-visible {
  display: flex;
}

.mobile-danmu-settings.is-visible {
  display: block;
}

.mobile-danmu-controls {
  position: absolute;
  right: max(104px, calc(env(safe-area-inset-right, 0px) + 104px));
  bottom: max(17px, calc(env(safe-area-inset-bottom, 0px) + 17px));
  z-index: 100080;
  align-items: center;
  gap: 8px;
  pointer-events: auto;
  touch-action: manipulation;
}

.mobile-danmu-controls.is-mobile-portal.is-visible {
  position: fixed;
  right: max(112px, calc(env(safe-area-inset-right, 0px) + 112px));
  bottom: max(17px, calc(env(safe-area-inset-bottom, 0px) + 17px));
  z-index: 2147483000;
  display: flex !important;
}

.player.is-mobile-player .mobile-danmu-controls.is-player-inline.is-visible {
  position: absolute;
  right: max(92px, calc(env(safe-area-inset-right, 0px) + 92px));
  bottom: max(18px, calc(env(safe-area-inset-bottom, 0px) + 18px));
  z-index: 100090;
  display: flex !important;
  gap: 7px;
  padding: 0;
}

.player.is-mobile-player .mobile-danmu-portrait-dock.is-visible {
  position: fixed;
  right: max(104px, calc(env(safe-area-inset-right, 0px) + 104px));
  bottom: max(16px, calc(env(safe-area-inset-bottom, 0px) + 16px));
  z-index: 2147483002;
  display: flex !important;
  gap: 8px;
  padding: 0;
}

.player.is-mobile-player .mobile-danmu-controls.is-player-inline .mobile-danmu-button {
  width: 36px;
  height: 36px;
  background: rgba(0, 0, 0, 0.62);
}

.player.is-mobile-player .mobile-danmu-portrait-dock .mobile-danmu-button {
  width: 36px;
  height: 36px;
  background: rgba(0, 0, 0, 0.68);
}

.mobile-danmu-controls.is-mobile-portal.is-portrait-portal.is-visible {
  right: max(14px, calc(env(safe-area-inset-right, 0px) + 14px));
  bottom: max(76px, calc(env(safe-area-inset-bottom, 0px) + 76px));
  gap: 10px;
  padding: 5px;
  background: rgba(0, 0, 0, 0.42);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 999px;
  box-shadow: 0 12px 34px rgba(0, 0, 0, 0.36);
  backdrop-filter: saturate(180%) blur(14px);
}

.mobile-danmu-controls.is-mobile-portal.is-portrait-portal .mobile-danmu-button {
  width: 42px;
  height: 42px;
  background: rgba(18, 21, 28, 0.82);
}

.player.is-mobile-player:not(.is-forced-landscape) .mobile-danmu-controls:not(.is-player-inline).is-visible {
  position: fixed;
  right: max(104px, calc(env(safe-area-inset-right, 0px) + 104px));
  bottom: max(18px, calc(env(safe-area-inset-bottom, 0px) + 18px));
  z-index: 2147483000;
  display: flex !important;
}

.mobile-extra-controls,
.mobile-inline-text-controls,
.mobile-extra-menu {
  display: none;
}

.player.is-mobile-player .mobile-extra-menu {
  position: absolute;
  right: max(8px, calc(env(safe-area-inset-right, 0px) + 8px));
  bottom: max(60px, calc(env(safe-area-inset-bottom, 0px) + 60px));
  z-index: 2147483002;
  display: grid;
  grid-template-columns: repeat(2, minmax(92px, 1fr));
  gap: 8px;
  width: min(282px, calc(100% - 20px));
  max-height: min(320px, calc(100svh - 142px));
  padding: 10px;
  overflow-y: auto;
  background: rgba(18, 21, 28, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 10px;
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.44);
  touch-action: pan-y;
  backdrop-filter: saturate(180%) blur(18px);
}

.player.is-mobile-player .mobile-extra-menu button {
  min-height: 34px;
  padding: 0 10px;
  color: rgba(255, 255, 255, 0.9);
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  font-size: 13px;
  line-height: 1.2;
}

.player.is-mobile-player .mobile-extra-menu button.is-active {
  color: #fff;
  background: rgba(0, 174, 236, 0.92);
  border-color: rgba(0, 174, 236, 0.92);
}

.player.is-mobile-player .mobile-extra-menu button:disabled {
  opacity: 0.56;
}

.player.is-mobile-player .mobile-extra-menu small {
  color: rgba(255, 255, 255, 0.68);
  font-size: 11px;
}

.player.is-mobile-player.is-forced-landscape .mobile-extra-menu {
  right: max(12px, calc(env(safe-area-inset-right, 0px) + 12px));
  bottom: max(62px, calc(env(safe-area-inset-bottom, 0px) + 62px));
  width: min(300px, 52vw);
  max-height: min(260px, calc(100% - 112px));
}

.player.is-mobile-player:not(.is-forced-landscape) .mobile-extra-controls {
  position: fixed;
  right: max(12px, calc(env(safe-area-inset-right, 0px) + 12px));
  bottom: max(76px, calc(env(safe-area-inset-bottom, 0px) + 76px));
  z-index: 2147483000;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px;
  background: rgba(0, 0, 0, 0.42);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 999px;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.34);
  backdrop-filter: saturate(180%) blur(14px);
  touch-action: manipulation;
}

.player.is-mobile-player:not(.is-forced-landscape) .mobile-extra-controls button {
  min-width: 44px;
  height: 34px;
  padding: 0 9px;
  color: rgba(255, 255, 255, 0.94);
  background: rgba(18, 21, 28, 0.82);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  font-size: 13px;
  line-height: 1;
  white-space: nowrap;
}

.player.is-mobile-player:not(.is-forced-landscape) .mobile-extra-menu {
  position: absolute;
  right: max(12px, calc(env(safe-area-inset-right, 0px) + 12px));
  bottom: max(122px, calc(env(safe-area-inset-bottom, 0px) + 122px));
  z-index: 2147483001;
  display: grid;
  grid-template-columns: repeat(2, minmax(96px, 1fr));
  gap: 8px;
  width: min(282px, calc(100% - 24px));
  max-height: min(320px, calc(100svh - 176px));
  padding: 10px;
  overflow-y: auto;
  background: rgba(18, 21, 28, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 10px;
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.44);
  backdrop-filter: saturate(180%) blur(18px);
}

.player.is-mobile-player:not(.is-forced-landscape) .mobile-extra-menu button {
  min-height: 34px;
  padding: 0 10px;
  color: rgba(255, 255, 255, 0.9);
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  font-size: 13px;
  line-height: 1.2;
}

.player.is-mobile-player:not(.is-forced-landscape) .mobile-extra-menu button.is-active {
  color: #fff;
  background: rgba(0, 174, 236, 0.92);
  border-color: rgba(0, 174, 236, 0.92);
}

.player.is-mobile-player:not(.is-forced-landscape) .mobile-extra-menu button:disabled {
  opacity: 0.56;
}

.player.is-mobile-player:not(.is-forced-landscape) .mobile-extra-menu small {
  color: rgba(255, 255, 255, 0.68);
  font-size: 11px;
}

.player.is-mobile-player:not(.is-forced-landscape) .mobile-inline-text-controls {
  position: absolute;
  right: max(86px, calc(env(safe-area-inset-right, 0px) + 86px));
  bottom: max(13px, calc(env(safe-area-inset-bottom, 0px) + 13px));
  z-index: 2147483000;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 7px;
  pointer-events: auto;
  touch-action: manipulation;
}

.player.is-mobile-player:not(.is-forced-landscape) .mobile-inline-text-controls button {
  min-width: 24px;
  height: 38px;
  padding: 0 2px;
  color: rgba(255, 255, 255, 0.94);
  background: transparent;
  border: 0;
  border-radius: 4px;
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
}

.player.is-mobile-player:not(.is-forced-landscape) .mobile-inline-text-controls button:active {
  color: #00aeec;
}

.mobile-danmu-settings.is-mobile-portal {
  position: absolute;
  right: max(12px, env(safe-area-inset-right, 0px));
  bottom: max(66px, calc(env(safe-area-inset-bottom, 0px) + 66px));
  z-index: 2147482999;
}

.mobile-danmu-settings.is-mobile-portal.is-portrait-portal {
  right: max(10px, calc(env(safe-area-inset-right, 0px) + 10px));
  bottom: max(76px, calc(env(safe-area-inset-bottom, 0px) + 76px));
  width: min(342px, calc(100% - 20px));
  max-height: min(430px, calc(100svh - 108px));
}

.player.is-mobile-player:not(.is-forced-landscape) .mobile-danmu-settings {
  position: absolute;
  z-index: 2147482999;
  bottom: max(66px, calc(env(safe-area-inset-bottom, 0px) + 66px));
}

@media (max-width: 768px) and (orientation: portrait) {
  .player.is-mobile-player:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-danmu-toggle),
  .player.is-mobile-player:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-danmu-settings-trigger) {
    display: flex !important;
    overflow: visible !important;
  }

  .player.is-mobile-player:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-danmu-toggle) {
    width: 34px !important;
    min-width: 34px !important;
    max-width: 34px !important;
  }

  .player.is-mobile-player:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-danmu-settings-trigger) {
    width: 44px !important;
    min-width: 44px !important;
    max-width: 44px !important;
  }

  .player.is-mobile-player:not(.is-forced-landscape) .mobile-danmu-portrait-dock.is-visible {
    position: fixed;
    right: max(104px, calc(env(safe-area-inset-right, 0px) + 104px));
    bottom: max(16px, calc(env(safe-area-inset-bottom, 0px) + 16px));
    z-index: 2147483002;
    display: flex !important;
  }

  .mobile-danmu-controls.is-mobile-portal.is-visible,
  .player:not(.is-forced-landscape) .mobile-danmu-controls:not(.is-player-inline).is-visible {
    position: fixed;
    display: flex !important;
    right: max(14px, calc(env(safe-area-inset-right, 0px) + 14px));
    bottom: max(76px, calc(env(safe-area-inset-bottom, 0px) + 76px));
    z-index: 2147483000;
  }

  .mobile-danmu-settings.is-mobile-portal,
  .player:not(.is-forced-landscape) .mobile-danmu-settings {
    position: absolute;
    display: block;
    right: max(10px, calc(env(safe-area-inset-right, 0px) + 10px));
    bottom: max(76px, calc(env(safe-area-inset-bottom, 0px) + 76px));
    max-height: min(430px, calc(100svh - 108px));
    z-index: 2147482999;
  }
}

@media (max-width: 820px) and (orientation: portrait), (pointer: coarse) and (orientation: portrait) {
  .player.is-mobile-player:not(.is-forced-landscape) :deep(.art-video-player .art-controls) {
    display: flex !important;
    align-items: center;
    gap: 0 !important;
    width: 100%;
    min-width: 0;
    padding-inline: max(2px, env(safe-area-inset-left, 0px)) max(2px, env(safe-area-inset-right, 0px));
    overflow: visible !important;
  }

  .player.is-mobile-player:not(.is-forced-landscape) :deep(.art-video-player .art-controls-left),
  .player.is-mobile-player:not(.is-forced-landscape) :deep(.art-video-player .art-controls-center),
  .player.is-mobile-player:not(.is-forced-landscape) :deep(.art-video-player .art-controls-right) {
    min-width: 0;
    gap: 0 !important;
  }

  .player.is-mobile-player:not(.is-forced-landscape) :deep(.art-video-player .art-controls-left) {
    flex: 0 0 auto;
    max-width: 146px;
  }

  .player.is-mobile-player:not(.is-forced-landscape) :deep(.art-video-player .art-controls-left .art-control-playAndPause),
  .player.is-mobile-player:not(.is-forced-landscape) :deep(.art-video-player .art-controls-left .art-control-volume) {
    width: 26px !important;
    min-width: 26px !important;
    max-width: 26px !important;
    height: 40px !important;
  }

  .player.is-mobile-player:not(.is-forced-landscape) :deep(.art-video-player .art-controls-center) {
    flex: 0 0 0 !important;
    width: 0 !important;
    min-width: 0 !important;
    overflow: visible !important;
  }

  .player.is-mobile-player:not(.is-forced-landscape) :deep(.art-video-player .art-controls-center .artplayer-plugin-danmuku) {
    display: none !important;
  }

  .player.is-mobile-player:not(.is-forced-landscape) :deep(.art-video-player .artplayer-plugin-danmuku .apd-toggle),
  .player.is-mobile-player:not(.is-forced-landscape) :deep(.art-video-player .artplayer-plugin-danmuku .apd-config) {
    display: inline-flex !important;
    flex: 0 0 28px !important;
    align-items: center;
    justify-content: center;
    width: 28px !important;
    min-width: 28px !important;
    height: 32px !important;
    overflow: visible !important;
  }

  .player.is-mobile-player:not(.is-forced-landscape) :deep(.art-video-player .artplayer-plugin-danmuku .apd-icon) {
    width: 24px !important;
    max-width: none !important;
    height: 24px !important;
  }

  .player.is-mobile-player:not(.is-forced-landscape) :deep(.art-video-player .art-controls-right) {
    display: flex !important;
    flex: 1 1 0;
    justify-content: flex-start;
    max-width: none;
    overflow-x: visible !important;
    overflow-y: visible !important;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
  }

  .player.is-mobile-player:not(.is-forced-landscape) :deep(.art-video-player .art-controls-right::-webkit-scrollbar) {
    display: none;
  }

  .player.is-mobile-player:not(.is-forced-landscape) :deep(.art-video-player .art-controls-right .art-control) {
    display: flex !important;
    flex: 0 0 auto !important;
    align-items: center;
    justify-content: center;
    width: auto !important;
    min-width: 24px !important;
    max-width: none;
    height: 40px !important;
    padding-inline: 0 !important;
    overflow: hidden;
    visibility: visible !important;
    opacity: 1 !important;
    font-size: 11px !important;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .player.is-mobile-player:not(.is-forced-landscape) :deep(.art-video-player .art-controls-right .art-control-画质),
  .player.is-mobile-player:not(.is-forced-landscape) :deep(.art-video-player .art-controls-right .art-control-倍速),
  .player.is-mobile-player:not(.is-forced-landscape) :deep(.art-video-player .art-controls-right .art-control-字幕) {
    display: flex !important;
    flex: 0 0 auto !important;
    height: 40px !important;
    padding-inline: 2px !important;
    overflow: visible !important;
    color: rgba(255, 255, 255, 0.94);
    font-size: 11px !important;
  }

  .player.is-mobile-player:not(.is-forced-landscape) :deep(.art-video-player .art-controls-right .art-control-画质) {
    min-width: 34px !important;
    max-width: 34px !important;
  }

  .player.is-mobile-player:not(.is-forced-landscape) :deep(.art-video-player .art-controls-right .art-control-倍速) {
    min-width: 26px !important;
    max-width: 26px !important;
  }

  .player.is-mobile-player:not(.is-forced-landscape) :deep(.art-video-player .art-controls-right .art-control-字幕) {
    min-width: 32px !important;
    max-width: 32px !important;
  }

  .player.is-mobile-player:not(.is-forced-landscape) :deep(.art-video-player .art-controls-right .art-control-volume),
  .player.is-mobile-player:not(.is-forced-landscape) :deep(.art-video-player .art-controls-right .art-control-setting),
  .player.is-mobile-player:not(.is-forced-landscape) :deep(.art-video-player .art-controls-right .art-control-fullscreen),
  .player.is-mobile-player:not(.is-forced-landscape) :deep(.art-video-player .art-controls-right .art-control-fullscreenWeb),
  .player.is-mobile-player:not(.is-forced-landscape) :deep(.art-video-player .art-controls-right .art-control-mobile-landscape-fullscreen) {
    width: 26px !important;
    min-width: 26px !important;
    max-width: 26px;
  }

  .player.is-mobile-player:not(.is-forced-landscape) :deep(.art-video-player .art-controls-left .art-control-time) {
    flex: 0 0 92px !important;
    width: 92px !important;
    min-width: 92px !important;
    max-width: 92px !important;
    font-size: 11px !important;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .player.is-mobile-player:not(.is-forced-landscape) :deep(.art-video-player .art-selector-value),
  .player.is-mobile-player:not(.is-forced-landscape) :deep(.art-video-player .art-controls-right .art-control span) {
    max-width: 54px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .player.is-mobile-player:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-danmu-toggle),
  .player.is-mobile-player:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-danmu-settings-trigger) {
    display: flex !important;
    overflow: visible !important;
  }

  .player.is-mobile-player:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-danmu-toggle) {
    width: 30px !important;
    min-width: 30px !important;
    max-width: 30px !important;
  }

  .player.is-mobile-player:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-danmu-settings-trigger) {
    width: 42px !important;
    min-width: 42px !important;
    max-width: 42px !important;
  }

  .player.is-mobile-player:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-danmu-toggle) {
    order: 10;
  }

  .player.is-mobile-player:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-danmu-settings-trigger) {
    order: 11;
  }

  .player.is-mobile-player:not(.is-forced-landscape) :deep(.art-video-player .art-control-画质) {
    order: 12;
  }

  .player.is-mobile-player:not(.is-forced-landscape) :deep(.art-video-player .art-control-倍速) {
    order: 13;
  }

  .player.is-mobile-player:not(.is-forced-landscape) :deep(.art-video-player .art-control-字幕) {
    order: 14;
  }

  .player.is-mobile-player:not(.is-forced-landscape) :deep(.art-video-player .art-control-setting) {
    order: 15;
  }

  .player.is-mobile-player:not(.is-forced-landscape) :deep(.art-video-player .art-control-fullscreen),
  .player.is-mobile-player:not(.is-forced-landscape) :deep(.art-video-player .art-control-fullscreenWeb),
  .player.is-mobile-player:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-landscape-fullscreen) {
    order: 16;
  }

  .player:not(.is-forced-landscape) .mobile-danmu-controls.is-player-inline.is-visible {
    position: absolute;
    right: max(96px, calc(env(safe-area-inset-right, 0px) + 96px));
    bottom: max(18px, calc(env(safe-area-inset-bottom, 0px) + 18px));
    z-index: 2147483000;
    display: flex !important;
    gap: 7px;
    padding: 0;
  }

  .player:not(.is-forced-landscape) .mobile-danmu-controls.is-player-inline .mobile-danmu-button {
    width: 36px;
    height: 36px;
    background: rgba(0, 0, 0, 0.66);
  }

}

@media (max-width: 370px) and (orientation: portrait) {
  .player.is-mobile-player:not(.is-forced-landscape) :deep(.art-video-player .art-controls-left) {
    max-width: 124px;
  }

  .player.is-mobile-player:not(.is-forced-landscape) :deep(.art-video-player .art-controls-left .art-control-time) {
    flex: 0 0 72px !important;
    width: 72px !important;
    min-width: 72px !important;
    max-width: 72px !important;
    font-size: 10px !important;
  }

}

.mobile-danmu-button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  width: 36px;
  height: 36px;
  padding: 0;
  color: rgba(255, 255, 255, 0.94);
  background: rgba(0, 0, 0, 0.54);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 50%;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.32);
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
  touch-action: manipulation;
  backdrop-filter: blur(12px);
}

.mobile-danmu-button i {
  font-size: 15px;
  line-height: 1;
}

.mobile-danmu-button.is-active {
  color: #fff;
  background: rgba(0, 174, 236, 0.9);
  border-color: rgba(0, 174, 236, 0.9);
}

.mobile-danmu-button.is-muted {
  color: rgba(255, 255, 255, 0.54);
}

.mobile-danmu-button.is-muted::after {
  position: absolute;
  width: 20px;
  height: 2px;
  background: rgba(255, 255, 255, 0.82);
  border-radius: 999px;
  content: "";
  transform: rotate(-38deg);
}

.mobile-danmu-settings {
  position: absolute;
  right: max(12px, env(safe-area-inset-right, 0px));
  bottom: max(74px, calc(env(safe-area-inset-bottom, 0px) + 74px));
  z-index: 100060;
  box-sizing: border-box;
  width: min(342px, calc(100% - 24px));
  max-height: min(56vh, 430px);
  padding: 14px;
  overflow-y: auto;
  color: #fff;
  background: rgba(18, 21, 28, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  box-shadow: 0 18px 54px rgba(0, 0, 0, 0.44);
  opacity: 0;
  pointer-events: none;
  transform: translateY(8px);
  transition: opacity 0.15s ease, transform 0.15s ease;
  touch-action: pan-y;
  backdrop-filter: saturate(180%) blur(18px);
}

.mobile-danmu-settings.is-visible {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}

.player.is-mobile-player .mobile-danmu-settings.is-mobile-portal.is-visible {
  display: block !important;
  position: absolute !important;
  z-index: 2147483004;
  opacity: 1 !important;
  pointer-events: auto !important;
}

.mobile-danmu-settings-header,
.mobile-danmu-mode-row,
.mobile-danmu-switches {
  display: flex;
  align-items: center;
}

.mobile-danmu-settings-header {
  justify-content: space-between;
  margin-bottom: 12px;
  font-size: 15px;
  font-weight: 700;
  line-height: 20px;
}

.mobile-danmu-settings-header button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  color: rgba(255, 255, 255, 0.82);
  background: transparent;
  border: 0;
  border-radius: 50%;
  font-size: 20px;
}

.mobile-danmu-mode-row,
.mobile-danmu-switches {
  gap: 8px;
  margin-bottom: 12px;
}

.mobile-danmu-mode-row button,
.mobile-danmu-switches button {
  flex: 1;
  min-width: 0;
  height: 32px;
  color: rgba(255, 255, 255, 0.74);
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  font-size: 13px;
}

.mobile-danmu-mode-row button.is-active,
.mobile-danmu-switches button.is-active {
  color: #fff;
  background: rgba(0, 174, 236, 0.84);
  border-color: rgba(0, 174, 236, 0.9);
}

.mobile-danmu-slider {
  display: grid;
  grid-template-columns: 62px minmax(0, 1fr) 48px;
  gap: 10px;
  align-items: center;
  min-height: 34px;
  color: rgba(255, 255, 255, 0.78);
  font-size: 13px;
}

.mobile-danmu-slider + .mobile-danmu-slider {
  margin-top: 8px;
}

.mobile-danmu-slider input {
  width: 100%;
  accent-color: #00aeec;
}

.mobile-danmu-slider em {
  color: #00aeec;
  font-style: normal;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.player-topbar {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 90;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  box-sizing: border-box;
  width: 100%;
  height: calc(50px + env(safe-area-inset-top, 0px));
  padding: calc(19px + env(safe-area-inset-top, 0px)) 16px 0;
  color: #fff;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0));
  pointer-events: none;
}

.player-back-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 28px;
  width: 28px;
  height: 28px;
  padding: 0;
  color: #fff;
  background: transparent;
  border: 0;
  border-radius: 50%;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  pointer-events: auto;
}

.player-back-button:hover {
  background: rgba(255, 255, 255, 0.12);
}

.player-topbar-title {
  min-width: 0;
  max-width: min(720px, calc(100vw - 68px));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #fff;
  font-size: 20px;
  font-weight: 500;
  line-height: 28px;
  pointer-events: none;
}

.player-error {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 24px;
  color: #fff;
  text-align: center;
  background: radial-gradient(circle at center, rgba(24, 24, 24, 0.98), #000 72%);
}

.player-error-title {
  font-size: 28px;
  font-weight: 750;
  line-height: 1.2;
}

.player-error-text {
  max-width: 420px;
  color: rgba(255, 255, 255, 0.72);
  font-size: 15px;
  line-height: 1.7;
}

.player-error-button {
  min-width: 96px;
  height: 38px;
  padding: 0 18px;
  color: #fff;
  background: rgba(255, 255, 255, 0.14);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 999px;
  cursor: pointer;
}

.player-error-button:hover {
  background: rgba(255, 255, 255, 0.22);
}

.showContainer {
  display: none;
}

.data-content {
  font-size: 16px;
}

.data-title {
  font-size: 1.4em;
  margin-bottom: 6px;
  font-weight: 500;
}

.season-title {
  font-size: 1.2em;
  margin-bottom: 4px;
}

.showContainer {
  padding-top: 8px;
  padding-bottom: 8px;
}

.show-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.data-header {
  display: flex;
  justify-content: space-between;
}

.show-card-list {
  display: flex;
  gap: 20px;
}

.show-title {
  font-size: 1.2em;
}

.show-img img {
  border-radius: 4px;
  width: 160px;
  aspect-ratio: 11/16;
}

.show-name {
  width: 160px;
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

.view-item-title {
  font-size: 1.2em;
  padding-bottom: 8px;
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

.show_like .show-item img {
  width: 120px;
  aspect-ratio: 9/12;
  border-radius: 2px;
}

.show_like .show-item {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}


.episode-card-item {
  display: flex;
  gap: 10px;
}

.episode-card-list img {
  width: 100%;
  max-width: 400px;
  min-width: 200px;
  max-height: 120px;
  aspect-ratio: 12/9;
}

.episode-card-list .episode-overview,
.view-item-overview {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
}

.play-list {
  margin: 0;
  padding: 0;
  display: flex;
  justify-content: space-around;
}

.play-list .play-item {

  list-style: none;
}

img.play-icon {
  width: 60px;
  height: 60px;
}

.art-video-player .art-mask .art-state {
  position: absolute;
  bottom: 65px;
  right: 30px;
}

:deep(.art-video-player) {
  --art-theme: #00aeec;
  --art-bottom-height: 72px;
  --art-bottom-offset: 12px;
  --art-bottom-gap: 7px;
  --art-progress-color: rgba(255, 255, 255, 0.28);
  --art-hover-color: rgba(255, 255, 255, 0.42);
  --art-loaded-color: rgba(255, 255, 255, 0.36);
  --art-control-icon-size: 32px;
  --art-control-icon-scale: 1;
  --art-widget-background: rgba(0, 0, 0, 0.72);
  --art-tip-background: rgba(0, 0, 0, 0.78);
  --art-border-radius: 6px;
  --art-settings-max-height: min(320px, calc(100vh - 120px));
  --art-selector-max-height: min(320px, calc(100vh - 120px));
  width: 100% !important;
  height: 100% !important;
}

:deep(.art-video-player .art-video) {
  width: 100% !important;
  height: 100% !important;
}

:deep(.art-video-player .art-bottom) {
  padding-bottom: max(10px, env(safe-area-inset-bottom, 0px));
  background-image: linear-gradient(rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.37), rgba(0, 0, 0, 0.75), rgba(0, 0, 0, 0.75)) !important;
  background-size: 100% var(--art-bottom-height) !important;
}

:deep(.art-video-player .art-control-progress-inner),
:deep(.art-video-player .art-progress-hover),
:deep(.art-video-player .art-progress-loaded),
:deep(.art-video-player .art-progress-played) {
  border-radius: 999px;
}

:deep(.art-video-player .art-controls .art-control) {
  font-weight: 400;
  text-shadow: none;
}

:deep(.art-video-player .art-control-mobile-landscape-fullscreen i) {
  font-size: 24px;
  line-height: 1;
}

:deep(.art-video-player .art-control-mobile-landscape-fullscreen),
:deep(.art-video-player .art-control-mobile-danmu-toggle),
:deep(.art-video-player .art-control-mobile-danmu-settings-trigger) {
  position: relative;
  z-index: 30;
  display: none !important;
  align-items: center;
  justify-content: center;
  height: var(--art-control-height, 38px);
  color: rgba(255, 255, 255, 0.94);
  font-size: 17px;
  font-weight: 700;
  line-height: 1;
  overflow: visible !important;
  pointer-events: auto !important;
  touch-action: manipulation;
}

:deep(.art-video-player .art-control-mobile-landscape-fullscreen) {
  width: 38px;
}

:deep(.art-video-player .art-control-mobile-danmu-toggle) {
  width: 34px;
  min-width: 34px;
}

:deep(.art-video-player .art-control-mobile-danmu-settings-trigger) {
  width: 44px;
  min-width: 44px;
}

.player.is-mobile-player :deep(.art-video-player .art-control-mobile-landscape-fullscreen),
.player.is-mobile-player :deep(.art-video-player .art-control-mobile-danmu-toggle),
.player.is-mobile-player :deep(.art-video-player .art-control-mobile-danmu-settings-trigger) {
  display: flex !important;
  visibility: visible !important;
  opacity: 1 !important;
  pointer-events: auto !important;
}

:deep(.art-video-player .art-control-mobile-danmu-settings-trigger) {
  gap: 3px;
}

:deep(.art-video-player .art-control-mobile-danmu-settings-trigger i) {
  font-size: 16px;
  line-height: 1;
  pointer-events: none;
}

:deep(.art-video-player .mobile-art-danmu-symbol) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 23px;
  height: 23px;
  color: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.44);
  border-radius: 6px;
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
  pointer-events: none;
}

:deep(.art-video-player .art-control-mobile-danmu-toggle.is-muted .mobile-art-danmu-symbol) {
  color: rgba(255, 255, 255, 0.54);
  border-color: rgba(255, 255, 255, 0.28);
}

:deep(.art-video-player .art-control-mobile-danmu-settings-trigger.is-active),
:deep(.art-video-player .art-control-mobile-danmu-settings-trigger.is-active .mobile-art-danmu-symbol),
:deep(.art-video-player .art-control-mobile-danmu-settings-trigger.is-active i),
:deep(.art-video-player .artplayer-plugin-danmuku .apd-config.is-active .apd-icon) {
  color: #00aeec;
  border-color: rgba(0, 174, 236, 0.9);
  fill: #00aeec;
}

:deep(.art-video-player .artplayer-plugin-danmuku) {
  gap: 12px;
  color: #fff;
  font-size: 12px;
  font-weight: 500;
}

:deep(.art-video-player .artplayer-plugin-danmuku .apd-icon) {
  fill: rgba(255, 255, 255, 0.88);
  opacity: 0.9;
}

:deep(.art-video-player .artplayer-plugin-danmuku .apd-icon:hover) {
  fill: #00aeec;
  opacity: 1;
}

:deep(.art-video-player .art-selector-list),
:deep(.art-video-player .art-settings),
:deep(.art-video-player .apd-config-panel-inner),
:deep(.art-video-player .apd-style-panel-inner) {
  color: #fff;
  background-color: rgba(21, 24, 31, 0.88) !important;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  box-shadow: 0 16px 42px rgba(0, 0, 0, 0.42);
  backdrop-filter: saturate(180%) blur(18px);
}

:deep(.art-video-player .apd-config-panel-inner) {
  padding: 14px 16px 16px;
}

:deep(.art-video-player .apd-style-panel-inner) {
  padding: 12px;
}

:deep(.art-video-player .apd-config-panel-inner::before) {
  display: block;
  margin-bottom: 12px;
  color: rgba(255, 255, 255, 0.92);
  content: "弹幕设置";
  font-size: 14px;
  font-weight: 700;
  line-height: 20px;
}

:deep(.art-video-player .art-selector-item),
:deep(.art-video-player .art-setting-item) {
  min-height: 34px;
  font-size: 14px;
}

:deep(.art-video-player .art-selector-value) {
  max-width: 118px;
  overflow: hidden;
  text-overflow: ellipsis;
}

:deep(.art-video-player .apd-config-panel) {
  bottom: 30px;
}

:deep(.art-video-player .apd-style-panel) {
  bottom: 30px;
}

:deep(.art-video-player .apd-config.is-panel-open .apd-config-panel),
:deep(.art-video-player .apd-style.is-panel-open .apd-style-panel) {
  opacity: 1;
  pointer-events: all;
}

.player.is-mobile-player :deep(.art-video-player .apd-config-panel),
.player.is-mobile-player :deep(.art-video-player .apd-style-panel) {
  display: none !important;
  opacity: 0 !important;
  pointer-events: none !important;
}

.player.is-mobile-player :deep(.art-video-player .artplayer-plugin-danmuku) {
  display: none !important;
}

:deep(.art-video-player .apd-config-mode),
:deep(.art-video-player .apd-config-slider),
:deep(.art-video-player .apd-config-other),
:deep(.art-video-player .apd-style-mode) {
  margin-bottom: 14px;
}

:deep(.art-video-player .apd-config-slider) {
  display: grid;
  grid-template-columns: 62px minmax(128px, 1fr) 44px;
  gap: 12px;
  align-items: center;
}

:deep(.art-video-player .apd-config-slider .apd-value) {
  width: auto;
  color: #00aeec;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

:deep(.art-video-player .apd-slider-line) {
  height: 3px;
  background-color: rgba(255, 255, 255, 0.22);
}

:deep(.art-video-player .apd-slider-progress),
:deep(.art-video-player .apd-slider-dot) {
  background-color: #00aeec;
}

:deep(.art-video-player .apd-slider-dot) {
  width: 13px;
  height: 13px;
  box-shadow: 0 0 0 4px rgba(0, 174, 236, 0.16);
}

:deep(.art-video-player .apd-modes) {
  gap: 18px;
}

:deep(.art-video-player .apd-mode:hover),
:deep(.art-video-player .apd-other:hover) {
  color: #00aeec;
}

:deep(.art-video-player .apd-emitter) {
  overflow: hidden;
  background-color: rgba(255, 255, 255, 0.14);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 999px;
}

:deep(.art-video-player .apd-send) {
  background-color: #00aeec;
  border-radius: 0 999px 999px 0;
}

:deep(.art-video-player .art-notice) {
  top: calc(50px + env(safe-area-inset-top, 0px));
}

@media (max-width: 767px) {
  img.play-icon {
    width: 40px;
    height: 40px;
  }
}

/* 移动端适配样式 */
@media (max-width: 768px) {
  .data-header {
    flex-direction: column;
    gap: 8px;
  }

  .header-right {
    display: flex;
    gap: 8px;
  }

  .data-content {
    font-size: 14px;
  }

  .season-title {
    font-size: 1.1em;
  }

  /* 调整外部播放器列表布局 */
  .play-list {
    flex-wrap: wrap;
    gap: 16px;
    justify-content: flex-start;
  }

  .play-list .play-item {
    width: calc(33.33% - 16px);
    text-align: center;
  }

  img.play-icon {
    width: 48px;
    height: 48px;
  }

  /* 调整设置弹窗宽度 */
  :deep(.n-modal) {
    width: 90vw !important;
    max-width: 30em;
  }

  :deep(.art-video-player) {
    --art-bottom-height: 78px;
    --art-bottom-offset: 10px;
    --art-control-height: 44px;
    --art-control-icon-size: 30px;
    --art-settings-max-height: min(220px, calc(100svh - 96px));
    --art-selector-max-height: min(220px, calc(100svh - 96px));
  }

  .player :deep(.art-video-player .art-control-mobile-landscape-fullscreen),
  .player :deep(.art-video-player .art-control-mobile-danmu-toggle),
  .player :deep(.art-video-player .art-control-mobile-danmu-settings-trigger) {
    display: flex !important;
  }

  .player.is-mobile-player:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-danmu-toggle),
  .player.is-mobile-player:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-danmu-settings-trigger) {
    display: flex !important;
    overflow: visible !important;
  }

  .player.is-mobile-player:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-danmu-toggle) {
    width: 34px !important;
    min-width: 34px !important;
    max-width: 34px !important;
  }

  .player.is-mobile-player:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-danmu-settings-trigger) {
    width: 44px !important;
    min-width: 44px !important;
    max-width: 44px !important;
  }

  :deep(.art-video-player .art-controls-center) {
    display: flex !important;
    flex: 0 0 0;
    align-items: center;
    justify-content: center;
    width: 0;
    min-width: 0;
    overflow: visible !important;
  }

  :deep(.art-video-player .art-controls-center .artplayer-plugin-danmuku) {
    display: none !important;
  }

  :deep(.art-video-player .art-controls-center .apd-config-panel) {
    right: -70px;
    left: auto;
    width: min(324px, calc(100vw - 24px));
  }

  .player:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-danmu-toggle),
  .player:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-danmu-settings-trigger) {
    display: flex !important;
    overflow: visible !important;
  }

  .player:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-danmu-toggle) {
    width: 34px !important;
    min-width: 34px !important;
    max-width: 34px !important;
  }

  .player:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-danmu-settings-trigger) {
    width: 44px !important;
    min-width: 44px !important;
    max-width: 44px !important;
  }

  .player.is-forced-landscape {
    position: fixed !important;
    top: 50% !important;
    left: 50% !important;
    z-index: 99999;
    width: 100vh !important;
    width: 100dvh !important;
    height: 100vw !important;
    height: 100dvw !important;
    max-width: none !important;
    max-height: none !important;
    margin: 0 !important;
    background: #000;
    transform: translate(-50%, -50%) rotate(90deg);
    transform-origin: center center;
  }

  .player.is-forced-landscape .art-player,
  .player.is-forced-landscape :deep(.art-video-player) {
    width: 100% !important;
    height: 100% !important;
  }

  .player.is-forced-landscape .gesture-feedback {
    z-index: 100020;
    min-width: 180px;
    padding: 14px 22px;
  }

  .player.is-forced-landscape .gesture-feedback-value {
    font-size: 22px;
  }

  .player.is-forced-landscape .mobile-danmu-controls.is-visible {
    right: max(178px, calc(env(safe-area-inset-right, 0px) + 178px));
    bottom: max(18px, calc(env(safe-area-inset-bottom, 0px) + 18px));
    display: flex !important;
  }

  .mobile-danmu-controls.is-mobile-portal.is-forced-landscape-portal.is-visible {
    right: max(178px, calc(env(safe-area-inset-right, 0px) + 178px));
    bottom: max(18px, calc(env(safe-area-inset-bottom, 0px) + 18px));
    display: flex !important;
  }

  .player.is-forced-landscape .mobile-danmu-settings {
    display: block;
    right: max(12px, env(safe-area-inset-right, 0px));
    bottom: max(70px, calc(env(safe-area-inset-bottom, 0px) + 70px));
    width: min(342px, calc(100% - 24px));
    max-height: calc(100% - 96px);
  }

  .mobile-danmu-settings.is-mobile-portal.is-forced-landscape-portal {
    display: block;
    right: max(12px, env(safe-area-inset-right, 0px));
    bottom: max(70px, calc(env(safe-area-inset-bottom, 0px) + 70px));
    width: min(342px, calc(100% - 24px));
    max-height: calc(100% - 96px);
  }

  :global(body.player-forced-landscape-active .player-topbar) {
    opacity: 0;
    pointer-events: none;
  }

  .player.is-forced-landscape :deep(.art-video-player .apd-config-panel),
  .player.is-forced-landscape :deep(.art-video-player .apd-style-panel) {
    bottom: 38px;
  }

  @media (orientation: landscape) {
    .mobile-danmu-controls:not(.is-mobile-portal) {
      display: none;
    }
  }
}

/* 超小屏幕适配 */
@media (max-width: 480px) {
  .play-list .play-item {
    width: calc(50% - 16px);
  }

  img.play-icon {
    width: 40px;
    height: 40px;
  }

  :deep(.art-video-player) {
    --art-control-height: 40px;
    --art-control-icon-size: 28px;
    --art-bottom-height: 72px;
  }
}

.player.is-mobile-player :deep(.art-video-player .art-control-mobile-danmu-toggle) {
  flex: 0 0 30px !important;
  width: 30px !important;
  min-width: 30px !important;
  max-width: 30px !important;
  padding-inline: 0 !important;
}

.player.is-mobile-player :deep(.art-video-player .art-control-mobile-danmu-settings-trigger) {
  flex: 0 0 42px !important;
  width: 42px !important;
  min-width: 42px !important;
  max-width: 42px !important;
  padding-inline: 0 !important;
}

.player.is-mobile-player :deep(.art-video-player .art-controls-right .art-control.art-control-mobile-danmu-toggle) {
  flex: 0 0 30px !important;
  width: 30px !important;
  min-width: 30px !important;
  max-width: 30px !important;
}

.player.is-mobile-player :deep(.art-video-player .art-controls-right .art-control.art-control-mobile-danmu-settings-trigger) {
  flex: 0 0 42px !important;
  width: 42px !important;
  min-width: 42px !important;
  max-width: 42px !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls) {
  display: flex !important;
  align-items: center !important;
  gap: 0 !important;
  box-sizing: border-box;
  width: 100% !important;
  min-width: 0 !important;
  padding-inline: max(8px, env(safe-area-inset-left, 0px)) max(8px, env(safe-area-inset-right, 0px)) !important;
  overflow: visible !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-left) {
  flex: 0 0 108px !important;
  width: 108px !important;
  min-width: 108px !important;
  max-width: 108px !important;
  gap: 0 !important;
  overflow: hidden !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-right) {
  display: flex !important;
  flex: 1 1 0 !important;
  min-width: 0 !important;
  max-width: none !important;
  gap: 0 !important;
  justify-content: flex-start !important;
  overflow: visible !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-left .art-control-playAndPause),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-left .art-control-volume) {
  flex: 0 0 28px !important;
  width: 28px !important;
  min-width: 28px !important;
  max-width: 28px !important;
  height: 40px !important;
  padding-inline: 0 !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-left .art-control-time),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-time) {
  flex: 0 0 50px !important;
  width: 50px !important;
  min-width: 50px !important;
  max-width: 50px !important;
  height: 40px !important;
  padding-inline: 0 !important;
  overflow: hidden !important;
  color: rgba(255, 255, 255, 0.94);
  font-size: 11px !important;
  white-space: nowrap !important;
  text-overflow: clip !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-right .art-control) {
  flex: 0 0 auto !important;
  height: 40px !important;
  padding-inline: 0 !important;
  overflow: hidden !important;
  visibility: visible !important;
  opacity: 1 !important;
  pointer-events: auto !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-danmu-toggle) {
  order: 10;
  flex-basis: 30px !important;
  width: 30px !important;
  min-width: 30px !important;
  max-width: 30px !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-danmu-settings-trigger) {
  order: 11;
  flex-basis: 42px !important;
  width: 42px !important;
  min-width: 42px !important;
  max-width: 42px !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-画质) {
  order: 12;
  flex-basis: 34px !important;
  width: 34px !important;
  min-width: 34px !important;
  max-width: 34px !important;
  color: rgba(255, 255, 255, 0.94);
  font-size: 11px !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-倍速) {
  order: 13;
  flex-basis: 28px !important;
  width: 28px !important;
  min-width: 28px !important;
  max-width: 28px !important;
  color: rgba(255, 255, 255, 0.94);
  font-size: 11px !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-字幕) {
  order: 14;
  flex-basis: 34px !important;
  width: 34px !important;
  min-width: 34px !important;
  max-width: 34px !important;
  color: rgba(255, 255, 255, 0.94);
  font-size: 11px !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-setting) {
  order: 15;
  flex-basis: 28px !important;
  width: 28px !important;
  min-width: 28px !important;
  max-width: 28px !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-fullscreen),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-fullscreenWeb),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-landscape-fullscreen) {
  order: 16;
  flex-basis: 28px !important;
  width: 28px !important;
  min-width: 28px !important;
  max-width: 28px !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls) {
  padding-inline: max(4px, env(safe-area-inset-left, 0px)) max(4px, env(safe-area-inset-right, 0px)) !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-left) {
  flex: 0 0 132px !important;
  width: 132px !important;
  min-width: 132px !important;
  max-width: 132px !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-left .art-control-playAndPause),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-left .art-control-volume) {
  flex: 0 0 27px !important;
  width: 27px !important;
  min-width: 27px !important;
  max-width: 27px !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-left .art-control-time),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-time) {
  flex: 0 0 78px !important;
  width: 78px !important;
  min-width: 78px !important;
  max-width: 78px !important;
  font-size: 10px !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-right) {
  flex: 1 1 auto !important;
  justify-content: flex-end !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-danmu-toggle) {
  flex: 0 0 28px !important;
  width: 28px !important;
  min-width: 28px !important;
  max-width: 28px !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-danmu-settings-trigger) {
  flex: 0 0 38px !important;
  width: 38px !important;
  min-width: 38px !important;
  max-width: 38px !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-画质),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-字幕) {
  flex: 0 0 30px !important;
  width: 30px !important;
  min-width: 30px !important;
  max-width: 30px !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-倍速),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-setting),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-fullscreen),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-fullscreenWeb),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-landscape-fullscreen) {
  flex: 0 0 26px !important;
  width: 26px !important;
  min-width: 26px !important;
  max-width: 26px !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) .mobile-inline-text-controls {
  right: max(52px, calc(env(safe-area-inset-right, 0px) + 52px));
  bottom: max(8px, calc(env(safe-area-inset-bottom, 0px) + 8px));
  z-index: 2147483002;
  display: grid !important;
  grid-template-columns: 30px 26px 34px;
  align-items: center;
  justify-content: end;
  width: 90px;
  gap: 0;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) .mobile-inline-text-controls button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  width: 100%;
  height: 40px;
  padding: 0;
  overflow: hidden;
  color: rgba(255, 255, 255, 0.94);
  font-size: 11px;
  font-weight: 500;
  text-overflow: clip;
}

@media (max-width: 350px) and (orientation: portrait) {
  .player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-left) {
    flex-basis: 108px !important;
    width: 108px !important;
    min-width: 108px !important;
    max-width: 108px !important;
  }

  .player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-left .art-control-time),
  .player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-time) {
    flex-basis: 54px !important;
    width: 54px !important;
    min-width: 54px !important;
    max-width: 54px !important;
  }
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) {
  --mobile-player-left-width: clamp(112px, 33vw, 132px);
  --mobile-player-toggle-width: 27px;
  --mobile-player-danmu-settings-width: 36px;
  --mobile-player-text-width: 29px;
  --mobile-player-rate-width: 23px;
  --mobile-player-icon-width: 24px;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-bottom) {
  --art-control-height: 40px;
  --art-control-icon-size: 27px;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls) {
  display: flex !important;
  align-items: center !important;
  gap: 0 !important;
  box-sizing: border-box;
  width: 100% !important;
  min-width: 0 !important;
  padding-inline: max(4px, env(safe-area-inset-left, 0px)) max(4px, env(safe-area-inset-right, 0px)) !important;
  overflow: visible !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-left) {
  display: flex !important;
  flex: 0 0 var(--mobile-player-left-width) !important;
  width: var(--mobile-player-left-width) !important;
  min-width: var(--mobile-player-left-width) !important;
  max-width: var(--mobile-player-left-width) !important;
  gap: 0 !important;
  overflow: hidden !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-right) {
  display: flex !important;
  flex: 1 1 auto !important;
  align-items: center !important;
  justify-content: flex-end !important;
  gap: 0 !important;
  min-width: 0 !important;
  max-width: none !important;
  overflow: visible !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-left .art-control-playAndPause),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-left .art-control-volume) {
  flex: 0 0 26px !important;
  width: 26px !important;
  min-width: 26px !important;
  max-width: 26px !important;
  height: 40px !important;
  padding-inline: 0 !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-left .art-control-time),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-time) {
  flex: 0 0 calc(var(--mobile-player-left-width) - 52px) !important;
  width: calc(var(--mobile-player-left-width) - 52px) !important;
  min-width: calc(var(--mobile-player-left-width) - 52px) !important;
  max-width: calc(var(--mobile-player-left-width) - 52px) !important;
  height: 40px !important;
  padding-inline: 0 !important;
  overflow: hidden !important;
  color: rgba(255, 255, 255, 0.94);
  font-size: 10px !important;
  white-space: nowrap !important;
  text-overflow: clip !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-right .art-control) {
  display: flex !important;
  flex: 0 0 auto !important;
  align-items: center !important;
  justify-content: center !important;
  height: 40px !important;
  padding-inline: 0 !important;
  overflow: hidden !important;
  visibility: visible !important;
  opacity: 1 !important;
  pointer-events: auto !important;
  color: rgba(255, 255, 255, 0.94);
  font-size: 10px !important;
  white-space: nowrap !important;
  text-overflow: clip !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-danmu-toggle) {
  order: 10;
  flex-basis: var(--mobile-player-toggle-width) !important;
  width: var(--mobile-player-toggle-width) !important;
  min-width: var(--mobile-player-toggle-width) !important;
  max-width: var(--mobile-player-toggle-width) !important;
  overflow: visible !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-danmu-settings-trigger) {
  order: 11;
  flex-basis: var(--mobile-player-danmu-settings-width) !important;
  width: var(--mobile-player-danmu-settings-width) !important;
  min-width: var(--mobile-player-danmu-settings-width) !important;
  max-width: var(--mobile-player-danmu-settings-width) !important;
  overflow: visible !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-画质),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-字幕) {
  flex-basis: var(--mobile-player-text-width) !important;
  width: var(--mobile-player-text-width) !important;
  min-width: var(--mobile-player-text-width) !important;
  max-width: var(--mobile-player-text-width) !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-画质) {
  order: 12;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-倍速) {
  order: 13;
  flex-basis: var(--mobile-player-rate-width) !important;
  width: var(--mobile-player-rate-width) !important;
  min-width: var(--mobile-player-rate-width) !important;
  max-width: var(--mobile-player-rate-width) !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-字幕) {
  order: 14;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-setting) {
  order: 15;
  flex-basis: var(--mobile-player-icon-width) !important;
  width: var(--mobile-player-icon-width) !important;
  min-width: var(--mobile-player-icon-width) !important;
  max-width: var(--mobile-player-icon-width) !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-fullscreen),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-fullscreenWeb),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-landscape-fullscreen) {
  order: 16;
  flex-basis: var(--mobile-player-icon-width) !important;
  width: var(--mobile-player-icon-width) !important;
  min-width: var(--mobile-player-icon-width) !important;
  max-width: var(--mobile-player-icon-width) !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .mobile-art-danmu-symbol) {
  width: 21px;
  height: 21px;
  font-size: 12px;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-danmu-settings-trigger i) {
  font-size: 13px;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) {
  --mobile-player-left-width: clamp(96px, 29vw, 116px);
  --mobile-player-toggle-width: 27px;
  --mobile-player-danmu-settings-width: 36px;
  --mobile-player-text-width: 30px;
  --mobile-player-rate-width: 24px;
  --mobile-player-icon-width: 23px;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls) {
  box-sizing: border-box;
  width: 100% !important;
  padding-inline: max(3px, env(safe-area-inset-left, 0px)) max(3px, env(safe-area-inset-right, 0px)) !important;
  overflow: visible !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-left) {
  flex: 0 0 var(--mobile-player-left-width) !important;
  width: var(--mobile-player-left-width) !important;
  min-width: var(--mobile-player-left-width) !important;
  max-width: var(--mobile-player-left-width) !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-left .art-control-time),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-time) {
  flex: 0 0 calc(var(--mobile-player-left-width) - 52px) !important;
  width: calc(var(--mobile-player-left-width) - 52px) !important;
  min-width: calc(var(--mobile-player-left-width) - 52px) !important;
  max-width: calc(var(--mobile-player-left-width) - 52px) !important;
  font-size: 10px !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-right) {
  display: flex !important;
  flex: 1 1 0 !important;
  align-items: center !important;
  justify-content: flex-end !important;
  gap: 0 !important;
  min-width: 0 !important;
  overflow: visible !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-right .art-control) {
  display: flex !important;
  flex: 0 0 auto !important;
  align-items: center !important;
  justify-content: center !important;
  height: 40px !important;
  padding-inline: 0 !important;
  overflow: visible !important;
  visibility: visible !important;
  opacity: 1 !important;
  pointer-events: auto !important;
  font-size: 10px !important;
  white-space: nowrap !important;
  text-overflow: clip !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-danmu-toggle) {
  flex: 0 0 var(--mobile-player-toggle-width) !important;
  width: var(--mobile-player-toggle-width) !important;
  min-width: var(--mobile-player-toggle-width) !important;
  max-width: var(--mobile-player-toggle-width) !important;
  overflow: visible !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-danmu-settings-trigger) {
  flex: 0 0 var(--mobile-player-danmu-settings-width) !important;
  width: var(--mobile-player-danmu-settings-width) !important;
  min-width: var(--mobile-player-danmu-settings-width) !important;
  max-width: var(--mobile-player-danmu-settings-width) !important;
  gap: 2px;
  overflow: visible !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-画质),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-字幕) {
  display: flex !important;
  flex: 0 0 var(--mobile-player-text-width) !important;
  width: var(--mobile-player-text-width) !important;
  min-width: var(--mobile-player-text-width) !important;
  max-width: var(--mobile-player-text-width) !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-倍速) {
  display: flex !important;
  flex: 0 0 var(--mobile-player-rate-width) !important;
  width: var(--mobile-player-rate-width) !important;
  min-width: var(--mobile-player-rate-width) !important;
  max-width: var(--mobile-player-rate-width) !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-setting),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-fullscreen),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-fullscreenWeb),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-landscape-fullscreen) {
  display: flex !important;
  flex: 0 0 var(--mobile-player-icon-width) !important;
  width: var(--mobile-player-icon-width) !important;
  min-width: var(--mobile-player-icon-width) !important;
  max-width: var(--mobile-player-icon-width) !important;
}

@media (max-width: 350px) and (orientation: portrait) {
  .player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) {
    --mobile-player-left-width: 92px;
    --mobile-player-toggle-width: 26px;
    --mobile-player-danmu-settings-width: 34px;
    --mobile-player-text-width: 28px;
    --mobile-player-rate-width: 22px;
    --mobile-player-icon-width: 22px;
  }
}

.player.is-mobile-player :deep(.art-video-player .art-control-mobile-danmu-toggle),
.player.is-mobile-player :deep(.art-video-player .art-control-mobile-danmu-settings-trigger),
.player.is-mobile-player :deep(.art-video-player .art-control-画质),
.player.is-mobile-player :deep(.art-video-player .art-control-倍速),
.player.is-mobile-player :deep(.art-video-player .art-control-字幕),
.player.is-mobile-player :deep(.art-video-player .art-control-setting),
.player.is-mobile-player :deep(.art-video-player .art-control-mobile-landscape-fullscreen),
.player.is-mobile-player :deep(.art-video-player .art-control-fullscreen),
.player.is-mobile-player :deep(.art-video-player .art-control-fullscreenWeb) {
  display: flex !important;
  visibility: visible !important;
  opacity: 1 !important;
  pointer-events: auto !important;
  touch-action: manipulation;
}

.player.is-mobile-player :deep(.art-video-player .art-control-mobile-danmu-toggle span),
.player.is-mobile-player :deep(.art-video-player .art-control-mobile-danmu-settings-trigger span),
.player.is-mobile-player :deep(.art-video-player .art-control-mobile-danmu-settings-trigger i) {
  pointer-events: none;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) {
  --mobile-player-left-width: clamp(92px, 27vw, 108px);
  --mobile-player-toggle-width: 27px;
  --mobile-player-danmu-settings-width: 36px;
  --mobile-player-quality-width: 32px;
  --mobile-player-rate-width: 24px;
  --mobile-player-subtitle-width: 32px;
  --mobile-player-icon-width: 24px;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls) {
  display: flex !important;
  align-items: center !important;
  gap: 0 !important;
  width: 100% !important;
  min-width: 0 !important;
  padding-inline: max(3px, env(safe-area-inset-left, 0px)) max(3px, env(safe-area-inset-right, 0px)) !important;
  overflow: visible !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-left) {
  flex: 0 0 var(--mobile-player-left-width) !important;
  width: var(--mobile-player-left-width) !important;
  min-width: var(--mobile-player-left-width) !important;
  max-width: var(--mobile-player-left-width) !important;
  overflow: hidden !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-left .art-control-playAndPause),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-left .art-control-volume) {
  flex: 0 0 25px !important;
  width: 25px !important;
  min-width: 25px !important;
  max-width: 25px !important;
  height: 40px !important;
  padding-inline: 0 !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-left .art-control-time),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-time) {
  flex: 0 0 calc(var(--mobile-player-left-width) - 50px) !important;
  width: calc(var(--mobile-player-left-width) - 50px) !important;
  min-width: calc(var(--mobile-player-left-width) - 50px) !important;
  max-width: calc(var(--mobile-player-left-width) - 50px) !important;
  height: 40px !important;
  padding-inline: 0 !important;
  overflow: hidden !important;
  font-size: 10px !important;
  white-space: nowrap !important;
  text-overflow: clip !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-right) {
  display: flex !important;
  flex: 1 1 auto !important;
  align-items: center !important;
  justify-content: flex-end !important;
  gap: 0 !important;
  min-width: 0 !important;
  overflow: visible !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-right .art-control) {
  display: flex !important;
  flex: 0 0 auto !important;
  align-items: center !important;
  justify-content: center !important;
  height: 40px !important;
  padding-inline: 0 !important;
  overflow: visible !important;
  font-size: 10px !important;
  white-space: nowrap !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-danmu-toggle) {
  order: 10;
  flex: 0 0 var(--mobile-player-toggle-width) !important;
  width: var(--mobile-player-toggle-width) !important;
  min-width: var(--mobile-player-toggle-width) !important;
  max-width: var(--mobile-player-toggle-width) !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-danmu-settings-trigger) {
  order: 11;
  flex: 0 0 var(--mobile-player-danmu-settings-width) !important;
  width: var(--mobile-player-danmu-settings-width) !important;
  min-width: var(--mobile-player-danmu-settings-width) !important;
  max-width: var(--mobile-player-danmu-settings-width) !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-画质) {
  order: 12;
  flex: 0 0 var(--mobile-player-quality-width) !important;
  width: var(--mobile-player-quality-width) !important;
  min-width: var(--mobile-player-quality-width) !important;
  max-width: var(--mobile-player-quality-width) !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-倍速) {
  order: 13;
  flex: 0 0 var(--mobile-player-rate-width) !important;
  width: var(--mobile-player-rate-width) !important;
  min-width: var(--mobile-player-rate-width) !important;
  max-width: var(--mobile-player-rate-width) !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-字幕) {
  order: 14;
  flex: 0 0 var(--mobile-player-subtitle-width) !important;
  width: var(--mobile-player-subtitle-width) !important;
  min-width: var(--mobile-player-subtitle-width) !important;
  max-width: var(--mobile-player-subtitle-width) !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-画质),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-倍速),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-字幕) {
  color: rgba(255, 255, 255, 0.94) !important;
  pointer-events: auto !important;
  visibility: visible !important;
  opacity: 1 !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-画质 *),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-倍速 *),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-字幕 *) {
  color: inherit !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-setting) {
  order: 15;
  flex: 0 0 var(--mobile-player-icon-width) !important;
  width: var(--mobile-player-icon-width) !important;
  min-width: var(--mobile-player-icon-width) !important;
  max-width: var(--mobile-player-icon-width) !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-fullscreen),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-fullscreenWeb),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-landscape-fullscreen) {
  order: 16;
  flex: 0 0 var(--mobile-player-icon-width) !important;
  width: var(--mobile-player-icon-width) !important;
  min-width: var(--mobile-player-icon-width) !important;
  max-width: var(--mobile-player-icon-width) !important;
}

@media (max-width: 350px) and (orientation: portrait) {
  .player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) {
    --mobile-player-left-width: 88px;
    --mobile-player-toggle-width: 26px;
    --mobile-player-danmu-settings-width: 34px;
    --mobile-player-quality-width: 29px;
    --mobile-player-rate-width: 22px;
    --mobile-player-subtitle-width: 29px;
    --mobile-player-icon-width: 22px;
  }
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-right) {
  display: flex !important;
  flex: 1 1 0 !important;
  align-items: center !important;
  justify-content: flex-end !important;
  min-width: 0 !important;
  overflow: visible !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-danmu-toggle),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-danmu-settings-trigger),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-画质),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-倍速),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-字幕),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-setting),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-fullscreen),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-fullscreenWeb),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-landscape-fullscreen) {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  height: 40px !important;
  padding-inline: 0 !important;
  color: rgba(255, 255, 255, 0.94) !important;
  visibility: visible !important;
  opacity: 1 !important;
  pointer-events: auto !important;
  white-space: nowrap !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-画质),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-字幕) {
  flex: 0 0 34px !important;
  width: 34px !important;
  min-width: 34px !important;
  max-width: 34px !important;
  font-size: 11px !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-倍速) {
  flex: 0 0 26px !important;
  width: 26px !important;
  min-width: 26px !important;
  max-width: 26px !important;
  font-size: 11px !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-setting),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-fullscreen),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-fullscreenWeb),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-landscape-fullscreen) {
  flex: 0 0 25px !important;
  width: 25px !important;
  min-width: 25px !important;
  max-width: 25px !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-selector-value),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-right .art-control span) {
  max-width: 34px !important;
  overflow: hidden !important;
  color: inherit !important;
  text-overflow: clip !important;
}

.player.is-mobile-player.is-forced-landscape {
  position: fixed !important;
  inset: 0 !important;
  top: 0 !important;
  left: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  height: 100dvh !important;
  max-width: none !important;
  max-height: none !important;
  margin: 0 !important;
  overflow: hidden !important;
  transform: none !important;
  transform-origin: center center !important;
}

.player.is-mobile-player.is-forced-landscape .art-player {
  max-width: none !important;
  max-height: none !important;
}

.player.is-mobile-player.is-forced-landscape :deep(.art-video-player) {
  width: 100% !important;
  height: 100% !important;
  max-width: none !important;
  max-height: none !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) {
  --mobile-player-left-width: clamp(84px, calc(100vw - 236px), 128px);
  --mobile-player-toggle-width: 26px;
  --mobile-player-danmu-settings-width: 34px;
  --mobile-player-quality-width: 30px;
  --mobile-player-rate-width: 24px;
  --mobile-player-subtitle-width: 30px;
  --mobile-player-icon-width: 24px;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls) {
  display: flex !important;
  align-items: center !important;
  gap: 0 !important;
  width: 100% !important;
  min-width: 0 !important;
  padding-inline: max(3px, env(safe-area-inset-left, 0px)) max(3px, env(safe-area-inset-right, 0px)) !important;
  overflow: visible !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-left) {
  flex: 0 1 var(--mobile-player-left-width) !important;
  width: var(--mobile-player-left-width) !important;
  min-width: var(--mobile-player-left-width) !important;
  max-width: var(--mobile-player-left-width) !important;
  overflow: hidden !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-center) {
  flex: 0 0 auto !important;
  min-width: 0 !important;
  overflow: visible !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-right) {
  display: flex !important;
  flex: 1 1 0 !important;
  align-items: center !important;
  justify-content: flex-end !important;
  gap: 0 !important;
  min-width: 0 !important;
  overflow: visible !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-left .art-control-playAndPause),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-left .art-control-volume) {
  flex: 0 0 25px !important;
  width: 25px !important;
  min-width: 25px !important;
  max-width: 25px !important;
  padding-inline: 0 !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-left .art-control-time),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-time) {
  flex: 1 1 auto !important;
  min-width: 34px !important;
  max-width: calc(var(--mobile-player-left-width) - 50px) !important;
  padding-inline: 0 !important;
  overflow: hidden !important;
  font-size: 10px !important;
  white-space: nowrap !important;
  text-overflow: clip !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-right .art-control) {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  height: 40px !important;
  padding-inline: 0 !important;
  overflow: visible !important;
  color: rgba(255, 255, 255, 0.94) !important;
  visibility: visible !important;
  opacity: 1 !important;
  pointer-events: auto !important;
  white-space: nowrap !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-danmu-toggle) {
  order: 10;
  flex: 0 0 var(--mobile-player-toggle-width) !important;
  width: var(--mobile-player-toggle-width) !important;
  min-width: var(--mobile-player-toggle-width) !important;
  max-width: var(--mobile-player-toggle-width) !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-danmu-settings-trigger) {
  order: 11;
  flex: 0 0 var(--mobile-player-danmu-settings-width) !important;
  width: var(--mobile-player-danmu-settings-width) !important;
  min-width: var(--mobile-player-danmu-settings-width) !important;
  max-width: var(--mobile-player-danmu-settings-width) !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-画质) {
  order: 12;
  flex: 0 0 var(--mobile-player-quality-width) !important;
  width: var(--mobile-player-quality-width) !important;
  min-width: var(--mobile-player-quality-width) !important;
  max-width: var(--mobile-player-quality-width) !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-倍速) {
  order: 13;
  flex: 0 0 var(--mobile-player-rate-width) !important;
  width: var(--mobile-player-rate-width) !important;
  min-width: var(--mobile-player-rate-width) !important;
  max-width: var(--mobile-player-rate-width) !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-字幕) {
  order: 14;
  flex: 0 0 var(--mobile-player-subtitle-width) !important;
  width: var(--mobile-player-subtitle-width) !important;
  min-width: var(--mobile-player-subtitle-width) !important;
  max-width: var(--mobile-player-subtitle-width) !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-setting) {
  order: 15;
  flex: 0 0 var(--mobile-player-icon-width) !important;
  width: var(--mobile-player-icon-width) !important;
  min-width: var(--mobile-player-icon-width) !important;
  max-width: var(--mobile-player-icon-width) !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-fullscreen),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-fullscreenWeb),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-landscape-fullscreen) {
  order: 16;
  flex: 0 0 var(--mobile-player-icon-width) !important;
  width: var(--mobile-player-icon-width) !important;
  min-width: var(--mobile-player-icon-width) !important;
  max-width: var(--mobile-player-icon-width) !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) .mobile-inline-text-controls {
  right: calc(env(safe-area-inset-right, 0px) + 48px);
  bottom: calc(env(safe-area-inset-bottom, 0px) + 8px);
  z-index: 2147483002;
  display: grid !important;
  grid-template-columns: 30px 24px 30px;
  align-items: center;
  justify-content: end;
  width: 84px;
  gap: 0;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) .mobile-inline-text-controls button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  width: 100%;
  height: 40px;
  padding: 0;
  overflow: hidden;
  color: rgba(255, 255, 255, 0.94);
  font-size: 11px;
  font-weight: 500;
  background: transparent;
  border: 0;
  border-radius: 4px;
  white-space: nowrap;
}

/* Final mobile portrait control contract: keep the same core controls as landscape. */
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) {
  --mobile-player-right-width-final: 192px;
  --mobile-player-toggle-width-final: 28px;
  --mobile-player-danmu-settings-width-final: 38px;
  --mobile-player-quality-width-final: 31px;
  --mobile-player-rate-width-final: 24px;
  --mobile-player-subtitle-width-final: 31px;
  --mobile-player-icon-width-final: 20px;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls) {
  display: flex !important;
  align-items: center !important;
  width: 100% !important;
  min-width: 0 !important;
  padding-inline: max(4px, env(safe-area-inset-left, 0px)) max(4px, env(safe-area-inset-right, 0px)) !important;
  overflow: visible !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-left) {
  flex: 1 1 calc(100% - var(--mobile-player-right-width-final)) !important;
  width: auto !important;
  min-width: 0 !important;
  max-width: calc(100% - var(--mobile-player-right-width-final)) !important;
  overflow: hidden !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-left .art-control-playAndPause),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-left .art-control-volume) {
  flex: 0 0 24px !important;
  width: 24px !important;
  min-width: 24px !important;
  max-width: 24px !important;
  padding-inline: 0 !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-left .art-control-time),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-time) {
  flex: 1 1 auto !important;
  width: auto !important;
  min-width: 0 !important;
  max-width: none !important;
  padding-inline: 0 !important;
  overflow: hidden !important;
  font-size: 10px !important;
  line-height: 40px !important;
  white-space: nowrap !important;
  text-overflow: clip !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-center) {
  flex: 0 0 auto !important;
  min-width: 0 !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-right) {
  display: flex !important;
  flex: 0 0 var(--mobile-player-right-width-final) !important;
  width: var(--mobile-player-right-width-final) !important;
  min-width: var(--mobile-player-right-width-final) !important;
  max-width: var(--mobile-player-right-width-final) !important;
  justify-content: flex-end !important;
  gap: 0 !important;
  overflow: visible !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-danmu-toggle),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-danmu-settings-trigger),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-画质),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-倍速),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-字幕),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-setting),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-fullscreen),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-fullscreenWeb),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-landscape-fullscreen) {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  height: 40px !important;
  padding-inline: 0 !important;
  color: rgba(255, 255, 255, 0.94) !important;
  visibility: visible !important;
  opacity: 1 !important;
  pointer-events: auto !important;
  white-space: nowrap !important;
  text-overflow: clip !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-danmu-toggle) {
  order: 10;
  flex: 0 0 var(--mobile-player-toggle-width-final) !important;
  width: var(--mobile-player-toggle-width-final) !important;
  min-width: var(--mobile-player-toggle-width-final) !important;
  max-width: var(--mobile-player-toggle-width-final) !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-danmu-settings-trigger) {
  order: 11;
  flex: 0 0 var(--mobile-player-danmu-settings-width-final) !important;
  width: var(--mobile-player-danmu-settings-width-final) !important;
  min-width: var(--mobile-player-danmu-settings-width-final) !important;
  max-width: var(--mobile-player-danmu-settings-width-final) !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-画质) {
  order: 12;
  flex: 0 0 var(--mobile-player-quality-width-final) !important;
  width: var(--mobile-player-quality-width-final) !important;
  min-width: var(--mobile-player-quality-width-final) !important;
  max-width: var(--mobile-player-quality-width-final) !important;
  font-size: 11px !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-画质 .art-selector-value),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-倍速 .art-selector-value),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-字幕 .art-selector-value) {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 100% !important;
  min-width: 0 !important;
  max-width: 100% !important;
  overflow: hidden !important;
  color: rgba(255, 255, 255, 0.96) !important;
  font-size: 10px !important;
  font-weight: 500 !important;
  line-height: 1 !important;
  text-align: center !important;
  white-space: nowrap !important;
  text-overflow: clip !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-倍速) {
  order: 13;
  flex: 0 0 var(--mobile-player-rate-width-final) !important;
  width: var(--mobile-player-rate-width-final) !important;
  min-width: var(--mobile-player-rate-width-final) !important;
  max-width: var(--mobile-player-rate-width-final) !important;
  font-size: 11px !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-字幕) {
  order: 14;
  flex: 0 0 var(--mobile-player-subtitle-width-final) !important;
  width: var(--mobile-player-subtitle-width-final) !important;
  min-width: var(--mobile-player-subtitle-width-final) !important;
  max-width: var(--mobile-player-subtitle-width-final) !important;
  font-size: 11px !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-setting) {
  order: 15;
  flex: 0 0 var(--mobile-player-icon-width-final) !important;
  width: var(--mobile-player-icon-width-final) !important;
  min-width: var(--mobile-player-icon-width-final) !important;
  max-width: var(--mobile-player-icon-width-final) !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-fullscreen),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-fullscreenWeb),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-landscape-fullscreen) {
  order: 16;
  flex: 0 0 var(--mobile-player-icon-width-final) !important;
  width: var(--mobile-player-icon-width-final) !important;
  min-width: var(--mobile-player-icon-width-final) !important;
  max-width: var(--mobile-player-icon-width-final) !important;
}

@media (max-width: 360px) and (orientation: portrait) {
  .player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) {
    --mobile-player-right-width-final: 184px;
    --mobile-player-toggle-width-final: 26px;
    --mobile-player-danmu-settings-width-final: 36px;
    --mobile-player-quality-width-final: 29px;
    --mobile-player-rate-width-final: 23px;
    --mobile-player-subtitle-width-final: 29px;
    --mobile-player-icon-width-final: 20px;
  }
}

.player.is-mobile-player.is-forced-landscape .mobile-danmu-settings,
.mobile-danmu-settings.is-mobile-portal.is-forced-landscape-portal {
  left: max(60px, calc(env(safe-area-inset-left, 0px) + 60px)) !important;
  right: max(12px, calc(env(safe-area-inset-right, 0px) + 12px)) !important;
  width: auto !important;
  max-width: none !important;
}

/* Mobile portrait must keep the same core controls as landscape. */
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) {
  --mobile-control-left-final: clamp(112px, 38vw, 150px);
  --mobile-control-danmu-final: 28px;
  --mobile-control-danmu-settings-final: 38px;
  --mobile-control-quality-final: 36px;
  --mobile-control-rate-final: 28px;
  --mobile-control-subtitle-final: 36px;
  --mobile-control-icon-final: 26px;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls) {
  display: flex !important;
  align-items: center !important;
  gap: 0 !important;
  width: 100% !important;
  min-width: 0 !important;
  padding-inline: max(4px, env(safe-area-inset-left, 0px)) max(4px, env(safe-area-inset-right, 0px)) !important;
  overflow: hidden !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-left) {
  flex: 0 1 var(--mobile-control-left-final) !important;
  width: var(--mobile-control-left-final) !important;
  min-width: 0 !important;
  max-width: var(--mobile-control-left-final) !important;
  overflow: hidden !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-left .art-control-playAndPause),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-left .art-control-volume) {
  flex: 0 0 25px !important;
  width: 25px !important;
  min-width: 25px !important;
  max-width: 25px !important;
  padding-inline: 0 !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-left .art-control-time),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-time) {
  flex: 1 1 auto !important;
  width: auto !important;
  min-width: 0 !important;
  max-width: calc(var(--mobile-control-left-final) - 50px) !important;
  padding-inline: 0 !important;
  overflow: hidden !important;
  font-size: 10px !important;
  line-height: 40px !important;
  white-space: nowrap !important;
  text-overflow: clip !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-center) {
  flex: 0 0 0 !important;
  width: 0 !important;
  min-width: 0 !important;
  overflow: visible !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-center .artplayer-plugin-danmuku) {
  display: none !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-right) {
  display: flex !important;
  flex: 1 1 auto !important;
  align-items: center !important;
  justify-content: flex-start !important;
  gap: 0 !important;
  min-width: 0 !important;
  max-width: none !important;
  overflow-x: auto !important;
  overflow-y: hidden !important;
  scrollbar-width: none !important;
  -webkit-overflow-scrolling: touch;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-right::-webkit-scrollbar) {
  display: none !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-danmu-toggle),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-danmu-settings-trigger),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-画质),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-倍速),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-字幕),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-setting),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-fullscreen),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-fullscreenWeb),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-landscape-fullscreen) {
  display: inline-flex !important;
  flex: 0 0 auto !important;
  align-items: center !important;
  justify-content: center !important;
  height: 40px !important;
  padding-inline: 0 !important;
  color: rgba(255, 255, 255, 0.96) !important;
  visibility: visible !important;
  opacity: 1 !important;
  pointer-events: auto !important;
  white-space: nowrap !important;
  text-overflow: clip !important;
  box-sizing: border-box !important;
  touch-action: manipulation;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-danmu-toggle) {
  order: 10;
  flex-basis: var(--mobile-control-danmu-final) !important;
  width: var(--mobile-control-danmu-final) !important;
  min-width: var(--mobile-control-danmu-final) !important;
  max-width: var(--mobile-control-danmu-final) !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-danmu-settings-trigger) {
  order: 11;
  flex-basis: var(--mobile-control-danmu-settings-final) !important;
  width: var(--mobile-control-danmu-settings-final) !important;
  min-width: var(--mobile-control-danmu-settings-final) !important;
  max-width: var(--mobile-control-danmu-settings-final) !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-画质) {
  order: 12;
  flex-basis: var(--mobile-control-quality-final) !important;
  width: var(--mobile-control-quality-final) !important;
  min-width: var(--mobile-control-quality-final) !important;
  max-width: var(--mobile-control-quality-final) !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-倍速) {
  order: 13;
  flex-basis: var(--mobile-control-rate-final) !important;
  width: var(--mobile-control-rate-final) !important;
  min-width: var(--mobile-control-rate-final) !important;
  max-width: var(--mobile-control-rate-final) !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-字幕) {
  order: 14;
  flex-basis: var(--mobile-control-subtitle-final) !important;
  width: var(--mobile-control-subtitle-final) !important;
  min-width: var(--mobile-control-subtitle-final) !important;
  max-width: var(--mobile-control-subtitle-final) !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-setting) {
  order: 15;
  flex-basis: var(--mobile-control-icon-final) !important;
  width: var(--mobile-control-icon-final) !important;
  min-width: var(--mobile-control-icon-final) !important;
  max-width: var(--mobile-control-icon-final) !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-fullscreen),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-fullscreenWeb),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-landscape-fullscreen) {
  order: 16;
  flex-basis: var(--mobile-control-icon-final) !important;
  width: var(--mobile-control-icon-final) !important;
  min-width: var(--mobile-control-icon-final) !important;
  max-width: var(--mobile-control-icon-final) !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-画质 .art-selector-value),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-倍速 .art-selector-value),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-字幕 .art-selector-value),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-right .art-control span) {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 100% !important;
  min-width: 0 !important;
  max-width: 100% !important;
  overflow: hidden !important;
  color: inherit !important;
  font-size: 10px !important;
  font-weight: 500 !important;
  line-height: 1 !important;
  text-align: center !important;
  white-space: nowrap !important;
  text-overflow: clip !important;
}

@media (max-width: 360px) and (orientation: portrait) {
  .player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) {
    --mobile-control-left-final: clamp(96px, 31vw, 112px);
    --mobile-control-danmu-final: 26px;
    --mobile-control-danmu-settings-final: 36px;
    --mobile-control-quality-final: 34px;
    --mobile-control-rate-final: 26px;
    --mobile-control-subtitle-final: 34px;
    --mobile-control-icon-final: 24px;
  }
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-right) {
  overflow: visible !important;
}

.player.is-mobile-player :deep(.art-video-player .apd-config-panel),
.player.is-mobile-player :deep(.art-video-player .apd-style-panel) {
  display: none !important;
  pointer-events: none !important;
}

/* Stable mobile control contract: one native control row in portrait and landscape. */
.player.is-mobile-player .mobile-inline-text-controls {
  display: none !important;
  pointer-events: none !important;
}

.player.is-mobile-player :deep(.art-video-player .art-control-mobile-danmu-settings-trigger),
.player.is-mobile-player :deep(.art-video-player .artplayer-plugin-danmuku .apd-config) {
  position: relative !important;
  z-index: 45 !important;
  min-width: 42px !important;
  height: 40px !important;
  overflow: visible !important;
  pointer-events: auto !important;
  touch-action: manipulation !important;
}

.player.is-mobile-player :deep(.art-video-player .art-control-mobile-danmu-settings-trigger)::before,
.player.is-mobile-player :deep(.art-video-player .artplayer-plugin-danmuku .apd-config)::before {
  position: absolute;
  inset: -10px -8px;
  content: "";
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) {
  --mobile-control-left-stable: clamp(108px, 33vw, 132px);
  --mobile-control-danmu-stable: 28px;
  --mobile-control-danmu-settings-stable: 42px;
  --mobile-control-quality-stable: 40px;
  --mobile-control-rate-stable: 28px;
  --mobile-control-subtitle-stable: 36px;
  --mobile-control-icon-stable: 26px;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls) {
  display: flex !important;
  align-items: center !important;
  width: 100% !important;
  min-width: 0 !important;
  padding-inline: max(4px, env(safe-area-inset-left, 0px)) max(4px, env(safe-area-inset-right, 0px)) !important;
  overflow: visible !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-left) {
  display: flex !important;
  flex: 0 1 var(--mobile-control-left-stable) !important;
  width: var(--mobile-control-left-stable) !important;
  min-width: 0 !important;
  max-width: var(--mobile-control-left-stable) !important;
  overflow: hidden !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-left .art-control-playAndPause),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-left .art-control-volume) {
  flex: 0 0 24px !important;
  width: 24px !important;
  min-width: 24px !important;
  max-width: 24px !important;
  padding-inline: 0 !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-left .art-control-time),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-time) {
  flex: 1 1 auto !important;
  width: auto !important;
  min-width: 0 !important;
  max-width: none !important;
  padding-inline: 0 !important;
  overflow: hidden !important;
  font-size: 10px !important;
  line-height: 40px !important;
  white-space: nowrap !important;
  text-overflow: clip !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-center) {
  display: flex !important;
  flex: 0 0 0 !important;
  width: 0 !important;
  min-width: 0 !important;
  overflow: visible !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-center .artplayer-plugin-danmuku) {
  display: none !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-right) {
  display: flex !important;
  flex: 1 1 0 !important;
  align-items: center !important;
  justify-content: flex-end !important;
  gap: 0 !important;
  min-width: 0 !important;
  max-width: none !important;
  overflow: visible !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-danmu-toggle),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-danmu-settings-trigger),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-画质),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-倍速),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-字幕),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-setting),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-fullscreen),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-fullscreenWeb),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-landscape-fullscreen) {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  height: 40px !important;
  padding-inline: 0 !important;
  overflow: visible !important;
  color: rgba(255, 255, 255, 0.96) !important;
  font-size: 11px !important;
  line-height: 1 !important;
  white-space: nowrap !important;
  visibility: visible !important;
  opacity: 1 !important;
  pointer-events: auto !important;
  box-sizing: border-box !important;
  touch-action: manipulation !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-danmu-toggle) {
  order: 10 !important;
  flex: 0 0 var(--mobile-control-danmu-stable) !important;
  width: var(--mobile-control-danmu-stable) !important;
  min-width: var(--mobile-control-danmu-stable) !important;
  max-width: var(--mobile-control-danmu-stable) !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-danmu-settings-trigger) {
  order: 11 !important;
  flex: 0 0 var(--mobile-control-danmu-settings-stable) !important;
  width: var(--mobile-control-danmu-settings-stable) !important;
  min-width: var(--mobile-control-danmu-settings-stable) !important;
  max-width: var(--mobile-control-danmu-settings-stable) !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-画质) {
  order: 12 !important;
  flex: 0 0 var(--mobile-control-quality-stable) !important;
  width: var(--mobile-control-quality-stable) !important;
  min-width: var(--mobile-control-quality-stable) !important;
  max-width: var(--mobile-control-quality-stable) !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-倍速) {
  order: 13 !important;
  flex: 0 0 var(--mobile-control-rate-stable) !important;
  width: var(--mobile-control-rate-stable) !important;
  min-width: var(--mobile-control-rate-stable) !important;
  max-width: var(--mobile-control-rate-stable) !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-字幕) {
  order: 14 !important;
  flex: 0 0 var(--mobile-control-subtitle-stable) !important;
  width: var(--mobile-control-subtitle-stable) !important;
  min-width: var(--mobile-control-subtitle-stable) !important;
  max-width: var(--mobile-control-subtitle-stable) !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-setting) {
  order: 15 !important;
  flex: 0 0 var(--mobile-control-icon-stable) !important;
  width: var(--mobile-control-icon-stable) !important;
  min-width: var(--mobile-control-icon-stable) !important;
  max-width: var(--mobile-control-icon-stable) !important;
  margin-left: 0 !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-fullscreen),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-fullscreenWeb),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-landscape-fullscreen) {
  order: 16 !important;
  flex: 0 0 var(--mobile-control-icon-stable) !important;
  width: var(--mobile-control-icon-stable) !important;
  min-width: var(--mobile-control-icon-stable) !important;
  max-width: var(--mobile-control-icon-stable) !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-画质 .art-selector-value),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-倍速 .art-selector-value),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-字幕 .art-selector-value),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-right .art-control span) {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 100% !important;
  min-width: 0 !important;
  max-width: 100% !important;
  overflow: hidden !important;
  color: inherit !important;
  font-size: 10px !important;
  font-weight: 500 !important;
  line-height: 1 !important;
  text-align: center !important;
  white-space: nowrap !important;
  text-overflow: clip !important;
}

@media (max-width: 360px) and (orientation: portrait) {
  .player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) {
    --mobile-control-left-stable: clamp(92px, 30vw, 108px);
    --mobile-control-danmu-stable: 26px;
    --mobile-control-danmu-settings-stable: 38px;
    --mobile-control-quality-stable: 36px;
    --mobile-control-rate-stable: 26px;
    --mobile-control-subtitle-stable: 34px;
    --mobile-control-icon-stable: 24px;
  }
}

/* True-device final pass: do not let older mobile fallbacks hide the landscape-equivalent controls. */
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-danmu-toggle),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-danmu-settings-trigger),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-画质),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-倍速),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-字幕),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-setting),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-fullscreen),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-fullscreenWeb),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-control-mobile-landscape-fullscreen) {
  display: inline-flex !important;
  visibility: visible !important;
  opacity: 1 !important;
  pointer-events: auto !important;
  margin-left: 0 !important;
  transform: none !important;
}

.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-right .art-control-画质),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-right .art-control-倍速),
.player.is-mobile-player.is-mobile-portrait:not(.is-forced-landscape) :deep(.art-video-player .art-controls-right .art-control-字幕) {
  overflow: visible !important;
}
</style>
