import { useState } from 'react'
import './AuthScreen.css'

// Full-page auth gate shown when Supabase is configured but no session
// exists yet. Styled as a ticket-booth card, following the same
// --surface/--line/--text visual language as ConfirmDeleteModal.
export default function AuthScreen({ onSignUp, onSignIn }) {
  const [mode, setMode] = useState('signin')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setNotice('')
    setSubmitting(true)
    const result =
      mode === 'signup'
        ? await onSignUp(email.trim(), password, displayName.trim())
        : await onSignIn(email.trim(), password)
    setSubmitting(false)
    if (result?.error) {
      setError(result.error)
      return
    }
    if (result?.needsConfirmation) {
      setNotice('Check your inbox to confirm your email, then sign in.')
      setMode('signin')
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <span className="auth-eyebrow">Now booking</span>
        <h1 className="auth-title">Up next</h1>
        <p className="auth-sub">
          {mode === 'signup' ? 'Create an account to start your queue.' : 'Sign in to your queue.'}
        </p>

        <form className="auth-form" onSubmit={onSubmit}>
          {mode === 'signup' && (
            <input
              className="auth-input"
              placeholder="Name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="name"
              required
            />
          )}
          <input
            className="auth-input"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <input
            className="auth-input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            minLength={6}
            required
          />
          {error && <p className="auth-status auth-status--error">{error}</p>}
          {notice && <p className="auth-status">{notice}</p>}
          <button className="auth-submit" type="submit" disabled={submitting}>
            {submitting ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <button
          type="button"
          className="auth-switch"
          onClick={() => {
            setMode(mode === 'signup' ? 'signin' : 'signup')
            setError('')
            setNotice('')
          }}
        >
          {mode === 'signup' ? 'Already have an account? Sign in' : "New here? Create an account"}
        </button>
      </div>
    </div>
  )
}
