import { isCloudReady } from '@/utils/cloud'
import { assertSecureTransport, createSignedEnvelope } from '@/utils/security'
import { persistAvatar } from '@/services/avatar'
import { handleMockMineRequest } from '@/services/mock-mine-server'
import { createServiceError } from '@/utils/request'
import { handleUnauthorizedError } from '@/utils/session'

async function request(action, body = {}, session = {}) {
  const envelope = createSignedEnvelope({
    action,
    body,
    token: session.accessToken || '',
    secret: session.sessionSecret || '',
  })

  if (isCloudReady() && action !== 'getLocalAlbum') {
    assertSecureTransport()
    const response = await uniCloud.callFunction({
      name: 'pair-mine',
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
