<template>
  <view class="page">
    <app-card title="纪念日管理" desc="双方均可新增、编辑、删除纪念日，剩余天数越少越靠前。">
      <view class="toolbar">
        <text class="toolbar__desc">提醒仅推送到绑定双方设备端</text>
        <button data-testid="anniversary-add-btn" class="toolbar__btn" @click="openEditor()">新增纪念日</button>
      </view>

      <view v-if="anniversaries.length" class="anniversary-list">
        <view v-for="item in anniversaries" :key="item.id" class="anniversary-card">
          <view class="anniversary-card__head">
            <view>
              <text class="anniversary-card__title">{{ item.name }}</text>
              <text class="anniversary-card__meta">{{ item.category }} · 提前 {{ item.remindDaysBefore }} 天提醒</text>
            </view>
            <view class="anniversary-card__badge">剩余 {{ item.remainingDays }} 天</view>
          </view>
          <text class="anniversary-card__date">{{ formatDate(item.anniversaryDate) }}</text>
          <view class="anniversary-card__actions">
            <text @click="openEditor(item)">编辑</text>
            <text class="danger" @click="removeItem(item.id)">删除</text>
          </view>
        </view>
      </view>
      <app-empty-state v-else title="还没有纪念日" desc="先添加一个重要日子，让倒计时卡片开始记录你们的期待。" action-text="新增纪念日" @action="openEditor()" />
    </app-card>

    <view v-if="editorVisible" class="editor-mask">
      <view class="editor">
        <view class="editor__header">
          <text class="editor__title">{{ form.id ? '编辑纪念日' : '新增纪念日' }}</text>
          <text class="editor__close" @click="closeEditor">关闭</text>
        </view>
        <input v-model="form.name" data-testid="anniversary-name-input" class="editor__input" maxlength="20" placeholder="纪念日名称" />
        <input v-model="form.category" data-testid="anniversary-category-input" class="editor__input" maxlength="12" placeholder="分类标签，如 爱情 / 旅行" />
        <picker mode="date" @change="handleDateChange">
          <view class="editor__input">{{ form.dateLabel || '选择日期' }}</view>
        </picker>
        <input v-model="form.remindDaysBefore" data-testid="anniversary-remind-input" class="editor__input" type="number" maxlength="3" placeholder="提前提醒天数" />
        <button data-testid="anniversary-submit-btn" class="editor__submit" @click="submit">保存纪念日</button>
      </view>
    </view>
  </view>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import AppCard from '@/components/AppCard.vue'
import AppEmptyState from '@/components/AppEmptyState.vue'
import { deleteAnniversary, getRecords, saveAnniversary } from '@/services/records'
import { useUserStore } from '@/stores/user'
import { guardPageAccess } from '@/utils/route-guard'
import { sortAnniversaries } from '@/utils/records'

const userStore = useUserStore()
const anniversaries = ref([])
const editorVisible = ref(false)
const form = ref({
  id: '',
  name: '',
  category: '',
  anniversaryDate: 0,
  dateLabel: '',
  remindDaysBefore: '3',
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

function formatDate(timestamp) {
  const date = new Date(Number(timestamp || 0))
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function syncRecords(result) {
  anniversaries.value = sortAnniversaries(result.anniversaries || [])
}

async function bootstrap() {
  try {
    const result = await getRecords(getSession())
    syncRecords(result)
  } catch (error) {
    showToast(error.message || '纪念日加载失败')
  }
}

function openEditor(item = null) {
  editorVisible.value = true
  form.value = {
    id: item?.id || '',
    name: item?.name || '',
    category: item?.category || '',
    anniversaryDate: item?.anniversaryDate || 0,
    dateLabel: item?.anniversaryDate ? formatDate(item.anniversaryDate) : '',
    remindDaysBefore: `${item?.remindDaysBefore ?? 3}`,
  }
}

function closeEditor() {
  editorVisible.value = false
  form.value = {
    id: '',
    name: '',
    category: '',
    anniversaryDate: 0,
    dateLabel: '',
    remindDaysBefore: '3',
  }
}

function handleDateChange(event) {
  form.value.dateLabel = event.detail.value
  form.value.anniversaryDate = new Date(`${event.detail.value}T00:00:00`).getTime()
}

async function submit() {
  if (!form.value.name.trim() || !form.value.category.trim() || !form.value.anniversaryDate) {
    showToast('名称、分类和日期不能为空')
    return
  }
  try {
    const result = await saveAnniversary(
      {
        id: form.value.id,
        name: form.value.name,
        category: form.value.category,
        anniversaryDate: form.value.anniversaryDate,
        remindDaysBefore: Number(form.value.remindDaysBefore || 0),
      },
      getSession(),
    )
    syncRecords(result)
    closeEditor()
  } catch (error) {
    showToast(error.message || '纪念日保存失败')
  }
}

async function removeItem(id) {
  try {
    const result = await deleteAnniversary({ id }, getSession())
    syncRecords(result)
  } catch (error) {
    showToast(error.message || '纪念日删除失败')
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
.anniversary-card__head,
.anniversary-card__actions,
.editor__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.toolbar {
  margin-bottom: 20px;
}

.toolbar__desc {
  color: $text-secondary;
  font-size: 12px;
  line-height: 1.6;
}

.toolbar__btn,
.editor__submit {
  background: $brand-color;
  color: #ffffff;
  border-radius: 12px;
}

.anniversary-card + .anniversary-card {
  margin-top: 12px;
}

.anniversary-card {
  padding: 18px;
  border-radius: 16px;
  background: $surface-soft;
  border: 1px solid $line-color;
}

.anniversary-card__title,
.anniversary-card__meta,
.anniversary-card__date {
  display: block;
}

.anniversary-card__title {
  font-size: 16px;
  font-weight: 600;
  color: $text-primary;
}

.anniversary-card__meta,
.anniversary-card__date {
  margin-top: 6px;
  color: $text-secondary;
  font-size: 12px;
}

.anniversary-card__badge {
  padding: 6px 10px;
  border-radius: 999rpx;
  background: $brand-color-weak;
  color: $brand-color-strong;
  font-size: 12px;
}

.anniversary-card__actions {
  margin-top: 14px;
  color: $text-secondary;
  font-size: 13px;
}

.danger {
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

.editor__input {
  margin-top: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  background: $surface-soft;
  color: $text-primary;
}

.editor__submit {
  margin-top: 14px;
}
</style>
