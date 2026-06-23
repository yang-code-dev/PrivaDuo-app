<template>
  <view class="page">
    <app-card title="心愿清单" desc="双方均可新增、勾选完成、取消完成与删除，已完成条目自动沉底归档。">
      <view class="wish-input">
        <input v-model="draftTitle" data-testid="wish-title-input" class="wish-input__field" maxlength="50" placeholder="添加一个新的共同心愿" />
        <button data-testid="wish-add-btn" class="wish-input__btn" @click="submitWish">添加</button>
      </view>

      <view v-if="wishes.length" class="wish-list">
        <view v-for="item in wishes" :key="item.id" class="wish-item" :class="{ 'wish-item--done': item.completed }">
          <view class="wish-item__main" @click="toggleItem(item.id)">
            <view class="wish-item__check">{{ item.completed ? '✓' : '' }}</view>
            <view>
              <text class="wish-item__title">{{ item.title }}</text>
              <text class="wish-item__meta">{{ item.completed ? '已完成，已归档到底部' : '待完成' }}</text>
            </view>
          </view>
          <text class="wish-item__delete" @click.stop="removeItem(item.id)">删除</text>
        </view>
      </view>
      <app-empty-state v-else title="还没有共同心愿" desc="先写下一个小约定，清单会陪你们一起慢慢实现。" action-text="新增心愿" @action="submitWish" />
    </app-card>
  </view>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import AppCard from '@/components/AppCard.vue'
import AppEmptyState from '@/components/AppEmptyState.vue'
import { deleteWish, getRecords, saveWish, toggleWish } from '@/services/records'
import { useUserStore } from '@/stores/user'
import { guardPageAccess } from '@/utils/route-guard'
import { sortWishItems } from '@/utils/records'

const userStore = useUserStore()
const wishes = ref([])
const draftTitle = ref('')

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

function syncRecords(result) {
  wishes.value = sortWishItems(result.wishes || [])
}

async function bootstrap() {
  try {
    const result = await getRecords(getSession())
    syncRecords(result)
  } catch (error) {
    showToast(error.message || '心愿清单加载失败')
  }
}

async function submitWish() {
  if (!draftTitle.value.trim()) {
    showToast('心愿标题不能为空')
    return
  }
  try {
    const result = await saveWish({ title: draftTitle.value }, getSession())
    syncRecords(result)
    draftTitle.value = ''
  } catch (error) {
    showToast(error.message || '心愿创建失败')
  }
}

async function toggleItem(id) {
  try {
    const result = await toggleWish({ id }, getSession())
    syncRecords(result)
  } catch (error) {
    showToast(error.message || '状态切换失败')
  }
}

async function removeItem(id) {
  try {
    const result = await deleteWish({ id }, getSession())
    syncRecords(result)
  } catch (error) {
    showToast(error.message || '心愿删除失败')
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

.wish-input,
.wish-item,
.wish-item__main {
  display: flex;
  align-items: center;
}

.wish-input {
  gap: 12px;
}

.wish-input__field {
  flex: 1;
  height: 44px;
  padding: 0 14px;
  border-radius: 12px;
  background: $surface-soft;
  color: $text-primary;
}

.wish-input__btn {
  min-width: 96px;
  background: $brand-color;
  color: #ffffff;
  border-radius: 12px;
}

.wish-list {
  margin-top: 20px;
}

.wish-item + .wish-item {
  margin-top: 12px;
}

.wish-item {
  justify-content: space-between;
  padding: 16px;
  border-radius: 16px;
  background: $surface-soft;
  border: 1px solid $line-color;
}

.wish-item--done {
  opacity: 0.72;
}

.wish-item__main {
  gap: 12px;
  flex: 1;
}

.wish-item__check {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid $brand-color-strong;
  color: $brand-color-strong;
  font-size: 12px;
  background: $surface-color;
}

.wish-item__title,
.wish-item__meta {
  display: block;
}

.wish-item__title {
  font-size: 15px;
  font-weight: 600;
  color: $text-primary;
}

.wish-item__meta,
.wish-item__delete {
  color: $text-secondary;
}

.wish-item__meta {
  margin-top: 6px;
  font-size: 12px;
}

.wish-item__delete {
  margin-left: 12px;
  font-size: 13px;
}
</style>
