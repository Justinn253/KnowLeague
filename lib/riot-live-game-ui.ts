export type LiveGameStatusView = {
  inGame: boolean;
  gameStartTime: number | null;
  gameLength: number | null;
  champion: {
    name: string;
  } | null;
};

function formatElapsedSeconds(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function getLiveGameNote(status: LiveGameStatusView | null, now = Date.now()) {
  if (!status?.inGame) {
    return null;
  }

  const elapsedSeconds = status.gameStartTime
    ? (now - status.gameStartTime) / 1000
    : status.gameLength ?? 0;
  const championName = status.champion?.name ?? 'Unknown champion';
  return `In a match - ${championName} / ${formatElapsedSeconds(elapsedSeconds)}`;
}
