import { describe, expect, it } from 'vitest';
import { isAllowedCommandChannel, usesDefaultCommandChannel } from '../discord-bot/src/general-settings';

describe('Discord General command-channel scope', () => {
  it('applies the default channel only to commands without a feature channel scope', () => {
    expect(usesDefaultCommandChannel('help')).toBe(true);
    expect(usesDefaultCommandChannel('knowbucks')).toBe(true);
    expect(usesDefaultCommandChannel('snipe')).toBe(true);
    expect(usesDefaultCommandChannel('xp')).toBe(true);

    expect(usesDefaultCommandChannel('collections')).toBe(false);
    expect(usesDefaultCommandChannel('fish')).toBe(false);
    expect(usesDefaultCommandChannel('league')).toBe(false);
  });

  it('allows all channels for an empty selection and every selected channel otherwise', () => {
    expect(isAllowedCommandChannel('100000000000000001', new Set())).toBe(true);

    const selectedChannelIds = new Set(['100000000000000001', '100000000000000002']);
    expect(isAllowedCommandChannel('100000000000000001', selectedChannelIds)).toBe(true);
    expect(isAllowedCommandChannel('100000000000000002', selectedChannelIds)).toBe(true);
    expect(isAllowedCommandChannel('100000000000000003', selectedChannelIds)).toBe(false);
  });
});
