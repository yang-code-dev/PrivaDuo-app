import { isCloudReady } from '@/utils/cloud'
import { assertSecureTransport, createSignedEnvelope } from '@/utils/security'
import { handleMockRecordsRequest } from '@/services/mock-records-server'
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
      name: 'pair-records',
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
