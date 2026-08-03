import { StructuredData } from '@/components/seo-structured-data';
import { RIFTBOUND_CARDS } from '@/lib/riftbound';
import { getAbsoluteSiteUrl, SITE_NAME, siteUrl } from '@/lib/seo';

const RIFTBOUND_INVENTORY_PATH = '/riftbound/inventory';
const RIFTBOUND_COMMUNITY_PATH = '/riftbound/community';
const RIFTBOUND_CATALOGUE_DESCRIPTION = 'Browse every Riftbound card by set, rarity, domain, cost, and type. Track your collection, build sets and decks, and review market details on KnowLeague.';

function getSiteReference() {
  const url = getAbsoluteSiteUrl('/');
  return url ? { '@id': `${url}#website` } : undefined;
}

export function RiftboundCatalogueStructuredData() {
  const url = getAbsoluteSiteUrl(RIFTBOUND_INVENTORY_PATH);
  if (!siteUrl || !url) return null;

  const itemListElement = RIFTBOUND_CARDS.map((card, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    item: {
      '@type': 'Thing',
      '@id': `${url}#riftbound-card-${card.id}`,
      name: card.displayName,
      description: `${card.setName} (${card.setCode} ${card.numberLabel}) ${card.rarity} ${card.cardType}.`,
      image: card.imageUrl,
      url: `${url}#riftbound-card-${card.id}`,
    },
  }));

  return (
    <>
      <StructuredData
        data={{
          '@context': 'https://schema.org',
          '@type': 'WebApplication',
          '@id': `${url}#application`,
          name: 'KnowLeague Riftbound Collection Tracker',
          url,
          description: RIFTBOUND_CATALOGUE_DESCRIPTION,
          applicationCategory: 'UtilitiesApplication',
          operatingSystem: 'Web browser',
          isAccessibleForFree: true,
          featureList: [
            'Riftbound card database',
            'Riftbound collection tracker',
            'Riftbound set builder',
            'Riftbound deck builder',
            'Riftbound card market details',
          ],
        }}
      />
      <StructuredData
        data={{
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          '@id': `${url}#catalogue`,
          name: 'Riftbound Card Database and Collection Tracker',
          url,
          description: RIFTBOUND_CATALOGUE_DESCRIPTION,
          isPartOf: getSiteReference(),
          about: {
            '@type': 'Thing',
            name: 'Riftbound trading card game',
          },
          mainEntity: {
            '@type': 'ItemList',
            name: 'Riftbound card catalogue',
            numberOfItems: RIFTBOUND_CARDS.length,
            itemListOrder: 'https://schema.org/ItemListOrderAscending',
            itemListElement,
          },
        }}
      />
    </>
  );
}

export function RiftboundCommunityStructuredData() {
  const url = getAbsoluteSiteUrl(RIFTBOUND_COMMUNITY_PATH);
  if (!siteUrl || !url) return null;

  return (
    <StructuredData
      data={{
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        '@id': `${url}#community`,
        name: 'Riftbound Community: Deck Builds and Collections',
        url,
        description: 'Explore Riftbound deck builds, collections, questions, and community discussion on KnowLeague.',
        isPartOf: getSiteReference(),
        about: {
          '@type': 'Thing',
          name: 'Riftbound trading card game community',
        },
        publisher: {
          '@type': 'Organization',
          name: SITE_NAME,
        },
      }}
    />
  );
}
