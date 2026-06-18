<script setup>
// 获取 Vue 实例
import {getCurrentInstance, onMounted, ref, computed} from "vue";
import {useMediaDbData} from '@/store.js'
import {onBeforeRouteUpdate} from "vue-router";

const MediaDbData = useMediaDbData()

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
const size = ref(240);
const totalCount = ref(0);
const MediaDbInfo = ref(null);
const galleryTitle = computed(() => {
  return MediaDbData.list.find(item => item.guid === guid.value)?.title || '媒体库'
})

const listSubtitle = computed(() => {
  const loaded = MediaDbInfo.value?.length || 0
  const total = totalCount.value || loaded
  return total ? `${loaded} / ${total} 个项目` : '加载中'
})


const instance = getCurrentInstance();
const proxy = instance.appContext.config.globalProperties;
const COMMON = proxy.$COMMON;
guid.value = proxy.$route.query.gallery_uid


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

function formatRating(item) {
  const rating = Number(item?.vote_average)
  if (!Number.isFinite(rating) || rating <= 0) {
    return ''
  }
  return String(Math.floor(rating * 10) / 10)
}

function releaseYear(item) {
  const source = item?.release_date || item?.year || item?.premiere_date || item?.create_time || ''
  const match = String(source).match(/\d{4}/)
  return match ? match[0] : ''
}

function displayTitle(item) {
  return item?.title || item?.name || ''
}

async function GetMediaDbInfos() {
  let api = '/api/v1/item/list'

  let _data = {
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
  let res = await COMMON.requests("POST", api, true, _data);
  MediaDbInfo.value = res.list || []

}

async function GetMediaDbCount() {
  let api = '/api/v1/mediadb/sum'
  const res = await COMMON.requests("GET", api, true);
  const count = Number(res?.[guid.value] || 0)
  totalCount.value = Number.isFinite(count) ? count : 0
  if (totalCount.value > 0) {
    size.value = totalCount.value
  }
}

async function handleChange() {
  await GetMediaDbInfos();
}

async function setSortMode(value) {
  MediaDbData.sort_column = value
  await GetMediaDbInfos()
}

async function setSortOrder(value) {
  MediaDbData.sort_type = value
  await GetMediaDbInfos()
}

onBeforeRouteUpdate(async (to, from) => {
  guid.value = to.query.gallery_uid;
  // gallery_type.value = to.query.gallery_type;
  await GetMediaDbCount();
  await GetMediaDbInfos();
});

onMounted(async () => {
  // 获取每个分类的列表
  await GetMediaDbCount();
  await GetMediaDbInfos();

})
</script>

<template>

  <div class="content">
    <div class="list-toolbar">
      <div>
        <div class="list-title">{{ galleryTitle }}</div>
        <div class="list-subtitle">{{ listSubtitle }}</div>
      </div>
      <div class="seriesTab-list">
        <div class="seriesTab-item">
          <div class="sort-menu">
            <input id="video-list-sort-toggle" class="sort-toggle" type="checkbox">
            <label class="sort-trigger" for="video-list-sort-toggle" aria-label="排序">
              <i class='bx bx-align-middle'></i>
            </label>
            <div class="sort-popover" role="dialog" aria-label="排序">
              <div class="sort-popover-header">排序</div>
              <div class="sort-title">
                排序方式
              </div>
              <div class="sort-list">
                <label class="sort-item" v-for="item in modes" :key="item.value">
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
      </div>
    </div>
    <div class="card-show-content view-card-list">
      <div class="view-item" v-for="item in MediaDbInfo" :key="item.guid">
        <router-link class="view-item-link" :to="{
                    path: '/video', query: {
                        guid: item.guid,
                        gallery_type: item.type
                    }
                }">
          <div class="view-item-header">
            <div class="view-item-tag-list">
              <div v-if="formatRating(item)" class="view-item-tag rating">{{ formatRating(item) }}</div>
              <div v-if="item.played" class="view-item-tag count">
                <i class='bx bx-check'></i>
              </div>
            </div>
          </div>
          <img v-if="item.poster !== undefined" loading="lazy" class="carousel-img"
               v-lazy=' COMMON.imgUrl + "/92/17/" + item.poster + "?w=200"'>
          <img v-else loading="lazy" class='carousel-img' v-lazy="'/images/not_video.jpg'">
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
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 28px;
}

.list-title {
  color: var(--fn-text);
  font-size: 22px;
  font-weight: 750;
}

.list-subtitle {
  margin-top: 4px;
  color: var(--fn-soft);
  font-size: 13px;
}

.seriesTab-list {
  display: flex;
  align-items: center;
  gap: 8px;
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

.view-card-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  grid-gap: 26px 20px;
  padding: 0;
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

.view-card-list img.carousel-img {
  width: 100%;
  aspect-ratio: 2/3;
  border-radius: 8px;
  object-fit: cover;
  background: var(--fn-panel);
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.08);
  transition: transform 0.18s ease, box-shadow 0.18s ease, filter 0.18s ease;
}

.view-item-title {
  color: var(--fn-text);
  font-size: 14px;
  font-weight: 650;
  margin-top: 10px;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
  padding: 0 4px;
}

.view-item-year {
  min-height: 18px;
  margin-top: 2px;
  color: var(--fn-soft);
  font-size: 13px;
  line-height: 18px;
}

.view-card-list .view-item {
  transition: transform 0.18s ease;
}

.view-card-list .view-item:hover {
  transform: translateY(-2px);
}

.view-card-list .view-item:hover img.carousel-img {
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.14);
  filter: brightness(1.02);
}

.view-item-header {
  position: absolute;
  inset: 0 0 auto;
  padding: 7px;
  z-index: 2;
  pointer-events: none;
}

.view-item-tag-list {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  min-height: 22px;
}

.view-item-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 34px;
  height: 22px;
  padding: 0 7px;
  color: #f8c52c;
  background: rgba(0, 0, 0, 0.72);
  border-radius: 6px;
  font-size: 13px;
  font-weight: 800;
  line-height: 1;
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

.rating {
  color: #f8c52c;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .view-card-list {
    grid-template-columns: repeat(auto-fill, minmax(118px, 1fr));
    grid-gap: 18px 12px;
  }

  .view-item-title {
    font-size: 13px;
    margin-top: 6px;
  }

  .view-item-header {
    padding: 4px;
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
