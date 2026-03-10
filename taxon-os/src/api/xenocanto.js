/**
 * Xeno-canto API v2
 * Public, CORS-enabled. No key needed for v2.
 * Provides recordings of bird, frog, bat, and insect sounds.
 */

const XC_BASE = 'https://xeno-canto.org/api/2/recordings'

export async function fetchXCRecordings(scientificName, limit = 3) {
  try {
    const res = await fetch(
      `${XC_BASE}?query=${encodeURIComponent(scientificName + ' q:A')}`
    )
    if (!res.ok) return []
    const data = await res.json()
    
    return (data.recordings || [])
      .filter(r => r.file && r.en)
      .slice(0, limit)
      .map(r => ({
        id: r.id,
        species: r['en'],
        sciName: `${r.gen} ${r.sp}`,
        recordist: r.rec,
        country: r.cnt,
        locality: r.loc,
        type: r.type, // 'call', 'song', etc.
        quality: r.q,  // A-E
        url: r.file,   // direct audio URL
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
