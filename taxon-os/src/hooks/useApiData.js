import { useState, useCallback } from 'react'

export default function useApiData(fetcher) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const run = useCallback(async (...args) => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetcher(...args)
      setData(result)
      return result
    } catch (err) {
      setError(err)
      setData(null)
      return null
    } finally {
      setLoading(false)
    }
  }, [fetcher])

  const retry = useCallback((...args) => run(...args), [run])
  const reset = useCallback(() => { setData(null); setLoading(false); setError(null) }, [])

  return { data, loading, error, run, retry, reset }
}
