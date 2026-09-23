'use client';

import { useEffect, useRef, useState } from 'react';
import { renderAugmentCard } from '@/lib/augment-card-renderer';
import { parseAugmentText, type AugmentDraft } from '@/lib/augment-builder';

export function AugmentCard({ draft, blank = false }: { draft: AugmentDraft; blank?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setError('');
    const canvas = document.createElement('canvas');
    void renderAugmentCard(canvas, draft, blank)
      .then(() => {
        if (!active || !ref.current) return;
        ref.current.width = canvas.width;
        ref.current.height = canvas.height;
        ref.current.getContext('2d')?.drawImage(canvas, 0, 0);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Unable to render card.');
      });
    return () => {
      active = false;
    };
  }, [draft, blank]);
  return (
    <figure className="mx-auto w-full max-w-[360px] select-none">
      <canvas
        ref={ref}
        width={624}
        height={1024}
        className="block h-auto w-full"
        role="img"
        aria-label={
          blank
            ? `${draft.rarity} augment frame`
            : `${draft.rarity} augment: ${draft.name || 'Your augment'}. ${parseAugmentText(draft.description)
                .map((run) => run.text)
                .join('')}`
        }
      />
      {error ? (
        <figcaption role="alert" className="mt-2 text-sm text-red-200">
          {error}
        </figcaption>
      ) : null}
    </figure>
  );
}
