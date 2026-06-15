import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'League Quiz Hub',
  description: 'Fast League of Legends quiz games with Next.js, Tailwind, and Supabase',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
