import { NewsScreen } from '@/components/news-screen';
import { createPageMetadata } from '@/lib/seo';

export const metadata = createPageMetadata({ title: 'News and Updates', description: 'The latest KnowLeague release notes and community news.', path: '/news' });
export const dynamic = 'force-dynamic';

export default function NewsPage() {
  return <NewsScreen />;
}
