import { useState } from 'react'
import './ListSwitcher.css'

// Shared (non-personal) lists all used to render the same 🎟️ ticket emoji,
// which happens to render red/pink in most emoji fonts — so every shared
// list looked identical regardless of who's in it. Instead, each shared
// list gets a color deterministically picked from this palette by hashing
// its id, so two people's "Oleg & Sasha" and "Legacy Queue" tabs are
// visually distinct (and stay the same color across reloads, since the
// hash only depends on the list's own id).
const SHARED_TAB_PALETTE = [
  ['gold', 'gold-dim'],
  ['crimson', 'crimson-dim'],
  ['purple', 'purple-dim'],
  ['blue', 'blue-dim'],
  ['pink', 'pink-dim'],
  ['orange', 'orange-dim'],
]

function sharedTabColor(listId) {
  let hash = 0
  for (let i = 0; i < listId.length; i++) {
    hash = (hash * 31 + listId.charCodeAt(i)) >>> 0
  }
  const [color, dim] = SHARED_TAB_PALETTE[hash % SHARED_TAB_PALETTE.length]
  return { '--tab-color': `var(--${color})`, '--tab-dim': `var(--${dim})` }
}

// Header widget for managing lists — deliberately styled as its own card
// (not pill filters) so it doesn't blend into the type/status filter rows
// further down the page. The personal tab can never gain an invite code;
// "Invite a friend" on it spins up a brand-new shared list instead of
// exposing the personal one (see useLists.js).
export default function ListSwitcher({
  lists,
  listsError,
  activeListId,
  activeList,
  onSwitch,
  onCreateShared,
  createError,
  onJoin,
  joinError,
  onRequestLeave,
  leaveError,
}) {
  const [code, setCode] = useState('')
  const [copied, setCopied] = useState(false)
  const [creating, setCreating] = useState(false)

  function submitJoin(e) {
    e.preventDefault()
    if (!code.trim()) return
    onJoin(code)
    setCode('')
  }

  async function copyCode() {
    if (!activeList?.invite_code) return
    try {
      await navigator.clipboard.writeText(activeList.invite_code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    // eslint-disable-next-line no-unused-vars
    } catch (e) {
      // clipboard unavailable — the code is still visible to copy by hand
    }
  }

  async function startSharedList() {
    setCreating(true)
    await onCreateShared()
    setCreating(false)
  }

  return (
    <div className="list-switcher">
      <div className="list-switcher-top">
        <span className="list-switcher-label">Your lists</span>
      </div>

      {listsError && (
        <p className="list-switcher-error">
          Couldn't load your lists ({listsError}). Make sure the latest schema.sql has been run.
        </p>
      )}

      {lists.length > 1 && (
        <div className="list-tabs">
          {lists.map((l) => (
            <button
              key={l.id}
              className={
                'list-tab' +
                (l.is_personal ? ' list-tab--personal' : ' list-tab--shared') +
                (l.id === activeListId ? ' list-tab--active' : '')
              }
              style={l.is_personal ? undefined : sharedTabColor(l.id)}
              onClick={() => onSwitch(l.id)}
            >
              {l.is_personal ? (
                <span className="list-tab-icon" aria-hidden="true">🔒</span>
              ) : (
                <span className="list-tab-dot" aria-hidden="true" />
              )}
              {l.label}
            </button>
          ))}
        </div>
      )}

      {activeList?.is_personal && (
        <>
          <button type="button" className="invite-start-btn" onClick={startSharedList} disabled={creating}>
            {creating ? 'Creating…' : '+ Invite a friend to watch together'}
          </button>
          {createError && <p className="join-error">{createError}</p>}
        </>
      )}

      {activeList && !activeList.is_personal && activeList.invite_code && (
        <div className="invite-code-block">
          <span className="invite-code-hint">Share this code to invite more people to “{activeList.label}”</span>
          <button type="button" className="invite-code-pill" onClick={copyCode}>
            <span className="invite-code-value">{activeList.invite_code}</span>
            <span className="invite-code-copy">{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      )}

      {/* Leaving only makes sense for a shared list — your personal list
          is the one place you can't remove yourself from. */}
      {activeList && !activeList.is_personal && (
        <button type="button" className="leave-list-btn" onClick={() => onRequestLeave(activeList)}>
          Leave “{activeList.label}”
        </button>
      )}
      {leaveError && <p className="join-error">{leaveError}</p>}

      <form className="join-form" onSubmit={submitJoin}>
        <span className="join-form-label">Have an invite code?</span>
        <input
          className="join-input"
          placeholder="Enter code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={6}
        />
        <button className="join-btn" type="submit">Join</button>
      </form>
      {joinError && <p className="join-error">{joinError}</p>}
    </div>
  )
}
