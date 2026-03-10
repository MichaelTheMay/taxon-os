/**
 * Wikidata SPARQL API
 * CORS-enabled, no key needed.
 * Returns structured facts: lifespan, mass, diet, genome size, habitat, etc.
 */

const WDQS = 'https://query.wikidata.org/sparql'

// Fetch rich structured facts about a taxon by scientific name
export async function fetchWikidataFacts(scientificName) {
  const query = `
    SELECT ?item ?itemLabel ?taxonRank ?taxonRankLabel
      ?mass ?massUnit ?lifespan ?lifespanUnit
      ?diet ?dietLabel ?habitat ?habitatLabel
      ?conservationStatus ?conservationStatusLabel
      ?genomeSize ?genomeSizeUnit
      ?image ?commonNameEn
    WHERE {
      ?item wdt:P225 "${scientificName}" .
      OPTIONAL { ?item wdt:P105 ?taxonRank }
      OPTIONAL { ?item p:P2067 ?massStmt . ?massStmt psv:P2067 ?massVal . ?massVal wikibase:quantityAmount ?mass ; wikibase:quantityUnit ?massUnit }
      OPTIONAL { ?item p:P2556 ?lifespanStmt . ?lifespanStmt psv:P2556 ?lifespanVal . ?lifespanVal wikibase:quantityAmount ?lifespan ; wikibase:quantityUnit ?lifespanUnit }
      OPTIONAL { ?item wdt:P1034 ?diet }
      OPTIONAL { ?item wdt:P2974 ?habitat }
      OPTIONAL { ?item wdt:P141 ?conservationStatus }
      OPTIONAL { ?item wdt:P18 ?image }
      OPTIONAL { ?item wikibase:label ?commonNameEn . FILTER(LANG(?commonNameEn) = "en") }
    }
    LIMIT 1
  `

  try {
    const url = `${WDQS}?query=${encodeURIComponent(query)}&format=json&origin=*`
    const res = await fetch(url, {
      headers: { Accept: 'application/sparql-results+json' },
    })
    if (!res.ok) return null
    const data = await res.json()
    const row = data.results?.bindings?.[0]
    if (!row) return null

    return {
      wikidataId: row.item?.value?.split('/').pop(),
      mass: row.mass?.value ? `${parseFloat(row.mass.value).toFixed(1)} kg` : null,
      lifespan: row.lifespan?.value ? `${parseFloat(row.lifespan.value).toFixed(1)} years` : null,
      diet: row.dietLabel?.value || null,
      habitat: row.habitatLabel?.value || null,
      conservationStatus: row.conservationStatusLabel?.value || null,
      image: row.image?.value || null,
    }
  } catch (err) {
    console.warn('Wikidata SPARQL failed:', err)
    return null
  }
}

// Lightweight version: just fetch key properties by taxon name
export async function fetchWikidataQuickFacts(name) {
  const query = `
    SELECT ?item ?mass ?lifespan ?image ?diet ?habitatLabel
    WHERE {
      ?item wdt:P225 "${name.replace(/"/g, '\\"')}" .
      OPTIONAL { ?item wdt:P2067 ?mass }
      OPTIONAL { ?item wdt:P2556 ?lifespan }
      OPTIONAL { ?item wdt:P18 ?image }
      OPTIONAL { ?item wdt:P1034 ?dietItem . ?dietItem rdfs:label ?diet . FILTER(LANG(?diet) = "en") }
      OPTIONAL { ?item wdt:P2974 ?habitatItem . ?habitatItem rdfs:label ?habitatLabel . FILTER(LANG(?habitatLabel) = "en") }
    }
    LIMIT 1
  `

  try {
    const url = `${WDQS}?query=${encodeURIComponent(query)}&format=json&origin=*`
    const res = await fetch(url, {
      headers: { Accept: 'application/sparql-results+json' },
    })
    if (!res.ok) return null
    const data = await res.json()
    const row = data.results?.bindings?.[0]
    if (!row) return null

    const massKg = row.mass?.value ? parseFloat(row.mass.value) : null
    const massDisplay = massKg != null
      ? massKg >= 1 ? `${massKg.toFixed(1)} kg` : `${(massKg * 1000).toFixed(0)} g`
      : null

    const lifespanYrs = row.lifespan?.value ? parseFloat(row.lifespan.value) : null
    const lifespanDisplay = lifespanYrs != null
      ? lifespanYrs >= 1 ? `${lifespanYrs.toFixed(0)} years` : `${(lifespanYrs * 12).toFixed(0)} months`
      : null

    return {
      mass: massDisplay,
      lifespan: lifespanDisplay,
      diet: row.diet?.value || null,
      habitat: row.habitatLabel?.value || null,
      image: row.image?.value || null,
      wikidataId: row.item?.value?.split('/').pop(),
    }
  } catch (err) {
    console.warn('Wikidata quick facts failed:', err)
    return null
  }
}
