import { useEffect, useRef, useState } from 'react'
import './Settings.css'

const AVATAR_SIZE = 160 // px — square the picked photo is downscaled to

// Downscales/center-crops the picked file to a square JPEG data URI
// client-side. No storage bucket needed for this: the result is just text,
// written straight into profiles.avatar_url (see useProfile.js) — keeping
// it small here is what keeps that column, and every select of it, cheap.
function fileToAvatarDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read that file.'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Could not read that image.'))
      img.onload = () => {
        const side = Math.min(img.width, img.height)
        const canvas = document.createElement('canvas')
        canvas.width = AVATAR_SIZE
        canvas.height = AVATAR_SIZE
        const ctx = canvas.getContext('2d')
        ctx.drawImage(
          img,
          (img.width - side) / 2,
          (img.height - side) / 2,
          side,
          side,
          0,
          0,
          AVATAR_SIZE,
          AVATAR_SIZE
        )
        resolve(canvas.toDataURL('image/jpeg', 0.8))
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

// Settings modal: change display name / avatar, and sign out. Same
// backdrop + Escape-to-close card pattern as ConfirmModal/ConfirmDeleteModal,
// kept self-contained here (its own CSS, not a shared import) per the
// one-folder-per-component convention — see CLAUDE.md's file map.
//
// Sign-out itself isn't handled here: onRequestSignOut hands off to
// App.jsx's existing pendingSignOut + ConfirmModal flow, so there's still
// exactly one confirm-before-sign-out guard in the app, not a second one.
export default function Settings({ open, displayName, avatarUrl, onClose, onSave, onRequestSignOut }) {
  const [name, setName] = useState(displayName)
  const [avatarDraft, setAvatarDraft] = useState(avatarUrl) // data URI, existing URL, or null
  const [avatarChanged, setAvatarChanged] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef(null)

  // Re-seed the draft from the latest saved values every time the modal opens.
  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(displayName)
    setAvatarDraft(avatarUrl)
    setAvatarChanged(false)
    setError('')
    setSaving(false)
  }, [open, displayName, avatarUrl])

  useEffect(() => {
    if (!open) return
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  async function onPickFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Pick an image file.')
      return
    }
    try {
      const dataUrl = await fileToAvatarDataUrl(file)
      setAvatarDraft(dataUrl)
      setAvatarChanged(true)
      setError('')
    } catch (err) {
      setError(err.message || 'Could not use that image.')
    }
  }

  function removeAvatar() {
    setAvatarDraft(null)
    setAvatarChanged(true)
  }

  async function onSubmit(e) {
    e.preventDefault()
    if (!name.trim()) {
      setError("Name can't be empty.")
      return
    }
    const patch = {}
    if (name.trim() !== displayName) patch.displayName = name.trim()
    if (avatarChanged) patch.avatarUrl = avatarDraft
    if (!Object.keys(patch).length) {
      onClose()
      return
    }
    setSaving(true)
    setError('')
    const result = await onSave(patch)
    setSaving(false)
    if (result?.error) {
      setError(result.error)
      return
    }
    onClose()
  }

  const initial = (name || '?').trim().charAt(0).toUpperCase()

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div
        className="settings-card"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="settings-title">Settings</p>

        <div className="settings-avatar-row">
          <button
            type="button"
            className="settings-avatar-btn"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Change avatar"
          >
            {avatarDraft ? (
              <img src={avatarDraft} alt="" className="settings-avatar-img" />
            ) : (
              <span className="settings-avatar-fallback">{initial}</span>
            )}
            <span className="settings-avatar-edit">Change</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={onPickFile}
            className="settings-avatar-input"
          />
          {avatarDraft && (
            <button type="button" className="settings-avatar-remove" onClick={removeAvatar}>
              Remove photo
            </button>
          )}
        </div>

        <form onSubmit={onSubmit} className="settings-form">
          <label className="settings-label" htmlFor="settings-name">
            Name
          </label>
          <input
            id="settings-name"
            className="settings-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            required
          />

          {error && <p className="settings-error">{error}</p>}

          <div className="settings-actions">
            <button type="button" className="settings-btn settings-btn--danger" onClick={() => { onClose(); onRequestSignOut() }}>
              Sign out
            </button>
            <div className="settings-actions-right">
              <button type="button" className="settings-btn settings-btn--cancel" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="settings-btn settings-btn--save" disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
