/**
 * Xeno-canto API v3
 * Endpoint: https://xeno-canto.org/api/3/recordings
 * Requires an API key (free — register at xeno-canto.org).
 * Set VITE_XC_API_KEY in your .env file to enable wildlife sounds.
 * If no key is found, all functions return empty arrays gracefully.
 */

const XC_KEY = import.meta.env.VITE_XC_API_KEY || ''
const XC_BASE = '/xc-api/api/3/recordings'

/**
 * Fetch recordings for a scientific name using v3 tag-based query.
 * Uses `sp:` + `gen:` tags for precise matching, falls back to name string.
 * @param {string} scientificName  e.g. "Turdus merula"
 * @param {number} limit           max recordings to return
 */
export async function fetchXCRecordings(scientificName, limit = 3) {
  if (!XC_KEY) return []   // No key → silent no-op

  try {
    const parts = scientificName.trim().split(/\s+/)
    let query = ''
    if (parts.length === 1) {
      query = `gen:${parts[0]} q:A`
    } else if (parts.length === 2) {
      query = `gen:${parts[0]} sp:${parts[1]} q:A`
    } else {
      query = `gen:${parts[0]} sp:${parts[1]} ssp:${parts[2]} q:A`
    }

    const url = `${XC_BASE}?query=${encodeURIComponent(query)}&key=${encodeURIComponent(XC_KEY)}&per_page=50`
    const res = await fetch(url)

    if (!res.ok) {
      console.warn(`Xeno-canto v3 request failed: ${res.status}`)
      return []
    }

    const data = await res.json()
    if (data.error) {
      console.warn('Xeno-canto v3 error:', data.message)
      return []
    }

    return (data.recordings || [])
      .filter(r => r.file && r['file'])
      .slice(0, limit)
      .map(r => ({
        id: r.id,
        species: r['en'],
        sciName: `${r.gen} ${r.sp}`,
        recordist: r.rec,
        country: r.cnt,
        locality: r.loc,
        type: r.type,
        quality: r.q,
        url: r['file'].startsWith('//') ? `https:${r['file']}` : r['file'],
        license: r.lic,
        date: r.date,
        pageUrl: `https://xeno-canto.org/${r.id}`,
      }))
  } catch (err) {
    console.warn('Xeno-canto fetch failed:', err)
    return []
  }
}

// Just get the first best-quality audio URL
export async function fetchBestRecording(scientificName) {
  const recordings = await fetchXCRecordings(scientificName, 1)
  return recordings[0] || null
}
