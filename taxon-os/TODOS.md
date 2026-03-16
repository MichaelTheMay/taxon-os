# TaxonOS — Deferred Work

## Cross-validate EOL and Wikidata sources
**What:** Add kingdom cross-validation to EOL and Wikidata API resolvers (currently only GBIF + iNat are validated).
**Why:** EOL's `searchEOL()` is text-search based and could return wrong organisms. Wikidata SPARQL matches by exact scientific name which is also ambiguous for short/common names. Both should eventually get the same kingdom cross-check that GBIF and iNat now have.
**Context:** `TaxonResolver.js` already validates GBIF (via `kingdom` field) and iNat (via `iconic_taxon_name`). EOL returns no kingdom in search results — would need to fetch the full page and check `taxonConcepts`. Wikidata could check `P105` (taxon rank) against lineage.
**Depends on:** Data accuracy fix (GBIF + iNat validation) must land first.

## LOD hull click-to-zoom
**What:** Clicking a hull blob at zoom-out should smoothly zoom the camera to show that clade's children at full resolution.
**Why:** Natural UX: at zoom-out you see "Metazoa" blob, click it, camera zooms to show Metazoa's children as individual nodes. Complements the LOD system.
**Context:** `autoFit()` already computes bounding box and animates zoom. Hull elements have clade ID in their data. Would need a click handler on `.hull-path` that calls `autoFit(childNodes)` with the hull's children positions.
**Depends on:** LOD hull system must be implemented first.
