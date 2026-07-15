import { NextResponse } from 'next/server';
import { getSkinCatalog } from '@/lib/catalogs';

export const runtime = 'nodejs';

function formatRarity(rarity?: string | null) {
  const cleanRarity = rarity || 'Unknown';
  return cleanRarity.startsWith('k') ? cleanRarity.slice(1) : cleanRarity;
}

export async function GET() {
  const skins = getSkinCatalog();
  const values = {
    skin: skins.map((skin) => ({ id: skin.id, label: skin.answer, imageUrl: skin.imageUrl })),
    champion: Array.from(new Set(skins.map((skin) => skin.champion).filter(Boolean))).sort(),
    skinLine: Array.from(new Set(skins.map((skin) => skin.skinLine || 'Unknown'))).sort(),
    releaseYear: Array.from(new Set(skins.map((skin) => skin.releaseDate?.slice(0, 4) || 'Unknown'))).sort(),
    rarity: Array.from(new Set(skins.map((skin) => formatRarity(skin.rarity))))
      .filter((rarity) => rarity !== 'Exalted')
      .sort(),
    gender: Array.from(new Set(skins.map((skin) => skin.gender || 'Unknown'))).sort(),
    role: Array.from(new Set(skins.map((skin) => skin.role || 'Unknown'))).sort(),
    race: Array.from(new Set(skins.flatMap((skin) => (skin.race || 'Unknown').split(',').map((race) => race.trim())))).sort(),
  };

  return NextResponse.json(values, {
    headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
  });
}
