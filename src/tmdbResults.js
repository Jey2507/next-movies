// Turns a raw TMDB `/search/multi` result into this app's item shape
// (movie | series | anime — see the Core data model in CLAUDE.md).
// Used by App.jsx's addFromSearch.
import { GENRE_NAMES } from './constants'

export function guessType(result) {
  const isAnime = result.original_language === 'ja' && (result.genre_ids || []).includes(16)
  if (isAnime) return 'anime'
  return result.media_type === 'tv' ? 'series' : 'movie'
}

export function firstGenre(result) {
  const id = (result.genre_ids || [])[0]
  return GENRE_NAMES[id] || ''
}
