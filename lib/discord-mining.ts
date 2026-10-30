export type DiscordMiningLevelRoleReward = { level: number; roleIds: string[] };
export type DiscordMiningRoleSettings = { topMinerRoleId: string | null };

export const DEFAULT_DISCORD_MINING_ROLE_SETTINGS: DiscordMiningRoleSettings = {
  topMinerRoleId: null,
};
