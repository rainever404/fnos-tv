<script setup>
import {computed, getCurrentInstance, onMounted, ref} from 'vue'
import {useRouter} from 'vue-router'
import VueCookies from 'vue-cookies'
import {useMediaDbData} from '../../store.js'

const router = useRouter()
const MediaDbData = useMediaDbData()
const instance = getCurrentInstance()
const COMMON = instance.appContext.config.globalProperties.$COMMON

const loading = ref(true)
const scanning = ref(false)
const versionInfo = ref({})
const mediaDbList = ref([])
const mediaDbSum = ref({})
const currentThemeMode = ref(VueCookies.get('theme_mode') || (VueCookies.get('dark') === 'false' ? 'light' : 'dark'))

const accountNavItems = [
  {key: 'password', label: '修改密码', icon: 'bx bx-lock-alt'},
  {key: 'play', label: '播放偏好', icon: 'bx bx-play-circle'},
  {key: 'appearance', label: '外观', icon: 'bx bx-palette'}
]

const serverNavItems = [
  {key: 'library', label: '媒体库', icon: 'bx bxs-folder', active: true},
  {key: 'users', label: '用户', icon: 'bx bx-user'},
  {key: 'server', label: '设置', icon: 'bx bx-cog'},
  {key: 'tasks', label: '任务计划', icon: 'bx bx-task'}
]

const themeItems = [
  {key: 'system', label: '跟随系统'},
  {key: 'light', label: '浅色'},
  {key: 'dark', label: '深色'}
]

const visibleLibraries = computed(() => {
  const list = Array.isArray(mediaDbList.value) ? mediaDbList.value : []
  return list.filter(item => item?.category !== 'Others')
})

function goHome() {
  router.push('/')
}

function normalizeData(res, fallback) {
  return res === undefined || res === null ? fallback : res
}

async function loadSettingsData() {
  loading.value = true
  try {
    const [versionRes, listRes, sumRes] = await Promise.allSettled([
      COMMON.requests('GET', '/api/v1/sys/version', true),
      COMMON.requests('GET', '/api/v1/mediadb/list', true),
      COMMON.requests('GET', '/api/v1/mediadb/sum', true)
    ])
    versionInfo.value = normalizeData(versionRes.value, {})
    mediaDbList.value = normalizeData(listRes.value, MediaDbData.list || [])
    mediaDbSum.value = normalizeData(sumRes.value, MediaDbData.sum || {})
    MediaDbData.list = mediaDbList.value
    MediaDbData.sum = mediaDbSum.value
  } catch {
    mediaDbList.value = MediaDbData.list || []
    mediaDbSum.value = MediaDbData.sum || {}
  } finally {
    loading.value = false
  }
}

function setThemeMode(mode) {
  if (!['system', 'light', 'dark'].includes(mode)) {
    return
  }
  currentThemeMode.value = mode
  VueCookies.set('theme_mode', mode, 60 * 60 * 24 * 365)
  window.dispatchEvent(new CustomEvent('fnos-tv:set-theme-mode', {
    detail: {
      mode
    }
  }))
}

function libraryCount(item) {
  const value = Number(mediaDbSum.value?.[item?.guid] ?? MediaDbData.sum?.[item?.guid] ?? 0)
  return Number.isFinite(value) ? value : 0
}

function libraryTypeLabel(item) {
  switch (item?.category) {
    case 'Movie':
      return '电影'
    case 'TV':
      return '电视节目'
    case 'LiveChannel':
      return '电视直播'
    case 'Music':
    case 'Mix':
    case 'Directory':
    case 'Video':
      return '混合影片'
    default:
      return '混合影片'
  }
}

function firstTextValue(item, keys) {
  for (const key of keys) {
    const value = item?.[key]
    if (Array.isArray(value)) {
      const first = value.find(Boolean)
      if (first) {
        return typeof first === 'object' ? first.path || first.title || first.name || '' : String(first)
      }
    } else if (value && typeof value === 'object') {
      const text = value.path || value.title || value.name || value.value
      if (text) {
        return String(text)
      }
    } else if (value !== undefined && value !== null && String(value).trim()) {
      return String(value)
    }
  }
  return ''
}

function libraryFolder(item) {
  const direct = firstTextValue(item, [
    'media_folder',
    'media_folders',
    'folders',
    'folder',
    'paths',
    'path',
    'source_path',
    'source',
    'root_path',
    'scan_path',
    'dir'
  ])
  if (direct) {
    return direct
  }
  return `远程挂载/影音/${item?.title || '媒体库'}/`
}

function formatDateValue(value) {
  if (!value) {
    return ''
  }
  const text = String(value)
  const match = text.match(/\d{4}[-/]\d{1,2}[-/]\d{1,2}/)
  if (match) {
    return match[0].replace(/\//g, '-')
  }
  const date = new Date(Number(value) > 1000000000000 ? Number(value) : Number(value) * 1000)
  if (Number.isNaN(date.getTime())) {
    return text
  }
  return date.toISOString().slice(0, 10)
}

function libraryUpdatedAt(item) {
  return formatDateValue(firstTextValue(item, [
    'file_update_time',
    'files_update_time',
    'file_recent_update',
    'latest_file_update',
    'latest_update_time',
    'update_time',
    'updated_at',
    'mtime',
    'modified_time'
  ])) || '-'
}

function previewItems(item) {
  const officialPosters = Array.isArray(item?.posters)
      ? item.posters.filter(Boolean).slice(0, 3)
      : []
  if (officialPosters.length) {
    return officialPosters.map((poster, index) => ({
      guid: `${item?.guid || item?.title || 'library'}-${index}`,
      poster
    }))
  }
  const list = MediaDbData.info?.[item?.guid]?.list
  if (Array.isArray(list)) {
    return list.filter(target => target?.poster || target?.posters).slice(0, 3)
  }
  return []
}

function previewUrl(item) {
  return COMMON.mediaImageUrl(item?.poster || item?.posters || '', 240, '/images/not_gellery.png')
}

async function scanAllLibraries() {
  if (scanning.value) {
    return
  }
  scanning.value = true
  try {
    await COMMON.requests('POST', '/api/v1/mdb/scanall', true)
    COMMON.ShowMsg('已开始扫描媒体库文件')
  } catch {
    COMMON.ShowMsg('扫描媒体库文件失败')
  } finally {
    scanning.value = false
  }
}

function showUnavailable(label) {
  COMMON.ShowMsg(`${label}功能请在官方飞牛影视中操作`)
}

onMounted(() => {
  loadSettingsData()
})
</script>

<template>
  <main class="settings-page">
    <aside class="settings-sidebar">
      <div class="settings-brand">
        <button class="settings-back" type="button" aria-label="返回首页" @click="goHome">
          <i class='bx bx-arrow-back'></i>
        </button>
        <img class="settings-logo" src="/images/fnos-logo.png" alt="">
        <span>飞牛影视</span>
      </div>

      <div class="settings-nav-group">
        <div class="settings-nav-title">帐号</div>
        <button
            v-for="item in accountNavItems"
            :key="item.key"
            class="settings-nav-item"
            type="button"
            @click="showUnavailable(item.label)"
        >
          <i :class="item.icon"></i>
          <span>{{ item.label }}</span>
        </button>
      </div>

      <div class="settings-nav-group">
        <div class="settings-nav-title">影视服务器</div>
        <button
            v-for="item in serverNavItems"
            :key="item.key"
            class="settings-nav-item"
            :class="{ active: item.active }"
            type="button"
            @click="item.active ? null : showUnavailable(item.label)"
        >
          <i :class="item.icon"></i>
          <span>{{ item.label }}</span>
        </button>
      </div>

      <div class="settings-theme-block" aria-label="外观模式">
        <div class="settings-theme-title">外观模式</div>
        <div class="settings-theme-options">
          <button
              v-for="item in themeItems"
              :key="item.key"
              class="settings-theme-option"
              :class="{ active: currentThemeMode === item.key }"
              type="button"
              @click="setThemeMode(item.key)"
          >
            {{ item.label }}
          </button>
        </div>
      </div>

      <div class="settings-version">
        <div>版本号 {{ versionInfo.version || '0.9.7' }}</div>
        <div>（服务版本 {{ versionInfo.mediasrvVersion || versionInfo.media_srv_version || '0.8.35' }} ）</div>
      </div>
    </aside>

    <section class="settings-content">
      <header class="settings-content-header">
        <h1>影视服务器 - 媒体库</h1>
      </header>

      <div class="settings-toolbar">
        <button class="settings-primary-button" type="button" @click="showUnavailable('新增媒体库')">
          <i class='bx bx-plus'></i>
          <span>新增媒体库</span>
        </button>
        <button class="settings-secondary-button" type="button" @click="showUnavailable('排序')">
          <i class='bx bx-list-ul'></i>
          <span>排序</span>
        </button>
        <button class="settings-secondary-button" type="button" :disabled="scanning" @click="scanAllLibraries">
          <i class='bx bx-refresh' :class="{ spinning: scanning }"></i>
          <span>{{ scanning ? '正在扫描' : '扫描媒体库文件' }}</span>
        </button>
      </div>

      <div class="settings-table-wrap">
        <table class="settings-library-table">
          <thead>
          <tr>
            <th>媒体库</th>
            <th>媒体文件夹</th>
            <th>类型</th>
            <th>文件最近更新</th>
            <th>操作</th>
          </tr>
          </thead>
          <tbody>
          <tr v-if="loading">
            <td colspan="5" class="settings-empty-row">正在加载媒体库</td>
          </tr>
          <tr v-else-if="visibleLibraries.length === 0">
            <td colspan="5" class="settings-empty-row">暂无媒体库</td>
          </tr>
          <template v-else>
            <tr v-for="item in visibleLibraries" :key="item.guid || item.title">
              <td>
                <div class="settings-library-cell">
                  <div class="settings-library-preview">
                    <template v-if="previewItems(item).length">
                      <img
                          v-for="preview in previewItems(item)"
                          :key="preview.guid || preview.poster || preview.posters"
                          :src="previewUrl(preview)"
                          alt=""
                          loading="lazy"
                      >
                    </template>
                    <img v-else :src="previewUrl(item)" alt="" loading="lazy">
                    <div class="settings-library-overlay">{{ item.title || '媒体库' }}</div>
                  </div>
                  <div class="settings-library-meta">
                    <strong>{{ item.title || '媒体库' }}</strong>
                    <span>{{ libraryCount(item) }} 个项目</span>
                  </div>
                </div>
              </td>
              <td>
                <div class="settings-folder-text" :title="libraryFolder(item)">{{ libraryFolder(item) }}</div>
              </td>
              <td>{{ libraryTypeLabel(item) }}</td>
              <td>{{ libraryUpdatedAt(item) }}</td>
              <td>
                <div class="settings-actions">
                  <button type="button" aria-label="删除媒体库" title="删除媒体库" @click="showUnavailable('删除媒体库')">
                    <i class='bx bx-trash'></i>
                  </button>
                  <button type="button" aria-label="编辑媒体库" title="编辑媒体库" @click="showUnavailable('编辑媒体库')">
                    <i class='bx bx-edit-alt'></i>
                  </button>
                  <button type="button" aria-label="扫描媒体库" title="扫描媒体库" @click="scanAllLibraries">
                    <i class='bx bx-refresh'></i>
                  </button>
                  <button type="button" aria-label="更多" title="更多" @click="showUnavailable('更多')">
                    <i class='bx bx-dots-horizontal-rounded'></i>
                  </button>
                </div>
              </td>
            </tr>
          </template>
          </tbody>
        </table>
      </div>
    </section>
  </main>
</template>

<style scoped>
.settings-page {
  --settings-bg: #151516;
  --settings-sidebar: #0f1011;
  --settings-surface: #19191a;
  --settings-surface-hover: #202123;
  --settings-border: rgba(255, 255, 255, 0.09);
  --settings-text: rgba(255, 255, 255, 0.94);
  --settings-subtext: rgba(255, 255, 255, 0.62);
  --settings-muted: rgba(255, 255, 255, 0.42);
  --settings-primary: #0a84ff;
  min-height: 100vh;
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  background: var(--settings-bg);
  color: var(--settings-text);
  font-family: -apple-system, BlinkMacSystemFont, Helvetica Neue, PingFang SC, Microsoft YaHei, Source Han Sans SC, Noto Sans CJK SC, sans-serif;
}

:global(html[data-theme="light"]) .settings-page {
  --settings-bg: #f5f6f8;
  --settings-sidebar: #ffffff;
  --settings-surface: #ffffff;
  --settings-surface-hover: #eef2f8;
  --settings-border: rgba(21, 24, 31, 0.1);
  --settings-text: rgba(18, 22, 30, 0.92);
  --settings-subtext: rgba(18, 22, 30, 0.62);
  --settings-muted: rgba(18, 22, 30, 0.4);
}

.settings-sidebar {
  min-height: 100vh;
  background: var(--settings-sidebar);
  border-right: 1px solid var(--settings-border);
  display: flex;
  flex-direction: column;
  padding: 32px 20px 24px;
}

.settings-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 34px;
  margin-bottom: 36px;
  font-size: 16px;
  font-weight: 650;
}

.settings-back,
.settings-nav-item,
.settings-theme-option,
.settings-primary-button,
.settings-secondary-button,
.settings-actions button {
  appearance: none;
  border: 0;
  font-family: inherit;
  cursor: pointer;
}

.settings-back {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: var(--settings-text);
  font-size: 25px;
  border-radius: 6px;
}

.settings-back:hover,
.settings-actions button:hover {
  background: var(--settings-surface-hover);
}

.settings-logo {
  width: 28px;
  height: 28px;
  object-fit: contain;
}

.settings-nav-group {
  display: grid;
  gap: 4px;
  margin-bottom: 28px;
}

.settings-nav-title {
  height: 26px;
  display: flex;
  align-items: center;
  font-size: 14px;
  color: var(--settings-subtext);
}

.settings-nav-item {
  height: 40px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  border-radius: 8px;
  background: transparent;
  color: var(--settings-text);
  font-size: 15px;
  text-align: left;
}

.settings-nav-item i {
  width: 18px;
  font-size: 19px;
}

.settings-nav-item:hover {
  background: var(--settings-surface-hover);
}

.settings-nav-item.active {
  background: color-mix(in srgb, var(--settings-primary) 13%, transparent);
  color: var(--settings-primary);
}

.settings-theme-block {
  margin-top: auto;
  padding-top: 18px;
}

.settings-theme-title {
  margin-bottom: 10px;
  color: var(--settings-subtext);
  font-size: 13px;
}

.settings-theme-options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.settings-theme-option {
  height: 32px;
  border-radius: 7px;
  background: var(--settings-surface);
  color: var(--settings-subtext);
  font-size: 13px;
}

.settings-theme-option.active {
  background: var(--settings-primary);
  color: white;
}

.settings-version {
  margin-top: 18px;
  color: var(--settings-subtext);
  font-size: 13px;
  line-height: 1.7;
}

.settings-content {
  min-width: 0;
  padding: 0 42px 44px;
  overflow: auto;
}

.settings-content-header {
  height: 82px;
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--settings-border);
}

.settings-content-header h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 650;
  letter-spacing: 0;
}

.settings-toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 22px 0 36px;
}

.settings-primary-button,
.settings-secondary-button {
  height: 36px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 18px;
  border-radius: 8px;
  color: white;
  font-weight: 650;
}

.settings-primary-button {
  background: var(--settings-primary);
}

.settings-secondary-button {
  background: var(--settings-surface-hover);
  color: var(--settings-text);
}

.settings-secondary-button:disabled {
  opacity: 0.58;
  cursor: default;
}

.settings-primary-button i,
.settings-secondary-button i {
  font-size: 18px;
}

.spinning {
  animation: settings-spin 0.8s linear infinite;
}

@keyframes settings-spin {
  to {
    transform: rotate(360deg);
  }
}

.settings-table-wrap {
  overflow-x: auto;
  border-top: 1px solid var(--settings-border);
}

.settings-library-table {
  width: 100%;
  min-width: 920px;
  border-collapse: collapse;
  table-layout: fixed;
}

.settings-library-table th {
  height: 49px;
  padding: 0 16px;
  text-align: left;
  color: var(--settings-text);
  font-size: 14px;
  font-weight: 650;
  border-bottom: 1px solid var(--settings-border);
}

.settings-library-table th:nth-child(1) {
  width: 26%;
  text-align: center;
}

.settings-library-table th:nth-child(2) {
  width: 32%;
}

.settings-library-table th:nth-child(3) {
  width: 12%;
}

.settings-library-table th:nth-child(4) {
  width: 16%;
}

.settings-library-table th:nth-child(5) {
  width: 14%;
  text-align: center;
}

.settings-library-table td {
  height: 194px;
  padding: 16px;
  color: var(--settings-text);
  font-size: 14px;
  border-bottom: 1px solid var(--settings-border);
  vertical-align: middle;
}

.settings-library-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
}

.settings-library-preview {
  position: relative;
  width: 202px;
  height: 146px;
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  gap: 0;
  overflow: hidden;
  border: 1px solid var(--settings-border);
  border-radius: 9px;
  background: var(--settings-surface);
}

.settings-library-preview::after {
  content: '';
  position: absolute;
  inset: auto 0 0;
  height: 46%;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.68), transparent);
  pointer-events: none;
}

.settings-library-preview img {
  width: 100%;
  height: 100%;
  min-width: 0;
  object-fit: cover;
}

.settings-library-overlay {
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 11px;
  z-index: 1;
  color: white;
  font-size: 14px;
  font-weight: 700;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-library-meta {
  display: none;
}

.settings-folder-text {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
}

.settings-actions button {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  background: transparent;
  color: var(--settings-subtext);
  font-size: 22px;
}

.settings-empty-row {
  text-align: center;
  color: var(--settings-muted);
}

@media (max-width: 900px) {
  .settings-page {
    grid-template-columns: 1fr;
  }

  .settings-sidebar {
    min-height: auto;
    padding: 18px 16px;
    border-right: 0;
    border-bottom: 1px solid var(--settings-border);
  }

  .settings-brand {
    margin-bottom: 18px;
  }

  .settings-nav-group {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    margin-bottom: 14px;
  }

  .settings-nav-title {
    grid-column: 1 / -1;
  }

  .settings-theme-block {
    margin-top: 4px;
  }

  .settings-version {
    margin-top: 14px;
  }

  .settings-content {
    padding: 0 16px 28px;
  }

  .settings-content-header {
    height: 64px;
  }

  .settings-toolbar {
    gap: 10px;
    padding: 16px 0 22px;
    overflow-x: auto;
  }

  .settings-primary-button,
  .settings-secondary-button {
    flex: 0 0 auto;
  }
}
</style>
