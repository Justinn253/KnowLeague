'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Volume2, VolumeX, UserPlus } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { getOptionalSupabaseClient } from '@/lib/supabaseClient';
import { DEFAULT_UI_SOUND_SETTINGS, readUiSoundSettings, saveUiSoundSettings, type UiSoundSettings } from '@/lib/ui-sounds';

type SoundSettingsResponse = {
  settings: UiSoundSettings | null;
};

function ToggleSwitch({ enabled }: { enabled: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition ${
        enabled ? 'border-red-400/40 bg-red-500' : 'border-white/10 bg-slate-700'
      }`}
    >
      <span
        className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${
          enabled ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </span>
  );
}

export function SoundSettingsMenu() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<UiSoundSettings>(() => DEFAULT_UI_SOUND_SETTINGS);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const hydratingRef = useRef(false);
  const saveTimeoutRef = useRef<number | null>(null);

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
        const response = await fetch('/api/profile/sound-settings', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!response.ok) {
          return;
        }

        const data = await response.json() as SoundSettingsResponse;
        if (!data.settings) {
          saveAccountSettings(readUiSoundSettings());
          return;
        }

        hydratingRef.current = true;
        saveUiSoundSettings(data.settings);
        setSettings(data.settings);
        hydratingRef.current = false;
      } catch {
        hydratingRef.current = false;
      }
    };

    supabase.auth.getSession().then(({ data }) => {
      void loadAccountSettings(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      void loadAccountSettings(session);
    });

    return () => listener.subscription.unsubscribe();
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

      setOpen(false);
    };

    document.addEventListener('pointerdown', closeMenu);
    return () => document.removeEventListener('pointerdown', closeMenu);
  }, [open]);

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
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Sound settings"
        title="Sound settings"
        className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-slate-950 text-slate-100 transition hover:border-white/20 hover:bg-slate-900"
      >
        {settings.muted || settings.volume <= 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
      </button>

      {open ? (
        <div className="absolute right-0 top-14 z-[95] w-80 rounded-2xl border border-white/10 bg-slate-950 p-4">
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
              onClick={toggleMuteAll}
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
              onClick={() => updateSettings({ chatMuted: !settings.chatMuted })}
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
              onClick={() => updateSettings({ friendRequestMuted: !settings.friendRequestMuted })}
              className={settingRowClass}
            >
              <span className="inline-flex items-center gap-2">
                <UserPlus size={16} />
                Mute friend request sounds
              </span>
              <ToggleSwitch enabled={settings.friendRequestMuted} />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
