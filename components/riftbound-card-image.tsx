'use client';

import Image, { type ImageProps } from 'next/image';
import type { RiftboundCard } from '@/lib/riftbound';

type RiftboundCardImageProps = Omit<ImageProps, 'src' | 'alt' | 'fill'> & {
  card: RiftboundCard;
  sizes: string;
  className?: string;
};

export function RiftboundCardImage({ card, sizes, className = 'object-cover', ...props }: RiftboundCardImageProps) {
  const image = (
    <Image
      src={card.imageUrl}
      alt={`${card.displayName} card artwork`}
      fill
      sizes={sizes}
      draggable={false}
      className={className}
      {...props}
    />
  );

  if (!card.cardTypeLabels.includes('Battlefield') && card.cardType !== 'Battlefield') return image;

  return (
    <span className="absolute left-1/2 top-1/2 aspect-[1038/744] w-[139.5%] -translate-x-1/2 -translate-y-1/2 rotate-90">
      {image}
    </span>
  );
}
