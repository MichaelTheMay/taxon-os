export async function fetchWikiSummary(name) {
  try {
    const title = encodeURIComponent(name.replace(/ /g, '_'))
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${title}`)
    if (!res.ok) return null
    return res.json()
  } catch { return null }
}
