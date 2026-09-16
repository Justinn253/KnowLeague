import { describe, expect, it } from 'vitest';
import { getNewsEntries, type NewsEntry } from '@/lib/news';

const now = Date.parse('2026-09-16T12:00:00.000Z');
const day = 24 * 60 * 60 * 1000;
const post = (id: string, time: number): NewsEntry => ({
  id, kind: 'news', publishedAt: new Date(time).toISOString(), title: id, paragraphs: ['Body'],
});

describe('public news publication and archive', () => {
  it('archives exactly at 30 days and retains newer posts', () => {
    const result = getNewsEntries(now, [
      post('boundary', now - 30 * day),
      post('recent', now - 30 * day + 1),
      post('older', now - 31 * day),
    ]);
    expect(result.recent.map((entry) => entry.id)).toEqual(['recent']);
    expect(result.archived.map((entry) => entry.id)).toEqual(['boundary', 'older']);
  });

  it('sorts newest first, excludes future posts, and does not mutate source order', () => {
    const entries = [post('old', now - day), post('future', now + 1), post('new', now)];
    const result = getNewsEntries(now, entries);
    expect(result.recent.map((entry) => entry.id)).toEqual(['new', 'old']);
    expect(result.latest?.id).toBe('new');
    expect(entries.map((entry) => entry.id)).toEqual(['old', 'future', 'new']);
  });

  it('keeps the latest published post available for the home preview after archival', () => {
    const entry: NewsEntry = { ...post('release', now - 31 * day), kind: 'update', version: '1.2.3' };
    const result = getNewsEntries(now, [entry]);
    expect(result.recent).toEqual([]);
    expect(result.latest).toEqual(entry);
    expect(result.archived).toEqual([entry]);
  });

  it('handles an empty feed or only future posts', () => {
    for (const entries of [[], [post('future', now + day)]]) {
      expect(getNewsEntries(now, entries)).toEqual({ latest: undefined, recent: [], archived: [] });
    }
  });
});
