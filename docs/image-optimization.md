# Image-optimization cost controls

KnowLeague uses two image paths intentionally:

- `GameSplashImage` keeps full Riot splash art in Next/Vercel’s optimizer. It defaults to lazy loading and quality `65`, and callers must provide an accurate `sizes` value for responsive or `fill` layouts.
- `GameIconImage` serves already-small Data Dragon and CommunityDragon icons directly from their source CDN with `unoptimized`. This avoids a Vercel transformation and image-cache entry for every icon size.

Do not set `images.unoptimized = true` globally. Full splash art is often much larger than its display size, so direct delivery would trade image-optimization charges for significantly more browser/CDN transfer.

## Variant budget

`next.config.mjs` limits optimized output to these reusable widths:

```text
Responsive: 360, 640, 960, 1280
Fixed:      32, 48, 64, 96, 160, 240, 320
```

It emits WebP only and sets a seven-day minimum cache TTL. The week-long window is a deliberate balance: Riot assets are normally catalogued/versioned, but CommunityDragon `latest` sources should not remain stale for a full month. Reconsider the window after measuring cache-write rates and after a catalogue-refresh test.

## Component rules

- Use `GameIconImage` only for a known small game icon, crest, rank, rune, item, spell, or profile-icon source.
- Use `GameSplashImage` for skin splash art, with width/height or `fill` plus `sizes`.
- Do not mark more than the single current, above-the-fold game image as `priority`; lazy loading is the default for all other splash art.
- Do not render or preload a splash image for hidden/next game cards. Canvas-based games may load their one active target directly because they need source pixels for the game board; that traffic does not pass through Vercel Image Optimization.
- When adding a new layout width, first reuse the configured widths. Add a new width only when browser rendering makes the nearest existing option visibly inadequate.

## Vercel monitoring

Review Vercel **Usage → Image Optimization** and **Observability → Image Optimization** separately from Fast Data Transfer, Edge Requests, and Function usage. Record a baseline after release, then review weekly:

| Metric | What to watch | Typical response |
| --- | --- | --- |
| Image transformations | Large increases after a page/card release | Check for a missing `sizes` prop, a new width, or repeated changing URLs. |
| Image cache writes | High write-to-transformation ratio or sharp growth | Consolidate widths, raise TTL when source freshness permits, and remove unnecessary preloads. |
| Image cache reads | Growth separate from normal page traffic | Identify popular splash routes; keep optimization only where it reduces transfer. |
| Fast Data Transfer / Edge Requests | Image delivery impact after transformation controls | Compare with direct-icon usage; do not globally disable optimization just to reduce transforms. |

Set a monthly Spend Management alert for image-related usage before the included usage credit is exhausted. Vercel bills image transformations, cache reads, and cache writes separately; transformed-image delivery also contributes to Fast Data Transfer and Edge Requests.

Vercel’s [image cost guide](https://vercel.com/docs/image-optimization/managing-image-optimization-costs) describes these metrics and the controls used here. Its [image limits and pricing guide](https://vercel.com/docs/image-optimization/limits-and-pricing) explains the separate transformation, cache-read, and cache-write billing model.
