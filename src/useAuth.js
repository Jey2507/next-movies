import { useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from './supabaseClient'

// Session/user state backed by Supabase Auth. When Supabase isn't
// configured this short-circuits to inert defaults so the rest of the app
// (App.jsx) can render its existing no-auth, localStorage-only flow
// untouched — see isSupabaseConfigured usage throughout App.jsx.
//
// Supabase's session itself (persisted + silently refreshed by
// supabaseClient.js) already keeps people signed in indefinitely across
// reloads. On top of that, this hook auto signs out anyone who hasn't
// touched the app in 2 weeks, tracked purely client-side since Supabase has
// no built-in inactivity timeout for email/password sessions.
const INACTIVITY_LIMIT_MS = 14 * 24 * 60 * 60 * 1000
const LAST_ACTIVE_KEY = 'watch-queue-last-active'

function readLastActive() {
  try {
    const raw = localStorage.getItem(LAST_ACTIVE_KEY)
    return raw ? Number(raw) : Date.now()
  // eslint-disable-next-line no-unused-vars
  } catch (e) {
    return Date.now()
  }
}

function touchLastActive() {
  try {
    localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()))
  // eslint-disable-next-line no-unused-vars
  } catch (e) {
    // ignore write failures
  }
}

export function useAuth() {
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured)

  useEffect(() => {
    if (!isSupabaseConfigured) return
    let cancelled = false

    async function init() {
      const { data } = await supabase.auth.getSession()
      if (cancelled) return
      if (data.session && Date.now() - readLastActive() > INACTIVITY_LIMIT_MS) {
        await supabase.auth.signOut()
        if (cancelled) return
        setSession(null)
      } else {
        if (data.session) touchLastActive()
        setSession(data.session)
      }
      setAuthLoading(false)
    }
    init()

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (cancelled) return
      if (newSession) touchLastActive()
      setSession(newSession)
      setAuthLoading(false)
    })

    return () => {
      cancelled = true
      subscription.subscription.unsubscribe()
    }
  }, [])

  // While signed in: refresh the "last active" timestamp on real
  // interaction (throttled to once a minute) and re-check it hourly, so a
  // tab left open continuously still signs out once the 2-week mark passes.
  const userId = session?.user?.id
  useEffect(() => {
    if (!isSupabaseConfigured || !userId) return
    touchLastActive()
    let lastTouch = Date.now()

    function onActivity() {
      const now = Date.now()
      if (now - lastTouch > 60_000) {
        lastTouch = now
        touchLastActive()
      }
    }
    function checkInactivity() {
      if (Date.now() - readLastActive() > INACTIVITY_LIMIT_MS) supabase.auth.signOut()
    }

    window.addEventListener('mousedown', onActivity)
    window.addEventListener('keydown', onActivity)
    document.addEventListener('visibilitychange', onActivity)
    const interval = setInterval(checkInactivity, 60 * 60 * 1000)

    return () => {
      window.removeEventListener('mousedown', onActivity)
      window.removeEventListener('keydown', onActivity)
      document.removeEventListener('visibilitychange', onActivity)
      clearInterval(interval)
    }
  }, [userId])

  async function signUp(email, password, displayName) {
    if (!isSupabaseConfigured) return { error: 'Auth is not configured.' }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    })
    if (error) return { error: error.message }
    if (data.session) return { error: null }
    return { error: null, needsConfirmation: true }
  }

  async function signIn(email, password) {
    if (!isSupabaseConfigured) return { error: 'Auth is not configured.' }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error ? error.message : null }
  }

  async function signOut() {
    if (!isSupabaseConfigured) return
    await supabase.auth.signOut()
    try {
      localStorage.removeItem(LAST_ACTIVE_KEY)
    // eslint-disable-next-line no-unused-vars
    } catch (e) {
      // ignore
    }
  }

  return {
    user: isSupabaseConfigured ? session?.user ?? null : null,
    authLoading: isSupabaseConfigured ? authLoading : false,
    signUp,
    signIn,
    signOut,
  }
}
