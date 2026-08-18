import type { Metadata } from 'next';
import { GlobalActions } from '@/components/global-actions';
import { SiteStructuredData } from '@/components/seo-structured-data';
import { SiteFooter } from '@/components/site-footer';
import { DEFAULT_DESCRIPTION, DEFAULT_SITE_TITLE, getAbsoluteSiteUrl, SITE_NAME, SOCIAL_IMAGE_PATH, siteUrl } from '@/lib/seo';
import './globals.css';
import Script from 'next/script';

const socialImageUrl = getAbsoluteSiteUrl(SOCIAL_IMAGE_PATH);

export const metadata: Metadata = {
  metadataBase: siteUrl ?? undefined,
  title: {
    default: DEFAULT_SITE_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
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
        <Script 
          id="adsense-verification"
          async 
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7559752825656959" 
          crossOrigin="anonymous"
          strategy="beforeInteractive"
        />
      </head>

      <body className="flex min-h-screen flex-col">
        <GlobalActions>
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </GlobalActions>
        <SiteStructuredData />
        <SiteFooter />
      </body>

    </html>
  );
}
