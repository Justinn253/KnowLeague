import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'KnowLeague',
  description: 'League of Legends quiz games and daily knowledge challenges',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
