'use client';

type SoundName = 'friend-request-incoming' | 'friend-request-sent' | 'message-incoming' | 'message-sent';
type SoundCategory = 'chat' | 'friend-request';

export type UiSoundSettings = {
  volume: number;
  muted: boolean;
  chatMuted: boolean;
  friendRequestMuted: boolean;
};

type Tone = {
  frequency: number;
  duration: number;
  delay?: number;
  gain?: number;
  type?: OscillatorType;
};

const soundTones: Record<SoundName, Tone[]> = {
  'friend-request-incoming': [
    { frequency: 660, duration: 0.08, gain: 0.05 },
    { frequency: 880, duration: 0.12, delay: 0.08, gain: 0.05 },
  ],
  'friend-request-sent': [
    { frequency: 520, duration: 0.07, gain: 0.04 },
    { frequency: 740, duration: 0.08, delay: 0.07, gain: 0.04 },
  ],
  'message-incoming': [
    { frequency: 760, duration: 0.06, gain: 0.045 },
    { frequency: 620, duration: 0.09, delay: 0.06, gain: 0.04 },
  ],
  'message-sent': [
    { frequency: 560, duration: 0.055, gain: 0.035 },
    { frequency: 680, duration: 0.055, delay: 0.055, gain: 0.035 },
  ],
};

const soundCategories: Record<SoundName, SoundCategory> = {
  'friend-request-incoming': 'friend-request',
  'friend-request-sent': 'friend-request',
  'message-incoming': 'chat',
  'message-sent': 'chat',
};

const SOUND_SETTINGS_KEY = 'knowleague:v1:ui-sound-settings';
export const DEFAULT_UI_SOUND_SETTINGS: UiSoundSettings = {
  volume: 0.7,
  muted: false,
  chatMuted: false,
  friendRequestMuted: false,
};

let audioContext: AudioContext | null = null;

function clampVolume(volume: unknown) {
  return typeof volume === 'number' && Number.isFinite(volume)
    ? Math.min(1, Math.max(0, volume))
    : DEFAULT_UI_SOUND_SETTINGS.volume;
}

export function readUiSoundSettings(): UiSoundSettings {
  if (typeof window === 'undefined') {
    return DEFAULT_UI_SOUND_SETTINGS;
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(SOUND_SETTINGS_KEY) ?? 'null') as Partial<UiSoundSettings> | null;
    if (!parsed || typeof parsed !== 'object') {
      return DEFAULT_UI_SOUND_SETTINGS;
    }

    return {
      volume: clampVolume(parsed.volume),
      muted: Boolean(parsed.muted),
      chatMuted: Boolean(parsed.chatMuted),
      friendRequestMuted: Boolean(parsed.friendRequestMuted),
    };
  } catch {
    return DEFAULT_UI_SOUND_SETTINGS;
  }
}

export function saveUiSoundSettings(settings: UiSoundSettings) {
  if (typeof window === 'undefined') {
    return;
  }

  const nextSettings = {
    volume: clampVolume(settings.volume),
    muted: settings.muted,
    chatMuted: settings.chatMuted,
    friendRequestMuted: settings.friendRequestMuted,
  };
  window.localStorage.setItem(SOUND_SETTINGS_KEY, JSON.stringify(nextSettings));
  window.dispatchEvent(new CustomEvent('knowleague:sound-settings-changed', { detail: nextSettings }));
}

function canPlaySound(sound: SoundName, settings: UiSoundSettings) {
  if (settings.muted || settings.volume <= 0) {
    return false;
  }

  const category = soundCategories[sound];
  if (category === 'chat') {
    return !settings.chatMuted;
  }

  return !settings.friendRequestMuted;
}

function getAudioContext() {
  if (typeof window === 'undefined') {
    return null;
  }

  const AudioContextConstructor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) {
    return null;
  }

  audioContext ??= new AudioContextConstructor();
  return audioContext;
}

export function playUiSound(sound: SoundName) {
  const settings = readUiSoundSettings();
  if (!canPlaySound(sound, settings)) {
    return;
  }

  const context = getAudioContext();
  if (!context) {
    return;
  }

  void context.resume().catch(() => undefined);
  const startedAt = context.currentTime + 0.01;

  soundTones[sound].forEach((tone) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = startedAt + (tone.delay ?? 0);
    const end = start + tone.duration;

    oscillator.type = tone.type ?? 'sine';
    oscillator.frequency.setValueAtTime(tone.frequency, start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime((tone.gain ?? 0.04) * settings.volume, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(end + 0.01);
  });
}
