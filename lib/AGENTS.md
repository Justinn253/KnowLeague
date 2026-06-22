# Library Guidance

## Ownership
- `skincognito.ts`: authoritative multiplayer lobby state and Supabase persistence.
- `multiplayer-quiz.ts`: shared lobby, race progress, heartbeat, and completion state for competitive quiz modes.
- `multiplayer-lifecycle.ts`: cross-game presence timing, ordered host succession, and empty-lobby termination rules.
- `friends.ts`: friendship, requests, messages, unread state, and profile eligibility.
- `game-storage.ts`: browser persistence, anonymous client IDs, daily state, and personal stats.
- `catalogs.ts`: generated local quiz catalogue access.
- `supabaseClient.ts`: browser and server Supabase client construction.
- `riot.ts`: legacy dynamic Riot helpers; do not use for new runtime quiz loading.

## Conventions
- Keep domain functions typed and deterministic where possible.
- Put authorization and invariant checks close to state mutations.
- Prefer structured data operations over ad hoc string parsing.
- Treat browser storage as convenience state, not authoritative multiplayer/account state.
- Do not import server-only secrets or service clients into client bundles.
- For Skincognito lifecycle changes, inspect create, join, leave, reconcile, heartbeat, and client Realtime handling together.

## Verification
- Run `npm run check` after library changes.
- Add targeted tests when extracting pure domain logic; the project currently has no general test runner.
