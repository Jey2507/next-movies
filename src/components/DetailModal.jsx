import { useEffect, useRef, useState } from 'react'
import './DetailModal.css'
import { diffNoteSegments, committedNoteSegments } from '../noteSegments'

const NOTES_SAVE_DELAY = 600

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

// Ordered by binary subdivision of the color wheel — 1st hue, then its
// exact opposite at +180°, then the two hues that bisect those halves (each
// again paired with its own opposite), and so on — so the most common case,
// two people, always lands on true complements (the strongest contrast the
// wheel has), and every extra person keeps splitting the widest remaining
// gap instead of crowding in next to a color already in use.
const HUE_STEPS = [0, 180, 90, 270, 45, 225, 135, 315]
// Colors already used elsewhere in the UI (gold accents, crimson danger) —
// a list's rotation gets nudged away from these so an author's color never
// lands on top of one.
const ACCENT_HUES = [40, 7]
const ACCENT_GAP = 25

function hueDistance(a, b) {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

function hashString(s) {
  let hash = 0
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

// Every list gets its own rotation of the same wheel — hashed from the
// list's own id, so colors look different from one shared list to the next
// (not every list is the same green-vs-violet pair) while staying identical
// for everyone looking at that list, and stable across reloads. The
// complementary-pairs structure above survives any rotation, since rotating
// the whole wheel doesn't change the angles between hues on it.
function paletteRotationFor(listKey) {
  let rotation = listKey ? hashString(String(listKey)) % 360 : 0
  for (let tries = 0; tries < 360; tries += 7) {
    const clash = HUE_STEPS.some((step) =>
      ACCENT_HUES.some((accent) => hueDistance((step + rotation) % 360, accent) < ACCENT_GAP)
    )
    if (!clash) return rotation
    rotation = (rotation + 7) % 360
  }
  return rotation
}

// Blues/violets read darker than yellows/greens at the same lightness —
// nudged per-hue so every color on the wheel reads similarly bright against
// the app's dark background, instead of some looking washed out and others
// dim, no matter where a list's rotation lands them.
function lightnessForHue(hue) {
  if (hue > 40 && hue < 100) return 52
  if (hue >= 200 && hue < 280) return 68
  return 60
}

function colorAt(index, rotation) {
  const hue = (HUE_STEPS[index % HUE_STEPS.length] + rotation) % 360
  return `hsl(${hue}, 65%, ${lightnessForHue(hue)}%)`
}

// Deterministic per-author color for shared notes: the same person's name
// (and the note text they last wrote) always render in the same color, so
// on a shared list it's easy to tell at a glance who left the current note.
// Picks by position in the list's member roster when available, so every
// *current* member gets a distinct, well-spaced color — falls back to
// hashing the name into the same wheel (still distinct-looking, just not
// guaranteed unique) for a name that isn't a current member, e.g. someone
// who has since left, or no roster is available.
function authorColor(name, memberNames, rotation) {
  if (!name) return null
  if (Array.isArray(memberNames)) {
    const idx = memberNames.indexOf(name)
    if (idx !== -1) return colorAt(idx, rotation)
  }
  return colorAt(hashString(name), rotation)
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

export default function DetailModal({ item, onClose, apiKey, imgBase, isPersonal, onSaveNotes, memberNames, viewerName, listId }) {
  const { details, loading, error } = useTmdbDetails(item, apiKey)
  const posterRef = useRef(null)
  const modalCardRef = useRef(null)
  // Backdrop layer behind the (visually transparent) notes textarea that
  // renders the actual, per-author colored text — see the notes panel JSX.
  const notesHighlightRef = useRef(null)
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

  if (!item) return null

  const isTv = item.type === 'series' || item.type === 'anime'
  const poster = item.poster || (details?.poster_path ? imgBase + details.poster_path : null)
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
