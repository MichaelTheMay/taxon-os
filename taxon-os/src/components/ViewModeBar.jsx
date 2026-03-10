import { useState } from 'react'

const MODES = [
  { id: 'tree',       icon: '🌳', label: 'Tree',           active: true },
  { id: 'globe',      icon: '🌍', label: 'Globe',          active: false },
  { id: 'timeline',   icon: '⏳', label: 'Timeline',       active: false },
  { id: 'traits',     icon: '📊', label: 'Trait Space',    active: false },
  { id: 'extinction', icon: '⚠️', label: 'Extinction Risk', active: false },
]

export default function ViewModeBar({ currentMode, onModeChange }) {
  const [toast, setToast] = useState(null)

  const handleClick = (mode) => {
    if (mode.active) {
      onModeChange(mode.id)
    } else {
      setToast(`${mode.label} — coming soon`)
      setTimeout(() => setToast(null), 2000)
    }
  }

  return (
    <div className="view-mode-bar">
      {MODES.map(mode => (
        <button
          key={mode.id}
          className={`mode-btn ${currentMode === mode.id ? 'mode-active' : ''} ${!mode.active ? 'mode-disabled' : ''}`}
          onClick={() => handleClick(mode)}
          title={mode.label}
        >
          <span className="mode-icon">{mode.icon}</span>
          <span className="mode-label">{mode.label}</span>
        </button>
      ))}
      {toast && (
        <div className="mode-toast">
          {toast}
        </div>
      )}
    </div>
  )
}
