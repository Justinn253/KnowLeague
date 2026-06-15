import { NextResponse, type NextRequest } from 'next/server';
import { getQuizItems } from '@/lib/riot';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const category = request.nextUrl.searchParams.get('category');
    const allItems = await getQuizItems();
    const answersByType = allItems.reduce<Record<string, Set<string>>>((acc, item) => {
      if (!acc[item.type]) {
        acc[item.type] = new Set();
      }
      acc[item.type].add(item.answer);
      return acc;
    }, {});

    const result = Object.fromEntries(
      Object.entries(answersByType).map(([type, answers]) => [type, Array.from(answers).sort()]),
    );

    // If a specific category is requested, return just that one
    if (category) {
      return NextResponse.json(result[category] || []);
    }

    // Default: flatten all answers across all types for unified autocomplete
    const allAnswers = Array.from(new Set(Object.values(result).flat())).sort();
    return NextResponse.json(allAnswers);
  } catch (error) {
    console.error('Failed to prepare quiz answer index', error);
    return NextResponse.json({ error: 'Failed to prepare quiz answer index.' }, { status: 500 });
  }
}
