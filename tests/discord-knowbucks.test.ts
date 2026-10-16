import { describe, expect, it } from 'vitest';
import { serializedCommandDefinitions } from '../discord-bot/src/commands';

type SerializedSubcommand = {
  min_value?: number;
  name: string;
  options?: SerializedSubcommand[];
};

describe('Discord KnowBucks command contract', () => {
  it('registers balance, payment, and staff management subcommands', () => {
    const command = serializedCommandDefinitions().find((definition) => definition.name === 'knowbucks');

    expect(command).toBeDefined();
    expect(command?.options?.map((option) => option.name)).toEqual([
      'balance',
      'pay',
      'add',
      'remove',
      'set',
    ]);
  });

  it('allows a zero balance only for the staff set command', () => {
    const command = serializedCommandDefinitions().find((definition) => definition.name === 'knowbucks');
    const subcommands = new Map((command?.options ?? []).map((option) => [
      option.name,
      option as SerializedSubcommand,
    ]));
    const setAmount = subcommands.get('set')?.options?.find((option) => option.name === 'amount');
    const payAmount = subcommands.get('pay')?.options?.find((option) => option.name === 'amount');

    expect(setAmount?.min_value).toBe(0);
    expect(payAmount?.min_value).toBe(1);
  });
});
