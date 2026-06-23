export function formatDiaryGroupLabel(timestamp) {
  const date = new Date(Number(timestamp || 0))
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatMonthKey(timestamp) {
  const date = new Date(Number(timestamp || 0))
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  return `${year}-${month}`
}

export function getMonthOptions(list = [], dateField = 'writtenAt') {
  const set = new Set(list.map((item) => formatMonthKey(item[dateField])))
  return ['全部', ...[...set].sort().reverse()]
}

export function sortAnniversaries(list = []) {
  return [...list].sort((a, b) => Number(a.remainingDays) - Number(b.remainingDays))
}

export function sortWishItems(list = []) {
  return [...list].sort((a, b) => {
    if (a.completed === b.completed) {
      return Number(b.createdAt) - Number(a.createdAt)
    }
    return a.completed ? 1 : -1
  })
}

export function normalizeRecordText(value = '') {
  return String(value).replace(/\s+/g, ' ').trim()
}
