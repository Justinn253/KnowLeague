# League Quiz App

Starter scaffold for a League of Legends quiz app using Next.js, Tailwind CSS, Radix UI, and Supabase.

## Getting started

1. `npm install`
2. `npm run dev`
3. Open `http://localhost:3000`

## Production alpha

- Copy `.env.example` into your hosting provider environment and provide real Supabase and Riot values.
- Apply Supabase migrations before deploying a production build.
- Review `docs/alpha-launch-checklist.md` before public launch.
- Configure the controls in `docs/abuse-controls.md` before public launch.
- Enable and review the scheduled retention policy in `docs/data-retention.md` before public launch.
- Review image usage and monitoring in `docs/image-optimization.md` before public launch.
- Review cache behavior and cacheable endpoint boundaries in `docs/caching.md` before public launch.
- Review Cloudflare and transactional email limits in `docs/cloudflare-resend.md` before public launch.
- Complete the provider dashboard budget controls in `docs/budget-protection.md` before public launch.
- Run `npm run check` before deploy.
- Run `npm run build` only when no local `next dev` process is active.

## Features

- Champion ultimate guessing game
- Skin popularity and validation tools
- Leaderboard and player progress
- Riot API and Data Dragon integration
