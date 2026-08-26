import './TicketCard.css'
import { TYPES, STATUSES } from '../../constants'

function initials(type) {
  if (type === 'movie') return 'MOV'
  if (type === 'series') return 'SER'
  return 'ANI'
}

// Average of item.ratings — see schema.sql's `ratings` column (one entry
// per rater, {authorName: 1-5, ...}). Null when nobody's rated it yet, so
// the card's meta row can just skip the badge.
function averageRating(ratings) {
  if (!ratings) return null
  const values = Object.values(ratings).filter((v) => typeof v === 'number' && v > 0)
  if (!values.length) return null
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

// One cinema-ticket card in the grid. `ticketRefs` is App.jsx's
// `useRef(new Map())` — registering/unregistering this card's DOM node into
// it is what drives the FLIP reorder animation there (see the
// useLayoutEffect keyed on `orderKey`).
export default function TicketCard({ item, ticketRefs, isFirst, isLast, onOpen, onMoveUp, onMoveDown, onRemove, onChangeStatus }) {
  const avgRating = averageRating(item.ratings)
  return (
    <article
      className={'ticket ticket--' + item.type}
      ref={(el) => {
        if (el) ticketRefs.current.set(item.id, el)
        else ticketRefs.current.delete(item.id)
      }}
      onClick={() => onOpen(item.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(item.id)
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
                onClick={(e) => { e.stopPropagation(); onMoveUp(item.id) }}
                disabled={isFirst}
                aria-label={`Move ${item.title} up`}
              >
                <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
                  <path d="M2 7.5L6 3.5L10 7.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                className="ticket-order-btn ticket-order-btn--down"
                onClick={(e) => { e.stopPropagation(); onMoveDown(item.id) }}
                disabled={isLast}
                aria-label={`Move ${item.title} down`}
              >
                <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
                  <path d="M2 4.5L6 8.5L10 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
            <button
              className="ticket-remove"
              onClick={(e) => { e.stopPropagation(); onRemove(item) }}
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
            {avgRating != null && (item.year || item.genre) && <span className="ticket-meta-dot">•</span>}
            {avgRating != null && <span className="ticket-meta-rating">★ {avgRating.toFixed(1)}</span>}
          </div>
          <select
            className={'status-select status-select--' + item.status}
            value={item.status}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onChangeStatus(item.id, e.target.value)}
          >
            {STATUSES.map((s) => (
              <option key={s.id} value={s.id} style={{ color: s.color }}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>
    </article>
  )
}
