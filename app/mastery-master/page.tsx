import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MasteryMaster } from '@/components/mastery-master';
import { GameStructuredData } from '@/components/seo-structured-data';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'Mastery Master League Champion Mastery Quiz',
  description: 'Put a League of Legends account’s champion mastery knowledge to the test.',
  path: '/mastery-master',
});

export default function MasteryMasterPage() {
  return (
    <>
      <GameStructuredData name="Mastery Master" path="/mastery-master" />
      <Suspense fallback={<div className="min-h-screen bg-slate-950" aria-hidden="true" />}><MasteryMaster /></Suspense>
    </>
  );
}
