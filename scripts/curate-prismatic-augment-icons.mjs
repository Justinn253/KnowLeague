import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { curateAugmentIconGroups } from './curate-silver-augment-icons.mjs';

export async function curatePrismaticAugmentIcons(catalogue) {
  await curateAugmentIconGroups(catalogue, 'prismatic');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const path = new URL('../data/catalogs/augment-icons.json', import.meta.url);
  const catalogue = JSON.parse(await readFile(path, 'utf8'));
  await curatePrismaticAugmentIcons(catalogue);
  await writeFile(path, JSON.stringify(catalogue, null, 2) + '\n');
}
