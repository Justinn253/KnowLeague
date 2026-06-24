import type { Metadata } from 'next';
import { GlobalActions } from '@/components/global-actions';
import './globals.css';

export const metadata: Metadata = {
  title: 'KnowLeague',
  description: 'League of Legends quiz games and daily knowledge challenges',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <GlobalActions />
      </body>
    </html>
  );
}
