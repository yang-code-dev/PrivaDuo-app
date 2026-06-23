<template>
  <view class="page">
    <app-card title="共同日记" desc="倒序时间轴展示，支持按月份筛选、图文混排、双向编辑删除。">
      <view class="toolbar">
        <picker :range="monthOptions" @change="handleMonthChange">
          <view class="toolbar__picker">{{ selectedMonth }}</view>
        </picker>
        <button data-testid="diary-add-btn" class="toolbar__btn" @click="openEditor()">新增日记</button>
      </view>

      <view v-if="groupedDiaries.length" class="timeline">
        <view v-for="group in groupedDiaries" :key="group.label" class="timeline-group">
          <text class="timeline-group__label">{{ group.label }}</text>
          <view v-for="item in group.items" :key="item.id" class="timeline-card">
            <text class="timeline-card__title">{{ item.title }}</text>
            <text class="timeline-card__meta">{{ item.authorNickname }} · {{ formatTime(item.writtenAt) }}</text>
            <text class="timeline-card__content">{{ item.content }}</text>
            <view v-if="item.images?.length" class="timeline-card__images">
              <image
                v-for="(image, index) in item.images"
                :key="`${image}-${index}`"
                :src="image"
                class="timeline-card__image"
                mode="aspectFill"
                @click="previewImages(item.images, index)"
              />
            </view>
            <view class="timeline-card__actions">
              <text @click="openEditor(item)">编辑</text>
              <text class="timeline-card__danger" @click="removeDiary(item.id)">删除</text>
            </view>
          </view>
        </view>
      </view>
      <app-empty-state v-else title="还没有共同日记" desc="记录第一篇专属回忆后，这里会沿时间轴慢慢被填满。" action-text="新增日记" @action="openEditor()" />
    </app-card>

    <view v-if="editorVisible" class="editor-mask">
      <view class="editor">
        <view class="editor__header">
          <text class="editor__title">{{ editorForm.id ? '编辑日记' : '新增日记' }}</text>
          <text class="editor__close" @click="closeEditor">关闭</text>
        </view>
        <input v-model="editorForm.title" data-testid="diary-title-input" class="editor__input" maxlength="30" placeholder="请输入日记标题" />
        <textarea v-model="editorForm.content" data-testid="diary-content-input" class="editor__textarea" maxlength="500" placeholder="输入今天想记录的内容" />
        <button class="editor__add-image" @click="chooseDiaryImages">添加图片</button>
        <view v-if="editorForm.images.length" class="editor__images">
          <image
            v-for="(image, index) in editorForm.images"
            :key="`${image}-${index}`"
            :src="image"
            class="editor__image"
            mode="aspectFill"
            @click="previewImages(editorForm.images, index)"
          />
        </view>
        <button data-testid="diary-submit-btn" class="editor__submit" @click="submitDiary">保存日记</button>
      </view>
    </view>

    <app-image-viewer
      :visible="viewer.visible"
      :images="viewer.images"
      :current-index="viewer.current"
      @close="closeViewer"
      @change="viewer.current = $event"
    />
  </view>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import AppCard from '@/components/AppCard.vue'
import AppEmptyState from '@/components/AppEmptyState.vue'
import AppImageViewer from '@/components/AppImageViewer.vue'
import { deleteDiary, getRecords, saveDiary } from '@/services/records'
import { useUserStore } from '@/stores/user'
import { guardPageAccess } from '@/utils/route-guard'
import { formatMonthKey, getMonthOptions, normalizeRecordText } from '@/utils/records'

const userStore = useUserStore()
const diaries = ref([])
const selectedMonth = ref('全部')
const monthOptions = ref(['全部'])
const editorVisible = ref(false)
const editorForm = reactive({
  id: '',
  title: '',
  content: '',
  images: [],
})
const viewer = reactive({
  visible: false,
  images: [],
  current: 0,
})

function getSession() {
  return {
    accessToken: userStore.profile.accessToken,
    sessionSecret: userStore.profile.sessionSecret,
  }
}

function showToast(message) {
  uni.showToast({
    title: message,
    icon: 'none',
  })
}

function formatTime(timestamp) {
  const date = new Date(Number(timestamp || 0))
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hour = `${date.getHours()}`.padStart(2, '0')
  const minute = `${date.getMinutes()}`.padStart(2, '0')
  return `${month}-${day} ${hour}:${minute}`
}

function syncRecords(result) {
  diaries.value = result.diaries || []
  monthOptions.value = getMonthOptions(diaries.value, 'writtenAt')
  if (!monthOptions.value.includes(selectedMonth.value)) {
    selectedMonth.value = '全部'
  }
}

async function bootstrap() {
  try {
    const result = await getRecords(getSession())
    syncRecords(result)
  } catch (error) {
    showToast(error.message || '日记加载失败')
  }
}

const filteredDiaries = computed(() => {
  if (selectedMonth.value === '全部') return diaries.value
  return diaries.value.filter((item) => formatMonthKey(item.writtenAt) === selectedMonth.value)
})

const groupedDiaries = computed(() => {
  const map = new Map()
  filteredDiaries.value.forEach((item) => {
    if (!map.has(item.groupLabel)) {
      map.set(item.groupLabel, [])
    }
    map.get(item.groupLabel).push(item)
  })

  return [...map.entries()].map(([label, items]) => ({
    label,
    items,
  }))
})

function handleMonthChange(event) {
  selectedMonth.value = monthOptions.value[event.detail.value]
}

function openEditor(item = null) {
  editorVisible.value = true
  editorForm.id = item?.id || ''
  editorForm.title = item?.title || ''
  editorForm.content = item?.content || ''
  editorForm.images = item?.images ? [...item.images] : []
}

function closeEditor() {
  editorVisible.value = false
  editorForm.id = ''
  editorForm.title = ''
  editorForm.content = ''
  editorForm.images = []
}

function previewImages(images = [], index = 0) {
  viewer.images = [...images]
  viewer.current = index
  viewer.visible = true
}

function closeViewer() {
  viewer.visible = false
  viewer.images = []
  viewer.current = 0
}

async function chooseDiaryImages() {
  try {
    const result = await new Promise((resolve, reject) => {
      uni.chooseImage({
        count: 9,
        sizeType: ['compressed'],
        success: resolve,
        fail: reject,
      })
    })
    editorForm.images = [...editorForm.images, ...(result.tempFilePaths || [])].slice(0, 9)
  } catch (error) {
    showToast('图片选择已取消')
  }
}

async function submitDiary() {
  const title = normalizeRecordText(editorForm.title)
  const content = normalizeRecordText(editorForm.content)
  if (!title || !content) {
    showToast('日记标题和内容不能为空')
    return
  }

  try {
    const result = await saveDiary(
      {
        id: editorForm.id,
        title,
        content,
        images: editorForm.images,
      },
      getSession(),
    )
    syncRecords(result)
    closeEditor()
  } catch (error) {
    showToast(error.message || '日记保存失败')
  }
}

async function removeDiary(id) {
  try {
    const result = await deleteDiary({ id }, getSession())
    syncRecords(result)
  } catch (error) {
    showToast(error.message || '日记删除失败')
  }
}

onMounted(() => {
  if (typeof uni.hideShareMenu === 'function') {
    uni.hideShareMenu()
  }
  if (!guardPageAccess({ requireBound: true })) return
  bootstrap()
})
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
}

.toolbar,
.timeline-card__actions,
.editor__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.toolbar {
  margin-bottom: 20px;
}

.toolbar__picker,
.toolbar__btn,
.editor__submit,
.editor__add-image {
  border-radius: 12px;
}

.toolbar__picker {
  padding: 10px 14px;
  background: $surface-soft;
  color: $text-primary;
  border: 1px solid $line-color;
}

.toolbar__btn,
.editor__submit {
  background: $brand-color;
  color: #ffffff;
}

.timeline-group + .timeline-group {
  margin-top: 20px;
}

.timeline-group__label {
  display: inline-block;
  padding: 5px 10px;
  border-radius: 999rpx;
  background: $brand-color-weak;
  color: $brand-color-strong;
  font-size: 12px;
}

.timeline-card {
  margin-top: 12px;
  padding: 18px;
  border-radius: 16px;
  background: $surface-soft;
  border: 1px solid $line-color;
}

.timeline-card__title,
.timeline-card__meta,
.timeline-card__content {
  display: block;
}

.timeline-card__title {
  font-size: 16px;
  font-weight: 600;
  color: $text-primary;
}

.timeline-card__meta {
  margin-top: 6px;
  font-size: 12px;
  color: $text-secondary;
}

.timeline-card__content {
  margin-top: 10px;
  line-height: 1.8;
  color: $text-primary;
  font-size: 13px;
}

.timeline-card__images,
.editor__images {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 12px;
}

.timeline-card__image,
.editor__image {
  width: 100%;
  height: 92px;
  border-radius: 12px;
}

.timeline-card__actions {
  margin-top: 14px;
  color: $text-secondary;
  font-size: 13px;
}

.timeline-card__danger {
  color: $danger-color;
}

.editor-mask {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  align-items: flex-end;
  background: $mask-color;
}

.editor {
  width: 100%;
  padding: 20px 16px calc(20px + env(safe-area-inset-bottom));
  border-radius: 12px 12px 0 0;
  background: $surface-color;
}

.editor__input,
.editor__textarea {
  width: 100%;
  margin-top: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  background: $surface-soft;
  color: $text-primary;
}

.editor__textarea {
  min-height: 120px;
}

.editor__add-image {
  margin-top: 12px;
  background: $brand-color-weak;
  color: $text-primary;
}

.editor__submit {
  margin-top: 14px;
}
</style>
