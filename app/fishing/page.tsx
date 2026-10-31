import { permanentRedirect } from 'next/navigation';

export default function LegacyFishingPage() {
  permanentRedirect('/games/fishing');
}
