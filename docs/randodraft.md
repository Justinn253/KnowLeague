# Randodraft

Solo drafting at `/randodraft`; navigation follows Splash Scramble in the hub and header.

## First-draft rules

- Choose Summoner's Rift or ARAM in the lobby. Each team can have one to five players; Summoner's Rift assigns unique lanes within each team, while ARAM drafts without lanes. An optional second team drafts after Team 1; completed maps place Team 1 on red side and Team 2 on blue side.
- The manual allowance (0–2, default 0) resets per pick and counts categories, not rerolls. Unused allowances do not carry forward. Every manual choice or spin locks that category.
- Build types use Riot item-shop class memberships from mItemAttributes: Fighter (1), Marksman (2), Assassin (4), Tank (8), Mage (16), and Support (32). Items can belong to multiple classes; stats and icon filenames do not determine membership. The generated catalogue retains the source flags for auditing.
- Random Build Type defaults to No random build types (the six shop classes only). Allow random build types adds Random; All build types are random restricts every pick to Random. Random builds can mix item types while preserving equipment restrictions.
- The build spinner appears after all required categories are locked; there is no build-path enable/disable setting. Next/Finish requires a locked build. A rolled build locks once. ARAM uses Riot's map-12 item availability, including ARAM-only purchasable items where present.
- A build means six final inventory items in shuffled slots: one pair of standard upgraded boots and five items from the selected shop class. Boots can appear in any slot. Boots are the shop-class exception. Tear items are shown in their purchasable pre-transformation form.
- No consumables, trinkets, wards, mode variants, champion-only upgrades, or quest-only items.
- Item IDs cannot repeat; all source item groups limited to one are enforced (including boots, Hydra, Lifeline, Tear, and penetration groups). Purchase identities exclude ranged-only items from melee champions; shapeshifters can use either supported attack form.
- Rapid Firecannon follows the source purchase rules and is available to ranged champions. Runaan's Hurricane requires a ranged form.
- The completed view uses Summoner's Rift for SR drafts and Howling Abyss for ARAM drafts. Map overlays show champion icons only, with explicit red-side Team 1 and blue-side Team 2 positions. Both maps support hover, keyboard focus, and touch selection.
- Active draft state is saved in browser localStorage after committed choices, name edits, and every completed pick. A lobby Resume Randodraft card restores validated progress after navigating away or refreshing. Account and guest snapshots use separate keys. Back returns to settings; starting again resets the draft. Account history keeps five latest entries, while guest completed drafts stay in browser storage and expire after seven days. Recent drafts open directly into their completed view. Share links use short database references that expire and are pruned after seven days; copied images include champion, build, lane, and class icons. There is no score or leaderboard.
- Account history and short shares require migrations 131_randodraft_history.sql, 132_randodraft_team_settings.sql, and 133_randodraft_short_shares.sql (prepared locally, not pushed by this change). The private table and atomic storage function are service-role-only; /api/randodraft/history validates bearer authentication and draft rules. Saves use stable draft IDs for retries and database completion timestamps.
- The lobby places settings and Play on the left, recent clickable draft cards on the right, using Ability Blitz proportions. Two-team history cards show red-side Team 1 and blue-side Team 2 on separate rows.

## Gameplay controls

- Team slots have editable labels during drafting (32 characters maximum), retained in completed drafts and account history.
- Summoner's Rift can spin Champion, Lane, and Class simultaneously. ARAM hides Lane and spins Champion and Class. Next/Finish waits for every active spin and a locked build. New picks remount the working controls; completed picks stay in the team panel. Quick Roll replaces the controls with Spin All and completes picks in order one second apart.
- Manual choices replace the reel/control area. The same button restores it. Locked cards turn green, and reels preserve their landed neighbors.
- Rolled items appear below the lane/class in Your team, with shared custom name notes on hover or keyboard focus.
- Build previews are decorative. The winning build is generated when Spin is clicked or by Quick Roll: eligible boots and five randomly sampled eligible items, recalculating restrictions after each choice and then shuffling all six positions. There are no authored build sets or synergy rules, and full six-item combinations are not sampled uniformly.

## Maintenance

`scripts/generate-randodraft-catalog.mjs` pins Data Dragon 16.18.1 and CommunityDragon 16.18.
Run `npm run data:generate:randodraft` only when intentionally updating this catalogue.
It leaves every other game catalogue untouched. Gameplay imports only the compact generated JSON.

Sources:
- Riot Data Dragon champion and item JSON: https://ddragon.leagueoflegends.com/cdn/16.18.1/data/en_US/item.json
- Extracted game item groups, purchase identities, and shop availability: https://raw.communitydragon.org/16.18/game/items.cdtb.bin.json
- Champion attack identities: versioned CommunityDragon `v1/champions/{id}.json`.
- Local sample minimaps: https://ddragon.leagueoflegends.com/cdn/16.18.1/img/map/map11.png and https://ddragon.leagueoflegends.com/cdn/16.18.1/img/map/map12.png

When updating the patch, review changed items, groups, special purchase restrictions, and champion identities, then run the generation command and `npm run check`.
The generator fails on missing groups or unknown purchase identities instead of silently permitting unsupported items.

## Code boundaries

- `lib/randodraft.ts`: types, draft reducer, available categories, item eligibility, build generation.
- `components/randodraft.tsx`: lobby settings and gameplay orchestration.
- `components/randodraft-spinner.tsx` and CSS module: vertical reel animation, reduced-motion behavior, timeout cleanup.
- `components/randodraft-results.tsx`: map positions and build presentation.
- `components/randodraft-history.tsx`: recent draft mode labels.

Shop-class generation fails on unknown attribute values. Boots retain their existing class exception; Random uses the union of eligible classed equipment. Existing saved drafts keep their historical class labels.

- Reels use a clickable Spin prompt and run for 2.475 seconds (50% longer). Clicking during animation completes the already chosen outcome once.
- Lane and class icons are local assets. Every Randodraft image uses GameIconImage with unoptimized enabled, bypassing Vercel image transformations. Class icon sources are recorded in public/class-icons/README.md.
