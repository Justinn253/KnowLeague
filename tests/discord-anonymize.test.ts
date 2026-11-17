import { describe, expect, it } from 'vitest';
import {
  anonymizeMemberHasRole,
  formatAnonymizeId,
  normalizeAnonymizeId,
} from '../discord-bot/src/anonymize';

describe('Discord Anonymize helpers', () => {
  it('formats and accepts the displayed anonymous message identifier', () => {
    expect(formatAnonymizeId('A1B2C3D4E5F6')).toBe('ANON-A1B2C3D4E5F6');
    expect(normalizeAnonymizeId(' anon-a1b2c3d4e5f6 ')).toBe('A1B2C3D4E5F6');
    expect(normalizeAnonymizeId('A1B2C3D4E5F6')).toBe('A1B2C3D4E5F6');
    expect(normalizeAnonymizeId('ANON-TOO-SHORT')).toBeNull();
    expect(normalizeAnonymizeId('ANON-A1B2C3D4E5F!')).toBeNull();
  });

  it('requires an overlap between a member and configured permission roles', () => {
    expect(anonymizeMemberHasRole(['111', '222'], new Set(['333', '222']))).toBe(true);
    expect(anonymizeMemberHasRole(['111', '222'], new Set(['333']))).toBe(false);
    expect(anonymizeMemberHasRole([], new Set(['333']))).toBe(false);
  });
});
