import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-server';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    await getAuthenticatedUser(request);
    return NextResponse.json({ authenticated: true });
  } catch {
    return NextResponse.json({ error: 'Authentication is required.' }, { status: 401 });
  }
}
