import { createHash } from 'node:crypto';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

// Compare decoded pixels, not PNG compression or metadata. Invisible RGB values
// cannot affect appearance and should not create extra choices in the picker.
export function augmentImageHash(buffer) {
  const { width, height, data } = PNG.sync.read(buffer);
  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3] === 0) data.fill(0, offset, offset + 3);
  }
  return createHash('sha256').update(`${width}x${height}:`).update(data).digest('hex');
}

export async function deduplicateAugmentIcons() {
  const cataloguePath = 'data/catalogs/augment-icons.json';
  const catalogue = JSON.parse(await readFile(cataloguePath, 'utf8'));
  const directory = resolve('public/augments/icons');
  const groups = new Map();
  const aliases = { ...catalogue.aliases };
  const duplicates = [];

  for (const icon of catalogue.icons) {
    const path = resolve(directory, `${icon.id}.png`);
    if (dirname(path) !== directory) throw new Error(`Invalid icon path: ${icon.id}`);
    const hash = augmentImageHash(await readFile(path));
    const canonical = groups.get(hash);
    const searchTerms = icon.searchTerms ?? [icon.name, icon.id];
    if (canonical) {
      aliases[icon.id] = canonical.id;
      canonical.searchTerms = [...new Set([...canonical.searchTerms, ...searchTerms])];
      duplicates.push(path);
    } else {
      groups.set(hash, { ...icon, searchTerms });
    }
  }

  // Flatten existing mappings too, making repeated local runs idempotent.
  for (const id of Object.keys(aliases)) {
    const visited = new Set([id]);
    let target = aliases[id];
    while (aliases[target]) {
      if (visited.has(target)) throw new Error(`Cyclic icon alias: ${id}`);
      visited.add(target);
      target = aliases[target];
    }
    aliases[id] = target;
  }
  const icons = [...groups.values()];
  const canonicalIds = new Set(icons.map((icon) => icon.id));
  if (Object.values(aliases).some((id) => !canonicalIds.has(id))) throw new Error('Missing canonical icon.');

  await writeFile(cataloguePath, JSON.stringify({ ...catalogue, icons, aliases }, null, 2) + '\n');
  // Remove only files proven identical above, after their aliases are persisted.
  await Promise.all(duplicates.map((path) => unlink(path)));
  console.log(`Kept ${icons.length} unique augment PNGs; removed ${duplicates.length} duplicates.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await deduplicateAugmentIcons();
}
