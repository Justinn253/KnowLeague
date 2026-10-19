export type DiscordFishingCommandSettings = {
  allChannels: boolean;
};

export const DEFAULT_DISCORD_FISHING_COMMAND_SETTINGS: DiscordFishingCommandSettings = {
  allChannels: true,
};

export type DiscordFishingLevelRoleReward = {
  level: number;
  roleIds: string[];
};

export type DiscordFishingRoleSettings = {
  topFisherRoleId: string | null;
};

export const DEFAULT_DISCORD_FISHING_ROLE_SETTINGS: DiscordFishingRoleSettings = {
  topFisherRoleId: null,
};

export const DISCORD_FISHING_WEEKDAY_PHENOMENA = [
  'double-xp',
  'double-knowbucks',
  'higher-fish-rarity',
  'shorter-expeditions',
  'extra-crate-loot',
] as const;

export type DiscordFishingWeekdayPhenomenonId = typeof DISCORD_FISHING_WEEKDAY_PHENOMENA[number];

export type DiscordFishingWeekdayPhenomenon = {
  phenomenon: DiscordFishingWeekdayPhenomenonId;
  weekdays: number[];
};

export type DiscordFishingBonusSettings = {
  bonusRoleIds: string[];
  weekdayPhenomena: DiscordFishingWeekdayPhenomenon[];
};

export const DEFAULT_DISCORD_FISHING_BONUS_SETTINGS: DiscordFishingBonusSettings = {
  bonusRoleIds: [],
  weekdayPhenomena: [],
};
