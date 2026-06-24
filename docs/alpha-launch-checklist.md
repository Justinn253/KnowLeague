# KnowLeague Alpha Launch Checklist

Last updated: June 24, 2026.

## Required External Tasks

- Register KnowLeague in the Riot Developer Portal and request the correct production product status before public launch.
- Add the production `RIOT_API_KEY`, Supabase URL/anon key/service-role key, and rate-limit settings to the hosting provider environment.
- Apply all Supabase migrations to production, including `026_private_profile_details.sql`.
- Review `/privacy` and `/terms` with counsel before monetization or broad public launch.
- Confirm the global footer Riot disclaimer is visible on production pages.
- Configure hosting-level rate limits, WAF/bot protection, and alerting. The in-app limiter is an alpha guard, not a distributed abuse-control system.
- Configure production monitoring/log collection for structured `console.*` JSON events. Suggested alert events:
  - `riot_account_viewer_rate_limited`
  - `riot_account_suggestions_rate_limited`
  - `riot_account_viewer_error`
- Confirm Riot account lookup, search suggestions, login, profile, friends, contact, and multiplayer flows against production Supabase.
- Run `npm run check` before deploy. Run `npm run build` only when no local `next dev` process is active.

## Riot Policy Notes

- Keep a free tier if ads, subscriptions, cosmetics, or paid upgrades are added.
- Do not imply Riot endorsement.
- Do not sell raw Riot API access as the paid product.
- Do not add gambling, betting, or cash-out mechanics.
- Do not market any feature as a hidden MMR, ELO, or official skill ranking alternative.
- Submit product changes for Riot audit when features materially change.

## Cost Watchpoints

- Riot API quota and user-facing rate-limit errors.
- Hosting/serverless invocations from Riot lookups and multiplayer polling/actions.
- Supabase database, auth, realtime, and service-role API usage.
- Image optimization/bandwidth for Data Dragon and CommunityDragon assets.
- Abuse traffic against public endpoints.

## Post-Launch Metrics

- Daily active users and repeat account searches.
- Riot account lookup success/error/rate-limit rates.
- Average response time for `/api/riot-account/viewer`.
- Supabase row growth for lobbies, messages, searches, and profile metrics.
- Conversion from shared Riot viewer links to new sessions.
