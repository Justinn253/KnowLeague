import { NewsScreen } from '@/components/news-screen';
import { createPageMetadata } from '@/lib/seo';

export const metadata = createPageMetadata({ title: 'News and Updates Archive', description: 'Browse older KnowLeague release notes and news.', path: '/news/archive' });
export const dynamic = 'force-dynamic';

export default function NewsArchivePage() {
  return <NewsScreen archive />;
}
