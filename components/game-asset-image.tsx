import Image, { type ImageProps } from 'next/image';

type GameSplashImageProps = ImageProps & {
  quality?: number;
};

type GameIconImageProps = Omit<ImageProps, 'loading' | 'unoptimized'> & {
  loading?: ImageProps['loading'];
};

/** Keep catalog autocomplete thumbnails on one reusable optimized width. */
export const GAME_SKIN_THUMBNAIL_SIZES = '64px';

/**
 * Full-size Riot splash art benefits from responsive resizing. Keep its
 * quality and loading behavior consistent so the app reuses a small set of
 * Vercel image variants instead of each surface choosing independently.
 */
export function GameSplashImage({ quality = 65, loading, priority, ...props }: GameSplashImageProps) {
  return (
    // `ImageProps` requires alt; it is forwarded through the wrapper.
    // eslint-disable-next-line jsx-a11y/alt-text
    <Image
      {...props}
      priority={priority}
      quality={quality}
      {...(priority ? {} : { loading: loading ?? 'lazy' })}
    />
  );
}

/**
 * Data Dragon and CommunityDragon icons are already small, immutable CDN
 * assets. Serve them directly to avoid a Vercel image transformation/cache
 * entry for every icon size.
 */
export function GameIconImage({ loading = 'lazy', ...props }: GameIconImageProps) {
  // `ImageProps` requires alt; it is forwarded through the wrapper.
  // eslint-disable-next-line jsx-a11y/alt-text
  return <Image {...props} loading={loading} unoptimized />;
}
