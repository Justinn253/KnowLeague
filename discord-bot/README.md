# KnowLeague Discord Companion

This is the long-running Discord companion for the KnowLeague web app. It is intentionally a separate deployment from Next.js, while sharing the same Supabase project and the website's existing Discord profile-link identity.

## Current commands

- `/link` directs a Discord user to the existing KnowLeague profile-link flow.
- `/profile` confirms the caller's linked KnowLeague profile and links to its public page.

Both commands reply ephemerally. The bot uses only the `Guilds` gateway intent, registers commands to one configured guild, and ignores interactions from every other guild.

## Local setup

1. In the Discord application already used by the website's `DISCORD_CLIENT_ID`, open **Bot** and add a bot user; copy the application ID and bot token. If website OAuth has not been configured yet, create one Discord application and use that same application for both OAuth and the bot. `DISCORD_APPLICATION_ID` must equal the website's `DISCORD_CLIENT_ID`.
2. In **OAuth2 > URL Generator**, select `bot` and `applications.commands`; use the least permissions required to invite it to the single KnowLeague server. No privileged gateway intents are required.
3. Copy `discord-bot/.env.example` to `discord-bot/.env` and set each value. The bot loads this local file automatically when run from its workspace. Use the same Supabase project as the website. Keep `SUPABASE_SERVICE_ROLE_KEY` only in this local file or the bot host's secret manager.
4. Install dependencies from the repository root:

   ```bash
   npm install
   ```

5. Register the guild-scoped slash commands, then start the bot:

   ```bash
   npm run discord:commands:register
   npm run discord:dev
   ```

The website must have its existing Discord OAuth configuration (`DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, and callback URL) in place for account linking. The bot never stores Discord OAuth access tokens.

## Deployment

Deploy the website and bot as independent services from the same Git repository:

| Service | Build context | Build/start | Secrets |
| --- | --- | --- | --- |
| KnowLeague web | repository root | existing Next.js deployment | existing website environment variables |
| Discord bot | repository root, Dockerfile `discord-bot/Dockerfile` | Docker image command | values from `discord-bot/.env.example` |

For Railway, Render, Fly.io, or a container host, set the repository root as the Docker build context and point it to `discord-bot/Dockerfile`. Do not set the host's root directory to `discord-bot`, because the bot intentionally uses the root npm workspace and lockfile.

After changing `src/commands.ts`, run `npm run discord:commands:register` once with production bot credentials. Guild commands update quickly and do not require a website deployment.

Build the container locally from the repository root with:

```bash
docker build -f discord-bot/Dockerfile -t knowleague-discord-bot .
```

The bot and website can be maintained on separate schedules. Restarting or redeploying the bot affects Discord commands only; it does not affect the website.
