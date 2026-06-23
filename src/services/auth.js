import { isCloudReady } from '@/utils/cloud'
import { APP_PUBLIC_SIGN_SECRET, assertSecureTransport, createSignedEnvelope } from '@/utils/security'
import { persistAvatar } from '@/services/avatar'
import { handleMockAuthRequest } from '@/services/mock-auth-server'
import { createServiceError } from '@/utils/request'

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
