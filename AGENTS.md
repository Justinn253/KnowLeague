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
- `app/page.tsx` renders the main game screen.
- `app/layout.tsx` defines root metadata and global CSS import.
- `app/globals.css` contains Tailwind layers, global dark styling, and local animations.
- `components/game-screen.tsx` contains the main client-side quiz flow and UI state.
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
- Some rendered text in `components/game-screen.tsx` appears mojibake-encoded; preserve behavior but fix encoding if editing nearby copy.

## Verification
- Run `npx tsc --noEmit --incremental false` after TypeScript changes.
- Run `npm run lint` after frontend or TypeScript changes.
- Run `npm run build` for route, data-fetching, or production behavior changes.
