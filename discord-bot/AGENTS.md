# KnowLeague Discord Bot Guide

## Scope
- This is the standalone, single-guild Discord companion for the root KnowLeague web app.
- It is a long-running Node.js process. Do not move gateway handling into Next.js API routes.
- Keep the bot limited to `GatewayIntentBits.Guilds` and guild-scoped slash commands unless the user explicitly authorizes a capability requiring additional intents.

## Data and identity
- The bot reuses the website's existing `profile_private_details.discord_user_id` association. Never create an alternate linking table or persist a Discord token.
- Bot reads and writes through a server-only Supabase service-role client. Never import bot modules into a browser component or expose its environment variables in a `NEXT_PUBLIC_*` value.
- Prefer the web app's existing public/profile semantics; avoid exposing private profile or multiplayer data in a public Discord reply. Default command replies to ephemeral.

## Commands and deployment
- Keep command definitions in `src/commands.ts`, then register them explicitly with `npm run discord:commands:register`.
- The bot must ignore every interaction outside `DISCORD_GUILD_ID`, even if its Discord application is invited elsewhere.
- Build its image from the repository root using `discord-bot/Dockerfile`; its dependency lock is the root `package-lock.json`.
- Run `npm run discord:check` after bot changes, and `npm run check` for changes that also alter shared website behavior.
