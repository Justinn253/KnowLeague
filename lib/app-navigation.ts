import { GAME_NAVIGATION_ITEMS, type Accent, type GameMode } from '@/lib/game-navigation';

/** Shared navigation metadata used by responsive headers and the drawer. */
export const GAME_ACCENT_CLASSES: Record<Accent, string> = {
  gold: 'border-amber-200/30 bg-amber-300 text-slate-950',
  cyan: 'border-cyan-200/30 bg-cyan-300 text-slate-950',
  rose: 'border-rose-200/30 bg-rose-400 text-white',
  violet: 'border-violet-200/30 bg-violet-400 text-white',
  emerald: 'border-emerald-200/30 bg-emerald-300 text-slate-950',
  sky: 'border-sky-200/30 bg-sky-300 text-slate-950',
};

export const GAME_MODE_LABELS: Record<GameMode, string> = {
  solo: 'Solo',
  multiplayer: 'Multiplayer',
  hybrid: 'Solo/Multiplayer',
};

const masteryMasterGame = GAME_NAVIGATION_ITEMS.find((game) => game.id === 'mastery-master');
export const AUGMENT_BUILDER_GAME = GAME_NAVIGATION_ITEMS.find((game) => game.id === 'augment-builder');
export const RANDODRAFT_GAME = GAME_NAVIGATION_ITEMS.find((game) => game.id === 'randodraft');

const gamesWithoutMasteryMaster = GAME_NAVIGATION_ITEMS.filter(
  (game) => game !== masteryMasterGame && game.id !== 'augment-builder',
);

export const GAMES_FOR_HEADER = masteryMasterGame
  ? [...gamesWithoutMasteryMaster.slice(0, 3), masteryMasterGame, ...gamesWithoutMasteryMaster.slice(3)]
  : GAME_NAVIGATION_ITEMS.filter((game) => game.id !== 'augment-builder');

export const GAMES_FOR_DRAWER = GAME_NAVIGATION_ITEMS.filter((game) => game.id !== 'augment-builder');
export const MASTERY_MASTER_GAME = masteryMasterGame;