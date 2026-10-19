export type StaffChangelogEntry = {
  id: string;
  patch: string;
  /** ISO 8601 timestamp in UTC for when the patch was made. */
  timestamp: string;
  title: string;
  summary: string;
  details: readonly string[];
  impact: readonly string[];
  files: readonly string[];
  verification: readonly string[];
};

/**
 * Internal, version-controlled changelog entries. New impactful patches must
 * be added at the beginning with a precise UTC timestamp and operational/security detail.
 */
export const STAFF_CHANGELOG_ENTRIES: readonly StaffChangelogEntry[] = [
  {
    id: 'patch-2026-10-19-discord-fishing-beta-hardening',
    patch: 'patch-2026-10-19-discord-fishing-beta-hardening',
    timestamp: '2026-10-19T03:30:31.681Z',
    title: 'Harden Discord fishing settlement and crew selection',
    summary:
      'Discord fishing now rejects a selected active crew slot before its database call, and settlement returns its committed balance in the same transaction used to award rewards and one-time gear.',
    details: [
      'The expedition launcher now validates both automatic and explicitly selected crew slots against the player\'s active trips. This avoids an unnecessary unique-slot write attempt and gives a precise member-facing message.',
      'Migration 162 changes settlement locking so the player record is locked before the expedition record, avoiding a start-versus-settlement lock cycle. It re-checks the active expedition after acquiring that lock so simultaneous reconcilers remain idempotent.',
      'Settlement now creates or locks the KnowBucks balance for every completed expedition, including no-fish returns, and returns that exact final balance alongside the committed result. Completion delivery no longer depends on a second database read after the settlement transaction.',
      'Discord Configuration now switches back to the all-channels default when an administrator deselects the last individually allowed fishing channel, preserving the selected-channels invariant before the settings request is sent.',
      'Fishing tests now exercise every rod\'s rarity boundary across deterministic outcomes, Truffle Worm and gear result invariants, requested crew-slot rejection, and the complete beta bait, skill, and gear catalogue.',
    ],
    impact: [
      'Apply migration 162 after migrations 157 through 161 and before the matching bot deployment. It remains local only; existing expeditions, inventories, and balances are preserved.',
      'This is a Discord bot, database, and configuration-page reliability patch. It does not change slash-command shapes or player-visible balance rules.',
      'The completion-message fallback behavior is retained, while the final balance shown in a completion embed now comes from the same atomic settlement that granted it.',
    ],
    files: [
      'supabase/migrations/162_harden_discord_fishing_settlement.sql',
      'discord-bot/src/fishing.ts',
      'components/discord-leveling-settings.tsx',
      'tests/discord-fishing.test.ts',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'Expanded deterministic fishing tests for catalogue, rarity, bait, gear, and crew-slot safety.',
      'Targeted fishing tests passed (12 checks); npm run check then passed lint, root type-check, the full Vitest suite (196 tests), and Discord bot type-check. Existing unrelated Next.js <img> lint warnings remain.',
      'Migration 162 was created locally only and has not been pushed or applied.',
    ],
  },
  {
    id: 'patch-2026-10-18-discord-fishing-rods-baits-skills-and-gear',
    patch: 'patch-2026-10-18-discord-fishing-rods-baits-skills-and-gear',
    timestamp: '2026-10-18T02:30:00.000Z',
    title: 'Expand Discord fishing progression and treasure gear',
    summary:
      'Discord fishing now has seven rod tiers, six specialty baits, levelled skills, one-time treasure gear, Kelp Forest Uncommon/Rare chests, and an empty Mythic-ready catch tier for the future catalogue.',
    details: [
      'Plastic, Wooden, Fiberglass, Reinforced, Master, Celestial, and God Rods constrain exact catchable rarities without changing the existing Common-through-Legendary selection weights. God Rod supports Mythic, but the Mythic fish catalogue is intentionally empty until named Mythic fish and their weights are designed.',
      'Chum and Bloodworms each give qualifying catches an independent 10–30% chance to add another matching fish. Magnet multiplies chest-spawn odds by 1.5, Sonar halves fish-roll success and doubles the 0.1% gear chance, Mysterious Sea Food has a 20% chance to add 50% fish rolls, and Truffle Worm triples legendary selection weight while suppressing non-legendary returns.',
      'Lucky, Cheapskate, Money Mouser, and Haste now support the requested levels and additive effects. Shop prices apply owned Cheapskate and Lost Pursasion Device reductions at purchase time, while expedition snapshots make luck, money, haste, rod, bait, and gear effects immutable for an active trip.',
      'Eleven permanent gear items can appear only in their specified biome or everywhere, are awarded at most once through the existing inventory primary key, and are shown as a prominent GEAR FOUND result row. The settlement RPC serializes a player’s gear awards and returns only newly awarded gear for display.',
      'Migration 161 remaps retired rods, lures, and legacy passive upgrades; changes all new fishing profiles to Plastic Rod; preserves active-expedition snapshots; supports immediate non-crew Teleporter returns; and replaces settlement without changing its call arguments.',
    ],
    impact: [
      'Apply migration 161 after migrations 157 through 160 before deploying the bot. Existing fishing ownership and active trips are mapped to compatible replacement items; no manual inventory or expedition backfill is required.',
      'This remains a shared reconciler rather than a per-player timer. It locks the player’s fishing row before one-time gear awards, preventing concurrent settlements from duplicating gear.',
      'This is a Discord bot and database feature. No website deployment or command registration is required for the new progression itself; register commands separately if the previously added /fish help command has not yet been registered.',
    ],
    files: [
      'supabase/migrations/161_expand_discord_fishing_progression.sql',
      'discord-bot/src/fishing-catalog.ts',
      'discord-bot/src/fishing.ts',
      'discord-bot/src/interactions.ts',
      'discord-bot/README.md',
      'tests/discord-fishing.test.ts',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'Expanded the fishing catalogue tests for Kelp Forest chest rarities, Mythic standby, rod tiers, cost reduction, and time reduction.',
      'The npm run check lint and root type-check stages passed; the complete Vitest suite (192 tests), Discord bot type-check, targeted fishing tests, and direct ESLint of each changed source also passed.',
      'Migration 161 was created locally only and has not been pushed or applied.',
    ],
  },
  {
    id: 'patch-2026-10-17-discord-fishing-help-and-inventory-copy',
    patch: 'patch-2026-10-17-discord-fishing-help-and-inventory-copy',
    timestamp: '2026-10-17T22:20:00.000Z',
    title: 'Add focused Discord fishing help',
    summary:
      'Discord members can now run /fish help for expedition and progression guidance, while the inventory panel no longer repeats a top-level explanation of equipment and upgrade behavior.',
    details: [
      'The new /fish help subcommand gives the exact expedition launch shape, explains status checks and automatic fish sales, points members to shop and inventory commands, describes held chest status, and documents crew timing and reward trade-offs.',
      'Fishing inventory now begins directly with equipped items, progression, owned upgrades, and chests. Contextual success notices after an inventory action remain visible.',
      'The help subcommand uses the existing /fish channel-scope enforcement, so administrators’ Fishing configuration remains authoritative for every fishing interaction.',
    ],
    impact: [
      'Re-register Discord guild commands before deploying the bot so /fish help appears in Discord.',
      'This is a bot-only command and presentation change with no database schema, migration, or website deployment requirement.',
      'No message content or new player data is collected; help is a static public response within the configured guild.',
    ],
    files: [
      'discord-bot/src/commands.ts',
      'discord-bot/src/interactions.ts',
      'tests/discord-fishing.test.ts',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'Extended the fishing command contract test to require the /fish help subcommand.',
      'npm run check completed lint and root type-check successfully; the full Vitest suite (190 tests) and Discord bot type-check then passed in the same workspace verification run.',
    ],
  },
  {
    id: 'patch-2026-10-17-discord-fishing-completion-polish',
    patch: 'patch-2026-10-17-discord-fishing-completion-polish',
    timestamp: '2026-10-17T22:00:00.000Z',
    title: 'Make Discord fishing returns prompt and legible',
    summary:
      'Discord fishing now checks for due expeditions every five seconds, shows the requested sold-fish payout copy, removes redundant launch-panel text, and marks inventory chests with their rarity color.',
    details: [
      'The shared due-expedition scheduler runs every five seconds instead of every 30 seconds, reducing the normal wait between an expedition completion timestamp and its launch-message update while retaining one indexed, batched reconciler and the existing overlap guard.',
      'Completion embeds now say “You earned X KnowBucks from your sold fish. New balance: Y KnowBucks.” and launch embeds contain only the crew, duration, and completion-time status.',
      'Chest rows display a colored square alongside their existing explicit rarity name: white for Common, green for Uncommon, blue for Rare, purple for Epic, and yellow for Legendary. Discord embed markdown does not support arbitrary inline text colors, so the markers provide clear color coding without hiding the written rarity.',
    ],
    impact: [
      'Players normally see a due expedition settle within five seconds; restarting the bot retains the durable database expedition and the reconciler catches it after startup.',
      'The added five-second shared query uses the existing due-expedition index and processes at most 25 overdue rows per pass. It does not create a timer per player or read Discord message content.',
      'This is a bot-only behavior and presentation update. It introduces no database schema or RPC changes and preserves public owner-controlled fishing panels and completion fallback delivery.',
    ],
    files: [
      'discord-bot/src/fishing.ts',
      'discord-bot/src/interactions.ts',
      'tests/discord-fishing.test.ts',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'Added coverage for the exact completion copy and all five chest rarity markers.',
      'The targeted fishing suite and full Vitest suite passed (190 tests); root and bot type checks plus direct ESLint for every changed source passed.',
      'npm run check was attempted, but its Next lint wrapper could not access the existing dev server’s locked .next ESLint cache. The dev server was left running; no production build or cache cleanup was performed.',
    ],
  },
  {
    id: 'patch-2026-10-17-discord-fishing-settlement-column-ambiguity',
    patch: 'patch-2026-10-17-discord-fishing-settlement-column-ambiguity',
    timestamp: '2026-10-17T21:15:00.000Z',
    title: 'Restore Discord fishing expedition settlement',
    summary:
      'Due Discord fishing expeditions can now settle again because the settlement RPC no longer ambiguously resolves its returned guild and user identifiers as table columns.',
    details: [
      'Migration 160 replaces settle_discord_fishing_expedition without changing its arguments, result fields, atomic row lock, payout calculation, inventory-chest handling, or completion-message flow.',
      'The replacement uses named primary-key constraints for balance and inventory upserts and explicit table aliases for row predicates, preventing the function\'s RETURNS TABLE guild_id and discord_user_id variables from colliding with table-column references.',
      'An active expedition that previously failed with “column reference guild_id is ambiguous” remains active and is settled normally by the next 30-second reconciler run or /fish expedition-progress after migration 160 is applied.',
    ],
    impact: [
      'Apply migration 160 after migrations 157 through 159. No data backfill or manual expedition update is needed because unsuccessful settlement attempts did not mark the expedition completed or award currency.',
      'The deployed bot code already calls the unchanged RPC signature, so this correction requires a database migration but no command registration, website deployment, or bot-code deployment. Restarting the bot after the migration is optional; its next normal reconciliation tick settles the pending expedition.',
      'The migration preserves service-role-only RPC access and reloads the PostgREST schema after replacement.',
    ],
    files: [
      'supabase/migrations/160_fix_discord_fishing_settlement_column_ambiguity.sql',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'Reviewed the deployed settlement call site and migrations 157 through 159 to confirm the RPC signature and bot result contract are unchanged.',
      'npm run check passed after the migration and changelog update.',
      'Migration was created locally only and has not been pushed or applied.',
    ],
  },
  {
    id: 'patch-2026-10-18-discord-fishing-panels-and-channel-controls',
    patch: 'patch-2026-10-18-discord-fishing-panels-and-channel-controls',
    timestamp: '2026-10-18T02:15:00.000Z',
    title: 'Harden Discord fishing panels and expedition completion',
    summary:
      'Discord fishing shop and inventory controls now expire after one minute of inactivity, Boat Upgrades render within Discord component limits, completed expeditions update their launch message with catches and balance, and administrators can restrict /fish commands by channel.',
    details: [
      'Fishing shop and inventory component IDs carry a one-minute expiry timestamp. Active panels are edited to an expired state when the timer elapses, and expired controls remain safely unusable after a bot restart. Using a valid control refreshes the one-minute inactivity window.',
      'Shop purchase controls are chunked into action rows of at most five buttons. This fixes the Boat Upgrades category, which has six upgrades and previously produced Discord API error 50035.',
      'The launch interaction message ID is stored on each active expedition. Once settlement completes, the bot replaces that message with the caught fish/chests, total KnowBucks earned, and the player’s resulting balance; if it was deleted or cannot be edited, the bot sends the existing completion fallback instead.',
      'Completion embeds split high-yield catch lists across Discord-safe fields instead of truncating entries when an expedition produces more text than a single field allows.',
      'Fishing reconciliation now starts independently of Discord role and text-channel metadata sync. A manual /fish expedition-progress check also reconciles due trips immediately, while the normal 30-second batch remains idempotent and concurrency-protected.',
      'Discord Configuration now includes a Fishing tab. It defaults to all channels and can be changed to up to 100 synced sendable text channels; the bot caches that scope for 30 seconds to limit database reads and enforces it for both slash commands and active fishing panels.',
    ],
    impact: [
      'Apply migration 159 before deploying the website or bot. Existing active expeditions without a stored launch message still settle once and use a completion notice; newly launched trips update in place.',
      'Administrators can visit Profile → Discord Configuration → Fishing to set the permitted /fish channels. Selecting individual channels requires at least one selection; All channels restores the default.',
      'No browser receives privileged database credentials. Fishing settings, channel validation, message attachment, and settlement remain behind the existing server/service-role boundary.',
    ],
    files: [
      'supabase/migrations/159_discord_fishing_panels_and_command_channels.sql',
      'lib/discord-fishing.ts',
      'app/api/discord/leveling/route.ts',
      'components/discord-leveling-settings.tsx',
      'discord-bot/src/fishing.ts',
      'discord-bot/src/interactions.ts',
      'discord-bot/src/index.ts',
      'discord-bot/README.md',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: Next.js lint, root type-check, 41 Vitest files / 189 tests, and Discord bot type-check all completed successfully.',
      'The only lint output was the existing img-element optimization warnings in unrelated profile and Riftbound components.',
      'Migration was reviewed for append-only safety, RLS, service-role grants, validation, foreign keys, and PostgREST schema reload. It was created locally and has not been pushed.',
    ],
  },
  {
    id: 'patch-2026-10-18-discord-fishing-biome-progression-rework',
    patch: 'patch-2026-10-18-discord-fishing-biome-progression-rework',
    timestamp: '2026-10-18T00:50:00.000Z',
    title: 'Rework Discord fishing biomes and progression',
    summary:
      'Discord fishing now uses seven permanent boat-upgrade biomes, level-gated expedition lengths, catch-count balancing without storage, biome-scoped chest rarity, lower fixed fish sale ranges, and two separate crew ventures.',
    details: [
      'The fishing catalogue replaces the initial three-biome list with Harbor, Warm Ocean, Hydroplant Reservoir, Sunken Sea, Kelp Forest, Crystaline Caverns, and Rallypoint Delta, including every requested common through legendary catch and its fixed sale range.',
      'The probability model now uses the requested 1000/200/100/20/1 rarity weights. Lucky Charm continues to increase non-common weights, Money Mouser continues to increase fish sale values, and the new Abyssal Rod makes listed legendary fish catchable.',
      'Expedition lengths are now 30 seconds for one catch, 60 seconds for two to three catches at level 20, 120 seconds for five to six catches at level 50, and 300 seconds for twelve to fifteen catches at level 80. Storage no longer changes catch count during this balance pass.',
      'Sail, Abiotic Turbine, Submersible Pod, Magic Conch Navigator, Drill Unit, and Radar Scanner are permanent boat upgrades gated by their configured chat levels and KnowBucks prices. They unlock access to their corresponding biomes without requiring an equipped boat.',
      'Crew 1 and Crew 2 are stored separately from the retired experimental crew-slot field, require their specified chat levels and prices, and independently run the same unlocked expeditions at triple duration and half normal-fish sale value.',
      'Chest rarity is selected only from each biome’s allowed rarity set, using the configured 20%, 10%, 5%, 1%, and 0.1% rates. Chest drops are retained in inventory but are not consumed until named chest loot is designed; treasure, pets, catalogue progress, storage, and further gear remain held.',
    ],
    impact: [
      'Apply migration 158 after migration 157, then redeploy the Discord bot and re-register the changed /fish command shape. Existing inventory remains intact; retired initial storage and boat entries simply have no gameplay effect in the new progression model.',
      'This remains a low and predictable runtime-cost feature: one durable expedition row per trip and one shared 30-second settlement batch, with no per-user in-memory timers or message-content collection.',
      'Players can now begin short Harbor expeditions immediately. Higher biomes, expedition lengths, boats, and crews make both the required chat level and KnowBucks cost visible before a purchase or trip begins.',
    ],
    files: [
      'supabase/migrations/158_rework_discord_fishing_progression.sql',
      'discord-bot/src/fishing-catalog.ts',
      'discord-bot/src/fishing.ts',
      'discord-bot/src/commands.ts',
      'discord-bot/src/interactions.ts',
      'discord-bot/README.md',
      'tests/discord-fishing.test.ts',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed (including Next.js lint, root type-check, full Vitest suite, and Discord bot type-check); pre-existing Next.js img-element warnings in unrelated profile and Riftbound components remain.',
      'Targeted Vitest verification passed: tests/discord-fishing.test.ts, with 5 tests; direct ESLint passed for all changed bot, test, and changelog sources.',
      'Migration was reviewed for level gates, independent crew ownership, duration-tier expansion, service-role grants, and schema reload. It was created locally and has not been pushed.',
    ],
  },
  {
    id: 'patch-2026-10-17-discord-fishing-expedition-foundation',
    patch: 'patch-2026-10-17-discord-fishing-expedition-foundation',
    timestamp: '2026-10-17T02:00:00.000Z',
    title: 'Add durable Discord fishing expeditions',
    summary:
      'Discord now has the first server-authoritative fishing game slice: expeditions across three boat-gated biomes, automatically sold normal fish, chests, KnowBucks upgrades, inventory equipment, crew slots, and a 30-second completion reconciler.',
    details: [
      'Migration 157 creates isolated fishing player, inventory, and expedition records; seeds four starter items; extends the KnowBucks transaction allowlist; and adds security-definer RPCs for initialization, expedition starts, shop purchases, equipment changes, atomic settlement, and chest opening.',
      'An expedition persists its selected crew slot, biome, duration, completion time, equipped-item snapshot, and a server-generated outcome seed before it begins. The result is computed from that snapshot only when due, so later equipment changes cannot alter an active trip.',
      'The bot reconciles up to 25 overdue expeditions every 30 seconds. The settlement RPC locks the active row before granting KnowBucks and inventory chests, allowing restarts and overlapping ticks without duplicate payouts. Notification delivery happens only after settlement and does not change the completed result if a channel is unavailable.',
      'The /fish command provides expedition-set, expedition-progress, shop, inventory, chests-open, and catalogue subcommands. Shop and inventory controls are owner-bound public panels; rods, bait, storage, and boats equip immediately after purchase, while gear and skills are passive once owned.',
      'The first catalogue exposes the planned legendary fish set, while catchable fish currently stop at epic rarity. Pets, legendary catches, special phenomena, collection-skin or Riftbound rewards, and the broader skill system remain future work rather than partially enabled rewards.',
    ],
    impact: [
      'Apply migration 157 before deploying the bot. Then restart or redeploy the Discord service and run npm run discord:commands:register with the production bot environment so /fish is available in the configured guild.',
      'This feature adds only one durable row per player/item/expedition plus a 30-second batched due-expedition query. It does not create a per-player process timer or poll Discord message contents, which keeps runtime and database cost predictable as participation grows.',
      'Fishing currency and inventory operations use the existing service-role-only bot boundary; browser clients receive no new privileged credentials or direct access to the new tables.',
    ],
    files: [
      'supabase/migrations/157_discord_fishing_foundation.sql',
      'discord-bot/src/fishing-catalog.ts',
      'discord-bot/src/fishing.ts',
      'discord-bot/src/commands.ts',
      'discord-bot/src/interactions.ts',
      'discord-bot/src/index.ts',
      'discord-bot/README.md',
      'tests/discord-fishing.test.ts',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed (including Next.js lint, root type-check, complete Vitest suite, and Discord bot type-check); existing Next.js img-element warnings in unrelated profile and Riftbound components remain.',
      'Targeted Vitest verification passed: tests/discord-fishing.test.ts and tests/discord-command-visibility.test.ts, with 5 tests total.',
      'Migration was reviewed for transaction boundaries, validation, RLS, service-role grants, schema reload, crew-slot uniqueness, and atomic KnowBucks changes. It has been created locally and has not been pushed.',
    ],
  },
  {
    id: 'patch-2026-10-16-discord-public-user-command-responses',
    patch: 'patch-2026-10-16-discord-public-user-command-responses',
    timestamp: '2026-10-16T23:45:00.000Z',
    title: 'Publish ordinary Discord command responses',
    summary:
      'Non-administrative Discord slash commands now post their panels, confirmations, and validation responses publicly, while staff-gated operations remain ephemeral.',
    details: [
      'Public replies now cover /help, /link, /profile, /xp view, /knowbucks balance and pay, leaderboard responses, and all non-staff collection actions, including their validation and insufficient-funds messages.',
      'Manual XP, KnowBucks administration, collection spawn, and forced capacity additions remain private from authorization through result. A shared command-shape helper keeps uncaught failure replies consistent with that boundary.',
      'Collection paginator controls stay owner-bound and their denial replies remain ephemeral so members cannot create public noise by pressing another member’s controls.',
    ],
    impact: [
      'Restart or redeploy the Discord bot to apply the new response visibility. No migration, website deployment, or slash-command registration is required.',
      'KnowBucks balances, payments, user XP views, and collection transaction outcomes are now visible to everyone in the configured server by design.',
    ],
    files: [
      'discord-bot/src/interactions.ts',
      'discord-bot/src/index.ts',
      'discord-bot/README.md',
      'tests/discord-command-visibility.test.ts',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run typecheck and npm run discord:check passed.',
      'Targeted Vitest verification passed: 2 test files and 9 tests.',
      'Direct ESLint passed for the changed bot, test, and changelog sources; git diff --check and trailing-whitespace validation passed.',
    ],
  },
  {
    id: 'patch-2026-10-16-discord-skin-gamble-timer-schedule',
    patch: 'patch-2026-10-16-discord-skin-gamble-timer-schedule',
    timestamp: '2026-10-16T23:30:00.000Z',
    title: 'Keep automatic skin-drop timing after a successful gamble',
    summary:
      'Successful /collections gamble drops now preserve the existing automatic skin-drop schedule, matching staff spawns and paid summons.',
    details: [
      'Migration 156 replaces the gamble RPC without the last_drop_at update that migration 155 had retained for successful gambles.',
      'Gamble capacity, ownership, live-drop, loss, claim-grace, and transaction behavior are unchanged; only automatic schedule postponement is removed.',
    ],
    impact: [
      'Apply migration 156 after migration 155. The existing bot calls this RPC on every gamble, so no bot restart, website deployment, or slash-command registration is required for this timing change.',
    ],
    files: [
      'supabase/migrations/156_discord_skin_claim_gamble_schedule.sql',
      'discord-bot/README.md',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'Migration body was reviewed to confirm no last_drop_at write remains in the replacement gamble RPC.',
      'npm run typecheck and npm run discord:check passed; targeted skin-claim tests passed: 1 file and 8 tests.',
      'Direct ESLint for the changelog and git diff --check passed; migration trailing-whitespace validation passed.',
      'Migration was created locally and has not been pushed.',
    ],
  },
  {
    id: 'patch-2026-10-16-discord-skin-rarity-spawn-chance',
    patch: 'patch-2026-10-16-discord-skin-rarity-spawn-chance',
    timestamp: '2026-10-16T23:15:00.000Z',
    title: 'Show exact rarity odds on Discord skin drops',
    summary:
      'Every live Discord skin drop now shows the exact probability of its rarity under the server’s current skin catalogue and configured rarity weights.',
    details: [
      'The displayed rarity chance uses the same per-skin weighted-selection model as the drop picker: it multiplies each enabled rarity weight by its eligible catalogue count and divides the selected rarity’s weighted count by the total.',
      'The chance is calculated when a chat, timed, staff, summon, or successful gamble drop is created and is shown inside the mobile-friendly Skin metadata block.',
      'Collection and claimed-skin views remain historical item records and do not display a potentially stale configuration-derived probability.',
    ],
    impact: [
      'Restart or redeploy the Discord bot to display rarity probabilities on newly posted skin drops. No migration, website deployment, or slash-command registration is required.',
    ],
    files: [
      'discord-bot/src/skin-claims.ts',
      'discord-bot/README.md',
      'tests/discord-skin-claims.test.ts',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run typecheck and npm run discord:check passed.',
      'Targeted Vitest verification passed: 1 test file and 8 tests.',
      'Direct ESLint passed for the touched TypeScript sources; git diff --check and trailing-whitespace validation passed.',
    ],
  },
  {
    id: 'patch-2026-10-16-discord-skin-layout-and-timer-schedule',
    patch: 'patch-2026-10-16-discord-skin-layout-and-timer-schedule',
    timestamp: '2026-10-16T23:00:00.000Z',
    title: 'Preserve automatic skin-drop timing for manual drops',
    summary:
      'Manual collection spawns and paid summons no longer postpone the automatic skin-drop schedule; skin embeds now use a compact two-block layout and level-up templates support non-pinging usernames.',
    details: [
      'Migration 155 replaces the manual reservation RPC so /collections spawn and /collections summon retain the existing last automatic drop time while still serializing against scheduled/message drops and enforcing one live drop.',
      'A successful gamble remains a game-generated drop and continues to restart the automatic interval, preserving its existing timing behavior.',
      'Skin drop, claimed-skin, and public collection embeds group the same metadata into two inline fields so Discord mobile clients can use the available width more reliably.',
      'Level-up message templates now accept {username}, which renders the member\'s Discord username as plain text. The established {user} token still produces an intentional mention.',
    ],
    impact: [
      'Apply migration 155, then restart or redeploy the Discord bot. No slash-command registration is needed because command shapes are unchanged.',
      'Deploy the website to show the new {username} template guidance. Administrators can use, for example, **{username}** reached level **{level}**! without pinging the member.',
    ],
    files: [
      'supabase/migrations/155_discord_skin_claim_manual_drop_schedule.sql',
      'discord-bot/src/skin-claims.ts',
      'discord-bot/src/leveling.ts',
      'components/discord-leveling-settings.tsx',
      'discord-bot/README.md',
      'tests/discord-skin-claims.test.ts',
      'tests/discord-leveling.test.ts',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run typecheck and npm run discord:check passed.',
      'Targeted Vitest verification passed: 2 test files and 12 tests.',
      'Direct ESLint passed for the touched website, bot, test, and changelog sources; git diff --check passed.',
      'Migration was created locally and has not been pushed.',
    ],
  },
  {
    id: 'patch-2026-10-16-discord-collections-admins-and-steal-hardening',
    patch: 'patch-2026-10-16-discord-collections-admins-and-steal-hardening',
    timestamp: '2026-10-16T22:00:00.000Z',
    title: 'Harden Discord collection administration and paid theft',
    summary:
      'Separated collection administration from XP and KnowBucks staff access, corrected live collection RPC column ambiguities, and made theft a transactional paid action with a cooldown.',
    details: [
      'Migration 154 adds a dedicated Collections admin-role configuration, initially copying existing staff-role access so current /collections spawn and /collections capacity-force-add users retain access until an administrator changes the selection.',
      'The replacement transfer and sale RPCs fully qualify skin_code and amount references, resolving the PostgreSQL ambiguity that blocked /collections give and /collections sell after migration 153.',
      'Theft now recreates its bot-facing RPC with an expanded response, debits three times the claimed skin’s configured sale value in the same locked database transaction, records the collection_steal ledger source, and applies a 30-minute cooldown only after a paid attempt. Insufficient balances, full collections, own items, and missing items do not start a cooldown.',
      'Collection embeds omit the redundant claimed-skin description and always show the viewer’s capacity at the end of the header. Catalogue search previews now include their KnowLeague catalogue ID.',
      'Slash-command and /help copy state the default/configured KnowBucks costs or price formula for every paid collection action.',
    ],
    impact: [
      'Apply migration 154 before deploying the website configuration update; it creates the new RPC overload and collection-admin tables that the updated configuration endpoint requires.',
      'Set one or more Collections admin roles in Discord Configuration > Collections to authorize /collections spawn and /collections capacity-force-add. XP and KnowBucks administration remains controlled by the existing staff-role setting.',
      'Re-register guild commands after deployment so Discord receives the revised paid-command descriptions, then restart or redeploy the bot and deploy the website.',
    ],
    files: [
      'supabase/migrations/154_discord_collections_admins_steal_costs_and_rpc_fixes.sql',
      'app/api/discord/leveling/route.ts',
      'components/discord-leveling-settings.tsx',
      'discord-bot/src/commands.ts',
      'discord-bot/src/interactions.ts',
      'discord-bot/src/skin-claims.ts',
      'discord-bot/README.md',
      'tests/discord-skin-claims.test.ts',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run typecheck and npm run discord:check passed.',
      'npm run test:run passed: 39 test files and 180 tests.',
      'Direct ESLint passed for every touched website, bot, shared-library, and targeted-test source file; git diff --check passed.',
      'Migration was created locally but not pushed. Guild command registration and bot/website deployments were not performed locally.',
    ],
  },
  {
    id: 'patch-2026-10-16-discord-collections-economy',
    patch: 'patch-2026-10-16-discord-collections-economy',
    timestamp: '2026-10-16T21:30:00.000Z',
    title: 'Expand Discord collections with capacity, economy, and social actions',
    summary:
      'Reworked Discord skin collections around the /collections command, adding transactional KnowBucks actions, collection capacity, favourites, theft, gambling, sales, and configurable collection economy controls.',
    details: [
      'The canonical /collections command and mirrored /cl command now provide collection browsing, give, staff spawn in the invoking channel, paid summon, capacity purchase and staff capacity grants, steal, favourite, gamble, search, and sell actions. The retired /skins and top-level /spawn command shapes are removed on the next guild-command registration.',
      'Migration 153 adds service-only collection-economy settings, sell values, per-member extra capacity, acquisition metadata, favourite ordering, and atomic RPCs. Claiming, transfer, summon, capacity purchase, steal, sale, and gamble operations lock and validate authoritative database state before changing ownership or KnowBucks.',
      'Summons debit the configured price only when a drop can be reserved, refund if the bot cannot post that reserved drop, and give the purchaser the configured temporary claim grace period. Gambles use a fixed 25% spawn chance and now verify that no live drop exists before consuming the source skin.',
      'Collection pages order a favourite first and display acquisition date plus claimed, stolen, or transferred ownership method. Search previews use the local generated catalogue and are explicitly non-claimable.',
      'Discord Configuration now separates Chat leveling and Collections tabs. The Collections tab configures drop timing/channel scope/rarity weights plus summon price, default capacity, capacity-upgrade price, steal chance, grace period, and per-rarity sale values.',
    ],
    impact: [
      'Apply migrations 152 and 153 in order, redeploy or restart the Discord bot, and run npm run discord:commands:register with the deployment environment. A website deployment is required for the new configuration controls.',
      'Existing staff roles now also authorize /collections spawn and /collections capacity-force-add. No privileged intent or extra Discord permission is required beyond the existing channel, reaction, and role permissions.',
      'The defaults are 5,000 KnowBucks per summon, 10 starting collection slots, 500 KnowBucks per five extra slots, 1% steal chance, and a 10-second summon/gamble grace period; administrators can change them before enabling use.',
    ],
    files: [
      'supabase/migrations/153_discord_skin_claim_collection_economy.sql',
      'app/api/discord/leveling/route.ts',
      'components/discord-leveling-settings.tsx',
      'lib/discord-skin-claims.ts',
      'discord-bot/src/commands.ts',
      'discord-bot/src/interactions.ts',
      'discord-bot/src/skin-claims.ts',
      'discord-bot/README.md',
      'tests/discord-skin-claims.test.ts',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run typecheck, npm run discord:check, and npm run test:run passed (39 files and 177 tests).',
      'Direct ESLint verification passed for every touched website, bot, shared-library, and targeted-test source file; the normal Next lint cache was unavailable because the active development server holds .next/cache/eslint.',
      'Migration and database interaction contracts were manually reviewed for service-role-only access, range validation, channel eligibility, active-drop serialization, capacity enforcement, and summon refund behavior.',
      'Migration was created locally but not pushed. Guild command registration and bot/website deployments were not performed locally.',
    ],
  },
  {
    id: 'patch-2026-10-16-discord-skin-claim-reservation-fix',
    patch: 'patch-2026-10-16-discord-skin-claim-reservation-fix',
    timestamp: '2026-10-16T19:40:58.423Z',
    title: 'Fix Discord skin-drop reservation and response deprecation',
    summary:
      'Resolved the database column ambiguity that blocked skin-drop reservations and migrated Discord interaction replies to the current ephemeral-response flag API.',
    details: [
      'Migration 152 replaces the reservation RPC definitions with explicit INSERT table aliases for the returned expires_at column, allowing both timed/message drops and staff /spawn reservations to complete without changing a restricted PostgreSQL setting.',
      'All private Discord command replies, deferrals, button denials, and failure follow-ups now use MessageFlags.Ephemeral instead of Discord.js’s deprecated ephemeral option.',
      'The change preserves the existing public collection and leaderboard messages; only replies that were already private remain private.',
    ],
    impact: [
      'Staff must apply migration 152 after migrations 149 through 151, then restart or redeploy the Discord bot before retrying /spawn.',
      'No command registration, new Discord permission, privileged gateway intent, or website deployment is required for this correction.',
    ],
    files: [
      'supabase/migrations/152_discord_skin_claim_reservation_column_resolution.sql',
      'discord-bot/src/interactions.ts',
      'discord-bot/src/index.ts',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run discord:check and npm run typecheck passed.',
      'Targeted Discord skin-claim tests and ESLint completed with zero errors; git diff --check passed.',
      'Migration was created locally but not pushed. Bot deployment was not performed locally.',
    ],
  },
  {
    id: 'patch-2026-10-16-discord-skin-claim-channel-scope',
    patch: 'patch-2026-10-16-discord-skin-claim-channel-scope',
    timestamp: '2026-10-16T19:36:48.600Z',
    title: 'Default Discord skin drops to all eligible channels',
    summary:
      'Replaced the dedicated automatic spawn channel with an All-or-selected channel scope for Discord skin drops.',
    details: [
      'Discord Configuration now defaults the Channels that can trigger a drop control to All, covering every currently sendable text channel and automatically including newly synchronized sendable channels.',
      'Administrators can deselect All and choose up to 25 specific channels. The selected scope governs both message-triggered drops and channels used when a timer or /spawn creates a drop.',
      'Maximum-interval and staff /spawn drops select one eligible channel at random, eliminating the automatic spawn channel configuration while retaining the existing timer behavior.',
      'The bot resolves the authoritative channel scope from synchronized Discord channel metadata. Database reservation functions independently revalidate that the selected channel is still sendable and in scope before creating a drop.',
      'Migration 151 adds the all-channels scope, removes the obsolete automatic-channel column, and replaces affected service-only database RPCs without changing claim, transfer, expiry, or one-live-drop invariants.',
    ],
    impact: [
      'The global Skin drops enabled switch remains opt-in, so administrators can continue to pause drops server-wide. Once enabled, the default channel scope is All.',
      'Existing saved skin-claim settings migrate to All. Previously stored selected channels are retained, allowing administrators to switch back to a selected-only scope without re-entering them.',
      'Staff must apply migration 151 after migrations 149 and 150, then restart or redeploy the Discord bot and website. No slash-command registration, privileged gateway intent, or additional Discord permission is needed for this change.',
    ],
    files: [
      'supabase/migrations/151_discord_skin_claim_channel_scope.sql',
      'lib/discord-skin-claims.ts',
      'app/api/discord/leveling/route.ts',
      'components/discord-leveling-settings.tsx',
      'discord-bot/src/skin-claims.ts',
      'discord-bot/src/interactions.ts',
      'discord-bot/README.md',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run discord:check and npm run typecheck passed.',
      'Targeted Discord skin-claim tests and ESLint completed with zero errors; git diff --check passed.',
      'Migration was created locally but not pushed. Website and bot deployment were not performed locally.',
    ],
  },
  {
    id: 'patch-2026-10-16-discord-skin-claim-public-collection-spawn',
    patch: 'patch-2026-10-16-discord-skin-claim-public-collection-spawn',
    timestamp: '2026-10-16T19:24:26.732Z',
    title: 'Publish skin collections and add staff-controlled manual drops',
    summary:
      'Made Discord skin-collection panels visible to the server and added a role-gated /spawn command for immediate, database-authoritative skin drops.',
    details: [
      'The /skins collection response is now a public Discord message, displays the collection owner by name, and keeps its pagination controls bound to the member who opened it so other members cannot replace the panel contents.',
      'The existing Discord staff-role selection now also authorizes /spawn. The bot checks the selected roles server-side before it acknowledges or creates a manual drop.',
      'Manual drops always use the website-configured automatic spawn channel, bypass only the min/max waiting time, reset the next automatic scheduling interval, and preserve the existing single live-drop, atomic reservation, expiry, and four-digit ID safeguards.',
      'Migration 150 explicitly records manual spawn provenance, extends the trigger constraint safely, and serializes manual, message, and timer reservations by locking the guild settings row.',
    ],
    impact: [
      'Any server member can view a collection panel posted through /skins collection; the owner remains the only member who can use its Previous and Next buttons.',
      'A /spawn attempt does not replace an unclaimed live drop. It reports privately when skin claims are disabled, incomplete, or already have an active drop.',
      'Staff must apply migration 150 after migration 149, re-register guild slash commands, and restart or redeploy the bot. Existing Discord staff-role configuration controls the new command; no extra privileged intent or Discord permission is required.',
    ],
    files: [
      'supabase/migrations/150_discord_skin_claim_manual_spawns.sql',
      'components/discord-leveling-settings.tsx',
      'discord-bot/src/commands.ts',
      'discord-bot/src/interactions.ts',
      'discord-bot/src/skin-claims.ts',
      'discord-bot/README.md',
      'tests/discord-skin-claims.test.ts',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run discord:check and npm run typecheck passed.',
      'Targeted Discord skin-claim tests and ESLint completed with zero errors; git diff --check passed.',
      'Migration was created locally but not pushed. Guild command registration and bot deployment were not performed locally.',
    ],
  },
  {
    id: 'patch-2026-10-16-discord-skin-claim-drops',
    patch: 'patch-2026-10-16-discord-skin-claim-drops',
    timestamp: '2026-10-16T18:30:00.000Z',
    title: 'Add configurable Discord skin claim drops and collections',
    summary:
      'Added a server-configured League skin drop game with weighted catalogue selection, atomic reaction claims, four-digit item IDs, collection browsing, and player-to-player skin transfers.',
    details: [
      'Website administrators can enable skin drops, select eligible message-trigger channels plus a required automatic-spawn channel, configure minimum and maximum intervals and a claim window, and set a relative weight from zero to 1,000 for every supported skin rarity.',
      'The Discord bot reads the existing generated skin catalogue locally, chooses a weighted skin only after a database reservation succeeds, posts full splash art and the skin, rarity, champion, release date, skin line, and unique active four-digit ID.',
      'The reservation, expiry, reaction claim, and transfer functions lock authoritative rows in Supabase. Only one pending drop exists per guild, only the first processed human reaction can claim it, and a claimed item cannot be transferred concurrently to multiple members.',
      'A 30-second scheduler checks maximum-interval drops without polling Discord messages. On restart it resumes from persisted scheduling state; an unsent reservation is safely abandoned after a short recovery window instead of blocking future drops indefinitely.',
      'Added /skins collection with private Previous and Next controls bound to the requesting user, and /skins give member skin-id with current-member, bot, self-transfer, and ownership checks.',
      'The bot now synchronizes sendable text-channel metadata for the website settings page and listens to the non-privileged Guild Message Reactions gateway intent. It still never reads or stores user-authored message content or voice audio.',
    ],
    impact: [
      'Skin drops are disabled by default. Enabling them requires at least one text channel available to the bot, an automatic spawn channel selected from that set, and at least one positive rarity weight.',
      'Message-triggered drops occur in the eligible channel where the triggering human message was posted once the minimum interval passes. Maximum-interval drops occur in the selected automatic channel even when chat is quiet.',
      'Each active or collected item has an ID from 1000 through 9999. Expired unclaimed drops release their ID; independently claimed drops may represent the same source skin but remain separate collection items.',
      'Staff must apply migration 149, grant the bot View Channels, Read Message History, Send Messages, and Embed Links in selected drop channels, re-register slash commands, and redeploy or restart the bot. No privileged Discord intent or Administrator permission is needed.',
    ],
    files: [
      'supabase/migrations/149_discord_skin_claims.sql',
      'lib/discord-skin-claims.ts',
      'app/api/discord/leveling/route.ts',
      'components/discord-leveling-settings.tsx',
      'discord-bot/src/skin-claims.ts',
      'discord-bot/src/commands.ts',
      'discord-bot/src/interactions.ts',
      'discord-bot/src/index.ts',
      'discord-bot/src/leveling.ts',
      'discord-bot/Dockerfile',
      'discord-bot/README.md',
      'tests/discord-skin-claims.test.ts',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run discord:check and npm run typecheck passed.',
      'tests/discord-skin-claims.test.ts passed with a single Vitest worker, and targeted ESLint completed with zero errors.',
      'Migration was created locally but not pushed. Guild command registration and bot deployment were not performed locally.',
    ],
  },
  {
    id: 'patch-2026-10-16-discord-knowbucks-foundation',
    patch: 'patch-2026-10-16-discord-knowbucks-foundation',
    timestamp: '2026-10-16T04:22:28.632Z',
    title: 'Add atomic Discord KnowBucks balances and commands',
    summary:
      'Added the ledger-backed KnowBucks currency foundation, automatic rewards for chat and voice level-ups, and balance, payment, and staff-management slash commands.',
    details: [
      'KnowBucks balances are scoped to the configured Discord guild. Every balance mutation records an immutable transaction row with its source, resulting balance, and level or payment counterpart where relevant.',
      'Automatic chat and voice XP awards now calculate KnowBucks in the same database transaction: each crossed level grants its level number multiplied by 1,000. Multiple levels crossed in one XP award receive the sum of every crossed level reward.',
      'Manual /xp add and /xp set-level operations intentionally do not issue KnowBucks, preventing administrative leveling corrections from minting currency.',
      'Added /knowbucks balance [member], /knowbucks pay member amount, and role-protected /knowbucks add, remove, and set. Payments lock both account balances in a stable order and are recorded as matching debit and credit rows.',
      'The existing Discord Configuration staff-role selection now governs both manual XP and KnowBucks administration. Balance and payment responses remain ephemeral.',
    ],
    impact: [
      'Level 1 grants 1,000 KnowBucks, Level 2 grants 2,000, and so on. A member who automatically advances from Level 2 to Level 4 receives 7,000 KnowBucks for Levels 3 and 4.',
      'Staff removal clamps a balance at zero rather than creating debt. Members cannot pay themselves, bots cannot own KnowBucks, and insufficient payments are rejected atomically.',
      'The schema provides a current-balance table plus an append-only transaction history suitable for the planned shop without requiring a per-message currency write.',
      'Staff must apply migration 148, re-register the bot guild commands, and restart or redeploy the Discord bot. No new Discord permission or privileged intent is needed.',
    ],
    files: [
      'supabase/migrations/148_discord_knowbucks.sql',
      'discord-bot/src/commands.ts',
      'discord-bot/src/interactions.ts',
      'discord-bot/src/knowbucks.ts',
      'discord-bot/src/leveling.ts',
      'components/discord-leveling-settings.tsx',
      'discord-bot/README.md',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run discord:check, npm run typecheck, and npm run test:run passed.',
      'Targeted ESLint completed with zero errors and git diff --check passed. npm run check was not used because the active development server owns the shared .next cache.',
      'Migration was created locally but not pushed; Discord command registration and deployment were not performed locally.',
    ],
  },
  {
    id: 'patch-2026-10-16-discord-voice-leveling',
    patch: 'patch-2026-10-16-discord-voice-leveling',
    timestamp: '2026-10-16T01:57:04.645Z',
    title: 'Award Discord XP for voice-channel time',
    summary:
      'Added atomic, session-based voice XP at one XP per completed minute for non-bot members in server voice and stage channels.',
    details: [
      'Guild Voice States are observed without joining calls or reading voice audio. A session starts on voice-channel entry, remains active across channel moves, and is settled once on disconnect.',
      'The database stores only the active session start timestamp. Its award function locks and consumes that session before applying XP, so concurrent events cannot issue duplicate awards.',
      'The existing leveling enabled setting governs voice XP. Voice awards use the same cumulative XP, Lurkr level curve, reward-role synchronization, level-up messages, leaderboard, and ban reset as chat XP.',
      'Bot startup reconciles persisted sessions with current voice states, discarding stale sessions and starting tracking for currently connected non-bot members. Bans now also remove an active voice session before resetting XP.',
    ],
    impact: [
      'Members earn one XP for every completed minute connected to a voice or stage channel. Time is settled at disconnect, so the feature adds one lightweight database write path per join and leave rather than one write every minute.',
      'Voice XP level-up announcements require the existing configured announcement channel. When the announcement channel is left blank, voice awards still grant XP and roles but do not post an announcement because a voice channel cannot receive text messages.',
      'Guild Voice States is a non-privileged Discord gateway intent. No Developer Portal privileged-intent toggle, new bot permission, or slash-command registration is required.',
      'Staff must apply migration 147 and restart or redeploy the Discord bot before voice XP can be earned.',
    ],
    files: [
      'supabase/migrations/147_discord_voice_leveling.sql',
      'discord-bot/src/index.ts',
      'discord-bot/src/leveling.ts',
      'discord-bot/README.md',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run discord:check, npm run typecheck, and npm run test:run passed.',
      'Targeted ESLint completed with zero errors and git diff --check passed. npm run check was not used because the active development server owns the shared .next cache.',
      'Migration was created locally but not pushed; no Discord command registration or deployment was performed locally.',
    ],
  },
  {
    id: 'patch-2026-10-16-discord-leveling-runtime-hardening',
    patch: 'patch-2026-10-16-discord-leveling-runtime-hardening',
    timestamp: '2026-10-16T00:19:58.459Z',
    title: 'Harden Discord leveling runtime traffic and champion scheduling',
    summary:
      'Reduced repeat Supabase and Discord work during active chat while changing champion-role reconciliation to startup plus the first eligible message after each hourly window.',
    details: [
      'The bot reuses one Supabase service client, locally gates repeat XP attempts for each member, and caches leveling settings and reward-role configuration for 30 seconds. The database RPC remains the authoritative cooldown and XP update guard.',
      'A changed leveling cooldown or enabled state clears the local XP attempt gate after configuration refresh, so a reduced cooldown does not keep members waiting for the previous longer cooldown.',
      'Concurrent reward-role cache misses share one database read. Leaderboard reads are cached for 30 seconds, serialized champion synchronizations share one in-flight operation, and leaderboard member resolution scans no more than 500 stored records.',
      'Champion-role reconciliation still runs after startup, then runs only on the first eligible human message after each one-hour interval. It no longer runs for every XP award, after every ban, or on a repeating timer.',
      'The public /leaderboard command now has a per-user 10-second cooldown, and deferred interaction failures are edited rather than attempting a second initial Discord response.',
    ],
    impact: [
      'Busy chat servers make at most one bot-side XP award attempt per member per configured cooldown window, substantially reducing denied cooldown RPCs and repeated reward configuration reads.',
      'After the initial startup reconciliation, a new champion, exclusion change, ban, or configuration change can take until the first eligible message after the next hourly window to be reflected. This is intentional to bound background work.',
      'No schema migration, Discord permission change, or command registration is required. The Discord bot must be restarted or redeployed for these runtime changes to take effect.',
    ],
    files: [
      'discord-bot/src/index.ts',
      'discord-bot/src/interactions.ts',
      'discord-bot/src/leveling.ts',
      'discord-bot/src/supabase.ts',
      'discord-bot/README.md',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run discord:check, npm run typecheck, and npm run test:run passed.',
      'Targeted ESLint completed with zero errors and git diff --check passed. npm run check was not used because the active development server owns the shared .next cache.',
      'No migration, Discord command registration, or deployment was performed locally.',
    ],
  },
  {
    id: 'patch-2026-10-15-discord-level-role-reconciliation',
    patch: 'patch-2026-10-15-discord-level-role-reconciliation',
    timestamp: '2026-10-15T23:55:57.389Z',
    title: 'Reconcile level rewards after manual level changes',
    summary:
      'Updated /xp set-level so configured reward roles reflect the assigned level when a member is moved down or up.',
    details: [
      'The bot now reads all configured level-reward roles after /xp set-level, grants missing roles at or below the assigned level, and removes bot-manageable reward roles above it.',
      'Normal message XP and /xp add retain grant-only behavior because those paths cannot lower a member’s level.',
      'Only configured reward roles below the bot role are changed; unrelated server roles are not inspected or removed.',
    ],
    impact: [
      'Staff can safely correct a member’s level downward without leaving obsolete higher-level reward roles assigned.',
      'No database migration, command registration, or changed Discord permissions are required.',
    ],
    files: [
      'discord-bot/src/interactions.ts',
      'discord-bot/src/leveling.ts',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run discord:check passed and targeted ESLint completed with zero errors.',
      'git diff --check passed.',
      'No migration, Discord command registration, or deployment was performed locally.',
    ],
  },
  {
    id: 'patch-2026-10-15-discord-leaderboard-exclusions-save-fix',
    patch: 'patch-2026-10-15-discord-leaderboard-exclusions-save-fix',
    timestamp: '2026-10-15T23:32:33.782Z',
    title: 'Fix saving Discord leaderboard exclusions',
    summary:
      'Included the leaderboard exclusion-role list in the Discord Configuration save payload so an empty selection is saved as an empty array.',
    details: [
      'The page previously loaded and edited leaderboard exclusion roles but omitted that field from its PUT request, causing the API to reject every save as an invalid exclusion-role list.',
      'The save payload now always includes leaderboardExcludedRoleIds alongside settings, manual-XP roles, and role rewards.',
    ],
    impact: [
      'Administrators can save Discord Configuration with zero or more leaderboard exclusion roles.',
      'No database schema, permissions, command definitions, or bot deployment behavior changed.',
    ],
    files: [
      'components/discord-leveling-settings.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run typecheck passed and targeted ESLint completed with zero errors.',
      'git diff --check passed. npm run check was not used because the active development server owns the shared .next cache.',
      'No migration, Discord command registration, or deployment was performed locally.',
    ],
  },
  {
    id: 'patch-2026-10-15-discord-leveling-leaderboard-automation',
    patch: 'patch-2026-10-15-discord-leveling-leaderboard-automation',
    timestamp: '2026-10-15T21:07:39.676Z',
    title: 'Add Discord level-up routing, leaderboard, and champion automation',
    summary:
      'Added configurable level-up announcement routing, a server XP leaderboard, automatic champion-role assignment, ban resets, a compact reward editor, and progress bars in XP lookups.',
    details: [
      'Added a nullable announcement channel ID to Discord Configuration. A blank value retains same-channel level-up announcements; a configured, sendable guild channel receives all announcements instead.',
      'Added the public /leaderboard [count] command for the top active server members by XP, from one through 25 entries, with 10 as the default.',
      'Added an optional dedicated champion role for the highest-XP eligible member, exclusion-role selection, tracked role assignments, immediate reconciliation after XP changes and bans, and a one-minute reconciliation interval for website configuration changes.',
      'Added a Guild Ban Add handler that resets an existing banned member record to level 0, zero XP, and no XP cooldown timestamp without storing Discord message content.',
      'Reworked reward cards into a two-column compact layout; per-level custom messages are collapsed until needed. Added a 12-segment progress bar to /xp view responses.',
    ],
    impact: [
      'Administrators can direct all level-up messages to one text channel, leave the ID empty to retain per-message-channel announcements, and select a role that the bot can manage for the current leaderboard leader.',
      'The champion role must be dedicated: it cannot overlap with a level reward, manual-XP staff role, or exclusion role. The bot removes only its tracked previous assignment when leadership changes.',
      'The bot now requests the non-privileged Guild Moderation gateway intent to receive ban events. It still does not request Message Content, Server Members, or Presence intents.',
      'Staff must apply migration 146, grant the selected announcement channel Send Messages permission where applicable, register changed guild commands, and restart or deploy the bot.',
    ],
    files: [
      'supabase/migrations/146_discord_leveling_channels_leaderboard_and_ban_resets.sql',
      'lib/discord-leveling.ts',
      'app/api/discord/leveling/route.ts',
      'components/discord-leveling-settings.tsx',
      'discord-bot/src/commands.ts',
      'discord-bot/src/index.ts',
      'discord-bot/src/interactions.ts',
      'discord-bot/src/leveling.ts',
      'discord-bot/README.md',
      'tests/discord-leveling.test.ts',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run discord:check and npm run typecheck passed.',
      'npm run test:run passed: 37 test files and 172 tests passed.',
      'Targeted ESLint completed with zero errors and git diff --check passed. npm run check was not used because the active development server owns the shared .next cache.',
      'No migration, Discord command registration, or deployment was performed locally.',
    ],
  },
  {
    id: 'patch-2026-10-15-discord-xp-progress-command',
    patch: 'patch-2026-10-15-discord-xp-progress-command',
    timestamp: '2026-10-15T20:09:12.324Z',
    title: 'Add personal and member XP progress lookup',
    summary:
      'Added a non-staff Discord /xp view command that privately shows the selected member’s chat-level progress.',
    details: [
      'Added an optional member picker to /xp view; without a selected member, it reads the invoking user’s stored chat-level record.',
      'The response shows level, cumulative XP, XP earned within the current level, progress to the next level, and the XP still required.',
      'The command is read-only and does not require a configured manual-XP staff role. It returns an ephemeral Discord response.',
      'Added /xp view usage to the bot’s ephemeral /help response.',
    ],
    impact: [
      'All server members can check their own progression and optionally inspect another server member’s progression without changing leveling data.',
      'Staff retain exclusive access to /xp add and /xp set-level through the configured Discord Configuration roles.',
      'Staff must re-register guild commands and restart or deploy the bot before the new subcommand appears in Discord.',
    ],
    files: [
      'discord-bot/src/commands.ts',
      'discord-bot/src/interactions.ts',
      'discord-bot/src/leveling.ts',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run discord:check passed.',
      'npm run test:run passed: 37 test files and 172 tests passed.',
      'Targeted ESLint completed with zero errors and git diff --check passed. npm run check was not used because the active development server owns the shared .next cache.',
      'No migration, Discord command registration, or deployment was performed locally.',
    ],
  },
  {
    id: 'patch-2026-10-15-discord-lurkr-curve-and-reward-levels',
    patch: 'patch-2026-10-15-discord-lurkr-curve-and-reward-levels',
    timestamp: '2026-10-15T20:15:00.000Z',
    title: 'Correct the Lurkr curve and expand Discord reward configuration',
    summary:
      'Corrected Discord leveling to use Lurkr cumulative XP thresholds and added grouped reward roles, reward-level messages, dynamic menus, and bot command help.',
    details: [
      'Changed level calculations from summed transition costs to the Lurkr total-XP polynomial, 50n² - 100n + 150. Existing member levels are recalculated by the migration, and the 100-level graph now uses the corrected values.',
      'Reworked reward configuration so a level owns a multi-role selection and an optional announcement template that overrides the default message at that exact level.',
      'Added the ephemeral /help command, updated bot announcements to honor reward-level messages, and made AppSelectMenu select upward when the required menu height exceeds available space below.',
      'Adjusted chart pointer conversion to account for SVG plot padding, preventing the hover selection from drifting near either endpoint.',
    ],
    impact: [
      'Members reach level 10 at 4,150 XP, level 25 at 28,900 XP, level 50 at 120,150 XP, and level 100 at 490,150 XP, matching the Lurkr default formula.',
      'Administrators can assign several roles in one reward-level selection and tailor an announcement for that level without authoring a separate global rule.',
      'Staff must apply the new migration, review recalculated member levels and existing role rewards, then register the changed guild command definitions.',
    ],
    files: [
      'supabase/migrations/145_discord_leveling_lurkr_curve_and_reward_messages.sql',
      'lib/discord-leveling.ts',
      'app/api/discord/leveling/route.ts',
      'components/discord-leveling-settings.tsx',
      'components/app-select-menu.tsx',
      'discord-bot/src/commands.ts',
      'discord-bot/src/interactions.ts',
      'discord-bot/src/leveling.ts',
      'discord-bot/README.md',
      'tests/discord-leveling.test.ts',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run discord:check and npm run typecheck passed.',
      'npm run test:run passed: 37 test files and 172 tests passed, including corrected Lurkr level thresholds.',
      'Targeted ESLint completed with zero errors and git diff --check passed. npm run check was not used because the active development server owns the shared .next cache.',
      'No migration, command registration, or deployment was performed locally.',
    ],
  },
  {
    id: 'patch-2026-10-15-discord-leveling-controls',
    patch: 'patch-2026-10-15-discord-leveling-controls',
    timestamp: '2026-10-15T19:20:00.000Z',
    title: 'Expand Discord leveling rewards, announcements, and staff controls',
    summary:
      'Added customizable level-up announcements, role-based manual XP controls, searchable role selection, and an interactive XP curve to Discord Configuration.',
    details: [
      'Added a migration that stores the level-up announcement toggle/template and selected Discord staff roles, extends the protected settings replacement RPC, and provides server-only RPCs to add XP or set a member level atomically.',
      'Added a configurable announcement template with {user}, {level}, and {xp} placeholders. Announcements are posted only when chat XP advances a member level, and Discord allowed-mentions limits pings to the newly leveled member.',
      'Added guild-scoped /xp add and /xp set-level commands. The bot checks the caller against configured Discord staff roles, excludes bot targets, applies all earned role rewards after manual changes, and replies ephemerally.',
      'Updated Discord Configuration so administrators can select multiple roles for one reward level, type to filter role menus, choose manual-XP staff roles, and inspect the first 50 levels of the fixed curve through a pointer-hover graph.',
      'Updated bot setup documentation for separate test-bot command registration and the optional Send Messages permission required for level-up announcements.',
    ],
    impact: [
      'Administrators can create richer progression milestones, communicate a level-up in the active channel, and delegate controlled moderation tasks without granting Discord Administrator permission.',
      'Only configured server roles may use manual XP commands. Website administrators remain the only users able to configure those roles, and message text continues not to be stored or read.',
      'Staff must apply the new migration, save Discord Configuration with at least one manual-XP staff role before /xp can be used, and register the updated guild commands using the intended bot application credentials.',
    ],
    files: [
      'supabase/migrations/144_discord_leveling_announcements_and_staff_xp.sql',
      'lib/discord-leveling.ts',
      'app/api/discord/leveling/route.ts',
      'components/app-select-menu.tsx',
      'components/discord-leveling-settings.tsx',
      'discord-bot/src/commands.ts',
      'discord-bot/src/interactions.ts',
      'discord-bot/src/leveling.ts',
      'discord-bot/README.md',
      'README.md',
      'tests/discord-leveling.test.ts',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run discord:check and npm run typecheck passed.',
      'npm run test:run passed: 37 test files and 172 tests passed.',
      'Targeted ESLint completed with zero errors and retained four existing next/image warnings in profile-screen.tsx. git diff --check passed.',
      'npm run check was not used because the active development server owns the shared .next cache; no production build was run.',
      'No migration, Discord command registration, bot deployment, or website deployment was performed from the local workspace.',
    ],
  },
  {
    id: 'patch-2026-10-15-discord-configuration-label',
    patch: 'patch-2026-10-15-discord-configuration-label',
    timestamp: '2026-10-15T18:50:00.000Z',
    title: 'Clarify the Discord administration entry point',
    summary:
      'Renamed the administrator-facing chat-leveling entry to Discord Configuration while retaining its focused chat-leveling controls.',
    details: [
      'Updated the Discord Account action, configuration page metadata and heading, and operator documentation to use the Discord Configuration name.',
      'Documented that the website deployment, as well as the bot deployment, requires the configured Discord guild identifier for the administration page to load synchronized roles.',
    ],
    impact: [
      'Administrators can more easily recognize this area as the home for Discord server settings while the current chat-leveling controls remain unchanged.',
      'Staff have a clearer configuration requirement when a settings page reports that Discord server configuration is unavailable.',
    ],
    files: [
      'components/profile-screen.tsx',
      'app/profile/discord/leveling/page.tsx',
      'components/discord-leveling-settings.tsx',
      'README.md',
      'discord-bot/README.md',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run typecheck passed. Targeted ESLint completed with zero errors and retained four existing next/image warnings in profile-screen.tsx.',
      'Confirmed the local website environment is missing DISCORD_GUILD_ID; no user environment files were changed automatically.',
    ],
  },
  {
    id: 'patch-2026-10-15-discord-chat-leveling',
    patch: 'patch-2026-10-15-discord-chat-leveling',
    timestamp: '2026-10-15T18:35:00.000Z',
    title: 'Add configurable Discord chat leveling',
    summary:
      'Implemented the shared database, bot event handling, and administrator-only website controls for single-guild Discord chat XP and level role rewards.',
    details: [
      'Added the Discord chat-leveling settings, synchronized guild-role cache, member progression, and service-role-only database RPCs. The award RPC atomically enforces a per-member server-wide cooldown, awards configurable XP, and calculates levels with the fixed 50n² - 100n + 150 transition curve.',
      'Updated the Discord bot to listen for GuildMessages events, exclude bot and Discord system messages, award XP without inspecting or persisting message content, synchronize roles at startup and on role changes, and grant all earned, assignable level roles.',
      'Added a protected Profile > Discord Account configuration entry and a dedicated admin API/page for enabling or pausing leveling, configuring XP and cooldowns, previewing the fixed curve, and selecting only synced roles below the bot role.',
      'Documented the required non-privileged Guild Messages usage, least-privilege View Channels and Manage Roles invite permissions, disabled privileged gateway intents, bot-role ordering, and the shared DISCORD_GUILD_ID website setting.',
    ],
    impact: [
      'Community members earn the default 15 XP for eligible messages no more than once every five seconds and can receive configured Discord level roles automatically.',
      'Only website administrators can change Discord leveling settings; bot credentials, service-role keys, Discord user identifiers, and Discord message content remain inaccessible to browser clients and are not added to telemetry.',
      'Staff must apply the supplied database migration, configure DISCORD_GUILD_ID in both deployments, authorize the bot with the documented permissions, and place its role above all reward roles before enabling role rewards.',
    ],
    files: [
      'supabase/migrations/143_discord_chat_leveling.sql',
      'lib/discord-leveling.ts',
      'app/api/discord/leveling/route.ts',
      'app/profile/discord/leveling/page.tsx',
      'components/discord-leveling-settings.tsx',
      'components/profile-screen.tsx',
      'discord-bot/src/supabase.ts',
      'discord-bot/src/leveling.ts',
      'discord-bot/src/index.ts',
      'discord-bot/src/profiles.ts',
      'discord-bot/AGENTS.md',
      'discord-bot/README.md',
      '.env.example',
      'README.md',
      'tests/discord-leveling.test.ts',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run discord:check and npm run typecheck passed.',
      'npm run test:run passed: 37 test files and 171 tests passed, including chat-level curve threshold coverage.',
      'Direct ESLint verification of the changed website files completed with zero errors; it retained four pre-existing next/image warnings in profile-screen.tsx.',
      'git diff --check passed. npm run check was not used because the active development server owns the shared .next cache; no production build was run.',
      'No database migration was applied and no Discord deployment or command registration was performed from the local workspace.',
    ],
  },
  {
    id: 'patch-2026-10-15-discord-companion-foundation',
    patch: 'patch-2026-10-15-discord-companion-foundation',
    timestamp: '2026-10-15T04:35:00.000Z',
    title: 'Add the single-guild Discord companion foundation',
    summary:
      'Created an independently deployable Discord bot workspace that reuses KnowLeague Discord profile links and shares server-only Supabase profile data with the website.',
    details: [
      'Added the discord-bot npm workspace with a typed Discord gateway runtime, explicit guild-scoped slash-command registration, container build, dotenv-backed local environment template, and bot-specific operating guidance.',
      'Implemented ephemeral /link and /profile commands. The bot reuses profile_private_details.discord_user_id established by the website OAuth flow, reads only the caller\'s matching profile through a server-only Supabase service-role client, and does not store Discord OAuth tokens.',
      'Restricted the bot to the Guilds gateway intent and configured-guild interactions, avoiding message-content access and preventing command handling if the application is invited to another server.',
      'Documented the shared web/bot contract, independent deployment boundary, workspace commands, and Docker build context while retaining the Next.js application at the repository root.',
    ],
    impact: [
      'Players in the configured Discord server can securely confirm their existing KnowLeague account link and open their profile without creating a separate identity mapping.',
      'Staff can deploy and restart Discord functionality independently from the website, while future cross-surface changes have an explicit review contract in repository guidance.',
      'Discord bot tokens and Supabase service-role credentials remain server-only and are excluded from the Docker build context and source control.',
    ],
    files: [
      'package.json',
      'package-lock.json',
      'tsconfig.json',
      'AGENTS.md',
      'README.md',
      '.dockerignore',
      'discord-bot/package.json',
      'discord-bot/tsconfig.json',
      'discord-bot/.env.example',
      'discord-bot/Dockerfile',
      'discord-bot/AGENTS.md',
      'discord-bot/README.md',
      'discord-bot/src/config.ts',
      'discord-bot/src/commands.ts',
      'discord-bot/src/profiles.ts',
      'discord-bot/src/interactions.ts',
      'discord-bot/src/index.ts',
      'discord-bot/src/register-commands.ts',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm install completed and recorded Discord bot runtime dependencies, including dotenv 16.6.1 for local bot environment loading, plus tsx in the shared package-lock.json.',
      'npm run discord:check and npm run discord:build passed before and after the local environment loader was added.',
      'npm run typecheck passed and npm run test:run passed: 36 test files and 168 tests passed.',
      'Direct ESLint verification with --no-cache completed with zero errors and retained the repository\'s seven existing next/image warnings. npm run check was also attempted, but next lint could not open the active dev server\'s locked .next ESLint cache; no cache file was modified.',
      'Docker is not installed in the local workspace, so the documented container build could not be executed. No Next.js production build was run because a development server cache is active.',
    ],
  },
  {
    id: 'patch-2026-10-14-champion-catalogue-landing-image',
    patch: 'patch-2026-10-14-champion-catalogue-landing-image',
    timestamp: '2026-10-14T23:52:40.3930720Z',
    title: 'Use the Champion Catalogue directory preview on the home card',
    summary:
      'Replaced the single-champion remote splash on the Champion Catalogue home card with the supplied local Champion Catalogue directory preview.',
    details: [
      'Added the user-supplied champion_catalogue.png to the existing public game-snapshots asset folder.',
      'Updated the Champion Catalogue landing card to use the local preview, which immediately conveys the searchable multi-champion directory instead of one representative champion.',
      'Using the local static asset removes the card\'s dependency on a remote Riot splash request while keeping the established landing-card image treatment.',
    ],
    impact: [
      'Players can recognize the Champion Catalogue card from its directory grid before opening it.',
      'The home page receives a local, cacheable image asset with no new runtime data dependency.',
    ],
    files: [
      'public/game-snapshots/champion_catalogue.png',
      'components/landing-page.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'Verified the supplied PNG is present at the public game-snapshots path and visually matches the uploaded Champion Catalogue directory image.',
      'npm run check passed: lint retained only the repository\'s existing img-element warnings; typecheck passed; Vitest passed.',
    ],
  },
  {
    id: 'patch-2026-10-14-champion-catalogue-launch-surfaces',
    patch: 'patch-2026-10-14-champion-catalogue-launch-surfaces',
    timestamp: '2026-10-14T23:43:05.8705304Z',
    title: 'Promote the Champion Catalogue across KnowLeague surfaces',
    summary:
      'Added a Champion Catalogue entry to the home, desktop/mobile navigation, and public News feed while compacting the directory filter option menus.',
    details: [
      'Removed lane and class option descriptions plus the redundant dropdown helper copy, leaving the Champion Directory menus focused on the selectable lane or class labels.',
      'Added a Champion Catalogue landing card between League Account Viewer and Riftbound. It links to /champions and uses Riot Aatrox splash art, the established direct navigation pattern, and the red Champion Hub visual accent.',
      'Renamed Browse Champions to Champion Catalogue in both the desktop header menu and mobile navigation drawer, preserving the existing /champions destination and explanatory subtitle.',
      'Published Update 0.4.0 in the local News feed to announce the complete roster directory, filters, champion profiles, skins, chromas, and available Gameplay Details coverage.',
    ],
    impact: [
      'Players now encounter a consistently named Champion Catalogue from the home page, primary navigation, and latest-news preview.',
      'Filter menus are shorter and easier to scan without altering their selection behavior or accessibility semantics.',
    ],
    files: [
      'components/champion-directory.tsx',
      'components/landing-page.tsx',
      'components/app-header.tsx',
      'components/app-navigation-drawer.tsx',
      'lib/news.ts',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint retained only the repository\'s existing img-element warnings; typecheck passed; Vitest passed.',
    ],
  },
  {
    id: 'patch-2026-10-14-champion-directory-filter-menu-width',
    patch: 'patch-2026-10-14-champion-directory-filter-menu-width',
    timestamp: '2026-10-14T23:38:21.4715058Z',
    title: 'Expand Champion Directory filter menus beyond their triggers',
    summary:
      'Gave the Champion Directory lane and class menus an independent, responsive content width while preserving their existing trigger sizing and left/right alignment.',
    details: [
      'Applied the shared AppSelectMenu menuClassName support to both Champion Directory filters with a responsive maximum width of 22rem and a viewport-safe mobile cap.',
      'The lane menu remains anchored to the left of its trigger and the class menu remains anchored to the right, preventing a widened menu from drifting outside the directory controls.',
      'No menu behavior, filter semantics, or shared AppSelectMenu styling rules changed outside the Champion Directory usage.',
    ],
    impact: [
      'Lane and class descriptions have enough room to scan naturally instead of wrapping to the narrow dropdown-button width.',
      'Players retain compact filter buttons while receiving a comfortably sized selection panel on desktop and mobile.',
    ],
    files: [
      'components/champion-directory.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint retained only the repository\'s existing img-element warnings; typecheck passed; Vitest passed.',
    ],
  },
  {
    id: 'patch-2026-10-14-champion-directory-lane-class-filters',
    patch: 'patch-2026-10-14-champion-directory-lane-class-filters',
    timestamp: '2026-10-14T23:35:00.1444283Z',
    title: 'Add lane and class filters to the Champion Directory',
    summary:
      'Added shared-style, multi-select lane and champion-class dropdown filters to the Champion Directory without changing its direct navigation or search behavior.',
    details: [
      'Added the established AppSelectMenu treatment for lane and class filtering, including the existing dark trigger, amber selected state, accessible listbox semantics, outside-click dismissal, and app UI sounds.',
      'Both filter controls support selecting multiple values. A champion matches any selected lane and any selected class, while the lane and class groups compose together with the existing text search.',
      'Added explicit All lanes and All classes selections that clear their respective filters, preserving the prior unfiltered directory state by default.',
      'Kept the directory cards, shared champion routes, alphabetical ordering, and search matching intact; the no-results guidance now also points players to the new controls.',
    ],
    impact: [
      'Players can quickly narrow the full Champion Hub roster to lane and class combinations without needing to know a champion name.',
      'The filters run entirely against the already-delivered compact directory catalogue; no runtime Riot or CommunityDragon request is introduced.',
    ],
    files: [
      'components/champion-directory.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint retained only the repository\'s existing img-element warnings; typecheck passed; Vitest passed.',
    ],
  },
  {
    id: 'patch-2026-10-14-champion-hub-selected-splash-brightness',
    patch: 'patch-2026-10-14-champion-hub-selected-splash-brightness',
    timestamp: '2026-10-14T23:21:33.0215041Z',
    title: 'Render selected Champion Hub skin splashes at full brightness',
    summary:
      'Removed the shared header reveal animation from the selected skin splash after confirming its final opacity keyframe was dimming the artwork to 50 percent.',
    details: [
      'The selected skin view had no remaining color filter or gradient; however, it reused champion-splash-reveal, whose final animation state explicitly set opacity to 0.5.',
      'Selected skin art now renders directly at full opacity while preserving the native 1215:717 frame, direct CDN delivery, navigation controls, and text-only name treatment.',
      'The shared animation remains unchanged for the Champion Detail header, where its reduced opacity is an intentional part of the header design.',
    ],
    impact: [
      'The selected splash now matches the brightness of its collection preview and the original Riot artwork.',
      'No image transformation, runtime data request, or broader Champion Detail header styling changed.',
    ],
    files: [
      'components/champion-skins.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint retained only the repository\'s existing img-element warnings; typecheck passed; Vitest passed.',
    ],
  },
  {
    id: 'patch-2026-10-14-champion-hub-skin-art-presentation',
    patch: 'patch-2026-10-14-champion-hub-skin-art-presentation',
    timestamp: '2026-10-14T23:16:22.0779065Z',
    title: 'Preserve Champion Hub skin art without display overlays or cropping',
    summary:
      'Adjusted the shared Champion Hub Skins artwork presentation so selected and collection splashes retain their native Riot framing, color, and browser-native interpolation without Vercel image transformations.',
    details: [
      'Removed the full-width dark gradient layered over the selected skin splash; the selected skin name now uses a local text shadow only, leaving the artwork itself unfiltered.',
      'Changed the selected-splash frame and collection preview frames to Riot\'s native 1215:717 splash ratio. Standard Riot splash artwork can therefore fill the frame while remaining fully visible, without cover-cropping or contain-mode side bars.',
      'Removed the collection-preview gradient and reduced its hover enlargement so thumbnails are not unnecessarily darkened or resampled at a larger scale.',
      'Explicitly retained browser-standard image interpolation for these direct CDN images. Verification of the version-pinned CommunityDragon alternate confirmed that it is also 1215 by 717, so the catalogue continues to use the existing direct Data Dragon originals rather than claiming a non-existent source-resolution improvement.',
    ],
    impact: [
      'Players see the intended selected skin artwork brightness and the full standard splash composition at every responsive size.',
      'Skin previews remain direct, unoptimized CDN images, avoiding Vercel image-transformation charges while preserving the highest consistent source resolution published for the full catalogue.',
    ],
    files: [
      'components/champion-skins.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint retained only the repository\'s existing img-element warnings; typecheck passed; Vitest passed.',
    ],
  },
  {
    id: 'patch-2026-10-14-champion-hub-full-gameplay-details',
    patch: 'patch-2026-10-14-champion-hub-full-gameplay-details',
    timestamp: '2026-10-14T22:50:04.4214267Z',
    title: 'Activate Champion Hub Gameplay Details across the roster',
    summary:
      'Added a generated, local Gameplay Details catalogue for every Champion Hub profile, activating the shared statistics and detailed ability view for all 173 champions.',
    details: [
      'Added a full-roster gameplay generator that writes local Level 1 through 20 base-stat tables, including health, resource, regeneration, armor, attack damage, magic resistance, critical damage, movement speed, attack range, and attack-speed rows without reintroducing the removed Unit Radius section.',
      'Generated five detailed ability records per champion with source-provided gameplay descriptions, cooldowns, costs, rank progressions, base values, and AD/AP scaling where the structured data exposes them. The presentation intentionally limits long effect lists to the most relevant values rather than dumping every implementation detail.',
      'Used the structured public League gameplay catalogue for 171 current profiles. Locke and Zaahen are newer than that catalogue snapshot, so their pages use a clear, local Data Dragon 16.20.1 fallback for statistics, ability descriptions, cooldowns, costs, and available effect values rather than leaving the tab blank.',
      'Corrected stat normalization so base attack speed is presented as a rate while attack-speed growth remains in the separate bonus-attack-speed row.',
      'Kept the bespoke Aatrox CommunityDragon client-tooltip extraction, rank values, extended notes, and reviewed presentation intact; all other profiles consume the new generated Gameplay Details catalogue.',
      'Changed the shared Gameplay Details header to display each profile’s actual local source label instead of claiming all detail records are a Riot client snapshot.',
    ],
    impact: [
      'Players can use the shared Gameplay Details tab, direct route, and browser history for every champion instead of encountering a locked placeholder.',
      'Gameplay values are served from checked-in local JSON at runtime; source retrieval occurs only during an explicit maintainer generation command.',
      'The source label makes the temporary Data Dragon fallback visible for the two newest champions, avoiding a misleading claim of uniform source coverage.',
    ],
    files: [
      'scripts/generate-champion-hub-gameplay-details.mjs',
      'data/catalogs/champion-hub-gameplay-details.json',
      'package.json',
      'lib/champion-hub.ts',
      'components/champion-gameplay-details.tsx',
      'tests/champion-hub.test.ts',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run data:generate:champion-hub-gameplay-details completed successfully and generated complete Gameplay Details profiles for all 173 Overview entries.',
      'npm run check passed: lint retained only the repository’s existing seven img-element warnings; typecheck passed; 36 Vitest files and 168 tests passed.',
    ],
  },
  {
    id: 'patch-2026-10-14-champion-hub-full-skins',
    patch: 'patch-2026-10-14-champion-hub-full-skins',
    timestamp: '2026-10-14T22:28:46.3853303Z',
    title: 'Activate Champion Hub Skins for the complete roster',
    summary:
      'Added a version-pinned, local Skins catalogue for all 173 Champion Hub profiles, making the existing shared Skins route available across the full champion roster.',
    details: [
      'Added a dedicated generator that combines CommunityDragon 16.20 client skin, rarity, official cosmetic-description, skin-line, chroma, and model identifiers with public catalogue release, price, and availability metadata before writing one checked-in local data file.',
      'Generated 2,093 published skins for 173 champions. Every entry begins with the champion base skin and carries a release date, price label, availability, Riot client rarity, splash reference, ModelViewer link, and all available chromas.',
      'Excluded internal-only CommunityDragon cosmetic asset variants by requiring a public-catalogue or audited release-date match, while retaining new cosmetics during a short public-index lag window.',
      'Preserved legitimate base skins that Riot client data marks as generic so each champion collection remains navigable from its intended default look.',
      'Merged generated skins into the existing shared Champion Hub profile contract; the shared sidebar, header, direct skin URL behavior, splash navigation, chroma presentation, rarity display, and no-runtime-fetch implementation are reused without a per-champion UI fork.',
      'Retained the existing reviewed Aatrox Skins catalogue while enabling the generator-backed source snapshot for every other champion.',
    ],
    impact: [
      'Players can open the Skins tab for every champion and use browser history or a direct skin URL to inspect a selected cosmetic.',
      'Skin lore is shown only when an official client cosmetic description exists; no lore is generated by the application.',
      'Visitors read checked-in local catalogue data. Riot, CommunityDragon, and supplemental public catalogue requests happen only when maintainers explicitly run the generator.',
    ],
    files: [
      'scripts/generate-champion-hub-skins.mjs',
      'data/catalogs/champion-hub-skins.json',
      'package.json',
      'lib/champion-hub.ts',
      'tests/champion-hub.test.ts',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run data:generate:champion-hub-skins completed successfully and generated 2,093 skins for all 173 Overview profiles.',
      'npm run check passed: lint retained only the repository’s existing seven img-element warnings; typecheck passed; 36 Vitest files and 168 tests passed.',
    ],
  },
  {
    id: 'patch-2026-10-14-champion-hub-all-overviews',
    patch: 'patch-2026-10-14-champion-hub-all-overviews',
    timestamp: '2026-10-14T22:06:30.8028385Z',
    title: 'Establish a complete Champion Hub Overview catalogue',
    summary:
      'Expanded Champion Hub from the five-profile pilot to all 173 champions in the current pinned 16.20.1 roster, with a generated, local Overview baseline for each entry.',
    details: [
      'Replaced the bounded five-champion generator with a full-roster Overview generator that reads the current pinned Data Dragon 16.20.1 champion index, resolves each canonical Riot champion page from Riot’s public directory, and writes one checked-in local catalogue.',
      'Validated every generated entry for five ability cards, non-empty official Riot-page overview lore, supported class tags, and at least one established lane from the local gameplay metadata catalogue before writing the data file.',
      'Retained Aatrox’s manually reviewed Skins, Eternals, and detailed Gameplay Details records while supplying the shared header, lore, combat profile, and ability-overview baseline to every other champion.',
      'Added deterministic combat-profile inference from official Data Dragon role and profile fields, preserving the already reviewed presentation values for Ahri, Akali, Akshan, and Alistar.',
      'Added a conservative class-based lane fallback solely for newly released champions that are absent from the curated local lane catalogue; the current run uses it for Locke as Mid until curated lane metadata is available.',
      'Added a compact directory-specific data selector so the client-side searchable grid receives only card/search fields rather than every champion’s lore and ability data.',
      'Kept interactive Champion Detail client components data-free at module load time, so an individual profile serializes only its selected champion rather than importing the full overview catalogue into the browser bundle.',
    ],
    impact: [
      'Players can browse, search, and open a working Overview page for every champion in the pinned catalogue.',
      'Unfinished Skins, Gameplay Details, Eternals, Lore, and Voice Lines remain explicitly gated per champion, preserving accurate data boundaries while later passes fill those domains.',
      'The Champion Hub now has a scalable local-data foundation for sequential tab-by-tab catalogue work without runtime Riot or CommunityDragon requests.',
    ],
    files: [
      'scripts/generate-champion-hub-overviews.mjs',
      'data/catalogs/champion-hub-overviews.json',
      'package.json',
      'lib/champion-hub.ts',
      'components/champion-directory.tsx',
      'app/champions/page.tsx',
      'tests/champion-hub.test.ts',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run data:generate:champion-hub-overviews completed successfully and generated 173 validated Overview records from pinned Data Dragon 16.20.1 and Riot champion pages.',
      'npm run check passed: lint retained only the repository’s existing seven img-element warnings; typecheck passed; 36 Vitest files and 168 tests passed.',
    ],
  },
  {
    id: 'patch-2026-10-14-restore-aatrox-gameplay-details',
    patch: 'patch-2026-10-14-restore-aatrox-gameplay-details',
    timestamp: '2026-10-14T21:54:59.2856016Z',
    title: 'Restore completed Aatrox Gameplay Details',
    summary:
      'Reactivated the existing Aatrox Gameplay Details route and shared navigation entry while retaining a safe Coming Soon state for profiles that do not yet have complete gameplay statistics and ability-detail catalogues.',
    details: [
      'Restored the direct /champions/aatrox/gameplay-details render path to the completed ChampionGameplayDetails component, including the statistics table, shared combat profile, ability detail tabs, scaling values, cooldowns, and gameplay-rule notes.',
      'Added a shared data-readiness helper that requires both statistics and ability-detail records before Gameplay Details is active.',
      'Changed the shared Champion Detail navigation to display Gameplay Details as available for Aatrox and preserve a locked, explanatory Coming Soon treatment for Ahri, Akali, Akshan, and Alistar until their detailed data is generated.',
      'Updated direct-route metadata so the restored Aatrox page accurately describes its gameplay content instead of advertising it as unfinished.',
    ],
    impact: [
      'Aatrox players can again use the sidebar, direct URL, and browser navigation to inspect the detailed gameplay panel that was already built.',
      'New pilot profiles remain protected from blank or misleading Gameplay Details screens while the next data-generation phase is pending.',
    ],
    files: [
      'lib/champion-hub.ts',
      'components/champion-detail-shell.tsx',
      'app/champions/[slug]/[tab]/page.tsx',
      'tests/champion-hub.test.ts',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint retained only the repository’s existing seven img-element warnings; typecheck passed; 36 Vitest files and 168 tests passed.',
    ],
  },
  {
    id: 'patch-2026-10-14-champion-hub-five-profile-pilot',
    patch: 'patch-2026-10-14-champion-hub-five-profile-pilot',
    timestamp: '2026-10-14T21:45:19.1704454Z',
    title: 'Expand Champion Hub to a five-profile verified pilot',
    summary:
      'Added Ahri, Akali, Akshan, and Alistar beside Aatrox through a generated, local Champion Hub overview catalogue sourced at build time from Riot champion pages and Data Dragon.',
    details: [
      'Added a bounded generator that retrieves the five first-alphabetical pilot champions from pinned Data Dragon 14.24.1 detail records and extracts overview lore only from each public official League of Legends champion page.',
      'Added a checked-in local catalogue containing champion identity, splash and portrait URLs, Riot-page lore, and the five overview abilities for Aatrox, Ahri, Akali, Akshan, and Alistar; visitors do not fetch these catalogues at runtime.',
      'Connected Ahri, Akali, Akshan, and Alistar to the existing shared Champion Detail shell and Overview tab with their class icons, lane icons, combat profile, searchable directory entries, and browser-stable URLs.',
      'Introduced an explicit per-champion Skins catalogue status: Aatrox remains available with its complete cosmetics data, while the four new pilots show the shared Skins Coming Soon state until authoritative cosmetic, chroma, and pricing data is fully catalogued.',
      'Suppressed empty Eternals panels for baseline profiles instead of presenting incomplete or invented progression data, and updated the directory card icon stack to use the app’s official class and lane assets.',
    ],
    impact: [
      'Players can now browse and search five working Champion Hub overview profiles in predictable alphabetical order.',
      'Official lore provenance is preserved for every pilot profile, while unfinished data surfaces remain clearly unavailable rather than misleading.',
      'The pilot establishes a repeatable, local-data workflow for the remaining champion catalogue without changing the established shared navigation or header contracts.',
    ],
    files: [
      'scripts/generate-champion-hub-pilot.mjs',
      'data/catalogs/champion-hub-pilot.json',
      'package.json',
      'lib/champion-hub.ts',
      'components/champion-detail-shell.tsx',
      'components/champion-directory.tsx',
      'components/champion-profile.tsx',
      'app/champions/[slug]/skins/page.tsx',
      'tests/champion-hub.test.ts',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run data:generate:champion-hub-pilot completed successfully against Riot champion pages and pinned Data Dragon 14.24.1 records.',
      'npm run check passed: lint retained only the repository’s existing seven img-element warnings; typecheck passed; 36 Vitest files and 168 tests passed.',
    ],
  },
  {
    id: 'patch-2026-10-14-champion-gameplay-details-coming-soon',
    patch: 'patch-2026-10-14-champion-gameplay-details-coming-soon',
    timestamp: '2026-10-14T21:26:48.1475003Z',
    title: 'Park Gameplay Details as a Champion Hub Coming Soon tab',
    summary:
      'Moved Gameplay Details directly below Overview in the shared Champion Hub navigation and placed its route behind the consistent Coming Soon presentation while retaining the underlying Aatrox prototype for future activation.',
    details: [
      'Reordered the shared tab contract and sidebar so Gameplay Details follows Overview before Skins, Lore, and Voice lines for every champion.',
      'Changed the shared navigation availability state to display Gameplay Details with the locked Coming Soon treatment and updated its hover description.',
      'Changed direct /champions/[slug]/gameplay-details visits to render the shared Coming Soon page and matching metadata rather than bypassing the pending state.',
      'Preserved the Aatrox gameplay-data generator, local catalogue, and Gameplay Details component without routing visitors to them, allowing the work to resume without recreating the data pipeline.',
    ],
    impact: [
      'Players see a consistent unfinished-state experience regardless of whether they use sidebar navigation, a saved URL, or browser navigation.',
      'The Champion Hub tab order now reflects the intended information hierarchy while the large gameplay dataset remains safely staged for later release.',
    ],
    files: [
      'components/champion-detail-shell.tsx',
      'app/champions/[slug]/[tab]/page.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint retained only the repository\'s existing seven img-element warnings; typecheck passed; 36 Vitest files and 168 tests passed.',
    ],
  },
  {
    id: 'patch-2026-10-14-aatrox-client-tooltip-prototype',
    patch: 'patch-2026-10-14-aatrox-client-tooltip-prototype',
    timestamp: '2026-10-14T20:51:35.5971250Z',
    title: 'Prototype client-derived detailed ability data for Aatrox',
    summary:
      'Replaced Aatrox’s manually summarized Gameplay Details ability values with a local, patch-pinned CommunityDragon client-data catalogue containing rank progressions, scaling, level scaling, and extended rules notes.',
    details: [
      'Added an Aatrox-only generator proof of concept that validates the public CommunityDragon 14.24 champion BIN and English localisation tooltip fields before emitting data/catalogs/champion-ability-details.json.',
      'Generated full detail for Deathbringer Stance, The Darkin Blade, Infernal Chains, Umbral Dash, and World Ender, including cooldowns, base values, total-AD ratios, bonus-health scaling, level-based values, and grey extended-tooltip notes.',
      'Added a typed optional detailed-tooltip contract to the Champion Hub catalogue. The Gameplay Details panel prefers this local structured detail and retains the prior facts/effects layout as a fallback for future entries that have not been generated yet.',
      'Pinned source URLs and patch metadata inside the generated asset; visitors read only checked-in local data, so the Champion Hub does not request CommunityDragon at runtime.',
    ],
    impact: [
      'Players can inspect Aatrox’s full rank progression and gameplay-rule notes in the Gameplay Details tab without entering the League client.',
      'The bounded generator establishes an auditable extraction pattern before normalizers are expanded to champion kits with transformations, variants, or nonstandard calculations.',
    ],
    files: [
      'package.json',
      'scripts/generate-champion-ability-details.mjs',
      'data/catalogs/champion-ability-details.json',
      'lib/champion-hub.ts',
      'components/champion-gameplay-details.tsx',
      'tests/champion-hub.test.ts',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run data:generate:champion-abilities -- aatrox completed successfully against the patch-pinned CommunityDragon source files.',
      'npm run check passed: lint retained only the repository\'s existing seven img-element warnings; typecheck passed; 36 Vitest files and 168 tests passed.',
    ],
  },
  {
    id: 'patch-2026-10-14-champion-gameplay-stats-official-icons',
    patch: 'patch-2026-10-14-champion-gameplay-stats-official-icons',
    timestamp: '2026-10-14T20:11:36.2732699Z',
    title: 'Refine Champion Hub gameplay statistics and iconography',
    summary:
      'Removed the Unit Radius group from Aatrox Gameplay Details and standardized live Champion Hub stat presentation on the official Riot in-game icon atlas.',
    details: [
      'Removed the Unit Radius catalogue group and its unsupported gameplay, selection, pathing, height, and acquisition values from the Aatrox statistics panel and its typed data contract.',
      'Extracted a reusable ChampionStatIcon component backed by the existing local official Riot stat atlas at /augments/stat-icons.png, rather than using generic web or Lucide symbols for gameplay statistics.',
      'Applied the shared icon component to the Gameplay Details stat table and the live shared combat/playstyle panel used by both Overview and Gameplay Details.',
      'Documented that detailed gameplay-effect copy is maintained catalogue content, not client-side parsing or generated text, so its source boundary is explicit for future data-pipeline work.',
    ],
    impact: [
      'Players see familiar League stat symbols and a more focused statistics panel without low-value radius internals.',
      'Future Champion Hub tabs can reuse one official icon renderer instead of introducing inconsistent icon systems.',
    ],
    files: [
      'components/champion-stat-icon.tsx',
      'components/champion-combat-profile.tsx',
      'components/champion-gameplay-details.tsx',
      'lib/champion-hub.ts',
      'tests/champion-hub.test.ts',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint retained only the repository\'s existing seven img-element warnings; typecheck passed; 36 Vitest files and 168 tests passed.',
      'Champion Hub catalogue coverage now verifies only the retained Base statistics and Attack speed groups.',
    ],
  },
  {
    id: 'patch-2026-10-14-champion-gameplay-details-foundation',
    patch: 'patch-2026-10-14-champion-gameplay-details-foundation',
    timestamp: '2026-10-14T19:58:19.2873289Z',
    title: 'Launch the data-driven Aatrox Gameplay Details tab',
    summary:
      'Replaced the Gameplay Details placeholder with shared playstyle chrome, structured champion-stat panels, and selectable gameplay-relevant ability values for Aatrox.',
    details: [
      'Added a typed gameplayDetails catalogue contract for level-range statistics, grouped stat panels, and per-ability facts and effects, allowing future champions to use the same UI without embedding content in components.',
      'Populated Aatrox with base, attack-speed, and unit-radius statistics plus concise ability values for cooldowns, costs, ranges, damage, AD scaling, healing, movement, and transformation effects. The initial snapshot identifies Riot Data Dragon 14.24.1 as its source.',
      'Extracted the live Overview combat/playstyle panel into ChampionCombatProfile and render the same shared component in Gameplay Details, preventing the two tabs from drifting visually.',
      'Activated the URL-backed /champions/[slug]/gameplay-details route and its shared sidebar tab while preserving the future-tab placeholders for Lore and Voice lines.',
    ],
    impact: [
      'Players can inspect concise, gameplay-relevant ability details and core champion statistics without leaving the Champion Hub.',
      'Future champion entries need only provide structured catalogue data to receive the same stats, playstyle, and ability-detail presentation.',
    ],
    files: [
      'app/champions/[slug]/[tab]/page.tsx',
      'components/champion-combat-profile.tsx',
      'components/champion-detail-shell.tsx',
      'components/champion-gameplay-details.tsx',
      'components/champion-profile.tsx',
      'lib/champion-hub.ts',
      'tests/champion-hub.test.ts',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint retained only the repository\'s existing seven img-element warnings; typecheck passed; 36 Vitest files and 168 tests passed.',
      'Champion Hub coverage verifies the level range, all stat-group categories, and Aatrox Q cooldown, cost, base damage, and AD-scaling data.',
    ],
  },
  {
    id: 'patch-2026-10-14-champion-skins-splash-and-chroma-scale',
    patch: 'patch-2026-10-14-champion-skins-splash-and-chroma-scale',
    timestamp: '2026-10-14T19:29:24.4300501Z',
    title: 'Restore skin splash brightness and compact chroma cards',
    summary:
      'Removed the full-splash dark overlay, halved desktop chroma card width, and removed contextual hover text from chroma model links.',
    details: [
      'Replaced the selected-splash side and full-height navy gradient with a short, subtle bottom-only scrim that protects the skin name without dimming the artwork.',
      'Changed the chroma grid from three desktop columns to six, with responsive intermediate column counts, reducing desktop chroma cards to approximately half their prior width.',
      'Removed the shared hover note from chroma 3D model links while retaining their accessible external-link label and visible action text.',
    ],
    impact: [
      'Players can inspect selected skin splash art at its intended brightness.',
      'Large chroma collections occupy less vertical space and present more options at once on desktop.',
    ],
    files: [
      'components/champion-skins.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint retained only the repository\'s existing seven img-element warnings; typecheck passed; 36 Vitest files and 168 tests passed.',
      'The full-image overlay was replaced with a bottom-only title scrim; no chroma model hover-note component remains in the Skins tab.',
    ],
  },
  {
    id: 'patch-2026-10-14-champion-skins-riot-rarity-and-chromas',
    patch: 'patch-2026-10-14-champion-skins-riot-rarity-and-chromas',
    timestamp: '2026-10-14T19:14:41.4138646Z',
    title: 'Source Champion Hub rarity tiers and chroma art from Riot client data',
    summary:
      'Replaced inferred rarity presentation with traceable Riot client tier identifiers, corrected chroma artwork URLs, and simplified chroma section copy.',
    details: [
      'Recorded each Aatrox skin’s exact CommunityDragon/Riot client rarity identifier and derive the display tier from that identifier. The type system now supports Common, Rare, Epic, Legendary, Mythic, Ultimate, Exalted, and Transcendent tiers for future catalogues.',
      'Added the official local Riot client gem PNGs for Epic, Legendary, Mythic, Ultimate, Exalted, and Transcendent; Common and Rare do not display an invented gem because the client supplies none for those classifications.',
      'Corrected the CommunityDragon chroma route from the obsolete lol-game-data/assets path to the current v1/champion-chroma-images path, resolving broken chroma previews.',
      'Renamed the chroma eyebrow to CHROMAS and removed the redundant direct-artwork note.',
    ],
    impact: [
      'Players see accurate skin rarity treatment and functioning chroma previews.',
      'Future Champion Hub catalogues can represent every current Riot client rarity without assigning decorative tiers manually.',
    ],
    files: [
      'components/champion-skins.tsx',
      'lib/champion-hub.ts',
      'public/rarity-icons/epic.png',
      'public/rarity-icons/legendary.png',
      'public/rarity-icons/mythic.png',
      'public/rarity-icons/ultimate.png',
      'public/rarity-icons/exalted.png',
      'public/rarity-icons/transcendent.png',
      'tests/champion-hub.test.ts',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint retained only the repository\'s existing seven img-element warnings; typecheck passed; 36 Vitest files and 168 tests passed.',
      'Representative corrected CommunityDragon chroma URLs (Paragon, Obsidian, and Ruby) each returned 200 image/png.',
      'Champion Hub coverage asserts the full Aatrox Riot client rarity-to-display-tier mapping.',
    ],
  },
  {
    id: 'patch-2026-10-14-champion-skins-rarity-and-lore-sourcing',
    patch: 'patch-2026-10-14-champion-skins-rarity-and-lore-sourcing',
    timestamp: '2026-10-14T18:42:02.9915163Z',
    title: 'Refine Aatrox skin collection metadata and rarity presentation',
    summary:
      'Simplified the Skins tab copy, added the supplied-style rarity gem sprite, and limited skin lore to exact Riot client descriptions when Riot provides one.',
    details: [
      'Removed the selected-skin and splash labels, consolidated the collection heading to “ALL AATROX SKINS,” and changed the collection count to the requested total-skins wording.',
      'Added a transparent rarity gem sprite under public/rarity-icons and use it for selected and collection skin rarity markers; collection skin names now inherit a color that matches their rarity gem.',
      'Replaced hand-authored skin lore with the exact local snapshot of Riot client cosmetic descriptions, stored as officialLore. The lore panel is omitted for cosmetics, including the base skin, where Riot does not provide a description.',
      'Renamed Prestige Points pricing to Mythic Essence and removed hover notes from the previous/next skin controls and rarity markers.',
    ],
    impact: [
      'Players see a less repetitive skin browser with clear rarity signals and the correct Mythic Essence terminology.',
      'Skin lore no longer presents generated or paraphrased copy as official text, and unavailable official descriptions no longer create an empty lore surface.',
    ],
    files: [
      'components/champion-skins.tsx',
      'lib/champion-hub.ts',
      'public/rarity-icons/skin-rarity-gems.png',
      'tests/champion-hub.test.ts',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint retained only the repository\'s existing seven img-element warnings; typecheck passed; 36 Vitest files and 168 tests passed.',
      'Champion Hub coverage verifies a skin without official lore, a stored official Riot-client description, and the Mythic Essence display value.',
    ],
  },
  {
    id: 'patch-2026-10-14-champion-skins-tab-foundation',
    patch: 'patch-2026-10-14-champion-skins-tab-foundation',
    timestamp: '2026-10-14T17:24:23.5857988Z',
    title: 'Launch the Aatrox Champion Hub Skins tab',
    summary:
      'Added URL-driven Aatrox skin browsing with shared Champion Detail chrome, direct Riot splash/chroma delivery, static cosmetic metadata, and Model Viewer links.',
    details: [
      'Extracted the Champion Detail navigation rail and champion header into ChampionDetailShell so Overview, Skins, and future tab URLs share one responsive implementation and active-tab treatment.',
      'Added the /champions/[slug]/skins route with a skin query parameter; missing or invalid selections safely default to the base skin, while thumbnail and previous/next navigation produce browser-history entries.',
      'Added a curated local snapshot of Aatrox cosmetic metadata: 13 skins, rarity, price, availability, skin line, optional lore, 28 chromas, and direct Model Viewer URLs. No runtime catalogue request is made.',
      'Introduced GameDirectImage for unoptimized direct CDN delivery of the shared Champion Detail header, every skin splash, and every chroma preview, bypassing Vercel image transformations.',
      'Added URL-backed placeholder pages for the remaining detail tabs so every side-navigation entry has a stable browser route while its content is prepared.',
    ],
    impact: [
      'Players can browse Aatrox cosmetics, inspect lore and chromas where present, open the matching 3D model, and share a direct selected-skin URL.',
      'Future Champion Detail tabs inherit navigation, header, tooltip, responsive behavior, and active-state changes automatically instead of duplicating the chrome.',
    ],
    files: [
      'app/champions/[slug]/skins/page.tsx',
      'app/champions/[slug]/[tab]/page.tsx',
      'components/champion-detail-shell.tsx',
      'components/champion-profile.tsx',
      'components/champion-skins.tsx',
      'components/game-asset-image.tsx',
      'lib/champion-hub.ts',
      'tests/champion-hub.test.ts',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint retained only the repository\'s existing seven img-element warnings; typecheck passed; 36 Vitest files and 168 tests passed.',
      'Champion Hub tests verify the base-skin fallback, direct Primordian skin lookup, Lunar Eclipse chroma count, and Aatrox Model Viewer link shape.',
    ],
  },
  {
    id: 'patch-2026-10-09-champion-overview-active-navigation-state',
    patch: 'patch-2026-10-09-champion-overview-active-navigation-state',
    timestamp: '2026-10-09T19:57:38.9709397Z',
    title: 'Restore Champion Detail active navigation clarity',
    summary:
      'Restored an unambiguous current-page treatment for the active Champion Detail navigation item without reintroducing a colored navigation background.',
    details: [
      'Marked the Overview tab as the current page and distinguished it through an amber outline, inset ring, icon color, and high-contrast label while leaving its fill transparent.',
    ],
    impact: [
      'Players can immediately identify the open Champion Detail section in both the expanded sidebar and collapsed navigation rail.',
    ],
    files: [
      'components/champion-profile.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint retained only the repository\'s existing seven img-element warnings; typecheck passed; 36 Vitest files and 167 tests passed.',
      'The current page is exposed semantically through aria-current and visually through a transparent, amber outlined active state.',
    ],
  },
  {
    id: 'patch-2026-10-09-champion-overview-hover-visibility',
    patch: 'patch-2026-10-09-champion-overview-hover-visibility',
    timestamp: '2026-10-09T19:54:20.5517535Z',
    title: 'Expose Champion Detail hover notes above visual containers',
    summary:
      'Centered shared hover notes on their trigger and removed Champion Detail clipping and stacking barriers so contextual help remains visible above nearby panels.',
    details: [
      'Centered compact and wide HeaderHoverNote variants on their trigger instead of their left edge, preserving content-fit sizing and above or below placement behavior.',
      'Reworked the champion hero background into its own clipped layer and made combat and ability surfaces tooltip-safe, allowing notes to rise above rounded panel boundaries without exposing splash-art corners or decorative glow.',
      'Removed the class icon from the Style heading, added a source-backed primary combat-style field with an above-anchored note on the AP-to-AD spectrum, and documented Aatrox as primarily basic-attack focused.',
      'Added playstyle ring hit targets for every metric, retained vertical Damage alignment, and added Champion Hub test coverage for primary combat style metadata.',
    ],
    impact: [
      'Players can reliably inspect hover context without it rendering beneath or being masked by adjacent Champion Detail surfaces.',
      'Style metadata is clearer and no longer conflates champion class with basic-attack versus ability emphasis.',
    ],
    files: [
      'components/header-hover-note.tsx',
      'components/champion-profile.tsx',
      'lib/champion-hub.ts',
      'tests/champion-hub.test.ts',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint retained only the repository\'s existing seven img-element warnings; typecheck passed; 36 Vitest files and 167 tests passed.',
      'Champion Hub catalogue coverage now verifies Aatrox\'s primary combat-style metadata; the shared hover note remains backward compatible because its below placement is still the default.',
    ],
  },
  {
    id: 'patch-2026-10-09-champion-overview-hover-and-dial-alignment',
    patch: 'patch-2026-10-09-champion-overview-hover-and-dial-alignment',
    timestamp: '2026-10-09T19:10:54.4478258Z',
    title: 'Align Champion Detail tooltips, collapsed controls, and playstyle sectors',
    summary:
      'Removed remaining sidebar color washes, made Champion Detail hover notes compact and above-anchored, and improved playstyle dial orientation and interaction coverage.',
    details: [
      'Added an above or below placement option to the shared HeaderHoverNote and removed its compact fixed width so short notes fit their content without empty space; Champion Detail notes now use above placement to avoid lower-panel clipping.',
      'Added transparent hover targets over every playstyle ring sector, exposing each Riot client capability score through the shared note component.',
      'Collapsed the lane presentation into one summary note that lists supported lanes, rotated the dial so Damage is vertical, and replaced the crowd-control marker with the shared Riot tenacity atlas icon.',
      'Removed the sidebar\'s amber wash and active-tab fill, then sized the collapsed navigation toggle to the same 48px footprint as the other rail controls.',
    ],
    impact: [
      'Short tooltips across the application no longer reserve unnecessary blank width, while Champion Detail context stays visually above the control that invoked it.',
      'Players can inspect each playstyle metric directly from the dial instead of relying solely on its iconography.',
      'The collapsed navigation rail has consistent control sizing and neutral visual treatment.',
    ],
    files: [
      'components/header-hover-note.tsx',
      'components/champion-profile.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint retained only the repository\'s existing seven img-element warnings; typecheck passed; 36 Vitest files and 167 tests passed.',
      'Verified the shared hover-note API remains backwards compatible because above placement is opt-in and below remains the default.',
    ],
  },
  {
    id: 'patch-2026-10-09-champion-overview-asset-and-tooltip-refinement',
    patch: 'patch-2026-10-09-champion-overview-asset-and-tooltip-refinement',
    timestamp: '2026-10-09T18:23:52.5442125Z',
    title: 'Refine Champion Overview icon scaling, profile dial, and hover notes',
    summary:
      'Preserved direct Data Dragon image delivery while resizing ability artwork appropriately, tightened the playstyle dial, and standardized Champion Detail hover notes on the shared UI treatment.',
    details: [
      'Moved selected ability artwork beside its name at a native-friendly 64–80 pixel display size instead of enlarging a 64-pixel source into a large panel; GameIconImage remains unoptimized and never uses a Vercel image transformation.',
      'Reduced the visual gaps between playstyle metric sectors and replaced the remaining Lucide glyphs with the shared Riot stat-icon atlas used by the Augment Builder.',
      'Removed the Lore at a glance heading and replaced every native title tooltip in Champion Detail with HeaderHoverNote, including champion metadata, playstyle metrics, ability tabs, and completed or future sidebar tabs.',
      'Removed red active-state and header wash styling from the sidebar, centered the collapsed toggle by eliminating a collapsed-state flex gap, and kept labels in place for clipped rail transitions.',
    ],
    impact: [
      'Ability artwork remains sharp without adding image optimization cost or a new remote asset dependency.',
      'Champion Detail help affordances now match the application\'s existing hover-note styling instead of invoking browser-native tooltips.',
      'The compact sidebar is visually neutral and aligns its only top control correctly when collapsed.',
    ],
    files: [
      'components/champion-profile.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint retained only the repository\'s existing seven img-element warnings; typecheck passed; 36 Vitest files and 167 tests passed.',
      'Champion Detail no longer contains native title tooltip attributes; hoverable champion metadata, metric glyphs, ability tabs, and future section tabs use HeaderHoverNote.',
    ],
  },
  {
    id: 'patch-2026-10-09-champion-overview-source-and-interaction-refinement',
    patch: 'patch-2026-10-09-champion-overview-source-and-interaction-refinement',
    timestamp: '2026-10-09T17:24:39.0633641Z',
    title: 'Ground Aatrox overview copy and playstyle visuals in Riot data',
    summary:
      'Replaced generated Aatrox lore with Riot\'s published champion description, rebuilt the profile dial from official client metadata, and refined navigation and ability presentation behavior.',
    details: [
      'Stored the exact current Aatrox short biography from the official League of Legends champion page with an explicit source record; the page remains static and makes no runtime Riot request.',
      'Changed the playstyle diagram from arbitrary ring segments into five semantic metric sectors backed by Riot client metadata: damage 3, durability 3, crowd control 2, mobility 2, and utility 2.',
      'Reused the Augment Builder\'s shared AP and AD atlas icons for the style spectrum and positioned Aatrox\'s marker 90 percent toward attack damage.',
      'Enlarged the selected ability artwork, removed its decorative background, and matched its dark-gold frame to the ability tabs; restored rounded tab corners at the outer edges.',
      'Removed Eternals milestone-count badges and the future-sections note. Sidebar labels now remain mounted and animate through clipped width and opacity transitions while the rail changes width; All champions is a dedicated control above the section list.',
    ],
    impact: [
      'Champion lore can be audited directly to Riot\'s official profile, and future champion records have a structured source field rather than undocumented prose.',
      'The playstyle display more accurately communicates the client\'s underlying capability scores while preserving the visual language of the supplied Riot reference.',
      'Sidebar collapse and expansion no longer causes instant label insertion or removal that can disturb the rail\'s layout.',
    ],
    files: [
      'components/champion-profile.tsx',
      'lib/champion-hub.ts',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint retained only the repository\'s existing seven img-element warnings; typecheck passed; 36 Vitest files and 167 tests passed.',
      'Champion Hub catalogue tests now assert the official lore provenance and the five sourced playstyle metric values for Aatrox.',
    ],
  },
  {
    id: 'patch-2026-10-09-champion-overview-visual-polish',
    patch: 'patch-2026-10-09-champion-overview-visual-polish',
    timestamp: '2026-10-09T05:16:28.6952931Z',
    title: 'Polish the Aatrox overview combat, abilities, and Eternals surfaces',
    summary:
      'Brought the combat profile closer to Riot\'s segmented circular presentation, clarified ability selection, and simplified Eternals and footer chrome.',
    details: [
      'Rebuilt the static combat profile dial with concentric dark-teal rings, cyan segments, spokes, central marker, and surrounding role glyphs inspired by the supplied official reference.',
      'Added the missing Style spectrum between skirmish and brawler markers beneath the class icon, while retaining the existing damage and difficulty data.',
      'Removed redundant ability labels and the default-selection note; enlarged tab artwork with dark-gold borders and made the active tab prominent through a gold-edged gradient and selection bar.',
      'Removed Progression and source-link chrome from Eternals, then elevated Series cards with milestone counts, gradient treatments, glow accents, and individual milestone rails.',
      'Removed the redundant Browse champions and Riot profile footer controls; the sidebar and ability-level official link remain available navigation paths.',
    ],
    impact: [
      'The Champion Overview now more faithfully expresses Riot\'s familiar playstyle visual language without adding animation or runtime data requests.',
      'Ability selection is more discoverable, while Eternals receive stronger visual separation without exposing unnecessary page-level source controls.',
    ],
    files: [
      'components/champion-profile.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint retained only the repository\'s existing seven img-element warnings; typecheck passed; 36 Vitest files and 167 tests passed.',
      'A first typecheck correctly identified an unavailable Fist export in the installed lucide-react version; it was replaced with the supported Shield glyph before the final passing verification.',
    ],
  },
  {
    id: 'patch-2026-10-09-champion-overview-information-refinement',
    patch: 'patch-2026-10-09-champion-overview-information-refinement',
    timestamp: '2026-10-09T03:32:55.7391070Z',
    title: 'Refine the Aatrox Champion Overview information architecture',
    summary:
      'Reworked the Aatrox overview around in-app class and lane iconography, a static combat chart, a unified ability inspector, and sourced Eternals milestones.',
    details: [
      'Removed the Champion Overview eyebrow and the Playstyle panel, leaving lore and the visual combat profile as the focused overview content.',
      'Added typed class and lane metadata to the Champion Hub catalogue; the detail hero now presents Riot class icons and every established lane icon, with supported lanes visibly emphasized.',
      'Removed the combat profile label, placed class icons directly beside Style, combined the difficulty name and tier on one line, and changed the radial diagram from a rotating rune to a static segmented combat graphic.',
      'Combined ability selection and selected-ability details into one bordered panel with flush horizontal tabs, and removed the Pick an ability to inspect heading.',
      'Replaced provisional Aatrox Eternals copy with six Series 1 and Series 2 milestone facts sourced from the public League of Legends Wiki; source content is stored statically and is not fetched at runtime.',
    ],
    impact: [
      'Visitors can identify Aatrox class and lane context through the app\'s established icon assets without text-heavy metadata chips.',
      'The overview has a more direct visual hierarchy while preserving accessible names, keyboard-selectable ability tabs, and an external source link for Eternals data.',
      'Future Champion Hub entries can declare multiple classes and lanes using the same typed catalogue fields.',
    ],
    files: [
      'components/champion-profile.tsx',
      'lib/champion-hub.ts',
      'tests/champion-hub.test.ts',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint retained only the repository\'s existing seven img-element warnings; typecheck passed; 36 Vitest files and 167 tests passed.',
      'git diff --check passed. The prior local dev server was no longer accepting connections, so no parallel dev server or production build was started.',
    ],
  },
  {
    id: 'patch-2026-10-08-champion-directory-card-refinement',
    patch: 'patch-2026-10-08-champion-directory-card-refinement',
    timestamp: '2026-10-08T21:50:26.4295973Z',
    title: 'Streamline Champion Directory cards and repair priority image loading',
    summary:
      'Removed the Champion Hub introduction and result count from the directory, simplified champion cards around class and lane markers, and fixed the champion detail image-loading error.',
    details: [
      'Removed the top Champion Hub panel, directory availability count, card portrait, and Explore champion prompt so the directory opens directly into its searchable catalogue.',
      'Added stacked, role-aware Lucide class markers to each card and a lane marker anchored at the bottom of the same rail; the helper safely supports future multi-class role strings.',
      'Kept card hover interaction to image zoom and upward movement only, without changing the card border on hover.',
      'Updated GameIconImage so priority images no longer receive an incompatible lazy loading prop, fixing the Aatrox detail-page runtime error.',
    ],
    impact: [
      'Champion cards are less visually crowded while retaining class and lane context at a glance.',
      'Champion detail pages can render priority portrait icons without triggering a Next.js image-prop exception.',
    ],
    files: [
      'components/champion-directory.tsx',
      'components/game-asset-image.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint retained only the repository’s existing seven img-element warnings; typecheck passed; 36 Vitest files and 167 tests passed.',
      'The existing local dev server returned HTTP 200 for /champions and /champions/aatrox, and the Aatrox response did not contain the former priority-plus-lazy image error. No production build was run because the dev server was active.',
    ],
  },
  {
    id: 'patch-2026-10-08-champion-hub-aatrox-overview',
    patch: 'patch-2026-10-08-champion-hub-aatrox-overview',
    timestamp: '2026-10-08T18:08:43.9435644Z',
    title: 'Launch the Aatrox Champion Hub overview foundation',
    summary:
      'Added the first Champion Hub directory and Aatrox overview page with a searchable champion entry, reusable detail shell, ability inspection, static overview content, and responsive navigation access.',
    details: [
      'Added /champions and /champions/aatrox routes backed by a typed hand-authored Champion Hub catalogue that keeps durable overview copy separate from generated gameplay catalogues.',
      'Built the Aatrox overview with a collapsible section rail, champion hero, lore and playstyle panels, combat profile, selectable passive/Q/W/E/R ability panels, Riot profile link, and scoped future-section placeholders.',
      'Added Champion Hub entry points to desktop and drawer League Tools navigation, using existing Data Dragon CDN image handling and local static data only.',
      'Added motion-safe rune and splash reveal treatments, including reduced-motion fallbacks, without adding runtime Riot data requests or user data collection.',
    ],
    impact: [
      'Visitors can discover the Champion Hub, search its initial Aatrox entry, and explore a polished overview without an account or API request.',
      'Future champions and completed tabs can reuse the same typed catalogue, metadata route, sidebar, and ability presentation without coupling to quiz gameplay data.',
    ],
    files: [
      'app/champions/page.tsx',
      'app/champions/[slug]/page.tsx',
      'components/champion-directory.tsx',
      'components/champion-profile.tsx',
      'components/app-header.tsx',
      'components/app-navigation-drawer.tsx',
      'lib/champion-hub.ts',
      'app/globals.css',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run lint passed with only the repository’s existing seven img-element warnings in profile-screen.tsx, public-profile-screen.tsx, and riftbound-compact-deck-view.tsx.',
      'npm run typecheck passed.',
      'npm run test:run passed: 36 files and 167 tests, including the new Champion Hub catalogue coverage.',
      'git diff --check passed; the existing local dev server returned HTTP 200 for /champions and /champions/aatrox. No production build was run because the dev server was active.',
    ],
  },
  {
    id: 'patch-2026-10-07-token-mapping-cache-invalidation-news',
    patch: 'patch-2026-10-07-token-mapping-cache-invalidation-news',
    timestamp: '2026-10-07T17:54:46.0202622Z',
    title: 'Repair token mapping refreshes and publish Token Leaderboards update',
    summary:
      'Account Viewer completions now invalidate stale token leaderboard browser caches, mapping write failures emit safe diagnostics, and Update 0.3.0 documents the Token Leaderboards release.',
    details: [
      'Added a cross-tab mapping-update signal so token leaderboard session and in-memory caches are cleared after an Account Viewer account load; the next token refresh rehydrates stored Riot IDs from Supabase.',
      'Added aggregate-only warning logs for failures writing the PUUID-to-Riot ID mapping or updating existing leaderboard rows, without logging PUUIDs, Riot IDs, or raw database errors.',
      'Added the public Update 0.3.0 - Token Leaderboards Arrive! entry with New Tool, New Feature, and Bug Fixes sections matching the existing News and Updates format.',
    ],
    impact: [
      'Players no longer remain stuck on a PUUID-only token row after viewing that account; mapping failures are diagnosable by staff without exposing account identifiers in logs.',
      'Visitors can discover the Token Leaderboards feature and its daily refresh/search behavior from the public Updates screen.',
    ],
    files: [
      'components/riot-account-viewer.tsx',
      'components/riot-token-leaderboards.tsx',
      'lib/riot-account-viewer.ts',
      'lib/news.ts',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: typecheck succeeded and Vitest passed 35 test files with 165 tests; lint reported only existing image optimization warnings.',
    ],
  },
  {
    id: 'patch-2026-10-07-token-search-global-position',
    patch: 'patch-2026-10-07-token-search-global-position',
    timestamp: '2026-10-07T17:42:27.6025393Z',
    title: 'Show searched token positions beyond the top 250',
    summary:
      'Token searches now use Riot player challenge data to show a searched player’s position and points even when the player is outside the cached top-250 list.',
    details: [
      'When a regional Riot ID search is not found in the cached leaderboard, query the player-data endpoint for the selected token and build the same searched-player result from its position and value.',
      'Keep the Show in list action limited to players actually present in the rendered top-250 entries, while retaining the Account Viewer link for out-of-list results.',
      'Replace the old not-in-top-250 message with a no-position message only when Riot returns no matching token progress for the searched account.',
    ],
    impact: [
      'Users can see a direct token placement without requiring the player to be among the displayed top 250; this adds one Riot player-data request only for searches that miss the cached list.',
    ],
    files: [
      'lib/riot-token-leaderboards.ts',
      'components/riot-token-leaderboards.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: typecheck succeeded and Vitest passed 35 test files with 165 tests; lint reported only existing image optimization warnings.',
    ],
  },
  {
    id: 'patch-2026-10-07-searched-token-player-panel',
    patch: 'patch-2026-10-07-searched-token-player-panel',
    timestamp: '2026-10-07T17:37:47.7776881Z',
    title: 'Refine searched token player navigation',
    summary:
      'Searched token players now appear in a green result panel above the API limitation note, with direct account-viewer navigation and an in-list scroll action.',
    details: [
      'Replaced the ranked-in-region message for successful searches with a Searched Player - region heading and a green result card.',
      'Made the player portion of the result card open the account viewer in a new tab and added a Show in list button that smoothly scrolls to the matching leaderboard row.',
      'Added stable row identifiers based on the player platform and PUUID so the scroll target remains precise across regional and combined leaderboards.',
    ],
    impact: [
      'Users can move between a direct token search, the account viewer, and the player’s position in the top-250 list without repeating the search.',
    ],
    files: [
      'components/riot-token-leaderboards.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: typecheck succeeded and Vitest passed 35 test files with 165 tests; lint reported only existing image optimization warnings.',
    ],
  },
  {
    id: 'patch-2026-10-07-token-session-cache-retryable-refresh',
    patch: 'patch-2026-10-07-token-session-cache-retryable-refresh',
    timestamp: '2026-10-07T00:00:00.000Z',
    title: 'Cache token leaderboard sessions and retry failed refreshes',
    summary:
      'Token leaderboard catalogue and normal token/region responses are cached for the browser session, and failed leaderboard refresh claims can be retried without waiting for the stale-running timeout.',
    details: [
      'Added a versioned sessionStorage cache for the token catalogue and successful, unsearched token leaderboard responses. Cached responses are validated against nextRefreshAt and search-specific results are never stored.',
      'Added migration 142 to update the existing refresh-claim function so rows marked error are reclaimable immediately while active runs remain protected and stale running rows still recover after ten minutes.',
    ],
    impact: [
      'Returning to a token leaderboard in the same browser session avoids a repeat API request until the server-provided refresh time. ARAM Eradication and any other failed generation can be retried instead of remaining stuck in the generating state.',
      'Migration 142 was applied to the configured Supabase project so the refresh-claim function can reclaim failed rows immediately.',
    ],
    files: [
      'components/riot-token-leaderboards.tsx',
      'supabase/migrations/142_retry_failed_riot_token_refreshes.sql',
    ],
    verification: [
      'npm run check passed: typecheck succeeded and Vitest passed 35 test files with 165 tests; lint reported only existing image optimization warnings.',
    ],
  },
  {
    "id": "patch-2026-10-06-token-detail-polish",
    "patch": "2026.10.06-token-detail-polish",
    "timestamp": "2026-10-06T00:03:43.218Z",
    "title": "Polish token detail metadata, rank emphasis, and local response reuse",
    "summary": "Token detail pages now use a more compact header, expose active-state metadata, emphasize the top ten, align the Change column, and reuse fresh token-region responses during the page session.",
    "details": [
      "Extended the fourth- and fifth-place visual treatment through rank ten and added matching rank badges while preserving distinct first-, second-, and third-place colors.",
      "Made the Change header and movement cells use the same fixed right-aligned width; unmoved entries continue to display an equal sign while the separate row navigation arrow remains a profile-link affordance.",
      "Reduced token header padding, icon size, title scale, and description spacing, and added Active/Inactive status derived from Riot challenge state metadata.",
      "Added a page-session cache keyed by token and region for normal responses; cached entries expire at the response's next daily refresh boundary and search responses are never cached."
    ],
    "impact": [
      "Token detail pages are shorter and easier to scan, with top-ten entries visually separated from the rest of the leaderboard.",
      "Repeated region switches during one visit avoid duplicate API requests without adding persistent browser storage or bypassing the server's daily cache."
    ],
    "files": [
      "components/riot-token-leaderboards.tsx",
      "lib/riot-token-leaderboards.ts",
      "lib/staff-changelog.ts"
    ],
    "verification": [
      "npm run check passed: lint completed with only the repository's existing unrelated img-element warnings, typecheck passed, and 35 Vitest files with 165 tests passed; no production build was run."
    ]
  },
  {
    "id": "patch-2026-10-05-token-leaderboard-name-batches",
    "patch": "2026.10.05-token-leaderboard-name-batches",
    "timestamp": "2026-10-05T23:52:30.653Z",
    "title": "Batch stored Riot ID hydration and strengthen top-five styling",
    "summary": "Token leaderboard refreshes now hydrate stored Riot IDs through bounded cache queries, while the warning and top-five presentation receive the requested visual updates.",
    "details": [
      "Split cached PUUID-to-Riot ID lookups into batches of 50 instead of sending all 250 PUUIDs in one PostgREST IN query, preventing oversized query failures from silently returning no names during refresh.",
      "Changed the API limitation note to an amber warning panel without a background shadow.",
      "Added stronger top-five row treatments, rank badges, gradients, inset accents, and rank-specific highlights for first through fifth place."
    ],
    "impact": [
      "Previously stored Riot IDs can now be recovered reliably when a token's daily leaderboard is regenerated.",
      "Top-five entries are more visually distinguishable without changing ranking or point data."
    ],
    "files": [
      "lib/riot-token-leaderboards.ts",
      "components/riot-token-leaderboards.tsx",
      "lib/staff-changelog.ts"
    ],
    "verification": [
      "npm run check passed: lint completed with only the repository's existing unrelated img-element warnings, typecheck passed, and 35 Vitest files with 165 tests passed; no production build was run."
    ]
  },
  {
    "id": "patch-2026-10-05-token-catalog-loading-state",
    "patch": "2026.10.05-token-catalog-loading-state",
    "timestamp": "2026-10-05T23:46:20.688Z",
    "title": "Fix token catalogue loading after a successful response",
    "summary": "The Token Leaderboards index now applies its successful 200 response even when React development effect replay is suppressed by the duplicate-request guard.",
    "details": [
      "Removed the first-effect active flag that was set false during Strict Mode cleanup before the guarded request completed.",
      "Kept the initial-load ref guard so only one catalogue request is started while allowing its response, error, and finally handlers to update the mounted page state."
    ],
    "impact": [
      "The token catalogue no longer remains on its spinner after the API returns 200 and valid token JSON.",
      "Development-mode duplicate initial requests remain suppressed."
    ],
    "files": [
      "components/riot-token-leaderboards.tsx",
      "lib/staff-changelog.ts"
    ],
    "verification": [
      "npm run check passed: lint completed with only the repository's existing unrelated img-element warnings, typecheck passed, and 35 Vitest files with 165 tests passed; no production build was run."
    ]
  },
  {
    "id": "patch-2026-10-05-disable-raw-riot-revalidation",
    "patch": "2026.10.05-disable-raw-riot-revalidation",
    "timestamp": "2026-10-05T23:41:39.429Z",
    "title": "Guarantee raw Riot payloads bypass Next data caching",
    "summary": "Removed the unused shared Riot-fetch revalidation option so the oversized challenge configuration can only be fetched with no-store before the parsed catalogue cache handles reuse.",
    "details": [
      "Removed the revalidation overload and conditional request-init branch from riotFetch; all raw Riot API responses now explicitly use cache: no-store.",
      "Left the compact parsed token catalogue cache in place as the only cache for token metadata, keeping the raw 3 MB response out of Next's 2 MB data-cache limit.",
      "Documented that a running development server must restart once to discard a stale compiled module from the prior revalidation implementation."
    ],
    "impact": [
      "The reported Failed to set fetch cache error cannot be produced by the current raw challenge-config request path.",
      "Token catalogue reuse remains hourly through the parsed application-level cache."
    ],
    "files": [
      "lib/riot-account-viewer.ts",
      "lib/staff-changelog.ts"
    ],
    "verification": [
      "npm run check passed on rerun: lint completed with only the repository's existing unrelated img-element warnings, typecheck passed, and 35 Vitest files with 165 tests passed; no production build was run."
    ]
  },
  {
    "id": "patch-2026-10-05-token-catalog-cache-size",
    "patch": "2026.10.05-token-catalog-cache-size",
    "timestamp": "2026-10-05T23:35:26.872Z",
    "title": "Cache the parsed token catalogue instead of the oversized Riot payload",
    "summary": "Removes the Next.js data-cache failure caused by Riot's 3 MB challenge configuration response while retaining hourly server-side catalogue reuse.",
    "details": [
      "Changed the raw Riot challenge configuration request back to no-store so Next.js never attempts to persist the 3,154,342-byte response that exceeds its 2 MB cache limit.",
      "Wrapped the parsed, leaderboard-only token catalogue in an hourly unstable_cache entry; only the compact application response is persisted and reused.",
      "Kept the existing in-process catalogue cache and daily token leaderboard refresh/cache behavior unchanged."
    ],
    "impact": [
      "Token leaderboard requests no longer emit the Failed to set fetch cache error for the oversized Riot configuration payload.",
      "After the parsed catalogue cache is warm, token detail requests can resolve token metadata without refetching the full Riot configuration."
    ],
    "files": [
      "lib/riot-token-leaderboards.ts",
      "lib/staff-changelog.ts"
    ],
    "verification": [
      "npm run check passed: lint completed with only the repository's existing unrelated img-element warnings, typecheck passed, and 35 Vitest files with 165 tests passed; no production build was run."
    ]
  },
  {
    "id": "patch-2026-10-05-puuid-stale-mapping-fallback",
    "patch": "2026.10.05-puuid-stale-mapping-fallback",
    "timestamp": "2026-10-05T23:30:41.010Z",
    "title": "Recover missing and stale PUUID Riot ID mappings",
    "summary": "Account Viewer PUUID links now fall back to Riot's PUUID account endpoint only when the local mapping is missing or no longer resolves to the same account.",
    "details": [
      "Refactored Riot ID account resolution into a reusable helper and added a controlled PUUID account-resolution helper for fallback cases.",
      "When a stored Riot ID still resolves to the same PUUID, the existing mapping path remains in use without a PUUID conversion request.",
      "When the mapping is absent, the stored Riot ID returns not found, or it resolves to a different PUUID after a rename/reassignment, the server calls Riot by PUUID and rebuilds the profile from the returned Riot ID.",
      "Successful fallback results continue through the existing Account Viewer search recorder, which updates the application mapping and matching cached token leaderboard rows."
    ],
    "impact": [
      "Normal PUUID clicks remain low-cost when the local mapping is valid, while new or renamed accounts can recover automatically.",
      "A Riot PUUID-to-Riot ID request is now intentionally spent only for missing or stale mappings rather than for every leaderboard entry."
    ],
    "files": [
      "lib/riot-account-viewer.ts",
      "lib/staff-changelog.ts"
    ],
    "verification": [
      "npm run check passed: lint completed with only the repository's existing unrelated img-element warnings, typecheck passed, and 35 Vitest files with 165 tests passed; no production build was run."
    ]
  },
  {
    "id": "patch-2026-10-05-account-viewer-search-layout",
    "patch": "2026.10.05-account-viewer-search-layout",
    "timestamp": "2026-10-05T19:55:09.953Z",
    "title": "Restore Account Viewer search control alignment",
    "summary": "The Account Viewer search icon and account controls now remain anchored to the input while the PUUID loading status is displayed below it.",
    "details": [
      "Wrapped the input, search icon, and inline Update control in a dedicated relative container so the loading message cannot change their absolute positioning context.",
      "Preserved the existing Account Viewer input, platform selector, Search button, and Profile last updated layout while keeping the loading status beneath the input field."
    ],
    "impact": [
      "Searching by PUUID no longer moves the search icon to the bottom of the field or distorts the adjacent controls.",
      "Loaded and loading Account Viewer states now share the same search-row geometry."
    ],
    "files": [
      "components/riot-account-viewer.tsx",
      "components/riot-token-leaderboards.tsx",
      "lib/staff-changelog.ts"
    ],
    "verification": [
      "npm run check passed: lint completed with only the repository's existing unrelated img-element warnings, typecheck passed, and 35 Vitest files with 165 tests passed; no production build was run."
    ]
  },
  {
    "id": "patch-2026-10-05-token-leaderboard-latency",
    "patch": "2026.10.05-token-leaderboard-latency",
    "timestamp": "2026-10-05T19:31:43.607Z",
    "title": "Reduce token leaderboard cold-read latency and duplicate requests",
    "summary": "Token leaderboard detail loads now reuse Riot challenge configuration through the server data cache, while the client prevents duplicate initial requests caused by development effect replays.",
    "details": [
      "Changed the shared Riot fetch helper to support an explicit revalidation interval and configured the token catalogue request to revalidate once per hour instead of using no-store on every cold server request.",
      "Added initial-load guards to the token leaderboard index and detail components so a React development effect replay does not issue duplicate catalogue or leaderboard requests.",
      "Kept leaderboard rows and daily refresh behavior unchanged: once the scheduled 250-entry pull is stored, regional reads continue to come from the Supabase cache and do not regenerate the Riot leaderboard.",
      "Moved the Account Viewer loading status beneath the Riot ID/PUUID input and restyled the token API limitation notice as a prominent red panel."
    ],
    "impact": [
      "Cached token leaderboard reads avoid the slow Riot configuration request after the server data cache is warm, improving navigation to token pages without changing the 5pm ET refresh policy.",
      "The UI no longer makes two identical initial detail requests during React development-mode effect replay."
    ],
    "files": [
      "lib/riot-account-viewer.ts",
      "lib/riot-token-leaderboards.ts",
      "components/riot-token-leaderboards.tsx",
      "components/riot-account-viewer.tsx",
      "lib/staff-changelog.ts"
    ],
    "verification": [
      "npm run check passed: lint completed with only the repository's existing unrelated img-element warnings, typecheck passed, and 35 Vitest files with 165 tests passed; no production build was run."
    ]
  },
  {
    "id": "patch-2026-10-05-token-puuid-mapping-sync",
    "patch": "2026.10.05-token-puuid-mapping-sync",
    "timestamp": "2026-10-05T19:19:53.119Z",
    "title": "Use stored PUUID mappings for token leaderboard account links",
    "summary": "Keeps token leaderboard PUUID handling within the application-owned Riot ID mapping while making the Account Viewer and cached leaderboard rows converge after an account search.",
    "details": [
      "Removed the Account Viewer PUUID-to-Riot-ID endpoint call from the PUUID lookup path; PUUID searches now use the stored riot_token_player_names mapping and then load the account by Riot ID.",
      "Account Viewer Riot ID searches now update both the application mapping and every matching cached leaderboard row for that PUUID and platform.",
      "Added an explicit loading status for Account Viewer searches initiated with a PUUID and the current API-limitation note above token leaderboard tables.",
      "Mapped missing local PUUID mappings to a clear not-found response instead of attempting a costly Riot conversion lookup."
    ],
    "impact": [
      "Token leaderboard rows now display stored Riot IDs as soon as an Account Viewer search discovers them, without spending developer-key requests on automatic PUUID conversion.",
      "PUUID-only entries remain identifiable and clickable, but require a stored mapping before the Account Viewer can load the full account profile."
    ],
    "files": [
      "lib/riot-account-viewer.ts",
      "app/api/riot-account/viewer/route.ts",
      "components/riot-account-viewer.tsx",
      "components/riot-token-leaderboards.tsx",
      "lib/staff-changelog.ts"
    ],
    "verification": [
      "npm run check passed: lint completed with only the repository's existing unrelated img-element warnings, typecheck passed, and 35 Vitest files with 165 tests passed; no production build was run."
    ]
  },
  {
    "id": "patch-2026-10-05-token-leaderboard-puuid-links",
    "patch": "2026.10.05-token-leaderboard-puuid-links",
    "timestamp": "2026-10-05T18:58:41.882Z",
    "title": "Added PUUID fallback navigation for token leaderboards",
    "summary": "Token leaderboard rows now remain usable when Riot ID hydration is unavailable: they display the stored PUUID and open the Account Viewer through a server-side PUUID lookup.",
    "details": [
      "Included each leaderboard entry's PUUID in the server response and rendered it as the player fallback instead of Player name unavailable.",
      "Added Account Viewer support for puuid query parameters, including PUUID validation, server-side account resolution, memory caching, durable profile snapshot reuse, and canonical Riot ID URL replacement after loading.",
      "Updated Account Viewer searches to upsert successful PUUID-to-Riot-ID conversions into the service-only token player-name cache, while leaderboard reads reuse cached conversions without issuing automatic per-player lookups.",
      "Preserved Riot ID links when available and routed unresolved PUUID rows to the same Account Viewer page in a new tab."
    ],
    "impact": [
      "All stored leaderboard entries remain identifiable and clickable during development-key operation even when Riot ID enrichment is incomplete.",
      "Leaderboard page loads avoid spending Riot API calls on bulk name hydration; names become available after Account Viewer searches and are reused across tokens and regions.",
      "PUUID lookup remains server-only and API telemetry continues to record aggregate route metrics without query values or identifiers."
    ],
    "files": [
      "components/riot-token-leaderboards.tsx",
      "components/riot-account-viewer.tsx",
      "lib/riot-token-leaderboards.ts",
      "lib/riot-account-viewer.ts",
      "app/api/riot-account/viewer/route.ts",
      "lib/staff-changelog.ts"
    ],
    "verification": [
      "npm run typecheck passed after adding PUUID response fields, Account Viewer lookup support, and cached-name-only leaderboard hydration.",
      "npm run check passed: lint completed with only existing unrelated img-element warnings, typecheck passed, and 35 Vitest files with 165 tests passed; no production build was run."
    ]
  },
  {
    "id": "patch-2026-10-05-token-group-filters",
    "patch": "2026.10.05-token-group-filters",
    "timestamp": "2026-10-05T18:29:44.050Z",
    "title": "Added multi-select token group filters",
    "summary": "The Token Leaderboards index now has selectable group tabs, combines group filtering with token search, and places 2022 and 2023 historical groups after the current groups.",
    "details": [
      "Added an accessible multi-select button-tab row with an All reset control; selected groups filter the grouped token sections while token text search remains active at the same time.",
      "Added deterministic group ordering that keeps groups whose names contain 2022 or 2023 at the bottom of both the filter row and rendered catalogue.",
      "Kept the existing compact token card focus treatment, hover/click sounds, subgroup headings, and responsive two-column card layout unchanged."
    ],
    "impact": [
      "Visitors can focus the token catalogue on one or several challenge groups without losing the existing token search behavior.",
      "Historical 2022 and 2023 token groups no longer displace current groups at the top of the page."
    ],
    "files": [
      "components/riot-token-leaderboards.tsx",
      "lib/staff-changelog.ts"
    ],
    "verification": [
      "The standard npm run check was rerun after the group filter change: lint completed with only existing unrelated img-element warnings, typecheck passed, and 35 Vitest files with 165 tests passed."
    ]
  },
  {
    "id": "patch-2026-10-05-token-leaderboard-all-region-polish",
    "patch": "2026.10.05-token-leaderboard-all-region-polish",
    "timestamp": "2026-10-05T22:35:00.000Z",
    "title": "Expanded token leaderboard aggregation and presentation",
    "summary": "Token Leaderboards now support cached All-region aggregation, grouped token discovery, staged player-name hydration, richer rank presentation, resilient region switching, and the requested navigation and interaction polish.",
    "details": [
      "Added an All tab that combines the highest cached token score for each player across available regional daily pulls, keeps the winning region on each entry for account-viewer navigation, and seeds the combined view from the NA cache when no regional pull exists yet.",
      "Added group and subgroup metadata derived from the Riot Challenges configuration hierarchy, and grouped the token catalogue under searchable category headings.",
      "Changed the movement column to Change, right-aligned its header, uses an equal sign for no movement, adds distinct visual treatment for ranks 1 through 5, and shows relative Last refreshed text.",
      "Made leaderboard player links open the Account Viewer in a new tab, added All-region search handling, and added hover/click UI sounds to token and region controls.",
      "Validated leaderboard JSON before rendering so a 202 generation response or malformed region response cannot crash on data.entries.length.",
      "Limited Riot account-name resolution to staged batches of 20 per regional request while reusing the Supabase name cache, preventing the first batch of lookups from exhausting the Riot request budget and leaving the rest unresolved."
    ],
    "impact": [
      "Visitors can compare cached leaderboard data across regions without triggering a new Riot leaderboard request for every region, while the daily shared refresh policy remains unchanged.",
      "The token catalogue is easier to scan on desktop and mobile, and top-five placement is visually distinguishable without changing rank or score data.",
      "Unresolved player names are surfaced honestly and can fill progressively on later loads instead of silently presenting a permanently incomplete list."
    ],
    "files": [
      "components/riot-token-leaderboards.tsx",
      "lib/riot-token-leaderboards.ts",
      "app/api/riot-account/token-leaderboards/route.ts",
      "lib/staff-changelog.ts"
    ],
    "verification": [
      "npm run typecheck passed after the All-region, response-validation, UI, and name-hydration changes.",
      "Existing hover and selection sound identifiers were confirmed in the shared UI sound usage patterns.",
      "The earlier cache reconciliation deployment was verified with service queries and refresh-claim smoke testing; npm run check passed after this patch with only the repository's existing unrelated img-element lint warnings."
    ]
  },
  {
    "id": "patch-2026-10-05-token-leaderboard-cache-repair",
    "patch": "2026.10.05-token-leaderboard-cache-repair",
    "timestamp": "2026-10-05T22:00:00.000Z",
    "title": "Repaired token leaderboard cache deployment and index controls",
    "summary": "Token Leaderboards now have more compact searchable cards with the shared games-page arrow animation, and a reconciliation migration repairs cache objects missing from PostgREST schema metadata.",
    "details": [
      "Reduced token card height and padding, kept keyboard focus rings inset within the card boundary, and applied the existing game-card-arrow drift animation to token navigation arrows.",
      "Added a token search field that filters names and descriptions before rendering the responsive two-column card grid.",
      "Added a safe reconciliation migration that reasserts token leaderboard cache tables, indexes, RLS, service-role grants, refresh-claim RPC, and the PostgREST schema reload notification."
    ],
    "impact": [
      "Visitors can scan and filter the token catalog more efficiently, with focus and hover states remaining visually contained on compact cards.",
      "The token leaderboard API can use the cache tables even when the original migration history was recorded but the remote schema cache did not expose those tables.",
      "Token cache tables remain inaccessible to anon and authenticated roles; only the server service role retains access."
    ],
    "files": [
      "components/riot-token-leaderboards.tsx",
      "supabase/migrations/141_reconcile_riot_token_leaderboard_cache.sql",
      "lib/staff-changelog.ts"
    ],
    "verification": [
      "Read-only service queries reproduced PostgREST PGRST205 for all three token leaderboard cache tables before the reconciliation migration.",
      "The linked development Supabase project was missing migrations 138 through 141; all four pending migrations were applied, and read-only service queries confirmed all three cache tables are visible with no PostgREST errors.",
      "The CLI link was restored to the production Supabase project after deployment; the refresh-claim RPC smoke test and npm run check both passed, with only existing unrelated img-element lint warnings."
    ]
  },
  {
    "id": "patch-2026-10-01-riot-token-leaderboards",
    "patch": "2026.10.01-riot-token-leaderboards",
    "timestamp": "2026-10-01T22:08:26.000Z",
    "title": "Added Riot token leaderboards",
    "summary": "League Tools now includes daily-cached League Challenges token leaderboards with region selection, account search, player links, and rank movement.",
    "details": [
      "Added Riot Challenges config and leaderboard integration for leaderboard-enabled tokens, with lazy per-token and per-platform generation capped at 250 players.",
      "Added a service-only Supabase cache with a shared 5pm America/New_York generation key, a cross-instance claim guard, player-name cache, and prior-generation rows for movement comparisons.",
      "Added token index and detail pages, compact platform controls, Riot ID search, clickable account-viewer links, token icons, and daily refresh messaging to both responsive League Tools navigation surfaces."
    ],
    "impact": [
      "Visitors can browse available token challenges, inspect the top 250 players for a selected platform, search for a Riot ID, and open a player directly in the League Account Viewer.",
      "Riot leaderboard and player-name calls are deduplicated per token/platform generation day and sensitive Riot API credentials remain server-only.",
      "Rank movement is shown only when the player appeared in the prior stored generation; first-generation rows have no movement baseline."
    ],
    "files": [
      "app/riot-account-viewer/token-leaderboards/page.tsx",
      "app/riot-account-viewer/token-leaderboards/[tokenId]/page.tsx",
      "app/api/riot-account/token-leaderboards/route.ts",
      "components/riot-token-leaderboards.tsx",
      "lib/riot-token-leaderboards.ts",
      "lib/riot-account-viewer.ts",
      "components/app-header.tsx",
      "components/app-navigation-drawer.tsx",
      "app/sitemap.ts",
      "tests/riot-token-leaderboards.test.ts",
      "supabase/migrations/140_riot_token_leaderboards.sql",
      "lib/staff-changelog.ts"
    ],
    "verification": [
      "Added focused unit coverage for Eastern-time generation keys and rank movement in tests/riot-token-leaderboards.test.ts.",
      "npm run check was run after implementation; no production build was run because repository guidance reserves it for an explicitly stopped dev-server state.",
      "The Supabase migration was created locally and was not pushed."
    ]
  },
  {
    "id": "patch-2026-09-25-community-tier-filter-copy",
    "patch": "2026.09.25-community-tier-filter-copy",
    "timestamp": "2026-09-25T18:00:00.000Z",
    "title": "Added community card copying and multi-tier filtering",
    "summary": "Community augment cards now expose a one-click copy action, and the community feed can be filtered by one or more voted tiers.",
    "details": [
      "Added a compact copy icon beside each creator name that exports the rendered augment card as a PNG and shows a temporary check state.",
      "Added a persistent multi-select tier filter for Unrated, D, C, B, A, and S; selecting All clears the tier constraint.",
      "Passed validated tier filters through the API and added an additive server-side feed RPC migration so filtering remains correct across pagination."
    ],
    "impact": [
      "Community visitors can quickly reuse card artwork and narrow the feed to the tiers they want to review.",
      "Tier filtering remains tied to aggregate ratings and does not expose voter identities or request data."
    ],
    "files": [
      "components/augment-community.tsx",
      "components/augment-shared.tsx",
      "lib/augment-builder.ts",
      "lib/augment-builder-server.ts",
      "app/api/augments/route.ts",
      "supabase/migrations/139_augment_community_tier_filter.sql",
      "tests/augment-api.test.ts",
      "lib/staff-changelog.ts"
    ],
    "verification": [
      "npm run check passed: lint completed with only existing no-img warnings, typecheck passed, and 34 Vitest files (163 tests) passed.",
      "The new API tests cover valid multi-tier forwarding and invalid tier rejection.",
      "The migration is additive and leaves the existing four-argument unfiltered community feed available.",
      "npx supabase db push applied migration 139 to the linked project; SQL verification found both the legacy and tier-aware community feed RPC overloads."
    ]
  },
  {
    "id": "patch-2026-09-23-augment-schema-repair",
    "patch": "2026.09.23-augment-schema-repair",
    "timestamp": "2026-09-23T20:25:00.000Z",
    "title": "Added an idempotent augment schema repair migration",
    "summary": "Added migration 138 to recreate missing augment tables, indexes, grants, and rating/feed RPCs when migration history is ahead of the actual database schema.",
    "details": [
      "The repair uses create-if-missing and replace-safe definitions, preserves existing augment rows, and reapplies service-role-only access and RLS settings.",
      "The repair restores both community augment RPCs and official augment rating tables/RPCs, followed by a PostgREST schema reload notification.",
      "The readiness endpoint now reports the augment dependency separately so a stale migration ledger is visible."
    ],
    "impact": [
      "Production and preview databases with missing augment objects can be repaired through the next append-only migration without rewriting prior migration history."
    ],
    "files": [
      "supabase/migrations/138_repair_augment_schema.sql",
      "app/api/health/ready/route.ts",
      "lib/staff-changelog.ts"
    ],
    "verification": [
      "Migration SQL was reviewed for additive, idempotent table/function creation and service-role-only grants.",
      "npm run check passed: lint completed with only existing no-img warnings, typecheck passed, and 34 Vitest files (161 tests) passed; git diff --check passed.",
      "npx supabase db push applied migration 138 to the linked production project; SQL verification found custom_augments, custom_augment_community_feed, custom_augment_ratings, and official_augment_ratings."
    ]
  },
  {
    "id": "patch-2026-09-23-augment-readiness-probe",
    "patch": "2026.09.23-augment-readiness-probe",
    "timestamp": "2026-09-23T20:10:00.000Z",
    "title": "Added augment dependency readiness probes",
    "summary": "The readiness endpoint now verifies the community feed and ratings RPCs in addition to the base Supabase connection.",
    "details": [
      "Added bounded newest-feed and empty-ratings RPC probes using the existing service-role client.",
      "Added an augments check that reports schema or function rollout failures without exposing provider details.",
      "Kept the existing configuration, Supabase, and shared-rate-limit checks unchanged."
    ],
    "impact": [
      "Preview and production operators can identify an incomplete augment migration rollout before users encounter the community feed error."
    ],
    "files": [
      "app/api/health/ready/route.ts",
      "lib/staff-changelog.ts"
    ],
    "verification": [
      "The local readiness probe was verified with the configured Supabase project after the augment checks were added.",
      "npm run check passed: lint completed with only existing no-img warnings, typecheck passed, and 34 Vitest files (161 tests) passed; git diff --check passed."
    ]
  },
  {
    "id": "patch-2026-09-23-augment-dependency-errors",
    "patch": "2026.09.23-augment-dependency-errors",
    "timestamp": "2026-09-23T19:35:00.000Z",
    "title": "Classified missing augment deployment dependencies",
    "summary": "Augment API requests now identify missing Supabase configuration or unapplied PostgREST objects as temporary dependency unavailability instead of generic application failures.",
    "details": [
      "Mapped missing required environment variables to a safe 503 response without naming the missing secret.",
      "Mapped PostgREST missing-function and missing-table rollout codes to the same safe 503 response while retaining request IDs and internal logging behavior.",
      "Added regression coverage for both environment and schema rollout failures."
    ],
    "impact": [
      "Preview and production operators can distinguish an unavailable deployment dependency from an application crash without exposing database or secret details."
    ],
    "files": [
      "lib/api-utils.ts",
      "tests/api-utils.test.ts",
      "lib/staff-changelog.ts"
    ],
    "verification": [
      "The new API utility regression tests cover missing Supabase environment configuration and missing augment RPC responses.",
      "npm run check passed: lint completed with only existing no-img warnings, typecheck passed, and 34 Vitest files (161 tests) passed; git diff --check passed."
    ]
  },
  {
    "id": "patch-2026-09-23-augment-api-node-runtime",
    "patch": "2026.09.23-augment-api-node-runtime",
    "timestamp": "2026-09-23T19:11:29.000Z",
    "title": "Pinned augment APIs to the Node.js runtime",
    "summary": "Made all Supabase-backed augment API routes explicit Node.js routes for consistent Vercel preview and production execution.",
    "details": [
      "Added runtime declarations to community feed, augment detail, binder, and official rating endpoints.",
      "Kept the route handlers and database access unchanged while removing runtime ambiguity during deployment."
    ],
    "impact": [
      "Augment builder API requests use the same supported runtime in development, preview, and production."
    ],
    "files": [
      "app/api/augments/route.ts",
      "app/api/augments/[id]/route.ts",
      "app/api/augment-binders/[owner]/route.ts",
      "app/api/official-augments/route.ts",
      "app/api/official-augments/[id]/route.ts",
      "lib/staff-changelog.ts"
    ],
    "verification": [
      "The local /api/augments?sort=newest&page=0 request returned HTTP 200 after the runtime declarations were added.",
      "npm run check passed: lint completed with only existing no-img warnings, typecheck passed, and 34 Vitest files (160 tests) passed.",
      "git diff --check passed; Git reported only existing LF-to-CRLF normalization warnings."
    ]
  },
  {
    "id": "patch-2026-09-23-official-augment-short-descriptions",
    "patch": "2026.09.23-official-augment-short-descriptions",
    "timestamp": "2026-09-23T01:42:18.000Z",
    "title": "Curated official augment short descriptions",
    "summary": "Replaced tokenized official augment summaries with a complete curated short-description catalogue and restored detail-view controls.",
    "details": [
      "Added a static 224-name short-description map based on the linked ARAM Mayhem augment list and explicit cleanup for context-dependent records.",
      "Replaced broken placeholders such as TooltipCDR%, QAbilityHaste, spell*KeyBind, %i values, and unresolved question marks in the official catalogue.",
      "Updated the official catalogue generator to preserve the curated descriptions on future catalogue generation.",
      "Added plus icons to Create Augment actions and restored full-width tier rating controls in community and official detail views."
    ],
    "impact": [
      "Official augment cards and detail views now show stable readable short effects without internal data tokens.",
      "Users regain the intended visual affordance for creating an augment and selecting a tier."
    ],
    "files": [
      "data/catalogs/official-augment-short-descriptions.json",
      "data/catalogs/official-augments.json",
      "scripts/generate-official-augment-catalog.mjs",
      "components/augment-view.tsx",
      "components/augment-official-view.tsx",
      "lib/staff-changelog.ts"
    ],
    "verification": [
      "Curated map contains 224 descriptions matching the 224-record official catalogue; token and punctuation checks pass.",
      "npm run check passed: lint completed with only existing no-img warnings, typecheck passed, and 34 Vitest files (160 tests) passed.",
      "git diff --check passed; Git reported only existing LF-to-CRLF normalization warnings."
    ]
  },
  {
    "id": "patch-2026-09-22-image-policy-and-shared-navigation",
    "patch": "2026.09.22-image-policy-and-shared-navigation",
    "timestamp": "2026-09-22T21:00:00.000Z",
    "title": "Audited image delivery and shared navigation contracts",
    "summary": "Small immutable augment icons now use the shared direct-delivery image helper, and responsive navigation shares its game metadata and menu rendering.",
    "details": [
      "Replaced the augment builder icon picker's direct Next Image usage with GameIconImage, which enforces unoptimized delivery and avoids Vercel image transformation requests for local icon PNGs.",
      "Kept GameSplashImage on the existing responsive optimized path for large splash artwork; no global unoptimized override was introduced.",
      "Centralized navigation accent classes, game mode labels, and responsive game groupings in lib/app-navigation.ts so desktop headers and the alternate drawer use one source of truth.",
      "Extracted shared game-link and League Tools menu-item rendering in AppHeader so desktop and mobile menus cannot drift in labels, descriptions, or ordering."
    ],
    "impact": [
      "Augment icon requests remain direct source-asset requests without an image optimizer transformation or generated responsive source set.",
      "Navigation labels, ordering, and game visibility stay consistent across responsive header variants and the drawer."
    ],
    "files": [
      "components/augment-builder.tsx",
      "components/app-header.tsx",
      "components/app-navigation-drawer.tsx",
      "lib/app-navigation.ts",
      "lib/staff-changelog.ts"
    ],
    "verification": [
      "npm run check passed: lint completed with only existing no-img warnings, typecheck passed, and 34 Vitest files (160 tests) passed.",
      "git diff --check passed; Git reported only existing LF-to-CRLF normalization warnings."
    ]
  },
  {
    "id": "patch-2026-09-22-news-augment-builder-release",
    "patch": "2026.09.22-news-augment-builder-release",
    "timestamp": "2026-09-22T20:30:00.000Z",
    "title": "Published the Augment Builder 0.2.0 release entry",
    "summary": "Added the public 0.2.0 release announcement for the ARAM Mayhem Augment Builder to the News and Updates feed.",
    "details": [
      "Added Update 0.2.0 - Augment Builder Arrives! as the newest public release entry.",
      "Added the New Tool section with a concise description of custom augment creation, publishing, community browsing, ratings, and reactions.",
      "Extended the typed news section heading union to support New Tool while preserving existing news rendering and archive behavior."
    ],
    "impact": [
      "Visitors see the Augment Builder release announcement on the News and Updates screen and home news preview.",
      "The release entry is versioned as 0.2.0 and participates in the existing recent and archive date rules."
    ],
    "files": [
      "lib/news.ts",
      "lib/staff-changelog.ts"
    ],
    "verification": [
      "npm run check passed: lint completed with only existing no-img warnings, typecheck passed, and 34 Vitest files (160 tests) passed.",
      "git diff --check passed; Git reported only existing LF-to-CRLF normalization warnings."
    ]
  },
  {
    "id": "patch-2026-09-22-league-tools-navigation-export-labels",
    "patch": "2026.09.22-league-tools-navigation-export-labels",
    "timestamp": "2026-09-22T20:15:00.000Z",
    "title": "Renamed League Tools navigation and preserved export labels",
    "summary": "Responsive navigation now presents League Tools with the requested account and utility sections, while augment export success states keep their text labels visible.",
    "details": [
      "Renamed the large-screen and small-screen navigation trigger from League Account Viewer/LAV to League Tools without changing the account viewer route or page labels.",
      "Moved ARAM Mayhem Augments out of Games into the League Tools Misc Tools section, retained Randodraft in Games, and added Randodraft to Misc Tools with its requested description.",
      "Ordered League Tools as League Account Viewer items followed by Misc Tools, and renamed the disabled Auto-fill Linked Account item to Your Account.",
      "Changed augment image, PNG, link, and binder-link success states to replace only the icon with a temporary check while retaining the button text."
    ],
    "impact": [
      "Users can find account search, account utilities, ARAM augment tools, and Randodraft from a consistent League Tools menu on desktop and mobile navigation.",
      "Copy and download actions remain self-describing after completion instead of hiding their labels."
    ],
    "files": [
      "components/app-header.tsx",
      "components/app-navigation-drawer.tsx",
      "components/augment-shared.tsx",
      "components/augment-binder.tsx",
      "lib/staff-changelog.ts"
    ],
    "verification": [
      "npm run check passed: lint completed with only existing no-img warnings, typecheck passed, and 34 Vitest files (160 tests) passed.",
      "git diff --check passed; Git reported only existing LF-to-CRLF normalization warnings."
    ]
  },
  {
    "id": "patch-2026-09-22-augment-detail-and-official-copy",
    "patch": "2026.09.22-augment-detail-and-official-copy",
    "timestamp": "2026-09-22T19:00:00.000Z",
    "title": "Polished augment publishing and official previews",
    "summary": "Augment screens now preserve layout and drafts through authentication, provide account-aware voting and publish guidance, and render official cards from concise in-game tooltips with full descriptions available in detail views.",
    "details": [
      "Added custom KnowLeague account-required hover notes to community and official reaction and tier controls, and added a custom publish-only account hint while leaving anonymous builder fields editable.",
      "Changed image, PNG, and link exports to show a temporary check icon inside the completed action button without a separate success message.",
      "Changed the builder short-description limit to 200 characters, removed the counter helper copy, clears the fresh query after initializing a blank draft, and replaces the new publish route so To Community returns to the originating hub.",
      "Regenerated official records so matched CommunityDragon records use their in-game tooltip for the short card effect while the full League wiki description remains the detail source; removed official metadata panels and retained community ratings.",
      "Added stable loading shells and minimum heights across builder, community, official archive, detail, and binder screens, matched official search controls to the community filter layout, and aligned Create Augment actions with the shared green styling."
    ],
    "impact": [
      "Signed-out users receive clear feedback about account-only actions while retaining the ability to compose and preserve a draft.",
      "Users no longer see width jumps during augment loading and return to their prior hub filters after detail navigation.",
      "Official cards show concise in-game effects; opening a card still exposes the complete source description and community rating controls."
    ],
    "files": [
      "components/augment-builder.tsx",
      "components/augment-description-editor.tsx",
      "components/augment-shared.tsx",
      "components/header-hover-note.tsx",
      "components/augment-view.tsx",
      "app/augment-builder/augment/[id]/page.tsx",
      "components/augment-official-view.tsx",
      "components/augment-official-archive.tsx",
      "components/augment-community.tsx",
      "components/augment-binder.tsx",
      "lib/augment-builder.ts",
      "scripts/generate-official-augment-catalog.mjs",
      "data/catalogs/official-augments.json",
      "lib/staff-changelog.ts"
    ],
    "verification": [
      "npm run typecheck passed after the final JSX, generator, and builder changes.",
      "npm run data:generate:augment-archive passed and wrote 224 current official records.",
      "Official sample records were inspected to confirm short tooltip and long source-description separation."
    ]
  },
  {
    "id": "patch-2026-09-21-augment-hub-state-and-publishing-guard",
    "patch": "2026.09.21-augment-hub-state-and-publishing-guard",
    "timestamp": "2026-09-21T23:30:00.000Z",
    "title": "Preserved augment hub state and gated publishing",
    "summary": "Community and official catalogue views now restore their filters after detail navigation, while creation starts cleanly and anonymous drafts remain editable but cannot be published.",
    "details": [
      "Stored community tab, search, sort, page, and official search, rarity filter, and page state in the hub URL so the history-aware detail back control restores the exact catalogue view.",
      "Renamed the hub tabs and current-only official filter, removed record-count and current/rarity card chrome, and added official catalogue tier and reaction controls backed by batched aggregate ratings.",
      "Added an explicit fresh builder route that starts a blank silver augment, preserved local drafts through sign-in with the existing auth return-path helper, and allowed anonymous users to edit every field while disabling publish and edit submission until authenticated.",
      "Changed shared augment detail back controls to use browser history before falling back to their route, preserving the originating hub context.",
      "Excluded the fake 404 Augment Not Found silver asset from the generated icon catalogue, reviewed silver grouping metadata, and local PNG set.",
      "Added a server-side 401 guard in publishAugment so anonymous requests cannot insert unowned rows even if a client bypasses the disabled submit control."
    ],
    "impact": [
      "Users return to the same community or official catalogue context after viewing an augment.",
      "Anonymous users can design and save a draft locally but cannot create an account-owned publication without signing in.",
      "Signed-in users can see and react to official catalogue ratings directly from the card grid."
    ],
    "files": [
      "components/augment-community.tsx",
      "components/augment-official-archive.tsx",
      "components/augment-builder.tsx",
      "components/augment-binder.tsx",
      "components/augment-shared.tsx",
      "lib/augment-official-server.ts",
      "lib/augment-builder-server.ts",
      "app/api/official-augments/route.ts",
      "app/augment-builder/create/page.tsx",
      "lib/auth-redirect.ts",
      "scripts/generate-augment-catalog.mjs",
      "data/catalogs/augment-icons.json",
      "data/catalogs/augment-silver-icon-groups.json",
      "tests/augment-server.test.ts",
      "lib/staff-changelog.ts"
    ],
    "verification": [
      "npm run typecheck passed after the final component and API changes.",
      "Batched official ratings are limited to 24 catalogue IDs and the API route uses withApiMetrics with a static template and rate limit."
    ]
  },
{
    "id": "patch-2026-09-21-current-official-archive",
    "patch": "2026.09.21-current-official-archive",
    "timestamp": "2026-09-21T22:15:00.000Z",
    "title": "Removed historical official augments",
    "summary": "The official archive and generator now include current ARAM Mayhem augments only.",
    "details": [
      "Removed the Historical archive filter and labels from the official archive UI.",
      "Stopped the catalogue generator from emitting CommunityDragon-only historical records and regenerated the checked-in catalogue with 224 current records and zero historical records.",
      "Updated the archive documentation to state that historical augments are intentionally excluded."
    ],
    "impact": [
      "Users see only the current official augment pool in the archive.",
      "Future catalogue refreshes will not reintroduce historical records."
    ],
    "files": [
      "components/augment-official-archive.tsx",
      "scripts/generate-official-augment-catalog.mjs",
      "data/catalogs/official-augments.json",
      "docs/augment-builder.md",
      "lib/staff-changelog.ts"
    ],
    "verification": [
      "npm run data:generate:augment-archive passed and wrote 224 records.",
      "Generated catalogue check confirmed zero records with current=false."
    ]
  },
  {
    "id": "patch-2026-09-21-official-augment-ratings",
    "patch": "2026.09.21-official-augment-ratings",
    "timestamp": "2026-09-21T21:15:00.000Z",
    "title": "Added community ratings for official augments",
    "summary": "Official augment details now show community upvotes, downvotes, and tier voting, while static official metadata is limited to rarity and status.",
    "details": [
      "Removed official tier and archive version fields from the official details panel.",
      "Added optimistic like/dislike controls and D-through-S tier voting to official detail pages, using the same background-save and rollback behavior as community augment pages.",
      "Added official_augment_reactions and official_augment_tiers tables with RLS, service-role access, and an aggregate ratings function. Official catalogue IDs remain checked-in reference records rather than publication rows."
    ],
    "impact": [
      "Signed-in users can rate current and historical official augments without leaving the archive detail view.",
      "Official detail pages display live aggregate community ratings while preserving the official catalogue as a deterministic local dataset."
    ],
    "files": [
      "components/augment-official-view.tsx",
      "lib/augment-official.ts",
      "lib/augment-official-server.ts",
      "app/api/official-augments/[id]/route.ts",
      "supabase/migrations/137_official_augment_ratings.sql",
      "docs/augment-builder.md",
      "lib/staff-changelog.ts"
    ],
    "verification": [
      "The official ratings API uses withApiMetrics with a static route template and bounded rate limits.",
      "npm run check passed after implementation."
    ]
  },
  {
    "id": "patch-2026-09-21-official-augment-detail-view",
    "patch": "2026.09.21-official-augment-detail-view",
    "timestamp": "2026-09-21T20:37:09.4734122Z",
    "title": "Added clickable official augment detail views",
    "summary": "Official archive cards now show concise in-game effects, keep only the augment name beneath the card, and open a full official detail page.",
    "details": [
      "Added curated concise in-game preview summaries for Porcupine, Pressure Cooker, Pursuit of Haste, Pursuit of Power, Spiritual Purification, and Get Excited while retaining full source descriptions for detail pages. Generic fallback previews now cap at 280 visible characters.",
      "Made every official archive card a whole-card link to a stable official augment route. The detail page includes the rendered card, export controls, rarity, official tier, current or historical status, archive version count, and the full description.",
      "Removed the archive card footer source and artwork notices so the card ends with the official augment name. Official catalogue entries continue to use checked-in data and do not claim community reactions that are not stored for reference records."
    ],
    "impact": [
      "Official previews match the shorter in-game presentation shown in ARAM Mayhem while long mechanics remain available on demand.",
      "Users can inspect official augment metadata and full effects without leaving the augment community experience."
    ],
    "files": [
      "components/augment-official-archive.tsx",
      "components/augment-official-view.tsx",
      "app/augment-builder/official/[id]/page.tsx",
      "lib/augment-official.ts",
      "scripts/generate-official-augment-catalog.mjs",
      "data/catalogs/official-augments.json",
      "docs/augment-builder.md",
      "lib/staff-changelog.ts"
    ],
    "verification": [
      "npm run data:generate:augment-archive passed and wrote 1045 official augment records.",
      "node --check scripts/generate-official-augment-catalog.mjs passed."
    ]
  },
  {
    "id": "patch-2026-09-21-augment-preview-polish",
    "patch": "2026.09.21-augment-preview-polish",
    "timestamp": "2026-09-21T19:26:56.4440983Z",
    "title": "Polished augment reactions and official previews",
    "summary": "Augment cards now use compact reaction controls without helper copy, while official archive previews use short in-game effects with safe League stat formatting.",
    "details": [
      "Moved visible reaction counts into the like and dislike buttons, removed sign-in reaction helper text, and disabled text selection across community, binder, official, and public card surfaces.",
      "Removed the League wiki source note from official archive cards and switched their canvas descriptions to compact CommunityDragon in-game effects. Numeric tooltip values and known localization artifacts are cleaned from pinned data, long fallbacks are capped to a readable preview, and League stat markup is translated into the existing safe color and inline-icon grammar.",
      "Extended the official catalogue integrity test and maintainer documentation to cover the required short preview descriptions and formatting behavior."
    ],
    "impact": [
      "Preview cards are easier to scan and react to without extra labels or accidental text highlighting.",
      "Official current and historical augments now stay readable in the same visual language as custom cards even when their wiki descriptions are lengthy.",
      "The archive remains a checked-in, deterministic dataset and never fetches source content at runtime."
    ],
    "files": [
      "components/augment-view.tsx",
      "components/augment-community.tsx",
      "components/augment-card.tsx",
      "components/augment-binder.tsx",
      "components/augment-official-archive.tsx",
      "data/catalogs/official-augments.json",
      "scripts/generate-official-augment-catalog.mjs",
      "tests/augment-icons.test.ts",
      "docs/augment-builder.md",
      "lib/staff-changelog.ts"
    ],
    "verification": [
      "npm run data:generate:augment-archive passed and wrote 1045 records.",
      "node --check scripts/generate-official-augment-catalog.mjs passed.",
      "npm run check passed: lint with existing unrelated image warnings, TypeScript, and all 160 tests across 34 files. git diff --check passed."
    ]
  },
  {
    "id": "patch-2026-09-18-augment-archive-interactions",
    "patch": "2026.09.18-augment-archive-interactions",
    "timestamp": "2026-09-18T20:49:54.3522900Z",
    "title": "Added official augment archive and unified card interactions",
    "summary": "Augment previews now keep reactions at the card edge, use whole-card focus targets, and expose a separate current and historical official archive.",
    "details": [
      "Moved public preview upvote and downvote controls beneath the card and aligned them to its lower-right edge; tier voting remains in the community verdict panel.",
      "Made community cards single whole-card links with keyboard focus on the outer item and stopped reaction buttons from triggering navigation. Binder cards retain their whole-item focus target.",
      "Added To Community navigation to the creation and edit screens and replaced successful link-copy text feedback with a temporary check icon in the public view and binder buttons.",
      "Added an Official & archive tab backed by 224 current wiki records and 821 historical CommunityDragon records. The checked-in catalogue stores names, effects, rarity, artwork matches, source, and pinned source versions without runtime network access; the archive chunk is lazy-loaded so the community feed stays lightweight."
    ],
    "impact": [
      "Community and binder browsing has one clear clickable and focusable card surface, while reaction controls remain independently usable.",
      "Users can browse official and retired augment information separately from account-created community content and filter the archive by name, status, or rarity.",
      "The archive can be refreshed intentionally with the data:generate:augment-archive command; normal page loads remain local and deterministic."
    ],
    "files": [
      "components/augment-view.tsx",
      "components/augment-community.tsx",
      "components/augment-official-archive.tsx",
      "components/augment-binder.tsx",
      "components/augment-builder.tsx",
      "components/augment-shared.tsx",
      "data/catalogs/official-augments.json",
      "scripts/generate-official-augment-catalog.mjs",
      "package.json",
      "tests/augment-icons.test.ts",
      "docs/augment-builder.md",
      "lib/staff-changelog.ts"
    ],
    "verification": [
      "npm run check passed: lint with existing unrelated image warnings, TypeScript, and all 160 tests across 34 files. git diff --check passed."
    ]
  },
  {
    "id": "patch-2026-09-18-augment-community-reactions",
    "patch": "2026.09.18-augment-community-reactions",
    "timestamp": "2026-09-18T20:17:05.4321133Z",
    "title": "Added cached community reactions and augment templates",
    "summary": "Community cards now support responsive reactions and cached public views, while augment pages can seed a fresh builder draft from an existing card.",
    "details": [
      "Renamed My Binder actions to My Augments and added direct To Community controls on public augment and binder screens.",
      "Added optimistic like/dislike controls to community cards and background tier and reaction voting on augment pages, with queued requests, server reconciliation, and rollback on failure.",
      "Added a session-scoped augment view cache shared by the community feed, public view, and template flow so feed data is reused without a duplicate load.",
      "Replaced the public view Build your own augment action with Use augment as template, which opens a new builder draft populated from the selected augment while assigning a fresh ID. Removed the average tier denominator display."
    ],
    "impact": [
      "Signed-in users can react directly from the community grid and continue browsing while votes save in the background; guest controls remain sign-in gated.",
      "Opening an augment from the community feed is immediate after the feed response, and template drafts do not mutate the source augment or its votes.",
      "The hub, binder, public view, and editor retain their existing account ownership and public visibility rules."
    ],
    "files": [
      "components/augment-community.tsx",
      "components/augment-view.tsx",
      "components/augment-builder.tsx",
      "components/augment-binder.tsx",
      "components/augment-shared.tsx",
      "app/augment-builder/create/page.tsx",
      "docs/augment-builder.md",
      "lib/staff-changelog.ts"
    ],
    "verification": [
      "npm run check passed: lint with existing unrelated image warnings, TypeScript, and all 159 tests across 34 files. git diff --check passed."
    ]
  },
  {
    "id": "patch-2026-09-18-augment-community-hub",
    "patch": "2026.09.18-augment-community-hub",
    "timestamp": "2026-09-18T18:12:35.201Z",
    "title": "Added the ARAM Mayhem augment community hub",
    "summary": "The ARAM Mayhem game route now opens an account-only community feed with search, popularity sorting, creation actions, and owner editing.",
    "details": [
      "Changed /augment-builder from the editor landing page into a paginated community hub. It supports Newest, Top week, month, year, and all-time sorting, name search, account-only cards, creator chat colors, tier labels, upvote counts, loading states, and responsive grid actions.",
      "Moved the editor to /augment-builder/create, renamed its publish action to Publish Augment, and added an owner-checked PATCH path with an Edit Augment action on owned public cards.",
      "Added a bounded custom_augment_community_feed RPC migration that filters account-owned cards, applies search and time windows, and ranks popularity without exposing voter identities. Shared augment back controls now follow browser history with a safe fallback.",
      "Updated navigation metadata, sitemap coverage, documentation, and binder/create links for the hub and editor split."
    ],
    "impact": [
      "Users reach a browsable community surface when opening ARAM Mayhem from navigation or the games screen, while the builder remains available through Create Augment.",
      "Account owners can correct their own published cards without changing their IDs or losing community votes; guests remain excluded from the account community feed.",
      "Existing direct augment links, binders, reactions, tier votes, exports, and delete ownership checks remain compatible."
    ],
    "files": [
      "components/augment-community.tsx",
      "components/augment-builder.tsx",
      "components/augment-view.tsx",
      "components/augment-binder.tsx",
      "components/augment-shared.tsx",
      "lib/augment-builder.ts",
      "lib/augment-builder-server.ts",
      "app/augment-builder/page.tsx",
      "app/augment-builder/create/page.tsx",
      "app/api/augments/route.ts",
      "app/api/augments/[id]/route.ts",
      "supabase/migrations/136_augment_community_feed.sql",
      "app/sitemap.ts",
      "lib/game-navigation.ts",
      "docs/augment-builder.md",
      "docs/architecture.md",
      "tests/augment-api.test.ts",
      "lib/staff-changelog.ts"
    ],
    "verification": [
      "npm run check passed: lint with existing unrelated image warnings, TypeScript, and all 159 tests across 34 files. Chrome verified the mocked account-only hub feed, creator card metadata, all five sort options, name-search request parameters, Create Augment and My Binder actions, editor Publish Augment label, 390px mobile width, and no page errors. The database migration was created locally and was not pushed. git diff --check passed."
    ]
  },
  {
    "id": "patch-2026-09-17-augment-responsive-export-buttons",
    "patch": "2026.09.17-augment-responsive-export-buttons",
    "timestamp": "2026-09-18T04:46:31.239Z",
    "title": "Made augment export controls responsive",
    "summary": "Export buttons now stack at full width on small screens and share two equal columns on larger screens.",
    "details": [
      "Updated compact augment export controls to use a responsive one-column/two-column grid while keeping each control full width within its grid cell.",
      "Preserved the preview footer note above the controls while leaving the full-size public export layout unchanged.",
      "No image generation, clipboard, download, routing or saved augment behavior changed."
    ],
    "impact": [
      "Mobile preview controls are easier to tap without crowding, while larger previews use the available width efficiently.",
      "Export actions remain available with the same labels and behavior in both builder and public augment views."
    ],
    "files": [
      "components/augment-shared.tsx",
      "lib/staff-changelog.ts"
    ],
    "verification": [
      "npm run check passed: lint with existing unrelated image warnings, TypeScript, and all 157 tests across 34 files. Chrome verified full-width stacked compact export buttons at 390px, equal same-row columns at 1024px, no overflow, and no page errors. git diff --check passed."
    ]
  },
  {
  "id": "patch-2026-09-17-augment-copy-and-preview-layout",
  "patch": "2026.09.17-augment-copy-and-preview-layout",
  "timestamp": "2026-09-18T03:36:44.931Z",
  "title": "Simplified augment builder and binder copy",
  "summary": "Removed redundant ARAM Mayhem helper copy and stacked the preview sharing note above aligned export controls.",
  "details": [
    "Removed the visible ARAM Mayhem header label, binder subtitle, and public augment-view subtitle while leaving route metadata intact.",
    "Removed the Description tab?s Write the effect heading and explanatory helper sentence so controls begin immediately.",
    "Placed the preview sharing note in its own full-width block above the export controls; the copy and download buttons remain a single aligned row and narrow screens stay within the viewport."
  ],
  "impact": [
    "The builder, binder and public augment view have a cleaner, less repetitive presentation.",
    "No saved data, rendering formats, API behavior or navigation routes changed."
  ],
  "files": [
    "components/augment-shared.tsx",
    "components/augment-binder.tsx",
    "components/augment-view.tsx",
    "components/augment-description-editor.tsx",
    "components/augment-builder.tsx",
    "lib/staff-changelog.ts"
  ],
  "verification": [
    "npm run check passed: lint with existing unrelated image warnings, TypeScript, and all 157 tests across 34 files. Chrome verified the removed ARAM Mayhem/header/subtitle copy, removed description intro, the full-width preview note above same-row export buttons, mobile width and no page errors. git diff --check passed."
  ]
},
  {
  "id": "patch-2026-09-17-augment-binder-and-hover-refinements",
  "patch": "2026.09.17-augment-binder-and-hover-refinements",
  "timestamp": "2026-09-18T02:46:43.598Z",
  "title": "Refined augment hover controls, binder caching, and card links",
  "summary": "Added custom control notes, spinner-backed binder caching, fresh post-publish drafts, and full-card binder navigation.",
  "details": [
    "Description color and icon controls now use the shared custom hover-note component. Optional-detail notes are scoped to their info icons and their buttons no longer show a click border.",
    "Binder pages display an animated loading indicator, retain loaded page data in a keyed client cache, deduplicate requests, and expose explicit invalidation for create/edit/delete flows. Publishing invalidates the creator binder cache.",
    "Published designs reset the builder to a new blank silver draft after successful creation. The preview sharing note and compact export controls are aligned horizontally below the card.",
    "Binder previews remove per-card delete controls, use each entire card as the link target, apply hover/focus treatment to the full item, and anchor names and community counts in a consistent bottom block."
  ],
  "impact": [
    "Editors get clearer hover guidance and start fresh after publishing. Binder navigation avoids redundant requests while still supporting explicit invalidation.",
    "Existing public augment data, icon metadata and API contracts remain unchanged."
  ],
  "files": [
    "components/augment-description-editor.tsx",
    "components/augment-extra-details.tsx",
    "components/augment-shared.tsx",
    "components/augment-builder.tsx",
    "components/augment-binder.tsx",
    "docs/augment-builder.md",
    "lib/staff-changelog.ts"
  ],
  "verification": [
    "npm run check passed: lint with existing unrelated image warnings, TypeScript, and all 157 tests across 34 files. Chrome verified custom toolbar notes, info-icon-only tooltips without click borders, binder spinner and cached empty state, whole-card navigation, preview-row alignment, mobile width, and no page errors. Typecheck also passed after request-race hardening. git diff --check passed."
  ]
},
  {
  "id": "patch-2026-09-17-augment-description-controls",
  "patch": "2026.09.17-augment-description-controls",
  "timestamp": "2026-09-18T02:05:32.458Z",
  "title": "Refined augment description controls and inline rendering",
  "summary": "Separated text colors from icons, expanded official symbols, and aligned inline artwork with card text.",
  "details": [
    "Split colors and symbols into labeled toolbars using the shared button hover treatment. Formatting preserves selected text or inserts empty tags with the caret inside instead of adding example labels.",
    "Expanded the inline icon allowlist from 10 to 20 with official ranged, melee, level, attack speed, mana, critical strike, attack range, tenacity, life steal and magic penetration sprites. All use the existing local atlas; generator mappings preserve them.",
    "Centered text and inline sprites on a common line axis in the shared preview/PNG renderer. Renamed the creation action to Create Augment, reused ToggleSwitch for optional fields, and increased wide help-note text to 14px.",
    "Kept 404 Augment Not Found after verifying the Augment404 entry in the pinned CommunityDragon game data; it is an actual silver entry granting three hats."
  ],
  "impact": [
    "Creators get clearer formatting controls and more icon variety without extra sprite-image downloads.",
    "Existing markup, saved drafts, publishing behavior and augment PNG assets remain compatible. The 420 augment PNG files total 7,268,282 bytes."
  ],
  "files": [
    "components/augment-description-editor.tsx",
    "components/augment-extra-details.tsx",
    "components/header-hover-note.tsx",
    "components/augment-builder.tsx",
    "lib/augment-builder.ts",
    "lib/augment-card-renderer.ts",
    "data/catalogs/augment-stat-icons.json",
    "scripts/generate-augment-catalog.mjs",
    "tests/augment-builder.test.ts",
    "docs/augment-builder.md",
    "lib/staff-changelog.ts"
  ],
  "verification": [
    "npm run check passed: lint with existing unrelated image warnings, TypeScript, and all 157 tests across 34 files. Chrome verified separate color/icon rows, empty color tags with caret placement, selected-text formatting, 20 icon controls, matching hover borders, shared toggles, larger help notes, Create Augment labeling, aligned card text/icons, desktop/mobile overflow and no page errors. Confirmed the 404 entry is official Augment404 data in CommunityDragon. The 420 local PNGs total 7,268,282 bytes. git diff --check passed."
  ]
},
  {
  "id": "patch-2026-09-17-prismatic-icon-names",
  "patch": "2026.09.17-prismatic-icon-names",
  "timestamp": "2026-09-18T01:42:22.177Z",
  "title": "Reviewed prismatic augment icon names and artwork groups",
  "summary": "Corrected labels and grouped all 124 prismatic icons by central artwork.",
  "details": [
    "Fixed joined words, missing punctuation and export suffixes across all four prismatic pages, preserving previous names in search terms.",
    "Added reviewed prismatic artwork families so shared glyphs appear together regardless of augment name; historical designs follow their artwork instead of being paired solely by name.",
    "Integrated prismatic curation into catalogue enrichment and generation with a local-only reapplication command, completing the reviewed metadata for all three rarities."
  ],
  "impact": [
    "Creators can browse readable prismatic names and related artwork together.",
    "Silver and gold metadata, PNG assets, aliases and saved icon IDs remain unchanged. No database changes are required."
  ],
  "files": [
    "data/catalogs/augment-prismatic-icon-groups.json",
    "data/catalogs/augment-icons.json",
    "scripts/curate-prismatic-augment-icons.mjs",
    "scripts/enrich-augment-icons.mjs",
    "tests/augment-icons.test.ts",
    "docs/augment-builder.md",
    "lib/staff-changelog.ts"
  ],
  "verification": [
    "npm run check passed: lint with existing unrelated image warnings, TypeScript, and all 156 tests across 34 files. Verified complete 124-icon prismatic coverage, contiguous artwork families, readable labels and preserved old search terms. PNG uniqueness and saved-ID compatibility checks pass. Reapplying curation is stable and leaves other rarities and aliases unchanged. git diff --check passed."
  ]
},
  {
  "id": "patch-2026-09-17-gold-icon-names",
  "patch": "2026.09.17-gold-icon-names",
  "timestamp": "2026-09-18T01:39:05.047Z",
  "title": "Reviewed gold augment icon names and artwork groups",
  "summary": "Corrected gold icon labels and grouped all 147 designs by central artwork.",
  "details": [
    "Corrected joined words, casing, missing punctuation, export suffixes and stray Name prefixes across the five gold picker pages; preserved old labels in search terms.",
    "Added reviewed gold artwork families so matching glyphs remain adjacent regardless of name and unrelated historical designs no longer pair solely by name.",
    "Reused curation logic for gold and silver and integrated gold corrections into enrichment and full catalogue generation, with a local-only gold update command."
  ],
  "impact": [
    "Creators can find readable gold names and browse similar gold designs together.",
    "Silver and prismatic metadata, PNG files, aliases and saved icon IDs remain unchanged. No migration is required."
  ],
  "files": [
    "data/catalogs/augment-gold-icon-groups.json",
    "data/catalogs/augment-icons.json",
    "scripts/curate-gold-augment-icons.mjs",
    "scripts/curate-silver-augment-icons.mjs",
    "scripts/enrich-augment-icons.mjs",
    "tests/augment-icons.test.ts",
    "docs/augment-builder.md",
    "lib/staff-changelog.ts"
  ],
  "verification": [
    "npm run check passed: lint with existing unrelated image warnings, TypeScript, and all 154 tests across 34 files. Verified all 147 gold icons are covered exactly once, artwork groups are contiguous, corrected labels preserve old search terms, and PNG uniqueness and saved-ID compatibility remain intact. Reapplying gold curation is stable; other rarities and aliases are unchanged. git diff --check passed."
  ]
},
  {
  "id": "patch-2026-09-17-silver-icon-names",
  "patch": "2026.09.17-silver-icon-names",
  "timestamp": "2026-09-18T01:29:43.844Z",
  "title": "Reviewed silver augment icon names and artwork groups",
  "summary": "Corrected joined silver labels and grouped all 135 silver icons by their central artwork.",
  "details": [
    "Added explicit display labels for lowercase asset names, missing spaces and export suffixes; retained previous labels and IDs in search terms.",
    "Replaced name-first silver ordering with reviewed central-glyph families, keeping matching bowls, wisps, shields, blades and other designs adjacent regardless of augment name.",
    "Integrated curation into catalogue enrichment and generation; added a local-only reapplication command. Gold and prismatic metadata, PNG assets and saved icon IDs are unchanged."
  ],
  "impact": [
    "Creators can scan readable silver names and find similar artwork together.",
    "No migration or runtime network request is needed. Future silver assets remain available after reviewed groups."
  ],
  "files": [
    "data/catalogs/augment-silver-icon-groups.json",
    "data/catalogs/augment-icons.json",
    "scripts/curate-silver-augment-icons.mjs",
    "scripts/enrich-augment-icons.mjs",
    "tests/augment-icons.test.ts",
    "docs/augment-builder.md",
    "lib/staff-changelog.ts"
  ],
  "verification": [
    "npm run check passed: lint with existing unrelated image warnings, TypeScript, and all 152 tests across 34 files. Verified complete 135-icon silver coverage, contiguous artwork groups, readable labels, searchable legacy names, PNG uniqueness and saved-ID compatibility. Reapplying curation is byte-for-byte stable and leaves other rarities unchanged. git diff --check passed."
  ]
},
  {
    id: 'patch-2026-09-17-augment-editor-refinements', patch: '2026.09.17-augment-editor-refinements',
    timestamp: '2026-09-18T01:10:23.684Z', title: 'Refined augment rarity selection and optional details',
    summary: 'Simplified the builder, matched icons to card rarity, grouped related artwork, and split optional details into dedicated fields.',
    details: [
      'Classified tinted icon artwork by rarity, normalized Cherry prefixes/Name suffixes and camel-case labels, and generated visual ordering to place matching names and similar silhouettes together. Untiered legacy illustrations are excluded from rarity-filtered choices.',
      'Rarity changes and draft restoration clear incompatible icon selections; unfinished drafts support an empty icon and publishing requires an icon matching the selected rarity. New blank drafts start with the silver ADAPt icon.',
      'Removed starter templates, explanatory rarity/icon/name headings, the builder tagline, preview heading/rarity badge, and routine autosave status text. Storage errors remain visible.',
      'Added separate quest and restriction text fields with persistent draft toggles, responsive two-column layout, Long Description and Notes fields, and the shared hover-note component with the requested help copy.',
      'Added migration 135 for quest_requirements, restrictions, and notes; disabled optional fields are omitted from publication, and legacy combined details remain readable as Notes. Updated public views and bounded API payload size for the new fields.',
    ],
    impact: ['Creators see a simpler editor with rarity-appropriate artwork and organized extra details.', 'Existing published artwork remains unchanged. Migration 135 is local and must be applied before publishing or reading the new detail columns.'],
    files: ['components/augment-builder.tsx', 'components/augment-extra-details.tsx', 'components/augment-shared.tsx', 'components/augment-view.tsx', 'components/header-hover-note.tsx', 'lib/augment-builder.ts', 'lib/augment-builder-server.ts', 'lib/augment-card-renderer.ts', 'scripts/enrich-augment-icons.mjs', 'scripts/generate-augment-catalog.mjs', 'data/catalogs/augment-icons.json', 'app/api/augments/route.ts', 'supabase/migrations/135_augment_extra_details.sql', 'tests/augment-builder.test.ts', 'tests/augment-icons.test.ts', 'tests/augment-api.test.ts', 'tests/augment-server.test.ts', 'docs/augment-builder.md', 'lib/staff-changelog.ts'],
    verification: ['npm run check passed: lint with existing unrelated image warnings, TypeScript, and all 149 tests across 34 files. Chrome verified silver/prismatic filtering, icon clearing on rarity changes, selection, optional-field toggles and restoration, exact hover-note copy, and desktop/mobile layout without horizontal overflow or browser errors. PNG uniqueness, legacy details restoration, rarity validation, and disabled-field publication are covered by regression tests. git diff --check passed. No production build or migration push performed.'],
  },
  {
    id: 'patch-2026-09-17-augment-unique-icons',
    patch: '2026.09.17-augment-unique-icons',
    timestamp: '2026-09-17T22:09:11.869Z',
    title: 'Removed duplicate augment icon images',
    summary: 'The augment picker now offers one entry per unique PNG image.',
    details: [
      'Compared decoded RGBA pixels and image dimensions, ignoring RGB under fully transparent pixels, to reduce 611 source icons to 420 unique images and remove 191 duplicate PNG files.',
      'Added build-time PNG decoding and a repeatable local deduplication script; catalogue generation now deduplicates automatically.',
      'Preserved removed icon IDs as aliases for draft validation, preview and PNG rendering, and retained alternate names in picker searches.',
    ],
    impact: ['Creators see each unique image once. Existing drafts, templates and published augments keep their original artwork.', 'No database changes or runtime dataset requests are required.'],
    files: ['scripts/deduplicate-augment-icons.mjs', 'scripts/generate-augment-catalog.mjs', 'data/catalogs/augment-icons.json', 'public/augments/icons/*', 'lib/augment-builder.ts', 'lib/augment-card-renderer.ts', 'components/augment-builder.tsx', 'package.json', 'package-lock.json', 'tests/augment-icons.test.ts', 'docs/augment-builder.md', 'lib/staff-changelog.ts'],
    verification: ['npm run check passed: lint with existing unrelated image warnings, TypeScript, and all 144 tests across 34 files. Regression checks verify unique decoded images, one PNG per catalogue entry, searchable legacy aliases, and saved-draft compatibility. A repeated deduplication run removed zero files and left the catalogue byte-for-byte unchanged. git diff --check passed.'],
  },
  {
    id: 'patch-2026-09-17-aram-mayhem-augment-builder', patch: '2026.09.17-aram-mayhem-augment-builder',
    timestamp: '2026-09-17T18:28:23.695Z', title: 'Added the ARAM Mayhem Augment Builder',
    summary: 'Create, export, publish, collect, and vote on custom ARAM Mayhem augment cards.',
    details: [
      'Added the builder to the shared games and navigation registry, with keyboard-accessible rarity/icon/name/description tabs, starter templates, optional requirements and long descriptions, and validated browser draft autosave.',
      'Generated 611 local official current/historical Arena and Mayhem icon assets, rarity frames, background, League fonts, and official inline stat-symbol atlas; preview and PNG clipboard/download use the same canvas renderer with safe allowlisted League formatting.',
      'Added immutable public augment links, account-owned public binders with pagination and deletion, verified account attribution and timestamps, one tier vote and one up/down reaction per account, and separate aggregate counts.',
      'Added migration 134 with RLS and service-role-only grants, bounded aggregate RPC, unique vote keys, creator ownership checks, cascading deletion, rate limits, sanitized content, and aggregate-only API telemetry. Migration created locally, not pushed.',
    ],
    impact: ['Guests can create and share cards; signed-in creators automatically save finished cards to their public binder.', 'Staff must apply migration 134 before database-backed publishing, binder browsing, and voting are available. Existing games are unchanged.'],
    files: ['app/augment-builder/*', 'app/api/augments/*', 'app/api/augment-binders/*', 'components/augment-*.tsx', 'lib/augment-builder.ts', 'lib/augment-builder-server.ts', 'lib/augment-card-renderer.ts', 'lib/game-navigation.ts', 'lib/game-families.ts', 'data/catalogs/augment-icons.json', 'data/catalogs/augment-stat-icons.json', 'public/augments/*', 'scripts/generate-augment-catalog.mjs', 'supabase/migrations/134_augment_builder.sql', 'tests/augment-builder.test.ts', 'tests/augment-api.test.ts', 'tests/augment-server.test.ts', 'app/sitemap.ts', 'docs/architecture.md', 'docs/augment-builder.md', 'lib/staff-changelog.ts'],
    verification: ['Final npm run check passed: lint (only existing unrelated image warnings), TypeScript, and all 142 tests across 33 files. New tests cover content limits, safe formatting, authentication, attribution, rate limits, and deletion ownership. Chrome verified draft restoration, PNG download and clipboard, icon search, keyboard tabs, mobile layout without horizontal overflow, and public card/binder fixture rendering with profile name color. All 611 catalogue icons have local files; git diff --check passed. Live database integration awaits migration 134. No production build or migration push performed.'],
  },
  {
    id: 'patch-2026-09-16-randodraft-share-view-id',
    patch: '2026.09.16-randodraft-share-view-id',
    timestamp: '2026-09-16T23:35:00.000Z',
    title: 'Reused Randodraft view IDs for sharing',
    summary: 'Completed drafts are persisted under their existing view ID, so Copy link copies the current address without creating another share.',
    details: [
      'Persisted the completed draft as soon as the results screen is entered and reused the same ID when a history draft is opened.',
      'Changed Copy link to copy window.location.href instead of issuing another share POST request.',
      'Unknown view IDs now fall back to the share API, allowing the same address-bar URL to load in another browser.',
      'Accepted pre-locked Class values during all-random completed-draft validation so valid two-team drafts no longer return Invalid completed draft.',
    ],
    impact: [
      'The URL shown in the address bar opens the same draft in another browser while the seven-day Redis record remains available.',
      'Repeated Copy link clicks no longer create duplicate records or change the URL.',
    ],
    files: [
      'components/randodraft.tsx',
      'lib/randodraft-history.ts',
      'app/api/randodraft/share/route.ts',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'Created an all-random two-team draft, persisted it under its view ID, and retrieved it independently with HTTP 200.',
      'npm run check passed: lint with existing unrelated img-element warnings, TypeScript, and 128 tests across 30 files.',
    ],
  },

  {
    id: 'patch-2026-09-16-randodraft-share-redis-rewrite',
    patch: '2026.09.16-randodraft-share-redis-rewrite',
    timestamp: '2026-09-16T23:00:00.000Z',
    title: 'Rewrote Randodraft share persistence',
    summary: 'Completed drafts now use short random references backed by seven-day Upstash Redis records.',
    details: [
      'Replaced the failing PostgREST table and RPC dependency in the share API with a server-only Upstash Redis store.',
      'Generated 16-character URL-safe references and stored only validated draft payloads with an automatic seven-day TTL.',
      'Validated stored payloads again before returning a completed draft, while preserving legacy encoded-link decoding in the client.',
    ],
    impact: [
      'Share links remain compact and work for account and guest drafts without depending on the Supabase schema cache.',
      'Expired guest share records are removed automatically by Redis expiration.',
    ],
    files: [
      'app/api/randodraft/share/route.ts',
      'app/api/randodraft/share/[id]/route.ts',
      'lib/randodraft-share-store.ts',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'Verified the configured Upstash Redis credentials with a write, read, and delete check.',
      'npm run check passed: lint with existing unrelated img-element warnings, TypeScript, and 128 tests across 30 files.',
    ],
  },

  {
    id: 'patch-2026-09-16-public-semver-patch-notes',
    patch: '2026.09.16-public-semver-patch-notes',
    timestamp: '2026-09-16T22:27:31.4492858Z',
    title: 'Formatted public updates as versioned patch notes',
    summary: 'Started public releases at 0.1.0, grouped patch notes by change type, and compacted the home news panel.',
    details: [
      'Changed the first release to version 0.1.0 with the title Update 0.1.0 - Randodraft and other fixes; update versions now use a major.minor.patch TypeScript template.',
      'Added optional typed sections rendered as semantic headings and bullet lists, retaining paragraphs for news articles.',
      'Grouped release content under New Game, New Feature, and Bug Fixes; reduced the mobile fix to Riftbound catalogue fixes for mobile.',
      'Added an optional preview summary and reduced home panel padding, icon size, typography, and spacing; removed the duplicate call-to-action line while preserving the full-card link.',
    ],
    impact: [
      'Readers can scan release changes by type and find the latest post in a shorter home panel.',
      'Maintainers can author structured patch notes and separate short preview summaries in lib/news.ts.',
    ],
    files: ['lib/news.ts', 'components/news-post.tsx', 'components/news-preview.tsx', 'lib/staff-changelog.ts'],
    verification: ['npm run check passed: lint, TypeScript, and all 128 tests across 30 files; only existing img-element warnings remain. git diff --check passed. No production build was run.'],
  },
  {
    id: 'patch-2026-09-16-first-public-release-post',
    patch: '2026.09.16-first-public-release-post',
    timestamp: '2026-09-16T22:20:36.4742036Z',
    title: 'Published the first public release post and repositioned home news',
    summary: 'Replaced the welcome announcement with the first versioned update and moved its home preview below the destination cards.',
    details: [
      'Moved the home News and Updates panel below Games, League Account Viewer, and Riftbound, before the account sign-up panel.',
      'Replaced the initial news announcement with update version 2026.09.16 covering Randodraft team and build drafting, Riftbound phone catalogue and detail-view fixes, and the News and Updates feed and archive.',
      'Added a concise opening paragraph summarizing all three topics for the home preview.',
    ],
    impact: [
      'Visitors see the primary destination cards first and can read a concrete release summary below them.',
      'Maintainers can continue authoring future releases in the existing public news registry.',
    ],
    files: ['components/landing-page.tsx', 'lib/news.ts', 'lib/staff-changelog.ts'],
    verification: ['npm run check passed: lint, TypeScript, and all 128 tests across 30 files; only existing img-element warnings remain. git diff --check passed. No production build was run.'],
  },
  {
    id: 'patch-2026-09-16-public-news-and-updates',
    patch: '2026.09.16-public-news-and-updates',
    timestamp: '2026-09-16T21:52:34.1421879Z',
    title: 'Added public News and Updates with a production release archive',
    summary: 'Introduced manually authored public release notes and news, a 30-day feed, and a latest-post panel on the home screen.',
    details: [
      'Added a typed public content registry with required versions for updates, UTC publication dates, titles, and paragraph bodies; seeded a welcome news announcement.',
      'Recent posts render newest first at /news; posts aged exactly 30 days or older appear at /news/archive, which is loaded by explicit navigation with link prefetch disabled.',
      'Publication filtering hides future-dated entries. Dynamic news routes evaluate age on each request; the home preview revalidates every 60 seconds and can show the latest archived post.',
      'Updates use amber Package badges; news uses cyan Megaphone badges. Both show dates and titles, while updates also show version numbers.',
      'Composed the server-rendered latest-post preview into the client home layout without bundling the public registry or staff changelog into that client component.',
      'Added public page metadata and sitemap routes. No database, deployment automation, or staff-only content is exposed.',
    ],
    impact: [
      'Visitors can discover announcements from the home screen and browse current and archived posts without an account.',
      'Maintainers manually add production release posts and news in lib/news.ts; internal staff patch notes remain independent.',
    ],
    files: [
      'lib/news.ts', 'components/news-post.tsx', 'components/news-preview.tsx',
      'components/news-screen.tsx', 'components/landing-page.tsx', 'app/page.tsx',
      'app/news/page.tsx', 'app/news/archive/page.tsx', 'app/sitemap.ts',
      'tests/news.test.ts', 'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint, TypeScript, and 128 tests across 30 files. Only existing img-element lint warnings remain. Four new tests cover the exact 30-day boundary, ordering, future publication, empty feeds, and archived preview fallback. git diff --check passed. No production build was run.',
    ],
  },
  {
    id: 'patch-2026-09-16-riftbound-card-modal-width-containment',
    patch: '2026.09.16-riftbound-card-modal-width-containment',
    timestamp: '2026-09-16T21:28:39.8911205Z',
    title: 'Contained Riftbound card detail modal content on phones',
    summary: 'Constrained card detail modal descendants and value-history scrolling so loaded market data stays inside the popup with consistent mobile padding.',
    details: [
      'Added minimum-width and full-width constraints to the card detail dialog content, market-value section, metadata, product details, and value-history section so grid descendants cannot contribute an unbounded intrinsic width on narrow screens.',
      'Kept the modal horizontally clipped while retaining vertical scrolling, and kept the fixed-width card history plot horizontally scrollable only within its bounded chart panel.',
      'Kept existing Riftbound card artwork on the unoptimized image path; no Next.js or Vercel image transformation behavior was introduced.',
    ],
    impact: [
      'Mobile users can view all loaded card information inside the popup borders with the existing vertical modal scrolling and local chart horizontal scrolling preserved.',
    ],
    files: [
      'components/riftbound-card-grid.tsx',
      'components/riftbound-history-chart.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint, TypeScript, and 124 tests across 29 files; lint retained only existing img-element warnings.',
      'git diff --check passed with only the repository Git LF-to-CRLF normalization warnings.',
      'No production build was run because the request did not require one and repository guidance reserves it for an explicitly stopped dev-server state.',
    ],
  },
  {
    id: 'patch-2026-09-16-riftbound-mobile-catalogue-history-layout',
    patch: '2026.09.16-riftbound-mobile-catalogue-history-layout',
    timestamp: '2026-09-16T21:08:17.6601295Z',
    title: 'Improved Riftbound phone catalogue and card-history layout',
    summary: 'Added compact two-column phone catalogue grids, aligned mobile sort and filter controls, and isolated card value-history scrolling inside the detail modal.',
    details: [
      'Added a phone-only two-column grid override for the shared Riftbound collection and deck catalogue classes, preserving the existing fixed-width adaptive layouts from tablet through desktop.',
      'Changed the mobile catalogue control layout so the search field occupies its own row and the sort menu and filter button share the row beneath it for both the inventory catalogue and Riftbound profile collection.',
      'Bound the card detail modal and its fixed-width market-history plot to the available viewport width, keeping the chart horizontally scrollable inside its own chart panel without allowing the popup grid to expand.',
      'Kept Riftbound card artwork on the existing unoptimized image path; no Vercel image transformation behavior was added or changed.',
    ],
    impact: [
      'Phone users can browse two Riftbound cards per row with less unused space and reach sorting and filtering controls without an extra filter-only row.',
      'Card details remain within the phone viewport after history data loads, while the full-width chart remains available through its local horizontal scroll area.',
    ],
    files: [
      'app/globals.css',
      'components/riftbound-card-grid.tsx',
      'components/riftbound-profile.tsx',
      'components/riftbound-history-chart.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run typecheck passed after the responsive stylesheet changes.',
      'npm run check passed: lint, TypeScript, and the repository test suite completed successfully with only existing img-element lint warnings.',
      'git diff --check passed with no whitespace errors.',
      'No production build was run because the request did not require one and repository guidance reserves it for an explicitly stopped dev-server state.',
    ],
  },
  {
    id: 'patch-2026-09-16-randodraft-share-and-icon-sizing',
    patch: '2026.09.16-randodraft-share-and-icon-sizing',
    timestamp: '2026-09-16T20:00:00.000Z',
    title: 'Restored Randodraft short-link sharing and enlarged draft icons',
    summary: 'Applied the pending short-share migration and updated completed-map and recent-draft champion icon sizing for clearer results.',
    details: [
      'Applied migration 133_randodraft_short_shares.sql to the linked Supabase database so POST /api/randodraft/share can persist compact seven-day references instead of returning a missing-relation error.',
      'Increased completed-map champion icons by approximately 50 percent while retaining eager loading and icon-only overlays.',
      'Increased recent-draft champion icons by approximately 40 percent and made single-team champion rows size to their content while preserving full-width two-team rows.',
    ],
    impact: [
      'Copy link now has the durable short-share storage it expects, including anonymous seven-day retention.',
      'Completed maps and recent drafts are easier to scan without changing hover, team coloring, or navigation behavior.',
    ],
    files: [
      'components/randodraft-results.tsx',
      'components/randodraft-history.tsx',
      'supabase/migrations/133_randodraft_short_shares.sql',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npx supabase migration list confirmed migration 133 is applied remotely; npx supabase db push completed successfully.',
      'npm run check passed: lint with existing unrelated img-element warnings, TypeScript, and 124 tests across 29 files.',
    ],
  },
  {
    id: 'patch-2026-09-15-randodraft-history-aram-slots',
    patch: '2026.09.15-randodraft-history-aram-slots',
    timestamp: '2026-09-15T22:00:00.000Z',
    title: 'Added Randodraft browser history and fixed ARAM slot reuse',
    summary: 'Randodraft now restores lobby, active, viewed, and shared states through browser navigation, while two-team ARAM overlays retain all five slots per team.',
    details: [
      'Starting, resuming, viewing a finished draft, and opening a shared draft now use play, view, and share URL states. popstate restores those states and session storage keeps locally viewed results available to forward navigation.',
      'The in-app back control synchronously returns to the lobby and clears active timers while browser back and forward continue to restore the URL state.',
      'Two-team ARAM map placement now indexes the selected slot within its team instead of wrapping against the number of teams, preventing picks three through five from reusing earlier positions.',
      'Settings labels use readable category separators and the regression suite covers all ten distinct two-team ARAM overlay slots.',
    ],
    impact: [
      'Players can use browser back and forward buttons while starting, resuming, and reviewing Randodraft games without losing the selected state.',
      'Howling Abyss results display every team pick in the supplied lower-left and upper-right formations.',
    ],
    files: [
      'components/randodraft.tsx',
      'components/randodraft-results.tsx',
      'tests/randodraft.test.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npx vitest run tests/randodraft.test.tsx passed: 11 tests.',
      'npm run check passed: lint with existing unrelated img-element warnings, TypeScript, and 124 tests across 29 files; no production build was run while the dev server was active.',
    ],
  },
  {
    id: 'patch-2026-09-15-randodraft-aram-overlay-visibility',
    patch: '2026.09.15-randodraft-aram-overlay-visibility',
    timestamp: '2026-09-15T21:30:00.000Z',
    title: 'Improved ARAM overlay visibility and history focus states',
    summary: 'Eagerly loaded all completed-map champion icons and removed nested recent-draft focus borders.',
    details: [
      'Howling Abyss map champion icons now load eagerly so completed two-team drafts show every pick without waiting for lazy-image loading.',
      'Recent draft header and combined champion-row buttons no longer draw their own click or focus ring; the outer draft item remains the visual hover target.',
    ],
    impact: [
      'Players can verify all ARAM picks at a glance and recent drafts have a cleaner single-item interaction state.',
    ],
    files: [
      'components/randodraft-results.tsx',
      'components/randodraft-history.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint with only existing unrelated img-element warnings, TypeScript, and 123 tests across 29 files. git diff --check passed; no production build was run while the dev server was active.',
    ],
  },
  {
    id: 'patch-2026-09-15-randodraft-aram-map-layout',
    patch: '2026.09.15-randodraft-aram-map-layout',
    timestamp: '2026-09-15T20:45:00.000Z',
    title: 'Aligned Howling Abyss team positions',
    summary: 'Grouped ARAM overlays along the map diagonal with Team 1 in the lower-left and Team 2 in the upper-right.',
    details: [
      'Two-team ARAM results now use compact three-plus-two formations on each side of the Howling Abyss lane, matching the supplied reference layout.',
      'Team positions remain icon-only and preserve the existing hover, keyboard, touch, and featured-pick behavior.',
    ],
    impact: [
      'Howling Abyss results are easier to read at the same map size, with team picks no longer spread across or stacked on top of the map.',
    ],
    files: [
      'components/randodraft-results.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint with only existing unrelated img-element warnings, TypeScript, and 123 tests across 29 files. git diff --check passed; no production build was run while the dev server was active.',
    ],
  },
  {
    id: 'patch-2026-09-15-randodraft-map-calibration',
    patch: '2026.09.15-randodraft-map-calibration',
    timestamp: '2026-09-15T20:30:00.000Z',
    title: 'Recalibrated Randodraft SummonerÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢s Rift positions',
    summary: 'Replaced mirrored lane coordinates with fixed role-specific slots that match the supplied map reference and keep all ten overlays separated.',
    details: [
      'Team 1 and Team 2 now use distinct points along the top, jungle, mid, and bottom-side paths instead of mirrored coordinates that placed picks on the wrong lane side.',
      'Bot and support positions are grouped along the lower-right path while the two junglers occupy separate upper and lower central positions, preventing overlay collisions.',
    ],
    impact: [
      'Completed two-team SummonerÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢s Rift drafts now present champion icons in the intended map locations and remain readable at the compact map size.',
    ],
    files: [
      'components/randodraft-results.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint with only existing unrelated img-element warnings, TypeScript, and 123 tests across 29 files. git diff --check passed; no production build was run while the dev server was active.',
    ],
  },
  {
    id: 'patch-2026-09-15-randodraft-share-map-polish',
    patch: '2026.09.15-randodraft-share-map-polish',
    timestamp: '2026-09-15T19:30:00.000Z',
    title: 'Polished Randodraft map overlays, sharing, and history',
    summary: 'Corrected red/blue map positions, simplified overlays to champion icons, added expiring short share references, and made recent drafts open directly.',
    details: [
      'Completed maps now use explicit red-side Team 1 and blue-side Team 2 lane coordinates, with offset mid positions and compact icon-only overlays to prevent labels and lane markers from colliding.',
      'Share creation stores validated completed drafts in a service-role-only table behind UUID references. References expire after seven days, are pruned hourly when pg_cron is available, and legacy encoded links remain readable during migration.',
      'Copy actions display a temporary check icon. PNG exports include the KnowLeague - Randodraft title, champion icons, build item icons, and local lane/class icons.',
      'Recent drafts no longer expand inline; clicking a draft restores its completed screen. Two-team history and pick lists identify red-side Team 1 and blue-side Team 2 with separate rows and color treatments.',
      'The short-share migration is emitted as BOM-free UTF-8 SQL so Supabase CLI applies it without a syntax error.',
    ],
    impact: [
      'Shared links are short and do not expose the draft payload in the URL; expired guest share records are removed from the database.',
      'Players can inspect historical drafts immediately and distinguish team sides in both the team panel and completed pick list.'
    ],
    files: [
      'app/api/randodraft/share/route.ts',
      'app/api/randodraft/share/[id]/route.ts',
      'supabase/migrations/133_randodraft_short_shares.sql',
      'components/randodraft.tsx',
      'components/randodraft-results.tsx',
      'components/randodraft-history.tsx',
      'components/randodraft-team.tsx',
      'docs/randodraft.md',
      'tests/randodraft.test.tsx',
      'lib/staff-changelog.ts'
    ],
    verification: [
      'npm run check passes: lint with only existing unrelated img-element warnings, TypeScript, and 123 tests across 29 files. git diff --check passes; no production build was run while the dev server was active.'
    ]
  },
  {
    id: 'patch-2026-09-15-randodraft-controls-results',
    patch: '2026.09.15-randodraft-controls-results',
    timestamp: '2026-09-15T18:30:00.000Z',
    title: 'Refined Randodraft controls and completed results',
    summary: 'Reworked team settings controls, animated Quick Roll feedback, compacted multi-team map cards, and changed sharing actions to direct copy.',
    details: [
      'Players per team is now selected with five inline buttons, while Quick Roll and One Team/Two Teams use paired responsive controls with clear selected states.',
      'Quick Roll hides the per-pick heading and presents Spin All progress with an animated indicator while retaining the one-second sequential draft cadence.',
      'Completed SummonerÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢s Rift and ARAM maps align to the top of the results grid; two-team cards use compact sizing and dedicated ARAM rows to prevent overlap, and Other Picks rows are color coded by team.',
      'Recent draft and completed draft actions now copy links or PNG images directly when supported, with image download as a compatibility fallback; the extra recent-draft icon and raw link display were removed.'
    ],
    impact: [
      'Draft configuration is faster to scan and operates consistently on narrow and wide layouts.',
      'Shared results can be copied directly for pasting into chats and documents without opening a browser share sheet.'
    ],
    files: [
      'components/randodraft.tsx',
      'components/randodraft-results.tsx',
      'components/randodraft-history.tsx',
      'lib/staff-changelog.ts'
    ],
    verification: [
      'npm run check passed: lint with only existing unrelated img-element warnings, TypeScript, and 123 tests across 29 files. git diff --check passed; no production build was run while the dev server was active.'
    ]
  },
  {
    id: 'patch-2026-09-15-randodraft-teams-quick-roll-sharing',
    patch: '2026.09.15-randodraft-teams-quick-roll-sharing',
    timestamp: '2026-09-15T17:00:00.000Z',
    title: 'Added Randodraft team settings, Quick Roll, and sharing',
    summary: 'Added configurable team sizes, optional mirrored second teams, timed Quick Roll, completed-draft link/image sharing, and seven-day guest draft retention.',
    details: [
      'The lobby now supports one to five players per team, an optional second team, and Quick Roll. Legacy settings and saved drafts normalize to one five-player team with Quick Roll disabled.',
      'Quick Roll replaces the category and build spinners with Spin All and fills each pick in order at one-second intervals, including the same champion, lane/class, build legality, uniqueness, and ARAM rules as manual drafting.',
      'Two-team drafts render Team 1 and Team 2 in separate rows, permit lane reuse across teams while retaining per-team lane uniqueness, and mirror the second team positions on completed maps.',
      'Completed drafts can be shared through compact validated links or exported PNG images. Guest completed drafts are stored only in browser storage and pruned after seven days; shared guest links expire on the same retention window.',
      'Account history validation and the history RPC now accept the selected player count and total picks while continuing to retain at most five completed drafts per account.'
    ],
    impact: [
      'Players can create smaller custom drafts, run both sides of a matchup, finish a draft quickly, and share results without requiring recipients to sign in.',
      'Guest draft history remains local to the browser; no guest identity or draft payload is sent to the backend.'
    ],
    files: [
      'components/randodraft.tsx',
      'components/randodraft-team.tsx',
      'components/randodraft-results.tsx',
      'components/randodraft-history.tsx',
      'components/use-randodraft-history.ts',
      'lib/randodraft.ts',
      'lib/randodraft-history.ts',
      'lib/randodraft-progress.ts',
      'lib/randodraft-share.ts',
      'supabase/migrations/132_randodraft_team_settings.sql',
      'tests/randodraft.test.ts',
      'tests/randodraft.test.tsx',
      'lib/staff-changelog.ts'
    ],
    verification: [
      'Full npm run check passes: lint, TypeScript, and 123 tests across 29 files; lint retains only the existing unrelated img-element warnings. Focused reducer coverage includes configurable two-team lane reuse. No production build was run while the dev server was active.'
    ]
  },

  {
    id: 'patch-2026-09-12-randodraft-game-modes',
    patch: '2026.09.12-randodraft-game-modes',
    timestamp: '2026-09-12T02:20:00.000Z',
    title: 'Added Summoner\'s Rift and ARAM Randodraft modes',
    summary: 'Added mode selection, lane-free ARAM drafting, ARAM item availability, Howling Abyss results, and mode labels in recent drafts.',
    details: [
      'The lobby now stores a typed gameMode setting with Summoner\'s Rift as the backward-compatible default and ARAM as the lane-free alternative.',
      'ARAM drafts five unique champions and classes, hides the lane spinner, validates six-item builds against ARAM map availability, and renders the Howling Abyss map in the completed view.',
      'The generated 16.18.1 catalogue now records per-item map modes and includes ARAM-only purchasable entries while preserving the existing Riot class, attack identity, and equipment-group constraints.',
      'Completed history entries display the selected mode. Legacy history and local snapshots without gameMode are normalized to Summoner\'s Rift during validation.'
    ],
    impact: [
      'Players can choose the map rules before starting and can distinguish SR and ARAM drafts in recent history.',
      'The history API and database schema remain unchanged because mode is stored inside the validated draft JSON.'
    ],
    files: [
      'components/randodraft.tsx',
      'app/randodraft/page.tsx',
      'components/randodraft-results.tsx',
      'components/randodraft-team.tsx',
      'components/randodraft-history.tsx',
      'lib/randodraft.ts',
      'lib/randodraft-history.ts',
      'lib/randodraft-progress.ts',
      'scripts/generate-randodraft-catalog.mjs',
      'data/catalogs/randodraft.json',
      'public/maps/howling-abyss.png',
      'docs/randodraft.md',
      'tests/randodraft.test.ts',
      'tests/randodraft.test.tsx',
      'lib/staff-changelog.ts'
    ],
    verification: [
      'Full npm run check passed: typecheck and all 122 tests across 29 files passed; lint retained only the existing img-element warnings. git diff --check passed. The pinned catalogue generator and map asset download completed; no production build was run while the dev server was active.'
    ]
  },
  {
    id: 'patch-2026-09-11-randodraft-class-lock-and-lobby-polish',
    patch: '2026.09.11-randodraft-class-lock-and-lobby-polish',
    timestamp: '2026-09-11T22:08:00.000Z',
    title: 'Polished Randodraft lobby, class reels, and fresh draft flow',
    summary: 'Hid empty resumes, added recent-draft hover treatment, renamed the category to Class, locked all-random classes automatically, and refined reel landing and pick-card presentation.',
    details: [
      'The lobby only offers Resume Randodraft when at least one pick is complete. New draft from the completed screen starts pick one directly and creates a fresh local draft session.',
      'The visible Type category is now Class, the build header includes the selected class icon and name, and All build types are random initializes every new pick with a locked Random class so no spin is required.',
      'Reel landing frames avoid adjacent duplicate lane or class outcomes when alternate choices exist. Spinner text is non-selectable, manual search focus is subdued, category cards use the updated gradient treatment, and recent draft rows expose the same hover/focus feedback as other app cards.',
      'Completed-result hover promotion is limited to map markers; the Other picks list remains compact and click-selectable. Team card fallbacks and visible documentation use Class terminology.'
    ],
    impact: [
      'Players get a clearer lobby resume state, a more consistent class vocabulary, a direct restart path, and less ambiguous spinner outcomes while preserving local progress and build restrictions.',
      'No API, database, catalogue, or backend history schema changed.'
    ],
    files: [
      'components/randodraft.tsx',
      'components/randodraft-category.tsx',
      'components/randodraft-spinner.tsx',
      'components/randodraft-team.tsx',
      'components/randodraft-history.tsx',
      'components/randodraft-results.tsx',
      'lib/randodraft.ts',
      'docs/randodraft.md',
      'tests/randodraft.test.ts',
      'tests/randodraft.test.tsx',
      'tests/randodraft-spinner.test.tsx',
      'lib/staff-changelog.ts'
    ],
    verification: [
      'Focused Randodraft reducer, UI, and spinner tests passed: 35 tests across 3 files.',
      'Full npm run check passed: typecheck and all 120 tests across 29 files passed; lint retained only the existing img-element warnings. git diff --check passed. No production build, catalogue regeneration, or database migration was run.'
    ]
  },
  {
    id: 'patch-2026-09-11-randodraft-pick-summary-polish',
    patch: '2026.09.11-randodraft-pick-summary-polish',
    timestamp: '2026-09-11T21:27:48.141Z',
    title: 'Polished Randodraft pick controls and completed summary',
    summary: 'Smoothed reel deceleration, removed redundant spin and progress hints, added pointer-following item notes and category icons, and reorganized the completed draft details.',
    details: [
      'The category reel now uses a gentler ease-out curve and keeps the single clickable reel control without the bottom Click to spin hint. The visible Pick X heading is centered and the progress fraction remains available only to assistive technology.',
      'Your team cards show role and class icons, adapt six item slots to one row when the card has room and to two rows on smaller widths, and expose champion and item names in pointer-following custom notes. The resume card no longer includes browser-storage copy.',
      'Completed drafts move Jungle closer to its lane position, display role and class icons on map markers and the featured pick, and list the remaining picks in Top, Jungle, Mid, Support, Bot order. Hovering, focusing, or selecting another pick promotes it to the featured panel and returns the previous pick to the compact list.',
      'All added visuals continue to use GameIconImage with unoptimized local or catalogue assets so Randodraft images do not request Vercel image transformations.'
    ],
    impact: [
      'Players get a calmer spin landing, clearer category/build identity, hover notes that stay near the pointer, and a compact way to inspect every completed pick.',
      'No API, database, catalogue, or account-history behavior changed in this patch.'
    ],
    files: [
      'components/randodraft.tsx',
      'components/randodraft-spinner.tsx',
      'components/randodraft-spinner.module.css',
      'components/randodraft-team.tsx',
      'components/randodraft-results.tsx',
      'components/randodraft-pointer-note.tsx',
      'lib/staff-changelog.ts'
    ],
    verification: [
      'npm run check passed after the final tooltip and accessible-heading fixes; lint retained only the existing img-element warnings. The affected Randodraft flow test passed 9/9 tests.',
      'git diff --check passed. No production build, catalogue regeneration, or database migration was run.'
    ]
  },
  {
    id: 'patch-2026-09-11-randodraft-required-builds-local-resume',
    patch: '2026.09.11-randodraft-required-builds-local-resume',
    timestamp: '2026-09-11T20:52:54.424Z',
    title: 'Required builds, interactive reels, and local Randodraft recovery',
    summary: 'Required locked item builds, moved Spin into the reels, slowed animation with click-to-finish, shuffled item slots, and added browser-local resume and class icons.',
    details: [
      'Next/Finish and the reducer now require a legal locked build after the three categories. Completed-history validation rejects picks without builds. Historical records remain readable.',
      'Reels are accessible buttons with a highlighted Spin label, shuffle icon, and click hint. Removed the separate Spin button. Running reels say Click to finish and complete the preselected outcome once, cancelling the timeout. Animation is 2.475 seconds, 50% longer than 1.65 seconds; reduced motion remains immediate.',
      'Build generation shuffles all six output slots using Fisher-Yates, allowing boots in any position while preserving shop membership and purchase constraints. Result text now describes item slots rather than purchase order.',
      'In-progress state is saved locally after each committed change, including every pick completion. The lobby has a Resume Randodraft card; replay validation checks settings, unique picks, manual allowances, and builds before restoring. Account and guest keys are separate; account changes return to the lobby. Completion removes the local snapshot; only completed account history uses the existing backend write.',
      'Hidden the remaining-manual counter when the allowance is zero. Lane reels use public/role-icons. Downloaded six Riot client class icons from pinned CommunityDragon 16.18 into public/class-icons with source documentation. Random retains its text label.',
      'All Randodraft champion, item, lane, class, history, and map images use GameIconImage with unoptimized enabled; no Vercel image transformation URLs or responsive srcsets are generated.'
    ],
    impact: [
      'Players must complete the item build, can speed through an animation by clicking it, and can resume drafts after leaving or refreshing on the same browser.',
      'Staff retain backend writes only for completed account history. No database migration or catalogue regeneration is needed; local storage failures display a notice.'
    ],
    files: [
      'components/randodraft.tsx',
      'components/randodraft-spinner.tsx',
      'components/randodraft-spinner.module.css',
      'components/randodraft-category.tsx',
      'components/randodraft-results.tsx',
      'lib/randodraft.ts',
      'lib/randodraft-progress.ts',
      'lib/randodraft-history.ts',
      'public/class-icons/',
      'tests/randodraft.test.ts',
      'tests/randodraft.test.tsx',
      'tests/randodraft-spinner.test.tsx',
      'tests/randodraft-progress.test.ts',
      'tests/randodraft-history.test.ts',
      'tests/randodraft-history-api.test.ts',
      'docs/randodraft.md',
      'lib/staff-changelog.ts'
    ],
    verification: [
      'npm run check passed: typecheck and all 120 tests across 29 files passed; lint retained only existing img-element warnings. Coverage verifies required builds, all six boot positions, slower timing, exactly-once instant completion, cancellation, local resume with a locked build, malformed snapshots, missing-build rejection, account-specific storage keys, and unoptimized image output.',
      'Headless Chrome on the existing dev server confirmed 2.475s animation, immediate completion, Next blocked until build locking, a one-pick local checkpoint, successful resume after reload, hidden zero-manual counter, local role/class icons, and no mobile horizontal overflow or runtime exceptions. Neither rendered Randodraft images nor observed image requests used /_next/image. git diff --check passed; no build or database migration was run.'
    ]
  },
  {
    id: 'patch-2026-09-11-randodraft-riot-shop-classes',
    patch: '2026.09.11-randodraft-riot-shop-classes',
    timestamp: '2026-09-11T20:15:41.064Z',
    title: 'Aligned Randodraft builds with Riot item-shop classes',
    summary: 'Replaced stat-derived AD/AP/Tank pools with Riot-assigned Fighter, Marksman, Assassin, Tank, Mage, and Support item classes.',
    details: [
      'Fetched the pinned 16.18 item definitions and regenerated only the Randodraft catalogue. The generator derives item membership from mItemAttributes (1 Fighter, 2 Marksman, 4 Assassin, 8 Tank, 16 Mage, 32 Support), retains source flags for auditing, and fails on unknown values.',
      'Removed health/damage/AP stat heuristics. Items with multiple Riot class flags belong to each corresponding pool; Trinity Force is Fighter-only despite granting health, while Locket belongs to Support and Tank.',
      'Updated draft choices, UI explanations, and domain tests for the six shop classes plus optional Random. Builds continue to sample eligible items on click while enforcing champion purchase restrictions, unique items, and incompatible groups. Boots retain the existing exception.',
      'The pinned catalogue still contains 173 champions and 114 items. Existing saved drafts retain their historical labels; no history migration or catalogue refresh occurs during gameplay.'
    ],
    impact: [
      'Players receive equipment from the selected Riot shop class instead of a broad stat-based approximation.',
      'Staff can audit class assignments using source shopAttributes and regenerate the independent catalogue without affecting other games.'
    ],
    files: [
      'scripts/generate-randodraft-catalog.mjs',
      'data/catalogs/randodraft.json',
     'lib/randodraft.ts',
      'components/randodraft.tsx',
      'tests/randodraft.test.ts',
      'docs/randodraft.md',
      'lib/staff-changelog.ts'
    ],
    verification: [
      'Regenerated the pinned Randodraft catalogue successfully (173 champions, 114 items). npm run check passed: all 113 tests across 28 files and typecheck passed; lint retained only existing img-element warnings. Source-membership assertions passed, and legal builds were verified for every champion and all seven build types across eight seeds. git diff --check passed. No production build or database migration was run.'
    ]
  },
  {
    id: 'patch-2026-09-11-randodraft-gameplay-controls',
    patch: '2026.09.11-randodraft-gameplay-controls',
    timestamp: '2026-09-11T18:50:36.006Z',
    title: 'Refined Randodraft pick controls and independent spins',
    summary: 'Added editable pick labels, compact gameplay controls, inline manual choices, independent category spins, stable reel landings, and item summaries in Your team.',
    details: [
      'Each team slot has an editable label during drafting, limited to 32 characters with whitespace normalization and a Pick X fallback. Labels persist into completed picks and account-history payloads, including later edits to completed slots before Finish.',
      'Replaced the large pick heading and category descriptions with a compact current-pick title and manual-selection count. Removed the category-lock instruction and catalogue footer. Each new pick remounts its category controls and build spinner so previous results remain only in the team summary.',
      'Manual choices replace the reel/control area at the same height. Toggling the manual button restores the reel, while the existing per-pick manual budget and immutable choices remain enforced.',
      'Champion, Lane, and Type track busy state separately, allowing simultaneous spins. Next/Finish waits for all pending spins; unmounting the pick cancels pending callbacks. Locked category and build cards use green highlighting.',
      'Reel idle labels say Spin followed by the category. Completed spins retain their actual final three frames instead of restoring catalogue endpoints.',
      'Build preview sets are decorative. Clicking Spin generates a new winning build and independently generated animation frames. The generator samples eligible boots and then eligible equipment after each draw, preserving type, unique-item, item-group, and champion restrictions; it does not sample all complete combinations uniformly.',
      'Rolled builds appear below lane/type in the team card. Item names use the shared custom hover note with a bounded compact variant, available on hover and keyboard focus.',
      'Extracted focused category/team components and added regression tests. Existing build types remain pending the requested replacement definitions; no catalogue or migration changes were made.'
    ],
    impact: [
      'Players can rename team slots, spin categories together, select manually without expanding the card, and keep completed pick/build information in the team summary.',
      'Staff retain validated account history and build restrictions; the generator no longer selects a winner from a fixed preview pool.'
    ],
    files: [
      'components/randodraft.tsx',
      'components/randodraft-category.tsx',
      'components/randodraft-team.tsx',
      'components/randodraft-spinner.tsx',
      'components/randodraft-history.tsx',
      'components/header-hover-note.tsx',
      'lib/randodraft.ts',
      'lib/randodraft-history.ts',
      'tests/randodraft.test.ts',
      'tests/randodraft.test.tsx',
      'tests/randodraft-spinner.test.tsx',
      'tests/randodraft-history.test.ts',
      'docs/randodraft.md',
      'lib/staff-changelog.ts'
    ],
    verification: [
      'npm run check passed: typecheck and all 112 tests across 28 files passed; lint retained only existing img-element warnings. Tests cover independent concurrent spins, waiting for the final spin, stable landed neighbors, fresh on-click results, callback cancellation, manual toggling, pick labels, history validation, and team item summaries.',
      'Headless Chrome on the existing port-3000 dev server verified desktop and 390px mobile layouts: manual mode retained the same 422px card height, the mobile pick header measured 24px, concurrent spins and exact landed neighbors were preserved, all locked cards turned green, six items appeared in the team summary with a visible custom focus note, and Next cleared the working controls while retaining the completed build. No runtime exceptions or horizontal overflow were observed.',
      'Inspected the mobile gameplay screenshot. git diff --check passed; no production build, catalogue regeneration, or database migration was run. Replacement build-type definitions remain pending user clarification.'
    ]
  },
  {
    id: 'patch-2026-09-11-randodraft-always-enabled-builds',
    patch: '2026.09.11-randodraft-always-enabled-builds',
    timestamp: '2026-09-11T18:39:07.330Z',
    title: 'Made Randodraft build paths always available',
    summary: 'Removed the Random build path toggle and all disabled-build branches so every completed pick offers the item-build spinner.',
    details: [
      'Removed the lobby toggle, its explanatory text, and the unused Shield icon import. The separate Random Build Type selector remains configurable.',
      'Removed randomBuild from DraftSettings, defaults, history payload validation, and normalized saved settings. Old extra settings fields are ignored by history input normalization.',
      'Removed build-disabled checks from the draft reducer, build-spinner rendering, and progression hint. Build availability now depends only on locking the three pick categories; validation, one-roll locking, and spinner busy guards remain enforced.',
      'Assigned distinct per-pick keys to the category controls and build spinner, preventing stale duplicate manual controls when advancing with builds available.',
      'Updated existing domain/UI tests to remove disabled-mode cases and verify that manual picks also expose the build spinner. Rolling or skipping an available build remains supported.',
      'Updated docs/randodraft.md. No catalogue or database migration changes are required by this patch.'
    ],
    impact: [
      'Players can roll an item build for every pick without enabling a lobby setting.',
      'Staff no longer need to support or diagnose a disabled-build configuration.'
    ],
    files: [
      'components/randodraft.tsx',
      'lib/randodraft.ts',
      'lib/randodraft-history.ts',
      'tests/randodraft.test.ts',
      'tests/randodraft.test.tsx',
      'docs/randodraft.md',
      'lib/staff-changelog.ts'
    ],
    verification: [
      'npm run check passed: typecheck and all 106 tests across 27 files passed, including manual-pick advancement with builds available. Lint retained only existing img-element warnings. Confirmed no remaining randomBuild code references; git diff --check passed. No production build or migration was run.'
    ]
  },
  {
    id: 'patch-2026-09-11-randodraft-lobby-history',
    patch: '2026.09.11-randodraft-lobby-history',
    timestamp: '2026-09-11T18:16:42.669Z',
    title: 'Aligned Randodraft lobby and added account draft history',
    summary: 'Moved draft settings and Play to the left, replaced the right panel with five recent account drafts, and added configurable Random build types.',
    details: [
      'Removed the Pre-game lobby subtitle, Ready to draft status, splash artwork, promotional copy, counters, and build-type glossary. The lobby now uses the Ability Blitz width and two-column proportions with shared AppSelectMenu controls.',
      'Added Random Build Type with No random build types (default), Allow random build types, and All build types are random. Random mixes item types while retaining six unique items, boots, item-group exclusions, and champion purchase restrictions. The existing random build path toggle remains independent.',
      'Completed drafts save their five picks, optional item builds, settings, catalogue version, and a stable retry ID through an authenticated, aggregate-metered /api/randodraft/history route. The database stamps completion time and serializes saves per account, retaining at most five entries and deduplicating retained draft IDs.',
      'Added migration 131 with a private RLS-enabled history table and service-role-only storage function. Reads and writes derive account identity from bearer authentication; payloads are replayed through the draft reducer to validate picks, budgets, uniqueness, build legality, and type settings.',
      'Recent draft cards expand to show each champion, lane, type, and item build. Guests see a login link; loading, empty, failed-save, and retry states are explicit. Account changes clear displayed history and discard stale responses; drafts started under a different account are not saved.',
      'Migration is prepared locally and has not been pushed. Account history requires migration 131 to be applied.'
    ],
    impact: [
      'Players get a consistent settings-first lobby and can inspect their last five completed drafts across signed-in sessions after the migration is applied.',
      'Staff must apply migration 131 before enabling account history in an environment; no catalogue regeneration or production build is required.'
    ],
    files: [
      'components/randodraft.tsx',
      'components/randodraft-history.tsx',
      'components/use-randodraft-history.ts',
      'components/multiplayer-lobby-layout.tsx',
      'lib/randodraft.ts',
      'lib/randodraft-history.ts',
      'app/api/randodraft/history/route.ts',
      'supabase/migrations/131_randodraft_history.sql',
      'tests/randodraft.test.ts',
      'tests/randodraft.test.tsx',
      'tests/randodraft-history.test.ts',
      'tests/use-randodraft-history.test.tsx',
      'tests/randodraft-history-api.test.ts',
      'docs/architecture.md',
      'docs/randodraft.md',
      'lib/staff-changelog.ts'
    ],
    verification: [
      'npm run check passed: typecheck and all 106 tests across 27 files passed; lint retained only existing img-element warnings in profile-screen.tsx, public-profile-screen.tsx, and riftbound-compact-deck-view.tsx.',
      'Tests cover all Random build modes, legal mixed-item builds, completed-draft validation, authenticated account boundaries, guest behavior, stale responses, StrictMode/remount loading, stable retry payloads, and an account switch immediately before saving.',
      'Headless Chrome on the existing port-3000 dev server verified 1440px desktop panel alignment, 390px mobile stacking, removed lobby labels, the guest login note, all three selector options, and a locked Random type after Play. No runtime exceptions or horizontal overflow were observed.',
      'git diff --check passed. No production build or catalogue regeneration was run. Migration 131 was created locally and not pushed; live database retention and cross-device persistence remain unverified until it is applied.'
    ]
  },
  {
    id: 'patch-2026-09-10-randodraft-solo-draft',
    patch: '2026.09.10-randodraft-solo-draft',
    timestamp: '2026-09-10T23:42:48Z',
    title: 'Added Randodraft solo team drafting',
    summary: 'Added a five-pick solo draft with vertical category reels, configurable manual selections, optional legal item builds, and a Summoner\'s Rift team reveal.',
    details: [
      'Registered /randodraft immediately after Splash Scramble in the game hub and header. Added page metadata, structured data, sitemap registration, and profile/auth game-route handling.',
      'Reused the shared lobby shell/header and AppSelectMenu. The pre-game lobby offers zero, one, or two manual categories per pick and an enabled-by-default optional build spinner.',
      'Champion, Lane, and Type can be chosen in any order. Each result locks, manual allowances reset per pick, and champions/lanes cannot repeat. Next requires three completed categories; the fifth pick exposes Finish.',
      'Build rolls produce six unique equipment items, with one pair of standard upgraded boots exempt from the stat type. Source item-group ownership limits and attack identities prevent incompatible builds. Builds can be skipped.',
      'Added an independent pinned catalogue of 173 champions and 114 items from Data Dragon 16.18.1 and CommunityDragon 16.18. Runtime uses local JSON; no existing catalogues or database schemas were regenerated.',
      'Added a locally stored sample Riot minimap with five lane-positioned champion markers and hover, keyboard, and touch build inspection. Draft state stays local to the mounted page.',
      'Separated draft invariants, item eligibility, animation, and map presentation to support revisions. Vertical reels respect reduced motion and cancel pending callbacks on unmount.',
    ],
    impact: [
      'Players can create a complete randomized League team without signing in, choose how much control to retain, and inspect the final builds on the map.',
      'Staff can maintain the new catalogue independently with npm run data:generate:randodraft; docs/randodraft.md records assumptions, data provenance, and maintenance steps.',
    ],
    files: [
      'app/randodraft/page.tsx', 'app/sitemap.ts', 'components/app-header.tsx',
      'components/randodraft.tsx', 'components/randodraft-spinner.tsx',
      'components/randodraft-spinner.module.css', 'components/randodraft-results.tsx',
      'lib/randodraft.ts', 'lib/game-navigation.ts', 'lib/game-families.ts',
      'lib/auth-redirect.ts', 'lib/profile-navigation.ts', 'lib/staff-changelog.ts',
      'data/catalogs/randodraft.json', 'scripts/generate-randodraft-catalog.mjs',
      'public/maps/summoners-rift.png', 'package.json', 'docs/architecture.md',
      'docs/randodraft.md', 'tests/randodraft.test.ts', 'tests/randodraft.test.tsx',
    ],
    verification: [
      'Generated and inspected the pinned champion/item catalogue and purchase restrictions.',
      'Added domain coverage for manual budgets, every category order, lock enforcement, unique lanes/champions, optional builds, conflicting item groups, and complete builds across all champions and types.',
      'Added UI coverage for the complete five-pick flow, manual picks, build disabling/skipping, map inspection, in-spin locks, callback cancellation, and lobby navigation.',
      'Verified /randodraft on the existing port-3000 development server in headless Chrome at 1440px and 390px: lobby, reels, all five build rolls, Finish, and the map rendered with no runtime errors, broken final images, or horizontal overflow.',
      'npm run check passed: lint retained only the existing img-element warnings in profile-screen.tsx, public-profile-screen.tsx, and riftbound-compact-deck-view.tsx; typecheck passed; all 91 tests passed across 24 files. No production build was run while the development server was active.',
    ],
  },
  {
    id: 'patch-2026-09-09-skin-champion-champion-autofill',
    patch: '2026.09.09-skin-champion-champion-autofill',
    timestamp: '2026-09-09T00:12:55.5931339Z',
    title: 'Added champion-aware Skin Champion autofill',
    summary: 'Skin Champion now narrows autocomplete suggestions to skin lines associated with an exact champion-name query while preserving normal substring search for partial input.',
    details: [
      'Extended the existing skin-line answer endpoint with a server-generated champion-to-skin-line map built from the same transformed catalogue used to generate quiz answers, including skin-line overrides and omitted-line handling.',
      'The Skin Champion client normalizes the input and applies the champion map only when the full normalized query exactly matches a champion name. Queries such as ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œYasuÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â continue to search all skin-line answers by substring, while ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œYasuoÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â searches only YasuoÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢s associated skin lines.',
      'Kept answer submission unchanged: entering a champion name narrows the list but does not make the champion itself a valid skin-line answer.',
      'No quiz item selection, scoring, difficulty behavior, multiplayer state, authentication, or catalogue records were changed.',
    ],
    impact: [
      'Players can use a known champion name to quickly find the relevant skin lines without losing the existing partial-text autocomplete behavior.',
      'Champion filtering stays aligned with the serverÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢s authoritative Skin Champion answer transformations and full catalogue.',
    ],
    files: [
      'app/api/skin-champion/quiz-answers/route.ts',
      'components/skin-champion.tsx',
      'lib/skin-themes.ts',
      'lib/staff-changelog.ts',
      'tests/skin-themes.test.ts',
    ],
    verification: [
      'Added focused coverage for deduplicated champion-to-skin-line mapping.',
      'npm run check passed: lint retained the repository\'s existing img-element warnings in profile-screen.tsx, public-profile-screen.tsx, and riftbound-compact-deck-view.tsx; typecheck passed; 71 tests passed across 22 test files.',
      'No production build was run because repository guidance reserves it for an explicitly stopped dev-server state.',
    ],
  },
  {
    id: 'patch-2026-09-08-blocked-progress-current-item',
    patch: '2026.09.08-blocked-progress-current-item',
    timestamp: '2026-09-08T17:18:49.9972700Z',
    title: 'Hid current blocked quiz progress artwork',
    summary: 'Extended the high-difficulty round progress privacy fix so current as well as pending Ability Blitz and Skin Champion items remain hidden.',
    details: [
      'Updated both quiz progress-card call sites so Diamond, Challenger, and Chaos show artwork only for completed items; the current and pending answer images are omitted.',
      'Preserved the existing Iron clear previews, Gold blurred upcoming previews, completed-item artwork, answer text, timers, and carousel visibility behavior.',
      'No quiz scoring, difficulty configuration, multiplayer state, catalogue data, or server/API behavior changed.',
    ],
    impact: [
      'High-difficulty players cannot infer the current answer from the round progress section before submitting it.',
      'Completed progress remains reviewable while upcoming and active answer artwork stays hidden under blocked visibility rules.',
    ],
    files: [
      'components/ability-blitz.tsx',
      'components/skin-champion.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'Reviewed both QuizProgressCard call sites and the shared difficulty visibility rules before editing.',
      'npm run check passed: lint retained the repository\'s existing img-element warnings in profile-screen.tsx, public-profile-screen.tsx, and riftbound-compact-deck-view.tsx; typecheck passed; 70 tests passed across 21 test files.',
      'No production build was run because repository guidance reserves it for an explicitly stopped dev-server state.',
    ],
  },
  {
    id: 'patch-2026-09-08-misc-game-fixes',
    patch: '2026.09.08-misc-game-fixes',
    timestamp: '2026-09-08T16:46:15.0903803Z',
    title: 'Fixed daily resumes, progress visibility, lobby navigation, and Skincognito turns',
    summary: 'Prevented stale Splash Scramble daily resumes, hid blocked quiz progress artwork, kept Carving Revelation in its create/join flow, and improved Skincognito guess history, scrolling, and turn-aware input.',
    details: [
      'Splash Scramble now validates the saved round mode and UTC date key whenever a daily round is read, loaded from profile state, or resumed. Solved, expired, and stale-date daily candidates are not offered as Resume Daily, and locally stored stale or expired entries are removed.',
      'Ability Blitz and Skin Champion now apply each difficultyÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢s upcoming-visibility rule to round progress artwork: Iron shows pending artwork, Gold keeps its blurred preview, and Diamond, Challenger, and Chaos omit pending ability or skin images entirely.',
      'Carving Revelation now leaves a waiting lobby without routing away, so the existing page returns directly to its create/join lobby screen. The active and finished game leave behavior remains unchanged.',
      'Skincognito now renders the complete guess action history, scrolls the guess panel to the bottom whenever the action list changes regardless of its prior scroll position, and lets a non-spectating player browse categories and autofill suggestions during the other playerÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢s turn without enabling submission.',
      'No API contracts, server-side turn validation, catalogue data, authentication behavior, or persisted user-authored data were changed.',
    ],
    impact: [
      'Daily Splash Scramble cannot resume a round from a reset day.',
      'High-difficulty quiz players no longer receive visual previews of blocked upcoming answers in round progress.',
      'Carving Revelation waiting-lobby back navigation is consistent with the other multiplayer game lobby flows.',
      'Skincognito players can review all guesses and prepare their next answer while waiting, while the server and client continue to prevent out-of-turn submissions.',
    ],
    files: [
      'components/ability-blitz.tsx',
      'components/carving-revelation.tsx',
      'components/skin-champion.tsx',
      'components/skincognito.tsx',
      'components/splash-scramble.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'Reviewed the affected daily state, progress-card, lobby navigation, Skincognito action, scrolling, and turn-permission paths before editing.',
      'npm run check passed: lint retained the repository\'s existing img-element warnings in profile-screen.tsx, public-profile-screen.tsx, and riftbound-compact-deck-view.tsx; typecheck passed; 70 tests passed across 21 test files.',
      'No production build was run because repository guidance reserves it for an explicitly stopped dev-server state.',
    ],
  },
  {
    id: 'patch-2026-09-08-mobile-login-label',
    patch: '2026.09.08-mobile-login-label',
    timestamp: '2026-09-08T16:23:49.9542486Z',
    title: 'Displayed the mobile login label',
    summary: 'Made the unauthenticated mobile header action show its Log in label while retaining the icon-only mobile logout control.',
    details: [
      'Updated the shared LoginAction responsive classes so the top-right authentication control uses an auto-width button and visible Log in text below the desktop xl breakpoint, while preserving the compact icon-only treatment from xl through the wide desktop label breakpoint.',
      'Left LogoutControl on its existing default responsive mode, so mobile users continue to see only the logout icon and its accessible Log out label remains available through aria-label and title.',
      'No authentication flow, routes, session handling, account data, navigation destinations, or desktop wide-header behavior were changed.',
    ],
    impact: [
      'Unauthenticated mobile users can identify the top-right action as Log in without relying on the icon alone.',
      'Authenticated mobile users retain the existing icon-only logout presentation.',
    ],
    files: [
      'components/app-header.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'Reviewed the shared LoginAction, LogoutControl, and responsive header breakpoint structure before editing.',
      'npm run check passed: lint retained the repository\'s existing img-element warnings in profile-screen.tsx, public-profile-screen.tsx, and riftbound-compact-deck-view.tsx; typecheck passed; 70 tests passed across 21 test files.',
      'No production build was run because repository guidance reserves it for an explicitly stopped dev-server state.',
    ],
  },
  {
    id: 'patch-2026-09-04-skindle-autocomplete-controls',
    patch: '2026.09.04-skindle-autocomplete-controls',
    timestamp: '2026-09-04T18:48:50.0848700Z',
    title: 'Added opt-in Skindle clue filtering and grouped suggestions',
    summary: 'Made Skindle autocomplete clue filtering optional, excluded subjective role clues from that filter, and grouped results by champion with chronological release ordering.',
    details: [
      'Added an off-by-default ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œFilter dropdown results based on guessesÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â switch directly below the Skindle guess input. When enabled, autocomplete applies the previously revealed exact and partial clue constraints; when disabled, it returns all unguessed skin matches as before.',
      'Removed Role from autocomplete clue filtering because role assignments can be subjective. Role still compares and displays normally on reveal cards, and all other exact or partial filterable columns retain their constraints.',
      'Grouped the bounded autocomplete result set by champion name in alphabetical order and sorted each champion group from oldest to newest by release date, with undated skins placed after dated skins and stable answer/id tie-breakers.',
      'Kept the existing 12-result cap, one-row overscan rendering, direct-CDN thumbnail delivery, answer validation, daily state, and stats behavior unchanged.',
    ],
    impact: [
      'Players can choose whether revealed clues should narrow autocomplete results instead of having that behavior forced on every round.',
      'Subjective Role clues no longer hide potentially valid skin answers when clue filtering is enabled.',
      'Players can scan matching skins more easily because related champion results are adjacent and each championÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢s skins follow release chronology.',
    ],
    files: [
      'components/skindle.tsx',
      'lib/skindle.ts',
      'lib/staff-changelog.ts',
      'tests/skindle.test.ts',
    ],
    verification: [
      'Added focused Vitest coverage for the role-filter exception and champion grouping/release-date ordering.',
      'npm run check passed: lint retained the repository\'s existing img-element warnings in profile-screen.tsx, public-profile-screen.tsx, and riftbound-compact-deck-view.tsx; typecheck passed; 70 tests passed across 21 test files.',
      'No production build was run because repository guidance reserves it for an explicitly stopped dev-server state.',
    ],
  },
  {
    id: 'patch-2026-09-04-skindle-clue-filtering',
    patch: '2026.09.04-skindle-clue-filtering',
    timestamp: '2026-09-04T17:24:31.7813706Z',
    title: 'Fixed Skindle lane clues and autocomplete narrowing',
    summary: 'Added partial lane matching, narrowed skin autocomplete results using revealed exact or partial clues, and served autocomplete thumbnails without Vercel image transformations.',
    details: [
      'Skindle now treats overlapping multi-lane values such as Middle and Middle, Support as a partial match, so the lane reveal cell uses the orange indicator when the values are not identical but share a lane.',
      'Moved Skindle comparison and clue-filter logic into a typed domain helper. Exact and partial values already revealed across champion, skin line, rarity, species, gender, role, lane, release year, and resource now constrain subsequent autocomplete candidates; release-year direction arrows remain informational until the year is exact.',
      'Added a dedicated catalogue thumbnail image wrapper with Next Image unoptimized so Skindle autocomplete rows request the source CDN image directly and do not create Vercel image optimization transformations. Full-size Skindle artwork remains on the existing optimized splash-image path.',
      'Added regression coverage for partial lane matching and combined exact/partial autocomplete clue filtering. No catalogue records, API payloads, daily target selection, persistence keys, or user-authored data were changed.',
    ],
    impact: [
      'Players receive the expected orange feedback for guesses that share one or more lanes with the daily target while listing additional lanes.',
      'As clues accumulate, Skindle autocomplete becomes more useful by excluding skins that contradict already revealed characteristics.',
      'Autocomplete thumbnails bypass Vercel image optimization while the larger gameplay and preview images retain their existing responsive optimization behavior.',
    ],
    files: [
      'components/game-asset-image.tsx',
      'components/skindle.tsx',
      'lib/skindle.ts',
      'lib/staff-changelog.ts',
      'tests/skindle.test.ts',
    ],
    verification: [
      'Added focused Vitest coverage for overlapping lane values and exact/partial clue filtering.',
      'npm run check passed: lint retained the repository\'s existing img-element warnings in profile-screen.tsx, public-profile-screen.tsx, and riftbound-compact-deck-view.tsx; typecheck passed; 69 tests passed across 21 test files.',
      'No production build was run because repository guidance reserves it for an explicitly stopped dev-server state.',
    ],
  },
  {
    id: 'patch-2026-09-02-public-content-polish',
    patch: '2026.09.02-public-content-polish',
    timestamp: '2026-09-02T19:00:00.000Z',
    title: 'Polished public content layouts and privacy controls',
    summary: 'Aligned the public context sections, moved card icons beside titles, improved the Contact Help Center placement, simplified the footer, and made the privacy settings control handle delayed consent API loading.',
    details: [
      'Changed the Home and Games overview sections to use the same max-width and responsive horizontal padding pattern as their primary sections, keeping the context content aligned with the main app content.',
      'Added an optional shared PublicContentCard icon slot and migrated the About and Contact cards so icons render inline with their titles instead of above the card body.',
      'Added a top-left desktop placement option for the Contact page Help Center while retaining centered placement on smaller screens and existing centered placement elsewhere.',
      'Removed the Riftbound Card Database, Riftbound Community, and Riot Developer Portal links from the shared footer.',
      'Updated the privacy settings control to initialize and use the Google Funding Choices consent readiness queue, with visible loading and unavailable feedback when no consent API responds.',
    ],
    impact: [
      'Public content now follows the same horizontal alignment as the main application sections and presents icon-bearing cards with a consistent title row.',
      'Visitors opening Help Center from Contact can keep the form out of the way of the page on large screens while still receiving a centered mobile dialog.',
      'The footer is focused on KnowLeague-owned public pages and policies, and privacy settings no longer silently fails while the external consent runtime is loading.',
    ],
    files: [
      'app/about/page.tsx',
      'app/contact/page.tsx',
      'components/contact-us-widget.tsx',
      'components/privacy-settings-button.tsx',
      'components/public-content-page.tsx',
      'components/public-site-content.tsx',
      'components/site-footer.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'Reviewed the shared public card, Contact widget, footer, and AdSense consent integration before editing.',
      'npm run check passed: lint retained the repository\'s existing img-element warnings in profile-screen.tsx, public-profile-screen.tsx, and riftbound-compact-deck-view.tsx; typecheck passed; 67 tests passed across 20 test files.',
    ],
  },
  {
    id: 'patch-2026-08-29-public-editorial-content',
    patch: '2026.08.29-public-editorial-content',
    timestamp: '2026-08-29T02:49:54.1342061Z',
    title: 'Added public editorial content and feature guides',
    summary: 'Added crawlable explanations, data provenance, support information, and feature guides that give public visitors useful context before using KnowLeague.',
    details: [
      'Added server-rendered About, Guides, and Contact pages with original explanations of the games, League Account Viewer, Riftbound tools, data sources, scoring boundaries, intended audience, editorial standards, monetization status, and support paths.',
      'Added shared public-content primitives and static Home and Games overview sections so important context is available without login or gameplay interaction while matching the existing dark bordered-card visual system.',
      'Added site-wide footer links and sitemap entries for the new public pages, and expanded Privacy Policy and Terms of Service language for advertising consent, third-party attribution, source changes, and estimated market values.',
    ],
    impact: [
      'Search crawlers and first-time visitors can reach substantial original content explaining why KnowLeague exists, how its features work, and where its data comes from.',
      'Visitors have clear routes to game instructions, methodology notes, corrections, bug reports, suggestions, and privacy or account questions.',
      'No gameplay rules, account permissions, API contracts, visible ad placements, or current AdSense review state were changed; advertising remains inactive pending approval.',
    ],
    files: [
      'app/about/page.tsx',
      'app/contact/page.tsx',
      'app/games/page.tsx',
      'app/guides/page.tsx',
      'app/page.tsx',
      'app/privacy/page.tsx',
      'app/sitemap.ts',
      'app/terms/page.tsx',
      'components/public-content-page.tsx',
      'components/public-site-content.tsx',
      'components/site-footer.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'Static review completed for server-rendered public content, internal links, metadata paths, source wording, and existing user-facing boundaries.',
      'npm run check passed: lint retained the repository\'s existing img-element warnings in profile-screen.tsx, public-profile-screen.tsx, and riftbound-compact-deck-view.tsx; typecheck passed, and 67 tests passed across 20 test files.',
    ],
  },
  {
    id: 'patch-2026-08-29-riftbound-promo-display',
    patch: '2026.08.29-riftbound-promo-display',
    timestamp: '2026-08-29T01:36:01.9799693Z',
    title: 'Refined promotional rarity and artwork availability handling',
    summary: 'Placed Promo rarity between Showcase and Overnumbered, shortened promotional set labels in card details, and made unavailable promo artwork fail gracefully.',
    details: ['Changed the shared Riftbound rarity order so filters and rarity-sorted views present Showcase, Promo, then Overnumbered.', 'Added a card-detail-only Promotional Cards display label for all Promo records while preserving source set names for catalogue filters, inventory, and master-set views.', 'Persisted TCGCSV imageCount as imageAvailable for promo records. TCGCSV currently exposes image URLs for all 209 records, but its source metadata reports artwork availability for only the subset with imageCount greater than zero; no alternate image fields were present in the inspected source records.', 'Known-unavailable promo images are now skipped at runtime and unexpected failures render an accessible artwork-unavailable placeholder instead of leaving an empty card surface.'],
    impact: ['Promo rarity filters now follow the requested order and the card detail popup uses the concise Promotional Cards label.', 'The catalogue remains ready to adopt artwork automatically when TCGCSV starts reporting it, while users receive a stable visual state for promotional records that currently have no source artwork.'],
    files: ['lib/riftbound.ts', 'scripts/riftbound-promo-catalog.mjs', 'data/catalogs/riftbound-cards.json', 'components/riftbound-card-image.tsx', 'components/riftbound-card-grid.tsx', 'tests/riftbound.test.ts', 'docs/riftbound-price-history.md', 'lib/staff-changelog.ts'],
    verification: [
      'Audited the live TCGCSV promo product metadata and confirmed that the feed exposes imageUrl fields but no alternate image fields for records reporting imageCount=0.',
      'npm run data:generate:riftbound completed successfully and wrote 1,427 records; validation confirmed 209 promo records, 61 imageAvailable=true, and 148 imageAvailable=false.',
      'npm run check passed: lint retained the repository\'s existing img-element warnings in profile-screen.tsx, public-profile-screen.tsx, and riftbound-compact-deck-view.tsx; typecheck passed; 67 tests passed across 20 test files.',
    ],
  },
  {
    id: 'patch-2026-08-28-riftbound-promo-catalogue',
    patch: '2026.08.28-riftbound-promo-catalogue',
    timestamp: '2026-08-28T20:07:00.1085589Z',
    title: 'Added a maintained Riftbound promotional catalogue',
    summary: 'Added 209 TCGCSV-backed promotional Riftbound card records with stable source-product identities, automated catalogue refreshes, and exact live/archive price matching.',
    details: [
      'Added data/catalogs/riftbound-promos.json as the checked-in source policy for the PR, OPP, and JDG TCGCSV groups, including only products whose source Rarity is Promo. The current generated counts are PR=14, OPP=192, and JDG=3.',
      'Added the TCGCSV promo parser and generator integration. Each generated promo uses its TCGCSV product ID as its stable record identity, preserves source finish availability, and fails generation when a newly introduced promo lacks an image or collector number instead of silently creating incomplete data.',
      'Added the explicit PR product 663004 collector-number override for the Buff // Buff Fist Bump promo because its public source record has no Number field. Sealed products, non-promo rarity rows, and the unnumbered non-promo token are excluded by policy.',
      'Extended the Riftbound domain rarity type, ordering, styling, runtime classification, live price snapshots, and archive importer to recognize Promo records. Exact source-product price keys take precedence over printed-number fallbacks so duplicate promotional print numbers cannot share the wrong value history.',
      'Documented the refresh workflow so products added to an existing configured group flow into the catalogue automatically; a new promo group requires one manifest entry and any missing source number requires an explicit override.',
    ],
    impact: [
      'Users can browse, inventory, value, and track history for the currently published promotional Riftbound products as distinct cards, including duplicate-number variants.',
      'Running npm run data:generate:riftbound refreshes promotional products and current values without adding runtime dependence on the upstream catalogue feeds. The combined maintenance command can regenerate the catalogue before an intentional archive backfill.',
      'The generator validates unique card IDs, unique source product IDs, and non-empty finish options, reducing the chance that future source changes silently corrupt catalogue data.',
    ],
    files: [
      'data/catalogs/riftbound-promos.json',
      'data/catalogs/riftbound-cards.json',
      'scripts/riftbound-promo-catalog.mjs',
      'scripts/generate-riftbound-catalog.mjs',
      'lib/riftbound.ts',
      'lib/riftbound-price-source.ts',
      'scripts/import-riftbound-price-history.mjs',
      'docs/riftbound-price-history.md',
      'tests/riftbound.test.ts',
      'tests/riftbound-price-source.test.ts',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run data:generate:riftbound completed successfully and wrote 1,427 records. Generated validation confirmed 209 promo records, 209 unique source product IDs, Promo rarity on every promo record, no missing images, and no empty finish-options arrays.',
      'npm run check passed: lint retained the repository\'s existing img-element warnings in profile-screen.tsx, public-profile-screen.tsx, and riftbound-compact-deck-view.tsx; typecheck passed; 66 tests passed across 20 test files.',
    ],
  },
  {
    id: 'patch-2026-08-27-vendetta-signature-catalogue',
    patch: '2026.08.27-vendetta-signature-catalogue',
    timestamp: '2026-08-27T16:57:56.5850636Z',
    title: 'Added Vendetta Signature cards and synchronized price updates',
    summary: 'Refreshed the Riftbound catalogue with the nine Signature Vendetta Legends, fixed their price-source matching, and added one repeatable catalogue/history update command.',
    details: [
      'Regenerated data/catalogs/riftbound-cards.json from the official gallery and market sources, adding the nine VEN Signature prints 189-STAR through 197-STAR with their official artwork and current foil market values.',
      'Normalized the official -STAR collector-number spelling to the TCGCSV asterisk print key in both live cron snapshots and historical archive imports, so Signature foil prices are captured as live source values instead of catalogue fallbacks.',
      'Added data:update:riftbound, which runs catalogue generation before the idempotent historical importer and accepts bounded --from/--to dates plus --dry-run for new-set maintenance.',
      'Adjusted the League Account Viewer Mastery Viewer Play Mastery Master link to a fixed h-11 control aligned to the bottom of the adjacent inputs, preventing the label column from stretching it vertically.',
    ],
    impact: [
      'Users can browse, inventory, and track the nine Signature Vendetta Legends as distinct foil-only card records.',
      'The daily Riftbound snapshot and historical backfill workflows now resolve Signature prices against the correct TCGCSV products and preserve low/high source ranges where available.',
      'The Mastery Viewer action matches the height and baseline of the champion selector and Show/Hide All controls at desktop and responsive widths.',
    ],
    files: [
      'data/catalogs/riftbound-cards.json',
      'lib/riftbound-price-source.ts',
      'scripts/import-riftbound-price-history.mjs',
      'scripts/update-riftbound-data.mjs',
      'package.json',
      'docs/riftbound-price-history.md',
      'components/riot-account-viewer.tsx',
      'tests/riftbound.test.ts',
      'tests/riftbound-price-source.test.ts',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run data:update:riftbound -- --from 2026-07-31 --to 2026-08-27 completed: 27 TCGCSV archives were imported, 46,041 daily snapshot rows were upserted, and the unavailable current-day archive was skipped without failing the idempotent import.',
      'npm run check passed: next lint retained the repository\'s existing no-img-element warnings in components/profile-screen.tsx, components/public-profile-screen.tsx, and components/riftbound-compact-deck-view.tsx; typecheck passed; 64 tests passed across 20 test files. The focused Riftbound regression run also passed with 11 tests across 2 files.',
    ],
  },
  {
    id: 'patch-2026-08-26-google-auth-coming-soon',
    patch: '2026.08.26-google-auth-coming-soon',
    timestamp: '2026-08-26T16:53:18.6408242Z',
    title: 'Marked Google authentication as coming soon',
    summary: 'Disabled the Google continuation option on the shared login and sign-up screen and removed the unused Google sign-in explanation.',
    details: [
      'Changed the shared AuthScreen Google button to remain disabled for both login and sign-up modes and added an inline Coming soon badge to communicate its availability state.',
      'Removed the client-side Google OAuth click handler so a disabled control cannot initiate an authentication redirect until the feature is intentionally reintroduced.',
      'Removed the explanatory Google account/password paragraph while leaving the existing email/password login, registration, reset, Turnstile, and email-delivery flows unchanged.',
    ],
    impact: [
      'Users now see a clear Coming soon state instead of an actionable Google authentication option on both auth screens.',
      'Email/password authentication remains the only active authentication path in the current UI.',
    ],
    files: [
      'components/auth-screen.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint retained the repository\'s existing img-element warnings in profile-screen.tsx, public-profile-screen.tsx, and riftbound-compact-deck-view.tsx; typecheck passed; 63 tests passed across 20 test files.',
    ],
  },
  {
    id: 'patch-2026-08-26-beta-badge-optical-alignment',
    patch: '2026.08.26-beta-badge-optical-alignment',
    timestamp: '2026-08-26T03:11:29.8991072Z',
    title: 'Refined BETA badge alignment',
    summary: 'Applied a one-pixel optical adjustment so the compact BETA badge aligns more naturally with the KnowLeague lettering.',
    details: [
      'Shifted only the BETA badge down by one pixel while preserving the centered flex alignment of the brand title and the existing badge size, colors, border, and text.',
    ],
    impact: [
      'The BETA badge now sits more naturally against the visual center of the KnowLeague text at desktop and mobile header sizes.',
    ],
    files: [
      'components/app-header.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint retained the repository\'s existing img-element warnings in profile-screen.tsx, public-profile-screen.tsx, and riftbound-compact-deck-view.tsx; typecheck passed; 63 tests passed across 20 test files.',
    ],
  },
  {
    id: 'patch-2026-08-26-wide-medium-header-breakpoint',
    patch: '2026.08.26-wide-medium-header-breakpoint',
    timestamp: '2026-08-26T02:45:08.7016696Z',
    title: 'Extended the medium header breakpoint',
    summary: 'Kept compressed header controls active through 1679px and vertically centered the BETA badge to eliminate the remaining 1536px overlap.',
    details: [
      'Moved the full text-heavy header restoration from the 2xl breakpoint to the explicit 1680px breakpoint, keeping logout icon-only, Profile avatar-only, Friends icon-plus-count, compact navigation labels, and reduced spacing active below 1680px.',
      'Updated the responsive Friends control to use the same 1680px restoration threshold so its Friends text and full desktop sizing return at the same time as the other account controls.',
      'Changed the KnowLeague title wrapper from baseline alignment to centered flex alignment so the smaller BETA badge is vertically aligned with the brand text.',
    ],
    impact: [
      'The reported 1536/1537px viewport remains in the non-overlapping compressed header tier while the larger desktop layout still restores at 1680px and above.',
      'The home link, button actions, accessibility labels, and mobile behavior remain unchanged.',
    ],
    files: [
      'components/app-header.tsx',
      'components/friends-widget.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'Static review confirmed all prior 2xl header restoration classes now use min-[1680px] and the BETA wrapper uses items-center.',
      'npm run check passed: lint retained the repository\'s existing img-element warnings in profile-screen.tsx, public-profile-screen.tsx, and riftbound-compact-deck-view.tsx; typecheck passed; 63 tests passed across 20 test files.',
    ],
  },
  {
    id: 'patch-2026-08-25-responsive-header-medium-tier',
    patch: '2026.08.25-responsive-header-medium-tier',
    timestamp: '2026-08-25T23:18:33.8258272Z',
    title: 'Added a compressed medium header tier',
    summary: 'Prevented header controls from overlapping the centered KnowLeague title at medium desktop widths and added a BETA badge.',
    details: [
      'Introduced a responsive xl-to-2xl compression tier: logout and login controls become icon-only, Profile becomes avatar-only, and Friends remains icon plus online count until the full 2xl layout restores text labels.',
      'Reduced medium-width navigation/button padding and gaps while preserving the existing full desktop spacing at 2xl and above.',
      'Reduced the medium header title size and added a smaller BETA badge to the right of KnowLeague without changing the home link destination or accessible name.',
    ],
    impact: [
      'Medium desktop widths retain the full navigation and account functionality without the right-side controls covering the centered site title.',
      'Full desktop and mobile layouts retain their existing interaction model, with the BETA badge visible in both title presentations.',
      'Friends continues to expose its online count in the compressed tier, and all compressed controls retain accessible labels and existing actions.',
    ],
    files: [
      'components/app-header.tsx',
      'components/friends-widget.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'Static review confirmed the compressed classes apply only between the xl and 2xl Tailwind breakpoints and full 2xl sizing/text classes remain in place.',
      'npm run check passed: lint retained the repository\'s existing img-element warnings in profile-screen.tsx, public-profile-screen.tsx, and riftbound-compact-deck-view.tsx; typecheck passed; 63 tests passed across 20 test files.',
    ],
  },
  {
    id: 'patch-2026-08-25-header-custom-hover-notes',
    patch: '2026.08.25-header-custom-hover-notes',
    timestamp: '2026-08-25T20:23:41.9010416Z',
    title: 'Replaced native header hover notes',
    summary: 'Added the shared custom hover note treatment to the Sound, Help Center, and Discord header buttons.',
    details: [
      'Removed the browser title tooltip from the desktop header variants of Sound settings, Help Center, and Join Discord server while preserving their accessible aria-label values and existing click behavior.',
      'Added a reusable HeaderHoverNote component with the application border, dark surface, compact typography, hover visibility, and keyboard-focus visibility treatment.',
      'Kept the navigation, drawer, and other non-header variants scoped to their prior title behavior so their existing layouts and interaction contracts remain unchanged.',
    ],
    impact: [
      'Desktop header users now receive a consistent in-app hover note instead of browser-default tooltip styling for all three requested controls.',
      'Keyboard users see the same note on focus, while assistive technology continues to receive the button labels through aria-label.',
    ],
    files: [
      'components/header-hover-note.tsx',
      'components/app-header.tsx',
      'components/sound-settings-menu.tsx',
      'components/contact-us-widget.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'Static diff review confirmed title is omitted only for the three desktop header controls and the reusable tooltip uses role="tooltip" with hover and focus-within states.',
      'npm run check passed: lint retained the repository\'s existing img-element warnings in profile-screen.tsx, public-profile-screen.tsx, and riftbound-compact-deck-view.tsx; typecheck passed; 63 tests passed across 20 test files.',
    ],
  },
  {
    id: 'patch-2026-08-25-adsense-ads-txt',
    patch: '2026.08.25-adsense-ads-txt',
    timestamp: '2026-08-25T19:56:37.5837581Z',
    title: 'Added the AdSense ads.txt declaration',
    summary: 'Published the authorized Google seller record for the configured KnowLeague AdSense publisher account.',
    details: [
      'Added public/ads.txt with the Google DIRECT seller record for publisher ID pub-7559752825656959, matching the publisher ID already used by the shared AdSense script and verification metadata.',
      'Kept visible advertising disabled: this patch does not add ad units, enable Auto ads, or change the existing AdSense consent/review flow.',
    ],
    impact: [
      'Google can now discover the site\'s authorized AdSense seller declaration at the standard /ads.txt path, addressing the current Not found status after deployment and recrawl.',
      'The AdSense site remains in Google\'s Getting ready review state, and this file alone does not cause ads to appear before the site is approved or ad placements are enabled.',
    ],
    files: [
      'public/ads.txt',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'Confirmed the publisher ID matches app/layout.tsx\'s google-adsense-account metadata and pagead script client value.',
      'Repository check run after the file and changelog updates.',
    ],
  },
  {
    id: 'patch-2026-08-25-discord-header-style',
    patch: '2026.08.25-discord-header-style',
    timestamp: '2026-08-25T19:59:00.8930101Z',
    title: 'Matched Discord header button styling',
    summary: 'Updated the enabled Discord header button to use the same visible styling as the Sound and Help controls.',
    details: [
      'Changed the Discord icon button from muted slate styling to the shared visible header-icon border, background, text, and amber hover treatment used by Sound and Help.',
      'Preserved the existing Discord icon, accessible Join Discord server label, fixed invite destination, and new-tab security features.',
    ],
    impact: [
      'The Discord, Sound, and Help header controls now appear as one consistent visible support/control group.',
      'Users can still open the Discord server invite directly from the header without any change to navigation behavior.',
    ],
    files: [
      'components/app-header.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint retained the repository\'s existing image warnings, typecheck passed, and 63 tests passed across 20 test files.',
    ],
  },
  {
    id: 'patch-2026-08-25-discord-header-invite',
    patch: '2026.08.25-discord-header-invite',
    timestamp: '2026-08-25T19:50:38.8061246Z',
    title: 'Enabled the Discord server header invite',
    summary: 'Enabled the header Discord icon so users can join the configured KnowLeague Discord server.',
    details: [
      'Replaced the disabled coming-soon Discord header control with an active Join Discord server action.',
      'Configured the action to open https://discord.gg/vgMHq2KCsK in a new tab with noopener and noreferrer window features.',
      'Updated the accessible label and hover title to describe the join action while preserving the existing Discord icon and header styling.',
    ],
    impact: [
      'All header users can now open the KnowLeague Discord server invite directly from the Discord icon.',
      'The invite is a fixed application-owned destination and does not accept user-controlled redirect input.',
    ],
    files: [
      'components/app-header.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint retained the repository\'s existing image warnings, typecheck passed, and 63 tests passed across 20 test files.',
    ],
  },
  {
    id: 'patch-2026-08-25-skindle-champion-cell-height',
    patch: '2026.08.25-skindle-champion-cell-height',
    timestamp: '2026-08-25T05:29:29.3756558Z',
    title: 'Filled the Skindle Champion reveal cell',
    summary: 'Made the desktop Skindle Champion comparison card fill the full height of the guess row like the guess card.',
    details: [
      'Added explicit h-full sizing to the shared desktop category cells and the Champion grid wrapper so the Champion card stretches with the full reveal row instead of stopping at its min-h-28 minimum.',
      'Left the mobile category layout, reveal animation overlays, card content, and responsive grid columns unchanged.',
    ],
    impact: [
      'Desktop Skindle reveal rows now have a continuous full-height Champion card aligned with the Guess card and the surrounding comparison cells.',
      'Mobile Skindle cards retain their existing compact heights and layout behavior.',
    ],
    files: [
      'components/skindle.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'Visual layout fix applied from the supplied Skindle screenshot; npm run check passed with lint retaining the repository\'s existing image warnings, typecheck passing, and 63 tests passing across 20 test files.',
    ],
  },
  {
    id: 'patch-2026-08-24-api-abuse-hardening',
    patch: '2026.08.24-api-abuse-hardening',
    timestamp: '2026-08-24T20:57:07.4158941Z',
    title: 'Hardened API abuse controls and request parsing',
    summary: 'Audited the complete API surface and added centralized route-family rate limits plus bounded JSON request parsing for high-risk and previously broad endpoints.',
    details: [
      'Kept the existing global IP and bearer-subject middleware limits on all 156 API routes and added static route-family buckets for anonymous game submissions, game actions, account writes, social writes, expensive reads, public lobby discovery, privileged endpoints, and scheduled jobs.',
      'Excluded multiplayer heartbeat and progress endpoints from the additional game-action bucket so normal active-game synchronization keeps its existing throughput contract.',
      'Added a 4 MiB API request-body ceiling in middleware and a streaming readJsonBody implementation that enforces the same limit for chunked requests before JSON parsing; malformed JSON retains the existing empty-body behavior.',
      'Replaced every direct request.json call in app/api with the bounded shared parser and added a client identifier length bound to Splash Scramble anonymous stats submissions.',
      'Kept rate-limit keys aggregate and non-sensitive: route scopes are static, bearer subjects remain hashed, and no request body, query value, header, token, IP address, user ID, or dynamic identifier is stored by the policy layer.',
      'Reviewed authentication boundaries, service-role usage, route metrics coverage, validation, external-call surfaces, and existing route-specific limits across all API route files; no auth or multiplayer lifecycle contract was broadened.',
    ],
    impact: [
      'Anonymous result endpoints and authenticated game, account, social, staff, and cron mutations have bounded abuse budgets before handler work or external calls execute.',
      'Large JSON payloads cannot consume unbounded memory through direct or chunked request parsing; the existing Riftbound scan and Splash Scramble state-specific validation remains stricter than the shared ceiling.',
      'Normal page reads, active game heartbeats, multiplayer progress, authentication flows, and already stricter route-specific protections remain available under their existing limits.',
      'Staff API telemetry continues to receive only aggregate static route data and remains independent of request payload contents.',
    ],
    files: [
      'middleware.ts',
      'lib/abuse-controls.ts',
      'lib/api-utils.ts',
      'app/api/auth/email-delivery/route.ts',
      'app/api/auth/password-reset/authenticated/route.ts',
      'app/api/auth/signup/route.ts',
      'app/api/riot-account/search/route.ts',
      'app/api/skindle/stats/route.ts',
      'app/api/solo-quiz/attempt/route.ts',
      'app/api/solo-quiz/leaderboard/route.ts',
      'app/api/splash-scramble/leaderboard/route.ts',
      'app/api/splash-scramble/state/route.ts',
      'app/api/splash-scramble/stats/route.ts',
      'tests/abuse-controls.test.ts',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'Static security review completed: all 156 app/api route files were inventoried, all retained withApiMetrics coverage, existing route-specific limiters were catalogued, and every direct request.json call was replaced before repository checks.',
      'npm run check passed: lint completed with the repository\'s existing img-element warnings in profile-screen.tsx, public-profile-screen.tsx, and riftbound-compact-deck-view.tsx; typecheck passed; 63 tests passed across 20 test files.',
    ],
  },
  {
    id: 'patch-2026-08-24-navigation-misc-icon-alignment',
    patch: '2026.08.24-navigation-misc-icon-alignment',
    timestamp: '2026-08-24T20:04:48.830Z',
    title: 'Aligned responsive Miscellaneous icon controls',
    summary: 'Restored the Help Center icon-only treatment and placed all responsive Miscellaneous icon controls in one shared row.',
    details: [
      'Changed the responsive Miscellaneous layout so staff controls, Sound settings, and Help Center share one wrapping flex row instead of being split across separate rows.',
      'Restored Help Center to its original icon-only navigation presentation while retaining its accessible label and title for assistive technology and hover context.',
      'Kept the Sound and Help inline panels as order-two full-width flex items so opening a tab still places its content below the complete icon row.',
    ],
    impact: [
      'Responsive navigation users see a consistent single row of Miscellaneous icon buttons, including the Help Center message icon.',
      'The selected Sound or Help panel remains below the controls without changing the desktop header, drawer, or form behavior.',
    ],
    files: [
      'components/app-header.tsx',
      'components/contact-us-widget.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint completed with the repository existing img-element warnings, typecheck passed, and 57 tests passed across 19 test files; git diff --check completed with only existing LF-to-CRLF normalization warnings.',
    ],
  },
  {
    id: 'patch-2026-08-24-navigation-misc-icon-tabs',
    patch: '2026.08.24-navigation-misc-icon-tabs',
    timestamp: '2026-08-24T19:39:32.314Z',
    title: 'Restored icon-tab navigation for Sound and Help',
    summary: 'Kept Sound settings and Help Center as compact Miscellaneous icon controls while moving their content into a shared inline tab section below the icon row.',
    details: [
      'Changed the responsive navigation menu to keep Sound settings and Help Center as accessible icon-only controls with the same compact sizing and visual treatment as the other Miscellaneous actions.',
      'Added shared responsive-menu state so selecting Sound or Help opens one corresponding panel below the icon row, selecting the active icon closes it, and selecting the other icon switches panels.',
      'Added optional controlled open-state callbacks to the Sound settings and Help Center widgets while preserving their existing standalone floating, drawer, mobile, and desktop header behavior.',
      'Kept outside-click, Escape-key, report-form, form submission, sound preference persistence, and panel close behavior connected to the new controlled state.',
    ],
    impact: [
      'Mobile and responsive-menu users can access Sound settings and Help Center without large full-width controls taking over the Miscellaneous row.',
      'The selected panel stays inside the navigation surface and expands below the icon tabs instead of behaving like a nested popup.',
      'The desktop header controls, navigation ordering, Account/Friends removal, and existing settings/contact data flows remain unchanged.',
    ],
    files: [
      'components/app-header.tsx',
      'components/contact-us-widget.tsx',
      'components/sound-settings-menu.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint completed with the repository existing img-element warnings, typecheck passed, and 57 tests passed across 19 test files.',
    ],
  },
  {
    id: 'patch-2026-08-21-app-inactivity-throttling',
    patch: '2026.08.21-app-inactivity-throttling',
    timestamp: '2026-08-21T21:35:34.967Z',
    title: 'Paused non-game background polling during inactivity',
    summary: 'Added shared visibility, focus, and interaction tracking so non-game polling pauses after inactivity and resumes with a refresh, while active game and lobby behavior remains unchanged.',
    details: [
      'Added a client-safe app activity store with a five-minute inactivity timeout, immediate hidden or blurred-window suspension, meaningful-input reactivation, and a single scheduled timeout rather than a recurring activity poll.',
      'Changed the global authentication validation interval to skip inactive non-game pages and validate again when activity resumes; active game and lobby routes continue using their existing validation behavior.',
      'Changed multiplayer player-count polling to stop its interval while the app is inactive and perform one immediate refresh when the user returns; it remains limited to the existing optional Games-page feature.',
      'Guarded cumulative achievement queue retries and visible-time tracking so failed background submissions pause on inactive non-game pages and resume on activity, while active game routes remain exempt.',
      'Added regression coverage for visible/focused activity, hidden or blurred windows, exact timeout expiry, and future timestamps.',
    ],
    impact: [
      'Home, profile, and Riftbound-style non-game pages no longer keep optional polling active after five minutes without interaction or while hidden.',
      'Returning users receive fresh player-count data and a deferred session validation without changing multiplayer heartbeat, reconciliation, reconnect, or leave behavior.',
      'No request payloads, session tokens, user identifiers, or sensitive data are stored by the activity tracker.',
    ],
    files: [
      'components/global-actions.tsx',
      'components/multiplayer-player-count-badge.tsx',
      'components/cumulative-achievement-tracker.tsx',
      'lib/app-activity.ts',
      'lib/staff-changelog.ts',
      'tests/app-activity.test.ts',
    ],
    verification: [
      'npm run check passed: lint completed with the repository existing img-element warnings, typecheck passed, and 57 tests passed across 19 test files.',
      'Active multiplayer heartbeat and reconciliation components were not modified.',
    ],
  },
  {
    id: 'patch-2026-08-21-navigation-metrics-changelog-maintenance',
    patch: '2026.08.21-navigation-metrics-changelog-maintenance',
    timestamp: '2026-08-21T20:51:26.0823221Z',
    title: 'Improved navigation controls, API metrics sorting, and changelog maintenance',
    summary: 'Reorganized the responsive navigation menu, made API metric columns sortable, and documented the required workflow for keeping the staff change log current.',
    details: [
      'Moved the responsive Games menu View All link ahead of individual game links so the all-games destination is consistently first.',
      'Changed Sound settings and Help Center controls in the responsive navigation menu to render their panels inline within the menu flow, preventing overflow and positioning issues from nested popups.',
      'Removed the responsive navigation menu Account section and its Friends action; the standalone header Friends control remains unchanged.',
      'Added click sorting to every API metrics route-table header with accessible sort state and stable display-value comparisons for route, methods, request totals, client errors, server errors, and slow responses.',
      'Strengthened AGENTS.md so impactful patches update the version-controlled STAFF_CHANGELOG_ENTRIES array in the same change and newest entries remain first.',
    ],
    impact: [
      'Players can reach all games immediately and use Sound settings or Help Center without leaving the responsive navigation surface.',
      'Staff can inspect API metrics in the order most useful to an investigation by selecting any table header.',
      'Future agent-led impactful patches have an explicit, verifiable requirement to appear on the internal staff change-log page.',
    ],
    files: [
      'AGENTS.md',
      'components/app-header.tsx',
      'components/contact-us-widget.tsx',
      'components/sound-settings-menu.tsx',
      'components/staff-api-metrics-screen.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint completed with the repository existing img-element warnings, typecheck passed, and 54 tests passed across 18 test files.',
      'git diff --check passed; only the repository existing Git LF-to-CRLF normalization warnings were reported.',
    ],
  },
  {
    id: 'patch-2026-08-13-riftbound-binder-tools-and-sharing',
    patch: '2026.08.13-riftbound-binder-tools-and-sharing',
    timestamp: '2026-08-13T22:25:19.6348598Z',
    title: 'Added Riftbound binder tools, sharing, and responsive drag feedback',
    summary: 'Riftbound binders now provide immediate card placement feedback, edge-scrolling while dragging, low-rerender detail inputs, four persistent default binders, read-only share pages, print-ready page breaks, and binder JSON import/export.',
    details: [
      'Changed binder slot artwork to eager loading so newly placed cards mount immediately instead of waiting for the catalogue viewport observer; high-resolution artwork remains preferred and Next Image remains unoptimized.',
      'Added drag-over state to individual binder slots with amber border, background, and focus-ring feedback, and clear the highlight when the pointer leaves the slot or the drag ends.',
      'Changed catalogue drag snapping to scroll the document directly to the binder section, and added requestAnimationFrame-driven horizontal edge scrolling while any catalogue or binder card is held in the binder viewport; the scroll zone is the left and right 20 percent of the viewport and remains active while the pointer stays inside it.',
      'Moved the right-click page picker to a centered overlay on the catalogue card, retained the compact 4-by-5 page-number grid, and preserved click-away dismissal.',
      'Isolated binder name and description inputs in their own component so typing does not rerender the entire binder board on each keystroke.',
      'Changed binder provisioning to ensure every authenticated user has four persistent binders. The former New Binder action is replaced by Export / Import, and the reset control clears a binder back to its default name, description, page names, and empty slots rather than removing the binder record.',
      'Added binder JSON export/import validation for the format version, twenty pages, nine-slot bounds, known card IDs, supported finishes, and available destination slots; imports preserve page names and fill empty slots, reporting the exact no-empty-slots error when applicable.',
      'Added binder share snapshots to the compact durable share-key system with owner-aware deduplication, validation, public read access, and a dedicated read-only share view using the binder renderer without catalogue or edit controls.',
      'Added shared binder horizontal and paginated views, binder name/description metadata, a print action, and print CSS that renders every binder page as a separate PDF/page-break unit.',
      'Extended the shared snapshot kind constraint to include binder records through append-only migration 121.',
    ],
    impact: [
      'Binder placement feels immediate and visibly communicates the destination slot during drag operations.',
      'Users start with four reusable binders and can reset any binder without changing the stable binder set.',
      'Binders can be shared through short durable links, printed one page per binder page, exported, and imported without exposing editing controls to visitors.',
    ],
    files: [
      'app/api/riftbound/binders/route.ts',
      'app/globals.css',
      'components/riftbound-binder-board.tsx',
      'components/riftbound-binder-share.tsx',
      'components/riftbound-binder-tools-modal.tsx',
      'components/riftbound-collection-share.tsx',
      'components/riftbound-card-grid.tsx',
      'lib/riftbound-binder-json.ts',
      'lib/riftbound-share-types.ts',
      'lib/riftbound-shares.ts',
      'lib/riftbound-server.ts',
      'supabase/migrations/121_riftbound_binder_shares.sql',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npx supabase db push completed successfully and applied migration 121_riftbound_binder_shares.sql to the linked remote database.',
      'npm run check passed: lint completed with the repository\'s existing img-element warnings, typecheck passed, and 34 tests passed across 12 test files.',
      'git diff --check passed with only the repository\'s existing Git LF-to-CRLF normalization warnings.',
      'No production build was run because the request did not require one and the repository guidance reserves it for an explicitly stopped dev-server state.',
    ],
  },
  {
    id: 'patch-2026-08-10-api-metrics',
    patch: '2026.08.10-api-metrics',
    timestamp: '2026-08-10T20:16:51.763Z',
    title: 'Added staff-only aggregate API metrics',
    summary: 'Added lightweight per-route API telemetry and a staff dashboard for troubleshooting request volume, errors, and slow responses without retaining request data.',
    details: [
      'Wrapped all 142 current app/api route files with withApiMetrics and assigned each handler a static route template, preserving Next.js dynamic segment names such as [id] and [code] instead of recording runtime values.',
      'Recorded only method, 2xx/3xx/4xx/5xx status class, one of five duration buckets, and an incrementing count in hourly Upstash Redis hashes under the versioned metrics prefix.',
      'Applied a 35-day Redis key expiration and limited staff reporting windows to a maximum of seven days so the operational dataset remains bounded.',
      'Added the staff API metrics endpoint and dashboard with one-hour, 24-hour, and seven-day windows, route totals, method counts, error totals, and 1-second-plus response counts.',
      'Marked every staff metrics response private and no-store, including successful responses and authentication/authorization errors, to prevent intermediary caching of operational data.',
      'Added explicit privacy messaging and implementation rules prohibiting storage or display of request bodies, query values, headers, tokens, IP addresses, user IDs, and raw dynamic identifiers.',
      'Metrics write failures are swallowed so telemetry cannot change the API response or make a product endpoint unavailable.',
    ],
    impact: [
      'Moderator and admin staff can open API metrics from the header or mobile Miscellaneous navigation controls.',
      'Unauthenticated users and non-staff accounts receive no metrics data from the staff endpoint.',
      'Applications using the existing Upstash Redis environment variables receive aggregate telemetry; environments without those variables show a staff-only not-configured state.',
    ],
    files: [
      'lib/api-metrics.ts',
      'app/api/staff/api-metrics/route.ts',
      'app/staff/api-metrics/page.tsx',
      'components/staff-api-metrics-screen.tsx',
      'components/app-header.tsx',
      'AGENTS.md',
      'all app/api/**/route.ts handler exports',
    ],
    verification: [
      'npm run typecheck passed after all route wrappers were applied.',
      'npm run check passed: lint completed with the repository\'s existing img-element warnings, typecheck passed, and 34 tests passed across 12 test files.',
    ],
  },
  {
    id: 'patch-2026-08-10-lav-popularity-sharing-responsive',
    patch: '2026.08.10-lav-popularity-sharing-responsive',
    timestamp: '2026-08-10T21:36:50.0888194Z',
    title: 'Expanded League Account Viewer discovery and match sharing',
    summary: 'Added period-based popular-account rankings, official patch-note discovery, richer item tooltips, correct enemy-only rating summaries, shareable match links with deep-link scrolling, and a responsive match-history layout.',
    details: [
      'Removed the League Account Viewer card header Home control and added Most Popular Accounts and Patch Notes entries to the desktop LAV menu, mobile LAV menu, navigation drawer, and in-viewer tab navigation.',
      'Added a service-role-only daily search rollup and all-time aggregate table with an atomic record_riot_account_search RPC update, plus a bounded popularity RPC for day, seven-day, 30-day, and all-time top 10/25/50 results.',
      'Search counters now record successful viewer requests on memory-cache hits, durable snapshot hits, and fresh Riot loads; compressed profile snapshots continue to expire and scheduled-prune after 30 days of inactivity, while daily popularity rows are pruned after 400 days.',
      'Changed match-history Copy controls to Share controls with Web Share API support and clipboard fallback. Shared match URLs expand the target match and smoothly scroll it into view after the account data renders.',
      'Unknown queue matches no longer render the searched player position. Enemy-rank aggregation now explicitly excludes the searched player\'s team and the displayed weighted rank rounds upward into the displayed tier bucket, so three Challenger, one Grandmaster, and one Master enemies resolve to Challenger rather than Grandmaster.',
      'Extended Data Dragon item normalization with sanitized descriptions and short text, replacing native item title notes with keyboard-accessible custom hover/focus tooltips.',
      'Added a server-cached official League patch-note index endpoint and LAV tab; the UI lists discovered Riot releases and links to Riot for complete note content without duplicating long source articles.',
      'Reworked match participant rows and filter controls for small screens using responsive grid spans and shared AppSelectMenu controls while preserving desktop metrics and team sections.',
      'The new popularity migration was created locally and was not pushed to Supabase.',
    ],
    impact: [
      'Players can discover which accounts are currently searched most through KnowLeague and open a specific account directly from the ranking.',
      'Players sharing a match now get a true share action where supported, and recipients land at the shared match instead of the top of match history.',
      'Match history remains usable on narrow mobile screens, with item details available without browser-default hover notes.',
      'Search popularity retains one compact all-time aggregate per account/platform plus one compact row per account/platform/day; full profile payloads remain bounded by the existing 30-day snapshot retention policy.',
    ],
    files: [
      'components/riot-account-viewer.tsx',
      'components/app-header.tsx',
      'components/app-navigation-drawer.tsx',
      'lib/riot-account-viewer.ts',
      'app/api/riot-account/viewer/route.ts',
      'app/api/riot-account/popular/route.ts',
      'app/api/riot-account/patch-notes/route.ts',
      'supabase/migrations/112_riot_account_search_popularity.sql',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run typecheck passed.',
      'npm run lint passed with only the repository\'s existing img-element warnings in unrelated profile and Riftbound components.',
      'npm run test:run passed: 34 tests across 12 test files.',
      'git diff --check passed; only expected line-ending normalization warnings were reported by Git.',
    ],
  },
  {
    id: 'patch-2026-08-11-lav-standalone-discovery-pages',
    patch: '2026.08.11-lav-standalone-discovery-pages',
    timestamp: '2026-08-11T00:19:09.3826806Z',
    title: 'Moved LAV discovery views to standalone pages',
    summary: 'Separated Most Popular Accounts and Patch Notes from profile tabs and restored profile navigation to appear only while viewing an account.',
    details: [
      'Added /riot-account-viewer/popular and /riot-account-viewer/patch-notes pages with dedicated metadata and standalone responsive page shells.',
      'Moved the shared popularity and patch-note sections behind standalone page routes while preserving their existing API fetching, filters, official-source links, and fallback states.',
      'Removed both views from the ViewerTab union, tab definitions, URL tab validation, and profile content rendering.',
      'Restored the League Account Viewer profile tab navigation to render only when a Riot account profile is loaded.',
      'Updated desktop header menus, mobile header menus, and the navigation drawer to link directly to the new pages instead of profile query tabs.',
    ],
    impact: [
      'Players can open discovery and patch-note content without an account profile selected.',
      'Profile tabs now contain only Overview, Mastery Viewer, Match History, and Challenges.',
    ],
    files: [
      'app/riot-account-viewer/popular/page.tsx',
      'app/riot-account-viewer/patch-notes/page.tsx',
      'components/riot-account-viewer.tsx',
      'components/app-header.tsx',
      'components/app-navigation-drawer.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run typecheck passed.',
      'npm run lint passed with only the repository\'s existing img-element warnings in unrelated profile and Riftbound components.',
    ],
  },
  {
    id: 'patch-2026-08-11-lav-search-event-cache-tooltip-aer',
    patch: '2026.08.11-lav-search-event-cache-tooltip-aer',
    timestamp: '2026-08-11T00:49:26.7130289Z',
    title: 'Corrected LAV search events, item metadata, tooltips, and AER averaging',
    summary: 'Counted searches served from browser cache, made popularity failures visible, invalidated legacy item payloads, standardized LAV custom hover notes, and retained enemy-only AER without upward rounding.',
    details: [
      'Added a short-lived search-session dedupe key and POST /api/riot-account/search event path so browser sessionStorage hits are recorded as searches; viewer API hits use the same 30-second session/IP/account dedupe window to avoid duplicate counting from repeated requests.',
      'Added rate limiting and strict Riot ID/platform validation to the search-event route. Search-session identifiers are browser-scoped opaque values and are not stored in API metrics.',
      'Popularity RPC result parsing now accepts PostgreSQL bigint values returned as either JSON numbers or strings. Popularity database/RPC failures now return an explicit 503 setup message instead of silently rendering an empty ranking.',
      'Added item-detail freshness checks to browser session caches, server memory caches, and durable profile snapshots so legacy payloads without description/plaintext fields are refetched from Data Dragon.',
      'Replaced remaining native LAV title hover notes with the shared custom hover/focus tooltip treatment across AER, overview rankings, match metrics, champions, ranks, spells, runes, queue labels, actions, challenges, empty slots, and multikill badges.',
      'Kept AER restricted to participants on the opposing team while restoring ordinary weighted-average rank rounding.',
      'The Supabase popularity migration remains created locally and was not pushed.',
    ],
    impact: [
      'A search served from the browser profile cache now contributes to popularity, while rapid duplicate searches do not inflate counts.',
      'Users receive a visible setup error when popularity database objects are unavailable instead of a misleading empty state.',
      'Freshly loaded match data displays Data Dragon item descriptions and consistent custom hover notes throughout LAV.',
    ],
    files: [
      'components/riot-account-viewer.tsx',
      'lib/riot-account-viewer.ts',
      'app/api/riot-account/viewer/route.ts',
      'app/api/riot-account/popular/route.ts',
      'app/api/riot-account/search/route.ts',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run typecheck passed.',
      'npm run lint passed with only the repository\'s existing img-element warnings in unrelated profile and Riftbound components.',
    ],
  },
  {
    id: 'patch-2026-08-11-lav-profile-header-responsive-layout',
    patch: '2026.08.11-lav-profile-header-responsive-layout',
    timestamp: '2026-08-11T01:48:43.8886023Z',
    title: 'Stabilized the LAV profile header at responsive breakpoints',
    summary: 'Prevented the profile search controls from overlapping or allowing the Update action to escape the Riot ID field near the mobile/desktop breakpoint.',
    details: [
      'Changed the profile search grid to use a zero-minimum flexible Riot ID track and a bounded platform track, preserving explicit spacing before the Search action at narrower desktop widths.',
      'Made the Riot ID field wrapper and input explicitly block-level with min-width: 0 so the absolutely positioned Update control remains anchored inside the field instead of participating in layout flow.',
      'Made the profile summary card full-width below the desktop breakpoint and non-shrinking on larger layouts, while allowing the account title to truncate safely within the header row.',
      'Added whitespace and shrink protections to the Search action and min-width protection to the shared platform selector instance.',
    ],
    impact: [
      'Profile headers remain readable around tablet and narrow desktop widths without overlapping the platform selector, Search button, Update control, or last-updated timestamp.',
      'The mobile profile summary uses the available width without changing the account actions or search behavior.',
    ],
    files: [
      'components/riot-account-viewer.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint completed with the repository\'s existing img-element warnings, typecheck passed, and 34 tests passed across 12 test files.',
    ],
  },
  {
    id: 'patch-2026-08-11-lav-profile-header-normal-width-regression',
    patch: '2026.08.11-lav-profile-header-normal-width-regression',
    timestamp: '2026-08-11T16:42:08.3446656Z',
    title: 'Restored normal-width LAV header proportions',
    summary: 'Fixed the profile header regression where the Update control entered normal form flow and the custom platform selector overflowed into Search.',
    details: [
      'Removed the conflicting relative utility from absolutely positioned LAV controls; the Update action now uses a positioned wrapper for its custom hover note and remains anchored inside the Riot ID field.',
      'Restored the original large-screen form grid proportions of a flexible Riot ID field, 10rem platform selector, and auto-sized Search action.',
      'Applied min-width constraints to the LAV platform selector root and trigger so the custom AppSelectMenu truncates its selected label within the allocated column instead of expanding over Search.',
      'Removed the same relative/absolute conflict from the match champion-level badge so its responsive tooltip anchor remains positioned correctly.',
    ],
    impact: [
      'Normal-width profile headers retain the previous visual proportions while the existing stacked layout continues to reform below the large-screen breakpoint.',
      'The last-updated timestamp is no longer pushed underneath the Update control, and platform/Search controls remain separated.',
    ],
    files: [
      'components/riot-account-viewer.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint completed with the repository\'s existing img-element warnings, typecheck passed, and 34 tests passed across 12 test files.',
    ],
  },
  {
    id: 'patch-2026-08-11-lav-region-selector-fixed-width',
    patch: '2026.08.11-lav-region-selector-fixed-width',
    timestamp: '2026-08-11T16:46:06.6399447Z',
    title: 'Fixed LAV region selector width',
    summary: 'Reserved a fixed-width region selector column and allowed the Riot ID field to use the remaining header space.',
    details: [
      'Changed the large-screen profile search grid to use a minmax flexible Riot ID column, a fixed 12rem region selector column, and an auto-sized Search action.',
      'Applied a 12rem width to the LAV AppSelectMenu instance at the large-screen breakpoint while retaining the full-width stacked control below that breakpoint.',
      'The selected region label remains constrained within the fixed trigger instead of expanding into or overlapping the Search action.',
    ],
    impact: [
      'Region selection no longer changes the header geometry based on the selected option label length.',
      'The Riot ID search field becomes narrower as needed to preserve clean spacing between all controls.',
    ],
    files: [
      'components/riot-account-viewer.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint completed with the repository\'s existing img-element warnings, typecheck passed, and 34 tests passed across 12 test files.',
    ],
  },
  {
    id: 'patch-2026-08-11-lav-patch-note-details-search',
    patch: '2026.08.11-lav-patch-note-details-search',
    timestamp: '2026-08-11T17:16:49.6331297Z',
    title: 'Added cached patch-note details and change search',
    summary: 'Converted patch-note release rows into local detail views with official-source links, cached history navigation, and recent change search across champions, items, runes, systems, and game modes.',
    details: [
      'Normalized Riot release summaries into patch number, UTC publication date, article title, official URL, and safe article slug; the list now displays the requested patch/date/title format.',
      'Added /riot-account-viewer/patch-notes/[slug] with server-side cached article fetching, structured heading/paragraph/list extraction, a back-to-history control, and an official Riot patch-note button.',
      'Added a six-hour browser session cache for the patch history list so returning from a detail view does not issue another history API request; Riot listing and individual article fetches also use six-hour Next fetch revalidation.',
      'Added /riot-account-viewer/patch-notes/search and a rate-limited search API that checks the recent release set and returns matching section context and change excerpts for terms such as champions and items.',
      'The implementation does not persist full Riot article bodies in Supabase; detailed content is fetched on demand and served through public short-lived response caching.',
    ],
    impact: [
      'Users can read detailed patch changes inside KnowLeague while retaining a direct link to Riot as the official source.',
      'The patch history remains available through the back button without repeating the list request during the browser session cache lifetime.',
      'Users can search recent patch notes for specific champion, item, rune, system, and game-mode changes without manually opening each article.',
    ],
    files: [
      'lib/riot-account-viewer.ts',
      'components/riot-account-viewer.tsx',
      'app/api/riot-account/patch-notes/detail/route.ts',
      'app/api/riot-account/patch-notes/search/route.ts',
      'app/riot-account-viewer/patch-notes/[slug]/page.tsx',
      'app/riot-account-viewer/patch-notes/search/page.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run typecheck passed.',
      'Local patch-history API returned normalized 26.15 through 26.4 summaries.',
      'Local detail API returned Patch 26.15 with 377 parsed content blocks.',
      'Local search API returned matching Bel\'Veth and Riftmaker results across recent releases.',
      'npm run check passed: lint completed with the repository\'s existing img-element warnings, typecheck passed, and 34 tests passed across 12 test files.',
    ],
  },
  {
    id: 'patch-2026-08-11-lav-patch-search-inline-clear',
    patch: '2026.08.11-lav-patch-search-inline-clear',
    timestamp: '2026-08-11T17:38:42.2428522Z',
    title: 'Moved patch searching into the history screen',
    summary: 'Changed patch-note labels to use the full League of Legends Patch prefix and moved advanced change search inline with clear-and-restore behavior.',
    details: [
      'Patch release headings now begin with League of Legends Patch followed by the patch number, formatted UTC date, and article title.',
      'Added the change-search form directly to the main Patch Notes screen; successful results replace the release rows in place while the original history remains in the six-hour session cache.',
      'Added a Clear search action that clears the input, removes result cards and errors, and restores the cached patch release list without another history request.',
      'Changed the former standalone search route into a compatibility redirect to the main Patch Notes screen so there is only one user-facing search experience.',
    ],
    impact: [
      'Users can search and review targeted patch changes without navigating away from the patch history screen.',
      'Users can immediately return to the full release list with one clear action and no additional list API call.',
    ],
    files: [
      'components/riot-account-viewer.tsx',
      'app/riot-account-viewer/patch-notes/search/page.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run typecheck passed after the inline search and compatibility redirect changes.',
      'npm run check passed: lint completed with the repository\'s existing img-element warnings, typecheck passed, and 34 tests passed across 12 test files.',
    ],
  },
  {
    id: 'patch-2026-08-11-lav-title-and-runtime-optimization-pass',
    patch: '2026.08.11-lav-title-and-runtime-optimization-pass',
    timestamp: '2026-08-11T19:06:10.4773836Z',
    title: 'Restored patch release titles and optimized LAV delivery',
    summary: 'Restored RiotÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢s descriptive patch-release titles and reduced repeat parsing, duplicate requests, unnecessary image transformation work, and client-side patch-search races across the League Account Viewer.',
    details: [
      'Extended RiotPatchNoteSummary with a nullable descriptive title field parsed from the official release-list anchor while preserving normalized patch number, UTC publication date, article title, canonical href, and safe slug metadata. Patch list and search headings now render the descriptive release title after the requested League of Legends Patch/date prefix; the browser session-cache key was versioned so older incomplete summaries are not reused.',
      'Added bounded 15-minute server memoization and in-flight request deduplication for the Riot patch summary list and individual parsed article details, plus five-minute normalized-query memoization and in-flight deduplication for patch change searches. Existing six-hour Next fetch revalidation and short public response cache headers remain in place as the cross-instance cache layer.',
      'Kept the account-viewer response private and no-store, but removed client IP values from rate-limit and error telemetry payloads so API metrics remain aggregate-only. Profile analytics persistence is now best-effort and does not hold the primary Riot data response open.',
      'Converted the local LAV mastery crest and level-plate image elements to next/image with fixed dimensions, while retaining direct delivery for small immutable Data Dragon and CommunityDragon icons through the shared GameIconImage unoptimized contract. Added browser content-visibility for long patch detail bodies and abortable inline patch searches to prevent stale results and reduce offscreen rendering work.',
    ],
    impact: [
      'Patch history rows once again show RiotÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢s descriptive release tagline instead of repeating the generic ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œLeague of Legends Patch X NotesÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â label.',
      'Repeated patch history, detail, and search requests can reuse parsed server data without refetching or reparsing the same content within the bounded TTLs; concurrent requests for the same resource share one promise.',
      'LAV account payloads remain protected from shared HTTP caching, while non-sensitive patch-note content continues to use public caching. Small remote game icons avoid unnecessary Vercel transformation variants and local mastery assets now use the framework image pipeline.',
    ],
    files: [
      'lib/riot-account-viewer.ts',
      'components/riot-account-viewer.tsx',
      'app/api/riot-account/viewer/route.ts',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run typecheck passed after the title parser, patch caches, image conversion, telemetry, and client request-cancellation changes.',
      'Local patch-history API returned descriptive titles for Patch 26.15 through Patch 26.4; the first description contained proper U+2019 apostrophe and U+2026 ellipsis characters.',
      'Local Patch 26.15 detail API returned a null list description, the normalized article title, and 377 parsed content blocks.',
      'npm run check passed: lint completed with the repository\'s existing img-element warnings in profile/public-profile/Riftbound surfaces, typecheck passed, and 34 tests passed across 12 test files.',
    ],
  },
  {
    id: 'patch-2026-08-11-profile-achievement-social-auth-polish',
    patch: '2026.08.11-profile-achievement-social-auth-polish',
    timestamp: '2026-08-11T19:57:37.0589461Z',
    title: 'Polished profile requests, achievement notifications, and auth transitions',
    summary: 'Removed obsolete profile back controls, repositioned achievement toasts below the global header, added event-driven staff-grant notifications and request blocking, preserved safe post-login destinations, and gated the initial shell on auth resolution.',
    details: [
      'Removed the owner and visitor profile header back buttons while preserving the existing profile tab and navigation behavior.',
      'Moved achievement notifications below the 56px sticky header and added a user-scoped Supabase Realtime subscription for completed achievement rows, including staff-granted achievements; notification keys prevent duplicate local/Realtime toasts.',
      'Added the user_achievements Realtime publication migration without applying or pushing it to Supabase; row delivery remains restricted by the existing authenticated self-read policy.',
      'Added incoming friend-request controls beside Friends > Add Friend when requests exist, with accept, decline, profile-view, and block actions; the profile request popup remains available and now offers the same block behavior and profile chat-color/avatar presentation.',
      'Extended the friend dashboard requester projection with the profile fields required for consistent request styling, while reusing the existing authenticated block endpoint that cancels pending requests and removes friendships.',
      'Centralized session-storage return-path capture for login links, excluding login/reset/API and active-game routes; password, OAuth, and confirmed-email flows now return to the last eligible page or the home page fallback.',
      'Held the application shell behind an auth-resolution loading state until the shared Supabase initial session callback completes, preventing a transient logged-out header during first load.',
    ],
    impact: [
      'Users no longer see an obsolete profile back button, header-overlapped achievement toast, or transient logged-out account controls during initial session resolution.',
      'Online recipients see a staff-granted achievement toast through one filtered Realtime channel without periodic polling or additional request volume; the migration must be applied before production Realtime delivery is active.',
      'Users can process or block incoming friend requests from either the profile page or the global friends menu, and login returns them to eligible content such as the Riftbound community hub while avoiding active-game restoration.',
      'Staff retain the existing grant/revoke workflow; the change only adds recipient-side notification delivery and does not expose staff actions or service-role data to clients.',
    ],
    files: [
      'app/layout.tsx',
      'components/auth-screen.tsx',
      'components/achievement-toasts.tsx',
      'components/friends-widget.tsx',
      'components/global-actions.tsx',
      'components/profile-screen.tsx',
      'components/public-profile-screen.tsx',
      'lib/achievement-client.ts',
      'lib/auth-redirect.ts',
      'lib/friends.ts',
      'supabase/migrations/113_user_achievements_realtime.sql',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run typecheck passed.',
      'npm run lint passed with the repository\'s existing img-element warnings in profile/public-profile/Riftbound surfaces.',
      'npm run test:run passed: 34 tests across 12 test files.',
      'Supabase migration was created locally and was not pushed, as requested by the repository migration safety guidance.',
    ],
  },
  {
    id: 'patch-2026-08-11-profile-unblock-search-status',
    patch: '2026.08.11-profile-unblock-search-status',
    timestamp: '2026-08-11T20:17:49.8319260Z',
    title: 'Added profile unblocking and blocked-user search status',
    summary: 'Added an authenticated unblock action to the visitor profile menu and server-provided blocked indicators to Friends user search results.',
    details: [
      'Added DELETE /api/users/[id]/block with the same aggregate API metric route template as the existing block endpoint; it deletes only the authenticated viewer\'s block relationship and never accepts a blocker identity from the client.',
      'Extended public profile relationship data with blockedByViewer so the visitor menu shows Unblock User only when the current viewer owns the block; blocks created by the other user remain non-actionable.',
      'Added server-side blocked relationship lookup to friend candidate search and rendered a CircleSlash2 indicator beside blocked usernames, with blocked candidates no longer offering friend-request actions.',
      'Preserved the existing block cleanup behavior for friendships and pending requests; unblocking does not automatically recreate a friendship or prior request.',
    ],
    impact: [
      'Users can reverse their own profile blocks directly from the visitor-view triple-dot menu.',
      'Friends search clearly identifies blocked users and avoids presenting an Add Friend action that the block relationship would reject.',
      'The block direction is explicit in the profile response, preventing a user from being shown an unblock action for a block placed by someone else.',
    ],
    files: [
      'app/api/profile/public/[username]/route.ts',
      'app/api/users/[id]/block/route.ts',
      'components/friends-widget.tsx',
      'components/public-profile-screen.tsx',
      'lib/friends.ts',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint completed with the repository\'s existing img-element warnings, typecheck passed, and 34 tests passed across 12 test files.',
    ],
  },
  {
    id: 'patch-2026-08-11-compact-friend-request-popups',
    patch: '2026.08.11-compact-friend-request-popups',
    timestamp: '2026-08-11T20:23:44.3372061Z',
    title: 'Compacted incoming friend-request popups',
    summary: 'Changed profile and friends-menu incoming friend requests to single-line horizontal items and added explicit bounded scrolling for large request lists.',
    details: [
      'Converted each profile-page request item from a stacked name/actions layout to a non-wrapping horizontal row with compact requester identity and action controls.',
      'Converted each global friends-menu request item to the same single-line layout while retaining horizontal scrolling on narrow viewports instead of increasing item height.',
      'Added explicit max-height and vertical scrolling to the friends-menu incoming-request list, and tightened the profile request popup max-height while preserving vertical scrolling.',
    ],
    impact: [
      'Incoming requests consume substantially less vertical space and multiple requests no longer push the primary friends content down as quickly.',
      'Long request rows remain accessible on small screens through horizontal scrolling without causing the popup to overflow the viewport.',
    ],
    files: [
      'components/friends-widget.tsx',
      'components/profile-screen.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint completed with the repository\'s existing img-element warnings, typecheck passed, and 34 tests passed across 12 test files.',
    ],
  },
  {
    id: 'patch-2026-08-11-align-friend-request-actions',
    patch: '2026.08.11-align-friend-request-actions',
    timestamp: '2026-08-11T20:29:17.0437326Z',
    title: 'Aligned friend-request actions across menus',
    summary: 'Right-aligned incoming friend-request actions in both request surfaces and matched the profile request popup to the Friends menu styling.',
    details: [
      'Made requester identity content flexible and kept View, Accept, Decline, and Block controls in a non-wrapping action group aligned to the right edge of each request row.',
      'Updated the profile request popup to use the Friends menu amber request panel, heading, bounded request-list wrapper, row spacing, and matching control styles.',
      'Expanded the profile request popup width up to 42rem on larger screens so the complete single-line action group can remain visible while preserving viewport-bounded horizontal scrolling on narrow screens.',
    ],
    impact: [
      'The two incoming-request experiences now have consistent visual hierarchy and interaction placement.',
      'Requester names retain available flexible space while actions remain easy to scan and operate at the right side of each row.',
    ],
    files: [
      'components/friends-widget.tsx',
      'components/profile-screen.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint completed with the repository\'s existing img-element warnings, typecheck passed, and 34 tests passed across 12 test files.',
    ],
  },
  {
    id: 'patch-2026-08-11-neutral-profile-request-popup',
    patch: '2026.08.11-neutral-profile-request-popup',
    timestamp: '2026-08-11T20:31:47.4089188Z',
    title: 'Neutralized profile request popup styling',
    summary: 'Changed the profile-page incoming friend-request popup from amber styling to a solid dark panel with a neutral heading while leaving the Friends menu treatment unchanged.',
    details: [
      'Replaced the profile request popup amber border and translucent amber background with the standard solid slate panel and neutral border used by profile overlays.',
      'Changed the profile request section heading from amber text to neutral slate text; request rows and action controls remain consistent with the Friends menu.',
    ],
    impact: [
      'The profile request popup now has stronger contrast against the profile page and does not visually compete with the amber profile navigation state.',
      'The global Friends menu retains its existing amber request emphasis.',
    ],
    files: [
      'components/profile-screen.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint completed with the repository\'s existing img-element warnings, typecheck passed, and 34 tests passed across 12 test files.',
    ],
  },
  {
    id: 'patch-2026-08-11-riftbound-current-prices-archive-profile-navigation',
    patch: '2026.08.11-riftbound-current-prices-archive-profile-navigation',
    timestamp: '2026-08-11T21:22:49.9526023Z',
    title: 'Unified Riftbound current values, profiles, and community moderation',
    summary: 'Fixed Riftbound current-value resolution and profile collection consistency, added profile tab history and post return routing, restored post author names, added staff archiving, and reduced offscreen card-image work on mobile.',
    details: [
      'Changed latest market-price merging so nullable values from a captured per-card snapshot remain authoritative instead of falling back to generated catalogue or acquisition-time values; updated the latest-price RPC and legacy fallback to select the newest row independently for every card and finish.',
      'Returned the complete profile collection from the same riftbound_inventory dataset used by inventory, removed the profile-only 96-card truncation, returned current per-card prices in the profile payload, and used those prices for collection value and card previews.',
      'Added the inventory-style rarity breakdown and rarity filtering controls to Riftbound profiles without exposing inventory value history or scan-card actions.',
      'Added visible author display names and @usernames to Riftbound community post cards and post details, applying the saved chat-name color snapshot while retaining existing comment styling.',
      'Added staff-authorized archive actions with confirmation, server-side role enforcement, an archived visibility constraint/index, staff-only archived feed/detail/comment access, and normal-user hiding for archived posts.',
      'Added URL-backed Riftbound profile tabs with pushState and popstate synchronization for owner and visitor views; profile post links now carry a validated return path to the profile posts tab.',
      'Deferred offscreen Riftbound card-art network loads until cards approach the viewport, preserving card layout while reducing initial image requests and decoding pressure on narrow/mobile devices.',
      'The two database migrations were created locally and were not pushed to Supabase.',
    ],
    impact: [
      'Collection cards now display the latest captured normal and foil values, including N/A when the current source has no value, rather than stale generated catalogue values.',
      'Riftbound inventory and public/owner profile collection views now reflect the same server inventory rows and current-value data.',
      'Moderators and admins can archive posts from the existing triple-dots menu; archived posts remain available to staff for review but are hidden from ordinary users.',
      'Visitors can use browser back/forward and refresh on profile tabs without losing the selected Riftbound profile section.',
    ],
    files: [
      'lib/riftbound.ts',
      'lib/riftbound-server.ts',
      'lib/riftbound-community.ts',
      'lib/riftbound-community-types.ts',
      'lib/riftbound-community-client.ts',
      'components/riftbound-profile.tsx',
      'components/riftbound-card-image.tsx',
      'components/riftbound-community-post-card.tsx',
      'components/riftbound-community-post.tsx',
      'app/api/riftbound/community/feed/route.ts',
      'app/api/riftbound/community/posts/[postId]/route.ts',
      'app/api/riftbound/community/posts/[postId]/comments/route.ts',
      'app/riftbound/community/[postId]/page.tsx',
      'supabase/migrations/114_riftbound_post_archiving.sql',
      'supabase/migrations/115_riftbound_latest_price_per_card.sql',
      'tests/riftbound.test.ts',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint completed with the repository\'s existing img-element warnings, typecheck passed, and 34 tests passed across 12 test files.',
      'git diff --check passed with only the repository\'s existing Git LF-to-CRLF normalization warnings.',
      'No production build was run because the request did not require one and the repository guidance reserves it for an explicitly stopped dev-server state.',
    ],
  },
  {
    id: 'patch-2026-08-12-riftbound-post-ownership-image-virtualization',
    patch: '2026.08.12-riftbound-post-ownership-image-virtualization',
    timestamp: '2026-08-12T01:14:02.8264588Z',
    title: 'Expanded Riftbound archive ownership and viewport image lifecycle',
    summary: 'Removed redundant @username text, moved post tags beside titles, added owner archive/unarchive controls with staff-origin protection, and unloaded Riftbound artwork when collection cards leave the viewport.',
    details: [
      'Post cards and post details now show the styled display name without an additional @username label; post detail tags remain visible beside the title while the author and creation date stay in metadata below.',
      'Added archive actor metadata, staff-origin state, and original-visibility restoration fields so owner archives can be unarchived by the owner while staff-archived posts remain owner-visible but can only be unarchived by staff.',
      'Added owner and staff archive/unarchive authorization in the API and service layer, preserving public, friends, or unlisted visibility when a post is restored; existing archived rows are treated as staff-archived during migration.',
      'Included archived posts in the author profile only for the owner or staff viewers; ordinary visitors do not receive archived profile posts.',
      'Replaced per-image one-way loading with a shared IntersectionObserver that mounts card art only while it intersects the viewport and removes the image element after it leaves.',
      'The archive ownership migration was created locally and was not pushed to Supabase.',
    ],
    impact: [
      'Post owners can make their own posts private and later restore them unless staff performed the archive; staff retain moderation control over staff-archived posts.',
      'Owners can still see their staff-archived posts in their profile, while visitors cannot; staff can see archived posts in profiles and the community feed.',
      'Large Riftbound collections keep their card layout while reducing active artwork nodes, image decoding, and retained offscreen image elements on mobile devices.',
    ],
    files: [
      'components/riftbound-community-post.tsx',
      'components/riftbound-community-post-card.tsx',
      'components/riftbound-card-image.tsx',
      'lib/riftbound-community-types.ts',
      'lib/riftbound-community.ts',
      'lib/riftbound-community-client.ts',
      'app/api/riftbound/community/posts/[postId]/route.ts',
      'app/api/riftbound/profile/route.ts',
      'app/api/riftbound/profiles/[username]/route.ts',
      'supabase/migrations/116_riftbound_post_archive_ownership.sql',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run typecheck passed after the archive ownership, profile visibility, post UI, and image lifecycle changes.',
      'npm run check passed: lint completed with the repository\'s existing img-element warnings, typecheck passed, and 34 tests passed across 12 test files.',
      'No production build was run because the request did not require one and the repository guidance reserves it for an explicitly stopped dev-server state.',
    ],
  },
  {
    id: 'patch-2026-08-12-riftbound-archived-post-badge',
    patch: '2026.08.12-riftbound-archived-post-badge',
    timestamp: '2026-08-12T02:14:33.8697291Z',
    title: 'Added archived post badges',
    summary: 'Archived Riftbound posts now display an Archived badge beside their post-type tag in both feed cards and post detail headers.',
    details: [
      'Added a neutral Archived badge beside the existing General, Question, Deck Build, and other post-type tags when the post visibility is archived.',
      'Applied the same badge treatment to community feed cards and the full post detail header so staff and owners can identify archived content consistently.',
    ],
    impact: [
      'Staff and post owners can immediately distinguish archived posts from active posts without opening moderation controls.',
      'Visitors do not receive archived posts through normal community/profile reads, so the badge only appears where archived content is authorized for viewing.',
    ],
    files: [
      'components/riftbound-community-post.tsx',
      'components/riftbound-community-post-card.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint completed with the repository\'s existing img-element warnings, typecheck passed, and 34 tests passed across 12 test files.',
    ],
  },
  {
    id: 'patch-2026-08-12-riftbound-market-cache-and-missing-price-fallback',
    patch: '2026.08.12-riftbound-market-cache-and-missing-price-fallback',
    timestamp: '2026-08-12T17:18:52.3739367Z',
    title: 'Removed stale Riftbound market-value cache and catalogue fallback',
    summary: 'Fixed production collection values that could remain at catalogue/acquisition-time prices by bypassing stale browser responses and treating absent current snapshots as unavailable.',
    details: [
      'Versioned the latest-price client request, switched it from force-cache to no-store, and changed the latest-price API response to private no-store so an older browser response cannot survive as the current market payload.',
      'Updated latest-price invalidation to use the versioned client cache key.',
      'Added an explicit latest-prices-ready state to inventory and collection-share views; after a current payload loads, cards missing from that payload are merged with null normal/foil values instead of retaining generated catalogue values.',
      'Applied the same authoritative missing-price behavior to Riftbound profile card maps and collection value calculations.',
      'Ran npx supabase db push; the linked remote database reported that it was already up to date, including the per-card latest-price migration.',
    ],
    impact: [
      'Existing signed-in browsers no longer reuse an older latest-price response for Riftbound market values.',
      'A card without a captured current snapshot displays N/A rather than a misleading value from the catalogue or the time it was added.',
      'Cards with current snapshot rows continue to display the latest normal and foil values, including independently captured rows per card and finish.',
    ],
    files: [
      'lib/riftbound-client.ts',
      'app/api/riftbound/prices/latest/route.ts',
      'components/riftbound-card-grid.tsx',
      'components/riftbound-collection-share.tsx',
      'components/riftbound-profile.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint completed with the repository\'s existing img-element warnings, typecheck passed, and 34 tests passed across 12 test files.',
      'npx supabase db push completed successfully and reported the remote database was up to date.',
    ],
  },
  {
    id: 'patch-2026-08-12-riftbound-threaded-comments-profile-stats-catalogue-layout',
    patch: '2026.08.12-riftbound-threaded-comments-profile-stats-catalogue-layout',
    timestamp: '2026-08-12T18:04:37.1340122Z',
    title: 'Added Riftbound threaded comment interactions and responsive catalogue refinements',
    summary: 'Prevented anonymous-first archived-post fetches, added nested comment replies and reactions, exposed profile post favor statistics, removed duplicate basic rune clutter from the global catalogue, and reflowed the collection breakdown at medium widths.',
    details: [
      'Post detail, comments, and moderation-role requests now wait for the shared auth session to resolve, preventing the initial anonymous 404 for owner/staff archived posts and avoiding the associated duplicate post/comment request sequence.',
      'Added direct comment reply loading with visible reply counts, collapsed-by-default threads, ten-reply pages, Show More pagination, inline reply editors, per-comment like/dislike controls, and recursive support for replies to sub-comments.',
      'Added service-backed comment reaction counters and viewer reaction state with an atomic Supabase RPC and a metrics-wrapped reaction API route; comment bodies continue through the shared chat sanitizer.',
      'Added independent desktop comment columns using balanced content estimates while preserving a single mobile column; individual comment heights do not synchronize across columns.',
      'Added profile post count and net received favor (likes minus dislikes), excluding removed content and only including archived content for an owner or staff viewer.',
      'The global Riftbound catalogue now keeps OGN basic runes while omitting duplicate Common Basic runes from later sets; inventory and set-specific views retain their source card data.',
      'Collection breakdown controls now stack and wrap through medium widths and reserve the compact single-row layout for large displays.',
      'Applied supabase/migrations/117_riftbound_comment_reactions_and_threads.sql to the linked remote database with npx supabase db push.',
    ],
    impact: [
      'Owners and staff can open archived post details without the transient not-found response, while ordinary visitor visibility rules remain unchanged.',
      'Users can reply to and react to every visible comment level, with threads initially collapsed and bounded reply batches to keep post pages responsive.',
      'Riftbound profiles show the requested Posts and Favor summary beneath the joined date.',
      'The global card catalogue is less repetitive for basic runes and the inventory breakdown remains usable on tablets and medium desktop widths.',
    ],
    files: [
      'components/riftbound-community-post.tsx',
      'components/riftbound-card-grid.tsx',
      'components/riftbound-profile.tsx',
      'lib/riftbound-community-types.ts',
      'lib/riftbound-community-client.ts',
      'lib/riftbound-community.ts',
      'app/api/riftbound/community/posts/[postId]/comments/route.ts',
      'app/api/riftbound/community/posts/[postId]/comments/[commentId]/reaction/route.ts',
      'supabase/migrations/117_riftbound_comment_reactions_and_threads.sql',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint completed with the repository\'s existing img-element warnings, typecheck passed, and 34 tests passed across 12 test files.',
      'npx supabase db push completed successfully and applied migration 117 to the linked remote database.',
      'git diff --check passed with only the repository\'s existing Git LF-to-CRLF normalization warnings.',
      'No production build was run because the request did not require one and the repository guidance reserves it for an explicitly stopped dev-server state.',
    ],
  },
  {
    id: 'patch-2026-08-12-riftbound-flat-comment-references-relative-time-favor',
    patch: '2026.08.12-riftbound-flat-comment-references-relative-time-favor',
    timestamp: '2026-08-12T19:26:48.1045396Z',
    title: 'Reworked Riftbound comment layout, timestamps, descendant counts, and Favor totals',
    summary: 'Riftbound community comments now render as individual flat cards with clickable reply references, dates use relative time labels, reply counts include all descendants, and profile Favor includes net reactions received by comments and replies.',
    details: [
      'Replaced horizontal-separator and nested-tree styling with one bordered comment card per visible comment in a single vertical list across screen sizes.',
      'Replies now show a compact Replying to user reference; selecting it smoothly scrolls to the referenced comment and highlights it temporarily.',
      'Preserved collapsed reply loading and ten-at-a-time pagination while flattening the visible result order so deeper replies do not create nested visual panels.',
      'Changed community post detail, community post preview cards, and comment timestamps to relative labels such as just now, 5 minutes ago, 2 days ago, and 7 months ago.',
      'Changed comment reply-count calculation to walk the complete visible descendant graph, so each comment count includes direct replies and all deeper replies beneath them.',
      'Profile Favor now combines post net reactions and net reactions on all visible comments authored by the profile, including sub-comments; removed-post content is excluded and archived content follows the existing owner/staff visibility rule.',
      'Invalidated cached Riftbound profile payloads after post reactions, comment creation, and comment reactions so profile post/favor totals refresh on subsequent navigation.',
    ],
    impact: [
      'Community posts are easier to scan vertically and reply relationships remain discoverable without a visually indented tree.',
      'Users can quickly identify when content was posted and jump directly to the comment being referenced.',
      'The profile Favor value reflects reactions received across the userÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢s posts and authored comment threads.',
    ],
    files: [
      'components/riftbound-community-post.tsx',
      'components/riftbound-community-post-card.tsx',
      'lib/relative-time.ts',
      'lib/riftbound-community.ts',
      'lib/riftbound-community-client.ts',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint completed with the repository\'s existing img-element warnings, typecheck passed, and 34 tests passed across 12 test files.',
      'git diff --check passed with only the repository\'s existing Git LF-to-CRLF normalization warnings.',
      'No production build was run because the request did not require one and the repository guidance reserves it for an explicitly stopped dev-server state.',
    ],
  },
  {
    id: 'patch-2026-08-12-riftbound-comment-columns-inline-replies-optimistic-reactions',
    patch: '2026.08.12-riftbound-comment-columns-inline-replies-optimistic-reactions',
    timestamp: '2026-08-12T19:48:37.8046785Z',
    title: 'Restored Riftbound comment columns and inline reply threads',
    summary: 'Large Riftbound post views now use two independent comment columns with bordered root cards and inline flattened reply lists, while comment reactions behave optimistically like post reactions.',
    details: [
      'Restored the two-column desktop comment layout with balanced root-comment assignment and independent column heights; mobile remains a single column.',
      'Root comments retain their own rounded border; replies render inside the root container with horizontal separators and no visual tree indentation.',
      'Reply loading now returns the first ten visible descendants of a root comment as one flat page, allowing replies to sub-comments to appear in the same root container; Show More continues from the root thread cursor.',
      'Removed View Comments controls from sub-comments while retaining their Reply, Like, and Dislike actions and Replying to references.',
      'Comment and sub-comment reactions now update selected state and counts immediately, queue the server mutation in the background, and reconcile or roll back silently without a reaction loading indicator.',
    ],
    impact: [
      'Desktop users regain the denser two-column post discussion layout without linking card heights between columns.',
      'All loaded replies remain visually grouped with their original comment and nested reply relationships are represented only by Replying to references.',
      'Comment interactions feel immediate and match the existing post reaction behavior.',
    ],
    files: [
      'components/riftbound-community-post.tsx',
      'lib/riftbound-community.ts',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint completed with the repository\'s existing img-element warnings, typecheck passed, and 34 tests passed across 12 test files.',
      'No production build was run because the request did not require one and the repository guidance reserves it for an explicitly stopped dev-server state.',
    ],
  },
  {
    id: 'patch-2026-08-12-riftbound-durable-short-key-shares',
    patch: '2026.08.12-riftbound-durable-short-key-shares',
    timestamp: '2026-08-12T20:37:33.3095892Z',
    title: 'Moved Riftbound collection, set, and deck shares to durable short-key records',
    summary: 'Riftbound share creation now stores a validated immutable snapshot in Supabase and uses a 12-character opaque key in the share page URL and deck QR code instead of packing the snapshot into the URL.',
    details: [
      'Added the riftbound_shared_snapshots table with owner tracking, share kind/title metadata, immutable JSONB payloads, recent/owner indexes, service-role-only grants, and RLS enabled with no direct anonymous or authenticated table access.',
      'Added POST /api/riftbound/shares and GET /api/riftbound/shares/[shareKey] handlers with static API metrics templates, IP/subject rate limits, public read caching, opaque cryptographically random keys, and server-side payload validation against the local Riftbound catalogue.',
      'Validated share snapshots allow collection, set, and deck rows with supported card IDs, finishes, categories, and bounded quantities; payloads are limited to 512 KB and contain only compact card/metadata data, not image assets or market snapshots.',
      'Changed inventory collection/set/deck sharing, inventory compact deck QR generation, and profile deck sharing to create and open /riftbound/inventory/share/[shareKey] URLs.',
      'Preserved the existing shared-deck reaction/save registration path for deck snapshots while removing the generated client-side binary URL creation from new share actions.',
      'Share records do not expire, allowing older copied links to continue loading; public responses can be cached for five minutes to reduce repeated database reads.',
    ],
    impact: [
      'Copied collection, set, and deck links are short enough for practical messaging and QR scanning regardless of snapshot size.',
      'Shared snapshots remain available after the original inventory or deck changes because they are immutable records.',
      'Storage cost is proportional to snapshot metadata/card rows rather than images; catalogue images and current market values continue to load from existing application sources.',
    ],
    files: [
      'app/api/riftbound/shares/route.ts',
      'app/api/riftbound/shares/[shareKey]/route.ts',
      'app/riftbound/inventory/share/[shareKey]/page.tsx',
      'components/riftbound-card-grid.tsx',
      'components/riftbound-collection-share.tsx',
      'components/riftbound-profile.tsx',
      'lib/riftbound-community-client.ts',
      'lib/riftbound-share-client.ts',
      'lib/riftbound-share-types.ts',
      'lib/riftbound-shares.ts',
      'supabase/migrations/118_riftbound_shared_snapshots.sql',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint completed with the repository\'s existing img-element warnings, typecheck passed, and 34 tests passed across 12 test files.',
      'npx supabase db push completed successfully and applied migration 118_riftbound_shared_snapshots.sql to the linked remote database.',
      'git diff --check passed with only the repository\'s existing Git LF-to-CRLF normalization warnings.',
      'No production build was run because the request did not require one and the repository guidance reserves it for an explicitly stopped dev-server state.',
    ],
  },
  {
    id: 'patch-2026-08-12-riftbound-share-deduped-collection-catalogue',
    patch: '2026.08.12-riftbound-share-deduped-collection-catalogue',
    timestamp: '2026-08-12T23:59:04.1158707Z',
    title: 'Reused identical Riftbound share keys and refreshed shared collection presentation',
    summary: 'Repeated shares of the same owner/type/content snapshot now reuse the original short URL, while shared collections use the current collection breakdown, card layout, and viewport-aware image loading; set details now remain card view only.',
    details: [
      'Added a server-generated SHA-256 dedupe key based on owner identity, share kind, title, rows, and deck content while excluding the volatile share-created timestamp, so an unchanged collection, set, or deck reuses its existing key.',
      'Added a unique dedupe index and a legacy-record backfill migration; concurrent first-time shares resolve the existing record after a unique-key race instead of creating duplicate durable snapshots.',
      'Added a shared collection rarity breakdown with total-copy counts and interactive rarity filters matching the Riftbound profile collection treatment.',
      'Replaced the shared collection custom card tiles with the shared RiftboundCardRow collection layout used by inventory/profile, including normal/foil counts, current market values, current typography, card spacing, and card detail behavior.',
      'Shared collection cards now use RiftboundCardImage viewport observation through the same card row path as the inventory Global catalogue, so off-screen artwork is not retained in the DOM.',
      'Preserved shared collection print/PDF behavior by allowing the same card rows to switch to eager image loading during the print preparation pass.',
      'Removed list, compact, and view-option controls from saved set details in the Riftbound decks tab; saved sets now always render the card-grid layout.',
    ],
    impact: [
      'Re-sharing an unchanged item no longer consumes another share record or produces another URL.',
      'Shared collection viewers see the same card density and quick rarity filtering used elsewhere in Riftbound.',
      'Large shared collections avoid eagerly mounting every card image, improving memory and scrolling behavior on mobile devices.',
      'Set viewing is simpler and consistent because saved sets no longer expose deck-only presentation modes.',
    ],
    files: [
      'components/riftbound-collection-share.tsx',
      'components/riftbound-card-grid.tsx',
      'components/riftbound-card-image.tsx',
      'lib/riftbound-shares.ts',
      'supabase/migrations/119_riftbound_shared_snapshot_dedupe.sql',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npx tsc --noEmit --incremental false passed.',
      'npx supabase db push completed successfully and applied migration 119_riftbound_shared_snapshot_dedupe.sql to the linked remote database.',
      'git diff --check passed with only the repository\'s existing Git LF-to-CRLF normalization warnings.',
      'npm run check passed after the final changelog append: lint completed with the repository\'s existing img-element warnings, typecheck passed, and 34 tests passed across 12 test files.',
    ],
  },
  {
    id: 'patch-2026-08-13-riftbound-binders-replace-sets',
    patch: '2026.08.13-riftbound-binders-replace-sets',
    timestamp: '2026-08-13T18:53:56.8294045Z',
    title: 'Replaced Riftbound sets with paged binders',
    summary: 'Riftbound inventory now provides owner-managed binders with twenty named pages and sparse 3x3 card placement, while active set creation, loading, and profile presentation have been retired.',
    details: [
      'Added riftbound_binders, riftbound_binder_pages, and riftbound_binder_slots with owner foreign keys, update timestamps, page/slot bounds, unique page numbering, indexed lookups, RLS enabled, and service-role-only data access.',
      'Added create_riftbound_binder with a transaction-scoped per-user lock, validation, automatic twenty-page creation, and a four-binder standard limit or twelve-binder active-premium limit.',
      'Added authenticated binder GET/POST/PATCH/DELETE APIs with static aggregate API metrics, owner-scoped mutations, validated names/descriptions/page names/card IDs/finishes, sparse slot upserts, and slot clearing.',
      'Added the Binders inventory tab with binder naming and descriptions, page navigation, horizontal page scrolling with separators, paginated mode, named page editing, search/filter/sort controls, drag-and-drop card placement, tap-to-place support, duplicate cards, empty slots, and responsive 3x3 mobile card-image slots.',
      'Excluded duplicate basic rune cards from non-OGN binder catalogue results while retaining OGN basic runes and all non-basic catalogue cards.',
      'Removed active set loading, set management, set profile sources, set favorites, set share creation, and set UI branches. The legacy sets API now returns HTTP 410, while historical database records and historical community snapshot fields remain intact for safe read compatibility.',
      'Updated the Riftbound bootstrap payload to load binders and binder limits instead of sets, removed set data from profile payloads, and kept deck functionality available as a separate inventory tab.',
    ],
    impact: [
      'Standard users can create up to four binders; active premium users can create up to twelve.',
      'Cards can be placed into any of nine slots on any binder page, including repeated copies and sparse layouts, without requiring earlier slots to be filled.',
      'Binder images use lazy loading and the mobile layout stays a 3x3 grid while reducing each slot to the card image at small widths.',
      'Existing set database rows are not deleted, but new set management and set creation are no longer available.',
    ],
    files: [
      'app/api/riftbound/binders/route.ts',
      'app/api/riftbound/sets/route.ts',
      'components/riftbound-binder-board.tsx',
      'components/riftbound-card-grid.tsx',
      'components/riftbound-collection-share.tsx',
      'components/riftbound-profile.tsx',
      'lib/riftbound-binders.ts',
      'lib/riftbound-client.ts',
      'lib/riftbound-community-types.ts',
      'lib/riftbound-community.ts',
      'lib/riftbound-server.ts',
      'supabase/migrations/120_riftbound_binders.sql',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npx supabase db push completed successfully and applied migration 120_riftbound_binders.sql to the linked remote database.',
      'npm run check passed: lint completed with the repository\'s existing img-element warnings, typecheck passed, and 34 tests passed across 12 test files.',
      'Stale active set-management references were scanned and none remained outside intentional historical snapshot fields and the retired API route.',
      'git diff --check passed with only the repository\'s existing Git LF-to-CRLF normalization warnings.',
      'No production build was run because the request did not require one and the repository guidance reserves it for an explicitly stopped dev-server state.',
    ],
  },
  {
    id: 'patch-2026-08-13-riftbound-binder-image-containment',
    patch: '2026.08.13-riftbound-binder-image-containment',
    timestamp: '2026-08-13T19:43:12.1083597Z',
    title: 'Contained Riftbound binder catalogue images',
    summary: 'Fixed binder catalogue card artwork escaping its tile and expanding across the page after binder creation.',
    details: [
      'Added a binder-board scope class and CSS containment rule for the catalogue image frame that uses the 744/1039 card aspect ratio.',
      'The containment rule establishes the positioned ancestor required by RiftboundCardImage fill images, preventing artwork from positioning against the page viewport and overlapping or appearing to swap between cards.',
      'The fix is scoped to binder catalogue frames and does not alter the shared card-image behavior used by inventory, profile, or shared collection views.',
    ],
    impact: [
      'Creating a binder no longer causes catalogue card images to become extremely large or overlap one another.',
      'Binder catalogue images remain clipped to their card tiles while retaining lazy viewport loading.',
    ],
    files: [
      'app/globals.css',
      'components/riftbound-binder-board.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint completed with the repository\'s existing img-element warnings, typecheck passed, and 34 tests passed across 12 test files.',
      'git diff --check passed with only the repository\'s existing Git LF-to-CRLF normalization warnings.',
    ],
  },
  {
    id: 'patch-2026-08-13-riftbound-binder-layout-drag-scroll',
    patch: '2026.08.13-riftbound-binder-layout-drag-scroll',
    timestamp: '2026-08-13T19:49:25.5821866Z',
    title: 'Constrained Riftbound binder layout and added page drag scrolling',
    summary: 'Kept the Riftbound inventory content inside its centered page shell and made the horizontal binder page strip draggable from non-card areas.',
    details: [
      'Added min-w-0 and full-width constraints to the Riftbound page shell, header, binder board, binder sections, page strip, and catalogue sections so the twenty-page horizontal strip cannot contribute its intrinsic width to the surrounding layout.',
      'Added horizontal overflow clipping at the Riftbound page boundary while preserving the binder page strip as its own horizontal scroller.',
      'Added pointer-based drag scrolling for the horizontal binder mode, including pointer capture, grab/grabbing cursor feedback, touch-pan-y behavior, and prevention of page scrolling while dragging.',
      'Excluded buttons, form controls, links, and draggable card elements from page-strip drag initiation so card placement, page naming, card clearing, and binder controls continue to work normally.',
      'Added an accessible label describing the horizontal binder page drag interaction.',
    ],
    impact: [
      'Binder headers, filters, page panels, and catalogue cards remain within the centered Riftbound content area instead of stretching past the viewport.',
      'Users can move through binder pages by dragging empty binder space or other non-card page areas left and right.',
      'Existing card drag-and-drop behavior is preserved.',
    ],
    files: [
      'components/riftbound-binder-board.tsx',
      'components/riftbound-card-grid.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint completed with the repository\'s existing img-element warnings, typecheck passed, and 34 tests passed across 12 test files.',
      'git diff --check passed with only the repository\'s existing Git LF-to-CRLF normalization warnings.',
    ],
  },
  {
    id: 'patch-2026-08-13-riftbound-binder-catalogue-and-moves',
    patch: '2026.08.13-riftbound-binder-catalogue-and-moves',
    timestamp: '2026-08-13T20:36:58.0861851Z',
    title: 'Improved Riftbound binder catalogue placement and card movement',
    summary: 'Reworked binder catalogue controls and placement, added smooth viewport-aware dragging behavior, made binder card moves swap correctly, and enabled higher-resolution unoptimized binder artwork.',
    details: [
      'Moved binder catalogue search, sorting, and filters directly above the catalogue and removed value sorting and all market value fields from binder catalogue cards.',
      'Added stronger catalogue drag affordances with hover lift, amber border/shadow treatment, active dragging state, and explicit Drag to place guidance.',
      'Changed catalogue card clicks to open a page-selection menu listing only binder pages with available slots and displaying each page name and page number; full binders report that every page is full.',
      'Added continuous drag auto-scroll for card dragging when the pointer enters the upper or lower 30 percent of the viewport, with speed proportional to distance from the nearest edge and animation-frame updates.',
      'Added an authenticated move action that exchanges the source and target binder slots when the target is occupied, or clears the source slot when the target is empty; the client applies the same swap/clear behavior optimistically and rolls back on failure.',
      'Changed paginated binder mode to render two pages when its measured page viewport is at least 900 pixels wide and one page when the available width is smaller, with page-range navigation.',
      'Removed mandatory horizontal snap behavior from the scroll mode so pointer dragging follows the horizontal scrollbar naturally without snapping between pages.',
      'Applied the shared themed scrollbar class to binder page and binder selector scrollers.',
      'Added a high-resolution card-image preference that requests 1488x2078 source assets for binder cards, falls back to the catalogue source on asset failure, and keeps Next Image unoptimized so no Vercel image transformation is requested.',
    ],
    impact: [
      'Binder users can find and place cards without seeing acquisition/current market values in the catalogue.',
      'Card placement is more deliberate through named-page selection and supports reliable moves and swaps between any binder slots.',
      'Long binder pages remain navigable on desktop and touch devices while preserving the existing 3x3 mobile layout.',
      'Binder artwork uses higher-resolution source files where available without adding Vercel image optimization transformations or transformation costs.',
    ],
    files: [
      'app/api/riftbound/binders/route.ts',
      'components/riftbound-binder-board.tsx',
      'components/riftbound-card-image.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint completed with the repository\'s existing img-element warnings, typecheck passed, and 34 tests passed across 12 test files.',
      'git diff --check passed with only the repository\'s existing Git LF-to-CRLF normalization warnings.',
      'Confirmed binder artwork continues to render through the existing unoptimized Next Image path.',
    ],
  },
  {
    id: 'patch-2026-08-13-riftbound-binder-save-and-placement',
    patch: '2026.08.13-riftbound-binder-save-and-placement',
    timestamp: '2026-08-13T21:37:53.4775983Z',
    title: 'Refined Riftbound binder catalogue placement and saving',
    summary: 'Binder edits now remain local until an explicit Save Binder action, catalogue placement is concise and predictable, and the duplicate catalogue rendering and drag auto-scroll behavior have been removed.',
    details: [
      'Removed the generic Riftbound card-grid branch from the Binders tab so the binder catalogue is rendered only once in its dedicated section.',
      'Changed catalogue left-click behavior to place the card in the first available slot, while right-click opens a click-away-dismissible 4-column by 5-row page-number grid; unavailable full pages are disabled and retain their page names in accessible labels/tooltips.',
      'Centered catalogue card names, card numbers, and drag guidance text, and updated the instructions to describe the left-click/right-click placement behavior.',
      'Replaced per-operation page, slot, and swap PATCH requests from the binder UI with local pending state and one validated save request containing all twenty page names and sparse slot contents; the API validates page/slot bounds, duplicate positions, card IDs, finishes, and owner scope before replacing the saved slot snapshot.',
      'Preserved occupied-slot swap and empty-target source-clearing behavior locally until Save Binder is pressed, and prevented switching binders while unsaved page or slot edits are present.',
      'Removed binder page pointer-drag scrolling, viewport drag auto-scroll, the editing-page status line, and selectable binder text while retaining normal horizontal scrolling, custom scrollbars, and selectable name inputs.',
      'Catalogue-only drags now immediately scroll the document to the top while retaining the native drag payload and card preview; binder-card drags do not trigger this behavior.',
    ],
    impact: [
      'Users no longer see an oversized duplicate card catalogue below the binder catalogue.',
      'Adding a card by click is fast and deterministic, while right-click provides compact page-specific placement without a long dropdown.',
      'Repeated binder changes no longer issue a network mutation for every add, move, or removal; users can review the binder and commit it once.',
      'Binder page navigation uses the browserÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢s native horizontal scrolling behavior without the removed custom drag-scroll gesture.',
    ],
    files: [
      'app/api/riftbound/binders/route.ts',
      'components/riftbound-binder-board.tsx',
      'components/riftbound-card-grid.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint completed with the repository\'s existing img-element warnings, typecheck passed, and 34 tests passed across 12 test files.',
      'Confirmed the binder UI only calls the binder mutation endpoint for binder metadata and the explicit save action after the change.',
      'No production build was run because the request did not require one and the repository guidance reserves it for an explicitly stopped dev-server state.',
    ],
  },
  {
    id: 'patch-2026-08-13-riftbound-binder-share-menu-drag-performance',
    patch: '2026.08.13-riftbound-binder-share-menu-drag-performance',
    timestamp: '2026-08-13T22:50:45.7476796Z',
    title: 'Refined Riftbound binder placement menus and binder drag performance',
    summary: 'Improved binder card placement controls, constrained shared binder pages to the centered layout shell, linked shared creators to their Riftbound profiles, and removed catalogue rerenders during binder-card drags.',
    details: [
      'Added the exact ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œAdd to binder #ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â header and a mobile-only Close action to the centered right-click page picker, while retaining page availability, page-name tooltips, and the compact 4-by-5 page grid.',
      'Replaced each catalogue cardÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢s Drag to place text with an explicit Add to binder button that uses the existing first-available-slot behavior; right-click remains available for choosing a specific page.',
      'Added min-width and horizontal overflow containment to the shared binder page shell so its scrollable page strip cannot stretch the surrounding share page beyond the centered content area.',
      'Removed the shared binder read-only and created-date notes, and made the shared-by username link to /riftbound/profile/[username] using the existing encoded profile route.',
      'Separated catalogue-drag state from binder-card-drag state so moving a card inside the binder no longer rerenders the full catalogue. Binder slot hover state now updates only when the target slot changes, while the memoized page and catalogue card components skip unrelated drag updates.',
      'Kept binder artwork on the existing high-resolution, unoptimized image path and made no Vercel image optimization changes.',
    ],
    impact: [
      'Users can identify the placement menu, close it comfortably on mobile, and add cards through a clear labelled control.',
      'Shared binder links remain centered and provide direct navigation to the creatorÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢s Riftbound profile.',
      'Dragging existing binder cards should remain responsive even with a large catalogue loaded below the binder.',
    ],
    files: [
      'components/riftbound-binder-board.tsx',
      'components/riftbound-binder-share.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run typecheck passed after the binder menu, share-view, and drag-state changes.',
      'npm run check passed: lint completed with the repository\'s existing img-element warnings, typecheck passed, and 34 tests passed across 12 test files.',
      'No production build was run because the request did not require one and repository guidance reserves it for an explicitly stopped dev-server state.',
    ],
  },
  {
    id: 'patch-2026-08-14-riftbound-binder-tabs-cancel-pointer-scroll',
    patch: '2026.08.14-riftbound-binder-tabs-cancel-pointer-scroll',
    timestamp: '2026-08-14T17:45:03.0475054Z',
    title: 'Refined Riftbound binder navigation and pending-edit controls',
    summary: 'Reordered the Riftbound inventory tabs, simplified binder placement UI, added pending-edit cancellation, enlarged binder removal controls, and restored pointer drag scrolling for binder pages.',
    details: [
      'Moved Decks before Binders in the Riftbound inventory tab bar and removed the non-changing binder count badge while retaining counts for global cards, inventory cards, and decks.',
      'Removed the page-picker Choose a page helper text and moved the Add to binder action inside the catalogue card panel directly beneath the card number.',
      'Increased the binder slot remove-card control to a larger 36-pixel button with a larger icon for easier touch and pointer targeting.',
      'Added a Cancel button beside Save Binder when there are pending page or slot changes. Cancel restores the last persisted binder snapshot without issuing a mutation, and page-name inputs remount from the restored value when needed.',
      'Restored click-and-drag horizontal scrolling for the binder viewport. Pointer drags begin only on non-card, non-control areas, use pointer capture after a small movement threshold, preserve native card dragging, and retain the custom scrollbar and scroll mode behavior.',
    ],
    impact: [
      'The inventory navigation now reflects the requested Decks/Binders ordering without a misleading binder count.',
      'Binder cards are easier to remove and catalogue cards have a clearer in-card add action.',
      'Users can safely discard unsaved binder placement changes and navigate the horizontal binder by dragging empty binder space.',
    ],
    files: [
      'components/riftbound-card-grid.tsx',
      'components/riftbound-binder-board.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint completed with the repository\'s existing img-element warnings, typecheck passed, and 34 tests passed across 12 test files.',
      'git diff --check completed with only the repository\'s existing Git LF-to-CRLF normalization warnings.',
      'No production build was run because the request did not require one and repository guidance reserves it for an explicitly stopped dev-server state.',
    ],
  },
  {
    id: 'patch-2026-08-14-riftbound-shared-binder-scroll-width',
    patch: '2026.08.14-riftbound-shared-binder-scroll-width',
    timestamp: '2026-08-14T18:14:28.5613404Z',
    title: 'Matched shared binder horizontal page sizing',
    summary: 'Fixed shared binder horizontal-scroll mode so its page panels retain the same width and separation as the inventory binder view.',
    details: [
      'Changed shared viewer scroll-mode page wrappers from shrinkable min-w-0 flex items to fixed-width, non-shrinking items using the same w-[min(88vw,44rem)] sizing as the inventory binder board.',
      'Kept paginated and print-mode wrappers min-w-0 so their existing two-column and print page layouts remain unchanged.',
    ],
    impact: [
      'Shared binders now display complete separated pages in horizontal mode instead of compressing all pages into narrow columns.',
    ],
    files: [
      'components/riftbound-binder-board.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint completed with the repository\'s existing img-element warnings, typecheck passed, and 34 tests passed across 12 test files.',
      'git diff --check completed with only the repository\'s existing Git LF-to-CRLF normalization warnings.',
      'No production build was run because the request did not require one and repository guidance reserves it for an explicitly stopped dev-server state.',
    ],
  },
  {
    id: 'patch-2026-08-14-riftbound-shared-binder-drag-export',
    patch: '2026.08.14-riftbound-shared-binder-drag-export',
    timestamp: '2026-08-14T18:31:42.1209166Z',
    title: 'Added shared binder drag scrolling and JSON export',
    summary: 'Matched shared binder horizontal scrolling to the inventory binder interaction, added a top-level JSON export, and removed the share-view Binders back action.',
    details: [
      'Added pointer-capture horizontal dragging to the read-only shared binder viewer with the same five-pixel activation threshold, excluded card/control targets, scroll position tracking, grab cursors, touch-pan behavior, and custom scrollbar class used by the inventory binder viewport.',
      'Added an Export Binder JSON action to the shared binder header using the validated existing binder export format and a sanitized binder-name filename.',
      'Removed the Binders navigation link from the shared binder header while preserving the creator profile link and print/save PDF action.',
    ],
    impact: [
      'Visitors can drag across empty shared binder space to browse horizontal pages naturally and download the exact shared binder snapshot as JSON.',
      'The shared binder header has no navigation action that returns users to the owner-only inventory binder screen.',
    ],
    files: [
      'components/riftbound-binder-board.tsx',
      'components/riftbound-binder-share.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run typecheck passed after the shared viewer interaction and export changes.',
      'npm run check passed: lint completed with the repository\'s existing img-element warnings, typecheck passed, and 34 tests passed across 12 test files.',
      'git diff --check completed with only the repository\'s existing Git LF-to-CRLF normalization warnings.',
      'No production build was run because the request did not require one and repository guidance reserves it for an explicitly stopped dev-server state.',
    ],
  },
  {
    id: 'patch-2026-08-14-riftbound-sales-ledger',
    patch: '2026.08.14-riftbound-sales-ledger',
    timestamp: '2026-08-14T20:01:59.4705382Z',
    title: 'Added Riftbound purchase metadata and sales ledger',
    summary: 'Added durable acquisition tracking, pending sale review, transactional sale receipts, printable finalized receipts, and a searchable Sales workspace to the Riftbound inventory experience.',
    details: [
      'Added per-user, per-card, per-finish acquisition date and acquisition cost metadata while preserving the existing aggregate inventory quantity rows and leaving legacy inventory metadata nullable.',
      'Added migration 122 with service-role-only tables, RLS, indexes, and the transactional complete_riftbound_sale function. The function validates sale rows, locks inventory quantities, snapshots acquisition values into sale items, removes sold copies, and writes one durable sale group with subtotal, discount/upcharge, total, sold date, and UUID receipt identity.',
      'Added a right-click inventory transaction editor with high-resolution unoptimized card imagery, normal/foil selection, copy quantity controls, sale price per copy, market-price shortcut, acquisition date/cost fields, metadata Update, and pending-sale Sell actions.',
      'Added pending sale review with sale date, signed discount/upcharge, live subtotal and total, Continue Editing, Cancel Sale, and server-confirmed finalization. Invalidated pending quantities can be recovered with Clear Pending Sale.',
      'Added a finalized receipt modal showing all sold items, acquisition snapshots, per-line margin when cost is recorded, totals, sale date, durable sale label, and browser print support.',
      'Added a Sales sibling workspace tab with day/week/month/year grouping, card/number/sale-ID search, sold-date range filters, filtered revenue, expandable receipt-style history, and acquisition snapshot visibility in finalized receipts.',
      'Made the inventory bootstrap tolerant of an unapplied sales migration so existing inventory remains viewable during rollout; migration 122 was created but not pushed to Supabase.',
    ],
    impact: [
      'Users can record what they paid for inventory, stage multiple card lines into one sale, apply a final discount or upcharge, and remove sold quantities atomically when the sale is confirmed.',
      'Users can review historical sales by time period, search for cards or receipt identifiers, print finalized receipts, and compare sale proceeds with recorded acquisition costs.',
      'Staff retain aggregate-only API telemetry and service-side authorization boundaries; no sale request bodies, tokens, user identifiers, or raw dynamic identifiers are sent to metrics.',
    ],
    files: [
      'app/api/riftbound/inventory/route.ts',
      'app/api/riftbound/sales/route.ts',
      'app/globals.css',
      'components/riftbound-card-grid.tsx',
      'components/riftbound-sales.tsx',
      'lib/riftbound-client.ts',
      'lib/riftbound-sales.ts',
      'lib/riftbound-server.ts',
      'lib/staff-changelog.ts',
      'supabase/migrations/122_riftbound_sales.sql',
      'tests/riftbound-sales.test.ts',
    ],
    verification: [
      'npm run check passed: lint completed with the repository\'s existing img-element warnings in profile/public-profile/compact-deck files, typecheck passed, and 36 tests passed across 13 test files.',
      'git diff --check completed with only the repository\'s existing Git LF-to-CRLF normalization warnings.',
      'Migration 122 was reviewed locally but not pushed to Supabase because deployment was not requested.',
      'No production build was run because the request did not require one and repository guidance reserves it for an explicitly stopped dev-server state.',
    ],
  },
  {
    id: 'patch-2026-08-14-riftbound-sale-editor-refinement',
    patch: '2026.08.14-riftbound-sale-editor-refinement',
    timestamp: '2026-08-14T21:27:40.8547935Z',
    title: 'Refined Riftbound sale editing and receipt printing',
    summary: 'Improved sale editor spacing, made pending-sale edits local, persisted reusable sale prices, prevented over-allocation, and tightened review and printed receipt layouts.',
    details: [
      'Changed Sell from an immediate acquisition-metadata API mutation to a local pending-sale state update. Final confirmation now sends each pending line\'s acquisition snapshot and sale price through the single transactional sale request, while Update persists the card metadata explicitly and refreshes matching pending lines locally.',
      'Added sale_price_cents to Riftbound inventory metadata and migration 122. Sale prices now default to the current market price when no saved override exists, preserve explicit user-entered values including zero, and are restored when the editor is reopened.',
      'Added per-finish pending quantity accounting to the editor and final local add handler. The UI shows remaining and pending quantities, disables selling when all copies are staged, chooses an initially available finish, and rejects defensive over-allocation attempts.',
      'Reworked the active Review Sale modal with the requested receipt copy, total item count, bounded scrollable card list, quantity suffixes, and amber foil labels while preserving the existing cancellation and confirmation behavior.',
      'Removed acquisition detail text from the finalized receipt presentation, compacted print spacing, and narrowed print visibility to the receipt subtree so hidden inventory content cannot create dozens of blank printed pages.',
    ],
    impact: [
      'Users can stage many sale items without waiting for a network request per card and can safely reuse saved sale prices across future transactions.',
      'Users cannot stage more copies of a card finish than remain in inventory, and large sales remain navigable inside a bounded review panel.',
      'Printed sale receipts produce a compact receipt-focused output instead of empty pages caused by the underlying inventory layout.',
    ],
    files: [
      'app/api/riftbound/inventory/route.ts',
      'app/api/riftbound/sales/route.ts',
      'app/globals.css',
      'components/riftbound-card-grid.tsx',
      'components/riftbound-sales.tsx',
      'lib/riftbound-sales.ts',
      'lib/riftbound-server.ts',
      'lib/staff-changelog.ts',
      'supabase/migrations/122_riftbound_sales.sql',
    ],
    verification: [
      'npm run check passed: lint completed with the repository\'s existing img-element warnings in profile/public-profile/compact-deck files, typecheck passed, and 36 tests passed across 13 test files.',
      'git diff --check completed with only the repository\'s existing Git LF-to-CRLF normalization warnings.',
      'No production build was run because the request did not require one and repository guidance reserves it for an explicitly stopped dev-server state.',
    ],
  },
  {
    id: 'patch-2026-08-14-riftbound-sale-editor-schema-cache',
    patch: '2026.08.14-riftbound-sale-editor-schema-cache',
    timestamp: '2026-08-14T21:48:11.4402506Z',
    title: 'Polished Riftbound transaction editor and backfilled sale-price schema',
    summary: 'Reorganized the inventory transaction form, disabled no-op metadata updates, centered currency controls, and added a follow-up migration for environments missing sale_price_cents.',
    details: [
      'Rebuilt the transaction form metadata area so sale price occupies the first row, acquisition date and acquisition cost occupy the second row, and Set Market Price shares the acquisition-cost row while still updating sale price.',
      'Removed the sale-price helper sentence, Acquisition details heading, and saved-per-card helper sentence. Currency symbols now use inset-y centered flex wrappers for consistent vertical alignment.',
      'Added saved-field baselines for the selected finish. Update now remains disabled and performs no request when sale price, acquisition date, and acquisition cost are unchanged; successful saves update the local baseline and matching pending sale line.',
      'Added migration 123 as an append-only compatibility migration that adds sale_price_cents when migration 122 was previously applied without that column, adds its nonnegative check constraint when needed, and requests a PostgREST schema reload.',
    ],
    impact: [
      'Users receive a quieter, more compact transaction form and cannot issue redundant metadata updates.',
      'Existing deployments that are missing the reusable sale-price column have a dedicated migration path instead of requiring edits to an already-applied migration.',
    ],
    files: [
      'components/riftbound-sales.tsx',
      'lib/staff-changelog.ts',
      'supabase/migrations/123_riftbound_sale_price_metadata.sql',
    ],
    verification: [
      'npm run typecheck passed after the form and migration changes.',
      'The full npm run check completed successfully: lint retained only the repository\'s existing img-element warnings, typecheck passed, and 36 tests passed across 13 test files.',
      'git diff --check completed with only the repository\'s existing Git LF-to-CRLF normalization warnings.',
      'Migration 123 was created but not pushed to Supabase; deployment remains an explicit follow-up operation.',
      'No production build was run because the request did not require one and repository guidance reserves it for an explicitly stopped dev-server state.',
    ],
  },
  {
    id: 'patch-2026-08-14-riftbound-sale-review-actions',
    patch: '2026.08.14-riftbound-sale-review-actions',
    timestamp: '2026-08-14T22:06:01.9106449Z',
    title: 'Refined Riftbound sale review controls',
    summary: 'Moved the market-price action into the sale-price field, added local pending-line removal, and simplified the Sales Ledger heading content.',
    details: [
      'Placed Set Market Price as an inset action inside the sale-price input while retaining the centered dollar symbol and removing its previous position beside acquisition cost.',
      'Added a trash icon to each active Review Sale line. Removing a line updates pending-sale state locally, and removing the final line closes the review modal without a network request.',
      'Removed the Sales history heading and explanatory confirmed-sale paragraph from the Sales Ledger presentation while retaining the ledger controls and data.',
    ],
    impact: [
      'Users can set market price directly from the field they are editing and remove an accidental sale line before confirmation.',
      'The Sales Ledger opens with a more compact header and preserves its search, date, grouping, revenue, and receipt functionality.',
    ],
    files: [
      'app/globals.css',
      'components/riftbound-card-grid.tsx',
      'components/riftbound-sales.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint completed with the repository\'s existing img-element warnings in profile/public-profile/compact-deck files, typecheck passed, and 36 tests passed across 13 test files.',
      'git diff --check completed with only the repository\'s existing Git LF-to-CRLF normalization warnings.',
      'No production build was run because the request did not require one and repository guidance reserves it for an explicitly stopped dev-server state.',
    ],
  },
  {
    id: 'patch-2026-08-14-riftbound-inventory-sales-workspace',
    patch: '2026.08.14-riftbound-inventory-sales-workspace',
    timestamp: '2026-08-14T22:48:09.5939924Z',
    title: 'Moved Riftbound sales into the inventory workspace',
    summary: 'Replaced the top-level Sales tab with an Inventory workspace view switch and clarified the Sales Ledger date controls.',
    details: [
      'Reduced the primary Riftbound navigation to Global, Inventory, Decks, and Binders. The existing Sales view remains URL-compatible and is now represented as the secondary Sales view inside the active Inventory workspace.',
      'Added a compact Inventory workspace switcher for Collection and Sales, including the loaded sales count, so sale history remains available without competing with the primary collection areas.',
      'Aligned the Sales Ledger header and Filtered Revenue summary vertically, preserving the existing responsive layout and ledger controls.',
      'Added visible From date and Through date labels to the sales date-range fields, removed the duplicate custom calendar glyphs, and retained the native date-picker affordance.',
    ],
    impact: [
      'Sales history is easier to discover in context while remaining a secondary workflow for typical inventory users.',
      'Users can distinguish the two date-range fields immediately and see a cleaner, aligned ledger header.',
    ],
    files: [
      'app/globals.css',
      'components/riftbound-card-grid.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint completed with the repository\'s existing img-element warnings in profile/public-profile/compact-deck files, typecheck passed, and 36 tests passed across 13 test files.',
      'git diff --check completed with only the repository\'s existing Git LF-to-CRLF normalization warnings.',
      'No production build was run because the request did not require one and repository guidance reserves it for an explicitly stopped dev-server state.',
    ],
  },
  {
    id: 'patch-2026-08-14-riftbound-master-set-workspace',
    patch: '2026.08.14-riftbound-master-set-workspace',
    timestamp: '2026-08-14T23:48:06.8602516Z',
    title: 'Added the Riftbound Master Set inventory workspace',
    summary: 'Added a third Inventory workspace view that groups the card catalogue by set and tracks one-or-more-copy acquisition progress.',
    details: [
      'Added a Master Set view beside Collection and Sales inside the Inventory workspace; the primary Riftbound navigation remains unchanged and existing tab URL parsing remains compatible.',
      'Grouped the collectible Riftbound catalogue by set in catalogue order and added overall and per-set progress summaries with acquired, missing, and percentage totals.',
      'Added an individual Acquired or Missing status to every card. A card is Acquired when its combined normal and foil inventory quantity is greater than zero, so either finish satisfies the Master Set requirement.',
      'Kept card details accessible from the Master Set cards so users can inspect market and inventory information without duplicating inventory mutation logic.',
      'Added typed grouping, acquisition, and progress helpers plus focused unit coverage for set grouping and any-finish acquisition behavior.',
    ],
    impact: [
      'Users can review Master Set completion in the same Inventory workspace as their Collection and Sales views.',
      'Set-level progress makes missing cards easy to identify while treating normal and foil copies as equivalent for completion tracking.',
    ],
    files: [
      'components/riftbound-card-grid.tsx',
      'components/riftbound-master-set.tsx',
      'lib/riftbound-master-set.ts',
      'lib/staff-changelog.ts',
      'tests/riftbound-master-set.test.ts',
    ],
    verification: [
      'npm run check passed: lint completed with the repository\'s existing img-element warnings in profile/public-profile/compact-deck files, typecheck passed, and 38 tests passed across 14 test files.',
      'The targeted Master Set test passed with 2 tests covering grouping and acquisition progress.',
      'No production build was run because the request did not require one and repository guidance reserves it for an explicitly stopped dev-server state.',
    ],
  },
  {
    id: 'patch-2026-08-15-riftbound-master-set-controls',
    patch: '2026.08.15-riftbound-master-set-controls',
    timestamp: '2026-08-15T00:10:02.6437049Z',
    title: 'Refined Riftbound Master Set browsing controls',
    summary: 'Collapsed Master Set sections by default and added card search, visibility toggles, selected-card styling, and shared high-resolution unoptimized artwork handling.',
    details: [
      'Changed each set header into an accessible expand/collapse control and initialized all sets collapsed; filtered sections retain their full set-level acquisition progress while showing only matching cards when expanded.',
      'Reworked the Master Set summary to use View your collection progress, place the completion percentage beside the acquired card count, and remove the visible progress label and missing-card footer.',
      'Added client-side card search across names, set metadata, collector numbers, and rarity, plus Show owned cards, Show Signature cards, and Show Overnumbered cards switches with an empty-result state.',
      'Centered card names and numbers, replaced the mouse-triggered image focus ring with a selected-card amber border tied to the existing details modal selection, and retained visible keyboard focus treatment.',
      'Rendered Master Set artwork through the shared RiftboundCardImage component with explicit unoptimized loading and its high-resolution source fallback so Vercel image transformations are not used.',
    ],
    impact: [
      'Users can scan set completion without a long initial page, find specific cards quickly, and hide categories or owned cards while reviewing gaps.',
      'Selected cards now use the established outer-card highlight treatment instead of an isolated yellow image outline, and card artwork follows the existing Riftbound delivery contract.',
    ],
    files: [
      'components/riftbound-card-grid.tsx',
      'components/riftbound-master-set.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run typecheck passed after the Master Set control changes.',
      'The targeted Master Set test passed with 2 tests covering grouping and acquisition progress.',
      'The final npm run check passed: lint retained only the repository\'s existing img-element warnings, typecheck passed, and 38 tests passed across 14 test files.',
      'No production build was run because the request did not require one and repository guidance reserves it for an explicitly stopped dev-server state.',
    ],
  },
  {
    id: 'patch-2026-08-15-riftbound-master-set-sharing-comparison',
    patch: '2026.08.15-riftbound-master-set-sharing-comparison',
    timestamp: '2026-08-15T00:32:51.8684985Z',
    title: 'Added Riftbound Master Set sharing and comparison',
    summary: 'Completed the Master Set browsing polish and added durable share links, shared-set viewing, and profile comparisons.',
    details: [
      'Added closed-panel hover styling and a CSS grid-row/opacity transition for opening and closing set sections; all set sections remain collapsed initially and collapsed card controls are removed from keyboard tab order.',
      'Removed the filtered-card count note and added a fourth Master Set control that sorts cards within each set by rarity, then collector number and card ID for stable ordering.',
      'Added a durable master-set Riftbound share kind, snapshot builder, share normalization support, and migration 124 to extend the shared snapshot kind constraint without changing existing collection, deck, or binder share behavior.',
      'Added a read-only shared Master Set page with the sharer username/profile link, print/PDF action, shared card progress, card details, and an authenticated Compare with my Master Set action.',
      'Added a side-by-side Master Set comparison modal that keeps both inventories in identical set/card order and reports acquired or missing status for each card.',
      'Added a Master Set section to Riftbound public profiles with the same search, visibility, rarity-sort, expand/collapse, and selected-card behavior, plus Compare with my Master Set for another userÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢s profile.',
      'Kept Master Set card artwork on the shared unoptimized/high-resolution RiftboundCardImage path so Next/Vercel image transformations are not introduced.',
    ],
    impact: [
      'Users can review their Master Set progressively, share a durable read-only snapshot, compare against a shared snapshot, and compare against another userÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢s public Master Set.',
      'Shared Master Set links preserve the existing Riftbound share URL infrastructure and deduplication behavior while remaining read-only for viewers.',
    ],
    files: [
      'components/riftbound-card-grid.tsx',
      'components/riftbound-collection-share.tsx',
      'components/riftbound-master-set-comparison.tsx',
      'components/riftbound-master-set-share.tsx',
      'components/riftbound-master-set.tsx',
      'components/riftbound-profile.tsx',
      'lib/riftbound-master-set.ts',
      'lib/riftbound-share-types.ts',
      'lib/riftbound-shares.ts',
      'lib/staff-changelog.ts',
      'supabase/migrations/124_riftbound_master_set_shares.sql',
      'tests/riftbound-master-set.test.ts',
    ],
    verification: [
      'npm run check passed: lint retained only the repositoryÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢s existing img-element warnings in profile/public-profile/compact-deck files, typecheck passed, and 39 tests passed across 14 test files.',
      'git diff --check completed with only the repositoryÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢s existing Git LF-to-CRLF normalization warnings.',
      'Migration 124 was created but not pushed to Supabase; applying it remains an explicit deployment operation.',
      'No production build was run because the request did not require one and repository guidance reserves it for an explicitly stopped dev-server state.',
    ],
  },
  {
    id: 'patch-2026-08-15-riftbound-master-set-share-compare-polish',
    patch: '2026.08.15-riftbound-master-set-share-compare-polish',
    timestamp: '2026-08-15T00:59:44.2955169Z',
    title: 'Polished Riftbound Master Set sharing and comparisons',
    summary: 'Changed Master Set sharing to direct link copying and made shared comparison sections searchable, collapsible, and foil-grouped.',
    details: [
      'Replaced the own Master Set share tools menu action with a direct durable-link copy action, including preparing, copied, error, and disabled states without opening a modal.',
      'Removed Inventory and Print / Save PDF controls from the shared Master Set header while retaining authentication access to comparison and the sharer profile link.',
      'Added a shared-view-specific Master Set heading using the sharer username and removed the explanatory acquisition sentence from the shared view.',
      'Changed comparison column labels to plain usernames/You, added a comparison search field, and made each set section independently expandable or collapsible; matching sections auto-open for search results while remaining manually collapsible.',
      'Grouped base cards with their A-suffixed foil/showcase variants in the comparison rows, preserving set/card order and displaying each grouped variantÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢s status side by side for both collections.',
    ],
    impact: [
      'Sharing a Master Set is now a single-click copy workflow with immediate feedback.',
      'Shared and profile comparisons are easier to scan on large catalogues and no longer repeat normal and foil versions as unrelated card entries.',
    ],
    files: [
      'components/riftbound-card-grid.tsx',
      'components/riftbound-master-set-comparison.tsx',
      'components/riftbound-master-set-share.tsx',
      'components/riftbound-master-set.tsx',
      'components/riftbound-profile.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint retained only the repositoryÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢s existing img-element warnings in profile/public-profile/compact-deck files, typecheck passed, and 39 tests passed across 14 test files.',
      'git diff --check completed with only the repositoryÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢s existing Git LF-to-CRLF normalization warnings.',
      'No production build was run because the request did not require one and repository guidance reserves it for an explicitly stopped dev-server state.',
    ],
  },
  {
    id: 'patch-2026-08-15-riftbound-master-set-comparison-cache',
    patch: '2026.08.15-riftbound-master-set-comparison-cache',
    timestamp: '2026-08-15T01:07:59.3134445Z',
    title: 'Bounded and cached Riftbound Master Set comparisons',
    summary: 'Limited the comparison card area to a dedicated scroll region and reused the personal Master Set after its first load.',
    details: [
      'Added a 60vh maximum height and independent vertical scrolling to the comparison card area so the comparison header, progress summaries, and search controls remain compact.',
      'Shared-link comparisons now reopen from the existing personal inventory map after the first successful bootstrap request instead of requesting the API again.',
      'Public-profile comparisons use the same in-component personal Master Set cache when the comparison is reopened.',
    ],
    impact: [
      'Large Master Set comparisons no longer make the modal grow to the full card catalogue height.',
      'Repeated comparison opens are immediate and avoid redundant bootstrap network traffic during the current view session.',
    ],
    files: [
      'components/riftbound-master-set-comparison.tsx',
      'components/riftbound-master-set-share.tsx',
      'components/riftbound-profile.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint retained only the repositoryÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢s existing img-element warnings in profile/public-profile/compact-deck files, typecheck passed, and 39 tests passed across 14 test files.',
      'No production build was run because the request did not require one and repository guidance reserves it for an explicitly stopped dev-server state.',
    ],
  },
  {
    id: 'patch-2026-08-15-riftbound-deck-runes-legend-price-history',
    patch: '2026.08.15-riftbound-deck-runes-legend-price-history',
    timestamp: '2026-08-15T03:08:41.8499249Z',
    title: 'Fixed Riftbound deck rune catalogues, legend previews, and known prices',
    summary: 'Removed duplicate normal rune entries, restored selected legends in deck previews, and preserved prior known market values when newer snapshots are empty.',
    details: [
      'Deck creation now excludes duplicate normal Basic Rune cards from non-Origins sets while retaining their foil variants; rune cards are sorted alphabetically with each normal entry before its foil variants and stable set/collector tie-breakers.',
      'Deck previews now resolve the selected legend directly from legend_card_id when the expanded deck entries do not contain it, so the legend remains visible in the left preview column.',
      'The server-side price fallback now ignores null price snapshots, including when an older installed RPC returns a null latest row, and migration 125 updates the latest-price RPC to select the newest non-null snapshot per card and finish instead of allowing a later missing listing to erase an older known value.',
      'Cards with no known non-null price remain unavailable rather than receiving an invented value; explicit latest-price data still takes precedence through the existing client merge path.',
    ],
    impact: [
      'Deck builders show one normal rune catalogue entry per rune and present rune variants in the requested grouped order.',
      'Inventory deck previews consistently show the selected legend and inventory card previews recover historical market values when the newest capture is missing a listing.',
    ],
    files: [
      'components/riftbound-card-grid.tsx',
      'lib/riftbound-decks.ts',
      'lib/riftbound-server.ts',
      'lib/staff-changelog.ts',
      'supabase/migrations/125_riftbound_latest_known_price.sql',
      'tests/riftbound-decks.test.ts',
    ],
    verification: [
      'npm run check passed: lint retained only the repository\'s existing img-element warnings in profile/public-profile/compact-deck files, typecheck passed, and 40 tests passed across 14 test files.',
      'Targeted Riftbound deck and pricing tests passed: 14 tests across tests/riftbound-decks.test.ts and tests/riftbound.test.ts.',
      'git diff --check completed with only the repository\'s existing Git LF-to-CRLF normalization warnings.',
      'Migration 125 was created but not pushed to Supabase; applying it remains an explicit deployment operation.',
      'No production build was run because the request did not require one and repository guidance reserves it for an explicitly stopped dev-server state.',
    ],
  },
  {
    id: 'patch-2026-08-16-riftbound-missing-price-catalogue-fallback',
    patch: '2026.08.16-riftbound-missing-price-catalogue-fallback',
    timestamp: '2026-08-16T06:23:48.2709800Z',
    title: 'Preserved Riftbound catalogue values for unresolved latest prices',
    summary: 'Fixed cards such as UNL and VEN prints showing N/A when they were absent from the latest-price payload but still had valid catalogue and historical values.',
    details: [
      'Changed the client market-price merge to pass through an undefined latest snapshot instead of fabricating an all-null snapshot for every card missing from the latest response.',
      'Cards with an explicit latest snapshot continue to treat nullable normal and foil fields as authoritative, while cards absent from that payload retain their generated catalogue market values until a snapshot resolves them.',
      'Added a regression test using UNL Bloodharbor Ripper to protect the missing-payload fallback and retain the existing all-null snapshot behavior for genuinely unavailable prices.',
    ],
    impact: [
      'UNL and VEN cards with valid catalogue or historical pricing no longer display N/A solely because their card ID was omitted from the latest aggregate price response.',
      'Explicitly unavailable snapshots remain N/A, so the UI does not invent prices when the source has confirmed no market value.',
    ],
    files: [
      'components/riftbound-card-grid.tsx',
      'lib/riftbound.ts',
      'lib/staff-changelog.ts',
      'tests/riftbound.test.ts',
    ],
    verification: [
      'npm run check passed: lint retained only the repository\'s existing img-element warnings in profile/public-profile/compact-deck files, typecheck passed, and 41 tests passed across 14 test files.',
      'Targeted Riftbound price tests passed: 8 tests across tests/riftbound.test.ts.',
      'git diff --check completed with only the repository\'s existing Git LF-to-CRLF normalization warnings.',
      'No production build was run because the request did not require one and repository guidance reserves it for an explicitly stopped dev-server state.',
    ],
  },
  {
    id: 'patch-2026-08-17-riftbound-market-values-rewrite',
    patch: '2026.08.17-riftbound-market-values-rewrite',
    timestamp: '2026-08-17T17:00:43.8368466Z',
    title: 'Rewrote Riftbound market value and history resolution',
    summary: 'Unified Riftbound current prices and history on one canonical source, added complete catalogue coverage, and prepared an intentional market-history reset migration.',
    details: [
      'Added a shared canonical market-value contract using the tcgcsv source for cron writes, latest-value reads, history reads, generated client types, and cache versioning. The resolver initializes every catalogue card with explicit normal and foil availability so a partial database response cannot silently omit UNL, VEN, or other cards.',
      'Changed latest-value loading to paginate both the latest-price RPC and the canonical table compatibility fallback, select the newest known non-null value per card and finish, and preserve an older known value when a later source capture is null. The latest-price RPC is recreated with a source guard, non-null selection, a matching partial index, and service-role-only execution.',
      'Changed card history loading to read only the canonical tcgcsv source, eliminating the prior mismatch where archive rows appeared in charts while the current-value preview read a null live row. Historical imports now write their daily and monthly rows into the same canonical source instead of creating reader-invisible archive sources.',
      'Versioned browser latest-price and history caches so clients cannot reuse responses from the pre-rewrite source contract. Card detail market panels now show only supported finishes and use Latest known snapshot wording.',
      'Kept generated catalogue values active until a canonical snapshot has a timestamp, including community post valuation summaries; once a real snapshot exists, nullable values remain authoritative and an explicit unavailable finish stays unavailable.',
      'Created migration 126 as an intentional destructive reset: it deletes all rows from riftbound_card_price_snapshots and riftbound_collection_value_snapshots before recreating the canonical latest resolver. Inventory, sales, binders, decks, and card catalogue data are not deleted by this migration.',
      'Migration 126 was created but deliberately not pushed to Supabase. After deployment, the scheduled price snapshot should run to seed the new canonical baseline; the optional history import can repopulate historical rows using the rewritten importer.',
    ],
    impact: [
      'Inventory collection previews and card detail panels use the same current market value that powers their history chart, preventing valid history from coexisting with an unrelated N/A current value.',
      'Every catalogue card receives an explicit latest-price entry, while genuinely unavailable finishes remain N/A instead of receiving an invented price.',
      'Applying migration 126 permanently removes the currently stored market snapshot and collection-value history by design; this reset does not affect user inventory or other Riftbound workspaces.',
    ],
    files: [
      'app/api/cron/riftbound-price-snapshot/route.ts',
      'app/api/riftbound/prices/[cardId]/route.ts',
      'components/riftbound-card-grid.tsx',
      'components/riftbound-collection-share.tsx',
      'components/riftbound-profile.tsx',
      'lib/riftbound-community.ts',
      'lib/riftbound-client.ts',
      'lib/riftbound-market-values.ts',
      'lib/riftbound-server.ts',
      'lib/staff-changelog.ts',
      'scripts/import-riftbound-price-history.mjs',
      'supabase/migrations/126_riftbound_market_values_rewrite.sql',
      'tests/riftbound-market-values.test.ts',
    ],
    verification: [
      'npm run check passed: lint retained only the repository\'s existing img-element warnings in profile/public-profile/compact-deck files, typecheck passed, and 43 tests passed across 15 test files.',
      'Targeted market-value and Riftbound regression tests passed: 10 tests across tests/riftbound-market-values.test.ts and tests/riftbound.test.ts.',
      'git diff --check passed without whitespace errors.',
      'No production build was run because the request did not require one and repository guidance reserves it for an explicitly stopped dev-server state.',
    ],
  },
  {
    id: 'patch-2026-08-17-misc-refresh-and-riftbound-deck-previews',
    patch: '2026.08.17-misc-refresh-and-riftbound-deck-previews',
    timestamp: '2026-08-17T17:56:25.8715214Z',
    title: 'Quieted refreshes and aligned Riftbound deck previews',
    summary: 'Reduced unnecessary background loading, kept Riftbound pages steady during routine account updates, renamed the profile deck area, and matched Inventory deck previews to Profile.',
    details: [
      'Navigation waits until a destination is chosen instead of loading every available page in the background during a refresh.',
      'Riftbound profile and inventory content stays visible while routine account maintenance completes, so a normal session update no longer looks like a page reset.',
      'The Riftbound profile tab is now called Decks, and Inventory shows the same legend, champion, and battlefield preview cards used in the profile.',
      'Game stats synchronization pauses while browsing Riftbound and resumes elsewhere, while friends avoid repeating a recent dashboard update.',
    ],
    impact: [
      'Production refreshes make fewer requests and return a calmer, steadier experience.',
      'Returning to Riftbound pages feels faster and no longer briefly blanks already-loaded content during an ordinary session update.',
      'Decks are easier to recognize and compare from both Profile and Inventory.',
    ],
    files: [
      'components/app-header.tsx',
      'components/friends-widget.tsx',
      'components/global-actions.tsx',
      'components/landing-page.tsx',
      'components/player-game-stats-sync.tsx',
      'components/riftbound-card-grid.tsx',
      'components/riftbound-deck-preview.tsx',
      'components/riftbound-profile.tsx',
      'components/site-footer.tsx',
      'components/staff-changelog-screen.tsx',
      'lib/riftbound-community-client.ts',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint completed with the repository\'s existing img-element warnings, typecheck passed, and 43 tests passed across 15 test files.',
      'No production build was run because the request did not require one and repository guidance reserves it for an explicitly stopped dev-server state.',
    ],
  },
  {
    id: 'patch-2026-08-17-public-api-and-profile-privacy-hardening',
    patch: '2026.08.17-public-api-and-profile-privacy-hardening',
    timestamp: '2026-08-17T19:17:37.114Z',
    title: 'Hardened public RPC permissions, profile privacy, and API failures',
    summary: 'Restricted server-only database functions, replaced broad profile table access with an allowlist, stopped public profiles from exposing linked account details, and made shared API errors safe and correctly classified.',
    details: [
      'Added migration 127 to revoke anonymous and authenticated execution of server-only Riot popularity and Splash Scramble functions while preserving the intentionally public username lookup RPC for signup and profile flows.',
      'Replaced broad anonymous/authenticated profile table select and update privileges with an explicit public-profile column allowlist and removed client access to legacy linked-account, moderation, presence, session, and role columns.',
      'Changed the public profile route to load Discord and Riot details only for the profile owner or an administrator, return an explicit linked-account visibility flag, and hide linked-account cards and League Account Viewer links from other visitors.',
      'Added typed API errors, request IDs, safe error classification, server-side aggregate error logging, and generic responses for database/internal failures. Authentication and required-input failures now return 401 and 400 instead of falling through to generic 400 responses.',
      'Removed the client profile role read from the globally readable profiles query and refreshes moderation state through the existing server API when the own profile changes.',
    ],
    impact: [
      'Private linked account details are no longer returned to ordinary public profile visitors.',
      'Direct database RPC and profile-table access is narrower and cannot rely on accidental default permissions.',
      'Users receive more accurate API failure statuses while internal database and runtime details stay out of response bodies.',
    ],
    files: [
      'components/global-actions.tsx',
      'components/public-profile-screen.tsx',
      'app/api/profile/public/[username]/route.ts',
      'lib/api-utils.ts',
      'lib/auth-server.ts',
      'lib/staff-changelog.ts',
      'supabase/migrations/127_security_privilege_and_profile_grants.sql',
      'tests/api-utils.test.ts',
    ],
    verification: [
      'Added unit coverage for authentication status, validation status, request IDs, safe internal-error responses, and database-error redaction.',
      'npm run check passed: lint retained the repository\'s existing img-element warnings, typecheck passed, and 46 tests passed across 16 test files.',
      'git diff --check passed with only the repository\'s existing Git LF-to-CRLF normalization warnings.',
      'The migration was created locally and was not pushed to Supabase.',
      'No production build was run because the request did not require one and repository guidance reserves it for an explicitly stopped dev-server state.',
    ],
  },
  {
    id: 'patch-2026-08-17-production-readiness-foundations',
    patch: '2026.08.17-production-readiness-foundations',
    timestamp: '2026-08-17T20:10:30.989Z',
    title: 'Added CI, health probes, security headers, and production runbook',
    summary: 'Added automated repository verification, dependency-aware readiness checks, baseline browser security headers, and a documented path for external monitoring, recovery, MFA, E2E, load, and account-lifecycle controls.',
    details: [
      'Added a GitHub Actions workflow that installs from package-lock.json, runs the standard lint/typecheck/test check, and builds the production bundle on pull requests and pushes to the main or master branch with cancellation for superseded runs.',
      'Added a dependency-free /api/health liveness route and a /api/health/ready readiness route that checks required Supabase configuration, a service-role profiles query, and shared rate-limit configuration when production requires it without returning provider errors or secret names.',
      'Exempted only the dependency-free liveness route from API rate limiting so uptime checks continue to work during Redis or Supabase degradation; readiness remains protected by the normal API limiter.',
      'Added security headers for MIME sniffing, clickjacking, referrer leakage, browser permissions, cross-domain policy, DNS prefetch behavior, CSP base/form/frame/object restrictions, and production HTTPS transport enforcement. Camera permission remains available for the Riftbound scanner.',
      'Added a production-readiness runbook covering CI branch protection, health monitoring, provider error tracking, browser E2E tests, staging load tests, Supabase backup restoration, administrator MFA step-up enforcement, account deletion/export, and user-generated data quotas.',
    ],
    impact: [
      'Pull requests and protected-branch pushes now receive repeatable automated verification before deployment.',
      'Hosting monitors can distinguish process liveness from database and shared-rate-limit readiness without exposing operational details.',
      'The browser and transport layer has baseline hardening enabled while preserving the app\'s camera-scanning feature.',
      'Provider-dependent production work now has a maintained implementation boundary and an explicit operational checklist.',
    ],
    files: [
      '.github/workflows/ci.yml',
      'app/api/health/route.ts',
      'app/api/health/ready/route.ts',
      'docs/production-readiness.md',
      'lib/staff-changelog.ts',
      'middleware.ts',
      'next.config.mjs',
      'tests/health.test.ts',
    ],
    verification: [
      'npm run check passed: lint retained the repository\'s existing img-element warnings, typecheck passed, and 47 tests passed across 17 test files.',
      'git diff --check passed with only the repository\'s existing Git LF-to-CRLF normalization warnings.',
      'The CI production build is configured but was not run locally because repository guidance reserves local production builds for an explicitly stopped dev-server state.',
      'Provider monitoring, Supabase backup/PITR, MFA enforcement, browser E2E, and load testing remain external setup tasks documented in docs/production-readiness.md.',
    ],
  },
  {
    id: 'patch-2026-08-17-riftbound-market-history-restoration',
    patch: '2026.08.17-riftbound-market-history-restoration',
    timestamp: '2026-08-17T20:40:27.6958401Z',
    title: 'Restored Riftbound market history after canonical reset',
    summary: 'Fixed the historical importerÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢s rolling daily window and repopulated canonical Riftbound market snapshots so current prices and value charts resolve again.',
    details: [
      'Diagnosed the empty production snapshot table after migration 126: the canonical latest-price RPC returned zero rows, so the application correctly fell back to generated catalogue values while history had no database data to render.',
      'Changed the historical importer to calculate its daily window from the requested --to date. The most recent 90 days are now stored as daily rows for 30-day and 90-day charts, while older requested dates are retained as monthly peak rows for longer ranges.',
      'Ran the verified canonical TCGCSV backfill from 2025-10-31 through 2026-08-17. All 291 archive dates were available; 128,013 daily rows and 6,925 monthly rows were restored into the tcgcsv source.',
      'Confirmed the restored latest RPC and history rows for representative OGN, SFD, UNL, and VEN cards, including UNL Bloodharbor Ripper at $92.27 and VEN Draven, Showboat at $94.19 on the 2026-08-17 snapshot.',
    ],
    impact: [
      'Riftbound card previews now have canonical current values again instead of stale generated-catalogue values after the reset.',
      'Card value-history charts have recent daily points and longer-range monthly points available again.',
      'Future historical imports will keep the recent daily window aligned with the run date instead of permanently aging the daily range around the original import start date.',
    ],
    files: [
      'lib/staff-changelog.ts',
      'scripts/import-riftbound-price-history.mjs',
    ],
    verification: [
      'The non-writing 90-day importer dry-run completed with 90 available archives and 128,013 daily rows ready for restore.',
      'The full database backfill completed with archiveCount 291, missingArchiveCount 0, dailyRowCount 128013, and monthlyRowCount 6925.',
      'Read-only Supabase verification reported 134,938 canonical snapshot rows, latest snapshot date 2026-08-17, and restored UNL/VEN latest values through both paginated RPC pages and direct history reads.',
      'No production build was run because the request did not require one and repository guidance reserves it for an explicitly stopped dev-server state.',
    ],
  },
  {
    id: 'patch-2026-08-17-riftbound-production-history-cache-refresh',
    patch: '2026.08.17-riftbound-production-history-cache-refresh',
    timestamp: '2026-08-17T21:08:13.9596374Z',
    title: 'Forced fresh Riftbound history responses after production restore',
    summary: 'Bumped the Riftbound history cache version so clients and the CDN cannot reuse the empty response generated before the production backfill.',
    details: [
      'Confirmed the linked production project was separate from the development project and initially contained zero Riftbound price snapshots; restored production with the verified canonical TCGCSV backfill.',
      'Incremented the client and local card-grid history cache version from v5 to v6. This changes the history request URL and local-storage namespace, bypassing previously cached empty responses while preserving the canonical API implementation.',
    ],
    impact: [
      'After deployment and a normal page reload, production card details request fresh history data instead of reusing the empty pre-backfill response.',
      'Existing development and production snapshot rows remain canonical tcgcsv data; no inventory or sales data is affected.',
    ],
    files: [
      'components/riftbound-card-grid.tsx',
      'lib/riftbound-client.ts',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'Linked production verification reported 134,938 canonical snapshot rows, latest date 2026-08-17, source tcgcsv, and three restored Bloodharbor Ripper history points.',
      'npm run check passed: lint retained the repository\'s existing img-element warnings, typecheck passed, and 47 tests passed across 17 test files.',
      'No production build was run because the request did not require one and repository guidance reserves it for an explicitly stopped dev-server state.',
    ],
  },
  {
    id: 'patch-2026-08-18-adsense-site-verification-meta-tag',
    patch: '2026.08.18-adsense-site-verification-meta-tag',
    timestamp: '2026-08-18T00:51:09.6338334Z',
    title: 'Added AdSense site verification metadata',
    summary: 'Moved the AdSense ownership marker into the document metadata so Google can verify the site without placing the marker inside the page body.',
    details: [
      'Added the public AdSense account identifier through Next.js metadata.other so the generated verification meta element is emitted in the document head on the shared root layout.',
      'Removed the body-level verification element and the unused Next.js Script import; no ad unit, Auto ads setting, or visible advertisement was enabled.',
    ],
    impact: [
      'AdSense ownership verification can use the supported head metadata method while advertising remains disabled pending Riot approval.',
      'The application document structure no longer contains a verification element in the body.',
    ],
    files: [
      'app/layout.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'The metadata entry was added without running a production build because this change only affects generated head metadata and repository guidance reserves local builds for an explicitly stopped dev-server state.',
    ],
  },
  {
    id: 'patch-2026-08-18-adsense-cmp-script',
    patch: '2026.08.18-adsense-cmp-script',
    timestamp: '2026-08-18T01:04:58.8490091Z',
    title: 'Connected the published AdSense consent message',
    summary: 'Restored the AdSense publisher script in the shared document head so the published consent message can reach eligible visitors while ad inventory remains disabled.',
    details: [
      'Added the AdSense publisher script through next/script with a stable identifier, anonymous cross-origin loading, and the beforeInteractive strategy in the root layout.',
      'Retained the AdSense ownership meta tag and did not add ad units, enable Auto ads, or create any visible advertising placement.',
    ],
    impact: [
      'The published Google consent message can load on pages that include the shared root layout.',
      'The application remains free of visible ads until ad units or Auto ads are intentionally enabled after Riot approval.',
    ],
    files: [
      'app/layout.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint retained the repository\'s existing img-element warnings, typecheck passed, and 47 tests passed across 17 test files.',
      'No production build was run because the request did not require one and repository guidance reserves it for an explicitly stopped dev-server state.',
    ],
  },
  {
    id: 'patch-2026-08-18-cmp-privacy-settings-reopen',
    patch: '2026.08.18-cmp-privacy-settings-reopen',
    timestamp: '2026-08-18T01:18:57.7417958Z',
    title: 'Added a privacy settings reopen control',
    summary: 'Added a persistent footer control that lets visitors reopen the published Google consent settings after their initial decision.',
    details: [
      'Added a focused client component that calls Google Funding ChoicesÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ revocation callback when the published CMP is available, while safely doing nothing if the external consent runtime has not initialized.',
      'Added the control beside the existing Privacy Policy and Terms of Service links in the shared site footer; consent choices and persistence remain owned by the Google CMP rather than duplicated in application storage.',
    ],
    impact: [
      'Visitors can return to their privacy and cookie choices from any page after the initial consent decision.',
      'The application does not create a second consent state that could conflict with GoogleÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢s TCF record.',
    ],
    files: [
      'components/privacy-settings-button.tsx',
      'components/site-footer.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'The normal repository check remains required after this component change; production CMP behavior still requires deployment and browser verification against the published AdSense message.',
    ],
  },
  {
    id: 'patch-2026-08-18-game-daily-target-and-leaderboard-resilience',
    patch: '2026.08.18-game-daily-target-and-leaderboard-resilience',
    timestamp: '2026-08-18T21:56:35.4329453Z',
    title: 'Separated daily skin targets and hardened Splash Scramble leaderboard reads',
    summary: 'Added a dedicated Daily Splash Scramble target that excludes the Skindle target, exposed skin release dates in Skindle autocomplete, and added a server-side table fallback when the leaderboard RPC has a transient or deployment-related failure.',
    details: [
      'Daily Skindle continues to use the skindle-scoped deterministic seed. Daily Splash Scramble now uses its own deterministic seed and selects the first different catalog skin from the shuffled order, while retaining the UTC-day cache boundary.',
      'Added the static /api/splash-scramble/target route through withApiMetrics with private caching until the next UTC day, and changed the Splash Scramble client to use that route instead of the Skindle target route.',
      'Skindle autocomplete now displays each skin release date in ISO format in parentheses when the catalog provides one; the underlying catalog data is unchanged.',
      'If the Splash Scramble leaderboard RPC fails, the server now reads the same daily entries and profile fields through the service-role table path, applies the RPC-equivalent score/moves/time/completion ordering, and preserves top-50 plus current-user behavior. The original database error is still returned if both paths fail.',
    ],
    impact: [
      'New daily Splash Scramble rounds no longer intentionally reuse the current dayÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢s Skindle skin when an alternate catalog skin exists.',
      'Players can identify skin release dates while searching the Skindle answer list.',
      'Transient RPC failures and schema/permission rollout gaps no longer immediately surface as an Unexpected API error when the underlying leaderboard tables remain readable.',
      'No Skindle champion lane values were changed; the lane audit remains a report-only investigation pending product approval.',
    ],
    files: [
      'app/api/splash-scramble/target/route.ts',
      'components/skindle.tsx',
      'components/splash-scramble.tsx',
      'lib/splash-scramble-daily.ts',
      'lib/splash-scramble-leaderboard.ts',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run lint passed with the repositoryÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢s existing img-element warnings in profile-screen.tsx, public-profile-screen.tsx, and riftbound-compact-deck-view.tsx; no new lint errors were reported.',
      'npx tsc --noEmit --incremental false passed.',
      'npm run check passed: lint retained the repositoryÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢s existing img-element warnings, typecheck passed, and 47 tests passed across 17 test files.',
    ],
  },
  {
    id: 'patch-2026-08-18-skindle-wiki-lane-corrections',
    patch: '2026.08.18-skindle-wiki-lane-corrections',
    timestamp: '2026-08-18T22:27:06.3234427Z',
    title: 'Applied League wiki lane corrections to Skindle metadata',
    summary: 'Updated the approved 60-champion lane discrepancy list in both the catalogue generator overrides and the checked-in gameplay metadata used by Skindle.',
    details: [
      'Corrected Akali to Top/Middle; Akshan to Middle; Ambessa to Middle; Amumu to Jungle/Support; Ashe to Bottom/Support; Aurora to Top/Middle; Brand to Jungle/Middle/Support; Camille to Top/Support; Diana to Jungle/Middle; Galio to Middle/Support; and Gragas to Top/Jungle/Middle.',
      'Corrected Heimerdinger to Top/Middle/Support; Hwei to Middle/Support; Irelia to Top/Middle; Jax to Top/Jungle; Jayce to Top/Middle; Karma to Top/Middle/Support; Lillia to Jungle; Lux to Middle/Support; Malphite to Top/Middle/Support; Maokai to Jungle/Support; Neeko to Middle/Support; and Pantheon to Top/Jungle/Middle/Support.',
      'Corrected Poppy to Top/Jungle; Qiyana to Middle; Rengar to Top/Jungle; Rumble to Top/Middle; Ryze to Middle; Sejuani to Jungle; Senna to Bottom/Support; Seraphine to Bottom/Support; Shaco to Jungle/Support; Shen to Top/Support; Skarner to Top/Jungle; and Smolder to Top/Middle/Bottom.',
      'Corrected Swain to Middle/Support; Sylas to Top/Middle; Tahm Kench to Top/Support; Taliyah to Jungle/Middle; Talon to Jungle/Middle; Taric to Middle/Support; Teemo to Top/Jungle/Support; Tristana to Middle/Bottom; Trundle to Top/Jungle; Twisted Fate to Top/Middle/Bottom; Twitch to Bottom/Support; and Udyr to Top/Jungle.',
      'Corrected Vayne to Top/Bottom; Veigar to Middle/Support; Vel\'Koz to Middle/Support; Vladimir to Top/Middle; Volibear to Top/Jungle; Warwick to Top/Jungle; Wukong to Top/Jungle; Xerath to Middle/Support; Yasuo to Top/Middle/Bottom; Yone to Top/Middle; Zac to Top/Jungle/Support; Zed to Jungle/Middle; and Ziggs to Middle/Bottom.',
      'Added the same lane values to CHAMPION_METADATA_OVERRIDES so future catalogue generation preserves the approved corrections, and updated the current generated champion-gameplay-metadata.json consumed by the application. Urf was left unchanged because it was explicitly excluded from the approved discrepancy list due to having no Skindle skin entries.',
    ],
    impact: [
      'Skindle champion metadata now displays the approved multi-lane positions instead of the prior single incorrect lane for all 60 listed champions.',
      'Future generated catalogues and the currently deployed checked-in catalogue now use the same lane data, preventing the correction from being lost during routine data maintenance.',
      'No skin records, release dates, daily targets, leaderboard behavior, or unrelated champion resource/species metadata were changed by this patch.',
    ],
    files: [
      'data/catalogs/champion-gameplay-metadata.json',
      'lib/staff-changelog.ts',
      'scripts/generate-catalogs.mjs',
    ],
    verification: [
      'node --check scripts/generate-catalogs.mjs passed.',
      'A read-only comparison of all 60 approved champion names against data/catalogs/champion-gameplay-metadata.json reported zero mismatches.',
      'npm run check passed: lint retained the repository\'s existing img-element warnings in profile-screen.tsx, public-profile-screen.tsx, and riftbound-compact-deck-view.tsx; typecheck passed, and 47 tests passed across 17 test files.',
      'No production build was run because the request did not require one and repository guidance reserves it for an explicitly stopped dev-server state.',
    ],
  },
  {
    id: 'patch-2026-08-18-game-popover-portal-positioning',
    patch: '2026.08.18-game-popover-portal-positioning',
    timestamp: '2026-08-18T23:30:39.2648913Z',
    title: 'Fixed game menu positioning across responsive layouts',
    summary: 'Moved shared game viewport popovers to the document body so Player Stats, Top Guesses, game instructions, difficulty, and modifier menus remain anchored beneath their buttons instead of inheriting offset coordinates from blurred game panels.',
    details: [
      'ViewportPopover now renders through a React portal attached to document.body. This prevents fixed viewport coordinates from being interpreted relative to ancestors that establish a containing block through backdrop blur or other visual effects.',
      'The shared popover retains viewport clamping, narrow-screen width limits, above-the-anchor fallback, and max-height scrolling so menus remain usable on mobile devices and short viewports.',
      'Pointer and mouse down events inside a portaled menu stop before reaching each game\'s document-level outside-click handler, preserving interactive menu controls after the DOM ownership changes.',
    ],
    impact: [
      'Skindle Player Stats and Top Guesses now open directly below their respective controls at the correct viewport position.',
      'The same positioning correction applies to shared Game Info, Ability Blitz difficulty/modifier, and Skin Champion difficulty/modifier menus without duplicating fixes across individual games.',
      'Desktop layout remains viewport-aligned while mobile menus stay within an eight-pixel viewport margin and scroll within the available height.',
    ],
    files: [
      'components/viewport-popover.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'The shared ViewportPopover usage audit found all game instruction, stats, Top Guesses, difficulty, and modifier menus route through the corrected component.',
      'npm run check passed: lint retained the repository\'s existing img-element warnings in profile-screen.tsx, public-profile-screen.tsx, and riftbound-compact-deck-view.tsx; typecheck passed, and 47 tests passed across 17 test files.',
      'No production build was run because the request did not require one and repository guidance reserves it for an explicitly stopped dev-server state.',
    ],
  },
  {
    id: 'patch-2026-08-19-game-family-contracts',
    patch: '2026.08.19-game-family-contracts',
    timestamp: '2026-08-19T16:46:12.7544956Z',
    title: 'Established the game-family architecture and shared solo-quiz contract',
    summary: 'Added an explicit family registry for the games section and moved shared Ability Blitz/Skin Champion difficulty, entry-count, game-definition, and persisted round-state contracts into the solo-quiz domain layer.',
    details: [
      'Added lib/game-families.ts with typed route IDs, family definitions, responsibilities, and route-to-family mapping for solo quizzes, daily guessing, Splash Scramble puzzles, multiplayer sessions, and standalone challenges.',
      'Added family and route identifiers to the shared game navigation model so navigation and future infrastructure can reason about game ownership without matching on display titles or paths.',
      'Added shared solo-quiz difficulty rules, entry-count options, game definitions, catalogue selection, and a generic persisted round-state type to lib/solo-quiz.ts. Ability Blitz and Skin Champion now consume those contracts instead of maintaining duplicate difficulty-rule and entry-count declarations.',
      'Updated the shared SoloQuizPrematch component to resolve its game label from the solo-quiz game definition, removing a display-name conditional while preserving both existing labels and routes.',
      'Documented the family boundaries in docs/architecture.md. Skindle, Splash Scramble, and multiplayer games retain their own rules engines; this patch establishes shared contracts without changing gameplay, storage keys, API routes, seeded sets, or multiplayer authority.',
    ],
    impact: [
      'Ability Blitz and Skin Champion now have one source of truth for their shared difficulty behavior and persisted round shape, reducing drift during future rewrites.',
      'The games hub now carries explicit family metadata for all listed games, including Category Clash, Skincognito, Carving Revelation, and Mastery Master.',
      'No player-facing gameplay behavior or persisted data format was intentionally changed; the family architecture is a foundation for subsequent item-by-item rewrites.',
    ],
    files: [
      'components/ability-blitz.tsx',
      'components/skin-champion.tsx',
      'components/solo-quiz-prematch.tsx',
      'docs/architecture.md',
      'lib/game-families.ts',
      'lib/game-navigation.ts',
      'lib/solo-quiz.ts',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npx tsc --noEmit --incremental false passed after fixing the generic persisted-state contract to avoid an index-signature conflict.',
      'npm run check passed: lint retained the repository\'s existing img-element warnings in profile-screen.tsx, public-profile-screen.tsx, and riftbound-compact-deck-view.tsx; typecheck passed, and 47 tests passed across 17 test files.',
      'No production build was run because the request did not require one and repository guidance reserves it for an explicitly stopped dev-server state.',
    ],
  },
  {
    id: 'patch-2026-08-19-game-back-to-games-route',
    patch: '2026.08.19-game-back-to-games-route',
    timestamp: '2026-08-19T16:54:46.2349904Z',
    title: 'Rerouted game back controls to the Games screen',
    summary: 'Changed game and lobby-level back navigation from the site home route to /games while preserving in-match returns to game-specific lobby/settings screens.',
    details: [
      'Updated Skindle, Splash Scramble, Category Clash, multiplayer quiz lobbies, Skincognito, and Carving Revelation game-level navigation to use /games and updated accessible labels from game hub/home to games where applicable.',
      'Preserved Ability Blitz and Skin Champion in-match back controls that return to their multiplayer lobby setup route, and preserved active multiplayer controls that return to their lobby instead of leaving directly to the Games screen.',
      'Updated multiplayer leave/auth-exit destinations in the affected game shells to use the same Games screen route so game navigation does not split between the site home and games hub.',
    ],
    impact: [
      'Users who leave a game or game setup now arrive at the Games screen and can choose another game directly.',
      'Lobby and reconnect behavior remains unchanged; only the final game-hub destination changed from / to /games.',
    ],
    files: [
      'components/carving-revelation.tsx',
      'components/category-clash.tsx',
      'components/multiplayer-quiz-lobby.tsx',
      'components/skincognito.tsx',
      'components/skindle.tsx',
      'components/splash-scramble.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'A read-only search confirmed the changed game-level destinations use /games while Ability Blitz and Skin Champion still retain their lobby setup back links.',
      'npm run check passed: lint retained the repository\'s existing img-element warnings in profile-screen.tsx, public-profile-screen.tsx, and riftbound-compact-deck-view.tsx; typecheck passed, and 47 tests passed across 17 test files.',
      'No production build was run because the request did not require one and repository guidance reserves it for an explicitly stopped dev-server state.',
    ],
  },
  {
    id: 'patch-2026-08-19-carving-revelation-phase-refactor',
    patch: '2026.08.19-carving-revelation-phase-refactor',
    timestamp: '2026-08-19T17:25:56.7157350Z',
    title: 'Reworked Carving Revelation phase authority and reconnect flow',
    summary: 'Refactored Carving Revelation around its current simultaneous carving/guessing phase model and corrected match lifecycle, secret-data visibility, reconnect, power-up, and action-response defects.',
    details: [
      'Added lib/carving-revelation-rules.ts as the pure rules layer for active connected player selection, persisted action ordering, first-correct winner selection, per-player submission counts, all-player phase completion, and viewer-safe lobby secret sanitization.',
      'Carving Revelation lobby views now redact secret_skin_id and skin metadata while a match is active. Active splash access remains available only through the connected-player-checked skin-image route; finished views continue to reveal the answer and image.',
      'Corrected reconnect eligibility consumption to use the domain response fields and reconnect deadline, and allowed eligible existing active players to rejoin through the normal join command while continuing to reject expired, eliminated, or invalid reconnects.',
      'Made first-correct resolution deterministic from the persisted action identity, marked non-winners eliminated at match completion, and removed the previous fallback that selected an arbitrary connected player as a winner when everyone forfeited. Pending reconnect windows now prevent premature give-up/phase completion.',
      'Returned the submitting playerÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢s authoritative guess action in non-terminal responses, aligned client skip-turn UI with server-validated non-conflicted power-up claims, and kept Insight power-up coordinates private to their owner.',
      'Updated Carving Revelation navigation fallback destinations to /games and documented the phase/secret-data contract in docs/architecture.md.',
    ],
    impact: [
      'Players no longer receive secret skin identifiers or direct splash URLs from active lobby JSON, reducing information leakage and keeping reveal access behind the intended player check.',
      'Players can recover from an eligible disconnect, see correct personal guess outcomes immediately, and avoid being incorrectly blocked by contested or invalid Skip Turn effects.',
      'First-correct games have one deterministic winner, while all-forfeit matches finish without displaying a phantom winner; disconnected players retain their reconnect window before the match is finalized.',
    ],
    files: [
      'components/carving-revelation.tsx',
      'docs/architecture.md',
      'lib/carving-revelation-rules.ts',
      'lib/carving-revelation.ts',
      'lib/staff-changelog.ts',
      'tests/carving-revelation-rules.test.ts',
    ],
    verification: [
      'npm run lint passed with only the repositoryÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢s existing img-element warnings in profile-screen.tsx, public-profile-screen.tsx, and riftbound-compact-deck-view.tsx.',
      'npm run typecheck passed.',
      'npm run test:run passed: 51 tests across 18 test files, including four new Carving Revelation rules/security regression tests.',
      'No production build was run because the request did not require one and repository guidance reserves it for an explicitly stopped dev-server state.',
    ],
  },
  {
    id: 'patch-2026-08-19-carving-revelation-answer-hints-settings',
    patch: '2026.08.19-carving-revelation-answer-hints-settings',
    timestamp: '2026-08-19T18:56:35.1626639Z',
    title: 'Expanded Carving Revelation answers and lobby settings',
    summary: 'Updated Carving Revelation line-length defaults, added progressive hint frequency settings, accepted specific champion skin titles as answers, expanded autocomplete, and coordinated settings dropdown dismissal.',
    details: [
      'Changed the available starting line lengths to 8%, 12%, 15%, and 20%, with new-lobby default 12%; changed round increments to 2%, 3%, 4%, 5%, and 6%, with new-lobby default 4%. Existing invalid legacy values are normalized to the new defaults by migration and domain validation.',
      'Added the persisted hint_frequency setting with None, Every round, Every 2 rounds, Every 3 rounds, and Every 4 rounds options. During the guessing phase, the server returns only the progressively revealed answer prefix for the current round, and the client uses it in the guess input placeholder without exposing the secret skin or full answer.',
      'Carving Revelation guess validation now accepts both the transformed skin-line answer and the champion-specific skin title, including examples such as Worldbreaker and Worldbreaker Nautilus. The catalog answer endpoint now has a Carving-specific mode that supplies both answer types to autocomplete.',
      'Carving Revelation settings now use the shared AppSelectMenu. AppSelectMenu closes on pointer interaction outside its field and closes sibling menus when another field opens, including touch interactions on mobile layouts.',
      'Added an append-only Supabase migration for the hint column, revised line-length constraints, safe normalization of legacy invalid values, and the new database defaults. The migration was created locally and was not pushed.',
    ],
    impact: [
      'Hosts can configure the requested reveal pacing and optional progressive hints before starting a Carving Revelation lobby.',
      'Players have a recovery path for skin lines with unclear or omitted names because the specific displayed skin can be submitted directly and selected from autocomplete.',
      'Settings menus no longer remain stranded open after tapping elsewhere or opening a neighboring setting, while existing gameplay and active-lobby secret redaction remain intact.',
    ],
    files: [
      'app/api/carving-revelation/lobbies/[code]/settings/route.ts',
      'app/api/skin-champion/quiz-answers/route.ts',
      'components/app-select-menu.tsx',
      'components/carving-revelation.tsx',
      'lib/carving-revelation-rules.ts',
      'lib/carving-revelation.ts',
      'lib/skin-themes.ts',
      'lib/staff-changelog.ts',
      'supabase/migrations/128_carving_revelation_hint_and_line_length_settings.sql',
      'tests/carving-revelation-rules.test.ts',
    ],
    verification: [
      'npm run check passed: lint retained only the repository\'s existing img-element warnings in profile-screen.tsx, public-profile-screen.tsx, and riftbound-compact-deck-view.tsx; typecheck passed; 53 tests passed across 18 test files, including six Carving Revelation answer/hint rules tests.',
      'git diff --check could not be run because the sandbox Git identity is not permitted to mark the workspace a safe directory; the changed files were inspected directly and the project check passed.',
      'No production build was run because the request did not require one and repository guidance reserves it for an explicitly stopped dev-server state.',
    ],
  },
  {
    id: 'patch-2026-08-19-multiplayer-leave-and-carving-consistency',
    patch: '2026.08.19-multiplayer-leave-and-carving-consistency',
    timestamp: '2026-08-19T21:02:47.4214704Z',
    title: 'Hardened multiplayer exit handling and Carving Revelation round consistency',
    summary: 'Made authoritative leave calls consistent across multiplayer games, stopped tab visibility from disconnecting players, and prevented stale Carving Revelation round responses or cached splash images from replacing the current match.',
    details: [
      'The shared multiplayer page-exit path now posts to each game\'s leave endpoint for waiting, active, finished, and terminated sessions, sends forfeit=true for non-waiting sessions, removes the stored lobby pointer, and falls back from sendBeacon to keepalive fetch when Beacon cannot queue the request. bfcache page transitions are excluded so returning to a cached tab does not forfeit a player.',
      'Removed the visibilitychange-to-disconnect behavior and kept multiplayer heartbeats/reconciliation eligible while a document is hidden, allowing normal tab switching without forcing a reconnect window or game loss. Explicit lobby back controls and route-away reconciliation now leave waiting lobbies and forfeit active/finished sessions across Carving Revelation, Category Clash, Skincognito, Ability Blitz, and Skin Champion.',
      'Removed reconnect prompts and stored-session retention after an intentional non-waiting leave in the shared multiplayer quiz and Skincognito lobby components. Direct leave requests use keepalive, and active/finished leave buttons consistently send the authoritative forfeit flag.',
      'Added Carving Revelation snapshot ordering by match generation, status, round, phase, and update timestamp; stale same-lobby responses are ignored, and actions are cleared when a new match generation is accepted. Active skin-image URLs now include the non-secret match start version so browser cache entries cannot carry a prior round\'s splash art.',
      'Added a bounded server-side snapshot consistency retry for Carving Revelation views and conditional waiting/finished state transitions for initial starts, next-round starts, and return-to-lobby actions, preventing concurrent transitions from committing different skins, rolling back the active state, or clearing newly-created actions. Finished-round cleanup is timestamp-bounded so delayed duplicate requests cannot delete actions from the new match.',
      'Added pure regression coverage for Carving Revelation snapshot ordering and match-generation identity.',
    ],
    impact: [
      'Players remain in multiplayer games when they tab away, while actual page exits, route changes, back controls, auth changes, and intentional lobby/game leaves call the corresponding leave endpoint and remove the player from the active session according to that game\'s lifecycle rules.',
      'Carving Revelation clients no longer display a prior round\'s answer image or carve actions after everyone gives up or a new round begins, and concurrent next-round requests cannot leave different players with different committed skins.',
    ],
    files: [
      'components/carving-revelation.tsx',
      'components/category-clash.tsx',
      'components/multiplayer-quiz-lobby.tsx',
      'components/skincognito.tsx',
      'components/use-multiplayer-heartbeat.ts',
      'lib/carving-revelation-rules.ts',
      'lib/carving-revelation.ts',
      'lib/multiplayer-client-session.ts',
      'lib/staff-changelog.ts',
      'tests/carving-revelation-rules.test.ts',
    ],
    verification: [
      'npm run check passed: lint retained only the repository\'s existing img-element warnings in profile-screen.tsx, public-profile-screen.tsx, and riftbound-compact-deck-view.tsx; typecheck passed; 54 tests passed across 18 test files.',
      'The multiplayer leave call sites and visibility lifecycle listeners were audited across all four multiplayer component families, including the shared Ability Blitz/Skin Champion lobby implementation.',
      'No production build was run because the request did not require one and repository guidance reserves it for an explicitly stopped dev-server state.',
    ],
  },
  {
    id: 'patch-2026-08-20-riftbound-inventory-history',
    patch: '2026.08.20-riftbound-inventory-history',
    timestamp: '2026-08-20T18:28:44.0476523Z',
    title: 'Added persistent Riftbound inventory history',
    summary: 'Added an Inventory Workspace History section that records grouped inventory updates and finalized sales as durable, account-scoped events.',
    details: [
      'Added a lazy-loaded History workspace section with one list group per Update Inventory or Review Sale action. Rows identify whether each card was added, removed, or sold, show the card name and set number, preserve foil identity, include quantities when greater than one, and show sale price only for sold rows.',
      'Added a service-only history API and server loader with paginated group and item reads, preventing large histories from being truncated by default Supabase response limits. History requests are cached and deduplicated in the existing Riftbound client cache and invalidated after a successful inventory update or sale.',
      'Added migration 129 with separate event-group and event-item tables, user-scoped indexes, service-role-only access, and transactional recording inside apply_riftbound_inventory_changes and complete_riftbound_sale. Existing sale receipts are backfilled into sold history; prior aggregate inventory edits are not fabricated because their original event timing is unavailable.',
      'Kept current inventory quantities and sale receipts as the sources of truth for ownership and finalized sales. The new history records are append-only from the application flow, and the migration was created locally but not pushed to Supabase.',
    ],
    impact: [
      'Users can review the chronological groups of cards added, removed, and sold without leaving the Inventory Workspace or loading card images and market data for the history list.',
      'Inventory and sale writes remain atomic: a successful button action records its corresponding history group in the same database transaction, while failed writes roll back both the quantity/sale mutation and its history record.',
      'Staff must apply supabase/migrations/129_riftbound_inventory_history.sql before deploying the new History route and UI to an environment that should record events.',
    ],
    files: [
      'app/api/riftbound/inventory/history/route.ts',
      'components/riftbound-card-grid.tsx',
      'components/riftbound-inventory-history.tsx',
      'lib/riftbound-client.ts',
      'lib/riftbound-inventory-history.ts',
      'lib/riftbound-server.ts',
      'lib/staff-changelog.ts',
      'supabase/migrations/129_riftbound_inventory_history.sql',
    ],
    verification: [
      'npm run check passed: lint retained only the repository\'s existing img-element warnings in profile-screen.tsx, public-profile-screen.tsx, and riftbound-compact-deck-view.tsx; typecheck passed; 54 tests passed across 18 test files.',
      'npm run typecheck passed with no TypeScript errors.',
      'No production build was run because the request did not require one and repository guidance reserves it for an explicitly stopped dev-server state.',
    ],
  },
  {
    id: 'patch-2026-08-20-image-transformation-budget',
    patch: '2026.08.20-image-transformation-budget',
    timestamp: '2026-08-20T22:20:36.1408517Z',
    title: 'Reduced avoidable Vercel image transformations',
    summary: 'Reduced image optimization variants and catalog autocomplete image mounts without changing primary gameplay artwork.',
    details: [
      'Changed QuizProgressCard to render non-skin quiz assets with GameIconImage unoptimized, so Ability Blitz progress icons no longer invoke the Vercel image optimizer; skin progress assets remain on the optimized splash path.',
      'Added an opt-in showImage prop to QuizProgressCard and disabled artwork for pending Skin Champion progress items; current and completed items retain their existing artwork.',
      'Capped Skincognito skin selection and active skin-guess image suggestions at 12 entries to bound simultaneous optimized thumbnail mounts.',
      'Centralized catalog autocomplete thumbnail sizing at 64px and applied it to Skindle, Splash Scramble, and both Skincognito skin suggestion surfaces so matching source images reuse one width class instead of separate 48px/64px variants.',
      'Removed the LandingCard quality=90 override so local landing snapshots use the shared quality=65 policy and do not create a separate quality cache key.',
      'No API, database, auth, secret-handling, or image source data changes were made.',
    ],
    impact: [
      'Ability Blitz avoids unnecessary Vercel transformations for small immutable ability icons.',
      'Skin Champion and Skincognito mount fewer image elements or variants during normal play and selection.',
      'Primary large splash artwork and established game behavior remain available; only pending progress artwork and autocomplete result count/thumbnail sizing changed.',
    ],
    files: [
      'components/game-asset-image.tsx',
      'components/quiz-progress-card.tsx',
      'components/skin-champion.tsx',
      'components/skincognito.tsx',
      'components/skindle.tsx',
      'components/splash-scramble.tsx',
      'components/landing-page.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint retained only the repository\'s existing img-element warnings in profile-screen.tsx, public-profile-screen.tsx, and riftbound-compact-deck-view.tsx; typecheck passed; 54 tests passed across 18 test files.',
      'git diff --check passed before the changelog append; the final changed files were inspected after the append.',
      'No production build was run because the request did not require one and repository guidance reserves it for an explicitly stopped dev-server state.',
    ],
  },
  {
    id: 'patch-2026-08-21-skindle-stats-and-lane-display',
    patch: '2026.08.21-skindle-stats-and-lane-display',
    timestamp: '2026-08-21T18:15:34.2543450Z',
    title: 'Moved Skindle global stats to durable storage and corrected lane wrapping',
    summary: 'Replaced Vercel-incompatible local-file Skindle stats persistence with an atomic Supabase-backed store, added controlled dependency errors, and rendered multi-lane values as comma-separated wrapping text.',
    details: [
      'Replaced lib/skindle-stats.ts filesystem reads, process-local cache, and serialized local write queue with service-role calls to get_skindle_daily_stats and record_skindle_guess RPCs.',
      'Added migration 130 with service-role-only daily summary, per-skin guess, and anonymous client deduplication tables; row locking and database-side updates preserve one-guess-per-client/skin, first-for-skin, correct-solve, average-solve, top-guess, and per-skin count semantics across serverless instances.',
      'Kept Skindle global stats anonymous and unauthenticated at the API boundary; the stats route does not require a login. Added payload size/content validation and controlled 503 responses when Supabase configuration or the latest migration is unavailable.',
      'Kept the existing per-guess POST behavior because the current UI uses the response for live Global Guesses, per-skin guess counts, and First indicators. The page still performs initial and post-solve GET reads rather than a GET after every guess.',
      'Normalized lane metadata separators from slash-delimited values such as Top/Jungle/Middle/Support to comma-separated values and enabled word breaking in desktop and mobile result cells so long lane lists can wrap instead of clipping at a slash.',
    ],
    impact: [
      'Production Skindle stats no longer depend on VercelÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢s non-durable/read-only application filesystem and can be updated safely by concurrent serverless requests after migration 130 is applied.',
      'Unauthenticated players can continue contributing anonymous global guesses; a missing database migration now reports a non-sensitive 503 rather than a generic server exception.',
      'Skindle lane comparison remains equivalent while the displayed lane list is readable on narrow result cells.',
    ],
    files: [
      'app/api/skindle/stats/route.ts',
      'components/skindle.tsx',
      'lib/skindle-stats.ts',
      'lib/staff-changelog.ts',
      'supabase/migrations/130_skindle_global_stats.sql',
    ],
    verification: [
      'npm run check passed: lint retained only the repository\'s existing img-element warnings in profile-screen.tsx, public-profile-screen.tsx, and riftbound-compact-deck-view.tsx; typecheck passed; 54 tests passed across 18 test files.',
      'git diff --check passed before the changelog append; the final changed files were inspected after the append.',
      'Migration 130 was created locally and was not pushed to Supabase.',
      'No production build was run because the request did not require one and repository guidance reserves it for an explicitly stopped dev-server state.',
    ],
  },
  {
    id: 'patch-2026-08-21-skindle-batched-stats',
    patch: '2026.08.21-skindle-batched-stats',
    timestamp: '2026-08-21T18:26:56.0606936Z',
    title: 'Batched Skindle global guess recording',
    summary: 'Changed Skindle global stats writes from one POST per guess to five-guess boundary batches with a completion flush for any unsent guesses.',
    details: [
      'The Skindle client now sends the current five guesses, inclusive of the latest guess, at guess counts 5, 10, 15, and so on; when the target is solved, it sends the remaining unsent tail, including the completing guess, even when the total count is not a multiple of five.',
      'Added a client submission watermark and ordered snapshot application so successful batches advance progress, failed or in-flight work is retried safely, and an older batch response cannot overwrite a newer completion snapshot.',
      'Expanded the Skindle stats POST contract to accept a validated guesses array of up to 100 entries while retaining compatibility with the prior single-guess payload shape. The route processes the batch against the existing atomic RPCs and returns accepted counts plus all first-for-skin identifiers found in the batch.',
      'Kept server-side per-client/skin deduplication as the safety boundary for overlapping retries. Global stats and First indicators now update at batch completion rather than after every individual guess, while the local guessing and achievement flows remain unchanged.',
    ],
    impact: [
      'Normal Skindle play generates approximately one stats POST for every five guesses instead of one POST per guess, reducing browser request volume and serverless/API invocation overhead.',
      'A completed round still records every guess, including a short final tail such as guesses 6-7; duplicate or overlapping submissions do not inflate aggregate counts because the database rejects already-recorded client/skin pairs.',
      'The stats route remains anonymous and unauthenticated; migration 130 must still be applied before production deployment so the existing RPC-backed storage is available.',
    ],
    files: [
      'app/api/skindle/stats/route.ts',
      'components/skindle.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npx tsc --noEmit --incremental false passed after the batch contract and client changes.',
      'npm run check passed: lint retained only the repository\'s existing img-element warnings in profile-screen.tsx, public-profile-screen.tsx, and riftbound-compact-deck-view.tsx; typecheck passed; 54 tests passed across 18 test files.',
      'No production build was run because the request did not require one and repository guidance reserves it for an explicitly stopped dev-server state.',
    ],
  },
  {
    id: 'patch-2026-08-21-autocomplete-image-transformations',
    patch: '2026.08.21-autocomplete-image-transformations',
    timestamp: '2026-08-21T19:01:30.2411344Z',
    title: 'Reduced responsive and autocomplete image transformations',
    summary: 'Removed SkindleÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢s duplicate desktop/mobile guess-image mount and bounded image-backed autocomplete searches across Skindle, Splash Scramble, and Skincognito.',
    details: [
      'Replaced SkindleÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢s separate mobile and desktop guess-row components with one responsive row that contains one shared GameSplashImage element per guess. The desktop grid and mobile category layout remain responsive, and latest-guess scrolling now follows the single shared row reference.',
      'Splash Scramble skin search now waits for three characters, caps results at 12, and uses one overscan row instead of four. This prevents broad one- and two-character searches from mounting up to 15 new splash thumbnails on every keystroke.',
      'Skindle autocomplete now waits for three characters, caps results at 12, and uses one overscan row instead of four. SkincognitoÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢s skin-selection and skin-guess dropdowns now wait for three characters and cap image-backed results at eight; non-skin category suggestions remain text-only and unchanged.',
      'Kept large selected, target, preview, board-reference, and completed-game artwork optimized. No global unoptimized override was added, avoiding a transformation reduction that would instead download the original large splash source for every thumbnail.',
    ],
    impact: [
      'A normal Skindle guess no longer mounts separate mobile and desktop optimized splash variants; the browser selects one responsive image variant for the shared row.',
      'Splash Scramble searches such as a ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ am ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ amu no longer transform images for the first two broad queries. The likely 37-transformation pattern from the reported test should be bounded to the matching results after the third character, with at most nine initial thumbnails mounted.',
      'Image-backed dropdowns remain available, but require a more specific query and expose bounded result sets, reducing transformation spikes while preserving skin selection and guessing behavior.',
    ],
    files: [
      'components/skindle.tsx',
      'components/splash-scramble.tsx',
      'components/skincognito.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npx tsc --noEmit --incremental false passed after the responsive row and autocomplete changes.',
      'git diff --check passed; CRLF normalization warnings from Git were informational only.',
      'npm run check passed: lint retained only the repository\'s existing img-element warnings in profile-screen.tsx, public-profile-screen.tsx, and riftbound-compact-deck-view.tsx; typecheck passed; 54 tests passed across 18 test files.',
      'No production build was run because repository guidance reserves it for an explicitly stopped dev-server state.',
    ],
  },
];
