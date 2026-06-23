export function formatMomentTime(value) {
  const timestamp = Number(value || 0)
  if (!timestamp) return ''

  const diff = Date.now() - timestamp
  if (diff < 60 * 1000) return '刚刚'
  if (diff < 60 * 60 * 1000) return `${Math.max(1, Math.floor(diff / (60 * 1000)))}分钟前`
  if (diff < 24 * 60 * 60 * 1000) return `${Math.max(1, Math.floor(diff / (60 * 60 * 1000)))}小时前`

  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hour = `${date.getHours()}`.padStart(2, '0')
  const minute = `${date.getMinutes()}`.padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}`
}

export function formatCountdown(targetTimestamp) {
  const diff = Math.max(0, Number(targetTimestamp || 0) - Date.now())
  const totalSeconds = Math.floor(diff / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return {
    totalMilliseconds: diff,
    days,
    hours: `${hours}`.padStart(2, '0'),
    minutes: `${minutes}`.padStart(2, '0'),
    seconds: `${seconds}`.padStart(2, '0'),
  }
}

export function splitWaterfallList(list = []) {
  return list.reduce(
    (acc, item, index) => {
      acc[index % 2].push(item)
      return acc
    },
    [[], []],
  )
}

export function normalizeMomentContent(value = '') {
  return String(value).replace(/\s+/g, ' ').trim()
}
