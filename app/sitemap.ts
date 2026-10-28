import type { MetadataRoute } from 'next';
import { getAbsoluteSiteUrl } from '@/lib/seo';

const publicRoutes = [
  '/',
  '/news',
  '/news/archive',
  '/ability-blitz',
  '/multiplayer/ability-blitz',
  '/skin-champion',
  '/multiplayer/skin-champion',
  '/skindle',
  '/splash-scramble',
  '/randodraft',
  '/augment-builder',
  '/skincognito',
  '/carving-revelation',
  '/category-clash',
  '/mastery-master',
  '/games/mining',
  '/riot-account-viewer',
  '/riot-account-viewer/token-leaderboards',
  '/riftbound/inventory',
  '/riftbound/community',
  '/about',
  '/guides',
  '/contact',
  '/privacy',
  '/terms',
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return publicRoutes.flatMap((path) => {
    const url = getAbsoluteSiteUrl(path);
    return url ? [{ url }] : [];
  });
}
