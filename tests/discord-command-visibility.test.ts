import { describe, expect, it } from 'vitest';
import { isDiscordAdministrativeCommand } from '../discord-bot/src/interactions';

describe('Discord slash-command visibility', () => {
  it('identifies only staff-gated command shapes as administrative', () => {
    expect(isDiscordAdministrativeCommand('xp', 'view')).toBe(false);
    expect(isDiscordAdministrativeCommand('xp', 'add')).toBe(true);
    expect(isDiscordAdministrativeCommand('knowbucks', 'balance')).toBe(false);
    expect(isDiscordAdministrativeCommand('knowbucks', 'set')).toBe(true);
    expect(isDiscordAdministrativeCommand('collections', 'summon')).toBe(false);
    expect(isDiscordAdministrativeCommand('cl', 'capacity-force-add')).toBe(false);
    expect(isDiscordAdministrativeCommand('leaderboard', null)).toBe(false);
  });
});
