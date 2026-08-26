'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle, MousePointer2, Volume2, VolumeX, UserPlus } from 'lucide-react';
import { HeaderHoverNote } from '@/components/header-hover-note';
import type { Session } from '@supabase/supabase-js';
import { subscribeToAuthSession } from '@/lib/auth-session-client';
import { getProfileBootstrap } from '@/lib/profile-bootstrap-client';
import { getOptionalSupabaseClient } from '@/lib/supabaseClient';
import { DEFAULT_UI_SOUND_SETTINGS, playUiSound, readUiSoundSettings, saveUiSoundSettings, type UiSoundSettings } from '@/lib/ui-sounds';

function ToggleSwitch({ enabled }: { enabled: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition ${
        enabled ? 'border-red-400/40 bg-red-500' : 'border-white/10 bg-slate-700'
      }`}
    >
      <span
        className={`h-5 w-5 rounded-full bg-white  transition-transform ${
          enabled ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </span>
  );
}

type SoundSettingsMenuProps = {
  variant?: 'floating' | 'drawer' | 'mobile' | 'drawer-icon' | 'header-icon' | 'navigation';
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
};

export function SoundSettingsMenu({ variant = 'floating', isOpen, onOpenChange }: SoundSettingsMenuProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = isOpen ?? uncontrolledOpen;
  const [settings, setSettings] = useState<UiSoundSettings>(() => DEFAULT_UI_SOUND_SETTINGS);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const hydratingRef = useRef(false);
  const saveTimeoutRef = useRef<number | null>(null);
  const setMenuOpen = useCallback((nextOpen: boolean) => {
    if (onOpenChange) {
      onOpenChange(nextOpen);
      return;
    }

    setUncontrolledOpen(nextOpen);
  }, [onOpenChange]);

  const saveAccountSettings = (nextSettings: UiSoundSettings) => {
    const token = sessionRef.current?.access_token;
    if (!token || hydratingRef.current) {
      return;
    }

    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = window.setTimeout(() => {
      saveTimeoutRef.current = null;
      void fetch('/api/profile/sound-settings', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ settings: nextSettings }),
      }).catch(() => undefined);
    }, 250);
  };

  useEffect(() => {
    setSettings(readUiSoundSettings());

    const syncSettings = () => setSettings(readUiSoundSettings());
    window.addEventListener('knowleague:sound-settings-changed', syncSettings);
    return () => {
      window.removeEventListener('knowleague:sound-settings-changed', syncSettings);
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const supabase = getOptionalSupabaseClient();
    if (!supabase) {
      return undefined;
    }

    const loadAccountSettings = async (session: Session | null) => {
      sessionRef.current = session;
      if (!session) {
        return;
      }

      try {
        const data = await getProfileBootstrap(session);
        if (!data.soundSettings) {
          saveAccountSettings(readUiSoundSettings());
          return;
        }

        hydratingRef.current = true;
        saveUiSoundSettings(data.soundSettings);
        setSettings(data.soundSettings);
        hydratingRef.current = false;
      } catch {
        hydratingRef.current = false;
      }
    };

    const unsubscribeFromAuthSession = subscribeToAuthSession((session) => {
      void loadAccountSettings(session);
    });

    return () => unsubscribeFromAuthSession();
  }, []);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const closeMenu = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && menuRef.current?.contains(target)) {
        return;
      }

      setMenuOpen(false);
    };

    document.addEventListener('pointerdown', closeMenu);
    return () => document.removeEventListener('pointerdown', closeMenu);
  }, [open, setMenuOpen]);

  const updateSettings = (updates: Partial<UiSoundSettings>) => {
    setSettings((current) => {
      const nextSettings = { ...current, ...updates };
      saveUiSoundSettings(nextSettings);
      saveAccountSettings(nextSettings);
      return nextSettings;
    });
  };

  const volumePercent = Math.round(settings.volume * 100);
  const settingRowClass = 'flex min-h-11 items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-900 px-3 text-left text-sm font-semibold text-slate-200 transition hover:bg-slate-800';
  const setVolume = (value: number) => updateSettings({
    volume: value / 100,
    muted: value > 0 ? false : settings.muted,
  });
  const toggleMuteAll = () => updateSettings({
    muted: !settings.muted,
    volume: settings.muted ? 0.5 : 0,
  });

  return (
    <div ref={menuRef} className={variant === 'navigation' ? 'contents' : variant === 'header-icon' ? 'group relative' : 'relative'}>
      <button
        type="button"
        onMouseEnter={() => playUiSound('autocomplete-hover')}
        onFocus={() => playUiSound('autocomplete-hover')}
        onClick={() => {
          playUiSound('autocomplete-select');
          setMenuOpen(!open);
        }}
        aria-label="Sound settings"
        title={variant === 'header-icon' ? undefined : 'Sound settings'}
        aria-expanded={variant === 'navigation' ? open : undefined}
        className={variant === 'navigation'
          ? 'order-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-slate-950/90 text-slate-100 transition hover:border-amber-200/50 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-200 ' + (open ? 'border-amber-200/70 bg-slate-900 ring-1 ring-amber-200/50' : '')
          : variant === 'drawer' || variant === 'mobile'
          ? 'flex min-h-12 w-full items-center justify-start gap-3 rounded-2xl border border-white/10 bg-slate-900 px-4 text-sm font-bold text-slate-100 transition hover:border-amber-200/40 hover:bg-slate-800'
          : variant === 'drawer-icon'
            ? 'inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-slate-900 text-slate-100 transition hover:border-amber-200/40 hover:bg-slate-800'
            : variant === 'header-icon'
              ? 'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-slate-950/90 text-slate-100 transition hover:border-amber-200/50 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-200 sm:h-10 sm:w-10'
          : 'inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-slate-950 text-slate-100 transition hover:border-white/20 hover:bg-slate-900'}
      >
        {settings.muted || settings.volume <= 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
        {variant === 'drawer' || variant === 'mobile' ? <span>Volume</span> : null}
      </button>

      {variant === 'header-icon' ? <HeaderHoverNote>Sound settings</HeaderHoverNote> : null}

      {open ? (
        <div className={variant === 'navigation'
          ? 'order-2 basis-full rounded-2xl border border-white/10 bg-slate-950 p-3 sm:p-4'
          : variant === 'mobile'
          ? 'fixed left-2 right-2 top-14 z-[105] max-h-[calc(100dvh-4.5rem)] overflow-y-auto rounded-2xl border border-white/10 bg-slate-950 p-3 sm:p-4'
          : variant === 'drawer'
          ? 'absolute bottom-14 left-0 right-0 z-[105] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-white/10 bg-slate-950 p-3 sm:p-4'
          : variant === 'drawer-icon'
            ? 'absolute bottom-14 right-0 z-[105] max-h-[calc(100dvh-2rem)] w-[min(20rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl border border-white/10 bg-slate-950 p-3 sm:p-4'
            : variant === 'header-icon'
              ? 'absolute right-0 top-full z-[105] mt-2 w-[min(20rem,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] rounded-2xl border border-white/10 bg-slate-950 p-3 sm:p-4'
          : 'absolute right-0 top-14 z-[95] max-h-[calc(100dvh-2rem)] w-[min(20rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl border border-white/10 bg-slate-950 p-3 sm:p-4'}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Sound</p>
              <p className="mt-1 text-sm font-bold text-white">Master Volume</p>
            </div>
            <span className="rounded-full border border-white/10 bg-slate-900 px-2.5 py-1 text-xs font-bold text-slate-200">{volumePercent}%</span>
          </div>

          <input
            type="range"
            min={0}
            max={100}
            value={volumePercent}
            onChange={(event) => setVolume(Number(event.target.value))}
            className="mt-4 w-full accent-amber-300"
            aria-label="Master Volume"
          />

          <div className="mt-4 grid gap-2">
            <button
              type="button"
              onMouseEnter={() => playUiSound('autocomplete-hover')}
              onFocus={() => playUiSound('autocomplete-hover')}
              onClick={() => {
                playUiSound('setting-select');
                toggleMuteAll();
              }}
              className={settingRowClass}
            >
              <span className="inline-flex items-center gap-2">
                {settings.muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                Mute all
              </span>
              <ToggleSwitch enabled={settings.muted} />
            </button>

            <button
              type="button"
              onMouseEnter={() => playUiSound('autocomplete-hover')}
              onFocus={() => playUiSound('autocomplete-hover')}
              onClick={() => {
                playUiSound('setting-select');
                updateSettings({ chatMuted: !settings.chatMuted });
              }}
              className={settingRowClass}
            >
              <span className="inline-flex items-center gap-2">
                <MessageCircle size={16} />
                Mute chat sounds
              </span>
              <ToggleSwitch enabled={settings.chatMuted} />
            </button>

            <button
              type="button"
              onMouseEnter={() => playUiSound('autocomplete-hover')}
              onFocus={() => playUiSound('autocomplete-hover')}
              onClick={() => {
                playUiSound('setting-select');
                updateSettings({ friendRequestMuted: !settings.friendRequestMuted });
              }}
              className={settingRowClass}
            >
              <span className="inline-flex items-center gap-2">
                <UserPlus size={16} />
                Mute friend request sounds
              </span>
              <ToggleSwitch enabled={settings.friendRequestMuted} />
            </button>

            <button
              type="button"
              onMouseEnter={() => playUiSound('autocomplete-hover')}
              onFocus={() => playUiSound('autocomplete-hover')}
              onClick={() => {
                playUiSound('setting-select');
                updateSettings({ hoverMuted: !settings.hoverMuted });
              }}
              className={settingRowClass}
            >
              <span className="inline-flex items-center gap-2">
                <MousePointer2 size={16} />
                Mute hover effects
              </span>
              <ToggleSwitch enabled={settings.hoverMuted} />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
