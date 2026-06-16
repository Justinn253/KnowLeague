function xmur3(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

export function seededShuffle<T>(items: readonly T[], seed: string) {
  const random = xmur3(seed);
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = random() % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function dailySeed(scope: string, now = new Date()) {
  return `${scope}:${now.toISOString().slice(0, 10)}`;
}
