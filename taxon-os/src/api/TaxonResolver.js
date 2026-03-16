/**
 * TaxonResolver.js
 * Resolves scientific names to IDs across biology APIs with kingdom cross-validation.
 *
 * Data flow:
 *   name + kingdom (from OTL lineage)
 *       │
 *       ├── check crosswalk cache (key: "name|kingdom")
 *       │
 *       ├── matchGBIF(name, { kingdom })  ─── validate gbif.kingdom matches
 *       ├── fetchInatTaxon(name, { kingdom }) ── validate inat.iconic_taxon_name
 *       ├── searchEOL(name)               ─── no validation yet (deferred)
 *       └── fetchNCBIGenome(name)         ─── no validation yet
 *
 *   Mismatched sources are discarded (id set to null).
 */

import { getIDMapping, setIDMapping } from './CacheManager'
import { matchGBIF } from './gbif'
import { fetchInatTaxon } from './inaturalist'
import { searchEOL } from './eol'
import { fetchNCBIGenome } from './ncbi'

// iNat iconic_taxon_name values that map to OTL kingdoms
const INAT_KINGDOM_MAP = {
  Animalia: 'Animalia',
  Plantae: 'Plantae',
  Fungi: 'Fungi',
  Chromista: 'Chromista',
  Protozoa: 'Protozoa',
  // iNat uses broader iconic names for some groups
  Mammalia: 'Animalia', Aves: 'Animalia', Reptilia: 'Animalia',
  Amphibia: 'Animalia', Actinopterygii: 'Animalia', Mollusca: 'Animalia',
  Arachnida: 'Animalia', Insecta: 'Animalia',
}

function inatKingdomOf(inatTaxon) {
  if (!inatTaxon) return null
  const iconic = inatTaxon.iconic_taxon_name
  return INAT_KINGDOM_MAP[iconic] || iconic || null
}

/**
 * Resolve a scientific name to IDs across all major biology platforms.
 * @param {string} scientificName
 * @param {{ kingdom?: string, phylum?: string }} context - from OTL lineage
 */
export async function resolveTaxonIDs(scientificName, context = {}) {
  const kingdom = context.kingdom || null
  const cacheKey = kingdom ? `${scientificName}|${kingdom}` : scientificName

  // 1. Check persistent crosswalk
  const cachedIdx = await getIDMapping(cacheKey)
  if (cachedIdx) return cachedIdx

  // 2. Perform resolution in parallel, passing kingdom context where supported
  const [gbif, inat, eol, ncbi] = await Promise.allSettled([
    matchGBIF(scientificName, kingdom ? { kingdom } : {}),
    fetchInatTaxon(scientificName, kingdom ? { kingdom } : {}),
    searchEOL(scientificName),
    fetchNCBIGenome(scientificName)
  ])

  const gbifResult = gbif.status === 'fulfilled' ? gbif.value : null
  const inatResult = inat.status === 'fulfilled' ? inat.value : null

  // 3. Cross-validate: discard sources whose kingdom doesn't match OTL ground truth
  let gbifKey = gbifResult?.usageKey || null
  let inatId = inatResult?.id || null

  if (kingdom && gbifKey && gbifResult.kingdom) {
    if (gbifResult.kingdom.toLowerCase() !== kingdom.toLowerCase()) {
      console.warn(`TaxonResolver: GBIF kingdom mismatch for "${scientificName}": expected ${kingdom}, got ${gbifResult.kingdom}. Discarding.`)
      gbifKey = null
    }
  }

  if (kingdom && inatId) {
    const inatKingdom = inatKingdomOf(inatResult)
    if (inatKingdom && inatKingdom.toLowerCase() !== kingdom.toLowerCase()) {
      console.warn(`TaxonResolver: iNat kingdom mismatch for "${scientificName}": expected ${kingdom}, got ${inatKingdom}. Discarding.`)
      inatId = null
    }
  }

  const ids = {
    gbifKey,
    inatId,
    eolId:    eol.status === 'fulfilled' ? eol.value?.id : null,
    ncbiAcc:  ncbi.status === 'fulfilled' ? ncbi.value?.accession : null,
    kingdom,
    resolvedAt: Date.now()
  }

  // 4. Persist for future visits (kingdom-scoped key)
  if (ids.gbifKey || ids.inatId || ids.eolId || ids.ncbiAcc) {
    await setIDMapping(cacheKey, ids)
  }

  return ids
}
