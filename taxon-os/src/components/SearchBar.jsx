import { useState, useRef, useEffect, useCallback } from 'react'
import { searchTaxa } from '../api/otl'

function debounce(fn, ms) {
  let t
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms) }
}

const RANK_ICONS = {
  species: '●', genus: '◆', family: '▲', order: '■',
  class: '◉', phylum: '★', kingdom: '⬡', domain: '⬣',
}

export default function SearchBar({ onSelect, onSurprise, surpriseLoading = false }) {
  const [query,    setQuery]    = useState('')
  const [results,  setResults]  = useState([])
  const [loading,  setLoading]  = useState(false)
  const [open,     setOpen]     = useState(false)
  const [focused,  setFocused]  = useState(0)
  const inputRef = useRef(null)
  const dropRef  = useRef(null)

  const search = useCallback(debounce(async (q) => {
    if (q.trim().length < 2) { setResults([]); setOpen(false); return }
    setLoading(true)
    try {
      const hits = await searchTaxa(q)
      setResults(hits)
      setOpen(hits.length > 0)
      setFocused(0)
    } catch { setResults([]) }
    finally { setLoading(false) }
  }, 300), [])

  const handleChange = e => {
    setQuery(e.target.value)
    search(e.target.value)
  }

  const handleSelect = item => {
    setQuery(item.name)
    setOpen(false)
    onSelect(item)
  }

  const handleKeyDown = e => {
    if (!open || !results.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocused(f => Math.min(f + 1, results.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setFocused(f => Math.max(f - 1, 0)) }
    if (e.key === 'Enter')     { handleSelect(results[focused]) }
    if (e.key === 'Escape')    { setOpen(false) }
  }

  const handleSurprise = () => {
    if (surpriseLoading) return
    onSurprise?.()
  }

  // Keyboard shortcut: Ctrl+K / Cmd+K to focus search
  useEffect(() => {
    const handler = e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // Close on outside click
  useEffect(() => {
    const handler = e => {
      if (!dropRef.current?.contains(e.target) && !inputRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="search-wrap">
      <div className="search-input-row">
        <span className="search-icon">⌕</span>
        <input
          ref={inputRef}
          type="text"
          className="search-input"
          placeholder="Search any organism… (Ctrl+K)"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setOpen(true)}
          autoComplete="off"
          spellCheck={false}
        />
        {loading && <span className="search-spinner" />}
        {query && <button className="search-clear" onClick={() => { setQuery(''); setResults([]); setOpen(false) }}>✕</button>}
        <button
          className={`surprise-btn ${surpriseLoading ? 'surprise-loading' : ''}`}
          onClick={handleSurprise}
          title="Discover a random organism — traces through the tree of life"
          disabled={surpriseLoading}
        >
          🎲
        </button>
      </div>

      {open && results.length > 0 && (
        <ul ref={dropRef} className="search-dropdown">
          {results.map((r, i) => (
            <li
              key={r.ott_id}
              className={`search-result ${i === focused ? 'focused' : ''}`}
              onClick={() => handleSelect(r)}
              onMouseEnter={() => setFocused(i)}
            >
              <span className="result-icon">{RANK_ICONS[r.rank] || '·'}</span>
              <div className="result-info">
                <span className="result-name">{r.name}</span>
                <span className="result-rank">{r.rank}</span>
              </div>
              <span className="result-score">{Math.round(r.score * 100)}%</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
