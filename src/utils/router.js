export const ROUTES = Object.freeze({
  splash: '/pages/splash/index',
  login: '/pages/auth/login',
  bindGuide: '/pages/bind/guide',
  home: '/pages/home/index',
  message: '/pages/message/index',
  moment: '/pages/moment/index',
  mine: '/pages/mine/index',
  diaryDetail: '/pages/diary/detail',
  anniversaryDetail: '/pages/anniversary/detail',
  wishlist: '/pages/wishlist/index',
  albumDetail: '/pages/album/detail',
  settings: '/pages/settings/index',
  notification: '/pages/notification/index',
  privacy: '/pages/privacy/index',
  relation: '/pages/relation/index',
})

let relaunchFallbackTimer = null

export function resolveEntryRoute({ isLoggedIn, isBound }) {
  if (!isLoggedIn) return ROUTES.login
  return ROUTES.home
}

function normalizeRoute(url = '') {
  return String(url || '').split('?')[0]
}

function getCurrentH5Route() {
  if (typeof window === 'undefined') return ''
  const hash = String(window.location.hash || '')
  return normalizeRoute(hash.startsWith('#') ? hash.slice(1) : hash)
}

function buildH5Url(url) {
  if (typeof window === 'undefined') return url
  const { origin, pathname, search } = window.location
  return `${origin}${pathname}${search}#${url}`
}

export function navigateTo(url) {
  uni.navigateTo({ url })
}

export function reLaunch(url) {
  try {
    uni.reLaunch({ url })
  } catch (error) {
    if (typeof window !== 'undefined') {
      window.location.replace(buildH5Url(url))
    }
    return
  }

  if (typeof window === 'undefined') return

  if (relaunchFallbackTimer) {
    window.clearTimeout(relaunchFallbackTimer)
  }

  relaunchFallbackTimer = window.setTimeout(() => {
    if (getCurrentH5Route() !== normalizeRoute(url)) {
      window.location.replace(buildH5Url(url))
    }
  }, 300)
}
