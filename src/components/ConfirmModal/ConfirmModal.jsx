import { useEffect } from 'react'
import './ConfirmModal.css'

// Generic confirm-before-you-act dialog — the same accidental-tap guard
// pattern as ConfirmDeleteModal (backdrop + Escape-to-close + explicit
// confirm), generalized with a `tone` so it can gate non-destructive but
// still disruptive actions (like signing out) without borrowing
// ConfirmDeleteModal's delete-specific copy and danger styling.
export default function ConfirmModal({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'neutral',
  onCancel,
  onConfirm,
}) {
  useEffect(() => {
    if (!open) return
    function onKeyDown(e) {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div className="confirm-backdrop" onClick={onCancel}>
      <div
        className={'confirm-card confirm-card--' + tone}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="confirm-title">{title}</p>
        <p className="confirm-body">{body}</p>
        <div className="confirm-actions">
          <button className="confirm-btn confirm-btn--cancel" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            className={'confirm-btn confirm-btn--' + tone}
            onClick={onConfirm}
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
