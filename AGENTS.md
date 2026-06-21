# KnowLeague Agent Guide

## Project
- Next.js 14 App Router, React 18, TypeScript, Tailwind CSS, lucide-react, and Supabase.
- Use npm and preserve `package-lock.json`.
- Write clean, readable, maintainable code to enterprise application standards, even for small changes.

## Commands
- Install: `npm install`
- Develop: `npm run dev`
- Lint: `npm run lint`
- Type-check: `npm run typecheck`
- Standard verification: `npm run check`
- Generate Riot/CommunityDragon catalogues: `npm run data:generate`
- Production build: `npm run build`

## Verification Safety
- Do not run `npm run build` while the user's dev server is running. Both use `.next`, and concurrent use can invalidate dev chunks.
- For normal edits, use `npm run check`.
- Run a production build only when explicitly requested or after confirming the dev server is stopped.
- Do not regenerate catalogues or push Supabase migrations unless the task requires it.

## Global Conventions
- Keep changes scoped and follow existing App Router and Tailwind patterns.
- Use TypeScript types and existing `@/components/*` and `@/lib/*` aliases.
- Preserve established game behavior and visual consistency unless the request changes it.
- Use generated local catalogues during gameplay; do not fetch full Riot or CommunityDragon datasets at runtime.
- Prefer existing shared helpers before adding another implementation.
- Treat multiplayer session behavior as a cross-game contract. Apply relevant lobby, presence, reconnect, moderation, discovery, and lifecycle changes to every multiplayer game unless a game-specific rule makes the behavior inappropriate.
- Do not expose service-role keys or other server secrets to client components.

## Context Routing
- UI and game components: read `components/AGENTS.md`.
- API routes: read `app/api/AGENTS.md`.
- Domain, storage, catalogue, and Supabase helpers: read `lib/AGENTS.md`.
- Database migrations: read `supabase/AGENTS.md`.
- For cross-feature work, consult `docs/architecture.md` first.
- Do not load generated JSON catalogues unless the task directly concerns their data.

## Fragile Contracts
- Current game name is Ability Blitz; `/speed-blitz` is a compatibility redirect.
- Skincognito spans client UI, API routes, `lib/skincognito.ts`, Realtime, and migrations. Trace the full flow before changing lobby lifecycle behavior.
- Profiles, friends, and contact submissions depend on Supabase RLS and authenticated/server-client boundaries.
- Data Dragon versions and generated catalogue freshness are explicit maintenance concerns, not runtime fetch decisions.
