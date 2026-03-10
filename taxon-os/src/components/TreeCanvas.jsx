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
export default function TreeCanvas({ treeData, selectedNodeId, onNodeSelect, onNodeExpand, onNodeCollapse }) {
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

  // ── Re-render when data changes ───────────────────────────────────────────
  useEffect(() => {
    if (!treeData || !gRef.current || !svgRef.current) return
    renderTree(treeData, selectedNodeId)
  }, [treeData, selectedNodeId]) // eslint-disable-line

  const renderTree = useCallback((data, selectedId) => {
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

    const hideTooltip = () => tooltip.style('opacity', 0)

    // ── Links ─────────────────────────────────────────────────────────────
    const linkGen = d3.linkRadial().angle(d => d.x).radius(d => d.y)

    const links = g.selectAll('.link')
      .data(root.links(), d => `${d.source.data.id}→${d.target.data.id}`)

    links.exit().transition().duration(300).attr('opacity', 0).remove()

    links.enter().append('path')
      .attr('class', 'link')
      .attr('d', linkGen)
      .attr('opacity', 0)
      .merge(links)
      .transition().duration(500)
      .attr('d', linkGen)
      .attr('opacity', 0.35)
      .attr('fill', 'none')
      .attr('stroke', d => colorMapRef.current[d.target.data.id] || '#00FFD4')
      .attr('stroke-width', d => {
        const tips = d.target.data.num_tips || 1
        return Math.max(0.4, Math.min(2.5, Math.log10(tips + 1) * 0.5))
      })

    // ── Nodes ─────────────────────────────────────────────────────────────
    const nodes = g.selectAll('.node')
      .data(root.descendants(), d => d.data.id)

    nodes.exit().transition().duration(300).attr('opacity', 0).remove()

    const nodesEnter = nodes.enter().append('g')
      .attr('class', 'node')
      .attr('transform', d => `translate(${radialPoint(d.x, d.y)})`)
      .attr('opacity', 0)
      .style('cursor', 'pointer')

    // Outer glow ring (selected)
    nodesEnter.append('circle')
      .attr('class', 'node-glow-ring')
      .attr('r', 0)
      .attr('fill', 'none')
      .attr('stroke-width', 2)
      .attr('opacity', 0)

    // Main circle
    nodesEnter.append('circle')
      .attr('class', 'node-circle')
      .attr('r', 0)

    // Expand indicator (+ for collapsed nodes with children)
    nodesEnter.append('text')
      .attr('class', 'node-expand-icon')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('pointer-events', 'none')

    // Label
    nodesEnter.append('text')
      .attr('class', 'node-label')
      .attr('pointer-events', 'none')

    // ── Event handlers ───────────────────────────────────────────────────
    nodesEnter
      .on('mouseenter', (event, d) => {
        d3.select(event.currentTarget).select('.node-circle')
          .transition().duration(120)
          .attr('r', nodeRadius(d.data.num_tips) * 1.5)
        showTooltip(event, d)
      })
      .on('mousemove', showTooltip)
      .on('mouseleave', (event, d) => {
        d3.select(event.currentTarget).select('.node-circle')
          .transition().duration(120)
          .attr('r', nodeRadius(d.data.num_tips))
        hideTooltip()
      })
      .on('click', (event, d) => {
        event.stopPropagation()
        // Toggle expand/collapse
        if (d.data.hasChildren) {
          if (d.data.children && d.data.children.length > 0) {
            onNodeCollapse(d.data.id)
          } else {
            onNodeExpand(d.data.id)
          }
        }
        onNodeSelect(d.data)
        hideTooltip()
      })

    // ── Merge enter + update and apply attributes ─────────────────────────
    const allNodes = nodesEnter.merge(nodes)

    allNodes.transition().duration(500)
      .attr('transform', d => `translate(${radialPoint(d.x, d.y)})`)
      .attr('opacity', 1)

    allNodes.select('.node-circle')
      .transition().duration(500)
      .attr('r', d => nodeRadius(d.data.num_tips))
      .attr('fill', d => colorMapRef.current[d.data.id] || '#00FFD4')
      .attr('stroke', d => d.data.id === selectedId ? '#fff' : 'rgba(255,255,255,0.25)')
      .attr('stroke-width', d => d.data.id === selectedId ? 2 : 0.8)
      .attr('filter', d => d.data.num_tips > 1000 ? 'url(#glow)' : null)

    allNodes.select('.node-glow-ring')
      .transition().duration(300)
      .attr('r', d => d.data.id === selectedId ? nodeRadius(d.data.num_tips) + 6 : 0)
      .attr('stroke', d => colorMapRef.current[d.data.id] || '#00FFD4')
      .attr('opacity', d => d.data.id === selectedId ? 0.7 : 0)

    allNodes.select('.node-expand-icon')
      .attr('font-size', '8px')
      .attr('fill', 'rgba(255,255,255,0.7)')
      .attr('dy', '0.1em')
      .text(d => {
        if (d.data._loading) return '…'
        if (d.data.hasChildren && (!d.data.children || d.data.children.length === 0)) return '+'
        return ''
      })

    // Labels: only show for significant clades or top levels
    allNodes.select('.node-label')
      .attr('dy', '0.31em')
      .attr('font-size', d => {
        if (d.depth === 0) return '13px'
        if (d.depth === 1) return '11px'
        if (d.data.num_tips > 10000) return '10px'
        if (d.data.num_tips > 1000) return '9px'
        return '8px'
      })
      .attr('font-weight', d => d.depth <= 1 ? '600' : '400')
      .attr('fill', d => {
        if (d.data.id === selectedId) return '#fff'
        if (d.depth === 0) return '#fff'
        return colorMapRef.current[d.data.id] || '#94a3b8'
      })
      .attr('opacity', d => {
        if (d.depth <= 1) return 1
        if (d.data.num_tips > 5000) return 0.9
        if (d.data.num_tips > 500) return 0.7
        return 0.5
      })
      .attr('x', d => {
        if (d.depth === 0) return nodeRadius(d.data.num_tips) + 6
        return d.x < Math.PI ? nodeRadius(d.data.num_tips) + 5 : -(nodeRadius(d.data.num_tips) + 5)
      })
      .attr('text-anchor', d => {
        if (d.depth === 0) return 'start'
        return d.x < Math.PI ? 'start' : 'end'
      })
      .attr('transform', d => {
        if (d.depth === 0) return null
        // Convert radial angle to degrees for text rotation
        const angle = (d.x * 180 / Math.PI) - 90
        if (d.x >= Math.PI) {
          return `rotate(${angle + 180})`
        }
        return `rotate(${angle})`
      })
      .text(d => {
        if (d.depth === 0) return d.data.name
        if (d.depth === 1) return d.data.name
        if (d.data.num_tips > 1000) return d.data.name
        if (d.data.id === selectedId) return d.data.name
        return d.data.num_tips > 100 ? d.data.name : ''
      })

    // ── Click on background to deselect ──────────────────────────────────
    svg.on('click', () => onNodeSelect(null))

  }, [onNodeSelect, onNodeExpand, onNodeCollapse])

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
          <radialGradient id="bg-gradient">
            <stop offset="0%" stopColor="#0a1628" />
            <stop offset="100%" stopColor="#020812" />
          </radialGradient>
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
