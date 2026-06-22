'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Search, Send, Users, X } from 'lucide-react';
import { getOptionalSupabaseClient } from '@/lib/supabaseClient';

type FriendSummary = {
  id: string;
  friendshipId: string;
  username: string;
  displayName: string;
  online: boolean;
  unreadCount: number;
};

type IncomingRequest = {
  id: string;
  requester: FriendSummary;
  createdAt: string;
};

type FriendMessage = {
  id: string;
  sender_id: string;
  message: string;
  created_at: string;
};

type FriendDashboard = {
  friends: FriendSummary[];
  incomingRequests: IncomingRequest[];
  pendingRequestCount: number;
  onlineFriendCount: number;
};

type FriendsWidgetProps = {
  onPendingRequestCountChange?: (count: number) => void;
};

function openPublicProfileOverlay(username: string) {
  window.dispatchEvent(new CustomEvent('knowleague:open-profile', { detail: { username } }));
}

type MultiplayerInvite = {
  gameName: 'Skincognito' | 'Ability Blitz' | 'Skin Champion';
  url: string;
};

const multiplayerInviteGames: Record<string, MultiplayerInvite['gameName']> = {
  '/skincognito': 'Skincognito',
  '/multiplayer/ability-blitz': 'Ability Blitz',
  '/multiplayer/skin-champion': 'Skin Champion',
};

function getCurrentMultiplayerInvite(): MultiplayerInvite | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const currentUrl = new URL(window.location.href);
  const gameName = multiplayerInviteGames[currentUrl.pathname];
  if (!gameName) return null;
  const code = currentUrl.searchParams.get('code') || (
    currentUrl.pathname === '/skincognito'
      ? window.localStorage.getItem('knowleague:v1:skincognito:lobby-code')
      : null
  );
  if (!code) {
    return null;
  }

  currentUrl.searchParams.set('code', code);
  return { gameName, url: currentUrl.toString() };
}

function getMultiplayerInvite(message: string): MultiplayerInvite | null {
  const match = message.match(/Join my (Skincognito|Ability Blitz|Skin Champion) game:\s*(https?:\/\/\S+)/i);
  if (!match?.[1] || !match[2]) {
    return null;
  }

  try {
    const url = new URL(match[2]);
    const gameName = multiplayerInviteGames[url.pathname];
    return gameName && url.searchParams.get('code') ? { gameName, url: url.toString() } : null;
  } catch {
    return null;
  }
}

async function getAuthHeaders() {
  const supabase = getOptionalSupabaseClient();
  const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : null;
}

async function fetchAuthedJson(url: string, options: RequestInit = {}) {
  const authHeaders = await getAuthHeaders();
  if (!authHeaders) {
    throw new Error('Login required.');
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      ...authHeaders,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? 'Friend request failed.');
  }

  return data;
}

export function FriendsWidget({ onPendingRequestCountChange }: FriendsWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [dashboard, setDashboard] = useState<FriendDashboard | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [activeFriend, setActiveFriend] = useState<FriendSummary | null>(null);
  const [messages, setMessages] = useState<FriendMessage[]>([]);
  const [messageDraft, setMessageDraft] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [addFriendOpen, setAddFriendOpen] = useState(false);
  const [addFriendUsername, setAddFriendUsername] = useState('');
  const [status, setStatus] = useState('');
  const [contextFriend, setContextFriend] = useState<{ friend: FriendSummary; x: number; y: number } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dashboardRef = useRef<FriendDashboard | null>(null);
  const activeFriendRef = useRef<FriendSummary | null>(null);
  const refreshTimeoutRef = useRef<number | null>(null);
  const lastDashboardRefreshAtRef = useRef(0);

  const refreshDashboard = useCallback(async () => {
    try {
      const data = await fetchAuthedJson('/api/friends') as FriendDashboard;
      setDashboard(data);
      dashboardRef.current = data;
      lastDashboardRefreshAtRef.current = Date.now();
      onPendingRequestCountChange?.(data.pendingRequestCount);
    } catch {
      setDashboard(null);
      dashboardRef.current = null;
      onPendingRequestCountChange?.(0);
    }
  }, [onPendingRequestCountChange]);

  const scheduleDashboardRefresh = useCallback(() => {
    if (refreshTimeoutRef.current) {
      window.clearTimeout(refreshTimeoutRef.current);
    }

    refreshTimeoutRef.current = window.setTimeout(() => {
      refreshTimeoutRef.current = null;
      void refreshDashboard();
    }, 150);
  }, [refreshDashboard]);

  const loadActiveFriendMessages = useCallback(async (friend: FriendSummary) => {
    try {
      const data = await fetchAuthedJson(`/api/friends/messages?friendId=${friend.id}`);
      setMessages(data.messages ?? []);
      scheduleDashboardRefresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to load messages.');
    }
  }, [scheduleDashboardRefresh]);

  useEffect(() => {
    activeFriendRef.current = activeFriend;
  }, [activeFriend]);

  useEffect(() => {
    if (!dashboardRef.current || Date.now() - lastDashboardRefreshAtRef.current > 10_000) {
      void refreshDashboard();
    }
    const supabase = getOptionalSupabaseClient();
    let socialChannel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;
    let presenceChannel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;
    let disposed = false;

    supabase?.auth.getSession().then(({ data }) => {
      if (disposed) {
        return;
      }

      const userId = data.session?.user.id ?? null;
      setCurrentUserId(userId);
      if (!userId) {
        return;
      }

      supabase
        .getChannels()
        .filter((channel) => (
          channel.topic.endsWith('knowleague-online-users') ||
          channel.topic.endsWith(`friend-social:${userId}`)
        ))
        .forEach((channel) => {
          void supabase.removeChannel(channel);
        });

      const nextPresenceChannel = supabase.channel('knowleague-online-users', {
        config: { presence: { key: userId } },
      });
      presenceChannel = nextPresenceChannel;
      nextPresenceChannel
        .on('presence', { event: 'sync' }, () => {
          const state = nextPresenceChannel.presenceState<{ userId: string }>();
          setOnlineUserIds(new Set(Object.values(state).flat().map((presence) => presence.userId)));
        });
      nextPresenceChannel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void nextPresenceChannel.track({ userId });
        }
      });

      const nextSocialChannel = supabase.channel(`friend-social:${userId}`);
      socialChannel = nextSocialChannel;
      nextSocialChannel
        .on('postgres_changes', { event: '*', schema: 'public', table: 'friend_requests' }, (payload) => {
          const row = { ...(payload.old as Record<string, unknown>), ...(payload.new as Record<string, unknown>) };
          if (row.requester_id === userId || row.addressee_id === userId) {
            scheduleDashboardRefresh();
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, (payload) => {
          scheduleDashboardRefresh();
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload) => {
          const profileId = (payload.new as { id?: string }).id;
          const friendIds = new Set(dashboardRef.current?.friends.map((friend) => friend.id) ?? []);
          if (profileId === userId || (profileId && friendIds.has(profileId))) {
            scheduleDashboardRefresh();
          }
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'friend_messages' }, (payload) => {
          const friendshipId = (payload.new as { friendship_id?: string }).friendship_id;
          const active = activeFriendRef.current;
          if (active && friendshipId === active.friendshipId) {
            void loadActiveFriendMessages(active);
            return;
          }

          const friendshipIds = new Set(dashboardRef.current?.friends.map((friend) => friend.friendshipId) ?? []);
          if (friendshipId && friendshipIds.has(friendshipId)) {
            scheduleDashboardRefresh();
          }
        })
        .subscribe();
    });

    return () => {
      disposed = true;
      if (refreshTimeoutRef.current) {
        window.clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }

      if (socialChannel) {
        void supabase?.removeChannel(socialChannel);
      }

      if (presenceChannel) {
        void presenceChannel.untrack();
        void supabase?.removeChannel(presenceChannel);
      }
    };
  }, [loadActiveFriendMessages, refreshDashboard, scheduleDashboardRefresh]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    void refreshDashboard();
    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setContextFriend(null);
        setAddFriendOpen(false);
        setAddFriendUsername('');
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isOpen, refreshDashboard]);

  useEffect(() => {
    if (!activeFriend) {
      setMessages([]);
      return;
    }

    void loadActiveFriendMessages(activeFriend);
  }, [activeFriend, loadActiveFriendMessages]);

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeFriend || !messageDraft.trim()) {
      return;
    }

    try {
      const data = await fetchAuthedJson('/api/friends/messages', {
        method: 'POST',
        body: JSON.stringify({ friendId: activeFriend.id, message: messageDraft }),
      });
      setMessages(data.messages ?? []);
      setMessageDraft('');
      await refreshDashboard();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to send message.');
    }
  };

  const sendDirectFriendRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanUsername = addFriendUsername.trim().toLowerCase();
    if (cleanUsername.length < 3) {
      setStatus('Enter a username with at least 3 characters.');
      return;
    }

    try {
      await fetchAuthedJson('/api/friends/requests', {
        method: 'POST',
        body: JSON.stringify({ targetUsername: cleanUsername }),
      });
      setStatus('Friend request sent.');
      setAddFriendUsername('');
      setAddFriendOpen(false);
      scheduleDashboardRefresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to send friend request.');
    }
  };

  const allFriends = (dashboard?.friends ?? [])
    .map((friend) => ({ ...friend, online: onlineUserIds.has(friend.id) }))
    .sort((left, right) => Number(right.online) - Number(left.online) || left.displayName.localeCompare(right.displayName));
  const onlineCount = allFriends.filter((friend) => friend.online).length;
  const cleanSearchQuery = searchQuery.trim().toLowerCase();
  const friends = cleanSearchQuery
    ? allFriends.filter((friend) => (
        friend.displayName.toLowerCase().includes(cleanSearchQuery) ||
        friend.username.toLowerCase().includes(cleanSearchQuery)
      ))
    : allFriends;
  const activeFriendView = activeFriend
    ? { ...activeFriend, online: onlineUserIds.has(activeFriend.id) }
    : null;
  const unreadTotal = dashboard?.friends.reduce((total, friend) => total + friend.unreadCount, 0) ?? 0;

  useEffect(() => {
    if (!activeFriend || allFriends.some((friend) => friend.id === activeFriend.id)) {
      return;
    }

    setActiveFriend(null);
    setMessages([]);
  }, [activeFriend, allFriends]);

  const unfriend = async (friend: FriendSummary) => {
    await fetchAuthedJson(`/api/friends/${friend.id}`, { method: 'DELETE' });
    if (activeFriend?.id === friend.id) {
      setActiveFriend(null);
    }
    setContextFriend(null);
    await refreshDashboard();
  };

  const inviteFriendToGame = async (friend: FriendSummary) => {
    const invite = getCurrentMultiplayerInvite();
    if (!invite) {
      setStatus('No active multiplayer game invite is available.');
      return;
    }

    try {
      await fetchAuthedJson('/api/friends/messages', {
        method: 'POST',
        body: JSON.stringify({
          friendId: friend.id,
          message: `Join my ${invite.gameName} game: ${invite.url}`,
        }),
      });
      setContextFriend(null);
      setStatus('Game invite sent.');
      scheduleDashboardRefresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to send game invite.');
    }
  };

  return (
    <div ref={rootRef} className="relative">
      {isOpen ? (
        <div
          ref={panelRef}
          className="absolute bottom-full right-0 mb-3 w-[min(calc(100vw-2.5rem),42rem)] rounded-3xl border border-white/10 bg-slate-950 p-4"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">Friends</p>
              <h2 className="mt-1 text-lg font-bold text-white">{onlineCount} online</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setAddFriendOpen((value) => !value);
                  setStatus('');
                }}
                className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-amber-300/40 bg-amber-300/10 px-3 text-sm font-bold text-amber-100 transition hover:bg-amber-300/20"
              >
                <Users size={15} />
                Add Friend
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  setAddFriendOpen(false);
                  setAddFriendUsername('');
                  setContextFriend(null);
                }}
                aria-label="Close friends"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-slate-900 text-slate-200 transition hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-2">
            {addFriendOpen ? (
              <form onSubmit={sendDirectFriendRequest} className="grid gap-2 rounded-2xl border border-white/10 bg-slate-950/80 p-3 sm:grid-cols-[1fr_auto]">
                <input
                  value={addFriendUsername}
                  onChange={(event) => setAddFriendUsername(event.target.value)}
                  placeholder="Username"
                  autoComplete="off"
                  className="min-h-10 rounded-xl border border-white/10 bg-slate-900 px-3 text-sm text-white outline-none placeholder:text-slate-500"
                />
                <button
                  type="submit"
                  disabled={addFriendUsername.trim().length < 3}
                  className="inline-flex min-h-10 items-center justify-center rounded-xl bg-amber-300 px-4 text-sm font-bold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Send
                </button>
              </form>
            ) : null}
            <div className="relative">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search Friends"
                autoComplete="off"
                className="min-h-11 w-full rounded-2xl border border-white/10 bg-slate-900 px-10 pr-11 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-white/20 focus:ring-1 focus:ring-white/15"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear friend search"
                  className="absolute right-3 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-white"
                >
                  <X size={15} />
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_13rem]">
            <section className="flex min-h-72 flex-col rounded-2xl border border-white/10 bg-slate-950/70 p-3">
              {activeFriendView ? (
                <>
                  <div className="border-b border-white/10 pb-2">
                    <p className="text-sm font-bold text-white">{activeFriendView.displayName}</p>
                    <p className={`text-xs ${activeFriendView.online ? 'text-emerald-300' : 'text-slate-500'}`}>
                      {activeFriendView.online ? 'Online' : 'Offline'}
                    </p>
                  </div>
                  <div className="mt-3 grid flex-1 content-start gap-2 overflow-y-auto">
                    {messages.map((chatMessage) => {
                      const isOwnMessage = chatMessage.sender_id === currentUserId;
                      const invite = getMultiplayerInvite(chatMessage.message);

                      return (
                        <div
                          key={chatMessage.id}
                          className={`max-w-[82%] rounded-xl px-3 py-2 text-sm ${
                            isOwnMessage
                              ? 'ml-auto bg-amber-300 text-right font-medium text-slate-950'
                              : 'mr-auto bg-slate-900 text-slate-200'
                          }`}
                        >
                          {invite ? (
                            <div className={`flex flex-wrap items-center gap-2 ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
                              <span>{invite.gameName} invite</span>
                              <button
                                type="button"
                                onClick={() => {
                                  window.location.href = invite.url;
                                }}
                                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                                  isOwnMessage
                                    ? 'bg-slate-950 text-amber-200 hover:bg-slate-800'
                                    : 'bg-amber-300 text-slate-950 hover:bg-amber-200'
                                }`}
                              >
                                Join Game
                              </button>
                            </div>
                          ) : (
                            chatMessage.message
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <form onSubmit={sendMessage} className="mt-3 flex gap-2">
                    <input
                      value={messageDraft}
                      onChange={(event) => setMessageDraft(event.target.value.slice(0, 1000))}
                      placeholder="Message"
                      className="min-h-10 flex-1 rounded-xl border border-white/10 bg-slate-900 px-3 text-sm text-white outline-none placeholder:text-slate-500"
                    />
                    <button
                      type="submit"
                      disabled={!messageDraft.trim()}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-amber-300 text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Send size={16} />
                    </button>
                  </form>
                </>
              ) : (
                <div className="flex flex-1 items-center justify-center text-center text-sm text-slate-500">
                  Select a friend to open chat.
                </div>
              )}
            </section>
            <section className="max-h-72 overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/70 p-2">
              {friends.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-slate-500">
                  {cleanSearchQuery ? 'None found' : 'No friends yet.'}
                </p>
              ) : null}
              {friends.map((friend) => (
                <button
                  key={friend.id}
                  type="button"
                  onClick={() => setActiveFriend((current) => (current?.id === friend.id ? null : friend))}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setContextFriend({ friend, x: event.clientX, y: event.clientY });
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition ${
                    activeFriend?.id === friend.id ? 'bg-amber-300 text-slate-950' : 'text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${friend.online ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                  <span className="truncate text-sm font-semibold">{friend.displayName}</span>
                  {friend.unreadCount > 0 ? (
                    <span className="ml-auto rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
                      {friend.unreadCount > 99 ? '99+' : friend.unreadCount}
                    </span>
                  ) : null}
                </button>
              ))}
            </section>
          </div>
          {contextFriend ? (
            <div
              className="fixed z-[70] rounded-2xl border border-white/10 bg-slate-950 p-2"
              style={{ left: contextFriend.x, top: contextFriend.y }}
            >
              <button
                type="button"
                onClick={() => {
                  openPublicProfileOverlay(contextFriend.friend.username);
                  setContextFriend(null);
                }}
                className="block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-100 transition hover:bg-slate-900"
              >
                View Profile
              </button>
              <button
                type="button"
                onClick={() => unfriend(contextFriend.friend)}
                className="block rounded-xl px-3 py-2 text-sm font-semibold text-red-100 transition hover:bg-red-500/10"
              >
                Unfriend
              </button>
              {getCurrentMultiplayerInvite() ? (
                <button
                  type="button"
                  onClick={() => inviteFriendToGame(contextFriend.friend)}
                  className="block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-amber-100 transition hover:bg-amber-300/10"
                >
                  Invite to Game
                </button>
              ) : null}
            </div>
          ) : null}

          {status ? (
            <p className="mt-3 rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm font-semibold text-slate-200">
              {status}
            </p>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => {
          setIsOpen((value) => {
            if (value) {
              setAddFriendOpen(false);
              setAddFriendUsername('');
              setContextFriend(null);
            }
            return !value;
          });
        }}
        className="relative inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-slate-950 px-4 text-sm font-bold text-slate-100 transition hover:border-white/20 hover:bg-slate-900"
      >
        <Users size={18} />
        Friends
        <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-100">
          {onlineCount}
        </span>
        {unreadTotal > 0 ? (
          <span className="absolute -right-2 -top-2 rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
            {unreadTotal > 99 ? '99+' : unreadTotal}
          </span>
        ) : null}
      </button>
    </div>
  );
}
