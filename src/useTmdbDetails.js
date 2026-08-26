import { useEffect, useState } from 'react'

// Fetches extra info (overview, seasons, runtime, ...) from TMDB for the
// currently open item. Best-effort: matched by title + year, and DetailModal
// still shows the item's own stored data if this fails or finds nothing.
export function useTmdbDetails(item, apiKey) {
  const [details, setDetails] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDetails(null)
    setError('')
    if (!item || !apiKey || apiKey === 'YOUR_TMDB_API_KEY') return
    const isTv = item.type === 'series' || item.type === 'anime'
    let cancelled = false

    async function run() {
      setLoading(true)
      try {
        const searchRes = await fetch(
          `https://api.themoviedb.org/3/search/${isTv ? 'tv' : 'movie'}?api_key=${apiKey}&query=${encodeURIComponent(item.title)}`
        )
        if (!searchRes.ok) throw new Error('search failed')
        const searchData = await searchRes.json()
        const results = searchData.results || []
        const match =
          results.find((r) => (r.release_date || r.first_air_date || '').slice(0, 4) === item.year) ||
          results[0]
        if (!match) {
          if (!cancelled) setError('No extra details found on TMDB.')
          return
        }
        const detailRes = await fetch(
          `https://api.themoviedb.org/3/${isTv ? 'tv' : 'movie'}/${match.id}?api_key=${apiKey}`
        )
        if (!detailRes.ok) throw new Error('detail failed')
        const detailData = await detailRes.json()
        if (!cancelled) setDetails(detailData)
      // eslint-disable-next-line no-unused-vars
      } catch (e) {
        if (!cancelled) setError('Could not load extra details.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [item, apiKey])

  return { details, loading, error }
}
