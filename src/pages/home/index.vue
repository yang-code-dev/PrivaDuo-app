<template>
  <view class="page" @contextmenu.prevent>
    <view class="page__section">
      <anniversary-countdown-card :data="nearestAnniversary" :countdown="countdown" />
    </view>

    <view class="page__section">
      <moment-composer
        :visible="composerVisible"
        :content="publishForm.content"
        :images="publishForm.images"
        :submitting="publishing"
        :avatar="userStore.profile.avatar"
        :nickname="userStore.profile.nickname"
        @open="handleOpenComposer"
        @close="closeComposer"
        @update:content="publishForm.content = $event"
        @choose-images="handleChooseImages"
        @remove-image="removeImage"
        @preview="handlePreviewDraft"
        @submit="handlePublish"
      />
    </view>

    <view class="page__section page__section--tools">
      <view class="tool-item" :class="{ 'tool-item--disabled': !coupleStore.isBound }" @click="handleNavigate(ROUTES.diaryDetail)">
        <text data-testid="home-diary-btn">共同日记</text>
      </view>
      <view class="tool-item" :class="{ 'tool-item--disabled': !coupleStore.isBound }" @click="handleNavigate(ROUTES.anniversaryDetail)">
        <text>纪念日</text>
      </view>
      <view class="tool-item" :class="{ 'tool-item--disabled': !coupleStore.isBound }" @click="handleNavigate(ROUTES.wishlist)">
        <text>心愿清单</text>
      </view>
      <view class="tool-item" :class="{ 'tool-item--disabled': !coupleStore.isBound }" @click="handleNavigate(ROUTES.albumDetail)">
        <text>共享相册</text>
      </view>
    </view>

    <view class="page__section">
      <view class="section-head">
        <text class="section-head__title">最新动态</text>
        <text class="section-head__desc">{{ refreshing ? '刷新中...' : hasMore ? '下拉刷新，继续滚动加载' : '已经到底了' }}</text>
      </view>

      <binding-gate :active="!coupleStore.isBound" message="未绑定前只能查看绑定引导，无法发布、点赞或评论动态。">
        <app-loading v-if="refreshing && !moments.length" mode="skeleton" text="正在刷新最新动态" />
        <view v-else-if="moments.length" class="waterfall">
          <view class="waterfall__column">
            <moment-card
              v-for="item in waterfallColumns[0]"
              :key="item.id"
              :item="item"
              :current-uid="userStore.profile.uid"
              @like="handleLike"
              @comment="openCommentDrawer"
              @preview-image="handlePreviewMomentImage"
            />
          </view>
          <view class="waterfall__column">
            <moment-card
              v-for="item in waterfallColumns[1]"
              :key="item.id"
              :item="item"
              :current-uid="userStore.profile.uid"
              @like="handleLike"
              @comment="openCommentDrawer"
              @preview-image="handlePreviewMomentImage"
            />
          </view>
        </view>
        <app-empty-state
          v-else
          title="还没有动态"
          desc="发布今天的第一条专属记录，让日常从此刻开始。"
          action-text="去发布动态"
          @action="handleOpenComposer"
        />
      </binding-gate>
    </view>

    <moment-comment-drawer
      :visible="commentDrawerVisible"
      :moment="activeMoment"
      :draft="commentDraft"
      :submitting="commentSubmitting"
      @close="closeCommentDrawer"
      @update:draft="commentDraft = $event"
      @submit="submitComment"
    />

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
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { onPullDownRefresh, onReachBottom } from '@dcloudio/uni-app'
import AnniversaryCountdownCard from '@/components/AnniversaryCountdownCard.vue'
import AppEmptyState from '@/components/AppEmptyState.vue'
import AppImageViewer from '@/components/AppImageViewer.vue'
import AppLoading from '@/components/AppLoading.vue'
import BindingGate from '@/components/BindingGate.vue'
import MomentCard from '@/components/MomentCard.vue'
import MomentCommentDrawer from '@/components/MomentCommentDrawer.vue'
import MomentComposer from '@/components/MomentComposer.vue'
import { addMomentComment, getHomeFeed, publishMoment, toggleMomentLike } from '@/services/daily'
import { useCoupleStore } from '@/stores/couple'
import { useUserStore } from '@/stores/user'
import { formatCountdown, splitWaterfallList } from '@/utils/daily'
import { chooseMomentImages, validatePublishPayload } from '@/utils/image'
import { guardPageAccess } from '@/utils/route-guard'
import { ROUTES, navigateTo } from '@/utils/router'

const userStore = useUserStore()
const coupleStore = useCoupleStore()
const nearestAnniversary = ref(null)
const countdown = ref(formatCountdown(0))
const composerVisible = ref(false)
const publishing = ref(false)
const refreshing = ref(false)
const loadingMore = ref(false)
const page = ref(1)
const hasMore = ref(false)
const moments = ref([])
const publishForm = reactive({
  content: '',
  images: [],
})
const commentDrawerVisible = ref(false)
const commentDraft = ref('')
const commentSubmitting = ref(false)
const activeMomentId = ref('')
const viewer = reactive({
  visible: false,
  images: [],
  current: 0,
})
let countdownTimer = null

// #region debug-point H1:moment-submit-payload
function reportHomeImageDebug(msg, data = {}) {
  if (
    typeof window === 'undefined'
    || !['localhost', '127.0.0.1'].includes(window.location?.hostname || '')
  ) {
    return
  }
  fetch('http://127.0.0.1:7777/event', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sessionId: 'web-image-upload',
      runId: 'pre-fix',
      hypothesisId: 'H1',
      location: 'src/pages/home/index.vue',
      msg: `[DEBUG] ${msg}`,
      data,
      ts: Date.now(),
    }),
  }).catch(() => {})
}
// #endregion

const waterfallColumns = computed(() => splitWaterfallList(moments.value))
const activeMoment = computed(() => moments.value.find((item) => item.id === activeMomentId.value) || null)

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

function stopCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
}

function startCountdown() {
  stopCountdown()
  if (!nearestAnniversary.value?.targetTimestamp) {
    countdown.value = formatCountdown(0)
    return
  }
  countdown.value = formatCountdown(nearestAnniversary.value.targetTimestamp)
  countdownTimer = setInterval(() => {
    countdown.value = formatCountdown(nearestAnniversary.value?.targetTimestamp)
  }, 1000)
}

function normalizeMoment(moment) {
  return {
    ...moment,
    comments: (moment.comments || []).map((comment) => ({
      ...comment,
      createdText: comment.createdText || '',
    })),
  }
}

function updateMomentItem(nextMoment) {
  moments.value = moments.value.map((item) => (item.id === nextMoment.id ? normalizeMoment(nextMoment) : item))
}

async function fetchFeed({ reset = false } = {}) {
  if (!coupleStore.isBound) {
    nearestAnniversary.value = null
    moments.value = []
    hasMore.value = false
    page.value = 1
    return
  }

  const targetPage = reset ? 1 : page.value
  const result = await getHomeFeed(
    {
      page: targetPage,
      pageSize: 10,
    },
    getSession(),
  )

  nearestAnniversary.value = result.nearestAnniversary || null
  startCountdown()
  hasMore.value = result.hasMore
  page.value = targetPage + 1

  const nextList = (result.list || []).map(normalizeMoment)
  moments.value = reset ? nextList : [...moments.value, ...nextList]
}

function handleOpenComposer() {
  if (!coupleStore.isBound) {
    showToast('未绑定前无法发布动态')
    return
  }
  composerVisible.value = true
}

function closeComposer() {
  composerVisible.value = false
}

async function handleChooseImages() {
  try {
    const selected = await chooseMomentImages()
    const nextImages = [...publishForm.images, ...selected.map((item) => item.path)].slice(0, 9)
    publishForm.images = nextImages
  } catch (error) {
    showToast(error.message || '图片选择失败')
  }
}

function removeImage(index) {
  publishForm.images.splice(index, 1)
}

function handlePreviewDraft(index) {
  viewer.images = [...publishForm.images]
  viewer.current = index
  viewer.visible = true
}

function handlePreviewMomentImage({ images, index }) {
  viewer.images = [...images]
  viewer.current = index
  viewer.visible = true
}

function closeViewer() {
  viewer.visible = false
  viewer.images = []
  viewer.current = 0
}

async function handlePublish() {
  if (publishing.value) return
  if (!coupleStore.isBound) {
    showToast('未绑定前无法发布动态')
    return
  }

  let content = ''
  try {
    content = validatePublishPayload({
      content: publishForm.content,
      images: publishForm.images,
    })
  } catch (error) {
    showToast(error.message)
    return
  }

  publishing.value = true
  uni.showLoading({ title: '发布中...', mask: true })
  try {
    // #region debug-point H1:moment-submit-payload
    reportHomeImageDebug('home-submit-moment', {
      content,
      imageCount: publishForm.images.length,
      imageSchemes: publishForm.images.map((item) => String(item || '').split(':')[0] || ''),
      images: publishForm.images,
    })
    // #endregion
    const result = await publishMoment(
      {
        content,
        images: publishForm.images,
      },
      getSession(),
    )
    nearestAnniversary.value = result.nearestAnniversary || nearestAnniversary.value
    moments.value = (result.list || []).map(normalizeMoment)
    hasMore.value = result.hasMore
    page.value = 2
    publishForm.content = ''
    publishForm.images = []
    composerVisible.value = false
    showToast('动态发布成功')
  } catch (error) {
    showToast(error.message || '动态发布失败')
  } finally {
    uni.hideLoading()
    publishing.value = false
  }
}

async function handleLike(item) {
  if (!coupleStore.isBound) {
    showToast('未绑定前无法点赞')
    return
  }
  try {
    const result = await toggleMomentLike({ momentId: item.id }, getSession())
    updateMomentItem(result.moment)
  } catch (error) {
    showToast(error.message || '点赞失败')
  }
}

function openCommentDrawer(item) {
  if (!coupleStore.isBound) {
    showToast('未绑定前无法评论')
    return
  }
  activeMomentId.value = item.id
  commentDraft.value = ''
  commentDrawerVisible.value = true
}

function closeCommentDrawer() {
  commentDrawerVisible.value = false
  activeMomentId.value = ''
  commentDraft.value = ''
}

async function submitComment() {
  if (commentSubmitting.value || !activeMoment.value) return
  if (!commentDraft.value.trim()) {
    showToast('评论内容不能为空')
    return
  }

  commentSubmitting.value = true
  try {
    const result = await addMomentComment(
      {
        momentId: activeMoment.value.id,
        content: commentDraft.value,
      },
      getSession(),
    )
    updateMomentItem(result.moment)
    commentDraft.value = ''
  } catch (error) {
    showToast(error.message || '评论失败')
  } finally {
    commentSubmitting.value = false
  }
}

function handleNavigate(route) {
  if (!coupleStore.isBound) {
    showToast('未绑定前不可使用主业务功能')
    return
  }
  navigateTo(route)
}

async function refreshFeed() {
  refreshing.value = true
  try {
    await fetchFeed({ reset: true })
  } catch (error) {
    showToast(error.message || '刷新失败')
  } finally {
    refreshing.value = false
    uni.stopPullDownRefresh()
  }
}

async function loadMore() {
  if (loadingMore.value || !hasMore.value || !coupleStore.isBound) return
  loadingMore.value = true
  try {
    await fetchFeed({ reset: false })
  } catch (error) {
    showToast(error.message || '加载更多失败')
  } finally {
    loadingMore.value = false
  }
}

onPullDownRefresh(() => {
  refreshFeed()
})

onReachBottom(() => {
  loadMore()
})

onMounted(() => {
  if (typeof uni.hideShareMenu === 'function') {
    uni.hideShareMenu()
  }
  if (!guardPageAccess({ requireLogin: true })) return
  refreshFeed()
})

onBeforeUnmount(() => {
  stopCountdown()
})
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
}

.page__section + .page__section {
  margin-top: 20px;
}

.page__section--tools {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.tool-item {
  padding: 16px 10px;
  border-radius: 16px;
  background: $surface-color;
  border: 1px solid $line-color;
  box-shadow: $shadow-soft;
  text-align: center;
  color: $text-primary;
  transition: transform var(--transition-base), background-color var(--transition-base), opacity var(--transition-base);
}

.tool-item:active {
  transform: scale(0.98);
}

.tool-item--disabled {
  color: $text-secondary;
  background: $disabled-bg;
  box-shadow: none;
  border-color: transparent;
}

.section-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.section-head__title {
  font-size: 16px;
  font-weight: 600;
  color: $text-primary;
}

.section-head__desc {
  font-size: 12px;
  color: $text-secondary;
  text-align: right;
}

.waterfall {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.waterfall__column {
  min-width: 0;
}

@media screen and (min-width: 768px) {
  .page {
    max-width: 1080rpx;
    margin: 0 auto;
  }
}
</style>
