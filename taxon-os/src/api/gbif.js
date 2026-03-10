const BASE = 'https://api.gbif.org/v1'

export async function matchGBIF(name) {
  try {
    const res = await fetch(`${BASE}/species/match?name=${encodeURIComponent(name)}&verbose=false`)
    if (!res.ok) return null
    const data = await res.json()
    if (data.matchType === 'NONE') return null
    return data
  } catch { return null }
}export async function fetchGBIFSpecies(usageKey) {
  try {
    const res = await fetch(`${BASE}/species/${usageKey}`)
    if (!res.ok) return null
    return res.json()
  } catch { return null }
}

export async function fetchOccurrenceImages(taxonKey, limit = 8) {
  try {
    const res = await fetch(
      `${BASE}/occurrence/search?taxonKey=${taxonKey}&mediaType=StillImage&limit=20`
    )
    if (!res.ok) return []
    const data = await res.json()
    const images = []
    for (const occ of data.results || []) {
      for (const media of occ.media || []) {
        if (media.type === 'StillImage' && media.identifier) {
          images.push({
            url: media.identifier,
            creator: media.creator || occ.recordedBy,
            license: media.license,
          })
          if (images.length >= limit) return images
        }
      }
    }
    return images
  } catch { return [] }
}

export async function fetchOccurrenceCount(taxonKey) {
  try {
    const res = await fetch(`${BASE}/occurrence/count?taxonKey=${taxonKey}`)
    if (!res.ok) return null
    return res.json()
  } catch { return null }
}

export async function fetchOccurrencePoints(taxonKey, limit = 300) {
  try {
    const res = await fetch(
      `${BASE}/occurrence/search?taxonKey=${taxonKey}&hasCoordinate=true&hasGeospatialIssue=false&limit=${Math.min(limit, 300)}`
    )
    if (!res.ok) return []
    const data = await res.json()
    return (data.results || [])
      .filter(r => r.decimalLatitude != null && r.decimalLongitude != null)
      .map(r => ({
        lat: r.decimalLatitude,
        lng: r.decimalLongitude,
        year: r.year,
        country: r.country,
        species: r.species || r.scientificName,
        basisOfRecord: r.basisOfRecord,
        institutionCode: r.institutionCode,
      }))
  } catch { return [] }
}

export async function fetchSpeciesProfile(taxonKey) {
  try {
    const [vernRes, descRes] = await Promise.allSettled([
      fetch(`${BASE}/species/${taxonKey}/vernacularNames?limit=5`),
      fetch(`${BASE}/species/${taxonKey}/descriptions?limit=3`),
    ])
    const result = {}
    if (vernRes.status === 'fulfilled' && vernRes.value.ok) {
      const vData = await vernRes.value.json()
      const enName = (vData.results || []).find(v => v.language === 'eng' || v.language === 'en')
      result.commonName = enName?.vernacularName || (vData.results || [])[0]?.vernacularName || null
      result.allCommonNames = (vData.results || []).slice(0, 5).map(v => ({
        name: v.vernacularName,
        language: v.language,
      }))
    }
    if (descRes.status === 'fulfilled' && descRes.value.ok) {
      const dData = await descRes.value.json()
      result.descriptions = (dData.results || []).slice(0, 3).map(d => ({
        type: d.type,
        description: d.description,
        source: d.source,
      }))
    }
    return result
  } catch { return {} }
}

export async function fetchYearlyOccurrences(taxonKey) {
  try {
    const res = await fetch(`${BASE}/occurrence/counts/year?taxonKey=${taxonKey}`)
    if (!res.ok) return []
    const data = await res.json()
    // Data comes as { "1990": 123, "1991": 456, ... }
    return Object.entries(data)
      .filter(([year]) => !isNaN(parseInt(year)) && parseInt(year) >= 1950)
      .map(([year, count]) => ({ year: parseInt(year), count }))
      .sort((a, b) => a.year - b.year)
  } catch { return [] }
}
