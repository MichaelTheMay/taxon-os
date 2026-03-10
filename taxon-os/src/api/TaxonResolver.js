/**
 * TaxonResolver.js
 * High-level orchestration for taxonomic ID resolution with cross-API support.
 * Ensures consistent mapping of names to unique IDs across sources.
 */

import { getIDMapping, setIDMapping, getAPICache, setAPICache } from './CacheManager'
import { matchGBIF } from './gbif'
import { fetchInatTaxon } from './inaturalist'
import { searchEOL } from './eol'
import { fetchNCBIGenome } from './ncbi'

/**
 * Resolve a scientific name to IDs across all major biology platforms.
 * Checks the local IndexedDB crosswalk first.
 */
export async function resolveTaxonIDs(scientificName) {
  // 1. Check persistent crosswalk
  const cachedIdx = await getIDMapping(scientificName)
  if (cachedIdx) return cachedIdx

  // 2. Perform resolution in parallel
  const [gbif, inat, eol, ncbi] = await Promise.allSettled([
    matchGBIF(scientificName),
    fetchInatTaxon(scientificName),
    searchEOL(scientificName),
    fetchNCBIGenome(scientificName)
  ])

  const ids = {
    gbifKey:  gbif.status === 'fulfilled' ? gbif.value?.usageKey : null,
    inatId:   inat.status === 'fulfilled' ? inat.value?.id : null,
    eolId:    eol.status === 'fulfilled' ? eol.value?.id : null,
    ncbiAcc:  ncbi.status === 'fulfilled' ? ncbi.value?.accession : null,
    resolvedAt: Date.now()
  }

  // 3. Persist for future visits
  if (ids.gbifKey || ids.inatId || ids.eolId || ids.ncbiAcc) {
    await setIDMapping(scientificName, ids)
  }

  return ids
}
