import { describe, expect, it } from 'vitest';
import { answerMatches, formatSeconds, getNormalizedAnswerVariants } from '@/lib/quiz';

describe('quiz helpers', () => {
  it('formats elapsed seconds as minutes and seconds', () => {
    expect(formatSeconds(0)).toBe('0:00');
    expect(formatSeconds(65)).toBe('1:05');
  });

  it('matches normalized answers and slash-separated variants', () => {
    expect(answerMatches(' Aurelion Sol ', 'Aurelion Sol')).toBe(true);
    expect(answerMatches('KhaZix', 'Kha\'Zix / Kha Zix')).toBe(true);
    expect(answerMatches('Teemo', 'Rammus')).toBe(false);
    expect(getNormalizedAnswerVariants('Lee Sin / LeeSin')).toContain('leesin');
  });
});
