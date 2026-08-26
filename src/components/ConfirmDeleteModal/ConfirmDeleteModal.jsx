import { useEffect } from 'react'
import './ConfirmDeleteModal.css'

// Confirmation gate in front of removeItem — guards against an accidental
// tap/click on the ticket's × button by making deletion a deliberate second
// step instead of a one-click, unrecoverable action.
export default function ConfirmDeleteModal({ item, onCancel, onConfirm }) {
  useEffect(() => {
    if (!item) return
    function onKeyDown(e) {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [item, onCancel])

  if (!item) return null

  return (
    <div className="confirm-backdrop" onClick={onCancel}>
      <div
        className="confirm-card"
        role="alertdialog"
        aria-modal="true"
        aria-label="Confirm removal"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="confirm-title">Remove from queue?</p>
        <p className="confirm-body">
          <span className="confirm-item-title">{item.title}</span> will be removed from your queue. This can't be undone.
        </p>
        <div className="confirm-actions">
          <button className="confirm-btn confirm-btn--cancel" onClick={onCancel}>
            Cancel
          </button>
          <button className="confirm-btn confirm-btn--danger" onClick={onConfirm} autoFocus>
            Remove
          </button>
        </div>
      </div>
    </div>
  )
}
