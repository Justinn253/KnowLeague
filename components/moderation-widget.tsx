'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Search, ShieldAlert, ShieldCheck, UserCog, X } from 'lucide-react';
import { THEMED_SCROLLBAR_CLASS } from '@/lib/scrollbar';
import { getOptionalSupabaseClient } from '@/lib/supabaseClient';
import type { AppRole, ModerationContactSubmission, ModerationTeamMember, ModerationUserResult, StoredAppRole } from '@/lib/moderation';
import { playUiSound } from '@/lib/ui-sounds';

type ModerationWidgetProps = {
  role?: AppRole | null;
  variant?: 'floating' | 'drawer' | 'header-icon';
};

type ModerationTab = 'users' | 'contact' | 'team';

async function getModerationAuthHeaders() {
  const supabase = getOptionalSupabaseClient();
  const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
  if (!data.session) {
    throw new Error('Login required.');
  }

  return { Authorization: `Bearer ${data.session.access_token}` };
}

async function fetchModerationJson<TData>(url: string, options: RequestInit = {}) {
  const authHeaders = await getModerationAuthHeaders();
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
    throw new Error(data.error ?? 'Moderation request failed.');
  }

  return data as TData;
}

function formatModerationDate(value: string | null) {
  if (!value) return 'Unknown';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function getRoleBadgeClass(role: AppRole) {
  if (role === 'admin') return 'border-amber-300/40 bg-amber-300/15 text-amber-100';
  if (role === 'moderator') return 'border-cyan-300/35 bg-cyan-300/10 text-cyan-100';
  return 'border-white/10 bg-slate-900 text-slate-300';
}

export function ModerationWidget({ role, variant = 'floating' }: ModerationWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ModerationTab>('users');
  const [userQuery, setUserQuery] = useState('');
  const [users, setUsers] = useState<ModerationUserResult[]>([]);
  const [contactSubmissions, setContactSubmissions] = useState<ModerationContactSubmission[]>([]);
  const [teamMembers, setTeamMembers] = useState<ModerationTeamMember[]>([]);
  const [contactTypeFilter, setContactTypeFilter] = useState('all');
  const [contactStatusFilter, setContactStatusFilter] = useState('all');
  const [contactSeverityFilter, setContactSeverityFilter] = useState('all');
  const [contactSearchQuery, setContactSearchQuery] = useState('');
  const [contactSortDirection, setContactSortDirection] = useState<'newest' | 'oldest'>('newest');
  const [contactDateFrom, setContactDateFrom] = useState('');
  const [contactDateTo, setContactDateTo] = useState('');
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [roleUpdatingUserId, setRoleUpdatingUserId] = useState<string | null>(null);
  const [actionLoadingKey, setActionLoadingKey] = useState<string | null>(null);
  const [messageTarget, setMessageTarget] = useState<{ id: string; label: string } | null>(null);
  const [messageDraft, setMessageDraft] = useState('');
  const [status, setStatus] = useState('');

  const hasModerationAccess = role === 'moderator' || role === 'admin';
  const canManageModerators = role === 'admin';
  const roleLabel = role === 'admin' ? 'Admin' : 'Moderator';
  const contactCategories = Array.from(new Set(contactSubmissions.map((submission) => submission.category))).sort();
  const statusRank: Record<string, number> = { open: 0, archived: 1, closed: 2 };
  const visibleContactSubmissions = contactSubmissions
    .filter((submission) => contactTypeFilter === 'all' || submission.category === contactTypeFilter)
    .filter((submission) => contactStatusFilter === 'all' || submission.status === contactStatusFilter)
    .filter((submission) => contactSeverityFilter === 'all' || submission.severity === Number(contactSeverityFilter))
    .filter((submission) => {
      const createdAt = new Date(submission.createdAt).getTime();
      if (contactDateFrom && createdAt < new Date(`${contactDateFrom}T00:00:00`).getTime()) return false;
      if (contactDateTo && createdAt > new Date(`${contactDateTo}T23:59:59.999`).getTime()) return false;
      return true;
    })
    .filter((submission) => {
      const query = contactSearchQuery.trim().toLowerCase();
      if (!query) return true;
      return [
        submission.category,
        submission.message,
        submission.status,
        String(submission.severity),
        submission.username,
        submission.userUid,
        submission.email,
        submission.reportedUsername ?? '',
      ].some((value) => value.toLowerCase().includes(query));
    })
    .sort((left, right) => {
      const statusDelta = (statusRank[left.status] ?? 99) - (statusRank[right.status] ?? 99);
      if (statusDelta !== 0) return statusDelta;
      const leftTime = new Date(left.createdAt).getTime();
      const rightTime = new Date(right.createdAt).getTime();
      return contactSortDirection === 'newest' ? rightTime - leftTime : leftTime - rightTime;
    });
  const searchedUserPresenceKey = useMemo(() => users
    .map((user) => user.id)
    .sort()
    .join('|'), [users]);

  useEffect(() => {
    if (!hasModerationAccess && isOpen) {
      setIsOpen(false);
    }
  }, [hasModerationAccess, isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const searchUsers = useCallback(async (query: string) => {
    const cleanQuery = query.trim();
    if (cleanQuery.length < 2) {
      setUsers([]);
      return;
    }

    setLoading(true);
    setStatus('');
    try {
      const data = await fetchModerationJson<{ users: ModerationUserResult[] }>(`/api/moderation/users?q=${encodeURIComponent(cleanQuery)}`);
      setUsers(data.users);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to search users.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadContactSubmissions = useCallback(async () => {
    setLoading(true);
    setStatus('');
    try {
      const data = await fetchModerationJson<{ submissions: ModerationContactSubmission[] }>('/api/moderation/contacts');
      setContactSubmissions(data.submissions);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to load contact submissions.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTeamMembers = useCallback(async () => {
    setLoading(true);
    setStatus('');
    try {
      const data = await fetchModerationJson<{ team: ModerationTeamMember[] }>('/api/moderation/team');
      setTeamMembers(data.team);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to load moderation team.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (contactSubmissions.length === 0) {
      void loadContactSubmissions();
    }
    if (teamMembers.length === 0) {
      void loadTeamMembers();
    }
  }, [contactSubmissions.length, isOpen, loadContactSubmissions, loadTeamMembers, teamMembers.length]);

  useEffect(() => {
    if (!isOpen || activeTab !== 'users' || !searchedUserPresenceKey) {
      setOnlineUserIds(new Set());
      return undefined;
    }

    const supabase = getOptionalSupabaseClient();
    if (!supabase) {
      return undefined;
    }

    const presenceChannels = searchedUserPresenceKey.split('|').map((userId) => ({
      userId,
      channel: supabase.channel(`knowleague-user-presence:${userId}`),
    }));
    const syncPresence = () => {
      const nextOnlineUserIds = new Set<string>();
      presenceChannels.forEach(({ userId, channel }) => {
        const state = channel.presenceState<{ userId?: string }>();
        if (Object.values(state).flat().some((presence) => presence.userId === userId)) {
          nextOnlineUserIds.add(userId);
        }
      });
      setOnlineUserIds(nextOnlineUserIds);
    };

    presenceChannels.forEach(({ channel }) => {
      channel
        .on('presence', { event: 'sync' }, syncPresence)
        .subscribe();
    });

    return () => {
      presenceChannels.forEach(({ channel }) => {
        void supabase.removeChannel(channel);
      });
    };
  }, [activeTab, isOpen, searchedUserPresenceKey]);

  const submitUserSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void searchUsers(userQuery);
  };

  const clearContactFilters = () => {
    setContactTypeFilter('all');
    setContactStatusFilter('all');
    setContactSeverityFilter('all');
    setContactSearchQuery('');
    setContactSortDirection('newest');
    setContactDateFrom('');
    setContactDateTo('');
  };

  const updateUserRole = async (targetUserId: string, nextRole: StoredAppRole) => {
    setRoleUpdatingUserId(targetUserId);
    setStatus('');
    try {
      await fetchModerationJson<{ ok: true }>('/api/moderation/users', {
        method: 'PATCH',
        body: JSON.stringify({ targetUserId, role: nextRole }),
      });
      setUsers((current) => current.map((user) => (
        user.id === targetUserId ? { ...user, role: nextRole } : user
      )));
      setTeamMembers((current) => nextRole === 'user'
        ? current.filter((member) => member.id !== targetUserId)
        : current.map((member) => (member.id === targetUserId ? { ...member, role: 'moderator' } : member)));
      setStatus(nextRole === 'moderator' ? 'Moderator role assigned.' : 'Moderator role removed.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to update user role.');
    } finally {
      setRoleUpdatingUserId(null);
    }
  };

  const runUserAction = async (
    targetUserId: string,
    action: 'logout' | 'ban' | 'unban' | 'message',
    message?: string,
  ) => {
    const actionKey = `${targetUserId}:${action}`;
    setActionLoadingKey(actionKey);
    setStatus('');
    try {
      await fetchModerationJson<{ ok: true }>('/api/moderation/users', {
        method: 'POST',
        body: JSON.stringify({ targetUserId, action, message }),
      });
      setUsers((current) => current.map((user) => {
        if (user.id !== targetUserId) return user;
        if (action === 'ban') return { ...user, isBanned: true };
        if (action === 'unban') return { ...user, isBanned: false };
        return user;
      }));
      if (action === 'message') {
        setMessageTarget(null);
        setMessageDraft('');
        window.dispatchEvent(new CustomEvent('knowleague:friends-refresh'));
      } else {
        setStatus('Moderation action applied.');
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to apply moderation action.');
    } finally {
      setActionLoadingKey(null);
    }
  };

  const getTicketStatusClass = (statusValue: string) => {
    if (statusValue === 'open') return 'border-emerald-300/35 bg-emerald-500/10';
    if (statusValue === 'archived') return 'border-sky-300/35 bg-sky-500/10';
    if (statusValue === 'closed') return 'border-slate-500/35 bg-slate-800/65';
    return 'border-white/10 bg-slate-900/65';
  };

  const updateTicket = async (submissionId: string, updates: { status?: string; severity?: number }) => {
    const actionKey = `${submissionId}:ticket`;
    setActionLoadingKey(actionKey);
    setStatus('');
    try {
      await fetchModerationJson<{ ok: true }>('/api/moderation/contacts', {
        method: 'PATCH',
        body: JSON.stringify({ submissionId, ...updates }),
      });
      setContactSubmissions((current) => current.map((submission) => (
        submission.id === submissionId ? { ...submission, ...updates } : submission
      )));
      setStatus('Ticket updated.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to update ticket.');
    } finally {
      setActionLoadingKey(null);
    }
  };

  if (!hasModerationAccess) {
    return null;
  }

  return (
    <div className="relative">
      {isOpen ? (
        <div
          className={`fixed ${variant === 'header-icon' ? 'left-0 right-0 top-0 z-[120] h-[100dvh] w-auto' : variant === 'floating' ? 'inset-0 z-[80]' : 'inset-0 z-[120]'} flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm sm:p-4`}
          onPointerDown={() => setIsOpen(false)}
        >
          <div
            className={`relative h-[calc(100dvh-1.5rem)] w-full max-w-5xl overflow-y-auto rounded-3xl border border-white/10 bg-slate-950 sm:h-[calc(100dvh-2rem)] ${THEMED_SCROLLBAR_CLASS}`}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Close moderation menu"
              className="absolute right-3 top-3 z-10 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-slate-900 text-slate-200 transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-200 sm:right-4 sm:top-[2.125rem]"
            >
              <X size={18} />
            </button>

            <section className="mx-auto flex h-full w-full max-w-5xl flex-col px-4 py-5 sm:px-6 sm:py-8">
              <header className="mb-5 flex min-h-12 items-center justify-between gap-3 pr-16">
                <div>
                  <h2 className="text-xl font-semibold text-white">Moderation - {roleLabel}</h2>
                </div>
              </header>

              <div className="min-h-0 flex-1 rounded-3xl border border-white/10 bg-slate-900/70 p-3 sm:p-6">
          <div className="grid grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-slate-950/80 p-1">
            {([
              ['users', 'Users'],
              ['contact', 'Contact Us'],
              ['team', 'Team'],
            ] as const).map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`min-h-10 rounded-xl px-3 text-sm font-bold transition ${
                  activeTab === tab ? 'bg-amber-300 text-slate-950' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {activeTab === 'users' ? (
            <section className="mt-4 flex min-h-0 flex-col">
              <form onSubmit={submitUserSearch} className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    value={userQuery}
                    onChange={(event) => setUserQuery(event.target.value)}
                    placeholder="Search username or display name"
                    autoComplete="off"
                    className="min-h-11 w-full rounded-2xl border border-white/10 bg-slate-900 px-10 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-white/20 focus:ring-1 focus:ring-white/15"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading || userQuery.trim().length < 2}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-amber-300 px-4 text-sm font-bold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                  Search
                </button>
              </form>

              <div className={`mt-4 grid max-h-[28rem] gap-2 overflow-y-auto pr-1 ${THEMED_SCROLLBAR_CLASS}`}>
                {users.length === 0 ? (
                  <p className="rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-6 text-center text-sm text-slate-500">
                    Search for a user to view moderation actions.
                  </p>
                ) : null}
                {users.map((user) => {
                  const userOnline = user.online || onlineUserIds.has(user.id);
                  return (
                  <article key={user.id} className="rounded-2xl border border-white/10 bg-slate-900/65 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-black text-white">{user.displayName}</p>
                          <span className={`rounded-full border px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-[0.12em] ${getRoleBadgeClass(user.role)}`}>
                            {user.role}
                          </span>
                          {user.isBanned ? (
                            <span className="rounded-full border border-red-300/30 bg-red-500/10 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-red-100">
                              Banned
                            </span>
                          ) : null}
                          <span className={`rounded-full border px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-[0.12em] ${
                            userOnline ? 'border-emerald-300/30 bg-emerald-500/10 text-emerald-100' : 'border-white/10 bg-slate-950 text-slate-500'
                          }`}>
                            {userOnline ? 'Online' : 'Offline'}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-xs text-slate-500">@{user.username} - Joined {formatModerationDate(user.createdAt)}</p>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setMessageTarget({ id: user.id, label: user.displayName })}
                          className="inline-flex min-h-9 items-center justify-center rounded-xl border border-white/10 bg-slate-950 px-3 text-xs font-bold text-slate-200 transition hover:bg-slate-800"
                        >
                          Message
                        </button>
                        <button
                          type="button"
                          onClick={() => runUserAction(user.id, 'logout')}
                          disabled={actionLoadingKey === `${user.id}:logout` || user.role === 'admin'}
                          className="inline-flex min-h-9 items-center justify-center rounded-xl border border-white/10 bg-slate-950 px-3 text-xs font-bold text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Log Out
                        </button>
                        {canManageModerators && user.role !== 'admin' ? (
                          <button
                            type="button"
                            onClick={() => updateUserRole(user.id, user.role === 'moderator' ? 'user' : 'moderator')}
                            disabled={roleUpdatingUserId === user.id}
                            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-cyan-300/35 bg-cyan-300/10 px-3 text-xs font-bold text-cyan-100 transition hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {roleUpdatingUserId === user.id ? <Loader2 size={14} className="animate-spin" /> : <UserCog size={14} />}
                            {user.role === 'moderator' ? 'Remove Mod' : 'Make Mod'}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => runUserAction(user.id, user.isBanned ? 'unban' : 'ban')}
                          disabled={actionLoadingKey === `${user.id}:${user.isBanned ? 'unban' : 'ban'}` || user.role === 'admin'}
                          className="inline-flex min-h-9 items-center justify-center rounded-xl border border-red-300/30 bg-red-500/10 px-3 text-xs font-bold text-red-100 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {user.isBanned ? 'Unban' : 'Ban'}
                        </button>
                      </div>
                    </div>
                    {messageTarget?.id === user.id ? (
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          void runUserAction(user.id, 'message', messageDraft);
                        }}
                        className="mt-3 flex gap-2"
                      >
                        <input
                          value={messageDraft}
                          onChange={(event) => setMessageDraft(event.target.value.slice(0, 1000))}
                          placeholder={`Message ${user.displayName}`}
                          className="min-h-10 flex-1 rounded-xl border border-white/10 bg-slate-950 px-3 text-sm text-white outline-none placeholder:text-slate-500"
                        />
                        <button
                          type="submit"
                          disabled={!messageDraft.trim() || actionLoadingKey === `${user.id}:message`}
                          className="inline-flex min-h-10 items-center justify-center rounded-xl bg-amber-300 px-4 text-sm font-bold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Send
                        </button>
                      </form>
                    ) : null}
                  </article>
                  );
                })}
              </div>
            </section>
          ) : (
            activeTab === 'contact' ? (
            <section className="mt-4 flex min-h-0 flex-col">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-300">Contact submissions</p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={clearContactFilters}
                    className="inline-flex min-h-9 items-center justify-center rounded-xl border border-white/10 bg-slate-950 px-3 text-xs font-bold text-slate-200 transition hover:bg-slate-800"
                  >
                    Clear Filters
                  </button>
                  <button
                    type="button"
                    onClick={() => void loadContactSubmissions()}
                    disabled={loading}
                    className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-3 text-xs font-bold text-slate-200 transition hover:bg-slate-800 disabled:opacity-60"
                  >
                    {loading ? <Loader2 size={14} className="animate-spin" /> : null}
                    Refresh
                  </button>
                </div>
              </div>
              <div className="mt-3 grid gap-2 rounded-2xl border border-white/10 bg-slate-950/60 p-3 lg:grid-cols-[1.4fr_repeat(5,minmax(0,1fr))]">
                <div className="relative min-w-0">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    value={contactSearchQuery}
                    onChange={(event) => setContactSearchQuery(event.target.value)}
                    placeholder="Search tickets"
                    className="min-h-10 w-full rounded-xl border border-white/10 bg-slate-900 px-9 text-xs font-semibold text-white outline-none placeholder:text-slate-500"
                  />
                </div>
                <select value={contactTypeFilter} onChange={(event) => setContactTypeFilter(event.target.value)} className="min-h-10 rounded-xl border border-white/10 bg-slate-900 px-3 text-xs font-bold text-slate-200 outline-none">
                  <option value="all">All Types</option>
                  {contactCategories.map((category) => <option key={category} value={category}>{category.replace('_', ' ').toUpperCase()}</option>)}
                </select>
                <select value={contactStatusFilter} onChange={(event) => setContactStatusFilter(event.target.value)} className="min-h-10 rounded-xl border border-white/10 bg-slate-900 px-3 text-xs font-bold text-slate-200 outline-none">
                  <option value="all">All Status</option>
                  <option value="open">Open</option>
                  <option value="archived">Archived</option>
                  <option value="closed">Closed</option>
                </select>
                <select value={contactSeverityFilter} onChange={(event) => setContactSeverityFilter(event.target.value)} className="min-h-10 rounded-xl border border-white/10 bg-slate-900 px-3 text-xs font-bold text-slate-200 outline-none">
                  <option value="all">All Severity</option>
                  {[1, 2, 3, 4, 5].map((level) => <option key={level} value={level}>Severity {level}</option>)}
                </select>
                <select value={contactSortDirection} onChange={(event) => setContactSortDirection(event.target.value as 'newest' | 'oldest')} className="min-h-10 rounded-xl border border-white/10 bg-slate-900 px-3 text-xs font-bold text-slate-200 outline-none">
                  <option value="newest">Newest</option>
                  <option value="oldest">Oldest</option>
                </select>
                <div className="grid gap-2 sm:grid-cols-2">
                  <input type="date" value={contactDateFrom} onChange={(event) => setContactDateFrom(event.target.value)} className="min-h-10 rounded-xl border border-white/10 bg-slate-900 px-3 text-xs font-bold text-slate-200 outline-none" aria-label="Date from" />
                  <input type="date" value={contactDateTo} onChange={(event) => setContactDateTo(event.target.value)} className="min-h-10 rounded-xl border border-white/10 bg-slate-900 px-3 text-xs font-bold text-slate-200 outline-none" aria-label="Date to" />
                </div>
              </div>
              <div className={`mt-3 grid max-h-[28rem] gap-2 overflow-y-auto pr-1 ${THEMED_SCROLLBAR_CLASS}`}>
                {visibleContactSubmissions.length === 0 ? (
                  <p className="rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-6 text-center text-sm text-slate-500">
                    No contact submissions match the current filters.
                  </p>
                ) : null}
                {visibleContactSubmissions.map((submission) => (
                  <article key={submission.id} className={`rounded-2xl border p-3 ${getTicketStatusClass(submission.status)}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-black text-white">{submission.category.replace('_', ' ').toUpperCase()}</p>
                          <span className="rounded-full border border-white/10 bg-slate-950 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-slate-300">
                            {submission.status}
                          </span>
                          <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-amber-100">
                            Severity {submission.severity}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {submission.username} - {formatModerationDate(submission.createdAt)}
                        </p>
                        <p className="mt-1 break-all text-xs text-slate-500">
                          UUID: {submission.userUid} - Email: {submission.email} - Premium: {submission.premium === true ? 'Yes' : submission.premium === false ? 'No' : 'Unknown'}
                        </p>
                        {submission.reportedUsername ? (
                          <p className="mt-1 text-xs font-semibold text-red-200">Reported: @{submission.reportedUsername}</p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        <select
                          value={submission.status}
                          onChange={(event) => void updateTicket(submission.id, { status: event.target.value })}
                          disabled={actionLoadingKey === `${submission.id}:ticket`}
                          className="min-h-9 rounded-xl border border-white/10 bg-slate-950 px-3 text-xs font-bold text-slate-200 outline-none"
                        >
                          <option value="open">Open</option>
                          <option value="closed">Closed</option>
                          <option value="archived">Archived</option>
                        </select>
                        <select
                          value={submission.severity}
                          onChange={(event) => void updateTicket(submission.id, { severity: Number(event.target.value) })}
                          disabled={actionLoadingKey === `${submission.id}:ticket`}
                          className="min-h-9 rounded-xl border border-white/10 bg-slate-950 px-3 text-xs font-bold text-slate-200 outline-none"
                        >
                          {[1, 2, 3, 4, 5].map((level) => <option key={level} value={level}>Severity {level}</option>)}
                        </select>
                        {submission.userUid !== 'Guest' ? (
                          <button
                            type="button"
                            onClick={() => setMessageTarget({ id: submission.userUid, label: submission.username })}
                            className="inline-flex min-h-9 items-center justify-center rounded-xl border border-white/10 bg-slate-950 px-3 text-xs font-bold text-slate-200 transition hover:bg-slate-800"
                          >
                            Message
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {messageTarget?.id === submission.userUid ? (
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          void runUserAction(submission.userUid, 'message', messageDraft);
                        }}
                        className="mt-3 flex gap-2"
                      >
                        <input
                          value={messageDraft}
                          onChange={(event) => setMessageDraft(event.target.value.slice(0, 1000))}
                          placeholder={`Message ${submission.username}`}
                          className="min-h-10 flex-1 rounded-xl border border-white/10 bg-slate-950 px-3 text-sm text-white outline-none placeholder:text-slate-500"
                        />
                        <button
                          type="submit"
                          disabled={!messageDraft.trim() || actionLoadingKey === `${submission.userUid}:message`}
                          className="inline-flex min-h-10 items-center justify-center rounded-xl bg-amber-300 px-4 text-sm font-bold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Send
                        </button>
                      </form>
                    ) : null}
                    <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-slate-300">{submission.message}</p>
                  </article>
                ))}
              </div>
            </section>
            ) : (
            <section className="mt-4 flex min-h-0 flex-col">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-300">Moderation team</p>
                <button
                  type="button"
                  onClick={() => void loadTeamMembers()}
                  disabled={loading}
                  className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-white/10 bg-slate-950 px-3 text-xs font-bold text-slate-200 transition hover:bg-slate-800 disabled:opacity-60"
                >
                  {loading ? <Loader2 size={14} className="animate-spin" /> : null}
                  Refresh
                </button>
              </div>
              <div className={`mt-3 grid max-h-[42rem] gap-2 overflow-y-auto pr-1 ${THEMED_SCROLLBAR_CLASS}`}>
                {teamMembers.length === 0 ? (
                  <p className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-6 text-center text-sm text-slate-500">
                    No team members loaded.
                  </p>
                ) : null}
                {teamMembers.map((member) => (
                  <article key={member.id} className="rounded-2xl border border-white/10 bg-slate-950/70 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-black text-white">{member.displayName}</p>
                          <span className={`rounded-full border px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-[0.12em] ${getRoleBadgeClass(member.role)}`}>
                            {member.role}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-xs text-slate-500">@{member.username} - Joined {formatModerationDate(member.createdAt)}</p>
                      </div>
                      {member.role !== 'admin' && canManageModerators ? (
                        <button
                          type="button"
                          onClick={() => updateUserRole(member.id, 'user')}
                          disabled={roleUpdatingUserId === member.id}
                          className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-red-300/30 bg-red-500/10 px-3 text-xs font-bold text-red-100 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {roleUpdatingUserId === member.id ? <Loader2 size={14} className="animate-spin" /> : null}
                          Remove Mod
                        </button>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            </section>
            )
          )}

          {status ? (
            <p className="mt-3 rounded-2xl border border-white/10 bg-slate-900/70 px-3 py-2 text-sm font-semibold text-slate-200">
              {status}
            </p>
          ) : null}
              </div>
            </section>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onMouseEnter={() => playUiSound('autocomplete-hover')}
        onFocus={() => playUiSound('autocomplete-hover')}
        onClick={() => {
          if (!hasModerationAccess) return;
          playUiSound('autocomplete-select');
          setIsOpen((value) => !value);
        }}
        aria-label="Open moderation menu"
        title="Moderation"
        className={variant === 'drawer'
          ? 'group relative flex min-h-12 w-full items-center justify-start gap-3 rounded-2xl border border-white/10 bg-slate-900/80 px-3 py-2 text-left text-sm font-bold text-slate-100 transition hover:border-amber-200/40 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-200'
          : variant === 'header-icon'
            ? 'group relative inline-flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-300/30 bg-slate-950 text-cyan-100 transition hover:border-cyan-200/70 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-200 sm:h-10 sm:w-10'
          : 'relative inline-flex min-h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/30 bg-slate-950 text-cyan-100 transition hover:border-cyan-200/70 hover:bg-slate-900'}
      >
        {variant === 'drawer' ? (
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-slate-950 text-slate-200">
            {role === 'admin' ? <ShieldCheck size={18} /> : <ShieldAlert size={18} />}
          </span>
        ) : role === 'admin' ? <ShieldCheck size={18} /> : <ShieldAlert size={18} />}
        {variant === 'drawer' ? <span>Moderation</span> : null}
      </button>
    </div>
  );
}
