# KnowLeague Discord Companion

This is the long-running Discord companion for the KnowLeague web app. It is intentionally a separate deployment from Next.js, while sharing the same Supabase project and the website's existing Discord profile-link identity.

## Current commands

- `/link` directs a Discord user to the existing KnowLeague profile-link flow.
- `/profile` confirms the caller's linked KnowLeague profile and links to its public page.
- `/help` describes every KnowLeague bot command and its usage.
- `/league skindle play`, `/league skindle guess skin`, and `/league skindle status` provide a test version of the UTC daily Skindle. `/play` posts a public activity card, while clue feedback and the final skin reveal stay private. Completion posts a spoiler-free public guess-count card with square markers. Test runs are held in bot memory and reset after a bot restart; they do not yet synchronize with website Skindle progress or global statistics.
- `/xp view [member]` shows a member's level, total XP, segmented progress bar, and remaining XP. It defaults to the caller.
- `/xp add` grants a member XP and `/xp set-level` sets a member to a level; both are available only to members whose Discord role is selected in **Discord Configuration**.
- `/leaderboard [count]` posts the top active server members by XP, with 10 entries by default and up to 25 on request.
- `/knowbucks balance [member]` shows your balance or a selected member's balance.
- `/knowbucks pay member amount` transfers KnowBucks to another non-bot server member.
- `/knowbucks coinflip amount` wagers KnowBucks on a cryptographically random 50/50 flip. A win returns twice the wager; a loss removes the wager.
- `/knowbucks leaderboard [count]` publicly shows the top active server members by KnowBucks, with 10 entries by default and up to 25 on request.
- `/knowbucks add`, `/knowbucks remove`, and `/knowbucks set` are available to members whose Discord role is selected in **Discord Configuration**.
- `/snipe` costs 1,000 KnowBucks and publicly shows this channel's latest cached deleted message. Image attachments render as previews (up to three); non-image files remain links. It neither charges nor reveals anything when no eligible deleted message is cached.
- `/steal-emoji message-id` is available only to Discord administrators. It imports each external custom emoji found in a source message, including animated emoji where the server has an animated emoji slot. A raw message ID targets the current channel; an in-server copied message link can target another readable channel.
- `/collections collection [member]` publicly displays your own or another current member's claimed skins one at a time with Previous and Next buttons. Each panel shows that collection's current daily upkeep; Show details includes sale and acquisition metadata.
- `/collections give member skin-id` transfers one of your claimed skins to a current server member by its four-digit KnowLeague ID.
- `/collections spawn` immediately posts a skin drop in the channel where the command was used. It requires a Discord role selected in **Discord Configuration > Collections**.
- `/collections summon` spends the configured KnowBucks cost (5,000 by default) to post a skin drop in the current channel. The summoner has the configured grace period to claim it first.
- `/collections capacity-add slots` buys collection space one slot at a time up to 50 total slots. The next slot costs 500 KnowBucks multiplied by its resulting slot number, while role-authorized staff can use `/collections capacity-force-add member slots` at no cost.
- `/collections steal` costs three times the claimed skin's configured sell value and applies a 30-minute cooldown after a paid attempt. `/collections favorite`, `/collections gamble`, `/collections search`, and `/collections sell` manage a collection by four-digit KnowLeague skin ID. Search results are catalogue previews only and cannot be claimed.
- `/collections upkeep-view` privately displays the current daily charge, a member's upkeep allocation and regular KnowBucks balance, any grace payment, and how many full daily charges the combined funds cover. `/collections upkeep-pay amount` permanently reserves up to 100,000 KnowBucks for upkeep; the allocation is spent first and cannot be withdrawn. Amounts beyond the remaining cap stay in the regular balance.
- `/fish expedition-set biome length [crew]` sends the first available, or selected unlocked, crew slot to one of seven biomes. Lengths are 5 seconds and one fish roll (level 0), 60 seconds and 12 rolls (level 10), 10 minutes and 120 rolls (level 20), and one hour and 720 rolls (level 30); crew trips take three times as long.
- `/fish expedition-progress` shows active expeditions and the most recent return. Completed expedition results include an owner-only **Fish again** button that relaunches the same biome, length, and crew slot after normal eligibility checks. `/fish shop` has public, owner-controlled category panels for KnowBucks upgrades, while `/fish inventory` has focused Overview, Rods, Baits, Skills, Relics, Boats, and Titles tabs; rods and baits are equipped only from their respective tabs.
- `/fish help` provides the fishing-specific command and progression guide. `/fish chests-open` is a temporary, one-time-style legacy command that redeems every held migrated crate in one atomic result, while `/fish catalogue` tracks caught fish and found relics by biome. `/fish event-help` explains the active event and `/fish event-catalogue` tracks its event discoveries.

All non-administrative slash-command responses are public to the server, including profiles, XP, KnowBucks balances and payments, collection actions, coinflips, and snipes. `/collections upkeep-view` and `/collections upkeep-pay` are private because they expose the invoker's reserved and regular funds. XP/KnowBucks staff commands, `/steal-emoji`, and `/collections spawn` or `/collections capacity-force-add` remain ephemeral, including authorization failures and action results. Every command-channel denial is private to the invoking member, including General, Fishing, and Collections channel restrictions. Collection-page button denials remain private to avoid channel spam. Leveling and skin claims observe eligible messages, reactions, and voice-state changes through the `Guilds`, `GuildMessages`, `GuildMessageReactions`, `GuildModeration`, `GuildVoiceStates`, and Message Content gateway intents. Message Content is enabled only because `/snipe` keeps a bounded in-memory cache (up to 5,000 recent messages for six hours, then the last deleted message in a channel for one hour), `/steal-emoji` reads an administrator-selected source message, and the configured DISBOARD channel is inspected for a successful bump confirmation. Message text is never written to Supabase, and the bot neither receives nor records voice audio. The bot registers commands to one configured guild and ignores all events from every other guild.

## General command channel

KnowLeague administrators can select one or more optional default commands channels in **Profile > Discord Account > Discord Configuration > General**. The selection applies to `/help`, `/link`, `/profile`, `/xp`, `/leaderboard`, `/knowbucks`, `/snipe`, and `/steal-emoji`; choosing **All channels** restores the default unrestricted behavior. Fishing, Collections, and `/league skindle` retain their own feature boundaries and do not inherit this setting.

## Chat leveling

Chat leveling is configured by KnowLeague website administrators from **Profile > Discord Account > Discord Configuration**. It starts enabled with 15 XP per eligible non-bot message and a five-second, per-member server-wide cooldown. The Lurkr-compatible total XP requirement for level `n` is `50n² - 100n + 150` (for example, level 10 requires 4,150 total XP).

Voice channel time also earns 1 XP for every completed minute. The bot starts a server-side session when a non-bot member joins a voice or stage channel, retains it when they move between channels, and atomically settles XP when they disconnect. It does not connect to calls, receive audio, or attempt to infer whether someone is speaking. A bot restart reconciles current voice states so stale sessions cannot later grant XP.

Administrators can pause leveling, adjust XP and cooldown values, configure a default announcement plus optional reward-level overrides, and select multiple Discord roles for each reward level. Announcement templates support `{user}` (a member mention), `{username}` (plain text with no ping), `{level}`, and `{xp}`. Leave the announcement channel ID empty to post in the channel where a member leveled up, or enter a text-channel ID to route every announcement there.

The leaderboard can optionally grant one dedicated champion role to the highest-XP eligible member. The bot checks it at startup, then on the first eligible human message after each hourly window; role changes can therefore take up to one hour after a lead changes. Members with selected exclusion roles are skipped when selecting the champion. Keep the champion role dedicated: it cannot be a level reward or manual-XP staff role.

When a member is banned while the bot is running, their existing chat XP is reset to zero and they are removed from champion-role consideration. Existing bans are not retroactively processed.

## KnowBucks

KnowBucks is the server currency that will support the future shop. Every level reached through automatic chat or voice XP grants `level × 1,000` KnowBucks. If one award crosses several levels, it grants the sum for every level crossed. Manual XP and level corrections intentionally do not mint KnowBucks.

Balances, level rewards, staff adjustments, payments, coinflips, snipes, and message rewards are atomic server-side transactions. The selected **Discord staff permissions** roles can add, remove, or set balances; remove never makes a balance negative. Members can publicly view balances and pay another non-bot server member, while staff adjustments stay private.

Every eligible human message has a 1% chance to grant a KnowBucks surprise: 75% of successful rolls award 1,000, 15% award 2,500, 5% award 5,000, 4% award 10,000, and 1% award 25,000. The bot uses cryptographically secure random rolls, persists only a successful reward's Discord message ID for idempotency, and announces the resulting balance in the channel.

Set `DISCORD_BUMP_CHANNEL_ID` to the dedicated bump channel to enable the DISBOARD award. KnowLeague verifies a new message from DISBOARD's official bot with its successful `Bump done` confirmation before awarding the interaction's initiating member 2,500 KnowBucks; it does not reward attempted `/bump` commands or cooldown/error messages. Each DISBOARD confirmation message can award once, even across gateway reconnects.

## Fishing expeditions

Fishing is a server-authoritative expedition system. Harbor is free; the permanent Sail, Abiotic Turbine, Submersible Pod, Magic Conch Navigator, Drill Unit, and Radar Scanner unlock Warm Ocean, Hydroplant Reservoir, Sunken Sea, Kelp Forest, Crystaline Caverns, and Rallypoint Delta respectively. Each boat upgrade has both its listed chat-level and KnowBucks requirement. Boat upgrades are permanent and do not need equipping. Kelp Forest crate drops are Uncommon or Rare.

Every expedition saves its rod, one equipped bait, passive skills and relics, crew slot, private result seed, and active role/weekday modifiers before it starts. Plastic through God Rods progressively gate the eligible fish rarities; God Rod is already Mythic-ready, although the Mythic fish catalogue is intentionally empty for now. Base fish rarity weights are 1,000/200/50/10/0.1 for Common through Legendary, and every Legendary fish sells for 15 times its base value before other bonuses. Chum and Bloodworms can add matching-rarity fish, Magnet increases crate odds by 50%, Sonar halves fish-roll success while doubling relic odds, Mysterious Sea Food can add 50% more fish rolls, and Truffle Worm triples legendary odds while suppressing non-legendary fish. The four expedition lengths return 1, 12, 120, or 720 fish-roll opportunities respectively before bait and relic effects. New expeditions use 5.625, 67.5, 675, or 4,050 base Fishing XP before final whole-XP settlement rounding; crate XP is likewise 25% lower by rarity. Fishing level-ups award at least 500 KnowBucks, then 1.5 times the XP required by the reached level. Lengths 2 through 4 add 5%, 10%, or 15% to non-Common rarity weights. Completion results condense matching fish and automatically opened crate rewards into separate counted areas. Crew 1 requires level 40 and 100,000 KnowBucks, Crew 2 requires level 80, Crew 1, and 250,000 KnowBucks. Crew runs take three times as long with normal rewards. The Skills shop tab displays only the next unowned tier for each skill track.

The active Halloween Event gives each newly launched expedition a deterministic 25% chance to enter the **Hellish Abyss** in place of its selected biome. The original selected biome still provides the length, unlocks, and fish/crate sale ranges, while Hellish Abyss supplies its own fish and auto-opened crate tables. It introduces the non-sellable Mythic **Cthulhu**, which is stored in inventory and announced separately, and the one-time **Ghoulish Seafarer** title (0.1% per caught event fish), shown in the Inventory Titles tab. Event fish are recorded in a separate event catalogue and event titles are stored through the existing atomic unique-item settlement path.

The bot uses one five-second reconciliation loop to settle due expeditions atomically and credit automatic fish and crate-item sales. Launches and progress views show a static estimated trip duration rather than Discord's relative timestamp, so a display cannot remain overdue while settlement is in progress. Completion replaces the original launch message with fish catches, separately listed opened crates, reward, resulting balance, and an owner-only repeat control; if that message was deleted, the bot posts a fallback result with the same control. Repeating starts a fresh expedition with the saved biome, length, and crew slot, but rechecks channel access, ownership, boat, level, and crew availability. The Fishing tab in Discord Configuration defaults `/fish` to all channels and can restrict it to selected synced channels. Shop, inventory, and catalogue controls expire after one minute of inactivity. A restart therefore cannot duplicate or lose an already-started trip.

Each fish-roll opportunity has a 0.01% base chance to find one permanent relic that the player does not yet own; Sonar and Conduit each double that chance. Relics are awarded atomically and marked prominently in the expedition result; their active descriptions are available from the Inventory Relics tab. Crate rates are one quarter of the prior chest rates: 5%, 2.5%, 1.25%, 0.25%, and 0.025% for Common through Legendary. Every caught crate immediately opens into one biome-specific item; its crate rarity sets the minimum loot rarity and all eligible rarities use 1000/200/50/10/1 weights. The Extra Crate Loot phenomenon gives each auto-opened crate a 50% chance to roll one additional item. Every listed item is valued from 0–30% above the average fish value for its biome and rarity, before sale bonuses. Migration 164 converts pre-existing generic chest IDs into legacy crates; `/fish chests-open` consumes all of those held crates atomically and is intended to be retired once that migration path is complete. Alongside the existing Sea Star, Alien Engine, Dual Hook, Rod Improvement Kit, Lost Pursasion Device, Conduit, Reservoir Growth, Giant Pearl, Magic Conch, Gemcracker, and Teleporter, the catalogue includes Lucky Coin, Streak Charm, Early Bird Bell, KnowLeague Lure, Harbor Dockhand's Ledger, Sunstone, Genesys Loop, Pearl Diver's Log, Tangle Net, Crystal Resonator, and Autopilot Relay. Genesys Loop repeats the same completed expedition preset at most twice before a manual refresh; Streak Charm and Early Bird Bell lock their history-dependent eligibility at launch. Gemcracker remains reserved for its future crate-loot balance update. The biome-filtered catalogue marks each player’s caught fish and found relics without relic descriptions; pets and storage remain held for later fishing updates.

## Skin claim drops

KnowLeague administrators configure skin drops and the collection economy in **Profile > Discord Account > Discord Configuration > Collections**. The drop-channel scope defaults to **All**, which includes every text channel where the bot can send messages; administrators can instead select up to 25 specific drop channels. The separate Collections command-channel scope also defaults to **All** and can select up to 100 channels for member-facing `/collections` commands. Once skin drops are enabled, the first eligible human message after the minimum interval posts a drop in that same channel. If chat remains quiet until the maximum interval, the bot posts one in a random eligible channel. Separately selected Collections admin roles can use `/collections spawn` and `/collections capacity-force-add` in the invoking channel. Manual spawns, paid summons, and successful gambles preserve the one-live-drop rule without restarting the normal drop interval. The first human reaction to a live drop claims the skin; any emoji is accepted, and the claim window is configurable.

Drops draw from the generated 1,899-skin catalogue and use full splash art. Administrators set the relative weight for every in-game rarity; a weight of zero excludes that rarity, along with the default capacity, capacity price, summon price, steal chance, grace period, and sell value for each rarity. Every live drop displays its rarity's exact spawn percentage, calculated from both the configured rarity weights and the number of eligible catalogue skins in each rarity. Each live or collected item receives a unique active four-digit KnowLeague ID, and a catalogue skin cannot be held by more than one active collection. Stealing debits three times the configured sell price and starts a 30-minute cooldown only after a paid attempt; insufficient funds do not consume a cooldown. Drops, claims, capacity checks, KnowBucks changes, expirations, stealing, selling, and transfers are database-authoritative, so only one reaction can win and concurrent commands cannot exceed a member's collection capacity.

## Local setup

1. In the Discord application already used by the website's `DISCORD_CLIENT_ID`, open **Bot** and add a bot user; copy the application ID and bot token. If website OAuth has not been configured yet, create one Discord application and use that same application for both OAuth and the bot. `DISCORD_APPLICATION_ID` must equal the website's `DISCORD_CLIENT_ID`.
2. In **Bot > Privileged Gateway Intents**, enable **Message Content Intent**. It is required for the bounded `/snipe` cache, the administrator-selected `/steal-emoji` source message, and successful DISBOARD-bump confirmation. Leave **Server Members Intent** and **Presence Intent** disabled. Leveling and skin claims continue to use **Guild Messages**, **Guild Message Reactions**, **Guild Moderation**, and **Guild Voice States**; the bot never receives voice audio.
3. In **OAuth2 > URL Generator**, select `bot` and `applications.commands`. Under Bot Permissions select **View Channels**, **Read Message History**, **Send Messages**, **Embed Links**, **Manage Roles**, and **Create Expressions**. The first four permissions are needed in every configured skin-drop channel; **Manage Roles** is needed only for level rewards and the optional champion role; **Create Expressions** is needed only for `/steal-emoji`. Then use the generated URL to invite or re-authorize the bot in the KnowLeague server. Do not grant Administrator. Move the KnowLeague bot's server role above every level-reward role and the optional champion role it should grant.
4. Copy `discord-bot/.env.example` to `discord-bot/.env` and set each value. The bot loads this local file automatically when run from its workspace. Use the same Supabase project as the website. Keep `SUPABASE_SERVICE_ROLE_KEY` only in this local file or the bot host's secret manager. Set `DISCORD_BUMP_CHANNEL_ID` to enable the 2,500-KnowBuck confirmed-DISBOARD-bump reward; leave it empty to keep that feature disabled.
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

After changing `src/commands.ts`, run `npm run discord:commands:register` once with production bot credentials. Guild commands update quickly and do not require a website deployment. After applying migration 173, deploy the bot and register the revised command set; do not enable Message Content until the narrow retention policy above has been reviewed.

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
