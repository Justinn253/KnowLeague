import type { Metadata } from 'next';
import { DiscordLevelingSettings } from '@/components/discord-leveling-settings';
import { createNoIndexMetadata } from '@/lib/seo';

export const metadata: Metadata = createNoIndexMetadata('Discord Configuration');

export default function DiscordLevelingSettingsPage() {
  return <DiscordLevelingSettings />;
}
