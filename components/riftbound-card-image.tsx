'use client';

import Image, { type ImageProps } from 'next/image';
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

export function RiftboundCardImage({ card, sizes, className = 'object-cover', orientation = 'portrait', ...props }: RiftboundCardImageProps) {
  const image = (
    <Image
      src={card.imageUrl}
      alt={`${card.displayName} card artwork`}
      fill
      sizes={sizes}
      draggable={false}
      className={className}
      {...props}
      quality={RIFTBOUND_CARD_IMAGE_QUALITY}
    />
  );

  if (orientation === 'landscape' || (!card.cardTypeLabels.includes('Battlefield') && card.cardType !== 'Battlefield')) return image;

  return (
    <span className="absolute left-1/2 top-1/2 aspect-[1038/744] w-[139.5%] -translate-x-1/2 -translate-y-1/2 rotate-90">
      {image}
    </span>
  );
}
