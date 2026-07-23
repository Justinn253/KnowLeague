# Infrastructure budget protection

## Initial monthly guardrail

Use an initial **$75 USD/month pre-tax infrastructure budget** for one production environment. This is a conservative alpha guardrail, not a forecast or a commitment to spend it.

| Component | Expected base | Guardrail |
| --- | ---: | --- |
| Vercel Pro | $20 | Limit on-demand usage to $15 and pause production at the limit. |
| Supabase Pro | $25 | Keep Spend Cap enabled; do not add paid compute, custom domains, PITR, replicas, or log drains without revising this budget. |
| Cloudflare DNS/CDN/WAF/Turnstile | $0 | Do not introduce Workers, R2, or paid products without a measured requirement and a budget review. |
| Resend transactional email | $0 | Stay on Free; the application limits delivery attempts before Supabase Auth sends an email. |
| Contingency | $30 | Covers small, explicitly approved changes; it is not an authorization to enable uncapped usage. |

The practical hard stop is lower than $75: Vercel can pause at $15 of on-demand usage, Supabase Spend Cap blocks covered overages, and Resend Free has no paid overage. Fixed or explicitly enabled Supabase add-ons are not protected by Supabase Spend Cap, so keep those disabled by default.

## Provider settings to activate

These are account-level controls and cannot be activated from the application repository. A team Owner or Billing administrator must complete this checklist before production launch.

### Vercel

1. Go to **Team Settings → Billing → Spend Management**.
2. Enable Spend Management with a **$15 USD** per-billing-cycle amount, replacing the default $200 amount.
3. Enable web and email notifications for every available threshold and enable SMS for the 100% threshold.
4. Enable **Pause all production deployments** at 100%. A pause intentionally returns `503 DEPLOYMENT_PAUSED` until an owner reviews and resumes the project.
5. Enable Vercel's usage-anomaly and error-anomaly notifications for the KnowLeague project.

Vercel natively notifies at 50%, 75%, and 100% of the configured spend amount. It does not have a native 90% spend notification, so the cross-provider 90% review below must be created in the team's calendar/alerting system.

### Supabase

1. Go to **Organization Billing → Cost Control**.
2. Confirm **Spend Cap is enabled** and leave it enabled.
3. Add the billing owner as the recipient for billing/quota notifications.
4. Bookmark the organization **Usage** page and **Upcoming Invoice** view for the review owner.
5. Do not enable paid compute changes, custom domains, PITR, log drains, replicas, or extra disk/throughput without first raising this document's budget and recording the reason.

Supabase Spend Cap covers disk, egress, Edge Function invocations, log usage, MAU, Realtime messages/peak connections, and storage usage. It deliberately does not provide per-metric or percentage budget alerts, and some opted-in add-ons are outside the cap. The scheduled cross-provider review is therefore required.

### Cloudflare

No action is needed while KnowLeague uses Cloudflare only for DNS/CDN/WAF/Turnstile. If a Worker is introduced, its pull request must include a measured reason, a cost estimate, and a CPU ceiling of **50 ms** by default:

```toml
[limits]
cpu_ms = 50
```

Also add a Cloudflare alert for the `exceededCpu` invocation outcome and revise the monthly budget before deploying the Worker. Do not raise the CPU limit without evidence that the intended work cannot fit within it.

### Resend

1. Keep the Resend Free plan until legitimate volume requires a paid plan.
2. Configure billing/quota email recipients and review the Email dashboard's sent, failed, bounced, and suppressed counts daily during launch.
3. Set external alerts/reminders at **80 emails/day** and **2,400 emails/month**. These leave room beneath the Free plan's 100/day and 3,000/month limits.
4. Do not add a second email API or provider merely to create alerts. KnowLeague sends through Supabase Auth; its shared server-side delivery limits remain the protection against duplicate messages.

## Monthly review and escalation

Record the current estimated total in the provider dashboards at least weekly and whenever Vercel sends a spend notification. Review the aggregate against the $75 guardrail:

| Threshold | Total estimated spend | Required action |
| --- | ---: | --- |
| 50% | $37.50 | Compare per-MAU metrics with the prior week; check Vercel functions/images and Supabase egress/Realtime first. |
| 75% | $56.25 | Freeze nonessential infrastructure changes; inspect top usage drivers and confirm the Vercel auto-pause setting. |
| 90% | $67.50 | Stop new paid add-ons and marketing traffic; decide whether to accept the next cost, reduce usage, or let the Vercel hard stop protect the service. |
| 100% | $75.00 | Treat as an incident: keep Vercel paused until the owner approves a revised budget and the cause is documented. |

Vercel's native events cover its 50%/75%/100% on-demand threshold. Create a recurring external reminder for the billing owner and a conditional 90% alert in the team's calendar or alerting system, because no provider can evaluate this combined Vercel + Supabase + Cloudflare + Resend total on its own.

## MAU-normalized scorecard

Use the same rolling billing-month window for every numerator and denominator. `Product MAU` means distinct people active in KnowLeague; track guest players separately until anonymous analytics are available. Do not use Supabase Auth MAU as a replacement for product MAU without noting that it excludes guests.

| Metric | Provider/source | Calculation | Investigate when |
| --- | --- | --- |
| Vercel function invocations per MAU | Vercel Usage → Functions | invocations ÷ product MAU | It rises more than 30% week-over-week without an intentional feature change. |
| Image transformations per MAU | Vercel Usage → Image Optimization | transformations ÷ product MAU | It rises more than 30%, or cache writes rise faster than transformations. |
| Database egress per MAU | Supabase Usage → Egress | GB egress ÷ product MAU | It rises more than 30%; inspect large profile, leaderboard, and repeated lobby responses. |
| Realtime messages per MAU | Supabase Usage → Realtime Messages | messages ÷ product MAU | It rises more than 30%; inspect subscription scope and repeated broadcasts. |
| Realtime peak connections per MAU | Supabase Usage → Realtime Peak Connections | peak connections ÷ product MAU | It rises materially without concurrent-player growth; inspect duplicate subscriptions. |
| Heartbeats per active player-minute | Vercel function logs/analytics | heartbeat requests ÷ minutes with an active visible player | It exceeds **2.6** for a sustained 15-minute sample. The 25-second interval should average at most 2.4 before brief reconnect/visibility overhead. |
| Emails per new account | Resend/Supabase Auth delivery count | authentication emails ÷ new confirmed accounts | It exceeds 1.5 or rises more than 30%; split signup confirmation from reset emails before acting. |
| Database size and row growth | Supabase Usage + table-size query | current bytes and rows, plus change since prior review | Disk reaches 70% of its included allocation, or any table grows more than 15% month-over-month without an expected event. |

The first full billing cycle establishes the baseline. Until then, investigate sharp changes rather than treating any unobserved absolute value as normal.

## Evidence and references

- [Vercel Spend Management](https://vercel.com/docs/spend-management) documents the threshold notifications, webhooks, and optional production pause.
- [Supabase Cost Control](https://supabase.com/docs/guides/platform/cost-control) describes what Spend Cap covers and its lack of fine-grained notifications.
- [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/) documents configurable CPU limits and the `exceededCpu` outcome.
- [Resend pricing](https://resend.com/docs/knowledge-base/what-is-resend-pricing) lists Free-plan daily and monthly email limits.
