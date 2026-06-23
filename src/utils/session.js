import { getSessionState, logout as requestLogout } from '@/services/auth'
import { useCoupleStore } from '@/stores/couple'
import { useUserStore } from '@/stores/user'
import { isUnauthorizedError } from '@/utils/request'
import { ROUTES, reLaunch } from '@/utils/router'

let sessionValidationPromise = null
let sessionValidationKey = ''

// #region debug-point S1:session-flow
function reportSessionDebug(msg, data = {}) {
  if (
    typeof window === 'undefined'
    || !['localhost', '127.0.0.1', 'static-mp-171ab784-e0ea-4b77-ad6d-5d53ccbbd8a5.next.bspapp.com'].includes(window.location?.hostname || '')
  ) {
    return
  }
  fetch('http://127.0.0.1:7777/event', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sessionId: 'auth-session-logout',
      runId: 'pre-fix',
      hypothesisId: 'S1',
      location: 'src/utils/session.js',
      msg: `[DEBUG] ${msg}`,
      data,
      ts: Date.now(),
    }),
  }).catch(() => {})
}
// #endregion

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

  // #region debug-point S1:session-flow
  reportSessionDebug('logout-and-redirect-start', {
    hasToken: Boolean(session.accessToken),
    hasSessionSecret: Boolean(session.sessionSecret),
    uid: userStore.profile.uid || '',
    redirectNeeded,
    message,
    hasExpectedSession: Boolean(expectedSession?.accessToken || expectedSession?.sessionSecret),
  })
  // #endregion

  if (expectedSession && !isSameSession(userStore, expectedSession)) {
    // #region debug-point S1:session-flow
    reportSessionDebug('logout-and-redirect-skipped-stale-session', {
      currentSessionKey: buildSessionKey(session),
      expectedSessionKey: buildSessionKey(expectedSession),
    })
    // #endregion
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
    // #region debug-point S1:session-flow
    reportSessionDebug('logout-and-redirect-relaunch', {
      target: ROUTES.login,
    })
    // #endregion
    reLaunch(ROUTES.login)
  }
}

export async function ensureSessionValid({ redirectOnFail = true, showExpiredToast = false } = {}) {
  const userStore = useUserStore()
  const coupleStore = useCoupleStore()
  const session = getCurrentSession(userStore)
  const validationKey = buildSessionKey(session)

  // #region debug-point S1:session-flow
  reportSessionDebug('ensure-session-valid-start', {
    redirectOnFail,
    showExpiredToast,
    uid: userStore.profile.uid || '',
    hasToken: Boolean(session.accessToken),
    hasSessionSecret: Boolean(session.sessionSecret),
    currentRoute: (typeof getCurrentPages === 'function' ? getCurrentPages()?.slice(-1)?.[0]?.route : '') || '',
  })
  // #endregion

  if (!userStore.isLoggedIn) {
    coupleStore.clear()
    if (redirectOnFail && shouldRedirectToLogin()) {
      // #region debug-point S1:session-flow
      reportSessionDebug('ensure-session-valid-no-login-redirect', {
        target: ROUTES.login,
      })
      // #endregion
      reLaunch(ROUTES.login)
    }
    return false
  }

  if (sessionValidationPromise && sessionValidationKey === validationKey) {
    // #region debug-point S1:session-flow
    reportSessionDebug('ensure-session-valid-reuse-inflight', {
      validationKey,
    })
    // #endregion
    return sessionValidationPromise
  }

  let task = null
  task = (async () => {
    try {
      const result = await getSessionState(session)
      if (!isSameSession(userStore, session)) {
        // #region debug-point S1:session-flow
        reportSessionDebug('ensure-session-valid-ignore-stale-success', {
          validationKey,
          currentSessionKey: buildSessionKey(getCurrentSession(userStore)),
        })
        // #endregion
        return userStore.isLoggedIn
      }

      userStore.syncUser(result.user || {})
      coupleStore.sync(result.couple || {})
      // #region debug-point S1:session-flow
      reportSessionDebug('ensure-session-valid-success', {
        uid: result.user?.uid || userStore.profile.uid || '',
        bindingStatus: result.user?.bindingStatus || '',
      })
      // #endregion
      return true
    } catch (error) {
      // #region debug-point S1:session-flow
      reportSessionDebug('ensure-session-valid-error', {
        message: error.message || '',
        code: error.code || '',
        unauthorized: isUnauthorizedError(error),
      })
      // #endregion
      if (isUnauthorizedError(error)) {
        if (!isSameSession(userStore, session)) {
          // #region debug-point S1:session-flow
          reportSessionDebug('ensure-session-valid-ignore-stale-unauthorized', {
            validationKey,
            currentSessionKey: buildSessionKey(getCurrentSession(userStore)),
          })
          // #endregion
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
  // #region debug-point S1:session-flow
  reportSessionDebug('handle-unauthorized-error', {
    message: error.message || '',
    code: error.code || '',
    hasSessionSnapshot: Boolean(sessionSnapshot?.accessToken || sessionSnapshot?.sessionSecret),
  })
  // #endregion
  if (sessionSnapshot && !isSameSession(userStore, sessionSnapshot)) {
    // #region debug-point S1:session-flow
    reportSessionDebug('handle-unauthorized-error-skip-stale-session', {
      currentSessionKey: buildSessionKey(getCurrentSession(userStore)),
      expectedSessionKey: buildSessionKey(sessionSnapshot),
    })
    // #endregion
    throw error
  }
  await logoutAndRedirect({
    showToast: true,
    message: '登录态已失效，请重新登录',
    expectedSession: sessionSnapshot,
  })
  throw error
}
