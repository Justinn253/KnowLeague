import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Keep this game on an explicit, reviewable patch. Never fetch catalogues in gameplay.
const version = '16.18.1';
const patch = version.split('.').slice(0, 2).join('.');
const ddragon = `https://ddragon.leagueoflegends.com/cdn/${version}`;
const cdragon = `https://raw.communitydragon.org/${patch}`;
async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  return response.json();
}

const [championData, itemData, itemBin] = await Promise.all([
  getJson(`${ddragon}/data/en_US/champion.json`),
  getJson(`${ddragon}/data/en_US/item.json`),
  getJson(`${cdragon}/game/items.cdtb.bin.json`),
]);

const champions = [];
// Bounded requests for exact attack identities (including champions with two forms).
const entries = Object.values(championData.data);
for (let start = 0; start < entries.length; start += 8) {
  champions.push(...await Promise.all(entries.slice(start, start + 8).map(async (champion) => {
    const detail = await getJson(`${cdragon}/plugins/rcp-be-lol-game-data/global/default/v1/champions/${champion.key}.json`);
    const attackType = detail.tacticalInfo.attackType;
    if (!['melee', 'ranged'].includes(attackType)) throw new Error(`Unknown attack type: ${champion.id}`);
    return {
      id: champion.id,
      name: champion.name,
      imageUrl: `${ddragon}/img/champion/${champion.image.full}`,
      attackTypes: ['Elise', 'Gnar', 'Jayce', 'Nidalee'].includes(champion.id) ? ['melee', 'ranged'] : [attackType],
    };
  })));
}

// Riot item-shop class flags from mItemAttributes; preserve every explicit membership.
const shopClasses = { 1: 'Fighter', 2: 'Marksman', 4: 'Assassin', 8: 'Tank', 16: 'Mage', 32: 'Support' };

const items = Object.entries(itemData.data).flatMap(([id, item]) => {
  const bin = itemBin[`Items/${id}`];
  const boots = item.tags.includes('Boots');
  // Only normal, purchasable SR/ARAM equipment. Exclude mode variants, consumables,
  // components, quest/Ornn upgrades, and items requiring a special currency.
  if (!bin || Number(id) >= 10000 || (!item.maps['11'] && !item.maps['12']) || !item.gold.purchasable
    || item.inStore === false || !bin.mItemDataAvailability?.mInStore
    || bin.consumed || bin.consumeOnAcquire || bin.mRequiredLevel > 18
    || bin.mRequiredPurchaseBuff || bin.mRequiredBuffCurrencyName
    || item.requiredAlly || item.requiredChampion || item.specialRecipe
    || !(bin.epicness === 5 || (boots && bin.epicness === 4))) return [];

  const shopAttributes = bin.mItemAttributes ?? [];
  if (shopAttributes.some((attribute) => !Object.hasOwn(shopClasses, attribute))) {
    throw new Error(`Unknown shop class for ${item.name}: ${shopAttributes}`);
  }
  const types = [...new Set(shopAttributes.map((attribute) => shopClasses[attribute]))];
  if (!boots && !types.length) return [];

  const identities = bin.mRequiredPurchaseIdentities ?? [];
  if (identities.some((identity) => !['Melee', 'Ranged'].includes(identity))) {
    throw new Error(`Review purchase identities for ${item.name}: ${identities}`);
  }
  const groups = (bin.mItemGroups ?? []).flatMap((group) => {
    const definition = itemBin[group];
    if (!definition) throw new Error(`Missing item group: ${group}`);
    return definition.mMaxGroupOwnable === 1 ? [group] : [];
  });
  const modes = [item.maps['11'] ? 'summoners-rift' : null, item.maps['12'] ? 'aram' : null].filter((mode) => mode !== null);
  return [{
    id, name: item.name, imageUrl: `${ddragon}/img/item/${item.image.full}`,
    types, shopAttributes, boots, groups, attackType: identities[0]?.toLowerCase() ?? null, modes,
  }];
});

if (champions.length < 170 || items.length < 70) throw new Error('Incomplete Randodraft catalogue');
const output = path.join(process.cwd(), 'data/catalogs/randodraft.json');
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify({
  version,
  sources: [`${ddragon}/data/en_US/champion.json`, `${ddragon}/data/en_US/item.json`, `${cdragon}/game/items.cdtb.bin.json`],
  champions: champions.sort((a, b) => a.name.localeCompare(b.name)),
  items: items.sort((a, b) => a.name.localeCompare(b.name)),
}, null, 2)}\n`);
console.log(`Randodraft ${version}: ${champions.length} champions, ${items.length} items`);
