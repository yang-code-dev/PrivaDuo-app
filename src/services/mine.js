import { isCloudReady } from '@/utils/cloud'
import { assertSecureTransport, createSignedEnvelope } from '@/utils/security'
import { persistAvatar } from '@/services/avatar'
import { handleMockMineRequest } from '@/services/mock-mine-server'
import { createServiceError } from '@/utils/request'
import { handleUnauthorizedError } from '@/utils/session'

// #region debug-point D:update-profile-request
function reportMineDebug(msg, data = {}) {
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
      hypothesisId: 'M1',
      location: 'src/services/mine.js',
      msg: `[DEBUG] ${msg}`,
      data,
      ts: Date.now(),
    }),
  }).catch(() => {})
}
// #endregion

async function request(action, body = {}, session = {}) {
  const envelope = createSignedEnvelope({
    action,
    body,
    token: session.accessToken || '',
    secret: session.sessionSecret || '',
  })

  // #region debug-point D:update-profile-request
  if (action === 'updateProfile') {
    reportMineDebug('mine-request-update-profile', {
      avatar: body.avatar || '',
      avatarScheme: String(body.avatar || '').split(':')[0] || '',
      hasCloud: isCloudReady(),
    })
  }
  if (['getMineOverview', 'createUnbindRequest', 'respondUnbindRequest'].includes(action)) {
    reportMineDebug('mine-request-session-action', {
      action,
      hasToken: Boolean(session.accessToken),
      hasSessionSecret: Boolean(session.sessionSecret),
      body,
    })
  }
  // #endregion

  if (isCloudReady() && action !== 'getLocalAlbum') {
    assertSecureTransport()
    const response = await uniCloud.callFunction({
      name: 'pair-mine',
      data: envelope,
    })
    const result = response.result || {}
    // #region debug-point D:update-profile-request
    if (action === 'updateProfile') {
      reportMineDebug('mine-response-update-profile', {
        success: Boolean(result.success),
        avatar: result.user?.avatar || '',
      })
    }
    if (action === 'getNotificationSettings') {
      reportMineDebug('mine-response-get-notification-settings', {
        success: Boolean(result.success),
        code: result.code || '',
        message: result.message || '',
        settings: result.settings || {},
      })
    }
    if (action === 'saveNotificationSettings') {
      reportMineDebug('mine-response-save-notification-settings', {
        success: Boolean(result.success),
        code: result.code || '',
        message: result.message || '',
        settings: result.settings || {},
      })
    }
    if (['getMineOverview', 'createUnbindRequest', 'respondUnbindRequest'].includes(action)) {
      reportMineDebug('mine-response-session-action', {
        action,
        success: Boolean(result.success),
        code: result.code || '',
        message: result.message || '',
      })
    }
    // #endregion
    if (!result.success) {
      const error = createServiceError(result)
      error.sessionSnapshot = {
        accessToken: session.accessToken || '',
        sessionSecret: session.sessionSecret || '',
      }
      await handleUnauthorizedError(error, error.sessionSnapshot)
    }
    return result
  }

  return handleMockMineRequest(envelope)
}

export function getMineOverview(session, payload = {}) {
  return request('getMineOverview', payload, session)
}

export function updateProfile(payload, session) {
  return persistProfileAvatar(payload, session)
}

export function getNotificationSettings(session) {
  return request('getNotificationSettings', {}, session)
}

export function saveNotificationSettings(payload, session) {
  return request('saveNotificationSettings', payload, session)
}

export function getLocalAlbum(payload = {}) {
  return request('getLocalAlbum', payload, {})
}

export function createUnbindRequest(payload, session) {
  return request('createUnbindRequest', payload, session)
}

export function respondUnbindRequest(payload, session) {
  return request('respondUnbindRequest', payload, session)
}

async function persistProfileAvatar(payload = {}, session) {
  const nextPayload = { ...payload }
  if (nextPayload.avatar) {
    nextPayload.avatar = await persistAvatar(nextPayload.avatar)
  }
  return request('updateProfile', nextPayload, session)
}
