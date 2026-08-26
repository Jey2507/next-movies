// Static config + lookup tables shared across App.jsx and its sub-components.
// Nothing here depends on component state — pure data only.

// Get a free key at https://www.themoviedb.org/settings/api and paste it below.
export const TMDB_API_KEY = '4f5ec21ec83179db03e267a97d8f594d'
export const TMDB_IMG = 'https://image.tmdb.org/t/p/w200'
// Wider, landscape-cropped TMDB image (backdrop_path, not poster_path) —
// used for the ticket card's background image so it isn't a stretched
// portrait poster. See TicketCard.jsx's ticket-bg-poster.
export const TMDB_IMG_BACKDROP = 'https://image.tmdb.org/t/p/w400'
export const LOCAL_KEY = 'watch-queue-items'

export const TYPES = [
  { id: 'movie', label: 'Movie' },
  { id: 'series', label: 'Series' },
  { id: 'anime', label: 'Anime' },
]

export const STATUSES = [
  { id: 'planned', label: 'Plan to watch', color: 'var(--gold)' },
  { id: 'watching', label: 'In process', color: 'var(--teal)' },
  { id: 'done', label: 'Done', color: 'var(--green)' },
]

export const GENRE_NAMES = {
  16: 'Animation', 18: 'Drama', 35: 'Comedy', 28: 'Action', 12: 'Adventure',
  878: 'Sci-fi', 14: 'Fantasy', 9648: 'Mystery', 10765: 'Sci-fi & fantasy',
  10759: 'Action & adventure', 80: 'Crime', 27: 'Horror', 10749: 'Romance',
  53: 'Thriller', 99: 'Documentary', 10751: 'Family',
}

export const SEED = [
  { id: 1, title: 'Dune: Part Three', type: 'movie', year: '2026', genre: 'Sci-fi', status: 'planned', poster: null, position: 1 },
  { id: 2, title: 'Severance', type: 'series', year: '2025', genre: 'Mystery', status: 'watching', poster: null, position: 2 },
  { id: 3, title: 'Frieren', type: 'anime', year: '2023', genre: 'Fantasy', status: 'done', poster: null, position: 3 },
]
