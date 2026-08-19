# KnowLeague Architecture Index

Use this file to route cross-cutting work. For narrow changes, start with the owning file and its nearest `AGENTS.md`.

## Application Shell
- `app/layout.tsx`: root metadata, global CSS, and global actions.
- `app/page.tsx`: default landing page for the Games, League Account Viewer, and Riftbound sections.
- `app/games/page.tsx`, `components/games-home.tsx`: game hub and game cards.
- `components/global-actions.tsx`: profile/public-profile/contact/friends overlay shell.

## Solo Games
| Feature | UI | API/Data | Persistence |
| --- | --- | --- | --- |
| Ability Blitz | `components/ability-blitz.tsx` | `app/api/ability-blitz`, `lib/catalogs.ts` | `lib/game-storage.ts` |
| Skin Champion | `components/skin-champion.tsx` | `app/api/skin-champion`, `lib/catalogs.ts` | `lib/game-storage.ts` |
| Skindle | `components/skindle.tsx` | `app/api/skindle`, skin metadata catalogues | local daily state + Supabase stats |

### Game families

The games are organized by gameplay responsibility rather than by visual similarity. `lib/game-families.ts` is the route-level registry used by game navigation and future shared infrastructure.

- `solo-quiz`: Ability Blitz and Skin Champion share difficulty rules, round-state shape, item selection, prematch behavior, persistence, scoring, and optional multiplayer race support. Their answer presentation and game-specific modifiers remain separate.
- `daily-guess`: Skindle owns deterministic daily targeting, progressive guess comparison, personal statistics, and daily completion behavior.
- `splash-puzzle`: Splash Scramble owns tile reconstruction, puzzle controls, deterministic daily targeting, and puzzle-specific persistence/statistics.
- `multiplayer-session`: Skincognito, Carving Revelation, and Category Clash share lobby, presence, reconnect, host, chat, moderation, and result-recording contracts while retaining distinct rules engines.
- `standalone`: Mastery Master remains isolated until its gameplay contracts justify a shared family.

The first shared solo-quiz contract lives in `lib/solo-quiz.ts`. It centralizes difficulty rules, entry-count options, game definitions, and the persisted round-state shape without changing existing storage keys, routes, seeds, or game behavior.

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
- An active player who disconnects has a server-authoritative 60-second reconnect window. The lobby code stored in the browser is only a pointer used to request eligibility; the server decides whether rejoin is allowed and preserves game progress.
- Spectators do not receive reconnect windows. If no active players remain, terminate immediately. When a reconnect window expires, resolve that player as disconnected and finish the match when only one active player remains.
- Multiplayer create/join screens must show an eligible rejoin action above public discovery and active game views must display the reconnect deadline for disconnected players.
- Multiplayer lobby screens must keep header and lobby-code chrome consistent with the shared quiz lobby: the header shows back, game title/subtitle, info, and a status pill; lobby codes belong in the centered code strip with hidden-by-default reveal/hide and copy controls, not in the header.
- Public lobby visibility is an immediate server-authoritative toggle. It must not be treated as a draft setting that waits for an Apply Changes action.
- All game screens must render player disconnects with `MultiplayerDisconnectStatus` from `components/multiplayer-reconnect.tsx`. The shared component owns disconnect/expired icons, wording, timers, and visual states; do not recreate or override them per game.
- Creating or joining a different multiplayer lobby forfeits outstanding reconnect windows across every game mode and publishes a realtime lobby event so remaining players see the result immediately.
- A browser authentication identity change (login, logout, or replacement by a newer account session) is an immediate hard leave, not a reconnectable disconnect. Every multiplayer client must use `useMultiplayerAuthTransition` and call its leave route with `forfeit: true` so roster removal and empty-lobby termination remain server-authoritative.
- Public discovery is manual-refresh and bounded. Joined-lobby state changes use scoped Realtime events.
- Games with difficulty settings must use `components/difficulty-style.tsx` for tier names, colors, and selected states. Public lobby entries must show the styled difficulty and every enabled modifier by display name.
- Multiplayer lobby configuration uses `GameSettingsSection` for collapsible setting groups. Difficulty opens by default; modifiers and game-specific groups open on demand. Future settings must use the same component rather than extending the page vertically with always-open panels.
- Ability Blitz multiplayer stores selected ability slots on the lobby, exposes them in public discovery, and filters the catalog server-side before randomization so every player receives the same eligible set.
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
