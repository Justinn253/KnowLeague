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
