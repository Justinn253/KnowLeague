import { describe, expect, it } from 'vitest';
import { isDiscordAdministrativeCommand, requiresDefaultCommandChannel, riftboundMockCommandErrorNote } from '../discord-bot/src/interactions';

describe('Discord slash-command visibility', () => {
  it('identifies only staff-gated command shapes as administrative', () => {
    expect(isDiscordAdministrativeCommand('xp', 'view')).toBe(false);
    expect(isDiscordAdministrativeCommand('xp', 'add')).toBe(true);
    expect(isDiscordAdministrativeCommand('knowbucks', 'balance')).toBe(false);
    expect(isDiscordAdministrativeCommand('knowbucks', 'set')).toBe(true);
    expect(isDiscordAdministrativeCommand('collections', 'summon')).toBe(false);
    expect(isDiscordAdministrativeCommand('collections', 'capacity-force-add')).toBe(true);
    expect(isDiscordAdministrativeCommand('leaderboard', null)).toBe(false);
    expect(isDiscordAdministrativeCommand('steal-emoji', null)).toBe(true);
    expect(isDiscordAdministrativeCommand('temp', 'update-leave-info')).toBe(true);
  });

  it('enforces the General channel selection only for member-facing command shapes', () => {
    expect(requiresDefaultCommandChannel('xp', 'add')).toBe(false);
    expect(requiresDefaultCommandChannel('knowbucks', 'set')).toBe(false);
    expect(requiresDefaultCommandChannel('steal-emoji', null)).toBe(false);
    expect(requiresDefaultCommandChannel('snipe', null)).toBe(false);
    expect(requiresDefaultCommandChannel('temp', 'update-leave-info')).toBe(false);
    expect(requiresDefaultCommandChannel('xp', 'view')).toBe(true);
    expect(requiresDefaultCommandChannel('invite', 'leaderboard')).toBe(true);
    expect(requiresDefaultCommandChannel('knowbucks', 'balance')).toBe(true);
    expect(requiresDefaultCommandChannel('collections', 'spawn')).toBe(false);
    expect(requiresDefaultCommandChannel('riftbound', 'buy')).toBe(false);
  });

  it('turns expected Riftbound persistence failures into member-facing notes', () => {
    expect(riftboundMockCommandErrorNote(new Error('Insufficient KnowBucks balance.'))).toContain('enough KnowBucks');
    expect(riftboundMockCommandErrorNote(new Error('You do not have enough unopened packs or boxes from this set.'))).toContain('enough unopened packs or boxes');
  });
});
