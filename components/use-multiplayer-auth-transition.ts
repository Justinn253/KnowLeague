'use client';

import { useEffect, useRef } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getAuthSessionId } from '@/lib/auth-session';
import { getOptionalSupabaseClient } from '@/lib/supabaseClient';

function getIdentityKey(session: Session | null) {
  if (!session) return 'guest';
  return `${session.user.id}:${getAuthSessionId(session.access_token) ?? 'unknown-session'}`;
}

/** Multiplayer modes must hard-leave their current lobby when the browser auth identity changes. */
export function useMultiplayerAuthTransition(onIdentityChange: () => void | Promise<void>) {
  const callbackRef = useRef(onIdentityChange);
  callbackRef.current = onIdentityChange;

  useEffect(() => {
    const supabase = getOptionalSupabaseClient();
    if (!supabase) return undefined;

    let identityKey: string | null = null;
    let disposed = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (!disposed && identityKey === null) identityKey = getIdentityKey(data.session);
    });

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== 'SIGNED_IN' && event !== 'SIGNED_OUT') return;
      const nextIdentityKey = getIdentityKey(session);
      if (identityKey === null) {
        identityKey = nextIdentityKey;
        return;
      }
      if (identityKey === nextIdentityKey) return;
      identityKey = nextIdentityKey;
      void callbackRef.current();
    });

    return () => {
      disposed = true;
      data.subscription.unsubscribe();
    };
  }, []);
}
