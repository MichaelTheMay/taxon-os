export function fmtNum(n) {
  if (!n) return '0'
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return String(n)
}

export function truncate(str, n) {
  if (!str || str.length <= n) return str
  return str.slice(0, str.lastIndexOf(' ', n)) + '…'
}

export function stripHtml(str) {
  if (!str) return ''
  return str.replace(/<[^>]*>/g, '')
}
