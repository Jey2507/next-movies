import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import './App.css'
import { supabase, isSupabaseConfigured } from './supabaseClient'
import DetailModal from './components/DetailModal'
import ConfirmDeleteModal from './components/ConfirmDeleteModal'

// Get a free key at https://www.themoviedb.org/settings/api and paste it below.
const TMDB_API_KEY = '4f5ec21ec83179db03e267a97d8f594d'
const TMDB_IMG = 'https://image.tmdb.org/t/p/w200'
const LOCAL_KEY = 'watch-queue-items'

const TYPES = [
  { id: 'movie', label: 'Movie' },
  { id: 'series', label: 'Series' },
  { id: 'anime', label: 'Anime' },
]

const STATUSES = [
  { id: 'planned', label: 'Plan to watch', color: 'var(--gold)' },
  { id: 'watching', label: 'In process', color: 'var(--teal)' },
  { id: 'done', label: 'Done', color: 'var(--green)' },
]

const GENRE_NAMES = {
  16: 'Animation', 18: 'Drama', 35: 'Comedy', 28: 'Action', 12: 'Adventure',
  878: 'Sci-fi', 14: 'Fantasy', 9648: 'Mystery', 10765: 'Sci-fi & fantasy',
  10759: 'Action & adventure', 80: 'Crime', 27: 'Horror', 10749: 'Romance',
  53: 'Thriller', 99: 'Documentary', 10751: 'Family',
}

const SEED = [
  { id: 1, title: 'Dune: Part Three', type: 'movie', year: '2026', genre: 'Sci-fi', status: 'planned', poster: null, position: 1 },
  { id: 2, title: 'Severance', type: 'series', year: '2025', genre: 'Mystery', status: 'watching', poster: null, position: 2 },
  { id: 3, title: 'Frieren', type: 'anime', year: '2023', genre: 'Fantasy', status: 'done', poster: null, position: 3 },
]

// Re-stamps every item's "position" as a clean 1..N sequence, in the order
// items already sort into (missing/duplicate positions fall back to their
// current array order instead of colliding). Returns { list, changed } so
// callers can skip a write-back when nothing needed fixing.
function normalizePositions(list) {
  const withIndex = list.map((item, index) => ({ item, index }))
  withIndex.sort((x, y) => {
    const px = typeof x.item.position === 'number' ? x.item.position : Infinity
    const py = typeof y.item.position === 'number' ? y.item.position : Infinity
    return px - py || x.index - y.index
  })
  let changed = false
  const result = withIndex.map(({ item }, idx) => {
    const position = idx + 1
    if (item.position !== position) changed = true
    return item.position === position ? item : { ...item, position }
  })
  return { list: result, changed }
}

function loadLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    if (raw) return normalizePositions(JSON.parse(raw)).list
  // eslint-disable-next-line no-unused-vars
  } catch (e) {
    // ignore corrupted storage
  }
  return SEED
}

function saveLocal(items) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(items))
  // eslint-disable-next-line no-unused-vars
  } catch (e) {
    // ignore write failures
  }
}

function initials(type) {
  if (type === 'movie') return 'MOV'
  if (type === 'series') return 'SER'
  return 'ANI'
}

function guessType(result) {
  const isAnime = result.original_language === 'ja' && (result.genre_ids || []).includes(16)
  if (isAnime) return 'anime'
  return result.media_type === 'tv' ? 'series' : 'movie'
}

function firstGenre(result) {
  const id = (result.genre_ids || [])[0]
  return GENRE_NAMES[id] || ''
}

export default function App() {
  const [items, setItems] = useState(isSupabaseConfigured ? [] : loadLocal)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [genreFilter, setGenreFilter] = useState('all')

  const [title, setTitle] = useState('')
  const [type, setType] = useState('movie')
  const [year, setYear] = useState('')
  const [genre, setGenre] = useState('')

  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [showResults, setShowResults] = useState(false)
  const boxRef = useRef(null)
  const ticketRefs = useRef(new Map())
  const prevRectsRef = useRef(null)
  const [activeItem, setActiveItem] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)

  // Load from Supabase on mount (falls back to localStorage if not configured)
  useEffect(() => {
    if (!isSupabaseConfigured) return
    let cancelled = false
    async function load() {
      const { data, error } = await supabase
        .from('items')
        .select('*')
        .order('position', { ascending: true })
      if (!cancelled) {
        if (!error && data) {
          const { list, changed } = normalizePositions(data)
          setItems(list)
          if (changed) {
            for (const item of list) {
              await supabase.from('items').update({ position: item.position }).eq('id', item.id)
            }
          }
        }
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // Keep localStorage as an offline mirror whenever Supabase isn't configured
  useEffect(() => {
    if (!isSupabaseConfigured) saveLocal(items)
  }, [items])

  useEffect(() => {
    if (!query.trim()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([])
      setSearchError('')
      return
    }
    if (!TMDB_API_KEY || TMDB_API_KEY === 'YOUR_TMDB_API_KEY') {
      setSearchError('Add your free TMDB API key at the top of App.jsx to enable search.')
      return
    }
    const handle = setTimeout(async () => {
      setSearching(true)
      setSearchError('')
      try {
        const res = await fetch(
          `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`
        )
        if (!res.ok) throw new Error('bad response')
        const data = await res.json()
        const filtered = (data.results || []).filter(
          (r) => r.media_type === 'movie' || r.media_type === 'tv'
        )
        setResults(filtered.slice(0, 8))
      // eslint-disable-next-line no-unused-vars
      } catch (e) {
        setSearchError('Search failed. Check your connection or API key.')
      } finally {
        setSearching(false)
      }
    }, 400)
    return () => clearTimeout(handle)
  }, [query])

  useEffect(() => {
    function onClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setShowResults(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  async function addItem(entry) {
    const position = items.length ? Math.max(...items.map((i) => i.position || 0)) + 1 : 1
    const withPosition = { ...entry, position }
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.from('items').insert(withPosition).select().single()
      if (!error && data) setItems((prev) => [...prev, data])
    } else {
      setItems((prev) => [...prev, { ...withPosition, id: Date.now() }])
    }
  }

  function addFromSearch(result) {
    const name = result.title || result.name
    const date = result.release_date || result.first_air_date || ''
    addItem({
      title: name,
      type: guessType(result),
      year: date ? date.slice(0, 4) : '',
      genre: firstGenre(result),
      status: 'planned',
      poster: result.poster_path ? TMDB_IMG + result.poster_path : null,
    })
    setQuery('')
    setResults([])
    setShowResults(false)
  }

  function addManual(e) {
    e.preventDefault()
    if (!title.trim()) return
    addItem({
      title: title.trim(),
      type,
      year: year.trim(),
      genre: genre.trim(),
      status: 'planned',
      poster: null,
    })
    setTitle('')
    setYear('')
    setGenre('')
  }

  async function removeItem(id) {
    setItems((prev) => prev.filter((i) => i.id !== id))
    if (isSupabaseConfigured) await supabase.from('items').delete().eq('id', id)
  }

  async function changeStatus(id, status) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)))
    if (isSupabaseConfigured) await supabase.from('items').update({ status }).eq('id', id)
  }

  function captureRects() {
    const map = new Map()
    ticketRefs.current.forEach((el, itemId) => {
      if (el) map.set(itemId, el.getBoundingClientRect())
    })
    prevRectsRef.current = map
  }

  async function moveItem(id, direction) {
    const idx = visible.findIndex((i) => i.id === id)
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    if (idx === -1 || targetIdx < 0 || targetIdx >= visible.length) return
    const a = visible[idx]
    const b = visible[targetIdx]
    captureRects()
    setItems((prev) =>
      prev.map((i) => {
        if (i.id === a.id) return { ...i, position: b.position }
        if (i.id === b.id) return { ...i, position: a.position }
        return i
      })
    )
    if (isSupabaseConfigured) {
      await supabase.from('items').update({ position: b.position }).eq('id', a.id)
      await supabase.from('items').update({ position: a.position }).eq('id', b.id)
    }
  }

  const genres = Array.from(new Set(items.map((i) => i.genre).filter(Boolean))).sort()

  const visible = items
    .filter(
      (i) =>
        (typeFilter === 'all' || i.type === typeFilter) &&
        (statusFilter === 'all' || i.status === statusFilter) &&
        (genreFilter === 'all' || i.genre === genreFilter)
    )
    .sort((a, b) => (a.position || 0) - (b.position || 0))

  const orderKey = visible.map((i) => i.id).join(',')

  // FLIP animation: whenever the visible order changes because of a move,
  // animate every ticket from its previous screen position to its new one.
  useLayoutEffect(() => {
    const prevRects = prevRectsRef.current
    if (!prevRects) return
    prevRectsRef.current = null
    ticketRefs.current.forEach((el, itemId) => {
      const prevRect = prevRects.get(itemId)
      if (!el || !prevRect) return
      const newRect = el.getBoundingClientRect()
      const dx = prevRect.left - newRect.left
      const dy = prevRect.top - newRect.top
      if (!dx && !dy) return
      el.style.transition = 'none'
      el.style.transform = `translate(${dx}px, ${dy}px)`
      el.style.zIndex = '5'
      // force reflow so the starting transform is applied before we animate away from it
      el.getBoundingClientRect()
      requestAnimationFrame(() => {
        el.style.transition = 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)'
        el.style.transform = ''
      })
      const onDone = (e) => {
        if (e.target !== el) return
        el.style.transition = ''
        el.style.zIndex = ''
        el.removeEventListener('transitionend', onDone)
      }
      el.addEventListener('transitionend', onDone)
    })
  }, [orderKey])

  return (
    <div className="queue-app">
      <header className="queue-header">
        <span className="queue-eyebrow">Now booking</span>
        <h1 className="queue-title">Up next</h1>
        <p className="queue-sub">Your queue of titles waiting for a premiere night.</p>
      </header>

      {!isSupabaseConfigured && (
        <div className="config-note">
          Saving to this browser only. Configure supabaseClient.js to sync across devices.
        </div>
      )}

      <div className="search-box" ref={boxRef}>
        <input
          className="search-input"
          placeholder="Search movies, series or anime..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setShowResults(true)
          }}
          onFocus={() => setShowResults(true)}
        />
        {showResults && (query.trim() || searching) && (
          <div className="search-dropdown">
            {searching && <div className="search-status">Searching…</div>}
            {searchError && <div className="search-status search-status--error">{searchError}</div>}
            {!searching && !searchError && query.trim() && results.length === 0 && (
              <div className="search-status">No matches. Try adding it manually below.</div>
            )}
            {results.map((r) => (
              <button key={r.id} type="button" className="search-result" onClick={() => addFromSearch(r)}>
                {r.poster_path ? (
                  <img className="search-result-poster" src={TMDB_IMG + r.poster_path} alt="" />
                ) : (
                  <div className="search-result-poster search-result-poster--empty" />
                )}
                <div className="search-result-info">
                  <span className="search-result-title">{r.title || r.name}</span>
                  <span className="search-result-meta">
                    {(r.release_date || r.first_air_date || '').slice(0, 4) || '—'} ·{' '}
                    {r.media_type === 'tv' ? 'Series' : 'Movie'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <form className="add-row" onSubmit={addManual}>
        <input
          className="add-input add-input--title"
          placeholder="Add manually: title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <select className="add-input add-input--type" value={type} onChange={(e) => setType(e.target.value)}>
          {TYPES.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
        <input
          className="add-input add-input--year"
          placeholder="Year"
          value={year}
          onChange={(e) => setYear(e.target.value)}
        />
        <input
          className="add-input add-input--genre"
          placeholder="Genre"
          value={genre}
          onChange={(e) => setGenre(e.target.value)}
        />
        <button className="add-btn" type="submit">Add to queue</button>
      </form>

      <div className="filter-row">
        <button
          className={'filter-pill' + (typeFilter === 'all' ? ' filter-pill--active' : '')}
          onClick={() => setTypeFilter('all')}
        >
          All types · {items.length}
        </button>
        {TYPES.map((t) => (
          <button
            key={t.id}
            className={'filter-pill filter-pill--' + t.id + (typeFilter === t.id ? ' filter-pill--active' : '')}
            onClick={() => setTypeFilter(t.id)}
          >
            {t.label} · {items.filter((i) => i.type === t.id).length}
          </button>
        ))}
      </div>

      <div className="filter-row">
        <button
          className={'filter-pill' + (statusFilter === 'all' ? ' filter-pill--active' : '')}
          onClick={() => setStatusFilter('all')}
        >
          All statuses
        </button>
        {STATUSES.map((s) => (
          <button
            key={s.id}
            className={'filter-pill filter-pill--status-' + s.id + (statusFilter === s.id ? ' filter-pill--active' : '')}
            onClick={() => setStatusFilter(s.id)}
          >
            {s.label} · {items.filter((i) => i.status === s.id).length}
          </button>
        ))}
        {genres.length > 0 && (
          <select
            className="genre-filter-select"
            value={genreFilter}
            onChange={(e) => setGenreFilter(e.target.value)}
          >
            <option value="all">All genres</option>
            {genres.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <div className="empty-state">
          <p className="empty-title">Loading…</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="empty-state">
          <p className="empty-title">Nothing here</p>
          <p className="empty-sub">Search above or add a title manually.</p>
        </div>
      ) : (
        <div className="ticket-grid">
          {visible.map((item) => (
            <article
              className={'ticket ticket--' + item.type}
              key={item.id}
              ref={(el) => {
                if (el) ticketRefs.current.set(item.id, el)
                else ticketRefs.current.delete(item.id)
              }}
              onClick={() => setActiveItem(item)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setActiveItem(item)
                }
              }}
              role="button"
              tabIndex={0}
              aria-label={`View details for ${item.title}`}
            >
              <div className="ticket-stub">
                <span className="ticket-stub-code">{initials(item.type)}</span>
                <span className="ticket-stub-admit">ADMIT ONE</span>
              </div>
              <div className="ticket-perf" aria-hidden="true" />
              <div className="ticket-body">
                {item.poster && (
                  <>
                    <img className="ticket-bg-poster" src={item.poster} alt="" aria-hidden="true" />
                    <div className="ticket-bg-overlay" aria-hidden="true" />
                  </>
                )}
                <div className="ticket-content">
                  <div className="ticket-body-top">
                    <span className="ticket-type">{TYPES.find((t) => t.id === item.type)?.label}</span>
                    <div className="ticket-order">
                      <button
                        className="ticket-order-btn ticket-order-btn--up"
                        onClick={(e) => { e.stopPropagation(); moveItem(item.id, 'up') }}
                        disabled={visible.findIndex((i) => i.id === item.id) === 0}
                        aria-label={`Move ${item.title} up`}
                      >
                        <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
                          <path d="M2 7.5L6 3.5L10 7.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                      <button
                        className="ticket-order-btn ticket-order-btn--down"
                        onClick={(e) => { e.stopPropagation(); moveItem(item.id, 'down') }}
                        disabled={visible.findIndex((i) => i.id === item.id) === visible.length - 1}
                        aria-label={`Move ${item.title} down`}
                      >
                        <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
                          <path d="M2 4.5L6 8.5L10 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </div>
                    <button
                      className="ticket-remove"
                      onClick={(e) => { e.stopPropagation(); setPendingDelete(item) }}
                      aria-label={`Remove ${item.title}`}
                    >
                      ×
                    </button>
                  </div>
                  <h2 className="ticket-name">{item.title}</h2>
                  <div className="ticket-meta">
                    {item.year && <span>{item.year}</span>}
                    {item.year && item.genre && <span className="ticket-meta-dot">•</span>}
                    {item.genre && <span>{item.genre}</span>}
                  </div>
                  <select
                    className={'status-select status-select--' + item.status}
                    value={item.status}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => changeStatus(item.id, e.target.value)}
                  >
                    {STATUSES.map((s) => (
                      <option key={s.id} value={s.id} style={{ color: s.color }}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <DetailModal
        item={activeItem}
        onClose={() => setActiveItem(null)}
        apiKey={TMDB_API_KEY}
        imgBase={TMDB_IMG}
      />

      <ConfirmDeleteModal
        item={pendingDelete}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          removeItem(pendingDelete.id)
          setPendingDelete(null)
        }}
      />
    </div>
  )
}