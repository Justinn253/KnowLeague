import { describe, expect, it } from 'vitest';
import { serializedCommandDefinitions } from '../discord-bot/src/commands';
import { isDiscordAdministrativeCommand, isDiscordHiddenCommand, requiresDefaultCommandChannel, riftboundMockCommandErrorNote } from '../discord-bot/src/interactions';

describe('Discord slash-command visibility', () => {
  it('identifies only staff-gated command shapes as administrative', () => {
    expect(isDiscordAdministrativeCommand('xp', 'view')).toBe(false);
    expect(isDiscordAdministrativeCommand('xp', 'add')).toBe(true);
    expect(isDiscordAdministrativeCommand('knowbucks', 'balance')).toBe(false);
    expect(isDiscordAdministrativeCommand('knowbucks', 'set')).toBe(true);
    expect(isDiscordAdministrativeCommand('collections', 'summon')).toBe(false);
    expect(isDiscordAdministrativeCommand('collections', 'capacity-force-add')).toBe(true);
    expect(isDiscordAdministrativeCommand('leaderboard', null)).toBe(false);
    expect(isDiscordAdministrativeCommand('anonymize', null)).toBe(false);
    expect(isDiscordAdministrativeCommand('anonymize-view', null)).toBe(true);
    expect(isDiscordAdministrativeCommand('steal-emoji', null)).toBe(true);
    expect(isDiscordAdministrativeCommand('invite', 'set-invite-count')).toBe(true);
  });

  it('keeps marked hidden replies private and available outside the General channel selection', () => {
    const hiddenCommands = [
      ['link', null],
      ['profile', null],
      ['anonymize-report', null],
      ['anonymize-view', null],
      ['collections', 'spawn'],
      ['collections', 'capacity-force-add'],
      ['invite', 'set-invite-count'],
      ['knowbucks', 'add'],
      ['knowbucks', 'remove'],
      ['knowbucks', 'set'],
      ['steal-emoji', null],
      ['steal-sticker', null],
      ['xp', 'add'],
      ['xp', 'set-level'],
    ] as const;

    for (const [commandName, subcommand] of hiddenCommands) {
      expect(isDiscordHiddenCommand(commandName, subcommand)).toBe(true);
      expect(requiresDefaultCommandChannel(commandName, subcommand)).toBe(false);
    }
    expect(isDiscordHiddenCommand('xp', 'view')).toBe(false);
  });

  it('registers public dice roll and scoped anonymize command shapes without the temporary group', () => {
    const diceRoll = serializedCommandDefinitions().find((command) => command.name === 'dice-roll');

    expect(diceRoll?.options).toEqual([
      expect.objectContaining({ name: 'upper-limit', required: true, type: 4, min_value: 2, max_value: 1_000_000 }),
    ]);
    expect(serializedCommandDefinitions().some((command) => command.name === 'temp')).toBe(false);
    expect(serializedCommandDefinitions().find((command) => command.name === 'anonymize')?.options).toEqual([
      expect.objectContaining({ name: 'message', required: true, type: 3, min_length: 1, max_length: 4_000 }),
    ]);
    expect(serializedCommandDefinitions().find((command) => command.name === 'anonymize-report')?.options).toEqual([
      expect.objectContaining({ name: 'anonymize-id', required: true, type: 3, min_length: 12, max_length: 17 }),
    ]);
    expect(serializedCommandDefinitions().find((command) => command.name === 'anonymize-view')?.options).toEqual([
      expect.objectContaining({ name: 'anonymize-id', required: true, type: 3, min_length: 12, max_length: 17 }),
    ]);
  });

  it('enforces the General channel selection only for member-facing command shapes', () => {
    expect(requiresDefaultCommandChannel('xp', 'add')).toBe(false);
    expect(requiresDefaultCommandChannel('knowbucks', 'set')).toBe(false);
    expect(requiresDefaultCommandChannel('steal-emoji', null)).toBe(false);
    expect(requiresDefaultCommandChannel('snipe', null)).toBe(false);
    expect(requiresDefaultCommandChannel('link', null)).toBe(false);
    expect(requiresDefaultCommandChannel('profile', null)).toBe(false);
    expect(requiresDefaultCommandChannel('invite', 'set-invite-count')).toBe(false);
    expect(requiresDefaultCommandChannel('xp', 'view')).toBe(true);
    expect(requiresDefaultCommandChannel('invite', 'leaderboard')).toBe(true);
    expect(requiresDefaultCommandChannel('knowbucks', 'balance')).toBe(true);
    expect(requiresDefaultCommandChannel('collections', 'spawn')).toBe(false);
    expect(requiresDefaultCommandChannel('riftbound', 'buy')).toBe(false);
    expect(requiresDefaultCommandChannel('anonymize', null)).toBe(false);
    expect(requiresDefaultCommandChannel('anonymize-report', null)).toBe(false);
  });

  it('turns expected Riftbound persistence failures into member-facing notes', () => {
    expect(riftboundMockCommandErrorNote(new Error('Insufficient KnowBucks balance.'))).toContain('enough KnowBucks');
    expect(riftboundMockCommandErrorNote(new Error('You do not have enough unopened packs or boxes from this set.'))).toContain('enough unopened packs or boxes');
  });
});
