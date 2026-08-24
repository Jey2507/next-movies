# Up Next— Claude Code Guide

## Project
React + Vite movie/series/anime watch queue.
Deployed on Vercel.
Main UI is in src/App.jsx.
Styling is in src/App.css and src/index.css.
Supabase client is in src/supabaseClient.js.

## Stack
- React
- Vite
- JavaScript/JSX
- CSS
- Supabase
- TMDB API
- Vercel

## Core data model

{
  id,
  title,
  type: movie | series | anime,
  year,
  genre,
  status: planned | watching | done,
  poster,
  position
}

Supabase uses the `items` table.

If Supabase is not configured, the app uses localStorage with:
`watch-queue-items`

Do not invent database tables or columns. Inspect the existing code first.

## TMDB

Search uses TMDB `/search/multi`.

Results are debounced by ~400ms and limited to 8 results.

TMDB results are converted into:
- movie
- series
- anime

Do not replace TMDB unless explicitly requested.

IMPORTANT: never expose or copy API keys into documentation. The current TMDB key is hard-coded in App.jsx and should eventually be moved to environment configuration.

## Components

- `src/components/DetailModal.jsx` (+ `.css`) — item detail modal, opened by clicking a ticket card. Fetches extra info from TMDB.
- `src/components/ConfirmDeleteModal.jsx` (+ `.css`) — confirmation modal shown before an item is actually removed. It's the accidental-tap guard in front of `removeItem` in App.jsx: the ticket's × button no longer deletes directly, it sets `pendingDelete`, and this modal's confirm action calls `removeItem`. Reuse this pattern for any other destructive action instead of adding a new bespoke confirm dialog.

## UI

The product is called **Up Next** and has a cinema/ticket visual identity.

Preserve the existing visual language:
- cinema ticket cards
- movie posters
- type/status colors
- responsive layout

Do not turn the UI into a generic dashboard.

## Code rules

- Read existing code before editing.
- Search for existing implementations before creating new ones.
- Make the smallest change necessary.
- Reuse existing patterns.
- Do not rewrite App.jsx unnecessarily.
- Do not migrate to Next.js or TypeScript unless explicitly requested.
- Do not add Redux/Zustand or UI frameworks unless explicitly requested.
- Do not add dependencies for things that can be handled with the existing stack.
- Preserve unrelated functionality.
- Never expose secrets.

## Before changing data/backend code

Inspect:
- src/App.jsx
- src/supabaseClient.js

Before changing UI:
- src/App.jsx
- src/App.css
- src/index.css

Before changing build/dependencies:
- package.json
- vite.config.js

## Validation

After meaningful changes, run the relevant commands from package.json, especially:

npm run lint
npm run build

If something fails, report it rather than hiding the failure.

## Important

The repository is the source of truth.

Do not assume:
- Next.js
- authentication
- database schema beyond what exists
- routing
- TypeScript
- a component library
- another movie API

When requirements conflict, prioritize:
1. User request
2. Existing application behavior
3. Existing project conventions
4. This file