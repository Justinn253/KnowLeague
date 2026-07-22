import type { Metadata } from 'next';
import { AuthScreen } from '@/components/auth-screen';
import { createNoIndexMetadata } from '@/lib/seo';

export const metadata: Metadata = createNoIndexMetadata('Log in to KnowLeague');

export default function LoginPage() {
  return <AuthScreen />;
}
