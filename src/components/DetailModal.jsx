import { useEffect, useRef, useState } from 'react'
import './DetailModal.css'

const STATUS_LABELS = {
  planned: 'Plan to watch',
  watching: 'In process',
  done: 'Done',
}

const TYPE_LABELS = {
  movie: 'Movie',
  series: 'Series',
  anime: 'Anime',
}

// Fetches extra info (overview, seasons, runtime, ...) from TMDB for the
// currently open item. Best-effort: matched by title + year, and the modal
// still shows the item's own stored data if this fails or finds nothing.
function useTmdbDetails(item, apiKey) {
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

export default function DetailModal({ item, onClose, apiKey, imgBase }) {
  const { details, loading, error } = useTmdbDetails(item, apiKey)
  const posterRef = useRef(null)
  // Poster zoom is a small state machine so the enlarge/return animation can
  // run in two steps: 'opening' pins the image at its exact original spot
  // (via position: fixed, so it can escape the modal's own scroll clipping)
  // with no transition, then 'open' moves it to the centered/scaled target
  // with a transition. 'closing' reverses that and settles back to 'idle'
  // (a normal, in-flow image again) once the transition finishes.
  const [zoomPhase, setZoomPhase] = useState('idle')
  const [zoomBox, setZoomBox] = useState({ width: 0, height: 0 })
  const [zoomStart, setZoomStart] = useState('translate(0px, 0px) scale(1)')
  const [zoomTarget, setZoomTarget] = useState('translate(0px, 0px) scale(1)')
  const zoomed = zoomPhase !== 'idle'

  // Reset the zoom whenever a different item is opened (or the modal closes).
  // Adjusted during render (not an effect) per the "resetting state when a
  // prop changes" pattern, to avoid an extra cascading render.
  const [zoomedForItem, setZoomedForItem] = useState(item?.id ?? null)
  if ((item?.id ?? null) !== zoomedForItem) {
    setZoomedForItem(item?.id ?? null)
    setZoomPhase('idle')
  }

  function togglePosterZoom() {
    if (zoomPhase === 'idle') {
      const el = posterRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const targetSize = Math.min(window.innerWidth, window.innerHeight) * 0.72
      const scale = Math.min(targetSize / rect.width, (window.innerHeight * 0.85) / rect.height, 2.4)
      const targetX = (window.innerWidth - rect.width * scale) / 2
      const targetY = (window.innerHeight - rect.height * scale) / 2
      setZoomBox({ width: rect.width, height: rect.height })
      setZoomStart(`translate(${rect.left}px, ${rect.top}px) scale(1)`)
      setZoomTarget(`translate(${targetX}px, ${targetY}px) scale(${scale})`)
      setZoomPhase('opening')
      // Double rAF: let the browser paint the "opening" frame (pinned at the
      // original spot, no transition) before switching to the transitioned
      // target, otherwise the two style changes can get batched into one.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setZoomPhase('open'))
      })
    } else if (zoomPhase === 'open') {
      setZoomPhase('closing')
    }
  }

  function handlePosterTransitionEnd(e) {
    if (e.propertyName === 'transform' && zoomPhase === 'closing') setZoomPhase('idle')
  }

  useEffect(() => {
    if (!item) return
    function onKeyDown(e) {
      if (e.key !== 'Escape') return
      if (zoomPhase === 'open') {
        setZoomPhase('closing')
        return
      }
      if (zoomPhase === 'idle') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [item, onClose, zoomPhase])

  if (!item) return null

  const isTv = item.type === 'series' || item.type === 'anime'
  const poster = item.poster || (details?.poster_path ? imgBase + details.poster_path : null)

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className={'modal-card modal-card--' + item.type}
        role="dialog"
        aria-modal="true"
        aria-label={item.title}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose} aria-label="Close">×</button>

        <div
          className={
            'modal-zoom-overlay' +
            // Dark only for 'opening'/'open': it must start fading out the
            // instant 'closing' begins, in step with the poster's own
            // return transition, not linger at full darkness until the
            // poster settles back into place.
            (zoomPhase === 'opening' || zoomPhase === 'open' ? ' modal-zoom-overlay--active' : '')
          }
          onClick={(e) => {
            e.stopPropagation()
            if (zoomPhase === 'open') togglePosterZoom()
          }}
        />

        <div className="modal-hero">
          {poster ? (
            <div className="modal-poster-slot">
              <img
                ref={posterRef}
                className={'modal-poster' + (zoomed ? ' modal-poster--zoomed' : '')}
                style={
                  zoomed
                    ? {
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        width: zoomBox.width + 'px',
                        height: zoomBox.height + 'px',
                        transformOrigin: '0 0',
                        transform: zoomPhase === 'open' ? zoomTarget : zoomStart,
                        transition:
                          zoomPhase === 'opening' ? 'none' : 'transform 380ms cubic-bezier(0.22, 1, 0.36, 1)',
                      }
                    : undefined
                }
                src={poster}
                alt=""
                onClick={(e) => {
                  e.stopPropagation()
                  togglePosterZoom()
                }}
                onTransitionEnd={handlePosterTransitionEnd}
              />
            </div>
          ) : (
            <div className="modal-poster-slot">
              <div className="modal-poster modal-poster--empty" />
            </div>
          )}
          <div className="modal-hero-info">
            <span className="modal-type">{TYPE_LABELS[item.type] || item.type}</span>
            <h2 className="modal-title">{item.title}</h2>
            <div className="modal-meta">
              {item.year && <span>{item.year}</span>}
              {item.year && item.genre && <span className="modal-meta-dot">•</span>}
              {item.genre && <span>{item.genre}</span>}
              {details?.vote_average > 0 && <span className="modal-meta-dot">•</span>}
              {details?.vote_average > 0 && <span>★ {details.vote_average.toFixed(1)}</span>}
            </div>
            <span className={'modal-status modal-status--' + item.status}>
              {STATUS_LABELS[item.status] || item.status}
            </span>
          </div>
        </div>

        {loading && <p className="modal-note">Loading details…</p>}
        {!loading && error && <p className="modal-note modal-note--error">{error}</p>}

        {details?.overview && <p className="modal-overview">{details.overview}</p>}

        {isTv && details && (
          <div className="modal-facts">
            {typeof details.number_of_seasons === 'number' && (
              <div className="modal-fact">
                <span className="modal-fact-label">Seasons</span>
                <span className="modal-fact-value">{details.number_of_seasons}</span>
              </div>
            )}
            {typeof details.number_of_episodes === 'number' && (
              <div className="modal-fact">
                <span className="modal-fact-label">Episodes</span>
                <span className="modal-fact-value">{details.number_of_episodes}</span>
              </div>
            )}
            {details.status && (
              <div className="modal-fact">
                <span className="modal-fact-label">Airing status</span>
                <span className="modal-fact-value">{details.status}</span>
              </div>
            )}
          </div>
        )}

        {!isTv && details && (details.runtime > 0 || details.status) && (
          <div className="modal-facts">
            {details.runtime > 0 && (
              <div className="modal-fact">
                <span className="modal-fact-label">Runtime</span>
                <span className="modal-fact-value">{details.runtime} min</span>
              </div>
            )}
            {details.status && (
              <div className="modal-fact">
                <span className="modal-fact-label">Status</span>
                <span className="modal-fact-value">{details.status}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
