import {
  draftPickDisplayName,
  DRAFT_CHAMPION_BY_ID,
  DRAFT_ITEM_BY_ID,
  RANDODRAFT_TEAM_SIZE,
  type CompleteDraftPick,
  type DraftGameMode,
} from '@/lib/randodraft';
import type { DraftHistoryEntry } from '@/lib/randodraft-history';

function loadCanvasImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Image could not be loaded.'));
    image.src = src;
  });
}

async function drawCanvasImage(context: CanvasRenderingContext2D, src: string, x: number, y: number, size: number) {
  try {
    const image = await loadCanvasImage(src);
    context.drawImage(image, x, y, size, size);
  } catch {
    context.fillStyle = '#1e293b';
    context.fillRect(x, y, size, size);
  }
}

async function drawSharePickMeta(context: CanvasRenderingContext2D, pick: CompleteDraftPick, gameMode: DraftGameMode, x: number, y: number) {
  const laneIcon = gameMode === 'aram' || !pick.lane ? null : '/role-icons/roleicon_' + ({ Top: 'top', Jungle: 'jungle', Mid: 'middle', Support: 'utility', Bot: 'bottom' } as Record<string, string>)[pick.lane] + '.png';
  const classIcon = pick.type !== 'Random' ? '/class-icons/' + pick.type.toLowerCase() + '.png' : null;
  let cursor = x;

  if (laneIcon && pick.lane) {
    await drawCanvasImage(context, laneIcon, cursor, y - 18, 22);
    cursor += 28;
    context.fillText(pick.lane, cursor, y);
    cursor += context.measureText(pick.lane).width + 12;
    context.fillText('·', cursor, y);
    cursor += context.measureText('·').width + 12;
  }
  if (classIcon) {
    await drawCanvasImage(context, classIcon, cursor, y - 18, 22);
    cursor += 28;
  }
  context.fillText(pick.type, cursor, y);
}

/** Produces the PNG used by Randodraft's Copy image action. */
export async function createRandodraftShareImage(entry: DraftHistoryEntry): Promise<Blob> {
  const teamSize = entry.settings.playersPerTeam ?? RANDODRAFT_TEAM_SIZE;
  const splitTeams = entry.settings.secondTeam === true;
  const teams = splitTeams ? [entry.picks.slice(0, teamSize), entry.picks.slice(teamSize, teamSize * 2)] : [entry.picks];
  const columns = splitTeams ? 2 : 1;
  const cardWidth = (1800 - 128 - (columns - 1) * 28) / columns;
  const rows = splitTeams ? Math.max(...teams.map((team) => team.length)) : teams[0].length;
  const canvas = document.createElement('canvas');
  canvas.width = 1800;
  canvas.height = 170 + rows * 158 + 70;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable.');

  context.fillStyle = '#050b1d';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#f8d56b';
  context.font = '800 42px system-ui';
  context.fillText('KnowLeague - Randodraft', 64, 64);
  context.fillStyle = '#94a3b8';
  context.font = '500 24px system-ui';
  context.fillText(entry.settings.gameMode === 'aram' ? 'ARAM' : "Summoner's Rift", 66, 104);

  for (let teamIndex = 0; teamIndex < teams.length; teamIndex += 1) {
    const team = teams[teamIndex];
    const columnX = 64 + teamIndex * (cardWidth + 28);
    let y = 145;
    if (splitTeams) {
      context.fillStyle = teamIndex === 0 ? '#fda4af' : '#7dd3fc';
      context.font = '800 22px system-ui';
      context.fillText(teamIndex === 0 ? 'TEAM 1 · RED SIDE' : 'TEAM 2 · BLUE SIDE', columnX, y);
      y += 32;
    }
    for (const [teamPickIndex, pick] of team.entries()) {
      const champion = DRAFT_CHAMPION_BY_ID.get(pick.champion);
      if (!champion) continue;
      context.fillStyle = '#0f1a35';
      context.fillRect(columnX, y, cardWidth, 126);
      await drawCanvasImage(context, champion.imageUrl, columnX + 18, y + 18, 76);
      context.fillStyle = '#ffffff';
      context.font = '800 27px system-ui';
      context.fillText(draftPickDisplayName(pick, teamIndex * teamSize + teamPickIndex, champion.name), columnX + 114, y + 49, 230);
      context.fillStyle = '#a5b4fc';
      context.font = '500 20px system-ui';
      await drawSharePickMeta(context, pick, entry.settings.gameMode, columnX + 114, y + 82);
      let itemX = columnX + 360;
      for (const id of pick.build ?? []) {
        const item = DRAFT_ITEM_BY_ID.get(id);
        if (!item) continue;
        await drawCanvasImage(context, item.imageUrl, itemX, y + 34, 58);
        itemX += 68;
      }
      y += 158;
    }
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Image export failed.')), 'image/png');
  });
}
