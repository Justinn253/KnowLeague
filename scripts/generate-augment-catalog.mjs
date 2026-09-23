import { mkdir, writeFile } from 'node:fs/promises';
import { enrichAugmentIcons } from './enrich-augment-icons.mjs';
import { deduplicateAugmentIcons } from './deduplicate-augment-icons.mjs';

// Keep historical icons alongside current assets; gameplay never requests full datasets.
const versions = [
  ...Array.from({ length: 18 }, (_, i) => '16.' + (18 - i)),
  ...Array.from({ length: 24 }, (_, i) => '15.' + (24 - i)),
  ...Array.from({ length: 24 }, (_, i) => '14.' + (24 - i)),
  ...Array.from({ length: 11 }, (_, i) => '13.' + (24 - i)),
];
const root = 'https://raw.communitydragon.org';
const output = 'public/augments';
const excludedIconIds = new Set(['augment404_large']);
await mkdir(`${output}/icons`, { recursive: true });
await mkdir('data/catalogs', { recursive: true });
async function get(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  return response;
}
const icons = new Map();
for (const version of versions) {
  const catalogueResponse = await fetch(`${root}/${version}/cdragon/arena/en_us.json`);
  if (!catalogueResponse.ok && catalogueResponse.status !== 404)
    throw new Error(`${catalogueResponse.status}: Arena catalogue ${version}`);
  const data = catalogueResponse.ok ? await catalogueResponse.json() : { augments: [] };
  for (const augment of data.augments) {
    const path = augment.iconLarge.toLowerCase();
    const id = path.split('/').pop().replace('.png', '');
    if (excludedIconIds.has(id)) continue;
    if (!icons.has(id)) icons.set(id, { id, name: augment.name, path, version });
  }
  // The asset directory also retains Mayhem-specific and retired icons that are
  // not represented in the Arena gameplay catalogue.
  const directory = `${root}/${version}/game/assets/ux/cherry/augments/icons/`;
  const directoryResponse = await fetch(directory);
  if (!directoryResponse.ok && directoryResponse.status !== 404)
    throw new Error(`${directoryResponse.status}: icon directory ${version}`);
  const html = directoryResponse.ok ? await directoryResponse.text() : '';
  for (const match of html.matchAll(/href="([^"/]+(?:_large|_prismatic|_gold|_silver)\.png)"/g)) {
    const filename = match[1];
    const id = filename.replace('.png', '');
    if (excludedIconIds.has(id)) continue;
    if (!icons.has(id))
      icons.set(id, { id, name: id.replace(/_/g, ' '), path: `assets/ux/cherry/augments/icons/${filename}`, version });
  }
}
for (const version of versions.filter(
  (version) => version.startsWith('16.') || (version.startsWith('15.') && Number(version.split('.')[1]) >= 21),
)) {
  const directory = 'assets/ux/kiwi/augments/icons/';
  const html = await (await get(root + '/' + version + '/game/' + directory)).text();
  for (const match of html.matchAll(/href="([^"/]+_large\.png)"/g)) {
    const filename = match[1];
    const id = 'kiwi_' + filename.replace('.png', '');
    if (!icons.has(id))
      icons.set(id, {
        id,
        name: filename.replace('_large.png', '').replace(/_/g, ' '),
        path: directory + filename,
        version,
      });
  }
}
for (const name of ['beaufortforlol-bold.otf', 'spiegel-regular.otf']) {
  const response = await get(root + '/' + versions[0] + '/game/assets/ux/fonts/' + name);
  await writeFile(output + '/' + name, Buffer.from(await response.arrayBuffer()));
}
const entries = [...icons.values()];
let cursor = 0;
await Promise.all(
  Array.from({ length: 8 }, async () => {
    while (cursor < entries.length) {
      const entry = entries[cursor++];
      const response = await get(`${root}/${entry.version}/game/${entry.path}`);
      await writeFile(`${output}/icons/${entry.id}.png`, Buffer.from(await response.arrayBuffer()));
    }
  }),
);
for (const name of [
  'augmentcard_bg',
  'augmentcard_frame_silver',
  'augmentcard_frame_gold',
  'augmentcard_frame_prismatic',
]) {
  const response = await get(`${root}/${versions[0]}/game/assets/ux/cherry/augments/augmentselection/${name}.png`);
  await writeFile(`${output}/${name}.png`, Buffer.from(await response.arrayBuffer()));
}
await writeFile(
  'data/catalogs/augment-icons.json',
  JSON.stringify(
    {
      versions,
      icons: entries
        .map(({ id, name, version }) => ({ id, name, version }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    },
    null,
    2,
  ) + '\n',
);
await deduplicateAugmentIcons();
await enrichAugmentIcons();

const statNames = {
  "ap": "statsicon/scaleap",
  "ad": "statsicon/scalead",
  "health": "statsicon/scalehealth",
  "armor": "statsicon/scalearmor",
  "mr": "statsicon/scalemr",
  "lethality": "statsicon/scaleapen",
  "haste": "statsicon/scaleah",
  "speed": "statsicon/scalems",
  "heal": "statsicon/scalehealshield",
  "shield": "statsicon/scalehealshield",
  "ranged": "gameplay/rangedactive",
  "melee": "gameplay/meleeactive",
  "level": "statsicon/scalelevel",
  "attackspeed": "statsicon/scaleas",
  "mana": "statsicon/scalemana",
  "crit": "statsicon/scalecrit",
  "range": "statsicon/scalerange",
  "tenacity": "statsicon/scaletenacity",
  "lifesteal": "statsicon/scalels",
  "mpen": "statsicon/scalempen"
};
const style = await (await get(root + '/' + versions[0] + '/game/ux/fonts/css/stylesheet.cdtb.json')).json();
const stats = Object.fromEntries(
  Object.entries(statNames).map(([key, name]) => {
    const entry = style['assets/ux/fonts/texticons/lol/' + name + '.png'];
    if (!entry) throw new Error('Missing stat icon: ' + name);
    return [key, entry];
  }),
);
const statAtlas = await get(root + '/' + versions[0] + '/game/' + stats.ap.atlasPath);
await writeFile(output + '/stat-icons.png', Buffer.from(await statAtlas.arrayBuffer()));
await writeFile('data/catalogs/augment-stat-icons.json', JSON.stringify(stats, null, 2) + '\n');


