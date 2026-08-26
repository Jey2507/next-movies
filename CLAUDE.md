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

## File map (read this instead of globbing/exploring)

Each component owns one folder: `src/components/<Name>/<Name>.jsx` + `<Name>.css` — nothing else lives in that folder. Jump straight to the file(s) for the topic instead of reading the whole tree.

| Topic | File(s) |
|---|---|
| Main app shell/state only — search, filters, ticket list, and the add-form are separate components below | `src/App.jsx` (+ `src/App.css`) |
| Global/base styles, CSS variables | `src/index.css` |
| Static config + lookup tables (TMDB key/img base, TYPES, STATUSES, GENRE_NAMES, SEED) | `src/constants.js` |
| localStorage fallback for `items` (normalize positions, load/save) | `src/itemsStorage.js` |
| TMDB search-result → item shape (`guessType`, `firstGenre`) | `src/tmdbResults.js` |
| Supabase client init | `src/supabaseClient.js` |
| Auth session state (sign in/out, 2-week inactivity auto-logout) | `src/useAuth.js` |
| Shared/personal lists (create, join by code, switch) | `src/useLists.js` |
| Editable profile (display name, avatar), backing the Settings modal | `src/useProfile.js` |
| Per-author note attribution (diff/rebase colored note segments) | `src/noteSegments.js` |
| Per-author note color palette (deterministic hue per name/list) | `src/noteAuthorColors.js` |
| TMDB extra-details fetch hook, used only by DetailModal | `src/useTmdbDetails.js` |
| DB schema, RLS policies, `handle_new_user` trigger | `src/schema.sql` |
| Vercel serverless function: exact-title lookup against uaserials.com's search (server-side fetch+parse, since that site sends no CORS headers for a browser fetch), used by DetailModal's "Watch on UASerials" button | `api/uaserials-search.js` |
| Item detail modal (TMDB extra info, notes editing, "watch on other sites" links) | `src/components/DetailModal/` |
| Delete confirmation guard (used by `removeItem`) | `src/components/ConfirmDeleteModal/` |
| Generic confirm-before-you-act dialog (non-destructive, e.g. sign out) | `src/components/ConfirmModal/` |
| Sign in / sign up screen | `src/components/AuthScreen/` |
| Settings modal (avatar upload, rename, sign out) | `src/components/Settings/` |
| Account control — ornate sword driven tip-first into the "Your lists" card; hilt (name on the grip) always shows, hover draws the blade up out of the card to reveal avatar + Settings + Log out | `src/components/AccountMenu/` |
| Switch between personal/shared lists, join-by-code UI | `src/components/ListSwitcher/` |
| TMDB title search input + results dropdown | `src/components/SearchBox/` |
| Manual "add to queue" form | `src/components/AddItemForm/` |
| Type/status/genre filter pills above the ticket grid | `src/components/FilterBar/` |
| One cinema-ticket card (poster, reorder buttons, status select) | `src/components/TicketCard/` |

Only open files outside this table (or grep) when a task isn't covered by it.

## Core data model

{
  id,
  title,
  type: movie | series | anime,
  year,
  genre,
  status: planned | watching | done,
  poster,
  backdrop,
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

Each lives in its own folder under `src/components/` (see File map above) — e.g. `src/components/DetailModal/DetailModal.jsx` + `DetailModal.css`.

- `DetailModal/` — item detail modal, opened by clicking a ticket card. Fetches extra info from TMDB (via `useTmdbDetails.js`) and colors shared notes by author (via `noteAuthorColors.js`).
- `ConfirmDeleteModal/` — confirmation modal shown before an item is actually removed. It's the accidental-tap guard in front of `removeItem` in App.jsx: the ticket's × button no longer deletes directly, it sets `pendingDelete`, and this modal's confirm action calls `removeItem`. Reuse this pattern for any other destructive action instead of adding a new bespoke confirm dialog.
- `ConfirmModal/` — generic version of the same accidental-tap guard, for non-destructive but disruptive actions (e.g. sign out), gated by a `tone` prop instead of delete-specific copy/styling.
- `AuthScreen/` — sign in / sign up screen.
- `Settings/` — settings modal, opened via `AccountMenu`'s "Settings" item. Change display name and avatar (picked file is downscaled/compressed client-side to a JPEG data URI, no storage bucket — see `useProfile.js`), plus its own sign out button (same `pendingSignOut` + `ConfirmModal` hand-off `AccountMenu`'s "Log out" item also uses — left in place as a second path to it, not a second confirm guard).
- `AccountMenu/` — account control: an ornate fantasy sword driven tip-first into the top-right corner of the `ListSwitcher` ("Your lists") card, positioned by App.jsx's `.list-switcher-wrap`. At rest only the hilt shows above the card (gold pommel with a glowing cyan gem, leather-wrapped grip showing the display name, winged gold crossguard with a matching gem) — the blade is collapsed to nothing, as if buried in the card. Hovering/tapping the hilt draws the silver blade up out of the card (tip leaves last), revealing, base to tip: the avatar, "Settings" (opens the `Settings` modal above), then "Log out". Replaced an earlier plain gold-bookmark-tab version of this same control (which itself replaced the old flat `account-chip` button that used to sit in the header and open `Settings` directly).
- `ListSwitcher/` — switch between personal/shared lists, join-by-code UI.
- `SearchBox/` — TMDB title search input + results dropdown. Presentational; the debounced fetch lives in App.jsx.
- `AddItemForm/` — manual "add to queue" form (title/type/year/genre).
- `FilterBar/` — type/status/genre filter pills above the ticket grid.
- `TicketCard/` — one cinema-ticket card in the grid; registers itself into App.jsx's `ticketRefs` map for the FLIP reorder animation there.

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

## Architecture changelog

Log structural changes here (moved/renamed files, new folders/conventions) — not feature changes, those are in git history. Newest first.

- 2026-08-26 — Added `api/` as a new top-level folder: `api/uaserials-search.js` is a Vercel serverless function (auto-deployed from `/api`, no framework change needed — still plain Vite, not Next.js). It's a server-side proxy for DetailModal's "Watch on UASerials" button: uaserials.com sends no CORS headers, so the browser can't fetch+parse its search page itself to find the exact-matching title; this function does that fetch server-to-server instead and returns just the matched item's URL. This is the first non-Supabase backend code in the project — if more server-side proxying is ever needed, put it alongside this file in `api/`, one file per endpoint (Vercel maps each file under `api/` to its own function, no router needed).
- 2026-08-26 — Added `src/components/AccountMenu/` (gold bookmark-tab control that rises to reveal avatar/name + Settings + Log out on hover/tap) and removed the `.account-bar`/`.account-chip*`/`.account-avatar*`/`.account-name` rules it replaced from `App.css`. It's no longer part of the header — it's positioned via App.jsx's `.list-switcher-wrap` (`position: relative`) flush against the top-right corner of the `ListSwitcher` ("Your lists") card, not the header row. `Settings/` is now opened from `AccountMenu`'s "Settings" item instead of a click on the old chip; `Settings`' own sign-out button is unchanged and still works, so sign-out has two entry points sharing the same `pendingSignOut` + `ConfirmModal` guard.
- 2026-08-26 — Added `src/components/Settings/` (avatar/name/sign-out modal) + `src/useProfile.js` (its data hook) + `profiles.avatar_url` column (schema.sql). Avatars are stored as client-side-downscaled JPEG data URIs directly in `profiles.avatar_url`, deliberately kept off auth `user_metadata` (unlike `display_name`) since that gets embedded in every JWT.
- 2026-08-26 — Moved each `src/components/*` file pair into its own folder (`src/components/<Name>/<Name>.jsx` + `.css`), so a component's own files are the only two files in its folder. Added the File map above. When adding a new component, follow this pattern: create `src/components/<Name>/<Name>.jsx` + `<Name>.css`, import as `./components/<Name>/<Name>` from App.jsx.
- 2026-08-26 — Split up the two largest files so each can be read in part instead of whole:
  - `App.jsx` (788 → 563 lines): pulled pure logic out into `src/constants.js`, `src/itemsStorage.js`, `src/tmdbResults.js`; extracted four new presentational components — `SearchBox/`, `AddItemForm/`, `FilterBar/`, `TicketCard/` — with their CSS moved out of `App.css` into each one's own `.css` (App.css keeps only the app-shell/layout rules that are still in App.jsx: `.queue-app`, header, `.empty-state`, `.ticket-grid` container).
  - `DetailModal.jsx` (608 → 482 lines): pulled the author-color palette logic out into `src/noteAuthorColors.js` and the TMDB-details fetch hook into `src/useTmdbDetails.js` (JSX itself wasn't split further — it's tightly coupled to the poster-zoom/notes-panel state machines in DetailModal, splitting it would add prop-drilling risk for little gain).