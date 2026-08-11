'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Search, Users, X } from 'lucide-react';
import Link from 'next/link';
import { subscribeToRealtimeChannel } from '@/components/multiplayer-realtime';
import { ToggleSwitch } from '@/components/toggle-switch';
import { getChatNameStyle } from '@/lib/chat-colors';
import { getOptionalSupabaseClient } from '@/lib/supabaseClient';
import { getPublicProfileHref, shouldOpenProfileInNewTab } from '@/lib/profile-navigation';
import { THEMED_SCROLLBAR_CLASS } from '@/lib/scrollbar';

type ProfileFriendPreview = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  chatColor: string;
  profileStatus: string;
  createdAt: string | null;
  online: boolean;
  favorite: boolean;
};

type PresenceState = {
  online: boolean;
  away: boolean;
};

type ProfileFriendsMenuProps = {
  username: string;
  count: number;
  isOwner: boolean;
  initialListPublic: boolean;
};

function formatJoinDate(value: string | null) {
  if (!value) return 'Join date unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Join date unavailable';
  return `Joined ${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date)}`;
}

function getPresenceClass(presence: PresenceState | undefined, fallbackOnline: boolean) {
  if (presence?.away) return 'bg-amber-300';
  if (presence?.online ?? fallbackOnline) return 'bg-emerald-400';
  return 'bg-slate-600';
}

export function ProfileFriendsMenu({ username, count, isOwner, initialListPublic }: ProfileFriendsMenuProps) {
  const [open, setOpen] = useState(false);
  const [listPublic, setListPublic] = useState(initialListPublic);
  const [friends, setFriends] = useState<ProfileFriendPreview[]>([]);
  const [visible, setVisible] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingVisibility, setSavingVisibility] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [presenceByUserId, setPresenceByUserId] = useState<Map<string, PresenceState>>(new Map());
  const [error, setError] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setListPublic(initialListPublic);
  }, [initialListPublic]);

  useEffect(() => {
    if (!open) return undefined;

    const closeOnOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    const supabase = getOptionalSupabaseClient();
    if (!open || !supabase || friends.length === 0) {
      setPresenceByUserId(new Map());
      return undefined;
    }

    const channels = friends.map((friend) => {
      const topic = `realtime:knowleague-user-presence:${friend.id}`;
      const existingChannel = supabase.getChannels().find((channel) => channel.topic === topic);
      return {
        friendId: friend.id,
        channel: existingChannel ?? supabase.channel(`knowleague-user-presence:${friend.id}`),
        owned: !existingChannel,
      };
    });
    const syncPresence = () => {
      const nextPresence = new Map<string, PresenceState>();
      channels.forEach(({ friendId, channel }) => {
        const state = channel.presenceState<{ userId?: string; away?: boolean }>();
        const entry = Object.values(state).flat().find((presence) => presence.userId === friendId);
        if (entry) nextPresence.set(friendId, { online: !entry.away, away: Boolean(entry.away) });
      });
      setPresenceByUserId(nextPresence);
    };

    channels.forEach(({ channel }) => {
      // The shared friends widget may already own the presence channel. Polling
      // the channel state here avoids registering callbacks after subscribe().
      subscribeToRealtimeChannel(channel, syncPresence);
    });
    const presencePoll = window.setInterval(syncPresence, 15_000);

    return () => {
      window.clearInterval(presencePoll);
      channels.forEach(({ channel, owned }) => {
        if (owned) void supabase.removeChannel(channel);
      });
    };
  }, [friends, open]);

  const loadFriends = async () => {
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      const supabase = getOptionalSupabaseClient();
      const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
      const response = await fetch(`/api/profile/public/${encodeURIComponent(username)}/friends`, {
        headers: data.session ? { Authorization: `Bearer ${data.session.access_token}` } : undefined,
      });
      const body = await response.json() as { friends?: ProfileFriendPreview[]; visible?: boolean; error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Unable to load friends.');
      setFriends(body.friends ?? []);
      setVisible(body.visible !== false);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load friends.');
    } finally {
      setLoading(false);
    }
  };

  const toggleOpen = () => {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen && visible === null) void loadFriends();
  };

  const toggleVisibility = async () => {
    if (!isOwner || savingVisibility) return;
    const nextValue = !listPublic;
    setSavingVisibility(true);
    setError('');
    try {
      const supabase = getOptionalSupabaseClient();
      const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
      if (!supabase || !data.session) throw new Error('Your session has expired. Please sign in again.');
      const response = await fetch('/api/profile/preferences', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ friendsListPublic: nextValue }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Unable to update friends-list privacy.');
      setListPublic(nextValue);
      // Owners can always view their own list, so changing privacy does not
      // need to discard or refetch the friends already shown in this menu.
      setVisible(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to update friends-list privacy.');
    } finally {
      setSavingVisibility(false);
    }
  };

  const filteredFriends = useMemo(() => {
    const cleanQuery = searchQuery.trim().toLowerCase();
    return [...friends]
      .filter((friend) => !cleanQuery || friend.displayName.toLowerCase().includes(cleanQuery) || friend.username.toLowerCase().includes(cleanQuery))
      .sort((left, right) => Number(right.favorite) - Number(left.favorite) || left.displayName.localeCompare(right.displayName));
  }, [friends, searchQuery]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={toggleOpen}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-slate-950/80 px-3 text-sm font-semibold text-slate-300 transition hover:border-amber-200/40 hover:bg-slate-900 sm:flex-none sm:px-4"
      >
        <Users size={16} className="text-amber-300" />
        Friends <span className="text-slate-600">|</span> {count}
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-40 mt-2 w-[min(34rem,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-slate-950 p-3">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">Friends <span className="text-slate-600">|</span> {count}</p>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close friends list" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-slate-900 text-slate-200 transition hover:border-white/20 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-200">
              <X size={18} />
            </button>
          </div>
          {isOwner ? (
            <button
              type="button"
              onClick={() => void toggleVisibility()}
              disabled={savingVisibility}
              className="mt-3 flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-left text-xs font-semibold text-slate-200 transition hover:border-amber-200/40 disabled:opacity-60"
            >
              <span>Private Visibility</span>
              {savingVisibility ? <Loader2 size={15} className="shrink-0 animate-spin text-amber-300" /> : <ToggleSwitch checked={!listPublic} disabled={savingVisibility} />}
            </button>
          ) : null}
          {visible !== false ? (
            <div className="relative mt-3">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search friends"
                autoComplete="off"
                className="min-h-10 w-full rounded-xl border border-white/10 bg-slate-900 px-9 pr-9 text-sm text-white outline-none placeholder:text-slate-500 focus:border-amber-200/40"
              />
              {searchQuery ? (
                <button type="button" onClick={() => setSearchQuery('')} aria-label="Clear friends list search" className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white">
                  <X size={14} />
                </button>
              ) : null}
            </div>
          ) : null}
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400"><Loader2 size={16} className="animate-spin text-amber-300" /> Loading friends...</div>
          ) : error ? (
            <p className="py-5 text-sm text-red-200">{error}</p>
          ) : visible === false ? (
            <p className="py-5 text-sm leading-5 text-slate-400">This friends list is private.</p>
          ) : friends.length === 0 ? (
            <p className="py-5 text-sm text-slate-500">No friends to show.</p>
          ) : filteredFriends.length === 0 ? (
            <p className="py-5 text-sm text-slate-500">No friends match that search.</p>
          ) : (
            <div className={`mt-3 grid max-h-[min(28rem,calc(100dvh-14rem))] gap-2 overflow-x-hidden overflow-y-auto pr-1 ${THEMED_SCROLLBAR_CLASS}`}>
              {filteredFriends.map((friend) => {
                const presence = presenceByUserId.get(friend.id);
                return (
                  <Link
                    key={friend.id}
                    href={getPublicProfileHref(friend.username)}
                    target={shouldOpenProfileInNewTab() ? '_blank' : undefined}
                    rel={shouldOpenProfileInNewTab() ? 'noopener noreferrer' : undefined}
                    onClick={() => setOpen(false)}
                    className="flex min-h-14 items-center gap-3 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 transition hover:border-amber-200/35 hover:bg-slate-800"
                  >
                    <span className="relative shrink-0">
                      <span
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-slate-950 bg-cover bg-center text-xs font-black text-amber-200"
                        style={friend.avatarUrl ? { backgroundImage: `url(${friend.avatarUrl})` } : undefined}
                      >
                        {friend.avatarUrl ? null : friend.displayName.slice(0, 1).toUpperCase()}
                      </span>
                      <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-slate-900 ${getPresenceClass(presence, friend.online)}`} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-1.5">
                        {friend.favorite ? <span className="text-amber-300" title="Favorite">★</span> : null}
                        <span className="truncate text-sm font-semibold text-white" style={getChatNameStyle(friend.chatColor)}>{friend.displayName}</span>
                      </span>
                      {friend.profileStatus ? <span className="mt-0.5 block truncate text-[0.68rem] text-slate-400">{friend.profileStatus}</span> : null}
                      <span className="mt-0.5 block truncate text-[0.65rem] text-slate-500">{formatJoinDate(friend.createdAt)}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
