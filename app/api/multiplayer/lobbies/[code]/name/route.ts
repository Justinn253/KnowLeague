import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST() {
  return NextResponse.json({ error: 'Custom multiplayer display names are no longer supported.' }, { status: 410 });
}
