/**
 * LifePulse polls iNaturalist for real-time observations
 * and notifies the app to pulse nodes on the tree.
 */

class LifePulse {
  constructor() {
    this.subscribers = []
    this.interval = null
    this.lastId = null
    this.running = false
  }

  start() {
    if (this.running) return
    this.running = true
    this.poll()
    this.interval = setInterval(() => this.poll(), 20000) // Every 20s
  }

  stop() {
    this.running = false
    if (this.interval) clearInterval(this.interval)
  }

  subscribe(callback) {
    this.subscribers.push(callback)
  }

  async poll() {
    try {
      // Get most recent observations globally
      const res = await fetch('https://api.inaturalist.org/v1/observations?per_page=10&order=desc&order_by=created_at')
      const data = await res.json()
      
      const newObs = data.results.filter(obs => !this.lastId || obs.id > this.lastId)
      if (newObs.length > 0) {
        this.lastId = Math.max(...newObs.map(o => o.id))
        
        // Notify subscribers of the taxonomic IDs
        newObs.forEach(obs => {
          if (obs.taxon) {
            this.subscribers.forEach(cb => cb({
              taxonName: obs.taxon.name,
              rank: obs.taxon.rank,
              imageUrl: obs.taxon.default_photo?.square_url,
              location: obs.place_guess
            }))
          }
        })
      }
    } catch (err) {
      console.warn('LifePulse: Poll failed', err)
    }
  }
}

export const lifePulse = new LifePulse()
