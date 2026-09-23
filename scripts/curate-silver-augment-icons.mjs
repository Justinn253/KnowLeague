import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// Names alone cannot identify artwork: old and new designs often share a name.
// These reviewed groups follow the central glyph, independent of its frame.
export async function curateAugmentIconGroups(catalogue, rarity) {
  const groups = JSON.parse(await readFile(new URL(`../data/catalogs/augment-${rarity}-icon-groups.json`, import.meta.url), 'utf8'));
  const icons = new Map(catalogue.icons.map((icon) => [icon.id, icon]));
  const reviewed = new Set();
  let order = 0;
  for (const group of groups) {
    for (const entry of group.icons) {
      if (reviewed.has(entry.id)) throw new Error(`Duplicate ${rarity} artwork override: ${entry.id}`);
      reviewed.add(entry.id);
      const icon = icons.get(entry.id);
      // Future source refreshes can retire assets or change their canonical ID.
      if (!icon || icon.rarity !== rarity) continue;
      icon.searchTerms = [...new Set([...icon.searchTerms, icon.name, entry.name])];
      icon.name = entry.name;
      icon.visualOrder = order++;
    }
  }
  // Newly discovered artwork remains available after the reviewed groups.
  for (const icon of catalogue.icons.filter((icon) => icon.rarity === rarity && !reviewed.has(icon.id))
    .sort((a, b) => a.visualOrder - b.visualOrder || a.id.localeCompare(b.id))) {
    icon.visualOrder = order++;
  }
}

export async function curateSilverAugmentIcons(catalogue) {
  await curateAugmentIconGroups(catalogue, 'silver');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const path = new URL('../data/catalogs/augment-icons.json', import.meta.url);
  const catalogue = JSON.parse(await readFile(path, 'utf8'));
  await curateSilverAugmentIcons(catalogue);
  await writeFile(path, JSON.stringify(catalogue, null, 2) + '\n');
}
