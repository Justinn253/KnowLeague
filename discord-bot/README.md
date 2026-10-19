# KnowLeague Discord Companion

This is the long-running Discord companion for the KnowLeague web app. It is intentionally a separate deployment from Next.js, while sharing the same Supabase project and the website's existing Discord profile-link identity.

## Current commands

- `/link` directs a Discord user to the existing KnowLeague profile-link flow.
- `/profile` confirms the caller's linked KnowLeague profile and links to its public page.
- `/help` describes every KnowLeague bot command and its usage.
- `/xp view [member]` shows a member's level, total XP, segmented progress bar, and remaining XP. It defaults to the caller.
- `/xp add` grants a member XP and `/xp set-level` sets a member to a level; both are available only to members whose Discord role is selected in **Discord Configuration**.
- `/leaderboard [count]` posts the top active server members by XP, with 10 entries by default and up to 25 on request.
- `/knowbucks balance [member]` shows your balance or a selected member's balance.
- `/knowbucks pay member amount` transfers KnowBucks to another non-bot server member.
- `/knowbucks add`, `/knowbucks remove`, and `/knowbucks set` are available to members whose Discord role is selected in **Discord Configuration**.
- `/collections collection` publicly displays your claimed skins one at a time with Previous and Next buttons. `/cl` is a mirrored shortcut command because Discord does not support native slash-command aliases.
- `/collections give member skin-id` transfers one of your claimed skins to a current server member by its four-digit KnowLeague ID.
- `/collections spawn` immediately posts a skin drop in the channel where the command was used. It requires a Discord role selected in **Discord Configuration > Collections**.
- `/collections summon` spends the configured KnowBucks cost (5,000 by default) to post a skin drop in the current channel. The summoner has the configured grace period to claim it first.
- `/collections capacity-add slots` buys collection space in multiples of five slots at the configured price (500 KnowBucks per five slots by default), while role-authorized staff can use `/collections capacity-force-add member slots` at no cost.
- `/collections steal` costs three times the claimed skin's configured sell value and applies a 30-minute cooldown after a paid attempt. `/collections favorite`, `/collections gamble`, `/collections search`, and `/collections sell` manage a collection by four-digit KnowLeague skin ID. Search results are catalogue previews only and cannot be claimed.
- `/fish expedition-set biome length [crew]` sends the first available, or selected unlocked, crew slot to one of seven biomes. Lengths are 5 seconds and one fish roll (level 0), 60 seconds and 12 rolls (level 10), 10 minutes and 120 rolls (level 20), and one hour and 720 rolls (level 30); crew trips take three times as long.
- `/fish expedition-progress` shows active expeditions and the most recent return. Completed expedition results include an owner-only **Fish again** button that relaunches the same biome, length, and crew slot after normal eligibility checks. `/fish shop` has public, owner-controlled category panels for KnowBucks upgrades, while `/fish inventory` has focused Overview, Rods, Baits, Skills, Relics, and Boats tabs; rods and baits are equipped only from their respective tabs.
- `/fish help` provides the fishing-specific command and progression guide. `/fish chests-open` is a temporary, one-time-style legacy command that redeems every held migrated crate in one atomic result, while `/fish catalogue` tracks caught fish and found relics by biome.

All non-administrative slash-command responses are public to the server, including profiles, XP, KnowBucks balances and payments, and collection actions. XP/KnowBucks staff commands and `/collections spawn` or `/collections capacity-force-add` remain ephemeral, including authorization failures and action results. Collection-page button denials remain private to avoid channel spam. Leveling and skin claims observe eligible messages, reactions, and voice-state changes through the non-privileged `Guilds`, `GuildMessages`, `GuildMessageReactions`, `GuildModeration`, and `GuildVoiceStates` gateway intents. The bot does not read or store message text or voice audio, registers commands to one configured guild, and ignores all events from every other guild.

## Chat leveling

Chat leveling is configured by KnowLeague website administrators from **Profile > Discord Account > Discord Configuration**. It starts enabled with 15 XP per eligible non-bot message and a five-second, per-member server-wide cooldown. The Lurkr-compatible total XP requirement for level `n` is `50n² - 100n + 150` (for example, level 10 requires 4,150 total XP).

Voice channel time also earns 1 XP for every completed minute. The bot starts a server-side session when a non-bot member joins a voice or stage channel, retains it when they move between channels, and atomically settles XP when they disconnect. It does not connect to calls, receive audio, or attempt to infer whether someone is speaking. A bot restart reconciles current voice states so stale sessions cannot later grant XP.

Administrators can pause leveling, adjust XP and cooldown values, configure a default announcement plus optional reward-level overrides, and select multiple Discord roles for each reward level. Announcement templates support `{user}` (a member mention), `{username}` (plain text with no ping), `{level}`, and `{xp}`. Leave the announcement channel ID empty to post in the channel where a member leveled up, or enter a text-channel ID to route every announcement there.

The leaderboard can optionally grant one dedicated champion role to the highest-XP eligible member. The bot checks it at startup, then on the first eligible human message after each hourly window; role changes can therefore take up to one hour after a lead changes. Members with selected exclusion roles are skipped when selecting the champion. Keep the champion role dedicated: it cannot be a level reward or manual-XP staff role.

When a member is banned while the bot is running, their existing chat XP is reset to zero and they are removed from champion-role consideration. Existing bans are not retroactively processed.

## KnowBucks

KnowBucks is the server currency that will support the future shop. Every level reached through automatic chat or voice XP grants `level × 1,000` KnowBucks. If one award crosses several levels, it grants the sum for every level crossed. Manual XP and level corrections intentionally do not mint KnowBucks.

Balances, level rewards, staff adjustments, and payments are atomic server-side transactions. The selected **Discord staff permissions** roles can add, remove, or set balances; remove never makes a balance negative. Members can publicly view balances and pay another non-bot server member, while staff adjustments stay private.

## Fishing expeditions

Fishing is a server-authoritative expedition system. Harbor is free; the permanent Sail, Abiotic Turbine, Submersible Pod, Magic Conch Navigator, Drill Unit, and Radar Scanner unlock Warm Ocean, Hydroplant Reservoir, Sunken Sea, Kelp Forest, Crystaline Caverns, and Rallypoint Delta respectively. Each boat upgrade has both its listed chat-level and KnowBucks requirement. Boat upgrades are permanent and do not need equipping. Kelp Forest crate drops are Uncommon or Rare.

Every expedition saves its rod, one equipped bait, passive skills and relics, crew slot, private result seed, and active role/weekday modifiers before it starts. Plastic through God Rods progressively gate the eligible fish rarities; God Rod is already Mythic-ready, although the Mythic fish catalogue is intentionally empty for now. Chum and Bloodworms can add matching-rarity fish, Magnet increases crate odds by 50%, Sonar halves fish-roll success while doubling relic odds, Mysterious Sea Food can add 50% more fish rolls, and Truffle Worm triples legendary odds while suppressing non-legendary fish. The four expedition lengths return 1, 12, 120, or 720 fish-roll opportunities respectively before bait and relic effects. Base expedition XP is 7, 90, 900, or 5,400 respectively; crate XP remains rarity-based. Fishing level-ups award at least 500 KnowBucks, then 1.5 times the XP required by the reached level. Lengths 2 through 4 add 5%, 10%, or 15% to non-Common rarity weights. Completion results condense matching fish and automatically opened crate rewards into separate counted areas. Crew 1 requires level 40 and 100,000 KnowBucks, Crew 2 requires level 80, Crew 1, and 250,000 KnowBucks. Crew runs take three times as long with normal rewards.

The bot uses one five-second reconciliation loop to settle due expeditions atomically and credit automatic fish and crate-item sales. Launches and progress views show a static estimated trip duration rather than Discord's relative timestamp, so a display cannot remain overdue while settlement is in progress. Completion replaces the original launch message with fish catches, separately listed opened crates, reward, resulting balance, and an owner-only repeat control; if that message was deleted, the bot posts a fallback result with the same control. Repeating starts a fresh expedition with the saved biome, length, and crew slot, but rechecks channel access, ownership, boat, level, and crew availability. The Fishing tab in Discord Configuration defaults `/fish` to all channels and can restrict it to selected synced channels. Shop, inventory, and catalogue controls expire after one minute of inactivity. A restart therefore cannot duplicate or lose an already-started trip.

Each fish-roll opportunity has a 0.01% base chance to find one permanent relic that the player does not yet own; Sonar and Conduit each double that chance. Relics are awarded atomically and marked prominently in the expedition result; their active descriptions are available from the Inventory Relics tab. Crate rates are one quarter of the prior chest rates: 5%, 2.5%, 1.25%, 0.25%, and 0.025% for Common through Legendary. Every caught crate immediately opens into one biome-specific item; its crate rarity sets the minimum loot rarity and all eligible rarities use 1000/200/50/10/1 weights. The Extra Crate Loot phenomenon gives each auto-opened crate a 50% chance to roll one additional item. Every listed item is valued from 0–30% above the average fish value for its biome and rarity, before sale bonuses. Migration 164 converts pre-existing generic chest IDs into legacy crates; `/fish chests-open` consumes all of those held crates atomically and is intended to be retired once that migration path is complete. Sea Star, Alien Engine, Dual Hook, Rod Improvement Kit, Lost Pursasion Device, Conduit, Reservoir Growth, Magic Conch, and Teleporter have active fishing effects. Giant Pearl and Gemcracker are retained now for their future cross-game XP and crate-loot effects. The biome-filtered catalogue marks each player’s caught fish and found relics without relic descriptions; pets and storage remain held for later fishing updates.

## Skin claim drops

KnowLeague administrators configure skin drops and the collection economy in **Profile > Discord Account > Discord Configuration > Collections**. The channel scope defaults to **All**, which includes every text channel where the bot can send messages. Administrators can instead select up to 25 specific channels. Once skin drops are enabled, the first eligible human message after the minimum interval posts a drop in that same channel. If chat remains quiet until the maximum interval, the bot posts one in a random eligible channel. Separately selected Collections admin roles can use `/collections spawn` and `/collections capacity-force-add` in the invoking channel. Manual spawns, paid summons, and successful gambles preserve the one-live-drop rule without restarting the normal drop interval. The first human reaction to a live drop claims the skin; any emoji is accepted, and the claim window is configurable.

Drops draw from the generated 1,899-skin catalogue and use full splash art. Administrators set the relative weight for every in-game rarity; a weight of zero excludes that rarity, along with the default capacity, capacity price, summon price, steal chance, grace period, and sell value for each rarity. Every live drop displays its rarity's exact spawn percentage, calculated from both the configured rarity weights and the number of eligible catalogue skins in each rarity. Each live or collected item receives a unique active four-digit KnowLeague ID. Stealing debits three times the configured sell price and starts a 30-minute cooldown only after a paid attempt; insufficient funds do not consume a cooldown. Drops, claims, capacity checks, KnowBucks changes, expirations, stealing, selling, and transfers are database-authoritative, so only one reaction can win and concurrent commands cannot exceed a member's collection capacity. A collection can contain duplicate source skins when they were claimed from separate drops.

## Local setup

1. In the Discord application already used by the website's `DISCORD_CLIENT_ID`, open **Bot** and add a bot user; copy the application ID and bot token. If website OAuth has not been configured yet, create one Discord application and use that same application for both OAuth and the bot. `DISCORD_APPLICATION_ID` must equal the website's `DISCORD_CLIENT_ID`.
2. In **Bot > Privileged Gateway Intents**, leave every privileged toggle off. In particular, do not enable **Message Content Intent**, **Server Members Intent**, or **Presence Intent**. Leveling and skin claims use the non-privileged **Guild Messages**, **Guild Message Reactions**, **Guild Moderation**, and **Guild Voice States** intents; no Developer Portal toggle is needed, and the bot never reads message text or voice audio.
3. In **OAuth2 > URL Generator**, select `bot` and `applications.commands`. Under Bot Permissions select **View Channels**, **Read Message History**, **Send Messages**, **Embed Links**, and **Manage Roles**. The first four permissions are needed in every configured skin-drop channel; **Manage Roles** is needed only for level rewards and the optional champion role. Then use the generated URL to invite or re-authorize the bot in the KnowLeague server. Do not grant Administrator. Move the KnowLeague bot's server role above every level-reward role and the optional champion role it should grant.
4. Copy `discord-bot/.env.example` to `discord-bot/.env` and set each value. The bot loads this local file automatically when run from its workspace. Use the same Supabase project as the website. Keep `SUPABASE_SERVICE_ROLE_KEY` only in this local file or the bot host's secret manager.
5. Add the same `DISCORD_GUILD_ID` to the website's `.env.local` (and its production environment) so the administrator-only settings page knows which server to configure.
6. Install dependencies from the repository root:

   ```bash
   npm install
   ```

7. Register the guild-scoped slash commands, then start the bot:

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

After applying fishing migrations 157 through 166, restart or redeploy the bot and register the revised command set:

```bash
npx supabase db push
npm run discord:commands:register
```

For a test bot, make sure `discord-bot/.env` contains that test application's `DISCORD_APPLICATION_ID`, token, and private-server `DISCORD_GUILD_ID`, then run the registration command from the repository root. Starting the bot alone does not create slash commands.

Build the container locally from the repository root with:

```bash
docker build -f discord-bot/Dockerfile -t knowleague-discord-bot .
```

The bot and website can be maintained on separate schedules. Restarting or redeploying the bot affects Discord commands only; it does not affect the website.
