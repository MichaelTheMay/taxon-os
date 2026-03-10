const BASE = 'https://api.inaturalist.org/v1'

export async function fetchInatTaxon(name) {
  try {
    const res = await fetch(
      `${BASE}/taxa?q=${encodeURIComponent(name)}&per_page=1&all_names=true`
    )
    if (!res.ok) return null
    const data = await res.json()
    return data.results?.[0] || null
  } catch { return null }
}
export async function fetchInatTaxonByID(id) {
  try {
    const res = await fetch(`${BASE}/taxa/${id}`)
    if (!res.ok) return null
    const data = await res.json()
    return data.results?.[0] || null
  } catch { return null }
}
export async function fetchInatObservations(taxonId, limit = 12) {
  try {
    const res = await fetch(
      `${BASE}/observations?taxon_id=${taxonId}&photos=true&quality_grade=research&order=desc&order_by=created_at&per_page=${limit}`
    )
    if (!res.ok) return []
    const data = await res.json()
    return (data.results || []).map(obs => ({
      id: obs.id,
      photo: obs.photos?.[0]?.url?.replace('square', 'medium'),
      photoSmall: obs.photos?.[0]?.url?.replace('square', 'small'),
      species: obs.species_guess || obs.taxon?.name,
      observer: obs.user?.login,
      date: obs.observed_on,
      place: obs.place_guess,
      lat: obs.geojson?.coordinates?.[1],
      lng: obs.geojson?.coordinates?.[0],
      uri: obs.uri,
    }))
  } catch { return [] }
}
