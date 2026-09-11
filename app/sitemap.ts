import type { MetadataRoute } from 'next';
import { getAbsoluteSiteUrl } from '@/lib/seo';

const publicRoutes = [
  '/',
  '/ability-blitz',
  '/multiplayer/ability-blitz',
  '/skin-champion',
  '/multiplayer/skin-champion',
  '/skindle',
  '/splash-scramble',
  '/randodraft',
  '/skincognito',
  '/carving-revelation',
  '/category-clash',
  '/mastery-master',
  '/riot-account-viewer',
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
