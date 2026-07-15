import { memo } from 'react';
import type { ReactNode } from 'react';
import type { QuizItem } from '@/lib/quiz';

export type QuizCarouselRole = 'next' | 'current' | 'previous';

type QuizCarouselSlot = {
  id: string;
  label: string;
  subLabel?: ReactNode;
  badge: ReactNode;
};

type QuizItemCarouselProps = {
  slots: readonly [QuizCarouselSlot, QuizCarouselSlot, QuizCarouselSlot];
  afterNextItem: QuizItem | null;
  nextItem: QuizItem | null;
  currentItem: QuizItem | null;
  previousItem: QuizItem | null;
  isSliding: boolean;
  renderItem: (item: QuizItem | null, role: QuizCarouselRole) => ReactNode;
};

/**
 * Keeps the carousel chrome stationary while a four-item track rotates through
 * the three visible positions. The first item is initially just outside the
 * viewport, so it can slide into the next position during an advance.
 */
export const QuizItemCarousel = memo(function QuizItemCarousel({
  slots,
  afterNextItem,
  nextItem,
  currentItem,
  previousItem,
  isSliding,
  renderItem,
}: QuizItemCarouselProps) {
  const trackItems: readonly { item: QuizItem | null; role: QuizCarouselRole; position: string }[] = [
    { item: afterNextItem, role: 'next', position: 'after-next' },
    { item: nextItem, role: 'next', position: 'next' },
    { item: currentItem, role: 'current', position: 'current' },
    { item: previousItem, role: 'previous', position: 'previous' },
  ];
  const visibleItems = trackItems.slice(1);

  return (
    <div>
      <div className="grid items-start gap-4 lg:grid-cols-3 lg:gap-0">
        {slots.map((slot) => (
          <div key={slot.id} className="min-w-0 px-2">
            <div className="flex min-h-[3rem] flex-col gap-2 text-slate-400 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.22em]">{slot.label}</p>
                {slot.subLabel ? <div className="mt-1 truncate text-sm text-slate-300">{slot.subLabel}</div> : null}
              </div>
              {slot.badge}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:hidden">
        {visibleItems.map(({ item, role, position }) => (
          <div key={`mobile-${position}-${item?.id ?? 'empty'}`} className="min-w-0">
            {renderItem(item, role)}
          </div>
        ))}
      </div>

      <div className="hidden overflow-hidden lg:block">
        <div className={`quiz-carousel-track grid w-[133.333333%] grid-cols-4 items-stretch ${isSliding ? 'animate-carousel-slide' : ''}`}>
          {trackItems.map(({ item, role, position }) => (
            <div key={`${position}-${item?.id ?? 'empty'}`} className="min-w-0 px-2">
              {renderItem(item, role)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});
