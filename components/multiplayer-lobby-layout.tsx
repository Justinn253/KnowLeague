'use client';

import { type CSSProperties, FormEvent, ReactNode, useEffect, useState } from 'react';
import { ArrowLeft, Check, Copy, Eye, EyeOff, Play, RefreshCw, Users } from 'lucide-react';
import Link from 'next/link';
import { GameInfoMenu } from '@/components/game-info-menu';
import { playUiSound } from '@/lib/ui-sounds';

type MultiplayerLobbyShellProps = {
  children: ReactNode;
  maxWidthClassName?: string;
};

type MultiplayerLobbyHeaderProps = {
  title: string;
  subtitle: ReactNode;
  statusLabel: ReactNode;
  infoSteps: string[];
  onBack: () => void;
  backLabel?: string;
  actions?: ReactNode;
};

type MultiplayerCreateJoinPanelProps = {
  title: string;
  joinCode: string;
  onJoinCodeChange: (value: string) => void;
  onJoin: (event: FormEvent<HTMLFormElement>) => void;
  onCreate: () => void;
  canCreate: boolean;
  canJoin?: boolean;
  busy?: boolean;
  reconnectPrompt?: ReactNode;
  soloHref?: string;
  soloLabel?: string;
  soloDescription?: string;
  publicLobbyContent: ReactNode;
  onRefreshPublicLobbies: () => void;
};

const PUBLIC_LOBBY_REFRESH_COOLDOWN_SECONDS = 5;

type MultiplayerPublicLobbyButtonProps = {
  hostName: string;
  hostNameStyle?: CSSProperties;
  playerCount: number;
  maxPlayers: number;
  disabled?: boolean;
  details?: ReactNode;
  badges?: ReactNode;
  onClick: () => void;
};

type MultiplayerLobbyCodeStripProps = {
  code: string;
  revealed: boolean;
  copied: boolean;
  onToggleReveal: () => void;
  onCopy: () => void;
};

type MultiplayerLobbyPanelProps = {
  title: string;
  children: ReactNode;
  headerAction?: ReactNode;
  trailing?: ReactNode;
  lockedHint?: ReactNode;
};

type MultiplayerVisibilityToggleProps = {
  enabled: boolean;
  disabled?: boolean;
  onToggle: () => void;
};

type MultiplayerLobbyDescriptionInputProps = {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
};

type MultiplayerStartGameControlProps = {
  disabled: boolean;
  onStart: () => void;
  hint: ReactNode;
  label?: string;
};

type MultiplayerModifierToggleProps = {
  name: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
};

export function MultiplayerLobbyShell({ children, maxWidthClassName = 'max-w-6xl' }: MultiplayerLobbyShellProps) {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className={`mx-auto flex min-h-screen w-full ${maxWidthClassName} flex-col gap-5 px-6 py-6 lg:px-12`}>
        {children}
      </section>
    </main>
  );
}

export function MultiplayerLobbyHeader({
  title,
  subtitle,
  statusLabel,
  infoSteps,
  onBack,
  backLabel = 'Back',
  actions,
}: MultiplayerLobbyHeaderProps) {
  return (
    <header className="relative z-30 flex flex-col gap-4 rounded-3xl border border-white/10 bg-slate-900/80 p-4 shadow-glow backdrop-blur-xl lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label={backLabel}
          className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-slate-950/80 text-slate-100 transition hover:bg-slate-900"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Multiplayer Game</p>
          <h1 className="text-xl font-semibold text-white">{title}</h1>
          <p className="mt-1 text-xs text-slate-400">{subtitle}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {actions}
        <GameInfoMenu title={title} steps={infoSteps} />
        <div className="inline-flex min-h-12 items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/80 px-4 text-sm font-semibold text-slate-200">
          <Users size={16} className="text-amber-300" />
          {statusLabel}
        </div>
      </div>
    </header>
  );
}

export function MultiplayerLobbyCard({ children }: { children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-4 shadow-glow backdrop-blur-xl">
      {children}
    </section>
  );
}

export function MultiplayerCreateJoinPanel({
  title,
  joinCode,
  onJoinCodeChange,
  onJoin,
  onCreate,
  canCreate,
  canJoin = joinCode.trim().length === 6,
  busy = false,
  reconnectPrompt,
  soloHref,
  soloLabel = 'Play Solo',
  soloDescription = 'Start a personal run',
  publicLobbyContent,
  onRefreshPublicLobbies,
}: MultiplayerCreateJoinPanelProps) {
  const [refreshCooldownSeconds, setRefreshCooldownSeconds] = useState(0);

  useEffect(() => {
    if (refreshCooldownSeconds <= 0) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setRefreshCooldownSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);

    return () => window.clearTimeout(timeoutId);
  }, [refreshCooldownSeconds]);

  const refreshButtonLabel = refreshCooldownSeconds > 0
    ? `Refresh in ${refreshCooldownSeconds}s`
    : 'Refresh public lobbies';

  return (
    <div className="mx-auto max-w-4xl py-1">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-300">Create or Join</p>
        <h2 className="mt-3 text-3xl font-bold text-white">{title}</h2>
      </div>

      {soloHref ? (
        <div className="mt-7 flex justify-center">
          <Link
            href={soloHref}
            onClick={() => playUiSound('random-select')}
            className="group relative inline-flex min-h-14 w-full max-w-xl items-center justify-center overflow-hidden rounded-2xl border border-emerald-200/40 bg-gradient-to-r from-emerald-300 via-cyan-300 to-sky-400 px-6 text-slate-950 shadow-lg shadow-cyan-950/20 transition-[transform,border-color,box-shadow,filter] duration-300 ease-out hover:-translate-y-0.5 hover:border-cyan-50/75 hover:shadow-cyan-900/30 hover:ring-2 hover:ring-inset hover:ring-cyan-50/45 hover:brightness-105 focus:outline-none focus:ring-2 focus:ring-emerald-100"
          >
            <span className="absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-white/25 opacity-0 blur-xl transition-[left,opacity] duration-700 ease-out group-hover:left-full group-hover:opacity-100" />
            <span className="relative grid text-center">
              <span className="text-sm font-black uppercase tracking-[0.14em]">{soloLabel}</span>
              <span className="text-xs font-semibold text-slate-800/75">{soloDescription}</span>
            </span>
          </Link>
        </div>
      ) : null}

      <div className="mt-8 grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-end">
        <button
          type="button"
          onClick={() => {
            playUiSound('random-select');
            onCreate();
          }}
          disabled={busy || !canCreate}
          className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-amber-300 px-6 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Create Lobby
        </button>
        <span className="hidden pb-3 text-sm font-semibold text-slate-500 lg:block">OR</span>
        <form
          onSubmit={(event) => {
            if (canJoin && !busy) {
              playUiSound('random-select');
            }
            onJoin(event);
          }}
          className="grid gap-2"
        >
          <label htmlFor="join-code" className="text-xs uppercase tracking-[0.18em] text-slate-500">Join code</label>
          <div className="flex gap-2">
            <input
              id="join-code"
              value={joinCode}
              onChange={(event) => onJoinCodeChange(event.target.value.toUpperCase().slice(0, 6))}
              maxLength={6}
              autoComplete="off"
              placeholder="ABC123"
              className="min-h-12 flex-1 rounded-2xl border border-white/10 bg-slate-950 px-4 text-sm uppercase tracking-[0.16em] text-white outline-none placeholder:text-slate-600 focus:border-white/20"
            />
            <button
              type="submit"
              disabled={busy || !canJoin}
              className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-violet-700 px-5 text-sm font-semibold text-white transition hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Join
            </button>
          </div>
        </form>
      </div>

      <div className="mt-8 border-t border-white/10 pt-6">
        {reconnectPrompt}
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">Public Lobbies</p>
            <p className="mt-1 text-sm text-slate-400">Join a public lobby.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (busy || refreshCooldownSeconds > 0) {
                return;
              }

              playUiSound('random-select');
              setRefreshCooldownSeconds(PUBLIC_LOBBY_REFRESH_COOLDOWN_SECONDS);
              onRefreshPublicLobbies();
            }}
            disabled={busy || refreshCooldownSeconds > 0}
            title={refreshButtonLabel}
            aria-label={refreshButtonLabel}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-3 text-xs font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw size={17} />
            {refreshCooldownSeconds > 0 ? <span>{refreshCooldownSeconds}s</span> : null}
          </button>
        </div>
        <div className="mt-4 grid gap-2">
          {publicLobbyContent}
        </div>
      </div>
    </div>
  );
}

export function MultiplayerPublicLobbyButton({
  hostName,
  hostNameStyle,
  playerCount,
  maxPlayers,
  disabled,
  details,
  badges,
  onClick,
}: MultiplayerPublicLobbyButtonProps) {
  return (
    <button
      type="button"
      onMouseEnter={() => playUiSound('autocomplete-hover')}
      onFocus={() => playUiSound('autocomplete-hover')}
      onClick={() => {
        playUiSound('random-select');
        onClick();
      }}
      disabled={disabled}
      className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-left transition hover:border-amber-300/40 hover:bg-slate-950 disabled:opacity-60"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-white"><span style={hostNameStyle}>{hostName}</span>&apos;s lobby</span>
        {details ? <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">{details}</span> : null}
        {badges ? <span className="mt-2 flex flex-wrap gap-1.5">{badges}</span> : null}
      </span>
      <span className="shrink-0 text-xs font-semibold text-slate-300">{playerCount}/{maxPlayers}</span>
    </button>
  );
}

export function MultiplayerPublicLobbyEmpty() {
  return (
    <p className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-4 text-sm text-slate-500">
      No public lobbies are waiting.
    </p>
  );
}

export function MultiplayerLobbyCodeStrip({
  code,
  revealed,
  copied,
  onToggleReveal,
  onCopy,
}: MultiplayerLobbyCodeStripProps) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-white/10 bg-slate-950/70 p-4">
      <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Lobby code</span>
      <span className="font-mono text-lg font-semibold tracking-[0.24em] text-white">{revealed ? code : '******'}</span>
      <button
        type="button"
        onClick={onToggleReveal}
        aria-label={revealed ? 'Hide lobby code' : 'Reveal lobby code'}
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-slate-900 text-slate-200 hover:bg-slate-800"
      >
        {revealed ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
      <button
        type="button"
        onClick={onCopy}
        aria-label="Copy lobby invite"
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-slate-900 text-slate-200 hover:bg-slate-800"
      >
        {copied ? <Check size={16} className="text-emerald-300" /> : <Copy size={16} />}
      </button>
    </div>
  );
}

export function MultiplayerLobbyGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)]">
      {children}
    </div>
  );
}

export function MultiplayerLobbyPanel({
  title,
  children,
  headerAction,
  trailing,
  lockedHint,
}: MultiplayerLobbyPanelProps) {
  return (
    <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{title}</p>
          {headerAction}
        </div>
        {trailing}
      </div>
      {children}
      {lockedHint ? <p className="mt-4 text-xs text-slate-500">{lockedHint}</p> : null}
    </section>
  );
}

export function MultiplayerVisibilityToggle({ enabled, disabled, onToggle }: MultiplayerVisibilityToggleProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      className={`mt-4 flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${enabled ? 'border-emerald-400/40 bg-emerald-400/10' : 'border-white/10 bg-slate-900/70'} disabled:opacity-60`}
    >
      <span className="block text-sm font-semibold text-white">Public lobby</span>
      <span className={`inline-flex h-6 w-11 items-center rounded-full p-1 transition ${enabled ? 'bg-emerald-500' : 'bg-slate-700'}`}>
        <span className={`h-4 w-4 rounded-full bg-white transition ${enabled ? 'translate-x-5' : ''}`} />
      </span>
    </button>
  );
}

export function MultiplayerLobbyDescriptionInput({
  value,
  disabled,
  onChange,
}: MultiplayerLobbyDescriptionInputProps) {
  return (
    <label className="mt-3 grid gap-2 rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3">
      <span className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-white">Lobby description</span>
        <span className="text-xs font-semibold text-slate-500">{value.length}/75</span>
      </span>
      <input
        type="text"
        value={value}
        maxLength={75}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value.slice(0, 75))}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur();
          }
        }}
        placeholder="None set"
        className="min-h-11 rounded-xl border border-white/10 bg-slate-950 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-white/20 disabled:cursor-not-allowed disabled:opacity-60"
      />
    </label>
  );
}

export function MultiplayerStartGameControl({
  disabled,
  onStart,
  hint,
  label = 'Start Game',
}: MultiplayerStartGameControlProps) {
  return (
    <div className="flex flex-col items-center gap-3 py-1">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          playUiSound('random-select');
          onStart();
        }}
        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-violet-700 px-8 text-sm font-semibold text-white transition hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Play size={17} /> {label}
      </button>
      <p className="text-xs text-slate-500">{hint}</p>
    </div>
  );
}

export function MultiplayerLobbyMessage({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p className="mt-5 rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-center text-sm text-slate-300">
      {children}
    </p>
  );
}

export function MultiplayerModifierToggle({
  name,
  description,
  checked,
  disabled,
  onToggle,
}: MultiplayerModifierToggleProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onMouseEnter={() => playUiSound('autocomplete-hover')}
      onFocus={() => playUiSound('autocomplete-hover')}
      onClick={() => {
        playUiSound('autocomplete-select');
        onToggle();
      }}
      className={`flex items-start justify-between gap-3 rounded-2xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-65 ${checked ? 'border-violet-400/60 bg-violet-500/10' : 'border-white/10 bg-slate-900/70 hover:bg-slate-900'}`}
    >
      <span>
        <span className="block text-sm font-bold text-white">{name}</span>
        <span className="mt-1 block text-xs leading-5 text-slate-400">{description}</span>
      </span>
      <span className={`mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition ${checked ? 'bg-violet-500' : 'bg-slate-700'}`}>
        <span className={`h-4 w-4 rounded-full bg-white transition ${checked ? 'translate-x-4' : ''}`} />
      </span>
    </button>
  );
}
