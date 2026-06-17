# AGENTS.md

## Project
- League of Legends quiz app built with Next.js 14 App Router, React 18, TypeScript, Tailwind CSS, lucide-react, and Supabase.
- Use npm; this repo has `package-lock.json`.

## Commands
- Install: `npm install`
- Refresh generated Riot/CommunityDragon catalogues: `npm run data:generate`
- Dev server: `npm run dev`
- Production build: `npm run build`
- Start built app: `npm run start`
- Type check: `npx tsc --noEmit --incremental false`
- Lint: `npm run lint`

## Structure
- `app/page.tsx` renders the KnowLeague landing page and game-mode navigation.
- `app/ability-blitz/page.tsx` renders the playable Ability Blitz game.
- `app/speed-blitz/page.tsx` redirects legacy links to Ability Blitz.
- `app/mastery-master/page.tsx` is a placeholder route for a future game.
- `app/skin-champion/page.tsx` renders the playable Skin Champion game.
- `app/skindle/page.tsx` renders the playable Skindle category-comparison skin guessing game.
- `app/layout.tsx` defines root metadata and global CSS import.
- `app/globals.css` contains Tailwind layers, global dark styling, and local animations.
- `components/ability-blitz.tsx` contains the Ability Blitz client-side quiz flow and UI state.
- `components/skin-champion.tsx` contains the Skin Champion client-side skin quiz flow and UI state.
- `components/skindle.tsx` contains the Skindle client-side category comparison UI.
- `components/coming-soon-game.tsx` contains shared placeholder page UI for future game modes.
- `components/feature-card.tsx` is a small reusable card component.
- `app/api/ability-blitz/*` serves local generated ability quiz data.
- `app/api/skin-champion/*` serves local generated skin quiz data.
- `app/api/skindle/*` serves local generated skin metadata for Skindle.
- `app/api/ddragon/*` is a legacy compatibility wrapper for Ability Blitz data.
- `lib/catalogs.ts` reads generated local quiz catalogues.
- `lib/riot.ts` contains older dynamic Data Dragon helpers and should not be used for new runtime quiz fetches.
- `scripts/generate-catalogs.mjs` refreshes generated ability and skin catalogues.
- `data/catalogs/ability-items.json` and `data/catalogs/skin-items.json` are generated runtime catalogues.
- `data/catalogs/skin-release-dates.json` is an app-owned release-date override map merged into generated skin data.
- Skin catalogue records include available Skindle metadata from CommunityDragon: skin line, rarity, and champion role; gender and race are app-owned fields currently defaulting to `Unknown`.
- `lib/supabaseClient.ts` creates the Supabase client and leaderboard helper.
- `data/daily-sets/` contains static daily set JSON samples.

## Conventions
- Treat the codebase as a small project with enterprise-level standards: keep code clean, readable, maintainable, typed, and easy to extend.
- Keep changes small and aligned with the existing App Router layout.
- Prefer TypeScript types over `any` when touching Data Dragon parsing code.
- Use the `@/components/*` and `@/lib/*` path aliases from `tsconfig.json`.
- Match the existing Tailwind-heavy styling unless explicitly redesigning the UI.
- Preserve the dark League quiz interface and existing game flow unless the task asks otherwise.
- Prefer generated local catalogue reads for quiz runtime data; do not fetch full Riot/CommunityDragon catalogues during gameplay.

## Fragile Areas
- Data Dragon version is hardcoded in `scripts/generate-catalogs.mjs` and `lib/riot.ts`.
- Generated catalogue data can become stale after patches; run `npm run data:generate` when updating Riot data.
- Skin release dates are not exposed by Data Dragon or the CommunityDragon skin catalogue used here; populate `data/catalogs/skin-release-dates.json` from a trusted source before regenerating if release dates are needed.
- `getSampleQuizItems()` in the legacy dynamic Riot helper may fetch every champion individually, which can be slow and noisy.
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
