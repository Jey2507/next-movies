import { useCallback, useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from './supabaseClient'

// Settings-editable profile fields backing the Settings modal (see
// components/Settings/Settings.jsx). display_name already lives on auth
// user_metadata (set at signup — see useAuth.js's signUp) and App.jsx
// already derives its `displayName` from the session's user object, so
// renaming just needs to write back there via supabase.auth.updateUser —
// that alone updates every screen live, with no extra state here.
//
// avatar_url is different: it's kept OFF user_metadata entirely, because
// that gets embedded in every JWT, and an image data URI there would bloat
// every request. profiles.avatar_url (see schema.sql) is its only home, so
// this hook is what reads it back out and mirrors updates into local state.
export function useProfile(user) {
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [profileLoading, setProfileLoading] = useState(!!user)

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured || !user) {
      setAvatarUrl(null)
      setProfileLoading(false)
      return
    }
    setProfileLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', user.id)
      .single()
    setAvatarUrl(!error && data ? data.avatar_url : null)
    setProfileLoading(false)
  }, [user])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
  }, [refresh])

  // `displayName`/`avatarUrl` (the new avatar data URI, or null to remove
  // it) are each optional — Settings.jsx only includes the fields the user
  // actually changed. display_name is also mirrored onto `profiles` (not
  // just user_metadata) so co-members' shared-list tab labels pick up the
  // new name too (see useLists.js), even though that only refreshes on
  // their next list load — profiles isn't realtime-subscribed like
  // list_members is.
  async function updateProfile({ displayName, avatarUrl: nextAvatarUrl } = {}) {
    if (!isSupabaseConfigured || !user) return { error: 'Not signed in.' }

    if (displayName != null) {
      const { error } = await supabase.auth.updateUser({ data: { display_name: displayName } })
      if (error) return { error: error.message }
    }

    const patch = {}
    if (displayName != null) patch.display_name = displayName
    if (nextAvatarUrl !== undefined) patch.avatar_url = nextAvatarUrl
    if (Object.keys(patch).length) {
      const { error } = await supabase.from('profiles').update(patch).eq('id', user.id)
      if (error) return { error: error.message }
    }

    if (nextAvatarUrl !== undefined) setAvatarUrl(nextAvatarUrl)
    return { error: null }
  }

  return { avatarUrl, profileLoading, updateProfile }
}
