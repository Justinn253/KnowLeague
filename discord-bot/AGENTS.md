# KnowLeague Discord Bot Guide

## Scope
- This is the standalone, single-guild Discord companion for the root KnowLeague web app.
- It is a long-running Node.js process. Do not move gateway handling into Next.js API routes.
- Chat leveling uses `GatewayIntentBits.GuildMessages` to observe message events. Message Content is deliberately enabled for the authorized `/snipe`, `/steal-emoji`, and confirmed DISBOARD-bump features: retain only the in-memory, bounded snipe cache (message content plus metadata and URLs for up to three attachments), never persist general message text, and do not reuse content for unrelated features. Guild Members is enabled only to receive member-removal events that release the departing member's collection skins; the bot does not cache or persist member profiles from that intent. Presence remains disabled.
- Keep every command guild-scoped and ignore events outside `DISCORD_GUILD_ID`.

## Data and identity
- The bot reuses the website's existing `profile_private_details.discord_user_id` association. Never create an alternate linking table or persist a Discord token.
- Bot reads and writes through a server-only Supabase service-role client. Never import bot modules into a browser component or expose its environment variables in a `NEXT_PUBLIC_*` value.
- Prefer the web app's existing public/profile semantics; avoid exposing private profile or multiplayer data in a public Discord reply. Default command replies to ephemeral.
- The optional General commands channels apply only to `/help`, `/link`, `/profile`, `/xp`, `/leaderboard`, `/knowbucks`, `/player`, `/rob`, `/snipe`, and `/steal-emoji`. Fishing, Collections, and `/league` are feature-scoped and must retain their own channel behavior. Every command-channel denial must be ephemeral.

## Commands and deployment
- Keep command definitions in `src/commands.ts`, then register them explicitly with `npm run discord:commands:register`.
- The bot must ignore every interaction outside `DISCORD_GUILD_ID`, even if its Discord application is invited elsewhere.
- Build its image from the repository root using `discord-bot/Dockerfile`; its dependency lock is the root `package-lock.json`.
- Run `npm run discord:check` after bot changes, and `npm run check` for changes that also alter shared website behavior.
