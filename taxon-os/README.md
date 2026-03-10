# TaxonOS — Atlas of All Life

A living, interactive explorer of the entire tree of life. Built as a significant step beyond OneZoom — live data from multiple APIs, rich species detail panels, and a modular architecture designed for rapid expansion.

## 🚀 Run Tonight

```bash
cd taxon-os
npm install
npm run dev
# → http://localhost:5173
```

## 🧬 What It Does

- **Radial phylogenetic tree** backed by Open Tree of Life (2.3M taxa)
- **Click any node** to expand its subtree (live API call)
- **Click to select** — side panel loads Wikipedia, GBIF occurrence counts, iNaturalist photos
- **Search any organism** — autocomplete via OTL TNRS
- **Color-coded by clade** — Bacteria, Archaea, Eukaryota, Fungi, Plants, Animals, etc.
- **Node size** scales with species richness (log scale)
- **Zoom/pan** — full D3 zoom behavior

## 🔌 Data Sources

| Source | What it provides |
|--------|-----------------|
| [Open Tree of Life](https://opentreeoflife.org) | Phylogenetic tree, 2.3M taxa |
| [GBIF](https://gbif.org) | Species matching, occurrence counts, images |
| [Wikipedia](https://en.wikipedia.org) | Species summaries, thumbnails |
| [iNaturalist](https://inaturalist.org) | Taxon photos, observation counts |

All APIs are free, no auth required (GBIF/iNat have generous anonymous limits).

## 🗺 Architecture

```
src/
  App.jsx               — state management, tree expansion logic
  api/
    otl.js              — Open Tree of Life API (search, children, info)
    gbif.js             — GBIF API (match, occurrence images, counts)
    wikipedia.js        — Wikipedia REST API
    inaturalist.js      — iNaturalist API
  components/
    TreeCanvas.jsx      — D3 radial tree (the main viz)
    TaxonPanel.jsx      — Species detail panel
    SearchBar.jsx       — Autocomplete search
  styles/
    globals.css         — Bioluminescent dark theme
```

## 🛣 Expansion Roadmap

### Week 1
- [ ] Globe view (Deck.gl + GBIF occurrence heatmap)
- [ ] EOL TraitBank API — trait overlays on tree
- [ ] PBDB fossil ranges — geological timeline view

### Week 2
- [ ] FastAPI backend + PostgreSQL
- [ ] Meilisearch for full-text search
- [ ] Pre-fetched GBIF bulk data (for performance)

### Week 3
- [ ] MCP server (FastMCP) with full tool catalog
- [ ] `get_taxon`, `get_children`, `compare_traits`, `get_occurrences`, etc.

### Month 2
- [ ] Trait Space PCA view (d3 force layout in trait space)
- [ ] Convergent evolution finder
- [ ] User species lists / life lists
- [ ] Embed widget for any subtree

## Notes

- OTL children endpoint is limited to named taxa (unnamed mrca nodes are filtered out)
- Nodes are capped at 30 children per expansion for performance
- All API calls are made directly from browser (CORS supported by all sources)
