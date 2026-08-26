import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import './App.css'
import { supabase, isSupabaseConfigured } from './supabaseClient'
import { useAuth } from './useAuth'
import { useLists } from './useLists'
import DetailModal from './components/DetailModal/DetailModal'
import ConfirmDeleteModal from './components/ConfirmDeleteModal/ConfirmDeleteModal'
import ConfirmModal from './components/ConfirmModal/ConfirmModal'
import AuthScreen from './components/AuthScreen/AuthScreen'
import ListSwitcher from './components/ListSwitcher/ListSwitcher'
import SearchBox from './components/SearchBox/SearchBox'
import AddItemForm from './components/AddItemForm/AddItemForm'
import FilterBar from './components/FilterBar/FilterBar'
import TicketCard from './components/TicketCard/TicketCard'
import { diffNoteSegments, committedNoteSegments, rebaseText } from './noteSegments'
import { TMDB_API_KEY, TMDB_IMG, TMDB_IMG_BACKDROP } from './constants'
import { normalizePositions, loadLocal, saveLocal } from './itemsStorage'
import { guessType, firstGenre } from './tmdbResults'

export default function App() {
  const { user, authLoading, signUp, signIn, signOut } = useAuth()
  const {
    lists,
    listsError,
    activeListId,
    activeList,
    setActiveListId,
    createSharedList,
    createError,
    joinList,
    joinError,
    leaveList,
    leaveError,
  } = useLists(user)
  const [pendingSignOut, setPendingSignOut] = useState(false)
  const [pendingLeaveList, setPendingLeaveList] = useState(null)
  // display_name is captured at signup into user_metadata (see AuthScreen
  // + useAuth's signUp) and Supabase mirrors it onto the session's user
  // object, so no extra query is needed just to label the account bar.
  const displayName = user?.user_metadata?.display_name || user?.email?.split('@')[0] || ''

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
  // Stores just the id, not the item itself, so the modal always shows the
  // live item from `items` below — including notes edits that arrive via
  // realtime from another member of a shared list while it's open.
  const [activeItemId, setActiveItemId] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)

  // Load from Supabase on mount, scoped to the active list (falls back to
  // localStorage — a single unscoped list — if Supabase isn't configured)
  useEffect(() => {
    if (!isSupabaseConfigured) return
    if (!activeListId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setItems([])
      setLoading(false)
      return
    }
    let cancelled = false
    async function load() {
      const { data, error } = await supabase
        .from('items')
        .select('*')
        .eq('list_id', activeListId)
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
  }, [activeListId])

  // Live sync: mirror INSERT/UPDATE/DELETE on `items` for the active list as
  // they happen, so a shared list updates on every member's screen without a
  // reload. Requires the `items` table to be added to Supabase's
  // `supabase_realtime` publication (see schema.sql). Own writes round-trip
  // through this too (Realtime doesn't distinguish the sender) — merged by
  // id instead of blindly appended, so they land as a harmless no-op update.
  useEffect(() => {
    if (!isSupabaseConfigured || !activeListId) return
    const channel = supabase
      .channel(`items-list-${activeListId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'items', filter: `list_id=eq.${activeListId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            setItems((prev) => prev.filter((i) => i.id !== payload.old.id))
            return
          }
          setItems((prev) => {
            const exists = prev.some((i) => i.id === payload.new.id)
            if (exists) {
              return prev.map((i) => {
                if (i.id !== payload.new.id) return i
                // Skip replacing when the incoming row is identical to what's
                // already shown — most commonly this client's own write (a
                // rating, a status change, ...) round-tripping back through
                // realtime a moment after the optimistic update already
                // applied it. Without this, that harmless echo still swaps
                // in a fresh object reference for no actual change, which
                // shows up as a visible flicker in anything that reflows
                // when its props change (e.g. DetailModal's ratings block).
                return JSON.stringify(i) === JSON.stringify(payload.new) ? i : payload.new
              })
            }
            return [...prev, payload.new]
          })
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [activeListId])

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
    const position = items.length ? Math.min(...items.map((i) => i.position || 0)) - 1 : 1
    const withPosition = { ...entry, position }
    if (isSupabaseConfigured) {
      if (!activeListId) return
      const { data, error } = await supabase
        .from('items')
        .insert({ ...withPosition, list_id: activeListId })
        .select()
        .single()
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
      backdrop: result.backdrop_path ? TMDB_IMG_BACKDROP + result.backdrop_path : null,
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
      backdrop: null,
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

  // Backfills `backdrop` on an item that doesn't have one yet — see
  // DetailModal's backfill effect, which is the only caller. Silent no-op
  // (not surfaced to the user) if the write fails; worst case it just
  // retries the next time this item's modal is opened.
  async function saveBackdrop(id, backdrop) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, backdrop } : i)))
    if (isSupabaseConfigured) await supabase.from('items').update({ backdrop }).eq('id', id)
  }

  // notes_updated_by_name/_at record who last wrote the shared note and
  // when, so DetailModal can show "Last edited by ..." on shared lists (see
  // schema.sql). Stamped on every save, including on a personal list, even
  // though it's not shown there — harmless, and one code path either way.
  // notes_segments re-attributes just the part of the text that actually
  // changed to this save's author, instead of recoloring the whole note —
  // see noteSegments.js.
  //
  // `base` is the note DetailModal's edit actually started from — passed in
  // explicitly rather than read from `items` here, because `items` can
  // already have moved on to someone else's save (via the live-sync
  // subscription) *while this client was still typing its own edit*, with
  // no way for this function to tell that apart from "nothing changed
  // since I last saved". Trusting `items` in that case would make the
  // notes_rev check below pass against the *new* row while `notes` was
  // never actually built from it, silently discarding the other save
  // instead of merging with it.
  //
  // On a shared list, two people can each flush an edit close enough
  // together that neither has heard about the other's save via realtime
  // yet. As a last resort against that race actually landing at the
  // database, the write itself is conditional on notes_rev (see
  // schema.sql): if Postgres reports no row matched, someone else's save
  // already won, so this re-reads the actual current row, folds this
  // save's own edit onto *that* instead of clobbering it, and retries —
  // bounded, since each retry only continues if it lost to yet another
  // save in between.
  async function updateNotes(id, notes, base) {
    if (!isSupabaseConfigured) {
      const prevItem = base || items.find((i) => i.id === id)
      const notes_segments = diffNoteSegments(committedNoteSegments(prevItem), notes, displayName || null)
      const stamp = { notes, notes_segments, notes_updated_by_name: displayName || null, notes_updated_at: new Date().toISOString() }
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...stamp } : i)))
      return
    }

    base = base || items.find((i) => i.id === id)
    let pendingNotes = notes
    const maxAttempts = 5
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const notes_segments = diffNoteSegments(committedNoteSegments(base), pendingNotes, displayName || null)
      const stamp = {
        notes: pendingNotes,
        notes_segments,
        notes_rev: (base?.notes_rev || 0) + 1,
        notes_updated_by_name: displayName || null,
        notes_updated_at: new Date().toISOString(),
      }

      const { data, error } = await supabase
        .from('items')
        .update(stamp)
        .eq('id', id)
        .eq('notes_rev', base?.notes_rev || 0)
        .select()
      if (error) {
        console.error('updateNotes failed', error)
        return
      }
      if (data && data.length > 0) {
        setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...stamp } : i)))
        return
      }

      // notes_rev didn't match: someone else's save landed first. Re-read
      // the row they actually wrote and fold this edit onto it, then retry.
      const { data: latestRows, error: refetchError } = await supabase.from('items').select('*').eq('id', id)
      if (refetchError || !latestRows?.length) return // deleted or unreadable — nothing to save onto
      const latest = latestRows[0]
      pendingNotes = rebaseText(base?.notes || '', pendingNotes, latest.notes || '')
      base = latest
    }
  }

  // Star ratings on an item: { authorName: 1-5, ... }, one entry per rater —
  // see schema.sql's `ratings` column + rate_item RPC. Keyed by display name
  // for the same reason notes_updated_by_name is (see updateNotes above):
  // items arrive over realtime as raw column values with no joins, so a
  // joined name would never reach other members live. On Supabase the
  // actual merge happens server-side in rate_item (a plain jsonb `||`,
  // atomic inside one UPDATE, so two people rating at once can never
  // clobber each other) — this just optimistically mirrors the same merge
  // into local state so the UI updates instantly instead of waiting on the
  // realtime round-trip. `value` of null clears this viewer's own rating.
  async function rateItem(id, value) {
    const name = displayName || 'You'
    setItems((prev) =>
      prev.map((i) => {
        if (i.id !== id) return i
        const ratings = { ...(i.ratings || {}) }
        if (value == null) delete ratings[name]
        else ratings[name] = value
        return { ...i, ratings }
      })
    )
    if (!isSupabaseConfigured) return
    const { error } = await supabase.rpc('rate_item', { p_item_id: id, p_rating: value })
    if (error) console.error('rateItem failed', error)
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

  const activeItem = items.find((i) => i.id === activeItemId) || null

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

  if (isSupabaseConfigured && authLoading) {
    return (
      <div className="queue-app">
        <div className="empty-state">
          <span className="spinner" aria-hidden="true" />
          <p className="empty-title">Loading…</p>
        </div>
      </div>
    )
  }

  if (isSupabaseConfigured && !user) {
    return <AuthScreen onSignUp={signUp} onSignIn={signIn} />
  }

  return (
    <div className="queue-app">
      <header className="queue-header">
        <div className="queue-header-row">
          <div className="queue-header-titles">
            <span className="queue-eyebrow">Now booking</span>
            <h1 className="queue-title">Up next</h1>
            <p className="queue-sub">Your queue of titles waiting for a premiere night.</p>
          </div>
          {isSupabaseConfigured && user && (
            <div className="account-bar">
              <span className="account-name">{displayName}</span>
              <button type="button" className="account-signout" onClick={() => setPendingSignOut(true)}>
                Sign out
              </button>
            </div>
          )}
        </div>
        {isSupabaseConfigured && (
          <ListSwitcher
            lists={lists}
            listsError={listsError}
            activeListId={activeListId}
            activeList={activeList}
            onSwitch={setActiveListId}
            onCreateShared={createSharedList}
            createError={createError}
            onJoin={joinList}
            joinError={joinError}
            onRequestLeave={setPendingLeaveList}
            leaveError={leaveError}
          />
        )}
      </header>

      {!isSupabaseConfigured && (
        <div className="config-note">
          Saving to this browser only. Configure supabaseClient.js to sync across devices.
        </div>
      )}

      <SearchBox
        boxRef={boxRef}
        query={query}
        onQueryChange={(value) => {
          setQuery(value)
          setShowResults(true)
        }}
        showResults={showResults}
        onFocus={() => setShowResults(true)}
        searching={searching}
        searchError={searchError}
        results={results}
        onSelect={addFromSearch}
      />

      <AddItemForm
        title={title}
        onTitleChange={setTitle}
        type={type}
        onTypeChange={setType}
        year={year}
        onYearChange={setYear}
        genre={genre}
        onGenreChange={setGenre}
        onSubmit={addManual}
      />

      <FilterBar
        items={items}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        genreFilter={genreFilter}
        onGenreFilterChange={setGenreFilter}
        genres={genres}
      />

      {loading ? (
        <div className="empty-state">
          <span className="spinner" aria-hidden="true" />
          <p className="empty-title">Loading…</p>
        </div>
      ) : isSupabaseConfigured && !activeListId ? (
        <div className="empty-state">
          <p className="empty-title">No list yet</p>
          <p className="empty-sub">Create or join a list above to start your queue.</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="empty-state">
          <p className="empty-title">Nothing here</p>
          <p className="empty-sub">Search above or add a title manually.</p>
        </div>
      ) : (
        <div className="ticket-grid">
          {visible.map((item, index) => (
            <TicketCard
              key={item.id}
              item={item}
              ticketRefs={ticketRefs}
              isFirst={index === 0}
              isLast={index === visible.length - 1}
              onOpen={setActiveItemId}
              onMoveUp={(id) => moveItem(id, 'up')}
              onMoveDown={(id) => moveItem(id, 'down')}
              onRemove={setPendingDelete}
              onRate={rateItem}
              viewerName={displayName}
            />
          ))}
        </div>
      )}

      <DetailModal
        item={activeItem}
        onClose={() => setActiveItemId(null)}
        apiKey={TMDB_API_KEY}
        imgBase={TMDB_IMG}
        imgBaseBackdrop={TMDB_IMG_BACKDROP}
        isPersonal={!isSupabaseConfigured || !!activeList?.is_personal}
        onSaveNotes={updateNotes}
        onChangeStatus={changeStatus}
        onRate={rateItem}
        onBackfillBackdrop={saveBackdrop}
        memberNames={activeList?.memberNames}
        viewerName={displayName}
        listId={activeListId}
      />

      <ConfirmDeleteModal
        item={pendingDelete}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          removeItem(pendingDelete.id)
          setPendingDelete(null)
        }}
      />

      <ConfirmModal
        open={pendingSignOut}
        title="Sign out?"
        body="You'll need to sign back in to see your lists again."
        confirmLabel="Sign out"
        tone="neutral"
        onCancel={() => setPendingSignOut(false)}
        onConfirm={() => {
          setPendingSignOut(false)
          signOut()
        }}
      />

      <ConfirmModal
        open={!!pendingLeaveList}
        title="Leave this list?"
        body={
          pendingLeaveList && pendingLeaveList.memberNames.length <= 1
            ? `You're the only one left in "${pendingLeaveList.label}" — leaving deletes it and everything in it, permanently.`
            : `You'll lose access to "${pendingLeaveList?.label}" and won't see its titles anymore. The other members keep it.`
        }
        confirmLabel="Leave list"
        tone="danger"
        onCancel={() => setPendingLeaveList(null)}
        onConfirm={() => {
          leaveList(pendingLeaveList.id)
          setPendingLeaveList(null)
        }}
      />
    </div>
  )
}