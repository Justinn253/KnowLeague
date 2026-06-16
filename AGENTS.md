# AGENTS.md

## Project
- League of Legends quiz app built with Next.js 14 App Router, React 18, TypeScript, Tailwind CSS, lucide-react, and Supabase.
- Use npm; this repo has `package-lock.json`.

## Commands
- Install: `npm install`
- Dev server: `npm run dev`
- Production build: `npm run build`
- Start built app: `npm run start`
- Type check: `npx tsc --noEmit --incremental false`
- Lint: `npm run lint`

## Structure
- `app/page.tsx` renders the KnowLeague landing page and game-mode navigation.
- `app/ability-blitz/page.tsx` renders the playable Ability Blitz game.
- `app/speed-blitz/page.tsx` redirects legacy links to Ability Blitz.
- `app/mastery-master/page.tsx` and `app/skin-champion/page.tsx` are placeholder routes for future games.
- `app/layout.tsx` defines root metadata and global CSS import.
- `app/globals.css` contains Tailwind layers, global dark styling, and local animations.
- `components/ability-blitz.tsx` contains the Ability Blitz client-side quiz flow and UI state.
- `components/coming-soon-game.tsx` contains shared placeholder page UI for future game modes.
- `components/feature-card.tsx` is a small reusable card component.
- `app/api/ddragon/quiz-items/route.ts` builds the daily quiz set.
- `app/api/ddragon/quiz-answers/route.ts` builds answer/autocomplete data.
- `lib/riot.ts` fetches and transforms Riot Data Dragon champion/ability data.
- `lib/supabaseClient.ts` creates the Supabase client and leaderboard helper.
- `data/daily-sets/` contains static daily set JSON samples.

## Conventions
- Treat the codebase as a small project with enterprise-level standards: keep code clean, readable, maintainable, typed, and easy to extend.
- Keep changes small and aligned with the existing App Router layout.
- Prefer TypeScript types over `any` when touching Data Dragon parsing code.
- Use the `@/components/*` and `@/lib/*` path aliases from `tsconfig.json`.
- Match the existing Tailwind-heavy styling unless explicitly redesigning the UI.
- Preserve the dark League quiz interface and existing game flow unless the task asks otherwise.

## Fragile Areas
- Data Dragon version is hardcoded in `lib/riot.ts`.
- `getSampleQuizItems()` may fetch every champion individually, which can be slow and noisy.
- `lib/riot.ts` contains debug logging and broad `any` casts.
- Supabase env vars default to empty strings; code using Supabase should validate configuration before relying on it.
- The README lists planned features beyond what is fully implemented in the current UI.
- Keep game-mode names, route names, and navigation labels consistent when adding or renaming games.
- Current playable mode naming is `Ability Blitz`; keep legacy `/speed-blitz` links redirected rather than duplicated.

## Verification
- Run `npx tsc --noEmit --incremental false` after TypeScript changes.
- Run `npm run lint` after frontend or TypeScript changes.
- Run `npm run build` for route, data-fetching, or production behavior changes.

## App Direction and Structure
- Description: KnowLeague is primarily a Quiz/Guessing Game website that will focus on solo quizzes and Player-vs-Player
- Main landing page: Focal spot where users land and can choose which game to play
- General game page: One of many game screens the user will land on. Keep the design consistent but relevant to the game
- Leaderboards page: Tracks the highest scores for the daily quizzes
- Potential ad integration?
- Login and accounts
