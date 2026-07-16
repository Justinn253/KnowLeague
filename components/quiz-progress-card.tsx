'use client';

import { forwardRef, memo } from 'react';
import Image from 'next/image';
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
      {item.imageUrl ? (
        <Image
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
