export type GameFamily =
  | 'solo-quiz'
  | 'daily-guess'
  | 'splash-puzzle'
  | 'multiplayer-session'
  | 'standalone';

export type GameRouteId =
  | 'skindle'
  | 'splash-scramble'
  | 'ability-blitz'
  | 'skin-champion'
  | 'skincognito'
  | 'carving-revelation'
  | 'category-clash'
  | 'mastery-master';

export type GameFamilyDefinition = {
  id: GameFamily;
  label: string;
  description: string;
  sharedResponsibilities: readonly string[];
};

export const GAME_FAMILY_DEFINITIONS: Record<GameFamily, GameFamilyDefinition> = {
  'solo-quiz': {
    id: 'solo-quiz',
    label: 'Solo Quiz',
    description: 'Timed, item-based guessing with shared difficulty, modifiers, persistence, and optional multiplayer race support.',
    sharedResponsibilities: ['item selection', 'difficulty rules', 'round persistence', 'scoring', 'quiz progress'],
  },
  'daily-guess': {
    id: 'daily-guess',
    label: 'Daily Guess',
    description: 'A deterministic daily target with progressive clues, guesses, personal stats, and global results.',
    sharedResponsibilities: ['daily target lifecycle', 'guess comparison', 'personal stats', 'daily completion'],
  },
  'splash-puzzle': {
    id: 'splash-puzzle',
    label: 'Splash Puzzle',
    description: 'A visual reconstruction puzzle with deterministic daily content, local round state, and puzzle-specific controls.',
    sharedResponsibilities: ['daily target lifecycle', 'round persistence', 'timer handling', 'completion stats'],
  },
  'multiplayer-session': {
    id: 'multiplayer-session',
    label: 'Multiplayer Session',
    description: 'A server-authoritative lobby and realtime session whose game-specific rules remain owned by the individual game.',
    sharedResponsibilities: ['lobby lifecycle', 'presence and reconnect', 'host succession', 'chat and moderation', 'result recording'],
  },
  standalone: {
    id: 'standalone',
    label: 'Standalone Challenge',
    description: 'A game-specific challenge that does not yet share a broader gameplay engine.',
    sharedResponsibilities: ['navigation', 'account context', 'achievements'],
  },
};

export const GAME_FAMILY_BY_ROUTE: Record<GameRouteId, GameFamily> = {
  skindle: 'daily-guess',
  'splash-scramble': 'splash-puzzle',
  'ability-blitz': 'solo-quiz',
  'skin-champion': 'solo-quiz',
  skincognito: 'multiplayer-session',
  'carving-revelation': 'multiplayer-session',
  'category-clash': 'multiplayer-session',
  'mastery-master': 'standalone',
};

export function getGameFamily(gameId: GameRouteId) {
  return GAME_FAMILY_BY_ROUTE[gameId];
}
