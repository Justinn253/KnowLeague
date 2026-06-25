import { createHmac, timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { getRouteErrorResponse } from '@/lib/api-utils';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';

export const runtime = 'nodejs';

type DiscordTokenResponse = {
  access_token: string;
  token_type: string;
};

type DiscordUserResponse = {
  id: string;
  username: string;
  global_name?: string | null;
  discriminator?: string | null;
  avatar?: string | null;
  banner?: string | null;
};

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

function validateState(state: string, expectedState: string | undefined, secret: string) {
  if (!expectedState || state !== expectedState) {
    throw new Error('Invalid Discord authorization state.');
  }

  const [userId, nonce, signature] = state.split('.');
  if (!userId || !nonce || !signature) {
    throw new Error('Invalid Discord authorization state.');
  }

  const expectedSignature = signState(userId, nonce, secret);
  const signatureBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');
  if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) {
    throw new Error('Invalid Discord authorization state.');
  }

  return userId;
}

function getDiscordAvatarUrl(user: DiscordUserResponse) {
  if (!user.avatar) {
    return null;
  }

  const extension = user.avatar.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${extension}`;
}

function getDiscordBannerUrl(user: DiscordUserResponse) {
  if (!user.banner) {
    return null;
  }

  const extension = user.banner.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/banners/${user.id}/${user.banner}.${extension}?size=1024`;
}

export async function GET(request: Request) {
  const response = NextResponse.redirect(new URL('/profile?discord=linked', request.url));
  response.cookies.delete('knowleague_discord_oauth_state');

  try {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (!code || !state) {
      throw new Error('Discord authorization was cancelled.');
    }

    const { clientId, clientSecret, redirectUri } = getDiscordConfig(request);
    const userId = validateState(state, request.headers.get('cookie')?.match(/(?:^|;\s*)knowleague_discord_oauth_state=([^;]+)/)?.[1], clientSecret);
    const tokenBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    });
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: tokenBody,
    });

    if (!tokenResponse.ok) {
      throw new Error('Unable to link Discord account.');
    }

    const token = await tokenResponse.json() as DiscordTokenResponse;
    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `${token.token_type} ${token.access_token}` },
    });

    if (!userResponse.ok) {
      throw new Error('Unable to read Discord account.');
    }

    const discordUser = await userResponse.json() as DiscordUserResponse;
    const discordUsername = discordUser.discriminator && discordUser.discriminator !== '0'
      ? `${discordUser.username}#${discordUser.discriminator}`
      : discordUser.global_name || discordUser.username;
    const supabase = getSupabaseServiceClient();
    const { error } = await supabase
      .from('profile_private_details')
      .upsert({
        user_id: userId,
        discord_username: discordUsername,
        discord_user_id: discordUser.id,
        discord_avatar_url: getDiscordAvatarUrl(discordUser),
        discord_banner_url: getDiscordBannerUrl(discordUser),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (error) {
      const errorText = error.message.toLowerCase();
      if (errorText.includes('discord_banner_url')) {
        const { error: fallbackError } = await supabase
          .from('profile_private_details')
          .upsert({
            user_id: userId,
            discord_username: discordUsername,
            discord_user_id: discordUser.id,
            discord_avatar_url: getDiscordAvatarUrl(discordUser),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' });
        if (fallbackError) {
          throw fallbackError;
        }
      } else if (error.code === 'PGRST204' || errorText.includes('discord_user_id') || errorText.includes('discord_avatar_url')) {
        const { error: fallbackError } = await supabase
          .from('profile_private_details')
          .upsert({
            user_id: userId,
            discord_username: discordUsername,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' });
        if (fallbackError) {
          throw fallbackError;
        }
      } else {
        throw error;
      }
    }

    return response;
  } catch (error) {
    const errorResponse = getRouteErrorResponse(error);
    const redirect = NextResponse.redirect(new URL('/profile?discord=error', request.url));
    redirect.cookies.delete('knowleague_discord_oauth_state');
    return errorResponse.status >= 500 ? errorResponse : redirect;
  }
}
