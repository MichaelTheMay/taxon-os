// Vercel serverless proxy for all external APIs
// Routes: /api/otl/*, /api/gbif/*, /api/wiki/*, /api/inat/*, /api/ncbi/*, /api/eol/*, /api/wikidata/*

const TARGETS = {
  otl:      'https://api.opentreeoflife.org/v3',
  gbif:     'https://api.gbif.org/v1',
  wiki:     'https://en.wikipedia.org/api/rest_v1',
  inat:     'https://api.inaturalist.org/v1',
  ncbi:     'https://api.ncbi.nlm.nih.gov/datasets/v2',
  eol:      'https://eol.org/api',
  wikidata: 'https://query.wikidata.org',
  xc:       'https://xeno-canto.org',
}

// Simple in-memory cache (per cold start)
const cache = new Map()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

// Rate limiter: per-domain sliding window
const rateLimits = new Map()
const RATE_WINDOW = 60_000 // 1 minute
const MAX_REQUESTS = 60    // per domain per minute

function checkRateLimit(domain) {
  const now = Date.now()
  if (!rateLimits.has(domain)) rateLimits.set(domain, [])
  const timestamps = rateLimits.get(domain).filter(t => now - t < RATE_WINDOW)
  rateLimits.set(domain, timestamps)
  if (timestamps.length >= MAX_REQUESTS) return false
  timestamps.push(now)
  return true
}

export default async function handler(req, res) {
  // Parse: /api/proxy?target=otl&path=/tnrs/match_names
  const { target, path: apiPath } = req.query

  if (!target || !TARGETS[target]) {
    return res.status(400).json({ error: `Unknown target: ${target}. Valid: ${Object.keys(TARGETS).join(', ')}` })
  }

  if (!checkRateLimit(target)) {
    return res.status(429).json({ error: 'Rate limit exceeded. Try again shortly.' })
  }

  const targetBase = TARGETS[target]
  const url = `${targetBase}${apiPath || ''}`

  // Cache key for GET requests
  const cacheKey = `${req.method}:${url}:${JSON.stringify(req.body || '')}`
  if (req.method === 'GET' || req.method === 'POST') {
    const cached = cache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      res.setHeader('X-Cache', 'HIT')
      return res.status(200).json(cached.data)
    }
  }

  try {
    const fetchOpts = {
      method: req.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    }
    if (req.method === 'POST' && req.body) {
      fetchOpts.body = JSON.stringify(req.body)
    }

    const response = await fetch(url, fetchOpts)

    if (!response.ok) {
      return res.status(response.status).json({ error: `Upstream ${target} returned ${response.status}` })
    }

    const data = await response.json()

    // Cache the response
    cache.set(cacheKey, { data, timestamp: Date.now() })
    // Evict old entries if cache grows too large
    if (cache.size > 500) {
      const oldest = [...cache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)
      for (let i = 0; i < 100; i++) cache.delete(oldest[i][0])
    }

    res.setHeader('X-Cache', 'MISS')
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
    return res.status(200).json(data)
  } catch (err) {
    console.error(`Proxy error [${target}]:`, err.message)
    return res.status(502).json({ error: `Failed to reach ${target}: ${err.message}` })
  }
}
