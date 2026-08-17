# Production readiness runbook

This document separates safeguards implemented in the repository from controls that require a hosting, Supabase, monitoring, or staging environment.

## Implemented in the repository

- `.github/workflows/ci.yml` runs `npm ci`, `npm run check`, and `npm run build` on pull requests and pushes to the default branch.
- `GET /api/health` is a dependency-free liveness probe. It returns `200` only when the application process can serve a route and is deliberately exempt from API rate limiting.
- `GET /api/health/ready` is a readiness probe. It checks required Supabase configuration, a service-role Supabase query, and shared Redis rate-limit configuration when production requires it. It returns `503` without exposing secret names or provider errors.
- `next.config.mjs` adds baseline security headers, including clickjacking protection, MIME sniffing protection, referrer policy, a restricted permissions policy, and a minimal CSP. Camera access remains allowed because Riftbound scanning uses `getUserMedia`.

Configure an uptime monitor against `/api/health` and alert on any non-2xx response. Configure deployment or dependency monitors against `/api/health/ready`; a readiness failure should page only when it persists beyond the normal provider recovery window.

## CI and deployment setup

1. Push the workflow and confirm the repository's default branch is `main` or `master`. If it uses another branch, add it to the workflow trigger.
2. Require the CI check to pass before merging through the GitHub branch protection settings.
3. Configure the hosting provider to deploy only from the protected default branch.
4. Keep production secrets in the hosting provider, never in GitHub Actions logs or repository variables unless a workflow genuinely needs them.
5. After the first CI build, review the generated bundle and verify that the placeholder CI environment cannot reach a real Supabase or Riot project.

## Error tracking and alerting

This repository emits structured server events through `lib/server-log.ts`, but it does not select or configure an error-tracking vendor. Choose one provider and configure it in the hosting environment:

1. Create separate staging and production projects.
2. Install the provider's Next.js SDK using the provider's official setup wizard.
3. Capture server exceptions, route status codes, deployment failures, and unhandled browser errors.
4. Scrub authorization headers, request bodies, query values, IP addresses, user IDs, Riot IDs, Discord values, and raw dynamic identifiers before events leave the application.
5. Alert on sustained 5xx responses, Supabase/Redis dependency failures, Riot upstream failures, Realtime disconnect spikes, cron failures, and authentication failures.
6. Use `/api/health` for liveness and `/api/health/ready` for dependency readiness rather than treating ordinary 4xx responses as outages.

## Browser end-to-end testing

The repository currently has unit/component tests but no browser test runner. Add Playwright in a separate change:

1. Create a staging Supabase project with test-only accounts and test data.
2. Install `@playwright/test` and the required browser binaries as development dependencies.
3. Add tests for signup/login/logout, password reset, public/private profiles, friend requests/messages, Riftbound inventory and decks, community reporting, and multiplayer reconnect behavior.
4. Run those tests against a preview deployment or a dedicated local server with isolated data. Never point destructive tests at production.
5. Run a small smoke suite on every deployment and the full suite on pull requests or nightly.

## Load and capacity testing

Load tests require an approved staging target and realistic quotas. Do not benchmark production with synthetic traffic.

1. Measure baseline throughput and p95/p99 latency for `/api/health`, public profiles, Riftbound reads, Riot viewer requests, authenticated profile reads, and multiplayer heartbeat/command routes.
2. Test burst traffic, concurrent authenticated sessions, Realtime connection counts, lobby event storms, Redis rate-limit failures, Supabase connection saturation, and Riot rate-limit responses.
3. Use k6, Artillery, or an equivalent tool from a controlled runner. Keep test identities and payloads synthetic.
4. Establish thresholds before increasing traffic: error rate, p95 latency, database CPU/connection usage, Realtime peak connections/messages, Redis latency, and Riot quota consumption.
5. Repeat after major schema, caching, Realtime, or multiplayer changes.

## Backups and restore drills

Backups cannot be validated from this repository alone.

1. Enable the Supabase backup/PITR option appropriate for the production risk and budget.
2. Restore a recent backup into a separate recovery project; never overwrite production during a drill.
3. Apply the repository migrations to the recovery project and verify RLS, function privileges, storage policies, cron jobs, and Realtime publication settings.
4. Run `npm run check` and the production smoke suite against the recovery project.
5. Record the recovery point, recovery time, missing external integrations, and the owner responsible for resuming traffic.
6. Repeat quarterly and after major schema changes.

## Administrative MFA and step-up authentication

Admin and moderator authorization currently uses configured user IDs/emails plus database roles. Provider MFA must be enabled separately, and the application still needs to enforce an MFA assurance level before privileged mutations.

1. Enable TOTP MFA in the Supabase Auth settings and enroll every administrator and moderator.
2. Require MFA enrollment for privileged accounts; do not rely on an administrator remembering to enable it.
3. Add a server-side privileged-request guard that validates the authenticated token with Supabase and requires the provider's elevated assurance level before role changes, bans, account unlinking, stat resets, and moderation mutations.
4. Return `403` for an authenticated account that has not completed the required step-up flow.
5. Log the action type, actor role, target category, result, and request ID without storing tokens or private profile values.
6. Test recovery codes, lost-device recovery, role removal, session revocation, and simultaneous admin sessions.

## Account deletion, export, and user-generated data controls

These require product and legal decisions before implementation:

- Define what account deletion removes immediately, what must be retained for abuse/legal reasons, and how linked Discord/Riot data and storage objects are disconnected.
- Add a reauthenticated account-deletion flow with a confirmation phrase, idempotency key, audit record, storage cleanup, and a delayed recovery window if desired.
- Add a data-export job that produces only the requesting user's data and expires the download link.
- Set quotas and lifecycle rules for decks, binders, posts, comments, messages, reports, uploads, and share snapshots.
- Add moderation escalation and abuse-rate limits around user-generated content before increasing public traffic.

## Official provider references

- [Supabase MFA](https://supabase.com/docs/guides/auth/auth-mfa)
- [Supabase TOTP enrollment](https://supabase.com/docs/guides/auth/auth-mfa/totp)
- [Supabase database backups and PITR](https://supabase.com/docs/guides/platform/backups)
- [Supabase restore to a new project](https://supabase.com/docs/guides/platform/clone-project)
