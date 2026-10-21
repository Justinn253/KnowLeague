export const DISCORD_SKIN_CLAIM_RARITIES = [
  'Common',
  'Rare',
  'Epic',
  'Legendary',
  'Mythic',
  'Ultimate',
  'Transcendent',
  'Exalted',
] as const;

export type DiscordSkinClaimRarity = (typeof DISCORD_SKIN_CLAIM_RARITIES)[number];

export type DiscordSkinClaimRarityWeight = {
  rarity: DiscordSkinClaimRarity;
  weight: number;
};

export type DiscordSkinClaimSellValue = {
  amount: number;
  rarity: DiscordSkinClaimRarity;
};

export type DiscordSkinClaimSettings = {
  allChannels: boolean;
  claimWindowMinutes: number;
  claimGracePeriodSeconds: number;
  collectionCapacityUpgradeCost: number;
  collectionStealChancePercent: number;
  defaultCollectionCapacity: number;
  enabled: boolean;
  maximumIntervalMinutes: number;
  minimumIntervalMinutes: number;
  summonBaseCost: number;
};

export type DiscordGuildChannel = {
  id: string;
  name: string;
  position: number;
  sendable: boolean;
};

export const DEFAULT_DISCORD_SKIN_CLAIM_RARITY_WEIGHTS: readonly DiscordSkinClaimRarityWeight[] = [
  { rarity: 'Common', weight: 100 },
  { rarity: 'Rare', weight: 75 },
  { rarity: 'Epic', weight: 45 },
  { rarity: 'Legendary', weight: 15 },
  { rarity: 'Mythic', weight: 5 },
  { rarity: 'Ultimate', weight: 2 },
  { rarity: 'Transcendent', weight: 1 },
  { rarity: 'Exalted', weight: 1 },
];

export const DEFAULT_DISCORD_SKIN_CLAIM_SELL_VALUES: readonly DiscordSkinClaimSellValue[] = [
  { rarity: 'Common', amount: 100 },
  { rarity: 'Rare', amount: 500 },
  { rarity: 'Epic', amount: 1000 },
  { rarity: 'Legendary', amount: 2500 },
  { rarity: 'Mythic', amount: 5000 },
  { rarity: 'Ultimate', amount: 10000 },
  { rarity: 'Exalted', amount: 15000 },
  { rarity: 'Transcendent', amount: 30000 },
];

export const DEFAULT_DISCORD_SKIN_CLAIM_SETTINGS: DiscordSkinClaimSettings = {
  allChannels: true,
  claimWindowMinutes: 30,
  claimGracePeriodSeconds: 10,
  collectionCapacityUpgradeCost: 500,
  collectionStealChancePercent: 1,
  defaultCollectionCapacity: 10,
  enabled: false,
  maximumIntervalMinutes: 120,
  minimumIntervalMinutes: 30,
  summonBaseCost: 5000,
};
