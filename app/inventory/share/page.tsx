import type { Metadata } from 'next';
import { permanentRedirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Shared Riftbound Collection',
};

export default function SharedRiftboundCollectionPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const query = new URLSearchParams();
  Object.entries(searchParams).forEach(([key, value]) => {
    if (Array.isArray(value)) value.forEach((entry) => query.append(key, entry));
    else if (value !== undefined) query.set(key, value);
  });
  permanentRedirect(`/riftbound/inventory/share${query.toString() ? `?${query.toString()}` : ''}`);
}
