import type { Metadata } from 'next';

export const SITE_NAME = 'KnowLeague';
export const DEFAULT_SITE_TITLE = 'KnowLeague | League of Legends Games';
export const DEFAULT_DESCRIPTION = 'League of Legends puzzles, multiplayer games, and account tools for League players.';
export const SOCIAL_IMAGE_PATH = '/backgrounds/Howling_Abyss_Landscape.png';

function parseSiteUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configuredUrl) {
    return null;
  }

  try {
    const url = new URL(configuredUrl);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

export const siteUrl = parseSiteUrl();

export function getAbsoluteSiteUrl(path: string) {
  return siteUrl ? new URL(path, siteUrl).toString() : undefined;
}

type PageMetadataOptions = {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
};

export function createPageMetadata({ title, description, path, keywords }: PageMetadataOptions): Metadata {
  const canonicalUrl = getAbsoluteSiteUrl(path);
  const socialImageUrl = getAbsoluteSiteUrl(SOCIAL_IMAGE_PATH);

  return {
    title,
    description,
    ...(keywords?.length ? { keywords } : {}),
    ...(siteUrl
      ? {
          metadataBase: siteUrl,
          alternates: { canonical: path },
        }
      : {}),
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      title,
      description,
      ...(canonicalUrl ? { url: canonicalUrl } : {}),
      ...(socialImageUrl
        ? { images: [{ url: socialImageUrl, alt: 'Howling Abyss landscape from League of Legends' }] }
        : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      ...(socialImageUrl ? { images: [socialImageUrl] } : {}),
    },
  };
}

export function createNoIndexMetadata(title: string): Metadata {
  return {
    title,
    robots: {
      index: false,
      follow: false,
      googleBot: {
        index: false,
        follow: false,
      },
    },
  };
}
