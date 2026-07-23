import type { Metadata } from 'next';
import { ResetPasswordScreen } from '@/components/reset-password-screen';
import { createNoIndexMetadata } from '@/lib/seo';

export const metadata: Metadata = createNoIndexMetadata('Reset your KnowLeague password');

export default function ResetPasswordPage() {
  return <ResetPasswordScreen />;
}
