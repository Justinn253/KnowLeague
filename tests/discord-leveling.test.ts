import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DISCORD_LEVELING_SETTINGS,
  getDiscordLevelForTotalXp,
  getDiscordTotalXpForLevel,
  getDiscordXpRequiredForLevel,
} from '@/lib/discord-leveling';
import { renderLevelUpMessage } from '../discord-bot/src/leveling';

describe('Discord chat leveling curve', () => {
  it('enables a safe default level-up announcement template', () => {
    expect(DEFAULT_DISCORD_LEVELING_SETTINGS.levelUpMessageEnabled).toBe(true);
    expect(DEFAULT_DISCORD_LEVELING_SETTINGS.levelUpMessageChannelId).toBeNull();
    expect(DEFAULT_DISCORD_LEVELING_SETTINGS.levelUpMessageTemplate).toContain('{user}');
    expect(DEFAULT_DISCORD_LEVELING_SETTINGS.levelUpMessageTemplate).toContain('{level}');
    expect(DEFAULT_DISCORD_LEVELING_SETTINGS.leaderboardTopRoleId).toBeNull();
  });

  it('uses the Lurkr formula for each total-level threshold', () => {
    expect(getDiscordXpRequiredForLevel(1)).toBe(100);
    expect(getDiscordXpRequiredForLevel(2)).toBe(150);
    expect(getDiscordXpRequiredForLevel(10)).toBe(4150);
  });

  it('matches the documented Lurkr total XP thresholds through level 100', () => {
    expect(getDiscordTotalXpForLevel(10)).toBe(4150);
    expect(getDiscordTotalXpForLevel(25)).toBe(28900);
    expect(getDiscordTotalXpForLevel(50)).toBe(120150);
    expect(getDiscordTotalXpForLevel(100)).toBe(490150);
  });

  it('keeps a member at a level until its full threshold is earned', () => {
    expect(getDiscordLevelForTotalXp(0)).toBe(0);
    expect(getDiscordLevelForTotalXp(99)).toBe(0);
    expect(getDiscordLevelForTotalXp(100)).toBe(1);
    expect(getDiscordLevelForTotalXp(4149)).toBe(9);
    expect(getDiscordLevelForTotalXp(4150)).toBe(10);
  });

  it('renders the username token as plain text instead of a Discord mention', () => {
    expect(renderLevelUpMessage(
      'Congratulations {username}; level {level} at {xp} XP.',
      { userId: '123456789012345678', username: 'KnowLeagueUser' },
      { current_level: 12, previous_level: 11, total_xp: 12_345 },
    )).toBe('Congratulations KnowLeagueUser; level 12 at 12,345 XP.');
  });
});
