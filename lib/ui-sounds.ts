'use client';

export type SoundName =
  | 'friend-request-incoming'
  | 'friend-request-sent'
  | 'message-incoming'
  | 'message-sent'
  | 'autocomplete-hover'
  | 'autocomplete-select'
  | 'skindle-guess-correct'
  | 'skindle-guess-incorrect'
  | 'skindle-answer-reveal'
  | 'setting-select'
  | 'tile-lock-correct'
  | 'tile-lock-miss'
  | 'puzzle-complete'
  | 'timer-expired'
  | 'timer-countdown'
  | 'tile-rotate'
  | 'random-select'
  | 'opponent-correct'
  | 'item-slide'
  | 'disconnect-expired'
  | 'player-management';
type SoundCategory = 'chat' | 'friend-request' | 'game';

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
  'autocomplete-hover': [
    { frequency: 820, duration: 0.035, gain: 0.026, type: 'triangle' },
    { frequency: 1240, duration: 0.045, delay: 0.025, gain: 0.022, type: 'sine' },
  ],
  'autocomplete-select': [
    { frequency: 560, duration: 0.045, gain: 0.034, type: 'triangle' },
    { frequency: 840, duration: 0.06, delay: 0.045, gain: 0.038, type: 'triangle' },
    { frequency: 1120, duration: 0.08, delay: 0.1, gain: 0.03, type: 'sine' },
  ],
  'skindle-guess-correct': [
    { frequency: 660, duration: 0.08, gain: 0.045, type: 'triangle' },
    { frequency: 880, duration: 0.08, delay: 0.07, gain: 0.05, type: 'triangle' },
    { frequency: 1320, duration: 0.11, delay: 0.15, gain: 0.04, type: 'sine' },
  ],
  'skindle-guess-incorrect': [
    { frequency: 260, duration: 0.1, gain: 0.045, type: 'sawtooth' },
    { frequency: 180, duration: 0.16, delay: 0.08, gain: 0.032, type: 'triangle' },
  ],
  'skindle-answer-reveal': [
    { frequency: 392, duration: 0.09, gain: 0.04, type: 'triangle' },
    { frequency: 587.33, duration: 0.1, delay: 0.08, gain: 0.045, type: 'triangle' },
    { frequency: 783.99, duration: 0.12, delay: 0.17, gain: 0.045, type: 'triangle' },
    { frequency: 1174.66, duration: 0.18, delay: 0.29, gain: 0.035, type: 'sine' },
  ],
  'setting-select': [
    { frequency: 640, duration: 0.045, gain: 0.026, type: 'triangle' },
    { frequency: 860, duration: 0.055, delay: 0.04, gain: 0.024, type: 'sine' },
  ],
  'tile-lock-correct': [
    { frequency: 740, duration: 0.055, gain: 0.04, type: 'triangle' },
    { frequency: 980, duration: 0.075, delay: 0.05, gain: 0.04, type: 'triangle' },
  ],
  'tile-lock-miss': [
    { frequency: 320, duration: 0.08, gain: 0.034, type: 'triangle' },
    { frequency: 250, duration: 0.1, delay: 0.065, gain: 0.026, type: 'sine' },
  ],
  'puzzle-complete': [
    { frequency: 523.25, duration: 0.09, gain: 0.045, type: 'triangle' },
    { frequency: 659.25, duration: 0.09, delay: 0.08, gain: 0.045, type: 'triangle' },
    { frequency: 783.99, duration: 0.11, delay: 0.16, gain: 0.045, type: 'triangle' },
    { frequency: 1046.5, duration: 0.2, delay: 0.27, gain: 0.036, type: 'sine' },
  ],
  'timer-expired': [
    { frequency: 240, duration: 0.16, gain: 0.05, type: 'sawtooth' },
    { frequency: 160, duration: 0.22, delay: 0.14, gain: 0.04, type: 'triangle' },
  ],
  'timer-countdown': [
    { frequency: 500, duration: 0.11, gain: 0.08, type: 'sine' },
  ],
  'tile-rotate': [
    { frequency: 460, duration: 0.045, gain: 0.032, type: 'triangle' },
    { frequency: 620, duration: 0.045, delay: 0.035, gain: 0.028, type: 'triangle' },
  ],
  'random-select': [
    { frequency: 520, duration: 0.04, gain: 0.032, type: 'triangle' },
    { frequency: 720, duration: 0.045, delay: 0.035, gain: 0.032, type: 'triangle' },
    { frequency: 960, duration: 0.065, delay: 0.075, gain: 0.028, type: 'sine' },
  ],
  'opponent-correct': [
    { frequency: 620, duration: 0.055, gain: 0.018, type: 'triangle' },
    { frequency: 820, duration: 0.07, delay: 0.05, gain: 0.016, type: 'sine' },
  ],
  'item-slide': [
    { frequency: 360, duration: 0.04, gain: 0.024, type: 'triangle' },
    { frequency: 520, duration: 0.055, delay: 0.035, gain: 0.02, type: 'triangle' },
  ],
  'disconnect-expired': [
    { frequency: 220, duration: 0.12, gain: 0.038, type: 'sawtooth' },
    { frequency: 150, duration: 0.18, delay: 0.1, gain: 0.028, type: 'triangle' },
  ],
  'player-management': [
    { frequency: 500, duration: 0.055, gain: 0.034, type: 'triangle' },
    { frequency: 700, duration: 0.065, delay: 0.05, gain: 0.03, type: 'triangle' },
  ],
};

const soundCategories: Record<SoundName, SoundCategory> = {
  'friend-request-incoming': 'friend-request',
  'friend-request-sent': 'friend-request',
  'message-incoming': 'chat',
  'message-sent': 'chat',
  'autocomplete-hover': 'game',
  'autocomplete-select': 'game',
  'skindle-guess-correct': 'game',
  'skindle-guess-incorrect': 'game',
  'skindle-answer-reveal': 'game',
  'setting-select': 'game',
  'tile-lock-correct': 'game',
  'tile-lock-miss': 'game',
  'puzzle-complete': 'game',
  'timer-expired': 'game',
  'timer-countdown': 'game',
  'tile-rotate': 'game',
  'random-select': 'game',
  'opponent-correct': 'game',
  'item-slide': 'game',
  'disconnect-expired': 'game',
  'player-management': 'game',
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

  if (category === 'friend-request') {
    return !settings.friendRequestMuted;
  }

  return true;
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
