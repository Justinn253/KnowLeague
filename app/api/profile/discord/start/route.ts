import { createHmac, randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth-server';
import { getRouteErrorResponse } from '@/lib/api-utils';

export const runtime = 'nodejs';

function getDiscordConfig(request: Request) {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Discord OAuth is not configured.');
  }

  const origin = new URL(request.url).origin;
  return {
    clientId,
    clientSecret,
    redirectUri: process.env.DISCORD_REDIRECT_URI || `${origin}/api/profile/discord/callback`,
  };
}

function signState(userId: string, nonce: string, secret: string) {
  return createHmac('sha256', secret).update(`${userId}.${nonce}`).digest('hex');
}

export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const { clientId, clientSecret, redirectUri } = getDiscordConfig(request);
    const nonce = randomBytes(16).toString('hex');
    const state = `${userId}.${nonce}.${signState(userId, nonce, clientSecret)}`;
    const authorizeUrl = new URL('https://discord.com/oauth2/authorize');
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('client_id', clientId);
    authorizeUrl.searchParams.set('scope', 'identify');
    authorizeUrl.searchParams.set('state', state);
    authorizeUrl.searchParams.set('redirect_uri', redirectUri);
    authorizeUrl.searchParams.set('prompt', 'consent');

    const response = NextResponse.json({ url: authorizeUrl.toString() });
    response.cookies.set('knowleague_discord_oauth_state', state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 10 * 60,
      path: '/',
    });
    return response;
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
