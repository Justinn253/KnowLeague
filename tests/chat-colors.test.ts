import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CHAT_BORDER,
  DEFAULT_CHAT_COLOR,
  getChatBubbleStyle,
  normalizeChatBorder,
  normalizeChatColor,
} from '@/lib/chat-colors';

describe('chat cosmetic helpers', () => {
  it('falls back to safe defaults for unknown values', () => {
    expect(normalizeChatColor('not-a-color')).toBe(DEFAULT_CHAT_COLOR);
    expect(normalizeChatBorder('not-a-border')).toBe(DEFAULT_CHAT_BORDER);
  });

  it('returns a complete bubble style from stored cosmetics', () => {
    expect(getChatBubbleStyle('cyan', 'violet')).toMatchObject({
      backgroundColor: '#22d3ee',
      color: '#020617',
      borderColor: '#8b5cf6',
      borderStyle: 'solid',
      borderWidth: '2px',
    });
  });
});
