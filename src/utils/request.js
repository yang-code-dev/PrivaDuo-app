export function createServiceError(result = {}, fallbackMessage = '请求失败') {
  const error = new Error(result.message || fallbackMessage)
  error.code = result.code || 'REQUEST_ERROR'
  error.result = result
  return error
}

export function isUnauthorizedError(error) {
  const code = String(error?.code || '')
  const message = String(error?.message || '')

  return code === 'UNAUTHORIZED' || /请先登录|登录态已失效|用户不存在/.test(message)
}
