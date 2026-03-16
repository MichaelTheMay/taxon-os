# Changelog

All notable changes to TaxonOS will be documented in this file.

## [0.2.0] - 2026-03-16

### Added
- **State architecture**: useReducer + Context replaces 20+ useState calls in App.jsx; flat node Map with O(1) updates
- **Error boundary**: React ErrorBoundary wrapping entire app with retry UI
- **useApiData hook**: Reusable `{data, loading, error, retry}` pattern for API calls
- **API proxy**: Vercel serverless proxy (`api/proxy.js`) with in-memory caching (5min TTL) and per-domain rate limiting (60 req/min)
- **Deployment config**: `vercel.json` with rewrites for OTL and Xeno-canto API proxying
- **LOD clustering**: Semantic Level-of-Detail system — expanded clades with >5 children get convex hull blobs at zoom-out, fading to individual nodes on zoom-in
- **Data cross-validation**: Kingdom-aware API resolution prevents cross-taxon mismatches (e.g. iNat returning mushrooms for "Homo")
- **API caching**: IndexedDB caching for OTL `node_info` responses via CacheManager (7-day TTL)
- **TODOS.md**: Deferred work tracking

### Changed
- **TreeCanvas**: Removed all SVG filters (feDropShadow, feGaussianBlur), aura circles, nebula layer, and per-link gradients for dramatically improved rendering performance
- **TreeCanvas**: Incremental D3 simulation — keeps sim alive across renders, diffs nodes, gentle restart instead of full rebuild
- **TreeCanvas**: Zoom handler uses cached label element refs instead of DOM selectAll traversal
- **TaxonPanel**: Image merge order now GBIF-first (more reliable for validated taxa)
- **TaxonPanel**: Lineage fetched before ID resolution to provide kingdom context
- **TaxonResolver**: Accepts kingdom context, validates GBIF/iNat results against OTL lineage, kingdom-scoped cache keys
- **inaturalist.js**: `fetchInatTaxon` accepts kingdom filter via `taxon_id` parameter
- **gbif.js**: `matchGBIF` accepts optional kingdom parameter
- **Node rendering**: Solid color-coded bubbles (no images) — 3 SVG elements per node instead of 6

### Fixed
- **XSS**: TreeCanvas tooltip uses `.text()` instead of `.html()` for all user-facing content
- **XSS**: TaxonPanel sanitizes EOL article text and iNat wikipedia_summary via `stripHtml()`
- **Critical bug**: TaxonPanel `resolveTaxonIDs` wrapped in try/catch (was uncaught)
- **Data accuracy**: Cross-kingdom API mismatches (e.g. iNat returning Fungi for Animalia queries) now detected and discarded
- **Cache poisoning**: Stale crosswalk entries with wrong kingdom no longer persist (kingdom included in cache key)

### Removed
- Committed `dist/` files from git tracking (now in `.gitignore`)
- SVG filter definitions (glow-d0 through glow-d3, aura-blur)
- Per-link linearGradient creation and tick-time gradient coordinate updates
- Nebula blur layer behind expanded clades
- Node image collage system (fetchCladeImagery and all GBIF image prefetching)

## [0.1.0] - 2026-03-15

- Initial prototype: React + D3 force-directed phylogenetic tree with 8 API integrations
