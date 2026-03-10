export default function Breadcrumb({ lineage, onNavigate }) {
  if (!lineage || lineage.length === 0) return null

  // Lineage comes as [current, parent, grandparent, ...root]
  // Reverse so it reads root → ... → current
  const path = [...lineage].reverse()

  // If the path is very long, show first 2, ellipsis, last 3
  const MAX_VISIBLE = 6
  let display = path
  let truncated = false

  if (path.length > MAX_VISIBLE) {
    display = [
      ...path.slice(0, 2),
      { name: '…', rank: '', ott_id: null, isTruncation: true },
      ...path.slice(-3),
    ]
    truncated = true
  }

  return (
    <nav className="breadcrumb-bar">
      {display.map((item, i) => (
        <span key={item.ott_id || `t-${i}`} className="breadcrumb-segment">
          {i > 0 && <span className="breadcrumb-sep">›</span>}
          {item.isTruncation ? (
            <span className="breadcrumb-ellipsis">…</span>
          ) : (
            <button
              className={`breadcrumb-btn ${i === display.length - 1 ? 'breadcrumb-current' : ''}`}
              onClick={() => item.ott_id && onNavigate(item)}
              disabled={!item.ott_id}
              title={`${item.rank}: ${item.name}`}
            >
              <span className="breadcrumb-name">{item.name}</span>
              {item.rank && item.rank !== 'no rank' && (
                <span className="breadcrumb-rank">{item.rank}</span>
              )}
            </button>
          )}
        </span>
      ))}
    </nav>
  )
}
