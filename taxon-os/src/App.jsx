import { useState, useCallback, useEffect } from 'react'
import TreeCanvas from './components/TreeCanvas'
import TaxonPanel from './components/TaxonPanel'
import SearchBar  from './components/SearchBar'
import ViewModeBar from './components/ViewModeBar'
import Breadcrumb from './components/Breadcrumb'
import StatsBar from './components/StatsBar'
import { matchNames, fetchChildren, fetchLineage, fetchMRCA } from './api/otl'
import { soundEngine } from './api/SoundEngine'
import { lifePulse } from './api/LifePulse'
import { fetchCladeImagery } from './api/gbif'

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
  
  // Immersive Layers state
  const [soundEnabled,  setSoundEnabled]  = useState(false)
  const [activePulse,   setActivePulse]   = useState(null)
  
  // Phylogenetic Compare Mode
  const [compareNodes,  setCompareNodes]  = useState([]) // [Node1, Node2]
  const [mrcaInfo,      setMrcaInfo]      = useState(null)
  
  // Recursive Expansion state
  const [expandingNode, setExpandingNode] = useState(null) // ID of current root of recursion
  const [isAborting,   setIsAborting]   = useState(false)
  const [abortController, setAbortController] = useState(null)

  // Visual Clusters & Node Imagery
  const [cladeMetaData, setCladeMetaData] = useState({}) // id -> { name, images }
  const [nodeIcons,     setNodeIcons]     = useState({}) // id -> url
  const [labelConfig,   setLabelConfig]   = useState({
    fontSize: 12,
    fontWeight: 'normal',
    glow: true,
    uppercase: false,
    visible: true
  })
  const [showSettings, setShowSettings] = useState(false)

  // ── Initialize tree on load ──────────────────────────────────────────────
  useEffect(() => {
    initTree()
    
    // Initialize LifePulse listener (Addition #8)
    lifePulse.subscribe(pulse => {
      setActivePulse(pulse)
      // Pulse should ideally find the node in tree and animate it
      // For now, we'll just track it
      setTimeout(() => setActivePulse(null), 5000)
    })
    lifePulse.start()

    return () => lifePulse.stop()
  }, [])

  // Audio trigger on selection (Addition #1, #6)
  useEffect(() => {
    if (selectedNode && soundEnabled) {
      soundEngine.playTaxon(selectedNode.name)
    }
  }, [selectedNode, soundEnabled])

  const toggleSound = () => {
    const next = !soundEnabled
    setSoundEnabled(next)
    if (next) soundEngine.enable()
    else soundEngine.disable()
  }

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

      // Fetch clade imagery for the expanded node
      const currentNode = (function findNode(t, id) {
        if (!t) return null
        if (t.id === id) return t
        if (!t.children) return null
        for (const c of t.children) {
          const found = findNode(c, id)
          if (found) return found
        }
        return null
      })(tree, nodeId)

      if (currentNode) {
        fetchCladeImagery(currentNode.name).then(imgs => {
          if (imgs.length > 0) {
            setCladeMetaData(prev => ({ ...prev, [nodeId]: { name: currentNode.name, images: imgs } }))
            setNodeIcons(prev => ({ ...prev, [nodeId]: imgs[0] })) // Set first image as node icon
          }
        })
      }
    } catch (err) {
      console.error('Expand failed:', err)
      setTree(prev => updateNode(prev, nodeId, { _loading: false }))
    }
  }, [])

  // ── Collapse a node ──────────────────────────────────────────────────────
  const collapseNode = useCallback((nodeId) => {
    setTree(prev => updateNode(prev, nodeId, { children: null }))
  }, [])

  // ── Recursive Expansion ────────────────────────────────────────────────────
  const stopExpansion = () => setIsAborting(true)

  const expandRecursively = useCallback(async (nodeId, maxNodes = 50) => {
    setExpandingNode(nodeId)
    setIsAborting(false)
    let count = 0
    let queue = [nodeId]
    
    while (queue.length > 0 && count < maxNodes) {
      // Check for user cancellation
      // We check a local flag because the state update might be slow
      if (window._abortExpansion) {
        window._abortExpansion = false
        break
      }

      const currentId = queue.shift()
      // Skip if already expanded? Usually better to just try or check state
      
      try {
        const children = await fetchChildren(currentId)
        if (children && children.length > 0) {
          const childNodes = children.map(c => ({
            id: c.id,
            name: c.name, rank: c.rank, num_tips: c.num_tips,
            hasChildren: c.num_tips > 1, children: null, _loading: false, ott_id: c.ott_id,
          }))

          setTree(prev => updateNode(prev, currentId, { children: childNodes }))
          setTotalExpanded(n => n + 1)
          count++

          // Add meaningful children to queue (limit to 3 levels deep or specific count)
          // We only queue if they have children and aren't leaves
          const toAdd = childNodes.filter(c => c.hasChildren).map(c => c.id)
          queue.push(...toAdd)
        }
      } catch (e) { console.warn('Child fetch in recursion failed', e) }

      // "Max speed so as to not crash" -> tiny delay for event loop
      await new Promise(r => setTimeout(r, 40)) 
    }
    setExpandingNode(null)
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

    // Fetch icon for selected node if not present
    if (nodeData && !nodeIcons[nodeData.id]) {
      fetchCladeImagery(nodeData.name).then(imgs => {
        if (imgs.length > 0) {
          setNodeIcons(prev => ({ ...prev, [nodeData.id]: imgs[0] }))
        }
      })
    }
  }, [nodeIcons])

  // ── Handle search selection with Auto-Navigation ────────────────────────
  const [navTarget, setNavTarget] = useState(null)

  const handleSearchSelect = useCallback(async (result) => {
    // 1. Set selected node immediately for the panel
    const nodeData = {
      id: result.node_id,
      name: result.name,
      rank: result.rank,
      num_tips: 1,
      hasChildren: true,
      ott_id: result.ott_id,
    }
    handleNodeSelect(nodeData)

    // 2. Start expansion towards target
    try {
      const pathLineage = await fetchLineage(result.ott_id)
      // Lineage is [Target, Parent, Grandparent, ..., Life]
      // Reverse to get [Life, ..., Target]
      const targetPath = pathLineage.reverse()
      setNavTarget(targetPath)
    } catch (err) {
      console.error('Failed to resolve lineage:', err)
    }
  }, [handleNodeSelect])

  // ── Auto-expansion logic effect ──────────────────────────────────────────
  const [navStatus, setNavStatus] = useState('')

  useEffect(() => {
    if (!navTarget || !tree) {
      if (navStatus) setNavStatus('')
      return
    }

    const expandNext = async () => {
      let currentNode = tree
      let nextToExpand = null
      let targetName = navTarget[navTarget.length - 1]?.name

      const getOtt = id => String(id).replace(/^(ott|life-)/, '')

      // Path: [Life, Cellular, Eukaryota, ..., Target]
      for (let i = 0; i < navTarget.length; i++) {
        const step = navTarget[i]
        const stepId = getOtt(step.node_id)
        
        // Match current node
        if (getOtt(currentNode.id) === stepId || (currentNode.isRoot && i === 0)) {
          const nextStep = navTarget[i+1]
          if (!nextStep) {
            setNavStatus('')
            setNavTarget(null)
            break
          }

          if (currentNode.children) {
            const nextStepId = getOtt(nextStep.node_id)
            const matchInTree = currentNode.children.find(c => 
              getOtt(c.id) === nextStepId || c.name === nextStep.name
            )

            if (matchInTree) {
              currentNode = matchInTree
            } else {
              setNavStatus(`Locating ${nextStep.name}…`)
              nextToExpand = currentNode.id
              break
            }
          } else if (currentNode.hasChildren) {
            setNavStatus(`Expanding ${currentNode.name}…`)
            nextToExpand = currentNode.id
            break
          }
        }
      }

      if (nextToExpand) {
        await expandNode(nextToExpand)
      } else {
        setNavStatus('')
        setNavTarget(null)
      }
    }

    const timer = setTimeout(expandNext, 800)
    return () => clearTimeout(timer)
  }, [navTarget, tree, expandNode, navStatus])

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
    
    // Trigger auto-expansion
    setNavTarget(null)
    fetchLineage(item.ott_id).then(l => {
      if (l && l.length > 0) setNavTarget(l.reverse())
    })
  }, [handleNodeSelect])

  // ── Handle Compare Mode (Addition #5) ──────────────────────────────────────
  const handleCompareTrigger = useCallback((node) => {
    if (compareNodes.length === 0) {
      setCompareNodes([node])
    } else if (compareNodes.length === 1) {
      const n2 = node
      const n1 = compareNodes[0]
      if (n1.ott_id === n2.ott_id) return
      
      setCompareNodes([n1, n2])
      setNavStatus(`Calculating MRCA for ${n1.name} & ${n2.name}…`)
      
      fetchMRCA([n1.ott_id, n2.ott_id]).then(res => {
        setMrcaInfo(res)
        setNavStatus(`MRCA: ${res.mrca?.name || 'Life'}`)
        setTimeout(() => setNavStatus(''), 3000)
      }).catch(err => {
        console.error('MRCA failed:', err)
        setNavStatus('Path discovery failed')
      })
    } else {
      setCompareNodes([node])
      setMrcaInfo(null)
    }
  }, [compareNodes])

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
          {navStatus && (
            <div className="nav-status-overlay">
              <span className="nav-status-spinner" />
              {navStatus}
            </div>
          )}
        </div>
        <div className="header-right">
          <button 
            className={`header-sound-btn ${soundEnabled ? 'active' : ''}`} 
            onClick={toggleSound}
            title="Spatial Soundscapes (Xeno-canto)"
          >
            {soundEnabled ? '🔊' : '🔇'}
          </button>
          <ViewModeBar currentMode={viewMode} onModeChange={setViewMode} />
        </div>
      </header>

      {/* Global Biodiversity Pulse Overlay (Addition #8) */}
      {activePulse && (
        <div className="life-pulse-indicator">
          <img src={activePulse.imageUrl} alt="" />
          <div className="pulse-info">
            <div className="pulse-tag">LIVE OBSERVATION</div>
            <div className="pulse-name">{activePulse.taxonName}</div>
            <div className="pulse-place">{activePulse.location}</div>
          </div>
        </div>
      )}

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
        <>
          <TreeCanvas 
            treeData={tree} 
            selectedNodeId={selectedNode?.id} 
            compareNodes={compareNodes}
            mrcaInfo={mrcaInfo}
            cladeMetaData={cladeMetaData}
            nodeIcons={nodeIcons}
            labelConfig={labelConfig}
            onNodeSelect={handleNodeSelect}
            onNodeExpand={expandNode}
            onNodeCollapse={collapseNode}
          />

          {/* Floating Settings Gear */}
          <button 
            className="settings-fab" 
            onClick={() => setShowSettings(!showSettings)}
            title="Tree Visualization Settings"
          >
            ⚙️
          </button>

          {showSettings && (
            <div className="settings-popover glass">
              <h3>Label Formatting</h3>
              <div className="setting-control">
                <label>Size: {labelConfig.fontSize}px</label>
                <input 
                  type="range" min="8" max="24" 
                  value={labelConfig.fontSize} 
                  onChange={e => setLabelConfig(prev => ({ ...prev, fontSize: parseInt(e.target.value) }))} 
                />
              </div>
              <div className="setting-control">
                <label>
                  <input 
                    type="checkbox" 
                    checked={labelConfig.fontWeight === 'bold'} 
                    onChange={e => setLabelConfig(prev => ({ ...prev, fontWeight: e.target.checked ? 'bold' : 'normal' }))} 
                  /> 
                  Bold Labels
                </label>
              </div>
              <div className="setting-control">
                <label>
                  <input 
                    type="checkbox" 
                    checked={labelConfig.glow} 
                    onChange={e => setLabelConfig(prev => ({ ...prev, glow: e.target.checked }))} 
                  /> 
                  Text Glow Effect
                </label>
              </div>
              <div className="setting-control">
                <label>
                  <input 
                    type="checkbox" 
                    checked={labelConfig.uppercase} 
                    onChange={e => setLabelConfig(prev => ({ ...prev, uppercase: e.target.checked }))} 
                  /> 
                  Uppercase
                </label>
              </div>
            </div>
          )}
        </>
      )}

      {selectedNode && (
          <TaxonPanel 
            node={selectedNode} 
            onClose={() => { setSelectedNode(null); setLineage([]) }}
            onNavigate={handleNavigate}
            onCompare={() => handleCompareTrigger(selectedNode)}
            compareMode={!!compareNodes.length}
            isComparing={compareNodes.some(n => n.id === selectedNode?.id)}
            onRecursiveExpand={expandRecursively}
            expandingNode={expandingNode}
            onStopExpansion={() => { window._abortExpansion = true; setExpandingNode(null); }}
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
