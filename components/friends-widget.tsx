'use client';

import { Fragment, FormEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronUp, CircleSlash2, Ellipsis, ExternalLink, Loader2, Pencil, Save, Search, Send, ShieldBan, Star, StickyNote, Users, X } from 'lucide-react';
import Link from 'next/link';
import { getOptionalSupabaseClient } from '@/lib/supabaseClient';
import { subscribeToRealtimeChannel } from '@/components/multiplayer-realtime';
import { getChatBubbleStyle, getChatInviteButtonStyle, getChatNameStyle, normalizeChatBorder, normalizeChatColor } from '@/lib/chat-colors';
import { getLiveGameNote, type LiveGameStatusView } from '@/lib/riot-live-game-ui';
import { OPEN_FRIEND_MESSAGES_EVENT } from '@/lib/friends-navigation';
import { getPublicProfileHref, shouldOpenProfileInNewTab } from '@/lib/profile-navigation';
import { THEMED_SCROLLBAR_CLASS } from '@/lib/scrollbar';
import { playUiSound } from '@/lib/ui-sounds';

type FriendSummary = {
  id: string;
  friendshipId: string;
  username: string;
  displayName: string;
  aboutMe: string;
  createdAt: string | null;
  discordUsername: string | null;
  discordAvatarUrl: string | null;
  riotAccountName: string | null;
  profileStatus: string;
  online: boolean;
  away?: boolean;
  unreadCount: number;
  chatColor: string;
  chatBorder: string;
  avatarUrl: string | null;
  friendNote: string;
  favorite: boolean;
};

type FriendSearchCandidate = {
  id: string;
  username: string;
  displayName: string;
  friendRequestsOpen: boolean;
  avatarUrl: string | null;
  chatColor: string;
  createdAt: string | null;
  blocked: boolean;
  relationship: 'friend' | 'incoming' | 'outgoing' | 'none';
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
  chat_color: string;
  chat_border: string;
  deliveryStatus?: MessageDeliveryStatus;
};

type MessageDeliveryStatus = 'pending' | 'sent' | 'failed';

type MessageProfile = {
  chatColor: string;
  chatBorder: string;
  avatarUrl: string | null;
};

type FriendDashboard = {
  currentUser: FriendSummary | null;
  friends: FriendSummary[];
  incomingRequests: IncomingRequest[];
  pendingRequestCount: number;
  onlineFriendCount: number;
};

type FriendsWidgetProps = {
  onPendingRequestCountChange?: (count: number) => void;
  variant?: 'floating' | 'header' | 'responsive';
};

function sortFriendMessages(left: FriendMessage, right: FriendMessage) {
  return left.created_at.localeCompare(right.created_at);
}

function mergeFriendMessages(serverMessages: FriendMessage[], cachedMessages: FriendMessage[]) {
  const cachedById = new Map(cachedMessages.map((message) => [message.id, message]));
  const serverIds = new Set(serverMessages.map((message) => message.id));
  const mergedMessages = [
    ...serverMessages.map((message) => {
      const cachedMessage = cachedById.get(message.id);
      return cachedMessage?.deliveryStatus ? { ...message, deliveryStatus: cachedMessage.deliveryStatus } : message;
    }),
    ...cachedMessages.filter((message) => message.deliveryStatus && !serverIds.has(message.id)),
  ];

  return mergedMessages.sort(sortFriendMessages);
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
const REALTIME_FILTER_CHUNK_SIZE = 100;

function getRealtimeFilterChunks(ids: string[]) {
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += REALTIME_FILTER_CHUNK_SIZE) {
    chunks.push(ids.slice(index, index + REALTIME_FILTER_CHUNK_SIZE));
  }
  return chunks;
}

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

function formatProfileDate(value: string | null) {
  if (!value) {
    return 'Unknown';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

function DiscordMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        fill="currentColor"
        d="M19.5 5.2A16.3 16.3 0 0 0 15.5 4l-.2.4c1.4.4 2.1 1 2.1 1s-1.8-1-5.4-1-5.4 1-5.4 1 .8-.6 2.1-1L8.5 4a16.3 16.3 0 0 0-4 1.2C2 8.9 1.5 12.5 1.8 16.1A16 16 0 0 0 6.7 18.6l.9-1.5c-.5-.2-1-.5-1.5-.8l.4-.3c2.9 1.3 6.1 1.3 9 0l.4.3c-.5.3-1 .6-1.5.8l.9 1.5a16 16 0 0 0 4.9-2.5c.4-4.2-.6-7.8-2.7-10.9ZM8.7 14.1c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Zm6.6 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Z"
      />
    </svg>
  );
}

function RiotMark({ className = '' }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`inline-flex items-center justify-center rounded-md border border-[#d13639]/40 bg-[#d13639]/15 px-1.5 py-0.5 text-[0.6rem] font-black uppercase tracking-[0.12em] text-[#f87171] ${className}`}>
      Riot
    </span>
  );
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

async function broadcastFriendMessageNotification(friendId: string) {
  const supabase = getOptionalSupabaseClient();
  if (!supabase) return;

  const channel = supabase.channel(`friend-social:${friendId}`);
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      void supabase.removeChannel(channel);
      resolve();
    };
    const timeout = window.setTimeout(finish, 3_000);
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.send({ type: 'broadcast', event: 'new_message', payload: {} });
        finish();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        finish();
      }
    });
  });
}

export function FriendsWidget({ onPendingRequestCountChange, variant = 'floating' }: FriendsWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [dashboard, setDashboard] = useState<FriendDashboard | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [presenceByUserId, setPresenceByUserId] = useState<Map<string, { online: boolean; away: boolean }>>(new Map());
  const [activeFriend, setActiveFriend] = useState<FriendSummary | null>(null);
  const [messages, setMessages] = useState<FriendMessage[]>([]);
  const [messageProfiles, setMessageProfiles] = useState<Record<string, MessageProfile>>({});
  const [firstUnreadMessageId, setFirstUnreadMessageId] = useState<string | null>(null);
  const [messageDraft, setMessageDraft] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [addFriendOpen, setAddFriendOpen] = useState(false);
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [addFriendSearchQuery, setAddFriendSearchQuery] = useState('');
  const [addFriendSearchResults, setAddFriendSearchResults] = useState<FriendSearchCandidate[]>([]);
  const [addFriendSearchLoading, setAddFriendSearchLoading] = useState(false);
  const [incomingRequestActionId, setIncomingRequestActionId] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [contextFriend, setContextFriend] = useState<{ friend: FriendSummary; x: number; y: number } | null>(null);
  const [friendNoteDraft, setFriendNoteDraft] = useState('');
  const [friendNoteEditing, setFriendNoteEditing] = useState(false);
  const [confirmUnfriendFriendId, setConfirmUnfriendFriendId] = useState<string | null>(null);
  const [snapshotExpanded, setSnapshotExpanded] = useState(false);
  const [snapshotAboutExpanded, setSnapshotAboutExpanded] = useState(false);
  const [snapshotActionsOpen, setSnapshotActionsOpen] = useState(false);
  const [snapshotNoteOpen, setSnapshotNoteOpen] = useState(false);
  const [snapshotConfirmAction, setSnapshotConfirmAction] = useState<'remove' | 'block' | null>(null);
  const [snapshotActionsPosition, setSnapshotActionsPosition] = useState({ top: 12, left: 12 });
  const [liveGameStatus, setLiveGameStatus] = useState<LiveGameStatusView | null>(null);
  const [liveGameNow, setLiveGameNow] = useState(() => Date.now());
  const [favoriteLoadingFriendId, setFavoriteLoadingFriendId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const messageInputRef = useRef<HTMLInputElement | null>(null);
  const isOpenRef = useRef(false);
  const dashboardRef = useRef<FriendDashboard | null>(null);
  const activeFriendRef = useRef<FriendSummary | null>(null);
  const messageCacheRef = useRef<Map<string, FriendMessage[]>>(new Map());
  const messageProfileCacheRef = useRef<Map<string, Record<string, MessageProfile>>>(new Map());
  const firstUnreadMessageCacheRef = useRef<Map<string, string | null>>(new Map());
  const messageCacheDirtyFriendIdsRef = useRef<Set<string>>(new Set());
  const markReadTimeoutRef = useRef<number | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const refreshTimeoutRef = useRef<number | null>(null);
  const dashboardRefreshPromiseRef = useRef<Promise<void> | null>(null);
  const lastDashboardRefreshAtRef = useRef(0);
  const presenceOwnerIdRef = useRef<string | null>(null);
  const lastActivityAtRef = useRef(Date.now());
  const ownPresenceAwayRef = useRef(false);
  const knownIncomingRequestIdsRef = useRef<Set<string>>(new Set());
  const knownMessageIdsRef = useRef<Set<string>>(new Set());
  const friendRealtimeSubscriptionKey = useMemo(() => (dashboard?.friends ?? [])
    .map((friend) => `${friend.id}:${friend.friendshipId}`)
    .sort()
    .join('|'), [dashboard?.friends]);
  const friendRealtimeSubscriptions = useMemo(() => {
    const friendIds = new Set<string>();
    const friendshipIds = new Set<string>();

    if (friendRealtimeSubscriptionKey) {
      friendRealtimeSubscriptionKey.split('|').forEach((entry) => {
        const [friendId, friendshipId] = entry.split(':');
        if (friendId) friendIds.add(friendId);
        if (friendshipId) friendshipIds.add(friendshipId);
      });
    }

    return {
      friendIds: [...friendIds],
      friendshipIds: [...friendshipIds],
    };
  }, [friendRealtimeSubscriptionKey]);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    const toggleFromHeader = () => setIsOpen((value) => !value);
    window.addEventListener('knowleague:toggle-friends', toggleFromHeader);
    return () => window.removeEventListener('knowleague:toggle-friends', toggleFromHeader);
  }, []);

  useEffect(() => () => {
    if (markReadTimeoutRef.current) {
      window.clearTimeout(markReadTimeoutRef.current);
    }
  }, []);

  const updateMessageScrollIntent = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) {
      shouldStickToBottomRef.current = true;
      return;
    }

    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    shouldStickToBottomRef.current = distanceFromBottom < 48;
  }, []);

  const scrollMessagesToBottom = useCallback(() => {
    window.requestAnimationFrame(() => {
      const container = messagesContainerRef.current;
      if (!container) return;
      container.scrollTop = container.scrollHeight;
      window.requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
      });
    });
    window.setTimeout(() => {
      const container = messagesContainerRef.current;
      if (!container) return;
      container.scrollTop = container.scrollHeight;
    }, 80);
  }, []);

  const scrollMessagesToNewIndicator = useCallback(() => {
    const scrollToMarker = () => {
      const container = messagesContainerRef.current;
      const marker = container?.querySelector<HTMLElement>('[data-new-message-indicator="true"]');
      if (!container || !marker) {
        return false;
      }

      container.scrollTop = Math.max(marker.offsetTop - container.offsetTop - 8, 0);
      return true;
    };

    window.requestAnimationFrame(() => {
      if (scrollToMarker()) return;
      window.requestAnimationFrame(() => {
        if (!scrollToMarker()) {
          scrollMessagesToBottom();
        }
      });
    });

    window.setTimeout(() => {
      if (!scrollToMarker()) {
        scrollMessagesToBottom();
      }
    }, 80);
  }, [scrollMessagesToBottom]);

  const refreshDashboard = useCallback(async (force = false) => {
    if (dashboardRefreshPromiseRef.current) {
      return dashboardRefreshPromiseRef.current;
    }

    if (!force && dashboardRef.current && Date.now() - lastDashboardRefreshAtRef.current < 10_000) {
      return;
    }

    const refreshPromise = (async () => {
      try {
        const data = await fetchAuthedJson('/api/friends') as FriendDashboard;
        const previousRequestIds = knownIncomingRequestIdsRef.current;
        const nextRequestIds = new Set(data.incomingRequests.map((request) => request.id));
        const hasNewIncomingRequest = data.incomingRequests.some((request) => !previousRequestIds.has(request.id));
        if (previousRequestIds.size > 0 && hasNewIncomingRequest) {
          playUiSound('friend-request-incoming');
        }
        knownIncomingRequestIdsRef.current = nextRequestIds;
        setDashboard(data);
        dashboardRef.current = data;
        lastDashboardRefreshAtRef.current = Date.now();
        onPendingRequestCountChange?.(data.pendingRequestCount);
      } catch {
        setDashboard(null);
        dashboardRef.current = null;
        onPendingRequestCountChange?.(0);
      } finally {
        dashboardRefreshPromiseRef.current = null;
      }
    })();

    dashboardRefreshPromiseRef.current = refreshPromise;
    return refreshPromise;
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

  useEffect(() => {
    const openFriendMessages = (event: Event) => {
      const detail = (event as CustomEvent<{ friendId?: string; expandProfile?: boolean }>).detail;
      const friendId = detail?.friendId;
      if (!friendId) {
        return;
      }

      const activateFriend = (friend: FriendSummary) => {
        shouldStickToBottomRef.current = true;
        setIsOpen(true);
        setAddFriendOpen(false);
        setAddFriendSearchQuery('');
        setAddFriendSearchResults([]);
        setContextFriend(null);
        setSnapshotExpanded(detail?.expandProfile ?? false);
        setSnapshotAboutExpanded(false);
        setFriendNoteEditing(false);
        setActiveFriend(friend);
      };

      const currentFriend = dashboardRef.current?.friends.find((friend) => friend.id === friendId);
      if (currentFriend) {
        activateFriend(currentFriend);
        return;
      }

      void refreshDashboard().then(() => {
        const refreshedFriend = dashboardRef.current?.friends.find((friend) => friend.id === friendId);
        if (refreshedFriend) {
          activateFriend(refreshedFriend);
        } else {
          setStatus('This friend is no longer available.');
        }
      });
    };

    window.addEventListener(OPEN_FRIEND_MESSAGES_EVENT, openFriendMessages);
    return () => window.removeEventListener(OPEN_FRIEND_MESSAGES_EVENT, openFriendMessages);
  }, [refreshDashboard]);

  const scheduleMessageRead = useCallback((friendId: string) => {
    if (markReadTimeoutRef.current) {
      window.clearTimeout(markReadTimeoutRef.current);
    }
    markReadTimeoutRef.current = window.setTimeout(() => {
      markReadTimeoutRef.current = null;
      void fetchAuthedJson('/api/friends/messages/read', {
        method: 'POST',
        body: JSON.stringify({ friendId }),
      }).then(scheduleDashboardRefresh).catch(() => undefined);
    }, 400);
  }, [scheduleDashboardRefresh]);

  const loadFriendMessages = useCallback(async (
    friend: FriendSummary,
    options: { markRead?: boolean; syncActive?: boolean; preferUnreadScroll?: boolean } = {},
  ) => {
    const markRead = options.markRead ?? true;
    const syncActive = options.syncActive ?? true;
    const preferUnreadScroll = options.preferUnreadScroll ?? false;

    try {
      const data = await fetchAuthedJson(`/api/friends/messages?friendId=${friend.id}${markRead ? '' : '&markRead=false'}`);
      const serverMessages = (data.messages ?? []) as FriendMessage[];
      const cachedMessages = messageCacheRef.current.get(friend.id) ?? [];
      const nextMessages = mergeFriendMessages(serverMessages, cachedMessages);
      const nextProfiles = data.profiles ?? {};
      const nextFirstUnreadMessageId = data.firstUnreadMessageId ?? null;
      nextMessages.forEach((message: FriendMessage) => knownMessageIdsRef.current.add(message.id));
      messageCacheRef.current.set(friend.id, nextMessages);
      messageProfileCacheRef.current.set(friend.id, nextProfiles);
      messageCacheDirtyFriendIdsRef.current.delete(friend.id);
      firstUnreadMessageCacheRef.current.set(friend.id, markRead ? null : nextFirstUnreadMessageId);
      if (syncActive && activeFriendRef.current?.id === friend.id) {
        setMessages(nextMessages);
        setMessageProfiles(nextProfiles);
        setFirstUnreadMessageId(markRead ? null : nextFirstUnreadMessageId);
        if (preferUnreadScroll && nextFirstUnreadMessageId) {
          scrollMessagesToNewIndicator();
        } else if (shouldStickToBottomRef.current) {
          scrollMessagesToBottom();
        }
      }
      if (markRead) {
        scheduleDashboardRefresh();
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to load messages.');
    }
  }, [scheduleDashboardRefresh, scrollMessagesToBottom, scrollMessagesToNewIndicator]);

  const appendFriendMessage = useCallback((friend: FriendSummary, nextMessage: FriendMessage, markAsRead: boolean) => {
    const cachedMessages = messageCacheRef.current.get(friend.id);
    if (!cachedMessages) {
      messageCacheDirtyFriendIdsRef.current.add(friend.id);
      return;
    }

    const pendingMessageIndex = cachedMessages.findIndex((message) => (
      message.deliveryStatus === 'pending' &&
      message.sender_id === nextMessage.sender_id &&
      message.message === nextMessage.message
    ));
    const nextMessages = pendingMessageIndex >= 0
      ? cachedMessages.map((message, index) => (
          index === pendingMessageIndex ? { ...nextMessage, deliveryStatus: 'sent' as const } : message
        ))
      : cachedMessages.some((message) => message.id === nextMessage.id)
        ? cachedMessages
        : [...cachedMessages, nextMessage].sort(sortFriendMessages);
    messageCacheRef.current.set(friend.id, nextMessages);

    const profileSource = nextMessage.sender_id === currentUserId
      ? dashboardRef.current?.currentUser
      : friend;
    if (profileSource) {
      const nextProfiles = {
        ...(messageProfileCacheRef.current.get(friend.id) ?? {}),
        [nextMessage.sender_id]: {
          chatColor: profileSource.chatColor,
          chatBorder: profileSource.chatBorder,
          avatarUrl: profileSource.avatarUrl,
        },
      };
      messageProfileCacheRef.current.set(friend.id, nextProfiles);
      if (activeFriendRef.current?.id === friend.id) {
        setMessageProfiles(nextProfiles);
      }
    }

    if (activeFriendRef.current?.id === friend.id) {
      setMessages(nextMessages);
      if (markAsRead) {
        firstUnreadMessageCacheRef.current.set(friend.id, null);
        setFirstUnreadMessageId(null);
      } else if (!firstUnreadMessageCacheRef.current.get(friend.id)) {
        firstUnreadMessageCacheRef.current.set(friend.id, nextMessage.id);
        setFirstUnreadMessageId(nextMessage.id);
      }
      if (shouldStickToBottomRef.current) {
        scrollMessagesToBottom();
      }
    }
  }, [currentUserId, scrollMessagesToBottom]);

  useEffect(() => {
    activeFriendRef.current = activeFriend;
  }, [activeFriend]);

  const activeFriendId = activeFriend?.id;

  useEffect(() => {
    if (!activeFriendId) {
      return undefined;
    }

    const focusFrame = window.requestAnimationFrame(() => {
      messageInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(focusFrame);
  }, [activeFriendId]);

  useEffect(() => {
    if (!dashboardRef.current || Date.now() - lastDashboardRefreshAtRef.current > 10_000) {
      void refreshDashboard();
    }
    const supabase = getOptionalSupabaseClient();
    if (!supabase) {
      return undefined;
    }
    let socialChannel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;
    let disposed = false;

    const subscribeToFriendUpdates = async () => {
      const { data } = await supabase.auth.getSession();
      if (disposed) {
        return;
      }

      const userId = data.session?.user.id ?? null;
      setCurrentUserId(userId);
      if (!userId) {
        setPresenceByUserId(new Map());
        return;
      }

      const nextSocialChannel = supabase.channel(`friend-social:${userId}`);
      socialChannel = nextSocialChannel;
      nextSocialChannel
        .on('broadcast', { event: 'new_message' }, () => {
          scheduleDashboardRefresh();
        })
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'friend_requests',
          filter: `addressee_id=eq.${userId}`,
        }, (payload) => {
          const row = { ...(payload.old as Record<string, unknown>), ...(payload.new as Record<string, unknown>) };
          const requestId = typeof row.id === 'string' ? row.id : null;
          const alreadyKnown = requestId ? knownIncomingRequestIdsRef.current.has(requestId) : false;
          if (requestId) {
            knownIncomingRequestIdsRef.current.add(requestId);
          }
          if (!alreadyKnown) {
            playUiSound('friend-request-incoming');
          }
          scheduleDashboardRefresh();
        })
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'friend_requests',
          filter: `addressee_id=eq.${userId}`,
        }, () => {
          scheduleDashboardRefresh();
        });

      (['user_one_id', 'user_two_id'] as const).forEach((column) => {
        (['INSERT', 'UPDATE'] as const).forEach((event) => {
          nextSocialChannel.on('postgres_changes', {
            event,
            schema: 'public',
            table: 'friendships',
            filter: `${column}=eq.${userId}`,
          }, () => {
            scheduleDashboardRefresh();
          });
        });
      });

      getRealtimeFilterChunks(friendRealtimeSubscriptions.friendIds).forEach((friendIds) => {
        nextSocialChannel.on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=in.(${friendIds.join(',')})`,
        }, () => {
          scheduleDashboardRefresh();
        });
      });

      getRealtimeFilterChunks(friendRealtimeSubscriptions.friendshipIds).forEach((friendshipIdChunk) => {
        nextSocialChannel.on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'friend_messages',
          filter: `friendship_id=in.(${friendshipIdChunk.join(',')})`,
        }, (payload) => {
          const row = payload.new as Partial<FriendMessage> & { friendship_id?: string };
          const friendshipId = row.friendship_id;
          const messageId = row.id;
          const isIncomingMessage = Boolean(row.sender_id && row.sender_id !== userId);
          const alreadyKnown = Boolean(messageId && knownMessageIdsRef.current.has(messageId));
          if (messageId) {
            knownMessageIdsRef.current.add(messageId);
            if (isIncomingMessage && !alreadyKnown) {
              playUiSound('message-incoming');
            }
          }
          // This tab appends its own POST response; retain unknown outgoing events for cross-tab sync.
          if (!isIncomingMessage && alreadyKnown) return;

          const cachedFriend = dashboardRef.current?.friends.find((friend) => friend.friendshipId === friendshipId);
          if (cachedFriend && messageId && typeof row.sender_id === 'string' && typeof row.message === 'string' && typeof row.created_at === 'string') {
            const active = activeFriendRef.current;
            const markAsRead = Boolean(isIncomingMessage && isOpenRef.current && active?.id === cachedFriend.id);
            appendFriendMessage(cachedFriend, {
              id: messageId,
              sender_id: row.sender_id,
              message: row.message,
              created_at: row.created_at,
              chat_color: normalizeChatColor(row.chat_color),
              chat_border: normalizeChatBorder(row.chat_border),
            }, markAsRead);
            if (markAsRead) {
              scheduleMessageRead(cachedFriend.id);
            }
          }

          const friendshipIds = new Set(dashboardRef.current?.friends.map((friend) => friend.friendshipId) ?? []);
          if (friendshipId && friendshipIds.has(friendshipId)) {
            scheduleDashboardRefresh();
          } else if (isIncomingMessage) {
            scheduleDashboardRefresh();
          }
        });
      });

      subscribeToRealtimeChannel(nextSocialChannel, refreshDashboard);
    };

    void subscribeToFriendUpdates();

    return () => {
      disposed = true;
      if (refreshTimeoutRef.current) {
        window.clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }

      if (socialChannel) {
        void supabase.removeChannel(socialChannel);
      }
    };
  }, [appendFriendMessage, friendRealtimeSubscriptions, refreshDashboard, scheduleDashboardRefresh, scheduleMessageRead]);

  useEffect(() => {
    const supabase = getOptionalSupabaseClient();
    if (!supabase || !currentUserId) {
      setPresenceByUserId(new Map());
      presenceOwnerIdRef.current = null;
      return undefined;
    }

    if (presenceOwnerIdRef.current !== currentUserId) {
      presenceOwnerIdRef.current = currentUserId;
      lastActivityAtRef.current = Date.now();
      ownPresenceAwayRef.current = false;
    }

    const ownPresenceChannel = supabase.channel(`knowleague-user-presence:${currentUserId}`, {
      config: { presence: { key: currentUserId } },
    });
    const friendPresenceChannels = friendRealtimeSubscriptions.friendIds.map((friendId) => ({
      friendId,
      channel: supabase.channel(`knowleague-user-presence:${friendId}`),
    }));

    const syncFriendPresence = () => {
      const nextPresenceByUserId = new Map<string, { online: boolean; away: boolean }>();
      friendPresenceChannels.forEach(({ friendId, channel }) => {
        const state = channel.presenceState<{ userId?: string; away?: boolean }>();
        const presence = Object.values(state).flat().find((entry) => entry.userId === friendId);
        if (presence) {
          nextPresenceByUserId.set(friendId, { online: !presence.away, away: Boolean(presence.away) });
        }
      });
      setPresenceByUserId(nextPresenceByUserId);
    };

    const publishOwnPresence = (away: boolean) => {
      window.dispatchEvent(new CustomEvent('knowleague:own-presence', {
        detail: { userId: currentUserId, away },
      }));
    };
    const awayAfterMs = 5 * 60 * 1000;
    const trackOwnPresence = (away: boolean) => {
      if (ownPresenceAwayRef.current === away) return;
      ownPresenceAwayRef.current = away;
      publishOwnPresence(away);
      void ownPresenceChannel.track({ userId: currentUserId, away });
    };
    const markActivity = () => {
      lastActivityAtRef.current = Date.now();
      trackOwnPresence(false);
    };
    const activityEvents = ['pointermove', 'keydown', 'mousedown', 'touchstart', 'scroll'] as const;
    activityEvents.forEach((eventName) => document.addEventListener(eventName, markActivity));
    const awayTimer = window.setInterval(() => {
      if (Date.now() - lastActivityAtRef.current >= awayAfterMs) trackOwnPresence(true);
    }, 15_000);

    ownPresenceChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        publishOwnPresence(ownPresenceAwayRef.current);
        void ownPresenceChannel.track({ userId: currentUserId, away: ownPresenceAwayRef.current });
      }
    });
    friendPresenceChannels.forEach(({ channel }) => {
      channel
        .on('presence', { event: 'sync' }, syncFriendPresence);
      subscribeToRealtimeChannel(channel, syncFriendPresence);
    });

    return () => {
      window.clearInterval(awayTimer);
      activityEvents.forEach((eventName) => document.removeEventListener(eventName, markActivity));
      void ownPresenceChannel.untrack();
      void supabase.removeChannel(ownPresenceChannel);
      friendPresenceChannels.forEach(({ channel }) => {
        void supabase.removeChannel(channel);
      });
    };
  }, [currentUserId, friendRealtimeSubscriptions]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    if (!dashboardRef.current || Date.now() - lastDashboardRefreshAtRef.current > 10_000) {
      void refreshDashboard();
    }
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('[data-friends-trigger="true"]')) {
        return;
      }
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setActiveFriend(null);
        setSnapshotExpanded(false);
        setSnapshotAboutExpanded(false);
        setContextFriend(null);
        setAddFriendOpen(false);
        setAddFriendSearchQuery('');
        setAddFriendSearchResults([]);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isOpen, refreshDashboard]);

  useEffect(() => {
    setSnapshotAboutExpanded(false);
    setSnapshotActionsOpen(false);
    setSnapshotNoteOpen(false);
    setSnapshotConfirmAction(null);
  }, [activeFriend?.id]);

  useEffect(() => {
    if (!status) {
      return undefined;
    }

    const timeout = window.setTimeout(() => setStatus(''), 10_000);
    return () => window.clearTimeout(timeout);
  }, [status]);

  useEffect(() => {
    if (!contextFriend) {
      return undefined;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (contextMenuRef.current?.contains(event.target as Node)) {
        return;
      }
      setContextFriend(null);
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [contextFriend]);

  useEffect(() => {
    if (!snapshotActionsOpen) return undefined;
    const closeSnapshotActions = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-snapshot-actions="true"]')) return;
      setSnapshotActionsOpen(false);
      setSnapshotNoteOpen(false);
      setSnapshotConfirmAction(null);
    };
    document.addEventListener('pointerdown', closeSnapshotActions);
    return () => document.removeEventListener('pointerdown', closeSnapshotActions);
  }, [snapshotActionsOpen]);

  useEffect(() => {
    if (!activeFriend) {
      setMessages([]);
      setMessageProfiles({});
      setFirstUnreadMessageId(null);
      return;
    }

    const cachedMessages = messageCacheRef.current.get(activeFriend.id);
    const cachedProfiles = messageProfileCacheRef.current.get(activeFriend.id);
    const cachedFirstUnreadMessageId = firstUnreadMessageCacheRef.current.get(activeFriend.id) ?? null;
    shouldStickToBottomRef.current = true;
    if (!cachedMessages) {
      messageCacheRef.current.set(activeFriend.id, []);
    }
    setMessages(cachedMessages ?? []);
    setMessageProfiles(cachedProfiles ?? {});
    setFirstUnreadMessageId(cachedFirstUnreadMessageId);
    if (cachedFirstUnreadMessageId) {
      scrollMessagesToNewIndicator();
    } else {
      scrollMessagesToBottom();
    }
    if (!cachedMessages || messageCacheDirtyFriendIdsRef.current.has(activeFriend.id)) {
      void loadFriendMessages(activeFriend, { preferUnreadScroll: true });
    } else {
      scheduleMessageRead(activeFriend.id);
    }
  }, [activeFriend, loadFriendMessages, scheduleMessageRead, scrollMessagesToBottom, scrollMessagesToNewIndicator]);

  useLayoutEffect(() => {
    if (!activeFriend || !shouldStickToBottomRef.current || firstUnreadMessageId) {
      return;
    }

    const container = messagesContainerRef.current;
    if (!container) {
      return;
    }

    container.scrollTop = container.scrollHeight;
    scrollMessagesToBottom();
  }, [activeFriend, firstUnreadMessageId, messages, scrollMessagesToBottom]);

  useEffect(() => {
    const refreshFriendsFromExternalAction = () => {
      void refreshDashboard(true);
    };

    window.addEventListener('knowleague:friends-refresh', refreshFriendsFromExternalAction);
    return () => window.removeEventListener('knowleague:friends-refresh', refreshFriendsFromExternalAction);
  }, [refreshDashboard]);

  useEffect(() => {
    if (!addFriendOpen || addFriendSearchQuery.trim().length < 3) {
      setAddFriendSearchResults([]);
      setAddFriendSearchLoading(false);
      return undefined;
    }

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      setAddFriendSearchLoading(true);
      void fetchAuthedJson(`/api/friends/search?q=${encodeURIComponent(addFriendSearchQuery.trim())}`)
        .then((data) => {
          if (!cancelled) setAddFriendSearchResults((data.results ?? []) as FriendSearchCandidate[]);
        })
        .catch((error) => {
          if (!cancelled) setStatus(error instanceof Error ? error.message : 'Unable to search users.');
        })
        .finally(() => {
          if (!cancelled) setAddFriendSearchLoading(false);
        });
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [addFriendOpen, addFriendSearchQuery]);

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanMessage = (messageInputRef.current?.value ?? messageDraft).trim();
    if (!activeFriend || !cleanMessage || isSendingMessage) {
      return;
    }

    const targetFriendId = activeFriend.id;
    const currentUser = dashboardRef.current?.currentUser ?? dashboard?.currentUser;
    const senderId = currentUserId ?? currentUser?.id;
    if (!senderId) {
      setStatus('Unable to identify your account. Please try again.');
      return;
    }

    const optimisticMessage: FriendMessage = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      sender_id: senderId,
      message: cleanMessage,
      created_at: new Date().toISOString(),
      chat_color: normalizeChatColor(currentUser?.chatColor),
      chat_border: normalizeChatBorder(currentUser?.chatBorder),
      deliveryStatus: 'pending',
    };
    const cachedMessages = messageCacheRef.current.get(targetFriendId) ?? messages;
    const nextOptimisticMessages = [...cachedMessages, optimisticMessage].sort(sortFriendMessages);
    messageCacheRef.current.set(targetFriendId, nextOptimisticMessages);
    if (activeFriendRef.current?.id === targetFriendId) {
      setMessages(nextOptimisticMessages);
      scrollMessagesToBottom();
    }
    setMessageDraft('');
    setIsSendingMessage(true);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const data = await fetchAuthedJson('/api/friends/messages', {
        method: 'POST',
        body: JSON.stringify({ friendId: targetFriendId, message: cleanMessage }),
        signal: controller.signal,
      });
      const sentMessage = { ...(data.message as FriendMessage), deliveryStatus: 'sent' as const };
      knownMessageIdsRef.current.add(sentMessage.id);
      playUiSound('message-sent');
      const cachedMessagesAfterSend = messageCacheRef.current.get(targetFriendId) ?? [];
      const nextMessages = [
        ...cachedMessagesAfterSend.filter((message) => message.id !== optimisticMessage.id && message.id !== sentMessage.id),
        sentMessage,
      ].sort(sortFriendMessages);
      messageCacheRef.current.set(targetFriendId, nextMessages);
      if (activeFriendRef.current?.id === targetFriendId) {
        setMessages(nextMessages);
        scrollMessagesToBottom();
      }
      void broadcastFriendMessageNotification(targetFriendId);
    } catch (error) {
      const cachedMessagesAfterFailure = messageCacheRef.current.get(targetFriendId) ?? [];
      const nextMessages = cachedMessagesAfterFailure.map((message) => (
        message.id === optimisticMessage.id ? { ...message, deliveryStatus: 'failed' as const } : message
      ));
      messageCacheRef.current.set(targetFriendId, nextMessages);
      if (activeFriendRef.current?.id === targetFriendId) {
        setMessages(nextMessages);
      }
      setStatus(error instanceof DOMException && error.name === 'AbortError'
        ? 'Message send timed out. Please try again.'
        : error instanceof Error ? error.message : 'Unable to send message.');
    } finally {
      window.clearTimeout(timeoutId);
      setIsSendingMessage(false);
    }
  };

  const updateAddFriendCandidate = (candidateId: string, relationship: FriendSearchCandidate['relationship']) => {
    setAddFriendSearchResults((results) => results.map((candidate) => (
      candidate.id === candidateId ? { ...candidate, relationship } : candidate
    )));
  };

  const sendFriendCandidateRequest = async (candidate: FriendSearchCandidate) => {
    try {
      const data = await fetchAuthedJson('/api/friends/requests', {
        method: 'POST',
        body: JSON.stringify({ targetUserId: candidate.id }),
      });
      playUiSound('friend-request-sent');
      setStatus(data.status === 'accepted' ? 'Friend added.' : 'Friend request sent.');
      updateAddFriendCandidate(candidate.id, data.status === 'accepted' ? 'friend' : 'outgoing');
      scheduleDashboardRefresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to send friend request.');
    }
  };

  const respondToIncomingRequest = async (request: IncomingRequest, action: 'accept' | 'decline') => {
    if (incomingRequestActionId) {
      return;
    }

    setIncomingRequestActionId(request.id);
    try {
      await fetchAuthedJson(`/api/friends/requests/${request.id}`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      setStatus(action === 'accept' ? 'Friend request accepted.' : 'Friend request declined.');
      await refreshDashboard(true);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to respond to friend request.');
    } finally {
      setIncomingRequestActionId(null);
    }
  };

  const blockIncomingRequest = async (request: IncomingRequest) => {
    if (incomingRequestActionId) {
      return;
    }

    setIncomingRequestActionId(request.id);
    try {
      await fetchAuthedJson(`/api/users/${request.requester.id}/block`, { method: 'POST' });
      setStatus('User blocked.');
      await refreshDashboard(true);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to block user.');
    } finally {
      setIncomingRequestActionId(null);
    }
  };

  const removeFriendCandidate = async (candidate: FriendSearchCandidate) => {
    if (!window.confirm(`Remove ${candidate.displayName} from your friends?`)) return;
    try {
      await fetchAuthedJson(`/api/friends/${candidate.id}`, { method: 'DELETE' });
      updateAddFriendCandidate(candidate.id, 'none');
      setStatus('Friend removed.');
      scheduleDashboardRefresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to remove friend.');
    }
  };

  const allFriends = useMemo(() => (dashboard?.friends ?? [])
    .map((friend) => {
      const presence = presenceByUserId.get(friend.id);
      return { ...friend, online: presence?.online ?? friend.online, away: presence?.away ?? false };
    })
    .sort((left, right) => Number(right.favorite) - Number(left.favorite) || Number(right.online) - Number(left.online) || Number(right.away) - Number(left.away) || left.displayName.localeCompare(right.displayName)), [dashboard?.friends, presenceByUserId]);
  const onlineCount = useMemo(() => allFriends.filter((friend) => friend.online).length, [allFriends]);
  const awayCount = useMemo(() => allFriends.filter((friend) => friend.away).length, [allFriends]);
  const totalFriendCount = allFriends.length;
  const cleanSearchQuery = searchQuery.trim().toLowerCase();
  const friends = useMemo(() => cleanSearchQuery
    ? allFriends.filter((friend) => (
        friend.displayName.toLowerCase().includes(cleanSearchQuery) ||
        friend.username.toLowerCase().includes(cleanSearchQuery)
      ))
    : allFriends, [allFriends, cleanSearchQuery]);
  const activeFriendView = useMemo(() => activeFriend
    ? { ...(allFriends.find((friend) => friend.id === activeFriend.id) ?? activeFriend), ...(presenceByUserId.get(activeFriend.id) ?? { online: false, away: false }) }
    : null, [activeFriend, allFriends, presenceByUserId]);
  const snapshotAboutIsLong = Boolean(activeFriendView?.aboutMe && activeFriendView.aboutMe.length > 140);
  const activeFriendLiveGameNote = getLiveGameNote(liveGameStatus, liveGameNow);
  const activeFriendAvatarUrl = activeFriendView?.avatarUrl || null;
  const viewerUserId = currentUserId ?? dashboard?.currentUser?.id ?? null;
  const activeSnapshotFriendId = activeFriendView?.id;
  const activeFriendNote = activeFriendView?.friendNote;
  useEffect(() => {
    if (activeFriendNote !== undefined) setFriendNoteDraft(activeFriendNote);
  }, [activeSnapshotFriendId, activeFriendNote]);
  const unreadTotal = useMemo(() => dashboard?.friends.reduce(
    (total, friend) => total + (friend.id === activeFriend?.id ? 0 : friend.unreadCount),
    0,
  ) ?? 0, [activeFriend?.id, dashboard?.friends]);

  useEffect(() => {
    const riotAccount = activeFriendView?.riotAccountName?.trim();
    if (!riotAccount) {
      setLiveGameStatus(null);
      return;
    }

    let cancelled = false;
    setLiveGameStatus(null);
    const requestUrl = new URL('/api/riot-account/live-game', window.location.origin);
    requestUrl.searchParams.set('riotId', riotAccount);

    fetch(requestUrl)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error ?? 'Unable to load live game status.');
        }
        return data as LiveGameStatusView;
      })
      .then((data) => {
        if (!cancelled) {
          setLiveGameStatus(data);
          setLiveGameNow(Date.now());
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLiveGameStatus(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeFriendView?.riotAccountName]);

  useEffect(() => {
    if (!liveGameStatus?.inGame) {
      return;
    }

    const interval = window.setInterval(() => setLiveGameNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [liveGameStatus?.inGame]);

  useEffect(() => {
    if (!activeFriend || allFriends.some((friend) => friend.id === activeFriend.id)) {
      return;
    }

      setActiveFriend(null);
      setSnapshotExpanded(false);
      setSnapshotAboutExpanded(false);
      setMessages([]);
      setFirstUnreadMessageId(null);
  }, [activeFriend, allFriends]);

  const unfriend = async (friend: FriendSummary) => {
    await fetchAuthedJson(`/api/friends/${friend.id}`, { method: 'DELETE' });
    if (activeFriend?.id === friend.id) {
      setActiveFriend(null);
    }
    setContextFriend(null);
    setConfirmUnfriendFriendId(null);
    await refreshDashboard(true);
  };

  const blockFriend = async (friend: FriendSummary) => {
    try {
      await fetchAuthedJson(`/api/users/${friend.id}/block`, { method: 'POST' });
      if (activeFriend?.id === friend.id) setActiveFriend(null);
      setSnapshotActionsOpen(false);
      setSnapshotConfirmAction(null);
      setContextFriend(null);
      setStatus('User blocked.');
      await refreshDashboard(true);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to block user.');
    }
  };

  const inviteFriendToGame = async (friend: FriendSummary) => {
    const invite = getCurrentMultiplayerInvite();
    if (!invite) {
      setStatus('No active multiplayer game invite is available.');
      return;
    }

    try {
      const data = await fetchAuthedJson('/api/friends/messages', {
        method: 'POST',
        body: JSON.stringify({
          friendId: friend.id,
          message: `Join my ${invite.gameName} game: ${invite.url}`,
        }),
      });
      const sentMessage = data.message as FriendMessage;
      knownMessageIdsRef.current.add(sentMessage.id);
      appendFriendMessage(friend, sentMessage, true);
      await broadcastFriendMessageNotification(friend.id);
      playUiSound('message-sent');
      setContextFriend(null);
      setStatus('Game invite sent.');
      scheduleDashboardRefresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to send game invite.');
    }
  };

  const updateFriendPreferenceLocally = (friendId: string, updates: Partial<Pick<FriendSummary, 'friendNote' | 'favorite'>>) => {
    setDashboard((current) => {
      if (!current) return current;
      const nextDashboard = {
        ...current,
        friends: current.friends.map((friend) => (
          friend.id === friendId ? { ...friend, ...updates } : friend
        )),
      };
      dashboardRef.current = nextDashboard;
      return nextDashboard;
    });
    setActiveFriend((current) => (current?.id === friendId ? { ...current, ...updates } : current));
    setContextFriend((current) => (current?.friend.id === friendId ? { ...current, friend: { ...current.friend, ...updates } } : current));
  };

  const saveFriendNote = async (friend: FriendSummary) => {
    const note = friendNoteDraft.trim().slice(0, 30);
    try {
      await fetchAuthedJson(`/api/friends/${friend.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ note }),
      });
      updateFriendPreferenceLocally(friend.id, { friendNote: note });
      setFriendNoteEditing(false);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to save friend note.');
    }
  };

  const toggleFavoriteFriend = async (friend: FriendSummary) => {
    if (favoriteLoadingFriendId) {
      return;
    }

    const favorite = !friend.favorite;
    setFavoriteLoadingFriendId(friend.id);
    try {
      await fetchAuthedJson(`/api/friends/${friend.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ favorite }),
      });
      updateFriendPreferenceLocally(friend.id, { favorite });
      setConfirmUnfriendFriendId(null);
      setStatus(favorite ? 'Friend favorited.' : 'Friend removed from favorites.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to update favorite.');
    } finally {
      setFavoriteLoadingFriendId(null);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      {isOpen ? (
        <div
          ref={panelRef}
          className={variant === 'responsive'
            ? 'fixed left-2 right-2 top-14 z-[110] flex max-h-[calc(100dvh-4.5rem)] w-auto max-w-none flex-col overflow-y-auto rounded-3xl border border-white/10 bg-slate-950 p-3 sm:p-4 xl:absolute xl:left-auto xl:right-0 xl:top-full xl:mt-2 xl:max-h-[calc(100dvh-1rem)] xl:w-[min(calc(100vw-1rem),42rem)] xl:max-w-[calc(100vw-1rem)]'
            : variant === 'header'
            ? 'absolute right-0 top-full z-[110] mt-2 flex max-h-[calc(100dvh-1rem)] w-[min(calc(100vw-1rem),42rem)] max-w-[calc(100vw-1rem)] flex-col overflow-y-auto rounded-3xl border border-white/10 bg-slate-950 p-3 sm:max-h-[calc(100dvh-2rem)] sm:w-[min(calc(100vw-2.5rem),42rem)] sm:max-w-[calc(100vw-2.5rem)] sm:p-4'
            : 'fixed bottom-2 left-2 right-2 z-[60] mb-0 flex max-h-[calc(100dvh-1rem)] w-auto max-w-none flex-col overflow-y-auto rounded-3xl border border-white/10 bg-slate-950 p-3 sm:absolute sm:bottom-full sm:left-auto sm:right-0 sm:z-auto sm:mb-3 sm:max-h-[calc(100dvh-2rem)] sm:w-[min(calc(100vw-2.5rem),42rem)] sm:max-w-[calc(100vw-2.5rem)] sm:p-4'}
        >
          {activeFriendView ? (
            <div className="order-last pt-4">
              <button
                type="button"
                onClick={() => setSnapshotExpanded((expanded) => !expanded)}
                className="mb-4 grid min-h-9 w-full grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl px-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400 transition hover:bg-slate-900/70 hover:text-slate-200"
              >
                <span className="h-px bg-white/10" />
                <span className="inline-flex items-center gap-2">
                  {snapshotExpanded ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
                  {snapshotExpanded ? 'Collapse Profile' : 'Expand Profile'}
                  {snapshotExpanded ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
                </span>
                <span className="h-px bg-white/10" />
              </button>
              <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${snapshotExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                <section className="min-h-0 overflow-hidden">
                  <div className="pb-4">
                     <div className="relative flex items-stretch justify-between gap-3">
                      <div className="flex min-w-0 flex-1 items-stretch gap-3">
                        <span
                          className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-slate-900 bg-cover bg-center text-lg font-black text-amber-200"
                           style={activeFriendAvatarUrl ? { backgroundImage: `url(${activeFriendAvatarUrl})` } : undefined}
                         >
                           {activeFriendAvatarUrl ? null : activeFriendView.displayName.slice(0, 1).toUpperCase()}
                           <span className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-slate-950 ${activeFriendView.online ? 'bg-emerald-400' : activeFriendView.away ? 'bg-amber-300' : 'bg-slate-600'}`} />
                        </span>
                        <div className="flex min-h-14 min-w-0 flex-1 flex-col">
                          <div className="flex min-w-0 items-center gap-2">
                            {activeFriendView.favorite ? <Star size={14} className="shrink-0 fill-amber-300 text-amber-300" aria-label="Favorite" /> : null}
                             <Link
                               href={getPublicProfileHref(activeFriendView.username)}
                               target={shouldOpenProfileInNewTab() ? '_blank' : undefined}
                               rel={shouldOpenProfileInNewTab() ? 'noopener noreferrer' : undefined}
                               onClick={() => {
                                 setIsOpen(false);
                                 setActiveFriend(null);
                               }}
                               className="truncate text-base font-bold text-white transition hover:text-amber-200"
                               style={getChatNameStyle(activeFriendView.chatColor)}
                             >
                               {activeFriendView.displayName}
                             </Link>
                          </div>
                          <div className="min-w-0">
                            {activeFriendView.friendNote ? (
                              <div className="flex min-w-0 items-center text-xs text-slate-500">
                                <p className="min-w-0 truncate italic">Note: {activeFriendView.friendNote}</p>
                              </div>
                            ) : null}
                            <div className="mt-auto min-w-0 pt-1">
                              {activeFriendView.profileStatus ? <p className="truncate text-xs text-slate-300">{activeFriendView.profileStatus}</p> : null}
                              {activeFriendLiveGameNote ? (
                                <p className="truncate text-xs font-semibold text-emerald-300">{activeFriendLiveGameNote}</p>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="relative shrink-0" data-snapshot-actions="true">
                        <button
                          type="button"
                          aria-label="Friend actions"
                          aria-expanded={snapshotActionsOpen}
                          onClick={(event) => {
                            const rect = event.currentTarget.getBoundingClientRect();
                            const menuWidth = 208;
                            const gutter = 12;
                            setSnapshotActionsPosition({
                              top: Math.min(rect.bottom + 8, Math.max(gutter, window.innerHeight - 360)),
                              left: Math.min(Math.max(gutter, rect.right - menuWidth), Math.max(gutter, window.innerWidth - menuWidth - gutter)),
                            });
                            setSnapshotConfirmAction(null);
                            setSnapshotActionsOpen((open) => {
                              if (open) setSnapshotNoteOpen(false);
                              return !open;
                            });
                          }}
                          className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-slate-900 text-slate-200 transition hover:border-amber-200/40 hover:bg-slate-800"
                        >
                          <Ellipsis size={21} />
                        </button>
                        {snapshotActionsOpen ? (
                          <div
                            role="menu"
                            className={`fixed z-[120] grid max-h-[calc(100dvh-1.5rem)] w-52 gap-1 overflow-y-auto rounded-2xl border border-white/10 bg-slate-950 p-2 ${THEMED_SCROLLBAR_CLASS}`}
                            style={snapshotActionsPosition}
                          >
                            <Link
                              href={getPublicProfileHref(activeFriendView.username)}
                              target={shouldOpenProfileInNewTab() ? '_blank' : undefined}
                              rel={shouldOpenProfileInNewTab() ? 'noopener noreferrer' : undefined}
                              onClick={() => {
                                setIsOpen(false);
                                setActiveFriend(null);
                                setSnapshotActionsOpen(false);
                              }}
                              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-100 transition hover:bg-slate-900"
                            >
                              <ExternalLink size={15} /> Go to profile
                            </Link>
                            <button
                              type="button"
                              onClick={() => {
                                setSnapshotActionsOpen(false);
                                void toggleFavoriteFriend(activeFriendView);
                              }}
                              disabled={Boolean(favoriteLoadingFriendId)}
                              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-amber-100 transition hover:bg-amber-300/10 disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              {favoriteLoadingFriendId === activeFriendView.id ? <Loader2 size={15} className="animate-spin" /> : <Star size={15} className="fill-amber-300 text-amber-300" />}
                              {activeFriendView.favorite ? 'Unfavorite' : 'Favorite'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (snapshotConfirmAction === 'remove') {
                                  void unfriend(activeFriendView);
                                } else {
                                  setSnapshotConfirmAction('remove');
                                }
                              }}
                              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-red-100 transition hover:bg-red-500/10"
                            >
                              <Users size={15} /> {snapshotConfirmAction === 'remove' ? 'Click again to remove' : 'Remove friend'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (snapshotConfirmAction === 'block') {
                                  void blockFriend(activeFriendView);
                                } else {
                                  setSnapshotConfirmAction('block');
                                }
                              }}
                              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-red-100 transition hover:bg-red-500/10"
                            >
                              <ShieldBan size={15} /> {snapshotConfirmAction === 'block' ? 'Click again to block' : 'Block'}
                            </button>
                            {snapshotNoteOpen ? (
                              <div className="mt-1 border-t border-white/10 pt-2">
                                <div className="mb-2 flex items-center justify-between gap-2 px-1">
                                  <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                                    <StickyNote size={13} /> Note
                                  </p>
                                  <span className="text-[0.65rem] text-slate-600">{friendNoteDraft.length}/30</span>
                                </div>
                                <textarea
                                  value={friendNoteDraft}
                                  onChange={(event) => setFriendNoteDraft(event.target.value.slice(0, 30))}
                                  rows={2}
                                  maxLength={30}
                                  autoFocus
                                  placeholder="Only visible to you"
                                  className="w-full resize-none rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-amber-200/40"
                                />
                                <button
                                  type="button"
                                  onClick={() => void saveFriendNote(activeFriendView)}
                                  className="mt-2 inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-xl bg-amber-300 px-3 py-2 text-xs font-bold text-slate-950 transition hover:bg-amber-200"
                                >
                                  <Save size={14} /> Save note
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setFriendNoteDraft(activeFriendView.friendNote);
                                  setSnapshotNoteOpen(true);
                                }}
                                className="mt-1 flex w-full items-center gap-2 rounded-xl border-t border-white/10 px-3 py-3 text-left text-sm font-semibold text-slate-200 transition hover:bg-slate-900"
                              >
                                <StickyNote size={15} /> {activeFriendView.friendNote ? 'Edit note' : 'Add note'}
                              </button>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-3">
                      <div className="rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 sm:col-span-3">
                        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-slate-500">About</p>
                        <p className={`mt-1 text-sm leading-5 ${snapshotAboutExpanded ? '' : 'line-clamp-2'} ${activeFriendView.aboutMe ? 'text-slate-200' : 'italic text-slate-500'}`}>{activeFriendView.aboutMe || 'No about me added.'}</p>
                        {snapshotAboutIsLong ? (
                          <button
                            type="button"
                            onClick={() => setSnapshotAboutExpanded((expanded) => !expanded)}
                            className="mt-1 text-xs font-semibold text-amber-200 transition hover:text-amber-100"
                          >
                            {snapshotAboutExpanded ? 'See less' : 'See more'}
                          </button>
                        ) : null}
                      </div>
                      <div className="min-w-0 rounded-xl border border-[#5865F2]/35 bg-[#111a3a]/70 px-3 py-2 ">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-[#8EA1E1]">Discord</p>
                          <DiscordMark className="h-4 w-4 shrink-0 text-[#8EA1E1]" />
                        </div>
                         <div className="mt-1 flex min-w-0 items-center gap-2">
                           {activeFriendView.discordAvatarUrl ? <span className="h-6 w-6 shrink-0 rounded-full border border-[#5865F2]/35 bg-cover bg-center" style={{ backgroundImage: `url(${activeFriendView.discordAvatarUrl})` }} /> : null}
                           <p className={`truncate text-sm font-semibold ${activeFriendView.discordUsername ? 'text-white' : 'italic text-slate-500'}`}>{activeFriendView.discordUsername ?? 'Not linked'}</p>
                         </div>
                      </div>
                      <div className="min-w-0 rounded-xl border border-[#d13639]/35 bg-gradient-to-br from-[#180b10] via-[#111827] to-[#05070b] px-3 py-2 ">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-[#c89b3c]">Riot</p>
                          <RiotMark />
                        </div>
                        {activeFriendView.riotAccountName ? (
                          <a
                            href={`/riot-account-viewer?riotId=${encodeURIComponent(activeFriendView.riotAccountName)}`}
                            className="mt-1 inline-flex max-w-full items-center gap-1.5 text-sm font-semibold text-amber-100 transition hover:text-amber-200"
                          >
                            <span className="truncate">{activeFriendView.riotAccountName}</span>
                            <ExternalLink size={13} className="shrink-0" />
                          </a>
                        ) : (
                          <p className="mt-1 text-sm font-semibold italic text-slate-500">Not linked</p>
                        )}
                      </div>
                      <div className="rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2">
                        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-slate-500">Account Created</p>
                        <p className={`mt-1 text-sm font-semibold ${activeFriendView.createdAt ? 'text-white' : 'italic text-slate-500'}`}>{formatProfileDate(activeFriendView.createdAt)}</p>
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          ) : null}

          <div className="flex h-[min(34rem,calc(100dvh-5rem))] min-h-0 flex-col sm:h-[min(34rem,calc(100dvh-12rem))]">
            <div className="flex items-start justify-between gap-3 sm:gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">Friends</p>
                <h2 className="mt-1 text-base font-bold text-white sm:text-lg">{totalFriendCount} friends · {onlineCount} online{awayCount > 0 ? ` · ${awayCount} away` : ''}</h2>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {dashboard && dashboard.incomingRequests.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setRequestsOpen((value) => !value);
                      setAddFriendOpen(false);
                      setStatus('');
                    }}
                    className="relative inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-amber-300/40 bg-amber-300/10 px-3 text-sm font-bold text-amber-100 transition hover:bg-amber-300/20"
                  >
                    Requests
                    <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-black text-white">
                      {dashboard.incomingRequests.length > 99 ? '99+' : dashboard.incomingRequests.length}
                    </span>
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    setAddFriendOpen((value) => !value);
                    setStatus('');
                  }}
                  className="inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-amber-300/40 bg-amber-300/10 px-3 text-sm font-bold text-amber-100 transition hover:bg-amber-300/20"
                >
                  <Users size={15} />
                  Add Friend
                </button>
                <button
                  type="button"
                  onClick={() => {
                  setIsOpen(false);
                  setActiveFriend(null);
                  setSnapshotExpanded(false);
                  setSnapshotAboutExpanded(false);
                  setAddFriendOpen(false);
                  setAddFriendSearchQuery('');
                  setAddFriendSearchResults([]);
                  setContextFriend(null);
                  }}
                  aria-label="Close friends"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-slate-900 text-slate-200 transition hover:bg-slate-800"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-2">
              {dashboard && dashboard.incomingRequests.length > 0 && requestsOpen ? (
                <div className="grid gap-2 rounded-2xl border border-amber-300/25 bg-amber-300/5 p-3">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-200">Incoming Friend Requests</p>
                  <div className="max-h-[min(18rem,calc(100dvh-14rem))] overflow-x-auto overflow-y-auto pr-1">
                    <div className="grid gap-2">
                      {dashboard.incomingRequests.map((request) => (
                        <div key={request.id} className="flex min-w-max items-center justify-between gap-2 rounded-xl bg-slate-900 p-3">
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <span
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-slate-950 bg-cover bg-center text-xs font-black text-amber-200"
                              style={request.requester.avatarUrl ? { backgroundImage: `url(${request.requester.avatarUrl})` } : undefined}
                            >
                              {request.requester.avatarUrl ? null : request.requester.displayName.slice(0, 1).toUpperCase()}
                            </span>
                            <p className="max-w-48 truncate text-sm font-semibold" style={getChatNameStyle(request.requester.chatColor)}>{request.requester.displayName}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <Link
                              href={getPublicProfileHref(request.requester.username)}
                              target={shouldOpenProfileInNewTab() ? '_blank' : undefined}
                              rel={shouldOpenProfileInNewTab() ? 'noopener noreferrer' : undefined}
                              onClick={() => setIsOpen(false)}
                              className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-slate-200 transition hover:bg-slate-800"
                            >
                              View
                            </Link>
                            <button
                              type="button"
                              disabled={Boolean(incomingRequestActionId)}
                              onClick={() => void respondToIncomingRequest(request, 'accept')}
                              className="rounded-xl bg-emerald-400 px-3 py-2 text-xs font-bold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Accept
                            </button>
                            <button
                              type="button"
                              disabled={Boolean(incomingRequestActionId)}
                              onClick={() => void respondToIncomingRequest(request, 'decline')}
                              className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-100 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Decline
                            </button>
                            <button
                              type="button"
                              disabled={Boolean(incomingRequestActionId)}
                              onClick={() => void blockIncomingRequest(request)}
                              aria-label={`Block ${request.requester.displayName}`}
                              className="inline-flex items-center justify-center gap-1 rounded-xl border border-red-300/30 bg-red-950/30 px-3 py-2 text-xs font-bold text-red-100 transition hover:bg-red-900/50 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <ShieldBan size={14} />
                              Block
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
              {addFriendOpen ? (
                <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-3">
                  <div className="relative">
                    <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      value={addFriendSearchQuery}
                      onChange={(event) => setAddFriendSearchQuery(event.target.value)}
                      placeholder="Search users"
                      autoComplete="off"
                      className="min-h-11 w-full rounded-2xl border border-white/10 bg-slate-900 px-10 pr-11 text-sm text-white outline-none placeholder:text-slate-500"
                    />
                    {addFriendSearchQuery ? (
                      <button
                        type="button"
                        onClick={() => {
                          setAddFriendSearchQuery('');
                          setAddFriendSearchResults([]);
                        }}
                        aria-label="Clear user search"
                        className="absolute right-3 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-white"
                      >
                        <X size={15} />
                      </button>
                    ) : null}
                  </div>
                  {addFriendSearchLoading ? (
                    <div className="flex items-center justify-center gap-2 py-5 text-sm text-slate-400"><Loader2 size={16} className="animate-spin text-amber-300" /> Searching users...</div>
                  ) : addFriendSearchQuery.trim().length < 3 ? (
                    <p className="py-4 text-xs text-slate-500">Type at least 3 characters to search.</p>
                  ) : addFriendSearchResults.length === 0 ? (
                    <p className="py-4 text-xs text-slate-500">No users found.</p>
                  ) : (
                    <div className={`mt-3 grid max-h-64 gap-2 overflow-y-auto pr-1 ${THEMED_SCROLLBAR_CLASS}`}>
                      {addFriendSearchResults.map((candidate) => (
                        <div key={candidate.id} className="flex min-h-14 items-center gap-3 rounded-xl bg-slate-900 px-3 py-2">
                          <span
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-slate-950 bg-cover bg-center text-xs font-black text-amber-200"
                            style={candidate.avatarUrl ? { backgroundImage: `url(${candidate.avatarUrl})` } : undefined}
                          >
                            {candidate.avatarUrl ? null : candidate.displayName.slice(0, 1).toUpperCase()}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-center gap-1">
                              <p className="min-w-0 truncate text-sm font-semibold text-white" style={getChatNameStyle(candidate.chatColor)}>{candidate.displayName}</p>
                              {candidate.blocked ? <CircleSlash2 size={15} className="shrink-0 text-red-300" aria-label="Blocked" /> : null}
                            </div>
                            <p className="mt-0.5 truncate text-[0.68rem] text-slate-500">Joined {formatProfileDate(candidate.createdAt)}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <Link
                              href={getPublicProfileHref(candidate.username)}
                              target={shouldOpenProfileInNewTab() ? '_blank' : undefined}
                              rel={shouldOpenProfileInNewTab() ? 'noopener noreferrer' : undefined}
                              onClick={() => setAddFriendOpen(false)}
                              className="inline-flex min-h-9 items-center justify-center rounded-lg border border-white/10 bg-slate-950 px-2.5 py-1.5 text-xs font-bold text-slate-200 transition hover:border-amber-200/40 hover:bg-slate-800"
                            >
                              View Profile
                            </Link>
                            {candidate.blocked ? (
                              <span className="shrink-0 text-xs font-semibold text-red-200">Blocked</span>
                            ) : candidate.relationship === 'friend' ? (
                              <button type="button" onClick={() => void removeFriendCandidate(candidate)} className="shrink-0 rounded-lg border border-red-300/35 bg-red-500/10 px-2.5 py-2 text-xs font-bold text-red-100 transition hover:bg-red-500/20">Remove Friend</button>
                            ) : candidate.relationship === 'incoming' ? (
                              <button type="button" onClick={() => void sendFriendCandidateRequest(candidate)} className="shrink-0 rounded-lg bg-emerald-400 px-2.5 py-2 text-xs font-bold text-slate-950 transition hover:bg-emerald-300">Accept</button>
                            ) : candidate.relationship === 'outgoing' ? (
                              <span className="shrink-0 text-xs font-semibold text-slate-500">Pending</span>
                            ) : candidate.friendRequestsOpen ? (
                              <button type="button" onClick={() => void sendFriendCandidateRequest(candidate)} className="shrink-0 rounded-lg bg-emerald-400 px-2.5 py-2 text-xs font-bold text-slate-950 transition hover:bg-emerald-300">Add Friend</button>
                            ) : (
                              <span className="shrink-0 text-xs font-semibold text-slate-500">Requests closed</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
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

            <div className={`mt-4 grid min-h-0 flex-1 gap-4 md:grid-cols-[minmax(0,1fr)_13rem] md:grid-rows-1 ${activeFriendView ? 'grid-rows-[minmax(13rem,1fr)_minmax(10rem,14rem)]' : 'grid-rows-[1fr]'}`}>
              <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-950/70 p-3">
                {activeFriendView ? (
                  <>
                    <div className="border-b border-white/10 pb-2">
                      <p className="text-sm font-bold text-white" style={getChatNameStyle(activeFriendView.chatColor)}>{activeFriendView.displayName}</p>
                       <p className={`text-xs ${activeFriendView.online ? 'text-emerald-300' : activeFriendView.away ? 'text-amber-200' : 'text-slate-500'}`}>
                         {activeFriendView.online ? 'Online' : activeFriendView.away ? 'Away' : 'Offline'}
                      </p>
                    </div>
                    <div
                      ref={messagesContainerRef}
                      onScroll={updateMessageScrollIntent}
                      className={`mt-3 grid min-h-0 flex-1 content-start gap-2 overflow-y-auto pr-1 ${THEMED_SCROLLBAR_CLASS}`}
                    >
                      {messages.map((chatMessage) => {
                        const isOwnMessage = chatMessage.sender_id === viewerUserId;
                        const deliveryStatus = chatMessage.deliveryStatus;
                        const invite = getMultiplayerInvite(chatMessage.message);
                        const senderProfile = messageProfiles[chatMessage.sender_id];
                        const bubbleStyle = getChatBubbleStyle(
                          chatMessage.chat_color ?? senderProfile?.chatColor,
                          chatMessage.chat_border ?? senderProfile?.chatBorder,
                        );
                        const inviteButtonStyle = getChatInviteButtonStyle(
                          chatMessage.chat_color ?? senderProfile?.chatColor,
                          isOwnMessage,
                        );

                        return (
                          <Fragment key={chatMessage.id}>
                            {chatMessage.id === firstUnreadMessageId ? (
                              <div
                                data-new-message-indicator="true"
                                className="my-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-[0.68rem] font-black uppercase tracking-[0.18em] text-red-200"
                              >
                                <span className="h-px bg-red-500/80" />
                                <span className="rounded-full border border-red-500/40 bg-red-500/15 px-2 py-0.5">New</span>
                                <span className="h-px bg-red-500/80" />
                              </div>
                            ) : null}
                            <div className={`flex max-w-[82%] min-w-0 items-center gap-1.5 ${isOwnMessage ? 'ml-auto' : 'mr-auto'}`}>
                              {isOwnMessage && deliveryStatus ? (
                                <span
                                  className="group relative inline-flex shrink-0 items-center"
                                  aria-label={deliveryStatus === 'pending' ? 'Pending' : deliveryStatus === 'sent' ? 'Sent' : 'Failed to send'}
                                  tabIndex={0}
                                >
                                  {deliveryStatus === 'pending' ? <Loader2 size={13} className="animate-spin text-slate-300" aria-hidden="true" /> : null}
                                  {deliveryStatus === 'sent' ? <Check size={13} className="text-emerald-300" aria-hidden="true" /> : null}
                                  {deliveryStatus === 'failed' ? <X size={13} className="text-red-300" aria-hidden="true" /> : null}
                                  <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-slate-950 px-2 py-1 text-[0.65rem] font-semibold text-slate-200 group-hover:block group-focus-within:block">
                                    {deliveryStatus === 'pending' ? 'Pending' : deliveryStatus === 'sent' ? 'Sent' : 'Failed to send'}
                                  </span>
                                </span>
                              ) : null}
                              <div
                                className={`min-w-0 max-w-full break-words rounded-xl px-3 py-2 text-sm [overflow-wrap:anywhere] ${
                                  isOwnMessage ? 'text-right font-medium' : 'font-medium'
                                }`}
                                style={bubbleStyle}
                              >
                                {invite ? (
                                  <div className={`flex flex-wrap items-center gap-2 ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
                                    <span>{invite.gameName} invite</span>
                                    <button
                                      type="button"
                                      disabled={isOwnMessage}
                                      onClick={() => {
                                        if (isOwnMessage) return;
                                        window.location.href = invite.url;
                                      }}
                                      className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${isOwnMessage ? 'cursor-not-allowed' : ''}`}
                                      style={inviteButtonStyle}
                                    >
                                      {isOwnMessage ? 'Sent' : 'Join Game'}
                                    </button>
                                  </div>
                                ) : (
                                  chatMessage.message
                                )}
                              </div>
                            </div>
                          </Fragment>
                        );
                      })}
                    </div>
                    <form onSubmit={sendMessage} className="mt-3 flex gap-2">
                      <input
                        ref={messageInputRef}
                        value={messageDraft}
                        onChange={(event) => setMessageDraft(event.target.value.slice(0, 1000))}
                        placeholder="Message"
                        className="min-h-10 flex-1 rounded-xl border border-white/10 bg-slate-900 px-3 text-sm text-white outline-none placeholder:text-slate-500"
                      />
                      <button
                        type="submit"
                        disabled={isSendingMessage}
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
              <section className={`min-h-0 overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/70 p-2 ${THEMED_SCROLLBAR_CLASS}`}>
                {friends.length === 0 ? (
                  <p className="px-3 py-6 text-center text-sm text-slate-500">
                    {cleanSearchQuery ? 'None found' : 'No friends yet.'}
                  </p>
                ) : null}
                {friends.map((friend) => (
                  <button
                    key={friend.id}
                    type="button"
                  onClick={() => {
                    shouldStickToBottomRef.current = true;
                    setContextFriend(null);
                    setSnapshotExpanded(true);
                    setActiveFriend((current) => (current?.id === friend.id ? null : friend));
                  }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setFriendNoteDraft(friend.friendNote);
                      setFriendNoteEditing(false);
                      setConfirmUnfriendFriendId(null);
                      setContextFriend({
                        friend,
                        x: Math.min(event.clientX, Math.max(12, window.innerWidth - 300)),
                        y: Math.min(event.clientY, Math.max(12, window.innerHeight - 360)),
                      });
                    }}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${
                      activeFriend?.id === friend.id ? 'border-amber-300/80 bg-amber-300/10 text-slate-100' : 'border-transparent text-slate-200 hover:bg-slate-900'
                    }`}
                  >
                    <span
                      className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-slate-900 bg-cover bg-center text-xs font-black text-amber-200"
                       style={friend.avatarUrl ? { backgroundImage: `url(${friend.avatarUrl})` } : undefined}
                    >
                       {friend.avatarUrl ? null : friend.displayName.slice(0, 1).toUpperCase()}
                       <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-slate-950 ${friend.online ? 'bg-emerald-400' : friend.away ? 'bg-amber-300' : 'bg-slate-600'}`} />
                     </span>
                     <span className="min-w-0 flex-1 text-left">
                       <span className="block truncate text-sm font-semibold" style={getChatNameStyle(friend.chatColor)}>
                         {friend.favorite ? <Star size={12} className="mr-1 inline fill-amber-300 text-amber-300" aria-label="Favorite" /> : null}
                         {friend.displayName}
                       </span>
                       {friend.profileStatus ? <span className="block truncate text-[0.68rem] text-slate-300">{friend.profileStatus}</span> : null}
                     </span>
                    {friend.id !== activeFriend?.id && friend.unreadCount > 0 ? (
                      <span className="ml-auto rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
                        {friend.unreadCount > 99 ? '99+' : friend.unreadCount}
                      </span>
                    ) : null}
                  </button>
                ))}
              </section>
            </div>
            {status ? (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm font-semibold text-slate-200">
                <p className="min-w-0">{status}</p>
                <button
                  type="button"
                  onClick={() => setStatus('')}
                  aria-label="Dismiss notification"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-900 hover:text-white"
                >
                  <X size={14} />
                </button>
              </div>
            ) : null}
          </div>
          {contextFriend ? (
            <div
              ref={contextMenuRef}
              className="fixed z-[70] max-h-[calc(100dvh-1rem)] w-[min(18rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl border border-white/10 bg-slate-950 p-2"
              style={{ left: contextFriend.x, top: contextFriend.y }}
            >
              <Link
                href={getPublicProfileHref(contextFriend.friend.username)}
                target={shouldOpenProfileInNewTab() ? '_blank' : undefined}
                rel={shouldOpenProfileInNewTab() ? 'noopener noreferrer' : undefined}
                onClick={() => {
                  setIsOpen(false);
                  setActiveFriend(null);
                  setContextFriend(null);
                }}
                className="block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-100 transition hover:bg-slate-900"
              >
                View Profile
              </Link>
              <button
                type="button"
                onClick={() => toggleFavoriteFriend(contextFriend.friend)}
                disabled={Boolean(favoriteLoadingFriendId)}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-amber-100 transition hover:bg-amber-300/10 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {favoriteLoadingFriendId === contextFriend.friend.id ? <Loader2 size={14} className="animate-spin" /> : null}
                {favoriteLoadingFriendId === contextFriend.friend.id
                  ? contextFriend.friend.favorite ? 'Unfavoriting...' : 'Favoriting...'
                  : contextFriend.friend.favorite ? 'Unfavorite' : 'Favorite'}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirmUnfriendFriendId === contextFriend.friend.id) {
                    void unfriend(contextFriend.friend);
                    return;
                  }
                  setConfirmUnfriendFriendId(contextFriend.friend.id);
                }}
                className="block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-red-100 transition hover:bg-red-500/10"
              >
                {confirmUnfriendFriendId === contextFriend.friend.id ? 'Click again to unfriend' : 'Unfriend'}
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
              <div className="mt-2 border-t border-white/10 pt-2">
                <div className="mb-2 flex items-center justify-between gap-2 px-1">
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    <StickyNote size={13} />
                    Note
                  </p>
                  {friendNoteEditing ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setFriendNoteDraft(contextFriend.friend.friendNote);
                          setFriendNoteEditing(false);
                        }}
                        aria-label="Cancel note editing"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-slate-900 text-slate-300 transition hover:bg-slate-800"
                      >
                        <X size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => saveFriendNote(contextFriend.friend)}
                        aria-label="Save note"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-amber-300 text-slate-950 transition hover:bg-amber-200"
                      >
                        <Save size={14} />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setFriendNoteDraft(contextFriend.friend.friendNote);
                        setFriendNoteEditing(true);
                      }}
                      aria-label="Edit note"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-slate-900 text-slate-300 transition hover:bg-slate-800"
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                </div>
                {friendNoteEditing ? (
                  <textarea
                    value={friendNoteDraft}
                    onChange={(event) => setFriendNoteDraft(event.target.value.slice(0, 30))}
                    rows={2}
                    maxLength={30}
                    autoFocus
                    placeholder="Only visible to you"
                    className="w-full resize-none rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setFriendNoteDraft(contextFriend.friend.friendNote);
                      setFriendNoteEditing(true);
                    }}
                    className={`block w-full rounded-xl px-3 py-2 text-left text-sm leading-5 transition hover:bg-slate-900 ${contextFriend.friend.friendNote ? 'text-slate-300' : 'italic text-slate-500'}`}
                  >
                    {contextFriend.friend.friendNote || 'Click here to add a note'}
                  </button>
                )}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        aria-label="Friends"
        title="Friends"
        onMouseEnter={() => playUiSound('autocomplete-hover')}
        onFocus={() => playUiSound('autocomplete-hover')}
        onClick={() => {
          playUiSound('autocomplete-select');
          setIsOpen((value) => {
            if (value) {
              setAddFriendOpen(false);
              setAddFriendSearchQuery('');
              setAddFriendSearchResults([]);
              setContextFriend(null);
              setActiveFriend(null);
              setSnapshotExpanded(false);
              setSnapshotAboutExpanded(false);
            }
            return !value;
          });
        }}
        className={variant === 'responsive'
          ? 'relative hidden h-9 items-center justify-center gap-2 rounded-xl border border-white/15 bg-slate-950/90 px-2.5 text-xs font-black uppercase tracking-[0.12em] text-slate-100 transition hover:border-amber-200/50 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-200 xl:inline-flex xl:h-10 xl:px-3'
          : variant === 'header'
          ? 'relative inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-white/15 bg-slate-950/90 px-2.5 text-xs font-black uppercase tracking-[0.12em] text-slate-100 transition hover:border-amber-200/50 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-200 sm:h-10 sm:px-3'
          : 'relative inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-slate-950 px-4 text-sm font-bold text-slate-100 transition hover:border-white/20 hover:bg-slate-900'}
      >
        <Users size={18} />
        <span className={variant === 'header' || variant === 'responsive' ? 'hidden 2xl:inline' : ''}>Friends</span>
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
