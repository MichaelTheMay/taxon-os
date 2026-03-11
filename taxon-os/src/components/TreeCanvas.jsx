import { useEffect, useRef, useCallback } from 'react'
import * as d3 from 'd3'

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

function fmtNum(n) {
  if (n >= 1e6) return `${(n/1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n/1e3).toFixed(0)}K`
  return String(n||0)
}

function nodeRadius(d) {
  const t = d.data.num_tips || 1
  if (d.depth === 0) return 88
  if (d.data.children) return Math.max(38, Math.min(110, 16 + Math.log10(t+2)*20))
  return Math.max(16, Math.min(50, 9 + Math.log10(t+2)*12))
}

// ── Enhancement 6: gradient ID per link ─────────────────────────────────────
function gradId(src, tgt) {
  return `lg-${String(src.data.id).replace(/\W/g,'')}-${String(tgt.data.id).replace(/\W/g,'')}`
}

// ── Enhancement 10: compute bounding box of all nodes ───────────────────────
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
  cladeMetaData={}, nodeIcons={},
  labelConfig={fontSize:12,fontWeight:'normal'},
  onNodeSelect, onNodeExpand, onNodeCollapse,
}) {
  const svgRef     = useRef(null)
  const gRef       = useRef(null)
  const zoomRef    = useRef(null)
  const simRef     = useRef(null)
  const tooltipRef = useRef(null)
  const posCache   = useRef({})
  const defsRef    = useRef(null)

  // ── Zoom setup (Enhancement 3: zoom-banded image reveal) ─────────────────
  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    const zoom = d3.zoom().scaleExtent([0.015, 18])
      .on('zoom', ({ transform: t }) => {
        d3.select(gRef.current).attr('transform', t)
        // Enhancement 3: images fade in as you zoom
        const imgOpacity = Math.min(1, Math.max(0, (t.k - 0.7) * 1.6))
        d3.select(gRef.current).selectAll('.img-layer').style('opacity', imgOpacity)
        // Labels: clades visible early, leaves only when zoomed in
        d3.select(gRef.current).selectAll('.bubble-label').style('opacity', d => {
          if (!d) return 0
          if (d.data.children) return t.k > 0.2 ? 1 : 0
          return t.k > 1.0 ? 1 : 0
        })
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

  const renderTree = useCallback((data, selectedId) => {
    if (!data || !gRef.current) return
    if (simRef.current) { simRef.current.stop(); simRef.current = null }

    const g   = d3.select(gRef.current)
    const svg = d3.select(svgRef.current)

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

    // ── Enhancement 1: Pin root ──────────────────────────────────────────────
    const rootNode = allNodes[0]
    rootNode.fx = 0; rootNode.fy = 0

    // ── Enhancement 6: linearGradients per link ──────────────────────────────
    const svgElem = svgRef.current
    let defsElem = svgElem.querySelector('defs#dynamic-defs')
    if (!defsElem) {
      defsElem = document.createElementNS('http://www.w3.org/2000/svg','defs')
      defsElem.id = 'dynamic-defs'
      svgElem.appendChild(defsElem)
    }
    defsRef.current = defsElem
    allLinks.forEach(lk => {
      const id = gradId(lk.source, lk.target)
      if (!defsElem.querySelector(`#${id}`)) {
        const grad = document.createElementNS('http://www.w3.org/2000/svg','linearGradient')
        grad.id = id; grad.setAttribute('gradientUnits','userSpaceOnUse')
        const s1 = document.createElementNS('http://www.w3.org/2000/svg','stop')
        s1.setAttribute('offset','0%'); s1.setAttribute('stop-color', lk.source.color)
        const s2 = document.createElementNS('http://www.w3.org/2000/svg','stop')
        s2.setAttribute('offset','100%'); s2.setAttribute('stop-color', lk.target.color)
        grad.appendChild(s1); grad.appendChild(s2)
        defsElem.appendChild(grad)
      }
    })

    // ── Tooltip ──────────────────────────────────────────────────────────────
    const tip = d3.select(tooltipRef.current)
    const showTip = (ev, d) => tip.style('opacity',1)
      .style('left',`${ev.clientX+18}px`).style('top',`${ev.clientY-36}px`)
      .html(`
        <div class="tt-name" style="border-left:3px solid ${d.color};padding-left:8px">${d.data.name}</div>
        <div class="tt-meta">${d.data.rank} · <b>${fmtNum(d.data.num_tips)}</b> species</div>
        ${d.data.hasChildren && !d.data.children ? '<div class="tt-hint">Double-click to expand</div>' : ''}
        ${d.data.children ? '<div class="tt-hint">Double-click to collapse</div>' : ''}
      `)
    const hideTip = () => tip.style('opacity',0)

    // ── Links layer ──────────────────────────────────────────────────────────
    let linkLayer = g.select('.links-layer')
    if (linkLayer.empty()) linkLayer = g.append('g').attr('class','links-layer')

    // Enhancement 5: nebula backgrounds behind expanded clades
    let nebulaLayer = g.select('.nebula-layer')
    if (nebulaLayer.empty()) nebulaLayer = g.insert('g','.links-layer').attr('class','nebula-layer')

    const nebs = nebulaLayer.selectAll('circle.nebula').data(
      allNodes.filter(d => d.depth > 0 && d.data.children),
      d => d.data.id
    )
    nebs.exit().transition().duration(600).attr('r',0).attr('opacity',0).remove()
    nebs.enter().append('circle').attr('class','nebula')
      .attr('r',0).attr('opacity',0)
      .merge(nebs)
      .transition().duration(900)
      .attr('r', d => d.r * 4.5)
      .attr('fill', d => hexToRgba(d.color, 0.04))
      .attr('filter','url(#aura-blur)')

    // Link paths
    const linkSel = linkLayer.selectAll('path.link-edge')
      .data(allLinks, d => `${d.source.data.id}--${d.target.data.id}`)
    linkSel.exit().transition().duration(400).attr('opacity',0).remove()
    const linkEnter = linkSel.enter().append('path').attr('class','link-edge')
      .attr('fill','none').attr('stroke-opacity',0).attr('stroke-linecap','round')
    const linkAll = linkEnter.merge(linkSel)
      .attr('stroke', d => `url(#${gradId(d.source, d.target)})`)
      // Enhancement 2: taper by depth
      .attr('stroke-width', d => Math.max(1, 5 - d.source.depth * 1.0))
    linkAll.transition().duration(500).attr('stroke-opacity', 0.55)

    // ── Node layer ───────────────────────────────────────────────────────────
    let nodeLayer = g.select('.nodes-layer')
    if (nodeLayer.empty()) nodeLayer = g.append('g').attr('class','nodes-layer')

    const nodeSel = nodeLayer.selectAll('g.node-group').data(allNodes, d => d.data.id)
    nodeSel.exit().transition().duration(400).attr('opacity',0).remove()

    const nodeEnter = nodeSel.enter().append('g').attr('class','node-group')
      .attr('opacity',0)
      .attr('transform', d => {
        const p = d.parent ? posCache.current[d.parent.data.id] : null
        return `translate(${p?.x??0},${p?.y??0})`
      })
      .style('cursor','pointer')
      // Enhancement 8: single-click = select, double-click = expand/collapse
      .on('click', (ev, d) => { ev.stopPropagation(); onNodeSelect(d.data) })
      .on('dblclick', (ev, d) => {
        ev.stopPropagation()
        if (!d.data.hasChildren) return
        if (d.data.children) onNodeCollapse(d.data.id)
        else onNodeExpand(d.data.id)
      })
      .on('mouseenter', function(ev, d) { d3.select(this).raise(); showTip(ev, d) })
      .on('mousemove', showTip)
      .on('mouseleave', hideTip)

    // Aura
    nodeEnter.append('circle').attr('class','bubble-aura')
      .attr('r', d => d.r+16).attr('fill', d => d.color).attr('opacity',0.07).attr('filter','url(#aura-blur)')

    // Enhancement 9: hover expand-hint ring (CSS animated dashed ring)
    nodeEnter.append('circle').attr('class','expand-hint-ring')
      .attr('r', d => d.r+4)
      .attr('fill','none').attr('stroke-width',1.5).attr('stroke-dasharray','6,4')
      .attr('pointer-events','none')

    // Main bubble
    nodeEnter.append('circle').attr('class','bubble-base').attr('r', d => d.r).attr('stroke-width',2.5)

    // Image collage setup – structure created on enter, images filled on merge
    nodeEnter.each(function(d) {
      const sel = d3.select(this)
      const clipId = `iclip-${String(d.data.id).replace(/\W/g,'')}`
      // Circular clip
      sel.append('defs').append('clipPath').attr('id', clipId)
        .append('circle').attr('class','img-clip-c').attr('r', d.r - 1.5)
      // Collage container (zoom-dependent opacity handled in zoom handler)
      sel.append('g').attr('class','img-layer collage-wrap').style('opacity', 0)
        .attr('clip-path', `url(#${clipId})`)
      // Glass shimmer on top of images
      sel.append('circle').attr('class','bubble-glass').attr('r', d.r)
        .attr('fill','url(#glass-gradient)').attr('pointer-events','none')
      sel.append('text').attr('class','bubble-label').attr('text-anchor','middle').attr('pointer-events','none').style('opacity',0)
      // Pulse ring
      sel.append('circle').attr('class','pulse-ring')
        .attr('r', d.r+6).attr('fill','none').attr('stroke-width',2).attr('pointer-events','none')
    })

    nodeEnter.transition().duration(700).ease(d3.easeCubicOut)
      .attr('opacity',1).attr('transform', d => `translate(${d.x},${d.y})`)

    const nodeAll = nodeEnter.merge(nodeSel)

    // Update bubble base
    nodeAll.select('.bubble-base')
      .attr('r', d => d.r)
      .attr('fill', d => d.data.id===selectedId ? '#fff' : (d.data.children ? hexToRgba(d.color,0.12) : d.color))
      .attr('stroke', d => d.data.id===selectedId ? '#fff' : d.color)
      // Enhancement 7: depth-based glow strength
      .attr('filter', d => `url(#glow-d${Math.min(d.depth,3)})`)

    // Enhancement 9: expand-hint ring styling
    nodeAll.select('.expand-hint-ring')
      .attr('stroke', d => d.data.hasChildren && !d.data.children ? d.color : 'none')
      .classed('ring-pulse', d => d.data.hasChildren && !d.data.children)

    // Enhancement 4: pulse ring for selected
    nodeAll.select('.pulse-ring')
      .attr('stroke', d => d.data.id===selectedId ? d.color : 'none')
      .classed('selected-pulse', d => d.data.id===selectedId)

    // Image Collage – rebuild inside each node based on available images
    nodeAll.each(function(d) {
      const sel      = d3.select(this)
      const wrap     = sel.select('.collage-wrap')
      const r        = d.r
      // Gather images: prefer cladeMetaData gallery (up to 4), fall back to nodeIcons
      const gallery  = cladeMetaData[d.data.id]?.images || []
      const icon     = nodeIcons[d.data.id]
      const imgs     = gallery.length ? gallery.slice(0, 4) : (icon ? [icon] : [])

      // Clear previous collage tiles
      wrap.selectAll('*').remove()

      if (imgs.length === 0) return

      const n = imgs.length

      if (n === 1) {
        // Full-circle fill
        wrap.append('image')
          .attr('xlink:href', imgs[0])
          .attr('x', -r).attr('y', -r)
          .attr('width', r*2).attr('height', r*2)
          .attr('preserveAspectRatio', 'xMidYMid slice')

      } else if (n === 2) {
        // Left / Right split
        imgs.forEach((url, i) => {
          wrap.append('image')
            .attr('xlink:href', url)
            .attr('x', i === 0 ? -r : 0).attr('y', -r)
            .attr('width', r).attr('height', r*2)
            .attr('preserveAspectRatio', 'xMidYMid slice')
        })
        // Hairline divider
        wrap.append('line').attr('x1', 0).attr('y1', -r).attr('x2', 0).attr('y2', r)
          .attr('stroke', 'rgba(0,0,0,0.4)').attr('stroke-width', 1)

      } else if (n === 3) {
        // Top-left, top-right (half height), bottom (full width, half height)
        wrap.append('image').attr('xlink:href', imgs[0])
          .attr('x', -r).attr('y', -r).attr('width', r).attr('height', r)
          .attr('preserveAspectRatio', 'xMidYMid slice')
        wrap.append('image').attr('xlink:href', imgs[1])
          .attr('x', 0).attr('y', -r).attr('width', r).attr('height', r)
          .attr('preserveAspectRatio', 'xMidYMid slice')
        wrap.append('image').attr('xlink:href', imgs[2])
          .attr('x', -r).attr('y', 0).attr('width', r*2).attr('height', r)
          .attr('preserveAspectRatio', 'xMidYMid slice')
        // Dividers
        wrap.append('line').attr('x1',-r).attr('y1',0).attr('x2',r).attr('y2',0)
          .attr('stroke','rgba(0,0,0,0.4)').attr('stroke-width',1)
        wrap.append('line').attr('x1',0).attr('y1',-r).attr('x2',0).attr('y2',0)
          .attr('stroke','rgba(0,0,0,0.4)').attr('stroke-width',1)

      } else {
        // 2×2 quad grid (4 images)
        imgs.forEach((url, i) => {
          const col = i % 2, row = Math.floor(i / 2)
          wrap.append('image').attr('xlink:href', url)
            .attr('x', col === 0 ? -r : 0).attr('y', row === 0 ? -r : 0)
            .attr('width', r).attr('height', r)
            .attr('preserveAspectRatio', 'xMidYMid slice')
        })
        // Crosshair dividers
        wrap.append('line').attr('x1',-r).attr('y1',0).attr('x2',r).attr('y2',0)
          .attr('stroke','rgba(0,0,0,0.45)').attr('stroke-width',1.5)
        wrap.append('line').attr('x1',0).attr('y1',-r).attr('x2',0).attr('y2',r)
          .attr('stroke','rgba(0,0,0,0.45)').attr('stroke-width',1.5)
      }
    })

    // Labels
    nodeAll.select('.bubble-label')
      .text(d => d.data.name)
      .attr('dy', d => d.data.children ? -(d.r+20) : '0.35em')
      .style('font-size', d => d.data.children ? `${Math.min(22,Math.max(11,d.r*0.22))}px` : `${labelConfig.fontSize}px`)
      .style('font-weight','700').style('letter-spacing','0.04em')
      .style('text-shadow','0 1px 8px rgba(0,0,0,1)').attr('fill','#fff')

    // ── Enhancement 1+2: Force simulation ───────────────────────────────────
    const sim = d3.forceSimulation(allNodes)
      .force('link', d3.forceLink(allLinks).id(d => d.data.id)
        .distance(d => d.source.r + d.target.r + 90).strength(0.85))
      .force('charge', d3.forceManyBody().strength(d => d.data.children ? -2200 : -600))
      .force('collide', d3.forceCollide().radius(d => d.r+28).iterations(4))
      .force('radial', d3.forceRadial(d => d.depth===0 ? 0 : d.depth*420, 0, 0).strength(d => d.depth===0 ? 2 : 0.5))
      .velocityDecay(0.65).alpha(0.6).alphaDecay(0.022)

    simRef.current = sim

    // Enhancement 6: update gradient coordinates every tick
    const updateGradients = () => {
      allLinks.forEach(lk => {
        const grad = defsRef.current?.querySelector(`#${gradId(lk.source,lk.target)}`)
        if (grad) {
          grad.setAttribute('x1', lk.source.x); grad.setAttribute('y1', lk.source.y)
          grad.setAttribute('x2', lk.target.x); grad.setAttribute('y2', lk.target.y)
        }
      })
    }

    // Enhancement 2: quadratic bezier links
    const linkPath = d => {
      const mx = (d.source.x + d.target.x)/2, my = (d.source.y + d.target.y)/2
      const dx = d.target.y - d.source.y, dy = d.source.x - d.target.x
      const len = Math.sqrt(dx*dx+dy*dy)||1
      const bend = 0.15
      const cx = mx + dx/len*(d.source.r*bend), cy = my + dy/len*(d.source.r*bend)
      return `M${d.source.x},${d.source.y} Q${cx},${cy} ${d.target.x},${d.target.y}`
    }

    sim.on('tick', () => {
      allNodes.forEach(d => { posCache.current[d.data.id]={x:d.x,y:d.y} })
      updateGradients()
      linkAll.attr('d', linkPath)
      nodeAll.attr('transform', d => `translate(${d.x},${d.y})`)
      // Keep nebulas centered on their parent
      nebulaLayer.selectAll('circle.nebula').attr('cx', d => d.x||0).attr('cy', d => d.y||0)
    })

    // Enhancement 10: auto-fit after simulation settles
    sim.on('end', () => {
      allNodes.forEach(d => { posCache.current[d.data.id]={x:d.x,y:d.y} })
      autoFit(allNodes)
    })

  }, [onNodeSelect, onNodeExpand, onNodeCollapse, cladeMetaData, nodeIcons, labelConfig, autoFit])

  useEffect(() => {
    if (!treeData) return
    renderTree(treeData, selectedNodeId)
  }, [treeData, selectedNodeId, renderTree])

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
          {/* Enhancement 7: depth-banded glows */}
          {[0,1,2,3].map(d => (
            <filter key={d} id={`glow-d${d}`} x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="0" stdDeviation={10-d*2} floodColor="currentColor" floodOpacity={0.5-d*0.08}/>
              <feDropShadow dx="0" dy="3" stdDeviation="6" floodColor="#000" floodOpacity="0.5"/>
            </filter>
          ))}
          <filter id="aura-blur"><feGaussianBlur stdDeviation="18"/></filter>
          <radialGradient id="bg-gradient">
            <stop offset="0%"   stopColor="#0D1B30"/>
            <stop offset="100%" stopColor="#02060F"/>
          </radialGradient>
          <radialGradient id="glass-gradient" cx="28%" cy="22%" r="72%">
            <stop offset="0%"   stopColor="rgba(255,255,255,0.55)"/>
            <stop offset="40%"  stopColor="rgba(255,255,255,0.06)"/>
            <stop offset="100%" stopColor="rgba(0,0,0,0.35)"/>
          </radialGradient>
          <style>{`
            .bubble-label { font-family: 'Exo 2', 'Outfit', sans-serif; user-select: none; }
            .link-edge { transition: stroke-opacity 0.3s; }

            /* Enhancement 4: selected-node pulse ring */
            @keyframes selected-pulse-anim {
              0%   { r: attr(r); opacity: 0.9; stroke-width: 2.5; }
              70%  { opacity: 0; stroke-width: 0.5; }
              100% { opacity: 0; }
            }
            .selected-pulse { animation: selected-pulse-anim 1.8s ease-out infinite; }

            /* Enhancement 9: hover expand-hint ring */
            @keyframes ring-spin {
              to { stroke-dashoffset: -40; }
            }
            .ring-pulse { animation: ring-spin 3s linear infinite; opacity: 0.5; }
            .node-group:hover .ring-pulse { opacity: 1; }

            /* Tooltip */
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
