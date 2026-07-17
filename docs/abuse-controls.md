# Abuse-control deployment runbook

The application enforces rate limits for expensive API routes with Upstash Redis or Vercel KV's REST-compatible environment variables. Every protected request receives an IP bucket; authenticated mutations also receive a user bucket, and guest lobby/chat actions use their generated client ID as a secondary bucket. Identifiers are hashed before reaching Redis.

## Required production environment

Create a regional Upstash Redis database (or attach Vercel KV) and configure the following in Vercel for Production, Preview, and any staging environments that exercise these routes:

```text
UPSTASH_REDIS_REST_URL=<Redis REST URL>
UPSTASH_REDIS_REST_TOKEN=<Redis REST token>
RATE_LIMIT_KEY_SALT=<long random secret>
RATE_LIMIT_REQUIRE_SHARED=true
```

`RATE_LIMIT_REQUIRE_SHARED=true` is the production fail-closed switch. Without it, the app deliberately falls back to an in-memory limiter for local development and staged rollout; that fallback is not safe as a global serverless limit.

Apply the accompanying Supabase migration before deploying this code. It replaces signup's paginated Auth-user scan with a service-role-only single-row lookup.

## Turnstile and Supabase Auth

Create a Turnstile widget restricted to the production hostname(s), then add:

```text
NEXT_PUBLIC_TURNSTILE_SITE_KEY=<widget site key>
TURNSTILE_SECRET_KEY=<widget secret key>
```

The application renders the widget for signup and password-reset/email-resend flows and verifies every token at Cloudflare Siteverify before it touches Supabase Auth. Configure the same CAPTCHA provider in Supabase Auth as well; this protects Supabase's public Auth endpoints from callers that bypass the KnowLeague UI.

Authentication email sends also share a 60-second per-email cooldown plus per-email and per-IP hourly limits. This guard covers initial signup confirmation, resends, and both password-reset paths. See `docs/cloudflare-resend.md` for the exact limits and Resend monitoring threshold.

Never expose `TURNSTILE_SECRET_KEY`, the Redis token, or the rate-limit salt to the browser.

## Upstream WAF rules

Application limits protect logical users; an upstream WAF prevents abusive requests from invoking a Vercel function at all. Configure the rules below in the active edge provider. If the app is directly served by Vercel, use Vercel Firewall. If Cloudflare proxies the production domain, place equivalent Cloudflare WAF Rate Limiting rules in front of the origin. Start rules in log/simulate mode, review legitimate traffic, then switch to rate limit/challenge.

| Paths | Method | Suggested IP limit | Action |
| --- | --- | --- | --- |
| `/api/riot-account/*` | GET | 30 / minute | Rate limit (429) |
| `/api/auth/*` | POST | 10 / 15 minutes | Challenge, then rate limit |
| `/api/multiplayer/lobbies`, `/api/skincognito/lobbies`, `/api/carving-revelation/lobbies`, `/api/category-clash/lobbies` and their `/join` paths | POST | 30 / minute | Rate limit (429) |
| `*/chat`, `/api/friends/messages` | POST | 60 / minute | Rate limit (429) |
| `/api/profile/public/*`, `/api/*/leaderboard` | GET | 120 / minute | Rate limit (429) |

Vercel Firewall rules run before the function, so blocked traffic avoids function and Supabase usage. Its rate-limit rules can be scoped by request path and IP; review the [Vercel WAF rate-limiting guide](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting) when entering the rules. Turnstile tokens must be validated server-side and are single-use, short-lived credentials; see [Cloudflare's validation documentation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).

## Monitoring

- Enable Upstash Rate Limit analytics only after establishing a usage baseline; it adds Redis commands per request.
- Alert on spikes in `429`, `403`, and `503` responses for protected API paths.
- Review WAF logs after rule changes and allowlist known monitoring services only when needed.
- Rotate Redis and Turnstile secrets if they are exposed.
