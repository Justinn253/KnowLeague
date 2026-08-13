'use client';

import Image, { type ImageProps } from 'next/image';
import { useEffect, useRef, useState } from 'react';
import type { RiftboundCard } from '@/lib/riftbound';

type RiftboundCardImageProps = Omit<ImageProps, 'src' | 'alt' | 'fill' | 'quality'> & {
  card: RiftboundCard;
  sizes: string;
  className?: string;
  orientation?: 'portrait' | 'landscape';
};

// Keep every card/source pair on one quality cache key. The card catalogue is
// large and immutable, so quality 75 provides a good visual result without
// multiplying Vercel transformations for the same card at qualities 90/100.
const RIFTBOUND_CARD_IMAGE_QUALITY = 75;

type CardImageViewportCallback = (isVisible: boolean) => void;

let cardImageObserver: IntersectionObserver | null = null;
const observedCardImages = new Map<Element, CardImageViewportCallback>();

function observeCardImage(target: Element, callback: CardImageViewportCallback) {
  if (typeof IntersectionObserver === 'undefined') {
    callback(true);
    return () => undefined;
  }

  if (!cardImageObserver) {
    cardImageObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => observedCardImages.get(entry.target)?.(entry.isIntersecting));
    });
  }

  observedCardImages.set(target, callback);
  cardImageObserver.observe(target);
  return () => {
    observedCardImages.delete(target);
    cardImageObserver?.unobserve(target);
    if (observedCardImages.size === 0) {
      cardImageObserver?.disconnect();
      cardImageObserver = null;
    }
  };
}

export function RiftboundCardImage({ card, sizes, className = 'object-cover', orientation = 'portrait', ...props }: RiftboundCardImageProps) {
  const eager = props.loading === 'eager';
  const imageContainerRef = useRef<HTMLSpanElement | null>(null);
  const [visible, setVisible] = useState(eager);

  useEffect(() => {
    if (eager) {
      setVisible(true);
      return undefined;
    }
    const target = imageContainerRef.current;
    if (!target) return undefined;
    return observeCardImage(target, setVisible);
  }, [eager]);

  const image = visible ? (
    <Image
      src={card.imageUrl}
      alt={`${card.displayName} card artwork`}
      fill
      sizes={sizes}
      draggable={false}
      className={className}
      {...props}
      // Riftbound catalogue artwork is immutable, CDN-hosted card art. Keep it
      // out of Vercel's transformation meter across every preview size; the
      // source assets are already bounded card images rather than user uploads.
      unoptimized
      quality={RIFTBOUND_CARD_IMAGE_QUALITY}
    />
  ) : null;

  const imageWithViewportGuard = <span ref={imageContainerRef} className="absolute inset-0">{image}</span>;

  if (orientation === 'landscape' || (!card.cardTypeLabels.includes('Battlefield') && card.cardType !== 'Battlefield')) return imageWithViewportGuard;

  return (
    <span className="absolute left-1/2 top-1/2 aspect-[1038/744] w-[139.5%] -translate-x-1/2 -translate-y-1/2 rotate-90">
      {imageWithViewportGuard}
    </span>
  );
}
