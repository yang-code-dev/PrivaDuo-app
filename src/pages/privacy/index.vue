<template>
  <view class="page">
    <view class="card">
      <text class="card__title">隐私管理</text>
      <text class="card__desc">本应用仅服务于 2 个账号的一对一双人空间，以下策略默认强制生效，不提供关闭入口。</text>

      <view v-for="item in rules" :key="item.title" class="rule-item">
        <text class="rule-item__title">{{ item.title }}</text>
        <text class="rule-item__desc">{{ item.desc }}</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { onShow } from '@dcloudio/uni-app'
import { guardPageAccess } from '@/utils/route-guard'

const rules = [
  {
    title: '仅双人可见',
    desc: '聊天、动态、记录、相册和关系管理内容仅绑定双方可访问，不开放第三人加入。',
  },
  {
    title: '本地相册留存',
    desc: '专属相册只聚合当前设备上的聊天与动态图片，访问记录不会同步到云端。',
  },
  {
    title: '无外部分享',
    desc: '全模块移除转发、导出、系统分享入口，图片仅支持应用内查看。',
  },
  {
    title: '解绑不删历史',
    desc: '解绑需要双方确认后才生效，历史聊天、动态、记录数据会完整保留。',
  },
]

onShow(() => {
  if (typeof uni.hideShareMenu === 'function') {
    uni.hideShareMenu()
  }
  if (!guardPageAccess({ requireLogin: true })) return
})
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
}

.card {
  padding: 20px;
  background: $surface-color;
  border-radius: 16px;
  border: 1px solid $line-color;
  box-shadow: $shadow-soft;
}

.card__title,
.card__desc,
.rule-item__title,
.rule-item__desc {
  display: block;
}

.card__title {
  font-size: 16px;
  color: $text-primary;
  font-weight: 600;
}

.card__desc {
  margin-top: 6px;
  font-size: 12px;
  color: $text-secondary;
  line-height: 1.6;
}

.rule-item {
  margin-top: 16px;
  padding: 16px;
  border-radius: 16px;
  background: $surface-soft;
  border: 1px solid $line-color;
}

.rule-item__title {
  font-size: 14px;
  color: $text-primary;
  font-weight: 600;
}

.rule-item__desc {
  margin-top: 4px;
  font-size: 12px;
  color: $text-secondary;
  line-height: 1.5;
}
</style>
