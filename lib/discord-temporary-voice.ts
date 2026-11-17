export type DiscordGuildVoiceChannel = {
  categoryId: string | null;
  id: string;
  manageable: boolean;
  name: string;
  position: number;
};

export type DiscordTemporaryVoiceSettings = {
  joinToCreateChannelId: string | null;
};

export const DEFAULT_DISCORD_TEMPORARY_VOICE_SETTINGS: DiscordTemporaryVoiceSettings = {
  joinToCreateChannelId: null,
};
