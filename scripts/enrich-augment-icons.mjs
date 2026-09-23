import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';
import { curatePrismaticAugmentIcons } from './curate-prismatic-augment-icons.mjs';
import { curateGoldAugmentIcons } from './curate-gold-augment-icons.mjs';
import { curateSilverAugmentIcons } from './curate-silver-augment-icons.mjs';

export function cleanAugmentIconName(name) {
  return name
    .replace(/^Cherry_/i, '')
    .replace(/_name$/i, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .trim();
}

function inspectArtwork(png) {
  let visible = 0,
    bright = 0,
    purple = 0,
    gold = 0;
  const vector = Array(144).fill(0);
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const offset = (y * png.width + x) * 4;
      const [r, g, b, a] = png.data.subarray(offset, offset + 4);
      if (a > 128) visible++;
      vector[Math.floor((y * 12) / png.height) * 12 + Math.floor((x * 12) / png.width)] +=
        ((0.2126 * r + 0.7152 * g + 0.0722 * b) * a) / 255;
      if (a < 128 || Math.max(r, g, b) < 110) continue;
      bright++;
      if (b > g * 1.12 && r > g * 1.06 && b > r * 0.95) purple++;
      if (r > b * 1.15 && g > b * 1.1 && r >= g * 0.95) gold++;
    }
  }
  const norm = Math.hypot(...vector) || 1;
  return {
    vector: vector.map((value) => value / norm),
    illustrated: visible / (png.width * png.height) > 0.95,
    rarity: purple / bright > 0.035 ? 'prismatic' : gold / bright > 0.12 ? 'gold' : 'silver',
  };
}

export async function enrichAugmentIcons() {
  const path = 'data/catalogs/augment-icons.json';
  const catalogue = JSON.parse(await readFile(path, 'utf8'));
  const vectors = new Map();
  const sourceCatalogues = new Map();
  for (const icon of catalogue.icons) {
    const art = inspectArtwork(PNG.sync.read(await readFile(`public/augments/icons/${icon.id}.png`)));
    vectors.set(icon.id, art.vector);
    // Opaque legacy illustrations have no silver/gold/prismatic palette. Use
    // their original game rarity, while tinted glyphs follow the actual artwork.
    if (art.illustrated && !icon.sourceRarity) {
      if (!sourceCatalogues.has(icon.version)) {
        const response = await fetch(`https://raw.communitydragon.org/${icon.version}/cdragon/arena/en_us.json`);
        if (!response.ok) throw new Error(`Unable to classify legacy icon rarity: ${icon.version}`);
        sourceCatalogues.set(icon.version, await response.json());
      }
      const source = sourceCatalogues
        .get(icon.version)
        .augments.find((augment) =>
          icon.searchTerms.includes(augment.iconLarge.toLowerCase().split('/').pop().replace('.png', '')),
        );
      if (source) icon.sourceRarity = ['silver', 'gold', 'prismatic'][source.rarity];
    }
    icon.rarity = art.illustrated ? (icon.sourceRarity ?? null) : art.rarity;
    icon.visualOrder = 99999;
    icon.name = cleanAugmentIconName(icon.name);
    icon.searchTerms = [...new Set([...icon.searchTerms, icon.name])];
  }

  // Keep related names together first, then arrange nearby silhouettes together.
  // Store the result locally: there is no image analysis or network work in UI.
  let order = 0;
  for (const rarity of ['silver', 'gold', 'prismatic']) {
    const remaining = catalogue.icons
      .filter((icon) => icon.rarity === rarity)
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    let current = remaining.shift();
    while (current) {
      current.visualOrder = order++;
      const vector = vectors.get(current.id);
      let nextIndex = 0,
        best = -Infinity;
      remaining.forEach((candidate, index) => {
        const other = vectors.get(candidate.id);
        const similarity = vector.reduce((sum, value, i) => sum + value * other[i], 0);
        const sameName = candidate.name.toLowerCase() === current.name.toLowerCase();
        const score = similarity + (sameName ? 2 : 0);
        if (score > best) {
          best = score;
          nextIndex = index;
        }
      });
      current = remaining.splice(nextIndex, 1)[0];
    }
  }
  await curateSilverAugmentIcons(catalogue);
  await curateGoldAugmentIcons(catalogue);
  await curatePrismaticAugmentIcons(catalogue);
  await writeFile(path, JSON.stringify(catalogue, null, 2) + '\n');
  console.log(
    'Classified and visually ordered icons:',
    Object.fromEntries(
      ['silver', 'gold', 'prismatic'].map((rarity) => [
        rarity,
        catalogue.icons.filter((icon) => icon.rarity === rarity).length,
      ]),
    ),
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await enrichAugmentIcons();
