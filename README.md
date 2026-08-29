# 🎟️ Up Next

**Up Next** turns your watchlist into a wall of cinema tickets. Search for a movie, series, or anime, drop it in your queue, and track it from *plan to watch* to *done* — no spreadsheets, no sticky notes.

Built with React and Vite, backed by TMDB for search and Supabase for sync.

## Features

- 🔍 **Search as you type** — live TMDB search across movies and TV, results in a dropdown you can add from directly.
- 🎫 **Ticket-style cards** — every title gets its poster, type, year, and genre on a proper cinema ticket.
- 📶 **Status tracking** — flip a title between *Plan to watch*, *In process*, and *Done* right from its card.
- 🔀 **Reorder your queue** — bump titles up or down with a smooth animated reorder.
- 🧭 **Filter** by type, status, or genre to find what you're looking for.
- ℹ️ **Detail view** — click any ticket for a closer look, with extra info pulled live from TMDB.
- ✍️ **Add manually** for anything TMDB doesn't have.
- ☁️ **Works with or without an account** — syncs to Supabase if it's configured, otherwise saves quietly in your browser.

## Tech stack

React · Vite · Supabase · TMDB API · plain CSS — no UI framework, no state library.

## Running it locally

```bash
npm install
cp .env.example .env   # then fill in your keys below
npm run dev
```

You'll need a free [TMDB API key](https://www.themoviedb.org/settings/api) for search to work — put it in `.env` as `VITE_TMDB_API_KEY`.

Supabase is optional. Without it, your queue is simply saved in the browser (`localStorage`). To sync across devices, create a free [Supabase](https://supabase.com/) project, put its URL and anon key in `.env` as `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, and create an `items` table (or run the full schema in [src/schema.sql](src/schema.sql)):

| column   | type                                      |
| -------- | ------------------------------------------ |
| id       | identity / uuid (primary key)               |
| title    | text                                        |
| type     | text — `movie` \| `series` \| `anime`       |
| year     | text                                        |
| genre    | text                                        |
| status   | text — `planned` \| `watching` \| `done`    |
| poster   | text (nullable)                             |
| position | int                                         |

Other scripts:

```bash
npm run build     # production build
npm run lint      # eslint
npm run preview   # preview the production build locally
```

## Project structure

```
src/
├── App.jsx                           # queue state, search, filters, layout
├── App.css / index.css               # ticket and global styling
├── supabaseClient.js                 # Supabase client + config detection
└── components/
    ├── DetailModal.jsx / .css        # per-title detail view
    └── ConfirmDeleteModal.jsx / .css # "are you sure" guard before removing a title
```

## Deployment

Just a static Vite app — `npm run build` and deploy the `dist/` folder anywhere. Currently deployed on [Vercel](https://vercel.com/). Set `VITE_TMDB_API_KEY`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY` as environment variables in your Vercel project settings (Settings → Environment Variables) — the same names as in `.env.example`.

## Credits

This product uses the [TMDB API](https://www.themoviedb.org/documentation/api) but is not endorsed or certified by TMDB.

---

⚠️ If you fork this: copy `.env.example` to `.env` and put in your own TMDB/Supabase keys. Never commit `.env` — it's gitignored on purpose.
