import './SearchBox.css'
import { TMDB_IMG } from '../../constants'

// TMDB title search input + results dropdown, debounced in App.jsx (see
// useEffect on `query` there). Purely presentational — all search state and
// the fetch itself live in App.jsx.
export default function SearchBox({
  boxRef,
  query,
  onQueryChange,
  showResults,
  onFocus,
  searching,
  searchError,
  results,
  onSelect,
}) {
  return (
    <div className="search-box" ref={boxRef}>
      <input
        className="search-input"
        placeholder="Search movies, series or anime..."
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onFocus={onFocus}
      />
      {showResults && (query.trim() || searching) && (
        <div className="search-dropdown">
          {searching && <div className="search-status">Searching…</div>}
          {searchError && <div className="search-status search-status--error">{searchError}</div>}
          {!searching && !searchError && query.trim() && results.length === 0 && (
            <div className="search-status">No matches. Try adding it manually below.</div>
          )}
          {results.map((r) => (
            <button key={r.id} type="button" className="search-result" onClick={() => onSelect(r)}>
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
  )
}
