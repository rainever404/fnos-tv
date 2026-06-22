<script setup>
import {computed, getCurrentInstance, onMounted, ref, watch} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import VueCookies from 'vue-cookies'
import {useMediaDbData} from '../../store.js'
import {loadCardStyle, saveCardStyle} from '../../utils/appearance.js'

const router = useRouter()
const route = useRoute()
const MediaDbData = useMediaDbData()
const instance = getCurrentInstance()
const COMMON = instance.appContext.config.globalProperties.$COMMON

const loading = ref(true)
const sectionLoading = ref(false)
const scanning = ref(false)
const savingPassword = ref(false)
const savingPreference = ref(false)
const savingServer = ref(false)
const savingTaskSwitch = ref(false)
const scanningLibraryGuid = ref('')
const versionInfo = ref({})
const mediaDbList = ref([])
const mediaDbSum = ref({})
const userInfo = ref({})
const usersList = ref([])
const serverInfo = ref({})
const gpuList = ref([])
const taskList = ref([])
const taskSetting = ref({})
const languageOptions = ref([
  {code: '', label: '跟随服务器默认'},
  {code: 'zh-CN', label: '简体中文'},
  {code: 'en-US', label: 'English'},
  {code: 'ja-JP', label: '日本語'}
])
const currentThemeMode = ref(VueCookies.get('theme_mode') || (VueCookies.get('dark') === 'false' ? 'light' : 'dark'))
const cardStyle = ref(loadCardStyle())
const passwordForm = ref({
  password: '',
  confirmPassword: ''
})
const preferenceForm = ref({
  lan: '',
  audio_lan: ''
})
const serverForm = ref({
  server_name: '',
  lan: '',
  gpu_acc: false,
  gpu_prefer: '',
  cpu_allow_decoding: false,
  direct_link_enable: false,
  direct_link_allowed_level: '',
  file_monitor: false
})
const libraryDialogOpen = ref(false)
const libraryDialogMode = ref('create')
const libraryDialogSaving = ref(false)
const libraryForm = ref({
  guid: '',
  title: '',
  category: 'Movie',
  dirText: '',
  file_monitor: true
})
const deleteLibraryTarget = ref(null)
const librarySortOpen = ref(false)
const librarySortSaving = ref(false)
const sortedLibraries = ref([])
const userDialogOpen = ref(false)
const userDialogMode = ref('create')
const userDialogSaving = ref(false)
const userForm = ref({
  guid: '',
  username: '',
  password: '',
  is_admin: false,
  media_permission: 1,
  mediadb_list: []
})
const deleteUserTarget = ref(null)

const libraryCategoryOptions = [
  {value: 'Movie', label: '电影'},
  {value: 'TV', label: '电视节目'},
  {value: 'LiveChannel', label: '电视直播'},
  {value: 'Video', label: '混合影片'}
]

const permissionOptions = [
  {value: 0, label: '无权限'},
  {value: 1, label: '所有媒体库'},
  {value: 2, label: '指定媒体库'}
]

const accountNavItems = [
  {key: 'account', label: '修改密码', icon: 'bx bx-lock-alt', path: '/settings/account'},
  {key: 'preference', label: '播放偏好', icon: 'bx bx-play-circle', path: '/settings/preference'},
  {key: 'appearance', label: '外观', icon: 'bx bx-palette', path: '/settings/appearance'}
]

const serverNavItems = [
  {key: 'library', label: '媒体库', icon: 'bx bxs-folder', path: '/settings/library'},
  {key: 'users', label: '用户', icon: 'bx bx-user', path: '/settings/users'},
  {key: 'server', label: '设置', icon: 'bx bx-cog', path: '/settings/server'},
  {key: 'task', label: '任务计划', icon: 'bx bx-task', path: '/settings/task'}
]

const titleMap = {
  account: '帐号 - 修改密码',
  preference: '帐号 - 播放偏好',
  appearance: '帐号 - 外观',
  library: '影视服务器 - 媒体库',
  users: '影视服务器 - 用户',
  server: '影视服务器 - 设置',
  task: '影视服务器 - 任务计划'
}

const themeItems = [
  {key: 'system', label: '跟随系统'},
  {key: 'light', label: '浅色'},
  {key: 'dark', label: '深色'}
]

const cardStyleItems = [
  {key: 'rating', label: '评分', sample: '9.2'},
  {key: 'watched', label: '已观看', sample: '✓'},
  {key: 'resolution', label: '分辨率', sample: '1080'}
]

const activeSettingsKey = computed(() => {
  const key = route.path.split('/').filter(Boolean).pop()
  if (key === 'tasks') {
    return 'task'
  }
  return titleMap[key] ? key : 'library'
})
const contentTitle = computed(() => titleMap[activeSettingsKey.value] || titleMap.library)
const visibleLibraries = computed(() => {
  const list = Array.isArray(mediaDbList.value) ? mediaDbList.value : []
  return list.filter(item => item?.category !== 'Others')
})
const taskEnabled = computed(() => {
  const value = taskSetting.value?.task_switch ?? taskSetting.value?.taskSwitch ?? taskSetting.value?.enabled
  if (value === undefined || value === null || value === '') {
    return false
  }
  return value === true || value === 1 || value === '1' || value === 'Enabled' || value === 'enabled'
})
const displayServerName = computed(() => {
  return serverInfo.value?.server_name || serverInfo.value?.serverName || serverInfo.value?.name || serverForm.value.server_name || '飞牛影视'
})

function goHome() {
  router.push('/')
}

function normalizeData(res, fallback) {
  return res === undefined || res === null ? fallback : res
}

function normalizeList(res) {
  if (Array.isArray(res)) {
    return res
  }
  if (Array.isArray(res?.list)) {
    return res.list
  }
  if (Array.isArray(res?.items)) {
    return res.items
  }
  if (Array.isArray(res?.rows)) {
    return res.rows
  }
  if (Array.isArray(res?.data)) {
    return res.data
  }
  return []
}

async function safeRequest(method, api, data, fallback) {
  try {
    return normalizeData(await COMMON.requests(method, api, true, data), fallback)
  } catch {
    return fallback
  }
}

async function loadSettingsData() {
  loading.value = true
  try {
    const [versionRes, mdbListRes, legacyListRes, sumRes] = await Promise.allSettled([
      COMMON.requests('GET', '/api/v1/sys/version', true),
      COMMON.requests('GET', '/api/v1/mdb/list', true),
      COMMON.requests('GET', '/api/v1/mediadb/list', true),
      COMMON.requests('GET', '/api/v1/mediadb/sum', true)
    ])
    const officialList = normalizeLibraryList(normalizeData(mdbListRes.status === 'fulfilled' ? mdbListRes.value : [], []))
    const fallbackList = normalizeLibraryList(normalizeData(legacyListRes.status === 'fulfilled' ? legacyListRes.value : MediaDbData.list, []))
    versionInfo.value = normalizeData(versionRes.status === 'fulfilled' ? versionRes.value : {}, {})
    mediaDbList.value = officialList.length ? officialList : fallbackList
    mediaDbSum.value = normalizeData(sumRes.status === 'fulfilled' ? sumRes.value : MediaDbData.sum, {})
    MediaDbData.list = mediaDbList.value
    MediaDbData.sum = mediaDbSum.value
  } catch {
    mediaDbList.value = MediaDbData.list || []
    mediaDbSum.value = MediaDbData.sum || {}
  } finally {
    loading.value = false
  }
}

async function loadActiveSection() {
  const key = activeSettingsKey.value
  if (key === 'library' || key === 'appearance') {
    return
  }
  sectionLoading.value = true
  try {
    if (key === 'account' || key === 'preference') {
      await loadPreferenceData()
    } else if (key === 'users') {
      await loadUsersData()
    } else if (key === 'server') {
      await loadServerData()
    } else if (key === 'task') {
      await loadTaskData()
    }
  } finally {
    sectionLoading.value = false
  }
}

async function loadPreferenceData() {
  const [userRes, serverRes, iso6391Res, iso6392Res] = await Promise.allSettled([
    COMMON.requests('GET', '/api/v1/user/info', true),
    COMMON.requests('GET', '/api/v1/server/info', true),
    COMMON.requests('GET', '/api/v1/tag/iso6391?lan=zh-CN', true),
    COMMON.requests('GET', '/api/v1/tag/iso6392?lan=zh-CN', true)
  ])
  userInfo.value = normalizeData(userRes.status === 'fulfilled' ? userRes.value : userInfo.value, {})
  serverInfo.value = normalizeData(serverRes.status === 'fulfilled' ? serverRes.value : serverInfo.value, {})
  preferenceForm.value = {
    lan: userInfo.value?.lan || '',
    audio_lan: userInfo.value?.audio_lan || ''
  }
  languageOptions.value = mergeLanguageOptions([
    ...languageOptions.value,
    ...normalizeLanguageOptions(iso6391Res.status === 'fulfilled' ? iso6391Res.value : []),
    ...normalizeLanguageOptions(iso6392Res.status === 'fulfilled' ? iso6392Res.value : [])
  ])
}

async function loadUsersData() {
  const [usersRes] = await Promise.allSettled([
    COMMON.requests('GET', '/api/v1/manager/user/list', true)
  ])
  usersList.value = normalizeList(usersRes.status === 'fulfilled' ? usersRes.value : [])
}

async function loadServerData() {
  const [serverRes, gpuRes] = await Promise.allSettled([
    COMMON.requests('GET', '/api/v1/server/info', true),
    COMMON.requests('GET', '/api/v1/server/gpu/list', true)
  ])
  serverInfo.value = normalizeData(serverRes.status === 'fulfilled' ? serverRes.value : serverInfo.value, {})
  gpuList.value = normalizeList(gpuRes.status === 'fulfilled' ? gpuRes.value : [])
  serverForm.value = {
    server_name: serverInfo.value?.server_name || serverInfo.value?.serverName || serverInfo.value?.name || '',
    lan: serverInfo.value?.lan || '',
    gpu_acc: Boolean(serverInfo.value?.gpu_acc),
    gpu_prefer: serverInfo.value?.gpu_prefer || '',
    cpu_allow_decoding: Boolean(serverInfo.value?.cpu_allow_decoding),
    direct_link_enable: Boolean(serverInfo.value?.direct_link_enable),
    direct_link_allowed_level: serverInfo.value?.direct_link_allowed_level ?? '',
    file_monitor: serverInfo.value?.file_monitor !== false
  }
}

async function loadTaskData() {
  const [listRes, settingRes] = await Promise.allSettled([
    COMMON.requests('GET', '/api/v1/task/schedule/list', true),
    COMMON.requests('POST', '/api/v1/task/schedule/getSetting', true, {})
  ])
  taskList.value = normalizeList(listRes.status === 'fulfilled' ? listRes.value : [])
  taskSetting.value = normalizeData(settingRes.status === 'fulfilled' ? settingRes.value : taskSetting.value, {})
}

function normalizeLibraryList(list) {
  if (!Array.isArray(list)) {
    return []
  }
  return list.map(item => ({
    ...item,
    title: item?.title || item?.name || '媒体库'
  }))
}

function normalizeLanguageOptions(list) {
  if (!Array.isArray(list)) {
    return []
  }
  return list.map(item => {
    const code = item?.code || item?.id || item?.value || item?.key || item?.iso639_1 || item?.iso639_2
    const label = item?.title || item?.label || item?.name || item?.zh || item?.cn || item?.value || code
    return code ? {code: String(code), label: String(label)} : null
  }).filter(Boolean)
}

function mergeLanguageOptions(list) {
  const seen = new Set()
  const result = []
  for (const item of list) {
    const code = String(item?.code ?? '')
    if (seen.has(code)) {
      continue
    }
    seen.add(code)
    result.push({
      code,
      label: item?.label || code || '跟随服务器默认'
    })
  }
  return result
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

function isNavActive(item) {
  return item.key === activeSettingsKey.value
}

function handleSettingsNav(item) {
  if (item?.path && route.path !== item.path) {
    router.push(item.path)
  }
}

function toggleCardStyle(key) {
  cardStyle.value = saveCardStyle({
    ...cardStyle.value,
    [key]: !cardStyle.value?.[key]
  })
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
    'dir_list',
    'dirList',
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
    return normalizeLibraryPath(direct)
  }
  return `远程挂载/影音/${item?.title || '媒体库'}/`
}

function normalizeLibraryPath(value) {
  const text = String(value || '').trim()
  if (!text) {
    return ''
  }
  const mounted = text.replace(/^\/vol\d+\/[^/]+/i, '')
  if (mounted && mounted !== text) {
    return `远程挂载${mounted}`
  }
  return text
}

function libraryPaths(item) {
  const raw = item?.dir_list || item?.dirList || item?.folders || item?.paths || item?.path || item?.dir
  const values = []
  if (Array.isArray(raw)) {
    raw.forEach(value => {
      const text = typeof value === 'object' ? value?.path || value?.title || value?.name || '' : value
      if (text) {
        values.push(String(text))
      }
    })
  } else if (raw && typeof raw === 'object') {
    const text = raw.path || raw.title || raw.name || raw.value
    if (text) {
      values.push(String(text))
    }
  } else if (raw !== undefined && raw !== null && String(raw).trim()) {
    values.push(String(raw))
  }
  return Array.from(new Set(values.map(value => value.trim()).filter(Boolean)))
}

function splitDirText(text) {
  return Array.from(new Set(String(text || '')
      .split(/\r?\n/)
      .map(value => value.trim())
      .filter(Boolean)))
}

function normalizePermission(value, fallback = 1) {
  if (value === 'None' || value === 'none') {
    return 0
  }
  if (value === 'All' || value === 'all') {
    return 1
  }
  if (value === 'Part' || value === 'part') {
    return 2
  }
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : fallback
}

function normalizeMediadbGuids(list) {
  if (!Array.isArray(list)) {
    return []
  }
  return Array.from(new Set(list.map(item => {
    if (typeof item === 'object') {
      return item?.guid || item?.mdb_guid || item?.value || ''
    }
    return item
  }).map(value => String(value || '').trim()).filter(Boolean)))
}

function openCreateLibraryDialog() {
  libraryDialogMode.value = 'create'
  libraryForm.value = {
    guid: '',
    title: '',
    category: 'Movie',
    dirText: '',
    file_monitor: serverForm.value.file_monitor !== false
  }
  libraryDialogOpen.value = true
}

function openEditLibraryDialog(item) {
  libraryDialogMode.value = 'edit'
  libraryForm.value = {
    guid: item?.guid || '',
    title: item?.title || item?.name || '',
    category: item?.category || 'Movie',
    dirText: libraryPaths(item).join('\n'),
    file_monitor: item?.file_monitor ?? item?.fileMonitor ?? serverForm.value.file_monitor ?? true
  }
  libraryDialogOpen.value = true
}

function closeLibraryDialog() {
  if (!libraryDialogSaving.value) {
    libraryDialogOpen.value = false
  }
}

async function submitLibraryDialog() {
  const title = String(libraryForm.value.title || '').trim()
  const dirList = splitDirText(libraryForm.value.dirText)
  if (!title) {
    COMMON.ShowMsg('请输入媒体库名称')
    return
  }
  if (dirList.length === 0) {
    COMMON.ShowMsg('请至少填写一个媒体文件夹')
    return
  }
  const payload = {
    title,
    name: title,
    category: libraryForm.value.category,
    dir_list: dirList,
    file_monitor: Boolean(libraryForm.value.file_monitor)
  }
  libraryDialogSaving.value = true
  try {
    if (libraryDialogMode.value === 'edit') {
      const guid = libraryForm.value.guid
      if (!guid) {
        COMMON.ShowMsg('媒体库信息缺少 guid')
        return
      }
      await COMMON.requests('POST', `/api/v1/mdb/${guid}`, true, payload)
      COMMON.ShowMsg('媒体库已保存')
    } else {
      await COMMON.requests('PUT', '/api/v1/mdb/create', true, payload)
      COMMON.ShowMsg('媒体库已创建')
    }
    libraryDialogOpen.value = false
    await loadSettingsData()
  } catch {
    COMMON.ShowMsg(libraryDialogMode.value === 'edit' ? '媒体库保存失败' : '媒体库创建失败')
  } finally {
    libraryDialogSaving.value = false
  }
}

function openDeleteLibraryDialog(item) {
  deleteLibraryTarget.value = item || null
}

function closeDeleteLibraryDialog() {
  if (!libraryDialogSaving.value) {
    deleteLibraryTarget.value = null
  }
}

async function deleteLibrary() {
  const guid = deleteLibraryTarget.value?.guid
  if (!guid) {
    COMMON.ShowMsg('媒体库信息缺少 guid')
    return
  }
  libraryDialogSaving.value = true
  try {
    await COMMON.requests('DELETE', `/api/v1/mdb/${guid}`, true)
    COMMON.ShowMsg('媒体库已删除')
    deleteLibraryTarget.value = null
    await loadSettingsData()
  } catch {
    COMMON.ShowMsg('媒体库删除失败')
  } finally {
    libraryDialogSaving.value = false
  }
}

function openLibrarySortDialog() {
  sortedLibraries.value = visibleLibraries.value.map(item => ({...item}))
  librarySortOpen.value = true
}

function moveSortedLibrary(index, direction) {
  const nextIndex = index + direction
  if (nextIndex < 0 || nextIndex >= sortedLibraries.value.length) {
    return
  }
  const next = [...sortedLibraries.value]
  const [target] = next.splice(index, 1)
  next.splice(nextIndex, 0, target)
  sortedLibraries.value = next
}

async function saveLibrarySort() {
  const listSort = sortedLibraries.value
      .map((item, index) => ({guid: item.guid, sort_num: index}))
      .filter(item => item.guid)
  if (!listSort.length) {
    COMMON.ShowMsg('没有可排序的媒体库')
    return
  }
  librarySortSaving.value = true
  try {
    await COMMON.requests('POST', '/api/v1/mdb/setSort', true, {list_sort: listSort})
    COMMON.ShowMsg('媒体库排序已保存')
    librarySortOpen.value = false
    await loadSettingsData()
  } catch {
    COMMON.ShowMsg('媒体库排序保存失败')
  } finally {
    librarySortSaving.value = false
  }
}

async function openCreateUserDialog() {
  userDialogMode.value = 'create'
  userForm.value = {
    guid: '',
    username: '',
    password: '',
    is_admin: false,
    media_permission: 1,
    mediadb_list: visibleLibraries.value.map(item => item.guid).filter(Boolean)
  }
  try {
    const permission = await safeRequest('GET', '/api/v1/manager/template/permission', undefined, null)
    if (permission) {
      userForm.value.media_permission = normalizePermission(permission.media_permission, 1)
      userForm.value.mediadb_list = normalizeMediadbGuids(permission.mediadb_list)
    }
  } catch {
    // safeRequest 已兜底，这里保持默认值。
  }
  userDialogOpen.value = true
}

function openEditUserDialog(item) {
  userDialogMode.value = 'edit'
  userForm.value = {
    guid: item?.guid || item?.user_guid || '',
    username: userName(item) === '-' ? '' : userName(item),
    password: '',
    is_admin: Boolean(item?.is_admin || item?.role === 'admin' || item?.role === 1),
    media_permission: normalizePermission(item?.media_permission, item?.is_admin ? 1 : 1),
    mediadb_list: normalizeMediadbGuids(item?.mediadb_list)
  }
  userDialogOpen.value = true
}

function closeUserDialog() {
  if (!userDialogSaving.value) {
    userDialogOpen.value = false
  }
}

async function submitUserDialog() {
  const username = String(userForm.value.username || '').trim()
  if (!username) {
    COMMON.ShowMsg('请输入用户名')
    return
  }
  if (userDialogMode.value === 'create' && !userForm.value.password) {
    COMMON.ShowMsg('请输入用户密码')
    return
  }
  const payload = {
    username,
    is_admin: userForm.value.is_admin ? 1 : 0,
    media_permission: normalizePermission(userForm.value.media_permission, 1)
  }
  if (userForm.value.password) {
    payload.password = userForm.value.password
  }
  if (payload.media_permission === 2) {
    payload.mediadb_list = normalizeMediadbGuids(userForm.value.mediadb_list)
  }
  userDialogSaving.value = true
  try {
    if (userDialogMode.value === 'edit') {
      const guid = userForm.value.guid
      if (!guid) {
        COMMON.ShowMsg('缺少用户 guid')
        return
      }
      await COMMON.requests('POST', `/api/v1/manager/user/${guid}`, true, payload)
      COMMON.ShowMsg('用户已保存')
    } else {
      await COMMON.requests('PUT', '/api/v1/manager/user/create', true, payload)
      COMMON.ShowMsg('用户已创建')
    }
    userDialogOpen.value = false
    await loadUsersData()
  } catch {
    COMMON.ShowMsg(userDialogMode.value === 'edit' ? '用户保存失败' : '用户创建失败')
  } finally {
    userDialogSaving.value = false
  }
}

function openDeleteUserDialog(item) {
  deleteUserTarget.value = item || null
}

function closeDeleteUserDialog() {
  if (!userDialogSaving.value) {
    deleteUserTarget.value = null
  }
}

async function deleteUser() {
  const guid = deleteUserTarget.value?.guid || deleteUserTarget.value?.user_guid
  if (!guid) {
    COMMON.ShowMsg('缺少用户 guid')
    return
  }
  userDialogSaving.value = true
  try {
    await COMMON.requests('DELETE', `/api/v1/manager/user/${guid}`, true)
    COMMON.ShowMsg('用户已删除')
    deleteUserTarget.value = null
    await loadUsersData()
  } catch {
    COMMON.ShowMsg('用户删除失败')
  } finally {
    userDialogSaving.value = false
  }
}

function formatDateValue(value) {
  if (!value) {
    return '-'
  }
  const text = String(value)
  const match = text.match(/\d{4}[-/]\d{1,2}[-/]\d{1,2}/)
  if (match) {
    return match[0].replace(/\//g, '-')
  }
  const numeric = Number(value)
  const date = new Date(Number.isFinite(numeric) ? (numeric > 1000000000000 ? numeric : numeric * 1000) : text)
  if (Number.isNaN(date.getTime())) {
    return text
  }
  return date.toISOString().slice(0, 19).replace('T', ' ')
}

function libraryUpdatedAt(item) {
  return formatDateValue(firstTextValue(item, [
    'file_update_time',
    'files_update_time',
    'file_recent_update',
    'latest_file_update',
    'latest_update_time',
    'update_time',
    'last_update_time',
    'updated_at',
    'mtime',
    'modified_time'
  ]))
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
  if (scanning.value || scanningLibraryGuid.value) {
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

async function scanLibrary(item) {
  const libraryGuid = item?.guid || ''
  if (!libraryGuid || scanning.value || scanningLibraryGuid.value) {
    if (!libraryGuid) {
      COMMON.ShowMsg('媒体库信息缺少 guid，无法扫描')
    }
    return
  }
  scanningLibraryGuid.value = libraryGuid
  try {
    await COMMON.requests('POST', `/api/v1/mdb/scan/${libraryGuid}`, true)
    COMMON.ShowMsg(`已开始扫描${item?.title ? `「${item.title}」` : '该媒体库'}`)
  } catch {
    COMMON.ShowMsg('扫描媒体库失败')
  } finally {
    scanningLibraryGuid.value = ''
  }
}

async function savePassword() {
  const password = passwordForm.value.password || ''
  const confirmPassword = passwordForm.value.confirmPassword || ''
  if (password.length < 6 || password.length > 127) {
    COMMON.ShowMsg('密码长度需为 6-127 位')
    return
  }
  if (password !== confirmPassword) {
    COMMON.ShowMsg('两次输入的密码不一致')
    return
  }
  savingPassword.value = true
  try {
    await COMMON.requests('POST', '/api/v1/user/passwd', true, {password})
    passwordForm.value = {password: '', confirmPassword: ''}
    COMMON.ShowMsg('密码已更新')
  } catch {
    COMMON.ShowMsg('密码更新失败')
  } finally {
    savingPassword.value = false
  }
}

async function savePreference() {
  savingPreference.value = true
  try {
    await COMMON.requests('POST', '/api/v1/user/info', true, {
      lan: preferenceForm.value.lan,
      audio_lan: preferenceForm.value.audio_lan
    })
    userInfo.value = {
      ...userInfo.value,
      lan: preferenceForm.value.lan,
      audio_lan: preferenceForm.value.audio_lan
    }
    COMMON.ShowMsg('播放偏好已保存')
  } catch {
    COMMON.ShowMsg('播放偏好保存失败')
  } finally {
    savingPreference.value = false
  }
}

async function saveServerSettings() {
  savingServer.value = true
  try {
    const payload = {
      server_name: serverForm.value.server_name,
      lan: serverForm.value.lan,
      gpu_acc: serverForm.value.gpu_acc,
      gpu_prefer: serverForm.value.gpu_prefer,
      cpu_allow_decoding: serverForm.value.cpu_allow_decoding,
      direct_link_enable: serverForm.value.direct_link_enable,
      direct_link_allowed_level: serverForm.value.direct_link_allowed_level,
      file_monitor: serverForm.value.file_monitor
    }
    await COMMON.requests('POST', '/api/v1/server/info', true, payload)
    serverInfo.value = {
      ...serverInfo.value,
      ...payload
    }
    COMMON.ShowMsg('服务器设置已保存')
  } catch {
    COMMON.ShowMsg('服务器设置保存失败')
  } finally {
    savingServer.value = false
  }
}

async function toggleTaskSwitch() {
  const next = !taskEnabled.value
  savingTaskSwitch.value = true
  try {
    await COMMON.requests('POST', '/api/v1/task/schedule/set', true, {
      task_switch: next ? 1 : 0
    })
    taskSetting.value = {
      ...taskSetting.value,
      task_switch: next ? 1 : 0
    }
    COMMON.ShowMsg(next ? '任务计划已开启' : '任务计划已关闭')
  } catch {
    COMMON.ShowMsg('任务计划设置失败')
  } finally {
    savingTaskSwitch.value = false
  }
}

async function unlockUser(item) {
  const guid = item?.guid || item?.user_guid
  if (!guid) {
    COMMON.ShowMsg('缺少用户 guid')
    return
  }
  try {
    await COMMON.requests('POST', '/api/v1/manager/user/unlock', true, {guid})
    COMMON.ShowMsg('已解除锁定')
    await loadUsersData()
  } catch {
    COMMON.ShowMsg('解除锁定失败')
  }
}

function userName(item) {
  return item?.username || item?.name || item?.nick_name || '-'
}

function userIsAdmin(item) {
  return Boolean(item?.is_admin || item?.role === 'admin' || item?.role === 1)
}

function userPermission(item) {
  if (userIsAdmin(item)) {
    return '管理员'
  }
  if (item?.permission_name || item?.role_name) {
    return item.permission_name || item.role_name
  }
  return '普通用户'
}

function taskName(item) {
  const raw = item?.name || item?.task_name || item?.task || ''
  const map = {
    'scrap-item': '媒体库刮削',
    'extra-subtitle': '自动下载字幕'
  }
  return map[raw] || raw || '-'
}

function taskStatus(item) {
  if (item?.running || item?.status === 'running') {
    return '运行中'
  }
  if (item?.last_run_status === false || item?.status === 'failed') {
    return '失败'
  }
  return '等待下次运行'
}

onMounted(async () => {
  await loadSettingsData()
  await loadActiveSection()
})

watch(
    activeSettingsKey,
    async () => {
      await loadActiveSection()
    }
)
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
            :class="{ active: isNavActive(item) }"
            type="button"
            @click="handleSettingsNav(item)"
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
            :class="{ active: isNavActive(item) }"
            type="button"
            @click="handleSettingsNav(item)"
        >
          <i :class="item.icon"></i>
          <span>{{ item.label }}</span>
        </button>
      </div>

      <div class="settings-version">
        <div>{{ displayServerName }}</div>
        <div>版本号 {{ versionInfo.version || '0.9.7' }}</div>
        <div>服务版本 {{ versionInfo.mediasrvVersion || versionInfo.media_srv_version || '0.8.35' }}</div>
      </div>
    </aside>

    <section class="settings-content">
      <header class="settings-content-header">
        <h1>{{ contentTitle }}</h1>
      </header>

      <div class="settings-body">
        <section v-if="activeSettingsKey === 'account'" class="settings-panel narrow-panel">
          <div class="settings-section-heading">
            <h2>修改密码</h2>
            <p>修改当前登录用户的访问密码。</p>
          </div>
          <label class="settings-form-row">
            <span>新密码</span>
            <input v-model="passwordForm.password" type="password" autocomplete="new-password" placeholder="请输入 6-127 位密码">
          </label>
          <label class="settings-form-row">
            <span>确认密码</span>
            <input v-model="passwordForm.confirmPassword" type="password" autocomplete="new-password" placeholder="再次输入新密码">
          </label>
          <div class="settings-form-actions">
            <button class="settings-primary-button" type="button" :disabled="savingPassword" @click="savePassword">
              <i class='bx bx-check'></i>
              <span>{{ savingPassword ? '保存中' : '保存' }}</span>
            </button>
          </div>
        </section>

        <section v-else-if="activeSettingsKey === 'preference'" class="settings-panel narrow-panel">
          <div class="settings-section-heading">
            <h2>播放偏好</h2>
            <p>新播放任务会优先使用这里的音频和字幕语言。</p>
          </div>
          <label class="settings-form-row">
            <span>音频语言</span>
            <select v-model="preferenceForm.audio_lan">
              <option v-for="item in languageOptions" :key="`audio-${item.code}`" :value="item.code">{{ item.label }}</option>
            </select>
          </label>
          <label class="settings-form-row">
            <span>字幕语言</span>
            <select v-model="preferenceForm.lan">
              <option v-for="item in languageOptions" :key="`subtitle-${item.code}`" :value="item.code">{{ item.label }}</option>
            </select>
          </label>
          <div class="settings-form-actions">
            <button class="settings-primary-button" type="button" :disabled="savingPreference || sectionLoading" @click="savePreference">
              <i class='bx bx-check'></i>
              <span>{{ savingPreference ? '保存中' : '保存' }}</span>
            </button>
          </div>
        </section>

        <section v-else-if="activeSettingsKey === 'appearance'" class="appearance-content">
          <section class="appearance-section">
            <div class="appearance-section-title">主题模式</div>
            <div class="appearance-segmented" role="group" aria-label="主题模式">
              <button
                  v-for="item in themeItems"
                  :key="item.key"
                  class="appearance-option"
                  :class="{ active: currentThemeMode === item.key }"
                  type="button"
                  @click="setThemeMode(item.key)"
              >
                {{ item.label }}
              </button>
            </div>
          </section>

          <section class="appearance-section">
            <div class="appearance-section-title">卡片样式</div>
            <div class="appearance-card-row">
              <div class="appearance-preview-card" aria-hidden="true">
                <div v-if="cardStyle.rating" class="appearance-preview-rating">9.2</div>
                <div class="appearance-preview-right">
                  <div v-if="cardStyle.resolution" class="appearance-preview-resolution">1080</div>
                  <div v-if="cardStyle.watched" class="appearance-preview-watched"><i class='bx bx-check'></i></div>
                </div>
                <div class="appearance-preview-title">红樱桃</div>
              </div>
              <div class="appearance-card-options">
                <button
                    v-for="item in cardStyleItems"
                    :key="item.key"
                    class="appearance-card-style"
                    :class="{ active: cardStyle[item.key] }"
                    type="button"
                    @click="toggleCardStyle(item.key)"
                >
                  <span class="appearance-card-style-sample">{{ item.sample }}</span>
                  <span>{{ item.label }}</span>
                </button>
              </div>
            </div>
          </section>
        </section>

        <template v-else-if="activeSettingsKey === 'library'">
          <div class="settings-toolbar">
            <button class="settings-primary-button" type="button" @click="openCreateLibraryDialog">
              <i class='bx bx-plus'></i>
              <span>新增媒体库</span>
            </button>
            <button class="settings-secondary-button" type="button" :disabled="visibleLibraries.length < 2" @click="openLibrarySortDialog">
              <i class='bx bx-list-ul'></i>
              <span>排序</span>
            </button>
            <button class="settings-secondary-button" type="button" :disabled="scanning || Boolean(scanningLibraryGuid)" @click="scanAllLibraries">
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
                    </div>
                  </td>
                  <td>
                    <div class="settings-folder-text" :title="libraryFolder(item)">{{ libraryFolder(item) }}</div>
                  </td>
                  <td>{{ libraryTypeLabel(item) }}</td>
                  <td>{{ libraryUpdatedAt(item) }}</td>
                  <td>
                    <div class="settings-actions">
                      <button type="button" aria-label="删除媒体库" title="删除媒体库" @click="openDeleteLibraryDialog(item)">
                        <i class='bx bx-trash'></i>
                      </button>
                      <button type="button" aria-label="编辑媒体库" title="编辑媒体库" @click="openEditLibraryDialog(item)">
                        <i class='bx bx-edit-alt'></i>
                      </button>
                      <button
                          type="button"
                          aria-label="扫描媒体库"
                          title="扫描媒体库"
                          :disabled="scanning || Boolean(scanningLibraryGuid)"
                          @click="scanLibrary(item)"
                      >
                        <i class='bx bx-refresh' :class="{ spinning: scanningLibraryGuid === item.guid }"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              </template>
              </tbody>
            </table>
          </div>
        </template>

        <section v-else-if="activeSettingsKey === 'users'" class="settings-panel">
          <div class="settings-panel-head">
            <div class="settings-section-heading">
              <h2>用户</h2>
              <p>查看飞牛影视用户和登录状态。</p>
            </div>
            <div class="settings-toolbar compact">
              <button class="settings-primary-button" type="button" @click="openCreateUserDialog">
                <i class='bx bx-plus'></i>
                <span>新增用户</span>
              </button>
              <button class="settings-secondary-button" type="button" :disabled="sectionLoading" @click="loadUsersData">
                <i class='bx bx-refresh' :class="{ spinning: sectionLoading }"></i>
                <span>刷新</span>
              </button>
            </div>
          </div>
          <div class="settings-simple-table-wrap">
            <table class="settings-simple-table">
              <thead>
              <tr>
                <th>用户</th>
                <th>权限</th>
                <th>最近登录</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
              </thead>
              <tbody>
              <tr v-if="sectionLoading">
                <td colspan="5" class="settings-empty-row">正在加载用户</td>
              </tr>
              <tr v-else-if="usersList.length === 0">
                <td colspan="5" class="settings-empty-row">暂无用户</td>
              </tr>
              <template v-else>
                <tr v-for="item in usersList" :key="item.guid || item.username || item.name">
                  <td>
                    <div class="settings-user-cell">
                      <div class="settings-user-avatar">{{ userName(item).slice(0, 1).toLowerCase() }}</div>
                      <span>{{ userName(item) }}</span>
                    </div>
                  </td>
                  <td>{{ userPermission(item) }}</td>
                  <td>{{ formatDateValue(item.last_login_time || item.lastLoginTime || item.update_time) }}</td>
                  <td>
                    <span class="settings-pill" :class="{ danger: item.banned || item.locked }">
                      {{ item.banned || item.locked ? '已锁定' : '正常' }}
                    </span>
                  </td>
                  <td>
                    <div class="settings-actions">
                      <button type="button" title="编辑用户" @click="openEditUserDialog(item)">
                        <i class='bx bx-edit-alt'></i>
                      </button>
                      <button v-if="item.banned || item.locked" type="button" title="解除锁定" @click="unlockUser(item)">
                        <i class='bx bx-lock-open-alt'></i>
                      </button>
                      <button v-if="!userIsAdmin(item)" type="button" title="删除用户" @click="openDeleteUserDialog(item)">
                        <i class='bx bx-trash'></i>
                      </button>
                    </div>
                  </td>
                </tr>
              </template>
              </tbody>
            </table>
          </div>
        </section>

        <section v-else-if="activeSettingsKey === 'server'" class="settings-panel">
          <div class="settings-panel-head">
            <div class="settings-section-heading">
              <h2>服务器设置</h2>
              <p>复刻官方服务器设置入口，保存时调用官方 `/server/info`。</p>
            </div>
            <button class="settings-primary-button" type="button" :disabled="savingServer || sectionLoading" @click="saveServerSettings">
              <i class='bx bx-check'></i>
              <span>{{ savingServer ? '保存中' : '保存' }}</span>
            </button>
          </div>
          <div class="settings-form-grid">
            <label class="settings-form-row">
              <span>服务器名称</span>
              <input v-model="serverForm.server_name" type="text" placeholder="飞牛影视">
            </label>
            <label class="settings-form-row">
              <span>首选语言</span>
              <select v-model="serverForm.lan">
                <option v-for="item in languageOptions" :key="`server-${item.code}`" :value="item.code">{{ item.label }}</option>
              </select>
            </label>
            <label class="settings-form-row">
              <span>GPU 加速转码</span>
              <input v-model="serverForm.gpu_acc" type="checkbox">
            </label>
            <label class="settings-form-row">
              <span>GPU 优先设备</span>
              <select v-model="serverForm.gpu_prefer">
                <option value="">自动选择</option>
                <option v-for="gpu in gpuList" :key="gpu.id || gpu.name || gpu.index" :value="gpu.id || gpu.name || gpu.index">
                  {{ gpu.name || gpu.title || gpu.id || gpu.index }}
                </option>
              </select>
            </label>
            <label class="settings-form-row">
              <span>允许 CPU 解码</span>
              <input v-model="serverForm.cpu_allow_decoding" type="checkbox">
            </label>
            <label class="settings-form-row">
              <span>允许直链播放</span>
              <input v-model="serverForm.direct_link_enable" type="checkbox">
            </label>
            <label class="settings-form-row">
              <span>直链允许等级</span>
              <input v-model="serverForm.direct_link_allowed_level" type="text" placeholder="默认">
            </label>
            <label class="settings-form-row">
              <span>文件夹监控</span>
              <input v-model="serverForm.file_monitor" type="checkbox">
            </label>
          </div>
        </section>

        <section v-else-if="activeSettingsKey === 'task'" class="settings-panel">
          <div class="settings-panel-head">
            <div class="settings-section-heading">
              <h2>任务计划</h2>
              <p>查看官方计划任务，并控制任务计划总开关。</p>
            </div>
            <button
                class="settings-switch-button"
                type="button"
                :class="{ active: taskEnabled }"
                :disabled="savingTaskSwitch || sectionLoading"
                @click="toggleTaskSwitch"
            >
              <span>{{ taskEnabled ? '已开启' : '已关闭' }}</span>
            </button>
          </div>
          <div class="settings-simple-table-wrap">
            <table class="settings-simple-table">
              <thead>
              <tr>
                <th>任务</th>
                <th>上次开始</th>
                <th>上次结束</th>
                <th>状态</th>
              </tr>
              </thead>
              <tbody>
              <tr v-if="sectionLoading">
                <td colspan="4" class="settings-empty-row">正在加载任务计划</td>
              </tr>
              <tr v-else-if="taskList.length === 0">
                <td colspan="4" class="settings-empty-row">暂无任务计划</td>
              </tr>
              <template v-else>
                <tr v-for="item in taskList" :key="item.name || item.task_name">
                  <td>{{ taskName(item) }}</td>
                  <td>{{ formatDateValue(item.last_run_start_time || item.lastRunStartTime) }}</td>
                  <td>{{ formatDateValue(item.last_run_end_time || item.lastRunEndTime) }}</td>
                  <td><span class="settings-pill">{{ taskStatus(item) }}</span></td>
                </tr>
              </template>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </section>

    <div v-if="libraryDialogOpen" class="settings-dialog-mask" @click.self="closeLibraryDialog">
      <section class="settings-dialog settings-dialog-wide" role="dialog" aria-modal="true">
        <header class="settings-dialog-header">
          <h2>{{ libraryDialogMode === 'edit' ? '编辑媒体库' : '新增媒体库' }}</h2>
          <button type="button" aria-label="关闭" @click="closeLibraryDialog">
            <i class='bx bx-x'></i>
          </button>
        </header>
        <div class="settings-dialog-body">
          <label class="settings-form-row">
            <span>媒体库名称</span>
            <input v-model="libraryForm.title" type="text" placeholder="例如：电影">
          </label>
          <label class="settings-form-row">
            <span>媒体库类型</span>
            <select v-model="libraryForm.category">
              <option v-for="item in libraryCategoryOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
            </select>
          </label>
          <label class="settings-form-row settings-form-row-top">
            <span>媒体文件夹</span>
            <textarea v-model="libraryForm.dirText" rows="5" placeholder="每行一个媒体文件夹路径"></textarea>
          </label>
          <label class="settings-form-row">
            <span>文件夹监控</span>
            <input v-model="libraryForm.file_monitor" type="checkbox">
          </label>
        </div>
        <footer class="settings-dialog-footer">
          <button class="settings-secondary-button" type="button" :disabled="libraryDialogSaving" @click="closeLibraryDialog">取消</button>
          <button class="settings-primary-button" type="button" :disabled="libraryDialogSaving" @click="submitLibraryDialog">
            {{ libraryDialogSaving ? '保存中' : '确定' }}
          </button>
        </footer>
      </section>
    </div>

    <div v-if="deleteLibraryTarget" class="settings-dialog-mask" @click.self="closeDeleteLibraryDialog">
      <section class="settings-dialog" role="dialog" aria-modal="true">
        <header class="settings-dialog-header">
          <h2>删除媒体库</h2>
          <button type="button" aria-label="关闭" @click="closeDeleteLibraryDialog">
            <i class='bx bx-x'></i>
          </button>
        </header>
        <div class="settings-dialog-body">
          <p class="settings-dialog-text">确定删除「{{ deleteLibraryTarget.title || deleteLibraryTarget.name || '媒体库' }}」吗？该操作会调用官方删除接口。</p>
        </div>
        <footer class="settings-dialog-footer">
          <button class="settings-secondary-button" type="button" :disabled="libraryDialogSaving" @click="closeDeleteLibraryDialog">取消</button>
          <button class="settings-primary-button danger" type="button" :disabled="libraryDialogSaving" @click="deleteLibrary">
            {{ libraryDialogSaving ? '删除中' : '删除' }}
          </button>
        </footer>
      </section>
    </div>

    <div v-if="librarySortOpen" class="settings-dialog-mask" @click.self="librarySortOpen = false">
      <section class="settings-dialog settings-dialog-wide" role="dialog" aria-modal="true">
        <header class="settings-dialog-header">
          <h2>媒体库排序</h2>
          <button type="button" aria-label="关闭" @click="librarySortOpen = false">
            <i class='bx bx-x'></i>
          </button>
        </header>
        <div class="settings-dialog-body">
          <div class="settings-sort-list">
            <div v-for="(item, index) in sortedLibraries" :key="item.guid || item.title" class="settings-sort-row">
              <span class="settings-sort-index">{{ index + 1 }}</span>
              <span class="settings-sort-title">{{ item.title || item.name || '媒体库' }}</span>
              <div class="settings-sort-actions">
                <button type="button" :disabled="index === 0" @click="moveSortedLibrary(index, -1)">
                  <i class='bx bx-chevron-up'></i>
                </button>
                <button type="button" :disabled="index === sortedLibraries.length - 1" @click="moveSortedLibrary(index, 1)">
                  <i class='bx bx-chevron-down'></i>
                </button>
              </div>
            </div>
          </div>
        </div>
        <footer class="settings-dialog-footer">
          <button class="settings-secondary-button" type="button" :disabled="librarySortSaving" @click="librarySortOpen = false">取消</button>
          <button class="settings-primary-button" type="button" :disabled="librarySortSaving" @click="saveLibrarySort">
            {{ librarySortSaving ? '保存中' : '保存排序' }}
          </button>
        </footer>
      </section>
    </div>

    <div v-if="userDialogOpen" class="settings-dialog-mask" @click.self="closeUserDialog">
      <section class="settings-dialog settings-dialog-wide" role="dialog" aria-modal="true">
        <header class="settings-dialog-header">
          <h2>{{ userDialogMode === 'edit' ? '编辑用户' : '新增用户' }}</h2>
          <button type="button" aria-label="关闭" @click="closeUserDialog">
            <i class='bx bx-x'></i>
          </button>
        </header>
        <div class="settings-dialog-body">
          <label class="settings-form-row">
            <span>用户名</span>
            <input v-model="userForm.username" type="text" autocomplete="new-password" placeholder="请输入用户名">
          </label>
          <label class="settings-form-row">
            <span>{{ userDialogMode === 'edit' ? '新密码' : '密码' }}</span>
            <input v-model="userForm.password" type="password" autocomplete="new-password" :placeholder="userDialogMode === 'edit' ? '留空则不修改密码' : '请输入密码'">
          </label>
          <label class="settings-form-row">
            <span>媒体库权限</span>
            <select v-model.number="userForm.media_permission" :disabled="userForm.is_admin">
              <option v-for="item in permissionOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
            </select>
          </label>
          <div v-if="userForm.media_permission === 2 && !userForm.is_admin" class="settings-library-checks">
            <label v-for="item in visibleLibraries" :key="item.guid || item.title" class="settings-check-row">
              <input v-model="userForm.mediadb_list" type="checkbox" :value="item.guid">
              <span>{{ item.title || item.name || '媒体库' }}</span>
            </label>
          </div>
        </div>
        <footer class="settings-dialog-footer">
          <button class="settings-secondary-button" type="button" :disabled="userDialogSaving" @click="closeUserDialog">取消</button>
          <button class="settings-primary-button" type="button" :disabled="userDialogSaving" @click="submitUserDialog">
            {{ userDialogSaving ? '保存中' : '确定' }}
          </button>
        </footer>
      </section>
    </div>

    <div v-if="deleteUserTarget" class="settings-dialog-mask" @click.self="closeDeleteUserDialog">
      <section class="settings-dialog" role="dialog" aria-modal="true">
        <header class="settings-dialog-header">
          <h2>删除用户</h2>
          <button type="button" aria-label="关闭" @click="closeDeleteUserDialog">
            <i class='bx bx-x'></i>
          </button>
        </header>
        <div class="settings-dialog-body">
          <p class="settings-dialog-text">确定删除用户「{{ userName(deleteUserTarget) }}」吗？</p>
        </div>
        <footer class="settings-dialog-footer">
          <button class="settings-secondary-button" type="button" :disabled="userDialogSaving" @click="closeDeleteUserDialog">取消</button>
          <button class="settings-primary-button danger" type="button" :disabled="userDialogSaving" @click="deleteUser">
            {{ userDialogSaving ? '删除中' : '删除' }}
          </button>
        </footer>
      </section>
    </div>
  </main>
</template>

<style scoped>
.settings-page {
  --settings-bg: var(--fn-bg, #ffffff);
  --settings-sidebar: var(--fn-sidebar, #f3f4f6);
  --settings-surface: var(--fn-popover, #ffffff);
  --settings-surface-hover: var(--fn-popover-hover, #f4f6fb);
  --settings-border: var(--fn-border, rgba(15, 23, 42, 0.08));
  --settings-text: var(--fn-text, rgba(15, 23, 42, 0.9));
  --settings-subtext: var(--fn-muted, rgba(0, 0, 0, 0.8));
  --settings-muted: var(--fn-soft, rgba(15, 23, 42, 0.42));
  --settings-primary: var(--fn-blue, #0066ff);
  --settings-danger: #ff4d4f;
  height: 100vh;
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  overflow: hidden;
  background: var(--settings-bg);
  color: var(--settings-text);
  font-family: -apple-system, BlinkMacSystemFont, Helvetica Neue, PingFang SC, Microsoft YaHei, Source Han Sans SC, Noto Sans CJK SC, sans-serif;
}

.settings-sidebar {
  height: 100vh;
  min-height: 0;
  background: var(--settings-sidebar);
  border-right: 1px solid var(--settings-border);
  display: flex;
  flex-direction: column;
  padding: 32px 20px 24px;
  overflow: hidden;
}

.settings-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  height: 40px;
  margin-bottom: 34px;
  font-size: 16px;
  font-weight: 650;
  line-height: 40px;
  white-space: nowrap;
}

.settings-back,
.settings-nav-item,
.appearance-option,
.appearance-card-style,
.settings-primary-button,
.settings-secondary-button,
.settings-switch-button,
.settings-actions button {
  appearance: none;
  border: 0;
  font-family: inherit;
  cursor: pointer;
}

.settings-back {
  flex: 0 0 38px;
  width: 38px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: var(--settings-text);
  font-size: 24px;
  border-radius: 8px;
  line-height: 1;
}

.settings-back:hover,
.settings-actions button:hover {
  background: var(--settings-surface-hover);
}

.settings-logo {
  flex: 0 0 32px;
  width: 32px;
  height: 32px;
  object-fit: contain;
}

.settings-brand span {
  min-width: 0;
  overflow: hidden;
  color: var(--settings-text);
  line-height: 40px;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  background: rgba(10, 132, 255, 0.14);
  color: var(--settings-primary);
}

.settings-version {
  margin-top: auto;
  color: var(--settings-subtext);
  font-size: 13px;
  line-height: 1.7;
}

.settings-content {
  height: 100vh;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 0 42px;
  overflow: hidden;
}

.settings-content-header {
  flex: 0 0 auto;
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

.settings-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding-bottom: 44px;
}

.settings-toolbar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 22px 0 36px;
}

.settings-toolbar.compact {
  padding: 0;
  gap: 10px;
}

.settings-primary-button,
.settings-secondary-button,
.settings-switch-button {
  height: 36px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 18px;
  border-radius: 8px;
  font-weight: 650;
}

.settings-primary-button {
  color: white;
  background: var(--settings-primary);
}

.settings-primary-button.danger {
  background: var(--settings-danger);
}

.settings-secondary-button {
  background: var(--settings-surface-hover);
  color: var(--settings-text);
}

.settings-switch-button {
  color: var(--settings-text);
  background: var(--settings-surface-hover);
}

.settings-switch-button.active {
  color: white;
  background: var(--settings-primary);
}

.settings-primary-button:disabled,
.settings-secondary-button:disabled,
.settings-switch-button:disabled {
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

.settings-panel {
  margin-top: 34px;
  max-width: 1080px;
  padding-bottom: 42px;
}

.narrow-panel {
  max-width: 640px;
}

.settings-panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 26px;
}

.settings-section-heading h2 {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 650;
}

.settings-section-heading p {
  margin: 0;
  color: var(--settings-subtext);
  font-size: 14px;
  line-height: 1.6;
}

.settings-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px 28px;
}

.settings-form-row {
  display: grid;
  grid-template-columns: 148px minmax(0, 1fr);
  align-items: center;
  gap: 16px;
  min-height: 44px;
  margin-top: 18px;
  color: var(--settings-text);
  font-size: 14px;
}

.settings-form-grid .settings-form-row {
  grid-template-columns: 132px minmax(0, 1fr);
  margin-top: 0;
}

.settings-form-row span {
  color: var(--settings-subtext);
}

.settings-form-row input[type="text"],
.settings-form-row input[type="password"],
.settings-form-row select,
.settings-form-row textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 0 12px;
  color: var(--settings-text);
  background: var(--settings-surface);
  border: 1px solid var(--settings-border);
  border-radius: 8px;
  outline: none;
}

.settings-form-row input[type="text"],
.settings-form-row input[type="password"],
.settings-form-row select {
  height: 36px;
}

.settings-form-row textarea {
  min-height: 118px;
  padding: 10px 12px;
  resize: vertical;
  line-height: 1.6;
}

.settings-form-row-top {
  align-items: flex-start;
}

.settings-form-row-top span {
  padding-top: 10px;
}

.settings-form-row input[type="checkbox"] {
  width: 18px;
  height: 18px;
  accent-color: var(--settings-primary);
}

.settings-form-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 28px;
}

.settings-table-wrap {
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding-bottom: 44px;
  border-top: 1px solid var(--settings-border);
}

.settings-library-table,
.settings-simple-table {
  width: 100%;
  min-width: 0;
  border-collapse: collapse;
  table-layout: fixed;
}

.settings-library-table th,
.settings-simple-table th {
  height: 49px;
  padding: 0 16px;
  text-align: left;
  color: var(--settings-text);
  font-size: 14px;
  font-weight: 650;
  border-bottom: 1px solid var(--settings-border);
}

.settings-library-table th:nth-child(1) {
  width: 25%;
  text-align: center;
}

.settings-library-table th:nth-child(2) {
  width: 27%;
}

.settings-library-table th:nth-child(3) {
  width: 12%;
}

.settings-library-table th:nth-child(4) {
  width: 17.5%;
}

.settings-library-table th:nth-child(5) {
  width: 18.5%;
  text-align: center;
}

.settings-library-table td,
.settings-simple-table td {
  box-sizing: border-box;
  padding: 16px;
  color: var(--settings-text);
  font-size: 14px;
  border-bottom: 1px solid var(--settings-border);
  vertical-align: middle;
}

.settings-library-table td {
  height: 195px;
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
  background: linear-gradient(to top, rgba(15, 23, 42, 0.62), transparent);
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
  gap: 14px;
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

.settings-actions button:disabled {
  cursor: default;
  opacity: 0.58;
}

.settings-dialog-mask {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px;
  background: rgba(15, 23, 42, 0.36);
  backdrop-filter: blur(8px);
}

.settings-dialog {
  width: min(520px, calc(100vw - 32px));
  max-height: min(760px, calc(100vh - 56px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--settings-text);
  background: var(--settings-surface);
  border: 1px solid var(--settings-border);
  border-radius: 10px;
  box-shadow: 0 24px 64px rgba(15, 23, 42, 0.18);
}

.settings-dialog-wide {
  width: min(720px, calc(100vw - 32px));
}

.settings-dialog-header {
  flex: 0 0 auto;
  height: 58px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 22px;
  border-bottom: 1px solid var(--settings-border);
}

.settings-dialog-header h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 650;
}

.settings-dialog-header button,
.settings-sort-actions button {
  appearance: none;
  border: 0;
  cursor: pointer;
}

.settings-dialog-header button {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--settings-subtext);
  background: transparent;
  border-radius: 8px;
  font-size: 22px;
}

.settings-dialog-header button:hover,
.settings-sort-actions button:hover:not(:disabled) {
  background: var(--settings-surface-hover);
}

.settings-dialog-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 22px;
}

.settings-dialog-footer {
  flex: 0 0 auto;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 22px 20px;
  border-top: 1px solid var(--settings-border);
}

.settings-dialog-text {
  margin: 0;
  color: var(--settings-text);
  line-height: 1.7;
}

.settings-sort-list {
  display: grid;
  gap: 8px;
}

.settings-sort-row {
  min-height: 46px;
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 0 12px;
  background: var(--settings-surface-hover);
  border: 1px solid var(--settings-border);
  border-radius: 8px;
}

.settings-sort-index {
  color: var(--settings-muted);
  font-weight: 700;
}

.settings-sort-title {
  overflow: hidden;
  color: var(--settings-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-sort-actions {
  display: flex;
  gap: 6px;
}

.settings-sort-actions button {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--settings-text);
  background: transparent;
  border-radius: 7px;
  font-size: 20px;
}

.settings-sort-actions button:disabled {
  cursor: default;
  opacity: 0.38;
}

.settings-library-checks {
  max-height: 210px;
  margin-top: 12px;
  overflow-y: auto;
  background: var(--settings-surface-hover);
  border: 1px solid var(--settings-border);
  border-radius: 8px;
}

.settings-check-row {
  min-height: 40px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  color: var(--settings-text);
  border-bottom: 1px solid var(--settings-border);
}

.settings-check-row:last-child {
  border-bottom: 0;
}

.settings-check-row input {
  width: 18px;
  height: 18px;
  accent-color: var(--settings-primary);
}

.settings-empty-row {
  text-align: center;
  color: var(--settings-muted);
}

.settings-simple-table-wrap {
  overflow-x: auto;
  border-top: 1px solid var(--settings-border);
}

.settings-user-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.settings-user-avatar {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: white;
  background: var(--settings-primary);
  border-radius: 50%;
  font-weight: 700;
}

.settings-pill {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 9px;
  color: var(--settings-primary);
  background: rgba(10, 132, 255, 0.14);
  border-radius: 999px;
  font-size: 12px;
}

.settings-pill.danger {
  color: var(--settings-danger);
  background: rgba(255, 77, 79, 0.14);
}

.appearance-content {
  min-height: 0;
  padding: 34px 0 44px;
  overflow-y: auto;
}

.appearance-section {
  max-width: 720px;
  padding: 0 0 34px;
  margin-bottom: 30px;
  border-bottom: 1px solid var(--settings-border);
}

.appearance-section-title {
  margin-bottom: 18px;
  color: var(--settings-text);
  font-size: 16px;
  font-weight: 650;
  line-height: 24px;
}

.appearance-segmented {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.appearance-option {
  height: 36px;
  min-width: 92px;
  padding: 0 18px;
  color: var(--settings-text);
  background: var(--settings-surface-hover);
  border-radius: 8px;
  font-size: 14px;
}

.appearance-option.active {
  color: white;
  background: var(--settings-primary);
}

.appearance-card-row {
  display: flex;
  align-items: flex-start;
  gap: 28px;
}

.appearance-preview-card {
  position: relative;
  width: 150px;
  height: 214px;
  flex: 0 0 150px;
  overflow: hidden;
  background: linear-gradient(150deg, rgba(0, 102, 255, 0.18) 0%, var(--settings-surface-hover) 58%, var(--settings-surface) 100%);
  border: 1px solid var(--settings-border);
  border-radius: 8px;
}

.appearance-preview-card::after {
  content: '';
  position: absolute;
  inset: auto 0 0;
  height: 70px;
  background: linear-gradient(to top, rgba(15, 23, 42, 0.34), transparent);
}

.appearance-preview-rating,
.appearance-preview-resolution,
.appearance-preview-watched {
  position: absolute;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 22px;
  padding: 0 8px;
  color: var(--settings-primary);
  background: var(--settings-surface);
  border: 1px solid var(--settings-border);
  border-radius: 5px;
  font-size: 13px;
  font-weight: 700;
}

.appearance-preview-rating {
  top: 10px;
  left: 10px;
  color: #f2c214;
}

.appearance-preview-right {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 6px;
}

.appearance-preview-resolution,
.appearance-preview-watched {
  position: static;
  color: var(--settings-text);
}

.appearance-preview-watched {
  width: 22px;
  padding: 0;
  background: var(--settings-primary);
  border-radius: 999px;
}

.appearance-preview-title {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 12px;
  z-index: 2;
  overflow: hidden;
  color: var(--settings-text);
  font-size: 15px;
  font-weight: 650;
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.appearance-card-options {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding-top: 4px;
}

.appearance-card-style {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  padding: 0 14px;
  color: var(--settings-text);
  background: var(--settings-surface-hover);
  border-radius: 8px;
  font-size: 14px;
}

.appearance-card-style.active {
  color: white;
  background: var(--settings-primary);
}

.appearance-card-style-sample {
  min-width: 24px;
  font-weight: 700;
  text-align: center;
}

@media (max-width: 900px) {
  .settings-page {
    height: auto;
    min-height: 100vh;
    grid-template-columns: 1fr;
    overflow: auto;
  }

  .settings-sidebar {
    height: auto;
    min-height: auto;
    padding: 18px 16px;
    overflow: visible;
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

  .settings-version {
    margin-top: 14px;
  }

  .settings-content {
    height: auto;
    min-height: 0;
    padding: 0 16px 28px;
    overflow: visible;
  }

  .settings-content-header {
    height: 64px;
  }

  .settings-form-grid,
  .settings-form-row {
    grid-template-columns: 1fr;
  }

  .appearance-content {
    padding: 20px 0 28px;
  }

  .appearance-card-row {
    flex-direction: column;
  }

  .settings-toolbar {
    gap: 10px;
    padding: 16px 0 22px;
    overflow-x: auto;
  }

  .settings-table-wrap {
    min-height: 0;
    max-height: none;
    overflow-x: auto;
    padding-bottom: 0;
  }

  .settings-library-table,
  .settings-simple-table {
    min-width: 920px;
  }

  .settings-primary-button,
  .settings-secondary-button {
    flex: 0 0 auto;
  }
}
</style>
