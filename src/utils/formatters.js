export function maskMobile(mobile = '') {
  const value = String(mobile).trim()
  if (value.length !== 11) return value
  return `${value.slice(0, 3)}****${value.slice(7)}`
}
