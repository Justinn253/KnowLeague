import { NextResponse } from 'next/server';

export function getRouteErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unexpected API error.';
  const status = message.includes('not found') ? 404 : message.includes('Supabase is not configured') ? 503 : 400;

  return NextResponse.json({ error: message }, { status });
}

export async function readJsonBody<TBody>(request: Request): Promise<Partial<TBody>> {
  try {
    return (await request.json()) as Partial<TBody>;
  } catch {
    return {};
  }
}

export function requireString(value: unknown, fieldName: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${fieldName} is required.`);
  }

  return value;
}
