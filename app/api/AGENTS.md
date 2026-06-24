# API Route Guidance

## Conventions
- Validate and normalize all request input at the route/domain boundary.
- Return consistent JSON errors through existing API utilities.
- Authenticate protected routes from bearer tokens; never trust user IDs supplied only by the client.
- Use the Supabase service client only in server code and keep authorization checks explicit.
- Keep route handlers thin. Put multi-step domain behavior in `lib/`.
- Preserve idempotency where reconnects, Realtime events, or retries can repeat requests.

## Feature Routing
- `friends/*`: authenticated friendship, request, and direct-message operations.
- `skincognito/*`: lobby commands and reads; authoritative rules live in `lib/skincognito.ts`.
- `multiplayer/lobbies/*`: shared Ability Blitz and Skin Champion lobby commands; rules live in `lib/multiplayer-quiz.ts`.
- `contact`: records feedback with authenticated profile context when available.
- Quiz-data routes should read generated local catalogues.

## Verification
- Run `npm run check` after route changes.
- Test both authenticated and guest/error paths when applicable.
