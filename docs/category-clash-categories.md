# Category Clash Categories

Category Clash gameplay reads `data/category-clash-categories.json` at runtime. The game does not call Riot, Data Dragon, or CommunityDragon APIs while players are in a match.

## Editing Categories

Each category has:

- `id`: stable unique identifier used in saved lobby settings and match state.
- `group`: section label shown in settings.
- `label`: short category name.
- `prompt`: the in-game text shown to players.
- `source`: where the list came from.
- `answers`: accepted answers. Each answer has a stable `id`, display `label`, and optional `aliases`.

You can add or remove categories directly in `data/category-clash-categories.json`. Keep `id` values stable once a category has been used in production.

## Generated Snapshot

The current document was seeded from:

- `data/catalogs/skin-items.json` for champion class and skin-line categories.
- `data/catalogs/ability-items.json` for ultimate ability names.
- Manual lists in `scripts/generate-category-clash-categories.mjs` for runes, summoner spells, jungle monsters, item stat buckets, and ARAM Mayhem augments.

The local generated catalogues are currently the project source of truth. Regenerate the JSON with:

```bash
node scripts/generate-category-clash-categories.mjs
```

Do that only when you intentionally want to overwrite the editable JSON with a fresh generated snapshot.

## Data Limitations

The repository does not currently include an authoritative generated item-stat catalogue or ARAM Mayhem augment catalogue. Those categories are manually seeded and should be reviewed when League itemization or rotating-mode augment pools change.
