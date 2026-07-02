'use client';

import { useEffect, useRef, useState } from 'react';
import { Bell, MessageCircle, Volume2, VolumeX, UserPlus } from 'lucide-react';
import { DEFAULT_UI_SOUND_SETTINGS, readUiSoundSettings, saveUiSoundSettings, type UiSoundSettings } from '@/lib/ui-sounds';

export function SoundSettingsMenu() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<UiSoundSettings>(() => DEFAULT_UI_SOUND_SETTINGS);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSettings(readUiSoundSettings());

    const syncSettings = () => setSettings(readUiSoundSettings());
    window.addEventListener('knowleague:sound-settings-changed', syncSettings);
    return () => window.removeEventListener('knowleague:sound-settings-changed', syncSettings);
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
      return nextSettings;
    });
  };

  const volumePercent = Math.round(settings.volume * 100);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Sound settings"
        title="Sound settings"
        className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-slate-950 text-slate-100 transition hover:bg-slate-900"
      >
        {settings.muted || settings.volume <= 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}
      </button>

      {open ? (
        <div className="absolute right-0 top-14 z-40 w-80 rounded-2xl border border-white/10 bg-slate-950 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Sound</p>
              <p className="mt-1 text-sm font-bold text-white">App volume</p>
            </div>
            <span className="rounded-full border border-white/10 bg-slate-900 px-2.5 py-1 text-xs font-bold text-slate-200">{volumePercent}%</span>
          </div>

          <input
            type="range"
            min={0}
            max={100}
            value={volumePercent}
            onChange={(event) => updateSettings({ volume: Number(event.target.value) / 100, muted: Number(event.target.value) === 0 ? settings.muted : false })}
            className="mt-4 w-full accent-amber-300"
            aria-label="App volume"
          />

          <div className="mt-4 grid gap-2">
            <button
              type="button"
              onClick={() => updateSettings({ muted: !settings.muted })}
              className={`flex min-h-11 items-center justify-between gap-3 rounded-xl border px-3 text-left text-sm font-semibold transition ${
                settings.muted ? 'border-amber-300/50 bg-amber-300/10 text-amber-100' : 'border-white/10 bg-slate-900 text-slate-200 hover:bg-slate-800'
              }`}
            >
              <span className="inline-flex items-center gap-2">
                {settings.muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                Mute all
              </span>
              <span className="text-xs uppercase tracking-[0.12em]">{settings.muted ? 'On' : 'Off'}</span>
            </button>

            <button
              type="button"
              onClick={() => updateSettings({ chatMuted: !settings.chatMuted })}
              className={`flex min-h-11 items-center justify-between gap-3 rounded-xl border px-3 text-left text-sm font-semibold transition ${
                settings.chatMuted ? 'border-amber-300/50 bg-amber-300/10 text-amber-100' : 'border-white/10 bg-slate-900 text-slate-200 hover:bg-slate-800'
              }`}
            >
              <span className="inline-flex items-center gap-2">
                <MessageCircle size={16} />
                Mute chat sounds
              </span>
              <span className="text-xs uppercase tracking-[0.12em]">{settings.chatMuted ? 'On' : 'Off'}</span>
            </button>

            <button
              type="button"
              onClick={() => updateSettings({ friendRequestMuted: !settings.friendRequestMuted })}
              className={`flex min-h-11 items-center justify-between gap-3 rounded-xl border px-3 text-left text-sm font-semibold transition ${
                settings.friendRequestMuted ? 'border-amber-300/50 bg-amber-300/10 text-amber-100' : 'border-white/10 bg-slate-900 text-slate-200 hover:bg-slate-800'
              }`}
            >
              <span className="inline-flex items-center gap-2">
                <UserPlus size={16} />
                Mute friend request sounds
              </span>
              <span className="text-xs uppercase tracking-[0.12em]">{settings.friendRequestMuted ? 'On' : 'Off'}</span>
            </button>
          </div>

          <p className="mt-3 flex items-center gap-2 text-xs leading-5 text-slate-500">
            <Bell size={14} />
            Applies to friend requests and direct messages.
          </p>
        </div>
      ) : null}
    </div>
  );
}
