import { actions } from './TreeReducer'
import { matchNames, fetchChildren as apiFetchChildren, fetchLineage, fetchMRCA, fetchRandomTaxon } from '../api/otl'
// Image fetching disabled for performance

const SEED_NAMES = ['Bacteria', 'Archaea', 'Eukaryota']

export async function initTree(dispatch, applyImagery) {
  const matches = await matchNames(SEED_NAMES)

  const seedNodes = SEED_NAMES.map(name => {
    const m = matches.find(r => r.name.toLowerCase() === name.toLowerCase()) ||
              matches.find(r => r.name.toLowerCase().includes(name.toLowerCase()))
    if (!m) return null
    return {
      id: m.node_id,
      name: m.name,
      rank: m.rank,
      num_tips: m.name === 'Eukaryota' ? 2100000 : m.name === 'Bacteria' ? 15000 : 1500,
      hasChildren: true,
      _loading: false,
      ott_id: m.ott_id,
    }
  }).filter(Boolean)

  const rootNode = {
    id: 'life-root',
    name: 'Life',
    rank: 'root',
    num_tips: 2300000,
    hasChildren: true,
    _loading: false,
    isRoot: true,
  }

  dispatch({ type: actions.INIT_TREE, payload: { rootNode, seedNodes } })

  return rootNode
}

export async function expandNode(dispatch, nodeId, applyImagery, currentNodeName) {
  dispatch({ type: actions.SET_LOADING, payload: { nodeId, loading: true } })

  try {
    const children = await apiFetchChildren(nodeId)
    const childNodes = children.map(c => ({
      id: c.id,
      name: c.name,
      rank: c.rank,
      num_tips: c.num_tips,
      hasChildren: c.num_tips > 1,
      _loading: false,
      ott_id: c.ott_id,
    }))

    dispatch({ type: actions.EXPAND_NODE, payload: { nodeId, children: childNodes } })

    return childNodes
  } catch (err) {
    console.error('Expand failed:', err)
    dispatch({ type: actions.SET_LOADING, payload: { nodeId, loading: false } })
    return []
  }
}

export function collapseNode(dispatch, nodeId) {
  dispatch({ type: actions.COLLAPSE_NODE, payload: { nodeId } })
}

export async function expandRecursively(dispatch, nodeId, maxNodes = 50) {
  let count = 0
  let queue = [nodeId]

  while (queue.length > 0 && count < maxNodes) {
    if (window._abortExpansion) {
      window._abortExpansion = false
      break
    }

    const currentId = queue.shift()

    try {
      const children = await apiFetchChildren(currentId)
      if (children && children.length > 0) {
        const childNodes = children.map(c => ({
          id: c.id,
          name: c.name,
          rank: c.rank,
          num_tips: c.num_tips,
          hasChildren: c.num_tips > 1,
          _loading: false,
          ott_id: c.ott_id,
        }))

        dispatch({ type: actions.EXPAND_NODE, payload: { nodeId: currentId, children: childNodes } })
        count++

        const toAdd = childNodes.filter(c => c.hasChildren).map(c => c.id)
        queue.push(...toAdd)
      }
    } catch (e) {
      console.warn('Child fetch in recursion failed', e)
    }

    await new Promise(r => setTimeout(r, 40))
  }
}
