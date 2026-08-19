'use client';

import { useLayoutEffect, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

type ViewportPopoverProps = {
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  width: number;
  estimatedHeight?: number;
  className?: string;
  children: ReactNode;
};

const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 8;
const MIN_VISIBLE_HEIGHT = 120;

export function ViewportPopover({
  anchorRef,
  open,
  width,
  estimatedHeight = 420,
  className = '',
  children,
}: ViewportPopoverProps) {
  const [position, setPosition] = useState<CSSProperties>({ visibility: 'hidden' });

  useLayoutEffect(() => {
    if (!open) return undefined;

    const updatePosition = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;

      const rect = anchor.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const popupWidth = Math.min(width, viewportWidth - VIEWPORT_MARGIN * 2);
      const left = Math.max(
        VIEWPORT_MARGIN,
        Math.min(rect.right - popupWidth, viewportWidth - popupWidth - VIEWPORT_MARGIN),
      );
      let top = rect.bottom + ANCHOR_GAP;
      let maxHeight = viewportHeight - top - VIEWPORT_MARGIN;

      if (maxHeight < MIN_VISIBLE_HEIGHT) {
        const availableAbove = rect.top - ANCHOR_GAP - VIEWPORT_MARGIN;
        if (availableAbove > maxHeight) {
          maxHeight = availableAbove;
          top = Math.max(VIEWPORT_MARGIN, rect.top - ANCHOR_GAP - Math.min(estimatedHeight, availableAbove));
        }
      }

      setPosition({
        position: 'fixed',
        left,
        top,
        width: popupWidth,
        maxWidth: `calc(100vw - ${VIEWPORT_MARGIN * 2}px)`,
        maxHeight: Math.max(MIN_VISIBLE_HEIGHT, maxHeight),
        overflowY: 'auto',
        visibility: 'visible',
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [anchorRef, estimatedHeight, open, width]);

  if (!open) return null;

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={className}
      style={position}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}
