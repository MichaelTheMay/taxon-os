// Flat node map: Map<id, NodeData>
// Each node: { id, parentId, childIds, name, rank, num_tips, hasChildren, _loading, ott_id, isRoot }

export const initialState = {
  nodes: new Map(),
  rootId: null,
}

export const actions = {
  INIT_TREE: 'INIT_TREE',
  EXPAND_NODE: 'EXPAND_NODE',
  COLLAPSE_NODE: 'COLLAPSE_NODE',
  UPDATE_NODE: 'UPDATE_NODE',
  SET_LOADING: 'SET_LOADING',
}

export function treeReducer(state, action) {
  switch (action.type) {
    case actions.INIT_TREE: {
      const { rootNode, seedNodes } = action.payload
      const nodes = new Map()
      nodes.set(rootNode.id, {
        ...rootNode,
        parentId: null,
        childIds: seedNodes.map(s => s.id),
      })
      seedNodes.forEach(s => {
        nodes.set(s.id, {
          ...s,
          parentId: rootNode.id,
          childIds: null,
        })
      })
      return { nodes, rootId: rootNode.id }
    }

    case actions.SET_LOADING: {
      const { nodeId, loading } = action.payload
      const nodes = new Map(state.nodes)
      const node = nodes.get(nodeId)
      if (node) nodes.set(nodeId, { ...node, _loading: loading })
      return { ...state, nodes }
    }

    case actions.EXPAND_NODE: {
      const { nodeId, children } = action.payload
      const nodes = new Map(state.nodes)
      const parent = nodes.get(nodeId)
      if (!parent) return state

      const childIds = children.map(c => c.id)
      nodes.set(nodeId, { ...parent, childIds, _loading: false })

      children.forEach(c => {
        nodes.set(c.id, {
          ...c,
          parentId: nodeId,
          childIds: null,
        })
      })
      return { ...state, nodes }
    }

    case actions.COLLAPSE_NODE: {
      const { nodeId } = action.payload
      const nodes = new Map(state.nodes)
      // Recursively remove all descendants
      const removeDescendants = (id) => {
        const node = nodes.get(id)
        if (!node?.childIds) return
        node.childIds.forEach(cid => {
          removeDescendants(cid)
          nodes.delete(cid)
        })
      }
      removeDescendants(nodeId)
      const node = nodes.get(nodeId)
      if (node) nodes.set(nodeId, { ...node, childIds: null })
      return { ...state, nodes }
    }

    case actions.UPDATE_NODE: {
      const { nodeId, updates } = action.payload
      const nodes = new Map(state.nodes)
      const node = nodes.get(nodeId)
      if (node) nodes.set(nodeId, { ...node, ...updates })
      return { ...state, nodes }
    }

    default:
      return state
  }
}

// Selector: reconstruct hierarchical tree from flat map (for D3)
export function selectHierarchy(state) {
  if (!state.rootId || state.nodes.size === 0) return null

  const buildNode = (id) => {
    const node = state.nodes.get(id)
    if (!node) return null
    const result = {
      id: node.id,
      name: node.name,
      rank: node.rank,
      num_tips: node.num_tips,
      hasChildren: node.hasChildren,
      _loading: node._loading,
      ott_id: node.ott_id,
      isRoot: node.isRoot,
    }
    if (node.childIds && node.childIds.length > 0) {
      result.children = node.childIds.map(buildNode).filter(Boolean)
    } else {
      result.children = null
    }
    return result
  }

  return buildNode(state.rootId)
}

// Count total nodes in the flat map
export function countNodes(state) {
  return state.nodes.size
}
