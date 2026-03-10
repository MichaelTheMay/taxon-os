import { useState, useCallback, useEffect } from 'react'
import TreeCanvas from './components/TreeCanvas'
import TaxonPanel from './components/TaxonPanel'
import SearchBar  from './components/SearchBar'
import ViewModeBar from './components/ViewModeBar'
import Breadcrumb from './components/Breadcrumb'
import StatsBar from './components/StatsBar'
import { matchNames, fetchChildren, fetchLineage } from './api/otl'

// ── Immutable tree update ────────────────────────────────────────────────────
function updateNode(tree, id, updates) {
  if (!tree) return tree
  if (tree.id === id) return { ...tree, ...updates }
  if (!tree.children) return tree
  return { ...tree, children: tree.children.map(c => updateNode(c, id, updates)) }
}

// ── Initial seed taxa ────────────────────────────────────────────────────────
const SEED_NAMES = ['Bacteria', 'Archaea', 'Eukaryota']

export default function App() {
  const [tree,          setTree]          = useState(null)
  const [selectedNode,  setSelectedNode]  = useState(null)
  const [booting,       setBooting]       = useState(true)
  const [bootError,     setBootError]     = useState(null)
  const [totalExpanded, setTotalExpanded] = useState(0)
  const [viewMode,      setViewMode]      = useState('tree')
  const [lineage,       setLineage]       = useState([])

  // ── Initialize tree on load ──────────────────────────────────────────────
  useEffect(() => {
    initTree()
  }, [])

  async function initTree() {
    try {
      setBooting(true)
      setBootError(null)
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
          children: null,
          _loading: false,
          ott_id: m.ott_id,
        }
      }).filter(Boolean)

      setTree({
        id: 'life-root',
        name: 'Life',
        rank: 'root',
        num_tips: 2300000,
        hasChildren: true,
        children: seedNodes,
        _loading: false,
        isRoot: true,
      })
    } catch (err) {
      console.error(err)
      setBootError(err.message)
    } finally {
      setBooting(false)
    }
  }

  // ── Expand a node ────────────────────────────────────────────────────────
  const expandNode = useCallback(async (nodeId) => {
    setTree(prev => updateNode(prev, nodeId, { _loading: true }))

    try {
      const children = await fetchChildren(nodeId)
      const childNodes = children.map(c => ({
        id: c.id,
        name: c.name,
        rank: c.rank,
        num_tips: c.num_tips,
        hasChildren: c.num_tips > 1,
        children: null,
        _loading: false,
        ott_id: c.ott_id,
      }))

      setTree(prev => updateNode(prev, nodeId, {
        children: childNodes,
        _loading: false,
      }))
      setTotalExpanded(n => n + 1)
    } catch (err) {
      console.error('Expand failed:', err)
      setTree(prev => updateNode(prev, nodeId, { _loading: false }))
    }
  }, [])

  // ── Collapse a node ──────────────────────────────────────────────────────
  const collapseNode = useCallback((nodeId) => {
    setTree(prev => updateNode(prev, nodeId, { children: null }))
  }, [])

  // ── Handle node selection ──────────────────────────────────────────────────
  const handleNodeSelect = useCallback((nodeData) => {
    setSelectedNode(nodeData)
    // Fetch lineage for breadcrumb
    if (nodeData?.ott_id) {
      fetchLineage(nodeData.ott_id).then(setLineage).catch(() => setLineage([]))
    } else {
      setLineage([])
    }
  }, [])

  // ── Handle search selection ──────────────────────────────────────────────
  const handleSearchSelect = useCallback((result) => {
    const nodeData = {
      id: result.node_id,
      name: result.name,
      rank: result.rank,
      num_tips: 1,
      hasChildren: false,
      ott_id: result.ott_id,
    }
    handleNodeSelect(nodeData)
  }, [handleNodeSelect])

  // ── Handle navigate from lineage/breadcrumb ──────────────────────────────
  const handleNavigate = useCallback((item) => {
    const nodeData = {
      id: item.node_id || `ott${item.ott_id}`,
      name: item.name,
      rank: item.rank,
      num_tips: 1,
      hasChildren: true,
      ott_id: item.ott_id,
    }
    handleNodeSelect(nodeData)
  }, [handleNodeSelect])

  // ── Count visible nodes ──────────────────────────────────────────────────
  function countNodes(node) {
    if (!node) return 0
    if (!node.children) return 1
    return 1 + node.children.reduce((s, c) => s + countNodes(c), 0)
  }

  const visibleNodes = tree ? countNodes(tree) : 0

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="header-brand">
          <span className="brand-icon">⬡</span>
          <h1 className="brand-name">TaxonOS</h1>
          <span className="brand-sub">Atlas of All Life</span>
        </div>
        <div className="header-center">
          <SearchBar onSelect={handleSearchSelect} />
        </div>
        <div className="header-right">
          <ViewModeBar currentMode={viewMode} onModeChange={setViewMode} />
        </div>
      </header>

      {/* Breadcrumb */}
      {lineage.length > 0 && (
        <Breadcrumb lineage={lineage} onNavigate={handleNavigate} />
      )}

      {/* Main canvas */}
      <main className="app-main">
        {booting ? (
          <div className="boot-screen">
            <div className="boot-orb" />
            <p className="boot-text">Connecting to the Tree of Life…</p>
            <p className="boot-sub">Fetching from Open Tree of Life API</p>
            <div className="boot-domains">
              {SEED_NAMES.map(n => (
                <span key={n} className="boot-domain">{n}</span>
              ))}
            </div>
          </div>
        ) : bootError ? (
          <div className="boot-screen">
            <p className="boot-error">⚠ Failed to load: {bootError}</p>
            <button className="retry-btn" onClick={initTree}>Retry</button>
          </div>
        ) : (
          <TreeCanvas
            treeData={tree}
            selectedNodeId={selectedNode?.id}
            onNodeSelect={handleNodeSelect}
            onNodeExpand={expandNode}
            onNodeCollapse={collapseNode}
          />
        )}

        {selectedNode && (
          <TaxonPanel
            node={selectedNode}
            onClose={() => { setSelectedNode(null); setLineage([]) }}
            onNavigate={handleNavigate}
          />
        )}
      </main>

      {/* Stats bar */}
      <StatsBar
        visibleNodes={visibleNodes}
        expandedClades={totalExpanded}
      />
    </div>
  )
}
