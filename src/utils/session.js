import { getSessionState, logout as requestLogout } from '@/services/auth'
import { useCoupleStore } from '@/stores/couple'
import { useUserStore } from '@/stores/user'
import { isUnauthorizedError } from '@/utils/request'
import { ROUTES, reLaunch } from '@/utils/router'

let sessionValidationPromise = null
let sessionValidationKey = ''

function getCurrentSession(userStore) {
  return {
    accessToken: userStore.profile.accessToken,
    sessionSecret: userStore.profile.sessionSecret,
  }
}

function buildSessionKey(session = {}) {
  return `${session.accessToken || ''}|${session.sessionSecret || ''}`
}

function isSameSession(userStore, session = {}) {
  return buildSessionKey(getCurrentSession(userStore)) === buildSessionKey(session)
}

function shouldRedirectToLogin() {
  const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
  const current = pages[pages.length - 1]
  const route = current?.route ? `/${current.route}` : ''

  return route !== ROUTES.login
}

export async function logoutAndRedirect({ showToast = false, message = '已退出登录', expectedSession = null } = {}) {
  const userStore = useUserStore()
  const coupleStore = useCoupleStore()
  const session = getCurrentSession(userStore)
  const redirectNeeded = shouldRedirectToLogin()

  if (expectedSession && !isSameSession(userStore, expectedSession)) {
    return
  }

  try {
    if (userStore.isLoggedIn) {
      await requestLogout(session)
    }
  } catch (error) {
    // 云端退出失败时不阻断本地退出
  }

  userStore.logout()
  coupleStore.clear()

  if (showToast) {
    uni.showToast({
      title: message,
      icon: 'none',
    })
  }

  if (redirectNeeded) {
    reLaunch(ROUTES.login)
  }
}

export async function ensureSessionValid({ redirectOnFail = true, showExpiredToast = false } = {}) {
  const userStore = useUserStore()
  const coupleStore = useCoupleStore()
  const session = getCurrentSession(userStore)
  const validationKey = buildSessionKey(session)

  if (!userStore.isLoggedIn) {
    coupleStore.clear()
    if (redirectOnFail && shouldRedirectToLogin()) {
      reLaunch(ROUTES.login)
    }
    return false
  }

  if (sessionValidationPromise && sessionValidationKey === validationKey) {
    return sessionValidationPromise
  }

  let task = null
  task = (async () => {
    try {
      const result = await getSessionState(session)
      if (!isSameSession(userStore, session)) {
        return userStore.isLoggedIn
      }

      userStore.syncUser(result.user || {})
      coupleStore.sync(result.couple || {})
      return true
    } catch (error) {
      if (isUnauthorizedError(error)) {
        if (!isSameSession(userStore, session)) {
          return userStore.isLoggedIn
        }
        if (redirectOnFail) {
          await logoutAndRedirect({
            showToast: showExpiredToast,
            message: '登录态已失效，请重新登录',
            expectedSession: session,
          })
        }
        return false
      }
      throw error
    } finally {
      if (sessionValidationPromise === task) {
        sessionValidationPromise = null
        sessionValidationKey = ''
      }
    }
  })()

  sessionValidationPromise = task
  sessionValidationKey = validationKey
  return task
}

export async function handleUnauthorizedError(error, sessionSnapshot = null) {
  if (!isUnauthorizedError(error)) {
    throw error
  }

  const userStore = useUserStore()
  error.handled = true
  if (sessionSnapshot && !isSameSession(userStore, sessionSnapshot)) {
    throw error
  }
  await logoutAndRedirect({
    showToast: true,
    message: '登录态已失效，请重新登录',
    expectedSession: sessionSnapshot,
  })
  throw error
}
