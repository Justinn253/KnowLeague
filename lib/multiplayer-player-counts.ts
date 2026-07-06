export const MULTIPLAYER_PLAYER_COUNT_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export const multiplayerPlayerCountGameIds = [
  'skincognito',
  'ability-blitz',
  'skin-champion',
  'carving-revelation',
  'category-clash',
] as const;

export type MultiplayerPlayerCountGameId = typeof multiplayerPlayerCountGameIds[number];

export type MultiplayerPlayerCounts = Partial<Record<MultiplayerPlayerCountGameId, number>>;

export type MultiplayerPlayerCountsPayload = {
  enabled: boolean;
  placeholder: boolean;
  updatedAt: string;
  counts: MultiplayerPlayerCounts;
};

const placeholderCounts: Record<MultiplayerPlayerCountGameId, number> = {
  skincognito: 18,
  'ability-blitz': 9,
  'skin-champion': 7,
  'carving-revelation': 5,
  'category-clash': 11,
};

export function isMultiplayerPlayerCountsEnabled() {
  return process.env.NEXT_PUBLIC_MULTIPLAYER_PLAYER_COUNTS_ENABLED === 'true';
}

export function getPlaceholderMultiplayerPlayerCounts(): MultiplayerPlayerCounts {
  return { ...placeholderCounts };
}
