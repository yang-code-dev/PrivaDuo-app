import { isCloudReady } from '@/utils/cloud'
import { assertSecureTransport, createSignedEnvelope } from '@/utils/security'
import { handleMockDailyRequest } from '@/services/mock-daily-server'
import { createServiceError } from '@/utils/request'
import { handleUnauthorizedError } from '@/utils/session'

async function request(action, body = {}, session = {}) {
  const envelope = createSignedEnvelope({
    action,
    body,
    token: session.accessToken || '',
    secret: session.sessionSecret || '',
  })

  if (isCloudReady()) {
    assertSecureTransport()
    const response = await uniCloud.callFunction({
      name: 'pair-daily',
      data: envelope,
    })
    const result = response.result || {}
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
