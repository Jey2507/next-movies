import { useEffect, useState } from 'react'

// Fetches extra info (overview, seasons, runtime, ...) from TMDB for the
// currently open item. Best-effort: matched by title + year, and DetailModal
// still shows the item's own stored data if this fails or finds nothing.
export function useTmdbDetails(item, apiKey) {
  const [details, setDetails] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Read as plain primitives, not `item` itself — App.jsx hands down a
  // *new* item object on every edit to it (a rating, a note, a status
  // change, ...), even when it's still the very same title. Keying
  // anything below off `item` by reference, instead of the handful of
  // fields the fetch actually needs, would treat every one of those edits
  // as "a different item just opened" and re-run the whole fetch from
  // scratch — wiping already-loaded details for a moment (and, for a title
  // TMDB can't match, briefly flashing the "No extra details found" error)
  // before it resolves again a beat later. That's what used to make e.g.
  // clicking a rating star jolt the modal's layout.
  const itemId = item?.id ?? null
  const itemType = item?.type
  const itemTitle = item?.title
  const itemYear = item?.year
  const hasApiKey = !!apiKey && apiKey !== 'YOUR_TMDB_API_KEY'

  // Which item the details/loading/error state above currently describes.
  // Reset during render (not in the effect below) the moment the *id*
  // changes, so switching items clears the *previous* item's details
  // before this render ever paints — otherwise DetailModal would render one
  // frame with the new item's poster/title next to the old item's
  // overview/facts (stale data, and a size that has nothing to do with
  // what's about to load), then jump again once the effect's own reset
  // commits a render later.
  const [detailsForId, setDetailsForId] = useState(itemId)
  if (itemId !== detailsForId) {
    setDetailsForId(itemId)
    setDetails(null)
    setError('')
    setLoading(!!itemId && hasApiKey)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDetails(null)
    setError('')
    if (!itemId || !hasApiKey) return
    const isTv = itemType === 'series' || itemType === 'anime'
    let cancelled = false

    async function run() {
      setLoading(true)
      try {
        const searchRes = await fetch(
          `https://api.themoviedb.org/3/search/${isTv ? 'tv' : 'movie'}?api_key=${apiKey}&query=${encodeURIComponent(itemTitle)}`
        )
        if (!searchRes.ok) throw new Error('search failed')
        const searchData = await searchRes.json()
        const results = searchData.results || []
        const match =
          results.find((r) => (r.release_date || r.first_air_date || '').slice(0, 4) === itemYear) ||
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
  }, [itemId, itemType, itemTitle, itemYear, apiKey, hasApiKey])

  return { details, loading, error }
}
