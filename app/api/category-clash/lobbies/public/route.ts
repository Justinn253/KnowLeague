import { NextResponse } from 'next/server';
import { listPublicCategoryClashLobbies } from '@/lib/category-clash';
import { getRouteErrorResponse } from '@/lib/api-utils';

export const runtime = 'nodejs';

export async function GET() {
  try {
    return NextResponse.json(await listPublicCategoryClashLobbies());
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
