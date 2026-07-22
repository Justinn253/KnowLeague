import { describe, expect, it } from 'vitest';
import { sanitizeChatMessage } from '@/lib/chat-filter';

describe('chat message sanitization', () => {
  it('masks a blocked term while preserving the surrounding message', () => {
    const blockedTerm = Buffer.from('bmlnZ2E=', 'base64').toString('utf8');

    expect(sanitizeChatMessage(`hello ${blockedTerm}`)).toBe(`hello ${'*'.repeat(blockedTerm.length)}`);
  });

  it('leaves ordinary messages unchanged', () => {
    expect(sanitizeChatMessage('good luck, have fun')).toBe('good luck, have fun');
  });
});
