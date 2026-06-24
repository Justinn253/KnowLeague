import { NextResponse } from 'next/server';
import { submitSkincognitoAction, type SkincognitoActionType, type SkincognitoCategoryId } from '@/lib/skincognito';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';

type SubmitActionBody = {
  clientId: string;
  actionType: SkincognitoActionType;
  categoryId?: SkincognitoCategoryId | null;
  guessValue: string;
};

const actionTypes = new Set(['category_guess', 'skin_guess']);

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: { code: string } }) {
  try {
    const body = await readJsonBody<SubmitActionBody>(request);
    const actionType = requireString(body.actionType, 'actionType') as SkincognitoActionType;
    if (!actionTypes.has(actionType)) {
      throw new Error('Invalid actionType.');
    }

    const view = await submitSkincognitoAction(params.code, {
      clientId: requireString(body.clientId, 'clientId'),
      actionType,
      categoryId: typeof body.categoryId === 'string' ? body.categoryId : null,
      guessValue: requireString(body.guessValue, 'guessValue'),
    });

    return NextResponse.json(view);
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
