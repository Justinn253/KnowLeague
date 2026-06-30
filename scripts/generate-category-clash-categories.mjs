import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skinItems = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/catalogs/skin-items.json'), 'utf8'));
const abilityItems = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/catalogs/ability-items.json'), 'utf8'));

function slugify(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function answer(label, aliases = []) {
  return {
    id: slugify(label),
    label,
    ...(aliases.length > 0 ? { aliases } : {}),
  };
}

function category({ id, group, label, prompt, source, answers, notes }) {
  return {
    id,
    group,
    label,
    prompt,
    source,
    ...(notes ? { notes } : {}),
    answers: answers
      .filter((entry, index, allEntries) => allEntries.findIndex((candidate) => candidate.id === entry.id) === index)
      .sort((left, right) => left.label.localeCompare(right.label)),
  };
}

const manualCategories = [
  category({
    id: 'jungle-monsters',
    group: 'Jungle',
    label: 'Jungle Monsters',
    prompt: 'Name a jungle monster or epic monster.',
    source: 'manual',
    answers: [
      answer('Blue Sentinel', ['Blue Buff']),
      answer('Red Brambleback', ['Red Buff']),
      answer('Gromp'),
      answer('Greater Murk Wolf', ['Murk Wolf', 'Wolves']),
      answer('Ancient Krug', ['Krugs']),
      answer('Crimson Raptor', ['Raptors']),
      answer('Rift Scuttler', ['Scuttle Crab', 'Scuttle']),
      answer('Voidgrub', ['Void Grub', 'Grubs']),
      answer('Rift Herald', ['Herald']),
      answer('Baron Nashor', ['Baron']),
      answer('Dragon', ['Drake']),
      answer('Chemtech Drake', ['Chemtech Dragon']),
      answer('Cloud Drake', ['Cloud Dragon']),
      answer('Hextech Drake', ['Hextech Dragon']),
      answer('Infernal Drake', ['Infernal Dragon']),
      answer('Mountain Drake', ['Mountain Dragon']),
      answer('Ocean Drake', ['Ocean Dragon']),
      answer('Elder Dragon', ['Elder Drake']),
      answer('Atakhan, Bringer of Ruin', ['Atakhan']),
    ],
  }),
  category({
    id: 'summoner-spells',
    group: 'Spells',
    label: 'Summoner Spells',
    prompt: 'Name a summoner spell.',
    source: 'manual',
    answers: [
      answer('Barrier'),
      answer('Cleanse'),
      answer('Clarity'),
      answer('Exhaust'),
      answer('Flash'),
      answer('Ghost'),
      answer('Heal'),
      answer('Ignite'),
      answer('Mark', ['Snowball']),
      answer('Smite'),
      answer('Teleport'),
    ],
  }),
  category({
    id: 'keystone-runes',
    group: 'Runes',
    label: 'Keystone Runes',
    prompt: 'Name a keystone rune.',
    source: 'manual',
    answers: [
      answer('Press the Attack'),
      answer('Lethal Tempo'),
      answer('Fleet Footwork'),
      answer('Conqueror'),
      answer('Electrocute'),
      answer('Dark Harvest'),
      answer('Hail of Blades'),
      answer('Summon Aery'),
      answer('Arcane Comet'),
      answer('Phase Rush'),
      answer('Grasp of the Undying', ['Grasp']),
      answer('Aftershock'),
      answer('Guardian'),
      answer('Glacial Augment'),
      answer('Unsealed Spellbook'),
      answer('First Strike'),
    ],
  }),
  category({
    id: 'minor-runes',
    group: 'Runes',
    label: 'Minor Runes',
    prompt: 'Name a non-keystone rune.',
    source: 'manual',
    answers: [
      answer('Absorb Life'),
      answer('Triumph'),
      answer('Presence of Mind'),
      answer('Legend: Alacrity', ['Legend Alacrity']),
      answer('Legend: Haste', ['Legend Haste']),
      answer('Legend: Bloodline', ['Legend Bloodline']),
      answer('Coup de Grace'),
      answer('Cut Down'),
      answer('Last Stand'),
      answer('Cheap Shot'),
      answer('Taste of Blood'),
      answer('Sudden Impact'),
      answer('Sixth Sense'),
      answer('Grisly Mementos'),
      answer('Deep Ward'),
      answer('Treasure Hunter'),
      answer('Relentless Hunter'),
      answer('Ultimate Hunter'),
      answer('Axiom Arcanist'),
      answer('Manaflow Band'),
      answer('Nimbus Cloak'),
      answer('Transcendence'),
      answer('Celerity'),
      answer('Absolute Focus'),
      answer('Scorch'),
      answer('Waterwalking'),
      answer('Gathering Storm'),
      answer('Demolish'),
      answer('Font of Life'),
      answer('Shield Bash'),
      answer('Conditioning'),
      answer('Second Wind'),
      answer('Bone Plating'),
      answer('Overgrowth'),
      answer('Revitalize'),
      answer('Unflinching'),
      answer('Hextech Flashtraption', ['Hexflash']),
      answer('Magical Footwear'),
      answer('Cash Back'),
      answer('Triple Tonic'),
      answer('Time Warp Tonic'),
      answer('Biscuit Delivery'),
      answer('Cosmic Insight'),
      answer('Approach Velocity'),
      answer('Jack Of All Trades', ['Jack of All Trades']),
    ],
  }),
  category({
    id: 'items-attack-damage',
    group: 'Items',
    label: 'Items With Attack Damage',
    prompt: 'Name an item that grants attack damage.',
    source: 'manual',
    answers: [
      answer('B. F. Sword', ['BF Sword']),
      answer('Bloodthirster'),
      answer('Blade of the Ruined King', ['BORK', 'BotRK']),
      answer('Black Cleaver'),
      answer('Chempunk Chainsword'),
      answer('Death Dance', ["Death's Dance"]),
      answer('Eclipse'),
      answer('Essence Reaver'),
      answer('Guardian Angel'),
      answer('Hubris'),
      answer('Immortal Shieldbow', ['Shieldbow']),
      answer('Infinity Edge'),
      answer('Kraken Slayer'),
      answer('Lord Dominik Regards', ["Lord Dominik's Regards", 'LDR']),
      answer('Manamune'),
      answer('Maw of Malmortius', ['Maw']),
      answer('Mercurial Scimitar'),
      answer('Mortal Reminder'),
      answer('Muramana'),
      answer('Opportunity'),
      answer('Profane Hydra'),
      answer('Ravenous Hydra'),
      answer('Serylda Grudge', ["Serylda's Grudge"]),
      answer('Serpent Fang', ["Serpent's Fang"]),
      answer('Spear of Shojin', ['Shojin']),
      answer('Statikk Shiv', ['Shiv']),
      answer('Sterak Gage', ["Sterak's Gage", 'Steraks']),
      answer('Stridebreaker'),
      answer('The Collector', ['Collector']),
      answer('Titanic Hydra'),
      answer('Trinity Force', ['Triforce']),
      answer('Yun Tal Wildarrows', ['Yun Tal']),
    ],
  }),
  category({
    id: 'items-ability-power',
    group: 'Items',
    label: 'Items With Ability Power',
    prompt: 'Name an item that grants ability power.',
    source: 'manual',
    answers: [
      answer('Amplifying Tome'),
      answer('Archangel Staff', ["Archangel's Staff"]),
      answer('Banshee Veil', ["Banshee's Veil"]),
      answer('Blackfire Torch'),
      answer('Cosmic Drive'),
      answer('Cryptbloom'),
      answer('Deathcap', ["Rabadon's Deathcap", 'Rabadons']),
      answer('Horizon Focus'),
      answer('Liandry Torment', ["Liandry's Torment", 'Liandrys']),
      answer('Lich Bane'),
      answer('Luden Companion', ["Luden's Companion", 'Ludens']),
      answer('Malignance'),
      answer('Mejai Soulstealer', ["Mejai's Soulstealer", 'Mejais']),
      answer('Morellonomicon'),
      answer('Nashor Tooth', ["Nashor's Tooth", 'Nashors']),
      answer('Needlessly Large Rod'),
      answer('Riftmaker'),
      answer('Rod of Ages', ['ROA']),
      answer('Rylai Crystal Scepter', ["Rylai's Crystal Scepter", 'Rylais']),
      answer('Seraph Embrace', ["Seraph's Embrace", 'Seraphs']),
      answer('Shadowflame'),
      answer('Shurelya Battlesong', ["Shurelya's Battlesong", 'Shurelyas']),
      answer('Stormsurge'),
      answer('Void Staff'),
      answer('Zhonya Hourglass', ["Zhonya's Hourglass", 'Zhonyas']),
    ],
  }),
  category({
    id: 'items-ability-haste',
    group: 'Items',
    label: 'Items With Ability Haste',
    prompt: 'Name an item that grants ability haste.',
    source: 'manual',
    answers: [
      answer('Axiom Arc'),
      answer('Black Cleaver'),
      answer('Blackfire Torch'),
      answer('Cosmic Drive'),
      answer('Dawncore'),
      answer('Eclipse'),
      answer('Essence Reaver'),
      answer('Frozen Heart'),
      answer('Heartsteel'),
      answer('Hextech Rocketbelt', ['Rocketbelt']),
      answer('Horizon Focus'),
      answer('Iceborn Gauntlet'),
      answer('Imperial Mandate'),
      answer('Jak Sho, The Protean', ["Jak'Sho, The Protean", 'Jaksho']),
      answer('Knight Vow', ["Knight's Vow"]),
      answer('Liandry Torment', ["Liandry's Torment", 'Liandrys']),
      answer('Locket of the Iron Solari', ['Locket']),
      answer('Malignance'),
      answer('Redemption'),
      answer('Riftmaker'),
      answer('Serylda Grudge', ["Serylda's Grudge"]),
      answer('Spear of Shojin', ['Shojin']),
      answer('Spirit Visage'),
      answer('Staff of Flowing Water'),
      answer('Stridebreaker'),
      answer('Unending Despair'),
      answer('Vigilant Wardstone', ['Wardstone']),
      answer('Winter Approach', ["Winter's Approach"]),
      answer('Zeke Convergence', ["Zeke's Convergence", 'Zekes']),
    ],
  }),
  category({
    id: 'items-health',
    group: 'Items',
    label: 'Items With Health',
    prompt: 'Name an item that grants health.',
    source: 'manual',
    answers: [
      answer('Abyssal Mask'),
      answer('Anathema Chains', ["Anathema's Chains"]),
      answer('Black Cleaver'),
      answer('Bloodmail'),
      answer('Cosmic Drive'),
      answer('Dead Man Plate', ["Dead Man's Plate", 'DMP']),
      answer('Edge of Night'),
      answer('Experimental Hexplate'),
      answer('Fimbulwinter'),
      answer('Heartsteel'),
      answer('Hextech Rocketbelt', ['Rocketbelt']),
      answer('Hollow Radiance'),
      answer('Hullbreaker'),
      answer('Iceborn Gauntlet'),
      answer('Jak Sho, The Protean', ["Jak'Sho, The Protean", 'Jaksho']),
      answer('Kaenic Rookern'),
      answer('Knight Vow', ["Knight's Vow"]),
      answer('Liandry Torment', ["Liandry's Torment", 'Liandrys']),
      answer('Locket of the Iron Solari', ['Locket']),
      answer('Morellonomicon'),
      answer('Overlord Bloodmail', ['Bloodmail']),
      answer('Randuin Omen', ["Randuin's Omen", 'Randuins']),
      answer('Redemption'),
      answer('Riftmaker'),
      answer('Rod of Ages', ['ROA']),
      answer('Rylai Crystal Scepter', ["Rylai's Crystal Scepter", 'Rylais']),
      answer('Spirit Visage'),
      answer('Sterak Gage', ["Sterak's Gage", 'Steraks']),
      answer('Stridebreaker'),
      answer('Sunfire Aegis'),
      answer('Thornmail'),
      answer('Titanic Hydra'),
      answer('Trailblazer'),
      answer('Unending Despair'),
      answer('Warmog Armor', ["Warmog's Armor", 'Warmogs']),
      answer('Winter Approach', ["Winter's Approach"]),
      answer('Zeke Convergence', ["Zeke's Convergence", 'Zekes']),
    ],
  }),
  category({
    id: 'items-mana-regen',
    group: 'Items',
    label: 'Items With Mana Regen',
    prompt: 'Name an item that grants mana regeneration.',
    source: 'manual',
    answers: [
      answer('Dawncore'),
      answer('Dream Maker'),
      answer('Echoes of Helia'),
      answer('Imperial Mandate'),
      answer('Moonstone Renewer', ['Moonstone']),
      answer('Redemption'),
      answer('Shard of True Ice'),
      answer('Shurelya Battlesong', ["Shurelya's Battlesong", 'Shurelyas']),
      answer('Staff of Flowing Water'),
      answer('World Atlas'),
      answer('Zak Zak Realmspike', ["Zaz'Zak's Realmspike", 'ZazZak']),
    ],
  }),
  category({
    id: 'aram-mayhem-augments',
    group: 'ARAM Mayhem',
    label: 'ARAM Mayhem Augments',
    prompt: 'Name an ARAM Mayhem augment.',
    source: 'manual',
    notes: 'Seeded manually because this repository has no generated ARAM Mayhem augment catalogue. Update this list when the mode changes.',
    answers: [
      answer('Accelerating Sorcery'),
      answer('Apex Inventor'),
      answer('Back To Basics'),
      answer('Blade Waltz'),
      answer('Bread And Butter', ['Bread & Butter']),
      answer('Bread And Cheese', ['Bread & Cheese']),
      answer('Bread And Jam', ['Bread & Jam']),
      answer('Chain Lightning'),
      answer('Circle of Death'),
      answer('Contract Killer'),
      answer('Dashing'),
      answer('Dawnbringer Resolve'),
      answer('Deft'),
      answer('Demon Dance'),
      answer('Erosion'),
      answer('Ethereal Weapon'),
      answer('Fallen Aegis'),
      answer('Firebrand'),
      answer('From Beginning To End'),
      answer('Giant Slayer'),
      answer('Goredrink'),
      answer('Guilty Pleasure'),
      answer('Infernal Conduit'),
      answer('Jeweled Gauntlet'),
      answer('Magic Missile'),
      answer('Marksmage'),
      answer('Mystic Punch'),
      answer('Omni Soul'),
      answer('Phenomenal Evil'),
      answer('Quest: Angel of Retribution', ['Angel of Retribution']),
      answer('Quest: Steel Your Heart', ['Steel Your Heart']),
      answer('Raid Boss'),
      answer('Scopier Weapons'),
      answer('Scoped Weapons'),
      answer('Slow Cooker'),
      answer('Spellwake'),
      answer('Thread the Needle'),
      answer('Tormentor'),
      answer('Trueshot Prodigy'),
      answer('Twice Thrice'),
      answer('Ultimate Revolution'),
      answer('Vulnerability'),
      answer('Witchful Thinking'),
    ],
  }),
];

const championByRole = new Map();
for (const skin of skinItems) {
  if (!skin.champion || !skin.role) continue;
  const role = String(skin.role).toLowerCase();
  const champions = championByRole.get(role) ?? new Set();
  champions.add(skin.champion);
  championByRole.set(role, champions);
}

const roleCategories = [...championByRole.entries()]
  .filter(([, champions]) => champions.size >= 4)
  .map(([role, champions]) => category({
    id: `champion-class-${slugify(role)}`,
    group: 'Champion Classes',
    label: `${role.charAt(0).toUpperCase()}${role.slice(1)} Champions`,
    prompt: `Name a ${role} champion.`,
    source: 'generated from data/catalogs/skin-items.json role fields',
    answers: [...champions].map((champion) => answer(champion)),
  }));

const championsBySkinLine = new Map();
const skinCountByLine = new Map();
for (const skin of skinItems) {
  if (!skin.skinLine || skin.skinLine === 'None' || !skin.champion) continue;
  const skinLine = String(skin.skinLine);
  skinCountByLine.set(skinLine, (skinCountByLine.get(skinLine) ?? 0) + 1);
  const champions = championsBySkinLine.get(skinLine) ?? new Set();
  champions.add(skin.champion);
  championsBySkinLine.set(skinLine, champions);
}

const skinLineCategories = [...championsBySkinLine.entries()]
  .filter(([skinLine, champions]) => (skinCountByLine.get(skinLine) ?? 0) >= 8 && champions.size >= 6)
  .map(([skinLine, champions]) => category({
    id: `skin-line-${slugify(skinLine)}`,
    group: 'Skin Lines',
    label: `${skinLine} Champions`,
    prompt: `Name a champion with a ${skinLine} skin.`,
    source: 'generated from data/catalogs/skin-items.json skinLine fields',
    answers: [...champions].map((champion) => answer(champion)),
  }));

const ultimateNames = abilityItems
  .filter((item) => item.type === 'ultimate' && item.answer)
  .map((item) => item.answer);

const generatedCategories = [
  ...roleCategories,
  ...skinLineCategories,
  category({
    id: 'ultimate-ability-names',
    group: 'Abilities',
    label: 'Ultimate Ability Names',
    prompt: 'Name a champion ultimate ability.',
    source: 'generated from data/catalogs/ability-items.json ultimate entries',
    answers: ultimateNames.map((ultimate) => answer(ultimate)),
  }),
];

const output = {
  version: 1,
  name: 'Category Clash Categories',
  generatedAt: new Date().toISOString(),
  dataSnapshot: {
    localCatalogues: [
      'data/catalogs/skin-items.json',
      'data/catalogs/ability-items.json',
    ],
    note: 'Gameplay imports this JSON document only. Regenerate or manually edit it when League data changes.',
  },
  categories: [...manualCategories, ...generatedCategories].sort((left, right) => (
    left.group.localeCompare(right.group) || left.label.localeCompare(right.label)
  )),
};

fs.writeFileSync(
  path.join(rootDir, 'data/category-clash-categories.json'),
  `${JSON.stringify(output, null, 2)}\n`,
);
