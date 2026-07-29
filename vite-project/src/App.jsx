import { useState, useEffect, useRef } from 'react'
import './App.css'
import { supabase, isSupabaseConfigured } from './supabaseClient'

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
  { id: 1, title: 'Dune: Part Three', type: 'movie', year: '2026', genre: 'Sci-fi', status: 'planned', poster: null },
  { id: 2, title: 'Severance', type: 'series', year: '2025', genre: 'Mystery', status: 'watching', poster: null },
  { id: 3, title: 'Frieren', type: 'anime', year: '2023', genre: 'Fantasy', status: 'done', poster: null },
]

function loadLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    if (raw) return JSON.parse(raw)
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

  // Load from Supabase on mount (falls back to localStorage if not configured)
  useEffect(() => {
    if (!isSupabaseConfigured) return
    let cancelled = false
    async function load() {
      const { data, error } = await supabase
        .from('items')
        .select('*')
        .order('created_at', { ascending: false })
      if (!cancelled) {
        if (!error && data) setItems(data)
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
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.from('items').insert(entry).select().single()
      if (!error && data) setItems((prev) => [data, ...prev])
    } else {
      setItems((prev) => [{ ...entry, id: Date.now() }, ...prev])
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

  const visible = items.filter(
    (i) =>
      (typeFilter === 'all' || i.type === typeFilter) &&
      (statusFilter === 'all' || i.status === statusFilter)
  )

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
            <article className={'ticket ticket--' + item.type} key={item.id}>
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
                    <button className="ticket-remove" onClick={() => removeItem(item.id)} aria-label={`Remove ${item.title}`}>
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
    </div>
  )
}
