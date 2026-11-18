import { describe, expect, it } from 'vitest';
import { parseTemporaryVoiceUserList, temporaryVoiceMemberHasCreatorRole } from '../discord-bot/src/temporary-voice-channels';

describe('Discord temporary voice authorization', () => {
  it('requires overlap with a configured temporary voice creator role', () => {
    expect(temporaryVoiceMemberHasCreatorRole(['111', '222'], new Set(['333', '222']))).toBe(true);
    expect(temporaryVoiceMemberHasCreatorRole(['111', '222'], new Set(['333']))).toBe(false);
    expect(temporaryVoiceMemberHasCreatorRole([], new Set(['333']))).toBe(false);
  });

  it('accepts multiple Discord mentions or All in one access-list option', () => {
    expect(parseTemporaryVoiceUserList('<@12345678901234567>, <@!23456789012345678> 34567890123456789')).toEqual({
      all: false,
      userIds: ['12345678901234567', '23456789012345678', '34567890123456789'],
    });
    expect(parseTemporaryVoiceUserList(' All ')).toEqual({ all: true, userIds: [] });
    expect(() => parseTemporaryVoiceUserList('<@everyone>')).toThrow('Discord @mentions or user IDs');
  });
});
