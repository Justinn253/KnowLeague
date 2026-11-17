export type DiscordAnonymizeSettings = {
  allChannels: boolean;
  reportChannelId: string | null;
};

export const DEFAULT_DISCORD_ANONYMIZE_SETTINGS: DiscordAnonymizeSettings = {
  allChannels: true,
  reportChannelId: null,
};
