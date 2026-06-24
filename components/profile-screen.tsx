'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Gamepad2,
  KeyRound,
  Link as LinkIcon,
  LogOut,
  Save,
  UserPlus,
  Users,
  Search,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getOptionalSupabaseClient } from '@/lib/supabaseClient';
import { forfeitStoredMultiplayerSessions } from '@/lib/multiplayer-client-session';

type ProfileRecord = {
  username: string;
  display_name: string;
  about_me: string;
  friends_count: number;
  friend_requests_open: boolean;
  discord_username: string | null;
  riot_account_name: string | null;
  created_at: string;
};

type ProfileTab = 'profile' | 'stats' | 'account';
type IncomingRequest = {
  id: string;
  requester: {
    id: string;
    username: string;
    displayName: string;
    online: boolean;
  };
};
type FriendCandidate = {
  id: string;
  username: string;
  displayName: string;
  friendRequestsOpen: boolean;
  relationship: 'friend' | 'pending' | 'none';
};

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,16}$/;

type ProfileScreenProps = {
  presentation?: 'page' | 'overlay';
  onClose?: () => void;
};

function getLinkedValue(value?: string | null) {
  return value?.trim() || 'Not linked';
}

function formatProfileDate(value?: string | null) {
  if (!value) {
    return 'Unknown';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

function openPublicProfileOverlay(username: string) {
  window.dispatchEvent(new CustomEvent('knowleague:open-profile', { detail: { username } }));
}

function ConnectionCard({
  title,
  value,
  description,
  actionLabel,
}: {
  title: string;
  value: string;
  description: string;
  actionLabel: string;
}) {
  const isLinked = value !== 'Not linked';

  return (
    <article className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</p>
          <p className="mt-2 text-lg font-bold text-white">{value}</p>
        </div>
        <span
          className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border ${
            isLinked ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200' : 'border-white/10 bg-slate-900 text-slate-500'
          }`}
        >
          {isLinked ? <Check size={17} /> : <LinkIcon size={17} />}
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-400">{description}</p>
      <button
        type="button"
        disabled
        className="mt-4 inline-flex min-h-10 items-center justify-center rounded-xl border border-white/10 bg-slate-900 px-4 text-sm font-semibold text-slate-400 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {actionLabel}
      </button>
    </article>
  );
}

export function ProfileScreen({ presentation = 'page', onClose }: ProfileScreenProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ProfileTab>('profile');
  const [userId, setUserId] = useState('');
  const [email, setEmail] = useState('');
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [usernameDraft, setUsernameDraft] = useState('');
  const [aboutDraft, setAboutDraft] = useState('');
  const [friendRequestsOpen, setFriendRequestsOpen] = useState(true);
  const [incomingRequests, setIncomingRequests] = useState<IncomingRequest[]>([]);
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [addFriendOpen, setAddFriendOpen] = useState(false);
  const [friendSearchQuery, setFriendSearchQuery] = useState('');
  const [friendSearchResults, setFriendSearchResults] = useState<FriendCandidate[]>([]);
  const [friendSearchContext, setFriendSearchContext] = useState<{ candidate: FriendCandidate; x: number; y: number } | null>(null);
  const addFriendPanelRef = useRef<HTMLDivElement | null>(null);
  const usernameInputRef = useRef<HTMLInputElement | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const supabase = getOptionalSupabaseClient();
    if (!supabase) {
      setMessage('Supabase auth is not configured.');
      setBusy(false);
      return;
    }

    supabase.auth.getUser().then(async ({ data, error }) => {
      if (error || !data.user) {
        if (presentation === 'overlay') {
          onClose?.();
        } else {
          router.replace('/login');
        }
        return;
      }

      setUserId(data.user.id);
      setEmail(data.user.email ?? '');
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('username, display_name, about_me, friends_count, friend_requests_open, discord_username, riot_account_name, created_at')
        .eq('id', data.user.id)
        .maybeSingle<ProfileRecord>();

      if (profileError) {
        setMessage(profileError.message);
      } else {
        setProfile(profileData);
        setUsernameDraft(profileData?.username ?? '');
        setAboutDraft(profileData?.about_me ?? '');
        setFriendRequestsOpen(profileData?.friend_requests_open ?? true);
      }

      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session) {
        fetch('/api/friends', {
          headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
        })
          .then((response) => response.json())
          .then((friendData) => setIncomingRequests(friendData.incomingRequests ?? []))
          .catch(() => undefined);
      }

      setBusy(false);
    });
  }, [onClose, presentation, router]);

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const supabase = getOptionalSupabaseClient();
    const cleanUsername = usernameDraft.trim().toLowerCase();

    if (!supabase || !userId) {
      return;
    }

    if (!USERNAME_PATTERN.test(cleanUsername)) {
      setMessage('Username must be 3-16 characters and use only letters, numbers, or underscores.');
      return;
    }

    setSaving(true);
    setMessage('');

    const { data, error } = await supabase
      .from('profiles')
      .update({
        username: cleanUsername,
        display_name: cleanUsername,
        about_me: aboutDraft.trim().slice(0, 500),
        friend_requests_open: friendRequestsOpen,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .select('username, display_name, about_me, friends_count, friend_requests_open, discord_username, riot_account_name, created_at')
      .single<ProfileRecord>();

    setSaving(false);

    if (error) {
      setMessage(error.message.includes('duplicate') ? 'This username is already taken.' : error.message);
      return;
    }

    setProfile(data);
    setUsernameDraft(data.username);
    setAboutDraft(data.about_me);
    setMessage('Profile updated.');
  };

  const respondToRequest = async (requestId: string, action: 'accept' | 'decline') => {
    const supabase = getOptionalSupabaseClient();
    const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
    if (!data.session) {
      return;
    }

    setMessage('');
    const response = await fetch(`/api/friends/requests/${requestId}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action }),
    });
    const body = await response.json();
    if (!response.ok) {
      setMessage(body.error ?? 'Unable to respond to friend request.');
      return;
    }

    setIncomingRequests((requests) => requests.filter((request) => request.id !== requestId));
    setMessage('');
    if (incomingRequests.length <= 1) {
      setRequestsOpen(false);
    }
  };

  useEffect(() => {
    if (!addFriendOpen || friendSearchQuery.trim().length < 3) {
      setFriendSearchResults([]);
      setFriendSearchContext(null);
      return undefined;
    }

    const timeout = window.setTimeout(async () => {
      const supabase = getOptionalSupabaseClient();
      const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
      if (!data.session) {
        return;
      }

      fetch(`/api/friends/search?q=${encodeURIComponent(friendSearchQuery.trim())}`, {
        headers: { Authorization: `Bearer ${data.session.access_token}` },
      })
        .then((response) => response.json())
        .then((body) => setFriendSearchResults(body.results ?? []))
        .catch(() => undefined);
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [addFriendOpen, friendSearchQuery]);

  useEffect(() => {
    const closeContext = () => setFriendSearchContext(null);
    document.addEventListener('click', closeContext);
    return () => document.removeEventListener('click', closeContext);
  }, []);

  const sendFriendRequest = async (targetUserId: string) => {
    const supabase = getOptionalSupabaseClient();
    const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
    if (!data.session) {
      setMessage('Login required.');
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
    setMessage(response.ok ? 'Friend request sent.' : body.error ?? 'Unable to send friend request.');
  };

  const sendPasswordReset = async () => {
    const supabase = getOptionalSupabaseClient();
    if (!supabase || !email) {
      return;
    }

    setMessage('');
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setMessage(error ? error.message : 'Password reset email sent.');
  };

  const signOut = async () => {
    const supabase = getOptionalSupabaseClient();
    await forfeitStoredMultiplayerSessions();
    await supabase?.auth.signOut();
    router.push('/login');
  };

  return (
    <main className={presentation === 'overlay' ? 'text-slate-100' : 'min-h-screen bg-slate-950 text-slate-100'}>
      <section className={presentation === 'overlay'
        ? 'mx-auto flex w-full max-w-5xl flex-col px-6 py-8'
        : 'mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-6 py-10'}
      >
        <header className={`mb-5 flex min-h-12 items-center justify-between gap-3 ${presentation === 'overlay' ? 'pr-14' : ''}`}>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              aria-label="Back to game hub"
              className={`${presentation === 'overlay' ? 'hidden' : 'inline-flex'} h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-slate-950/80 text-slate-100 transition hover:bg-slate-900`}
            >
              <ArrowLeft size={20} />
            </Link>
            <div>
              <h1 className="text-xl font-semibold text-white">Profile</h1>
            </div>
          </div>
          {!busy ? (
            <div className="relative flex flex-wrap items-center justify-end gap-2">
              <div className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/80 px-4 text-sm font-semibold text-slate-300">
                <Users size={16} className="text-amber-300" />
                {profile?.friends_count ?? 0} friends
              </div>
              {incomingRequests.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setRequestsOpen((value) => !value)}
                  className="relative inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-amber-300/40 bg-amber-300/10 px-4 text-sm font-bold text-amber-100 transition hover:bg-amber-300/20"
                >
                  Requests
                  <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">
                    {incomingRequests.length > 99 ? '99+' : incomingRequests.length}
                  </span>
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setAddFriendOpen((value) => !value)}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-slate-950 px-4 text-sm font-bold text-slate-100 transition hover:bg-slate-900"
              >
                <UserPlus size={17} />
                Add Friend
              </button>
              {requestsOpen ? (
                <div className="absolute right-0 top-14 z-30 grid max-h-72 w-80 gap-2 overflow-y-auto rounded-2xl border border-white/10 bg-slate-950 p-3 shadow-2xl">
                  {incomingRequests.map((request) => (
                    <div key={request.id} className="grid gap-2 rounded-xl bg-slate-900 p-3">
                      <p className="text-sm font-semibold text-white">{request.requester.displayName}</p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => openPublicProfileOverlay(request.requester.username)}
                          className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-slate-200 transition hover:bg-slate-800 active:scale-[0.98]"
                        >
                          View
                        </button>
                        <button type="button" onClick={() => respondToRequest(request.id, 'accept')} className="rounded-xl bg-emerald-400 px-3 py-2 text-xs font-bold text-slate-950 transition hover:bg-emerald-300 active:scale-[0.98]">Accept</button>
                        <button type="button" onClick={() => respondToRequest(request.id, 'decline')} className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-100 transition hover:bg-red-500/20 active:scale-[0.98]">Decline</button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              {addFriendOpen ? (
                <div ref={addFriendPanelRef} className="absolute right-0 top-14 z-30 w-96 rounded-2xl border border-white/10 bg-slate-950 p-3 shadow-2xl">
                  <div className="relative">
                    <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      value={friendSearchQuery}
                      onChange={(event) => setFriendSearchQuery(event.target.value)}
                      placeholder="Search users"
                      autoComplete="off"
                      className="min-h-11 w-full rounded-2xl border border-white/10 bg-slate-900 px-10 pr-11 text-sm text-white outline-none placeholder:text-slate-500"
                    />
                    {friendSearchQuery ? (
                      <button
                        type="button"
                        onClick={() => {
                          setFriendSearchQuery('');
                          setFriendSearchResults([]);
                          setFriendSearchContext(null);
                        }}
                        aria-label="Clear friend search"
                        className="absolute right-3 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-white"
                      >
                        <X size={15} />
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-3 grid max-h-64 gap-2 overflow-y-auto">
                    {friendSearchResults.map((candidate) => (
                      <button
                        key={candidate.id}
                        type="button"
                        onContextMenu={(event) => {
                          event.preventDefault();
                          const panelRect = addFriendPanelRef.current?.getBoundingClientRect();
                          setFriendSearchContext({
                            candidate,
                            x: event.clientX - (panelRect?.left ?? 0),
                            y: event.clientY - (panelRect?.top ?? 0),
                          });
                        }}
                        onClick={() => {
                          if (candidate.friendRequestsOpen && candidate.relationship === 'none') {
                            void sendFriendRequest(candidate.id);
                          }
                        }}
                        className={`flex min-h-11 items-center justify-between rounded-xl bg-slate-900 px-3 text-left text-sm transition hover:bg-slate-800 ${
                          !candidate.friendRequestsOpen || candidate.relationship !== 'none' ? 'cursor-default opacity-70' : ''
                        }`}
                      >
                        <span className="font-semibold text-white">{candidate.displayName}</span>
                        <span className="text-xs text-slate-400">{!candidate.friendRequestsOpen ? 'Requests closed' : candidate.relationship === 'pending' ? 'Pending' : candidate.relationship === 'friend' ? 'Friend' : 'Add'}</span>
                      </button>
                    ))}
                  </div>
                  {friendSearchContext ? (
                    <div
                      className="absolute z-[70] min-w-40 rounded-2xl border border-white/10 bg-slate-950 p-2"
                      style={{ left: friendSearchContext.x, top: friendSearchContext.y }}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          openPublicProfileOverlay(friendSearchContext.candidate.username);
                          setFriendSearchContext(null);
                        }}
                        className="block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-100 transition hover:bg-slate-900"
                      >
                        View Profile
                      </button>
                      {friendSearchContext.candidate.relationship === 'none' && friendSearchContext.candidate.friendRequestsOpen ? (
                        <button
                          type="button"
                          onClick={() => {
                            void sendFriendRequest(friendSearchContext.candidate.id);
                            setFriendSearchContext(null);
                          }}
                          className="block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-amber-100 transition hover:bg-amber-300/10"
                        >
                          Add Friend
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </header>

        <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-glow backdrop-blur-xl">
          {busy ? (
            <p className="text-sm font-semibold text-slate-300">Loading profile...</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-slate-950/70 p-1">
                {[
                  ['profile', 'Profile'],
                  ['stats', 'Stats'],
                  ['account', 'Account Info'],
                ].map(([tab, label]) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => {
                      setActiveTab(tab as ProfileTab);
                      setMessage('');
                    }}
                    className={`min-h-10 rounded-xl px-3 text-sm font-semibold transition ${
                      activeTab === tab ? 'bg-amber-300 text-slate-950' : 'text-slate-300 hover:bg-slate-900'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>


              {activeTab === 'profile' ? (
                <form onSubmit={saveProfile} className="mt-6 grid gap-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="grid gap-2 rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Username</span>
                      <input
                        ref={usernameInputRef}
                        value={usernameDraft}
                        onChange={(event) => setUsernameDraft(event.target.value.slice(0, 16))}
                        autoComplete="username"
                        maxLength={16}
                        className="min-h-11 rounded-xl border border-white/10 bg-slate-900 px-3 text-sm font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-white/20 focus:ring-1 focus:ring-white/15"
                      />
                      {usernameDraft.length >= 16 ? (
                        <span className="text-xs font-semibold text-amber-200">16/16</span>
                      ) : null}
                    </label>

                    <div className="grid gap-2 rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Account Created</p>
                      <p className="flex min-h-11 items-center rounded-xl border border-white/10 bg-slate-900 px-3 text-sm font-semibold text-slate-200">
                        {formatProfileDate(profile?.created_at)}
                      </p>
                    </div>
                  </div>

                  <label className="grid gap-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">About Me</span>
                    <textarea
                      value={aboutDraft}
                      onChange={(event) => setAboutDraft(event.target.value.slice(0, 500))}
                      rows={6}
                      maxLength={500}
                      placeholder="Tell other players a little about yourself."
                      className="min-h-36 resize-none rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-slate-600 focus:border-white/20 focus:ring-1 focus:ring-white/15"
                    />
                    <span className="text-xs text-slate-500">{aboutDraft.length}/500</span>
                  </label>

                  <div className="grid gap-4 md:grid-cols-2">
                    <ConnectionCard
                      title="Discord"
                      value={getLinkedValue(profile?.discord_username)}
                      description="Discord linking will support friend discovery, messaging, and social identity later."
                      actionLabel="Link Discord Soon"
                    />
                    <ConnectionCard
                      title="League Account"
                      value={getLinkedValue(profile?.riot_account_name)}
                      description="Riot linking will connect to the future masteries page and account-specific League data."
                      actionLabel="Link Riot Soon"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-amber-300 px-5 text-sm font-bold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Save size={17} />
                    {saving ? 'Saving' : 'Save Profile'}
                  </button>
                </form>
              ) : null}

              {activeTab === 'stats' ? (
                <div className="mt-6 rounded-2xl border border-white/10 bg-slate-950/80 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Stats</p>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    Player stats will appear here as profile history is expanded.
                  </p>
                </div>
              ) : null}

              {activeTab === 'account' ? (
                <div className="mt-6 grid gap-4">
                  <div className="rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Email</p>
                    <p className="mt-2 break-all text-sm font-semibold text-slate-200">{email}</p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">User ID</p>
                    <p className="mt-2 break-all font-mono text-sm text-slate-200">{userId}</p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Friend Request Preferences</p>
                    <form onSubmit={saveProfile} className="mt-3 grid gap-3">
                      <label className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-900 px-3 py-2">
                        <span className="text-sm font-semibold text-slate-200">
                          {friendRequestsOpen ? 'Open to friend requests' : 'Friend requests closed'}
                        </span>
                        <input
                          type="checkbox"
                          checked={friendRequestsOpen}
                          onChange={(event) => setFriendRequestsOpen(event.target.checked)}
                          className="h-5 w-5 accent-amber-300"
                        />
                      </label>
                      <button
                        type="submit"
                        disabled={saving}
                        className="inline-flex min-h-10 items-center justify-center rounded-xl bg-amber-300 px-4 text-sm font-bold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {saving ? 'Saving' : 'Save Preference'}
                      </button>
                    </form>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Messaging Preferences</p>
                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      Messaging preferences will be available when direct messaging is implemented.
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={sendPasswordReset}
                      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-slate-950 px-5 text-sm font-bold text-white transition hover:bg-slate-900"
                    >
                      <KeyRound size={18} />
                      Reset Password
                    </button>
                    <button
                      type="button"
                      onClick={signOut}
                      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-red-400/30 bg-red-500/10 px-5 text-sm font-bold text-red-100 transition hover:bg-red-500/20"
                    >
                      <LogOut size={18} />
                      Logout
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          )}

          {message.trim() ? (
            <p className="mt-5 rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm font-semibold text-slate-200">
              {message}
            </p>
          ) : null}
        </section>
      </section>
    </main>
  );
}
