// IUCN Red List status utilities
// Maps short codes to full labels and colors

export const IUCN_STATUS = {
  EX:  { label: 'Extinct',               color: '#000000', bg: '#1a1a1a' },
  EW:  { label: 'Extinct in the Wild',   color: '#7b2d8b', bg: '#3d1646' },
  CR:  { label: 'Critically Endangered', color: '#e00000', bg: '#4a0000' },
  EN:  { label: 'Endangered',            color: '#f57900', bg: '#4a2600' },
  VU:  { label: 'Vulnerable',            color: '#f5c900', bg: '#4a3d00' },
  NT:  { label: 'Near Threatened',       color: '#4fc1e9', bg: '#1a3a4a' },
  LC:  { label: 'Least Concern',         color: '#4caf50', bg: '#1a3a1c' },
  DD:  { label: 'Data Deficient',        color: '#bdbdbd', bg: '#3a3a3a' },
  NE:  { label: 'Not Evaluated',         color: '#666666', bg: '#2a2a2a' },
}

export function getIUCNInfo(statusCode) {
  if (!statusCode) return null
  const code = statusCode.toUpperCase().replace(/ /g, '')
  return IUCN_STATUS[code] || null
}

export function getIUCNColor(statusCode) {
  return getIUCNInfo(statusCode)?.color || '#666'
}

export function getIUCNLabel(statusCode) {
  return getIUCNInfo(statusCode)?.label || statusCode || 'Unknown'
}

// Conservation status severity (higher = more threatened)
export function getIUCNSeverity(statusCode) {
  const order = { EX: 7, EW: 6, CR: 5, EN: 4, VU: 3, NT: 2, LC: 1, DD: 0, NE: -1 }
  return order[statusCode?.toUpperCase()] ?? -1
}
