/**
 * CacheManager.js
 * Comprehensive client-side caching using IndexedDB.
 * Handles API response caching and Taxon ID cross-referencing.
 */

const DB_NAME = 'TaxonOS_Cache'
const DB_VERSION = 1
const STORES = {
  API_CACHE: 'api_cache',
  CROSSWALK: 'crosswalk'
}

let db = null

async function openDB() {
  if (db) return db
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = (e) => {
      const d = e.target.result
      if (!d.objectStoreNames.contains(STORES.API_CACHE)) {
        d.createObjectStore(STORES.API_CACHE)
      }
      if (!d.objectStoreNames.contains(STORES.CROSSWALK)) {
        d.createObjectStore(STORES.CROSSWALK)
      }
    }
    request.onsuccess = (e) => { db = e.target.result; resolve(db) }
    request.onerror = (e) => reject(e.target.error)
  })
}

/**
 * Get cached data for a specific source and key.
 * TTL is checked internally.
 * @param {string} storeName 
 * @param {string} key 
 */
export async function getCache(storeName, key) {
  try {
    const d = await openDB()
    return new Promise((resolve) => {
      const tx = d.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)
      const request = store.get(key)
      request.onsuccess = () => {
        const item = request.result
        if (item && item.expiry > Date.now()) {
          resolve(item.value)
        } else {
          resolve(null)
        }
      }
      request.onerror = () => resolve(null)
    })
  } catch (e) { return null }
}

/**
 * Set data in cache. 
 * @param {string} storeName 
 * @param {string} key 
 * @param {any} value 
 * @param {number} ttlInMs (default 7 days)
 */
export async function setCache(storeName, key, value, ttlInMs = 7 * 24 * 60 * 60 * 1000) {
  try {
    const d = await openDB()
    return new Promise((resolve) => {
      const tx = d.transaction(storeName, 'readwrite')
      const store = tx.objectStore(storeName)
      const expiry = Date.now() + ttlInMs
      store.put({ value, expiry }, key)
      tx.oncomplete = () => resolve(true)
    })
  } catch (e) { return false }
}

// Helper: Specific crosswalk store
export const getIDMapping = (name) => getCache(STORES.CROSSWALK, name)
export const setIDMapping = (name, mappings) => setCache(STORES.CROSSWALK, name, mappings)

// Helper: API response caching
export const getAPICache = (source, query) => getCache(STORES.API_CACHE, `${source}:${query}`)
export const setAPICache = (source, query, data, ttl) => setCache(STORES.API_CACHE, `${source}:${query}`, data, ttl)

export { STORES }
