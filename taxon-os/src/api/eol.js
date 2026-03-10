/**
 * Encyclopedia of Life (EOL) API
 * Search for taxa by name, then fetch rich page data.
 * No API key needed for basic access. Some CORS issues may require proxy.
 */

const EOL_SEARCH = 'https://eol.org/api/search/1.0.json'
const EOL_PAGES  = 'https://eol.org/api/pages/1.0'

export async function searchEOL(name) {
  try {
    const res = await fetch(
      `${EOL_SEARCH}?q=${encodeURIComponent(name)}&page=1&exact=false&limit=3`
    )
    if (!res.ok) return null
    const data = await res.json()
    return data.results?.[0] || null // { id, title, link }
  } catch (err) {
    console.warn('EOL search failed:', err)
    return null
  }
}

export async function fetchEOLPage(pageId) {
  try {
    const res = await fetch(
      `${EOL_PAGES}/${pageId}.json?details=1&common_names=true&taxonomy=true&images_per_page=3`
    )
    if (!res.ok) return null
    const data = await res.json()

    const taxon = data.taxonConcepts?.[0]
    const commonNames = (data.vernacularNames || [])
      .filter(v => v.language === 'en')
      .slice(0, 5)
      .map(v => v.vernacularName)

    const dataObjects = data.dataObjects || []
    const images = dataObjects
      .filter(d => d.dataType === 'http://purl.org/dc/dcmitype/StillImage' && d.eolMediaURL)
      .slice(0, 5)
      .map(d => ({
        url: d.eolMediaURL,
        credit: d.rightsHolder || d.agents?.[0]?.full_name,
        license: d.license,
        description: d.description,
      }))

    const articles = dataObjects
      .filter(d => d.dataType === 'http://purl.org/dc/dcmitype/Text' && d.description)
      .slice(0, 2)
      .map(d => ({
        type: d.dataSubtype || d.source,
        text: d.description,
      }))

    return {
      id: pageId,
      eolUrl: `https://eol.org/pages/${pageId}`,
      scientificName: taxon?.scientificName,
      commonNames,
      images,
      articles,
    }
  } catch (err) {
    console.warn('EOL page fetch failed:', err)
    return null
  }
}

// Combined: search + fetch in one step
export async function fetchEOLData(name) {
  const result = await searchEOL(name)
  if (!result?.id) return null
  return fetchEOLPage(result.id)
}
