import { fetchXCRecordings } from './xenocanto'

/**
 * SoundEngine — immersive audio for TaxonOS.
 * Uses Xeno-canto API v3 for real wildlife sounds.
 * Requires VITE_XC_API_KEY in .env — get a free key at xeno-canto.org.
 * Without a key, ambient rain audio still plays; taxon-specific sounds are skipped.
 */

class SoundEngine {
  constructor() {
    this.ambient = null
    this.taxonAudio = null
    this.enabled = false
    this.volume = 0.45
  }

  enable() {
    this.enabled = true
    this._startAmbient()
  }

  disable() {
    this.enabled = false
    if (this.ambient) { this.ambient.pause(); this.ambient = null }
    if (this.taxonAudio) { this.taxonAudio.pause(); this.taxonAudio = null }
  }

  _startAmbient() {
    if (!this.enabled || this.ambient) return
    // Royalty-free ambient forest loop
    this.ambient = new Audio(
      'https://www.soundjay.com/nature/sounds/rain-01.mp3'
    )
    this.ambient.loop = true
    this.ambient.volume = this.volume * 0.2
    this.ambient.play().catch(() => {})
  }

  async playTaxon(scientificName) {
    if (!this.enabled) return

    // Stop current taxon sound
    if (this.taxonAudio) {
      const old = this.taxonAudio
      old.volume = 0
      setTimeout(() => { old.pause() }, 300)
      this.taxonAudio = null
    }

    try {
      const recordings = await fetchXCRecordings(scientificName, 1)
      if (!recordings.length) return
      
      const rec = recordings[0]
      const audio = new Audio(rec.url)
      audio.volume = this.volume
      audio.play().catch(err => {
        console.warn('SoundEngine: Failed to play', rec.url, err)
      })
      this.taxonAudio = audio
    } catch (err) {
      console.warn('SoundEngine: Xeno-canto error', err)
    }
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v))
    if (this.ambient) this.ambient.volume = this.volume * 0.2
    if (this.taxonAudio) this.taxonAudio.volume = this.volume
  }
}

export const soundEngine = new SoundEngine()
