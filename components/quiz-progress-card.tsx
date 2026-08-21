'use client';

import { forwardRef, memo } from 'react';
import { GameIconImage, GameSplashImage } from '@/components/game-asset-image';
import type { QuizItem } from '@/lib/quiz';

type QuizProgressCardProps = {
  item: QuizItem;
  state: 'current' | 'completed' | 'pending';
  title: string;
  detail: string;
  activeClassName: string;
  completedClassName: string;
  pendingClassName: string;
  pendingImageClassName: string;
  titleClassName?: string;
  showImage?: boolean;
};

export const QuizProgressCard = memo(forwardRef<HTMLDivElement, QuizProgressCardProps>(function QuizProgressCard({
  item,
  state,
  title,
  detail,
  activeClassName,
  completedClassName,
  pendingClassName,
  pendingImageClassName,
  titleClassName = 'text-slate-100',
  showImage = true,
}, ref) {
  const stateClassName = state === 'current'
    ? activeClassName
    : state === 'completed'
      ? completedClassName
      : pendingClassName;

  return (
    <div
      ref={ref}
      className={`relative min-h-20 overflow-hidden rounded-3xl border px-4 py-3 pr-16 transition ${stateClassName}`}
    >
      <div className={`text-sm font-semibold ${titleClassName}`}>{title}</div>
      <p className="mt-2 text-sm leading-5 text-slate-400">{detail}</p>
      {showImage && item.imageUrl ? item.type === 'skin' ? (
        <GameSplashImage
          src={item.imageUrl}
          alt=""
          width={40}
          height={40}
          sizes="40px"
          className={`absolute right-3 top-3 h-10 w-10 rounded-xl border border-white/10 object-cover ${state === 'pending' ? pendingImageClassName : ''}`}
        />
      ) : (
        <GameIconImage
          src={item.imageUrl}
          alt=""
          width={40}
          height={40}
          className={`absolute right-3 top-3 h-10 w-10 rounded-xl border border-white/10 object-cover ${state === 'pending' ? pendingImageClassName : ''}`}
        />
      ) : null}
    </div>
  );
}));
