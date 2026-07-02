export type AchievementCategory = 'general' | 'profile' | 'skindle';
export type AchievementRewardKind = 'title' | 'badge';

export type AchievementReward = {
  kind: AchievementRewardKind;
  name: string;
};

export type AchievementDefinition = {
  id: string;
  title: string;
  description: string;
  category: AchievementCategory;
  game: 'general' | 'skindle';
  hidden?: boolean;
  target: number;
  rewards: AchievementReward[];
};

export type AchievementEventName = 'first_login' | 'discord_linked' | 'daily_skindle_completed';

export type AchievementProgressRecord = {
  achievementId: string;
  progressCurrent: number;
  progressTarget: number;
  completedAt: string | null;
  updatedAt: string | null;
};

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

export const ACHIEVEMENTS: AchievementDefinition[] = [
  {
    id: 'first_login',
    title: 'First Step on the Rift',
    description: 'Log in to a KnowLeague account for the first time.',
    category: 'general',
    game: 'general',
    target: 1,
    rewards: [{ kind: 'badge', name: 'Founding Login' }],
  },
  {
    id: 'discord_linked',
    title: 'Connected Comms',
    description: 'Link a Discord account to your KnowLeague profile.',
    category: 'profile',
    game: 'general',
    target: 1,
    rewards: [{ kind: 'title', name: 'Connected' }],
  },
  {
    id: 'daily_skindle_complete',
    title: 'Daily Skindle Solver',
    description: 'Complete the daily Skindle puzzle once.',
    category: 'skindle',
    game: 'skindle',
    target: 1,
    rewards: [{ kind: 'badge', name: 'Skindle Solver' }],
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
