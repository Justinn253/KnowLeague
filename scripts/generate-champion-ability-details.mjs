import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * A bounded proof of the Champion Hub client-tooltip pipeline.
 *
 * This intentionally supports Aatrox only. It consumes the same patch-pinned
 * client BIN and localisation data used by League, validates the fields this
 * champion needs, and emits a runtime-local catalogue. Future champions should
 * add a normalizer only after their spell variants are reviewed.
 */
const champion = (process.argv[2] ?? 'aatrox').toLowerCase();
const patch = '14.24';
const communityDragon = `https://raw.communitydragon.org/${patch}`;
const sourceUrls = {
  bin: `${communityDragon}/game/data/characters/aatrox/aatrox.bin.json`,
  strings: `${communityDragon}/game/en_us/data/menu/en_us/lol.stringtable.json`,
};
const outputPath = path.join(process.cwd(), 'data/catalogs/champion-ability-details.json');

if (champion !== 'aatrox') {
  throw new Error(`This proof-of-concept only supports Aatrox. Received: ${champion}`);
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  return response.json();
}

function getSpell(bin, pathName) {
  const spell = bin[pathName]?.mSpell;
  if (!spell) throw new Error(`Missing spell definition: ${pathName}`);
  return spell;
}

function getTooltip(strings, key, requiredToken) {
  const tooltip = strings.entries?.[key];
  if (typeof tooltip !== 'string' || !tooltip.includes(requiredToken)) {
    throw new Error(`Unexpected or missing tooltip data: ${key}`);
  }
  return tooltip;
}

function ranks(spell, name, rankCount) {
  const dataValue = spell.mDataValues?.find((candidate) => candidate.mName === name)?.mValues;
  const result = dataValue?.slice(1, rankCount + 1);
  if (!result || result.length !== rankCount || result.some((value) => typeof value !== 'number')) {
    throw new Error(`Missing ${rankCount} rank values for ${name}`);
  }
  return result;
}

function cooldowns(spell, rankCount) {
  const result = spell.cooldownTime?.slice(1, rankCount + 1);
  if (!result || result.length !== rankCount || result.some((value) => typeof value !== 'number')) {
    throw new Error('Missing spell cooldown ranks');
  }
  return result;
}

function fixed(value, decimals = 2) {
  return Number(value.toFixed(decimals)).toString();
}

function percent(value, decimals = 2) {
  return `${fixed(value * 100, decimals)}%`;
}

function seconds(value) {
  return `${fixed(value)} sec`;
}

function slash(values) {
  return values.join(' / ');
}

function aatroxDetails(bin, strings) {
  const passive = getSpell(bin, 'Characters/Aatrox/Spells/AatroxPassiveAbility/AatroxPassive');
  const q = getSpell(bin, 'Characters/Aatrox/Spells/AatroxQAbility/AatroxQ');
  const w = getSpell(bin, 'Characters/Aatrox/Spells/AatroxWAbility/AatroxW');
  const e = getSpell(bin, 'Characters/Aatrox/Spells/AatroxEAbility/AatroxE');
  const r = getSpell(bin, 'Characters/Aatrox/Spells/AatroxRAbility/AatroxR');

  getTooltip(strings, 'passive_aatroxpassive_tooltip', '@PDamage@');
  getTooltip(strings, 'passive_aatroxpassive_tooltipextended', '@PMonsterCap@');
  getTooltip(strings, 'spell_aatroxq_tooltip', '@QDamage@');
  getTooltip(strings, 'spell_aatroxq_tooltipextendedbelowline', '@QMinionDamage@');
  const wTooltip = getTooltip(strings, 'spell_aatroxw_tooltip', '@WDamage@');
  getTooltip(strings, 'spell_aatroxw_tooltipextendedbelowline', 'double damage');
  getTooltip(strings, 'spell_aatroxe_tooltip', '@TotalEVamp@');
  getTooltip(strings, 'spell_aatroxr_tooltip', '@RTotalADAmp');
  getTooltip(strings, 'spell_aatroxr_tooltipextendedbelowline', '@RDuration@');

  const passiveDamage = passive.mSpellCalculations?.PDamage?.mFormulaParts?.[0];
  const passiveCooldown = passive.mSpellCalculations?.PCooldown?.mFormulaParts?.[0];
  if (!passiveDamage || !passiveCooldown) throw new Error('Missing passive level-scaling calculations');

  const qBaseDamage = ranks(q, 'QBaseDamage', 5);
  const qTotalAd = ranks(q, 'QTotalADRatio', 5);
  const qMinionDamage = q.mSpellCalculations?.QMinionDamage?.mFormulaParts?.[0];
  if (!qMinionDamage?.mBreakpoints) throw new Error('Missing Q minion-damage breakpoints');
  let minionDamage = qMinionDamage.mLevel1Value;
  const qMinionValues = [`${percent(minionDamage)} (level 1)`];
  for (const breakpoint of qMinionDamage.mBreakpoints) {
    minionDamage += breakpoint.mAdditionalBonusAtThisLevel;
    qMinionValues.push(`${percent(minionDamage)} (level ${breakpoint.mLevel})`);
  }

  const wDamage = ranks(w, 'WBaseDamage', 5);
  const wTotalAd = ranks(w, 'WTotalADRatio', 5);
  const wSlow = ranks(w, 'WSlowPercentage', 5).map((value) => percent(Math.abs(value)));
  const wSlowDuration = ranks(w, 'WSlowDuration', 5)[0];
  const wDamageType = wTooltip.includes('<magicDamage>') ? 'magic' : 'physical';

  const eSpellVamp = ranks(e, 'ESpellVamp', 5)[0];
  const eBonusHealthRatio = ranks(e, 'EVampHPRatio', 5)[0];
  const eDashRange = ranks(e, 'EMaxRange', 5)[0];

  const rMoveSpeed = ranks(r, 'RMovementSpeedBonus', 3).map(percent);
  const rAttackDamage = ranks(r, 'RTotalADAmp', 3).map(percent);
  const rHealing = ranks(r, 'RHealingAmp', 3).map(percent);
  const rDuration = ranks(r, 'RDuration', 3)[0];
  const rExtension = ranks(r, 'RExtension', 3)[0];
  const rFearDuration = ranks(r, 'RMinionFearDuration', 3)[0];

  return [
    {
      abilityId: 'deathbringer-stance',
      paragraphs: [
        `Aatrox’s attacks deal additional ${percent(passiveDamage.mStartValue)} → ${percent(passiveDamage.mEndValue)} target maximum health magic damage, scaling with champion level. He restores ${percent(ranks(passive, 'PHealingRatio', 1)[0])} of damage dealt as health, reduced to ${percent(ranks(passive, 'PHealingMinionMod', 1)[0])} against minions.`,
        'Attacks and ability hits against champions and large jungle monsters reduce this effect’s cooldown by 2 seconds. Hits with the edge of The Darkin Blade reduce it by 4 seconds instead.',
      ],
      notes: [
        `Deals a maximum of ${fixed(ranks(passive, 'PMonsterCap', 1)[0])} damage against monsters.`,
        'Multiple hits from one ability only reduce the cooldown once.',
      ],
      progression: [
        { label: 'Max-health damage', values: [`${percent(passiveDamage.mStartValue)} (level 1)`, `${percent(passiveDamage.mEndValue)} (level 18)`] },
        { label: 'Cooldown', values: [`${seconds(passiveCooldown.mStartValue)} (level 1)`, `${seconds(passiveCooldown.mEndValue)} (level 18)`] },
        { label: 'Damage healing', values: [percent(ranks(passive, 'PHealingRatio', 1)[0])] },
      ],
    },
    {
      abilityId: 'the-darkin-blade',
      paragraphs: [
        'Aatrox slams his greatsword, dealing physical damage. Enemies hit on the edge are briefly knocked up and take 60% increased damage instead.',
        'This ability can be recast twice, each cast changing shape and dealing 25% more damage than the previous one.',
      ],
      notes: [
        `Deals ${slash(qMinionValues)} damage to minions.`,
        'Knock up duration against monsters is doubled.',
      ],
      progression: [
        { label: 'Cooldown', values: cooldowns(q, 5).map(seconds) },
        { label: 'Base damage', values: qBaseDamage.map(fixed) },
        { label: 'Total AD ratio', values: qTotalAd.map(percent) },
        { label: 'Sweetspot damage', values: [`+${percent(ranks(q, 'QSweetSpotBonus', 1)[0])}`] },
        { label: 'Knock up', values: [seconds(ranks(q, 'QKnockupDuration', 1)[0])] },
      ],
    },
    {
      abilityId: 'infernal-chains',
      paragraphs: [
        `Aatrox fires a chain, slowing the first enemy hit for ${seconds(wSlowDuration)} and dealing ${wDamageType} damage. Champions and large jungle monsters have ${seconds(wSlowDuration)} to leave the impact area or be pulled back to its centre and damaged again for the same amount.`,
      ],
      notes: ['Deals double damage to minions.'],
      progression: [
        { label: 'Cooldown', values: cooldowns(w, 5).map(seconds) },
        { label: `${wDamageType[0].toUpperCase()}${wDamageType.slice(1)} damage`, values: wDamage.map((value, index) => `${fixed(value)} (+${percent(wTotalAd[index])} total AD)`) },
        { label: 'Slow', values: wSlow },
        { label: 'Slow duration', values: [seconds(wSlowDuration)] },
      ],
    },
    {
      abilityId: 'umbral-dash',
      paragraphs: [
        `Passive: Aatrox heals for ${fixed(eSpellVamp)}% + ${fixed(eBonusHealthRatio, 3)}% bonus health of the damage he deals to champions.`,
        `Active: Aatrox dashes up to ${fixed(eDashRange)} units. He can use this ability while winding up his other abilities.`,
      ],
      notes: [],
      progression: [
        { label: 'Cooldown', values: cooldowns(e, 5).map(seconds) },
        { label: 'Champion-damage healing', values: [`${fixed(eSpellVamp)}% + ${fixed(eBonusHealthRatio, 3)}% bonus health`] },
        { label: 'Dash distance', values: [fixed(eDashRange)] },
      ],
    },
    {
      abilityId: 'world-ender',
      paragraphs: [
        `Aatrox reveals his true demonic form, fearing nearby minions for ${seconds(rFearDuration)} and gaining move speed that decays over ${seconds(rDuration)}. He also gains attack damage and increased self-healing for the duration.`,
        `Champion takedowns extend the duration by ${seconds(rExtension)} and refresh the move-speed effect.`,
      ],
      notes: [`Duration cannot be increased past ${seconds(rDuration)}.`],
      progression: [
        { label: 'Cooldown', values: cooldowns(r, 3).map(seconds) },
        { label: 'Total attack damage increase', values: rAttackDamage },
        { label: 'Healing increase', values: rHealing },
        { label: 'Move speed', values: rMoveSpeed },
      ],
    },
  ];
}

const [bin, strings] = await Promise.all([getJson(sourceUrls.bin), getJson(sourceUrls.strings)]);
const details = {
  schemaVersion: 1,
  patch,
  sources: [sourceUrls.bin, sourceUrls.strings],
  champions: {
    aatrox: {
      abilities: aatroxDetails(bin, strings),
    },
  },
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(details, null, 2)}\n`);
console.log(`Champion ability details ${patch}: generated Aatrox from CommunityDragon client data.`);
