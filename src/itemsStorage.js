// localStorage fallback for `items` when Supabase isn't configured (see
// isSupabaseConfigured in supabaseClient.js). App.jsx is the only caller.
import { LOCAL_KEY, SEED } from './constants'

// Re-stamps every item's "position" as a clean 1..N sequence, in the order
// items already sort into (missing/duplicate positions fall back to their
// current array order instead of colliding). Returns { list, changed } so
// callers can skip a write-back when nothing needed fixing.
export function normalizePositions(list) {
  const withIndex = list.map((item, index) => ({ item, index }))
  withIndex.sort((x, y) => {
    const px = typeof x.item.position === 'number' ? x.item.position : Infinity
    const py = typeof y.item.position === 'number' ? y.item.position : Infinity
    return px - py || x.index - y.index
  })
  let changed = false
  const result = withIndex.map(({ item }, idx) => {
    const position = idx + 1
    if (item.position !== position) changed = true
    return item.position === position ? item : { ...item, position }
  })
  return { list: result, changed }
}

export function loadLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    if (raw) return normalizePositions(JSON.parse(raw)).list
  // eslint-disable-next-line no-unused-vars
  } catch (e) {
    // ignore corrupted storage
  }
  return SEED
}

export function saveLocal(items) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(items))
  // eslint-disable-next-line no-unused-vars
  } catch (e) {
    // ignore write failures
  }
}
