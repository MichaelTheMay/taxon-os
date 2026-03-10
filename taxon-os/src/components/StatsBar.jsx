export default function StatsBar({ visibleNodes, expandedClades, dataSources }) {
  return (
    <footer className="stats-bar">
      <div className="stats-bar-left">
        <div className="sb-stat">
          <span className="sb-pulse" />
          <span className="sb-value">{visibleNodes.toLocaleString()}</span>
          <span className="sb-label">nodes visible</span>
        </div>
        <div className="sb-divider" />
        <div className="sb-stat">
          <span className="sb-value">{expandedClades}</span>
          <span className="sb-label">clades expanded</span>
        </div>
      </div>
      <div className="stats-bar-right">
        <div className="sb-sources">
          {(dataSources || ['OTL', 'GBIF', 'iNat', 'Wiki']).map(src => (
            <span key={src} className="sb-source">{src}</span>
          ))}
        </div>
        <span className="sb-brand">TaxonOS v0.1</span>
      </div>
    </footer>
  )
}
