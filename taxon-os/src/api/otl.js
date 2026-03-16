import { getAPICache, setAPICache } from './CacheManager'

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
  const ottId = parseInt(nodeId.replace(/^ott/, ''), 10)
  if (isNaN(ottId)) return []
  
  // 1. Get taxonomic children
  const taxData = await post('/taxonomy/taxon_info', { ott_id: ottId, include_children: true }).catch(() => null)
  if (!taxData || !taxData.children) return []
  
  // 2. Filter problematic or extinct clades to keep the tree clean
  let children = taxData.children.filter(c => {
    const hidden = c.flags?.some(f => ['incertae_sedis', 'unplaced', 'viral', 'extinct', 'barren', 'hidden'].includes(f))
    return !hidden
  })
  
  // Limit to top 30 to avoid hammering the API
  children = children.slice(0, 30)
  
  // 3. Fetch num_tips for all children in parallel, with IndexedDB caching
  const nodes = await Promise.all(children.map(async c => {
    const cacheKey = `ott${c.ott_id}`
    const cached = await getAPICache('otl_node_info', cacheKey)
    let numTips = cached?.num_tips
    if (numTips == null) {
      const nInfo = await post('/tree_of_life/node_info', { node_id: cacheKey }).catch(() => null)
      numTips = nInfo?.num_tips || 1
      setAPICache('otl_node_info', cacheKey, { num_tips: numTips })
    }
    return {
      id: cacheKey,
      node_id: cacheKey,
      name: c.name,
      rank: c.rank || 'no rank',
      num_tips: numTips,
      ott_id: c.ott_id,
    }
  }))
  
  // 4. Return sorted by tip count (biggest clades first)
  return nodes.sort((a, b) => b.num_tips - a.num_tips)
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

export async function fetchMRCA(ottIds) {
  return post('/tree_of_life/mrca', { ott_ids: ottIds })
}
