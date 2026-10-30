import {
  GAME_NAVIGATION_ITEMS,
  LEAGUE_GAME_NAVIGATION_ITEMS,
  ORIGINAL_GAME_NAVIGATION_ITEMS,
  type Accent,
  type GameLink,
  type GameMode,
} from '@/lib/game-navigation';

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

const leagueGamesWithoutMasteryMaster = LEAGUE_GAME_NAVIGATION_ITEMS.filter(
  (game) => game !== masteryMasterGame && game.id !== 'augment-builder' && game.id !== 'randodraft',
);
const originalGames = ORIGINAL_GAME_NAVIGATION_ITEMS.filter((game) => game.id !== 'augment-builder');

function placeMasteryMaster(games: GameLink[]) {
  return masteryMasterGame
    ? [...games.slice(0, 3), masteryMasterGame, ...games.slice(3)]
    : games;
}

export const LEAGUE_GAMES_FOR_HEADER = placeMasteryMaster(leagueGamesWithoutMasteryMaster);
export const ORIGINAL_GAMES_FOR_HEADER = originalGames;
export const LEAGUE_GAMES_FOR_HUB = LEAGUE_GAME_NAVIGATION_ITEMS.filter((game) => game.id !== 'augment-builder' && game.id !== 'randodraft');
export const LEAGUE_GAMES_FOR_DRAWER = LEAGUE_GAME_NAVIGATION_ITEMS.filter((game) => game.id !== 'augment-builder' && game.id !== 'randodraft');
export const ORIGINAL_GAMES_FOR_DRAWER = originalGames;
export const MASTERY_MASTER_GAME = masteryMasterGame;
