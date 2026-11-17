import { describe, expect, it } from 'vitest';
import { temporaryVoiceMemberHasCreatorRole } from '../discord-bot/src/temporary-voice-channels';

describe('Discord temporary voice authorization', () => {
  it('requires overlap with a configured temporary voice creator role', () => {
    expect(temporaryVoiceMemberHasCreatorRole(['111', '222'], new Set(['333', '222']))).toBe(true);
    expect(temporaryVoiceMemberHasCreatorRole(['111', '222'], new Set(['333']))).toBe(false);
    expect(temporaryVoiceMemberHasCreatorRole([], new Set(['333']))).toBe(false);
  });
});
