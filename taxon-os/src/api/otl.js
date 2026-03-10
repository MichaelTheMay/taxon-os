const BASE = '/otl-api'

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`OTL ${path} failed: ${res.status}`)
  return res.json()
}

export async function matchNames(names) {
  const data = await post('/tnrs/match_names', { names })
  return data.results
    .map(r => {
      const best = r.matches?.[0]
      if (!best?.taxon?.ott_id) return null
      return {
        name: best.taxon.name,
        ott_id: best.taxon.ott_id,
        rank: best.taxon.rank || 'no rank',
        node_id: `ott${best.taxon.ott_id}`,
        score: best.score,
      }
    })
    .filter(Boolean)
}

export async function fetchChildren(nodeId) {
  const data = await post('/tree_of_life/children', { node_id: nodeId })
  return (data.children || [])
    .filter(c => c.taxon?.name && !c.node_id?.startsWith('mrca'))
    .sort((a, b) => (b.num_tips || 0) - (a.num_tips || 0))
    .slice(0, 50)
    .map(c => ({
      id: `ott${c.taxon.ott_id}`,
      node_id: c.node_id || `ott${c.taxon.ott_id}`,
      name: c.taxon.name,
      rank: c.taxon.rank || 'no rank',
      num_tips: c.num_tips || 1,
      ott_id: c.taxon.ott_id,
    }))
}

export async function fetchNodeInfo(nodeId) {
  return post('/tree_of_life/node_info', { node_id: nodeId, include_lineage: true })
}

export async function fetchLineage(ottId) {
  try {
    const data = await post('/taxonomy/taxon_info', {
      ott_id: ottId,
      include_lineage: true,
    })
    const lineage = (data.lineage || []).map(t => ({
      name: t.name,
      rank: t.rank || 'no rank',
      ott_id: t.ott_id,
      node_id: `ott${t.ott_id}`,
    }))
    // Add the taxon itself at the front
    lineage.unshift({
      name: data.name,
      rank: data.rank || 'no rank',
      ott_id: data.ott_id,
      node_id: `ott${data.ott_id}`,
    })
    return lineage
  } catch {
    return []
  }
}

export async function searchTaxa(query) {
  const data = await post('/tnrs/match_names', { names: [query] })
  const result = data.results?.[0]
  return (result?.matches || [])
    .filter(m => m.taxon?.ott_id && m.score > 0.4)
    .slice(0, 12)
    .map(m => ({
      name: m.taxon.name,
      ott_id: m.taxon.ott_id,
      rank: m.taxon.rank || 'no rank',
      node_id: `ott${m.taxon.ott_id}`,
      score: m.score,
    }))
}

// Curated interesting taxa for "Surprise Me"
const SURPRISE_TAXA = [
  'Tardigrada', 'Cephalopoda', 'Mantis shrimp', 'Axolotl', 'Platypus',
  'Coelacanth', 'Nautilus', 'Pangolin', 'Quetzal', 'Rafflesia',
  'Venus flytrap', 'Giant sequoia', 'Blue whale', 'Hummingbird',
  'Dragonfly', 'Seahorse', 'Starfish', 'Jellyfish', 'Coral',
  'Mushroom', 'Lichen', 'Slime mold', 'Diatom', 'Archaeopteryx',
  'Tuatara', 'Komodo dragon', 'Chameleon', 'Octopus', 'Narwhal',
  'Snow leopard', 'Red panda', 'Wolverine', 'Honey badger', 'Capybara',
  'Kakapo', 'Hoatzin', 'Shoebill', 'Secretary bird', 'Flamingo',
  'Baobab', 'Welwitschia', 'Ginkgo', 'Cycad', 'Fern',
  'Horseshoe crab', 'Trilobite', 'Ammonite', 'Velvet worm', 'Lamprey',
]

export async function fetchRandomTaxon() {
  const name = SURPRISE_TAXA[Math.floor(Math.random() * SURPRISE_TAXA.length)]
  const results = await searchTaxa(name)
  return results[0] || null
}
