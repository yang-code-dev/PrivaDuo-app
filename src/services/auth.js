import { isCloudReady } from '@/utils/cloud'
import { APP_PUBLIC_SIGN_SECRET, assertSecureTransport, createSignedEnvelope } from '@/utils/security'
import { persistAvatar } from '@/services/avatar'
import { handleMockAuthRequest } from '@/services/mock-auth-server'
import { createServiceError } from '@/utils/request'

// #region debug-point A1:auth-session-state
function reportAuthDebug(msg, data = {}) {
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
      hypothesisId: 'A1',
      location: 'src/services/auth.js',
      msg: `[DEBUG] ${msg}`,
      data,
      ts: Date.now(),
    }),
  }).catch(() => {})
}
// #endregion

function normalizeRequestError(error, fallbackMessage = '网络异常，请稍后重试') {
  if (error?.result || error?.code === 'REQUEST_ERROR') {
    return error
  }
  return createServiceError({
    code: error?.code || 'NETWORK_ERROR',
    message: error?.message || fallbackMessage,
  }, fallbackMessage)
}

async function request(action, body = {}, session = null) {
  const envelope = createSignedEnvelope({
    action,
    body,
    token: session?.accessToken || '',
    secret: session?.sessionSecret || APP_PUBLIC_SIGN_SECRET,
  })

  // #region debug-point A1:auth-session-state
  if (action === 'getSessionState') {
    reportAuthDebug('auth-get-session-state-start', {
      hasToken: Boolean(session?.accessToken),
      hasSessionSecret: Boolean(session?.sessionSecret),
      isCloudReady: isCloudReady(),
    })
  }
  // #endregion

  if (isCloudReady()) {
    assertSecureTransport()
    let response
    try {
      response = await uniCloud.callFunction({
        name: 'pair-auth',
        data: envelope,
      })
    } catch (error) {
      throw normalizeRequestError(error)
    }

    const result = response.result || {}
    // #region debug-point A1:auth-session-state
    if (action === 'getSessionState') {
      reportAuthDebug('auth-get-session-state-result', {
        success: Boolean(result.success),
        code: result.code || '',
        message: result.message || '',
        coupleBindingStatus: result.couple?.bindingStatus || '',
      })
    }
    // #endregion
    if (!result.success) {
      throw createServiceError(result)
    }
    return result
  }

  return handleMockAuthRequest(envelope)
}

export function sendSmsCode(payload) {
  return request('sendSmsCode', payload)
}

export function registerOrLogin(payload) {
  return request('registerOrLogin', payload)
}

export function getProfileStatus(session) {
  return request('getProfileStatus', {}, session)
}

export function completeInitialProfile(payload, session) {
  return completeInitialProfileWithAvatar(payload, session)
}

export function getSessionState(session) {
  return request('getSessionState', {}, session)
}

export function generateInviteCode(session) {
  return request('generateInviteCode', {}, session)
}

export function bindByInviteCode(payload, session) {
  return request('bindByInviteCode', payload, session)
}

export function logout(session) {
  return request('logout', {}, session)
}

async function completeInitialProfileWithAvatar(payload = {}, session) {
  const nextPayload = { ...payload }
  try {
    if (nextPayload.avatar) {
      nextPayload.avatar = await persistAvatar(nextPayload.avatar)
    }
    return await request('completeInitialProfile', nextPayload, session)
  } catch (error) {
    throw error
  }
}
