# League Quiz App

Starter scaffold for a League of Legends quiz app using Next.js, Tailwind CSS, Radix UI, and Supabase.

## Getting started

1. `npm install`
2. `npm run dev`
3. Open `http://localhost:3000`

## Production alpha

- Copy `.env.example` into your hosting provider environment and provide real Supabase and Riot values.
- Apply Supabase migrations before deploying a production build.

## Authentication setup

- Enable Google under Supabase Auth → Providers and configure the Google OAuth client. Add the Supabase Auth callback URL shown in the provider settings to the Google OAuth client, and add the KnowLeague site URL to Supabase Auth redirect URLs.
- Disable Supabase Auth → Sessions → Single session per user if it is enabled. KnowLeague supports users staying signed in on multiple devices.
- Apply `supabase/migrations/111_multi_device_auth_sessions.sql` before deploying the multi-device session revocation behavior.
- Review `docs/alpha-launch-checklist.md` before public launch.
- Configure the controls in `docs/abuse-controls.md` before public launch.
- Enable and review the scheduled retention policy in `docs/data-retention.md` before public launch.
- Review image usage and monitoring in `docs/image-optimization.md` before public launch.
- Review cache behavior and cacheable endpoint boundaries in `docs/caching.md` before public launch.
- Review Cloudflare and transactional email limits in `docs/cloudflare-resend.md` before public launch.
- Complete the provider dashboard budget controls in `docs/budget-protection.md` before public launch.
- Run `npm run check` before deploy.
- Run `npm run build` only when no local `next dev` process is active.

## Discord companion bot

The Discord companion is a separate, single-guild Node.js service in `discord-bot/`; the Next.js site remains at the repository root. It reuses the existing profile Discord OAuth link and reads shared data through a server-only Supabase service-role client.

- Setup, commands, environment variables, and deployment instructions: [`discord-bot/README.md`](discord-bot/README.md)
- Chat leveling is configured by website admins in **Profile > Discord Account > Discord Configuration**; the website and bot deployments both need the same `DISCORD_GUILD_ID`.
- Run locally: `npm run discord:dev`
- Verify it: `npm run discord:check`
- Register its guild slash commands after a command change (including for a separate test bot): `npm run discord:commands:register`

## Features

- Champion ultimate guessing game
- Skin popularity and validation tools
- Leaderboard and player progress
- Riot API and Data Dragon integration
