import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

function removedSetsResponse() {
  return NextResponse.json({ error: 'Riftbound sets have been replaced by binders.' }, { status: 410 });
}

export const GET = withApiMetrics('/api/riftbound/sets', async function GET() {
  return removedSetsResponse();
});

export const POST = withApiMetrics('/api/riftbound/sets', async function POST() {
  return removedSetsResponse();
});

export const PATCH = withApiMetrics('/api/riftbound/sets', async function PATCH() {
  return removedSetsResponse();
});

export const DELETE = withApiMetrics('/api/riftbound/sets', async function DELETE() {
  return removedSetsResponse();
});
