'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, BarChart3, Menu, Package, UserCircle, Users, X } from 'lucide-react';
import { ContactUsWidget } from '@/components/contact-us-widget';
import { SoundSettingsMenu } from '@/components/sound-settings-menu';
import { GAME_NAVIGATION_ITEMS } from '@/lib/game-navigation';
import type { AppRole } from '@/lib/moderation';

const ModerationWidget = dynamic(
  () => import('@/components/moderation-widget').then((module) => module.ModerationWidget),
  { ssr: false },
);

type AppNavigationDrawerProps = {
  isLoggedIn: boolean;
  profileHref: string;
  profileLabel: string;
  profileAvatarUrl: string | null;
  pendingFriendRequests: number;
  moderationRole: Extract<AppRole, 'moderator' | 'admin'> | null;
  onOpenProfile: () => void;
};

const gameAccentClasses = {
  gold: 'border-amber-200/30 bg-amber-300 text-slate-950',
  cyan: 'border-cyan-200/30 bg-cyan-300 text-slate-950',
  rose: 'border-rose-200/30 bg-rose-400 text-white',
  violet: 'border-violet-200/30 bg-violet-400 text-white',
  emerald: 'border-emerald-200/30 bg-emerald-300 text-slate-950',
  sky: 'border-sky-200/30 bg-sky-300 text-slate-950',
} as const;

const menuItemClass = 'group flex min-h-12 w-full items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/80 px-3 py-2 text-left text-slate-100 transition hover:border-amber-200/40 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-200';
const gameMenuItemClass = 'group flex min-h-11 w-full items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/80 px-2.5 py-1.5 text-left text-slate-100 transition hover:border-amber-200/40 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-200';
const gameModeLabels = {
  solo: 'Solo',
  multiplayer: 'Multiplayer',
  hybrid: 'Solo/Multiplayer',
} as const;

export function AppNavigationDrawer({
  isLoggedIn,
  profileHref,
  profileLabel,
  profileAvatarUrl,
  pendingFriendRequests,
  moderationRole,
  onOpenProfile,
}: AppNavigationDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);

  const closeDrawer = () => setIsOpen(false);

  return (
    <>
      <button
        type="button"
        aria-label="Open navigation"
        aria-controls="app-navigation-drawer"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(true)}
        className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-slate-900/80 text-slate-100 transition hover:-translate-y-0.5 hover:border-amber-200/50 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-200"
      >
        <Menu size={19} />
      </button>

      {isOpen ? (
        <div
          className="fixed inset-0 z-[100] bg-slate-950/75 p-3 backdrop-blur-sm"
          onPointerDown={closeDrawer}
        >
          <aside
            id="app-navigation-drawer"
            aria-label="App navigation"
            role="dialog"
            aria-modal="true"
            className="relative ml-auto flex h-full w-[min(36rem,calc(100vw-1.5rem))] animate-[slide-in_180ms_ease-out] flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-950"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="border-b border-white/10 p-4 sm:p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-300">KnowLeague</p>
                  <h2 className="mt-2 text-3xl font-black tracking-tight text-white">Navigation</h2>
                </div>
                <button
                  type="button"
                  aria-label="Close navigation"
                  onClick={closeDrawer}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-slate-900 text-slate-200 transition hover:border-white/20 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-200"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <nav aria-label="Primary navigation" className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Games</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {GAME_NAVIGATION_ITEMS.map((game) => {
                  const GameIcon = game.gameIcon;
                  return (
                    <Link
                      key={game.href}
                      href={game.href}
                      onClick={closeDrawer}
                      className={gameMenuItemClass}
                    >
                      <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${gameAccentClasses[game.accent]}`}>
                        <GameIcon size={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-black">{game.title}</span>
                        <span className="mt-0.5 block truncate text-[0.68rem] text-slate-500">{gameModeLabels[game.mode]}</span>
                      </span>
                    </Link>
                  );
                })}
              </div>

              <div className="mt-4 border-t border-white/10 pt-4">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Tools</p>
                <div className="mt-2 grid gap-2">
                  <Link href="/riot-account-viewer" onClick={closeDrawer} className={menuItemClass}>
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-200/25 bg-amber-300 text-slate-950">
                      <BarChart3 size={18} />
                    </span>
                    <span className="min-w-0 flex-1 text-sm font-black">League Account Viewer</span>
                    <ArrowRight size={16} className="shrink-0 text-slate-600 transition group-hover:translate-x-1 group-hover:text-amber-200" />
                  </Link>
                </div>
              </div>

              <div className="mt-4 border-t border-white/10 pt-4">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Riftbound</p>
                <div className="mt-2 grid gap-2">
                  <Link href="/riftbound/community" onClick={closeDrawer} className={menuItemClass}>
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-200/25 bg-amber-300 text-slate-950">
                      <Users size={18} />
                    </span>
                    <span className="min-w-0 flex-1 text-sm font-black">Community</span>
                    <ArrowRight size={16} className="shrink-0 text-slate-600 transition group-hover:translate-x-1 group-hover:text-amber-200" />
                  </Link>
                  <div className="grid grid-cols-2 gap-2">
                    <Link href="/riftbound/profile" onClick={closeDrawer} className={gameMenuItemClass}>
                      <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${gameAccentClasses.gold}`}>
                        <UserCircle size={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-black">Riftbound Profile</span>
                        <span className="mt-0.5 block truncate text-[0.68rem] text-slate-500">Profile</span>
                      </span>
                    </Link>
                    <Link href="/riftbound/inventory" onClick={closeDrawer} className={gameMenuItemClass}>
                      <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${gameAccentClasses.gold}`}>
                        <Package size={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-black">Inventory</span>
                        <span className="mt-0.5 block truncate text-[0.68rem] text-slate-500">Cards</span>
                      </span>
                    </Link>
                  </div>
                </div>
              </div>

              <div className="mt-4 border-t border-white/10 pt-4">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Other</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <ContactUsWidget variant="drawer" />
                  {moderationRole ? (
                    <ModerationWidget role={moderationRole} variant="drawer" />
                  ) : null}
                </div>
              </div>
            </nav>

            <div className="flex items-center gap-2 border-t border-white/10 p-4 sm:p-5">
              {isLoggedIn ? (
                <button
                  type="button"
                  onClick={() => {
                    closeDrawer();
                    onOpenProfile();
                  }}
                  className={`${menuItemClass} min-w-0 flex-1`}
                >
                  {profileAvatarUrl ? (
                    <span
                      className="inline-flex h-9 w-9 shrink-0 rounded-xl border border-white/10 bg-slate-900 bg-cover bg-center"
                      style={{ backgroundImage: `url(${profileAvatarUrl})` }}
                    />
                  ) : (
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-slate-900 text-slate-200">
                      <UserCircle size={18} />
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm font-black">Profile - {profileLabel}</span>
                  {pendingFriendRequests > 0 ? (
                    <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
                      {pendingFriendRequests > 99 ? '99+' : pendingFriendRequests}
                    </span>
                  ) : null}
                </button>
              ) : (
                <Link href={profileHref} onClick={closeDrawer} className={`${menuItemClass} min-w-0 flex-1`}>
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-slate-900 text-slate-200">
                    <UserCircle size={18} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-black">{profileLabel}</span>
                </Link>
              )}
              <SoundSettingsMenu variant="drawer-icon" />
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
