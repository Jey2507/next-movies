# 🎟️ Up Next

A cinema-ticket-styled watch queue for movies, series, and anime. Search titles via TMDB, drop them into your queue as ticket cards, track their status, and reorder them — all with a snappy React + Vite front end.

## Features

- **TMDB search** — debounced multi-search (movies + TV) with poster previews, limited to 8 results per query.
- **Ticket-card queue** — each title is rendered as a cinema ticket with type, year, genre, and status.
- **Status tracking** — `Plan to watch` → `In process` → `Done`, changeable inline from each card.
- **Manual add** — add a title by hand when it isn't on TMDB.
- **Reordering** — move tickets up/down with an animated FLIP transition.
- **Filtering** — filter the queue by type, status, and genre.
- **Detail modal** — click a ticket to see extended info pulled from TMDB.
- **Delete confirmation** — a confirm modal guards against accidental removals.
- **Cloud or local persistence** — syncs to Supabase when configured, otherwise falls back to `localStorage` automatically.

## Tech stack

- [React](https://react.dev/) 19
- [Vite](https://vite.dev/)
- [Supabase](https://supabase.com/) (Postgres + client SDK)
- [TMDB API](https://www.themoviedb.org/documentation/api)
- Plain CSS (no UI framework)
- Deployed on [Vercel](https://vercel.com/)

## Getting started

### Prerequisites

- Node.js 18+
- A free [TMDB API key](https://www.themoviedb.org/settings/api)
- *(optional)* A free [Supabase](https://supabase.com/) project, for cross-device sync

### Install

```bash
npm install
```

### Configure TMDB

Open [src/App.jsx](src/App.jsx) and set your own key:

```js
const TMDB_API_KEY = 'YOUR_TMDB_API_KEY'
```

Without a valid key, search is disabled and the app prompts you to add one.

### Configure Supabase (optional)

Open [src/supabaseClient.js](src/supabaseClient.js) and set your project's URL and anon key:

```js
const SUPABASE_URL = 'YOUR_SUPABASE_URL'
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY'
```

Then create an `items` table with the following columns:

| column   | type                                  |
| -------- | ------------------------------------- |
| id       | identity / uuid (primary key)         |
| title    | text                                  |
| type     | text — `movie` \| `series` \| `anime` |
| year     | text                                  |
| genre    | text                                  |
| status   | text — `planned` \| `watching` \| `done` |
| poster   | text (nullable)                       |
| position | int                                   |

If Supabase isn't configured, the app transparently stores everything in the browser under the `watch-queue-items` `localStorage` key — no setup required to try it out.

### Run

```bash
npm run dev
```

## Scripts

| Command           | Description                        |
| ------------------ | ----------------------------------- |
| `npm run dev`       | Start the Vite dev server           |
| `npm run build`     | Production build                    |
| `npm run lint`      | Run ESLint                          |
| `npm run preview`   | Preview the production build        |

## Project structure

```
src/
├── App.jsx                        # main app: queue state, search, filters, layout
├── App.css                        # ticket/queue styling
├── index.css                      # global styles
├── supabaseClient.js               # Supabase client + config check
└── components/
    ├── DetailModal.jsx / .css      # item detail modal (fetches extra TMDB info)
    └── ConfirmDeleteModal.jsx / .css  # confirmation guard before removing an item
```

## Deployment

The app is a static Vite build and deploys as-is to [Vercel](https://vercel.com/) (or any static host). Run `npm run build` and deploy the generated `dist/` folder.

## Notes

- ⚠️ Never commit real API keys to a public repository — move them to environment variables before deploying publicly.
