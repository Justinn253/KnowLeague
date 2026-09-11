# Randodraft

Solo drafting at `/randodraft`; navigation follows Splash Scramble in the hub and header.

## First-draft rules

- Five unique champions and five unique lanes. Any champion can fill any lane.
- The manual allowance (0–2, default 0) resets per pick and counts categories, not rerolls. Unused allowances do not carry forward. Every manual choice or spin locks that category.
- AD accepts items granting attack damage or attack speed, including passive/aura grants recorded in the item categories. AP requires ability power. Tank requires health, armor, or magic resistance. Hybrid items can qualify for multiple types.
- Random Build Type defaults to No random build types (AD/AP/Tank only). Allow random build types adds Random; All build types are random restricts every pick to Random. Random builds can mix item types while preserving equipment restrictions.
- The build spinner is always available after all three categories are locked; there is no build-path enable/disable setting. Next/Finish can skip the build. A rolled build locks once.
- A build means six final inventory items in suggested purchase order: standard upgraded boots first, then five items of the selected type. Boots are the stat-type exception. Tear items are shown in their purchasable pre-transformation form.
- No consumables, trinkets, wards, mode variants, champion-only upgrades, or quest-only items.
- Item IDs cannot repeat; all source item groups limited to one are enforced (including boots, Hydra, Lifeline, Tear, and penetration groups). Purchase identities exclude ranged-only items from melee champions; shapeshifters can use either supported attack form.
- Rapid Firecannon follows the source purchase rules and is available to ranged champions. Runaan's Hurricane requires a ranged form.
- The final map supports hover, keyboard focus, and touch selection.
- Active draft state is local to the mounted page. Back returns to settings; starting again resets the draft. Completed drafts are saved for the account that started and finished the draft, keeping the five latest entries. Guests do not save history. There is no score or leaderboard.
- Account history requires migration 131_randodraft_history.sql (prepared locally, not pushed by this change). The private table and atomic storage function are service-role-only; /api/randodraft/history validates bearer authentication and draft rules. Saves use stable draft IDs for retries and database completion timestamps.
- The lobby places settings and Play on the left, recent expandable draft cards on the right, using Ability Blitz proportions.

## Maintenance

`scripts/generate-randodraft-catalog.mjs` pins Data Dragon 16.18.1 and CommunityDragon 16.18.
Run `npm run data:generate:randodraft` only when intentionally updating this catalogue.
It leaves every other game catalogue untouched. Gameplay imports only the compact generated JSON.

Sources:
- Riot Data Dragon champion and item JSON: https://ddragon.leagueoflegends.com/cdn/16.18.1/data/en_US/item.json
- Extracted game item groups, purchase identities, and shop availability: https://raw.communitydragon.org/16.18/game/items.cdtb.bin.json
- Champion attack identities: versioned CommunityDragon `v1/champions/{id}.json`.
- Local sample minimap: https://ddragon.leagueoflegends.com/cdn/16.18.1/img/map/map11.png

When updating the patch, review changed items, groups, special purchase restrictions, and champion identities, then run the generation command and `npm run check`.
The generator fails on missing groups or unknown purchase identities instead of silently permitting unsupported items.

## Code boundaries

- `lib/randodraft.ts`: types, draft reducer, available categories, item eligibility, build generation.
- `components/randodraft.tsx`: lobby settings and gameplay orchestration.
- `components/randodraft-spinner.tsx` and CSS module: vertical reel animation, reduced-motion behavior, timeout cleanup.
- `components/randodraft-results.tsx`: map positions and build presentation.
