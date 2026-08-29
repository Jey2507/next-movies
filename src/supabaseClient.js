import { createClient } from '@supabase/supabase-js'

// 1. Create a free project at https://supabase.com
// 2. In your project: Settings -> API -> copy "Project URL" and "anon public" key
// 3. Put them in .env as VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — see .env.example
// 4. In the SQL editor, run the schema from schema.sql (included alongside this file)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'YOUR_SUPABASE_URL'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY'

export const isSupabaseConfigured =
  SUPABASE_URL !== 'YOUR_SUPABASE_URL' && SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY'

export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      // Keeps the user signed in across reloads/tabs and silently refreshes
      // the access token — these are supabase-js's defaults, spelled out
      // here so "stay logged in" is a documented choice, not an accident.
      // The 2-week inactivity sign-out on top of this lives in useAuth.js.
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null