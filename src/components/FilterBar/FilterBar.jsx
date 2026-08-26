import './FilterBar.css'
import { TYPES, STATUSES } from '../../constants'

// Type/status/genre filter pills above the ticket grid. Counts are derived
// from `items` (the unfiltered list); the actual filtering happens in
// App.jsx's `visible` memo.
export default function FilterBar({
  items,
  typeFilter,
  onTypeFilterChange,
  statusFilter,
  onStatusFilterChange,
  genreFilter,
  onGenreFilterChange,
  genres,
}) {
  return (
    <div className="filter-bar">
      <div className="filter-row">
        <span className="filter-row-label">Type</span>
        <button
          className={'filter-pill' + (typeFilter === 'all' ? ' filter-pill--active' : '')}
          onClick={() => onTypeFilterChange('all')}
        >
          All types · {items.length}
        </button>
        {TYPES.map((t) => (
          <button
            key={t.id}
            className={'filter-pill filter-pill--' + t.id + (typeFilter === t.id ? ' filter-pill--active' : '')}
            onClick={() => onTypeFilterChange(t.id)}
          >
            {t.label} · {items.filter((i) => i.type === t.id).length}
          </button>
        ))}
      </div>

      <div className="filter-row-divider" aria-hidden="true" />

      <div className="filter-row">
        <span className="filter-row-label">Status</span>
        <button
          className={'filter-pill' + (statusFilter === 'all' ? ' filter-pill--active' : '')}
          onClick={() => onStatusFilterChange('all')}
        >
          All statuses
        </button>
        {STATUSES.map((s) => (
          <button
            key={s.id}
            className={'filter-pill filter-pill--status-' + s.id + (statusFilter === s.id ? ' filter-pill--active' : '')}
            onClick={() => onStatusFilterChange(s.id)}
          >
            {s.label} · {items.filter((i) => i.status === s.id).length}
          </button>
        ))}
        {genres.length > 0 && (
          <select
            className="genre-filter-select"
            value={genreFilter}
            onChange={(e) => onGenreFilterChange(e.target.value)}
          >
            <option value="all">All genres</option>
            {genres.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  )
}
