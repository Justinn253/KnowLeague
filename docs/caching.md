# Caching policy

KnowLeague caches data only when it is shared and safe to reuse. This keeps Vercel invocations and Supabase reads bounded without showing a player another user's state.

## Generated catalogues

`lib/catalogs.ts` constructs the Ability Blitz and Skin Champion catalogues, answer lists, typed answers, Skin Champion theme items, and Skincognito answer metadata once per running server instance. The source is generated data bundled with a deployment, so it does not require a database read or a Riot/CDN request during gameplay.

The public catalogue endpoints use this response policy:

```text
public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000
```

- Browsers reuse the response for one day.
- Vercel's CDN reuses it for seven days.
- A stale response may be served while the CDN refreshes it, which avoids a thundering herd after expiry.
- Deploying a catalogue refresh replaces the deployed route, so a new catalogue does not wait for the seven-day CDN lifetime.

This includes quiz answer lists, Skincognito metadata, and the static Skin/Champion catalogue used by Skindle. Difficulty and modifier definitions are TypeScript module constants shipped in the app's hashed JavaScript bundles; they do not create per-player API or database traffic.

## Daily and randomized quiz sets

Daily and chaos quiz responses are public only until the next UTC midnight. Their `max-age` and `s-maxage` are calculated from that reset and include `must-revalidate`. They deliberately do not use `stale-while-revalidate`, preventing yesterday's daily set from appearing after a reset.

Casual/random quiz routes remain `no-store`. Caching those would cause players to receive the same supposedly random sequence.

The Skindle daily target remains browser-private until the daily reset. Although it is deterministic, publishing it to a shared CDN cache would unnecessarily expose the answer to a direct game request.

## Public pages and dynamic state

The privacy and terms pages are statically rendered and revalidated daily. Public game pages without server-side player data remain statically rendered by Next.js; their player-specific content is loaded in the browser.

Keep `no-store` (or an equivalent private, request-specific policy) for:

- authentication, signup, password reset, and session data;
- profiles, friends, messages, moderation, and per-user progress;
- lobby membership, presence, multiplayer state, chat, and live scores;
- live Riot-account data, leaderboards, and any response whose value can change independently of a deployment or daily reset.

Do not add a global cache default. Every new endpoint needs an explicit decision based on whether its response is shared, immutable, daily deterministic, randomized, or user/live state.

## Live multiplayer synchronization

Live state is never CDN-cached. Instead, routine changes use small Realtime event payloads and local client merges:

- Ability Blitz and Skin Champion multiplayer progress updates only the changed player.
- Carving Revelation draw/guess submissions and next-round votes update safe status metadata only. Phase changes and power-ups retain full reads because the game deliberately applies player-specific visibility to carved areas and power-up effects.
- Category Clash answer submissions acknowledge locally; clients refresh when the phase changes rather than when each answer is entered.
- Category Clash and Skincognito chat append the returned/Realtime message by ID, without refetching the complete lobby.
- Friends chat loads a thread only on its first open after a reload or when its cached history has a gap. Incoming messages append to the cache, and read receipts are debounced separately.

Full lobby or thread reads remain the recovery path for joining, reconnecting, lifecycle changes, and an unknown/malformed event. The compact event path requires `073_lobby_event_payloads.sql`; deployments that have not applied it automatically use the recovery path.
