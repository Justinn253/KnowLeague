export const DISCORD_LEVELING_DEFAULT_XP_PER_MESSAGE = 15;
export const DISCORD_LEVELING_DEFAULT_COOLDOWN_SECONDS = 5;
export const DISCORD_LEVELING_MIN_LEVEL = 0;
export const DISCORD_LEVELING_LEVEL_UP_MESSAGE_TEMPLATE_MAX_LENGTH = 500;
export const DISCORD_LEVELING_DEFAULT_LEVEL_UP_MESSAGE_TEMPLATE = '🎉 {user} reached level {level}!';

export type DiscordLevelingSettings = {
  cooldownSeconds: number;
  enabled: boolean;
  leaderboardTopRoleId: string | null;
  levelUpMessageEnabled: boolean;
  levelUpMessageChannelId: string | null;
  levelUpMessageTemplate: string;
  xpPerMessage: number;
};

export type DiscordLevelingRoleReward = {
  level: number;
  levelUpMessageTemplate: string | null;
  roleIds: string[];
};

export type DiscordGuildRole = {
  assignable: boolean;
  id: string;
  name: string;
  position: number;
};

export const DEFAULT_DISCORD_LEVELING_SETTINGS: DiscordLevelingSettings = {
  enabled: true,
  leaderboardTopRoleId: null,
  levelUpMessageEnabled: true,
  levelUpMessageChannelId: null,
  levelUpMessageTemplate: DISCORD_LEVELING_DEFAULT_LEVEL_UP_MESSAGE_TEMPLATE,
  xpPerMessage: DISCORD_LEVELING_DEFAULT_XP_PER_MESSAGE,
  cooldownSeconds: DISCORD_LEVELING_DEFAULT_COOLDOWN_SECONDS,
};

export function getDiscordXpRequiredForLevel(level: number) {
  return getDiscordTotalXpForLevel(level);
}

export function getDiscordTotalXpForLevel(level: number) {
  const targetLevel = Math.max(DISCORD_LEVELING_MIN_LEVEL, Math.floor(level));
  if (targetLevel === 0) return 0;
  return 50 * targetLevel * targetLevel - 100 * targetLevel + 150;
}

export function getDiscordXpToNextLevel(level: number) {
  const currentLevel = Math.max(DISCORD_LEVELING_MIN_LEVEL, Math.floor(level));
  return getDiscordTotalXpForLevel(currentLevel + 1) - getDiscordTotalXpForLevel(currentLevel);
}

export function getDiscordLevelForTotalXp(totalXp: number) {
  const normalizedTotalXp = Math.max(0, Math.floor(totalXp));
  let level = DISCORD_LEVELING_MIN_LEVEL;

  while (level < 10000 && normalizedTotalXp >= getDiscordTotalXpForLevel(level + 1)) {
    level += 1;
  }

  return level;
}

export function getDiscordLevelProgress(totalXp: number) {
  const level = getDiscordLevelForTotalXp(totalXp);
  const levelStartXp = getDiscordTotalXpForLevel(level);
  const xpRequired = getDiscordXpToNextLevel(level);
  return {
    level,
    xpIntoLevel: Math.max(0, totalXp - levelStartXp),
    xpRequired,
  };
}
