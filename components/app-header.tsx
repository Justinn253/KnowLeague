'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  Activity,
  BarChart3,
  ChevronDown,
  CircleDollarSign,
  FileText,
  Gamepad2,
  Layers,
  LogIn,
  LogOut,
  Menu,
  Package,
  Search,
  Trophy,
  TrendingUp,
  UserCircle,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { ContactUsWidget } from '@/components/contact-us-widget';
import { DiscordMark } from '@/components/discord-mark';
import { GameIconImage } from '@/components/game-asset-image';
import { HeaderHoverNote } from '@/components/header-hover-note';
import { SoundSettingsMenu } from '@/components/sound-settings-menu';
import { GAME_NAVIGATION_ITEMS, type Accent, type GameMode } from '@/lib/game-navigation';
import type { AppRole } from '@/lib/moderation';
import { getPublicProfileHref, shouldOpenProfileInNewTab } from '@/lib/profile-navigation';
import { playUiSound } from '@/lib/ui-sounds';

const ModerationWidget = dynamic(
  () => import('@/components/moderation-widget').then((module) => module.ModerationWidget),
  { ssr: false },
);
const FriendsWidget = dynamic(
  () => import('@/components/friends-widget').then((module) => module.FriendsWidget),
  { ssr: false },
);

type AppHeaderProps = {
  isLoggedIn: boolean;
  profileAvatarUrl: string | null;
  profileUsername: string | null;
  profileAway: boolean;
  pendingFriendRequests: number;
  moderationRole: Extract<AppRole, 'moderator' | 'admin'> | null;
  onPendingFriendRequestsChange: (count: number) => void;
  onLogOut: () => void;
};

type HeaderMenuTone = 'games' | 'lav' | 'riftbound' | 'neutral';

const gameAccentClasses: Record<Accent, string> = {
  gold: 'border-amber-200/30 bg-amber-300 text-slate-950',
  cyan: 'border-cyan-200/30 bg-cyan-300 text-slate-950',
  rose: 'border-rose-200/30 bg-rose-400 text-white',
  violet: 'border-violet-200/30 bg-violet-400 text-white',
  emerald: 'border-emerald-200/30 bg-emerald-300 text-slate-950',
  sky: 'border-sky-200/30 bg-sky-300 text-slate-950',
};

const gameModeLabels: Record<GameMode, string> = {
  solo: 'Solo',
  multiplayer: 'Multiplayer',
  hybrid: 'Solo/Multiplayer',
};

const DISCORD_INVITE_URL = 'https://discord.gg/vgMHq2KCsK';
const masteryMasterGame = GAME_NAVIGATION_ITEMS.find((game) => game.title === 'Mastery Master');
const gamesWithoutMasteryMaster = GAME_NAVIGATION_ITEMS.filter((game) => game !== masteryMasterGame);
const gamesForHeader = masteryMasterGame
  ? [...gamesWithoutMasteryMaster.slice(0, 2), masteryMasterGame, ...gamesWithoutMasteryMaster.slice(2)]
  : GAME_NAVIGATION_ITEMS;

const menuItemClass = 'group flex min-h-11 w-full items-center gap-3 rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-left text-sm text-slate-100 transition hover:border-amber-200/40 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-amber-200';
const toneClasses: Record<HeaderMenuTone, string> = {
  games: 'border-amber-300/30 text-amber-100 hover:border-amber-200/70 hover:bg-amber-300/10',
  lav: 'border-cyan-300/30 text-cyan-100 hover:border-cyan-200/70 hover:bg-cyan-300/10',
  riftbound: 'border-violet-300/30 text-violet-100 hover:border-violet-200/70 hover:bg-violet-300/10',
  neutral: 'border-white/15 text-slate-100 hover:border-amber-200/50 hover:bg-slate-900',
};

function MenuItemIcon({ icon: Icon, className = '' }: { icon: LucideIcon; className?: string }) {
  return (
    <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 ${className || 'bg-slate-950 text-slate-300'}`}>
      <Icon size={16} />
    </span>
  );
}

function HeaderMenuLink({
  href,
  label,
  description,
  icon: Icon,
  iconClassName,
  onSelect,
}: {
  href: string;
  label: string;
  description?: string;
  icon: LucideIcon;
  iconClassName?: string;
  onSelect?: () => void;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      onMouseEnter={() => playUiSound('autocomplete-hover')}
      onFocus={() => playUiSound('autocomplete-hover')}
      onClick={() => {
        playUiSound('autocomplete-select');
        onSelect?.();
      }}
      className={menuItemClass}
    >
      <MenuItemIcon icon={Icon} className={iconClassName} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold">{label}</span>
        {description ? <span className="mt-0.5 block truncate text-xs text-slate-500">{description}</span> : null}
      </span>
      <ArrowRight size={15} className="shrink-0 text-slate-600 transition group-hover:translate-x-1 group-hover:text-amber-200" />
    </Link>
  );
}

function HeaderMenuButton({
  label,
  description,
  icon: Icon,
  iconClassName,
  onClick,
  disabled = false,
  trailing,
}: {
  label: string;
  description?: string;
  icon: LucideIcon;
  iconClassName?: string;
  onClick?: () => void;
  disabled?: boolean;
  trailing?: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onMouseEnter={() => playUiSound('autocomplete-hover')}
      onFocus={() => playUiSound('autocomplete-hover')}
      onClick={() => {
        if (disabled) return;
        playUiSound('autocomplete-select');
        onClick?.();
      }}
      className={`${menuItemClass} disabled:cursor-not-allowed disabled:opacity-60`}
    >
      <MenuItemIcon icon={Icon} className={iconClassName} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold">{label}</span>
        {description ? <span className="mt-0.5 block truncate text-xs text-slate-500">{description}</span> : null}
      </span>
      {trailing}
    </button>
  );
}

function HeaderIconButton({
  label,
  icon,
  onClick,
  disabled = false,
  className = '',
  text,
  textAlwaysVisible = false,
  hoverNote,
}: {
  label: string;
  icon: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  text?: string;
  textAlwaysVisible?: boolean;
  hoverNote?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={hoverNote ? undefined : label}
      disabled={disabled}
      onMouseEnter={() => playUiSound('autocomplete-hover')}
      onFocus={() => playUiSound('autocomplete-hover')}
      onClick={() => {
        if (disabled) return;
        playUiSound('autocomplete-select');
        onClick?.();
      }}
      className={`inline-flex h-9 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-white/15 bg-slate-950/90 text-slate-200 transition hover:border-amber-200/50 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-200 disabled:cursor-not-allowed disabled:opacity-45 md:h-10 ${text ? (textAlwaysVisible ? 'w-auto px-3' : 'w-9 px-0 min-[1680px]:w-auto min-[1680px]:px-3') : 'w-9 md:w-10'} ${hoverNote ? 'group relative' : ''} ${className}`}
    >
      {icon}
      {text ? <span className={`${textAlwaysVisible ? '' : 'hidden min-[1680px]:inline'} text-xs font-black uppercase tracking-[0.12em]`}>{text}</span> : null}
      {hoverNote ? <HeaderHoverNote>{hoverNote}</HeaderHoverNote> : null}
    </button>
  );
}

function LogoutControl({ onLogOut, mobile = false }: { onLogOut: () => void; mobile?: boolean }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;

    const closeWhenOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', closeWhenOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeWhenOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <HeaderIconButton
        label="Log out"
        text="Log out"
        textAlwaysVisible={mobile}
        icon={<LogOut size={17} />}
        onClick={() => setOpen((value) => !value)}
        className={`${mobile ? 'w-full justify-start' : ''} border-red-300/35 !bg-red-950/40 text-red-100 hover:border-red-200/70 hover:!bg-red-500/20`}
      />
      {open ? (
        <div role="dialog" aria-label="Confirm logout" className="absolute right-0 top-full z-[120] mt-2 w-64 rounded-2xl border border-white/10 bg-slate-950 p-3">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-red-200">Log out</p>
          <p className="mt-2 text-sm leading-5 text-slate-300">Are you sure you want to log out?</p>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onMouseEnter={() => playUiSound('autocomplete-hover')}
              onFocus={() => playUiSound('autocomplete-hover')}
              onClick={() => {
                playUiSound('autocomplete-select');
                setOpen(false);
              }}
              className="min-h-10 rounded-xl border border-white/10 bg-slate-900 px-3 text-xs font-bold text-slate-300 transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onMouseEnter={() => playUiSound('autocomplete-hover')}
              onFocus={() => playUiSound('autocomplete-hover')}
              onClick={() => {
                playUiSound('autocomplete-select');
                setOpen(false);
                onLogOut();
              }}
              className="min-h-10 rounded-xl border border-red-300/40 bg-red-500/15 px-3 text-xs font-bold text-red-100 transition hover:border-red-200/70 hover:bg-red-500/25 focus:outline-none focus:ring-2 focus:ring-red-200"
            >
              Log out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ProfileAction({
  profileAvatarUrl,
  profileUsername,
  profileAway,
  pendingFriendRequests,
  mobile = false,
}: {
  profileAvatarUrl: string | null;
  profileUsername: string | null;
  profileAway: boolean;
  pendingFriendRequests: number;
  mobile?: boolean;
}) {
  return (
    <Link
      href={profileUsername ? getPublicProfileHref(profileUsername) : '/profile'}
      prefetch={false}
      target={shouldOpenProfileInNewTab() ? '_blank' : undefined}
      rel={shouldOpenProfileInNewTab() ? 'noopener noreferrer' : undefined}
      onMouseEnter={() => playUiSound('autocomplete-hover')}
      onFocus={() => playUiSound('autocomplete-hover')}
      onClick={() => playUiSound('autocomplete-select')}
      aria-label="Open profile"
      title="Profile"
      className={mobile
        ? 'relative inline-flex min-h-11 w-full items-center justify-start gap-3 rounded-xl border border-white/15 bg-slate-950/90 px-3 text-xs font-black uppercase tracking-[0.12em] text-slate-100 transition hover:border-amber-200/50 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-200'
        : 'relative inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-slate-950/90 text-slate-100 transition hover:border-amber-200/50 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-200 min-[1680px]:h-10 min-[1680px]:w-auto min-[1680px]:gap-2 min-[1680px]:px-3'}
    >
      <span className="relative inline-flex h-7 w-7 items-center justify-center">
        {profileAvatarUrl ? (
          <span className="inline-flex h-7 w-7 rounded-lg border border-white/10 bg-cover bg-center" style={{ backgroundImage: `url(${profileAvatarUrl})` }} />
        ) : <UserCircle size={17} />}
        <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-slate-950 ${profileAway ? 'bg-amber-300' : 'bg-emerald-400'}`} />
      </span>
      <span className={`${mobile ? '' : 'hidden min-[1680px]:inline'} text-xs font-black uppercase tracking-[0.12em]`}>Profile</span>
      {pendingFriendRequests > 0 ? (
        <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-red-500 px-1 py-0.5 text-[0.6rem] font-black leading-none text-white">
          {pendingFriendRequests > 99 ? '99+' : pendingFriendRequests}
        </span>
      ) : null}
    </Link>
  );
}

function LoginAction({ mobile = false }: { mobile?: boolean }) {
  return (
    <Link
      href="/login"
      prefetch={false}
      aria-label="Log in"
      title="Log in"
      onMouseEnter={() => playUiSound('autocomplete-hover')}
      onFocus={() => playUiSound('autocomplete-hover')}
      onClick={() => playUiSound('autocomplete-select')}
      className={mobile
        ? 'inline-flex min-h-11 w-full items-center justify-start gap-3 rounded-xl border border-amber-300/40 bg-amber-300 px-3 text-xs font-black uppercase tracking-[0.12em] text-slate-950 transition hover:bg-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-200'
        : 'inline-flex h-9 w-9 items-center justify-center rounded-xl border border-amber-300/40 bg-amber-300 text-slate-950 transition hover:bg-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-200 min-[1680px]:h-10 min-[1680px]:w-auto min-[1680px]:gap-2 min-[1680px]:px-3'}
    >
      <LogIn size={17} />
      <span className={`${mobile ? '' : 'hidden min-[1680px]:inline'} text-xs font-black uppercase tracking-[0.12em]`}>Log in</span>
    </Link>
  );
}

function HeaderDropdown({
  label,
  compactLabel,
  icon: Icon,
  iconNode,
  tone,
  children,
  align = 'left',
  wide = false,
  headerAction,
}: {
  label: string;
  compactLabel?: string;
  icon: LucideIcon;
  iconNode?: ReactNode;
  tone: HeaderMenuTone;
  children: (closeMenu: () => void) => ReactNode;
  align?: 'left' | 'right';
  wide?: boolean;
  headerAction?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const closeMenu = () => setOpen(false);

  useEffect(() => {
    if (!open) return undefined;

    const closeWhenOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) closeMenu();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu();
    };

    document.addEventListener('pointerdown', closeWhenOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeWhenOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative ${open ? 'z-[100]' : 'z-0'}`}>
      <button
        type="button"
        onClick={() => {
          playUiSound('autocomplete-select');
          setOpen((current) => !current);
        }}
        onMouseEnter={() => playUiSound('autocomplete-hover')}
        onFocus={() => playUiSound('autocomplete-hover')}
        aria-label={label}
        title={label}
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`inline-flex h-9 items-center justify-center gap-2 rounded-xl border px-2.5 text-xs font-black uppercase tracking-[0.12em] outline-none transition focus:ring-2 focus:ring-amber-200 xl:h-9 xl:px-2 min-[1680px]:h-10 min-[1680px]:px-3 ${toneClasses[tone]} ${open ? 'bg-slate-900 ring-1 ring-amber-200/50' : 'bg-slate-950/90'}`}
      >
        {iconNode ?? <Icon size={16} />}
        {compactLabel ? (
          <>
            <span className="hidden xl:inline min-[1680px]:hidden">{compactLabel}</span>
            <span className="hidden min-[1680px]:inline">{label}</span>
          </>
        ) : <span className="hidden xl:inline">{label}</span>}
        <ChevronDown size={14} className={`hidden xl:block transition ${open ? 'rotate-180 text-amber-200' : 'text-slate-400'}`} />
      </button>
      <div
        id={menuId}
        role="menu"
        aria-hidden={!open}
        className={`absolute top-full z-50 mt-2 ${wide ? 'w-[min(44rem,calc(100vw-1rem))]' : 'w-[min(22rem,calc(100vw-1rem))]'} rounded-2xl border border-white/10 bg-slate-950 p-3 transition-[opacity,transform] duration-100 ease-out sm:p-4 ${align === 'right' ? 'right-0' : 'left-0'} ${open ? 'translate-y-0 scale-100 opacity-100' : 'pointer-events-none -translate-y-1 scale-[0.98] opacity-0'}`}
      >
        <div className="mb-3 flex items-center justify-between gap-3 border-b border-white/10 pb-3">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">{label}</p>
          {headerAction}
        </div>
        {children(closeMenu)}
      </div>
    </div>
  );
}

function GamesMenu() {
  return (
    <HeaderDropdown
      label="Games"
      icon={Gamepad2}
      tone="games"
      wide
      headerAction={(
        <Link
          href="/games"
          prefetch={false}
          onMouseEnter={() => playUiSound('autocomplete-hover')}
          onFocus={() => playUiSound('autocomplete-hover')}
          onClick={() => playUiSound('autocomplete-select')}
          className="inline-flex min-h-7 items-center rounded-lg border border-amber-300/30 bg-amber-300/10 px-2 text-[0.65rem] font-black uppercase tracking-[0.12em] text-amber-100 transition hover:border-amber-200/70 hover:bg-amber-300/20 focus:outline-none focus:ring-2 focus:ring-amber-200"
        >
          View All
        </Link>
      )}
    >
      {(closeMenu) => (
        <div className="grid grid-cols-2 gap-2">
          {gamesForHeader.map((game) => {
            const GameIcon = game.gameIcon;
            return (
              <HeaderMenuLink
                key={game.href}
                href={game.href}
                label={game.title}
                description={gameModeLabels[game.mode]}
                icon={GameIcon}
                iconClassName={gameAccentClasses[game.accent]}
                onSelect={closeMenu}
              />
            );
          })}
        </div>
      )}
    </HeaderDropdown>
  );
}

function LavMenu() {
  return (
    <HeaderDropdown
      label="League Account Viewer"
      compactLabel="LAV"
      icon={BarChart3}
      iconNode={<GameIconImage src="/Icons/LoL-Symbol.png" alt="" width={18} height={18} className="h-[18px] w-[18px] object-contain" />}
      tone="lav"
    >
      {(closeMenu) => (
        <div className="grid gap-2">
          <HeaderMenuLink
            href="/riot-account-viewer"
            label="Search account"
            description="League Account Viewer"
            icon={Search}
            iconClassName="border-cyan-200/25 bg-cyan-300 text-slate-950"
            onSelect={closeMenu}
          />
          <HeaderMenuLink
            href="/riot-account-viewer/popular"
            label="Most Popular Accounts"
            description="Top searched accounts"
            icon={TrendingUp}
            iconClassName="border-amber-200/25 bg-amber-300 text-slate-950"
            onSelect={closeMenu}
          />
          <HeaderMenuLink
            href="/riot-account-viewer/patch-notes"
            label="Patch Notes"
            description="Latest League updates"
            icon={FileText}
            iconClassName="border-cyan-200/25 bg-cyan-300 text-slate-950"
            onSelect={closeMenu}
          />
          {masteryMasterGame ? (
            <HeaderMenuLink
              href={masteryMasterGame.href}
              label={masteryMasterGame.title}
              description="Mastery challenge"
              icon={masteryMasterGame.gameIcon ?? Trophy}
              iconClassName="border-violet-200/25 bg-violet-400 text-white"
              onSelect={closeMenu}
            />
          ) : null}
          <HeaderMenuButton
            label="Auto-fill linked account"
            description="Coming soon"
            icon={UserCog}
            disabled
            trailing={<span className="shrink-0 text-[0.65rem] font-black uppercase tracking-[0.12em] text-slate-600">Soon</span>}
          />
        </div>
      )}
    </HeaderDropdown>
  );
}

function RiftboundMenu() {
  return (
    <HeaderDropdown
      label="Riftbound"
      icon={Layers}
      iconNode={<GameIconImage src="/Icons/riftbound.png" alt="" width={18} height={18} className="h-[18px] w-[18px] object-contain" />}
      tone="riftbound"
    >
      {(closeMenu) => (
        <div className="grid gap-2">
          <HeaderMenuLink
            href="/riftbound/community"
            label="Community Hub"
            description="Browse community collections and decks"
            icon={Users}
            iconClassName="border-violet-200/25 bg-violet-400 text-white"
            onSelect={closeMenu}
          />
          <HeaderMenuLink
            href="/riftbound/profile"
            label="Profile"
            description="Your Riftbound identity"
            icon={UserCircle}
            iconClassName="border-violet-200/25 bg-violet-400 text-white"
            onSelect={closeMenu}
          />
          <HeaderMenuLink
            href="/riftbound/inventory"
            label="Inventory"
            description="Cards and collection value"
            icon={Package}
            iconClassName="border-violet-200/25 bg-violet-400 text-white"
            onSelect={closeMenu}
          />
        </div>
      )}
    </HeaderDropdown>
  );
}

function MobileMenuDisclosure({
  label,
  icon: Icon,
  iconNode,
  tone,
  open,
  onClick,
  children,
}: {
  label: string;
  icon: LucideIcon;
  iconNode?: ReactNode;
  tone: HeaderMenuTone;
  open: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        onMouseEnter={() => playUiSound('autocomplete-hover')}
        onFocus={() => playUiSound('autocomplete-hover')}
        onClick={() => {
          playUiSound('autocomplete-select');
          onClick();
        }}
        aria-expanded={open}
        className={`inline-flex min-h-11 w-full items-center justify-start gap-3 rounded-xl border px-3 text-xs font-black uppercase tracking-[0.12em] outline-none transition focus:ring-2 focus:ring-amber-200 ${toneClasses[tone]} ${open ? 'bg-slate-900 ring-1 ring-amber-200/50' : 'bg-slate-950/90'}`}
      >
        {iconNode ?? <Icon size={16} />}
        <span>{label}</span>
        <ChevronDown size={14} className={`ml-auto transition ${open ? 'rotate-180 text-amber-200' : 'text-slate-400'}`} />
      </button>
      {open ? <div className="mt-2 grid gap-2 pl-2">{children}</div> : null}
    </div>
  );
}

function FriendsHeaderButton({ pendingFriendRequests }: { pendingFriendRequests: number }) {
  return (
    <button
      type="button"
      onMouseEnter={() => playUiSound('autocomplete-hover')}
      onFocus={() => playUiSound('autocomplete-hover')}
      onClick={() => {
        playUiSound('autocomplete-select');
        window.dispatchEvent(new Event('knowleague:toggle-friends'));
      }}
      aria-label="Friends"
      title="Friends"
      data-friends-trigger="true"
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-slate-950/90 text-slate-100 transition hover:border-amber-200/50 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-200"
    >
      <Users size={18} />
      {pendingFriendRequests > 0 ? (
        <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-red-500 px-1 py-0.5 text-[0.6rem] font-black leading-none text-white">
          {pendingFriendRequests > 99 ? '99+' : pendingFriendRequests}
        </span>
      ) : null}
    </button>
  );
}

function MobileHeaderMenu({
  moderationRole,
}: Pick<AppHeaderProps, 'moderationRole'>) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [openSection, setOpenSection] = useState<'games' | 'lav' | 'riftbound' | null>(null);
  const [openMiscPanel, setOpenMiscPanel] = useState<'sound' | 'help' | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;

    const closeWhenOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setOpenSection(null);
        setOpenMiscPanel(null);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        setOpenSection(null);
        setOpenMiscPanel(null);
      }
    };

    document.addEventListener('pointerdown', closeWhenOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeWhenOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const closeMenu = () => {
    setOpen(false);
    setOpenSection(null);
    setOpenMiscPanel(null);
  };

  return (
    <div ref={rootRef} className="relative xl:hidden">
      <button
        type="button"
        onMouseEnter={() => playUiSound('autocomplete-hover')}
        onFocus={() => playUiSound('autocomplete-hover')}
        onClick={() => {
          playUiSound('autocomplete-select');
          setOpen((value) => !value);
        }}
        aria-label="Open navigation menu"
        title="Navigation"
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex h-9 w-9 items-center justify-center gap-2 rounded-xl border border-white/15 bg-slate-950/90 px-0 text-slate-100 transition hover:border-amber-200/50 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-200 md:w-auto md:px-3"
      >
        <Menu size={18} />
        <span className="hidden text-xs font-black uppercase tracking-[0.12em] md:inline">Navigation</span>
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="KnowLeague menu"
          className="absolute left-0 top-full z-[105] mt-2 max-h-[calc(100dvh-4.5rem)] w-[min(24rem,calc(100vw-1rem))] overflow-y-auto rounded-2xl border border-white/10 bg-slate-950 p-3"
        >
          <div className="mb-3 border-b border-white/10 pb-3">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">Menu</p>
          </div>

          <section className="grid gap-2" aria-label="Navigation">
            <p className="px-1 text-[0.68rem] font-black uppercase tracking-[0.18em] text-slate-500">Navigation</p>
            <MobileMenuDisclosure
              label="Games"
              icon={Gamepad2}
              tone="games"
              open={openSection === 'games'}
              onClick={() => setOpenSection((current) => current === 'games' ? null : 'games')}
            >
              <HeaderMenuLink
                href="/games"
                label="View All"
                description="All KnowLeague games"
                icon={Gamepad2}
                iconClassName="border-amber-200/25 bg-amber-300 text-slate-950"
                onSelect={closeMenu}
              />
              {gamesForHeader.map((game) => {
                const GameIcon = game.gameIcon;
                return (
                  <HeaderMenuLink
                    key={game.href}
                    href={game.href}
                    label={game.title}
                    description={gameModeLabels[game.mode]}
                    icon={GameIcon}
                    iconClassName={gameAccentClasses[game.accent]}
                    onSelect={closeMenu}
                  />
                );
              })}
            </MobileMenuDisclosure>
            <MobileMenuDisclosure
              label="League Account Viewer"
              icon={BarChart3}
              iconNode={<GameIconImage src="/Icons/LoL-Symbol.png" alt="" width={18} height={18} className="h-[18px] w-[18px] object-contain" />}
              tone="lav"
              open={openSection === 'lav'}
              onClick={() => setOpenSection((current) => current === 'lav' ? null : 'lav')}
            >
              <HeaderMenuLink
                href="/riot-account-viewer"
                label="Search account"
                description="League Account Viewer"
                icon={Search}
                iconClassName="border-cyan-200/25 bg-cyan-300 text-slate-950"
                onSelect={closeMenu}
              />
              <HeaderMenuLink
                href="/riot-account-viewer/popular"
                label="Most Popular Accounts"
                description="Top searched accounts"
                icon={TrendingUp}
                iconClassName="border-amber-200/25 bg-amber-300 text-slate-950"
                onSelect={closeMenu}
              />
              <HeaderMenuLink
                href="/riot-account-viewer/patch-notes"
                label="Patch Notes"
                description="Latest League updates"
                icon={FileText}
                iconClassName="border-cyan-200/25 bg-cyan-300 text-slate-950"
                onSelect={closeMenu}
              />
              {masteryMasterGame ? (
                <HeaderMenuLink
                  href={masteryMasterGame.href}
                  label={masteryMasterGame.title}
                  description="Mastery challenge"
                  icon={masteryMasterGame.gameIcon ?? Trophy}
                  iconClassName="border-violet-200/25 bg-violet-400 text-white"
                  onSelect={closeMenu}
                />
              ) : null}
              <HeaderMenuButton
                label="Auto-fill linked account"
                description="Coming soon"
                icon={UserCog}
                disabled
                trailing={<span className="shrink-0 text-[0.65rem] font-black uppercase tracking-[0.12em] text-slate-600">Soon</span>}
              />
            </MobileMenuDisclosure>
            <MobileMenuDisclosure
              label="Riftbound"
              icon={Layers}
              iconNode={<GameIconImage src="/Icons/riftbound.png" alt="" width={18} height={18} className="h-[18px] w-[18px] object-contain" />}
              tone="riftbound"
              open={openSection === 'riftbound'}
              onClick={() => setOpenSection((current) => current === 'riftbound' ? null : 'riftbound')}
            >
              <HeaderMenuLink
                href="/riftbound/community"
                label="Community Hub"
                description="Browse community collections and decks"
                icon={Users}
                iconClassName="border-violet-200/25 bg-violet-400 text-white"
                onSelect={closeMenu}
              />
              <HeaderMenuLink
                href="/riftbound/profile"
                label="Profile"
                description="Your Riftbound identity"
                icon={UserCircle}
                iconClassName="border-violet-200/25 bg-violet-400 text-white"
                onSelect={closeMenu}
              />
              <HeaderMenuLink
                href="/riftbound/inventory"
                label="Inventory"
                description="Cards and collection value"
                icon={Package}
                iconClassName="border-violet-200/25 bg-violet-400 text-white"
                onSelect={closeMenu}
              />
            </MobileMenuDisclosure>
          </section>

          <section className="mt-4 border-t border-white/10 pt-3" aria-label="Miscellaneous">
            <p className="px-1 text-[0.68rem] font-black uppercase tracking-[0.18em] text-slate-500">Miscellaneous</p>
            <div className="mt-2 flex flex-wrap items-start gap-2">
              {moderationRole ? (
                <>
                  <HeaderIconButton
                    label="Staff change log"
                    icon={<FileText size={17} />}
                    onClick={() => {
                      closeMenu();
                      router.push('/staff/changelog');
                    }}
                    className="border-amber-300/30 text-amber-100 hover:border-amber-200/70 hover:bg-amber-300/10"
                  />
                  <HeaderIconButton
                    label="API metrics"
                    icon={<Activity size={17} />}
                    onClick={() => {
                      closeMenu();
                      router.push('/staff/api-metrics');
                    }}
                    className="border-cyan-300/30 text-cyan-100 hover:border-cyan-200/70 hover:bg-cyan-300/10"
                  />
                  <ModerationWidget role={moderationRole} variant="header-icon" />
                </>
              ) : null}
              <SoundSettingsMenu
                variant="navigation"
                isOpen={openMiscPanel === 'sound'}
                onOpenChange={(nextOpen) => setOpenMiscPanel(nextOpen ? 'sound' : null)}
              />
              <ContactUsWidget
                variant="navigation"
                isOpen={openMiscPanel === 'help'}
                onOpenChange={(nextOpen) => setOpenMiscPanel(nextOpen ? 'help' : null)}
              />
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

export function AppHeader({
  isLoggedIn,
  profileAvatarUrl,
  profileUsername,
  profileAway,
  pendingFriendRequests,
  moderationRole,
  onPendingFriendRequestsChange,
  onLogOut,
}: AppHeaderProps) {
  const router = useRouter();

  return (
    <header className="sticky top-0 z-[90] border-b border-white/10 bg-slate-950/95 text-slate-100 backdrop-blur">
      <div className="relative flex h-14 w-full items-center justify-between px-2 xl:grid xl:min-h-14 xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] xl:gap-2 xl:px-3 min-[1680px]:gap-4 min-[1680px]:px-6">
        <div className="flex items-center gap-1 xl:hidden">
          <MobileHeaderMenu
            moderationRole={moderationRole}
          />
          {isLoggedIn ? <FriendsHeaderButton pendingFriendRequests={pendingFriendRequests} /> : null}
        </div>

        <nav aria-label="Primary navigation" className="hidden min-w-0 items-center justify-start gap-1 xl:flex xl:gap-1 min-[1680px]:gap-2">
          <GamesMenu />
          <LavMenu />
          <RiftboundMenu />
        </nav>

        <Link
          href="/"
          prefetch={false}
          aria-label="KnowLeague home"
          onMouseEnter={() => playUiSound('autocomplete-hover')}
          onFocus={() => playUiSound('autocomplete-hover')}
          onClick={() => playUiSound('autocomplete-select')}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-2xl font-black tracking-tight text-amber-100 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 xl:static xl:translate-x-0 xl:translate-y-0 xl:justify-self-center xl:text-xl min-[1680px]:text-2xl"
        >
          <span className="inline-flex items-center gap-1.5">
            KnowLeague
            <span className="relative top-px rounded border border-amber-300/40 bg-amber-300/10 px-1 py-0.5 text-[0.5rem] font-black uppercase leading-none tracking-[0.14em] text-amber-200">BETA</span>
          </span>
        </Link>

        <nav aria-label="Account and support navigation" className="flex min-w-0 items-center justify-end gap-1 xl:gap-1 min-[1680px]:gap-2">
          <div className="hidden items-center gap-1 xl:flex xl:gap-1 min-[1680px]:gap-2">
            <SoundSettingsMenu variant="header-icon" />
            <ContactUsWidget variant="header-icon" />
            {moderationRole ? (
              <HeaderIconButton
                label="Staff change log"
                icon={<FileText size={17} />}
                onClick={() => router.push('/staff/changelog')}
                className="border-amber-300/30 text-amber-100 hover:border-amber-200/70 hover:bg-amber-300/10"
              />
            ) : null}
            {moderationRole ? (
              <HeaderIconButton
                label="API metrics"
                icon={<Activity size={17} />}
                onClick={() => router.push('/staff/api-metrics')}
                className="border-cyan-300/30 text-cyan-100 hover:border-cyan-200/70 hover:bg-cyan-300/10"
              />
            ) : null}
            {moderationRole ? <ModerationWidget role={moderationRole} variant="header-icon" /> : null}
          </div>

          <span aria-hidden="true" className="mx-1 hidden h-6 border-l border-white/20 xl:block min-[1680px]:mx-2" />

          <div className="hidden items-center gap-1 xl:flex xl:gap-1 min-[1680px]:gap-2">
            <HeaderIconButton
              label="Join Discord server"
              icon={<DiscordMark className="h-[18px] w-[18px]" />}
              hoverNote="Join Discord server"
              onClick={() => {
                window.open(DISCORD_INVITE_URL, '_blank', 'noopener,noreferrer');
              }}
              className="border-white/15 bg-slate-950/90 text-slate-100 hover:border-amber-200/50 hover:bg-slate-900"
            />
            <HeaderIconButton
              label="Support KnowLeague"
              icon={<CircleDollarSign size={17} />}
              disabled
              className="border-white/10 text-slate-500 hover:border-white/20 hover:bg-slate-900"
            />
          </div>

          <span aria-hidden="true" className="mx-1 hidden h-6 border-l border-white/20 xl:block min-[1680px]:mx-2" />

          {isLoggedIn ? (
            <FriendsWidget onPendingRequestCountChange={onPendingFriendRequestsChange} variant="responsive" />
          ) : null}
          <div className="flex items-center gap-1 xl:gap-1 min-[1680px]:gap-2">
            {isLoggedIn
              ? <ProfileAction profileAvatarUrl={profileAvatarUrl} profileUsername={profileUsername} profileAway={profileAway} pendingFriendRequests={pendingFriendRequests} />
              : <LoginAction />}
            {isLoggedIn ? <LogoutControl onLogOut={onLogOut} /> : null}
          </div>
        </nav>
      </div>
    </header>
  );
}
