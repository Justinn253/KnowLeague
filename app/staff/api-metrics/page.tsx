import type { Metadata } from 'next';
import { StaffApiMetricsScreen } from '@/components/staff-api-metrics-screen';
import { createNoIndexMetadata } from '@/lib/seo';

export const metadata: Metadata = createNoIndexMetadata('Internal API Metrics');

export default function StaffApiMetricsPage() {
  return <StaffApiMetricsScreen />;
}
