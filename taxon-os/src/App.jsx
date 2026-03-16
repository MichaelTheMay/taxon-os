import { useState, useCallback, useEffect, useReducer, useMemo } from 'react'
import TreeCanvas from './components/TreeCanvas'
import TaxonPanel from './components/TaxonPanel'
import SearchBar  from './components/SearchBar'
import ViewModeBar from './components/ViewModeBar'
import Breadcrumb from './components/Breadcrumb'
import StatsBar from './components/StatsBar'
import ErrorBoundary from './components/ErrorBoundary'
import { AppProvider } from './state/AppContext'
import { treeReducer, initialState, selectHierarchy, countNodes, actions } from './state/TreeReducer'
import { initTree as initTreeAction, expandNode as expandNodeAction, collapseNode as collapseNodeAction, expandRecursively as expandRecursivelyAction } from './state/actions'
import { fetchLineage, fetchMRCA, fetchRandomTaxon, fetchChildren } from './api/otl'
import { soundEngine } from './api/SoundEngine'
import { lifePulse } from './api/LifePulse'
// Image fetching disabled for performance

const SEED_NAMES = ['Bacteria', 'Archaea', 'Eukaryota']

export default function App() {
  const [treeState, dispatch] = useReducer(treeReducer, initialState)
  const [selectedNode,  setSelectedNode]  = useState(null)
  const [booting,       setBooting]       = useState(true)
  const [bootError,     setBootError]     = useState(null)
  const [totalExpanded, setTotalExpanded] = useState(0)
  const [viewMode,      setViewMode]      = useState('tree')
  const [lineage,       setLineage]       = useState([])
  const [soundEnabled,  setSoundEnabled]  = useState(false)
  const [activePulse,   setActivePulse]   = useState(null)
  const [compareNodes,  setCompareNodes]  = useState([])
  const [mrcaInfo,      setMrcaInfo]      = useState(null)
  const [expandingNode, setExpandingNode] = useState(null)
  // Image state removed for performance
  const [labelConfig,   setLabelConfig]   = useState({
    fontSize: 12, fontWeight: 'normal', glow: true, uppercase: false, visible: true
  })
  const [showSettings, setShowSettings] = useState(false)
  const [tracing,       setTracing]      = useState(false)
  const [navTarget, setNavTarget] = useState(null)
  const [navStatus, setNavStatus] = useState('')

  // Reconstruct hierarchical tree for D3
  const tree = useMemo(() => selectHierarchy(treeState), [treeState])
  const visibleNodes = useMemo(() => countNodes(treeState), [treeState])

  // Image prefetching disabled for performance
  const applyImagery = useCallback(() => {}, [])

  // ── Initialize tree on load ──
  useEffect(() => {
    doInit()
    lifePulse.subscribe(pulse => {
      setActivePulse(pulse)
      setTimeout(() => setActivePulse(null), 5000)
    })
    lifePulse.start()
    return () => lifePulse.stop()
  }, [])

  async function doInit() {
    try {
      setBooting(true)
      setBootError(null)
      await initTreeAction(dispatch, applyImagery)
    } catch (err) {
      console.error(err)
      setBootError(err.message)
    } finally {
      setBooting(false)
    }
  }

  // Audio trigger on selection
  useEffect(() => {
    if (selectedNode && soundEnabled) soundEngine.playTaxon(selectedNode.name)
  }, [selectedNode, soundEnabled])

  const toggleSound = () => {
    const next = !soundEnabled
    setSoundEnabled(next)
    if (next) soundEngine.enable(); else soundEngine.disable()
  }

  // ── Expand a node ──
  const expandNode = useCallback(async (nodeId) => {
    const node = treeState.nodes.get(nodeId)
    const result = await expandNodeAction(dispatch, nodeId, applyImagery, node?.name)
    if (result.length) setTotalExpanded(n => n + 1)
  }, [treeState.nodes, applyImagery])

  // ── Collapse a node ──
  const collapseNode = useCallback((nodeId) => {
    collapseNodeAction(dispatch, nodeId)
  }, [])

  // ── Recursive Expansion ──
  const expandRecursively = useCallback(async (nodeId, maxNodes = 50) => {
    setExpandingNode(nodeId)
    await expandRecursivelyAction(dispatch, nodeId, maxNodes)
    setExpandingNode(null)
  }, [])

  // ── Handle node selection ──
  const handleNodeSelect = useCallback((nodeData) => {
    setSelectedNode(nodeData)
    if (nodeData?.ott_id) {
      fetchLineage(nodeData.ott_id).then(setLineage).catch(() => setLineage([]))
    } else {
      setLineage([])
    }
  }, [])

  // ── Handle search selection with Auto-Navigation ──
  const handleSearchSelect = useCallback(async (result) => {
    const nodeData = {
      id: result.node_id,
      name: result.name,
      rank: result.rank,
      num_tips: 1,
      hasChildren: true,
      ott_id: result.ott_id,
    }
    handleNodeSelect(nodeData)
    try {
      const pathLineage = await fetchLineage(result.ott_id)
      const targetPath = pathLineage.reverse()
      setNavTarget(targetPath)
    } catch (err) {
      console.error('Failed to resolve lineage:', err)
    }
  }, [handleNodeSelect])

  // ── Auto-expansion logic effect ──
  useEffect(() => {
    if (!navTarget || !tree) {
      if (navStatus) setNavStatus('')
      return
    }

    const expandNext = async () => {
      let currentNode = tree
      let nextToExpand = null

      const getOtt = id => String(id).replace(/^(ott|life-)/, '')

      for (let i = 0; i < navTarget.length; i++) {
        const step = navTarget[i]
        const stepId = getOtt(step.node_id)

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

  // ── Handle navigate from lineage/breadcrumb ──
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
    setNavTarget(null)
    fetchLineage(item.ott_id).then(l => {
      if (l && l.length > 0) setNavTarget(l.reverse())
    })
  }, [handleNodeSelect])

  // ── Surprise Me: trace Life → random organism ──
  const tracePath = useCallback(async () => {
    if (tracing) return
    setTracing(true)

    try {
      const taxon = await fetchRandomTaxon()
      if (!taxon) return

      const rawLineage = await fetchLineage(taxon.ott_id)
      const path = [...rawLineage].reverse()

      const freshlyExpanded = []
      const delay = ms => new Promise(r => setTimeout(r, ms))
      const getOtt = id => String(id).replace(/^ott/, '')

      const findInTree = (node, ottStr) => {
        if (!node) return null
        if (getOtt(node.id) === ottStr) return node
        if (!node.children) return null
        for (const c of node.children) {
          const found = findInTree(c, ottStr)
          if (found) return found
        }
        return null
      }

      for (let i = 0; i < path.length - 1; i++) {
        const step     = path[i]
        const nextStep = path[i + 1]
        const stepOtt  = getOtt(step.node_id)
        const nextOtt  = getOtt(nextStep.node_id)

        // Read latest tree via selectHierarchy
        const treeSnap = selectHierarchy(treeState)
        const stepNode = findInTree(treeSnap, stepOtt) || (i === 0 ? treeSnap : null)
        if (!stepNode) break

        const alreadyHasNext = stepNode.children?.some(c => getOtt(c.id) === nextOtt || c.name === nextStep.name)

        if (!alreadyHasNext && stepNode.hasChildren) {
          setNavStatus(`Tracing → ${nextStep.name}…`)
          const nodeId = stepNode.id
          try {
            const ch = await fetchChildren(nodeId)
            if (ch && ch.length > 0) {
              const childNodes = ch.map(c => ({
                id: c.id, name: c.name, rank: c.rank,
                num_tips: c.num_tips, hasChildren: c.num_tips > 1,
                _loading: false, ott_id: c.ott_id,
              }))
              dispatch({ type: actions.EXPAND_NODE, payload: { nodeId, children: childNodes } })
              freshlyExpanded.push(nodeId)
            }
          } catch (_) {}
          await delay(750)
        }
      }

      const target = path[path.length - 1]
      const targetNodeData = {
        id: target.node_id,
        name: target.name,
        rank: target.rank,
        num_tips: 1,
        hasChildren: false,
        ott_id: target.ott_id,
      }
      handleNodeSelect(targetNodeData)
      setNavStatus('')

      setTimeout(() => {
        freshlyExpanded.forEach(id => {
          collapseNodeAction(dispatch, id)
        })
      }, 3000)

    } catch (err) {
      console.error('Trace path failed:', err)
      setNavStatus('')
    } finally {
      setTracing(false)
    }
  }, [tracing, handleNodeSelect, treeState])

  // ── Handle Compare Mode ──
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

  // Context value for child components
  const contextValue = useMemo(() => ({
    treeState, dispatch, tree, expandNode, collapseNode, handleNodeSelect
  }), [treeState, tree, expandNode, collapseNode, handleNodeSelect])

  return (
    <ErrorBoundary>
      <AppProvider value={contextValue}>
        <div className="app">
          {/* Header */}
          <header className="app-header">
            <div className="header-brand">
              <span className="brand-icon">⬡</span>
              <h1 className="brand-name">TaxonOS</h1>
              <span className="brand-sub">Atlas of All Life</span>
            </div>
            <div className="header-center">
              <SearchBar onSelect={handleSearchSelect} onSurprise={tracePath} surpriseLoading={tracing} />
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

          {/* Global Biodiversity Pulse Overlay */}
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
                <button className="retry-btn" onClick={doInit}>Retry</button>
              </div>
            ) : (
            <>
              <TreeCanvas
                treeData={tree}
                selectedNodeId={selectedNode?.id}
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
      </AppProvider>
    </ErrorBoundary>
  )
}
