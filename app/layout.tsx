import type { Metadata } from 'next';
import Script from 'next/script';
import { GlobalActions } from '@/components/global-actions';
import { SiteStructuredData } from '@/components/seo-structured-data';
import { SiteFooter } from '@/components/site-footer';
import { DEFAULT_DESCRIPTION, DEFAULT_SITE_TITLE, getAbsoluteSiteUrl, SITE_NAME, SOCIAL_IMAGE_PATH, siteUrl } from '@/lib/seo';
import './globals.css';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';

const socialImageUrl = getAbsoluteSiteUrl(SOCIAL_IMAGE_PATH);
const ADSENSE_CLIENT_ID = 'ca-pub-7559752825656959';
const adsenseEnabled = process.env.ADSENSE_ENABLED === 'true';

export const metadata: Metadata = {
  metadataBase: siteUrl ?? undefined,
  title: {
    default: DEFAULT_SITE_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  ...(adsenseEnabled ? { other: { 'google-adsense-account': ADSENSE_CLIENT_ID } } : {}),
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    title: DEFAULT_SITE_TITLE,
    description: DEFAULT_DESCRIPTION,
    ...(siteUrl ? { url: siteUrl.toString() } : {}),
    ...(socialImageUrl
      ? { images: [{ url: socialImageUrl, alt: 'Howling Abyss landscape from League of Legends' }] }
      : {}),
  },
  twitter: {
    card: 'summary_large_image',
    title: DEFAULT_SITE_TITLE,
    description: DEFAULT_DESCRIPTION,
    ...(socialImageUrl ? { images: [socialImageUrl] } : {}),
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {adsenseEnabled ? (
          <Script
            id="google-adsense"
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT_ID}`}
            crossOrigin="anonymous"
            strategy="beforeInteractive"
          />
        ) : null}
      </head>
      <body className="flex min-h-screen flex-col">
        <GlobalActions>
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </GlobalActions>
        <SiteStructuredData />
        <Analytics />
        <SpeedInsights />
        <SiteFooter adsenseEnabled={adsenseEnabled} />
      </body>

    </html>
  );
}
