import { readFile, writeFile } from 'node:fs/promises';

const catalogue = JSON.parse(await readFile('data/catalogs/augment-icons.json', 'utf8'));
const curatedShortDescriptions = JSON.parse(await readFile('data/catalogs/official-augment-short-descriptions.json', 'utf8'));
const versions = catalogue.versions;
const rarityLabels = ['silver', 'gold', 'prismatic'];
const wikiUrl = 'https://wiki.leagueoflegends.com/en-us/api.php?action=parse&page=Module%3AMayhemAugmentData%2Fdata&prop=wikitext&format=json';

function normalize(value) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// These are concise, in-game card effects for the archive preview. The full
// wiki/CommunityDragon text remains in `description` for the detail view.
const officialSummaryOverrides = new Map([
  ['porcupine', 'Taking damage from champions builds up a burst of needles that fly out of you, dealing damage and slowing nearby enemies.'],
  ['pressurecooker', 'Every second, apply a stacking Burn to nearby enemy champions, scaling with your [icon:health][health]max Health[/health].\n\nQUEST: Deal Burn damage to nearby enemy champions.\n\nREWARD: Size and damage increase per Quest Level.'],
  ['pursuitofhaste', 'QUEST: Hit enemy champions with your chosen ability the required number of times.'],
  ['pursuitofpower', 'QUEST: Hit an enemy champion with a specific ability 10 times (counts up to 1 hit per champion per cast instance).\n\nREWARD: Upon completing your Quest, increase the damage of the ability by 30%.'],
  ['spiritualpurification', 'Scoring a champion takedown causes the area around the slain champion to explode in a 500 unit radius, dealing adaptive damage to enemies within equal to 15% of their current [icon:health][health]health[/health] and leaving behind a zone for 1.5 seconds that slows enemies within by 60%.'],
  ['getexcited', 'Scoring a champion takedown grants you 100% bonus [icon:speed][speed]movement speed[/speed] and 15% total [icon:attackspeed]attack speed for 4 seconds.'],
]);
function iconIdFromPath(path) {
  const raw = path?.toLowerCase().split('/').pop()?.replace(/\.png$/i, '');
  if (!raw) return null;
  const resolved = catalogue.aliases?.[raw] ?? raw;
  return catalogue.icons.some((icon) => icon.id === resolved) ? resolved : null;
}

const byIconName = new Map();
for (const icon of catalogue.icons) {
  const key = normalize(icon.name);
  if (!byIconName.has(key)) byIconName.set(key, icon.id);
}

function decodeLua(value) {
  return value.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

function cleanWiki(value) {
  return decodeLua(value)
    .replace(/(?:type=[^,\n]+\|)?key=%[^,\n]*(?:[,\n]|$)/gi, '')
    .replace(/icononly=true\s*/gi, '')
    .replace(/,\s*,/g, ',')
    .replace(/\|(?:showtype|color|label1)=[^|,.\n]*/gi, '')
    .replace(/key=%\|key1=%\|type=[^|]+\|[^|]+\|[^|]+\|formula=[^,]+/gi, '')
    .replace(/<br\s*\/?>/gi, '\n\n')
    .replace(/\{\{as\|([^}|]+)(?:\|[^}]*)?\}\}/gi, '$1')
    .replace(/\{\{tip\|([^}|]+)(?:\|([^}]+))?\}\}/gi, (_, key, label) => label || key.replace(/[_-]+/g, ' '))
    .replace(/\{\{fd\|([^}|]+)(?:\|[^}]*)?\}\}/gi, '$1')
    .replace(/\{\{[^}|]+(?:\|([^}]+))?\}\}/g, '$1')
    .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/'''?/g, '')
    .replace(/''/g, '')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanHtml(value) {
  return value
    .replace(/<br\s*\/?>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/@[^@]+@/g, (token) => token.slice(1, -1).replace(/[*_]/g, ' '))
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const officialStatTags = new Map([
  ['ability power', 'ap'],
  ['attack damage', 'ad'],
  ['bonus attack damage', 'ad'],
  ['maximum health', 'health'],
  ['bonus health', 'health'],
  ['health', 'health'],
  ['magic resistance', 'mr'],
  ['bonus magic resistance', 'mr'],
  ['magic resist', 'mr'],
  ['bonus armor', 'armor'],
  ['armor', 'armor'],
  ['ability haste', 'haste'],
  ['move speed', 'speed'],
  ['healing', 'heal'],
  ['shield', 'shield'],
  ['lethality', 'lethality'],
]);

const officialMarkupTags = new Map([
  ['scaleAP', ['ap', 'ap']],
  ['scaleAD', ['ad', 'ad']],
  ['scaleHealth', ['health', 'health']],
  ['scaleArmor', ['armor', 'armor']],
  ['scaleMR', ['mr', 'mr']],
  ['healing', ['heal', 'heal']],
  ['shield', ['shield', 'shield']],
  ['speed', ['speed', 'speed']],
  ['attackSpeed', ['attackspeed', null]],
  ['crit', ['crit', null]],
  ['mana', ['mana', null]],
  ['lifesteal', ['lifesteal', null]],
]);

function resolveOfficialTokens(value, dataValues = {}) {
  return value
    .replace(/@([A-Za-z0-9_]+)(?:\*([0-9.]+))?@/g, (token, key, multiplier) => {
      const raw = dataValues[key]?.[0];
      if (typeof raw === 'number' && Number.isFinite(raw)) {
        const result = raw * (multiplier ? Number(multiplier) : 1);
        return Number.isInteger(result) ? String(result) : String(Number(result.toFixed(2)));
      }
      return key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
    })
    .replace(/\{\{[^}]+\}\}/g, '')
    .replace(/%i:[^%]+%/g, '');
}

function formatOfficialTooltip(value, dataValues = {}) {
  let source = resolveOfficialTokens(value, dataValues);
  for (const [sourceTag, markup] of officialMarkupTags) {
    const [iconTag, statTag] = markup;
    source = source
      .replace(new RegExp('<' + sourceTag + '>', 'gi'), '[icon:' + iconTag + ']' + (statTag ? '[' + statTag + ']' : ''))
      .replace(new RegExp('</' + sourceTag + '>', 'gi'), statTag ? '[/' + statTag + ']' : '');
  }
  const cleaned = cleanHtml(source);
  if (!cleaned) return '';
  const protectedRuns = [];
  const masked = cleaned.replace(/\[icon:(?:ap|ad|health|armor|mr|lethality|haste|speed|heal|shield|crit|mana|lifesteal|attackspeed)\]|\[(ap|ad|health|armor|mr|lethality|haste|speed|heal|shield|crit|mana|lifesteal|attackspeed)\][\s\S]*?\[\/\1\]/gi, (run) => {
    protectedRuns.push(run);
    return '__OFFICIAL_TAG_' + (protectedRuns.length - 1) + '__';
  });
  const statPattern = /\b(bonus magic resistance|magic resistance|magic resist|bonus attack damage|ability power|attack damage|maximum health|bonus health|ability haste|move speed|healing|shield|lethality|bonus armor|health|armor)\b/gi;
  const styled = masked.replace(statPattern, (match) => {
    const tag = officialStatTags.get(match.toLowerCase());
    return tag ? '[icon:' + tag + '][' + tag + ']' + match + '[/' + tag + ']' : match;
  });
  return styled.replace(/__OFFICIAL_TAG_(\d+)__/g, (_, index) => protectedRuns[Number(index)]);
}

function formatOfficialPreview(value, dataValues = {}) {
  const formatted = formatOfficialTooltip(value, dataValues);
  const visible = formatted.replace(/\[(?:\/?[\w-]+|icon:[\w-]+)\]/g, '');
  if (visible.length <= 280) return formatted;
  const plain = cleanHtml(resolveOfficialTokens(value, dataValues))
    .replace(/\{\{[^}]+\}\}/g, '')
    .replace(/%i:[^%]+%/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const firstParagraph = plain.split(/\n{2,}/)[0].trim();
  const candidate = firstParagraph.length >= 80 ? firstParagraph : plain;
  const shortened = candidate.length > 280
    ? candidate.slice(0, 279).replace(/\s+\S*$/, '') + '…'
    : candidate;
  return formatOfficialTooltip(shortened, dataValues);
}
const wikiResponse = await fetch(wikiUrl);
if (!wikiResponse.ok) throw new Error('Wiki request failed: ' + wikiResponse.status);
const wikiPayload = await wikiResponse.json();
const wikiText = wikiPayload.parse?.wikitext?.['*'] ?? '';
const wikiEntries = [];
const wikiPattern = /\["([^"]+)"\]\s*=\s*\{\s*\["description"\]\s*=\s*"((?:\\.|[^"\\])*)",\s*\["tier"\]\s*=\s*"([^"]+)"/g;
let match;
while ((match = wikiPattern.exec(wikiText))) {
  wikiEntries.push({ name: match[1], description: cleanWiki(match[2]), tier: match[3].toLowerCase() });
}

const sourceByName = new Map();
for (let offset = 0; offset < versions.length; offset += 8) {
  const batch = versions.slice(offset, offset + 8);
  const results = await Promise.all(batch.map(async (version) => {
    const response = await fetch('https://raw.communitydragon.org/' + version + '/cdragon/arena/en_us.json');
    if (!response.ok) return [];
    const payload = await response.json();
    return (payload.augments ?? [])
      .filter((augment) => [0, 1, 2].includes(augment.rarity) && augment.name && augment.iconLarge)
      .map((augment) => ({
        version,
        name: augment.name,
        description: cleanHtml(augment.desc || augment.tooltip || ''),
        tooltip: cleanHtml(augment.tooltip || augment.desc || ''),
        dataValues: augment.dataValues || {},

        rarity: rarityLabels[augment.rarity],
        icon: iconIdFromPath(augment.iconLarge),
      }));
  }));
  for (const records of results) {
    for (const record of records) {
      const key = normalize(record.name);
      const history = sourceByName.get(key) ?? [];
      if (!history.some((item) => item.version === record.version && item.description === record.description)) history.push(record);
      sourceByName.set(key, history);
    }
  }
}

const usedIds = new Set();
function makeId(name) {
  const base = 'official-' + (normalize(name) || 'augment');
  let id = base;
  let suffix = 2;
  while (usedIds.has(id)) id = base + '-' + suffix++;
  usedIds.add(id);
  return id;
}

const records = [];
for (const entry of wikiEntries) {
  const key = normalize(entry.name);
  const history = sourceByName.get(key) ?? [];
  const latest = history[0];
  records.push({
    id: makeId(entry.name),
    name: entry.name,
    rarity: entry.tier,
    tier: entry.tier,
    description: entry.description || latest?.description || 'Official augment data is available.',
    shortDescription: curatedShortDescriptions[entry.name] || (latest?.tooltip ? (formatOfficialTooltip(latest.tooltip, latest.dataValues) || latest.description || officialSummaryOverrides.get(key) || formatOfficialPreview(entry.description) || entry.description) : officialSummaryOverrides.get(key) || formatOfficialPreview(entry.description) || entry.description || 'Official augment data is available.'),
    icon: latest?.icon ?? byIconName.get(key) ?? null,
    current: true,
    versions: [...new Set(history.map((item) => item.version))],
    source: 'League wiki',
  });
}
records.sort((a, b) => a.rarity.localeCompare(b.rarity) || a.name.localeCompare(b.name));
await writeFile('data/catalogs/official-augments.json', JSON.stringify({ generatedFrom: 'League wiki and CommunityDragon', versions, augments: records }, null, 2) + '\n');
console.log('Wrote ' + records.length + ' official augment records.');



