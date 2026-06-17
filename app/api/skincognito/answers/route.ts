import { NextResponse } from 'next/server';
import { getSkinCatalog } from '@/lib/catalogs';

export const runtime = 'nodejs';

export async function GET() {
  const skins = getSkinCatalog();
  const values = {
    skin: skins.map((skin) => ({ id: skin.id, label: skin.answer, imageUrl: skin.imageUrl })),
    champion: Array.from(new Set(skins.map((skin) => skin.champion).filter(Boolean))).sort(),
    skinLine: Array.from(new Set(skins.map((skin) => skin.skinLine || 'Unknown'))).sort(),
    releaseYear: Array.from(new Set(skins.map((skin) => skin.releaseDate?.slice(0, 4) || 'Unknown'))).sort(),
    rarity: Array.from(new Set(skins.map((skin) => skin.rarity || 'Unknown'))).sort(),
    gender: Array.from(new Set(skins.map((skin) => skin.gender || 'Unknown'))).sort(),
    role: Array.from(new Set(skins.map((skin) => skin.role || 'Unknown'))).sort(),
    race: Array.from(new Set(skins.flatMap((skin) => (skin.race || 'Unknown').split(',').map((race) => race.trim())))).sort(),
  };

  return NextResponse.json(values);
}
