import { isCloudReady } from '@/utils/cloud'
import { assertSecureTransport, createSignedEnvelope } from '@/utils/security'
import { handleMockRecordsRequest } from '@/services/mock-records-server'
import { createServiceError } from '@/utils/request'
import { handleUnauthorizedError } from '@/utils/session'

// #region debug-point R1:records-image-request
function reportRecordsImageDebug(msg, data = {}) {
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
      hypothesisId: 'R1',
      location: 'src/services/records.js',
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

  // #region debug-point R1:records-image-request
  if (action === 'saveDiary') {
    reportRecordsImageDebug('records-request-save-diary', {
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
      name: 'pair-records',
      data: envelope,
    })
    const result = response.result || {}
    // #region debug-point R1:records-image-request
    if (action === 'saveDiary') {
      reportRecordsImageDebug('records-response-save-diary', {
        success: Boolean(result.success),
        firstDiaryImages: result.diaries?.[0]?.images || [],
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

  return handleMockRecordsRequest(envelope)
}

export function getRecords(session) {
  return request('getRecords', {}, session)
}

export function saveDiary(payload, session) {
  return request('saveDiary', payload, session)
}

export function deleteDiary(payload, session) {
  return request('deleteDiary', payload, session)
}

export function saveAnniversary(payload, session) {
  return request('saveAnniversary', payload, session)
}

export function deleteAnniversary(payload, session) {
  return request('deleteAnniversary', payload, session)
}

export function saveWish(payload, session) {
  return request('saveWish', payload, session)
}

export function toggleWish(payload, session) {
  return request('toggleWish', payload, session)
}

export function deleteWish(payload, session) {
  return request('deleteWish', payload, session)
}
