'use client';

import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Trophy, X } from 'lucide-react';
import type { AchievementListItem } from '@/lib/achievements';

function playAchievementSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.45);
    gain.connect(context.destination);

    [523.25, 659.25, 783.99].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      oscillator.start(context.currentTime + index * 0.08);
      oscillator.stop(context.currentTime + 0.42 + index * 0.04);
    });

    window.setTimeout(() => void context.close(), 800);
  } catch {
    // Sound is a reward flourish; ignore browsers that block or fail audio creation.
  }
}

export function AchievementToasts() {
  const [achievement, setAchievement] = useState<AchievementListItem | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const handleAchievementCompleted = (event: Event) => {
      const achievements = (event as CustomEvent<{ achievements?: AchievementListItem[] }>).detail?.achievements ?? [];
      const [nextAchievement] = achievements;
      if (!nextAchievement) return;

      setAchievement(nextAchievement);
      playAchievementSound();
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = window.setTimeout(() => {
        timeoutRef.current = null;
        setAchievement(null);
      }, 5_000);
    };

    window.addEventListener('knowleague:achievement-completed', handleAchievementCompleted);
    return () => {
      window.removeEventListener('knowleague:achievement-completed', handleAchievementCompleted);
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  if (!achievement) {
    return null;
  }

  return (
    <div className="fixed right-5 top-5 z-[120] w-[min(calc(100vw-2rem),24rem)] rounded-2xl border border-amber-300/40 bg-slate-950/95 p-4 text-slate-100   backdrop-blur">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-300/40 bg-amber-300/15 text-amber-200">
          <Trophy size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Achievement Unlocked</p>
          <h2 className="mt-1 truncate text-base font-black text-white">{achievement.titleVisible}</h2>
          <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-300">{achievement.descriptionVisible}</p>
          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(new CustomEvent('knowleague:open-profile-tab', { detail: { tab: 'achievements' } }));
              setAchievement(null);
            }}
            className="mt-3 inline-flex min-h-8 items-center gap-2 rounded-xl border border-amber-300/35 bg-amber-300/10 px-3 text-xs font-bold text-amber-100 transition hover:bg-amber-300/20"
          >
            View Achievements
            <ExternalLink size={13} />
          </button>
        </div>
        <button
          type="button"
          onClick={() => setAchievement(null)}
          aria-label="Dismiss achievement notification"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-900 hover:text-white"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}