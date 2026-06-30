import { NextResponse } from 'next/server';
import { getCategoryClashRejoinEligibility } from '@/lib/category-clash';
import { getRouteErrorResponse } from '@/lib/api-utils';

export const runtime = 'nodejs';

export async function GET(request: Request, { params }: { params: { code: string } }) {
  try {
    const clientId = new URL(request.url).searchParams.get('clientId');
    if (!clientId) throw new Error('Client ID is required.');
    return NextResponse.json(await getCategoryClashRejoinEligibility(params.code, clientId));
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
