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
const showSort = ref(false);
const size = ref(48);
const page = ref(1);
const MediaDbInfo = ref(null);
const galleryTitle = computed(() => {
  return MediaDbData.list.find(item => item.guid === guid.value)?.title || '媒体库'
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
    "exclude_grouped_video": page.value,
    "sort_type": MediaDbData.sort_type,
    "sort_column": MediaDbData.sort_column,
    "page_size": size.value
  }
  let res = await COMMON.requests("POST", api, true, _data);
  MediaDbInfo.value = res.list

}

async function handleChange() {
  page.value = 1;
  await GetMediaDbInfos();
}

async function BackPage() {
  this.page = this.page - 1;
  if (this.page <= 0) {
    COMMON.ShowMsg("已经是第1页啦!")
    this.page = 1;
  }
  await GetMediaDbInfos();
}

async function NextPage() {
  this.page = this.page + 1;
  await GetMediaDbInfos();
}

function openVideoItem(item) {
  proxy.$router.push({
    path: '/video',
    query: {
      guid: item.guid,
      gallery_type: item.type
    }
  })
}

onBeforeRouteUpdate(async (to, from) => {
  guid.value = to.query.gallery_uid;
  // gallery_type.value = to.query.gallery_type;
  await GetMediaDbInfos();
});

onMounted(async () => {
  // 获取每个分类的列表
  await GetMediaDbInfos();

})
</script>

<template>

  <div class="content">
    <div class="list-toolbar">
      <div>
        <div class="list-title">{{ galleryTitle }}</div>
        <div class="list-subtitle">第 {{ page }} 页</div>
      </div>
      <div class="seriesTab-list">
        <div class="seriesTab-item">
          <n-button @click="BackPage()" quaternary circle>
            <i class='bx bx-left-arrow-alt'></i>
          </n-button>
        </div>
        <div class="seriesTab-item">
          <n-button @click="NextPage()" quaternary circle>
            <i class='bx bx-right-arrow-alt'></i>
          </n-button>
        </div>
        <div class="seriesTab-item">
          <n-button @click="showSort = !showSort" quaternary circle>
            <i class='bx bx-align-middle'></i>
          </n-button>
        </div>
      </div>
    </div>
    <div class="card-show-content view-card-list">
      <div class="view-item" v-for="item in MediaDbInfo" :key="item.guid" @click="openVideoItem(item)">
        <router-link :to="{
                    path: '/video', query: {
                        guid: item.guid,
                        gallery_type: item.type
                    }
                }">
          <div class="view-item-header">
            <div class="view-item-tag-list">
              <!--              <div class="view-item-tag rating">{{ isNaN(Math.floor(item.vote_average * 100) / 100) ?-->
              <!--                  "" :-->
              <!--                  Math.floor(item.vote_average * 100) / 100-->
              <!--                }}-->
              <!--              </div>-->
              <div v-if="item.played" class="view-item-tag count">
                <i class='bx bx-check'></i>
              </div>
            </div>
          </div>
          <img v-if="item.poster !== undefined" loading="lazy" class="carousel-img"
               v-lazy=' COMMON.imgUrl + "/92/17/" + item.poster + "?w=200"'>
          <img v-else loading="lazy" class='carousel-img' v-lazy="'/images/not_video.jpg'">
          <div class="view-item-title">
            {{ item.title }}
          </div>
        </router-link>
      </div>
    </div>
    <n-modal v-model:show="showSort" transform-origin="center">
      <n-card style="width: 600px;" title="排序" :bordered="false" size="huge" role="dialog" aria-modal="true">
        <template #header-extra>
          <n-button @click="showSort = !showSort" strong secondary circle>
            <i class='bx bx-x'></i>
          </n-button>
        </template>
        <div class="sort-list">
          <div class="sort-title">
            排序方式
          </div>
          <div class="sort-list">
            <n-radio-group v-model:value="mode" name="radiogroup">
              <n-space vertical>
                <n-radio @change="handleChange" class="sort-item" v-for="item in modes"
                         :checked="mode === item.value" :key="item.value" :value="item.value">
                  {{ item.label }}
                </n-radio>
              </n-space>
            </n-radio-group>
          </div>
          <div class="sort-title">
            排序顺序
          </div>
          <div class="sort-list">
            <n-radio-group v-model:value="order" name="radiogroup">
              <n-space vertical>
                <n-radio @change="handleChange" class="sort-item" v-for="item in orders"
                         :checked="order === item.value" :key="item.value" :value="item.value">
                  {{ item.label }}
                </n-radio>
              </n-space>
            </n-radio-group>
          </div>
        </div>
      </n-card>
    </n-modal>
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

.seriesTab-list :deep(.n-button) {
  width: 36px;
  height: 36px;
  color: var(--fn-text);
  background: var(--fn-top-control);
  border: 1px solid var(--fn-border);
}

.seriesTab-list :deep(.n-button:hover) {
  background: var(--fn-top-control-hover);
}

.sort-title {
  color: var(--fn-text);
  font-size: 15px;
  font-weight: 700;
  margin-top: 12px;
  margin-bottom: 12px;
}

.sort-list .sort-item {
  font-size: 14px;
  margin-top: 4px;
  margin-bottom: 4px;
}

.view-card-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 176px));
  grid-gap: 24px 20px;
  padding: 0;
}

.view-item {
  text-align: center;
  position: relative;
  color: var(--fn-text);
  cursor: pointer;
}

.view-item a {
  color: inherit;
}

.view-card-list img.carousel-img {
  width: 100%;
  aspect-ratio: 11/16;
  border-radius: 8px;
  object-fit: cover;
  background: var(--fn-panel);
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.view-item-title {
  color: var(--fn-text);
  font-size: 14px;
  font-weight: 650;
  margin-top: 8px;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  padding: 0 4px;
}

.view-card-list .view-item {
  transition: transform 0.18s ease;
}

.view-card-list .view-item:hover {
  transform: translateY(-3px);
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
  justify-content: flex-end;
  gap: 4px;
}

.view-item-tag-list .count {
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
  color: yellow;
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

  /* 调整模态框在移动端的样式 */
  :deep(.n-card) {
    width: 90% !important;
    max-width: 400px;
  }

  :deep(.n-modal) {
    padding: 16px;
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
