import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import './DetailModal.css'
import { diffNoteSegments, committedNoteSegments } from '../../noteSegments'
import { paletteRotationFor, authorColor } from '../../noteAuthorColors'
import { useTmdbDetails } from '../../useTmdbDetails'
import { STATUSES } from '../../constants'

const NOTES_SAVE_DELAY = 600

const TYPE_LABELS = {
  movie: 'Movie',
  series: 'Series',
  anime: 'Anime',
}

export default function DetailModal({ item, onClose, apiKey, imgBase, imgBaseBackdrop, isPersonal, onSaveNotes, onChangeStatus, onRate, onBackfillBackdrop, memberNames, viewerName, listId }) {
  const { details, loading, error } = useTmdbDetails(item, apiKey)
  const posterRef = useRef(null)
  const modalCardRef = useRef(null)
  // Backdrop layer behind the (visually transparent) notes textarea that
  // renders the actual, per-author colored text — see the notes panel JSX.
  const notesHighlightRef = useRef(null)
  // Which item id this modal has already tried to backfill a `backdrop` for
  // (see the effect below) — keeps a slow save from being retried on every
  // re-render while it's still in flight.
  const backfilledBackdropRef = useRef(null)
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

  // Trailer starts as a thumbnail (see modal-trailer-thumb below) and only
  // swaps in the actual YouTube iframe once clicked, so opening the modal
  // never embeds/loads a player nobody asked for. Reset the same
  // render-phase way as zoomPhase above, so switching items never leaves a
  // previous title's trailer playing behind the new poster/title.
  const [trailerOpen, setTrailerOpen] = useState(false)
  const [trailerForItem, setTrailerForItem] = useState(item?.id ?? null)
  if ((item?.id ?? null) !== trailerForItem) {
    setTrailerForItem(item?.id ?? null)
    setTrailerOpen(false)
  }

  // Local draft of the notes textarea, saved on a debounce (below) rather
  // than on every keystroke. Reset the same way zoomPhase is above: adjusted
  // during render when a different item opens, instead of in an effect, to
  // avoid an extra render showing the previous item's notes for a frame.
  const [notesDraft, setNotesDraft] = useState(item?.notes || '')
  // The committed note this client's current edit (if any) actually started
  // from — { notes, notes_segments, notes_rev }. Deliberately *not* kept in
  // step with item while there's an unflushed local edit (see the sync
  // effect below): once someone else's save lands mid-edit, item.notes
  // moves on, but this client's notesDraft is still built on the old text,
  // so this baseline has to stay put too — it's what lets the eventual
  // flush correctly separate "what I actually typed" from "what changed out
  // from under me" instead of one clobbering the other (see App.jsx's
  // updateNotes, which is where the actual merge happens). State, not a
  // ref, since it's read during render for the live color preview below.
  const [noteBase, setNoteBase] = useState({
    notes: item?.notes || '',
    notes_segments: item?.notes_segments,
    notes_updated_by_name: item?.notes_updated_by_name,
    notes_rev: item?.notes_rev || 0,
  })
  const [notesForItem, setNotesForItem] = useState(item?.id ?? null)
  // The notes panel itself: hidden behind a small toggle icon at the bottom
  // of the card, sliding down over the rest of the modal when opened (see
  // toggleNotesPanel/render below). Closed whenever a different item opens.
  const [notesOpen, setNotesOpen] = useState(false)
  const [notesPanelRect, setNotesPanelRect] = useState(null)
  if ((item?.id ?? null) !== notesForItem) {
    setNotesForItem(item?.id ?? null)
    setNotesDraft(item?.notes || '')
    setNotesOpen(false)
    setNoteBase({
      notes: item?.notes || '',
      notes_segments: item?.notes_segments,
      notes_updated_by_name: item?.notes_updated_by_name,
      notes_rev: item?.notes_rev || 0,
    })
  }
  const notesSaveTimer = useRef(null)
  // The one still-unsent edit, as { id, value } — the *id it was made for*,
  // not whatever `item.id` happens to be by the time it's flushed. Needed
  // because this component is always mounted (App.jsx renders it
  // unconditionally with item={activeItem}), so closing the modal is just
  // item -> null, not an unmount — an effect keyed on item?.id is what
  // notices that transition, and by then a render-phase reset (below) may
  // have already pointed notesForItem/notesDraft at the new item.
  const pendingNotesRef = useRef(null)
  // Short cooldown lock for the rating stars — see handleRate below.
  const ratingClickRef = useRef(false)
  // Card height from the *previous* commit, and whether the modal was
  // already open then — see the FLIP-style height transition below.
  const cardHeightRef = useRef(null)
  const wasOpenRef = useRef(false)

  function flushPendingNotes() {
    if (notesSaveTimer.current) {
      clearTimeout(notesSaveTimer.current)
      notesSaveTimer.current = null
    }
    const pending = pendingNotesRef.current
    if (!pending) return
    pendingNotesRef.current = null
    // Passes along the exact note this edit started from, not whatever the
    // item looks like *now* — see noteBase and App.jsx's updateNotes.
    if (onSaveNotes) onSaveNotes(pending.id, pending.value, pending.base)
  }

  function handleNotesChange(e) {
    const value = e.target.value
    const id = item.id
    setNotesDraft(value)
    // base always comes from noteBase, not the previous pendingNotesRef (if
    // any) — it only ever changes once this whole edit is done (see the
    // sync effect below), so every keystroke in one continuous editing
    // session keeps pointing at the same pre-edit baseline.
    pendingNotesRef.current = { id, value, base: noteBase }
    if (notesSaveTimer.current) clearTimeout(notesSaveTimer.current)
    notesSaveTimer.current = setTimeout(flushPendingNotes, NOTES_SAVE_DELAY)
  }

  // Keeps the colored backdrop layer scrolled in step with the (invisible)
  // textarea text on top of it — see the notes panel JSX.
  function handleNotesScroll(e) {
    if (notesHighlightRef.current) {
      notesHighlightRef.current.scrollTop = e.target.scrollTop
      notesHighlightRef.current.scrollLeft = e.target.scrollLeft
    }
  }

  // Pick up notes changes that arrive from elsewhere (another shared-list
  // member editing the same item, via the live-sync in App.jsx) while it's
  // open — but only while there's no unsent local edit. Splicing a remote
  // change straight into the textarea *while* someone's still actively
  // typing into it turns out to be exactly the kind of thing it sounds
  // like: fighting a focused, controlled input for its own value mid-
  // keystroke is unreliable, and (worse) once App.jsx's items state has
  // already moved on to the remote text, computing "what did I actually
  // type" against it here would itself be wrong — see noteBase.
  //
  // So: leave a local edit-in-progress and its baseline completely alone.
  // The merge happens once, safely, at flush time — see App.jsx's
  // updateNotes, which is handed noteBase's frozen snapshot precisely so it
  // can tell "what I typed" apart from "what changed underneath me" even
  // though item (and this component) never saw the remote edit while it
  // was still being typed.
  useEffect(() => {
    if (pendingNotesRef.current) return
    setNotesDraft(item?.notes || '')
    setNoteBase({
      notes: item?.notes || '',
      notes_segments: item?.notes_segments,
      notes_updated_by_name: item?.notes_updated_by_name,
      notes_rev: item?.notes_rev || 0,
    })
  }, [item?.notes, item?.notes_segments, item?.notes_updated_by_name, item?.notes_rev, item?.id])

  // Flush a pending debounced edit as soon as the item it belongs to is no
  // longer the open one — covers both switching items and closing the
  // modal (item -> null), plus an actual unmount for good measure.
  useEffect(() => {
    return () => {
      flushPendingNotes()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id])

  // Opportunistically backfills `backdrop` on items added before that field
  // existed (or where TMDB had no backdrop at add-time), using the same
  // title/year match useTmdbDetails already fetched above for the
  // overview/trailer — so an old ticket card picks up its landscape
  // background the first time it's opened, without a bulk migration. Never
  // overwrites an existing backdrop.
  useEffect(() => {
    const itemId = item?.id
    const backdropPath = details?.backdrop_path
    if (!onBackfillBackdrop || !itemId || item.backdrop || !backdropPath) return
    if (backfilledBackdropRef.current === itemId) return
    backfilledBackdropRef.current = itemId
    onBackfillBackdrop(itemId, imgBaseBackdrop + backdropPath)
  }, [item, details, imgBaseBackdrop, onBackfillBackdrop])

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

  // Sizes the panel off the card's own on-screen rect (position: fixed, same
  // reasoning as the poster zoom above) rather than a plain in-flow reveal,
  // so "the full height of the modal" means the actual visible card height
  // right now, not however tall its scrollable content happens to be.
  function toggleNotesPanel() {
    if (!notesOpen) {
      const el = modalCardRef.current
      if (el) {
        const rect = el.getBoundingClientRect()
        setNotesPanelRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height })
      }
    }
    setNotesOpen((open) => !open)
  }

  // Blocks page scroll behind the modal for as long as it's open (any
  // device, not just mobile) — otherwise a touch/wheel drag that misses the
  // card (or the card's own scroll reaching its end) falls through to the
  // page underneath.
  const isOpen = Boolean(item)
  useEffect(() => {
    if (!isOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isOpen])

  useEffect(() => {
    if (!item) return
    function onKeyDown(e) {
      if (e.key !== 'Escape') return
      if (zoomPhase === 'open') {
        setZoomPhase('closing')
        return
      }
      if (notesOpen) {
        setNotesOpen(false)
        return
      }
      if (zoomPhase === 'idle') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [item, onClose, zoomPhase, notesOpen])

  // Smooths over *any* height change of the card itself — the skeleton's
  // guessed height never exactly matches the real overview/facts once they
  // arrive (a short overview vs. a long one, a movie vs. a show with more
  // fact boxes, ...), and no amount of tuning the skeleton's size closes
  // that gap for every title. Rather than chase each individual cause, this
  // just animates *whatever* the delta turns out to be, same FLIP technique
  // already used for the ticket-grid reorder in App.jsx: pin the card at
  // its previous (already-painted) height with no transition, force a
  // reflow so that's the frame that actually paints, then transition to the
  // new height. Runs after every commit (no dependency array) so it also
  // covers switching between items, not just the loading -> loaded swap.
  useLayoutEffect(() => {
    const el = modalCardRef.current
    if (!el) {
      // Modal just closed (or hasn't opened yet) — the next open creates a
      // brand-new card element with its own entrance animation, not a
      // resize of an element that's been on screen, so it shouldn't get
      // this treatment. See the wasOpenRef check below.
      wasOpenRef.current = false
      return
    }
    const prevHeight = cardHeightRef.current
    const newHeight = el.getBoundingClientRect().height
    if (wasOpenRef.current && prevHeight != null && Math.abs(newHeight - prevHeight) > 1) {
      el.style.transition = 'none'
      el.style.overflow = 'hidden'
      el.style.height = prevHeight + 'px'
      el.getBoundingClientRect() // force reflow before animating away from this
      requestAnimationFrame(() => {
        el.style.transition = 'height 260ms cubic-bezier(0.22, 1, 0.36, 1)'
        el.style.height = newHeight + 'px'
      })
      const onDone = (e) => {
        if (e.target !== el || e.propertyName !== 'height') return
        // Back to the stylesheet's own height/overflow-y: auto — a fixed
        // inline height would otherwise also cap any *future* growth (e.g.
        // typing a long note) at today's content height.
        el.style.transition = ''
        el.style.height = ''
        el.style.overflow = ''
        el.removeEventListener('transitionend', onDone)
      }
      el.addEventListener('transitionend', onDone)
    }
    cardHeightRef.current = newHeight
    wasOpenRef.current = true
  })

  if (!item) return null

  const isTv = item.type === 'series' || item.type === 'anime'
  const poster = item.poster || (details?.poster_path ? imgBase + details.poster_path : null)
  // Prefer an official Trailer, then a Teaser, then just whatever YouTube
  // clip TMDB has — some titles (esp. anime) only ever get a teaser listed.
  const videos = details?.videos?.results || []
  const trailer =
    videos.find((v) => v.site === 'YouTube' && v.type === 'Trailer') ||
    videos.find((v) => v.site === 'YouTube' && v.type === 'Teaser') ||
    videos.find((v) => v.site === 'YouTube')
  const paletteRotation = paletteRotationFor(listId)
  const noteAuthorColor = !isPersonal ? authorColor(item.notes_updated_by_name, memberNames, paletteRotation) : null
  // Re-diffed on every render against this edit's own frozen baseline (see
  // noteBase — *not* item, which may have already moved on to someone
  // else's save while this one is still being typed), so the still-unsaved
  // text in notesDraft is already colored by who's typing it, without
  // flickering if a remote change lands mid-edit.
  const noteSegments = !isPersonal
    ? diffNoteSegments(committedNoteSegments(noteBase), notesDraft, viewerName || null)
    : null

  // Ratings: { authorName: 1-5, ... } — see schema.sql's `ratings` column.
  // Keyed the same way rateItem in App.jsx writes it, so `myRating` below
  // always finds this viewer's own entry.
  const myName = viewerName || 'You'
  const ratings = item.ratings || {}
  const ratingEntries = Object.entries(ratings).filter(([, v]) => typeof v === 'number' && v > 0)
  const ratingCount = ratingEntries.length
  const ratingAverage = ratingCount
    ? ratingEntries.reduce((sum, [, v]) => sum + v, 0) / ratingCount
    : null
  const myRating = ratings[myName] || 0
  // Falls back to just whoever's actually rated if memberNames isn't
  // populated for some reason — still correct, just loses the "stable
  // regardless of who's rated" guarantee that having the full roster gives.
  const ratingMemberNames = memberNames?.length ? memberNames : ratingEntries.map(([name]) => name)

  function handleRate(value) {
    if (!onRate) return
    // Guards against a double-fired click (e.g. an accidental double click,
    // or a stray duplicate event) landing as two calls in quick succession —
    // without this, the second call would see the same pre-click myRating
    // as the first (this render hasn't updated yet) and immediately toggle
    // the star straight back off, which reads as the rating flickering.
    if (ratingClickRef.current) return
    ratingClickRef.current = true
    setTimeout(() => { ratingClickRef.current = false }, 400)
    // Clicking the star that's already your rating clears it instead of
    // re-setting the same value — the toggle-off is the only way to unrate.
    onRate(item.id, myRating === value ? null : value)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={modalCardRef}
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
            <select
              className={'modal-status-select modal-status-select--' + item.status}
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

        {!loading && error && <p className="modal-note modal-note--error">{error}</p>}

        {/* While the TMDB fetch is in flight, reserve roughly the same
            footprint the real overview/facts are about to take instead of
            just an inline "Loading…" line — everything below (ratings, the
            notes toggle) would otherwise jump down all at once the moment
            the fetch resolves, landing wherever the pointer happens to be
            mid-click. The fact-box count is picked from `isTv`, which is
            already known from `item.type` — no need to wait on the fetch
            for that part. */}
        {loading ? (
          <>
            <div className="modal-overview-skeleton" aria-hidden="true">
              <span className="modal-skeleton-bar" />
              <span className="modal-skeleton-bar" />
              <span className="modal-skeleton-bar" />
              <span className="modal-skeleton-bar modal-skeleton-bar--short" />
            </div>
            <div className="modal-facts">
              {(isTv ? [0, 1, 2] : [0, 1]).map((i) => (
                <div className="modal-fact" key={i} aria-hidden="true">
                  <span className="modal-skeleton-bar modal-skeleton-bar--label" />
                  <span className="modal-skeleton-bar modal-skeleton-bar--value" />
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
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
          </>
        )}

        {!loading && trailer && (
          <div className="modal-trailer">
            {trailerOpen ? (
              <div className="modal-trailer-frame">
                <iframe
                  src={`https://www.youtube.com/embed/${trailer.key}?autoplay=1&rel=0`}
                  title={trailer.name || 'Trailer'}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : (
              <button
                type="button"
                className="modal-trailer-thumb"
                onClick={(e) => {
                  e.stopPropagation()
                  setTrailerOpen(true)
                }}
                aria-label="Play trailer"
              >
                <img
                  className="modal-trailer-thumb-img"
                  src={`https://img.youtube.com/vi/${trailer.key}/hqdefault.jpg`}
                  alt=""
                  loading="lazy"
                />
                <span className="modal-trailer-play">▶</span>
              </button>
            )}
          </div>
        )}

        <div className="modal-ratings">
          <div className="modal-ratings-header">
            <span className="modal-ratings-label">Your rating</span>
            {/* Always mounted, same reasoning as modal-ratings-list below —
                this used to only render once ratingAverage existed, so the
                very first click on a never-rated item (0 -> 1 ratings) made
                it pop into the row from nothing. A placeholder keeps the
                header's height identical before and after that click. */}
            <span className="modal-ratings-average">
              {ratingAverage != null ? (
                <>
                  ★ {ratingAverage.toFixed(1)}
                  <span className="modal-ratings-count">
                    {' '}· {ratingCount} {ratingCount === 1 ? 'rating' : 'ratings'}
                  </span>
                </>
              ) : (
                <span className="modal-ratings-count">No ratings yet</span>
              )}
            </span>
          </div>
          <div className="modal-rating-stars" role="radiogroup" aria-label="Your rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                className={'modal-rating-star' + (n <= myRating ? ' modal-rating-star--filled' : '')}
                onClick={() => handleRate(n)}
                aria-label={`Rate ${n} star${n > 1 ? 's' : ''}`}
                aria-pressed={n === myRating}
              >
                ★
              </button>
            ))}
          </div>
          {/* Always mounted (one entry per list member, not just per rater)
              so this box's height depends only on the list's membership —
              stable across a session — never on whether *this* click just
              added or removed a rating. Listing everyone instead of just
              who's rated is what makes that possible: an unrated member
              still gets a (hollow) row instead of the row disappearing. */}
          {!isPersonal && ratingMemberNames.length > 0 && (
            <div className="modal-ratings-list">
              {ratingMemberNames.map((name) => {
                const value = ratings[name] || 0
                return (
                  <span
                    key={name}
                    className={'modal-ratings-member' + (value ? '' : ' modal-ratings-member--empty')}
                    style={value ? { color: authorColor(name, memberNames, paletteRotation) } : undefined}
                  >
                    {name}{' '}
                    <span className="modal-ratings-member-stars">
                      {'★'.repeat(value)}{'☆'.repeat(5 - value)}
                    </span>
                  </span>
                )
              })}
            </div>
          )}
        </div>

        <div
          className={'modal-notes-panel' + (notesOpen ? ' modal-notes-panel--open' : '')}
          style={
            notesPanelRect
              ? {
                  // Covers the card's full on-screen rect (not just most of
                  // it) — see toggleNotesPanel for why this is measured off
                  // the live DOM rect rather than expressed as e.g. 100%.
                  top: notesPanelRect.top + 'px',
                  left: notesPanelRect.left + 'px',
                  width: notesPanelRect.width + 'px',
                  height: notesPanelRect.height + 'px',
                }
              : undefined
          }
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-notes-panel-header">
            <span className="modal-notes-label">{isPersonal ? 'Notes' : 'Shared notes'}</span>
            <button
              type="button"
              className="modal-notes-panel-close"
              onClick={() => setNotesOpen(false)}
              aria-label="Close notes"
            >
              ×
            </button>
          </div>
          {!isPersonal && (item.notes_updated_by_name || memberNames?.length > 0) && (
            <div className="modal-notes-meta-row">
              {item.notes_updated_by_name && (
                <p className="modal-notes-meta">
                  Last edited by{' '}
                  <span className="modal-notes-author" style={noteAuthorColor ? { color: noteAuthorColor } : undefined}>
                    {item.notes_updated_by_name}
                  </span>
                  {item.notes_updated_at ? ` · ${new Date(item.notes_updated_at).toLocaleString()}` : ''}
                </p>
              )}
              {memberNames?.length > 0 && (
                <div className="modal-notes-legend">
                  {memberNames.map((name) => (
                    <span key={name} className="modal-notes-legend-item" style={{ color: authorColor(name, memberNames, paletteRotation) }}>
                      {name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          {isPersonal ? (
            <textarea
              className="modal-notes-input"
              placeholder="Add a note for yourself…"
              value={notesDraft}
              onChange={handleNotesChange}
              onBlur={flushPendingNotes}
            />
          ) : (
            // A native textarea can't render multiple text colors, so the
            // real, per-author colored text is drawn in a same-size div
            // behind it (see .modal-notes-input-wrap) while the textarea on
            // top goes fully transparent except for its caret/selection —
            // it still handles all typing, IME, and selection normally.
            <div className="modal-notes-input-wrap">
              <div ref={notesHighlightRef} className="modal-notes-input modal-notes-highlight" aria-hidden="true">
                {noteSegments.length > 0
                  ? noteSegments.map((seg, i) => (
                      <span key={i} style={{ color: authorColor(seg.author, memberNames, paletteRotation) || 'inherit' }}>
                        {seg.text}
                      </span>
                    ))
                  : null}
                {/* Keeps a trailing newline from collapsing so the backdrop's height still matches the textarea. */}
                {notesDraft.endsWith('\n') ? '​' : null}
              </div>
              <textarea
                className="modal-notes-input modal-notes-input--overlay"
                placeholder="Add a note or comment for the list…"
                value={notesDraft}
                onChange={handleNotesChange}
                onBlur={flushPendingNotes}
                onScroll={handleNotesScroll}
              />
            </div>
          )}
        </div>

        <button
          type="button"
          className={
            'modal-notes-toggle' +
            (notesOpen ? ' modal-notes-toggle--open' : '') +
            (!notesOpen && item.notes?.trim() ? ' modal-notes-toggle--filled' : '')
          }
          onClick={(e) => {
            e.stopPropagation()
            toggleNotesPanel()
          }}
          aria-label={notesOpen ? 'Close notes' : (isPersonal ? 'Open notes' : 'Open shared notes')}
        >
          <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
            <path
              d="M2.5 3.5h11a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H6.7l-2.9 2.3a.4.4 0 0 1-.65-.31V11.5h-.65a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  )
}
