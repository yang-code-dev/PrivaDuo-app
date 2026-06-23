<template>
  <view class="content">
    <view class="hero">
      <image class="logo" src="/static/logo.png" mode="aspectFit" />
      <text class="title">{{ title }}</text>
      <text class="desc">这里已经同步到当前项目的温柔治愈风视觉基线。</text>
    </view>
  </view>
</template>

<script>
export default {
  data() {
    return {
      title: '双人专属空间',
    }
  },
  onLoad() {},
  methods: {},
}
</script>

<style lang="scss">
.content {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: var(--color-page-bg);
}

.hero {
  width: 100%;
  max-width: 320px;
  padding: 24px 20px;
  border-radius: 16px;
  background: var(--color-surface);
  border: 1px solid var(--color-line);
  box-shadow: var(--shadow-soft);
  text-align: center;
}

.logo {
  width: 96px;
  height: 96px;
  margin: 0 auto 14px;
}

.title {
  display: block;
  font-size: 20px;
  color: var(--color-text);
  font-weight: 600;
}

.desc {
  display: block;
  margin-top: 8px;
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.6;
}
</style>
