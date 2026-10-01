import catalogue from '@/data/catalogs/augment-icons.json';
import statIcons from '@/data/catalogs/augment-stat-icons.json';
export const AUGMENT_STAT_ICONS = statIcons;

export const AUGMENT_ICONS = catalogue.icons;
export const AUGMENT_RARITIES = ['silver', 'gold', 'prismatic'] as const;
export const AUGMENT_TIERS = ['D', 'C', 'B', 'A', 'S'] as const;
export const AUGMENT_COMMUNITY_SORTS = ['newest', 'week', 'month', 'year', 'all'] as const;
export const AUGMENT_COMMUNITY_TIER_FILTERS = ['unrated', ...AUGMENT_TIERS, 'all'] as const;
export type AugmentCommunitySort = (typeof AUGMENT_COMMUNITY_SORTS)[number];
export type AugmentCommunityTierFilter = (typeof AUGMENT_COMMUNITY_TIER_FILTERS)[number];
export type AugmentRarity = (typeof AUGMENT_RARITIES)[number];
export type AugmentDraft = {
  id: string;
  rarity: AugmentRarity;
  icon: string;
  name: string;
  description: string;
  questRequirements: string;
  questEnabled: boolean;
  restrictions: string;
  restrictionsEnabled: boolean;
  notes: string;
  longDescription: string;
};
export type AugmentAuthor = { id: string; username: string; display_name: string; chat_color: string };
export type PublishedAugment = AugmentDraft & {
  createdAt: string;
  author: AugmentAuthor | null;
  upvotes: number;
  downvotes: number;
  averageTier: number | null;
  tierVotes: number;
  viewerReaction: number | null;
  viewerTier: number | null;
};
export const AUGMENT_LIMITS = {
  name: 60,
  description: 200,
  questRequirements: 1200,
  restrictions: 1200,
  notes: 1200,
  longDescription: 4000,
} as const;
export const AUGMENT_STATS = {
  ap: { label: 'Ability power', color: '#7c8cff', symbol: '✦' },
  ad: { label: 'Attack damage', color: '#ffad33', symbol: '⚔' },
  health: { label: 'Health', color: '#20d967', symbol: '♥' },
  armor: { label: 'Armor', color: '#f2d34e', symbol: '⛨' },
  mr: { label: 'Magic resist', color: '#52e5df', symbol: '◈' },
  lethality: { label: 'Lethality', color: '#f18779', symbol: '➶' },
  haste: { label: 'Ability haste', color: '#80ddd7', symbol: '⌛' },
  speed: { label: 'Move speed', color: '#e6efb0', symbol: '»' },
  heal: { label: 'Healing', color: '#75e4ae', symbol: '✚' },
  shield: { label: 'Shield', color: '#eee5cc', symbol: '◇' },
} as const;
export type AugmentStat = keyof typeof AUGMENT_STATS;
export const AUGMENT_INLINE_ICONS = {
  ...AUGMENT_STATS,
  ranged: { label: 'Ranged', color: '#eee5cc', symbol: 'Ranged' },
  melee: { label: 'Melee', color: '#eee5cc', symbol: 'Melee' },
  level: { label: 'Level', color: '#eee5cc', symbol: 'Level' },
  attackspeed: { label: 'Attack speed', color: '#f2d34e', symbol: 'Attack speed' },
  mana: { label: 'Mana', color: '#52c8ef', symbol: 'Mana' },
  crit: { label: 'Critical strike', color: '#ffad33', symbol: 'Critical strike' },
  range: { label: 'Attack range', color: '#eee5cc', symbol: 'Attack range' },
  tenacity: { label: 'Tenacity', color: '#eee5cc', symbol: 'Tenacity' },
  lifesteal: { label: 'Life steal', color: '#f18779', symbol: 'Life steal' },
  mpen: { label: 'Magic penetration', color: '#c18cff', symbol: 'Magic penetration' },
} as const;
export type AugmentInlineIcon = keyof typeof AUGMENT_INLINE_ICONS;
export type AugmentTextRun = { text: string; color: string; bold?: boolean; icon?: AugmentInlineIcon };
const iconAliases = new Map(Object.entries(catalogue.aliases));
const iconIds = new Set([...AUGMENT_ICONS.map((icon) => icon.id), ...iconAliases.keys()]);

export function resolveAugmentIconId(id: string) {
  return iconAliases.get(id) ?? id;
}
export function isAugmentIconForRarity(id: string, rarity: AugmentRarity) {
  return AUGMENT_ICONS.some((icon) => icon.id === resolveAugmentIconId(id) && icon.rarity === rarity);
}

export const isAugmentId = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export function emptyAugment(id: string): AugmentDraft {
  return {
    id,
    rarity: 'silver',
    icon: 'adapt_large',
    name: '',
    description: '',
    questRequirements: '',
    questEnabled: false,
    restrictions: '',
    restrictionsEnabled: false,
    notes: '',
    longDescription: '',
  };
}

// A deliberately small text format: no HTML, URLs, styles, or executable content.
export function parseAugmentText(value: string): AugmentTextRun[] {
  const runs: AugmentTextRun[] = [];
  const pattern = new RegExp(
    String.raw`\[(${[...Object.keys(AUGMENT_STATS), 'bold'].join('|')})\]([\s\S]*?)\[\/\1\]|\[icon:(${Object.keys(AUGMENT_INLINE_ICONS).join('|')})\]`,
    'g',
  );
  let start = 0;
  for (const match of value.matchAll(pattern)) {
    if (match.index! > start) runs.push({ text: value.slice(start, match.index), color: '#f0eee6' });
    if (match[3]) {
      const stat = AUGMENT_INLINE_ICONS[match[3] as AugmentInlineIcon];
      runs.push({ text: stat.symbol, color: stat.color, icon: match[3] as AugmentInlineIcon });
    } else {
      runs.push({
        text: match[2],
        color: match[1] === 'bold' ? '#f0eee6' : AUGMENT_STATS[match[1] as AugmentStat].color,
        bold: match[1] === 'bold',
      });
    }
    start = match.index! + match[0].length;
  }
  if (start < value.length) runs.push({ text: value.slice(start), color: '#f0eee6' });
  return runs;
}

export function parseAugmentDraft(value: unknown, finished = false): AugmentDraft | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const draft = {
    ...source,
    questRequirements: source.questRequirements ?? '',
    restrictions: source.restrictions ?? '',
    notes: source.notes ?? source.details ?? '',
  } as Record<string, unknown>;
  const questEnabled = source.questEnabled ?? Boolean(draft.questRequirements);
  const restrictionsEnabled = source.restrictionsEnabled ?? Boolean(draft.restrictions);
  if (typeof questEnabled !== 'boolean' || typeof restrictionsEnabled !== 'boolean') return null;
  if (
    !isAugmentId(draft.id) ||
    !AUGMENT_RARITIES.includes(draft.rarity as AugmentRarity) ||
    typeof draft.icon !== 'string' ||
    (draft.icon !== '' && !iconIds.has(draft.icon))
  )
    return null;
  for (const [key, limit] of Object.entries(AUGMENT_LIMITS)) {
    if (typeof draft[key] !== 'string' || (draft[key] as string).length > limit) return null;
  }
  const icon = isAugmentIconForRarity(draft.icon as string, draft.rarity as AugmentRarity)
    ? (draft.icon as string)
    : '';
  if (finished && !icon) return null;
  if (/[\r\n]/.test(draft.name as string)) return null;
  if (finished && (draft.description as string).split('\n').length > 12) return null;
  if (
    finished &&
    (!(draft.name as string).trim() || !parseAugmentText(draft.description as string).some((run) => run.text.trim()))
  )
    return null;
  return {
    id: draft.id,
    rarity: draft.rarity as AugmentRarity,
    icon,
    name: draft.name as string,
    description: draft.description as string,
    questRequirements: draft.questRequirements as string,
    questEnabled,
    restrictions: draft.restrictions as string,
    restrictionsEnabled,
    notes: draft.notes as string,
    longDescription: draft.longDescription as string,
  };
}
