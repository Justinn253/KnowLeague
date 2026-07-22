import type { MetadataRoute } from 'next';
import { getAbsoluteSiteUrl } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  const sitemap = getAbsoluteSiteUrl('/sitemap.xml');

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/'],
    },
    ...(sitemap ? { sitemap } : {}),
  };
}
