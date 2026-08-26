import { useEffect, useRef, useState } from 'react'
import './AccountMenu.css'

// Account control anchored to the top-right corner of the ListSwitcher
// ("Your lists") card — see the `.list-switcher-wrap` wrapper in App.jsx,
// which is what its position is relative to. A fantasy sword driven tip-
// first into the card: at rest the hilt (pommel + wine-red wrapped grip +
// winged crossguard) shows above the card's edge, with just the glowing
// tip of the blade already poking out below the guard — as if the sword
// were mostly buried in the card. Hovering — or
// tapping, on devices with no hover — draws the rest of the blade smoothly
// *up out of the card*, tip last to leave, revealing avatar, "Settings"
// and "Log out" down its length. "Settings" still opens the existing
// Settings modal (name/avatar editing, unchanged — see Settings.jsx) and
// "Log out" hands straight off to App.jsx's existing pendingSignOut +
// ConfirmModal guard, the same one Settings' own sign-out button already
// uses.
//
// The "draw" is plain CSS, no JS measuring: .account-menu is positioned by
// `bottom` (not `top`, see AccountMenu.css) with auto height. The hilt is
// fixed-size and sits *first* in normal flow, so as the whole assembly's
// height changes, its top (where the pommel is) is what moves. The blade
// sits *second*, collapsed to a small fixed sliver (not all the way to 0 —
// that's the bit already "stuck in") at rest — its own bottom edge is the
// container's bottom edge, which `bottom` pins at the card's surface.
// Growing the blade's max-height on hover pushes the hilt further up while
// the blade's tip stays pinned at that same spot until the very end of the
// animation, exactly like a sword's point being the last thing to clear
// the stone it was driven into.
//
// NOTE: the avatar identity block is temporarily removed from the blade
// (icon-only "Settings"/"Log out" now, no room/need for it) — `avatarUrl`
// is still passed down by App.jsx unchanged, just not read here. Re-add a
// `<div className="sword-identity">` (styles are still in AccountMenu.css)
// to bring it back.
//
// Below 520px the sword itself is swapped out entirely for a plain
// hamburger icon (see .hamburger-icon in AccountMenu.css) — there's too
// little header space above the card on a narrow screen for the sword's
// height, at any size, to float into without a real risk of covering the
// subtitle text. Both the hamburger markup and the sword pieces are
// always in the DOM; which one is visible is a pure CSS media-query swap,
// same button/panel/state/handlers underneath, so there's no separate
// mobile logic to keep in sync.
export default function AccountMenu({ displayName, onOpenSettings, onRequestSignOut }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  // Close on Escape or a click/tap outside — mirrors the pattern used by
  // Settings.jsx and the confirm modals, adapted for a non-modal dropdown.
  useEffect(() => {
    if (!open) return
    function onKeyDown(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    function onPointerDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  return (
    <div
      ref={rootRef}
      className={`account-menu${open ? ' account-menu--open' : ''}`}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget)) setOpen(false)
      }}
    >
      {/* Hilt — always visible, and the whole button is the hover/click
          trigger (same role the old bookmark tab played). Pommel gem and
          crossguard gem share one glow color that also shows up as the
          blade's center energy line and tip spark, so the whole piece
          reads as one enchanted weapon rather than three unrelated parts. */}
      <button
        type="button"
        className="sword-hilt"
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => setOpen(true)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Account menu"
      >
        <span className="sword-pommel" aria-hidden="true">
          <span className="sword-pommel-gem" />
        </span>
        <span className="sword-grip" title={displayName}>
          <span className="sword-grip-band sword-grip-band--top" aria-hidden="true" />
          <span className="sword-grip-band sword-grip-band--bottom" aria-hidden="true" />
        </span>
        <span className="sword-guard" aria-hidden="true">
          <span className="sword-guard-wing sword-guard-wing--left" />
          <span className="sword-guard-bar" />
          <span className="sword-guard-gem" />
          <span className="sword-guard-wing sword-guard-wing--right" />
        </span>

        {/* Mobile-only stand-in for the whole sword above — see the note
            at the top of this file. */}
        <span className="hamburger-icon" aria-hidden="true">
          <span className="hamburger-bar" />
          <span className="hamburger-bar" />
          <span className="hamburger-bar" />
        </span>
      </button>

      {/* Blade — collapsed to a thin sliver (see AccountMenu.css) at rest.
          Icon-only items, base-to-tip: "Settings" nearest the guard
          (easiest reach), "Log out" nearest the point — same
          safety-by-distance idea the bookmark-tab version used for the
          same item. Each still carries its aria-label since there's no
          visible text anymore. */}
      <div className="sword-blade" role="menu">
        <span className="sword-blade-edge sword-blade-edge--left" aria-hidden="true" />
        <span className="sword-blade-edge sword-blade-edge--right" aria-hidden="true" />
        <span className="sword-blade-glow" aria-hidden="true" />
        <span className="sword-blade-sweep" aria-hidden="true" />

        <button
          type="button"
          className="sword-item"
          role="menuitem"
          aria-label="Settings"
          onClick={() => {
            setOpen(false)
            onOpenSettings()
          }}
        >
          <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
            <circle cx="8" cy="8" r="2.3" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <path
              d="M8 1.6v1.6M8 12.8v1.6M14.4 8h-1.6M3.2 8H1.6M12.33 3.67l-1.13 1.13M4.8 11.2l-1.13 1.13M12.33 12.33l-1.13-1.13M4.8 4.8L3.67 3.67"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <button
          type="button"
          className="sword-item sword-item--danger"
          role="menuitem"
          aria-label="Log out"
          onClick={() => {
            setOpen(false)
            onRequestSignOut()
          }}
        >
          <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
            <path d="M6 2.5H3.6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1H6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M6.8 8H14M11 5l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <span className="sword-tip-spark" aria-hidden="true" />
      </div>
    </div>
  )
}
