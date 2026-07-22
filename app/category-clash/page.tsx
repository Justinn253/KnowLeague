import type { Metadata } from 'next';
import { GameStructuredData } from '@/components/seo-structured-data';
import { CategoryClash } from '@/components/category-clash';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'Category Clash League Multiplayer Trivia',
  description: 'Name unique League of Legends answers from rotating categories and survive each round.',
  path: '/category-clash',
});

export default function CategoryClashPage() {
  return (
    <>
      <GameStructuredData name="Category Clash" path="/category-clash" />
      <CategoryClash />
    </>
  );
}
