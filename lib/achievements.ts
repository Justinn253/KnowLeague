export type AchievementCategory =
  | 'general'
  | 'profile'
  | 'skindle'
  | 'ability_blitz'
  | 'skin_champion'
  | 'skincognito'
  | 'carving_revelation'
  | 'category_clash'
  | 'other';

export type AchievementGame =
  | 'general'
  | 'skindle'
  | 'ability-blitz'
  | 'skin-champion'
  | 'skincognito'
  | 'carving-revelation'
  | 'category-clash'
  | 'splash-scramble';

export type AchievementRewardKind = 'title' | 'badge';

export type AchievementReward = {
  id: string;
  kind: AchievementRewardKind;
  name: string;
};

export type AchievementDefinition = {
  id: string;
  title: string;
  description: string;
  category: AchievementCategory;
  game: AchievementGame;
  hidden?: boolean;
  target: number;
  rewards: AchievementReward[];
};

export type AchievementEventName =
  | 'first_login'
  | 'discord_linked'
  | 'daily_skindle_completed'
  | 'developer_moment'
  | 'skincognito_skin_guessed'
  | 'skincognito_clean_sweep'
  | 'skincognito_random_skin'
  | 'carving_revelation_correct_guess'
  | 'carving_revelation_max_line'
  | 'carving_revelation_power_up_claimed'
  | 'carving_revelation_power_up_used'
  | 'carving_revelation_power_up_conflict'
  | 'category_clash_last_standing'
  | 'category_clash_shared_answer'
  | 'profile_customized'
  | 'profile_completed'
  | 'friend_added';

export type AchievementListItem = AchievementDefinition & {
  progressCurrent: number;
  progressTarget: number;
  completedAt: string | null;
  updatedAt: string | null;
  globalCompletedCount: number;
  completionRank: number | null;
  topPercent: number | null;
  titleVisible: string;
  descriptionVisible: string;
};

export type AchievementEventResult = {
  achievements: AchievementListItem[];
  changed: AchievementListItem[];
  completed: AchievementListItem[];
};

export const ACHIEVEMENT_GAME_OPTIONS: { value: AchievementGame; label: string }[] = [
  { value: 'general', label: 'General App' },
  { value: 'skindle', label: 'Skindle' },
  { value: 'ability-blitz', label: 'Ability Blitz' },
  { value: 'skin-champion', label: 'Skin Champion' },
  { value: 'skincognito', label: 'Skincognito' },
  { value: 'carving-revelation', label: 'Carving Revelation' },
  { value: 'category-clash', label: 'Category Clash' },
  { value: 'splash-scramble', label: 'Splash Scramble' },
];

export function getAchievementGameLabel(game: AchievementGame) {
  return ACHIEVEMENT_GAME_OPTIONS.find((option) => option.value === game)?.label ?? game;
}

const ACHIEVEMENT_EVENT_NAMES: AchievementEventName[] = [
  'first_login',
  'discord_linked',
  'daily_skindle_completed',
  'developer_moment',
  'skincognito_skin_guessed',
  'skincognito_clean_sweep',
  'skincognito_random_skin',
  'carving_revelation_correct_guess',
  'carving_revelation_max_line',
  'carving_revelation_power_up_claimed',
  'carving_revelation_power_up_used',
  'carving_revelation_power_up_conflict',
  'category_clash_last_standing',
  'category_clash_shared_answer',
  'profile_customized',
  'profile_completed',
  'friend_added',
];

export function isAchievementEventName(value: unknown): value is AchievementEventName {
  return typeof value === 'string' && ACHIEVEMENT_EVENT_NAMES.includes(value as AchievementEventName);
}

export const ACHIEVEMENTS: AchievementDefinition[] = [
  {
    id: 'first_login',
    title: 'First Step on the Rift',
    description: 'Log in to a KnowLeague account for the first time.',
    category: 'general',
    game: 'general',
    target: 1,
    rewards: [{ id: 'badge_founding_login', kind: 'badge', name: 'Founding Login' }],
  },
  {
    id: 'discord_linked',
    title: 'Connected Comms',
    description: 'Link a Discord account to your KnowLeague profile.',
    category: 'profile',
    game: 'general',
    target: 1,
    rewards: [{ id: 'title_connected', kind: 'title', name: 'Connected' }],
  },
  {
    id: 'daily_skindle_complete',
    title: 'Daily Skindle Solver',
    description: 'Complete the daily Skindle puzzle once.',
    category: 'skindle',
    game: 'skindle',
    target: 1,
    rewards: [{ id: 'badge_skindle_solver', kind: 'badge', name: 'Skindle Solver' }],
  },
  {
    id: 'developer_moment',
    title: 'Developer Moment',
    description: 'Complete a multiplayer game with KnowLeague developer Justin.',
    category: 'general',
    game: 'general',
    hidden: true,
    target: 1,
    rewards: [{ id: 'badge_developer_moment', kind: 'badge', name: 'Developer Moment' }],
  },
  {
    id: 'what_is_this',
    title: 'What is this?',
    description: 'Reach the maximum line length in Carving Revelation.',
    category: 'carving_revelation',
    game: 'carving-revelation',
    hidden: true,
    target: 1,
    rewards: [{ id: 'badge_max_line', kind: 'badge', name: 'Maximum Line' }],
  },
  {
    id: 'carver',
    title: 'Carver',
    description: 'Be the first player to guess correctly in Carving Revelation.',
    category: 'carving_revelation',
    game: 'carving-revelation',
    hidden: true,
    target: 1,
    rewards: [{ id: 'title_carver', kind: 'title', name: 'Carver' }],
  },
  {
    id: 'friendly',
    title: 'Friendly',
    description: 'Add a friend on KnowLeague.',
    category: 'general',
    game: 'general',
    target: 1,
    rewards: [{ id: 'title_friendly', kind: 'title', name: 'Friendly' }],
  },
  {
    id: 'deduced',
    title: 'Deduced',
    description: 'Guess your opponent’s skin in Skincognito.',
    category: 'skincognito',
    game: 'skincognito',
    target: 1,
    rewards: [{ id: 'badge_deduced', kind: 'badge', name: 'Deduced' }],
  },
  {
    id: 'clean_sweep',
    title: 'Clean Sweep',
    description: 'Guess the skin in Skincognito after correctly guessing every category.',
    category: 'skincognito',
    game: 'skincognito',
    hidden: true,
    target: 1,
    rewards: [{ id: 'title_clean_sweep', kind: 'title', name: 'Clean Sweep' }],
  },
  {
    id: 'skincognito_d',
    title: "Skincognito'd",
    description: 'Let Skincognito choose your skin.',
    category: 'skincognito',
    game: 'skincognito',
    hidden: true,
    target: 1,
    rewards: [{ id: 'badge_skincognito_d', kind: 'badge', name: "Skincognito'd" }],
  },
  {
    id: 'unending_knowledge',
    title: 'Unending Knowledge',
    description: 'Be the last player standing in Category Clash.',
    category: 'category_clash',
    game: 'category-clash',
    target: 1,
    rewards: [{ id: 'title_unending_knowledge', kind: 'title', name: 'Unending Knowledge' }],
  },
  {
    id: 'shared_brain_cell',
    title: 'Shared Brain Cell',
    description: 'Have every player guess the same correct answer in one Category Clash round.',
    category: 'category_clash',
    game: 'category-clash',
    hidden: true,
    target: 1,
    rewards: [{ id: 'badge_shared_brain_cell', kind: 'badge', name: 'Shared Brain Cell' }],
  },
  {
    id: 'powered_up',
    title: 'Powered Up',
    description: 'Carve a power-up in Carving Revelation.',
    category: 'carving_revelation',
    game: 'carving-revelation',
    hidden: true,
    target: 1,
    rewards: [{ id: 'badge_powered_up', kind: 'badge', name: 'Powered Up' }],
  },
  {
    id: 'activate',
    title: 'Activate',
    description: 'Use a power-up in Carving Revelation.',
    category: 'carving_revelation',
    game: 'carving-revelation',
    hidden: true,
    target: 1,
    rewards: [{ id: 'badge_activate', kind: 'badge', name: 'Activate' }],
  },
  {
    id: 'really_dude',
    title: 'Really dude?',
    description: 'Try to carve a power-up claimed by another player in Carving Revelation.',
    category: 'carving_revelation',
    game: 'carving-revelation',
    hidden: true,
    target: 1,
    rewards: [{ id: 'badge_really_dude', kind: 'badge', name: 'Really dude?' }],
  },
  {
    id: 'customized',
    title: 'Customized',
    description: 'Customize your KnowLeague profile.',
    category: 'profile',
    game: 'general',
    target: 1,
    rewards: [{ id: 'title_customized', kind: 'title', name: 'Customized' }],
  },
  {
    id: 'individualized',
    title: 'Individualized',
    description: 'Complete every required KnowLeague profile customization.',
    category: 'profile',
    game: 'general',
    target: 1,
    rewards: [{ id: 'title_individualized', kind: 'title', name: 'Individualized' }],
  },
];

export const ACHIEVEMENT_BY_ID = new Map(ACHIEVEMENTS.map((achievement) => [achievement.id, achievement]));

export function maskAchievement(achievement: AchievementDefinition, completedAt: string | null) {
  const shouldMask = achievement.hidden && !completedAt;
  return {
    titleVisible: shouldMask ? 'Hidden Achievement' : achievement.title,
    descriptionVisible: shouldMask ? 'Complete this hidden achievement to reveal it.' : achievement.description,
  };
}

export function getEarnedRewards(achievements: AchievementListItem[], kind: AchievementRewardKind) {
  return achievements
    .filter((achievement) => achievement.completedAt)
    .flatMap((achievement) => achievement.rewards)
    .filter((reward) => reward.kind === kind);
}

export function getRewardById(rewardId: string | null | undefined, kind: AchievementRewardKind) {
  if (!rewardId) {
    return null;
  }

  return ACHIEVEMENTS
    .flatMap((achievement) => achievement.rewards)
    .find((reward) => reward.kind === kind && reward.id === rewardId) ?? null;
}

export function getRewardDescription(rewardId: string, kind: AchievementRewardKind) {
  return ACHIEVEMENTS.find((achievement) => achievement.rewards.some((reward) => reward.kind === kind && reward.id === rewardId))?.description ?? '';
}
