import { Suspense } from 'react';
import { MasteryMaster } from '@/components/mastery-master';

export default function MasteryMasterPage() {
  return <Suspense fallback={<div className="min-h-screen bg-slate-950" aria-hidden="true" />}><MasteryMaster /></Suspense>;
}
