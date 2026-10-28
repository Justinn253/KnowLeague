import {
  Clock3,
  Dices,
  Eye,
  Hammer,
  Search,
  ShieldQuestion,
  Sparkles,
  Swords,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import type { MultiplayerPlayerCountGameId } from '@/lib/multiplayer-player-counts';
import type { StreakGameId } from '@/lib/game-storage';
import type { GameFamily, GameRouteId } from '@/lib/game-families';

export type Accent = 'gold' | 'cyan' | 'rose' | 'violet' | 'emerald' | 'sky';
export type GameMode = 'solo' | 'multiplayer' | 'hybrid';
export type GameCatalogue = 'league' | 'original';

export type GameLink = {
  id: GameRouteId;
  catalogue: GameCatalogue;
  family: GameFamily;
  title: string;
  href: string;
  description: string;
  imageUrl: string;
  imageFit?: 'cover' | 'contain';
  gameIcon: LucideIcon;
  mode: GameMode;
  playerCountId?: MultiplayerPlayerCountGameId;
  streakGameId?: StreakGameId;
  streakStyle?: 'single' | 'daily-pair' | 'modes';
  accent: Accent;
  kicker: string;
  feature?: boolean;
  mostPlayed?: boolean;
};

export const GAME_NAVIGATION_ITEMS: GameLink[] = [
  {
    id: 'augment-builder', catalogue: 'league', family: 'standalone', title: 'ARAM Mayhem Augments',
    href: '/augment-builder', description: 'Browse, create, share, and rate community ARAM Mayhem augments.',
    imageUrl: '/backgrounds/Howling_Abyss_Landscape.png', gameIcon: Sparkles,
    mode: 'solo', accent: 'violet', kicker: 'Create & Share',
  },
  {
    id: 'skindle',
    catalogue: 'league',
    family: 'daily-guess',
    title: 'Skindle',
    href: '/skindle',
    description: 'Solve the daily League of Legends skin with each guess revealing more information.',
    imageUrl: 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Lux_7.jpg',
    gameIcon: Search,
    mode: 'solo',
    streakGameId: 'skindle',
    streakStyle: 'single',
    accent: 'gold',
    kicker: 'Daily Puzzle',
    feature: true,
    mostPlayed: true,
  },
  {
    id: 'splash-scramble',
    catalogue: 'league',
    family: 'splash-puzzle',
    title: 'Splash Scramble',
    href: '/splash-scramble',
    description: 'Rebuild a scrambled League of Legends skin by swapping pieces.',
    imageUrl: 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Ashe_0.jpg',
    gameIcon: Eye,
    mode: 'solo',
    streakGameId: 'splash-scramble',
    streakStyle: 'daily-pair',
    accent: 'sky',
    kicker: 'Tile Puzzle',
  },
  {
    id: 'randodraft',
    catalogue: 'league',
    family: 'standalone',
    title: 'Randodraft',
    href: '/randodraft',
    description: 'Roll champions, lanes, and build types to draft the best team luck allows.',
    imageUrl: 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/TwistedFate_0.jpg',
    gameIcon: Dices,
    mode: 'solo',
    accent: 'emerald',
    kicker: 'Random Team Draft',
  },
  {
    id: 'ability-blitz',
    catalogue: 'league',
    family: 'solo-quiz',
    title: 'Ability Blitz',
    href: '/multiplayer/ability-blitz',
    description: 'Play solo or with friends through League of Legends ability icons.',
    imageUrl: '/game-snapshots/ability_blitz_snapshot.png',
    imageFit: 'contain',
    gameIcon: Clock3,
    mode: 'hybrid',
    playerCountId: 'ability-blitz',
    streakGameId: 'ability-blitz',
    streakStyle: 'modes',
    accent: 'cyan',
    kicker: 'Solo or Race',
  },
  {
    id: 'skin-champion',
    catalogue: 'league',
    family: 'solo-quiz',
    title: 'Skin Champion',
    href: '/multiplayer/skin-champion',
    description: 'Play solo or with friends to identify League of Legends skin lines.',
    imageUrl: '/game-snapshots/skin_champion_snapshot.png',
    imageFit: 'contain',
    gameIcon: Sparkles,
    mode: 'hybrid',
    playerCountId: 'skin-champion',
    streakGameId: 'skin-champion',
    streakStyle: 'modes',
    accent: 'sky',
    kicker: 'Solo or Sprint',
  },
  {
    id: 'skincognito',
    catalogue: 'league',
    family: 'multiplayer-session',
    title: 'Skincognito',
    href: '/skincognito',
    description: 'Try to guess your opponents League of Legends skin before they can guess yours.',
    imageUrl: 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Shaco_0.jpg',
    gameIcon: ShieldQuestion,
    mode: 'multiplayer',
    playerCountId: 'skincognito',
    accent: 'rose',
    kicker: 'Deduction Duel',
    feature: true,
  },
  {
    id: 'carving-revelation',
    catalogue: 'league',
    family: 'multiplayer-session',
    title: 'Carving Revelation',
    href: '/carving-revelation',
    description: 'Carve through a hidden League of Legends skin line and figure it out before your opponents do.',
    imageUrl: 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Jhin_5.jpg',
    gameIcon: Eye,
    mode: 'multiplayer',
    playerCountId: 'carving-revelation',
    accent: 'gold',
    kicker: 'Shared Canvas',
  },
  {
    id: 'category-clash',
    catalogue: 'league',
    family: 'multiplayer-session',
    title: 'Category Clash',
    href: '/category-clash',
    description: 'Name unique League answers from rotating categories and be the last player standing.',
    imageUrl: 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Sylas_0.jpg',
    gameIcon: Swords,
    mode: 'multiplayer',
    playerCountId: 'category-clash',
    accent: 'emerald',
    kicker: 'Last Player Standing',
  },
  {
    id: 'mining',
    catalogue: 'original',
    family: 'standalone',
    title: 'Mining',
    href: '/games/mining',
    description: 'Run persistent mining expeditions and manage shared Discord resources from the web.',
    imageUrl: 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Malzahar_0.jpg',
    gameIcon: Hammer,
    mode: 'solo',
    accent: 'gold',
    kicker: 'Discord Companion',
  },
  {
    id: 'mastery-master',
    catalogue: 'league',
    family: 'standalone',
    title: 'Mastery Master',
    href: '/mastery-master',
    description: "Put a League account's champion mastery knowledge to the test.",
    imageUrl: 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Malzahar_0.jpg',
    gameIcon: Trophy,
    mode: 'solo',
    accent: 'violet',
    kicker: 'Mastery Challenge',
  },
];

export const LEAGUE_GAME_NAVIGATION_ITEMS = GAME_NAVIGATION_ITEMS.filter((game) => game.catalogue === 'league');
export const ORIGINAL_GAME_NAVIGATION_ITEMS = GAME_NAVIGATION_ITEMS.filter((game) => game.catalogue === 'original');
