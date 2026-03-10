import { useEffect, useRef, useCallback } from 'react'
import * as d3 from 'd3'

// ── Color palette by clade ──────────────────────────────────────────────────
const CLADE_COLORS = {
  Bacteria:       '#FF6B35',
  Archaea:        '#C084FC',
  Eukaryota:      '#00FFD4',
  Fungi:          '#FBBF24',
  Viridiplantae:  '#4ADE80',
  Metazoa:        '#60A5FA',
  Amoebozoa:      '#F472B6',
  Alveolata:      '#34D399',
  Stramenopiles:  '#A78BFA',
  Rhodophyta:     '#FB7185',
  default:        '#64748B',
}

function getCladeColor(node, ancestors) {
  const path = [node.name, ...(ancestors || []).map(a => a.name)]
  for (const name of path) {
    if (CLADE_COLORS[name]) return CLADE_COLORS[name]
  }
  return CLADE_COLORS.default
}

function nodeRadius(numTips) {
  if (!numTips || numTips <= 1) return 4
  return Math.min(18, 4 + Math.sqrt(Math.log10(numTips + 10)) * 5)
}

function radialPoint(x, y) {
  return [(+y) * Math.cos(x - Math.PI / 2), (+y) * Math.sin(x - Math.PI / 2)]
}

// ── Color cache: walk up hierarchy to determine clade ──────────────────────
function buildColorMap(hierarchyRoot) {
  const map = {}
  hierarchyRoot.each(d => {
    let color = CLADE_COLORS.default
    let current = d
    while (current) {
      if (CLADE_COLORS[current.data.name]) { color = CLADE_COLORS[current.data.name]; break }
      current = current.parent
    }
    map[d.data.id] = color
  })
  return map
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function TreeCanvas({ 
  treeData, 
  selectedNodeId, 
  compareNodes = [], 
  mrcaInfo = null,
  cladeMetaData = {},
  nodeIcons = {},
  labelConfig = { fontSize: 12, fontWeight: 'normal', glow: true, uppercase: false, visible: true },
  onNodeSelect, 
  onNodeExpand, 
  onNodeCollapse 
}) {
  const svgRef = useRef(null)
  const gRef   = useRef(null)
  const zoomRef = useRef(null)
  const colorMapRef = useRef({})
  const tooltipRef = useRef(null)

  // ── Setup zoom once ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)

    const zoom = d3.zoom()
      .scaleExtent([0.04, 12])
      .on('zoom', e => d3.select(gRef.current).attr('transform', e.transform))

    svg.call(zoom)
    zoomRef.current = zoom

    // Center on load
    const { width, height } = svgRef.current.getBoundingClientRect()
    svg.call(zoom.transform, d3.zoomIdentity.translate(width / 2, height / 2).scale(0.9))

    return () => svg.on('.zoom', null)
  }, [])

  // renderTree defined below; we call it via renderTreeRef so the effect always uses latest version

  const renderTreeRef = useRef(null)

  const renderTree = useCallback((data, selectedId, compares, mrca) => {
    const g = d3.select(gRef.current)
    const svg = d3.select(svgRef.current)

    // Build hierarchy
    const root = d3.hierarchy(data, d => d.children && d.children.length > 0 ? d.children : null)
    const leafCount = root.leaves().length
    const radius = Math.max(220, leafCount * 14)

    d3.cluster()
      .size([2 * Math.PI, radius])
      .separation((a, b) => (a.parent === b.parent ? 1 : 2) / a.depth)
      (root)

    // Build color map
    colorMapRef.current = buildColorMap(root)

    // Calculate paths for MRCA (Addition #5)
    let activePathNodes = new Set()
    let activeMRCAId = null
    
    if (compares.length === 2 && mrca) {
      const getOtt = id => String(id).replace(/^(ott|life-)/, '')
      activeMRCAId = getOtt(mrca.mrca?.node_id)
      
      compares.forEach(target => {
        const d3Node = root.descendants().find(d => getOtt(d.data.id) === getOtt(target.id))
        if (d3Node) {
          let curr = d3Node
          while (curr) {
            activePathNodes.add(curr.data.id)
            if (getOtt(curr.data.id) === activeMRCAId) break
            curr = curr.parent
          }
        }
      })
    }

    // ── Tooltip helpers ──────────────────────────────────────────────────
    const tooltip = d3.select(tooltipRef.current)

    const showTooltip = (event, d) => {
      tooltip
        .style('opacity', 1)
        .style('left', `${event.clientX + 14}px`)
        .style('top',  `${event.clientY - 28}px`)
        .html(`
          <div class="tt-name">${d.data.name}</div>
          <div class="tt-meta">${d.data.rank}${d.data.num_tips > 1 ? ` · ${fmtNum(d.data.num_tips)} spp.` : ''}</div>
        `)
    }

    const hideTooltip = () => tooltip.style.opacity = 0

    // ── Clade Halos (Visual Clusters) ──────────────────────────
    const haloLayer = g.selectAll('.clade-halo')
      .data(Object.keys(cladeMetaData).map(id => {
        const d3Node = root.descendants().find(d => d.data.id === id)
        if (!d3Node || !d3Node.children) return null
        const leaves = d3Node.leaves()
        const xMin = d3.min(leaves, d => d.x)
        const xMax = d3.max(leaves, d => d.x)
        const yMax = d3.max(leaves, d => d.y)
        return { 
          id, 
          node: d3Node, 
          x0: xMin, x1: xMax, 
          y0: d3Node.y, y1: yMax + 40,
          meta: cladeMetaData[id]
        }
      }).filter(Boolean), d => d.id)

    haloLayer.exit().transition().duration(400).attr('opacity', 0).remove()

    const haloEnter = haloLayer.enter().append('g').attr('class', 'clade-halo').attr('opacity', 0)
    
    haloEnter.append('path')
      .attr('class', 'halo-path')
      .attr('d', d3.arc()
        .startAngle(d => d.x0)
        .endAngle(d => d.x1)
        .innerRadius(d => d.y0 - 20)
        .outerRadius(d => d.y1)
        .padAngle(0.01)
        .cornerRadius(12)
      )
      .attr('fill', d => colorMapRef.current[d.id] || '#00FFD4')
      .attr('opacity', 0.1)

    // Clade Title
    haloEnter.append('text')
      .attr('class', 'halo-title')
      .attr('text-anchor', 'middle')
      .attr('dy', -12)
      .append('textPath')
      .attr('xlink:href', d => {
        const pathId = `arcpath-${d.id.replace(/\W/g, '')}`
        if (!svg.select(`#${pathId}`).node()) {
          svg.select('defs').append('path')
            .attr('id', pathId)
            .attr('d', d3.arc()({
              startAngle: d.x0, 
              endAngle: d.x1, 
              innerRadius: d.y1 + 10, 
              outerRadius: d.y1 + 10
            }))
        }
        return `#${pathId}`
      })
      .attr('startOffset', '50%')
      .text(d => d.meta.name)

    // Representative Images
    haloEnter.selectAll('.halo-img')
      .data(d => (d.meta.images || []).slice(0, 3).map((url, i) => ({ url, i, halo: d })))
      .enter().append('image')
      .attr('class', 'halo-img')
      .attr('xlink:href', d => d.url)
      .attr('width', 44).attr('height', 44)
      .attr('x', d => {
        const angle = d.halo.x0 + (d.halo.x1 - d.halo.x0) * (d.i / 2)
        return radialPoint(angle, d.halo.y1 + 15)[0] - 22
      })
      .attr('y', d => {
        const angle = d.halo.x0 + (d.halo.x1 - d.halo.x0) * (d.i / 2)
        return radialPoint(angle, d.halo.y1 + 15)[1] - 22
      })
      .attr('clip-path', 'circle(50%)')

    haloEnter.merge(haloLayer).transition().duration(500).attr('opacity', 1)

    // ── Links ─────────────────────────────────────────────────────────────
    const linkGen = d3.linkRadial().angle(d => d.x).radius(d => d.y)
    const links = g.selectAll('.link').data(root.links(), d => `${d.source.data.id}→${d.target.data.id}`)
    links.exit().remove()

    links.enter().append('path')
      .attr('class', d => `link ${d.target.data.num_tips > 1000 ? 'link-flow' : ''}`)
      .merge(links)
      .attr('d', linkGen)
      .attr('stroke', d => colorMapRef.current[d.target.data.id] || '#64748B')
      .attr('stroke-width', d => Math.max(0.6, Math.min(3, Math.log10(d.target.data.num_tips || 1))))
      .attr('opacity', 0.4)

    // ── Node Groups ───────────────────────────────────────────────────────
    const nodes = g.selectAll('.node-group').data(root.descendants(), d => d.data.id)
    nodes.exit().remove()

    const nodesEnter = nodes.enter().append('g')
      .attr('class', 'node-group')
      .style('cursor', 'pointer')
      .on('click', (e, d) => {
        e.stopPropagation()
        if (d.data.hasChildren) {
          if (d.data.children) onNodeCollapse(d.data.id)
          else onNodeExpand(d.data.id)
        }
        onNodeSelect(d.data)
      })

    nodesEnter.append('circle').attr('class', 'node-circle')
    nodesEnter.append('clipPath')
      .attr('id', d => `clip-${d.data.id.replace(/\W/g, '')}`)
      .append('circle')
    nodesEnter.append('image').attr('class', 'node-icon')
    nodesEnter.append('text').attr('class', 'node-label')

    const nodesAll = nodesEnter.merge(nodes)
    nodesAll.attr('transform', d => `translate(${radialPoint(d.x, d.y)})`)

    nodesAll.select('.node-circle')
      .attr('r', d => nodeRadius(d.data.num_tips))
      .attr('fill', d => d.data.id === selectedId ? '#fff' : colorMapRef.current[d.data.id])
      .attr('opacity', d => nodeIcons[d.data.id] ? 0.2 : 1)
      .attr('stroke', d => d.data.id === selectedId ? '#fff' : 'rgba(255,255,255,0.2)')
      .attr('stroke-width', d => d.data.id === selectedId ? 2 : 1)

    nodesAll.select('clipPath circle')
      .attr('r', d => nodeRadius(d.data.num_tips))

    nodesAll.select('.node-icon')
      .attr('xlink:href', d => nodeIcons[d.data.id] || '')
      .attr('x', d => -nodeRadius(d.data.num_tips))
      .attr('y', d => -nodeRadius(d.data.num_tips))
      .attr('width', d => nodeRadius(d.data.num_tips) * 2)
      .attr('height', d => nodeRadius(d.data.num_tips) * 2)
      .attr('clip-path', d => `url(#clip-${d.data.id.replace(/\W/g, '')})`)
      .attr('opacity', d => nodeIcons[d.data.id] || 0)

    nodesAll.select('.node-label')
      .text(d => {
        if (d.depth < 2 || d.data.id === selectedId || d.data.num_tips > 1000) return d.data.name
        return ''
      })
      .attr('dy', '0.31em')
      .attr('x', d => d.x < Math.PI ? 10 : -10)
      .attr('text-anchor', d => d.x < Math.PI ? 'start' : 'end')
      .attr('transform', d => d.x >= Math.PI ? 'rotate(180)' : null)
      .style('font-size', `${labelConfig.fontSize}px`)
      .style('font-weight', labelConfig.fontWeight)
      .style('text-transform', labelConfig.uppercase ? 'uppercase' : 'none')
      .style('display', labelConfig.visible ? 'block' : 'none')
      .style('text-shadow', labelConfig.glow ? '0 0 5px rgba(255,255,255,0.7)' : 'none')
      .attr('fill', '#fff')

    // ── Auto-center ──
    if (selectedId) {
      const d = root.descendants().find(d => d.data.id === selectedId)
      if (d) {
        const [tx, ty] = radialPoint(d.x, d.y)
        const { width, height } = svgRef.current.getBoundingClientRect()
        svg.transition().duration(800).call(
          zoomRef.current.transform,
          d3.zoomIdentity.translate(width/2 - tx, height/2 - ty).scale(1.2)
        )
      }
    }

    svg.on('click', () => onNodeSelect(null))
  }, [onNodeSelect, onNodeExpand, onNodeCollapse, cladeMetaData, nodeIcons, labelConfig])

  // Keep ref always pointing at latest renderTree
  renderTreeRef.current = renderTree

  // ── Re-render ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!treeData || !gRef.current || !svgRef.current) return
    renderTreeRef.current(treeData, selectedNodeId, compareNodes, mrcaInfo)
  }, [treeData, selectedNodeId, compareNodes, mrcaInfo]) // eslint-disable-line

  return (
    <div className="tree-canvas-wrap">
      {/* Tooltip */}
      <div ref={tooltipRef} className="node-tooltip" style={{ opacity: 0 }} />

      {/* Legend */}
      <div className="tree-legend">
        {Object.entries(CLADE_COLORS).filter(([k]) => k !== 'default').map(([name, color]) => (
          <div key={name} className="legend-item">
            <span className="legend-dot" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
            <span className="legend-name">{name}</span>
          </div>
        ))}
      </div>

      {/* Instructions */}
      <div className="tree-hint">
        Click node to expand · Click again to select · Scroll to zoom · Drag to pan
      </div>

      <svg ref={svgRef} className="tree-svg">
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="strong-glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="node-inner-glow">
            <feComponentTransfer in="SourceAlpha">
              <feFuncA type="table" tableValues="1 0" />
            </feComponentTransfer>
            <feGaussianBlur stdDeviation="1.5" />
            <feOffset dx="0.5" dy="0.5" result="offsetblur" />
            <feFlood floodColor="white" floodOpacity="0.4" result="color" />
            <feComposite in2="offsetblur" operator="in" />
            <feComposite in2="SourceAlpha" operator="in" />
            <feMerge>
              <feMergeNode in="SourceGraphic" />
              <feMergeNode />
            </feMerge>
          </filter>
          <radialGradient id="bg-gradient">
            <stop offset="0%" stopColor="#0d1930" />
            <stop offset="100%" stopColor="#020812" />
          </radialGradient>

          <radialGradient id="glass-gradient" cx="30%" cy="30%" r="70%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.4)" />
            <stop offset="50%" stopColor="transparent" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.2)" />
          </radialGradient>

          <filter id="aura">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>

          {/* Dynamic Link Gradients will be added here via JS */}
          <style>
            {`
              .link {
                transition: stroke 0.8s, stroke-width 0.8s, opacity 0.8s;
                stroke-linecap: round;
              }
              .link-flow {
                stroke-dasharray: 6, 12;
                animation: flow 15s linear infinite;
              }
              @keyframes flow {
                from { stroke-dashoffset: 120; }
                to { stroke-dashoffset: 0; }
              }
              .node-pulse {
                animation: node-pulse-anim 4s ease-in-out infinite;
              }
              @keyframes node-pulse-anim {
                0%, 100% { transform: scale(1); filter: brightness(1) drop-shadow(0 0 5px currentColor); }
                50% { transform: scale(1.15); filter: brightness(1.4) drop-shadow(0 0 15px currentColor); }
              }
              .node-hover-aura {
                fill: none;
                stroke: currentColor;
                stroke-width: 1;
                filter: url(#aura);
                opacity: 0;
                transition: opacity 0.3s, r 0.3s;
              }
              .node:hover .node-hover-aura {
                opacity: 0.5;
                r: 25;
              }
            `}
          </style>
        </defs>
        <rect width="100%" height="100%" fill="url(#bg-gradient)" />
        <g ref={gRef} />
      </svg>
    </div>
  )
}

function fmtNum(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`
  return n.toString()
}
