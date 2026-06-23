# MatheLäufer

A kid-friendly German multiplication-tables ("Einmaleins") racing game. The
runner advances between checkpoints; at each stop you answer a multiplication
question. Fast, correct answers add speed; wrong answers brake the runner.
Race times are saved to a Supabase-backed leaderboard (with a localStorage
fallback).

## Tech stack

- **Next.js 15** (App Router) + **React 19**
- Plain CSS (`src/App.css`)
- **Supabase** REST API for the shared leaderboard (anon key, client-side)
- **Vitest** + Testing Library for unit tests
- **Playwright** for end-to-end tests

The game itself is a fully client-side experience. It is rendered client-only
(`src/app/page.jsx` imports the app via `next/dynamic` with `ssr: false`)
because it relies on browser timers, `localStorage`, and `requestAnimationFrame`.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase project values
npm run dev                  # http://localhost:3000
```

### Environment variables

The leaderboard talks to Supabase using public (`NEXT_PUBLIC_`) variables, read
at build time. Without them the app falls back to a local-only leaderboard.

| Variable | Description |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public API key |

The leaderboard table schema lives in `supabase-leaderboard.sql` (idempotent).

## Authentication (optional)

Login is optional. A button in the lower-right corner lets a player sign in with
a **username + password**; while logged in, that username is used automatically
for leaderboard entries. Logged-out players type a name as before.

Supabase Auth is email-based, so each username is mapped to a stable synthetic
email under the hood (the display username is stored in the user's metadata).

Two one-time setup steps in your Supabase project:

1. **Run `supabase-auth.sql`** in the Supabase SQL editor. It creates a
   `public.profiles` table (the public username registry, enforcing uniqueness)
   with RLS and a trigger that fills it from sign-up metadata.
2. **Turn off email confirmation** (required, since the synthetic emails can
   never be confirmed): Dashboard → Authentication → Sign In / Providers →
   Email → disable **Confirm email**.

Note: this ties the *display name* to a login; it does not yet make the
leaderboard tamper-proof (scores are still written with the public anon key).
Server-enforced, account-locked scores (RLS + a column linking entries to the
user) are a planned follow-up.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm test` | Run the Vitest unit suite once |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:e2e` | Build, serve, and run the Playwright E2E suite |

E2E tests run against a production build and use the system-installed Google
Chrome (`channel: 'chrome'`), so no Playwright browser download is required.

## Project structure

```
src/
  app/
    layout.jsx        # root layout (html lang, metadata, global CSS)
    page.jsx          # client-only entry that renders <App/>
  App.jsx             # the game (client component)
  App.css             # all styles
  components/         # Runner, StatusPill, ConfettiBurst, DifficultyPanel, AuthControl
  lib/
    engine.js         # pure game/math logic (no React, no DOM)
    leaderboard.js    # ranking + Supabase/localStorage persistence
    auth.js           # pure auth helpers (username <-> synthetic email, validation)
    supabaseClient.js # singleton Supabase client (auth)
    useSupabaseAuth.js# auth session hook (sign up / in / out)
e2e/                  # Playwright specs
```

Unit tests are co-located with the modules they cover (`*.test.js[x]`).
