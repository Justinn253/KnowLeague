'use client';

import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Crown, MoreHorizontal, UserCheck, UserMinus, UserX, Users, WifiOff } from 'lucide-react';
import { getOptionalSupabaseClient } from '@/lib/supabaseClient';

export type MultiplayerLobbyRosterPlayer = {
  id: string;
  authUserId: string | null;
  displayName: string;
  avatarUrl?: string | null;
  nameColor?: string;
  role: string;
  isCurrentUser: boolean;
  isHost: boolean;
  canPromote?: boolean;
  canDemote?: boolean;
  status?: ReactNode;
  cardTone?: 'default' | 'success' | 'danger' | 'victory';
  disconnected?: boolean;
  muted?: boolean;
};

type MultiplayerLobbyRosterProps = {
  players: MultiplayerLobbyRosterPlayer[];
  countLabel?: string;
  canManage: boolean;
  showHeader?: boolean;
  compactColumns?: boolean;
  onKick?: (playerId: string) => void | Promise<void>;
  onPromote?: (playerId: string) => void | Promise<void>;
  onDemote?: (playerId: string) => void | Promise<void>;
  onMakeHost?: (playerId: string) => void | Promise<void>;
};

type ContextMenuState = {
  player: MultiplayerLobbyRosterPlayer;
  x: number;
  y: number;
};

function openPublicProfileOverlay(username: string) {
  window.dispatchEvent(new CustomEvent('knowleague:open-profile', { detail: { username } }));
}

export function MultiplayerLobbyRoster({
  players,
  countLabel,
  canManage,
  showHeader = true,
  compactColumns = false,
  onKick,
  onPromote,
  onDemote,
  onMakeHost,
}: MultiplayerLobbyRosterProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [currentAuthUserId, setCurrentAuthUserId] = useState<string | null>(null);
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());
  const [profileUsernames, setProfileUsernames] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const profileIds = useMemo(
    () => [...new Set(players.flatMap((player) => player.authUserId ? [player.authUserId] : []))],
    [players],
  );
  const profileIdKey = profileIds.join(',');

  useEffect(() => {
    const closeMenu = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || menuRef.current?.contains(target)) {
        return;
      }
      if (target instanceof Element && target.closest('[data-roster-menu-trigger]')) {
        return;
      }
      setContextMenu(null);
    };
    document.addEventListener('pointerdown', closeMenu);
    return () => document.removeEventListener('pointerdown', closeMenu);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadSocialContext = async () => {
      const supabase = getOptionalSupabaseClient();
      if (!supabase) {
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (cancelled) {
        return;
      }
      const session = data.session;
      setCurrentAuthUserId(session?.user.id ?? null);

      if (profileIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username')
          .in('id', profileIds)
          .returns<Array<{ id: string; username: string }>>();
        if (!cancelled) {
          setProfileUsernames(Object.fromEntries((profiles ?? []).map((profile) => [profile.id, profile.username])));
        }
      } else {
        setProfileUsernames({});
      }

      if (!session) {
        setFriendIds(new Set());
        return;
      }
      const response = await fetch('/api/friends', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!response.ok || cancelled) {
        return;
      }
      const dashboard = await response.json();
      if (!cancelled) {
        setFriendIds(new Set((dashboard.friends ?? []).map((friend: { id: string }) => friend.id)));
      }
    };

    void loadSocialContext();
    return () => {
      cancelled = true;
    };
  // profileIdKey is a stable dependency for the current roster identities.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileIdKey]);

  const refreshFriendIds = async () => {
    const supabase = getOptionalSupabaseClient();
    const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
    if (!data.session) {
      setFriendIds(new Set());
      return null;
    }
    const response = await fetch('/api/friends', {
      headers: { Authorization: `Bearer ${data.session.access_token}` },
    });
    const dashboard = response.ok ? await response.json() : null;
    setFriendIds(new Set((dashboard?.friends ?? []).map((friend: { id: string }) => friend.id)));
    return data.session;
  };

  const addFriend = async (targetUserId: string) => {
    const supabase = getOptionalSupabaseClient();
    const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
    if (!data.session) {
      setStatus('Login required to send friend requests.');
      return;
    }
    const response = await fetch('/api/friends/requests', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ targetUserId }),
    });
    const body = await response.json();
    setStatus(response.ok ? 'Friend request sent.' : body.error ?? 'Unable to send friend request.');
    setContextMenu(null);
  };

  const unfriend = async (targetUserId: string) => {
    const supabase = getOptionalSupabaseClient();
    const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
    if (!data.session) {
      return;
    }
    const response = await fetch(`/api/friends/${targetUserId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${data.session.access_token}` },
    });
    if (!response.ok) {
      const body = await response.json();
      setStatus(body.error ?? 'Unable to remove friend.');
      return;
    }
    await refreshFriendIds();
    setContextMenu(null);
  };

  const openActionsMenu = (event: React.MouseEvent<HTMLButtonElement>, player: MultiplayerLobbyRosterPlayer) => {
    if (player.isCurrentUser && !hasMenuActions(player)) {
      return;
    }
    event.stopPropagation();
    if (contextMenu?.player.id === player.id) {
      setContextMenu(null);
      return;
    }
    const buttonBounds = event.currentTarget.getBoundingClientRect();
    setContextMenu({
      player,
      x: Math.max(12, Math.min(buttonBounds.right - 192, window.innerWidth - 204)),
      y: Math.max(12, Math.min(buttonBounds.bottom + 8, window.innerHeight - 260)),
    });
  };

  const runManagementAction = async (action?: (playerId: string) => void | Promise<void>) => {
    if (!contextMenu || !action) {
      return;
    }
    await action(contextMenu.player.id);
    setContextMenu(null);
  };

  const hasMenuActions = (player: MultiplayerLobbyRosterPlayer) => Boolean(
    (player.authUserId && profileUsernames[player.authUserId])
    || (player.authUserId && currentAuthUserId && player.authUserId !== currentAuthUserId)
    || (canManage && onMakeHost && !player.isHost)
    || (canManage && player.canPromote && onPromote)
    || (canManage && player.canDemote && onDemote)
    || (canManage && !player.isCurrentUser && onKick),
  );

  return (
    <section className="w-full min-w-0 overflow-hidden rounded-3xl border border-white/10 bg-slate-950/70 p-3 sm:p-5">
      {showHeader ? (
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Lobby</p>
            {countLabel ? <h3 className="mt-2 text-lg font-semibold text-white">{countLabel}</h3> : null}
          </div>
          <Users size={20} className="text-amber-300" />
        </div>
      ) : null}

      <div className={`${showHeader ? 'mt-5' : ''} grid gap-2 ${compactColumns ? 'sm:grid-cols-2' : ''}`}>
        {players.map((player) => {
          const isFriend = Boolean(player.authUserId && friendIds.has(player.authUserId));
          const playerInitial = player.displayName.trim().slice(0, 1).toUpperCase() || '?';
          const showActionsButton = !(player.isCurrentUser && player.isHost) && hasMenuActions(player);
          const cardClassName = player.cardTone === 'victory'
            ? 'border-transparent bg-slate-950'
            : player.cardTone === 'success'
            ? 'border-emerald-400/60 bg-emerald-500/15'
            : player.cardTone === 'danger'
              ? 'border-red-500/70 bg-red-500/15'
              : 'border-white/10 bg-slate-900/80';
          const card = (
            <div
              className={`flex min-w-0 max-w-full items-center justify-between gap-3 overflow-hidden rounded-2xl border px-4 py-3 ${cardClassName}`}
            >
              <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
                <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-slate-950 text-sm font-black text-amber-200" aria-hidden="true">
                  <span
                    className={`absolute inset-0 rounded-full bg-cover bg-center ${player.disconnected ? 'grayscale opacity-45' : ''}`}
                    style={player.avatarUrl ? { backgroundImage: `url(${player.avatarUrl})` } : undefined}
                  />
                  <span className="relative">{player.avatarUrl ? null : playerInitial}</span>
                  {player.disconnected ? (
                    <span className="absolute -right-1 -top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-red-300/60 bg-red-500 text-white">
                      <WifiOff size={11} />
                    </span>
                  ) : null}
                </span>
                <div className="min-w-0 flex-1 overflow-hidden">
                  <p className="flex min-w-0 items-center gap-1.5 overflow-hidden text-sm font-semibold text-white">
                    <span
                      className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap"
                      style={player.muted ? { color: '#94a3b8' } : player.nameColor ? { color: player.nameColor } : undefined}
                    >
                      {player.displayName}{player.authUserId ? '' : ' (Guest)'}{player.isCurrentUser ? ' (you)' : ''}
                    </span>
                  </p>
                  <p className="mt-1 flex items-center gap-1 text-xs capitalize text-slate-500">
                    {isFriend ? <><Users size={12} className="shrink-0 text-amber-300" aria-label="Friend" /> <span aria-hidden="true">-</span></> : null}
                    <span>{player.role}</span>
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {player.status}
                {showActionsButton ? (
                  <button type="button" data-roster-menu-trigger onClick={(event) => openActionsMenu(event, player)} aria-label={`More actions for ${player.displayName}`} aria-expanded={contextMenu?.player.id === player.id} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-transparent bg-transparent text-slate-400 transition hover:bg-white/5 hover:text-white focus:outline-none focus:ring-2 focus:ring-amber-300">
                    <MoreHorizontal size={14} />
                  </button>
                ) : null}
              </div>
            </div>
          );
          return player.cardTone === 'victory' ? (
            <div key={player.id} className="multiplayer-victory-border rounded-2xl">{card}</div>
          ) : (
            <div key={player.id}>{card}</div>
          );
        })}
      </div>

      {status ? <p className="mt-3 text-xs font-semibold text-slate-400">{status}</p> : null}

      {contextMenu ? createPortal((
        <div ref={menuRef} className="fixed z-[90] min-w-48 rounded-2xl border border-white/10 bg-slate-950 p-2" style={{ left: contextMenu.x, top: contextMenu.y }}>
          {contextMenu.player.authUserId && profileUsernames[contextMenu.player.authUserId] ? (
            <button type="button" onClick={() => { openPublicProfileOverlay(profileUsernames[contextMenu.player.authUserId as string]); setContextMenu(null); }} className="block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-100 transition hover:bg-slate-900">View Profile</button>
          ) : null}
          {contextMenu.player.authUserId && currentAuthUserId && contextMenu.player.authUserId !== currentAuthUserId ? (
            friendIds.has(contextMenu.player.authUserId) ? (
              <button type="button" onClick={() => unfriend(contextMenu.player.authUserId as string)} className="block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-red-100 transition hover:bg-red-500/10">Unfriend</button>
            ) : (
              <button type="button" onClick={() => addFriend(contextMenu.player.authUserId as string)} className="block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-amber-100 transition hover:bg-amber-300/10">Add Friend</button>
            )
          ) : null}
          {canManage && onMakeHost && !contextMenu.player.isHost ? (
            <button type="button" onClick={() => runManagementAction(onMakeHost)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-sky-100 transition hover:bg-sky-500/10"><Crown size={14} />Make Host</button>
          ) : null}
          {canManage && contextMenu.player.canPromote && onPromote ? (
            <button type="button" onClick={() => runManagementAction(onPromote)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/10"><UserCheck size={14} />Make Player</button>
          ) : null}
          {canManage && contextMenu.player.canDemote && onDemote ? (
            <button type="button" onClick={() => runManagementAction(onDemote)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-100 transition hover:bg-slate-800"><UserMinus size={14} />Make Spectator</button>
          ) : null}
          {canManage && !contextMenu.player.isCurrentUser && onKick ? (
            <button type="button" onClick={() => runManagementAction(onKick)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-red-100 transition hover:bg-red-500/10"><UserX size={14} />Kick</button>
          ) : null}
          {!hasMenuActions(contextMenu.player) ? (
            <p className="px-3 py-2 text-sm text-slate-500">No actions available</p>
          ) : null}
        </div>
      ), document.body) : null}
    </section>
  );
}
