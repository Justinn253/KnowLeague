import { describe, expect, it } from 'vitest';
import { APP_INACTIVITY_TIMEOUT_MS, isAppActivityActive } from '@/lib/app-activity';

describe('app activity policy', () => {
  it('considers recent activity active only while the window is visible and focused', () => {
    const now = 10_000;

    expect(isAppActivityActive({
      isVisible: true,
      isWindowFocused: true,
      lastActivityAt: now - 1,
      now,
    })).toBe(true);
    expect(isAppActivityActive({
      isVisible: false,
      isWindowFocused: true,
      lastActivityAt: now - 1,
      now,
    })).toBe(false);
    expect(isAppActivityActive({
      isVisible: true,
      isWindowFocused: false,
      lastActivityAt: now - 1,
      now,
    })).toBe(false);
  });

  it('expires exactly at the inactivity threshold', () => {
    const now = 10_000;

    expect(isAppActivityActive({
      isVisible: true,
      isWindowFocused: true,
      lastActivityAt: now - APP_INACTIVITY_TIMEOUT_MS + 1,
      now,
    })).toBe(true);
    expect(isAppActivityActive({
      isVisible: true,
      isWindowFocused: true,
      lastActivityAt: now - APP_INACTIVITY_TIMEOUT_MS,
      now,
    })).toBe(false);
  });

  it('rejects a future activity timestamp instead of treating it as active', () => {
    expect(isAppActivityActive({
      isVisible: true,
      isWindowFocused: true,
      lastActivityAt: 10_001,
      now: 10_000,
    })).toBe(false);
  });
});
