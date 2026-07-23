# Cloudflare and Resend cost boundary

## Keep the edge simple

Cloudflare is optional infrastructure around the Vercel application, not a second application runtime. Use its Free DNS/CDN plan, proxying, WAF rules, and Turnstile when they are useful. Do not add a Cloudflare Worker, Worker KV, Durable Object, or R2 bucket for the current architecture.

The app has no Worker route, Worker binding, R2 integration, or cross-provider request hop. Vercel remains responsible for Next.js rendering and API routes; Supabase remains responsible for Auth, Postgres, Realtime, and storage.

Consider a Cloudflare Worker only after measurement shows a specific edge-only requirement that Vercel Firewall, Vercel's CDN, and the application cannot provide: for example, a sustained abusive traffic pattern that needs custom pre-origin logic or a proven regional routing need. Cloudflare Workers Paid has a minimum $5 monthly charge, so a Worker must replace a measured cost or reliability problem rather than duplicate the current stack.

Consider R2 only when the product has a demonstrated object-storage workload that Supabase Storage and the existing image/CDN controls cannot serve economically. Generated quiz data, API responses, and small configuration values are not reasons to introduce it.

## Authentication email controls

All routes that can cause a Supabase Auth email use `enforceEmailDeliveryProtection`:

- signup confirmation, including retries for an unconfirmed account;
- explicit signup-email resend;
- unauthenticated password reset; and
- authenticated password reset from the profile screen.

The shared normalized-email bucket means changing routes does not bypass a prior send. It applies these limits before sending:

| Scope | Per destination email | Per IP |
| --- | --- | --- |
| Cooldown | 1 email / 60 seconds | 5 attempts / 60 seconds |
| Sustained | 3 emails / hour | 10 attempts / hour |

The UI mirrors the 60-second cooldown and disables the resend/reset action while it runs. The server remains authoritative: it returns `429` and `Retry-After` for repeated, direct, or scripted requests.

These controls are globally reliable only when the existing Upstash/Vercel KV Redis configuration is present with `RATE_LIMIT_REQUIRE_SHARED=true`; see [abuse-controls.md](./abuse-controls.md). They intentionally count an accepted delivery attempt before calling Supabase Auth, which prevents concurrent retries from producing duplicate messages.

## Resend monitoring

KnowLeague sends transactional account messages through Supabase Auth. If Supabase Auth is configured with Resend SMTP, the same safeguards protect the Resend quota; the application does not need the Resend API or another email service layer.

Before launch, configure verified sender DNS in the email provider, then review daily email delivery counts and failures. Alert at 80 emails/day and 2,400 emails/month while on Resend Free, leaving room beneath the 100-email/day and 3,000-email/month limits. Move to Pro only after sustained legitimate traffic requires it, not in anticipation of it.

References: [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) and [Resend transactional pricing](https://resend.com/docs/knowledge-base/what-is-resend-pricing).
