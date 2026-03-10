/**
 * nameParser.js
 * Uses the GBIF Name Parser API to decompose and normalize taxonomic names.
 * Ensures we are querying with the canonical form.
 */

const BASE = 'https://api.gbif.org/v1/parser/name'

export async function parseTaxonName(name) {
  try {
    const res = await fetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([name])
    })
    
    if (!res.ok) return null
    const data = await res.json()
    const result = data[0]
    
    if (result && result.canonicalName) {
      return {
        canonicalName: result.canonicalName,
        scientificName: result.scientificName,
        genus: result.genusOrAbove,
        species: result.specificEpithet,
        rank: result.rank,
        authorship: result.authorship,
        type: result.type // SCIENTIFIC, VIRUS, HYBRID, etc.
      }
    }
    return null
  } catch (err) {
    console.warn('GBIF Name Parser failed:', err)
    return null
  }
}
