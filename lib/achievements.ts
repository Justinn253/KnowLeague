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

export type AchievementProgressScope = 'account' | 'session';

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
  progressScope?: AchievementProgressScope;
  rewards: AchievementReward[];
};

export type AchievementEventName =
  | 'first_login'
  | 'discord_linked'
  | 'riot_linked'
  | 'daily_skindle_completed'
  | 'skindle_many_guesses'
  | 'skindle_lucky_guess'
  | 'developer_moment'
  | 'solo_quiz_completed'
  | 'solo_game_won'
  | 'multiplayer_result'
  | 'quiz_wrong_answer'
  | 'quiz_completed_with_settings'
  | 'skincognito_skin_guessed'
  | 'skincognito_clean_sweep'
  | 'skincognito_random_skin'
  | 'carving_revelation_correct_guess'
  | 'carving_revelation_early_correct_guess'
  | 'carving_revelation_max_line'
  | 'carving_revelation_power_up_claimed'
  | 'carving_revelation_power_up_used'
  | 'carving_revelation_power_up_conflict'
  | 'category_clash_last_standing'
  | 'category_clash_shared_answer'
  | 'profile_customized'
  | 'profile_completed'
  | 'friend_added'
  | 'splash_scramble_completed'
  | 'cumulative_progress';

export type AchievementEventSubmission = {
  event: AchievementEventName;
  metadata?: Record<string, unknown>;
};

export type CumulativeAchievementId =
  | 'holy_tryhard'
  | 'dedication'
  | 'anyone_there'
  | 'discord_sleep_caller';

export type AchievementListItem = AchievementDefinition & {
  progressCurrent: number;
  progressTarget: number;
  completedAt: string | null;
  updatedAt: string | null;
  globalCompletedCount: number;
  completionRank: number | null;
  completionPercent: number | null;
  titleVisible: string;
  descriptionVisible: string;
};

export type AchievementEventResult = {
  achievements?: AchievementListItem[];
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

export function isUnachievedHiddenAchievement(
  achievement: Pick<AchievementDefinition, 'hidden'> & { completedAt: string | null },
) {
  return Boolean(achievement.hidden && !achievement.completedAt);
}

const ACHIEVEMENT_EVENT_NAMES: AchievementEventName[] = [
  'first_login',
  'discord_linked',
  'riot_linked',
  'daily_skindle_completed',
  'skindle_many_guesses',
  'skindle_lucky_guess',
  'developer_moment',
  'solo_quiz_completed',
  'solo_game_won',
  'multiplayer_result',
  'quiz_wrong_answer',
  'quiz_completed_with_settings',
  'skincognito_skin_guessed',
  'skincognito_clean_sweep',
  'skincognito_random_skin',
  'carving_revelation_correct_guess',
  'carving_revelation_early_correct_guess',
  'carving_revelation_max_line',
  'carving_revelation_power_up_claimed',
  'carving_revelation_power_up_used',
  'carving_revelation_power_up_conflict',
  'category_clash_last_standing',
  'category_clash_shared_answer',
  'profile_customized',
  'profile_completed',
  'friend_added',
  'splash_scramble_completed',
  'cumulative_progress',
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
    rewards: [{ id: 'title_connected', kind: 'title', name: 'Discordian' }],
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
    id: 'holy_tryhard',
    title: 'Holy Tryhard',
    description: 'Win 100 games across KnowLeague.',
    category: 'general',
    game: 'general',
    target: 100,
    rewards: [{ id: 'title_holy_tryhard', kind: 'title', name: 'Holy Tryhard' }],
  },
  {
    id: 'dedication',
    title: 'Dedication',
    description: 'Spend one continuous session with KnowLeague open for one hour.',
    category: 'general',
    game: 'general',
    target: 3600,
    progressScope: 'session',
    rewards: [{ id: 'badge_dedication', kind: 'badge', name: 'Dedication' }],
  },
  {
    id: 'anyone_there',
    title: 'Anyone there?',
    description: 'Spend one continuous session with KnowLeague open for three hours.',
    category: 'general',
    game: 'general',
    target: 10800,
    progressScope: 'session',
    rewards: [{ id: 'badge_anyone_there', kind: 'badge', name: 'Anyone there?' }],
  },
  {
    id: 'discord_sleep_caller',
    title: 'Discord Sleep Caller',
    description: 'Spend one continuous session with KnowLeague open for eight hours.',
    category: 'general',
    game: 'general',
    target: 28800,
    progressScope: 'session',
    rewards: [{ id: 'title_discord_sleep_caller', kind: 'title', name: 'Discord Sleep Caller' }],
  },
  {
    id: 'riot_linked',
    title: 'Riot Linked',
    description: 'Link a Riot account to your KnowLeague profile.',
    category: 'profile',
    game: 'general',
    target: 1,
    rewards: [{ id: 'badge_riot_linked', kind: 'badge', name: 'Riot Linked' }],
  },
  {
    id: 'ability_master',
    title: 'Ability Master',
    description: 'Complete a daily Chaos Ability Blitz game.',
    category: 'ability_blitz',
    game: 'ability-blitz',
    target: 1,
    rewards: [{ id: 'title_ability_master', kind: 'title', name: 'Ability Master' }],
  },
  {
    id: 'skin_master',
    title: 'Skin Master',
    description: 'Complete a daily Chaos Skin Champion game.',
    category: 'skin_champion',
    game: 'skin-champion',
    target: 1,
    rewards: [{ id: 'title_skin_master', kind: 'title', name: 'Skin Master' }],
  },
  {
    id: 'daily_ability_blitz_solver',
    title: 'Daily Ability Blitz Solver',
    description: 'Complete a daily Ability Blitz game.',
    category: 'ability_blitz',
    game: 'ability-blitz',
    target: 1,
    rewards: [{ id: 'badge_daily_ability_blitz_solver', kind: 'badge', name: 'Daily Ability Blitz Solver' }],
  },
  {
    id: 'daily_skin_champion_solver',
    title: 'Daily Skin Champion Solver',
    description: 'Complete a daily Skin Champion game.',
    category: 'skin_champion',
    game: 'skin-champion',
    target: 1,
    rewards: [{ id: 'badge_daily_skin_champion_solver', kind: 'badge', name: 'Daily Skin Champion Solver' }],
  },
  {
    id: 'pixel_perfect',
    title: 'Pixel Perfect',
    description: 'Guess the Carving Revelation skin correctly on your first or second guess.',
    category: 'carving_revelation',
    game: 'carving-revelation',
    hidden: true,
    target: 1,
    rewards: [{ id: 'badge_pixel_perfect', kind: 'badge', name: 'Pixel Perfect' }],
  },
  {
    id: 'welcome',
    title: 'Welcome',
    description: 'Win your first solo game on KnowLeague.',
    category: 'general',
    game: 'general',
    target: 1,
    rewards: [{ id: 'badge_welcome', kind: 'badge', name: 'Welcome' }],
  },
  {
    id: 'multiplayer_first_win',
    title: 'Winner',
    description: 'Win your first multiplayer game on KnowLeague.',
    category: 'general',
    game: 'general',
    target: 1,
    rewards: [{ id: 'title_winner', kind: 'title', name: 'Winner' }],
  },
  {
    id: 'multiplayer_first_loss',
    title: 'Loser',
    description: 'Lose your first multiplayer game on KnowLeague.',
    category: 'general',
    game: 'general',
    target: 1,
    rewards: [{ id: 'badge_loser', kind: 'badge', name: 'Loser' }],
  },
  {
    id: 'any_day_now',
    title: 'Any day now',
    description: 'Take more than 30 guesses to solve one Skindle.',
    category: 'skindle',
    game: 'skindle',
    target: 1,
    rewards: [{ id: 'title_any_day_now', kind: 'title', name: 'Any day now' }],
  },
  {
    id: 'are_you_dumb',
    title: 'Are you dumb',
    description: 'Get an answer wrong on Iron Ability Blitz.',
    category: 'ability_blitz',
    game: 'ability-blitz',
    hidden: true,
    target: 1,
    rewards: [{ id: 'badge_are_you_dumb', kind: 'badge', name: 'Are you dumb' }],
  },
  {
    id: 'are_you_stupid',
    title: 'Are you stupid',
    description: 'Get an answer wrong on Iron Skin Champion.',
    category: 'skin_champion',
    game: 'skin-champion',
    hidden: true,
    target: 1,
    rewards: [{ id: 'badge_are_you_stupid', kind: 'badge', name: 'Are you stupid' }],
  },
  {
    id: 'lucky_guess',
    title: 'Lucky Guess',
    description: 'Guess the daily Skindle correctly on your first guess.',
    category: 'skindle',
    game: 'skindle',
    target: 1,
    rewards: [{ id: 'badge_lucky_guess', kind: 'badge', name: 'Lucky Guess' }],
  },
  {
    id: 'puzzler',
    title: 'Puzzler',
    description: 'Complete a Splash Scramble.',
    category: 'other',
    game: 'splash-scramble',
    target: 1,
    rewards: [{ id: 'badge_puzzler', kind: 'badge', name: 'Puzzler' }],
  },
  {
    id: 'speed_blitz',
    title: 'Speed Blitz',
    description: 'Complete a Splash Scramble with the lowest timer, no reference, and unlocked tiles.',
    category: 'other',
    game: 'splash-scramble',
    hidden: true,
    target: 1,
    rewards: [{ id: 'title_speed_blitz', kind: 'title', name: 'Speed Blitz' }],
  },
  {
    id: 'master_puzzler',
    title: 'Master Puzzler',
    description: 'Complete a Splash Scramble with no reference, unlocked tiles, and rotation enabled.',
    category: 'other',
    game: 'splash-scramble',
    hidden: true,
    target: 1,
    rewards: [{ id: 'title_master_puzzler', kind: 'title', name: 'Master Puzzler' }],
  },
  {
    id: 'novice_puzzler',
    title: 'Novice Puzzler',
    description: 'Complete a Splash Scramble using the easiest settings.',
    category: 'other',
    game: 'splash-scramble',
    target: 1,
    rewards: [{ id: 'badge_novice_puzzler', kind: 'badge', name: 'Novice Puzzler' }],
  },
  {
    id: 'novice_ability_blitz',
    title: 'Novice Ability Blitz',
    description: 'Complete a casual Ability Blitz game on Iron with no modifiers.',
    category: 'ability_blitz',
    game: 'ability-blitz',
    target: 1,
    rewards: [{ id: 'badge_novice_ability_blitz', kind: 'badge', name: 'Novice Ability Blitz' }],
  },
  {
    id: 'novice_skin_champion',
    title: 'Novice Skin Champion',
    description: 'Complete a casual Skin Champion game on Iron with no modifiers.',
    category: 'skin_champion',
    game: 'skin-champion',
    target: 1,
    rewards: [{ id: 'badge_novice_skin_champion', kind: 'badge', name: 'Novice Skin Champion' }],
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
    target: 1,
    rewards: [{ id: 'badge_powered_up', kind: 'badge', name: 'Powered Up' }],
  },
  {
    id: 'activate',
    title: 'Activate',
    description: 'Use a power-up in Carving Revelation.',
    category: 'carving_revelation',
    game: 'carving-revelation',
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
