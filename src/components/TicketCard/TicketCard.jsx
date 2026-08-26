import { useRef } from 'react'
import './TicketCard.css'
import { TYPES, STATUSES } from '../../constants'

function initials(type) {
  if (type === 'movie') return 'MOV'
  if (type === 'series') return 'SER'
  return 'ANI'
}

// One cinema-ticket card in the grid. `ticketRefs` is App.jsx's
// `useRef(new Map())` — registering/unregistering this card's DOM node into
// it is what drives the FLIP reorder animation there (see the
// useLayoutEffect keyed on `orderKey`).
export default function TicketCard({ item, ticketRefs, isFirst, isLast, onOpen, onMoveUp, onMoveDown, onRemove, onRate, viewerName }) {
  // Same-key convention as rateItem in App.jsx / DetailModal's myRating.
  const myName = viewerName || 'You'
  const myRating = item.ratings?.[myName] || 0
  // Guards against a double-fired click landing as two calls in quick
  // succession — see the identical guard in DetailModal's handleRate.
  const ratingClickRef = useRef(false)

  function handleRate(value) {
    if (!onRate) return
    if (ratingClickRef.current) return
    ratingClickRef.current = true
    setTimeout(() => { ratingClickRef.current = false }, 400)
    onRate(item.id, myRating === value ? null : value)
  }

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
        {(item.backdrop || item.poster) && (
          <>
            {/* Prefer the landscape backdrop over the vertical poster so this
                background isn't a portrait image stretched/cropped to fill a
                wide card — older items added before `backdrop` existed fall
                back to the poster. */}
            <img className="ticket-bg-poster" src={item.backdrop || item.poster} alt="" aria-hidden="true" />
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
          </div>
          <div className="ticket-actions">
            <span className={'ticket-status ticket-status--' + item.status}>
              <span className="ticket-status-dot" aria-hidden="true" />
              {STATUSES.find((s) => s.id === item.status)?.label || item.status}
            </span>
            <div className="ticket-my-rating" role="radiogroup" aria-label={`Your rating for ${item.title}`}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={'ticket-my-rating-star' + (n <= myRating ? ' ticket-my-rating-star--filled' : '')}
                  onClick={(e) => { e.stopPropagation(); handleRate(n) }}
                  aria-pressed={n === myRating}
                  aria-label={`Rate ${n} star${n > 1 ? 's' : ''}`}
                >
                  ★
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </article>
  )
}
