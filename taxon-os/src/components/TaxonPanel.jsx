import { useState, useEffect, useRef } from 'react'
import { fetchWikiSummary } from '../api/wikipedia'
import { matchGBIF, fetchOccurrenceImages, fetchOccurrenceCount, fetchOccurrencePoints, fetchSpeciesProfile, fetchYearlyOccurrences } from '../api/gbif'
import { fetchInatTaxon, fetchInatObservations } from '../api/inaturalist'
import { fetchLineage } from '../api/otl'
import { getIUCNColor, getIUCNLabel } from '../api/iucn'
import { fetchWikidataQuickFacts } from '../api/wikidata'
import { fetchEOLData } from '../api/eol'
import { fetchXCRecordings } from '../api/xenocanto'
import OccurrenceMap from './OccurrenceMap'

const TABS = [
  { id: 'overview', label: 'Overview', icon: '📋' },
  { id: 'facts',   label: 'Facts',    icon: '🔬' },
  { id: 'map',     label: 'Map',      icon: '🗺️' },
  { id: 'gallery', label: 'Gallery',  icon: '📷' },
]

export default function TaxonPanel({ node, onClose, onNavigate, onCompare, compareMode, isComparing }) {
  const [tab, setTab] = useState('overview')
  const [wiki, setWiki] = useState(null)
  const [images, setImages] = useState([])
  const [gbif, setGbif] = useState(null)
  const [inat, setInat] = useState(null)
  const [occCount, setOccCount] = useState(null)
  const [occPoints, setOccPoints] = useState([])
  const [occPointsLoading, setOccPointsLoading] = useState(false)
  const [profile, setProfile] = useState(null)
  const [yearlyData, setYearlyData] = useState([])
  const [lineage, setLineage] = useState([])
  const [inatObs, setInatObs] = useState([])
  const [loading, setLoading] = useState(false)
  const [activeImg, setActiveImg] = useState(0)
  const [lightbox, setLightbox] = useState(null)
  
  // New data sources
  const [wikidata, setWikidata] = useState(null)
  const [eol, setEol] = useState(null)
  const [xcRecordings, setXcRecordings] = useState([])
  const [audioPlaying, setAudioPlaying] = useState(null) // {id, audio}
  
  const panelRef = useRef(null)

  useEffect(() => {
    if (!node) return
    loadAll(node)
    setActiveImg(0)
    setTab('overview')
  }, [node?.id])

  async function loadAll(node) {
    setLoading(true)
    setWiki(null); setImages([]); setGbif(null); setInat(null)
    setOccCount(null); setOccPoints([]); setProfile(null)
    setYearlyData([]); setLineage([]); setInatObs([])
    setWikidata(null); setEol(null); setXcRecordings([])
    if (audioPlaying) { audioPlaying.audio?.pause(); setAudioPlaying(null) }

    const name = node.name

    // Phase 1: core data
    const [wikiRes, gbifRes, inatRes, lineageRes] = await Promise.allSettled([
      fetchWikiSummary(name),
      matchGBIF(name),
      fetchInatTaxon(name),
      node.ott_id ? fetchLineage(node.ott_id) : Promise.resolve([]),
    ])

    if (wikiRes.status === 'fulfilled') setWiki(wikiRes.value)
    if (inatRes.status === 'fulfilled') setInat(inatRes.value)
    if (lineageRes.status === 'fulfilled') setLineage(lineageRes.value)

    // Phase 2: GBIF-dependent data
    if (gbifRes.status === 'fulfilled' && gbifRes.value?.usageKey) {
      const g = gbifRes.value
      setGbif(g)

      const [imgs, cnt, prof, yearly] = await Promise.allSettled([
        fetchOccurrenceImages(g.usageKey, 12),
        fetchOccurrenceCount(g.usageKey),
        fetchSpeciesProfile(g.usageKey),
        fetchYearlyOccurrences(g.usageKey),
      ])
      if (imgs.status === 'fulfilled') setImages(imgs.value)
      if (cnt.status === 'fulfilled') setOccCount(cnt.value)
      if (prof.status === 'fulfilled') setProfile(prof.value)
      if (yearly.status === 'fulfilled') setYearlyData(yearly.value)
    }

    // Phase 3: iNat observations
    const inatData = inatRes.status === 'fulfilled' ? inatRes.value : null
    if (inatData?.id) {
      const obsRes = await fetchInatObservations(inatData.id, 12).catch(() => [])
      setInatObs(obsRes)
    }

    // Phase 4: New data sources (non-blocking, run in background)
    Promise.allSettled([
      fetchWikidataQuickFacts(name),
      fetchEOLData(name),
      fetchXCRecordings(name, 5),
    ]).then(([wdRes, eolRes, xcRes]) => {
      if (wdRes.status === 'fulfilled') setWikidata(wdRes.value)
      if (eolRes.status === 'fulfilled') setEol(eolRes.value)
      if (xcRes.status === 'fulfilled') setXcRecordings(xcRes.value)
    })

    setLoading(false)
  }

  // Load occurrence points when switching to map tab
  useEffect(() => {
    if (tab === 'map' && gbif?.usageKey && occPoints.length === 0 && !occPointsLoading) {
      setOccPointsLoading(true)
      fetchOccurrencePoints(gbif.usageKey, 300)
        .then(pts => setOccPoints(pts))
        .catch(() => setOccPoints([]))
        .finally(() => setOccPointsLoading(false))
    }
  }, [tab, gbif])

  if (!node) return null

  // Best available images
  const inatPhotos = inat?.taxon_photos?.map(p => p.photo?.medium_url).filter(Boolean) || []
  const inatObsPhotos = inatObs.map(o => o.photo).filter(Boolean)
  const gbifPhotos = images.map(i => i.url)
  const allImages = [...new Set([...inatPhotos, ...inatObsPhotos, ...gbifPhotos])]
  const heroImage = allImages[activeImg] || inat?.default_photo?.medium_url || wiki?.thumbnail?.source

  const commonName = profile?.commonName || inat?.preferred_common_name || null
  const iucnStatus = gbif?.iucnRedListCategory || inat?.conservation_status?.status || null
  const wikiUrl = wiki?.content_urls?.desktop?.page
  const gbifUrl = gbif?.usageKey ? `https://www.gbif.org/species/${gbif.usageKey}` : null
  const inatUrl = inat?.id ? `https://www.inaturalist.org/taxa/${inat.id}` : null
  const pbdbUrl = `https://paleobiodb.org/classic/checkTaxonInfo?taxon_name=${encodeURIComponent(node.name)}`

  return (
    <aside className={`taxon-panel ${loading ? 'loading' : ''}`} ref={panelRef}>
      <button className="panel-close" onClick={onClose}>✕</button>

      {/* Hero image */}
      <div className="panel-hero">
        {heroImage ? (
          <img src={heroImage} alt={node.name} className="hero-img"
               onClick={() => setLightbox(heroImage)}
               onError={e => e.target.style.display = 'none'} />
        ) : (
          <div className="hero-placeholder">
            <span className="hero-placeholder-icon">🌿</span>
          </div>
        )}
        <div className="hero-gradient" />
        
        <div className="panel-actions">
           {onCompare && (
             <button 
               className={`action-btn compare-btn ${isComparing ? 'active' : ''}`}
               onClick={onCompare}
               title={compareMode ? "Select this to find MRCA" : "Start phylogenetic comparison"}
             >
               {isComparing ? '📍 Target' : compareMode ? '🎯 Compare' : '⚖️ Path-Finder'}
             </button>
           )}
        </div>

        <div className="hero-meta">
          <span className="hero-rank">{node.rank}</span>
          {commonName && <span className="hero-common">{commonName}</span>}
          <h2 className="hero-name">{node.name}</h2>
          {iucnStatus && (
            <span className="iucn-badge" style={{ background: getIUCNColor(iucnStatus) }}>
              {iucnStatus} — {getIUCNLabel(iucnStatus)}
            </span>
          )}
        </div>
      </div>

      {/* Image strip */}
      {allImages.length > 1 && (
        <div className="image-strip">
          {allImages.slice(0, 8).map((url, i) => (
            <img key={i} src={url} alt="" className={`strip-thumb ${i === activeImg ? 'active' : ''}`}
                 onClick={() => setActiveImg(i)}
                 onError={e => e.target.style.display = 'none'} />
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="panel-tabs">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`panel-tab ${tab === t.id ? 'tab-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <span className="tab-icon">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      <div className="panel-body">
        {loading && (
          <div className="panel-loading">
            <div className="loading-dots"><span/><span/><span/></div>
            <span>Loading data…</span>
          </div>
        )}

        {/* ─── OVERVIEW TAB ─── */}
        {tab === 'overview' && (
          <>
            {/* Stats row */}
            <div className="stats-row">
              {node.num_tips > 1 && <Stat value={fmtNum(node.num_tips)} label="species" />}
              {occCount != null && <Stat value={fmtNum(occCount)} label="GBIF records" />}
              {inat?.observations_count != null && <Stat value={fmtNum(inat.observations_count)} label="iNat obs." />}
            </div>

            {/* Sparkline */}
            {yearlyData.length > 5 && (
              <section className="panel-section">
                <h3 className="section-heading">Observation Trend</h3>
                <Sparkline data={yearlyData} />
              </section>
            )}

            {/* Wikipedia extract */}
            {wiki?.extract && (
              <section className="panel-section">
                <p className="extract-text">{truncate(wiki.extract, 500)}</p>
              </section>
            )}

            {/* Lineage */}
            {lineage.length > 0 && (
              <section className="panel-section">
                <h3 className="section-heading">Lineage</h3>
                <div className="lineage-chain">
                  {[...lineage].reverse().map((item, i) => (
                    <button
                      key={item.ott_id}
                      className="lineage-item"
                      onClick={() => onNavigate && onNavigate(item)}
                      title={item.rank}
                    >
                      <span className="lineage-rank">{item.rank !== 'no rank' ? item.rank : ''}</span>
                      <span className="lineage-name">{item.name}</span>
                      {i < lineage.length - 1 && <span className="lineage-arrow">→</span>}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Classification */}
            {gbif && (
              <section className="panel-section">
                <h3 className="section-heading">Classification</h3>
                <div className="classification-grid">
                  {['kingdom','phylum','class','order','family','genus','species'].map(rank =>
                    gbif[rank] && (
                      <div key={rank} className="cl-row">
                        <span className="cl-rank">{rank}</span>
                        <span className="cl-val">{gbif[rank]}</span>
                      </div>
                    )
                  )}
                </div>
              </section>
            )}

            {/* iNat summary fallback */}
            {inat?.wikipedia_summary && !wiki?.extract && (
              <section className="panel-section">
                <p className="extract-text">{truncate(inat.wikipedia_summary, 400)}</p>
              </section>
            )}

            {/* External links */}
            <section className="panel-section links-section">
              <h3 className="section-heading">Sources</h3>
              <div className="ext-links">
                {wikiUrl  && <ExLink href={wikiUrl}  label="Wikipedia" icon="📖" />}
                {gbifUrl  && <ExLink href={gbifUrl}   label="GBIF"      icon="🌍" />}
                {inatUrl  && <ExLink href={inatUrl}   label="iNaturalist" icon="🔬" />}
                {pbdbUrl  && <ExLink href={pbdbUrl}   label="Fossils (PBDB)" icon="🦴" />}
                {eol?.eolUrl && <ExLink href={eol.eolUrl} label="EOL" icon="📚" />}
                {wikidata?.wikidataId && (
                  <ExLink href={`https://www.wikidata.org/wiki/${wikidata.wikidataId}`} label="Wikidata" icon="🔗" />
                )}
                {node.ott_id && (
                  <ExLink
                    href={`https://tree.opentreeoflife.org/taxonomy/browse?id=${node.ott_id}`}
                    label="Open Tree" icon="🌳"
                  />
                )}
              </div>
            </section>
          </>
        )}

        {/* ─── FACTS TAB (Wikidata + Xeno-canto) ─── */}
        {tab === 'facts' && (
          <>
            {/* Wikidata structured traits */}
            {wikidata && (
              <section className="panel-section">
                <h3 className="section-heading">Biological Traits <span className="source-badge wd-badge">Wikidata</span></h3>
                <div className="traits-grid">
                  {wikidata.mass && <TraitRow icon="⚖️" label="Mass" value={wikidata.mass} />}
                  {wikidata.lifespan && <TraitRow icon="⏳" label="Lifespan" value={wikidata.lifespan} />}
                  {wikidata.diet && <TraitRow icon="🍃" label="Diet" value={wikidata.diet} />}
                  {wikidata.habitat && <TraitRow icon="🏔️" label="Habitat" value={wikidata.habitat} />}
                  {wikidata.conservationStatus && <TraitRow icon="⚠️" label="Status" value={wikidata.conservationStatus} />}
                  {!wikidata.mass && !wikidata.lifespan && !wikidata.diet && (
                    <p className="no-data-msg">No structured trait data available for this taxon yet.</p>
                  )}
                </div>
              </section>
            )}

            {/* Xeno-canto Audio Player */}
            {xcRecordings.length > 0 && (
              <section className="panel-section">
                <h3 className="section-heading">Wildlife Recordings <span className="source-badge xc-badge">Xeno-canto</span></h3>
                <div className="xc-recordings">
                  {xcRecordings.map(rec => (
                    <div key={rec.id} className={`xc-rec ${audioPlaying?.id === rec.id ? 'xc-rec-playing' : ''}`}>
                      <button
                        className="xc-play-btn"
                        onClick={() => {
                          if (audioPlaying?.id === rec.id) {
                            audioPlaying.audio.pause()
                            setAudioPlaying(null)
                          } else {
                            if (audioPlaying) audioPlaying.audio.pause()
                            const audio = new Audio(rec.url)
                            audio.play().catch(() => {})
                            setAudioPlaying({ id: rec.id, audio })
                          }
                        }}
                      >
                        {audioPlaying?.id === rec.id ? '⏹' : '▶'}
                      </button>
                      <div className="xc-meta">
                        <span className="xc-type">{rec.type}</span>
                        <span className="xc-location">{rec.country} — {rec.locality || 'Unknown location'}</span>
                        <span className="xc-quality">Quality: {rec.quality} · {rec.recordist}</span>
                      </div>
                      <a href={rec.pageUrl} target="_blank" rel="noopener noreferrer" className="xc-link">↗</a>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* EOL supplementary articles */}
            {eol?.articles?.length > 0 && (
              <section className="panel-section">
                <h3 className="section-heading">From the Literature <span className="source-badge eol-badge">EOL</span></h3>
                {eol.articles.map((a, i) => (
                  <div key={i} className="eol-article">
                    {a.type && <span className="eol-article-type">{a.type}</span>}
                    <p className="extract-text">{truncate(a.text, 400)}</p>
                  </div>
                ))}
              </section>
            )}

            {/* EOL common names */}
            {eol?.commonNames?.length > 0 && (
              <section className="panel-section">
                <h3 className="section-heading">Common Names <span className="source-badge eol-badge">EOL</span></h3>
                <div className="common-names-list">
                  {eol.commonNames.map((n, i) => (
                    <span key={i} className="common-name-tag">{n}</span>
                  ))}
                </div>
              </section>
            )}

            {!wikidata && xcRecordings.length === 0 && !eol && (
              <div className="panel-loading">
                <div className="loading-dots"><span/><span/><span/></div>
                <span>Loading facts from Wikidata, EOL, Xeno-canto…</span>
              </div>
            )}
          </>
        )}

        {/* ─── MAP TAB ─── */}
        {tab === 'map' && (
          <div className="tab-map-content">
            <OccurrenceMap points={occPoints} loading={occPointsLoading} />
          </div>
        )}

        {/* ─── GALLERY TAB ─── */}
        {tab === 'gallery' && (
          <div className="tab-gallery-content">
            {allImages.length === 0 && !loading ? (
              <div className="gallery-empty">
                <span>📷</span>
                <p>No images available</p>
              </div>
            ) : (
              <div className="gallery-grid">
                {allImages.map((url, i) => (
                  <div key={i} className="gallery-item" onClick={() => setLightbox(url)}>
                    <img src={url} alt="" onError={e => e.target.parentElement.style.display = 'none'} />
                  </div>
                ))}
              </div>
            )}
            {inatObs.length > 0 && (
              <section className="panel-section">
                <h3 className="section-heading">Recent iNaturalist Observations</h3>
                <div className="inat-obs-list">
                  {inatObs.filter(o => o.photo).slice(0, 8).map(obs => (
                    <a key={obs.id} href={obs.uri} target="_blank" rel="noopener noreferrer" className="inat-obs-card">
                      <img src={obs.photo} alt={obs.species} onError={e => e.target.parentElement.style.display = 'none'} />
                      <div className="inat-obs-meta">
                        <span className="inat-obs-name">{obs.species}</span>
                        {obs.place && <span className="inat-obs-place">{obs.place}</span>}
                        {obs.date && <span className="inat-obs-date">{obs.date}</span>}
                      </div>
                    </a>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div className="lightbox-overlay" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" className="lightbox-img" />
          <button className="lightbox-close">✕</button>
        </div>
      )}
    </aside>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

function Stat({ value, label }) {
  return (
    <div className="stat-block">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  )
}

function ExLink({ href, label, icon }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="ext-link">
      <span>{icon}</span> {label}
    </a>
  )
}

function TraitRow({ icon, label, value }) {
  return (
    <div className="trait-row">
      <span className="trait-icon">{icon}</span>
      <span className="trait-label">{label}</span>
      <span className="trait-value">{value}</span>
    </div>
  )
}

function Sparkline({ data }) {
  if (!data || data.length < 2) return null
  const maxCount = Math.max(...data.map(d => d.count))
  const w = 320
  const h = 48
  const stepX = w / (data.length - 1)
  const points = data.map((d, i) => `${i * stepX},${h - (d.count / maxCount) * (h - 4)}`).join(' ')
  const areaPoints = `0,${h} ${points} ${(data.length - 1) * stepX},${h}`
  const latest = data[data.length - 1]

  return (
    <div className="sparkline-container">
      <svg viewBox={`0 0 ${w} ${h}`} className="sparkline-svg">
        <defs>
          <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00FFD4" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#00FFD4" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={areaPoints} fill="url(#sparkGrad)" />
        <polyline points={points} fill="none" stroke="#00FFD4" strokeWidth="1.5" />
      </svg>
      <div className="sparkline-labels">
        <span>{data[0].year}</span>
        <span className="sparkline-latest">{latest.count.toLocaleString()} in {latest.year}</span>
        <span>{latest.year}</span>
      </div>
    </div>
  )
}

function truncate(str, n) {
  if (!str || str.length <= n) return str
  return str.slice(0, str.lastIndexOf(' ', n)) + '…'
}

function fmtNum(n) {
  if (!n) return '0'
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return n.toString()
}
