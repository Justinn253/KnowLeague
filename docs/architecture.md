# KnowLeague Architecture Index

Use this file to route cross-cutting work. For narrow changes, start with the owning file and its nearest `AGENTS.md`.

## Application Shell
- `app/layout.tsx`: root metadata, global CSS, and global actions.
- `app/page.tsx`: game hub and game cards.
- `components/global-actions.tsx`: profile/public-profile/contact/friends overlay shell.

## Solo Games
| Feature | UI | API/Data | Persistence |
| --- | --- | --- | --- |
| Ability Blitz | `components/ability-blitz.tsx` | `app/api/ability-blitz`, `lib/catalogs.ts` | `lib/game-storage.ts` |
| Skin Champion | `components/skin-champion.tsx` | `app/api/skin-champion`, `lib/catalogs.ts` | `lib/game-storage.ts` |
| Skindle | `components/skindle.tsx` | `app/api/skindle`, skin metadata catalogues | local daily state + Supabase stats |

## Multiplayer
- UI and Realtime subscriptions: `components/skincognito.tsx`.
- HTTP command routes: `app/api/skincognito/lobbies/*`.
- Authoritative lobby rules: `lib/skincognito.ts`.
- Schema/history: early Skincognito migrations plus later auth/friend refinements.
- Lobby state is server-authoritative. Local storage only supports client identity/preferences.
- Shared quiz lobby UI: `components/multiplayer-quiz-lobby.tsx`.
- Shared roster/social/host controls: `components/multiplayer-lobby-roster.tsx`, used by quiz lobbies and Skincognito.
- Shared quiz lobby routes/domain: `app/api/multiplayer/lobbies/*`, `lib/multiplayer-quiz.ts`.
- Multiplayer quiz pages: `app/multiplayer/ability-blitz` and `app/multiplayer/skin-champion`.
- Active races reuse `components/ability-blitz.tsx` and `components/skin-champion.tsx` through the runtime contract in `components/multiplayer-game-progress.tsx`.
- Multiplayer race state is server-authoritative for item order, monotonic progress, elapsed-time snapshots, connection state, and lobby completion.

### Multiplayer Session Contract
- Every multiplayer mode must use a server-authoritative lobby with a public/private visibility setting, roster section, and unique join code.
- Every non-terminated lobby with connected members has exactly one host. Host succession uses connected members in stable `joined_at` order.
- The host owns pre-match settings and lobby management. UI role labels must reflect the authoritative `host_player_id`.
- A lobby terminates when no connected members remain. Termination clears public visibility and active player references; stale clients return to the main game hub.
- Presence uses the shared timing constants and lifecycle resolver in `lib/multiplayer-lifecycle.ts`. Heartbeat intervals must remain comfortably below the stale threshold.
- Public discovery is manual-refresh and bounded. Joined-lobby state changes use scoped Realtime events.
- New multiplayer games must adopt this contract unless their documented game rules require a deliberate exception.

## Accounts and Social
- Authentication: `components/auth-screen.tsx`, reset-password component, Supabase Auth.
- Owner profile: `components/profile-screen.tsx`.
- Public profile: `components/public-profile-screen.tsx`.
- Friends UI/presence/messages: `components/friends-widget.tsx`.
- Friend API/domain: `app/api/friends/*`, `lib/friends.ts`.
- Profile/friend schema: migrations `008` through `014`.

## Contact
- UI: `components/contact-us-widget.tsx`.
- API/domain: `app/api/contact/route.ts`, `lib/contact.ts`.
- Schema: contact submission migrations.

## Generated Data
- Generator: `scripts/generate-catalogs.mjs`.
- Runtime catalogues: `data/catalogs/*.json`.
- Release-date overrides: `data/catalogs/skin-release-dates.json`.
- Generated JSON is large; search it narrowly and do not load it for unrelated work.

## High-Cost Files
- `components/skincognito.tsx`, `ability-blitz.tsx`, `skin-champion.tsx`, and `skindle.tsx` are large stateful components.
- `lib/skincognito.ts` is a large server domain module.
- Use `rg` to locate handlers/types and read focused ranges before deciding whether a broader refactor is needed.

## Product Direction
- KnowLeague is a League of Legends quiz and guessing-game platform with solo and multiplayer modes.
- Planned areas include richer profiles, personal/global stats, leaderboards, social features, and eventual monetization.
- Treat planned features as context, not implemented contracts.
