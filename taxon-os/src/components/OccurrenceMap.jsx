import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

// Auto-fit the map view to markers
function FitBounds({ points }) {
  const map = useMap()
  useEffect(() => {
    if (!points || points.length === 0) return
    const lats = points.map(p => p.lat)
    const lngs = points.map(p => p.lng)
    const bounds = [
      [Math.min(...lats), Math.min(...lngs)],
      [Math.max(...lats), Math.max(...lngs)],
    ]
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 8 })
  }, [points, map])
  return null
}

export default function OccurrenceMap({ points, loading }) {
  if (loading) {
    return (
      <div className="occ-map-loading">
        <div className="loading-dots"><span/><span/><span/></div>
        <span>Loading occurrence data…</span>
      </div>
    )
  }

  if (!points || points.length === 0) {
    return (
      <div className="occ-map-empty">
        <span className="occ-map-empty-icon">🗺️</span>
        <p>No georeferenced occurrences found</p>
      </div>
    )
  }

  return (
    <div className="occ-map-container">
      <div className="occ-map-count">
        {points.length.toLocaleString()} occurrence{points.length !== 1 ? 's' : ''} mapped
      </div>
      <MapContainer
        center={[20, 0]}
        zoom={2}
        className="occ-map"
        scrollWheelZoom={true}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        />
        <FitBounds points={points} />
        {points.map((pt, i) => (
          <CircleMarker
            key={i}
            center={[pt.lat, pt.lng]}
            radius={4}
            pathOptions={{
              color: '#00FFD4',
              fillColor: '#00FFD4',
              fillOpacity: 0.6,
              weight: 1,
              opacity: 0.8,
            }}
          >
            <Popup className="occ-popup">
              <div className="occ-popup-content">
                {pt.species && <div className="occ-popup-species">{pt.species}</div>}
                {pt.year && <div className="occ-popup-detail">Year: {pt.year}</div>}
                {pt.country && <div className="occ-popup-detail">Country: {pt.country}</div>}
                {pt.basisOfRecord && (
                  <div className="occ-popup-detail">
                    {pt.basisOfRecord.replace(/_/g, ' ').toLowerCase()}
                  </div>
                )}
                <div className="occ-popup-coords">
                  {pt.lat.toFixed(3)}°, {pt.lng.toFixed(3)}°
                </div>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  )
}
