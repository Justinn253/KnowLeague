const DATA_DRAGON_VERSION = '14.24.1';
const DATA_DRAGON_BASE = `https://ddragon.leagueoflegends.com/cdn/${DATA_DRAGON_VERSION}`;

export type ChampionSkill = {
  name: string;
  description: string;
  imageUrl: string;
};

export type ChampionData = {
  id: string;
  name: string;
  title: string;
  tags: string[];
  imageUrl: string;
  passive: ChampionSkill;
  spells: ChampionSkill[];
};

export type QuizItem = {
  id: string;
  type: 'champion' | 'spell' | 'passive' | 'ultimate' | 'skin';
  title: string;
  question: string;
  answer: string;
  imageUrl: string;
  champion: string;
};

function championIconUrl(imageFile: string) {
  return `${DATA_DRAGON_BASE}/img/champion/${imageFile}`;
}

function spellIconUrl(imageFile: string) {
  return `${DATA_DRAGON_BASE}/img/spell/${imageFile}`;
}

function passiveIconUrl(imageFile: string) {
  return `${DATA_DRAGON_BASE}/img/passive/${imageFile}`;
}

export async function getChampionData(championId: string): Promise<ChampionData | null> {
  const response = await fetch(`${DATA_DRAGON_BASE}/data/en_US/champion/${championId}.json`);
  if (!response.ok) {
    return null;
  }

  const json = await response.json();
  const champion = Object.values(json.data)[0] as any;
  return {
    id: champion.id,
    name: champion.name,
    title: champion.title,
    tags: champion.tags,
    imageUrl: championIconUrl(champion.image.full),
    passive: {
      name: champion.passive.name,
      description: champion.passive.description,
      imageUrl: passiveIconUrl(champion.passive.image.full),
    },
    spells: champion.spells.map((spell: any) => ({
      name: spell.name,
      description: spell.description,
      imageUrl: spellIconUrl(spell.image.full),
    })),
  };
}

function shuffle<T>(items: T[]) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export async function getSampleQuizItems(): Promise<QuizItem[]> {
  // Try fetching the combined champion data file and build items.
  try {
    const url = `${DATA_DRAGON_BASE}/data/en_US/champion.json`;
    const res = await fetch(url);
    console.log('[riot] fetch champion.json response ok=', res.ok, 'status=', res.status);
    if (res.ok) {
      const json = await res.json();
      const data = json.data as Record<string, any>;
      const keys = Object.keys(data || {});
      console.log('[riot] champion.json entries=', keys.length);
      if (keys.length > 0) {
        const sample = data[keys[0]];
        console.log('[riot] sample champion name=', sample?.name, 'hasPassiveImage=', !!(sample?.passive?.image?.full), 'spells=', Array.isArray(sample?.spells) ? sample.spells.length : 0);
      }
      const items: QuizItem[] = [];

      // Champion index doesn't include full ability/passive images in some DDragon variants.
      // Fetch each champion's full data to ensure spells/passive images are available.
      for (const champId of keys) {
        try {
          const champion = await getChampionData(champId);
          if (!champion) continue;

          // passive
          if (champion.passive && champion.passive.imageUrl) {
            items.push({
              id: `${champion.id}-passive`,
              type: 'passive',
              title: 'Passive Ability',
              question: champion.passive.name || 'Passive',
              answer: champion.passive.name || champion.name,
              imageUrl: champion.passive.imageUrl,
              champion: champion.name,
            });
          }

          // spells (Q/W/E/R)
          champion.spells.forEach((spell: any, idx: number) => {
            if (spell && spell.imageUrl) {
              const spellType = idx === 3 ? 'ultimate' : 'spell';
              items.push({
                id: `${champion.id}-spell-${idx}`,
                type: spellType,
                title: spellType === 'ultimate' ? 'Ultimate Clue' : 'Ability Icon',
                question: spell.name || `Spell ${idx}`,
                answer: spell.name || champion.name,
                imageUrl: spell.imageUrl,
                champion: champion.name,
              });
            }
          });
        } catch (e) {
          // ignore individual champion errors
        }
      }

      // Remove any items lacking imageUrl or answer
      console.log('[riot] items generated before filter=', items.length);
      const filtered = items.filter((it) => it.imageUrl && it.answer);
      console.log('[riot] items after filter=', filtered.length);
      return filtered;
    }
  } catch (err) {
    // fall through to per-champion fallback
    console.warn('Failed to fetch champion.json, falling back to per-champion fetch', err);
  }

  // Fallback: fetch a small set of champions individually (helps in restricted network environments)
  const fallbackIds = ['Yasuo', 'Ashe', 'Lux', 'Thresh', 'Ahri', 'Garen'];
  const fallbackItems: QuizItem[] = [];
  for (const id of fallbackIds) {
    try {
      const champion = await getChampionData(id);
      if (!champion) continue;

      if (champion.passive && champion.passive.imageUrl) {
        fallbackItems.push({
          id: `${champion.id}-passive`,
          type: 'passive',
          title: 'Passive Ability',
          question: champion.passive.name,
          answer: champion.passive.name,
          imageUrl: champion.passive.imageUrl,
          champion: champion.name,
        });
      }

      champion.spells.forEach((spell, idx) => {
        if (spell && spell.imageUrl) {
          const spellType = idx === 3 ? 'ultimate' : 'spell';
          fallbackItems.push({
            id: `${champion.id}-spell-${idx}`,
            type: spellType,
            title: spellType === 'ultimate' ? 'Ultimate Clue' : 'Ability Icon',
            question: spell.name,
            answer: spell.name,
            imageUrl: spell.imageUrl,
            champion: champion.name,
          });
        }
      });
    } catch (e) {
      // ignore champion fetch errors
    }
  }

  return shuffle(fallbackItems);
}
