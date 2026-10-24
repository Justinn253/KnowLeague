# Discord snapshot operations and cost controls

This note covers the two public screenshot commands that render through the private Browserless Railway service:

- `/league account riot-id region`
- `/league champion champion section`

## Runtime safeguards

- The bot opens one disposable browser context per command and closes it after the image buffers have been created. No Discord, Supabase, or Riot secret is made available to Browserless.
- Navigation is restricted to the configured KnowLeague public origin (with only its canonical `www` variation permitted). Telemetry and advertising hosts are blocked during capture, so a website redirect cannot turn Browserless into an arbitrary browsing service.
- The renderer executes one capture at a time, keeps at most two captures in the local queue, times out page and image waits, and disconnects from its browser after two inactive minutes. The idle disconnect releases remote browser session resources; the Browserless Railway service itself remains available.
- Each PNG is capped at 8 MiB and all attachments from one command are capped at 20 MiB. The Champion skins gallery must prove that every image loaded successfully before it can be attached.
- The server uses a 60-second, six-work-unit budget plus a 30-second member cooldown. An account render consumes two work units, Champion All sections consumes four, Ability details consumes three, and each one-image Champion section consumes one. This allows at most three account renders, two Ability-detail renders, or one full eight-image render plus two one-image renders in a fresh one-minute window. The serialized renderer is an additional practical ceiling.

The rate reservation is process-local because the bot intentionally runs as one Railway replica. If the bot is ever scaled beyond one replica, move the work-unit bucket to a shared atomic store before increasing replicas; otherwise each replica would have an independent allowance.

## Railway self-hosted Browserless cost model

The current deployment uses Browserless as a private Railway service, so Browserless Cloud unit pricing does **not** apply. The recurring cost is the bot and Browserless services' actual Railway resource consumption.

Railway's published resource rates at the time of this review are $10 per GB-month of RAM, $20 per vCPU-month, and $0.05 per GB of public egress. The Hobby $5/month and Pro $20/month subscriptions act as included usage credit, not an additional flat charge on top of usage.

Use this planning formula from Railway Metrics / Usage:

```text
monthly resource cost =
  average RAM in GB × $10
  + average vCPU × $20
  + public egress in GB × $0.05

monthly invoice before tax = max(plan's included-usage commitment, monthly resource cost)
```

Illustrative steady-state examples below are planning models, not measured usage. They include both services and omit storage.

| Model | RAM | Average CPU | Compute estimate | With 10 GB public egress |
| --- | ---: | ---: | ---: | ---: |
| Small bot + idle Browserless | 0.75 GB | 0.04 vCPU | $8.30/mo | $8.80/mo |
| Expected low-volume production | 1.25 GB | 0.10 vCPU | $14.50/mo | $15.00/mo |
| Busy / generously sized services | 2.00 GB | 0.25 vCPU | $25.00/mo | $25.50/mo |

The screenshots themselves are usually not the dominant Railway cost. For example, 1,000 command results averaging 5 MiB of Discord attachments equal about 4.9 GB of public egress, or about $0.24 at the published rate. Asset downloads made by Browserless and the website's normal traffic also contribute egress, so use Railway's service-level network metrics rather than this attachment-only estimate.

## Browserless Cloud comparison

If this private Railway service is replaced with Browserless Cloud, budgeting changes: Browserless bills a unit for each 30 seconds (rounded up) that a browser connection is open. Its current Free plan includes 1,000 units/month; the Prototyping plan is $25/month for 20,000 units with $0.002 per-unit overage. The bot now disconnects after two inactive minutes specifically to prevent an idle, permanent connection from consuming cloud units. A normal capture still needs to be measured because page/skin load time determines its rounded unit count.

For the current self-hosted deployment, retain the private Railway service; it keeps the browser off the bot container and makes the budget primarily RAM/CPU based. Do not expose a Browserless public domain or its connection token.

## Operating checklist

1. In Railway, set sensible per-service memory/CPU limits for both the bot and Browserless, then watch the Metrics tab for a full week before changing size or rate limits.
2. Configure Railway Usage Limits / Cost Control to shut down workloads at a spend threshold that the project owner accepts. This is the provider-level backstop for a traffic spike.
3. Keep Browserless at one replica unless the bot's global rate limiter is moved to a shared, atomic backing store.
4. Review both the Discord attachment sizes and Browserless duration after a catalogue or visual-asset change. Large skin images are the most likely source of increased egress and rendering time.

## References

- Railway pricing: https://docs.railway.com/pricing
- Railway cost control: https://docs.railway.com/pricing/cost-control
- Browserless Cloud unit consumption: https://docs.browserless.io/overview/unit-consumption
- Browserless pricing: https://www.browserless.io/pricing
