import { isCloudReady } from '@/utils/cloud'
import { assertSecureTransport, createSignedEnvelope } from '@/utils/security'
import { handleMockDailyRequest } from '@/services/mock-daily-server'
import { createServiceError } from '@/utils/request'
import { handleUnauthorizedError } from '@/utils/session'

// #region debug-point D1:daily-image-request
function reportDailyImageDebug(msg, data = {}) {
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
      hypothesisId: 'D1',
      location: 'src/services/daily.js',
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

  // #region debug-point D1:daily-image-request
  if (action === 'publishMoment') {
    reportDailyImageDebug('daily-request-publish-moment', {
      imageCount: Array.isArray(body.images) ? body.images.length : 0,
      imageSchemes: (body.images || []).map((item) => String(item || '').split(':')[0] || ''),
      images: body.images || [],
      hasCloud: isCloudReady(),
    })
  }
  // #endregion

  if (isCloudReady()) {
    assertSecureTransport()
    const response = await uniCloud.callFunction({
      name: 'pair-daily',
      data: envelope,
    })
    const result = response.result || {}
    // #region debug-point D1:daily-image-request
    if (action === 'publishMoment') {
      reportDailyImageDebug('daily-response-publish-moment', {
        success: Boolean(result.success),
        firstMomentImages: result.list?.[0]?.images || [],
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

  return handleMockDailyRequest(envelope)
}

export function getHomeFeed(payload, session) {
  return request('getHomeFeed', payload, session)
}

export function publishMoment(payload, session) {
  return request('publishMoment', payload, session)
}

export function toggleMomentLike(payload, session) {
  return request('toggleMomentLike', payload, session)
}

export function addMomentComment(payload, session) {
  return request('addMomentComment', payload, session)
}
