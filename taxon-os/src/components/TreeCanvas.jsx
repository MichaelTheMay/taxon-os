import { useEffect, useRef, useCallback } from 'react'
import * as d3 from 'd3'
import { fmtNum } from '../utils/format'

// ── Color palette ────────────────────────────────────────────────────────────
const CLADE_COLORS = {
  Bacteria:      '#FF6B35',
  Archaea:       '#C084FC',
  Eukaryota:     '#00FFD4',
  Fungi:         '#FBBF24',
  Viridiplantae: '#4ADE80',
  Metazoa:       '#60A5FA',
  Amoebozoa:     '#F472B6',
  Alveolata:     '#34D399',
  Stramenopiles: '#A78BFA',
  Rhodophyta:    '#FB7185',
  default:       '#94A3B8',
}

function cladeColor(d) {
  let cur = d
  while (cur) { if (CLADE_COLORS[cur.data.name]) return CLADE_COLORS[cur.data.name]; cur = cur.parent }
  return CLADE_COLORS.default
}

function hexToRgba(hex, a) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16)
  return `rgba(${r},${g},${b},${a})`
}

function nodeRadius(d) {
  const t = d.data.num_tips || 1
  if (d.depth === 0) return 88
  if (d.data.children) return Math.max(38, Math.min(110, 16 + Math.log10(t+2)*20))
  return Math.max(16, Math.min(50, 9 + Math.log10(t+2)*12))
}

function boundingBox(nodes) {
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity
  nodes.forEach(d => {
    if (!d.x||!d.y) return
    x0=Math.min(x0,d.x-d.r); y0=Math.min(y0,d.y-d.r)
    x1=Math.max(x1,d.x+d.r); y1=Math.max(y1,d.y+d.r)
  })
  return {x0,y0,x1,y1,w:x1-x0,h:y1-y0}
}

// ────────────────────────────────────────────────────────────────────────────
export default function TreeCanvas({
  treeData, selectedNodeId,
  labelConfig={fontSize:12,fontWeight:'normal'},
  onNodeSelect, onNodeExpand, onNodeCollapse,
}) {
  const svgRef       = useRef(null)
  const gRef         = useRef(null)
  const zoomRef      = useRef(null)
  const simRef       = useRef(null)
  const tooltipRef   = useRef(null)
  const posCache     = useRef({})
  const prevNodeIds  = useRef(new Set())
  const labelElsRef  = useRef([])
  const nodeLayerRef = useRef(null)
  const linkLayerRef = useRef(null)
  // LOD hull system: Map<cladeId, { path, color, label, numTips, childIds }>
  const hullsRef     = useRef(new Map())
  const hullLayerRef = useRef(null)
  // Track all hierarchy nodes for hull computation
  const allNodesRef  = useRef([])

  // ── Zoom setup ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    const zoom = d3.zoom().scaleExtent([0.015, 18])
      .on('zoom', ({ transform: t }) => {
        d3.select(gRef.current).attr('transform', t)

        // LOD: hull/node visibility based on zoom scale
        //   scale < 0.3:  hulls=1, child nodes=0
        //   0.3–1.0:      interpolate
        //   scale > 1.0:  hulls=0, child nodes=1
        const hulls = hullsRef.current
        const hasHulls = hulls.size > 0
        const hullChildIds = hasHulls ? new Set() : null
        if (hasHulls) {
          hulls.forEach(h => h.childIds.forEach(id => hullChildIds.add(id)))
        }

        const hullOpacity = hasHulls
          ? t.k < 0.3 ? 1 : t.k > 1.0 ? 0 : 1 - (t.k - 0.3) / 0.7
          : 0
        const childOpacity = hasHulls
          ? t.k < 0.3 ? 0 : t.k > 1.0 ? 1 : (t.k - 0.3) / 0.7
          : 1

        // Update hull layer visibility
        if (hullLayerRef.current) {
          hullLayerRef.current.style('opacity', hullOpacity)
        }

        // Update label + node visibility
        const labels = labelElsRef.current
        for (let i = 0; i < labels.length; i++) {
          const el = labels[i]
          const d = el.__data__
          if (!d) continue
          // If this node is inside a hull cluster, use LOD opacity
          if (hasHulls && hullChildIds.has(d.data.id)) {
            el.style.opacity = childOpacity * (d.data.children ? (t.k > 0.2 ? 1 : 0) : (t.k > 1.0 ? 1 : 0))
          } else {
            el.style.opacity = d.data.children ? (t.k > 0.2 ? 1 : 0) : (t.k > 1.0 ? 1 : 0)
          }
          // Also fade the parent node-group for LOD children
          const group = el.parentNode
          if (hasHulls && hullChildIds.has(d.data.id) && group) {
            group.style.opacity = childOpacity
          } else if (group) {
            group.style.opacity = ''
          }
        }
      })
    svg.call(zoom)
    zoomRef.current = zoom
    const { width, height } = svgRef.current.getBoundingClientRect()
    svg.call(zoom.transform, d3.zoomIdentity.translate(width/2, height/2).scale(0.6))
    return () => svg.on('.zoom', null)
  }, [])

  const autoFit = useCallback((nodes) => {
    if (!svgRef.current || !zoomRef.current) return
    const bb = boundingBox(nodes)
    if (!isFinite(bb.w)) return
    const { width, height } = svgRef.current.getBoundingClientRect()
    const pad = 120
    const scale = Math.min(0.95, (width-pad) / bb.w, (height-pad) / bb.h)
    const cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2
    d3.select(svgRef.current).transition().duration(900).ease(d3.easeCubicInOut)
      .call(zoomRef.current.transform, d3.zoomIdentity.translate(width/2 - cx*scale, height/2 - cy*scale).scale(scale))
  }, [])

  // ── Tooltip (XSS-safe) ─────────────────────────────────────────────────────
  const showTipRef = useRef(null)
  const hideTipRef = useRef(null)
  useEffect(() => {
    const tip = d3.select(tooltipRef.current)
    showTipRef.current = (ev, d) => {
      tip.style('opacity',1)
        .style('left',`${ev.clientX+18}px`).style('top',`${ev.clientY-36}px`)
      tip.selectAll('*').remove()
      tip.append('div').attr('class','tt-name')
        .style('border-left',`3px solid ${d.color}`).style('padding-left','8px')
        .text(d.data.name)
      tip.append('div').attr('class','tt-meta')
        .text(`${d.data.rank} · ${fmtNum(d.data.num_tips)} species`)
      if (d.data.hasChildren && !d.data.children)
        tip.append('div').attr('class','tt-hint').text('Double-click to expand')
      if (d.data.children)
        tip.append('div').attr('class','tt-hint').text('Double-click to collapse')
    }
    hideTipRef.current = () => tip.style('opacity',0)
  }, [])

  // ── Core render: incremental simulation ────────────────────────────────────
  //
  //  First call: full build (create sim, all SVG, all forces)
  //  Subsequent: diff nodes, enter new / exit removed, gentle sim restart
  //
  const renderTree = useCallback((data) => {
    if (!data || !gRef.current) return
    const g = d3.select(gRef.current)

    const root     = d3.hierarchy(data, d => d.children?.length ? d.children : null)
    const allNodes = root.descendants()
    const allLinks = root.links()

    allNodes.forEach(d => {
      d.color = cladeColor(d)
      d.r = nodeRadius(d)
      const cached = posCache.current[d.data.id]
      if (cached) { d.x = cached.x; d.y = cached.y }
      else if (d.parent) {
        const p = posCache.current[d.parent.data.id]
        d.x = p ? p.x + (Math.random()-.5)*70 : (Math.random()-.5)*100
        d.y = p ? p.y + (Math.random()-.5)*70 : (Math.random()-.5)*100
      } else { d.x = d.x??0; d.y = d.y??0 }
    })

    // Pin root
    const rootNode = allNodes[0]
    rootNode.fx = 0; rootNode.fy = 0

    // Compute diff
    const newIds = new Set(allNodes.map(d => d.data.id))
    const oldIds = prevNodeIds.current
    const addedCount = [...newIds].filter(id => !oldIds.has(id)).length
    const removedCount = [...oldIds].filter(id => !newIds.has(id)).length
    const isFirstRender = oldIds.size === 0
    const isMajorChange = (addedCount + removedCount) > 0.5 * Math.max(newIds.size, oldIds.size)
    prevNodeIds.current = newIds

    // ── Layers (order: links → hulls → nodes) ──
    let linkLayer = g.select('.links-layer')
    if (linkLayer.empty()) linkLayer = g.append('g').attr('class','links-layer')
    let hullLayer = g.select('.hull-layer')
    if (hullLayer.empty()) hullLayer = g.append('g').attr('class','hull-layer')
    let nodeLayer = g.select('.nodes-layer')
    if (nodeLayer.empty()) nodeLayer = g.append('g').attr('class','nodes-layer')
    linkLayerRef.current = linkLayer
    hullLayerRef.current = d3.select(hullLayer.node())
    nodeLayerRef.current = nodeLayer
    allNodesRef.current = allNodes

    // ── Links: solid color, no gradients ──
    const linkSel = linkLayer.selectAll('path.link-edge')
      .data(allLinks, d => `${d.source.data.id}--${d.target.data.id}`)
    linkSel.exit().transition().duration(300).attr('opacity',0).remove()
    const linkEnter = linkSel.enter().append('path').attr('class','link-edge')
      .attr('fill','none').attr('stroke-opacity',0).attr('stroke-linecap','round')
    const linkAll = linkEnter.merge(linkSel)
      .attr('stroke', d => d.source.color)
      .attr('stroke-width', d => Math.max(1, 5 - d.source.depth * 1.0))
    linkAll.transition().duration(400).attr('stroke-opacity', 0.55)

    // ── Nodes: minimal SVG elements, no filters ──
    const nodeSel = nodeLayer.selectAll('g.node-group').data(allNodes, d => d.data.id)
    nodeSel.exit().transition().duration(300).attr('opacity',0).remove()

    const nodeEnter = nodeSel.enter().append('g').attr('class','node-group')
      .attr('opacity',0)
      .attr('transform', d => {
        const p = d.parent ? posCache.current[d.parent.data.id] : null
        return `translate(${p?.x??0},${p?.y??0})`
      })
      .style('cursor','pointer')
      .on('click', (ev, d) => { ev.stopPropagation(); onNodeSelect(d.data) })
      .on('dblclick', (ev, d) => {
        ev.stopPropagation()
        if (!d.data.hasChildren) return
        if (d.data.children) onNodeCollapse(d.data.id)
        else onNodeExpand(d.data.id)
      })
      .on('mouseenter', function(ev, d) { d3.select(this).raise(); showTipRef.current?.(ev, d) })
      .on('mousemove', (ev, d) => showTipRef.current?.(ev, d))
      .on('mouseleave', () => hideTipRef.current?.())

    // Expand-hint ring
    nodeEnter.append('circle').attr('class','expand-hint-ring')
      .attr('r', d => d.r+4)
      .attr('fill','none').attr('stroke-width',1.5).attr('stroke-dasharray','6,4')
      .attr('pointer-events','none')

    // Main bubble — NO filter
    nodeEnter.append('circle').attr('class','bubble-base').attr('r', d => d.r).attr('stroke-width',2.5)

    // Label
    nodeEnter.append('text').attr('class','bubble-label').attr('text-anchor','middle')
      .attr('pointer-events','none').style('opacity',0)

    // Pulse ring (selected only)
    nodeEnter.append('circle').attr('class','pulse-ring')
      .attr('r', d => d.r+6).attr('fill','none').attr('stroke-width',2).attr('pointer-events','none')

    nodeEnter.transition().duration(500).ease(d3.easeCubicOut)
      .attr('opacity',1).attr('transform', d => `translate(${d.x},${d.y})`)

    const nodeAll = nodeEnter.merge(nodeSel)

    // Cache label elements for zoom handler
    labelElsRef.current = nodeAll.selectAll('.bubble-label').nodes()

    // ── Link path (quadratic bezier) ──
    const linkPath = d => {
      const mx = (d.source.x + d.target.x)/2, my = (d.source.y + d.target.y)/2
      const dx = d.target.y - d.source.y, dy = d.source.x - d.target.x
      const len = Math.sqrt(dx*dx+dy*dy)||1
      const bend = 0.15
      const cx = mx + dx/len*(d.source.r*bend), cy = my + dy/len*(d.source.r*bend)
      return `M${d.source.x},${d.source.y} Q${cx},${cy} ${d.target.x},${d.target.y}`
    }

    // ── Simulation: incremental ──
    const n = allNodes.length
    const needsFullBuild = isFirstRender || isMajorChange || !simRef.current

    if (needsFullBuild) {
      // Full build: create new simulation
      if (simRef.current) simRef.current.stop()

      const collideIter = n > 80 ? 1 : n > 30 ? 2 : 4
      const chargeStr = n > 80 ? (d => d.data.children ? -900 : -250)
                      : n > 30 ? (d => d.data.children ? -1500 : -400)
                      :          (d => d.data.children ? -2200 : -600)

      const sim = d3.forceSimulation(allNodes)
        .force('link', d3.forceLink(allLinks).id(d => d.data.id)
          .distance(d => d.source.r + d.target.r + 90).strength(0.85))
        .force('charge', d3.forceManyBody().strength(chargeStr).theta(0.9))
        .force('collide', d3.forceCollide().radius(d => d.r+28).iterations(collideIter))
        .force('radial', d3.forceRadial(d => d.depth===0 ? 0 : d.depth*420, 0, 0).strength(d => d.depth===0 ? 2 : 0.5))
        .velocityDecay(0.65).alpha(0.6).alphaDecay(n > 80 ? 0.04 : 0.022)

      simRef.current = sim
      setupTickHandler(sim, allNodes, linkAll, nodeAll, linkPath)

      sim.on('end', () => {
        allNodes.forEach(d => { posCache.current[d.data.id]={x:d.x,y:d.y} })
        computeHulls(allNodes)
        autoFit(allNodes)
      })
    } else {
      // Incremental: update existing simulation with new nodes/links
      const sim = simRef.current
      sim.stop()

      const collideIter = n > 80 ? 1 : n > 30 ? 2 : 4
      const chargeStr = n > 80 ? (d => d.data.children ? -900 : -250)
                      : n > 30 ? (d => d.data.children ? -1500 : -400)
                      :          (d => d.data.children ? -2200 : -600)

      sim.nodes(allNodes)
      sim.force('link', d3.forceLink(allLinks).id(d => d.data.id)
        .distance(d => d.source.r + d.target.r + 90).strength(0.85))
      sim.force('charge', d3.forceManyBody().strength(chargeStr).theta(0.9))
      sim.force('collide', d3.forceCollide().radius(d => d.r+28).iterations(collideIter))
      sim.force('radial', d3.forceRadial(d => d.depth===0 ? 0 : d.depth*420, 0, 0).strength(d => d.depth===0 ? 2 : 0.5))

      // Remove old tick/end handlers, attach new ones with current selections
      sim.on('tick', null).on('end', null)
      setupTickHandler(sim, allNodes, linkAll, nodeAll, linkPath)

      sim.on('end', () => {
        allNodes.forEach(d => { posCache.current[d.data.id]={x:d.x,y:d.y} })
        computeHulls(allNodes)
        autoFit(allNodes)
      })

      // Gentle restart — existing nodes barely move
      sim.alpha(0.3).alphaDecay(n > 80 ? 0.04 : 0.022).restart()
    }

    function setupTickHandler(sim, nodes, links, nodeGroups, pathFn) {
      let rafId = null
      sim.on('tick', () => {
        nodes.forEach(d => { posCache.current[d.data.id]={x:d.x,y:d.y} })
        if (rafId) return
        rafId = requestAnimationFrame(() => {
          rafId = null
          links.attr('d', pathFn)
          nodeGroups.attr('transform', d => `translate(${d.x},${d.y})`)
        })
      })
    }

    // ── LOD Hull computation ─────────────────────────────────────────────
    // Called on sim 'end' — computes convex hulls for expanded clades with >5 children
    function computeHulls(nodes) {
      const hulls = new Map()
      const hLayer = d3.select(gRef.current).select('.hull-layer')
      if (hLayer.empty()) return

      // Find expanded clades with >5 children
      nodes.forEach(d => {
        if (!d.children || d.children.length <= 5) return
        const childPoints = d.children.map(c => [c.x, c.y]).filter(p => isFinite(p[0]) && isFinite(p[1]))
        if (childPoints.length < 3) return

        // Add padding around points
        const padded = []
        const pad = 40
        childPoints.forEach(([x, y]) => {
          padded.push([x - pad, y - pad])
          padded.push([x + pad, y - pad])
          padded.push([x - pad, y + pad])
          padded.push([x + pad, y + pad])
        })
        const hull = d3.polygonHull(padded)
        if (!hull) return

        // Centroid for label placement
        const cx = d3.mean(childPoints, p => p[0])
        const cy = d3.mean(childPoints, p => p[1])

        hulls.set(d.data.id, {
          points: hull,
          path: 'M' + hull.map(p => p.join(',')).join('L') + 'Z',
          color: d.color,
          label: d.data.name,
          numTips: d.data.num_tips,
          cx, cy,
          childIds: d.children.map(c => c.data.id),
        })
      })

      hullsRef.current = hulls

      // Render hull SVG elements
      const hullData = [...hulls.entries()]
      const hullSel = hLayer.selectAll('g.hull-group').data(hullData, d => d[0])
      hullSel.exit().remove()

      const hullEnter = hullSel.enter().append('g').attr('class', 'hull-group')
      hullEnter.append('path').attr('class', 'hull-path')
      hullEnter.append('text').attr('class', 'hull-label')
        .attr('text-anchor', 'middle').attr('pointer-events', 'none')

      const hullAll = hullEnter.merge(hullSel)
      hullAll.select('.hull-path')
        .attr('d', d => d[1].path)
        .attr('fill', d => hexToRgba(d[1].color, 0.12))
        .attr('stroke', d => hexToRgba(d[1].color, 0.3))
        .attr('stroke-width', 2)
        .attr('stroke-linejoin', 'round')

      hullAll.select('.hull-label')
        .attr('x', d => d[1].cx)
        .attr('y', d => d[1].cy)
        .attr('fill', d => d[1].color)
        .style('font-size', '18px')
        .style('font-weight', '800')
        .style('font-family', "'Exo 2', sans-serif")
        .style('text-transform', 'uppercase')
        .style('letter-spacing', '0.08em')
        .style('text-shadow', '0 2px 12px rgba(0,0,0,0.9)')
        .text(d => `${d[1].label}  ·  ${fmtNum(d[1].numTips)} spp`)
    }

  }, [onNodeSelect, onNodeExpand, onNodeCollapse, autoFit])

  // Run render on treeData change
  useEffect(() => {
    if (!treeData) return
    renderTree(treeData)
  }, [treeData, renderTree])

  // ── Styling (decoupled from physics) ───────────────────────────────────────
  useEffect(() => {
    if (!gRef.current) return
    const g = d3.select(gRef.current)
    const nodeAll = g.selectAll('g.node-group')
    if (nodeAll.empty()) return

    nodeAll.select('.bubble-base')
      .attr('r', d => d.r)
      .attr('fill', d => d.data.id === selectedNodeId ? '#fff' : (d.data.children ? hexToRgba(d.color,0.35) : d.color))
      .attr('stroke', d => d.data.id === selectedNodeId ? '#fff' : d.color)

    nodeAll.select('.expand-hint-ring')
      .attr('stroke', d => d.data.hasChildren && !d.data.children ? d.color : 'none')
      .classed('ring-pulse', d => d.data.hasChildren && !d.data.children)

    nodeAll.select('.pulse-ring')
      .attr('stroke', d => d.data.id === selectedNodeId ? d.color : 'none')
      .classed('selected-pulse', d => d.data.id === selectedNodeId)

    nodeAll.select('.bubble-label')
      .text(d => d.data.name)
      .attr('dy', d => d.data.children ? -(d.r+20) : '0.35em')
      .style('font-size', d => d.data.children ? `${Math.min(22,Math.max(11,d.r*0.22))}px` : `${labelConfig.fontSize}px`)
      .style('font-weight','700').style('letter-spacing','0.04em')
      .style('text-shadow','0 1px 8px rgba(0,0,0,1)').attr('fill','#fff')

  }, [treeData, selectedNodeId, labelConfig])

  return (
    <div className="tree-canvas-wrap">
      <div ref={tooltipRef} className="node-tooltip" style={{opacity:0}} />

      <div className="tree-legend">
        <div className="legend-header">Domains of Life</div>
        {Object.entries(CLADE_COLORS).filter(([k])=>k!=='default').map(([name,color])=>(
          <div key={name} className="legend-item">
            <span className="legend-dot" style={{background:color,boxShadow:`0 0 8px ${color}80`}}/>
            <span className="legend-name">{name}</span>
          </div>
        ))}
      </div>

      <div className="tree-hint">
        Click to select · Double-click to expand/collapse · Scroll to zoom · Drag to pan
      </div>

      <svg ref={svgRef} className="tree-svg">
        <defs>
          <radialGradient id="bg-gradient">
            <stop offset="0%"   stopColor="#0D1B30"/>
            <stop offset="100%" stopColor="#02060F"/>
          </radialGradient>
          <style>{`
            .bubble-label { font-family: 'Exo 2', 'Outfit', sans-serif; user-select: none; }

            @keyframes selected-pulse-anim {
              0%   { r: attr(r); opacity: 0.9; stroke-width: 2.5; }
              70%  { opacity: 0; stroke-width: 0.5; }
              100% { opacity: 0; }
            }
            .selected-pulse { animation: selected-pulse-anim 1.8s ease-out infinite; }

            @keyframes ring-spin {
              to { stroke-dashoffset: -40; }
            }
            .ring-pulse { animation: ring-spin 3s linear infinite; opacity: 0.5; }
            .node-group:hover .ring-pulse { opacity: 1; }

            .node-tooltip {
              position: fixed;
              background: rgba(6,14,34,0.94);
              backdrop-filter: blur(18px);
              border: 1px solid rgba(255,255,255,0.1);
              border-radius: 10px;
              color: #fff;
              padding: 12px 16px;
              pointer-events: none;
              z-index: 9999;
              box-shadow: 0 10px 40px rgba(0,0,0,0.6);
              font-family: 'Exo 2', sans-serif;
              min-width: 170px;
              transition: opacity 0.12s;
            }
            .tt-name { font-weight: 800; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 5px; }
            .tt-meta { font-size: 11px; opacity: 0.55; }
            .tt-hint { font-size: 10px; margin-top: 7px; opacity: 0.35; font-style: italic; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 6px; }

            .legend-header {
              font-size: 9px; text-transform: uppercase; letter-spacing: 0.12em;
              color: var(--text-dim); margin-bottom: 6px; font-family: var(--mono);
            }
          `}</style>
        </defs>
        <rect width="100%" height="100%" fill="url(#bg-gradient)"/>
        <g ref={gRef}/>
      </svg>
    </div>
  )
}
