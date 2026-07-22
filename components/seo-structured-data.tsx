import { getAbsoluteSiteUrl, SITE_NAME, siteUrl } from '@/lib/seo';

function StructuredData({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}

export function SiteStructuredData() {
  const url = getAbsoluteSiteUrl('/');
  if (!url) {
    return null;
  }

  return (
    <StructuredData
      data={{
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        '@id': `${url}#website`,
        name: SITE_NAME,
        url,
        inLanguage: 'en-US',
      }}
    />
  );
}

export function GameStructuredData({ name, path }: { name: string; path: string }) {
  const url = getAbsoluteSiteUrl(path);
  if (!siteUrl || !url) {
    return null;
  }

  return (
    <StructuredData
      data={{
        '@context': 'https://schema.org',
        '@type': ['VideoGame', 'WebApplication'],
        '@id': `${url}#game`,
        name,
        url,
        applicationCategory: 'GameApplication',
        operatingSystem: 'Web browser',
        isAccessibleForFree: true,
        offers: {
          '@type': 'Offer',
          price: 0,
          priceCurrency: 'USD',
        },
      }}
    />
  );
}

export function WebApplicationStructuredData({ name, path }: { name: string; path: string }) {
  const url = getAbsoluteSiteUrl(path);
  if (!siteUrl || !url) {
    return null;
  }

  return (
    <StructuredData
      data={{
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        '@id': `${url}#application`,
        name,
        url,
        applicationCategory: 'UtilitiesApplication',
        operatingSystem: 'Web browser',
        isAccessibleForFree: true,
      }}
    />
  );
}
